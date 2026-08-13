import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MediaLibrary } from './MediaLibrary';

const fetchMock = global.fetch as jest.Mock;
const store: Record<string, string> = {};

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: jest.fn().mockResolvedValue(body),
  } as unknown as Response;
}

beforeEach(() => {
  fetchMock.mockReset();
  Object.assign(store, {
    accessToken: 'asset-token',
    csrfToken: 'asset-csrf',
    tenantId: 'tenant-assets',
    user: JSON.stringify({ id: 'user-assets', tenantId: 'tenant-assets', email: 'owner@example.com' }),
  });
  (window.localStorage.getItem as jest.Mock).mockImplementation((key: string) => store[key] ?? null);
});

describe('MediaLibrary A4 asset flow', () => {
  it('matches the presigned asset DTO, uploads bytes, and does not leak API credentials to storage', async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          presignedUrl: 'https://storage.example/signed-key',
          publicUrl: 'https://cdn.example/logo.png',
          key: 'tenants/tenant-assets/branding/logo.png',
          expiresIn: 300,
          contentType: 'image/png',
        }),
      )
      .mockResolvedValueOnce(jsonResponse(null));

    render(<MediaLibrary tenantId="tenant-assets" />);
    const file = new File(['image-bytes'], 'logo.png', { type: 'image/png' });
    fireEvent.change(screen.getByLabelText('Upload media asset'), { target: { files: [file] } });

    expect(await screen.findByRole('status')).toHaveTextContent('logo.png uploaded successfully.');
    expect(screen.getByAltText('logo.png')).toHaveAttribute('src', 'https://cdn.example/logo.png');

    const [apiUrl, apiInit] = fetchMock.mock.calls[0];
    expect(apiUrl).toBe('/api/v1/assets/presigned-url');
    expect(apiInit.method).toBe('POST');
    expect(apiInit.headers.Authorization).toBe('Bearer asset-token');
    expect(apiInit.headers['X-CSRF-Token']).toBe('asset-csrf');
    expect(apiInit.headers['X-Tenant-ID']).toBe('tenant-assets');
    expect(JSON.parse(apiInit.body)).toEqual({
      fileName: 'logo.png',
      contentType: 'image/png',
      fileSize: file.size,
      folder: 'branding',
    });
    expect(apiInit.body).not.toContain('tenant-assets');

    const [storageUrl, storageInit] = fetchMock.mock.calls[1];
    expect(storageUrl).toBe('https://storage.example/signed-key');
    expect(storageInit.method).toBe('PUT');
    expect(storageInit.headers).toEqual({ 'Content-Type': 'image/png' });
    expect(storageInit.body).toBe(file);
    expect(storageInit.headers.Authorization).toBeUndefined();
    expect(storageInit.headers['X-Tenant-ID']).toBeUndefined();
  });

  it('surfaces presign API failures and never claims upload success', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ message: 'Asset type is not allowed' }, 400));
    render(<MediaLibrary tenantId="tenant-assets" />);

    fireEvent.change(screen.getByLabelText('Upload media asset'), {
      target: { files: [new File(['x'], 'bad.gif', { type: 'image/gif' })] },
    });

    expect(await screen.findByRole('alert')).toHaveTextContent('Asset type is not allowed');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('surfaces storage upload failures after a successful presign', async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          presignedUrl: 'https://storage.example/signed-key',
          publicUrl: 'https://cdn.example/logo.png',
          key: 'asset-key',
          expiresIn: 300,
          contentType: 'image/png',
        }),
      )
      .mockResolvedValueOnce(jsonResponse(null, 503));
    render(<MediaLibrary tenantId="tenant-assets" />);

    fireEvent.change(screen.getByLabelText('Upload media asset'), {
      target: { files: [new File(['x'], 'logo.png', { type: 'image/png' })] },
    });

    expect(await screen.findByRole('alert')).toHaveTextContent('Asset upload failed (HTTP 503).');
    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());
  });
});
