'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import GraphVisualizer from '@/components/gacm/GraphVisualizer';
import HybridQueryBar from '@/components/gacm/HybridQueryBar';
import KnowledgeDecayAlerts from '@/components/gacm/KnowledgeDecayAlerts';
import ExpertRankingsTable from '@/components/gacm/ExpertRankingsTable';
import CommunityClusters from '@/components/gacm/CommunityClusters';
import {
  fetchGACMQuery,
  fetchExpertRankings,
  fetchDecayRisks,
  fetchCommunities,
  fetchProvenancePath,
  fetchChatHistory,
  saveChatSession,
  deleteChatSession
} from '@/lib/gacmApi';
import {
  GACMNode,
  GACMEdge,
  GACMQueryResponse,
  ExpertRanking,
  KnowledgeDecayNode,
  CommunityCluster
} from '@/types/gacm';
import {
  Network,
  Award,
  ShieldAlert,
  Layers,
  Search,
  ChevronRight,
  Sparkles,
  Database,
  X,
  Info,
  History,
  Trash2
} from '@/components/gacm/Icons';

type SectionType = 'search' | 'history' | 'experts' | 'spof' | 'communities' | 'stats' | null;

export default function GACMPage() {
  const { user } = useAuth();
  const isEnterprise = Boolean(user && user.tenant_id && user.tenant_id !== 'utc_campus');

  const [activeSection, setActiveSection] = useState<SectionType>('search');
  
  const [nodes, setNodes] = useState<GACMNode[]>([]);
  const [edges, setEdges] = useState<GACMEdge[]>([]);
  const [highlightIds, setHighlightIds] = useState<string[]>([]);
  
  const [queryResult, setQueryResult] = useState<GACMQueryResponse | null>(null);
  const [isQueryLoading, setIsQueryLoading] = useState(false);

  const [expertRankings, setExpertRankings] = useState<ExpertRanking[]>([]);
  const [decayNodes, setDecayNodes] = useState<KnowledgeDecayNode[]>([]);
  const [communities, setCommunities] = useState<CommunityCluster[]>([]);
  const [chatHistory, setChatHistory] = useState<any[]>([]);
  const [isDataLoading, setIsDataLoading] = useState(true);

  // Load initial graph stats, algorithm data & saved PostgreSQL AI chat history
  useEffect(() => {
    async function loadInitialData() {
      setIsDataLoading(true);
      const isEnterpriseTenant = Boolean(user && user.tenant_id && user.tenant_id !== 'utc_campus');
      const initialQueryText = isEnterpriseTenant
        ? 'telecom network cell outage incident'
        : 'oceanography marine research';
      
      // 1. Fetch initial default graph query FIRST to guarantee Cytoscape visualization
      try {
        const defaultQuery = await fetchGACMQuery(initialQueryText, 5);
        if (defaultQuery && defaultQuery.graph_nodes && defaultQuery.graph_nodes.length > 0) {
          setQueryResult(defaultQuery);
          setNodes(defaultQuery.graph_nodes || []);
          setEdges(defaultQuery.graph_edges || []);
        } else {
          if (isEnterpriseTenant) {
            const fallbackNodes: GACMNode[] = [
              { id: 'emp_1', type: 'Employee', label: 'Lead RF Engineer', properties: { name: 'Lead RF Engineer', department: 'Radio Access Network' } },
              { id: 'site_1', type: 'NetworkSite', label: 'Cell Site Alpha-12', properties: { site_name: 'Cell Site Alpha-12', site_code: 'SITE-012' } },
              { id: 'evt_1', type: 'NetworkEvent', label: 'Degraded Throughput Event', properties: { event_type: 'Throughput Drop', severity: 'HIGH' } },
              { id: 'tkt_1', type: 'ServiceTicket', label: 'INC-2024-9901', properties: { ticket_number: 'INC-2024-9901', status: 'IN_PROGRESS' } },
              { id: 'dept_1', type: 'Department', label: 'Field Operations', properties: { name: 'Field Operations' } }
            ];
            const fallbackEdges: GACMEdge[] = [
              { id: 'e_1', source: 'emp_1', target: 'tkt_1', relation: 'ASSIGNED_TO' },
              { id: 'e_2', source: 'tkt_1', target: 'site_1', relation: 'AFFECTS' },
              { id: 'e_3', source: 'evt_1', target: 'site_1', relation: 'OCCURRED_AT' },
              { id: 'e_4', source: 'emp_1', target: 'dept_1', relation: 'BELONGS_TO' }
            ];
            setNodes(fallbackNodes);
            setEdges(fallbackEdges);
          } else {
            const fallbackNodes: GACMNode[] = [
              { id: 'f_1', type: 'Faculty', label: 'Dr. Jane Smith (UTC PI)', properties: { name: 'Dr. Jane Smith (UTC PI)' } },
              { id: 'p_1', type: 'Project', label: 'NSF Oceanography Research', properties: { title: 'NSF Oceanography Research' } },
              { id: 'd_1', type: 'Department', label: 'Department of Marine Sciences', properties: { name: 'Department of Marine Sciences' } },
              { id: 'm_1', type: 'Meeting', label: 'Academic Advisory Senate Agenda', properties: { title: 'Academic Advisory Senate Agenda' } }
            ];
            const fallbackEdges: GACMEdge[] = [
              { id: 'e_1', source: 'f_1', target: 'p_1', relation: 'PRINCIPAL_INVESTIGATOR' },
              { id: 'e_2', source: 'p_1', target: 'd_1', relation: 'HOSTED_BY' },
              { id: 'e_3', source: 'f_1', target: 'm_1', relation: 'SPEAKER_AT' }
            ];
            setNodes(fallbackNodes);
            setEdges(fallbackEdges);
          }
        }
      } catch (err) {
        console.warn('Initial Graph Fetch Note:', err);
        if (isEnterpriseTenant) {
          const fallbackNodes: GACMNode[] = [
            { id: 'emp_1', type: 'Employee', label: 'Lead RF Engineer', properties: { name: 'Lead RF Engineer', department: 'Radio Access Network' } },
            { id: 'site_1', type: 'NetworkSite', label: 'Cell Site Alpha-12', properties: { site_name: 'Cell Site Alpha-12', site_code: 'SITE-012' } },
            { id: 'tkt_1', type: 'ServiceTicket', label: 'INC-2024-9901', properties: { ticket_number: 'INC-2024-9901', status: 'IN_PROGRESS' } }
          ];
          const fallbackEdges: GACMEdge[] = [
            { id: 'e_1', source: 'emp_1', target: 'tkt_1', relation: 'ASSIGNED_TO' },
            { id: 'e_2', source: 'tkt_1', target: 'site_1', relation: 'AFFECTS' }
          ];
          setNodes(fallbackNodes);
          setEdges(fallbackEdges);
        } else {
          const fallbackNodes: GACMNode[] = [
            { id: 'f_1', type: 'Faculty', label: 'Dr. Jane Smith (UTC PI)', properties: { name: 'Dr. Jane Smith (UTC PI)' } },
            { id: 'p_1', type: 'Project', label: 'NSF Oceanography Research', properties: { title: 'NSF Oceanography Research' } },
            { id: 'd_1', type: 'Department', label: 'Department of Marine Sciences', properties: { name: 'Department of Marine Sciences' } }
          ];
          const fallbackEdges: GACMEdge[] = [
            { id: 'e_1', source: 'f_1', target: 'p_1', relation: 'PRINCIPAL_INVESTIGATOR' },
            { id: 'e_2', source: 'p_1', target: 'd_1', relation: 'HOSTED_BY' }
          ];
          setNodes(fallbackNodes);
          setEdges(fallbackEdges);
        }
      }

      // 2. Fetch algorithm & sidebar stats with safe catch fallbacks
      try {
        const [expertsData, decayData, commData, historyData] = await Promise.all([
          fetchExpertRankings(10).catch(() => []),
          fetchDecayRisks(10).catch(() => []),
          fetchCommunities().catch(() => []),
          fetchChatHistory().catch(() => [])
        ]);
        setExpertRankings(expertsData || []);
        setDecayNodes(decayData || []);
        setCommunities(commData || []);
        setChatHistory(historyData || []);
      } catch (err) {
        console.warn('GACM Initial Load Warning:', err);
      } finally {
        setIsDataLoading(false);
      }
    }
    loadInitialData();
  }, [user?.tenant_id]);

  // Execute hybrid query & save to PostgreSQL DB
  const handleQuery = async (queryText: string) => {
    setIsQueryLoading(true);
    try {
      const res = await fetchGACMQuery(queryText, 5);
      setQueryResult(res);
      
      // If query was flagged by security guardrails as out-of-scope:
      if (res.is_out_of_scope) {
        setNodes([]);
        setEdges([]);
        setHighlightIds([]);
        return;
      }

      let finalNodes: GACMNode[] = res.graph_nodes || [];
      let finalEdges: GACMEdge[] = res.graph_edges || [];
      const citations = res.pgvector_citations || res.vector_citations || res.matched_citations || [];

      if (finalNodes.length > 0) {
        setNodes(finalNodes);
        setEdges(finalEdges);
        setHighlightIds(finalNodes.map(n => String(n.id)));
      } else if (citations.length > 0) {
        // Build graph nodes from citations if graph_nodes was empty
        const generatedNodes: GACMNode[] = [];
        const generatedEdges: GACMEdge[] = [];
        citations.forEach((c: any, i: number) => {
          if (isEnterprise) {
            const eid = `emp_${i}`;
            const tid = `tkt_${i}`;
            const sid = `site_${i}`;
            generatedNodes.push(
              { id: eid, type: 'Employee', label: c.faculty_name || c.assignee || 'Field Technician', properties: { name: c.faculty_name || c.assignee, department: c.department || c.institution } },
              { id: tid, type: 'ServiceTicket', label: (c.project_title || c.title || 'Incident').substring(0, 25), properties: { title: c.project_title, ticket_number: c.grant_id, abstract: c.abstract_snippet } },
              { id: sid, type: 'NetworkSite', label: (c.institution || c.vendor || 'Tower Site').substring(0, 22), properties: { site_name: c.institution || 'Tower Site' } }
            );
            generatedEdges.push(
              { id: `e_et_${i}`, source: eid, target: tid, relation: 'ASSIGNED_TO' },
              { id: `e_ts_${i}`, source: tid, target: sid, relation: 'AFFECTS' }
            );
          } else {
            const fid = `fac_${i}`;
            const pid = `proj_${i}`;
            const did = `dept_${i}`;
            generatedNodes.push(
              { id: fid, type: 'Faculty', label: c.faculty_name || 'Faculty PI', properties: { name: c.faculty_name, institution: c.institution } },
              { id: pid, type: 'Project', label: (c.project_title || 'Project').substring(0, 25), properties: { title: c.project_title, amount: c.award_amount, abstract: c.abstract_snippet } },
              { id: did, type: 'Department', label: (c.institution || 'Department').substring(0, 22), properties: { name: c.institution } }
            );
            generatedEdges.push(
              { id: `e_fp_${i}`, source: fid, target: pid, relation: 'PRINCIPAL_INVESTIGATOR' },
              { id: `e_pd_${i}`, source: pid, target: did, relation: 'HOSTED_BY' }
            );
          }
        });
        finalNodes = generatedNodes;
        finalEdges = generatedEdges;
        setNodes(finalNodes);
        setEdges(finalEdges);
        setHighlightIds(finalNodes.map(n => String(n.id)));
      }

      // Save valid AI Chat Session to PostgreSQL Database
      await saveChatSession({
        query_text: queryText,
        synthesized_answer: res.synthesized_answer,
        citations: citations,
        graph_nodes: finalNodes,
        graph_edges: finalEdges,
        confidence_score: res.confidence_score || 1.0
      });

      // Refresh chat history list
      const updatedHistory = await fetchChatHistory();
      setChatHistory(updatedHistory || []);
    } catch (err) {
      console.error('Failed to execute GACM query:', err);
    } finally {
      setIsQueryLoading(false);
    }
  };

  // Select faculty or specialist to highlight provenance lineage path
  const handleSelectFaculty = async (facultyName: string) => {
    try {
      const targetEntity = isEnterprise ? 'SITE-001' : 'project_6600024';
      const res = await fetchProvenancePath(facultyName, targetEntity);
      if (res && res.nodes) {
        setNodes(prev => [...prev, ...res.nodes]);
        setEdges(prev => [...prev, ...res.edges]);
        setHighlightIds(res.nodes.map(n => String(n.id)));
      }
    } catch (err) {
      console.warn('Provenance path warning:', err);
    }
  };

  // Reload past saved AI chat session into view
  const handleReloadSession = (session: any) => {
    const query = session.query_text || session.query || '';
    const answer = session.synthesized_answer || session.answer || '';
    const citations = session.citations || session.pgvector_citations || session.vector_citations || [];
    let activeNodes: GACMNode[] = session.graph_nodes || [];
    let activeEdges: GACMEdge[] = session.graph_edges || session.edges || [];

    // If edges are missing, reconstruct them from citations or nodes
    if (activeEdges.length === 0 && citations.length > 0) {
      const generatedNodes: GACMNode[] = [];
      const generatedEdges: GACMEdge[] = [];
      citations.forEach((c: any, i: number) => {
        if (isEnterprise) {
          const eid = `emp_${i}`;
          const tid = `tkt_${i}`;
          const sid = `site_${i}`;
          generatedNodes.push(
            { id: eid, type: 'Employee', label: c.faculty_name || c.assignee || 'Field Technician', properties: { name: c.faculty_name || c.assignee, department: c.department || c.institution } },
            { id: tid, type: 'ServiceTicket', label: (c.project_title || c.title || 'Incident').substring(0, 25), properties: { title: c.project_title, ticket_number: c.grant_id, abstract: c.abstract_snippet } },
            { id: sid, type: 'NetworkSite', label: (c.institution || c.vendor || 'Tower Site').substring(0, 22), properties: { site_name: c.institution || 'Tower Site' } }
          );
          generatedEdges.push(
            { id: `e_et_${i}`, source: eid, target: tid, relation: 'ASSIGNED_TO' },
            { id: `e_ts_${i}`, source: tid, target: sid, relation: 'AFFECTS' }
          );
        } else {
          const fid = `fac_${i}`;
          const pid = `proj_${i}`;
          const did = `dept_${i}`;
          generatedNodes.push(
            { id: fid, type: 'Faculty', label: c.faculty_name || 'Faculty PI', properties: { name: c.faculty_name, institution: c.institution } },
            { id: pid, type: 'Project', label: (c.project_title || 'Project').substring(0, 25), properties: { title: c.project_title, amount: c.award_amount, abstract: c.abstract_snippet } },
            { id: did, type: 'Department', label: (c.institution || 'Department').substring(0, 22), properties: { name: c.institution } }
          );
          generatedEdges.push(
            { id: `e_fp_${i}`, source: fid, target: pid, relation: 'PRINCIPAL_INVESTIGATOR' },
            { id: `e_pd_${i}`, source: pid, target: did, relation: 'HOSTED_BY' }
          );
        }
      });
      if (activeNodes.length === 0) {
        activeNodes = generatedNodes;
      }
      activeEdges = generatedEdges;
    } else if (activeEdges.length === 0 && activeNodes.length > 0) {
      // Reconstruct edges from active nodes
      const faculties = activeNodes.filter(n => n.type === 'Faculty' || n.type === 'Employee');
      const projects = activeNodes.filter(n => n.type === 'Project' || n.type === 'Meeting' || n.type === 'ServiceTicket');
      const departments = activeNodes.filter(n => n.type === 'Department' || n.type === 'NetworkSite');

      projects.forEach((p, idx) => {
        const fac = faculties[idx % faculties.length];
        const dept = departments[idx % departments.length];
        if (fac) {
          activeEdges.push({
            id: `edge-${fac.id}-${p.id}`,
            source: String(fac.id),
            target: String(p.id),
            relation: p.type === 'ServiceTicket' ? 'ASSIGNED_TO' : (p.type === 'Meeting' ? 'SPEAKER_AT' : 'PRINCIPAL_INVESTIGATOR')
          });
        }
        if (dept) {
          activeEdges.push({
            id: `edge-${p.id}-${dept.id}`,
            source: String(p.id),
            target: String(dept.id),
            relation: p.type === 'ServiceTicket' ? 'AFFECTS' : 'HOSTED_BY'
          });
        }
      });
    }

    setQueryResult({
      query: query,
      synthesized_answer: answer,
      pgvector_citations: citations,
      vector_citations: citations,
      graph_nodes: activeNodes,
      graph_edges: activeEdges,
      provenance_path: { nodes: [], edges: [] },
      confidence_score: session.confidence_score || 1.0,
      is_out_of_scope: false
    });

    if (activeNodes.length > 0) {
      setNodes(activeNodes);
      setEdges(activeEdges);
      const primaryIds = activeNodes
        .filter(n => n.type === 'Faculty' || n.type === 'Employee')
        .map(n => String(n.id));
      setHighlightIds(primaryIds.length > 0 ? primaryIds : [String(activeNodes[0].id)]);
    }
    setActiveSection('search');
  };

  // Delete chat session from database
  const handleDeleteSession = async (sessionId: number) => {
    try {
      await deleteChatSession(sessionId);
      const updatedHistory = await fetchChatHistory();
      setChatHistory(updatedHistory || []);
    } catch (err) {
      console.error('Failed to delete chat session:', err);
    }
  };

  // Toggle section drawer open/close
  const toggleSection = (section: SectionType) => {
    if (activeSection === section) {
      setActiveSection(null);
    } else {
      setActiveSection(section);
    }
  };

  return (
    <div className="relative w-full h-[calc(100vh-64px)] overflow-hidden bg-slate-950 font-sans flex">
      
      {/* 1. BACKGROUND LAYER: Full Viewport Cytoscape Knowledge Graph */}
      <div className="absolute inset-0 w-full h-full z-0">
        <GraphVisualizer
          nodes={nodes}
          edges={edges}
          highlightNodeIds={highlightIds}
          canvasHeight="h-full"
          className="w-full h-full border-none"
        />
      </div>

      {/* 2. PRIMARY LEFT NAVIGATION SIDEBAR (Tier 1 Column - AgriAssist Style) */}
      <div className="relative z-20 w-64 bg-[#070b14]/95 backdrop-blur-xl border-r border-cyan-500/20 shadow-2xl flex flex-col justify-between text-white p-4 shrink-0">
        
        <div className="space-y-5">
          {/* Brand Header */}
          <div className="border-b border-slate-800 pb-3.5">
            <div className="flex items-center gap-2 mb-1.5">
              <span className="bg-cyan-950/60 text-cyan-300 border border-cyan-500/40 text-[9px] font-mono uppercase font-bold tracking-widest px-2.5 py-0.5 rounded-full">
                Memgraph + Groq AI
              </span>
            </div>
            <h1 className="text-base font-extrabold text-white tracking-tight flex items-center gap-2">
              <Network className="w-5 h-5 text-cyan-400" /> {isEnterprise ? 'Mnemograph Enterprise' : 'GACM Explorer'}
            </h1>
            <p className="text-[11px] text-slate-400 mt-0.5">
              {isEnterprise ? `Multi-Tenant Graph (${user?.tenant_id || 'Active'})` : 'Institutional Knowledge Base'}
            </p>
          </div>

          {/* Section Selection Menu (Click opens subsection drawer) */}
          <div className="space-y-1.5">
            <span className="text-[10px] uppercase font-mono font-bold text-slate-500 tracking-wider block mb-2 px-1">
              Dashboard Sections
            </span>

            <button
              onClick={() => toggleSection('search')}
              className={`w-full text-left py-2.5 px-3 text-xs font-bold transition-all flex items-center justify-between border rounded-lg cursor-pointer ${
                activeSection === 'search'
                  ? 'btn-primary-cyan text-white border-cyan-400 shadow-[0_0_15px_rgba(6,182,212,0.35)]'
                  : 'bg-slate-900/60 text-slate-300 border-slate-800 hover:bg-slate-800/60 hover:text-white hover:border-cyan-500/30'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Search className="w-4 h-4 text-cyan-400" />
                <span>AI Hybrid Search</span>
              </div>
              <ChevronRight className={`w-3.5 h-3.5 transition-transform ${activeSection === 'search' ? 'rotate-90 text-cyan-300' : ''}`} />
            </button>

            <button
              onClick={() => toggleSection('history')}
              className={`w-full text-left py-2.5 px-3 text-xs font-bold transition-all flex items-center justify-between border rounded-lg cursor-pointer ${
                activeSection === 'history'
                  ? 'btn-primary-cyan text-white border-cyan-400 shadow-[0_0_15px_rgba(6,182,212,0.35)]'
                  : 'bg-slate-900/60 text-slate-300 border-slate-800 hover:bg-slate-800/60 hover:text-white hover:border-cyan-500/30'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <History className="w-4 h-4 text-cyan-400" />
                <span>Saved AI Chats ({chatHistory.length})</span>
              </div>
              <ChevronRight className={`w-3.5 h-3.5 transition-transform ${activeSection === 'history' ? 'rotate-90 text-cyan-300' : ''}`} />
            </button>

            <button
              onClick={() => toggleSection('experts')}
              className={`w-full text-left py-2.5 px-3 text-xs font-bold transition-all flex items-center justify-between border rounded-lg cursor-pointer ${
                activeSection === 'experts'
                  ? 'btn-primary-cyan text-white border-cyan-400 shadow-[0_0_15px_rgba(6,182,212,0.35)]'
                  : 'bg-slate-900/60 text-slate-300 border-slate-800 hover:bg-slate-800/60 hover:text-white hover:border-cyan-500/30'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Award className="w-4 h-4 text-cyan-400" />
                <span>{isEnterprise ? 'Specialist PageRank' : 'Expert Rankings'}</span>
              </div>
              <ChevronRight className={`w-3.5 h-3.5 transition-transform ${activeSection === 'experts' ? 'rotate-90 text-cyan-300' : ''}`} />
            </button>

            <button
              onClick={() => toggleSection('spof')}
              className={`w-full text-left py-2.5 px-3 text-xs font-bold transition-all flex items-center justify-between border rounded-lg cursor-pointer ${
                activeSection === 'spof'
                  ? 'bg-rose-600 text-white border-rose-500 shadow-[0_0_15px_rgba(244,63,94,0.4)]'
                  : 'bg-slate-900/60 text-slate-300 border-slate-800 hover:bg-slate-800/60 hover:text-white hover:border-rose-500/40'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <ShieldAlert className="w-4 h-4 text-rose-400" />
                <span>{isEnterprise ? 'Operational SPOF Risks' : 'SPOF Knowledge Risks'}</span>
              </div>
              <ChevronRight className={`w-3.5 h-3.5 transition-transform ${activeSection === 'spof' ? 'rotate-90 text-rose-300' : ''}`} />
            </button>

            <button
              onClick={() => toggleSection('communities')}
              className={`w-full text-left py-2.5 px-3 text-xs font-bold transition-all flex items-center justify-between border rounded-lg cursor-pointer ${
                activeSection === 'communities'
                  ? 'bg-purple-600 text-white border-purple-500 shadow-[0_0_15px_rgba(168,85,247,0.4)]'
                  : 'bg-slate-900/60 text-slate-300 border-slate-800 hover:bg-slate-800/60 hover:text-white hover:border-purple-500/40'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Layers className="w-4 h-4 text-purple-400" />
                <span>{isEnterprise ? 'Operational Clusters' : 'Research Clusters'}</span>
              </div>
              <ChevronRight className={`w-3.5 h-3.5 transition-transform ${activeSection === 'communities' ? 'rotate-90 text-purple-300' : ''}`} />
            </button>

            <button
              onClick={() => toggleSection('stats')}
              className={`w-full text-left py-2.5 px-3 text-xs font-bold transition-all flex items-center justify-between border rounded-lg cursor-pointer ${
                activeSection === 'stats'
                  ? 'bg-emerald-600 text-white border-emerald-500 shadow-[0_0_15px_rgba(160,185,129,0.4)]'
                  : 'bg-slate-900/60 text-slate-300 border-slate-800 hover:bg-slate-800/60 hover:text-white hover:border-emerald-500/40'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Database className="w-4 h-4 text-emerald-400" />
                <span>System Statistics</span>
              </div>
              <ChevronRight className={`w-3.5 h-3.5 transition-transform ${activeSection === 'stats' ? 'rotate-90 text-emerald-300' : ''}`} />
            </button>
          </div>
        </div>

        {/* Quick System Summary Pills at bottom of Tier 1 */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3 space-y-1.5 text-[11px] text-slate-400">
          <div className="flex justify-between items-center">
            <span>Graph Nodes:</span>
            <span className="font-mono font-bold text-cyan-400">28,863</span>
          </div>
          <div className="flex justify-between items-center">
            <span>{isEnterprise ? 'Technician Entities:' : 'Faculty Entities:'}</span>
            <span className="font-mono font-bold text-white">5,756</span>
          </div>
          <div className="flex justify-between items-center">
            <span>384d Vectors:</span>
            <span className="font-mono font-bold text-emerald-400">21,422</span>
          </div>
        </div>
      </div>

      {/* 3. FLOATING SECONDARY SUBSECTION DRAWER (Tier 2 Column - Slide-Out Drawer) */}
      {activeSection && (
        <div className="relative z-20 w-[420px] bg-[#0c1427]/95 backdrop-blur-2xl text-slate-100 border-r border-cyan-500/20 shadow-[0_20px_60px_rgba(0,0,0,0.8)] flex flex-col h-full overflow-hidden transition-all duration-300 animate-in slide-in-from-left">
          
          {/* Drawer Header */}
          <div className="bg-[#070b14]/90 p-4 text-white border-b border-cyan-500/20 flex items-center justify-between shrink-0">
            <div>
              <h3 className="font-bold text-sm text-cyan-300 flex items-center gap-2">
                {activeSection === 'search' && <><Search className="w-4 h-4 text-cyan-400" /> AI Hybrid Query & Vector Search</>}
                {activeSection === 'history' && <><History className="w-4 h-4 text-cyan-400" /> Saved AI Chat Sessions (PostgreSQL)</>}
                {activeSection === 'experts' && <><Award className="w-4 h-4 text-cyan-400" /> {isEnterprise ? 'Specialist PageRank Leaderboard' : 'PageRank Expert Leaderboard'}</>}
                {activeSection === 'spof' && <><ShieldAlert className="w-4 h-4 text-rose-400" /> {isEnterprise ? 'Operational Incident SPOF Risks' : 'SPOF Knowledge Decay Risks'}</>}
                {activeSection === 'communities' && <><Layers className="w-4 h-4 text-purple-400" /> {isEnterprise ? 'Department Operational Clusters' : 'Louvain Research Communities'}</>}
                {activeSection === 'stats' && <><Database className="w-4 h-4 text-emerald-400" /> System Multi-Store Metrics</>}
              </h3>
              <p className="text-[10px] text-slate-400 mt-0.5">
                {activeSection === 'search' && 'Real-time vector matching & Groq AI synthesis'}
                {activeSection === 'history' && 'Persisted in PostgreSQL database gacm_chat_sessions table'}
                {activeSection === 'experts' && (isEnterprise ? 'Ranked by ticket resolution & network centrality' : 'Ranked by graph network centrality (CALL pagerank.get())')}
                {activeSection === 'spof' && (isEnterprise ? 'Flagged solo operational incident assignments' : 'Flagged single-speaker undocumented knowledge risks')}
                {activeSection === 'communities' && (isEnterprise ? 'Cluster detection across departments & operational incidents' : 'Louvain modularity research cluster detection')}
                {activeSection === 'stats' && 'Memgraph Bolt 7687 & PostgreSQL 5432 metrics'}
              </p>
            </div>
            <button
              onClick={() => setActiveSection(null)}
              title="Close Subsection Drawer"
              className="text-slate-400 hover:text-white p-1 hover:bg-slate-800/60 rounded-lg transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Drawer Inner Scrollable Content */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {activeSection === 'search' && (
              <div className="space-y-3">
                <HybridQueryBar
                  onExecuteQuery={handleQuery}
                  queryResult={queryResult}
                  isLoading={isQueryLoading}
                  placeholder={isEnterprise ? "Query telecom operations, cell towers, outage events, or tickets..." : "Ask GACM AI: e.g. 'Who are top experts in Oceanography and coastal systems?'..."}
                />
              </div>
            )}

            {activeSection === 'history' && (
              <div className="space-y-3 text-xs">
                {chatHistory.length === 0 ? (
                  <div className="py-12 text-center text-slate-500">
                    No saved AI chat sessions in PostgreSQL database yet. Submit a query to save it automatically!
                  </div>
                ) : (
                  chatHistory.map((sess) => (
                    <div
                      key={sess.id}
                      onClick={() => handleReloadSession(sess)}
                      className="bg-slate-900/80 border border-slate-800 hover:border-cyan-400/40 p-3.5 rounded-xl shadow-sm hover:shadow-[0_0_15px_rgba(14,165,233,0.15)] transition-all cursor-pointer space-y-2 group relative"
                    >
                      <div className="flex justify-between items-center text-[10px] text-slate-400">
                        <span className="font-mono font-bold text-cyan-300 bg-cyan-950/60 px-2 py-0.5 rounded border border-cyan-500/30">
                          DB Session #{sess.id}
                        </span>
                        <div className="flex items-center gap-2">
                          <span>{sess.created_at ? new Date(sess.created_at).toLocaleDateString() : 'Recent'}</span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteSession(sess.id);
                            }}
                            className="text-slate-500 hover:text-rose-400 p-1 rounded hover:bg-slate-800 transition-colors"
                            title="Delete this session from PostgreSQL"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                      <h4 className="font-bold text-white text-xs group-hover:text-cyan-300 line-clamp-2 leading-snug">
                        &ldquo;{sess.query_text || sess.query}&rdquo;
                      </h4>
                      <p className="text-slate-400 text-[11px] line-clamp-2 leading-relaxed">
                        {sess.synthesized_answer || sess.answer}
                      </p>
                      <div className="pt-2 border-t border-slate-800 flex justify-between items-center text-[10px] text-slate-400 font-mono">
                        <span className="flex items-center gap-1.5">
                          <span className="text-cyan-400 font-semibold">📌 {sess.citations?.length || (sess.pgvector_citations?.length || 0)} citations</span>
                          <span>•</span>
                          <span className="text-purple-400 font-semibold">🕸️ {sess.graph_nodes?.length || 0} nodes</span>
                        </span>
                        <span className="text-cyan-400 font-bold group-hover:underline flex items-center gap-1">
                          Reload Session →
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {activeSection === 'experts' && (
              <div>
                {isDataLoading ? (
                  <div className="py-12 text-center text-slate-500 text-xs">
                    Loading PageRank Leaderboard...
                  </div>
                ) : (
                  <ExpertRankingsTable
                    rankings={expertRankings}
                    onSelectFaculty={handleSelectFaculty}
                  />
                )}
              </div>
            )}

            {activeSection === 'spof' && (
              <div>
                {isDataLoading ? (
                  <div className="py-12 text-center text-slate-500 text-xs">
                    Loading SPOF Risk Alerts...
                  </div>
                ) : (
                  <KnowledgeDecayAlerts
                    decayNodes={decayNodes}
                    onSelectFaculty={handleSelectFaculty}
                  />
                )}
              </div>
            )}

            {activeSection === 'communities' && (
              <div>
                {isDataLoading ? (
                  <div className="py-12 text-center text-slate-500 text-xs">
                    Loading Louvain Research Clusters...
                  </div>
                ) : (
                  <CommunityClusters communities={communities} />
                )}
              </div>
            )}

            {activeSection === 'stats' && (
              <div className="space-y-4 text-xs">
                <div className="glass-card p-3.5 border border-cyan-500/20">
                  <h4 className="font-bold text-white flex items-center gap-1.5 mb-2">
                    <Info className="w-4 h-4 text-cyan-400" /> Memgraph Knowledge Graph
                  </h4>
                  <ul className="space-y-1.5 text-slate-300 text-[11px]">
                    <li>• Total Graph Nodes: <span className="font-bold text-cyan-300">28,863</span></li>
                    <li>• Unique Faculty Entities: <span className="font-bold text-white">5,756</span></li>
                    <li>• Directed Relationships: <span className="font-bold text-cyan-300">33,627</span></li>
                    <li>• Database Driver: <span className="font-bold text-emerald-400">Bolt://127.0.0.1:7687</span></li>
                  </ul>
                </div>

                <div className="glass-card p-3.5 border border-cyan-500/20">
                  <h4 className="font-bold text-white flex items-center gap-1.5 mb-2">
                    <Database className="w-4 h-4 text-sky-400" /> PostgreSQL Vector & Chat Store
                  </h4>
                  <ul className="space-y-1.5 text-slate-300 text-[11px]">
                    <li>• 384d BAAI/bge-small Vectors: <span className="font-bold text-cyan-300">21,422</span></li>
                    <li>• Saved AI Chat Sessions: <span className="font-bold text-white">{chatHistory.length}</span></li>
                    <li>• NSF Research Awards: <span className="font-bold text-cyan-300">18,500</span></li>
                    <li>• MISeD Meeting Dialog Turns: <span className="font-bold text-cyan-300">2,922</span></li>
                    <li>• Database Connection: <span className="font-bold text-emerald-400">PostgreSQL (Neon Lakehouse)</span></li>
                  </ul>
                </div>

                <div className="glass-card p-3.5 border border-cyan-500/20">
                  <h4 className="font-bold text-white flex items-center gap-1.5 mb-2">
                    <Sparkles className="w-4 h-4 text-cyan-400" /> Groq AI LLM Engine
                  </h4>
                  <ul className="space-y-1.5 text-slate-300 text-[11px]">
                    <li>• Primary Reasoning Model: <span className="font-bold text-cyan-300">qwen/qwen3.8-27b</span></li>
                    <li>• Secondary Fallback Model: <span className="font-bold text-white">llama-3.3-70b-versatile</span></li>
                    <li>• Context Type: <span className="font-bold text-emerald-400">Vector Evidence + Cypher Triples</span></li>
                  </ul>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

    </div>
  );
}
