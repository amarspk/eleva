'use client';

import React, { useEffect, useState } from 'react';
import {
  registerCustomer,
  loginCustomer,
  fetchCustomerProfile,
  updateCustomerProfile,
  fetchCustomerOrders,
  customerLogout,
  clearCustomerSession,
  getCustomerToken,
  redeemLoyaltyPoints,
  listMyComplaints,
  createComplaint,
  getMyComplaint,
  addComplaintMessage,
  createRating,
  listMyRatings,
} from '../lib/customer-api';
import type { CustomerProfile, CustomerOrderSummary } from '../lib/customer-types';

type Lang = 'en' | 'ar';

const L: Record<Lang, Record<string, string>> = {
  en: {
    brand: 'Your account',
    signIn: 'Sign in',
    createAccount: 'Create account',
    firstName: 'First name',
    lastName: 'Last name',
    email: 'Email',
    phone: 'Phone (optional)',
    password: 'Password',
    passwordHint: 'At least 8 characters',
    submitSignIn: 'Sign in',
    submitRegister: 'Create account',
    backToSignIn: 'Already have an account? Sign in',
    goToRegister: 'New here? Create an account',
    error: 'Something went wrong. Please try again.',
    profile: 'My profile',
    history: 'My orders',
    noOrders: 'No orders yet. Your orders placed while signed in will appear here.',
    signOut: 'Sign out',
    saving: 'Saving…',
    saved: 'Saved',
    saveProfile: 'Save profile',
    order: 'Order',
    date: 'Date',
    total: 'Total',
    status: 'Status',
    items: 'items',
    points: 'Points',
    loyaltyPoints: 'Loyalty points',
    redeemTitle: 'Redeem points for discount',
    redeemButton: 'Redeem',
    redeemInfo: 'Enter points to redeem',
    redeemSuccess: 'Discount code generated!',
    redeemCodeLabel: 'Code',
    historyTitle: 'Points history',
    earned: 'Earned',
    redeemed: 'Redeemed',
    noLoyaltyHistory: 'No loyalty activity yet.',
    loyaltyEarnInfo: 'Earn points by completing orders while signed in.',
    complaints: 'My complaints',
    newComplaint: 'New complaint',
    compSubject: 'Subject',
    compDesc: 'Description',
    compSubmit: 'Submit',
    compNoOrders: 'No complaints yet.',
    compReplyPlaceholder: 'Type your reply...',
    compSend: 'Send',
    compStatus: 'Status',
    langToggle: 'العربية',
  },
  ar: {
    brand: 'حسابك',
    signIn: 'تسجيل الدخول',
    createAccount: 'إنشاء حساب',
    firstName: 'الاسم الأول',
    lastName: 'اسم العائلة',
    email: 'البريد الإلكتروني',
    phone: 'الهاتف (اختياري)',
    password: 'كلمة المرور',
    passwordHint: '8 أحرف على الأقل',
    submitSignIn: 'دخول',
    submitRegister: 'إنشاء حساب',
    backToSignIn: 'لديك حساب؟ سجّل الدخول',
    goToRegister: 'جديد هنا؟ أنشئ حساباً',
    error: 'حدث خطأ ما. حاول مرة أخرى',
    profile: 'ملفي الشخصي',
    history: 'طلباتي',
    noOrders: 'لا توجد طلبات بعد. ستظهر طلباتك المقدمة أثناء تسجيل الدخول هنا.',
    signOut: 'تسجيل الخروج',
    points: 'نقطة',
    loyaltyPoints: 'نقاط الولاء',
    redeemTitle: 'استبدال النقاط للحصول على خصم',
    redeemButton: 'استبدال',
    redeemInfo: 'أدخل عدد النقاط للاستبدال',
    redeemSuccess: 'تم إنشاء رمز الخصم!',
    redeemCodeLabel: 'الرمز',
    historyTitle: 'سجل النقاط',
    earned: 'مكتسب',
    redeemed: 'مستبدل',
    noLoyaltyHistory: 'لا يوجد نشاط ولاء بعد.',
    loyaltyEarnInfo: 'اكسب النقاط عن طريق إتمام الطلبات أثناء تسجيل الدخول.',
    complaints: 'شكاوي',
    newComplaint: 'شكوى جديدة',
    compSubject: 'الموضوع',
    compDesc: 'الوصف',
    compSubmit: 'إرسال',
    compNoOrders: 'لا توجد شكاوي بعد.',
    compReplyPlaceholder: 'اكتب ردك...',
    compSend: 'إرسال',
    compStatus: 'الحالة',
    langToggle: 'English',
    saving: 'جارٍ الحفظ…',
    saved: 'تم الحفظ',
    saveProfile: 'حفظ الملف',
    order: 'طلب',
    date: 'التاريخ',
    total: 'الإجمالي',
    status: 'الحالة',
    items: 'أصناف',
  },
};

interface Branding {
  name: string;
  primaryColor: string;
  logoUrl?: string | null;
  currency?: string;
}

/**
 * Customer Account & Profile (Phase 4) — mobile-first, restaurant-branded.
 *
 * The UI intentionally uses the restaurant's own branding (never ELEVA's
 * tower styling) and supports English/Arabic with full RTL/LTR switching.
 * All data comes from the customer self-service API; the server enforces
 * tenant isolation and ownership.
 */
export function CustomerAccount({ branding }: { branding: Branding }): React.ReactNode {
  const [lang, setLang] = useState<Lang>('en');
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [customer, setCustomer] = useState<CustomerProfile | null>(null);
  const [orders, setOrders] = useState<CustomerOrderSummary[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [savedFlash, setSavedFlash] = useState(false);
  const [loyaltyBalance, setLoyaltyBalance] = useState<number | null>(null);
  const [loyaltyHistory, setLoyaltyHistory] = useState<Array<Record<string, unknown>> | null>(null);
  const [walletBalance, setWalletBalance] = useState<number | null>(null);
  const [complaints, setComplaints] = useState<Array<Record<string, unknown>> | null>(null);
  const [viewingComplaint, setViewingComplaint] = useState<Record<string, unknown> | null>(null);
  const [showComplaintForm, setShowComplaintForm] = useState(false);
  const [compSubject, setCompSubject] = useState('');
  const [compDesc, setCompDesc] = useState('');
  const [compReply, setCompReply] = useState('');
  const [, setRatings] = useState<Array<Record<string, unknown>> | null>(null);
  const [showRatingForm, setShowRatingForm] = useState<string | null>(null);
  const [starHover, setStarHover] = useState(0);
  const [selectedRating, setSelectedRating] = useState(0);
  const [ratingFeedback, setRatingFeedback] = useState('');
  const [walletHistory, setWalletHistory] = useState<Array<Record<string, unknown>> | null>(null);
  const [redeemInput, setRedeemInput] = useState('');
  const [redeemResult, setRedeemResult] = useState<string | null>(null);
  const [redeemCode, setRedeemCode] = useState('');

  const t = L[lang];
  const greeting = lang === 'ar' ? `مرحباً، ${customer?.firstName ?? ''}` : `Welcome, ${customer?.firstName ?? ''}`;
  const dir = lang === 'ar' ? 'rtl' : 'ltr';

  useEffect(() => {
    // Restore an existing customer session on load.
    if (!getCustomerToken()) {
      return;
    }
    (async (): Promise<void> => {
      try {
        const profile = await fetchCustomerProfile();
        setCustomer(profile);
        setFirstName(profile.firstName);
        setLastName(profile.lastName);
        setPhone(profile.phoneNumber ?? '');
      } catch {
        clearCustomerSession();
      }
    })();
  }, []);

  useEffect(() => {
    if (!customer) {
      return;
    }
    (async (): Promise<void> => {
      try {
        setOrders(await fetchCustomerOrders());
      } catch {
        setOrders([]);
      }
    })();
  }, [customer]);

  const submit = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === 'register') {
        const session = await registerCustomer({ firstName, lastName, email, phoneNumber: phone || undefined, password });
        setCustomer(session.customer);
        setOrders([]);
      } else {
        const session = await loginCustomer({ email, password });
        setCustomer(session.customer);
        setFirstName(session.customer.firstName);
        setLastName(session.customer.lastName);
        setPhone(session.customer.phoneNumber ?? '');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t.error);
    } finally {
      setBusy(false);
    }
  };

  const handleRedeem = async (): Promise<void> => {
    const pts = parseInt(redeemInput, 10);
    if (!pts || pts <= 0) {
      return;
    }
    try {
      const result = await redeemLoyaltyPoints(pts);
      setRedeemResult(result.discountValue > 0 ? t.redeemSuccess : '');
      setRedeemCode(result.discountCode);
      setLoyaltyBalance(result.balanceAfter);
      setRedeemInput('');
    } catch (err) {
      setRedeemResult(err instanceof Error ? err.message : t.error);
    }
  };

  const saveProfile = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      const updated = await updateCustomerProfile({ firstName, lastName, phoneNumber: phone || undefined });
      setCustomer(updated);
      setSavedFlash(true);
      window.setTimeout(() => setSavedFlash(false), 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.error);
    } finally {
      setBusy(false);
    }
  };

  const signOut = async (): Promise<void> => {
    try {
      await customerLogout();
    } catch {
      /* token already invalid — still clear locally */
    }
    clearCustomerSession();
    setCustomer(null);
    setOrders(null);
    setLoyaltyBalance(null);
    setLoyaltyHistory(null);
    setWalletBalance(null);
    setWalletHistory(null);
    setComplaints(null);
    setViewingComplaint(null);
    setMode('login');
  };

  const inputCls: React.CSSProperties = {
    width: '100%',
    padding: '10px 12px',
    borderRadius: 10,
    border: '1px solid #d1d5db',
    fontSize: 16,
    boxSizing: 'border-box',
    marginTop: 4,
  };
  const labelCls: React.CSSProperties = { fontSize: 13, fontWeight: 600, color: '#374151', display: 'block' };
  const btnPrimary: React.CSSProperties = {
    width: '100%',
    padding: '12px',
    borderRadius: 12,
    border: 'none',
    background: branding.primaryColor || '#111',
    color: '#fff',
    fontSize: 15,
    fontWeight: 700,
    marginTop: 12,
  };

  return (
    <div dir={dir} style={{ maxWidth: 480, margin: '0 auto', padding: '16px', fontFamily: 'system-ui, sans-serif' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {branding.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={branding.logoUrl} alt={branding.name} style={{ width: 36, height: 36, borderRadius: 8, objectFit: 'cover' }} />
          ) : (
            <div style={{ width: 36, height: 36, borderRadius: 8, background: branding.primaryColor, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800 }}>
              {branding.name.slice(0, 1)}
            </div>
          )}
          <div>
            <div style={{ fontSize: 15, fontWeight: 800 }}>{branding.name}</div>
            <div style={{ fontSize: 12, color: '#6b7280' }}>{t.brand}</div>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setLang(lang === 'en' ? 'ar' : 'en')}
          style={{ border: '1px solid #d1d5db', background: '#fff', borderRadius: 999, padding: '6px 12px', fontSize: 12 }}
        >
          {t.langToggle}
        </button>
      </div>

      {!customer ? (
        /* ── Signed out: sign in / create account ── */
        <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #e5e7eb', padding: 20 }}>
          <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
            {(['login', 'register'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => { setMode(m); setError(null); }}
                style={{
                  flex: 1,
                  padding: '10px',
                  borderRadius: 10,
                  border: mode === m ? 'none' : '1px solid #d1d5db',
                  background: mode === m ? (branding.primaryColor || '#111') : '#fff',
                  color: mode === m ? '#fff' : '#374151',
                  fontSize: 13,
                  fontWeight: 700,
                }}
              >
                {m === 'login' ? t.signIn : t.createAccount}
              </button>
            ))}
          </div>

          <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {mode === 'register' && (
              <>
                <div>
                  <label htmlFor="ca-first" style={labelCls}>{t.firstName}</label>
                  <input id="ca-first" required value={firstName} onChange={(e) => setFirstName(e.target.value)} style={inputCls} />
                </div>
                <div>
                  <label htmlFor="ca-last" style={labelCls}>{t.lastName}</label>
                  <input id="ca-last" required value={lastName} onChange={(e) => setLastName(e.target.value)} style={inputCls} />
                </div>
                <div>
                  <label htmlFor="ca-phone" style={labelCls}>{t.phone}</label>
                  <input id="ca-phone" value={phone} onChange={(e) => setPhone(e.target.value)} style={inputCls} inputMode="tel" />
                </div>
              </>
            )}
            <div>
              <label htmlFor="ca-email" style={labelCls}>{t.email}</label>
              <input id="ca-email" required type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} style={inputCls} />
            </div>
            <div>
              <label htmlFor="ca-password" style={labelCls}>{t.password}</label>
              <input id="ca-password" required type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} style={inputCls} />
              <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 4 }}>{mode === 'register' ? t.passwordHint : ''}</div>
            </div>

            {error && <div style={{ background: '#fef2f2', color: '#b91c1c', borderRadius: 10, padding: '10px 12px', fontSize: 13 }}>{error}</div>}

            <button type="submit" disabled={busy} style={{ ...btnPrimary, opacity: busy ? 0.6 : 1 }}>
              {busy ? '…' : mode === 'login' ? t.submitSignIn : t.submitRegister}
            </button>
          </form>

          <button
            type="button"
            onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(null); }}
            style={{ marginTop: 12, background: 'none', border: 'none', color: branding.primaryColor || '#111', fontSize: 13, width: '100%', textAlign: 'center' }}
          >
            {mode === 'login' ? t.goToRegister : t.backToSignIn}
          </button>
        </div>
      ) : (
        /* ── Signed in: profile + order history ── */
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #e5e7eb', padding: 20 }}>
            <div style={{ fontSize: 13, color: '#6b7280', fontWeight: 600 }}>{greeting}</div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
              <div style={{ display: 'flex', gap: 8 }}>
                <div style={{ flex: 1 }}>
                  <label style={labelCls}>{t.firstName}</label>
                  <input value={firstName} onChange={(e) => setFirstName(e.target.value)} style={inputCls} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={labelCls}>{t.lastName}</label>
                  <input value={lastName} onChange={(e) => setLastName(e.target.value)} style={inputCls} />
                </div>
              </div>
              <div>
                <label style={labelCls}>{t.email}</label>
                <input value={customer.email} disabled style={{ ...inputCls, background: '#f3f4f6', color: '#6b7280' }} />
              </div>
              <div>
                <label style={labelCls}>{t.phone}</label>
                <input value={phone} onChange={(e) => setPhone(e.target.value)} style={inputCls} inputMode="tel" />
              </div>
              <button type="button" disabled={busy} onClick={() => void saveProfile()} style={{ ...btnPrimary, marginTop: 4, background: '#111' }}>
                {busy ? t.saving : savedFlash ? t.saved : t.saveProfile}
              </button>
              {error && <div style={{ background: '#fef2f2', color: '#b91c1c', borderRadius: 10, padding: '10px 12px', fontSize: 13 }}>{error}</div>}
            </div>
          </div>

          {/* Loyalty */}
          <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #e5e7eb', padding: 20 }}>
            <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 8 }}>{t.loyaltyPoints}</div>
            {loyaltyBalance !== null && (
              <div style={{ fontSize: 13, marginBottom: 4 }}>
                <span style={{ fontWeight: 700 }}>{loyaltyBalance}</span> {t.points}
              </div>
            )}
            <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 12 }}>{t.loyaltyEarnInfo}</div>

            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
              <input
                type="number" min="1" placeholder={t.redeemInfo}
                value={redeemInput} onChange={(e) => setRedeemInput(e.target.value)}
                style={{ flex: 1, padding: '8px 10px', borderRadius: 10, border: '1px solid #d1d5db', fontSize: 14, boxSizing: 'border-box' }}
              />
              <button type="button" onClick={() => void handleRedeem()} disabled={!redeemInput || parseInt(redeemInput) <= 0}
                style={{ padding: '8px 16px', borderRadius: 10, border: 'none', background: '#111', color: '#fff', fontSize: 13, fontWeight: 700, opacity: !redeemInput || parseInt(redeemInput) <= 0 ? 0.5 : 1 }}>
                {t.redeemButton}
              </button>
            </div>
            {redeemResult && (
              <div style={{ background: redeemCode ? '#f0fdf4' : '#fef2f2', borderRadius: 10, padding: '10px 12px', fontSize: 13, marginBottom: 8 }}>
                <div>{redeemResult}</div>
                {redeemCode && <div style={{ fontWeight: 700, marginTop: 4 }}>{t.redeemCodeLabel}: <code style={{ background: '#f3f4f6', padding: '2px 6px', borderRadius: 4 }}>{redeemCode}</code></div>}
              </div>
            )}

            {loyaltyHistory !== null && loyaltyHistory.length > 0 && (
              <>
                <div style={{ fontSize: 13, fontWeight: 700, margin: '12px 0 6px' }}>{t.historyTitle}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {loyaltyHistory.slice(0, 20).map((tx) => (
                    <div key={tx.id as string} style={{ fontSize: 12, display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #f3f4f6', paddingBottom: 4 }}>
                      <span>{tx.type === 'EARNED' ? t.earned : tx.type === 'REDEEMED' ? t.redeemed : String(tx.type)}</span>
                      <span style={{ fontWeight: 700, color: String(tx.points).startsWith('-') ? '#dc2626' : '#16a34a' }}>
                        {String(tx.points).startsWith('-') ? '' : '+'}{String(tx.points)} {t.points}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Wallet */}
          <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #e5e7eb', padding: 20 }}>
            <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 8 }}>{lang === 'ar' ? 'محفظتي' : 'My wallet'}</div>
            {walletBalance !== null && (
              <div style={{ fontSize: 24, fontWeight: 700, color: '#059669', marginBottom: 4 }}>
                {new Intl.NumberFormat(lang === 'ar' ? 'ar-EG' : 'en-US', { style: 'currency', currency: branding.currency || 'USD' }).format(walletBalance)}
              </div>
            )}
            {walletHistory !== null && walletHistory.length > 0 && (
              <>
                <div style={{ fontSize: 13, fontWeight: 700, margin: '12px 0 6px' }}>{lang === 'ar' ? 'السجل' : 'History'}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {walletHistory.slice(0, 20).map((tx: Record<string, unknown>) => (
                    <div key={tx.id as string} style={{ fontSize: 12, display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #f3f4f6', paddingBottom: 4 }}>
                      <span style={{ color: '#6b7280' }}>
                        {tx.type === 'CREDIT' ? (lang === 'ar' ? 'إيداع' : 'Credit') :
                         tx.type === 'ORDER_PAYMENT' ? (lang === 'ar' ? 'طلب' : 'Order payment') :
                         tx.type === 'REFUND' ? (lang === 'ar' ? 'استرداد' : 'Refund') : String(tx.type)}
                      </span>
                      <span style={{ fontWeight: 700, color: Number(tx.amount) < 0 ? '#dc2626' : '#059669' }}>
                        {Number(tx.amount) < 0 ? '' : '+'}{Number(tx.amount).toFixed(2)}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}
            {walletBalance !== null && walletBalance === 0 && (
              <div style={{ fontSize: 13, color: '#6b7280' }}>{lang === 'ar' ? 'رصيد المحفظة صفر' : 'Wallet balance is zero.'}</div>
            )}
          </div>

          {/* Complaints section */}
          <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #e5e7eb', padding: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div style={{ fontSize: 15, fontWeight: 800 }}>{t.complaints}</div>
              <button type="button" onClick={() => { setShowComplaintForm(!showComplaintForm); setViewingComplaint(null); }}
                style={{ padding: '6px 12px', borderRadius: 10, border: 'none', background: branding.primaryColor, color: '#fff', fontSize: 12, fontWeight: 700 }}>
                {t.newComplaint}
              </button>
            </div>

            {showComplaintForm && (
              <div style={{ marginBottom: 12 }}>
                <input placeholder={t.compSubject} value={compSubject} onChange={(e) => setCompSubject(e.target.value)}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 10, border: '1px solid #d1d5db', fontSize: 13, marginBottom: 8, boxSizing: 'border-box' }} />
                <textarea placeholder={t.compDesc} value={compDesc} onChange={(e) => setCompDesc(e.target.value)}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 10, border: '1px solid #d1d5db', fontSize: 13, minHeight: 60, marginBottom: 8, boxSizing: 'border-box' }} />
                <button type="button" onClick={() => { createComplaint({ subject: compSubject, description: compDesc }).then(() => { setShowComplaintForm(false); setCompSubject(''); setCompDesc(''); listMyComplaints().then(setComplaints).catch(() => {}); }).catch(() => {}); }}
                  disabled={!compSubject || !compDesc}
                  style={{ padding: '8px 16px', borderRadius: 10, border: 'none', background: branding.primaryColor, color: '#fff', fontSize: 13, fontWeight: 700, opacity: !compSubject || !compDesc ? 0.5 : 1 }}>
                  {t.compSubmit}
                </button>
              </div>
            )}

            {viewingComplaint ? (
              <div>
                <button type="button" onClick={() => setViewingComplaint(null)} style={{ background: 'none', border: 'none', color: '#6b7280', fontSize: 12, marginBottom: 8 }}>&larr; Back</button>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{viewingComplaint.subject as string}</div>
                <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 4 }}>{viewingComplaint.status as string} &middot; {t.compStatus}: {viewingComplaint.status as string}</div>
                <div style={{ fontSize: 13, marginBottom: 8 }}>{viewingComplaint.description as string}</div>
                <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: 8, marginBottom: 8 }}>
                  {(viewingComplaint.messages as Array<Record<string, unknown>> || []).map((msg: Record<string, unknown>) => (
                    <div key={msg.id as string} style={{ fontSize: 12, marginBottom: 6, padding: 6, background: msg.authorType === 'STAFF' ? '#f0fdf4' : '#f3f4f6', borderRadius: 8 }}>
                      <span style={{ fontWeight: 600, fontSize: 10, color: '#6b7280' }}>{msg.authorType === 'STAFF' ? 'Staff' : 'You'}</span>
                      <div>{msg.message as string}</div>
                    </div>
                  ))}
                </div>
                {(viewingComplaint.status as string) !== 'CLOSED' && (
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input placeholder={t.compReplyPlaceholder} value={compReply} onChange={(e) => setCompReply(e.target.value)}
                      style={{ flex: 1, padding: '8px 10px', borderRadius: 10, border: '1px solid #d1d5db', fontSize: 13, boxSizing: 'border-box' }} />
                    <button type="button" onClick={() => { addComplaintMessage(viewingComplaint.id as string, compReply).then(() => { setCompReply(''); getMyComplaint(viewingComplaint.id as string).then(setViewingComplaint).catch(() => {}); }).catch(() => {}); }}
                      disabled={!compReply}
                      style={{ padding: '8px 14px', borderRadius: 10, border: 'none', background: branding.primaryColor, color: '#fff', fontSize: 13, fontWeight: 700, opacity: !compReply ? 0.5 : 1 }}>
                      {t.compSend}
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div>
                {complaints !== null && complaints.length === 0 && <div style={{ fontSize: 13, color: '#6b7280' }}>{t.compNoOrders}</div>}
                {complaints !== null && complaints.length > 0 && complaints.slice(0, 20).map((comp: Record<string, unknown>) => (
                  <div key={comp.id as string} onClick={() => { getMyComplaint(comp.id as string).then(setViewingComplaint).catch(() => {}); }}
                    style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #f3f4f6', cursor: 'pointer', fontSize: 13 }}>
                    <div style={{ fontWeight: 600, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{comp.subject as string}</div>
                    <span style={{ fontSize: 11, padding: '2px 6px', borderRadius: 4, background: comp.status === 'CLOSED' ? '#f3f4f6' : comp.status === 'RESOLVED' ? '#d1fae5' : '#fef3c7', color: comp.status === 'CLOSED' ? '#6b7280' : comp.status === 'RESOLVED' ? '#065f46' : '#92400e' }}>
                      {String(comp.status)}
                    </span>
                  </div>
                ))}
              </div>
            )}
            {/* Rating form */}
            {showRatingForm && (
              <div style={{ marginTop: 10, padding: 12, border: '1px solid #e5e7eb', borderRadius: 12, background: '#f9fafb' }}>
                <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
                  {[1,2,3,4,5].map(s => (
                    <button key={s} type="button"
                      onClick={() => setSelectedRating(s)}
                      onMouseEnter={() => setStarHover(s)}
                      onMouseLeave={() => setStarHover(0)}
                      style={{ fontSize: 24, border: 'none', background: 'none', cursor: 'pointer', color: (starHover || selectedRating) >= s ? '#f59e0b' : '#d1d5db', transition: 'color 0.1s' }}>
                      ★
                    </button>
                  ))}
                </div>
                <input placeholder={lang === 'ar' ? 'أضف تعليقاً (اختياري)' : 'Add feedback (optional)'}
                  value={ratingFeedback} onChange={(e) => setRatingFeedback(e.target.value)}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 10, border: '1px solid #d1d5db', fontSize: 13, marginBottom: 8, boxSizing: 'border-box' }} />
                <div style={{ display: 'flex', gap: 6 }}>
                  <button type="button" onClick={() => { createRating({ orderId: showRatingForm, rating: selectedRating, feedback: ratingFeedback || undefined }).then(() => { setShowRatingForm(null); listMyRatings().then(setRatings).catch(() => {}); }).catch(() => {}); }}
                    disabled={selectedRating === 0}
                    style={{ padding: '8px 14px', borderRadius: 10, border: 'none', background: branding.primaryColor, color: '#fff', fontSize: 13, fontWeight: 700, opacity: selectedRating === 0 ? 0.5 : 1 }}>
                    {lang === 'ar' ? 'إرسال' : 'Submit'}
                  </button>
                  <button type="button" onClick={() => setShowRatingForm(null)} style={{ padding: '8px 14px', borderRadius: 10, border: '1px solid #d1d5db', background: '#fff', fontSize: 13 }}>{lang === 'ar' ? 'إلغاء' : 'Cancel'}</button>
                </div>
              </div>
            )}
          </div>

          <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #e5e7eb', padding: 20 }}>
            <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 10 }}>{t.history}</div>
            {orders === null && <div style={{ fontSize: 13, color: '#6b7280' }}>…</div>}
            {orders !== null && orders.length === 0 && (
              <div style={{ fontSize: 13, color: '#6b7280' }}>{t.noOrders}</div>
            )}
            {orders !== null && orders.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {orders.map((o) => (
                  <div key={o.id} style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontWeight: 700, fontSize: 13 }}>#{o.orderNumber}</span>
                      <span style={{ fontSize: 12, color: '#6b7280' }}>
                        {new Date(o.createdAt).toLocaleString(lang === 'ar' ? 'ar-EG' : undefined)}
                      </span>
                    </div>
                    <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>
                      {o.itemCount} {t.items} • {o.status}
                    </div>
                    <div style={{ fontWeight: 800, fontSize: 14, marginTop: 4 }}>
                      {new Intl.NumberFormat(lang === 'ar' ? 'ar-EG' : 'en-US', { style: 'currency', currency: branding.currency || 'USD' }).format(o.total)}
                    </div>
                    {o.status === 'COMPLETED' && (
                      <button type="button" onClick={() => { setShowRatingForm(o.id as string); setSelectedRating(0); setRatingFeedback(''); }}
                        style={{ marginTop: 4, padding: '4px 10px', borderRadius: 8, border: '1px solid #d1d5db', background: '#fff', fontSize: 11, cursor: 'pointer' }}>
                        {lang === 'ar' ? 'قيّم' : 'Rate'}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
            {/* Rating form */}
            {showRatingForm && (
              <div style={{ marginTop: 10, padding: 12, border: '1px solid #e5e7eb', borderRadius: 12, background: '#f9fafb' }}>
                <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
                  {[1,2,3,4,5].map(s => (
                    <button key={s} type="button"
                      onClick={() => setSelectedRating(s)}
                      onMouseEnter={() => setStarHover(s)}
                      onMouseLeave={() => setStarHover(0)}
                      style={{ fontSize: 24, border: 'none', background: 'none', cursor: 'pointer', color: (starHover || selectedRating) >= s ? '#f59e0b' : '#d1d5db', transition: 'color 0.1s' }}>
                      ★
                    </button>
                  ))}
                </div>
                <input placeholder={lang === 'ar' ? 'أضف تعليقاً (اختياري)' : 'Add feedback (optional)'}
                  value={ratingFeedback} onChange={(e) => setRatingFeedback(e.target.value)}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 10, border: '1px solid #d1d5db', fontSize: 13, marginBottom: 8, boxSizing: 'border-box' }} />
                <div style={{ display: 'flex', gap: 6 }}>
                  <button type="button" onClick={() => { createRating({ orderId: showRatingForm, rating: selectedRating, feedback: ratingFeedback || undefined }).then(() => { setShowRatingForm(null); listMyRatings().then(setRatings).catch(() => {}); }).catch(() => {}); }}
                    disabled={selectedRating === 0}
                    style={{ padding: '8px 14px', borderRadius: 10, border: 'none', background: branding.primaryColor, color: '#fff', fontSize: 13, fontWeight: 700, opacity: selectedRating === 0 ? 0.5 : 1 }}>
                    {lang === 'ar' ? 'إرسال' : 'Submit'}
                  </button>
                  <button type="button" onClick={() => setShowRatingForm(null)} style={{ padding: '8px 14px', borderRadius: 10, border: '1px solid #d1d5db', background: '#fff', fontSize: 13 }}>{lang === 'ar' ? 'إلغاء' : 'Cancel'}</button>
                </div>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => void signOut()}
            style={{ padding: '12px', borderRadius: 12, border: '1px solid #fecaca', background: '#fff', color: '#b91c1c', fontSize: 14, fontWeight: 700 }}
          >
            {t.signOut}
          </button>
        </div>
      )}
    </div>
  );
}

export default CustomerAccount;