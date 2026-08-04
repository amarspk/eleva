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
import {
  tablesApi,
  branchesApi,
  type RestaurantTable,
  type Branch,
  type TableStatus,
} from '../../lib/resources';
import {
  EMPTY_TABLE_FORM,
  validateTableForm,
  type TableFormState,
  TABLE_STATUSES,
} from '../../lib/table-validation';

/**
 * Tables management (AUDIT-014 Phase 2 module 4).
 *
 * Full CRUD: list (filter by branch), create, edit (only seatingCapacity + status),
 * archive (soft delete), archive view and restore.
 *
 * Wired endpoints:
 *   GET    /api/v1/tables[?branchId][&includeDeleted]
 *   POST   /api/v1/tables
 *   PUT    /api/v1/tables/:id
 *   DELETE /api/v1/tables/:id          (soft delete)
 *   POST   /api/v1/tables/:id/restore
 *
 * branchId + number are IMMUTABLE (deterministic QR HMAC of tenantId:branchId:number).
 * QR token is surfaced read-only + copyable.
 * 409 when table has orders in progress (exact count in message).
 * seatingCapacity and status are the only editable fields on update.
 */

function toFormState(table: RestaurantTable): TableFormState {
  return {
    branchId: table.branchId,
    number: table.number,
    seatingCapacity: String(table.seatingCapacity),
    status: table.status,
  };
}

export function TablesModule(): React.ReactElement {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [view, setView] = useState<'active' | 'archived'>('active');
  const [selectedBranchId, setSelectedBranchId] = useState<string>('');
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<RestaurantTable | null>(null);
  const [form, setForm] = useState<TableFormState>(EMPTY_TABLE_FORM);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');
  const [archiveTarget, setArchiveTarget] = useState<RestaurantTable | null>(null);

  const branchesQuery = useQuery({
    queryKey: ['branches'],
    queryFn: () => branchesApi.list(),
  });

  const tablesQuery = useQuery({
    queryKey: ['tables', view, selectedBranchId],
    queryFn: () => tablesApi.list(selectedBranchId || undefined, view === 'archived'),
  });

  const invalidate = (): void => {
    void queryClient.invalidateQueries({ queryKey: ['tables'] });
  };

  const closeForm = (): void => {
    setCreating(false);
    setEditing(null);
    setForm(EMPTY_TABLE_FORM);
    setFieldErrors({});
    setFormError('');
  };

  const createMutation = useMutation({
    mutationFn: (payload: TableFormState) =>
      tablesApi.create({
        branchId: payload.branchId,
        number: payload.number.trim(),
        seatingCapacity: Number(payload.seatingCapacity),
      }),
    onSuccess: () => {
      invalidate();
      closeForm();
    },
    onError: (error: Error) => setFormError(error.message),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: TableFormState }) =>
      tablesApi.update(id, {
        seatingCapacity: Number(payload.seatingCapacity),
        status: payload.status,
      }),
    onSuccess: () => {
      invalidate();
      closeForm();
    },
    onError: (error: Error) => setFormError(error.message),
  });

  const archiveMutation = useMutation({
    mutationFn: (id: string) => tablesApi.remove(id),
    onSuccess: () => {
      invalidate();
      setArchiveTarget(null);
    },
    onError: () => setArchiveTarget(null),
  });

  const restoreMutation = useMutation({
    mutationFn: (id: string) => tablesApi.restore(id),
    onSuccess: invalidate,
  });

  const branchesData = branchesQuery.data;
  const branches = useMemo<Branch[]>(() => branchesData ?? [], [branchesData]);

  const tablesData = tablesQuery.data;
  const tables = useMemo<RestaurantTable[]>(() => tablesData ?? [], [tablesData]);

  const visible = useMemo(() => {
    let scoped = view === 'archived'
      ? tables.filter((t) => t.deletedAt !== null)
      : tables;

    // Client-side filter if branch selector active (backend already supports branchId)
    if (selectedBranchId) {
      scoped = scoped.filter((t) => t.branchId === selectedBranchId);
    }

    const needle = search.trim().toLowerCase();
    const filtered = needle
      ? scoped.filter(
          (t) =>
            t.number.toLowerCase().includes(needle) ||
            String(t.seatingCapacity).includes(needle) ||
            t.status.toLowerCase().includes(needle)
        )
      : scoped;

    return filtered;
  }, [tables, search, view, selectedBranchId]);

  const openCreate = (): void => {
    const defaultBranch = branches[0]?.id ?? '';
    setForm({ ...EMPTY_TABLE_FORM, branchId: defaultBranch });
    setFieldErrors({});
    setFormError('');
    setCreating(true);
  };

  const openEdit = (table: RestaurantTable): void => {
    setForm(toFormState(table));
    setFieldErrors({});
    setFormError('');
    setEditing(table);
  };

  const submitForm = (event: React.FormEvent): void => {
    event.preventDefault();
    const mode = editing ? 'edit' : 'create';
    const errors = validateTableForm(form, mode);
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
  const listError = tablesQuery.error as ApiError | null;
  const branchesError = branchesQuery.error as ApiError | null;

  const copyQr = async (token: string): Promise<void> => {
    try {
      await navigator.clipboard.writeText(token);
      // Non-blocking toast-like UX: brief console + could be upgraded later
      // For now we rely on the fact that the token is also shown inline.
    } catch {
      // Clipboard may be blocked; the value is still visible in the table for manual copy
    }
  };

  return (
    <section aria-labelledby="tables-heading">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 id="tables-heading" className="text-lg font-bold text-gray-900">
          Tables
        </h2>
        {view === 'active' && !listError && !branchesError ? (
          <Button
            variant="primary"
            onClick={openCreate}
            disabled={branches.length === 0}
          >
            + New table
          </Button>
        ) : null}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="min-w-[200px] flex-1">
          <label htmlFor="table-search" className="sr-only">
            Search tables
          </label>
          <TextInput
            id="table-search"
            placeholder="Search by number, capacity or status…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="min-w-[160px]">
          <Select
            value={selectedBranchId}
            onChange={(e) => setSelectedBranchId(e.target.value)}
            aria-label="Filter by branch"
          >
            <option value="">All branches</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </Select>
        </div>

        <div
          className="inline-flex overflow-hidden rounded border border-gray-300"
          role="group"
          aria-label="Table view"
        >
          {(['active', 'archived'] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setView(mode)}
              aria-pressed={view === mode}
              className={`px-3 py-1.5 text-sm font-medium capitalize ${
                view === mode
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              {mode}
            </button>
          ))}
        </div>
      </div>

      {branchesError ? <ErrorBanner message={branchesError.message} /> : null}
      {branches.length === 0 && !branchesQuery.isLoading && !branchesError ? (
        <ErrorBanner message="No branches found — create a branch before adding tables." />
      ) : null}
      {listError ? <ErrorBanner message={listError.message} /> : null}
      {archiveMutation.error ? (
        <ErrorBanner message={(archiveMutation.error as Error).message} />
      ) : null}
      {restoreMutation.error ? (
        <ErrorBanner message={(restoreMutation.error as Error).message} />
      ) : null}

      {tablesQuery.isLoading ? (
        <LoadingRow label="Loading tables…" />
      ) : visible.length === 0 ? (
        <EmptyState
          message={
            search
              ? 'No tables match your search.'
              : view === 'archived'
                ? 'No archived tables.'
                : selectedBranchId
                  ? 'No tables for the selected branch.'
                  : 'No tables yet.'
          }
        />
      ) : (
        <div className="overflow-x-auto rounded border border-gray-200 bg-white">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">Tables</caption>
            <thead className="bg-gray-50 text-[11px] uppercase tracking-wide text-gray-500">
              <tr>
                <th scope="col" className="px-3 py-2">Number</th>
                <th scope="col" className="px-3 py-2">Branch</th>
                <th scope="col" className="px-3 py-2">Seats</th>
                <th scope="col" className="px-3 py-2">Status</th>
                <th scope="col" className="px-3 py-2">QR Token</th>
                <th scope="col" className="px-3 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {visible.map((table) => {
                const branchName =
                  branches.find((b) => b.id === table.branchId)?.name ?? '—';
                return (
                  <tr key={table.id} data-testid={`table-row-${table.id}`}>
                    <td className="px-3 py-2 font-medium text-gray-900">{table.number}</td>
                    <td className="px-3 py-2 text-gray-600">{branchName}</td>
                    <td className="px-3 py-2 text-gray-600">{table.seatingCapacity}</td>
                    <td className="px-3 py-2">
                      {table.deletedAt ? (
                        <Badge tone="danger">Archived</Badge>
                      ) : (
                        <Badge tone={table.status === 'VACANT' ? 'success' : 'warning'}>
                          {table.status}
                        </Badge>
                      )}
                    </td>
                    <td className="px-3 py-2 font-mono text-[11px] text-gray-500">
                      <span className="inline-block max-w-[160px] truncate align-middle">
                        {table.qrCodeToken}
                      </span>
                      <Button
                        variant="ghost"
                        className="ml-1 px-1.5 py-0.5 text-[10px]"
                        onClick={() => copyQr(table.qrCodeToken)}
                        title="Copy QR token"
                      >
                        Copy
                      </Button>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex justify-end gap-1">
                        {view === 'archived' ? (
                          <Button
                            variant="primary"
                            onClick={() => restoreMutation.mutate(table.id)}
                            disabled={restoreMutation.isPending}
                          >
                            Restore
                          </Button>
                        ) : (
                          <>
                            <Button onClick={() => openEdit(table)}>Edit</Button>
                            <Button
                              variant="danger"
                              onClick={() => setArchiveTarget(table)}
                            >
                              Archive
                            </Button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        open={creating || editing !== null}
        title={editing ? `Edit table ${editing.number}` : 'New table'}
        onClose={closeForm}
      >
        <form onSubmit={submitForm} className="flex flex-col gap-3" noValidate>
          {formError ? <ErrorBanner message={formError} /> : null}

          {editing ? null : (
            <Field
              label="Branch"
              htmlFor="table-branch"
              required
              error={fieldErrors.branchId}
            >
              <Select
                id="table-branch"
                value={form.branchId}
                onChange={(e) => setForm({ ...form, branchId: e.target.value })}
              >
                <option value="">Select a branch…</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </Select>
            </Field>
          )}

          {editing ? null : (
            <Field label="Table number" htmlFor="table-number" required error={fieldErrors.number}>
              <TextInput
                id="table-number"
                value={form.number}
                onChange={(e) => setForm({ ...form, number: e.target.value })}
                placeholder="e.g. 12 or A3"
              />
            </Field>
          )}

          <Field
            label="Seating capacity"
            htmlFor="table-capacity"
            required
            error={fieldErrors.seatingCapacity}
          >
            <TextInput
              id="table-capacity"
              type="number"
              min={1}
              max={100}
              value={form.seatingCapacity}
              onChange={(e) => setForm({ ...form, seatingCapacity: e.target.value })}
            />
          </Field>

          {editing ? (
            <Field label="Status" htmlFor="table-status" error={fieldErrors.status}>
              <Select
                id="table-status"
                value={form.status}
                onChange={(e) =>
                  setForm({ ...form, status: e.target.value as TableStatus })
                }
              >
                {TABLE_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}

          {editing ? (
            <div className="rounded bg-gray-50 p-3 text-xs text-gray-600">
              QR token (immutable — printed on stickers):
              <div className="mt-1 font-mono break-all text-[11px] text-gray-800">
                {editing.qrCodeToken}
              </div>
            </div>
          ) : null}

          <div className="mt-2 flex justify-end gap-2">
            <Button variant="secondary" onClick={closeForm} disabled={mutationBusy}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={mutationBusy}>
              {mutationBusy ? 'Saving…' : editing ? 'Save changes' : 'Create table'}
            </Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={archiveTarget !== null}
        title="Archive table"
        body={
          archiveTarget
            ? `Table "${archiveTarget.number}" will be archived. This is reversible. Orders in progress will block deletion.`
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
