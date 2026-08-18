'use client';

import React from 'react';

/* ─── Reception zones — each a distinct architectural corner ─── */
export interface Zone {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  icon: string;
  color: string;
}

export const RECEPTION_ZONES: Zone[] = [
  {
    id: 'about',
    title: 'About ELEVA',
    subtitle: 'Our story',
    description: 'ELEVA is a premium Restaurant SaaS platform built for independent restaurants. We give every restaurant its own powerful website, ordering system, management dashboard, and brand identity — all from one integrated platform.',
    icon: '🏛',
    color: 'from-orange-500 to-pink-500',
  },
  {
    id: 'features',
    title: 'What we do',
    subtitle: 'Platform capabilities',
    description: 'Manage products, categories, branches, staff, tables, and orders from one Backoffice. Customers scan a QR code to browse the full menu, customize their order, and checkout — without an account or app download.',
    icon: '⚙️',
    color: 'from-blue-500 to-cyan-500',
  },
  {
    id: 'how-it-works',
    title: 'How it works',
    subtitle: 'From setup to first order',
    description: '1. Create your restaurant profile. 2. Add categories and products with images, prices, sizes, and add-ons. 3. Print QR codes for your tables. 4. Customers scan, browse, and order. 5. Orders appear in the Kitchen Display and your staff manages fulfilment.',
    icon: '📋',
    color: 'from-green-500 to-emerald-500',
  },
  {
    id: 'restaurant-site',
    title: 'Restaurant Websites',
    subtitle: 'Independent brand identity',
    description: 'Every restaurant gets its own beautiful, mobile-first website with custom branding — logo, colors, fonts, cover image, theme (Light / Dark / Auto), and category presentation. Fully customizable from the Visual Builder without touching code.',
    icon: '🌐',
    color: 'from-orange-500 to-yellow-500',
  },
  {
    id: 'pos',
    title: 'POS & Integrations',
    subtitle: 'ELEVA POS or your existing system',
    description: 'Use the built-in ELEVA Cashier POS for dine-in, take-away, and delivery orders. Connect your existing POS through the integration layer — products, orders, and pricing sync where the provider supports it.',
    icon: '💳',
    color: 'from-red-500 to-orange-500',
  },
  {
    id: 'multilingual',
    title: 'Arabic & English',
    subtitle: 'Full RTL support',
    description: 'ELEVA is built bilingual from the ground up — English and Arabic with full LTR/RTL support. The entire platform, from the Tower experience to the restaurant website, works naturally in both directions.',
    icon: '🔤',
    color: 'from-teal-500 to-cyan-500',
  },
  {
    id: 'pricing',
    title: 'Pricing',
    subtitle: 'Transparent plans',
    description: 'Choose a plan that fits your restaurant size. Every plan includes the full website builder, QR ordering, menu management, cashier POS, KDS, and multi-branch support. Enterprise plan adds priority support and custom integrations.',
    icon: '💳',
    color: 'from-purple-500 to-pink-500',
  },
  {
    id: 'faq',
    title: 'FAQ',
    subtitle: 'Common questions',
    description: 'Have a question? Check our frequently asked questions about setup, billing, custom domains, data portability, and support.',
    icon: '❓',
    color: 'from-gray-600 to-slate-700',
  },
  {
    id: 'contact',
    title: 'Contact',
    subtitle: 'Get in touch',
    description: 'Reach out to our team for sales inquiries, support, or partnership opportunities. We are here to help elevate your restaurant.',
    icon: '📧',
    color: 'from-indigo-500 to-purple-500',
  },
  {
    id: 'terms',
    title: 'Terms & Privacy',
    subtitle: 'Legal',
    description: 'Our terms of service and privacy policy govern your use of the ELEVA platform. These are available through the legal content system and are kept up to date.',
    icon: '⚖️',
    color: 'from-slate-500 to-zinc-600',
  },
];

/* ─── Reception props ─── */
interface ReceptionProps {
  activeZone: string | null;
  prefersReducedMotion: boolean;
  onSelectZone: (id: string) => void;
  onBackToExterior: () => void;
  isRtl: boolean;
  onToggleLanguage: () => void;
}

export function ElevaReception({
  activeZone,
  prefersReducedMotion,
  onSelectZone,
  onBackToExterior,
  isRtl,
  onToggleLanguage,
}: ReceptionProps): React.ReactNode {
  return (
    <div className="relative bg-slate-950">
      {/* Sticky zone navigation */}
      <div className="sticky top-0 z-30 backdrop-blur-md bg-slate-900/90 border-b border-white/5">
        <div className="max-w-7xl mx-auto px-4 py-2 flex items-center gap-1 overflow-x-auto">
          <button
            type="button"
            onClick={onBackToExterior}
            className="shrink-0 text-xs font-semibold text-white/60 hover:text-white px-2 py-1.5 rounded transition-colors"
          >
            ← Exterior
          </button>
          <div className="w-px h-5 bg-white/10 mx-1" aria-hidden />
          {RECEPTION_ZONES.map(z => (
            <button
              key={z.id}
              type="button"
              onClick={() => onSelectZone(z.id)}
              aria-current={activeZone === z.id ? 'true' : undefined}
              className={`shrink-0 text-xs font-medium px-3 py-1.5 rounded-full transition-all whitespace-nowrap ${
                activeZone === z.id
                  ? 'bg-white/15 text-white'
                  : 'text-white/50 hover:text-white hover:bg-white/5'
              }`}
            >
              {z.title}
            </button>
          ))}
          <button
            type="button"
            onClick={onToggleLanguage}
            className="ml-auto shrink-0 text-xs text-white/40 hover:text-white px-2 py-1.5 rounded transition-colors"
          >
            {isRtl ? 'English' : 'العربية'}
          </button>
        </div>
      </div>

      {/* Reception zones — distinct architectural corners */}
      {RECEPTION_ZONES.map((zone, idx) => (
        <div
          key={zone.id}
          id={`zone-${zone.id}`}
          className="zone-corner relative overflow-hidden"
          style={{
            backgroundColor: idx % 2 === 0 ? 'rgb(15,23,42)' : 'rgb(17,24,39)',
            scrollMarginTop: 56,
          }}
        >
          {/* Architectural angle line */}
          <div
            className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent"
            aria-hidden
          />

          <div className="relative z-10 max-w-7xl mx-auto px-6 md:px-12 py-20 md:py-24">
            <div className={`grid md:grid-cols-2 gap-10 md:gap-16 items-center ${idx % 2 === 1 && !isRtl ? 'md:[direction:rtl]' : ''}`}>
              {/* Icon / architectural object */}
              <div className={`flex justify-center ${prefersReducedMotion ? '' : 'animate-[fadeIn_0.8s_ease-out]'}`}>
                <div className={`w-24 h-24 md:w-36 md:h-36 rounded-2xl bg-gradient-to-br ${zone.color} flex items-center justify-center text-4xl md:text-5xl shadow-2xl`}>
                  <span role="img" aria-label={zone.title}>{zone.icon}</span>
                </div>
              </div>

              {/* Content */}
              <div className={prefersReducedMotion ? '' : 'animate-[fadeInUp_0.8s_ease-out]'}>
                <span className="text-xs text-white/30 uppercase tracking-widest">{zone.subtitle}</span>
                <h2 className="text-3xl md:text-4xl font-black text-white mt-2 mb-4">{zone.title}</h2>
                <p className="text-white/70 leading-relaxed text-sm md:text-base">{zone.description}</p>
              </div>
            </div>
          </div>
        </div>
      ))}

      {/* Footer */}
      <footer className="bg-slate-950 border-t border-white/5 py-12 px-6">
        <div className="max-w-7xl mx-auto grid md:grid-cols-4 gap-8 text-sm">
          <div>
            <h3 className="font-black text-white mb-3">ELEVA</h3>
            <p className="text-white/40 text-xs">Premium Restaurant SaaS Platform</p>
          </div>
          <div>
            <h4 className="font-semibold text-white/60 mb-3 uppercase text-xs tracking-wider">Platform</h4>
            <div className="space-y-2">
              <button type="button" onClick={() => onSelectZone('about')} className="block text-white/40 hover:text-white transition-colors text-xs">About</button>
              <button type="button" onClick={() => onSelectZone('features')} className="block text-white/40 hover:text-white transition-colors text-xs">Features</button>
              <button type="button" onClick={() => onSelectZone('pricing')} className="block text-white/40 hover:text-white transition-colors text-xs">Pricing</button>
              <button type="button" onClick={() => onSelectZone('faq')} className="block text-white/40 hover:text-white transition-colors text-xs">FAQ</button>
            </div>
          </div>
          <div>
            <h4 className="font-semibold text-white/60 mb-3 uppercase text-xs tracking-wider">Legal</h4>
            <div className="space-y-2">
              <button type="button" onClick={() => onSelectZone('terms')} className="block text-white/40 hover:text-white transition-colors text-xs">Terms of Service</button>
              <button type="button" onClick={() => onSelectZone('terms')} className="block text-white/40 hover:text-white transition-colors text-xs">Privacy Policy</button>
            </div>
          </div>
          <div>
            <h4 className="font-semibold text-white/60 mb-3 uppercase text-xs tracking-wider">Language</h4>
            <button type="button" onClick={onToggleLanguage} className="text-white/40 hover:text-white transition-colors text-xs">
              {isRtl ? 'English' : 'العربية'}
            </button>
          </div>
        </div>
        <div className="max-w-7xl mx-auto mt-8 pt-8 border-t border-white/5 text-center text-xs text-white/20">
          © {new Date().getFullYear()} ELEVA. All rights reserved.
        </div>
      </footer>
    </div>
  );
}

export default ElevaReception;