'use client';

import React, { useState, useEffect } from 'react';
import { api } from '../lib/api-client';

export function ComplaintManager({ tenantId }: { tenantId: string }): React.ReactNode {
  const [complaints, setComplaints] = useState<Array<Record<string, unknown>> | null>(null);
  const [detail, setDetail] = useState<Record<string, unknown> | null>(null);
  const [reply, setReply] = useState('');
  const [filter, setFilter] = useState('ALL');

  useEffect(() => {
    (async () => {
      try { setComplaints(await api.get<Array<Record<string, unknown>>>('/api/v1/backoffice/complaints')); }
      catch { setComplaints([]); }
    })();
  }, [tenantId]);

  const openDetail = async (id: string): Promise<void> => {
    try { setDetail(await api.get<Record<string, unknown>>(`/api/v1/backoffice/complaints/${id}`)); }
    catch { setDetail(null); }
  };

  const sendReply = async (): Promise<void> => {
    if (!detail || !reply.trim()) return;
    await api.post(`/api/v1/backoffice/complaints/${detail.id}/messages`, { message: reply });
    setReply('');
    openDetail(detail.id as string);
  };

  const updateStatus = async (id: string, status: string): Promise<void> => {
    await api.put(`/api/v1/backoffice/complaints/${id}/status`, { status });
    openDetail(id);
    const list = await api.get<Array<Record<string, unknown>>>('/api/v1/backoffice/complaints');
    setComplaints(list);
  };

  const filtered = complaints === null ? null : complaints.filter(c => filter === 'ALL' ? true : c.status === filter);

  if (complaints === null) return <div className="text-sm text-gray-500">Loading complaints…</div>;

  return (
    <div className="space-y-4">
      <h3 className="font-bold text-lg">Complaints</h3>

      {/* Filter chips */}
      <div className="flex gap-1 flex-wrap mb-2">
        {['ALL', 'NEW', 'REVIEWING', 'RESOLVED', 'CLOSED'].map(f => (
          <button key={f} type="button" onClick={() => setFilter(f)}
            className={`px-2 py-1 rounded text-xs font-medium ${filter === f ? 'bg-black text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>{f}</button>
        ))}
      </div>

      {/* List */}
      <div className="space-y-2">
        {filtered !== null && filtered.length === 0 && <p className="text-sm text-gray-500">No complaints found.</p>}
        {filtered !== null && filtered.map((comp: Record<string, unknown>) => (
          <div key={comp.id as string}
            onClick={() => openDetail(comp.id as string)}
            className="bg-white rounded-lg border p-3 cursor-pointer hover:shadow-sm flex justify-between items-center">
            <div>
              <div className="font-semibold text-sm">{String(comp.subject).slice(0, 80)}</div>
              <div className="text-xs text-gray-500">{String(comp.customerId).slice(0, 8)} &middot; {String(comp.createdAt).slice(0, 10)}</div>
            </div>
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${comp.status === 'NEW' ? 'bg-yellow-100 text-yellow-800' : comp.status === 'REVIEWING' ? 'bg-blue-100 text-blue-800' : comp.status === 'RESOLVED' ? 'bg-green-100 text-green-800' : 'bg-gray-200 text-gray-700'}`}>
              {String(comp.status)}
            </span>
          </div>
        ))}
      </div>

      {/* Detail modal */}
      {detail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setDetail(null)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[80vh] overflow-y-auto p-5 m-4" onClick={(e) => e.stopPropagation()}>
            <h4 className="font-bold text-sm mb-1">{detail.subject as string}</h4>
            <p className="text-xs text-gray-500 mb-3">Customer {String(detail.customerId).slice(0, 8)} &middot; {detail.orderId ? `Order ${String(detail.orderId).slice(0, 8)}` : 'No order'}</p>

            <div className="text-sm mb-4 p-3 bg-gray-50 rounded-lg">{detail.description as string}</div>

            {/* Messages */}
            <div className="space-y-2 mb-3">
              {(detail.messages as Array<Record<string, unknown>> || []).map((msg: Record<string, unknown>) => (
                <div key={msg.id as string} className={`p-2 rounded-lg text-sm ${msg.authorType === 'STAFF' ? 'bg-green-50 ml-6' : 'bg-gray-100 mr-6'}`}>
                  <span className="text-[10px] font-semibold text-gray-500 block">{msg.authorType === 'STAFF' ? 'Staff' : 'Customer'}</span>
                  {msg.message as string}
                </div>
              ))}
            </div>

            {/* Reply */}
            <div className="flex gap-2">
              <input value={reply} onChange={(e) => setReply(e.target.value)}
                placeholder="Type a reply…" className="flex-1 border rounded-lg p-2 text-sm" />
              <button type="button" onClick={() => void sendReply()} disabled={!reply.trim()}
                className="bg-blue-600 text-white px-3 py-1.5 rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50">Send</button>
            </div>

            {/* Status controls */}
            <div className="flex gap-2 mt-3 pt-3 border-t">
              {detail.status === 'NEW' && <button onClick={() => void updateStatus(detail.id as string, 'REVIEWING')} className="bg-blue-600 text-white px-3 py-1 rounded text-xs">Mark reviewing</button>}
              {detail.status === 'REVIEWING' && <button onClick={() => void updateStatus(detail.id as string, 'NEW')} className="bg-gray-600 text-white px-3 py-1 rounded text-xs">Reopen</button>}
              {detail.status === 'REVIEWING' && <button onClick={() => void updateStatus(detail.id as string, 'RESOLVED')} className="bg-green-600 text-white px-3 py-1 rounded text-xs">Resolve</button>}
              {(detail.status === 'REVIEWING' || detail.status === 'RESOLVED') && <button onClick={() => void updateStatus(detail.id as string, 'CLOSED')} className="bg-gray-600 text-white px-3 py-1 rounded text-xs">Close</button>}
              {detail.status === 'CLOSED' && <button onClick={() => void updateStatus(detail.id as string, 'REVIEWING')} className="bg-blue-600 text-white px-3 py-1 rounded text-xs">Reopen</button>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ComplaintManager;
