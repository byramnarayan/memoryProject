import logging
from datetime import UTC, datetime
from typing import Annotated, Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

import models
from auth import CurrentUser
from database import get_db
from services.log_enrichment_service import (
    create_canonical_memory_from_log,
    enrich_employee_log,
    sync_log_to_neo4j,
)

logger = logging.getLogger("uvicorn")
router = APIRouter()


class CreateLogRequest(BaseModel):
    title: str = Field(..., min_length=3, max_length=255)
    decision_summary: str = Field(..., min_length=5)
    trade_offs_considered: Optional[str] = None
    incident_or_ticket_ref: Optional[str] = None
    impacted_system_or_cell: Optional[str] = None
    intuition_notes: Optional[str] = None
    decision_category: str = Field(default="Workaround")
    urgency_level: str = Field(default="Medium")


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_employee_log(
    req: CreateLogRequest,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """
    Log an employee's daily decision, workaround, or incident post-mortem.
    Performs AI enrichment, Neo4j graph linking, and canonical memory extraction.
    """
    # 1. AI Enrichment (Groq LLM rotation with heuristic fallback)
    enrichment = enrich_employee_log(
        title=req.title,
        decision_summary=req.decision_summary,
        trade_offs=req.trade_offs_considered,
        incident_ref=req.incident_or_ticket_ref,
        impacted_system=req.impacted_system_or_cell,
        intuition_notes=req.intuition_notes,
    )

    # Allow user override if provided, else use AI detected category/urgency
    final_category = req.decision_category or enrichment.get("decision_category", "Workaround")
    final_urgency = req.urgency_level or enrichment.get("urgency_level", "Medium")

    # 2. Persist EmployeeDailyLog in PostgreSQL
    new_log = models.EmployeeDailyLog(
        tenant_id=current_user.tenant_id,
        user_id=current_user.id,
        title=req.title,
        decision_summary=req.decision_summary,
        trade_offs_considered=req.trade_offs_considered,
        incident_or_ticket_ref=req.incident_or_ticket_ref,
        impacted_system_or_cell=req.impacted_system_or_cell,
        intuition_notes=req.intuition_notes,
        decision_category=final_category,
        urgency_level=final_urgency,
    )
    new_log.set_impacted_kpis(enrichment.get("impacted_kpis", []))
    new_log.set_ai_enrichment(enrichment)

    db.add(new_log)
    await db.flush()  # Generates new_log.id

    # 3. Create Canonical Enterprise Memory Object
    await create_canonical_memory_from_log(
        log=new_log,
        enrichment=enrichment,
        author=current_user,
        db=db,
    )

    # 4. Write Immutable Audit Log
    audit = models.AuditLog(
        tenant_id=current_user.tenant_id,
        user_id=current_user.id,
        username=current_user.username,
        user_role=current_user.role,
        department=current_user.department,
        clearance_level=current_user.clearance_level,
        action="EMPLOYEE_DECISION_LOGGED",
        resource_type="EmployeeDailyLog",
        sensitivity_level="Internal",
        ip_address="127.0.0.1",
    )
    audit.set_details({
        "log_id": new_log.id,
        "title": new_log.title,
        "category": new_log.decision_category,
        "impacted_cell": new_log.impacted_system_or_cell,
    })
    db.add(audit)

    await db.commit()
    await db.refresh(new_log)

    # 5. Asynchronous Graph Linking to Neo4j
    neo_res = sync_log_to_neo4j(
        log=new_log,
        enrichment=enrichment,
        author=current_user,
    )

    return {
        "success": True,
        "message": f"Operational decision '{new_log.title}' logged & enriched.",
        "log": {
            "id": new_log.id,
            "title": new_log.title,
            "decision_summary": new_log.decision_summary,
            "trade_offs_considered": new_log.trade_offs_considered,
            "incident_or_ticket_ref": new_log.incident_or_ticket_ref,
            "impacted_system_or_cell": new_log.impacted_system_or_cell,
            "intuition_notes": new_log.intuition_notes,
            "decision_category": new_log.decision_category,
            "urgency_level": new_log.urgency_level,
            "log_date": new_log.log_date.isoformat(),
            "impacted_kpis": new_log.get_impacted_kpis(),
            "ai_enrichment": new_log.get_ai_enrichment(),
            "canonical_memory_id": new_log.canonical_memory_id,
            "author": {
                "id": current_user.id,
                "name": f"{current_user.first_name or ''} {current_user.last_name or ''}".strip() or current_user.username,
                "employee_number": current_user.employee_number,
                "department": current_user.department,
                "job_title": current_user.job_title,
            },
        },
        "neo4j_sync": neo_res,
    }


@router.get("")
async def list_employee_logs(
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
    category: Annotated[Optional[str], Query()] = None,
    department: Annotated[Optional[str], Query()] = None,
    search: Annotated[Optional[str], Query()] = None,
    my_logs_only: Annotated[bool, Query()] = False,
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
):
    """
    List operational decisions & post-mortems filtered by tenant, category, or search term.
    """
    stmt = (
        select(models.EmployeeDailyLog, models.User)
        .join(models.User, models.EmployeeDailyLog.user_id == models.User.id)
        .where(models.EmployeeDailyLog.tenant_id == current_user.tenant_id)
    )

    if my_logs_only:
        stmt = stmt.where(models.EmployeeDailyLog.user_id == current_user.id)

    if category:
        stmt = stmt.where(models.EmployeeDailyLog.decision_category == category)

    if department:
        stmt = stmt.where(models.User.department == department)

    if search:
        pattern = f"%{search.lower()}%"
        stmt = stmt.where(
            or_(
                func.lower(models.EmployeeDailyLog.title).like(pattern),
                func.lower(models.EmployeeDailyLog.decision_summary).like(pattern),
                func.lower(models.EmployeeDailyLog.intuition_notes).like(pattern),
                func.lower(models.EmployeeDailyLog.impacted_system_or_cell).like(pattern),
            )
        )

    stmt = stmt.order_by(models.EmployeeDailyLog.log_date.desc()).offset(offset).limit(limit)

    results = await db.execute(stmt)
    rows = results.all()

    items = []
    for log, author in rows:
        items.append({
            "id": log.id,
            "title": log.title,
            "decision_summary": log.decision_summary,
            "trade_offs_considered": log.trade_offs_considered,
            "incident_or_ticket_ref": log.incident_or_ticket_ref,
            "impacted_system_or_cell": log.impacted_system_or_cell,
            "intuition_notes": log.intuition_notes,
            "decision_category": log.decision_category,
            "urgency_level": log.urgency_level,
            "log_date": log.log_date.isoformat(),
            "impacted_kpis": log.get_impacted_kpis(),
            "canonical_memory_id": log.canonical_memory_id,
            "ai_enrichment": log.get_ai_enrichment(),
            "author": {
                "id": author.id,
                "name": f"{author.first_name or ''} {author.last_name or ''}".strip() or author.username,
                "employee_number": author.employee_number,
                "department": author.department,
                "job_title": author.job_title or author.role,
            },
        })

    return items


@router.get("/stats/summary")
async def get_logs_summary(
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """
    Get aggregated telemetry metrics for the Decision & Intuition Capture Hub.
    """
    base_filter = models.EmployeeDailyLog.tenant_id == current_user.tenant_id

    # Total count
    total_res = await db.execute(
        select(func.count(models.EmployeeDailyLog.id)).where(base_filter)
    )
    total_count = total_res.scalar() or 0

    # Category breakdown
    cat_res = await db.execute(
        select(models.EmployeeDailyLog.decision_category, func.count(models.EmployeeDailyLog.id))
        .where(base_filter)
        .group_by(models.EmployeeDailyLog.decision_category)
    )
    categories = {cat: count for cat, count in cat_res.all()}

    # Active contributors count
    contrib_res = await db.execute(
        select(func.count(func.distinct(models.EmployeeDailyLog.user_id))).where(base_filter)
    )
    active_contributors = contrib_res.scalar() or 0

    # Recent impacted cells
    cells_res = await db.execute(
        select(models.EmployeeDailyLog.impacted_system_or_cell, func.count(models.EmployeeDailyLog.id))
        .where(base_filter, models.EmployeeDailyLog.impacted_system_or_cell.is_not(None))
        .group_by(models.EmployeeDailyLog.impacted_system_or_cell)
        .order_by(func.count(models.EmployeeDailyLog.id).desc())
        .limit(5)
    )
    top_systems = [{"name": name, "count": count} for name, count in cells_res.all() if name]

    return {
        "total_decisions": total_count,
        "active_contributors": active_contributors,
        "category_breakdown": categories,
        "top_impacted_systems": top_systems,
    }


@router.get("/{log_id}")
async def get_log_detail(
    log_id: int,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """
    Retrieve single log record with complete AI insights and author profile.
    """
    stmt = (
        select(models.EmployeeDailyLog, models.User)
        .join(models.User, models.EmployeeDailyLog.user_id == models.User.id)
        .where(
            models.EmployeeDailyLog.id == log_id,
            models.EmployeeDailyLog.tenant_id == current_user.tenant_id,
        )
    )
    res = await db.execute(stmt)
    row = res.first()
    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Log with ID {log_id} not found in current company workspace.",
        )

    log, author = row
    return {
        "id": log.id,
        "title": log.title,
        "decision_summary": log.decision_summary,
        "trade_offs_considered": log.trade_offs_considered,
        "incident_or_ticket_ref": log.incident_or_ticket_ref,
        "impacted_system_or_cell": log.impacted_system_or_cell,
        "intuition_notes": log.intuition_notes,
        "decision_category": log.decision_category,
        "urgency_level": log.urgency_level,
        "log_date": log.log_date.isoformat(),
        "impacted_kpis": log.get_impacted_kpis(),
        "canonical_memory_id": log.canonical_memory_id,
        "ai_enrichment": log.get_ai_enrichment(),
        "author": {
            "id": author.id,
            "name": f"{author.first_name or ''} {author.last_name or ''}".strip() or author.username,
            "employee_number": author.employee_number,
            "department": author.department,
            "job_title": author.job_title or author.role,
        },
    }
