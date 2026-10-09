'use client';

import { useState } from 'react';

export interface DecisionLogItem {
  id: number;
  title: string;
  decision_summary: string;
  trade_offs_considered?: string | null;
  incident_or_ticket_ref?: string | null;
  impacted_system_or_cell?: string | null;
  intuition_notes?: string | null;
  decision_category: string;
  urgency_level: string;
  log_date: string;
  impacted_kpis: string[];
  canonical_memory_id?: string | null;
  ai_enrichment?: Record<string, any>;
  author: {
    id: number;
    name: string;
    employee_number?: string | null;
    department: string;
    job_title: string;
  };
}

interface LogTimelineProps {
  logs: DecisionLogItem[];
  selectedCategory: string;
  onSelectCategory: (category: string) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  myLogsOnly: boolean;
  onToggleMyLogs: (val: boolean) => void;
  isLoading: boolean;
}

export default function LogTimeline({
  logs,
  selectedCategory,
  onSelectCategory,
  searchQuery,
  onSearchChange,
  myLogsOnly,
  onToggleMyLogs,
  isLoading,
}: LogTimelineProps) {
  const [expandedLogId, setExpandedLogId] = useState<number | null>(null);

  const categories = [
    'ALL',
    'Workaround',
    'Permanent Fix',
    'Architecture Change',
    'Vendor Escalation',
    'Operational Routine',
  ];

  const getCategoryBadgeClass = (cat: string) => {
    switch (cat) {
      case 'Workaround':
        return 'bg-amber-500/10 text-amber-400 border-amber-500/30';
      case 'Permanent Fix':
        return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30';
      case 'Architecture Change':
        return 'bg-indigo-500/10 text-indigo-400 border-indigo-500/30';
      case 'Vendor Escalation':
        return 'bg-rose-500/10 text-rose-400 border-rose-500/30';
      default:
        return 'bg-slate-500/10 text-slate-300 border-slate-500/30';
    }
  };

  const getUrgencyBadge = (urg: string) => {
    switch (urg) {
      case 'Critical':
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-600/20 text-red-400 border border-red-500/40 animate-pulse">CRITICAL</span>;
      case 'High':
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-orange-500/20 text-orange-400 border border-orange-500/40">HIGH</span>;
      case 'Medium':
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-yellow-500/20 text-yellow-400 border border-yellow-500/40">MEDIUM</span>;
      default:
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-500/20 text-blue-400 border border-blue-500/40">LOW</span>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Filter and Search Bar */}
      <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between bg-slate-900/60 border border-slate-800 p-4 rounded-xl">
        <div className="flex flex-wrap gap-2 items-center">
          {categories.map((c) => {
            const isSelected = selectedCategory === (c === 'ALL' ? '' : c);
            return (
              <button
                key={c}
                onClick={() => onSelectCategory(c === 'ALL' ? '' : c)}
                className={`text-xs px-3 py-1.5 rounded-lg border transition-all ${
                  isSelected
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/60 font-semibold'
                    : 'bg-slate-800/60 text-slate-400 border-slate-700/60 hover:text-slate-200'
                }`}
              >
                {c === 'ALL' ? '🌐 All Categories' : c}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search decisions, cells, tickets..."
            className="w-full md:w-64 px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-400"
          />
          <button
            onClick={() => onToggleMyLogs(!myLogsOnly)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border whitespace-nowrap transition-all ${
              myLogsOnly
                ? 'bg-amber-500 text-slate-950 border-amber-400 font-bold'
                : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-750'
            }`}
          >
            {myLogsOnly ? '👤 My Logs' : '👥 Team Feed'}
          </button>
        </div>
      </div>

      {/* Logs Feed */}
      {isLoading ? (
        <div className="p-12 text-center text-slate-400 flex flex-col items-center justify-center gap-3">
          <div className="w-8 h-8 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm">Retrieving operational decisions & intuition graph...</p>
        </div>
      ) : logs.length === 0 ? (
        <div className="p-12 border border-slate-800 rounded-xl text-center bg-slate-900/30">
          <p className="text-slate-400 text-sm">No decisions found matching the selected filters.</p>
          <p className="text-xs text-slate-600 mt-1">Be the first on your team to log today&apos;s trade-off or workaround!</p>
        </div>
      ) : (
        <div className="relative border-l-2 border-slate-800 ml-4 md:ml-6 pl-4 md:pl-8 space-y-6">
          {logs.map((log) => {
            const isExpanded = expandedLogId === log.id;
            const dateStr = new Date(log.log_date).toLocaleString(undefined, {
              dateStyle: 'medium',
              timeStyle: 'short',
            });

            return (
              <div
                key={log.id}
                className="relative bg-slate-900/80 border border-slate-800 rounded-xl p-5 hover:border-slate-700 transition-all shadow-md group"
              >
                {/* Timeline node dot */}
                <div className="absolute -left-[25px] md:-left-[41px] top-6 w-4 h-4 rounded-full bg-slate-950 border-2 border-amber-400 group-hover:scale-125 transition-transform" />

                {/* Card Header */}
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`text-[11px] font-mono px-2 py-0.5 rounded border ${getCategoryBadgeClass(log.decision_category)}`}>
                      {log.decision_category}
                    </span>
                    {getUrgencyBadge(log.urgency_level)}
                    {log.impacted_system_or_cell && (
                      <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-blue-950/40 text-blue-300 border border-blue-500/30">
                        📡 {log.impacted_system_or_cell}
                      </span>
                    )}
                    {log.incident_or_ticket_ref && (
                      <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-purple-950/40 text-purple-300 border border-purple-500/30">
                        🎫 {log.incident_or_ticket_ref}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-slate-400 font-mono">
                    {dateStr}
                  </div>
                </div>

                {/* Title */}
                <h3 className="text-base font-bold text-white mt-3 group-hover:text-amber-300 transition-colors">
                  {log.title}
                </h3>

                {/* Author attribution */}
                <div className="flex items-center gap-2 mt-1 text-xs text-slate-400">
                  <span className="font-semibold text-slate-200">{log.author.name}</span>
                  <span>•</span>
                  <span>{log.author.job_title}</span>
                  <span>•</span>
                  <span className="text-amber-400/80">{log.author.department}</span>
                  {log.author.employee_number && (
                    <span className="font-mono text-[10px] text-slate-500">[{log.author.employee_number}]</span>
                  )}
                </div>

                {/* Decision Summary */}
                <p className="text-sm text-slate-300 mt-3 leading-relaxed">
                  {log.decision_summary}
                </p>

                {/* Tacit Intuition Highlight Card */}
                {log.intuition_notes && (
                  <div className="mt-3 p-3 bg-amber-950/20 border-l-2 border-amber-500 rounded-r-lg text-xs text-amber-200/90">
                    <div className="font-bold text-amber-300 flex items-center gap-1.5 mb-1">
                      <span>💡 Tacit Intuition & Unwritten Post-Mortem</span>
                    </div>
                    <p className="italic">{log.intuition_notes}</p>
                  </div>
                )}

                {/* Collapsible Section for Trade-offs & AI Entities */}
                {isExpanded && (
                  <div className="mt-4 pt-4 border-t border-slate-800 space-y-3">
                    {log.trade_offs_considered && (
                      <div className="bg-slate-950/60 p-3 rounded-lg border border-slate-800 text-xs">
                        <span className="font-bold text-slate-300 block mb-1">⚖️ Rejected Alternatives & Trade-Offs:</span>
                        <p className="text-slate-400">{log.trade_offs_considered}</p>
                      </div>
                    )}

                    {log.impacted_kpis && log.impacted_kpis.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1.5 text-xs">
                        <span className="text-slate-400 text-[11px] font-semibold">Impacted KPIs:</span>
                        {log.impacted_kpis.map((kpi, idx) => (
                          <span
                            key={idx}
                            className="text-[10px] px-2 py-0.5 rounded bg-emerald-950/30 text-emerald-400 border border-emerald-500/20 font-mono"
                          >
                            📈 {kpi}
                          </span>
                        ))}
                      </div>
                    )}

                    {log.ai_enrichment?.root_cause_analysis && (
                      <div className="bg-indigo-950/20 border border-indigo-500/20 p-2.5 rounded-lg text-xs text-indigo-200">
                        <span className="font-bold text-indigo-300 block mb-0.5">🧠 AI Root Cause Assessment:</span>
                        <p className="text-slate-300">{log.ai_enrichment.root_cause_analysis}</p>
                      </div>
                    )}

                    {log.canonical_memory_id && (
                      <div className="text-[11px] font-mono text-slate-400 flex items-center gap-1.5">
                        <span>Indexed into MaaS Canonical Memory:</span>
                        <span className="text-amber-400 font-semibold">{log.canonical_memory_id}</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Footer Controls */}
                <div className="mt-4 flex items-center justify-between pt-2 border-t border-slate-800/40">
                  <button
                    onClick={() => setExpandedLogId(isExpanded ? null : log.id)}
                    className="text-xs text-slate-400 hover:text-amber-300 flex items-center gap-1 transition-colors"
                  >
                    {isExpanded ? '▲ Hide Technical Details' : '▼ View Trade-offs & AI Insights'}
                  </button>
                  <span className="text-[10px] font-mono text-slate-600">
                    ID: DEC-{log.id.toString().padStart(6, '0')}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
