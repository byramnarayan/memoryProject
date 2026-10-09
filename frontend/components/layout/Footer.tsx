import Link from 'next/link';

export default function Footer() {
  return (
    <footer className="mt-auto py-12 bg-[#070b14]/95 border-t border-cyan-500/15 backdrop-blur-xl text-slate-300">
      <div className="max-w-[1400px] mx-auto px-4 lg:px-8 grid grid-cols-1 md:grid-cols-4 gap-8">
        <div className="md:col-span-2">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-6 h-6 rounded-md bg-gradient-to-br from-cyan-400 to-sky-600 p-[1px] shadow-[0_0_12px_rgba(6,182,212,0.4)]">
              <div className="w-full h-full bg-[#070b14] rounded-[5px] flex items-center justify-center">
                <svg className="w-3.5 h-3.5 text-cyan-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <polygon points="12 2 2 8.5 2 15.5 12 22 22 15.5 22 8.5 12 2" />
                </svg>
              </div>
            </div>
            <h2 className="text-lg font-extrabold text-white tracking-tight">MnemoGraph</h2>
            <span className="text-[9px] font-mono font-bold tracking-widest px-2 py-0.5 rounded-full border border-cyan-500/40 bg-cyan-950/40 text-cyan-300">
              MaaS PLATFORM
            </span>
          </div>
          <p className="text-slate-400 text-xs max-w-sm leading-relaxed mb-4">
            Unified Institutional & Enterprise Intelligence: Graph-Augmented Collective Memory (GACM), Cross-Silo Lakehouse Ingestion, and Succession Shadow AI.
          </p>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-950/40 border border-cyan-500/30 text-[11px] font-mono text-cyan-300">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_8px_#34d399]" />
            Memgraph & PostgreSQL Vector Engine: Operational
          </div>
        </div>

        <div>
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200 mb-3">Platform Intelligence</h3>
          <ul className="space-y-2 text-slate-400 text-xs">
            <li><Link href="/gacm" className="hover:text-cyan-400 transition-colors">Graph Cartography Explorer</Link></li>
            <li><Link href="/capture" className="hover:text-cyan-400 transition-colors">Memory Ingestion Pipeline</Link></li>
            <li><Link href="/connectors" className="hover:text-cyan-400 transition-colors">Lakehouse & Data Connectors</Link></li>
            <li><Link href="/logs" className="hover:text-cyan-400 transition-colors">Daily Decision & Intuition Logs</Link></li>
            <li><Link href="/kt-handoff" className="hover:text-cyan-400 transition-colors">Succession Shadow AI</Link></li>
            <li><Link href="/simulator" className="hover:text-cyan-400 transition-colors">What-If Decision Simulator</Link></li>
          </ul>
        </div>

        <div>
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200 mb-3">Governance & Security</h3>
          <ul className="space-y-2 text-slate-400 text-xs">
            <li><Link href="/audit" className="hover:text-cyan-400 transition-colors">Security & ACL Audit Trail</Link></li>
            <li><Link href="/insights" className="hover:text-cyan-400 transition-colors">Cross-Silo Analytics</Link></li>
            <li><Link href="/employees" className="hover:text-cyan-400 transition-colors">Staff Directory & RBAC</Link></li>
            <li><Link href="/setup-company" className="hover:text-cyan-400 transition-colors">Tenant Provisioning</Link></li>
          </ul>
        </div>
      </div>

      <div className="max-w-[1400px] mx-auto px-4 lg:px-8 mt-10 pt-6 border-t border-slate-800/80 flex flex-col sm:flex-row justify-between items-center text-xs text-slate-500">
        <p>© {new Date().getFullYear()} MnemoGraph Core. Enterprise Institutional Memory Architecture.</p>
        <p className="mt-2 sm:mt-0 font-mono text-[11px] text-cyan-400/70">v2.4.0-ENTERPRISE-EDITION</p>
      </div>
    </footer>
  );
}
