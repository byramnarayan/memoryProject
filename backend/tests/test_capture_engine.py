import io
import os
import sys
import json
import asyncio
import logging
from pathlib import Path

# Ensure Windows Selector Event Loop for psycopg3
if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

from fastapi.testclient import TestClient
from main import app
from pypdf import PdfWriter
from database import engine, Base

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("test_capture_engine")

def create_synthetic_pdf() -> bytes:
    """Generates an in-memory sample academic grant proposal PDF with headers and sections."""
    # We can create a simple PDF with a few pages using pypdf
    writer = PdfWriter()
    writer.add_blank_page(width=612, height=792)
    
    # We can also populate text stream or metadata
    writer.add_metadata({
        "/Title": "Quantum Sensor Arrays for Sub-Surface Mineral Mapping",
        "/Author": "Dr. Marcus Vance",
        "/Subject": "NSF Geosciences Research Proposal"
    })
    
    buf = io.BytesIO()
    writer.write(buf)
    return buf.getvalue()

def create_synthetic_text_doc(nonce: str = "") -> bytes:
    """Generates academic proposal text document with structured sections."""
    text_content = f"""# Deep Marine Telemetry and Autonomous Robotics for Climate Science

## Abstract
This institutional research project develops decentralized underwater sensor meshes for monitoring ocean acidification and thermal anomalies across the Pacific basin. Supported by NSF and NOAA.
Run Token: {nonce or os.urandom(4).hex()}

## Specific Aims
1. Deploy 50 solar-assisted buoyancy gliders equipped with micro-spectrometers.
2. Formulate low-latency acoustic mesh networks for real-time telemetry transfer.
3. Publish open-source climate dataset archives for interdisciplinary academic research.

## Budget Justification
Total requested direct costs: $850,000 across three years. Includes graduate research assistantships, field deployments, and high-performance computing cluster allocations.

## Expected Deliverables
Comprehensive bathymetric temperature profiles, peer-reviewed publications, and open APIs for oceanographic researchers.
"""
    return text_content.strip().encode("utf-8")

def run_capture_engine_tests():
    print("==================================================================")
    print("MaaS SESSION 02: LIVE MEMORY CAPTURE ENGINE INTEGRATION TESTS")
    print("==================================================================")

    # Initialize tables (including capture_jobs)
    import asyncio
    async def init_tables():
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
    asyncio.run(init_tables())
    print("  -> Initialized all database tables including 'capture_jobs'.")

    client = TestClient(app)

    # 1. Test Ingestion via Upload API (TXT / Markdown grant proposal)
    print("\n[1/6 TESTING DOCUMENT UPLOAD: /api/capture/upload]")
    doc_bytes = create_synthetic_text_doc()
    files = {
        "file": ("marine_robotics_nsf_proposal.txt", doc_bytes, "text/plain")
    }
    data = {
        "department": "Department of Marine Sciences",
        "memory_type": "ResearchProposal",
        "sensitivity_level": "Restricted"
    }

    res = client.post("/api/capture/upload", files=files, data=data)
    print(f"  -> Upload Status Code: {res.status_code}")
    assert res.status_code == 202, f"Expected 202, got {res.status_code}: {res.text}"
    body = res.json()
    capture_id = body.get("capture_id")
    memory_id = body.get("memory_id")
    print(f"  -> Generated Capture ID : {capture_id}")
    print(f"  -> Resulting Memory ID  : {memory_id}")
    print(f"  -> Detected Title       : {body.get('title')}")
    print(f"  -> Section Count        : {body.get('section_count')}")

    assert capture_id.startswith("CAP-"), f"Invalid capture_id: {capture_id}"
    assert memory_id.startswith("MEM-PRP-"), f"Invalid memory_id: {memory_id}"
    assert body.get("section_count", 0) >= 3, "Failed to extract multiple structured sections"

    # 2. Test Duplicate Detection Blocker (CAP-1005)
    print("\n[2/6 TESTING EXACT DUPLICATE BLOCKER: CAP-1005]")
    res_dup = client.post("/api/capture/upload", files=files, data=data)
    print(f"  -> Duplicate Upload Status Code: {res_dup.status_code}")
    assert res_dup.status_code == 409, f"Expected 409 Conflict, got {res_dup.status_code}"
    dup_body = res_dup.json()
    print(f"  -> Duplicate Error Code       : {dup_body.get('error_code')}")
    print(f"  -> Blocked Notification       : {dup_body.get('message')}")
    print(f"  -> Linked Original Memory     : {dup_body.get('existing_memory_id')}")

    assert dup_body.get("error_code") == "CAP-1005"
    assert dup_body.get("existing_memory_id") == memory_id

    # 3. Test Content Length Validation (CAP-1008)
    print("\n[3/6 TESTING SHORT CONTENT REJECTION: CAP-1008]")
    short_files = {
        "file": ("too_short.txt", b"Hi", "text/plain")
    }
    res_short = client.post("/api/capture/upload", files=short_files, data=data)
    print(f"  -> Short Content Status Code: {res_short.status_code}")
    assert res_short.status_code == 422, f"Expected 422, got {res_short.status_code}"
    short_body = res_short.json()
    assert short_body.get("error_code") == "CAP-1008"
    print(f"  -> Rejection Error Code: {short_body.get('error_code')} - {short_body.get('error')}")

    # 4. Test Programmatic JSON Ingestion (/api/capture/json)
    print("\n[4/6 TESTING JSON DIRECT INGESTION: /api/capture/json]")
    json_payload = {
        "title": "Academic Senate Committee on Computational AI Ethics",
        "content": "The Senate meeting convened to discuss institutional policy on generative AI coursework guidelines and IRB approval procedures for autonomous agents.",
        "department": "Academic Senate",
        "memory_type": "MeetingMinutes",
        "sensitivity_level": "Internal",
        "external_id": f"SENATE-2026-{os.urandom(3).hex().upper()}",
        "entities": {"chair": "Dr. Robert Hughes", "quorum": True}
    }
    res_json = client.post("/api/capture/json", json=json_payload)
    print(f"  -> JSON Ingestion Status Code: {res_json.status_code}")
    assert res_json.status_code == 201, f"Expected 201, got {res_json.status_code}"
    json_body = res_json.json()
    json_mem_id = json_body.get("memory_id")
    print(f"  -> Resulting Meeting Memory ID: {json_mem_id}")
    assert json_mem_id.startswith("MEM-MTG-")

    # 5. Test Capture Queue Listing (/api/capture/queue)
    print("\n[5/6 TESTING CAPTURE QUEUE RETRIEVAL: /api/capture/queue]")
    res_queue = client.get("/api/capture/queue?limit=10")
    assert res_queue.status_code == 200
    queue_data = res_queue.json()
    items = queue_data.get("items", [])
    print(f"  -> Total Ingestion Jobs in Queue: {queue_data.get('total')}")
    print(f"  -> Latest 3 Capture Jobs:")
    for j in items[:3]:
        print(f"     * [{j.get('status')}] {j.get('capture_id')} | {j.get('file_name')} ({j.get('memory_type')}) -> Memory: {j.get('resulting_memory_id')}")

    assert len(items) >= 2, "Expected at least 2 jobs in queue"

    # 6. Test Single Job Inspection (/api/capture/{capture_id})
    print(f"\n[6/6 TESTING JOB DETAILS: /api/capture/{capture_id}]")
    res_detail = client.get(f"/api/capture/{capture_id}")
    assert res_detail.status_code == 200
    detail = res_detail.json()
    print(f"  -> Job Status   : {detail.get('status')}")
    print(f"  -> Parsed Title : {detail.get('extracted_title')}")
    print(f"  -> Sections Found:")
    for sec in detail.get("sections", []):
        print(f"     * [{sec.get('name')}] ({len(sec.get('text', ''))} chars)")

    print("\n==================================================================")
    print("SUCCESS: Session 02 Live Capture Engine Tests All Passed!")
    print("==================================================================")

if __name__ == "__main__":
    run_capture_engine_tests()
