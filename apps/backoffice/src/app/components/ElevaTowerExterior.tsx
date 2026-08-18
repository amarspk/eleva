'use client';

import React, { useMemo } from 'react';
import type { EnvState } from './ElevaEnvironment';
import { WEATHER_LABELS, getSkyGradient } from './ElevaEnvironment';

interface ExteriorProps {
  env: EnvState;
  isRtl: boolean;
  prefersReducedMotion: boolean;
  onSignIn: () => void;
  onExplore: () => void;
  onToggleLanguage: () => void;
}

/**
 * ELEVA Tower — Exterior view.
 *
 * The first thing a visitor sees: a cinematic, architectural ELEVA tower
 * facade that responds to the current time-of-day and (when available) the
 * real weather in Muscat. Weather is purely cosmetic — it never gates or
 * alters any application behaviour.
 */
export function ElevaTowerExterior({
  env,
  isRtl,
  prefersReducedMotion,
  onSignIn,
  onExplore,
  onToggleLanguage,
}: ExteriorProps): React.ReactNode {
  const sky = useMemo(() => getSkyGradient(env.time), [env.time]);
  const isNight = env.time === 'night';
  const stars = useMemo(() =>
    Array.from({ length: 40 }, (_, i) => ({
      id: i,
      left: `${(i * 37) % 100}%`,
      top: `${(i * 53) % 55}%`,
      size: (i % 3) + 1,
      opacity: 0.2 + ((i * 7) % 10) / 12,
      delay: `${(i % 5) * 0.4}s`,
    })), []);

  return (
    <div className="relative min-h-screen overflow-hidden">
      {/* Sky */}
      <div className="absolute inset-0" style={{ background: sky }} aria-hidden />

      {/* Stars at night */}
      {isNight && (
        <div className="absolute inset-0" aria-hidden>
          {stars.map(s => (
            <div
              key={s.id}
              className="absolute rounded-full bg-white"
              style={{
                width: s.size,
                height: s.size,
                left: s.left,
                top: s.top,
                opacity: s.opacity,
                animation: prefersReducedMotion ? undefined : `pulseSoft ${2 + (s.id % 3)}s ease-in-out ${s.delay} infinite`,
              }}
            />
          ))}
        </div>
      )}

      {/* Sun / Moon */}
      {isNight ? (
        <div className="absolute top-16 right-16 w-24 h-24 rounded-full bg-gradient-to-br from-yellow-100 to-yellow-50 shadow-[0_0_60px_rgba(254,243,199,0.35)]" aria-hidden />
      ) : env.time === 'sunset' ? (
        <div className="absolute top-10 right-10 w-40 h-24 rounded-full bg-gradient-to-b from-orange-300 via-pink-400 to-transparent opacity-70" aria-hidden />
      ) : (
        <div className="absolute top-20 right-20 w-28 h-28 rounded-full bg-gradient-to-b from-yellow-200 to-amber-100 opacity-80 shadow-[0_0_80px_rgba(251,191,36,0.4)]" aria-hidden />
      )}

      {/* Rain */}
      {env.weather === 'rainy' && !prefersReducedMotion && (
        <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden>
          {Array.from({ length: 24 }, (_, i) => (
            <div
              key={i}
              className="absolute bg-sky-100/30"
              style={{
                width: 1,
                height: 12 + (i % 10) * 2,
                left: `${(i * 41) % 100}%`,
                top: '-20px',
                animation: `rainFall ${0.8 + (i % 5) * 0.2}s linear ${(i % 6) * 0.3}s infinite`,
              }}
            />
          ))}
        </div>
      )}

      {/* Fog */}
      {env.weather === 'foggy' && (
        <div className="absolute inset-0 bg-white/10 backdrop-blur-[2px]" aria-hidden />
      )}

      {/* Tower facade — stylized architectural silhouette */}
      <div className="absolute inset-x-0 bottom-0 h-2/3" aria-hidden>
        {/* Ground */}
        <div className="absolute bottom-0 inset-x-0 h-24 bg-slate-800/90" />
        {/* Building body */}
        <div className="absolute bottom-20 left-1/2 -translate-x-1/2 w-[70%] max-w-2xl h-[85%] bg-slate-900 rounded-t-xl shadow-[0_0_80px_rgba(15,23,42,0.5)]">
          {/* Glass floors */}
          {Array.from({ length: 12 }, (_, i) => (
            <div
              key={i}
              className="absolute inset-x-4"
              style={{
                top: `${i * 7.5}%`,
                height: 1,
                background: env.time === 'night' ? 'rgba(148,163,184,0.25)' : 'rgba(148,163,184,0.35)',
              }}
            />
          ))}
          {/* Illuminated windows at night */}
          {env.time === 'night' && Array.from({ length: 36 }, (_, i) => (
            <div
              key={i}
              className="absolute bg-amber-300/70"
              style={{
                width: 8,
                height: 6,
                left: `${6 + (i % 6) * 16}%`,
                top: `${4 + Math.floor(i / 6) * 7.5}%`,
                opacity: 0.4 + ((i * 13) % 6) / 10,
              }}
            />
          ))}
          {/* ELEVA sign on the tower */}
          <div className="absolute top-6 left-1/2 -translate-x-1/2 bg-black/40 backdrop-blur px-4 py-1 rounded text-white text-xs font-black tracking-widest border border-white/10">
            ELEVA
          </div>
          {/* Main entrance */}
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-24 h-14 bg-slate-800 rounded-t-lg border-x border-t border-slate-600/50 flex items-end justify-center pb-2">
            <div className="w-1 h-3 bg-amber-300/80 rounded" />
          </div>
        </div>
        {/* Side towers */}
        <div className="absolute bottom-20 left-[8%] w-24 h-[55%] bg-slate-800/70 rounded-t-lg" />
        <div className="absolute bottom-20 right-[8%] w-32 h-[65%] bg-slate-800/70 rounded-t-lg" />
      </div>

      {/* Content overlay */}
      <div className="relative z-10 flex flex-col items-center justify-center min-h-screen px-4 text-center">
        <div className={prefersReducedMotion ? undefined : 'animate-[fadeInUp_0.9s_ease-out]'}>
          {/* Glow accent */}
          <div className="w-20 h-1 bg-gradient-to-r from-orange-400 via-pink-400 to-purple-400 mx-auto mb-6 rounded-full shadow-[0_0_30px_rgba(251,146,60,0.5)]" />

          <h1 className="text-6xl md:text-7xl font-black tracking-tight text-slate-900 drop-shadow-sm">
            ELEVA
          </h1>
          <div className="mt-2 h-0.5 w-40 mx-auto bg-gradient-to-r from-orange-400 via-pink-500 to-purple-500" />

          <p className="text-lg md:text-xl mt-8 text-slate-700 font-medium">
            Premium Restaurant SaaS Platform
          </p>
          <p className="text-sm md:text-base mt-2 text-slate-600 max-w-md mx-auto">
            Every restaurant deserves its own powerful digital presence
          </p>

          <div className="flex flex-wrap gap-4 justify-center mt-10">
            <button
              type="button"
              onClick={onSignIn}
              className="px-8 py-3 bg-slate-900 text-white rounded-full font-semibold text-sm hover:bg-slate-800 shadow-lg transition-all"
            >
              Sign In — Enter the Tower
            </button>
            <button
              type="button"
              onClick={onExplore}
              className="px-8 py-3 border border-slate-900/20 text-slate-800 rounded-full text-sm hover:bg-slate-900/5 transition-all"
            >
              Explore Reception
            </button>
          </div>

          <div className="mt-10 text-xs text-slate-600/70 flex items-center gap-3 justify-center">
            <span>{new Date().toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}</span>
            <span aria-hidden>•</span>
            <span>{WEATHER_LABELS[env.weather]}</span>
            <span aria-hidden>•</span>
            <button
              type="button"
              onClick={onToggleLanguage}
              className="hover:text-slate-900 transition-colors"
            >
              {isRtl ? 'English' : 'العربية'}
            </button>
          </div>
        </div>

        <div className={`absolute bottom-6 left-1/2 -translate-x-1/2 ${prefersReducedMotion ? '' : 'animate-[pulseSoft_2s_ease-in-out_infinite]'}`} aria-hidden>
          <div className="w-6 h-10 border-2 border-slate-900/20 rounded-full flex items-start justify-center p-1">
            <div className="w-1.5 h-3 bg-slate-900/30 rounded-full" />
          </div>
        </div>
      </div>
    </div>
  );
}

export default ElevaTowerExterior;