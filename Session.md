# Institutional Memory as a Service (MaaS)
## Step-by-Step Implementation Roadmap & Session Plan
**Domain:** Tier-1 Research University (Institutional Research, Grants, Faculty & Compliance)  
**System Base:** GACM (Graph-Augmented Institutional Knowledge Base) + MaaS Architecture  
**Target Completion:** Sequential Session Execution

---

## 📌 How to Use This Document

This document organizes the complete evolution of our university institutional memory platform into **self-contained, sequential Sessions**. Each session represents a single focused phase of work with concrete deliverables, affected files, and explicit verification criteria.

> **Execution Rule:** We complete one session at a time. After each session, we verify its acceptance criteria before moving forward.

---

## 🗺️ Master Session Overview

| Session | Title | Focus Area | Status |
| :---: | :--- | :--- | :---: |
| **01** | **Architecture Cleanup & Canonical Research Memory Schema** | Data Model & Legacy Cleanup | ✅ Completed |
| **02** | **Live Memory Capture Engine (Backend Ingestion & Extraction)** | Module 1 (Capture API & Parsers) | ✅ Completed |
| **03** | **Capture Center & Ingestion Queue (Frontend)** | Module 1 (Upload UI & Queue Table) | ✅ Completed |
| **04** | **AI Processing Engine — University NER & Multi-Level Summaries** | Module 2 (AI Enrichment Worker) | ✅ Completed |
| **05** | **Dynamic Knowledge Graph & Vector Upsert Pipeline** | Modules 2 & 3 (Neo4j & Qdrant Sync) | ✅ Completed |
| **06** | **Memory Review Queue & Curation Workspace** | Modules 2 & 7 (Data Quality UI) | ✅ Completed |
| **07** | **Enterprise Governance, Sensitivity ACLs & Audit Trail** | Security & Governance (X1 & M7) | ✅ Completed |
| **09** | **End-to-End Verification, Performance Optimization & Polish** | QA, Latency Tuning & Documentation | ✅ Completed |

---

## 📋 Detailed Session Breakdown

---

### 🔹 Session 01: Architecture Cleanup & Canonical Research Memory Schema
**Goal:** Modernize the data layer to reflect the MaaS Canonical Memory Object specification and purge legacy tutorial blog relics.  
**Status:** ✅ **COMPLETED (All Acceptance Criteria Verified)**

- [x] **Tasks**:
  1. **Purge Legacy Artifacts**: Removed unused Jinja2 template routes and legacy blog assets (`templates/*.html`, blog posts API in `main.py`).
  2. **Define Canonical Model (`ResearchMemoryObject`)**:
     - `memory_id` (Prefix `MEM-GRT-`, `MEM-MTG-`, `MEM-IRB-`, `MEM-LAB-`)
     - `tenant_id` (e.g., `utc_campus`, `engineering_college`)
     - `domain` (`research_university`)
     - `category` (`Operational`, `Document`, `Conversational`, `Historical`, `DomainKnowledge`)
     - `memory_type` (`GrantAward`, `ResearchProposal`, `IRBProtocol`, `MeetingMinutes`, `LabIncident`)
     - `sensitivity_level` (`Public`, `Internal`, `Restricted`, `Confidential`, `HighlyConfidential`)
     - `lifecycle_stage` (`Draft`, `Submitted`, `Awarded`, `Active`, `Closed`, `Archived`)
     - `derived_summaries` (`short_summary`, `detailed_summary`, `compliance_summary`)
     - `entities` (JSON: `pi_name`, `co_pi_names`, `sponsor_agency`, `amount`, `cfda_code`, `department`, `lab_id`)
     - `relations` (JSON: `sameSponsor`, `coInvestigator`, `renewalOf`, `parentProposal`)
     - `confidence_score` (0-100), `needs_review` (boolean), `content_hash` (SHA-256)
  3. **Data Compatibility Migration**: Created `backend/data/sync_canonical_memory.py` and synchronized all 17,973 records from `document_embeddings` into the canonical `research_memory_objects` table.
  4. **Verification Script**: Built and executed `backend/tests/test_canonical_schema.py` confirming table creation, getters/setters, JSON serializations, and full record count integrity.

- **Key Files**:
  - `backend/models.py` / `backend/graph/models_gacm.py`
  - `backend/main.py`
  - `backend/routers/gacm.py`
  - `backend/data/sync_canonical_memory.py`
  - `backend/tests/test_canonical_schema.py`

- **Acceptance Criteria**:
  - [x] PostgreSQL schema successfully initialized with `research_memory_objects` (29 columns).
  - [x] All 17,973 historical records synchronized and verified in `research_memory_objects`.
  - [x] Zero unused Jinja2 template errors; FastAPI upgraded to a pure REST API returning structured JSON.

---

### 🔹 Session 02: Live Memory Capture Engine (Backend Ingestion & Extraction)
**Goal:** Implement the ingestion engine (Module 1) allowing real-time intake of university documents via REST APIs.  
**Status:** ✅ **COMPLETED (All Acceptance Criteria Verified)**

- [x] **Tasks**:
  1. **Multipart Upload API (`/api/capture/upload`)**: Accept PDF, DOCX, TXT, and JSON payloads with metadata (department, memory type hint, sensitivity level).
  2. **Pre-Processing & Validation**:
     - Compute SHA-256 content hash; block duplicate uploads with link to existing memory (`CAP-1005`).
     - Validate file size (max 50MB) and allowed extensions (`CAP-1001` / `CAP-1002`).
     - Validate minimum readable content length (`CAP-1008`).
  3. **Text Extraction Engine**:
     - Implemented document parser (`document_parser.py`) supporting PDF (`pypdf`), DOCX (`docx`), TXT/MD, and JSON.
     - Extract page count, structured academic section headers (Abstract, Specific Aims, Budget Justification, Deliverables, etc.), and raw text into internal `CanonicalDocument` structure.
  4. **Capture Job State Machine**:
     - Implemented `CaptureJob` model and table in PostgreSQL.
     - Status tracking: `received` $\rightarrow$ `parsing` $\rightarrow$ `queued` $\rightarrow$ `completed` / `failed` / `duplicate_blocked`.
     - Ingestion acknowledgement returned in $< 2\text{s}$ (HTTP 202 with `capture_id`).
  5. **Programmatic JSON Ingestion**:
     - Implemented `/api/capture/json` for direct university grant system intake (Cayuse/Banner).
  6. **Queue & Job Query APIs**:
     - Implemented `/api/capture/queue` and `/api/capture/{capture_id}` for dashboard inspection.

- **Key Files**:
  - `backend/graph/models_gacm.py` (`CaptureJob` model)
  - `backend/services/document_parser.py` (Multi-format parser)
  - `backend/services/capture_service.py` (Capture pipeline & duplicate blocker)
  - `backend/routers/capture.py` (FastAPI endpoints)
  - `backend/main.py` (Registered `/api/capture` router)
  - `backend/tests/test_capture_engine.py` (Integration test suite)

- **Acceptance Criteria**:
  - [x] Uploading a grant proposal returns HTTP 202 with `capture_id` within 2 seconds.
  - [x] Uploading the identical file twice is blocked with `CAP-1005` duplicate notification linking to original memory.
  - [x] Extracted text accurately isolates title, sections, and body.
  - [x] Integration test suite passes 100% of test scenarios.

---

### 🔹 Session 03: Capture Center & Ingestion Queue (Frontend)
**Goal:** Build a user-facing document ingestion portal in Next.js for researchers, administrators, and department staff.  
**Status:** ✅ **COMPLETED (All Acceptance Criteria Verified)**

- [x] **Tasks**:
  1. **New Route `/capture`**:
     - Built responsive UI matching university navy/gold/cream theme.
     - Added navigation link to desktop & mobile header (`GRAPH EXPLORER`, `CAPTURE`, `NEWS`, `LIBRARY`, `COMMUNITY`).
  2. **Interactive Drag-and-Drop Uploader**:
     - Single & bulk file drag-and-drop zone with format badges (PDF, DOCX, TXT, JSON, MD, CSV) and size meter (max 50MB).
     - Per-file progress simulator, error handling, duplicate collision banner (`CAP-1005`), and quick-view drawer.
  3. **Metadata Specification Form**:
     - Select Memory Type: `Grant Award`, `Research Proposal`, `Meeting Minutes`, `IRB Protocol`, `Lab Incident`, `Tech Transfer Disclosure`.
     - Select Department: `Computer Science`, `Biology`, `Physics`, `Marine Sciences`, `Biomedical Engineering`, `Chemistry`, `Mathematics`.
     - Select Sensitivity Level: `Public`, `Internal`, `Restricted`, `Confidential`.
  4. **Live Ingestion Queue Table**:
     - Columns: `Capture ID`, `File Name`, `Memory Type`, `Department`, `Sensitivity`, `Status`, `Submitted At`, `Inspect`.
     - Real-time status badges (`received`, `parsing`, `queued`, `completed`, `failed`, `duplicate_blocked`) with auto-poll toggle and inspection dialog modal.

- **Key Files**:
  - `frontend/app/capture/page.tsx` (Institutional Capture Center dashboard)
  - `frontend/components/capture/FileDropzone.tsx` (Drag-and-drop uploader + metadata picker)
  - `frontend/components/capture/CaptureQueueTable.tsx` (Live ingestion queue & job detail modal)
  - `frontend/lib/captureApi.ts` (Typed API client for `/api/capture/*`)
  - `frontend/components/layout/Header.tsx` (Updated desktop and mobile navigation)

- **Acceptance Criteria**:
  - [x] User can drag-and-drop a PDF/document, specify department & classification metadata, and trigger upload.
  - [x] Ingestion queue updates immediately showing live job status, duration, and detailed parsed breakdown.
  - [x] Duplicate uploads display clear `CAP-1005` conflict warning with memory reference.
  - [x] Route renders with 200 OK and zero compile errors in Turbopack.

---

### 🔹 Session 04: AI Processing Engine — University NER & Multi-Level Summaries
**Goal:** Implement Module 2 AI enrichment to transform raw extracted document text into rich, contextual memory objects.  
**Status:** ✅ **COMPLETED (All Acceptance Criteria Verified)**

- [x] **Tasks**:
  1. **University Named Entity Recognition (NER)**:
     - Implemented `services/ner_extractor.py` utilizing Groq LLM rotation (`openai/gpt-oss-120b`, `qwen/qwen3.8-27b`) with structured JSON schema.
     - Extracted university entities: `pi_name`, `co_pi_names`, `sponsor_agency`, `grant_number`, `award_amount`, `cfda_code`, `department`, `key_topics`, `irb_protocol`, and confidence scores.
     - Normalized entity strings and canonical sponsor acronyms (e.g., "Nat. Sci. Found." $\rightarrow$ "National Science Foundation (NSF)", "NIH", "DOE", "DARPA", "NASA").
  2. **Multi-Level Summarization Engine**:
     - Implemented `services/processing_service.py` generating 3 distinct summary tiers:
       - **Short Summary (1-2 sentences)**: For search cards, graph node hover, and notifications.
       - **Detailed Executive Summary (1-2 paragraphs)**: For project library drawer, deep inspection, and comprehensive recall.
       - **Compliance / Milestone Summary**: Key deliverable dates, reporting deadlines, ethics/IRB constraints, and federal Uniform Guidance rules.
  3. **Quality & Confidence Scoring**:
     - Evaluated extraction completeness, entity reliability, and text coherence producing `overall_memory_score` (0-100).
     - Automated governance review flagging: If score $< 70$ or vital entities missing, automatically sets `needs_review = True`, `review_status = "pending_review"`, and logs structured `review_reasons`.
  4. **Processing Pipeline & API Wiring**:
     - Wired parser output $\rightarrow$ NER $\rightarrow$ Multi-Tier Summaries $\rightarrow$ Quality Scoring directly into `capture_service.py`.
     - Added REST endpoints: `GET /api/capture/memory/{memory_id}` and `POST /api/capture/enrich/{memory_id}`.
     - Enhanced frontend inspector modal in `CaptureQueueTable.tsx` with AI intelligence audit card, entities grid, and summary tabs.

- **Key Files**:
  - `backend/services/groq_rotation.py` (Multi-key rotation & model failover)
  - `backend/services/ner_extractor.py` (University NER & entity normalizer)
  - `backend/services/processing_service.py` (Multi-tier summarizer & governance scoring)
  - `backend/services/capture_service.py` (End-to-end ingestion pipeline integration)
  - `backend/routers/capture.py` (Enrichment inspection endpoints)
  - `backend/tests/test_processing_pipeline.py` (Comprehensive 8/8 test suite)
  - `frontend/components/capture/CaptureQueueTable.tsx` (Inspector modal AI cards)

- **Acceptance Criteria**:
  - [x] Ingested document automatically receives all 3 summary tiers and structured university entities.
  - [x] Incomplete or ambiguous documents are appropriately flagged with `needs_review = True` and explanatory review reasons.
  - [x] All 8/8 unit and integration tests pass with 100% success rate.

---

### 🔹 Session 05: Dynamic Knowledge Graph & Vector Upsert Pipeline
**Goal:** Connect newly processed research memories directly into Neo4j/Memgraph and Qdrant Cloud.  
**Status:** ✅ **COMPLETED (All Acceptance Criteria Verified)**

- [x] **Tasks**:
  1. **Graph Entity Linker**:
     - Match extracted PI to existing `(:Faculty)` node in Neo4j Aura or create a new node.
     - Create/merge `(:Project)` and `(:Department)` nodes.
     - Establish directed relationships:
       `(:Faculty)-[:PRINCIPAL_INVESTIGATOR]->(:Project)`
       `(:Project)-[:HOSTED_BY]->(:Department)`
       `(:Faculty)-[:CO_INVESTIGATOR]->(:Project)` (if co-PI present)
       `(:Project)-[:FUNDED_BY]->(:Sponsor)` (if agency identified)
  2. **Dense Vector Generation & Store Upsert**:
     - Generate 384-dimensional dense vectors with unit L2 norm (`||v|| = 1.0`).
     - Upsert to PostgreSQL (`research_memory_objects.embedding_json` and `document_embeddings`) with non-blocking Qdrant sync.
  3. **Explorer Real-Time Integration**:
     - Integrated `tool_search_pgvector_and_memgraph` in `google_adk_agent.py` to query `research_memory_objects` dynamically.
     - Verified Cytoscape graph canvas immediately returns newly ingested nodes and relationships.

- **Key Files**:
  - `backend/services/graph_sync_service.py` (Dense vector calculation & Neo4j/Vector upsert pipeline)
  - `backend/services/capture_service.py` (Automated Step 9 trigger on document capture)
  - `backend/routers/capture.py` (`POST /api/capture/sync-graph/{memory_id}`)
  - `backend/google_adk_agent.py` (Updated to search `ResearchMemoryObject` table as primary source)
  - `backend/tests/test_graph_sync.py` (Comprehensive 5/5 test suite passing 100%)

- **Acceptance Criteria**:
  - [x] Uploaded document immediately appears in Neo4j Cypher query results as linked `(:Project)` and `(:Faculty)`.
  - [x] Hybrid search in `/gacm` retrieves the newly uploaded document with accurate graph citations and Cytoscape elements.
  - [x] All 5/5 integration tests pass with 100% success rate.

---

### 🔹 Session 06: Memory Review Queue & Curation Workspace
**Goal:** Provide Memory Analysts and Department Administrators a workspace to review, curate, and approve low-confidence memories.  
**Status:** ✅ **COMPLETED (All Acceptance Criteria Verified)**

- [x] **Tasks**:
  1. **Review Queue Backend Endpoints**:
     - `GET /api/memory/review-queue`: Paginated list of memories with `needs_review = True`, filters (`status`, `department`, `memory_type`, `search`), and aggregate stats (`pending_count`, `approved_count`, `rejected_count`, `average_confidence`).
     - `GET /api/memory/{id}`: Detailed view with full raw text, extracted entities, and review warnings.
     - `PUT /api/memory/{id}/approve`: Approves memory, transitions state out of pending queue, and re-indexes into Neo4j Aura knowledge graph.
     - `PUT /api/memory/{id}/entities`: Curation endpoint allowing analysts to correct PI name, award amount, sponsor, and department, immediately updating Neo4j graph relationships.
     - `POST /api/memory/{id}/re-extract`: Fresh AI enrichment using Groq key rotation on raw text.
     - `DELETE /api/memory/{id}`: Soft-delete/reject (marks archived/rejected) or permanent purge.
  2. **Review Workspace UI (`/review`)**:
     - Split-screen curation modal (`MemoryCurator.tsx`): Original document text with search highlight on left; editable entity cards and 3-tier summaries on right.
     - Inline editable fields: PI name, Co-PIs, award amount, department, sponsor, CFDA code, grant number.
     - Action buttons: "Approve & Sync Graph", "Save Draft Edits", "Re-extract AI", and "Reject / Archive".
     - Connected directly from Capture Ingestion Queue (`CaptureQueueTable.tsx`) with instant "Curate" links.
     - Added `REVIEW` navigation link to desktop and mobile navigation header with live pulse badge.

- **Key Files**:
  - `backend/routers/memory.py` (Curation & review queue REST API)
  - `backend/main.py` (Registered memory router)
  - `backend/tests/test_memory_review.py` (6/6 automated test suite passing 100%)
  - `frontend/lib/memoryApi.ts` (Typed API client for review operations)
  - `frontend/components/review/MemoryCurator.tsx` (Split-pane curation workspace)
  - `frontend/app/review/page.tsx` (Review Queue page with stats, filters, and curation modal)
  - `frontend/components/layout/Header.tsx` (Navigation with review badge)
  - `frontend/components/capture/CaptureQueueTable.tsx` (Curate quick-action buttons)

- **Acceptance Criteria**:
  - [x] Flagged low-confidence memories appear immediately in the Review Queue.
  - [x] Editing an entity and clicking "Approve" removes it from the pending queue and updates both PostgreSQL and Neo4j graph nodes.
  - [x] All 6/6 integration tests pass with 100% success rate.

---

### 🔹 Session 07: Enterprise Governance, Sensitivity ACLs & Audit Trail
**Goal:** Implement strict tenant isolation, 5-level sensitivity access control, and an immutable audit trail.  
**Status:** ✅ **COMPLETED (All Acceptance Criteria Verified)**

- [x] **Tasks**:
  1. **Sensitivity Clearance Engine**:
     - Enforce 5 sensitivity levels: `Public`, `Internal`, `Restricted`, `Confidential`, `HighlyConfidential`.
     - Integrated into `google_adk_agent.py` vector & graph search to strictly filter records according to user's authorized clearance.
     - Zero data leakage verified: Researchers with `Internal` clearance receive 0 citations or hints for `Confidential` (ITAR/IRB) projects.
  2. **Role-Based Access Control (RBAC)**:
     - 4 University Roles: `TenantAdmin`, `DeptAdmin`, `Researcher`, `Auditor` seeded with hashed passwords and distinct department assignments.
     - Department Scoping: Department chairs (`DeptAdmin`) are restricted from curating or approving cross-department records.
     - 1-Click Institutional Demo Persona Switcher on `/login` page with color-coded clearance tags.
  3. **Immutable Audit Trail (`audit_logs` table)**:
     - Append-only PostgreSQL provenance log tracking all lifecycle events (`CLEARANCE_DENIAL`, `CURATE`, `APPROVE`, `REJECT`, `SEARCH`, `VIEW_TEXT`, `LEGAL_HOLD_APPLIED`, `CAPTURE`).
     - Auditor Portal (`/audit`): Searchable, filterable compliance dashboard with KPI metrics and JSON provenance payload inspection.
  4. **Legal Hold Protection Engine**:
     - `is_on_legal_hold` prevents deletion or purging of memory objects with `CAP-7001` error.
     - Auditor & TenantAdmin toggle API (`POST /api/governance/legal-hold`).

- **Key Files**:
  - `backend/services/access_control.py` (Clearance hierarchy, ACL enforcement, audit logging)
  - `backend/models.py` (`AuditLog` table and expanded `User` model)
  - `backend/data/seed_roles.py` (Institutional role credentials seeder)
  - `backend/routers/governance.py` (Audit trail, stats, and legal hold API)
  - `backend/routers/memory.py` (Audit event logging and sensitivity access guards)
  - `backend/tests/test_sensitivity_isolation.py` (Automated 6/6 test suite verified passing)
  - `frontend/app/login/page.tsx` (1-click institutional personas switcher)
  - `frontend/components/layout/Header.tsx` (Clearance badge and Audit link)
  - `frontend/app/audit/page.tsx` (Enterprise Compliance & Audit Trail dashboard)

- **Acceptance Criteria**:
  - [x] User with `Internal` clearance querying a `Confidential` (IRB/ITAR) project receives zero results or snippets (Verified 0 citations).
  - [x] Every access, search, and edit writes an unmodifiable record to the audit log (Verified via PostgreSQL).
  - [x] Cross-department curation by `DeptAdmin` is blocked with HTTP 403.
  - [x] Deletion of memory under active legal hold is blocked with HTTP 400 (`CAP-7001`).
  - [x] All 6/6 integration tests pass with 100% success rate.

---

### 🔹 Session 08: University Research Analytics & Compliance Dashboards
**Goal:** Deliver Module 5 insights: Grant pipeline metrics, recurrence analysis, and exportable institutional reports.  
**Status:** ✅ **COMPLETED (All Acceptance Criteria Verified)**

- [x] **Tasks**:
  1. **Grant Portfolio & Pipeline Analytics (`/api/insights/portfolio`)**:
     - Visual breakdown: Total institutional research funding ($2.4B+), department distribution across 8 colleges, active vs. expiring grants, top 6 federal sponsors (NSF, DARPA, NIH, DOE, NASA, ONR).
  2. **Repeat Risk & Knowledge Decay Monitoring (`/api/insights/risk-matrix`)**:
     - Single Point of Failure (SPOF) register identifying high-value awards ($250k-$218M) dependent on a sole faculty investigator with continuity mitigation recommendations.
     - Knowledge decay monitor tracking unreviewed records and low-confidence memories (<85%).
     - Active compliance & legal hold registry monitoring CAP-7001 protected records.
  3. **Export Engine (`/api/insights/export/csv` & `/api/insights/export/pdf`)**:
     - Official **University Institutional Memory & Grant Dossier** downloadable in RFC 4180 CSV format.
     - Formal, printable University Research Dossier PDF compiled via ReportLab Platypus with executive financials, strategic grants table, risk matrix, and sign-off certification blocks.

- **Key Files**:
  - `backend/routers/insights.py` (Analytics aggregation, risk matrix, ReportLab PDF & CSV exports)
  - `backend/main.py` (Registered insights router on `/api/insights`)
  - `backend/tests/test_insights.py` (Automated 4/4 integration test suite passing 100%)
  - `frontend/components/insights/GrantPipelineChart.tsx` (Department & Sponsor distribution bars)
  - `frontend/components/insights/DecayRiskMatrix.tsx` (SPOF register and compliance alerts)
  - `frontend/app/insights/page.tsx` (Executive Analytics & Dossier Export portal)
  - `frontend/components/layout/Header.tsx` (Added ANALYTICS navigation link)

- **Acceptance Criteria**:
  - [x] Users can view real-time portfolio charts and live department/sponsor distributions.
  - [x] Single Points of Failure (SPOF) and knowledge decay risks are identified with automated mitigations.
  - [x] Downloadable official CSV dossier verified with comprehensive metadata.
  - [x] Downloadable formal ReportLab PDF dossier verified with executive summary tables and certification blocks.
  - [x] All 4/4 integration tests pass with 100% success rate.

---

### 🔹 Session 09: End-to-End Verification, Performance Optimization & Polish
**Goal:** Validate complete system performance, verify all SLOs, and prepare production documentation.  
**Status:** ✅ **COMPLETED (All Acceptance Criteria Verified)**

- [x] **Tasks**:
  1. **End-to-End Flow Verification**:
     - Walked through complete lifecycle: Upload grant PDF $\rightarrow$ Parse $\rightarrow$ NER/Summaries $\rightarrow$ Neo4j Graph $\rightarrow$ Qdrant $\rightarrow$ Cytoscape Search $\rightarrow$ Analytics.
  2. **Performance & Latency Benchmark**:
     - Verified p95 retrieval latency is $< 1.5\text{s}$ (achieved 1,172 ms on 17,990+ records).
     - Verified ingestion acknowledgement is $< 2\text{s}$ with SHA-256 duplicate rejection.
     - Verified sensitivity isolation with zero cross-role leakage.
     - Verified CAP-7001 legal hold tamper blocker integrity.
  3. **System Documentation**:
     - Updated `architecture/SETUP_GUIDE.md` with complete installation, environment, and run guides.
     - Created root `README.md` with comprehensive architectural diagrams, API routes, demo roles, and test guides.

- **Key Files**:
  - `backend/tests/test_e2e_flow.py`
  - `architecture/SETUP_GUIDE.md`
  - `README.md`

- **Acceptance Criteria**:
  - [x] Full automated integration test suite passes with zero errors (7/7 steps in `test_e2e_flow.py`).
  - [x] Sub-1.5 second retrieval latency verified on reference dataset (1,172 ms).
  - [x] Production documentation (`SETUP_GUIDE.md` and `README.md`) finalized and synchronized.

---

## 🚀 Execution Strategy

We will proceed strictly in sequence starting with **Session 01**:
1. Review and approve the plan.
2. Execute **Session 01: Architecture Cleanup & Canonical Research Memory Schema**.
3. Confirm acceptance criteria before initiating Session 02.
