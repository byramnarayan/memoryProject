'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api';

export default function RegisterPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setIsSubmitting(true);

    try {
      await apiFetch('/api/users', {
        method: 'POST',
        body: JSON.stringify({ username, email, password }),
      });

      setSuccessMsg('Account created successfully! Redirecting to login...');
      setTimeout(() => {
        router.push('/login');
      }, 1500);
      
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
    <div className="min-h-screen py-12 px-4">
      <div className="max-w-md mx-auto glass-card border border-cyan-500/20 p-8 shadow-2xl rounded-2xl">
        <div className="mb-6 p-4 bg-cyan-950/60 border border-cyan-500/40 rounded-xl text-cyan-200 text-xs">
          <p className="font-bold uppercase tracking-wider mb-1 font-mono">🏢 Enterprise Provisioning Notice</p>
          <p className="mb-3 text-[12px] text-slate-300 leading-relaxed">
            Employee accounts are typically provisioned directly by your HR or Department Administrator. Setting up a new organization?
          </p>
          <Link 
            href="/setup-company" 
            className="btn-primary-cyan inline-block px-3.5 py-1.5 text-xs font-bold uppercase tracking-wider rounded-lg transition-all"
          >
            Setup New Organization →
          </Link>
        </div>

        <h2 className="text-2xl font-bold mb-6 text-white border-b border-slate-800 pb-4">
          Register User Account
        </h2>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="p-3 bg-rose-950/60 border border-rose-500/50 text-rose-200 text-xs rounded-xl font-medium">
              {error}
            </div>
          )}

          {successMsg && (
            <div className="p-3 bg-emerald-950/60 border border-emerald-500/50 text-emerald-200 text-xs rounded-xl font-medium">
              {successMsg}
            </div>
          )}
          
          <div>
            <label htmlFor="username" className="block text-xs font-semibold uppercase tracking-wider mb-1.5 text-slate-300">
              Username
            </label>
            <input 
              type="text"
              id="username"
              required
              minLength={1}
              maxLength={50}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full bg-slate-900/80 border border-slate-700 rounded-lg px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400/50"
            />
          </div>

          <div>
            <label htmlFor="email" className="block text-xs font-semibold uppercase tracking-wider mb-1.5 text-slate-300">
              Email
            </label>
            <input 
              type="email"
              id="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-slate-900/80 border border-slate-700 rounded-lg px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400/50"
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
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-slate-900/80 border border-slate-700 rounded-lg px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400/50"
            />
            <p className="text-[11px] text-slate-500 mt-1">Must be at least 8 characters.</p>
          </div>

          <div>
            <label htmlFor="confirmPassword" className="block text-xs font-semibold uppercase tracking-wider mb-1.5 text-slate-300">
              Confirm Password
            </label>
            <input 
              type="password"
              id="confirmPassword"
              required
              minLength={8}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full bg-slate-900/80 border border-slate-700 rounded-lg px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400/50"
            />
            {password && confirmPassword && password !== confirmPassword && (
               <div className="text-xs text-rose-400 font-bold mt-1">Passwords do not match.</div>
            )}
          </div>
          
          <div className="pt-2">
            <button 
              type="submit" 
              disabled={isSubmitting || (password !== confirmPassword && confirmPassword.length > 0)}
              className="btn-primary-cyan w-full py-2.5 px-4 font-bold rounded-lg text-xs uppercase tracking-wider transition-all disabled:opacity-50 cursor-pointer shadow-[0_0_20px_rgba(6,182,212,0.35)]"
            >
              {isSubmitting ? 'Registering...' : 'Register'}
            </button>
          </div>
        </form>
        
        <p className="mt-6 text-xs text-center text-slate-400">
          Already have an account? <Link href="/login" className="font-bold text-cyan-400 hover:underline">Login here</Link>
        </p>
      </div>
    </div>
  );
}
