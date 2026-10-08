'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import { PortfolioAnalytics, RiskMatrix } from '@/types';
import GrantPipelineChart from '@/components/insights/GrantPipelineChart';
import DecayRiskMatrix from '@/components/insights/DecayRiskMatrix';

export default function InsightsPage() {
  const [portfolio, setPortfolio] = useState<PortfolioAnalytics | null>(null);
  const [riskMatrix, setRiskMatrix] = useState<RiskMatrix | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'pipeline' | 'risk' | 'strategic'>('pipeline');
  const [isExporting, setIsExporting] = useState<string | null>(null);

  const fetchAnalytics = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [portData, riskData] = await Promise.all([
        apiFetch<PortfolioAnalytics>('/api/insights/portfolio'),
        apiFetch<RiskMatrix>('/api/insights/risk-matrix')
      ]);
      setPortfolio(portData);
      setRiskMatrix(riskData);
    } catch (err: unknown) {
      console.error('Failed to load institutional analytics:', err);
      setError('Unable to load institutional analytics data. Please ensure backend services are running.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  const handleExport = async (format: 'csv' | 'pdf') => {
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

  return (
    <div className="max-w-[1300px] mx-auto px-4 py-8">
      {/* Executive Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-slate-800 pb-6 mb-8">
        <div>
          <div className="flex items-center gap-3">
            <span className="text-3xl">📊</span>
            <div>
              <h1 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight">
                University Research Intelligence & Analytics
              </h1>
              <p className="text-slate-400 text-xs md:text-sm mt-0.5">
                Executive Research Capital Portfolio, Department Allocations, Continuity Risks & Official Dossiers
              </p>
            </div>
          </div>
        </div>

        {/* Export & Actions */}
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={() => handleExport('csv')}
            disabled={isExporting !== null}
            className="px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
          >
            <span>📥</span> {isExporting === 'csv' ? 'Compiling CSV...' : 'Export Dossier (CSV)'}
          </button>

          <button
            onClick={() => handleExport('pdf')}
            disabled={isExporting !== null}
            className="px-3.5 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-slate-950 text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 transition-colors cursor-pointer shadow-md hover:shadow-amber-500/20 disabled:opacity-50"
          >
            <span>📄</span> {isExporting === 'pdf' ? 'Generating PDF...' : 'Formal Dossier (PDF)'}
          </button>

          <button
            onClick={fetchAnalytics}
            className="p-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-800 text-xs transition-colors cursor-pointer"
            title="Refresh Analytics"
          >
            🔄
          </button>
        </div>
      </div>

      {/* KPI Cards Banner */}
      {portfolio && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-xl">
            <div className="text-[11px] font-semibold uppercase text-slate-400 tracking-wider">
              Total Research Capital
            </div>
            <div className="text-2xl font-black text-amber-400 mt-1 font-mono">
              ${(portfolio.summary.total_funding / 1_000_000_000).toFixed(2)}B
            </div>
            <div className="text-[11px] text-slate-500 mt-1 font-mono">
              ${portfolio.summary.total_funding.toLocaleString()} Total Volume
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-xl">
            <div className="text-[11px] font-semibold uppercase text-slate-400 tracking-wider">
              Tracked Research Memories
            </div>
            <div className="text-2xl font-black text-white mt-1 font-mono">
              {portfolio.summary.total_grants_tracked.toLocaleString()}
            </div>
            <div className="text-[11px] text-emerald-400 mt-1 font-mono">
              ● Synchronized with Neo4j Aura
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-xl">
            <div className="text-[11px] font-semibold uppercase text-slate-400 tracking-wider">
              Active Research Grants
            </div>
            <div className="text-2xl font-black text-blue-400 mt-1 font-mono">
              {portfolio.summary.active_grants.toLocaleString()}
            </div>
            <div className="text-[11px] text-slate-500 mt-1 font-mono">
              + {portfolio.summary.proposals_pending} Pending Proposals
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-xl">
            <div className="text-[11px] font-semibold uppercase text-slate-400 tracking-wider">
              Quality & Confidence
            </div>
            <div className="text-2xl font-black text-emerald-400 mt-1 font-mono">
              {portfolio.summary.avg_confidence_score}%
            </div>
            <div className="text-[11px] text-slate-500 mt-1 font-mono">
              {portfolio.summary.active_legal_holds} Active Legal Holds
            </div>
          </div>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="mb-6 p-4 rounded-xl bg-red-950/40 border border-red-500/40 text-red-200 text-sm flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span>⚠️</span>
            <span>{error}</span>
          </div>
          <button
            onClick={fetchAnalytics}
            className="px-3 py-1 bg-red-600 hover:bg-red-500 text-white rounded text-xs font-bold uppercase cursor-pointer"
          >
            Retry
          </button>
        </div>
      )}

      {/* Tabs Navigation */}
      <div className="flex border-b border-slate-800 mb-6 gap-2">
        <button
          onClick={() => setActiveTab('pipeline')}
          className={`py-2.5 px-4 text-xs font-bold uppercase tracking-wider border-b-2 transition-all cursor-pointer flex items-center gap-2 ${activeTab === 'pipeline' ? 'border-amber-500 text-amber-400' : 'border-transparent text-slate-400 hover:text-white'}`}
        >
          <span>🏛️</span> Department & Sponsor Pipeline
        </button>

        <button
          onClick={() => setActiveTab('risk')}
          className={`py-2.5 px-4 text-xs font-bold uppercase tracking-wider border-b-2 transition-all cursor-pointer flex items-center gap-2 ${activeTab === 'risk' ? 'border-amber-500 text-amber-400' : 'border-transparent text-slate-400 hover:text-white'}`}
        >
          <span>⚠️</span> Continuity Risk & Decay Matrix
          {riskMatrix && riskMatrix.summary.total_spof_identified > 0 && (
            <span className="px-1.5 py-0.2 rounded-full bg-red-900/60 text-red-300 text-[10px] border border-red-500/40 font-mono">
              {riskMatrix.summary.total_spof_identified}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('strategic')}
          className={`py-2.5 px-4 text-xs font-bold uppercase tracking-wider border-b-2 transition-all cursor-pointer flex items-center gap-2 ${activeTab === 'strategic' ? 'border-amber-500 text-amber-400' : 'border-transparent text-slate-400 hover:text-white'}`}
        >
          <span>⭐</span> Strategic High-Value Awards
        </button>
      </div>

      {/* Main Content Area */}
      {isLoading ? (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-16 text-center text-slate-400">
          <span className="inline-block animate-spin text-3xl mb-3">⚙️</span>
          <p className="text-sm font-semibold">Aggregating institutional portfolio intelligence...</p>
        </div>
      ) : (
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
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-xl">
              <div className="pb-4 border-b border-slate-800 mb-4 flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <span>⭐</span> Strategic High-Impact University Research Awards
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Highest-capital research awards active across university laboratories
                  </p>
                </div>
                <span className="text-[11px] font-mono px-2.5 py-1 rounded bg-amber-500/10 text-amber-400 border border-amber-500/30">
                  Top Institutional Capital
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-950 border-b border-slate-800 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                      <th className="py-3 px-4">Grant ID</th>
                      <th className="py-3 px-4">Research Proposal Title</th>
                      <th className="py-3 px-4">Lead Faculty PI</th>
                      <th className="py-3 px-4">Institution / Department</th>
                      <th className="py-3 px-4 text-right">Award Capital (USD)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-mono">
                    {portfolio.strategic_grants.map((grant) => (
                      <tr key={grant.grant_id} className="hover:bg-slate-800/40 transition-colors">
                        <td className="py-3 px-4 text-amber-400 font-bold whitespace-nowrap">
                          {grant.grant_id}
                        </td>
                        <td className="py-3 px-4 text-slate-200 font-sans max-w-md truncate" title={grant.title}>
                          {grant.title}
                        </td>
                        <td className="py-3 px-4 text-white font-sans whitespace-nowrap">
                          {grant.faculty_name}
                        </td>
                        <td className="py-3 px-4 text-slate-400 font-sans whitespace-nowrap">
                          {grant.institution}
                        </td>
                        <td className="py-3 px-4 text-right text-emerald-400 font-bold whitespace-nowrap">
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
