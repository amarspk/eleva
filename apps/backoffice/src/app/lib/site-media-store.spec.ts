import { listSiteMedia, putSiteMedia, SITE_MEDIA_DB } from './site-media-store';

describe('site-media-store', () => {
  it('returns an empty list when IndexedDB is unavailable', async () => {
    const original = global.indexedDB;
    // @ts-expect-error — simulate missing IDB in this environment
    delete global.indexedDB;
    await expect(listSiteMedia('tenant-a')).resolves.toEqual([]);
    global.indexedDB = original;
  });

  it('persists and lists tenant-scoped assets when IndexedDB is present', async () => {
    if (typeof indexedDB === 'undefined') {
      return;
    }
    indexedDB.deleteDatabase(SITE_MEDIA_DB);
    await putSiteMedia({
      id: 'asset-1',
      tenantId: 'tenant-a',
      originalName: 'logo.png',
      originalUrl: 'https://cdn.example/logo.png',
      createdAt: 2,
    });
    await putSiteMedia({
      id: 'asset-2',
      tenantId: 'tenant-b',
      originalName: 'other.png',
      originalUrl: 'https://cdn.example/other.png',
      createdAt: 3,
    });
    const listed = await listSiteMedia('tenant-a');
    expect(listed).toHaveLength(1);
    expect(listed[0].originalName).toBe('logo.png');
  });
});
