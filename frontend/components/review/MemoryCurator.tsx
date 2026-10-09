'use client';

import React, { useState, useEffect } from 'react';
import {
  ReviewItem,
  updateMemoryEntities,
  approveMemory,
  reExtractMemory,
  deleteMemory,
  CurateMemoryPayload
} from '@/lib/memoryApi';

interface MemoryCuratorProps {
  memory: ReviewItem;
  isOpen: boolean;
  onClose: () => void;
  onUpdated: (updatedMemory?: ReviewItem) => void;
}

const DEPARTMENTS = [
  'Computer Science & Engineering',
  'Civil & Chemical Engineering',
  'Electrical & Computer Engineering',
  'Mechanical & Aerospace Engineering',
  'Biological & Environmental Sciences',
  'Chemistry & Physics',
  'Marine & Coastal Sciences',
  'Biomedical & Health Sciences',
  'Mathematics',
  'Social & Behavioral Sciences',
  'Research Division'
];

const MEMORY_TYPES = [
  'GrantAward',
  'ResearchProposal',
  'IRBProtocol',
  'MeetingMinutes',
  'LabIncident'
];

const SENSITIVITY_LEVELS = [
  'Public',
  'Internal',
  'Restricted',
  'Confidential',
  'HighlyConfidential'
];

export const MemoryCurator: React.FC<MemoryCuratorProps> = ({
  memory,
  isOpen,
  onClose,
  onUpdated
}) => {
  const [formData, setFormData] = useState({
    title: memory.title || '',
    department: memory.entities?.department || 'Research Division',
    memory_type: memory.memory_type || 'GrantAward',
    sensitivity_level: memory.sensitivity_level || 'Public',
    pi_name: memory.entities?.pi_name || '',
    co_pis_raw: (memory.entities?.co_pi_names || []).join(', '),
    sponsor_agency: memory.entities?.sponsor_agency || '',
    award_amount: memory.entities?.award_amount ? String(memory.entities.award_amount) : '',
    grant_number: memory.entities?.grant_number || '',
    cfda_code: memory.entities?.cfda_code || '',
    short_summary: memory.derived_summaries?.short_summary || '',
    detailed_summary: memory.derived_summaries?.detailed_summary || '',
    compliance_summary: memory.derived_summaries?.compliance_summary || ''
  });

  const [activeTab, setActiveTab] = useState<'entities' | 'summaries'>('entities');
  const [searchTerm, setSearchTerm] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [isReExtracting, setIsReExtracting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    setFormData({
      title: memory.title || '',
      department: memory.entities?.department || 'Research Division',
      memory_type: memory.memory_type || 'GrantAward',
      sensitivity_level: memory.sensitivity_level || 'Public',
      pi_name: memory.entities?.pi_name || '',
      co_pis_raw: (memory.entities?.co_pi_names || []).join(', '),
      sponsor_agency: memory.entities?.sponsor_agency || '',
      award_amount: memory.entities?.award_amount ? String(memory.entities.award_amount) : '',
      grant_number: memory.entities?.grant_number || '',
      cfda_code: memory.entities?.cfda_code || '',
      short_summary: memory.derived_summaries?.short_summary || '',
      detailed_summary: memory.derived_summaries?.detailed_summary || '',
      compliance_summary: memory.derived_summaries?.compliance_summary || ''
    });
    setFeedback(null);
  }, [memory]);

  if (!isOpen) return null;

  const buildPayload = (approveImmediately: boolean = false): CurateMemoryPayload => {
    const co_pi_names = formData.co_pis_raw
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);

    return {
      title: formData.title,
      department: formData.department,
      memory_type: formData.memory_type,
      sensitivity_level: formData.sensitivity_level,
      entities: {
        ...memory.entities,
        pi_name: formData.pi_name,
        co_pi_names: co_pi_names,
        sponsor_agency: formData.sponsor_agency,
        award_amount: formData.award_amount ? parseFloat(formData.award_amount) : 0,
        grant_number: formData.grant_number,
        cfda_code: formData.cfda_code,
        department: formData.department
      },
      derived_summaries: {
        short_summary: formData.short_summary,
        detailed_summary: formData.detailed_summary,
        compliance_summary: formData.compliance_summary
      },
      approve_immediately: approveImmediately
    };
  };

  const handleSaveOnly = async () => {
    setIsSaving(true);
    setFeedback(null);
    try {
      const payload = buildPayload(false);
      const res = await updateMemoryEntities(memory.memory_id, payload);
      setFeedback({ type: 'success', message: 'Entities successfully saved and synced to Neo4j graph!' });
      setTimeout(() => {
        onUpdated(res.memory);
      }, 1000);
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Failed to save changes.' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleApprove = async () => {
    setIsApproving(true);
    setFeedback(null);
    try {
      // First update any edits, then approve
      const payload = buildPayload(true);
      const res = await updateMemoryEntities(memory.memory_id, payload);
      setFeedback({ type: 'success', message: `Memory ${memory.memory_id} approved! Live in Neo4j and search index.` });
      setTimeout(() => {
        onUpdated(res.memory);
        onClose();
      }, 1200);
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Failed to approve memory.' });
    } finally {
      setIsApproving(false);
    }
  };

  const handleReExtract = async () => {
    if (!confirm('Re-run AI extraction using Groq rotation? This will refresh entities and summaries.')) return;
    setIsReExtracting(true);
    setFeedback(null);
    try {
      const res = await reExtractMemory(memory.memory_id);
      setFeedback({ type: 'success', message: 'AI re-extraction completed successfully!' });
      onUpdated(res.memory);
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'AI re-extraction failed.' });
    } finally {
      setIsReExtracting(false);
    }
  };

  const handleReject = async () => {
    if (!confirm(`Are you sure you want to reject memory ${memory.memory_id}? It will be archived and removed from the active queue.`)) return;
    setIsDeleting(true);
    setFeedback(null);
    try {
      await deleteMemory(memory.memory_id, false);
      setFeedback({ type: 'success', message: `Memory ${memory.memory_id} archived as rejected.` });
      setTimeout(() => {
        onUpdated();
        onClose();
      }, 1000);
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Failed to reject memory.' });
    } finally {
      setIsDeleting(false);
    }
  };

  const reviewReasons = memory.entities?.review_reasons || memory.review_reasons || [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-950/80 backdrop-blur-md animate-fade-in">
      <div className="glass-panel border-cyan-500/30 w-full max-w-7xl h-[92vh] rounded-2xl flex flex-col shadow-2xl overflow-hidden shadow-cyan-950/50">
        
        {/* Header */}
        <div className="px-6 py-4 bg-[#070b14]/90 border-b border-cyan-500/15 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <span className="badge-cyan font-mono text-xs font-semibold">
              {memory.memory_id}
            </span>
            <span className="text-xs px-2.5 py-1 rounded bg-[#0c1427] text-slate-300 border border-cyan-500/20">
              {memory.memory_type}
            </span>
            <span className="text-xs px-2.5 py-1 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
              Score: {memory.confidence_score}%
            </span>
            <span className={`text-xs px-2.5 py-1 rounded border ${
              memory.review_status === 'approved' 
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' 
                : memory.review_status === 'rejected'
                ? 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                : 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20'
            }`}>
              {memory.review_status.toUpperCase()}
            </span>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
              aria-label="Close modal"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Feedback Alert */}
        {feedback && (
          <div className={`px-6 py-2.5 text-xs font-medium flex items-center justify-between ${
            feedback.type === 'success' ? 'bg-emerald-500/10 text-emerald-400 border-b border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border-b border-rose-500/20'
          }`}>
            <span>{feedback.message}</span>
            <button onClick={() => setFeedback(null)} className="underline ml-4">Dismiss</button>
          </div>
        )}

        {/* Flagged Warnings Banner */}
        {reviewReasons.length > 0 && (
          <div className="px-6 py-2.5 bg-amber-500/10 border-b border-amber-500/20 flex items-start space-x-2 text-xs text-amber-300">
            <svg className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div className="flex-1">
              <span className="font-semibold text-amber-200">Attention Required:</span>
              <ul className="list-disc list-inside mt-0.5 space-y-0.5">
                {reviewReasons.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {/* Split Screen Workspace */}
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-slate-800 overflow-hidden">
          
          {/* Left Panel: Raw Document Text & Provenance */}
          <div className="flex flex-col h-full overflow-hidden bg-slate-950/60">
            <div className="p-3 bg-slate-900/60 border-b border-slate-800 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Original Document Text Preview ({memory.raw_text?.length || 0} chars)
              </span>
              <input
                type="text"
                placeholder="Highlight text..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-amber-400 w-36"
              />
            </div>

            <div className="flex-1 p-4 overflow-y-auto font-mono text-xs text-slate-300 leading-relaxed whitespace-pre-wrap select-text bg-slate-950">
              {memory.raw_text ? (
                searchTerm.trim() ? (
                  memory.raw_text.split(new RegExp(`(${searchTerm})`, 'gi')).map((part, i) =>
                    part.toLowerCase() === searchTerm.toLowerCase() ? (
                      <mark key={i} className="bg-amber-400 text-slate-950 font-semibold px-0.5 rounded">
                        {part}
                      </mark>
                    ) : (
                      part
                    )
                  )
                ) : (
                  memory.raw_text
                )
              ) : (
                <div className="text-slate-500 italic p-6 text-center">No raw text stored for this memory.</div>
              )}
            </div>

            {/* Provenance metadata footer */}
            <div className="p-3 bg-slate-950/90 border-t border-slate-800 text-[11px] text-slate-400 flex flex-wrap gap-4">
              <div><span className="text-slate-500">Source:</span> {memory.source_system}</div>
              <div><span className="text-slate-500">Created:</span> {new Date(memory.created_at).toLocaleString()}</div>
              {memory.entities?.curated_by && (
                <div className="text-emerald-400">
                  <span className="text-slate-500">Curated By:</span> {memory.entities.curated_by}
                </div>
              )}
            </div>
          </div>

          {/* Right Panel: Curation & Entity Editor */}
          <div className="flex flex-col h-full overflow-hidden bg-slate-900/50">
            {/* Nav Tabs */}
            <div className="px-6 pt-3 bg-[#070b14]/80 border-b border-cyan-500/15 flex items-center justify-between">
              <div className="flex space-x-4">
                <button
                  onClick={() => setActiveTab('entities')}
                  className={`pb-2.5 text-xs font-semibold tracking-wide border-b-2 transition ${
                    activeTab === 'entities'
                      ? 'border-cyan-400 text-cyan-400'
                      : 'border-transparent text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Extracted Entities & Metadata
                </button>
                <button
                  onClick={() => setActiveTab('summaries')}
                  className={`pb-2.5 text-xs font-semibold tracking-wide border-b-2 transition ${
                    activeTab === 'summaries'
                      ? 'border-cyan-400 text-cyan-400'
                      : 'border-transparent text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Derived Summaries (3-Tier)
                </button>
              </div>

              <button
                onClick={handleReExtract}
                disabled={isReExtracting}
                className="text-[11px] font-medium text-blue-400 hover:text-blue-300 pb-2.5 flex items-center gap-1 cursor-pointer disabled:opacity-50"
              >
                <svg className={`w-3.5 h-3.5 ${isReExtracting ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                {isReExtracting ? 'Running Groq AI...' : 'Re-extract AI'}
              </button>
            </div>

            {/* Scrollable Form Content */}
            <div className="flex-1 p-6 overflow-y-auto space-y-5">
              {activeTab === 'entities' ? (
                <>
                  {/* Title */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Project / Document Title
                    </label>
                    <input
                      type="text"
                      value={formData.title}
                      onChange={e => setFormData({ ...formData, title: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-400"
                    />
                  </div>

                  {/* PI & Co-PIs Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center justify-between">
                        <span>Principal Investigator (PI) *</span>
                        {!formData.pi_name && (
                          <span className="text-[10px] text-amber-400">Required</span>
                        )}
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. Dr. Maya Patel"
                        value={formData.pi_name}
                        onChange={e => setFormData({ ...formData, pi_name: e.target.value })}
                        className={`w-full bg-slate-950 border rounded-lg px-3 py-2 text-xs text-white focus:outline-none ${
                          !formData.pi_name ? 'border-amber-500/70' : 'border-slate-700 focus:border-amber-400'
                        }`}
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1">
                        Co-Principal Investigators (comma-separated)
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. Dr. Alexander Ward, Dr. Marcus Vance"
                        value={formData.co_pis_raw}
                        onChange={e => setFormData({ ...formData, co_pis_raw: e.target.value })}
                        className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-400"
                      />
                    </div>
                  </div>

                  {/* Sponsor Agency & Award Amount */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1">
                        Funding Agency / Sponsor
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. National Science Foundation (NSF)"
                        value={formData.sponsor_agency}
                        onChange={e => setFormData({ ...formData, sponsor_agency: e.target.value })}
                        className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-400"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1">
                        Award Funding Amount ($ USD)
                      </label>
                      <input
                        type="number"
                        placeholder="e.g. 750000"
                        value={formData.award_amount}
                        onChange={e => setFormData({ ...formData, award_amount: e.target.value })}
                        className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-400"
                      />
                    </div>
                  </div>

                  {/* Department & Grant Number */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1">
                        Academic Department / Center
                      </label>
                      <select
                        value={formData.department}
                        onChange={e => setFormData({ ...formData, department: e.target.value })}
                        className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-400"
                      >
                        {DEPARTMENTS.map(d => (
                          <option key={d} value={d}>{d}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1">
                        Grant / Award Number
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. NSF-IIS-2026-904"
                        value={formData.grant_number}
                        onChange={e => setFormData({ ...formData, grant_number: e.target.value })}
                        className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-400"
                      />
                    </div>
                  </div>

                  {/* Classification & CFDA */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1">
                        Memory Type
                      </label>
                      <select
                        value={formData.memory_type}
                        onChange={e => setFormData({ ...formData, memory_type: e.target.value })}
                        className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-400"
                      >
                        {MEMORY_TYPES.map(m => (
                          <option key={m} value={m}>{m}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1">
                        Sensitivity Level
                      </label>
                      <select
                        value={formData.sensitivity_level}
                        onChange={e => setFormData({ ...formData, sensitivity_level: e.target.value })}
                        className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-400"
                      >
                        {SENSITIVITY_LEVELS.map(s => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1">
                        CFDA / ALN Number
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. 47.070"
                        value={formData.cfda_code}
                        onChange={e => setFormData({ ...formData, cfda_code: e.target.value })}
                        className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-400"
                      />
                    </div>
                  </div>
                </>
              ) : (
                <>
                  {/* Derived Summaries */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Tier 1: Short Summary (1-2 sentences)
                    </label>
                    <textarea
                      rows={2}
                      value={formData.short_summary}
                      onChange={e => setFormData({ ...formData, short_summary: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-400"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Tier 2: Detailed Research Summary
                    </label>
                    <textarea
                      rows={5}
                      value={formData.detailed_summary}
                      onChange={e => setFormData({ ...formData, detailed_summary: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-400"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Tier 3: Compliance & Regulatory Summary
                    </label>
                    <textarea
                      rows={3}
                      value={formData.compliance_summary}
                      onChange={e => setFormData({ ...formData, compliance_summary: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-400"
                    />
                  </div>
                </>
              )}
            </div>

            {/* Action Buttons Bar */}
            <div className="p-4 bg-slate-950 border-t border-slate-800 flex items-center justify-between">
              <button
                onClick={handleReject}
                disabled={isDeleting || isSaving || isApproving}
                className="px-3.5 py-2 text-xs font-medium text-rose-400 hover:text-white hover:bg-rose-900/50 border border-rose-800/60 rounded-lg transition disabled:opacity-50"
              >
                {isDeleting ? 'Archiving...' : 'Reject / Archive'}
              </button>

              <div className="flex items-center space-x-3">
                <button
                  onClick={handleSaveOnly}
                  disabled={isSaving || isApproving}
                  className="px-4 py-2 text-xs font-medium text-slate-200 hover:bg-slate-800 border border-slate-700 rounded-lg transition disabled:opacity-50"
                >
                  {isSaving ? 'Saving...' : 'Save Draft Edits'}
                </button>

                <button
                  onClick={handleApprove}
                  disabled={isApproving || isSaving}
                  className="btn-primary-cyan text-xs flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                >
                  <svg className="w-4 h-4 text-slate-950" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                  </svg>
                  {isApproving ? 'Approving & Syncing...' : 'Approve & Sync Graph'}
                </button>
              </div>
            </div>

          </div>

        </div>

      </div>
    </div>
  );
};
