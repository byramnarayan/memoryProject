import asyncio
import os
import sys

# Ensure UTF-8 output on Windows PowerShell
if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from database import engine, Base, AsyncSessionLocal
import models  # loads EmployeeDailyLog


async def migrate_employee_logs_schema():
    print("=" * 80)
    print("🔄 RUNNING EMPLOYEE DAILY LOG & INTUITION SCHEMA MIGRATION")
    print("=" * 80)

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    print("✅ Created 'employee_daily_logs' table in PostgreSQL if absent.")

    print("=" * 80)
    print("🎉 EMPLOYEE LOG SCHEMA MIGRATION COMPLETED SUCCESSFULLY!")
    print("=" * 80)


if __name__ == "__main__":
    asyncio.run(migrate_employee_logs_schema())
