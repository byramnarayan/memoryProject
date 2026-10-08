'use client';

import { SpofRisk, DecayingRecord } from '@/types';

interface DecayRiskMatrixProps {
  spofRisks: SpofRisk[];
  decayingRecords: DecayingRecord[];
  activeHolds: {
    memory_id: string;
    title: string;
    sensitivity_level: string;
    created_at: string | null;
  }[];
  summary: {
    total_spof_identified: number;
    critical_spof_capital: number;
    decay_vulnerable_count: number;
    active_compliance_holds: number;
  };
}

export default function DecayRiskMatrix({
  spofRisks,
  decayingRecords,
  activeHolds,
  summary
}: DecayRiskMatrixProps) {
  const getRiskBadge = (level: string) => {
    switch (level) {
      case 'Critical':
        return 'bg-red-950/80 text-red-300 border-red-500/60 animate-pulse';
      case 'High':
        return 'bg-amber-950/80 text-amber-300 border-amber-500/60';
      default:
        return 'bg-yellow-950/80 text-yellow-300 border-yellow-500/60';
    }
  };

  return (
    <div className="space-y-8">
      {/* Risk Summary KPI Banner */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-slate-900 border border-red-900/40 rounded-xl p-4 shadow-lg">
          <div className="text-[11px] font-semibold uppercase text-red-400 tracking-wider">
            Critical SPOF Capital at Risk
          </div>
          <div className="text-2xl font-black text-red-300 mt-1 font-mono">
            ${(summary.critical_spof_capital / 1_000_000).toFixed(1)}M
          </div>
          <div className="text-[11px] text-red-400/80 mt-1">Single-faculty dependent awards</div>
        </div>

        <div className="bg-slate-900 border border-amber-900/40 rounded-xl p-4 shadow-lg">
          <div className="text-[11px] font-semibold uppercase text-amber-400 tracking-wider">
            SPOF Projects Identified
          </div>
          <div className="text-2xl font-black text-amber-300 mt-1 font-mono">
            {summary.total_spof_identified} Grants
          </div>
          <div className="text-[11px] text-amber-400/80 mt-1">Require co-investigator pairing</div>
        </div>

        <div className="bg-slate-900 border border-indigo-900/40 rounded-xl p-4 shadow-lg">
          <div className="text-[11px] font-semibold uppercase text-indigo-400 tracking-wider">
            Knowledge Decay Vulnerable
          </div>
          <div className="text-2xl font-black text-indigo-300 mt-1 font-mono">
            {summary.decay_vulnerable_count} Records
          </div>
          <div className="text-[11px] text-indigo-400/80 mt-1">Unreviewed / low confidence score</div>
        </div>

        <div className="bg-slate-900 border border-purple-900/40 rounded-xl p-4 shadow-lg">
          <div className="text-[11px] font-semibold uppercase text-purple-400 tracking-wider">
            Active Compliance Holds
          </div>
          <div className="text-2xl font-black text-purple-300 mt-1 font-mono">
            {summary.active_compliance_holds} Projects
          </div>
          <div className="text-[11px] text-purple-400/80 mt-1">Protected from purge & deletion</div>
        </div>
      </div>

      {/* 1. SPOF Grant Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between pb-4 border-b border-slate-800 gap-2 mb-4">
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <span>⚠️</span> Single Point of Failure (SPOF) Grant Register
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              High-value awards with a single registered PI and zero Co-Investigators that create institutional risk
            </p>
          </div>
          <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-red-500/10 text-red-300 border border-red-500/30">
            Continuity Risk Audit
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-950 border-b border-slate-800 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                <th className="py-3 px-3">Grant ID</th>
                <th className="py-3 px-3">Research Project</th>
                <th className="py-3 px-3">Sole Investigator</th>
                <th className="py-3 px-3">Department</th>
                <th className="py-3 px-3">Award Capital</th>
                <th className="py-3 px-3">Severity</th>
                <th className="py-3 px-3">Continuity Recommendation</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono">
              {spofRisks.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-500">
                    No critical Single Point of Failure risks detected.
                  </td>
                </tr>
              ) : (
                spofRisks.map((risk) => (
                  <tr key={risk.memory_id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="py-3 px-3 text-amber-400 font-bold whitespace-nowrap">
                      {risk.memory_id}
                    </td>
                    <td className="py-3 px-3 text-slate-200 font-sans max-w-xs truncate" title={risk.project_title}>
                      {risk.project_title}
                    </td>
                    <td className="py-3 px-3 text-white font-sans whitespace-nowrap">
                      {risk.sole_investigator}
                    </td>
                    <td className="py-3 px-3 text-slate-400 font-sans whitespace-nowrap">
                      {risk.department}
                    </td>
                    <td className="py-3 px-3 text-amber-300 font-bold whitespace-nowrap">
                      ${risk.award_amount.toLocaleString()}
                    </td>
                    <td className="py-3 px-3 whitespace-nowrap">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${getRiskBadge(risk.risk_level)}`}>
                        {risk.risk_level}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-slate-400 font-sans max-w-xs text-[11px]">
                      {risk.recommendation}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 2. Decaying Records & Compliance Alerts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Knowledge Decay Vulnerability */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-xl">
          <div className="pb-3 border-b border-slate-800 mb-4 flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <span>📉</span> Knowledge Decay Vulnerability
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Memories with degraded confidence or pending curator verification
              </p>
            </div>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-300 border border-indigo-500/30">
              Quality Assurance
            </span>
          </div>

          <div className="space-y-3">
            {decayingRecords.length === 0 ? (
              <p className="text-xs text-slate-500 py-4 text-center">
                All records operating at high confidence (&ge;85%).
              </p>
            ) : (
              decayingRecords.map((m) => (
                <div key={m.memory_id} className="p-3 bg-slate-950 border border-slate-800 rounded-lg flex items-center justify-between gap-3 text-xs">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-amber-400 font-mono font-bold">{m.memory_id}</span>
                      <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-400">
                        {m.sensitivity_level}
                      </span>
                    </div>
                    <p className="text-slate-300 font-sans truncate">{m.title}</p>
                  </div>
                  <div className="text-right shrink-0 font-mono">
                    <div className={`text-xs font-bold ${m.confidence_score < 80 ? 'text-red-400' : 'text-amber-400'}`}>
                      {m.confidence_score}%
                    </div>
                    <span className="text-[10px] text-slate-500 uppercase">{m.review_status}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Compliance Legal Holds */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-xl">
          <div className="pb-3 border-b border-slate-800 mb-4 flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <span>⚖️</span> Active Legal Hold Registry
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Institutional records with immutable preservation status
              </p>
            </div>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-purple-500/10 text-purple-300 border border-purple-500/30">
              CAP-7001 Protected
            </span>
          </div>

          <div className="space-y-3">
            {activeHolds.length === 0 ? (
              <div className="p-4 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-400 text-center">
                No active legal holds currently deployed. Apply holds via the <strong className="text-amber-400">Audit Trail</strong> page.
              </div>
            ) : (
              activeHolds.map((h) => (
                <div key={h.memory_id} className="p-3 bg-slate-950 border border-purple-900/40 rounded-lg flex items-center justify-between gap-3 text-xs">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-purple-400 font-mono font-bold">{h.memory_id}</span>
                      <span className="text-[10px] px-1.5 py-0.2 rounded bg-purple-950 text-purple-300 border border-purple-600/40">
                        {h.sensitivity_level}
                      </span>
                    </div>
                    <p className="text-slate-300 font-sans truncate">{h.title}</p>
                  </div>
                  <div className="shrink-0 text-right font-mono text-[11px] text-purple-300">
                    <span>LOCKED</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
