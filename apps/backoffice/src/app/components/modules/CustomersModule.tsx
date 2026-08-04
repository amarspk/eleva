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
  customersApi,
  type Customer,
} from '../../lib/resources';
import {
  EMPTY_CUSTOMER_FORM,
  validateCustomerForm,
  type CustomerFormState,
} from '../../lib/customer-validation';

/**
 * Customers management (AUDIT-014 Phase 2 module 5).
 *
 * Full CRUD: list, create, edit, archive (soft delete), archive view and restore.
 *
 * Wired endpoints:
 *   GET    /api/v1/customers[?includeDeleted]
 *   POST   /api/v1/customers
 *   PUT    /api/v1/customers/:id
 *   DELETE /api/v1/customers/:id          (soft delete)
 *   POST   /api/v1/customers/:id/restore
 *
 * No branch selector (tenant-scoped).
 * loyaltyPoints only editable on update.
 */

function toFormState(customer: Customer): CustomerFormState {
  return {
    firstName: customer.firstName,
    lastName: customer.lastName,
    email: customer.email,
    phoneNumber: customer.phoneNumber ?? '',
    loyaltyPoints: String(customer.loyaltyPoints ?? 0),
  };
}

export function CustomersModule(): React.ReactElement {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [view, setView] = useState<'active' | 'archived'>('active');
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [form, setForm] = useState<CustomerFormState>(EMPTY_CUSTOMER_FORM);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');
  const [archiveTarget, setArchiveTarget] = useState<Customer | null>(null);

  const customersQuery = useQuery({
    queryKey: ['customers', view],
    queryFn: () => customersApi.list(view === 'archived'),
  });

  const invalidate = (): void => {
    void queryClient.invalidateQueries({ queryKey: ['customers'] });
  };

  const closeForm = (): void => {
    setCreating(false);
    setEditing(null);
    setForm(EMPTY_CUSTOMER_FORM);
    setFieldErrors({});
    setFormError('');
  };

  const createMutation = useMutation({
    mutationFn: (payload: CustomerFormState) =>
      customersApi.create({
        firstName: payload.firstName.trim(),
        lastName: payload.lastName.trim(),
        email: payload.email.trim(),
        phoneNumber: payload.phoneNumber.trim() || undefined,
      }),
    onSuccess: () => {
      invalidate();
      closeForm();
    },
    onError: (error: Error) => setFormError(error.message),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: CustomerFormState }) =>
      customersApi.update(id, {
        firstName: payload.firstName.trim(),
        lastName: payload.lastName.trim(),
        email: payload.email.trim(),
        phoneNumber: payload.phoneNumber.trim() || undefined,
        loyaltyPoints: Number(payload.loyaltyPoints),
      }),
    onSuccess: () => {
      invalidate();
      closeForm();
    },
    onError: (error: Error) => setFormError(error.message),
  });

  const archiveMutation = useMutation({
    mutationFn: (id: string) => customersApi.remove(id),
    onSuccess: () => {
      invalidate();
      setArchiveTarget(null);
    },
    onError: () => setArchiveTarget(null),
  });

  const restoreMutation = useMutation({
    mutationFn: (id: string) => customersApi.restore(id),
    onSuccess: invalidate,
  });

  const customersData = customersQuery.data;
  const customers = useMemo<Customer[]>(() => customersData ?? [], [customersData]);

  const visible = useMemo(() => {
    const scoped = view === 'archived'
      ? customers.filter((c) => c.deletedAt !== null)
      : customers;

    const needle = search.trim().toLowerCase();
    const filtered = needle
      ? scoped.filter(
          (c) =>
            c.firstName.toLowerCase().includes(needle) ||
            c.lastName.toLowerCase().includes(needle) ||
            c.email.toLowerCase().includes(needle) ||
            (c.phoneNumber && c.phoneNumber.toLowerCase().includes(needle))
        )
      : scoped;

    return filtered;
  }, [customers, search, view]);

  const openCreate = (): void => {
    setForm(EMPTY_CUSTOMER_FORM);
    setFieldErrors({});
    setFormError('');
    setCreating(true);
  };

  const openEdit = (customer: Customer): void => {
    setForm(toFormState(customer));
    setFieldErrors({});
    setFormError('');
    setEditing(customer);
  };

  const submitForm = (event: React.FormEvent): void => {
    event.preventDefault();
    const mode = editing ? 'edit' : 'create';
    const errors = validateCustomerForm(form, mode);
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
  const listError = customersQuery.error as ApiError | null;

  return (
    <section aria-labelledby="customers-heading">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 id="customers-heading" className="text-lg font-bold text-gray-900">
          Customers
        </h2>
        {view === 'active' && !listError ? (
          <Button variant="primary" onClick={openCreate}>
            + New customer
          </Button>
        ) : null}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="min-w-[200px] flex-1">
          <label htmlFor="customer-search" className="sr-only">
            Search customers
          </label>
          <TextInput
            id="customer-search"
            placeholder="Search by name, email or phone…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div
          className="inline-flex overflow-hidden rounded border border-gray-300"
          role="group"
          aria-label="Customer view"
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

      {listError ? <ErrorBanner message={listError.message} /> : null}
      {archiveMutation.error ? (
        <ErrorBanner message={(archiveMutation.error as Error).message} />
      ) : null}
      {restoreMutation.error ? (
        <ErrorBanner message={(restoreMutation.error as Error).message} />
      ) : null}

      {customersQuery.isLoading ? (
        <LoadingRow label="Loading customers…" />
      ) : visible.length === 0 ? (
        <EmptyState
          message={
            search
              ? 'No customers match your search.'
              : view === 'archived'
                ? 'No archived customers.'
                : 'No customers yet.'
          }
        />
      ) : (
        <div className="overflow-x-auto rounded border border-gray-200 bg-white">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">Customers</caption>
            <thead className="bg-gray-50 text-[11px] uppercase tracking-wide text-gray-500">
              <tr>
                <th scope="col" className="px-3 py-2">Name</th>
                <th scope="col" className="px-3 py-2">Email</th>
                <th scope="col" className="px-3 py-2">Phone</th>
                <th scope="col" className="px-3 py-2">Loyalty</th>
                <th scope="col" className="px-3 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {visible.map((customer) => (
                <tr key={customer.id} data-testid={`customer-row-${customer.id}`}>
                  <td className="px-3 py-2 font-medium text-gray-900">
                    {customer.firstName} {customer.lastName}
                    {customer.deletedAt ? (
                      <Badge tone="danger">Archived</Badge>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 text-gray-600">{customer.email}</td>
                  <td className="px-3 py-2 text-gray-600">{customer.phoneNumber ?? '—'}</td>
                  <td className="px-3 py-2 text-gray-600">{customer.loyaltyPoints}</td>
                  <td className="px-3 py-2">
                    <div className="flex justify-end gap-1">
                      {view === 'archived' ? (
                        <Button
                          variant="primary"
                          onClick={() => restoreMutation.mutate(customer.id)}
                          disabled={restoreMutation.isPending}
                        >
                          Restore
                        </Button>
                      ) : (
                        <>
                          <Button onClick={() => openEdit(customer)}>Edit</Button>
                          <Button
                            variant="danger"
                            onClick={() => setArchiveTarget(customer)}
                          >
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
        title={editing ? `Edit ${editing.firstName} ${editing.lastName}` : 'New customer'}
        onClose={closeForm}
      >
        <form onSubmit={submitForm} className="flex flex-col gap-3" noValidate>
          {formError ? <ErrorBanner message={formError} /> : null}

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <Field label="First name" htmlFor="cust-first" required error={fieldErrors.firstName}>
              <TextInput
                id="cust-first"
                value={form.firstName}
                onChange={(e) => setForm({ ...form, firstName: e.target.value })}
              />
            </Field>
            <Field label="Last name" htmlFor="cust-last" required error={fieldErrors.lastName}>
              <TextInput
                id="cust-last"
                value={form.lastName}
                onChange={(e) => setForm({ ...form, lastName: e.target.value })}
              />
            </Field>
          </div>

          <Field label="Email" htmlFor="cust-email" required error={fieldErrors.email}>
            <TextInput
              id="cust-email"
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </Field>

          <Field label="Phone number" htmlFor="cust-phone" error={fieldErrors.phoneNumber}>
            <TextInput
              id="cust-phone"
              value={form.phoneNumber}
              onChange={(e) => setForm({ ...form, phoneNumber: e.target.value })}
              placeholder="+968 9999 9999"
            />
          </Field>

          {editing ? (
            <Field label="Loyalty points" htmlFor="cust-loyalty" error={fieldErrors.loyaltyPoints}>
              <TextInput
                id="cust-loyalty"
                type="number"
                min={0}
                value={form.loyaltyPoints}
                onChange={(e) => setForm({ ...form, loyaltyPoints: e.target.value })}
              />
            </Field>
          ) : null}

          <div className="mt-2 flex justify-end gap-2">
            <Button variant="secondary" onClick={closeForm} disabled={mutationBusy}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={mutationBusy}>
              {mutationBusy ? 'Saving…' : editing ? 'Save changes' : 'Create customer'}
            </Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={archiveTarget !== null}
        title="Archive customer"
        body={
          archiveTarget
            ? `Customer "${archiveTarget.firstName} ${archiveTarget.lastName}" will be archived. This is reversible.`
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
