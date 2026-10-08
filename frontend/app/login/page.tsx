'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';

interface DemoRole {
  role: string;
  title: string;
  department: string;
  clearance: string;
  email: string;
  pass: string;
  icon: string;
  badgeBg: string;
  badgeBorder: string;
  badgeText: string;
  description: string;
}

const DEMO_ROLES: DemoRole[] = [
  {
    role: 'TenantAdmin',
    title: 'University Vice Chancellor',
    department: 'University Administration',
    clearance: 'HighlyConfidential',
    email: 'admin@utc.edu',
    pass: 'Admin@123',
    icon: '🛡️',
    badgeBg: 'bg-purple-900/30',
    badgeBorder: 'border-purple-600/50',
    badgeText: 'text-purple-300',
    description: 'Universal cross-department clearance, knowledge base administration & full curation.'
  },
  {
    role: 'DeptAdmin',
    title: 'Department Chair (CS)',
    department: 'Computer Science & Engineering',
    clearance: 'Confidential',
    email: 'chair.cs@utc.edu',
    pass: 'DeptChair@123',
    icon: '🏛️',
    badgeBg: 'bg-amber-900/30',
    badgeBorder: 'border-amber-600/50',
    badgeText: 'text-amber-300',
    description: 'Scoped curation authority over Computer Science research and grants.'
  },
  {
    role: 'Researcher',
    title: 'Principal Investigator',
    department: 'Mechanical & Aerospace Eng',
    clearance: 'Internal',
    email: 'researcher@utc.edu',
    pass: 'Research@123',
    icon: '🔬',
    badgeBg: 'bg-blue-900/30',
    badgeBorder: 'border-blue-600/50',
    badgeText: 'text-blue-300',
    description: 'Authoring, document ingestion and search access to internal research intelligence.'
  },
  {
    role: 'Auditor',
    title: 'Compliance & Integrity Officer',
    department: 'Research Integrity & Compliance',
    clearance: 'HighlyConfidential',
    email: 'auditor@utc.edu',
    pass: 'Audit@123',
    icon: '⚖️',
    badgeBg: 'bg-emerald-900/30',
    badgeBorder: 'border-emerald-600/50',
    badgeText: 'text-emerald-300',
    description: 'Read-only access to immutable audit trails and institutional Legal Hold toggles.'
  }
];

export default function LoginPage() {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const performLogin = async (userVal: string, passVal: string) => {
    setError('');
    setIsSubmitting(true);

    try {
      const formData = new URLSearchParams();
      formData.append('username', userVal);
      formData.append('password', passVal);

      const response = await fetch('/api/users/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: formData.toString(),
      });

      if (response.ok) {
        const data = await response.json();
        await login(data.access_token);
      } else {
        let errorMessage = 'Invalid username or password.';
        try {
          const isJson = response.headers.get('content-type')?.includes('application/json');
          if (isJson) {
            const errData = await response.json();
            errorMessage = errData.detail || errorMessage;
          } else {
            const text = await response.text();
            errorMessage = text || `Server error (${response.status})`;
          }
        } catch {
          // Fallback
        }
        setError(errorMessage);
      }
    } catch (err: unknown) {
      if (err instanceof Error) {
        console.error(err);
      }
      setError('Network error. Please check your connection.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await performLogin(username, password);
  };

  const handleSelectDemoRole = (role: DemoRole) => {
    setUsername(role.email);
    setPassword(role.pass);
    performLogin(role.email, role.pass);
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-extrabold text-white tracking-tight">Institutional Single Sign-On</h1>
        <p className="text-slate-400 mt-2 text-sm max-w-xl mx-auto">
          Tier-1 Research Intelligence Memory Gateway. Sign in with institutional credentials or select a verified demo persona below to explore Role-Based Access Controls.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left: Standard Credentials Form */}
        <div className="lg:col-span-5 bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-2xl">
          <h2 className="text-lg font-bold text-white border-b border-slate-800 pb-3 mb-5 flex items-center gap-2">
            <span>🔑</span> Account Credentials
          </h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="p-3 bg-red-950/60 border border-red-500/50 text-red-200 text-xs rounded-lg font-medium">
                {error}
              </div>
            )}

            <div>
              <label htmlFor="username" className="block text-xs font-semibold uppercase tracking-wider mb-1.5 text-slate-300">
                Email or NetID
              </label>
              <input
                type="text"
                id="username"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="name@utc.edu"
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-xs font-semibold uppercase tracking-wider mb-1.5 text-slate-300">
                Password
              </label>
              <input
                type="password"
                id="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
              />
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-2.5 px-4 bg-amber-600 hover:bg-amber-500 text-slate-950 font-bold rounded-lg text-sm tracking-wide transition-all shadow-md hover:shadow-amber-500/20 disabled:opacity-50 cursor-pointer"
              >
                {isSubmitting ? 'Authenticating...' : 'Sign In'}
              </button>
            </div>
          </form>

          <div className="mt-6 pt-4 border-t border-slate-800/80 text-xs text-center text-slate-400 space-y-2">
            <p>
              <Link href="/forgot-password" className="text-amber-400 hover:underline">
                Forgot institutional password?
              </Link>
            </p>
            <p>
              New faculty member?{' '}
              <Link href="/register" className="text-amber-400 hover:underline font-semibold">
                Register NetID
              </Link>
            </p>
          </div>
        </div>

        {/* Right: 1-Click Institutional Demo Personas */}
        <div className="lg:col-span-7 bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-2xl">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <span>🏛️</span> Institutional Demo Roles (1-Click Login)
            </h2>
            <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/30">
              Session 07 ACLs
            </span>
          </div>
          <p className="text-xs text-slate-400 mb-4">
            Click any institutional role below to instantly authenticate with predefined clearance levels and departmental scopes:
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            {DEMO_ROLES.map((r) => (
              <button
                key={r.role}
                type="button"
                disabled={isSubmitting}
                onClick={() => handleSelectDemoRole(r)}
                className="text-left p-3.5 rounded-lg border border-slate-800 bg-slate-950/70 hover:bg-slate-800/80 hover:border-slate-700 transition-all group flex flex-col justify-between h-full cursor-pointer focus:outline-none focus:ring-1 focus:ring-amber-500/50"
              >
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-base">{r.icon}</span>
                    <span className={`text-[10px] font-mono uppercase font-bold px-2 py-0.5 rounded-full border ${r.badgeBg} ${r.badgeBorder} ${r.badgeText}`}>
                      {r.clearance}
                    </span>
                  </div>
                  <h3 className="text-sm font-bold text-white group-hover:text-amber-400 transition-colors">
                    {r.title}
                  </h3>
                  <p className="text-[11px] text-slate-400 mb-1">{r.department}</p>
                  <p className="text-[11px] text-slate-500 line-clamp-2 leading-relaxed">
                    {r.description}
                  </p>
                </div>

                <div className="mt-3 pt-2 border-t border-slate-800/60 flex items-center justify-between text-[11px] font-mono text-slate-400">
                  <span className="truncate max-w-[150px]">{r.email}</span>
                  <span className="text-amber-400 font-bold group-hover:translate-x-0.5 transition-transform">
                    Login →
                  </span>
                </div>
              </button>
            ))}
          </div>

          <div className="mt-5 p-3 rounded-lg bg-slate-950/40 border border-slate-800/60 text-[11px] text-slate-400 flex items-start gap-2">
            <span className="text-amber-400 text-sm">ℹ️</span>
            <span>
              <strong>Clearance Hierarchy:</strong> Public (Level 1) &lt; Internal (Level 2) &lt; Restricted (Level 3) &lt; Confidential (Level 4) &lt; HighlyConfidential (Level 5). Higher clearance tiers automatically inherit access to lower levels with zero data leakage.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
