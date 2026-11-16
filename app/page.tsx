'use client';

import React, { useEffect, useState } from 'react';
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
  CalendarCheck,
  RefreshCw,
} from 'lucide-react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

interface SantriRow {
  id: string;
  status: string;
  kamar?: string;
}

interface TransaksiRow {
  id: string;
  dompet: 'pendaftaran' | 'operasional' | 'kas_pondok' | 'mda';
  tipe: 'masuk' | 'keluar';
  nominal: number;
  tgl_transaksi?: string;
}

interface PengaturanRow {
  nama_pesantren?: string;
  saldo_awal_pendaftaran?: number;
  saldo_awal_operasional?: number;
  saldo_awal_kas_pondok?: number;
  saldo_awal_mda?: number;
}

interface AbsenRow {
  id: string;
  tgl: string;
  santri_id?: string;
  waktu_sholat: 'subuh' | 'dzuhur' | 'ashar' | 'maghrib' | 'isya';
  status: 'hadir' | 'sakit' | 'izin' | 'alpha';
}

function formatRupiah(nominal: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(nominal || 0);
}

export default function DashboardPage() {
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [tahunAjaran, setTahunAjaran] = useState('2026/2027');
  const [bulanLabel, setBulanLabel] = useState('Bulan Berjalan');
  const [stats, setStats] = useState({
    santriAktif: 0,
    santriNdalem: 0,
    santriBeasiswa: 0,
    totalPersonel: 0,
    saldoOperasional: 0,
    saldoPendaftaran: 0,
    saldoKasPondok: 0,
    saldoMda: 0,
    masukBulanIni: 0,
    namaPesantren: 'Pondok Pesantren An-Nur 1 Bululawang',
  });

  const [jamaahToday, setJamaahToday] = useState({
    total: 0,
    hadir: 0,
    sakit: 0,
    izin: 0,
    alpha: 0,
    persenHadir: 0,
    subuhCount: 0,
    dzuhurCount: 0,
    asharCount: 0,
    maghribCount: 0,
    isyaCount: 0,
  });

  const [jamaahMonthly, setJamaahMonthly] = useState({
    total: 0,
    hadir: 0,
    sakit: 0,
    izin: 0,
    alpha: 0,
    persenHadir: 0,
    hariTercatat: 0,
  });

  const fetchDashboardData = async () => {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const todayIso = `${yyyy}-${mm}-${dd}`;
    const monthPrefix = `${yyyy}-${mm}`;
    const lastDayOfMonth = new Date(yyyy, now.getMonth() + 1, 0).getDate();
    const monthStart = `${monthPrefix}-01`;
    const monthEnd = `${monthPrefix}-${String(lastDayOfMonth).padStart(2, '0')}`;
    const startYear = now.getMonth() + 1 >= 7 ? yyyy : yyyy - 1;

    const namaBulan = [
      'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
      'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
    ];

    const [santriRes, transaksiRes, pengaturanRes, jamaahRes] = await Promise.all([
      supabase.from('santri').select('id, status, kamar'),
      supabase.from('keuangan_transaksi').select('id, dompet, tipe, nominal, tgl_transaksi'),
      supabase.from('pengaturan_aplikasi').select('*').limit(1).maybeSingle(),
      supabase
        .from('absen_jamaah')
        .select('id, tgl, santri_id, waktu_sholat, status')
        .gte('tgl', monthStart)
        .lte('tgl', monthEnd),
    ]);

    if (santriRes.error) throw santriRes.error;
    if (transaksiRes.error) throw transaksiRes.error;

    const santriList = (santriRes.data || []) as SantriRow[];
    const transaksiList = (transaksiRes.data || []) as TransaksiRow[];
    const setting = (pengaturanRes.data || {}) as PengaturanRow;
    const jamaahMonthList = (jamaahRes.error ? [] : jamaahRes.data || []) as AbsenRow[];

    const santriAktif = santriList.filter((s) =>
      ['aktif', 'ndalem', 'beasiswa_lazis'].includes(s.status)
    ).length;
    const santriNdalem = santriList.filter((s) => s.status === 'ndalem').length;
    const santriBeasiswa = santriList.filter((s) => s.status === 'beasiswa_lazis').length;

    let saldoPendaftaran = Number(setting.saldo_awal_pendaftaran || 0);
    let saldoOperasional = Number(setting.saldo_awal_operasional || 0);
    let saldoKasPondok = Number(setting.saldo_awal_kas_pondok || 0);
    let saldoMda = Number(setting.saldo_awal_mda || 0);
    let masukBulanIni = 0;

    for (const tx of transaksiList) {
      const nominal = Number(tx.nominal || 0);
      const signed = tx.tipe === 'masuk' ? nominal : -nominal;
      if (tx.dompet === 'pendaftaran') saldoPendaftaran += signed;
      else if (tx.dompet === 'operasional') saldoOperasional += signed;
      else if (tx.dompet === 'kas_pondok') saldoKasPondok += signed;
      else if (tx.dompet === 'mda') saldoMda += signed;

      if (tx.tipe === 'masuk' && (tx.tgl_transaksi || '').startsWith(monthPrefix)) {
        masukBulanIni += nominal;
      }
    }

    const activeSantriIds = new Set(
      santriList
        .filter((s) => ['aktif', 'ndalem', 'beasiswa_lazis'].includes(s.status))
        .map((s) => s.id)
    );

    let jHadir = 0;
    let jSakit = 0;
    let jIzin = 0;
    let jAlpha = 0;
    let jTotal = 0;
    let subuhCount = 0;
    let dzuhurCount = 0;
    let asharCount = 0;
    let maghribCount = 0;
    let isyaCount = 0;

    let mHadir = 0;
    let mSakit = 0;
    let mIzin = 0;
    let mAlpha = 0;
    let mTotal = 0;
    const mDaysSet = new Set<string>();

    for (const row of jamaahMonthList) {
      if (row.santri_id && !activeSantriIds.has(row.santri_id)) continue;

      mTotal += 1;
      if (row.tgl) mDaysSet.add(row.tgl);
      if (row.status === 'hadir') mHadir += 1;
      else if (row.status === 'sakit') mSakit += 1;
      else if (row.status === 'izin') mIzin += 1;
      else if (row.status === 'alpha') mAlpha += 1;

      if (row.tgl === todayIso) {
        jTotal += 1;
        if (row.status === 'hadir') jHadir += 1;
        else if (row.status === 'sakit') jSakit += 1;
        else if (row.status === 'izin') jIzin += 1;
        else if (row.status === 'alpha') jAlpha += 1;

        if (row.waktu_sholat === 'subuh') subuhCount += 1;
        else if (row.waktu_sholat === 'dzuhur') dzuhurCount += 1;
        else if (row.waktu_sholat === 'ashar') asharCount += 1;
        else if (row.waktu_sholat === 'maghrib') maghribCount += 1;
        else if (row.waktu_sholat === 'isya') isyaCount += 1;
      }
    }

    return {
      tahunAjaran: `${startYear}/${startYear + 1}`,
      bulanLabel: `${namaBulan[now.getMonth()]} ${yyyy}`,
      stats: {
        santriAktif,
        santriNdalem,
        santriBeasiswa,
        totalPersonel: santriList.length,
        saldoOperasional,
        saldoPendaftaran,
        saldoKasPondok,
        saldoMda,
        masukBulanIni,
        namaPesantren: setting.nama_pesantren || 'Pondok Pesantren An-Nur 1 Bululawang',
      },
      jamaahToday: {
        total: jTotal,
        hadir: jHadir,
        sakit: jSakit,
        izin: jIzin,
        alpha: jAlpha,
        persenHadir: jTotal > 0 ? Math.round((jHadir / jTotal) * 100) : 0,
        subuhCount,
        dzuhurCount,
        asharCount,
        maghribCount,
        isyaCount,
      },
      jamaahMonthly: {
        total: mTotal,
        hadir: mHadir,
        sakit: mSakit,
        izin: mIzin,
        alpha: mAlpha,
        persenHadir: mTotal > 0 ? Math.round((mHadir / mTotal) * 100) : 0,
        hariTercatat: mDaysSet.size,
      },
    };
  };

  const loadDashboard = async () => {
    setLoading(true);
    setErrorMsg(null);

    try {
      const result = await fetchDashboardData();
      setTahunAjaran(result.tahunAjaran);
      setBulanLabel(result.bulanLabel);
      setStats(result.stats);
      setJamaahToday(result.jamaahToday);
      setJamaahMonthly(result.jamaahMonthly);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal memuat ringkasan database.';
      setErrorMsg(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let active = true;
    fetchDashboardData()
      .then((result) => {
        if (!active) return;
        setTahunAjaran(result.tahunAjaran);
        setBulanLabel(result.bulanLabel);
        setStats(result.stats);
        setJamaahToday(result.jamaahToday);
        setJamaahMonthly(result.jamaahMonthly);
      })
      .catch((err) => {
        if (!active) return;
        const msg = err instanceof Error ? err.message : 'Gagal memuat ringkasan database.';
        setErrorMsg(msg);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="space-y-6">
      {/* HEADER BANNER DASHBOARD */}
      <div className="bg-gradient-to-r from-emerald-900 to-emerald-800 rounded-2xl p-6 text-white shadow-md flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <span className="px-3 py-1 bg-emerald-700/60 text-emerald-200 text-xs font-semibold rounded-full border border-emerald-600/50">
            Tahun Ajaran {tahunAjaran}
          </span>
          <h1 className="text-2xl font-bold mt-2">Selamat Datang di SIAP An-Nur 1</h1>
          <p className="text-sm text-emerald-200 mt-0.5">
            Sistem Informasi Administrasi &amp; Keuangan {stats.namaPesantren}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={loadDashboard}
            disabled={loading}
            className="px-3 py-2.5 bg-emerald-800/80 hover:bg-emerald-700 text-emerald-100 text-xs font-semibold rounded-xl border border-emerald-600/60 transition-colors flex items-center gap-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Muat Ulang
          </button>
          <Link
            href="/santri"
            className="px-4 py-2.5 bg-white text-emerald-900 text-xs font-bold rounded-xl shadow hover:bg-emerald-50 transition-colors flex items-center gap-2"
          >
            <PlusCircle className="w-4 h-4" />
            Tambah Santri EMIS
          </Link>
        </div>
      </div>

      {errorMsg && (
        <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 flex items-start gap-3 text-rose-900 text-xs">
          <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <span className="font-bold">Kendala Koneksi Database:</span> {errorMsg}
          </div>
        </div>
      )}

      {/* TOP METRIC CARDS (DATA AKTUAL DATABASE) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
          <div className="flex justify-between items-center">
            <span className="text-xs font-semibold text-slate-500">Santri Aktif</span>
            <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
              <Users className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4">
            <h3 className="text-2xl font-bold text-slate-800 tabular-nums">
              {loading ? '...' : stats.santriAktif}
            </h3>
            <p className="text-[11px] text-slate-500 mt-1">
              <span className="text-emerald-600 font-semibold">{stats.santriNdalem} Ndalem</span> &bull; Total{' '}
              <span className="tabular-nums">{stats.totalPersonel}</span> Data
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
            <h3 className="text-xl font-bold text-slate-800 tabular-nums truncate">
              {loading ? '...' : formatRupiah(stats.saldoOperasional)}
            </h3>
            <p className="text-[11px] text-slate-500 mt-1">
              Masuk {bulanLabel}:{' '}
              <span className="text-emerald-600 font-semibold tabular-nums">
                {formatRupiah(stats.masukBulanIni)}
              </span>
            </p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
          <div className="flex justify-between items-center">
            <span className="text-xs font-semibold text-slate-500">Beasiswa LAZIS</span>
            <div className="p-2 bg-amber-50 text-amber-600 rounded-xl">
              <FileText className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4">
            <h3 className="text-2xl font-bold text-slate-800 tabular-nums">
              {loading ? '...' : stats.santriBeasiswa}
            </h3>
            <p className="text-[11px] text-slate-500 mt-1">
              Santri penerima subsidi aktif
            </p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
          <div className="flex justify-between items-center">
            <span className="text-xs font-semibold text-slate-500">Total Saldo 4 Dompet</span>
            <div className="p-2 bg-purple-50 text-purple-600 rounded-xl">
              <HeartPulse className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4">
            <h3 className="text-xl font-bold text-slate-800 tabular-nums truncate">
              {loading
                ? '...'
                : formatRupiah(
                    stats.saldoPendaftaran +
                      stats.saldoOperasional +
                      stats.saldoKasPondok +
                      stats.saldoMda
                  )}
            </h3>
            <p className="text-[11px] text-emerald-700 font-semibold mt-1">
              Pendaftaran, Operasional, Kas &amp; MDA
            </p>
          </div>
        </div>
      </div>

      {/* QUICK ACTIONS & FEED RINGKASAN 4 DOMPET */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* MENU AKSES CEPAT PENGURUS */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
          <h2 className="font-bold text-sm text-slate-800 flex items-center gap-2">
            <Clock className="w-4 h-4 text-emerald-600" />
            Aksi Cepat Pengurus
          </h2>

          <div className="grid grid-cols-2 gap-2 text-xs">
            <Link
              href="/keuangan"
              className="p-3 bg-slate-50 hover:bg-emerald-50 hover:border-emerald-200 border border-slate-200 rounded-xl font-medium text-slate-700 flex flex-col items-center justify-center gap-1.5 text-center transition-colors"
            >
              <Wallet className="w-5 h-5 text-emerald-600" />
              <span>Input Syahriyah</span>
            </Link>

            <Link
              href="/absen-jamaah"
              className="p-3 bg-slate-50 hover:bg-emerald-50 hover:border-emerald-200 border border-slate-200 rounded-xl font-medium text-slate-700 flex flex-col items-center justify-center gap-1.5 text-center transition-colors"
            >
              <CalendarCheck className="w-5 h-5 text-blue-600" />
              <span>Rekap Jamaah</span>
            </Link>

            <Link
              href="/santri"
              className="p-3 bg-slate-50 hover:bg-emerald-50 hover:border-emerald-200 border border-slate-200 rounded-xl font-medium text-slate-700 flex flex-col items-center justify-center gap-1.5 text-center transition-colors"
            >
              <FileText className="w-5 h-5 text-amber-600" />
              <span>Buku Induk Santri</span>
            </Link>

            <Link
              href="/pengaturan"
              className="p-3 bg-slate-50 hover:bg-emerald-50 hover:border-emerald-200 border border-slate-200 rounded-xl font-medium text-slate-700 flex flex-col items-center justify-center gap-1.5 text-center transition-colors"
            >
              <CheckCircle2 className="w-5 h-5 text-rose-600" />
              <span>Atur Tarif &amp; Logo</span>
            </Link>
          </div>
        </div>

        {/* REKAP ARUS KAS 4 DOMPET */}
        <div className="lg:col-span-2 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="font-bold text-sm text-slate-800 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-emerald-600" />
              Ringkasan Saldo 4 Dompet ({bulanLabel})
            </h2>
            <Link
              href="/keuangan"
              className="text-xs font-semibold text-emerald-700 hover:underline flex items-center gap-0.5"
            >
              Selengkapnya <ArrowUpRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="p-3.5 bg-blue-50/70 border border-blue-200 rounded-xl flex justify-between items-center text-xs">
              <div>
                <span className="font-bold text-blue-950 block">1. Dompet Pendaftaran</span>
                <span className="text-blue-700">Penerimaan Santri Baru (PSB)</span>
              </div>
              <span className="font-bold text-blue-800 text-sm tabular-nums">
                {loading ? '...' : formatRupiah(stats.saldoPendaftaran)}
              </span>
            </div>

            <div className="p-3.5 bg-emerald-50/70 border border-emerald-200 rounded-xl flex justify-between items-center text-xs">
              <div>
                <span className="font-bold text-emerald-950 block">2. Dompet Operasional</span>
                <span className="text-emerald-700">Syahriyah &amp; Iuran Tahunan</span>
              </div>
              <span className="font-bold text-emerald-800 text-sm tabular-nums">
                {loading ? '...' : formatRupiah(stats.saldoOperasional)}
              </span>
            </div>

            <div className="p-3.5 bg-amber-50/70 border border-amber-200 rounded-xl flex justify-between items-center text-xs">
              <div>
                <span className="font-bold text-amber-950 block">3. Dompet Kas (Lain-lain)</span>
                <span className="text-amber-700">Kantin, Donasi &amp; Umum</span>
              </div>
              <span className="font-bold text-amber-800 text-sm tabular-nums">
                {loading ? '...' : formatRupiah(stats.saldoKasPondok)}
              </span>
            </div>

            <div className="p-3.5 bg-purple-50/70 border border-purple-200 rounded-xl flex justify-between items-center text-xs">
              <div>
                <span className="font-bold text-purple-950 block">4. Dompet MDA (Madin)</span>
                <span className="text-purple-700">Ujian Semester &amp; Raport</span>
              </div>
              <span className="font-bold text-purple-800 text-sm tabular-nums">
                {loading ? '...' : formatRupiah(stats.saldoMda)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* RINGKASAN KEHADIRAN SHOLAT JAMAAH HARI INI & CAPAIAN BULANAN */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-bold text-sm text-slate-800 flex items-center gap-2">
              <CalendarCheck className="w-4 h-4 text-emerald-600" />
              Ringkasan Kehadiran Sholat Jamaah (5 Waktu)
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Capaian bulanan seluruh santri ({bulanLabel}) &amp; pantauan presensi hari ini.
            </p>
          </div>
          <Link
            href="/absen-jamaah"
            className="text-xs font-semibold text-emerald-700 hover:underline flex items-center gap-0.5 whitespace-nowrap shrink-0"
          >
            Input / Rekap &amp; Laporan WA <ArrowUpRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        {/* CAPAIAN BULANAN SELURUH SANTRI */}
        <div className="p-4 bg-gradient-to-r from-emerald-50 to-slate-50 border border-emerald-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wide text-emerald-800 block">
              Persentase Jamaah Bulanan Seluruh Santri &middot; {bulanLabel}
            </span>
            <div className="flex items-baseline gap-2.5 mt-1">
              <strong className="text-2xl font-extrabold text-emerald-950 tabular-nums">
                {loading
                  ? '...'
                  : jamaahMonthly.total > 0
                  ? `${jamaahMonthly.persenHadir}%`
                  : 'Belum Ada Data'}
              </strong>
              <span className="text-xs text-emerald-800 tabular-nums">
                ({jamaahMonthly.hadir}/{jamaahMonthly.total} sesi &middot;{' '}
                {jamaahMonthly.hariTercatat} hari tercatat)
              </span>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2.5 text-xs shrink-0">
            <div className="px-3 py-2 bg-white border border-rose-200 rounded-lg text-center">
              <span className="text-[11px] text-rose-700 font-semibold block">Alpha</span>
              <strong className="text-sm font-bold text-rose-700 tabular-nums">
                {loading ? '...' : jamaahMonthly.alpha}
              </strong>
            </div>
            <div className="px-3 py-2 bg-white border border-sky-200 rounded-lg text-center">
              <span className="text-[11px] text-sky-700 font-semibold block">Izin</span>
              <strong className="text-sm font-bold text-sky-700 tabular-nums">
                {loading ? '...' : jamaahMonthly.izin}
              </strong>
            </div>
            <div className="px-3 py-2 bg-white border border-amber-200 rounded-lg text-center">
              <span className="text-[11px] text-amber-700 font-semibold block">Sakit</span>
              <strong className="text-sm font-bold text-amber-700 tabular-nums">
                {loading ? '...' : jamaahMonthly.sakit}
              </strong>
            </div>
          </div>
        </div>

        {/* PANTAUAN HARI INI */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs">
          <div className="p-3.5 bg-emerald-50/70 border border-emerald-200 rounded-xl">
            <span className="text-emerald-800 font-semibold block">Hadir Hari Ini</span>
            <strong className="text-xl font-bold text-emerald-950 tabular-nums mt-1 block">
              {loading ? '...' : jamaahToday.total > 0 ? `${jamaahToday.persenHadir}%` : 'Belum Diinput'}
            </strong>
            <span className="text-[11px] text-emerald-700 tabular-nums">
              {jamaahToday.hadir}/{jamaahToday.total} catatan
            </span>
          </div>

          <div className="p-3.5 bg-rose-50/70 border border-rose-200 rounded-xl">
            <span className="text-rose-800 font-semibold block">Alpha (Wajib Takzir)</span>
            <strong className="text-xl font-bold text-rose-700 tabular-nums mt-1 block">
              {loading ? '...' : jamaahToday.alpha}
            </strong>
            <span className="text-[11px] text-rose-600">Tanpa keterangan</span>
          </div>

          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl">
            <span className="text-slate-600 font-semibold block">Izin</span>
            <strong className="text-xl font-bold text-sky-700 tabular-nums mt-1 block">
              {loading ? '...' : jamaahToday.izin}
            </strong>
            <span className="text-[11px] text-slate-500">Santri izin keluar</span>
          </div>

          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl">
            <span className="text-slate-600 font-semibold block">Sakit</span>
            <strong className="text-xl font-bold text-amber-700 tabular-nums mt-1 block">
              {loading ? '...' : jamaahToday.sakit}
            </strong>
            <span className="text-[11px] text-slate-500">Santri izin sakit</span>
          </div>

          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl col-span-2 sm:col-span-1">
            <span className="text-slate-600 font-semibold block">Tercatat 5 Waktu</span>
            <div className="mt-1 space-y-0.5 text-[11px] tabular-nums text-slate-700">
              <div className="flex justify-between">
                <span>Subuh / Dzh</span>
                <strong>{jamaahToday.subuhCount} / {jamaahToday.dzuhurCount}</strong>
              </div>
              <div className="flex justify-between">
                <span>Ashar / Mgh</span>
                <strong>{jamaahToday.asharCount} / {jamaahToday.maghribCount}</strong>
              </div>
              <div className="flex justify-between">
                <span>Isya</span>
                <strong>{jamaahToday.isyaCount}</strong>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}