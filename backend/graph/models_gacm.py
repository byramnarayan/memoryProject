from __future__ import annotations
import json
from datetime import UTC, datetime
from sqlalchemy import DateTime, String, Integer, Float, Text, ForeignKey, Index
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
