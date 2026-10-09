import logging
import secrets
import string
from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

import models
from auth import CurrentUser, hash_password
from database import get_db
from schemas import (
    EmployeeListItem,
    EmployeeProvisionRequest,
    EmployeeProvisionResponse,
    EmployeeStatusUpdate,
)

logger = logging.getLogger("uvicorn")
router = APIRouter()


def generate_temp_password(length: int = 12) -> str:
    """Generate a clean, readable, secure temporary password (e.g. Telco-8371!Pass)."""
    digits = "".join(secrets.choice(string.digits) for _ in range(4))
    special = "!@#"
    return f"Telco-{digits}{secrets.choice(special)}Pass"


@router.post("/provision", response_model=EmployeeProvisionResponse, status_code=status.HTTP_201_CREATED)
async def provision_employee(
    req: EmployeeProvisionRequest,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """
    HR / Manager Employee Provisioning Endpoint (Session 10 - Method 2).
    Generates new employee credentials, binds role, department, clearance, and manager,
    and returns a credential slip for the new hire.
    """
    # 1. Permission check: Only TenantAdmin or DeptAdmin can provision employees
    if current_user.role not in ["TenantAdmin", "DeptAdmin"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only Company Administrators and Department Managers can provision employee accounts.",
        )

    # 2. Check if work email already exists
    email_check = await db.execute(
        select(models.User).where(func.lower(models.User.email) == req.work_email.lower())
    )
    if email_check.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"An account with email '{req.work_email}' already exists.",
        )

    # 3. Compute next sequential Employee Number (e.g., EMP-0002)
    count_res = await db.execute(
        select(func.count(models.User.id)).where(models.User.tenant_id == current_user.tenant_id)
    )
    current_count = count_res.scalar() or 0
    next_emp_num = f"EMP-{current_count + 1:04d}"

    # 4. Determine Password & Username
    temp_password = req.custom_password or generate_temp_password()
    username_base = f"{req.first_name.strip().lower()}.{req.last_name.strip().lower()}"
    
    # Ensure username uniqueness
    u_check = await db.execute(
        select(models.User).where(func.lower(models.User.username) == username_base)
    )
    if u_check.scalar_one_or_none():
        username = f"{username_base}_{next_emp_num.lower()}"
    else:
        username = username_base

    # 5. Validate manager belongs to the same tenant if provided
    if req.manager_id:
        mgr_check = await db.execute(
            select(models.User).where(
                models.User.id == req.manager_id,
                models.User.tenant_id == current_user.tenant_id,
            )
        )
        if not mgr_check.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Selected reporting manager was not found in this company tenant.",
            )

    # 6. Create User record
    new_employee = models.User(
        username=username,
        email=req.work_email.lower(),
        password_hash=hash_password(temp_password),
        role=req.role,
        department=req.department,
        clearance_level=req.clearance_level,
        tenant_id=current_user.tenant_id,
        first_name=req.first_name.strip(),
        last_name=req.last_name.strip(),
        employee_number=next_emp_num,
        job_title=req.job_title.strip(),
        manager_id=req.manager_id,
        hire_date=datetime.now(UTC),
        is_temporary_password=True,
        status="Active",
    )
    db.add(new_employee)
    await db.flush()

    # 7. Write Audit Trail Entry
    audit = models.AuditLog(
        tenant_id=current_user.tenant_id,
        user_id=current_user.id,
        username=current_user.username,
        user_role=current_user.role,
        department=current_user.department,
        clearance_level=current_user.clearance_level,
        action="EMPLOYEE_PROVISIONED",
        resource_type="User",
        sensitivity_level=req.clearance_level,
        ip_address="127.0.0.1",
    )
    audit.set_details({
        "provisioned_employee_id": new_employee.id,
        "employee_number": next_emp_num,
        "name": f"{new_employee.first_name} {new_employee.last_name}",
        "work_email": new_employee.email,
        "department": new_employee.department,
        "role": new_employee.role,
        "clearance_level": new_employee.clearance_level,
        "provisioned_by": current_user.username,
    })
    db.add(audit)

    # 7. Record to HR Credential Vault (Session 15)
    vault_item = models.CredentialVaultItem(
        tenant_id=current_user.tenant_id,
        user_id=new_employee.id,
        employee_number=new_employee.employee_number or next_emp_num,
        full_name=f"{new_employee.first_name} {new_employee.last_name}".strip() or new_employee.username,
        work_email=new_employee.email,
        username=new_employee.username,
        department=new_employee.department,
        role=new_employee.role,
        job_title=new_employee.job_title or "Staff Member",
        clearance_level=new_employee.clearance_level,
        temporary_password=temp_password,
        source="Manual HR Provision",
        handout_status="Pending Handout",
    )
    db.add(vault_item)

    await db.commit()
    await db.refresh(new_employee)

    # Real-Time Neo4j Graph Synchronization (Session 16)
    try:
        from services.graph_sync_service import sync_employee_to_neo4j
        mgr_user = None
        if new_employee.manager_id:
            m_res = await db.execute(
                select(models.User).where(models.User.id == new_employee.manager_id)
            )
            mgr_user = m_res.scalar_one_or_none()
        sync_employee_to_neo4j(new_employee, manager_emp=mgr_user)
    except Exception as ge:
        logger.warning(f"Neo4j real-time employee sync notice: {ge}")

    return EmployeeProvisionResponse(
        id=new_employee.id,
        employee_number=new_employee.employee_number or next_emp_num,
        username=new_employee.username,
        work_email=new_employee.email,
        first_name=new_employee.first_name or "",
        last_name=new_employee.last_name or "",
        department=new_employee.department,
        role=new_employee.role,
        job_title=new_employee.job_title or "",
        clearance_level=new_employee.clearance_level,
        manager_id=new_employee.manager_id,
        temporary_password=temp_password,
        status=new_employee.status,
    )


@router.get("", response_model=list[EmployeeListItem])
async def list_employees(
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
    q: Annotated[str | None, Query(description="Search query by name, email, employee number")] = None,
    department: Annotated[str | None, Query(description="Filter by department")] = None,
    role: Annotated[str | None, Query(description="Filter by role")] = None,
):
    """
    List all employees in the current tenant with manager resolution and filtering.
    """
    stmt = (
        select(models.User)
        .where(models.User.tenant_id == current_user.tenant_id)
        .order_by(models.User.id.asc())
    )

    if department and isinstance(department, str) and department != "All":
        stmt = stmt.where(models.User.department == department)
    if role and isinstance(role, str) and role != "All":
        stmt = stmt.where(models.User.role == role)
    if q and isinstance(q, str):
        search_pattern = f"%{q.strip().lower()}%"
        stmt = stmt.where(
            or_(
                func.lower(models.User.username).like(search_pattern),
                func.lower(models.User.email).like(search_pattern),
                func.lower(models.User.first_name).like(search_pattern),
                func.lower(models.User.last_name).like(search_pattern),
                func.lower(models.User.employee_number).like(search_pattern),
                func.lower(models.User.job_title).like(search_pattern),
            )
        )

    res = await db.execute(stmt)
    users = res.scalars().all()

    # Pre-fetch manager map for fast lookup
    all_users_res = await db.execute(
        select(models.User.id, models.User.first_name, models.User.last_name, models.User.username)
        .where(models.User.tenant_id == current_user.tenant_id)
    )
    manager_map = {
        row[0]: f"{row[1]} {row[2]}" if (row[1] and row[2]) else row[3]
        for row in all_users_res.all()
    }

    result = []
    for u in users:
        mgr_name = manager_map.get(u.manager_id) if u.manager_id else None
        hire_str = u.hire_date.strftime("%Y-%m-%d") if u.hire_date else None
        result.append(
            EmployeeListItem(
                id=u.id,
                employee_number=u.employee_number,
                username=u.username,
                work_email=u.email,
                first_name=u.first_name,
                last_name=u.last_name,
                department=u.department,
                role=u.role,
                job_title=u.job_title,
                clearance_level=u.clearance_level,
                manager_id=u.manager_id,
                manager_name=mgr_name,
                status=u.status,
                hire_date=hire_str,
            )
        )

    return result


@router.get("/managers", response_model=list[dict])
async def list_potential_managers(
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """List staff members in this tenant eligible to be reporting managers."""
    stmt = (
        select(models.User.id, models.User.first_name, models.User.last_name, models.User.username, models.User.job_title, models.User.department)
        .where(
            models.User.tenant_id == current_user.tenant_id,
            models.User.status == "Active",
        )
        .order_by(models.User.first_name.asc())
    )
    res = await db.execute(stmt)
    managers = []
    for row in res.all():
        display_name = f"{row[1]} {row[2]}" if (row[1] and row[2]) else row[3]
        managers.append({
            "id": row[0],
            "name": display_name,
            "job_title": row[4] or "Manager",
            "department": row[5],
        })
    return managers


@router.put("/{employee_id}/status")
async def update_employee_status(
    employee_id: int,
    req: EmployeeStatusUpdate,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Update employee operational status (Active, OnLeave, Terminated)."""
    if current_user.role not in ["TenantAdmin", "DeptAdmin"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only administrators can modify employee employment status.",
        )

    emp_res = await db.execute(
        select(models.User).where(
            models.User.id == employee_id,
            models.User.tenant_id == current_user.tenant_id,
        )
    )
    emp = emp_res.scalar_one_or_none()
    if not emp:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Employee not found in tenant.")

    old_status = emp.status
    emp.status = req.status

    # Write audit log
    audit = models.AuditLog(
        tenant_id=current_user.tenant_id,
        user_id=current_user.id,
        username=current_user.username,
        user_role=current_user.role,
        department=current_user.department,
        clearance_level=current_user.clearance_level,
        action="EMPLOYEE_STATUS_CHANGED",
        resource_type="User",
        sensitivity_level="Internal",
        ip_address="127.0.0.1",
    )
    audit.set_details({
        "employee_id": emp.id,
        "employee_number": emp.employee_number,
        "old_status": old_status,
        "new_status": req.status,
    })
    db.add(audit)

    await db.commit()
    return {"success": True, "message": f"Status updated to '{req.status}'.", "status": req.status}


@router.get("/credential-vault", response_model=list[dict])
async def get_credential_vault(
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """
    HR Credential Vault (Session 15).
    Lists all temporary passwords and credential slips for newly ingested or provisioned staff.
    Strictly restricted to TenantAdmin, DeptAdmin, and HRManager.
    """
    if current_user.role not in ["TenantAdmin", "DeptAdmin", "HRManager"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: Access to HR Credential Vault requires Administrator or Department Manager role.",
        )

    stmt = (
        select(models.CredentialVaultItem)
        .where(models.CredentialVaultItem.tenant_id == current_user.tenant_id)
        .order_by(models.CredentialVaultItem.created_at.desc())
    )
    res = await db.execute(stmt)
    items = res.scalars().all()

    return [
        {
            "id": item.id,
            "employee_number": item.employee_number,
            "full_name": item.full_name,
            "work_email": item.work_email,
            "username": item.username,
            "department": item.department,
            "role": item.role,
            "job_title": item.job_title,
            "clearance_level": item.clearance_level,
            "temporary_password": item.temporary_password,
            "source": item.source,
            "handout_status": item.handout_status,
            "created_at": item.created_at.isoformat() if item.created_at else None,
            "delivered_at": item.delivered_at.isoformat() if item.delivered_at else None,
        }
        for item in items
    ]


@router.put("/credential-vault/{vault_id}/delivered")
async def mark_credential_delivered(
    vault_id: int,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """
    Mark an employee credential slip as delivered/handed out (Session 15).
    """
    if current_user.role not in ["TenantAdmin", "DeptAdmin", "HRManager"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: Only administrators or managers can update credential handout status.",
        )

    res = await db.execute(
        select(models.CredentialVaultItem).where(
            models.CredentialVaultItem.id == vault_id,
            models.CredentialVaultItem.tenant_id == current_user.tenant_id,
        )
    )
    item = res.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Credential vault item not found.")

    item.handout_status = "Delivered"
    item.delivered_at = datetime.now(UTC)
    await db.commit()
    return {"success": True, "message": "Credential marked as delivered to employee.", "handout_status": "Delivered"}
