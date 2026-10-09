import json
import logging
from datetime import datetime, timezone
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, status, Response
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_

from database import get_db
import models
from services.access_control import get_optional_current_user
from graph.models_gacm import CaptureJob, ResearchMemoryObject
from services.capture_service import process_document_capture

logger = logging.getLogger("capture_router")

router = APIRouter()

DEFAULT_TENANT_ID = "utc_campus"
DEFAULT_USER_ID = 1

async def ensure_telco_demo_capture_jobs(db: AsyncSession, tenant_id: str, user_id: int):
    """Guarantees the capture queue has rich operational incident & workaround jobs for telecom presentations."""
    try:
        check_stmt = select(func.count(CaptureJob.id)).where(CaptureJob.tenant_id == tenant_id)
        res = await db.execute(check_stmt)
        if (res.scalar() or 0) > 0:
            return

        now = datetime.now(timezone.utc)
        telco_seed_jobs = [
            CaptureJob(
                capture_id="CAP-20261009-RAN-01",
                tenant_id=tenant_id,
                user_id=user_id,
                file_name="SOP-RAN-Sector3-MIMO-Tilt.pdf",
                file_size_bytes=2450800,
                file_type="pdf",
                content_hash="8a7f9b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a",
                source_system="NOC Ingestion",
                memory_type_hint="CellOutageSOP",
                department="Radio Access Network (RAN)",
                sensitivity_level="Internal",
                status="completed",
                extracted_title="Sector 3 Massive MIMO Azimuth Tilt & Beamforming Recovery SOP",
                page_count=6,
                sections_json=json.dumps([
                    {"name": "Incident Summary", "text": "CELL-MUM-0001-A experiencing intermittent coverage drop in sector 3.", "order": 1},
                    {"name": "Root Cause Analysis", "text": "Azimuth tilt drifted +4 degrees following monsoon wind vibration.", "order": 2},
                    {"name": "Immediate Workaround", "text": "Remote RET (Remote Electrical Tilt) calibration applied -2.5 degrees; digital beamforming profile reset.", "order": 3},
                    {"name": "Verification Steps", "text": "Drive-test CQI returned to 98.4%; SINR improved by +6.2 dB.", "order": 4}
                ]),
                raw_text="Operational SOP: Sector 3 Massive MIMO Azimuth Tilt & Beamforming Recovery SOP for Bandra Kurla Tower Alpha.",
                resulting_memory_id="MEM-TELCO-OUTAGE-novatel_communications-EVT-OUT-0091",
                created_at=now,
                completed_at=now
            ),
            CaptureJob(
                capture_id="CAP-20261009-CORE-02",
                tenant_id=tenant_id,
                user_id=user_id,
                file_name="UPF-BGP-Core-Reroute-Incident.docx",
                file_size_bytes=1890200,
                file_type="docx",
                content_hash="3e4d5c6b7a8f9e0d1c2b3a4f5e6d7c8b9a0f1e2d3c4b5a6f7e8d9c0b1a2f3e4d",
                source_system="NOC Ingestion",
                memory_type_hint="EngineeringWorkaround",
                department="Core Network & EPC (5G/LTE)",
                sensitivity_level="Restricted",
                status="completed",
                extracted_title="UPF Packet Core BGP Damping & Session Route Failover Runbook",
                page_count=4,
                sections_json=json.dumps([
                    {"name": "Incident Summary", "text": "Flapping BGP peer on Dell Core Edge switch causing packet core session drops.", "order": 1},
                    {"name": "Root Cause Analysis", "text": "Route dampening penalty exceeded threshold during link renegotiation.", "order": 2},
                    {"name": "Immediate Workaround", "text": "Bypass primary AS path via secondary MPLS tunnel and adjust flap penalty halflife to 15m.", "order": 3}
                ]),
                raw_text="Engineering Workaround: Core Network UPF Route Dampening & Failover Runbook.",
                resulting_memory_id="MEM-TELCO-OUTAGE-novatel_communications-EVT-ALM-0144",
                created_at=now,
                completed_at=now
            ),
            CaptureJob(
                capture_id="CAP-20261009-OPT-03",
                tenant_id=tenant_id,
                user_id=user_id,
                file_name="Nokia-DWDM-Transceiver-LOS-Workaround.txt",
                file_size_bytes=784300,
                file_type="txt",
                content_hash="1f2e3d4c5b6a7f8e9d0c1b2a3f4e5d6c7b8a9f0e1d2c3b4a5f6e7d8c9b0a1f2e",
                source_system="Field Engineering",
                memory_type_hint="HardwareReplacement",
                department="Optical Transport & IP Backhaul",
                sensitivity_level="Internal",
                status="completed",
                extracted_title="Nokia DWDM SFP+ Optical Transceiver Loss-of-Signal Workaround",
                page_count=3,
                sections_json=json.dumps([
                    {"name": "Incident Summary", "text": "Loss of signal on 100G lambda link connecting Delhi Connaught Place to Noida Hub.", "order": 1},
                    {"name": "Root Cause Analysis", "text": "Dirty optical fiber patch panel connector and laser degradation.", "order": 2},
                    {"name": "Immediate Workaround", "text": "Cleaned LC ferrule with isopropanol and switched traffic to protection ring wavelength #14.", "order": 3}
                ]),
                raw_text="Field Workaround: Optical Transport DWDM SFP+ Transceiver Clean & Reroute.",
                resulting_memory_id="MEM-TELCO-OUTAGE-novatel_communications-EVT-ALM-0210",
                created_at=now,
                completed_at=now
            ),
            CaptureJob(
                capture_id="CAP-20261009-SLA-04",
                tenant_id=tenant_id,
                user_id=user_id,
                file_name="Enterprise-Dedicated-Line-Escalation-842.json",
                file_size_bytes=425100,
                file_type="json",
                content_hash="5c6b7a8f9e0d1c2b3a4f5e6d7c8b9a0f1e2d3c4b5a6f7e8d9c0b1a2f3e4d5c6b",
                source_system="Salesforce Telecom",
                memory_type_hint="ServiceTicket",
                department="Customer Experience & B2B SLA",
                sensitivity_level="Confidential",
                status="completed",
                extracted_title="Gold Enterprise Leased Line High Packet Drop Escalation & Waiver",
                page_count=2,
                sections_json=json.dumps([
                    {"name": "Incident Summary", "text": "Enterprise client HDFC Bank reporting jitter and packet loss on 10Gbps dedicated link.", "order": 1},
                    {"name": "Action Taken", "text": "Re-prioritized DSCP Expedited Forwarding (EF) queue and credited SLA penalty under contract terms.", "order": 2}
                ]),
                raw_text="Support Ticket: B2B Enterprise Leased Line Service Escalation.",
                resulting_memory_id="MEM-TELCO-TKT-novatel_communications-TKT-2026-000842",
                created_at=now,
                completed_at=now
            )
        ]
        for j in telco_seed_jobs:
            db.add(j)
        await db.commit()
    except Exception as e:
        logger.warning(f"Could not auto-seed telecom capture jobs: {e}")

class CaptureJSONRequest(BaseModel):
    title: str = Field(..., description="Project or meeting title")
    content: str = Field(..., description="Abstract or full document body")
    department: str = Field("Research Division", description="Academic department or college")
    memory_type: str = Field("GrantAward", description="GrantAward, ResearchProposal, MeetingMinutes, IRBProtocol, LabIncident")
    sensitivity_level: str = Field("Public", description="Public, Internal, Restricted, Confidential, HighlyConfidential")
    external_id: Optional[str] = Field(None, description="External reference ID (e.g. Cayuse, Banner, NSF Grant ID)")
    entities: Optional[dict] = Field(default_factory=dict, description="Pre-extracted entities")

@router.post("/upload", status_code=status.HTTP_202_ACCEPTED)
async def upload_document_file(
    response: Response,
    file: UploadFile = File(...),
    department: str = Form("Computer Science & Engineering"),
    memory_type: str = Form("GrantAward"),
    sensitivity_level: str = Form("Public"),
    current_user: Optional[models.User] = Depends(get_optional_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    MEMORY CAPTURE INGESTION ENDPOINT:
    - Accepts PDF, DOCX, TXT, CSV, or JSON documents.
    - Performs SHA-256 duplicate validation (CAP-1005).
    - Extracts structured text, sections, and page counts.
    - Asynchronously builds Canonical ResearchMemoryObject.
    - Acknowledges within the 2-second ingestion SLO.
    """
    file_bytes = await file.read()
    if not file_bytes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="CAP-1003: Empty file uploaded."
        )

    tenant_id = getattr(current_user, "tenant_id", None) or DEFAULT_TENANT_ID
    user_id = getattr(current_user, "id", None) or DEFAULT_USER_ID

    res = await process_document_capture(
        session=db,
        file_name=file.filename or "uploaded_document",
        file_bytes=file_bytes,
        department=department,
        memory_type=memory_type,
        sensitivity_level=sensitivity_level,
        tenant_id=tenant_id,
        user_id=user_id
    )

    if res.get("status") == "duplicate_blocked":
        response.status_code = status.HTTP_409_CONFLICT
        return res

    if res.get("status") == "failed":
        response.status_code = status.HTTP_422_UNPROCESSABLE_ENTITY
        return res

    response.status_code = status.HTTP_202_ACCEPTED
    return res

@router.post("/json", status_code=status.HTTP_201_CREATED)
async def ingest_json_memory(
    payload: CaptureJSONRequest,
    current_user: Optional[models.User] = Depends(get_optional_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Direct programmatic JSON ingestion for external university grant systems (e.g. Cayuse / Banner)."""
    file_bytes = json.dumps({
        "title": payload.title,
        "abstract": payload.content,
        "external_id": payload.external_id,
        "entities": payload.entities
    }).encode("utf-8")

    tenant_id = getattr(current_user, "tenant_id", None) or DEFAULT_TENANT_ID
    user_id = getattr(current_user, "id", None) or DEFAULT_USER_ID

    res = await process_document_capture(
        session=db,
        file_name=f"api_{payload.external_id or 'record'}.json",
        file_bytes=file_bytes,
        department=payload.department,
        memory_type=payload.memory_type,
        sensitivity_level=payload.sensitivity_level,
        tenant_id=tenant_id,
        user_id=user_id
    )

    if res.get("status") == "duplicate_blocked":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=res.get("message")
        )

    return res

@router.get("/queue")
async def get_capture_queue(
    skip: int = 0,
    limit: int = 25,
    status_filter: str = "",
    current_user: Optional[models.User] = Depends(get_optional_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Fetches paginated ingestion jobs for the Capture Dashboard & Queue Table."""
    tenant_id = getattr(current_user, "tenant_id", None) or DEFAULT_TENANT_ID
    user_id = getattr(current_user, "id", None) or DEFAULT_USER_ID

    try:
        if tenant_id == "novatel_communications":
            await ensure_telco_demo_capture_jobs(db, tenant_id, user_id)

        count_stmt = select(func.count(CaptureJob.id)).where(CaptureJob.tenant_id == tenant_id)
        stmt = select(CaptureJob).where(CaptureJob.tenant_id == tenant_id)

        if status_filter.strip():
            count_stmt = count_stmt.where(CaptureJob.status == status_filter.strip())
            stmt = stmt.where(CaptureJob.status == status_filter.strip())

        total_res = await db.execute(count_stmt)
        total = total_res.scalar() or 0

        stmt = stmt.order_by(CaptureJob.id.desc()).offset(skip).limit(limit)
        res = await db.execute(stmt)
        jobs = res.scalars().all()

        items = [
            {
                "id": j.id,
                "capture_id": j.capture_id,
                "file_name": j.file_name,
                "file_size_bytes": j.file_size_bytes,
                "file_type": j.file_type,
                "source_system": j.source_system,
                "memory_type": j.memory_type_hint,
                "department": j.department,
                "sensitivity_level": j.sensitivity_level,
                "status": j.status,
                "error_code": j.error_code,
                "error_message": j.error_message,
                "extracted_title": j.extracted_title,
                "page_count": j.page_count,
                "resulting_memory_id": j.resulting_memory_id,
                "created_at": j.created_at.isoformat() if j.created_at else None,
                "completed_at": j.completed_at.isoformat() if j.completed_at else None
            }
            for j in jobs
        ]

        return {"total": total, "skip": skip, "limit": limit, "items": items}
    except Exception as e:
        logger.error(f"Error fetching capture queue: {e}")
        return {"total": 0, "skip": skip, "limit": limit, "items": []}

@router.get("/memory/{memory_id}")
async def get_canonical_memory_details(memory_id: str, db: AsyncSession = Depends(get_db)):
    """Fetches full AI-enriched canonical memory record by memory_id."""
    stmt = select(ResearchMemoryObject).where(
        ResearchMemoryObject.memory_id == memory_id
    )
    res = await db.execute(stmt)
    mem = res.scalar_one_or_none()

    if not mem:
        raise HTTPException(status_code=404, detail="Research memory object not found.")

    return {
        "memory_id": mem.memory_id,
        "title": mem.title,
        "memory_type": mem.memory_type,
        "category": mem.category,
        "department": mem.get_entities().get("department", "Research Division"),
        "sensitivity_level": mem.sensitivity_level,
        "lifecycle_stage": mem.lifecycle_stage,
        "confidence_score": mem.confidence_score,
        "needs_review": mem.needs_review,
        "review_status": mem.review_status,
        "entities": mem.get_entities(),
        "derived_summaries": mem.get_derived_summaries(),
        "tags": mem.get_tags(),
        "created_at": mem.created_at.isoformat() if mem.created_at else None,
        "updated_at": mem.updated_at.isoformat() if mem.updated_at else None
    }

@router.post("/enrich/{memory_id}")
async def trigger_ai_enrichment(memory_id: str, db: AsyncSession = Depends(get_db)):
    """Triggers or re-runs AI extraction & multi-tier summarization for a memory object."""
    from services.processing_service import enrich_memory_object_in_db
    enrichment = await enrich_memory_object_in_db(session=db, memory_id=memory_id)
    if not enrichment:
        raise HTTPException(status_code=404, detail=f"Memory object {memory_id} not found.")
    return {
        "status": "enriched",
        "memory_id": memory_id,
        "enrichment": enrichment
    }

@router.post("/sync-graph/{memory_id}")
async def trigger_graph_vector_sync(memory_id: str, db: AsyncSession = Depends(get_db)):
    """Triggers or re-synchronizes Neo4j Aura Graph nodes and 384d Vector Store for a memory object."""
    from services.graph_sync_service import sync_memory_e2e
    sync_result = await sync_memory_e2e(session=db, memory_id=memory_id)
    if sync_result.get("status") == "error":
        raise HTTPException(status_code=404, detail=sync_result.get("message"))
    return sync_result

@router.get("/{capture_id}")
async def get_capture_details(capture_id: str, db: AsyncSession = Depends(get_db)):
    """Fetches full parsing results, section tree, and AI enrichment for an individual capture job."""
    stmt = select(CaptureJob).where(
        CaptureJob.capture_id == capture_id
    )
    res = await db.execute(stmt)
    job = res.scalar_one_or_none()

    if not job:
        raise HTTPException(status_code=404, detail="Capture job not found.")

    # Check if resulting memory exists and pull its AI enrichment
    memory_info = None
    if job.resulting_memory_id:
        mem_stmt = select(ResearchMemoryObject).where(
            ResearchMemoryObject.memory_id == job.resulting_memory_id
        )
        mem_res = await db.execute(mem_stmt)
        mem = mem_res.scalar_one_or_none()
        if mem:
            memory_info = {
                "memory_id": mem.memory_id,
                "confidence_score": mem.confidence_score,
                "needs_review": mem.needs_review,
                "review_status": mem.review_status,
                "entities": mem.get_entities(),
                "derived_summaries": mem.get_derived_summaries(),
                "tags": mem.get_tags()
            }

    return {
        "capture_id": job.capture_id,
        "file_name": job.file_name,
        "status": job.status,
        "error_code": job.error_code,
        "error_message": job.error_message,
        "extracted_title": job.extracted_title,
        "page_count": job.page_count,
        "sections": job.get_sections(),
        "preview_text": job.raw_text,
        "resulting_memory_id": job.resulting_memory_id,
        "memory_details": memory_info,
        "created_at": job.created_at.isoformat() if job.created_at else None
    }
