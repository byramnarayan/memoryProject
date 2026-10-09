import Link from 'next/link';
import { Post, PaginatedPostsResponse } from '@/types';
import { apiFetch } from '@/lib/api';
import PostList from '@/components/PostList';
import FileDropzone from '@/components/capture/FileDropzone';

async function getPosts(): Promise<PaginatedPostsResponse> {
  try {
    type ApiPost = Omit<Post, 'created_at'> & { date_posted?: string };
    type ApiPaginatedResponse = Omit<PaginatedPostsResponse, 'posts'> & { posts: ApiPost[] };
    
    const res = await apiFetch<ApiPaginatedResponse>('/api/posts?skip=0&limit=6', { skipAuth: true, cache: 'no-store' });
    
    const mappedPosts = res.posts.map(p => ({
      ...p,
      created_at: p.date_posted || (p as unknown as Post).created_at
    })) as Post[];
    
    return { ...res, posts: mappedPosts };
  } catch (error) {
    return { posts: [], total: 0, skip: 0, limit: 6, has_more: false };
  }
}

export default async function Home() {
  const paginatedData = await getPosts();

  return (
    <div className="min-h-screen">
      {/* ─────────────────────────────────────────────────────────────
          HERO SECTION (Matching Reference Image)
      ───────────────────────────────────────────────────────────── */}
      <section className="relative pt-12 pb-20 overflow-hidden border-b border-cyan-500/10">
        {/* Background Dot-Grid Texture on Top Right */}
        <div className="absolute top-0 right-0 w-[550px] h-[400px] dot-grid opacity-30 pointer-events-none mask-radial" />
        
        <div className="max-w-[1400px] mx-auto px-4 lg:px-8">
          <div className="max-w-4xl">
            {/* Pill Badge */}
            <div className="inline-flex items-center gap-2.5 px-3.5 py-1.5 rounded-full bg-cyan-950/40 border border-cyan-500/30 text-cyan-300 text-xs font-semibold mb-6 shadow-[0_0_15px_rgba(14,165,233,0.15)]">
              <span className="w-2 h-2 rounded-full bg-cyan-400 shadow-[0_0_8px_#00e5ff] animate-pulse" />
              INSTITUTIONAL INTELLIGENCE ARCHITECTURE
            </div>

            {/* Main Title */}
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-white mb-6 leading-[1.12]">
              <span className="text-gradient-cyan">One database</span> for AI, institutional knowledge and agents
            </h1>

            {/* Subtitle */}
            <p className="text-base sm:text-lg text-slate-300/90 leading-relaxed max-w-3xl mb-8">
              Explore deduplicated faculty research, PageRank-driven expert rankings, SPOF knowledge decay risks, and Louvain interdisciplinary community clusters powered by Memgraph and PostgreSQL Vector Search.
            </p>

            {/* Action Buttons Group */}
            <div className="flex flex-wrap items-center gap-4">
              <Link
                href="/gacm"
                className="btn-primary-cyan px-7 py-3 rounded-lg text-sm font-bold text-white shadow-[0_0_20px_rgba(6,182,212,0.35)] flex items-center gap-2 transition-transform hover:-translate-y-0.5"
              >
                <span>Explore the platform</span>
                <span className="text-cyan-200">→</span>
              </Link>

              <Link
                href="/connectors"
                className="px-6 py-3 rounded-lg text-sm font-semibold text-slate-200 bg-slate-900/80 hover:bg-slate-800/80 border border-slate-700/80 hover:border-cyan-400/40 transition-all backdrop-blur-md"
              >
                See demo
              </Link>

              <Link
                href="/audit"
                className="px-4 py-3 rounded-lg text-sm font-medium text-slate-400 hover:text-cyan-300 transition-colors flex items-center gap-2"
              >
                <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.5L19 7.5V19a2 2 0 01-2 2z" />
                </svg>
                <span>Documentation</span>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ─────────────────────────────────────────────────────────────
          MODULE 01: INGESTION PIPELINE (Matching Reference Image)
      ───────────────────────────────────────────────────────────── */}
      <section className="py-16 max-w-[1400px] mx-auto px-4 lg:px-8">
        {/* Module Header Bar */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-8">
          <div>
            <div className="inline-block text-[11px] font-mono font-bold uppercase tracking-wider text-cyan-400 bg-cyan-950/50 border border-cyan-500/30 px-3 py-1 rounded-full mb-3">
              MODULE 01 &nbsp;INGESTION PIPELINE
            </div>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              Memory Capture & Ingestion Center
            </h2>
            <p className="text-xs sm:text-sm text-slate-400 max-w-2xl mt-1.5 leading-relaxed">
              Ingest academic grant awards, research proposals, faculty senate dialog transcripts, and compliance reports into the institutional memory layer with automated parsing and SHA-256 duplicate blocking.
            </p>
          </div>

          {/* SLO Performance Badge */}
          <div className="glass-panel border border-cyan-500/20 px-4 py-3 rounded-xl flex items-center gap-3 shrink-0 self-start md:self-auto shadow-lg">
            <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 text-sm">
              ⚡
            </div>
            <div>
              <p className="text-[10px] font-mono uppercase text-slate-400 tracking-wider">SLO PERFORMANCE</p>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-white">Ingestion &lt; 2.0s</span>
                <span className="inline-flex items-center gap-1 text-[10px] font-mono text-emerald-400 font-semibold bg-emerald-950/40 px-2 py-0.5 rounded-full border border-emerald-500/30">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  99.98% Active
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* 4-Step Pipeline Cards (Matching Reference Image) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {/* STEP 1: Multipart Upload (Active) */}
          <div className="glass-card p-5 relative border-cyan-500/40 shadow-[0_0_20px_rgba(14,165,233,0.12)]">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-mono font-bold tracking-wider text-cyan-400 uppercase">
                STEP 1
              </span>
              <span className="w-2 h-2 rounded-full bg-cyan-400 shadow-[0_0_8px_#00e5ff] animate-ping" />
            </div>
            <h3 className="text-sm font-bold text-white tracking-tight">Multipart Upload</h3>
            <p className="text-xs text-slate-400 mt-1">PDF, DOCX, TXT, JSON, CSV</p>
          </div>

          {/* STEP 2: Duplicate Blocker */}
          <div className="glass-card p-5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-mono font-bold tracking-wider text-slate-500 uppercase">
                STEP 2
              </span>
            </div>
            <h3 className="text-sm font-bold text-white tracking-tight">Duplicate Blocker</h3>
            <p className="text-xs text-slate-400 mt-1">SHA-256 Hash Matching</p>
          </div>

          {/* STEP 3: Section Extraction */}
          <div className="glass-card p-5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-mono font-bold tracking-wider text-slate-500 uppercase">
                STEP 3
              </span>
            </div>
            <h3 className="text-sm font-bold text-white tracking-tight">Section Extraction</h3>
            <p className="text-xs text-slate-400 mt-1">Aims, Budget, Minutes, Findings</p>
          </div>

          {/* STEP 4: Canonical Memory */}
          <div className="glass-card p-5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-mono font-bold tracking-wider text-slate-500 uppercase">
                STEP 4
              </span>
            </div>
            <h3 className="text-sm font-bold text-white tracking-tight">Canonical Memory</h3>
            <p className="text-xs text-slate-400 mt-1">MEM-001 / Vector Embeddings</p>
          </div>
        </div>

        {/* Embedded Interactive File Ingestion Component */}
        <FileDropzone />
      </section>

      {/* ─────────────────────────────────────────────────────────────
          ENTERPRISE INTELLIGENCE PILLARS (GACM, LAKEHOUSE, LOGS, KT, SIMULATOR)
      ───────────────────────────────────────────────────────────── */}
      <section className="py-16 max-w-[1400px] mx-auto px-4 lg:px-8 border-t border-cyan-500/10">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <div className="inline-block text-[11px] font-mono font-bold uppercase tracking-wider text-cyan-400 bg-cyan-950/50 border border-cyan-500/30 px-3 py-1 rounded-full mb-3">
            ENTERPRISE CAPABILITIES
          </div>
          <h2 className="text-3xl font-extrabold text-white tracking-tight">
            Universal Memory Architecture
          </h2>
          <p className="text-sm text-slate-400 mt-2">
            A complete intelligence operating system connecting fragmented enterprise data, institutional knowledge graphs, tacit human intuition, and predictive simulators.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* Card 1: GACM Explorer */}
          <Link href="/gacm" className="glass-card p-6 block group">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 mb-4 group-hover:scale-110 transition-transform">
              🌐
            </div>
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-base font-bold text-white group-hover:text-cyan-300 transition-colors">
                Graph Cartography Explorer
              </h3>
              <span className="text-xs text-cyan-400">→</span>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Explore 17,990+ research memories, Louvain communities, PageRank centrality, and cross-departmental collaboration clusters.
            </p>
          </Link>

          {/* Card 2: Connectors Hub */}
          <Link href="/connectors" className="glass-card p-6 block group">
            <div className="w-10 h-10 rounded-xl bg-orange-500/10 border border-orange-500/30 flex items-center justify-center text-orange-400 mb-4 group-hover:scale-110 transition-transform">
              🔌
            </div>
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-base font-bold text-white group-hover:text-cyan-300 transition-colors">
                Lakehouse & Data Connectors
              </h3>
              <span className="text-xs text-cyan-400">→</span>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Live Databricks Lakehouse & CRM integration syncing customer telemetry, billing anomalies, and support tickets into the collective brain.
            </p>
          </Link>

          {/* Card 3: Tacit Intuition Logs */}
          <Link href="/logs" className="glass-card p-6 block group">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 mb-4 group-hover:scale-110 transition-transform">
              🧠
            </div>
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-base font-bold text-white group-hover:text-cyan-300 transition-colors">
                Daily Intuition Logger
              </h3>
              <span className="text-xs text-cyan-400">→</span>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Capture daily standups, architectural tradeoffs, and unwritten operational intuition automatically enriched by AI knowledge agents.
            </p>
          </Link>

          {/* Card 4: KT Succession Shadow */}
          <Link href="/kt-handoff" className="glass-card p-6 block group">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-400 mb-4 group-hover:scale-110 transition-transform">
              👥
            </div>
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-base font-bold text-white group-hover:text-cyan-300 transition-colors">
                Succession Shadow AI
              </h3>
              <span className="text-xs text-cyan-400">→</span>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Seamless employee handover with interactive KT checklists and the grounded "Ask Predecessor's Brain" conversational agent.
            </p>
          </Link>

          {/* Card 5: What-If Simulator */}
          <Link href="/simulator" className="glass-card p-6 block group">
            <div className="w-10 h-10 rounded-xl bg-pink-500/10 border border-pink-500/30 flex items-center justify-center text-pink-400 mb-4 group-hover:scale-110 transition-transform">
              🔮
            </div>
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-base font-bold text-white group-hover:text-cyan-300 transition-colors">
                What-If Strategic Simulator
              </h3>
              <span className="text-xs text-cyan-400">→</span>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Simulate vendor switches, key departures, and tariff hikes against historical precedent with instant confidence scoring and blast radius maps.
            </p>
          </Link>

          {/* Card 6: Security & ACL Audit */}
          <Link href="/audit" className="glass-card p-6 block group">
            <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/30 flex items-center justify-center text-purple-400 mb-4 group-hover:scale-110 transition-transform">
              ⚖️
            </div>
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-base font-bold text-white group-hover:text-cyan-300 transition-colors">
                Security & ACL Audit Trail
              </h3>
              <span className="text-xs text-cyan-400">→</span>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Tamper-evident access verification, clearance isolation (Public to Highly Confidential), and compliance logging.
            </p>
          </Link>
        </div>
      </section>

      {/* ─────────────────────────────────────────────────────────────
          COLLECTIVE MEMORY DISCUSSIONS & COMMUNITY
      ───────────────────────────────────────────────────────────── */}
      <section className="py-16 max-w-[1400px] mx-auto px-4 lg:px-8 border-t border-cyan-500/10">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="text-2xl font-bold text-white tracking-tight">
              Institutional Discussion Stream
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Active peer debates, research queries, and collective decision logs.
            </p>
          </div>
          <Link
            href="/community"
            className="text-xs font-semibold text-cyan-400 hover:text-cyan-300 transition-colors flex items-center gap-1"
          >
            <span>View All Topics</span>
            <span>→</span>
          </Link>
        </div>

        <PostList initialData={paginatedData} apiEndpoint="/api/posts" />
      </section>
    </div>
  );
}
