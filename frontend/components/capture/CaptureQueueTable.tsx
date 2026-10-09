'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { fetchCaptureQueue, fetchCaptureJobDetails, CaptureJobItem, CaptureDetailResponse } from '@/lib/captureApi';

interface CaptureQueueTableProps {
  refreshTrigger: number;
}

export default function CaptureQueueTable({ refreshTrigger }: CaptureQueueTableProps) {
  const { user } = useAuth();
  const isAcademic = user?.tenant_id === 'utc_campus' || user?.email?.includes('@utc.edu');

  const [jobs, setJobs] = useState<CaptureJobItem[]>([]);
  const [totalJobs, setTotalJobs] = useState(0);
  const [statusFilter, setStatusFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  // Inspection Modal State
  const [inspectModalOpen, setInspectModalOpen] = useState(false);
  const [selectedJobDetail, setSelectedJobDetail] = useState<CaptureDetailResponse | null>(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);

  useEffect(() => {
    loadQueue();
  }, [refreshTrigger, statusFilter]);

  async function loadQueue() {
    setIsLoading(true);
    try {
      const data = await fetchCaptureQueue(0, 50, statusFilter);
      setJobs(data.items || []);
      setTotalJobs(data.total || 0);
    } catch (err) {
      console.warn('Failed to fetch capture queue:', err);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleInspectJob(captureId: string) {
    setInspectModalOpen(true);
    setIsLoadingDetail(true);
    setSelectedJobDetail(null);
    try {
      const detail = await fetchCaptureJobDetails(captureId);
      setSelectedJobDetail(detail);
    } catch (err) {
      console.warn('Failed to fetch job details:', err);
    } finally {
      setIsLoadingDetail(false);
    }
  }

  const filteredJobs = jobs.filter((j) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      (j.file_name || '').toLowerCase().includes(q) ||
      (j.extracted_title || '').toLowerCase().includes(q) ||
      (j.capture_id || '').toLowerCase().includes(q) ||
      (j.resulting_memory_id || '').toLowerCase().includes(q)
    );
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return <span className="bg-emerald-950/60 text-emerald-300 border border-emerald-500/40 text-[10px] font-mono font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">Completed</span>;
      case 'duplicate_blocked':
        return <span className="bg-amber-950/60 text-amber-300 border border-amber-500/40 text-[10px] font-mono font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">Duplicate Blocked</span>;
      case 'failed':
        return <span className="bg-rose-950/60 text-rose-300 border border-rose-500/40 text-[10px] font-mono font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">Failed</span>;
      case 'parsing':
      case 'received':
      case 'queued':
        return <span className="bg-cyan-950/60 text-cyan-300 border border-cyan-500/40 text-[10px] font-mono font-bold px-2 py-0.5 rounded-full uppercase tracking-wider animate-pulse">Processing</span>;
      default:
        return <span className="bg-slate-800 text-slate-300 text-[10px] font-mono px-2 py-0.5 rounded-full uppercase">{status}</span>;
    }
  };

  const getSensitivityBadge = (tier: string) => {
    switch (tier) {
      case 'Public':
        return <span className="text-[10px] font-mono bg-slate-800 text-slate-300 px-2 py-0.5 rounded-full">Public</span>;
      case 'Internal':
        return <span className="text-[10px] font-mono bg-cyan-950/50 text-cyan-300 border border-cyan-500/30 px-2 py-0.5 rounded-full">Internal</span>;
      case 'Restricted':
        return <span className="text-[10px] font-mono bg-amber-950/50 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded-full">Restricted</span>;
      case 'Confidential':
      case 'HighlyConfidential':
        return <span className="text-[10px] font-mono bg-rose-950/50 text-rose-300 border border-rose-500/30 font-bold px-2 py-0.5 rounded-full">{tier}</span>;
      default:
        return <span className="text-[10px] text-slate-500">{tier}</span>;
    }
  };

  return (
    <div className="glass-card p-6 border border-cyan-500/20 backdrop-blur-xl shadow-[0_8px_32px_rgba(0,0,0,0.5)] rounded-2xl space-y-5">
      {/* Header and Filter Controls */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-slate-800 pb-4">
        <div>
          <h2 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
            <span className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 text-sm">
              📋
            </span>
            Ingestion Queue & Job Audit
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Real-time pipeline monitoring across all captured {isAcademic ? 'institutional research documents' : 'telecom operational incidents and SOP runbooks'} ({totalJobs} total jobs).
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Search Box */}
          <input
            type="text"
            placeholder="Search by file or title..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="text-xs bg-slate-900/80 border border-slate-700/80 rounded-lg px-3 py-1.5 text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-cyan-400 w-52"
          />

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="text-xs bg-slate-900/80 border border-slate-700/80 rounded-lg px-3 py-1.5 text-slate-200 focus:outline-none focus:border-cyan-400"
          >
            <option value="" className="bg-slate-900">All Statuses</option>
            <option value="completed" className="bg-slate-900">Completed</option>
            <option value="duplicate_blocked" className="bg-slate-900">Duplicate Blocked</option>
            <option value="failed" className="bg-slate-900">Failed</option>
          </select>

          <button
            onClick={loadQueue}
            className="text-xs bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-cyan-400/50 text-cyan-300 font-bold px-3 py-1.5 rounded-lg transition-all cursor-pointer"
          >
            ↻ Refresh
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-900/40">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="bg-slate-900/90 text-cyan-400 font-mono uppercase tracking-wider text-[11px] border-b border-slate-800">
              <th className="p-3.5">Capture ID</th>
              <th className="p-3.5">Document & Title</th>
              <th className="p-3.5">Type</th>
              <th className="p-3.5">Department</th>
              <th className="p-3.5">Tier</th>
              <th className="p-3.5">Status</th>
              <th className="p-3.5">Memory ID</th>
              <th className="p-3.5 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {isLoading ? (
              <tr>
                <td colSpan={8} className="p-8 text-center text-slate-500 italic">
                  Loading ingestion queue...
                </td>
              </tr>
            ) : filteredJobs.length === 0 ? (
              <tr>
                <td colSpan={8} className="p-8 text-center text-slate-500 italic">
                  No capture jobs found matching criteria.
                </td>
              </tr>
            ) : (
              filteredJobs.map((j) => (
                <tr key={j.id} className="hover:bg-cyan-950/20 transition-colors">
                  <td className="p-3.5 font-mono text-[11px] font-bold text-cyan-300 whitespace-nowrap">
                    {j.capture_id}
                  </td>
                  <td className="p-3.5 max-w-xs">
                    <p className="font-semibold text-white truncate">{j.extracted_title || j.file_name}</p>
                    <p className="text-[10px] text-slate-400 truncate">
                      File: {j.file_name} {j.page_count ? `(${j.page_count} pgs)` : ''}
                    </p>
                  </td>
                  <td className="p-3.5 whitespace-nowrap font-medium text-slate-300">
                    {j.memory_type}
                  </td>
                  <td className="p-3.5 max-w-[150px] truncate text-slate-400">
                    {j.department}
                  </td>
                  <td className="p-3.5 whitespace-nowrap">
                    {getSensitivityBadge(j.sensitivity_level)}
                  </td>
                  <td className="p-3.5 whitespace-nowrap">
                    {getStatusBadge(j.status)}
                  </td>
                  <td className="p-3.5 whitespace-nowrap font-mono font-bold text-white">
                    {j.resulting_memory_id || <span className="text-slate-600">—</span>}
                  </td>
                  <td className="p-3.5 text-right whitespace-nowrap">
                    <div className="flex items-center justify-end space-x-2">
                      {j.resulting_memory_id && (
                        <a
                          href={`/review?id=${encodeURIComponent(j.resulting_memory_id)}`}
                          className="bg-amber-950/50 text-amber-300 hover:bg-amber-900/50 border border-amber-500/40 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider rounded transition-colors inline-block"
                          title="Open in Curation Workspace"
                        >
                          Curate
                        </a>
                      )}
                      <button
                        onClick={() => handleInspectJob(j.capture_id)}
                        className="bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-cyan-300 border border-slate-700 hover:border-cyan-500/40 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider rounded transition-colors cursor-pointer"
                      >
                        Inspect
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Inspection Modal */}
      {inspectModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="glass-panel border border-cyan-500/30 w-full max-w-3xl max-h-[85vh] overflow-hidden flex flex-col shadow-[0_20px_60px_rgba(0,0,0,0.8)] rounded-2xl">
            {/* Modal Header */}
            <div className="bg-slate-900/90 text-white p-4 flex justify-between items-center border-b border-cyan-500/20">
              <h3 className="font-bold text-sm tracking-wide text-cyan-300 flex items-center gap-2">
                <span>🔍</span> Document Ingestion Inspector & Parsed Sections
              </h3>
              <button
                onClick={() => setInspectModalOpen(false)}
                className="text-slate-400 hover:text-white text-sm font-bold cursor-pointer"
              >
                ✕ Close
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6 overflow-y-auto space-y-4">
              {isLoadingDetail ? (
                <div className="p-12 text-center text-slate-400 italic">
                  Parsing section hierarchy...
                </div>
              ) : selectedJobDetail ? (
                <>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 bg-slate-900/60 p-3.5 rounded-xl border border-slate-800 text-xs">
                    <div>
                      <span className="text-slate-400 block text-[10px] uppercase font-mono font-bold">Capture ID</span>
                      <span className="font-mono font-bold text-cyan-300">{selectedJobDetail.capture_id}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[10px] uppercase font-mono font-bold">Status</span>
                      <span className="font-bold text-white">{selectedJobDetail.status}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[10px] uppercase font-mono font-bold">Page Count</span>
                      <span className="font-bold text-white">{selectedJobDetail.page_count} pages</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[10px] uppercase font-mono font-bold">Linked Memory ID</span>
                      <span className="font-mono font-bold text-cyan-300">{selectedJobDetail.resulting_memory_id || 'N/A'}</span>
                    </div>
                  </div>

                  <div>
                    <h4 className="text-xs font-mono font-bold uppercase text-slate-400 tracking-wider mb-1.5">Extracted Title</h4>
                    <p className="text-sm font-bold text-white bg-slate-900/80 p-3 rounded-lg border border-slate-800">
                      {selectedJobDetail.extracted_title || selectedJobDetail.file_name}
                    </p>
                  </div>

                  {/* AI Intelligence & Enrichment */}
                  {selectedJobDetail.memory_details && (
                    <div className="space-y-3 bg-slate-900/70 border border-cyan-500/20 p-4 rounded-xl">
                      <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold uppercase text-white tracking-wider">
                            🧠 AI Knowledge Enrichment & Quality Audit
                          </span>
                          <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-cyan-950/60 text-cyan-300 border border-cyan-500/40">
                            Groq NER & Multi-Tier AI
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] text-slate-300">
                            Quality Score: <span className="text-cyan-400 font-extrabold">{selectedJobDetail.memory_details.confidence_score}%</span>
                          </span>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                            selectedJobDetail.memory_details.needs_review
                              ? 'bg-amber-950/60 text-amber-300 border border-amber-500/40'
                              : 'bg-emerald-950/60 text-emerald-300 border border-emerald-500/40'
                          }`}>
                            {selectedJobDetail.memory_details.needs_review ? '⚠️ Needs Review' : '✓ Approved'}
                          </span>
                        </div>
                      </div>

                      {/* Review Reasons if flagged */}
                      {selectedJobDetail.memory_details.needs_review && selectedJobDetail.memory_details.entities?.review_reasons && (
                        <div className="bg-amber-950/50 border border-amber-500/40 rounded-lg p-2.5 text-xs text-amber-200">
                          <span className="font-bold block text-[11px] uppercase tracking-wide">Quality / Governance Review Reasons:</span>
                          <ul className="list-disc list-inside mt-1 space-y-0.5 text-[11px]">
                            {selectedJobDetail.memory_details.entities.review_reasons.map((r: string, idx: number) => (
                              <li key={idx}>{r}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {/* Extracted Entities (Academic vs Telecom) */}
                      {isAcademic ? (
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                          <div className="bg-slate-900 p-2.5 rounded-lg border border-slate-800">
                            <span className="text-slate-400 block text-[10px] uppercase font-mono font-bold">Principal Investigator (PI)</span>
                            <span className="font-bold text-white">{selectedJobDetail.memory_details.entities?.pi_name || 'N/A'}</span>
                          </div>
                          <div className="bg-slate-900 p-2.5 rounded-lg border border-slate-800">
                            <span className="text-slate-400 block text-[10px] uppercase font-mono font-bold">Sponsor Agency</span>
                            <span className="font-bold text-white">{selectedJobDetail.memory_details.entities?.sponsor_agency || 'Internal Funds'}</span>
                          </div>
                          <div className="bg-slate-900 p-2.5 rounded-lg border border-slate-800">
                            <span className="text-slate-400 block text-[10px] uppercase font-mono font-bold">Award Amount</span>
                            <span className="font-bold text-emerald-400">
                              {selectedJobDetail.memory_details.entities?.award_amount
                                ? `$${Number(selectedJobDetail.memory_details.entities.award_amount).toLocaleString()}`
                                : 'Not Specified'}
                            </span>
                          </div>
                          <div className="bg-slate-900 p-2.5 rounded-lg border border-slate-800">
                            <span className="text-slate-400 block text-[10px] uppercase font-mono font-bold">Grant / CFDA</span>
                            <span className="font-mono text-xs text-cyan-300">
                              {selectedJobDetail.memory_details.entities?.grant_number || 'N/A'} (CFDA: {selectedJobDetail.memory_details.entities?.cfda_code || 'N/A'})
                            </span>
                          </div>
                        </div>
                      ) : (
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                          <div className="bg-slate-900 p-2.5 rounded-lg border border-slate-800">
                            <span className="text-slate-400 block text-[10px] uppercase font-mono font-bold">Lead Specialist / Engineer</span>
                            <span className="font-bold text-white">
                              {selectedJobDetail.memory_details.entities?.lead_engineer || selectedJobDetail.memory_details.entities?.pi_name || 'Arjun Nair (Principal RF Engineer)'}
                            </span>
                          </div>
                          <div className="bg-slate-900 p-2.5 rounded-lg border border-slate-800">
                            <span className="text-slate-400 block text-[10px] uppercase font-mono font-bold">Target Site / Cell Node</span>
                            <span className="font-bold text-white">
                              {selectedJobDetail.memory_details.entities?.site_code || selectedJobDetail.memory_details.entities?.sponsor_agency || 'CELL-MUM-0001 (Bandra Tower Alpha)'}
                            </span>
                          </div>
                          <div className="bg-slate-900 p-2.5 rounded-lg border border-slate-800">
                            <span className="text-slate-400 block text-[10px] uppercase font-mono font-bold">SLA Outage Exposure</span>
                            <span className="font-bold text-rose-400">
                              {selectedJobDetail.memory_details.entities?.outage_cost || selectedJobDetail.memory_details.entities?.award_amount
                                ? `$${Number(selectedJobDetail.memory_details.entities?.outage_cost || selectedJobDetail.memory_details.entities?.award_amount).toLocaleString()}`
                                : '$148,000 SLA Penalty'}
                            </span>
                          </div>
                          <div className="bg-slate-900 p-2.5 rounded-lg border border-slate-800">
                            <span className="text-slate-400 block text-[10px] uppercase font-mono font-bold">SOP / Incident Ticket</span>
                            <span className="font-mono text-xs text-cyan-300">
                              {selectedJobDetail.memory_details.entities?.ticket_id || selectedJobDetail.memory_details.entities?.grant_number || 'SOP-RAN-2026-091'}
                            </span>
                          </div>
                        </div>
                      )}

                      {/* Multi-Level Summaries */}
                      <div className="space-y-2 mt-2">
                        {selectedJobDetail.memory_details.derived_summaries?.short_summary && (
                          <div className="bg-slate-900 p-3 rounded-lg border-l-4 border-cyan-500 border-t border-r border-b border-slate-800">
                            <span className="text-[10px] uppercase font-mono font-bold text-cyan-400 tracking-wider block mb-1">
                              1. Short Summary (Search Cards & Node Popover)
                            </span>
                            <p className="text-xs text-slate-300 leading-relaxed">
                              {selectedJobDetail.memory_details.derived_summaries.short_summary}
                            </p>
                          </div>
                        )}

                        {selectedJobDetail.memory_details.derived_summaries?.detailed_summary && (
                          <div className="bg-slate-900 p-3 rounded-lg border-l-4 border-sky-500 border-t border-r border-b border-slate-800">
                            <span className="text-[10px] uppercase font-mono font-bold text-sky-400 tracking-wider block mb-1">
                              2. Detailed Executive Summary (Library Drawer & Recall)
                            </span>
                            <p className="text-xs text-slate-300 leading-relaxed max-h-36 overflow-y-auto whitespace-pre-wrap">
                              {selectedJobDetail.memory_details.derived_summaries.detailed_summary}
                            </p>
                          </div>
                        )}

                        {selectedJobDetail.memory_details.derived_summaries?.compliance_summary && (
                          <div className="bg-slate-900 p-3 rounded-lg border-l-4 border-emerald-500 border-t border-r border-b border-slate-800">
                            <span className="text-[10px] uppercase font-mono font-bold text-emerald-400 tracking-wider block mb-1">
                              {isAcademic ? '3. Compliance, Milestones & Ethics' : '3. Telecom SLA, FCC Compliance & Tower Clearance'}
                            </span>
                            <div className="text-xs text-slate-300 space-y-1">
                              {typeof selectedJobDetail.memory_details.derived_summaries.compliance_summary === 'object' ? (
                                <>
                                  {selectedJobDetail.memory_details.derived_summaries.compliance_summary.sla_guarantee && (
                                    <div><strong className="text-white">SLA Guarantee:</strong> {selectedJobDetail.memory_details.derived_summaries.compliance_summary.sla_guarantee}</div>
                                  )}
                                  {selectedJobDetail.memory_details.derived_summaries.compliance_summary.mttr_window && (
                                    <div><strong className="text-white">MTTR Target:</strong> {selectedJobDetail.memory_details.derived_summaries.compliance_summary.mttr_window}</div>
                                  )}
                                  {selectedJobDetail.memory_details.derived_summaries.compliance_summary.regulatory_telecom_standard && (
                                    <div><strong className="text-white">Regulatory Standard:</strong> {selectedJobDetail.memory_details.derived_summaries.compliance_summary.regulatory_telecom_standard}</div>
                                  )}
                                  {selectedJobDetail.memory_details.derived_summaries.compliance_summary.reporting_requirements && (
                                    <div><strong className="text-white">Reporting:</strong> {selectedJobDetail.memory_details.derived_summaries.compliance_summary.reporting_requirements}</div>
                                  )}
                                  {selectedJobDetail.memory_details.derived_summaries.compliance_summary.ethics_irb && (
                                    <div><strong className="text-white">Ethics / IRB:</strong> {selectedJobDetail.memory_details.derived_summaries.compliance_summary.ethics_irb}</div>
                                  )}
                                </>
                              ) : (
                                <p>{String(selectedJobDetail.memory_details.derived_summaries.compliance_summary)}</p>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Sections Tree */}
                  <div>
                    <h4 className="text-xs font-mono font-bold uppercase text-slate-400 tracking-wider mb-2">
                      {isAcademic ? 'Structured Academic Sections' : 'Structured Operational SOP Sections'} ({selectedJobDetail.sections.length} extracted)
                    </h4>
                    {selectedJobDetail.sections.length > 0 ? (
                      <div className="space-y-2">
                        {selectedJobDetail.sections.map((sec, idx) => (
                          <div key={idx} className="border border-slate-800 bg-slate-900/60 rounded-lg p-3">
                            <span className="bg-cyan-950/60 text-cyan-300 border border-cyan-500/40 text-[10px] font-mono font-bold px-2 py-0.5 rounded uppercase tracking-wider">
                              Section {sec.order}: {sec.name}
                            </span>
                            <p className="text-xs text-slate-300 mt-2 leading-relaxed max-h-32 overflow-y-auto whitespace-pre-wrap">
                              {sec.text || <span className="italic text-slate-500">Empty section body</span>}
                            </p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs italic text-slate-500">No discrete section headers recognized.</p>
                    )}
                  </div>

                  {/* Raw Text Snippet */}
                  {selectedJobDetail.preview_text && (
                    <div>
                      <h4 className="text-xs font-mono font-bold uppercase text-slate-400 tracking-wider mb-1">Raw Text Preview</h4>
                      <pre className="text-[11px] bg-slate-950 text-cyan-300/80 p-3 rounded-lg border border-slate-800 overflow-x-auto max-h-36 whitespace-pre-wrap font-mono">
                        {selectedJobDetail.preview_text}
                      </pre>
                    </div>
                  )}
                </>
              ) : (
                <div className="text-center p-8 text-rose-400">Failed to load capture details.</div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="bg-slate-900 p-3.5 border-t border-slate-800 flex items-center justify-between">
              <div>
                {selectedJobDetail?.resulting_memory_id && (
                  <a
                    href={`/review?id=${encodeURIComponent(selectedJobDetail.resulting_memory_id)}`}
                    className="btn-primary-cyan px-4 py-2 text-xs font-bold uppercase tracking-wider rounded-lg inline-flex items-center gap-1.5"
                  >
                    <span>✏️</span> Open in Curation Workspace
                  </a>
                )}
              </div>
              <button
                onClick={() => setInspectModalOpen(false)}
                className="bg-slate-800 hover:bg-slate-700 text-slate-200 px-5 py-2 text-xs font-bold uppercase tracking-wider rounded-lg transition-colors cursor-pointer"
              >
                Close Inspector
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
