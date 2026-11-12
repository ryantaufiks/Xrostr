import type { Metadata, Viewport } from 'next';
import { Doto, Inter, Space_Mono } from 'next/font/google';
import { isLocale, type Locale } from '@xrostr/contracts';
import { cookies, headers } from 'next/headers';
import type { ReactNode } from 'react';
import { PwaRegister } from '@/components/pwa-register';
import { I18nProvider } from '@/lib/i18n';
import { LOCALE_COOKIE } from '@/lib/i18n/state';
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
  description: 'Autonomous HRMS for security agencies and shift workforces.',
  robots: { index: false, follow: false },
  appleWebApp: { capable: true, title: 'Xrostr', statusBarStyle: 'black-translucent' },
  icons: { icon: '/icons/icon-192.png', apple: '/icons/apple-touch-icon.png' },
};

export const viewport: Viewport = {
  themeColor: '#000000',
  colorScheme: 'dark light',
};

/**
 * The first paint uses the language remembered on this device, else the browser's. Once
 * signed in, the person's own setting (or their company's default) takes over.
 */
async function initialLocale(): Promise<Locale> {
  const remembered = (await cookies()).get(LOCALE_COOKIE)?.value;
  if (isLocale(remembered)) return remembered;
  const accept = (await headers()).get('accept-language') ?? '';
  return /^id\b/i.test(accept.trim()) ? 'id' : 'en';
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  const locale = await initialLocale();
  return (
    // The boot script may set data-theme before React hydrates.
    <html
      lang={locale}
      className={`${inter.variable} ${spaceMono.variable} ${doto.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      <body>
        <I18nProvider initial={locale}>
          {children}
          <PwaRegister />
        </I18nProvider>
      </body>
    </html>
  );
}
