import type { Metadata, Viewport } from 'next';
import { Doto, Inter, Space_Mono } from 'next/font/google';
import type { ReactNode } from 'react';
import { PwaRegister } from '@/components/pwa-register';
import { THEME_BOOT_SCRIPT } from '@/lib/theme';
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
  appleWebApp: { capable: true, title: 'Xrostr', statusBarStyle: 'black-translucent' },
  icons: { icon: '/icons/icon-192.png', apple: '/icons/apple-touch-icon.png' },
};

export const viewport: Viewport = {
  themeColor: '#000000',
  colorScheme: 'dark light',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // The boot script may set data-theme before React hydrates.
    <html
      lang="id"
      className={`${inter.variable} ${spaceMono.variable} ${doto.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      <body>
        {children}
        <PwaRegister />
      </body>
    </html>
  );
}
