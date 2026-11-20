'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  BedDouble,
  CheckCircle2,
  ClipboardCopy,
  Database,
  ExternalLink,
  Eye,
  ImagePlus,
  MessageCircle,
  Printer,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
  UserCheck,
  UserPlus,
  Wallet,
  X,
  XCircle,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth, TransparencyBanner } from '@/lib/auth';
import {
  DEFAULT_KAMAR_MASTER,
  DEFAULT_PENGATURAN_FORM,
  DEFAULT_SKEMA_PENDAFTARAN,
  generateNextNisForYear,
  getTahunAjaranForDate,
  mergeAturanOperasional,
  readExtendedLocal,
  type SkemaPendaftaranConfig,
} from '@/lib/pengaturan';
import { formatRupiah } from '@/lib/laporan';
import {
  insertKeuanganTransaksiResilient,
  uploadKeuanganLampiranImage,
} from '@/lib/keuangan';
import {
  calculatePsbBilling,
  countVerifiedPsbQuota,
  deletePsbRecord,
  fetchPsbRecords,
  PSB_STATUS_META,
  PSB_TABLE_SQL,
  savePsbRecord,
  splitPelunasanForWallets,
  toWaMeDigits,
  type PsbPendaftaranRecord,
  type PsbStatus,
} from '@/lib/psb';

const REJECT_PRESET_REASONS = [
  'Bukti transfer tidak valid / palsu',
  'Dana belum masuk di mutasi rekening pondok',
  'Nominal transfer tidak sesuai ketentuan DP minimal',
];

export default function PendaftaranInternalPage() {
  const { canEditModule, pengurus } = useAuth();
  const canEdit = canEditModule('pendaftaran');

  const [records, setRecords] = useState<PsbPendaftaranRecord[]>([]);
  const [santriList, setSantriList] = useState<Array<{ id: string; nis?: string | null }>>([]);
  const [loading, setLoading] = useState(true);
  const [tableMissing, setTableMissing] = useState(false);
  const [savingAction, setSavingAction] = useState(false);
  const [todayIso, setTodayIso] = useState('2026-11-18');
  const [petugasNama, setPetugasNama] = useState('Pengurus PSB / Bendahara');

  const [skema, setSkema] = useState<SkemaPendaftaranConfig>(DEFAULT_SKEMA_PENDAFTARAN);
  const [daftarKamar, setDaftarKamar] = useState<string[]>(DEFAULT_KAMAR_MASTER);
  const [pengaturan, setPengaturan] = useState({
    nama_pesantren: DEFAULT_PENGATURAN_FORM.nama_pesantren,
    alamat_lengkap: DEFAULT_PENGATURAN_FORM.alamat_lengkap,
    no_telepon: DEFAULT_PENGATURAN_FORM.no_telepon,
    logo_url: '',
    stempel_url: '',
    nama_bendahara: DEFAULT_PENGATURAN_FORM.nama_bendahara,
    ttd_bendahara_url: '',
  });

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<'semua' | PsbStatus>('semua');
  const [filterPaket, setFilterPaket] = useState<'semua' | 'reguler' | 'vip'>('semua');

  // Toast
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
  const showToast = useCallback((type: 'success' | 'error', msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 4000);
  }, []);

  // Detail & Workflow Modal
  const [selected, setSelected] = useState<PsbPendaftaranRecord | null>(null);
  const [editKeringanan, setEditKeringanan] = useState<number>(0);
  const [editCatatanKeringanan, setEditCatatanKeringanan] = useState('');
  const [editCatatanPengurus, setEditCatatanPengurus] = useState('');
  const [dpVerifNominal, setDpVerifNominal] = useState<number>(0);
  const [dpVerifMetode, setDpVerifMetode] = useState<'transfer' | 'tunai'>('transfer');
  const [pelunasanNominal, setPelunasanNominal] = useState<number>(0);
  const [pelunasanMetode, setPelunasanMetode] = useState<'tunai' | 'transfer'>('tunai');
  const [pelunasanBuktiFile, setPelunasanBuktiFile] = useState<File | null>(null);
  const [pelunasanBuktiPreview, setPelunasanBuktiPreview] = useState<string>('');
  const [selectedKamar, setSelectedKamar] = useState<string>('Menunggu Penempatan');
  const [tglMasukAktual, setTglMasukAktual] = useState<string>('2027-07-01');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkActivating, setBulkActivating] = useState(false);

  // Print Kuitansi Modal (21x10 cm)
  const [kuitansiPreview, setKuitansiPreview] = useState<{
    record: PsbPendaftaranRecord;
    jenis: 'dp' | 'pelunasan';
    nomor: string;
    nominal: number;
    metode: string;
    tanggal: string;
  } | null>(null);

  const loadAll = useCallback(async () => {
    setLoading(true);
    const localExt = readExtendedLocal();
    const [psbRes, santriRes, setRes, authRes] = await Promise.all([
      fetchPsbRecords(),
      supabase.from('santri').select('id, nis'),
      supabase.from('pengaturan_aplikasi').select('*').eq('id', 1).maybeSingle(),
      supabase.auth.getUser(),
    ]);

    setRecords(psbRes.records);
    setTableMissing(psbRes.tableMissing);

    if (Array.isArray(santriRes.data)) {
      setSantriList(santriRes.data as Array<{ id: string; nis?: string | null }>);
    }

    const row = (setRes.data || {}) as Record<string, unknown>;
    const mergedAturan = mergeAturanOperasional(
      row.aturan_operasional ?? localExt?.aturan_operasional
    );
    setSkema(mergedAturan.pendaftaran);
    setDaftarKamar(mergedAturan.daftar_kamar.filter((k) => k !== 'NDALEM'));
    setPengaturan({
      nama_pesantren: String(row.nama_pesantren || DEFAULT_PENGATURAN_FORM.nama_pesantren),
      alamat_lengkap: String(row.alamat_lengkap || DEFAULT_PENGATURAN_FORM.alamat_lengkap),
      no_telepon: String(row.no_telepon || DEFAULT_PENGATURAN_FORM.no_telepon),
      logo_url: String(row.logo_url || ''),
      stempel_url: String(row.stempel_url || ''),
      nama_bendahara: String(row.nama_bendahara || DEFAULT_PENGATURAN_FORM.nama_bendahara),
      ttd_bendahara_url: String(row.ttd_bendahara_url || ''),
    });

    if (pengurus?.nama_lengkap) {
      setPetugasNama(pengurus.nama_lengkap);
    } else if (authRes.data?.user) {
      const { data: prof } = await supabase
        .from('profiles')
        .select('nama_divisi, username')
        .eq('id', authRes.data.user.id)
        .maybeSingle();
      if (prof) {
        setPetugasNama(String(prof.nama_divisi || prof.username || 'Pengurus PSB'));
      }
    }

    setLoading(false);
  }, [pengurus]);

  useEffect(() => {
    const timer = setTimeout(() => {
      const d = new Date();
      const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
        d.getDate()
      ).padStart(2, '0')}`;
      setTodayIso(iso);
      setTglMasukAktual(iso);
      void loadAll();
    }, 0);
    return () => clearTimeout(timer);
  }, [loadAll]);

  const quotaUsed = useMemo(
    () => countVerifiedPsbQuota(records, santriList.length),
    [records, santriList.length]
  );
  const sisaKuota = Math.max(0, Number(skema.kuota_gratis_uang_pangkal || 100) - quotaUsed);

  const openDetailModal = (rec: PsbPendaftaranRecord) => {
    setSelected(rec);
    setEditKeringanan(Number(rec.nominal_keringanan || 0));
    setEditCatatanKeringanan(rec.catatan_keringanan || '');
    setEditCatatanPengurus(rec.catatan_pengurus || '');
    setDpVerifNominal(Number(rec.dp_nominal || 500000));
    setDpVerifMetode(rec.metode_dp === 'tunai' ? 'tunai' : 'transfer');
    const totalPaid = Number(rec.dp_terbayar || 0) + Number(rec.pelunasan_terbayar || 0);
    const sisa = Math.max(0, Number(rec.total_biaya_akhir || 0) - totalPaid);
    setPelunasanNominal(sisa);
    setPelunasanMetode('tunai');
    setPelunasanBuktiFile(null);
    setPelunasanBuktiPreview('');

    const defaultRoom = rec.kamar_rencana || 'Menunggu Penempatan';
    setSelectedKamar(defaultRoom);
    const defaultTahunPsb = Number(rec.tahun_psb || skema.tahun_psb || 2027);
    setTglMasukAktual(`${defaultTahunPsb}-07-01`);
  };

  const filteredRecords = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return records.filter((r) => {
      if (filterStatus !== 'semua' && r.status !== filterStatus) return false;
      if (filterPaket !== 'semua' && r.paket !== filterPaket) return false;
      if (!q) return true;
      return (
        r.nama_lengkap.toLowerCase().includes(q) ||
        r.no_registrasi.toLowerCase().includes(q) ||
        r.no_wa_wali.toLowerCase().includes(q) ||
        r.nama_wali.toLowerCase().includes(q) ||
        (r.desa || '').toLowerCase().includes(q)
      );
    });
  }, [records, filterStatus, filterPaket, searchQuery]);

  const eligibleBulkRecords = useMemo(
    () =>
      filteredRecords.filter(
        (r) => r.status === 'dp_terverifikasi' || r.status === 'lunas_menunggu_kedatangan'
      ),
    [filteredRecords]
  );

  const selectedEligibleRecords = useMemo(
    () =>
      records.filter(
        (r) =>
          selectedIds.includes(r.id) &&
          (r.status === 'dp_terverifikasi' || r.status === 'lunas_menunggu_kedatangan')
      ),
    [records, selectedIds]
  );

  const counts = useMemo(
    () => ({
      total: records.length,
      menunggu: records.filter((r) => r.status === 'menunggu_verifikasi').length,
      terverifikasi: records.filter(
        (r) => r.status === 'dp_terverifikasi' || r.status === 'lunas_menunggu_kedatangan'
      ).length,
      aktif: records.filter((r) => r.status === 'diterima_aktif').length,
    }),
    [records]
  );

  const copyPublicUrl = (path: string, label: string) => {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    navigator.clipboard?.writeText(`${origin}${path}`);
    showToast('success', `Tautan ${label} berhasil disalin!`);
  };

  // TAHAP 2: Verifikasi DP, Kunci Kuota Promo, & Masuk Dompet Pendaftaran
  const handleVerifikasiDp = async () => {
    if (!canEdit || !selected) return;
    setSavingAction(true);

    const billing = calculatePsbBilling({
      paket: selected.paket,
      jumlahPendaftarTerhitung: quotaUsed,
      skema,
      nominalKeringanan: editKeringanan,
      dpTerbayar: dpVerifNominal,
      pelunasanTerbayar: 0,
    });

    const noKuitansiDp =
      selected.no_kuitansi_dp ||
      `KWT-PSBDP-${todayIso.replace(/-/g, '').slice(2)}-${selected.no_registrasi.slice(-3)}`;

    const nextStatus: PsbStatus = billing.sudahLunas
      ? 'lunas_menunggu_kedatangan'
      : 'dp_terverifikasi';

    const updated: PsbPendaftaranRecord = {
      ...selected,
      status: nextStatus,
      metode_dp: dpVerifMetode,
      dapat_promo_pangkal: billing.rincian.isFreeUangPangkal,
      total_biaya_awal: billing.totalBiayaAwal,
      nominal_keringanan: billing.nominalKeringanan,
      catatan_keringanan: editCatatanKeringanan.trim(),
      total_biaya_akhir: billing.totalBiayaAkhir,
      dp_terbayar: Number(dpVerifNominal || 0),
      tgl_verifikasi_dp: new Date().toISOString(),
      verifikator_dp: petugasNama,
      tgl_lunas: billing.sudahLunas ? new Date().toISOString() : null,
      no_kuitansi_dp: noKuitansiDp,
      catatan_pengurus: editCatatanPengurus.trim(),
      updated_at: new Date().toISOString(),
    };

    // Catat ke Keuangan (Transfer -> Pemasukan Transfer, Tunai -> Dompet Pendaftaran) beserta lampiran bukti DP
    if (Number(dpVerifNominal) > 0) {
      await insertKeuanganTransaksiResilient(
        [
          {
            dompet: 'pendaftaran',
            tipe: 'masuk',
            kategori: `PSB Online DP (${selected.paket.toUpperCase()})`,
            nominal: Number(dpVerifNominal),
            keterangan: `DP PSB ${selected.no_registrasi} - ${selected.nama_lengkap} (${selected.nama_wali})`,
            metode_pembayaran: dpVerifMetode,
            tgl_transaksi: todayIso,
            no_kuitansi: noKuitansiDp,
          },
        ],
        selected.bukti_dp_url || undefined
      );
    }

    const { record } = await savePsbRecord(updated);
    setRecords((prev) => prev.map((r) => (r.id === record.id ? record : r)));
    setSelected(record);
    setPelunasanNominal(billing.sisaTagihan);
    setSavingAction(false);
    showToast(
      'success',
      dpVerifMetode === 'transfer'
        ? `DP ${record.no_registrasi} terverifikasi & masuk laporan Pemasukan Transfer!`
        : `DP ${record.no_registrasi} terverifikasi & masuk Dompet Pendaftaran (Tunai)!`
    );
  };

  // Penyesuaian Keringanan Sebelum Pelunasan
  const handleSimpanKeringanan = async () => {
    if (!canEdit || !selected) return;
    setSavingAction(true);
    const billing = calculatePsbBilling({
      paket: selected.paket,
      jumlahPendaftarTerhitung: quotaUsed,
      skema,
      forceFreeUangPangkal: selected.dapat_promo_pangkal,
      nominalKeringanan: editKeringanan,
      dpTerbayar: selected.dp_terbayar,
      pelunasanTerbayar: selected.pelunasan_terbayar,
    });

    const updated: PsbPendaftaranRecord = {
      ...selected,
      nominal_keringanan: billing.nominalKeringanan,
      catatan_keringanan: editCatatanKeringanan.trim(),
      total_biaya_akhir: billing.totalBiayaAkhir,
      catatan_pengurus: editCatatanPengurus.trim(),
      status:
        billing.sudahLunas && selected.status === 'dp_terverifikasi'
          ? 'lunas_menunggu_kedatangan'
          : selected.status,
      updated_at: new Date().toISOString(),
    };

    const { record } = await savePsbRecord(updated);
    setRecords((prev) => prev.map((r) => (r.id === record.id ? record : r)));
    setSelected(record);
    setPelunasanNominal(billing.sisaTagihan);
    setSavingAction(false);
    showToast('success', 'Nominal keringanan & catatan pengurus diperbarui.');
  };

  // TAHAP 3: Catat Pelunasan Saat Sowan / Kedatangan
  const handleCatatPelunasan = async () => {
    if (!canEdit || !selected) return;
    const bayar = Math.max(0, Number(pelunasanNominal || 0));
    if (bayar <= 0) {
      showToast('error', 'Nominal pelunasan harus lebih dari Rp0.');
      return;
    }
    setSavingAction(true);

    const newPelunasanTotal = Number(selected.pelunasan_terbayar || 0) + bayar;
    const billing = calculatePsbBilling({
      paket: selected.paket,
      jumlahPendaftarTerhitung: quotaUsed,
      skema,
      forceFreeUangPangkal: selected.dapat_promo_pangkal,
      nominalKeringanan: editKeringanan,
      dpTerbayar: selected.dp_terbayar,
      pelunasanTerbayar: newPelunasanTotal,
    });

    const noKuitansiLunas = `KWT-PSBLNS-${todayIso.replace(/-/g, '').slice(2)}-${selected.no_registrasi.slice(-3)}`;
    const walletSplit = splitPelunasanForWallets({
      paket: selected.paket,
      totalSudahDibayarSebelumnya: Number(selected.dp_terbayar || 0) + Number(selected.pelunasan_terbayar || 0),
      bayarSekarang: bayar,
      skema,
    });

    const kasPayloads: Array<Record<string, unknown>> = [];
    if (walletSplit.keDompetPendaftaran > 0) {
      kasPayloads.push({
        ...(selected.santri_id ? { santri_id: selected.santri_id } : {}),
        dompet: 'pendaftaran',
        tipe: 'masuk',
        kategori: `Pelunasan PSB (${selected.paket.toUpperCase()})`,
        nominal: walletSplit.keDompetPendaftaran,
        keterangan: `Pelunasan PSB ${selected.no_registrasi} - ${selected.nama_lengkap}`,
        metode_pembayaran: pelunasanMetode,
        tgl_transaksi: todayIso,
        no_kuitansi: noKuitansiLunas,
      });
    }
    if (walletSplit.keDompetOperasionalSyahriyah > 0) {
      const periodeBulanPertama = (tglMasukAktual || todayIso).slice(0, 7);
      kasPayloads.push({
        ...(selected.santri_id ? { santri_id: selected.santri_id } : {}),
        dompet: 'operasional',
        tipe: 'masuk',
        kategori: 'Syahriyah & Iuran Santri',
        nominal: walletSplit.keDompetOperasionalSyahriyah,
        bulan_tagihan: `Syahriyah Bulan Pertama (${periodeBulanPertama})`,
        keterangan: `Syahriyah Bulan Pertama PSB ${selected.no_registrasi} - ${selected.nama_lengkap}`,
        metode_pembayaran: pelunasanMetode,
        tgl_transaksi: todayIso,
        no_kuitansi: noKuitansiLunas,
      });
    }
    let uploadedBuktiPelunasan = '';
    if (pelunasanMetode === 'transfer' && pelunasanBuktiFile) {
      uploadedBuktiPelunasan = await uploadKeuanganLampiranImage(pelunasanBuktiFile, 'bukti_tf');
    }

    if (kasPayloads.length > 0) {
      await insertKeuanganTransaksiResilient(
        kasPayloads,
        uploadedBuktiPelunasan || undefined
      );
    }

    const updated: PsbPendaftaranRecord = {
      ...selected,
      pelunasan_terbayar: newPelunasanTotal,
      nominal_keringanan: billing.nominalKeringanan,
      catatan_keringanan: editCatatanKeringanan.trim(),
      total_biaya_akhir: billing.totalBiayaAkhir,
      status: billing.sudahLunas ? 'lunas_menunggu_kedatangan' : selected.status,
      tgl_lunas: billing.sudahLunas ? new Date().toISOString() : selected.tgl_lunas,
      no_kuitansi_lunas: noKuitansiLunas,
      catatan_pengurus: editCatatanPengurus.trim(),
      updated_at: new Date().toISOString(),
    };

    const { record } = await savePsbRecord(updated);
    setRecords((prev) => prev.map((r) => (r.id === record.id ? record : r)));
    setSelected(record);
    setPelunasanNominal(billing.sisaTagihan);
    setPelunasanBuktiFile(null);
    setPelunasanBuktiPreview('');
    setSavingAction(false);
    showToast(
      'success',
      pelunasanMetode === 'transfer'
        ? 'Pelunasan transfer dicatat ke laporan Pemasukan Transfer!'
        : 'Pembayaran pelunasan tunai berhasil dicatat ke Dompet Keuangan!'
    );
  };

  // Helper aktivasi tunggal & massal ke tabel santri
  const activateSinglePsbRecord = async (params: {
    rec: PsbPendaftaranRecord;
    kamar: string;
    tglMasuk: string;
    workingSantri: Array<{ id: string; nis?: string | null }>;
  }): Promise<{ ok: boolean; errorMsg?: string; updatedRecord?: PsbPendaftaranRecord; newSantriEntry?: { id: string; nis: string } }> => {
    const { rec, kamar, tglMasuk, workingSantri } = params;
    const assignedNis = generateNextNisForYear(tglMasuk, workingSantri, 1);
    const isVipRoom =
      rec.paket === 'vip' || kamar.toUpperCase().includes('VIP');
    const tarifSyahriyah = isVipRoom
      ? Number(skema.syahriyah_vip || 500000)
      : Number(skema.syahriyah_reguler || 450000);

    const { data: newSantri, error: santriErr } = await supabase
      .from('santri')
      .insert([
        {
          nis: assignedNis,
          tgl_masuk: tglMasuk,
          nama_lengkap: rec.nama_lengkap,
          kamar,
          tarif_syahriyah: tarifSyahriyah,
          paket_pendaftaran: rec.paket,
          nominal_pendaftaran: rec.total_biaya_akhir,
          catatan_keringanan: rec.catatan_keringanan || '',
          status: 'aktif',
          jk: rec.jk,
          tempat_lahir: rec.tempat_lahir || null,
          tgl_lahir: rec.tgl_lahir || null,
          nama_ayah: rec.nama_ayah || rec.nama_wali,
          nama_ibu: rec.nama_ibu || null,
          no_wa_ayah: rec.no_wa_wali,
          nama_wali: rec.nama_wali,
          no_wa_wali: rec.no_wa_wali,
          alamat_jalan: rec.alamat_jalan || null,
          desa: rec.desa || null,
          kecamatan: rec.kecamatan || null,
          kabupaten: rec.kabupaten || null,
          provinsi: rec.provinsi || null,
          kode_pos: rec.kode_pos || null,
          unit_asrama: 'Induk Putra',
        },
      ])
      .select()
      .single();

    if (santriErr || !newSantri) {
      return { ok: false, errorMsg: santriErr?.message || 'Error DB saat menerbitkan santri.' };
    }

    const santriId = String((newSantri as { id: string }).id);
    const kuitansiRef = rec.no_kuitansi_lunas || rec.no_kuitansi_dp || `KWT-PSB-${assignedNis}`;

    if (rec.no_kuitansi_dp) {
      await supabase
        .from('keuangan_transaksi')
        .update({ santri_id: santriId })
        .eq('no_kuitansi', rec.no_kuitansi_dp);
    }
    if (rec.no_kuitansi_lunas) {
      await supabase
        .from('keuangan_transaksi')
        .update({ santri_id: santriId })
        .eq('no_kuitansi', rec.no_kuitansi_lunas);
    }

    // Catat rincian Syahriyah bulan pertama pada matriks hanya bila pembayaran total sudah menutup porsi Syahriyah Bulan 1
    const billing = calculatePsbBilling({
      paket: rec.paket,
      jumlahPendaftarTerhitung: quotaUsed,
      skema,
      forceFreeUangPangkal: rec.dapat_promo_pangkal,
      nominalKeringanan: rec.nominal_keringanan,
      dpTerbayar: rec.dp_terbayar,
      pelunasanTerbayar: rec.pelunasan_terbayar,
    });
    const totalPaid = Number(rec.dp_terbayar || 0) + Number(rec.pelunasan_terbayar || 0);
    const thresholdSyahriyahLunas =
      billing.rincian.nominalDompetPendaftaran + billing.rincian.nominalSyahriyahBulanPertama;

    if (totalPaid >= thresholdSyahriyahLunas && billing.rincian.nominalSyahriyahBulanPertama > 0) {
      const periodeBulan = tglMasuk.slice(0, 7);
      await supabase.from('pembayaran_santri_detail').insert([
        {
          santri_id: santriId,
          tahun_ajaran: getTahunAjaranForDate(tglMasuk),
          item_kode: 'syahriyah',
          periode_bulan: periodeBulan,
          label_item: `Syahriyah Bulan Pertama (${periodeBulan})`,
          dompet: 'operasional',
          nominal: tarifSyahriyah,
          is_migrasi: false,
          no_kuitansi: kuitansiRef,
          metode_pembayaran: rec.metode_dp === 'tunai' ? 'tunai' : 'transfer',
          tgl_bayar: todayIso,
          petugas_nama: petugasNama,
        },
      ]);
    }

    const updated: PsbPendaftaranRecord = {
      ...rec,
      status: 'diterima_aktif',
      kamar_rencana: kamar,
      rencana_tgl_masuk: tglMasuk,
      santri_id: santriId,
      nis_terbit: assignedNis,
      updated_at: new Date().toISOString(),
    };

    const { record } = await savePsbRecord(updated);
    return {
      ok: true,
      updatedRecord: record,
      newSantriEntry: { id: santriId, nis: assignedNis },
    };
  };

  // TAHAP 3: Aktifkan Jadi Santri (Setelah DP Verified — tidak harus lunas dulu)
  const handleResmikanSantri = async () => {
    if (!canEdit || !selected) return;
    const roomFinal = selectedKamar.trim() || 'Menunggu Penempatan';
    const defaultTahunPsb = Number(selected.tahun_psb || skema.tahun_psb || 2027);
    const tglMasuk = tglMasukAktual || `${defaultTahunPsb}-07-01`;

    setSavingAction(true);
    const res = await activateSinglePsbRecord({
      rec: selected,
      kamar: roomFinal,
      tglMasuk,
      workingSantri: santriList,
    });
    setSavingAction(false);

    if (!res.ok || !res.updatedRecord || !res.newSantriEntry) {
      showToast('error', 'Gagal menerbitkan data santri: ' + (res.errorMsg || 'Error DB'));
      return;
    }

    const record = res.updatedRecord;
    const newEntry = res.newSantriEntry;
    setRecords((prev) => prev.map((r) => (r.id === record.id ? record : r)));
    setSantriList((prev) => [...prev, newEntry]);
    setSelectedIds((prev) => prev.filter((id) => id !== record.id));
    setSelected(record);
    showToast(
      'success',
      `${record.nama_lengkap} resmi menjadi Santri Aktif (NIS ${record.nis_terbit} · Kamar: ${roomFinal})!`
    );
  };

  // Centang Massal -> Aktifkan Massal (Menunggu Penempatan + NIS 27XXXX berurutan)
  const handleBulkAktifkanMassal = async () => {
    if (!canEdit || selectedEligibleRecords.length === 0) return;
    setBulkActivating(true);
    const workingSantri = [...santriList];
    const updatedMap = new Map<string, PsbPendaftaranRecord>();
    const newlyCreatedSantri: Array<{ id: string; nis: string }> = [];
    let successCount = 0;
    let firstError = '';

    for (const rec of selectedEligibleRecords) {
      const tahunPsb = Number(rec.tahun_psb || skema.tahun_psb || 2027);
      const tglMasuk = `${tahunPsb}-07-01`;
      const res = await activateSinglePsbRecord({
        rec,
        kamar: rec.kamar_rencana || 'Menunggu Penempatan',
        tglMasuk,
        workingSantri,
      });
      if (res.ok && res.updatedRecord && res.newSantriEntry) {
        workingSantri.push(res.newSantriEntry);
        newlyCreatedSantri.push(res.newSantriEntry);
        updatedMap.set(res.updatedRecord.id, res.updatedRecord);
        successCount += 1;
      } else if (!firstError) {
        firstError = res.errorMsg || 'Sebagian data gagal diaktifkan.';
      }
    }

    if (updatedMap.size > 0) {
      setRecords((prev) => prev.map((r) => updatedMap.get(r.id) || r));
      setSantriList((prev) => [...prev, ...newlyCreatedSantri]);
    }
    setSelectedIds([]);
    setBulkActivating(false);

    if (successCount > 0) {
      showToast(
        'success',
        `${successCount} santri berhasil diaktifkan massal (Kamar: Menunggu Penempatan). Atur kamar & lengkapi EMIS di Data Santri.`
      );
    } else {
      showToast('error', `Gagal mengaktifkan massal: ${firstError}`);
    }
  };

  const toggleSelectId = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const toggleSelectAllEligible = () => {
    const eligibleIds = eligibleBulkRecords.map((r) => r.id);
    if (eligibleIds.length === 0) return;
    const allSelected = eligibleIds.every((id) => selectedIds.includes(id));
    if (allSelected) {
      setSelectedIds((prev) => prev.filter((id) => !eligibleIds.includes(id)));
    } else {
      setSelectedIds((prev) => Array.from(new Set([...prev, ...eligibleIds])));
    }
  };

  const handleTolak = async (alasanOverride?: string) => {
    if (!canEdit || !selected) return;
    setSavingAction(true);
    const reasonText =
      (alasanOverride || editCatatanPengurus).trim() ||
      'Bukti transfer tidak valid / belum ditemukan di mutasi rekening.';
    const updated: PsbPendaftaranRecord = {
      ...selected,
      status: 'ditolak',
      catatan_pengurus: reasonText,
      updated_at: new Date().toISOString(),
    };
    const { record } = await savePsbRecord(updated);
    setRecords((prev) => prev.map((r) => (r.id === record.id ? record : r)));
    setSelected(record);
    setEditCatatanPengurus(reasonText);
    setSavingAction(false);
    showToast('success', 'Pendaftaran ditolak. Alasan penolakan tampil ke wali di halaman /cek-daftar.');
  };

  const handleDeleteRecord = async (id: string) => {
    if (!canEdit) return;
    await deletePsbRecord(id);
    setRecords((prev) => prev.filter((r) => r.id !== id));
    setConfirmDeleteId(null);
    if (selected?.id === id) setSelected(null);
    showToast('success', 'Data antrean PSB dihapus.');
  };

  return (
    <div className="space-y-5 max-w-6xl mx-auto pb-24">
      {toast && (
        <div
          className={`fixed top-5 right-5 z-50 px-4 py-3 rounded-xl shadow-lg text-xs font-bold flex items-center gap-2 border ${
            toast.type === 'success'
              ? 'bg-emerald-900 text-white border-emerald-700'
              : 'bg-rose-600 text-white border-rose-700'
          }`}
        >
          {toast.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 shrink-0" />
          )}
          <span>{toast.msg}</span>
        </div>
      )}

      {/* HEADER */}
      <header className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-emerald-700">
            <UserPlus className="w-3.5 h-3.5" />
            Penerimaan Santri Baru (PSB) · TA {skema.tahun_ajaran_psb || '2027/2028'}
          </span>
          <h1 className="text-xl font-extrabold text-slate-900 mt-0.5">
            Antrean Pendaftaran Online &amp; Verifikasi DP
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Verifikasi bukti transfer DP (tolak bila bukti tidak valid), lalu centang massal pendaftar terverifikasi untuk aktif menjadi Santri.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => copyPublicUrl('/daftar', 'Formulir /daftar')}
            className="min-h-[38px] px-3 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
          >
            <ClipboardCopy className="w-3.5 h-3.5" />
            Salin Link /daftar
          </button>
          <a
            href="/daftar"
            target="_blank"
            rel="noopener noreferrer"
            className="min-h-[38px] px-3 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold inline-flex items-center gap-1.5"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            Buka /daftar
          </a>
          <button
            type="button"
            onClick={() => copyPublicUrl('/cek-daftar', 'Cek Status /cek-daftar')}
            className="min-h-[38px] px-3 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
          >
            <ClipboardCopy className="w-3.5 h-3.5" />
            Link /cek-daftar
          </button>
          <button
            type="button"
            onClick={() => void loadAll()}
            aria-label="Muat ulang data PSB"
            className="min-h-[38px] px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Muat Ulang
          </button>
        </div>
      </header>

      <TransparencyBanner moduleLabel="Pendaftaran Santri Baru (PSB)" isReadOnly={!canEdit} />

      {/* INFO JIKA TABEL psb_pendaftaran BELUM DIBUAT DI SUPABASE */}
      {tableMissing && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-xs text-amber-950 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-2.5">
            <Database className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold block">
                Tabel <code className="font-mono">psb_pendaftaran</code> belum ada di Supabase (sementara aktif mode lokal).
              </span>
              <span className="text-[11px] text-amber-800">
                Salin SQL tabel PSB ini dan jalankan di Supabase SQL Editor agar formulir wali &amp; pengurus sinkron online.
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              navigator.clipboard?.writeText(PSB_TABLE_SQL);
              showToast('success', 'SQL tabel psb_pendaftaran disalin ke clipboard!');
            }}
            className="min-h-[36px] px-3 py-1.5 bg-white hover:bg-amber-100 border border-amber-300 rounded-lg text-[11px] font-bold text-amber-900 whitespace-nowrap shrink-0 cursor-pointer"
          >
            Salin SQL Tabel PSB
          </button>
        </div>
      )}

      {/* 4 KPI RINGKAS */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white border border-slate-200 rounded-2xl p-4">
          <p className="text-[11px] font-semibold text-slate-500">Total Antrean Online</p>
          <p className="text-xl sm:text-2xl font-black text-slate-900 tabular-nums mt-1">
            {counts.total}
          </p>
        </div>
        <div className="bg-white border border-amber-200 rounded-2xl p-4">
          <p className="text-[11px] font-semibold text-amber-800">Menunggu Verifikasi DP</p>
          <p className="text-xl sm:text-2xl font-black text-amber-900 tabular-nums mt-1">
            {counts.menunggu}
          </p>
        </div>
        <div className="bg-white border border-sky-200 rounded-2xl p-4">
          <p className="text-[11px] font-semibold text-sky-800">DP Verified / Siap Masuk</p>
          <p className="text-xl sm:text-2xl font-black text-sky-900 tabular-nums mt-1">
            {counts.terverifikasi}
          </p>
        </div>
        <div className="bg-emerald-50/70 border border-emerald-200 rounded-2xl p-4">
          <p className="text-[11px] font-semibold text-emerald-800 flex items-center gap-1">
            <Sparkles className="w-3.5 h-3.5" />
            Sisa Kuota Free Pangkal (100)
          </p>
          <p className="text-xl sm:text-2xl font-black text-emerald-900 tabular-nums mt-1">
            {sisaKuota} / {skema.kuota_gratis_uang_pangkal}
          </p>
        </div>
      </div>

      {/* FILTER BAR */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-col md:flex-row gap-3 justify-between">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Cari nama calon santri, no. registrasi, no. WA wali, atau desa..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm"
          />
        </div>

        <div className="flex flex-wrap gap-2 text-xs">
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as 'semua' | PsbStatus)}
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-semibold"
          >
            <option value="semua">Semua Status</option>
            <option value="menunggu_verifikasi">Menunggu Verifikasi DP</option>
            <option value="dp_terverifikasi">DP Terverifikasi</option>
            <option value="lunas_menunggu_kedatangan">Lunas · Siap Sowan</option>
            <option value="diterima_aktif">Resmi Santri Aktif</option>
            <option value="ditolak">Ditolak</option>
          </select>

          <select
            value={filterPaket}
            onChange={(e) => setFilterPaket(e.target.value as 'semua' | 'reguler' | 'vip')}
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-semibold"
          >
            <option value="semua">Semua Paket</option>
            <option value="reguler">Reguler</option>
            <option value="vip">VIP (Al-Fachriyah)</option>
          </select>
        </div>
      </div>

      {/* BULK ACTION BAR CENTANG MASSAL */}
      {canEdit && (eligibleBulkRecords.length > 0 || selectedEligibleRecords.length > 0) && (
        <div className="bg-emerald-950 text-white border border-emerald-800 rounded-2xl p-3.5 sm:px-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={toggleSelectAllEligible}
              className="min-h-[36px] px-3 py-1.5 bg-emerald-800 hover:bg-emerald-700 text-white font-bold rounded-xl cursor-pointer whitespace-nowrap"
            >
              {eligibleBulkRecords.length > 0 &&
              eligibleBulkRecords.every((r) => selectedIds.includes(r.id))
                ? 'Batalkan Semua Centang'
                : `Pilih Semua DP Terverifikasi (${eligibleBulkRecords.length})`}
            </button>
            <span className="text-emerald-100">
              Terpilih: <strong className="font-mono">{selectedEligibleRecords.length}</strong> calon santri terverifikasi DP (otomatis masuk kamar{' '}
              <strong>Menunggu Penempatan</strong> &amp; NIS {String(skema.tahun_psb || 2027).slice(-2)}XXXX)
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {selectedEligibleRecords.length > 0 && (
              <>
                <button
                  type="button"
                  onClick={() => setSelectedIds([])}
                  className="min-h-[36px] px-3 py-1.5 bg-emerald-900 hover:bg-emerald-800 text-emerald-200 font-semibold rounded-xl cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="button"
                  disabled={bulkActivating}
                  onClick={handleBulkAktifkanMassal}
                  className="min-h-[38px] px-4 py-1.5 bg-white hover:bg-emerald-50 text-emerald-950 font-extrabold rounded-xl inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap disabled:opacity-60"
                >
                  <UserCheck className="w-4 h-4 text-emerald-700" />
                  {bulkActivating
                    ? 'Mengaktifkan...'
                    : `Aktifkan Massal (${selectedEligibleRecords.length}) Jadi Santri`}
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* DAFTAR ANTREAN (MOBILE CARDS + DESKTOP TABLE) */}
      {filteredRecords.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center space-y-2">
          <UserPlus className="w-8 h-8 text-slate-300 mx-auto" />
          <p className="text-sm font-bold text-slate-800">Belum Ada Antrean Pendaftaran</p>
          <p className="text-xs text-slate-500">
            Bagikan tautan <code className="font-mono font-bold text-emerald-700">/daftar</code> ke calon wali santri untuk mulai menerima pendaftaran online.
          </p>
        </div>
      ) : (
        <>
          {/* Mobile Cards */}
          <div className="grid grid-cols-1 gap-3 lg:hidden">
            {filteredRecords.map((rec) => {
              const meta = PSB_STATUS_META[rec.status];
              const paid = Number(rec.dp_terbayar || 0) + Number(rec.pelunasan_terbayar || 0);
              const sisa = Math.max(0, Number(rec.total_biaya_akhir || 0) - paid);
              const canBulkCheck =
                rec.status === 'dp_terverifikasi' || rec.status === 'lunas_menunggu_kedatangan';
              const checked = selectedIds.includes(rec.id);
              return (
                <div
                  key={rec.id}
                  className={`bg-white border rounded-2xl p-4 space-y-3 shadow-xs ${
                    checked ? 'border-emerald-600 ring-1 ring-emerald-600' : 'border-slate-200'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2.5 min-w-0">
                      {canEdit && canBulkCheck && (
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleSelectId(rec.id)}
                          aria-label={`Pilih ${rec.nama_lengkap} untuk aktivasi massal`}
                          className="mt-1 w-4 h-4 accent-emerald-700 rounded cursor-pointer shrink-0"
                        />
                      )}
                      <div className="min-w-0">
                        <span className="font-mono text-[11px] font-bold text-emerald-700">
                          {rec.no_registrasi}
                        </span>
                        <h3 className="text-sm font-extrabold text-slate-900">{rec.nama_lengkap}</h3>
                        <p className="text-[11px] text-slate-500">
                          Wali: {rec.nama_wali} · {rec.no_wa_wali}
                        </p>
                      </div>
                    </div>
                    <span className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border shrink-0 ${meta.badgeClass}`}>
                      {meta.shortLabel}
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-2 bg-slate-50 rounded-xl p-2.5 text-[11px]">
                    <div>
                      <span className="text-slate-500 block">Paket</span>
                      <span className="font-bold uppercase">{rec.paket}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block">DP Diajukan</span>
                      <span className="font-mono font-bold tabular-nums">{formatRupiah(rec.dp_nominal)}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block">Sisa Tagihan</span>
                      <span className="font-mono font-bold text-amber-800 tabular-nums">{formatRupiah(sisa)}</span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => openDetailModal(rec)}
                    className="w-full min-h-[40px] px-3 py-2 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold rounded-xl inline-flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Eye className="w-4 h-4" />
                    Periksa &amp; Proses Pendaftar
                  </button>
                </div>
              );
            })}
          </div>

          {/* Desktop Table */}
          <div className="hidden lg:block bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                  <tr>
                    <th className="pl-4 pr-2 py-3 w-10">
                      {canEdit && (
                        <input
                          type="checkbox"
                          disabled={eligibleBulkRecords.length === 0}
                          checked={
                            eligibleBulkRecords.length > 0 &&
                            eligibleBulkRecords.every((r) => selectedIds.includes(r.id))
                          }
                          onChange={toggleSelectAllEligible}
                          aria-label="Pilih semua calon santri terverifikasi DP"
                          className="w-4 h-4 accent-emerald-700 rounded cursor-pointer disabled:opacity-40"
                        />
                      )}
                    </th>
                    <th className="px-4 py-3 font-bold">No. Reg &amp; Calon Santri</th>
                    <th className="px-4 py-3 font-bold">Wali &amp; Asal</th>
                    <th className="px-4 py-3 font-bold">Paket</th>
                    <th className="px-4 py-3 font-bold text-right">Biaya Akhir</th>
                    <th className="px-4 py-3 font-bold text-right">Sudah Masuk</th>
                    <th className="px-4 py-3 font-bold text-right">Sisa</th>
                    <th className="px-4 py-3 font-bold">Status</th>
                    <th className="px-4 py-3 font-bold text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredRecords.map((rec) => {
                    const meta = PSB_STATUS_META[rec.status];
                    const paid = Number(rec.dp_terbayar || 0) + Number(rec.pelunasan_terbayar || 0);
                    const sisa = Math.max(0, Number(rec.total_biaya_akhir || 0) - paid);
                    const canBulkCheck =
                      rec.status === 'dp_terverifikasi' || rec.status === 'lunas_menunggu_kedatangan';
                    const checked = selectedIds.includes(rec.id);
                    return (
                      <tr key={rec.id} className={checked ? 'bg-emerald-50/60' : 'hover:bg-slate-50/70'}>
                        <td className="pl-4 pr-2 py-3">
                          {canEdit && canBulkCheck ? (
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleSelectId(rec.id)}
                              aria-label={`Pilih ${rec.nama_lengkap}`}
                              className="w-4 h-4 accent-emerald-700 rounded cursor-pointer"
                            />
                          ) : (
                            <span className="text-slate-300">-</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span className="font-mono text-[11px] font-bold text-emerald-700 block">
                            {rec.no_registrasi}
                          </span>
                          <span className="font-bold text-slate-900">{rec.nama_lengkap}</span>
                          {rec.nis_terbit && (
                            <span className="text-[11px] text-slate-500 block">
                              NIS: {rec.nis_terbit} · Kamar {rec.kamar_rencana || 'Menunggu Penempatan'}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span className="font-semibold text-slate-800 block">{rec.nama_wali}</span>
                          <span className="text-[11px] font-mono text-slate-500 block">
                            {rec.no_wa_wali}
                          </span>
                          <span className="text-[11px] text-slate-500">
                            {rec.desa}, {rec.kabupaten}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`px-2 py-0.5 rounded text-[11px] font-bold uppercase ${
                              rec.paket === 'vip'
                                ? 'bg-indigo-50 text-indigo-800'
                                : 'bg-slate-100 text-slate-800'
                            }`}
                          >
                            {rec.paket}
                          </span>
                          {rec.dapat_promo_pangkal && (
                            <span className="block text-[10px] font-semibold text-emerald-700 mt-0.5">
                              Free Pangkal
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right font-mono font-bold tabular-nums">
                          {formatRupiah(rec.total_biaya_akhir)}
                        </td>
                        <td className="px-4 py-3 text-right font-mono font-bold text-emerald-700 tabular-nums">
                          {formatRupiah(paid)}
                        </td>
                        <td className="px-4 py-3 text-right font-mono font-bold text-amber-800 tabular-nums">
                          {formatRupiah(sisa)}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-block px-2.5 py-1 rounded-lg text-[11px] font-bold border ${meta.badgeClass}`}
                          >
                            {meta.shortLabel}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            type="button"
                            onClick={() => openDetailModal(rec)}
                            className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold rounded-lg inline-flex items-center gap-1 cursor-pointer"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            Proses
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* MODAL DETAIL & PROSES 4 TAHAP PSB */}
      {selected && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl max-w-3xl w-full max-h-[92vh] flex flex-col overflow-hidden shadow-2xl border border-slate-200">
            <div className="bg-emerald-950 text-white px-5 py-4 flex items-center justify-between gap-3">
              <div>
                <p className="font-mono text-xs text-emerald-300 font-bold">
                  {selected.no_registrasi} · {PSB_STATUS_META[selected.status].label}
                </p>
                <h2 className="text-base sm:text-lg font-extrabold">{selected.nama_lengkap}</h2>
              </div>
              <button
                type="button"
                onClick={() => setSelected(null)}
                aria-label="Tutup detail pendaftaran"
                className="p-1.5 text-emerald-200 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-5 text-xs">
              {/* Data Pendaftar & Bukti DP */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="border border-slate-200 rounded-xl p-3.5 space-y-1.5">
                  <p className="font-bold text-slate-900 mb-1">Data Calon Santri &amp; Wali</p>
                  <p>
                    <span className="text-slate-500">Wali:</span>{' '}
                    <strong>{selected.nama_wali}</strong> ({selected.no_wa_wali})
                  </p>
                  <p>
                    <span className="text-slate-500">Jenjang / JK:</span> {selected.jenjang_pendidikan} ·{' '}
                    {selected.jk === 'P' ? 'Putri' : 'Putra'}
                  </p>
                  <p>
                    <span className="text-slate-500">Alamat:</span>{' '}
                    {[
                      selected.alamat_jalan,
                      selected.desa,
                      `Kec. ${selected.kecamatan}`,
                      selected.kabupaten,
                      selected.kode_pos,
                    ]
                      .filter(Boolean)
                      .join(', ')}
                  </p>
                  <p>
                    <span className="text-slate-500">Tanggal Pendaftaran:</span>{' '}
                    <strong>{(selected.created_at || todayIso).slice(0, 10)}</strong>
                  </p>
                  {selected.catatan_wali && (
                    <p className="text-amber-800 bg-amber-50 p-2 rounded-lg mt-1">
                      Catatan Wali: {selected.catatan_wali}
                    </p>
                  )}

                  <div className="pt-2 flex flex-wrap gap-2">
                    <a
                      href={`https://wa.me/${toWaMeDigits(selected.no_wa_wali)}?text=${encodeURIComponent(
                        `Assalamu'alaikum Bapak/Ibu ${selected.nama_wali}, kami dari Pengurus PSB ${pengaturan.nama_pesantren} menginformasikan pendaftaran ananda ${selected.nama_lengkap} (${selected.no_registrasi}).`
                      )}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-1.5 bg-emerald-700 text-white font-bold rounded-lg inline-flex items-center gap-1"
                    >
                      <MessageCircle className="w-3.5 h-3.5" />
                      Chat WA Wali
                    </a>
                    {selected.no_kuitansi_dp && (
                      <button
                        type="button"
                        onClick={() =>
                          setKuitansiPreview({
                            record: selected,
                            jenis: 'dp',
                            nomor: selected.no_kuitansi_dp,
                            nominal: selected.dp_terbayar,
                            metode: selected.metode_dp,
                            tanggal: (selected.tgl_verifikasi_dp || todayIso).slice(0, 10),
                          })
                        }
                        className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold rounded-lg inline-flex items-center gap-1 cursor-pointer"
                      >
                        <Printer className="w-3.5 h-3.5" />
                        Kuitansi DP
                      </button>
                    )}
                    {selected.no_kuitansi_lunas && (
                      <button
                        type="button"
                        onClick={() =>
                          setKuitansiPreview({
                            record: selected,
                            jenis: 'pelunasan',
                            nomor: selected.no_kuitansi_lunas,
                            nominal: selected.pelunasan_terbayar,
                            metode: 'tunai',
                            tanggal: (selected.tgl_lunas || todayIso).slice(0, 10),
                          })
                        }
                        className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold rounded-lg inline-flex items-center gap-1 cursor-pointer"
                      >
                        <Printer className="w-3.5 h-3.5" />
                        Kuitansi Lunas
                      </button>
                    )}
                  </div>
                </div>

                <div className="border border-slate-200 rounded-xl p-3.5 space-y-2">
                  <p className="font-bold text-slate-900">Bukti Transfer DP ({formatRupiah(selected.dp_nominal)})</p>
                  {selected.bukti_dp_url ? (
                    <a href={selected.bukti_dp_url} target="_blank" rel="noopener noreferrer" className="block">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={selected.bukti_dp_url}
                        alt="Bukti Transfer DP"
                        className="w-full max-h-48 object-contain rounded-lg border border-slate-200 bg-slate-50"
                        referrerPolicy="no-referrer"
                      />
                    </a>
                  ) : (
                    <div className="h-32 rounded-lg border border-dashed border-slate-200 flex items-center justify-center text-slate-400">
                      Tidak ada foto bukti DP
                    </div>
                  )}
                </div>
              </div>

              {/* Pengaturan Keringanan & Catatan Pengurus */}
              {canEdit && selected.status !== 'diterima_aktif' && (
                <div className="border border-slate-200 rounded-xl p-4 space-y-3 bg-slate-50/70">
                  <p className="font-bold text-slate-900">
                    Keringanan Biaya &amp; Catatan Pengurus (Khusus Sisi Pengurus)
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">
                        Nominal Keringanan (Rp)
                      </label>
                      <input
                        type="number"
                        min={0}
                        value={editKeringanan}
                        onChange={(e) => setEditKeringanan(Number(e.target.value))}
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg font-mono font-bold"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">
                        Alasan / Keterangan Keringanan
                      </label>
                      <input
                        type="text"
                        placeholder="Misal: Yatim / Beasiswa / Saudara Kandung"
                        value={editCatatanKeringanan}
                        onChange={(e) => setEditCatatanKeringanan(e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      Catatan Tampil ke Wali Santri (Opsional)
                    </label>
                    <input
                      type="text"
                      placeholder="Info jadwal sowan atau catatan perbaikan"
                      value={editCatatanPengurus}
                      onChange={(e) => setEditCatatanPengurus(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg"
                    />
                  </div>
                  {selected.status === 'dp_terverifikasi' && (
                    <div className="flex justify-end">
                      <button
                        type="button"
                        disabled={savingAction}
                        onClick={handleSimpanKeringanan}
                        className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white font-bold rounded-lg cursor-pointer"
                      >
                        Simpan Perubahan Keringanan
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* AKSI TAHAP 2: VERIFIKASI DP */}
              {canEdit && selected.status === 'menunggu_verifikasi' && (
                <div className="border-2 border-emerald-200 bg-emerald-50/50 rounded-xl p-4 space-y-3">
                  <p className="font-bold text-emerald-950 flex items-center gap-1.5">
                    <Wallet className="w-4 h-4 text-emerald-700" />
                    Tahap 2: Verifikasi DP &amp; Kunci Kuota Diskon 100 Pendaftar
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">
                        Nominal DP Diterima (Rp)
                      </label>
                      <input
                        type="number"
                        min={0}
                        value={dpVerifNominal}
                        onChange={(e) => setDpVerifNominal(Number(e.target.value))}
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg font-mono font-bold"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">
                        Metode Penerimaan
                      </label>
                      <select
                        value={dpVerifMetode}
                        onChange={(e) =>
                          setDpVerifMetode(e.target.value === 'tunai' ? 'tunai' : 'transfer')
                        }
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg font-semibold"
                      >
                        <option value="transfer">Transfer Bank (Pemasukan Transfer)</option>
                        <option value="tunai">Tunai di Kantor (Dompet Pendaftaran)</option>
                      </select>
                    </div>
                    <button
                      type="button"
                      disabled={savingAction}
                      onClick={handleVerifikasiDp}
                      className="min-h-[40px] px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white font-bold rounded-xl cursor-pointer whitespace-nowrap"
                    >
                      {savingAction ? 'Memproses...' : 'Verifikasi DP & Catat Kas'}
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-600">
                    {dpVerifMetode === 'transfer'
                      ? 'DP Transfer tercatat di laporan Pemasukan Transfer (tidak menambah saldo kas tunai Dompet).'
                      : 'DP Tunai langsung masuk ke saldo tunai Dompet Pendaftaran.'}
                  </p>
                  <div className="pt-2 border-t border-emerald-200/70 space-y-1.5">
                    <p className="text-[11px] font-bold text-rose-800">
                      Jika bukti transfer palsu / tidak ditemukan di mutasi rekening:
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {REJECT_PRESET_REASONS.map((reason) => (
                        <button
                          key={reason}
                          type="button"
                          disabled={savingAction}
                          onClick={() => void handleTolak(reason)}
                          className="px-2.5 py-1 rounded-lg bg-white hover:bg-rose-50 border border-rose-200 text-[11px] font-semibold text-rose-800 cursor-pointer"
                        >
                          Tolak: {reason}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* AKSI OPSIONAL: CATAT PELUNASAN BILA WALI SUDAH MEMBAYAR SISA */}
              {canEdit && selected.status === 'dp_terverifikasi' && (
                <div className="border border-sky-200 bg-sky-50/60 rounded-xl p-4 space-y-3">
                  <p className="font-bold text-sky-950 flex items-center gap-1.5">
                    <Wallet className="w-4 h-4 text-sky-700" />
                    Pelunasan Sisa Biaya (Opsional — bisa menyusul di Keuangan setelah jadi Santri)
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">
                        Nominal Pelunasan (Rp)
                      </label>
                      <input
                        type="number"
                        min={0}
                        value={pelunasanNominal}
                        onChange={(e) => setPelunasanNominal(Number(e.target.value))}
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg font-mono font-bold"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Metode</label>
                      <select
                        value={pelunasanMetode}
                        onChange={(e) =>
                          setPelunasanMetode(e.target.value === 'transfer' ? 'transfer' : 'tunai')
                        }
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg font-semibold"
                      >
                        <option value="tunai">Tunai di Kantor (Dompet Tunai)</option>
                        <option value="transfer">Transfer Bank (Pemasukan Transfer)</option>
                      </select>
                    </div>
                    <button
                      type="button"
                      disabled={savingAction}
                      onClick={handleCatatPelunasan}
                      className="min-h-[38px] px-4 py-2 bg-sky-700 hover:bg-sky-800 text-white font-bold rounded-xl cursor-pointer"
                    >
                      Catat Pelunasan
                    </button>
                  </div>

                  {pelunasanMetode === 'transfer' && (
                    <div className="bg-white border border-sky-200 rounded-lg p-2.5 flex flex-wrap items-center justify-between gap-2 text-[11px]">
                      <span className="text-sky-900 font-semibold">
                        Masuk ke laporan Pemasukan Transfer • Unggah Bukti TF (Opsional):
                      </span>
                      {pelunasanBuktiPreview ? (
                        <div className="flex items-center gap-2">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={pelunasanBuktiPreview}
                            alt="Pratinjau Bukti Transfer Pelunasan"
                            className="w-8 h-8 rounded object-cover border border-sky-200"
                            referrerPolicy="no-referrer"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              setPelunasanBuktiFile(null);
                              setPelunasanBuktiPreview('');
                            }}
                            className="px-2 py-1 rounded bg-rose-50 text-rose-700 font-bold border border-rose-200 cursor-pointer"
                          >
                            Hapus
                          </button>
                        </div>
                      ) : (
                        <label className="px-3 py-1 rounded-lg bg-sky-50 hover:bg-sky-100 border border-sky-200 text-sky-900 font-bold inline-flex items-center gap-1 cursor-pointer">
                          <ImagePlus className="w-3.5 h-3.5" />
                          Pilih Foto Bukti TF
                          <input
                            type="file"
                            accept="image/*"
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              if (!f) return;
                              setPelunasanBuktiFile(f);
                              const r = new FileReader();
                              r.onload = () => setPelunasanBuktiPreview(String(r.result || ''));
                              r.readAsDataURL(f);
                            }}
                            className="hidden"
                          />
                        </label>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* AKSI TAHAP 3: AKTIFKAN JADI SANTRI (SETELAH DP TERVERIFIKASI) */}
              {canEdit &&
                (selected.status === 'dp_terverifikasi' ||
                  selected.status === 'lunas_menunggu_kedatangan') && (
                <div className="border-2 border-indigo-200 bg-indigo-50/60 rounded-xl p-4 space-y-3">
                  <p className="font-bold text-indigo-950 flex items-center gap-1.5">
                    <BedDouble className="w-4 h-4 text-indigo-700" />
                    Tahap 3: Aktifkan Menjadi Santri (Penempatan Kamar diatur di Data Santri)
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">
                        Status Kamar Awal
                      </label>
                      <select
                        value={selectedKamar}
                        onChange={(e) => setSelectedKamar(e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg font-semibold"
                      >
                        <option value="Menunggu Penempatan">
                          Belum Ditentukan (Menunggu Penempatan)
                        </option>
                        {daftarKamar.map((km) => (
                          <option key={km} value={km}>
                            {km}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">
                        Tanggal Masuk Resmi (NIS {tglMasukAktual.slice(2, 4) || '27'}XXXX) *
                      </label>
                      <input
                        type="date"
                        value={tglMasukAktual}
                        onChange={(e) => setTglMasukAktual(e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg"
                      />
                    </div>
                    <button
                      type="button"
                      disabled={savingAction}
                      onClick={handleResmikanSantri}
                      className="min-h-[40px] px-4 py-2 bg-indigo-700 hover:bg-indigo-800 text-white font-bold rounded-xl inline-flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <UserCheck className="w-4 h-4" />
                      Aktifkan Jadi Santri
                    </button>
                  </div>
                </div>
              )}

              {/* Footer Modal: Tolak / Hapus */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-200">
                <div className="flex items-center gap-2">
                  {canEdit && selected.status === 'menunggu_verifikasi' && (
                    <button
                      type="button"
                      disabled={savingAction}
                      onClick={() => void handleTolak()}
                      className="px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-bold rounded-lg inline-flex items-center gap-1 cursor-pointer"
                    >
                      <XCircle className="w-3.5 h-3.5" />
                      Tolak Bukti TF
                    </button>
                  )}
                  {canEdit &&
                    (confirmDeleteId === selected.id ? (
                      <button
                        type="button"
                        onClick={() => void handleDeleteRecord(selected.id)}
                        className="px-3 py-2 bg-rose-700 text-white font-bold rounded-lg cursor-pointer"
                      >
                        Konfirmasi Hapus Antrean
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(selected.id)}
                        className="px-3 py-2 text-slate-500 hover:text-rose-700 font-semibold inline-flex items-center gap-1 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Hapus
                      </button>
                    ))}
                </div>

                <button
                  type="button"
                  onClick={() => setSelected(null)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold rounded-xl cursor-pointer"
                >
                  Tutup
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL CETAK KUITANSI PSB 21 x 10 CM */}
      {kuitansiPreview && (
        <div className="fixed inset-0 bg-slate-950/70 z-50 flex items-center justify-center p-4 overflow-y-auto print:bg-white print:p-0">
          <div className="bg-white rounded-2xl max-w-4xl w-full p-5 space-y-4 print:shadow-none print:rounded-none">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3 print:hidden">
              <h3 className="text-sm font-bold text-slate-900">
                Pratinjau Kuitansi PSB ({kuitansiPreview.jenis.toUpperCase()}) · 21 × 10 cm
              </h3>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="px-4 py-2 bg-emerald-700 text-white text-xs font-bold rounded-xl inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <Printer className="w-4 h-4" />
                  Cetak / Simpan PDF
                </button>
                <button
                  type="button"
                  onClick={() => setKuitansiPreview(null)}
                  className="px-3 py-2 bg-slate-100 text-slate-700 text-xs font-bold rounded-xl cursor-pointer"
                >
                  Tutup
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <div className="w-[21cm] min-h-[10cm] mx-auto border-2 border-emerald-900 rounded-xl p-5 flex flex-col justify-between bg-white text-slate-900">
                <div className="flex items-center justify-between border-b-2 border-emerald-800 pb-2.5">
                  <div className="flex items-center gap-3">
                    {pengaturan.logo_url && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={pengaturan.logo_url}
                        alt="Logo"
                        className="w-11 h-11 object-contain"
                        referrerPolicy="no-referrer"
                      />
                    )}
                    <div>
                      <p className="text-sm font-black uppercase text-emerald-950">
                        {pengaturan.nama_pesantren}
                      </p>
                      <p className="text-[10px] text-slate-600">{pengaturan.alamat_lengkap}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] font-bold uppercase text-emerald-800">
                      KUITANSI PENDAFTARAN PSB
                    </p>
                    <p className="font-mono text-xs font-bold">{kuitansiPreview.nomor}</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 text-xs my-3">
                  <div className="space-y-1">
                    <p>
                      <span className="text-slate-500">No. Registrasi:</span>{' '}
                      <strong className="font-mono">{kuitansiPreview.record.no_registrasi}</strong>
                    </p>
                    <p>
                      <span className="text-slate-500">Calon Santri:</span>{' '}
                      <strong>{kuitansiPreview.record.nama_lengkap}</strong>
                    </p>
                    <p>
                      <span className="text-slate-500">Nama Wali:</span>{' '}
                      {kuitansiPreview.record.nama_wali} ({kuitansiPreview.record.no_wa_wali})
                    </p>
                  </div>
                  <div className="space-y-1 text-right">
                    <p>
                      <span className="text-slate-500">Paket:</span>{' '}
                      <strong className="uppercase">{kuitansiPreview.record.paket}</strong>
                    </p>
                    <p>
                      <span className="text-slate-500">Pembayaran:</span>{' '}
                      <strong>
                        {kuitansiPreview.jenis === 'dp'
                          ? 'DP Pendaftaran Online'
                          : 'Pelunasan Pendaftaran PSB'}
                      </strong>
                    </p>
                    <p>
                      <span className="text-slate-500">Metode:</span>{' '}
                      <span className="uppercase font-semibold">{kuitansiPreview.metode}</span>
                    </p>
                  </div>
                </div>

                <div className="flex items-end justify-between border-t border-slate-200 pt-2">
                  <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-2">
                    <p className="text-[10px] font-semibold text-emerald-800 uppercase">
                      Nominal Diterima
                    </p>
                    <p className="text-lg font-black font-mono text-emerald-950">
                      {formatRupiah(kuitansiPreview.nominal)}
                    </p>
                  </div>
                  <div className="text-center text-[11px] min-w-[160px]">
                    <p>Bululawang, {kuitansiPreview.tanggal}</p>
                    <p className="font-semibold">Bendahara / Penerima</p>
                    <div className="h-10 flex items-center justify-center relative">
                      {pengaturan.ttd_bendahara_url && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={pengaturan.ttd_bendahara_url}
                          alt="TTD"
                          className="h-9 object-contain"
                          referrerPolicy="no-referrer"
                        />
                      )}
                    </div>
                    <p className="font-bold underline">{pengaturan.nama_bendahara}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
