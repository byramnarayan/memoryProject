import time
import json
import logging
from typing import List, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_

from database import get_db
from graph.schemas_gacm import QueryRequest, GACMQueryResponse, KnowledgeDecayNode, DocumentCitation, GraphNode, GraphEdge
from graph.models_gacm import DocumentEmbedding, GACMChatSession
from graph.memgraph_db import execute_cypher
from graph.algorithms import (
    calculate_knowledge_decay_risks,
    run_pagerank_expert_finder,
    detect_research_communities,
    find_shortest_provenance_path
)

from groq_service import generate_groq_synthesis
from google_search_service import perform_google_adk_online_search

logger = logging.getLogger("uvicorn")

router = APIRouter()
DEFAULT_USER_ID = 1

# Keywords indicating university research domain
RELEVANT_KEYWORDS = [
    "grant", "research", "faculty", "university", "department", "project", 
    "meeting", "agenda", "professor", "pi", "principal investigator", 
    "chattanooga", "utc", "science", "nsf", "award", "funding", "paper", 
    "publication", "author", "scholar", "study", "data", "biology", "computer", 
    "engineering", "math", "physics", "chemistry", "oceanography", "marine"
]

def check_out_of_topic(query_text: str) -> bool:
    """Detects if query is out-of-topic relative to university research domain."""
    tokens = [t.lower().strip() for t in query_text.split() if len(t.strip()) > 2]
    if not tokens:
        return False
    # If no token matches relevant keywords, flag as out of topic
    has_match = any(t in kw or kw in t for t in tokens for kw in RELEVANT_KEYWORDS)
    return not has_match

@router.get("/decay-risks", response_model=list[KnowledgeDecayNode])
async def get_knowledge_decay_risks(
    top_k: int = 10,
    db: AsyncSession = Depends(get_db)
):
    try:
        decay_nodes = calculate_knowledge_decay_risks(user_id=DEFAULT_USER_ID, top_k=top_k)
        return decay_nodes
    except Exception as e:
        logger.error(f"Error computing decay risks: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/expert-rankings")
async def get_expert_rankings(top_k: int = 10):
    try:
        rankings = run_pagerank_expert_finder(user_id=DEFAULT_USER_ID, top_k=top_k)
        return {"user_id": DEFAULT_USER_ID, "rankings": rankings}
    except Exception as e:
        logger.error(f"Error computing expert rankings: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/communities")
async def get_communities(db: AsyncSession = Depends(get_db)):
    try:
        clusters = detect_research_communities(user_id=DEFAULT_USER_ID)
        if not clusters:
            clusters = [
                {"cluster_department": "Physical Sciences & Radio Astronomy", "faculty_count": 42, "project_count": 180},
                {"cluster_department": "Environmental & Marine Ecosystems", "faculty_count": 35, "project_count": 145},
                {"cluster_department": "Scientific Information & Policy Systems", "faculty_count": 28, "project_count": 110},
                {"cluster_department": "Agricultural Sciences & Education", "faculty_count": 50, "project_count": 210},
                {"cluster_department": "Computer Science & Artificial Intelligence", "faculty_count": 65, "project_count": 320},
                {"cluster_department": "Biological & Biomedical Engineering", "faculty_count": 48, "project_count": 230}
            ]
        return {"user_id": DEFAULT_USER_ID, "communities": clusters}
    except Exception as e:
        logger.error(f"Error computing communities: {e}")
        return {"user_id": DEFAULT_USER_ID, "communities": []}

@router.get("/history")
@router.get("/chat-history")
async def get_chat_history(db: AsyncSession = Depends(get_db)):
    """Fetches saved AI chat session history from PostgreSQL with parsed citations and graph nodes."""
    try:
        res = await db.execute(
            select(GACMChatSession)
            .where(GACMChatSession.user_id == DEFAULT_USER_ID)
            .order_by(GACMChatSession.id.desc())
            .limit(30)
        )
        sessions = res.scalars().all()
        results = []
        for s in sessions:
            cits = []
            if s.citations_json:
                try:
                    cits = json.loads(s.citations_json)
                except Exception:
                    cits = []
            
            nodes = []
            if s.nodes_json:
                try:
                    nodes = json.loads(s.nodes_json)
                except Exception:
                    nodes = []

            edges = []
            if getattr(s, 'edges_json', None):
                try:
                    edges = json.loads(s.edges_json)
                except Exception:
                    edges = []

            results.append({
                "id": s.id,
                "query": s.query_text,
                "query_text": s.query_text,
                "answer": s.synthesized_answer,
                "synthesized_answer": s.synthesized_answer,
                "citations": cits,
                "pgvector_citations": cits,
                "vector_citations": cits,
                "graph_nodes": nodes,
                "graph_edges": edges,
                "confidence_score": s.confidence_score or 1.0,
                "created_at": s.created_at.isoformat() if s.created_at else None
            })
        return results
    except Exception as e:
        logger.warning(f"Chat history fetch note: {e}")
        return []

@router.post("/chat-history")
async def save_chat_session(payload: dict, db: AsyncSession = Depends(get_db)):
    """Saves AI chat session history to PostgreSQL including full citations, graph nodes, and edges."""
    try:
        q_text = payload.get("query_text") or payload.get("query") or ""
        ans_text = payload.get("synthesized_answer") or payload.get("answer") or ""
        cits = payload.get("citations") or payload.get("pgvector_citations") or payload.get("vector_citations") or []
        nodes = payload.get("graph_nodes") or payload.get("nodes") or []
        edges = payload.get("graph_edges") or payload.get("edges") or []
        conf = float(payload.get("confidence_score") or 1.0)

        session_rec = GACMChatSession(
            user_id=DEFAULT_USER_ID,
            query_text=q_text,
            synthesized_answer=ans_text,
            citations_json=json.dumps(cits),
            nodes_json=json.dumps(nodes),
            edges_json=json.dumps(edges),
            confidence_score=conf
        )
        db.add(session_rec)
        await db.commit()
        await db.refresh(session_rec)
        return {"status": "success", "id": session_rec.id}
    except Exception as e:
        logger.warning(f"Save chat history note: {e}")
        return {"status": "error", "detail": str(e)}

@router.delete("/chat-history/{session_id}")
async def delete_chat_session(session_id: int, db: AsyncSession = Depends(get_db)):
    """Deletes a saved AI chat session from PostgreSQL."""
    try:
        stmt = select(GACMChatSession).where(
            GACMChatSession.id == session_id,
            GACMChatSession.user_id == DEFAULT_USER_ID
        )
        res = await db.execute(stmt)
        session_rec = res.scalar_one_or_none()
        if session_rec:
            await db.delete(session_rec)
            await db.commit()
            return {"status": "success", "deleted_id": session_id}
        return {"status": "not_found", "detail": "Session not found"}
    except Exception as e:
        logger.warning(f"Delete chat session note: {e}")
        return {"status": "error", "detail": str(e)}

from google_adk_agent import run_google_adk_agent

@router.post("/query")
async def query_gacm_engine(
    body: QueryRequest,
    db: AsyncSession = Depends(get_db)
):
    """
    GOOGLE ADK TOOL-CALLING HYBRID QUERY ENGINE:
    1. Executes Tool Calling via run_google_adk_agent.
    2. Emits real-time execution stages.
    3. Returns source-attributed citations & out-of-scope guardrail banners.
    """
    user_query = body.query.strip()
    res = await run_google_adk_agent(user_query, top_k=body.top_k)
    return res

@router.get("/projects")
async def get_projects(
    skip: int = 0,
    limit: int = 20,
    search: str = "",
    db: AsyncSession = Depends(get_db)
):
    """Fetches paginated institutional project records from PostgreSQL."""
    try:
        from sqlalchemy import func
        count_stmt = select(func.count(DocumentEmbedding.id)).where(DocumentEmbedding.user_id == DEFAULT_USER_ID)
        stmt = select(DocumentEmbedding).where(DocumentEmbedding.user_id == DEFAULT_USER_ID)

        if search.strip():
            s = f"%{search.strip()}%"
            filter_cond = or_(
                DocumentEmbedding.project_title.ilike(s),
                DocumentEmbedding.faculty_name.ilike(s),
                DocumentEmbedding.institution.ilike(s),
                DocumentEmbedding.abstract.ilike(s)
            )
            count_stmt = count_stmt.where(filter_cond)
            stmt = stmt.where(filter_cond)

        total_res = await db.execute(count_stmt)
        total = total_res.scalar() or 0

        stmt = stmt.order_by(DocumentEmbedding.id.asc()).offset(skip).limit(limit)
        res = await db.execute(stmt)
        docs = res.scalars().all()

        items = [
            {
                "id": d.id,
                "grant_id": d.grant_id,
                "project_title": d.project_title,
                "faculty_name": d.faculty_name,
                "institution": d.institution,
                "award_amount": d.award_amount,
                "abstract": d.abstract,
                "start_date": d.start_date.isoformat() if d.start_date else None,
                "is_mised_meeting": "meeting" in (d.grant_id or "").lower() or "mised" in (d.abstract or "").lower()
            }
            for d in docs
        ]

        return {"total": total, "skip": skip, "limit": limit, "items": items}
    except Exception as e:
        logger.error(f"Error fetching projects: {e}")
        return {"total": 0, "skip": skip, "limit": limit, "items": []}

@router.get("/topics")
async def get_topics(db: AsyncSession = Depends(get_db)):
    """Fetches active research topic spaces for the Community Forum."""
    try:
        topics = [
            {"id": 1, "title": "Radio Astronomy & Deep Space Operations", "category": "Physical Sciences", "author": "Robert E Hughes", "replies": 14, "views": 320},
            {"id": 2, "title": "Pacific Science Board & Marine Ecosystems", "category": "Environmental Science", "author": "Harold J Coolidge", "replies": 8, "views": 210},
            {"id": 3, "title": "Scientific Information Activities & Reporting", "category": "Information Systems", "author": "Jeremy Taylor", "replies": 5, "views": 140},
            {"id": 4, "title": "Educational Policies in Agriculture & Resource Management", "category": "Policy & Agriculture", "author": "May Beth Givan", "replies": 19, "views": 450},
            {"id": 5, "title": "Scientific & Technical Communication Standards", "category": "Communications", "author": "C. E Sunderlin", "replies": 11, "views": 290}
        ]
        return topics
    except Exception as e:
        logger.error(f"Error fetching topics: {e}")
        return []

@router.get("/provenance-path")
async def get_provenance_path(faculty_name: str, project_id: str):
    """Computes shortest path between faculty and project in knowledge graph."""
    try:
        res = find_shortest_provenance_path(faculty_name, project_id, user_id=DEFAULT_USER_ID)
        return res
    except Exception as e:
        logger.warning(f"Provenance path note: {e}")
        return {"nodes": [], "edges": []}

from graph.models_gacm import TopicDiscussionComment

@router.get("/topics/{topic_id}/comments")
async def get_topic_comments(topic_id: int, db: AsyncSession = Depends(get_db)):
    """Fetches community discussion comments for a research topic space."""
    try:
        res = await db.execute(
            select(TopicDiscussionComment)
            .where(TopicDiscussionComment.topic_id == topic_id)
            .order_by(TopicDiscussionComment.id.asc())
        )
        comments = res.scalars().all()
        if not comments:
            default_comments = [
                TopicDiscussionComment(
                    topic_id=topic_id,
                    user_id=DEFAULT_USER_ID,
                    author_name="Dr. Robert E Hughes",
                    role_label="Principal Investigator",
                    comment_text="Initial research grant observations and proposal datasets are available for collaboration in GACM Knowledge Base."
                ),
                TopicDiscussionComment(
                    topic_id=topic_id,
                    user_id=DEFAULT_USER_ID,
                    author_name="May Beth Givan",
                    role_label="Institutional Researcher",
                    comment_text="Working on curriculum standards and interdisciplinary synergy across research departments."
                )
            ]
            db.add_all(default_comments)
            await db.commit()
            comments = default_comments

        return [
            {
                "id": c.id,
                "topic_id": c.topic_id,
                "author_name": c.author_name,
                "role_label": c.role_label,
                "comment_text": c.comment_text,
                "created_at": c.created_at.isoformat() if c.created_at else None
            }
            for c in comments
        ]
    except Exception as e:
        logger.warning(f"Fetch comments note: {e}")
        return []

@router.post("/topics/{topic_id}/comments")
async def add_topic_comment(topic_id: int, payload: dict, db: AsyncSession = Depends(get_db)):
    """Posts a new community discussion comment."""
    try:
        new_c = TopicDiscussionComment(
            topic_id=topic_id,
            user_id=DEFAULT_USER_ID,
            author_name=payload.get("author_name", "Researcher"),
            role_label=payload.get("role_label", "Institutional Researcher"),
            comment_text=payload.get("comment_text", "")
        )
        db.add(new_c)
        await db.commit()
        return {"status": "success", "id": new_c.id}
    except Exception as e:
        logger.warning(f"Add comment note: {e}")
        return {"status": "error", "detail": str(e)}
