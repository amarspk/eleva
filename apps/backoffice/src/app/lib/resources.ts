import { api } from './api-client';

/**
 * Builds a query string, omitting empty values.
 *
 * `includeDeleted` is only emitted when true: the API's `BooleanQueryPipe`
 * rejects anything outside true/false/1/0 with a 400, and sending
 * `includeDeleted=false` on every read would be noise.
 */
function buildQuery(params: Record<string, string | boolean | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === '' || value === false) {
      continue;
    }
    search.set(key, String(value));
  }
  const qs = search.toString();
  return qs ? `?${qs}` : '';
}

/**
 * Typed resource bindings for every Backoffice CRUD surface (AUDIT-014).
 *
 * One function per real API route. Paths are kept literal (rather than built
 * from a generic factory) so a route rename fails at the call site instead of
 * silently 404-ing at runtime.
 */

import { TABLE_STATUSES, type TableStatus } from './table-validation';

// ---------------------------------------------------------------- types

export interface Category {
  id: string;
  restaurantId: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
  deletedAt: string | null;
}

export interface Product {
  id: string;
  categoryId: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  /** Prisma serialises Decimal as a string over JSON. */
  basePrice: string | number;
  isAvailable: boolean;
  calories: number | null;
  preparationTime: number;
  deletedAt: string | null;
}

export interface Branch {
  id: string;
  restaurantId: string;
  name: string;
  address: string;
  phoneNumber: string;
  latitude: string | number | null;
  longitude: string | number | null;
  operatingHours: Record<string, unknown>;
  isActive: boolean;
  deletedAt: string | null;
}

/** Canonical TableStatus — derived from the TABLE_STATUSES constant so the two cannot drift. */
export type { TableStatus };
export { TABLE_STATUSES };

export interface RestaurantTable {
  id: string;
  branchId: string;
  number: string;
  seatingCapacity: number;
  qrCodeToken: string;
  status: TableStatus;
  deletedAt: string | null;
}

export interface Customer {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber: string | null;
  loyaltyPoints: number;
  deletedAt: string | null;
}

export interface StaffUserRecord {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber: string | null;
  isActive: boolean;
  roles: string[];
  branchIds: string[];
}

export interface SoftDeleteResult {
  id: string;
  deleted: boolean;
}

export interface RestoreResult {
  id: string;
  restored: true;
}

/** `GET /api/v1/users` is paginated; the others return bare arrays. */
export interface Paginated<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}

// ---------------------------------------------------------------- restaurants

export interface Restaurant {
  id: string;
  name: string;
  currency: string;
  timezone: string;
  taxPercentage: string | number;
  deletedAt: string | null;
}

/**
 * Read-only brand list (AUDIT-014 DEFECT-L). The category and branch creation
 * forms both need a `restaurantId`; before this endpoint existed neither form
 * could be submitted at all.
 */
export const restaurantsApi = {
  list: (includeDeleted = false): Promise<Restaurant[]> =>
    api.get<Restaurant[]>(`/api/v1/restaurants${buildQuery({ includeDeleted })}`),
  create: (body: {
    name: string;
    currency?: string;
    timezone?: string;
    taxPercentage?: number;
  }): Promise<Restaurant> => api.post<Restaurant>('/api/v1/restaurants', body),
  update: (
    id: string,
    body: { name?: string; currency?: string; timezone?: string; taxPercentage?: number },
  ): Promise<Restaurant> => api.put<Restaurant>(`/api/v1/restaurants/${id}`, body),
  remove: (id: string): Promise<SoftDeleteResult> =>
    api.del<SoftDeleteResult>(`/api/v1/restaurants/${id}`),
  restore: (id: string): Promise<RestoreResult> =>
    api.post<RestoreResult>(`/api/v1/restaurants/${id}/restore`),
};

// ---------------------------------------------------------------- categories

export const categoriesApi = {
  list: (includeDeleted = false): Promise<Category[]> =>
    api.get<Category[]>(`/api/v1/menu/categories${buildQuery({ includeDeleted })}`),
  create: (body: { restaurantId: string; name: string; sortOrder: number }): Promise<Category> =>
    api.post<Category>('/api/v1/menu/categories', body),
  update: (
    id: string,
    body: { name?: string; sortOrder?: number; isActive?: boolean },
  ): Promise<Category> => api.put<Category>(`/api/v1/menu/categories/${id}`, body),
  remove: (id: string): Promise<SoftDeleteResult> =>
    api.del<SoftDeleteResult>(`/api/v1/menu/categories/${id}`),
  restore: (id: string): Promise<RestoreResult> =>
    api.post<RestoreResult>(`/api/v1/menu/categories/${id}/restore`),
};

// ---------------------------------------------------------------- products

export const productsApi = {
  list: (categoryId?: string, includeDeleted = false): Promise<Product[]> =>
    api.get<Product[]>(`/api/v1/menu/products${buildQuery({ categoryId, includeDeleted })}`),
  create: (body: {
    categoryId: string;
    name: string;
    basePrice: number;
    description?: string;
    imageUrl?: string;
    calories?: number;
    preparationTime?: number;
  }): Promise<Product> => api.post<Product>('/api/v1/menu/products', body),
  update: (
    id: string,
    body: {
      categoryId?: string;
      name?: string;
      basePrice?: number;
      description?: string;
      imageUrl?: string;
      isAvailable?: boolean;
      calories?: number;
      preparationTime?: number;
    },
  ): Promise<Product> => api.put<Product>(`/api/v1/menu/products/${id}`, body),
  remove: (id: string): Promise<SoftDeleteResult> =>
    api.del<SoftDeleteResult>(`/api/v1/menu/products/${id}`),
  restore: (id: string): Promise<RestoreResult> =>
    api.post<RestoreResult>(`/api/v1/menu/products/${id}/restore`),
};

// ---------------------------------------------------------------- branches

export const branchesApi = {
  list: (includeDeleted = false): Promise<Branch[]> =>
    api.get<Branch[]>(`/api/v1/branches${buildQuery({ includeDeleted })}`),
  create: (body: {
    restaurantId: string;
    name: string;
    address: string;
    phoneNumber: string;
    operatingHours: Record<string, unknown>;
    latitude?: number;
    longitude?: number;
  }): Promise<Branch> => api.post<Branch>('/api/v1/branches', body),
  update: (
    id: string,
    body: {
      name?: string;
      address?: string;
      phoneNumber?: string;
      latitude?: number;
      longitude?: number;
      operatingHours?: Record<string, unknown>;
      isActive?: boolean;
    },
  ): Promise<Branch> => api.put<Branch>(`/api/v1/branches/${id}`, body),
  remove: (id: string): Promise<SoftDeleteResult> =>
    api.del<SoftDeleteResult>(`/api/v1/branches/${id}`),
  restore: (id: string): Promise<RestoreResult> =>
    api.post<RestoreResult>(`/api/v1/branches/${id}/restore`),
};

// ---------------------------------------------------------------- tables

export const tablesApi = {
  list: (branchId?: string, includeDeleted = false): Promise<RestaurantTable[]> =>
    api.get<RestaurantTable[]>(`/api/v1/tables${buildQuery({ branchId, includeDeleted })}`),
  create: (body: { branchId: string; number: string; seatingCapacity: number }): Promise<RestaurantTable> =>
    api.post<RestaurantTable>('/api/v1/tables', body),
  // `branchId` and `number` are intentionally NOT updatable — both feed the
  // deterministic QR HMAC, so changing them would invalidate printed stickers.
  update: (
    id: string,
    body: { seatingCapacity?: number; status?: TableStatus },
  ): Promise<RestaurantTable> => api.put<RestaurantTable>(`/api/v1/tables/${id}`, body),
  remove: (id: string): Promise<SoftDeleteResult> =>
    api.del<SoftDeleteResult>(`/api/v1/tables/${id}`),
  restore: (id: string): Promise<RestoreResult> =>
    api.post<RestoreResult>(`/api/v1/tables/${id}/restore`),
};

// ---------------------------------------------------------------- customers

export const customersApi = {
  list: (includeDeleted = false): Promise<Customer[]> =>
    api.get<Customer[]>(`/api/v1/customers${buildQuery({ includeDeleted })}`),
  create: (body: {
    firstName: string;
    lastName: string;
    email: string;
    phoneNumber?: string;
  }): Promise<Customer> => api.post<Customer>('/api/v1/customers', body),
  update: (
    id: string,
    body: {
      firstName?: string;
      lastName?: string;
      email?: string;
      phoneNumber?: string;
      loyaltyPoints?: number;
    },
  ): Promise<Customer> => api.put<Customer>(`/api/v1/customers/${id}`, body),
  remove: (id: string): Promise<SoftDeleteResult> =>
    api.del<SoftDeleteResult>(`/api/v1/customers/${id}`),
  restore: (id: string): Promise<RestoreResult> =>
    api.post<RestoreResult>(`/api/v1/customers/${id}/restore`),
};

// ---------------------------------------------------------------- staff users

export const usersApi = {
  list: (): Promise<Paginated<StaffUserRecord> | StaffUserRecord[]> =>
    api.get<Paginated<StaffUserRecord> | StaffUserRecord[]>('/api/v1/users'),
  create: (body: {
    firstName: string;
    lastName: string;
    email: string;
    password: string;
    phoneNumber?: string;
    isActive?: boolean;
    roles?: string[];
    branchIds?: string[];
  }): Promise<StaffUserRecord> => api.post<StaffUserRecord>('/api/v1/users', body),
  update: (
    id: string,
    body: {
      firstName?: string;
      lastName?: string;
      email?: string;
      password?: string;
      phoneNumber?: string;
      isActive?: boolean;
      roles?: string[];
    },
  ): Promise<StaffUserRecord> => api.put<StaffUserRecord>(`/api/v1/users/${id}`, body),
  setRoles: (id: string, roles: string[]): Promise<StaffUserRecord> =>
    api.put<StaffUserRecord>(`/api/v1/users/${id}/roles`, { roles }),
  setBranches: (id: string, branchIds: string[]): Promise<StaffUserRecord> =>
    api.put<StaffUserRecord>(`/api/v1/users/${id}/branches`, { branchIds }),
  remove: (id: string): Promise<{ id: string; deleted: true }> =>
    api.del<{ id: string; deleted: true }>(`/api/v1/users/${id}`),
};

/** `GET /api/v1/users` returns `{data,total,...}`; normalise to an array. */
export function unwrapUsers(
  payload: Paginated<StaffUserRecord> | StaffUserRecord[],
): StaffUserRecord[] {
  return Array.isArray(payload) ? payload : payload.data ?? [];
}

// ---------------------------------------------------------------- Phase 3 workflows (A4)

export interface DesignSection {
  id: string;
  type: string;
  enabled: boolean;
  order: number;
  config: Record<string, unknown>;
}

export interface DesignData {
  colors?: { primary?: string; secondary?: string };
  fonts?: { heading?: string; body?: string };
  logo?: string | null;
  coverImage?: string | null;
  sections?: DesignSection[];
  [key: string]: unknown;
}

export interface TenantDesignResponse {
  draft: DesignData;
  published: DesignData;
  version: number;
  publishedAt: string | null;
}

export interface DesignVersion {
  id: string;
  version: number;
  createdAt: string;
}

/**
 * The Phase 3 controller is exposed under the standard API namespace. The
 * backend retains its original `/design` alias for compatibility, but the
 * Backoffice must use the route that is carried by the existing `/api/*`
 * reverse proxy in local and production environments.
 */
export const designsApi = {
  get: (tenantId: string): Promise<TenantDesignResponse> =>
    api.get<TenantDesignResponse>(`/api/v1/design/tenant/${tenantId}?preview=true`),
  versions: (tenantId: string): Promise<DesignVersion[]> =>
    api.get<DesignVersion[]>(`/api/v1/design/tenant/${tenantId}/versions`),
  saveDraft: (tenantId: string, draft: DesignData): Promise<{ version?: number }> =>
    api.put<{ version?: number }>(`/api/v1/design/tenant/${tenantId}/draft`, draft),
  publish: (tenantId: string): Promise<{ version?: number }> =>
    api.post<{ version?: number }>(`/api/v1/design/tenant/${tenantId}/publish`),
  restore: (tenantId: string, version: number): Promise<{ version?: number }> =>
    api.post<{ version?: number }>(`/api/v1/design/tenant/${tenantId}/restore/${version}`),
};

export interface OrderSummary {
  id: string;
  orderNumber: string;
  branchId?: string | null;
  paymentMethod?: string | null;
  total: string | number;
  createdAt: string;
  status: string;
  isPreorder?: boolean;
  scheduledAt?: string | null;
  specialNotes?: string | null;
  orderItems?: Array<{ quantity: number; productId?: string | null }>;
  items?: Array<{ quantity: number; productId?: string | null }>;
}

export type OrderListResponse = OrderSummary[] | { data: OrderSummary[] };

export const ordersApi = {
  list: (branchId?: string): Promise<OrderListResponse> =>
    api.get<OrderListResponse>(`/api/v1/orders${buildQuery({ branchId })}`),
};

export function unwrapOrders(payload: OrderListResponse): OrderSummary[] {
  return Array.isArray(payload) ? payload : payload.data ?? [];
}

/** Request/response contract of POST /api/v1/assets/presigned-url. */
export interface CreatePresignedAssetRequest {
  contentType: string;
  fileSize: number;
  fileName: string;
  folder?: string;
}

export interface PresignedAssetResponse {
  presignedUrl: string;
  publicUrl: string;
  key: string;
  expiresIn: number;
  contentType: string;
}

export const assetsApi = {
  createPresignedUrl: (body: CreatePresignedAssetRequest): Promise<PresignedAssetResponse> =>
    api.post<PresignedAssetResponse>('/api/v1/assets/presigned-url', body),
};

/**
 * The signed URL is an S3/storage-provider URL, not a Zayjar API route. Sending
 * the staff bearer or tenant headers to it would leak credentials, so only the
 * presign operation above uses the authenticated client; the returned URL gets
 * the file bytes and content type required by the backend contract.
 */
export async function uploadPresignedAsset(
  target: PresignedAssetResponse,
  file: File,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const response = await fetchImpl(target.presignedUrl, {
    method: 'PUT',
    headers: { 'Content-Type': target.contentType },
    body: file,
  });
  if (!response.ok) {
    throw new Error(`Asset upload failed (HTTP ${response.status}).`);
  }
}
