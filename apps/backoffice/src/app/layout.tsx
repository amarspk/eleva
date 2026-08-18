import React from 'react';
import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'ELEVA — Premium Restaurant SaaS Platform',
  description:
    'ELEVA is a premium restaurant SaaS platform. Every restaurant gets its own website, QR ordering, cashier POS, kitchen display, multi-branch management, and design customization — in English and Arabic.',
  openGraph: {
    title: 'ELEVA — Premium Restaurant SaaS Platform',
    description:
      'Elevate your restaurant with a powerful website, QR ordering, POS, and management platform. Built for independent restaurants, in English and Arabic.',
    type: 'website',
    siteName: 'ELEVA',
  },
};

/**
 * Responsive viewport. The Tower and dashboard are used on phones, tablets
 * and desktops; the responsive breakpoints in the markup must engage.
 *
 * `maximumScale` is deliberately NOT set: locking zoom is an accessibility
 * failure (WCAG 1.4.4). The iOS auto-zoom-on-focus problem is solved instead
 * by the 16px input font-size rule in globals.css.
 */
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }): React.ReactNode {
  return (
    <html lang="en">
      <body className="bg-slate-950 text-gray-900 antialiased">{children}</body>
    </html>
  );
}