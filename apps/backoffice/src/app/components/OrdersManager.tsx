'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState, useEffect, useRef } from 'react';
export function OrdersManager({ tenantId, branchId }: { tenantId:string; branchId?:string }){
  const [orders,setOrders]=useState<any[]>([]);
  const [filter,setFilter]=useState<'all'|'preorder'>('all');
  const prevCount=useRef(0);
  const [hasNew,setHasNew]=useState(false);
  const load=async()=>{
    try{
      const q = branchId ? `?branchId=${branchId}` : '';
      const r=await fetch(`/api/v1/orders${q}`,{headers:{'X-Tenant-ID':tenantId}});
      if(r.ok){ const j=await r.json(); const list=Array.isArray(j)?j:j.data||[]; if(list.length>prevCount.current) setHasNew(true); prevCount.current=list.length; setOrders(list); }
    }catch{}
  };
  useEffect(()=>{ load(); const id=setInterval(load,8000); return()=>clearInterval(id); },[tenantId,branchId]);
  // sound on new
  useEffect(()=>{
    if(hasNew){
      try{
        const ctx=new (window.AudioContext||(window as any).webkitAudioContext)();
        const o=ctx.createOscillator(); o.frequency.value=880; o.connect(ctx.destination); o.start(); setTimeout(()=>{o.stop(); ctx.close();},200);
      }catch{}
      setTimeout(()=>setHasNew(false),4000);
    }
  },[hasNew]);
  const filtered = filter==='preorder'? orders.filter((o:any)=>o.isPreorder): orders;
  return (
    <div className="bg-white rounded-xl border p-4">
      <div className="flex justify-between items-center mb-3">
        <h3 className="font-bold">Orders {hasNew && <span className="ml-2 bg-red-500 text-white text-xs px-2 py-0.5 rounded-full animate-pulse">New order!</span>}</h3>
        <div className="flex gap-2">
          <button onClick={()=>setFilter('all')} className={`text-xs px-2 py-1 rounded ${filter==='all'?'bg-black text-white':'border'}`}>All</button>
          <button onClick={()=>setFilter('preorder')} className={`text-xs px-2 py-1 rounded ${filter==='preorder'?'bg-black text-white':'border'}`}>Pre-orders</button>
          <button onClick={load} className="text-xs border px-2 py-1 rounded">Refresh</button>
        </div>
      </div>
      <div className="space-y-2 max-h-[60vh] overflow-auto">
        {filtered.map((o:any)=>(
          <div key={o.id} className={`border rounded-lg p-3 ${o.isPreorder?'border-amber-400 bg-amber-50':''}`}>
            <div className="flex justify-between">
              <span className="font-semibold text-sm">{o.orderNumber} {o.isPreorder && <span className="text-[10px] bg-amber-500 text-white px-1 rounded">PRE-ORDER {o.scheduledAt? new Date(o.scheduledAt).toLocaleString():''}</span>}</span>
              <span className="text-xs px-2 py-0.5 rounded bg-gray-100">{o.status}</span>
            </div>
            <div className="text-xs text-gray-600 mt-1">Branch: {o.branchId?.slice(0,8)} • {o.paymentMethod} • {o.total} • {new Date(o.createdAt).toLocaleString()}</div>
            <div className="text-xs mt-1">Items: {(o.orderItems||o.items||[]).map((i:any)=>`${i.quantity}x ${i.productId?.slice(0,6)}`).join(', ')||'—'}</div>
            {o.specialNotes && <div className="text-xs italic mt-1">Note: {o.specialNotes}</div>}
          </div>
        ))}
        {filtered.length===0 && <p className="text-xs text-gray-500">No orders yet.</p>}
      </div>
    </div>
  );
}
