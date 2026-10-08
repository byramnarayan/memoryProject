'use client';

import { DepartmentFunding, SponsorFunding } from '@/types';

interface GrantPipelineChartProps {
  departments: DepartmentFunding[];
  sponsors: SponsorFunding[];
  lifecycle: Record<string, number>;
  sensitivity: Record<string, number>;
}

export default function GrantPipelineChart({
  departments,
  sponsors,
  lifecycle,
  sensitivity
}: GrantPipelineChartProps) {
  const maxDeptFunding = Math.max(...departments.map((d) => d.total_funding), 1);
  const maxSponsorFunding = Math.max(...sponsors.map((s) => s.total_funding), 1);

  const getLifecycleColor = (stage: string) => {
    switch (stage) {
      case 'Active':
        return 'bg-emerald-500';
      case 'Awarded':
        return 'bg-blue-500';
      case 'Submitted':
        return 'bg-amber-500';
      case 'Draft':
        return 'bg-slate-500';
      case 'Closed':
        return 'bg-slate-700';
      case 'Archived':
        return 'bg-slate-800';
      default:
        return 'bg-amber-600';
    }
  };

  const getSensitivityColor = (level: string) => {
    switch (level) {
      case 'Public':
        return 'bg-emerald-400';
      case 'Internal':
        return 'bg-blue-400';
      case 'Restricted':
        return 'bg-yellow-400';
      case 'Confidential':
        return 'bg-amber-500';
      case 'HighlyConfidential':
        return 'bg-purple-500';
      default:
        return 'bg-slate-500';
    }
  };

  return (
    <div className="space-y-8">
      {/* 1. Academic Department Funding Breakdown */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between pb-4 border-b border-slate-800 gap-2">
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <span>🏛️</span> Academic Department Research Capital
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Capital distribution and active project volume across academic colleges
            </p>
          </div>
          <span className="text-[11px] font-mono px-2.5 py-1 rounded bg-amber-500/10 text-amber-400 border border-amber-500/30">
            {departments.length} Colleges Monitored
          </span>
        </div>

        <div className="mt-5 space-y-4">
          {departments.map((dept) => {
            const widthPct = Math.min(100, Math.max(8, (dept.total_funding / maxDeptFunding) * 100));
            return (
              <div key={dept.department} className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-200 truncate max-w-[280px] sm:max-w-md">
                    {dept.department}
                  </span>
                  <div className="flex items-center gap-3 font-mono text-[11px] shrink-0">
                    <span className="text-slate-400 hidden sm:inline">
                      {dept.grants_count.toLocaleString()} projects
                    </span>
                    <span className="text-amber-400 font-bold">
                      ${(dept.total_funding / 1_000_000).toFixed(1)}M
                    </span>
                    <span className="text-slate-500 w-12 text-right">
                      {dept.percentage}%
                    </span>
                  </div>
                </div>

                <div className="w-full bg-slate-950 rounded-full h-2.5 overflow-hidden border border-slate-800">
                  <div
                    className="bg-gradient-to-r from-amber-500 to-amber-300 h-full rounded-full transition-all duration-500"
                    style={{ width: `${widthPct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 2. Federal Sponsors & Grant Pipeline Split */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Federal Sponsor Distribution */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-xl">
          <div className="pb-3 border-b border-slate-800 mb-4">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <span>🇺🇸</span> Federal & Industry Sponsors
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Capital allocations across government agencies and research foundations
            </p>
          </div>

          <div className="space-y-3.5">
            {sponsors.map((sp) => {
              const widthPct = Math.min(100, Math.max(10, (sp.total_funding / maxSponsorFunding) * 100));
              return (
                <div key={sp.sponsor} className="space-y-1 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-slate-300 truncate max-w-[240px]">
                      {sp.sponsor}
                    </span>
                    <span className="font-mono text-amber-400 font-semibold shrink-0">
                      ${(sp.total_funding / 1_000_000).toFixed(1)}M ({sp.percentage}%)
                    </span>
                  </div>
                  <div className="w-full bg-slate-950 rounded-full h-2 overflow-hidden border border-slate-800">
                    <div
                      className="bg-gradient-to-r from-blue-500 to-indigo-400 h-full rounded-full transition-all duration-500"
                      style={{ width: `${widthPct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Lifecycle & Sensitivity Governance */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-xl flex flex-col justify-between">
          <div>
            <div className="pb-3 border-b border-slate-800 mb-4">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <span>🔄</span> Lifecycle Pipeline & Clearance
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Current operational phase and data sensitivity classification
              </p>
            </div>

            {/* Lifecycle Stages */}
            <div className="space-y-2 mb-6">
              <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Grant Lifecycle Phases
              </label>
              <div className="grid grid-cols-3 gap-2">
                {Object.entries(lifecycle).map(([stage, count]) => (
                  <div key={stage} className="bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-center">
                    <div className="flex items-center justify-center gap-1.5 mb-1">
                      <span className={`w-2 h-2 rounded-full ${getLifecycleColor(stage)}`} />
                      <span className="text-[11px] font-medium text-slate-300">{stage}</span>
                    </div>
                    <div className="text-sm font-black text-white font-mono">{count.toLocaleString()}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Sensitivity Levels */}
            <div className="space-y-2">
              <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Sensitivity Classification Ladder
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {Object.entries(sensitivity).map(([level, count]) => (
                  <div key={level} className="bg-slate-950 border border-slate-800 rounded-lg p-2 text-center">
                    <div className="flex items-center justify-center gap-1.5 mb-1">
                      <span className={`w-2 h-2 rounded-full ${getSensitivityColor(level)}`} />
                      <span className="text-[10px] font-medium text-slate-300 truncate">{level}</span>
                    </div>
                    <div className="text-xs font-bold text-white font-mono">{count.toLocaleString()}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-6 pt-3 border-t border-slate-800/80 text-[11px] text-slate-500 font-mono flex items-center justify-between">
            <span>ISO 27001 Data Pipeline</span>
            <span className="text-emerald-400 font-semibold">● 100% Synced</span>
          </div>
        </div>
      </div>
    </div>
  );
}
