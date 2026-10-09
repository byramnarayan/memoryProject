'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import SimulationConfigForm from '@/components/simulator/SimulationConfigForm';
import SimulationResultCard from '@/components/simulator/SimulationResultCard';

export default function SimulatorPage() {
  const { user, token } = useAuth();

  const [activeTab, setActiveTab] = useState<'simulator' | 'cross_silo' | 'spof'>('simulator');
  const [simulationResults, setSimulationResults] = useState<any>(null);

  // Cross-Silo State
  const [crossSiloData, setCrossSiloData] = useState<any>(null);
  const [isLoadingCrossSilo, setIsLoadingCrossSilo] = useState(false);

  // SPOF Matrix State
  const [spofData, setSpofData] = useState<any>(null);
  const [isLoadingSpof, setIsLoadingSpof] = useState(false);

  // Past Simulations
  const [pastSimulations, setPastSimulations] = useState<any[]>([]);

  const fetchCrossSilo = async () => {
    if (!token) return;
    setIsLoadingCrossSilo(true);
    try {
      const res = await fetch('/api/enterprise-analytics/cross-silo', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setCrossSiloData(data);
      }
    } catch (err) {
      console.error('Failed to load cross-silo data:', err);
    } finally {
      setIsLoadingCrossSilo(false);
    }
  };

  const fetchSpof = async () => {
    if (!token) return;
    setIsLoadingSpof(true);
    try {
      const res = await fetch('/api/enterprise-analytics/spof-matrix', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setSpofData(data);
      }
    } catch (err) {
      console.error('Failed to load SPOF matrix:', err);
    } finally {
      setIsLoadingSpof(false);
    }
  };

  const fetchPastSimulations = async () => {
    if (!token) return;
    try {
      const res = await fetch('/api/enterprise-analytics/simulations', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setPastSimulations(data);
      }
    } catch (err) {
      console.error('Failed to load past simulations:', err);
    }
  };

  useEffect(() => {
    if (activeTab === 'cross_silo') {
      fetchCrossSilo();
    } else if (activeTab === 'spof') {
      fetchSpof();
    } else {
      fetchPastSimulations();
    }
  }, [activeTab, token]);

  return (
    <div className="min-h-screen py-10 px-4 md:px-8">
      <div className="max-w-[1400px] mx-auto space-y-8">
        {/* Header Banner */}
        <div className="glass-card p-8 border border-cyan-500/20 shadow-[0_8px_32px_rgba(0,0,0,0.5)] rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <div className="flex items-center gap-2 text-xs text-slate-400 font-mono mb-2">
              <Link href="/" className="hover:text-cyan-400 transition-colors">HOME</Link>
              <span>/</span>
              <span className="text-cyan-400 font-semibold">CROSS-SILO ANALYTICS & SIMULATOR</span>
            </div>
            <h1 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight flex items-center gap-2.5">
              <span>🔮 What-If Decision Simulator & SPOF Matrix</span>
            </h1>
            <p className="text-xs md:text-sm text-slate-400 mt-1.5 max-w-2xl leading-relaxed">
              Correlate Databricks lakehouse outages with CRM tickets, flag Single Points of Failure, and simulate strategic decisions before rollout.
            </p>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex flex-wrap gap-2 border-b border-slate-800">
          <button
            onClick={() => setActiveTab('simulator')}
            className={`px-5 py-3 text-xs md:text-sm font-bold transition-all border-b-2 cursor-pointer flex items-center gap-2 ${
              activeTab === 'simulator'
                ? 'border-cyan-400 text-cyan-300'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <span>🎲</span> What-If Decision Simulator
          </button>
          <button
            onClick={() => setActiveTab('cross_silo')}
            className={`px-5 py-3 text-xs md:text-sm font-bold transition-all border-b-2 cursor-pointer flex items-center gap-2 ${
              activeTab === 'cross_silo'
                ? 'border-cyan-400 text-cyan-300'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <span>📡</span> Cross-Silo Churn & Outage Hotspots
          </button>
          <button
            onClick={() => setActiveTab('spof')}
            className={`px-5 py-3 text-xs md:text-sm font-bold transition-all border-b-2 cursor-pointer flex items-center gap-2 ${
              activeTab === 'spof'
                ? 'border-cyan-400 text-cyan-300'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <span>⚠️</span> Single Point of Failure (SPOF) & Decay Matrix
          </button>
        </div>

        {/* TAB 1: What-If Decision Simulator */}
        {activeTab === 'simulator' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            <div className="lg:col-span-5 space-y-6">
              <SimulationConfigForm
                onSimulationComplete={(results) => {
                  setSimulationResults(results);
                  fetchPastSimulations();
                }}
              />

              {/* Past Simulations History */}
              <div className="glass-card p-5 border border-cyan-500/20 rounded-xl">
                <h3 className="text-xs font-mono font-bold text-slate-400 uppercase tracking-wider mb-3">
                  Recent Saved Simulation Audits
                </h3>
                {pastSimulations.length === 0 ? (
                  <p className="text-xs text-slate-500">No simulation records saved yet.</p>
                ) : (
                  <div className="space-y-2">
                    {pastSimulations.map((sim) => (
                      <div
                        key={sim.id}
                        onClick={() => setSimulationResults(sim.results)}
                        className="p-3 bg-slate-900/60 border border-slate-800 hover:border-cyan-500/40 rounded-lg cursor-pointer transition-all flex items-center justify-between"
                      >
                        <div>
                          <div className="text-xs font-bold text-white line-clamp-1">
                            {sim.scenario_name}
                          </div>
                          <span className="text-[10px] text-slate-500 font-mono">
                            {new Date(sim.created_at).toLocaleDateString()} • {sim.scenario_type}
                          </span>
                        </div>
                        <span className="text-[11px] text-cyan-400 font-mono font-semibold">
                          View &rarr;
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="lg:col-span-7">
              {simulationResults ? (
                <SimulationResultCard results={simulationResults} />
              ) : (
                <div className="glass-card border border-cyan-500/20 rounded-2xl p-16 text-center text-slate-400 flex flex-col items-center justify-center gap-3">
                  <div className="w-14 h-14 rounded-2xl bg-cyan-500/10 border border-cyan-400/30 flex items-center justify-center text-cyan-300 text-2xl shadow-[0_0_15px_rgba(14,165,233,0.2)]">
                    🎲
                  </div>
                  <h3 className="text-base font-bold text-white">Simulation Sandbox Ready</h3>
                  <p className="text-xs text-slate-400 max-w-md leading-relaxed">
                    Select a scenario on the left (Employee Departure, Planned Outage, or Hardware Upgrade) and click <strong>&quot;Run What-If Simulation&quot;</strong> to model financial penalties and churn probability spikes.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 2: Cross-Silo Churn & Outage Hotspots */}
        {activeTab === 'cross_silo' && (
          <div className="space-y-6">
            {isLoadingCrossSilo ? (
              <div className="p-16 text-center text-slate-400">Loading cross-silo lakehouse intelligence...</div>
            ) : crossSiloData ? (
              <>
                {/* Stats row */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="glass-card p-5 border border-cyan-500/20 rounded-xl">
                    <span className="text-xs text-slate-400 uppercase font-mono font-semibold">Outages Tracked</span>
                    <div className="text-2xl font-black text-white mt-1">
                      {crossSiloData.total_outages_tracked}
                    </div>
                    <span className="text-[11px] text-cyan-400 font-mono mt-0.5 block">
                      {crossSiloData.total_outage_duration_minutes} total outage mins
                    </span>
                  </div>

                  <div className="glass-card p-5 border border-cyan-500/20 rounded-xl">
                    <span className="text-xs text-slate-400 uppercase font-mono font-semibold">CRM Support Tickets</span>
                    <div className="text-2xl font-black text-sky-400 mt-1">
                      {crossSiloData.total_crm_tickets}
                    </div>
                    <span className="text-[11px] text-slate-400 font-mono mt-0.5 block">
                      {crossSiloData.high_priority_tickets} High / Critical SLA
                    </span>
                  </div>

                  <div className="glass-card p-5 border border-cyan-500/20 rounded-xl">
                    <span className="text-xs text-slate-400 uppercase font-mono font-semibold">Cross-Silo Correlation</span>
                    <div className="text-2xl font-black text-emerald-400 mt-1">
                      {crossSiloData.cross_silo_correlation_index}%
                    </div>
                    <span className="text-[11px] text-emerald-400/80 font-mono mt-0.5 block">
                      High Lakehouse ➔ CRM alignment
                    </span>
                  </div>

                  <div className="glass-card p-5 border border-cyan-500/20 rounded-xl">
                    <span className="text-xs text-slate-400 uppercase font-mono font-semibold">Decisions Logged</span>
                    <div className="text-2xl font-black text-cyan-300 mt-1">
                      {crossSiloData.total_decisions_logged}
                    </div>
                    <span className="text-[11px] text-slate-400 font-mono mt-0.5 block">
                      Post-mortems in Company Brain
                    </span>
                  </div>
                </div>

                {/* Hotspot Radio Sites Table */}
                <div className="glass-card p-6 border border-cyan-500/20 rounded-2xl shadow-xl">
                  <h3 className="text-base font-bold text-white mb-2 flex items-center gap-2">
                    <span>🔥</span> High-Churn Outage Hotspots (Cross-Silo Exposure)
                  </h3>
                  <p className="text-xs text-slate-400 mb-4">
                    Correlates radio cell downtime duration with customer complaint volume and churn probability.
                  </p>

                  <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-900/40">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-900/90 text-cyan-400 font-mono uppercase text-[11px] border-b border-slate-800">
                        <tr>
                          <th className="p-3.5">Radio Site Code</th>
                          <th className="p-3.5">Outage Duration</th>
                          <th className="p-3.5">CRM Tickets</th>
                          <th className="p-3.5">Churn Exposure Risk</th>
                          <th className="p-3.5">Estimated SLA Penalty Exposure</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60">
                        {crossSiloData.hotspot_sites?.map((site: any, idx: number) => (
                          <tr key={idx} className="hover:bg-cyan-950/20 transition-colors">
                            <td className="p-3.5 font-mono font-bold text-cyan-300">
                              📡 {site.site_code}
                            </td>
                            <td className="p-3.5 text-slate-200">
                              {site.outage_minutes} minutes
                            </td>
                            <td className="p-3.5 text-sky-300 font-semibold">
                              {site.related_tickets} tickets
                            </td>
                            <td className="p-3.5">
                              <span className="px-2.5 py-0.5 rounded-full bg-rose-950/60 text-rose-300 border border-rose-500/30 font-mono font-bold">
                                {site.churn_risk_score}% Churn Risk
                              </span>
                            </td>
                            <td className="p-3.5 font-mono font-bold text-white">
                              ${site.estimated_sla_exposure_usd?.toLocaleString()}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            ) : null}
          </div>
        )}

        {/* TAB 3: Single Point of Failure (SPOF) & Decay Matrix */}
        {activeTab === 'spof' && (
          <div className="space-y-6">
            {isLoadingSpof ? (
              <div className="p-16 text-center text-slate-400">Analyzing knowledge distribution across engineering teams...</div>
            ) : spofData ? (
              <>
                {/* SPOF Critical Alerts */}
                <div className="glass-card p-6 border border-cyan-500/20 rounded-2xl shadow-xl">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="text-base font-bold text-white flex items-center gap-2">
                        <span>⚠️</span> Single Point of Failure (SPOF) Knowledge Concentration Alerts
                      </h3>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Subsystems where 70%+ of operational resolutions, tacit workarounds, and heuristics depend on a single employee.
                      </p>
                    </div>
                    <span className="px-3 py-1 rounded-full text-xs font-mono font-bold bg-rose-950/80 text-rose-300 border border-rose-500/50">
                      {spofData.spof_critical_count} SPOF Risks Flagged
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {spofData.spof_risks?.map((risk: any, idx: number) => (
                      <div
                        key={idx}
                        className="bg-slate-900/80 border border-rose-500/40 rounded-xl p-4 shadow-lg space-y-3"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-mono font-bold text-cyan-300">
                            📡 {risk.subsystem}
                          </span>
                          <span className="text-[10px] px-2 py-0.5 rounded-full font-black bg-rose-600 text-white animate-pulse">
                            {risk.knowledge_concentration_percent}% CONCENTRATION
                          </span>
                        </div>

                        <div className="text-xs text-slate-300">
                          Dominant Expert: <strong className="text-white">{risk.dominant_expert}</strong> ({risk.employee_number})
                        </div>

                        <p className="text-xs text-slate-400 italic">
                          &ldquo;{risk.recommended_action}&rdquo;
                        </p>

                        <div className="pt-2 border-t border-slate-800">
                          <Link
                            href="/kt-handoff"
                            className="text-xs text-cyan-400 hover:text-cyan-300 font-semibold flex items-center gap-1 transition-colors"
                          >
                            <span>🤝</span> Open KT Succession Handover &rarr;
                          </Link>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Knowledge Decay Alerts */}
                <div className="glass-card p-6 border border-cyan-500/20 rounded-2xl shadow-xl">
                  <h3 className="text-base font-bold text-white mb-2 flex items-center gap-2">
                    <span>⏳</span> Knowledge Decay & Dormant Subsystem Alerts
                  </h3>
                  <p className="text-xs text-slate-400 mb-4">
                    Subsystems with no active maintenance, architectural review, or incident logging in over 60 days.
                  </p>

                  {spofData.decay_items?.length === 0 ? (
                    <div className="p-8 border border-slate-800 rounded-xl text-center text-xs text-slate-400 bg-slate-900/40">
                      All monitored subsystems have active logs within the last 60 days. Zero severe decay detected.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {spofData.decay_items?.map((item: any, idx: number) => (
                        <div
                          key={idx}
                          className="p-3.5 bg-slate-900/60 border border-slate-800 rounded-xl flex items-center justify-between text-xs"
                        >
                          <div>
                            <span className="font-bold text-white font-mono">{item.subsystem}</span>
                            <p className="text-slate-400 text-[11px] mt-0.5">{item.risk_message}</p>
                          </div>
                          <span className="font-mono text-cyan-300 font-bold">
                            {item.days_untouched} days untouched
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
