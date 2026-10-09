import time
import json
import logging
from typing import List, Dict, Any

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_

from database import AsyncSessionLocal
from graph.models_gacm import DocumentEmbedding, ResearchMemoryObject
from graph.memgraph_db import execute_cypher
from groq_service import generate_groq_synthesis
from google_search_service import perform_google_adk_online_search
from services.access_control import get_authorized_sensitivities
from sqlalchemy import and_
import models

logger = logging.getLogger("uvicorn")

def serialize_graph_property(val: Any) -> Any:
    """Recursively converts Neo4j DateTime/Date, datetime, and other non-JSON types to ISO strings/primitives."""
    if hasattr(val, "iso_format"):
        return val.iso_format()
    elif hasattr(val, "isoformat"):
        return val.isoformat()
    elif isinstance(val, (int, float, bool, str)) or val is None:
        return val
    elif isinstance(val, dict):
        return {str(k): serialize_graph_property(v) for k, v in val.items()}
    elif isinstance(val, (list, tuple, set)):
        return [serialize_graph_property(v) for v in val]
    return str(val)

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

ACADEMIC_KEYWORDS = [
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

TELECOM_KEYWORDS = [
    "cell", "cells", "tower", "towers", "site", "sites", "outage", "outages", "degradation",
    "ticket", "tickets", "incident", "incidents", "drop rate", "kpi", "telecom", "telecommunications",
    "radio", "rf", "antenna", "backhaul", "microwave", "fiber", "5g", "4g", "3g", "2g", "lte",
    "msisdn", "sim", "esim", "customer", "network", "bandwidth", "latency", "core", "alarm",
    "engineer", "technician", "operator", "sla", "service", "hardware", "firmware", "packet",
    "spectrum", "carrier", "downlink", "uplink", "sector", "transmission", "coverage",
    "bandra", "delhi", "mumbai", "priya", "arjun", "vikram", "ananya", "rohan", "patel",
    "nair", "malhotra", "roy", "sharma", "evt", "tkt", "site-mum", "site-del"
]

ENTERPRISE_KEYWORDS = [
    "employee", "employees", "staff", "manager", "managers", "department", "departments",
    "ticket", "tickets", "task", "project", "projects", "sla", "client", "customer",
    "system", "infrastructure", "operations", "policy", "audit", "compliance", "log",
    "logs", "incident", "team", "engineer", "admin", "workflow", "handoff", "decision",
    "risk", "spof", "single point of failure", "status", "hierarchy", "clearance"
]

async def check_query_out_of_scope(
    query_text: str,
    tenant_id: str = "utc_campus",
    industry: str = "telecom"
) -> bool:
    """
    Session 17: Dynamic Industry-Aware Security Guardrail.
    Evaluates query intent against the active tenant's industry ontology.
    """
    clean_q = query_text.lower().strip()
    words = [w.strip("?,.!;:\'\"") for w in clean_q.split() if w.strip("?,.!;:\'\"")]
    meaningful = [w for w in words if w not in COMMON_STOP_WORDS and len(w) > 2]

    if not meaningful:
        return True

    # 1. Immediate rejection if explicit non-business / entertainment triggers are present
    for w in meaningful:
        if any(trig in w or w in trig for trig in OUT_OF_SCOPE_TRIGGERS):
            logger.info(f"Guardrail triggered: '{w}' matched OUT_OF_SCOPE_TRIGGERS")
            return True

    # 2. Select appropriate ontology vocabulary based on tenant & industry
    active_vocab = set()
    if tenant_id == "utc_campus" or industry == "higher_education":
        active_vocab.update(ACADEMIC_KEYWORDS)
    else:
        active_vocab.update(TELECOM_KEYWORDS)
        active_vocab.update(ENTERPRISE_KEYWORDS)

    # Check match against active industry vocabulary
    for w in meaningful:
        for kw in active_vocab:
            if w == kw:
                return False
            if len(w) >= 4 and len(kw) >= 4:
                if w.startswith(kw) or kw.startswith(w):
                    return False
                if " " in kw and (w in kw.split() or kw in w):
                    return False
            elif " " in kw and w in kw.split():
                return False

    # 3. Dynamic Database Grounding Check: Match explicit entity identifiers, usernames, or badge numbers
    # Only checks tokens that resemble identifiers (e.g., contains digits, hyphens, or underscores)
    id_tokens = [w for w in meaningful if any(c.isdigit() for c in w) or "-" in w or "_" in w]
    if id_tokens:
        try:
            async with AsyncSessionLocal() as session:
                # Check ResearchMemoryObject under active tenant
                mem_stmt = select(ResearchMemoryObject.id).where(
                    and_(
                        ResearchMemoryObject.tenant_id == tenant_id,
                        or_(*[ResearchMemoryObject.memory_id.ilike(f"%{tok}%") for tok in id_tokens[:3]])
                    )
                ).limit(1)
                mem_res = await session.execute(mem_stmt)
                if mem_res.scalar() is not None:
                    return False

                # Check User / Employee usernames or badge numbers
                u_stmt = select(models.User.id).where(
                    and_(
                        models.User.tenant_id == tenant_id,
                        or_(
                            *[
                                or_(
                                    models.User.username.ilike(tok),
                                    models.User.employee_number.ilike(tok)
                                )
                                for tok in id_tokens[:3]
                            ]
                        )
                    )
                ).limit(1)
                u_res = await session.execute(u_stmt)
                if u_res.scalar() is not None:
                    return False

                # Academic fallback for utc_campus (matching grant IDs)
                if tenant_id == "utc_campus":
                    d_stmt = select(DocumentEmbedding.id).where(
                        or_(*[DocumentEmbedding.grant_id == tok for tok in id_tokens[:3]])
                    ).limit(1)
                    d_res = await session.execute(d_stmt)
                    if d_res.scalar() is not None:
                        return False
        except Exception as e:
            logger.warning(f"Guardrail db check note: {e}")

    return True

# Tool 1: PostgreSQL Vector & Memgraph/Neo4j Graph Retrieval Tool
async def tool_search_pgvector_and_memgraph(
    query_text: str,
    top_k: int = 5,
    user_clearance: str = "HighlyConfidential",
    user_department: str | None = None,
    tenant_id: str = "utc_campus",
    industry: str = "telecom"
) -> dict:
    """
    TOOL 1: Queries vector memory in PostgreSQL and traverses Neo4j/Memgraph property graph.
    Session 17: Fully multi-tenant and dynamically adapts to the tenant's industry ontology.
    """
    logger.info(f"[Tool Execution]: tool_search_pgvector_and_memgraph for '{query_text}' (tenant: {tenant_id}, clearance: {user_clearance})")
    
    matched_docs = []
    allowed_sensitivities = get_authorized_sensitivities(user_clearance)
    search_terms = [t.strip() for t in query_text.split() if len(t.strip()) > 2]

    async with AsyncSessionLocal() as session:
        # Primary: Canonical Research Memory Objects scoped to active tenant and clearance
        mem_stmt = select(ResearchMemoryObject).where(
            and_(
                ResearchMemoryObject.tenant_id == tenant_id,
                ResearchMemoryObject.sensitivity_level.in_(allowed_sensitivities)
            )
        )
        if search_terms:
            mem_conds = [
                or_(
                    ResearchMemoryObject.title.ilike(f"%{t}%"),
                    ResearchMemoryObject.raw_text.ilike(f"%{t}%"),
                    ResearchMemoryObject.entities_json.ilike(f"%{t}%"),
                    ResearchMemoryObject.memory_id.ilike(f"%{t}%")
                )
                for t in search_terms
            ]
            mem_stmt = mem_stmt.where(or_(*mem_conds))
        mem_stmt = mem_stmt.order_by(ResearchMemoryObject.id.desc())
        mem_res = await session.execute(mem_stmt.limit(top_k))
        matched_mems = mem_res.scalars().all()

        for m in matched_mems:
            ent = m.get_entities()
            assigned_staff = ent.get("assigned_employee_id") or ent.get("pi_name") or "Operational Staff"
            site_or_inst = ent.get("site_code") or ent.get("department") or "Enterprise Division"
            matched_docs.append(
                type("MatchedMemory", (), {
                    "grant_id": m.memory_id,
                    "project_title": m.title,
                    "faculty_name": assigned_staff,
                    "institution": site_or_inst,
                    "award_amount": float(ent.get("award_amount") or 0.0),
                    "abstract": m.raw_text[:1500]
                })()
            )

        # Academic fallback only if utc_campus and under top_k
        if tenant_id == "utc_campus" and len(matched_docs) < top_k:
            stmt = select(DocumentEmbedding).where(DocumentEmbedding.user_id == 1)
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
            stmt = stmt.limit(top_k - len(matched_docs))
            res = await session.execute(stmt)
            matched_docs.extend(res.scalars().all())

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

    nodes_dict = {}
    edges_list = []

    # -------------------------------------------------------------
    # 2. Graph Traversal: Industry-Adaptive Dynamic Graph Engine
    # -------------------------------------------------------------
    if tenant_id != "utc_campus":
        # Enterprise / Telecom Graph Traversal scoped strictly to tenant_id
        try:
            cypher_query = """
            MATCH (n {tenant_id: $tenant_id})
            OPTIONAL MATCH (n)-[r]->(m {tenant_id: $tenant_id})
            RETURN n, r, m, labels(n)[0] as n_label, labels(m)[0] as m_label
            LIMIT 35;
            """
            graph_records = execute_cypher(cypher_query, {"tenant_id": tenant_id})
            for rec in graph_records:
                n_data = rec.get("n") or {}
                m_data = rec.get("m") or {}
                r_data = rec.get("r") or {}
                n_type = rec.get("n_label") or "Node"
                m_type = rec.get("m_label") or "Node"

                # Process Node N
                if n_data:
                    n_id = (
                        n_data.get("employee_number") or
                        n_data.get("site_code") or
                        n_data.get("ticket_number") or
                        n_data.get("event_id") or
                        str(n_data.get("employee_id")) or
                        f"{n_type}_{abs(hash(str(n_data))) % 1000000}"
                    )
                    n_label = (
                        n_data.get("name") or
                        n_data.get("site_code") or
                        n_data.get("ticket_number") or
                        n_data.get("event_id") or
                        n_id
                    )
                    if n_id not in nodes_dict:
                        clean_props = {str(k): serialize_graph_property(v) for k, v in n_data.items()} if isinstance(n_data, dict) else {}
                        nodes_dict[n_id] = {
                            "id": n_id,
                            "label": str(n_label)[:28],
                            "type": n_type,
                            "properties": clean_props
                        }

                # Process Node M
                if m_data:
                    m_id = (
                        m_data.get("employee_number") or
                        m_data.get("site_code") or
                        m_data.get("ticket_number") or
                        m_data.get("event_id") or
                        str(m_data.get("employee_id")) or
                        f"{m_type}_{abs(hash(str(m_data))) % 1000000}"
                    )
                    m_label = (
                        m_data.get("name") or
                        m_data.get("site_code") or
                        m_data.get("ticket_number") or
                        m_data.get("event_id") or
                        m_id
                    )
                    if m_id not in nodes_dict:
                        clean_m_props = {str(k): serialize_graph_property(v) for k, v in m_data.items()} if isinstance(m_data, dict) else {}
                        nodes_dict[m_id] = {
                            "id": m_id,
                            "label": str(m_label)[:28],
                            "type": m_type,
                            "properties": clean_m_props
                        }

                # Process Edge R
                if n_data and m_data and r_data:
                    rel_type = (
                        r_data.type if hasattr(r_data, "type")
                        else r_data.get("type") if isinstance(r_data, dict)
                        else "CONNECTED_TO"
                    )
                    edge_id = f"edge-{n_id}-{m_id}-{rel_type}"
                    if not any(e["id"] == edge_id for e in edges_list):
                        edges_list.append({
                            "id": edge_id,
                            "source": n_id,
                            "target": m_id,
                            "relation": rel_type
                        })
        except Exception as ge:
            logger.warning(f"Enterprise Neo4j traversal note: {ge}")

        # Fallback to synthesizing graph nodes from matched_docs if graph is freshly created
        if not nodes_dict and matched_docs:
            for doc in matched_docs:
                t_id = f"tkt_{doc.grant_id}"
                e_id = f"emp_{abs(hash(doc.faculty_name)) % 1000000}"
                s_id = f"site_{abs(hash(doc.institution)) % 1000000}"

                nodes_dict[t_id] = {"id": t_id, "label": doc.project_title[:28], "type": "ServiceTicket", "properties": {"title": doc.project_title}}
                nodes_dict[e_id] = {"id": e_id, "label": doc.faculty_name[:25], "type": "Employee", "properties": {"name": doc.faculty_name}}
                nodes_dict[s_id] = {"id": s_id, "label": doc.institution[:25], "type": "NetworkSite", "properties": {"site_code": doc.institution}}

                edges_list.append({"id": f"e-{e_id}-{t_id}", "source": e_id, "target": t_id, "relation": "ASSIGNED_TO"})
                edges_list.append({"id": f"e-{t_id}-{s_id}", "source": t_id, "target": s_id, "relation": "AFFECTS_SITE"})

    else:
        # Academic Research Traversal (utc_campus)
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

            if fid not in nodes_dict:
                nodes_dict[fid] = {"id": fid, "label": doc.faculty_name[:25], "type": "Faculty", "properties": {"name": doc.faculty_name, "institution": doc.institution}}
            if pid not in nodes_dict:
                nodes_dict[pid] = {"id": pid, "label": doc.project_title[:28], "type": proj_type, "properties": {"title": doc.project_title, "grant_id": doc.grant_id, "amount": doc.award_amount}}
            if did not in nodes_dict:
                nodes_dict[did] = {"id": did, "label": doc.institution[:25], "type": "Department", "properties": {"name": doc.institution}}

            e1_id = f"edge-{fid}-{pid}"
            if not any(e["id"] == e1_id for e in edges_list):
                edges_list.append({"id": e1_id, "source": fid, "target": pid, "relation": rel_type})
            e2_id = f"edge-{pid}-{did}"
            if not any(e["id"] == e2_id for e in edges_list):
                edges_list.append({"id": e2_id, "source": pid, "target": did, "relation": "HOSTED_BY"})

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
    """TOOL 2: Executes real-time Google web search grounding."""
    logger.info(f"[Tool Execution]: tool_search_google_online for '{query_text}'")
    return perform_google_adk_online_search(query_text)

MEETING_KEYWORDS = ["meeting", "agenda", "senate", "dialog", "dialogue", "minutes", "mised", "committee"]

def is_meeting_query(query_text: str) -> bool:
    return any(kw in query_text.lower() for kw in MEETING_KEYWORDS)

async def run_google_adk_agent(
    query_text: str,
    top_k: int = 5,
    user_clearance: str = "HighlyConfidential",
    user_department: str | None = None,
    tenant_id: str = "utc_campus",
    industry: str = "telecom"
) -> dict:
    """
    Session 17: Multi-Tenant Google ADK Agent Orchestrator.
    Dynamically switches ontology, guardrails, and knowledge synthesis
    based on tenant_id and industry profile.
    """
    start_time = time.time()
    stages = ["Thinking & Query Intent Analysis..."]
    
    # 0. STRICT SECURITY GUARDRAIL: Block out-of-scope queries using active industry ontology
    is_out_of_scope = await check_query_out_of_scope(query_text, tenant_id=tenant_id, industry=industry)
    if is_out_of_scope:
        stages.append(f"⚠️ Security Guardrail Triggered: Query is outside {industry.capitalize()} enterprise scope.")
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

    # 1. Execute Tool 1: PostgreSQL + Neo4j Graph Search (Tenant Partitioned)
    stages.append(f"Traversing Neo4j Graph (Tenant: {tenant_id}, Clearance: {user_clearance})...")
    stages.append("Searching Canonical Enterprise Knowledge Memory...")
    tool1_res = await tool_search_pgvector_and_memgraph(
        query_text,
        top_k=top_k,
        user_clearance=user_clearance,
        user_department=user_department,
        tenant_id=tenant_id,
        industry=industry
    )

    # 2. Synthesis: Domain-Adaptive LLM Prompting
    if tenant_id != "utc_campus":
        # Enterprise / Telecommunications Synthesis
        stages.append(f"Synthesizing enterprise operations intelligence ({industry.capitalize()} ontology)...")
        system_prompt = (
            f"You are an expert Autonomous Enterprise Knowledge & Operations Copilot for {industry.capitalize()} intelligence. "
            "STRICT FORMATTING RULES:\n"
            "1. Provide a comprehensive, well-structured answer (3-5 detailed bullet points) citing operational incidents, network sites, tickets, and technical personnel.\n"
            "2. Wrap key personnel names, radio site codes, ticket numbers, and event IDs in double asterisks like **Site Code** or **Engineer Name**.\n"
            "3. Synthesize facts directly from the company's operational memory and Neo4j knowledge graph.\n"
            "4. DO NOT use markdown tables.\n"
            "5. Be direct, authoritative, and actionable."
        )
        user_prompt = f"""
Query: {query_text}

--- ENTERPRISE OPERATIONAL MEMORY EVIDENCE ---
{json.dumps(tool1_res['pgvector_citations'], indent=2, default=str)}

--- NEO4J KNOWLEDGE GRAPH ENTITIES & TOPOLOGY ---
Nodes Count: {len(tool1_res['graph_nodes'])}
Edges Count: {len(tool1_res['graph_edges'])}
Sample Graph Nodes:
{json.dumps(tool1_res['graph_nodes'][:10], indent=2, default=str)}

Synthesize a comprehensive operational briefing answering the query using bold highlights for entities.
"""
        final_answer = generate_groq_synthesis(system_prompt, user_prompt)
        tool2_res = []

    else:
        # Academic Research Synthesis (utc_campus)
        is_meeting = is_meeting_query(query_text)
        if is_meeting:
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
{json.dumps(tool1_res['pgvector_citations'], indent=2, default=str)}

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
{json.dumps(tool1_res['pgvector_citations'], indent=2, default=str)}

--- MEMGRAPH GRAPH NODES ---
Nodes Count: {len(tool1_res['graph_nodes'])}
Edges Count: {len(tool1_res['graph_edges'])}

--- GOOGLE SCHOLAR ONLINE GROUNDING ---
{json.dumps(tool2_res, indent=2, default=str)}

Synthesize a comprehensive 4-5 bullet point answer explaining the research findings, faculty involvement, grant funding, and scholarly background. Use **bold** highlights for all important entities. No tables.
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

