'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useEffect, useState } from 'react';
export function DashboardMetrics({ tenantId }:{tenantId:string}): React.ReactElement {
  const [stats,setStats]=useState<any>({orders:0,revenue:0,products:0,branches:0});
  useEffect(()=>{
    (async(): Promise<void> => {
      try{
        const [o,p,b]=await Promise.all([
          fetch('/api/v1/orders',{headers:{'X-Tenant-ID':tenantId}}).then(r=>r.ok?r.json():[]),
          fetch('/api/v1/products',{headers:{'X-Tenant-ID':tenantId}}).then(r=>r.ok?r.json():[]),
          fetch('/api/v1/branches',{headers:{'X-Tenant-ID':tenantId}}).then(r=>r.ok?r.json():[]),
        ]);
        const orders=Array.isArray(o)?o:(o.data||[]);
        const revenue=orders.reduce((s:any,x:any)=>s+Number(x.total||0),0);
        setStats({orders:orders.length,revenue,products: Array.isArray(p)?p.length:(p.data?.length||0),branches: Array.isArray(b)?b.length:(b.data?.length||0)});
      }catch{ /* metrics are best-effort; the dashboard still renders */ }
    })();
  },[tenantId]);
  const cards=[{k:'Orders',v:stats.orders},{k:'Revenue',v: stats.revenue.toFixed(2)},{k:'Products',v:stats.products},{k:'Branches',v:stats.branches}];
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
      {cards.map(c=>(
        <div key={c.k} className="bg-white border rounded-xl p-4">
          <div className="text-xs text-gray-500">{c.k}</div>
          <div className="text-xl font-bold">{c.v}</div>
        </div>
      ))}
    </div>
  );
}
