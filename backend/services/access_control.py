import json
import logging
from typing import List, Optional, Dict, Any, Callable
from datetime import datetime, timezone
from fastapi import Depends, HTTPException, status, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from database import get_db
import models
from graph.models_gacm import ResearchMemoryObject
from auth import get_current_user, oauth2_scheme, verify_access_token

logger = logging.getLogger("access_control")

# ---------------------------------------------------------------------------
# 1. Sensitivity Clearance Ladder (5-Level Hierarchy)
# ---------------------------------------------------------------------------

CLEARANCE_HIERARCHY: Dict[str, int] = {
    "Public": 1,
    "Internal": 2,
    "Restricted": 3,
    "Confidential": 4,
    "HighlyConfidential": 5
}

UNIVERSITY_ROLES = ["TenantAdmin", "DeptAdmin", "Researcher", "Auditor"]

def get_authorized_sensitivities(clearance_level: str) -> List[str]:
    """
    Returns list of sensitivity levels an individual with the given clearance is authorized to view.
    Example: 'Internal' (2) -> ['Public', 'Internal']
             'Confidential' (4) -> ['Public', 'Internal', 'Restricted', 'Confidential']
    """
    user_rank = CLEARANCE_HIERARCHY.get(clearance_level, 1)
    return [level for level, rank in CLEARANCE_HIERARCHY.items() if rank <= user_rank]

def is_clearance_sufficient(user_clearance: str, required_clearance: str) -> bool:
    """Checks whether user clearance rank is >= required clearance rank."""
    u_rank = CLEARANCE_HIERARCHY.get(user_clearance, 1)
    r_rank = CLEARANCE_HIERARCHY.get(required_clearance, 1)
    return u_rank >= r_rank

# ---------------------------------------------------------------------------
# 2. Institutional Department & Role Access Rules
# ---------------------------------------------------------------------------

def can_user_access_memory(user: models.User, memory: ResearchMemoryObject) -> bool:
    """
    Evaluates whether a user can read/query a given research memory.
    Enforces:
    1. Sensitivity Clearance Check: memory.sensitivity_level <= user.clearance_level
    2. Department Scoping:
       - TenantAdmin / Auditor: Full cross-department access
       - DeptAdmin: Can access Public campus-wide, plus all records in their assigned department
       - Researcher: Can access Public campus-wide, Internal in their department, or Restricted if named as PI/Co-PI.
    """
    # 1. Clearance Check
    if not is_clearance_sufficient(user.clearance_level, memory.sensitivity_level):
        return False

    # 2. Role & Department Scoping
    if user.role in ["TenantAdmin", "Auditor"]:
        return True

    mem_dept = memory.get_entities().get("department") or ""

    if user.role == "DeptAdmin":
        if memory.sensitivity_level == "Public":
            return True
        # Allow departmental matches or university-wide Research Division fallback
        return (user.department.lower() in mem_dept.lower()) or ("research division" in mem_dept.lower())

    if user.role == "Researcher":
        if memory.sensitivity_level == "Public":
            return True
        if memory.sensitivity_level == "Internal":
            return (user.department.lower() in mem_dept.lower()) or ("research division" in mem_dept.lower())
        
        # If Restricted or Confidential: check if user is explicitly listed as PI or Co-PI
        entities = memory.get_entities()
        pi_name = (entities.get("pi_name") or "").lower()
        co_pis = [str(c).lower() for c in entities.get("co_pi_names", [])]
        user_name_lower = user.username.lower()
        
        if user_name_lower in pi_name or any(user_name_lower in cp for cp in co_pis):
            return True
        return False

    return False

def can_user_curate_memory(user: models.User, memory: ResearchMemoryObject) -> bool:
    """
    Determines if user has permission to approve or edit entities on a memory.
    - TenantAdmin: Full curation authority across campus
    - DeptAdmin: Curation authority within their department
    - Researcher / Auditor: Read-only for curation workflows
    """
    if user.role == "TenantAdmin":
        return True
    if user.role == "DeptAdmin":
        mem_dept = memory.get_entities().get("department") or ""
        return (user.department.lower() in mem_dept.lower()) or ("research division" in mem_dept.lower())
    return False

# ---------------------------------------------------------------------------
# 3. Immutable Audit Trail Logging Engine
# ---------------------------------------------------------------------------

async def log_audit_event(
    session: AsyncSession,
    user: Optional[models.User],
    action: str,
    memory_id: Optional[str] = None,
    details: Optional[Dict[str, Any]] = None,
    sensitivity_level: Optional[str] = None,
    ip_address: str = "127.0.0.1",
    tenant_id: str = "utc_campus"
) -> models.AuditLog:
    """
    Creates an immutable row in the audit_logs table.
    Actions: CAPTURE, CURATE, APPROVE, REJECT, VIEW_TEXT, SEARCH, CLEARANCE_DENIAL, LEGAL_HOLD.
    """
    u_id = user.id if user else None
    u_name = user.username if user else "Anonymous"
    u_role = user.role if user else "Public"
    u_dept = user.department if user else None
    u_clearance = user.clearance_level if user else "Public"

    entry = models.AuditLog(
        tenant_id=tenant_id,
        user_id=u_id,
        username=u_name,
        user_role=u_role,
        department=u_dept,
        clearance_level=u_clearance,
        memory_id=memory_id,
        action=action,
        resource_type="ResearchMemoryObject",
        details_json=json.dumps(details or {}),
        sensitivity_level=sensitivity_level,
        ip_address=ip_address,
        timestamp=datetime.now(timezone.utc)
    )
    session.add(entry)
    await session.commit()
    await session.refresh(entry)
    logger.info(f"[AUDIT] {action} by {u_name} ({u_role}) on {memory_id or 'resource'}")
    return entry

# ---------------------------------------------------------------------------
# 4. FastAPI Dependency Injections
# ---------------------------------------------------------------------------

def require_roles(allowed_roles: List[str]):
    """FastAPI dependency factory enforcing specified roles."""
    async def role_checker(current_user: models.User = Depends(get_current_user)) -> models.User:
        if current_user.role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access denied: Operation requires one of roles {allowed_roles}. Your role: '{current_user.role}'."
            )
        return current_user
    return role_checker

def require_clearance(min_clearance: str):
    """FastAPI dependency factory enforcing minimum sensitivity clearance."""
    async def clearance_checker(current_user: models.User = Depends(get_current_user)) -> models.User:
        if not is_clearance_sufficient(current_user.clearance_level, min_clearance):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Insufficient clearance: Requires '{min_clearance}' or higher. Your clearance: '{current_user.clearance_level}'."
            )
        return current_user
    return clearance_checker

async def get_optional_current_user(
    request: Request,
    db: AsyncSession = Depends(get_db)
) -> Optional[models.User]:
    """
    Returns authenticated User if valid Bearer token provided in Authorization header,
    or None for public unauthenticated guest browsing.
    """
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        return None

    token = auth_header[7:].strip()
    user_id = verify_access_token(token)
    if not user_id:
        return None

    try:
        u_id = int(user_id)
        res = await db.execute(select(models.User).where(models.User.id == u_id))
        return res.scalars().first()
    except Exception:
        return None
