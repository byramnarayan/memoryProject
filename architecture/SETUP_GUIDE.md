# Institutional Memory as a Service (MaaS) — Setup & Execution Guide
## Tier-1 Research University Knowledge Intelligence & Curation Platform

This guide contains the complete installation, environment configuration, database setup, and execution manual for the University Institutional Memory as a Service (MaaS) platform.

---

## 🏛️ System Overview

The platform transforms unstructured university research documents (PDF grant awards, DOCX proposals, IRB protocols, research meeting minutes) into a governed, queryable **Canonical Research Memory Object** store with:

- **PostgreSQL (Neon Cloud)**: 29-column canonical schema holding 17,990+ synchronized institutional memory records, full-text embeddings, and immutable audit logs.
- **Neo4j Aura Cloud**: Property graph modeling academic entity relationships: `(:Faculty)-[:LEADS]->(:Project)-[:AFFILIATED_WITH]->(:Department)` and `(:Project)-[:FUNDED_BY]->(:SponsorAgency)`.
- **Groq Cloud AI Engine**: Llama-3-powered University NER, quality confidence scoring (0–100), and 3-tier summarization with triple-key rotation.
- **Enterprise Governance (RBAC & ACLs)**: 5-level sensitivity clearance ladder (`Public`, `Internal`, `Restricted`, `Confidential`, `HighlyConfidential`), department-scoped curation, and CAP-7001 Legal Hold tamper blocker.
- **Research Analytics & ReportLab Dossier Export**: Portfolio capital analytics ($2.4B+), Single-Point-of-Failure (SPOF) risk matrix, and downloadable official CSV & PDF research dossiers.

---

## 📋 Prerequisites

1. **Python 3.12+** ([python.org](https://www.python.org/downloads/))
2. **`uv` Package Manager** ([astral.sh/uv](https://astral.sh/uv))
   ```powershell
   pip install uv
   ```
3. **Node.js v18.0+** & `npm` ([nodejs.org](https://nodejs.org/))

---

## 🌐 1. Environment Variables Configuration (`backend/.env`)

Ensure `backend/.env` is configured with valid cloud connection strings:

```env
# Neon Cloud PostgreSQL (Async Psycopg Driver)
DATABASE_URL=postgresql+psycopg://neondb_owner:YOUR_NEON_PASSWORD@ep-aged-poetry-azcrc8u8-pooler.c-3.ap-southeast-1.aws.neon.tech/neondb?sslmode=require

# Neo4j Aura Cloud Knowledge Graph
NEO4J_URI=neo4j+s://9411bb5a.databases.neo4j.io
NEO4J_USERNAME=9411bb5a
NEO4J_PASSWORD=YOUR_NEOAURA_PASSWORD

# Qdrant Cloud Vector Database
QDRANT_URL=https://c7595ec1-f7ae-4509-bc60-0f34b50a2e16.ca-central-1-0.aws.cloud.qdrant.io
QDRANT_API_KEY=YOUR_QDRANT_KEY

# Groq Cloud API Keys (Automatic Round-Robin Rotation)
GROQ_API_KEY_1=gsk_YOUR_KEY_1
GROQ_API_KEY_2=gsk_YOUR_KEY_2
GROQ_API_KEY_3=gsk_YOUR_KEY_3
GROQ_MODEL=llama-3.3-70b-versatile

# Google ADK Agent Key
GOOGLE_API_KEY=YOUR_GOOGLE_API_KEY

# Security & JWT Tokens
SECRET_KEY=941fa904a622a59a97bc876e5d8bcf517d690a618e775a9ee9c1e7a6ed7bc7a1
ALGORITHM=HS256
```

---

## 🚀 2. Database Initialization & Role Seeding

Run the seed script to create required tables and populate the 4 institutional demo personas:

```powershell
cd backend
uv sync
uv run python data/seed_roles.py
```

### Institutional Demo Personas:

| Persona | Email / NetID | Password | Role | Clearance Level | Department Scope |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Vice Chancellor / Admin** | `admin@utc.edu` | `Admin@123` | `TenantAdmin` | `HighlyConfidential` (5) | University Administration |
| **CS Department Chair** | `chair.cs@utc.edu` | `DeptChair@123` | `DeptAdmin` | `Confidential` (4) | Computer Science & Engineering |
| **Aerospace Researcher** | `researcher@utc.edu` | `Research@123` | `Researcher` | `Internal` (2) | Mechanical & Aerospace Engineering |
| **Compliance Auditor** | `auditor@utc.edu` | `Audit@123` | `Auditor` | `HighlyConfidential` (5) | Research Integrity & Compliance |

*(Note: Users can also 1-click login directly from the frontend `/login` page using the interactive persona switcher!)*

---

## 💻 3. Starting the Application

### Start FastAPI Backend:
> **Important Note for Windows Users:** Do not run `uvicorn.exe` directly on Windows due to OS AppLocker restrictions (error 4551). Always execute via Python module:

```powershell
cd backend
uv run python -m uvicorn main:app --reload --port 8000
```
- Backend REST API: **`http://localhost:8000`**
- Interactive OpenAPI Docs: **`http://localhost:8000/docs`**

### Start Next.js Frontend:
```powershell
cd frontend
npm install
npm run dev
```
- Frontend Application: **`http://localhost:3000`**

---

## 🗺️ 4. Key Platform Features & URLs

| Route | Feature Area | Description |
| :--- | :--- | :--- |
| **`/gacm`** | **Graph Explorer** | Interactive Cytoscape entity graph and hybrid Cypher + 384d vector search. |
| **`/capture`** | **Capture Center** | Drag-and-drop ingestion of PDF/DOCX/TXT/JSON research documents with duplicate blocker. |
| **`/review`** | **Review Queue** | Human-in-the-loop curation workspace for low-confidence grants with split-pane editor. |
| **`/audit`** | **Audit Trail** | Immutable ISO 27001 provenance log, security denial inspector, and legal hold manager. |
| **`/insights`** | **Research Analytics** | Portfolio capital distribution, SPOF continuity risk matrix, and CSV/PDF dossier export. |
| **`/login`** | **SSO Gateway** | 1-Click institutional demo role switcher with real-time clearance badges. |

---

## 🧪 5. Automated Verification Test Suites

Run any of the comprehensive automated integration test suites:

```powershell
cd backend

# Test Session 04: AI Extraction, University NER & Quality Scoring
uv run python -u tests/test_enrichment_worker.py

# Test Session 06: Memory Review Queue & Curation Workspace
uv run python -u tests/test_memory_review.py

# Test Session 07: Sensitivity ACLs, Clearance Isolation & Audit Logs
uv run python -u tests/test_sensitivity_isolation.py

# Test Session 08: Research Analytics, SPOF Matrix & PDF/CSV Dossier Exports
uv run python -u tests/test_insights.py

# Test Session 09: Full End-to-End Flow & Latency Benchmark Suite
uv run python -u tests/test_e2e_flow.py
```
