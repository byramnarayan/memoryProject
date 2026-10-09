'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import { apiFetch } from '@/lib/api';
import { AuditLog, GovernanceStats } from '@/types';

export default function AuditPage() {
  const { user } = useAuth();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [stats, setStats] = useState<GovernanceStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters & Pagination
  const [selectedAction, setSelectedAction] = useState('All');
  const [selectedRole, setSelectedRole] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  // Expanded Log Details Modal
  const [activeDetailsLog, setActiveDetailsLog] = useState<AuditLog | null>(null);

  // Legal Hold Quick Action Modal
  const [isHoldModalOpen, setIsHoldModalOpen] = useState(false);
  const [holdMemoryId, setHoldMemoryId] = useState('');
  const [holdReason, setHoldReason] = useState('');
  const [holdActionType, setHoldActionType] = useState<boolean>(true);
  const [holdSubmitting, setHoldSubmitting] = useState(false);
  const [holdMessage, setHoldMessage] = useState<string | null>(null);

  const fetchStats = useCallback(async () => {
    try {
      const data = await apiFetch<GovernanceStats>('/api/governance/stats');
      setStats(data);
    } catch (err) {
      console.error('Failed to load governance stats:', err);
    }
  }, []);

  const fetchLogs = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.append('page', page.toString());
      params.append('limit', '15');
      if (selectedAction !== 'All') params.append('action', selectedAction);
      if (selectedRole !== 'All') params.append('user_role', selectedRole);
      if (searchQuery.trim()) params.append('search', searchQuery.trim());

      const data = await apiFetch<{
        items: AuditLog[];
        pagination: { total: number; page: number; limit: number; total_pages: number };
      }>(`/api/governance/audit-logs?${params.toString()}`);

      setLogs(data.items || []);
      if (data.pagination) {
        setTotalPages(data.pagination.total_pages);
        setTotalCount(data.pagination.total);
      }
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Failed to fetch audit records. Auditor or TenantAdmin clearance required.');
      }
    } finally {
      setIsLoading(false);
    }
  }, [page, selectedAction, selectedRole, searchQuery]);

  useEffect(() => {
    fetchStats();
    fetchLogs();
  }, [fetchStats, fetchLogs]);

  const handleApplyLegalHold = async (e: React.FormEvent) => {
    e.preventDefault();
    setHoldSubmitting(true);
    setHoldMessage(null);
    try {
      const endpoint = holdActionType
        ? `/api/governance/legal-hold/${encodeURIComponent(holdMemoryId)}`
        : `/api/governance/legal-hold/${encodeURIComponent(holdMemoryId)}/release`;

      const res = await apiFetch<{ message: string }>(endpoint, {
        method: 'POST',
        body: JSON.stringify({ reason: holdReason }),
      });

      setHoldMessage(`Success: ${res.message}`);
      setHoldMemoryId('');
      setHoldReason('');
      fetchStats();
      fetchLogs();
      setTimeout(() => {
        setIsHoldModalOpen(false);
        setHoldMessage(null);
      }, 1500);
    } catch (err: unknown) {
      setHoldMessage(err instanceof Error ? err.message : 'Action failed.');
    } finally {
      setHoldSubmitting(false);
    }
  };

  const getActionBadge = (action: string) => {
    switch (action) {
      case 'CLEARANCE_DENIAL':
        return 'bg-rose-950/80 text-rose-300 border-rose-500/60 shadow-[0_0_10px_rgba(244,63,94,0.3)]';
      case 'CURATE':
      case 'APPROVE':
        return 'bg-emerald-950/80 text-emerald-300 border-emerald-500/60';
      case 'REJECT':
      case 'HARD_DELETE':
        return 'bg-rose-950/80 text-rose-300 border-rose-500/60';
      case 'LEGAL_HOLD_APPLIED':
        return 'bg-amber-950/80 text-amber-300 border-amber-500/60 animate-pulse';
      case 'LEGAL_HOLD_REMOVED':
        return 'bg-slate-800 text-slate-300 border-slate-600';
      case 'SEARCH':
        return 'bg-blue-950/80 text-blue-300 border-blue-500/60';
      case 'VIEW_TEXT':
        return 'bg-cyan-950/80 text-cyan-300 border-cyan-500/60';
      case 'CAPTURE':
        return 'bg-teal-950/80 text-teal-300 border-teal-500/60';
      default:
        return 'bg-slate-900 text-slate-300 border-slate-700';
    }
  };

  return (
    <div className="max-w-[1400px] mx-auto px-4 lg:px-8 py-10 space-y-8">
      {/* Header & Status */}
      <div className="glass-card p-8 border border-cyan-500/20 shadow-[0_8px_32px_rgba(0,0,0,0.5)] rounded-2xl flex flex-col md:flex-row md:items-center md:justify-between gap-6">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 text-xl shadow-[0_0_15px_rgba(14,165,233,0.2)]">
              ⚖️
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight">
                Enterprise Governance & Audit Trail
              </h1>
              <p className="text-slate-400 text-xs md:text-sm mt-0.5">
                Immutable ISO 27001/NIST Provenance Trail & Sensitivity Clearance Enforcement
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {user && (
            <span className="text-xs font-mono px-3 py-1.5 rounded-full bg-slate-900/80 text-slate-300 border border-slate-700">
              Active Actor: <strong className="text-cyan-300">{user.username}</strong> ({user.role || 'User'})
            </span>
          )}
          <button
            onClick={() => setIsHoldModalOpen(true)}
            className="px-4 py-2 rounded-lg bg-amber-950/60 hover:bg-amber-900/60 text-amber-300 border border-amber-500/40 text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <span>🔒</span> Apply Legal Hold
          </button>
          <button
            onClick={() => { fetchStats(); fetchLogs(); }}
            className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-slate-700 hover:border-cyan-400/40 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <span>🔄</span> Refresh
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="glass-card p-5 border border-cyan-500/20 rounded-xl">
          <div className="text-[11px] font-mono font-semibold uppercase text-slate-400 tracking-wider">Total Provenance Logs</div>
          <div className="text-2xl font-black text-white mt-1">
            {stats ? stats.total_events.toLocaleString() : '...'}
          </div>
          <div className="text-[11px] text-cyan-400/80 mt-1 font-mono">Immutable PostgreSQL append-only</div>
        </div>

        <div className="glass-card p-5 border border-rose-500/30 rounded-xl">
          <div className="text-[11px] font-mono font-semibold uppercase text-rose-400 tracking-wider flex items-center gap-1">
            <span>🛡️</span> Security Denials
          </div>
          <div className="text-2xl font-black text-rose-400 mt-1">
            {stats ? stats.clearance_denials.toLocaleString() : '...'}
          </div>
          <div className="text-[11px] text-rose-400/80 mt-1 font-mono">Zero data leakage blocked</div>
        </div>

        <div className="glass-card p-5 border border-cyan-500/20 rounded-xl">
          <div className="text-[11px] font-mono font-semibold uppercase text-sky-400 tracking-wider flex items-center gap-1">
            <span>✏️</span> Curations & Approvals
          </div>
          <div className="text-2xl font-black text-sky-300 mt-1">
            {stats ? stats.curation_actions.toLocaleString() : '...'}
          </div>
          <div className="text-[11px] text-slate-400 mt-1 font-mono">Human-in-the-loop review actions</div>
        </div>

        <div className="glass-card p-5 border border-amber-500/30 rounded-xl">
          <div className="text-[11px] font-mono font-semibold uppercase text-amber-400 tracking-wider flex items-center gap-1">
            <span>🔒</span> Active Legal Holds
          </div>
          <div className="text-2xl font-black text-amber-300 mt-1">
            {stats ? stats.active_legal_holds.toLocaleString() : '...'}
          </div>
          <div className="text-[11px] text-amber-400/80 mt-1 font-mono">Protected from purge/deletion</div>
        </div>
      </div>

      {/* Permission Block Message */}
      {error && (
        <div className="p-4 rounded-xl bg-rose-950/60 border border-rose-500/50 text-rose-200 text-sm flex items-start justify-between gap-4 shadow-lg">
          <div className="flex items-start gap-3">
            <span className="text-xl">⛔</span>
            <div>
              <p className="font-bold text-rose-300">Access Restricted</p>
              <p className="text-xs text-rose-200/90 mt-0.5">{error}</p>
            </div>
          </div>
          <Link
            href="/login"
            className="shrink-0 px-3.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold uppercase tracking-wider transition-colors"
          >
            Switch to Auditor Persona →
          </Link>
        </div>
      )}

      {/* Filters Bar */}
      <div className="glass-card p-4 border border-cyan-500/20 rounded-xl shadow-md flex flex-col md:flex-row items-stretch md:items-center gap-3">
        <div className="flex-1">
          <input
            type="text"
            placeholder="Search by Memory ID, actor username, IP address, or details payload..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { setPage(1); fetchLogs(); } }}
            className="w-full bg-slate-900/80 border border-slate-700 rounded-lg px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400/50"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <select
            value={selectedAction}
            onChange={(e) => { setSelectedAction(e.target.value); setPage(1); }}
            className="bg-slate-900/80 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-400"
          >
            <option value="All" className="bg-slate-900">All Actions</option>
            <option value="CLEARANCE_DENIAL" className="bg-slate-900">CLEARANCE_DENIAL</option>
            <option value="CURATE" className="bg-slate-900">CURATE</option>
            <option value="APPROVE" className="bg-slate-900">APPROVE</option>
            <option value="REJECT" className="bg-slate-900">REJECT</option>
            <option value="LEGAL_HOLD_APPLIED" className="bg-slate-900">LEGAL_HOLD_APPLIED</option>
            <option value="LEGAL_HOLD_REMOVED" className="bg-slate-900">LEGAL_HOLD_REMOVED</option>
            <option value="SEARCH" className="bg-slate-900">SEARCH</option>
            <option value="VIEW_TEXT" className="bg-slate-900">VIEW_TEXT</option>
            <option value="CAPTURE" className="bg-slate-900">CAPTURE</option>
            <option value="HARD_DELETE" className="bg-slate-900">HARD_DELETE</option>
          </select>

          <select
            value={selectedRole}
            onChange={(e) => { setSelectedRole(e.target.value); setPage(1); }}
            className="bg-slate-900/80 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-400"
          >
            <option value="All" className="bg-slate-900">All Roles</option>
            <option value="TenantAdmin" className="bg-slate-900">TenantAdmin</option>
            <option value="DeptAdmin" className="bg-slate-900">DeptAdmin</option>
            <option value="Researcher" className="bg-slate-900">Researcher</option>
            <option value="Auditor" className="bg-slate-900">Auditor</option>
          </select>

          <button
            onClick={() => { setPage(1); fetchLogs(); }}
            className="btn-primary-cyan px-4 py-2 text-xs uppercase font-bold tracking-wider rounded-lg transition-all cursor-pointer"
          >
            Filter
          </button>
        </div>
      </div>

      {/* Audit Log Table */}
      <div className="glass-card border border-cyan-500/20 rounded-2xl overflow-hidden shadow-2xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-900/90 border-b border-slate-800 text-[11px] font-bold uppercase tracking-wider text-cyan-400 font-mono">
                <th className="py-3.5 px-4">Timestamp (UTC)</th>
                <th className="py-3.5 px-4">Actor</th>
                <th className="py-3.5 px-4">Action</th>
                <th className="py-3.5 px-4">Target ID</th>
                <th className="py-3.5 px-4">Sensitivity</th>
                <th className="py-3.5 px-4">Network IP</th>
                <th className="py-3.5 px-4 text-right">Provenance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono">
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400">
                    <span className="inline-block animate-spin mr-2">⚙️</span>
                    Loading institutional compliance logs...
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-500">
                    No audit records match the current filters.
                  </td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr key={log.id} className="hover:bg-cyan-950/20 transition-colors">
                    <td className="py-3.5 px-4 text-slate-400 whitespace-nowrap">
                      {log.timestamp ? new Date(log.timestamp).toLocaleString() : 'N/A'}
                    </td>
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-white">{log.username}</span>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                          {log.user_role}
                        </span>
                      </div>
                      {log.department && (
                        <div className="text-[10px] text-slate-500 font-sans">{log.department}</div>
                      )}
                    </td>
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <span className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${getActionBadge(log.action)}`}>
                        {log.action}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      {log.memory_id ? (
                        <span className="text-cyan-300 font-bold bg-cyan-950/60 px-2 py-0.5 rounded border border-cyan-500/30">
                          {log.memory_id}
                        </span>
                      ) : (
                        <span className="text-slate-600">—</span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      {log.sensitivity_level ? (
                        <span className="text-slate-300 text-[11px]">
                          {log.sensitivity_level}
                        </span>
                      ) : (
                        <span className="text-slate-600">—</span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-slate-400 whitespace-nowrap">
                      {log.ip_address || '127.0.0.1'}
                    </td>
                    <td className="py-3.5 px-4 text-right whitespace-nowrap">
                      <button
                        onClick={() => setActiveDetailsLog(log)}
                        className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-cyan-300 text-[11px] font-semibold border border-slate-700 hover:border-cyan-400/40 transition-colors cursor-pointer"
                      >
                        Inspect Details
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        <div className="bg-slate-900/90 border-t border-slate-800 px-4 py-3 flex items-center justify-between text-xs text-slate-400">
          <div>
            Showing <strong className="text-white">{logs.length}</strong> of <strong className="text-white">{totalCount}</strong> recorded events
          </div>
          <div className="flex items-center gap-2">
            <button
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(p - 1, 1))}
              className="px-3 py-1 rounded-lg bg-slate-800 border border-slate-700 text-white disabled:opacity-40 hover:bg-slate-700 transition-colors cursor-pointer"
            >
              Previous
            </button>
            <span className="px-2">Page {page} of {totalPages}</span>
            <button
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="px-3 py-1 rounded-lg bg-slate-800 border border-slate-700 text-white disabled:opacity-40 hover:bg-slate-700 transition-colors cursor-pointer"
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {/* Details JSON Modal */}
      {activeDetailsLog && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="glass-panel border border-cyan-500/30 rounded-2xl max-w-xl w-full p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
              <div className="flex items-center gap-2">
                <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${getActionBadge(activeDetailsLog.action)}`}>
                  {activeDetailsLog.action}
                </span>
                <h3 className="text-sm font-bold text-white font-mono">
                  Log Record #{activeDetailsLog.id}
                </h3>
              </div>
              <button
                onClick={() => setActiveDetailsLog(null)}
                className="text-slate-400 hover:text-white text-base cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs mb-4">
              <div className="grid grid-cols-2 gap-2 bg-slate-900/80 p-3 rounded-xl border border-slate-800 font-mono">
                <div>
                  <span className="text-slate-400">Actor:</span> <span className="text-white ml-1">{activeDetailsLog.username}</span>
                </div>
                <div>
                  <span className="text-slate-400">Role:</span> <span className="text-white ml-1">{activeDetailsLog.user_role}</span>
                </div>
                <div>
                  <span className="text-slate-400">Target ID:</span> <span className="text-cyan-300 ml-1">{activeDetailsLog.memory_id || 'N/A'}</span>
                </div>
                <div>
                  <span className="text-slate-400">Clearance:</span> <span className="text-white ml-1">{activeDetailsLog.clearance_level || 'N/A'}</span>
                </div>
                <div>
                  <span className="text-slate-400">IP Address:</span> <span className="text-white ml-1">{activeDetailsLog.ip_address}</span>
                </div>
                <div>
                  <span className="text-slate-400">Timestamp:</span> <span className="text-white ml-1">{new Date(activeDetailsLog.timestamp).toLocaleTimeString()}</span>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-mono font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                  Provenance Details Payload (JSON)
                </label>
                <pre className="bg-slate-950 border border-slate-800 rounded-xl p-3 text-[11px] text-cyan-300 font-mono overflow-x-auto max-h-56">
                  {JSON.stringify(activeDetailsLog.details || {}, null, 2)}
                </pre>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setActiveDetailsLog(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-semibold cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Legal Hold Modal */}
      {isHoldModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="glass-panel border border-cyan-500/30 rounded-2xl max-w-md w-full p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <span>🔒</span> Institutional Legal Hold Management
              </h3>
              <button
                onClick={() => setIsHoldModalOpen(false)}
                className="text-slate-400 hover:text-white text-base cursor-pointer"
              >
                ✕
              </button>
            </div>

            {holdMessage && (
              <div className={`p-3 rounded-xl text-xs font-medium mb-4 ${holdMessage.startsWith('Success') ? 'bg-emerald-950/60 text-emerald-300 border border-emerald-500/40' : 'bg-rose-950/60 text-rose-300 border border-rose-500/40'}`}>
                {holdMessage}
              </div>
            )}

            <form onSubmit={handleApplyLegalHold} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
                  Target Memory ID
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. MEM-GRT-017992"
                  value={holdMemoryId}
                  onChange={(e) => setHoldMemoryId(e.target.value)}
                  className="w-full bg-slate-900/80 border border-slate-700 rounded-lg px-3.5 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400/50"
                />
              </div>

              <div>
                <label className="block font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
                  Legal Action Type
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setHoldActionType(true)}
                    className={`py-2 px-3 rounded-lg border font-bold text-xs cursor-pointer ${holdActionType ? 'bg-amber-600 text-slate-950 border-amber-500' : 'bg-slate-900 text-slate-400 border-slate-800'}`}
                  >
                    🔒 Place On Hold
                  </button>
                  <button
                    type="button"
                    onClick={() => setHoldActionType(false)}
                    className={`py-2 px-3 rounded-lg border font-bold text-xs cursor-pointer ${!holdActionType ? 'bg-emerald-600 text-white border-emerald-500' : 'bg-slate-900 text-slate-400 border-slate-800'}`}
                  >
                    🔓 Release Hold
                  </button>
                </div>
              </div>

              <div>
                <label className="block font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
                  Legal / Compliance Justification
                </label>
                <textarea
                  rows={3}
                  required
                  placeholder="Federal agency audit inquiry, subpoena, internal review, or patent protection..."
                  value={holdReason}
                  onChange={(e) => setHoldReason(e.target.value)}
                  className="w-full bg-slate-900/80 border border-slate-700 rounded-lg px-3.5 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400/50"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsHoldModalOpen(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={holdSubmitting}
                  className="btn-primary-cyan px-4 py-2 font-bold rounded-lg transition-all cursor-pointer disabled:opacity-50"
                >
                  {holdSubmitting ? 'Submitting...' : 'Confirm Action'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
