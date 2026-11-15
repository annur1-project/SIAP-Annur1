import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import Navbar from '@/components/Navbar';

const inter = Inter({ subsets: ['latin'] });

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
    <html lang="id">
      <body className={inter.className}>
        <Navbar>{children}</Navbar>
      </body>
    </html>
  );
}