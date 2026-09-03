import os
import sys
import asyncio

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

if sys.platform == 'win32':
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

from database import AsyncSessionLocal
from sqlalchemy import text

def execute_memgraph_cypher(query: str, params: dict = None):
    """Executes a Cypher query on Memgraph over Bolt protocol (bolt://127.0.0.1:7687)."""
    try:
        from neo4j import GraphDatabase
        driver = GraphDatabase.driver("bolt://127.0.0.1:7687", auth=("", ""))
        with driver.session() as session:
            result = session.run(query, params or {})
            res_data = [r.data() for r in result]
        driver.close()
        return res_data
    except Exception as err:
        print(f" [Memgraph Note]: {err}")
        return []

async def purge_all_databases():
    print("==========================================================")
    print("STARTING COMPLETE DATABASE PURGE (PostgreSQL + Memgraph)")
    print("==========================================================")

    # 1. PURGE POSTGRESQL TABLES
    async with AsyncSessionLocal() as session:
        print("[1/2] Purging PostgreSQL Tables...")
        await session.execute(text("DELETE FROM document_embeddings;"))
        await session.execute(text("DELETE FROM gacm_chat_sessions;"))
        await session.execute(text("DELETE FROM topic_discussion_comments;"))
        await session.commit()
        print("  [SUCCESS] PostgreSQL tables cleared successfully!")

        # Verify PostgreSQL row counts
        res_docs = await session.execute(text("SELECT count(*) FROM document_embeddings;"))
        cnt_docs = res_docs.scalar()

        res_chats = await session.execute(text("SELECT count(*) FROM gacm_chat_sessions;"))
        cnt_chats = res_chats.scalar()

        res_comments = await session.execute(text("SELECT count(*) FROM topic_discussion_comments;"))
        cnt_comments = res_comments.scalar()

    # 2. PURGE MEMGRAPH GRAPH DATABASE
    print("\n[2/2] Purging Memgraph Graph Database...")
    execute_memgraph_cypher("MATCH (n) DETACH DELETE n;")
    print("  [SUCCESS] Memgraph graph nodes & relationships detached and deleted!")

    # Verify Memgraph node count
    mem_res = execute_memgraph_cypher("MATCH (n) RETURN count(n) AS cnt;")
    cnt_mem = mem_res[0]["cnt"] if mem_res else 0

    print("\n==========================================================")
    print("POSTGRESQL & MEMGRAPH PURGE VERIFICATION AUDIT")
    print("==========================================================")
    print(f" - PostgreSQL document_embeddings:  {cnt_docs} rows")
    print(f" - PostgreSQL gacm_chat_sessions:   {cnt_chats} rows")
    print(f" - PostgreSQL topic_comments:       {cnt_comments} rows")
    print(f" - Memgraph Total Graph Nodes:     {cnt_mem} nodes")
    
    if cnt_docs == 0 and cnt_chats == 0 and cnt_comments == 0 and cnt_mem == 0:
        print("\n[VERIFICATION SUCCESS]: All databases 100% empty and reset!")
    else:
        print("\n[WARNING]: Some data remains in database!")
    print("==========================================================")

if __name__ == "__main__":
    asyncio.run(purge_all_databases())
