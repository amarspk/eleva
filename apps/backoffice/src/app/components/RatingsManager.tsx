'use client';

import React, { useState, useEffect } from 'react';
import { api } from '../lib/api-client';

export function RatingsManager({ tenantId }: { tenantId: string }): React.ReactNode {
  const [ratings, setRatings] = useState<Array<Record<string, unknown>> | null>(null);
  const [filterRating, setFilterRating] = useState(0);

  useEffect(() => {
    (async () => {
      try { setRatings(await api.get<Array<Record<string, unknown>>>('/api/v1/backoffice/ratings')); }
      catch { setRatings([]); }
    })();
  }, [tenantId]);

  const filtered = ratings === null ? null : filterRating === 0 ? ratings : ratings.filter(r => Number(r.rating) === filterRating);

  return (
    <div className="space-y-4">
      <h3 className="font-bold text-lg">Ratings &amp; Feedback</h3>

      <div className="flex gap-1 flex-wrap mb-2">
        {[0, 5, 4, 3, 2, 1].map(s => (
          <button key={s} type="button" onClick={() => setFilterRating(s)}
            className={`px-2 py-1 rounded text-xs font-medium ${filterRating === s ? 'bg-black text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>
            {s === 0 ? 'All' : `${s}\u2605`}
          </button>
        ))}
      </div>

      {filtered !== null && filtered.length === 0 && <p className="text-sm text-gray-500">No ratings yet.</p>}
      {filtered !== null && filtered.map((r: Record<string, unknown>) => (
        <div key={r.id as string} className="bg-white rounded-lg border p-3">
          <div className="flex justify-between items-center text-xs text-gray-500 mb-1">
            <span>Customer {String(r.customerId).slice(0, 8)}</span>
            <span>{String(r.createdAt).slice(0, 10)}</span>
          </div>
          <div className="text-lg mb-1" style={{ color: '#f59e0b' }}>
            {[1,2,3,4,5].map(s => <span key={s} style={{ opacity: s <= Number(r.rating) ? 1 : 0.3 }}>{'\u2605'}</span>)}
          </div>
          {Boolean(r.feedback) && <p className="text-sm text-gray-700 mt-1">&quot;{String(r.feedback)}&quot;</p>}
          <div className="text-[10px] text-gray-400 mt-1">Order #{String(r.orderId).slice(0, 8)}</div>
        </div>
      ))}
    </div>
  );
}

export default RatingsManager;