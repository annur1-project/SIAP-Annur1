'use client';

import React, { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Eye, EyeOff, Lock, LogIn, ShieldAlert, User } from 'lucide-react';
import InstallPWAButton from '@/components/InstallPWAButton';
import { useAuth } from '@/lib/auth';
import { isSupabaseConfigured } from '@/lib/supabase';

function LoginFormContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isAuthenticated, loading, authNotice, clearAuthNotice, signInWithUsername } = useAuth();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isMockEnv, setIsMockEnv] = useState(false);

  useEffect(() => {
    if (isSupabaseConfigured()) return;
    let active = true;
    fetch('/api/supabase-env', { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((json: { url?: string; anonKey?: string } | null) => {
        if (!active) return;
        const hasEnv = Boolean(json?.url?.trim() && json?.anonKey?.trim());
        setIsMockEnv(!hasEnv);
      })
      .catch(() => {
        if (active) setIsMockEnv(true);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!loading && isAuthenticated) {
      const nextUrl = searchParams.get('next') || '/';
      router.replace(nextUrl.startsWith('/') ? nextUrl : '/');
    }
  }, [isAuthenticated, loading, router, searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    clearAuthNotice();
    setSubmitting(true);
    try {
      const res = await signInWithUsername(username, password);
      if (!res.ok) {
        setErrorMsg(res.error || 'Gagal masuk. Periksa username dan kata sandi.');
        return;
      }
      if (res.mustChangePassword) {
        router.replace('/profil?wajib_ganti=1');
      } else {
        const nextUrl = searchParams.get('next') || '/';
        router.replace(nextUrl.startsWith('/') ? nextUrl : '/');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-md rounded-2xl bg-white border border-slate-200 shadow-sm p-6 sm:p-8">
        <div className="flex flex-col items-center text-center">
          <div className="w-20 h-20 rounded-2xl bg-[#065f46] overflow-hidden shadow-md border border-emerald-900/20 mb-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/icons/logo-e1.png"
              alt="Logo e-annursatu"
              className="w-full h-full object-cover"
            />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">e-annursatu</h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1 leading-relaxed">
            Sistem Informasi Administrasi &amp; Layanan Digital
            <br />
            Pondok Pesantren An-Nur 1 Bululawang
          </p>
        </div>

        {(authNotice || errorMsg) && (
          <div
            role="alert"
            className="mt-5 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-3 text-xs sm:text-sm text-rose-800 flex items-start gap-2.5"
          >
            <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <span>{errorMsg || authNotice}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label htmlFor="login-username" className="block text-xs font-semibold text-slate-700 mb-1.5">
              Username Pengurus
            </label>
            <div className="relative">
              <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                id="login-username"
                type="text"
                autoComplete="username"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="contoh: sayid.ali"
                className="w-full pl-10 pr-3.5 py-2.5 text-sm rounded-xl border border-slate-300 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#065f46] focus:border-[#065f46] min-h-[44px]"
              />
            </div>
          </div>

          <div>
            <label htmlFor="login-password" className="block text-xs font-semibold text-slate-700 mb-1.5">
              Kata Sandi
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                id="login-password"
                type={showPw ? 'text' : 'password'}
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Masukkan kata sandi"
                className="w-full pl-10 pr-11 py-2.5 text-sm rounded-xl border border-slate-300 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#065f46] focus:border-[#065f46] min-h-[44px]"
              />
              <button
                type="button"
                onClick={() => setShowPw((p) => !p)}
                aria-label={showPw ? 'Sembunyikan kata sandi' : 'Lihat kata sandi'}
                className="absolute right-2 top-1/2 -translate-y-1/2 min-h-[36px] min-w-[36px] flex items-center justify-center text-slate-400 hover:text-slate-700"
              >
                {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-[#065f46] hover:bg-emerald-900 text-white font-semibold text-sm py-3 px-4 transition disabled:opacity-60 min-h-[46px]"
          >
            <LogIn className="w-4 h-4" />
            {submitting ? 'Memeriksa Akun...' : 'Masuk ke e-annursatu'}
          </button>
        </form>

        <div className="mt-4">
          <InstallPWAButton variant="login" />
        </div>

        {isMockEnv && (
          <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
            <p className="font-semibold text-slate-800 mb-1">Mode Pratinjau Lokal (Tanpa Env Supabase):</p>
            <p className="leading-relaxed">
              Gunakan username <span className="font-mono font-semibold">sayid.ali</span> (Sekretaris),{' '}
              <span className="font-mono font-semibold">ali.nur</span> (Bendahara),{' '}
              <span className="font-mono font-semibold">fajar.wahyudi</span> (Kepala Pondok), atau{' '}
              <span className="font-mono font-semibold">pengasuh</span> dengan kata sandi awal{' '}
              <span className="font-mono font-semibold">annur1234</span>.
            </p>
          </div>
        )}

        <p className="mt-5 text-center text-xs text-slate-500">
          Akun pengurus diterbitkan secara terpusat oleh Admin Utama / Sekretaris melalui menu Data Pengurus.
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-50 flex items-center justify-center text-sm text-slate-600">
          Memuat halaman masuk...
        </div>
      }
    >
      <LoginFormContent />
    </Suspense>
  );
}
