'use client';

import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { verifyStaffEmail } from '../lib/account-recovery';

const COPY = {
  en: {
    title: 'Verify email',
    verifying: 'Verifying your email…',
    success: 'Your email has been verified. You can sign in now.',
    missing: 'This verification link is missing a token.',
    signIn: 'Sign in',
    lang: 'العربية',
  },
  ar: {
    title: 'تأكيد البريد',
    verifying: 'جاري تأكيد بريدك…',
    success: 'تم تأكيد بريدك. يمكنك تسجيل الدخول الآن.',
    missing: 'رابط التأكيد لا يحتوي على رمز.',
    signIn: 'تسجيل الدخول',
    lang: 'English',
  },
};

export function VerifyEmailForm(): React.ReactElement {
  const params = useSearchParams();
  const token = (params.get('token') ?? '').trim();
  const [locale, setLocale] = useState<'en' | 'ar'>('en');
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>(token ? 'loading' : 'error');
  const [message, setMessage] = useState<string>(token ? COPY.en.verifying : COPY.en.missing);
  const copy = COPY[locale];
  const isRtl = locale === 'ar';

  useEffect(() => {
    if (!token) {
      setStatus('error');
      setMessage(COPY[locale].missing);
      return;
    }
    let cancelled = false;
    void verifyStaffEmail(token).then((result) => {
      if (cancelled) {
        return;
      }
      if (result.ok) {
        setStatus('success');
        setMessage(result.message || COPY[locale].success);
        return;
      }
      setStatus('error');
      setMessage(result.error);
    }).catch(() => {
      if (!cancelled) {
        setStatus('error');
        setMessage(COPY[locale].missing);
      }
    });
    return (): void => {
      cancelled = true;
    };
  }, [token, locale]);

  return (
    <div dir={isRtl ? 'rtl' : 'ltr'} className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-slate-800/80 backdrop-blur rounded-2xl border border-slate-700/60 p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded bg-gradient-to-br from-orange-500 to-pink-500 flex items-center justify-center text-white text-sm font-black">
              E
            </div>
            <h1 className="text-white font-bold">{copy.title}</h1>
          </div>
          <button type="button" onClick={() => setLocale(locale === 'en' ? 'ar' : 'en')} className="text-xs text-amber-300">
            {copy.lang}
          </button>
        </div>
        {status === 'loading' ? (
          <p role="status" className="text-sm text-slate-300">{copy.verifying}</p>
        ) : (
          <p role={status === 'success' ? 'status' : 'alert'} className={`text-sm ${status === 'success' ? 'text-emerald-300' : 'text-red-400'}`}>
            {message}
          </p>
        )}
        {status !== 'loading' ? (
          <a href="/login" className="mt-4 inline-block text-sm font-semibold text-orange-300">{copy.signIn}</a>
        ) : null}
      </div>
    </div>
  );
}
