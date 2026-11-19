'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Home,
  Users,
  UserCheck,
  Wallet,
  Calendar,
  CalendarDays,
  CheckSquare,
  ShieldAlert,
  FileText,
  HeartPulse,
  Utensils,
  Package,
  FileSpreadsheet,
  Settings,
  Menu,
  X,
  Shirt,
  UserPlus,
} from 'lucide-react';
import {
  DEFAULT_MOBILE_NAV_HREFS,
  DEFAULT_TEMA_APLIKASI,
  MOBILE_NAV_UPDATED_EVENT,
  QUICK_MENU_CATALOG,
  readMobileNavPrefs,
  readTemaLocal,
  THEME_UPDATED_EVENT,
  type TemaAplikasiConfig,
} from '@/lib/pengaturan';
import { renderQuickMenuIcon } from '@/components/QuickMenuConfigModal';

const menuItems = [
  { name: 'Beranda', href: '/', icon: Home },
  { name: 'Pendaftaran PSB', href: '/pendaftaran', icon: UserPlus },
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
  { name: 'Kalender', href: '/kalender', icon: CalendarDays },
  { name: 'Sie Laundry', href: '/laundry', icon: Shirt },
  { name: 'Pusat Laporan', href: '/laporan', icon: FileSpreadsheet },
  { name: 'Pengaturan Aplikasi', href: '/pengaturan', icon: Settings },
];

export default function Navbar({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [tema, setTema] = useState<TemaAplikasiConfig>(DEFAULT_TEMA_APLIKASI);
  const [logoUrl, setLogoUrl] = useState<string>('');
  const [mobileNavHrefs, setMobileNavHrefs] = useState<string[]>(DEFAULT_MOBILE_NAV_HREFS);

  useEffect(() => {
    const timer = setTimeout(() => {
      const localTema = readTemaLocal();
      if (localTema) setTema(localTema);
      setMobileNavHrefs(readMobileNavPrefs());
    }, 0);

    const handleThemeEvent = (evt: Event) => {
      const custom = evt as CustomEvent<{ tema?: TemaAplikasiConfig; logoUrl?: string }>;
      if (custom.detail?.tema) setTema(custom.detail.tema);
      if (typeof custom.detail?.logoUrl === 'string') setLogoUrl(custom.detail.logoUrl);
    };

    const handleMobileNavEvent = (evt: Event) => {
      const custom = evt as CustomEvent<{ hrefs?: string[] }>;
      if (Array.isArray(custom.detail?.hrefs)) {
        setMobileNavHrefs(custom.detail.hrefs);
      } else {
        setMobileNavHrefs(readMobileNavPrefs());
      }
    };

    window.addEventListener(THEME_UPDATED_EVENT, handleThemeEvent);
    window.addEventListener(MOBILE_NAV_UPDATED_EVENT, handleMobileNavEvent);
    return () => {
      clearTimeout(timer);
      window.removeEventListener(THEME_UPDATED_EVENT, handleThemeEvent);
      window.removeEventListener(MOBILE_NAV_UPDATED_EVENT, handleMobileNavEvent);
    };
  }, []);

  const useCustomAccent = tema.preset !== 'emerald';
  const isPublicPsbRoute =
    pathname?.startsWith('/daftar') || pathname?.startsWith('/cek-daftar');

  if (isPublicPsbRoute) {
    return (
      <div className="min-h-screen bg-slate-50 text-slate-900">
        {children}
      </div>
    );
  }

  return (
    <div
      data-siap-shell
      data-theme-custom-accent={useCustomAccent ? 'true' : 'false'}
      className="min-h-screen bg-slate-50 flex flex-col md:flex-row transition-colors"
    >
      {/* 1. DESKTOP SIDEBAR */}
      <aside
        data-siap-sidebar
        style={{ backgroundColor: tema.sidebarColor }}
        className="print:hidden hidden md:flex flex-col w-64 text-white min-h-screen fixed left-0 top-0 bottom-0 shadow-lg z-30 transition-colors"
      >
        <div className="p-5 border-b border-white/15 flex items-center gap-3">
          {tema.sidebarShowLogo && logoUrl ? (
            <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center p-1 shrink-0 overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={logoUrl}
                alt="Logo Pondok"
                referrerPolicy="no-referrer"
                className="w-full h-full object-contain"
              />
            </div>
          ) : (
            <div
              style={{ backgroundColor: tema.primaryColor }}
              className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-lg border border-white/30 shrink-0"
            >
              AN
            </div>
          )}
          <div className="min-w-0">
            <h1 className="font-bold text-base leading-tight truncate">{tema.appShortTitle}</h1>
            <p className="text-xs text-white/75 truncate">{tema.appSubtitle}</p>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto p-4 space-y-1">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive =
              item.href === '/' ? pathname === '/' : pathname?.startsWith(item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                data-siap-nav-active={isActive ? 'true' : 'false'}
                style={isActive ? { backgroundColor: tema.primaryColor } : undefined}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'text-white shadow-sm'
                    : 'text-white/85 hover:bg-white/10 hover:text-white'
                }`}
              >
                <Icon className="w-5 h-5 text-white/75 shrink-0" />
                {item.name}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-white/15 text-xs text-white/70 text-center">
          SIAP An-Nur 1 v1.0
        </div>
      </aside>

      {/* 2. MOBILE HEADER & DRAWER MENU */}
      <header
        data-siap-mobile-header
        style={{ backgroundColor: tema.sidebarColor }}
        className="print:hidden md:hidden text-white h-12 px-4 sticky top-0 z-40 flex justify-between items-center shadow-md shrink-0"
      >
        <Link href="/" className="flex items-center gap-2 min-w-0">
          {tema.sidebarShowLogo && logoUrl ? (
            <div className="w-7 h-7 rounded-full bg-white p-0.5 flex items-center justify-center shrink-0 overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={logoUrl}
                alt="Logo Pondok"
                referrerPolicy="no-referrer"
                className="w-full h-full object-contain"
              />
            </div>
          ) : (
            <div
              style={{ backgroundColor: tema.primaryColor }}
              className="w-7 h-7 rounded-full flex items-center justify-center font-bold text-[11px] border border-white/30 shrink-0"
            >
              AN
            </div>
          )}
          <span className="font-bold text-sm truncate whitespace-nowrap">{tema.appShortTitle}</span>
        </Link>
        <button
          type="button"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          aria-label={mobileMenuOpen ? 'Tutup menu' : 'Buka semua menu'}
          className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg bg-white/15 hover:bg-white/25 text-white shrink-0"
        >
          {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </header>

      {/* Menu Drawer HP */}
      {mobileMenuOpen && (
        <div
          style={{ backgroundColor: tema.sidebarColor }}
          className="print:hidden md:hidden fixed inset-0 top-12 bottom-14 backdrop-blur-xs z-40 p-4 overflow-y-auto"
        >
          <div className="grid grid-cols-2 gap-2.5 pb-6">
            {menuItems.map((item) => {
              const Icon = item.icon;
              const isActive =
                item.href === '/' ? pathname === '/' : pathname?.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                  style={isActive ? { backgroundColor: tema.primaryColor } : undefined}
                  className={`flex flex-col items-center justify-center p-3.5 rounded-xl border transition-colors ${
                    isActive
                      ? 'border-white/50 text-white shadow-sm'
                      : 'bg-black/20 border-white/15 text-white/90 active:bg-white/20'
                  }`}
                >
                  <Icon className="w-5 h-5 mb-1.5 text-white/80" />
                  <span className="text-xs text-center font-semibold leading-tight">
                    {item.name}
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* Fixed Bottom Bar Navigasi HP (4 Slot Kustom + Menu Drawer) */}
      <nav
        data-siap-mobile-bottom-nav
        className="print:hidden md:hidden fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-md border-t border-slate-200 z-30 grid grid-cols-5 h-14 px-1 shadow-lg pb-[env(safe-area-inset-bottom)]"
      >
        {mobileNavHrefs.map((href) => {
          const catalogItem =
            QUICK_MENU_CATALOG.find((c) => c.href === href) || QUICK_MENU_CATALOG[0];
          const isActive =
            !mobileMenuOpen &&
            (catalogItem.href === '/' ? pathname === '/' : pathname?.startsWith(catalogItem.href));
          return (
            <Link
              key={catalogItem.href}
              href={catalogItem.href}
              onClick={() => setMobileMenuOpen(false)}
              style={isActive ? { color: tema.primaryColor } : undefined}
              className={`flex flex-col items-center justify-center py-1 ${
                isActive ? 'font-bold' : 'text-slate-500 font-medium'
              }`}
            >
              {renderQuickMenuIcon(catalogItem.iconKey, 'w-5 h-5')}
              <span className="text-[10px] mt-0.5 leading-none whitespace-nowrap">
                {catalogItem.shortLabel}
              </span>
            </Link>
          );
        })}
        <button
          type="button"
          onClick={() => setMobileMenuOpen((prev) => !prev)}
          style={mobileMenuOpen ? { color: tema.primaryColor } : undefined}
          className={`flex flex-col items-center justify-center py-1 ${
            mobileMenuOpen ? 'font-bold' : 'text-slate-500 font-medium'
          }`}
        >
          <Menu className="w-5 h-5" />
          <span className="text-[10px] mt-0.5 leading-none whitespace-nowrap">Menu</span>
        </button>
      </nav>

      {/* Area Konten Utama Halaman */}
      <main className="flex-1 min-w-0 w-full md:ml-64 print:ml-0 p-3 sm:p-4 md:p-8 print:p-0 pb-20 md:pb-8">
        {children}
      </main>
    </div>
  );
}