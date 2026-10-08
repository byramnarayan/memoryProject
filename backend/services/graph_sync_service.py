import re
import json
import math
import hashlib
import logging
from typing import Dict, Any, List, Optional
from datetime import datetime, timezone
import httpx
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from config import settings
from graph.models_gacm import ResearchMemoryObject, DocumentEmbedding
from graph.memgraph_db import execute_cypher

logger = logging.getLogger("graph_sync_service")

# ---------------------------------------------------------
# 1. Dense Vector Generation Engine (384-dimensional)
# ---------------------------------------------------------

def generate_dense_vector(text: str, dim: int = 384) -> List[float]:
    """
    Generates a 384-dimensional dense vector normalized to unit length (L2 norm = 1.0).
    Instantaneous, deterministic normalized projection with zero network blocking.
    """
    vec = [0.0] * dim
    words = re.findall(r"\b[a-zA-Z0-9_\-]{2,}\b", text.lower())
    if not words:
        words = ["research", "academic", "grant"]

    for w in words:
        # Dual-hash projection for low collision distribution
        h1 = int(hashlib.md5(w.encode()).hexdigest(), 16) % dim
        h2 = int(hashlib.sha256(w.encode()).hexdigest(), 16) % dim
        vec[h1] += 1.0
        vec[h2] += 0.5

    norm = math.sqrt(sum(x * x for x in vec)) or 1.0
    return [round(x / norm, 6) for x in vec]

# ---------------------------------------------------------
# 2. Neo4j Knowledge Graph Entity Linker
# ---------------------------------------------------------

def sync_memory_to_neo4j(memory: ResearchMemoryObject) -> Dict[str, Any]:
    """
    Links canonical research memory to Neo4j Aura Cloud graph database:
    - Merges (:Faculty {name: pi_name})
    - Merges (:Department {name: department})
    - Merges (:Project {id: memory_id})
    - Connects (:Faculty)-[:PRINCIPAL_INVESTIGATOR]->(:Project)
    - Connects (:Project)-[:HOSTED_BY]->(:Department)
    - Links Co-PIs and Sponsors if present.
    """
    entities = memory.get_entities()
    pi_name = entities.get("pi_name") or "Institutional Researcher"
    co_pi_names = entities.get("co_pi_names") or []
    department = entities.get("department") or "Research Division"
    sponsor = entities.get("sponsor_agency") or "Internal University Funds"
    award_amount = float(entities.get("award_amount") or 0.0)
    grant_number = str(entities.get("grant_number") or memory.memory_id)

    relations = [
        {"source": pi_name, "target": memory.title, "relation": "PRINCIPAL_INVESTIGATOR"},
        {"source": memory.title, "target": department, "relation": "HOSTED_BY"}
    ]

    cypher_core = """
    MERGE (f:Faculty {name: $pi_name})
    ON CREATE SET f.department = $department, f.created_at = datetime()

    MERGE (d:Department {name: $department})

    MERGE (p:Project {id: $memory_id})
    SET p.name = $title,
        p.title = $title,
        p.award_amount = $award_amount,
        p.sponsor = $sponsor,
        p.grant_number = $grant_number,
        p.memory_type = $memory_type,
        p.status = 'Active',
        p.updated_at = datetime()

    MERGE (f)-[:PRINCIPAL_INVESTIGATOR]->(p)
    MERGE (p)-[:HOSTED_BY]->(d)
    """

    params = {
        "pi_name": pi_name,
        "department": department,
        "memory_id": memory.memory_id,
        "title": memory.title,
        "award_amount": award_amount,
        "sponsor": sponsor,
        "grant_number": grant_number,
        "memory_type": memory.memory_type
    }

    try:
        execute_cypher(cypher_core, params)
    except Exception as e:
        logger.error(f"Error executing core Cypher in Neo4j: {e}")
        return {"status": "error", "detail": str(e), "relations": relations}

    # Link Co-PIs if present
    for copi in co_pi_names:
        copi_clean = str(copi).strip()
        if copi_clean and copi_clean != pi_name:
            relations.append({"source": copi_clean, "target": memory.title, "relation": "CO_INVESTIGATOR"})
            copi_query = """
            MATCH (p:Project {id: $memory_id})
            MERGE (cf:Faculty {name: $copi_name})
            ON CREATE SET cf.department = $department, cf.created_at = datetime()
            MERGE (cf)-[:CO_INVESTIGATOR]->(p)
            """
            try:
                execute_cypher(copi_query, {"memory_id": memory.memory_id, "copi_name": copi_clean, "department": department})
            except Exception as ce:
                logger.warning(f"Error linking Co-PI {copi_clean}: {ce}")

    # Link Sponsor if not default internal
    if sponsor and sponsor != "Internal University Funds":
        relations.append({"source": memory.title, "target": sponsor, "relation": "FUNDED_BY"})
        sponsor_query = """
        MATCH (p:Project {id: $memory_id})
        MERGE (s:Sponsor {name: $sponsor})
        MERGE (p)-[:FUNDED_BY]->(s)
        """
        try:
            execute_cypher(sponsor_query, {"memory_id": memory.memory_id, "sponsor": sponsor})
        except Exception as se:
            logger.warning(f"Error linking Sponsor {sponsor}: {se}")

    return {
        "status": "synced",
        "memory_id": memory.memory_id,
        "pi_name": pi_name,
        "department": department,
        "relations": relations
    }

# ---------------------------------------------------------
# 3. Vector Upsert Pipeline (PostgreSQL & Qdrant Cloud)
# ---------------------------------------------------------

async def sync_memory_to_vector_store(
    session: AsyncSession,
    memory: ResearchMemoryObject
) -> Dict[str, Any]:
    """
    Computes 384d vector embedding and upserts into:
    1. ResearchMemoryObject.embedding_json in PostgreSQL
    2. DocumentEmbedding in PostgreSQL (for existing hybrid search tooling)
    3. Qdrant Cloud REST API (if available)
    """
    entities = memory.get_entities()
    summaries = memory.get_derived_summaries()

    short_sum = summaries.get("short_summary") or ""
    text_to_embed = f"{memory.title}. {short_sum} {memory.raw_text[:1000]}".strip()

    vector = generate_dense_vector(text_to_embed, dim=384)
    memory.set_embedding(vector)

    faculty_name = entities.get("pi_name") or "Institutional Researcher"
    award_amount = float(entities.get("award_amount") or 0.0)
    institution = entities.get("department") or "University of Tennessee at Chattanooga"

    # Upsert into DocumentEmbedding table for direct backward-compatible hybrid search
    doc_res = await session.execute(
        select(DocumentEmbedding).where(DocumentEmbedding.grant_id == memory.memory_id)
    )
    existing_doc = doc_res.scalar_one_or_none()

    if existing_doc:
        existing_doc.project_title = memory.title
        existing_doc.faculty_name = faculty_name
        existing_doc.institution = institution
        existing_doc.award_amount = award_amount
        existing_doc.abstract = memory.raw_text[:2000]
        existing_doc.embedding_json = json.dumps(vector)
    else:
        new_doc = DocumentEmbedding(
            user_id=memory.user_id,
            grant_id=memory.memory_id,
            project_title=memory.title,
            faculty_name=faculty_name,
            institution=institution,
            award_amount=award_amount,
            abstract=memory.raw_text[:2000],
            embedding_json=json.dumps(vector)
        )
        session.add(new_doc)

    # Attempt Qdrant Cloud HTTP Upsert if configured
    qdrant_status = "skipped"
    if settings.qdrant_url and settings.qdrant_api_key and settings.qdrant_api_key.get_secret_value():
        try:
            q_url = settings.qdrant_url.rstrip("/")
            q_key = settings.qdrant_api_key.get_secret_value()
            headers = {"api-key": q_key, "Content-Type": "application/json"}
            point_id = abs(hash(memory.memory_id)) % 2147483647
            point_payload = {
                "points": [
                    {
                        "id": point_id,
                        "vector": vector,
                        "payload": {
                            "memory_id": memory.memory_id,
                            "grant_id": memory.memory_id,
                            "project_title": memory.title,
                            "faculty_name": faculty_name,
                            "institution": institution,
                            "award_amount": award_amount,
                            "abstract": memory.raw_text[:400],
                            "is_meeting": memory.memory_type == "MeetingMinutes"
                        }
                    }
                ]
            }
            # Fast timeout to ensure zero blocking
            async with httpx.AsyncClient(timeout=2.0) as client:
                resp = await client.put(f"{q_url}/collections/utc_research_vectors/points", headers=headers, json=point_payload)
                if resp.status_code in [200, 201]:
                    qdrant_status = "synced"
                else:
                    qdrant_status = f"http_{resp.status_code}"
        except Exception as qe:
            qdrant_status = f"offline_or_unavailable ({type(qe).__name__})"

    return {
        "status": "vector_synced",
        "memory_id": memory.memory_id,
        "vector_dim": len(vector),
        "qdrant_status": qdrant_status
    }

# ---------------------------------------------------------
# 4. Orchestrated End-to-End Pipeline
# ---------------------------------------------------------

async def sync_memory_e2e(
    session: AsyncSession,
    memory_id_or_obj: Any
) -> Dict[str, Any]:
    """
    Executes full Session 05 sync:
    1. Fetches canonical memory from PostgreSQL (if string ID passed) or uses instance
    2. Links into Neo4j Aura Knowledge Graph
    3. Generates 384d vector and upserts into Vector Store
    4. Saves graph relations into memory object
    """
    if isinstance(memory_id_or_obj, ResearchMemoryObject):
        mem = memory_id_or_obj
        memory_id = mem.memory_id
    else:
        memory_id = str(memory_id_or_obj)
        res = await session.execute(
            select(ResearchMemoryObject).where(ResearchMemoryObject.memory_id == memory_id)
        )
        mem = res.scalar_one_or_none()
        if not mem:
            return {"status": "error", "message": f"Memory {memory_id} not found."}

    # 1. Neo4j Graph Sync
    graph_res = sync_memory_to_neo4j(mem)
    mem.set_relations(graph_res.get("relations", []))

    # 2. Vector Store Sync
    vector_res = await sync_memory_to_vector_store(session, mem)

    mem.updated_at = datetime.now(timezone.utc)
    await session.commit()

    logger.info(f"Successfully synced memory {memory_id} to Neo4j and Vector Store.")
    return {
        "status": "success",
        "memory_id": memory_id,
        "graph_sync": graph_res,
        "vector_sync": vector_res,
        "relations": mem.get_relations()
    }
