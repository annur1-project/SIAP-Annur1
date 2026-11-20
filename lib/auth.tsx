'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { supabase, usernameToAuthEmail, normalizeUsername } from '@/lib/supabase';
import { Eye, Lock, ShieldCheck } from 'lucide-react';

export type AppModuleKey =
  | 'beranda'
  | 'pendaftaran'
  | 'santri'
  | 'pengurus'
  | 'keuangan'
  | 'bisyaroh'
  | 'koperasi'
  | 'kebersihan'
  | 'absen-jamaah'
  | 'perizinan'
  | 'keamanan'
  | 'kesehatan'
  | 'dapur'
  | 'sarpras'
  | 'kegiatan'
  | 'kalender'
  | 'laundry'
  | 'laporan'
  | 'pengaturan'
  | 'pwa-tools';

export interface PengurusJabatanAuth {
  id?: string;
  divisi: string;
  nama_jabatan: string;
  is_utama?: boolean;
  urutan_struktur?: number;
}

export interface PengurusAuthProfile {
  id: string;
  nama_lengkap: string;
  username: string;
  auth_user_id: string | null;
  status: 'aktif' | 'nonaktif' | 'boyong';
  no_wa?: string | null;
  foto_url?: string | null;
  masa_khidmat?: string;
  must_change_password: boolean;
  jabatan_list: PengurusJabatanAuth[];
}

export interface AuthContextValue {
  loading: boolean;
  isAuthenticated: boolean;
  userEmail: string | null;
  pengurus: PengurusAuthProfile | null;
  jabatanLabels: string[];
  editableModules: Set<AppModuleKey>;
  isPimpinanInti: boolean;
  isBendahara: boolean;
  isSekretaris: boolean;
  isOperatorEmis: boolean;
  canViewBisyaroh: boolean;
  canViewSensitiveSantri: boolean;
  canManageAccounts: boolean;
  mustChangePassword: boolean;
  authNotice: string | null;
  clearAuthNotice: () => void;
  canEditModule: (mod: AppModuleKey) => boolean;
  refreshAuth: () => Promise<void>;
  signInWithUsername: (username: string, password: string) => Promise<{ ok: boolean; error?: string; mustChangePassword?: boolean }>;
  signOut: () => Promise<void>;
  changeOwnPassword: (newPassword: string) => Promise<{ ok: boolean; error?: string }>;
}

const ALL_MODULES: AppModuleKey[] = [
  'beranda',
  'pendaftaran',
  'santri',
  'pengurus',
  'keuangan',
  'bisyaroh',
  'koperasi',
  'kebersihan',
  'absen-jamaah',
  'perizinan',
  'keamanan',
  'kesehatan',
  'dapur',
  'sarpras',
  'kegiatan',
  'kalender',
  'laundry',
  'laporan',
  'pengaturan',
  'pwa-tools',
];

const PUBLIC_PATHS = ['/login', '/daftar', '/cek-daftar'];

export function isPublicAppPath(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export function maskIdentityNumber(val?: string | null): string {
  const clean = (val || '').trim();
  if (!clean) return '-';
  if (clean.length <= 6) return '•'.repeat(clean.length);
  const middleLen = Math.max(4, clean.length - 8);
  return `${clean.slice(0, 4)}${'•'.repeat(middleLen)}${clean.slice(-4)}`;
}

export function derivePermissionsFromJabatan(jabatanList: PengurusJabatanAuth[]) {
  const editable = new Set<AppModuleKey>(['beranda']);
  let isPimpinanInti = false;
  let isBendahara = false;
  let isSekretaris = false;
  let isOperatorEmis = false;

  for (const j of jabatanList) {
    const div = (j.divisi || '').toLowerCase();
    const role = (j.nama_jabatan || '').toLowerCase();
    const combined = `${div} ${role}`;

    if (
      combined.includes('pengasuh') ||
      combined.includes('dzurriyah') ||
      combined.includes('direktur pendidikan') ||
      combined.includes('kepala pondok')
    ) {
      isPimpinanInti = true;
      ALL_MODULES.forEach((m) => editable.add(m));
    }

    if (combined.includes('sekretaris')) {
      isSekretaris = true;
      [
        'pendaftaran',
        'santri',
        'pengurus',
        'perizinan',
        'kegiatan',
        'kalender',
        'absen-jamaah',
        'laporan',
        'pengaturan',
        'pwa-tools',
      ].forEach((m) => editable.add(m as AppModuleKey));
    }

    if (combined.includes('bendahara')) {
      isBendahara = true;
      ['keuangan', 'bisyaroh', 'koperasi', 'dapur', 'laporan'].forEach((m) =>
        editable.add(m as AppModuleKey)
      );
    }

    if (combined.includes('operator emis') || combined.includes('emis')) {
      isOperatorEmis = true;
      editable.add('santri');
      editable.add('pendaftaran');
    }

    if (combined.includes('kegiatan')) {
      editable.add('kegiatan');
      editable.add('kalender');
      editable.add('absen-jamaah');
    }

    if (combined.includes('keamanan')) {
      editable.add('keamanan');
      editable.add('perizinan');
      editable.add('absen-jamaah');
    }

    if (combined.includes('kesehatan')) {
      editable.add('kesehatan');
    }

    if (combined.includes('kebersihan')) {
      editable.add('kebersihan');
    }

    if (combined.includes('sarpras')) {
      editable.add('sarpras');
    }

    if (combined.includes('dapur')) {
      editable.add('dapur');
    }

    if (combined.includes('koprasi') || combined.includes('koperasi')) {
      editable.add('koperasi');
    }

    if (combined.includes('laundry')) {
      editable.add('laundry');
    }

    if (combined.includes('guru bantu')) {
      editable.add('kegiatan');
      editable.add('absen-jamaah');
      editable.add('kalender');
    }

    if (combined.includes('musyrif')) {
      editable.add('absen-jamaah');
      editable.add('perizinan');
      editable.add('kebersihan');
    }
  }

  const canViewBisyaroh = isPimpinanInti || isBendahara;
  const canViewSensitiveSantri = isPimpinanInti || isSekretaris || isOperatorEmis;
  const canManageAccounts = isPimpinanInti || isSekretaris;

  return {
    editable,
    isPimpinanInti,
    isBendahara,
    isSekretaris,
    isOperatorEmis,
    canViewBisyaroh,
    canViewSensitiveSantri,
    canManageAccounts,
  };
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [pengurus, setPengurus] = useState<PengurusAuthProfile | null>(null);
  const [authNotice, setAuthNotice] = useState<string | null>(null);

  const loadCurrentProfile = useCallback(async () => {
    setLoading(true);
    try {
      const { data: sessionRes } = await supabase.auth.getSession();
      const sessionUser = sessionRes?.session?.user ?? null;

      if (!sessionUser) {
        setUserEmail(null);
        setPengurus(null);
        return;
      }

      const email = sessionUser.email || '';
      const unameFromEmail = email.includes('@') ? email.split('@')[0].toLowerCase() : '';

      // Cari profil pengurus berdasarkan auth_user_id lalu fallback username
      const { data: pByAuth } = await supabase
        .from('pengurus')
        .select('id, nama_lengkap, username, auth_user_id, status, no_wa, foto_url, masa_khidmat, must_change_password')
        .eq('auth_user_id', sessionUser.id)
        .maybeSingle();

      let person = pByAuth as Record<string, unknown> | null;
      if (!person && unameFromEmail) {
        const { data: pByUser } = await supabase
          .from('pengurus')
          .select('id, nama_lengkap, username, auth_user_id, status, no_wa, foto_url, masa_khidmat, must_change_password')
          .ilike('username', unameFromEmail)
          .maybeSingle();
        person = pByUser as Record<string, unknown> | null;
      }

      if (!person) {
        setUserEmail(null);
        setPengurus(null);
        setAuthNotice('Akun tidak terhubung dengan data pengurus aktif. Hubungi Admin/Sekretaris.');
        await supabase.auth.signOut();
        return;
      }

      const statusStr = String(person.status || 'aktif').toLowerCase();
      if (statusStr !== 'aktif') {
        setUserEmail(null);
        setPengurus(null);
        setAuthNotice(
          `Akses ditolak: status pengurus Anda tercatat "${statusStr.toUpperCase()}". Hubungi Admin/Sekretaris.`
        );
        await supabase.auth.signOut();
        return;
      }

      const { data: jabatanRows } = await supabase
        .from('pengurus_jabatan')
        .select('id, divisi, nama_jabatan, is_utama, urutan_struktur')
        .eq('pengurus_id', String(person.id));

      const jabatanList: PengurusJabatanAuth[] = Array.isArray(jabatanRows)
        ? (jabatanRows as PengurusJabatanAuth[])
        : [];

      setUserEmail(email);
      setPengurus({
        id: String(person.id),
        nama_lengkap: String(person.nama_lengkap || ''),
        username: String(person.username || unameFromEmail),
        auth_user_id: person.auth_user_id ? String(person.auth_user_id) : null,
        status: statusStr as 'aktif' | 'nonaktif' | 'boyong',
        no_wa: person.no_wa ? String(person.no_wa) : null,
        foto_url: person.foto_url ? String(person.foto_url) : null,
        masa_khidmat: person.masa_khidmat ? String(person.masa_khidmat) : '2026/2027',
        must_change_password: Boolean(person.must_change_password),
        jabatan_list: jabatanList,
      });
    } catch {
      setUserEmail(null);
      setPengurus(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadCurrentProfile();
    }, 0);
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED') {
        void loadCurrentProfile();
      }
    });
    return () => {
      clearTimeout(timer);
      data?.subscription?.unsubscribe();
    };
  }, [loadCurrentProfile]);

  // Wajib login untuk halaman internal; jika must_change_password aktif, arahkan ke /profil
  useEffect(() => {
    if (loading) return;
    if (isPublicAppPath(pathname)) return;

    if (!pengurus) {
      const nextParam = pathname && pathname !== '/' ? `?next=${encodeURIComponent(pathname)}` : '';
      router.replace(`/login${nextParam}`);
      return;
    }

    if (pengurus.must_change_password && pathname !== '/profil') {
      router.replace('/profil?wajib_ganti=1');
    }
  }, [loading, pengurus, pathname, router]);

  const perms = useMemo(
    () => derivePermissionsFromJabatan(pengurus?.jabatan_list || []),
    [pengurus]
  );

  const jabatanLabels = useMemo(() => {
    if (!pengurus?.jabatan_list?.length) return [];
    return pengurus.jabatan_list.map((j) =>
      j.divisi && j.divisi.toLowerCase() !== (j.nama_jabatan || '').toLowerCase()
        ? `${j.nama_jabatan} (${j.divisi})`
        : j.nama_jabatan || j.divisi
    );
  }, [pengurus]);

  const signInWithUsername = useCallback(
    async (username: string, password: string) => {
      setAuthNotice(null);
      const cleanUser = normalizeUsername(username);
      if (!cleanUser || !password) {
        return { ok: false, error: 'Masukkan username dan kata sandi.' };
      }
      const email = usernameToAuthEmail(cleanUser);
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error || !data?.user) {
        return {
          ok: false,
          error: error?.message || 'Username atau kata sandi tidak valid.',
        };
      }

      // Validasi status aktif pengurus
      const { data: pRow } = await supabase
        .from('pengurus')
        .select('id, status, must_change_password')
        .eq('auth_user_id', data.user.id)
        .maybeSingle();

      let person = pRow as { id?: string; status?: string; must_change_password?: boolean } | null;
      if (!person) {
        const { data: pByName } = await supabase
          .from('pengurus')
          .select('id, status, must_change_password')
          .ilike('username', cleanUser)
          .maybeSingle();
        person = pByName as { id?: string; status?: string; must_change_password?: boolean } | null;
      }

      if (!person || String(person.status || 'aktif').toLowerCase() !== 'aktif') {
        await supabase.auth.signOut();
        return {
          ok: false,
          error: 'Akun dinonaktifkan atau pengurus berstatus Non-Aktif / Boyong.',
        };
      }

      await supabase
        .from('pengurus')
        .update({ last_login_at: new Date().toISOString() })
        .eq('id', String(person.id));

      await loadCurrentProfile();
      return {
        ok: true,
        mustChangePassword: Boolean(person.must_change_password),
      };
    },
    [loadCurrentProfile]
  );

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setUserEmail(null);
    setPengurus(null);
    router.replace('/login');
  }, [router]);

  const changeOwnPassword = useCallback(
    async (newPassword: string) => {
      if (!pengurus) return { ok: false, error: 'Sesi pengguna tidak ditemukan.' };
      if (newPassword.length < 6) {
        return { ok: false, error: 'Kata sandi baru minimal 6 karakter.' };
      }
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) {
        return { ok: false, error: error.message };
      }
      await supabase
        .from('pengurus')
        .update({ must_change_password: false })
        .eq('id', pengurus.id);
      await loadCurrentProfile();
      return { ok: true };
    },
    [loadCurrentProfile, pengurus]
  );

  const canEditModule = useCallback(
    (mod: AppModuleKey) => {
      if (!pengurus) return false;
      return perms.editable.has(mod);
    },
    [pengurus, perms]
  );

  const value: AuthContextValue = {
    loading,
    isAuthenticated: Boolean(pengurus),
    userEmail,
    pengurus,
    jabatanLabels,
    editableModules: perms.editable,
    isPimpinanInti: perms.isPimpinanInti,
    isBendahara: perms.isBendahara,
    isSekretaris: perms.isSekretaris,
    isOperatorEmis: perms.isOperatorEmis,
    canViewBisyaroh: perms.canViewBisyaroh,
    canViewSensitiveSantri: perms.canViewSensitiveSantri,
    canManageAccounts: perms.canManageAccounts,
    mustChangePassword: Boolean(pengurus?.must_change_password),
    authNotice,
    clearAuthNotice: () => setAuthNotice(null),
    canEditModule,
    refreshAuth: loadCurrentProfile,
    signInWithUsername,
    signOut,
    changeOwnPassword,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth harus dipanggil di dalam AuthProvider.');
  }
  return ctx;
}

export function TransparencyBanner({
  moduleLabel,
  isReadOnly,
  extraNote,
}: {
  moduleLabel: string;
  isReadOnly: boolean;
  extraNote?: string;
}) {
  if (!isReadOnly) return null;

  return (
    <div
      role="status"
      className="print:hidden mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-300/80 bg-amber-50/90 px-4 py-3 text-amber-950 dark:border-amber-700/60 dark:bg-amber-950/30 dark:text-amber-100"
    >
      <div className="flex items-start gap-2.5 min-w-0">
        <Eye className="w-5 h-5 text-amber-700 dark:text-amber-300 shrink-0 mt-0.5" />
        <div className="min-w-0">
          <p className="text-sm font-semibold flex items-center gap-1.5">
            <Lock className="w-3.5 h-3.5 shrink-0" />
            Mode Transparansi (Hanya Lihat) — {moduleLabel}
          </p>
          <p className="text-xs text-amber-800/90 dark:text-amber-200/80 mt-0.5">
            Anda melihat data lintas divisi sebagai bentuk transparansi internal. Seluruh tombol tambah, ubah, hapus, dan verifikasi dikunci sesuai jabatan Anda.
            {extraNote ? ` ${extraNote}` : ''}
          </p>
        </div>
      </div>
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-800 dark:text-amber-200 whitespace-nowrap shrink-0">
        <ShieldCheck className="w-4 h-4" />
        Akses Terjaga
      </span>
    </div>
  );
}
