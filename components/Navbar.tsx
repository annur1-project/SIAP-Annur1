'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { 
  Home, 
  Users, 
  UserCheck,
  Wallet, 
  Calendar, 
  CheckSquare, 
  ShieldAlert, 
  FileText, 
  HeartPulse, 
  Utensils, 
  Package, 
  FileSpreadsheet,
  Settings,
  Menu,
  X
} from 'lucide-react';

const menuItems = [
  { name: 'Beranda', href: '/', icon: Home },
  { name: 'Data Santri', href: '/santri', icon: Users },
  { name: 'Data Pengurus', href: '/pengurus', icon: UserCheck },
  { name: 'Keuangan', href: '/keuangan', icon: Wallet },
  { name: 'Absen Jamaah', href: '/absen-jamaah', icon: CheckSquare },
  { name: 'Perizinan', href: '/perizinan', icon: FileText },
  { name: 'Keamanan & Poin', href: '/keamanan', icon: ShieldAlert },
  { name: 'Poskestren', href: '/kesehatan', icon: HeartPulse },
  { name: 'Dapur & Masak', href: '/dapur', icon: Utensils },
  { name: 'Sarpras', href: '/sarpras', icon: Package },
  { name: 'Kegiatan', href: '/kegiatan', icon: Calendar },
  { name: 'Pusat Laporan', href: '/laporan', icon: FileSpreadsheet },
  { name: 'Pengaturan Aplikasi', href: '/pengaturan', icon: Settings },
];

export default function Navbar({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col md:flex-row">
      
      {/* ========================================================= */}
      {/* 1. DESKTOP SIDEBAR (Tampilan Laptop / PC)                 */}
      {/* ========================================================= */}
      <aside className="print:hidden hidden md:flex flex-col w-64 bg-emerald-900 text-white min-h-screen fixed left-0 top-0 bottom-0 shadow-lg z-30">
        <div className="p-5 border-b border-emerald-800 flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-emerald-700 flex items-center justify-center font-bold text-lg border border-emerald-500 shrink-0">
            AN
          </div>
          <div>
            <h1 className="font-bold text-base leading-tight">e-Pondok An-Nur 1</h1>
            <p className="text-xs text-emerald-300">Bululawang - Malang</p>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto p-4 space-y-1">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = item.href === '/' 
              ? pathname === '/' 
              : pathname?.startsWith(item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive 
                    ? 'bg-emerald-700 text-white shadow-sm' 
                    : 'text-emerald-100 hover:bg-emerald-800/60 hover:text-white'
                }`}
              >
                <Icon className="w-5 h-5 text-emerald-300 shrink-0" />
                {item.name}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-emerald-800 text-xs text-emerald-300 text-center">
          SIAP An-Nur 1 v1.0
        </div>
      </aside>

      {/* ========================================================= */}
      {/* 2. MOBILE HEADER & DRAWER MENU (Tampilan HP / Tablet)    */}
      {/* ========================================================= */}
      <header className="print:hidden md:hidden bg-emerald-900 text-white p-4 sticky top-0 z-40 flex justify-between items-center shadow-md">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-emerald-700 flex items-center justify-center font-bold text-xs border border-emerald-500">
            AN
          </div>
          <span className="font-bold text-sm">e-Pondok An-Nur 1</span>
        </div>
        <button 
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="p-1.5 rounded-lg bg-emerald-800 hover:bg-emerald-700 text-white"
        >
          {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </header>

      {/* Menu Drawer HP saat ikon Hamburger diklik */}
      {mobileMenuOpen && (
        <div className="print:hidden md:hidden fixed inset-0 top-14 bg-emerald-950/95 z-40 p-5 overflow-y-auto">
          <div className="grid grid-cols-2 gap-3">
            {menuItems.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex flex-col items-center justify-center p-4 rounded-xl bg-emerald-900/80 border border-emerald-800 text-emerald-100 active:bg-emerald-700"
                >
                  <Icon className="w-6 h-6 mb-2 text-emerald-300" />
                  <span className="text-xs text-center font-medium">{item.name}</span>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* Fixed Bottom Bar Navigasi HP (4 Menu Utama) */}
      <nav className="print:hidden md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 z-30 flex justify-around p-2 shadow-lg">
        <Link href="/" className={`flex flex-col items-center p-1 ${pathname === '/' ? 'text-emerald-700' : 'text-slate-500'}`}>
          <Home className="w-5 h-5" />
          <span className="text-[10px] mt-0.5 font-medium">Beranda</span>
        </Link>
        <Link href="/santri" className={`flex flex-col items-center p-1 ${pathname === '/santri' ? 'text-emerald-700' : 'text-slate-500'}`}>
          <Users className="w-5 h-5" />
          <span className="text-[10px] mt-0.5 font-medium">Santri</span>
        </Link>
        <Link href="/keuangan" className={`flex flex-col items-center p-1 ${pathname === '/keuangan' ? 'text-emerald-700' : 'text-slate-500'}`}>
          <Wallet className="w-5 h-5" />
          <span className="text-[10px] mt-0.5 font-medium">Kas</span>
        </Link>
        <Link href="/perizinan" className={`flex flex-col items-center p-1 ${pathname === '/perizinan' ? 'text-emerald-700' : 'text-slate-500'}`}>
          <FileText className="w-5 h-5" />
          <span className="text-[10px] mt-0.5 font-medium">Izin</span>
        </Link>
      </nav>

      {/* Area Konten Utama Halaman */}
      <main className="flex-1 md:ml-64 print:ml-0 p-4 md:p-8 print:p-0 mb-16 md:mb-0">
        {children}
      </main>

    </div>
  );
}