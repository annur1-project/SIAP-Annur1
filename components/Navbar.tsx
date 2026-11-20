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
  Sparkles,
  Store,
  UserCog,
  LogOut,
  Eye,
  Image as ImageIcon,
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
import InstallPWAButton from '@/components/InstallPWAButton';
import { isPublicAppPath, useAuth, type AppModuleKey } from '@/lib/auth';

interface NavMenuItem {
  name: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  moduleKey: AppModuleKey;
  adminOnly?: boolean;
}

const menuItems: NavMenuItem[] = [
  { name: 'Beranda', href: '/', icon: Home, moduleKey: 'beranda' },
  { name: 'Pendaftaran PSB', href: '/pendaftaran', icon: UserPlus, moduleKey: 'pendaftaran' },
  { name: 'Data Santri', href: '/santri', icon: Users, moduleKey: 'santri' },
  { name: 'Data Pengurus', href: '/pengurus', icon: UserCheck, moduleKey: 'pengurus' },
  { name: 'Keuangan', href: '/keuangan', icon: Wallet, moduleKey: 'keuangan' },
  { name: 'Koperasi Pondok', href: '/koperasi', icon: Store, moduleKey: 'koperasi' },
  { name: 'Kebersihan & Piket', href: '/kebersihan', icon: Sparkles, moduleKey: 'kebersihan' },
  { name: 'Absen Jamaah', href: '/absen-jamaah', icon: CheckSquare, moduleKey: 'absen-jamaah' },
  { name: 'Perizinan', href: '/perizinan', icon: FileText, moduleKey: 'perizinan' },
  { name: 'Keamanan & Poin', href: '/keamanan', icon: ShieldAlert, moduleKey: 'keamanan' },
  { name: 'Poskestren', href: '/kesehatan', icon: HeartPulse, moduleKey: 'kesehatan' },
  { name: 'Dapur & Masak', href: '/dapur', icon: Utensils, moduleKey: 'dapur' },
  { name: 'Sarpras', href: '/sarpras', icon: Package, moduleKey: 'sarpras' },
  { name: 'Kegiatan', href: '/kegiatan', icon: Calendar, moduleKey: 'kegiatan' },
  { name: 'Kalender', href: '/kalender', icon: CalendarDays, moduleKey: 'kalender' },
  { name: 'Sie Laundry', href: '/laundry', icon: Shirt, moduleKey: 'laundry' },
  { name: 'Pusat Laporan', href: '/laporan', icon: FileSpreadsheet, moduleKey: 'laporan' },
  { name: 'Pengaturan Aplikasi', href: '/pengaturan', icon: Settings, moduleKey: 'pengaturan' },
  { name: 'Generator Ikon PWA', href: '/tools/pwa-icon', icon: ImageIcon, moduleKey: 'pwa-tools', adminOnly: true },
];

export default function Navbar({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { loading: authLoading, pengurus, jabatanLabels, canEditModule, canManageAccounts, signOut } = useAuth();

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
  const isPublicRoute = isPublicAppPath(pathname);

  const showAuthGate = authLoading || !pengurus;

  if (isPublicRoute) {
    return (
      <div className="min-h-screen bg-slate-50 text-slate-900">
        {children}
      </div>
    );
  }

  const visibleMenuItems = menuItems.filter((item) => !item.adminOnly || canManageAccounts);
  const effectiveLogo = logoUrl || '/icons/logo-e1.png';
  const brandTitle =
    tema.appShortTitle === 'e-Pondok An-Nur 1' ? 'e-annursatu' : tema.appShortTitle || 'e-annursatu';

  return (
    <div
      data-siap-shell
      data-theme-custom-accent={useCustomAccent ? 'true' : 'false'}
      className="min-h-screen bg-slate-50 flex flex-col md:flex-row transition-colors"
    >
      {showAuthGate && (
        <div
          role="status"
          aria-live="polite"
          className="fixed inset-0 z-100 bg-slate-50 flex flex-col items-center justify-center p-6 text-slate-700"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/icons/logo-e1.png"
            alt="Logo e-annursatu"
            className="w-16 h-16 rounded-2xl shadow-md mb-4"
          />
          <p className="text-sm font-semibold text-slate-800">Memverifikasi sesi e-annursatu...</p>
          <p className="text-xs text-slate-500 mt-1">Mengamankan akses multi-jabatan pesantren</p>
        </div>
      )}

      {!showAuthGate && pengurus && (
        <>
      {/* 1. DESKTOP SIDEBAR */}
      <aside
        data-siap-sidebar
        style={{ backgroundColor: tema.sidebarColor }}
        className="print:hidden hidden md:flex flex-col w-64 text-white min-h-screen fixed left-0 top-0 bottom-0 shadow-lg z-30 transition-colors"
      >
        <div className="p-4 border-b border-white/15 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#065f46] flex items-center justify-center shrink-0 overflow-hidden border border-white/25">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={effectiveLogo}
              alt="Logo e-annursatu"
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover"
            />
          </div>
          <div className="min-w-0">
            <h1 className="font-bold text-base leading-tight truncate">{brandTitle}</h1>
            <p className="text-xs text-white/75 truncate">{tema.appSubtitle || 'An-Nur 1 Bululawang'}</p>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto p-3 space-y-1">
          {visibleMenuItems.map((item) => {
            const Icon = item.icon;
            const isActive =
              item.href === '/' ? pathname === '/' : pathname?.startsWith(item.href);
            const editable = canEditModule(item.moduleKey);

            return (
              <Link
                key={item.href}
                href={item.href}
                data-siap-nav-active={isActive ? 'true' : 'false'}
                style={isActive ? { backgroundColor: tema.primaryColor } : undefined}
                className={`flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'text-white shadow-sm'
                    : 'text-white/85 hover:bg-white/10 hover:text-white'
                }`}
              >
                <span className="flex items-center gap-2.5 min-w-0">
                  <Icon className="w-4 h-4 text-white/80 shrink-0" />
                  <span className="truncate">{item.name}</span>
                </span>
                {!editable && item.moduleKey !== 'beranda' && (
                  <span title="Mode Transparansi (Hanya Lihat)" className="text-white/50 shrink-0">
                    <Eye className="w-3.5 h-3.5" />
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        <div className="p-3 border-t border-white/15 space-y-2.5">
          <InstallPWAButton variant="sidebar" />
          <div className="rounded-xl bg-black/20 p-2.5 border border-white/10">
            <p className="text-xs font-bold text-white truncate">{pengurus.nama_lengkap}</p>
            <p className="text-[11px] text-white/70 truncate mt-0.5">
              {jabatanLabels[0] || `@${pengurus.username}`}
              {jabatanLabels.length > 1 ? ` +${jabatanLabels.length - 1} rangkap` : ''}
            </p>
            <div className="mt-2 flex items-center gap-1.5">
              <Link
                href="/profil"
                className="flex-1 inline-flex items-center justify-center gap-1 rounded-lg bg-white/10 hover:bg-white/20 px-2 py-1.5 text-[11px] font-semibold text-white transition"
              >
                <UserCog className="w-3.5 h-3.5" />
                Profil Saya
              </Link>
              <button
                type="button"
                onClick={() => void signOut()}
                className="inline-flex items-center justify-center gap-1 rounded-lg bg-rose-500/20 hover:bg-rose-500/35 px-2.5 py-1.5 text-[11px] font-semibold text-rose-100 transition"
                title="Keluar dari akun"
              >
                <LogOut className="w-3.5 h-3.5" />
                Keluar
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* 2. MOBILE HEADER & DRAWER MENU */}
      <header
        data-siap-mobile-header
        style={{ backgroundColor: tema.sidebarColor }}
        className="print:hidden md:hidden text-white h-12 px-3 sticky top-0 z-40 flex justify-between items-center shadow-md shrink-0 gap-2"
      >
        <Link href="/" className="flex items-center gap-2 min-w-0">
          <div className="w-7 h-7 rounded-lg bg-[#065f46] flex items-center justify-center shrink-0 overflow-hidden border border-white/25">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={effectiveLogo}
              alt="Logo e-annursatu"
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover"
            />
          </div>
          <span className="font-bold text-sm truncate whitespace-nowrap">{brandTitle}</span>
        </Link>
        <div className="flex items-center gap-1.5 shrink-0">
          <InstallPWAButton variant="compact" />
          <Link
            href="/profil"
            aria-label="Profil Saya"
            className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-lg bg-white/15 hover:bg-white/25 text-white shrink-0"
          >
            <UserCog className="w-4 h-4" />
          </Link>
          <button
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label={mobileMenuOpen ? 'Tutup menu' : 'Buka semua menu'}
            className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-lg bg-white/15 hover:bg-white/25 text-white shrink-0"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </header>

      {/* Menu Drawer HP */}
      {mobileMenuOpen && (
        <div
          style={{ backgroundColor: tema.sidebarColor }}
          className="print:hidden md:hidden fixed inset-0 top-12 bottom-14 backdrop-blur-xs z-40 p-4 overflow-y-auto space-y-4"
        >
          <div className="rounded-xl bg-black/25 border border-white/15 p-3 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-bold text-white truncate">{pengurus.nama_lengkap}</p>
              <p className="text-xs text-white/75 truncate">
                {jabatanLabels.join(' · ') || `@${pengurus.username}`}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setMobileMenuOpen(false);
                void signOut();
              }}
              className="inline-flex items-center gap-1.5 rounded-lg bg-rose-500/25 px-3 py-2 text-xs font-semibold text-white shrink-0 min-h-[40px]"
            >
              <LogOut className="w-4 h-4" />
              Keluar
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2.5 pb-6">
            {visibleMenuItems.map((item) => {
              const Icon = item.icon;
              const isActive =
                item.href === '/' ? pathname === '/' : pathname?.startsWith(item.href);
              const editable = canEditModule(item.moduleKey);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                  style={isActive ? { backgroundColor: tema.primaryColor } : undefined}
                  className={`relative flex flex-col items-center justify-center p-3.5 rounded-xl border transition-colors min-h-[76px] ${
                    isActive
                      ? 'border-white/50 text-white shadow-sm'
                      : 'bg-black/20 border-white/15 text-white/90 active:bg-white/20'
                  }`}
                >
                  {!editable && item.moduleKey !== 'beranda' && (
                    <Eye className="w-3.5 h-3.5 text-white/50 absolute top-2 right-2" />
                  )}
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
        </>
      )}

      {/* Area Konten Utama Halaman */}
      <main
        className={
          showAuthGate
            ? 'hidden'
            : 'flex-1 min-w-0 w-full md:ml-64 print:ml-0 p-3 sm:p-4 md:p-8 print:p-0 pb-20 md:pb-8'
        }
      >
        {children}
      </main>
    </div>
  );
}