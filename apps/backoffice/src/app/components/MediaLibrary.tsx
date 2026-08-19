'use client';

/* eslint-disable @next/next/no-img-element */
import React, { useEffect, useState } from 'react';
import { apiErrorMessage } from '../lib/api-client';
import { assetsApi, uploadPresignedAsset } from '../lib/resources';
import { listSiteMedia, putSiteMedia, type SiteMediaAsset } from '../lib/site-media-store';

interface UploadedAsset {
  id: string;
  originalName: string;
  originalUrl: string;
}

export function MediaLibrary({
  tenantId,
  onSelect,
  compact = false,
}: {
  tenantId: string;
  onSelect?: (url: string) => void;
  compact?: boolean;
}): React.ReactElement {
  const [items, setItems] = useState<UploadedAsset[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    let cancelled = false;
    void listSiteMedia(tenantId).then((stored) => {
      if (cancelled || stored.length === 0) return;
      setItems((current) => mergeAssets(stored, current));
    });
    return () => {
      cancelled = true;
    };
  }, [tenantId]);

  const onFile = async (event: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    if (!tenantId) {
      setError('Tenant context is required to upload assets.');
      return;
    }

    setUploading(true);
    setError('');
    setMessage('');
    try {
      // tenantId deliberately does not appear in the DTO. The authenticated
      // asset endpoint derives it from the verified JWT, preserving A1.
      const target = await assetsApi.createPresignedUrl({
        fileName: file.name,
        contentType: file.type,
        fileSize: file.size,
        folder: 'branding',
      });
      await uploadPresignedAsset(target, file);
      const next: UploadedAsset = {
        id: target.key,
        originalName: file.name,
        originalUrl: target.publicUrl,
      };
      setItems((current) => [next, ...current.filter((item) => item.id !== target.key)]);
      await putSiteMedia({
        ...next,
        tenantId,
        createdAt: Date.now(),
      });
      setMessage(`${file.name} uploaded successfully.`);
      onSelect?.(target.publicUrl);
    } catch (uploadError) {
      setError(apiErrorMessage(uploadError, 'Unable to upload asset.'));
    } finally {
      setUploading(false);
      event.target.value = '';
    }
  };

  return (
    <div className={`rounded-xl border bg-white ${compact ? 'p-3' : 'p-4'}`}>
      <h3 className="mb-3 font-bold">{compact ? 'Choose media' : 'Media Library'}</h3>
      <label
        className={`flex flex-col items-center rounded-lg border-2 border-dashed ${
          compact ? 'p-3' : 'p-6'
        } ${uploading ? 'cursor-wait opacity-60' : 'cursor-pointer'}`}
      >
        <span className="text-sm">
          {uploading ? 'Uploading…' : 'Click to upload logo / cover / product image'}
        </span>
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(event) => void onFile(event)}
          disabled={uploading}
          aria-label="Upload media asset"
        />
      </label>

      {error ? (
        <div role="alert" className="mt-3 rounded bg-red-50 p-2 text-xs text-red-700">
          {error}
        </div>
      ) : null}
      {message ? (
        <div role="status" className="mt-3 rounded bg-green-50 p-2 text-xs text-green-700">
          {message}
        </div>
      ) : null}

      <div className={`mt-4 grid gap-2 ${compact ? 'grid-cols-3' : 'grid-cols-3 md:grid-cols-6'}`}>
        {items.map((item) => (
          <button
            type="button"
            key={item.id}
            className="overflow-hidden rounded border text-left hover:ring-2 hover:ring-orange-400"
            onClick={() => onSelect?.(item.originalUrl)}
          >
            <img src={item.originalUrl} alt={item.originalName} className="h-20 w-full object-cover" />
            <div className="truncate p-1 text-[10px]">{item.originalName}</div>
          </button>
        ))}
        {items.length === 0 ? (
          <p className={`${compact ? 'col-span-3' : 'col-span-6'} text-xs text-gray-500`}>
            No assets uploaded in this session. Uploads use the authenticated presigned asset flow
            and persist locally in IndexedDB for the website editor.
          </p>
        ) : null}
      </div>
    </div>
  );
}

function mergeAssets(stored: SiteMediaAsset[], current: UploadedAsset[]): UploadedAsset[] {
  const seen = new Set(current.map((item) => item.id));
  const extras = stored
    .filter((item) => !seen.has(item.id))
    .map((item) => ({ id: item.id, originalName: item.originalName, originalUrl: item.originalUrl }));
  return [...current, ...extras];
}
