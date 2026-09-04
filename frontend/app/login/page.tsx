'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';

export default function LoginPage() {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);

    try {
      // FastAPI OAuth2 requires form-urlencoded data
      const formData = new URLSearchParams();
      formData.append('username', username);
      formData.append('password', password);

      const response = await fetch('/api/users/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: formData.toString(),
      });

      if (response.ok) {
        const data = await response.json();
        await login(data.access_token);
        // The useAuth hook handles the redirect to '/'
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
          // Fallback if parsing fails
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

  return (
    <div className="max-w-md mx-auto bg-white border border-brand p-8 mt-8">
      <h2 className="text-3xl font-bold font-heading mb-6 text-ink border-b border-brand pb-4">Login</h2>
      <form onSubmit={handleSubmit} className="space-y-4 m-0">
        
        {error && (
          <div className="p-3 bg-red-100 border border-red-400 text-red-700 text-sm font-medium">
            {error}
          </div>
        )}
        
        <div>
          <label htmlFor="username" className="block text-sm font-bold uppercase tracking-wider mb-2 text-ink">Username</label>
          <input 
            type="text"
            id="username"
            required
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="w-full border border-brand px-4 py-2 focus:outline-none focus:border-ink bg-white"
          />
        </div>
        
        <div>
          <label htmlFor="password" className="block text-sm font-bold uppercase tracking-wider mb-2 text-ink">Password</label>
          <input 
            type="password"
            id="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full border border-brand px-4 py-2 focus:outline-none focus:border-ink bg-white"
          />
        </div>
        
        <div className="pt-4">
          <button 
            type="submit" 
            disabled={isSubmitting}
            className="w-full px-5 py-3 text-sm font-bold uppercase tracking-wider border border-navy text-white bg-navy hover:bg-ink transition-colors disabled:opacity-50 cursor-pointer"
          >
            {isSubmitting ? 'Logging in...' : 'Login'}
          </button>
        </div>
      </form>
      
      <div className="mt-6 text-sm text-center text-muted-grey space-y-2">
        <p>
          <Link href="/forgot-password" className="font-bold text-navy hover:text-gold transition-colors">Forgot your password?</Link>
        </p>
        <p>
          Don&apos;t have an account? <Link href="/register" className="font-bold text-navy hover:text-gold transition-colors">Register here</Link>
        </p>
      </div>
    </div>
  );
}
