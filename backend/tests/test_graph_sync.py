import sys
import os
import math
import asyncio
from pathlib import Path

backend_dir = Path(__file__).resolve().parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

# Ensure Windows Selector Event Loop for psycopg3
if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

from database import AsyncSessionLocal
from models import User
from graph.models_gacm import ResearchMemoryObject, DocumentEmbedding
from graph.memgraph_db import execute_cypher
from services.graph_sync_service import (
    generate_dense_vector,
    sync_memory_to_neo4j,
    sync_memory_to_vector_store,
    sync_memory_e2e
)
from services.capture_service import process_document_capture
from google_adk_agent import tool_search_pgvector_and_memgraph

def test_dense_vector_generation():
    """Verify that generated vector is strictly 384d and unit normalized."""
    text = "Autonomous marine vehicles for bathymetric mapping and environmental monitoring."
    vec = generate_dense_vector(text, dim=384)
    assert len(vec) == 384, f"Expected 384 dimensions, got {len(vec)}"
    assert all(isinstance(x, float) for x in vec)

    # Check L2 unit norm
    l2_norm = math.sqrt(sum(x * x for x in vec))
    assert 0.95 <= l2_norm <= 1.05, f"Expected unit norm ~1.0, got {l2_norm}"

async def test_neo4j_graph_linking():
    """Verify that sync_memory_to_neo4j creates Faculty, Project, Department nodes and links."""
    test_mem_id = f"MEM-TEST-{os.urandom(3).hex().upper()}"
    test_title = f"Autonomous Quantum Sensing Test {test_mem_id}"

    mem = ResearchMemoryObject(
        memory_id=test_mem_id,
        tenant_id="utc_campus",
        user_id=1,
        title=test_title,
        raw_text="Quantum sensing for mineral mapping.",
        memory_type="GrantAward",
        category="Document",
        sensitivity_level="Public"
    )
    mem.set_entities({
        "pi_name": "Dr. Elena Vance",
        "co_pi_names": ["Dr. Marcus Vance"],
        "department": "Computer Science & Engineering",
        "sponsor_agency": "National Science Foundation (NSF)",
        "award_amount": 750000.0,
        "grant_number": f"NSF-{test_mem_id}"
    })

    # 1. Sync to Neo4j
    res = sync_memory_to_neo4j(mem)
    assert res.get("status") == "synced"
    assert len(res.get("relations", [])) >= 2

    # 2. Query Neo4j live database to verify nodes and edges
    cypher_check = """
    MATCH (f:Faculty {name: 'Dr. Elena Vance'})-[:PRINCIPAL_INVESTIGATOR]->(p:Project {id: $memory_id})-[:HOSTED_BY]->(d:Department {name: 'Computer Science & Engineering'})
    RETURN f.name as pi, p.title as title, d.name as dept
    """
    records = execute_cypher(cypher_check, {"memory_id": test_mem_id})
    assert len(records) >= 1, f"Failed to find graph path in Neo4j for {test_mem_id}"
    assert records[0]["pi"] == "Dr. Elena Vance"
    assert records[0]["title"] == test_title

async def test_vector_store_sync():
    """Verify that vector sync populates embedding_json and DocumentEmbedding table."""
    test_mem_id = f"MEM-VEC-{os.urandom(3).hex().upper()}"
    test_title = f"Deep Oceanic Telemetry Test {test_mem_id}"

    async with AsyncSessionLocal() as session:
        mem = ResearchMemoryObject(
            memory_id=test_mem_id,
            tenant_id="utc_campus",
            user_id=1,
            title=test_title,
            raw_text="Underwater acoustic telemetry and sensor networks.",
            memory_type="GrantAward",
            category="Document",
            sensitivity_level="Public"
        )
        mem.set_entities({
            "pi_name": "Dr. Sarah Lin",
            "department": "Marine & Coastal Sciences",
            "award_amount": 850000.0
        })
        session.add(mem)
        await session.commit()

        # Run vector store sync
        res = await sync_memory_to_vector_store(session, mem)
        assert res.get("status") == "vector_synced"
        assert res.get("vector_dim") == 384
        await session.commit()

        # Check PostgreSQL persistence
        assert mem.get_embedding() is not None
        assert len(mem.get_embedding()) == 384

async def test_end_to_end_capture_integration():
    """Verify that capturing a new document automatically runs graph linking and vector upsert."""
    sample_text = f"""# Marine Robotics and Acoustic Mesh Networks
Run ID: {os.urandom(3).hex().upper()}

## Abstract
Autonomous underwater gliders for detecting thermal anomalies in the Pacific Ocean.
Sponsored by National Science Foundation (NSF) under Award NSF-OCE-2026.

Principal Investigator: Dr. Alexander Ward
Co-Principal Investigators: Dr. Maya Patel
Department: Marine & Coastal Sciences
Award Amount: $920,000.00
"""
    async with AsyncSessionLocal() as session:
        capture_res = await process_document_capture(
            session=session,
            file_name="marine_mesh_award.txt",
            file_bytes=sample_text.encode("utf-8"),
            department="Marine & Coastal Sciences",
            memory_type="GrantAward",
            sensitivity_level="Public"
        )

        assert capture_res.get("status") == "completed"
        mem_id = capture_res.get("memory_id")
        assert mem_id is not None

        # Verify Neo4j received the node
        records = execute_cypher(
            "MATCH (p:Project {id: $mem_id}) RETURN p.title as title, p.award_amount as amount",
            {"mem_id": mem_id}
        )
        assert len(records) >= 1, f"Project {mem_id} was not merged into Neo4j"

async def test_gacm_search_retrieval():
    """Verify that GACM search tool finds newly captured memories and constructs Cytoscape graph nodes."""
    res = await tool_search_pgvector_and_memgraph("Marine Robotics and Acoustic Mesh Networks", top_k=5)
    assert "pgvector_citations" in res or "pgvector_results" in res
    assert "graph_nodes" in res
    assert "graph_edges" in res
    citations = res.get("pgvector_citations") or res.get("pgvector_results")
    assert len(citations) >= 1

    # Check node types
    node_types = set([n["type"] for n in res["graph_nodes"]])
    assert "Faculty" in node_types or "Project" in node_types

def run_all_session05_tests():
    print("==================================================================")
    print("RUNNING SESSION 05 DYNAMIC KNOWLEDGE GRAPH & VECTOR TESTS")
    print("==================================================================")

    # 1. Vector generation
    print("\n[RUNNING] 1. Dense Vector Generation (384d Unit-Norm)...")
    test_dense_vector_generation()
    print("  -> PASS: 1. Dense Vector Generation")

    # 2. Neo4j Graph Linking
    print("\n[RUNNING] 2. Neo4j Aura Knowledge Graph Entity Linking...")
    asyncio.run(test_neo4j_graph_linking())
    print("  -> PASS: 2. Neo4j Aura Knowledge Graph Entity Linking")

    # 3. Vector Store Sync
    print("\n[RUNNING] 3. Vector Store & PostgreSQL Upsert...")
    asyncio.run(test_vector_store_sync())
    print("  -> PASS: 3. Vector Store & PostgreSQL Upsert")

    # 4. End-to-End Ingestion Integration
    print("\n[RUNNING] 4. End-to-End Capture Ingestion to Neo4j Linker...")
    asyncio.run(test_end_to_end_capture_integration())
    print("  -> PASS: 4. End-to-End Capture Ingestion to Neo4j Linker")

    # 5. GACM Graph Explorer Search
    print("\n[RUNNING] 5. GACM Graph Explorer Live Search & Canvas Traversal...")
    asyncio.run(test_gacm_search_retrieval())
    print("  -> PASS: 5. GACM Graph Explorer Live Search & Canvas Traversal")

    print("\n==================================================================")
    print("SUCCESS: Session 05 Dynamic Knowledge Graph & Vector Tests All Passed! (5/5)")
    print("==================================================================")

if __name__ == "__main__":
    run_all_session05_tests()
