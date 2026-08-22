'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { CustomerReceipt, DEFAULT_RECEIPT_CONFIG, resolveReceiptConfig } from '@zayjar/receipts';
import type { ReceiptConfig, ReceiptData } from '@zayjar/receipts';
import { designsApi } from '../lib/resources';
import type { DesignData } from '../lib/resources';
import { api } from '../lib/api-client';

/**
 * Phase 4 P3 — Receipt Designer.
 *
 * Lets the restaurant owner customize the customer receipt (field visibility,
 * footer message, language) and preview it live against the tenant's most
 * recent REAL order — never mock data. Settings are stored inside the existing
 * TenantDesign JSONB (`draft.receipt` → `published.receipt` on publish) via the
 * existing draft/save/publish/version flow — no new tables, no new systems.
 */

interface PreviewOrder {
  id: string;
  orderNumber: string;
}

function useDebouncedSave(value: unknown, onSave: (v: unknown) => void | Promise<void>, delay = 900, enabled = true): void {
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const onSaveRef = useRef(onSave);
  useEffect(() => { onSaveRef.current = onSave; }, [onSave]);
  useEffect(() => {
    if (timerRef.current) {clearTimeout(timerRef.current);}
    if (!enabled) {return;}
    timerRef.current = setTimeout(() => { void onSaveRef.current(value); }, delay);
    return (): void => { if (timerRef.current) {clearTimeout(timerRef.current);} };
  }, [value, delay, enabled]);
}

const FIELD_LABELS: Array<{ key: keyof ReceiptConfig; label: string; hint: string }> = [
  { key: 'showLogo', label: 'Show logo', hint: 'Restaurant logo on the header' },
  { key: 'showBranchInfo', label: 'Show branch info', hint: 'Branch name, address, phone' },
  { key: 'showOrderNumber', label: 'Show order number', hint: 'Order # on the receipt' },
  { key: 'showDateTime', label: 'Show date & time', hint: 'Order timestamp' },
  { key: 'showDiscounts', label: 'Show discounts', hint: 'Discount line when applied' },
  { key: 'showPayment', label: 'Show payment method', hint: 'Cash / card / wallet' },
  { key: 'showNotes', label: 'Show order notes', hint: 'Special instructions' },
];

export function ReceiptDesigner({ tenantId }: { tenantId: string }): React.ReactNode {
  const [config, setConfig] = useState<ReceiptConfig>(DEFAULT_RECEIPT_CONFIG);
  const [loaded, setLoaded] = useState(false);
  const [saveState, setSaveState] = useState<'loading' | 'dirty' | 'saving' | 'saved' | 'error'>('loading');
  const [publishing, setPublishing] = useState(false);
  const [preview, setPreview] = useState<ReceiptData | null>(null);
  const [previewStatus, setPreviewStatus] = useState<'loading' | 'ready' | 'empty' | 'error'>('loading');
  const [previewOrder, setPreviewOrder] = useState<PreviewOrder | null>(null);

  /* Load the tenant's design draft (existing flow). */
  useEffect(() => {
    (async (): Promise<void> => {
      try {
        const design = await designsApi.get(tenantId);
        const draft = design.draft as DesignData;
        const persisted = (draft.receipt as Record<string, unknown> | undefined) ?? undefined;
        setConfig(resolveReceiptConfig(persisted));
      } catch {
        setSaveState('error');
      } finally {
        setLoaded(true);
        setSaveState('saved');
      }
    })();
  }, [tenantId]);

  /* Save the receipt config into the draft (existing saveDraft flow). */
  const save = useCallback(async (next: ReceiptConfig): Promise<void> => {
    try {
      setSaveState('saving');
      const design = await designsApi.get(tenantId);
      const draft = { ...(design.draft as DesignData), receipt: { ...next } };
      await designsApi.saveDraft(tenantId, draft);
      setSaveState('saved');
    } catch {
      setSaveState('error');
    }
  }, [tenantId]);

  useDebouncedSave(loaded ? config : null, (v) => save(v as ReceiptConfig), 900, loaded);

  const update = (patch: Partial<ReceiptConfig>): void => {
    setSaveState('dirty');
    setConfig(prev => ({ ...prev, ...patch }));
  };

  /* Live preview against the tenant's most recent REAL order. */
  useEffect(() => {
    (async (): Promise<void> => {
      setPreviewStatus('loading');
      try {
        const orders = await api.get<Array<{ id: string; orderNumber: string; createdAt: string }>>('/api/v1/orders');
        const latest = orders
          .filter(o => o.id)
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
        if (!latest) {
          setPreviewStatus('empty');
          return;
        }
        setPreviewOrder({ id: latest.id, orderNumber: latest.orderNumber });
        const data = await api.get<ReceiptData>(`/api/v1/orders/${latest.id}/receipt`);
        setPreview(data);
        setPreviewStatus('ready');
      } catch {
        setPreviewStatus('error');
      }
    })();
  }, [tenantId]);

  const publish = async (): Promise<void> => {
    if (publishing) {return;}
    setPublishing(true);
    try {
      if (saveState !== 'saved') {
        await save(config);
      }
      await designsApi.publish(tenantId);
      setSaveState('saved');
    } catch {
      setSaveState('error');
    } finally {
      setPublishing(false);
    }
  };

  /* Preview data always reflects the DRAFT config (live while editing). */
  const previewData: ReceiptData | null = preview ? { ...preview, config } : null;

  return (
    <div className="flex flex-col lg:flex-row gap-4">
      {/* Controls */}
      <div className="w-full lg:w-[340px] bg-white rounded-xl border p-4 space-y-4 shrink-0">
        <div className="flex items-center justify-between">
          <h3 className="font-bold">Receipt Designer</h3>
          <span className="text-xs text-gray-500">
            {{ loading: 'Loading…', dirty: 'Unsaved changes', saving: 'Saving…', saved: 'Saved', error: 'Save failed' }[saveState]}
          </span>
        </div>

        <div>
          <label className="text-xs font-semibold text-gray-600 block mb-1">Receipt language</label>
          <div className="flex gap-1">
            {(['en', 'ar'] as const).map(lang => (
              <button
                key={lang}
                type="button"
                onClick={() => update({ language: lang })}
                className={`px-3 py-1 rounded text-xs capitalize ${config.language === lang ? 'bg-black text-white border-black' : 'border'}`}
              >
                {lang === 'en' ? 'English' : 'العربية'}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <h4 className="text-xs font-semibold text-gray-600">Fields</h4>
          {FIELD_LABELS.map(f => (
            <label key={f.key} className="flex items-center gap-2 text-xs cursor-pointer" title={f.hint}>
              <input
                type="checkbox"
                checked={config[f.key] as boolean}
                onChange={(e) => update({ [f.key]: e.target.checked } as Partial<ReceiptConfig>)}
              />
              <span className="text-gray-700">{f.label}</span>
            </label>
          ))}
        </div>

        <div>
          <label htmlFor="footer" className="text-xs font-semibold text-gray-600 block mb-1">Footer message</label>
          <input
            id="footer"
            type="text"
            value={config.footerMessage}
            onChange={(e) => update({ footerMessage: e.target.value })}
            className="w-full border rounded p-1.5 text-xs"
            placeholder="Thank you for your order!"
          />
        </div>

        <button
          type="button"
          onClick={() => void publish()}
          disabled={publishing}
          className="w-full bg-blue-600 text-white py-2 rounded text-xs font-semibold hover:bg-blue-700 disabled:opacity-50"
        >
          {publishing ? 'Publishing…' : 'Publish receipt settings'}
        </button>
        <p className="text-[10px] text-gray-400 leading-relaxed">
          Settings are saved to the design draft automatically and become live on the printed
          receipt after publishing. Kitchen tickets are printed independently.
        </p>
      </div>

      {/* Live preview */}
      <div className="flex-1 bg-slate-100 rounded-xl border p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold text-sm">Live preview</h3>
          {previewOrder && (
            <span className="text-[10px] text-gray-500">Real order #{previewOrder.orderNumber}</span>
          )}
        </div>
        {previewStatus === 'loading' && (
          <p className="text-sm text-gray-500">Loading a real order for preview…</p>
        )}
        {previewStatus === 'empty' && (
          <p className="text-sm text-gray-500">
            No orders yet — the preview will appear here once your first order is placed.
          </p>
        )}
        {previewStatus === 'error' && (
          <p className="text-sm text-gray-500">
            Could not load a real order for preview. Check that you have orders and try again.
          </p>
        )}
        {previewData && <CustomerReceipt data={previewData} />}
      </div>
    </div>
  );
}

export default ReceiptDesigner;