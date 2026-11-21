'use client';

import React, { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  AlertTriangle,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  ShieldCheck,
  UserCheck,
} from 'lucide-react';
import { useAuth, type AppModuleKey } from '@/lib/auth';

const MODULE_LABELS: Record<AppModuleKey, string> = {
  beranda: 'Beranda Utama',
  pendaftaran: 'Pendaftaran PSB',
  santri: 'Data Santri & EMIS',
  pengurus: 'Data Pengurus & Akun',
  keuangan: 'Keuangan & Loket',
  bisyaroh: 'Pencairan & Nominal Bisyaroh',
  koperasi: 'Koperasi Pondok',
  kebersihan: 'Kebersihan & Jadwal Piket',
  'absen-jamaah': 'Absen Sholat Jamaah',
  perizinan: 'Perizinan Pulang',
  keamanan: 'Keamanan & Poin',
  kesehatan: 'Poskestren / Kesehatan',
  dapur: 'Dapur & Pembukuan Masak',
  sarpras: 'Sarpras & Inventaris',
  kegiatan: 'Kegiatan Pondok',
  kalender: 'Kalender & Agenda',
  laundry: 'Sie Laundry',
  laporan: 'Pusat Laporan',
  pengaturan: 'Pengaturan Aplikasi',
  'pwa-tools': 'Generator Ikon PWA',
};

function ProfilContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const {
    pengurus,
    jabatanLabels,
    editableModules,
    canViewBisyaroh,
    canViewSensitiveSantri,
    mustChangePassword,
    changeOwnPassword,
  } = useAuth();

  const isForced = mustChangePassword || searchParams.get('wajib_ganti') === '1';

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [saving, setSaving] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  if (!pengurus) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMsg(null);

    if (newPassword.length < 6) {
      setStatusMsg({ type: 'error', text: 'Kata sandi baru minimal 6 karakter.' });
      return;
    }
    if (newPassword !== confirmPassword) {
      setStatusMsg({ type: 'error', text: 'Konfirmasi kata sandi tidak cocok.' });
      return;
    }

    setSaving(true);
    try {
      const res = await changeOwnPassword(newPassword);
      if (!res.ok) {
        setStatusMsg({ type: 'error', text: res.error || 'Gagal memperbarui kata sandi.' });
        return;
      }
      setNewPassword('');
      setConfirmPassword('');
      setStatusMsg({
        type: 'success',
        text: 'Kata sandi pribadi berhasil disimpan. Hak akses penuh sesuai jabatan Anda sudah aktif.',
      });
      if (isForced) {
        setTimeout(() => router.replace('/'), 1000);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-slate-900">Profil Saya &amp; Keamanan Akun</h1>
        <p className="text-xs sm:text-sm text-slate-500 mt-1">
          Kelola kata sandi pribadi dan tinjau daftar hak kelola modul berdasarkan jabatan aktif Anda.
        </p>
      </div>

      {isForced && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 flex items-start gap-3 text-amber-950">
          <AlertTriangle className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-bold">Wajib Ganti Kata Sandi Sementara</p>
            <p className="text-xs mt-1 leading-relaxed">
              Anda masuk menggunakan kata sandi sementara dari Admin/Sekretaris. Silakan buat kata sandi pribadi baru di bawah ini sebelum melanjutkan ke halaman modul lainnya.
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* Identitas & Jabatan Aktif */}
        <section className="rounded-2xl bg-white border border-slate-200 p-5 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-emerald-900/10 text-emerald-800 flex items-center justify-center shrink-0">
              <UserCheck className="w-6 h-6" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-bold text-slate-900 truncate">{pengurus.nama_lengkap}</h2>
              <p className="text-xs text-slate-500 font-mono">
                @{pengurus.username} · Masa Khidmat {pengurus.masa_khidmat || '-'}
              </p>
            </div>
          </div>

          <div className="border-t border-slate-100 pt-4">
            <h3 className="text-xs font-semibold text-slate-500 mb-2">Jabatan Aktif Saat Ini</h3>
            <ul className="space-y-1.5 text-sm text-slate-800">
              {jabatanLabels.length > 0 ? (
                jabatanLabels.map((lbl, idx) => (
                  <li key={idx} className="flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-emerald-700 shrink-0" />
                    <span>{lbl}</span>
                  </li>
                ))
              ) : (
                <li className="text-xs text-slate-500">Belum ada jabatan terdaftar.</li>
              )}
            </ul>
          </div>

          <div className="border-t border-slate-100 pt-4">
            <h3 className="text-xs font-semibold text-slate-500 mb-2">Hak Kelola Penuh (Tambah / Ubah / Hapus)</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-xs text-slate-700">
              {Array.from(editableModules).map((mod) => (
                <div key={mod} className="flex items-center gap-1.5 py-1">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                  <span>{MODULE_LABELS[mod] || mod}</span>
                </div>
              ))}
            </div>
            <div className="mt-3 pt-3 border-t border-slate-100 text-xs text-slate-600 space-y-1">
              <p>
                Akses Bisyaroh:{' '}
                <strong className={canViewBisyaroh ? 'text-emerald-700' : 'text-slate-500'}>
                  {canViewBisyaroh ? 'Terbuka (Pimpinan / Bendahara)' : 'Terkunci Privasi'}
                </strong>
              </p>
              <p>
                Akses NIK / KK Santri Utuh:{' '}
                <strong className={canViewSensitiveSantri ? 'text-emerald-700' : 'text-slate-500'}>
                  {canViewSensitiveSantri ? 'Terbuka (Sekretaris / EMIS / Pimpinan)' : 'Disamarkan (View Only)'}
                </strong>
              </p>
            </div>
          </div>
        </section>

        {/* Form Ganti Password Pribadi */}
        <section className="rounded-2xl bg-white border border-slate-200 p-5">
          <div className="flex items-center gap-2.5 mb-4">
            <KeyRound className="w-5 h-5 text-emerald-700" />
            <h2 className="text-base font-bold text-slate-900">Ubah Kata Sandi Pribadi</h2>
          </div>

          {statusMsg && (
            <div
              className={`mb-4 rounded-xl border px-3.5 py-2.5 text-xs sm:text-sm ${
                statusMsg.type === 'success'
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                  : 'border-rose-200 bg-rose-50 text-rose-800'
              }`}
            >
              {statusMsg.text}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="new-pw" className="block text-xs font-semibold text-slate-700 mb-1.5">
                Kata Sandi Pribadi Baru
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  id="new-pw"
                  type={showPw ? 'text' : 'password'}
                  required
                  minLength={6}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Minimal 6 karakter"
                  className="w-full pl-10 pr-11 py-2.5 text-sm rounded-xl border border-slate-300 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-700 min-h-[44px]"
                />
                <button
                  type="button"
                  onClick={() => setShowPw((p) => !p)}
                  aria-label="Tampilkan sandi"
                  className="absolute right-2 top-1/2 -translate-y-1/2 min-h-[36px] min-w-[36px] flex items-center justify-center text-slate-400 hover:text-slate-700"
                >
                  {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div>
              <label htmlFor="confirm-pw" className="block text-xs font-semibold text-slate-700 mb-1.5">
                Ulangi Kata Sandi Baru
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  id="confirm-pw"
                  type={showPw ? 'text' : 'password'}
                  required
                  minLength={6}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Ketik ulang kata sandi baru"
                  className="w-full pl-10 pr-3.5 py-2.5 text-sm rounded-xl border border-slate-300 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-700 min-h-[44px]"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={saving}
              className="w-full rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-semibold text-sm py-2.5 px-4 transition disabled:opacity-60 min-h-[44px]"
            >
              {saving ? 'Menyimpan...' : 'Simpan Kata Sandi Pribadi'}
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}

export default function ProfilPage() {
  return (
    <Suspense
      fallback={
        <div className="p-8 text-sm text-slate-500">Memuat profil pengurus...</div>
      }
    >
      <ProfilContent />
    </Suspense>
  );
}
