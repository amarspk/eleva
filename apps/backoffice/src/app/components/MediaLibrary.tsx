'use client';
/* eslint-disable @typescript-eslint/no-explicit-any, @next/next/no-img-element */
import React, { useState, useEffect } from 'react';
export function MediaLibrary({ tenantId }: { tenantId: string }){
  const [items,setItems]=useState<any[]>([]);
  const [uploading,setUploading]=useState(false);
  const load=async()=>{
    try{
      const r=await fetch(`/api/v1/media?tenantId=${tenantId}`,{headers:{'X-Tenant-ID':tenantId}});
      if(r.ok) setItems(await r.json());
    }catch{}
  };
  useEffect(()=>{ load(); },[]);
  const onFile=async(e:React.ChangeEvent<HTMLInputElement>)=>{
    const f=e.target.files?.[0]; if(!f) return;
    setUploading(true);
    try{
      const pres=await fetch('/api/v1/media/presigned-url',{method:'POST',headers:{'Content-Type':'application/json','X-Tenant-ID':tenantId},body:JSON.stringify({originalName:f.name,mimeType:f.type,fileSize:f.size})});
      if(pres.ok){ setTimeout(load,800); }
    }finally{ setUploading(false); }
  };
  return (
    <div className="bg-white rounded-xl border p-4">
      <h3 className="font-bold mb-3">Media Library (IndexedDB + S3)</h3>
      <label className="border-2 border-dashed rounded-lg p-6 flex flex-col items-center cursor-pointer">
        <span className="text-sm">{uploading?'Uploading…':'Click to upload logo / cover / product image'}</span>
        <input type="file" accept="image/*" className="hidden" onChange={onFile}/>
      </label>
      <div className="grid grid-cols-3 md:grid-cols-6 gap-2 mt-4">
        {items.map((m:any)=>(<div key={m.id} className="border rounded overflow-hidden"><img src={m.thumbnailUrl||m.originalUrl} alt={m.originalName} className="h-20 w-full object-cover"/><div className="text-[10px] p-1 truncate">{m.originalName}</div></div>))}
        {items.length===0 && <p className="text-xs text-gray-500 col-span-6">No media yet — uploads are stored via presigned S3 + Sharp WebP, persisted in IndexedDB for offline.</p>}
      </div>
    </div>
  );
}
