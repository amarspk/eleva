'use client';
/* eslint-disable */

import React, { useMemo, useState } from 'react';
import type { PublicCategory, PublicSiteResponse } from '../lib/types';

/**
 * Phase 4 P1 — token-free public restaurant website.
 *
 * Rendered at the tenant subdomain when no QR table token is present. Mobile
 * first, branding-aware (tenant primary/secondary colors, logo, banner) and
 * shows real restaurant contact/social links plus a category-filterable menu.
 * The QR ordering flow (MenuBrowser) remains the transaction surface.
 */
export const RestaurantSite: React.FC<{ site: PublicSiteResponse }> = ({ site }) => {
  const { tenant, restaurant, branch, categories } = site;
  const primary = tenant.primaryColor || '#000000';
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

  const categoryName = selectedCategoryId === 'all' ? 'Menu' : (categories.find((c) => c.id === selectedCategoryId)?.name ?? 'Menu');

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col" style={{ fontFamily: 'inherit' }}>
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
          <h1 className="text-2xl font-bold">{tenant.name}</h1>
          <p className="text-sm opacity-90 mt-1">
            {restaurant.name}
            {branch ? ` • ${branch.name}` : ''}
          </p>
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
        <nav className="sticky top-0 z-10 bg-white/95 backdrop-blur border-b border-gray-200">
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
      <main className="max-w-md mx-auto w-full flex-1 px-4 py-4">
        <h2 className="text-sm font-bold text-gray-700 mb-3">{categoryName}</h2>
        {visibleProducts.length === 0 ? (
          <p className="text-sm text-gray-500">No items available right now.</p>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {visibleProducts.map((p) => (
              <div key={p.id} className="bg-white rounded-xl overflow-hidden shadow-sm border border-gray-100">
                {p.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.imageUrl} alt={p.name} className="w-full h-24 object-cover" />
                ) : (
                  <div className="w-full h-24 bg-gray-100 flex items-center justify-center text-gray-300 text-2xl">🍽</div>
                )}
                <div className="p-3">
                  <h3 className="text-sm font-semibold text-gray-800">{p.name}</h3>
                  <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{p.description ?? ''}</p>
                  <p className="text-sm font-bold mt-2" style={{ color: primary }}>
                    {new Intl.NumberFormat(undefined, { style: 'currency', currency: restaurant.currency }).format(p.basePrice)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      <footer className="text-center text-xs text-gray-400 py-6 px-4">
        {tenant.name} — order from the table QR to place an order.
      </footer>
    </div>
  );
};

export default RestaurantSite;
