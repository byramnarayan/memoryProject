'use client';

import React, { useState, useEffect, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import {
  ReviewItem,
  ReviewQueueResponse,
  fetchReviewQueue,
  fetchMemoryDetail,
  approveMemory
} from '@/lib/memoryApi';
import { MemoryCurator } from '@/components/review/MemoryCurator';

function ReviewContent() {
  const searchParams = useSearchParams();
  const urlMemoryId = searchParams.get('id');

  const [queueData, setQueueData] = useState<ReviewQueueResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filter States
  const [reviewState, setReviewState] = useState<'pending' | 'approved' | 'rejected' | 'all'>('pending');
  const [department, setDepartment] = useState<string>('All');
  const [memoryType, setMemoryType] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [page, setPage] = useState<number>(1);

  // Active Curator Modal
  const [activeMemory, setActiveMemory] = useState<ReviewItem | null>(null);
  const [isCuratorOpen, setIsCuratorOpen] = useState(false);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const loadQueue = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchReviewQueue({
        page,
        limit: 15,
        review_state: reviewState,
        department,
        memory_type: memoryType,
        search: searchQuery
      });
      setQueueData(data);

      // If URL has specific memory ID and not yet opened, open it
      if (urlMemoryId && !activeMemory) {
        try {
          const detail = await fetchMemoryDetail(urlMemoryId);
          setActiveMemory(detail);
          setIsCuratorOpen(true);
        } catch (e) {
          console.warn('Could not load specific memory from URL', e);
        }
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load review queue');
    } finally {
      setLoading(false);
    }
  }, [page, reviewState, department, memoryType, searchQuery, urlMemoryId, activeMemory]);

  useEffect(() => {
    loadQueue();
  }, [loadQueue]);

  const handleOpenCurator = (item: ReviewItem) => {
    setActiveMemory(item);
    setIsCuratorOpen(true);
  };

  const handleQuickApprove = async (e: React.MouseEvent, memoryId: string) => {
    e.stopPropagation();
    try {
      await approveMemory(memoryId);
      setActionSuccess(`Memory ${memoryId} quick-approved! Graph synced.`);
      setTimeout(() => setActionSuccess(null), 3000);
      loadQueue();
    } catch (err: any) {
      alert(err.message || 'Quick approve failed.');
    }
  };

  const handleCurationUpdated = (updated?: ReviewItem) => {
    if (updated) {
      setActiveMemory(updated);
    }
    loadQueue();
  };

  const stats = queueData?.stats || {
    pending_count: 0,
    approved_count: 0,
    rejected_count: 0,
    average_confidence: 0
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      <Header />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 pt-24 pb-16">
        
        {/* Page Title & Breadcrumb */}
        <div className="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-amber-400 mb-1">
              <span>MaaS Quality Assurance</span>
              <span>•</span>
              <span>Module 2 & 7 Curation Workspace</span>
            </div>
            <h1 className="text-3xl font-extrabold text-white tracking-tight">
              Memory Review & Curation Center
            </h1>
            <p className="text-sm text-slate-400 mt-1 max-w-2xl">
              Inspect, curate, and verify institutional memories with low extraction confidence before synching to live faculty profiles and knowledge graphs.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => loadQueue()}
              className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-700 rounded-lg text-xs font-medium flex items-center gap-1.5 transition"
            >
              <svg className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Refresh
            </button>
          </div>
        </div>

        {/* Global Toast Notification */}
        {actionSuccess && (
          <div className="mb-6 px-4 py-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-xl text-xs font-semibold flex items-center gap-2 animate-fade-in">
            <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
            </svg>
            {actionSuccess}
          </div>
        )}

        {/* Aggregate Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          
          <div className="bg-slate-900/80 border border-amber-500/30 rounded-xl p-4 shadow-lg backdrop-blur">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-amber-400">
                Pending Review
              </span>
              <span className="px-2 py-0.5 rounded-full text-[10px] bg-amber-500/20 text-amber-300 font-bold">
                Action Needed
              </span>
            </div>
            <div className="text-2xl font-black text-white mt-2">
              {stats.pending_count.toLocaleString()}
            </div>
            <p className="text-[11px] text-slate-400 mt-1">
              Low-confidence or unassigned PI records
            </p>
          </div>

          <div className="bg-slate-900/80 border border-emerald-500/30 rounded-xl p-4 shadow-lg backdrop-blur">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-emerald-400">
                Approved Records
              </span>
              <span className="px-2 py-0.5 rounded-full text-[10px] bg-emerald-500/20 text-emerald-300 font-bold">
                Indexed
              </span>
            </div>
            <div className="text-2xl font-black text-white mt-2">
              {stats.approved_count.toLocaleString()}
            </div>
            <p className="text-[11px] text-slate-400 mt-1">
              Live in Neo4j Aura knowledge graph
            </p>
          </div>

          <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 shadow-lg backdrop-blur">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Archived / Rejected
              </span>
              <span className="px-2 py-0.5 rounded-full text-[10px] bg-slate-800 text-slate-400 font-bold">
                Excluded
              </span>
            </div>
            <div className="text-2xl font-black text-white mt-2">
              {stats.rejected_count.toLocaleString()}
            </div>
            <p className="text-[11px] text-slate-400 mt-1">
              Discarded or flagged duplicate captures
            </p>
          </div>

          <div className="bg-slate-900/80 border border-blue-500/30 rounded-xl p-4 shadow-lg backdrop-blur">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-blue-400">
                Avg Quality Score
              </span>
              <span className="px-2 py-0.5 rounded-full text-[10px] bg-blue-500/20 text-blue-300 font-bold">
                Health
              </span>
            </div>
            <div className="text-2xl font-black text-white mt-2">
              {stats.average_confidence}%
            </div>
            <div className="w-full bg-slate-800 h-1.5 rounded-full mt-2 overflow-hidden">
              <div
                className="bg-gradient-to-r from-blue-500 to-amber-400 h-full rounded-full transition-all"
                style={{ width: `${Math.min(100, stats.average_confidence)}%` }}
              />
            </div>
          </div>

        </div>

        {/* Filter & Controls Toolbar */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 mb-6 shadow-sm">
          <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4">
            
            {/* Status Tabs */}
            <div className="flex items-center space-x-1 bg-slate-950 p-1 rounded-lg border border-slate-800">
              {(['pending', 'approved', 'rejected', 'all'] as const).map(st => (
                <button
                  key={st}
                  onClick={() => {
                    setReviewState(st);
                    setPage(1);
                  }}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold capitalize transition ${
                    reviewState === st
                      ? 'bg-amber-400 text-slate-950 shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {st === 'pending' ? `Pending (${stats.pending_count})` : st}
                </button>
              ))}
            </div>

            {/* Dropdowns & Search */}
            <div className="flex flex-wrap items-center gap-3">
              <select
                value={department}
                onChange={e => {
                  setDepartment(e.target.value);
                  setPage(1);
                }}
                className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-amber-400"
              >
                <option value="All">All Departments</option>
                <option value="Computer Science">Computer Science & Engineering</option>
                <option value="Mechanical">Mechanical & Aerospace</option>
                <option value="Marine">Marine & Coastal</option>
                <option value="Civil">Civil & Chemical</option>
                <option value="Research Division">Research Division</option>
              </select>

              <select
                value={memoryType}
                onChange={e => {
                  setMemoryType(e.target.value);
                  setPage(1);
                }}
                className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-amber-400"
              >
                <option value="All">All Types</option>
                <option value="GrantAward">Grant Award</option>
                <option value="ResearchProposal">Research Proposal</option>
                <option value="IRBProtocol">IRB Protocol</option>
                <option value="MeetingMinutes">Meeting Minutes</option>
                <option value="LabIncident">Lab Incident</option>
              </select>

              <div className="relative">
                <input
                  type="text"
                  placeholder="Search title, PI, or ID..."
                  value={searchQuery}
                  onChange={e => {
                    setSearchQuery(e.target.value);
                    setPage(1);
                  }}
                  className="bg-slate-950 border border-slate-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-white focus:outline-none focus:border-amber-400 w-48 sm:w-60"
                />
                <svg className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
            </div>

          </div>
        </div>

        {/* Review Queue Table */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950/80 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800">
                <tr>
                  <th className="py-3.5 px-4">Memory ID & Type</th>
                  <th className="py-3.5 px-4">Project Title & Department</th>
                  <th className="py-3.5 px-4">Principal Investigator</th>
                  <th className="py-3.5 px-4">Sponsor & Amount</th>
                  <th className="py-3.5 px-4 text-center">Score</th>
                  <th className="py-3.5 px-4">Flags & Reasons</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {loading ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-slate-500">
                      <div className="inline-block animate-spin rounded-full h-6 w-6 border-2 border-amber-400 border-t-transparent mb-2" />
                      <div>Loading curation review queue...</div>
                    </td>
                  </tr>
                ) : queueData?.items && queueData.items.length > 0 ? (
                  queueData.items.map(item => {
                    const pi = item.entities?.pi_name;
                    const sponsor = item.entities?.sponsor_agency;
                    const amount = item.entities?.award_amount;
                    const reasons = item.entities?.review_reasons || item.review_reasons || [];
                    const score = item.confidence_score;

                    return (
                      <tr
                        key={item.id}
                        onClick={() => handleOpenCurator(item)}
                        className="hover:bg-slate-800/40 cursor-pointer transition"
                      >
                        {/* Memory ID */}
                        <td className="py-3 px-4 font-mono font-medium whitespace-nowrap">
                          <span className="text-amber-400 font-semibold">{item.memory_id}</span>
                          <div className="text-[10px] text-slate-500 font-sans mt-0.5">
                            {item.memory_type}
                          </div>
                        </td>

                        {/* Title & Department */}
                        <td className="py-3 px-4 max-w-xs sm:max-w-sm">
                          <div className="font-semibold text-slate-100 line-clamp-1 hover:text-amber-300 transition">
                            {item.title}
                          </div>
                          <div className="text-[11px] text-slate-400 mt-0.5 line-clamp-1">
                            {item.entities?.department || 'Research Division'}
                          </div>
                        </td>

                        {/* PI */}
                        <td className="py-3 px-4 whitespace-nowrap">
                          {pi ? (
                            <div className="font-medium text-slate-200">{pi}</div>
                          ) : (
                            <span className="text-[10px] px-2 py-0.5 rounded bg-rose-500/10 text-rose-400 border border-rose-500/20 font-semibold">
                              Unassigned PI
                            </span>
                          )}
                          {item.entities?.co_pi_names && item.entities.co_pi_names.length > 0 && (
                            <div className="text-[10px] text-slate-500 mt-0.5">
                              +{item.entities.co_pi_names.length} Co-PI
                            </div>
                          )}
                        </td>

                        {/* Sponsor & Amount */}
                        <td className="py-3 px-4 whitespace-nowrap">
                          <div className="text-slate-300">{sponsor || 'Institutional Funds'}</div>
                          <div className="text-[11px] font-mono text-emerald-400 mt-0.5 font-semibold">
                            {amount ? `$${Number(amount).toLocaleString()}` : '$0'}
                          </div>
                        </td>

                        {/* Quality Score */}
                        <td className="py-3 px-4 text-center">
                          <span className={`inline-block px-2 py-0.5 rounded-full font-bold text-[10px] ${
                            score >= 85
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                              : score >= 70
                              ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                              : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                          }`}>
                            {score}%
                          </span>
                        </td>

                        {/* Flags */}
                        <td className="py-3 px-4 max-w-xs">
                          {reasons.length > 0 ? (
                            <div className="flex flex-col gap-1">
                              <span className="text-[10px] text-amber-300 font-medium line-clamp-1">
                                ⚠️ {reasons[0]}
                              </span>
                              {reasons.length > 1 && (
                                <span className="text-[9px] text-slate-500">
                                  +{reasons.length - 1} more review flags
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-[10px] text-emerald-400 flex items-center gap-1 font-medium">
                              ✓ Clean Extraction
                            </span>
                          )}
                        </td>

                        {/* Actions */}
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end space-x-2">
                            {item.needs_review && (
                              <button
                                onClick={e => handleQuickApprove(e, item.memory_id)}
                                title="Quick approve without changes"
                                className="px-2.5 py-1 text-[11px] font-medium text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10 border border-emerald-500/30 rounded transition"
                              >
                                Approve
                              </button>
                            )}
                            <button
                              onClick={() => handleOpenCurator(item)}
                              className="px-2.5 py-1 text-[11px] font-medium text-amber-400 hover:text-slate-950 hover:bg-amber-400 border border-amber-500/40 rounded transition"
                            >
                              Curate
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={7} className="py-16 text-center text-slate-400">
                      <div className="max-w-md mx-auto">
                        <svg className="w-10 h-10 text-slate-600 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <p className="font-semibold text-slate-200">No records found matching current criteria</p>
                        <p className="text-xs text-slate-500 mt-1">
                          All captured memories in this filter have been curated and approved into the knowledge graph.
                        </p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls */}
          {queueData?.pagination && queueData.pagination.total_pages > 1 && (
            <div className="p-4 bg-slate-950 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
              <div>
                Showing page <span className="font-bold text-white">{queueData.pagination.page}</span> of{' '}
                <span className="font-bold text-white">{queueData.pagination.total_pages}</span> (
                {queueData.pagination.total} records total)
              </div>
              <div className="flex items-center space-x-2">
                <button
                  disabled={page <= 1}
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  className="px-3 py-1 bg-slate-900 border border-slate-800 rounded hover:bg-slate-800 disabled:opacity-40 transition"
                >
                  Previous
                </button>
                <button
                  disabled={page >= queueData.pagination.total_pages}
                  onClick={() => setPage(p => p + 1)}
                  className="px-3 py-1 bg-slate-900 border border-slate-800 rounded hover:bg-slate-800 disabled:opacity-40 transition"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>

      </main>

      {/* Curator Modal */}
      {activeMemory && (
        <MemoryCurator
          memory={activeMemory}
          isOpen={isCuratorOpen}
          onClose={() => setIsCuratorOpen(false)}
          onUpdated={handleCurationUpdated}
        />
      )}

      <Footer />
    </div>
  );
}

export default function ReviewPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-950 text-white flex items-center justify-center">Loading Review Workspace...</div>}>
      <ReviewContent />
    </Suspense>
  );
}
