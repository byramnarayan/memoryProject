'use client';

import { useState, useEffect } from 'react';
import { fetchCaptureQueue, fetchCaptureJobDetails, CaptureJobItem, CaptureDetailResponse } from '@/lib/captureApi';

interface CaptureQueueTableProps {
  refreshTrigger: number;
}

export default function CaptureQueueTable({ refreshTrigger }: CaptureQueueTableProps) {
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
        return <span className="bg-emerald-100 text-emerald-800 border border-emerald-300 text-[10px] font-bold px-2 py-0.5 uppercase tracking-wider">Completed</span>;
      case 'duplicate_blocked':
        return <span className="bg-amber-100 text-amber-800 border border-amber-300 text-[10px] font-bold px-2 py-0.5 uppercase tracking-wider">Duplicate Blocked</span>;
      case 'failed':
        return <span className="bg-red-100 text-red-800 border border-red-300 text-[10px] font-bold px-2 py-0.5 uppercase tracking-wider">Failed</span>;
      case 'parsing':
      case 'received':
      case 'queued':
        return <span className="bg-blue-100 text-blue-800 border border-blue-300 text-[10px] font-bold px-2 py-0.5 uppercase tracking-wider animate-pulse">Processing</span>;
      default:
        return <span className="bg-slate-100 text-slate-700 text-[10px] font-bold px-2 py-0.5 uppercase">{status}</span>;
    }
  };

  const getSensitivityBadge = (tier: string) => {
    switch (tier) {
      case 'Public':
        return <span className="text-[10px] bg-slate-100 text-slate-700 font-semibold px-1.5 py-0.5">Public</span>;
      case 'Internal':
        return <span className="text-[10px] bg-blue-50 text-blue-700 border border-blue-200 font-semibold px-1.5 py-0.5">Internal</span>;
      case 'Restricted':
        return <span className="text-[10px] bg-amber-50 text-amber-700 border border-amber-200 font-semibold px-1.5 py-0.5">Restricted</span>;
      case 'Confidential':
      case 'HighlyConfidential':
        return <span className="text-[10px] bg-rose-50 text-rose-700 border border-rose-300 font-bold px-1.5 py-0.5">{tier}</span>;
      default:
        return <span className="text-[10px] text-slate-500">{tier}</span>;
    }
  };

  return (
    <div className="bg-white border border-brand p-6 shadow-md space-y-4">
      {/* Header and Filter Controls */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-slate-200 pb-4">
        <div>
          <h2 className="text-xl font-extrabold text-navy uppercase tracking-tight flex items-center gap-2">
            <span>📋</span> Ingestion Queue & Job Audit
          </h2>
          <p className="text-xs text-muted-grey mt-0.5">
            Real-time pipeline monitoring across all captured institutional research documents ({totalJobs} total jobs).
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Search Box */}
          <input
            type="text"
            placeholder="Search by file or title..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="text-xs bg-cream border border-brand px-3 py-1.5 focus:outline-none focus:border-gold w-48"
          />

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="text-xs bg-cream border border-brand px-3 py-1.5 focus:outline-none focus:border-gold"
          >
            <option value="">All Statuses</option>
            <option value="completed">Completed</option>
            <option value="duplicate_blocked">Duplicate Blocked</option>
            <option value="failed">Failed</option>
          </select>

          <button
            onClick={loadQueue}
            className="text-xs bg-navy text-white hover:bg-slate-800 font-bold px-3 py-1.5 transition-colors cursor-pointer"
          >
            ↻ Refresh
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="bg-navy text-white uppercase tracking-wider text-[11px]">
              <th className="p-3">Capture ID</th>
              <th className="p-3">Document & Title</th>
              <th className="p-3">Type</th>
              <th className="p-3">Department</th>
              <th className="p-3">Tier</th>
              <th className="p-3">Status</th>
              <th className="p-3">Memory ID</th>
              <th className="p-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {isLoading ? (
              <tr>
                <td colSpan={8} className="p-8 text-center text-muted-grey italic">
                  Loading ingestion queue...
                </td>
              </tr>
            ) : filteredJobs.length === 0 ? (
              <tr>
                <td colSpan={8} className="p-8 text-center text-muted-grey italic">
                  No capture jobs found matching criteria.
                </td>
              </tr>
            ) : (
              filteredJobs.map((j) => (
                <tr key={j.id} className="hover:bg-cream/50 transition-colors">
                  <td className="p-3 font-mono text-[11px] font-bold text-navy whitespace-nowrap">
                    {j.capture_id}
                  </td>
                  <td className="p-3 max-w-xs">
                    <p className="font-bold text-navy truncate">{j.extracted_title || j.file_name}</p>
                    <p className="text-[10px] text-muted-grey truncate">
                      File: {j.file_name} {j.page_count ? `(${j.page_count} pgs)` : ''}
                    </p>
                  </td>
                  <td className="p-3 whitespace-nowrap font-medium text-slate-700">
                    {j.memory_type}
                  </td>
                  <td className="p-3 max-w-[150px] truncate text-slate-600">
                    {j.department}
                  </td>
                  <td className="p-3 whitespace-nowrap">
                    {getSensitivityBadge(j.sensitivity_level)}
                  </td>
                  <td className="p-3 whitespace-nowrap">
                    {getStatusBadge(j.status)}
                  </td>
                  <td className="p-3 whitespace-nowrap font-mono font-bold text-navy">
                    {j.resulting_memory_id || <span className="text-slate-400">—</span>}
                  </td>
                  <td className="p-3 text-right whitespace-nowrap">
                    <div className="flex items-center justify-end space-x-1.5">
                      {j.resulting_memory_id && (
                        <a
                          href={`/review?id=${encodeURIComponent(j.resulting_memory_id)}`}
                          className="bg-amber-100 text-amber-900 hover:bg-amber-200 border border-amber-300 px-2 py-1 text-[11px] font-bold uppercase tracking-wider transition-colors inline-block"
                          title="Open in Curation Workspace"
                        >
                          Curate
                        </a>
                      )}
                      <button
                        onClick={() => handleInspectJob(j.capture_id)}
                        className="bg-cream border border-brand text-navy hover:bg-gold hover:text-navy px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider transition-colors cursor-pointer"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white border-2 border-brand w-full max-w-3xl max-h-[85vh] overflow-hidden flex flex-col shadow-2xl">
            {/* Modal Header */}
            <div className="bg-navy text-white p-4 flex justify-between items-center border-b border-gold">
              <h3 className="font-extrabold text-sm uppercase tracking-wider text-gold flex items-center gap-2">
                <span>🔍</span> Document Ingestion Inspector & Parsed Sections
              </h3>
              <button
                onClick={() => setInspectModalOpen(false)}
                className="text-white hover:text-gold text-sm font-bold cursor-pointer"
              >
                ✕ Close
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6 overflow-y-auto space-y-4">
              {isLoadingDetail ? (
                <div className="p-12 text-center text-muted-grey italic">
                  Parsing section hierarchy...
                </div>
              ) : selectedJobDetail ? (
                <>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 bg-cream p-3 border border-brand text-xs">
                    <div>
                      <span className="text-muted-grey block text-[10px] uppercase font-bold">Capture ID</span>
                      <span className="font-mono font-bold text-navy">{selectedJobDetail.capture_id}</span>
                    </div>
                    <div>
                      <span className="text-muted-grey block text-[10px] uppercase font-bold">Status</span>
                      <span className="font-bold">{selectedJobDetail.status}</span>
                    </div>
                    <div>
                      <span className="text-muted-grey block text-[10px] uppercase font-bold">Page Count</span>
                      <span className="font-bold">{selectedJobDetail.page_count} pages</span>
                    </div>
                    <div>
                      <span className="text-muted-grey block text-[10px] uppercase font-bold">Linked Memory ID</span>
                      <span className="font-mono font-bold text-navy">{selectedJobDetail.resulting_memory_id || 'N/A'}</span>
                    </div>
                  </div>

                  <div>
                    <h4 className="text-xs font-bold uppercase text-navy tracking-wider mb-1">Extracted Title</h4>
                    <p className="text-sm font-bold text-navy bg-slate-50 p-2.5 border border-slate-200">
                      {selectedJobDetail.extracted_title || selectedJobDetail.file_name}
                    </p>
                  </div>

                  {/* AI Intelligence & Enrichment (Session 04) */}
                  {selectedJobDetail.memory_details && (
                    <div className="space-y-3 bg-slate-50 border border-brand/30 p-4">
                      <div className="flex items-center justify-between border-b border-brand/20 pb-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-extrabold uppercase text-navy tracking-wider">
                            🧠 AI Knowledge Enrichment & Quality Audit
                          </span>
                          <span className="text-[10px] font-bold px-2 py-0.5 bg-navy text-gold">
                            Groq NER & Multi-Tier AI
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] font-bold text-slate-600">
                            Quality Score: <span className="text-navy font-extrabold">{selectedJobDetail.memory_details.confidence_score}%</span>
                          </span>
                          <span className={`text-[10px] font-bold px-2 py-0.5 uppercase tracking-wider ${
                            selectedJobDetail.memory_details.needs_review
                              ? 'bg-amber-100 text-amber-800 border border-amber-300'
                              : 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                          }`}>
                            {selectedJobDetail.memory_details.needs_review ? '⚠️ Needs Review' : '✓ Approved'}
                          </span>
                        </div>
                      </div>

                      {/* Review Reasons if flagged */}
                      {selectedJobDetail.memory_details.needs_review && selectedJobDetail.memory_details.entities?.review_reasons && (
                        <div className="bg-amber-50 border border-amber-200 p-2 text-xs text-amber-900">
                          <span className="font-bold block text-[11px] uppercase tracking-wide">Quality / Governance Review Reasons:</span>
                          <ul className="list-disc list-inside mt-1 space-y-0.5 text-[11px]">
                            {selectedJobDetail.memory_details.entities.review_reasons.map((r: string, idx: number) => (
                              <li key={idx}>{r}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {/* Extracted University Entities */}
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                        <div className="bg-white p-2 border border-slate-200">
                          <span className="text-muted-grey block text-[10px] uppercase font-bold">Principal Investigator (PI)</span>
                          <span className="font-bold text-navy">{selectedJobDetail.memory_details.entities?.pi_name || 'N/A'}</span>
                        </div>
                        <div className="bg-white p-2 border border-slate-200">
                          <span className="text-muted-grey block text-[10px] uppercase font-bold">Sponsor Agency</span>
                          <span className="font-bold text-navy">{selectedJobDetail.memory_details.entities?.sponsor_agency || 'Internal Funds'}</span>
                        </div>
                        <div className="bg-white p-2 border border-slate-200">
                          <span className="text-muted-grey block text-[10px] uppercase font-bold">Award Amount</span>
                          <span className="font-bold text-emerald-700">
                            {selectedJobDetail.memory_details.entities?.award_amount
                              ? `$${Number(selectedJobDetail.memory_details.entities.award_amount).toLocaleString()}`
                              : 'Not Specified'}
                          </span>
                        </div>
                        <div className="bg-white p-2 border border-slate-200">
                          <span className="text-muted-grey block text-[10px] uppercase font-bold">Grant / CFDA</span>
                          <span className="font-mono text-xs text-navy">
                            {selectedJobDetail.memory_details.entities?.grant_number || 'N/A'} (CFDA: {selectedJobDetail.memory_details.entities?.cfda_code || 'N/A'})
                          </span>
                        </div>
                      </div>

                      {/* Multi-Level Summaries */}
                      <div className="space-y-2 mt-2">
                        {/* 1. Short Summary */}
                        {selectedJobDetail.memory_details.derived_summaries?.short_summary && (
                          <div className="bg-white p-2.5 border-l-4 border-navy border-slate-200">
                            <span className="text-[10px] uppercase font-extrabold text-navy tracking-wider block mb-0.5">
                              1. Short Summary (Search Cards & Node Popover)
                            </span>
                            <p className="text-xs text-slate-800 leading-relaxed">
                              {selectedJobDetail.memory_details.derived_summaries.short_summary}
                            </p>
                          </div>
                        )}

                        {/* 2. Detailed Summary */}
                        {selectedJobDetail.memory_details.derived_summaries?.detailed_summary && (
                          <div className="bg-white p-2.5 border-l-4 border-gold border-slate-200">
                            <span className="text-[10px] uppercase font-extrabold text-navy tracking-wider block mb-0.5">
                              2. Detailed Executive Summary (Library Drawer & Recall)
                            </span>
                            <p className="text-xs text-slate-800 leading-relaxed max-h-36 overflow-y-auto whitespace-pre-wrap">
                              {selectedJobDetail.memory_details.derived_summaries.detailed_summary}
                            </p>
                          </div>
                        )}

                        {/* 3. Compliance Summary */}
                        {selectedJobDetail.memory_details.derived_summaries?.compliance_summary && (
                          <div className="bg-white p-2.5 border-l-4 border-emerald-600 border-slate-200">
                            <span className="text-[10px] uppercase font-extrabold text-navy tracking-wider block mb-0.5">
                              3. Compliance, Milestones & Ethics
                            </span>
                            <div className="text-xs text-slate-700 space-y-1">
                              {typeof selectedJobDetail.memory_details.derived_summaries.compliance_summary === 'object' ? (
                                <>
                                  {selectedJobDetail.memory_details.derived_summaries.compliance_summary.reporting_requirements && (
                                    <div><strong className="text-navy">Reporting:</strong> {selectedJobDetail.memory_details.derived_summaries.compliance_summary.reporting_requirements}</div>
                                  )}
                                  {selectedJobDetail.memory_details.derived_summaries.compliance_summary.ethics_irb && (
                                    <div><strong className="text-navy">Ethics / IRB:</strong> {selectedJobDetail.memory_details.derived_summaries.compliance_summary.ethics_irb}</div>
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
                    <h4 className="text-xs font-bold uppercase text-navy tracking-wider mb-2">
                      Structured Academic Sections ({selectedJobDetail.sections.length} extracted)
                    </h4>
                    {selectedJobDetail.sections.length > 0 ? (
                      <div className="space-y-2">
                        {selectedJobDetail.sections.map((sec, idx) => (
                          <div key={idx} className="border border-slate-200 bg-white p-3">
                            <span className="bg-navy text-gold text-[10px] font-bold px-2 py-0.5 uppercase tracking-wider">
                              Section {sec.order}: {sec.name}
                            </span>
                            <p className="text-xs text-slate-700 mt-2 leading-relaxed max-h-32 overflow-y-auto whitespace-pre-wrap">
                              {sec.text || <span className="italic text-slate-400">Empty section body</span>}
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
                      <h4 className="text-xs font-bold uppercase text-navy tracking-wider mb-1">Raw Text Preview</h4>
                      <pre className="text-[11px] bg-slate-900 text-slate-200 p-3 overflow-x-auto max-h-36 whitespace-pre-wrap font-mono">
                        {selectedJobDetail.preview_text}
                      </pre>
                    </div>
                  )}
                </>
              ) : (
                <div className="text-center p-8 text-red-600">Failed to load capture details.</div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="bg-cream p-3 border-t border-brand flex items-center justify-between">
              <div>
                {selectedJobDetail?.resulting_memory_id && (
                  <a
                    href={`/review?id=${encodeURIComponent(selectedJobDetail.resulting_memory_id)}`}
                    className="bg-gold text-navy hover:bg-yellow-400 border border-brand px-4 py-2 text-xs font-extrabold uppercase tracking-wider transition-colors inline-flex items-center gap-1.5"
                  >
                    <span>✏️</span> Open in Curation Workspace
                  </a>
                )}
              </div>
              <button
                onClick={() => setInspectModalOpen(false)}
                className="bg-navy text-white hover:bg-slate-800 px-5 py-2 text-xs font-extrabold uppercase tracking-wider transition-colors cursor-pointer"
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
