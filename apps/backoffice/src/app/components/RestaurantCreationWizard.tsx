'use client';
/* eslint-disable @typescript-eslint/no-explicit-any, curly -- onboarding wizard uses dynamic form fields and concise one-liner conditionals */

import React, { useState, useEffect, useCallback } from 'react';

interface Plan {
  id: string;
  name: string;
  priceMonthly: number;
  priceYearly: number;
  maxBranches: number;
  maxRestaurants: number;
  maxProductsPerBranch: number;
  allowCustomDomains: boolean;
  allowOnlinePayments: boolean;
  allowAnalytics: boolean;
}

interface BranchDetails {
  name: string;
  address: string;
  phoneNumber: string;
  latitude?: number;
  longitude?: number;
  operatingHours?: Record<string, { open: string; close: string; closed: boolean }>;
}

interface WizardData {
  companyName: string;
  subdomain: string;
  ownerFirstName: string;
  ownerLastName: string;
  ownerEmail: string;
  ownerPassword: string;
  planId: string;
  restaurantName: string;
  currency: string;
  timezone: string;
  taxPercentage: number;
  branch: BranchDetails;
}

interface OnboardResult {
  tenant: { id: string; name: string; subdomain: string; status: string };
  owner: { id: string; email: string };
  restaurant: { id: string; name: string; currency: string; timezone: string };
  branch: { id: string; name: string };
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

const DEFAULT_OPERATING_HOURS: Record<string, { open: string; close: string; closed: boolean }> = {
  monday: { open: '09:00', close: '22:00', closed: false },
  tuesday: { open: '09:00', close: '22:00', closed: false },
  wednesday: { open: '09:00', close: '22:00', closed: false },
  thursday: { open: '09:00', close: '22:00', closed: false },
  friday: { open: '09:00', close: '23:00', closed: false },
  saturday: { open: '10:00', close: '23:00', closed: false },
  sunday: { open: '10:00', close: '21:00', closed: false },
};

const CURRENCIES = [
  { code: 'USD', label: 'US Dollar (USD)' },
  { code: 'EUR', label: 'Euro (EUR)' },
  { code: 'GBP', label: 'British Pound (GBP)' },
  { code: 'KWD', label: 'Kuwaiti Dinar (KWD)' },
  { code: 'BHD', label: 'Bahraini Dinar (BHD)' },
  { code: 'SAR', label: 'Saudi Riyal (SAR)' },
  { code: 'AED', label: 'UAE Dirham (AED)' },
  { code: 'QAR', label: 'Qatari Riyal (QAR)' },
  { code: 'OMR', label: 'Omani Rial (OMR)' },
];

const TIMEZONES = [
  'UTC',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Asia/Dubai',
  'Asia/Kuwait',
  'Asia/Riyadh',
  'Asia/Bahrain',
  'Asia/Qatar',
  'Asia/Muscat',
  'Asia/Tokyo',
  'Asia/Shanghai',
  'Asia/Singapore',
  'Australia/Sydney',
];

const STEPS = ['Company', 'Account', 'Plan', 'Restaurant', 'Review'] as const;
type StepKey = typeof STEPS[number];

const initialData: WizardData = {
  companyName: '',
  subdomain: '',
  ownerFirstName: '',
  ownerLastName: '',
  ownerEmail: '',
  ownerPassword: '',
  planId: '',
  restaurantName: '',
  currency: 'USD',
  timezone: 'UTC',
  taxPercentage: 0,
  branch: {
    name: 'Main Branch',
    address: '',
    phoneNumber: '',
    operatingHours: DEFAULT_OPERATING_HOURS,
  },
};

export const RestaurantCreationWizard: React.FC = () => {
  const [step, setStep] = useState<StepKey>('Company');
  const [data, setData] = useState<WizardData>(initialData);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<OnboardResult | null>(null);
  const [apiError, setApiError] = useState('');
  const [loadingPlans, setLoadingPlans] = useState(false);

  const stepIndex = STEPS.indexOf(step);

  useEffect(() => {
    const fetchPlans = async (): Promise<void> => {
      setLoadingPlans(true);
      try {
        const res = await fetch(`${API_BASE}/api/v1/tenants/plans`);
        if (res.ok) {
          const data = await res.json();
          setPlans(data);
        }
      } catch {
        // Plans will remain empty; user can still proceed with planId
      } finally {
        setLoadingPlans(false);
      }
    };
    fetchPlans();
  }, []);

  const updateField = useCallback(<K extends keyof WizardData>(field: K, value: WizardData[K]) => {
    setData((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => { const next = { ...prev }; delete next[field]; return next; });
  }, []);

  const updateBranch = useCallback(<K extends keyof BranchDetails>(field: K, value: BranchDetails[K]) => {
    setData((prev) => ({ ...prev, branch: { ...prev.branch, [field]: value } }));
    setErrors((prev) => { const next = { ...prev }; delete next[`branch.${field}`]; return next; });
  }, []);

  const autoSubdomain = useCallback((name: string) => {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 63);
  }, []);

  const validateStep = useCallback((s: StepKey): boolean => {
    const e: Record<string, string> = {};

    if (s === 'Company') {
      if (!data.companyName || data.companyName.length < 2) e.companyName = 'Company name must be at least 2 characters.';
      if (!data.subdomain || data.subdomain.length < 2) e.subdomain = 'Subdomain must be at least 2 characters.';
      if (data.subdomain && !/^[a-z0-9-]+$/.test(data.subdomain)) e.subdomain = 'Only lowercase letters, numbers, and hyphens.';
    }

    if (s === 'Account') {
      if (!data.ownerFirstName || data.ownerFirstName.length < 2) e.ownerFirstName = 'First name must be at least 2 characters.';
      if (!data.ownerLastName || data.ownerLastName.length < 2) e.ownerLastName = 'Last name must be at least 2 characters.';
      if (!data.ownerEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.ownerEmail)) e.ownerEmail = 'Valid email required.';
      if (!data.ownerPassword || data.ownerPassword.length < 8) e.ownerPassword = 'Password must be at least 8 characters.';
    }

    if (s === 'Plan') {
      if (!data.planId) e.planId = 'Please select a subscription plan.';
    }

    if (s === 'Restaurant') {
      if (!data.branch.address || data.branch.address.length < 5) e['branch.address'] = 'Branch address must be at least 5 characters.';
      if (!data.branch.phoneNumber) e['branch.phoneNumber'] = 'Phone number is required.';
    }

    setErrors(e);
    return Object.keys(e).length === 0;
  }, [data]);

  const nextStep = useCallback(() => {
    if (!validateStep(step)) return;
    const idx = STEPS.indexOf(step);
    if (idx < STEPS.length - 1) setStep(STEPS[idx + 1]);
  }, [step, validateStep]);

  const prevStep = useCallback(() => {
    const idx = STEPS.indexOf(step);
    if (idx > 0) setStep(STEPS[idx - 1]);
  }, [step]);

  const handleSubmit = useCallback(async () => {
    if (!validateStep(step)) return;
    setSubmitting(true);
    setApiError('');

    try {
      const payload: Record<string, unknown> = {
        companyName: data.companyName,
        subdomain: data.subdomain,
        ownerFirstName: data.ownerFirstName,
        ownerLastName: data.ownerLastName,
        ownerEmail: data.ownerEmail,
        ownerPassword: data.ownerPassword,
        planId: data.planId,
      };

      if (data.restaurantName) payload.restaurantName = data.restaurantName;
      if (data.currency !== 'USD') payload.currency = data.currency;
      if (data.timezone !== 'UTC') payload.timezone = data.timezone;
      if (data.taxPercentage > 0) payload.taxPercentage = data.taxPercentage;

      if (data.branch.name && data.branch.name !== 'Main Branch') {
        payload.branch = { ...data.branch };
      } else if (data.branch.address || data.branch.phoneNumber) {
        payload.branch = { ...data.branch };
      }

      const res = await fetch(`${API_BASE}/api/v1/tenants`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: 'Registration failed.' }));
        throw new Error(err.message || `HTTP ${res.status}`);
      }

      const onboardResult: OnboardResult = await res.json();
      setResult(onboardResult);

      // Auto-login: fetch JWT for the newly created owner
      try {
        const loginRes = await fetch(`${API_BASE}/api/v1/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: data.ownerEmail, password: data.ownerPassword }),
        });
        if (loginRes.ok) {
          const loginData = await loginRes.json();
          if (loginData.accessToken) {
            localStorage.setItem('accessToken', loginData.accessToken);
          }
          if (loginData.tenantId) {
            localStorage.setItem('tenantId', loginData.tenantId);
          }
        }
      } catch {
        // Login failure is non-blocking; user can log in manually
      }
    } catch (err) {
      setApiError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }, [data, step, validateStep]);

  if (result) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-lg p-8 max-w-lg w-full text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Restaurant Created!</h1>
          <p className="text-gray-600 mb-6">Your restaurant has been set up successfully.</p>
          <div className="bg-gray-50 rounded p-4 text-left text-sm space-y-2 mb-6">
            <p><span className="font-semibold">Restaurant:</span> {result.restaurant.name}</p>
            <p><span className="font-semibold">Subdomain:</span> {result.tenant.subdomain}.zayjar.com</p>
            <p><span className="font-semibold">Branch:</span> {result.branch.name}</p>
            <p><span className="font-semibold">Currency:</span> {result.restaurant.currency}</p>
            <p><span className="font-semibold">Status:</span> {result.tenant.status}</p>
          </div>
          <a
            href={`/`}
            className="inline-block bg-blue-600 text-white px-6 py-2 rounded font-semibold hover:bg-blue-700"
          >
            Go to Dashboard
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-lg p-6 max-w-2xl w-full">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Create Your Restaurant</h1>
        <p className="text-sm text-gray-500 mb-6">Set up your restaurant in a few steps.</p>

        {/* Step Indicator */}
        <div className="flex items-center mb-8">
          {STEPS.map((s, i) => (
            <React.Fragment key={s}>
              <div className="flex flex-col items-center">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold ${
                    i < stepIndex
                      ? 'bg-green-500 text-white'
                      : i === stepIndex
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-200 text-gray-500'
                  }`}
                >
                  {i < stepIndex ? '✓' : i + 1}
                </div>
                <span className="text-xs mt-1 text-gray-500">{s}</span>
              </div>
              {i < STEPS.length - 1 && (
                <div className={`flex-1 h-0.5 mx-2 ${i < stepIndex ? 'bg-green-500' : 'bg-gray-200'}`} />
              )}
            </React.Fragment>
          ))}
        </div>

        {apiError && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4 text-sm">
            {apiError}
          </div>
        )}

        {/* Step Content */}
        <div className="min-h-[320px]">
          {step === 'Company' && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold">Company Information</h2>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Company Name *</label>
                <input
                  type="text"
                  value={data.companyName}
                  onChange={(e) => {
                    updateField('companyName', e.target.value);
                    if (!data.subdomain || data.subdomain === autoSubdomain(data.companyName)) {
                      updateField('subdomain', autoSubdomain(e.target.value));
                    }
                  }}
                  className="w-full border rounded px-3 py-2 text-sm"
                  placeholder="e.g. Gourmet Burger Kitchen"
                />
                {errors.companyName && <p className="text-red-500 text-xs mt-1">{errors.companyName}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Subdomain *</label>
                <div className="flex items-center">
                  <input
                    type="text"
                    value={data.subdomain}
                    onChange={(e) => updateField('subdomain', e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                    className="flex-1 border rounded-l px-3 py-2 text-sm"
                    placeholder="your-restaurant"
                  />
                  <span className="bg-gray-100 border border-l-0 rounded-r px-3 py-2 text-sm text-gray-500">.zayjar.com</span>
                </div>
                {errors.subdomain && <p className="text-red-500 text-xs mt-1">{errors.subdomain}</p>}
              </div>
            </div>
          )}

          {step === 'Account' && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold">Owner Account</h2>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">First Name *</label>
                  <input
                    type="text"
                    value={data.ownerFirstName}
                    onChange={(e) => updateField('ownerFirstName', e.target.value)}
                    className="w-full border rounded px-3 py-2 text-sm"
                  />
                  {errors.ownerFirstName && <p className="text-red-500 text-xs mt-1">{errors.ownerFirstName}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Last Name *</label>
                  <input
                    type="text"
                    value={data.ownerLastName}
                    onChange={(e) => updateField('ownerLastName', e.target.value)}
                    className="w-full border rounded px-3 py-2 text-sm"
                  />
                  {errors.ownerLastName && <p className="text-red-500 text-xs mt-1">{errors.ownerLastName}</p>}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
                <input
                  type="email"
                  value={data.ownerEmail}
                  onChange={(e) => updateField('ownerEmail', e.target.value)}
                  className="w-full border rounded px-3 py-2 text-sm"
                  placeholder="owner@restaurant.com"
                />
                {errors.ownerEmail && <p className="text-red-500 text-xs mt-1">{errors.ownerEmail}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Password *</label>
                <input
                  type="password"
                  value={data.ownerPassword}
                  onChange={(e) => updateField('ownerPassword', e.target.value)}
                  className="w-full border rounded px-3 py-2 text-sm"
                  placeholder="Minimum 8 characters"
                />
                {errors.ownerPassword && <p className="text-red-500 text-xs mt-1">{errors.ownerPassword}</p>}
              </div>
            </div>
          )}

          {step === 'Plan' && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold">Subscription Plan</h2>
              {loadingPlans ? (
                <p className="text-gray-500 text-sm">Loading plans...</p>
              ) : plans.length === 0 ? (
                <div>
                  <p className="text-gray-500 text-sm mb-3">No plans available from API. Enter a Plan ID manually.</p>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Plan ID *</label>
                    <input
                      type="text"
                      value={data.planId}
                      onChange={(e) => updateField('planId', e.target.value)}
                      className="w-full border rounded px-3 py-2 text-sm"
                      placeholder="e.g. plan_starter_monthly"
                    />
                    {errors.planId && <p className="text-red-500 text-xs mt-1">{errors.planId}</p>}
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3">
                  {plans.map((plan) => (
                    <button
                      key={plan.id}
                      type="button"
                      onClick={() => updateField('planId', plan.id)}
                      className={`border rounded p-4 text-left transition ${
                        data.planId === plan.id
                          ? 'border-blue-600 bg-blue-50 ring-2 ring-blue-200'
                          : 'border-gray-200 hover:border-gray-400'
                      }`}
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="font-semibold">{plan.name}</p>
                          <p className="text-sm text-gray-500">
                            ${plan.priceMonthly}/mo &middot; {plan.maxBranches} branches &middot; {plan.maxProductsPerBranch} products/branch
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-bold text-lg">${plan.priceMonthly}</p>
                          <p className="text-xs text-gray-400">/month</p>
                        </div>
                      </div>
                      <div className="flex gap-2 mt-2">
                        {plan.allowOnlinePayments && <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded">Online Payments</span>}
                        {plan.allowCustomDomains && <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">Custom Domain</span>}
                        {plan.allowAnalytics && <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded">Analytics</span>}
                      </div>
                    </button>
                  ))}
                </div>
              )}
              {errors.planId && <p className="text-red-500 text-xs">{errors.planId}</p>}
            </div>
          )}

          {step === 'Restaurant' && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold">Restaurant Details</h2>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Restaurant Name</label>
                <input
                  type="text"
                  value={data.restaurantName}
                  onChange={(e) => updateField('restaurantName', e.target.value)}
                  className="w-full border rounded px-3 py-2 text-sm"
                  placeholder="Defaults to company name if empty"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Currency</label>
                  <select
                    value={data.currency}
                    onChange={(e) => updateField('currency', e.target.value)}
                    className="w-full border rounded px-3 py-2 text-sm"
                  >
                    {CURRENCIES.map((c) => (
                      <option key={c.code} value={c.code}>{c.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Timezone</label>
                  <select
                    value={data.timezone}
                    onChange={(e) => updateField('timezone', e.target.value)}
                    className="w-full border rounded px-3 py-2 text-sm"
                  >
                    {TIMEZONES.map((tz) => (
                      <option key={tz} value={tz}>{tz}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tax Rate (%)</label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={0.5}
                  value={data.taxPercentage}
                  onChange={(e) => updateField('taxPercentage', parseFloat(e.target.value) || 0)}
                  className="w-full border rounded px-3 py-2 text-sm"
                />
              </div>
              <hr className="my-2" />
              <h3 className="font-semibold text-sm">Primary Branch</h3>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Branch Name</label>
                <input
                  type="text"
                  value={data.branch.name}
                  onChange={(e) => updateBranch('name', e.target.value)}
                  className="w-full border rounded px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Address *</label>
                <input
                  type="text"
                  value={data.branch.address}
                  onChange={(e) => updateBranch('address', e.target.value)}
                  className="w-full border rounded px-3 py-2 text-sm"
                  placeholder="Full street address"
                />
                {errors['branch.address'] && <p className="text-red-500 text-xs mt-1">{errors['branch.address']}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Phone Number *</label>
                <input
                  type="tel"
                  value={data.branch.phoneNumber}
                  onChange={(e) => updateBranch('phoneNumber', e.target.value)}
                  className="w-full border rounded px-3 py-2 text-sm"
                  placeholder="+15550123456"
                />
                {errors['branch.phoneNumber'] && <p className="text-red-500 text-xs mt-1">{errors['branch.phoneNumber']}</p>}
              </div>
            </div>
          )}

          {step === 'Review' && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold">Review & Confirm</h2>
              <div className="bg-gray-50 rounded p-4 space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Company</span>
                  <span className="font-medium">{data.companyName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Subdomain</span>
                  <span className="font-medium">{data.subdomain}.zayjar.com</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Owner</span>
                  <span className="font-medium">{data.ownerFirstName} {data.ownerLastName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Email</span>
                  <span className="font-medium">{data.ownerEmail}</span>
                </div>
                <hr />
                <div className="flex justify-between">
                  <span className="text-gray-500">Plan</span>
                  <span className="font-medium">{plans.find((p) => p.id === data.planId)?.name || data.planId}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Restaurant</span>
                  <span className="font-medium">{data.restaurantName || data.companyName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Currency</span>
                  <span className="font-medium">{data.currency}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Timezone</span>
                  <span className="font-medium">{data.timezone}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Tax Rate</span>
                  <span className="font-medium">{data.taxPercentage}%</span>
                </div>
                <hr />
                <div className="flex justify-between">
                  <span className="text-gray-500">Branch</span>
                  <span className="font-medium">{data.branch.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Address</span>
                  <span className="font-medium text-right max-w-[60%]">{data.branch.address || 'Not provided'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Phone</span>
                  <span className="font-medium">{data.branch.phoneNumber || 'Not provided'}</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Navigation */}
        <div className="flex justify-between mt-6 pt-4 border-t">
          <button
            type="button"
            onClick={prevStep}
            disabled={stepIndex === 0}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Back
          </button>
          {stepIndex < STEPS.length - 1 ? (
            <button
              type="button"
              onClick={nextStep}
              className="px-6 py-2 text-sm font-medium text-white bg-blue-600 rounded hover:bg-blue-700"
            >
              Next
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting}
              className="px-6 py-2 text-sm font-medium text-white bg-green-600 rounded hover:bg-green-700 disabled:opacity-50"
            >
              {submitting ? 'Creating...' : 'Create Restaurant'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
