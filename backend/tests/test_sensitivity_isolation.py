import asyncio
import os
import sys
import json
import uuid
from datetime import datetime, timezone

# Ensure project root is in PYTHONPATH
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from database import AsyncSessionLocal
import models
from graph.models_gacm import ResearchMemoryObject
from services.capture_service import process_document_capture
from services.access_control import (
    CLEARANCE_HIERARCHY,
    get_authorized_sensitivities,
    can_user_access_memory,
    can_user_curate_memory,
    log_audit_event
)
from google_adk_agent import tool_search_pgvector_and_memgraph
from routers.memory import get_memory_detail, approve_memory, update_memory_entities, delete_memory, CurateMemoryRequest
from routers.governance import get_audit_logs, get_governance_stats, toggle_legal_hold, LegalHoldRequest
from auth import verify_password
from pwdlib import PasswordHash
from sqlalchemy import select, desc
from fastapi import HTTPException

async def test_session07_governance():
    print("==================================================================")
    print("RUNNING SESSION 07 ENTERPRISE GOVERNANCE, SENSITIVITY ACLS & AUDIT TESTS")
    print("==================================================================")

    # 1. Verify 4 institutional user accounts in database
    print("\n[TEST 1] Verifying 4 Institutional Role Accounts & Credentials...")
    async with AsyncSessionLocal() as session:
        roles_to_find = ["TenantAdmin", "DeptAdmin", "Researcher", "Auditor"]
        found_users = {}
        for r in roles_to_find:
            res = await session.execute(select(models.User).where(models.User.role == r))
            u = res.scalars().first()
            assert u is not None, f"Role {r} not found in PostgreSQL"
            found_users[r] = u
            print(f"  -> Found {r:<12}: {u.email:<22} | Clearance: {u.clearance_level:<18} | Dept: {u.department}")

        tenant_admin = found_users["TenantAdmin"]
        dept_admin = found_users["DeptAdmin"]
        researcher = found_users["Researcher"]
        auditor = found_users["Auditor"]

    # 2. Ingest a Confidential ITAR Defense Project
    run_tag = uuid.uuid4().hex[:6]
    print(f"\n[TEST 2] Ingesting Confidential ITAR Defense Record (Tag: {run_tag})...")
    sample_confidential = f"""
DEFENSE ADVANCED RESEARCH PROJECTS AGENCY (DARPA) [Run: {run_tag}]
Program: Hypersonic Boundary-Layer Transition Modeling {run_tag}
Classification: Confidential - ITAR Restricted Distribution
Award Amount: $1,450,000.00
Principal Investigator: Dr. Elena Rostova
Department: Mechanical & Aerospace Engineering
Sponsor: DARPA Tactical Technology Office
"""
    async with AsyncSessionLocal() as session:
        capture_res = await process_document_capture(
            session=session,
            file_name=f"darpa_hypersonic_{run_tag}.txt",
            file_bytes=sample_confidential.encode("utf-8"),
            department="Mechanical & Aerospace Engineering",
            memory_type="GrantAward",
            sensitivity_level="Confidential"
        )
        assert capture_res.get("status") == "completed", f"Capture status failed: {capture_res}"
        conf_mem_id = capture_res.get("memory_id")
        assert conf_mem_id is not None
        print(f"  -> Created Confidential Memory: {conf_mem_id}")

    # 3. Test Clearance Isolation in Search (Zero Data Leakage)
    print("\n[TEST 3] Testing Search Clearance Isolation (Researcher vs TenantAdmin)...")
    # Researcher has clearance 'Internal' -> 'Confidential' should be 100% invisible
    res_researcher = await tool_search_pgvector_and_memgraph(
        query_text=f"Hypersonic Boundary-Layer {run_tag}",
        top_k=5,
        user_clearance="Internal"
    )
    citations_researcher = res_researcher.get("pgvector_citations", [])
    matching_researcher = [c for c in citations_researcher if c.get("grant_id") == conf_mem_id]
    assert len(matching_researcher) == 0, "DATA LEAK: Researcher with Internal clearance received Confidential project!"
    print("  -> Zero Data Leakage Verified: Researcher search returned 0 citations for Confidential record.")

    # TenantAdmin has clearance 'HighlyConfidential' -> Sees the project immediately
    res_admin = await tool_search_pgvector_and_memgraph(
        query_text=f"Hypersonic Boundary-Layer {run_tag}",
        top_k=5,
        user_clearance="HighlyConfidential"
    )
    citations_admin = res_admin.get("pgvector_citations", [])
    matching_admin = [c for c in citations_admin if c.get("grant_id") == conf_mem_id]
    assert len(matching_admin) >= 1, "Tenant Admin with HighlyConfidential clearance did not receive project"
    print(f"  -> TenantAdmin Search Verified: Retrieved '{matching_admin[0]['project_title'][:40]}...'")
    print("  -> PASS: Sensitivity Clearance Ladder strictly enforces zero data leakage.")

    # 4. Direct Document Access & CLEARANCE_DENIAL Audit Logging
    print("\n[TEST 4] Testing Direct Access Denial & Audit Log Generation...")
    async with AsyncSessionLocal() as session:
        # A researcher with 'Internal' clearance tries to fetch the Confidential memory directly
        unauthorized_researcher = researcher
        try:
            await get_memory_detail(memory_id=conf_mem_id, current_user=unauthorized_researcher, db=session)
            assert False, "Should have raised HTTP 403 Forbidden"
        except HTTPException as he:
            assert he.status_code == 403
            print(f"  -> Correctly blocked unauthorized access with HTTP {he.status_code}: {he.detail}")

        # Verify that a CLEARANCE_DENIAL audit log entry was written
        audit_res = await session.execute(
            select(models.AuditLog).where(
                models.AuditLog.memory_id == conf_mem_id,
                models.AuditLog.action == "CLEARANCE_DENIAL"
            ).order_by(desc(models.AuditLog.id))
        )
        denial_entry = audit_res.scalars().first()
        assert denial_entry is not None, "CLEARANCE_DENIAL was not written to audit_logs table"
        print(f"  -> Audit Log Verified: Action='{denial_entry.action}' by User='{denial_entry.username}' at {denial_entry.timestamp}")
        print("  -> PASS: Clearance denials write immutable audit records.")

    # 5. Department Curation Scoping
    print("\n[TEST 5] Testing Departmental Curation Scoping (CS Dept Chair vs Mech Engineering Record)...")
    async with AsyncSessionLocal() as session:
        # CS Dept Chair tries to curate the Mechanical Engineering memory
        curate_payload = CurateMemoryRequest(
            title="Unauthorized Modification by CS Dept Chair",
            department="Computer Science & Engineering"
        )
        try:
            await update_memory_entities(
                memory_id=conf_mem_id,
                payload=curate_payload,
                current_user=dept_admin,
                db=session
            )
            assert False, "Should have blocked CS Dept Chair from curating Mech Eng memory"
        except HTTPException as he:
            assert he.status_code == 403
            print(f"  -> Correctly blocked cross-department curation with HTTP {he.status_code}: {he.detail}")

        # TenantAdmin curates successfully
        admin_curate = CurateMemoryRequest(
            title="DARPA Hypersonics Boundary-Layer Transition Modeling",
            entities={"pi_name": "Dr. Elena Rostova", "sponsor_agency": "DARPA TTO", "award_amount": 1450000.0}
        )
        curate_ok = await update_memory_entities(
            memory_id=conf_mem_id,
            payload=admin_curate,
            current_user=tenant_admin,
            db=session
        )
        assert curate_ok["status"] == "success"
        print("  -> TenantAdmin successfully curated memory and updated Neo4j graph.")
        print("  -> PASS: Department scoping protects inter-departmental research autonomy.")

    # 6. Legal Hold Protection & Auditor API
    print("\n[TEST 6] Testing Legal Hold Tamper Blocker & Auditor Query API...")
    async with AsyncSessionLocal() as session:
        # 1. Place memory on legal hold
        hold_res = await toggle_legal_hold(
            payload=LegalHoldRequest(
                memory_id=conf_mem_id,
                is_on_legal_hold=True,
                reason="Subpoena from Federal Oversight Committee"
            ),
            current_user=auditor,
            db=session
        )
        assert hold_res["is_on_legal_hold"] is True
        print(f"  -> Applied Legal Hold: {hold_res['message']}")

        # 2. Attempt to delete memory (Must be blocked)
        try:
            await delete_memory(memory_id=conf_mem_id, current_user=tenant_admin, db=session)
            assert False, "Should have blocked deletion due to active legal hold"
        except HTTPException as he:
            assert he.status_code == 400
            assert "Legal Hold" in he.detail
            print(f"  -> Correctly blocked deletion with HTTP {he.status_code}: {he.detail}")

        # 3. Release legal hold
        await toggle_legal_hold(
            payload=LegalHoldRequest(
                memory_id=conf_mem_id,
                is_on_legal_hold=False,
                reason="Oversight review concluded"
            ),
            current_user=auditor,
            db=session
        )

        # 4. Auditor queries the audit log endpoint
        logs_res = await get_audit_logs(
            page=1,
            limit=10,
            current_user=auditor,
            db=session
        )
        assert "items" in logs_res
        assert len(logs_res["items"]) >= 3
        actions_logged = [it["action"] for it in logs_res["items"]]
        print(f"  -> Auditor view retrieved {len(logs_res['items'])} entries. Recent actions: {actions_logged[:5]}")
        assert "LEGAL_HOLD_APPLIED" in actions_logged or "CLEARANCE_DENIAL" in actions_logged

        # 5. Non-auditor (Researcher) attempts to query audit log endpoint (Must be denied)
        try:
            await get_audit_logs(page=1, limit=10, current_user=researcher, db=session)
            assert False, "Should have blocked Researcher from accessing audit logs"
        except HTTPException as he:
            assert he.status_code == 403
            print(f"  -> Correctly blocked Researcher from audit logs with HTTP {he.status_code}: {he.detail}")

        print("  -> PASS: Legal hold tamper protection & Auditor access restrictions verified.")

    print("\n==================================================================")
    print("SUCCESS: Session 07 Enterprise Governance Tests All Passed! (6/6)")
    print("==================================================================")

if __name__ == "__main__":
    asyncio.run(test_session07_governance())
