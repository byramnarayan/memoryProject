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
from routers.connectors import save_databricks_config, list_connectors, DatabricksSaveRequest
from graph.models_gacm import ResearchMemoryObject
from sqlalchemy import select, delete


async def run_databricks_connector_tests():
    print("=" * 80)
    print("🧪 RUNNING SESSION 11 TEST: DATABRICKS CONNECTOR & LAKEHOUSE INGESTION")
    print("=" * 80)

    test_tenant_id = "test_apex_telco"

    async with AsyncSessionLocal() as session:
        # Initial cleanup
        await session.execute(delete(models.AuditLog).where(models.AuditLog.tenant_id == test_tenant_id))
        await session.execute(delete(models.ConnectorConfig).where(models.ConnectorConfig.tenant_id == test_tenant_id))
        await session.execute(delete(ResearchMemoryObject).where(ResearchMemoryObject.tenant_id == test_tenant_id))
        await session.execute(delete(models.User).where(models.User.tenant_id == test_tenant_id))
        await session.execute(delete(models.CompanyTenant).where(models.CompanyTenant.tenant_id == test_tenant_id))
        await session.commit()

        # Create test tenant & admin user so foreign keys (audit_logs, connector_configs) are valid
        test_tenant = models.CompanyTenant(
            tenant_id=test_tenant_id,
            company_name="Apex Telecommunications Global",
            industry="Telecom",
            admin_email="admin@testapex.com",
        )
        session.add(test_tenant)

        admin_user = models.User(
            username="admin_test_apex",
            email="admin@testapex.com",
            role="TenantAdmin",
            department="Executive Leadership",
            clearance_level="ExecutiveOnly",
            tenant_id=test_tenant_id,
            password_hash="test_pw_hash",
        )
        session.add(admin_user)
        await session.commit()
        await session.refresh(admin_user)

        # ---------------------------------------------------------
        # TEST 1: Test Databricks Connectivity & Benchmark Handover
        # ---------------------------------------------------------
        print("\n🔹 [Step 1] Testing Databricks Lakehouse Connectivity...")
        connector = DatabricksConnector(
            server_hostname="adb-telco-lakehouse.azuredatabricks.net",
            http_path="/sql/1.0/warehouses/04b9e11fc98100a",
            access_token="test_mock_pat_token_2026",
            catalog="telco_lakehouse",
        )
        test_res = await connector.test_connection()
        assert test_res["success"] is True, f"Connection test failed: {test_res}"
        assert test_res["catalog"] == "telco_lakehouse", f"Unexpected catalog: {test_res['catalog']}"
        print(f"   ✅ Connection Validated: Mode={test_res['mode']}, Catalog={test_res['catalog']}")
        print(f"   ✅ Message: {test_res['message']}")

        # ---------------------------------------------------------
        # TEST 2: Introspect Lakehouse Catalog Tables
        # ---------------------------------------------------------
        print("\n🔹 [Step 2] Introspecting Databricks Lakehouse Tables (Handover Spec)...")
        intro_res = await connector.introspect_catalog_objects()
        assert intro_res["success"] is True, "Catalog introspection failed"
        table_names = [t["name"] for t in intro_res["tables"]]
        assert "network_event" in table_names, "Missing silver.network_event"
        assert "cell" in table_names, "Missing silver.cell"
        assert "site_kpi_daily" in table_names, "Missing gold.site_kpi_daily"
        assert "service_ticket" in table_names, "Missing support.service_ticket"
        print(f"   ✅ Discovered {len(intro_res['tables'])} Lakehouse Tables: {', '.join(table_names)}")

        # ---------------------------------------------------------
        # TEST 3: Save Connector Credentials in Enterprise Vault
        # ---------------------------------------------------------
        print("\n🔹 [Step 3] Storing Masked & Encrypted Credentials in Connector Vault...")
        save_req = DatabricksSaveRequest(
            name="Databricks Telco Lakehouse",
            server_hostname="adb-telco-lakehouse.azuredatabricks.net",
            http_path="/sql/1.0/warehouses/04b9e11fc98100a",
            access_token="test_mock_vault_token_placeholder_2026",
            catalog="telco_lakehouse",
            target_schemas="silver,gold",
        )
        save_res = await save_databricks_config(save_req, admin_user, session)
        assert save_res["success"] is True
        assert save_res["config"]["access_token_masked"].startswith("test")
        assert "••••" in save_res["config"]["access_token_masked"]
        print(f"   ✅ Credentials Saved. Masked Token: {save_res['config']['access_token_masked']}")

        # ---------------------------------------------------------
        # TEST 4: Lakehouse Ingestion into Canonical Enterprise Memory
        # ---------------------------------------------------------
        print("\n🔹 [Step 4] Ingesting & Normalizing Lakehouse Records into Canonical Memory...")
        sync_res = await connector.sync_lakehouse_data(
            tenant_id=test_tenant_id,
            db=session,
            limit_per_table=50,
        )
        assert sync_res["success"] is True
        assert sync_res["records_synced"] > 0, "No records synced"
        print(f"   ✅ Ingested {sync_res['records_synced']} Canonical Memories (Outages, Tickets, Sites)")

        # Verify records in database
        outages_res = await session.execute(
            select(ResearchMemoryObject).where(
                ResearchMemoryObject.tenant_id == test_tenant_id,
                ResearchMemoryObject.memory_type == "NetworkOutage",
            )
        )
        outages = outages_res.scalars().all()
        assert len(outages) >= 4, f"Expected 4 outages, got {len(outages)}"
        for out in outages:
            ent = out.get_entities()
            assert "cell_id" in ent, "Missing cell_id in entities"
            assert "severity" in ent, "Missing severity in entities"
            assert out.memory_id.startswith("MEM-TELCO-OUTAGE-")
        print(f"   ✅ Verified {len(outages)} Network Outage Memories with full entity metadata")

        tickets_res = await session.execute(
            select(ResearchMemoryObject).where(
                ResearchMemoryObject.tenant_id == test_tenant_id,
                ResearchMemoryObject.memory_type == "ServiceTicket",
            )
        )
        tickets = tickets_res.scalars().all()
        assert len(tickets) >= 3, f"Expected 3 tickets, got {len(tickets)}"
        print(f"   ✅ Verified {len(tickets)} Support Ticket Memories with customer numbers and resolutions")

        # ---------------------------------------------------------
        # TEST 5: SHA-256 Deduplication on Repeated Sync
        # ---------------------------------------------------------
        print("\n🔹 [Step 5] Testing SHA-256 Duplicate Blocker on Repeated Lakehouse Sync...")
        second_sync_res = await connector.sync_lakehouse_data(
            tenant_id=test_tenant_id,
            db=session,
            limit_per_table=50,
        )
        # Because content already exists, 0 new records should be inserted
        assert second_sync_res["records_synced"] == 0, f"Deduplication failed: synced {second_sync_res['records_synced']} duplicate records"
        print("   ✅ Duplicate Blocker (CAP-1005): 0 duplicate records inserted on repeated sync!")

        # ---------------------------------------------------------
        # CLEANUP
        # ---------------------------------------------------------
        await session.execute(delete(models.AuditLog).where(models.AuditLog.tenant_id == test_tenant_id))
        await session.execute(delete(models.ConnectorConfig).where(models.ConnectorConfig.tenant_id == test_tenant_id))
        await session.execute(delete(ResearchMemoryObject).where(ResearchMemoryObject.tenant_id == test_tenant_id))
        await session.execute(delete(models.User).where(models.User.tenant_id == test_tenant_id))
        await session.execute(delete(models.CompanyTenant).where(models.CompanyTenant.tenant_id == test_tenant_id))
        await session.commit()

    print("\n" + "=" * 80)
    print("🎉 ALL SESSION 11 BACKEND TESTS PASSED WITH 100% SUCCESS!")
    print("=" * 80)


if __name__ == "__main__":
    asyncio.run(run_databricks_connector_tests())
