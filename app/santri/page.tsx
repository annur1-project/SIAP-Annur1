'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { 
  Users, Plus, Search, Filter, X, Upload, FileSpreadsheet,
  Copy, MessageCircle, Download, Printer, ArrowRightLeft, 
  Camera, Edit3, CheckCircle2, AlertCircle, Info, ShieldCheck,
  MapPin, Phone, UserCheck
} from 'lucide-react';
import * as XLSX from 'xlsx';
import {
  DEFAULT_KAMAR_MASTER,
  DEFAULT_SKEMA_PENDAFTARAN,
  generateNextNisForYear,
  getTahunAjaranForDate,
  hitungRincianPendaftaran,
  mergeAturanOperasional,
  readExtendedLocal,
  type SkemaPendaftaranConfig,
} from '@/lib/pengaturan';
import { buildSantriExcelImportPlan } from '@/lib/santri-excel';
import { TransparencyBanner, maskIdentityNumber, useAuth } from '@/lib/auth';

const ALLOWED_DB_COLUMNS = [
  'nis', 'tgl_masuk', 'nama_lengkap', 'kamar', 'tarif_syahriyah',
  'nisn', 'nik', 'no_kk', 'tempat_lahir', 'tgl_lahir', 'jk', 'hobi', 'cita_cita',
  'status_ayah', 'nama_ayah', 'nik_ayah', 'pendidikan_ayah', 'pekerjaan_ayah', 'penghasilan_ayah', 'no_wa_ayah',
  'status_ibu', 'nama_ibu', 'nik_ibu', 'pendidikan_ibu', 'pekerjaan_ibu', 'penghasilan_ibu', 'no_wa_ibu',
  'nama_wali', 'nik_wali', 'pendidikan_wali', 'pekerjaan_wali', 'no_wa_wali',
  'alamat_jalan', 'rt', 'rw', 'desa', 'kecamatan', 'kabupaten', 'provinsi', 'kode_pos',
  'status', 'foto_url', 'unit_asrama', 'paket_pendaftaran', 'nominal_pendaftaran', 'catatan_keringanan'
];

type SantriFieldValue = string | number | boolean | null | undefined;

interface SantriRow {
  id: string;
  nis?: string;
  nisn?: string;
  nik?: string | null;
  no_kk?: string | null;
  tgl_masuk?: string;
  nama_lengkap?: string;
  kamar?: string;
  tarif_syahriyah?: number;
  tempat_lahir?: string;
  tgl_lahir?: string;
  jk?: string;
  hobi?: string;
  cita_cita?: string;
  status_ayah?: string;
  nama_ayah?: string | null;
  nik_ayah?: string | null;
  pendidikan_ayah?: string | null;
  pekerjaan_ayah?: string | null;
  penghasilan_ayah?: string | null;
  no_wa_ayah?: string | null;
  status_ibu?: string;
  nama_ibu?: string | null;
  nik_ibu?: string | null;
  pendidikan_ibu?: string | null;
  pekerjaan_ibu?: string | null;
  penghasilan_ibu?: string | null;
  no_wa_ibu?: string | null;
  nama_wali?: string | null;
  nik_wali?: string | null;
  pendidikan_wali?: string | null;
  pekerjaan_wali?: string | null;
  no_wa_wali?: string | null;
  alamat_jalan?: string;
  rt?: string;
  rw?: string;
  desa?: string;
  kecamatan?: string;
  kabupaten?: string;
  provinsi?: string;
  kode_pos?: string;
  status?: string;
  foto_url?: string;
  unit_asrama?: string;
  paket_pendaftaran?: string;
  nominal_pendaftaran?: number;
  catatan_keringanan?: string;
  [key: string]: SantriFieldValue;
}

interface WilayahItem {
  Provinsi: string;
  Kabupaten: string;
  Kecamatan: string;
  Kelurahan: string;
  'Kode Pos': string | number;
}

interface PengaturanSantriState {
  nama_pesantren: string;
  alamat_lengkap: string;
  no_telepon: string;
  email_resmi?: string;
  logo_url?: string;
  stempel_url?: string;
  nama_pengasuh: string;
  ttd_pengasuh_url?: string;
  nama_kepala_pondok: string;
  ttd_kepala_pondok_url?: string;
}

function sanitizePayload(data: Partial<SantriRow>) {
  const clean: Record<string, SantriFieldValue> = {};
  ALLOWED_DB_COLUMNS.forEach((col) => {
    if (data[col] !== undefined) {
      clean[col] = data[col] === '' ? null : data[col];
    }
  });
  return clean;
}

function cekWaliSamaAyah(s: Partial<SantriRow>) {
  if (s.status_ayah === 'Meninggal') return false;
  if (!s.nama_wali || String(s.nama_wali).trim() === '') return true;
  return (
    String(s.nama_wali || '').trim().toLowerCase() === String(s.nama_ayah || '').trim().toLowerCase() &&
    String(s.nik_wali || '').trim() === String(s.nik_ayah || '').trim()
  );
}

function cekKelengkapanEmis(s: Partial<SantriRow>) {
  const wajibUmum = [
    s.tgl_masuk, s.nama_lengkap, s.kamar, s.tarif_syahriyah,
    s.nisn, s.nik, s.tempat_lahir, s.tgl_lahir, s.jk,
    s.alamat_jalan, s.desa, s.kecamatan, s.kabupaten, s.provinsi, s.kode_pos
  ];

  let kurang = wajibUmum.filter((v) => !v || String(v).trim() === '').length;

  if (s.status_ayah !== 'Meninggal') {
    const wajibAyah = [s.nama_ayah, s.pendidikan_ayah, s.pekerjaan_ayah];
    kurang += wajibAyah.filter((v) => !v || String(v).trim() === '').length;
  }

  if (s.status_ibu !== 'Meninggal') {
    const wajibIbu = [s.nama_ibu, s.pendidikan_ibu, s.pekerjaan_ibu];
    kurang += wajibIbu.filter((v) => !v || String(v).trim() === '').length;
  }

  const samaDenganAyah = cekWaliSamaAyah(s);
  if (s.status_ayah === 'Meninggal' || !samaDenganAyah) {
    const wajibWali = [s.nama_wali, s.pendidikan_wali, s.pekerjaan_wali, s.no_wa_wali];
    kurang += wajibWali.filter((v) => !v || String(v).trim() === '').length;
  }

  return { lengkap: kurang === 0, kurang };
}

function formatTanggalIndo(dateStr?: string) {
  if (!dateStr) return '-';
  const bulan = [
    'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
  ];
  const parts = String(dateStr).split('-');
  if (parts.length !== 3) return dateStr;
  const [y, m, d] = parts;
  const namaBulan = bulan[parseInt(m, 10) - 1] || m;
  return `${parseInt(d, 10)} ${namaBulan} ${y}`;
}

export default function DataSantriPage() {
  const { canEditModule, canViewSensitiveSantri } = useAuth();
  const canEditSantri = canEditModule('santri');
  const [santriList, setSantriList] = useState<SantriRow[]>([]);
  const [pengaturan, setPengaturan] = useState<PengaturanSantriState>({
    nama_pesantren: 'PONDOK PESANTREN AN-NUR 1 BULULAWANG',
    alamat_lengkap: 'Jl. Diponegoro IV / 2-6 Bululawang, Kab. Malang, Jawa Timur 65171',
    no_telepon: '085604551562',
    email_resmi: 'annur1bululawang@gmail.com',
    logo_url: '',
    stempel_url: '',
    nama_pengasuh: 'Dr. KH. A. Fahrur Rozi',
    ttd_pengasuh_url: '',
    nama_kepala_pondok: 'Ust. M. Fajar Wahyudi',
    ttd_kepala_pondok_url: ''
  });

  const [todayStr, setTodayStr] = useState('');
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploadingFoto, setUploadingFoto] = useState(false);
  const [search, setSearch] = useState('');
  const [filterKamar, setFilterKamar] = useState('Semua');
  const [filterStatus, setFilterStatus] = useState('Semua');
  const [filterKelengkapan, setFilterKelengkapan] = useState('Semua');

  // Toast & Confirm Dialog Custom
  const [toast, setToast] = useState<{ type: 'success' | 'error' | 'info'; title: string; message: string } | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{ title: string; message: string; onConfirm: () => void } | null>(null);

  const showToast = (type: 'success' | 'error' | 'info', title: string, message: string) => {
    setToast({ type, title, message });
    setTimeout(() => setToast(null), 4500);
  };

  // Seleksi Massal & Antrean Cetak Buku Induk (Satuan / Massal)
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [printQueue, setPrintQueue] = useState<SantriRow[]>([]);

  // Modal States
  const [showModalForm, setShowModalForm] = useState(false);
  const [showModalDetail, setShowModalDetail] = useState(false);
  const [showModalEdit, setShowModalEdit] = useState(false);
  const [showModalImport, setShowModalImport] = useState(false);
  const [selectedSantri, setSelectedSantri] = useState<SantriRow | null>(null);
  const [activeEditTab, setActiveEditTab] = useState<'pribadi' | 'ortu' | 'wali' | 'alamat'>('pribadi');

  // Pencarian Wilayah Indonesia
  const [wilayahQuery, setWilayahQuery] = useState('');
  const [wilayahResults, setWilayahResults] = useState<WilayahItem[]>([]);
  const [importing, setImporting] = useState(false);

  const [skemaPendaftaran, setSkemaPendaftaran] = useState<SkemaPendaftaranConfig>(
    DEFAULT_SKEMA_PENDAFTARAN
  );
  const [daftarKamar, setDaftarKamar] = useState<string[]>(DEFAULT_KAMAR_MASTER);

  // Form Pendaftaran Santri Baru (Ringkas)
  const [isCustomNominal, setIsCustomNominal] = useState(false);
  const [formData, setFormData] = useState({
    tgl_masuk: '',
    nama_lengkap: '',
    paket_pendaftaran: 'reguler',
    nominal_pendaftaran: 850000,
    catatan_keringanan: '',
    kamar: 'A1',
    tarif_syahriyah: 450000,
    no_wa_wali: '',
    alamat_jalan: '',
    desa: '',
    kecamatan: '',
    kabupaten: '',
    provinsi: '',
    kode_pos: ''
  });

  // Form Edit Santri (39 Kolom Lengkap) & Toggle Wali
  const [editFormData, setEditFormData] = useState<Partial<SantriRow>>({});
  const [waliSamaAyah, setWaliSamaAyah] = useState(true);

  const nextNisPreview = generateNextNisForYear(
    formData.tgl_masuk || todayStr || '2027-07-01',
    santriList,
    1
  );

  const maskRowIfRestricted = (row: SantriRow): SantriRow => {
    if (canViewSensitiveSantri) return row;
    return {
      ...row,
      nik: row.nik ? maskIdentityNumber(String(row.nik)) : row.nik,
      no_kk: row.no_kk ? maskIdentityNumber(String(row.no_kk)) : row.no_kk,
      nik_ayah: row.nik_ayah ? maskIdentityNumber(String(row.nik_ayah)) : row.nik_ayah,
      nik_ibu: row.nik_ibu ? maskIdentityNumber(String(row.nik_ibu)) : row.nik_ibu,
      nik_wali: row.nik_wali ? maskIdentityNumber(String(row.nik_wali)) : row.nik_wali,
    };
  };

  const fetchSantri = async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const viewRes = await supabase
        .from('v_santri_aman')
        .select('*')
        .order('nis', { ascending: true });
      const { data, error } = viewRes.error
        ? await supabase.from('santri').select('*').order('nis', { ascending: true })
        : viewRes;
      if (error) {
        setFetchError(error.message || 'Gagal mengambil data santri dari Supabase.');
        showToast('error', 'Gagal Memuat Data Santri', error.message || 'Terjadi kendala saat mengambil data santri.');
      } else {
        setSantriList(((data || []) as SantriRow[]).map(maskRowIfRestricted));
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Terjadi kesalahan koneksi ke database.';
      setFetchError(message);
      showToast('error', 'Gagal Memuat Data Santri', message);
    } finally {
      setLoading(false);
    }
  };

  const fetchPengaturan = async () => {
    try {
      const localExt = readExtendedLocal();
      const { data } = await supabase.from('pengaturan_aplikasi').select('*').eq('id', 1).maybeSingle();
      if (data) {
        setPengaturan((prev) => ({ ...prev, ...(data as Partial<PengaturanSantriState>) }));
      }
      const aturan = mergeAturanOperasional(
        (data as Record<string, unknown> | null)?.aturan_operasional ?? localExt?.aturan_operasional
      );
      setSkemaPendaftaran(aturan.pendaftaran);
      setDaftarKamar(aturan.daftar_kamar);
      setFormData((prev) => ({
        ...prev,
        tarif_syahriyah: prev.kamar.toUpperCase().includes('VIP')
          ? aturan.pendaftaran.syahriyah_vip
          : prev.kamar === 'NDALEM'
          ? 145000
          : aturan.pendaftaran.syahriyah_reguler,
      }));
    } catch {
      // Abaikan jika pengaturan belum tersedia
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      const currentDate = new Date().toISOString().split('T')[0];
      setTodayStr(currentDate);
      setFormData((prev) => ({ ...prev, tgl_masuk: prev.tgl_masuk || currentDate }));
      void fetchSantri();
      void fetchPengaturan();
    }, 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canViewSensitiveSantri]);

  const rincianReguler = useMemo(
    () =>
      hitungRincianPendaftaran({
        paket: 'reguler',
        jumlahPendaftarSaatIni: santriList.length,
        skema: skemaPendaftaran,
      }),
    [santriList.length, skemaPendaftaran]
  );

  const rincianVip = useMemo(
    () =>
      hitungRincianPendaftaran({
        paket: 'vip',
        jumlahPendaftarSaatIni: santriList.length,
        skema: skemaPendaftaran,
      }),
    [santriList.length, skemaPendaftaran]
  );

  const rincianPsbAktif = useMemo(
    () =>
      hitungRincianPendaftaran({
        paket: formData.paket_pendaftaran === 'vip' ? 'vip' : 'reguler',
        jumlahPendaftarSaatIni: santriList.length,
        skema: skemaPendaftaran,
        customNominal: isCustomNominal ? Number(formData.nominal_pendaftaran || 0) : null,
      }),
    [
      formData.paket_pendaftaran,
      formData.nominal_pendaftaran,
      isCustomNominal,
      santriList.length,
      skemaPendaftaran,
    ]
  );

  const handleSelectPaketPendaftaran = (paket: 'reguler' | 'vip') => {
    const nextRincian = paket === 'vip' ? rincianVip : rincianReguler;
    const isCurrentVipRoom = formData.kamar.toUpperCase().includes('VIP');
    let nextKamar = formData.kamar;
    if (paket === 'vip' && !isCurrentVipRoom) {
      nextKamar = daftarKamar.find((k) => k.toUpperCase().includes('VIP')) || 'Al-Fachriyah 1 (VIP)';
    } else if (paket === 'reguler' && isCurrentVipRoom) {
      nextKamar = daftarKamar.find((k) => !k.toUpperCase().includes('VIP') && k !== 'NDALEM') || 'A1';
    }
    const nextSyahriyah =
      nextKamar === 'NDALEM'
        ? 145000
        : paket === 'vip'
        ? skemaPendaftaran.syahriyah_vip
        : skemaPendaftaran.syahriyah_reguler;

    setFormData((prev) => ({
      ...prev,
      paket_pendaftaran: paket,
      kamar: nextKamar,
      tarif_syahriyah: nextSyahriyah,
      nominal_pendaftaran: isCustomNominal ? prev.nominal_pendaftaran : nextRincian.totalBayar,
    }));
  };

  const handleSelectKamarPendaftaran = (kamarValue: string) => {
    const isVipRoom = kamarValue.toUpperCase().includes('VIP') || kamarValue.toUpperCase().includes('FACHRIYAH');
    const isNdalem = kamarValue === 'NDALEM';
    const nextPaket: 'reguler' | 'vip' = isVipRoom ? 'vip' : 'reguler';
    const nextTarif = isNdalem
      ? 145000
      : isVipRoom
      ? skemaPendaftaran.syahriyah_vip
      : skemaPendaftaran.syahriyah_reguler;
    const nextRincian = isVipRoom ? rincianVip : rincianReguler;
    setFormData((prev) => ({
      ...prev,
      kamar: kamarValue,
      paket_pendaftaran: nextPaket,
      tarif_syahriyah: nextTarif,
      nominal_pendaftaran: isCustomNominal ? prev.nominal_pendaftaran : nextRincian.totalBayar,
    }));
  };

  // Trigger Cetak Satuan maupun Massal
  const triggerPrintBukuInduk = (listToPrint: SantriRow[]) => {
    if (!listToPrint || listToPrint.length === 0) return;
    setPrintQueue(listToPrint);
    setTimeout(() => {
      window.print();
    }, 150);
  };

  const handleBulkPrintBukuInduk = () => {
    const selectedSantriList = santriList.filter((s) => selectedIds.includes(s.id));
    if (selectedSantriList.length === 0) return;
    triggerPrintBukuInduk(selectedSantriList);
  };

  // Pencarian Wilayah Indonesia
  const searchWilayah = async (query: string) => {
    setWilayahQuery(query);
    if (query.length < 2) {
      setWilayahResults([]);
      return;
    }
    const { data } = await supabase
      .from('wilayah_indonesia')
      .select('*')
      .or(`Kelurahan.ilike.%${query}%,Kecamatan.ilike.%${query}%,Kabupaten.ilike.%${query}%,Provinsi.ilike.%${query}%`)
      .limit(12);
    if (data) setWilayahResults(data as WilayahItem[]);
  };

  const selectWilayah = (item: WilayahItem, isEdit = false) => {
    const mapped = {
      provinsi: item.Provinsi,
      kabupaten: item.Kabupaten,
      kecamatan: item.Kecamatan,
      desa: item.Kelurahan,
      kode_pos: String(item['Kode Pos'])
    };
    if (isEdit) {
      setEditFormData((prev) => ({ ...prev, ...mapped }));
    } else {
      setFormData((prev) => ({ ...prev, ...mapped }));
    }
    setWilayahQuery(`${item.Kelurahan}, ${item.Kecamatan}, ${item.Kabupaten}`);
    setWilayahResults([]);
  };

  // Simpan Pendaftaran Santri Baru
  const handleSaveSantri = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEditSantri) return;
    if (!formData.desa || !formData.kode_pos) {
      showToast('error', 'Alamat Belum Dipilih', 'Silakan ketik dan pilih Desa/Kelurahan dari daftar pencarian wilayah.');
      return;
    }

    setSaving(true);
    const tglMasukFinal = formData.tgl_masuk || todayStr;
    const assignedNis = generateNextNisForYear(tglMasukFinal, santriList, 1);
    const rincianFinal = hitungRincianPendaftaran({
      paket: formData.paket_pendaftaran === 'vip' ? 'vip' : 'reguler',
      jumlahPendaftarSaatIni: santriList.length,
      skema: skemaPendaftaran,
      customNominal: isCustomNominal ? Number(formData.nominal_pendaftaran || 0) : null,
    });

    const payload = sanitizePayload({
      ...formData,
      nominal_pendaftaran: rincianFinal.totalBayar,
      tgl_masuk: tglMasukFinal,
      nis: assignedNis,
      no_wa_ayah: formData.no_wa_wali,
      status: 'aktif',
      unit_asrama: 'Induk Putra'
    });

    const { data: newSantri, error } = await supabase.from('santri').insert([payload]).select().single();

    if (error) {
      setSaving(false);
      showToast('error', 'Gagal Mendaftarkan Santri', error.message);
      return;
    }

    const noKuitansiPsb = `KWT-PSB-${tglMasukFinal.replace(/-/g, '').slice(2)}-${assignedNis.slice(-4)}`;
    const periodeBulanPertama = tglMasukFinal.slice(0, 7);
    const tahunAjaranMasuk = getTahunAjaranForDate(tglMasukFinal);

    const kasPayloads: Array<Record<string, unknown>> = [];
    if (rincianFinal.nominalDompetPendaftaran > 0) {
      kasPayloads.push({
        santri_id: newSantri.id,
        dompet: 'pendaftaran',
        tipe: 'masuk',
        kategori: `Pendaftaran ${rincianFinal.paket.toUpperCase()}`,
        nominal: rincianFinal.nominalDompetPendaftaran,
        keterangan:
          formData.catatan_keringanan ||
          `Pendaftaran Santri Baru ${rincianFinal.paket.toUpperCase()} (${formData.nama_lengkap})${
            rincianFinal.isFreeUangPangkal ? ' - Free Uang Pangkal' : ''
          }`,
        metode_pembayaran: 'tunai',
        tgl_transaksi: tglMasukFinal,
        no_kuitansi: noKuitansiPsb,
      });
    }

    if (rincianFinal.nominalSyahriyahBulanPertama > 0) {
      kasPayloads.push({
        santri_id: newSantri.id,
        dompet: 'operasional',
        tipe: 'masuk',
        kategori: 'Syahriyah & Iuran Santri',
        nominal: rincianFinal.nominalSyahriyahBulanPertama,
        bulan_tagihan: `Syahriyah Bulan Pertama (${periodeBulanPertama})`,
        keterangan: `Syahriyah Bulan Pertama PSB - ${formData.nama_lengkap} (${formData.kamar})`,
        metode_pembayaran: 'tunai',
        tgl_transaksi: tglMasukFinal,
        no_kuitansi: noKuitansiPsb,
      });
    }

    if (kasPayloads.length > 0) {
      await supabase.from('keuangan_transaksi').insert(kasPayloads);
    }

    if (rincianFinal.nominalSyahriyahBulanPertama > 0) {
      await supabase.from('pembayaran_santri_detail').insert([
        {
          santri_id: newSantri.id,
          tahun_ajaran: tahunAjaranMasuk,
          item_kode: 'syahriyah',
          periode_bulan: periodeBulanPertama,
          label_item: `Syahriyah Bulan Pertama (${periodeBulanPertama})`,
          dompet: 'operasional',
          nominal: rincianFinal.nominalSyahriyahBulanPertama,
          is_migrasi: false,
          no_kuitansi: noKuitansiPsb,
          metode_pembayaran: 'tunai',
          tgl_bayar: tglMasukFinal,
          petugas_nama: 'Pendaftaran PSB',
        },
      ]);
    }

    const nextDefaultReguler = hitungRincianPendaftaran({
      paket: 'reguler',
      jumlahPendaftarSaatIni: santriList.length + 1,
      skema: skemaPendaftaran,
    });

    setSaving(false);
    setShowModalForm(false);
    setFormData({
      tgl_masuk: todayStr,
      nama_lengkap: '',
      paket_pendaftaran: 'reguler',
      nominal_pendaftaran: nextDefaultReguler.totalBayar,
      catatan_keringanan: '',
      kamar: 'A1',
      tarif_syahriyah: skemaPendaftaran.syahriyah_reguler,
      no_wa_wali: '',
      alamat_jalan: '',
      desa: '',
      kecamatan: '',
      kabupaten: '',
      provinsi: '',
      kode_pos: ''
    });
    setWilayahQuery('');
    setIsCustomNominal(false);
    showToast(
      'success',
      'Santri Berhasil Didaftarkan!',
      `${newSantri.nama_lengkap} (NIS ${assignedNis}) tercatat · No. Kuitansi ${noKuitansiPsb}.`
    );
    fetchSantri();
  };

  // Buka Modal Edit & Deteksi Otomatis Status Wali
  const handleOpenEditModal = (item: SantriRow) => {
    if (!canEditSantri) return;
    setSelectedSantri(item);
    setEditFormData({ ...item });
    setWaliSamaAyah(cekWaliSamaAyah(item));
    setActiveEditTab('pribadi');
    setWilayahQuery(item.desa ? `${item.desa}, ${item.kecamatan}, ${item.kabupaten}` : '');
    setShowModalEdit(true);
  };

  // Simpan Perubahan Edit Santri
  const handleUpdateSantri = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEditSantri || !selectedSantri) return;
    setSaving(true);

    const draft = { ...editFormData };

    if (draft.status_ayah === 'Meninggal') {
      draft.nama_ayah = null;
      draft.nik_ayah = null;
      draft.pendidikan_ayah = null;
      draft.pekerjaan_ayah = null;
      draft.penghasilan_ayah = null;
      draft.no_wa_ayah = null;
    } else if (waliSamaAyah) {
      draft.nama_wali = draft.nama_ayah || null;
      draft.nik_wali = draft.nik_ayah || null;
      draft.pendidikan_wali = draft.pendidikan_ayah || null;
      draft.pekerjaan_wali = draft.pekerjaan_ayah || null;
      draft.no_wa_wali = draft.no_wa_ayah || null;
    }

    if (draft.status_ibu === 'Meninggal') {
      draft.nama_ibu = null;
      draft.nik_ibu = null;
      draft.pendidikan_ibu = null;
      draft.pekerjaan_ibu = null;
      draft.penghasilan_ibu = null;
      draft.no_wa_ibu = null;
    }

    const cleanData = sanitizePayload(draft);

    const { error } = await supabase
      .from('santri')
      .update(cleanData)
      .eq('id', selectedSantri.id);

    setSaving(false);
    if (error) {
      showToast('error', 'Gagal Menyimpan Perubahan', error.message);
    } else {
      const statusEmis = cekKelengkapanEmis(cleanData);
      setShowModalEdit(false);
      showToast(
        'success',
        'Data Santri Diperbarui',
        statusEmis.lengkap
          ? 'Seluruh berkas wajib EMIS sudah LENGKAP.'
          : `Data tersimpan. Masih ada ${statusEmis.kurang} kolom wajib EMIS yang belum dilengkapi.`
      );
      fetchSantri();
    }
  };

  // Mutasi Massal Ke An-Nur Al-Burhany
  const handleBulkMutasiAlBurhany = () => {
    if (!canEditSantri || selectedIds.length === 0) return;
    setConfirmDialog({
      title: 'Konfirmasi Mutasi Santri',
      message: `Pindahkan ${selectedIds.length} santri terpilih ke unit asrama SMK An-Nur Al-Burhany? Riwayat keuangan lama tetap tersimpan.`,
      onConfirm: async () => {
        setConfirmDialog(null);
        const { error } = await supabase
          .from('santri')
          .update({ status: 'pindah_al_burhany', unit_asrama: 'Unit SMK Al-Burhany' })
          .in('id', selectedIds);

        if (!error) {
          showToast('success', 'Mutasi Berhasil', `${selectedIds.length} santri dipindahkan ke An-Nur Al-Burhany.`);
          setSelectedIds([]);
          fetchSantri();
        } else {
          showToast('error', 'Mutasi Gagal', error.message);
        }
      }
    });
  };

  // Download Template Excel Kosong (Format Seragam 40 Kolom)
  const handleDownloadTemplate = () => {
    const headers = [
      'NIS', 'Tanggal Masuk', 'Nama Lengkap', 'Khos / Kamar', 'Tipe SPP',
      'NISN', 'NIK', 'No KK', 'Tempat Lahir', 'Tanggal Lahir', 'Jenis Kelamin (L/P)', 'Hobi', 'Cita-Cita',
      'Status Ayah', 'Nama Ayah', 'NIK Ayah', 'Pendidikan Ayah', 'Pekerjaan Ayah', 'Penghasilan Ayah', 'No HP/WA Ayah',
      'Status Ibu', 'Nama Ibu', 'NIK Ibu', 'Pendidikan Ibu', 'Pekerjaan Ibu', 'Penghasilan Ibu', 'No HP/WA Ibu',
      'Nama Wali', 'NIK Wali', 'Pendidikan Wali', 'Pekerjaan Wali', 'No HP/WA Wali',
      'Alamat Jalan', 'RT', 'RW', 'Desa/Kelurahan', 'Kecamatan', 'Kabupaten', 'Provinsi', 'Kode Pos'
    ];

    const panduan = [
      'kosongi (otomatis)', 'wajib (YYYY-MM-DD)', 'wajib', 'wajib', 'wajib (Reguler/VIP/Ndalem)',
      'wajib', 'wajib', 'tidak wajib', 'wajib', 'wajib (YYYY-MM-DD)', 'wajib (L/P)', 'tidak wajib', 'tidak wajib',
      'wajib (Hidup/Meninggal)', 'wajib', 'tidak wajib', 'wajib', 'wajib', 'tidak wajib', 'tidak wajib',
      'wajib (Hidup/Meninggal)', 'wajib', 'tidak wajib', 'wajib', 'wajib', 'tidak wajib', 'tidak wajib',
      'kondisional', 'kondisional', 'kondisional', 'kondisional', 'kondisional',
      'wajib', 'tidak wajib', 'tidak wajib', 'wajib', 'wajib', 'wajib', 'wajib', 'wajib'
    ];

    const contoh = [
      '', '2026-07-15', 'Ahmad Fauzan', 'A1', 'Reguler',
      '0091234567', '3507123456780001', '3507123456780000', 'Malang', '2012-05-10', 'L', 'Membaca', 'Guru',
      'Hidup', 'H. Abdul Karim', '', 'S1', 'Wiraswasta', '3jt - 5jt', '081234567890',
      'Hidup', 'Hj. Siti Aminah', '', 'SMA', 'Ibu Rumah Tangga', '-', '081234567891',
      '', '', '', '', '',
      'Jl. Raya Bululawang No. 12', '02', '01', 'Bululawang', 'Bululawang', 'KAB. MALANG', 'JAWA TIMUR', '65171'
    ];

    const ws = XLSX.utils.aoa_to_sheet([headers, panduan, contoh]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Data_Santri');
    XLSX.writeFile(wb, 'TEMPLATE_IMPOR_SANTRI_ANNUR1.xlsx');
    showToast('info', 'Template Diunduh', 'Kolom NIS biarkan kosong saat mengisi data baru; sistem akan mengurutkannya otomatis.');
  };

  // Import Excel Massal (.xlsx) — memperbarui data berdasarkan NIS tanpa mengubah NIS lama
  const handleImportExcel = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!canEditSantri) return;
    const file = e.target.files?.[0];
    if (!file) return;

    setImporting(true);
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws);

        const plan = buildSantriExcelImportPlan({
          rows,
          existingSantriList: santriList,
          skemaPendaftaran,
          todayStr: todayStr || '2027-07-01',
        });

        if (plan.total === 0) {
          setImporting(false);
          showToast('error', 'File Kosong', 'Tidak ditemukan baris data santri yang valid pada file Excel.');
          return;
        }

        if (plan.inserts.length > 0) {
          const { error: insertErr } = await supabase
            .from('santri')
            .insert(plan.inserts.map((i) => i.payload));
          if (insertErr) {
            setImporting(false);
            showToast('error', 'Gagal Menambah Santri Baru', insertErr.message);
            return;
          }
        }

        for (const upd of plan.updates) {
          const { error: updErr } = await supabase
            .from('santri')
            .update(upd.payload)
            .eq('id', upd.id);
          if (updErr) {
            setImporting(false);
            showToast('error', `Gagal Memperbarui NIS ${upd.nis}`, updErr.message);
            return;
          }
        }

        setImporting(false);
        setShowModalImport(false);
        showToast(
          'success',
          'Impor Excel Berhasil',
          `${plan.updates.length} data santri diperbarui (NIS tetap), ${plan.inserts.length} santri baru ditambahkan.`
        );
        fetchSantri();
      } catch (err: unknown) {
        setImporting(false);
        const message = err instanceof Error ? err.message : 'Format file tidak valid.';
        showToast('error', 'Kesalahan Format File', message);
      }
    };
    reader.readAsBinaryString(file);
  };

  // Export Data Santri ke Excel (mengikuti filter aktif bila difilter, atau semua jika Tanpa Filter)
  const handleExportExcel = () => {
    const isFiltered =
      filterKamar !== 'Semua' ||
      filterStatus !== 'Semua' ||
      filterKelengkapan !== 'Semua' ||
      search.trim().length > 0;
    const sourceRows = isFiltered ? filteredSantri : santriList;

    const exportRows = sourceRows.map((s) => ({
      'NIS': s.nis || '',
      'Tanggal Masuk': s.tgl_masuk || '',
      'Nama Lengkap': s.nama_lengkap || '',
      'Khos / Kamar': s.kamar || '',
      'Tipe SPP':
        Number(s.tarif_syahriyah || 0) >= 475000 || String(s.kamar || '').toUpperCase().includes('VIP')
          ? 'VIP'
          : Number(s.tarif_syahriyah || 0) === 145000
          ? 'Ndalem'
          : 'Reguler',
      'NISN': s.nisn || '',
      'NIK': s.nik ? (canViewSensitiveSantri ? s.nik : maskIdentityNumber(String(s.nik))) : '',
      'No KK': s.no_kk ? (canViewSensitiveSantri ? s.no_kk : maskIdentityNumber(String(s.no_kk))) : '',
      'Tempat Lahir': s.tempat_lahir || '',
      'Tanggal Lahir': s.tgl_lahir || '',
      'Jenis Kelamin (L/P)': s.jk || '',
      'Hobi': s.hobi || '',
      'Cita-Cita': s.cita_cita || '',
      'Status Ayah': s.status_ayah || 'Hidup',
      'Nama Ayah': s.nama_ayah || '',
      'NIK Ayah': s.nik_ayah ? (canViewSensitiveSantri ? s.nik_ayah : maskIdentityNumber(String(s.nik_ayah))) : '',
      'Pendidikan Ayah': s.pendidikan_ayah || '',
      'Pekerjaan Ayah': s.pekerjaan_ayah || '',
      'Penghasilan Ayah': s.penghasilan_ayah || '',
      'No HP/WA Ayah': s.no_wa_ayah || '',
      'Status Ibu': s.status_ibu || 'Hidup',
      'Nama Ibu': s.nama_ibu || '',
      'NIK Ibu': s.nik_ibu ? (canViewSensitiveSantri ? s.nik_ibu : maskIdentityNumber(String(s.nik_ibu))) : '',
      'Pendidikan Ibu': s.pendidikan_ibu || '',
      'Pekerjaan Ibu': s.pekerjaan_ibu || '',
      'Penghasilan Ibu': s.penghasilan_ibu || '',
      'No HP/WA Ibu': s.no_wa_ibu || '',
      'Nama Wali': s.nama_wali || '',
      'NIK Wali': s.nik_wali ? (canViewSensitiveSantri ? s.nik_wali : maskIdentityNumber(String(s.nik_wali))) : '',
      'Pendidikan Wali': s.pendidikan_wali || '',
      'Pekerjaan Wali': s.pekerjaan_wali || '',
      'No HP/WA Wali': s.no_wa_wali || '',
      'Alamat Jalan': s.alamat_jalan || '',
      'RT': s.rt || '',
      'RW': s.rw || '',
      'Desa/Kelurahan': s.desa || '',
      'Kecamatan': s.kecamatan || '',
      'Kabupaten': s.kabupaten || '',
      'Provinsi': s.provinsi || '',
      'Kode Pos': s.kode_pos || ''
    }));

    const ws = XLSX.utils.json_to_sheet(exportRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Data_Santri');
    const dateStamp = todayStr || 'export';
    XLSX.writeFile(wb, `DATA_SANTRI_ANNUR1_${dateStamp}.xlsx`);
    showToast(
      'success',
      'Export Berhasil',
      `${sourceRows.length} data santri beserta NIS telah diunduh.`
    );
  };

  // Upload Foto 3x4 Santri
  const handleUploadFoto = async (e: React.ChangeEvent<HTMLInputElement>, santriId: string) => {
    if (!canEditSantri) return;
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingFoto(true);
    const ext = file.name.split('.').pop() || 'jpg';
    const fileName = `foto_3x4_${santriId}_${Date.now()}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from('foto-santri')
      .upload(fileName, file, { upsert: true });

    if (uploadError) {
      setUploadingFoto(false);
      showToast('error', 'Gagal Upload Foto', uploadError.message);
      return;
    }

    const { data: publicUrl } = supabase.storage.from('foto-santri').getPublicUrl(fileName);
    const { error: updateErr } = await supabase
      .from('santri')
      .update({ foto_url: publicUrl.publicUrl })
      .eq('id', santriId);

    setUploadingFoto(false);
    if (updateErr) {
      showToast('error', 'Gagal Menyimpan URL Foto', updateErr.message);
      return;
    }

    setSelectedSantri((prev) => (prev ? { ...prev, foto_url: publicUrl.publicUrl } : prev));
    showToast('success', 'Foto 3x4 Tersimpan', 'Foto profil santri siap dicetak di Buku Induk A4.');
    fetchSantri();
  };

  // Hitung Statistik Kelengkapan Data EMIS & Kamar Menunggu Penempatan
  const totalSantri = santriList.length;
  const lengkapCount = santriList.filter((s) => cekKelengkapanEmis(s).lengkap).length;
  const belumLengkapCount = totalSantri - lengkapCount;
  const persentaseLengkap = totalSantri > 0 ? Math.round((lengkapCount / totalSantri) * 100) : 0;
  const menungguPenempatanCount = santriList.filter(
    (s) => s.kamar === 'Menunggu Penempatan'
  ).length;

  // Filter Data
  const filteredSantri = santriList.filter((s) => {
    const matchSearch =
      String(s.nama_lengkap || '').toLowerCase().includes(search.toLowerCase()) ||
      String(s.nis || '').includes(search);
    const matchKamar = filterKamar === 'Semua' || s.kamar === filterKamar;
    const matchStatus = filterStatus === 'Semua' || s.status === filterStatus;
    const kelengkapan = cekKelengkapanEmis(s);
    const matchKelengkapan =
      filterKelengkapan === 'Semua' ||
      (filterKelengkapan === 'Lengkap' && kelengkapan.lengkap) ||
      (filterKelengkapan === 'Belum' && !kelengkapan.lengkap);
    return matchSearch && matchKamar && matchStatus && matchKelengkapan;
  });

  // Helper Render Baris Kontak WA Ringkas
  const renderKontakRow = (label: string, nomor?: string | null) => {
    if (!nomor) return null;
    return (
      <div key={label} className="flex items-center gap-1.5 text-[11px]">
        <span className="text-slate-400 font-sans w-8">{label}:</span>
        <span className="font-mono text-slate-700">{nomor}</span>
        <button
          title={`Salin Nomor ${label}`}
          onClick={() => {
            navigator.clipboard.writeText(nomor);
            showToast('info', 'Tersalin', `Nomor ${label} (${nomor}) disalin.`);
          }}
          className="p-0.5 hover:bg-slate-200 rounded text-slate-500"
        >
          <Copy className="w-3 h-3" />
        </button>
        <a
          title={`Chat WA ${label}`}
          href={`https://wa.me/62${String(nomor).replace(/^0/, '')}`}
          target="_blank"
          rel="noreferrer"
          className="p-0.5 hover:bg-emerald-100 rounded text-emerald-600"
        >
          <MessageCircle className="w-3 h-3" />
        </a>
      </div>
    );
  };

  // Status kelengkapan santri yang sedang dibuka di Modal Detail
  const detailEmisStatus = selectedSantri ? cekKelengkapanEmis(selectedSantri) : { lengkap: false, kurang: 0 };

  return (
    <div className="space-y-6 relative print:space-y-0">
      
      {/* GLOBAL PRINT STYLES UNTUK BUKU INDUK A4 SATUAN & MASSAL (1 ANAK = 1 LEMBAR PAS) */}
      <style jsx global>{`
        @media print {
          @page {
            size: A4 portrait;
            margin: 5mm 8mm;
          }
          html, body {
            margin: 0 !important;
            padding: 0 !important;
            height: auto !important;
            overflow: visible !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            background: #ffffff !important;
          }
          aside, nav, header {
            display: none !important;
          }
          body * {
            visibility: hidden;
          }
          #buku-induk-print-area,
          #buku-induk-print-area * {
            visibility: visible;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          #buku-induk-print-area {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            display: block !important;
            background: #ffffff !important;
          }
          .buku-induk-sheet {
            width: 100% !important;
            height: 272mm !important;
            max-height: 272mm !important;
            box-sizing: border-box !important;
            display: flex !important;
            flex-direction: column !important;
            justify-content: space-between !important;
            background: #ffffff !important;
            color: #0f172a !important;
            page-break-after: always !important;
            break-after: page !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
            overflow: hidden !important;
          }
          .buku-induk-sheet:last-child {
            page-break-after: auto !important;
            break-after: auto !important;
          }
        }
      `}</style>

      {/* ================================================================= */}
      {/* LEMBAR CETAK BUKU INDUK A4 (MENDUKUNG SATUAN MAUPUN MASSAL)        */}
      {/* ================================================================= */}
      {printQueue.length > 0 && (
        <div id="buku-induk-print-area" className="hidden">
          {printQueue.map((santriItem) => {
            const isSheetWaliSamaAyah = cekWaliSamaAyah(santriItem);

            return (
              <div
                key={santriItem.id || santriItem.nis}
                className="buku-induk-sheet font-sans text-[10px] leading-snug border-[3px] border-double border-emerald-900 px-4 py-3 rounded-xs"
              >
                {/* BAGIAN ATAS: KOP SURAT + IDENTITAS INDUK & PAS FOTO 3x4 */}
                <div>
                  <div className="flex items-center justify-between pb-2 border-b-[3px] border-emerald-800">
                    <div className="w-15 h-15 flex items-center justify-center shrink-0">
                      {pengaturan.logo_url ? (
                        <img src={pengaturan.logo_url} alt="Logo Pondok" className="w-15 h-15 object-contain" />
                      ) : (
                        <div className="w-14 h-14 rounded-full bg-emerald-900 text-amber-300 border-2 border-amber-500 flex flex-col items-center justify-center font-extrabold">
                          <span className="text-[11px] leading-none">AN-1</span>
                          <span className="text-[7px] tracking-widest mt-0.5">MALANG</span>
                        </div>
                      )}
                    </div>

                    <div className="text-center flex-1 px-3">
                      <p className="text-[9px] font-bold tracking-[0.2em] text-emerald-800 uppercase">
                        YAYASAN PENDIDIKAN PONDOK PESANTREN AN-NUR
                      </p>
                      <h1 className="text-[15px] font-extrabold text-emerald-950 uppercase tracking-wide mt-0.5">
                        {pengaturan.nama_pesantren}
                      </h1>
                      <p className="text-[9.5px] text-slate-700 mt-0.5">{pengaturan.alamat_lengkap}</p>
                      <p className="text-[8.5px] text-emerald-900 font-medium">
                        Telp/WA: {pengaturan.no_telepon} • Email: {pengaturan.email_resmi || 'annur1bululawang@gmail.com'}
                      </p>
                    </div>

                    <div className="w-20 shrink-0 text-right">
                      <span className="inline-block px-2 py-1 bg-emerald-50 border border-emerald-700 text-emerald-900 font-bold text-[8px] rounded leading-tight">
                        ARSIP INDUK<br />EMIS KEMENAG
                      </span>
                    </div>
                  </div>

                  {/* GARIS AKSEN EMAS */}
                  <div className="h-[2px] bg-amber-600 mt-0.5 mb-2" />

                  {/* JUDUL DOKUMEN, KARTU RINGKASAN INDUK & PAS FOTO 3x4 */}
                  <div className="flex justify-between items-stretch gap-4">
                    <div className="flex-1 flex flex-col justify-between">
                      <div className="mb-1.5">
                        <h2 className="text-[13px] font-extrabold text-emerald-950 uppercase tracking-wider">
                          LEMBAR BUKU INDUK SANTRI
                        </h2>
                        <p className="text-[9px] text-slate-500">Dokumen Registrasi Resmi &amp; Database Induk Kepesantrenan</p>
                      </div>

                      <div className="bg-emerald-50/95 border border-emerald-300 border-l-4 border-l-emerald-800 rounded-r-md px-3 py-2 grid grid-cols-2 gap-x-4 gap-y-1 text-[9.5px]">
                        <div>
                          <span className="text-slate-500 block text-[8px] uppercase font-semibold">Nomor Induk Santri (NIS)</span>
                          <strong className="font-mono text-[11.5px] text-emerald-950">{santriItem.nis}</strong>
                        </div>
                        <div>
                          <span className="text-slate-500 block text-[8px] uppercase font-semibold">NISN Nasional</span>
                          <strong className="font-mono text-[10.5px] text-slate-800">{santriItem.nisn || '-'}</strong>
                        </div>
                        <div>
                          <span className="text-slate-500 block text-[8px] uppercase font-semibold">Tanggal Diterima</span>
                          <strong className="text-slate-800">{formatTanggalIndo(santriItem.tgl_masuk)}</strong>
                        </div>
                        <div>
                          <span className="text-slate-500 block text-[8px] uppercase font-semibold">Penempatan Khos / Kamar</span>
                          <strong className="text-emerald-900">{santriItem.kamar} ({santriItem.unit_asrama || 'Induk Putra'})</strong>
                        </div>
                      </div>
                    </div>

                    {/* BINGKAI PAS FOTO 3x4 CM */}
                    <div className="w-[28mm] h-[37mm] border-2 border-emerald-900 p-0.5 bg-white flex items-center justify-center shrink-0">
                      <div className="w-full h-full border border-emerald-400 flex items-center justify-center overflow-hidden bg-emerald-50/40">
                        {santriItem.foto_url ? (
                          <img src={santriItem.foto_url} alt="Pas Foto 3x4" className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-[8.5px] font-bold text-emerald-800 text-center px-1">PAS FOTO<br />3 x 4</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* BAGIAN TENGAH: 4 TABEL DATA EMIS LENGKAP (KOMPAK & ANTI-LUBER) */}
                <div className="space-y-2 my-auto">
                  {/* A. KETERANGAN PRIBADI SANTRI */}
                  <div>
                    <div className="bg-emerald-900 text-white font-bold px-2.5 py-0.5 uppercase text-[9px] tracking-wider rounded-t-xs">
                      A. Keterangan Pribadi Santri
                    </div>
                    <table className="w-full border-collapse border border-emerald-900/40 text-[9.5px]">
                      <tbody>
                        <tr className="bg-white">
                          <td className="border border-emerald-900/30 px-2.5 py-1 w-[34%] text-slate-700">1. Nama Lengkap Santri</td>
                          <td className="border border-emerald-900/30 px-2.5 py-1 font-extrabold uppercase text-emerald-950">{santriItem.nama_lengkap}</td>
                        </tr>
                        <tr className="bg-emerald-50/40">
                          <td className="border border-emerald-900/30 px-2.5 py-1 text-slate-700">2. NIK Santri / Nomor Kartu Keluarga</td>
                          <td className="border border-emerald-900/30 px-2.5 py-1 font-mono">
                            {santriItem.nik ? (canViewSensitiveSantri ? santriItem.nik : maskIdentityNumber(String(santriItem.nik))) : '-'} / {santriItem.no_kk ? (canViewSensitiveSantri ? santriItem.no_kk : maskIdentityNumber(String(santriItem.no_kk))) : '-'}
                          </td>
                        </tr>
                        <tr className="bg-white">
                          <td className="border border-emerald-900/30 px-2.5 py-1 text-slate-700">3. Tempat, Tanggal Lahir</td>
                          <td className="border border-emerald-900/30 px-2.5 py-1">{santriItem.tempat_lahir || '-'}, {formatTanggalIndo(santriItem.tgl_lahir)}</td>
                        </tr>
                        <tr className="bg-emerald-50/40">
                          <td className="border border-emerald-900/30 px-2.5 py-1 text-slate-700">4. Jenis Kelamin &amp; Status Santri</td>
                          <td className="border border-emerald-900/30 px-2.5 py-1">{santriItem.jk === 'P' ? 'Perempuan' : 'Laki-laki'} • Status: <strong className="uppercase">{santriItem.status || 'AKTIF'}</strong></td>
                        </tr>
                        <tr className="bg-white">
                          <td className="border border-emerald-900/30 px-2.5 py-1 text-slate-700">5. Hobi / Cita-Cita</td>
                          <td className="border border-emerald-900/30 px-2.5 py-1">{santriItem.hobi || '-'} / {santriItem.cita_cita || '-'}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  {/* B. KETERANGAN TEMPAT TINGGAL */}
                  <div>
                    <div className="bg-emerald-900 text-white font-bold px-2.5 py-0.5 uppercase text-[9px] tracking-wider rounded-t-xs">
                      B. Keterangan Tempat Tinggal (Alamat Asal)
                    </div>
                    <table className="w-full border-collapse border border-emerald-900/40 text-[9.5px]">
                      <tbody>
                        <tr className="bg-white">
                          <td className="border border-emerald-900/30 px-2.5 py-1 w-[34%] text-slate-700">6. Alamat Jalan / Dusun</td>
                          <td className="border border-emerald-900/30 px-2.5 py-1">{santriItem.alamat_jalan || '-'} (RT {santriItem.rt || '-'} / RW {santriItem.rw || '-'})</td>
                        </tr>
                        <tr className="bg-emerald-50/40">
                          <td className="border border-emerald-900/30 px-2.5 py-1 text-slate-700">7. Desa / Kelurahan &amp; Kecamatan</td>
                          <td className="border border-emerald-900/30 px-2.5 py-1">{santriItem.desa || '-'}, Kec. {santriItem.kecamatan || '-'}</td>
                        </tr>
                        <tr className="bg-white">
                          <td className="border border-emerald-900/30 px-2.5 py-1 text-slate-700">8. Kabupaten/Kota &amp; Provinsi</td>
                          <td className="border border-emerald-900/30 px-2.5 py-1">{santriItem.kabupaten || '-'}, {santriItem.provinsi || '-'} — Kode Pos: <strong className="font-mono">{santriItem.kode_pos || '-'}</strong></td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  {/* C. KETERANGAN ORANG TUA KANDUNG */}
                  <div>
                    <div className="bg-emerald-900 text-white font-bold px-2.5 py-0.5 uppercase text-[9px] tracking-wider rounded-t-xs">
                      C. Keterangan Orang Tua Kandung
                    </div>
                    <table className="w-full border-collapse border border-emerald-900/40 text-[9.5px]">
                      <thead>
                        <tr className="bg-emerald-100/90 text-emerald-950 font-bold">
                          <th className="border border-emerald-900/30 px-2.5 py-1 text-left w-[34%]">Uraian Biodata</th>
                          <th className="border border-emerald-900/30 px-2.5 py-1 text-left w-[33%]">Data Ayah Kandung</th>
                          <th className="border border-emerald-900/30 px-2.5 py-1 text-left w-[33%]">Data Ibu Kandung</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr className="bg-white">
                          <td className="border border-emerald-900/30 px-2.5 py-1 text-slate-700">9. Nama Lengkap</td>
                          <td className="border border-emerald-900/30 px-2.5 py-1 font-bold">{santriItem.status_ayah === 'Meninggal' ? '(Almarhum)' : (santriItem.nama_ayah || '-')}</td>
                          <td className="border border-emerald-900/30 px-2.5 py-1 font-bold">{santriItem.status_ibu === 'Meninggal' ? '(Almarhumah)' : (santriItem.nama_ibu || '-')}</td>
                        </tr>
                        <tr className="bg-emerald-50/40">
                          <td className="border border-emerald-900/30 px-2.5 py-1 text-slate-700">10. Status</td>
                          <td className="border border-emerald-900/30 px-2.5 py-1">{santriItem.status_ayah || 'Hidup'}</td>
                          <td className="border border-emerald-900/30 px-2.5 py-1">{santriItem.status_ibu || 'Hidup'}</td>
                        </tr>
                        <tr className="bg-white">
                          <td className="border border-emerald-900/30 px-2.5 py-1 text-slate-700">11. Nomor Induk Kependudukan (NIK)</td>
                          <td className="border border-emerald-900/30 px-2.5 py-1 font-mono">
                            {santriItem.nik_ayah ? (canViewSensitiveSantri ? santriItem.nik_ayah : maskIdentityNumber(String(santriItem.nik_ayah))) : '-'}
                          </td>
                          <td className="border border-emerald-900/30 px-2.5 py-1 font-mono">
                            {santriItem.nik_ibu ? (canViewSensitiveSantri ? santriItem.nik_ibu : maskIdentityNumber(String(santriItem.nik_ibu))) : '-'}
                          </td>
                        </tr>
                        <tr className="bg-emerald-50/40">
                          <td className="border border-emerald-900/30 px-2.5 py-1 text-slate-700">12. Pendidikan Terakhir</td>
                          <td className="border border-emerald-900/30 px-2.5 py-1">{santriItem.pendidikan_ayah || '-'}</td>
                          <td className="border border-emerald-900/30 px-2.5 py-1">{santriItem.pendidikan_ibu || '-'}</td>
                        </tr>
                        <tr className="bg-white">
                          <td className="border border-emerald-900/30 px-2.5 py-1 text-slate-700">13. Pekerjaan &amp; Penghasilan</td>
                          <td className="border border-emerald-900/30 px-2.5 py-1">{santriItem.pekerjaan_ayah || '-'} ({santriItem.penghasilan_ayah || '-'})</td>
                          <td className="border border-emerald-900/30 px-2.5 py-1">{santriItem.pekerjaan_ibu || '-'} ({santriItem.penghasilan_ibu || '-'})</td>
                        </tr>
                        <tr className="bg-emerald-50/40">
                          <td className="border border-emerald-900/30 px-2.5 py-1 text-slate-700">14. Nomor HP / WhatsApp</td>
                          <td className="border border-emerald-900/30 px-2.5 py-1 font-mono">{santriItem.no_wa_ayah || '-'}</td>
                          <td className="border border-emerald-900/30 px-2.5 py-1 font-mono">{santriItem.no_wa_ibu || '-'}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  {/* D. KETERANGAN WALI SANTRI */}
                  <div>
                    <div className="bg-emerald-900 text-white font-bold px-2.5 py-0.5 uppercase text-[9px] tracking-wider rounded-t-xs">
                      D. Keterangan Wali Santri
                    </div>
                    {isSheetWaliSamaAyah ? (
                      <div className="border border-emerald-900/40 bg-emerald-50/50 px-2.5 py-1.5 text-[9.5px] text-slate-800">
                        Wali santri sama dengan <strong>Ayah Kandung ({santriItem.nama_ayah || '-'})</strong> — merujuk pada rincian biodata pada Bagian C (No. HP/WA Wali Aktif: <span className="font-mono font-semibold">{santriItem.no_wa_wali || santriItem.no_wa_ayah || '-'}</span>).
                      </div>
                    ) : (
                      <table className="w-full border-collapse border border-emerald-900/40 text-[9.5px]">
                        <tbody>
                          <tr className="bg-white">
                            <td className="border border-emerald-900/30 px-2.5 py-1 w-[34%] text-slate-700">15. Nama Lengkap &amp; NIK Wali</td>
                            <td className="border border-emerald-900/30 px-2.5 py-1"><strong>{santriItem.nama_wali || '-'}</strong> (NIK: <span className="font-mono">{santriItem.nik_wali ? (canViewSensitiveSantri ? santriItem.nik_wali : maskIdentityNumber(String(santriItem.nik_wali))) : '-'}</span>)</td>
                          </tr>
                          <tr className="bg-emerald-50/40">
                            <td className="border border-emerald-900/30 px-2.5 py-1 text-slate-700">16. Pendidikan &amp; Pekerjaan Wali</td>
                            <td className="border border-emerald-900/30 px-2.5 py-1">{santriItem.pendidikan_wali || '-'} / {santriItem.pekerjaan_wali || '-'}</td>
                          </tr>
                          <tr className="bg-white">
                            <td className="border border-emerald-900/30 px-2.5 py-1 text-slate-700">17. Nomor HP / WhatsApp Wali</td>
                            <td className="border border-emerald-900/30 px-2.5 py-1 font-mono">{santriItem.no_wa_wali || '-'}</td>
                          </tr>
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>

                {/* BAGIAN BAWAH: PENGESAHAN TTD PENGASUH & KEPALA PONDOK + FOOTER ARSIP */}
                <div>
                  <div className="grid grid-cols-2 gap-8 text-center text-[10px]">
                    <div className="flex flex-col items-center">
                      <p className="text-slate-600">Mengetahui,</p>
                      <p className="font-bold text-emerald-950">Pengasuh Pondok Pesantren</p>
                      <div className="h-14 relative flex items-center justify-center my-0.5">
                        {pengaturan.ttd_pengasuh_url && (
                          <img src={pengaturan.ttd_pengasuh_url} alt="TTD Pengasuh" className="h-13 object-contain z-10" />
                        )}
                      </div>
                      <p className="font-bold underline text-emerald-950">{pengaturan.nama_pengasuh}</p>
                    </div>

                    <div className="flex flex-col items-center relative">
                      <p className="text-slate-600">Bululawang, {formatTanggalIndo(todayStr)}</p>
                      <p className="font-bold text-emerald-950">Kepala Pondok</p>
                      <div className="h-14 relative flex items-center justify-center my-0.5">
                        {pengaturan.stempel_url && (
                          <img src={pengaturan.stempel_url} alt="Stempel Pondok" className="h-14 object-contain opacity-80 -ml-14 absolute" />
                        )}
                        {pengaturan.ttd_kepala_pondok_url && (
                          <img src={pengaturan.ttd_kepala_pondok_url} alt="TTD Kepala Pondok" className="h-13 object-contain z-10" />
                        )}
                      </div>
                      <p className="font-bold underline text-emerald-950">{pengaturan.nama_kepala_pondok}</p>
                    </div>
                  </div>

                  <div className="mt-2 pt-1 border-t border-emerald-800/30 flex justify-between text-[8px] text-slate-500">
                    <span>Dokumen Sah Buku Induk Santri • e-annursatu • Ponpes An-Nur 1 Bululawang</span>
                    <span className="font-mono">NIS: {santriItem.nis}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* CUSTOM TOAST NOTIFICATION */}
      {toast && (
        <div
          className="fixed top-5 right-5 z-[100] max-w-sm w-full bg-white border-l-4 rounded-2xl shadow-xl p-4 flex items-start gap-3 border border-slate-200 print:hidden"
          style={{
            borderLeftColor: toast.type === 'success' ? '#047857' : toast.type === 'error' ? '#e11d48' : '#d97706'
          }}
        >
          {toast.type === 'success' && <CheckCircle2 className="w-5 h-5 text-emerald-700 shrink-0 mt-0.5" />}
          {toast.type === 'error' && <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />}
          {toast.type === 'info' && <Info className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />}
          <div className="flex-1 text-xs">
            <h4 className="font-bold text-slate-800">{toast.title}</h4>
            <p className="text-slate-600 mt-0.5 leading-relaxed">{toast.message}</p>
          </div>
          <button onClick={() => setToast(null)} className="text-slate-400 hover:text-slate-600">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* CUSTOM CONFIRM DIALOG */}
      {confirmDialog && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-[90] flex items-center justify-center p-4 print:hidden">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
                <ArrowRightLeft className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-sm text-slate-800">{confirmDialog.title}</h3>
                <p className="text-xs text-slate-500 mt-0.5">{confirmDialog.message}</p>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setConfirmDialog(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl"
              >
                Batal
              </button>
              <button
                onClick={confirmDialog.onConfirm}
                className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold rounded-xl"
              >
                Ya, Lanjutkan
              </button>
            </div>
          </div>
        </div>
      )}

      {/* BANNER MODE TRANSPARANSI */}
      <div className="print:hidden">
        <TransparencyBanner
          moduleLabel="Data Induk Santri"
          isReadOnly={!canEditSantri}
          extraNote={
            !canViewSensitiveSantri
              ? 'NIK dan Nomor KK santri/orang tua disamarkan pada Mode Transparansi.'
              : undefined
          }
        />
      </div>

      {/* HEADER PAGE + PROGRESS BAR KELENGKAPAN EMIS */}
      <div className="bg-white p-4 sm:p-6 rounded-2xl border border-slate-200 shadow-sm print:hidden space-y-4">
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
          <div>
            <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
              <Users className="w-6 h-6 text-emerald-700 shrink-0" />
              Master Data Santri &amp; Pendaftaran EMIS
            </h1>
            <p className="text-xs text-slate-500 mt-1">
              Total Terdaftar: <strong className="text-slate-800">{totalSantri} Santri</strong> • Auto NIS Berikutnya: <strong className="text-emerald-700 font-mono">{nextNisPreview}</strong>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto">
            <button
              onClick={handleDownloadTemplate}
              className="min-h-[40px] px-3 py-2 bg-slate-100 text-slate-700 hover:bg-slate-200 text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-700 shrink-0" />
              Template Excel
            </button>

            {canEditSantri && (
              <button
                onClick={() => setShowModalImport(true)}
                className="min-h-[40px] px-3 py-2 bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100 text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap"
              >
                <Upload className="w-4 h-4 shrink-0" />
                Import Excel
              </button>
            )}

            <button
              onClick={handleExportExcel}
              className="min-h-[40px] px-3 py-2 bg-slate-100 text-slate-700 hover:bg-slate-200 text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap"
            >
              <Download className="w-4 h-4 shrink-0" />
              Export Excel
            </button>

            {canEditSantri && (
              <button
                onClick={() => {
                  setWilayahQuery('');
                  setShowModalForm(true);
                }}
                className="w-full sm:w-auto min-h-[40px] px-4 py-2 bg-emerald-700 text-white hover:bg-emerald-800 text-xs font-bold rounded-xl flex items-center justify-center gap-2 transition-colors shadow-sm whitespace-nowrap"
              >
                <Plus className="w-4 h-4 shrink-0" />
                Pendaftaran Santri Baru
              </button>
            )}
          </div>
        </div>

        {/* BARIS PROGRESS BAR KELENGKAPAN DATA EMIS */}
        <div className="pt-3.5 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex-1 space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-600 flex items-center gap-1.5">
                Kelengkapan Berkas EMIS
                <span className="text-[11px] font-normal text-slate-400">
                  ({lengkapCount} dari {totalSantri} santri lengkap)
                </span>
              </span>
              <span className={`font-mono font-extrabold ${
                persentaseLengkap === 100 ? 'text-emerald-700' : 'text-amber-700'
              }`}>
                {persentaseLengkap}%
              </span>
            </div>
            <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald-600 rounded-full transition-all duration-500"
                style={{ width: `${persentaseLengkap}%` }}
              />
            </div>
          </div>

          <div className="shrink-0 flex flex-wrap items-center justify-end gap-2">
            {menungguPenempatanCount > 0 && (
              <button
                type="button"
                onClick={() =>
                  setFilterKamar(
                    filterKamar === 'Menunggu Penempatan' ? 'Semua' : 'Menunggu Penempatan'
                  )
                }
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all border cursor-pointer ${
                  filterKamar === 'Menunggu Penempatan'
                    ? 'bg-indigo-700 text-white border-indigo-700 shadow-xs'
                    : 'bg-indigo-50 text-indigo-800 border-indigo-200 hover:bg-indigo-100'
                }`}
              >
                {filterKamar === 'Menunggu Penempatan'
                  ? `Menampilkan ${menungguPenempatanCount} Belum Punya Kamar (Reset)`
                  : `${menungguPenempatanCount} Santri Menunggu Penempatan Kamar`}
              </button>
            )}
            {belumLengkapCount > 0 ? (
              <button
                type="button"
                onClick={() => setFilterKelengkapan(filterKelengkapan === 'Belum' ? 'Semua' : 'Belum')}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all border ${
                  filterKelengkapan === 'Belum'
                    ? 'bg-amber-600 text-white border-amber-600 shadow-xs'
                    : 'bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100'
                }`}
              >
                <AlertCircle className="w-3.5 h-3.5" />
                {filterKelengkapan === 'Belum'
                  ? `Menampilkan ${belumLengkapCount} Belum Lengkap (Reset)`
                  : `${belumLengkapCount} Santri Belum Lengkap →`}
              </button>
            ) : totalSantri > 0 ? (
              <span className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-emerald-50 text-emerald-800 border border-emerald-200 flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                Semua Data Lengkap
              </span>
            ) : null}
          </div>
        </div>
      </div>

      {/* ACTION BAR SELEKSI MASSAL (CETAK BUKU INDUK MASSAL & MUTASI) */}
      {selectedIds.length > 0 && (
        <div className="bg-emerald-900 text-white p-4 rounded-2xl flex flex-wrap items-center justify-between gap-3 text-xs shadow-lg print:hidden">
          <span className="font-semibold">{selectedIds.length} Santri Terpilih</span>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleBulkPrintBukuInduk}
              className="px-3.5 py-2 bg-white text-emerald-950 hover:bg-emerald-50 font-bold rounded-lg flex items-center gap-1.5 transition-colors shadow-xs"
            >
              <Printer className="w-3.5 h-3.5 text-emerald-700" />
              Cetak Buku Induk ({selectedIds.length} Lembar)
            </button>

            {canEditSantri && (
              <button
                onClick={handleBulkMutasiAlBurhany}
                className="px-3.5 py-2 bg-amber-600 hover:bg-amber-500 font-bold rounded-lg flex items-center gap-1.5 transition-colors"
              >
                <ArrowRightLeft className="w-3.5 h-3.5" />
                Mutasi ke An-Nur Al-Burhany
              </button>
            )}

            <button
              onClick={() => setSelectedIds([])}
              className="px-3 py-2 bg-emerald-800 hover:bg-emerald-700 rounded-lg transition-colors"
            >
              Batal
            </button>
          </div>
        </div>
      )}

      {/* FILTER & PENCARIAN */}
      <div className="bg-white p-3.5 sm:p-4 rounded-2xl border border-slate-200 shadow-sm grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-2.5 print:hidden">
        <div className="relative sm:col-span-2 lg:col-span-5 min-w-0">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            placeholder="Cari Nama Santri atau NIS..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full min-h-[40px] pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-600"
          />
        </div>

        <select
          value={filterKelengkapan}
          onChange={(e) => setFilterKelengkapan(e.target.value)}
          className="lg:col-span-3 min-h-[40px] bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-700 px-3 py-2 rounded-xl"
        >
          <option value="Semua">Semua Kelengkapan EMIS</option>
          <option value="Lengkap">Berkas EMIS Lengkap</option>
          <option value="Belum">Berkas Belum Lengkap</option>
        </select>

        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="lg:col-span-2 min-h-[40px] bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-700 px-3 py-2 rounded-xl"
        >
          <option value="Semua">Semua Status</option>
          <option value="aktif">Aktif (Induk)</option>
          <option value="pindah_al_burhany">An-Nur Al-Burhany</option>
          <option value="boyong">Boyong</option>
        </select>

        <select
          value={filterKamar}
          onChange={(e) => setFilterKamar(e.target.value)}
          className="sm:col-span-2 lg:col-span-2 min-h-[40px] bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-700 px-3 py-2 rounded-xl"
        >
          <option value="Semua">Semua Kamar</option>
          <option value="Menunggu Penempatan">Menunggu Penempatan</option>
          {daftarKamar.map((k) => (
            <option key={k} value={k}>Kamar {k}</option>
          ))}
        </select>
      </div>

      {/* TABEL & KARTU SANTRI */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden print:hidden">
        {/* MOBILE CARD VIEW (PWA / HP) */}
        <div className="md:hidden divide-y divide-slate-100">
          {loading ? (
            <div className="p-8 text-center text-xs text-slate-400">Memuat data santri...</div>
          ) : fetchError ? (
            <div className="p-8 text-center">
              <div className="inline-flex flex-col items-center gap-2 text-rose-700">
                <AlertCircle className="w-6 h-6 text-rose-600" />
                <p className="font-semibold text-xs">Gagal memuat data santri: {fetchError}</p>
                <button
                  type="button"
                  onClick={fetchSantri}
                  className="min-h-[40px] px-3.5 py-2 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-xl text-xs font-bold text-rose-800"
                >
                  Muat Ulang Data
                </button>
              </div>
            </div>
          ) : filteredSantri.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-400">Tidak ada data santri yang cocok.</div>
          ) : (
            filteredSantri.map((item) => {
              const statusEmis = cekKelengkapanEmis(item);
              const hasAyah = item.no_wa_ayah && String(item.no_wa_ayah).trim() !== '';
              const hasIbu = item.no_wa_ibu && String(item.no_wa_ibu).trim() !== '';
              const hasWali = item.no_wa_wali && String(item.no_wa_wali).trim() !== '';
              const isSelected = selectedIds.includes(item.id);

              return (
                <div key={item.id} className="p-4 space-y-2.5 text-xs">
                  <div className="flex items-start justify-between gap-2.5">
                    <div className="flex items-start gap-2.5 min-w-0">
                      <input
                        type="checkbox"
                        aria-label={`Pilih ${item.nama_lengkap}`}
                        checked={isSelected}
                        onChange={(e) => {
                          if (e.target.checked) setSelectedIds([...selectedIds, item.id]);
                          else setSelectedIds(selectedIds.filter((id) => id !== item.id));
                        }}
                        className="mt-1 w-4 h-4 accent-emerald-700 shrink-0"
                      />
                      <div className="min-w-0">
                        <div className="font-bold text-sm text-slate-900 leading-snug">
                          {item.nama_lengkap}
                        </div>
                        <div className="text-[11px] text-slate-500 font-mono mt-0.5 tabular-nums">
                          NIS {item.nis}
                          {item.nisn ? ` · NISN ${item.nisn}` : ''}
                        </div>
                      </div>
                    </div>
                    <span className="px-2 py-0.5 bg-slate-100 text-slate-700 font-bold rounded-md text-[11px] whitespace-nowrap shrink-0">
                      Kamar {item.kamar}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    {statusEmis.lengkap ? (
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 whitespace-nowrap">
                        EMIS LENGKAP
                      </span>
                    ) : (
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 whitespace-nowrap">
                        EMIS BELUM ({statusEmis.kurang})
                      </span>
                    )}
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold whitespace-nowrap ${
                        item.status === 'aktif'
                          ? 'bg-emerald-100 text-emerald-800'
                          : item.status === 'pindah_al_burhany'
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-rose-100 text-rose-800'
                      }`}
                    >
                      {String(item.status || 'aktif').toUpperCase()}
                    </span>
                  </div>

                  {(hasAyah || hasIbu || hasWali) && (
                    <div className="bg-slate-50 border border-slate-100 rounded-xl p-2.5 space-y-1">
                      {hasAyah && renderKontakRow('Ayah', item.no_wa_ayah)}
                      {hasIbu && renderKontakRow('Ibu', item.no_wa_ibu)}
                      {!hasAyah && !hasIbu && hasWali && renderKontakRow('Wali', item.no_wa_wali)}
                    </div>
                  )}

                  <div className="flex items-center gap-2 pt-0.5">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedSantri(item);
                        setShowModalDetail(true);
                      }}
                      className="flex-1 min-h-[40px] px-3 py-2 bg-slate-100 hover:bg-slate-200 font-bold rounded-xl text-slate-700 text-xs"
                    >
                      Detail Santri
                    </button>
                    {canEditSantri && (
                      <button
                        type="button"
                        onClick={() => handleOpenEditModal(item)}
                        className="flex-1 min-h-[40px] px-3 py-2 bg-amber-50 hover:bg-amber-100 text-amber-800 font-bold rounded-xl border border-amber-200 text-xs flex items-center justify-center gap-1.5"
                      >
                        <Edit3 className="w-3.5 h-3.5" /> Edit Data
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* DESKTOP TABLE VIEW */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-700">
            <thead className="bg-slate-50 border-b border-slate-200 font-bold text-slate-600 uppercase tracking-wider text-[11px]">
              <tr>
                <th className="py-3 px-3 w-10 text-center">
                  <input
                    type="checkbox"
                    aria-label="Pilih semua santri"
                    checked={filteredSantri.length > 0 && selectedIds.length === filteredSantri.length}
                    onChange={(e) => setSelectedIds(e.target.checked ? filteredSantri.map((s) => s.id) : [])}
                  />
                </th>
                <th className="py-3 px-3 w-28 whitespace-nowrap">NIS / NISN</th>
                <th className="py-3 px-3 min-w-[170px]">Nama Lengkap</th>
                <th className="py-3 px-3 w-24 whitespace-nowrap">Kamar</th>
                <th className="py-3 px-3 min-w-[190px]">Kontak Ortu / WA</th>
                <th className="py-3 px-3 w-40 whitespace-nowrap">Kelengkapan EMIS</th>
                <th className="py-3 px-3 w-28 whitespace-nowrap">Status</th>
                <th className="py-3 px-3 w-[150px] text-right whitespace-nowrap">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-slate-400">Memuat data santri...</td>
                </tr>
              ) : fetchError ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center">
                    <div className="inline-flex flex-col items-center gap-2 text-rose-700">
                      <AlertCircle className="w-6 h-6 text-rose-600" />
                      <p className="font-semibold text-xs">Gagal memuat data santri: {fetchError}</p>
                      <button
                        type="button"
                        onClick={fetchSantri}
                        className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg text-xs font-bold text-rose-800"
                      >
                        Muat Ulang Data
                      </button>
                    </div>
                  </td>
                </tr>
              ) : filteredSantri.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-slate-400">Tidak ada data santri yang cocok.</td>
                </tr>
              ) : (
                filteredSantri.map((item) => {
                  const statusEmis = cekKelengkapanEmis(item);
                  const hasAyah = item.no_wa_ayah && String(item.no_wa_ayah).trim() !== '';
                  const hasIbu = item.no_wa_ibu && String(item.no_wa_ibu).trim() !== '';
                  const hasWali = item.no_wa_wali && String(item.no_wa_wali).trim() !== '';

                  return (
                    <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                      <td className="py-3 px-3 text-center">
                        <input
                          type="checkbox"
                          aria-label={`Pilih ${item.nama_lengkap}`}
                          checked={selectedIds.includes(item.id)}
                          onChange={(e) => {
                            if (e.target.checked) setSelectedIds([...selectedIds, item.id]);
                            else setSelectedIds(selectedIds.filter((id) => id !== item.id));
                          }}
                        />
                      </td>
                      <td className="py-3 px-3 font-mono font-bold text-emerald-800 whitespace-nowrap tabular-nums">
                        {item.nis}
                        {item.nisn && <span className="block text-[10px] text-slate-400 font-normal">NISN: {item.nisn}</span>}
                      </td>
                      <td className="py-3 px-3 font-semibold text-slate-800">{item.nama_lengkap}</td>
                      <td className="py-3 px-3 whitespace-nowrap">
                        <span className="px-2.5 py-1 bg-slate-100 text-slate-700 font-semibold rounded-lg whitespace-nowrap">
                          {item.kamar}
                        </span>
                      </td>

                      <td className="py-3 px-3">
                        {hasAyah || hasIbu ? (
                          <div className="space-y-1 whitespace-nowrap">
                            {hasAyah && renderKontakRow('Ayah', item.no_wa_ayah)}
                            {hasIbu && renderKontakRow('Ibu', item.no_wa_ibu)}
                          </div>
                        ) : hasWali ? (
                          <div className="whitespace-nowrap">{renderKontakRow('Wali', item.no_wa_wali)}</div>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </td>

                      <td className="py-3 px-3 whitespace-nowrap">
                        {statusEmis.lengkap ? (
                          <span className="inline-flex px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 whitespace-nowrap">
                            LENGKAP
                          </span>
                        ) : (
                          <span className="inline-flex px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 whitespace-nowrap">
                            BELUM LENGKAP ({statusEmis.kurang})
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-3 whitespace-nowrap">
                        <span className={`inline-flex px-2.5 py-1 rounded-full text-[10px] font-bold whitespace-nowrap ${
                          item.status === 'aktif' ? 'bg-emerald-100 text-emerald-800' :
                          item.status === 'pindah_al_burhany' ? 'bg-amber-100 text-amber-800' : 'bg-rose-100 text-rose-800'
                        }`}>
                          {String(item.status || 'aktif').toUpperCase()}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-right">
                        <div className="flex flex-nowrap items-center justify-end gap-1.5">
                          <button
                            onClick={() => {
                              setSelectedSantri(item);
                              setShowModalDetail(true);
                            }}
                            className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 font-bold rounded-lg text-slate-700 text-xs whitespace-nowrap shrink-0"
                          >
                            Detail
                          </button>
                          {canEditSantri && (
                            <button
                              onClick={() => handleOpenEditModal(item)}
                              className="px-2.5 py-1 bg-amber-50 hover:bg-amber-100 text-amber-700 font-bold rounded-lg border border-amber-200 text-xs inline-flex items-center gap-1 whitespace-nowrap shrink-0"
                            >
                              <Edit3 className="w-3 h-3" /> Edit
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ================================================================= */}
      {/* MODAL 1: PENDAFTARAN SANTRI BARU (RINGKAS & CEPAT)                */}
      {/* ================================================================= */}
      {showModalForm && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 print:hidden">
          <div className="bg-white rounded-2xl max-w-2xl w-full shadow-2xl border border-slate-200 overflow-hidden max-h-[92vh] flex flex-col">
            <div className="bg-emerald-900 text-white px-6 py-4 flex justify-between items-center">
              <div>
                <h3 className="font-bold text-sm">Pendaftaran Santri Baru (Satuan)</h3>
                <span className="text-[11px] text-emerald-200 font-mono">Auto NIS Terjadwal: {nextNisPreview}</span>
              </div>
              <button onClick={() => setShowModalForm(false)} className="text-emerald-200 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveSantri} className="p-6 space-y-4 text-xs overflow-y-auto">
              <div className="p-4 bg-emerald-50/70 rounded-xl border border-emerald-200 space-y-3">
                <div className="flex flex-wrap justify-between items-center gap-2">
                  <span className="font-bold text-emerald-900">1. Skema Biaya Pendaftaran (PSB)</span>
                  <span className="text-[11px] font-bold text-emerald-800 tabular-nums">
                    {rincianPsbAktif.isFreeUangPangkal
                      ? `Promo Free Uang Pangkal (${santriList.length}/${rincianPsbAktif.kuotaPromoTotal} pendaftar)`
                      : `Tarif Normal (Kuota ${rincianPsbAktif.kuotaPromoTotal} penuh)`}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label className={`p-3 border rounded-xl flex items-start gap-2.5 cursor-pointer transition-all ${
                    formData.paket_pendaftaran === 'reguler' && !isCustomNominal ? 'bg-white border-emerald-600 ring-2 ring-emerald-600/20' : 'bg-white/70 border-slate-200'
                  }`}>
                    <input
                      type="radio"
                      name="paket"
                      className="mt-0.5"
                      checked={formData.paket_pendaftaran === 'reguler'}
                      onChange={() => handleSelectPaketPendaftaran('reguler')}
                    />
                    <div className="min-w-0">
                      <span className="font-bold text-slate-800 block">Paket Reguler</span>
                      <span className="text-xs text-emerald-700 font-bold tabular-nums block">
                        Rp {rincianReguler.totalBayar.toLocaleString('id-ID')}
                      </span>
                      {rincianReguler.isFreeUangPangkal && (
                        <span className="text-[10px] text-slate-500 tabular-nums block">
                          Normal Rp {rincianReguler.totalNormal.toLocaleString('id-ID')} (Free Uang Pangkal)
                        </span>
                      )}
                    </div>
                  </label>

                  <label className={`p-3 border rounded-xl flex items-start gap-2.5 cursor-pointer transition-all ${
                    formData.paket_pendaftaran === 'vip' && !isCustomNominal ? 'bg-white border-emerald-600 ring-2 ring-emerald-600/20' : 'bg-white/70 border-slate-200'
                  }`}>
                    <input
                      type="radio"
                      name="paket"
                      className="mt-0.5"
                      checked={formData.paket_pendaftaran === 'vip'}
                      onChange={() => handleSelectPaketPendaftaran('vip')}
                    />
                    <div className="min-w-0">
                      <span className="font-bold text-slate-800 block">Paket Kamar VIP (+Dipan)</span>
                      <span className="text-xs text-emerald-700 font-bold tabular-nums block">
                        Rp {rincianVip.totalBayar.toLocaleString('id-ID')}
                      </span>
                      {rincianVip.isFreeUangPangkal && (
                        <span className="text-[10px] text-slate-500 tabular-nums block">
                          Normal Rp {rincianVip.totalNormal.toLocaleString('id-ID')} (Free Uang Pangkal)
                        </span>
                      )}
                    </div>
                  </label>
                </div>

                {/* Rincian Otomatis Sesuai Skema + Pembagian Dompet Keuangan */}
                {!isCustomNominal && (
                  <div className="bg-white rounded-xl border border-emerald-200/80 p-3 space-y-2 text-[11px]">
                    <div className="font-bold text-slate-700 flex items-center justify-between">
                      <span>Rincian Komponen ({formData.paket_pendaftaran === 'vip' ? 'Kamar VIP' : 'Reguler'})</span>
                      <span className="text-emerald-800 font-mono tabular-nums">
                        Total: Rp {rincianPsbAktif.totalBayar.toLocaleString('id-ID')}
                      </span>
                    </div>
                    <div className="divide-y divide-slate-100">
                      {rincianPsbAktif.items.map((item) => (
                        <div key={item.label} className="py-1 flex items-center justify-between gap-2">
                          <span className="text-slate-600">
                            {item.label}
                            <span className="text-[10px] text-slate-400 ml-1.5">
                              ({item.targetDompet === 'operasional' ? 'Dompet Operasional' : 'Dompet Pendaftaran'})
                            </span>
                          </span>
                          <span className="font-mono font-semibold text-slate-900 tabular-nums shrink-0">
                            {item.isFreePromo ? (
                              <span>
                                <span className="line-through text-slate-400 mr-1.5">
                                  Rp {item.nominalNormal.toLocaleString('id-ID')}
                                </span>
                                <span className="text-emerald-700 font-bold">GRATIS</span>
                              </span>
                            ) : (
                              `Rp ${item.nominalBayar.toLocaleString('id-ID')}`
                            )}
                          </span>
                        </div>
                      ))}
                    </div>
                    <div className="pt-1.5 border-t border-slate-100 flex flex-wrap justify-between gap-2 text-[10px] text-slate-500 tabular-nums">
                      <span>
                        Masuk Dompet Pendaftaran: <strong className="text-slate-800">Rp {rincianPsbAktif.nominalDompetPendaftaran.toLocaleString('id-ID')}</strong>
                      </span>
                      <span>
                        Masuk Dompet Operasional (Syahriyah Bln 1): <strong className="text-emerald-800">Rp {rincianPsbAktif.nominalSyahriyahBulanPertama.toLocaleString('id-ID')}</strong>
                      </span>
                    </div>
                  </div>
                )}

                <div className="flex items-center gap-2 pt-1">
                  <input
                    type="checkbox"
                    id="customToggle"
                    checked={isCustomNominal}
                    onChange={(e) => setIsCustomNominal(e.target.checked)}
                  />
                  <label htmlFor="customToggle" className="font-semibold text-slate-700 cursor-pointer">
                    Gunakan Nominal Custom (Isi Biaya Final Setelah Keringanan)
                  </label>
                </div>

                {isCustomNominal && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                    <div>
                      <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                        Biaya Final Dibayar: <strong className="text-emerald-800">Rp {Number(formData.nominal_pendaftaran || 0).toLocaleString('id-ID')}</strong>
                      </label>
                      <input
                        type="number"
                        required
                        min={0}
                        placeholder="Contoh: 2000000"
                        value={formData.nominal_pendaftaran}
                        onChange={(e) => setFormData({ ...formData, nominal_pendaftaran: Number(e.target.value) })}
                        className="w-full p-2.5 bg-white border border-emerald-300 rounded-xl font-mono"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-semibold text-slate-600 block mb-1">Catatan Keringanan (Wajib jika custom)</label>
                      <input
                        type="text"
                        required
                        placeholder="Contoh: Keringanan Yatim / Rekomendasi Pengasuh..."
                        value={formData.catatan_keringanan}
                        onChange={(e) => setFormData({ ...formData, catatan_keringanan: e.target.value })}
                        className="w-full p-2.5 bg-white border border-emerald-300 rounded-xl"
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-3">
                <span className="font-bold text-slate-800 block border-b pb-1">2. Identitas Awal &amp; Penempatan Kamar</span>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">Tanggal Masuk (Ref. NIS) *</label>
                    <input
                      type="date"
                      required
                      value={formData.tgl_masuk}
                      onChange={(e) => setFormData({ ...formData, tgl_masuk: e.target.value })}
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="font-semibold text-slate-700 block mb-1">Nama Lengkap Santri *</label>
                    <input
                      type="text"
                      required
                      placeholder="Masukkan nama lengkap santri..."
                      value={formData.nama_lengkap}
                      onChange={(e) => setFormData({ ...formData, nama_lengkap: e.target.value })}
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">Khos / Kamar *</label>
                    <select
                      value={formData.kamar}
                      onChange={(e) => handleSelectKamarPendaftaran(e.target.value)}
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                    >
                      {daftarKamar.map((k) => (
                        <option key={k} value={k}>Kamar {k}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">No. HP / WA Orang Tua / Wali *</label>
                    <input
                      type="text"
                      required
                      placeholder="081234567890"
                      value={formData.no_wa_wali}
                      onChange={(e) => setFormData({ ...formData, no_wa_wali: e.target.value })}
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono"
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-2 border-t pt-3">
                <span className="font-bold text-slate-800 block">3. Alamat Domisili *</span>
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Ketik nama Desa / Kelurahan / Kecamatan / Kabupaten..."
                    value={wilayahQuery}
                    onChange={(e) => searchWilayah(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-emerald-300 rounded-xl"
                  />
                  {wilayahResults.length > 0 && (
                    <div className="absolute top-full left-0 right-0 bg-white border border-slate-200 rounded-xl shadow-xl z-50 max-h-44 overflow-y-auto mt-1">
                      {wilayahResults.map((w, idx) => (
                        <div
                          key={idx}
                          onClick={() => selectWilayah(w, false)}
                          className="p-2.5 hover:bg-emerald-50 cursor-pointer border-b text-[11px]"
                        >
                          <strong>{w.Kelurahan}</strong>, Kec. {w.Kecamatan}, {w.Kabupaten}, {w.Provinsi} (<span className="font-mono text-emerald-700">{w['Kode Pos']}</span>)
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-3 gap-2 text-[11px] text-slate-600 bg-slate-50 p-3 rounded-xl border border-slate-100">
                  <div>Desa: <strong>{formData.desa || '-'}</strong></div>
                  <div>Kecamatan: <strong>{formData.kecamatan || '-'}</strong></div>
                  <div>Kode Pos: <strong className="font-mono text-emerald-800">{formData.kode_pos || '-'}</strong></div>
                </div>

                <input
                  type="text"
                  placeholder="Detail Nama Jalan / Dusun / Nomor Rumah..."
                  value={formData.alamat_jalan}
                  onChange={(e) => setFormData({ ...formData, alamat_jalan: e.target.value })}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                />
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={saving}
                  className="w-full py-3 bg-emerald-700 text-white font-bold rounded-xl hover:bg-emerald-800 transition-colors shadow-sm"
                >
                  {saving ? 'Menyimpan Data...' : 'Simpan & Daftarkan Santri Baru'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* MODAL 2: EDIT LENGKAP 39 KOLOM EMIS (FLEKSIBEL & BERTAB)          */}
      {/* ================================================================= */}
      {showModalEdit && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 print:hidden">
          <div className="bg-white rounded-2xl max-w-3xl w-full shadow-2xl border border-slate-200 overflow-hidden max-h-[92vh] flex flex-col">
            <div className="bg-emerald-900 text-white px-6 py-4 flex justify-between items-center">
              <div>
                <h3 className="font-bold text-sm">Lengkapi &amp; Edit Data Santri (39 Kolom EMIS)</h3>
                <span className="text-[11px] text-emerald-200 font-mono">NIS: {editFormData.nis} • {editFormData.nama_lengkap}</span>
              </div>
              <button onClick={() => setShowModalEdit(false)} className="text-emerald-200 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex border-b border-slate-200 bg-slate-50 px-6 pt-2 gap-2 text-xs font-bold overflow-x-auto">
              <button
                type="button"
                onClick={() => setActiveEditTab('pribadi')}
                className={`px-4 py-2.5 rounded-t-xl border-b-2 transition-colors whitespace-nowrap ${
                  activeEditTab === 'pribadi' ? 'bg-white border-emerald-700 text-emerald-800' : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}
              >
                1. Data Pribadi &amp; Pondok
              </button>
              <button
                type="button"
                onClick={() => setActiveEditTab('ortu')}
                className={`px-4 py-2.5 rounded-t-xl border-b-2 transition-colors whitespace-nowrap ${
                  activeEditTab === 'ortu' ? 'bg-white border-emerald-700 text-emerald-800' : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}
              >
                2. Data Ayah &amp; Ibu
              </button>
              <button
                type="button"
                onClick={() => setActiveEditTab('wali')}
                className={`px-4 py-2.5 rounded-t-xl border-b-2 transition-colors whitespace-nowrap ${
                  activeEditTab === 'wali' ? 'bg-white border-emerald-700 text-emerald-800' : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}
              >
                3. Data Wali (Kondisional)
              </button>
              <button
                type="button"
                onClick={() => setActiveEditTab('alamat')}
                className={`px-4 py-2.5 rounded-t-xl border-b-2 transition-colors whitespace-nowrap ${
                  activeEditTab === 'alamat' ? 'bg-white border-emerald-700 text-emerald-800' : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}
              >
                4. Alamat Domisili
              </button>
            </div>

            <form onSubmit={handleUpdateSantri} className="p-6 space-y-4 text-xs overflow-y-auto flex-1">
              {activeEditTab === 'pribadi' && (
                <div className="space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div>
                      <label className="font-semibold text-slate-700 block mb-1">Tanggal Masuk <span className="text-rose-600">*Wajib</span></label>
                      <input type="date" value={editFormData.tgl_masuk || ''} onChange={(e) => setEditFormData({ ...editFormData, tgl_masuk: e.target.value })} className="w-full p-2.5 bg-slate-50 border rounded-xl" />
                    </div>
                    <div className="md:col-span-2">
                      <label className="font-semibold text-slate-700 block mb-1">Nama Lengkap <span className="text-rose-600">*Wajib</span></label>
                      <input type="text" required value={editFormData.nama_lengkap || ''} onChange={(e) => setEditFormData({ ...editFormData, nama_lengkap: e.target.value })} className="w-full p-2.5 bg-slate-50 border rounded-xl" />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div>
                      <label className="font-semibold text-slate-700 block mb-1">Khos / Kamar <span className="text-rose-600">*Wajib</span></label>
                      <select value={editFormData.kamar || 'A1'} onChange={(e) => setEditFormData({ ...editFormData, kamar: e.target.value })} className="w-full p-2.5 bg-slate-50 border rounded-xl">
                        {daftarKamar.map((k) => (
                          <option key={k} value={k}>Kamar {k}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="font-semibold text-slate-700 block mb-1">Tipe SPP / Syahriyah <span className="text-rose-600">*Wajib</span></label>
                      <select value={editFormData.tarif_syahriyah || skemaPendaftaran.syahriyah_reguler} onChange={(e) => setEditFormData({ ...editFormData, tarif_syahriyah: Number(e.target.value) })} className="w-full p-2.5 bg-slate-50 border rounded-xl">
                        <option value={skemaPendaftaran.syahriyah_reguler}>
                          Reguler (Rp {skemaPendaftaran.syahriyah_reguler.toLocaleString('id-ID')})
                        </option>
                        <option value={skemaPendaftaran.syahriyah_vip}>
                          VIP / Al-Fachriyah (Rp {skemaPendaftaran.syahriyah_vip.toLocaleString('id-ID')})
                        </option>
                        <option value={145000}>Santri Ndalem (Rp 145.000)</option>
                      </select>
                    </div>
                    <div>
                      <label className="font-semibold text-slate-700 block mb-1">Status Santri</label>
                      <select value={editFormData.status || 'aktif'} onChange={(e) => setEditFormData({ ...editFormData, status: e.target.value })} className="w-full p-2.5 bg-slate-50 border rounded-xl">
                        <option value="aktif">Aktif (Induk)</option>
                        <option value="pindah_al_burhany">Pindah An-Nur Al-Burhany</option>
                        <option value="boyong">Boyong</option>
                        <option value="alumni">Alumni</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div>
                      <label className="font-semibold text-slate-700 block mb-1">NISN <span className="text-rose-600">*Wajib</span></label>
                      <input type="text" value={editFormData.nisn || ''} onChange={(e) => setEditFormData({ ...editFormData, nisn: e.target.value })} className="w-full p-2.5 bg-slate-50 border rounded-xl font-mono" />
                    </div>
                    <div>
                      <label className="font-semibold text-slate-700 block mb-1">NIK Santri <span className="text-rose-600">*Wajib</span></label>
                      <input type="text" value={editFormData.nik || ''} onChange={(e) => setEditFormData({ ...editFormData, nik: e.target.value })} className="w-full p-2.5 bg-slate-50 border rounded-xl font-mono" />
                    </div>
                    <div>
                      <label className="font-semibold text-slate-700 block mb-1">Nomor KK <span className="text-slate-400">(Opsional)</span></label>
                      <input type="text" value={editFormData.no_kk || ''} onChange={(e) => setEditFormData({ ...editFormData, no_kk: e.target.value })} className="w-full p-2.5 bg-slate-50 border rounded-xl font-mono" />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div>
                      <label className="font-semibold text-slate-700 block mb-1">Tempat Lahir <span className="text-rose-600">*Wajib</span></label>
                      <input type="text" value={editFormData.tempat_lahir || ''} onChange={(e) => setEditFormData({ ...editFormData, tempat_lahir: e.target.value })} className="w-full p-2.5 bg-slate-50 border rounded-xl" />
                    </div>
                    <div>
                      <label className="font-semibold text-slate-700 block mb-1">Tanggal Lahir <span className="text-rose-600">*Wajib</span></label>
                      <input type="date" value={editFormData.tgl_lahir || ''} onChange={(e) => setEditFormData({ ...editFormData, tgl_lahir: e.target.value })} className="w-full p-2.5 bg-slate-50 border rounded-xl" />
                    </div>
                    <div>
                      <label className="font-semibold text-slate-700 block mb-1">Jenis Kelamin <span className="text-rose-600">*Wajib</span></label>
                      <select value={editFormData.jk || 'L'} onChange={(e) => setEditFormData({ ...editFormData, jk: e.target.value })} className="w-full p-2.5 bg-slate-50 border rounded-xl">
                        <option value="L">Laki-laki (L)</option>
                        <option value="P">Perempuan (P)</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="font-semibold text-slate-700 block mb-1">Hobi <span className="text-slate-400">(Opsional)</span></label>
                      <input type="text" value={editFormData.hobi || ''} onChange={(e) => setEditFormData({ ...editFormData, hobi: e.target.value })} className="w-full p-2.5 bg-slate-50 border rounded-xl" />
                    </div>
                    <div>
                      <label className="font-semibold text-slate-700 block mb-1">Cita-Cita <span className="text-slate-400">(Opsional)</span></label>
                      <input type="text" value={editFormData.cita_cita || ''} onChange={(e) => setEditFormData({ ...editFormData, cita_cita: e.target.value })} className="w-full p-2.5 bg-slate-50 border rounded-xl" />
                    </div>
                  </div>
                </div>
              )}

              {activeEditTab === 'ortu' && (
                <div className="space-y-5">
                  <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="font-bold text-slate-800">Data Ayah Kandung</span>
                      <select
                        value={editFormData.status_ayah || 'Hidup'}
                        onChange={(e) => {
                          const val = e.target.value;
                          setEditFormData({ ...editFormData, status_ayah: val });
                          if (val === 'Meninggal') setWaliSamaAyah(false);
                        }}
                        className="px-3 py-1.5 bg-white border rounded-lg font-bold text-emerald-800"
                      >
                        <option value="Hidup">Status Ayah: Masih Hidup</option>
                        <option value="Meninggal">Status Ayah: Meninggal Dunia</option>
                      </select>
                    </div>

                    {editFormData.status_ayah === 'Meninggal' ? (
                      <p className="text-[11px] text-slate-500 italic">Kolom biodata ayah dinonaktifkan otomatis karena berstatus Meninggal Dunia.</p>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div>
                          <label className="font-semibold text-slate-700 block mb-1">Nama Ayah <span className="text-rose-600">*Wajib</span></label>
                          <input type="text" value={editFormData.nama_ayah || ''} onChange={(e) => setEditFormData({ ...editFormData, nama_ayah: e.target.value })} className="w-full p-2 bg-white border rounded-xl" />
                        </div>
                        <div>
                          <label className="font-semibold text-slate-700 block mb-1">NIK Ayah <span className="text-slate-400">(Opsional)</span></label>
                          <input type="text" value={editFormData.nik_ayah || ''} onChange={(e) => setEditFormData({ ...editFormData, nik_ayah: e.target.value })} className="w-full p-2 bg-white border rounded-xl font-mono" />
                        </div>
                        <div>
                          <label className="font-semibold text-slate-700 block mb-1">Pendidikan Ayah <span className="text-rose-600">*Wajib</span></label>
                          <input type="text" placeholder="SD/SMP/SMA/S1..." value={editFormData.pendidikan_ayah || ''} onChange={(e) => setEditFormData({ ...editFormData, pendidikan_ayah: e.target.value })} className="w-full p-2 bg-white border rounded-xl" />
                        </div>
                        <div>
                          <label className="font-semibold text-slate-700 block mb-1">Pekerjaan Ayah <span className="text-rose-600">*Wajib</span></label>
                          <input type="text" value={editFormData.pekerjaan_ayah || ''} onChange={(e) => setEditFormData({ ...editFormData, pekerjaan_ayah: e.target.value })} className="w-full p-2 bg-white border rounded-xl" />
                        </div>
                        <div>
                          <label className="font-semibold text-slate-700 block mb-1">Penghasilan Ayah <span className="text-slate-400">(Opsional)</span></label>
                          <input type="text" value={editFormData.penghasilan_ayah || ''} onChange={(e) => setEditFormData({ ...editFormData, penghasilan_ayah: e.target.value })} className="w-full p-2 bg-white border rounded-xl" />
                        </div>
                        <div>
                          <label className="font-semibold text-slate-700 block mb-1">No. HP/WA Ayah <span className="text-slate-400">(Opsional)</span></label>
                          <input type="text" value={editFormData.no_wa_ayah || ''} onChange={(e) => setEditFormData({ ...editFormData, no_wa_ayah: e.target.value })} className="w-full p-2 bg-white border rounded-xl font-mono" />
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="font-bold text-slate-800">Data Ibu Kandung</span>
                      <select
                        value={editFormData.status_ibu || 'Hidup'}
                        onChange={(e) => setEditFormData({ ...editFormData, status_ibu: e.target.value })}
                        className="px-3 py-1.5 bg-white border rounded-lg font-bold text-emerald-800"
                      >
                        <option value="Hidup">Status Ibu: Masih Hidup</option>
                        <option value="Meninggal">Status Ibu: Meninggal Dunia</option>
                      </select>
                    </div>

                    {editFormData.status_ibu === 'Meninggal' ? (
                      <p className="text-[11px] text-slate-500 italic">Kolom biodata ibu dinonaktifkan otomatis karena berstatus Meninggal Dunia.</p>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div>
                          <label className="font-semibold text-slate-700 block mb-1">Nama Ibu <span className="text-rose-600">*Wajib</span></label>
                          <input type="text" value={editFormData.nama_ibu || ''} onChange={(e) => setEditFormData({ ...editFormData, nama_ibu: e.target.value })} className="w-full p-2 bg-white border rounded-xl" />
                        </div>
                        <div>
                          <label className="font-semibold text-slate-700 block mb-1">NIK Ibu <span className="text-slate-400">(Opsional)</span></label>
                          <input type="text" value={editFormData.nik_ibu || ''} onChange={(e) => setEditFormData({ ...editFormData, nik_ibu: e.target.value })} className="w-full p-2 bg-white border rounded-xl font-mono" />
                        </div>
                        <div>
                          <label className="font-semibold text-slate-700 block mb-1">Pendidikan Ibu <span className="text-rose-600">*Wajib</span></label>
                          <input type="text" placeholder="SD/SMP/SMA/S1..." value={editFormData.pendidikan_ibu || ''} onChange={(e) => setEditFormData({ ...editFormData, pendidikan_ibu: e.target.value })} className="w-full p-2 bg-white border rounded-xl" />
                        </div>
                        <div>
                          <label className="font-semibold text-slate-700 block mb-1">Pekerjaan Ibu <span className="text-rose-600">*Wajib</span></label>
                          <input type="text" value={editFormData.pekerjaan_ibu || ''} onChange={(e) => setEditFormData({ ...editFormData, pekerjaan_ibu: e.target.value })} className="w-full p-2 bg-white border rounded-xl" />
                        </div>
                        <div>
                          <label className="font-semibold text-slate-700 block mb-1">Penghasilan Ibu <span className="text-slate-400">(Opsional)</span></label>
                          <input type="text" value={editFormData.penghasilan_ibu || ''} onChange={(e) => setEditFormData({ ...editFormData, penghasilan_ibu: e.target.value })} className="w-full p-2 bg-white border rounded-xl" />
                        </div>
                        <div>
                          <label className="font-semibold text-slate-700 block mb-1">No. HP/WA Ibu <span className="text-slate-400">(Opsional)</span></label>
                          <input type="text" value={editFormData.no_wa_ibu || ''} onChange={(e) => setEditFormData({ ...editFormData, no_wa_ibu: e.target.value })} className="w-full p-2 bg-white border rounded-xl font-mono" />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* TAB 3: DATA WALI DENGAN TOGGLE SAMA DENGAN AYAH */}
              {activeEditTab === 'wali' && (
                <div className="space-y-4">
                  <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between gap-4">
                    <div className="flex items-start gap-2.5">
                      <ShieldCheck className="w-5 h-5 text-emerald-700 shrink-0 mt-0.5" />
                      <div>
                        <span className="font-bold text-emerald-950 block">Wali Santri Sama Dengan Ayah Kandung</span>
                        <span className="text-[11px] text-emerald-800">
                          {editFormData.status_ayah === 'Meninggal'
                            ? 'Ayah berstatus Meninggal Dunia — silakan isi biodata Wali Santri (Ibu / Kakek / Paman / Kakak).'
                            : 'Aktifkan jika wali penanggung jawab adalah Ayah kandung (form wali otomatis terkunci & disinkronkan dari data Ayah).'}
                        </span>
                      </div>
                    </div>

                    <button
                      type="button"
                      disabled={editFormData.status_ayah === 'Meninggal'}
                      onClick={() => setWaliSamaAyah(!waliSamaAyah)}
                      className={`w-12 h-6 rounded-full transition-colors p-0.5 shrink-0 ${
                        waliSamaAyah && editFormData.status_ayah !== 'Meninggal' ? 'bg-emerald-700' : 'bg-slate-300'
                      } ${editFormData.status_ayah === 'Meninggal' ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                    >
                      <div
                        className={`w-5 h-5 rounded-full bg-white shadow transition-transform ${
                          waliSamaAyah && editFormData.status_ayah !== 'Meninggal' ? 'translate-x-6' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>

                  <div className={`grid grid-cols-1 md:grid-cols-2 gap-3 transition-opacity ${
                    waliSamaAyah && editFormData.status_ayah !== 'Meninggal' ? 'opacity-50 pointer-events-none select-none' : ''
                  }`}>
                    <div>
                      <label className="font-semibold text-slate-700 block mb-1">Nama Wali <span className="text-rose-600">*Wajib</span></label>
                      <input
                        type="text"
                        disabled={waliSamaAyah && editFormData.status_ayah !== 'Meninggal'}
                        value={waliSamaAyah && editFormData.status_ayah !== 'Meninggal' ? (editFormData.nama_ayah || '') : (editFormData.nama_wali || '')}
                        onChange={(e) => setEditFormData({ ...editFormData, nama_wali: e.target.value })}
                        className="w-full p-2.5 bg-slate-50 border rounded-xl"
                      />
                    </div>
                    <div>
                      <label className="font-semibold text-slate-700 block mb-1">NIK Wali <span className="text-slate-400">(Opsional)</span></label>
                      <input
                        type="text"
                        disabled={waliSamaAyah && editFormData.status_ayah !== 'Meninggal'}
                        value={waliSamaAyah && editFormData.status_ayah !== 'Meninggal' ? (editFormData.nik_ayah || '') : (editFormData.nik_wali || '')}
                        onChange={(e) => setEditFormData({ ...editFormData, nik_wali: e.target.value })}
                        className="w-full p-2.5 bg-slate-50 border rounded-xl font-mono"
                      />
                    </div>
                    <div>
                      <label className="font-semibold text-slate-700 block mb-1">Pendidikan Wali <span className="text-rose-600">*Wajib</span></label>
                      <input
                        type="text"
                        disabled={waliSamaAyah && editFormData.status_ayah !== 'Meninggal'}
                        value={waliSamaAyah && editFormData.status_ayah !== 'Meninggal' ? (editFormData.pendidikan_ayah || '') : (editFormData.pendidikan_wali || '')}
                        onChange={(e) => setEditFormData({ ...editFormData, pendidikan_wali: e.target.value })}
                        className="w-full p-2.5 bg-slate-50 border rounded-xl"
                      />
                    </div>
                    <div>
                      <label className="font-semibold text-slate-700 block mb-1">Pekerjaan Wali <span className="text-rose-600">*Wajib</span></label>
                      <input
                        type="text"
                        disabled={waliSamaAyah && editFormData.status_ayah !== 'Meninggal'}
                        value={waliSamaAyah && editFormData.status_ayah !== 'Meninggal' ? (editFormData.pekerjaan_ayah || '') : (editFormData.pekerjaan_wali || '')}
                        onChange={(e) => setEditFormData({ ...editFormData, pekerjaan_wali: e.target.value })}
                        className="w-full p-2.5 bg-slate-50 border rounded-xl"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="font-semibold text-slate-700 block mb-1">No. HP / WA Wali Utama <span className="text-rose-600">*Wajib</span></label>
                      <input
                        type="text"
                        disabled={waliSamaAyah && editFormData.status_ayah !== 'Meninggal'}
                        value={waliSamaAyah && editFormData.status_ayah !== 'Meninggal' ? (editFormData.no_wa_ayah || '') : (editFormData.no_wa_wali || '')}
                        onChange={(e) => setEditFormData({ ...editFormData, no_wa_wali: e.target.value })}
                        className="w-full p-2.5 bg-slate-50 border rounded-xl font-mono"
                      />
                    </div>
                  </div>
                </div>
              )}

              {activeEditTab === 'alamat' && (
                <div className="space-y-3">
                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">Cari Desa / Kelurahan Otomatis</label>
                    <div className="relative">
                      <input
                        type="text"
                        placeholder="Ketik nama Desa / Kecamatan / Kabupaten..."
                        value={wilayahQuery}
                        onChange={(e) => searchWilayah(e.target.value)}
                        className="w-full p-2.5 bg-slate-50 border border-emerald-300 rounded-xl"
                      />
                      {wilayahResults.length > 0 && (
                        <div className="absolute top-full left-0 right-0 bg-white border border-slate-200 rounded-xl shadow-xl z-50 max-h-44 overflow-y-auto mt-1">
                          {wilayahResults.map((w, idx) => (
                            <div
                              key={idx}
                              onClick={() => selectWilayah(w, true)}
                              className="p-2.5 hover:bg-emerald-50 cursor-pointer border-b text-[11px]"
                            >
                              <strong>{w.Kelurahan}</strong>, Kec. {w.Kecamatan}, {w.Kabupaten} ({w['Kode Pos']})
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                    <div className="md:col-span-2">
                      <label className="font-semibold text-slate-700 block mb-1">Alamat Jalan <span className="text-rose-600">*Wajib</span></label>
                      <input type="text" value={editFormData.alamat_jalan || ''} onChange={(e) => setEditFormData({ ...editFormData, alamat_jalan: e.target.value })} className="w-full p-2.5 bg-slate-50 border rounded-xl" />
                    </div>
                    <div>
                      <label className="font-semibold text-slate-700 block mb-1">RT <span className="text-slate-400">(Opsional)</span></label>
                      <input type="text" value={editFormData.rt || ''} onChange={(e) => setEditFormData({ ...editFormData, rt: e.target.value })} className="w-full p-2.5 bg-slate-50 border rounded-xl" />
                    </div>
                    <div>
                      <label className="font-semibold text-slate-700 block mb-1">RW <span className="text-slate-400">(Opsional)</span></label>
                      <input type="text" value={editFormData.rw || ''} onChange={(e) => setEditFormData({ ...editFormData, rw: e.target.value })} className="w-full p-2.5 bg-slate-50 border rounded-xl" />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    <div>
                      <label className="font-semibold text-slate-700 block mb-1">Desa/Kelurahan <span className="text-rose-600">*Wajib</span></label>
                      <input type="text" value={editFormData.desa || ''} onChange={(e) => setEditFormData({ ...editFormData, desa: e.target.value })} className="w-full p-2.5 bg-slate-50 border rounded-xl" />
                    </div>
                    <div>
                      <label className="font-semibold text-slate-700 block mb-1">Kecamatan <span className="text-rose-600">*Wajib</span></label>
                      <input type="text" value={editFormData.kecamatan || ''} onChange={(e) => setEditFormData({ ...editFormData, kecamatan: e.target.value })} className="w-full p-2.5 bg-slate-50 border rounded-xl" />
                    </div>
                    <div>
                      <label className="font-semibold text-slate-700 block mb-1">Kabupaten <span className="text-rose-600">*Wajib</span></label>
                      <input type="text" value={editFormData.kabupaten || ''} onChange={(e) => setEditFormData({ ...editFormData, kabupaten: e.target.value })} className="w-full p-2.5 bg-slate-50 border rounded-xl" />
                    </div>
                    <div>
                      <label className="font-semibold text-slate-700 block mb-1">Provinsi <span className="text-rose-600">*Wajib</span></label>
                      <input type="text" value={editFormData.provinsi || ''} onChange={(e) => setEditFormData({ ...editFormData, provinsi: e.target.value })} className="w-full p-2.5 bg-slate-50 border rounded-xl" />
                    </div>
                    <div>
                      <label className="font-semibold text-slate-700 block mb-1">Kode Pos <span className="text-rose-600">*Wajib</span></label>
                      <input type="text" value={editFormData.kode_pos || ''} onChange={(e) => setEditFormData({ ...editFormData, kode_pos: e.target.value })} className="w-full p-2.5 bg-slate-50 border rounded-xl font-mono" />
                    </div>
                  </div>
                </div>
              )}

              <div className="pt-3 border-t flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowModalEdit(false)}
                  className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-6 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white font-bold rounded-xl shadow-sm"
                >
                  {saving ? 'Menyimpan...' : 'Simpan Perubahan Data'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* MODAL 3: DETAIL PROFIL SANTRI & BUKU INDUK (TATA LETAK RAPI)      */}
      {/* ================================================================= */}
      {showModalDetail && selectedSantri && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 print:hidden">
          <div className="bg-white rounded-2xl max-w-3xl w-full shadow-2xl border border-slate-200 overflow-hidden max-h-[92vh] flex flex-col">
            <div className="bg-emerald-900 text-white px-6 py-4 flex justify-between items-center">
              <div className="flex items-center gap-2.5">
                <UserCheck className="w-5 h-5 text-emerald-300" />
                <div>
                  <h3 className="font-bold text-sm">Detail Profil Santri &amp; Buku Induk</h3>
                  <p className="text-[11px] text-emerald-200">Ringkasan identitas induk dan kelengkapan berkas EMIS</p>
                </div>
              </div>
              <button onClick={() => setShowModalDetail(false)} className="text-emerald-200 hover:text-white p-1 rounded-lg hover:bg-emerald-800 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 grid grid-cols-1 md:grid-cols-12 gap-6 text-xs overflow-y-auto">
              {/* Panel Kiri: Pas Foto 3x4 & Lencana Status */}
              <div className="md:col-span-4 flex flex-col items-center bg-slate-50/80 border border-slate-200/80 rounded-2xl p-4 justify-between space-y-4">
                <div className="flex flex-col items-center space-y-3 w-full">
                  <div className="w-32 aspect-[3/4] border-2 border-emerald-800/30 rounded-xl flex items-center justify-center overflow-hidden bg-white shadow-xs">
                    {selectedSantri.foto_url ? (
                      <img src={selectedSantri.foto_url} alt="Foto 3x4" className="w-full h-full object-cover" />
                    ) : (
                      <div className="text-center p-3 space-y-1">
                        <Camera className="w-6 h-6 text-slate-300 mx-auto" />
                        <span className="text-slate-400 text-[10px] font-bold block leading-tight">PAS FOTO 3×4<br />BELUM DIUNGGAH</span>
                      </div>
                    )}
                  </div>

                  {canEditSantri && (
                    <label className="w-full justify-center px-3 py-2 bg-emerald-50 text-emerald-800 font-bold rounded-xl cursor-pointer hover:bg-emerald-100 flex items-center gap-1.5 text-[11px] border border-emerald-200 transition-colors">
                      <Camera className="w-3.5 h-3.5" />
                      {uploadingFoto ? 'Mengunggah...' : 'Upload Foto 3×4'}
                      <input type="file" accept="image/*" disabled={uploadingFoto} onChange={(e) => handleUploadFoto(e, selectedSantri.id)} className="hidden" />
                    </label>
                  )}
                </div>

                {/* Lencana Status Santri & Kelengkapan EMIS */}
                <div className="w-full pt-3 border-t border-slate-200 space-y-2">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-slate-500">Status Santri</span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      selectedSantri.status === 'aktif' ? 'bg-emerald-100 text-emerald-800' :
                      selectedSantri.status === 'pindah_al_burhany' ? 'bg-amber-100 text-amber-800' : 'bg-rose-100 text-rose-800'
                    }`}>
                      {String(selectedSantri.status || 'aktif').toUpperCase()}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-slate-500">Berkas EMIS</span>
                    {detailEmisStatus.lengkap ? (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                        LENGKAP
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800">
                        KURANG {detailEmisStatus.kurang}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Panel Kanan: Kartu Informasi Terkelompok */}
              <div className="md:col-span-8 space-y-4">
                <div className="bg-emerald-50/70 border border-emerald-200 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 block">Nama Lengkap Santri</span>
                    <h4 className="text-base font-extrabold text-slate-900 mt-0.5">{selectedSantri.nama_lengkap}</h4>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <div className="bg-white border border-emerald-200 px-3 py-1.5 rounded-xl text-right">
                      <span className="text-[9px] text-slate-400 uppercase font-bold block">NIS</span>
                      <span className="font-mono font-extrabold text-emerald-800 text-xs">{selectedSantri.nis}</span>
                    </div>
                    <div className="bg-white border border-emerald-200 px-3 py-1.5 rounded-xl text-right">
                      <span className="text-[9px] text-slate-400 uppercase font-bold block">Kamar</span>
                      <span className="font-bold text-slate-800 text-xs">{selectedSantri.kamar}</span>
                    </div>
                  </div>
                </div>

                <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block border-b border-slate-100 pb-1.5">
                    Identitas &amp; Kependudukan
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <span className="text-[10.5px] text-slate-400 block">NISN Nasional</span>
                      <strong className="font-mono text-slate-800">{selectedSantri.nisn || '-'}</strong>
                    </div>
                    <div>
                      <span className="text-[10.5px] text-slate-400 block">NIK Santri</span>
                      <strong className="font-mono text-slate-800">
                        {selectedSantri.nik ? (canViewSensitiveSantri ? selectedSantri.nik : maskIdentityNumber(String(selectedSantri.nik))) : '-'}
                      </strong>
                    </div>
                    <div>
                      <span className="text-[10.5px] text-slate-400 block">Nomor Kartu Keluarga (KK)</span>
                      <strong className="font-mono text-slate-800">
                        {selectedSantri.no_kk ? (canViewSensitiveSantri ? selectedSantri.no_kk : maskIdentityNumber(String(selectedSantri.no_kk))) : '-'}
                      </strong>
                    </div>
                    <div>
                      <span className="text-[10.5px] text-slate-400 block">Jenis Kelamin</span>
                      <strong className="text-slate-800">{selectedSantri.jk === 'P' ? 'Perempuan' : 'Laki-laki'}</strong>
                    </div>
                    <div>
                      <span className="text-[10.5px] text-slate-400 block">Tempat, Tanggal Lahir</span>
                      <strong className="text-slate-800">{selectedSantri.tempat_lahir || '-'}, {formatTanggalIndo(selectedSantri.tgl_lahir)}</strong>
                    </div>
                    <div>
                      <span className="text-[10.5px] text-slate-400 block">Tanggal Diterima</span>
                      <strong className="text-slate-800">{formatTanggalIndo(selectedSantri.tgl_masuk)}</strong>
                    </div>
                  </div>
                </div>

                <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block border-b border-slate-100 pb-1.5">
                    Orang Tua &amp; Kontak Wali
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <span className="text-[10.5px] text-slate-400 block">Nama Ayah Kandung</span>
                      <strong className="text-slate-800">
                        {selectedSantri.status_ayah === 'Meninggal' ? '(Almarhum)' : (selectedSantri.nama_ayah || '-')}
                      </strong>
                    </div>
                    <div>
                      <span className="text-[10.5px] text-slate-400 block">Nama Ibu Kandung</span>
                      <strong className="text-slate-800">
                        {selectedSantri.status_ibu === 'Meninggal' ? '(Almarhumah)' : (selectedSantri.nama_ibu || '-')}
                      </strong>
                    </div>
                    <div>
                      <span className="text-[10.5px] text-slate-400 block">No. HP / WhatsApp Utama</span>
                      <strong className="font-mono text-emerald-800 flex items-center gap-1">
                        <Phone className="w-3 h-3 text-emerald-600" />
                        {selectedSantri.no_wa_wali || selectedSantri.no_wa_ayah || selectedSantri.no_wa_ibu || '-'}
                      </strong>
                    </div>
                    <div>
                      <span className="text-[10.5px] text-slate-400 block">Tarif Syahriyah Bulanan</span>
                      <strong className="text-slate-800">Rp {Number(selectedSantri.tarif_syahriyah || skemaPendaftaran.syahriyah_reguler).toLocaleString('id-ID')}</strong>
                    </div>
                  </div>
                </div>

                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 flex items-start gap-2.5">
                  <MapPin className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Alamat Domisili Asal</span>
                    <p className="text-slate-700 font-medium mt-0.5 leading-relaxed">
                      {selectedSantri.alamat_jalan || '-'}
                      {(selectedSantri.rt || selectedSantri.rw) ? ` (RT ${selectedSantri.rt || '-'} / RW ${selectedSantri.rw || '-'})` : ''},{' '}
                      {selectedSantri.desa || '-'}, Kec. {selectedSantri.kecamatan || '-'}, {selectedSantri.kabupaten || '-'}, {selectedSantri.provinsi || '-'}{' '}
                      <span className="font-mono font-bold text-emerald-800">({selectedSantri.kode_pos || '-'})</span>
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-slate-50 border-t border-slate-200 px-6 py-3.5 flex flex-wrap items-center justify-between gap-2">
              <button
                onClick={() => setShowModalDetail(false)}
                className="px-4 py-2 bg-white hover:bg-slate-100 text-slate-600 font-bold border border-slate-200 rounded-xl text-xs transition-colors"
              >
                Tutup
              </button>

              <div className="flex items-center gap-2">
                {canEditSantri && (
                  <button
                    onClick={() => {
                      setShowModalDetail(false);
                      handleOpenEditModal(selectedSantri);
                    }}
                    className="px-4 py-2 bg-amber-50 text-amber-800 font-bold border border-amber-200 rounded-xl flex items-center gap-1.5 hover:bg-amber-100 text-xs transition-colors"
                  >
                    <Edit3 className="w-4 h-4" /> Edit Data EMIS
                  </button>
                )}
                <button
                  onClick={() => triggerPrintBukuInduk([selectedSantri])}
                  className="px-4 py-2 bg-emerald-700 text-white font-bold rounded-xl flex items-center gap-2 hover:bg-emerald-800 text-xs shadow-xs transition-colors"
                >
                  <Printer className="w-4 h-4" /> Cetak Buku Induk A4
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* MODAL 4: IMPORT EXCEL MASSAL (.XLSX)                              */}
      {/* ================================================================= */}
      {showModalImport && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 print:hidden">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden">
            <div className="bg-emerald-900 text-white px-6 py-4 flex justify-between items-center">
              <h3 className="font-bold text-sm">Import Data Santri Massal (.xlsx)</h3>
              <button onClick={() => setShowModalImport(false)} className="text-emerald-200 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs">
              <p className="text-slate-600 leading-relaxed">
                <strong>Pembaruan Massal Sekretaris:</strong> Unduh data lewat <em>Export Excel</em>, lengkapi kolom EMIS &amp; kamar resmi tanpa mengubah kolom <strong>NIS</strong>, lalu unggah kembali di sini — sistem akan langsung memperbarui data santri yang sudah ada tanpa membuat NIS baru. Untuk santri baru, biarkan kolom NIS kosong agar diurutkan otomatis.
              </p>

              <div className="border-2 border-dashed border-emerald-300 rounded-xl p-6 text-center bg-emerald-50/40 space-y-3">
                <Upload className="w-8 h-8 text-emerald-700 mx-auto" />
                <input
                  type="file"
                  accept=".xlsx, .xls"
                  disabled={importing}
                  onChange={handleImportExcel}
                  className="text-xs text-slate-500 file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-emerald-700 file:text-white hover:file:bg-emerald-800 cursor-pointer"
                />
                {importing && <p className="text-emerald-800 font-bold">Sedang mengimpor data santri...</p>}
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}