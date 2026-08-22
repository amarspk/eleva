'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { loginStaff, saveSession } from '../lib/auth';

/**
 * ELEVA Tower — Elevator authentication.
 *
 * The visitor authenticates inside the elevator experience. The server alone
 * determines identity, role, restaurant, branch and permissions — the user is
 * NEVER asked to choose a role. On success the elevator animates and the
 * router moves the user into the correct office (dashboard).
 */
export function ElevaElevator(): React.ReactNode {
  const router = useRouter();
  const [phase, setPhase] = useState<'idle' | 'closing' | 'moving' | 'arriving'>('idle');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [tenantId, setTenantId] = useState('');
  const [mfaToken, setMfaToken] = useState('');
  const [authPhase, setAuthPhase] = useState<'credentials' | 'mfa'>('credentials');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showPanel, setShowPanel] = useState(false);
  const [floor, setFloor] = useState('G');
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const timerRef = useRef<number[]>([]);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(mq.matches);

    /* Show the credential panel after a short "doors open" beat */
    const t1 = window.setTimeout(() => setShowPanel(true), 600);

    const storedTenant = window.localStorage.getItem('tenantId');
    if (storedTenant) {setTenantId(storedTenant);}

    const storedEmail = window.localStorage.getItem('eleva_email');
    if (storedEmail) {setEmail(storedEmail);}

    return (): void => { window.clearTimeout(t1); };
  }, []);

  useEffect((): (() => void) => (): void => {
    timerRef.current.forEach(t => window.clearTimeout(t));
  }, []);

  const returnTo = (): string => {
    if (typeof window === 'undefined') {return '/';}
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
    window.localStorage.setItem('tenantId', tenantId);
    window.localStorage.setItem('eleva_email', email);

    try {
      const result = await loginStaff(email, password, authPhase === 'mfa' ? mfaToken : undefined);
      if (result.ok) {
        saveSession(result.session);
        /* Elevator transition: close doors → move → arrive → redirect */
        setPhase('closing');
        timerRef.current.push(window.setTimeout(() => {
          setPhase('moving');
          setFloor('1');
          timerRef.current.push(window.setTimeout(() => setFloor('2'), 350));
          timerRef.current.push(window.setTimeout(() => setFloor('3'), 700));
          timerRef.current.push(window.setTimeout(() => setFloor('4'), 1050));
          timerRef.current.push(window.setTimeout(() => setFloor('5'), 1400));
          timerRef.current.push(window.setTimeout(() => {
            setPhase('arriving');
            router.push(returnTo());
          }, 2000));
        }, 900));
        return;
      }
      if ('mfaRequired' in result) {
        setAuthPhase('mfa');
        setPhase('idle');
        return;
      }
      setError(result.error);
      setPhase('idle');
    } catch {
      setError('Unable to sign in. Please try again.');
      setPhase('idle');
    } finally {
      setSubmitting(false);
    }
  };

  const doorsClosed = phase === 'closing' || phase === 'moving' || phase === 'arriving';

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4 relative overflow-hidden">
      {/* Ambient elevator shaft light */}
      <div className="absolute inset-0 bg-gradient-to-b from-slate-900 via-slate-950 to-black" aria-hidden />
      <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-orange-500/0 via-orange-500/40 to-purple-500/0" aria-hidden />

      {/* Elevator car */}
      <div className="relative z-10 w-full max-w-md">
        <div className="bg-slate-800/80 backdrop-blur rounded-2xl border border-slate-700/60 shadow-2xl overflow-hidden">
          {/* Car header */}
          <div className="bg-slate-900 px-6 py-4 flex items-center justify-between border-b border-slate-700/50">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded bg-gradient-to-br from-orange-500 to-pink-500 flex items-center justify-center text-white text-sm font-black">
                E
              </div>
              <div>
                <div className="text-white font-bold text-sm">ELEVA Elevator</div>
                <div className="text-slate-400 text-[10px] uppercase tracking-widest">Authenticated access</div>
              </div>
            </div>
            {/* Floor indicator */}
            <div className="text-right">
              <div className="text-2xl font-black text-amber-300 elevator-floor-indicator">{floor}</div>
              <div className="text-[9px] text-slate-500 uppercase">{phase === 'moving' ? 'Moving' : 'Lobby'}</div>
            </div>
          </div>

          {/* Doors */}
          <div className="relative h-24 bg-slate-900 flex" aria-hidden>
            <div
              className="h-full bg-gradient-to-b from-slate-600 to-slate-700 border-r border-slate-800"
              style={{
                width: doorsClosed ? '2%' : '48%',
                transition: prefersReducedMotion ? undefined : 'width 0.8s ease-in-out',
              }}
            />
            <div className="flex-1 flex items-center justify-center">
              {phase === 'moving' && (
                <div className="text-amber-300/80 text-xs tracking-widest animate-pulse">UP</div>
              )}
            </div>
            <div
              className="h-full bg-gradient-to-b from-slate-600 to-slate-700 border-l border-slate-800"
              style={{
                width: doorsClosed ? '2%' : '48%',
                transition: prefersReducedMotion ? undefined : 'width 0.8s ease-in-out',
              }}
            />
          </div>

          {/* Credential panel */}
          <div
            className={`px-6 py-6 transition-all duration-500 ${showPanel && !doorsClosed ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'}`}
          >
            {phase === 'idle' && (
              <>
                <h1 className="text-xl font-bold text-white">Welcome to ELEVA</h1>
                <p className="text-sm text-slate-400 mt-1 mb-5">
                  Sign in to your workspace. We&apos;ll take you to the right floor automatically.
                </p>

                <form onSubmit={handleSubmit} className="space-y-4">
                  {authPhase === 'credentials' ? (
                    <>
                      <div>
                        <label htmlFor="elv-email" className="block text-sm font-medium text-slate-300">
                          Email
                        </label>
                        <input
                          id="elv-email"
                          type="email"
                          autoComplete="username"
                          required
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2.5 text-sm text-white placeholder-slate-500 focus:border-orange-400 focus:outline-none"
                          placeholder="you@restaurant.com"
                        />
                      </div>
                      <div>
                        <label htmlFor="elv-password" className="block text-sm font-medium text-slate-300">
                          Password
                        </label>
                        <input
                          id="elv-password"
                          type="password"
                          autoComplete="current-password"
                          required
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2.5 text-sm text-white placeholder-slate-500 focus:border-orange-400 focus:outline-none"
                          placeholder="••••••••"
                        />
                      </div>
                      <div>
                        <label htmlFor="elv-tenant" className="block text-sm font-medium text-slate-300">
                          Tenant ID
                        </label>
                        <input
                          id="elv-tenant"
                          type="text"
                          required
                          value={tenantId}
                          onChange={(e) => setTenantId(e.target.value)}
                          className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2.5 text-sm text-white placeholder-slate-500 focus:border-orange-400 focus:outline-none font-mono text-xs"
                          placeholder="Your tenant ID"
                        />
                      </div>
                    </>
                  ) : (
                    <div>
                      <label htmlFor="elv-mfa" className="block text-sm font-medium text-slate-300">
                        Authenticator code
                      </label>
                      <input
                        id="elv-mfa"
                        type="text"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        required
                        placeholder="6-digit code"
                        value={mfaToken}
                        onChange={(e) => setMfaToken(e.target.value)}
                        className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2.5 text-sm text-white placeholder-slate-500 focus:border-orange-400 focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => { setAuthPhase('credentials'); setError(null); }}
                        className="text-xs text-amber-300 mt-2 hover:underline"
                      >
                        Back to sign in
                      </button>
                    </div>
                  )}

                  {error && <p className="text-sm text-red-400">{error}</p>}

                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full bg-gradient-to-r from-orange-500 to-pink-500 text-white py-2.5 rounded-lg text-sm font-semibold hover:opacity-90 disabled:opacity-50 transition-opacity"
                  >
                    {submitting ? 'Verifying…' : authPhase === 'mfa' ? 'Verify code' : 'Sign in — ride up'}
                  </button>
                </form>
              </>
            )}

            {doorsClosed && (
              <div className="text-center py-8">
                <div className="text-white font-bold text-lg">
                  {phase === 'closing' && 'Doors closing…'}
                  {phase === 'moving' && 'Finding your floor…'}
                  {phase === 'arriving' && 'Welcome to your office'}
                </div>
                <div className="text-slate-400 text-xs mt-2">
                  {phase === 'moving' && 'Your role and destination are determined by the server.'}
                </div>
              </div>
            )}
          </div>
        </div>

        <p className="text-center text-slate-500 text-[10px] mt-4">
          Access is authenticated and authorized by the ELEVA server.
        </p>
      </div>
    </div>
  );
}

export default ElevaElevator;