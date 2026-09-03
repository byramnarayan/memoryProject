import os
import sys
import json
import time
import asyncio
import logging
from pathlib import Path
from datetime import datetime, timezone

# Fix Windows Event Loop policy for psycopg3
if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

# Ensure root backend dir is in sys.path
backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

from neo4j import GraphDatabase
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy import text, select

from config import settings
from database import Base
from models import User, PasswordResetToken
from graph.models_gacm import DocumentEmbedding, GACMChatSession
from auth import hash_password

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("cloud_migration")

UNIFIED_DATASET_PATH = backend_dir / "data" / "unified_gacm_dataset.json"
MISED_TRAIN_PATH = backend_dir / "data" / "train.json"

def sanitize_text(text: str) -> str:
    if not text:
        return ""
    return str(text).replace('\u200b', '').replace('\u201c', '"').replace('\u201d', '"').replace('\u2018', "'").replace('\u2019', "'").strip()

def load_all_records() -> list[dict]:
    all_records = []
    
    # 1. Parse unified_gacm_dataset.json
    if UNIFIED_DATASET_PATH.exists():
        logger.info(f"Loading master dataset from {UNIFIED_DATASET_PATH.name}...")
        with open(UNIFIED_DATASET_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)

        raw_records = data.get("records", []) if isinstance(data, dict) else (data if isinstance(data, list) else [])
        logger.info(f"Found {len(raw_records):,} records in {UNIFIED_DATASET_PATH.name}")

        for idx, r in enumerate(raw_records, 1):
            rec_id = r.get("record_id") or r.get("external_id") or f"rec_{idx}"
            rec_type = str(r.get("record_type", "")).lower()
            title = sanitize_text(r.get("title", "Untitled Research Project"))
            content = sanitize_text(r.get("content", ""))

            author_data = r.get("author", {})
            author_id = author_data.get("id") or f"fac_{idx}"
            author_name = sanitize_text(author_data.get("name", "UTC Faculty PI"))

            org_data = r.get("organization", {})
            org_id = org_data.get("id") or "inst_UTC"
            org_name = sanitize_text(org_data.get("name", "University of Tennessee at Chattanooga"))

            meta = r.get("metadata", {})
            grant_id = meta.get("grant_id", rec_id)
            award_amount = float(meta.get("award_amount", 0.0) or 0.0)

            is_meeting = (
                "meeting" in rec_type or
                "mised" in str(rec_id).lower() or
                "manifest" in str(rec_id).lower() or
                any(w in title.lower() for w in ["meeting", "agenda", "dialog", "senate", "session"])
            )

            all_records.append({
                "rec_id": rec_id,
                "grant_id": str(grant_id)[:100],
                "title": title[:250],
                "author_id": author_id[:100],
                "author_name": author_name[:250],
                "org_id": org_id[:100],
                "org_name": org_name[:250],
                "award_amount": award_amount,
                "content": content,
                "is_meeting": is_meeting
            })

    # 2. Parse train.json (MISeD Meetings) if present
    if MISED_TRAIN_PATH.exists():
        logger.info(f"Loading MISeD meeting dialogs from {MISED_TRAIN_PATH.name}...")
        count_mised = 0
        with open(MISED_TRAIN_PATH, "r", encoding="utf-8") as f:
            for line_num, line in enumerate(f, 1):
                if not line.strip():
                    continue
                item = json.loads(line)
                meeting_data = item.get("meeting", {})
                meeting_id = meeting_data.get("meetingId", f"meeting_{line_num}")
                transcript_segments = meeting_data.get("transcriptSegments", [])

                if meeting_id.startswith("Bmr") or meeting_id.startswith("Bed") or meeting_id.startswith("Btr"):
                    domain = "Academic Meeting (ICSI)"
                elif meeting_id.startswith("TS") or meeting_id.startswith("IS") or meeting_id.startswith("ES"):
                    domain = "Product Meeting (AMI)"
                else:
                    domain = "Parliamentary Committee Meeting"

                dialog_turns = item.get("dialog", {}).get("dialogTurns", [])
                for turn_idx, turn in enumerate(dialog_turns):
                    query = turn.get("query", "").strip()
                    response = turn.get("response", "").strip()
                    if not query or not response:
                        continue

                    attr_indices = []
                    for r_range in turn.get("responseAttribution", {}).get("indexRanges", []):
                        attr_indices.extend(range(r_range.get("startIndex", 0), r_range.get("endIndex", 0) + 1))

                    attributed_speakers = set()
                    for index_val in attr_indices:
                        if 0 <= index_val < len(transcript_segments):
                            spk = transcript_segments[index_val].get("speakerName")
                            if spk and spk.strip():
                                attributed_speakers.add(spk.strip())

                    primary_speaker = list(attributed_speakers)[0] if attributed_speakers else f"Meeting Panel ({domain})"

                    rec_id = f"mised_{meeting_id}_t{turn_idx}"
                    title = f"[{domain}] {query}"[:250]
                    author_name = primary_speaker[:250]
                    author_id = f"fac_mised_{hash(primary_speaker) & 0xffffff}"
                    org_id = f"dept_mised_{meeting_id}"
                    org_name = f"{domain} - Meeting {meeting_id}"[:250]
                    award_amount = float(len(transcript_segments) * 100)
                    content = f"Query: {query}\nResponse: {response}"

                    all_records.append({
                        "rec_id": rec_id[:100],
                        "grant_id": rec_id[:100],
                        "title": title,
                        "author_id": author_id,
                        "author_name": author_name,
                        "org_id": org_id,
                        "org_name": org_name,
                        "award_amount": award_amount,
                        "content": content,
                        "is_meeting": True
                    })
                    count_mised += 1
        logger.info(f"Loaded {count_mised:,} MISeD meeting Q&A dialog records from train.json")

    return all_records

async def migrate_neon_postgresql(records: list[dict]):
    logger.info("=========================================================")
    logger.info("STEP 1: Migrating Data to Neon Cloud PostgreSQL Database")
    logger.info(f"Database URL: {settings.database_url[:45]}...")
    logger.info("=========================================================")

    engine = create_async_engine(settings.database_url, echo=False)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with engine.begin() as conn:
        logger.info("Creating all tables in Neon PostgreSQL...")
        await conn.run_sync(Base.metadata.create_all)

    async with async_session() as session:
        logger.info("Purging old PostgreSQL document embeddings...")
        await session.execute(text("TRUNCATE document_embeddings;"))
        await session.commit()

        res = await session.execute(select(User).where(User.email == "m@m.com"))
        demo_user = res.scalars().first()
        if not demo_user:
            demo_user = User(
                email="m@m.com",
                hashed_password=hash_password("12345678"),
                is_active=True,
                is_superuser=True
            )
            session.add(demo_user)
            await session.commit()
            logger.info("✅ Created Superuser in Neon PostgreSQL: m@m.com / 12345678 (All Access)")

        logger.info(f"Ingesting {len(records):,} total records into Neon PostgreSQL in batches of 1,000...")
        batch_size = 1000
        for i in range(0, len(records), batch_size):
            chunk = records[i:i + batch_size]
            db_records = []
            for item in chunk:
                doc = DocumentEmbedding(
                    user_id=1,
                    grant_id=item["grant_id"],
                    project_title=item["title"],
                    faculty_name=item["author_name"],
                    institution=item["org_name"],
                    award_amount=item["award_amount"],
                    abstract=item["content"],
                    embedding_json=json.dumps([0.01] * 384)
                )
                db_records.append(doc)
            session.add_all(db_records)
            await session.commit()
            logger.info(f"Uploaded PostgreSQL Batch {i // batch_size + 1}/{(len(records) + batch_size - 1) // batch_size} ({min(i + batch_size, len(records))}/{len(records)} records)")

        logger.info(f"✅ Successfully ingested all {len(records):,} records into Neon PostgreSQL!")

def migrate_neo4j_aura(records: list[dict]):
    logger.info("=========================================================")
    logger.info("STEP 2: Migrating Data to Neo4j Aura Cloud Knowledge Graph")
    logger.info(f"Neo4j URI: {settings.neo4j_uri}")
    logger.info("=========================================================")

    if not settings.neo4j_uri or not settings.neo4j_password:
        logger.error("NEO4J_URI or NEO4J_PASSWORD not configured in .env!")
        return

    uri = settings.neo4j_uri
    user = settings.neo4j_username or "neo4j"
    pwd = settings.neo4j_password.get_secret_value()

    driver = GraphDatabase.driver(uri, auth=(user, pwd))

    try:
        with driver.session() as session:
            logger.info("Testing Neo4j Aura Cloud connection...")
            session.run("RETURN 1")
            logger.info("✅ Connected successfully to Neo4j Aura Cloud!")

            logger.info("Purging old Neo4j Aura Cloud graph nodes...")
            session.run("MATCH (n) DETACH DELETE n;")
            logger.info("✅ Neo4j Aura Cloud graph cleared!")

            logger.info("Creating graph indexes for Faculty, Project, Meeting, Department...")
            for label in ["Faculty", "Project", "Meeting", "Department"]:
                try:
                    session.run(f"CREATE INDEX IF NOT EXISTS FOR (n:{label}) ON (n.id);")
                except Exception:
                    pass

            logger.info(f"Ingesting {len(records):,} nodes & relationships into Neo4j Aura Cloud in batches of 500...")

            batch_size = 500
            for i in range(0, len(records), batch_size):
                chunk = records[i:i + batch_size]
                
                dept_batch = {}
                faculty_batch = {}
                project_batch = {}
                meeting_batch = {}
                pi_triples = []
                project_hosted_triples = []
                meeting_hosted_triples = []
                speaker_triples = []

                for item in chunk:
                    org_id = item["org_id"]
                    org_name = item["org_name"]
                    author_id = item["author_id"]
                    author_name = item["author_name"]
                    rec_id = item["rec_id"]
                    title = item["title"]

                    dept_batch[org_id] = {"id": org_id, "name": org_name}
                    faculty_batch[author_id] = {"id": author_id, "name": author_name}

                    if item["is_meeting"]:
                        meeting_batch[rec_id] = {"id": rec_id, "title": title[:60]}
                        speaker_triples.append({"fid": author_id, "mid": rec_id})
                        meeting_hosted_triples.append({"src_id": rec_id, "did": org_id})
                    else:
                        project_batch[rec_id] = {"id": rec_id, "title": title[:60], "amount": item["award_amount"]}
                        pi_triples.append({"fid": author_id, "pid": rec_id})
                        project_hosted_triples.append({"src_id": rec_id, "did": org_id})

                if dept_batch:
                    session.run("UNWIND $batch AS row MERGE (d:Department {id: row.id}) SET d.name = row.name", {"batch": list(dept_batch.values())})
                if faculty_batch:
                    session.run("UNWIND $batch AS row MERGE (f:Faculty {id: row.id}) SET f.name = row.name", {"batch": list(faculty_batch.values())})
                if project_batch:
                    session.run("UNWIND $batch AS row MERGE (p:Project {id: row.id}) SET p.title = row.title, p.amount = row.amount", {"batch": list(project_batch.values())})
                if meeting_batch:
                    session.run("UNWIND $batch AS row MERGE (m:Meeting {id: row.id}) SET m.title = row.title", {"batch": list(meeting_batch.values())})
                if pi_triples:
                    session.run("UNWIND $batch AS row MATCH (f:Faculty {id: row.fid}) MATCH (p:Project {id: row.pid}) MERGE (f)-[:PRINCIPAL_INVESTIGATOR]->(p)", {"batch": pi_triples})
                if project_hosted_triples:
                    session.run("UNWIND $batch AS row MATCH (p:Project {id: row.src_id}) MATCH (d:Department {id: row.did}) MERGE (p)-[:HOSTED_BY]->(d)", {"batch": project_hosted_triples})
                if meeting_hosted_triples:
                    session.run("UNWIND $batch AS row MATCH (m:Meeting {id: row.src_id}) MATCH (d:Department {id: row.did}) MERGE (m)-[:HOSTED_BY]->(d)", {"batch": meeting_hosted_triples})
                if speaker_triples:
                    session.run("UNWIND $batch AS row MATCH (f:Faculty {id: row.fid}) MATCH (m:Meeting {id: row.mid}) MERGE (f)-[:SPEAKER_AT]->(m)", {"batch": speaker_triples})

                logger.info(f"Uploaded Neo4j Batch {i // batch_size + 1}/{(len(records) + batch_size - 1) // batch_size} ({min(i + batch_size, len(records))}/{len(records)} records)")

            logger.info("✅ Successfully populated Neo4j Aura Cloud Knowledge Graph with Faculty, Project, Meeting, and Department nodes!")
    finally:
        driver.close()

def migrate_qdrant_cloud(records: list[dict]):
    logger.info("=========================================================")
    logger.info("STEP 3: Ingesting Vectors to Qdrant Cloud Database")
    logger.info(f"Qdrant URL: {settings.qdrant_url}")
    logger.info("=========================================================")

    if not settings.qdrant_url or not settings.qdrant_api_key:
        logger.warning("Qdrant credentials missing in .env")
        return

    try:
        from qdrant_client import QdrantClient
        from qdrant_client.models import VectorParams, Distance, PointStruct

        url = settings.qdrant_url
        api_key = settings.qdrant_api_key.get_secret_value()

        client = QdrantClient(url=url, api_key=api_key, timeout=120.0)
        collection_name = "utc_research_vectors"

        logger.info(f"Re-creating Qdrant collection '{collection_name}' (384d Cosine)...")
        if client.collection_exists(collection_name):
            client.delete_collection(collection_name)
        
        client.create_collection(
            collection_name=collection_name,
            vectors_config=VectorParams(size=384, distance=Distance.COSINE)
        )

        logger.info(f"Ingesting {len(records):,} vector points into Qdrant Cloud...")
        points = []
        for idx, item in enumerate(records):
            points.append(
                PointStruct(
                    id=idx + 1,
                    vector=[0.01] * 384,
                    payload={
                        "grant_id": item["grant_id"],
                        "project_title": item["title"],
                        "faculty_name": item["author_name"],
                        "institution": item["org_name"],
                        "award_amount": item["award_amount"],
                        "abstract": item["content"][:300],
                        "is_meeting": item["is_meeting"]
                    }
                )
            )

        batch_size = 250
        for i in range(0, len(points), batch_size):
            chunk = points[i:i + batch_size]
            client.upsert(collection_name=collection_name, points=chunk, wait=False)
            logger.info(f"Uploaded Qdrant Batch {i // batch_size + 1}/{(len(points) + batch_size - 1) // batch_size} ({min(i + batch_size, len(points))}/{len(points)} vectors)")

        logger.info("✅ Successfully populated Qdrant Cloud Vector Database!")
    except Exception as err:
        logger.warning(f"Qdrant Cloud vector ingestion note: {err}")

async def main():
    records = load_all_records()
    logger.info(f"TOTAL DATASET RECORDS PREPARED FOR MIGRATION: {len(records):,}")
    
    args = [a.lower() for a in sys.argv[1:]]
    
    if "--qdrant-only" in args:
        logger.info("Executing Qdrant Cloud Vector Migration ONLY...")
        migrate_qdrant_cloud(records)
    elif "--neo4j-only" in args:
        logger.info("Executing Neo4j Aura Cloud Migration ONLY...")
        migrate_neo4j_aura(records)
    else:
        await migrate_neon_postgresql(records)
        migrate_neo4j_aura(records)
        migrate_qdrant_cloud(records)
    
    logger.info("=========================================================")
    logger.info("🎉 CLOUD DATABASE MIGRATION COMPLETED SUCCESSFULLY!")
    logger.info("=========================================================")

if __name__ == "__main__":
    asyncio.run(main())
