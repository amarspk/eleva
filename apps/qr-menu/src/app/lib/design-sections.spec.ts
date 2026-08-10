import { resolveSectionProducts } from './design-sections';
import type { PublicProduct } from './types';

// ==========================================
// CTO decision 2026-08-10 (§14 #26): featured/popular sections select
// products explicitly via config.productIds; legacy slice is the fallback
// for designs published before the decision.
// ==========================================

const A: PublicProduct = { id: 'p-a', name: 'Alpha', description: null, imageUrl: null, basePrice: 1, calories: null, preparationTime: 5, isAvailable: true, sizes: [], variants: [], addons: [] };
const B: PublicProduct = { id: 'p-b', name: 'Beta', description: null, imageUrl: null, basePrice: 2, calories: null, preparationTime: 5, isAvailable: true, sizes: [], variants: [], addons: [] };
const C: PublicProduct = { id: 'p-c', name: 'Gamma', description: null, imageUrl: null, basePrice: 3, calories: null, preparationTime: 5, isAvailable: true, sizes: [], variants: [], addons: [] };
const D: PublicProduct = { id: 'p-d', name: 'Delta', description: null, imageUrl: null, basePrice: 4, calories: null, preparationTime: 5, isAvailable: true, sizes: [], variants: [], addons: [] };
const E: PublicProduct = { id: 'p-e', name: 'Epsilon', description: null, imageUrl: null, basePrice: 5, calories: null, preparationTime: 5, isAvailable: true, sizes: [], variants: [], addons: [] };
const F: PublicProduct = { id: 'p-f', name: 'Zeta', description: null, imageUrl: null, basePrice: 6, calories: null, preparationTime: 5, isAvailable: true, sizes: [], variants: [], addons: [] };

const FLAT = [A, B, C, D, E, F];

it('explicit productIds: returns only the listed tenant products, in productIds order (not menu order)', () => {
  // deliberately reversed vs menu order to prove order preservation
  const prods = resolveSectionProducts(
    { id: 'f', type: 'featured', enabled: true, order: 0, config: { variant: 'grid', productIds: ['p-c', 'p-a', 'p-e'] } },
    FLAT,
  );
  expect(prods.map((p) => p.id)).toEqual(['p-c', 'p-a', 'p-e']);
});

it('explicit productIds: foreign/unknown ids are skipped silently (tenant-safe, no oracle)', () => {
  const prods = resolveSectionProducts(
    { id: 'f', type: 'featured', enabled: true, order: 0, config: { productIds: ['p-b', 'foreign-tenant-id', 'nope'] } },
    FLAT,
  );
  expect(prods.map((p) => p.id)).toEqual(['p-b']);
});

it('explicit productIds: duplicates are deduplicated by first occurrence', () => {
  const prods = resolveSectionProducts(
    { id: 'f', type: 'featured', enabled: true, order: 0, config: { productIds: ['p-a', 'p-b', 'p-a'] } },
    FLAT,
  );
  expect(prods.map((p) => p.id)).toEqual(['p-a', 'p-b']);
});

it('explicit productIds: empty array behaves like legacy fallback (designs with no selection)', () => {
  const prods = resolveSectionProducts(
    { id: 'f', type: 'featured', enabled: true, order: 0, config: { productIds: [] } },
    FLAT,
  );
  expect(prods.map((p) => p.id)).toEqual(['p-a', 'p-b', 'p-c', 'p-d']);
});

it('legacy fallback: featured without productIds keeps the pre-decision slice (first 4)', () => {
  const prods = resolveSectionProducts({ id: 'f', type: 'featured', enabled: true, order: 0, config: { variant: 'grid' } }, FLAT);
  expect(prods.map((p) => p.id)).toEqual(['p-a', 'p-b', 'p-c', 'p-d']);
});

it('legacy fallback: popular without productIds keeps the pre-decision slice (4..8)', () => {
  const prods = resolveSectionProducts({ id: 'p', type: 'popular', enabled: true, order: 0, config: { variant: 'grid' } }, FLAT);
  expect(prods.map((p) => p.id)).toEqual(['p-e', 'p-f']);
});

it('legacy fallback: short menus do not over-slice (featured, 3 products)', () => {
  const prods = resolveSectionProducts({ id: 'f', type: 'featured', enabled: true, order: 0, config: {} }, [A, B, C]);
  expect(prods.map((p) => p.id)).toEqual(['p-a', 'p-b', 'p-c']);
});
