import os
import sys
import json
import asyncio
import logging
from pathlib import Path
from datetime import datetime, timezone

# Ensure Windows Selector Event Loop for psycopg3
if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

from sqlalchemy import select, func, text
from database import engine, Base, AsyncSessionLocal
from graph.models_gacm import ResearchMemoryObject, DocumentEmbedding
from models import User

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("test_canonical_schema")

async def run_canonical_schema_test():
    print("==================================================================")
    print("MaaS SESSION 01: CANONICAL RESEARCH MEMORY OBJECT SCHEMA TEST")
    print("==================================================================")

    # 1. Initialize tables
    print("\n[1/4 INITIALIZING DATABASE SCHEMAS]")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    print("  -> Base.metadata.create_all executed successfully.")

    async with AsyncSessionLocal() as session:
        # 2. Check table in information_schema
        print("\n[2/4 VERIFYING RELATIONAL TABLE STRUCTURE]")
        res = await session.execute(
            text("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'research_memory_objects' ORDER BY ordinal_position;")
        )
        columns = res.fetchall()
        print(f"  -> Found {len(columns)} columns in 'research_memory_objects':")
        for col, dtype in columns[:8]:
            print(f"     * {col:<22} ({dtype})")
        print(f"     * ... and {len(columns) - 8} additional columns.")

        assert len(columns) > 15, "Expected research_memory_objects to contain > 15 columns"

        # 3. Insert and verify test ResearchMemoryObject
        print("\n[3/4 INSERTING TEST CANONICAL RESEARCH MEMORY]")
        test_mem_id = "MEM-TEST-999999"
        
        # Clean up any previous test record
        existing = await session.execute(
            select(ResearchMemoryObject).where(ResearchMemoryObject.memory_id == test_mem_id)
        )
        prev = existing.scalar_one_or_none()
        if prev:
            await session.delete(prev)
            await session.commit()

        test_mem = ResearchMemoryObject(
            memory_id=test_mem_id,
            tenant_id="utc_campus",
            user_id=1,
            domain="research_university",
            category="Document",
            memory_type="GrantAward",
            severity="Major",
            sensitivity_level="Restricted",
            lifecycle_stage="Awarded",
            tier="short_term",
            title="NSF Cyberinfrastructure for Autonomous Oceanic Research",
            raw_text="This project establishes scalable cyberinfrastructure for real-time robotic maritime telemetry.",
            source_system="Cayuse_Grants",
            confidence_score=98.5,
            needs_review=False
        )
        test_mem.set_derived_summaries({
            "short_summary": "Scalable cyberinfrastructure for autonomous ocean robotics.",
            "detailed_summary": "Establishes edge-computing telemetry nodes across UTC autonomous underwater research vehicles.",
            "compliance_summary": {"milestone": "Year 1 Audit Review", "deadline": "2027-01-15"}
        })
        test_mem.set_entities({
            "pi_name": "Dr. Sarah Jenkins",
            "co_pi_names": ["Dr. Alan Turing"],
            "sponsor_agency": "National Science Foundation",
            "award_amount": 750000.0,
            "cfda_code": "47.070",
            "department": "Computer Science & Engineering"
        })
        test_mem.set_relations([
            {"memoryId": "MEM-GRT-000102", "relationType": "renewalOf", "score": 0.95, "reason": "Predecessor telemetry grant"}
        ])
        test_mem.set_tags(["oceanography", "cyberinfrastructure", "nsf", "robotics"])
        test_mem.set_embedding([0.05] * 384)

        session.add(test_mem)
        await session.commit()
        print(f"  -> Created test record: {test_mem.memory_id} (ID: {test_mem.id})")

        # Query back and verify getters
        queried_res = await session.execute(
            select(ResearchMemoryObject).where(ResearchMemoryObject.memory_id == test_mem_id)
        )
        queried = queried_res.scalar_one_or_none()
        assert queried is not None, "Failed to retrieve test record"
        assert queried.sensitivity_level == "Restricted", f"Expected Restricted, got {queried.sensitivity_level}"
        assert queried.get_entities()["pi_name"] == "Dr. Sarah Jenkins"
        assert queried.get_derived_summaries()["short_summary"].startswith("Scalable cyberinfrastructure")
        assert len(queried.get_relations()) == 1
        assert len(queried.get_embedding()) == 384

        print("  -> Getter assertions passed:")
        print(f"     * PI Name: {queried.get_entities().get('pi_name')}")
        print(f"     * Sponsor: {queried.get_entities().get('sponsor_agency')} ($ {queried.get_entities().get('award_amount'):,})")
        print(f"     * Sensitivity Tier: {queried.sensitivity_level}")
        print(f"     * Tags: {queried.get_tags()}")
        print(f"     * Relations: {queried.get_relations()}")

        # Clean up test record
        await session.delete(queried)
        await session.commit()
        print("  -> Cleaned up test record.")

        # 4. Check count of existing synchronized records
        print("\n[4/4 TOTAL MEMORY AUDIT]")
        count_res = await session.execute(select(func.count(ResearchMemoryObject.id)))
        canonical_count = count_res.scalar() or 0
        doc_count_res = await session.execute(select(func.count(DocumentEmbedding.id)))
        doc_count = doc_count_res.scalar() or 0

        print(f"  -> Total records in 'research_memory_objects': {canonical_count:,}")
        print(f"  -> Total records in 'document_embeddings': {doc_count:,}")

    print("\n==================================================================")
    print("SUCCESS: Session 01 Canonical Schema Verification Passed!")
    print("==================================================================")

if __name__ == "__main__":
    asyncio.run(run_canonical_schema_test())
