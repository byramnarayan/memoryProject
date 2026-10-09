'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';

export default function LoginPage() {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      await login(username, password);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Network error. Please check your connection.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-[82vh] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        {/* Brand Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-950/60 border border-cyan-500/30 text-cyan-300 text-xs font-mono font-semibold mb-3">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse"></span>
            Company Brain Gateway
          </div>
          <h1 className="text-3xl font-extrabold text-white tracking-tight">
            Sign In to MnemoGraph
          </h1>
          <p className="text-slate-400 mt-2 text-xs leading-relaxed max-w-sm mx-auto">
            Access your organization&apos;s collective memory, lakehouse telemetry, and operational intelligence.
          </p>
        </div>

        {/* Credentials Glass Card */}
        <div className="glass-card p-8 border border-cyan-500/20 shadow-2xl rounded-2xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-cyan-500/5 blur-3xl pointer-events-none -z-10" />

          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="p-3 bg-rose-950/60 border border-rose-500/50 text-rose-200 text-xs rounded-xl font-medium shadow-md flex items-center gap-2">
                <span>⚠️</span>
                <span>{error}</span>
              </div>
            )}

            <div>
              <label
                htmlFor="username"
                className="block text-xs font-semibold uppercase tracking-wider mb-1.5 text-slate-300"
              >
                Work Email or Username
              </label>
              <input
                type="text"
                id="username"
                required
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="name@company.com"
                className="w-full bg-[#080d1a] border border-cyan-500/20 rounded-lg px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400/50"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label
                  htmlFor="password"
                  className="block text-xs font-semibold uppercase tracking-wider text-slate-300"
                >
                  Password
                </label>
                <Link
                  href="/forgot-password"
                  className="text-[11px] text-cyan-400 hover:text-cyan-300 transition-colors"
                >
                  Forgot password?
                </Link>
              </div>
              <input
                type="password"
                id="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                className="w-full bg-[#080d1a] border border-cyan-500/20 rounded-lg px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400/50"
              />
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={isSubmitting}
                className="btn-primary-cyan w-full py-2.5 px-4 font-bold rounded-lg text-xs tracking-wide transition-all disabled:opacity-50 cursor-pointer shadow-[0_0_20px_rgba(6,182,212,0.35)]"
              >
                {isSubmitting ? 'Authenticating...' : 'Sign In'}
              </button>
            </div>
          </form>

          {/* New Company Setup Callout */}
          <div className="mt-6 pt-5 border-t border-cyan-500/15 text-center text-xs text-slate-400">
            <p>
              Setting up a new organization?{' '}
              <Link
                href="/setup-company"
                className="text-cyan-400 hover:text-cyan-300 font-semibold transition-colors"
              >
                Provision Company Brain →
              </Link>
            </p>
            <p className="text-[11px] text-slate-500 mt-2">
              Employee credentials are HR-provisioned. Contact your administrator if you need access.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
