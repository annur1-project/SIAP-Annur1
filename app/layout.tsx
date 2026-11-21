import type { Metadata, Viewport } from 'next';
import {
  DM_Sans,
  JetBrains_Mono,
  Lora,
  Manrope,
  Plus_Jakarta_Sans,
} from 'next/font/google';
import './globals.css';
import Navbar from '@/components/Navbar';
import ThemeProvider from '@/components/ThemeProvider';
import ServiceWorkerRegister from '@/components/ServiceWorkerRegister';
import { AuthProvider } from '@/lib/auth';

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-jakarta',
});

const dmSans = DM_Sans({
  subsets: ['latin'],
  variable: '--font-dmsans',
});

const manrope = Manrope({
  subsets: ['latin'],
  variable: '--font-manrope',
});

const lora = Lora({
  subsets: ['latin'],
  variable: '--font-lora',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains',
});

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#065f46',
};

export const metadata: Metadata = {
  title: 'e-annursatu — Sistem Informasi Pondok Pesantren An-Nur 1',
  description:
    'Sistem Informasi Administrasi & Layanan Digital Pondok Pesantren An-Nur 1 Bululawang',
  applicationName: 'e-annursatu',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'e-annursatu',
  },
  icons: {
    icon: [
      { url: '/icon.svg', type: 'image/svg+xml' },
      { url: '/icon.png', type: 'image/png' },
    ],
    apple: '/apple-icon.png',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="id"
      className={`${plusJakarta.variable} ${dmSans.variable} ${manrope.variable} ${lora.variable} ${jetbrainsMono.variable}`}
    >
      <body className="antialiased">
        <ThemeProvider />
        <ServiceWorkerRegister />
        <AuthProvider>
          <Navbar>{children}</Navbar>
        </AuthProvider>
      </body>
    </html>
  );
}