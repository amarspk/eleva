/**
 * @jest-environment jsdom
 */
import { ApiError, apiErrorMessage, apiRequest, resolveCsrfToken } from './api-client';

/**
 * AUDIT-014 — shared API client.
 *
 * The most important guarantee here is the CSRF header: `CsrfGuard` rejects any
 * authenticated POST/PUT/DELETE that omits `X-CSRF-Token` with a 403
 * ("CSRF token is required for mutating requests"). Before DEFECT-I was fixed
 * the guard was inert and a missing header went unnoticed, so these tests pin
 * the client behaviour that the fixed guard now depends on.
 */

const STORE: Record<string, string> = {};

beforeEach(() => {
  for (const key of Object.keys(STORE)) {
    delete STORE[key];
  }
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: {
      getItem: (k: string) => (k in STORE ? STORE[k] : null),
      setItem: (k: string, v: string) => {
        STORE[k] = v;
      },
      removeItem: (k: string) => {
        delete STORE[k];
      },
      clear: () => undefined,
    },
  });
  Object.defineProperty(document, 'cookie', { configurable: true, writable: true, value: '' });
  STORE.accessToken = 'test-access-token';
  STORE.csrfToken = 'test-csrf-token';
  STORE.tenantId = '80a00898-782c-4a6e-8bad-880e8f4f7977';
  STORE.user = JSON.stringify({ id: 'u1', tenantId: STORE.tenantId, email: 'a@b.c' });
});

function mockFetch(status: number, body: unknown): jest.Mock {
  return jest.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });
}

describe('apiRequest headers', () => {
  it('attaches the bearer token', async () => {
    const fetchImpl = mockFetch(200, []);
    await apiRequest('/api/v1/menu/products', { fetchImpl: fetchImpl as unknown as typeof fetch });
    const headers = fetchImpl.mock.calls[0][1].headers;
    expect(headers.Authorization).toBe('Bearer test-access-token');
  });

  it('attaches the tenant header from the session', async () => {
    const fetchImpl = mockFetch(200, []);
    await apiRequest('/api/v1/menu/products', { fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(fetchImpl.mock.calls[0][1].headers['X-Tenant-ID']).toBe(STORE.tenantId);
  });

  it.each(['POST', 'PUT', 'DELETE', 'PATCH'])(
    'sends X-CSRF-Token on %s (CsrfGuard 403s without it)',
    async (method) => {
      const fetchImpl = mockFetch(200, {});
      await apiRequest('/api/v1/menu/products/x', {
        method,
        fetchImpl: fetchImpl as unknown as typeof fetch,
      });
      expect(fetchImpl.mock.calls[0][1].headers['X-CSRF-Token']).toBe('test-csrf-token');
    },
  );

  it('does not send X-CSRF-Token on GET', async () => {
    const fetchImpl = mockFetch(200, []);
    await apiRequest('/api/v1/menu/products', { fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(fetchImpl.mock.calls[0][1].headers['X-CSRF-Token']).toBeUndefined();
  });

  it('includes credentials so __Host-* cookies travel cross-origin', async () => {
    const fetchImpl = mockFetch(200, []);
    await apiRequest('/api/v1/menu/products', { fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(fetchImpl.mock.calls[0][1].credentials).toBe('include');
  });

  it('falls back to the __Host-CSRF-Token cookie when the session lacks one', () => {
    delete STORE.csrfToken;
    (document as unknown as { cookie: string }).cookie = '__Host-CSRF-Token=cookie-csrf-value';
    expect(resolveCsrfToken()).toBe('cookie-csrf-value');
  });
});

describe('apiRequest error handling', () => {
  it('throws ApiError carrying the server message string', async () => {
    const fetchImpl = mockFetch(404, { message: 'The requested Product with ID [x] was not found.' });
    await expect(
      apiRequest('/api/v1/menu/products/x', { fetchImpl: fetchImpl as unknown as typeof fetch }),
    ).rejects.toThrow('The requested Product with ID [x] was not found.');
  });

  it('joins class-validator message arrays into one readable string', async () => {
    const fetchImpl = mockFetch(400, {
      message: ['name must be longer than or equal to 2 characters', 'basePrice must not be less than 0'],
    });
    await expect(
      apiRequest('/api/v1/menu/products', {
        method: 'POST',
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
    ).rejects.toThrow(/name must be longer.*basePrice must not be less than 0/);
  });

  it('classifies 401 / 403 / 409 for the UI', async () => {
    for (const [status, flag] of [
      [401, 'isAuthError'],
      [403, 'isForbidden'],
      [409, 'isConflict'],
    ] as const) {
      const fetchImpl = mockFetch(status, { message: 'nope' });
      try {
        await apiRequest('/x', { method: 'PUT', fetchImpl: fetchImpl as unknown as typeof fetch });
        throw new Error('should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        expect((error as ApiError)[flag]).toBe(true);
      }
    }
  });

  it('produces a sane message when the body is not JSON', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: false,
      status: 502,
      json: async () => {
        throw new Error('not json');
      },
    });
    await expect(
      apiRequest('/x', { fetchImpl: fetchImpl as unknown as typeof fetch }),
    ).rejects.toThrow('Request failed (HTTP 502).');
  });

  it('handles 204 No Content without trying to parse a body', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({ ok: true, status: 204, json: async () => null });
    await expect(
      apiRequest('/x', { method: 'DELETE', fetchImpl: fetchImpl as unknown as typeof fetch }),
    ).resolves.toBeUndefined();
  });

  it('clears a rejected session and centralizes the operator-facing 401 message', async () => {
    const fetchImpl = mockFetch(401, { message: 'Unauthorized' });
    let caught: unknown;
    try {
      await apiRequest('/x', { fetchImpl: fetchImpl as unknown as typeof fetch });
    } catch (error) {
      caught = error;
    }

    expect(STORE.accessToken).toBeUndefined();
    expect(apiErrorMessage(caught, 'Load failed')).toBe('Your session has expired. Sign in again.');
  });

  it('normalizes transport failures as ApiError instead of leaking raw fetch failures', async () => {
    const fetchImpl = jest.fn().mockRejectedValue(new TypeError('network offline'));
    await expect(
      apiRequest('/x', { fetchImpl: fetchImpl as unknown as typeof fetch }),
    ).rejects.toMatchObject({
      name: 'ApiError',
      status: 0,
      message: 'Unable to reach the API. network offline',
    });
  });
});
