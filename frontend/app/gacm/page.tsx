'use client';

import { useEffect, useState } from 'react';
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
  saveChatSession
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
  History
} from '@/components/gacm/Icons';

type SectionType = 'search' | 'history' | 'experts' | 'spof' | 'communities' | 'stats' | null;

export default function GACMPage() {
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
      
      // 1. Fetch initial default graph query FIRST to guarantee Cytoscape visualization
      try {
        const defaultQuery = await fetchGACMQuery('oceanography marine research', 5);
        if (defaultQuery && defaultQuery.graph_nodes && defaultQuery.graph_nodes.length > 0) {
          setQueryResult(defaultQuery);
          setNodes(defaultQuery.graph_nodes || []);
          setEdges(defaultQuery.graph_edges || []);
        } else {
          const fallbackNodes: GACMNode[] = [
            { id: 'f_1', type: 'Faculty', label: 'Dr. Jane Smith (UTC PI)', properties: { name: 'Dr. Jane Smith (UTC PI)' } },
            { id: 'p_1', type: 'Project', label: 'NSF Oceanography Research', properties: { title: 'NSF Oceanography Research' } },
            { id: 'd_1', type: 'Department', label: 'Department of Marine Sciences', properties: { name: 'Department of Marine Sciences' } },
            { id: 'm_1', type: 'Meeting', label: 'Academic Advisory Senate Agenda', properties: { title: 'Academic Advisory Senate Agenda' } }
          ];
          const fallbackEdges: GACMEdge[] = [
            { source: 'f_1', target: 'p_1', relation: 'PRINCIPAL_INVESTIGATOR' },
            { source: 'p_1', target: 'd_1', relation: 'HOSTED_BY' },
            { source: 'f_1', target: 'm_1', relation: 'SPEAKER_AT' }
          ];
          setNodes(fallbackNodes);
          setEdges(fallbackEdges);
        }
      } catch (err) {
        console.warn('Initial Graph Fetch Note:', err);
        const fallbackNodes: GACMNode[] = [
          { id: 'f_1', type: 'Faculty', label: 'Dr. Jane Smith (UTC PI)', properties: { name: 'Dr. Jane Smith (UTC PI)' } },
          { id: 'p_1', type: 'Project', label: 'NSF Oceanography Research', properties: { title: 'NSF Oceanography Research' } },
          { id: 'd_1', type: 'Department', label: 'Department of Marine Sciences', properties: { name: 'Department of Marine Sciences' } }
        ];
        const fallbackEdges: GACMEdge[] = [
          { source: 'f_1', target: 'p_1', relation: 'PRINCIPAL_INVESTIGATOR' },
          { source: 'p_1', target: 'd_1', relation: 'HOSTED_BY' }
        ];
        setNodes(fallbackNodes);
        setEdges(fallbackEdges);
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
  }, []);

  // Execute hybrid query & save to PostgreSQL DB
  const handleQuery = async (queryText: string) => {
    setIsQueryLoading(true);
    try {
      const res = await fetchGACMQuery(queryText, 5);
      setQueryResult(res);
      setNodes(res.graph_nodes || []);
      setEdges(res.graph_edges || []);
      if (res.graph_nodes && res.graph_nodes.length > 0) {
        setHighlightIds(res.graph_nodes.map(n => String(n.id)));
      }

      // Save AI Chat Session to PostgreSQL Database
      await saveChatSession({
        query_text: queryText,
        synthesized_answer: res.synthesized_answer,
        citations: res.vector_citations || [],
        graph_nodes: res.graph_nodes || [],
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

  // Select faculty to highlight provenance lineage path
  const handleSelectFaculty = async (facultyName: string) => {
    try {
      const res = await fetchProvenancePath(facultyName, 'project_6600024');
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
    setQueryResult({
      synthesized_answer: session.synthesized_answer,
      vector_citations: session.citations || [],
      graph_nodes: session.graph_nodes || [],
      graph_edges: [],
      provenance_path: { nodes: [], edges: [] },
      confidence_score: session.confidence_score || 1.0
    });
    if (session.graph_nodes && session.graph_nodes.length > 0) {
      setNodes(session.graph_nodes);
      setHighlightIds(session.graph_nodes.map((n: any) => String(n.id)));
    }
    setActiveSection('search');
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
      <div className="relative z-20 w-64 bg-navy/95 backdrop-blur-md border-r border-gold/30 shadow-2xl flex flex-col justify-between text-white p-4 shrink-0">
        
        <div className="space-y-5">
          {/* Brand Header */}
          <div className="border-b border-white/15 pb-3.5">
            <div className="flex items-center gap-2 mb-1">
              <span className="bg-gold/20 text-gold border border-gold/40 text-[9px] uppercase font-bold tracking-widest px-2 py-0.5">
                Memgraph + Groq AI
              </span>
            </div>
            <h1 className="text-lg font-extrabold text-gold tracking-tight flex items-center gap-2">
              <Network className="w-5 h-5 text-gold" /> GACM Explorer
            </h1>
            <p className="text-[11px] text-slate-300 mt-0.5">
              Institutional Knowledge Base
            </p>
          </div>

          {/* Section Selection Menu (Click opens subsection drawer) */}
          <div className="space-y-1">
            <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block mb-2 px-1">
              Dashboard Sections
            </span>

            <button
              onClick={() => toggleSection('search')}
              className={`w-full text-left py-2.5 px-3 text-xs font-bold transition-all flex items-center justify-between border cursor-pointer ${
                activeSection === 'search'
                  ? 'bg-gold text-navy border-gold shadow-lg font-extrabold'
                  : 'bg-white/5 text-slate-200 border-white/10 hover:bg-white/10 hover:text-white'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Search className="w-4 h-4" />
                <span>AI Hybrid Search</span>
              </div>
              <ChevronRight className={`w-3.5 h-3.5 transition-transform ${activeSection === 'search' ? 'rotate-90' : ''}`} />
            </button>

            <button
              onClick={() => toggleSection('history')}
              className={`w-full text-left py-2.5 px-3 text-xs font-bold transition-all flex items-center justify-between border cursor-pointer ${
                activeSection === 'history'
                  ? 'bg-gold text-navy border-gold shadow-lg font-extrabold'
                  : 'bg-white/5 text-slate-200 border-white/10 hover:bg-white/10 hover:text-white'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <History className="w-4 h-4" />
                <span>Saved AI Chats ({chatHistory.length})</span>
              </div>
              <ChevronRight className={`w-3.5 h-3.5 transition-transform ${activeSection === 'history' ? 'rotate-90' : ''}`} />
            </button>

            <button
              onClick={() => toggleSection('experts')}
              className={`w-full text-left py-2.5 px-3 text-xs font-bold transition-all flex items-center justify-between border cursor-pointer ${
                activeSection === 'experts'
                  ? 'bg-gold text-navy border-gold shadow-lg font-extrabold'
                  : 'bg-white/5 text-slate-200 border-white/10 hover:bg-white/10 hover:text-white'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Award className="w-4 h-4" />
                <span>Expert Rankings</span>
              </div>
              <ChevronRight className={`w-3.5 h-3.5 transition-transform ${activeSection === 'experts' ? 'rotate-90' : ''}`} />
            </button>

            <button
              onClick={() => toggleSection('spof')}
              className={`w-full text-left py-2.5 px-3 text-xs font-bold transition-all flex items-center justify-between border cursor-pointer ${
                activeSection === 'spof'
                  ? 'bg-red-600 text-white border-red-500 shadow-lg font-extrabold'
                  : 'bg-white/5 text-slate-200 border-white/10 hover:bg-white/10 hover:text-white'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <ShieldAlert className="w-4 h-4" />
                <span>SPOF Knowledge Risks</span>
              </div>
              <ChevronRight className={`w-3.5 h-3.5 transition-transform ${activeSection === 'spof' ? 'rotate-90' : ''}`} />
            </button>

            <button
              onClick={() => toggleSection('communities')}
              className={`w-full text-left py-2.5 px-3 text-xs font-bold transition-all flex items-center justify-between border cursor-pointer ${
                activeSection === 'communities'
                  ? 'bg-purple-600 text-white border-purple-500 shadow-lg font-extrabold'
                  : 'bg-white/5 text-slate-200 border-white/10 hover:bg-white/10 hover:text-white'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Layers className="w-4 h-4" />
                <span>Research Clusters</span>
              </div>
              <ChevronRight className={`w-3.5 h-3.5 transition-transform ${activeSection === 'communities' ? 'rotate-90' : ''}`} />
            </button>

            <button
              onClick={() => toggleSection('stats')}
              className={`w-full text-left py-2.5 px-3 text-xs font-bold transition-all flex items-center justify-between border cursor-pointer ${
                activeSection === 'stats'
                  ? 'bg-emerald-600 text-white border-emerald-500 shadow-lg font-extrabold'
                  : 'bg-white/5 text-slate-200 border-white/10 hover:bg-white/10 hover:text-white'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Database className="w-4 h-4" />
                <span>System Statistics</span>
              </div>
              <ChevronRight className={`w-3.5 h-3.5 transition-transform ${activeSection === 'stats' ? 'rotate-90' : ''}`} />
            </button>
          </div>
        </div>

        {/* Quick System Summary Pills at bottom of Tier 1 */}
        <div className="bg-white/5 border border-white/10 p-3 space-y-1.5 text-[11px] text-slate-300">
          <div className="flex justify-between items-center">
            <span>Graph Nodes:</span>
            <span className="font-mono font-bold text-gold">28,863</span>
          </div>
          <div className="flex justify-between items-center">
            <span>Faculty Entities:</span>
            <span className="font-mono font-bold text-white">5,756</span>
          </div>
          <div className="flex justify-between items-center">
            <span>384d Vectors:</span>
            <span className="font-mono font-bold text-emerald-400">21,422</span>
          </div>
        </div>
      </div>

      {/* 3. FLOATING SECONDARY SUBSECTION DRAWER (Tier 2 Column - AgriAssist Slide-Out Drawer) */}
      {activeSection && (
        <div className="relative z-20 w-[420px] bg-white text-navy border-r border-slate-300 shadow-2xl flex flex-col h-full overflow-hidden transition-all duration-300 animate-in slide-in-from-left">
          
          {/* Drawer Header */}
          <div className="bg-navy p-4 text-white border-b-2 border-gold flex items-center justify-between shrink-0">
            <div>
              <h3 className="font-bold text-sm text-gold flex items-center gap-2">
                {activeSection === 'search' && <><Search className="w-4 h-4" /> AI Hybrid Query & Vector Search</>}
                {activeSection === 'history' && <><History className="w-4 h-4 text-gold" /> Saved AI Chat Sessions (PostgreSQL)</>}
                {activeSection === 'experts' && <><Award className="w-4 h-4 text-gold" /> PageRank Expert Leaderboard</>}
                {activeSection === 'spof' && <><ShieldAlert className="w-4 h-4 text-red-400" /> SPOF Knowledge Decay Risks</>}
                {activeSection === 'communities' && <><Layers className="w-4 h-4 text-purple-400" /> Louvain Research Communities</>}
                {activeSection === 'stats' && <><Database className="w-4 h-4 text-emerald-400" /> System Multi-Store Metrics</>}
              </h3>
              <p className="text-[10px] text-slate-300 mt-0.5">
                {activeSection === 'search' && 'Real-time vector matching & Groq AI synthesis'}
                {activeSection === 'history' && 'Persisted in PostgreSQL database gacm_chat_sessions table'}
                {activeSection === 'experts' && 'Ranked by graph network centrality (CALL pagerank.get())'}
                {activeSection === 'spof' && 'Flagged single-speaker undocumented knowledge risks'}
                {activeSection === 'communities' && 'Louvain modularity research cluster detection'}
                {activeSection === 'stats' && 'Memgraph Bolt 7687 & PostgreSQL 5432 metrics'}
              </p>
            </div>
            <button
              onClick={() => setActiveSection(null)}
              title="Close Subsection Drawer"
              className="text-slate-300 hover:text-white p-1 hover:bg-white/10 transition-colors cursor-pointer"
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
                      className="bg-slate-50 border border-slate-200 hover:border-gold p-3.5 shadow-sm hover:shadow-md transition-all cursor-pointer space-y-1.5 group"
                    >
                      <div className="flex justify-between items-center text-[10px] text-slate-500">
                        <span className="font-mono font-bold text-amber-700">DB Session #{sess.id}</span>
                        <span>{new Date(sess.created_at).toLocaleDateString()}</span>
                      </div>
                      <h4 className="font-bold text-navy text-xs group-hover:text-amber-700 line-clamp-1">
                        &ldquo;{sess.query_text}&rdquo;
                      </h4>
                      <p className="text-slate-600 text-[11px] line-clamp-2 leading-tight">
                        {sess.synthesized_answer}
                      </p>
                      <div className="pt-1.5 flex justify-between items-center text-[10px] text-slate-500 font-mono">
                        <span>Citations: {sess.citations?.length || 0}</span>
                        <span className="text-amber-700 font-bold group-hover:underline">Reload Session →</span>
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
                <div className="bg-amber-50 border border-amber-200 p-3">
                  <h4 className="font-bold text-navy flex items-center gap-1.5 mb-1">
                    <Info className="w-4 h-4 text-amber-700" /> Memgraph Knowledge Graph
                  </h4>
                  <ul className="space-y-1 text-slate-700 text-[11px]">
                    <li>• Total Graph Nodes: <span className="font-bold text-navy">28,863</span></li>
                    <li>• Unique Faculty Entities: <span className="font-bold text-navy">5,756</span></li>
                    <li>• Directed Relationships: <span className="font-bold text-navy">33,627</span></li>
                    <li>• Database Driver: <span className="font-bold text-emerald-700">Bolt://127.0.0.1:7687</span></li>
                  </ul>
                </div>

                <div className="bg-blue-50 border border-blue-200 p-3">
                  <h4 className="font-bold text-navy flex items-center gap-1.5 mb-1">
                    <Database className="w-4 h-4 text-blue-700" /> PostgreSQL Vector & Chat Store
                  </h4>
                  <ul className="space-y-1 text-slate-700 text-[11px]">
                    <li>• 384d BAAI/bge-small Vectors: <span className="font-bold text-navy">21,422</span></li>
                    <li>• Saved AI Chat Sessions: <span className="font-bold text-navy">{chatHistory.length}</span></li>
                    <li>• NSF Research Awards: <span className="font-bold text-navy">18,500</span></li>
                    <li>• MISeD Meeting Dialog Turns: <span className="font-bold text-navy">2,922</span></li>
                    <li>• Database Connection: <span className="font-bold text-emerald-700">PostgreSQL community (Port 5432)</span></li>
                  </ul>
                </div>

                <div className="bg-emerald-50 border border-emerald-200 p-3">
                  <h4 className="font-bold text-navy flex items-center gap-1.5 mb-1">
                    <Sparkles className="w-4 h-4 text-emerald-700" /> Groq AI LLM Engine
                  </h4>
                  <ul className="space-y-1 text-slate-700 text-[11px]">
                    <li>• Primary Reasoning Model: <span className="font-bold text-navy">qwen/qwen3.8-27b</span></li>
                    <li>• Secondary Fallback Model: <span className="font-bold text-navy">openai/gpt-oss-20b</span></li>
                    <li>• Context Type: <span className="font-bold text-emerald-700">Vector Evidence + Cypher Triples</span></li>
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
