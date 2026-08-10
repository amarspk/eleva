import type { PublicProduct } from './types';

/**
 * Phase 3 — Eleva public design types.
 *
 * CTO decision 2026-08-10 (PROJECT_STATE §14 #26): `featured`/`popular`
 * sections select products EXPLICITLY via `config.productIds` — tenant-owned
 * product ids stored in the published/draft design JSON (drafts, versions,
 * previews and restores with the design). Resolution is tenant-safe by
 * construction: ids are matched only against the tenant's own products
 * returned by the tenant-scoped public menu, so a foreign/unknown id renders
 * nothing (no existence oracle, no cross-tenant vector). Section display
 * order follows `productIds` order.
 */
export interface DesignSection {
  id?: string;
  type: string;
  enabled?: boolean;
  order?: number;
  config?: {
    variant?: string;
    productIds?: string[];
  };
}

export interface TenantDesignPayload {
  colors?: { primary?: string };
  sections?: DesignSection[];
  logo?: string;
  coverImage?: string;
}

/**
 * Resolves the products a featured/popular section must render.
 *
 * - `config.productIds` present and non-empty: the tenant's products whose id
 *   is listed, in `productIds` order (duplicates and foreign ids ignored).
 * - otherwise: LEGACY fallback for designs published before this decision —
 *   the curated-by-position slice (featured = first 4, popular = 4..8 of the
 *   flattened tenant menu), byte-identical to the pre-decision behavior.
 */
export function resolveSectionProducts(
  sec: DesignSection,
  flatProducts: PublicProduct[],
): PublicProduct[] {
  const ids = sec.config?.productIds;
  if (Array.isArray(ids) && ids.length > 0) {
    const byId = new Map(flatProducts.map((p) => [p.id, p]));
    const out: PublicProduct[] = [];
    const seen = new Set<string>();
    for (const id of ids) {
      if (seen.has(id)) {
        continue; // duplicates are ignored (first occurrence wins)
      }
      seen.add(id);
      const p = byId.get(id);
      if (p) {
        out.push(p);
      }
    }
    return out;
  }
  return flatProducts.slice(
    sec.type === 'popular' ? 4 : 0,
    sec.type === 'popular' ? 8 : 4,
  );
}
