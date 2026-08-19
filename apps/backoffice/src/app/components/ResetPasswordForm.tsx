'use client';

import React, { useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { resetStaffPassword } from '../lib/account-recovery';

const COPY = {
  en: {
    title: 'Reset password',
    subtitle: 'Choose a new password for your ELEVA workspace.',
    password: 'New password',
    confirm: 'Confirm password',
    submit: 'Update password',
    submitting: 'Updating…',
    success: 'Your password has been reset. You can sign in with the new password.',
    signIn: 'Sign in',
    missing: 'This reset link is missing a token.',
    mismatch: 'Passwords do not match.',
    tooShort: 'Password must be at least 8 characters.',
    lang: 'العربية',
  },
  ar: {
    title: 'إعادة تعيين كلمة المرور',
    subtitle: 'اختر كلمة مرور جديدة لمساحة عمل ELEVA.',
    password: 'كلمة المرور الجديدة',
    confirm: 'تأكيد كلمة المرور',
    submit: 'تحديث كلمة المرور',
    submitting: 'جاري التحديث…',
    success: 'تم إعادة تعيين كلمة المرور. يمكنك تسجيل الدخول بكلمة المرور الجديدة.',
    signIn: 'تسجيل الدخول',
    missing: 'رابط إعادة التعيين لا يحتوي على رمز.',
    mismatch: 'كلمتا المرور غير متطابقتين.',
    tooShort: 'يجب أن تكون كلمة المرور 8 أحرف على الأقل.',
    lang: 'English',
  },
};

export function ResetPasswordForm(): React.ReactElement {
  const params = useSearchParams();
  const token = (params.get('token') ?? '').trim();
  const [locale, setLocale] = useState<'en' | 'ar'>('en');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const copy = COPY[locale];
  const isRtl = locale === 'ar';
  const missingToken = token.length === 0;

  const canSubmit = useMemo(
    () => !missingToken && password.length >= 8 && password === confirm && !submitting,
    [missingToken, password, confirm, submitting],
  );

  const onSubmit = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    if (missingToken) {
      setError(copy.missing);
      return;
    }
    if (password.length < 8) {
      setError(copy.tooShort);
      return;
    }
    if (password !== confirm) {
      setError(copy.mismatch);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const result = await resetStaffPassword(token, password);
      if (result.ok) {
        setDone(true);
        return;
      }
      setError(result.error);
    } catch {
      setError(copy.missing);
    } finally {
      setSubmitting(false);
    }
  };

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
          <button
            type="button"
            onClick={() => setLocale(locale === 'en' ? 'ar' : 'en')}
            className="text-xs text-amber-300"
          >
            {copy.lang}
          </button>
        </div>
        <p className="text-sm text-slate-400 mb-4">{copy.subtitle}</p>

        {missingToken ? (
          <p role="alert" className="text-sm text-red-400">{copy.missing}</p>
        ) : null}

        {done ? (
          <div>
            <p role="status" className="text-sm text-emerald-300">{copy.success}</p>
            <a href="/login" className="mt-4 inline-block text-sm font-semibold text-orange-300">{copy.signIn}</a>
          </div>
        ) : (
          <form onSubmit={(event) => void onSubmit(event)} className="space-y-4">
            <div>
              <label htmlFor="new-password" className="block text-sm text-slate-300">{copy.password}</label>
              <input
                id="new-password"
                type="password"
                autoComplete="new-password"
                minLength={8}
                maxLength={128}
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2.5 text-sm text-white"
              />
            </div>
            <div>
              <label htmlFor="confirm-password" className="block text-sm text-slate-300">{copy.confirm}</label>
              <input
                id="confirm-password"
                type="password"
                autoComplete="new-password"
                minLength={8}
                maxLength={128}
                required
                value={confirm}
                onChange={(event) => setConfirm(event.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2.5 text-sm text-white"
              />
            </div>
            {error ? <p role="alert" className="text-sm text-red-400">{error}</p> : null}
            <button
              type="submit"
              disabled={!canSubmit}
              className="w-full bg-gradient-to-r from-orange-500 to-pink-500 text-white py-2.5 rounded-lg text-sm font-semibold disabled:opacity-50"
            >
              {submitting ? copy.submitting : copy.submit}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
