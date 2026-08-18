'use client';

import React, { useState, useEffect } from 'react';

/* ─── Time & weather types ─── */
export type EnvTime = 'morning' | 'day' | 'sunset' | 'night';
export type EnvWeather = 'sunny' | 'cloudy' | 'overcast' | 'rainy' | 'foggy' | 'stormy';

export interface EnvState {
  time: EnvTime;
  weather: EnvWeather;
}

export function computeTimeOfDay(): EnvTime {
  const h = new Date().getHours();
  if (h >= 5 && h < 9) return 'morning';
  if (h >= 9 && h < 17) return 'day';
  if (h >= 17 && h < 20) return 'sunset';
  return 'night';
}

export const WEATHER_LABELS: Record<EnvWeather, string> = {
  sunny: 'Clear skies',
  cloudy: 'Partly cloudy',
  overcast: 'Overcast',
  rainy: 'Rainy',
  foggy: 'Foggy',
  stormy: 'Stormy',
};

export const TIME_CLASS: Record<EnvTime, string> = {
  morning: 'env-morning',
  day: 'env-day',
  sunset: 'env-sunset',
  night: 'env-night',
};

export function getSkyGradient(time: EnvTime): string {
  switch (time) {
    case 'morning': return 'linear-gradient(180deg, #fef3c7 0%, #bae6fd 40%, #7dd3fc 100%)';
    case 'day':     return 'linear-gradient(180deg, #38bdf8 0%, #7dd3fc 50%, #bae6fd 100%)';
    case 'sunset':  return 'linear-gradient(180deg, #f97316 0%, #ec4899 40%, #7e22ce 100%)';
    case 'night':   return 'linear-gradient(180deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)';
  }
}

export function getBuildingColor(time: EnvTime): string {
  switch (time) {
    case 'morning': return '#1e293b';
    case 'day':     return '#1e293b';
    case 'sunset':  return '#1e293b';
    case 'night':   return '#0f172a';
  }
}

/* ─── Hook for environment ─── */
export function useEnvironment(): EnvState {
  const [env, setEnv] = useState<EnvState>({ time: computeTimeOfDay(), weather: 'sunny' });

  useEffect(() => {
    /* Refresh time every 10 minutes */
    const interval = setInterval(() => {
      setEnv(prev => ({ ...prev, time: computeTimeOfDay() }));
    }, 600_000);

    /* Attempt weather fetch — graceful fallback */
    (async () => {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);
        const res = await fetch(
          'https://api.open-meteo.com/v1/forecast?latitude=23.588&longitude=58.382&current=weather_code',
          { signal: controller.signal }
        );
        clearTimeout(timeout);
        if (res.ok) {
          const data = await res.json() as { current?: { weather_code?: number } };
          const code = data.current?.weather_code ?? 0;
          let weather: EnvWeather = 'sunny';
          if (code >= 0 && code <= 3) weather = 'sunny';
          else if (code >= 4 && code <= 19) weather = 'cloudy';
          else if (code >= 20 && code <= 29) weather = 'foggy';
          else if (code >= 30 && code <= 39) weather = 'stormy';
          else if (code >= 40 && code <= 49) weather = 'foggy';
          else if (code >= 50 && code <= 69) weather = 'rainy';
          else if (code >= 70 && code <= 79) weather = 'stormy';
          else if (code >= 80 && code <= 99) weather = 'rainy';
          setEnv(prev => ({ ...prev, weather }));
        }
      } catch {
        /* Fall back to time-based default — never block the website */
      }
    })();

    return () => clearInterval(interval);
  }, []);

  return env;
}