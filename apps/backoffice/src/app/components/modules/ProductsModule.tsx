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
import { categoriesApi, productsApi, type Category, type Product } from '../../lib/resources';
import {
  EMPTY_PRODUCT_FORM as EMPTY_FORM,
  formatPrice,
  validateProductForm,
  type ProductFormState,
} from '../../lib/product-validation';

/**
 * Products management (AUDIT-014).
 *
 * Replaces the read-only menu list in the old `AdminPanel`, which rendered
 * category names and nothing else — it contained zero `useMutation` calls, so
 * no product could be created, priced, archived or restored from the UI.
 *
 * Wired endpoints:
 *   GET    /api/v1/menu/products[?categoryId]
 *   POST   /api/v1/menu/products
 *   PUT    /api/v1/menu/products/:id
 *   DELETE /api/v1/menu/products/:id          (soft delete)
 *   POST   /api/v1/menu/products/:id/restore
 *
 * "Archive" is the operator-facing word for the soft delete: the record is
 * hidden from active menus but preserved for order history (DOC-002 §638), and
 * it can be restored. The UI never claims the data is destroyed.
 */


/** Maps an API product onto the form's all-strings shape. */
function toFormState(product: Product): ProductFormState {
  return {
    categoryId: product.categoryId,
    name: product.name,
    basePrice: String(product.basePrice ?? ''),
    description: product.description ?? '',
    calories: product.calories === null ? '' : String(product.calories),
    preparationTime: String(product.preparationTime ?? ''),
    isAvailable: product.isAvailable,
  };
}

export function ProductsModule(): React.ReactElement {
  const queryClient = useQueryClient();
  const [categoryFilter, setCategoryFilter] = useState('');
  const [search, setSearch] = useState('');
  /**
   * 'active' hides archived rows (the default list). 'archived' asks the API
   * for soft-deleted rows via `includeDeleted=true` and filters to just those —
   * without this the restore endpoint would be unreachable from the UI
   * (AUDIT-014 DEFECT-J).
   */
  const [view, setView] = useState<'active' | 'archived'>('active');
  const [editing, setEditing] = useState<Product | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<ProductFormState>(EMPTY_FORM);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');
  const [archiveTarget, setArchiveTarget] = useState<Product | null>(null);

  const categoriesQuery = useQuery({
    queryKey: ['categories'],
    // Must be wrapped: passing the bound function directly makes TanStack Query
    // supply its QueryFunctionContext as the first argument, which would land
    // in `includeDeleted` and request archived rows on every read.
    queryFn: () => categoriesApi.list(),
  });

  const productsQuery = useQuery({
    queryKey: ['products', categoryFilter, view],
    queryFn: () => productsApi.list(categoryFilter || undefined, view === 'archived'),
  });

  const invalidate = (): void => {
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
    mutationFn: (payload: ProductFormState) =>
      productsApi.create({
        categoryId: payload.categoryId,
        name: payload.name.trim(),
        basePrice: Number(payload.basePrice),
        description: payload.description.trim() || undefined,
        calories: payload.calories.trim() === '' ? undefined : Number(payload.calories),
        preparationTime:
          payload.preparationTime.trim() === '' ? undefined : Number(payload.preparationTime),
      }),
    onSuccess: () => {
      invalidate();
      closeForm();
    },
    onError: (error: Error) => setFormError(error.message),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: ProductFormState }) =>
      productsApi.update(id, {
        categoryId: payload.categoryId || undefined,
        name: payload.name.trim(),
        basePrice: Number(payload.basePrice),
        description: payload.description.trim(),
        isAvailable: payload.isAvailable,
        calories: payload.calories.trim() === '' ? undefined : Number(payload.calories),
        preparationTime:
          payload.preparationTime.trim() === '' ? undefined : Number(payload.preparationTime),
      }),
    onSuccess: () => {
      invalidate();
      closeForm();
    },
    onError: (error: Error) => setFormError(error.message),
  });

  const archiveMutation = useMutation({
    mutationFn: (id: string) => productsApi.remove(id),
    onSuccess: () => {
      invalidate();
      setArchiveTarget(null);
    },
    onError: () => setArchiveTarget(null),
  });

  const restoreMutation = useMutation({
    mutationFn: (id: string) => productsApi.restore(id),
    onSuccess: invalidate,
  });

  const toggleAvailability = useMutation({
    mutationFn: ({ id, isAvailable }: { id: string; isAvailable: boolean }) =>
      productsApi.update(id, { isAvailable }),
    onSuccess: invalidate,
  });

  // Memoised so the `?? []` fallback does not produce a new array identity on
  // every render and invalidate the dependent useMemo hooks below.
  const categoriesData = categoriesQuery.data;
  const categories = useMemo<Category[]>(() => categoriesData ?? [], [categoriesData]);
  const categoryNames = useMemo(() => {
    const map = new Map<string, string>();
    categories.forEach((c: Category) => map.set(c.id, c.name));
    return map;
  }, [categories]);

  const productsData = productsQuery.data;
  const products = useMemo<Product[]>(() => productsData ?? [], [productsData]);
  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    // `includeDeleted=true` returns active AND archived rows, so the archive
    // tab narrows to the tombstoned ones locally.
    const scoped =
      view === 'archived' ? products.filter((p) => p.deletedAt !== null) : products;
    if (!needle) {
      return scoped;
    }
    return scoped.filter((p) => p.name.toLowerCase().includes(needle));
  }, [products, search, view]);

  const openCreate = (): void => {
    setForm({ ...EMPTY_FORM, categoryId: categoryFilter || categories[0]?.id || '' });
    setFieldErrors({});
    setFormError('');
    setCreating(true);
  };

  const openEdit = (product: Product): void => {
    setForm(toFormState(product));
    setFieldErrors({});
    setFormError('');
    setEditing(product);
  };

  const submitForm = (event: React.FormEvent): void => {
    event.preventDefault();
    const mode = editing ? 'edit' : 'create';
    const errors = validateProductForm(form, mode);
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
  const listError = productsQuery.error as ApiError | null;
  const categoriesError = categoriesQuery.error as ApiError | null;

  return (
    <section aria-labelledby="products-heading">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 id="products-heading" className="text-lg font-bold text-gray-900">
          Products
        </h2>
        {view === 'active' && !categoriesError ? (
          <Button variant="primary" onClick={openCreate} disabled={categories.length === 0}>
            + New product
          </Button>
        ) : null}
      </div>

      <div className="mb-4 flex flex-wrap gap-3">
        <div className="min-w-[200px] flex-1">
          <label htmlFor="product-search" className="sr-only">
            Search products
          </label>
          <TextInput
            id="product-search"
            placeholder="Search by name…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div
          className="inline-flex overflow-hidden rounded border border-gray-300"
          role="group"
          aria-label="Product view"
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
        <div className="min-w-[200px]">
          <label htmlFor="category-filter" className="sr-only">
            Filter by category
          </label>
          <Select
            id="category-filter"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
          >
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {/*
        Only advertise "create a category" when the list is genuinely empty. If
        the categories request FAILED (e.g. a 403 for a cashier who lacks
        `product:read`) the array is also empty, and showing this hint would
        misattribute a permissions problem to missing data — observed in the
        adversarial run, where a cashier saw both this hint and the real
        "Access Denied" banner.
      */}
      {categoriesError ? <ErrorBanner message={categoriesError.message} /> : null}
      {categories.length === 0 && !categoriesQuery.isLoading && !categoriesError ? (
        <ErrorBanner message="Create a category first — every product must belong to one." />
      ) : null}

      {listError ? <ErrorBanner message={listError.message} /> : null}
      {archiveMutation.error ? (
        <ErrorBanner message={(archiveMutation.error as Error).message} />
      ) : null}
      {restoreMutation.error ? (
        <ErrorBanner message={(restoreMutation.error as Error).message} />
      ) : null}

      {productsQuery.isLoading ? (
        <LoadingRow label="Loading products…" />
      ) : visible.length === 0 ? (
        <EmptyState
          message={
            search
              ? 'No products match your search.'
              : view === 'archived'
                ? 'No archived products.'
                : 'No products yet.'
          }
        />
      ) : (
        <div className="overflow-x-auto rounded border border-gray-200 bg-white">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">Products</caption>
            <thead className="bg-gray-50 text-[11px] uppercase tracking-wide text-gray-500">
              <tr>
                <th scope="col" className="px-3 py-2">Name</th>
                <th scope="col" className="px-3 py-2">Category</th>
                <th scope="col" className="px-3 py-2">Price</th>
                <th scope="col" className="px-3 py-2">Prep</th>
                <th scope="col" className="px-3 py-2">Status</th>
                <th scope="col" className="px-3 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {visible.map((product) => (
                <tr key={product.id} data-testid={`product-row-${product.id}`}>
                  <td className="px-3 py-2 font-medium text-gray-900">{product.name}</td>
                  <td className="px-3 py-2 text-gray-600">
                    {categoryNames.get(product.categoryId) ?? '—'}
                  </td>
                  <td className="px-3 py-2 tabular-nums text-gray-900">
                    {formatPrice(product.basePrice)}
                  </td>
                  <td className="px-3 py-2 text-gray-600">{product.preparationTime} min</td>
                  <td className="px-3 py-2">
                    {product.deletedAt ? (
                      <Badge tone="danger">Archived</Badge>
                    ) : product.isAvailable ? (
                      <Badge tone="success">Available</Badge>
                    ) : (
                      <Badge tone="warning">Unavailable</Badge>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex justify-end gap-1">
                      {view === 'archived' ? (
                        <Button
                          variant="primary"
                          onClick={() => restoreMutation.mutate(product.id)}
                          disabled={restoreMutation.isPending}
                        >
                          Restore
                        </Button>
                      ) : (
                        <>
                          <Button
                            onClick={() =>
                              toggleAvailability.mutate({
                                id: product.id,
                                isAvailable: !product.isAvailable,
                              })
                            }
                            disabled={toggleAvailability.isPending}
                          >
                            {product.isAvailable ? 'Mark unavailable' : 'Mark available'}
                          </Button>
                          <Button onClick={() => openEdit(product)}>Edit</Button>
                          <Button variant="danger" onClick={() => setArchiveTarget(product)}>
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
        title={editing ? `Edit ${editing.name}` : 'New product'}
        onClose={closeForm}
      >
        <form onSubmit={submitForm} className="flex flex-col gap-3" noValidate>
          {formError ? <ErrorBanner message={formError} /> : null}

          <Field label="Category" htmlFor="product-category" required error={fieldErrors.categoryId}>
            <Select
              id="product-category"
              value={form.categoryId}
              onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
            >
              <option value="">Select a category…</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Name" htmlFor="product-name" required error={fieldErrors.name}>
            <TextInput
              id="product-name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </Field>

          <Field label="Base price" htmlFor="product-price" required error={fieldErrors.basePrice}>
            <TextInput
              id="product-price"
              type="number"
              step="0.01"
              min="0"
              value={form.basePrice}
              onChange={(e) => setForm({ ...form, basePrice: e.target.value })}
            />
          </Field>

          <Field label="Description" htmlFor="product-description">
            <TextArea
              id="product-description"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Calories" htmlFor="product-calories" error={fieldErrors.calories}>
              <TextInput
                id="product-calories"
                type="number"
                min="0"
                value={form.calories}
                onChange={(e) => setForm({ ...form, calories: e.target.value })}
              />
            </Field>
            <Field
              label="Prep time (min)"
              htmlFor="product-prep"
              error={fieldErrors.preparationTime}
            >
              <TextInput
                id="product-prep"
                type="number"
                min="0"
                value={form.preparationTime}
                onChange={(e) => setForm({ ...form, preparationTime: e.target.value })}
              />
            </Field>
          </div>

          {editing ? (
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={form.isAvailable}
                onChange={(e) => setForm({ ...form, isAvailable: e.target.checked })}
              />
              Available on the menu
            </label>
          ) : null}

          <div className="mt-2 flex justify-end gap-2">
            <Button variant="secondary" onClick={closeForm} disabled={mutationBusy}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={mutationBusy}>
              {mutationBusy ? 'Saving…' : editing ? 'Save changes' : 'Create product'}
            </Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={archiveTarget !== null}
        title="Archive product"
        body={
          archiveTarget
            ? `"${archiveTarget.name}" will be hidden from all menus. Order history is preserved and you can restore it later.`
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
