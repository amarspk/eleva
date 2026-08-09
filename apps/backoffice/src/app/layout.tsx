import React from 'react';
import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Backoffice — Eleva',
  description: 'Restaurant administration dashboard.',
};

/**
 * Responsive viewport. The dashboard is desktop-first but is regularly opened
 * on tablets by floor managers, so the responsive breakpoints already present
 * in the markup must actually engage.
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
