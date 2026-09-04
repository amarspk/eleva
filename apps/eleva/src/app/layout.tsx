import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'ELEVA Executive Office',
  description: 'Executive AI secretary and agent workspace.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#08080b',
};

export default function RootLayout({ children }: { children: React.ReactNode }): React.ReactNode {
  return (
    <html lang="en" className="bg-luxury-black text-gold-100 antialiased">
      <body>{children}</body>
    </html>
  );
}
