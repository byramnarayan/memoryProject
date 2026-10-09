'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import CreatePostModal from '../CreatePostModal';

export default function Header() {
  const { user, isLoading, logout } = useAuth();
  const pathname = usePathname();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isPostModalOpen, setIsPostModalOpen] = useState(false);
  const [isEnterpriseMenuOpen, setIsEnterpriseMenuOpen] = useState(false);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const [isDark, setIsDark] = useState(true);
  const profileMenuRef = useRef<HTMLDivElement>(null);

  const isActive = (path: string) => pathname === path;

  // Initialize theme from document or localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('theme');
      if (stored === 'light') {
        document.documentElement.classList.remove('dark');
        document.documentElement.classList.add('light');
        setIsDark(false);
      } else {
        document.documentElement.classList.add('dark');
        document.documentElement.classList.remove('light');
        setIsDark(true);
      }
    }
  }, []);

  const toggleTheme = () => {
    if (typeof window === 'undefined') return;
    if (isDark) {
      document.documentElement.classList.remove('dark');
      document.documentElement.classList.add('light');
      localStorage.setItem('theme', 'light');
      setIsDark(false);
    } else {
      document.documentElement.classList.add('dark');
      document.documentElement.classList.remove('light');
      localStorage.setItem('theme', 'dark');
      setIsDark(true);
    }
  };

  // Close profile dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (profileMenuRef.current && !profileMenuRef.current.contains(e.target as Node)) {
        setIsProfileMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const userInitial = user?.first_name?.[0] || user?.username?.[0] || 'U';

  return (
    <>
      <header className="fixed top-0 w-full z-50 dark:bg-[#070b14]/85 bg-white/90 backdrop-blur-xl border-b dark:border-cyan-500/15 border-cyan-500/25 shadow-[0_4px_30px_rgba(0,0,0,0.5)] dark:shadow-[0_4px_30px_rgba(0,0,0,0.5)] shadow-sm transition-colors">
        <div className="max-w-[1400px] mx-auto px-4 lg:px-8">
          <div className="flex justify-between items-center h-16">
            
            {/* Brand & Left Navigation */}
            <div className="flex items-center space-x-6 lg:space-x-8">
              <Link href="/" className="flex items-center gap-2.5 group">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-400 to-sky-600 p-[1px] shadow-[0_0_15px_rgba(6,182,212,0.4)] group-hover:shadow-[0_0_20px_rgba(6,182,212,0.6)] transition-all">
                  <div className="w-full h-full bg-[#070b14] rounded-[7px] flex items-center justify-center">
                    <svg className="w-4 h-4 text-cyan-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <polygon points="12 2 2 8.5 2 15.5 12 22 22 15.5 22 8.5 12 2" />
                      <line x1="12" y1="22" x2="12" y2="15.5" />
                      <polyline points="22 8.5 12 15.5 2 8.5" />
                    </svg>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-extrabold text-white text-lg tracking-tight group-hover:text-cyan-300 transition-colors">
                    MnemoGraph
                  </span>
                  <span className="text-[9px] font-mono font-bold tracking-widest px-2 py-0.5 rounded-full border border-cyan-500/40 bg-cyan-950/40 text-cyan-300">
                    CORE
                  </span>
                </div>
              </Link>

              {/* Main Desktop Navigation */}
              <nav className="hidden lg:flex items-center space-x-1">
                <Link
                  href="/gacm"
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold tracking-wide transition-all ${
                    isActive('/gacm')
                      ? 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 shadow-[0_0_12px_rgba(6,182,212,0.2)]'
                      : 'text-slate-300 hover:text-white hover:bg-slate-800/50'
                  }`}
                >
                  Graph Explorer
                </Link>

                <Link
                  href="/capture"
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold tracking-wide transition-all ${
                    isActive('/capture')
                      ? 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 shadow-[0_0_12px_rgba(6,182,212,0.2)]'
                      : 'text-slate-300 hover:text-white hover:bg-slate-800/50'
                  }`}
                >
                  Capture
                </Link>

                {/* Enterprise Hub Dropdown */}
                <div className="relative" onMouseLeave={() => setIsEnterpriseMenuOpen(false)}>
                  <button
                    onClick={() => setIsEnterpriseMenuOpen(!isEnterpriseMenuOpen)}
                    onMouseEnter={() => setIsEnterpriseMenuOpen(true)}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold tracking-wide text-slate-300 hover:text-white hover:bg-slate-800/50 flex items-center gap-1.5 transition-all cursor-pointer"
                  >
                    <span>Enterprise Hub</span>
                    <svg className={`w-3.5 h-3.5 transition-transform ${isEnterpriseMenuOpen ? 'rotate-180 text-cyan-400' : 'text-slate-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>

                  {isEnterpriseMenuOpen && (
                    <div className="absolute left-0 mt-1 w-64 glass-panel border border-cyan-500/20 shadow-[0_12px_40px_rgba(0,0,0,0.6)] p-2 rounded-xl flex flex-col space-y-1 z-50">
                      <Link
                        href="/connectors"
                        onClick={() => setIsEnterpriseMenuOpen(false)}
                        className="p-2 rounded-lg hover:bg-slate-800/70 transition-colors flex items-center justify-between text-xs"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-orange-400">🔌</span>
                          <span className="font-semibold text-slate-200">Data Connectors</span>
                        </div>
                        <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-orange-500/20 text-orange-300 border border-orange-500/40">LAKEHOUSE</span>
                      </Link>

                      <Link
                        href="/logs"
                        onClick={() => setIsEnterpriseMenuOpen(false)}
                        className="p-2 rounded-lg hover:bg-slate-800/70 transition-colors flex items-center justify-between text-xs"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-emerald-400">🧠</span>
                          <span className="font-semibold text-slate-200">Daily Intuition Logs</span>
                        </div>
                        <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">TACIT</span>
                      </Link>

                      <Link
                        href="/kt-handoff"
                        onClick={() => setIsEnterpriseMenuOpen(false)}
                        className="p-2 rounded-lg hover:bg-slate-800/70 transition-colors flex items-center justify-between text-xs"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-indigo-400">👥</span>
                          <span className="font-semibold text-slate-200">KT Succession Shadow</span>
                        </div>
                        <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/40">AI CO-PILOT</span>
                      </Link>

                      <Link
                        href="/simulator"
                        onClick={() => setIsEnterpriseMenuOpen(false)}
                        className="p-2 rounded-lg hover:bg-slate-800/70 transition-colors flex items-center justify-between text-xs"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-pink-400">🔮</span>
                          <span className="font-semibold text-slate-200">What-If Simulator</span>
                        </div>
                        <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-pink-500/20 text-pink-300 border border-pink-500/40">PREDICT</span>
                      </Link>

                      <div className="border-t border-slate-700/50 my-1 pt-1" />

                      <Link
                        href="/employees"
                        onClick={() => setIsEnterpriseMenuOpen(false)}
                        className="p-2 rounded-lg hover:bg-slate-800/70 transition-colors flex items-center justify-between text-xs"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-cyan-400">👤</span>
                          <span className="font-semibold text-slate-200">Staff & Roles</span>
                        </div>
                        <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-300">RBAC</span>
                      </Link>

                      <Link
                        href="/setup-company"
                        onClick={() => setIsEnterpriseMenuOpen(false)}
                        className="p-2 rounded-lg hover:bg-slate-800/70 transition-colors flex items-center justify-between text-xs"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-purple-400">🏢</span>
                          <span className="font-semibold text-slate-200">Tenant Provisioning</span>
                        </div>
                        <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300">ADMIN</span>
                      </Link>
                    </div>
                  )}
                </div>

                <Link
                  href="/insights"
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold tracking-wide transition-all ${
                    isActive('/insights')
                      ? 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 shadow-[0_0_12px_rgba(6,182,212,0.2)]'
                      : 'text-slate-300 hover:text-white hover:bg-slate-800/50'
                  }`}
                >
                  Analytics
                </Link>
              </nav>
            </div>

            {/* Desktop Right Utilities & Actions */}
            <div className="hidden lg:flex items-center space-x-3.5">
              {/* Search Bar */}
              <div className="relative">
                <div className="flex items-center bg-slate-900/80 border border-slate-700/80 hover:border-cyan-500/50 focus-within:border-cyan-400 rounded-full px-3 py-1.5 text-xs transition-all w-52">
                  <svg className="w-3.5 h-3.5 text-slate-400 mr-2 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  <input
                    type="text"
                    placeholder="Search knowledge..."
                    className="bg-transparent text-slate-200 placeholder:text-slate-500 focus:outline-none text-xs w-full"
                  />
                  <kbd className="hidden sm:inline-block text-[10px] text-slate-400 bg-slate-800 border border-slate-700 rounded px-1.5 py-0.5 font-mono shrink-0">
                    ⌘K
                  </kbd>
                </div>
              </div>

              {/* Working Light / Dark Theme Toggle Button */}
              <button
                type="button"
                onClick={toggleTheme}
                title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
                className="w-8 h-8 rounded-lg bg-slate-900/60 border border-slate-800 flex items-center justify-center text-slate-400 hover:text-cyan-400 hover:border-cyan-500/40 transition-colors cursor-pointer"
              >
                {isDark ? (
                  // Sun icon (currently dark -> click for light)
                  <svg className="w-4 h-4 text-amber-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <circle cx="12" cy="12" r="5" strokeWidth="2" />
                    <line x1="12" y1="1" x2="12" y2="3" strokeWidth="2" strokeLinecap="round" />
                    <line x1="12" y1="21" x2="12" y2="23" strokeWidth="2" strokeLinecap="round" />
                    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" strokeWidth="2" strokeLinecap="round" />
                    <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" strokeWidth="2" strokeLinecap="round" />
                    <line x1="1" y1="12" x2="3" y2="12" strokeWidth="2" strokeLinecap="round" />
                    <line x1="21" y1="12" x2="23" y2="12" strokeWidth="2" strokeLinecap="round" />
                    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" strokeWidth="2" strokeLinecap="round" />
                    <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                ) : (
                  // Moon icon (currently light -> click for dark)
                  <svg className="w-4 h-4 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                  </svg>
                )}
              </button>

              {/* User Authentication Status */}
              {!isLoading && user ? (
                <div className="relative" ref={profileMenuRef}>
                  {/* User Profile Avatar Button */}
                  <button
                    type="button"
                    onClick={() => setIsProfileMenuOpen(!isProfileMenuOpen)}
                    className="flex items-center gap-2 p-1 pl-2 pr-2.5 rounded-full bg-[#0c1427] border border-cyan-500/30 hover:border-cyan-400/60 shadow-[0_0_15px_rgba(6,182,212,0.15)] transition-all cursor-pointer group"
                  >
                    <div className="w-7 h-7 rounded-full bg-gradient-to-br from-cyan-400 to-sky-600 flex items-center justify-center text-slate-950 font-bold text-xs uppercase shadow-sm">
                      {userInitial}
                    </div>
                    <div className="text-left hidden xl:block">
                      <div className="text-xs font-semibold text-white group-hover:text-cyan-300 transition-colors leading-tight truncate max-w-[100px]">
                        {user.first_name || user.username}
                      </div>
                      <div className="text-[10px] text-cyan-400 font-mono leading-none">
                        {user.role}
                      </div>
                    </div>
                    <svg className={`w-3.5 h-3.5 text-slate-400 transition-transform ${isProfileMenuOpen ? 'rotate-180 text-cyan-400' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>

                  {/* Profile Dropdown Container */}
                  {isProfileMenuOpen && (
                    <div className="absolute right-0 mt-2 w-72 glass-panel border border-cyan-500/30 shadow-[0_12px_40px_rgba(0,0,0,0.8)] rounded-2xl p-4 z-50 text-slate-200 animate-in fade-in slide-in-from-top-2 duration-150">
                      {/* User Header Info */}
                      <div className="flex items-center gap-3 pb-3 border-b border-cyan-500/15">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-400 to-sky-600 flex items-center justify-center text-slate-950 font-bold text-sm uppercase shadow-[0_0_12px_rgba(6,182,212,0.4)]">
                          {userInitial}
                        </div>
                        <div className="overflow-hidden">
                          <h4 className="text-sm font-bold text-white truncate">
                            {user.first_name && user.last_name ? `${user.first_name} ${user.last_name}` : user.username}
                          </h4>
                          <p className="text-[11px] text-slate-400 font-mono truncate">{user.email}</p>
                        </div>
                      </div>

                      {/* Role & Tenant Details */}
                      <div className="py-2.5 border-b border-cyan-500/15 space-y-1.5 text-xs">
                        <div className="flex justify-between items-center">
                          <span className="text-slate-400">Organization:</span>
                          <span className="font-mono font-semibold text-cyan-300 text-[11px] uppercase">
                            {user.tenant_id || 'Enterprise'}
                          </span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-slate-400">Role:</span>
                          <span className="badge-cyan font-mono text-[10px]">
                            {user.role}
                          </span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-slate-400">Clearance:</span>
                          <span className="text-[10px] font-mono font-semibold text-sky-300">
                            {user.clearance_level || 'Internal'}
                          </span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-slate-400">Department:</span>
                          <span className="text-[11px] text-white truncate max-w-[130px]">
                            {user.department}
                          </span>
                        </div>
                      </div>

                      {/* Quick Links */}
                      <div className="pt-2 space-y-1">
                        <Link
                          href="/employees"
                          onClick={() => setIsProfileMenuOpen(false)}
                          className="w-full px-2.5 py-1.5 rounded-lg text-xs hover:bg-slate-800/80 transition-colors flex items-center gap-2 text-slate-300 hover:text-white"
                        >
                          <span>👥</span>
                          <span>Staff Directory & RBAC</span>
                        </Link>
                        <Link
                          href="/connectors"
                          onClick={() => setIsProfileMenuOpen(false)}
                          className="w-full px-2.5 py-1.5 rounded-lg text-xs hover:bg-slate-800/80 transition-colors flex items-center gap-2 text-slate-300 hover:text-white"
                        >
                          <span>🔌</span>
                          <span>Lakehouse Connectors</span>
                        </Link>
                        <Link
                          href="/account"
                          onClick={() => setIsProfileMenuOpen(false)}
                          className="w-full px-2.5 py-1.5 rounded-lg text-xs hover:bg-slate-800/80 transition-colors flex items-center gap-2 text-slate-300 hover:text-white"
                        >
                          <span>⚙️</span>
                          <span>Account Settings</span>
                        </Link>

                        <div className="pt-1.5 border-t border-cyan-500/10">
                          <button
                            type="button"
                            onClick={() => {
                              setIsProfileMenuOpen(false);
                              logout();
                            }}
                            className="w-full px-2.5 py-1.5 rounded-lg text-xs hover:bg-rose-950/40 text-rose-300 hover:text-rose-200 transition-colors flex items-center gap-2 cursor-pointer"
                          >
                            <span>🚪</span>
                            <span>Sign Out</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ) : !isLoading && !user ? (
                <div className="flex items-center space-x-3">
                  <Link
                    href="/login"
                    className="text-slate-300 hover:text-cyan-400 text-xs font-semibold transition-colors px-2"
                  >
                    Sign In
                  </Link>
                  <Link
                    href="/setup-company"
                    className="btn-primary-cyan px-4 py-1.5 text-xs font-bold rounded-lg text-white tracking-wide"
                  >
                    Setup Company
                  </Link>
                </div>
              ) : null}
            </div>

            {/* Mobile Menu Button */}
            <button 
              className="lg:hidden text-slate-300 focus:outline-none hover:text-cyan-400 transition-colors p-2 cursor-pointer"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              aria-label="Toggle navigation"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16m-7 6h7" />
              </svg>
            </button>
          </div>

          {/* Mobile Nav Menu */}
          {isMobileMenuOpen && (
            <div className="lg:hidden pb-6 pt-2 border-t border-slate-800/80 animate-in fade-in slide-in-from-top-2 duration-200">
              <div className="flex flex-col space-y-2 mt-2">
                <Link
                  href="/gacm"
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="text-cyan-400 font-semibold text-sm px-3 py-2 rounded-lg hover:bg-slate-800"
                >
                  GRAPH EXPLORER
                </Link>
                <Link
                  href="/capture"
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="text-slate-200 font-medium text-sm px-3 py-2 rounded-lg hover:bg-slate-800"
                >
                  CAPTURE
                </Link>
                <Link
                  href="/connectors"
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="text-slate-200 font-medium text-sm px-3 py-2 rounded-lg hover:bg-slate-800 flex justify-between items-center"
                >
                  <span>DATA CONNECTORS</span>
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-orange-500/20 text-orange-300 font-mono">LAKEHOUSE</span>
                </Link>
                <Link
                  href="/logs"
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="text-slate-200 font-medium text-sm px-3 py-2 rounded-lg hover:bg-slate-800 flex justify-between items-center"
                >
                  <span>DAILY INTUITION LOGS</span>
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-mono">TACIT</span>
                </Link>
                <Link
                  href="/kt-handoff"
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="text-slate-200 font-medium text-sm px-3 py-2 rounded-lg hover:bg-slate-800 flex justify-between items-center"
                >
                  <span>KT & SUCCESSION</span>
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 font-mono">AI SHADOW</span>
                </Link>
                <Link
                  href="/simulator"
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="text-slate-200 font-medium text-sm px-3 py-2 rounded-lg hover:bg-slate-800 flex justify-between items-center"
                >
                  <span>WHAT-IF SIMULATOR</span>
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-pink-500/20 text-pink-300 font-mono">PREDICT</span>
                </Link>
                <Link
                  href="/employees"
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="text-slate-200 font-medium text-sm px-3 py-2 rounded-lg hover:bg-slate-800"
                >
                  STAFF & ROLES
                </Link>
                <Link
                  href="/insights"
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="text-slate-200 font-medium text-sm px-3 py-2 rounded-lg hover:bg-slate-800"
                >
                  ANALYTICS
                </Link>
                
                <hr className="border-slate-800 my-2" />
                
                {user ? (
                  <div className="flex flex-col space-y-2 px-3 pt-2">
                    <div className="text-xs text-slate-400">
                      Signed in as <strong className="text-white">{user.username}</strong> ({user.role})
                    </div>
                    <button
                      onClick={() => {
                        setIsMobileMenuOpen(false);
                        logout();
                      }}
                      className="text-left text-rose-400 text-sm font-semibold cursor-pointer"
                    >
                      Sign Out
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col space-y-2 px-3 pt-2">
                    <Link
                      href="/login"
                      onClick={() => setIsMobileMenuOpen(false)}
                      className="text-slate-200 font-medium text-sm"
                    >
                      Sign In
                    </Link>
                    <Link
                      href="/setup-company"
                      onClick={() => setIsMobileMenuOpen(false)}
                      className="btn-primary-cyan text-center py-2 text-sm font-bold text-white rounded-lg"
                    >
                      Setup Company
                    </Link>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </header>

      {/* Post Modal */}
      {isPostModalOpen && (
        <CreatePostModal onClose={() => setIsPostModalOpen(false)} />
      )}
    </>
  );
}
