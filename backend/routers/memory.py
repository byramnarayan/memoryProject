import json
import math
import logging
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Query, status, Request
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_, and_, update, delete

from database import get_db
import models
from graph.models_gacm import ResearchMemoryObject, DocumentEmbedding
from graph.memgraph_db import execute_cypher
from services.graph_sync_service import sync_memory_e2e
from services.processing_service import enrich_research_memory
from services.access_control import (
    get_optional_current_user,
    can_user_access_memory,
    can_user_curate_memory,
    log_audit_event,
    get_authorized_sensitivities
)

logger = logging.getLogger("memory_router")

router = APIRouter()

DEFAULT_TENANT_ID = "utc_campus"

# ---------------------------------------------------------------------------
# Request & Response Schemas
# ---------------------------------------------------------------------------

class CurateMemoryRequest(BaseModel):
    title: Optional[str] = Field(None, description="Curated project or document title")
    memory_type: Optional[str] = Field(None, description="GrantAward, ResearchProposal, MeetingMinutes, IRBProtocol, LabIncident")
    department: Optional[str] = Field(None, description="Academic department or college")
    sensitivity_level: Optional[str] = Field(None, description="Public, Internal, Restricted, Confidential, HighlyConfidential")
    entities: Optional[Dict[str, Any]] = Field(None, description="Curated entities: pi_name, co_pi_names, sponsor_agency, award_amount, etc.")
    derived_summaries: Optional[Dict[str, str]] = Field(None, description="Curated summaries: short_summary, detailed_summary, compliance_summary")
    tags: Optional[List[str]] = Field(None, description="Domain categorization tags")
    approve_immediately: bool = Field(False, description="Whether to approve and clear review flag upon saving")

# ---------------------------------------------------------------------------
# Helper: Serialize Memory Record
# ---------------------------------------------------------------------------

def serialize_memory(mem: ResearchMemoryObject) -> Dict[str, Any]:
    entities = mem.get_entities()
    summaries = mem.get_derived_summaries()
    relations = mem.get_relations()
    tags = mem.get_tags()
    source_ref = mem.get_source_ref()
    review_reasons = entities.get("review_reasons", [])

    return {
        "id": mem.id,
        "memory_id": mem.memory_id,
        "tenant_id": mem.tenant_id,
        "domain": mem.domain,
        "category": mem.category,
        "memory_type": mem.memory_type,
        "severity": mem.severity,
        "sensitivity_level": mem.sensitivity_level,
        "lifecycle_stage": mem.lifecycle_stage,
        "tier": mem.tier,
        "title": mem.title,
        "raw_text": mem.raw_text,
        "source_system": mem.source_system,
        "source_ref": source_ref,
        "entities": entities,
        "derived_summaries": summaries,
        "relations": relations,
        "tags": tags,
        "confidence_score": round(mem.confidence_score, 1),
        "needs_review": mem.needs_review,
        "review_status": mem.review_status,
        "review_reasons": review_reasons,
        "is_on_legal_hold": mem.is_on_legal_hold,
        "created_at": mem.created_at.isoformat() if mem.created_at else None,
        "updated_at": mem.updated_at.isoformat() if mem.updated_at else None
    }

async def find_memory_by_id_or_code(identifier: str, session: AsyncSession) -> Optional[ResearchMemoryObject]:
    """Finds ResearchMemoryObject by integer primary key or string memory_id."""
    if identifier.isdigit():
        res = await session.execute(
            select(ResearchMemoryObject).where(
                or_(
                    ResearchMemoryObject.id == int(identifier),
                    ResearchMemoryObject.memory_id == identifier
                )
            )
        )
    else:
        res = await session.execute(
            select(ResearchMemoryObject).where(ResearchMemoryObject.memory_id == identifier)
        )
    return res.scalars().first()

# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("/review-queue", status_code=status.HTTP_200_OK)
async def get_review_queue(
    page: int = Query(1, ge=1, description="Page number"),
    limit: int = Query(20, ge=1, le=100, description="Items per page"),
    review_state: str = Query("pending", description="Filter: pending, approved, rejected, all"),
    department: Optional[str] = Query(None, description="Filter by department"),
    memory_type: Optional[str] = Query(None, description="Filter by memory type"),
    search: Optional[str] = Query(None, description="Keyword search in title or text"),
    tenant_id: str = Query(DEFAULT_TENANT_ID, description="University tenant identifier"),
    current_user: Optional[models.User] = Depends(get_optional_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Returns paginated memories in the curation review queue with aggregate health stats.
    Allows institutional Memory Analysts to quickly identify records requiring human verification.
    Enforces user sensitivity clearance ladder & departmental scoping.
    """
    # Sanitize inputs for direct python calls or FastAPI query injections
    page = page if isinstance(page, int) and page >= 1 else 1
    limit = limit if isinstance(limit, int) and 1 <= limit <= 100 else 20
    review_state = review_state if isinstance(review_state, str) else "pending"
    tenant_id = tenant_id if isinstance(tenant_id, str) else DEFAULT_TENANT_ID

    conditions = [ResearchMemoryObject.tenant_id == tenant_id]

    # Clearance & Department Scoping (Session 07)
    if current_user:
        allowed_sensitivities = get_authorized_sensitivities(current_user.clearance_level)
        conditions.append(ResearchMemoryObject.sensitivity_level.in_(allowed_sensitivities))
        if current_user.role == "DeptAdmin":
            conditions.append(or_(
                ResearchMemoryObject.entities_json.like(f"%{current_user.department}%"),
                ResearchMemoryObject.entities_json.like("%Research Division%")
            ))

    if review_state == "pending":
        conditions.append(or_(
            ResearchMemoryObject.needs_review == True,
            ResearchMemoryObject.review_status == "pending_review"
        ))
    elif review_state == "approved":
        conditions.append(and_(
            ResearchMemoryObject.review_status == "approved",
            ResearchMemoryObject.needs_review == False
        ))
    elif review_state == "rejected":
        conditions.append(ResearchMemoryObject.review_status == "rejected")
    # 'all' has no status restriction

    if isinstance(memory_type, str) and memory_type and memory_type != "All":
        conditions.append(ResearchMemoryObject.memory_type == memory_type)

    if isinstance(department, str) and department and department != "All":
        conditions.append(ResearchMemoryObject.entities_json.like(f"%{department}%"))

    if isinstance(search, str) and search.strip():
        search_pattern = f"%{search.strip()}%"
        conditions.append(or_(
            ResearchMemoryObject.title.ilike(search_pattern),
            ResearchMemoryObject.memory_id.ilike(search_pattern),
            ResearchMemoryObject.entities_json.ilike(search_pattern)
        ))

    # Base query
    base_stmt = select(ResearchMemoryObject).where(and_(*conditions))

    # Total matching records count
    count_stmt = select(func.count(ResearchMemoryObject.id)).where(and_(*conditions))
    total_res = await db.execute(count_stmt)
    total_count = total_res.scalar() or 0

    # Paginated records
    offset = (page - 1) * limit
    paged_stmt = base_stmt.order_by(
        ResearchMemoryObject.needs_review.desc(),
        ResearchMemoryObject.confidence_score.asc(),
        ResearchMemoryObject.created_at.desc()
    ).offset(offset).limit(limit)

    records_res = await db.execute(paged_stmt)
    memories = records_res.scalars().all()

    # Aggregate queue statistics for the tenant
    stats_pending = (await db.execute(
        select(func.count(ResearchMemoryObject.id)).where(
            and_(
                ResearchMemoryObject.tenant_id == tenant_id,
                or_(ResearchMemoryObject.needs_review == True, ResearchMemoryObject.review_status == "pending_review")
            )
        )
    )).scalar() or 0

    stats_approved = (await db.execute(
        select(func.count(ResearchMemoryObject.id)).where(
            and_(
                ResearchMemoryObject.tenant_id == tenant_id,
                ResearchMemoryObject.review_status == "approved",
                ResearchMemoryObject.needs_review == False
            )
        )
    )).scalar() or 0

    stats_rejected = (await db.execute(
        select(func.count(ResearchMemoryObject.id)).where(
            and_(
                ResearchMemoryObject.tenant_id == tenant_id,
                ResearchMemoryObject.review_status == "rejected"
            )
        )
    )).scalar() or 0

    avg_conf = (await db.execute(
        select(func.avg(ResearchMemoryObject.confidence_score)).where(
            ResearchMemoryObject.tenant_id == tenant_id
        )
    )).scalar() or 0.0

    return {
        "items": [serialize_memory(m) for m in memories],
        "pagination": {
            "total": total_count,
            "page": page,
            "limit": limit,
            "total_pages": math.ceil(total_count / limit) if total_count > 0 else 1
        },
        "stats": {
            "pending_count": stats_pending,
            "approved_count": stats_approved,
            "rejected_count": stats_rejected,
            "average_confidence": round(float(avg_conf), 1)
        }
    }

@router.get("/{memory_id}", status_code=status.HTTP_200_OK)
async def get_memory_detail(
    memory_id: str,
    current_user: Optional[models.User] = Depends(get_optional_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Returns complete memory object with raw text, extracted entities, and review warnings.
    Enforces 5-tier clearance ACLs and logs access in audit trail.
    """
    mem = await find_memory_by_id_or_code(memory_id, db)
    if not mem:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Memory record '{memory_id}' not found."
        )

    # Clearance & Access check
    ip = "127.0.0.1"
    if current_user and not can_user_access_memory(current_user, mem):
        await log_audit_event(
            session=db,
            user=current_user,
            action="CLEARANCE_DENIAL",
            memory_id=mem.memory_id,
            sensitivity_level=mem.sensitivity_level,
            details={"required_clearance": mem.sensitivity_level, "user_clearance": current_user.clearance_level},
            ip_address=ip
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Access denied: Document sensitivity '{mem.sensitivity_level}' exceeds your authorized clearance or department scope."
        )

    if current_user:
        await log_audit_event(
            session=db,
            user=current_user,
            action="VIEW_TEXT",
            memory_id=mem.memory_id,
            sensitivity_level=mem.sensitivity_level,
            ip_address=ip
        )

    return serialize_memory(mem)

@router.put("/{memory_id}/approve", status_code=status.HTTP_200_OK)
async def approve_memory(
    memory_id: str,
    current_user: Optional[models.User] = Depends(get_optional_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    APPROVE MEMORY ENDPOINT:
    - Sets needs_review = False and review_status = 'approved'.
    - Updates lifecycle_stage to 'Active'.
    - Synchronizes canonical nodes into Neo4j Aura knowledge graph.
    - Upserts dense vector embeddings for institutional retrieval.
    - Logs APPROVE event in immutable audit trail.
    """
    mem = await find_memory_by_id_or_code(memory_id, db)
    if not mem:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Memory record '{memory_id}' not found."
        )

    ip = "127.0.0.1"
    if current_user and not can_user_curate_memory(current_user, mem):
        await log_audit_event(
            session=db,
            user=current_user,
            action="CLEARANCE_DENIAL",
            memory_id=mem.memory_id,
            details={"attempted_action": "APPROVE", "user_role": current_user.role},
            ip_address=ip
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Curation denied: Role '{current_user.role}' cannot approve records for this department."
        )

    mem.needs_review = False
    mem.review_status = "approved"
    mem.lifecycle_stage = "Active"
    mem.updated_at = datetime.now(timezone.utc)

    # If confidence score was depressed due to flags, mark it approved high-confidence
    if mem.confidence_score < 85.0:
        mem.confidence_score = 95.0

    # Clean review reasons in entities payload
    entities = mem.get_entities()
    entities["review_reasons"] = []
    entities["curated_by"] = current_user.username if current_user else "Institutional Memory Analyst"
    entities["curated_at"] = datetime.now(timezone.utc).isoformat()
    mem.set_entities(entities)

    await db.commit()
    await db.refresh(mem)

    # Synchronize to Neo4j & Vector Store
    sync_res = await sync_memory_e2e(db, mem)

    # Log immutable audit event
    await log_audit_event(
        session=db,
        user=current_user,
        action="APPROVE",
        memory_id=mem.memory_id,
        sensitivity_level=mem.sensitivity_level,
        ip_address=ip
    )

    return {
        "status": "success",
        "message": f"Memory {mem.memory_id} successfully approved and indexed.",
        "memory": serialize_memory(mem),
        "graph_sync": sync_res
    }

@router.put("/{memory_id}/entities", status_code=status.HTTP_200_OK)
async def update_memory_entities(
    memory_id: str,
    payload: CurateMemoryRequest,
    current_user: Optional[models.User] = Depends(get_optional_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    CURATION WORKSPACE ENTITY UPDATE ENDPOINT:
    - Allows analysts to correct Principal Investigator names, award amounts, departments, and sponsors.
    - Immediately synchronizes changes to Neo4j knowledge graph relationships.
    - Optionally marks memory approved in a single curation transaction.
    - Enforces department curation authority and logs CURATE event to audit trail.
    """
    mem = await find_memory_by_id_or_code(memory_id, db)
    if not mem:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Memory record '{memory_id}' not found."
        )

    ip = "127.0.0.1"
    if current_user and not can_user_curate_memory(current_user, mem):
        await log_audit_event(
            session=db,
            user=current_user,
            action="CLEARANCE_DENIAL",
            memory_id=mem.memory_id,
            details={"attempted_action": "CURATE", "user_role": current_user.role},
            ip_address=ip
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Curation denied: Role '{current_user.role}' cannot curate records for this department."
        )

    if payload.title:
        mem.title = payload.title.strip()

    if payload.memory_type:
        mem.memory_type = payload.memory_type.strip()

    if payload.sensitivity_level:
        mem.sensitivity_level = payload.sensitivity_level.strip()

    # Update entities dictionary
    current_entities = mem.get_entities()
    if payload.entities:
        for k, v in payload.entities.items():
            current_entities[k] = v

    if payload.department:
        current_entities["department"] = payload.department.strip()

    # If analyst manually edited entities, clear unresolved entity warnings
    if "pi_name" in current_entities and current_entities["pi_name"]:
        reasons = current_entities.get("review_reasons", [])
        current_entities["review_reasons"] = [
            r for r in reasons if "Principal Investigator" not in r and "Zero or missing award" not in r
        ]

    current_entities["last_curated_at"] = datetime.now(timezone.utc).isoformat()
    mem.set_entities(current_entities)

    # Update summaries if provided
    if payload.derived_summaries:
        current_summaries = mem.get_derived_summaries()
        for k, v in payload.derived_summaries.items():
            current_summaries[k] = v
        mem.set_derived_summaries(current_summaries)

    if payload.tags is not None:
        mem.set_tags(payload.tags)

    # Approve immediately if requested
    if payload.approve_immediately:
        mem.needs_review = False
        mem.review_status = "approved"
        mem.lifecycle_stage = "Active"
        mem.confidence_score = max(mem.confidence_score, 95.0)

    mem.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(mem)

    # Re-sync Neo4j graph nodes and vector embeddings with curated entities
    sync_res = await sync_memory_e2e(db, mem)

    # Log CURATE audit event
    await log_audit_event(
        session=db,
        user=current_user,
        action="CURATE",
        memory_id=mem.memory_id,
        sensitivity_level=mem.sensitivity_level,
        details={"fields_updated": [k for k, v in payload.model_dump(exclude_unset=True).items() if v is not None]},
        ip_address=ip
    )

    return {
        "status": "success",
        "message": f"Memory {mem.memory_id} successfully curated and updated.",
        "memory": serialize_memory(mem),
        "graph_sync": sync_res
    }

@router.post("/{memory_id}/re-extract", status_code=status.HTTP_200_OK)
async def re_extract_memory(
    memory_id: str,
    db: AsyncSession = Depends(get_db)
):
    """
    Triggers fresh AI enrichment (NER, Multi-level Summarization & Quality Scoring)
    using rotated Groq LLM keys on the stored raw document text.
    """
    mem = await find_memory_by_id_or_code(memory_id, db)
    if not mem:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Memory record '{memory_id}' not found."
        )

    entities = mem.get_entities()
    dept_hint = entities.get("department") or "Research Division"

    enrichment = enrich_research_memory(
        text=mem.raw_text,
        title=mem.title,
        memory_type=mem.memory_type,
        department_hint=dept_hint,
        sensitivity_level=mem.sensitivity_level
    )

    mem.set_derived_summaries(enrichment["summaries"])
    mem.set_entities(enrichment["entities"])
    mem.set_tags(enrichment["tags"])
    mem.confidence_score = enrichment["overall_score"]
    mem.needs_review = enrichment["needs_review"]
    mem.review_status = enrichment["review_status"]
    mem.updated_at = datetime.now(timezone.utc)

    await db.commit()
    await db.refresh(mem)

    # Synchronize to Neo4j
    sync_res = await sync_memory_e2e(db, mem)

    return {
        "status": "success",
        "message": f"Memory {mem.memory_id} re-extracted via Groq AI engine.",
        "memory": serialize_memory(mem),
        "graph_sync": sync_res
    }

@router.delete("/{memory_id}", status_code=status.HTTP_200_OK)
async def delete_memory(
    memory_id: str,
    hard_delete: bool = Query(False, description="Set True to permanently purge record from database and graph"),
    current_user: Optional[models.User] = Depends(get_optional_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Soft-deletes (archives/rejects) or permanently purges a memory object.
    Blocks deletion if memory is marked is_on_legal_hold.
    Updates or detaches associated Neo4j graph nodes and logs to audit trail.
    """
    mem = await find_memory_by_id_or_code(memory_id, db)
    if not mem:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Memory record '{memory_id}' not found."
        )

    # Legal Hold Protection (Session 07)
    if mem.is_on_legal_hold:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"CAP-7001: Memory '{mem.memory_id}' is on an institutional Legal Hold and cannot be deleted or purged."
        )

    actual_memory_id = mem.memory_id
    is_hard = hard_delete is True
    ip = "127.0.0.1"
    if is_hard:
        # Purge from Neo4j
        try:
            execute_cypher(
                "MATCH (p:Project {id: $mem_id}) DETACH DELETE p",
                {"mem_id": actual_memory_id}
            )
        except Exception as ge:
            logger.warning(f"Could not purge Neo4j node for {actual_memory_id}: {ge}")

        # Purge DocumentEmbedding if exists
        await db.execute(
            delete(DocumentEmbedding).where(DocumentEmbedding.title == mem.title)
        )
        await db.delete(mem)
        # Log HARD_DELETE audit event
        await log_audit_event(
            session=db,
            user=current_user,
            action="HARD_DELETE",
            memory_id=actual_memory_id,
            sensitivity_level=mem.sensitivity_level,
            ip_address=ip
        )

        return {
            "status": "success",
            "message": f"Memory {actual_memory_id} permanently purged.",
            "action": "hard_delete"
        }
    else:
        # Soft-delete: mark rejected and archived
        mem.review_status = "rejected"
        mem.lifecycle_stage = "Archived"
        mem.needs_review = False
        mem.updated_at = datetime.now(timezone.utc)

        try:
            execute_cypher(
                "MATCH (p:Project {id: $mem_id}) SET p.status = 'Rejected', p.updated_at = datetime()",
                {"mem_id": actual_memory_id}
            )
        except Exception as ge:
            logger.warning(f"Could not update Neo4j status for {actual_memory_id}: {ge}")

        await db.commit()
        await db.refresh(mem)

        # Log REJECT audit event
        await log_audit_event(
            session=db,
            user=current_user,
            action="REJECT",
            memory_id=actual_memory_id,
            sensitivity_level=mem.sensitivity_level,
            ip_address=ip
        )

        return {
            "status": "success",
            "message": f"Memory {actual_memory_id} marked as rejected and archived.",
            "action": "soft_delete",
            "memory": serialize_memory(mem)
        }
