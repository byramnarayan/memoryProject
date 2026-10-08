import json
import math
import logging
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Query, status, Request
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_, and_, desc

from database import get_db
import models
from graph.models_gacm import ResearchMemoryObject
from services.access_control import (
    require_roles,
    log_audit_event,
    CLEARANCE_HIERARCHY,
    UNIVERSITY_ROLES
)
from auth import get_current_user

logger = logging.getLogger("governance_router")

router = APIRouter()

DEFAULT_TENANT_ID = "utc_campus"

class LegalHoldRequest(BaseModel):
    memory_id: str
    is_on_legal_hold: bool
    reason: str

@router.get("/roles-demo", status_code=status.HTTP_200_OK)
async def get_roles_demo():
    """
    Public discovery endpoint for Institutional University Personas.
    Powers 1-click test role logins on the frontend.
    """
    return {
        "institution": "University of Tennessee at Chattanooga (UTC)",
        "tenant_id": DEFAULT_TENANT_ID,
        "roles": [
            {
                "id": "tenant_admin",
                "label": "Tenant Administrator",
                "title": "Vice Provost for Research",
                "email": "admin@utc.edu",
                "password": "Admin@123",
                "role": "TenantAdmin",
                "department": "University Administration",
                "clearance_level": "HighlyConfidential",
                "description": "Full platform administration, cross-department access, review approvals, and system audit logs."
            },
            {
                "id": "dept_admin",
                "label": "Department Chair",
                "title": "Chair, Computer Science & Engineering",
                "email": "chair.cs@utc.edu",
                "password": "DeptChair@123",
                "role": "DeptAdmin",
                "department": "Computer Science & Engineering",
                "clearance_level": "Confidential",
                "description": "Department-scoped authority to curate, verify, and approve Computer Science proposals and awards."
            },
            {
                "id": "researcher",
                "label": "Faculty Researcher",
                "title": "Associate Professor, Aerospace Materials",
                "email": "researcher@utc.edu",
                "password": "Research@123",
                "role": "Researcher",
                "department": "Mechanical & Aerospace Engineering",
                "clearance_level": "Internal",
                "description": "Captures new research documents and queries public & departmental knowledge graphs. Cannot view confidential IP."
            },
            {
                "id": "auditor",
                "label": "Compliance Auditor",
                "title": "IRB & Export Control Compliance Inspector",
                "email": "auditor@utc.edu",
                "password": "Audit@123",
                "role": "Auditor",
                "department": "Research Integrity & Compliance",
                "clearance_level": "HighlyConfidential",
                "description": "Read-only institutional oversight with exclusive access to immutable audit trails and compliance reports."
            }
        ]
    }

@router.get("/audit-logs", status_code=status.HTTP_200_OK)
async def get_audit_logs(
    page: int = Query(1, ge=1, description="Page number"),
    limit: int = Query(25, ge=1, le=100, description="Items per page"),
    action: Optional[str] = Query(None, description="Filter by action name"),
    username: Optional[str] = Query(None, description="Filter by actor username"),
    user_role: Optional[str] = Query(None, description="Filter by role"),
    memory_id: Optional[str] = Query(None, description="Filter by memory id"),
    search: Optional[str] = Query(None, description="Search keyword in action or details"),
    tenant_id: str = Query(DEFAULT_TENANT_ID),
    current_user: models.User = Depends(require_roles(["Auditor", "TenantAdmin"])),
    db: AsyncSession = Depends(get_db)
):
    """
    IMMUTABLE AUDIT TRAIL ENDPOINT:
    Restricted to Auditors and Tenant Administrators.
    Returns chronologically ordered access and modification log entries with complete provenance.
    """
    if current_user and current_user.role not in ["Auditor", "TenantAdmin"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Access denied: Role '{current_user.role}' is not authorized to inspect audit logs. Required: Auditor or TenantAdmin."
        )

    actual_tenant = tenant_id if isinstance(tenant_id, str) else DEFAULT_TENANT_ID
    actual_page = page if isinstance(page, int) else 1
    actual_limit = limit if isinstance(limit, int) else 25

    conditions = [models.AuditLog.tenant_id == actual_tenant]

    if isinstance(action, str) and action and action != "All":
        conditions.append(models.AuditLog.action == action)

    if isinstance(username, str) and username.strip():
        conditions.append(models.AuditLog.username.ilike(f"%{username.strip()}%"))

    if isinstance(user_role, str) and user_role and user_role != "All":
        conditions.append(models.AuditLog.user_role == user_role)

    if isinstance(memory_id, str) and memory_id.strip():
        conditions.append(models.AuditLog.memory_id.ilike(f"%{memory_id.strip()}%"))

    if isinstance(search, str) and search.strip():
        search_pattern = f"%{search.strip()}%"
        conditions.append(or_(
            models.AuditLog.action.ilike(search_pattern),
            models.AuditLog.username.ilike(search_pattern),
            models.AuditLog.memory_id.ilike(search_pattern),
            models.AuditLog.details_json.ilike(search_pattern)
        ))

    count_stmt = select(func.count(models.AuditLog.id)).where(and_(*conditions))
    total_res = await db.execute(count_stmt)
    total_count = total_res.scalar() or 0

    offset = (actual_page - 1) * actual_limit
    stmt = select(models.AuditLog).where(and_(*conditions)).order_by(
        desc(models.AuditLog.timestamp)
    ).offset(offset).limit(actual_limit)

    records = (await db.execute(stmt)).scalars().all()

    items = []
    for r in records:
        items.append({
            "id": r.id,
            "tenant_id": r.tenant_id,
            "user_id": r.user_id,
            "username": r.username,
            "user_role": r.user_role,
            "department": r.department,
            "clearance_level": r.clearance_level,
            "memory_id": r.memory_id,
            "action": r.action,
            "resource_type": r.resource_type,
            "details": r.get_details(),
            "sensitivity_level": r.sensitivity_level,
            "ip_address": r.ip_address,
            "timestamp": r.timestamp.isoformat() if r.timestamp else None
        })

    return {
        "items": items,
        "pagination": {
            "total": total_count,
            "page": page,
            "limit": limit,
            "total_pages": math.ceil(total_count / limit) if total_count > 0 else 1
        }
    }

@router.get("/stats", status_code=status.HTTP_200_OK)
async def get_governance_stats(
    tenant_id: str = Query(DEFAULT_TENANT_ID),
    current_user: models.User = Depends(require_roles(["Auditor", "TenantAdmin"])),
    db: AsyncSession = Depends(get_db)
):
    """
    Returns governance and compliance summary metrics for auditors.
    """
    if current_user and current_user.role not in ["Auditor", "TenantAdmin"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Access denied: Role '{current_user.role}' is not authorized to inspect governance statistics. Required: Auditor or TenantAdmin."
        )

    actual_tenant = tenant_id if isinstance(tenant_id, str) else DEFAULT_TENANT_ID

    # Total events
    total_events = (await db.execute(
        select(func.count(models.AuditLog.id)).where(models.AuditLog.tenant_id == actual_tenant)
    )).scalar() or 0

    # Clearance denials
    denials = (await db.execute(
        select(func.count(models.AuditLog.id)).where(
            and_(
                models.AuditLog.tenant_id == actual_tenant,
                models.AuditLog.action == "CLEARANCE_DENIAL"
            )
        )
    )).scalar() or 0

    # Curation events
    curations = (await db.execute(
        select(func.count(models.AuditLog.id)).where(
            and_(
                models.AuditLog.tenant_id == actual_tenant,
                models.AuditLog.action.in_(["CURATE", "APPROVE", "REJECT"])
            )
        )
    )).scalar() or 0

    # Captures
    captures = (await db.execute(
        select(func.count(models.AuditLog.id)).where(
            and_(
                models.AuditLog.tenant_id == actual_tenant,
                models.AuditLog.action == "CAPTURE"
            )
        )
    )).scalar() or 0

    # Legal holds
    holds = (await db.execute(
        select(func.count(ResearchMemoryObject.id)).where(
            and_(
                ResearchMemoryObject.tenant_id == actual_tenant,
                ResearchMemoryObject.is_on_legal_hold == True
            )
        )
    )).scalar() or 0

    return {
        "total_events": total_events,
        "clearance_denials": denials,
        "curation_actions": curations,
        "captures": captures,
        "active_legal_holds": holds,
        "audited_by": current_user.username,
        "auditor_role": current_user.role
    }

@router.post("/legal-hold", status_code=status.HTTP_200_OK)
async def toggle_legal_hold(
    payload: LegalHoldRequest,
    current_user: models.User = Depends(require_roles(["Auditor", "TenantAdmin"])),
    db: AsyncSession = Depends(get_db)
):
    """
    Applies or removes an institutional Legal Hold on a memory.
    Memories on legal hold cannot be deleted or purged.
    """
    if current_user and current_user.role not in ["Auditor", "TenantAdmin"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Access denied: Role '{current_user.role}' cannot toggle legal hold. Required: Auditor or TenantAdmin."
        )
    res = await db.execute(
        select(ResearchMemoryObject).where(
            or_(
                ResearchMemoryObject.memory_id == payload.memory_id,
                ResearchMemoryObject.id == int(payload.memory_id) if payload.memory_id.isdigit() else False
            )
        )
    )
    mem = res.scalars().first()
    if not mem:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Memory record '{payload.memory_id}' not found."
        )

    mem.is_on_legal_hold = payload.is_on_legal_hold
    mem.updated_at = datetime.now(timezone.utc)
    await db.commit()

    # Log audit event
    action = "LEGAL_HOLD_APPLIED" if payload.is_on_legal_hold else "LEGAL_HOLD_REMOVED"
    await log_audit_event(
        session=db,
        user=current_user,
        action=action,
        memory_id=mem.memory_id,
        details={"reason": payload.reason, "legal_hold": payload.is_on_legal_hold},
        sensitivity_level=mem.sensitivity_level
    )

    return {
        "status": "success",
        "memory_id": mem.memory_id,
        "is_on_legal_hold": mem.is_on_legal_hold,
        "message": f"Legal hold {'applied' if mem.is_on_legal_hold else 'released'} on {mem.memory_id}."
    }
