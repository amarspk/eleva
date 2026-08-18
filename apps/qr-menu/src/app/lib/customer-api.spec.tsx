import {
  registerCustomer,
  loginCustomer,
  fetchCustomerProfile,
  updateCustomerProfile,
  fetchCustomerOrders,
  customerLogout,
  saveCustomerSession,
  getCustomerToken,
  clearCustomerSession,
} from './customer-api';

const session = {
  token: 'customer-token-1',
  csrfToken: 'csrf-1',
  expiresIn: 2592000,
  customer: {
    id: 'customer-1', firstName: 'Sara', lastName: 'Ali', email: 'sara@example.com',
    phoneNumber: '+96891234567', loyaltyPoints: 0, createdAt: '2026-08-18T10:00:00.000Z',
  },
};

function installRealLocalStorage(): void {
  const store = new Map<string, string>();
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => { store.set(k, String(v)); },
      removeItem: (k: string) => { store.delete(k); },
      clear: () => { store.clear(); },
    },
  });
}

describe('customer-api (Phase 4 — Customer Account client)', () => {
  beforeEach(() => {
    installRealLocalStorage();
    (global.fetch as jest.Mock).mockReset();
  });

  it('registers a customer via the public endpoint', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => session });
    const result = await registerCustomer({
      firstName: 'Sara', lastName: 'Ali', email: 'sara@example.com', password: 'secret123',
    });
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/v1/public/customers/register',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(result.token).toBe('customer-token-1');
  });

  it('logs a customer in via the public endpoint', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => session });
    const result = await loginCustomer({ email: 'sara@example.com', password: 'secret123' });
    expect(global.fetch).toHaveBeenCalledWith('/api/v1/public/customers/login', expect.anything());
    expect(result.customer.email).toBe('sara@example.com');
  });

  it('fetches the profile with the stored customer token', async () => {
    window.localStorage.setItem('eleva_customer_token', 'customer-token-1');
    (global.fetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => session.customer });
    await fetchCustomerProfile();
    const [, init] = (global.fetch as jest.Mock).mock.calls[0] as [string, { headers: Record<string, string> }];
    expect(init.headers['Authorization']).toBe('Bearer customer-token-1');
  });

  it('sends the CSRF token on profile updates', async () => {
    window.localStorage.setItem('eleva_customer_token', 'customer-token-1');
    window.localStorage.setItem('eleva_customer_csrf', 'csrf-1');
    (global.fetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => session.customer });
    await updateCustomerProfile({ firstName: 'Saraa' });
    const [, init] = (global.fetch as jest.Mock).mock.calls[0] as [string, { headers: Record<string, string>; method: string }];
    expect(init.method).toBe('PUT');
    expect(init.headers['X-CSRF-Token']).toBe('csrf-1');
  });

  it('fetches own order history', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => [] });
    const orders = await fetchCustomerOrders();
    expect(global.fetch).toHaveBeenCalledWith('/api/v1/customer/orders', expect.anything());
    expect(orders).toEqual([]);
  });

  it('throws a readable error on a 401 from the API', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({ ok: false, status: 401, json: async () => ({ message: 'Invalid email or password.' }) });
    await expect(loginCustomer({ email: 'x@y.z', password: 'badpass1' })).rejects.toThrow('Invalid email or password.');
  });

  it('logs out via the customer endpoint', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => ({ success: true }) });
    await expect(customerLogout()).resolves.toEqual({ success: true });
  });

  it('persists and clears the customer session in localStorage', () => {
    saveCustomerSession(session);
    expect(getCustomerToken()).toBe('customer-token-1');
    clearCustomerSession();
    expect(getCustomerToken()).toBeNull();
  });
});