import React from 'react';
import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Order — Eleva',
  description: 'Scan, browse the menu and order from your table.',
};

/**
 * Mobile-first viewport.
 *
 * This app is reached exclusively by scanning a table QR code, so it is a
 * phone-first surface. Without this meta tag mobile browsers assume a ~980px
 * desktop viewport and scale the page down, which made every responsive
 * breakpoint in the markup inert.
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
      <body className="bg-gray-50 text-gray-900 antialiased">{children}</body>
    </html>
  );
}
