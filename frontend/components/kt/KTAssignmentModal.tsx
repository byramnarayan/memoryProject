'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';

interface KTAssignmentModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

interface EmployeeItem {
  id: number;
  username: string;
  first_name?: string | null;
  last_name?: string | null;
  employee_number?: string | null;
  job_title?: string | null;
  department: string;
}

export default function KTAssignmentModal({ onClose, onSuccess }: KTAssignmentModalProps) {
  const { token } = useAuth();
  const [employees, setEmployees] = useState<EmployeeItem[]>([]);
  const [isLoadingEmps, setIsLoadingEmps] = useState(true);

  const [title, setTitle] = useState('');
  const [predecessorId, setPredecessorId] = useState<number | ''>('');
  const [successorId, setSuccessorId] = useState<number | ''>('');
  const [scopeDescription, setScopeDescription] = useState('');
  const [systemsInScope, setSystemsInScope] = useState('CELL-MUM-0001, CELL-MUM-0002, CORE-EPC-GW-01');

  const [isSubmitting, setIsSubmitting] = useState(false);
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
          if (data.length >= 2) {
            setPredecessorId(data[0].id);
            setSuccessorId(data[1].id);
            const pName = `${data[0].first_name || ''} ${data[0].last_name || ''}`.trim() || data[0].username;
            const sName = `${data[1].first_name || ''} ${data[1].last_name || ''}`.trim() || data[1].username;
            setTitle(`${data[0].department} Knowledge Transfer: ${pName} ➔ ${sName}`);
            setScopeDescription(`Complete operational succession covering ${data[0].department} systems, unwritten post-mortems, and vendor quirks.`);
          }
        }
      } catch (err) {
        console.error('Failed to load employees for KT assignment:', err);
      } finally {
        setIsLoadingEmps(false);
      }
    };
    fetchEmployees();
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !predecessorId || !successorId || !title.trim()) {
      setErrorMsg('Please select both employees and provide a title.');
      return;
    }
    if (predecessorId === successorId) {
      setErrorMsg('Predecessor and Successor cannot be the same person.');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg('');

    const systems = systemsInScope
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    try {
      const res = await fetch('/api/kt/assignments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title: title.trim(),
          predecessor_id: predecessorId,
          successor_id: successorId,
          scope_description: scopeDescription.trim() || null,
          systems_in_scope: systems,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || 'Failed to create KT assignment.');
      }

      onSuccess();
    } catch (err: any) {
      setErrorMsg(err.message || 'An error occurred.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const getEmpLabel = (emp: EmployeeItem) => {
    const name = `${emp.first_name || ''} ${emp.last_name || ''}`.trim() || emp.username;
    return `${name} (${emp.employee_number || 'EMP'} • ${emp.job_title || emp.department})`;
  };

  return (
    <div className="bg-[#0f172a] border border-slate-700/80 rounded-xl p-6 shadow-2xl text-slate-100 max-w-2xl w-full mx-auto">
      <div className="flex items-center justify-between pb-4 border-b border-slate-800">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <span>🤝</span> Create Knowledge Transfer Assignment
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Pair a transitioning senior employee with a successor to guarantee zero-loss intuition handover.
          </p>
        </div>
        <button
          onClick={onClose}
          className="text-slate-400 hover:text-white text-lg font-bold p-1 cursor-pointer"
        >
          ✕
        </button>
      </div>

      {errorMsg && (
        <div className="mt-4 p-3 bg-red-950/60 border border-red-500/50 rounded text-red-200 text-xs">
          ⚠️ {errorMsg}
        </div>
      )}

      {isLoadingEmps ? (
        <div className="py-12 text-center text-slate-400 text-xs">
          Loading company employees directory...
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
              KT Title / Succession Program Name *
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. RF Optimization Succession: Arjun Nair ➔ Maya Lin"
              className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded text-sm text-white placeholder-slate-500 focus:outline-none focus:border-amber-400"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-amber-300 uppercase tracking-wider mb-1">
                Predecessor (Senior Transitioning) *
              </label>
              <select
                required
                value={predecessorId}
                onChange={(e) => setPredecessorId(Number(e.target.value))}
                className="w-full px-3 py-2 bg-slate-900 border border-amber-500/40 rounded text-sm text-white focus:outline-none focus:border-amber-400 font-sans"
              >
                <option value="">Select Predecessor...</option>
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {getEmpLabel(emp)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-emerald-300 uppercase tracking-wider mb-1">
                Successor (New Hire / Shadow) *
              </label>
              <select
                required
                value={successorId}
                onChange={(e) => setSuccessorId(Number(e.target.value))}
                className="w-full px-3 py-2 bg-slate-900 border border-emerald-500/40 rounded text-sm text-white focus:outline-none focus:border-amber-400 font-sans"
              >
                <option value="">Select Successor...</option>
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {getEmpLabel(emp)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
              Knowledge Scope & Systems Handover Description
            </label>
            <textarea
              rows={2}
              value={scopeDescription}
              onChange={(e) => setScopeDescription(e.target.value)}
              placeholder="Describe the operational scope, customer SLAs, and equipment handled..."
              className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded text-sm text-white placeholder-slate-500 focus:outline-none focus:border-amber-400"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
              Systems / Radio Cells in Scope (Comma-separated)
            </label>
            <input
              type="text"
              value={systemsInScope}
              onChange={(e) => setSystemsInScope(e.target.value)}
              placeholder="e.g. CELL-MUM-0001, CELL-MUM-0002, CORE-EPC-GW-01"
              className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded text-sm text-white font-mono placeholder-slate-500 focus:outline-none focus:border-amber-400"
            />
            <span className="text-[10px] text-slate-500 mt-1 block">
              Auto-populates checklist items linking to these specific network systems from the predecessor&apos;s daily logs.
            </span>
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 border border-slate-600 rounded text-sm text-slate-300 hover:bg-slate-800 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold rounded text-sm transition-all shadow-md shadow-amber-500/20 disabled:opacity-50 cursor-pointer flex items-center gap-2"
            >
              {isSubmitting ? 'Generating Checklist & Handover...' : 'Create KT Assignment'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
