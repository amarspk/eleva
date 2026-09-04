'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { loginEleva, saveSession } from '../../lib/auth';

export function LoginForm(): React.ReactNode {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [tenantId, setTenantId] = useState('');
  const [mfaToken, setMfaToken] = useState('');
  const [phase, setPhase] = useState<'credentials' | 'mfa'>('credentials');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  React.useEffect(() => {
    const stored = window.localStorage.getItem('eleva_tenantId');
    if (stored) {
      setTenantId(stored);
    }
  }, []);

  const handleSubmit = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    if (!email || !password || !tenantId) {
      setError('Email, password, and Tenant ID are required.');
      return;
    }
    setSubmitting(true);
    setError(null);
    if (tenantId) {
      window.localStorage.setItem('eleva_tenantId', tenantId);
    }

    try {
      const result = await loginEleva(email, password, phase === 'mfa' ? mfaToken : undefined);
      if (result.ok) {
        saveSession(result.session);
        router.push('/eleva-office');
        return;
      }
      if ('mfaRequired' in result) {
        setPhase('mfa');
        return;
      }
      setError(result.error);
    } catch {
      setError('Unable to sign in. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-luxury-black p-4">
      <div className="absolute inset-0 bg-gradient-to-br from-gold-500/10 via-transparent to-transparent" aria-hidden="true" />
      <div className="relative w-full max-w-sm rounded-xl border border-luxury-border bg-luxury-panel/80 p-8 shadow-2xl shadow-black/40 backdrop-blur">
        <div className="flex items-center gap-3">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-gold-400 text-luxury-black font-bold">E</span>
          <div>
            <h1 className="text-lg font-bold text-gold-300">ELEVA</h1>
            <p className="text-xs text-luxury-muted">Executive Office</p>
          </div>
        </div>
        <p className="mt-4 text-sm text-luxury-muted">Sign in with an existing account.</p>
        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          {phase === 'credentials' ? (
            <>
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gold-200">Email</label>
                <input
                  id="email"
                  type="email"
                  autoComplete="username"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-luxury-border bg-luxury-elevated px-3 py-2 text-sm text-gold-100 placeholder:text-luxury-muted focus:border-gold-400 focus:outline-none"
                />
              </div>
              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gold-200">Password</label>
                <input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-luxury-border bg-luxury-elevated px-3 py-2 text-sm text-gold-100 placeholder:text-luxury-muted focus:border-gold-400 focus:outline-none"
                />
              </div>
              <div>
                <label htmlFor="tenantId" className="block text-sm font-medium text-gold-200">Tenant ID</label>
                <input
                  id="tenantId"
                  type="text"
                  required
                  value={tenantId}
                  onChange={(e) => setTenantId(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-luxury-border bg-luxury-elevated px-3 py-2 text-sm text-gold-100 placeholder:text-luxury-muted focus:border-gold-400 focus:outline-none font-mono text-xs"
                />
              </div>
            </>
          ) : (
            <div>
              <label htmlFor="mfaToken" className="block text-sm font-medium text-gold-200">Authenticator code</label>
              <input
                id="mfaToken"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                required
                value={mfaToken}
                onChange={(e) => setMfaToken(e.target.value)}
                className="mt-1 w-full rounded-lg border border-luxury-border bg-luxury-elevated px-3 py-2 text-sm text-gold-100 placeholder:text-luxury-muted focus:border-gold-400 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => {
                  setPhase('credentials');
                  setError(null);
                }}
                className="mt-2 text-xs text-gold-400 hover:underline"
              >
                Back
              </button>
            </div>
          )}

          {error && <p className="text-sm text-red-400">{error}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg bg-gold-400 py-2.5 text-sm font-semibold text-luxury-black hover:bg-gold-300 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? 'Signing in…' : phase === 'mfa' ? 'Verify code' : 'Sign in'}
          </button>
        </form>
        <p className="mt-5 text-center text-xs text-luxury-muted">
          Uses the existing backend auth surface. Device biometrics are left to OS authentication later.
        </p>
      </div>
    </div>
  );
}

export default LoginForm;
