/**
 * Core Data Models & Types
 * 
 * This file contains the TypeScript definitions for the application's core entities.
 * Centralizing types ensures consistency across components, API requests, and responses.
 * 
 * @module types
 */

export interface User {
  id: number;
  username: string;
  email: string;
  is_active?: boolean;
  image_path?: string;
  role?: "TenantAdmin" | "DeptAdmin" | "Researcher" | "Auditor" | string;
  department?: string;
  clearance_level?: "Public" | "Internal" | "Restricted" | "Confidential" | "HighlyConfidential" | string;
  tenant_id?: string;
  first_name?: string;
  last_name?: string;
}

export interface AuditLog {
  id: number;
  tenant_id: string;
  user_id: number | null;
  username: string;
  user_role: string;
  department: string | null;
  clearance_level: string | null;
  memory_id: string | null;
  action: string;
  resource_type: string;
  details: Record<string, any>;
  sensitivity_level: string | null;
  ip_address: string;
  timestamp: string;
}

export interface GovernanceStats {
  total_events: number;
  clearance_denials: number;
  curation_actions: number;
  captures: number;
  active_legal_holds: number;
  audited_by: string;
  auditor_role: string;
}

export interface DepartmentFunding {
  department: string;
  total_funding: number;
  grants_count: number;
  percentage: number;
}

export interface SponsorFunding {
  sponsor: string;
  total_funding: number;
  grants_count: number;
  percentage: number;
}

export interface StrategicGrant {
  grant_id: string;
  title: string;
  faculty_name: string;
  institution: string;
  award_amount: number;
  start_date: string;
}

export interface PortfolioAnalytics {
  tenant_id: string;
  summary: {
    total_funding: number;
    total_grants_tracked: number;
    active_grants: number;
    proposals_pending: number;
    avg_confidence_score: number;
    active_legal_holds: number;
  };
  department_breakdown: DepartmentFunding[];
  sponsor_breakdown: SponsorFunding[];
  lifecycle_pipeline: Record<string, number>;
  sensitivity_breakdown: Record<string, number>;
  strategic_grants: StrategicGrant[];
}

export interface SpofRisk {
  memory_id: string;
  project_title: string;
  sole_investigator: string;
  department: string;
  award_amount: number;
  risk_level: "Critical" | "High" | "Moderate";
  co_pi_count: number;
  recommendation: string;
}

export interface DecayingRecord {
  memory_id: string;
  title: string;
  confidence_score: number;
  needs_review: boolean;
  review_status: string;
  sensitivity_level: string;
  updated_at: string | null;
}

export interface RiskMatrix {
  tenant_id: string;
  summary: {
    total_spof_identified: number;
    critical_spof_capital: number;
    decay_vulnerable_count: number;
    active_compliance_holds: number;
  };
  spof_risks: SpofRisk[];
  decaying_records: DecayingRecord[];
  active_compliance_holds: {
    memory_id: string;
    title: string;
    sensitivity_level: string;
    created_at: string | null;
  }[];
}

export interface Post {
  id: number;
  title: string;
  content: string;
  user_id: number;
  created_at: string;
  updated_at?: string;
  author: User; // Expanded from author_id when joined
}

export interface AuthTokens {
  access_token: string;
  token_type: string;
}

export interface ApiError {
  detail: string | { loc: string[]; msg: string; type: string }[];
}

export interface PaginatedPostsResponse {
  posts: Post[];
  total: number;
  skip: number;
  limit: number;
  has_more: boolean;
}
