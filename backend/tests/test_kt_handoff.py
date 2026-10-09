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
from routers.kt_handoff import (
    CreateKTAssignmentRequest,
    UpdateChecklistItemRequest,
    AskPredecessorRequest,
    create_kt_assignment,
    list_kt_assignments,
    get_kt_assignment_detail,
    update_checklist_item,
    sign_off_kt_session,
    ask_predecessor_copilot,
)
from sqlalchemy import select, delete


async def run_kt_handoff_tests():
    print("=" * 80)
    print("🧪 RUNNING SESSION 13 TEST: KNOWLEDGE TRANSFER & PREDECESSOR SHADOW CO-PILOT")
    print("=" * 80)

    test_tenant_id = "test_apex_telco_kt"

    async with AsyncSessionLocal() as session:
        # Initial cleanup
        await session.execute(delete(models.AuditLog).where(models.AuditLog.tenant_id == test_tenant_id))
        await session.execute(delete(models.KTChecklistItem).where(models.KTChecklistItem.tenant_id == test_tenant_id))
        await session.execute(delete(models.KnowledgeTransferSession).where(models.KnowledgeTransferSession.tenant_id == test_tenant_id))
        await session.execute(delete(models.EmployeeDailyLog).where(models.EmployeeDailyLog.tenant_id == test_tenant_id))
        await session.execute(delete(models.User).where(models.User.tenant_id == test_tenant_id))
        await session.execute(delete(models.CompanyTenant).where(models.CompanyTenant.tenant_id == test_tenant_id))
        await session.commit()

        # ---------------------------------------------------------
        # Setup: Tenant, Manager, Predecessor (Senior) & Successor
        # ---------------------------------------------------------
        print("\n🔹 [Setup] Registering Company, Manager, Departing Senior & Successor...")
        tenant = models.CompanyTenant(
            tenant_id=test_tenant_id,
            company_name="Apex Telecommunications Global",
            industry="Telecom",
            admin_email="admin@apexcomm.com",
        )
        session.add(tenant)

        # 1. Manager
        manager = models.User(
            username="marcus_rf_director",
            email="marcus.vance@apexcomm.com",
            first_name="Marcus",
            last_name="Vance",
            role="TenantAdmin",
            employee_number="EMP-0001",
            department="Radio Frequency Engineering",
            job_title="Director of RF Engineering",
            clearance_level="ExecutiveOnly",
            tenant_id=test_tenant_id,
            password_hash="test_pw_hash",
        )
        # 2. Predecessor (Senior Lead leaving)
        predecessor = models.User(
            username="arjun_senior_rf",
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
        # 3. Successor (New Lead)
        successor = models.User(
            username="maya_incoming_rf",
            email="maya.lin@apexcomm.com",
            first_name="Maya",
            last_name="Lin",
            role="SeniorEngineer",
            employee_number="EMP-0288",
            department="Radio Frequency Engineering",
            job_title="Senior RF Engineer",
            clearance_level="Internal",
            tenant_id=test_tenant_id,
            password_hash="test_pw_hash",
        )
        session.add_all([manager, predecessor, successor])
        await session.commit()
        await session.refresh(manager)
        await session.refresh(predecessor)
        await session.refresh(successor)

        # Pre-seed Predecessor's Daily Decisions & Tacit Workarounds
        log1 = models.EmployeeDailyLog(
            tenant_id=test_tenant_id,
            user_id=predecessor.id,
            title="Rerouted MUM-0001-B3 traffic via Sector 2 after optical fiber surge",
            decision_summary="Applied carrier traffic reroute from Sector 3 (B3) to Sector 2 with a 4dB electrical downtilt offset to mitigate severe call drops.",
            trade_offs_considered="Rejected taking tower offline because customer SLA penalty would exceed $15,000 during peak business hours.",
            incident_or_ticket_ref="EVT-2026-000842",
            impacted_system_or_cell="CELL-MUM-0001-B3",
            intuition_notes="Vendor firmware v3.2 exhibits a 45-minute watchdog reboot loop under optical reflections; temporary downtilt prevents cross-talk until fiber re-splice.",
            decision_category="Workaround",
            urgency_level="High",
        )
        log2 = models.EmployeeDailyLog(
            tenant_id=test_tenant_id,
            user_id=predecessor.id,
            title="Calibrated electrical antenna tilt on Sector MUM-0002 during monsoon rain fade",
            decision_summary="Increased electrical tilt by 2 degrees on high-frequency 5G carrier band to overcome monsoon atmospheric attenuation.",
            trade_offs_considered="Rejected increasing transmit power to avoid adjacent cell interference violation.",
            incident_or_ticket_ref="TKT-2026-000912",
            impacted_system_or_cell="CELL-MUM-0002-NR",
            intuition_notes="High humidity above 90% drops SINR rapidly; tilt adjustment maintains throughput without drawing battery backup spikes.",
            decision_category="Permanent Fix",
            urgency_level="Medium",
        )
        session.add_all([log1, log2])
        await session.commit()
        await session.refresh(log1)
        await session.refresh(log2)
        print(f"   ✅ Seeded 2 operational decision logs for Predecessor {predecessor.first_name} {predecessor.last_name}")

        # ---------------------------------------------------------
        # TEST 1: Manager Assigns KT Succession Program
        # ---------------------------------------------------------
        print("\n🔹 [Step 1] Manager creating Knowledge Transfer assignment pairing Arjun -> Maya...")
        create_req = CreateKTAssignmentRequest(
            title="RF Optimization Succession Handover: Arjun Nair -> Maya Lin",
            predecessor_id=predecessor.id,
            successor_id=successor.id,
            scope_description="Complete handover of Mumbai 4G/5G radio cells, vendor quirks, and storm workarounds.",
            systems_in_scope=["CELL-MUM-0001", "CELL-MUM-0002", "CORE-EPC-GW-01"],
        )
        create_res = await create_kt_assignment(create_req, manager, session)
        assert create_res["success"] is True, f"Failed to create KT assignment: {create_res}"
        session_id = create_res["session"]["id"]
        assert create_res["session"]["checklist_items_count"] >= 3, "Checklist items were not auto-discovered"
        print(f"   ✅ Created KT Program ID: {session_id} with {create_res['session']['checklist_items_count']} checklist items")

        # ---------------------------------------------------------
        # TEST 2: Inspect Discovered Checklist Items & Program Detail
        # ---------------------------------------------------------
        print("\n🔹 [Step 2] Validating auto-generated checklist items and scope...")
        detail = await get_kt_assignment_detail(session_id, successor, session)
        assert detail["id"] == session_id
        assert detail["predecessor"]["id"] == predecessor.id
        assert detail["successor"]["id"] == successor.id
        checklist = detail["checklist_items"]
        assert len(checklist) >= 3
        ref_ids = [it["reference_id"] for it in checklist if it.get("reference_id")]
        assert f"DEC-{log1.id:06d}" in ref_ids, "Missing DEC reference in checklist"
        print(f"   ✅ Verified checklist items ({len(checklist)}): {[it['title'][:35] for it in checklist]}...")

        # ---------------------------------------------------------
        # TEST 3: Successor Reviews Checklist Item & Progress Advances
        # ---------------------------------------------------------
        print("\n🔹 [Step 3] Successor reviews first operational decision checklist item...")
        first_item_id = checklist[0]["id"]
        update_req = UpdateChecklistItemRequest(
            is_reviewed=True,
            notes="Reviewed Arjun's optical surge workaround. Clear on 4dB downtilt offset procedure.",
        )
        update_res = await update_checklist_item(first_item_id, update_req, successor, session)
        assert update_res["success"] is True
        assert update_res["is_reviewed"] is True
        assert update_res["session_progress_percent"] > 0.0
        print(f"   ✅ Progress updated to {update_res['session_progress_percent']}% complete!")

        # ---------------------------------------------------------
        # TEST 4: "Ask Predecessor's Brain" Conversational Query
        # ---------------------------------------------------------
        print("\n🔹 [Step 4] Querying 'Ask Predecessor's Brain' AI Shadow Assistant...")
        ask_req = AskPredecessorRequest(
            predecessor_id=predecessor.id,
            query="What workaround did you apply for the optical surge and watchdog reboot on Sector B3?",
        )
        copilot_res = await ask_predecessor_copilot(ask_req, successor, session)
        assert "synthesized_advice" in copilot_res, "Missing synthesized_advice"
        assert len(copilot_res["citations"]) > 0, "Missing citations in shadow assistant response"
        assert f"DEC-{log1.id:06d}" in [c["reference_id"] for c in copilot_res["citations"]]
        print(f"   ✅ Predecessor Co-Pilot Answer: {copilot_res['synthesized_advice'][:120]}...")
        print(f"   ✅ Grounded Citations: {[c['reference_id'] for c in copilot_res['citations']]}")
        print(f"   ✅ Tacit Intuition Caveats: {copilot_res.get('unwritten_intuition_caveats', 'N/A')[:100]}...")
        print(f"   ✅ Confidence Score: {copilot_res.get('confidence_score')}%")

        # ---------------------------------------------------------
        # TEST 5: Official Sign-Off & Audit Trail Commitment
        # ---------------------------------------------------------
        print("\n🔹 [Step 5] Performing Official KT Sign-Off & Audit Verification...")
        sign_off_res = await sign_off_kt_session(session_id, manager, session)
        assert sign_off_res["success"] is True
        assert sign_off_res["status"] == "COMPLETED"

        # Verify audit log in database
        audit_res = await session.execute(
            select(models.AuditLog).where(
                models.AuditLog.tenant_id == test_tenant_id,
                models.AuditLog.action == "KT_HANDOFF_OFFICIAL_SIGN_OFF",
            )
        )
        audit_entry = audit_res.scalar_one_or_none()
        assert audit_entry is not None, "Missing official sign-off audit log"
        assert audit_entry.sensitivity_level == "Restricted"
        print(f"   ✅ Official Sign-Off Audit Log Verified: Action={audit_entry.action}, User={audit_entry.username}")

        # ---------------------------------------------------------
        # CLEANUP
        # ---------------------------------------------------------
        await session.execute(delete(models.AuditLog).where(models.AuditLog.tenant_id == test_tenant_id))
        await session.execute(delete(models.KTChecklistItem).where(models.KTChecklistItem.tenant_id == test_tenant_id))
        await session.execute(delete(models.KnowledgeTransferSession).where(models.KnowledgeTransferSession.tenant_id == test_tenant_id))
        await session.execute(delete(models.EmployeeDailyLog).where(models.EmployeeDailyLog.tenant_id == test_tenant_id))
        await session.execute(delete(models.User).where(models.User.tenant_id == test_tenant_id))
        await session.execute(delete(models.CompanyTenant).where(models.CompanyTenant.tenant_id == test_tenant_id))
        await session.commit()

    print("\n" + "=" * 80)
    print("🎉 ALL SESSION 13 BACKEND TESTS PASSED WITH 100% SUCCESS!")
    print("=" * 80)


if __name__ == "__main__":
    asyncio.run(run_kt_handoff_tests())
