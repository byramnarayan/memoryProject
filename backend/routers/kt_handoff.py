import logging
from datetime import UTC, datetime
from typing import Annotated, Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

import models
from auth import CurrentUser
from database import get_db
from services.predecessor_copilot import query_predecessor_brain

logger = logging.getLogger("uvicorn")
router = APIRouter()


class CreateKTAssignmentRequest(BaseModel):
    title: str = Field(..., min_length=3, max_length=255)
    predecessor_id: int
    successor_id: int
    scope_description: Optional[str] = None
    systems_in_scope: List[str] = Field(default_factory=list)


class UpdateChecklistItemRequest(BaseModel):
    is_reviewed: bool
    notes: Optional[str] = None


class AskPredecessorRequest(BaseModel):
    predecessor_id: int
    query: str = Field(..., min_length=2)


@router.post("/assignments", status_code=status.HTTP_201_CREATED)
async def create_kt_assignment(
    req: CreateKTAssignmentRequest,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """
    Manager / HR creates a new Knowledge Transfer handoff pairing a predecessor with a successor.
    Automatically discovers and provisions checklist items from predecessor's past decisions.
    """
    if current_user.role not in ["TenantAdmin", "DeptAdmin", "SeniorEngineer"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only Managers, Team Leads, or Admins can assign Knowledge Transfer handoffs.",
        )

    # 1. Verify predecessor and successor exist in the same tenant
    users_res = await db.execute(
        select(models.User).where(
            models.User.id.in_([req.predecessor_id, req.successor_id]),
            models.User.tenant_id == current_user.tenant_id,
        )
    )
    users_found = {u.id: u for u in users_res.scalars().all()}
    if req.predecessor_id not in users_found:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Predecessor employee not found.")
    if req.successor_id not in users_found:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Successor employee not found.")

    # 2. Create KnowledgeTransferSession
    kt_session = models.KnowledgeTransferSession(
        tenant_id=current_user.tenant_id,
        title=req.title,
        predecessor_id=req.predecessor_id,
        successor_id=req.successor_id,
        manager_id=current_user.id,
        status="IN_PROGRESS",
        scope_description=req.scope_description,
        progress_percent=0.0,
    )
    kt_session.set_systems_in_scope(req.systems_in_scope)
    db.add(kt_session)
    await db.flush()  # Generates kt_session.id

    # 3. Automatically discover predecessor's decisions & intuition logs
    logs_res = await db.execute(
        select(models.EmployeeDailyLog)
        .where(
            models.EmployeeDailyLog.user_id == req.predecessor_id,
            models.EmployeeDailyLog.tenant_id == current_user.tenant_id,
        )
        .order_by(models.EmployeeDailyLog.log_date.desc())
        .limit(25)
    )
    pred_logs = logs_res.scalars().all()

    # 4. Generate Checklist Items
    items_to_add = []
    for log in pred_logs:
        # Decision review item
        item = models.KTChecklistItem(
            session_id=kt_session.id,
            tenant_id=current_user.tenant_id,
            item_type="DECISION_REVIEW",
            title=f"Review Decision: {log.title}",
            description=f"Action: {log.decision_summary} | Trade-offs: {log.trade_offs_considered or 'None documented'}",
            reference_id=f"DEC-{log.id:06d}",
            is_reviewed=False,
        )
        items_to_add.append(item)

        # If log contains tacit intuition, create an intuition review item
        if log.intuition_notes and len(log.intuition_notes.strip()) > 10:
            intuition_item = models.KTChecklistItem(
                session_id=kt_session.id,
                tenant_id=current_user.tenant_id,
                item_type="TACIT_INTUITION",
                title=f"Tacit Workaround: {log.impacted_system_or_cell or log.title[:40]}",
                description=f"Gut feeling & quirks: {log.intuition_notes}",
                reference_id=f"DEC-{log.id:06d}",
                is_reviewed=False,
            )
            items_to_add.append(intuition_item)

    # Add standard access & credential handover item
    items_to_add.append(
        models.KTChecklistItem(
            session_id=kt_session.id,
            tenant_id=current_user.tenant_id,
            item_type="ACCESS_HANDOVER",
            title="System Credentials, Databricks Warehouse & Repository Access Handover",
            description="Verify successor has all permissions and accounts previously held by predecessor.",
            reference_id="SEC-ACCESS-001",
            is_reviewed=False,
        )
    )

    for itm in items_to_add:
        db.add(itm)

    # 5. Audit Logging
    audit = models.AuditLog(
        tenant_id=current_user.tenant_id,
        user_id=current_user.id,
        username=current_user.username,
        user_role=current_user.role,
        department=current_user.department,
        clearance_level=current_user.clearance_level,
        action="KT_SESSION_ASSIGNED",
        resource_type="KnowledgeTransferSession",
        sensitivity_level="Internal",
        ip_address="127.0.0.1",
    )
    audit.set_details({
        "kt_session_id": kt_session.id,
        "title": kt_session.title,
        "predecessor_id": req.predecessor_id,
        "successor_id": req.successor_id,
        "checklist_count": len(items_to_add),
    })
    db.add(audit)

    await db.commit()
    await db.refresh(kt_session)

    return {
        "success": True,
        "message": f"Knowledge Transfer assignment '{kt_session.title}' created with {len(items_to_add)} checklist items.",
        "session": {
            "id": kt_session.id,
            "title": kt_session.title,
            "predecessor_id": kt_session.predecessor_id,
            "successor_id": kt_session.successor_id,
            "status": kt_session.status,
            "progress_percent": kt_session.progress_percent,
            "checklist_items_count": len(items_to_add),
        },
    }


@router.get("/assignments")
async def list_kt_assignments(
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """
    List all Knowledge Transfer sessions for current tenant with progress tracking.
    """
    stmt = (
        select(models.KnowledgeTransferSession)
        .options(
            selectinload(models.KnowledgeTransferSession.predecessor),
            selectinload(models.KnowledgeTransferSession.successor),
            selectinload(models.KnowledgeTransferSession.manager),
            selectinload(models.KnowledgeTransferSession.checklist_items),
        )
        .where(models.KnowledgeTransferSession.tenant_id == current_user.tenant_id)
        .order_by(models.KnowledgeTransferSession.created_at.desc())
    )

    res = await db.execute(stmt)
    sessions = res.scalars().all()

    items = []
    for s in sessions:
        total_items = len(s.checklist_items)
        reviewed_items = sum(1 for it in s.checklist_items if it.is_reviewed)
        pct = round((reviewed_items / total_items) * 100.0, 1) if total_items > 0 else 0.0

        items.append({
            "id": s.id,
            "title": s.title,
            "status": s.status,
            "progress_percent": pct,
            "scope_description": s.scope_description,
            "systems_in_scope": s.get_systems_in_scope(),
            "created_at": s.created_at.isoformat(),
            "completed_at": s.completed_at.isoformat() if s.completed_at else None,
            "predecessor": {
                "id": s.predecessor.id,
                "name": f"{s.predecessor.first_name or ''} {s.predecessor.last_name or ''}".strip() or s.predecessor.username,
                "employee_number": s.predecessor.employee_number,
                "job_title": s.predecessor.job_title or s.predecessor.role,
                "department": s.predecessor.department,
            },
            "successor": {
                "id": s.successor.id,
                "name": f"{s.successor.first_name or ''} {s.successor.last_name or ''}".strip() or s.successor.username,
                "employee_number": s.successor.employee_number,
                "job_title": s.successor.job_title or s.successor.role,
                "department": s.successor.department,
            },
            "manager": {
                "id": s.manager.id,
                "name": f"{s.manager.first_name or ''} {s.manager.last_name or ''}".strip() or s.manager.username,
            },
            "total_items": total_items,
            "reviewed_items": reviewed_items,
        })

    return items


@router.get("/assignments/{session_id}")
async def get_kt_assignment_detail(
    session_id: int,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """
    Get single KT session with complete checklist items and coverage details.
    """
    stmt = (
        select(models.KnowledgeTransferSession)
        .options(
            selectinload(models.KnowledgeTransferSession.predecessor),
            selectinload(models.KnowledgeTransferSession.successor),
            selectinload(models.KnowledgeTransferSession.manager),
            selectinload(models.KnowledgeTransferSession.checklist_items),
        )
        .where(
            models.KnowledgeTransferSession.id == session_id,
            models.KnowledgeTransferSession.tenant_id == current_user.tenant_id,
        )
    )

    res = await db.execute(stmt)
    s = res.scalar_one_or_none()
    if not s:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="KT session not found.")

    checklist = []
    for it in s.checklist_items:
        checklist.append({
            "id": it.id,
            "item_type": it.item_type,
            "title": it.title,
            "description": it.description,
            "reference_id": it.reference_id,
            "is_reviewed": it.is_reviewed,
            "reviewed_at": it.reviewed_at.isoformat() if it.reviewed_at else None,
            "reviewed_by": it.reviewed_by,
            "notes": it.notes,
        })

    total_items = len(checklist)
    reviewed_items = sum(1 for it in checklist if it["is_reviewed"])
    pct = round((reviewed_items / total_items) * 100.0, 1) if total_items > 0 else 0.0

    return {
        "id": s.id,
        "title": s.title,
        "status": s.status,
        "progress_percent": pct,
        "scope_description": s.scope_description,
        "systems_in_scope": s.get_systems_in_scope(),
        "created_at": s.created_at.isoformat(),
        "completed_at": s.completed_at.isoformat() if s.completed_at else None,
        "predecessor": {
            "id": s.predecessor.id,
            "name": f"{s.predecessor.first_name or ''} {s.predecessor.last_name or ''}".strip() or s.predecessor.username,
            "employee_number": s.predecessor.employee_number,
            "job_title": s.predecessor.job_title or s.predecessor.role,
            "department": s.predecessor.department,
        },
        "successor": {
            "id": s.successor.id,
            "name": f"{s.successor.first_name or ''} {s.successor.last_name or ''}".strip() or s.successor.username,
            "employee_number": s.successor.employee_number,
            "job_title": s.successor.job_title or s.successor.role,
            "department": s.successor.department,
        },
        "checklist_items": checklist,
        "total_items": total_items,
        "reviewed_items": reviewed_items,
    }


@router.patch("/checklist/{item_id}")
async def update_checklist_item(
    item_id: int,
    req: UpdateChecklistItemRequest,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """
    Successor or Manager marks a checklist item as reviewed or adds reflection notes.
    """
    stmt = select(models.KTChecklistItem).where(
        models.KTChecklistItem.id == item_id,
        models.KTChecklistItem.tenant_id == current_user.tenant_id,
    )
    res = await db.execute(stmt)
    item = res.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Checklist item not found.")

    item.is_reviewed = req.is_reviewed
    item.reviewed_at = datetime.now(UTC) if req.is_reviewed else None
    item.reviewed_by = current_user.id if req.is_reviewed else None
    if req.notes is not None:
        item.notes = req.notes

    # Recompute parent session progress
    session_res = await db.execute(
        select(models.KnowledgeTransferSession)
        .options(selectinload(models.KnowledgeTransferSession.checklist_items))
        .where(models.KnowledgeTransferSession.id == item.session_id)
    )
    parent_session = session_res.scalar_one_or_none()
    if parent_session:
        total = len(parent_session.checklist_items)
        reviewed = sum(1 for it in parent_session.checklist_items if it.is_reviewed)
        parent_session.progress_percent = round((reviewed / total) * 100.0, 1) if total > 0 else 0.0

    await db.commit()
    await db.refresh(item)

    return {
        "success": True,
        "item_id": item.id,
        "is_reviewed": item.is_reviewed,
        "session_progress_percent": parent_session.progress_percent if parent_session else 0.0,
    }


@router.post("/assignments/{session_id}/sign-off")
async def sign_off_kt_session(
    session_id: int,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """
    Officially sign off and complete Knowledge Transfer handoff, generating an immutable audit trail.
    """
    stmt = (
        select(models.KnowledgeTransferSession)
        .options(
            selectinload(models.KnowledgeTransferSession.predecessor),
            selectinload(models.KnowledgeTransferSession.successor),
            selectinload(models.KnowledgeTransferSession.checklist_items),
        )
        .where(
            models.KnowledgeTransferSession.id == session_id,
            models.KnowledgeTransferSession.tenant_id == current_user.tenant_id,
        )
    )
    res = await db.execute(stmt)
    s = res.scalar_one_or_none()
    if not s:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="KT session not found.")

    s.status = "COMPLETED"
    s.completed_at = datetime.now(UTC)
    s.progress_percent = 100.0

    # Write audit log
    audit = models.AuditLog(
        tenant_id=current_user.tenant_id,
        user_id=current_user.id,
        username=current_user.username,
        user_role=current_user.role,
        department=current_user.department,
        clearance_level=current_user.clearance_level,
        action="KT_HANDOFF_OFFICIAL_SIGN_OFF",
        resource_type="KnowledgeTransferSession",
        sensitivity_level="Restricted",
        ip_address="127.0.0.1",
    )
    audit.set_details({
        "session_id": s.id,
        "title": s.title,
        "predecessor_id": s.predecessor_id,
        "successor_id": s.successor_id,
        "signed_off_by": current_user.username,
        "completion_timestamp": s.completed_at.isoformat(),
    })
    db.add(audit)

    await db.commit()
    await db.refresh(s)

    return {
        "success": True,
        "message": f"Knowledge Transfer handoff '{s.title}' officially signed off and archived in Company Brain.",
        "completed_at": s.completed_at.isoformat(),
        "status": s.status,
    }


@router.post("/ask-predecessor")
async def ask_predecessor_copilot(
    req: AskPredecessorRequest,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """
    Interactive 'Ask Predecessor's Brain' conversational endpoint.
    Retrieves grounded advice, citations, and unwritten intuition from predecessor's logs.
    """
    result = await query_predecessor_brain(
        predecessor_id=req.predecessor_id,
        tenant_id=current_user.tenant_id,
        query=req.query,
        db=db,
    )
    return result
