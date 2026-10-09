# Enterprise Company Brain (Phase 4)
## Universal Multi-Tenant Connectors, PostgreSQL/CSV Ingestion Pipelines & Domain Decoupling

**Domain:** Multi-Domain Enterprise Knowledge Engine (Academic Research, Telecom Enterprise, Corporate Operations)  
**Core Objective:** Decouple all hardcoded seeders and establish a plug-and-play **Universal Connector Framework** featuring a native **PostgreSQL Connector** and a high-throughput **CSV File Connector**, with dynamic schema mapping, strict multi-tenant property partitioning (`tenant_id: $tenant_id`), and domain-specific What-If simulation.

---

## 📌 Master Implementation Roadmap (Phase 4)

| Session | Title | Focus Area | Status |
| :---: | :--- | :--- | :---: |
| **19** | **Universal Connector Hub Architecture & PostgreSQL Engine** | Connection pooling, schema introspection, table selection & entity mapping | 📋 Planned |
| **20** | **High-Throughput CSV / Flat-File Ingestion Pipeline** | Drag-and-drop upload, automatic header parsing, streaming batch ingestion to Neo4j | 📋 Planned |
| **21** | **University Research Decoupling & PostgreSQL/CSV Migration** | Retiring Phase 1 hardcoded seeds; re-ingesting academic datasets via generic connectors | 📋 Planned |
| **22** | **Domain-Adaptive What-If Simulation Engine** | Dynamic operational scenarios (PI departure & grant budget cuts for Uni; cell outage for Telco) | 📋 Planned |
| **23** | **End-to-End Multi-Connector Lifecycle Verification & Benchmarking** | High-volume ingestion verification (thousands of rows), zero-leakage isolation audit | 📋 Planned |

---

## 📋 Detailed Session Breakdown

---

### 🔹 Session 19: Universal Connector Hub Architecture & PostgreSQL Engine
**Goal:** Replace the single-tenant Databricks view with an extensible **Multi-Connector Catalog** and implement a production-grade PostgreSQL connector that allows tenants to point to any SQL database, introspect tables, and map rows into Canonical Memories & Neo4j graph nodes.

- **Tasks**:
  1. **Connector Catalog Schema & Model**:
     - Generalize `models.ConnectorConfig` to support multiple connector types per tenant: `POSTGRESQL`, `CSV`, `DATABRICKS`, `REST_API`.
     - Store connection credentials (Host, Port, Database, User, Password, SSL mode) securely with AES-256 vault encryption.
  2. **PostgreSQL Introspection Engine (`backend/connectors/postgres_connector.py`)**:
     - Test connection asynchronously using `asyncpg` / `psycopg`.
     - Introspect catalog: Schemas (`public`, `research`, `operations`), Tables, Views, Column names, Data types, and Primary/Foreign Key constraints.
  3. **Visual Field & Entity Mapper**:
     - Allow the user to map SQL tables to Graph Ontologies:
       - Table `research_grants` ➔ Node `:Project` (properties: `grant_id`, `title`, `amount`, `status`)
       - Table `faculty_members` ➔ Node `:Faculty` (properties: `faculty_id`, `name`, `department`)
       - Foreign Key `faculty_id` ➔ Relationship `(:Faculty)-[:PRINCIPAL_INVESTIGATOR]->(:Project)`
  4. **Automated Ingestion Worker**:
     - Stream records in chunked batches (e.g. 500 rows per batch) with duplicate detection via SHA-256 content hashes.
     - Automatically stamp `tenant_id: current_user.tenant_id` on every node and edge created in Neo4j.

- **Key Files**:
  - `backend/connectors/postgres_connector.py`
  - `backend/routers/connectors.py` (Add `/postgres/test`, `/postgres/introspect`, `/postgres/sync`)
  - `frontend/app/connectors/page.tsx` (Add Connector Selection Catalog & PostgreSQL Config Modal)

---

### 🔹 Session 20: High-Throughput CSV / Flat-File Ingestion Pipeline
**Goal:** Enable tenants to upload raw CSV or TSV files (e.g. 5,000+ row network event logs, 3,500 customer tickets, or NSF research grants datasets) with drag-and-drop, automated header mapping, type inference, and streaming ingestion.

- **Tasks**:
  1. **Chunked File Upload Endpoint**:
     - Implement `POST /api/connectors/csv/upload` with support for large CSVs (up to 50MB) and multi-file batch uploads.
  2. **Automated Column & Entity Schema Inferencing**:
     - Detect header names, delimiters (comma, semicolon, tab), and infer column types (String, Integer, Float, Date, JSON).
     - Auto-suggest ontology mapping (e.g. columns `pi_name`, `grant_number`, `award_amount` auto-map to Academic Research; `site_code`, `outage_mins` auto-map to Telecom).
  3. **Streaming Graph & Vector Ingestion Pipeline**:
     - Pipe rows directly into:
       - `ResearchMemoryObject` in PostgreSQL.
       - Cypher graph nodes & relationships in Neo4j Aura with tenant isolation.
       - Vector embeddings for semantic search.
  4. **Progress & Error Reporting**:
     - Real-time progress bar (e.g., "Ingested 3,420 of 5,000 rows • 0 errors").
     - Bad row isolation / error log download.

- **Key Files**:
  - `backend/connectors/csv_connector.py`
  - `backend/routers/connectors.py` (Add CSV upload & mapping endpoints)
  - `frontend/components/connectors/CSVUploadModal.tsx`
  - `frontend/app/connectors/page.tsx` (Add CSV card to connector catalog)

---

### 🔹 Session 21: University Research Decoupling & Migration
**Goal:** Remove legacy hardcoded seeders (`seed_roles.py`, static JSON dumps) for the University Research dataset and cleanly re-ingest the entire university corpus through the generic PostgreSQL / CSV pipeline.

- **Tasks**:
  1. **Decouple Backend References**:
     - Remove hardcoded fallbacks in `cross_silo_engine.py`, `insights.py`, and `algorithms.py`.
     - Standardize all domain lookups to read from tenant configuration (`tenant.industry == 'higher_education'`).
  2. **Export & Clean University Research Dataset**:
     - Export existing canonical academic records into standardized CSV/SQL fixtures (`grants.csv`, `faculty.csv`, `departments.csv`, `publications.csv`).
  3. **Ingest via Generic Connector Pipeline**:
     - Re-import the university data through the new pipeline to verify that 100% of features (GACM Explorer, Insights Portfolio, SPOF Risk Matrix, Credential Vault) work purely from generic ingestion.

---

### 🔹 Session 22: Domain-Adaptive What-If Simulation Engine
**Goal:** Resolve the domain collision where University users see Telecom scenarios ("Planned Cell Outage", "Hardware Upgrade") by making the Simulation Engine completely dynamic based on tenant industry.

- **Tasks**:
  1. **Industry-Specific Simulation Scenarios**:
     - **For Academic / Higher Education (`higher_education`)**:
       - `FACULTY_DEPARTURE`: Simulates departure of a Lead PI; calculates at-risk grant volume, orphaned graduate researchers, and laboratory knowledge loss.
       - `FUNDING_BUDGET_CUT`: Simulates 15%-30% reduction in sponsor funding; projects impact on department research capital and continuity.
       - `IRB_COMPLIANCE_HOLD`: Simulates regulatory hold on human-subject protocols.
     - **For Telecom Enterprise (`telecom`)**:
       - `EMPLOYEE_DEPARTURE`: Specialist attrition & uncovered frequency cells.
       - `PLANNED_OUTAGE`: SLA penalty exposure & customer churn projections.
       - `HARDWARE_UPGRADE`: Capex ROI & call drop reductions.
  2. **Simulator UI Adaptation (`frontend/app/simulator/page.tsx`)**:
     - Inspect `user.tenant_id` and industry configuration to render appropriate scenario cards, input parameters, and mathematical projection models.

---

### 🔹 Session 23: End-to-End Verification & High-Volume Benchmarking
**Goal:** Ingest high-volume datasets (3,000 to 10,000+ rows) across multiple tenants simultaneously and verify zero graph leakage, responsive UI rendering, and complete tenant autonomy.

- **Tasks**:
  1. **High-Volume Databricks / PostgreSQL / CSV Ingestion**:
     - Ingest realistic datasets containing thousands of rows into Neo4j Aura.
     - Verify query performance with Neo4j property indexes.
  2. **Multi-Tenant Separation Audit**:
     - Run Cypher queries confirming Tenant A cannot view or infer Tenant B's nodes or schema.
  3. **Full Regression Walkthrough**:
     - Verify Authentication, Credential Vault, Graph Explorer, Insights, Simulator, and Connector Hub across both Academic and Telecom tenants.

---

## 🎯 Phase 4 Success Criteria
1. **Zero Hardcoded Data**: Both University Research and Telecom Enterprise data are ingested and maintained purely through external connectors.
2. **Pluggable Connectors**: PostgreSQL, CSV, and Databricks connectors coexist in a unified catalog.
3. **High Volume Support**: The system effortlessly ingests and visualizes thousands of rows per table without degradation.
4. **Clean Domain Separation**: No cross-tenant data leakage in SPOF, What-If simulation, or connectors.
