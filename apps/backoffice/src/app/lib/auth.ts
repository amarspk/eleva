/**
 * Staff authentication client for the Cashier app.
 *
 * Sprint 2 Task 1 (Auth-UI gap, PROJECT_STATE §15 item 6): the Cashier app
 * previously had no standalone login path — nothing ever wrote
 * `localStorage.accessToken` that `CashierTerminal` reads. This module wires
 * the app to the existing backend auth surface (`POST /api/v1/auth/login`,
 * MFA challenge, refresh cookie, CSRF double-submit cookie) so staff can sign
 * in independently. Backend contracts are used as-is (no API changes).
 */

export interface StaffUser {
  id: string;
  tenantId: string | null;
  email: string;
  roles: string[];
  permissions: string[];
  firstName: string | null;
  lastName: string | null;
  mfaEnabled: boolean;
}

export interface StaffSession {
  accessToken: string;
  csrfToken: string;
  expiresIn: number;
  tenantId: string | null;
  user: StaffUser;
}

export type LoginStaffResult =
  | { ok: true; session: StaffSession }
  | { ok: false; mfaRequired: true }
  | { ok: false; error: string };

const STORAGE_KEYS = {
  accessToken: 'accessToken',
  csrfToken: 'csrfToken',
  tenantId: 'tenantId',
  user: 'user',
} as const;

/**
 * Resolves the backend API base URL.
 *
 * Precedence (mirrors the qr-menu `resolveServerApiBase` precedent, DOC-003):
 * 1. `NEXT_PUBLIC_API_URL` environment override wins.
 * 2. Local dev: preserve the tenant subdomain for the TenantContextMiddleware
 *    (`albaik.localhost:3002` -> `http://albaik.localhost:8000`; plain
 *    `localhost` -> `http://localhost:8000` — the API default port).
 * 3. Production: same-origin (`''`), so `/api/*` is proxied by nginx while the
 *    tenant Host header stays intact.
 */
export function resolveApiBase(): string {
  const configured = process.env.NEXT_PUBLIC_API_URL;
  if (configured) {
    return configured.replace(/\/$/, '');
  }
  /* When no env override is set, use relative URLs so all API requests
     are proxied through the Next.js rewrites (next.config.mjs). This
     works in the Arena preview, Vercel, and any reverse-proxy setup
     without requiring the browser to resolve an internal hostname. */
  return '';
}

function extractServerMessage(body: unknown, status: number): string {
  if (body && typeof body === 'object' && 'message' in body) {
    const message = (body as { message: unknown }).message;
    if (typeof message === 'string') {
      return message;
    }
    if (Array.isArray(message)) {
      return message.filter((m): m is string => typeof m === 'string').join(', ');
    }
  }
  return `Sign in failed (HTTP ${status}).`;
}

function sessionFromLoginResponse(data: {
  accessToken: string;
  csrfToken?: string;
  expiresIn?: number;
  user: StaffUser;
}): StaffSession {
  return {
    accessToken: data.accessToken,
    csrfToken: data.csrfToken || '',
    expiresIn: data.expiresIn || 900,
    tenantId: data.user.tenantId ?? null,
    user: data.user,
  };
}

/**
 * POST /api/v1/auth/login (public, tenant-context resolved from the Host or
 * X-Tenant-ID header). MFA-enabled accounts respond 401 "MFA token required"
 * until a valid TOTP code is supplied — surfaced as `{ mfaRequired: true }`.
 */
export async function loginStaff(
  email: string,
  password: string,
  mfaToken?: string,
  fetchImpl: typeof fetch = fetch,
): Promise<LoginStaffResult> {
  const body: { email: string; password: string; mfaToken?: string } = { email, password };
  if (mfaToken) {
    body.mfaToken = mfaToken;
  }

  /* Include X-Tenant-Id from a previous session so the API can resolve
     tenant context even when the Host header has no subdomain (e.g. the
     Arena preview URL). Without this, login returns 403 "Missing valid
     tenant context". */
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const storedTenantId = typeof window !== 'undefined'
    ? window.localStorage.getItem(STORAGE_KEYS.tenantId)
    : null;
  if (storedTenantId) {
    headers['X-Tenant-ID'] = storedTenantId;
  }

  const res = await fetchImpl(`${resolveApiBase()}/api/v1/auth/login`, {
    method: 'POST',
    headers,
    credentials: 'include',
    body: JSON.stringify(body),
  });

  const responseBody: unknown = await res.json().catch(() => ({}));

  if (!res.ok) {
    const message = extractServerMessage(responseBody, res.status);
    if (res.status === 401 && message === 'MFA token required') {
      return { ok: false, mfaRequired: true };
    }
    return { ok: false, error: message };
  }

  return {
    ok: true,
    session: sessionFromLoginResponse(responseBody as {
      accessToken: string;
      csrfToken?: string;
      expiresIn?: number;
      user: StaffUser;
    }),
  };
}

export function saveSession(session: StaffSession): void {
  if (typeof window === 'undefined') {
    return;
  }
  window.localStorage.setItem(STORAGE_KEYS.accessToken, session.accessToken);
  window.localStorage.setItem(STORAGE_KEYS.csrfToken, session.csrfToken);
  if (session.tenantId) {
    window.localStorage.setItem(STORAGE_KEYS.tenantId, session.tenantId);
  } else {
    window.localStorage.removeItem(STORAGE_KEYS.tenantId);
  }
  window.localStorage.setItem(STORAGE_KEYS.user, JSON.stringify(session.user));
}

export function loadSession(): StaffSession | null {
  if (typeof window === 'undefined') {
    return null;
  }
  const accessToken = window.localStorage.getItem(STORAGE_KEYS.accessToken);
  if (!accessToken) {
    return null;
  }
  const csrfToken = window.localStorage.getItem(STORAGE_KEYS.csrfToken) || '';
  const tenantId = window.localStorage.getItem(STORAGE_KEYS.tenantId);
  let user: StaffUser | null = null;
  try {
    const rawUser = window.localStorage.getItem(STORAGE_KEYS.user);
    user = rawUser ? (JSON.parse(rawUser) as StaffUser) : null;
  } catch {
    user = null;
  }
  return {
    accessToken,
    csrfToken,
    expiresIn: 900,
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

export function clearSession(): void {
  if (typeof window === 'undefined') {
    return;
  }
  window.localStorage.removeItem(STORAGE_KEYS.accessToken);
  window.localStorage.removeItem(STORAGE_KEYS.csrfToken);
  window.localStorage.removeItem(STORAGE_KEYS.tenantId);
  window.localStorage.removeItem(STORAGE_KEYS.user);
}

/**
 * Reads the double-submit CSRF cookie set by the backend on login/refresh
 * (`__Host-CSRF-Token`, httpOnly: false so JS can echo it — DOC-006 §5.3).
 * Authenticated mutating requests must send it as `X-CSRF-Token`.
 */
export function readCsrfCookie(): string {
  if (typeof document === 'undefined') {
    return '';
  }
  const match = document.cookie.match(/(?:^|;\s*)__Host-CSRF-Token=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : '';
}

/**
 * Best-effort server logout (blacklists the access token, clears the refresh
 * cookie — DOC-006 §5.2) then clears the local session regardless.
 */
export async function logoutStaff(
  session: StaffSession | null,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  if (session?.accessToken) {
    try {
      await fetchImpl(`${resolveApiBase()}/api/v1/auth/logout`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.accessToken}` },
      });
    } catch {
      // Server logout is best-effort; the local session is still cleared.
    }
  }
  clearSession();
}
