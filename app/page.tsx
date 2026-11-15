'use client';

import React from 'react';
import { 
  Users, 
  Wallet, 
  HeartPulse, 
  FileText, 
  AlertTriangle, 
  TrendingUp, 
  Clock, 
  ArrowUpRight, 
  PlusCircle, 
  CheckCircle2,
  CalendarCheck
} from 'lucide-react';
import Link from 'next/link';

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      
      {/* HEADER BANNER DASHBOARD */}
      <div className="bg-gradient-to-r from-emerald-900 to-emerald-800 rounded-2xl p-6 text-white shadow-md flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <span className="px-3 py-1 bg-emerald-700/60 text-emerald-200 text-xs font-semibold rounded-full border border-emerald-600/50">
            Tahun Ajaran 2026/2027
          </span>
          <h1 className="text-2xl font-bold mt-2">Selamat Datang di SIAP An-Nur 1</h1>
          <p className="text-sm text-emerald-200 mt-0.5">
            Sistem Informasi Administrasi & Keuangan Pondok Pesantren An-Nur 1 Bululawang
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link 
            href="/santri" 
            className="px-4 py-2.5 bg-white text-emerald-900 text-xs font-bold rounded-xl shadow hover:bg-emerald-50 transition-colors flex items-center gap-2"
          >
            <PlusCircle className="w-4 h-4" />
            Tambah Santri EMIS
          </Link>
        </div>
      </div>

      {/* TOP METRIC CARDS (INFORMASI RINGKAS EKSEKUTIF) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
          <div className="flex justify-between items-center">
            <span className="text-xs font-semibold text-slate-500">Santri Aktif</span>
            <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
              <Users className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4">
            <h3 className="text-2xl font-bold text-slate-800">135</h3>
            <p className="text-[11px] text-slate-500 mt-1 flex items-center gap-1">
              <span className="text-emerald-600 font-semibold">+4 Ndalem</span> • Total 155 Personel
            </p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
          <div className="flex justify-between items-center">
            <span className="text-xs font-semibold text-slate-500">Kas Operasional</span>
            <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl">
              <Wallet className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4">
            <h3 className="text-2xl font-bold text-slate-800">Rp 24,5M</h3>
            <p className="text-[11px] text-slate-500 mt-1 flex items-center gap-1">
              <span className="text-emerald-600 font-semibold">Tunai & Transfer</span> Oktober
            </p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
          <div className="flex justify-between items-center">
            <span className="text-xs font-semibold text-slate-500">Izin Pulang Hari Ini</span>
            <div className="p-2 bg-amber-50 text-amber-600 rounded-xl">
              <FileText className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4">
            <h3 className="text-2xl font-bold text-slate-800">3</h3>
            <p className="text-[11px] text-slate-500 mt-1">
              2 Menginap • 1 Non-Menginap
            </p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
          <div className="flex justify-between items-center">
            <span className="text-xs font-semibold text-slate-500">Poskestren / UKS</span>
            <div className="p-2 bg-rose-50 text-rose-600 rounded-xl">
              <HeartPulse className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4">
            <h3 className="text-2xl font-bold text-slate-800">2</h3>
            <p className="text-[11px] text-rose-600 font-semibold mt-1">
              1 Perlu Penjemputan Ortu (&gt;3 Hari)
            </p>
          </div>
        </div>

      </div>

      {/* ALERT SECTION (PERINGATAN OTOMATIS) */}
      <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 flex items-start gap-3 text-rose-900">
        <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
        <div className="flex-1 text-xs">
          <span className="font-bold">Peringatan Poskestren:</span> Santri <strong>M. Akhdan Amirul Azhar (Kamar A10)</strong> telah merawat diri di UKS selama 4 hari (keluhan demam). Disarankan untuk segera menghubungi wali santri untuk penjemputan.
        </div>
        <Link href="/kesehatan" className="text-xs font-bold text-rose-700 underline shrink-0">
          Lihat Detail
        </Link>
      </div>

      {/* QUICK ACTIONS & FEED TRANSAKSI */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* MENU AKSES CEPAAT DIVISI */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
          <h2 className="font-bold text-sm text-slate-800 flex items-center gap-2">
            <Clock className="w-4 h-4 text-emerald-600" />
            Aksi Cepat Pengurus
          </h2>

          <div className="grid grid-cols-2 gap-2 text-xs">
            <Link href="/keuangan" className="p-3 bg-slate-50 hover:bg-emerald-50 hover:border-emerald-200 border border-slate-200 rounded-xl font-medium text-slate-700 flex flex-col items-center justify-center gap-1.5 text-center transition-colors">
              <Wallet className="w-5 h-5 text-emerald-600" />
              <span>Input Syahriyah</span>
            </Link>

            <Link href="/absen" className="p-3 bg-slate-50 hover:bg-emerald-50 hover:border-emerald-200 border border-slate-200 rounded-xl font-medium text-slate-700 flex flex-col items-center justify-center gap-1.5 text-center transition-colors">
              <CalendarCheck className="w-5 h-5 text-blue-600" />
              <span>Rekap Jamaah</span>
            </Link>

            <Link href="/perizinan" className="p-3 bg-slate-50 hover:bg-emerald-50 hover:border-emerald-200 border border-slate-200 rounded-xl font-medium text-slate-700 flex flex-col items-center justify-center gap-1.5 text-center transition-colors">
              <FileText className="w-5 h-5 text-amber-600" />
              <span>Cetak Surat Izin</span>
            </Link>

            <Link href="/dapur" className="p-3 bg-slate-50 hover:bg-emerald-50 hover:border-emerald-200 border border-slate-200 rounded-xl font-medium text-slate-700 flex flex-col items-center justify-center gap-1.5 text-center transition-colors">
              <CheckCircle2 className="w-5 h-5 text-rose-600" />
              <span>Timer Masak Dapur</span>
            </Link>
          </div>
        </div>

        {/* REKAP ARUS KAS 4 DOMPET */}
        <div className="lg:col-span-2 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="font-bold text-sm text-slate-800 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-emerald-600" />
              Ringkasan Pembayaran 4 Dompet (Bulan Oktober)
            </h2>
            <Link href="/keuangan" className="text-xs font-semibold text-emerald-700 hover:underline flex items-center gap-0.5">
              Selengkapnya <ArrowUpRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="space-y-3">
            <div className="p-3 bg-slate-50 rounded-xl flex justify-between items-center text-xs">
              <div>
                <span className="font-bold text-slate-800 block">1. Dompet Operasional (Syahriyah)</span>
                <span className="text-slate-500">107 Santri Lunas • 28 Menunggak</span>
              </div>
              <span className="font-bold text-emerald-700 text-sm">Rp 24.511.000</span>
            </div>

            <div className="p-3 bg-slate-50 rounded-xl flex justify-between items-center text-xs">
              <div>
                <span className="font-bold text-slate-800 block">2. Dompet MDA (Ujian &amp; Raport)</span>
                <span className="text-slate-500">Terbayar per Oktober</span>
              </div>
              <span className="font-bold text-blue-700 text-sm">Rp 1.840.000</span>
            </div>

            <div className="p-3 bg-slate-50 rounded-xl flex justify-between items-center text-xs">
              <div>
                <span className="font-bold text-slate-800 block">3. Subsidasi Beasiswa LAZIS</span>
                <span className="text-slate-500">6 Santri Penerima • Sisa Kas</span>
              </div>
              <span className="font-bold text-amber-700 text-sm">Rp 3.400.000</span>
            </div>
          </div>
        </div>

      </div>

    </div>
  );
}