'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';

export default function SetupCompanyPage() {
  const router = useRouter();
  const { login } = useAuth();

  const [companyName, setCompanyName] = useState('');
  const [tenantId, setTenantId] = useState('');
  const [industry, setIndustry] = useState('Telecom');
  const [adminName, setAdminName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [departments, setDepartments] = useState([
    'Network Operations',
    'Customer Support',
    'Radio Frequency Engineering',
    'Billing & Mediation',
    'Executive Leadership'
  ]);
  const [newDeptInput, setNewDeptInput] = useState('');

  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  // Auto-generate slug from company name if user hasn't explicitly edited it
  const handleCompanyNameChange = (val: string) => {
    setCompanyName(val);
    const slug = val
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
    setTenantId(slug);
  };

  const addDepartment = () => {
    if (newDeptInput.trim() && !departments.includes(newDeptInput.trim())) {
      setDepartments([...departments, newDeptInput.trim()]);
      setNewDeptInput('');
    }
  };

  const removeDepartment = (dept: string) => {
    setDepartments(departments.filter(d => d !== dept));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);

    try {
      const payload = {
        company_name: companyName,
        tenant_id: tenantId,
        industry: industry,
        admin_name: adminName,
        admin_email: adminEmail,
        admin_password: adminPassword,
        initial_departments: departments
      };

      const res = await fetch('/api/tenant/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || 'Tenant provisioning failed.');
      }

      setSuccess(true);
      // Auto login with new tenant admin credentials and navigate directly to /connectors
      setTimeout(async () => {
        try {
          if (data.access_token) {
            await login(data.access_token, undefined, '/connectors');
          } else {
            await login(adminEmail, adminPassword, '/connectors');
          }
        } catch {
          router.push('/connectors');
        }
      }, 1200);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An error occurred during tenant setup.');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen py-12 px-4 md:px-8">
      <div className="max-w-3xl mx-auto glass-card p-8 sm:p-10 border border-cyan-500/20 shadow-[0_8px_32px_rgba(0,0,0,0.6)] rounded-2xl">
        {/* Header */}
        <div className="border-b border-slate-800 pb-6 mb-8 text-center sm:text-left">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-950/60 border border-cyan-500/30 text-cyan-300 text-xs font-mono font-semibold mb-3">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse"></span>
            Enterprise Multi-Tenant Setup
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            Provision New Organization & Company Brain
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-2 max-w-xl leading-relaxed">
            Register your enterprise tenant, bootstrap departmental silos, and configure master RBAC credentials for complete institutional memory isolation.
          </p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-rose-950/60 border border-rose-500/50 rounded-xl text-rose-200 text-xs flex items-center gap-2 shadow-lg">
            <span>⚠️</span>
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div className="mb-6 p-4 bg-emerald-950/60 border border-emerald-500/50 rounded-xl text-emerald-200 text-xs flex items-center gap-3 shadow-lg">
            <span className="text-lg">🎉</span>
            <span>Organization successfully registered! Logging into Executive Workspace...</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-8">
          {/* Section 1: Organization Details */}
          <div>
            <h2 className="text-sm font-bold text-white uppercase tracking-wider mb-4 pb-2 border-b border-slate-800 flex items-center gap-2">
              <span className="text-cyan-400 font-mono font-bold">01</span> Organization Profile
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                  Company Name <span className="text-cyan-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Apex Telecommunications Ltd."
                  value={companyName}
                  onChange={(e) => handleCompanyNameChange(e.target.value)}
                  className="w-full bg-slate-900/80 border border-slate-700 rounded-lg px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400/50 text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                  Tenant Identifier (Slug) <span className="text-cyan-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. apex_telecom"
                  value={tenantId}
                  onChange={(e) => setTenantId(e.target.value)}
                  className="w-full bg-slate-900/80 border border-slate-700 rounded-lg px-4 py-2.5 text-white font-mono placeholder-slate-500 focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400/50 text-xs"
                />
                <p className="text-[10px] text-slate-500 mt-1">Unique slug used for strict multi-tenant database & graph isolation.</p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                  Industry Vertical
                </label>
                <select
                  value={industry}
                  onChange={(e) => setIndustry(e.target.value)}
                  className="w-full bg-slate-900/80 border border-slate-700 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-cyan-400 text-xs"
                >
                  <option value="Telecom" className="bg-slate-900">Telecom & Network Infrastructure</option>
                  <option value="Technology" className="bg-slate-900">Software & Cloud Enterprise</option>
                  <option value="Finance" className="bg-slate-900">Banking & Financial Services</option>
                  <option value="Energy" className="bg-slate-900">Energy, Utilities & Utilities</option>
                  <option value="Healthcare" className="bg-slate-900">Healthcare & Life Sciences</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                  Plan Tier
                </label>
                <div className="flex items-center gap-2 bg-slate-900/60 border border-slate-700 rounded-lg px-4 py-2.5 text-xs text-slate-300">
                  <span className="w-2 h-2 rounded-full bg-cyan-400"></span>
                  <span className="font-semibold text-white">Enterprise MaaS Edition</span>
                  <span className="text-[10px] text-cyan-400 ml-auto font-mono">Unlimited Silos</span>
                </div>
              </div>
            </div>
          </div>

          {/* Section 2: Executive Administrator */}
          <div>
            <h2 className="text-sm font-bold text-white uppercase tracking-wider mb-4 pb-2 border-b border-slate-800 flex items-center gap-2">
              <span className="text-cyan-400 font-mono font-bold">02</span> Head of Company (Executive Admin)
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                  Executive Full Name <span className="text-cyan-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Marcus Vance"
                  value={adminName}
                  onChange={(e) => setAdminName(e.target.value)}
                  className="w-full bg-slate-900/80 border border-slate-700 rounded-lg px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400/50 text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                  Official Work Email <span className="text-cyan-400">*</span>
                </label>
                <input
                  type="email"
                  required
                  placeholder="marcus@company.com"
                  value={adminEmail}
                  onChange={(e) => setAdminEmail(e.target.value)}
                  className="w-full bg-slate-900/80 border border-slate-700 rounded-lg px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400/50 text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                  Master Password <span className="text-cyan-400">*</span>
                </label>
                <input
                  type="password"
                  required
                  minLength={8}
                  placeholder="••••••••••••"
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                  className="w-full bg-slate-900/80 border border-slate-700 rounded-lg px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400/50 text-xs"
                />
              </div>
            </div>
          </div>

          {/* Section 3: Seed Departments */}
          <div>
            <h2 className="text-sm font-bold text-white uppercase tracking-wider mb-4 pb-2 border-b border-slate-800 flex items-center gap-2">
              <span className="text-cyan-400 font-mono font-bold">03</span> Enterprise Departments Setup
            </h2>
            <p className="text-xs text-slate-400 mb-3">
              Configure initial departments for employee role mapping, incident scopes, and knowledge transfer domains.
            </p>

            <div className="flex flex-wrap gap-2 mb-4">
              {departments.map((dept) => (
                <span
                  key={dept}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-900/80 border border-slate-700 rounded-lg text-xs text-slate-200"
                >
                  <span>🏛️ {dept}</span>
                  <button
                    type="button"
                    onClick={() => removeDepartment(dept)}
                    className="text-slate-400 hover:text-rose-400 ml-1 font-bold cursor-pointer"
                    title="Remove"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>

            <div className="flex gap-2 max-w-md">
              <input
                type="text"
                placeholder="Add custom department..."
                value={newDeptInput}
                onChange={(e) => setNewDeptInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addDepartment();
                  }
                }}
                className="flex-1 bg-slate-900/80 border border-slate-700 rounded-lg px-3 py-2 text-white text-xs placeholder-slate-500 focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400/50"
              />
              <button
                type="button"
                onClick={addDepartment}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-slate-700 rounded-lg text-xs font-semibold cursor-pointer"
              >
                + Add
              </button>
            </div>
          </div>

          {/* Submit Button */}
          <div className="pt-6 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4">
            <Link href="/login" className="text-xs text-slate-400 hover:text-cyan-300 transition-colors">
              ← Already registered? Go to Login
            </Link>

            <button
              type="submit"
              disabled={isSubmitting}
              className="btn-primary-cyan w-full sm:w-auto px-8 py-3 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(6,182,212,0.35)] disabled:opacity-50 cursor-pointer"
            >
              {isSubmitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  <span>Provisioning Enterprise Tenant...</span>
                </>
              ) : (
                <>
                  <span>Initialize Company Brain</span>
                  <span>→</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
