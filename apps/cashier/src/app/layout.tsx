import React from 'react';
import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Cashier — Zayjar',
  description: 'Point-of-sale terminal.',
  manifest: '/manifest.json',
};

/**
 * POS terminals run on tablets and fixed touch screens. `initialScale: 1` with
 * `width: device-width` keeps the till layout at true device resolution.
 *
 * Zoom is intentionally left enabled (WCAG 1.4.4); the previous `<head>` block
 * is expressed through the Metadata/Viewport API instead of raw tags so Next
 * can dedupe and stream them correctly.
 */
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#FF5733',
};

export default function RootLayout({ children }: { children: React.ReactNode }): React.ReactNode {
  return (
    <html lang="en">
      <body className="bg-gray-50 text-gray-900 antialiased">{children}</body>
    </html>
  );
}
