/**
 * Shared ELEVA REST client.
 *
 * Preserves the existing API behavior from the repo's frontend:
 * - bearer auth from localStorage session
 * - X-Tenant-ID header when a tenant is known
 * - X-CSRF-Token on mutating requests
 * - normalized NestJS error shape
 */

export class ApiError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(status: number, message: string, body: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }

  get isAuthError(): boolean {
    return this.status === 401;
  }

  get isForbidden(): boolean {
    return this.status === 403;
  }

  get isConflict(): boolean {
    return this.status === 409;
  }
}

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function extractMessage(body: unknown, status: number): string {
  if (body && typeof body === 'object' && 'message' in body) {
    const message = (body as { message: unknown }).message;
    if (typeof message === 'string' && message.length > 0) {
      return message;
    }
    if (Array.isArray(message)) {
      return message.filter((m): m is string => typeof m === 'string').join(', ');
    }
  }
  return `Request failed (HTTP ${status}).`;
}

export function resolveApiBase(): string {
  const configured = process.env.NEXT_PUBLIC_API_URL;
  if (configured) {
    return configured.replace(/\/$/, '');
  }
  return '';
}

export interface RequestOptions {
  method?: string;
  body?: unknown;
  tenantId?: string | null;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, tenantId, signal, fetchImpl = fetch } = options;
  const session = loadSession();

  const headers: Record<string, string> = { Accept: 'application/json' };

  if (session?.accessToken) {
    headers.Authorization = `Bearer ${session.accessToken}`;
  }

  const effectiveTenant = tenantId !== undefined ? tenantId : session?.tenantId ?? null;
  if (effectiveTenant) {
    headers['X-Tenant-ID'] = effectiveTenant;
  }

  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  if (MUTATING.has(method.toUpperCase())) {
    const csrf = resolveCsrfToken();
    if (csrf) {
      headers['X-CSRF-Token'] = csrf;
    }
  }

  const response = await fetchImpl(`${resolveApiBase()}${path}`, {
    method,
    headers,
    credentials: 'include',
    signal,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (response.status === 204) {
    return undefined as T;
  }

  const payload: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    throw new ApiError(response.status, extractMessage(payload, response.status), payload);
  }

  return payload as T;
}

export const api = {
  get: <T>(path: string, options: RequestOptions = {}): Promise<T> =>
    apiRequest<T>(path, { ...options, method: 'GET' }),
  post: <T>(path: string, body?: unknown, options: RequestOptions = {}): Promise<T> =>
    apiRequest<T>(path, { ...options, method: 'POST', body }),
  put: <T>(path: string, body?: unknown, options: RequestOptions = {}): Promise<T> =>
    apiRequest<T>(path, { ...options, method: 'PUT', body }),
  del: <T>(path: string, options: RequestOptions = {}): Promise<T> =>
    apiRequest<T>(path, { ...options, method: 'DELETE' }),
};

function resolveCsrfToken(): string {
  const session = loadSession();
  if (session?.csrfToken) {
    return session.csrfToken;
  }
  if (typeof document === 'undefined') {
    return '';
  }
  const match = document.cookie.match(/(?:^|;\s*)__Host-CSRF-Token=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : '';
}

function loadSession(): { accessToken: string | null; csrfToken: string; tenantId: string | null; user: unknown } | null {
  if (typeof window === 'undefined') {
    return null;
  }
  const accessToken = window.localStorage.getItem('eleva_accessToken');
  if (!accessToken) {
    return null;
  }
  const tenantId = window.localStorage.getItem('eleva_tenantId');
  let user = null;
  try {
    const rawUser = window.localStorage.getItem('eleva_user');
    user = rawUser ? JSON.parse(rawUser) : null;
  } catch {
    user = null;
  }
  return {
    accessToken,
    csrfToken: window.localStorage.getItem('eleva_csrfToken') || '',
    tenantId: tenantId || user?.tenantId || null,
    user: user || {
      id: '',
      tenantId: tenantId || null,
      email: '',
      roles: [],
      permissions: [],
      firstName: null,
      lastName: null,
      mfaEnabled: false,
    },
  };
}
