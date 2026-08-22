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
  TextInput,
} from '../ui/Primitives';
import { ApiError } from '../../lib/api-client';
import { restaurantsApi, type Restaurant } from '../../lib/resources';

/**
 * Restaurant brand management (AUDIT-008).
 *
 * Wired endpoints:
 *   GET    /api/v1/restaurants[?includeDeleted]
 *   POST   /api/v1/restaurants
 *   PUT    /api/v1/restaurants/:id
 *   DELETE /api/v1/restaurants/:id
 *   POST   /api/v1/restaurants/:id/restore
 */

interface RestaurantFormState {
  name: string;
  currency: string;
  timezone: string;
  taxPercentage: string;
}

const EMPTY_FORM: RestaurantFormState = {
  name: '',
  currency: 'USD',
  timezone: 'UTC',
  taxPercentage: '0',
};

function toFormState(row: Restaurant): RestaurantFormState {
  return {
    name: row.name,
    currency: row.currency,
    timezone: row.timezone,
    taxPercentage: String(row.taxPercentage ?? 0),
  };
}

function validateForm(form: RestaurantFormState): Record<string, string> {
  const errors: Record<string, string> = {};
  if (form.name.trim().length < 2) {
    errors.name = 'Name must be at least 2 characters.';
  }
  if (form.currency.trim().length !== 3) {
    errors.currency = 'Currency must be a 3-letter code.';
  }
  if (!form.timezone.trim()) {
    errors.timezone = 'Timezone is required.';
  }
  const tax = Number(form.taxPercentage);
  if (Number.isNaN(tax) || tax < 0 || tax > 100) {
    errors.taxPercentage = 'Tax must be between 0 and 100.';
  }
  return errors;
}

export function RestaurantsModule(): React.ReactElement {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [view, setView] = useState<'active' | 'archived'>('active');
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Restaurant | null>(null);
  const [form, setForm] = useState<RestaurantFormState>(EMPTY_FORM);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');
  const [archiveTarget, setArchiveTarget] = useState<Restaurant | null>(null);

  const listQuery = useQuery({
    queryKey: ['restaurants', view],
    queryFn: () => restaurantsApi.list(view === 'archived'),
  });

  const invalidate = (): void => {
    void queryClient.invalidateQueries({ queryKey: ['restaurants'] });
  };

  const closeForm = (): void => {
    setCreating(false);
    setEditing(null);
    setForm(EMPTY_FORM);
    setFieldErrors({});
    setFormError('');
  };

  const createMutation = useMutation({
    mutationFn: (payload: RestaurantFormState) =>
      restaurantsApi.create({
        name: payload.name.trim(),
        currency: payload.currency.trim(),
        timezone: payload.timezone.trim(),
        taxPercentage: Number(payload.taxPercentage),
      }),
    onSuccess: () => {
      invalidate();
      closeForm();
    },
    onError: (error: Error) => setFormError(error.message),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: RestaurantFormState }) =>
      restaurantsApi.update(id, {
        name: payload.name.trim(),
        currency: payload.currency.trim(),
        timezone: payload.timezone.trim(),
        taxPercentage: Number(payload.taxPercentage),
      }),
    onSuccess: () => {
      invalidate();
      closeForm();
    },
    onError: (error: Error) => setFormError(error.message),
  });

  const archiveMutation = useMutation({
    mutationFn: (id: string) => restaurantsApi.remove(id),
    onSuccess: () => {
      invalidate();
      setArchiveTarget(null);
    },
    onError: () => setArchiveTarget(null),
  });

  const restoreMutation = useMutation({
    mutationFn: (id: string) => restaurantsApi.restore(id),
    onSuccess: invalidate,
  });

  const rows = useMemo<Restaurant[]>(() => listQuery.data ?? [], [listQuery.data]);
  const visible = useMemo(() => {
    const scoped = view === 'archived' ? rows.filter((r) => r.deletedAt !== null) : rows;
    const needle = search.trim().toLowerCase();
    const filtered = needle ? scoped.filter((r) => r.name.toLowerCase().includes(needle)) : scoped;
    return [...filtered].sort((a, b) => a.name.localeCompare(b.name));
  }, [rows, search, view]);

  const submitForm = (event: React.FormEvent): void => {
    event.preventDefault();
    const errors = validateForm(form);
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      return;
    }
    setFormError('');
    if (editing) {
      updateMutation.mutate({ id: editing.id, payload: form });
    } else {
      createMutation.mutate(form);
    }
  };

  const mutationBusy = createMutation.isPending || updateMutation.isPending;
  const listError = listQuery.error as ApiError | null;

  return (
    <section aria-labelledby="restaurants-heading">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 id="restaurants-heading" className="text-lg font-bold text-gray-900">
          Restaurants
        </h2>
        {view === 'active' && !listError ? (
          <Button
            variant="primary"
            onClick={() => {
              setForm(EMPTY_FORM);
              setFieldErrors({});
              setFormError('');
              setCreating(true);
            }}
          >
            + New restaurant
          </Button>
        ) : null}
      </div>

      <div className="mb-4 flex flex-wrap gap-3">
        <div className="min-w-[200px] flex-1">
          <label htmlFor="restaurant-search" className="sr-only">
            Search restaurants
          </label>
          <TextInput
            id="restaurant-search"
            placeholder="Search by name…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div
          className="inline-flex overflow-hidden rounded border border-gray-300"
          role="group"
          aria-label="Restaurant view"
        >
          {(['active', 'archived'] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setView(mode)}
              aria-pressed={view === mode}
              className={`px-3 py-1.5 text-sm font-medium capitalize ${
                view === mode ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              {mode}
            </button>
          ))}
        </div>
      </div>

      {listError ? <ErrorBanner message={listError.message} /> : null}
      {archiveMutation.error ? <ErrorBanner message={(archiveMutation.error as Error).message} /> : null}
      {restoreMutation.error ? <ErrorBanner message={(restoreMutation.error as Error).message} /> : null}

      {listQuery.isLoading ? (
        <LoadingRow label="Loading restaurants…" />
      ) : visible.length === 0 ? (
        <EmptyState
          message={
            search
              ? 'No restaurants match your search.'
              : view === 'archived'
                ? 'No archived restaurants.'
                : 'No restaurant brands yet.'
          }
        />
      ) : (
        <div className="overflow-x-auto rounded border border-gray-200 bg-white">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">Restaurant brands</caption>
            <thead className="bg-gray-50 text-[11px] uppercase tracking-wide text-gray-500">
              <tr>
                <th scope="col" className="px-3 py-2">Name</th>
                <th scope="col" className="px-3 py-2">Currency</th>
                <th scope="col" className="px-3 py-2">Timezone</th>
                <th scope="col" className="px-3 py-2">Tax %</th>
                <th scope="col" className="px-3 py-2">Status</th>
                <th scope="col" className="px-3 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {visible.map((row) => (
                <tr key={row.id} data-testid={`restaurant-row-${row.id}`}>
                  <td className="px-3 py-2 font-medium text-gray-900">{row.name}</td>
                  <td className="px-3 py-2 text-gray-600">{row.currency}</td>
                  <td className="px-3 py-2 text-gray-600">{row.timezone}</td>
                  <td className="px-3 py-2 tabular-nums text-gray-600">{String(row.taxPercentage)}</td>
                  <td className="px-3 py-2">
                    {row.deletedAt ? <Badge tone="danger">Archived</Badge> : <Badge tone="success">Active</Badge>}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex justify-end gap-1">
                      {view === 'archived' ? (
                        <Button
                          variant="primary"
                          onClick={() => restoreMutation.mutate(row.id)}
                          disabled={restoreMutation.isPending}
                        >
                          Restore
                        </Button>
                      ) : (
                        <>
                          <Button onClick={() => { setForm(toFormState(row)); setFieldErrors({}); setFormError(''); setEditing(row); }}>
                            Edit
                          </Button>
                          <Button variant="danger" onClick={() => setArchiveTarget(row)}>
                            Archive
                          </Button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={creating || editing !== null} title={editing ? `Edit ${editing.name}` : 'New restaurant'} onClose={closeForm}>
        <form onSubmit={submitForm} className="flex flex-col gap-3" noValidate>
          {formError ? <ErrorBanner message={formError} /> : null}
          <Field label="Name" htmlFor="restaurant-name" required error={fieldErrors.name}>
            <TextInput id="restaurant-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <Field label="Currency" htmlFor="restaurant-currency" required error={fieldErrors.currency}>
            <TextInput id="restaurant-currency" value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} />
          </Field>
          <Field label="Timezone" htmlFor="restaurant-timezone" required error={fieldErrors.timezone}>
            <TextInput id="restaurant-timezone" value={form.timezone} onChange={(e) => setForm({ ...form, timezone: e.target.value })} />
          </Field>
          <Field label="Tax %" htmlFor="restaurant-tax" required error={fieldErrors.taxPercentage}>
            <TextInput id="restaurant-tax" type="number" min="0" max="100" value={form.taxPercentage} onChange={(e) => setForm({ ...form, taxPercentage: e.target.value })} />
          </Field>
          <div className="mt-2 flex justify-end gap-2">
            <Button variant="secondary" onClick={closeForm} disabled={mutationBusy}>Cancel</Button>
            <Button type="submit" variant="primary" disabled={mutationBusy}>
              {mutationBusy ? 'Saving…' : editing ? 'Save changes' : 'Create restaurant'}
            </Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={archiveTarget !== null}
        title="Archive restaurant"
        body={
          archiveTarget
            ? `"${archiveTarget.name}" will be archived. Live branches must be archived first. Order history is preserved.`
            : ''
        }
        confirmLabel="Archive"
        busy={archiveMutation.isPending}
        onCancel={() => setArchiveTarget(null)}
        onConfirm={() => archiveTarget && archiveMutation.mutate(archiveTarget.id)}
      />
    </section>
  );
}
