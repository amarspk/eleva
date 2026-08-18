'use client';

import React, { useState, useEffect } from 'react';
import { api } from '../lib/api-client';

/**
 * Phase 4 — Loyalty rule settings (backoffice, staff only).
 *
 * Lets the restaurant manager configure the earn rate, minimum order amount,
 * minimum redeem points, and redeem rate. Settings are persisted as a single
 * LoyaltyRule record per tenant.
 */
export function LoyaltySettings({ tenantId }: { tenantId: string }): React.ReactNode {
  const [earnRate, setEarnRate] = useState('');
  const [earnMin, setEarnMin] = useState('');
  const [minRedeem, setMinRedeem] = useState('');
  const [redeemRate, setRedeemRate] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const rule = await api.get<{ earnRate: number; earnMinOrderAmount: number; minRedeemPoints: number; redeemRate: number }>(
          '/api/v1/backoffice/loyalty/rule',
        );
        setEarnRate(String(rule.earnRate ?? 0));
        setEarnMin(String(rule.earnMinOrderAmount ?? 0));
        setMinRedeem(String(rule.minRedeemPoints ?? 0));
        setRedeemRate(String(rule.redeemRate ?? 0));
      } catch {
        setEarnRate('0'); setEarnMin('0'); setMinRedeem('0'); setRedeemRate('0');
      }
    })();
  }, [tenantId]);

  const save = async (): Promise<void> => {
    setSaving(true);
    setMsg(null);
    try {
      await api.put('/api/v1/backoffice/loyalty/rule', {
        earnRate: parseFloat(earnRate) || 0,
        earnMinOrderAmount: parseFloat(earnMin) || 0,
        minRedeemPoints: parseInt(minRedeem) || 0,
        redeemRate: parseFloat(redeemRate) || 0,
      });
      setMsg('Loyalty settings saved.');
    } catch {
      setMsg('Failed to save.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-white rounded-xl border p-4 space-y-4">
      <h3 className="font-bold">Loyalty Settings</h3>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-semibold text-gray-600">Earn rate (points per currency unit)</label>
          <input type="number" step="0.01" min="0" value={earnRate} onChange={(e) => setEarnRate(e.target.value)}
            className="w-full border rounded p-1.5 text-sm mt-1" placeholder="e.g. 10" />
          <p className="text-[10px] text-gray-400 mt-1">Set to 0 to disable point earning.</p>
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-600">Minimum order amount to earn points</label>
          <input type="number" step="0.01" min="0" value={earnMin} onChange={(e) => setEarnMin(e.target.value)}
            className="w-full border rounded p-1.5 text-sm mt-1" placeholder="e.g. 5" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-600">Minimum redeem points</label>
          <input type="number" min="0" value={minRedeem} onChange={(e) => setMinRedeem(e.target.value)}
            className="w-full border rounded p-1.5 text-sm mt-1" placeholder="e.g. 50" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-600">Redeem rate (currency per point)</label>
          <input type="number" step="0.0001" min="0" value={redeemRate} onChange={(e) => setRedeemRate(e.target.value)}
            className="w-full border rounded p-1.5 text-sm mt-1" placeholder="e.g. 0.05" />
          <p className="text-[10px] text-gray-400 mt-1">1 point = X currency units.</p>
        </div>
      </div>

      <button
        type="button"
        onClick={() => void save()}
        disabled={saving}
        className="bg-blue-600 text-white px-4 py-1.5 rounded text-sm font-semibold hover:bg-blue-700 disabled:opacity-50"
      >
        {saving ? 'Saving…' : 'Save'}
      </button>

      {msg && <p className="text-sm text-gray-600">{msg}</p>}
    </div>
  );
}

export default LoyaltySettings;