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
from routers.telecom_analytics import (
    SimulationRequest,
    get_cross_silo_intelligence,
    get_spof_and_decay_matrix,
    run_decision_simulation,
    list_past_simulations,
)
from sqlalchemy import select, delete


async def run_simulator_and_analytics_tests():
    print("=" * 80)
    print("🧪 RUNNING SESSION 14 TEST: CROSS-SILO ANALYTICS, SPOF & WHAT-IF SIMULATOR")
    print("=" * 80)

    test_tenant_id = "test_apex_telco_sim"

    async with AsyncSessionLocal() as session:
        # Initial cleanup
        await session.execute(delete(models.AuditLog).where(models.AuditLog.tenant_id == test_tenant_id))
        await session.execute(delete(models.SimulationRecord).where(models.SimulationRecord.tenant_id == test_tenant_id))
        await session.execute(delete(models.EmployeeDailyLog).where(models.EmployeeDailyLog.tenant_id == test_tenant_id))
        await session.execute(delete(ResearchMemoryObject).where(ResearchMemoryObject.tenant_id == test_tenant_id))
        await session.execute(delete(models.User).where(models.User.tenant_id == test_tenant_id))
        await session.execute(delete(models.CompanyTenant).where(models.CompanyTenant.tenant_id == test_tenant_id))
        await session.commit()

        # ---------------------------------------------------------
        # Setup: Company, Lead Engineer & Lakehouse Canonical Objects
        # ---------------------------------------------------------
        print("\n🔹 [Setup] Initializing Company, Specialist Engineer & Lakehouse Datasets...")
        tenant = models.CompanyTenant(
            tenant_id=test_tenant_id,
            company_name="Apex Telecommunications Global",
            industry="Telecom",
            admin_email="admin@apexcomm.com",
        )
        session.add(tenant)

        engineer = models.User(
            username="arjun_opt_lead",
            email="arjun.opt@apexcomm.com",
            first_name="Arjun",
            last_name="Nair",
            role="TenantAdmin",
            employee_number="EMP-0142",
            department="Radio Frequency Engineering",
            job_title="Lead RF Optimization Engineer",
            clearance_level="ExecutiveOnly",
            tenant_id=test_tenant_id,
            password_hash="test_pw_hash",
        )
        session.add(engineer)
        await session.commit()
        await session.refresh(engineer)

        # Seed Lakehouse Outage & Ticket Records
        outage1 = ResearchMemoryObject(
            memory_id=f"MEM-OUTAGE-{test_tenant_id}-001",
            tenant_id=test_tenant_id,
            user_id=engineer.id,
            domain="telecom_enterprise",
            category="Operational",
            memory_type="NetworkOutage",
            severity="CRITICAL",
            sensitivity_level="Internal",
            lifecycle_stage="Resolved",
            title="4G/5G Cell Outage: Optical surge on CELL-MUM-0001-B3",
            raw_text="Fiber surge outage duration 180 minutes on Sector 3.",
            content_hash="test_outage_hash_1",
            confidence_score=95.0,
        )
        outage1.set_entities({
            "site_code": "SITE-MUM-0001",
            "cell_id": "CELL-MUM-0001-B3",
            "duration_minutes": 180,
            "severity": "CRITICAL",
        })

        ticket1 = ResearchMemoryObject(
            memory_id=f"MEM-TICKET-{test_tenant_id}-001",
            tenant_id=test_tenant_id,
            user_id=engineer.id,
            domain="telecom_enterprise",
            category="Operational",
            memory_type="ServiceTicket",
            severity="High",
            sensitivity_level="Internal",
            lifecycle_stage="Resolved",
            title="Service Ticket TKT-2026-000842: VIP Corporate Voice Drops",
            raw_text="VIP complaints of call drop rate spike in Mumbai BKC financial district.",
            content_hash="test_ticket_hash_1",
            confidence_score=98.0,
        )
        ticket1.set_entities({
            "site_code": "SITE-MUM-0001",
            "customer_number": "CUST-VIP-0091",
            "priority": "CRITICAL",
        })

        # Seed Predecessor's Workaround Log
        log1 = models.EmployeeDailyLog(
            tenant_id=test_tenant_id,
            user_id=engineer.id,
            title="Applied 4dB electrical downtilt offset to suppress optical surge desync",
            decision_summary="Rerouted carrier traffic from Sector 3 (B3) to Sector 2 to avoid tower-wide drop.",
            trade_offs_considered="Rejected tower reset due to $15k SLA penalty during business hours.",
            incident_or_ticket_ref="EVT-2026-000842",
            impacted_system_or_cell="CELL-MUM-0001-B3",
            intuition_notes="Vendor firmware v3.2 exhibits a 45-minute watchdog reboot loop under optical reflections.",
            decision_category="Workaround",
            urgency_level="High",
        )

        session.add_all([outage1, ticket1, log1])
        await session.commit()
        print("   ✅ Seeded Lakehouse Outage, CRM Ticket, and Engineering Decision Log.")

        # ---------------------------------------------------------
        # TEST 1: Cross-Silo Lakehouse + CRM Analytics
        # ---------------------------------------------------------
        print("\n🔹 [Step 1] Running Cross-Silo Analytics (Lakehouse Outages + CRM Churn)...")
        analytics = await get_cross_silo_intelligence(current_user=engineer, db=session)
        assert analytics["total_outages_tracked"] >= 1, "Missing outages in cross-silo analytics"
        assert analytics["total_crm_tickets"] >= 1, "Missing tickets in cross-silo analytics"
        assert analytics["cross_silo_correlation_index"] > 80.0
        assert len(analytics["hotspot_sites"]) >= 1
        hotspot = analytics["hotspot_sites"][0]
        assert hotspot["site_code"] == "SITE-MUM-0001"
        assert hotspot["churn_risk_score"] > 0.0
        assert hotspot["estimated_sla_exposure_usd"] > 0.0
        print(f"   ✅ Correlation Score: {analytics['cross_silo_correlation_index']}%")
        print(f"   ✅ Hotspot Identified: {hotspot['site_code']} ({hotspot['churn_risk_score']}% Churn Exposure, ${hotspot['estimated_sla_exposure_usd']:,.2f} SLA Exposure)")

        # ---------------------------------------------------------
        # TEST 2: Single Point of Failure (SPOF) & Decay Matrix
        # ---------------------------------------------------------
        print("\n🔹 [Step 2] Testing Single Point of Failure (SPOF) & Knowledge Concentration Engine...")
        spof = await get_spof_and_decay_matrix(current_user=engineer, db=session)
        assert spof["spof_critical_count"] >= 1, "Expected at least 1 SPOF alert"
        primary_spof = spof["spof_risks"][0]
        assert primary_spof["dominant_expert"] == "Arjun Nair"
        assert primary_spof["knowledge_concentration_percent"] >= 70.0
        print(f"   ✅ SPOF Risk Flagged: {primary_spof['subsystem']} ({primary_spof['knowledge_concentration_percent']}% concentrated in {primary_spof['dominant_expert']})")
        print(f"   ✅ Recommendation: {primary_spof['recommended_action']}")

        # ---------------------------------------------------------
        # TEST 3: What-If Simulator: Scenario 1 (Employee Departure)
        # ---------------------------------------------------------
        print("\n🔹 [Step 3] Simulating Scenario 1: Key Specialist Departure without Handover...")
        sim1_req = SimulationRequest(
            scenario_type="EMPLOYEE_DEPARTURE",
            scenario_name="Departure of Lead RF Specialist Arjun Nair",
            params={"employee_id": engineer.id},
        )
        sim1_res = await run_decision_simulation(sim1_req, current_user=engineer, db=session)
        assert sim1_res["success"] is True
        res1 = sim1_res["results"]
        assert res1["impact_severity"] == "CRITICAL"
        assert res1["metrics"]["projected_sla_exposure_usd"] > 0
        assert len(res1["grounded_decision_cites"]) >= 1
        print(f"   ✅ Projected SLA Exposure: ${res1['metrics']['projected_sla_exposure_usd']:,.2f}")
        print(f"   ✅ AI Recommendation: {res1['ai_strategic_recommendation'][:100]}...")

        # ---------------------------------------------------------
        # TEST 4: What-If Simulator: Scenario 2 (Planned Outage)
        # ---------------------------------------------------------
        print("\n🔹 [Step 4] Simulating Scenario 2: Planned 4-Hour Cell Tower Downtime...")
        sim2_req = SimulationRequest(
            scenario_type="PLANNED_OUTAGE",
            scenario_name="Planned Maintenance on SITE-MUM-0001",
            params={
                "site_code": "SITE-MUM-0001",
                "downtime_hours": 4.0,
                "time_window": "PEAK_BUSINESS",
            },
        )
        sim2_res = await run_decision_simulation(sim2_req, current_user=engineer, db=session)
        assert sim2_res["success"] is True
        res2 = sim2_res["results"]
        assert res2["metrics"]["projected_sla_penalty_usd"] > 0
        assert res2["metrics"]["affected_subscribers"] > 0
        assert "downtilt" in res2["ai_strategic_recommendation"].lower()
        print(f"   ✅ Projected Affected Subscribers: {res2['metrics']['affected_subscribers']:,}")
        print(f"   ✅ Projected SLA Penalty: ${res2['metrics']['projected_sla_penalty_usd']:,.2f}")
        print(f"   ✅ Heuristic Mitigation Advice: {res2['ai_strategic_recommendation'][:110]}...")

        # ---------------------------------------------------------
        # TEST 5: What-If Simulator: Scenario 3 (Hardware Upgrade ROI)
        # ---------------------------------------------------------
        print("\n🔹 [Step 5] Simulating Scenario 3: Hardware / Firmware Rollout ROI Model...")
        sim3_req = SimulationRequest(
            scenario_type="HARDWARE_UPGRADE",
            scenario_name="Optical SFP+ Transceiver & Firmware v3.3 Upgrade",
            params={
                "upgrade_name": "Optical SFP+ Transceiver & Firmware v3.3 Rollout",
                "cluster_towers_count": 12,
            },
        )
        sim3_res = await run_decision_simulation(sim3_req, current_user=engineer, db=session)
        assert sim3_res["success"] is True
        res3 = sim3_res["results"]
        assert res3["impact_severity"] == "POSITIVE_ROI"
        assert res3["metrics"]["projected_annual_savings_usd"] > 0
        print(f"   ✅ Projected Annual Savings: ${res3['metrics']['projected_annual_savings_usd']:,.2f}")
        print(f"   ✅ Payback Period: {res3['metrics']['payback_period_months']}")
        print(f"   ✅ 5-Year Net ROI: {res3['metrics']['net_5yr_roi_pct']}")

        # ---------------------------------------------------------
        # TEST 6: Audit & History Verification
        # ---------------------------------------------------------
        print("\n🔹 [Step 6] Verifying Stored Simulation Audit Trails...")
        history = await list_past_simulations(current_user=engineer, db=session)
        assert len(history) == 3, f"Expected 3 saved simulations, got {len(history)}"
        print(f"   ✅ Verified {len(history)} persistent simulation records in database.")

        # ---------------------------------------------------------
        # CLEANUP
        # ---------------------------------------------------------
        await session.execute(delete(models.AuditLog).where(models.AuditLog.tenant_id == test_tenant_id))
        await session.execute(delete(models.SimulationRecord).where(models.SimulationRecord.tenant_id == test_tenant_id))
        await session.execute(delete(models.EmployeeDailyLog).where(models.EmployeeDailyLog.tenant_id == test_tenant_id))
        await session.execute(delete(ResearchMemoryObject).where(ResearchMemoryObject.tenant_id == test_tenant_id))
        await session.execute(delete(models.User).where(models.User.tenant_id == test_tenant_id))
        await session.execute(delete(models.CompanyTenant).where(models.CompanyTenant.tenant_id == test_tenant_id))
        await session.commit()

    print("\n" + "=" * 80)
    print("🎉 ALL SESSION 14 BACKEND TESTS PASSED WITH 100% SUCCESS!")
    print("=" * 80)


if __name__ == "__main__":
    asyncio.run(run_simulator_and_analytics_tests())
