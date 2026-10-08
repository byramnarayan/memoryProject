import os
import sys
import json
import hashlib
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
from models import User
from graph.models_gacm import DocumentEmbedding, ResearchMemoryObject

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("sync_canonical_memory")

BATCH_SIZE = 500

async def sync_canonical_memory(limit: int | None = None):
    """
    Creates research_memory_objects table if missing and synchronizes records
    from document_embeddings into the Canonical ResearchMemoryObject structure.
    """
    logger.info("Step 1: Initializing database tables...")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with AsyncSessionLocal() as session:
        # Check source records
        doc_count_res = await session.execute(select(func.count(DocumentEmbedding.id)))
        total_source_docs = doc_count_res.scalar() or 0
        logger.info(f"Found {total_source_docs:,} records in 'document_embeddings'.")

        if total_source_docs == 0:
            logger.warning("No records in 'document_embeddings' to synchronize.")
            return

        # Check existing canonical records
        mem_count_res = await session.execute(select(func.count(ResearchMemoryObject.id)))
        existing_mems = mem_count_res.scalar() or 0
        logger.info(f"Currently {existing_mems:,} records in 'research_memory_objects'.")

        if existing_mems >= total_source_docs and limit is None:
            logger.info("All records are already synchronized in 'research_memory_objects'.")
            return

        target_total = min(total_source_docs, limit) if limit else total_source_docs
        logger.info(f"Starting migration to sync up to {target_total:,} records...")

        # Process in batches
        offset = existing_mems
        migrated_count = 0

        while offset < target_total:
            batch_limit = min(BATCH_SIZE, target_total - offset)
            stmt = (
                select(DocumentEmbedding)
                .order_by(DocumentEmbedding.id.asc())
                .offset(offset)
                .limit(batch_limit)
            )
            res = await session.execute(stmt)
            batch = res.scalars().all()

            if not batch:
                break

            canonical_batch = []
            for d in batch:
                is_meeting = (
                    "meeting" in (d.grant_id or "").lower()
                    or "mised" in (d.grant_id or "").lower()
                    or "dialog" in (d.abstract or "").lower()[:100]
                )

                mem_id_prefix = "MEM-MTG" if is_meeting else "MEM-GRT"
                mem_id = f"{mem_id_prefix}-{d.id:06d}"

                abstract_clean = (d.abstract or "").strip()
                content_hash = hashlib.sha256(abstract_clean.encode("utf-8")).hexdigest()

                short_summary = abstract_clean[:200] + ("..." if len(abstract_clean) > 200 else "")
                detailed_summary = abstract_clean

                derived_summaries = {
                    "short_summary": short_summary,
                    "detailed_summary": detailed_summary,
                    "compliance_summary": {
                        "award_amount": d.award_amount,
                        "start_date": d.start_date,
                        "grant_id": d.grant_id
                    }
                }

                entities = {
                    "pi_name": d.faculty_name,
                    "co_pi_names": [],
                    "award_amount": d.award_amount,
                    "institution": d.institution,
                    "grant_id": d.grant_id,
                    "start_date": d.start_date,
                    "department": "University Research Division"
                }

                source_ref = {
                    "externalId": d.grant_id,
                    "legacyDocId": d.id,
                    "institution": d.institution
                }

                mem = ResearchMemoryObject(
                    memory_id=mem_id,
                    tenant_id="utc_campus",
                    user_id=d.user_id if d.user_id else 1,
                    domain="research_university",
                    category="Conversational" if is_meeting else "Document",
                    memory_type="MeetingMinutes" if is_meeting else "GrantAward",
                    severity="Info",
                    sensitivity_level="Public",
                    lifecycle_stage="Active" if is_meeting else "Awarded",
                    tier="short_term",
                    title=d.project_title or "Untitled Research Record",
                    raw_text=abstract_clean,
                    source_system="MISeD_Corpus" if is_meeting else "NSF_Awards",
                    source_ref_json=json.dumps(source_ref),
                    derived_summaries_json=json.dumps(derived_summaries),
                    entities_json=json.dumps(entities),
                    relations_json=json.dumps([]),
                    tags_json=json.dumps(["nsf", "research"] if not is_meeting else ["meeting", "agenda"]),
                    embedding_json=d.embedding_json,
                    content_hash=content_hash,
                    confidence_score=100.0,
                    needs_review=False,
                    review_status="approved",
                    created_at=d.created_at or datetime.now(timezone.utc),
                    updated_at=d.created_at or datetime.now(timezone.utc)
                )
                canonical_batch.append(mem)

            session.add_all(canonical_batch)
            await session.commit()

            migrated_count += len(canonical_batch)
            offset += len(canonical_batch)
            logger.info(f"  Synced batch: {migrated_count:,} / {target_total - existing_mems:,} records (Total in table: {offset:,})")

        logger.info(f"Migration completed successfully. Synced {migrated_count:,} records.")

if __name__ == "__main__":
    # If a limit argument is passed, e.g. python sync_canonical_memory.py 1000
    lim = int(sys.argv[1]) if len(sys.argv) > 1 else None
    asyncio.run(sync_canonical_memory(lim))
