'use client';

import Link from 'next/link';

interface SimulationResultCardProps {
  results: {
    scenario_type: string;
    scenario_title: string;
    impact_severity: string;
    metrics: Record<string, any>;
    affected_systems_list?: string[];
    ai_strategic_recommendation: string;
    grounded_decision_cites?: string[];
    mitigation_savings_usd?: number;
    predecessor_heuristics_found?: number;
  };
}

export default function SimulationResultCard({ results }: SimulationResultCardProps) {
  const getSeverityBadge = (sev: string) => {
    switch (sev) {
      case 'CRITICAL':
        return <span className="px-3 py-1 rounded-full text-xs font-black bg-red-600/20 text-red-400 border border-red-500/50 animate-pulse">CRITICAL RISK</span>;
      case 'HIGH':
        return <span className="px-3 py-1 rounded-full text-xs font-black bg-orange-500/20 text-orange-400 border border-orange-500/50">HIGH IMPACT</span>;
      case 'POSITIVE_ROI':
        return <span className="px-3 py-1 rounded-full text-xs font-black bg-emerald-500/20 text-emerald-400 border border-emerald-500/50">HIGH ROI (POSITIVE)</span>;
      default:
        return <span className="px-3 py-1 rounded-full text-xs font-black bg-blue-500/20 text-blue-400 border border-blue-500/50">LOW RISK</span>;
    }
  };

  const formatKeyName = (key: string) => {
    return key
      .replace(/_/g, ' ')
      .replace(/usd/i, '($)')
      .replace(/pct/i, '(%)')
      .toUpperCase();
  };

  return (
    <div className="glass-panel border-cyan-500/30 rounded-2xl p-6 shadow-2xl text-slate-100 space-y-6 shadow-cyan-950/40">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-cyan-500/15 pb-4">
        <div>
          <div className="text-xs font-mono text-cyan-400 uppercase tracking-wider mb-1">
            Simulation Results Output
          </div>
          <h3 className="text-xl font-black text-white">
            {results.scenario_title}
          </h3>
        </div>
        <div>
          {getSeverityBadge(results.impact_severity)}
        </div>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {Object.entries(results.metrics).map(([key, val]) => (
          <div key={key} className="bg-[#080d1a]/80 border border-cyan-500/15 rounded-xl p-4">
            <span className="text-[11px] text-slate-400 uppercase font-bold tracking-wider block">
              {formatKeyName(key)}
            </span>
            <div className="text-xl md:text-2xl font-black text-cyan-300 mt-1">
              {typeof val === 'number' && key.includes('usd')
                ? `$${val.toLocaleString()}`
                : typeof val === 'number'
                ? val.toLocaleString()
                : String(val)}
            </div>
          </div>
        ))}
      </div>

      {/* Affected Systems Pill List */}
      {results.affected_systems_list && results.affected_systems_list.length > 0 && (
        <div className="p-3 bg-[#080d1a]/60 border border-cyan-500/15 rounded-xl">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-2">
            {results.scenario_type.includes('PI_') || results.scenario_type.includes('GRANT_') || results.scenario_type.includes('IRB_')
              ? 'Exposed Institutional Research Assets & Labs:'
              : 'Orphaned / Impacted Subsystems Exposed:'}
          </span>
          <div className="flex flex-wrap gap-2">
            {results.affected_systems_list.map((sys, idx) => (
              <span
                key={idx}
                className="px-2.5 py-1 rounded-md bg-rose-950/40 text-rose-300 border border-rose-500/30 text-xs font-mono"
              >
                {results.scenario_type.includes('PI_') || results.scenario_type.includes('GRANT_') || results.scenario_type.includes('IRB_') ? '🏛️ ' : '📡 '}
                {sys}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Strategic AI Recommendation Callout */}
      <div className="bg-gradient-to-r from-cyan-950/30 via-[#0c1427] to-sky-950/20 border border-cyan-500/30 rounded-xl p-5 shadow-inner space-y-3">
        <div className="flex items-center gap-2 text-cyan-300 font-bold text-sm">
          <span>🧠</span>
          <span>
            {results.scenario_type.includes('PI_') || results.scenario_type.includes('GRANT_') || results.scenario_type.includes('IRB_')
              ? 'Institutional Intelligence Strategic Recommendation:'
              : 'Company Brain Strategic Recommendation:'}
          </span>
        </div>
        <p className="text-xs md:text-sm text-slate-200 leading-relaxed font-sans">
          {results.ai_strategic_recommendation}
        </p>

        {/* Predecessor Citations */}
        {results.grounded_decision_cites && results.grounded_decision_cites.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-cyan-500/15 text-xs">
            <span className="text-slate-400 font-medium">Grounded Heuristic Citations:</span>
            {results.grounded_decision_cites.map((dec, idx) => (
              <span
                key={idx}
                className="badge-cyan font-mono text-[11px]"
              >
                {dec}
              </span>
            ))}
          </div>
        )}

        {/* Suggested Quick Navigation */}
        <div className="pt-2 flex flex-wrap gap-3">
          <Link
            href="/kt-handoff"
            className="btn-primary-cyan text-xs inline-flex items-center gap-1 cursor-pointer"
          >
            <span>🤝</span> Create KT Succession Assignment &rarr;
          </Link>
          <Link
            href="/logs"
            className="text-xs px-3 py-1.5 bg-[#0e1629] text-slate-300 font-semibold rounded-lg hover:bg-[#13203c] transition-colors inline-flex items-center gap-1 border border-cyan-500/20"
          >
            <span>📜</span> Review Operational Logs &rarr;
          </Link>
        </div>
      </div>
    </div>
  );
}
