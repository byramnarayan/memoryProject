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
from graph.models_gacm import ResearchMemoryObject
from routers.employee_logs import (
    CreateLogRequest,
    create_employee_log,
    list_employee_logs,
    get_logs_summary,
    get_log_detail,
)
from services.log_enrichment_service import enrich_employee_log, sync_log_to_neo4j
from sqlalchemy import select, delete


async def run_employee_logs_tests():
    print("=" * 80)
    print("🧪 RUNNING SESSION 12 TEST: EMPLOYEE DAILY LOG & INTUITION CAPTURE")
    print("=" * 80)

    test_tenant_id = "test_apex_telco_logs"

    async with AsyncSessionLocal() as session:
        # Initial cleanup
        await session.execute(delete(models.AuditLog).where(models.AuditLog.tenant_id == test_tenant_id))
        await session.execute(delete(models.EmployeeDailyLog).where(models.EmployeeDailyLog.tenant_id == test_tenant_id))
        await session.execute(delete(ResearchMemoryObject).where(ResearchMemoryObject.tenant_id == test_tenant_id))
        await session.execute(delete(models.User).where(models.User.tenant_id == test_tenant_id))
        await session.execute(delete(models.CompanyTenant).where(models.CompanyTenant.tenant_id == test_tenant_id))
        await session.commit()

        # ---------------------------------------------------------
        # Setup: Create Test Tenant & Senior RF Engineer User
        # ---------------------------------------------------------
        print("\n🔹 [Setup] Registering Test Company & Senior RF Engineer Account...")
        tenant = models.CompanyTenant(
            tenant_id=test_tenant_id,
            company_name="Apex Global Communications",
            industry="Telecom",
            admin_email="admin@apexcomm.com",
        )
        session.add(tenant)

        engineer = models.User(
            username="arjun_rf_lead",
            email="arjun.nair@apexcomm.com",
            first_name="Arjun",
            last_name="Nair",
            role="SeniorEngineer",
            employee_number="EMP-0142",
            department="Radio Frequency Engineering",
            job_title="Lead RF Optimization Engineer",
            clearance_level="Confidential",
            tenant_id=test_tenant_id,
            password_hash="test_pw_hash",
        )
        session.add(engineer)
        await session.commit()
        await session.refresh(engineer)
        print(f"   ✅ User initialized: {engineer.first_name} {engineer.last_name} ({engineer.employee_number})")

        # ---------------------------------------------------------
        # TEST 1: Semantic AI Enrichment Engine
        # ---------------------------------------------------------
        print("\n🔹 [Step 1] Testing Semantic AI Enrichment & Heuristic Fallback Engine...")
        enrichment = enrich_employee_log(
            title="Rerouted MUM-0001-B3 traffic via Sector 2 after optical fiber surge",
            decision_summary="Applied carrier traffic reroute from Sector 3 (B3) to Sector 2 with a 4dB electrical downtilt offset to mitigate severe call drops.",
            trade_offs="Rejected taking tower offline because customer SLA penalty would exceed $15,000 during business peak hours.",
            incident_ref="EVT-2026-000842",
            impacted_system="CELL-MUM-0001-B3",
            intuition_notes="Vendor firmware v3.2 exhibits a 45-minute watchdog reboot loop under optical reflections; temporary tilt prevents cross-talk until fiber re-splice.",
        )
        assert "primary_domain" in enrichment, "Missing primary_domain in enrichment"
        assert "impacted_kpis" in enrichment, "Missing impacted_kpis in enrichment"
        assert len(enrichment["impacted_kpis"]) > 0, "No impacted KPIs detected"
        print(f"   ✅ Primary Domain: {enrichment['primary_domain']}")
        print(f"   ✅ Detected Decision Category: {enrichment['decision_category']}")
        print(f"   ✅ Impacted KPIs: {', '.join(enrichment['impacted_kpis'])}")
        print(f"   ✅ Tacit Intuition Tags: {enrichment.get('intuition_tags', [])}")

        # ---------------------------------------------------------
        # TEST 2: Create Operational Decision Log (End-to-End API)
        # ---------------------------------------------------------
        print("\n🔹 [Step 2] Executing POST /api/logs: Saving Operational Decision & Workaround...")
        log_req = CreateLogRequest(
            title="Rerouted MUM-0001-B3 traffic via Sector 2 after optical fiber surge",
            decision_summary="Applied carrier traffic reroute from Sector 3 (B3) to Sector 2 with a 4dB electrical downtilt offset to mitigate severe call drops.",
            trade_offs_considered="Rejected taking tower offline because customer SLA penalty would exceed $15,000 during business peak hours.",
            incident_or_ticket_ref="EVT-2026-000842",
            impacted_system_or_cell="CELL-MUM-0001-B3",
            intuition_notes="Vendor firmware v3.2 exhibits a 45-minute watchdog reboot loop under optical reflections; temporary tilt prevents cross-talk until fiber re-splice.",
            decision_category="Workaround",
            urgency_level="High",
        )
        create_res = await create_employee_log(log_req, engineer, session)
        assert create_res["success"] is True, f"Failed to create log: {create_res}"
        log_data = create_res["log"]
        log_id = log_data["id"]
        assert log_data["canonical_memory_id"] is not None, "Missing canonical_memory_id"
        print(f"   ✅ Successfully Logged Decision ID: DEC-{log_id:06d}")
        print(f"   ✅ Canonical Memory ID: {log_data['canonical_memory_id']}")
        print(f"   ✅ Author: {log_data['author']['name']} [{log_data['author']['employee_number']}]")

        # ---------------------------------------------------------
        # TEST 3: Verify Canonical Enterprise Memory Object
        # ---------------------------------------------------------
        print("\n🔹 [Step 3] Verifying Canonical Memory Extraction & Search Indexing...")
        mem_res = await session.execute(
            select(ResearchMemoryObject).where(
                ResearchMemoryObject.tenant_id == test_tenant_id,
                ResearchMemoryObject.memory_type == "EmployeeDecision",
            )
        )
        mem_obj = mem_res.scalar_one_or_none()
        assert mem_obj is not None, "Canonical Memory Object was not inserted"
        assert mem_obj.content_hash is not None, "Missing content_hash"
        entities = mem_obj.get_entities()
        assert entities.get("author") == engineer.username
        assert entities.get("impacted_system") == "CELL-MUM-0001-B3"
        print(f"   ✅ Canonical Memory Verified: {mem_obj.memory_id} (Hash: {mem_obj.content_hash[:16]}...)")
        print(f"   ✅ Entities Verified: Impacted System={entities.get('impacted_system')}, Category={entities.get('category')}")

        # ---------------------------------------------------------
        # TEST 4: Query Decision Feed with Filters & Search
        # ---------------------------------------------------------
        print("\n🔹 [Step 4] Querying GET /api/logs with Category Filter & Full-Text Search...")
        feed_items = await list_employee_logs(
            current_user=engineer,
            db=session,
            category="Workaround",
            search="watchdog",
            my_logs_only=False,
            limit=10,
            offset=0,
        )
        assert len(feed_items) == 1, f"Expected 1 matching log, got {len(feed_items)}"
        assert feed_items[0]["id"] == log_id
        assert feed_items[0]["intuition_notes"] is not None
        print(f"   ✅ Search match verified: Found log DEC-{log_id:06d} matching keyword 'watchdog'")

        # ---------------------------------------------------------
        # TEST 5: Aggregated Telemetry Summary & KPI Statistics
        # ---------------------------------------------------------
        print("\n🔹 [Step 5] Checking Aggregated Telemetry & Subsystem Impact Summary...")
        summary_stats = await get_logs_summary(current_user=engineer, db=session)
        assert summary_stats["total_decisions"] >= 1
        assert summary_stats["active_contributors"] >= 1
        assert summary_stats["category_breakdown"].get("Workaround") == 1
        top_cells = [s["name"] for s in summary_stats["top_impacted_systems"]]
        assert "CELL-MUM-0001-B3" in top_cells
        print(f"   ✅ Total Decisions: {summary_stats['total_decisions']}")
        print(f"   ✅ Active Contributors: {summary_stats['active_contributors']}")
        print(f"   ✅ Category Breakdown: {summary_stats['category_breakdown']}")
        print(f"   ✅ Top Impacted Subsystems: {top_cells}")

        # ---------------------------------------------------------
        # CLEANUP
        # ---------------------------------------------------------
        await session.execute(delete(models.AuditLog).where(models.AuditLog.tenant_id == test_tenant_id))
        await session.execute(delete(models.EmployeeDailyLog).where(models.EmployeeDailyLog.tenant_id == test_tenant_id))
        await session.execute(delete(ResearchMemoryObject).where(ResearchMemoryObject.tenant_id == test_tenant_id))
        await session.execute(delete(models.User).where(models.User.tenant_id == test_tenant_id))
        await session.execute(delete(models.CompanyTenant).where(models.CompanyTenant.tenant_id == test_tenant_id))
        await session.commit()

    print("\n" + "=" * 80)
    print("🎉 ALL SESSION 12 BACKEND TESTS PASSED WITH 100% SUCCESS!")
    print("=" * 80)


if __name__ == "__main__":
    asyncio.run(run_employee_logs_tests())
