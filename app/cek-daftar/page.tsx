'use client';

import React, { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  BedDouble,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  FileSearch,
  MessageCircle,
  Search,
  UserPlus,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { formatRupiah } from '@/lib/laporan';
import {
  fetchPsbRecords,
  matchPsbRecordsForGuardian,
  PSB_PROFIL_PONDOK,
  PSB_STATUS_META,
  toWaMeDigits,
  type PsbPendaftaranRecord,
} from '@/lib/psb';
import { getDynamicTahunPsbInfo } from '@/lib/pengaturan';
import { PsbPublicHeader } from '@/components/PsbPondokInfo';

function CekDaftarInner() {
  const searchParams = useSearchParams();
  const initialWa = searchParams.get('wa') || '';
  const initialReg = searchParams.get('reg') || '';

  const [noWa, setNoWa] = useState(initialWa);
  const [noReg, setNoReg] = useState(initialReg);
  const [allRecords, setAllRecords] = useState<PsbPendaftaranRecord[]>([]);
  const [results, setResults] = useState<PsbPendaftaranRecord[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [loading, setLoading] = useState(true);
  const [exampleNoReg, setExampleNoReg] = useState('PSB-XX-001');
  const [pengaturan, setPengaturan] = useState({
    nama_pesantren: PSB_PROFIL_PONDOK.namaResmi,
    alamat_lengkap: PSB_PROFIL_PONDOK.alamat,
    no_telepon: PSB_PROFIL_PONDOK.waAdminDefault,
    logo_url: '',
  });

  useEffect(() => {
    let active = true;
    const loadData = async () => {
      const [setRes, psbRes] = await Promise.all([
        supabase.from('pengaturan_aplikasi').select('*').eq('id', 1).maybeSingle(),
        fetchPsbRecords(),
      ]);
      if (!active) return;

      const row = (setRes.data || {}) as Record<string, unknown>;
      setPengaturan({
        nama_pesantren: String(row.nama_pesantren || PSB_PROFIL_PONDOK.namaResmi),
        alamat_lengkap: String(row.alamat_lengkap || PSB_PROFIL_PONDOK.alamat),
        no_telepon: String(row.no_telepon || PSB_PROFIL_PONDOK.waAdminDefault),
        logo_url: String(row.logo_url || ''),
      });
      setAllRecords(psbRes.records);

      if (initialWa) {
        const matched = matchPsbRecordsForGuardian(psbRes.records, initialWa, initialReg);
        setResults(matched);
        setHasSearched(true);
      }
      setLoading(false);
    };

    const timer = setTimeout(() => {
      const psbInfo = getDynamicTahunPsbInfo();
      setExampleNoReg(`PSB-${String(psbInfo.tahunPsb).slice(-2)}-001`);
      void loadData();
    }, 0);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [initialWa, initialReg]);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { records } = await fetchPsbRecords();
    setAllRecords(records);
    const matched = matchPsbRecordsForGuardian(records, noWa, noReg);
    setResults(matched);
    setHasSearched(true);
    setLoading(false);
  };

  const waAdminDigits = toWaMeDigits(pengaturan.no_telepon || PSB_PROFIL_PONDOK.waAdminDefault);

  return (
    <div className="min-h-screen bg-slate-50 pb-16">
      <PsbPublicHeader
        activePage="cek-daftar"
        logoUrl={pengaturan.logo_url}
        namaPesantren={pengaturan.nama_pesantren}
        alamat={pengaturan.alamat_lengkap}
      />

      <main className="max-w-3xl mx-auto px-4 pt-6 space-y-5">
        <section className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 shadow-xs space-y-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0">
              <FileSearch className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-extrabold text-slate-900">
                Cek Status Pendaftaran Santri Baru
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Masukkan No. HP/WA Wali untuk memantau verifikasi DP, status aktif santri, dan rincian biaya. Kosongkan Nomor Registrasi bila ingin menampilkan seluruh pendaftar dengan No. WA yang sama.
              </p>
            </div>
          </div>

          <form onSubmit={handleSearch} className="grid grid-cols-1 sm:grid-cols-12 gap-3 text-xs">
            <div className="sm:col-span-5">
              <label htmlFor="cek_wa" className="block font-bold text-slate-700 mb-1">
                No. HP / WhatsApp Wali *
              </label>
              <input
                id="cek_wa"
                type="tel"
                required
                placeholder="Contoh: 081234567890"
                value={noWa}
                onChange={(e) => setNoWa(e.target.value)}
                className="w-full px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm font-mono"
              />
            </div>

            <div className="sm:col-span-4">
              <label htmlFor="cek_reg" className="block font-bold text-slate-700 mb-1">
                Nomor Registrasi (Opsional)
              </label>
              <input
                id="cek_reg"
                type="text"
                placeholder={`Misal: ${exampleNoReg}`}
                value={noReg}
                onChange={(e) => setNoReg(e.target.value)}
                className="w-full px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm font-mono uppercase"
              />
            </div>

            <div className="sm:col-span-3 flex items-end">
              <button
                type="submit"
                disabled={loading}
                className="w-full min-h-[42px] px-4 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold rounded-xl inline-flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Search className="w-4 h-4" />
                {loading ? 'Mencari...' : 'Cek Status'}
              </button>
            </div>
          </form>
        </section>

        {hasSearched && results.length === 0 && (
          <div className="bg-white border border-amber-200 rounded-2xl p-6 text-center space-y-2.5">
            <Clock className="w-8 h-8 text-amber-600 mx-auto" />
            <p className="text-sm font-bold text-slate-900">Data Pendaftaran Tidak Ditemukan</p>
            <p className="text-xs text-slate-600 max-w-md mx-auto">
              Pastikan No. HP/WA Wali sama persis dengan yang diisikan saat mendaftar (terdata {allRecords.length} antrean tersimpan di perangkat/sistem). Jika baru mengirim bukti transfer, Anda dapat menghubungi Admin Pondok.
            </p>
            <div className="pt-2 flex flex-wrap justify-center gap-2">
              <Link
                href="/daftar"
                className="px-4 py-2 bg-emerald-700 text-white text-xs font-bold rounded-xl inline-flex items-center gap-1.5"
              >
                <UserPlus className="w-3.5 h-3.5" />
                Daftar Santri Baru
              </Link>
              <a
                href={`https://wa.me/${waAdminDigits}`}
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 py-2 bg-slate-100 text-slate-800 text-xs font-bold rounded-xl inline-flex items-center gap-1.5"
              >
                <MessageCircle className="w-3.5 h-3.5 text-emerald-700" />
                Hubungi Admin
              </a>
            </div>
          </div>
        )}

        {hasSearched && results.length > 1 && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-emerald-950">
            <div>
              <strong className="block text-sm font-extrabold">
                Ditemukan {results.length} Calon Santri dengan Nomor WA Wali yang Sama
              </strong>
              <p className="text-emerald-800 mt-0.5">
                Menampilkan seluruh status pendaftaran anak Anda secara terpisah berdasarkan Nomor Registrasi masing-masing.
              </p>
            </div>
            <span className="px-3 py-1.5 rounded-xl bg-white border border-emerald-200 font-bold text-emerald-800 shrink-0 self-start sm:self-center">
              {results.length} Pendaftar
            </span>
          </div>
        )}

        {results.map((rec) => {
          const meta = PSB_STATUS_META[rec.status];
          const totalBayarSekarang = Number(rec.dp_terbayar || 0) + Number(rec.pelunasan_terbayar || 0);
          const sisaTagihan = Math.max(0, Number(rec.total_biaya_akhir || 0) - totalBayarSekarang);

          const waInquiry = encodeURIComponent(
            `Assalamu'alaikum Admin PSB ${pengaturan.nama_pesantren}.\nSaya wali dari ${rec.nama_lengkap} (${rec.no_registrasi}) ingin menanyakan status pendaftaran.`
          );

          return (
            <article
              key={rec.id}
              className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 shadow-xs space-y-4"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
                <div>
                  <span className="font-mono text-xs font-bold text-emerald-700">
                    {rec.no_registrasi}
                  </span>
                  <h3 className="text-lg font-extrabold text-slate-900">{rec.nama_lengkap}</h3>
                  <p className="text-xs text-slate-500">
                    Wali: {rec.nama_wali} ({rec.no_wa_wali}) · Paket{' '}
                    <strong className="uppercase text-slate-800">{rec.paket}</strong>
                  </p>
                </div>
                <span
                  className={`self-start sm:self-center px-3 py-1.5 rounded-xl text-xs font-bold border ${meta.badgeClass}`}
                >
                  {meta.label}
                </span>
              </div>

              {/* Timeline 3 Tahap PSB */}
              {rec.status !== 'ditolak' && (
                <div className="grid grid-cols-3 gap-2 text-[11px]">
                  {[
                    { idx: 1, title: '1. Kirim DP' },
                    { idx: 2, title: '2. Verifikasi DP' },
                    { idx: 3, title: '3. Santri Aktif' },
                  ].map((st) => {
                    const passed = meta.stepIndex >= st.idx;
                    return (
                      <div
                        key={st.idx}
                        className={`p-2 rounded-lg border text-center font-semibold ${
                          passed
                            ? 'bg-emerald-50 border-emerald-400 text-emerald-900'
                            : 'bg-slate-50 border-slate-200 text-slate-400'
                        }`}
                      >
                        {st.title}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Rincian Biaya & Pembayaran */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div className="border border-slate-200 rounded-xl p-3.5 space-y-1.5">
                  <p className="font-bold text-slate-900 mb-1">Rincian Pembiayaan</p>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Promo 100 Pendaftar</span>
                    <span className="font-bold text-emerald-700">
                      {rec.dapat_promo_pangkal ? 'Free Uang Pangkal Rp5jt' : 'Tarif Reguler/Normal'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Biaya Paket Awal</span>
                    <span className="font-mono font-semibold">{formatRupiah(rec.total_biaya_awal)}</span>
                  </div>
                  {rec.nominal_keringanan > 0 && (
                    <div className="flex justify-between text-emerald-700">
                      <span>Keringanan ({rec.catatan_keringanan || 'Pengurus'})</span>
                      <span className="font-mono font-bold">- {formatRupiah(rec.nominal_keringanan)}</span>
                    </div>
                  )}
                  <div className="flex justify-between border-t border-slate-100 pt-1.5 font-bold text-slate-900">
                    <span>Total Biaya Akhir</span>
                    <span className="font-mono">{formatRupiah(rec.total_biaya_akhir)}</span>
                  </div>
                </div>

                <div className="border border-slate-200 rounded-xl p-3.5 space-y-1.5">
                  <p className="font-bold text-slate-900 mb-1">Status Pembayaran &amp; Kamar</p>
                  <div className="flex justify-between">
                    <span className="text-slate-500">DP Diajukan</span>
                    <span className="font-mono font-semibold">{formatRupiah(rec.dp_nominal)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Sudah Diverifikasi Masuk</span>
                    <span className="font-mono font-bold text-emerald-700">
                      {formatRupiah(totalBayarSekarang)}
                    </span>
                  </div>
                  <div className="flex justify-between border-t border-slate-100 pt-1.5 font-bold">
                    <span className="text-slate-800">Sisa Biaya Pendaftaran</span>
                    <span className="font-mono text-amber-800">{formatRupiah(sisaTagihan)}</span>
                  </div>
                  {(rec.kamar_rencana || rec.nis_terbit) && (
                    <div className="flex items-center justify-between pt-1 text-emerald-800 font-bold">
                      <span className="inline-flex items-center gap-1">
                        <BedDouble className="w-3.5 h-3.5" />
                        Status Kamar / NIS
                      </span>
                      <span>
                        {rec.kamar_rencana || 'Menunggu Penempatan'}
                        {rec.nis_terbit ? ` · NIS ${rec.nis_terbit}` : ''}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {rec.catatan_pengurus && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-950">
                  <strong>Catatan Pengurus:</strong> {rec.catatan_pengurus}
                </div>
              )}

              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                <div className="flex items-start gap-2 text-slate-700">
                  <ClipboardCheck className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
                  <span>
                    Tanggal Pendaftaran: <strong>{(rec.created_at || rec.rencana_tgl_masuk || '-').slice(0, 10)}</strong> · Siapkan berkas fisik (FC KK, KTP Ortu, Akta, Ijazah/SKL &amp; Foto 3×4 masing-masing 2 lembar) saat datang ke pondok.
                  </span>
                </div>
                <a
                  href={`https://wa.me/${waAdminDigits}?text=${waInquiry}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3.5 py-2 bg-emerald-700 hover:bg-emerald-800 text-white font-bold rounded-xl inline-flex items-center justify-center gap-1.5 shrink-0 whitespace-nowrap"
                >
                  <MessageCircle className="w-3.5 h-3.5" />
                  Tanya Admin
                </a>
              </div>
            </article>
          );
        })}
      </main>
    </div>
  );
}

export default function CekDaftarPublicPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-50 p-6 max-w-3xl mx-auto">
          <div className="h-40 rounded-2xl bg-slate-200 animate-pulse" />
        </div>
      }
    >
      <CekDaftarInner />
    </Suspense>
  );
}
