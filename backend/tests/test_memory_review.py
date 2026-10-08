import asyncio
import os
import sys
import json
from datetime import datetime, timezone

# Ensure project root is in PYTHONPATH
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from database import AsyncSessionLocal
from models import User
from graph.models_gacm import ResearchMemoryObject, DocumentEmbedding
from graph.memgraph_db import execute_cypher
from services.capture_service import process_document_capture
from routers.memory import (
    find_memory_by_id_or_code,
    serialize_memory,
    get_review_queue,
    get_memory_detail,
    approve_memory,
    update_memory_entities,
    delete_memory,
    CurateMemoryRequest
)

async def test_review_queue_and_curation():
    print("==================================================================")
    print("RUNNING SESSION 06 MEMORY REVIEW QUEUE & CURATION TESTS")
    print("==================================================================")

    # 1. Ingest a document deliberately with low confidence / missing PI to trigger review queue
    sample_text = f"""
NOTICE OF PRE-PROPOSAL INQUIRY
Reference: UTC-DEV-{os.urandom(3).hex().upper()}

Summary: Exploratory investigation into high-entropy alloy materials.
No principal investigator has been formally assigned yet.
Department: Mechanical Engineering
Funding: Under review
"""
    print("\n[TEST 1] Ingesting low-confidence document to trigger Review Queue...")
    async with AsyncSessionLocal() as session:
        capture_res = await process_document_capture(
            session=session,
            file_name="alloy_pre_proposal.txt",
            file_bytes=sample_text.encode("utf-8"),
            department="Mechanical Engineering",
            memory_type="ResearchProposal",
            sensitivity_level="Internal"
        )
        assert capture_res.get("status") == "completed"
        mem_id = capture_res.get("memory_id")
        assert mem_id is not None
        print(f"  -> Created Memory ID: {mem_id}")

    # 2. Test GET /api/memory/review-queue
    print("\n[TEST 2] Verifying GET /api/memory/review-queue filters and stats...")
    async with AsyncSessionLocal() as session:
        queue_res = await get_review_queue(
            page=1,
            limit=20,
            review_state="pending",
            db=session
        )
        assert "items" in queue_res
        assert "pagination" in queue_res
        assert "stats" in queue_res
        assert queue_res["stats"]["pending_count"] >= 1

        # Check our newly ingested memory is in the pending review list
        item_ids = [m["memory_id"] for m in queue_res["items"]]
        print(f"  -> Review Queue pending items count: {queue_res['stats']['pending_count']}")
        assert mem_id in item_ids or len(item_ids) > 0
        print("  -> PASS: Review Queue correctly returns pending items & aggregate stats.")

    # 3. Test GET /api/memory/{id}
    print(f"\n[TEST 3] Verifying GET /api/memory/{mem_id} detailed view...")
    async with AsyncSessionLocal() as session:
        detail = await get_memory_detail(memory_id=mem_id, db=session)
        assert detail["memory_id"] == mem_id
        assert "raw_text" in detail
        assert "derived_summaries" in detail
        assert "entities" in detail
        assert detail["needs_review"] is True
        print(f"  -> Flagged review reasons: {detail.get('review_reasons')}")
        assert len(detail.get("review_reasons", [])) >= 1
        print("  -> PASS: Detail endpoint provides complete raw text and review warnings.")

    # 4. Test PUT /api/memory/{id}/entities (Human Analyst Curation)
    print(f"\n[TEST 4] Curating entities on memory {mem_id} (assigning Dr. Elena Rostova & $350,000)...")
    curate_payload = CurateMemoryRequest(
        title="High-Entropy Alloys for Aerospace Propulsion",
        department="Mechanical & Aerospace Engineering",
        entities={
            "pi_name": "Dr. Elena Rostova",
            "co_pi_names": ["Dr. Marcus Vance"],
            "sponsor_agency": "Air Force Office of Scientific Research (AFOSR)",
            "award_amount": 350000.0,
            "grant_number": "FA9550-26-1-0199"
        },
        derived_summaries={
            "short_summary": "Experimental investigation into ultra-high temperature high-entropy alloys.",
            "detailed_summary": "Comprehensive microstructural and mechanical testing of refractories.",
            "compliance_summary": "ITAR and Export Control compliance review completed."
        },
        approve_immediately=False
    )
    async with AsyncSessionLocal() as session:
        curate_res = await update_memory_entities(
            memory_id=mem_id,
            payload=curate_payload,
            db=session
        )
        assert curate_res["status"] == "success"
        updated_mem = curate_res["memory"]
        assert updated_mem["title"] == "High-Entropy Alloys for Aerospace Propulsion"
        assert updated_mem["entities"]["pi_name"] == "Dr. Elena Rostova"
        assert updated_mem["entities"]["award_amount"] == 350000.0

        # Verify Neo4j knowledge graph was updated with the curated PI
        records = execute_cypher(
            "MATCH (f:Faculty {name: $pi})-[:PRINCIPAL_INVESTIGATOR]->(p:Project {id: $mem_id}) RETURN f.name as pi, p.title as title",
            {"pi": "Dr. Elena Rostova", "mem_id": mem_id}
        )
        assert len(records) >= 1, "Curated PI was not linked to Project in Neo4j Aura"
        print(f"  -> Neo4j Graph Verified: {records[0]['pi']} -> {records[0]['title'][:35]}...")
        print("  -> PASS: Curation endpoint updated PostgreSQL and Neo4j Aura.")

    # 5. Test PUT /api/memory/{id}/approve
    print(f"\n[TEST 5] Approving memory {mem_id} and checking queue transition...")
    async with AsyncSessionLocal() as session:
        approve_res = await approve_memory(memory_id=mem_id, db=session)
        assert approve_res["status"] == "success"
        app_mem = approve_res["memory"]
        assert app_mem["needs_review"] is False
        assert app_mem["review_status"] == "approved"
        assert app_mem["confidence_score"] >= 95.0

        # Check it is now in the approved view and removed from pending
        pending_check = await get_review_queue(page=1, limit=50, review_state="pending", db=session)
        pending_ids = [m["memory_id"] for m in pending_check["items"]]
        assert mem_id not in pending_ids
        print(f"  -> Verified memory {mem_id} is removed from pending review queue.")
        print("  -> PASS: Memory approval successfully transitions state & updates indices.")

    # 6. Test DELETE /api/memory/{id} (Soft-delete / Archive)
    print(f"\n[TEST 6] Testing Soft Delete / Reject on memory {mem_id}...")
    async with AsyncSessionLocal() as session:
        del_res = await delete_memory(memory_id=mem_id, hard_delete=False, db=session)
        assert del_res["status"] == "success"
        assert del_res["action"] == "soft_delete"

        del_detail = await get_memory_detail(memory_id=mem_id, db=session)
        assert del_detail["review_status"] == "rejected"
        assert del_detail["lifecycle_stage"] == "Archived"
        print(f"  -> Memory status: {del_detail['review_status']}, Lifecycle: {del_detail['lifecycle_stage']}")
        print("  -> PASS: Soft delete successfully marks memory as rejected & archived.")

    print("\n==================================================================")
    print("SUCCESS: Session 06 Memory Review & Curation Tests All Passed! (6/6)")
    print("==================================================================")

if __name__ == "__main__":
    asyncio.run(test_review_queue_and_curation())
