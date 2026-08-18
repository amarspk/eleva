import type { CustomerProfile, CustomerSession, CustomerOrderSummary } from './customer-types';

/**
 * Customer self-service API client + session storage (Phase 4 — Customer
 * Account & Profile).
 *
 * The customer session is stored in localStorage under dedicated keys,
 * separate from any staff session, and is sent as `Authorization: Bearer`
 * on customer endpoints. URLs are same-origin relative so the tenant
 * subdomain (and thus TenantContextMiddleware resolution) is preserved.
 */
const TOKEN_KEY = 'eleva_customer_token';
const CSRF_KEY = 'eleva_customer_csrf';

export function getCustomerToken(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function getCustomerCsrf(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(CSRF_KEY);
}

export function saveCustomerSession(session: CustomerSession): void {
  window.localStorage.setItem(TOKEN_KEY, session.token);
  window.localStorage.setItem(CSRF_KEY, session.csrfToken);
}

export function clearCustomerSession(): void {
  window.localStorage.removeItem(TOKEN_KEY);
  window.localStorage.removeItem(CSRF_KEY);
}

export class CustomerApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'CustomerApiError';
  }
}

function extractServerMessage(body: unknown, status: number): string {
  if (body && typeof body === 'object' && 'message' in body) {
    const message = (body as { message: unknown }).message;
    if (typeof message === 'string') return message;
    if (Array.isArray(message)) return message.filter((m) => typeof m === 'string').join(', ');
  }
  return `Request failed (HTTP ${status}).`;
}

async function request<T>(
  path: string,
  init: { method?: string; body?: unknown; auth?: boolean; csrf?: boolean } = {},
): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (init.auth) {
    const token = getCustomerToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
  }
  if (init.csrf) {
    const csrf = getCustomerCsrf();
    if (csrf) headers['X-CSRF-Token'] = csrf;
  }
  const res = await fetch(path, {
    method: init.method ?? 'GET',
    headers,
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  const body: unknown = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new CustomerApiError(extractServerMessage(body, res.status), res.status);
  }
  return body as T;
}

export function registerCustomer(input: {
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber?: string;
  password: string;
}): Promise<CustomerSession> {
  return request<CustomerSession>('/api/v1/public/customers/register', { method: 'POST', body: input });
}

export function loginCustomer(input: { email: string; password: string }): Promise<CustomerSession> {
  return request<CustomerSession>('/api/v1/public/customers/login', { method: 'POST', body: input });
}

export function fetchCustomerProfile(): Promise<CustomerProfile> {
  return request<CustomerProfile>('/api/v1/customer/me', { auth: true });
}

export function updateCustomerProfile(input: {
  firstName?: string;
  lastName?: string;
  phoneNumber?: string;
}): Promise<CustomerProfile> {
  return request<CustomerProfile>('/api/v1/customer/me', { method: 'PUT', body: input, auth: true, csrf: true });
}

export function fetchCustomerOrders(): Promise<CustomerOrderSummary[]> {
  return request<CustomerOrderSummary[]>('/api/v1/customer/orders', { auth: true });
}


export function fetchLoyaltyBalance(): Promise<{ balance: number }> {
  return request<{ balance: number }>('/api/v1/customer/loyalty/me', { auth: true });
}

export function fetchLoyaltyHistory(): Promise<Array<Record<string, unknown>>> {
  return request<Array<Record<string, unknown>>>('/api/v1/customer/loyalty/history', { auth: true });
}

export function redeemLoyaltyPoints(points: number): Promise<{ success: boolean; discountCode: string; discountValue: number; balanceAfter: number }> {
  return request('/api/v1/customer/loyalty/redeem', { method: 'POST', body: { points }, auth: true, csrf: true });
}




export function listMyComplaints(): Promise<Array<Record<string, unknown>>> {
  return request('/api/v1/customer/complaints', { auth: true });
}
export function getMyComplaint(id: string): Promise<Record<string, unknown>> {
  return request(`/api/v1/customer/complaints/${id}`, { auth: true });
}
export function createComplaint(data: { subject: string; description: string; orderId?: string }): Promise<Record<string, unknown>> {
  return request('/api/v1/customer/complaints', { method: 'POST', body: data, auth: true, csrf: true });
}
export function addComplaintMessage(complaintId: string, message: string): Promise<Record<string, unknown>> {
  return request(`/api/v1/customer/complaints/${complaintId}/messages`, { method: 'POST', body: { message }, auth: true, csrf: true });
}

export function fetchWalletBalance(): Promise<{ balance: number; transactions: Array<Record<string, unknown>> }> {
  return request('/api/v1/customer/wallet', { auth: true });
}

export function checkWelcomeEligibility(): Promise<{ eligible: boolean; offer?: { discountType: string; discountValue: number; minOrderAmount: number } }> {
  return request('/api/v1/customer/promotions/welcome-offer', { auth: true });
}

export function customerLogout(): Promise<{ success: boolean }> {
  return request<{ success: boolean }>('/api/v1/customer/logout', { method: 'POST', auth: true, csrf: true });
}
