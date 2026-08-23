'use client';

import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Badge,
  Button,
  ConfirmDialog,
  EmptyState,
  ErrorBanner,
  Field,
  LoadingRow,
  Modal,
  Select,
  TextInput,
} from '../ui/Primitives';
import { ApiError } from '../../lib/api-client';
import { discountsApi, type Discount } from '../../lib/resources';

/** AUDIT-009 — staff Discount codes. Existing types PERCENTAGE / FIXED_AMOUNT only. */

interface FormState {
  code: string;
  name: string;
  type: 'PERCENTAGE' | 'FIXED_AMOUNT';
  value: string;
  active: boolean;
  usageLimit: string;
}

const EMPTY: FormState = { code: '', name: '', type: 'PERCENTAGE', value: '', active: true, usageLimit: '' };

export function DiscountManager(): React.ReactElement {
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Discount | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [formError, setFormError] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<Discount | null>(null);

  const listQuery = useQuery({ queryKey: ['discounts'], queryFn: () => discountsApi.list() });
  const invalidate = (): void => {
    void queryClient.invalidateQueries({ queryKey: ['discounts'] });
  };

  const closeForm = (): void => {
    setCreating(false);
    setEditing(null);
    setForm(EMPTY);
    setFormError('');
  };

  const createMutation = useMutation({
    mutationFn: (payload: FormState) =>
      discountsApi.create({
        code: payload.code.trim(),
        name: payload.name.trim() || undefined,
        type: payload.type,
        value: Number(payload.value),
        active: payload.active,
        usageLimit: payload.usageLimit ? Number(payload.usageLimit) : undefined,
      }),
    onSuccess: () => {
      invalidate();
      closeForm();
    },
    onError: (error: Error) => setFormError(error.message),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: FormState }) =>
      discountsApi.update(id, {
        code: payload.code.trim(),
        name: payload.name.trim() || null,
        type: payload.type,
        value: Number(payload.value),
        active: payload.active,
        usageLimit: payload.usageLimit ? Number(payload.usageLimit) : null,
      }),
    onSuccess: () => {
      invalidate();
      closeForm();
    },
    onError: (error: Error) => setFormError(error.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => discountsApi.remove(id),
    onSuccess: () => {
      invalidate();
      setDeleteTarget(null);
    },
    onError: () => setDeleteTarget(null),
  });

  const rows = useMemo(() => listQuery.data ?? [], [listQuery.data]);
  const listError = listQuery.error as ApiError | null;
  const busy = createMutation.isPending || updateMutation.isPending;

  const submit = (event: React.FormEvent): void => {
    event.preventDefault();
    if (form.code.trim().length < 1 || Number(form.value) <= 0) {
      setFormError('Code and a positive value are required.');
      return;
    }
    if (editing) {
      updateMutation.mutate({ id: editing.id, payload: form });
    } else {
      createMutation.mutate(form);
    }
  };

  return (
    <section aria-labelledby="discounts-heading">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 id="discounts-heading" className="text-lg font-bold text-gray-900">Discounts</h2>
        {!listError ? (
          <Button variant="primary" onClick={() => { setForm(EMPTY); setFormError(''); setCreating(true); }}>
            + New code
          </Button>
        ) : null}
      </div>
      {listError ? <ErrorBanner message={listError.message} /> : null}
      {deleteMutation.error ? <ErrorBanner message={(deleteMutation.error as Error).message} /> : null}
      {listQuery.isLoading ? (
        <LoadingRow label="Loading discounts…" />
      ) : rows.length === 0 ? (
        <EmptyState message="No discount codes yet. Seeded SAVE10 / FIXED5 appear after a canonical seed." />
      ) : (
        <div className="overflow-x-auto rounded border border-gray-200 bg-white">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">Discount codes</caption>
            <thead className="bg-gray-50 text-[11px] uppercase tracking-wide text-gray-500">
              <tr>
                <th scope="col" className="px-3 py-2">Code</th>
                <th scope="col" className="px-3 py-2">Type</th>
                <th scope="col" className="px-3 py-2">Value</th>
                <th scope="col" className="px-3 py-2">Usage</th>
                <th scope="col" className="px-3 py-2">Status</th>
                <th scope="col" className="px-3 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((row) => (
                <tr key={row.id} data-testid={`discount-row-${row.id}`}>
                  <td className="px-3 py-2 font-medium text-gray-900">{row.code}</td>
                  <td className="px-3 py-2 text-gray-600">{row.type}</td>
                  <td className="px-3 py-2 tabular-nums text-gray-600">{String(row.value)}</td>
                  <td className="px-3 py-2 tabular-nums text-gray-600">
                    {row.usageCount}{row.usageLimit !== null ? ` / ${row.usageLimit}` : ''}
                  </td>
                  <td className="px-3 py-2">
                    {row.active ? <Badge tone="success">Active</Badge> : <Badge tone="warning">Inactive</Badge>}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex justify-end gap-1">
                      <Button
                        onClick={() => {
                          setForm({
                            code: row.code,
                            name: row.name ?? '',
                            type: row.type,
                            value: String(row.value),
                            active: row.active,
                            usageLimit: row.usageLimit != null ? String(row.usageLimit) : '',
                          });
                          setFormError('');
                          setEditing(row);
                        }}
                      >
                        Edit
                      </Button>
                      <Button variant="danger" onClick={() => setDeleteTarget(row)}>Delete</Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={creating || editing !== null} title={editing ? `Edit ${editing.code}` : 'New discount'} onClose={closeForm}>
        <form onSubmit={submit} className="flex flex-col gap-3" noValidate>
          {formError ? <ErrorBanner message={formError} /> : null}
          <Field label="Code" htmlFor="discount-code" required>
            <TextInput id="discount-code" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
          </Field>
          <Field label="Name" htmlFor="discount-name">
            <TextInput id="discount-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <Field label="Type" htmlFor="discount-type" required>
            <Select id="discount-type" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as FormState['type'] })}>
              <option value="PERCENTAGE">PERCENTAGE</option>
              <option value="FIXED_AMOUNT">FIXED_AMOUNT</option>
            </Select>
          </Field>
          <Field label="Value" htmlFor="discount-value" required>
            <TextInput id="discount-value" type="number" min="0.01" step="0.01" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} />
          </Field>
          <Field label="Usage limit" htmlFor="discount-limit">
            <TextInput id="discount-limit" type="number" min="1" value={form.usageLimit} onChange={(e) => setForm({ ...form, usageLimit: e.target.value })} />
          </Field>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
            Active
          </label>
          <div className="mt-2 flex justify-end gap-2">
            <Button variant="secondary" onClick={closeForm} disabled={busy}>Cancel</Button>
            <Button type="submit" variant="primary" disabled={busy}>{busy ? 'Saving…' : editing ? 'Save' : 'Create'}</Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Delete discount"
        body={deleteTarget ? `"${deleteTarget.code}" will be removed. Historical orders keep their stored discount amount (SetNull).` : ''}
        confirmLabel="Delete"
        busy={deleteMutation.isPending}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
      />
    </section>
  );
}
