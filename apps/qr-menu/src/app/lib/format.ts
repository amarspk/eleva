/**
 * Price display helper. The authoritative currency comes from the public API
 * (restaurant.currency). 'USD' is only a display-layer fallback for callers
 * that render without an API context (e.g. isolated component tests).
 */
export function formatPrice(amount: number, currency = 'USD'): string {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount);
  } catch {
    return `$${amount.toFixed(2)}`;
  }
}
