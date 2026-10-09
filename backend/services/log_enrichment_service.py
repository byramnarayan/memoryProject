import hashlib
import json
import logging
import re
from datetime import UTC, datetime
from typing import Any, Dict, List, Optional

from graph.memgraph_db import execute_cypher
from graph.models_gacm import ResearchMemoryObject
import models
from services.groq_rotation import groq_rotator

logger = logging.getLogger("uvicorn")


SYSTEM_PROMPT = """You are an Enterprise AI Knowledge Engineer and Operational Memory Expert.
Analyze the following employee operational work log / incident post-mortem / engineering decision.
Extract structured semantic intelligence, identifying trade-offs, root causes, impacted domain entities, and tacit intuition.

Respond strictly with valid JSON with the following exact keys:
{
  "primary_domain": "string (e.g. Radio Frequency Engineering, Core Network, Customer Support, Fiber Optics, Cloud Infrastructure)",
  "decision_category": "string (one of: 'Permanent Fix', 'Workaround', 'Architecture Change', 'Vendor Escalation', 'Operational Routine')",
  "urgency_level": "string (one of: 'Low', 'Medium', 'High', 'Critical')",
  "root_cause_analysis": "string (succinct analysis of root cause)",
  "impacted_kpis": ["list of affected metrics, e.g. Drop Call Rate (DCR), SLA MTTR, Packet Loss, Churn Risk"],
  "extracted_entities": {
    "cells_or_sites": ["list of cell codes or site codes"],
    "tickets_or_incidents": ["ticket or event numbers"],
    "technologies": ["e.g. 5G NR, 4G LTE, BGP, DWDM, Kubernetes"]
  },
  "intuition_tags": ["key tacit insights, e.g. firmware_bug, rain_fade, vendor_timeout, manual_watchdog"],
  "short_summary": "1-2 sentence executive briefing of the decision and outcome",
  "confidence_score": 95.0
}
"""


def heuristic_fallback_enrichment(
    title: str,
    decision_summary: str,
    trade_offs: Optional[str],
    incident_ref: Optional[str],
    impacted_system: Optional[str],
    intuition_notes: Optional[str],
) -> Dict[str, Any]:
    """
    Deterministic rule-based NLP fallback when Groq LLM API is unavailable.
    Detects telecom/enterprise patterns, regex entities, and tacit intuition.
    """
    combined = f"{title} {decision_summary} {trade_offs or ''} {intuition_notes or ''}".lower()

    # Domain detection
    primary_domain = "Enterprise Operations"
    if any(k in combined for k in ["cell", "rf", "antenna", "azimuth", "tilt", "drop call", "rssi", "sinr", "5g", "4g"]):
        primary_domain = "Radio Frequency Engineering"
    elif any(k in combined for k in ["fiber", "optical", "splice", "dwdm", "backhaul", "attenuation"]):
        primary_domain = "Transmission & Backhaul"
    elif any(k in combined for k in ["core", "epc", "mme", "pgw", "sgw", "hss", "upf", "amf"]):
        primary_domain = "Core Network"
    elif any(k in combined for k in ["ticket", "customer", "churn", "complaint", "billing", "sla"]):
        primary_domain = "Customer Service & SLA"
    elif any(k in combined for k in ["server", "database", "databricks", "lakehouse", "cloud", "api"]):
        primary_domain = "Cloud & Data Infrastructure"

    # Category detection
    category = "Permanent Fix"
    if any(k in combined for k in ["workaround", "temp", "patch", "bypass", "manual reboot", "fallback"]):
        category = "Workaround"
    elif any(k in combined for k in ["vendor", "escalat", "tac", "oem", "cisco", "ericsson", "nokia"]):
        category = "Vendor Escalation"
    elif any(k in combined for k in ["rearchitect", "redesign", "migration", "topology"]):
        category = "Architecture Change"

    # Entity extraction via regex
    cell_matches = re.findall(r"(?:CELL|SITE|BTS|NODEB)-[A-Z0-9-]+", combined.upper())
    tkt_matches = re.findall(r"(?:TKT|INC|EVT|ALARM)-[A-Z0-9-]+", combined.upper())

    if impacted_system and impacted_system.upper() not in cell_matches:
        cell_matches.append(impacted_system.upper())
    if incident_ref and incident_ref.upper() not in tkt_matches:
        tkt_matches.append(incident_ref.upper())

    # KPIs detection
    kpis = []
    if "drop" in combined or "dcr" in combined:
        kpis.append("Call Drop Rate (DCR)")
    if "latency" in combined or "jitter" in combined:
        kpis.append("Network Latency & Jitter")
    if "throughput" in combined or "bandwidth" in combined:
        kpis.append("Downlink/Uplink Throughput")
    if "ticket" in combined or "sla" in combined:
        kpis.append("SLA MTTR (Mean Time to Resolve)")
    if not kpis:
        kpis = ["System Availability & Uptime"]

    # Intuition tags
    tags = []
    if "firmware" in combined:
        tags.append("firmware_anomaly")
    if "heat" in combined or "temperature" in combined or "thermal" in combined:
        tags.append("thermal_stress")
    if "rain" in combined or "weather" in combined or "storm" in combined:
        tags.append("weather_degradation")
    if "power" in combined or "battery" in combined or "ups" in combined:
        tags.append("power_supply_issue")
    if not tags:
        tags.append("operational_intuition")

    return {
        "primary_domain": primary_domain,
        "decision_category": category,
        "urgency_level": "High" if any(w in combined for w in ["critical", "outage", "emergency", "severity 1"]) else "Medium",
        "root_cause_analysis": f"Incident linked to {impacted_system or 'operational subsystem'}. Observed behavior resolved via {category.lower()}.",
        "impacted_kpis": kpis,
        "extracted_entities": {
            "cells_or_sites": list(set(cell_matches)),
            "tickets_or_incidents": list(set(tkt_matches)),
            "technologies": ["5G NR", "4G LTE"] if "5g" in combined else ["Enterprise Telecom"],
        },
        "intuition_tags": tags,
        "short_summary": f"Decided on {category.lower()} for {impacted_system or title[:40]}. Trade-offs considered and root-cause captured.",
        "confidence_score": 88.0,
    }


def enrich_employee_log(
    title: str,
    decision_summary: str,
    trade_offs: Optional[str] = None,
    incident_ref: Optional[str] = None,
    impacted_system: Optional[str] = None,
    intuition_notes: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Enriches employee daily log using Groq LLM rotation with fallback to deterministic NLP.
    """
    user_prompt = f"""
TITLE: {title}
DECISION SUMMARY: {decision_summary}
TRADE-OFFS CONSIDERED: {trade_offs or 'None explicitly noted'}
INCIDENT / TICKET REF: {incident_ref or 'N/A'}
IMPACTED SYSTEM / CELL: {impacted_system or 'N/A'}
TACIT INTUITION / UNWRITTEN KNOWLEDGE: {intuition_notes or 'Standard operational baseline'}
"""

    llm_res = groq_rotator.call_json_completion(
        system_prompt=SYSTEM_PROMPT,
        prompt=user_prompt,
        temperature=0.1,
    )

    if llm_res and isinstance(llm_res, dict) and "primary_domain" in llm_res:
        # Validate and return LLM output
        return llm_res

    # Fallback to rule-based heuristic
    return heuristic_fallback_enrichment(
        title=title,
        decision_summary=decision_summary,
        trade_offs=trade_offs,
        incident_ref=incident_ref,
        impacted_system=impacted_system,
        intuition_notes=intuition_notes,
    )


def sync_log_to_neo4j(
    log: models.EmployeeDailyLog,
    enrichment: Dict[str, Any],
    author: models.User,
) -> Dict[str, Any]:
    """
    Upserts author, decision, and entity links into Neo4j Aura Property Graph:
    (:Employee)-[:LOGGED_DECISION]->(:Decision)-[:RESOLVED_INCIDENT]->(:NetworkEvent)
    (:Decision)-[:AFFECTS_SITE]->(:NetworkSite)
    (:Employee)-[:HAS_EXPERTISE_IN]->(:TechnologyDomain)
    """
    cypher = """
    MERGE (emp:Employee {employee_id: $emp_id, tenant_id: $tenant_id})
    ON CREATE SET emp.name = $emp_name, emp.department = $department, emp.job_title = $job_title
    ON MATCH SET emp.name = $emp_name, emp.job_title = $job_title

    MERGE (dec:Decision {decision_id: $decision_id, tenant_id: $tenant_id})
    SET dec.title = $title,
        dec.summary = $summary,
        dec.category = $category,
        dec.urgency = $urgency,
        dec.trade_offs = $trade_offs,
        dec.intuition = $intuition,
        dec.timestamp = $timestamp

    MERGE (emp)-[:LOGGED_DECISION]->(dec)

    FOREACH (domain IN $domains |
        MERGE (dom:TechnologyDomain {name: domain, tenant_id: $tenant_id})
        MERGE (emp)-[:HAS_EXPERTISE_IN]->(dom)
    )

    FOREACH (inc IN (CASE WHEN $incident_ref IS NOT NULL AND $incident_ref <> '' THEN [$incident_ref] ELSE [] END) |
        MERGE (evt:NetworkEvent {event_ref: inc, tenant_id: $tenant_id})
        MERGE (dec)-[:RESOLVED_INCIDENT]->(evt)
    )

    FOREACH (site IN (CASE WHEN $site_or_cell IS NOT NULL AND $site_or_cell <> '' THEN [$site_or_cell] ELSE [] END) |
        MERGE (ns:NetworkSite {code: site, tenant_id: $tenant_id})
        MERGE (dec)-[:AFFECTS_SITE]->(ns)
    )

    RETURN dec.decision_id AS decision_id
    """

    emp_identifier = author.employee_number or f"EMP-{author.id:04d}"
    emp_display_name = f"{author.first_name} {author.last_name}".strip() if (author.first_name or author.last_name) else author.username

    domains = [enrichment.get("primary_domain", "Enterprise Engineering")]
    if enrichment.get("intuition_tags"):
        domains.extend(enrichment.get("intuition_tags", [])[:2])

    params = {
        "tenant_id": log.tenant_id,
        "emp_id": emp_identifier,
        "emp_name": emp_display_name,
        "department": author.department or "Operations",
        "job_title": author.job_title or author.role or "Engineer",
        "decision_id": f"DEC-{log.id:06d}",
        "title": log.title,
        "summary": log.decision_summary,
        "category": log.decision_category,
        "urgency": log.urgency_level,
        "trade_offs": log.trade_offs_considered or "",
        "intuition": log.intuition_notes or "",
        "timestamp": log.log_date.isoformat() if log.log_date else datetime.now(UTC).isoformat(),
        "domains": domains,
        "incident_ref": log.incident_or_ticket_ref or "",
        "site_or_cell": log.impacted_system_or_cell or "",
    }

    try:
        results = execute_cypher(cypher, params)
        return {
            "success": True,
            "decision_node": f"DEC-{log.id:06d}",
            "records_linked": len(results),
        }
    except Exception as e:
        logger.warning(f"Neo4j graph sync note for decision log {log.id}: {e}")
        return {
            "success": False,
            "error": str(e),
        }


async def create_canonical_memory_from_log(
    log: models.EmployeeDailyLog,
    enrichment: Dict[str, Any],
    author: models.User,
    db: Any,
) -> Optional[ResearchMemoryObject]:
    """
    Converts rich employee daily log into a searchable Enterprise Canonical Memory Object.
    Ensures long-term indexing in vector and hybrid memory search.
    """
    mem_id = f"MEM-DECISION-{log.tenant_id.upper()}-{log.id:06d}"

    raw_text = f"""ENTERPRISE OPERATIONAL DECISION LOG
ID: DEC-{log.id:06d}
Date: {log.log_date.strftime('%Y-%m-%d %H:%M UTC') if log.log_date else 'N/A'}
Author: {author.username} ({author.job_title or author.role}, {author.department})
Title: {log.title}

DECISION & ACTION:
{log.decision_summary}

TRADE-OFFS & REJECTED ALTERNATIVES:
{log.trade_offs_considered or 'No alternative paths documented.'}

OPERATIONAL TARGETS:
Impacted System/Cell: {log.impacted_system_or_cell or 'General Infrastructure'}
Incident/Ticket Reference: {log.incident_or_ticket_ref or 'None'}

TACIT INTUITION & UNWRITTEN POST-MORTEM NOTES:
{log.intuition_notes or 'Baseline operational heuristics.'}

AI ROOT CAUSE INSIGHT:
{enrichment.get('root_cause_analysis', 'Standard resolution path.')}
"""

    content_hash = hashlib.sha256(raw_text.encode("utf-8")).hexdigest()

    mem_obj = ResearchMemoryObject(
        memory_id=mem_id,
        tenant_id=log.tenant_id,
        user_id=author.id,
        domain=author.department.lower().replace(" ", "_") if author.department else "enterprise_operations",
        category="Operational",
        memory_type="EmployeeDecision",
        severity=log.urgency_level,
        sensitivity_level="Internal",
        lifecycle_stage="Active",
        title=f"Decision DEC-{log.id:06d}: {log.title}",
        raw_text=raw_text,
        content_hash=content_hash,
        confidence_score=enrichment.get("confidence_score", 92.0),
        needs_review=False,
    )

    mem_obj.set_summaries({
        "short_summary": enrichment.get("short_summary", log.decision_summary[:120]),
        "detailed_summary": f"{log.title}: {log.decision_summary}. Trade-offs: {log.trade_offs_considered or 'None'}.",
        "compliance_summary": f"Captured by {author.username} under company operational governance standards.",
    })

    entities = {
        "author": author.username,
        "employee_id": author.employee_number or f"EMP-{author.id:04d}",
        "department": author.department,
        "category": log.decision_category,
        "urgency": log.urgency_level,
        "impacted_kpis": enrichment.get("impacted_kpis", []),
        "impacted_system": log.impacted_system_or_cell,
        "incident_ref": log.incident_or_ticket_ref,
        "intuition_tags": enrichment.get("intuition_tags", []),
    }
    mem_obj.set_entities(entities)

    db.add(mem_obj)
    log.canonical_memory_id = mem_id

    return mem_obj
