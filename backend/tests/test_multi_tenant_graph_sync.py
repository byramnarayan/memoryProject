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
from graph.memgraph_db import execute_cypher
from services.graph_sync_service import (
    sync_employee_to_neo4j,
    sync_lakehouse_operational_graph,
    get_tenant_graph_metrics,
    ensure_graph_indexes,
)
from sqlalchemy import select, delete


async def run_graph_sync_tests():
    print("=" * 80)
    print("🧪 RUNNING SESSION 16 TEST: NEO4J REAL-TIME MULTI-TENANT GRAPH INGESTION PIPELINE")
    print("=" * 80)

    # 1. Ensure DB tables exist
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    # Ensure Neo4j indexes exist
    ensure_graph_indexes()

    test_tenant_a = "test_telco_prime"
    test_tenant_b = "test_telco_sec"

    # Pre-test Graph Cleanup for isolation
    execute_cypher("MATCH (n {tenant_id: $t}) DETACH DELETE n", {"t": test_tenant_a})
    execute_cypher("MATCH (n {tenant_id: $t}) DETACH DELETE n", {"t": test_tenant_b})

    # Cleanup DB records
    async with AsyncSessionLocal() as session:
        await session.execute(delete(models.CredentialVaultItem).where(models.CredentialVaultItem.tenant_id.in_([test_tenant_a, test_tenant_b])))
        await session.execute(delete(models.AuditLog).where(models.AuditLog.tenant_id.in_([test_tenant_a, test_tenant_b])))
        await session.execute(delete(models.User).where(models.User.tenant_id.in_([test_tenant_a, test_tenant_b])))
        await session.execute(delete(models.Department).where(models.Department.tenant_id.in_([test_tenant_a, test_tenant_b])))
        await session.execute(delete(models.CompanyTenant).where(models.CompanyTenant.tenant_id.in_([test_tenant_a, test_tenant_b])))
        await session.commit()

    # -------------------------------------------------------------
    # TEST 1: Real-Time Employee Sync to Neo4j
    # -------------------------------------------------------------
    print("\n--- TEST 1: Real-Time Employee Ingestion & Hierarchy Linking ---")
    async with AsyncSessionLocal() as session:
        # Create Manager
        mgr = models.User(
            username=f"mgr_{test_tenant_a}",
            email=f"mgr@{test_tenant_a}.com",
            password_hash="hash123",
            role="DeptAdmin",
            department="Radio Frequency Engineering",
            clearance_level="Confidential",
            tenant_id=test_tenant_a,
            first_name="Arjun",
            last_name="Nair",
            employee_number="EMP-0002",
            job_title="Lead RF Engineer",
            status="Active",
        )
        session.add(mgr)
        await session.flush()

        # Create Engineer reporting to Manager
        emp = models.User(
            username=f"priya_{test_tenant_a}",
            email=f"priya@{test_tenant_a}.com",
            password_hash="hash123",
            role="Engineer",
            department="Radio Frequency Engineering",
            clearance_level="Restricted",
            tenant_id=test_tenant_a,
            first_name="Priya",
            last_name="Patel",
            employee_number="EMP-0001",
            job_title="Network Optimization Specialist",
            manager_id=mgr.id,
            status="Active",
        )
        session.add(emp)
        await session.commit()
        await session.refresh(mgr)
        await session.refresh(emp)

        # Sync both to Neo4j
        sync_res_mgr = sync_employee_to_neo4j(mgr)
        sync_res_emp = sync_employee_to_neo4j(emp, manager_emp=mgr)

        assert sync_res_mgr["status"] == "synced", "Manager sync failed"
        assert sync_res_emp["status"] == "synced", "Employee sync failed"
        print(f"  ✓ Manager synced: {sync_res_mgr['employee_number']} ({sync_res_mgr['name']})")
        print(f"  ✓ Employee synced: {sync_res_emp['employee_number']} ({sync_res_emp['name']})")

    # Verify Neo4j Nodes and Relationships
    emp_nodes = execute_cypher(
        "MATCH (e:Employee {tenant_id: $t}) RETURN e.employee_number as num, e.name as name, e.role as role ORDER BY num",
        {"t": test_tenant_a}
    )
    assert len(emp_nodes) == 2, f"Expected 2 employee nodes in Neo4j, got {len(emp_nodes)}"
    assert emp_nodes[0]["num"] == "EMP-0001" and "Priya" in emp_nodes[0]["name"]
    assert emp_nodes[1]["num"] == "EMP-0002" and "Arjun" in emp_nodes[1]["name"]
    print("  ✓ Verified :Employee nodes present with correct attributes")

    # Verify [:BELONGS_TO] edge
    dept_rels = execute_cypher(
        "MATCH (e:Employee {tenant_id: $t})-[:BELONGS_TO]->(d:Department {tenant_id: $t}) "
        "RETURN e.employee_number as emp, d.name as dept",
        {"t": test_tenant_a}
    )
    assert len(dept_rels) == 2, f"Expected 2 [:BELONGS_TO] edges, got {len(dept_rels)}"
    assert dept_rels[0]["dept"] == "Radio Frequency Engineering"
    print("  ✓ Verified [:BELONGS_TO] edges to Department node")

    # Verify [:REPORTS_TO] edge
    reports_rels = execute_cypher(
        "MATCH (e:Employee {employee_number: 'EMP-0001', tenant_id: $t})-[:REPORTS_TO]->(m:Employee {tenant_id: $t}) "
        "RETURN e.employee_number as sub, m.employee_number as mgr",
        {"t": test_tenant_a}
    )
    assert len(reports_rels) == 1, f"Expected 1 [:REPORTS_TO] relationship, got {len(reports_rels)}"
    assert reports_rels[0]["mgr"] == "EMP-0002", f"Expected manager EMP-0002, got {reports_rels[0]['mgr']}"
    print(f"  ✓ Verified reporting hierarchy: EMP-0001 -> [:REPORTS_TO] -> {reports_rels[0]['mgr']}")

    # -------------------------------------------------------------
    # TEST 2: Lakehouse Operational Graph Sync
    # -------------------------------------------------------------
    print("\n--- TEST 2: Lakehouse Operational Graph Ingestion (Sites, Outages, Tickets) ---")
    sample_sites = [
        {
            "site_code": "SITE-TEST-001",
            "site_name": "Test Hub Sector A",
            "location": "North Substation",
            "cell_count": 3,
            "tech": "4G/5G",
            "avg_drop_rate": 0.45,
            "outage_minutes_30d": 30,
            "ticket_count": 5,
        }
    ]
    sample_outages = [
        {
            "event_id": "EVT-TEST-001",
            "cell_id": "CELL-TEST-A1",
            "site_code": "SITE-TEST-001",
            "event_type": "OUTAGE",
            "severity": "CRITICAL",
            "duration_minutes": 65,
            "tech": "5G",
            "description": "Fiber optical connector loose after high vibration event.",
            "remediation": "Field technician cleaned and re-seated LC fiber connector.",
        }
    ]
    sample_tickets = [
        {
            "ticket_number": "TKT-TEST-9001",
            "customer_number": "CUST-VIP-101",
            "site_code": "SITE-TEST-001",
            "category": "NETWORK_OUTAGE",
            "priority": "P1_URGENT",
            "status": "RESOLVED",
            "assigned_emp": "EMP-0001",
            "summary": "Customer reported 0 throughput across enterprise branch.",
            "resolution": "Resolved simultaneously with fiber re-seat on SITE-TEST-001.",
        }
    ]

    lakehouse_sync_res = sync_lakehouse_operational_graph(
        tenant_id=test_tenant_a,
        outages=sample_outages,
        tickets=sample_tickets,
        sites=sample_sites,
    )
    assert lakehouse_sync_res["status"] == "synced"
    assert lakehouse_sync_res["sites_synced"] == 1
    assert lakehouse_sync_res["events_synced"] == 1
    assert lakehouse_sync_res["tickets_synced"] == 1
    print(f"  ✓ Lakehouse operational entities synced: {lakehouse_sync_res}")

    # Verify [:OCCURRED_AT] edge
    event_rels = execute_cypher(
        "MATCH (evt:NetworkEvent {tenant_id: $t})-[:OCCURRED_AT]->(s:NetworkSite {tenant_id: $t}) "
        "RETURN evt.event_id as evt, s.site_code as site",
        {"t": test_tenant_a}
    )
    assert len(event_rels) == 1, f"Expected 1 [:OCCURRED_AT] edge, got {len(event_rels)}"
    assert event_rels[0]["site"] == "SITE-TEST-001"
    print(f"  ✓ Verified event link: {event_rels[0]['evt']} -> [:OCCURRED_AT] -> {event_rels[0]['site']}")

    # Verify [:AFFECTS_SITE] edge
    ticket_site_rels = execute_cypher(
        "MATCH (t:ServiceTicket {tenant_id: $t})-[:AFFECTS_SITE]->(s:NetworkSite {tenant_id: $t}) "
        "RETURN t.ticket_number as tkt, s.site_code as site",
        {"t": test_tenant_a}
    )
    assert len(ticket_site_rels) == 1, f"Expected 1 [:AFFECTS_SITE] edge, got {len(ticket_site_rels)}"
    print(f"  ✓ Verified ticket link: {ticket_site_rels[0]['tkt']} -> [:AFFECTS_SITE] -> {ticket_site_rels[0]['site']}")

    # Verify [:ASSIGNED_TO] edge
    assigned_rels = execute_cypher(
        "MATCH (e:Employee {tenant_id: $t})-[:ASSIGNED_TO]->(t:ServiceTicket {tenant_id: $t}) "
        "RETURN e.employee_number as emp, t.ticket_number as tkt",
        {"t": test_tenant_a}
    )
    assert len(assigned_rels) == 1, f"Expected 1 [:ASSIGNED_TO] edge, got {len(assigned_rels)}"
    assert assigned_rels[0]["emp"] == "EMP-0001"
    print(f"  ✓ Verified staff assignment: {assigned_rels[0]['emp']} -> [:ASSIGNED_TO] -> {assigned_rels[0]['tkt']}")

    # -------------------------------------------------------------
    # TEST 3: Strict Multi-Tenant Graph Isolation & Zero Leakage
    # -------------------------------------------------------------
    print("\n--- TEST 3: Multi-Tenant Graph Partitioning & Metrics Scoping ---")
    # Ingest dummy employee in Tenant B
    dummy_emp_b = models.User(
        username=f"user_{test_tenant_b}",
        email=f"user@{test_tenant_b}.com",
        password_hash="hash123",
        role="Employee",
        department="Finance",
        clearance_level="Internal",
        tenant_id=test_tenant_b,
        first_name="Karan",
        last_name="Mehra",
        employee_number="EMP-0001",
        job_title="Finance Associate",
        status="Active",
    )
    sync_employee_to_neo4j(dummy_emp_b)

    # Check metrics for Tenant A
    metrics_a = get_tenant_graph_metrics(test_tenant_a)
    print(f"  ✓ Tenant A Metrics: {metrics_a['total_nodes']} nodes, {metrics_a['total_relationships']} edges")
    assert metrics_a["employees"] == 2, f"Expected 2 employees for Tenant A, got {metrics_a['employees']}"
    assert metrics_a["network_sites"] == 1
    assert metrics_a["network_events"] == 1
    assert metrics_a["service_tickets"] == 1
    assert metrics_a["departments"] == 1

    # Check metrics for Tenant B
    metrics_b = get_tenant_graph_metrics(test_tenant_b)
    print(f"  ✓ Tenant B Metrics: {metrics_b['total_nodes']} nodes, {metrics_b['total_relationships']} edges")
    assert metrics_b["employees"] == 1
    assert metrics_b["network_sites"] == 0, "Tenant B leaked sites from Tenant A!"
    assert metrics_b["network_events"] == 0, "Tenant B leaked events from Tenant A!"
    assert metrics_b["service_tickets"] == 0, "Tenant B leaked tickets from Tenant A!"

    # Verify legacy academic nodes remain completely isolated
    cross_leak = execute_cypher(
        "MATCH (n {tenant_id: $t_a})-[r]->(m {tenant_id: 'utc_campus'}) RETURN count(r) as leaks",
        {"t_a": test_tenant_a}
    )
    assert cross_leak[0]["leaks"] == 0, "Detected cross-tenant edge leakage with legacy academic data!"
    print("  ✓ Zero cross-tenant leakage confirmed: 100% graph isolation verified")

    # -------------------------------------------------------------
    # TEST 4: Real-Time Employee Addition via Provisioning Endpoint
    # -------------------------------------------------------------
    print("\n--- TEST 4: Real-Time Graph Update on Employee Provisioning Endpoint ---")
    from routers.employees import provision_employee
    from schemas import EmployeeProvisionRequest
    async with AsyncSessionLocal() as session:
        # Create an admin user for tenant A
        admin = models.User(
            username=f"admin_{test_tenant_a}",
            email=f"admin@{test_tenant_a}.com",
            password_hash="pwd",
            role="TenantAdmin",
            department="Executive",
            clearance_level="ExecutiveOnly",
            tenant_id=test_tenant_a,
            first_name="Alice",
            last_name="Director",
            status="Active",
        )
        session.add(admin)
        await session.commit()
        await session.refresh(admin)

        req = EmployeeProvisionRequest(
            first_name="Sneha",
            last_name="Verma",
            work_email="sneha.verma@telcoprime.com",
            role="Engineer",
            department="Radio Frequency Engineering",
            job_title="Microwave Link Specialist",
            clearance_level="Internal",
        )

        resp = await provision_employee(req=req, current_user=admin, db=session)
        print(f"  ✓ Provisioned new employee: {resp.employee_number} ({resp.first_name} {resp.last_name})")

        # Verify real-time presence in Neo4j immediately!
        neo_res = execute_cypher(
            "MATCH (e:Employee {employee_number: $emp_num, tenant_id: $t}) "
            "OPTIONAL MATCH (e)-[:BELONGS_TO]->(d:Department) "
            "RETURN e.name as name, e.role as role, d.name as dept",
            {"emp_num": resp.employee_number, "t": test_tenant_a}
        )
        assert len(neo_res) == 1, f"Expected 1 node in Neo4j for {resp.employee_number}, found {len(neo_res)}"
        assert neo_res[0]["name"] == "Sneha Verma"
        assert neo_res[0]["dept"] == "Radio Frequency Engineering"
        print(f"  ✓ Real-time Neo4j node immediately verified: {neo_res[0]['name']} -> [:BELONGS_TO] -> {neo_res[0]['dept']}")

    # -------------------------------------------------------------
    # Post-Test Cleanup
    # -------------------------------------------------------------
    print("\n--- Cleaning up test artifacts ---")
    execute_cypher("MATCH (n {tenant_id: $t}) DETACH DELETE n", {"t": test_tenant_a})
    execute_cypher("MATCH (n {tenant_id: $t}) DETACH DELETE n", {"t": test_tenant_b})
    async with AsyncSessionLocal() as session:
        await session.execute(delete(models.CredentialVaultItem).where(models.CredentialVaultItem.tenant_id.in_([test_tenant_a, test_tenant_b])))
        await session.execute(delete(models.AuditLog).where(models.AuditLog.tenant_id.in_([test_tenant_a, test_tenant_b])))
        await session.execute(delete(models.User).where(models.User.tenant_id.in_([test_tenant_a, test_tenant_b])))
        await session.execute(delete(models.Department).where(models.Department.tenant_id.in_([test_tenant_a, test_tenant_b])))
        await session.execute(delete(models.CompanyTenant).where(models.CompanyTenant.tenant_id.in_([test_tenant_a, test_tenant_b])))
        await session.commit()
    print("  ✓ Test artifacts cleaned successfully")

    print("\n" + "=" * 80)
    print("🎉 ALL SESSION 16 TESTS PASSED: NEO4J REAL-TIME GRAPH PIPELINE OPERATIONAL")
    print("=" * 80)


if __name__ == "__main__":
    asyncio.run(run_graph_sync_tests())
