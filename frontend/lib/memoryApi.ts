import { apiFetch } from './api';

export interface ReviewItem {
  id: number;
  memory_id: string;
  tenant_id: string;
  domain: string;
  category: string;
  memory_type: string;
  severity: string;
  sensitivity_level: string;
  lifecycle_stage: string;
  tier: string;
  title: string;
  raw_text: string;
  source_system: string;
  source_ref?: Record<string, any>;
  entities: {
    pi_name?: string;
    co_pi_names?: string[];
    sponsor_agency?: string;
    award_amount?: number;
    grant_number?: string;
    cfda_code?: string;
    department?: string;
    key_topics?: string[];
    irb_protocol?: string;
    review_reasons?: string[];
    curated_by?: string;
    curated_at?: string;
    [key: string]: any;
  };
  derived_summaries: {
    short_summary?: string;
    detailed_summary?: string;
    compliance_summary?: string;
  };
  relations: Array<{ source: string; target: string; relation: string }>;
  tags: string[];
  confidence_score: number;
  needs_review: boolean;
  review_status: 'pending_review' | 'approved' | 'rejected' | string;
  review_reasons: string[];
  is_on_legal_hold: boolean;
  created_at: string;
  updated_at?: string;
}

export interface ReviewQueueStats {
  pending_count: number;
  approved_count: number;
  rejected_count: number;
  average_confidence: number;
}

export interface ReviewQueueResponse {
  items: ReviewItem[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    total_pages: number;
  };
  stats: ReviewQueueStats;
}

export interface CurateMemoryPayload {
  title?: string;
  memory_type?: string;
  department?: string;
  sensitivity_level?: string;
  entities?: Record<string, any>;
  derived_summaries?: {
    short_summary?: string;
    detailed_summary?: string;
    compliance_summary?: string;
  };
  tags?: string[];
  approve_immediately?: boolean;
}

export async function fetchReviewQueue(params?: {
  page?: number;
  limit?: number;
  review_state?: string;
  department?: string;
  memory_type?: string;
  search?: string;
}): Promise<ReviewQueueResponse> {
  const query = new URLSearchParams();
  if (params?.page) query.append('page', params.page.toString());
  if (params?.limit) query.append('limit', params.limit.toString());
  if (params?.review_state) query.append('review_state', params.review_state);
  if (params?.department && params.department !== 'All') query.append('department', params.department);
  if (params?.memory_type && params.memory_type !== 'All') query.append('memory_type', params.memory_type);
  if (params?.search) query.append('search', params.search);

  return apiFetch<ReviewQueueResponse>(`/api/memory/review-queue?${query.toString()}`);
}

export async function fetchMemoryDetail(memoryId: string): Promise<ReviewItem> {
  return apiFetch<ReviewItem>(`/api/memory/${encodeURIComponent(memoryId)}`);
}

export async function approveMemory(memoryId: string): Promise<{
  status: string;
  message: string;
  memory: ReviewItem;
  graph_sync?: any;
}> {
  return apiFetch<{
    status: string;
    message: string;
    memory: ReviewItem;
    graph_sync?: any;
  }>(`/api/memory/${encodeURIComponent(memoryId)}/approve`, {
    method: 'PUT'
  });
}

export async function updateMemoryEntities(
  memoryId: string,
  payload: CurateMemoryPayload
): Promise<{
  status: string;
  message: string;
  memory: ReviewItem;
  graph_sync?: any;
}> {
  return apiFetch<{
    status: string;
    message: string;
    memory: ReviewItem;
    graph_sync?: any;
  }>(`/api/memory/${encodeURIComponent(memoryId)}/entities`, {
    method: 'PUT',
    body: JSON.stringify(payload)
  });
}

export async function reExtractMemory(memoryId: string): Promise<{
  status: string;
  message: string;
  memory: ReviewItem;
  graph_sync?: any;
}> {
  return apiFetch<{
    status: string;
    message: string;
    memory: ReviewItem;
    graph_sync?: any;
  }>(`/api/memory/${encodeURIComponent(memoryId)}/re-extract`, {
    method: 'POST'
  });
}

export async function deleteMemory(
  memoryId: string,
  hardDelete: boolean = false
): Promise<{
  status: string;
  message: string;
  action: string;
}> {
  return apiFetch<{
    status: string;
    message: string;
    action: string;
  }>(`/api/memory/${encodeURIComponent(memoryId)}?hard_delete=${hardDelete}`, {
    method: 'DELETE'
  });
}
