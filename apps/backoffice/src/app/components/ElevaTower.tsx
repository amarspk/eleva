'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ElevaTowerExterior } from './ElevaTowerExterior';
import { ElevaReception } from './ElevaReception';
import { useEnvironment } from './ElevaEnvironment';
import { loadSession } from '../lib/auth';

/**
 * ELEVA Tower — the official ELEVA Brand & Marketing Platform.
 *
 * A single continuous experience:
 *   Exterior (time-of-day + weather responsive facade)
 *     → Reception (architectural zones: about / features / pricing / …)
 *     → Elevator (authentication, server-decides destination)
 *     → Office (existing authenticated dashboard)
 *
 * The Tower is a presentation layer only. Authentication, RBAC, tenant
 * isolation and every business rule remain server-authoritative.
 */
export function ElevaTower(): React.ReactNode {
  const router = useRouter();
  const env = useEnvironment();
  const [activeZone, setActiveZone] = useState<string | null>(null);
  const [entered, setEntered] = useState(false);       // exterior → reception
  const [isRtl, setIsRtl] = useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(mq.matches);
    const handler = (e: MediaQueryListEvent): void => { setPrefersReducedMotion(e.matches); };
    mq.addEventListener('change', handler);
    return (): void => { mq.removeEventListener('change', handler); };
  }, []);

  /* If already authenticated, skip the tower and go straight to the office */
  useEffect(() => {
    try {
      const s = loadSession();
      if (s?.accessToken) {
        router.replace('/');
      }
    } catch {
      /* no stored session — show the tower */
    }
  }, [router]);

  const handleSignIn = useCallback(() => {
    router.push('/login?tower=true');
  }, [router]);

  const handleExplore = useCallback(() => {
    setEntered(true);
    window.setTimeout(() => {
      const el = document.getElementById('zone-about');
      if (el) {
        el.scrollIntoView({ behavior: prefersReducedMotion ? 'auto' : 'smooth', block: 'start' });
      }
    }, 100);
    setActiveZone('about');
  }, [prefersReducedMotion]);

  const handleSelectZone = useCallback((id: string) => {
    setActiveZone(id);
    const el = document.getElementById(`zone-${id}`);
    if (el) {
      el.scrollIntoView({ behavior: prefersReducedMotion ? 'auto' : 'smooth', block: 'start' });
    }
  }, [prefersReducedMotion]);

  const handleBackToExterior = useCallback(() => {
    setActiveZone(null);
    window.scrollTo({ top: 0, behavior: prefersReducedMotion ? 'auto' : 'smooth' });
  }, [prefersReducedMotion]);

  const handleToggleLanguage = useCallback(() => setIsRtl(p => !p), []);

  return (
    <div dir={isRtl ? 'rtl' : 'ltr'} className={isRtl ? 'font-arabic' : ''}>
      {/* Global tower styles — defined once, not per component */}
      <style>{`
        /* Environment tint on the exterior sky */
        .env-morning .exterior-sky { filter: sepia(0.2) saturate(1.1); }
        .env-sunset .exterior-sky { filter: hue-rotate(-10deg) saturate(1.3) brightness(1.05); }
        .env-night .exterior-sky { filter: brightness(0.85) saturate(0.9); }

        /* Weather visibility */
        .env-weather-foggy .exterior-sky { filter: blur(1px) brightness(1.05); }

        @keyframes rainFall {
          0%   { transform: translateY(-20px); opacity: 0.6; }
          100% { transform: translateY(100vh); opacity: 0; }
        }
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(24px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes pulseSoft {
          0%, 100% { opacity: 1; }
          50%      { opacity: 0.5; }
        }

        .elevator-floor-indicator {
          font-family: 'Courier New', monospace;
        }

        /* Reception zone separation */
        .zone-corner { position: relative; }

        /* Arabic typography */
        .font-arabic,
        .font-arabic * {
          font-family: 'Noto Sans Arabic', 'Segoe UI', Tahoma, sans-serif;
        }

        /* Reduced motion — global kill switch */
        @media (prefers-reduced-motion: reduce) {
          *, *::before, *::after {
            animation-duration: 0.01ms !important;
            animation-iteration-count: 1 !important;
            transition-duration: 0.01ms !important;
            scroll-behavior: auto !important;
          }
        }

        /* Mobile: reception zones stack, no clip-path */
        @media (max-width: 768px) {
          .zone-corner { scroll-margin-top: 56px; }
        }
      `}</style>

      {/* Exterior first */}
      {!entered ? (
        <div className="exterior-sky">
          <ElevaTowerExterior
            env={env}
            isRtl={isRtl}
            prefersReducedMotion={prefersReducedMotion}
            onSignIn={handleSignIn}
            onExplore={handleExplore}
            onToggleLanguage={handleToggleLanguage}
          />
        </div>
      ) : (
        <ElevaReception
          activeZone={activeZone}
          prefersReducedMotion={prefersReducedMotion}
          onSelectZone={handleSelectZone}
          onBackToExterior={handleBackToExterior}
          isRtl={isRtl}
          onToggleLanguage={handleToggleLanguage}
        />
      )}
    </div>
  );
}

export default ElevaTower;