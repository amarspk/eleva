import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { DesignBuilder } from './DesignBuilder';

const fetchMock = global.fetch as jest.Mock;
const sessionStore: Record<string, string> = {
  accessToken: 'a4-access-token',
  csrfToken: 'a4-csrf-token',
  tenantId: 'tenant-a',
  user: JSON.stringify({ id: 'user-a', tenantId: 'tenant-a', email: 'owner@example.com' }),
};

function response(body: unknown, ok = true, status = ok ? 200 : 500): Response {
  return { ok, status, json: jest.fn().mockResolvedValue(body) } as unknown as Response;
}

function mockLoadedDesign(options: {
  draftSave?: Response;
  publish?: Response;
  restore?: Response;
  versions?: Array<{ id: string; version: number; createdAt: string }>;
} = {}) {
  const draft = {
    colors: { primary: '#FF5733', secondary: '#FFFFFF' },
    fonts: { heading: 'Inter', body: 'Inter' },
    sections: [
      { id: 'hero', type: 'hero', enabled: true, order: 0, config: { variant: 'split' } },
    ],
  };

  fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    if (url.includes('/v1/design/tenant/tenant-a?preview=true')) {
      return response({ draft, version: 1 });
    }
    if (url.endsWith('/v1/design/tenant/tenant-a/versions')) {
      return response(options.versions ?? []);
    }
    if (url.endsWith('/v1/menu/products')) { return response([]); }
    if (url.endsWith('/v1/design/tenant/tenant-a/draft') && method === 'PUT') {
      return options.draftSave ?? response({ version: 2 });
    }
    if (url.endsWith('/v1/design/tenant/tenant-a/publish') && method === 'POST') {
      return options.publish ?? response({ version: 2 });
    }
    if (url.includes('/v1/design/tenant/tenant-a/restore/') && method === 'POST') {
      return options.restore ?? response({ version: 3 });
    }
    if (url.endsWith('/v1/tenants/tenant-a') && method === 'PUT') { return response({}); }
    throw new Error(`Unexpected request: ${method} ${url}`);
  });
}

describe('DesignBuilder save/publish integrity UI', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    (window.localStorage.getItem as jest.Mock).mockImplementation((key: string) => sessionStore[key] ?? null);
    (window.localStorage.removeItem as jest.Mock).mockImplementation((key: string) => {
      delete sessionStore[key];
    });
    sessionStore.accessToken = 'a4-access-token';
    sessionStore.csrfToken = 'a4-csrf-token';
    sessionStore.tenantId = 'tenant-a';
    sessionStore.user = JSON.stringify({ id: 'user-a', tenantId: 'tenant-a', email: 'owner@example.com' });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('does not autosave the default draft before the server draft has hydrated', async () => {
    jest.useFakeTimers();
    let resolveLoad!: (value: Response) => void;
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('?preview=true')) {
        return new Promise<Response>((resolve) => { resolveLoad = resolve; });
      }
      return Promise.resolve(response([]));
    });

    render(<DesignBuilder tenantId="tenant-a" />);
    act(() => { jest.advanceTimersByTime(5000); });

    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'PUT')).toBe(false);

    await act(async () => {
      resolveLoad(response({ draft: { colors: {}, sections: [] }, version: 1 }));
      await Promise.resolve();
    });
  });

  it('does not report saved or autosave when the initial design load fails', async () => {
    jest.useFakeTimers();
    fetchMock.mockResolvedValue(response({ message: 'design unavailable' }, false, 503));

    render(<DesignBuilder tenantId="tenant-a" />);

    expect(await screen.findByText('design unavailable')).toBeInTheDocument();
    expect(screen.getByText('Save failed')).toBeInTheDocument();
    expect(screen.queryByText(/Saved v/)).not.toBeInTheDocument();
    act(() => { jest.advanceTimersByTime(5000); });
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'PUT')).toBe(false);
  });

  it('shows a failed state, never success, when autosave returns an error', async () => {
    jest.useFakeTimers();
    mockLoadedDesign({ draftSave: response({ message: 'database unavailable' }, false, 500) });
    render(<DesignBuilder tenantId="tenant-a" />);
    await screen.findByText('Saved v1');

    fireEvent.change(screen.getByLabelText('Primary'), { target: { value: '#112233' } });
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument();
    await act(async () => {
      jest.advanceTimersByTime(900);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(await screen.findByText('Save failed')).toBeInTheDocument();
    expect(screen.getByText('database unavailable')).toBeInTheDocument();
    expect(screen.queryByText('Auto-saved')).not.toBeInTheDocument();
  });

  it('autosaves one revision once and reports the returned version only after success', async () => {
    jest.useFakeTimers();
    mockLoadedDesign();
    render(<DesignBuilder tenantId="tenant-a" />);
    await screen.findByText('Saved v1');

    fireEvent.change(screen.getByLabelText('Primary'), { target: { value: '#112233' } });
    await act(async () => {
      jest.advanceTimersByTime(900);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(await screen.findByText('Saved v2')).toBeInTheDocument();
    expect(screen.getByText('Auto-saved')).toBeInTheDocument();
    act(() => { jest.advanceTimersByTime(5000); });
    const draftPuts = fetchMock.mock.calls.filter(([url, init]) =>
      String(url).endsWith('/draft') && init?.method === 'PUT',
    );
    expect(draftPuts).toHaveLength(1);
  });

  it('does not report published when publish fails', async () => {
    mockLoadedDesign({ publish: response({ message: 'publish transaction rolled back' }, false, 500) });
    render(<DesignBuilder tenantId="tenant-a" />);
    await screen.findByText('Saved v1');

    fireEvent.click(screen.getByRole('button', { name: 'Publish' }));

    expect(await screen.findByText('publish transaction rolled back')).toBeInTheDocument();
    expect(screen.getByText('Save failed')).toBeInTheDocument();
    expect(screen.queryByText('Published!')).not.toBeInTheDocument();
  });

  it('does not report restored or reload when restore fails', async () => {
    mockLoadedDesign({
      versions: [{ id: 'version-1', version: 1, createdAt: '2026-08-13T00:00:00.000Z' }],
      restore: response({ message: 'restore transaction rolled back' }, false, 500),
    });
    render(<DesignBuilder tenantId="tenant-a" />);
    await screen.findByRole('button', { name: 'Restore' });
    const loadCallsBeforeRestore = fetchMock.mock.calls.filter(([url]) => String(url).includes('?preview=true')).length;

    fireEvent.click(screen.getByRole('button', { name: 'Restore' }));

    expect(await screen.findByText('restore transaction rolled back')).toBeInTheDocument();
    expect(screen.queryByText('Restored v1')).not.toBeInTheDocument();
    const loadCallsAfterRestore = fetchMock.mock.calls.filter(([url]) => String(url).includes('?preview=true')).length;
    expect(loadCallsAfterRestore).toBe(loadCallsBeforeRestore);
  });

  it('uses the standard design route with bearer and CSRF headers', async () => {
    jest.useFakeTimers();
    mockLoadedDesign();
    render(<DesignBuilder tenantId="tenant-a" />);
    await screen.findByText('Saved v1');

    const designGet = fetchMock.mock.calls.find(([url]) =>
      String(url).includes('/api/v1/design/tenant/tenant-a?preview=true'),
    );
    expect(designGet?.[1].headers.Authorization).toBe('Bearer a4-access-token');
    expect(designGet?.[1].headers['X-Tenant-ID']).toBe('tenant-a');

    fireEvent.change(screen.getByLabelText('Primary'), { target: { value: '#445566' } });
    await act(async () => {
      jest.advanceTimersByTime(900);
      await Promise.resolve();
      await Promise.resolve();
    });

    const draftPut = fetchMock.mock.calls.find(([url, init]) =>
      String(url).endsWith('/api/v1/design/tenant/tenant-a/draft') && init?.method === 'PUT',
    );
    expect(draftPut?.[1].headers.Authorization).toBe('Bearer a4-access-token');
    expect(draftPut?.[1].headers['X-CSRF-Token']).toBe('a4-csrf-token');
  });
});
