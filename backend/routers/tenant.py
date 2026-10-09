import logging
from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

import models
from auth import CurrentUser, create_access_token, hash_password
from database import get_db
from schemas import (
    CompanySetupRequest,
    CompanyTenantResponse,
    CustomRoleCreate,
    CustomRoleResponse,
    DepartmentCreate,
    DepartmentResponse,
)

logger = logging.getLogger("uvicorn")
router = APIRouter()


@router.post("/setup", status_code=status.HTTP_201_CREATED)
async def setup_company_tenant(
    req: CompanySetupRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """
    Company Head Onboarding Endpoint (Session 10).
    Initializes a new Company Tenant, provisions default enterprise departments,
    seeds default custom roles, and registers the Company Head / TenantAdmin.
    """
    clean_tenant_id = req.tenant_id.strip().lower().replace(" ", "_")

    # 1. Check if tenant_id is already claimed
    tenant_check = await db.execute(
        select(models.CompanyTenant).where(
            func.lower(models.CompanyTenant.tenant_id) == clean_tenant_id
        )
    )
    if tenant_check.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Company Tenant ID '{clean_tenant_id}' is already registered.",
        )

    # 2. Check if admin email is already in use
    email_check = await db.execute(
        select(models.User).where(func.lower(models.User.email) == req.admin_email.lower())
    )
    if email_check.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"User with email '{req.admin_email}' already exists.",
        )

    # 3. Create CompanyTenant record
    tenant_obj = models.CompanyTenant(
        tenant_id=clean_tenant_id,
        company_name=req.company_name.strip(),
        industry=req.industry.strip(),
        plan_tier="Enterprise",
        admin_email=req.admin_email.lower(),
    )
    tenant_obj.set_settings({
        "theme": "enterprise",
        "allow_remote_logs": True,
        "default_clearance": "Internal",
        "industry": req.industry.strip(),
    })
    db.add(tenant_obj)

    # 4. Provision Initial Departments
    dept_names = req.initial_departments or [
        "Network Operations",
        "Customer Support",
        "Radio Frequency Engineering",
        "Billing & Finance",
        "Executive Leadership",
    ]
    for d_name in dept_names:
        code_slug = d_name.upper().replace(" ", "_")[:20]
        dept_obj = models.Department(
            tenant_id=clean_tenant_id,
            name=d_name.strip(),
            code=code_slug,
            description=f"{d_name} Department for {req.company_name}",
        )
        db.add(dept_obj)

    # 5. Provision Standard Enterprise Roles
    default_roles = [
        {
            "role_name": "TenantAdmin",
            "clearance_level": "ExecutiveOnly",
            "description": "Company Executive / Universal Administration & Policy Oversight",
            "can_manage_employees": True,
            "can_manage_connectors": True,
            "can_curate": True,
        },
        {
            "role_name": "DeptAdmin",
            "clearance_level": "Confidential",
            "description": "Department Head / Team Lead with management & curation rights",
            "can_manage_employees": True,
            "can_manage_connectors": False,
            "can_curate": True,
        },
        {
            "role_name": "SeniorEngineer",
            "clearance_level": "Restricted",
            "description": "Senior Technical Staff & Domain Specialists",
            "can_manage_employees": False,
            "can_manage_connectors": True,
            "can_curate": True,
        },
        {
            "role_name": "Employee",
            "clearance_level": "Internal",
            "description": "Operational Staff, Support Specialists & Field Technicians",
            "can_manage_employees": False,
            "can_manage_connectors": False,
            "can_curate": False,
        },
        {
            "role_name": "Auditor",
            "clearance_level": "ExecutiveOnly",
            "description": "Compliance, Governance & Integrity Auditor",
            "can_manage_employees": False,
            "can_manage_connectors": False,
            "can_curate": False,
        },
    ]

    for r_def in default_roles:
        role_obj = models.CustomRole(
            tenant_id=clean_tenant_id,
            role_name=r_def["role_name"],
            clearance_level=r_def["clearance_level"],
            description=r_def["description"],
            can_manage_employees=r_def["can_manage_employees"],
            can_manage_connectors=r_def["can_manage_connectors"],
            can_curate=r_def["can_curate"],
        )
        db.add(role_obj)

    # 6. Create the Company Head / Admin User
    admin_username = f"admin_{clean_tenant_id}"
    name_parts = req.admin_name.strip().split(" ", 1)
    first_name = name_parts[0]
    last_name = name_parts[1] if len(name_parts) > 1 else "Admin"

    admin_user = models.User(
        username=admin_username,
        email=req.admin_email.lower(),
        password_hash=hash_password(req.admin_password),
        role="TenantAdmin",
        department="Executive Leadership",
        clearance_level="ExecutiveOnly",
        tenant_id=clean_tenant_id,
        first_name=first_name,
        last_name=last_name,
        employee_number="EMP-0001",
        job_title="Company Head & Executive Director",
        is_temporary_password=False,
        status="Active",
        hire_date=datetime.now(UTC),
    )
    db.add(admin_user)
    await db.flush()

    # 7. Write Audit Trail Entry
    audit = models.AuditLog(
        tenant_id=clean_tenant_id,
        user_id=admin_user.id,
        username=admin_user.username,
        user_role=admin_user.role,
        department=admin_user.department,
        clearance_level=admin_user.clearance_level,
        action="TENANT_SETUP",
        resource_type="CompanyTenant",
        sensitivity_level="ExecutiveOnly",
        ip_address="127.0.0.1",
    )
    audit.set_details({
        "company_name": req.company_name,
        "industry": req.industry,
        "initial_departments_count": len(dept_names),
        "admin_email": req.admin_email,
    })
    db.add(audit)

    await db.commit()
    await db.refresh(tenant_obj)
    await db.refresh(admin_user)

    # Real-Time Neo4j Graph Synchronization for Initial Admin (Session 16)
    try:
        from services.graph_sync_service import sync_employee_to_neo4j
        sync_employee_to_neo4j(admin_user)
    except Exception as ge:
        logger.warning(f"Neo4j tenant admin sync notice: {ge}")

    # 8. Issue JWT access token for seamless immediate login
    token_payload = {
        "sub": str(admin_user.id),
        "role": admin_user.role,
        "department": admin_user.department,
        "clearance_level": admin_user.clearance_level,
        "tenant_id": admin_user.tenant_id,
    }
    access_token = create_access_token(token_payload)

    return {
        "success": True,
        "message": f"Enterprise organization '{req.company_name}' successfully initialized.",
        "tenant": {
            "tenant_id": tenant_obj.tenant_id,
            "company_name": tenant_obj.company_name,
            "industry": tenant_obj.industry,
            "plan_tier": tenant_obj.plan_tier,
            "admin_email": tenant_obj.admin_email,
        },
        "admin_user": {
            "id": admin_user.id,
            "username": admin_user.username,
            "email": admin_user.email,
            "employee_number": admin_user.employee_number,
            "role": admin_user.role,
            "clearance_level": admin_user.clearance_level,
        },
        "access_token": access_token,
        "token_type": "bearer",
    }


@router.get("/info", response_model=CompanyTenantResponse)
async def get_tenant_info(
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Retrieve organization profile for the current user's tenant."""
    res = await db.execute(
        select(models.CompanyTenant).where(
            models.CompanyTenant.tenant_id == current_user.tenant_id
        )
    )
    tenant = res.scalar_one_or_none()
    if not tenant:
        # Default mock for legacy seed tenant if needed
        return CompanyTenantResponse(
            id=1,
            tenant_id=current_user.tenant_id,
            company_name="Apex Telecommunications",
            industry="Telecom",
            plan_tier="Enterprise",
            admin_email="admin@utc.edu",
        )
    return tenant


@router.get("/departments", response_model=list[DepartmentResponse])
async def list_departments(
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """List departments for the current user's tenant with employee counts."""
    # 1. Fetch departments
    dept_res = await db.execute(
        select(models.Department)
        .where(models.Department.tenant_id == current_user.tenant_id)
        .order_by(models.Department.name.asc())
    )
    depts = dept_res.scalars().all()

    # 2. Compute employee counts per department
    counts_res = await db.execute(
        select(models.User.department, func.count(models.User.id))
        .where(models.User.tenant_id == current_user.tenant_id)
        .group_by(models.User.department)
    )
    counts_map = dict(counts_res.all())

    result = []
    for d in depts:
        result.append(
            DepartmentResponse(
                id=d.id,
                tenant_id=d.tenant_id,
                name=d.name,
                code=d.code,
                description=d.description,
                employee_count=counts_map.get(d.name, 0),
            )
        )
    return result


@router.post("/departments", response_model=DepartmentResponse, status_code=status.HTTP_201_CREATED)
async def create_department(
    req: DepartmentCreate,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Create a new department in the current user's tenant."""
    if current_user.role not in ["TenantAdmin", "DeptAdmin"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Administrative privileges required to create departments.",
        )

    dept_obj = models.Department(
        tenant_id=current_user.tenant_id,
        name=req.name.strip(),
        code=req.code.strip().upper(),
        description=req.description,
    )
    db.add(dept_obj)
    await db.commit()
    await db.refresh(dept_obj)

    return DepartmentResponse(
        id=dept_obj.id,
        tenant_id=dept_obj.tenant_id,
        name=dept_obj.name,
        code=dept_obj.code,
        description=dept_obj.description,
        employee_count=0,
    )


@router.get("/roles", response_model=list[CustomRoleResponse])
async def list_roles(
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """List configured roles & clearance rules for the current tenant."""
    roles_res = await db.execute(
        select(models.CustomRole)
        .where(models.CustomRole.tenant_id == current_user.tenant_id)
        .order_by(models.CustomRole.id.asc())
    )
    roles = roles_res.scalars().all()
    return roles


@router.post("/roles", response_model=CustomRoleResponse, status_code=status.HTTP_201_CREATED)
async def create_custom_role(
    req: CustomRoleCreate,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Define a new custom enterprise role for the tenant."""
    if current_user.role != "TenantAdmin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only Company Head (TenantAdmin) can define custom roles.",
        )

    role_obj = models.CustomRole(
        tenant_id=current_user.tenant_id,
        role_name=req.role_name.strip(),
        clearance_level=req.clearance_level,
        description=req.description,
        can_manage_employees=req.can_manage_employees,
        can_manage_connectors=req.can_manage_connectors,
        can_curate=req.can_curate,
    )
    db.add(role_obj)
    await db.commit()
    await db.refresh(role_obj)
    return role_obj
