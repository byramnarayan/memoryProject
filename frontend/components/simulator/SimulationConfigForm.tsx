'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';

interface SimulationConfigFormProps {
  onSimulationComplete: (results: any) => void;
}

export default function SimulationConfigForm({ onSimulationComplete }: SimulationConfigFormProps) {
  const { user, token } = useAuth();
  const isAcademic = user?.tenant_id === 'utc_campus';

  // Scenario selection: defaults to PI_DEPARTURE for academic, EMPLOYEE_DEPARTURE for telco
  const [scenarioType, setScenarioType] = useState<string>(
    isAcademic ? 'PI_DEPARTURE' : 'EMPLOYEE_DEPARTURE'
  );
  const [employees, setEmployees] = useState<any[]>([]);

  // Synchronize scenario type if domain toggles
  useEffect(() => {
    if (isAcademic && (scenarioType === 'EMPLOYEE_DEPARTURE' || scenarioType === 'PLANNED_OUTAGE' || scenarioType === 'HARDWARE_UPGRADE')) {
      setScenarioType('PI_DEPARTURE');
    } else if (!isAcademic && (scenarioType === 'PI_DEPARTURE' || scenarioType === 'GRANT_BUDGET_CUT' || scenarioType === 'IRB_COMPLIANCE_HOLD')) {
      setScenarioType('EMPLOYEE_DEPARTURE');
    }
  }, [isAcademic]);

  // Scenario 1: Departure
  const [selectedEmpId, setSelectedEmpId] = useState<number | string>('');

  // Telco Scenario 2: Planned Outage
  const [siteCode, setSiteCode] = useState('SITE-MUM-0001');
  const [downtimeHours, setDowntimeHours] = useState('4.0');
  const [timeWindow, setTimeWindow] = useState('PEAK_BUSINESS');

  // Telco Scenario 3: Hardware Upgrade
  const [upgradeName, setUpgradeName] = useState('Optical SFP+ Transceiver & Firmware v3.3 Rollout');
  const [clusterTowers, setClusterTowers] = useState('12');

  // Academic Scenario 2: Grant Budget Cut
  const [cutPercentage, setCutPercentage] = useState('20');
  const [sponsorAgency, setSponsorAgency] = useState('National Science Foundation (NSF)');
  const [affectedColleges, setAffectedColleges] = useState('College of Engineering & Computer Science');

  // Academic Scenario 3: IRB Compliance Freeze
  const [protocolId, setProtocolId] = useState('IRB-2025-0842 (Cyber-Physical Clinical Data Protocol)');
  const [holdDurationWeeks, setHoldDurationWeeks] = useState('12');
  const [auditFocus, setAuditFocus] = useState('Human-Subject Data De-Identification & HIPAA Consent');

  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    const fetchEmployees = async () => {
      if (!token) return;
      try {
        const res = await fetch('/api/employees', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setEmployees(data);
          if (data.length > 0) {
            setSelectedEmpId(data[0].id);
          }
        }
      } catch (err) {
        console.error('Failed to load specialists for simulation:', err);
      }
    };
    fetchEmployees();
  }, [token]);

  const handleRun = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setIsLoading(true);
    setErrorMsg('');

    let params: Record<string, any> = {};

    if (scenarioType === 'EMPLOYEE_DEPARTURE' || scenarioType === 'PI_DEPARTURE') {
      params = { employee_id: selectedEmpId ? Number(selectedEmpId) : (isAcademic ? 4 : 46) };
    } else if (scenarioType === 'PLANNED_OUTAGE') {
      params = {
        site_code: siteCode,
        downtime_hours: parseFloat(downtimeHours),
        time_window: timeWindow,
      };
    } else if (scenarioType === 'HARDWARE_UPGRADE') {
      params = {
        upgrade_name: upgradeName,
        cluster_towers_count: parseInt(clusterTowers, 10),
      };
    } else if (scenarioType === 'GRANT_BUDGET_CUT') {
      params = {
        cut_percentage: parseFloat(cutPercentage),
        sponsor_agency: sponsorAgency,
        affected_colleges: affectedColleges,
      };
    } else if (scenarioType === 'IRB_COMPLIANCE_HOLD') {
      params = {
        protocol_id: protocolId,
        hold_duration_weeks: parseInt(holdDurationWeeks, 10),
        audit_focus: auditFocus,
      };
    }

    try {
      const res = await fetch('/api/enterprise-analytics/simulate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          scenario_type: scenarioType,
          params: params,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || 'Simulation execution failed.');
      }

      onSimulationComplete(data.results);
    } catch (err: any) {
      setErrorMsg(err.message || 'Simulation execution failed.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="glass-panel border-cyan-500/30 rounded-2xl p-6 shadow-2xl text-slate-100 shadow-cyan-950/40">
      <div className="flex items-center justify-between pb-4 border-b border-cyan-500/15">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <span className="text-cyan-400">🎲</span> Configure What-If Simulation
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            {isAcademic
              ? 'Test institutional scenarios against NSF/DoD grants, faculty lab custody, and IRB ethics protocols.'
              : 'Test operational scenarios against Databricks telemetry, CRM churn risk, and specialist tacit intuition.'}
          </p>
        </div>
        <span className="text-xs font-mono px-3 py-1 rounded-full bg-cyan-950/60 border border-cyan-500/30 text-cyan-300">
          {isAcademic ? 'University Research Domain' : 'Telecom Network Domain'}
        </span>
      </div>

      {errorMsg && (
        <div className="mt-4 p-3 bg-red-950/60 border border-red-500/50 rounded text-red-200 text-xs">
          ⚠️ {errorMsg}
        </div>
      )}

      {/* Domain-Adaptive Scenario Type Selector */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mt-4">
        {isAcademic ? (
          <>
            <button
              type="button"
              onClick={() => setScenarioType('PI_DEPARTURE')}
              className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                scenarioType === 'PI_DEPARTURE'
                  ? 'bg-cyan-500/20 border-cyan-400 text-cyan-200 shadow-md shadow-cyan-500/10'
                  : 'bg-[#080d1a]/80 border-cyan-500/15 text-slate-400 hover:border-cyan-500/40 hover:text-slate-200'
              }`}
            >
              <span className="text-sm block font-bold text-white">🎓 Principal Investigator Departure</span>
              <span className="text-[11px] opacity-80 mt-0.5 block">Quantify grant clawback & orphaned student fellows</span>
            </button>

            <button
              type="button"
              onClick={() => setScenarioType('GRANT_BUDGET_CUT')}
              className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                scenarioType === 'GRANT_BUDGET_CUT'
                  ? 'bg-cyan-500/20 border-cyan-400 text-cyan-200 shadow-md shadow-cyan-500/10'
                  : 'bg-[#080d1a]/80 border-cyan-500/15 text-slate-400 hover:border-cyan-500/40 hover:text-slate-200'
              }`}
            >
              <span className="text-sm block font-bold text-white">📉 Federal Grant Budget Cut</span>
              <span className="text-[11px] opacity-80 mt-0.5 block">Model 15-30% capital loss & lab overhead deficit</span>
            </button>

            <button
              type="button"
              onClick={() => setScenarioType('IRB_COMPLIANCE_HOLD')}
              className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                scenarioType === 'IRB_COMPLIANCE_HOLD'
                  ? 'bg-cyan-500/20 border-cyan-400 text-cyan-200 shadow-md shadow-cyan-500/10'
                  : 'bg-[#080d1a]/80 border-cyan-500/15 text-slate-400 hover:border-cyan-500/40 hover:text-slate-200'
              }`}
            >
              <span className="text-sm block font-bold text-white">⚖️ IRB Regulatory Ethics Freeze</span>
              <span className="text-[11px] opacity-80 mt-0.5 block">Project clinical trial pauses & publication delays</span>
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => setScenarioType('EMPLOYEE_DEPARTURE')}
              className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                scenarioType === 'EMPLOYEE_DEPARTURE'
                  ? 'bg-cyan-500/20 border-cyan-400 text-cyan-200 shadow-md shadow-cyan-500/10'
                  : 'bg-[#080d1a]/80 border-cyan-500/15 text-slate-400 hover:border-cyan-500/40 hover:text-slate-200'
              }`}
            >
              <span className="text-sm block font-bold text-white">🏢 Specialist Departure</span>
              <span className="text-[11px] opacity-80 mt-0.5 block">Simulate knowledge loss & uncovered cells</span>
            </button>

            <button
              type="button"
              onClick={() => setScenarioType('PLANNED_OUTAGE')}
              className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                scenarioType === 'PLANNED_OUTAGE'
                  ? 'bg-cyan-500/20 border-cyan-400 text-cyan-200 shadow-md shadow-cyan-500/10'
                  : 'bg-[#080d1a]/80 border-cyan-500/15 text-slate-400 hover:border-cyan-500/40 hover:text-slate-200'
              }`}
            >
              <span className="text-sm block font-bold text-white">📡 Planned Cell Outage</span>
              <span className="text-[11px] opacity-80 mt-0.5 block">Project SLA penalties & churn spikes</span>
            </button>

            <button
              type="button"
              onClick={() => setScenarioType('HARDWARE_UPGRADE')}
              className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                scenarioType === 'HARDWARE_UPGRADE'
                  ? 'bg-cyan-500/20 border-cyan-400 text-cyan-200 shadow-md shadow-cyan-500/10'
                  : 'bg-[#080d1a]/80 border-cyan-500/15 text-slate-400 hover:border-cyan-500/40 hover:text-slate-200'
              }`}
            >
              <span className="text-sm block font-bold text-white">⚙️ Hardware Upgrade</span>
              <span className="text-[11px] opacity-80 mt-0.5 block">Model Capex ROI & call drop reductions</span>
            </button>
          </>
        )}
      </div>

      <form onSubmit={handleRun} className="mt-5 space-y-4">
        {/* Scenario 1: Departure Form (Dynamic for Academic vs Telco) */}
        {(scenarioType === 'EMPLOYEE_DEPARTURE' || scenarioType === 'PI_DEPARTURE') && (
          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
              {isAcademic
                ? 'Select Lead Principal Investigator / Faculty Specialist'
                : 'Select Key Telecom Engineer / Operations Specialist'}
            </label>
            <select
              value={selectedEmpId}
              onChange={(e) => setSelectedEmpId(Number(e.target.value))}
              className="w-full px-3 py-2 bg-[#080d1a] border border-cyan-500/20 rounded-lg text-sm text-white focus:outline-none focus:border-cyan-400 font-sans"
            >
              {employees.length === 0 ? (
                isAcademic ? (
                  <>
                    <option value="4">Dr. Eleanor Vance (Lead PI • Cyber-Physical Systems & AI)</option>
                    <option value="5">Dr. Arthur Pendelton (Lead PI • Quantum Optics & Metrology)</option>
                    <option value="3">Dr. Marcus Vance (Department Chair • Computer Science)</option>
                  </>
                ) : (
                  <>
                    <option value="46">Arjun Nair (Lead RF Optimization Engineer • Radio Access Network)</option>
                    <option value="47">Vikram Malhotra (Senior Core Network Engineer • Core EPC & 5G)</option>
                    <option value="48">Ananya Roy (Customer Support & SLA Lead • Customer Operations)</option>
                    <option value="49">Rohan Sharma (Field Operations Specialist • Microwave & Towers)</option>
                  </>
                )
              ) : (
                employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.first_name || emp.username} {emp.last_name || ''} ({emp.job_title || emp.role} • {emp.department})
                  </option>
                ))
              )}
            </select>
            <span className="text-[11px] text-slate-500 mt-1 block">
              {isAcademic
                ? 'Quantifies what happens to federal grant funding, student researchers, and lab continuity if this PI departs.'
                : 'Quantifies what happens to tower coverage, SLA exposure, and subscriber churn if this specialist leaves.'}
            </span>
          </div>
        )}

        {/* Academic Scenario 2: Grant Budget Cut */}
        {scenarioType === 'GRANT_BUDGET_CUT' && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                Reduction Percentage (%)
              </label>
              <select
                value={cutPercentage}
                onChange={(e) => setCutPercentage(e.target.value)}
                className="w-full px-3 py-2 bg-[#080d1a] border border-cyan-500/20 rounded-lg text-sm text-white focus:outline-none focus:border-cyan-400"
              >
                <option value="10">10% Indirect Cost Adjustment</option>
                <option value="20">20% Federal Omnibus Sequester (Default)</option>
                <option value="30">30% Major Program Rescission</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                Funding Sponsor Body
              </label>
              <input
                type="text"
                value={sponsorAgency}
                onChange={(e) => setSponsorAgency(e.target.value)}
                placeholder="e.g. National Science Foundation (NSF)"
                className="w-full px-3 py-2 bg-[#080d1a] border border-cyan-500/20 rounded-lg text-sm text-white focus:outline-none focus:border-cyan-400"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                Target Host College
              </label>
              <input
                type="text"
                value={affectedColleges}
                onChange={(e) => setAffectedColleges(e.target.value)}
                placeholder="e.g. College of Engineering & CS"
                className="w-full px-3 py-2 bg-[#080d1a] border border-cyan-500/20 rounded-lg text-sm text-white focus:outline-none focus:border-cyan-400"
              />
            </div>
          </div>
        )}

        {/* Academic Scenario 3: IRB Compliance Freeze */}
        {scenarioType === 'IRB_COMPLIANCE_HOLD' && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                Target IRB Protocol Identifier
              </label>
              <input
                type="text"
                value={protocolId}
                onChange={(e) => setProtocolId(e.target.value)}
                placeholder="e.g. IRB-2025-0842 (Cyber-Physical Clinical Data Protocol)"
                className="w-full px-3 py-2 bg-[#080d1a] border border-cyan-500/20 rounded-lg text-sm text-white focus:outline-none focus:border-cyan-400"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                Projected Hold Duration (Weeks)
              </label>
              <input
                type="number"
                min="2"
                max="52"
                value={holdDurationWeeks}
                onChange={(e) => setHoldDurationWeeks(e.target.value)}
                className="w-full px-3 py-2 bg-[#080d1a] border border-cyan-500/20 rounded-lg text-sm text-white focus:outline-none focus:border-cyan-400"
              />
            </div>
          </div>
        )}

        {/* Telco Scenario 2: Planned Outage */}
        {scenarioType === 'PLANNED_OUTAGE' && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                  Target Radio Site Code
                </label>
                <input
                  type="text"
                  value={siteCode}
                  onChange={(e) => setSiteCode(e.target.value)}
                  placeholder="e.g. SITE-MUM-0001"
                  className="w-full px-3 py-2 bg-[#080d1a] border border-cyan-500/20 rounded-lg text-sm text-white font-mono focus:outline-none focus:border-cyan-400"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                  Downtime Duration (Hours)
                </label>
                <input
                  type="number"
                  step="0.5"
                  min="0.5"
                  max="48"
                  value={downtimeHours}
                  onChange={(e) => setDowntimeHours(e.target.value)}
                  className="w-full px-3 py-2 bg-[#080d1a] border border-cyan-500/20 rounded-lg text-sm text-white focus:outline-none focus:border-cyan-400"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                  Maintenance Time Window
                </label>
                <select
                  value={timeWindow}
                  onChange={(e) => setTimeWindow(e.target.value)}
                  className="w-full px-3 py-2 bg-[#080d1a] border border-cyan-500/20 rounded-lg text-sm text-white focus:outline-none focus:border-cyan-400"
                >
                  <option value="PEAK_BUSINESS">Peak Business Hours (High SLA Impact)</option>
                  <option value="OFF_PEAK_NIGHT">Off-Peak Window (02:00 - 05:00 UTC)</option>
                </select>
              </div>
            </div>
          </div>
        )}

        {/* Telco Scenario 3: Hardware Upgrade */}
        {scenarioType === 'HARDWARE_UPGRADE' && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                Component / Firmware Initiative Name
              </label>
              <input
                type="text"
                value={upgradeName}
                onChange={(e) => setUpgradeName(e.target.value)}
                placeholder="e.g. Optical SFP+ Transceiver & Firmware v3.3 Rollout"
                className="w-full px-3 py-2 bg-[#080d1a] border border-cyan-500/20 rounded-lg text-sm text-white focus:outline-none focus:border-cyan-400"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                Towers / Cluster Size
              </label>
              <input
                type="number"
                min="1"
                max="500"
                value={clusterTowers}
                onChange={(e) => setClusterTowers(e.target.value)}
                className="w-full px-3 py-2 bg-[#080d1a] border border-cyan-500/20 rounded-lg text-sm text-white focus:outline-none focus:border-cyan-400"
              />
            </div>
          </div>
        )}

        <div className="flex items-center justify-end pt-3 border-t border-cyan-500/15">
          <button
            type="submit"
            disabled={isLoading}
            className="btn-primary-cyan flex items-center gap-2 disabled:opacity-50 cursor-pointer text-sm"
          >
            {isLoading ? (
              <>
                <span className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                Simulating Impact Across Domain Knowledge...
              </>
            ) : (
              <>
                <span>🚀 Run What-If Simulation</span>
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
