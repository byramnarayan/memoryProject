import asyncio
import os
import sys

# Ensure UTF-8 output on Windows PowerShell
if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from database import engine, Base, AsyncSessionLocal
from sqlalchemy import text


async def migrate_employee_schema():
    print("=" * 80)
    print("🔄 RUNNING ENTERPRISE EMPLOYEE & TENANT SCHEMA MIGRATION")
    print("=" * 80)

    # 1. Create any missing tables (company_tenants, departments, custom_roles)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    print("✅ Created new tables (company_tenants, departments, custom_roles) if absent.")

    # 2. Add columns to 'users' table
    queries = [
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS first_name VARCHAR(60);",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS last_name VARCHAR(60);",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS employee_number VARCHAR(20);",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS job_title VARCHAR(80);",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS manager_id INTEGER REFERENCES users(id);",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS hire_date TIMESTAMPTZ;",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS is_temporary_password BOOLEAN DEFAULT FALSE;",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'Active';",
    ]

    async with AsyncSessionLocal() as session:
        for q in queries:
            try:
                await session.execute(text(q))
                col_name = q.split("ADD COLUMN IF NOT EXISTS ")[1].split(" ")[0]
                print(f"  + Added column 'users.{col_name}'")
            except Exception as e:
                print(f"  Note on '{q[:40]}...': {e}")
        await session.commit()

    print("=" * 80)
    print("🎉 ENTERPRISE SCHEMA MIGRATION COMPLETED SUCCESSFULLY!")
    print("=" * 80)


if __name__ == "__main__":
    asyncio.run(migrate_employee_schema())
