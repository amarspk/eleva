import { loadSession, readCsrfCookie, resolveApiBase } from './auth';

/**
 * Shared REST client for the Backoffice (AUDIT-014).
 *
 * Every module (products, categories, branches, tables, customers, users) goes
 * through this one place so three concerns are handled uniformly:
 *
 *  1. **CSRF.** `CsrfGuard` requires `X-CSRF-Token` on every POST/PUT/DELETE/
 *     PATCH from an authenticated caller. This was runtime-proven during
 *     AUDIT-014: before DEFECT-I was fixed a forged token returned HTTP 200;
 *     it now returns 403, and a *missing* header returns
 *     "CSRF token is required for mutating requests". The token is read from
 *     the login response (persisted by `saveSession`) and falls back to the
 *     `__Host-CSRF-Token` cookie, which the backend also sets.
 *
 *  2. **Tenant context.** `X-Tenant-ID` is sent from the verified session so
 *     the API resolves the right tenant when the host is a bare `localhost`
 *     rather than a `<subdomain>.localhost`.
 *
 *  3. **Error shape.** NestJS returns `{ message: string | string[] }`. Raw
 *     `Error(response.statusText)` (what `AdminPanel` used to do) discards the
 *     validation detail, so a 400 surfaced to the operator as an unhelpful
 *     "Bad Request". `ApiError` preserves both the status and the joined
 *     message so forms can show exactly which field the server rejected.
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

  /** 401 means the 15-minute access token expired — the UI re-routes to /login. */
  get isAuthError(): boolean {
    return this.status === 401;
  }

  /** 403 from RBAC ("Access Denied: ... privilege") or from CSRF. */
  get isForbidden(): boolean {
    return this.status === 403;
  }

  /** 409 conflicts carry an actionable operator message (e.g. orders in progress). */
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
      const joined = message.filter((m): m is string => typeof m === 'string').join(', ');
      if (joined.length > 0) {
        return joined;
      }
    }
  }
  return `Request failed (HTTP ${status}).`;
}

/**
 * Resolves the CSRF token: the session copy first (written at login), then the
 * cookie the backend sets alongside it. Returning '' rather than throwing keeps
 * read-only calls working even if the cookie was cleared.
 */
export function resolveCsrfToken(): string {
  const session = loadSession();
  if (session?.csrfToken) {
    return session.csrfToken;
  }
  return readCsrfCookie();
}

export interface RequestOptions {
  method?: string;
  body?: unknown;
  /** Overrides the session tenant (not used by the UI; present for tests). */
  tenantId?: string | null;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
}

/**
 * Performs an authenticated JSON request and throws `ApiError` on failure.
 *
 * `credentials: 'include'` is set so the `__Host-*` cookies travel with the
 * request in the cross-origin dev setup (`albaik.localhost:3001` ->
 * `albaik.localhost:8000`).
 */
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
