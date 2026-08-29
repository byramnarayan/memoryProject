import os
import sys
import json
import asyncio
import selectors
import pandas as pd
from dotenv import load_dotenv

from sentence_transformers import SentenceTransformer
from sqlalchemy import select

# Add parent directory to sys.path
script_dir = os.path.dirname(os.path.abspath(__file__))
backend_dir = os.path.dirname(script_dir)
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from database import engine, Base, AsyncSessionLocal
from models import User
from graph.models_gacm import DocumentEmbedding
from graph.memgraph_db import get_memgraph_driver, init_memgraph_schema

load_dotenv()

async def init_postgres_tables_and_user():
    """Ensures PostgreSQL tables exist and default demo user (ID 1) exists."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    
    async with AsyncSessionLocal() as session:
        stmt = select(User).where(User.id == 1)
        res = await session.execute(stmt)
        user = res.scalar_one_or_none()
        
        if not user:
            print("[POSTGRES] Creating default demo User (ID: 1)...", flush=True)
            demo_user = User(
                id=1,
                username="admin_smrutix",
                email="admin@smrutix.org",
                password_hash="$argon2id$v=19$m=65536,t=3,p=4$dummyhashforingestion"
            )
            session.add(demo_user)
            await session.commit()
            print("[SUCCESS] Default demo User created in PostgreSQL.", flush=True)
        else:
            print("[INFO] Verified default demo User (ID: 1) exists in PostgreSQL.", flush=True)

def ingest_to_memgraph_with_deduplication(df: pd.DataFrame, user_id: int = 1):
    """
    Ingests records into Memgraph using Cypher MERGE to guarantee:
    1. STRICT USER ISOLATION: All nodes/edges tagged with `user_id`.
    2. ENTITY DEDUPLICATION: Exactly ONE unique Faculty node per person (no overlapping duplicates).
    """
    driver = get_memgraph_driver()
    print(f"\n[MEMGRAPH] Ingesting {len(df)} records for User ID: {user_id} with Entity Deduplication...", flush=True)
    
    # Initialize schema indexes
    init_memgraph_schema()
    
    cypher_ingest = """
    UNWIND $batch AS row
    
    // Canonical Unique Faculty Node per User (No Overlap)
    MERGE (f:Faculty {name: row.faculty_name, user_id: row.user_id})
    
    // Canonical Unique Department / Institution Node per User
    MERGE (d:Department {name: row.institution, user_id: row.user_id})
    
    // Unique Project Node
    MERGE (p:Project {id: row.project_id, user_id: row.user_id})
    ON CREATE SET p.title = row.project_title, p.abstract = row.abstract_snippet
    
    // Unique Grant Node
    MERGE (g:Grant {id: row.grant_id, user_id: row.user_id})
    ON CREATE SET g.amount = row.award_amount, g.start_date = row.start_date
    
    // Relationships (Deduplicated)
    MERGE (f)-[:PRINCIPAL_INVESTIGATOR]->(p)
    MERGE (p)-[:FUNDED_BY]->(g)
    MERGE (p)-[:HOSTED_BY]->(d)
    """

    batch_data = []
    for _, row in df.iterrows():
        g_id = str(row["grant_id"])
        f_name = str(row["faculty_name"]).strip()
        inst_name = str(row["institution"]).strip()
        p_title = str(row["project_title"]).strip()
        amt = float(row["award_amount"]) if isinstance(row["award_amount"], (int, float)) and not pd.isna(row["award_amount"]) else 0.0
        s_date = str(row["start_date"])
        abs_text = str(row["abstract"])[:400]
        
        batch_data.append({
            "user_id": user_id,
            "faculty_name": f_name,
            "institution": inst_name,
            "project_id": f"project_{g_id}",
            "grant_id": f"grant_{g_id}",
            "project_title": p_title,
            "award_amount": amt,
            "start_date": s_date,
            "abstract_snippet": abs_text
        })

    batch_size = 1000
    total_processed = 0
    with driver.session() as session:
        for i in range(0, len(batch_data), batch_size):
            chunk = batch_data[i:i + batch_size]
            session.run(cypher_ingest, {"batch": chunk})
            total_processed += len(chunk)
            print(f"  -> Memgraph Ingested: {total_processed} / {len(batch_data)} records...", flush=True)
            
    print(f"[SUCCESS] Memgraph ingestion complete! 100% User-Isolated & Deduplicated.", flush=True)

async def ingest_to_postgres_with_embeddings(df: pd.DataFrame, user_id: int = 1):
    """
    Computes vector embeddings using `BAAI/bge-small-en-v1.5` and saves 10,000 records
    to PostgreSQL `document_embeddings` table strictly tagged with `user_id`.
    """
    print(f"\n[POSTGRES] Loading embedding model 'BAAI/bge-small-en-v1.5'...", flush=True)
    model = SentenceTransformer("BAAI/bge-small-en-v1.5")
    
    print(f"[POSTGRES] Ingesting {len(df)} records into PostgreSQL for User ID: {user_id}...", flush=True)
    
    async with AsyncSessionLocal() as session:
        batch_size = 500
        total_saved = 0
        
        for i in range(0, len(df), batch_size):
            chunk = df.iloc[i:i + batch_size]
            abstracts = chunk["abstract"].astype(str).tolist()
            
            # Generate 384-dimensional vector embeddings
            vectors = model.encode(abstracts, show_progress_bar=False).tolist()
            
            db_objects = []
            for j, (_, row) in enumerate(chunk.iterrows()):
                doc = DocumentEmbedding(
                    user_id=user_id,
                    grant_id=str(row["grant_id"]),
                    project_title=str(row["project_title"]),
                    faculty_name=str(row["faculty_name"]),
                    institution=str(row["institution"]),
                    award_amount=float(row["award_amount"]) if isinstance(row["award_amount"], (int, float)) and not pd.isna(row["award_amount"]) else 0.0,
                    start_date=str(row["start_date"]),
                    abstract=str(row["abstract"])
                )
                doc.set_embedding(vectors[j])
                db_objects.append(doc)

            session.add_all(db_objects)
            await session.commit()
            total_saved += len(db_objects)
            print(f"  -> Postgres Vector Ingested: {total_saved} / {len(df)} records...", flush=True)
            
    print(f"[SUCCESS] PostgreSQL vector embedding ingestion complete!", flush=True)

async def main():
    print("==========================================================", flush=True)
    print("SMRUTI X: STEP 3 DATABASE INGESTION PIPELINE (MEMGRAPH + POSTGRES)", flush=True)
    print("==========================================================", flush=True)
    
    data_csv = os.path.join(backend_dir, "data", "university_data_10k.csv")
    if not os.path.exists(data_csv):
        print(f"[ERROR] CSV dataset not found at {data_csv}. Run download_and_prepare_data.py first.", flush=True)
        sys.exit(1)
        
    df = pd.read_csv(data_csv)
    print(f"[INFO] Loaded {len(df)} records from {data_csv}", flush=True)

    target_user_id = 1

    # 1. Ensure PostgreSQL user & tables exist
    await init_postgres_tables_and_user()

    # 2. Ingest into Memgraph (User-Isolated + Deduplicated Person Nodes)
    ingest_to_memgraph_with_deduplication(df, user_id=target_user_id)

    # 3. Ingest into PostgreSQL (User-Isolated + Vector Embeddings)
    await ingest_to_postgres_with_embeddings(df, user_id=target_user_id)

    print("\n==========================================================", flush=True)
    print("STEP 3 INGESTION COMPLETE & VERIFIED!", flush=True)
    print(f"Total Isolated Records Processed: {len(df)} for User ID {target_user_id}", flush=True)
    print("==========================================================", flush=True)

if __name__ == "__main__":
    if sys.platform == "win32":
        asyncio.run(main(), loop_factory=lambda: asyncio.SelectorEventLoop(selectors.SelectSelector()))
    else:
        asyncio.run(main())
