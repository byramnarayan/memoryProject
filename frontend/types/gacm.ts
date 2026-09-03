export interface GACMNodeProperties {
  name?: string;
  title?: string;
  id?: string;
  department?: string;
  institution?: string;
  amount?: number;
  start_date?: string;
  abstract?: string;
  user_id?: number;
  [key: string]: any;
}

export interface GACMNode {
  id: string;
  label: string;
  type: 'Faculty' | 'Project' | 'Grant' | 'Department' | string;
  properties: GACMNodeProperties;
}

export interface GACMEdge {
  id: string;
  source: string;
  target: string;
  relation: string;
}

export interface CytoscapeElement {
  data: {
    id: string;
    label?: string;
    source?: string;
    target?: string;
    type?: string;
    relation?: string;
    properties?: GACMNodeProperties;
    [key: string]: any;
  };
  classes?: string;
}

export interface ExpertRanking {
  faculty_name: string;
  department: string;
  centrality_rank: number;
  project_count: number;
  total_funding?: number;
}

export interface KnowledgeDecayNode {
  faculty_name: string;
  institution: string;
  total_projects: number;
  single_author_count: number;
  decay_risk_score: number;
  risk_level: 'HIGH' | 'MEDIUM' | 'LOW';
  recommendation: string;
}

export interface CommunityCluster {
  cluster_department: string;
  faculty_count: number;
  project_count: number;
}

export interface VectorCitation {
  grant_id: string;
  project_title: string;
  faculty_name: string;
  institution: string;
  award_amount: number;
  abstract_snippet: string;
  similarity_score?: number;
}

export interface GoogleCitation {
  title: string;
  url: string;
  snippet?: string;
}

export interface GACMQueryResponse {
  query?: string;
  synthesized_answer: string;
  matched_citations?: VectorCitation[];
  vector_citations?: VectorCitation[];
  pgvector_citations?: VectorCitation[];
  google_online_citations?: GoogleCitation[];
  graph_nodes: GACMNode[];
  graph_edges: GACMEdge[];
  stages?: string[];
  is_out_of_scope?: boolean;
  provenance_path?: {
    nodes: GACMNode[];
    edges: GACMEdge[];
  };
  confidence_score?: number;
  execution_time_ms?: number;
}
