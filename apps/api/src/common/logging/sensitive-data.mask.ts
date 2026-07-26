const SENSITIVE_PATTERNS: RegExp[] = [
  /password/i,
  /passwd/i,
  /secret/i,
  /token/i,
  /api[_-]?key/i,
  /authorization/i,
  /cookie/i,
  /session/i,
  /credit[_-]?card/i,
  /ssn/i,
  /\bpin\b/i,
  /\botp\b/i,
  /access[_-]?token/i,
  /refresh[_-]?token/i,
  /private[_-]?key/i,
  /secret[_-]?key/i,
  /credential/i,
  /bearer/i,
];

const MASK_VALUE = '***MASKED***';

export function maskValue(value: unknown): unknown {
  if (typeof value !== 'string') { return value; }
  if (value.length === 0) { return value; }
  if (value.length <= 4) { return '****'; }
  return value.substring(0, 2) + '*'.repeat(Math.min(value.length - 4, 8)) + value.substring(value.length - 2);
}

export function isSensitiveKey(key: string): boolean {
  return SENSITIVE_PATTERNS.some((pattern) => pattern.test(key));
}

export function sensitiveFieldsMask(
  obj: Record<string, unknown>,
  additionalPatterns?: string[],
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    const isSensitive =
      isSensitiveKey(key) ||
      (additionalPatterns?.some((p) => new RegExp(p, 'i').test(key)) ?? false);

    if (isSensitive) {
      result[key] = typeof value === 'string' ? maskValue(value) : MASK_VALUE;
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      result[key] = sensitiveFieldsMask(value as Record<string, unknown>, additionalPatterns);
    } else if (Array.isArray(value)) {
      result[key] = value.map((item) =>
        item && typeof item === 'object'
          ? sensitiveFieldsMask(item as Record<string, unknown>, additionalPatterns)
          : item,
      );
    } else {
      result[key] = value;
    }
  }

  return result;
}
