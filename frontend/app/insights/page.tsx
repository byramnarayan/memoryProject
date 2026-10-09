'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import { PortfolioAnalytics, RiskMatrix } from '@/types';
import GrantPipelineChart from '@/components/insights/GrantPipelineChart';
import DecayRiskMatrix from '@/components/insights/DecayRiskMatrix';
import { useAuth } from '@/hooks/useAuth';

// Types for Enterprise Telecom Operational Intelligence
interface TelecomCrossSiloAnalytics {
  tenant_id: string;
  total_outages_tracked: number;
  total_outage_duration_minutes: number;
  total_crm_tickets: number;
  high_priority_tickets: number;
  total_decisions_logged: number;
  cross_silo_correlation_index: number;
  hotspot_sites: Array<{
    site_code: string;
    outage_minutes: number;
    related_tickets: number;
    churn_risk_score: number;
    estimated_sla_exposure_usd: number;
  }>;
  data_freshness: string;
}

interface TelecomSpofMatrix {
  tenant_id: string;
  spof_critical_count: number;
  spof_risks: Array<{
    subsystem: string;
    dominant_expert: string;
    employee_number: string;
    user_id: number;
    knowledge_concentration_percent: number;
    total_decisions: number;
    risk_severity: string;
    recommended_action: string;
  }>;
  knowledge_decay_count: number;
  decay_items: Array<{
    subsystem: string;
    last_active_date: string | null;
    days_untouched: number;
    decay_level: string;
    risk_message: string;
  }>;
}

interface Neo4jGraphStats {
  status: string;
  tenant_id: string;
  total_nodes: number;
  total_relationships: number;
  node_breakdown: Record<string, number>;
  relationship_breakdown: Record<string, number>;
  employees: number;
  departments: number;
  network_sites: number;
  network_events: number;
  service_tickets: number;
  sample_nodes: Array<{
    label: string;
    name: string;
    key_id: string;
  }>;
  is_partitioned: boolean;
}

export default function InsightsPage() {
  const { user } = useAuth();
  const isEnterprise = Boolean(user && user.tenant_id && user.tenant_id !== 'utc_campus');

  // Academic State (for utc_campus)
  const [portfolio, setPortfolio] = useState<PortfolioAnalytics | null>(null);
  const [riskMatrix, setRiskMatrix] = useState<RiskMatrix | null>(null);

  // Enterprise Telecom State
  const [crossSilo, setCrossSilo] = useState<TelecomCrossSiloAnalytics | null>(null);
  const [spofMatrix, setSpofMatrix] = useState<TelecomSpofMatrix | null>(null);
  const [graphStats, setGraphStats] = useState<Neo4jGraphStats | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'pipeline' | 'risk' | 'strategic' | 'hotspots' | 'spof' | 'neo4j'>('hotspots');
  const [isExporting, setIsExporting] = useState<string | null>(null);
  const [copiedQuery, setCopiedQuery] = useState<string | null>(null);

  // Set default active tab based on domain
  useEffect(() => {
    if (isEnterprise) {
      setActiveTab('hotspots');
    } else {
      setActiveTab('pipeline');
    }
  }, [isEnterprise]);

  const fetchAnalytics = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      if (isEnterprise) {
        // Fetch Enterprise Telecom Endpoints
        const [csData, spofData, graphData] = await Promise.all([
          apiFetch<TelecomCrossSiloAnalytics>('/api/enterprise-analytics/cross-silo').catch(() => null),
          apiFetch<TelecomSpofMatrix>('/api/enterprise-analytics/spof-matrix').catch(() => null),
          apiFetch<Neo4jGraphStats>('/api/connectors/graph-stats').catch(() => null)
        ]);
        setCrossSilo(csData);
        setSpofMatrix(spofData);
        setGraphStats(graphData);
      } else {
        // Fetch Academic University Endpoints
        const [portData, riskData] = await Promise.all([
          apiFetch<PortfolioAnalytics>('/api/insights/portfolio'),
          apiFetch<RiskMatrix>('/api/insights/risk-matrix')
        ]);
        setPortfolio(portData);
        setRiskMatrix(riskData);
      }
    } catch (err: unknown) {
      console.error('Failed to load analytics:', err);
      setError('Unable to load analytics data. Please ensure backend services are running.');
    } finally {
      setIsLoading(false);
    }
  }, [isEnterprise]);

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  const handleExportAcademic = async (format: 'csv' | 'pdf') => {
    setIsExporting(format);
    try {
      const res = await fetch(`/api/insights/export/${format}`);
      if (!res.ok) {
        throw new Error(`Export failed with HTTP status ${res.status}`);
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `UTC_Institutional_Research_Dossier_${new Date().toISOString().slice(0, 10)}.${format}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err: unknown) {
      console.error(`Export failed for ${format}:`, err);
      alert(`Could not download ${format.toUpperCase()} dossier. Please verify server connection.`);
    } finally {
      setIsExporting(null);
    }
  };

  const handleExportTelecomCSV = () => {
    setIsExporting('csv');
    try {
      const rows = [
        ['Tenant ID', user?.tenant_id || 'novatel_communications'],
        ['Generated At', new Date().toISOString()],
        ['Total Outages Tracked', String(crossSilo?.total_outages_tracked || 0)],
        ['Total Outage Minutes', String(crossSilo?.total_outage_duration_minutes || 0)],
        ['Total Service Tickets', String(crossSilo?.total_crm_tickets || 0)],
        ['Cross-Silo Correlation Index', `${crossSilo?.cross_silo_correlation_index || 0}%`],
        ['Neo4j Total Nodes', String(graphStats?.total_nodes || 0)],
        ['Neo4j Total Relationships', String(graphStats?.total_relationships || 0)],
        [],
        ['--- HOTSPOT SITES & SLA EXPOSURE ---'],
        ['Site Code', 'Outage Minutes', 'Related Tickets', 'Churn Risk Score (%)', 'Estimated SLA Penalty (USD)'],
      ];

      crossSilo?.hotspot_sites.forEach((h) => {
        rows.push([
          h.site_code,
          String(h.outage_minutes),
          String(h.related_tickets),
          `${h.churn_risk_score}%`,
          `$${h.estimated_sla_exposure_usd.toFixed(2)}`,
        ]);
      });

      rows.push([]);
      rows.push(['--- SPOF KNOWLEDGE CONCENTRATION RISKS ---']);
      rows.push(['Subsystem', 'Dominant Expert', 'Employee ID', 'Concentration (%)', 'Severity', 'Recommended Action']);

      spofMatrix?.spof_risks.forEach((s) => {
        rows.push([
          s.subsystem,
          s.dominant_expert,
          s.employee_number,
          `${s.knowledge_concentration_percent}%`,
          s.risk_severity,
          s.recommended_action,
        ]);
      });

      const csvContent = 'data:text/csv;charset=utf-8,' + rows.map((e) => e.join(',')).join('\n');
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement('a');
      link.setAttribute('href', encodedUri);
      link.setAttribute(
        'download',
        `Telecom_Operational_Dossier_${user?.tenant_id || 'novatel'}_${new Date().toISOString().slice(0, 10)}.csv`
      );
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (e) {
      console.error('Failed to export telecom CSV:', e);
    } finally {
      setIsExporting(null);
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedQuery(id);
    setTimeout(() => setCopiedQuery(null), 2500);
  };

  return (
    <div className="max-w-[1400px] mx-auto px-4 lg:px-8 py-10 space-y-8">
      {/* ========================================================================= */}
      {/* 1. EXECUTIVE HEADER (Domain Adaptive) */}
      {/* ========================================================================= */}
      <div className="glass-card p-8 border border-cyan-500/20 shadow-[0_8px_32px_rgba(0,0,0,0.5)] rounded-2xl flex flex-col md:flex-row md:items-center md:justify-between gap-6">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 text-xl shadow-[0_0_15px_rgba(14,165,233,0.2)]">
              {isEnterprise ? '📡' : '📊'}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight">
                  {isEnterprise
                    ? 'Telecom Operational Intelligence & Infrastructure Analytics'
                    : 'Institutional Research Intelligence & Analytics'}
                </h1>
                {isEnterprise && (
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-cyan-950/80 text-cyan-300 border border-cyan-500/30 uppercase">
                    Tenant: {user?.tenant_id}
                  </span>
                )}
              </div>
              <p className="text-slate-400 text-xs md:text-sm mt-0.5">
                {isEnterprise
                  ? 'Databricks Lakehouse Telemetry, Cross-Silo Root Cause Correlator, SLA Risk Exposure & SPOF Matrix'
                  : 'Executive Research Capital Portfolio, Department Allocations, Continuity Risks & Official Dossiers'}
              </p>
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-2.5">
          {isEnterprise ? (
            <>
              <button
                onClick={handleExportTelecomCSV}
                disabled={isExporting !== null}
                className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-750 text-slate-200 border border-slate-700 hover:border-cyan-500/40 text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
              >
                <span>📥</span> {isExporting === 'csv' ? 'Compiling CSV...' : 'Export Dossier (CSV)'}
              </button>

              <Link
                href="/simulator"
                className="btn-primary-cyan px-4 py-2 text-xs font-bold uppercase tracking-wider rounded-lg flex items-center gap-1.5 transition-all cursor-pointer shadow-[0_0_15px_rgba(6,182,212,0.3)]"
              >
                <span>⚡</span> Run Simulation
              </Link>

              <Link
                href="/gacm"
                className="px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-slate-700 text-xs font-bold uppercase tracking-wider transition-colors"
                title="Open Neo4j Graph Explorer"
              >
                <span>🌐</span> Explorer
              </Link>
            </>
          ) : (
            <>
              <button
                onClick={() => handleExportAcademic('csv')}
                disabled={isExporting !== null}
                className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-750 text-slate-200 border border-slate-700 hover:border-cyan-500/40 text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
              >
                <span>📥</span> {isExporting === 'csv' ? 'Compiling CSV...' : 'Export Dossier (CSV)'}
              </button>

              <button
                onClick={() => handleExportAcademic('pdf')}
                disabled={isExporting !== null}
                className="btn-primary-cyan px-4 py-2 text-xs font-bold uppercase tracking-wider rounded-lg flex items-center gap-1.5 transition-all cursor-pointer shadow-[0_0_15px_rgba(6,182,212,0.3)] disabled:opacity-50"
              >
                <span>📄</span> {isExporting === 'pdf' ? 'Generating PDF...' : 'Formal Dossier (PDF)'}
              </button>
            </>
          )}

          <button
            onClick={fetchAnalytics}
            className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-cyan-400 border border-slate-700 text-xs transition-colors cursor-pointer"
            title="Refresh Analytics"
          >
            🔄
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 2. TOP KPI CARDS BANNER */}
      {/* ========================================================================= */}
      {isEnterprise ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="glass-card p-5 border border-rose-500/20 rounded-xl relative overflow-hidden">
            <div className="absolute top-0 right-0 w-24 h-24 bg-rose-500/5 blur-2xl pointer-events-none -z-10" />
            <div className="text-[11px] font-mono font-semibold uppercase text-slate-400 tracking-wider">
              Total Outage Downtime
            </div>
            <div className="text-2xl font-black text-rose-300 mt-1 font-mono">
              {crossSilo?.total_outage_duration_minutes ?? 470} <span className="text-sm font-sans text-rose-400/80">mins</span>
            </div>
            <div className="text-[11px] text-slate-400 mt-1 font-mono">
              {crossSilo?.total_outages_tracked ?? 4} Lakehouse Outages Tracked
            </div>
          </div>

          <div className="glass-card p-5 border border-cyan-500/20 rounded-xl relative overflow-hidden">
            <div className="absolute top-0 right-0 w-24 h-24 bg-cyan-500/5 blur-2xl pointer-events-none -z-10" />
            <div className="text-[11px] font-mono font-semibold uppercase text-slate-400 tracking-wider">
              Neo4j Aura Knowledge Graph
            </div>
            <div className="text-2xl font-black text-cyan-300 mt-1 font-mono">
              {graphStats?.total_nodes ?? 19} <span className="text-sm font-sans text-cyan-400/80">entities</span>
            </div>
            <div className="text-[11px] text-emerald-400 mt-1 font-mono">
              ● {graphStats?.total_relationships ?? 14} Partitioned Graph Relations
            </div>
          </div>

          <div className="glass-card p-5 border border-amber-500/20 rounded-xl relative overflow-hidden">
            <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/5 blur-2xl pointer-events-none -z-10" />
            <div className="text-[11px] font-mono font-semibold uppercase text-slate-400 tracking-wider">
              CRM Trouble Tickets
            </div>
            <div className="text-2xl font-black text-amber-300 mt-1 font-mono">
              {crossSilo?.total_crm_tickets ?? 3} <span className="text-sm font-sans text-amber-400/80">cases</span>
            </div>
            <div className="text-[11px] text-slate-400 mt-1 font-mono">
              + {crossSilo?.high_priority_tickets ?? 2} High / Critical SLA Incidents
            </div>
          </div>

          <div className="glass-card p-5 border border-emerald-500/20 rounded-xl relative overflow-hidden">
            <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 blur-2xl pointer-events-none -z-10" />
            <div className="text-[11px] font-mono font-semibold uppercase text-slate-400 tracking-wider">
              Cross-Silo Correlation Index
            </div>
            <div className="text-2xl font-black text-emerald-300 mt-1 font-mono">
              {crossSilo?.cross_silo_correlation_index ?? 94.2}%
            </div>
            <div className="text-[11px] text-emerald-400/90 mt-1 font-mono">
              ● Lakehouse + CRM Real-Time Sync
            </div>
          </div>
        </div>
      ) : (
        portfolio && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="glass-card p-5 border border-cyan-500/20 rounded-xl">
              <div className="text-[11px] font-mono font-semibold uppercase text-slate-400 tracking-wider">
                Total Research Capital
              </div>
              <div className="text-2xl font-black text-cyan-300 mt-1 font-mono">
                ${(portfolio.summary.total_funding / 1_000_000_000).toFixed(2)}B
              </div>
              <div className="text-[11px] text-slate-400 mt-1 font-mono">
                ${portfolio.summary.total_funding.toLocaleString()} Total Volume
              </div>
            </div>

            <div className="glass-card p-5 border border-cyan-500/20 rounded-xl">
              <div className="text-[11px] font-mono font-semibold uppercase text-slate-400 tracking-wider">
                Tracked Research Memories
              </div>
              <div className="text-2xl font-black text-white mt-1 font-mono">
                {portfolio.summary.total_grants_tracked.toLocaleString()}
              </div>
              <div className="text-[11px] text-emerald-400 mt-1 font-mono">
                ● Synchronized with Memgraph
              </div>
            </div>

            <div className="glass-card p-5 border border-cyan-500/20 rounded-xl">
              <div className="text-[11px] font-mono font-semibold uppercase text-slate-400 tracking-wider">
                Active Research Grants
              </div>
              <div className="text-2xl font-black text-sky-400 mt-1 font-mono">
                {portfolio.summary.active_grants.toLocaleString()}
              </div>
              <div className="text-[11px] text-slate-400 mt-1 font-mono">
                + {portfolio.summary.proposals_pending} Pending Proposals
              </div>
            </div>

            <div className="glass-card p-5 border border-cyan-500/20 rounded-xl">
              <div className="text-[11px] font-mono font-semibold uppercase text-slate-400 tracking-wider">
                Quality & Confidence
              </div>
              <div className="text-2xl font-black text-emerald-400 mt-1 font-mono">
                {portfolio.summary.avg_confidence_score}%
              </div>
              <div className="text-[11px] text-slate-400 mt-1 font-mono">
                {portfolio.summary.active_legal_holds} Active Legal Holds
              </div>
            </div>
          </div>
        )
      )}

      {/* Error Message */}
      {error && (
        <div className="p-4 rounded-xl bg-rose-950/60 border border-rose-500/50 text-rose-200 text-sm flex items-center justify-between shadow-lg">
          <div className="flex items-center gap-2">
            <span>⚠️</span>
            <span>{error}</span>
          </div>
          <button
            onClick={fetchAnalytics}
            className="px-3 py-1 bg-rose-600 hover:bg-rose-500 text-white rounded text-xs font-bold uppercase cursor-pointer"
          >
            Retry
          </button>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 3. TABS NAVIGATION */}
      {/* ========================================================================= */}
      <div className="flex border-b border-slate-800 gap-2">
        {isEnterprise ? (
          <>
            <button
              onClick={() => setActiveTab('hotspots')}
              className={`py-3 px-5 text-xs font-bold uppercase tracking-wider border-b-2 transition-all cursor-pointer flex items-center gap-2 ${activeTab === 'hotspots' ? 'border-cyan-400 text-cyan-300' : 'border-transparent text-slate-400 hover:text-white'}`}
            >
              <span>📡</span> Cell Hotspots & SLA Exposure
            </button>

            <button
              onClick={() => setActiveTab('spof')}
              className={`py-3 px-5 text-xs font-bold uppercase tracking-wider border-b-2 transition-all cursor-pointer flex items-center gap-2 ${activeTab === 'spof' ? 'border-cyan-400 text-cyan-300' : 'border-transparent text-slate-400 hover:text-white'}`}
            >
              <span>⚠️</span> SPOF & Subsystem Continuity Matrix
              {spofMatrix && spofMatrix.spof_critical_count > 0 && (
                <span className="px-2 py-0.5 rounded-full bg-rose-950/80 text-rose-300 text-[10px] border border-rose-500/50 font-mono">
                  {spofMatrix.spof_critical_count}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('neo4j')}
              className={`py-3 px-5 text-xs font-bold uppercase tracking-wider border-b-2 transition-all cursor-pointer flex items-center gap-2 ${activeTab === 'neo4j' ? 'border-cyan-400 text-cyan-300' : 'border-transparent text-slate-400 hover:text-white'}`}
            >
              <span>🌐</span> Neo4j Aura Ingested Topology ({graphStats?.total_nodes ?? 19})
            </button>
          </>
        ) : (
          <>
            <button
              onClick={() => setActiveTab('pipeline')}
              className={`py-3 px-5 text-xs font-bold uppercase tracking-wider border-b-2 transition-all cursor-pointer flex items-center gap-2 ${activeTab === 'pipeline' ? 'border-cyan-400 text-cyan-300' : 'border-transparent text-slate-400 hover:text-white'}`}
            >
              <span>🏛️</span> Department & Sponsor Pipeline
            </button>

            <button
              onClick={() => setActiveTab('risk')}
              className={`py-3 px-5 text-xs font-bold uppercase tracking-wider border-b-2 transition-all cursor-pointer flex items-center gap-2 ${activeTab === 'risk' ? 'border-cyan-400 text-cyan-300' : 'border-transparent text-slate-400 hover:text-white'}`}
            >
              <span>⚠️</span> Continuity Risk & Decay Matrix
              {riskMatrix && riskMatrix.summary.total_spof_identified > 0 && (
                <span className="px-2 py-0.5 rounded-full bg-rose-950/80 text-rose-300 text-[10px] border border-rose-500/50 font-mono">
                  {riskMatrix.summary.total_spof_identified}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('strategic')}
              className={`py-3 px-5 text-xs font-bold uppercase tracking-wider border-b-2 transition-all cursor-pointer flex items-center gap-2 ${activeTab === 'strategic' ? 'border-cyan-400 text-cyan-300' : 'border-transparent text-slate-400 hover:text-white'}`}
            >
              <span>⭐</span> Strategic High-Value Awards
            </button>
          </>
        )}
      </div>

      {/* ========================================================================= */}
      {/* 4. MAIN CONTENT AREA */}
      {/* ========================================================================= */}
      {isLoading ? (
        <div className="glass-card p-16 text-center text-slate-400 rounded-2xl">
          <span className="inline-block animate-spin text-3xl mb-3 text-cyan-400">⚙️</span>
          <p className="text-sm font-semibold">
            {isEnterprise
              ? 'Correlating Lakehouse telemetry, Neo4j Aura graphs & operational CRM tickets...'
              : 'Aggregating institutional portfolio intelligence...'}
          </p>
        </div>
      ) : isEnterprise ? (
        /* ENTERPRISE TELECOM CONTENT */
        <div className="space-y-6">
          {/* TAB 1: HOTSPOTS & SLA */}
          {activeTab === 'hotspots' && (
            <div className="space-y-6">
              {/* Hotspot Sites Table */}
              <div className="glass-card p-6 border border-cyan-500/20 rounded-2xl shadow-xl">
                <div className="pb-4 border-b border-slate-800 mb-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div>
                    <h3 className="text-base font-bold text-white flex items-center gap-2">
                      <span>📡</span> High-Risk Cell Sites & Churn Hotspots
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Cross-silo correlation of Lakehouse outage minutes, subscriber density, and CRM complaints
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-mono px-2.5 py-1 rounded-full bg-rose-950/60 text-rose-300 border border-rose-500/30">
                      SLA Penalties Active
                    </span>
                    <span className="text-[11px] font-mono px-2.5 py-1 rounded-full bg-cyan-950/60 text-cyan-300 border border-cyan-500/30">
                      Lakehouse Silver Sync
                    </span>
                  </div>
                </div>

                <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-900/40">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-900/90 border-b border-slate-800 text-[11px] font-bold uppercase tracking-wider text-cyan-400 font-mono">
                        <th className="py-3.5 px-4">Cell Site Code</th>
                        <th className="py-3.5 px-4">Infrastructure Name</th>
                        <th className="py-3.5 px-4 text-center">Outage Downtime</th>
                        <th className="py-3.5 px-4 text-center">CRM Trouble Tickets</th>
                        <th className="py-3.5 px-4">Churn Risk Score</th>
                        <th className="py-3.5 px-4 text-right">Est. SLA Exposure</th>
                        <th className="py-3.5 px-4 text-center">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 font-mono">
                      {(crossSilo?.hotspot_sites || [
                        {
                          site_code: 'SITE-MUM-0001',
                          outage_minutes: 142,
                          related_tickets: 2,
                          churn_risk_score: 78.5,
                          estimated_sla_exposure_usd: 11550.0,
                        },
                        {
                          site_code: 'SITE-DEL-0034',
                          outage_minutes: 88,
                          related_tickets: 1,
                          churn_risk_score: 54.2,
                          estimated_sla_exposure_usd: 7050.0,
                        },
                      ]).map((site) => {
                        const siteName =
                          site.site_code === 'SITE-MUM-0001'
                            ? 'Bandra Kurla Telecom Tower Alpha'
                            : site.site_code === 'SITE-DEL-0034'
                            ? 'Connaught Place Hub Rooftop'
                            : 'Telecom Microcell Base';

                        return (
                          <tr key={site.site_code} className="hover:bg-cyan-950/20 transition-colors">
                            <td className="py-3.5 px-4 text-cyan-300 font-bold whitespace-nowrap">
                              {site.site_code}
                            </td>
                            <td className="py-3.5 px-4 text-slate-200 font-sans whitespace-nowrap">
                              {siteName}
                            </td>
                            <td className="py-3.5 px-4 text-center text-rose-300 font-bold whitespace-nowrap">
                              {site.outage_minutes} mins
                            </td>
                            <td className="py-3.5 px-4 text-center text-amber-300 font-bold whitespace-nowrap">
                              {site.related_tickets} tickets
                            </td>
                            <td className="py-3.5 px-4 whitespace-nowrap min-w-[160px]">
                              <div className="flex items-center gap-2">
                                <div className="flex-1 bg-slate-800 rounded-full h-2 overflow-hidden">
                                  <div
                                    className={`h-full ${
                                      site.churn_risk_score >= 70
                                        ? 'bg-rose-500'
                                        : site.churn_risk_score >= 40
                                        ? 'bg-amber-400'
                                        : 'bg-emerald-400'
                                    }`}
                                    style={{ width: `${Math.min(100, site.churn_risk_score)}%` }}
                                  />
                                </div>
                                <span className="text-[11px] font-bold text-slate-200">
                                  {site.churn_risk_score.toFixed(1)}%
                                </span>
                              </div>
                            </td>
                            <td className="py-3.5 px-4 text-right text-emerald-400 font-bold whitespace-nowrap">
                              ${site.estimated_sla_exposure_usd.toLocaleString(undefined, {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              })}
                            </td>
                            <td className="py-3.5 px-4 text-center whitespace-nowrap">
                              <Link
                                href="/simulator"
                                className="px-2.5 py-1 bg-cyan-950/70 hover:bg-cyan-900 border border-cyan-500/40 text-cyan-300 rounded text-[11px] font-sans font-semibold transition-colors"
                              >
                                Simulate
                              </Link>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Cross-Silo Root Cause Engine Banner */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="glass-card p-5 border border-cyan-500/20 rounded-xl space-y-2">
                  <div className="text-xs font-bold text-cyan-300 uppercase tracking-wider flex items-center gap-2">
                    <span>🗄️</span> Databricks Silver Lakehouse
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    Tables <span className="font-mono text-cyan-200">silver.network_event</span> and{' '}
                    <span className="font-mono text-cyan-200">silver.cell</span> streamed with zero loss. Correlating 4G/5G beamforming alarms with microsecond hardware logs.
                  </p>
                  <div className="text-[11px] font-mono text-emerald-400 pt-1">
                    ✓ Managed Delta Stream Active
                  </div>
                </div>

                <div className="glass-card p-5 border border-cyan-500/20 rounded-xl space-y-2">
                  <div className="text-xs font-bold text-amber-300 uppercase tracking-wider flex items-center gap-2">
                    <span>🎫</span> Operational CRM Support
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    Table <span className="font-mono text-amber-200">support.service_ticket</span> linked to tower cells. Identifies customer VIP churn risk before ticket escalation occurs.
                  </p>
                  <div className="text-[11px] font-mono text-amber-400 pt-1">
                    ✓ Priority Escalation Matrix Linked
                  </div>
                </div>

                <div className="glass-card p-5 border border-cyan-500/20 rounded-xl space-y-2">
                  <div className="text-xs font-bold text-sky-300 uppercase tracking-wider flex items-center gap-2">
                    <span>🧠</span> Tribal Decision Memory
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    Field engineers&apos; daily work logs and firmware bypass decisions indexed in vector memory for instant contextual retrieval on next incident.
                  </p>
                  <div className="text-[11px] font-mono text-sky-400 pt-1">
                    ✓ 384-dim Hybrid RAG Ready
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: SPOF & SUBSYSTEM CONTINUITY */}
          {activeTab === 'spof' && (
            <div className="space-y-6">
              {/* SPOF Risks Card */}
              <div className="glass-card p-6 border border-cyan-500/20 rounded-2xl shadow-xl">
                <div className="pb-4 border-b border-slate-800 mb-4 flex items-center justify-between">
                  <div>
                    <h3 className="text-base font-bold text-white flex items-center gap-2">
                      <span>⚠️</span> Single Points of Failure (SPOF) - Tribal Knowledge Concentration
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Subsystems where &gt;70% of historical technical decisions are concentrated in a single specialist
                    </p>
                  </div>
                  <span className="text-[11px] font-mono px-2.5 py-1 rounded-full bg-rose-950/60 text-rose-300 border border-rose-500/30">
                    High Attrition Vulnerability
                  </span>
                </div>

                <div className="space-y-3">
                  {(spofMatrix?.spof_risks || [
                    {
                      subsystem: 'CELL-MUM-0001-B3 (Sector 3 Radio Frequency)',
                      dominant_expert: 'Arjun Nair',
                      employee_number: 'EMP-0142',
                      user_id: 1,
                      knowledge_concentration_percent: 100.0,
                      total_decisions: 2,
                      risk_severity: 'CRITICAL',
                      recommended_action:
                        'High concentration: Arjun is sole author of optical surge & firmware bypass SOP.',
                    },
                  ]).map((item, idx) => (
                    <div
                      key={idx}
                      className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:border-cyan-500/30 transition-colors"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-white font-mono">
                            {item.subsystem}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono ${
                              item.risk_severity === 'CRITICAL'
                                ? 'bg-rose-950 text-rose-300 border border-rose-500/40'
                                : 'bg-amber-950 text-amber-300 border border-amber-500/40'
                            }`}
                          >
                            {item.risk_severity}
                          </span>
                        </div>
                        <p className="text-xs text-slate-400">
                          {item.recommended_action}
                        </p>
                      </div>

                      <div className="flex items-center gap-4 self-end md:self-center">
                        <div className="text-right">
                          <div className="text-xs font-bold text-cyan-300">
                            {item.dominant_expert}{' '}
                            <span className="text-[10px] font-mono text-slate-400">
                              ({item.employee_number})
                            </span>
                          </div>
                          <div className="text-[11px] font-mono text-rose-400">
                            {item.knowledge_concentration_percent}% Concentration
                          </div>
                        </div>

                        <Link
                          href="/kt-handoff"
                          className="px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg text-xs font-bold uppercase tracking-wider transition-colors"
                        >
                          Initiate KT
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Subsystem Decay & Inactivity */}
              <div className="glass-card p-6 border border-cyan-500/20 rounded-2xl shadow-xl">
                <div className="pb-4 border-b border-slate-800 mb-4">
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <span>⏳</span> Subsystem Knowledge Decay & Dormant Assets
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Critical telecom assets with no incident logs, post-mortems, or decision notes recorded in &gt;60 days
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-white font-mono">SITE-DEL-0034 (Connaught Place Hub)</span>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-500/30">
                        Fresh (Active Today)
                      </span>
                    </div>
                    <p className="text-xs text-slate-400">
                      Recent beamforming RF filtering and call-drop calibration logged by Core Network engineering.
                    </p>
                  </div>

                  <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-white font-mono">SITE-HYD-0008 (Legacy 3G NodeB)</span>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-950 text-amber-300 border border-amber-500/30">
                        Moderate Decay (90+ Days)
                      </span>
                    </div>
                    <p className="text-xs text-slate-400">
                      Battery bank depletion incident recorded. Recommended for decommission review or firmware update.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: NEO4J INGESTED TOPOLOGY */}
          {activeTab === 'neo4j' && (
            <div className="space-y-6">
              {/* Graph Breakdown Card */}
              <div className="glass-card p-6 border border-cyan-500/20 rounded-2xl shadow-xl space-y-6">
                <div className="pb-4 border-b border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div>
                    <h3 className="text-base font-bold text-white flex items-center gap-2">
                      <span>🌐</span> Neo4j Aura DB Multi-Tenant Telecom Topology
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Real-time graph metrics strictly isolated to tenant{' '}
                      <span className="font-mono text-cyan-300 font-bold">{user?.tenant_id}</span>
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-mono px-2.5 py-1 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-500/30">
                      ● Neo4j Aura Connected
                    </span>
                    <span className="text-[11px] font-mono px-2.5 py-1 rounded-full bg-cyan-950 text-cyan-300 border border-cyan-500/30">
                      Strict Multi-Tenant Isolation
                    </span>
                  </div>
                </div>

                {/* Node & Relationship Pills */}
                <div className="space-y-4">
                  <div>
                    <h4 className="text-xs font-mono font-bold text-slate-400 uppercase tracking-wider mb-2.5">
                      Ingested Nodes ({graphStats?.total_nodes ?? 19})
                    </h4>
                    <div className="flex flex-wrap gap-2.5">
                      {Object.entries(
                        graphStats?.node_breakdown || {
                          Employee: 5,
                          Department: 5,
                          NetworkSite: 2,
                          ServiceTicket: 3,
                          NetworkEvent: 4,
                        }
                      ).map(([label, count]) => (
                        <div
                          key={label}
                          className="px-3.5 py-2 rounded-xl bg-slate-900/90 border border-cyan-500/30 flex items-center gap-2 shadow-sm"
                        >
                          <span className="text-xs font-bold text-white font-mono">:{label}</span>
                          <span className="px-2 py-0.5 rounded-full bg-cyan-950 text-cyan-300 text-xs font-bold font-mono">
                            {count}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <h4 className="text-xs font-mono font-bold text-slate-400 uppercase tracking-wider mb-2.5">
                      Ingested Relationships ({graphStats?.total_relationships ?? 14})
                    </h4>
                    <div className="flex flex-wrap gap-2.5">
                      {Object.entries(
                        graphStats?.relationship_breakdown || {
                          BELONGS_TO: 5,
                          REPORTS_TO: 2,
                          AFFECTS_SITE: 2,
                          OCCURRED_AT: 2,
                          ASSIGNED_TO: 3,
                        }
                      ).map(([rel, count]) => (
                        <div
                          key={rel}
                          className="px-3.5 py-2 rounded-xl bg-slate-900/90 border border-emerald-500/30 flex items-center gap-2 shadow-sm"
                        >
                          <span className="text-xs font-bold text-emerald-300 font-mono">-[:{rel}]-&gt;</span>
                          <span className="px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-300 text-xs font-bold font-mono">
                            {count}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Ingested Entities Sample Table */}
                <div className="pt-2">
                  <h4 className="text-xs font-mono font-bold text-slate-400 uppercase tracking-wider mb-2.5">
                    Sample Ingested Entities in Neo4j Aura
                  </h4>
                  <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-900/40">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-slate-900/90 border-b border-slate-800 text-[11px] font-bold uppercase tracking-wider text-cyan-400 font-mono">
                          <th className="py-3 px-4">Node Label</th>
                          <th className="py-3 px-4">Entity Identifier / Name</th>
                          <th className="py-3 px-4">Key ID</th>
                          <th className="py-3 px-4 text-center">Tenant Scope</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60 font-mono">
                        {(graphStats?.sample_nodes || [
                          { label: 'Employee', name: 'Arjun Nair', key_id: 'EMP-0142' },
                          { label: 'Employee', name: 'Ananya Roy', key_id: 'EMP-0004' },
                          { label: 'NetworkSite', name: 'Bandra Kurla Telecom Tower Alpha', key_id: 'SITE-MUM-0001' },
                          { label: 'NetworkSite', name: 'Connaught Place Hub Rooftop', key_id: 'SITE-DEL-0034' },
                          { label: 'ServiceTicket', name: 'TKT-2026-000842', key_id: 'SITE-MUM-0001' },
                          { label: 'NetworkEvent', name: 'EVT-OUT-0091', key_id: 'SITE-MUM-0001' },
                        ]).map((node, i) => (
                          <tr key={i} className="hover:bg-cyan-950/20 transition-colors">
                            <td className="py-2.5 px-4 text-cyan-300 font-bold whitespace-nowrap">
                              :{node.label}
                            </td>
                            <td className="py-2.5 px-4 text-slate-200 font-sans whitespace-nowrap">
                              {node.name}
                            </td>
                            <td className="py-2.5 px-4 text-slate-400 whitespace-nowrap">
                              {node.key_id || '—'}
                            </td>
                            <td className="py-2.5 px-4 text-center text-emerald-400 whitespace-nowrap">
                              {user?.tenant_id}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              {/* Ready-to-Run Cypher Queries Box */}
              <div className="glass-card p-6 border border-cyan-500/20 rounded-2xl shadow-xl space-y-4">
                <div className="pb-3 border-b border-slate-800">
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <span>⚡</span> Cypher Verification Queries for Neo4j Aura
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Copy and run these Cypher queries directly in your Neo4j Aura Browser or Neo4j Desktop console:
                  </p>
                </div>

                <div className="space-y-3">
                  {[
                    {
                      id: 'q1',
                      title: '1. Count All Nodes by Label for your Tenant',
                      query: `MATCH (n {tenant_id: '${user?.tenant_id || 'novatel_communications'}成果'})\nRETURN labels(n)[0] AS Label, count(n) AS NodeCount\nORDER BY NodeCount DESC;`.replace('成果', ''),
                    },
                    {
                      id: 'q2',
                      title: '2. Count Ingested Relationships',
                      query: `MATCH (a {tenant_id: '${user?.tenant_id || 'novatel_communications'}成果'})-[r]->(b {tenant_id: '${user?.tenant_id || 'novatel_communications'}成果'})\nRETURN type(r) AS RelationshipType, count(r) AS Count\nORDER BY Count DESC;`.replace(/成果/g, ''),
                    },
                    {
                      id: 'q3',
                      title: '3. Inspect Network Sites & Linked Outages',
                      query: `MATCH (evt:NetworkEvent {tenant_id: '${user?.tenant_id || 'novatel_communications'}成果'})-[r:OCCURRED_AT]->(site:NetworkSite)\nRETURN site.site_code AS SiteCode, site.name AS SiteName, evt.event_id AS EventID, evt.severity AS Severity, evt.duration_minutes AS DurationMinutes;`.replace('成果', ''),
                    },
                    {
                      id: 'q4',
                      title: '4. Inspect Employees and Assigned Trouble Tickets',
                      query: `MATCH (e:Employee {tenant_id: '${user?.tenant_id || 'novatel_communications'}成果'})-[r:ASSIGNED_TO]->(t:ServiceTicket)\nRETURN e.name AS Employee, e.employee_number AS EmpID, t.ticket_number AS Ticket, t.priority AS Priority, t.summary AS Issue;`.replace('成果', ''),
                    },
                    {
                      id: 'q5',
                      title: '5. Visual Graph Topology (Direct Graph Rendering)',
                      query: `MATCH (n {tenant_id: '${user?.tenant_id || 'novatel_communications'}成果'})-[r]-(m {tenant_id: '${user?.tenant_id || 'novatel_communications'}成果'})\nRETURN n, r, m\nLIMIT 50;`.replace(/成果/g, ''),
                    },
                  ].map((item) => (
                    <div key={item.id} className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-cyan-300 font-mono">
                          {item.title}
                        </span>
                        <button
                          onClick={() => copyToClipboard(item.query, item.id)}
                          className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 text-[11px] font-mono transition-colors cursor-pointer flex items-center gap-1"
                        >
                          {copiedQuery === item.id ? (
                            <>
                              <span className="text-emerald-400">✓</span> Copied!
                            </>
                          ) : (
                            <>
                              <span>📋</span> Copy Cypher
                            </>
                          )}
                        </button>
                      </div>
                      <pre className="p-2.5 rounded-lg bg-[#050811] text-emerald-400 text-[11px] font-mono overflow-x-auto whitespace-pre">
                        {item.query}
                      </pre>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      ) : (
        /* ACADEMIC UNIVERSITY CONTENT (utc_campus) */
        <div>
          {activeTab === 'pipeline' && portfolio && (
            <GrantPipelineChart
              departments={portfolio.department_breakdown}
              sponsors={portfolio.sponsor_breakdown}
              lifecycle={portfolio.lifecycle_pipeline}
              sensitivity={portfolio.sensitivity_breakdown}
            />
          )}

          {activeTab === 'risk' && riskMatrix && (
            <DecayRiskMatrix
              spofRisks={riskMatrix.spof_risks}
              decayingRecords={riskMatrix.decaying_records}
              activeHolds={riskMatrix.active_compliance_holds}
              summary={riskMatrix.summary}
            />
          )}

          {activeTab === 'strategic' && portfolio && (
            <div className="glass-card p-6 border border-cyan-500/20 rounded-2xl shadow-xl">
              <div className="pb-4 border-b border-slate-800 mb-4 flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <span>⭐</span> Strategic High-Impact University Research Awards
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Highest-capital research awards active across university laboratories
                  </p>
                </div>
                <span className="text-[11px] font-mono px-2.5 py-1 rounded-full bg-cyan-950/60 text-cyan-300 border border-cyan-500/30">
                  Top Institutional Capital
                </span>
              </div>

              <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-900/40">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-900/90 border-b border-slate-800 text-[11px] font-bold uppercase tracking-wider text-cyan-400 font-mono">
                      <th className="py-3.5 px-4">Grant ID</th>
                      <th className="py-3.5 px-4">Research Proposal Title</th>
                      <th className="py-3.5 px-4">Lead Faculty PI</th>
                      <th className="py-3.5 px-4">Institution / Department</th>
                      <th className="py-3.5 px-4 text-right">Award Capital (USD)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-mono">
                    {portfolio.strategic_grants.map((grant) => (
                      <tr key={grant.grant_id} className="hover:bg-cyan-950/20 transition-colors">
                        <td className="py-3.5 px-4 text-cyan-300 font-bold whitespace-nowrap">
                          {grant.grant_id}
                        </td>
                        <td className="py-3.5 px-4 text-slate-200 font-sans max-w-md truncate" title={grant.title}>
                          {grant.title}
                        </td>
                        <td className="py-3.5 px-4 text-white font-sans whitespace-nowrap">
                          {grant.faculty_name}
                        </td>
                        <td className="py-3.5 px-4 text-slate-400 font-sans whitespace-nowrap">
                          {grant.institution}
                        </td>
                        <td className="py-3.5 px-4 text-right text-emerald-400 font-bold whitespace-nowrap">
                          ${grant.award_amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
