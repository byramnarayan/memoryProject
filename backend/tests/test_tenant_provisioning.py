import asyncio
import os
import sys

# Ensure UTF-8 output on Windows PowerShell
if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from database import AsyncSessionLocal, engine, Base
import models
from routers.tenant import setup_company_tenant
from routers.employees import provision_employee, list_employees
from schemas import CompanySetupRequest, EmployeeProvisionRequest
from auth import verify_password
from sqlalchemy import select, delete


async def run_tenant_provisioning_tests():
    print("=" * 80)
    print("🧪 RUNNING SESSION 10 TEST: MULTI-TENANT SETUP & EMPLOYEE PROVISIONING")
    print("=" * 80)

    # 1. Ensure tables exist in database
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    test_tenant_id = "test_apex_telco"
    test_tenant_b = "test_globex_tech"

    async with AsyncSessionLocal() as session:
        # Cleanup any previous test runs
        await session.execute(delete(models.AuditLog).where(models.AuditLog.tenant_id.in_([test_tenant_id, test_tenant_b])))
        await session.execute(delete(models.User).where(models.User.tenant_id.in_([test_tenant_id, test_tenant_b])))
        await session.execute(delete(models.Department).where(models.Department.tenant_id.in_([test_tenant_id, test_tenant_b])))
        await session.execute(delete(models.CustomRole).where(models.CustomRole.tenant_id.in_([test_tenant_id, test_tenant_b])))
        await session.execute(delete(models.CompanyTenant).where(models.CompanyTenant.tenant_id.in_([test_tenant_id, test_tenant_b])))
        await session.commit()

        # ---------------------------------------------------------
        # TEST 1: Company Setup (Head of Company Onboarding)
        # ---------------------------------------------------------
        print("\n🔹 [Step 1] Initializing Company Organization ('Apex Telecom')...")
        setup_req = CompanySetupRequest(
            company_name="Apex Telecommunications Global",
            tenant_id=test_tenant_id,
            industry="Telecom",
            admin_name="Marcus Vance",
            admin_email="marcus.vance@apextelco.com",
            admin_password="AdminSecure@2026",
            initial_departments=[
                "Network Operations",
                "Customer Support",
                "Radio Frequency Engineering",
                "Billing & Mediation",
                "Executive Leadership"
            ]
        )

        res = await setup_company_tenant(setup_req, session)
        assert res["success"] is True, "Failed to setup company"
        assert res["tenant"]["tenant_id"] == test_tenant_id, "Tenant ID mismatch"
        assert "access_token" in res, "Missing access token in setup response"
        print(f"   ✅ Company Tenant registered: {res['tenant']['company_name']} ({res['tenant']['tenant_id']})")
        print(f"   ✅ Admin Account created: {res['admin_user']['username']} (EMP: {res['admin_user']['employee_number']})")
        print(f"   ✅ Access Token generated: {res['access_token'][:25]}...")

        # ---------------------------------------------------------
        # TEST 2: Verify Initial Departments and Roles
        # ---------------------------------------------------------
        print("\n🔹 [Step 2] Verifying Seeded Enterprise Departments & Roles...")
        depts_res = await session.execute(
            select(models.Department).where(models.Department.tenant_id == test_tenant_id)
        )
        depts = depts_res.scalars().all()
        assert len(depts) == 5, f"Expected 5 departments, got {len(depts)}"
        dept_names = [d.name for d in depts]
        assert "Network Operations" in dept_names, "Missing Network Operations department"
        print(f"   ✅ 5 Enterprise Departments verified: {', '.join(dept_names)}")

        roles_res = await session.execute(
            select(models.CustomRole).where(models.CustomRole.tenant_id == test_tenant_id)
        )
        roles = roles_res.scalars().all()
        assert len(roles) >= 5, f"Expected at least 5 roles, got {len(roles)}"
        print(f"   ✅ Enterprise Roles seeded: {', '.join([r.role_name for r in roles])}")

        # ---------------------------------------------------------
        # TEST 3: HR Provisioning Employee (Method 2: Credential Slip)
        # ---------------------------------------------------------
        print("\n🔹 [Step 3] HR Provisioning Senior RF Engineer with Credential Slip...")
        admin_user_res = await session.execute(
            select(models.User).where(models.User.email == "marcus.vance@apextelco.com")
        )
        admin_user = admin_user_res.scalar_one()

        emp_req = EmployeeProvisionRequest(
            first_name="Elena",
            last_name="Rostova",
            work_email="elena.rostova@apextelco.com",
            department="Network Operations",
            role="SeniorEngineer",
            job_title="Lead Radio Frequency & Cell Tower Specialist",
            clearance_level="Restricted",
            manager_id=admin_user.id,
            custom_password=None # Test auto-generated secure temporary password
        )

        emp_res = await provision_employee(emp_req, admin_user, session)
        assert emp_res.employee_number == "EMP-0002", f"Expected EMP-0002, got {emp_res.employee_number}"
        assert emp_res.work_email == "elena.rostova@apextelco.com"
        assert len(emp_res.temporary_password) >= 8, "Temporary password too short"
        assert emp_res.manager_id == admin_user.id, "Manager ID not linked"
        print(f"   ✅ Provisioned Employee: {emp_res.first_name} {emp_res.last_name}")
        print(f"   ✅ Issued Employee Number: {emp_res.employee_number}")
        print(f"   ✅ Temporary Credential Slip Password: {emp_res.temporary_password}")
        print(f"   ✅ Reporting Manager ID: {emp_res.manager_id}")

        # ---------------------------------------------------------
        # TEST 4: Authenticate with Provisioned Credentials
        # ---------------------------------------------------------
        print("\n🔹 [Step 4] Verifying Employee Authentication with Credential Slip...")
        new_emp_db_res = await session.execute(
            select(models.User).where(models.User.email == "elena.rostova@apextelco.com")
        )
        new_emp_db = new_emp_db_res.scalar_one()
        assert verify_password(emp_res.temporary_password, new_emp_db.password_hash) is True, "Password verification failed"
        assert new_emp_db.is_temporary_password is True, "Flag is_temporary_password should be True"
        print("   ✅ Password hash verified against issued temporary credential slip!")

        # ---------------------------------------------------------
        # TEST 5: Strict Multi-Tenant Isolation
        # ---------------------------------------------------------
        print("\n🔹 [Step 5] Testing Multi-Tenant Boundary Isolation...")
        # Setup Company B
        setup_b = CompanySetupRequest(
            company_name="Globex Tech Systems",
            tenant_id=test_tenant_b,
            industry="Technology",
            admin_name="Hank Scorpio",
            admin_email="hank@globex.com",
            admin_password="GlobexPassword@123",
            initial_departments=["Engineering", "Operations"]
        )
        await setup_company_tenant(setup_b, session)

        admin_b_res = await session.execute(
            select(models.User).where(models.User.email == "hank@globex.com")
        )
        admin_b = admin_b_res.scalar_one()

        # Admin B queries employee list
        b_employees = await list_employees(admin_b, session)
        # Should only see Globex employees (just Hank), never Apex employees (Marcus or Elena)
        b_emails = [e.work_email for e in b_employees]
        assert "elena.rostova@apextelco.com" not in b_emails, "DATA LEAKAGE: Tenant B saw Tenant A employee!"
        assert "marcus.vance@apextelco.com" not in b_emails, "DATA LEAKAGE: Tenant B saw Tenant A admin!"
        print(f"   ✅ Tenant B employee list count: {len(b_employees)} (Contains only: {b_emails})")
        print("   ✅ Zero cross-tenant data leakage verified across organizational boundaries!")

        # Clean up test tenants
        await session.execute(delete(models.AuditLog).where(models.AuditLog.tenant_id.in_([test_tenant_id, test_tenant_b])))
        await session.execute(delete(models.User).where(models.User.tenant_id.in_([test_tenant_id, test_tenant_b])))
        await session.execute(delete(models.Department).where(models.Department.tenant_id.in_([test_tenant_id, test_tenant_b])))
        await session.execute(delete(models.CustomRole).where(models.CustomRole.tenant_id.in_([test_tenant_id, test_tenant_b])))
        await session.execute(delete(models.CompanyTenant).where(models.CompanyTenant.tenant_id.in_([test_tenant_id, test_tenant_b])))
        await session.commit()

    print("\n" + "=" * 80)
    print("🎉 ALL SESSION 10 BACKEND TESTS PASSED WITH 100% SUCCESS!")
    print("=" * 80)


if __name__ == "__main__":
    asyncio.run(run_tenant_provisioning_tests())
