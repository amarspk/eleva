import React from 'react';
export default function ElevaLanding(){
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-black text-white">
      <header className="max-w-6xl mx-auto flex justify-between items-center px-6 py-6">
        <div className="text-2xl font-black tracking-tight">ELEVA</div>
        <nav className="flex gap-6 text-sm text-slate-300"><a href="#features">Features</a><a href="#pricing">Pricing</a><a href="#contact">Contact</a></nav>
        <a href="/login" className="bg-white text-black px-5 py-2 rounded-full text-sm font-semibold">Open Dashboard</a>
      </header>
      <section className="max-w-6xl mx-auto px-6 py-20 grid md:grid-cols-2 gap-12 items-center">
        <div>
          <div className="inline-block bg-white/10 px-3 py-1 rounded-full text-xs mb-4">Elevation for every restaurant</div>
          <h1 className="text-5xl font-black leading-tight">Give your restaurant <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-400 to-pink-500">its own website</span> in minutes</h1>
          <p className="text-slate-300 mt-4">Eleva is a professional SaaS platform for restaurants: menu management, branches, online ordering, order management, design customization, Arabic/English RTL/LTR, subscriptions — each restaurant is an independent tenant.</p>
          <div className="flex gap-3 mt-6">
            <a href="/setup" className="bg-gradient-to-r from-orange-500 to-pink-500 px-6 py-3 rounded-full font-semibold">Start free trial</a>
            <a href="#features" className="border border-white/20 px-6 py-3 rounded-full">See features</a>
          </div>
          <div className="flex gap-6 mt-8 text-xs text-slate-400"><span>✓ Cash & bank transfer</span><span>✓ No marketplace commissions</span><span>✓ Visual builder</span></div>
        </div>
        <div className="bg-white rounded-[32px] p-4 shadow-2xl text-slate-900">
          <div className="h-8 flex gap-1 mb-3"><span className="w-3 h-3 rounded-full bg-red-400"/><span className="w-3 h-3 rounded-full bg-yellow-400"/><span className="w-3 h-3 rounded-full bg-green-400"/></div>
          <div className="bg-gray-50 rounded-2xl p-4 space-y-3">
            <div className="h-24 bg-gradient-to-r from-orange-400 to-pink-400 rounded-xl flex items-center justify-center text-white font-bold">Your Hero — split / full-width / overlay</div>
            <div className="flex gap-2"><span className="bg-black text-white px-3 py-1 rounded-full text-xs">All</span><span className="bg-gray-200 px-3 py-1 rounded-full text-xs">Mains</span><span className="bg-gray-200 px-3 py-1 rounded-full text-xs">Desserts</span></div>
            <div className="grid grid-cols-2 gap-2"><div className="bg-white border rounded-xl p-3 text-xs">Shawarma<br/><b>12.00 SAR</b></div><div className="bg-white border rounded-xl p-3 text-xs">Kabsa<br/><b>24.00 SAR</b></div></div>
          </div>
        </div>
      </section>
      <section id="features" className="max-w-6xl mx-auto px-6 py-16 grid md:grid-cols-3 gap-6">
        {[
          ['Visual Builder','Cards, grid, list, pills, circular, slider — every control affects the public site. Draft/preview/publish, undo/redo, auto-save.'],
          ['Multi-tenant SaaS','Platform owner → Restaurant A/B/C. Tenant isolation verified. Each restaurant has its own website & domain.'],
          ['Orders & Pre-orders','Real-time new-order alerts with sound, status timeline, scheduled pre-orders clearly separated.'],
          ['Arabic / English','Full RTL/LTR, responsive mobile-first, no flash or scroll jumps, cart stays stable.'],
          ['Media Library','S3 presigned uploads + Sharp WebP + CloudFront + IndexedDB persistence for large images.'],
          ['Subscriptions','Plans, trials, billing, Stripe webhooks — platform owner SaaS control center.'],
        ].map(([t,d])=>(
          <div key={t} className="bg-white/5 border border-white/10 rounded-2xl p-6"><div className="font-semibold">{t}</div><div className="text-sm text-slate-400 mt-2">{d}</div></div>
        ))}
      </section>
      <section id="contact" className="max-w-6xl mx-auto px-6 py-12 text-center border-t border-white/10">
        <h3 className="text-2xl font-bold">Ready to elevate?</h3>
        <p className="text-slate-400 mt-2">Contact: support@eleva.sa • +966 5X XXX XXXX</p>
        <p className="text-xs text-slate-500 mt-6">© {new Date().getFullYear()} Eleva — Elevation for restaurants.</p>
      </section>
    </div>
  );
}
