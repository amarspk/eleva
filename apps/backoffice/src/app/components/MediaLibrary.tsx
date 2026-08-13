'use client';

/* eslint-disable @next/next/no-img-element */
import React, { useState } from 'react';
import { apiErrorMessage } from '../lib/api-client';
import { assetsApi, uploadPresignedAsset } from '../lib/resources';

interface UploadedAsset {
  id: string;
  originalName: string;
  originalUrl: string;
}

export function MediaLibrary({ tenantId }: { tenantId: string }): React.ReactElement {
  const [items, setItems] = useState<UploadedAsset[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

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
      setItems((current) => [
        { id: target.key, originalName: file.name, originalUrl: target.publicUrl },
        ...current.filter((item) => item.id !== target.key),
      ]);
      setMessage(`${file.name} uploaded successfully.`);
    } catch (uploadError) {
      setError(apiErrorMessage(uploadError, 'Unable to upload asset.'));
    } finally {
      setUploading(false);
      event.target.value = '';
    }
  };

  return (
    <div className="rounded-xl border bg-white p-4">
      <h3 className="mb-3 font-bold">Media Library</h3>
      <label
        className={`flex flex-col items-center rounded-lg border-2 border-dashed p-6 ${
          uploading ? 'cursor-wait opacity-60' : 'cursor-pointer'
        }`}
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

      <div className="mt-4 grid grid-cols-3 gap-2 md:grid-cols-6">
        {items.map((item) => (
          <div key={item.id} className="overflow-hidden rounded border">
            <img src={item.originalUrl} alt={item.originalName} className="h-20 w-full object-cover" />
            <div className="truncate p-1 text-[10px]">{item.originalName}</div>
          </div>
        ))}
        {items.length === 0 ? (
          <p className="col-span-6 text-xs text-gray-500">
            No assets uploaded in this session. Uploads use the authenticated presigned asset flow.
          </p>
        ) : null}
      </div>
    </div>
  );
}
