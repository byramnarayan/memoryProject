# MnemoGraph: Enterprise Knowledge Brain — Setup & Execution Guide
## Multi-Domain Multi-Tenant Knowledge Intelligence Platform (Academic Research & Telecom Operations)

This manual contains complete installation, environment configuration, database initialization, credential management, and execution instructions for the **MnemoGraph** multi-tenant platform.

---

## 🏛️ System Overview

MnemoGraph operates as a unified, domain-adaptive **Graph-Augmented Continuous Memory (GACM)** platform serving two enterprise domains with strict property-level multi-tenant isolation (`tenant_id: $tenant_id`):

1. **Academic Institutional Research (`utc_campus`)**:
   - Manages **21,010 nodes & 31,527 relationships** in Neo4j Aura (`:Faculty`, `:Project`, `:Department`, `:Meeting`, `:Sponsor`).
   - Governs $2.42B in research capital awards, faculty grant continuity, single-PI SPOF risks, and IRB compliance protocols.
2. **Telecommunications Enterprise Operations (`novatel_communications`)**:
   - Manages live operational graphs (`:Employee`, `:Department`, `:NetworkSite`, `:NetworkEvent`, `:ServiceTicket`).
   - Correlates Databricks Lakehouse microwave outages against CRM trouble tickets, identifies high-risk cell tower churn hotspots, detects tribal engineering knowledge concentration (>70% SPOF), and powers interactive What-If operational simulations.

---

## 📋 Prerequisites

1. **Python 3.12+** ([python.org](https://www.python.org/downloads/))
2. **`uv` Package Manager** ([astral.sh/uv](https://astral.sh/uv))
   ```powershell
   pip install uv
   ```
3. **Node.js v18.0+** & `npm` ([nodejs.org](https://nodejs.org/))
4. **Neo4j Aura Cloud** instance with Bolt protocol credentials (`neo4j+s://`)
5. **PostgreSQL Database** (Neon Cloud or local instance with SSL support)

---

## 🌐 1. Environment Variables Configuration (`backend/.env`)

Ensure `backend/.env` is configured with valid credentials:

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

# Groq Cloud API Keys (Triple-Key Round-Robin Rotation)
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

## 🚀 2. Database Initialization, Schema & Persona Seeding

Initialize the database schema, apply table migrations, and seed credentials for both academic and enterprise domains:

```powershell
cd backend
uv sync

# 1. Seed Academic Personas & Governance Columns (utc_campus)
uv run python data/seed_roles.py

# 2. Verify Neo4j Multi-Tenant Property Indexes
uv run python -c "from services.graph_sync_service import ensure_graph_indexes; ensure_graph_indexes()"
```

### Pre-Seeded Demonstration Personas:

#### A. Academic Institutional Research (`utc_campus`):
| Persona | Email / NetID | Password | Role | Clearance Level | Department |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Vice Chancellor / Admin** | `admin@utc.edu` *(or `m@m.com`)* | `Admin@123` *(or `12345678`)* | `TenantAdmin` | `HighlyConfidential` | University Administration |
| **CS Department Chair** | `chair.cs@utc.edu` | `DeptChair@123` | `DeptAdmin` | `Confidential` | Computer Science & Engineering |
| **Aerospace Researcher** | `researcher@utc.edu` | `Research@123` | `Researcher` | `Internal` | Mechanical & Aerospace Engineering |
| **Compliance Auditor** | `auditor@utc.edu` | `Audit@123` | `Auditor` | `HighlyConfidential` | Research Integrity & Compliance |

#### B. Telecom Enterprise Operations (`novatel_communications`):
| Persona | Email | Password | Role | Clearance Level | Department |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Lead RF Engineer** | `arjun.nair@novatel_communications.com` | `Emp-6101#Pass` | `DeptAdmin` | `Confidential` | Radio Frequency Engineering |
| **Operations Manager** | `vikram.malhotra@novatel_communications.com` | `Emp-2832!Pass` | `TenantAdmin` | `HighlyConfidential` | Core Network & Infrastructure |
| **Support Lead** | `ananya.roy@novatel_communications.com` | `Emp-0559#Pass` | `DeptAdmin` | `Confidential` | Customer Support & SLA |
| **Field Technician** | `rohan.sharma@novatel_communications.com` | `Emp-8173!Pass` | `Employee` | `Internal` | Field Operations & Microwave |

*(Admins can also view all credential slips in the secure **Credential Vault** under `/employees`).*

---

## 💻 3. Starting the Services

### Start FastAPI Backend:
> **Important Note for Windows Users:** Do not run `uvicorn.exe` directly on Windows due to OS AppLocker restrictions (error 4551). Always execute via the Python module:

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
- Frontend Web Application: **`http://localhost:3000`**

---

## 🗺️ 4. Key Application Routes & Features

| Route | Feature Area | Description |
| :--- | :--- | :--- |
| **`/gacm`** | **Mnemograph Graph Explorer** | Domain-adaptive Cytoscape entity visualizer with hybrid Cypher + 384d vector search. |
| **`/insights`** | **Operational Intelligence & Analytics** | Domain-adaptive analytics: Telecom cell hotspots, SLA exposure, & SPOF matrix for corporate tenants; Research capital portfolio ($2.42B) for university tenants. |
| **`/connectors`** | **Data Source Connectors Hub** | Manage external pipelines: Databricks SQL Lakehouse, upcoming PostgreSQL & CSV connectors, and live Neo4j Aura telemetry metrics. |
| **`/employees`** | **Staff Directory & Credential Vault** | HR-gated credential distribution vault, role-based provisioning modal, and employee hierarchy map. |
| **`/simulator`** | **What-If Decision Simulator** | Quantitative operational scenario modeler (Specialist Departure, Outage Impact, Hardware Capex). |
| **`/kt-handoff`** | **Knowledge Transfer Engine** | Succession handoff creator for retiring/departing specialists to mitigate SPOF risks. |
| **`/logs`** | **Daily Engineering Decision Logs** | Capture tacit field workarounds, firmware bypass notes, and system impact metadata. |
| **`/capture`** | **Document Capture Center** | Drag-and-drop document ingestion (PDF/DOCX/TXT/JSON) with SHA-256 deduplication. |
| **`/review`** | **Review Queue** | Human-in-the-loop curation workspace for records with AI confidence scores <85%. |
| **`/audit`** | **Security & Governance Audit Log** | Immutable ISO 27001 provenance trail, clearance denial inspector, and legal hold manager. |
| **`/login`** | **Authentication Gateway** | Multi-domain login with 1-click persona switcher and company onboarding link. |

---

## 🧪 5. Automated Verification Test Suites

Execute test suites using `uv` to verify end-to-end functionality:

```powershell
cd backend

# 1. Multi-Tenant Graph Synchronization & Real-Time Hooks (Session 16)
uv run python -u tests/test_multi_tenant_graph_sync.py

# 2. Dynamic Industry Ontology Resolver & Graph Algorithms (Session 17)
uv run python -u tests/test_dynamic_ontology_resolver.py

# 3. Automated Staff Extraction & Credential Vault Security (Session 15)
uv run python -u tests/test_staff_auto_provision.py

# 4. What-If Simulator & Cross-Silo Analytics
uv run python -u tests/test_simulator_and_analytics.py

# 5. Knowledge Transfer (KT) Succession Handoff
uv run python -u tests/test_kt_handoff.py

# 6. Sensitivity Clearance ACLs & Legal Holds
uv run python -u tests/test_sensitivity_isolation.py
```
