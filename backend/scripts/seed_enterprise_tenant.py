import asyncio
import sys
from pathlib import Path

# Add backend directory to path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from datetime import UTC, datetime
from database import AsyncSessionLocal
from sqlalchemy import select, func
import models
from auth import hash_password

async def seed():
    async with AsyncSessionLocal() as db:
        print("Checking TelcoSphere tenant...")
        res = await db.execute(
            select(models.CompanyTenant).where(
                func.lower(models.CompanyTenant.tenant_id) == "telcosphere"
            )
        )
        tenant = res.scalar_one_or_none()
        if not tenant:
            tenant = models.CompanyTenant(
                tenant_id="telcosphere",
                company_name="TelcoSphere Communications",
                industry="Telecommunications",
                plan_tier="Enterprise",
                admin_email="admin@telcosphere.com",
            )
            tenant.set_settings({
                "theme": "enterprise",
                "allow_remote_logs": True,
                "default_clearance": "Internal",
                "industry": "Telecommunications",
            })
            db.add(tenant)
            await db.flush()
            print("Created TelcoSphere tenant.")

        # Departments
        depts = [
            ("Radio Frequency Engineering", "RF_ENG"),
            ("Network Operations", "NET_OPS"),
            ("Billing and Revenue", "BILL_REV"),
            ("Customer Experience", "CUST_EXP"),
            ("Executive Leadership", "EXEC_LEAD"),
        ]
        for name, code in depts:
            d_res = await db.execute(
                select(models.Department).where(
                    models.Department.tenant_id == "telcosphere",
                    models.Department.code == code,
                )
            )
            if not d_res.scalar_one_or_none():
                db.add(models.Department(
                    tenant_id="telcosphere",
                    name=name,
                    code=code,
                    description=f"{name} division of TelcoSphere",
                ))
        await db.flush()

        # Users
        demo_users = [
            {
                "username": "admin_telcosphere",
                "email": "admin@telcosphere.com",
                "password": hash_password("Admin@123"),
                "first_name": "Vikram",
                "last_name": "Malhotra",
                "role": "TenantAdmin",
                "department": "Executive Leadership",
                "clearance_level": "ExecutiveOnly",
                "job_title": "VP of Operations & Infrastructure",
                "employee_number": "EMP-0001",
            },
            {
                "username": "arjun_nair",
                "email": "arjun.nair@telcosphere.com",
                "password": hash_password("Engineer@123"),
                "first_name": "Arjun",
                "last_name": "Nair",
                "role": "SeniorEngineer",
                "department": "Radio Frequency Engineering",
                "clearance_level": "Confidential",
                "job_title": "Lead RF Optimization Engineer",
                "employee_number": "EMP-0142",
            },
            {
                "username": "priya_patel",
                "email": "priya.patel@telcosphere.com",
                "password": hash_password("Engineer@123"),
                "first_name": "Priya",
                "last_name": "Patel",
                "role": "Employee",
                "department": "Network Operations",
                "clearance_level": "Internal",
                "job_title": "NOC Tier-2 Escalation Specialist",
                "employee_number": "EMP-0285",
            },
            {
                "username": "auditor_telco",
                "email": "auditor@telcosphere.com",
                "password": hash_password("Auditor@123"),
                "first_name": "Aisha",
                "last_name": "Khan",
                "role": "Auditor",
                "department": "Executive Leadership",
                "clearance_level": "ExecutiveOnly",
                "job_title": "Enterprise Security & Compliance Auditor",
                "employee_number": "EMP-0099",
            },
        ]

        for u in demo_users:
            u_res = await db.execute(
                select(models.User).where(func.lower(models.User.email) == u["email"].lower())
            )
            if not u_res.scalar_one_or_none():
                user_obj = models.User(
                    username=u["username"],
                    email=u["email"].lower(),
                    password_hash=u["password"],
                    role=u["role"],
                    department=u["department"],
                    clearance_level=u["clearance_level"],
                    tenant_id="telcosphere",
                    first_name=u["first_name"],
                    last_name=u["last_name"],
                    employee_number=u["employee_number"],
                    job_title=u["job_title"],
                    status="Active",
                    hire_date=datetime.now(UTC),
                )
                db.add(user_obj)
                print(f"Created user: {u['email']}")

        await db.commit()
        print("TelcoSphere seeding complete!")

if __name__ == "__main__":
    asyncio.run(seed())
