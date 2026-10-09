'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import DecisionLogForm from '@/components/logs/DecisionLogForm';
import LogTimeline, { DecisionLogItem } from '@/components/logs/LogTimeline';

interface LogStats {
  total_decisions: number;
  active_contributors: number;
  category_breakdown: Record<string, number>;
  top_impacted_systems: Array<{ name: string; count: number }>;
}

export default function LogsPage() {
  const { user, token } = useAuth();

  const [logs, setLogs] = useState<DecisionLogItem[]>([]);
  const [stats, setStats] = useState<LogStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Filter State
  const [selectedCategory, setSelectedCategory] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [myLogsOnly, setMyLogsOnly] = useState(false);

  const fetchLogs = async () => {
    if (!token) return;
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedCategory) params.append('category', selectedCategory);
      if (searchQuery) params.append('search', searchQuery);
      if (myLogsOnly) params.append('my_logs_only', 'true');

      const res = await fetch(`/api/logs?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setLogs(data);
      }

      // Fetch summary stats
      const statsRes = await fetch('/api/logs/stats/summary', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (statsRes.ok) {
        const statsData = await statsRes.json();
        setStats(statsData);
      }
    } catch (err) {
      console.error('Error fetching logs:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [token, selectedCategory, searchQuery, myLogsOnly]);

  return (
    <div className="min-h-screen py-10 px-4 md:px-8">
      <div className="max-w-[1400px] mx-auto space-y-8">
        {/* Header Breadcrumb & Title */}
        <div className="glass-card p-8 border border-cyan-500/20 shadow-[0_8px_32px_rgba(0,0,0,0.5)] rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <div className="flex items-center gap-2 text-xs text-slate-400 font-mono mb-2">
              <Link href="/" className="hover:text-cyan-400 transition-colors">HOME</Link>
              <span>/</span>
              <span className="text-cyan-400 font-semibold">DECISION & INTUITION LOGS</span>
            </div>
            <h1 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight flex items-center gap-2.5">
              <span>🧠 Operational Decision & Intuition Hub</span>
            </h1>
            <p className="text-xs md:text-sm text-slate-400 mt-1.5 max-w-2xl leading-relaxed">
              Eliminate organizational amnesia. Capture everyday technical trade-offs, workaround gut instincts, and incident post-mortems directly into the Company Brain.
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={() => setIsModalOpen(true)}
              className="btn-primary-cyan px-6 py-3 rounded-lg text-xs font-bold flex items-center gap-2 shadow-[0_0_20px_rgba(6,182,212,0.35)] cursor-pointer"
            >
              <span className="text-sm font-black">+</span>
              Log Decision / Workaround
            </button>
          </div>
        </div>

        {/* Telemetry Stats Bar */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="glass-card p-5 border border-cyan-500/20 rounded-xl">
            <span className="text-xs text-slate-400 uppercase font-semibold font-mono">Total Decisions</span>
            <div className="text-2xl font-black text-cyan-300 mt-1">
              {stats?.total_decisions || logs.length}
            </div>
            <span className="text-[11px] text-cyan-400/80 font-mono mt-0.5 block">
              Enriched with Memgraph & Neo4j
            </span>
          </div>

          <div className="glass-card p-5 border border-cyan-500/20 rounded-xl">
            <span className="text-xs text-slate-400 uppercase font-semibold font-mono">Workarounds vs Permanent</span>
            <div className="text-2xl font-black text-emerald-400 mt-1 flex items-baseline gap-2">
              <span>{stats?.category_breakdown?.['Workaround'] || 0}</span>
              <span className="text-xs text-slate-400 font-normal">/ {stats?.category_breakdown?.['Permanent Fix'] || 0} fixes</span>
            </div>
            <span className="text-[11px] text-slate-400 font-mono mt-0.5 block">
              Workaround ratio tracked
            </span>
          </div>

          <div className="glass-card p-5 border border-cyan-500/20 rounded-xl">
            <span className="text-xs text-slate-400 uppercase font-semibold font-mono">Active Contributors</span>
            <div className="text-2xl font-black text-sky-400 mt-1">
              {stats?.active_contributors || 1}
            </div>
            <span className="text-[11px] text-slate-400 font-mono mt-0.5 block">
              Engineers & Leads logging
            </span>
          </div>

          <div className="glass-card p-5 border border-cyan-500/20 rounded-xl">
            <span className="text-xs text-slate-400 uppercase font-semibold font-mono">Top Impacted Cell / System</span>
            <div className="text-lg font-bold text-cyan-300 mt-1 truncate font-mono">
              {stats?.top_impacted_systems?.[0]?.name || 'CELL-MUM-0001'}
            </div>
            <span className="text-[11px] text-slate-400 font-mono mt-0.5 block">
              {stats?.top_impacted_systems?.[0]?.count || 1} related incidents
            </span>
          </div>
        </div>

        {/* Timeline Feed */}
        <div className="mt-8">
          <LogTimeline
            logs={logs}
            selectedCategory={selectedCategory}
            onSelectCategory={setSelectedCategory}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            myLogsOnly={myLogsOnly}
            onToggleMyLogs={setMyLogsOnly}
            isLoading={isLoading}
          />
        </div>
      </div>

      {/* Modal for Decision Log Submission */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md overflow-y-auto">
          <div className="relative w-full max-w-3xl my-8">
            <DecisionLogForm
              onSuccess={() => {
                setIsModalOpen(false);
                fetchLogs();
              }}
              onCancel={() => setIsModalOpen(false)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
