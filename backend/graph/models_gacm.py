from __future__ import annotations
import json
from datetime import UTC, datetime
from sqlalchemy import DateTime, String, Integer, Float, Text, ForeignKey, Index, Boolean
from sqlalchemy.orm import Mapped, mapped_column
from database import Base

class DocumentEmbedding(Base):
    """
    SQLAlchemy Model for storing University Research Projects & Vector Embeddings in PostgreSQL.
    Strictly isolated per user via `user_id` foreign key (Multi-Tenant Data Isolation).
    """
    __tablename__ = "document_embeddings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    
    # User / Tenant Isolation: Each document belongs strictly to one authenticated user
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True, nullable=False)
    
    grant_id: Mapped[str] = mapped_column(String(100), index=True, nullable=False)
    project_title: Mapped[str] = mapped_column(String(500), index=True, nullable=False)
    faculty_name: Mapped[str] = mapped_column(String(200), index=True, nullable=False)
    institution: Mapped[str] = mapped_column(String(300), index=True, nullable=False)
    award_amount: Mapped[float] = mapped_column(Float, default=0.0)
    start_date: Mapped[str] = mapped_column(String(50), nullable=True)
    abstract: Mapped[str] = mapped_column(Text, nullable=False)
    
    # Stores 384-dimensional vector embedding as JSON array of floats for pgvector & semantic search
    embedding_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    
    # Created timestamp for provenance auditability
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC)
    )

    def set_embedding(self, vector: list[float]):
        """Serializes float vector array to JSON string."""
        self.embedding_json = json.dumps(vector)

    def get_embedding(self) -> list[float]:
        """Deserializes JSON string back to float vector array."""
        if self.embedding_json:
            return json.loads(self.embedding_json)
        return []

    def __repr__(self) -> str:
        return f"<DocumentEmbedding(id={self.id}, user_id={self.user_id}, grant_id='{self.grant_id}', faculty='{self.faculty_name}')>"

class GACMChatSession(Base):
    """
    SQLAlchemy Model for storing GACM AI Chat Sessions & Evidence Citations in PostgreSQL.
    """
    __tablename__ = "gacm_chat_sessions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True, nullable=False)
    query_text: Mapped[str] = mapped_column(Text, nullable=False)
    synthesized_answer: Mapped[str] = mapped_column(Text, nullable=False)
    citations_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    nodes_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    edges_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    confidence_score: Mapped[float] = mapped_column(Float, default=1.0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC)
    )

class TopicDiscussionComment(Base):
    """
    SQLAlchemy Model for storing Community Topic Discussion Comments in PostgreSQL.
    """
    __tablename__ = "topic_discussion_comments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    topic_id: Mapped[int] = mapped_column(Integer, index=True, nullable=False)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True, nullable=False)
    author_name: Mapped[str] = mapped_column(String(100), nullable=False)
    role_label: Mapped[str] = mapped_column(String(100), default="Institutional Researcher")
    comment_text: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC)
    )

class ResearchMemoryObject(Base):
    """
    Canonical Institutional Research Memory Object (MaaS Core).
    Encapsulates: Content + Context + Classification + Derived Summaries + Entities + Relations + Tiers + Governance.
    """
    __tablename__ = "research_memory_objects"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)

    # 1. Identity & Tenancy
    memory_id: Mapped[str] = mapped_column(String(100), unique=True, index=True, nullable=False)
    tenant_id: Mapped[str] = mapped_column(String(100), index=True, default="utc_campus", nullable=False)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True, default=1, nullable=False)

    # 2. Domain & Classification
    domain: Mapped[str] = mapped_column(String(50), default="research_university", nullable=False)
    category: Mapped[str] = mapped_column(String(50), default="Document", nullable=False)
    memory_type: Mapped[str] = mapped_column(String(100), index=True, default="GrantAward", nullable=False)
    severity: Mapped[str] = mapped_column(String(50), default="Info", nullable=False)
    sensitivity_level: Mapped[str] = mapped_column(String(50), index=True, default="Public", nullable=False)
    lifecycle_stage: Mapped[str] = mapped_column(String(50), default="Active", nullable=False)
    tier: Mapped[str] = mapped_column(String(50), default="short_term", nullable=False)

    # 3. Content
    title: Mapped[str] = mapped_column(String(500), index=True, nullable=False)
    raw_text: Mapped[str] = mapped_column(Text, nullable=False)
    sections_json: Mapped[str | None] = mapped_column(Text, nullable=True)

    # 4. Provenance & Source Reference
    source_system: Mapped[str] = mapped_column(String(100), default="GACM_Master", nullable=False)
    source_ref_json: Mapped[str | None] = mapped_column(Text, nullable=True)

    # 5. Derived AI Summaries
    derived_summaries_json: Mapped[str | None] = mapped_column(Text, nullable=True)

    # 6. Entities, Relationships & Metadata
    entities_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    relations_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    tags_json: Mapped[str | None] = mapped_column(Text, nullable=True)

    # 7. Vector Search & Deduplication
    embedding_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    content_hash: Mapped[str | None] = mapped_column(String(64), index=True, nullable=True)

    # 8. Quality & Governance
    confidence_score: Mapped[float] = mapped_column(Float, default=100.0)
    needs_review: Mapped[bool] = mapped_column(Boolean, default=False)
    review_status: Mapped[str] = mapped_column(String(50), default="approved")
    is_on_legal_hold: Mapped[bool] = mapped_column(Boolean, default=False)
    retain_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # 9. Audit & Timestamps
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC)
    )

    def set_entities(self, data: dict):
        self.entities_json = json.dumps(data)

    def get_entities(self) -> dict:
        return json.loads(self.entities_json) if self.entities_json else {}

    def set_derived_summaries(self, data: dict):
        self.derived_summaries_json = json.dumps(data)

    def get_derived_summaries(self) -> dict:
        return json.loads(self.derived_summaries_json) if self.derived_summaries_json else {}

    def set_relations(self, data: list):
        self.relations_json = json.dumps(data)

    def get_relations(self) -> list:
        return json.loads(self.relations_json) if self.relations_json else []

    def set_tags(self, tags: list[str]):
        self.tags_json = json.dumps(tags)

    def get_tags(self) -> list[str]:
        return json.loads(self.tags_json) if self.tags_json else []

    def set_embedding(self, vector: list[float]):
        self.embedding_json = json.dumps(vector)

    def get_embedding(self) -> list[float]:
        return json.loads(self.embedding_json) if self.embedding_json else []

    def set_source_ref(self, ref: dict):
        self.source_ref_json = json.dumps(ref)

    def get_source_ref(self) -> dict:
        return json.loads(self.source_ref_json) if self.source_ref_json else {}

    def __repr__(self) -> str:
        return f"<ResearchMemoryObject(id={self.id}, memory_id='{self.memory_id}', title='{self.title[:30]}...', type='{self.memory_type}')>"


class CaptureJob(Base):
    """
    Tracks ingestion jobs in the Memory Capture Engine (Module 1).
    State machine: received -> parsing -> queued -> completed | failed | duplicate_blocked
    """
    __tablename__ = "capture_jobs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    capture_id: Mapped[str] = mapped_column(String(100), unique=True, index=True, nullable=False)
    tenant_id: Mapped[str] = mapped_column(String(100), index=True, default="utc_campus", nullable=False)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True, default=1, nullable=False)

    file_name: Mapped[str] = mapped_column(String(300), nullable=False)
    file_size_bytes: Mapped[int] = mapped_column(Integer, default=0)
    file_type: Mapped[str] = mapped_column(String(50), nullable=False)  # pdf, docx, txt, json
    content_hash: Mapped[str] = mapped_column(String(64), index=True, nullable=False)  # SHA-256

    source_system: Mapped[str] = mapped_column(String(100), default="Upload", nullable=False)
    memory_type_hint: Mapped[str] = mapped_column(String(100), default="GrantAward", nullable=False)
    department: Mapped[str] = mapped_column(String(100), default="Research Division", nullable=False)
    sensitivity_level: Mapped[str] = mapped_column(String(50), default="Public", nullable=False)

    status: Mapped[str] = mapped_column(String(50), default="received", index=True, nullable=False)
    error_code: Mapped[str | None] = mapped_column(String(50), nullable=True)  # CAP-1001, CAP-1002, CAP-1005, etc.
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)

    extracted_title: Mapped[str | None] = mapped_column(String(500), nullable=True)
    page_count: Mapped[int] = mapped_column(Integer, default=1)
    sections_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    raw_text: Mapped[str | None] = mapped_column(Text, nullable=True)

    resulting_memory_id: Mapped[str | None] = mapped_column(String(100), index=True, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC)
    )
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    def set_sections(self, sections: list):
        self.sections_json = json.dumps(sections)

    def get_sections(self) -> list:
        return json.loads(self.sections_json) if self.sections_json else []

    def __repr__(self) -> str:
        return f"<CaptureJob(id={self.id}, capture_id='{self.capture_id}', file='{self.file_name}', status='{self.status}')>"


