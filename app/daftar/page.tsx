'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  CheckCircle2,
  Copy,
  FileSearch,
  Landmark,
  MapPin,
  MessageCircle,
  ShieldCheck,
  Sparkles,
  Upload,
  UserCheck,
  Wallet,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import {
  DEFAULT_PROFIL_PONDOK_PSB,
  DEFAULT_SKEMA_PENDAFTARAN,
  mergeAturanOperasional,
  readExtendedLocal,
  type ProfilPondokPsbConfig,
  type SkemaPendaftaranConfig,
} from '@/lib/pengaturan';
import { formatRupiah } from '@/lib/laporan';
import {
  calculatePsbBilling,
  compressBuktiTransfer,
  computePromoDisplayRemaining,
  countVerifiedPsbQuota,
  fetchPsbRecords,
  generateNextNoRegistrasi,
  normalizeWaNumber,
  PSB_JENJANG_OPTIONS,
  PSB_MIN_DP,
  PSB_PROFIL_PONDOK,
  savePsbRecord,
  toWaMeDigits,
  type PsbPaket,
  type PsbPendaftaranRecord,
} from '@/lib/psb';
import { PsbPondokInfoCard, PsbPublicHeader } from '@/components/PsbPondokInfo';

interface WilayahRow {
  Kelurahan: string;
  Kecamatan: string;
  Kabupaten: string;
  Provinsi: string;
  'Kode Pos': string | number;
}

export default function DaftarPublicPage() {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [loadingInit, setLoadingInit] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const [pengaturan, setPengaturan] = useState({
    nama_pesantren: PSB_PROFIL_PONDOK.namaResmi,
    alamat_lengkap: PSB_PROFIL_PONDOK.alamat,
    no_telepon: PSB_PROFIL_PONDOK.waAdminDefault,
    logo_url: '',
    rekening_bank: PSB_PROFIL_PONDOK.rekeningOfflinePdf.bank,
    rekening_nomor: PSB_PROFIL_PONDOK.rekeningOfflinePdf.nomor,
    rekening_atas_nama: PSB_PROFIL_PONDOK.rekeningOfflinePdf.atasNama,
  });
  const [skema, setSkema] = useState<SkemaPendaftaranConfig>(DEFAULT_SKEMA_PENDAFTARAN);
  const [profilPondok, setProfilPondok] = useState<ProfilPondokPsbConfig>(DEFAULT_PROFIL_PONDOK_PSB);
  const [quotaUsed, setQuotaUsed] = useState(0);
  const [existingPsb, setExistingPsb] = useState<PsbPendaftaranRecord[]>([]);

  // Form Steps Data
  const [paket, setPaket] = useState<PsbPaket>('reguler');
  const [todayIso, setTodayIso] = useState('2026-11-19');
  const [setujuKetentuan, setSetujuKetentuan] = useState(false);

  const [namaLengkap, setNamaLengkap] = useState('');
  const [jk, setJk] = useState<'L' | 'P'>('L');
  const [tempatLahir, setTempatLahir] = useState('');
  const [tglLahir, setTglLahir] = useState('');
  const [jenjangPendidikan, setJenjangPendidikan] = useState<string>(PSB_JENJANG_OPTIONS[0]);
  const [namaAyah, setNamaAyah] = useState('');
  const [namaIbu, setNamaIbu] = useState('');
  const [namaWali, setNamaWali] = useState('');
  const [noWaWali, setNoWaWali] = useState('');

  // Alamat Domisili (Wilayah Search + Manual Fallback)
  const [wilayahQuery, setWilayahQuery] = useState('');
  const [wilayahResults, setWilayahResults] = useState<WilayahRow[]>([]);
  const [alamatJalan, setAlamatJalan] = useState('');
  const [desa, setDesa] = useState('');
  const [kecamatan, setKecamatan] = useState('');
  const [kabupaten, setKabupaten] = useState('');
  const [provinsi, setProvinsi] = useState('');
  const [kodePos, setKodePos] = useState('');

  // Step 3: Pembayaran DP
  const [jenisBayar, setJenisBayar] = useState<'dp' | 'lunas'>('dp');
  const [dpNominal, setDpNominal] = useState<number>(PSB_MIN_DP);
  const [buktiFileLabel, setBuktiFileLabel] = useState('');
  const [buktiUrl, setBuktiUrl] = useState('');
  const [uploadingBukti, setUploadingBukti] = useState(false);
  const [catatanWali, setCatatanWali] = useState('');

  // Hasil Sukses
  const [submittedRecord, setSubmittedRecord] = useState<PsbPendaftaranRecord | null>(null);

  useEffect(() => {
    let active = true;
    const loadInit = async () => {
      const localExt = readExtendedLocal();
      const [setRes, santriCountRes, psbRes] = await Promise.all([
        supabase.from('pengaturan_aplikasi').select('*').eq('id', 1).maybeSingle(),
        supabase.from('santri').select('id'),
        fetchPsbRecords(),
      ]);

      if (!active) return;

      const row = (setRes.data || {}) as Record<string, unknown>;
      const mergedAturan = mergeAturanOperasional(
        row.aturan_operasional ?? localExt?.aturan_operasional
      );
      setSkema(mergedAturan.pendaftaran);
      if (mergedAturan.profil_pondok) {
        setProfilPondok(mergedAturan.profil_pondok);
      }

      const d = new Date();
      setTodayIso(
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
          d.getDate()
        ).padStart(2, '0')}`
      );

      const rekNo = String(row.rekening_nomor || localExt?.rekening_nomor || '').trim();
      setPengaturan({
        nama_pesantren: String(row.nama_pesantren || PSB_PROFIL_PONDOK.namaResmi),
        alamat_lengkap: String(row.alamat_lengkap || PSB_PROFIL_PONDOK.alamat),
        no_telepon: String(row.no_telepon || PSB_PROFIL_PONDOK.waAdminDefault),
        logo_url: String(row.logo_url || ''),
        rekening_bank: rekNo
          ? String(row.rekening_bank || localExt?.rekening_bank || 'BSI')
          : PSB_PROFIL_PONDOK.rekeningOfflinePdf.bank,
        rekening_nomor: rekNo || PSB_PROFIL_PONDOK.rekeningOfflinePdf.nomor,
        rekening_atas_nama: rekNo
          ? String(row.rekening_atas_nama || localExt?.rekening_atas_nama || 'Pondok Pesantren An-Nur 1')
          : PSB_PROFIL_PONDOK.rekeningOfflinePdf.atasNama,
      });

      const santriCount = Array.isArray(santriCountRes.data) ? santriCountRes.data.length : 0;
      setExistingPsb(psbRes.records);
      setQuotaUsed(countVerifiedPsbQuota(psbRes.records, santriCount));
      setLoadingInit(false);
    };

    const timer = setTimeout(() => {
      void loadInit();
    }, 0);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, []);

  const tahunPsbAktif = Number(skema.tahun_psb || 2027);
  const tahunAjaranPsbAktif = String(skema.tahun_ajaran_psb || '2027/2028');
  const promoSisaTampil = useMemo(
    () =>
      computePromoDisplayRemaining({
        psbRecordsCount: existingPsb.length,
        kuotaTotal: Number(skema.kuota_gratis_uang_pangkal || 100),
        realQuotaUsed: quotaUsed,
        promoDisplayStart: Number(skema.kuota_promo_tampil_awal || 28),
      }),
    [existingPsb.length, skema.kuota_gratis_uang_pangkal, skema.kuota_promo_tampil_awal, quotaUsed]
  );

  const billingReguler = useMemo(
    () =>
      calculatePsbBilling({
        paket: 'reguler',
        jumlahPendaftarTerhitung: quotaUsed,
        skema,
      }),
    [quotaUsed, skema]
  );

  const billingVip = useMemo(
    () =>
      calculatePsbBilling({
        paket: 'vip',
        jumlahPendaftarTerhitung: quotaUsed,
        skema,
      }),
    [quotaUsed, skema]
  );

  const selectedBilling = paket === 'vip' ? billingVip : billingReguler;
  const effectiveBayarNominal =
    jenisBayar === 'lunas'
      ? selectedBilling.totalBiayaAkhir
      : Math.max(PSB_MIN_DP, Number(dpNominal || PSB_MIN_DP));

  const copyText = (key: string, text: string) => {
    navigator.clipboard?.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2200);
  };

  const handleSearchWilayah = async (query: string) => {
    setWilayahQuery(query);
    if (query.trim().length < 2) {
      setWilayahResults([]);
      return;
    }
    const { data } = await supabase
      .from('wilayah_indonesia')
      .select('*')
      .or(
        `Kelurahan.ilike.%${query}%,Kecamatan.ilike.%${query}%,Kabupaten.ilike.%${query}%,Provinsi.ilike.%${query}%`
      )
      .limit(10);
    if (Array.isArray(data)) {
      setWilayahResults(data as WilayahRow[]);
    }
  };

  const handleSelectWilayah = (item: WilayahRow) => {
    setDesa(item.Kelurahan || '');
    setKecamatan(item.Kecamatan || '');
    setKabupaten(item.Kabupaten || '');
    setProvinsi(item.Provinsi || '');
    setKodePos(String(item['Kode Pos'] || ''));
    setWilayahQuery(`${item.Kelurahan}, ${item.Kecamatan}, ${item.Kabupaten}`);
    setWilayahResults([]);
  };

  const handleUploadBukti = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setErrorMsg(null);
    setUploadingBukti(true);
    try {
      const { blob, dataUrl } = await compressBuktiTransfer(file);
      const fileName = `psb_dp_${Date.now()}.jpg`;
      let finalUrl = dataUrl;
      const { error } = await supabase.storage
        .from('kegiatan-foto')
        .upload(fileName, blob, { contentType: 'image/jpeg', upsert: true });
      if (!error) {
        const { data } = supabase.storage.from('kegiatan-foto').getPublicUrl(fileName);
        if (data?.publicUrl) finalUrl = data.publicUrl;
      }
      setBuktiUrl(finalUrl);
      setBuktiFileLabel(file.name);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal memproses foto bukti transfer.');
    } finally {
      setUploadingBukti(false);
    }
  };

  const handleNextStep1 = () => {
    setErrorMsg(null);
    if (!setujuKetentuan) {
      setErrorMsg('Mohon centang persetujuan ketentuan Pondok & Wali Santri terlebih dahulu.');
      return;
    }
    setStep(2);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleNextStep2 = () => {
    setErrorMsg(null);
    if (!namaLengkap.trim()) {
      setErrorMsg('Nama lengkap calon santri wajib diisi.');
      return;
    }
    if (!namaWali.trim()) {
      setErrorMsg('Nama orang tua / wali santri wajib diisi.');
      return;
    }
    const cleanWa = normalizeWaNumber(noWaWali);
    if (cleanWa.length < 9) {
      setErrorMsg('Nomor HP / WhatsApp wali harus aktif dan valid (minimal 9 digit).');
      return;
    }
    if (!desa.trim() || !kecamatan.trim() || !kabupaten.trim()) {
      setErrorMsg(
        'Silakan pilih Desa/Kecamatan/Kabupaten dari pencarian wilayah (atau isi manual secara lengkap).'
      );
      return;
    }
    setStep(3);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSubmitPendaftaran = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (effectiveBayarNominal < PSB_MIN_DP) {
      setErrorMsg(`Minimal transfer DP pendaftaran adalah ${formatRupiah(PSB_MIN_DP)}.`);
      return;
    }
    if (!buktiUrl) {
      setErrorMsg('Mohon unggah foto/screenshot bukti transfer DP terlebih dahulu.');
      return;
    }

    setSubmitting(true);
    const nowIso = new Date().toISOString();
    const { records: latestRows } = await fetchPsbRecords();
    const noRegistrasi = generateNextNoRegistrasi(
      latestRows.length > 0 ? latestRows : existingPsb,
      tahunPsbAktif
    );

    const newRecord: PsbPendaftaranRecord = {
      id:
        typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : `psb-${Date.now()}`,
      no_registrasi: noRegistrasi,
      tahun_psb: tahunPsbAktif,
      status: 'menunggu_verifikasi',
      paket,
      kamar_rencana: '',
      rencana_tgl_masuk: todayIso,
      nama_lengkap: namaLengkap.trim(),
      jk,
      tempat_lahir: tempatLahir.trim(),
      tgl_lahir: tglLahir || '',
      jenjang_pendidikan: jenjangPendidikan,
      nama_ayah: namaAyah.trim() || namaWali.trim(),
      nama_ibu: namaIbu.trim(),
      nama_wali: namaWali.trim(),
      no_wa_wali: normalizeWaNumber(noWaWali),
      alamat_jalan: alamatJalan.trim(),
      desa: desa.trim(),
      kecamatan: kecamatan.trim(),
      kabupaten: kabupaten.trim(),
      provinsi: provinsi.trim(),
      kode_pos: kodePos.trim(),
      dapat_promo_pangkal: selectedBilling.rincian.isFreeUangPangkal,
      total_biaya_awal: selectedBilling.totalBiayaAwal,
      nominal_keringanan: 0,
      catatan_keringanan: '',
      total_biaya_akhir: selectedBilling.totalBiayaAkhir,
      dp_nominal: effectiveBayarNominal,
      dp_terbayar: 0,
      pelunasan_terbayar: 0,
      bukti_dp_url: buktiUrl,
      metode_dp: 'transfer',
      tgl_verifikasi_dp: null,
      verifikator_dp: '',
      tgl_lunas: null,
      santri_id: null,
      nis_terbit: '',
      no_kuitansi_dp: '',
      no_kuitansi_lunas: '',
      catatan_wali: catatanWali.trim(),
      catatan_pengurus: '',
      setuju_ketentuan: true,
      created_at: nowIso,
      updated_at: nowIso,
    };

    const { record } = await savePsbRecord(newRecord);
    setSubmitting(false);
    setSubmittedRecord(record);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  if (submittedRecord) {
    const waDigits = toWaMeDigits(pengaturan.no_telepon || PSB_PROFIL_PONDOK.waAdminDefault);
    const sisaEstimasi = Math.max(0, submittedRecord.total_biaya_akhir - submittedRecord.dp_nominal);
    const waText = encodeURIComponent(
      `Assalamu'alaikum Admin PSB ${pengaturan.nama_pesantren}.\nSaya wali santri telah mengirim pendaftaran online:\n` +
        `• No. Registrasi: ${submittedRecord.no_registrasi}\n` +
        `• Nama Calon Santri: ${submittedRecord.nama_lengkap}\n` +
        `• Paket: ${submittedRecord.paket.toUpperCase()}\n` +
        `• Transfer DP: ${formatRupiah(submittedRecord.dp_nominal)}\n` +
        `• Tanggal Daftar: ${submittedRecord.rencana_tgl_masuk}\n` +
        `Mohon verifikasi bukti transfer kami. Terima kasih.`
    );

    return (
      <div className="min-h-screen bg-slate-50 pb-14">
        <PsbPublicHeader
          activePage="daftar"
          logoUrl={pengaturan.logo_url}
          namaPesantren={pengaturan.nama_pesantren}
          alamat={pengaturan.alamat_lengkap}
        />

        <main className="max-w-2xl mx-auto px-4 pt-6 space-y-5">
          <div className="bg-white rounded-2xl border border-emerald-200 shadow-sm overflow-hidden">
            <div className="bg-emerald-800 text-white p-5 sm:p-6 text-center space-y-2">
              <div className="w-12 h-12 rounded-full bg-white/15 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-7 h-7 text-emerald-200" />
              </div>
              <h2 className="text-lg sm:text-xl font-extrabold">
                Pendaftaran Berhasil Dikirim!
              </h2>
              <p className="text-xs text-emerald-100">
                Simpan Nomor Registrasi di bawah ini untuk memantau verifikasi DP dan status penerimaan.
              </p>
            </div>

            <div className="p-5 sm:p-6 space-y-5">
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-center">
                <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-700">
                  Nomor Registrasi Anda
                </p>
                <div className="mt-1 flex items-center justify-center gap-2">
                  <span className="text-2xl sm:text-3xl font-black font-mono tracking-wider text-emerald-950">
                    {submittedRecord.no_registrasi}
                  </span>
                  <button
                    type="button"
                    onClick={() => copyText('reg', submittedRecord.no_registrasi)}
                    className="px-2.5 py-1.5 rounded-lg bg-white border border-emerald-300 text-xs font-bold text-emerald-800 hover:bg-emerald-100 inline-flex items-center gap-1 cursor-pointer"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    {copiedKey === 'reg' ? 'Tersalin' : 'Salin'}
                  </button>
                </div>
                <span className="inline-block mt-2 px-3 py-1 rounded-full text-[11px] font-bold bg-amber-100 text-amber-900 border border-amber-200">
                  Status: Menunggu Verifikasi DP oleh Bendahara
                </span>
              </div>

              <div className="border border-slate-200 rounded-xl p-4 text-xs space-y-2">
                <div className="flex justify-between gap-2">
                  <span className="text-slate-500">Calon Santri</span>
                  <span className="font-bold text-slate-900 text-right">{submittedRecord.nama_lengkap}</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-slate-500">Nama Wali / No. WA</span>
                  <span className="font-semibold text-slate-800 text-right">
                    {submittedRecord.nama_wali} ({submittedRecord.no_wa_wali})
                  </span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-slate-500">Paket Dipilih</span>
                  <span className="font-bold text-emerald-800 uppercase">
                    {submittedRecord.paket}
                    {submittedRecord.dapat_promo_pangkal ? ' · Kuota Free Uang Pangkal' : ''}
                  </span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-slate-500">Total Biaya Paket</span>
                  <span className="font-mono font-bold text-slate-900">
                    {formatRupiah(submittedRecord.total_biaya_akhir)}
                  </span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-slate-500">Nominal DP Dikirim</span>
                  <span className="font-mono font-bold text-emerald-700">
                    {formatRupiah(submittedRecord.dp_nominal)}
                  </span>
                </div>
                <div className="flex justify-between gap-2 pt-2 border-t border-slate-100">
                  <span className="font-semibold text-slate-700">Estimasi Sisa Pelunasan Saat Sowan</span>
                  <span className="font-mono font-extrabold text-slate-900">
                    {formatRupiah(sisaEstimasi)}
                  </span>
                </div>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 text-xs text-slate-700 space-y-1.5">
                <p className="font-bold text-slate-900">Berkas Fisik Wajib Dibawa Saat Kedatangan:</p>
                <ul className="list-disc list-inside space-y-0.5 text-[11px]">
                  {profilPondok.berkasFisikWajib.map((b) => (
                    <li key={b}>{b}</li>
                  ))}
                </ul>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <a
                  href={`https://wa.me/${waDigits}?text=${waText}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="min-h-[44px] px-4 py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold inline-flex items-center justify-center gap-2 transition-colors"
                >
                  <MessageCircle className="w-4 h-4" />
                  Konfirmasi ke WhatsApp Admin
                </a>
                <Link
                  href={`/cek-daftar?wa=${encodeURIComponent(submittedRecord.no_wa_wali)}&reg=${encodeURIComponent(submittedRecord.no_registrasi)}`}
                  className="min-h-[44px] px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold inline-flex items-center justify-center gap-2 transition-colors"
                >
                  <FileSearch className="w-4 h-4" />
                  Cek Status Pendaftaran
                </Link>
              </div>

              <div className="text-center pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setSubmittedRecord(null);
                    setStep(1);
                    setNamaLengkap('');
                    setTempatLahir('');
                    setTglLahir('');
                    setBuktiUrl('');
                    setBuktiFileLabel('');
                    setCatatanWali('');
                  }}
                  className="text-xs font-semibold text-emerald-700 hover:underline cursor-pointer"
                >
                  + Daftarkan Anak Lainnya (Nomor WA Wali Boleh Sama)
                </button>
              </div>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-16">
      <PsbPublicHeader
        activePage="daftar"
        logoUrl={pengaturan.logo_url}
        namaPesantren={pengaturan.nama_pesantren}
        alamat={pengaturan.alamat_lengkap}
      />

      <main className="max-w-4xl mx-auto px-4 pt-5 space-y-5">
        {/* Banner Hero Promo Kuota Free Uang Pangkal */}
        <section className="bg-gradient-to-br from-emerald-900 via-emerald-800 to-teal-800 text-white rounded-2xl p-5 sm:p-6 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1.5">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/15 text-emerald-100 text-[11px] font-bold">
                <Sparkles className="w-3.5 h-3.5" />
                Penerimaan Santri Baru (PSB) · Tahun Ajaran {tahunAjaranPsbAktif}
              </span>
              <h2 className="text-xl sm:text-2xl font-extrabold tracking-tight">
                Formulir Pendaftaran Online &amp; Booking DP
              </h2>
              <p className="text-xs sm:text-sm text-emerald-100/90 max-w-2xl">
                Silakan pilih paket pendaftaran, lengkapi data calon santri, dan unggah bukti transfer DP minimal {formatRupiah(PSB_MIN_DP)}.
              </p>
            </div>

            <div className="bg-white/10 border border-white/20 rounded-xl px-4 py-3 shrink-0 text-left sm:text-right">
              <p className="text-[11px] font-semibold text-emerald-200">
                Kuota Free Uang Pangkal {formatRupiah(skema.uang_pangkal)}
              </p>
              <p className="text-lg sm:text-xl font-black tabular-nums mt-0.5">
                {billingReguler.rincian.isFreeUangPangkal && promoSisaTampil > 0
                  ? `Sisa ${promoSisaTampil} / ${billingReguler.rincian.kuotaPromoTotal} Kuota`
                  : 'Kuota Promo Penuh'}
              </p>
            </div>
          </div>
        </section>

        {/* Profil Pondok & Jadwal (Dapat Diedit di Pengaturan) */}
        <PsbPondokInfoCard profil={profilPondok} />

        {/* Stepper 3 Langkah */}
        <div className="bg-white border border-slate-200 rounded-2xl p-3 sm:p-4">
          <div className="grid grid-cols-3 gap-2">
            {[
              { n: 1 as const, label: '1. Paket & Syarat' },
              { n: 2 as const, label: '2. Data Santri' },
              { n: 3 as const, label: '3. DP & Bukti' },
            ].map((item) => {
              const isCurrent = step === item.n;
              const isDone = step > item.n;
              return (
                <button
                  key={item.n}
                  type="button"
                  onClick={() => {
                    if (item.n < step) setStep(item.n);
                  }}
                  className={`py-2.5 px-2 rounded-xl text-xs font-bold text-center border transition-colors ${
                    isCurrent
                      ? 'bg-emerald-700 text-white border-emerald-700 shadow-xs'
                      : isDone
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-200 cursor-pointer'
                      : 'bg-slate-50 text-slate-400 border-slate-200 cursor-default'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </div>
        </div>

        {errorMsg && (
          <div className="bg-rose-50 border border-rose-200 text-rose-900 rounded-xl p-3.5 text-xs font-semibold">
            {errorMsg}
          </div>
        )}

        {/* LANGKAH 1: PILIH PAKET (REGULER / VIP) & SYARAT */}
        {step === 1 && (
          <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-6 space-y-5 shadow-xs">
            <div>
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Building2 className="w-4 h-4 text-emerald-700" />
                Langkah 1: Pilih Paket Pendaftaran
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Pilih paket pendaftaran yang sesuai kebutuhan calon santri untuk Tahun Ajaran {tahunAjaranPsbAktif}.
              </p>
            </div>

            {loadingInit ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="h-52 rounded-xl bg-slate-100 animate-pulse" />
                <div className="h-52 rounded-xl bg-slate-100 animate-pulse" />
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[
                  { key: 'reguler' as const, title: 'Paket Reguler', sub: 'Kamar Reguler Putra', b: billingReguler },
                  { key: 'vip' as const, title: 'Paket VIP (Al-Fachriyah 1–4)', sub: 'Fasilitas Kamar VIP + Dipan', b: billingVip },
                ].map((opt) => {
                  const active = paket === opt.key;
                  return (
                    <button
                      key={opt.key}
                      type="button"
                      onClick={() => setPaket(opt.key)}
                      className={`text-left rounded-2xl border-2 p-4 sm:p-5 transition-all cursor-pointer flex flex-col justify-between gap-3 ${
                        active
                          ? 'border-emerald-700 bg-emerald-50/50 shadow-sm'
                          : 'border-slate-200 bg-white hover:border-emerald-300'
                      }`}
                    >
                      <div className="space-y-2 w-full">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="text-sm sm:text-base font-extrabold text-slate-900">
                              {opt.title}
                            </p>
                            <p className="text-xs text-slate-500">{opt.sub}</p>
                          </div>
                          <span
                            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold shrink-0 ${
                              active
                                ? 'bg-emerald-700 text-white'
                                : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {active ? 'Dipilih' : 'Pilih'}
                          </span>
                        </div>

                        <div className="border-t border-slate-200/80 pt-2.5 space-y-1 text-xs">
                          {opt.b.rincian.items.map((it) => (
                            <div key={it.label} className="flex items-center justify-between gap-2">
                              <span className="text-slate-600">{it.label}</span>
                              {it.isFreePromo ? (
                                <span className="font-mono text-right">
                                  <span className="line-through text-slate-400 mr-1.5 text-[11px]">
                                    {formatRupiah(it.nominalNormal)}
                                  </span>
                                  <span className="font-bold text-emerald-700">GRATIS</span>
                                </span>
                              ) : (
                                <span className="font-mono font-semibold text-slate-800">
                                  {formatRupiah(it.nominalBayar)}
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="border-t border-slate-200 pt-3 flex items-baseline justify-between gap-2 w-full">
                        <span className="text-xs font-bold text-slate-700">
                          {opt.b.rincian.isFreeUangPangkal ? 'Total Biaya (Kuota Promo)' : 'Total Tarif Normal'}
                        </span>
                        <span className="text-lg font-black font-mono text-emerald-800">
                          {formatRupiah(opt.b.totalBiayaAwal)}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 text-xs text-slate-700">
                <p className="font-bold text-slate-900">Tanggal Pendaftaran Tercatat Otomatis</p>
                <p className="font-mono font-bold text-emerald-800 mt-1">{todayIso}</p>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Siapkan berkas fisik wajib saat datang/sowan ke pondok.
                </p>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 text-xs text-slate-700 flex items-center gap-2.5">
                <Wallet className="w-5 h-5 text-emerald-700 shrink-0" />
                <div>
                  <p className="font-bold text-slate-900">Skema Pembayaran Fleksibel</p>
                  <p className="text-[11px] text-slate-600">
                    Booking cukup transfer DP minimal <strong>{formatRupiah(PSB_MIN_DP)}</strong>. Sisa pembayaran dapat diselesaikan menyusul.
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-amber-50/70 border border-amber-200 rounded-xl p-4 space-y-2 text-xs text-amber-950">
              <p className="font-bold flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-amber-700" />
                Ketentuan Santri &amp; Wali Santri
              </p>
              <ul className="list-disc list-inside space-y-1 text-[11px]">
                {profilPondok.ketentuanWali.map((k) => (
                  <li key={k}>{k}</li>
                ))}
                <li>Wajib membawa berkas fisik ({profilPondok.berkasFisikWajib.slice(0, 5).join(', ')}) saat kedatangan.</li>
              </ul>
              <label className="flex items-start gap-2.5 pt-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={setujuKetentuan}
                  onChange={(e) => setSetujuKetentuan(e.target.checked)}
                  className="mt-0.5 w-4 h-4 accent-emerald-700"
                />
                <span className="font-bold text-slate-900">
                  Saya telah membaca Profil Pondok, ketentuan wali santri, serta rincian pembiayaan di atas dan menyatakan bersedia mematuhinya.
                </span>
              </label>
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleNextStep1}
                className="w-full sm:w-auto min-h-[44px] px-6 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white text-xs sm:text-sm font-bold rounded-xl inline-flex items-center justify-center gap-2 cursor-pointer"
              >
                Lanjut Isi Data Santri
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* LANGKAH 2: DATA ESENSIAL CALON SANTRI & WALI */}
        {step === 2 && (
          <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-6 space-y-5 shadow-xs">
            <div>
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <UserCheck className="w-4 h-4 text-emerald-700" />
                Langkah 2: Data Calon Santri &amp; Wali
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Mohon isi data calon santri dengan benar sesuai Kartu Keluarga atau Akta Kelahiran.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div className="sm:col-span-2">
                <label htmlFor="nama_lengkap" className="block font-bold text-slate-700 mb-1.5">
                  Nama Lengkap Calon Santri *
                </label>
                <input
                  id="nama_lengkap"
                  type="text"
                  placeholder="Sesuai Akta Kelahiran / Ijazah"
                  value={namaLengkap}
                  onChange={(e) => setNamaLengkap(e.target.value)}
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm"
                />
              </div>

              <div>
                <label htmlFor="jk" className="block font-bold text-slate-700 mb-1.5">
                  Jenis Kelamin *
                </label>
                <select
                  id="jk"
                  value={jk}
                  onChange={(e) => setJk(e.target.value === 'P' ? 'P' : 'L')}
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm"
                >
                  <option value="L">Laki-laki (Putra)</option>
                  <option value="P">Perempuan (Putri)</option>
                </select>
              </div>

              <div>
                <label htmlFor="jenjang" className="block font-bold text-slate-700 mb-1.5">
                  Jenjang Pendidikan yang Dituju *
                </label>
                <select
                  id="jenjang"
                  value={jenjangPendidikan}
                  onChange={(e) => setJenjangPendidikan(e.target.value)}
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm"
                >
                  {PSB_JENJANG_OPTIONS.map((j) => (
                    <option key={j} value={j}>
                      {j}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="tempat_lahir" className="block font-semibold text-slate-700 mb-1.5">
                  Tempat Lahir (Opsional)
                </label>
                <input
                  id="tempat_lahir"
                  type="text"
                  placeholder="Contoh: Malang"
                  value={tempatLahir}
                  onChange={(e) => setTempatLahir(e.target.value)}
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm"
                />
              </div>

              <div>
                <label htmlFor="tgl_lahir" className="block font-semibold text-slate-700 mb-1.5">
                  Tanggal Lahir (Opsional)
                </label>
                <input
                  id="tgl_lahir"
                  type="date"
                  value={tglLahir}
                  onChange={(e) => setTglLahir(e.target.value)}
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm"
                />
              </div>

              <div>
                <label htmlFor="nama_wali" className="block font-bold text-slate-700 mb-1.5">
                  Nama Lengkap Orang Tua / Wali *
                </label>
                <input
                  id="nama_wali"
                  type="text"
                  placeholder="Nama Ayah / Ibu / Wali"
                  value={namaWali}
                  onChange={(e) => setNamaWali(e.target.value)}
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm"
                />
              </div>

              <div>
                <label htmlFor="no_wa_wali" className="block font-bold text-slate-700 mb-1.5">
                  No. HP / WhatsApp Wali Aktif *
                </label>
                <input
                  id="no_wa_wali"
                  type="tel"
                  placeholder="Contoh: 081234567890"
                  value={noWaWali}
                  onChange={(e) => setNoWaWali(e.target.value)}
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm font-mono"
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  Dipakai untuk cek status pendaftaran. Satu nomor WA boleh digunakan mendaftarkan lebih dari 1 anak.
                </p>
              </div>

              <div>
                <label htmlFor="nama_ayah" className="block font-semibold text-slate-700 mb-1.5">
                  Nama Ayah (Opsional)
                </label>
                <input
                  id="nama_ayah"
                  type="text"
                  placeholder="Jika berbeda dengan Wali"
                  value={namaAyah}
                  onChange={(e) => setNamaAyah(e.target.value)}
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm"
                />
              </div>

              <div>
                <label htmlFor="nama_ibu" className="block font-semibold text-slate-700 mb-1.5">
                  Nama Ibu (Opsional)
                </label>
                <input
                  id="nama_ibu"
                  type="text"
                  placeholder="Nama Ibu kandung"
                  value={namaIbu}
                  onChange={(e) => setNamaIbu(e.target.value)}
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm"
                />
              </div>
            </div>

            {/* Pencarian Alamat Wilayah */}
            <div className="border-t border-slate-200 pt-4 space-y-3 text-xs">
              <p className="font-bold text-slate-900 flex items-center gap-1.5">
                <MapPin className="w-4 h-4 text-emerald-700" />
                Alamat Domisili Calon Santri *
              </p>

              <div className="relative">
                <label htmlFor="cari_wilayah" className="block font-semibold text-slate-700 mb-1">
                  Cari Cepat Desa / Kelurahan / Kecamatan
                </label>
                <input
                  id="cari_wilayah"
                  type="text"
                  placeholder="Ketik minimal 2 huruf, misal: Bululawang / Krebet..."
                  value={wilayahQuery}
                  onChange={(e) => void handleSearchWilayah(e.target.value)}
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm"
                />
                {wilayahResults.length > 0 && (
                  <div className="absolute z-20 left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg max-h-56 overflow-y-auto">
                    {wilayahResults.map((w, idx) => (
                      <button
                        key={`${w.Kelurahan}-${w.Kecamatan}-${idx}`}
                        type="button"
                        onClick={() => handleSelectWilayah(w)}
                        className="w-full text-left px-3.5 py-2.5 hover:bg-emerald-50 border-b border-slate-100 last:border-0 text-xs cursor-pointer"
                      >
                        <span className="font-bold text-slate-900">{w.Kelurahan}</span>, Kec.{' '}
                        {w.Kecamatan}, {w.Kabupaten}, {w.Provinsi} (
                        <span className="font-mono text-emerald-700">{w['Kode Pos']}</span>)
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label htmlFor="desa_input" className="block font-semibold text-slate-600 mb-1">
                    Desa / Kelurahan *
                  </label>
                  <input
                    id="desa_input"
                    type="text"
                    value={desa}
                    onChange={(e) => setDesa(e.target.value)}
                    placeholder="Desa/Kelurahan"
                    className="w-full px-2.5 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                  />
                </div>
                <div>
                  <label htmlFor="kec_input" className="block font-semibold text-slate-600 mb-1">
                    Kecamatan *
                  </label>
                  <input
                    id="kec_input"
                    type="text"
                    value={kecamatan}
                    onChange={(e) => setKecamatan(e.target.value)}
                    placeholder="Kecamatan"
                    className="w-full px-2.5 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                  />
                </div>
                <div>
                  <label htmlFor="kab_input" className="block font-semibold text-slate-600 mb-1">
                    Kabupaten / Kota *
                  </label>
                  <input
                    id="kab_input"
                    type="text"
                    value={kabupaten}
                    onChange={(e) => setKabupaten(e.target.value)}
                    placeholder="Kabupaten/Kota"
                    className="w-full px-2.5 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                  />
                </div>
                <div>
                  <label htmlFor="pos_input" className="block font-semibold text-slate-600 mb-1">
                    Kode Pos
                  </label>
                  <input
                    id="pos_input"
                    type="text"
                    value={kodePos}
                    onChange={(e) => setKodePos(e.target.value)}
                    placeholder="65171"
                    className="w-full px-2.5 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="alamat_jalan" className="block font-semibold text-slate-700 mb-1">
                  Detail Jalan / Dusun / RT-RW (Opsional)
                </label>
                <input
                  id="alamat_jalan"
                  type="text"
                  placeholder="Contoh: Dusun Krajan RT 02 RW 01 No. 15"
                  value={alamatJalan}
                  onChange={(e) => setAlamatJalan(e.target.value)}
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm"
                />
              </div>
            </div>

            <div className="flex flex-col-reverse sm:flex-row justify-between gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="min-h-[44px] px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs sm:text-sm font-bold rounded-xl inline-flex items-center justify-center gap-2 cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" />
                Kembali
              </button>
              <button
                type="button"
                onClick={handleNextStep2}
                className="min-h-[44px] px-6 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white text-xs sm:text-sm font-bold rounded-xl inline-flex items-center justify-center gap-2 cursor-pointer"
              >
                Lanjut ke Pembayaran DP
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* LANGKAH 3: TRANSFER DP & UPLOAD BUKTI */}
        {step === 3 && (
          <form
            onSubmit={handleSubmitPendaftaran}
            className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-6 space-y-5 shadow-xs"
          >
            <div>
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Landmark className="w-4 h-4 text-emerald-700" />
                Langkah 3: Transfer DP &amp; Unggah Bukti Pembayaran
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Transfer DP minimal {formatRupiah(PSB_MIN_DP)} ke rekening resmi pondok di bawah ini, lalu unggah foto/screenshot bukti transfernya.
              </p>
            </div>

            {/* Rekening Transfer Resmi */}
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-0.5">
                <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-800">
                  Rekening Resmi Pendaftaran Pondok
                </p>
                <p className="text-sm font-bold text-slate-900">{pengaturan.rekening_bank}</p>
                <p className="text-xl font-black font-mono text-emerald-950 tracking-wide">
                  {pengaturan.rekening_nomor}
                </p>
                <p className="text-xs font-semibold text-slate-700">
                  a.n. {pengaturan.rekening_atas_nama}
                </p>
              </div>
              <button
                type="button"
                onClick={() => copyText('rek', pengaturan.rekening_nomor)}
                className="min-h-[40px] px-4 py-2 bg-white hover:bg-emerald-100 border border-emerald-300 rounded-xl text-xs font-bold text-emerald-900 inline-flex items-center justify-center gap-1.5 shrink-0 cursor-pointer"
              >
                <Copy className="w-3.5 h-3.5" />
                {copiedKey === 'rek' ? 'No. Rekening Tersalin!' : 'Salin No. Rekening'}
              </button>
            </div>

            {/* Pilihan Nominal Bayar */}
            <div className="space-y-2.5 text-xs">
              <p className="font-bold text-slate-800">Pilih Jumlah Transfer Sekarang:</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setJenisBayar('dp');
                    setDpNominal(PSB_MIN_DP);
                  }}
                  className={`p-3.5 rounded-xl border-2 text-left cursor-pointer ${
                    jenisBayar === 'dp'
                      ? 'border-emerald-700 bg-emerald-50/50'
                      : 'border-slate-200 bg-white'
                  }`}
                >
                  <p className="font-bold text-slate-900">Booking DP (Minimal Rp500.000)</p>
                  <p className="text-[11px] text-slate-600 mt-0.5">
                    Sisa tagihan ({formatRupiah(Math.max(0, selectedBilling.totalBiayaAkhir - PSB_MIN_DP))}) dilunasi saat santri datang/sowan.
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setJenisBayar('lunas');
                    setDpNominal(selectedBilling.totalBiayaAkhir);
                  }}
                  className={`p-3.5 rounded-xl border-2 text-left cursor-pointer ${
                    jenisBayar === 'lunas'
                      ? 'border-emerald-700 bg-emerald-50/50'
                      : 'border-slate-200 bg-white'
                  }`}
                >
                  <p className="font-bold text-slate-900">
                    Langsung Lunas ({formatRupiah(selectedBilling.totalBiayaAkhir)})
                  </p>
                  <p className="text-[11px] text-slate-600 mt-0.5">
                    Sudah termasuk Syahriyah bulan pertama paket {paket.toUpperCase()}.
                  </p>
                </button>
              </div>

              {jenisBayar === 'dp' && (
                <div>
                  <label htmlFor="dp_nominal_input" className="block font-bold text-slate-700 mb-1">
                    Nominal yang Ditransfer (Rp, minimal 500.000)
                  </label>
                  <input
                    id="dp_nominal_input"
                    type="number"
                    min={PSB_MIN_DP}
                    step={10000}
                    value={dpNominal}
                    onChange={(e) => setDpNominal(Number(e.target.value))}
                    className="w-full sm:w-64 px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl font-mono font-bold text-sm"
                  />
                </div>
              )}
            </div>

            {/* Upload Bukti Transfer */}
            <div className="space-y-2 text-xs">
              <label htmlFor="upload_bukti_dp" className="block font-bold text-slate-800">
                Upload Foto / Screenshot Bukti Transfer *
              </label>
              <label
                htmlFor="upload_bukti_dp"
                className="flex flex-col items-center justify-center border-2 border-dashed border-slate-300 hover:border-emerald-600 rounded-xl p-5 bg-slate-50 cursor-pointer transition-colors text-center"
              >
                <Upload className="w-6 h-6 text-emerald-700 mb-1.5" />
                <span className="font-bold text-slate-800">
                  {uploadingBukti
                    ? 'Memproses gambar...'
                    : buktiFileLabel
                    ? `Terpilih: ${buktiFileLabel}`
                    : 'Ketuk untuk pilih foto / screenshot struk transfer'}
                </span>
                <span className="text-[11px] text-slate-500 mt-0.5">
                  Format JPG / PNG (otomatis dikompresi agar hemat kuota)
                </span>
                <input
                  id="upload_bukti_dp"
                  type="file"
                  accept="image/*"
                  onChange={handleUploadBukti}
                  className="sr-only"
                />
              </label>

              {buktiUrl && (
                <div className="border border-slate-200 rounded-xl p-3 bg-white flex items-center gap-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={buktiUrl}
                    alt="Pratinjau Bukti Transfer"
                    className="w-20 h-20 object-cover rounded-lg border border-slate-200 shrink-0"
                    referrerPolicy="no-referrer"
                  />
                  <div className="text-xs">
                    <p className="font-bold text-emerald-800">Bukti transfer siap dikirim</p>
                    <p className="text-[11px] text-slate-500">
                      Pastikan tanggal &amp; nominal transfer terbaca jelas oleh Bendahara.
                    </p>
                  </div>
                </div>
              )}
            </div>

            <div>
              <label htmlFor="catatan_wali" className="block text-xs font-semibold text-slate-700 mb-1">
                Catatan Tambahan untuk Pengurus (Opsional)
              </label>
              <input
                id="catatan_wali"
                type="text"
                placeholder="Misal: Akan mengantar hari Ahad pagi / pengajuan keringanan dsb."
                value={catatanWali}
                onChange={(e) => setCatatanWali(e.target.value)}
                className="w-full px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs sm:text-sm"
              />
            </div>

            {/* Ringkasan Final */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs space-y-1.5">
              <p className="font-bold text-slate-900 mb-1">Ringkasan Pendaftaran:</p>
              <div className="flex justify-between">
                <span className="text-slate-500">Calon Santri</span>
                <span className="font-bold text-slate-900">{namaLengkap}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Paket &amp; Asal</span>
                <span className="font-semibold text-slate-800 uppercase">
                  {paket} · {desa}, {kabupaten}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Total Biaya / Transfer Sekarang</span>
                <span className="font-mono font-bold text-emerald-800">
                  {formatRupiah(selectedBilling.totalBiayaAkhir)} / DP {formatRupiah(effectiveBayarNominal)}
                </span>
              </div>
            </div>

            <div className="flex flex-col-reverse sm:flex-row justify-between gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setStep(2)}
                className="min-h-[44px] px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs sm:text-sm font-bold rounded-xl inline-flex items-center justify-center gap-2 cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" />
                Kembali
              </button>
              <button
                type="submit"
                disabled={submitting || uploadingBukti}
                className="min-h-[44px] px-6 py-2.5 bg-emerald-700 hover:bg-emerald-800 disabled:opacity-60 text-white text-xs sm:text-sm font-bold rounded-xl inline-flex items-center justify-center gap-2 cursor-pointer"
              >
                <CheckCircle2 className="w-4 h-4" />
                {submitting ? 'Mengirim Pendaftaran...' : 'Kirim Pendaftaran Sekarang'}
              </button>
            </div>
          </form>
        )}

        {/* Footer link cek daftar */}
        <div className="text-center text-xs text-slate-500">
          Sudah pernah mendaftar?{' '}
          <Link href="/cek-daftar" className="font-bold text-emerald-700 hover:underline inline-flex items-center gap-1">
            <FileSearch className="w-3.5 h-3.5" />
            Cek Status &amp; Sisa Tagihan di sini
          </Link>
        </div>
      </main>
    </div>
  );
}
