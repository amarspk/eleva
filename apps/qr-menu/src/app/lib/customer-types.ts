/**
 * Customer self-service contract (Phase 4 — Customer Account & Profile).
 * Mirrors the backend customer-auth surface:
 *   POST /api/v1/public/customers/register
 *   POST /api/v1/public/customers/login
 *   GET  /api/v1/customer/me
 *   PUT  /api/v1/customer/me
 *   GET  /api/v1/customer/orders
 *   POST /api/v1/customer/logout
 */

export interface CustomerProfile {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber: string | null;
  loyaltyPoints: number;
  createdAt: string;
}

export interface CustomerSession {
  token: string;
  csrfToken: string;
  expiresIn: number;
  customer: CustomerProfile;
}

export interface CustomerOrderSummary {
  id: string;
  orderNumber: string;
  status: string;
  type: string;
  paymentMethod: string | null;
  total: number;
  createdAt: string;
  itemCount: number;
  items: Array<{ name: string; quantity: number }>;
}
