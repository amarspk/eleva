'use client';

import React, { useState } from 'react';
import { api } from '../lib/api-client';

/**
 * Phase 4 — Wallet management (backoffice, staff only).
 *
 * Staff can look up a customer's wallet balance and history, and grant
 * store credit. Requires `read` and `update` Customer permissions.
 */
export function WalletManager({ tenantId: _tenantId }: { tenantId: string }): React.ReactNode {
  const [customerId, setCustomerId] = useState('');
  const [balance, setBalance] = useState<number | null>(null);
  const [transactions, setTransactions] = useState<Array<Record<string, unknown>> | null>(null);
  const [creditAmount, setCreditAmount] = useState('');
  const [creditDesc, setCreditDesc] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const lookup = async (): Promise<void> => {
    if (!customerId.trim()) {return;}
    setBusy(true); setMsg(null);
    try {
      const wallet = await api.get<{ balance: number; transactions: Array<Record<string, unknown>> | null }>(
        `/api/v1/backoffice/customers/${customerId.trim()}/wallet`,
      );
      setBalance(wallet.balance);
      setTransactions(wallet.transactions ?? []);
    } catch {
      setMsg('Customer not found or no wallet.');
      setBalance(null); setTransactions(null);
    } finally { setBusy(false); }
  };

  const grantCredit = async (): Promise<void> => {
    const amt = parseFloat(creditAmount);
    if (!amt || amt <= 0) {return;}
    setBusy(true); setMsg(null);
    try {
      const result = await api.post<{ balance: number }>(
        `/api/v1/backoffice/customers/${customerId.trim()}/wallet/credit`,
        { amount: amt, description: creditDesc || undefined },
      );
      setBalance(result.balance);
      setMsg(`Credit of ${amt} granted. New balance: ${result.balance}`);
      setCreditAmount('');
      setCreditDesc('');
    } catch {
      setMsg('Failed to grant credit.');
    } finally { setBusy(false); }
  };

  return (
    <div className="bg-white rounded-xl border p-4 space-y-4">
      <h3 className="font-bold">Customer Wallet</h3>
      <p className="text-xs text-gray-500">Manage customer store credit. Enter a customer UUID to view their wallet.</p>

      <div className="flex gap-2">
        <input type="text" value={customerId} onChange={(e) => setCustomerId(e.target.value)}
          placeholder="Customer UUID" className="flex-1 border rounded p-1.5 text-sm" />
        <button type="button" onClick={() => void lookup()} disabled={busy || !customerId.trim()}
          className="bg-blue-600 text-white px-3 py-1.5 rounded text-sm font-semibold hover:bg-blue-700 disabled:opacity-50">
          Look up
        </button>
      </div>

      {balance !== null && (
        <div className="border rounded-lg p-3 space-y-2 bg-gray-50">
          <div className="flex justify-between items-center">
            <span className="font-semibold text-sm">Balance</span>
            <span className="text-lg font-bold text-green-700">{balance.toFixed(2)}</span>
          </div>

          <div className="border-t pt-2 space-y-2">
            <input type="number" step="0.01" min="0.01" value={creditAmount}
              onChange={(e) => setCreditAmount(e.target.value)}
              placeholder="Credit amount" className="w-full border rounded p-1.5 text-sm" />
            <input type="text" value={creditDesc} onChange={(e) => setCreditDesc(e.target.value)}
              placeholder="Description (optional)" className="w-full border rounded p-1.5 text-sm" />
            <button type="button" onClick={() => void grantCredit()} disabled={busy || !parseFloat(creditAmount) || parseFloat(creditAmount) <= 0}
              className="bg-green-600 text-white px-3 py-1 rounded text-xs font-semibold hover:bg-green-700 disabled:opacity-50">
              Grant credit
            </button>
          </div>

          {transactions !== null && transactions.length > 0 && (
            <div className="border-t pt-2">
              <h4 className="text-xs font-semibold text-gray-600 mb-1">History</h4>
              <div className="max-h-40 overflow-auto space-y-1">
                {transactions.map((tx) => (
                  <div key={tx.id as string} className="flex justify-between text-xs border-b pb-1">
                    <span className="text-gray-500">{String(tx.type)} {tx.orderId ? `• #${String(tx.orderId).slice(-6)}` : ''}</span>
                    <span className={Number(tx.amount) < 0 ? 'text-red-600 font-medium' : 'text-green-600 font-medium'}>
                      {Number(tx.amount) < 0 ? '' : '+'}{Number(tx.amount).toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {msg && <p className="text-sm text-gray-600">{msg}</p>}
    </div>
  );
}

export default WalletManager;