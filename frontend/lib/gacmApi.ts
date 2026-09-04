import { apiFetch } from './api';
import {
  GACMQueryResponse,
  ExpertRanking,
  KnowledgeDecayNode,
  CommunityCluster,
  GACMNode,
  GACMEdge
} from '@/types/gacm';

export async function fetchGACMQuery(query: string, topKVector: number = 5): Promise<GACMQueryResponse> {
  return apiFetch<GACMQueryResponse>('/api/gacm/query', {
    method: 'POST',
    body: JSON.stringify({
      query,
      top_k_vector: topKVector,
      include_graph: true
    }),
    skipAuth: true
  });
}

export async function fetchExpertRankings(topK: number = 10): Promise<ExpertRanking[]> {
  try {
    const res = await apiFetch<any>(`/api/gacm/expert-rankings?top_k=${topK}`, {
      method: 'GET',
      skipAuth: true
    });
    return Array.isArray(res) ? res : (res?.rankings || []);
  } catch {
    return [];
  }
}

export async function fetchDecayRisks(topK: number = 10): Promise<KnowledgeDecayNode[]> {
  try {
    const res = await apiFetch<any>(`/api/gacm/decay-risks?top_k=${topK}`, {
      method: 'GET',
      skipAuth: true
    });
    return Array.isArray(res) ? res : [];
  } catch {
    return [];
  }
}

export async function fetchCommunities(): Promise<CommunityCluster[]> {
  try {
    const res = await apiFetch<any>('/api/gacm/communities', {
      method: 'GET',
      skipAuth: true
    });
    return Array.isArray(res) ? res : (res?.communities || []);
  } catch {
    return [];
  }
}

export async function fetchProvenancePath(facultyName: string, projectId: string): Promise<{ nodes: GACMNode[]; edges: GACMEdge[] }> {
  const encodedFaculty = encodeURIComponent(facultyName);
  const encodedProject = encodeURIComponent(projectId);
  return apiFetch<{ nodes: GACMNode[]; edges: GACMEdge[] }>(
    `/api/gacm/provenance-path?faculty_name=${encodedFaculty}&project_id=${encodedProject}`,
    { method: 'GET', skipAuth: true }
  );
}

export async function fetchProjects(skip: number = 0, limit: number = 20, search: string = ''): Promise<{ total: number; skip: number; limit: number; items: any[] }> {
  const queryParams = new URLSearchParams({
    skip: String(skip),
    limit: String(limit),
    search: search.trim()
  });
  return apiFetch<{ total: number; skip: number; limit: number; items: any[] }>(
    `/api/gacm/projects?${queryParams.toString()}`,
    { method: 'GET', skipAuth: true }
  );
}

export async function fetchProjectTopics(): Promise<any[]> {
  return apiFetch<any[]>('/api/gacm/topics', { method: 'GET', skipAuth: true });
}

export async function saveChatSession(payload: { query_text: string; synthesized_answer: string; citations: any[]; graph_nodes: any[]; graph_edges?: any[]; confidence_score?: number }): Promise<any> {
  return apiFetch<any>('/api/gacm/chat-history', {
    method: 'POST',
    body: JSON.stringify(payload),
    skipAuth: true
  });
}

export async function fetchChatHistory(): Promise<any[]> {
  try {
    return await apiFetch<any[]>('/api/gacm/chat-history', { method: 'GET', skipAuth: true });
  } catch {
    return [];
  }
}

export async function deleteChatSession(sessionId: number): Promise<any> {
  try {
    return await apiFetch<any>(`/api/gacm/chat-history/${sessionId}`, { method: 'DELETE', skipAuth: true });
  } catch {
    return { status: 'error' };
  }
}

export async function fetchTopicComments(topicId: number): Promise<any[]> {
  return apiFetch<any[]>(`/api/gacm/topics/${topicId}/comments`, { method: 'GET', skipAuth: true });
}

export async function postTopicComment(topicId: number, payload: { author_name: string; role_label?: string; comment_text: string }): Promise<any> {
  return apiFetch<any>(`/api/gacm/topics/${topicId}/comments`, {
    method: 'POST',
    body: JSON.stringify(payload),
    skipAuth: true
  });
}
