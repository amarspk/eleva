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
  TextArea,
  TextInput,
} from '../ui/Primitives';
import { ApiError } from '../../lib/api-client';
import {
  branchesApi,
  restaurantsApi,
  type Branch,
  type Restaurant,
} from '../../lib/resources';
import {
  EMPTY_BRANCH_FORM as EMPTY_FORM,
  validateBranchForm,
  type BranchFormState,
} from '../../lib/branch-validation';

/**
 * Branches management (AUDIT-014 Phase 2 module 3).
 *
 * Full CRUD: list, search, create, edit, hide/show (isActive), archive (soft delete),
 * archive view and restore.
 *
 * Wired endpoints:
 *   GET    /api/v1/branches[?includeDeleted]
 *   POST   /api/v1/branches
 *   PUT    /api/v1/branches/:id
 *   DELETE /api/v1/branches/:id          (soft delete + cascade to tables)
 *   POST   /api/v1/branches/:id/restore
 *
 * 409 when the branch has orders in progress.
 * Tables cascade: archiving a branch archives its tables.
 * restaurantId hidden on edit (re-parenting forbidden).
 */

function toFormState(branch: Branch): BranchFormState {
  return {
    restaurantId: branch.restaurantId,
    name: branch.name,
    address: branch.address,
    phoneNumber: branch.phoneNumber,
    operatingHours: JSON.stringify(branch.operatingHours ?? {}, null, 2),
    latitude: branch.latitude === null ? '' : String(branch.latitude),
    longitude: branch.longitude === null ? '' : String(branch.longitude),
    isActive: branch.isActive,
  };
}

export function BranchesModule(): React.ReactElement {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [view, setView] = useState<'active' | 'archived'>('active');
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Branch | null>(null);
  const [form, setForm] = useState<BranchFormState>(EMPTY_FORM);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');
  const [archiveTarget, setArchiveTarget] = useState<Branch | null>(null);

  const restaurantsQuery = useQuery({
    queryKey: ['restaurants'],
    queryFn: () => restaurantsApi.list(),
  });

  const branchesQuery = useQuery({
    queryKey: ['branches', view],
    queryFn: () => branchesApi.list(view === 'archived'),
  });

  const invalidate = (): void => {
    void queryClient.invalidateQueries({ queryKey: ['branches'] });
  };

  const closeForm = (): void => {
    setCreating(false);
    setEditing(null);
    setForm(EMPTY_FORM);
    setFieldErrors({});
    setFormError('');
  };

  const createMutation = useMutation({
    mutationFn: (payload: BranchFormState) =>
      branchesApi.create({
        restaurantId: payload.restaurantId,
        name: payload.name.trim(),
        address: payload.address.trim(),
        phoneNumber: payload.phoneNumber.trim(),
        operatingHours: JSON.parse(payload.operatingHours),
        latitude: payload.latitude.trim() === '' ? undefined : Number(payload.latitude),
        longitude: payload.longitude.trim() === '' ? undefined : Number(payload.longitude),
      }),
    onSuccess: () => {
      invalidate();
      closeForm();
    },
    onError: (error: Error) => setFormError(error.message),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: BranchFormState }) =>
      branchesApi.update(id, {
        name: payload.name.trim(),
        address: payload.address.trim(),
        phoneNumber: payload.phoneNumber.trim(),
        operatingHours: JSON.parse(payload.operatingHours),
        latitude: payload.latitude.trim() === '' ? undefined : Number(payload.latitude),
        longitude: payload.longitude.trim() === '' ? undefined : Number(payload.longitude),
        isActive: payload.isActive,
      }),
    onSuccess: () => {
      invalidate();
      closeForm();
    },
    onError: (error: Error) => setFormError(error.message),
  });

  const archiveMutation = useMutation({
    mutationFn: (id: string) => branchesApi.remove(id),
    onSuccess: () => {
      invalidate();
      setArchiveTarget(null);
    },
    onError: () => setArchiveTarget(null),
  });

  const restoreMutation = useMutation({
    mutationFn: (id: string) => branchesApi.restore(id),
    onSuccess: invalidate,
  });

  const toggleActive = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      branchesApi.update(id, { isActive }),
    onSuccess: invalidate,
  });

  const restaurantsData = restaurantsQuery.data;
  const restaurants = useMemo<Restaurant[]>(() => restaurantsData ?? [], [restaurantsData]);

  const branchesData = branchesQuery.data;
  const branches = useMemo<Branch[]>(() => branchesData ?? [], [branchesData]);

  const visible = useMemo(() => {
    const scoped =
      view === 'archived'
        ? branches.filter((b) => b.deletedAt !== null)
        : branches;
    const needle = search.trim().toLowerCase();
    const filtered = needle
      ? scoped.filter((b) => b.name.toLowerCase().includes(needle) || b.address.toLowerCase().includes(needle))
      : scoped;
    return filtered;
  }, [branches, search, view]);

  const openCreate = (): void => {
    setForm({ ...EMPTY_FORM, restaurantId: restaurants[0]?.id ?? '' });
    setFieldErrors({});
    setFormError('');
    setCreating(true);
  };

  const openEdit = (branch: Branch): void => {
    setForm(toFormState(branch));
    setFieldErrors({});
    setFormError('');
    setEditing(branch);
  };

  const submitForm = (event: React.FormEvent): void => {
    event.preventDefault();
    const mode = editing ? 'edit' : 'create';
    const errors = validateBranchForm(form, mode);
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      return;
    }
    setFormError('');
    if (editing) {
      // For edit we do not send restaurantId
      const editPayload = { ...form };
      updateMutation.mutate({ id: editing.id, payload: editPayload });
    } else {
      createMutation.mutate(form);
    }
  };

  const mutationBusy = createMutation.isPending || updateMutation.isPending;
  const listError = branchesQuery.error as ApiError | null;
  const restaurantsError = restaurantsQuery.error as ApiError | null;

  return (
    <section aria-labelledby="branches-heading">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 id="branches-heading" className="text-lg font-bold text-gray-900">
          Branches
        </h2>
        {view === 'active' && !listError && !restaurantsError ? (
          <Button variant="primary" onClick={openCreate} disabled={restaurants.length === 0}>
            + New branch
          </Button>
        ) : null}
      </div>

      <div className="mb-4 flex flex-wrap gap-3">
        <div className="min-w-[200px] flex-1">
          <label htmlFor="branch-search" className="sr-only">
            Search branches
          </label>
          <TextInput
            id="branch-search"
            placeholder="Search by name or address…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div
          className="inline-flex overflow-hidden rounded border border-gray-300"
          role="group"
          aria-label="Branch view"
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

      {restaurantsError ? <ErrorBanner message={restaurantsError.message} /> : null}
      {restaurants.length === 0 && !restaurantsQuery.isLoading && !restaurantsError ? (
        <ErrorBanner message="No restaurant brand found — a branch must belong to one." />
      ) : null}
      {listError ? <ErrorBanner message={listError.message} /> : null}
      {archiveMutation.error ? (
        <ErrorBanner message={(archiveMutation.error as Error).message} />
      ) : null}
      {restoreMutation.error ? (
        <ErrorBanner message={(restoreMutation.error as Error).message} />
      ) : null}

      {branchesQuery.isLoading ? (
        <LoadingRow label="Loading branches…" />
      ) : visible.length === 0 ? (
        <EmptyState
          message={
            search
              ? 'No branches match your search.'
              : view === 'archived'
                ? 'No archived branches.'
                : 'No branches yet.'
          }
        />
      ) : (
        <div className="overflow-x-auto rounded border border-gray-200 bg-white">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">Branches</caption>
            <thead className="bg-gray-50 text-[11px] uppercase tracking-wide text-gray-500">
              <tr>
                <th scope="col" className="px-3 py-2">Name</th>
                <th scope="col" className="px-3 py-2">Address</th>
                <th scope="col" className="px-3 py-2">Phone</th>
                <th scope="col" className="px-3 py-2">Status</th>
                <th scope="col" className="px-3 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {visible.map((branch) => (
                <tr key={branch.id} data-testid={`branch-row-${branch.id}`}>
                  <td className="px-3 py-2 font-medium text-gray-900">{branch.name}</td>
                  <td className="px-3 py-2 text-gray-600">{branch.address}</td>
                  <td className="px-3 py-2 text-gray-600">{branch.phoneNumber}</td>
                  <td className="px-3 py-2">
                    {branch.deletedAt ? (
                      <Badge tone="danger">Archived</Badge>
                    ) : branch.isActive ? (
                      <Badge tone="success">Active</Badge>
                    ) : (
                      <Badge tone="warning">Hidden</Badge>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex justify-end gap-1">
                      {view === 'archived' ? (
                        <Button
                          variant="primary"
                          onClick={() => restoreMutation.mutate(branch.id)}
                          disabled={restoreMutation.isPending}
                        >
                          Restore
                        </Button>
                      ) : (
                        <>
                          <Button
                            onClick={() =>
                              toggleActive.mutate({
                                id: branch.id,
                                isActive: !branch.isActive,
                              })
                            }
                            disabled={toggleActive.isPending}
                          >
                            {branch.isActive ? 'Hide' : 'Show'}
                          </Button>
                          <Button onClick={() => openEdit(branch)}>Edit</Button>
                          <Button variant="danger" onClick={() => setArchiveTarget(branch)}>
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

      <Modal
        open={creating || editing !== null}
        title={editing ? `Edit ${editing.name}` : 'New branch'}
        onClose={closeForm}
      >
        <form onSubmit={submitForm} className="flex flex-col gap-3" noValidate>
          {formError ? <ErrorBanner message={formError} /> : null}

          {editing ? null : (
            <Field
              label="Restaurant"
              htmlFor="branch-restaurant"
              required
              error={fieldErrors.restaurantId}
            >
              <Select
                id="branch-restaurant"
                value={form.restaurantId}
                onChange={(e) => setForm({ ...form, restaurantId: e.target.value })}
              >
                <option value="">Select a restaurant…</option>
                {restaurants.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </Select>
            </Field>
          )}

          <Field label="Name" htmlFor="branch-name" required error={fieldErrors.name}>
            <TextInput
              id="branch-name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </Field>

          <Field label="Address" htmlFor="branch-address" required error={fieldErrors.address}>
            <TextInput
              id="branch-address"
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
            />
          </Field>

          <Field label="Phone number" htmlFor="branch-phone" required error={fieldErrors.phoneNumber}>
            <TextInput
              id="branch-phone"
              value={form.phoneNumber}
              onChange={(e) => setForm({ ...form, phoneNumber: e.target.value })}
            />
          </Field>

          <Field label="Operating hours (JSON)" htmlFor="branch-hours" required error={fieldErrors.operatingHours}>
            <TextArea
              id="branch-hours"
              value={form.operatingHours}
              onChange={(e) => setForm({ ...form, operatingHours: e.target.value })}
              placeholder='{"mon":"09:00-22:00"}'
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Latitude" htmlFor="branch-lat" error={fieldErrors.latitude}>
              <TextInput
                id="branch-lat"
                type="number"
                step="0.000001"
                value={form.latitude}
                onChange={(e) => setForm({ ...form, latitude: e.target.value })}
              />
            </Field>
            <Field label="Longitude" htmlFor="branch-lng" error={fieldErrors.longitude}>
              <TextInput
                id="branch-lng"
                type="number"
                step="0.000001"
                value={form.longitude}
                onChange={(e) => setForm({ ...form, longitude: e.target.value })}
              />
            </Field>
          </div>

          {editing ? (
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={form.isActive !== undefined ? form.isActive : true}
                onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
              />
              Visible / active
            </label>
          ) : null}

          <div className="mt-2 flex justify-end gap-2">
            <Button variant="secondary" onClick={closeForm} disabled={mutationBusy}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={mutationBusy}>
              {mutationBusy ? 'Saving…' : editing ? 'Save changes' : 'Create branch'}
            </Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={archiveTarget !== null}
        title="Archive branch"
        body={
          archiveTarget
            ? `"${archiveTarget.name}" and all its tables will be archived. This is reversible. Orders in progress will block deletion.`
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
