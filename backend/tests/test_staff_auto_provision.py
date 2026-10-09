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
from connectors.databricks_connector import DatabricksConnector
from routers.employees import get_credential_vault, mark_credential_delivered
from sqlalchemy import select, delete
from fastapi import HTTPException


async def run_staff_auto_provision_tests():
    print("=" * 80)
    print("🧪 RUNNING SESSION 15 TEST: DATASOURCE STAFF AUTO-PROVISIONING & CREDENTIAL VAULT")
    print("=" * 80)

    # 1. Ensure tables exist in database
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    test_tenant_id = "test_autotelco"

    async with AsyncSessionLocal() as session:
        # Cleanup any previous test runs
        await session.execute(delete(models.CredentialVaultItem).where(models.CredentialVaultItem.tenant_id == test_tenant_id))
        await session.execute(delete(models.AuditLog).where(models.AuditLog.tenant_id == test_tenant_id))
        await session.execute(delete(models.User).where(models.User.tenant_id == test_tenant_id))
        await session.execute(delete(models.Department).where(models.Department.tenant_id == test_tenant_id))
        await session.execute(delete(models.CompanyTenant).where(models.CompanyTenant.tenant_id == test_tenant_id))
        await session.commit()

        # Create Tenant
        tenant = models.CompanyTenant(
            tenant_id=test_tenant_id,
            company_name="AutoTelco Global",
            industry="Telecommunications",
            admin_email=f"admin@{test_tenant_id}.com",
        )
        session.add(tenant)

        # Create Admin
        admin_user = models.User(
            username=f"admin_{test_tenant_id}",
            email=f"admin@{test_tenant_id}.com",
            password_hash="testhash123",
            role="TenantAdmin",
            department="Executive Operations",
            clearance_level="HighlyConfidential",
            tenant_id=test_tenant_id,
            first_name="Admin",
            last_name="Owner",
            status="Active"
        )
        session.add(admin_user)
        await session.commit()
        await session.refresh(admin_user)

        # ---------------------------------------------------------
        # TEST 1: Sync Lakehouse Data & Verify Auto-Provisioning
        # ---------------------------------------------------------
        print("\n🔹 [Step 1] Triggering Lakehouse Sync with Databricks Connector...")
        connector = DatabricksConnector(catalog="telco_lakehouse")
        sync_result = await connector.sync_lakehouse_data(tenant_id=test_tenant_id, db=session)

        print(f"   Sync Result: {sync_result}")
        assert sync_result["success"] is True, "Sync must succeed."
        assert sync_result["staff_auto_provisioned"] >= 5, f"Expected at least 5 staff auto-provisioned, got {sync_result['staff_auto_provisioned']}"
        print(f"   ✅ Successfully auto-provisioned {sync_result['staff_auto_provisioned']} staff accounts!")

        # ---------------------------------------------------------
        # TEST 2: Verify PostgreSQL User Records & Reporting Lines
        # ---------------------------------------------------------
        print("\n🔹 [Step 2] Verifying Created User Accounts in Database...")
        users_res = await session.execute(
            select(models.User).where(models.User.tenant_id == test_tenant_id)
        )
        users = users_res.scalars().all()
        user_by_emp = {u.employee_number: u for u in users if u.employee_number}

        print(f"   Found {len(users)} users in tenant '{test_tenant_id}'.")
        assert "EMP-0001" in user_by_emp, "EMP-0001 (Priya Patel) must exist."
        assert "EMP-0002" in user_by_emp, "EMP-0002 (Arjun Nair) must exist."
        assert "EMP-0003" in user_by_emp, "EMP-0003 (Vikram Malhotra) must exist."

        emp1 = user_by_emp["EMP-0001"]
        emp2 = user_by_emp["EMP-0002"]
        print(f"   EMP-0001: {emp1.first_name} {emp1.last_name} ({emp1.role}, {emp1.department})")
        print(f"   EMP-0002: {emp2.first_name} {emp2.last_name} ({emp2.role}, {emp2.department})")
        assert emp1.manager_id == emp2.id, "EMP-0001 must report to manager EMP-0002."
        print(f"   ✅ Hierarchy verified: {emp1.first_name} reports to {emp2.first_name}.")

        # ---------------------------------------------------------
        # TEST 3: Verify Credential Vault Records
        # ---------------------------------------------------------
        print("\n🔹 [Step 3] Verifying Credential Vault Records...")
        vault_res = await session.execute(
            select(models.CredentialVaultItem).where(models.CredentialVaultItem.tenant_id == test_tenant_id)
        )
        vault_items = vault_res.scalars().all()
        print(f"   Found {len(vault_items)} credential vault entries.")
        assert len(vault_items) >= 5, "Expected at least 5 vault entries."

        for v in vault_items:
            assert v.handout_status == "Pending Handout", "New credentials must be 'Pending Handout'."
            assert len(v.temporary_password) >= 8, "Temporary password must be valid."
            print(f"   🔑 Vault Entry: {v.employee_number} | {v.full_name} | {v.work_email} | Password: {v.temporary_password} | Status: {v.handout_status}")
        print("   ✅ Credential Vault populated correctly!")

        # ---------------------------------------------------------
        # TEST 4: Test RBAC Protection on Credential Vault Endpoint
        # ---------------------------------------------------------
        print("\n🔹 [Step 4] Testing Role-Based Access Control on Vault Endpoint...")
        # Admin request: Allowed
        admin_vault = await get_credential_vault(current_user=admin_user, db=session)
        assert len(admin_vault) >= 5, "Admin must be able to view all vault entries."
        print(f"   ✅ TenantAdmin successfully accessed vault ({len(admin_vault)} items).")

        # Regular employee request: Must be Rejected with 403 Forbidden
        regular_emp = emp1
        try:
            await get_credential_vault(current_user=regular_emp, db=session)
            assert False, "Regular employee must NOT be allowed to access HR Credential Vault!"
        except HTTPException as e:
            assert e.status_code == 403, f"Expected 403 Forbidden, got {e.status_code}"
            print(f"   ✅ Regular Employee correctly blocked with HTTP 403: {e.detail}")

        # ---------------------------------------------------------
        # TEST 5: Mark Credential as Delivered
        # ---------------------------------------------------------
        print("\n🔹 [Step 5] Marking Credential as Delivered...")
        first_vault_id = vault_items[0].id
        deliv_res = await mark_credential_delivered(vault_id=first_vault_id, current_user=admin_user, db=session)
        assert deliv_res["handout_status"] == "Delivered", "Handout status must be Delivered."

        updated_vault = await session.execute(
            select(models.CredentialVaultItem).where(models.CredentialVaultItem.id == first_vault_id)
        )
        item = updated_vault.scalar_one()
        assert item.handout_status == "Delivered", "Database status must be updated."
        assert item.delivered_at is not None, "delivered_at timestamp must be set."
        print(f"   ✅ Successfully marked credential for {item.full_name} as Delivered!")

        print("\n" + "=" * 80)
        print("🎉 ALL SESSION 15 ACCEPTANCE TESTS PASSED SUCCESSFULLY!")
        print("=" * 80)


if __name__ == "__main__":
    asyncio.run(run_staff_auto_provision_tests())
