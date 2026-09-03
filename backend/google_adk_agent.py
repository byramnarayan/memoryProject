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

RELEVANT_KEYWORDS = [
    "grant", "research", "faculty", "university", "department", "project", 
    "meeting", "agenda", "professor", "pi", "principal investigator", 
    "chattanooga", "utc", "science", "nsf", "award", "funding", "paper", 
    "publication", "author", "scholar", "study", "data", "biology", "computer", 
    "engineering", "math", "physics", "chemistry", "oceanography", "marine"
]

def check_out_of_topic(query_text: str) -> bool:
    tokens = [t.lower().strip() for t in query_text.split() if len(t.strip()) > 2]
    if not tokens:
        return False
    has_match = any(t in kw or kw in t for t in tokens for kw in RELEVANT_KEYWORDS)
    return not has_match

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

        if not matched_docs:
            res_fb = await session.execute(select(DocumentEmbedding).where(DocumentEmbedding.user_id == 1).limit(top_k))
            matched_docs = res_fb.scalars().all()

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

    # 2. Memgraph Graph Traversal
    cypher_query = """
    MATCH (f:Faculty)-[r1:PRINCIPAL_INVESTIGATOR|SPEAKER_AT]->(n)
    OPTIONAL MATCH (n)-[r2:HOSTED_BY]->(d:Department)
    RETURN f, r1, n, r2, d
    LIMIT 25;
    """
    graph_records = execute_cypher(cypher_query)
    
    nodes_dict = {}
    edges_list = []

    for r in graph_records:
        f_node = r.get('f')
        n_node = r.get('n')
        d_node = r.get('d')

        if f_node:
            fid = f_node.get('id') or 'f_unk'
            nodes_dict[fid] = {"id": fid, "label": f_node.get('name', 'Faculty PI')[:25], "type": "Faculty", "properties": {"name": f_node.get('name', '')}}

        if n_node:
            nid = n_node.get('id') or 'n_unk'
            ntype = 'Meeting' if 'meeting' in str(nid).lower() or 'mised' in str(nid).lower() else 'Project'
            nodes_dict[nid] = {"id": nid, "label": n_node.get('title', 'Document')[:25], "type": ntype, "properties": {"title": n_node.get('title', '')}}

        if d_node:
            did = d_node.get('id') or 'd_unk'
            nodes_dict[did] = {"id": did, "label": d_node.get('name', 'Department')[:25], "type": "Department", "properties": {"name": d_node.get('name', '')}}

        if f_node and n_node:
            edges_list.append({"id": f"edge-{f_node.get('id')}-{n_node.get('id')}", "source": f_node.get('id'), "target": n_node.get('id'), "relation": "PRINCIPAL_INVESTIGATOR"})

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
    Emits live execution stages ('Thinking...', 'Searching Memgraph...', 'Searching PostgreSQL...', 'Searching Google online...').
    Executed tool calls and returns grounded response.
    """
    start_time = time.time()
    stages = ["Thinking..."]
    
    is_out_of_scope = check_out_of_topic(query_text)
    is_meeting = is_meeting_query(query_text)

    # 1. Execute Tool 1: PostgreSQL + Memgraph Search
    stages.append("Searching Memgraph graph...")
    stages.append("Searching PostgreSQL vector embeddings...")
    tool1_res = await tool_search_pgvector_and_memgraph(query_text, top_k=top_k)

    # 2. Execute Tool 2: Google Online Search Grounding (Google Scholar)
    if is_out_of_scope:
        tool2_res = []
        final_answer = ""
    elif is_meeting:
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
        "is_out_of_scope": is_out_of_scope,
        "pgvector_citations": tool1_res["pgvector_citations"] if not is_out_of_scope else [],
        "graph_nodes": tool1_res["graph_nodes"],
        "graph_edges": tool1_res["graph_edges"],
        "google_online_citations": tool2_res,
        "execution_time_ms": execution_time_ms
    }
