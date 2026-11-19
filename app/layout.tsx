import type { Metadata, Viewport } from 'next';
import { Suspense } from 'react';
import {
  DM_Sans,
  JetBrains_Mono,
  Lora,
  Manrope,
  Plus_Jakarta_Sans,
} from 'next/font/google';
import './globals.css';
import Navbar from '@/components/Navbar';
import SupabaseEnvScript from '@/components/SupabaseEnvScript';
import ThemeProvider from '@/components/ThemeProvider';

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
  themeColor: '#064e3b',
};

export const metadata: Metadata = {
  title: 'e-Pondok An-Nur 1 Bululawang',
  description: 'Sistem Informasi Administrasi & Keuangan Pondok Pesantren An-Nur 1',
  manifest: '/manifest.json',
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
        <Suspense fallback={null}>
          <SupabaseEnvScript />
        </Suspense>
        <ThemeProvider />
        <Navbar>{children}</Navbar>
      </body>
    </html>
  );
}