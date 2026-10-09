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
from google_adk_agent import (
    check_query_out_of_scope,
    tool_search_pgvector_and_memgraph,
    run_google_adk_agent,
    TELECOM_KEYWORDS,
    ACADEMIC_KEYWORDS
)
from graph.algorithms import (
    calculate_knowledge_decay_risks,
    run_pagerank_expert_finder,
    detect_research_communities,
    find_shortest_provenance_path
)
from sqlalchemy import select, delete


async def run_ontology_tests():
    print("=" * 80)
    print("🧪 RUNNING SESSION 17 TEST: MNEMOGRAPH DYNAMIC ONTOLOGY RESOLVER & GRAPH EXPLORER")
    print("=" * 80)

    # 1. Ensure DB tables exist
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    test_tenant = "test_telco_ontology"

    # Pre-test cleanup
    execute_cypher("MATCH (n {tenant_id: $t}) DETACH DELETE n", {"t": test_tenant})
    async with AsyncSessionLocal() as session:
        await session.execute(delete(models.CompanyTenant).where(models.CompanyTenant.tenant_id == test_tenant))
        await session.execute(delete(models.User).where(models.User.tenant_id == test_tenant))
        await session.commit()

        # Seed test tenant
        tenant_obj = models.CompanyTenant(
            tenant_id=test_tenant,
            company_name="Ontology Telecom Test Corp",
            industry="telecom",
            plan_tier="Enterprise",
            admin_email=f"admin@{test_tenant}.com"
        )
        session.add(tenant_obj)
        await session.commit()

    # -------------------------------------------------------------
    # TEST 1: Dynamic Ontology Out-of-Scope Security Guardrail
    # -------------------------------------------------------------
    print("\n--- TEST 1: Dynamic Industry Vocabulary & Out-of-Scope Guardrail ---")
    
    # 1a. Telecom query under Telecom tenant (Should NOT be out-of-scope)
    telecom_query = "What is the cell site tower outage drop rate in the radio access network?"
    is_telecom_oos = await check_query_out_of_scope(telecom_query, tenant_id=test_tenant, industry="telecom")
    print(f"Telecom Query on Telecom Tenant: is_out_of_scope = {is_telecom_oos}")
    assert is_telecom_oos is False, "Telecom query should be allowed on telecom tenant"

    # 1b. Academic query on Academic tenant (Should NOT be out-of-scope)
    academic_query = "What NSF grants and principal investigator awards are in marine biology?"
    is_academic_oos = await check_query_out_of_scope(academic_query, tenant_id="utc_campus", industry="academic")
    print(f"Academic Query on utc_campus Tenant: is_out_of_scope = {is_academic_oos}")
    assert is_academic_oos is False, "Academic query should be allowed on academic tenant"

    # 1c. Telecom query on Academic tenant (Should BE out-of-scope)
    is_cross_oos = await check_query_out_of_scope("5g base station drop rate and cell outages", tenant_id="utc_campus", industry="academic")
    print(f"Telecom Query on Academic Tenant: is_out_of_scope = {is_cross_oos}")
    assert is_cross_oos is True, "Telecom query should be blocked on academic tenant"

    # 1d. Irrelevant noise query on both (Should BE out-of-scope)
    noise_query = "How do I make chocolate chip cookie dough from scratch?"
    noise_telco = await check_query_out_of_scope(noise_query, tenant_id=test_tenant, industry="telecom")
    noise_academic = await check_query_out_of_scope(noise_query, tenant_id="utc_campus", industry="academic")
    print(f"Noise Query on Telecom: {noise_telco}, Academic: {noise_academic}")
    assert noise_telco is True and noise_academic is True, "Unrelated recipe queries must be blocked on all tenants"
    print("✅ TEST 1 PASSED: Dynamic Ontology Guardrail correctly validates industry vocabularies.")

    # -------------------------------------------------------------
    # TEST 2: Multi-Tenant Neo4j Graph Seeding & Dynamic Traversal
    # -------------------------------------------------------------
    print("\n--- TEST 2: Multi-Tenant Neo4j Graph Seeding & Cypher Traversal ---")
    
    # Seed Neo4j graph nodes and edges for test_tenant
    seed_cypher = """
    CREATE (e1:Employee {
        tenant_id: $t, 
        name: 'Sarah Connor', 
        username: 'sconnor', 
        department: 'Radio Access Network',
        role: 'Senior RF Specialist',
        employee_number: 'EMP-9001'
    })
    CREATE (e2:Employee {
        tenant_id: $t, 
        name: 'John Connor', 
        username: 'jconnor', 
        department: 'Core Operations',
        role: 'Field Technician',
        employee_number: 'EMP-9002'
    })
    CREATE (site:NetworkSite {
        tenant_id: $t, 
        site_code: 'SITE_99', 
        site_name: 'Metro Apex Tower 99', 
        region: 'North', 
        latitude: 35.0456, 
        longitude: -85.3097
    })
    CREATE (evt:NetworkEvent {
        tenant_id: $t, 
        event_id: 'EVT-7701', 
        event_type: 'Downlink Degradation', 
        severity: 'CRITICAL',
        status: 'OPEN'
    })
    CREATE (tkt:ServiceTicket {
        tenant_id: $t, 
        ticket_number: 'TKT-8801', 
        priority: 'P1', 
        status: 'IN_PROGRESS',
        description: 'Antenna azimuth misalignment at Tower 99'
    })
    CREATE (dept:Department {
        tenant_id: $t, 
        name: 'Radio Access Network',
        code: 'RAN'
    })
    CREATE (e1)-[:ASSIGNED_TO]->(tkt)
    CREATE (tkt)-[:AFFECTS]->(site)
    CREATE (evt)-[:OCCURRED_AT]->(site)
    CREATE (e1)-[:BELONGS_TO]->(dept)
    CREATE (e2)-[:REPORTS_TO]->(e1)
    """
    execute_cypher(seed_cypher, {"t": test_tenant})

    # Execute tool traversal
    graph_res = await tool_search_pgvector_and_memgraph(
        query_text="Tower 99 antenna misalignment down degradation",
        top_k=5,
        user_clearance="HighlyConfidential",
        tenant_id=test_tenant,
        industry="telecom"
    )

    nodes = graph_res.get("graph_nodes", [])
    edges = graph_res.get("graph_edges", [])
    print(f"Graph Search returned {len(nodes)} nodes and {len(edges)} edges for tenant '{test_tenant}'")
    assert len(nodes) > 0, "Expected graph nodes for tenant"
    assert any(n.get("type") in ["Employee", "NetworkSite", "ServiceTicket", "NetworkEvent"] for n in nodes), "Expected enterprise node types"
    
    # Verify zero cross-tenant leakage: every node must have tenant_id == test_tenant
    for n in nodes:
        props = n.get("properties", {})
        if "tenant_id" in props:
            assert props["tenant_id"] == test_tenant, f"Node leak detected: {props}"
    print("✅ TEST 2 PASSED: Enterprise entities (:Employee, :NetworkSite, :ServiceTicket) traversed with strict tenant isolation.")

    # -------------------------------------------------------------
    # TEST 3: Domain-Adaptive Graph Algorithms (SPOF, PageRank, Louvain)
    # -------------------------------------------------------------
    print("\n--- TEST 3: Domain-Adaptive Graph Algorithms ---")
    
    # 3a. Knowledge Decay / SPOF Analysis for Enterprise
    spof_risks = calculate_knowledge_decay_risks(tenant_id=test_tenant, top_k=5)
    print(f"Decay risks for enterprise tenant: {len(spof_risks)} nodes identified")
    assert len(spof_risks) > 0, "Expected at least 1 employee analyzed for SPOF"
    top_spof = spof_risks[0]
    print(f"  Top SPOF Employee: {top_spof.faculty_name}, Score: {top_spof.decay_risk_score}, Level: {top_spof.risk_level}")
    print(f"  Recommendation: {top_spof.recommendation}")
    assert "SPOF" in top_spof.recommendation or "technician" in top_spof.recommendation or "solo" in top_spof.recommendation, "Expected enterprise SPOF recommendation"

    # 3b. PageRank Specialist Finder for Enterprise
    rankings = run_pagerank_expert_finder(tenant_id=test_tenant, top_k=5)
    print(f"PageRank experts for enterprise tenant: {len(rankings)} specialists")
    assert len(rankings) > 0, "Expected at least 1 ranked specialist"
    print(f"  Top Specialist: {rankings[0].get('faculty_name')}, Centrality: {rankings[0].get('centrality_rank')}")

    # 3c. Department Communities
    clusters = detect_research_communities(tenant_id=test_tenant)
    print(f"Department clusters for enterprise: {len(clusters)} clusters")
    assert len(clusters) > 0, "Expected department clusters"

    # 3d. Provenance Lineage Path
    path_res = find_shortest_provenance_path(
        start_faculty_name="Sarah Connor",
        target_project_id="SITE_99",
        tenant_id=test_tenant
    )
    print(f"Provenance path nodes: {len(path_res.get('nodes', []))}, edges: {len(path_res.get('edges', []))}")
    assert len(path_res.get("nodes", [])) >= 2, "Expected path connecting Sarah Connor to SITE_99"
    print("✅ TEST 3 PASSED: Domain-Adaptive Algorithms successfully execute SPOF, PageRank, and Provenance.")

    # -------------------------------------------------------------
    # TEST 4: Full Multi-Tenant Google ADK Agent Execution
    # -------------------------------------------------------------
    print("\n--- TEST 4: Google ADK Agent Hybrid Orchestration ---")
    agent_output = await run_google_adk_agent(
        query_text="Investigate Tower 99 antenna misalignment down degradation and assigned field engineer",
        top_k=5,
        user_clearance="HighlyConfidential",
        tenant_id=test_tenant,
        industry="telecom"
    )

    print(f"Agent Execution Output:")
    print(f"  Query: {agent_output.get('query')}")
    print(f"  Is Out of Scope: {agent_output.get('is_out_of_scope')}")
    print(f"  Stages Count: {len(agent_output.get('stages', []))}")
    print(f"  Graph Nodes: {len(agent_output.get('graph_nodes', []))}")
    print(f"  Execution Time: {agent_output.get('execution_time_ms')} ms")
    
    assert agent_output.get("is_out_of_scope") is False, "Query should be processed within enterprise scope"
    assert len(agent_output.get("stages", [])) >= 3, "Stages should include thinking, graph traversal, and knowledge search"
    assert len(agent_output.get("graph_nodes", [])) > 0, "Graph nodes should be populated from Neo4j traversal"
    print("✅ TEST 4 PASSED: Google ADK Agent successfully generates dynamic multi-tenant operational response.")

    # -------------------------------------------------------------
    # Cleanup Test Tenant
    # -------------------------------------------------------------
    execute_cypher("MATCH (n {tenant_id: $t}) DETACH DELETE n", {"t": test_tenant})
    async with AsyncSessionLocal() as session:
        await session.execute(delete(models.CompanyTenant).where(models.CompanyTenant.tenant_id == test_tenant))
        await session.commit()

    print("\n" + "=" * 80)
    print("🎉 ALL SESSION 17 DYNAMIC ONTOLOGY RESOLVER TESTS PASSED CLEANLY!")
    print("=" * 80)


if __name__ == "__main__":
    asyncio.run(run_ontology_tests())
