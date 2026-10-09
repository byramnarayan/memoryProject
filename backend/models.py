from __future__ import annotations
import json
from datetime import UTC, datetime
from sqlalchemy import DateTime, ForeignKey, String, Integer, Text, Float, Boolean
from sqlalchemy.orm import Mapped, mapped_column, relationship
from database import Base
from config import settings
# ========================================================
# NOTE ON FORWARD REFERENCES:
# The `from __future__ import annotations` import at the top is the magic trick 
# that allows the `User` class to reference the `Post` class before Python has 
# actually evaluated the `Post` code block lower down in the file.
# ========================================================

class User(Base):
    """
        Represents the database structure for application Users.
        Handles user profiles, images, and maps relationships to their posts.
    """
    __tablename__="users"
    id: Mapped[int]= mapped_column(Integer, primary_key=True, index=True)
    username: Mapped[str]= mapped_column(String(50), unique= True, nullable= False)
    email: Mapped[str]= mapped_column(String(120), unique= True, nullable= False)

    # Decoupling Data: Saving just the filename string in the database means if we move our 
    # folder structure from local storage to an AWS S3 cloud bucket later, the database stays untouched!
    image_file: Mapped[str| None]= mapped_column(
        String(120), nullable=True, default=None
    )

    # need to add th passwored hased
    password_hash: Mapped[str]= mapped_column(String(200), nullable=False)

    # University Role-Based Access Control (RBAC) & Clearance (Session 07)
    role: Mapped[str] = mapped_column(String(50), default="TenantAdmin", nullable=False)
    department: Mapped[str] = mapped_column(String(100), default="Research Division", nullable=False)
    clearance_level: Mapped[str] = mapped_column(String(50), default="HighlyConfidential", nullable=False)
    tenant_id: Mapped[str] = mapped_column(String(50), default="utc_campus", nullable=False)

    # Enterprise Employee Profile & Hierarchy (Session 10)
    first_name: Mapped[str | None] = mapped_column(String(60), nullable=True)
    last_name: Mapped[str | None] = mapped_column(String(60), nullable=True)
    employee_number: Mapped[str | None] = mapped_column(String(20), nullable=True, index=True)
    job_title: Mapped[str | None] = mapped_column(String(80), nullable=True)
    manager_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    hire_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    is_temporary_password: Mapped[bool] = mapped_column(default=False, nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="Active", nullable=False)

    

    
    ## User.reset_tokens relationship
    reset_tokens: Mapped[list[PasswordResetToken]] = relationship(
        back_populates="user",
        cascade="all, delete-orphan",
    )
    
    @property
    def  image_path(self)-> str:
        """
        A helper property that computes the visual layout file path dynamically.
        Separates data storage logic from user presentation layer logic.
        """
        if self.image_file:
            return f"https://{settings.s3_bucket_name}.s3.{settings.s3_region}.amazonaws.com/profile_pics/{self.image_file}"
        return "/static/profile_pics/default.jpg" 





### database model for password reset token 
## PasswordResetToken model
class PasswordResetToken(Base):
    """
    Database Model for storing Password Reset Tokens.
    We use a separate table instead of storing tokens on the User model to allow for 
    tracking token expiration dates and potentially supporting multiple active tokens.
    """
    __tablename__ = "password_reset_tokens"
    
    # primary key: unique identifier for each token record
    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    
    # foreign key: Links this token to the specific user who requested the reset.
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    
    # token_hash: VERY IMPORTANT. We NEVER store the raw token in the database.
    # We store a hashed version (SHA-256). When the user clicks the link, we hash
    # the token from the URL and compare it to this stored hash.
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    
    # expires_at: Tokens should have a short lifespan (e.g., 1 hour) to minimize the
    # window an attacker has to use a compromised link.
    expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
    )
    
    # created_at: Automatically records when the reset was requested. Useful for audits.
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
    )

    # SQLAlchemy Relationship: Allows us to easily access the User object from a token (token.user)
    # and all tokens from a user (user.reset_tokens).
    user: Mapped[User] = relationship(back_populates="reset_tokens")


class AuditLog(Base):
    """
    Immutable Enterprise Audit Trail for Institutional Memory Operations (Session 07).
    Records all access, captures, curations, sensitivity alterations, and authorization denials.
    """
    __tablename__ = "audit_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    tenant_id: Mapped[str] = mapped_column(String(50), default="utc_campus", index=True, nullable=False)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), index=True, nullable=True)
    username: Mapped[str] = mapped_column(String(100), index=True, default="Anonymous", nullable=False)
    user_role: Mapped[str] = mapped_column(String(50), default="Public", nullable=False)
    department: Mapped[str | None] = mapped_column(String(100), nullable=True)
    clearance_level: Mapped[str | None] = mapped_column(String(50), nullable=True)
    
    memory_id: Mapped[str | None] = mapped_column(String(100), index=True, nullable=True)
    action: Mapped[str] = mapped_column(String(100), index=True, nullable=False)  # CAPTURE, CURATE, APPROVE, REJECT, VIEW_TEXT, SEARCH, CLEARANCE_DENIAL, LEGAL_HOLD
    resource_type: Mapped[str] = mapped_column(String(50), default="ResearchMemoryObject", nullable=False)
    details_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    sensitivity_level: Mapped[str | None] = mapped_column(String(50), nullable=True)
    
    ip_address: Mapped[str] = mapped_column(String(100), default="127.0.0.1", nullable=False)
    timestamp: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        index=True
    )

    def set_details(self, details: dict):
        self.details_json = json.dumps(details)

    def get_details(self) -> dict:
        return json.loads(self.details_json) if self.details_json else {}


class CompanyTenant(Base):
    """
    Multi-Tenant Organization Model (Session 10).
    Represents an enterprise customer (e.g., Telecom Operator, Tech Enterprise).
    """
    __tablename__ = "company_tenants"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    tenant_id: Mapped[str] = mapped_column(String(50), unique=True, index=True, nullable=False)
    company_name: Mapped[str] = mapped_column(String(150), nullable=False)
    industry: Mapped[str] = mapped_column(String(50), default="Telecom", nullable=False)
    plan_tier: Mapped[str] = mapped_column(String(50), default="Enterprise", nullable=False)
    admin_email: Mapped[str] = mapped_column(String(120), nullable=False)
    settings_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC)
    )

    def set_settings(self, settings: dict):
        self.settings_json = json.dumps(settings)

    def get_settings(self) -> dict:
        return json.loads(self.settings_json) if self.settings_json else {}


class Department(Base):
    """
    Enterprise Department Entity (Session 10).
    e.g., Network Operations, Customer Support, RF Engineering, Billing & Finance
    """
    __tablename__ = "departments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    tenant_id: Mapped[str] = mapped_column(String(50), index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    code: Mapped[str] = mapped_column(String(50), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC)
    )


class CustomRole(Base):
    """
    Enterprise Custom Role & Access Rules (Session 10).
    Allows company admins to define roles and fine-grained permissions.
    """
    __tablename__ = "custom_roles"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    tenant_id: Mapped[str] = mapped_column(String(50), index=True, nullable=False)
    role_name: Mapped[str] = mapped_column(String(50), nullable=False)
    clearance_level: Mapped[str] = mapped_column(String(50), default="Internal", nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    can_manage_employees: Mapped[bool] = mapped_column(default=False, nullable=False)
    can_manage_connectors: Mapped[bool] = mapped_column(default=False, nullable=False)
    can_curate: Mapped[bool] = mapped_column(default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC)
    )


class ConnectorConfig(Base):
    """
    Enterprise Data Source Connector Configuration (Session 11).
    Stores endpoints, tokens, schemas, and sync statuses for Databricks, CRM, HRMS, etc.
    """
    __tablename__ = "connector_configs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    tenant_id: Mapped[str] = mapped_column(String(50), index=True, nullable=False)
    connector_type: Mapped[str] = mapped_column(String(50), default="DATABRICKS", nullable=False)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    server_hostname: Mapped[str | None] = mapped_column(String(255), nullable=True)
    http_path: Mapped[str | None] = mapped_column(String(255), nullable=True)
    access_token_masked: Mapped[str | None] = mapped_column(String(100), nullable=True)
    access_token_encrypted: Mapped[str | None] = mapped_column(Text, nullable=True)
    catalog: Mapped[str] = mapped_column(String(100), default="telco_lakehouse", nullable=False)
    target_schemas: Mapped[str] = mapped_column(String(200), default="silver,gold", nullable=False)
    status: Mapped[str] = mapped_column(String(50), default="DISCONNECTED", nullable=False)
    last_synced_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    records_synced: Mapped[int] = mapped_column(default=0, nullable=False)
    metadata_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC)
    )

    def set_metadata(self, data: dict):
        self.metadata_json = json.dumps(data)

    def get_metadata(self) -> dict:
        return json.loads(self.metadata_json) if self.metadata_json else {}


class EmployeeDailyLog(Base):
    """
    Employee Daily Operational & Intuition Log (Session 12).
    Captures daily engineering decisions, rejected trade-offs, incident root causes,
    and tacit intuition to eliminate organizational amnesia and enrich institutional memory.
    """
    __tablename__ = "employee_daily_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    tenant_id: Mapped[str] = mapped_column(String(50), index=True, nullable=False)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True, nullable=False)

    # Core Log Metadata
    log_date: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        index=True
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    decision_summary: Mapped[str] = mapped_column(Text, nullable=False)
    trade_offs_considered: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Operational Reference
    incident_or_ticket_ref: Mapped[str | None] = mapped_column(String(100), nullable=True, index=True)
    impacted_system_or_cell: Mapped[str | None] = mapped_column(String(100), nullable=True, index=True)
    intuition_notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Classification & Categorization
    decision_category: Mapped[str] = mapped_column(String(50), default="Workaround", nullable=False)
    urgency_level: Mapped[str] = mapped_column(String(50), default="Medium", nullable=False)

    # AI Enrichment & Structured Knowledge
    impacted_kpis_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    ai_enrichment_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    canonical_memory_id: Mapped[str | None] = mapped_column(String(100), nullable=True, index=True)

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC)
    )

    # Relationship to author
    user: Mapped[User] = relationship(foreign_keys=[user_id])

    def set_impacted_kpis(self, kpis: list[str]):
        self.impacted_kpis_json = json.dumps(kpis)

    def get_impacted_kpis(self) -> list[str]:
        return json.loads(self.impacted_kpis_json) if self.impacted_kpis_json else []

    def set_ai_enrichment(self, data: dict):
        self.ai_enrichment_json = json.dumps(data)

    def get_ai_enrichment(self) -> dict:
        return json.loads(self.ai_enrichment_json) if self.ai_enrichment_json else {}


class KnowledgeTransferSession(Base):
    """
    Enterprise Knowledge Transfer & Succession Session (Session 13).
    Pairs a transitioning predecessor with a successor and tracks coverage of
    operational decisions, critical incidents, and tacit workarounds.
    """
    __tablename__ = "knowledge_transfer_sessions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    tenant_id: Mapped[str] = mapped_column(String(50), index=True, nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)

    predecessor_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True, nullable=False)
    successor_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True, nullable=False)
    manager_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True, nullable=False)

    status: Mapped[str] = mapped_column(String(50), default="IN_PROGRESS", nullable=False)
    scope_description: Mapped[str | None] = mapped_column(Text, nullable=True)
    systems_in_scope_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    progress_percent: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC)
    )
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Relationships
    predecessor: Mapped[User] = relationship(foreign_keys=[predecessor_id])
    successor: Mapped[User] = relationship(foreign_keys=[successor_id])
    manager: Mapped[User] = relationship(foreign_keys=[manager_id])
    checklist_items: Mapped[list[KTChecklistItem]] = relationship(
        back_populates="kt_session",
        cascade="all, delete-orphan",
        order_by="KTChecklistItem.id"
    )

    def set_systems_in_scope(self, systems: list[str]):
        self.systems_in_scope_json = json.dumps(systems)

    def get_systems_in_scope(self) -> list[str]:
        return json.loads(self.systems_in_scope_json) if self.systems_in_scope_json else []


class KTChecklistItem(Base):
    """
    Checklist Item for Knowledge Transfer Review (Session 13).
    Links directly to a specific decision (DEC-XXXXXX), outage event, or ticket.
    """
    __tablename__ = "kt_checklist_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    session_id: Mapped[int] = mapped_column(ForeignKey("knowledge_transfer_sessions.id"), index=True, nullable=False)
    tenant_id: Mapped[str] = mapped_column(String(50), index=True, nullable=False)

    item_type: Mapped[str] = mapped_column(String(50), default="DECISION_REVIEW", nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    reference_id: Mapped[str | None] = mapped_column(String(100), nullable=True, index=True)

    is_reviewed: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    reviewed_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC)
    )

    # Relationships
    kt_session: Mapped[KnowledgeTransferSession] = relationship(back_populates="checklist_items")


class SimulationRecord(Base):
    """
    Enterprise What-If Decision Simulation Record (Session 14).
    Stores simulated scenarios, projected SLA penalties, churn probabilities,
    and mitigation recommendations.
    """
    __tablename__ = "simulation_records"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    tenant_id: Mapped[str] = mapped_column(String(50), index=True, nullable=False)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True, nullable=False)

    scenario_type: Mapped[str] = mapped_column(String(50), index=True, nullable=False)
    # Types: "EMPLOYEE_DEPARTURE", "PLANNED_OUTAGE", "HARDWARE_UPGRADE"
    scenario_name: Mapped[str] = mapped_column(String(255), nullable=False)

    input_params_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    results_json: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC)
    )

    user: Mapped[User] = relationship(foreign_keys=[user_id])

    def set_inputs(self, data: dict):
        self.input_params_json = json.dumps(data)

    def get_inputs(self) -> dict:
        return json.loads(self.input_params_json) if self.input_params_json else {}

    def set_results(self, data: dict):
        self.results_json = json.dumps(data)

    def get_results(self) -> dict:
        return json.loads(self.results_json) if self.results_json else {}


class CredentialVaultItem(Base):
    """
    Secure HR Credential Vault for auto-ingested or newly provisioned staff.
    Stores initial temporary credentials for admin/HR distribution.
    Access is strictly restricted to TenantAdmin and DeptAdmin.
    """
    __tablename__ = "credential_vault"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    tenant_id: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    employee_number: Mapped[str] = mapped_column(String(30), nullable=False)
    full_name: Mapped[str] = mapped_column(String(120), nullable=False)
    work_email: Mapped[str] = mapped_column(String(120), nullable=False)
    username: Mapped[str] = mapped_column(String(60), nullable=False)
    department: Mapped[str] = mapped_column(String(100), nullable=False)
    role: Mapped[str] = mapped_column(String(50), nullable=False)
    job_title: Mapped[str] = mapped_column(String(100), nullable=False)
    clearance_level: Mapped[str] = mapped_column(String(50), nullable=False)
    temporary_password: Mapped[str] = mapped_column(String(100), nullable=False)
    source: Mapped[str] = mapped_column(String(50), default="Connector Ingestion", nullable=False)
    handout_status: Mapped[str] = mapped_column(String(30), default="Pending Handout", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False)
    delivered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    user: Mapped["User"] = relationship(foreign_keys=[user_id])


# Re-export institutional memory & GACM models
from graph.models_gacm import (
    ResearchMemoryObject,
    DocumentEmbedding,
    GACMChatSession,
    TopicDiscussionComment,
    CaptureJob,
)



# =====================================================================
# FASTAPI BACKGROUND TASKS - NOTES & BEST PRACTICES
# =====================================================================
#
# 1. Purpose & Performance:
#    - Long-running operations (like sending emails) involve time-consuming
#      communication between servers.
#    - Background tasks prevent the user from waiting by returning an HTTP 
#      response immediately while the task runs in the background.
#
# 2. Execution Flow:
#    - FastAPI returns the response to the client FIRST.
#    - The background task is executed AFTER the response is sent.
#
# 3. Limitations & Reliability:
#    - Tasks are non-persistent: If the server crashes, any pending 
#      background tasks are lost.
#    - Ideal for non-critical tasks (e.g., password reset emails, where 
#      the user can simply request another one if it fails).
#    - For critical operations requiring guaranteed execution, use a 
#      dedicated task queue (e.g., Celery).
# =====================================================================
