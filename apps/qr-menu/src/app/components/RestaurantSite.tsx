'use client';
/* eslint-disable */

import React, { useMemo, useState, useEffect, useRef } from 'react';
import type { PublicCategory, PublicSiteResponse } from '../lib/types';

/**
 * Phase 4 P1 — token-free public restaurant website.
 *
 * Rendered at the tenant subdomain when no QR table token is present. Mobile
 * first, branding-aware (tenant primary/secondary colors, logo, banner) and
 * shows real restaurant contact/social links plus a category-filterable menu.
 * The QR ordering flow (MenuBrowser) remains the transaction surface.
 *
 * Supports the Eleva Website Builder design configuration:
 *   - site.design.colors -> primary, secondary
 *   - site.design.theme   -> 'light' | 'dark' | 'auto'
 *   - site.design.fonts   -> heading, body
 *   - site.design.banner  -> logo, coverImage
 * When site.design is absent the tenant's native branding (from the API) is
 * used as a fallback — the public website works without the website editor.
 *
 * Theme modes:
 *   - light (default): light background, dark text
 *   - dark:            dark background, light text (inverted primary-derived)
 *   - auto:            follows the user's prefers-color-scheme media query
 *
 * The design is applied through CSS custom properties on the root container so
 * all child components inherit the theme without prop-drilling.
 */
export const RestaurantSite: React.FC<{ site: PublicSiteResponse }> = ({ site }) => {
  const { tenant, restaurant, branch, categories } = site;
  const branches = site.branches && site.branches.length > 0 ? site.branches : (branch ? [branch] : []);
  const design = site.design as Record<string, unknown> | null | undefined;
  const designColors = (design?.colors as Record<string, string> | undefined) || {};
  const primary = designColors.primary || tenant.primaryColor || '#000000';
  const secondary = designColors.secondary || tenant.secondaryColor || '#ffffff';
  const theme = (design?.theme as string) || 'light';
  const bodyFont = (design?.fonts as Record<string, string> | undefined)?.body || 'inherit';
  const headingFont = (design?.fonts as Record<string, string> | undefined)?.heading || 'inherit';

  // Track the user's system color-scheme preference for 'auto' mode
  const prefersDark = useRef(false);
  const [systemTheme, setSystemTheme] = useState<'light' | 'dark'>('light');
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    prefersDark.current = mq.matches;
    setSystemTheme(mq.matches ? 'dark' : 'light');
    const handler = (e: MediaQueryListEvent) => {
      prefersDark.current = e.matches;
      setSystemTheme(e.matches ? 'dark' : 'light');
    };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const activeTheme = theme === 'auto' ? systemTheme : (theme as 'light' | 'dark');
  const isDark = activeTheme === 'dark';
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('all');

  const flatProducts = useMemo(
    () => categories.flatMap((c: PublicCategory) => c.products),
    [categories],
  );

  const visibleProducts = useMemo(() => {
    if (selectedCategoryId === 'all') return flatProducts;
    const cat = categories.find((c) => c.id === selectedCategoryId);
    return cat ? cat.products : flatProducts;
  }, [selectedCategoryId, categories, flatProducts]);

  // Build the social/contact row — only real links that are configured.
  const social = tenant.social;
  const socialLinks: Array<{ href: string; label: string; emoji: string }> = [];
  if (social?.phone) socialLinks.push({ href: `tel:${social.phone}`, label: 'Call', emoji: '📞' });
  if (social?.whatsapp) socialLinks.push({ href: `https://wa.me/${social.whatsapp.replace(/\D/g, '')}`, label: 'WhatsApp', emoji: '💬' });
  if (social?.instagram) socialLinks.push({ href: `https://instagram.com/${social.instagram.replace(/^@/, '')}`, label: 'Instagram', emoji: '📸' });
  if (social?.twitter) socialLinks.push({ href: `https://x.com/${social.twitter.replace(/^@/, '')}`, label: 'X', emoji: '𝕏' });
  // Branch phone is a real fallback for "call the restaurant".
  if (socialLinks.length === 0 && branch?.phoneNumber) {
    socialLinks.push({ href: `tel:${branch.phoneNumber}`, label: 'Call', emoji: '📞' });
  }

  const selectedCategory = selectedCategoryId === 'all' ? undefined : categories.find((c) => c.id === selectedCategoryId);
  const categoryName = selectedCategory?.name ?? 'Menu';
  const aboutText =
    (typeof design?.about === 'string' && design.about.trim()) ||
    (typeof site.about === 'string' && site.about.trim()) ||
    '';

  return (
    <div data-theme={activeTheme} data-primary={primary} data-secondary={secondary} className="min-h-screen flex flex-col" style={{ fontFamily: bodyFont, backgroundColor: isDark ? '#111' : '#f9fafb', color: isDark ? '#eee' : '#111' }}>
      {/* Theme CSS variables */}
      <style>{`
        :root { --color-primary: ${primary}; --color-secondary: ${secondary}; --font-heading: ${headingFont}; --font-body: ${bodyFont}; }
        [data-theme="dark"] { --bg-main: #111; --bg-card: #1e1e1e; --bg-chip: #2a2a2a; --text-main: #eee; --text-muted: #999; --border-subtle: #333; --shadow-card: none; }
        [data-theme="light"] { --bg-main: #f9fafb; --bg-card: #fff; --bg-chip: #f3f4f6; --text-main: #111; --text-muted: #6b7280; --border-subtle: #e5e7eb; --shadow-card: 0 1px 3px rgba(0,0,0,0.1); }
      `}</style>
      {/* Hero — banner, logo, restaurant identity */}
      <header
        className="relative text-white"
        style={{ background: `linear-gradient(135deg, ${primary} 0%, ${primary}CC 100%)` }}
      >
        {tenant.bannerUrl ? (
          <div
            className="absolute inset-0 bg-cover bg-center opacity-40"
            style={{ backgroundImage: `url(${tenant.bannerUrl})` }}
            aria-hidden
          />
        ) : null}
        <div className="relative max-w-md mx-auto px-4 pt-10 pb-12 text-center">
          {tenant.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={tenant.logoUrl} alt={`${tenant.name} logo`} className="w-16 h-16 rounded-full object-cover mx-auto mb-3 border-2 border-white/60" />
          ) : (
            <div className="w-16 h-16 rounded-full bg-white/20 mx-auto mb-3 flex items-center justify-center text-2xl font-bold">
              {tenant.name.slice(0, 1)}
            </div>
          )}
          <h1 className="text-2xl font-bold" style={{fontFamily: headingFont}}>{tenant.name}</h1>
          <p className="text-sm opacity-90 mt-1">
            {restaurant.name}
            {branch ? ` • ${branch.name}` : ''}
          </p>
          <nav aria-label="Restaurant pages" className="flex justify-center gap-2 mt-4 flex-wrap">
            <a href="#menu" className="px-3 py-1.5 rounded-full bg-white/20 text-xs font-semibold">Menu</a>
            {aboutText ? <a href="#about" className="px-3 py-1.5 rounded-full bg-white/20 text-xs font-semibold">About</a> : null}
            {branches.length > 0 ? <a href="#branches" className="px-3 py-1.5 rounded-full bg-white/20 text-xs font-semibold">Branches</a> : null}
            <a href="#contact" className="px-3 py-1.5 rounded-full bg-white/20 text-xs font-semibold">Contact</a>
          </nav>
          {/* Phase 4 — customer account entry (restaurant-branded) */}
          <div className="flex justify-center gap-2 mt-3">
            <a
              href="/account"
              className="inline-flex items-center gap-1 px-4 py-1.5 rounded-full bg-white/90 text-gray-800 text-xs font-semibold hover:bg-white"
            >
              <span aria-hidden>👤</span> My account
            </a>
          </div>
          {socialLinks.length > 0 && (
            <div className="flex justify-center gap-2 mt-4 flex-wrap">
              {socialLinks.map((link) => (
                <a
                  key={link.label}
                  href={link.href}
                  target={link.href.startsWith('tel:') ? undefined : '_blank'}
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-white/90 text-gray-800 text-xs font-semibold hover:bg-white"
                >
                  <span>{link.emoji}</span> {link.label}
                </a>
              ))}
            </div>
          )}
        </div>
      </header>

      {/* Category chips — filter products */}
      {categories.length > 1 && (
        <nav className="sticky top-0 z-10 backdrop-blur border-b" style={{backgroundColor: isDark ? 'rgba(17,17,17,0.95)' : 'rgba(255,255,255,0.95)', borderColor: isDark ? '#333' : '#e5e7eb'}}>
          <div className="max-w-md mx-auto flex gap-2 overflow-x-auto px-4 py-2">
            <button
              onClick={() => setSelectedCategoryId('all')}
              className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition ${
                selectedCategoryId === 'all' ? 'text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
              style={selectedCategoryId === 'all' ? { backgroundColor: primary } : undefined}
            >
              All
            </button>
            {categories.map((c) => (
              <button
                key={c.id}
                onClick={() => setSelectedCategoryId(c.id)}
                className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition ${
                  selectedCategoryId === c.id ? 'text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
                style={selectedCategoryId === c.id ? { backgroundColor: primary } : undefined}
              >
                {c.name}
              </button>
            ))}
          </div>
        </nav>
      )}

      {/* Product list filtered by the selected category */}
      <main id="menu" className="max-w-md mx-auto w-full flex-1 px-4 py-4" style={{backgroundColor: 'var(--bg-main)', color: 'var(--text-main)'}}>
        <h2 className="text-sm font-bold mb-3" style={{fontFamily: headingFont, color: 'var(--text-main)'}}>{categoryName}</h2>
        {selectedCategory?.imageUrl ? (
          <div className="rounded-xl overflow-hidden mb-3" style={{boxShadow: 'var(--shadow-card)'}}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={selectedCategory.imageUrl} alt={selectedCategory.name} className="w-full h-28 object-cover" />
          </div>
        ) : (
          selectedCategory && (
            <div className="rounded-xl mb-3 h-20 flex items-center justify-center" style={{backgroundColor: isDark ? '#1e1e1e' : '#f3f4f6', color: isDark ? '#555' : '#d1d5db'}}>
              {selectedCategory.name}
            </div>
          )
        )}
        {visibleProducts.length === 0 ? (
          <p className="text-sm" style={{color: 'var(--text-muted)'}}>No items available right now.</p>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {visibleProducts.map((p) => (
              <div key={p.id} className="rounded-xl overflow-hidden border" style={{backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-subtle)', boxShadow: 'var(--shadow-card)'}}>
                {p.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.imageUrl} alt={p.name} className="w-full h-24 object-cover" />
                ) : (
                  <div className="w-full h-24 flex items-center justify-center text-2xl" style={{backgroundColor: isDark ? '#2a2a2a' : '#f3f4f6', color: isDark ? '#555' : '#d1d5db'}}>🍽</div>
                )}
                <div className="p-3">
                  <h3 className="text-sm font-semibold" style={{color: 'var(--text-main)'}}>{p.name}</h3>
                  <p className="text-xs mt-0.5 line-clamp-2" style={{color: 'var(--text-muted)'}}>{p.description ?? ''}</p>
                  <p className="text-sm font-bold mt-2" style={{ color: primary }}>
                    {new Intl.NumberFormat(undefined, { style: 'currency', currency: restaurant.currency }).format(p.basePrice)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {aboutText ? (
        <section id="about" className="max-w-md mx-auto w-full px-4 pb-6" style={{color: 'var(--text-main)'}}>
          <h2 className="text-sm font-bold mb-2" style={{fontFamily: headingFont}}>About</h2>
          <p className="text-sm leading-relaxed" style={{color: 'var(--text-muted)'}}>{aboutText}</p>
        </section>
      ) : null}

      {branches.length > 0 ? (
        <section id="branches" className="max-w-md mx-auto w-full px-4 pb-6" style={{color: 'var(--text-main)'}}>
          <h2 className="text-sm font-bold mb-2" style={{fontFamily: headingFont}}>Branches</h2>
          <ul className="space-y-2">
            {branches.map((b) => (
              <li key={b.id} className="rounded-xl border p-3 text-sm" style={{borderColor: 'var(--border-subtle)', backgroundColor: 'var(--bg-card)'}}>
                <div className="font-semibold">{b.name}</div>
                {b.address ? <div className="text-xs mt-1" style={{color: 'var(--text-muted)'}}>{b.address}</div> : null}
                {b.phoneNumber ? <a className="text-xs mt-1 inline-block" href={`tel:${b.phoneNumber}`}>{b.phoneNumber}</a> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section id="contact" className="max-w-md mx-auto w-full px-4 pb-6" style={{color: 'var(--text-main)'}}>
        <h2 className="text-sm font-bold mb-2" style={{fontFamily: headingFont}}>Contact</h2>
        <div className="text-sm space-y-1" style={{color: 'var(--text-muted)'}}>
          {social?.phone ? <p>Phone {social.phone}</p> : null}
          {social?.whatsapp ? <p>WhatsApp {social.whatsapp}</p> : null}
          {social?.instagram ? <p>Instagram @{social.instagram.replace(/^@/, '')}</p> : null}
          {social?.twitter ? <p>X @{social.twitter.replace(/^@/, '')}</p> : null}
          {!social?.phone && branch?.phoneNumber ? <p>Phone {branch.phoneNumber}</p> : null}
          {branch?.address ? <p>{branch.address}</p> : null}
          {!social?.phone && !social?.whatsapp && !branch?.phoneNumber ? (
            <p>Visit us{branch?.name ? ` at ${branch.name}` : ''} or scan the table QR to order.</p>
          ) : null}
        </div>
      </section>

      <footer className="text-center text-xs py-6 px-4" style={{color: 'var(--text-muted)', fontFamily: bodyFont}}>
        {tenant.name} — order from the table QR to place an order.
      </footer>
    </div>
  );
};

export default RestaurantSite;
