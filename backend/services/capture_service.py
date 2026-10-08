import os
import re
import json
import uuid
import hashlib
import logging
from pathlib import Path
from datetime import datetime, timezone
from typing import Dict, Any, Optional

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_

from graph.models_gacm import CaptureJob, ResearchMemoryObject
from services.document_parser import parse_document, compute_sha256, detect_file_type
from services.processing_service import enrich_research_memory

logger = logging.getLogger("capture_service")

MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024  # 50 MB
MIN_CONTENT_CHARS = 50

UPLOAD_STORAGE_ROOT = Path(__file__).resolve().parent.parent / "media" / "uploads"

def generate_capture_id() -> str:
    """Generates unique sortable Capture ID, e.g. CAP-20261008-A1B2"""
    date_str = datetime.now(timezone.utc).strftime("%Y%m%d")
    short_uuid = uuid.uuid4().hex[:6].upper()
    return f"CAP-{date_str}-{short_uuid}"

def generate_memory_id(memory_type: str, next_index: int) -> str:
    """Generates human-readable canonical Memory ID, e.g. MEM-GRT-018001"""
    type_map = {
        "GrantAward": "GRT",
        "ResearchProposal": "PRP",
        "MeetingMinutes": "MTG",
        "IRBProtocol": "IRB",
        "LabIncident": "LAB",
        "FacultyPublication": "PUB"
    }
    code = type_map.get(memory_type, "DOC")
    return f"MEM-{code}-{next_index:06d}"

async def process_document_capture(
    session: AsyncSession,
    file_name: str,
    file_bytes: bytes,
    department: str = "Research Division",
    memory_type: str = "GrantAward",
    sensitivity_level: str = "Public",
    tenant_id: str = "utc_campus",
    user_id: int = 1
) -> Dict[str, Any]:
    """
    Core Capture Engine Pipeline:
    1. Validation (size, type)
    2. SHA-256 Deduplication check (CAP-1005)
    3. Document Parsing & Section Extraction
    4. Canonical ResearchMemoryObject Generation
    5. Persistence & State Machine Updates
    """
    capture_id = generate_capture_id()
    file_size = len(file_bytes)

    # 1. Validate File Size
    if file_size > MAX_FILE_SIZE_BYTES:
        job = CaptureJob(
            capture_id=capture_id,
            tenant_id=tenant_id,
            user_id=user_id,
            file_name=file_name,
            file_size_bytes=file_size,
            file_type=file_name.split(".")[-1].lower(),
            content_hash="none",
            source_system="Upload",
            status="failed",
            error_code="CAP-1002",
            error_message=f"File exceeds maximum size of 50 MB ({file_size / (1024*1024):.1f} MB uploaded)."
        )
        session.add(job)
        await session.commit()
        return {
            "status": "failed",
            "error_code": "CAP-1002",
            "error": job.error_message,
            "capture_id": capture_id
        }

    # 2. Compute SHA-256 Content Hash
    content_hash = compute_sha256(file_bytes)

    # Check Deduplication against existing memories
    dup_res = await session.execute(
        select(ResearchMemoryObject).where(
            ResearchMemoryObject.tenant_id == tenant_id,
            ResearchMemoryObject.content_hash == content_hash
        )
    )
    existing_mem = dup_res.scalar_one_or_none()

    if existing_mem:
        job = CaptureJob(
            capture_id=capture_id,
            tenant_id=tenant_id,
            user_id=user_id,
            file_name=file_name,
            file_size_bytes=file_size,
            file_type=file_name.split(".")[-1].lower(),
            content_hash=content_hash,
            source_system="Upload",
            memory_type_hint=memory_type,
            department=department,
            sensitivity_level=sensitivity_level,
            status="duplicate_blocked",
            error_code="CAP-1005",
            error_message=f"Exact duplicate detected. Document was already captured as {existing_mem.memory_id}.",
            resulting_memory_id=existing_mem.memory_id
        )
        session.add(job)
        await session.commit()
        return {
            "status": "duplicate_blocked",
            "error_code": "CAP-1005",
            "message": job.error_message,
            "capture_id": capture_id,
            "existing_memory_id": existing_mem.memory_id,
            "existing_title": existing_mem.title
        }

    # 3. Document Parsing
    try:
        doc = parse_document(file_name, file_bytes)
    except ValueError as ve:
        err_msg = str(ve)
        job = CaptureJob(
            capture_id=capture_id,
            tenant_id=tenant_id,
            user_id=user_id,
            file_name=file_name,
            file_size_bytes=file_size,
            file_type=file_name.split(".")[-1].lower(),
            content_hash=content_hash,
            source_system="Upload",
            status="failed",
            error_code="CAP-1001",
            error_message=err_msg
        )
        session.add(job)
        await session.commit()
        return {
            "status": "failed",
            "error_code": "CAP-1001",
            "error": err_msg,
            "capture_id": capture_id
        }

    # Check minimum text content
    if len(doc.raw_text.strip()) < MIN_CONTENT_CHARS:
        err_msg = f"CAP-1008: Not enough readable text content ({len(doc.raw_text.strip())} chars; min {MIN_CONTENT_CHARS} required)."
        job = CaptureJob(
            capture_id=capture_id,
            tenant_id=tenant_id,
            user_id=user_id,
            file_name=file_name,
            file_size_bytes=file_size,
            file_type=doc.file_type,
            content_hash=content_hash,
            source_system="Upload",
            status="failed",
            error_code="CAP-1008",
            error_message=err_msg
        )
        session.add(job)
        await session.commit()
        return {
            "status": "failed",
            "error_code": "CAP-1008",
            "error": err_msg,
            "capture_id": capture_id
        }

    # 4. Save raw file bytes to disk for audit
    now = datetime.now(timezone.utc)
    upload_dir = UPLOAD_STORAGE_ROOT / tenant_id / now.strftime("%Y") / now.strftime("%m")
    upload_dir.mkdir(parents=True, exist_ok=True)
    saved_file_path = upload_dir / f"{capture_id}_{file_name}"
    try:
        with open(saved_file_path, "wb") as f:
            f.write(file_bytes)
    except Exception as e:
        logger.warning(f"Could not save local file archive: {e}")

    # 5. Determine next Memory ID sequence
    count_res = await session.execute(select(func.count(ResearchMemoryObject.id)))
    current_count = count_res.scalar() or 0
    next_index = current_count + 1
    new_memory_id = generate_memory_id(memory_type, next_index)

    # 6. Run AI Enrichment Pipeline (NER + Multi-Level Summaries + Quality Scoring)
    enrichment = enrich_research_memory(
        text=doc.raw_text,
        title=doc.title,
        memory_type=memory_type,
        department_hint=department,
        sensitivity_level=sensitivity_level
    )

    entities_payload = enrichment["entities"]
    entities_payload["source_file"] = file_name
    entities_payload["page_count"] = doc.page_count

    category = "Conversational" if memory_type == "MeetingMinutes" else "Document"

    # 7. Create Canonical ResearchMemoryObject with AI Enriched Intelligence
    mem = ResearchMemoryObject(
        memory_id=new_memory_id,
        tenant_id=tenant_id,
        user_id=user_id,
        domain="research_university",
        category=category,
        memory_type=memory_type,
        severity="Info",
        sensitivity_level=sensitivity_level,
        lifecycle_stage="Active",
        tier="short_term",
        title=doc.title,
        raw_text=doc.raw_text,
        sections_json=json.dumps(doc.sections),
        source_system="Upload",
        source_ref_json=json.dumps({
            "capture_id": capture_id,
            "file_name": file_name,
            "file_size": file_size,
            "page_count": doc.page_count
        }),
        derived_summaries_json=json.dumps(enrichment["summaries"]),
        entities_json=json.dumps(entities_payload),
        relations_json=json.dumps([]),
        tags_json=json.dumps(enrichment["tags"]),
        embedding_json=None,
        content_hash=content_hash,
        confidence_score=enrichment["overall_score"],
        needs_review=enrichment["needs_review"],
        review_status=enrichment["review_status"],
        created_at=now,
        updated_at=now
    )
    session.add(mem)

    # 8. Create CaptureJob Record
    job = CaptureJob(
        capture_id=capture_id,
        tenant_id=tenant_id,
        user_id=user_id,
        file_name=file_name,
        file_size_bytes=file_size,
        file_type=doc.file_type,
        content_hash=content_hash,
        source_system="Upload",
        memory_type_hint=memory_type,
        department=department,
        sensitivity_level=sensitivity_level,
        status="completed",
        extracted_title=doc.title,
        page_count=doc.page_count,
        sections_json=json.dumps(doc.sections),
        raw_text=doc.raw_text[:1000],  # preview snippet
        resulting_memory_id=new_memory_id,
        created_at=now,
        completed_at=now
    )
    session.add(job)
    await session.commit()

    # 9. Dynamic Knowledge Graph & Vector Upsert (Session 05)
    sync_info = None
    try:
        from services.graph_sync_service import sync_memory_e2e
        sync_info = await sync_memory_e2e(session, new_memory_id)
        logger.info(f"Dynamic Graph & Vector Sync for {new_memory_id}: {sync_info.get('status')}")
    except Exception as se:
        logger.warning(f"Note on graph/vector sync for {new_memory_id}: {se}")

    return {
        "status": "completed",
        "capture_id": capture_id,
        "memory_id": new_memory_id,
        "file_name": file_name,
        "title": doc.title,
        "memory_type": memory_type,
        "department": department,
        "page_count": doc.page_count,
        "section_count": len(doc.sections),
        "content_length": len(doc.raw_text),
        "overall_score": enrichment["overall_score"],
        "needs_review": enrichment["needs_review"],
        "review_status": enrichment["review_status"],
        "entities": entities_payload,
        "summaries": enrichment["summaries"],
        "created_at": now.isoformat()
    }
