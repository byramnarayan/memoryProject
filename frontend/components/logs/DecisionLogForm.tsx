'use client';

import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';

interface DecisionLogFormProps {
  onSuccess: () => void;
  onCancel: () => void;
}

export default function DecisionLogForm({ onSuccess, onCancel }: DecisionLogFormProps) {
  const { token, user } = useAuth();

  const [title, setTitle] = useState('');
  const [decisionSummary, setDecisionSummary] = useState('');
  const [tradeOffs, setTradeOffs] = useState('');
  const [incidentRef, setIncidentRef] = useState('');
  const [impactedSystem, setImpactedSystem] = useState('');
  const [intuitionNotes, setIntuitionNotes] = useState('');
  const [decisionCategory, setDecisionCategory] = useState('Workaround');
  const [urgencyLevel, setUrgencyLevel] = useState('Medium');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) {
      setErrorMsg('You must be authenticated to submit daily logs.');
      return;
    }
    if (!title.trim() || !decisionSummary.trim()) {
      setErrorMsg('Title and Decision Summary are required.');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg('');

    try {
      const res = await fetch('/api/logs', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title: title.trim(),
          decision_summary: decisionSummary.trim(),
          trade_offs_considered: tradeOffs.trim() || null,
          incident_or_ticket_ref: incidentRef.trim() || null,
          impacted_system_or_cell: impactedSystem.trim() || null,
          intuition_notes: intuitionNotes.trim() || null,
          decision_category: decisionCategory,
          urgency_level: urgencyLevel,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || 'Failed to submit decision log.');
      }

      onSuccess();
    } catch (err: any) {
      setErrorMsg(err.message || 'An error occurred while saving.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const fillQuickSample = () => {
    setTitle('Rerouted MUM-0001-B3 traffic via Sector 2 after optical fiber surge');
    setDecisionSummary('Applied carrier traffic reroute from Sector 3 (B3) to Sector 2 with a 4dB electrical downtilt offset to mitigate severe call drops.');
    setTradeOffs('Rejected taking the entire radio tower offline for technician truck roll because customer SLA penalty would exceed $15,000 during business peak hours.');
    setIncidentRef('EVT-2026-000842');
    setImpactedSystem('CELL-MUM-0001-B3');
    setIntuitionNotes('Vendor firmware v3.2 exhibits a 45-minute watchdog reboot loop under optical reflections; temporary tilt prevents cross-talk until night-time fiber re-splice.');
    setDecisionCategory('Workaround');
    setUrgencyLevel('High');
  };

  return (
    <div className="glass-panel border-cyan-500/30 rounded-2xl p-6 shadow-2xl text-slate-100 max-w-3xl mx-auto shadow-cyan-950/40">
      <div className="flex items-center justify-between pb-4 border-b border-cyan-500/15">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <span className="text-cyan-400">⚡</span> Log Operational Decision & Intuition
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Capture unwritten trade-offs, workarounds, and tacit post-mortems into the Company Brain.
          </p>
        </div>
        <button
          type="button"
          onClick={fillQuickSample}
          className="badge-cyan hover:bg-cyan-500/20 transition-all font-mono cursor-pointer text-xs"
        >
          ✨ Load Telecom Sample
        </button>
      </div>

      {errorMsg && (
        <div className="mt-4 p-3 bg-red-950/60 border border-red-500/50 rounded text-red-200 text-xs">
          ⚠️ {errorMsg}
        </div>
      )}

      <form onSubmit={handleSubmit} className="mt-5 space-y-4">
        {/* Title */}
        <div>
          <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
            Decision Title / Action Summary *
          </label>
          <input
            type="text"
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Applied manual downtilt to Sector B3 to alleviate rain fade"
            className="w-full px-3 py-2 bg-[#080d1a] border border-cyan-500/20 rounded text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400"
          />
        </div>

        {/* Category & Urgency */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
              Decision Category
            </label>
            <select
              value={decisionCategory}
              onChange={(e) => setDecisionCategory(e.target.value)}
              className="w-full px-3 py-2 bg-[#080d1a] border border-cyan-500/20 rounded text-sm text-white focus:outline-none focus:border-cyan-400"
            >
              <option value="Workaround">Workaround (Temporary Bypass)</option>
              <option value="Permanent Fix">Permanent Fix (Root Cause Cleared)</option>
              <option value="Architecture Change">Architecture Change (Topology Shift)</option>
              <option value="Vendor Escalation">Vendor Escalation (OEM Bug Opened)</option>
              <option value="Operational Routine">Operational Routine (SOP Maintenance)</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
              Urgency / Impact Level
            </label>
            <select
              value={urgencyLevel}
              onChange={(e) => setUrgencyLevel(e.target.value)}
              className="w-full px-3 py-2 bg-[#080d1a] border border-cyan-500/20 rounded text-sm text-white focus:outline-none focus:border-cyan-400"
            >
              <option value="Low">Low (Informational / Minor)</option>
              <option value="Medium">Medium (Affects Non-Critical KPI)</option>
              <option value="High">High (High Churn / Severe KPI Degradation)</option>
              <option value="Critical">Critical (Total Cell/Service Outage)</option>
            </select>
          </div>
        </div>

        {/* Operational References */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
              Impacted System / Cell Sector
            </label>
            <input
              type="text"
              value={impactedSystem}
              onChange={(e) => setImpactedSystem(e.target.value)}
              placeholder="e.g. CELL-MUM-0001-B3 or CORE-UPF-02"
              className="w-full px-3 py-2 bg-[#080d1a] border border-cyan-500/20 rounded text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400 font-mono"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
              Incident / Ticket Ref
            </label>
            <input
              type="text"
              value={incidentRef}
              onChange={(e) => setIncidentRef(e.target.value)}
              placeholder="e.g. TKT-2026-000842 or EVT-2026-0091"
              className="w-full px-3 py-2 bg-[#080d1a] border border-cyan-500/20 rounded text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400 font-mono"
            />
          </div>
        </div>

        {/* Decision & Action */}
        <div>
          <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
            What decision was implemented today? *
          </label>
          <textarea
            required
            rows={3}
            value={decisionSummary}
            onChange={(e) => setDecisionSummary(e.target.value)}
            placeholder="Describe the technical action taken, configuration applied, or protocol followed..."
            className="w-full px-3 py-2 bg-[#080d1a] border border-cyan-500/20 rounded text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400"
          />
        </div>

        {/* Trade-offs */}
        <div>
          <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1 flex items-center justify-between">
            <span>Rejected Alternatives & Trade-Offs Considered</span>
            <span className="text-[10px] text-slate-500 normal-case">Why were other options passed over?</span>
          </label>
          <textarea
            rows={2}
            value={tradeOffs}
            onChange={(e) => setTradeOffs(e.target.value)}
            placeholder="e.g. Rejected full node reset due to ongoing corporate voice call traffic during SLA hours..."
            className="w-full px-3 py-2 bg-[#080d1a] border border-cyan-500/20 rounded text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400"
          />
        </div>

        {/* Tacit Intuition */}
        <div className="bg-cyan-950/20 border border-cyan-500/30 rounded-xl p-3">
          <label className="block text-xs font-bold text-cyan-300 uppercase tracking-wider mb-1 flex items-center gap-1.5">
            <span>💡 Tacit Intuition & Unwritten Post-Mortem Insights</span>
          </label>
          <p className="text-[11px] text-slate-400 mb-2">
            What gut instinct, hardware quirk, or unwritten heuristic was observed that isn&apos;t in the standard ticket?
          </p>
          <textarea
            rows={2}
            value={intuitionNotes}
            onChange={(e) => setIntuitionNotes(e.target.value)}
            placeholder="e.g. This OEM card tends to desync when ambient humidity exceeds 85%; cooling fan cycle helped..."
            className="w-full px-3 py-2 bg-[#080d1a] border border-cyan-500/30 rounded text-sm text-cyan-100 placeholder-slate-600 focus:outline-none focus:border-cyan-400"
          />
        </div>

        {/* Submit Buttons */}
        <div className="flex items-center justify-end gap-3 pt-3 border-t border-cyan-500/15">
          <button
            type="button"
            onClick={onCancel}
            disabled={isSubmitting}
            className="px-4 py-2 border border-slate-700 rounded text-sm text-slate-300 hover:bg-slate-800 transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="btn-primary-cyan text-sm flex items-center gap-2 disabled:opacity-50"
          >
            {isSubmitting ? (
              <>
                <span className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                AI Enriching & Graph Linking...
              </>
            ) : (
              <>
                <span>💾 Save & Commit to Company Brain</span>
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
