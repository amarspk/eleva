'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { loginStaff, saveSession } from '../lib/auth';

/**
 * Standalone staff login screen (Sprint 2 Task 1 — Auth-UI gap, PROJECT_STATE
 * §15 item 6). Wires to `POST /api/v1/auth/login`: MFA-enabled accounts are
 * challenged with a second step (401 "MFA token required") before the session
 * is stored and the user is routed back to the terminal.
 */
export function LoginForm(): React.ReactNode {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [tenantId, setTenantId] = useState('');
  const [mfaToken, setMfaToken] = useState('');
  const [phase, setPhase] = useState<'credentials' | 'mfa'>('credentials');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  /* Pre-populate tenantId from localStorage (previous session) */
  React.useEffect(() => {
    const stored = window.localStorage.getItem('tenantId');
    if (stored) {
      setTenantId(stored);
    }
  }, []);

  const returnTo = (): string => {
    if (typeof window === 'undefined') {
      return '/';
    }
    const params = new URLSearchParams(window.location.search);
    const branchId = params.get('branchId');
    return branchId ? `/?branchId=${encodeURIComponent(branchId)}` : '/';
  };

  const handleSubmit = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    if (!email || !password || !tenantId) {
      setError('Email, password, and Tenant ID are required.');
      return;
    }
    setSubmitting(true);
    setError(null);

    /* Store tenantId in localStorage so loginStaff() can send it as
       X-Tenant-Id header. Without this, the first login on a fresh
       browser has no tenant context and gets 403. */
    if (tenantId) {
      window.localStorage.setItem('tenantId', tenantId);
    }

    try {
      const result = await loginStaff(email, password, phase === 'mfa' ? mfaToken : undefined);
      if (result.ok) {
        saveSession(result.session);
        router.push(returnTo());
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
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-white rounded-lg shadow p-8">
        <h1 className="text-2xl font-bold text-slate-900">Zayjar</h1>
        <p className="text-sm text-gray-500 mt-1 mb-6">Sign in to your staff workspace</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          {phase === 'credentials' ? (
            <>
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  autoComplete="username"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-600 focus:outline-none"
                />
              </div>
              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-600 focus:outline-none"
                />
              </div>
              <div>
                <label htmlFor="tenantId" className="block text-sm font-medium text-gray-700">
                  Tenant ID
                </label>
                <input
                  id="tenantId"
                  type="text"
                  required
                  placeholder="e.g. 80a00898-782c-4a6e-8bad-880e8f4f7977"
                  value={tenantId}
                  onChange={(e) => setTenantId(e.target.value)}
                  className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-600 focus:outline-none font-mono text-xs"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Albaik: 80a00898-782c-4a6e-8bad-880e8f4f7977 &middot; Tokyo Ramen: 930c9c66-06df-4029-8ee8-ac4d0046c6af
                </p>
              </div>
            </>
          ) : (
            <div>
              <label htmlFor="mfaToken" className="block text-sm font-medium text-gray-700">
                Authenticator code
              </label>
              <input
                id="mfaToken"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                required
                placeholder="6-digit code"
                value={mfaToken}
                onChange={(e) => setMfaToken(e.target.value)}
                className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-600 focus:outline-none"
              />
              <p className="text-xs text-gray-500 mt-2">
                This account has two-factor authentication enabled. Enter the code from your
                authenticator app.
              </p>
              <button
                type="button"
                onClick={() => {
                  setPhase('credentials');
                  setError(null);
                }}
                className="text-xs text-blue-600 mt-2 hover:underline"
              >
                Back
              </button>
            </div>
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-blue-600 text-white py-2 rounded text-sm font-medium hover:bg-blue-700 disabled:bg-gray-300"
          >
            {submitting ? 'Signing in…' : phase === 'mfa' ? 'Verify code' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default LoginForm;
