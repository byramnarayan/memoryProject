'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import CreatePostModal from '../CreatePostModal';

export default function Header() {
  const { user, isLoading, logout } = useAuth();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isPostModalOpen, setIsPostModalOpen] = useState(false);

  return (
    <>
      <header className="site-header">
        <nav className="bg-navy fixed top-0 w-full z-50">
          <div className="max-w-[1200px] mx-auto px-4 md:px-8">
            <div className="flex justify-between items-center py-4">
              
              {/* Brand & Left Nav */}
              <div className="flex items-center">
                <Link href="/" className="mr-8 flex items-center font-bold text-gold text-xl gap-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/icon.svg" alt="Wakamono Logo" className="h-6 w-6" />
                  Wakamono
                </Link>
                <div className="hidden md:flex items-center space-x-6">
                  <Link href="/gacm" className="text-gold font-bold text-sm tracking-wide transition-colors hover:text-yellow-400">GRAPH EXPLORER</Link>
                  <Link href="/library" className="text-white hover:text-gold font-medium text-sm tracking-wide transition-colors">LIBRARY</Link>
                  <Link href="/community" className="text-white hover:text-gold font-medium text-sm tracking-wide transition-colors">COMMUNITY</Link>
                </div>
              </div>

              {/* Mobile Menu Button */}
              <button 
                className="md:hidden text-white focus:outline-none hover:text-gold transition-colors"
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                aria-label="Toggle navigation"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16m-7 6h7"></path>
                </svg>
              </button>

              {/* Desktop Right Nav */}
              <div className="hidden md:flex items-center space-x-4">
                {!isLoading && user ? (
                  <div className="flex items-center space-x-4">
                    <button 
                      onClick={() => setIsPostModalOpen(true)}
                      className="px-4 py-2 border border-white/30 text-white hover:border-white hover:text-white rounded-none font-bold text-sm tracking-wide transition-colors cursor-pointer"
                    >
                      NEW POST
                    </button>
                    <Link href="/account" className="bg-white text-navy hover:bg-cream px-5 py-2 rounded-none font-bold text-sm tracking-wide transition-colors">
                      {user.username}
                    </Link>
                    <button onClick={logout} className="text-white/70 hover:text-white text-xs uppercase tracking-wider cursor-pointer">Logout</button>
                  </div>
                ) : !isLoading && !user ? (
                  <div className="flex items-center space-x-4">
                    <Link href="/login" className="text-white hover:text-gold text-sm font-medium transition-colors tracking-wide">
                      LOGIN
                    </Link>
                    <Link href="/register" className="bg-gold text-navy hover:bg-yellow-400 px-5 py-2 rounded-none font-bold text-sm tracking-wide transition-colors">
                      REGISTER
                    </Link>
                  </div>
                ) : null}
              </div>
            </div>

            {/* Mobile Nav Menu */}
            {isMobileMenuOpen && (
              <div className="md:hidden pb-6">
                <div className="flex flex-col space-y-4 mt-4">
                  <Link href="/" className="text-white font-medium text-sm tracking-wide block hover:text-gold">NEWS</Link>
                  <Link href="/library" className="text-white font-medium text-sm tracking-wide block hover:text-gold">LIBRARY</Link>
                  <Link href="/community" className="text-white font-medium text-sm tracking-wide block hover:text-gold">COMMUNITY</Link>
                  <hr className="border-white/10 my-2" />
                  
                  {user ? (
                    <div className="flex flex-col space-y-4">
                      <button 
                        onClick={() => setIsPostModalOpen(true)}
                        className="text-left px-4 py-2 border border-white/30 text-white hover:border-white rounded-none font-bold text-sm cursor-pointer"
                      >
                        NEW POST
                      </button>
                      <Link href="/account" className="text-gold font-bold text-sm block hover:text-yellow-400">
                        {user.username} (Account)
                      </Link>
                      <button onClick={logout} className="text-left text-white/70 text-sm cursor-pointer">Logout</button>
                    </div>
                  ) : (
                    <div className="flex flex-col space-y-4">
                      <Link href="/login" className="text-white font-medium text-sm block hover:text-gold">LOGIN</Link>
                      <Link href="/register" className="text-gold font-bold text-sm block hover:text-yellow-400">REGISTER</Link>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </nav>
      </header>

      {/* Render the Create Post Modal here so it floats above everything */}
      {isPostModalOpen && (
        <CreatePostModal onClose={() => setIsPostModalOpen(false)} />
      )}
    </>
  );
}
