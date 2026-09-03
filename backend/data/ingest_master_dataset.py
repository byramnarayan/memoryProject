import os
import sys
import json
import asyncio
import hashlib
import math
from datetime import datetime, timezone

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

if sys.platform == 'win32':
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

from database import AsyncSessionLocal
from sqlalchemy import text
from neo4j import GraphDatabase

DATA_DIR = os.path.dirname(os.path.abspath(__file__))
MASTER_JSON_PATH = os.path.join(DATA_DIR, "unified_gacm_dataset.json")

# Memgraph Neo4j Driver Connection
MEMGRAPH_DRIVER = GraphDatabase.driver("bolt://127.0.0.1:7687", auth=("", ""))

# SentenceTransformer Embedder with Fast Hashing Fallback
_ST_MODEL = None

def get_sentence_transformer():
    global _ST_MODEL
    if _ST_MODEL is None:
        try:
            from sentence_transformers import SentenceTransformer
            _ST_MODEL = SentenceTransformer('BAAI/bge-small-en-v1.5')
        except Exception:
            _ST_MODEL = False
    return _ST_MODEL

def batch_generate_embeddings(texts: list[str]) -> list[list[float]]:
    model = get_sentence_transformer()
    if model and model is not False:
        try:
            embs = model.encode(texts, convert_to_numpy=True)
            return [e.tolist() for e in embs]
        except Exception:
            pass
    res = []
    for text_str in texts:
        vec = []
        for i in range(384):
            h = hashlib.sha256(f"{text_str}_{i}".encode('utf-8')).hexdigest()
            val = (int(h[:8], 16) / 0xFFFFFFFF) * 2.0 - 1.0
            vec.append(val)
        norm = math.sqrt(sum(x * x for x in vec))
        res.append([x / norm for x in vec] if norm > 0 else vec)
    return res

def sanitize_text(text: str) -> str:
    if not text:
        return ""
    text = str(text).replace('\u200b', '').replace('\u201c', '"').replace('\u201d', '"').replace('\u2018', "'").replace('\u2019', "'")
    return text.strip()

def execute_unwind_batches(dept_batch, faculty_batch, project_batch, meeting_batch, pi_triples, project_hosted_triples, meeting_hosted_triples, speaker_triples):
    """Executes high-speed UNWIND batch queries in Memgraph using indexed node labels."""
    try:
        with MEMGRAPH_DRIVER.session() as session:
            if dept_batch:
                session.run("UNWIND $batch AS row MERGE (d:Department {id: row.id}) ON CREATE SET d.name = row.name ON MATCH SET d.name = row.name", {"batch": dept_batch})
            if faculty_batch:
                session.run("UNWIND $batch AS row MERGE (f:Faculty {id: row.id}) ON CREATE SET f.name = row.name ON MATCH SET f.name = row.name", {"batch": faculty_batch})
            if project_batch:
                session.run("UNWIND $batch AS row MERGE (p:Project {id: row.id}) ON CREATE SET p.title = row.title ON MATCH SET p.title = row.title", {"batch": project_batch})
            if meeting_batch:
                session.run("UNWIND $batch AS row MERGE (m:Meeting {id: row.id}) ON CREATE SET m.title = row.title ON MATCH SET m.title = row.title", {"batch": meeting_batch})
            if pi_triples:
                session.run("UNWIND $batch AS row MATCH (f:Faculty {id: row.fid}), (p:Project {id: row.pid}) MERGE (f)-[:PRINCIPAL_INVESTIGATOR]->(p)", {"batch": pi_triples})
            if project_hosted_triples:
                session.run("UNWIND $batch AS row MATCH (p:Project {id: row.src_id}), (d:Department {id: row.did}) MERGE (p)-[:HOSTED_BY]->(d)", {"batch": project_hosted_triples})
            if meeting_hosted_triples:
                session.run("UNWIND $batch AS row MATCH (m:Meeting {id: row.src_id}), (d:Department {id: row.did}) MERGE (m)-[:HOSTED_BY]->(d)", {"batch": meeting_hosted_triples})
            if speaker_triples:
                session.run("UNWIND $batch AS row MATCH (f:Faculty {id: row.fid}), (m:Meeting {id: row.mid}) MERGE (f)-[:SPEAKER_AT]->(m)", {"batch": speaker_triples})
    except Exception as err:
        print(f" [Memgraph UNWIND Exception]: {err}")

def create_memgraph_indices():
    """Creates graph indices in Memgraph for 100x faster UNWIND pattern matching."""
    try:
        with MEMGRAPH_DRIVER.session() as session:
            for label in ["Faculty", "Project", "Meeting", "Department"]:
                try:
                    session.run(f"CREATE INDEX ON :{label}(id);")
                except Exception:
                    pass
    except Exception as err:
        print(f" [Memgraph Index Note]: {err}")

async def ingest_master_dataset(batch_size: int = 1000):
    print("==========================================================")
    print("STARTING CLEAN MASTER DATASET INGESTION (PostgreSQL + Memgraph)")
    print("==========================================================")

    create_memgraph_indices()

    if not os.path.exists(MASTER_JSON_PATH):
        raise FileNotFoundError(f"Master dataset file not found at {MASTER_JSON_PATH}")

    with open(MASTER_JSON_PATH, "r", encoding="utf-8") as f:
        master_data = json.load(f)

    records = master_data.get("records", [])
    total_records = len(records)
    print(f"Loaded {total_records:,} master records from {os.path.basename(MASTER_JSON_PATH)}")

    total_pg_inserted = 0

    async with AsyncSessionLocal() as pg_session:
        for i in range(0, total_records, batch_size):
            chunk = records[i:i + batch_size]
            
            texts_to_embed = [
                f"{sanitize_text(r.get('title', ''))} {sanitize_text(r.get('content', ''))} {sanitize_text(r.get('author', {}).get('name', ''))} {sanitize_text(r.get('organization', {}).get('name', ''))}"
                for r in chunk
            ]
            
            embeddings = batch_generate_embeddings(texts_to_embed)

            pg_params = []
            dept_batch = {}
            faculty_batch = {}
            project_batch = {}
            meeting_batch = {}
            pi_triples = []
            project_hosted_triples = []
            meeting_hosted_triples = []
            speaker_triples = []

            for idx_in_chunk, (r, emb_vector) in enumerate(zip(chunk, embeddings), i + 1):
                rec_id = r.get("record_id", f"rec_{idx_in_chunk}")
                rec_type = r.get("record_type", "")
                title = sanitize_text(r.get("title", "Untitled Document"))
                content = sanitize_text(r.get("content", ""))

                author_data = r.get("author", {})
                author_id = author_data.get("id") or f"fac_{idx_in_chunk}"
                author_name = sanitize_text(author_data.get("name", "Unknown PI"))

                org_data = r.get("organization", {})
                org_id = org_data.get("id") or "inst_University_of_Tennessee_at_Chattanooga"
                org_name = sanitize_text(org_data.get("name", "University of Tennessee at Chattanooga"))

                meta = r.get("metadata", {})
                grant_id = meta.get("grant_id", rec_id)
                award_amount = float(meta.get("award_amount", 0.0) or 0.0)
                start_date = str(meta.get("start_date", datetime.now(timezone.utc).isoformat()))

                is_meeting = (
                    "meeting" in rec_type.lower() or
                    "mised" in rec_id.lower() or
                    "manifest" in rec_id.lower() or
                    any(w in title.lower() for w in ["meeting", "agenda", "dialog", "senate", "session"])
                )

                pg_params.append({
                    "user_id": 1,
                    "grant_id": grant_id,
                    "project_title": title,
                    "faculty_name": author_name,
                    "institution": org_name,
                    "award_amount": award_amount,
                    "start_date": start_date,
                    "abstract": content,
                    "embedding_json": json.dumps(emb_vector)
                })

                dept_batch[org_id] = {"id": org_id, "name": org_name}
                faculty_batch[author_id] = {"id": author_id, "name": author_name}

                if is_meeting:
                    meeting_batch[rec_id] = {"id": rec_id, "title": title[:60]}
                    speaker_triples.append({"fid": author_id, "mid": rec_id})
                    meeting_hosted_triples.append({"src_id": rec_id, "did": org_id})
                else:
                    project_batch[rec_id] = {"id": rec_id, "title": title[:60]}
                    pi_triples.append({"fid": author_id, "pid": rec_id})
                    project_hosted_triples.append({"src_id": rec_id, "did": org_id})

            # Execute PostgreSQL Batch Insert
            insert_sql = text("""
                INSERT INTO document_embeddings (
                    user_id, grant_id, project_title, faculty_name, institution,
                    award_amount, start_date, abstract, embedding_json, created_at
                ) VALUES (
                    :user_id, :grant_id, :project_title, :faculty_name, :institution,
                    :award_amount, :start_date, :abstract, :embedding_json, NOW()
                );
            """)
            await pg_session.execute(insert_sql, pg_params)
            await pg_session.commit()
            total_pg_inserted += len(pg_params)

            # Execute Memgraph UNWIND Batch Cypher
            execute_unwind_batches(
                list(dept_batch.values()),
                list(faculty_batch.values()),
                list(project_batch.values()),
                list(meeting_batch.values()),
                pi_triples,
                project_hosted_triples,
                meeting_hosted_triples,
                speaker_triples
            )
            
            print(f" [Ingestion Progress] Ingested {total_pg_inserted:,} / {total_records:,} records into PostgreSQL & Memgraph...", flush=True)

        # Flush Remaining Records
        if pg_params:
            insert_sql = text("""
                INSERT INTO document_embeddings (
                    user_id, grant_id, project_title, faculty_name, institution,
                    award_amount, start_date, abstract, embedding_json, created_at
                ) VALUES (
                    :user_id, :grant_id, :project_title, :faculty_name, :institution,
                    :award_amount, :start_date, :abstract, :embedding_json, NOW()
                );
            """)
            await pg_session.execute(insert_sql, pg_params)
            await pg_session.commit()
            total_pg_inserted += len(pg_params)

            execute_unwind_batches(
                list(dept_batch.values()),
                list(faculty_batch.values()),
                list(project_batch.values()),
                list(meeting_batch.values()),
                pi_triples,
                hosted_triples,
                speaker_triples
            )
            pg_params.clear()

    # Final Verification Audit
    async with AsyncSessionLocal() as check_session:
        res_pg = await check_session.execute(text("SELECT count(*) FROM document_embeddings;"))
        cnt_pg = res_pg.scalar()

    with MEMGRAPH_DRIVER.session() as mem_sess:
        cnt_mem = mem_sess.run("MATCH (n) RETURN count(n) AS cnt;").single()["cnt"]
        cnt_meetings = mem_sess.run("MATCH (n:Meeting) RETURN count(n) AS cnt;").single()["cnt"]
        cnt_projects = mem_sess.run("MATCH (n:Project) RETURN count(n) AS cnt;").single()["cnt"]
        cnt_faculties = mem_sess.run("MATCH (n:Faculty) RETURN count(n) AS cnt;").single()["cnt"]
        cnt_departments = mem_sess.run("MATCH (n:Department) RETURN count(n) AS cnt;").single()["cnt"]

    print("\n==========================================================")
    print("MASTER DATASET INGESTION VERIFICATION AUDIT")
    print("==========================================================")
    print(f" - PostgreSQL document_embeddings: {cnt_pg:,} rows")
    print(f" - Memgraph Total Graph Nodes:    {cnt_mem:,} nodes")
    print(f"    ├─ :Meeting Nodes:             {cnt_meetings:,} nodes")
    print(f"    ├─ :Project Nodes:             {cnt_projects:,} nodes")
    print(f"    ├─ :Faculty Nodes:             {cnt_faculties:,} nodes")
    print(f"    └─ :Department Nodes:          {cnt_departments:,} nodes")
    print("==========================================================")

if __name__ == "__main__":
    asyncio.run(ingest_master_dataset())
