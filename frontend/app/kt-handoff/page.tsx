'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import AskPredecessorChat from '@/components/kt/AskPredecessorChat';
import KTAssignmentModal from '@/components/kt/KTAssignmentModal';

interface EmployeeMeta {
  id: number;
  name: string;
  employee_number?: string | null;
  job_title: string;
  department: string;
}

interface ChecklistItem {
  id: number;
  item_type: string;
  title: string;
  description?: string | null;
  reference_id?: string | null;
  is_reviewed: boolean;
  reviewed_at?: string | null;
  notes?: string | null;
}

interface KTSession {
  id: number;
  title: string;
  status: string;
  progress_percent: number;
  scope_description?: string | null;
  systems_in_scope: string[];
  created_at: string;
  completed_at?: string | null;
  predecessor: EmployeeMeta;
  successor: EmployeeMeta;
  manager?: { id: number; name: string };
  total_items?: number;
  reviewed_items?: number;
  checklist_items?: ChecklistItem[];
}

export default function KTHandoffPage() {
  const { user, token } = useAuth();

  const [sessions, setSessions] = useState<KTSession[]>([]);
  const [selectedSession, setSelectedSession] = useState<KTSession | null>(null);
  const [activeTab, setActiveTab] = useState<'checklist' | 'chat'>('checklist');

  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [signOffMsg, setSignOffMsg] = useState('');

  const fetchSessions = async () => {
    if (!token) return;
    setIsLoading(true);
    try {
      const res = await fetch('/api/kt/assignments', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setSessions(data);
        if (data.length > 0) {
          fetchSessionDetail(data[0].id);
        } else {
          setSelectedSession(null);
        }
      }
    } catch (err) {
      console.error('Failed to fetch KT sessions:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchSessionDetail = async (sessionId: number) => {
    if (!token) return;
    try {
      const res = await fetch(`/api/kt/sessions/${sessionId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const detail = await res.json();
        setSelectedSession(detail);
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchSessions();
  }, [token]);

  const handleToggleItem = async (itemId: number, currentReviewed: boolean) => {
    if (!token || !selectedSession) return;
    try {
      const res = await fetch(`/api/kt/checklist/${itemId}/review`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ is_reviewed: !currentReviewed }),
      });
      if (res.ok) {
        fetchSessionDetail(selectedSession.id);
        fetchSessions();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleSignOff = async () => {
    if (!token || !selectedSession) return;
    try {
      const res = await fetch(`/api/kt/sessions/${selectedSession.id}/sign-off`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setSignOffMsg(data.message || 'KT Session completed and signed off successfully!');
        fetchSessionDetail(selectedSession.id);
        fetchSessions();
        setTimeout(() => setSignOffMsg(''), 5000);
      }
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="min-h-screen py-10 px-4 md:px-8">
      <div className="max-w-[1400px] mx-auto space-y-8">
        {/* Header Breadcrumb & Title */}
        <div className="glass-card p-8 border border-cyan-500/20 shadow-[0_8px_32px_rgba(0,0,0,0.5)] rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <div className="flex items-center gap-2 text-xs text-slate-400 font-mono mb-2">
              <Link href="/" className="hover:text-cyan-400 transition-colors">HOME</Link>
              <span>/</span>
              <span className="text-cyan-400 font-semibold">SUCCESSION & HANDOVER</span>
            </div>
            <h1 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight flex items-center gap-2.5">
              <span>🤝 Knowledge Transfer & Succession Hub</span>
            </h1>
            <p className="text-xs md:text-sm text-slate-400 mt-1.5 max-w-2xl leading-relaxed">
              Eliminate brain drain when senior employees move on. Pair departing talent with successors and empower new hires with an interactive &quot;Ask Predecessor&apos;s Brain&quot; co-pilot.
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={() => setIsModalOpen(true)}
              className="btn-primary-cyan px-6 py-3 rounded-lg text-xs font-bold flex items-center gap-2 shadow-[0_0_20px_rgba(6,182,212,0.35)] cursor-pointer"
            >
              <span className="text-sm font-black">+</span>
              New KT Assignment
            </button>
          </div>
        </div>

        {signOffMsg && (
          <div className="p-4 bg-emerald-950/60 border border-emerald-500/50 rounded-xl text-emerald-200 text-xs font-semibold flex items-center gap-2 shadow-lg">
            <span>🛡️</span> {signOffMsg}
          </div>
        )}

        {/* Content Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Left Column: Sessions List */}
          <div className="lg:col-span-4 space-y-3">
            <h2 className="text-xs font-mono font-bold text-slate-400 uppercase tracking-wider mb-2">
              Active Succession Handover Programs
            </h2>

            {isLoading ? (
              <div className="p-8 text-center text-slate-400 text-xs">
                Loading succession programs...
              </div>
            ) : sessions.length === 0 ? (
              <div className="glass-card p-8 text-center rounded-xl">
                <p className="text-xs text-slate-400">No Knowledge Transfer sessions configured yet.</p>
                <button
                  onClick={() => setIsModalOpen(true)}
                  className="mt-3 text-xs text-cyan-400 font-bold hover:underline"
                >
                  Create First KT Assignment &rarr;
                </button>
              </div>
            ) : (
              sessions.map((s) => {
                const isSelected = selectedSession?.id === s.id;
                return (
                  <div
                    key={s.id}
                    onClick={() => fetchSessionDetail(s.id)}
                    className={`p-4 rounded-xl border transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-slate-900/90 border-cyan-400 shadow-[0_0_20px_rgba(14,165,233,0.2)]'
                        : 'glass-card border-slate-800 hover:border-cyan-500/40'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${
                        s.status === 'COMPLETED'
                          ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 font-bold'
                          : 'bg-cyan-950/60 text-cyan-300 border-cyan-500/40'
                      }`}>
                        {s.status === 'COMPLETED' ? '✅ COMPLETED' : '⏳ IN PROGRESS'}
                      </span>
                      <span className="text-xs font-bold text-cyan-300 font-mono">
                        {s.progress_percent}%
                      </span>
                    </div>

                    <h3 className="text-sm font-bold text-white mt-2 line-clamp-1">
                      {s.title}
                    </h3>

                    {/* Predecessor -> Successor line */}
                    <div className="mt-2 text-xs text-slate-400 flex items-center gap-1.5 font-mono">
                      <span className="text-cyan-300">{s.predecessor.name.split(' ')[0]}</span>
                      <span className="text-slate-600">&rarr;</span>
                      <span className="text-emerald-300">{s.successor.name.split(' ')[0]}</span>
                      <span className="text-[10px] text-slate-500 ml-auto">({s.reviewed_items}/{s.total_items} items)</span>
                    </div>

                    {/* Progress Bar */}
                    <div className="w-full bg-slate-800 rounded-full h-1.5 mt-3 overflow-hidden">
                      <div
                        className={`h-full transition-all duration-500 ${
                          s.status === 'COMPLETED' ? 'bg-emerald-400' : 'bg-gradient-to-r from-sky-500 to-cyan-400'
                        }`}
                        style={{ width: `${s.progress_percent}%` }}
                      />
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Right Column: Detailed Session View */}
          <div className="lg:col-span-8">
            {selectedSession ? (
              <div className="glass-card p-6 border border-cyan-500/20 shadow-xl rounded-2xl space-y-6">
                {/* Pairing Hero Banner */}
                <div className="bg-slate-900/80 border border-slate-800 p-5 rounded-xl">
                  <div className="flex flex-col md:flex-row items-center justify-between gap-4">
                    {/* Predecessor */}
                    <div className="flex items-center gap-3 w-full md:w-auto">
                      <div className="w-12 h-12 rounded-xl bg-cyan-500/10 border border-cyan-400/40 flex items-center justify-center text-cyan-400 font-bold text-lg shadow-[0_0_12px_rgba(14,165,233,0.2)]">
                        🎓
                      </div>
                      <div>
                        <span className="text-[10px] text-cyan-400 uppercase font-mono font-bold tracking-wider block">
                          Predecessor (Departing Senior)
                        </span>
                        <div className="text-base font-extrabold text-white">
                          {selectedSession.predecessor.name}
                        </div>
                        <div className="text-xs text-slate-400">
                          {selectedSession.predecessor.job_title} • {selectedSession.predecessor.department}
                        </div>
                      </div>
                    </div>

                    {/* Directional Beam */}
                    <div className="flex flex-col items-center justify-center px-4">
                      <div className="text-cyan-400 text-xl font-bold flex items-center gap-2">
                        <span className="w-8 h-[2px] bg-cyan-400/50" />
                        <span>🤝</span>
                        <span className="w-8 h-[2px] bg-emerald-400/50" />
                      </div>
                      <span className="text-[10px] font-mono text-slate-400 mt-1 uppercase">
                        Knowledge Handover
                      </span>
                    </div>

                    {/* Successor */}
                    <div className="flex items-center gap-3 w-full md:w-auto justify-end">
                      <div className="text-right">
                        <span className="text-[10px] text-emerald-400 uppercase font-mono font-bold tracking-wider block">
                          Successor (New Lead)
                        </span>
                        <div className="text-base font-extrabold text-white">
                          {selectedSession.successor.name}
                        </div>
                        <div className="text-xs text-slate-400">
                          {selectedSession.successor.job_title} • {selectedSession.successor.department}
                        </div>
                      </div>
                      <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-400/40 flex items-center justify-center text-emerald-400 font-bold text-lg">
                        🌱
                      </div>
                    </div>
                  </div>

                  {/* Systems in scope */}
                  {selectedSession.systems_in_scope && selectedSession.systems_in_scope.length > 0 && (
                    <div className="mt-4 pt-3 border-t border-slate-800 flex flex-wrap items-center gap-2 text-xs">
                      <span className="text-slate-400 font-medium">In-Scope Systems:</span>
                      {selectedSession.systems_in_scope.map((sys, idx) => (
                        <span
                          key={idx}
                          className="px-2.5 py-0.5 rounded-full bg-cyan-950/60 text-cyan-300 border border-cyan-500/30 font-mono text-[11px]"
                        >
                          📡 {sys}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Progress Bar & Sign-off Bar */}
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 bg-slate-900/60 border border-slate-800 rounded-xl">
                  <div className="w-full sm:w-2/3">
                    <div className="flex items-center justify-between text-xs mb-1.5">
                      <span className="font-semibold text-slate-300">
                        Checklist Coverage: {selectedSession.reviewed_items} of {selectedSession.total_items} items reviewed
                      </span>
                      <span className="font-bold text-cyan-300 font-mono">
                        {selectedSession.progress_percent}%
                      </span>
                    </div>
                    <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
                      <div
                        className={`h-full transition-all duration-500 ${
                          selectedSession.status === 'COMPLETED' ? 'bg-emerald-400' : 'bg-gradient-to-r from-sky-500 to-cyan-400'
                        }`}
                        style={{ width: `${selectedSession.progress_percent}%` }}
                      />
                    </div>
                  </div>

                  {selectedSession.status !== 'COMPLETED' ? (
                    <button
                      onClick={handleSignOff}
                      className="whitespace-nowrap px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-lg transition-all shadow-md shadow-emerald-600/20 cursor-pointer"
                    >
                      🛡️ Complete & Sign-Off
                    </button>
                  ) : (
                    <div className="text-xs font-mono text-emerald-400 border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 rounded-lg flex items-center gap-1.5">
                      <span>✓</span> Signed off on {new Date(selectedSession.completed_at || '').toLocaleDateString()}
                    </div>
                  )}
                </div>

                {/* View Tabs */}
                <div className="flex border-b border-slate-800">
                  <button
                    onClick={() => setActiveTab('checklist')}
                    className={`px-5 py-2.5 text-xs font-bold transition-all border-b-2 cursor-pointer ${
                      activeTab === 'checklist'
                        ? 'border-cyan-400 text-cyan-300'
                        : 'border-transparent text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    📋 Knowledge Checklist ({selectedSession.checklist_items?.length || 0})
                  </button>
                  <button
                    onClick={() => setActiveTab('chat')}
                    className={`px-5 py-2.5 text-xs font-bold transition-all border-b-2 flex items-center gap-1.5 cursor-pointer ${
                      activeTab === 'chat'
                        ? 'border-cyan-400 text-cyan-300'
                        : 'border-transparent text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <span>💬</span> Ask {selectedSession.predecessor.name.split(' ')[0]}&apos;s Brain [Co-Pilot]
                  </button>
                </div>

                {/* Tab 1: Checklist */}
                {activeTab === 'checklist' && (
                  <div className="space-y-3">
                    {selectedSession.checklist_items?.map((item) => (
                      <div
                        key={item.id}
                        className={`p-4 rounded-xl border transition-all flex items-start justify-between gap-4 ${
                          item.is_reviewed
                            ? 'bg-slate-900/40 border-slate-800/60 opacity-80'
                            : 'bg-slate-900/80 border-slate-800 hover:border-cyan-500/30'
                        }`}
                      >
                        <div className="flex items-start gap-3 flex-1">
                          <input
                            type="checkbox"
                            checked={item.is_reviewed}
                            onChange={() => handleToggleItem(item.id, item.is_reviewed)}
                            className="mt-1 w-4 h-4 rounded bg-slate-950 border-slate-700 text-cyan-500 focus:ring-0 cursor-pointer"
                          />
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${
                                item.item_type === 'TACIT_INTUITION'
                                  ? 'bg-cyan-950/60 text-cyan-300 border-cyan-500/40'
                                  : item.item_type === 'ACCESS_HANDOVER'
                                  ? 'bg-purple-950/60 text-purple-300 border-purple-500/40'
                                  : 'bg-blue-950/60 text-blue-300 border-blue-500/40'
                              }`}>
                                {item.item_type.replace('_', ' ')}
                              </span>
                              {item.reference_id && (
                                <span className="text-[10px] font-mono text-cyan-300">
                                  {item.reference_id}
                                </span>
                              )}
                            </div>
                            <h4 className={`text-sm font-bold mt-1 ${item.is_reviewed ? 'line-through text-slate-400' : 'text-white'}`}>
                              {item.title}
                            </h4>
                            {item.description && (
                              <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                                {item.description}
                              </p>
                            )}
                          </div>
                        </div>

                        <div className="text-right">
                          <button
                            onClick={() => handleToggleItem(item.id, item.is_reviewed)}
                            className={`text-xs px-2.5 py-1 rounded-lg border font-mono transition-all ${
                              item.is_reviewed
                                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                                : 'bg-slate-800 text-slate-300 border-slate-700 hover:border-cyan-500/40'
                            }`}
                          >
                            {item.is_reviewed ? '✓ Reviewed' : 'Mark Reviewed'}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Tab 2: Ask Predecessor Brain */}
                {activeTab === 'chat' && (
                  <div>
                    <AskPredecessorChat
                      predecessorId={selectedSession.predecessor.id}
                      predecessorName={selectedSession.predecessor.name}
                      predecessorRole={selectedSession.predecessor.job_title}
                      predecessorDept={selectedSession.predecessor.department}
                    />
                  </div>
                )}
              </div>
            ) : (
              <div className="glass-card p-16 text-center text-slate-400 text-sm rounded-2xl">
                Select a Succession Program from the list to view its checklist and co-pilot assistant.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modal for creating new assignment */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md overflow-y-auto">
          <KTAssignmentModal
            onClose={() => setIsModalOpen(false)}
            onSuccess={() => {
              setIsModalOpen(false);
              fetchSessions();
            }}
          />
        </div>
      )}
    </div>
  );
}
