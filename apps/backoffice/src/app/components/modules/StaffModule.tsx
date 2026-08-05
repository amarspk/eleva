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
import {
  usersApi,
  unwrapUsers,
  branchesApi,
  type StaffUserRecord,
} from '../../lib/resources';
import {
  EMPTY_STAFF_FORM,
  ROLE_OPTIONS,
  validateStaffForm,
  type StaffFormState,
} from '../../lib/staff-validation';

/**
 * Staff user management (AUDIT-014 Phase 2 module 6).
 *
 * Full CRUD: list, create, edit (with role and branch selectors), soft-delete.
 *
 * Wired endpoints:
 *   GET    /api/v1/users[?isActive&branchId]
 *   POST   /api/v1/users
 *   PUT    /api/v1/users/:id
 *   PUT    /api/v1/users/:id/roles
 *   PUT    /api/v1/users/:id/branches
 *   DELETE /api/v1/users/:id          (soft delete + deactivate)
 *
 * No restore endpoint for users (per AUDIT-004 design).
 */

function toFormState(user: StaffUserRecord): StaffFormState {
  return {
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    password: '', // never pre-fill password
    phoneNumber: user.phoneNumber ?? '',
    isActive: user.isActive,
    roles: user.roles,
    branchIds: user.branchIds,
  };
}

export function StaffModule(): React.ReactElement {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<StaffUserRecord | null>(null);
  const [form, setForm] = useState<StaffFormState>(EMPTY_STAFF_FORM);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<StaffUserRecord | null>(null);

  const usersQuery = useQuery({
    queryKey: ['users'],
    queryFn: async () => {
      const payload = await usersApi.list();
      return unwrapUsers(payload);
    },
  });

  // Fetch branches for the branch selector
  const branchesQuery = useQuery({
    queryKey: ['branches'],
    queryFn: () => branchesApi.list(),
  });

  const invalidate = (): void => {
    void queryClient.invalidateQueries({ queryKey: ['users'] });
  };

  const closeForm = (): void => {
    setCreating(false);
    setEditing(null);
    setForm(EMPTY_STAFF_FORM);
    setFieldErrors({});
    setFormError('');
  };

  const createMutation = useMutation({
    mutationFn: (payload: StaffFormState) =>
      usersApi.create({
        firstName: payload.firstName.trim(),
        lastName: payload.lastName.trim(),
        email: payload.email.trim(),
        password: payload.password,
        phoneNumber: payload.phoneNumber.trim() || undefined,
        isActive: payload.isActive,
        roles: payload.roles,
        branchIds: payload.branchIds.length > 0 ? payload.branchIds : undefined,
      }),
    onSuccess: () => {
      invalidate();
      closeForm();
    },
    onError: (error: Error) => setFormError(error.message),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: StaffFormState }) =>
      usersApi.update(id, {
        firstName: payload.firstName.trim(),
        lastName: payload.lastName.trim(),
        email: payload.email.trim(),
        password: payload.password || undefined,
        phoneNumber: payload.phoneNumber.trim() || undefined,
        isActive: payload.isActive,
      }),
    onSuccess: () => {
      invalidate();
      closeForm();
    },
    onError: (error: Error) => setFormError(error.message),
  });

  const setRolesMutation = useMutation({
    mutationFn: ({ id, roles }: { id: string; roles: string[] }) =>
      usersApi.setRoles(id, roles),
    onSuccess: invalidate,
    onError: (error: Error) => setFormError(error.message),
  });

  const setBranchesMutation = useMutation({
    mutationFn: ({ id, branchIds }: { id: string; branchIds: string[] }) =>
      usersApi.setBranches(id, branchIds),
    onSuccess: invalidate,
    onError: (error: Error) => setFormError(error.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => usersApi.remove(id),
    onSuccess: () => {
      invalidate();
      setDeleteTarget(null);
    },
    onError: () => setDeleteTarget(null),
  });

  const usersData = usersQuery.data;
  const users = useMemo<StaffUserRecord[]>(() => usersData ?? [], [usersData]);

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const filtered = needle
      ? users.filter(
          (u) =>
            u.firstName.toLowerCase().includes(needle) ||
            u.lastName.toLowerCase().includes(needle) ||
            u.email.toLowerCase().includes(needle) ||
            u.roles.some((r) => r.toLowerCase().includes(needle))
        )
      : users;

    return filtered;
  }, [users, search]);

  const openCreate = (): void => {
    setForm(EMPTY_STAFF_FORM);
    setFieldErrors({});
    setFormError('');
    setCreating(true);
  };

  const openEdit = (user: StaffUserRecord): void => {
    setForm(toFormState(user));
    setFieldErrors({});
    setFormError('');
    setEditing(user);
  };

  const submitForm = (event: React.FormEvent): void => {
    event.preventDefault();
    const mode = editing ? 'edit' : 'create';
    const errors = validateStaffForm(form, mode);
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      return;
    }
    setFormError('');
    if (editing) {
      // Update basic fields
      updateMutation.mutate({ id: editing.id, payload: form });
      // Update roles if changed
      if (form.roles.length > 0) {
        setRolesMutation.mutate({ id: editing.id, roles: form.roles });
      }
      // Update branches if changed
      setBranchesMutation.mutate({ id: editing.id, branchIds: form.branchIds });
    } else {
      createMutation.mutate(form);
    }
  };

  const toggleRole = (role: string): void => {
    setForm((prev) => ({
      ...prev,
      roles: prev.roles.includes(role)
        ? prev.roles.filter((r) => r !== role)
        : [...prev.roles, role],
    }));
  };

  const toggleBranch = (branchId: string): void => {
    setForm((prev) => ({
      ...prev,
      branchIds: prev.branchIds.includes(branchId)
        ? prev.branchIds.filter((b) => b !== branchId)
        : [...prev.branchIds, branchId],
    }));
  };

  const mutationBusy =
    createMutation.isPending ||
    updateMutation.isPending ||
    setRolesMutation.isPending ||
    setBranchesMutation.isPending;
  const listError = usersQuery.error as ApiError | null;
  const branches = branchesQuery.data ?? [];

  return (
    <section aria-labelledby="staff-heading">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 id="staff-heading" className="text-lg font-bold text-gray-900">
          Staff
        </h2>
        {!listError ? (
          <Button variant="primary" onClick={openCreate}>
            + New staff member
          </Button>
        ) : null}
      </div>

      <div className="mb-4">
        <div className="min-w-[200px] flex-1">
          <label htmlFor="staff-search" className="sr-only">
            Search staff
          </label>
          <TextInput
            id="staff-search"
            placeholder="Search by name, email or role…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {listError ? <ErrorBanner message={listError.message} /> : null}
      {deleteMutation.error ? (
        <ErrorBanner message={(deleteMutation.error as Error).message} />
      ) : null}

      {usersQuery.isLoading ? (
        <LoadingRow label="Loading staff…" />
      ) : visible.length === 0 ? (
        <EmptyState
          message={search ? 'No staff match your search.' : 'No staff members yet.'}
        />
      ) : (
        <div className="overflow-x-auto rounded border border-gray-200 bg-white">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">Staff users</caption>
            <thead className="bg-gray-50 text-[11px] uppercase tracking-wide text-gray-500">
              <tr>
                <th scope="col" className="px-3 py-2">Name</th>
                <th scope="col" className="px-3 py-2">Email</th>
                <th scope="col" className="px-3 py-2">Roles</th>
                <th scope="col" className="px-3 py-2">Status</th>
                <th scope="col" className="px-3 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {visible.map((user) => (
                <tr key={user.id} data-testid={`staff-row-${user.id}`}>
                  <td className="px-3 py-2 font-medium text-gray-900">
                    {user.firstName} {user.lastName}
                  </td>
                  <td className="px-3 py-2 text-gray-600">{user.email}</td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      {user.roles.map((role) => (
                        <Badge key={role} tone="info">{role}</Badge>
                      ))}
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    {user.isActive ? (
                      <Badge tone="success">Active</Badge>
                    ) : (
                      <Badge tone="danger">Inactive</Badge>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex justify-end gap-1">
                      <Button onClick={() => openEdit(user)}>Edit</Button>
                      <Button
                        variant="danger"
                        onClick={() => setDeleteTarget(user)}
                      >
                        Delete
                      </Button>
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
        title={editing ? `Edit ${editing.firstName} ${editing.lastName}` : 'New staff member'}
        onClose={closeForm}
      >
        <form onSubmit={submitForm} className="flex flex-col gap-3" noValidate>
          {formError ? <ErrorBanner message={formError} /> : null}

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <Field label="First name" htmlFor="staff-first" required error={fieldErrors.firstName}>
              <TextInput
                id="staff-first"
                value={form.firstName}
                onChange={(e) => setForm({ ...form, firstName: e.target.value })}
              />
            </Field>
            <Field label="Last name" htmlFor="staff-last" required error={fieldErrors.lastName}>
              <TextInput
                id="staff-last"
                value={form.lastName}
                onChange={(e) => setForm({ ...form, lastName: e.target.value })}
              />
            </Field>
          </div>

          <Field label="Email" htmlFor="staff-email" required error={fieldErrors.email}>
            <TextInput
              id="staff-email"
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </Field>

          <Field
            label={editing ? 'New password (leave blank to keep current)' : 'Password'}
            htmlFor="staff-pass"
            required={!editing}
            error={fieldErrors.password}
          >
            <TextInput
              id="staff-pass"
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              placeholder={editing ? 'Leave blank to keep current' : undefined}
            />
          </Field>

          <Field label="Phone number" htmlFor="staff-phone" error={fieldErrors.phoneNumber}>
            <TextInput
              id="staff-phone"
              value={form.phoneNumber}
              onChange={(e) => setForm({ ...form, phoneNumber: e.target.value })}
              placeholder="+968 9999 9999"
            />
          </Field>

          {/* Role selector */}
          <div>
            <p className="mb-1 text-sm font-medium text-gray-700">
              Roles {!editing && <span className="text-red-500">*</span>}
            </p>
            {fieldErrors.roles ? (
              <p className="mb-1 text-xs text-red-600">{fieldErrors.roles}</p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              {ROLE_OPTIONS.map((role) => (
                <label key={role} className="inline-flex items-center gap-1.5 text-sm">
                  <input
                    type="checkbox"
                    checked={form.roles.includes(role)}
                    onChange={() => toggleRole(role)}
                    className="rounded border-gray-300"
                  />
                  <span>{role}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Branch selector */}
          <div>
            <p className="mb-1 text-sm font-medium text-gray-700">Assigned branches</p>
            {branches.length === 0 ? (
              <p className="text-xs text-gray-400">No branches available.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {branches.map((branch) => (
                  <label key={branch.id} className="inline-flex items-center gap-1.5 text-sm">
                    <input
                      type="checkbox"
                      checked={form.branchIds.includes(branch.id)}
                      onChange={() => toggleBranch(branch.id)}
                      className="rounded border-gray-300"
                    />
                    <span>{branch.name}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* isActive toggle */}
          <label className="inline-flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
              className="rounded border-gray-300"
            />
            <span>Active</span>
          </label>

          <div className="mt-2 flex justify-end gap-2">
            <Button variant="secondary" onClick={closeForm} disabled={mutationBusy}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={mutationBusy}>
              {mutationBusy ? 'Saving…' : editing ? 'Save changes' : 'Create staff member'}
            </Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Delete staff member"
        body={
          deleteTarget
            ? `Staff member "${deleteTarget.firstName} ${deleteTarget.lastName}" will be deactivated and soft-deleted. This prevents them from logging in.`
            : ''
        }
        confirmLabel="Delete"
        busy={deleteMutation.isPending}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
      />
    </section>
  );
}
