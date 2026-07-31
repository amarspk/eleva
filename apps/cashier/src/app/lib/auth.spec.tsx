import {
  clearSession,
  loadSession,
  loginStaff,
  logoutStaff,
  readCsrfCookie,
  resolveApiBase,
  saveSession,
  StaffSession,
} from './auth';

const validLoginPayload = {
  accessToken: 'access-token-1',
  csrfToken: 'csrf-token-1',
  expiresIn: 900,
  user: {
    id: 'user-1',
    tenantId: 'tenant-1',
    email: 'cashier@example.com',
    roles: ['CASHIER'],
    permissions: ['menu:read', 'order:read', 'order:write'],
    firstName: 'Cashier',
    lastName: 'One',
    mfaEnabled: false,
  },
};

const makeSession = (): StaffSession => ({
  accessToken: 'access-token-1',
  csrfToken: 'csrf-token-1',
  expiresIn: 900,
  tenantId: 'tenant-1',
  user: validLoginPayload.user,
});

beforeEach(() => {
  (global.fetch as jest.Mock).mockReset();
  (window.localStorage.getItem as jest.Mock).mockReset();
  (window.localStorage.setItem as jest.Mock).mockReset();
  (window.localStorage.removeItem as jest.Mock).mockReset();
  (window.localStorage.getItem as jest.Mock).mockReturnValue(null);
});

describe('resolveApiBase', () => {
  it('returns the NEXT_PUBLIC_API_URL override when set', () => {
    const previous = process.env.NEXT_PUBLIC_API_URL;
    process.env.NEXT_PUBLIC_API_URL = 'https://api.zayjar.com';
    try {
      expect(resolveApiBase({ hostname: 'cashier.albaik.zayjar.com', protocol: 'https:' })).toBe(
        'https://api.zayjar.com',
      );
    } finally {
      if (previous === undefined) {
        delete process.env.NEXT_PUBLIC_API_URL;
      } else {
        process.env.NEXT_PUBLIC_API_URL = previous;
      }
    }
  });

  it('maps a tenant subdomain in local dev to the API port, preserving the host', () => {
    expect(resolveApiBase({ hostname: 'albaik.localhost', protocol: 'http:' })).toBe(
      'http://albaik.localhost:8000',
    );
  });

  it('maps plain localhost to the API default port', () => {
    expect(resolveApiBase({ hostname: 'localhost', protocol: 'http:' })).toBe('http://localhost:8000');
  });

  it('uses same-origin in production (nginx proxies /api, Host preserved)', () => {
    expect(resolveApiBase({ hostname: 'cashier.albaik.zayjar.com', protocol: 'https:' })).toBe('');
  });
});

describe('loginStaff', () => {
  it('POSTs credentials and returns the session with tenantId from the user', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => validLoginPayload,
    });

    const result = await loginStaff('cashier@example.com', 's3cret');

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/auth/login'),
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'cashier@example.com', password: 's3cret' }),
      }),
    );
    expect(result).toEqual({ ok: true, session: makeSession() });
  });

  it('includes the mfaToken when provided', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => validLoginPayload,
    });

    await loginStaff('cashier@example.com', 's3cret', '123456');

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/auth/login'),
      expect.objectContaining({
        body: JSON.stringify({ email: 'cashier@example.com', password: 's3cret', mfaToken: '123456' }),
      }),
    );
  });

  it('surfaces the MFA challenge as mfaRequired', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ message: 'MFA token required', statusCode: 401 }),
    });

    const result = await loginStaff('cashier@example.com', 's3cret');
    expect(result).toEqual({ ok: false, mfaRequired: true });
  });

  it('returns the server error message for other failures', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ message: 'Invalid credentials', statusCode: 401 }),
    });

    const result = await loginStaff('cashier@example.com', 'wrong');
    expect(result).toEqual({ ok: false, error: 'Invalid credentials' });
  });
});

describe('session persistence', () => {
  it('round-trips a session through localStorage', () => {
    const session = makeSession();
    (window.localStorage.getItem as jest.Mock).mockImplementation((key: string) => {
      if (key === 'accessToken') {
        return session.accessToken;
      }
      if (key === 'csrfToken') {
        return session.csrfToken;
      }
      if (key === 'tenantId') {
        return session.tenantId;
      }
      if (key === 'user') {
        return JSON.stringify(session.user);
      }
      return null;
    });

    saveSession(session);
    expect(loadSession()).toEqual(session);
  });

  it('returns null when no access token is stored', () => {
    (window.localStorage.getItem as jest.Mock).mockReturnValue(null);
    expect(loadSession()).toBeNull();
  });

  it('clears all session keys', () => {
    clearSession();
    expect(window.localStorage.removeItem).toHaveBeenCalledWith('accessToken');
    expect(window.localStorage.removeItem).toHaveBeenCalledWith('csrfToken');
    expect(window.localStorage.removeItem).toHaveBeenCalledWith('tenantId');
    expect(window.localStorage.removeItem).toHaveBeenCalledWith('user');
  });
});

describe('readCsrfCookie', () => {
  it('parses the double-submit CSRF cookie', () => {
    Object.defineProperty(document, 'cookie', {
      configurable: true,
      value: 'other=1; __Host-CSRF-Token=abc123; another=2',
    });
    expect(readCsrfCookie()).toBe('abc123');
  });

  it('returns an empty string when the cookie is absent', () => {
    Object.defineProperty(document, 'cookie', { configurable: true, value: 'other=1' });
    expect(readCsrfCookie()).toBe('');
  });
});

describe('logoutStaff', () => {
  it('POSTs to the logout endpoint with the bearer token and clears the session', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });

    await logoutStaff(makeSession());

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/auth/logout'),
      expect.objectContaining({
        method: 'POST',
        headers: { Authorization: 'Bearer access-token-1' },
      }),
    );
    expect(window.localStorage.removeItem).toHaveBeenCalled();
  });
});
