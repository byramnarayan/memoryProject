import json
import logging
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, status, Response
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_

from database import get_db
from graph.models_gacm import CaptureJob, ResearchMemoryObject
from services.capture_service import process_document_capture

logger = logging.getLogger("capture_router")

router = APIRouter()

DEFAULT_TENANT_ID = "utc_campus"
DEFAULT_USER_ID = 1

class CaptureJSONRequest(BaseModel):
    title: str = Field(..., description="Project or meeting title")
    content: str = Field(..., description="Abstract or full document body")
    department: str = Field("Research Division", description="Academic department or college")
    memory_type: str = Field("GrantAward", description="GrantAward, ResearchProposal, MeetingMinutes, IRBProtocol, LabIncident")
    sensitivity_level: str = Field("Public", description="Public, Internal, Restricted, Confidential, HighlyConfidential")
    external_id: Optional[str] = Field(None, description="External reference ID (e.g. Cayuse, Banner, NSF Grant ID)")
    entities: Optional[dict] = Field(default_factory=dict, description="Pre-extracted entities")

@router.post("/upload", status_code=status.HTTP_202_ACCEPTED)
async def upload_document_file(
    response: Response,
    file: UploadFile = File(...),
    department: str = Form("Computer Science & Engineering"),
    memory_type: str = Form("GrantAward"),
    sensitivity_level: str = Form("Public"),
    db: AsyncSession = Depends(get_db)
):
    """
    MEMORY CAPTURE INGESTION ENDPOINT:
    - Accepts PDF, DOCX, TXT, CSV, or JSON documents.
    - Performs SHA-256 duplicate validation (CAP-1005).
    - Extracts structured text, sections, and page counts.
    - Asynchronously builds Canonical ResearchMemoryObject.
    - Acknowledges within the 2-second ingestion SLO.
    """
    file_bytes = await file.read()
    if not file_bytes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="CAP-1003: Empty file uploaded."
        )

    res = await process_document_capture(
        session=db,
        file_name=file.filename or "uploaded_document",
        file_bytes=file_bytes,
        department=department,
        memory_type=memory_type,
        sensitivity_level=sensitivity_level,
        tenant_id=DEFAULT_TENANT_ID,
        user_id=DEFAULT_USER_ID
    )

    if res.get("status") == "duplicate_blocked":
        response.status_code = status.HTTP_409_CONFLICT
        return res

    if res.get("status") == "failed":
        response.status_code = status.HTTP_422_UNPROCESSABLE_ENTITY
        return res

    response.status_code = status.HTTP_202_ACCEPTED
    return res

@router.post("/json", status_code=status.HTTP_201_CREATED)
async def ingest_json_memory(
    payload: CaptureJSONRequest,
    db: AsyncSession = Depends(get_db)
):
    """Direct programmatic JSON ingestion for external university grant systems (e.g. Cayuse / Banner)."""
    file_bytes = json.dumps({
        "title": payload.title,
        "abstract": payload.content,
        "external_id": payload.external_id,
        "entities": payload.entities
    }).encode("utf-8")

    res = await process_document_capture(
        session=db,
        file_name=f"api_{payload.external_id or 'record'}.json",
        file_bytes=file_bytes,
        department=payload.department,
        memory_type=payload.memory_type,
        sensitivity_level=payload.sensitivity_level,
        tenant_id=DEFAULT_TENANT_ID,
        user_id=DEFAULT_USER_ID
    )

    if res.get("status") == "duplicate_blocked":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=res.get("message")
        )

    return res

@router.get("/queue")
async def get_capture_queue(
    skip: int = 0,
    limit: int = 25,
    status_filter: str = "",
    db: AsyncSession = Depends(get_db)
):
    """Fetches paginated ingestion jobs for the Capture Dashboard & Queue Table."""
    try:
        count_stmt = select(func.count(CaptureJob.id)).where(CaptureJob.tenant_id == DEFAULT_TENANT_ID)
        stmt = select(CaptureJob).where(CaptureJob.tenant_id == DEFAULT_TENANT_ID)

        if status_filter.strip():
            count_stmt = count_stmt.where(CaptureJob.status == status_filter.strip())
            stmt = stmt.where(CaptureJob.status == status_filter.strip())

        total_res = await db.execute(count_stmt)
        total = total_res.scalar() or 0

        stmt = stmt.order_by(CaptureJob.id.desc()).offset(skip).limit(limit)
        res = await db.execute(stmt)
        jobs = res.scalars().all()

        items = [
            {
                "id": j.id,
                "capture_id": j.capture_id,
                "file_name": j.file_name,
                "file_size_bytes": j.file_size_bytes,
                "file_type": j.file_type,
                "source_system": j.source_system,
                "memory_type": j.memory_type_hint,
                "department": j.department,
                "sensitivity_level": j.sensitivity_level,
                "status": j.status,
                "error_code": j.error_code,
                "error_message": j.error_message,
                "extracted_title": j.extracted_title,
                "page_count": j.page_count,
                "resulting_memory_id": j.resulting_memory_id,
                "created_at": j.created_at.isoformat() if j.created_at else None,
                "completed_at": j.completed_at.isoformat() if j.completed_at else None
            }
            for j in jobs
        ]

        return {"total": total, "skip": skip, "limit": limit, "items": items}
    except Exception as e:
        logger.error(f"Error fetching capture queue: {e}")
        return {"total": 0, "skip": skip, "limit": limit, "items": []}

@router.get("/memory/{memory_id}")
async def get_canonical_memory_details(memory_id: str, db: AsyncSession = Depends(get_db)):
    """Fetches full AI-enriched canonical memory record by memory_id."""
    stmt = select(ResearchMemoryObject).where(
        ResearchMemoryObject.memory_id == memory_id,
        ResearchMemoryObject.tenant_id == DEFAULT_TENANT_ID
    )
    res = await db.execute(stmt)
    mem = res.scalar_one_or_none()

    if not mem:
        raise HTTPException(status_code=404, detail="Research memory object not found.")

    return {
        "memory_id": mem.memory_id,
        "title": mem.title,
        "memory_type": mem.memory_type,
        "category": mem.category,
        "department": mem.get_entities().get("department", "Research Division"),
        "sensitivity_level": mem.sensitivity_level,
        "lifecycle_stage": mem.lifecycle_stage,
        "confidence_score": mem.confidence_score,
        "needs_review": mem.needs_review,
        "review_status": mem.review_status,
        "entities": mem.get_entities(),
        "derived_summaries": mem.get_derived_summaries(),
        "tags": mem.get_tags(),
        "created_at": mem.created_at.isoformat() if mem.created_at else None,
        "updated_at": mem.updated_at.isoformat() if mem.updated_at else None
    }

@router.post("/enrich/{memory_id}")
async def trigger_ai_enrichment(memory_id: str, db: AsyncSession = Depends(get_db)):
    """Triggers or re-runs AI extraction & multi-tier summarization for a memory object."""
    from services.processing_service import enrich_memory_object_in_db
    enrichment = await enrich_memory_object_in_db(session=db, memory_id=memory_id)
    if not enrichment:
        raise HTTPException(status_code=404, detail=f"Memory object {memory_id} not found.")
    return {
        "status": "enriched",
        "memory_id": memory_id,
        "enrichment": enrichment
    }

@router.post("/sync-graph/{memory_id}")
async def trigger_graph_vector_sync(memory_id: str, db: AsyncSession = Depends(get_db)):
    """Triggers or re-synchronizes Neo4j Aura Graph nodes and 384d Vector Store for a memory object."""
    from services.graph_sync_service import sync_memory_e2e
    sync_result = await sync_memory_e2e(session=db, memory_id=memory_id)
    if sync_result.get("status") == "error":
        raise HTTPException(status_code=404, detail=sync_result.get("message"))
    return sync_result

@router.get("/{capture_id}")
async def get_capture_details(capture_id: str, db: AsyncSession = Depends(get_db)):
    """Fetches full parsing results, section tree, and AI enrichment for an individual capture job."""
    stmt = select(CaptureJob).where(
        CaptureJob.capture_id == capture_id,
        CaptureJob.tenant_id == DEFAULT_TENANT_ID
    )
    res = await db.execute(stmt)
    job = res.scalar_one_or_none()

    if not job:
        raise HTTPException(status_code=404, detail="Capture job not found.")

    # Check if resulting memory exists and pull its AI enrichment
    memory_info = None
    if job.resulting_memory_id:
        mem_stmt = select(ResearchMemoryObject).where(
            ResearchMemoryObject.memory_id == job.resulting_memory_id
        )
        mem_res = await db.execute(mem_stmt)
        mem = mem_res.scalar_one_or_none()
        if mem:
            memory_info = {
                "memory_id": mem.memory_id,
                "confidence_score": mem.confidence_score,
                "needs_review": mem.needs_review,
                "review_status": mem.review_status,
                "entities": mem.get_entities(),
                "derived_summaries": mem.get_derived_summaries(),
                "tags": mem.get_tags()
            }

    return {
        "capture_id": job.capture_id,
        "file_name": job.file_name,
        "status": job.status,
        "error_code": job.error_code,
        "error_message": job.error_message,
        "extracted_title": job.extracted_title,
        "page_count": job.page_count,
        "sections": job.get_sections(),
        "preview_text": job.raw_text,
        "resulting_memory_id": job.resulting_memory_id,
        "memory_details": memory_info,
        "created_at": job.created_at.isoformat() if job.created_at else None
    }
