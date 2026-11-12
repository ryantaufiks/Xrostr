import type { Metadata } from 'next';
import { Doto, Inter, Space_Mono } from 'next/font/google';
import type { ReactNode } from 'react';
import './globals.css';

// Self-hosted at build time, so the strict font-src CSP still holds.
const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });
const spaceMono = Space_Mono({
  subsets: ['latin'],
  weight: ['400', '700'],
  variable: '--font-space-mono',
});
const doto = Doto({ subsets: ['latin'], variable: '--font-doto' });

export const metadata: Metadata = {
  title: { default: 'Xrostr', template: '%s · Xrostr' },
  description: 'HRMS otonom untuk agensi security dan tenaga kerja shift.',
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="id" className={`${inter.variable} ${spaceMono.variable} ${doto.variable}`}>
      <body>{children}</body>
    </html>
  );
}
