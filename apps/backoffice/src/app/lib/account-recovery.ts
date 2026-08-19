/**
 * AUDIT-005 — public staff password-reset and email-verification client.
 * Uses the existing @Public() auth endpoints. No new auth system.
 */

import { resolveApiBase } from './auth';

export type RecoveryResult =
  | { ok: true; message: string }
  | { ok: false; error: string };

function extractMessage(body: unknown, fallback: string): string {
  if (body && typeof body === 'object' && 'message' in body) {
    const message = (body as { message: unknown }).message;
    if (typeof message === 'string' && message.length > 0) {
      return message;
    }
    if (Array.isArray(message)) {
      const joined = message.filter((item): item is string => typeof item === 'string').join(', ');
      if (joined.length > 0) {
        return joined;
      }
    }
  }
  return fallback;
}

async function postPublicAuth(
  path: '/api/v1/auth/reset-password' | '/api/v1/auth/verify-email',
  body: Record<string, string>,
  fetchImpl: typeof fetch = fetch,
): Promise<RecoveryResult> {
  const response = await fetchImpl(`${resolveApiBase()}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    credentials: 'include',
    body: JSON.stringify(body),
  });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    return { ok: false, error: extractMessage(payload, 'The link is invalid or has expired.') };
  }
  return { ok: true, message: extractMessage(payload, 'Done.') };
}

export function resetStaffPassword(
  token: string,
  password: string,
  fetchImpl: typeof fetch = fetch,
): Promise<RecoveryResult> {
  return postPublicAuth('/api/v1/auth/reset-password', { token, password }, fetchImpl);
}

export function verifyStaffEmail(
  token: string,
  fetchImpl: typeof fetch = fetch,
): Promise<RecoveryResult> {
  return postPublicAuth('/api/v1/auth/verify-email', { token }, fetchImpl);
}
