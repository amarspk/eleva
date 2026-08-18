'use client';

import React, { useState, useEffect } from 'react';
import { api } from '../lib/api-client';

/**
 * Phase 4 — Welcome Offer settings (backoffice, staff only).
 *
 * Restaurant owner configures the first-order welcome discount.
 * Tenant-scoped. Reuses the existing api client for CRUD.
 */
export function WelcomeOfferSettings({ tenantId }: { tenantId: string }): React.ReactNode {
  const [enabled, setEnabled] = useState(false);
  const [discountType, setDiscountType] = useState<'PERCENTAGE' | 'FIXED'>('PERCENTAGE');
  const [discountValue, setDiscountValue] = useState('');
  const [minOrderAmount, setMinOrderAmount] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const cfg = await api.get<{ enabled: boolean; discountType: string; discountValue: number; minOrderAmount: number }>(
          '/api/v1/backoffice/promotions/welcome-offer',
        );
        setEnabled(cfg.enabled);
        setDiscountType(cfg.discountType as 'PERCENTAGE' | 'FIXED');
        setDiscountValue(String(cfg.discountValue ?? 0));
        setMinOrderAmount(String(cfg.minOrderAmount ?? 0));
      } catch { /* defaults */ }
      setLoading(false);
    })();
  }, [tenantId]);

  const save = async (): Promise<void> => {
    setSaving(true);
    setMsg(null);
    try {
      await api.put('/api/v1/backoffice/promotions/welcome-offer', {
        enabled,
        discountType,
        discountValue: parseFloat(discountValue) || 0,
        minOrderAmount: parseFloat(minOrderAmount) || 0,
      });
      setMsg('Offer saved.');
    } catch {
      setMsg('Failed to save.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="text-sm text-gray-500">Loading welcome offer settings…</div>;

  return (
    <div className="bg-white rounded-xl border p-4 space-y-4">
      <h3 className="font-bold">Welcome Offer — First Order Discount</h3>
      <p className="text-xs text-gray-500 mt-1">Configure a special discount for customers placing their first order.</p>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
        Enable welcome offer
      </label>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-semibold text-gray-600">Discount type</label>
          <select value={discountType} onChange={(e) => setDiscountType(e.target.value as 'PERCENTAGE' | 'FIXED')}
            className="w-full border rounded p-1.5 text-sm mt-1">
            <option value="PERCENTAGE">Percentage (%)</option>
            <option value="FIXED">Fixed amount</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-600">Value</label>
          <input type="number" step="0.01" min="0" value={discountValue}
            onChange={(e) => setDiscountValue(e.target.value)}
            className="w-full border rounded p-1.5 text-sm mt-1" placeholder="e.g. 10" />
          <p className="text-[10px] text-gray-400 mt-1">{discountType === 'PERCENTAGE' ? 'Percentage off (10 = 10%)' : 'Fixed amount discount'}</p>
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-600">Minimum order amount</label>
          <input type="number" step="0.01" min="0" value={minOrderAmount}
            onChange={(e) => setMinOrderAmount(e.target.value)}
            className="w-full border rounded p-1.5 text-sm mt-1" placeholder="e.g. 5" />
        </div>
      </div>

      <button type="button" onClick={() => void save()} disabled={saving}
        className="bg-blue-600 text-white px-4 py-1.5 rounded text-sm font-semibold hover:bg-blue-700 disabled:opacity-50">
        {saving ? 'Saving…' : 'Save'}
      </button>
      {msg && <p className="text-sm text-gray-600">{msg}</p>}
    </div>
  );
}

export default WelcomeOfferSettings;