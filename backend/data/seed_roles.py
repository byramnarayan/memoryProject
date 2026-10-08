import asyncio
import os
import sys
import logging
from pwdlib import PasswordHash
from sqlalchemy import text, select

# Ensure project root is in PYTHONPATH
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from database import engine, Base, AsyncSessionLocal
import models

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("seed_roles")

password_hash_mgr = PasswordHash.recommended()

DEMO_USERS = [
    {
        "username": "admin_utc",
        "email": "admin@utc.edu",
        "password": "Admin@123",
        "role": "TenantAdmin",
        "department": "University Administration",
        "clearance_level": "HighlyConfidential",
        "tenant_id": "utc_campus"
    },
    {
        "username": "chair_cs",
        "email": "chair.cs@utc.edu",
        "password": "DeptChair@123",
        "role": "DeptAdmin",
        "department": "Computer Science & Engineering",
        "clearance_level": "Confidential",
        "tenant_id": "utc_campus"
    },
    {
        "username": "researcher_elena",
        "email": "researcher@utc.edu",
        "password": "Research@123",
        "role": "Researcher",
        "department": "Mechanical & Aerospace Engineering",
        "clearance_level": "Internal",
        "tenant_id": "utc_campus"
    },
    {
        "username": "auditor_irb",
        "email": "auditor@utc.edu",
        "password": "Audit@123",
        "role": "Auditor",
        "department": "Research Integrity & Compliance",
        "clearance_level": "HighlyConfidential",
        "tenant_id": "utc_campus"
    }
]

async def migrate_and_seed_roles():
    logger.info("Migrating schema & adding university governance columns...")
    
    # 1. Add columns to users table safely if not exists
    async with AsyncSessionLocal() as session:
        await session.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(50) DEFAULT 'TenantAdmin';"))
        await session.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS department VARCHAR(100) DEFAULT 'Research Division';"))
        await session.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS clearance_level VARCHAR(50) DEFAULT 'HighlyConfidential';"))
        await session.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(50) DEFAULT 'utc_campus';"))
        
        # Grandfather existing user #1 as TenantAdmin with HighlyConfidential clearance
        await session.execute(text("""
            UPDATE users 
            SET role = 'TenantAdmin', 
                clearance_level = 'HighlyConfidential', 
                department = 'Research Administration',
                tenant_id = 'utc_campus'
            WHERE id = 1;
        """))
        await session.commit()
        logger.info("Successfully ensured user table governance columns & updated user #1.")

    # 2. Create audit_logs table via Base.metadata
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    logger.info("Audit logs table verified in PostgreSQL.")

    # 3. Seed institutional role accounts
    async with AsyncSessionLocal() as session:
        for udata in DEMO_USERS:
            res = await session.execute(
                select(models.User).where(models.User.email == udata["email"])
            )
            existing = res.scalars().first()
            if existing:
                existing.role = udata["role"]
                existing.department = udata["department"]
                existing.clearance_level = udata["clearance_level"]
                existing.tenant_id = udata["tenant_id"]
                existing.password_hash = password_hash_mgr.hash(udata["password"])
                logger.info(f"Updated existing demo user: {udata['email']} -> Role: {udata['role']}")
            else:
                new_u = models.User(
                    username=udata["username"],
                    email=udata["email"],
                    password_hash=password_hash_mgr.hash(udata["password"]),
                    role=udata["role"],
                    department=udata["department"],
                    clearance_level=udata["clearance_level"],
                    tenant_id=udata["tenant_id"]
                )
                session.add(new_u)
                logger.info(f"Created new demo user: {udata['email']} -> Role: {udata['role']}")

        await session.commit()

    # 4. Verify user list
    async with AsyncSessionLocal() as session:
        res = await session.execute(select(models.User.id, models.User.username, models.User.email, models.User.role, models.User.clearance_level, models.User.department))
        all_users = res.fetchall()
        logger.info("==================================================================")
        logger.info("ACTIVE INSTITUTIONAL USERS & ROLES IN POSTGRESQL:")
        for u in all_users:
            logger.info(f"  ID: {u[0]} | {u[1]:<18} | {u[2]:<25} | Role: {u[3]:<12} | Clearance: {u[4]:<18} | Dept: {u[5]}")
        logger.info("==================================================================")

if __name__ == "__main__":
    asyncio.run(migrate_and_seed_roles())
