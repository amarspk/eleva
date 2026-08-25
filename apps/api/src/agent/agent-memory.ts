const KEY_RE = /^[a-z0-9][a-z0-9-]{0,62}$/;
const MAX_VALUE = 2000;
const SECRETISH = /password|secret|token|apikey|authorization|credential/i;
const TENANT_DATA = /\b(customerId|orderId|tenantId|email@|loyaltyPoints)\b/i;

export interface AgentMemoryRecord {
  key: string;
  value: string;
  source: string;
  status: 'VERIFIED' | 'OWNER';
  updatedByUserId: string;
}

export function parseMemoryKey(raw: unknown): string {
  const key = String(raw ?? '').trim().toLowerCase();
  if (!KEY_RE.test(key)) {
    throw new Error('remember_project_memory requires key matching [a-z0-9][a-z0-9-]{0,62}.');
  }
  if (SECRETISH.test(key)) {
    throw new Error('Memory keys must not name secrets or credentials.');
  }
  return key;
}

export function parseMemoryValue(raw: unknown): string {
  const value = String(raw ?? '');
  if (!value.trim() || value.includes('\0') || value.length > MAX_VALUE) {
    throw new Error(`Memory value must be 1–${MAX_VALUE} characters and must not contain NUL.`);
  }
  if (SECRETISH.test(value) || TENANT_DATA.test(value)) {
    throw new Error('Memory value must not contain secrets or restaurant/order/customer identifiers.');
  }
  return value.trim();
}

export function parseMemorySource(raw: unknown): string {
  const source = String(raw ?? 'owner').trim().slice(0, 200);
  if (!source || source.includes('\0') || source.includes('..') || source.startsWith('/')) {
    throw new Error('Memory source must be a short relative label (e.g. PROJECT_STATE.md or owner).');
  }
  if (SECRETISH.test(source) || source.startsWith('.env')) {
    throw new Error('Memory source must not point at secrets.');
  }
  return source;
}

export function formatMemoryExcerpt(rows: Array<{ key?: unknown; value?: unknown; source?: unknown; status?: unknown }>): string {
  if (!rows.length) {
    return 'PROJECT_MEMORY: (empty)';
  }
  return [
    'PROJECT_MEMORY (cross-session, platform-owned, not tenant data):',
    ...rows.slice(0, 30).map((row) => `- [${String(row.key)}] (${String(row.status || 'VERIFIED')}, source=${String(row.source || 'unknown')}): ${String(row.value).slice(0, 300)}`),
  ].join('\n');
}
