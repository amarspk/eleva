import { Injectable, Logger } from '@nestjs/common';
import xss from 'xss';

/**
 * DOC-006 §5.4 — Input Sanitization Service
 *
 * Provides recursive sanitization of arbitrary object trees, stripping
 * malicious HTML/scripts from all string values before they reach
 * database storage or template rendering.
 *
 * Uses the `xss` library (pure CJS, no ESM dependency chain issues)
 * with a strict whitelist that strips ALL HTML tags.
 */
@Injectable()
export class SanitizationService {
  private readonly logger = new Logger('SanitizationService');

  /**
   * Recursively walks an object tree and sanitizes every string value.
   * Non-string primitives and functions are left untouched.
   * Returns a new object — the original is never mutated.
   */
  sanitize<T>(input: T): T {
    return this.walk(input) as T;
  }

  /**
   * Sanitizes a single string value. Returns the cleaned plain text.
   * Returns the input unchanged if it is not a string or is empty.
   */
  sanitizeString(value: string): string {
    if (typeof value !== 'string' || value.length === 0) {
      return value;
    }
    // Strip all HTML tags — empty whitelist means nothing survives
    return xss(value, {
      whiteList: {},
      stripIgnoreTag: true,
      stripIgnoreTagBody: ['script', 'style'],
    });
  }

  private walk(value: unknown): unknown {
    if (value === null || value === undefined) {
      return value;
    }

    if (typeof value === 'string') {
      return this.sanitizeString(value);
    }

    if (Array.isArray(value)) {
      return value.map((item) => this.walk(item));
    }

    if (typeof value === 'object') {
      const result: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
        result[key] = this.walk(val);
      }
      return result;
    }

    // Numbers, booleans, functions — pass through unchanged
    return value;
  }
}
