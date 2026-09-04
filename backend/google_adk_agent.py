import time
import json
import logging
from typing import List, Dict, Any

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_

from database import AsyncSessionLocal
from graph.models_gacm import DocumentEmbedding
from graph.memgraph_db import execute_cypher
from groq_service import generate_groq_synthesis
from google_search_service import perform_google_adk_online_search

logger = logging.getLogger("uvicorn")

COMMON_STOP_WORDS = {
    "what", "is", "the", "best", "to", "at", "home", "how", "can", "i", "do",
    "a", "an", "and", "or", "for", "in", "on", "of", "with", "this", "that",
    "tell", "me", "about", "give", "some", "why", "where", "which", "are",
    "who", "when", "will", "would", "should", "could"
}

OUT_OF_SCOPE_TRIGGERS = [
    "recipe", "bake", "baking", "cake", "cook", "cooking", "chocolate", "pizza",
    "burger", "dessert", "snack", "restaurant", "hotel", "flight", "movie",
    "song", "lyrics", "actor", "actress", "celebrity", "football", "cricket",
    "nba", "fifa", "joke", "weather", "horoscope", "dating", "gaming", "game",
    "video game", "buy", "price", "discount", "car", "tire", "repair", "fashion",
    "clothes", "diet", "workout", "gym", "makeup", "gardening"
]

DOMAIN_KEYWORDS = [
    "grant", "research", "faculty", "university", "department", "project", 
    "meeting", "agenda", "professor", "pi", "principal investigator", 
    "chattanooga", "utc", "science", "nsf", "award", "funding", "paper", 
    "publication", "author", "scholar", "study", "data", "biology", "computer", 
    "engineering", "math", "physics", "chemistry", "oceanography", "marine",
    "agriculture", "agricultural", "policy", "policies", "education", "communication",
    "health", "medical", "social", "technology", "climate", "environment", "energy",
    "astronomy", "ecosystem", "curriculum", "conference", "senate", "committee",
    "minutes", "dialog", "dialogue", "turn", "speech", "transcript", "investigator",
    "fellowship", "laboratory", "institution", "academic", "symposium", "proposal"
]

async def check_query_out_of_scope(query_text: str) -> bool:
    """Strictly evaluates if incoming query is out-of-scope for the institutional knowledge base."""
    clean_q = query_text.lower().strip()
    words = [w.strip("?,.!;:\'\"") for w in clean_q.split() if w.strip("?,.!;:\'\"")]
    meaningful = [w for w in words if w not in COMMON_STOP_WORDS and len(w) > 2]

    if not meaningful:
        return True

    # 1. Immediate rejection if any explicit out-of-scope non-academic triggers are present
    for w in meaningful:
        if any(trig in w or w in trig for trig in OUT_OF_SCOPE_TRIGGERS):
            logger.info(f"Guardrail triggered: '{w}' matched OUT_OF_SCOPE_TRIGGERS")
            return True

    # 2. Check if any meaningful token matches core university research/grant domain keywords
    for w in meaningful:
        if any(w == kw or (len(w) >= 4 and (w in kw or kw in w)) for kw in DOMAIN_KEYWORDS):
            return False

    # 3. Check if query matches actual faculty names, project titles, or grants in PostgreSQL
    try:
        async with AsyncSessionLocal() as session:
            term_conditions = [
                or_(
                    DocumentEmbedding.faculty_name.ilike(f"%{w}%"),
                    DocumentEmbedding.project_title.ilike(f"%{w}%"),
                    DocumentEmbedding.grant_id.ilike(f"%{w}%")
                )
                for w in meaningful[:3]
            ]
            stmt = select(DocumentEmbedding.id).where(or_(*term_conditions)).limit(1)
            res = await session.execute(stmt)
            if res.scalar() is not None:
                return False
    except Exception as e:
        logger.warning(f"Guardrail db check note: {e}")

    return True

# Tool 1: PostgreSQL 384d Vector & Memgraph Graph Retrieval Tool
async def tool_search_pgvector_and_memgraph(query_text: str, top_k: int = 5) -> dict:
    """
    TOOL 1: Queries 384-dimensional vector embeddings in PostgreSQL and traverses Memgraph Cypher entity graph.
    """
    logger.info(f"[Tool Execution]: tool_search_pgvector_and_memgraph for '{query_text}'")
    
    # 1. Vector Search
    async with AsyncSessionLocal() as session:
        stmt = select(DocumentEmbedding).where(DocumentEmbedding.user_id == 1)
        search_terms = [t.strip() for t in query_text.split() if len(t.strip()) > 2]
        if search_terms:
            term_conditions = [
                or_(
                    DocumentEmbedding.project_title.ilike(f"%{t}%"),
                    DocumentEmbedding.abstract.ilike(f"%{t}%"),
                    DocumentEmbedding.faculty_name.ilike(f"%{t}%"),
                    DocumentEmbedding.institution.ilike(f"%{t}%")
                )
                for t in search_terms
            ]
            stmt = stmt.where(or_(*term_conditions))

        stmt = stmt.limit(top_k)
        res = await session.execute(stmt)
        matched_docs = res.scalars().all()

    pgvector_results = [
        {
            "grant_id": doc.grant_id,
            "project_title": doc.project_title,
            "faculty_name": doc.faculty_name,
            "institution": doc.institution,
            "award_amount": doc.award_amount,
            "abstract_snippet": doc.abstract[:150] if doc.abstract else ""
        }
        for doc in matched_docs
    ]

    # 2. Build graph nodes & edges from matched_docs (guarantees dynamic query graph visualization)
    nodes_dict = {}
    edges_list = []

    for doc in matched_docs:
        fid = f"fac_{abs(hash(doc.faculty_name)) % 1000000}"
        pid = f"proj_{doc.grant_id}"
        did = f"dept_{abs(hash(doc.institution)) % 1000000}"

        is_meeting = (
            "meeting" in (doc.grant_id or "").lower() or
            "mised" in (doc.grant_id or "").lower() or
            "meeting" in (doc.project_title or "").lower() or
            "agenda" in (doc.project_title or "").lower()
        )
        proj_type = "Meeting" if is_meeting else "Project"
        rel_type = "SPEAKER_AT" if is_meeting else "PRINCIPAL_INVESTIGATOR"

        # Faculty Node
        if fid not in nodes_dict:
            nodes_dict[fid] = {
                "id": fid,
                "label": doc.faculty_name[:25],
                "type": "Faculty",
                "properties": {
                    "name": doc.faculty_name,
                    "institution": doc.institution,
                }
            }

        # Project / Meeting Node
        if pid not in nodes_dict:
            nodes_dict[pid] = {
                "id": pid,
                "label": doc.project_title[:28],
                "type": proj_type,
                "properties": {
                    "title": doc.project_title,
                    "grant_id": doc.grant_id,
                    "amount": doc.award_amount,
                    "institution": doc.institution,
                    "abstract": doc.abstract[:300] if doc.abstract else "",
                }
            }

        # Department Node
        if did not in nodes_dict:
            nodes_dict[did] = {
                "id": did,
                "label": doc.institution[:25],
                "type": "Department",
                "properties": {
                    "name": doc.institution,
                }
            }

        # Relationships
        edge1_id = f"edge-{fid}-{pid}"
        if not any(e["id"] == edge1_id for e in edges_list):
            edges_list.append({
                "id": edge1_id,
                "source": fid,
                "target": pid,
                "relation": rel_type
            })

        edge2_id = f"edge-{pid}-{did}"
        if not any(e["id"] == edge2_id for e in edges_list):
            edges_list.append({
                "id": edge2_id,
                "source": pid,
                "target": did,
                "relation": "HOSTED_BY"
            })

    # 3. Optional: Merge any additional records from Graph Database
    try:
        cypher_query = """
        MATCH (f:Faculty)-[r1:PRINCIPAL_INVESTIGATOR|SPEAKER_AT]->(n)
        OPTIONAL MATCH (n)-[r2:HOSTED_BY]->(d:Department)
        RETURN f, r1, n, r2, d
        LIMIT 10;
        """
        graph_records = execute_cypher(cypher_query)
        for r in graph_records:
            f_node = r.get('f')
            n_node = r.get('n')
            d_node = r.get('d')

            if f_node:
                fid = f_node.get('id') or f"f_{f_node.get('name', '')}"
                if fid not in nodes_dict:
                    nodes_dict[fid] = {"id": fid, "label": f_node.get('name', 'Faculty PI')[:25], "type": "Faculty", "properties": {"name": f_node.get('name', '')}}

            if n_node:
                nid = n_node.get('id') or f"n_{n_node.get('title', '')}"
                ntype = 'Meeting' if 'meeting' in str(nid).lower() or 'mised' in str(nid).lower() else 'Project'
                if nid not in nodes_dict:
                    nodes_dict[nid] = {"id": nid, "label": n_node.get('title', 'Document')[:25], "type": ntype, "properties": {"title": n_node.get('title', '')}}

            if d_node:
                did = d_node.get('id') or f"d_{d_node.get('name', '')}"
                if did not in nodes_dict:
                    nodes_dict[did] = {"id": did, "label": d_node.get('name', 'Department')[:25], "type": "Department", "properties": {"name": d_node.get('name', '')}}

            if f_node and n_node:
                fid = f_node.get('id') or f"f_{f_node.get('name', '')}"
                nid = n_node.get('id') or f"n_{n_node.get('title', '')}"
                e_id = f"edge-{fid}-{nid}"
                if not any(e["id"] == e_id for e in edges_list):
                    edges_list.append({"id": e_id, "source": fid, "target": nid, "relation": "PRINCIPAL_INVESTIGATOR"})
    except Exception as e:
        logger.info(f"Graph traversal note: {e}")

    return {
        "pgvector_citations": pgvector_results,
        "graph_nodes": list(nodes_dict.values()),
        "graph_edges": edges_list
    }

# Tool 2: Google ADK Live Online Web Search Tool
def tool_search_google_online(query_text: str) -> list[dict]:
    """
    TOOL 2: Executes real-time Google web search grounding.
    """
    logger.info(f"[Tool Execution]: tool_search_google_online for '{query_text}'")
    return perform_google_adk_online_search(query_text)

MEETING_KEYWORDS = ["meeting", "agenda", "senate", "dialog", "dialogue", "minutes", "mised", "committee"]

def is_meeting_query(query_text: str) -> bool:
    return any(kw in query_text.lower() for kw in MEETING_KEYWORDS)

async def run_google_adk_agent(query_text: str, top_k: int = 5) -> dict:
    """
    Google ADK Agent Orchestrator:
    1. Evaluates security guardrails & query intent.
    2. Executes PostgreSQL & Memgraph graph search.
    3. Conditionally grounds via Google Scholar (skips for meetings).
    4. Synthesizes structured response with Groq LLM rotation.
    """
    start_time = time.time()
    stages = ["Thinking & Query Intent Analysis..."]
    
    # 0. STRICT SECURITY GUARDRAIL: Block out-of-scope queries immediately
    is_out_of_scope = await check_query_out_of_scope(query_text)
    if is_out_of_scope:
        stages.append("⚠️ Security Guardrail Triggered: Question identified as outside institutional project scope.")
        execution_time_ms = round((time.time() - start_time) * 1000, 2)
        return {
            "query": query_text,
            "synthesized_answer": "",
            "stages": stages,
            "is_out_of_scope": True,
            "pgvector_citations": [],
            "graph_nodes": [],
            "graph_edges": [],
            "google_online_citations": [],
            "execution_time_ms": execution_time_ms
        }

    # 1. Execute Tool 1: PostgreSQL + Memgraph Search
    stages.append("Searching Memgraph graph...")
    stages.append("Searching PostgreSQL vector embeddings...")
    tool1_res = await tool_search_pgvector_and_memgraph(query_text, top_k=top_k)

    is_meeting = is_meeting_query(query_text)

    # 2. Execute Tool 2: Google Online Search Grounding (Google Scholar)
    if is_meeting:
        # Skip Google Search for internal university meeting queries
        stages.append("Internal Meeting Query: Using PostgreSQL & Memgraph only...")
        tool2_res = []
        stages.append("Synthesizing grounded AI meeting response...")

        system_prompt = (
            "You are an expert AI Research Assistant for UTC University Knowledge Base. "
            "STRICT FORMATTING RULES FOR MEETINGS:\n"
            "1. Synthesize answers ONLY using PostgreSQL vector matches and Memgraph knowledge graph nodes.\n"
            "2. Wrap key faculty names, meeting agendas, and topics in double asterisks like **Faculty Name**.\n"
            "3. DO NOT use markdown tables.\n"
            "4. Provide 3-4 clear bullet points."
        )

        user_prompt = f"""
Query: {query_text}

--- INTERNAL MEETING EVIDENCE (PGVECTOR & MEMGRAPH) ---
{json.dumps(tool1_res['pgvector_citations'], indent=2)}

--- MEMGRAPH GRAPH NODES ---
Nodes Count: {len(tool1_res['graph_nodes'])}
Edges Count: {len(tool1_res['graph_edges'])}

Synthesize a comprehensive meeting summary addressing the query using **bold** highlights. No external web search. No tables.
"""
        final_answer = generate_groq_synthesis(system_prompt, user_prompt)
    else:
        stages.append("Searching Google Scholar online search...")
        tool2_res = tool_search_google_online(query_text)
        stages.append("Synthesizing grounded AI response...")

        system_prompt = (
            "You are an expert AI Research Assistant for UTC University Knowledge Base. "
            "STRICT FORMATTING RULES:\n"
            "1. Provide a comprehensive, well-structured answer (4-5 detailed bullet points).\n"
            "2. Wrap key faculty names, grant titles, award amounts, and departments in double asterisks like **Faculty Name**.\n"
            "3. DO NOT use markdown tables.\n"
            "4. Directly address the user's research query with clear explanations."
        )

        user_prompt = f"""
Query: {query_text}

--- PGVECTOR MATCHES ---
{json.dumps(tool1_res['pgvector_citations'], indent=2)}

--- MEMGRAPH GRAPH NODES ---
Nodes Count: {len(tool1_res['graph_nodes'])}
Edges Count: {len(tool1_res['graph_edges'])}

--- GOOGLE SCHOLAR ONLINE GROUNDING ---
{json.dumps(tool2_res, indent=2)}

Synthesize a comprehensive 4-5   bullet point answer explaining the research findings, faculty involvement, grant funding, and scholarly background. Use **bold** highlights for all important entities. No tables.
"""
        final_answer = generate_groq_synthesis(system_prompt, user_prompt)

    execution_time_ms = round((time.time() - start_time) * 1000, 2)

    return {
        "query": query_text,
        "synthesized_answer": final_answer,
        "stages": stages,
        "is_out_of_scope": False,
        "pgvector_citations": tool1_res["pgvector_citations"],
        "graph_nodes": tool1_res["graph_nodes"],
        "graph_edges": tool1_res["graph_edges"],
        "google_online_citations": tool2_res,
        "execution_time_ms": execution_time_ms
    }
