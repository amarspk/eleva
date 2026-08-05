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
  categoriesApi,
  productsApi,
  restaurantsApi,
  type Category,
} from '../../lib/resources';
import {
  EMPTY_CATEGORY_FORM as EMPTY_FORM,
  validateCategoryForm,
  type CategoryFormState,
} from '../../lib/category-validation';

/**
 * Categories management (AUDIT-014).
 *
 * Wired endpoints:
 *   GET    /api/v1/menu/categories[?includeDeleted]
 *   POST   /api/v1/menu/categories
 *   PUT    /api/v1/menu/categories/:id
 *   DELETE /api/v1/menu/categories/:id          (soft delete, CASCADES to products)
 *   POST   /api/v1/menu/categories/:id/restore
 *   GET    /api/v1/restaurants                  (for the required restaurantId)
 *
 * The cascade is the important UX detail: `MenuService.deleteCategory` archives
 * every product under the category in the same transaction. The confirmation
 * dialog therefore states the exact number of products that will be archived —
 * an operator must not discover that after the fact.
 */

function toFormState(category: Category): CategoryFormState {
  return {
    restaurantId: category.restaurantId,
    name: category.name,
    sortOrder: String(category.sortOrder ?? 0),
    isActive: category.isActive,
  };
}

export function CategoriesModule(): React.ReactElement {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [view, setView] = useState<'active' | 'archived'>('active');
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  const [form, setForm] = useState<CategoryFormState>(EMPTY_FORM);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');
  const [archiveTarget, setArchiveTarget] = useState<Category | null>(null);

  const restaurantsQuery = useQuery({
    queryKey: ['restaurants'],
    queryFn: () => restaurantsApi.list(),
  });

  const categoriesQuery = useQuery({
    queryKey: ['categories', view],
    queryFn: () => categoriesApi.list(view === 'archived'),
  });

  // Product counts drive the cascade warning. Fetched once for the whole tenant
  // rather than per row so the table does not issue N requests.
  const productsQuery = useQuery({
    queryKey: ['products', 'all-for-counts'],
    queryFn: () => productsApi.list(),
  });

  const invalidate = (): void => {
    void queryClient.invalidateQueries({ queryKey: ['categories'] });
    // Archiving a category cascades to its products, so their list is stale too.
    void queryClient.invalidateQueries({ queryKey: ['products'] });
  };

  const closeForm = (): void => {
    setCreating(false);
    setEditing(null);
    setForm(EMPTY_FORM);
    setFieldErrors({});
    setFormError('');
  };

  const createMutation = useMutation({
    mutationFn: (payload: CategoryFormState) =>
      categoriesApi.create({
        restaurantId: payload.restaurantId,
        name: payload.name.trim(),
        sortOrder: Number(payload.sortOrder),
      }),
    onSuccess: () => {
      invalidate();
      closeForm();
    },
    onError: (error: Error) => setFormError(error.message),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: CategoryFormState }) =>
      categoriesApi.update(id, {
        name: payload.name.trim(),
        sortOrder: Number(payload.sortOrder),
        isActive: payload.isActive,
      }),
    onSuccess: () => {
      invalidate();
      closeForm();
    },
    onError: (error: Error) => setFormError(error.message),
  });

  const archiveMutation = useMutation({
    mutationFn: (id: string) => categoriesApi.remove(id),
    onSuccess: () => {
      invalidate();
      setArchiveTarget(null);
    },
    onError: () => setArchiveTarget(null),
  });

  const restoreMutation = useMutation({
    mutationFn: (id: string) => categoriesApi.restore(id),
    onSuccess: invalidate,
  });

  const toggleActive = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      categoriesApi.update(id, { isActive }),
    onSuccess: invalidate,
  });

  const restaurantsData = restaurantsQuery.data;
  const restaurants = useMemo(() => restaurantsData ?? [], [restaurantsData]);

  const categoriesData = categoriesQuery.data;
  const categories = useMemo<Category[]>(() => categoriesData ?? [], [categoriesData]);

  const productsData = productsQuery.data;
  const productCounts = useMemo(() => {
    const counts = new Map<string, number>();
    (productsData ?? []).forEach((p) => {
      counts.set(p.categoryId, (counts.get(p.categoryId) ?? 0) + 1);
    });
    return counts;
  }, [productsData]);

  const visible = useMemo(() => {
    const scoped =
      view === 'archived' ? categories.filter((c) => c.deletedAt !== null) : categories;
    const needle = search.trim().toLowerCase();
    const filtered = needle
      ? scoped.filter((c) => c.name.toLowerCase().includes(needle))
      : scoped;
    // Present in the order guests see them.
    return [...filtered].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
  }, [categories, search, view]);

  const openCreate = (): void => {
    setForm({ ...EMPTY_FORM, restaurantId: restaurants[0]?.id ?? '' });
    setFieldErrors({});
    setFormError('');
    setCreating(true);
  };

  const openEdit = (category: Category): void => {
    setForm(toFormState(category));
    setFieldErrors({});
    setFormError('');
    setEditing(category);
  };

  const submitForm = (event: React.FormEvent): void => {
    event.preventDefault();
    const mode = editing ? 'edit' : 'create';
    const errors = validateCategoryForm(form, mode);
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
  const listError = categoriesQuery.error as ApiError | null;
  const restaurantsError = restaurantsQuery.error as ApiError | null;
  const archiveCount = archiveTarget ? productCounts.get(archiveTarget.id) ?? 0 : 0;

  return (
    <section aria-labelledby="categories-heading">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 id="categories-heading" className="text-lg font-bold text-gray-900">
          Categories
        </h2>
        {view === 'active' && !listError && !restaurantsError ? (
          <Button variant="primary" onClick={openCreate} disabled={restaurants.length === 0}>
            + New category
          </Button>
        ) : null}
      </div>

      <div className="mb-4 flex flex-wrap gap-3">
        <div className="min-w-[200px] flex-1">
          <label htmlFor="category-search" className="sr-only">
            Search categories
          </label>
          <TextInput
            id="category-search"
            placeholder="Search by name…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div
          className="inline-flex overflow-hidden rounded border border-gray-300"
          role="group"
          aria-label="Category view"
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

      {/* Distinguish a failed request from a genuinely empty list — showing the
          "create a restaurant first" hint on a 403 would misreport a
          permissions problem as missing data. */}
      {restaurantsError ? <ErrorBanner message={restaurantsError.message} /> : null}
      {restaurants.length === 0 && !restaurantsQuery.isLoading && !restaurantsError ? (
        <ErrorBanner message="No restaurant brand found — a category must belong to one." />
      ) : null}
      {listError ? <ErrorBanner message={listError.message} /> : null}
      {archiveMutation.error ? (
        <ErrorBanner message={(archiveMutation.error as Error).message} />
      ) : null}
      {restoreMutation.error ? (
        <ErrorBanner message={(restoreMutation.error as Error).message} />
      ) : null}
      {toggleActive.error ? <ErrorBanner message={(toggleActive.error as Error).message} /> : null}

      {categoriesQuery.isLoading ? (
        <LoadingRow label="Loading categories…" />
      ) : visible.length === 0 ? (
        <EmptyState
          message={
            search
              ? 'No categories match your search.'
              : view === 'archived'
                ? 'No archived categories.'
                : 'No categories yet.'
          }
        />
      ) : (
        <div className="overflow-x-auto rounded border border-gray-200 bg-white">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">Menu categories</caption>
            <thead className="bg-gray-50 text-[11px] uppercase tracking-wide text-gray-500">
              <tr>
                <th scope="col" className="px-3 py-2">Name</th>
                <th scope="col" className="px-3 py-2">Sort order</th>
                <th scope="col" className="px-3 py-2">Products</th>
                <th scope="col" className="px-3 py-2">Status</th>
                <th scope="col" className="px-3 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {visible.map((category) => (
                <tr key={category.id} data-testid={`category-row-${category.id}`}>
                  <td className="px-3 py-2 font-medium text-gray-900">{category.name}</td>
                  <td className="px-3 py-2 tabular-nums text-gray-600">{category.sortOrder}</td>
                  <td className="px-3 py-2 tabular-nums text-gray-600">
                    {productCounts.get(category.id) ?? 0}
                  </td>
                  <td className="px-3 py-2">
                    {category.deletedAt ? (
                      <Badge tone="danger">Archived</Badge>
                    ) : category.isActive ? (
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
                          onClick={() => restoreMutation.mutate(category.id)}
                          disabled={restoreMutation.isPending}
                        >
                          Restore
                        </Button>
                      ) : (
                        <>
                          <Button
                            onClick={() =>
                              toggleActive.mutate({
                                id: category.id,
                                isActive: !category.isActive,
                              })
                            }
                            disabled={toggleActive.isPending}
                          >
                            {category.isActive ? 'Hide' : 'Show'}
                          </Button>
                          <Button onClick={() => openEdit(category)}>Edit</Button>
                          <Button variant="danger" onClick={() => setArchiveTarget(category)}>
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
        title={editing ? `Edit ${editing.name}` : 'New category'}
        onClose={closeForm}
      >
        <form onSubmit={submitForm} className="flex flex-col gap-3" noValidate>
          {formError ? <ErrorBanner message={formError} /> : null}

          {editing ? null : (
            <Field
              label="Restaurant"
              htmlFor="category-restaurant"
              required
              error={fieldErrors.restaurantId}
            >
              <Select
                id="category-restaurant"
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

          <Field label="Name" htmlFor="category-name" required error={fieldErrors.name}>
            <TextInput
              id="category-name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </Field>

          <Field
            label="Sort order"
            htmlFor="category-sort"
            required
            error={fieldErrors.sortOrder}
            hint="Lower numbers appear first on the guest menu."
          >
            <TextInput
              id="category-sort"
              type="number"
              min="0"
              value={form.sortOrder}
              onChange={(e) => setForm({ ...form, sortOrder: e.target.value })}
            />
          </Field>

          {editing ? (
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
              />
              Visible on the guest menu
            </label>
          ) : null}

          <div className="mt-2 flex justify-end gap-2">
            <Button variant="secondary" onClick={closeForm} disabled={mutationBusy}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={mutationBusy}>
              {mutationBusy ? 'Saving…' : editing ? 'Save changes' : 'Create category'}
            </Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={archiveTarget !== null}
        title="Archive category"
        body={
          archiveTarget
            ? archiveCount > 0
              ? `"${archiveTarget.name}" and its ${archiveCount} product(s) will be archived together and hidden from all menus. Order history is preserved. Restoring the category does NOT automatically restore its products.`
              : `"${archiveTarget.name}" will be hidden from all menus. Order history is preserved and you can restore it later.`
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
