# Enterprise Company Brain (Phase 3)
## Multi-Tenant Autonomous Ingestion, Neo4j Graph Synchronization & Dynamic Mnemograph Engine

**Domain:** Multi-Domain Enterprise Knowledge Engine (Telecommunications, Academic Research, Enterprise Operations)  
**Target Ingestion:** Databricks Lakehouse (`silver.network_event`, `silver.cell`, `support.service_ticket`) + HRMS & CSV Feeds  
**Graph Engine:** Neo4j Aura Property Graph / Memgraph with Property-Level Tenant Partitioning (`tenant_id: $tenant_id`)  
**Access Control:** Strict HR/Admin Credential Provisioning + 5-Tier Sensitivity Clearance ACLs  

---

## 📌 Master Implementation Roadmap (Phase 3)

| Session | Title | Focus Area | Status |
| :---: | :--- | :--- | :---: |
| **15** | **Automated Employee Ingestion & HR Credential Vault** | Datasource Staff Extraction, Auto-Provisioning & HR Vault | ✅ Completed |
| **16** | **Neo4j Real-Time Multi-Tenant Graph Ingestion Pipeline** | Live Connector Cypher Ingestion & Zero-Leakage Graph Sync | ✅ Completed |
| **17** | **Mnemograph Dynamic Ontology Resolver & Enterprise Graph Explorer** | Multi-Domain GACM, Dynamic Semantic Filters & Industry Schema | ✅ Completed |
| **18** | **End-to-End Multi-Tenant Lifecycle Verification & Hardening** | Full Flow Walkthrough: Company Setup → Sync → RBAC → Graph | 🔄 In Progress |

---

## 📋 Detailed Session Breakdown

---

### 🔹 Session 15: Automated Employee Ingestion & HR Credential Vault
**Goal:** Automatically extract technical staff and managers from connector datasets during Lakehouse/HRMS sync, auto-provision user login credentials under the tenant, provide an HR-only Credential Vault in `/employees`, and enforce strict UI role gating.  
**Status:** ✅ **COMPLETED (All Acceptance Criteria Verified)**

- [x] **Tasks**:
  1. **Connector Staff Auto-Extractor Engine**:
     - Extract assigned engineers, operators, and support personnel from ingested datasource tables (`assigned_emp` in tickets, field crew in outages, HRMS tables).
     - Check for existing accounts under `tenant_id` to prevent duplicate creation.
     - Auto-create `models.User` records with standard work emails, department assignments, default clearance levels, and generated temporary passwords.
  2. **HR / Manager Credential Vault ([frontend/app/employees/page.tsx](file:///d:/SARVESH%20DOCS/PROJECTS/memoryProject/frontend/app/employees/page.tsx))**:
     - Create a secure **"Imported Staff Credentials"** vault tab visible **only to Company Admin and HR/Managers**.
     - Display a table of auto-provisioned staff members with copyable one-click credential slips and distribution status (`Pending Handout` vs `Delivered`).
  3. **Strict UI & Frontend Role Gating**:
     - Hide the `+ Provision New Employee` button and credential slips from regular employees (`user.role !== 'TenantAdmin' && user.role !== 'DeptAdmin' && user.role !== 'HRManager'`).
     - Regular employees see only a read-only directory matching their clearance.
  4. **Manual & Incremental Provisioning for New Joiners**:
     - Ensure Admins, HR, and Managers retain the interactive modal to provision individual new employees on demand.

- **Key Files**:
  - `backend/connectors/databricks_connector.py` (Add staff extraction & user auto-provisioning logic)
  - `backend/routers/employees.py` (Add `/credentials-vault` endpoint restricted to Admin/HR)
  - `frontend/app/employees/page.tsx` (Add Credential Vault tab, role-gated UI buttons)
  - `backend/tests/test_staff_auto_provision.py` (Automated tests for auto-extraction and RBAC)

- **Acceptance Criteria**:
  - [x] Running a connector sync automatically populates `models.User` accounts in the tenant without manual entry.
  - [x] Only Company Admin and HR/Managers can view initial passwords and credential slips.
  - [x] Regular employees cannot see credential slips or access the provision button.

---

### 🔹 Session 16: Neo4j Real-Time Multi-Tenant Graph Ingestion Pipeline
**Goal:** Extend the connector sync pipeline and employee creation endpoints to pipe all ingested entities and new employees directly into Neo4j Aura in real time, with strict property-level tenant partitioning.  
**Status:** ✅ **COMPLETED (All Acceptance Criteria Verified)**

- [x] **Tasks**:
  1. **Real-Time Employee Addition Hook**:
     - When an employee is created via manual HR provisioning (`/api/employees/provision`), auto-provisioned via connector sync (`_auto_provision_datasource_staff`), or company setup (`/api/tenant/setup-company`), immediately write the node and relationships to Neo4j in real time:
       - `(:Employee {employee_id, employee_number, tenant_id, name, username, email, role, department, job_title, clearance_level, status})`
       - `(:Department {name, tenant_id})`
       - `(:Employee)-[:BELONGS_TO]->(:Department)`
       - `(:Employee)-[:REPORTS_TO]->(:Employee)` (Manager hierarchy)
  2. **Lakehouse-to-Graph Cypher Ingestion Worker**:
     - Pipe synced records directly into Neo4j with Cypher `MERGE` statements:
       - `(:NetworkSite {site_code, tenant_id, name, location, cell_count, tech, avg_drop_rate, ...})`
       - `(:NetworkEvent {event_id, tenant_id, event_type, severity, duration_minutes, tech, ...})`
       - `(:ServiceTicket {ticket_number, tenant_id, category, priority, status, customer_number, ...})`
       - Relationships: `(e)-[:ASSIGNED_TO]->(t)`, `(t)-[:AFFECTS_SITE]->(s)`, `(evt)-[:OCCURRED_AT]->(s)`.
  3. **Multi-Tenant Property Partitioning (`tenant_id: $tenant_id`)**:
     - Enforce `tenant_id` stamping on all nodes, edges, and graph indexes.
     - Ensure the existing 17,990+ University nodes (`tenant_id: 'utc_campus'`) remain completely isolated from new company graphs.
  4. **Graph Ingestion Health & Metrics Endpoint**:
     - Provide `/api/connectors/graph-stats` to verify node and relationship counts created for the active tenant.
     - Live Neo4j Telemetry Hub integrated into `/connectors` UI.

- **Key Files**:
  - `backend/services/graph_sync_service.py` (`sync_employee_to_neo4j`, `sync_lakehouse_operational_graph`, `get_tenant_graph_metrics`, `ensure_graph_indexes`)
  - `backend/routers/employees.py` (Real-time Neo4j employee hook on `/provision`)
  - `backend/connectors/databricks_connector.py` (Real-time Neo4j sync for staff and lakehouse operational graph)
  - `backend/routers/tenant.py` (Real-time Neo4j sync for initial admin)
  - `backend/routers/connectors.py` (Added `GET /api/connectors/graph-stats`)
  - `frontend/app/connectors/page.tsx` (Live Neo4j telemetry hub & metrics grid)
  - `backend/tests/test_multi_tenant_graph_sync.py` (Automated 4-part test suite verifying graph sync, employee real-time hook, and isolation)

- **Acceptance Criteria**:
  - [x] Adding or provisioning any new employee immediately writes `:Employee`, `:Department`, `[:BELONGS_TO]`, and `[:REPORTS_TO]` nodes/edges to Neo4j in real time.
  - [x] Syncing Lakehouse data creates nodes and relationships in Neo4j with `tenant_id` stamped on every entity.
  - [x] Cypher queries for tenant A return zero nodes from tenant B or the legacy university dataset.

---

### 🔹 Session 17: Mnemograph Dynamic Ontology Resolver & Enterprise Graph Explorer
**Goal:** Transform Mnemograph (`/gacm`) and its AI query engine to dynamically adapt to the company's industry ontology (Telecom vs Academic vs General Enterprise).  
**Status:** ✅ **COMPLETED**

- [x] **Tasks**:
  1. **Dynamic Industry Ontology Resolver**:
     - Query tenant profile to determine industry (`telecom`, `higher_education`, `fintech`, `enterprise`).
     - Remove hardcoded academic keywords from `google_adk_agent.py` and replace with a domain-aware semantic vocabulary (towers, drop rate, SLA, cell outages, tickets).
  2. **Dynamic Cypher Traversal in GACM Engine**:
     - When an enterprise user queries Mnemograph, traverse `:Employee`, `:NetworkSite`, `:Decision`, `:NetworkEvent`, `:ServiceTicket` scoped to `WHERE n.tenant_id = $tenant_id`.
  3. **Frontend Graph Visualization Adaptation ([frontend/app/gacm/page.tsx](file:///d:/SARVESH%20DOCS/PROJECTS/memoryProject/frontend/app/gacm/page.tsx))**:
     - Render domain-appropriate node types, icons, colors, and badge indicators (Cyan for Employee, Amber for Site, Rose for Outage, Sky for Ticket, Purple for Department).
     - Adaptive initial query and placeholder based on tenant industry.
  4. **Domain-Adaptive Graph Algorithms**:
     - Update Decay Risk and Expert Finder algorithms to evaluate Single Points of Failure (SPOF) across engineering incidents for enterprise tenants while preserving PI Solo Grant algorithms for academic tenants.
     - Breadth-first provenance traversal adapted to trace lineages between specialists, incidents, and sites.

- **Key Files**:
  - `backend/routers/gacm.py` (Domain-adaptive GACM query, projects, provenance, and history endpoints)
  - `backend/google_adk_agent.py` (Industry-aware guardrails, tenant-partitioned Neo4j graph search & LLM synthesis)
  - `backend/graph/algorithms.py` (Tenant-partitioned SPOF, PageRank expert finder, Louvain communities & shortest provenance path)
  - `frontend/lib/gacmApi.ts` (Forwarding authentication token for tenant scoping)
  - `frontend/components/gacm/GraphVisualizer.tsx` (Cytoscape selectors, dynamic legend, and entity inspector for enterprise nodes)
  - `frontend/components/gacm/HybridQueryBar.tsx` (Dynamic industry query placeholder support)
  - `frontend/app/gacm/page.tsx` (Dynamic node rendering, fallback graph nodes, and ontology controls)
  - `backend/tests/test_dynamic_ontology_resolver.py` (Automated 4-part test suite verifying dynamic ontology, Cypher traversal, domain-adaptive algorithms, and agent orchestration)

- **Acceptance Criteria**:
  - [x] Telecom employees searching `/gacm` receive telecom ontology mappings and cell/tower/event/ticket nodes without out-of-scope rejections.
  - [x] University researchers querying `/gacm` continue to receive academic faculty/grant/project mappings with 100% backward compatibility.
  - [x] Single Point of Failure (SPOF) risks reflect the active company's operational assets.
  - [x] Zero cross-tenant graph leakage verified across Cypher queries and graph algorithms.

---

### 🔹 Session 18: End-to-End Multi-Tenant Lifecycle Verification & Hardening
**Goal:** Perform an end-to-end verification of the entire lifecycle flow from scratch, validating the user experience across all modules.  
**Status:** ⏳ **PENDING**

- [ ] **Tasks**:
  1. **Full Lifecycle Test Scenario**:
     - Provision a brand new company tenant (e.g., `novatel` or `apex_telecom`) via `/setup-company`.
     - Connect and trigger Lakehouse ingestion via `/connectors`.
     - Verify automatic creation of employee accounts in `/employees` and review credential slips as Admin.
     - Log in as an imported employee; verify role-gated read-only views.
     - Open Mnemograph (`/gacm`) and verify live Neo4j telecom graph visualization.
     - Open Analytics (`/insights`) and verify telecom cross-silo intelligence (Completed: adaptive `/insights` renders telecom hotspots, SLA exposure, SPOF risks, and live Neo4j topology for enterprise tenants while preserving UTC university portfolio for `utc_campus`).
  2. **Automated End-to-End Test Suite**:
     - Create `backend/tests/test_full_tenant_lifecycle.py` covering tenant creation, connector sync, auto-provisioning, and graph querying.

- **Acceptance Criteria**:
  - [x] Adaptive Analytics (`/insights`) renders telecom operational intelligence for enterprise tenants with 100% backward compatibility for UTC research.
  - [ ] The entire flow works seamlessly without manual database scripts or hardcoded workarounds.
  - [ ] Complete isolation, correct RBAC permissions, and responsive UI confirmed.
