/**
 * Phase 4 P1 — logo / brand-aware color suggestions for the Design Builder.
 *
 * Suggestions come from (1) the tenant's existing brand colors and (2) a
 * sampled average of the logo image. No invented palette is hard-coded as
 * the restaurant identity.
 */

export function normalizeHex(value: string | null | undefined): string | null {
  if (!value) {return null;}
  const trimmed = value.trim();
  const match = /^#?([0-9a-fA-F]{6})$/.exec(trimmed);
  if (!match) {return null;}
  return `#${match[1].toUpperCase()}`;
}

export function rgbToHex(r: number, g: number, b: number): string {
  const to = (n: number): string => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  return `#${to(r)}${to(g)}${to(b)}`.toUpperCase();
}

export function suggestFromBrand(primary?: string | null, secondary?: string | null): string[] {
  const out: string[] = [];
  const p = normalizeHex(primary);
  const s = normalizeHex(secondary);
  if (p) {out.push(p);}
  if (s && s !== p) {out.push(s);}
  return out;
}

/** Average the sampled pixels; skip near-white / near-transparent samples. */
export function suggestFromImageData(data: Uint8ClampedArray): string[] {
  let r = 0;
  let g = 0;
  let b = 0;
  let count = 0;
  for (let i = 0; i < data.length; i += 16) {
    const alpha = data[i + 3];
    const rr = data[i];
    const gg = data[i + 1];
    const bb = data[i + 2];
    if (alpha < 32) {continue;}
    if (rr > 245 && gg > 245 && bb > 245) {continue;}
    r += rr;
    g += gg;
    b += bb;
    count += 1;
  }
  if (count === 0) {return [];}
  return [rgbToHex(r / count, g / count, b / count)];
}

export function uniqueSuggestions(...groups: string[][]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const group of groups) {
    for (const hex of group) {
      const n = normalizeHex(hex);
      if (!n || seen.has(n)) {continue;}
      seen.add(n);
      out.push(n);
    }
  }
  return out;
}
