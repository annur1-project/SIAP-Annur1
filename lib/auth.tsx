'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { supabase, usernameToAuthEmail, normalizeUsername } from '@/lib/supabase';
import { getDynamicTahunAjaranAktif, isMissingColumnError } from '@/lib/pengaturan';
import { Eye, Lock } from 'lucide-react';

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

export interface ModulePermissionGroup {
  key: string;
  label: string;
  modules: AppModuleKey[];
}

export const MODULE_PERMISSION_GROUPS: ModulePermissionGroup[] = [
  { key: 'santri', label: 'Data Santri & EMIS', modules: ['santri'] },
  { key: 'pengurus', label: 'Data Pengurus', modules: ['pengurus'] },
  { key: 'keuangan', label: 'Keuangan & Syahriyah', modules: ['keuangan'] },
  { key: 'bisyaroh', label: 'Akses Lihat & Kelola Bisyaroh', modules: ['bisyaroh'] },
  { key: 'pendaftaran', label: 'Pendaftaran Santri Baru (PSB)', modules: ['pendaftaran'] },
  { key: 'absen-jamaah', label: 'Absen Sholat Jamaah', modules: ['absen-jamaah'] },
  { key: 'perizinan', label: 'Perizinan Pulang', modules: ['perizinan'] },
  { key: 'keamanan', label: 'Keamanan & Poin Pelanggaran', modules: ['keamanan'] },
  { key: 'kesehatan', label: 'Poskestren & Kesehatan', modules: ['kesehatan'] },
  { key: 'kebersihan', label: 'Kebersihan & Piket', modules: ['kebersihan'] },
  { key: 'dapur', label: 'Dapur & Konsumsi', modules: ['dapur'] },
  { key: 'sarpras', label: 'Sarpras & Inventaris', modules: ['sarpras'] },
  { key: 'koperasi_laundry', label: 'Koperasi & Laundry', modules: ['koperasi', 'laundry'] },
  { key: 'kegiatan_kalender', label: 'Kegiatan & Kalender', modules: ['kegiatan', 'kalender'] },
  { key: 'laporan', label: 'Pusat Laporan', modules: ['laporan'] },
];

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
  role: string;
  allowed_modules: string[] | null;
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
  isSuperAdmin: boolean;
  isPimpinanInti: boolean;
  isBendahara: boolean;
  isSekretaris: boolean;
  isOperatorEmis: boolean;
  canViewBisyaroh: boolean;
  canViewSensitiveSantri: boolean;
  canManageAccounts: boolean;
  canManageSettings: boolean;
  mustChangePassword: boolean;
  authNotice: string | null;
  clearAuthNotice: () => void;
  canEditModule: (mod: AppModuleKey) => boolean;
  refreshAuth: () => Promise<void>;
  signInWithUsername: (
    username: string,
    password: string
  ) => Promise<{ ok: boolean; error?: string; mustChangePassword?: boolean }>;
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

const ALL_MODULE_SET = new Set<string>(ALL_MODULES);
const PUBLIC_PATHS = ['/login', '/daftar', '/cek-daftar'];
const AUTH_SESSION_CACHE_KEY = 'eannursatu_auth_profile_cache_v1';

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

export function isSuperAdminAccount(input: {
  role?: string | null;
  username?: string | null;
  email?: string | null;
}): boolean {
  const roleStr = String(input.role || '').trim().toLowerCase();
  const uname = normalizeUsername(String(input.username || ''));
  const emailUname = String(input.email || '').includes('@')
    ? normalizeUsername(String(input.email || '').split('@')[0])
    : '';
  return roleStr === 'super_admin' || uname === 'admin.utama' || emailUname === 'admin.utama';
}

export function normalizeAllowedModulesList(raw: unknown): string[] | null {
  if (raw === null || raw === undefined) return null;
  let arr: unknown[] = [];
  if (Array.isArray(raw)) {
    arr = raw;
  } else if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) arr = parsed;
      else return null;
    } catch {
      return null;
    }
  } else {
    return null;
  }

  const normalized = new Set<string>();
  for (const item of arr) {
    const val = String(item || '').trim().toLowerCase();
    if (!val) continue;
    const group = MODULE_PERMISSION_GROUPS.find((g) => g.key === val);
    if (group) {
      group.modules.forEach((m) => normalized.add(m));
    } else if (ALL_MODULE_SET.has(val)) {
      normalized.add(val);
    }
  }
  return Array.from(normalized);
}

export function derivePermissionsFromJabatan(
  jabatanList: PengurusJabatanAuth[],
  options?: {
    role?: string | null;
    username?: string | null;
    email?: string | null;
    allowedModules?: string[] | null;
  }
) {
  const superAdmin = isSuperAdminAccount({
    role: options?.role,
    username: options?.username,
    email: options?.email,
  });

  if (superAdmin) {
    return {
      editable: new Set<AppModuleKey>(ALL_MODULES),
      isSuperAdmin: true,
      isPimpinanInti: true,
      isBendahara: true,
      isSekretaris: true,
      isOperatorEmis: true,
      canViewBisyaroh: true,
      canViewSensitiveSantri: true,
      canManageAccounts: true,
      canManageSettings: true,
    };
  }

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
      ALL_MODULES.filter((m) => m !== 'pengaturan' && m !== 'pwa-tools').forEach((m) =>
        editable.add(m)
      );
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

  // Jika Admin Utama sudah mengatur checkbox hak akses modul secara eksplisit (array non-null),
  // gunakan daftar centangan tersebut sebagai sumber otoritas modul.
  if (Array.isArray(options?.allowedModules)) {
    const customEditable = new Set<AppModuleKey>(['beranda']);
    for (const mod of options.allowedModules) {
      if (ALL_MODULE_SET.has(mod) && mod !== 'pengaturan' && mod !== 'pwa-tools') {
        customEditable.add(mod as AppModuleKey);
      }
    }
    const canViewBisyaroh = customEditable.has('bisyaroh');
    const canViewSensitiveSantri =
      isPimpinanInti || isSekretaris || isOperatorEmis || customEditable.has('santri');
    const canManageAccounts = isPimpinanInti || isSekretaris || customEditable.has('pengurus');

    return {
      editable: customEditable,
      isSuperAdmin: false,
      isPimpinanInti,
      isBendahara,
      isSekretaris,
      isOperatorEmis,
      canViewBisyaroh,
      canViewSensitiveSantri,
      canManageAccounts,
      canManageSettings: false,
    };
  }

  const canViewBisyaroh = isPimpinanInti || isBendahara;
  const canViewSensitiveSantri = isPimpinanInti || isSekretaris || isOperatorEmis;
  const canManageAccounts = isPimpinanInti || isSekretaris;

  return {
    editable,
    isSuperAdmin: false,
    isPimpinanInti,
    isBendahara,
    isSekretaris,
    isOperatorEmis,
    canViewBisyaroh,
    canViewSensitiveSantri,
    canManageAccounts,
    canManageSettings: false,
  };
}

function readAuthCache(): { userEmail: string; pengurus: PengurusAuthProfile } | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(AUTH_SESSION_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { userEmail?: string; pengurus?: PengurusAuthProfile };
    if (parsed?.pengurus?.id && parsed?.userEmail) {
      return { userEmail: parsed.userEmail, pengurus: parsed.pengurus };
    }
    return null;
  } catch {
    return null;
  }
}

function writeAuthCache(data: { userEmail: string; pengurus: PengurusAuthProfile } | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (!data) {
      window.sessionStorage.removeItem(AUTH_SESSION_CACHE_KEY);
    } else {
      window.sessionStorage.setItem(AUTH_SESSION_CACHE_KEY, JSON.stringify(data));
    }
  } catch {
    // ignore storage errors
  }
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [pengurus, setPengurus] = useState<PengurusAuthProfile | null>(null);
  const [authNotice, setAuthNotice] = useState<string | null>(null);

  const pengurusRef = useRef<PengurusAuthProfile | null>(null);
  const lastSilentRefreshRef = useRef<number>(0);

  useEffect(() => {
    pengurusRef.current = pengurus;
  }, [pengurus]);

  const loadCurrentProfile = useCallback(async (opts?: { silent?: boolean }) => {
    const isSilent = Boolean(opts?.silent) && Boolean(pengurusRef.current);
    if (!isSilent) {
      setLoading(true);
    }

    try {
      const { data: sessionRes } = await supabase.auth.getSession();
      const sessionUser = sessionRes?.session?.user ?? null;

      if (!sessionUser) {
        setUserEmail(null);
        setPengurus(null);
        writeAuthCache(null);
        return;
      }

      const email = sessionUser.email || '';
      const unameFromEmail = email.includes('@') ? email.split('@')[0].toLowerCase() : '';

      const fullCols =
        'id, nama_lengkap, username, role, allowed_modules, auth_user_id, status, no_wa, foto_url, masa_khidmat, must_change_password';
      const fallbackCols =
        'id, nama_lengkap, username, auth_user_id, status, no_wa, foto_url, masa_khidmat, must_change_password';

      const queryPerson = async (mode: 'auth' | 'uname') => {
        const res =
          mode === 'auth'
            ? await supabase.from('pengurus').select(fullCols).eq('auth_user_id', sessionUser.id).maybeSingle()
            : await supabase.from('pengurus').select(fullCols).ilike('username', unameFromEmail).maybeSingle();
        if (res.error && isMissingColumnError(res.error)) {
          return mode === 'auth'
            ? await supabase.from('pengurus').select(fallbackCols).eq('auth_user_id', sessionUser.id).maybeSingle()
            : await supabase.from('pengurus').select(fallbackCols).ilike('username', unameFromEmail).maybeSingle();
        }
        return res;
      };

      const pByAuthRes = await queryPerson('auth');
      let person = pByAuthRes.data as Record<string, unknown> | null;
      if (!person && unameFromEmail) {
        const pByUserRes = await queryPerson('uname');
        person = pByUserRes.data as Record<string, unknown> | null;
      }

      if (!person) {
        if (isSilent && pengurusRef.current) return;
        setUserEmail(null);
        setPengurus(null);
        writeAuthCache(null);
        setAuthNotice('Akun tidak terhubung dengan data pengurus aktif. Hubungi Admin/Sekretaris.');
        await supabase.auth.signOut();
        return;
      }

      const statusStr = String(person.status || 'aktif').toLowerCase();
      if (statusStr !== 'aktif') {
        setUserEmail(null);
        setPengurus(null);
        writeAuthCache(null);
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

      const resolvedUsername = String(person.username || unameFromEmail);
      const resolvedRole = isSuperAdminAccount({
        role: person.role ? String(person.role) : null,
        username: resolvedUsername,
        email,
      })
        ? 'super_admin'
        : String(person.role || 'pengurus');

      const profileObj: PengurusAuthProfile = {
        id: String(person.id),
        nama_lengkap: String(person.nama_lengkap || ''),
        username: resolvedUsername,
        role: resolvedRole,
        allowed_modules: normalizeAllowedModulesList(person.allowed_modules),
        auth_user_id: person.auth_user_id ? String(person.auth_user_id) : null,
        status: statusStr as 'aktif' | 'nonaktif' | 'boyong',
        no_wa: person.no_wa ? String(person.no_wa) : null,
        foto_url: person.foto_url ? String(person.foto_url) : null,
        masa_khidmat: person.masa_khidmat ? String(person.masa_khidmat) : getDynamicTahunAjaranAktif(),
        must_change_password: Boolean(person.must_change_password),
        jabatan_list: jabatanList,
      };

      setUserEmail(email);
      setPengurus(profileObj);
      writeAuthCache({ userEmail: email, pengurus: profileObj });
    } catch {
      if (isSilent && pengurusRef.current) {
        return;
      }
      setUserEmail(null);
      setPengurus(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const cached = readAuthCache();
    const timer = setTimeout(() => {
      if (cached) {
        pengurusRef.current = cached.pengurus;
        setUserEmail(cached.userEmail);
        setPengurus(cached.pengurus);
        setLoading(false);
      }
      void loadCurrentProfile({ silent: Boolean(cached) });
    }, 0);

    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        setUserEmail(null);
        setPengurus(null);
        writeAuthCache(null);
        setLoading(false);
        return;
      }
      if (event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
        void loadCurrentProfile({ silent: true });
        return;
      }
      if (event === 'SIGNED_IN') {
        void loadCurrentProfile({ silent: Boolean(pengurusRef.current) });
      }
    });

    const handleResumeRefresh = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      if (!pengurusRef.current) return;
      const now = Date.now();
      if (now - lastSilentRefreshRef.current < 15000) return;
      lastSilentRefreshRef.current = now;
      void loadCurrentProfile({ silent: true });
    };

    window.addEventListener('visibilitychange', handleResumeRefresh);
    window.addEventListener('focus', handleResumeRefresh);

    return () => {
      clearTimeout(timer);
      data?.subscription?.unsubscribe();
      window.removeEventListener('visibilitychange', handleResumeRefresh);
      window.removeEventListener('focus', handleResumeRefresh);
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
    () =>
      derivePermissionsFromJabatan(pengurus?.jabatan_list || [], {
        role: pengurus?.role,
        username: pengurus?.username,
        email: userEmail,
        allowedModules: pengurus?.allowed_modules ?? null,
      }),
    [pengurus, userEmail]
  );

  const jabatanLabels = useMemo(() => {
    if (perms.isSuperAdmin && (!pengurus?.jabatan_list || pengurus.jabatan_list.length === 0)) {
      return ['Admin Utama Pondok (Super Admin)'];
    }
    if (!pengurus?.jabatan_list?.length) return [];
    return pengurus.jabatan_list.map((j) =>
      j.divisi && j.divisi.toLowerCase() !== (j.nama_jabatan || '').toLowerCase()
        ? `${j.nama_jabatan} (${j.divisi})`
        : j.nama_jabatan || j.divisi
    );
  }, [pengurus, perms.isSuperAdmin]);

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
    writeAuthCache(null);
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
      await loadCurrentProfile({ silent: true });
      return { ok: true };
    },
    [loadCurrentProfile, pengurus]
  );

  const canEditModule = useCallback(
    (mod: AppModuleKey) => {
      if (!pengurus) return false;
      if (perms.isSuperAdmin) return true;
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
    isSuperAdmin: perms.isSuperAdmin,
    isPimpinanInti: perms.isPimpinanInti,
    isBendahara: perms.isBendahara,
    isSekretaris: perms.isSekretaris,
    isOperatorEmis: perms.isOperatorEmis,
    canViewBisyaroh: perms.canViewBisyaroh,
    canViewSensitiveSantri: perms.canViewSensitiveSantri,
    canManageAccounts: perms.canManageAccounts,
    canManageSettings: perms.canManageSettings,
    mustChangePassword: Boolean(pengurus?.must_change_password),
    authNotice,
    clearAuthNotice: () => setAuthNotice(null),
    canEditModule,
    refreshAuth: () => loadCurrentProfile({ silent: Boolean(pengurusRef.current) }),
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
      className="print:hidden mb-4 flex flex-wrap items-center justify-between gap-2.5 rounded-xl border border-amber-300/80 bg-amber-50/90 px-4 py-2.5 text-amber-950 dark:border-amber-700/60 dark:bg-amber-950/30 dark:text-amber-100"
    >
      <div className="flex items-start gap-2.5 min-w-0">
        <Eye className="w-4 h-4 text-amber-700 dark:text-amber-300 shrink-0 mt-0.5" />
        <div className="min-w-0">
          <p className="text-xs sm:text-sm font-semibold flex items-center gap-1.5">
            <Lock className="w-3.5 h-3.5 shrink-0" />
            View Only &mdash; {moduleLabel}
          </p>
          <p className="text-xs text-amber-800/90 dark:text-amber-200/80 mt-0.5">
            Akses hanya lihat. Tombol tambah, ubah, hapus, dan verifikasi dikunci sesuai hak akses Anda.
            {extraNote ? ` ${extraNote}` : ''}
          </p>
        </div>
      </div>
      <span className="inline-flex items-center gap-1 rounded-lg bg-amber-100 dark:bg-amber-900/50 border border-amber-300/70 px-2.5 py-1 text-[11px] font-bold text-amber-900 dark:text-amber-100 whitespace-nowrap shrink-0">
        <Eye className="w-3.5 h-3.5" />
        View Only
      </span>
    </div>
  );
}
