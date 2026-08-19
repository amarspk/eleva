/**
 * Phase 4 P1 — IndexedDB catalog for restaurant-website editor media.
 *
 * Large demo / session uploads stay on the device so the Design Builder can
 * re-offer previously chosen logo/cover assets without re-uploading. Only
 * metadata + public URLs are stored (never API credentials).
 */

export const SITE_MEDIA_DB = 'eleva-site-media';
export const SITE_MEDIA_STORE = 'assets';

export interface SiteMediaAsset {
  id: string;
  tenantId: string;
  originalName: string;
  originalUrl: string;
  createdAt: number;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is not available'));
      return;
    }
    const request = indexedDB.open(SITE_MEDIA_DB, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(SITE_MEDIA_STORE)) {
        const store = db.createObjectStore(SITE_MEDIA_STORE, { keyPath: 'id' });
        store.createIndex('tenantId', 'tenantId', { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB open failed'));
  });
}

export async function listSiteMedia(tenantId: string): Promise<SiteMediaAsset[]> {
  if (!tenantId) return [];
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(SITE_MEDIA_STORE, 'readonly');
      const req = tx.objectStore(SITE_MEDIA_STORE).index('tenantId').getAll(tenantId);
      req.onsuccess = () => {
        const rows = (req.result as SiteMediaAsset[] | undefined) ?? [];
        resolve(rows.sort((a, b) => b.createdAt - a.createdAt));
      };
      req.onerror = () => reject(req.error);
    });
  } catch {
    return [];
  }
}

export async function putSiteMedia(asset: SiteMediaAsset): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(SITE_MEDIA_STORE, 'readwrite');
      tx.objectStore(SITE_MEDIA_STORE).put(asset);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // Editor still works from in-memory session state.
  }
}
