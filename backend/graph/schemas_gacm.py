from pydantic import BaseModel, Field
from typing import List, Dict, Any, Optional

class QueryRequest(BaseModel):
    query: str = Field(..., example="Which faculty members worked on AI projects related to healthcare?")
    top_k: int = Field(default=5, ge=1, le=50)

class GraphNode(BaseModel):
    id: str
    label: str
    type: str
    properties: Dict[str, Any] = {}

class GraphEdge(BaseModel):
    id: str
    source: str
    target: str
    relation: str

class DocumentCitation(BaseModel):
    grant_id: str
    project_title: str
    faculty_name: str
    institution: str
    award_amount: float
    abstract_snippet: str

class GACMQueryResponse(BaseModel):
    query: str
    synthesized_answer: str
    matched_citations: List[DocumentCitation]
    graph_nodes: List[GraphNode]
    graph_edges: List[GraphEdge]
    execution_time_ms: float

class KnowledgeDecayNode(BaseModel):
    faculty_name: str
    institution: str
    total_projects: int
    single_author_count: int
    decay_risk_score: float
    risk_level: str  # HIGH, MEDIUM, LOW
    recommendation: str
