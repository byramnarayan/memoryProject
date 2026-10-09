import json
import logging
from typing import Any, Dict, List, Optional
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

import models
from graph.models_gacm import ResearchMemoryObject
from services.groq_rotation import groq_rotator

logger = logging.getLogger("uvicorn")


COPILOT_SYSTEM_PROMPT = """You are the AI Shadow Assistant and Succession Co-Pilot representing a transitioning senior employee (the 'Predecessor').
A new hire or successor is asking you questions about how to manage operational systems, handle recurring outages, deal with equipment quirks, or understand past technical decisions.

You MUST ground your response strictly and exclusively in the Predecessor's recorded decisions, trade-offs, ticket post-mortems, and tacit intuition notes provided in the context.

Respond strictly with valid JSON with the following structure:
{
  "predecessor_name": "Full name of the predecessor",
  "synthesized_advice": "Detailed, professional, step-by-step guidance addressing the successor's inquiry, explaining why decisions were made.",
  "unwritten_intuition_caveats": "Any tacit insights, vendor firmware bugs, or unwritten rules the successor must remember (from the intuition notes).",
  "citations": [
    {
      "reference_id": "e.g. DEC-000002 or EVT-2026-000842",
      "title": "Title of the cited log or incident",
      "relevance_summary": "Why this decision applies to the question"
    }
  ],
  "confidence_score": 96.0
}
"""


async def query_predecessor_brain(
    predecessor_id: int,
    tenant_id: str,
    query: str,
    db: AsyncSession,
) -> Dict[str, Any]:
    """
    Retrieves predecessor's documented decisions and tacit intuition,
    synthesizing grounded responses for the successor co-pilot.
    """
    # 1. Fetch Predecessor Profile
    user_res = await db.execute(select(models.User).where(models.User.id == predecessor_id))
    predecessor = user_res.scalar_one_or_none()
    if not predecessor:
        return {
            "error": "Predecessor account not found.",
            "synthesized_advice": "Unable to locate predecessor profile.",
            "citations": [],
            "confidence_score": 0.0,
        }

    pred_name = f"{predecessor.first_name or ''} {predecessor.last_name or ''}".strip() or predecessor.username
    pred_role = predecessor.job_title or predecessor.role

    # 2. Fetch Predecessor Daily Logs & Decisions
    logs_res = await db.execute(
        select(models.EmployeeDailyLog)
        .where(
            models.EmployeeDailyLog.user_id == predecessor_id,
            models.EmployeeDailyLog.tenant_id == tenant_id,
        )
        .order_by(models.EmployeeDailyLog.log_date.desc())
        .limit(20)
    )
    logs = logs_res.scalars().all()

    # 3. Format Context Records
    evidence_blocks = []
    for log in logs:
        block = f"""---
RECORD ID: DEC-{log.id:06d}
TITLE: {log.title}
CATEGORY: {log.decision_category} (Urgency: {log.urgency_level})
IMPACTED CELL/SYSTEM: {log.impacted_system_or_cell or 'N/A'}
INCIDENT/TICKET REF: {log.incident_or_ticket_ref or 'N/A'}
DECISION & ACTION:
{log.decision_summary}

REJECTED ALTERNATIVES & TRADE-OFFS:
{log.trade_offs_considered or 'None documented'}

TACIT INTUITION & UNWRITTEN POST-MORTEM NOTES:
{log.intuition_notes or 'Standard operation'}
"""
        evidence_blocks.append(block)

    # If no logs exist, provide standard fallback
    if not evidence_blocks:
        return {
            "predecessor_name": pred_name,
            "synthesized_advice": f"No operational decision logs have been recorded yet by {pred_name} ({pred_role}). Encourage {pred_name} to log daily workarounds in the /logs portal before departing.",
            "unwritten_intuition_caveats": "No tacit intuition captured yet.",
            "citations": [],
            "confidence_score": 50.0,
        }

    context_str = "\n".join(evidence_blocks)

    # 4. Invoke LLM via Groq Key Rotator
    user_prompt = f"""PREDECESSOR: {pred_name} ({pred_role}, {predecessor.department})
SUCCESSOR INQUIRY: "{query}"

PREDECESSOR'S RECORDED DECISIONS & TACIT INTUITION:
{context_str}
"""

    llm_res = groq_rotator.call_json_completion(
        system_prompt=COPILOT_SYSTEM_PROMPT,
        prompt=user_prompt,
        temperature=0.1,
    )

    if llm_res and isinstance(llm_res, dict) and "synthesized_advice" in llm_res:
        return llm_res

    # 5. Deterministic Fallback if Groq unavailable
    # Match query words to logs
    q_words = [w.lower() for w in query.split() if len(w) > 3]
    matched_logs = []
    for log in logs:
        text_corpus = f"{log.title} {log.decision_summary} {log.intuition_notes or ''} {log.impacted_system_or_cell or ''}".lower()
        if any(w in text_corpus for w in q_words) or not q_words:
            matched_logs.append(log)

    best_log = matched_logs[0] if matched_logs else logs[0]
    citations = [{
        "reference_id": f"DEC-{best_log.id:06d}",
        "title": best_log.title,
        "relevance_summary": f"Primary workaround applied by {pred_name} regarding {best_log.impacted_system_or_cell or 'subsystem'}.",
    }]

    return {
        "predecessor_name": pred_name,
        "synthesized_advice": (
            f"Based on {pred_name}'s logged decisions, when addressing this: '{best_log.decision_summary}'. "
            f"Regarding alternatives: {best_log.trade_offs_considered or 'Direct intervention was selected.'}"
        ),
        "unwritten_intuition_caveats": best_log.intuition_notes or "Follow standard operational procedures and verify optical power levels before resets.",
        "citations": citations,
        "confidence_score": 88.0,
    }
