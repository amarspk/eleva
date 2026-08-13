'use client';
/* eslint-disable @typescript-eslint/no-explicit-any, @next/next/no-img-element, @typescript-eslint/explicit-function-return-type, curly, no-empty */
import React, { useState, useEffect, useCallback, useRef } from 'react';

type Section = { id: string; type: string; enabled: boolean; order: number; config: Record<string, unknown> };

const SECTION_TYPES = [
  { type: 'hero', label: 'Hero / Cover' },
  { type: 'categories', label: 'Categories' },
  { type: 'featured', label: 'Featured Products' },
  { type: 'popular', label: 'Popular Products' },
  { type: 'banner', label: 'Banner' },
  { type: 'promo', label: 'Promo' },
];

const LAYOUTS: Record<string, string[]> = {
  categories: ['pills','grid','circular','horizontal','sidebar','image-based'],
  featured: ['grid','cards','list','large-cards','compact','slider'],
  popular: ['grid','cards','list','slider'],
  hero: ['split','full-width','text-overlay','image-left','image-top'],
  banner: ['full-width','split'],
  promo: ['full-width','split','text-overlay'],
};

const FONTS = ['Inter','Poppins','Cairo','Amiri','Tajawal','Outfit'];

type SaveState = 'loading'|'dirty'|'saving'|'saved'|'error';

export async function requireSuccessfulResponse(response: Response, operation: string): Promise<Response> {
  if(response.ok) return response;
  const payload = await response.json().catch(()=>null) as { message?: string|string[] }|null;
  const detail = Array.isArray(payload?.message) ? payload?.message.join(', ') : payload?.message;
  throw new Error(detail || `${operation} failed (HTTP ${response.status})`);
}

function useAutoSave(value: unknown, onSave: (v: unknown)=>void|Promise<void>, delay=900, enabled=true){
  const timerRef = useRef<NodeJS.Timeout|null>(null);
  const onSaveRef = useRef(onSave);
  useEffect(()=>{ onSaveRef.current=onSave; },[onSave]);
  useEffect(()=>{
    if(timerRef.current) clearTimeout(timerRef.current);
    if(!enabled) return;
    timerRef.current = setTimeout(()=>{ void onSaveRef.current(value); }, delay);
    return ()=>{ if(timerRef.current) clearTimeout(timerRef.current); };
  },[value, delay, enabled]);
}

export function DesignBuilder({ tenantId }: { tenantId: string }){
  const [draft,setDraft] = useState<any>({ colors:{primary:'#FF5733',secondary:'#FFFFFF'}, fonts:{heading:'Inter',body:'Inter'}, logo:null, coverImage:null, sections:[
    {id:'hero',type:'hero',enabled:true,order:0,config:{variant:'split'}},
    {id:'categories',type:'categories',enabled:true,order:1,config:{variant:'pills'}},
    {id:'featured',type:'featured',enabled:true,order:2,config:{variant:'grid'}},
  ]});
  const [previewMode,setPreviewMode]=useState<'desktop'|'mobile'>('desktop');
  const [selectedId,setSelectedId]=useState<string>('hero');
  const [saveState,setSaveState]=useState<SaveState>('loading');
  const [currentVersion,setCurrentVersion]=useState(0);
  const [loaded,setLoaded]=useState(false);
  const [publishing,setPublishing]=useState(false);
  const [restoringVersion,setRestoringVersion]=useState<number|null>(null);
  const [versions,setVersions]=useState<any[]>([]);
  const [history,setHistory]=useState<any[]>([]);
  const [historyIdx,setHistoryIdx]=useState(-1);
  const [msg,setMsg]=useState<string|null>(null);
  const [products,setProducts]=useState<any[]>([]);
  const [productSearch,setProductSearch]=useState('');
  const revisionRef=useRef(0);
  const latestSaveRequestRef=useRef(0);
  const messageTimerRef=useRef<NodeJS.Timeout|null>(null);

  const apiBase = '/api';
  const showMessage=useCallback((message:string,clearAfterMs?:number)=>{
    if(messageTimerRef.current) clearTimeout(messageTimerRef.current);
    setMsg(message);
    if(clearAfterMs) messageTimerRef.current=setTimeout(()=>setMsg(null),clearAfterMs);
  },[]);
  useEffect(()=>()=>{ if(messageTimerRef.current) clearTimeout(messageTimerRef.current); },[]);

  const load = useCallback(async()=>{
    setSaveState('loading');
    try{
      const r = await fetch(`${apiBase}/v1/design/tenant/${tenantId}?preview=true`,{headers:{'X-Tenant-ID':tenantId}});
      await requireSuccessfulResponse(r,'Load design');
      const j=await r.json();
      if(j.draft) setDraft(j.draft);
      if(typeof j.version==='number') setCurrentVersion(j.version);
      revisionRef.current=0;
      setSaveState('saved');

      const v = await fetch(`${apiBase}/v1/design/tenant/${tenantId}/versions`,{headers:{'X-Tenant-ID':tenantId}});
      if(v.ok) setVersions(await v.json());
      // tenant products for the featured/popular picker (deleted filtered server-side)
      const p = await fetch(`${apiBase}/v1/menu/products`,{headers:{'X-Tenant-ID':tenantId}});
      if(p.ok) setProducts(await p.json());
    }catch(err){
      setSaveState('error');
      showMessage(err instanceof Error?err.message:'Load design failed');
    }finally{
      setLoaded(true);
    }
  },[tenantId,showMessage]);
  useEffect(()=>{ void load(); },[load]);

  const pushHistory = (next:any)=>{
    setHistory(h=>{ const n=h.slice(0,historyIdx+1); n.push(JSON.parse(JSON.stringify(next))); if(n.length>50) n.shift(); return n; });
    setHistoryIdx(i=> Math.min(i+1,49));
  };

  const saveDraft = useCallback(async (next:any):Promise<boolean>=>{
    const revision=revisionRef.current;
    const requestId=++latestSaveRequestRef.current;
    setSaveState('saving');
    try{
      const response=await fetch(`${apiBase}/v1/design/tenant/${tenantId}/draft`,{method:'PUT',headers:{'Content-Type':'application/json','X-Tenant-ID':tenantId},body:JSON.stringify(next)});
      await requireSuccessfulResponse(response,'Auto-save');
      const saved=await response.json().catch(()=>null) as {version?:number}|null;
      // also persist to tenant branding for qr-menu SSR (legacy best-effort path;
      // A4 owns its API-client/contract remediation).
      await fetch(`${apiBase}/v1/tenants/${tenantId}`,{method:'PUT',headers:{'Content-Type':'application/json','X-Tenant-ID':tenantId},body:JSON.stringify({primaryColor:next.colors?.primary, branding: next})}).catch(()=>{});
      if(requestId===latestSaveRequestRef.current && revision===revisionRef.current){
        if(saved?.version) setCurrentVersion(saved.version);
        setSaveState('saved');
        showMessage('Auto-saved',1500);
      }
      return true;
    }catch(err){
      if(requestId===latestSaveRequestRef.current && revision===revisionRef.current){
        setSaveState('error');
        showMessage(err instanceof Error?err.message:'Auto-save failed');
      }
      return false;
    }
  },[tenantId,showMessage]);

  useAutoSave(draft, async(v)=>{ await saveDraft(v as any); }, 900, loaded&&saveState==='dirty');

  const markDraftChanged=(next:any)=>{
    if(publishing||restoringVersion!==null) return;
    revisionRef.current+=1;
    setSaveState('dirty');
    setDraft(next);
  };

  const updateDraft = (fn:(d:any)=>any)=>{
    if(publishing||restoringVersion!==null) return;
    const next=fn(JSON.parse(JSON.stringify(draft)));
    pushHistory(next);
    revisionRef.current+=1;
    setSaveState('dirty');
    setDraft(next);
  };

  const move = (id:string,dir:number)=>{
    updateDraft((d:any)=>{
      const s=[...d.sections].sort((a:Section,b:Section)=>a.order-b.order);
      const idx=s.findIndex(x=>x.id===id);
      const nidx=idx+dir;
      if(nidx<0||nidx>=s.length) return d;
      const tmp=s[idx].order; s[idx].order=s[nidx].order; s[nidx].order=tmp;
      d.sections=s;
      return d;
    });
  };

  const publish = async()=>{
    if(publishing||restoringVersion!==null) return;
    setPublishing(true);
    try{
      if(saveState!=='saved'){
        const saved=await saveDraft(draft);
        if(!saved) return;
      }
      const response=await fetch(`${apiBase}/v1/design/tenant/${tenantId}/publish`,{method:'POST',headers:{'X-Tenant-ID':tenantId}});
      await requireSuccessfulResponse(response,'Publish');
      const published=await response.json().catch(()=>null) as {version?:number}|null;
      if(published?.version) setCurrentVersion(published.version);
      setSaveState('saved');
      showMessage('Published!',2000);
      await load();
    }catch(err){
      setSaveState('error');
      showMessage(err instanceof Error?err.message:'Publish failed');
    }finally{
      setPublishing(false);
    }
  };

  const restoreVersion=async(version:number)=>{
    if(restoringVersion!==null||publishing) return;
    setRestoringVersion(version);
    try{
      if(saveState!=='saved'){
        const saved=await saveDraft(draft);
        if(!saved) return;
      }
      const response=await fetch(`${apiBase}/v1/design/tenant/${tenantId}/restore/${version}`,{method:'POST',headers:{'X-Tenant-ID':tenantId}});
      await requireSuccessfulResponse(response,'Restore');
      const restored=await response.json().catch(()=>null) as {version?:number}|null;
      if(restored?.version) setCurrentVersion(restored.version);
      showMessage(`Restored v${version}`,2000);
      await load();
    }catch(err){
      setSaveState('error');
      showMessage(err instanceof Error?err.message:'Restore failed');
    }finally{
      setRestoringVersion(null);
    }
  };

  const undo = ()=>{ if(historyIdx>0){ const v=history[historyIdx-1]; markDraftChanged(v); setHistoryIdx(i=>i-1); }};
  const redo = ()=>{ if(historyIdx<history.length-1){ const v=history[historyIdx+1]; markDraftChanged(v); setHistoryIdx(i=>i+1); }};

  // CTO decision 2026-08-10 (§14 #26): featured/popular sections select
  // products explicitly via config.productIds (tenant-owned ids; order of
  // selection = display order on the public menu).
  const toggleProduct = (pid:string)=>{
    updateDraft((d:any)=>{
      const f=d.sections.find((x:Section)=>x.id===selectedId);
      if(!f) return d;
      const ids:string[] = Array.isArray(f.config?.productIds) ? f.config.productIds as string[] : [];
      f.config = {...(f.config||{}), productIds: ids.includes(pid) ? ids.filter(x=>x!==pid) : [...ids, pid]};
      return d;
    });
  };

  const selected = draft.sections?.find((s:Section)=>s.id===selectedId);
  const selectedProductIds:string[] = Array.isArray(selected?.config?.productIds) ? selected.config.productIds as string[] : [];
  const filteredProducts = products.filter((p:any)=> !productSearch || String(p.name||'').toLowerCase().includes(productSearch.toLowerCase()));

  return (
    <div className="flex flex-col lg:flex-row gap-4">
      {/* Left controls */}
      <div className="w-full lg:w-[340px] bg-white rounded-xl border p-4 space-y-4 shrink-0">
        <div className="flex items-center justify-between">
          <h3 className="font-bold">Eleva Website Builder</h3>
          <span className="text-xs text-gray-500">{{loading:'Loading…',dirty:'Unsaved changes',saving:'Saving…',saved:`Saved v${currentVersion}`,error:'Save failed'}[saveState]}</span>
        </div>
        {/* Colors */}
        <div>
          <h4 className="text-xs font-semibold text-gray-600 mb-2">Brand</h4>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs">Primary<input type="color" value={draft.colors?.primary||'#000'} onChange={e=>updateDraft(d=>{d.colors.primary=e.target.value;return d;})} className="w-full h-8"/></label>
            <label className="text-xs">Secondary<input type="color" value={draft.colors?.secondary||'#fff'} onChange={e=>updateDraft(d=>{d.colors.secondary=e.target.value;return d;})} className="w-full h-8"/></label>
          </div>
          <div className="grid grid-cols-2 gap-2 mt-2">
            <label className="text-xs">Heading font<select value={draft.fonts?.heading} onChange={e=>updateDraft(d=>{d.fonts.heading=e.target.value;return d;})} className="w-full border rounded p-1 text-xs">{FONTS.map(f=><option key={f} value={f}>{f}</option>)}</select></label>
            <label className="text-xs">Body font<select value={draft.fonts?.body} onChange={e=>updateDraft(d=>{d.fonts.body=e.target.value;return d;})} className="w-full border rounded p-1 text-xs">{FONTS.map(f=><option key={f} value={f}>{f}</option>)}</select></label>
          </div>
          <label className="text-xs block mt-2">Logo URL<input value={draft.logo||''} onChange={e=>updateDraft(d=>{d.logo=e.target.value;return d;})} placeholder="https://..." className="w-full border rounded p-1 text-xs"/></label>
          <label className="text-xs block mt-1">Cover URL<input value={draft.coverImage||''} onChange={e=>updateDraft(d=>{d.coverImage=e.target.value;return d;})} placeholder="https://..." className="w-full border rounded p-1 text-xs"/></label>
        </div>
        {/* Sections */}
        <div>
          <div className="flex justify-between items-center">
            <h4 className="text-xs font-semibold text-gray-600">Sections</h4>
            <select onChange={e=>{ if(!e.target.value) return; const type=e.target.value; updateDraft(d=>{ d.sections.push({id:type+'-'+Date.now(),type,enabled:true,order:d.sections.length,config:{variant:LAYOUTS[type]?.[0]||'grid'}}); return d;}); e.target.value='';}} defaultValue="" className="text-xs border rounded p-1">
              <option value="">+ Add</option>
              {SECTION_TYPES.map(s=><option key={s.type} value={s.type}>{s.label}</option>)}
            </select>
          </div>
          <div className="space-y-2 mt-2">
            {[...(draft.sections||[])].sort((a:Section,b:Section)=>a.order-b.order).map((s:Section)=>(
              <div key={s.id} onClick={()=>setSelectedId(s.id)} className={`border rounded-lg p-2 flex items-center justify-between cursor-pointer ${selectedId===s.id?'border-blue-500 bg-blue-50':'bg-gray-50'}`}>
                <div>
                  <div className="text-xs font-semibold capitalize">{s.type} <span className="text-[10px] text-gray-500">{s.config?.variant as string}</span></div>
                  <label className="text-[10px] flex gap-1"><input type="checkbox" checked={s.enabled} onChange={e=>updateDraft(d=>{ const f=d.sections.find((x:Section)=>x.id===s.id); if(f) f.enabled=e.target.checked; return d;})}/> enabled</label>
                </div>
                <div className="flex flex-col gap-1">
                  <button onClick={()=>move(s.id,-1)} className="text-xs border rounded px-1">↑</button>
                  <button onClick={()=>move(s.id,1)} className="text-xs border rounded px-1">↓</button>
                </div>
              </div>
            ))}
          </div>
        </div>
        {selected && (
          <div className="border-t pt-3">
            <h4 className="text-xs font-semibold">Edit: {selected.type}</h4>
            <label className="text-xs block mt-1">Variant<select value={selected.config?.variant as string} onChange={e=>updateDraft(d=>{ const f=d.sections.find((x:Section)=>x.id===selected.id); if(f) f.config.variant=e.target.value; return d;})} className="w-full border rounded p-1 text-xs">
              {(LAYOUTS[selected.type]||['grid']).map(v=><option key={v} value={v}>{v}</option>)}
            </select></label>
            {(selected.type==='featured'||selected.type==='popular') && (
              <div className="mt-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-semibold text-gray-600">Products</h4>
                  <span className="text-[10px] text-gray-500">{selectedProductIds.length} selected</span>
                </div>
                <input value={productSearch} onChange={e=>setProductSearch(e.target.value)} placeholder="Search products…" className="w-full border rounded p-1 text-xs mt-1"/>
                <div className="max-h-40 overflow-auto border rounded mt-1 divide-y">
                  {filteredProducts.length===0 && <div className="text-[11px] text-gray-400 p-2">No products found</div>}
                  {filteredProducts.map((p:any)=>(
                    <label key={p.id} className="flex items-center gap-2 px-2 py-1 text-xs cursor-pointer hover:bg-gray-50">
                      <input type="checkbox" checked={selectedProductIds.includes(p.id)} onChange={()=>toggleProduct(p.id)}/>
                      <span className="flex-1 truncate">{p.name}</span>
                      <span className="text-[10px] text-gray-400">{selectedProductIds.indexOf(p.id)>=0 ? `#${selectedProductIds.indexOf(p.id)+1}` : ''}</span>
                    </label>
                  ))}
                </div>
                {selectedProductIds.length>0 && (
                  <button onClick={()=>updateDraft(d=>{ const f=d.sections.find((x:Section)=>x.id===selected.id); if(f) f.config={...(f.config||{}), productIds: []}; return d;})} className="text-[10px] text-red-500 mt-1">Clear selection</button>
                )}
              </div>
            )}
          </div>
        )}
        <div className="flex gap-2 pt-2">
          <button onClick={undo} disabled={historyIdx<=0} className="flex-1 border rounded py-1 text-xs disabled:opacity-50">Undo</button>
          <button onClick={redo} disabled={historyIdx>=history.length-1} className="flex-1 border rounded py-1 text-xs disabled:opacity-50">Redo</button>
        </div>
        <div className="flex gap-2">
          <button onClick={()=>void publish()} disabled={publishing||restoringVersion!==null} className="flex-1 bg-black disabled:opacity-50 text-white rounded py-2 text-sm">{publishing?'Publishing…':'Publish'}</button>
        </div>
        {msg && <div className={`text-xs p-2 rounded ${saveState==='error'?'bg-red-50 text-red-700':'bg-green-50 text-green-700'}`}>{msg}</div>}
        {versions.length>0 && (
          <div>
            <h4 className="text-xs font-semibold">History ({versions.length})</h4>
            <div className="max-h-32 overflow-auto space-y-1 mt-1">
              {versions.map(v=>(
                <div key={v.id} className="flex justify-between text-[11px] border rounded p-1">
                  <span>v{v.version} {new Date(v.createdAt).toLocaleString()}</span>
                  <button onClick={()=>void restoreVersion(v.version)} disabled={restoringVersion!==null||publishing} className="text-blue-600 disabled:opacity-50">{restoringVersion===v.version?'Restoring…':'Restore'}</button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      {/* Preview */}
      <div className="flex-1 bg-white rounded-xl border p-4">
        <div className="flex gap-2 mb-3">
          <button onClick={()=>setPreviewMode('desktop')} className={`px-3 py-1 rounded text-xs ${previewMode==='desktop'?'bg-black text-white':'border'}`}>Desktop</button>
          <button onClick={()=>setPreviewMode('mobile')} className={`px-3 py-1 rounded text-xs ${previewMode==='mobile'?'bg-black text-white':'border'}`}>Mobile</button>
          <span className="text-xs text-gray-500 ml-auto">Draft preview — not yet published until Publish</span>
        </div>
        <div className={`mx-auto border rounded-xl overflow-hidden bg-gray-50 ${previewMode==='mobile'?'max-w-[390px]':'max-w-[900px]'}`} style={{fontFamily: draft.fonts?.body}}>
          <div className="h-32 flex items-center justify-center text-white font-bold text-lg" style={{backgroundColor: draft.colors?.primary, backgroundImage: draft.coverImage?`url(${draft.coverImage})`:undefined, backgroundSize:'cover'}}>
            <span style={{textShadow:'0 1px 4px rgba(0,0,0,0.5)'}}>{draft.logo? '': 'Your cover / hero'}</span>
            {draft.logo && <img src={draft.logo} alt="logo" className="h-12 bg-white p-1 rounded"/>}
          </div>
          <div className="p-3 space-y-3">
            {[...(draft.sections||[])].sort((a:Section,b:Section)=>a.order-b.order).filter((s:Section)=>s.enabled).map((s:Section)=>(
              <div key={s.id} className="bg-white rounded-lg border p-3">
                <div className="text-xs font-semibold capitalize mb-2">{s.type} — {s.config?.variant as string}</div>
                {s.type==='categories' && (
                  <div className={s.config?.variant==='pills'?'flex gap-2 flex-wrap': s.config?.variant==='circular'?'flex gap-3':'grid grid-cols-3 gap-2'}>
                    {['Starters','Mains','Desserts'].map(c=>(
                      s.config?.variant==='circular'
                        ? <div key={c} className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center text-[10px]">{c}</div>
                        : <div key={c} className="bg-gray-100 rounded p-2 text-xs text-center">{c}</div>
                    ))}
                  </div>
                )}
                {(s.type==='featured'||s.type==='popular') && (()=>{
                  const ids:string[] = Array.isArray(s.config?.productIds) ? s.config.productIds as string[] : [];
                  const sel = ids.length>0 ? ids.map(id=>products.find((p:any)=>p.id===id)).filter(Boolean) : products.slice(0,4);
                  const shown = sel.length>0 ? sel.slice(0,4) : [null,null,null,null];
                  return (
                    <div className={s.config?.variant==='list'?'space-y-2': s.config?.variant==='slider'?'flex gap-2 overflow-auto':'grid grid-cols-2 gap-2'}>
                      {shown.map((p:any,i:number)=>(
                        <div key={p?.id||i} className={`${s.config?.variant==='large-cards'?'p-4': s.config?.variant==='compact'?'p-2':''} border rounded text-xs ${s.config?.variant==='list'?'flex gap-2':''}`}>
                          <div className={`bg-gray-100 rounded ${s.config?.variant==='list'?'w-12 h-12':'h-16'} mb-1`}></div>
                          <div>{p? p.name : `Product ${i+1}`}</div>
                        </div>
                      ))}
                    </div>
                  );
                })()}
                {s.type==='hero' && <div className={`h-20 rounded flex items-center justify-center text-xs ${s.config?.variant==='text-overlay'?'bg-black text-white': s.config?.variant==='split'?'bg-gradient-to-r from-gray-100 to-gray-200':'bg-gray-100'}`}>Hero variant: {s.config?.variant as string}</div>}
                {(s.type==='banner'||s.type==='promo') && <div className="h-16 bg-gradient-to-r from-orange-100 to-pink-100 rounded flex items-center justify-center text-xs">Banner / Promo — {s.config?.variant as string}</div>}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
