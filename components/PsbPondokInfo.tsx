'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  BookOpen,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ClipboardCheck,
  FileSearch,
  MapPin,
  Phone,
  ShieldCheck,
  UserPlus,
} from 'lucide-react';
import { PSB_PROFIL_PONDOK } from '@/lib/psb';

export function PsbPublicHeader({
  activePage,
  logoUrl,
  namaPesantren,
  alamat,
}: {
  activePage: 'daftar' | 'cek-daftar';
  logoUrl?: string;
  namaPesantren?: string;
  alamat?: string;
}) {
  return (
    <header className="bg-emerald-950 text-white border-b border-emerald-900 sticky top-0 z-30 shadow-sm">
      <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
        <Link href="/daftar" className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-white p-1 flex items-center justify-center shrink-0 overflow-hidden">
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={logoUrl}
                alt="Logo Pondok"
                className="w-full h-full object-contain"
                referrerPolicy="no-referrer"
              />
            ) : (
              <span className="text-xs font-black text-emerald-900 leading-none text-center">
                AN
                <br />1
              </span>
            )}
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-300 leading-tight">
              PSB 1 Pintu
            </p>
            <h1 className="text-xs sm:text-base font-bold leading-snug line-clamp-2 sm:truncate">
              {namaPesantren || PSB_PROFIL_PONDOK.namaResmi}
            </h1>
            <p className="text-[11px] text-emerald-100/80 truncate hidden sm:block">
              {alamat || PSB_PROFIL_PONDOK.alamat}
            </p>
          </div>
        </Link>

        <nav className="flex items-center gap-1.5 shrink-0">
          <Link
            href="/daftar"
            className={`px-2.5 sm:px-3 py-2 rounded-lg text-[11px] sm:text-xs font-bold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap ${
              activePage === 'daftar'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'bg-white/10 text-emerald-100 hover:bg-white/20'
            }`}
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span>Daftar</span>
          </Link>
          <Link
            href="/cek-daftar"
            className={`px-2.5 sm:px-3 py-2 rounded-lg text-[11px] sm:text-xs font-bold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap ${
              activePage === 'cek-daftar'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'bg-white/10 text-emerald-100 hover:bg-white/20'
            }`}
          >
            <FileSearch className="w-3.5 h-3.5" />
            <span>Cek Status</span>
          </Link>
        </nav>
      </div>
    </header>
  );
}

export function PsbPondokInfoCard({ defaultOpen = false }: { defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const [tab, setTab] = useState<'profil' | 'syarat' | 'jadwal'>('profil');

  return (
    <section className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="w-full px-4 sm:px-5 py-3.5 flex items-center justify-between gap-3 text-left hover:bg-slate-50 transition-colors cursor-pointer"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0">
            <BookOpen className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <h2 className="text-xs sm:text-sm font-bold text-slate-900 leading-snug">
              Profil Pondok, Berkas Wajib &amp; Jadwal Harian Santri
            </h2>
            <p className="text-[11px] text-slate-500 leading-snug mt-0.5">
              Didirikan {PSB_PROFIL_PONDOK.tahunBerdiri} oleh {PSB_PROFIL_PONDOK.pendiri} · Pengasuh:{' '}
              {PSB_PROFIL_PONDOK.pengasuhSekarang}
            </p>
          </div>
        </div>
        <span className="text-xs font-semibold text-emerald-700 inline-flex items-center gap-1 shrink-0">
          {open ? 'Tutup' : 'Baca'}
          {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </span>
      </button>

      {open && (
        <div className="border-t border-slate-200 p-4 sm:p-5 space-y-4 text-xs text-slate-700">
          <div className="flex flex-wrap gap-1.5 bg-slate-100 p-1 rounded-xl">
            <button
              type="button"
              onClick={() => setTab('profil')}
              className={`flex-1 min-w-[110px] py-2 px-3 rounded-lg font-semibold text-xs transition-colors cursor-pointer ${
                tab === 'profil' ? 'bg-white text-emerald-800 shadow-xs' : 'text-slate-600'
              }`}
            >
              Sejarah, Visi &amp; Misi
            </button>
            <button
              type="button"
              onClick={() => setTab('syarat')}
              className={`flex-1 min-w-[110px] py-2 px-3 rounded-lg font-semibold text-xs transition-colors cursor-pointer ${
                tab === 'syarat' ? 'bg-white text-emerald-800 shadow-xs' : 'text-slate-600'
              }`}
            >
              Berkas &amp; Tata Tertib
            </button>
            <button
              type="button"
              onClick={() => setTab('jadwal')}
              className={`flex-1 min-w-[110px] py-2 px-3 rounded-lg font-semibold text-xs transition-colors cursor-pointer ${
                tab === 'jadwal' ? 'bg-white text-emerald-800 shadow-xs' : 'text-slate-600'
              }`}
            >
              Jadwal Kegiatan Santri
            </button>
          </div>

          {tab === 'profil' && (
            <div className="space-y-3 leading-relaxed">
              <div className="p-3.5 rounded-xl bg-emerald-50/70 border border-emerald-200">
                <p className="font-bold text-emerald-950 text-sm mb-1">
                  {PSB_PROFIL_PONDOK.namaArab} · {PSB_PROFIL_PONDOK.namaResmi}
                </p>
                <p className="text-slate-700">{PSB_PROFIL_PONDOK.sejarahSingkat}</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/60">
                  <p className="font-bold text-slate-900 mb-1">Visi Pesantren</p>
                  <p className="text-slate-700">&ldquo;{PSB_PROFIL_PONDOK.visi}&rdquo;</p>
                </div>
                <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/60">
                  <p className="font-bold text-slate-900 mb-1">Misi Pesantren</p>
                  <p className="text-slate-700">&ldquo;{PSB_PROFIL_PONDOK.misi}&rdquo;</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-4 text-[11px] text-slate-600 pt-1">
                <span className="inline-flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-emerald-700" />
                  {PSB_PROFIL_PONDOK.alamat}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Phone className="w-3.5 h-3.5 text-emerald-700" />
                  Kantor: {PSB_PROFIL_PONDOK.telepon} ({PSB_PROFIL_PONDOK.jamKantorOffline})
                </span>
              </div>
            </div>
          )}

          {tab === 'syarat' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="border border-slate-200 rounded-xl p-3.5 space-y-2">
                <p className="font-bold text-slate-900 flex items-center gap-1.5">
                  <ClipboardCheck className="w-4 h-4 text-emerald-700" />
                  Berkas Fisik Dibawa Saat Kedatangan / Sowan
                </p>
                <ul className="space-y-1.5">
                  {PSB_PROFIL_PONDOK.berkasFisikWajib.map((item) => (
                    <li key={item} className="flex items-start gap-2">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="border border-slate-200 rounded-xl p-3.5 space-y-2.5">
                <p className="font-bold text-slate-900 flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-emerald-700" />
                  Ringkasan Tata Tertib &amp; Kewajiban Wali
                </p>
                <ul className="space-y-1.5">
                  {PSB_PROFIL_PONDOK.ketentuanWali.map((item) => (
                    <li key={item} className="flex items-start gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 shrink-0 mt-1.5" />
                      <span>{item}</span>
                    </li>
                  ))}
                  {PSB_PROFIL_PONDOK.peraturanRingkas.larangan.map((item) => (
                    <li key={item} className="flex items-start gap-2 text-rose-800">
                      <span className="w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0 mt-1.5" />
                      <span>Larangan: {item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {tab === 'jadwal' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="border border-slate-200 rounded-xl p-3.5">
                <p className="font-bold text-slate-900 mb-2 flex items-center gap-1.5">
                  <CalendarClock className="w-4 h-4 text-emerald-700" />
                  Jadwal Harian (Sabtu – Kamis)
                </p>
                <div className="space-y-1.5">
                  {PSB_PROFIL_PONDOK.jadwalHarian.map((row) => (
                    <div key={row.waktu} className="flex gap-2.5 border-b border-slate-100 pb-1.5 last:border-0">
                      <span className="font-mono font-bold text-emerald-800 w-24 shrink-0">
                        {row.waktu}
                      </span>
                      <span>{row.kegiatan}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="border border-slate-200 rounded-xl p-3.5">
                <p className="font-bold text-slate-900 mb-2 flex items-center gap-1.5">
                  <CalendarClock className="w-4 h-4 text-emerald-700" />
                  Agenda Rutin Malam Jum&apos;at &amp; Hari Jum&apos;at
                </p>
                <div className="space-y-1.5">
                  {PSB_PROFIL_PONDOK.jadwalJumat.map((row) => (
                    <div key={row.waktu} className="flex gap-2.5 border-b border-slate-100 pb-1.5 last:border-0">
                      <span className="font-mono font-bold text-emerald-800 w-28 shrink-0">
                        {row.waktu}
                      </span>
                      <span>{row.kegiatan}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
