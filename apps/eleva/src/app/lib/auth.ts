/**
 * Executive Office authentication client.
 *
 * Uses the existing backend auth surface without inventing new auth paths:
 * - POST /api/v1/auth/login
 * - POST /api/v1/auth/refresh
 * - POST /api/v1/auth/logout
 * - GET /api/v1/auth/me
 */

export interface ELEVAUser {
  id: string;
  tenantId: string | null;
  email: string;
  roles: string[];
  permissions: string[];
  firstName: string | null;
  lastName: string | null;
  mfaEnabled: boolean;
}

export interface ElevaSession {
  accessToken: string;
  csrfToken: string;
  expiresIn: number;
  tenantId: string | null;
  user: ELEVAUser;
}

export type LoginElevaResult =
  | { ok: true; session: ElevaSession }
  | { ok: false; mfaRequired: true }
  | { ok: false; error: string };

const STORAGE_KEYS = {
  accessToken: 'eleva_accessToken',
  csrfToken: 'eleva_csrfToken',
  tenantId: 'eleva_tenantId',
  user: 'eleva_user',
} as const;

function extractServerMessage(body: unknown, status: number): string {
  if (body && typeof body === 'object' && 'message' in body) {
    const message = (body as { message: unknown }).message;
    if (typeof message === 'string' && message.length > 0) {
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
  user: ELEVAUser;
}): ElevaSession {
  return {
    accessToken: data.accessToken,
    csrfToken: data.csrfToken || '',
    expiresIn: data.expiresIn || 900,
    tenantId: data.user.tenantId ?? null,
    user: data.user,
  };
}

export function resolveApiBase(): string {
  const configured = process.env.NEXT_PUBLIC_API_URL;
  if (configured) {
    return configured.replace(/\/$/, '');
  }
  return '';
}

export async function loginEleva(
  email: string,
  password: string,
  mfaToken?: string,
  fetchImpl: typeof fetch = fetch,
): Promise<LoginElevaResult> {
  const body: { email: string; password: string; mfaToken?: string } = { email, password };
  if (mfaToken) {
    body.mfaToken = mfaToken;
  }

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (typeof window !== 'undefined') {
    const storedTenantId = window.localStorage.getItem(STORAGE_KEYS.tenantId);
    if (storedTenantId) {
      headers['X-Tenant-ID'] = storedTenantId;
    }
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
      user: ELEVAUser;
    }),
  };
}

export async function fetchMe(
  accessToken: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ELEVAUser> {
  const res = await fetchImpl(`${resolveApiBase()}/api/v1/auth/me`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
    credentials: 'include',
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(extractServerMessage(body, res.status) || 'Session refresh failed.');
  }

  const payload = (await res.json()) as { user: ELEVAUser };
  return payload.user;
}

export async function refreshElevaSession(fetchImpl: typeof fetch = fetch): Promise<ElevaSession | null> {
  const res = await fetchImpl(`${resolveApiBase()}/api/v1/auth/refresh`, {
    method: 'POST',
    headers: { Accept: 'application/json' },
    credentials: 'include',
  });

  if (!res.ok) {
    clearSession();
    return null;
  }

  const payload = (await res.json()) as {
    accessToken: string;
    csrfToken: string;
    expiresIn: number;
  };

  const existing = loadSession();
  const session: ElevaSession = {
    accessToken: payload.accessToken,
    csrfToken: payload.csrfToken,
    expiresIn: payload.expiresIn,
    tenantId: existing?.tenantId ?? null,
    user: existing?.user ?? {
      id: '',
      tenantId: null,
      email: '',
      roles: [],
      permissions: [],
      firstName: null,
      lastName: null,
      mfaEnabled: false,
    },
  };

  saveSession(session);
  return session;
}

export async function logoutEleva(session: ElevaSession | null): Promise<void> {
  if (session?.accessToken) {
    try {
      await fetch(`${resolveApiBase()}/api/v1/auth/logout`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.accessToken}` },
        credentials: 'include',
      });
    } catch {
      // Best-effort server logout.
    }
  }
  clearSession();
}

export function saveSession(session: ElevaSession): void {
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

export function loadSession(): ElevaSession | null {
  if (typeof window === 'undefined') {
    return null;
  }
  const accessToken = window.localStorage.getItem(STORAGE_KEYS.accessToken);
  if (!accessToken) {
    return null;
  }
  const csrfToken = window.localStorage.getItem(STORAGE_KEYS.csrfToken) || '';
  const tenantId = window.localStorage.getItem(STORAGE_KEYS.tenantId);
  let user: ELEVAUser | null = null;
  try {
    const rawUser = window.localStorage.getItem(STORAGE_KEYS.user);
    user = rawUser ? (JSON.parse(rawUser) as ELEVAUser) : null;
  } catch {
    user = null;
  }

  return {
    accessToken,
    csrfToken,
    expiresIn: 900,
    tenantId: tenantId || user?.tenantId || null,
    user: user ?? {
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
