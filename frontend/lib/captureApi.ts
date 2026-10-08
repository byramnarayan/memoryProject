import { apiFetch } from './api';

export interface CaptureJobItem {
  id: number;
  capture_id: string;
  file_name: string;
  file_size_bytes: number;
  file_type: string;
  source_system: string;
  memory_type: string;
  department: string;
  sensitivity_level: string;
  status: 'received' | 'parsing' | 'queued' | 'completed' | 'failed' | 'duplicate_blocked';
  error_code?: string;
  error_message?: string;
  extracted_title?: string;
  page_count: number;
  resulting_memory_id?: string;
  created_at: string;
  completed_at?: string;
}

export interface CaptureQueueResponse {
  total: number;
  skip: number;
  limit: number;
  items: CaptureJobItem[];
}

export interface CaptureDetailResponse {
  capture_id: string;
  file_name: string;
  status: string;
  error_code?: string;
  error_message?: string;
  extracted_title?: string;
  page_count: number;
  sections: Array<{ name: string; text: string; order: number }>;
  preview_text?: string;
  resulting_memory_id?: string;
  memory_details?: {
    memory_id: string;
    confidence_score: number;
    needs_review: boolean;
    review_status: string;
    entities: {
      pi_name?: string;
      co_pi_names?: string[];
      sponsor_agency?: string;
      grant_number?: string;
      award_amount?: number;
      cfda_code?: string;
      department?: string;
      key_topics?: string[];
      irb_protocol?: string;
      review_reasons?: string[];
      [key: string]: any;
    };
    derived_summaries: {
      short_summary?: string;
      detailed_summary?: string;
      compliance_summary?: any;
    };
    tags: string[];
  };
  created_at?: string;
}

export async function uploadDocumentFile(
  file: File,
  department: string = 'Computer Science & Engineering',
  memoryType: string = 'GrantAward',
  sensitivityLevel: string = 'Public'
): Promise<any> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('department', department);
  formData.append('memory_type', memoryType);
  formData.append('sensitivity_level', sensitivityLevel);

  // In Next.js client, hit the relative URL (proxied to FastAPI backend)
  const isServer = typeof window === 'undefined';
  const baseUrl = isServer ? (process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000') : '';

  const res = await fetch(`${baseUrl}/api/capture/upload`, {
    method: 'POST',
    body: formData,
    // Do not set Content-Type header so browser sets multipart boundary
  });

  const data = await res.json();
  if (!res.ok) {
    throw data;
  }
  return data;
}

export async function fetchCaptureQueue(
  skip: number = 0,
  limit: number = 25,
  statusFilter: string = ''
): Promise<CaptureQueueResponse> {
  const query = new URLSearchParams({
    skip: String(skip),
    limit: String(limit),
    status_filter: statusFilter
  });

  return apiFetch<CaptureQueueResponse>(`/api/capture/queue?${query.toString()}`, {
    method: 'GET',
    skipAuth: true
  });
}

export async function fetchCaptureJobDetails(captureId: string): Promise<CaptureDetailResponse> {
  return apiFetch<CaptureDetailResponse>(`/api/capture/${captureId}`, {
    method: 'GET',
    skipAuth: true
  });
}
