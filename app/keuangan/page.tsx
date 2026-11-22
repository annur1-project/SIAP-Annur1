'use client';

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import * as XLSX from 'xlsx';
import {
  Wallet,
  CreditCard,
  ReceiptText,
  AlertTriangle,
  BookOpen,
  DatabaseBackup,
  Search,
  CheckCircle2,
  Printer,
  Download,
  Copy,
  Check,
  Trash2,
  Plus,
  Send,
  FileSpreadsheet,
  Users,
  Banknote,
  Building2,
  GraduationCap,
  Landmark,
  ShieldAlert,
  X,
  RefreshCw,
  Calendar,
  Filter,
  Sparkles,
  ArrowUpRight,
  ArrowDownLeft,
  Info,
  Save,
  ImagePlus,
  Eye,
  Upload,
} from 'lucide-react';
import {
  DEFAULT_SKEMA_PENDAFTARAN,
  getDynamicTahunAjaranAktif,
  getDynamicTahunSekarang,
  getDynamicTodayIsoWib,
  hitungRincianPendaftaran,
  mergeAturanOperasional,
  readExtendedLocal,
  type SkemaPendaftaranConfig,
} from '@/lib/pengaturan';
import {
  ANNUAL_FEE_FALLBACK_NOMINALS,
  computeWalletAndTransferSummary,
  extractKeuanganError,
  getMigrasiColNameForItem,
  insertKeuanganTransaksiResilient,
  insertPembayaranDetailResilient,
  NEW_MASTER_PEMBAYARAN_SEEDS,
  readKeuanganLampiranMap,
  readMigrasiAnnualFlag,
  resolveCanonicalDompetForItem,
  resolveTxLampiranUrl,
  updateKeuanganLampiranResilient,
  uploadKeuanganLampiranImage,
} from '@/lib/keuangan';
import { TransparencyBanner, useAuth } from '@/lib/auth';

function isBisyarohTransaction(tx: { kategori?: string | null; keterangan?: string | null }): boolean {
  const kat = String(tx.kategori || '').toLowerCase();
  const ket = String(tx.keterangan || '').toLowerCase();
  return kat.includes('bisyaroh') || ket.includes('bisyaroh');
}

// ============================================================================
// TIPE DATA & KONSTANTA
// ============================================================================

type DompetType = 'pendaftaran' | 'operasional' | 'kas_pondok' | 'mda';
type PrintModeType = 'none' | 'kuitansi' | 'surat_tagihan' | 'laporan_kas';

interface SantriItem {
  id: string;
  nis: string;
  nama_lengkap: string;
  kamar: string;
  kelas_formal?: string;
  kelas_diniyah?: string;
  tarif_syahriyah: number;
  status: 'aktif' | 'ndalem' | 'beasiswa_lazis' | 'boyong' | 'alumni' | 'pindah_al_burhany';
  nama_ayah?: string;
  no_wa_ayah?: string;
  nama_ibu?: string;
  no_wa_ibu?: string;
  nama_wali?: string;
  no_wa_wali?: string;
  alamat?: string;
  desa?: string;
  kecamatan?: string;
  kabupaten?: string;
  ktl_nominal?: number;
  ktl_catatan?: string;
}

interface MasterPembayaranItem {
  id: string;
  kode: string;
  nama_item: string;
  tipe_periode: 'bulanan' | 'tahunan';
  kategori_santri: 'reguler' | 'vip' | 'ndalem' | 'semua';
  dompet_tujuan: DompetType;
  wajib_ndalem: boolean;
  aktif: boolean;
  urutan: number;
}

interface TarifRiwayatItem {
  id: string;
  item_id: string;
  nominal: number;
  berlaku_mulai: string;
  catatan?: string;
}

interface PembayaranDetailItem {
  id: string;
  santri_id: string;
  tahun_ajaran: string;
  item_kode: string;
  periode_bulan: string;
  label_item: string;
  dompet: DompetType;
  nominal: number;
  is_migrasi: boolean;
  no_kuitansi?: string;
  metode_pembayaran?: 'tunai' | 'transfer';
  tgl_bayar?: string;
  petugas_nama?: string;
  created_at?: string;
}

interface KeuanganTransaksiItem {
  id: string;
  santri_id?: string | null;
  dompet: DompetType;
  tipe: 'masuk' | 'keluar';
  kategori: string;
  nominal: number;
  bulan_tagihan?: string;
  keterangan?: string;
  metode_pembayaran: 'tunai' | 'transfer';
  petugas_id?: string | null;
  tgl_transaksi: string;
  no_kuitansi?: string | null;
  lampiran_url?: string | null;
  created_at?: string;
  santri?: {
    nama_lengkap: string;
    nis: string;
    kamar: string;
  } | null;
}

interface PengurusItem {
  id: string;
  nama_lengkap: string;
  no_wa?: string;
  kamar_tugas?: string;
  nominal_bisyaroh: number;
  status: string;
  jabatan_list?: Array<{
    divisi: string;
    nama_jabatan: string;
    is_utama: boolean;
  }>;
}

interface PengaturanAplikasi {
  id: number;
  nama_pesantren: string;
  alamat_lengkap: string;
  no_telepon: string;
  email_resmi?: string;
  logo_url?: string;
  logo_watermark_url?: string;
  stempel_url?: string;
  nama_pengasuh: string;
  ttd_pengasuh_url?: string;
  nama_kepala_pondok: string;
  ttd_kepala_pondok_url?: string;
  nama_sekretaris: string;
  ttd_sekretaris_url?: string;
  nama_bendahara: string;
  ttd_bendahara_url?: string;
  jatuh_tempo_tanggal: number;
  saldo_awal_pendaftaran: number;
  saldo_awal_operasional: number;
  saldo_awal_kas_pondok: number;
  saldo_awal_mda: number;
}

interface KuitansiGroup {
  no_kuitansi: string;
  santri_id: string;
  santri_nama: string;
  santri_nis: string;
  santri_kamar: string;
  santri_wali: string;
  santri_wa: string;
  tahun_ajaran: string;
  tgl_bayar: string;
  metode_pembayaran: 'tunai' | 'transfer';
  petugas_nama: string;
  total_nominal: number;
  items: PembayaranDetailItem[];
}

interface ToastMessage {
  id: number;
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  message: string;
}

interface ConfirmDialogState {
  open: boolean;
  title: string;
  message: string;
  confirmText: string;
  danger?: boolean;
  onConfirm: () => Promise<void> | void;
}

const MASTER_KAMAR_LIST = [
  'A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7', 'A8', 'A9', 'A10',
  'C1', 'C2', 'C3', 'C4', 'C5', 'C6',
  'Tahfidz',
  'Al-Fachriyah 1 (VIP)',
  'Al-Fachriyah 2 (VIP)',
  'Al-Fachriyah 3 (VIP)',
  'Al-Fachriyah 4 (VIP)',
];

const BULAN_TAHUN_AJARAN = [
  { index: 7, nama: 'Juli', singkatan: 'Jul', tahunOffset: 0 },
  { index: 8, nama: 'Agustus', singkatan: 'Agu', tahunOffset: 0 },
  { index: 9, nama: 'September', singkatan: 'Sep', tahunOffset: 0 },
  { index: 10, nama: 'Oktober', singkatan: 'Okt', tahunOffset: 0 },
  { index: 11, nama: 'November', singkatan: 'Nov', tahunOffset: 0 },
  { index: 12, nama: 'Desember', singkatan: 'Des', tahunOffset: 0 },
  { index: 1, nama: 'Januari', singkatan: 'Jan', tahunOffset: 1 },
  { index: 2, nama: 'Februari', singkatan: 'Feb', tahunOffset: 1 },
  { index: 3, nama: 'Maret', singkatan: 'Mar', tahunOffset: 1 },
  { index: 4, nama: 'April', singkatan: 'Apr', tahunOffset: 1 },
  { index: 5, nama: 'Mei', singkatan: 'Mei', tahunOffset: 1 },
  { index: 6, nama: 'Juni', singkatan: 'Jun', tahunOffset: 1 },
];

const DOMPET_META: Record<
  DompetType,
  {
    label: string;
    shortLabel: string;
    subtitle: string;
    colorBg: string;
    colorBorder: string;
    colorText: string;
    badgeClass: string;
  }
> = {
  pendaftaran: {
    label: 'Dompet Pendaftaran',
    shortLabel: 'Pendaftaran (PSB)',
    subtitle: 'Pemasukan PSB & operasional penerimaan santri',
    colorBg: 'bg-sky-50/70',
    colorBorder: 'border-sky-200',
    colorText: 'text-sky-800',
    badgeClass: 'bg-sky-100 text-sky-800 border-sky-200',
  },
  operasional: {
    label: 'Dompet Syahriyah & Iuran Tahunan',
    shortLabel: 'Syahriyah & Tahunan',
    subtitle: 'Dompet utama operasional pondok, dapur, listrik & bisyaroh',
    colorBg: 'bg-emerald-50/70',
    colorBorder: 'border-emerald-200',
    colorText: 'text-emerald-800',
    badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  },
  kas_pondok: {
    label: 'Dompet Kas (Lain-lain)',
    shortLabel: 'Kas Lain-lain',
    subtitle: 'Kotak amal, setoran kantin, koperasi & donasi umum',
    colorBg: 'bg-amber-50/70',
    colorBorder: 'border-amber-200',
    colorText: 'text-amber-800',
    badgeClass: 'bg-amber-100 text-amber-800 border-amber-200',
  },
  mda: {
    label: 'Dompet MDA (Madin)',
    shortLabel: 'MDA / Madin',
    subtitle: 'Ujian MDA Semester 1 & 2, Raport & kegiatan Madin',
    colorBg: 'bg-indigo-50/70',
    colorBorder: 'border-indigo-200',
    colorText: 'text-indigo-800',
    badgeClass: 'bg-indigo-100 text-indigo-800 border-indigo-200',
  },
};

// ============================================================================
// FUNGSI HELPER FORMAT, TERBILANG & SORTING
// ============================================================================

function formatRupiah(angka: number | string | undefined | null): string {
  const num = Number(angka || 0);
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(num);
}

function formatTanggalIndo(dateStr?: string | null): string {
  if (!dateStr) return '-';
  const parts = dateStr.split('T')[0].split('-');
  if (parts.length !== 3) return dateStr;
  const bulanNama = [
    '',
    'Januari',
    'Februari',
    'Maret',
    'April',
    'Mei',
    'Juni',
    'Juli',
    'Agustus',
    'September',
    'Oktober',
    'November',
    'Desember',
  ];
  const y = parts[0];
  const m = parseInt(parts[1], 10);
  const d = parseInt(parts[2], 10);
  return `${d} ${bulanNama[m] || parts[1]} ${y}`;
}

function terbilang(nilai: number): string {
  const angka = Math.floor(Math.abs(nilai));
  if (angka === 0) return 'Nol Rupiah';
  const huruf = [
    '',
    'Satu',
    'Dua',
    'Tiga',
    'Empat',
    'Lima',
    'Enam',
    'Tujuh',
    'Delapan',
    'Sembilan',
    'Sepuluh',
    'Sebelas',
  ];

  const convert = (n: number): string => {
    if (n < 12) return huruf[n];
    if (n < 20) return `${convert(n - 10)} Belas`;
    if (n < 100) return `${convert(Math.floor(n / 10))} Puluh ${convert(n % 10)}`.trim();
    if (n < 200) return `Seratus ${convert(n - 100)}`.trim();
    if (n < 1000) return `${convert(Math.floor(n / 100))} Ratus ${convert(n % 100)}`.trim();
    if (n < 2000) return `Seribu ${convert(n - 1000)}`.trim();
    if (n < 1000000) return `${convert(Math.floor(n / 1000))} Ribu ${convert(n % 1000)}`.trim();
    if (n < 1000000000) return `${convert(Math.floor(n / 1000000))} Juta ${convert(n % 1000000)}`.trim();
    return `${convert(Math.floor(n / 1000000000))} Miliar ${convert(n % 1000000000)}`.trim();
  };

  return `${convert(angka).replace(/\s+/g, ' ').trim()} Rupiah`;
}

function getKamarSortWeight(kamar: string): number {
  const clean = (kamar || '').trim().toUpperCase();
  const idx = MASTER_KAMAR_LIST.findIndex((m) => m.toUpperCase() === clean);
  if (idx !== -1) return idx;
  if (clean.startsWith('A')) {
    const num = parseInt(clean.replace(/\D/g, ''), 10);
    return isNaN(num) ? 50 : num;
  }
  if (clean.startsWith('C')) {
    const num = parseInt(clean.replace(/\D/g, ''), 10);
    return isNaN(num) ? 60 : 20 + num;
  }
  if (clean.includes('TAHFIDZ')) return 70;
  if (clean.includes('FACHRIYAH') || clean.includes('VIP')) return 80;
  return 999;
}

function sortSantriNatural(a: SantriItem, b: SantriItem): number {
  const wa = getKamarSortWeight(a.kamar);
  const wb = getKamarSortWeight(b.kamar);
  if (wa !== wb) return wa - wb;
  const kamarCmp = (a.kamar || '').localeCompare(b.kamar || '', 'id', { numeric: true });
  if (kamarCmp !== 0) return kamarCmp;
  return (a.nama_lengkap || '').localeCompare(b.nama_lengkap || '', 'id');
}

function isSantriVip(santri: SantriItem): boolean {
  const k = (santri.kamar || '').toUpperCase();
  return k.includes('VIP') || k.includes('FACHRIYAH') || Number(santri.tarif_syahriyah) >= 500000;
}

function getSantriKategori(santri: SantriItem): 'reguler' | 'vip' | 'ndalem' {
  if (santri.status === 'ndalem') return 'ndalem';
  if (isSantriVip(santri)) return 'vip';
  return 'reguler';
}

function getActiveWaContact(santri: SantriItem): { label: string; number: string } | null {
  const candidates = [
    { label: 'Ayah', raw: santri.no_wa_ayah },
    { label: 'Ibu', raw: santri.no_wa_ibu },
    { label: 'Wali', raw: santri.no_wa_wali },
  ];
  for (const c of candidates) {
    if (c.raw && c.raw.replace(/\D/g, '').length >= 8) {
      let digits = c.raw.replace(/\D/g, '');
      if (digits.startsWith('0')) digits = `62${digits.slice(1)}`;
      else if (!digits.startsWith('62')) digits = `62${digits}`;
      return { label: c.label, number: digits };
    }
  }
  return null;
}

function getWaliDisplayName(santri: SantriItem): string {
  return santri.nama_ayah || santri.nama_ibu || santri.nama_wali || 'Orang Tua / Wali Santri';
}

// ============================================================================
// KOMPONEN UTAMA MODUL KEUANGAN
// ============================================================================

export default function KeuanganPage() {
  const {
    pengurus: authPengurus,
    canEditModule,
    canViewBisyaroh,
    isPimpinanInti,
  } = useAuth();
  const canEditKeuangan = canEditModule('keuangan');

  // User & Role (tersinkron dengan akun pengurus aktif)
  const [userRole, setUserRole] = useState<string>('keuangan');
  const [petugasNama, setPetugasNama] = useState<string>('Bendahara Pondok');
  const [petugasId, setPetugasId] = useState<string | null>(null);

  // Navigasi 5 Tab Utama
  const [activeTab, setActiveTab] = useState<'loket' | 'kuitansi' | 'penagihan' | 'bukukas' | 'migrasi'>('loket');
  const workspaceRef = useRef<HTMLDivElement | null>(null);

  // Data Master & Transaksi
  const [loading, setLoading] = useState<boolean>(true);
  const [santriList, setSantriList] = useState<SantriItem[]>([]);
  const [masterPembayaran, setMasterPembayaran] = useState<MasterPembayaranItem[]>([]);
  const [tarifRiwayat, setTarifRiwayat] = useState<TarifRiwayatItem[]>([]);
  const [pembayaranDetails, setPembayaranDetails] = useState<PembayaranDetailItem[]>([]);
  const [kasTransaksi, setKasTransaksi] = useState<KeuanganTransaksiItem[]>([]);
  const [pengurusList, setPengurusList] = useState<PengurusItem[]>([]);
  const [pengaturan, setPengaturan] = useState<PengaturanAplikasi>({
    id: 1,
    nama_pesantren: 'Pondok Pesantren An-Nur 1 Bululawang',
    alamat_lengkap: 'Jl. Diponegoro IV / 2-6 Bululawang, Malang, Jawa Timur',
    no_telepon: '085604551562',
    nama_pengasuh: 'Dr. KH. A. Fahrur Rozi',
    nama_kepala_pondok: 'Ust. M. Fajar Wahyudi',
    nama_sekretaris: 'Ust. Moh. Sayid Ali',
    nama_bendahara: 'Ust. Ali Nur Ikasan',
    jatuh_tempo_tanggal: 10,
    saldo_awal_pendaftaran: 0,
    saldo_awal_operasional: 0,
    saldo_awal_kas_pondok: 0,
    saldo_awal_mda: 0,
  });
  const [skemaPendaftaran, setSkemaPendaftaran] = useState<SkemaPendaftaranConfig>(
    DEFAULT_SKEMA_PENDAFTARAN
  );

  // Tahun Ajaran & Tanggal Hari Ini (Client-safe dinamis)
  const [tahunAjaran, setTahunAjaran] = useState<string>('');
  const [todayStr, setTodayStr] = useState<string>('');
  const [currentMonthStr, setCurrentMonthStr] = useState<string>('');

  // Toast & Dialog Konfirmasi Modern
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState>({
    open: false,
    title: '',
    message: '',
    confirmText: 'Ya, Lanjutkan',
    onConfirm: () => {},
  });

  // Mode Cetak & Ref Kuitansi PNG
  const [printMode, setPrintMode] = useState<PrintModeType>('none');
  const [selectedKuitansi, setSelectedKuitansi] = useState<KuitansiGroup | null>(null);
  const [suratTagihanTargets, setSuratTagihanTargets] = useState<
    Array<{
      santri: SantriItem;
      tunggakanBulan: Array<{ periode: string; label: string; nominal: number }>;
      tunggakanTahunan: Array<{ kode: string; label: string; nominal: number }>;
      ktlSisa: number;
      ktlCatatan: string;
      totalTagihan: number;
    }>
  >([]);
  const [copiedKuitansiNo, setCopiedKuitansiNo] = useState<string | null>(null);
  const [downloadingPng, setDownloadingPng] = useState<boolean>(false);

  // ==========================================================================
  // STATE TAB 1: LOKET PEMBAYARAN SANTRI
  // ==========================================================================
  const [loketSearch, setLoketSearch] = useState<string>('');
  const [loketKamarFilter, setLoketKamarFilter] = useState<string>('SEMUA');
  const [selectedSantriId, setSelectedSantriId] = useState<string>('');
  const [mobileSantriPickerOpen, setMobileSantriPickerOpen] = useState<boolean>(false);
  const [selectedBulanPeriodes, setSelectedBulanPeriodes] = useState<string[]>([]);
  const [selectedTahunanKodes, setSelectedTahunanKodes] = useState<string[]>([]);
  const [bayarKtlChecked, setBayarKtlChecked] = useState<boolean>(false);
  const [bayarKtlNominal, setBayarKtlNominal] = useState<number>(0);
  const [bayarPsbChecked, setBayarPsbChecked] = useState<boolean>(false);
  const [bayarPsbPaket, setBayarPsbPaket] = useState<'reguler' | 'vip'>('reguler');
  const [bayarPsbFreePangkal, setBayarPsbFreePangkal] = useState<boolean>(true);
  const [metodeBayar, setMetodeBayar] = useState<'tunai' | 'transfer'>('tunai');
  const [tglBayarInput, setTglBayarInput] = useState<string>('');
  const [savingPayment, setSavingPayment] = useState<boolean>(false);
  const [loketBuktiFile, setLoketBuktiFile] = useState<File | null>(null);
  const [loketBuktiPreview, setLoketBuktiPreview] = useState<string>('');

  // ==========================================================================
  // STATE TAB 2: DAFTAR & PREVIEW KUITANSI 21x10 CM
  // ==========================================================================
  const [kuitansiSearch, setKuitansiSearch] = useState<string>('');
  const [kuitansiBulanFilter, setKuitansiBulanFilter] = useState<string>('SEMUA');

  // ==========================================================================
  // STATE TAB 3: PENAGIHAN TUNGGAKAN 2 JALUR
  // ==========================================================================
  const [tagihanSearch, setTagihanSearch] = useState<string>('');
  const [tagihanKamarFilter, setTagihanKamarFilter] = useState<string>('SEMUA');
  const [tagihanKategoriFilter, setTagihanKategoriFilter] = useState<'SEMUA' | 'WA_1_2' | 'SURAT_3_PLUS'>('SEMUA');
  const [includedTahunanCodes, setIncludedTahunanCodes] = useState<string[]>([]);
  const [selectedTagihanSantriIds, setSelectedTagihanSantriIds] = useState<string[]>([]);

  // ==========================================================================
  // STATE TAB 4: BUKU KAS UMUM & BISYAROH PENGURUS
  // ==========================================================================
  const [kasBulanFilter, setKasBulanFilter] = useState<string>('SEMUA');
  const [kasDompetFilter, setKasDompetFilter] = useState<string>('SEMUA');
  const [kasTipeFilter, setKasTipeFilter] = useState<string>('SEMUA');
  const [kasMetodeFilter, setKasMetodeFilter] = useState<string>('SEMUA');
  const [kasSearch, setKasSearch] = useState<string>('');
  const [showKasModal, setShowKasModal] = useState<boolean>(false);
  const [kasForm, setKasForm] = useState({
    dompet: 'operasional' as DompetType,
    tipe: 'keluar' as 'masuk' | 'keluar',
    kategori: 'Operasional Harian',
    nominal: '',
    metode_pembayaran: 'tunai' as 'tunai' | 'transfer',
    tgl_transaksi: '',
    keterangan: '',
  });
  const [savingKas, setSavingKas] = useState<boolean>(false);
  const [kasLampiranFile, setKasLampiranFile] = useState<File | null>(null);
  const [kasLampiranPreview, setKasLampiranPreview] = useState<string>('');

  // Lampiran Bukti Transfer & Scan Nota Pembelian (DB + Fallback Local)
  const [lampiranMap, setLampiranMap] = useState<Record<string, string>>({});
  const [uploadingLampiranId, setUploadingLampiranId] = useState<string | null>(null);
  const [lightboxLampiran, setLightboxLampiran] = useState<{
    url: string;
    title: string;
    subtitle: string;
    txId?: string | null;
    noKuitansi?: string | null;
  } | null>(null);
  const quickAttachInputRef = useRef<HTMLInputElement | null>(null);
  const [quickAttachTarget, setQuickAttachTarget] = useState<{
    txId?: string | null;
    noKuitansi?: string | null;
    kind: 'bukti_tf' | 'nota';
  } | null>(null);

  // Modal Bisyaroh Pengurus
  const [showBisyarohModal, setShowBisyarohModal] = useState<boolean>(false);
  const [bisyarohBulanLabel, setBisyarohBulanLabel] = useState<string>('');
  const [bisyarohTgl, setBisyarohTgl] = useState<string>('');
  const [bisyarohMetode, setBisyarohMetode] = useState<'tunai' | 'transfer'>('tunai');
  const [bisyarohDompet, setBisyarohDompet] = useState<DompetType>('operasional');
  const [selectedPengurusBisyaroh, setSelectedPengurusBisyaroh] = useState<Record<string, { checked: boolean; nominal: number }>>({});
  const [savingBisyaroh, setSavingBisyaroh] = useState<boolean>(false);

  // ==========================================================================
  // STATE TAB 5: MIGRASI BUKU LAMA & KTL TRANSISI
  // ==========================================================================
  const [migrasiSearch, setMigrasiSearch] = useState<string>('');
  const [migrasiKamarFilter, setMigrasiKamarFilter] = useState<string>('SEMUA');
  const [migrasiSantriId, setMigrasiSantriId] = useState<string>('');
  const [migrasiCutOffBulan, setMigrasiCutOffBulan] = useState<string>('BELUM_ADA');
  const [migrasiTahunanChecked, setMigrasiTahunanChecked] = useState<string[]>([]);
  const [migrasiKtlNominal, setMigrasiKtlNominal] = useState<string>('0');
  const [migrasiKtlCatatan, setMigrasiKtlCatatan] = useState<string>('');
  const [savingMigrasi, setSavingMigrasi] = useState<boolean>(false);
  const [importingMigrasi, setImportingMigrasi] = useState<boolean>(false);

  // ==========================================================================
  // TOAST HELPER
  // ============================================================================
  const showToast = useCallback(
    (type: ToastMessage['type'], title: string, message: string) => {
      const id = Date.now() + Math.random();
      setToasts((prev) => [...prev, { id, type, title, message }]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 4500);
    },
    []
  );

  // ==========================================================================
  // INISIALISASI TANGGAL, QUERY PARAMS & USER AUTH
  // ==========================================================================
  useEffect(() => {
    const timer = setTimeout(() => {
      const isoDate = getDynamicTodayIsoWib();
      const isoMonth = isoDate.slice(0, 7);
      const yyyy = Number(isoDate.slice(0, 4));
      const mmIndex = Math.max(0, Number(isoDate.slice(5, 7)) - 1);

      setTodayStr(isoDate);
      setCurrentMonthStr(isoMonth);
      setTglBayarInput((prev) => prev || isoDate);
      setKasBulanFilter((prev) => (prev === 'SEMUA' ? isoMonth : prev));
      setKasForm((prev) => ({ ...prev, tgl_transaksi: prev.tgl_transaksi || isoDate }));
      setBisyarohTgl((prev) => prev || isoDate);

      // Tentukan Tahun Ajaran berjalan secara dinamis (Juli = awal TA baru)
      setTahunAjaran((prev) => prev || getDynamicTahunAjaranAktif());

      const bulanIndo = [
        'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
        'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
      ];
      setBisyarohBulanLabel((prev) => prev || `${bulanIndo[mmIndex]} ${yyyy}`);

      if (typeof window !== 'undefined') {
        const params = new URLSearchParams(window.location.search);
        const tabParam = params.get('tab');
        if (tabParam === 'tunggakan' || tabParam === 'penagihan') {
          setActiveTab('penagihan');
        } else if (tabParam === 'bukukas') {
          setActiveTab('bukukas');
        } else if (tabParam === 'kuitansi') {
          setActiveTab('kuitansi');
        }
      }

      if (authPengurus) {
        setPetugasId(authPengurus.id || null);
        setPetugasNama(authPengurus.nama_lengkap || 'Pengurus Pondok');
        setUserRole(isPimpinanInti ? 'super_admin' : canEditKeuangan ? 'keuangan' : 'viewer');
      }
    }, 0);

    return () => clearTimeout(timer);
  }, [authPengurus, canEditKeuangan, isPimpinanInti]);

  // ==========================================================================
  // LOAD SELURUH DATA KEUANGAN DARI SUPABASE
  // ==========================================================================
  const fetchAllData = useCallback(async () => {
    setLoading(true);
    try {
      const [
        santriRes,
        masterRes,
        riwayatRes,
        detailRes,
        kasRes,
        pengaturanRes,
        pengurusRes,
      ] = await Promise.all([
        supabase.from('santri').select('*').order('nama_lengkap', { ascending: true }),
        supabase.from('master_pembayaran').select('*').eq('aktif', true).order('urutan', { ascending: true }),
        supabase.from('master_pembayaran_riwayat').select('*').order('berlaku_mulai', { ascending: false }),
        supabase.from('pembayaran_santri_detail').select('*').order('created_at', { ascending: false }),
        supabase
          .from('keuangan_transaksi')
          .select('*, santri(nama_lengkap, nis, kamar)')
          .order('tgl_transaksi', { ascending: false })
          .order('created_at', { ascending: false }),
        supabase.from('pengaturan_aplikasi').select('*').limit(1).maybeSingle(),
        canViewBisyaroh
          ? supabase.from('v_pengurus_lengkap').select('*').eq('status', 'aktif').order('nama_lengkap', { ascending: true })
          : Promise.resolve({ data: null, error: null }),
      ]);

      if (santriRes.data) {
        const sorted = [...(santriRes.data as SantriItem[])].sort(sortSantriNatural);
        setSantriList(sorted);
        if (!selectedSantriId && sorted.length > 0) {
          const aktifPertama = sorted.find((s) => s.status === 'aktif' || s.status === 'ndalem' || s.status === 'beasiswa_lazis') || sorted[0];
          setSelectedSantriId(aktifPertama.id);
        }
        if (!migrasiSantriId && sorted.length > 0) {
          setMigrasiSantriId(sorted[0].id);
        }
      }

      if (masterRes.data) setMasterPembayaran(masterRes.data as MasterPembayaranItem[]);
      if (riwayatRes.data) setTarifRiwayat(riwayatRes.data as TarifRiwayatItem[]);
      if (detailRes.data) setPembayaranDetails(detailRes.data as PembayaranDetailItem[]);
      if (kasRes.data) setKasTransaksi(kasRes.data as KeuanganTransaksiItem[]);
      setLampiranMap(readKeuanganLampiranMap());

      const localExt = readExtendedLocal();
      const rawPengaturan = pengaturanRes.data as (PengaturanAplikasi & { aturan_operasional?: unknown }) | null;
      const aturanMerged = mergeAturanOperasional(
        rawPengaturan?.aturan_operasional ?? localExt?.aturan_operasional
      );
      setSkemaPendaftaran(aturanMerged.pendaftaran);

      if (rawPengaturan) {
        setPengaturan((prev) => ({
          ...prev,
          ...rawPengaturan,
          jatuh_tempo_tanggal: Number(rawPengaturan.jatuh_tempo_tanggal || 10),
          saldo_awal_pendaftaran: Number(rawPengaturan.saldo_awal_pendaftaran || 0),
          saldo_awal_operasional: Number(rawPengaturan.saldo_awal_operasional || 0),
          saldo_awal_kas_pondok: Number(rawPengaturan.saldo_awal_kas_pondok || 0),
          saldo_awal_mda: Number(rawPengaturan.saldo_awal_mda || 0),
        }));
      }

      if (canViewBisyaroh && pengurusRes.data) {
        let pList = pengurusRes.data as PengurusItem[];
        // Sinkronkan bisyaroh melalui RPC aman jika kolom nominal di view disamarkan
        const { data: bisMap } = await supabase.rpc('get_pengurus_bisyaroh_map');
        if (Array.isArray(bisMap)) {
          const mapById = new Map<string, number>();
          bisMap.forEach((row: { pengurus_id?: string; nominal_bisyaroh?: number }) => {
            if (row.pengurus_id) mapById.set(String(row.pengurus_id), Number(row.nominal_bisyaroh || 0));
          });
          pList = pList.map((pg) => ({
            ...pg,
            nominal_bisyaroh: mapById.has(pg.id) ? (mapById.get(pg.id) ?? 0) : Number(pg.nominal_bisyaroh || 0),
          }));
        }
        setPengurusList(pList);
        const initBisyaroh: Record<string, { checked: boolean; nominal: number }> = {};
        pList.forEach((pg) => {
          const nom = Number(pg.nominal_bisyaroh || 0);
          initBisyaroh[pg.id] = { checked: nom > 0, nominal: nom };
        });
        setSelectedPengurusBisyaroh(initBisyaroh);
      } else {
        setPengurusList([]);
        setSelectedPengurusBisyaroh({});
      }
    } catch (err: unknown) {
      const msg = extractKeuanganError(err, 'Terjadi kesalahan saat memuat data keuangan.');
      showToast('error', 'Gagal Memuat Data', msg);
    } finally {
      setLoading(false);
    }
  }, [canViewBisyaroh, migrasiSantriId, selectedSantriId, showToast]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void fetchAllData();
    }, 0);
    return () => clearTimeout(timer);
  }, [fetchAllData]);

  // ==========================================================================
  // DYNAMIC @PAGE PRINT CSS INJECTOR (KUNCI 21x10 CM VS A4 PORTRAIT)
  // ==========================================================================
  const triggerPrint = useCallback((mode: PrintModeType) => {
    setPrintMode(mode);

    const existingStyle = document.getElementById('dynamic-print-style');
    if (existingStyle) existingStyle.remove();

    const styleEl = document.createElement('style');
    styleEl.id = 'dynamic-print-style';

    if (mode === 'kuitansi') {
      styleEl.innerHTML = `
        @media print {
          @page {
            size: 210mm 100mm;
            margin: 0mm !important;
          }
          html, body {
            width: 210mm !important;
            height: 98mm !important;
            max-height: 98mm !important;
            margin: 0 !important;
            padding: 0 !important;
            overflow: hidden !important;
            background: #ffffff !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          #print-kuitansi-sheet {
            width: 210mm !important;
            height: 98mm !important;
            max-height: 98mm !important;
            overflow: hidden !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
            page-break-after: avoid !important;
            break-after: avoid !important;
          }
        }
      `;
    } else if (mode === 'surat_tagihan') {
      styleEl.innerHTML = `
        @media print {
          @page {
            size: A4 portrait;
            margin: 10mm 12mm !important;
          }
          html, body {
            width: 210mm !important;
            margin: 0 !important;
            padding: 0 !important;
            background: #ffffff !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .surat-tagihan-page:not(:last-child) {
            page-break-after: always !important;
            break-after: page !important;
          }
          .surat-tagihan-page:last-child {
            page-break-after: avoid !important;
            break-after: avoid !important;
          }
        }
      `;
    } else if (mode === 'laporan_kas') {
      styleEl.innerHTML = `
        @media print {
          @page {
            size: A4 portrait;
            margin: 10mm !important;
          }
          html, body {
            margin: 0 !important;
            padding: 0 !important;
            background: #ffffff !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
        }
      `;
    }

    document.head.appendChild(styleEl);

    setTimeout(() => {
      window.print();
    }, 180);
  }, []);

  useEffect(() => {
    const handleAfterPrint = () => {
      setPrintMode('none');
      const existingStyle = document.getElementById('dynamic-print-style');
      if (existingStyle) existingStyle.remove();
    };
    window.addEventListener('afterprint', handleAfterPrint);
    return () => window.removeEventListener('afterprint', handleAfterPrint);
  }, []);

  // ==========================================================================
  // PERHITUNGAN TARIF HISTORIS BERBASIS EFFECTIVE DATE
  // ==========================================================================
  const getNominalByKodeAndDate = useCallback(
    (kode: string, dateTarget: string, fallbackNominal: number): number => {
      const masterItem = masterPembayaran.find((m) => m.kode === kode);
      if (!masterItem) return fallbackNominal;

      const riwayatItem = tarifRiwayat
        .filter((r) => r.item_id === masterItem.id && r.berlaku_mulai <= dateTarget)
        .sort((a, b) => b.berlaku_mulai.localeCompare(a.berlaku_mulai));

      if (riwayatItem.length > 0) {
        return Number(riwayatItem[0].nominal);
      }

      const anyRiwayat = tarifRiwayat
        .filter((r) => r.item_id === masterItem.id)
        .sort((a, b) => a.berlaku_mulai.localeCompare(b.berlaku_mulai));

      if (anyRiwayat.length > 0) {
        return Number(anyRiwayat[0].nominal);
      }

      return fallbackNominal;
    },
    [masterPembayaran, tarifRiwayat]
  );

  const getSyahriyahNominalForPeriode = useCallback(
    (santri: SantriItem, periodeYYYYMM: string): number => {
      const kategori = getSantriKategori(santri);
      const effectiveDate = `${periodeYYYYMM}-01`;
      if (kategori === 'ndalem') {
        return getNominalByKodeAndDate('syahriyah_ndalem', effectiveDate, 145000);
      }
      if (kategori === 'vip') {
        return getNominalByKodeAndDate(
          'syahriyah_vip',
          effectiveDate,
          skemaPendaftaran.syahriyah_vip || 500000
        );
      }
      return getNominalByKodeAndDate(
        'syahriyah_reguler',
        effectiveDate,
        skemaPendaftaran.syahriyah_reguler || 450000
      );
    },
    [getNominalByKodeAndDate, skemaPendaftaran.syahriyah_vip, skemaPendaftaran.syahriyah_reguler]
  );

  // Daftar 12 Bulan dalam Tahun Ajaran aktif
  const periodeListTA = useMemo(() => {
    const fallbackStart = todayStr ? Number(todayStr.slice(0, 4)) : 0;
    const startYear = parseInt(tahunAjaran.split('/')[0] || String(fallbackStart), 10);
    if (!startYear) return [];
    return BULAN_TAHUN_AJARAN.map((b) => {
      const yr = startYear + b.tahunOffset;
      const mm = String(b.index).padStart(2, '0');
      const periode = `${yr}-${mm}`;
      return {
        ...b,
        tahun: yr,
        periode,
        labelFull: `Syahriyah ${b.nama} ${yr}`,
        labelShort: `${b.singkatan} ${yr}`,
      };
    });
  }, [tahunAjaran, todayStr]);

  // Item Tahunan Aktif (termasuk 4 pos wajib: Al-Adzkar, Almamater, Kitab Madin, Infaq Madin + pemetaan dompet kanonik, bebas duplikat)
  const itemTahunanList = useMemo(() => {
    const fallbackStart = todayStr ? Number(todayStr.slice(0, 4)) : 0;
    const startYear = parseInt(tahunAjaran.split('/')[0] || String(fallbackStart), 10);
    const refDate = startYear ? `${startYear}-07-01` : todayStr || '';

    const baseTahunan = masterPembayaran.filter((m) => m.tipe_periode === 'tahunan');
    const existingKodes = new Set(masterPembayaran.map((m) => m.kode.trim().toLowerCase()));
    const existingNames = new Set(
      masterPembayaran.map((m) => m.nama_item.trim().toLowerCase())
    );
    const missingVirtual: MasterPembayaranItem[] = NEW_MASTER_PEMBAYARAN_SEEDS.filter(
      (seed) =>
        !existingKodes.has(seed.kode.toLowerCase()) &&
        !existingNames.has(seed.nama_item.trim().toLowerCase())
    ).map((seed) => ({
      id: `seed-${seed.kode}`,
      kode: seed.kode,
      nama_item: seed.nama_item,
      tipe_periode: seed.tipe_periode,
      kategori_santri: seed.kategori_santri,
      dompet_tujuan: seed.dompet_tujuan,
      wajib_ndalem: seed.wajib_ndalem,
      aktif: true,
      urutan: seed.urutan,
    }));

    const seenKodes = new Set<string>();
    const seenNames = new Set<string>();

    return [...baseTahunan, ...missingVirtual]
      .sort((a, b) => Number(a.urutan || 0) - Number(b.urutan || 0))
      .filter((m) => {
        const k = m.kode.trim().toLowerCase();
        const n = m.nama_item.trim().toLowerCase();
        if (seenKodes.has(k) || seenNames.has(n)) return false;
        seenKodes.add(k);
        seenNames.add(n);
        return true;
      })
      .map((m) => ({
        ...m,
        dompet_tujuan: resolveCanonicalDompetForItem(m.kode, m.dompet_tujuan),
        nominal: getNominalByKodeAndDate(
          m.kode,
          refDate,
          ANNUAL_FEE_FALLBACK_NOMINALS[m.kode] || 50000
        ),
      }));
  }, [masterPembayaran, tahunAjaran, todayStr, getNominalByKodeAndDate]);

  // ==========================================================================
  // DAFTAR KAMAR LENGKAP (TANPA DUPLIKAT & NATURAL SORT)
  // ==========================================================================
  const allKamarOptions = useMemo(() => {
    const map = new Map<string, string>();
    MASTER_KAMAR_LIST.forEach((k) => map.set(k.toUpperCase(), k));
    santriList.forEach((s) => {
      if (s.kamar && s.kamar.trim()) {
        const key = s.kamar.trim().toUpperCase();
        if (!map.has(key)) map.set(key, s.kamar.trim());
      }
    });
    return Array.from(map.values()).sort((a, b) => {
      const wa = getKamarSortWeight(a);
      const wb = getKamarSortWeight(b);
      if (wa !== wb) return wa - wb;
      return a.localeCompare(b, 'id', { numeric: true });
    });
  }, [santriList]);

  // ==========================================================================
  // PENYARINGAN KETAT DATA BISYAROH (HANYA PIMPINAN INTI & BENDAHARA)
  // ==========================================================================
  const visibleKasTransaksi = useMemo(() => {
    if (canViewBisyaroh) return kasTransaksi;
    return kasTransaksi.filter((tx) => !isBisyarohTransaction(tx));
  }, [kasTransaksi, canViewBisyaroh]);

  // ==========================================================================
  // PERHITUNGAN SALDO 4 DOMPET (KHUSUS TUNAI) & SYAHRIYAH TRANSFER (LAPORAN)
  // ==========================================================================
  const walletSummary = useMemo(() => {
    const summary = computeWalletAndTransferSummary(
      visibleKasTransaksi,
      {
        pendaftaran: Number(pengaturan.saldo_awal_pendaftaran || 0),
        operasional: Number(pengaturan.saldo_awal_operasional || 0),
        kas_pondok: Number(pengaturan.saldo_awal_kas_pondok || 0),
        mda: Number(pengaturan.saldo_awal_mda || 0),
      },
      currentMonthStr
    );

    return {
      totals: summary.totals,
      grandTotal: summary.grandTotalTunai,
      tunaiMasukBulanIni: summary.tunaiMasukBulanIni,
      tunaiKeluarBulanIni: summary.tunaiKeluarBulanIni,
      transferMasukBulanIni: summary.syahriyahTransfer.bulanIniMasuk,
      syahriyahTransfer: summary.syahriyahTransfer,
    };
  }, [visibleKasTransaksi, pengaturan, currentMonthStr]);

  // ==========================================================================
  // TAB 1: LOGIKA LOKET PEMBAYARAN SANTRI
  // ==========================================================================
  const filteredLoketSantri = useMemo(() => {
    const q = loketSearch.trim().toLowerCase();
    return santriList.filter((s) => {
      if (s.status === 'boyong' || s.status === 'alumni' || s.status === 'pindah_al_burhany') {
        return false;
      }
      if (loketKamarFilter !== 'SEMUA' && (s.kamar || '').toUpperCase() !== loketKamarFilter.toUpperCase()) {
        return false;
      }
      if (!q) return true;
      return (
        (s.nama_lengkap || '').toLowerCase().includes(q) ||
        (s.nis || '').toLowerCase().includes(q) ||
        (s.kamar || '').toLowerCase().includes(q)
      );
    });
  }, [santriList, loketSearch, loketKamarFilter]);

  const activeSantri = useMemo(() => {
    return santriList.find((s) => s.id === selectedSantriId) || filteredLoketSantri[0] || null;
  }, [santriList, selectedSantriId, filteredLoketSantri]);

  const activeSantriDetails = useMemo(() => {
    if (!activeSantri) return [];
    return pembayaranDetails.filter(
      (d) => d.santri_id === activeSantri.id && d.tahun_ajaran === tahunAjaran
    );
  }, [activeSantri, pembayaranDetails, tahunAjaran]);

  const santriSudahPsbSet = useMemo(() => {
    const set = new Set<string>();
    kasTransaksi.forEach((tx) => {
      if (!tx.santri_id || tx.dompet !== 'pendaftaran' || tx.tipe !== 'masuk') return;
      const kat = (tx.kategori || '').toLowerCase();
      if (
        (kat.includes('pendaftaran') || kat.includes('psb')) &&
        !kat.includes('infaq madin')
      ) {
        set.add(tx.santri_id);
      }
    });
    pembayaranDetails.forEach((det) => {
      if (det.item_kode === 'psb_pendaftaran') {
        set.add(det.santri_id);
      }
    });
    return set;
  }, [kasTransaksi, pembayaranDetails]);

  const activeSantriHasPsb = activeSantri ? santriSudahPsbSet.has(activeSantri.id) : false;

  const psbBulanPertamaPeriode = (tglBayarInput || todayStr).slice(0, 7);
  const psbBulanPertamaSudahLunas = useMemo(() => {
    if (!activeSantri) return false;
    return (
      selectedBulanPeriodes.includes(psbBulanPertamaPeriode) ||
      activeSantriDetails.some(
        (d) => d.item_kode === 'syahriyah' && d.periode_bulan === psbBulanPertamaPeriode
      )
    );
  }, [activeSantri, activeSantriDetails, psbBulanPertamaPeriode, selectedBulanPeriodes]);

  const psbLoketPreview = useMemo(
    () =>
      hitungRincianPendaftaran({
        paket: bayarPsbPaket,
        jumlahPendaftarSaatIni: santriList.length,
        skema: skemaPendaftaran,
        forceFreeUangPangkal: bayarPsbFreePangkal,
      }),
    [bayarPsbPaket, bayarPsbFreePangkal, santriList.length, skemaPendaftaran]
  );

  // Reset centangan saat ganti santri atau tahun ajaran
  useEffect(() => {
    const timer = setTimeout(() => {
      setSelectedBulanPeriodes([]);
      setSelectedTahunanKodes([]);
      setBayarKtlChecked(false);
      setBayarKtlNominal(Number(activeSantri?.ktl_nominal || 0));
      setBayarPsbChecked(false);
      setBayarPsbPaket(activeSantri && isSantriVip(activeSantri) ? 'vip' : 'reguler');
      setBayarPsbFreePangkal(
        Boolean(skemaPendaftaran.promo_aktif) &&
          santriList.length < Number(skemaPendaftaran.kuota_gratis_uang_pangkal || 100)
      );
    }, 0);
    return () => clearTimeout(timer);
  }, [
    selectedSantriId,
    tahunAjaran,
    activeSantri,
    skemaPendaftaran.promo_aktif,
    skemaPendaftaran.kuota_gratis_uang_pangkal,
    santriList.length,
  ]);

  const toggleBulanCheckbox = (periode: string) => {
    setSelectedBulanPeriodes((prev) =>
      prev.includes(periode) ? prev.filter((p) => p !== periode) : [...prev, periode]
    );
  };

  const toggleTahunanCheckbox = (kode: string) => {
    setSelectedTahunanKodes((prev) =>
      prev.includes(kode) ? prev.filter((k) => k !== kode) : [...prev, kode]
    );
  };

  const loketCartSummary = useMemo(() => {
    if (!activeSantri) return { items: [], total: 0 };

    const items: Array<{
      item_kode: string;
      periode_bulan: string;
      label_item: string;
      dompet: DompetType;
      nominal: number;
    }> = [];

    if (bayarPsbChecked && !activeSantriHasPsb) {
      items.push({
        item_kode: 'psb_pendaftaran',
        periode_bulan: 'PSB',
        label_item: `Biaya Pendaftaran ${bayarPsbPaket === 'vip' ? 'Kamar VIP (Dipan, Formulir, Kotak Almari' : 'Reguler (Formulir, Kotak Almari'}${psbLoketPreview.isFreeUangPangkal ? ', Free Uang Pangkal)' : ', Uang Pangkal)'}`,
        dompet: 'pendaftaran',
        nominal: psbLoketPreview.nominalDompetPendaftaran,
      });

      if (!psbBulanPertamaSudahLunas && psbLoketPreview.nominalSyahriyahBulanPertama > 0) {
        items.push({
          item_kode: 'syahriyah',
          periode_bulan: psbBulanPertamaPeriode,
          label_item: `Syahriyah Bulan Pertama (${psbBulanPertamaPeriode})`,
          dompet: 'operasional',
          nominal: psbLoketPreview.nominalSyahriyahBulanPertama,
        });
      }
    }

    if (bayarKtlChecked && Number(bayarKtlNominal) > 0) {
      items.push({
        item_kode: 'ktl_tahun_lalu',
        periode_bulan: 'KTL',
        label_item: `KTL (${activeSantri.ktl_catatan || 'Kekurangan Tahun Lalu'})`,
        dompet: 'operasional',
        nominal: Number(bayarKtlNominal),
      });
    }

    // Urutkan bulan sesuai urutan Tahun Ajaran (Jul -> Jun)
    periodeListTA.forEach((p) => {
      if (selectedBulanPeriodes.includes(p.periode)) {
        const nom = getSyahriyahNominalForPeriode(activeSantri, p.periode);
        items.push({
          item_kode: 'syahriyah',
          periode_bulan: p.periode,
          label_item: p.labelFull,
          dompet: 'operasional',
          nominal: nom,
        });
      }
    });

    itemTahunanList.forEach((it) => {
      if (selectedTahunanKodes.includes(it.kode)) {
        items.push({
          item_kode: it.kode,
          periode_bulan: 'TAHUNAN',
          label_item: `${it.nama_item} (${tahunAjaran})`,
          dompet: resolveCanonicalDompetForItem(it.kode, it.dompet_tujuan),
          nominal: Number(it.nominal),
        });
      }
    });

    const total = items.reduce((acc, cur) => acc + cur.nominal, 0);
    return { items, total };
  }, [
    activeSantri,
    activeSantriHasPsb,
    bayarPsbChecked,
    bayarPsbPaket,
    psbLoketPreview,
    psbBulanPertamaSudahLunas,
    psbBulanPertamaPeriode,
    bayarKtlChecked,
    bayarKtlNominal,
    periodeListTA,
    selectedBulanPeriodes,
    getSyahriyahNominalForPeriode,
    itemTahunanList,
    selectedTahunanKodes,
    tahunAjaran,
  ]);

  // Generate Nomor Kuitansi Berurut per Tahun: KWT-YYMMDD-0001
  const generateNextNoKuitansi = async (tglBayar: string): Promise<string> => {
    const cleanDate = (tglBayar || todayStr || getDynamicTodayIsoWib()).split('T')[0];
    const [yyyy, mm, dd] = cleanDate.split('-');
    const yy = (yyyy || String(getDynamicTahunSekarang())).slice(-2);
    const prefixTahun = `KWT-${yy}`;
    const tanggalPart = `${yy}${mm || '01'}${dd || '01'}`;

    const [kasRes, detRes] = await Promise.all([
      supabase
        .from('keuangan_transaksi')
        .select('no_kuitansi')
        .ilike('no_kuitansi', `${prefixTahun}%`),
      supabase
        .from('pembayaran_santri_detail')
        .select('no_kuitansi')
        .ilike('no_kuitansi', `${prefixTahun}%`),
    ]);

    let maxSeq = 0;
    const allNos = [
      ...(kasRes.data || []).map((r) => r.no_kuitansi),
      ...(detRes.data || []).map((r) => r.no_kuitansi),
    ];

    allNos.forEach((no) => {
      if (!no) return;
      const parts = no.split('-');
      const lastPart = parts[parts.length - 1];
      const num = parseInt(lastPart, 10);
      if (!isNaN(num) && num > maxSeq) {
        maxSeq = num;
      }
    });

    const nextSeq = String(maxSeq + 1).padStart(4, '0');
    return `KWT-${tanggalPart}-${nextSeq}`;
  };

  // Simpan Pembayaran Santri & Terbitkan Kuitansi
  const handleSimpanPembayaran = async () => {
    if (!canEditKeuangan) {
      showToast('warning', 'View Only', 'Akun Anda berstatus View Only pada modul Keuangan.');
      return;
    }
    if (!activeSantri) return;
    if (loketCartSummary.items.length === 0) {
      showToast('warning', 'Belum Ada Item Dipilih', 'Silakan centang minimal 1 bulan Syahriyah, Iuran Tahunan, atau KTL terlebih dahulu.');
      return;
    }

    setSavingPayment(true);
    let generatedNoKuitansi = '';

    try {
      const effectiveTglBayar = tglBayarInput || todayStr || getDynamicTodayIsoWib();
      const effectiveTa = tahunAjaran || getDynamicTahunAjaranAktif();

      // Cek ulang apakah ada bulan/item tahunan yang sudah lunas sebelumnya
      const nonKtlItems = loketCartSummary.items.filter((i) => i.item_kode !== 'ktl_tahun_lalu');
      if (nonKtlItems.length > 0) {
        const { data: existingCheck } = await supabase
          .from('pembayaran_santri_detail')
          .select('item_kode, periode_bulan, label_item')
          .eq('santri_id', activeSantri.id)
          .eq('tahun_ajaran', effectiveTa);

        const existingSet = new Set(
          (existingCheck || []).map((e) => `${e.item_kode}__${e.periode_bulan}`)
        );
        const dup = nonKtlItems.find((i) => existingSet.has(`${i.item_kode}__${i.periode_bulan}`));
        if (dup) {
          showToast('error', 'Item Sudah Lunas', `${dup.label_item} sudah tercatat lunas sebelumnya. Memuat ulang data...`);
          await fetchAllData();
          setSavingPayment(false);
          return;
        }
      }

      generatedNoKuitansi = await generateNextNoKuitansi(effectiveTglBayar);

      let uploadedBuktiUrl = '';
      if (metodeBayar === 'transfer' && loketBuktiFile) {
        uploadedBuktiUrl = await uploadKeuanganLampiranImage(loketBuktiFile, 'bukti_tf');
      }

      // 1. Siapkan baris untuk pembayaran_santri_detail
      const detailPayload = loketCartSummary.items.map((item, idx) => ({
        santri_id: activeSantri.id,
        tahun_ajaran: effectiveTa,
        item_kode: item.item_kode,
        periode_bulan: item.item_kode === 'ktl_tahun_lalu' ? `KTL-${Date.now()}-${idx}` : item.periode_bulan,
        label_item: item.label_item,
        dompet: item.dompet,
        nominal: item.nominal,
        is_migrasi: false,
        no_kuitansi: generatedNoKuitansi,
        metode_pembayaran: metodeBayar,
        tgl_bayar: effectiveTglBayar,
        petugas_nama: petugasNama,
      }));

      const { error: detailError } = await insertPembayaranDetailResilient(detailPayload);

      if (detailError) throw detailError;

      // 2. Kelompokkan per dompet untuk masuk ke keuangan_transaksi (Buku Kas)
      const groupedByDompet: Record<DompetType, { nominal: number; labels: string[] }> = {
        pendaftaran: { nominal: 0, labels: [] },
        operasional: { nominal: 0, labels: [] },
        kas_pondok: { nominal: 0, labels: [] },
        mda: { nominal: 0, labels: [] },
      };

      loketCartSummary.items.forEach((item) => {
        groupedByDompet[item.dompet].nominal += item.nominal;
        groupedByDompet[item.dompet].labels.push(item.label_item);
      });

      const kasRows = (Object.keys(groupedByDompet) as DompetType[])
        .filter((d) => groupedByDompet[d].nominal > 0)
        .map((d) => ({
          santri_id: activeSantri.id,
          dompet: d,
          tipe: 'masuk' as const,
          kategori:
            d === 'pendaftaran'
              ? bayarPsbChecked && !activeSantriHasPsb
                ? `Pendaftaran ${bayarPsbPaket.toUpperCase()} (PSB)`
                : 'Infaq Madin'
              : d === 'mda'
              ? 'Iuran Ujian / Raport MDA'
              : 'Syahriyah & Iuran Santri',
          nominal: groupedByDompet[d].nominal,
          bulan_tagihan: groupedByDompet[d].labels.join(', '),
          keterangan: `Pembayaran ${activeSantri.nama_lengkap} (${activeSantri.kamar}) - ${groupedByDompet[d].labels.join(', ')}`,
          metode_pembayaran: metodeBayar,
          petugas_id: petugasId,
          tgl_transaksi: tglBayarInput,
          no_kuitansi: generatedNoKuitansi,
        }));

      const { error: kasError } = await insertKeuanganTransaksiResilient(
        kasRows,
        uploadedBuktiUrl || undefined
      );

      if (kasError) {
        // Rollback detail jika gagal simpan buku kas
        await supabase
          .from('pembayaran_santri_detail')
          .delete()
          .eq('no_kuitansi', generatedNoKuitansi);
        throw kasError;
      }

      // 3. Jika membayar PSB, sinkronkan paket & nominal pendaftaran pada profil santri
      if (bayarPsbChecked && !activeSantriHasPsb) {
        await supabase
          .from('santri')
          .update({
            paket_pendaftaran: bayarPsbPaket,
            nominal_pendaftaran: psbLoketPreview.totalBayar,
          })
          .eq('id', activeSantri.id);
      }

      // 4. Jika membayar KTL, kurangi sisa ktl_nominal pada tabel santri
      if (bayarKtlChecked && Number(bayarKtlNominal) > 0) {
        const sisaBaru = Math.max(0, Number(activeSantri.ktl_nominal || 0) - Number(bayarKtlNominal));
        await supabase
          .from('santri')
          .update({
            ktl_nominal: sisaBaru,
            ktl_catatan: sisaBaru === 0 ? null : activeSantri.ktl_catatan,
          })
          .eq('id', activeSantri.id);
      }

      // Sinkronkan filter bulan Buku Kas ke bulan transaksi baru agar langsung terlihat
      if (tglBayarInput && tglBayarInput.length >= 7) {
        setKasBulanFilter(tglBayarInput.slice(0, 7));
      }

      const newReceiptGroup: KuitansiGroup = {
        no_kuitansi: generatedNoKuitansi,
        santri_id: activeSantri.id,
        santri_nama: activeSantri.nama_lengkap,
        santri_nis: activeSantri.nis,
        santri_kamar: activeSantri.kamar,
        santri_wali: getWaliDisplayName(activeSantri),
        santri_wa: getActiveWaContact(activeSantri)?.number || '',
        tahun_ajaran: tahunAjaran,
        tgl_bayar: tglBayarInput,
        metode_pembayaran: metodeBayar,
        petugas_nama: petugasNama,
        total_nominal: loketCartSummary.total,
        items: detailPayload.map((d, idx) => ({ ...d, id: `temp-${idx}` })),
      };

      await fetchAllData();
      setSelectedBulanPeriodes([]);
      setSelectedTahunanKodes([]);
      setBayarKtlChecked(false);
      setBayarPsbChecked(false);
      setLoketBuktiFile(null);
      setLoketBuktiPreview('');
      setSelectedKuitansi(newReceiptGroup);
      setActiveTab('kuitansi');

      showToast(
        'success',
        'Pembayaran Berhasil & Kuitansi Terbit',
        metodeBayar === 'transfer'
          ? `No. Kuitansi ${generatedNoKuitansi} sebesar ${formatRupiah(loketCartSummary.total)} masuk laporan Pemasukan Transfer (saldo kas tunai tidak berubah).`
          : `No. Kuitansi ${generatedNoKuitansi} sebesar ${formatRupiah(loketCartSummary.total)} masuk ke Dompet Tunai & Buku Kas.`
      );
    } catch (err: unknown) {
      const msg = extractKeuanganError(err, 'Gagal menyimpan transaksi pembayaran.');
      showToast('error', 'Transaksi Gagal', msg);
    } finally {
      setSavingPayment(false);
    }
  };

  // ==========================================================================
  // TAB 2: KELOMPOK KUITANSI, COPY TEKS WA, UNDUH PNG & HAPUS TRANSAKSI
  // ==========================================================================
  const kuitansiGroups = useMemo(() => {
    const map = new Map<string, KuitansiGroup>();
    const santriById = new Map<string, SantriItem>();
    santriList.forEach((s) => santriById.set(s.id, s));

    pembayaranDetails.forEach((det) => {
      if (det.is_migrasi || !det.no_kuitansi) return;
      const s = santriById.get(det.santri_id);
      const existing = map.get(det.no_kuitansi);
      if (existing) {
        existing.items.push(det);
        existing.total_nominal += Number(det.nominal || 0);
      } else {
        map.set(det.no_kuitansi, {
          no_kuitansi: det.no_kuitansi,
          santri_id: det.santri_id,
          santri_nama: s?.nama_lengkap || 'Santri',
          santri_nis: s?.nis || '-',
          santri_kamar: s?.kamar || '-',
          santri_wali: s ? getWaliDisplayName(s) : 'Wali Santri',
          santri_wa: s ? getActiveWaContact(s)?.number || '' : '',
          tahun_ajaran: det.tahun_ajaran,
          tgl_bayar: det.tgl_bayar || todayStr,
          metode_pembayaran: (det.metode_pembayaran || 'tunai') as 'tunai' | 'transfer',
          petugas_nama: det.petugas_nama || 'Bendahara Pondok',
          total_nominal: Number(det.nominal || 0),
          items: [det],
        });
      }
    });

    return Array.from(map.values()).sort((a, b) =>
      b.no_kuitansi.localeCompare(a.no_kuitansi)
    );
  }, [pembayaranDetails, santriList, todayStr]);

  const filteredKuitansiGroups = useMemo(() => {
    const q = kuitansiSearch.trim().toLowerCase();
    return kuitansiGroups.filter((k) => {
      if (kuitansiBulanFilter !== 'SEMUA' && !(k.tgl_bayar || '').startsWith(kuitansiBulanFilter)) {
        return false;
      }
      if (!q) return true;
      return (
        k.no_kuitansi.toLowerCase().includes(q) ||
        k.santri_nama.toLowerCase().includes(q) ||
        k.santri_nis.toLowerCase().includes(q) ||
        k.santri_kamar.toLowerCase().includes(q)
      );
    });
  }, [kuitansiGroups, kuitansiSearch, kuitansiBulanFilter]);

  const activeKuitansi = useMemo(() => {
    if (selectedKuitansi) {
      const fresh = kuitansiGroups.find((k) => k.no_kuitansi === selectedKuitansi.no_kuitansi);
      return fresh || selectedKuitansi;
    }
    return filteredKuitansiGroups[0] || kuitansiGroups[0] || null;
  }, [selectedKuitansi, kuitansiGroups, filteredKuitansiGroups]);

  // Salin Teks Bukti Pembayaran (Copy Teks)
  const handleCopyTeksKuitansi = async (kwt: KuitansiGroup) => {
    const rincianLines = kwt.items
      .map((item, i) => `${i + 1}. ${item.label_item} — ${formatRupiah(item.nominal)}`)
      .join('\n');

    const teksWA = [
      `*BUKTI PEMBAYARAN SANTRI*`,
      `*${pengaturan.nama_pesantren.toUpperCase()}*`,
      `----------------------------------------`,
      `No. Kuitansi : *${kwt.no_kuitansi}*`,
      `Tanggal      : ${formatTanggalIndo(kwt.tgl_bayar)}`,
      `Nama Santri  : *${kwt.santri_nama}* (${kwt.santri_nis})`,
      `Khos / Kamar : ${kwt.santri_kamar}`,
      `Tahun Ajaran : ${kwt.tahun_ajaran}`,
      `----------------------------------------`,
      `*Rincian Pembayaran:*`,
      rincianLines,
      `----------------------------------------`,
      `*TOTAL DIBAYAR : ${formatRupiah(kwt.total_nominal)}*`,
      `Metode Bayar  : ${kwt.metode_pembayaran === 'transfer' ? 'Transfer Bank' : 'Tunai (Cash)'}`,
      `Penerima      : ${kwt.petugas_nama}`,
      ``,
      `_Jazakumullahu khairan katsiran atas kepercayaan dan kerjasamanya._`,
    ].join('\n');

    try {
      await navigator.clipboard.writeText(teksWA);
      setCopiedKuitansiNo(kwt.no_kuitansi);
      showToast('success', 'Teks Bukti Tersalin', 'Teks rincian kuitansi berhasil disalin ke clipboard. Silakan tempel (Paste) di WhatsApp.');
      setTimeout(() => setCopiedKuitansiNo(null), 3000);
    } catch {
      showToast('error', 'Gagal Menyalin', 'Browser tidak mengizinkan akses clipboard otomatis.');
    }
  };

  // Render & Unduh PNG Kuitansi 21x10 cm (Resolusi Tajam + Logo Kop & Logo Watermark)
  const handleDownloadKuitansiPng = async (kwt: KuitansiGroup) => {
    setDownloadingPng(true);
    try {
      const width = 1680; // 210mm * 8px/mm
      const height = 800; // 100mm * 8px/mm
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas tidak didukung browser');

      // Background putih bersih
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, height);

      // Bingkai luar kuitansi
      ctx.strokeStyle = '#065f46';
      ctx.lineWidth = 4;
      ctx.strokeRect(20, 20, width - 40, height - 40);

      // Helper load image aman CORS
      const loadImg = (url?: string): Promise<HTMLImageElement | null> =>
        new Promise((resolve) => {
          if (!url) return resolve(null);
          const img = new Image();
          img.crossOrigin = 'anonymous';
          img.onload = () => resolve(img);
          img.onerror = () => resolve(null);
          img.src = url;
        });

      const [logoKopImg, watermarkImg, stempelImg, ttdBendaharaImg] = await Promise.all([
        loadImg(pengaturan.logo_url),
        loadImg(pengaturan.logo_watermark_url || pengaturan.logo_url),
        loadImg(pengaturan.stempel_url),
        loadImg(pengaturan.ttd_bendahara_url),
      ]);

      // Watermark Logo Pondok (Hanya jika ada logo, tanpa teks SIAP AN-NUR 1)
      if (watermarkImg) {
        ctx.save();
        ctx.globalAlpha = 0.08;
        ctx.globalCompositeOperation = 'multiply';
        const wmSize = 420;
        const aspect = watermarkImg.width / Math.max(1, watermarkImg.height);
        const wmW = aspect >= 1 ? wmSize : wmSize * aspect;
        const wmH = aspect >= 1 ? wmSize / aspect : wmSize;
        ctx.drawImage(watermarkImg, (width - wmW) / 2, (height - wmH) / 2 + 20, wmW, wmH);
        ctx.restore();
      }

      // Header Kop Kiri
      let textStartX = 48;
      if (logoKopImg) {
        ctx.drawImage(logoKopImg, 44, 34, 88, 88);
        textStartX = 148;
      }

      ctx.fillStyle = '#064e3b';
      ctx.font = 'bold 28px sans-serif';
      ctx.fillText(pengaturan.nama_pesantren.toUpperCase(), textStartX, 68);

      ctx.fillStyle = '#475569';
      ctx.font = '18px sans-serif';
      ctx.fillText(pengaturan.alamat_lengkap, textStartX, 96);
      ctx.fillText(`Telp/WA: ${pengaturan.no_telepon}  |  Tahun Ajaran ${kwt.tahun_ajaran}`, textStartX, 120);

      // Badge Kanan Atas: KUITANSI PEMBAYARAN + No Kuitansi
      ctx.fillStyle = '#065f46';
      ctx.fillRect(width - 440, 36, 396, 44);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 22px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('KUITANSI PEMBAYARAN', width - 242, 65);

      ctx.fillStyle = '#0f172a';
      ctx.font = 'bold 21px monospace';
      ctx.fillText(kwt.no_kuitansi, width - 242, 108);
      ctx.textAlign = 'left';

      // Garis Kop
      ctx.strokeStyle = '#065f46';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(40, 138);
      ctx.lineTo(width - 40, 138);
      ctx.stroke();

      // Identitas Santri
      ctx.fillStyle = '#334155';
      ctx.font = '19px sans-serif';
      ctx.fillText('Telah Terima Dari / Wali :', 48, 174);
      ctx.fillStyle = '#0f172a';
      ctx.font = 'bold 20px sans-serif';
      ctx.fillText(`${kwt.santri_wali}  (Wali dari ${kwt.santri_nama})`, 290, 174);

      ctx.fillStyle = '#334155';
      ctx.font = '19px sans-serif';
      ctx.fillText('NIS / Khos Kamar :', 48, 206);
      ctx.fillStyle = '#0f172a';
      ctx.font = 'bold 20px sans-serif';
      ctx.fillText(`${kwt.santri_nis}  /  Kamar ${kwt.santri_kamar}`, 290, 206);

      ctx.fillStyle = '#334155';
      ctx.font = '19px sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(
        `Tanggal: ${formatTanggalIndo(kwt.tgl_bayar)}  |  Metode: ${kwt.metode_pembayaran.toUpperCase()}`,
        width - 48,
        206
      );
      ctx.textAlign = 'left';

      // Kotak Rincian Pembayaran (Column-First & Top-Aligned)
      ctx.fillStyle = 'rgba(248, 250, 252, 0.85)';
      ctx.fillRect(44, 224, width - 88, 340);
      ctx.strokeStyle = '#cbd5e1';
      ctx.lineWidth = 2;
      ctx.strokeRect(44, 224, width - 88, 340);

      ctx.fillStyle = '#065f46';
      ctx.font = 'bold 18px sans-serif';
      ctx.fillText('RINCIAN PEMBAYARAN:', 64, 254);

      const items = kwt.items;
      const isTwoCol = items.length > 4;
      const mid = Math.ceil(items.length / 2);

      ctx.font = '19px sans-serif';
      items.forEach((item, idx) => {
        const isRightCol = isTwoCol && idx >= mid;
        const rowIndex = isRightCol ? idx - mid : idx;
        const colX = isRightCol ? width / 2 + 20 : 64;
        const colMaxW = isTwoCol ? width / 2 - 90 : width - 130;
        const yPos = 290 + rowIndex * 36;

        if (yPos <= 548) {
          ctx.fillStyle = '#0f172a';
          const textLeft = `${idx + 1}. ${item.label_item}`;
          ctx.fillText(textLeft.slice(0, 48), colX, yPos);

          ctx.font = 'bold 19px sans-serif';
          ctx.textAlign = 'right';
          ctx.fillText(formatRupiah(item.nominal), colX + colMaxW, yPos);
          ctx.textAlign = 'left';
          ctx.font = '19px sans-serif';
        }
      });

      // Kotak Total & Terbilang Kiri Bawah
      ctx.fillStyle = '#ecfdf5';
      ctx.fillRect(44, 582, 980, 74);
      ctx.strokeStyle = '#059669';
      ctx.lineWidth = 2.5;
      ctx.strokeRect(44, 582, 980, 74);

      ctx.fillStyle = '#064e3b';
      ctx.font = 'bold 26px sans-serif';
      ctx.fillText(`TOTAL BAYAR : ${formatRupiah(kwt.total_nominal)}`, 64, 628);

      ctx.fillStyle = '#334155';
      ctx.font = 'italic 18px sans-serif';
      ctx.fillText(`Terbilang: # ${terbilang(kwt.total_nominal)} #`, 48, 692);

      // Blok TTD & Stempel Kanan Bawah
      const signCenterX = width - 250;
      ctx.fillStyle = '#334155';
      ctx.font = '18px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`Bululawang, ${formatTanggalIndo(kwt.tgl_bayar)}`, signCenterX, 602);
      ctx.fillText('Bendahara / Penerima,', signCenterX, 626);

      if (stempelImg) {
        ctx.save();
        ctx.globalAlpha = 0.85;
        ctx.drawImage(stempelImg, signCenterX - 110, 624, 105, 105);
        ctx.restore();
      }
      if (ttdBendaharaImg) {
        ctx.drawImage(ttdBendaharaImg, signCenterX - 70, 628, 140, 82);
      }

      ctx.fillStyle = '#0f172a';
      ctx.font = 'bold 19px sans-serif';
      ctx.fillText(kwt.petugas_nama || pengaturan.nama_bendahara, signCenterX, 742);
      ctx.textAlign = 'left';

      // Download PNG
      const dataUrl = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.download = `${kwt.no_kuitansi}_${kwt.santri_nama.replace(/\s+/g, '_')}.png`;
      link.href = dataUrl;
      link.click();

      showToast('success', 'PNG Kuitansi Diunduh', `File gambar ${kwt.no_kuitansi}.png siap dikirim via WhatsApp.`);
    } catch (err: unknown) {
      const msg = extractKeuanganError(err, 'Gagal membuat gambar PNG kuitansi.');
      showToast('error', 'Gagal Unduh PNG', msg);
    } finally {
      setDownloadingPng(false);
    }
  };

  // Hapus Transaksi Pembayaran Santri (Hanya Pimpinan Inti, Bendahara Tampil Notif Peringatan)
  const handleClickHapusKuitansi = (kwt: KuitansiGroup) => {
    if (!canEditKeuangan) return;
    if (!isPimpinanInti && userRole !== 'super_admin') {
      showToast(
        'warning',
        'Akses Dibatasi (Khusus Pimpinan Inti)',
        'Penghapusan transaksi pembayaran santri hanya dapat dilakukan oleh Pengasuh / Kepala Pondok. Silakan hubungi Pimpinan Inti untuk menghapus transaksi tersebut.'
      );
      return;
    }

    setConfirmDialog({
      open: true,
      title: `Hapus Transaksi ${kwt.no_kuitansi}?`,
      message: `Transaksi pembayaran milik ${kwt.santri_nama} sebesar ${formatRupiah(
        kwt.total_nominal
      )} akan dihapus permanen. Status bulan Syahriyah / Iuran Tahunan terkait otomatis kembali menjadi BELUM BAYAR dan saldo Buku Kas akan dikurangi.`,
      confirmText: 'Ya, Hapus Transaksi',
      danger: true,
      onConfirm: async () => {
        try {
          // 1. Cek apakah ada pembayaran KTL di kuitansi ini agar dikembalikan ke sisa KTL santri
          const ktlPaidSum = kwt.items
            .filter((i) => i.item_kode === 'ktl_tahun_lalu')
            .reduce((acc, cur) => acc + Number(cur.nominal || 0), 0);

          if (ktlPaidSum > 0) {
            const targetSantri = santriList.find((s) => s.id === kwt.santri_id);
            if (targetSantri) {
              const restoredKtl = Number(targetSantri.ktl_nominal || 0) + ktlPaidSum;
              await supabase
                .from('santri')
                .update({
                  ktl_nominal: restoredKtl,
                  ktl_catatan: targetSantri.ktl_catatan || 'Kekurangan Tahun Lalu',
                })
                .eq('id', targetSantri.id);
            }
          }

          // 2. Hapus dari pembayaran_santri_detail
          const { error: delDetErr } = await supabase
            .from('pembayaran_santri_detail')
            .delete()
            .eq('no_kuitansi', kwt.no_kuitansi);
          if (delDetErr) throw delDetErr;

          // 3. Hapus dari keuangan_transaksi
          const { error: delKasErr } = await supabase
            .from('keuangan_transaksi')
            .delete()
            .eq('no_kuitansi', kwt.no_kuitansi);
          if (delKasErr) throw delKasErr;

          if (selectedKuitansi?.no_kuitansi === kwt.no_kuitansi) {
            setSelectedKuitansi(null);
          }

          await fetchAllData();
          showToast(
            'success',
            'Transaksi Berhasil Dihapus',
            `Kuitansi ${kwt.no_kuitansi} telah dihapus dan status tagihan santri dikembalikan.`
          );
        } catch (err: unknown) {
          const msg = extractKeuanganError(err, 'Gagal menghapus transaksi.');
          showToast('error', 'Gagal Menghapus', msg);
        }
      },
    });
  };

  // ==========================================================================
  // TAB 3: PERHITUNGAN TUNGGAKAN 2 JALUR (JATUH TEMPO TANGGAL 10)
  // ==========================================================================
  const tunggakanData = useMemo(() => {
    if (!todayStr || !tahunAjaran) return [];
    const parts = todayStr.split('-');
    const nowYear = parseInt(parts[0], 10);
    const nowMonth = parseInt(parts[1], 10);
    const nowDay = parseInt(parts[2], 10);
    const jatuhTempoTgl = Number(pengaturan.jatuh_tempo_tanggal || 10);

    // Periode jatuh tempo terakhir: jika hari ini > tgl 10, bulan berjalan ikut ditagih; jika <= tgl 10, s/d bulan lalu
    let cutoffYear = nowYear;
    let cutoffMonth = nowDay > jatuhTempoTgl ? nowMonth : nowMonth - 1;
    if (cutoffMonth === 0) {
      cutoffMonth = 12;
      cutoffYear -= 1;
    }
    const cutoffPeriode = `${cutoffYear}-${String(cutoffMonth).padStart(2, '0')}`;

    // Map detail pembayaran per santri di tahun ajaran aktif
    const paidBySantri = new Map<string, Set<string>>();
    pembayaranDetails.forEach((d) => {
      if (d.tahun_ajaran !== tahunAjaran) return;
      if (!paidBySantri.has(d.santri_id)) paidBySantri.set(d.santri_id, new Set());
      paidBySantri.get(d.santri_id)!.add(`${d.item_kode}__${d.periode_bulan}`);
    });

    return santriList
      .filter((s) => s.status !== 'boyong' && s.status !== 'alumni' && s.status !== 'pindah_al_burhany')
      .map((santri) => {
        const paidSet = paidBySantri.get(santri.id) || new Set<string>();

        // 1. Tunggakan Syahriyah s/d cutoffPeriode
        const tunggakanBulan: Array<{ periode: string; label: string; nominal: number }> = [];
        periodeListTA.forEach((p) => {
          if (p.periode <= cutoffPeriode && !paidSet.has(`syahriyah__${p.periode}`)) {
            tunggakanBulan.push({
              periode: p.periode,
              label: `${p.nama} ${p.tahun}`,
              nominal: getSyahriyahNominalForPeriode(santri, p.periode),
            });
          }
        });

        // 2. Tunggakan Tahunan (hanya item yang dicentang di filter dinamis, dan tidak wajib untuk Ndalem)
        const tunggakanTahunan: Array<{ kode: string; label: string; nominal: number }> = [];
        if (santri.status !== 'ndalem') {
          itemTahunanList.forEach((it) => {
            if (includedTahunanCodes.includes(it.kode) && !paidSet.has(`${it.kode}__TAHUNAN`)) {
              tunggakanTahunan.push({
                kode: it.kode,
                label: it.nama_item,
                nominal: Number(it.nominal),
              });
            }
          });
        }

        // 3. KTL (Kekurangan Tahun Lalu)
        const ktlSisa = Number(santri.ktl_nominal || 0);
        const ktlCatatan = santri.ktl_catatan || 'Kekurangan Tahun Lalu';

        const totalBulan = tunggakanBulan.reduce((a, b) => a + b.nominal, 0);
        const totalTahunan = tunggakanTahunan.reduce((a, b) => a + b.nominal, 0);
        const totalTagihan = totalBulan + totalTahunan + ktlSisa;

        const jumlahBulanNunggak = tunggakanBulan.length;
        const jalur: 'LUNAS' | 'WA_1_2' | 'SURAT_3_PLUS' =
          jumlahBulanNunggak >= 3
            ? 'SURAT_3_PLUS'
            : jumlahBulanNunggak >= 1 || totalTagihan > 0
            ? 'WA_1_2'
            : 'LUNAS';

        return {
          santri,
          tunggakanBulan,
          tunggakanTahunan,
          ktlSisa,
          ktlCatatan,
          totalTagihan,
          jumlahBulanNunggak,
          jalur,
        };
      })
      .filter((row) => row.totalTagihan > 0);
  }, [
    santriList,
    todayStr,
    pengaturan.jatuh_tempo_tanggal,
    pembayaranDetails,
    tahunAjaran,
    periodeListTA,
    getSyahriyahNominalForPeriode,
    itemTahunanList,
    includedTahunanCodes,
  ]);

  const filteredTunggakan = useMemo(() => {
    const q = tagihanSearch.trim().toLowerCase();
    return tunggakanData.filter((row) => {
      if (
        tagihanKamarFilter !== 'SEMUA' &&
        (row.santri.kamar || '').toUpperCase() !== tagihanKamarFilter.toUpperCase()
      ) {
        return false;
      }
      if (tagihanKategoriFilter !== 'SEMUA' && row.jalur !== tagihanKategoriFilter) {
        return false;
      }
      if (!q) return true;
      return (
        (row.santri.nama_lengkap || '').toLowerCase().includes(q) ||
        (row.santri.nis || '').toLowerCase().includes(q) ||
        (row.santri.kamar || '').toLowerCase().includes(q)
      );
    });
  }, [tunggakanData, tagihanSearch, tagihanKamarFilter, tagihanKategoriFilter]);

  const handleChatWaTagihan = (row: (typeof tunggakanData)[number]) => {
    const wa = getActiveWaContact(row.santri);
    if (!wa) {
      showToast('warning', 'Nomor WA Tidak Tersedia', `Santri ${row.santri.nama_lengkap} belum memiliki nomor WA Ayah/Ibu/Wali.`);
      return;
    }

    const rincian: string[] = [];
    if (row.ktlSisa > 0) {
      rincian.push(`• KTL (${row.ktlCatatan}): ${formatRupiah(row.ktlSisa)}`);
    }
    row.tunggakanBulan.forEach((b) => {
      rincian.push(`• Syahriyah ${b.label}: ${formatRupiah(b.nominal)}`);
    });
    row.tunggakanTahunan.forEach((t) => {
      rincian.push(`• ${t.label}: ${formatRupiah(t.nominal)}`);
    });

    const pesan = [
      `Assalamu'alaikum Wr. Wb.`,
      `Yth. Bapak/Ibu ${getWaliDisplayName(row.santri)},`,
      `Wali santri dari *${row.santri.nama_lengkap}* (NIS: ${row.santri.nis} / Kamar ${row.santri.kamar}).`,
      ``,
      `Menginformasikan rincian administrasi keuangan ${pengaturan.nama_pesantren} (TA ${tahunAjaran}) yang belum terselesaikan:`,
      ...rincian,
      ``,
      `*Total Tagihan: ${formatRupiah(row.totalTagihan)}*`,
      ``,
      `Mohon kiranya dapat segera diselesaikan melalui Kantor Bendahara Pondok atau transfer rekening resmi pesantren. Atas perhatian dan kerjasamanya kami sampaikan jazakumullahu khairan katsiran.`,
      `Wassalamu'alaikum Wr. Wb.`,
    ].join('\n');

    window.open(`https://wa.me/${wa.number}?text=${encodeURIComponent(pesan)}`, '_blank');
  };

  const handleCetakSuratTagihanSatuan = (row: (typeof tunggakanData)[number]) => {
    setSuratTagihanTargets([
      {
        santri: row.santri,
        tunggakanBulan: row.tunggakanBulan,
        tunggakanTahunan: row.tunggakanTahunan,
        ktlSisa: row.ktlSisa,
        ktlCatatan: row.ktlCatatan,
        totalTagihan: row.totalTagihan,
      },
    ]);
    triggerPrint('surat_tagihan');
  };

  const handleCetakSuratTagihanMassal = () => {
    const targets = filteredTunggakan
      .filter((r) =>
        selectedTagihanSantriIds.length > 0
          ? selectedTagihanSantriIds.includes(r.santri.id)
          : r.jalur === 'SURAT_3_PLUS'
      )
      .map((r) => ({
        santri: r.santri,
        tunggakanBulan: r.tunggakanBulan,
        tunggakanTahunan: r.tunggakanTahunan,
        ktlSisa: r.ktlSisa,
        ktlCatatan: r.ktlCatatan,
        totalTagihan: r.totalTagihan,
      }));

    if (targets.length === 0) {
      showToast('warning', 'Tidak Ada Santri Dipilih', 'Tidak ada santri dengan tunggakan >= 3 bulan pada filter saat ini.');
      return;
    }

    setSuratTagihanTargets(targets);
    triggerPrint('surat_tagihan');
  };

  // ==========================================================================
  // TAB 4: BUKU KAS UMUM & PENCAIRAN BISYAROH PENGURUS
  // ==========================================================================
  const filteredKasTransaksi = useMemo(() => {
    const q = kasSearch.trim().toLowerCase();
    return visibleKasTransaksi.filter((tx) => {
      if (kasBulanFilter !== 'SEMUA' && !(tx.tgl_transaksi || '').startsWith(kasBulanFilter)) {
        return false;
      }
      if (kasDompetFilter !== 'SEMUA' && tx.dompet !== kasDompetFilter) {
        return false;
      }
      if (kasTipeFilter !== 'SEMUA' && tx.tipe !== kasTipeFilter) {
        return false;
      }
      if (kasMetodeFilter !== 'SEMUA' && tx.metode_pembayaran !== kasMetodeFilter) {
        return false;
      }
      if (!q) return true;
      return (
        (tx.kategori || '').toLowerCase().includes(q) ||
        (tx.keterangan || '').toLowerCase().includes(q) ||
        (tx.no_kuitansi || '').toLowerCase().includes(q) ||
        (tx.santri?.nama_lengkap || '').toLowerCase().includes(q)
      );
    });
  }, [visibleKasTransaksi, kasBulanFilter, kasDompetFilter, kasTipeFilter, kasMetodeFilter, kasSearch]);

  const kasFilteredTotals = useMemo(() => {
    let tunaiMasuk = 0;
    let tunaiKeluar = 0;
    let transferMasuk = 0;
    let transferKeluar = 0;
    filteredKasTransaksi.forEach((tx) => {
      const nom = Number(tx.nominal || 0);
      const isTransfer = tx.metode_pembayaran === 'transfer';
      if (tx.tipe === 'masuk') {
        if (isTransfer) transferMasuk += nom;
        else tunaiMasuk += nom;
      } else {
        if (isTransfer) transferKeluar += nom;
        else tunaiKeluar += nom;
      }
    });
    return {
      tunaiMasuk,
      tunaiKeluar,
      tunaiNetto: tunaiMasuk - tunaiKeluar,
      transferMasuk,
      transferKeluar,
      transferNetto: transferMasuk - transferKeluar,
    };
  }, [filteredKasTransaksi]);

  const handleSimpanKasManual = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEditKeuangan) return;
    if (!canViewBisyaroh && kasForm.kategori.toLowerCase().includes('bisyaroh')) {
      showToast('error', 'Akses Ditolak', 'Kategori Bisyaroh hanya dapat dicatat oleh Pimpinan Inti dan Bendahara.');
      return;
    }
    const nom = Number(kasForm.nominal.replace(/\D/g, ''));
    if (nom <= 0) {
      showToast('warning', 'Nominal Tidak Valid', 'Masukkan nominal transaksi lebih dari Rp 0.');
      return;
    }

    setSavingKas(true);
    try {
      let uploadedLampiranUrl = '';
      if (kasLampiranFile) {
        uploadedLampiranUrl = await uploadKeuanganLampiranImage(
          kasLampiranFile,
          kasForm.metode_pembayaran === 'transfer' ? 'bukti_tf' : 'nota'
        );
      }

      const { error } = await insertKeuanganTransaksiResilient(
        [
          {
            dompet: kasForm.dompet,
            tipe: kasForm.tipe,
            kategori:
              kasForm.kategori.trim() ||
              (kasForm.tipe === 'masuk' ? 'Pemasukan Lain' : 'Pengeluaran Operasional'),
            nominal: nom,
            keterangan: kasForm.keterangan.trim() || '-',
            metode_pembayaran: kasForm.metode_pembayaran,
            petugas_id: petugasId,
            tgl_transaksi: kasForm.tgl_transaksi,
          },
        ],
        uploadedLampiranUrl || undefined
      );

      if (error) throw error;

      if (kasForm.tgl_transaksi && kasForm.tgl_transaksi.length >= 7) {
        setKasBulanFilter(kasForm.tgl_transaksi.slice(0, 7));
      }

      await fetchAllData();
      setShowKasModal(false);
      setKasForm((prev) => ({ ...prev, nominal: '', keterangan: '' }));
      setKasLampiranFile(null);
      setKasLampiranPreview('');
      showToast(
        'success',
        'Transaksi Kas Tercatat',
        kasForm.metode_pembayaran === 'transfer'
          ? `${kasForm.tipe === 'masuk' ? 'Pemasukan' : 'Pengeluaran'} transfer ${formatRupiah(nom)} dicatat ke laporan Pemasukan Transfer.`
          : `${kasForm.tipe === 'masuk' ? 'Pemasukan' : 'Pengeluaran'} tunai sebesar ${formatRupiah(nom)} berhasil disimpan.`
      );
    } catch (err: unknown) {
      const msg = extractKeuanganError(err, 'Gagal menyimpan transaksi kas.');
      showToast('error', 'Gagal Menyimpan Kas', msg);
    } finally {
      setSavingKas(false);
    }
  };

  const handleQuickAttachChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const target = quickAttachTarget;
    e.target.value = '';
    if (!file || !target) return;

    const lockKey = String(target.noKuitansi || target.txId || 'attach');
    setUploadingLampiranId(lockKey);
    try {
      const url = await uploadKeuanganLampiranImage(file, target.kind);
      const { persistedToDb } = await updateKeuanganLampiranResilient({
        txId: target.txId,
        noKuitansi: target.noKuitansi,
        url,
      });
      setLampiranMap(readKeuanganLampiranMap());
      await fetchAllData();
      if (lightboxLampiran && (lightboxLampiran.txId === target.txId || (target.noKuitansi && lightboxLampiran.noKuitansi === target.noKuitansi))) {
        setLightboxLampiran((prev) => (prev ? { ...prev, url } : null));
      }
      showToast(
        'success',
        target.kind === 'bukti_tf' ? 'Bukti Transfer Terpasang' : 'Scan Nota Terpasang',
        persistedToDb
          ? 'Foto lampiran tersimpan di database & siap tampil di Pusat Laporan.'
          : 'Foto lampiran tersimpan & siap tampil di Pusat Laporan.'
      );
    } catch (err: unknown) {
      const msg = extractKeuanganError(err, 'Gagal memproses gambar lampiran.');
      showToast('error', 'Gagal Unggah Foto', msg);
    } finally {
      setUploadingLampiranId(null);
      setQuickAttachTarget(null);
    }
  };

  const handleDeleteKasRow = (tx: KeuanganTransaksiItem) => {
    if (!canEditKeuangan) return;
    if (tx.no_kuitansi) {
      showToast(
        'info',
        'Transaksi Terhubung Kuitansi Santri',
        `Transaksi ini berasal dari kuitansi santri (${tx.no_kuitansi}). Gunakan tombol Hapus Transaksi pada Tab 2. Kuitansi 21×10 cm (khusus Pimpinan Inti).`
      );
      return;
    }

    setConfirmDialog({
      open: true,
      title: 'Hapus Catatan Buku Kas?',
      message: `Catatan "${tx.kategori}" sebesar ${formatRupiah(tx.nominal)} akan dihapus permanen dan saldo dompet akan disesuaikan kembali.`,
      confirmText: 'Ya, Hapus Catatan',
      danger: true,
      onConfirm: async () => {
        const { error } = await supabase.from('keuangan_transaksi').delete().eq('id', tx.id);
        if (error) {
          showToast('error', 'Gagal Menghapus', error.message);
        } else {
          await fetchAllData();
          showToast('success', 'Catatan Kas Dihapus', 'Mutasi kas berhasil dihapus dan saldo diperbarui.');
        }
      },
    });
  };

  const totalBisyarohDipilih = useMemo(() => {
    return Object.values(selectedPengurusBisyaroh).reduce(
      (acc, item) => (item.checked ? acc + Number(item.nominal || 0) : acc),
      0
    );
  }, [selectedPengurusBisyaroh]);

  const handleCairkanBisyarohKolektif = async () => {
    if (!canEditKeuangan || !canViewBisyaroh) return;
    const dipilih = pengurusList.filter((p) => selectedPengurusBisyaroh[p.id]?.checked && Number(selectedPengurusBisyaroh[p.id]?.nominal) > 0);
    if (dipilih.length === 0) {
      showToast('warning', 'Belum Ada Pengurus Dipilih', 'Centang minimal 1 pengurus yang akan dicairkan bisyarohnya.');
      return;
    }

    setSavingBisyaroh(true);
    try {
      const daftarNama = dipilih
        .map((p) => `${p.nama_lengkap} (${formatRupiah(selectedPengurusBisyaroh[p.id].nominal)})`)
        .join(', ');

      const { error } = await insertKeuanganTransaksiResilient([
        {
          dompet: bisyarohDompet,
          tipe: 'keluar',
          kategori: `Bisyaroh Pengurus (${bisyarohBulanLabel})`,
          nominal: totalBisyarohDipilih,
          keterangan: `Pencairan kolektif ${dipilih.length} pengurus bulan ${bisyarohBulanLabel}: ${daftarNama}`,
          metode_pembayaran: bisyarohMetode,
          petugas_id: petugasId,
          tgl_transaksi: bisyarohTgl,
        },
      ]);

      if (error) throw error;

      if (bisyarohTgl && bisyarohTgl.length >= 7) {
        setKasBulanFilter(bisyarohTgl.slice(0, 7));
      }

      await fetchAllData();
      setShowBisyarohModal(false);
      showToast(
        'success',
        'Bisyaroh Pengurus Dicairkan',
        bisyarohMetode === 'transfer'
          ? `Total ${formatRupiah(totalBisyarohDipilih)} untuk ${dipilih.length} pengurus dicatat sebagai pengeluaran Transfer Bank (saldo kas tunai tidak berubah).`
          : `Total ${formatRupiah(totalBisyarohDipilih)} untuk ${dipilih.length} pengurus telah dicatat di Buku Kas Tunai.`
      );
    } catch (err: unknown) {
      const msg = extractKeuanganError(err, 'Gagal mencatat pencairan bisyaroh.');
      showToast('error', 'Gagal Pencairan Bisyaroh', msg);
    } finally {
      setSavingBisyaroh(false);
    }
  };

  const handleExportBukuKasExcel = () => {
    const rows = filteredKasTransaksi.map((tx, idx) => ({
      No: idx + 1,
      Tanggal: tx.tgl_transaksi,
      No_Kuitansi: tx.no_kuitansi || '-',
      Dompet: DOMPET_META[tx.dompet]?.shortLabel || tx.dompet,
      Jenis: tx.tipe === 'masuk' ? 'Pemasukan' : 'Pengeluaran',
      Metode: tx.metode_pembayaran === 'transfer' ? 'Transfer' : 'Tunai',
      Kategori: tx.kategori,
      Santri: tx.santri ? `${tx.santri.nama_lengkap} (${tx.santri.kamar})` : '-',
      Keterangan: tx.keterangan || '-',
      Nominal: Number(tx.nominal || 0),
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Buku_Kas_AnNur1');
    XLSX.writeFile(wb, `Buku_Kas_SIAP_AnNur1_${kasBulanFilter}.xlsx`);
    showToast('success', 'Export Excel Berhasil', 'File rekap Buku Kas telah diunduh.');
  };

  // ==========================================================================
  // TAB 5: MIGRASI DATA LAMA & KTL TRANSISI
  // ==========================================================================

  const filteredMigrasiSantri = useMemo(() => {
    const q = migrasiSearch.trim().toLowerCase();
    return santriList.filter((s) => {
      if (s.status === 'boyong' || s.status === 'alumni' || s.status === 'pindah_al_burhany') {
        return false;
      }
      if (migrasiKamarFilter !== 'SEMUA' && (s.kamar || '').toUpperCase() !== migrasiKamarFilter.toUpperCase()) {
        return false;
      }
      if (!q) return true;
      return (
        (s.nama_lengkap || '').toLowerCase().includes(q) ||
        (s.nis || '').toLowerCase().includes(q) ||
        (s.kamar || '').toLowerCase().includes(q)
      );
    });
  }, [santriList, migrasiSearch, migrasiKamarFilter]);

  const activeMigrasiSantri = useMemo(() => {
    return santriList.find((s) => s.id === migrasiSantriId) || filteredMigrasiSantri[0] || null;
  }, [santriList, migrasiSantriId, filteredMigrasiSantri]);

  // Sinkronkan form migrasi saat memilih santri di Tab 5
  useEffect(() => {
    if (!activeMigrasiSantri) return;
    const timer = setTimeout(() => {
      const dets = pembayaranDetails.filter(
        (d) => d.santri_id === activeMigrasiSantri.id && d.tahun_ajaran === tahunAjaran
      );
      const paidBulans = dets
        .filter((d) => d.item_kode === 'syahriyah')
        .map((d) => d.periode_bulan)
        .sort();
      if (paidBulans.length > 0) {
        setMigrasiCutOffBulan(paidBulans[paidBulans.length - 1]);
      } else {
        setMigrasiCutOffBulan('BELUM_ADA');
      }

      const paidTahunans = dets
        .filter((d) => d.periode_bulan === 'TAHUNAN')
        .map((d) => d.item_kode);
      setMigrasiTahunanChecked(paidTahunans);
      setMigrasiKtlNominal(String(Number(activeMigrasiSantri.ktl_nominal || 0)));
      setMigrasiKtlCatatan(activeMigrasiSantri.ktl_catatan || '');
    }, 0);
    return () => clearTimeout(timer);
  }, [activeMigrasiSantri, pembayaranDetails, tahunAjaran]);

  const handleSimpanMigrasiSatuan = async () => {
    if (!canEditKeuangan || !activeMigrasiSantri) return;
    setSavingMigrasi(true);
    try {
      // 1. Hapus record lama yang bertanda is_migrasi = true untuk santri & TA ini agar bersih saat disetel ulang
      await supabase
        .from('pembayaran_santri_detail')
        .delete()
        .eq('santri_id', activeMigrasiSantri.id)
        .eq('tahun_ajaran', tahunAjaran)
        .eq('is_migrasi', true);

      // Cek pembayaran non-migrasi yang sudah ada agar tidak bentrok unique constraint
      const { data: existingReal } = await supabase
        .from('pembayaran_santri_detail')
        .select('item_kode, periode_bulan')
        .eq('santri_id', activeMigrasiSantri.id)
        .eq('tahun_ajaran', tahunAjaran);

      const realSet = new Set(
        (existingReal || []).map((r) => `${r.item_kode}__${r.periode_bulan}`)
      );

      const migrasiRows: Array<Record<string, unknown>> = [];

      // 2. Masukkan Syahriyah s/d migrasiCutOffBulan
      if (migrasiCutOffBulan !== 'BELUM_ADA') {
        periodeListTA.forEach((p) => {
          if (p.periode <= migrasiCutOffBulan && !realSet.has(`syahriyah__${p.periode}`)) {
            migrasiRows.push({
              santri_id: activeMigrasiSantri.id,
              tahun_ajaran: tahunAjaran,
              item_kode: 'syahriyah',
              periode_bulan: p.periode,
              label_item: `${p.labelFull} (Migrasi Buku Lama)`,
              dompet: 'operasional',
              nominal: getSyahriyahNominalForPeriode(activeMigrasiSantri, p.periode),
              is_migrasi: true,
              tgl_bayar: todayStr,
              petugas_nama: petugasNama,
            });
          }
        });
      }

      // 3. Masukkan Item Tahunan yang sudah lunas di buku lama
      itemTahunanList.forEach((it) => {
        if (migrasiTahunanChecked.includes(it.kode) && !realSet.has(`${it.kode}__TAHUNAN`)) {
          migrasiRows.push({
            santri_id: activeMigrasiSantri.id,
            tahun_ajaran: tahunAjaran,
            item_kode: it.kode,
            periode_bulan: 'TAHUNAN',
            label_item: `${it.nama_item} (Migrasi Buku Lama)`,
            dompet: it.dompet_tujuan || 'operasional',
            nominal: Number(it.nominal),
            is_migrasi: true,
            tgl_bayar: todayStr,
            petugas_nama: petugasNama,
          });
        }
      });

      if (migrasiRows.length > 0) {
        const { error: insErr } = await insertPembayaranDetailResilient(migrasiRows);
        if (insErr) throw insErr;
      }

      // 4. Simpan KTL (Kekurangan Tahun Lalu) ke profil santri (tanpa menambah kas hari ini)
      const ktlVal = Number(migrasiKtlNominal.replace(/\D/g, '') || 0);
      const { error: ktlErr } = await supabase
        .from('santri')
        .update({
          ktl_nominal: ktlVal,
          ktl_catatan: ktlVal > 0 ? migrasiKtlCatatan.trim() || 'Tunggakan Tahun Ajaran Sebelumnya' : null,
        })
        .eq('id', activeMigrasiSantri.id);

      if (ktlErr) throw ktlErr;

      await fetchAllData();
      showToast(
        'success',
        'Data Migrasi & KTL Tersimpan',
        `Status buku lama & KTL milik ${activeMigrasiSantri.nama_lengkap} diperbarui tanpa mengubah saldo kas hari ini.`
      );
    } catch (err: unknown) {
      const msg = extractKeuanganError(err, 'Gagal menyimpan data migrasi.');
      showToast('error', 'Gagal Simpan Migrasi', msg);
    } finally {
      setSavingMigrasi(false);
    }
  };

  // Download Template Excel Migrasi (Kolom dinamis per Item Tahunan + KTL)
  const handleDownloadTemplateMigrasi = () => {
    const activeSantris = santriList.filter(
      (s) => s.status !== 'boyong' && s.status !== 'alumni' && s.status !== 'pindah_al_burhany'
    );
    const defaultCutoff = currentMonthStr || getDynamicTodayIsoWib().slice(0, 7);

    const rows = activeSantris.map((s) => {
      const base: Record<string, string | number> = {
        NIS: s.nis,
        Nama_Santri: s.nama_lengkap,
        Kamar: s.kamar,
        Lunas_Syahriyah_Sampai_YYYY_MM: defaultCutoff,
      };
      itemTahunanList.forEach((it) => {
        base[getMigrasiColNameForItem(it.kode, it.nama_item)] = 'TIDAK';
      });
      base['KTL_Nominal'] = Number(s.ktl_nominal || 0);
      base['KTL_Catatan'] = s.ktl_catatan || '';
      return base;
    });

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Migrasi_Keuangan');
    XLSX.writeFile(wb, `Template_Migrasi_Keuangan_AnNur1_${tahunAjaran.replace('/', '-')}.xlsx`);
    showToast('success', 'Template Migrasi Diunduh', 'Isi YA/TIDAK per item tahunan dan nominal KTL jika ada, lalu upload kembali.');
  };

  // Import Excel Migrasi Massal
  const handleImportExcelMigrasi = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !canEditKeuangan) return;

    setImportingMigrasi(true);
    try {
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer);
      const ws = wb.Sheets[wb.SheetNames[0]];
      const jsonRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws);

      const santriByNis = new Map<string, SantriItem>();
      santriList.forEach((s) => santriByNis.set(String(s.nis).trim(), s));

      let processedCount = 0;

      for (const row of jsonRows) {
        const nis = String(row['NIS'] || '').trim();
        const santri = santriByNis.get(nis);
        if (!santri) continue;

        const cutoff = String(row['Lunas_Syahriyah_Sampai_YYYY_MM'] || '').trim();
        const ktlNom = Number(row['KTL_Nominal'] || 0);
        const ktlCat = String(row['KTL_Catatan'] || '').trim();

        // Bersihkan migrasi lama santri ini di TA aktif
        await supabase
          .from('pembayaran_santri_detail')
          .delete()
          .eq('santri_id', santri.id)
          .eq('tahun_ajaran', tahunAjaran)
          .eq('is_migrasi', true);

        const { data: existingReal } = await supabase
          .from('pembayaran_santri_detail')
          .select('item_kode, periode_bulan')
          .eq('santri_id', santri.id)
          .eq('tahun_ajaran', tahunAjaran);

        const realSet = new Set(
          (existingReal || []).map((r) => `${r.item_kode}__${r.periode_bulan}`)
        );

        const insertBatch: Array<Record<string, unknown>> = [];

        if (cutoff && /^\d{4}-\d{2}$/.test(cutoff)) {
          periodeListTA.forEach((p) => {
            if (p.periode <= cutoff && !realSet.has(`syahriyah__${p.periode}`)) {
              insertBatch.push({
                santri_id: santri.id,
                tahun_ajaran: tahunAjaran,
                item_kode: 'syahriyah',
                periode_bulan: p.periode,
                label_item: `${p.labelFull} (Migrasi Excel)`,
                dompet: 'operasional',
                nominal: getSyahriyahNominalForPeriode(santri, p.periode),
                is_migrasi: true,
                tgl_bayar: todayStr,
                petugas_nama: petugasNama,
              });
            }
          });
        }

        itemTahunanList.forEach((it) => {
          const isYa = readMigrasiAnnualFlag(row, it.kode, it.nama_item);
          if (isYa && !realSet.has(`${it.kode}__TAHUNAN`)) {
            insertBatch.push({
              santri_id: santri.id,
              tahun_ajaran: tahunAjaran,
              item_kode: it.kode,
              periode_bulan: 'TAHUNAN',
              label_item: `${it.nama_item} (Migrasi Excel)`,
              dompet: resolveCanonicalDompetForItem(it.kode, it.dompet_tujuan),
              nominal: Number(it.nominal),
              is_migrasi: true,
              tgl_bayar: todayStr,
              petugas_nama: petugasNama,
            });
          }
        });

        if (insertBatch.length > 0) {
          const { error: batchErr } = await insertPembayaranDetailResilient(insertBatch);
          if (batchErr) throw batchErr;
        }

        await supabase
          .from('santri')
          .update({
            ktl_nominal: ktlNom > 0 ? ktlNom : 0,
            ktl_catatan: ktlNom > 0 ? ktlCat || 'Tunggakan Tahun Ajaran Sebelumnya' : null,
          })
          .eq('id', santri.id);

        processedCount++;
      }

      await fetchAllData();
      showToast(
        'success',
        'Import Migrasi Selesai',
        `${processedCount} data santri berhasil dimigrasi tanpa mengubah saldo kas hari ini.`
      );
    } catch (err: unknown) {
      const msg = extractKeuanganError(err, 'Format file Excel tidak sesuai.');
      showToast('error', 'Gagal Import Excel', msg);
    } finally {
      setImportingMigrasi(false);
      e.target.value = '';
    }
  };

  // ==========================================================================
  // RENDER KOMPONEN KUITANSI 21x10 CM (DIPAKAI DI PREVIEW LAYAR & PRINT TUNGGAL)
  // ==========================================================================
  const renderKuitansi21x10Card = (kwt: KuitansiGroup, isForPrint: boolean) => {
    const items = kwt.items;
    const isTwoCol = items.length > 4;
    const mid = Math.ceil(items.length / 2);
    const leftItems = isTwoCol ? items.slice(0, mid) : items;
    const rightItems = isTwoCol ? items.slice(mid) : [];
    const watermarkSrc = pengaturan.logo_watermark_url || pengaturan.logo_url;

    return (
      <div
        className={`relative bg-white text-slate-900 border-2 border-emerald-800 select-none overflow-hidden flex flex-col justify-between ${
          isForPrint ? 'w-[210mm] h-[98mm] max-h-[98mm] p-[4mm]' : 'w-[210mm] min-w-[210mm] h-[100mm] p-4 shadow-md rounded-sm'
        }`}
      >
        {/* WATERMARK LOGO PONDOK DI TENGAH (TANPA TEKS SIAP AN-NUR 1) */}
        {watermarkSrc && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center z-0">
            <img
              src={watermarkSrc}
              alt="Watermark Pondok"
              className="w-48 h-48 object-contain opacity-[0.08] mix-blend-multiply"
            />
          </div>
        )}

        {/* BAGIAN ATAS: KOP LEMBAGA & NOMOR KUITANSI */}
        <div className="relative z-10 flex items-start justify-between border-b-2 border-emerald-800 pb-1.5">
          <div className="flex items-center gap-2.5">
            {pengaturan.logo_url && (
              <img
                src={pengaturan.logo_url}
                alt="Logo Pondok"
                className="w-11 h-11 object-contain shrink-0"
              />
            )}
            <div>
              <h2 className="text-[13px] font-extrabold tracking-wide text-emerald-950 uppercase leading-tight">
                {pengaturan.nama_pesantren}
              </h2>
              <p className="text-[10px] text-slate-600 leading-snug">{pengaturan.alamat_lengkap}</p>
              <p className="text-[9.5px] text-slate-600">
                Telp/WA: {pengaturan.no_telepon} &bull; Tahun Ajaran {kwt.tahun_ajaran}
              </p>
            </div>
          </div>

          <div className="text-right shrink-0">
            <div className="bg-emerald-800 text-white text-[10.5px] font-bold px-3 py-0.5 tracking-wider uppercase">
              KUITANSI PEMBAYARAN
            </div>
            <div className="font-mono text-[11.5px] font-extrabold text-slate-900 mt-0.5">
              {kwt.no_kuitansi}
            </div>
          </div>
        </div>

        {/* IDENTITAS SANTRI */}
        <div className="relative z-10 grid grid-cols-12 gap-x-2 text-[10.5px] py-1">
          <div className="col-span-7 space-y-0.5">
            <div className="flex">
              <span className="w-32 text-slate-600 shrink-0">Telah Terima Dari</span>
              <span className="font-bold text-slate-900 truncate">
                : {kwt.santri_wali} (Wali dari {kwt.santri_nama})
              </span>
            </div>
            <div className="flex">
              <span className="w-32 text-slate-600 shrink-0">NIS / Khos Kamar</span>
              <span className="font-bold text-slate-900">
                : {kwt.santri_nis} / Kamar {kwt.santri_kamar}
              </span>
            </div>
          </div>
          <div className="col-span-5 text-right space-y-0.5">
            <div>
              <span className="text-slate-600">Tanggal: </span>
              <span className="font-bold text-slate-900">{formatTanggalIndo(kwt.tgl_bayar)}</span>
            </div>
            <div>
              <span className="text-slate-600">Metode: </span>
              <span className="font-bold uppercase text-emerald-900">
                {kwt.metode_pembayaran === 'transfer' ? 'Transfer Bank' : 'Tunai (Cash)'}
              </span>
            </div>
          </div>
        </div>

        {/* KOTAK RINCIAN PEMBAYARAN: RATA ATAS (ITEMS-START) & URUT KE BAWAH (COLUMN-FIRST) */}
        <div className="relative z-10 flex-1 bg-slate-50/80 border border-slate-300 rounded px-2.5 py-1.5 flex flex-col justify-start items-stretch overflow-hidden">
          <div className="text-[9.5px] font-extrabold text-emerald-900 tracking-wider uppercase mb-1">
            RINCIAN PEMBAYARAN:
          </div>

          <div className={`grid ${isTwoCol ? 'grid-cols-2 gap-x-5' : 'grid-cols-1'} items-start`}>
            {/* Kolom Kiri (1 .. mid) */}
            <div className="space-y-0.5">
              {leftItems.map((item, idx) => (
                <div
                  key={`${item.item_kode}-${item.periode_bulan}-${idx}`}
                  className="flex items-center justify-between text-[10.5px] leading-tight border-b border-dashed border-slate-200 pb-0.5"
                >
                  <span className="text-slate-800 truncate pr-2">
                    <strong className="text-slate-900 mr-1">{idx + 1}.</strong>
                    {item.label_item}
                  </span>
                  <span className="font-bold text-slate-900 shrink-0">
                    {formatRupiah(item.nominal)}
                  </span>
                </div>
              ))}
            </div>

            {/* Kolom Kanan (mid+1 .. total) */}
            {isTwoCol && (
              <div className="space-y-0.5">
                {rightItems.map((item, idx) => (
                  <div
                    key={`${item.item_kode}-${item.periode_bulan}-r-${idx}`}
                    className="flex items-center justify-between text-[10.5px] leading-tight border-b border-dashed border-slate-200 pb-0.5"
                  >
                    <span className="text-slate-800 truncate pr-2">
                      <strong className="text-slate-900 mr-1">{mid + idx + 1}.</strong>
                      {item.label_item}
                    </span>
                    <span className="font-bold text-slate-900 shrink-0">
                      {formatRupiah(item.nominal)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* FOOTER KUITANSI: TOTAL BAYAR, TERBILANG, STEMPEL & TTD BENDAHARA */}
        <div className="relative z-10 flex items-end justify-between pt-1.5">
          <div className="max-w-[62%]">
            <div className="inline-block bg-emerald-50 border border-emerald-700 px-3 py-1 rounded">
              <span className="text-[10px] font-bold text-emerald-900 uppercase mr-2">Total Bayar:</span>
              <span className="text-[13px] font-extrabold text-emerald-950">
                {formatRupiah(kwt.total_nominal)}
              </span>
            </div>
            <p className="text-[9.5px] italic text-slate-600 mt-0.5 truncate">
              Terbilang: # {terbilang(kwt.total_nominal)} #
            </p>
          </div>

          <div className="relative text-center min-w-[175px]">
            <p className="text-[9.5px] text-slate-600 leading-tight">
              Bululawang, {formatTanggalIndo(kwt.tgl_bayar)}
            </p>
            <p className="text-[9.5px] font-semibold text-slate-700 leading-tight">
              Bendahara / Penerima,
            </p>

            <div className="relative h-9 flex items-center justify-center">
              {pengaturan.stempel_url && (
                <img
                  src={pengaturan.stempel_url}
                  alt="Stempel"
                  className="absolute -left-2 -top-2 w-14 h-14 object-contain opacity-85 pointer-events-none"
                />
              )}
              {pengaturan.ttd_bendahara_url && (
                <img
                  src={pengaturan.ttd_bendahara_url}
                  alt="TTD Bendahara"
                  className="h-9 object-contain relative z-10"
                />
              )}
            </div>

            <p className="text-[10.5px] font-bold text-slate-900 underline decoration-slate-400">
              {kwt.petugas_nama || pengaturan.nama_bendahara}
            </p>
          </div>
        </div>
      </div>
    );
  };

  // ==========================================================================
  // RENDER HALAMAN UTAMA
  // ==========================================================================
  return (
    <>
      {/* ====================================================================
          AREA CETAK KHUSUS (HANYA TAMPIL SAAT @MEDIA PRINT AKTIF)
      ==================================================================== */}
      {printMode === 'kuitansi' && activeKuitansi && (
        <div id="print-kuitansi-sheet" className="hidden print:block m-0 p-0 bg-white">
          {renderKuitansi21x10Card(activeKuitansi, true)}
        </div>
      )}

      {printMode === 'surat_tagihan' && suratTagihanTargets.length > 0 && (
        <div id="print-surat-tagihan" className="hidden print:block bg-white text-slate-900">
          {suratTagihanTargets.map((target, idx) => (
            <div
              key={`${target.santri.id}-${idx}`}
              className="surat-tagihan-page bg-white text-slate-900 flex flex-col justify-between"
            >
              <div>
                {/* KOP SURAT RESMI */}
                <div className="flex items-center gap-4 border-b-4 border-double border-slate-900 pb-3 mb-4">
                  {pengaturan.logo_url && (
                    <img
                      src={pengaturan.logo_url}
                      alt="Logo Pondok"
                      className="w-16 h-16 object-contain shrink-0"
                    />
                  )}
                  <div className="flex-1 text-center">
                    <p className="text-xs font-bold tracking-widest uppercase text-emerald-900">
                      YAYASAN PENDIDIKAN PONDOK PESANTREN AN-NUR 1
                    </p>
                    <h1 className="text-xl font-extrabold uppercase tracking-wide text-slate-900">
                      {pengaturan.nama_pesantren}
                    </h1>
                    <p className="text-xs text-slate-700">{pengaturan.alamat_lengkap}</p>
                    <p className="text-xs text-slate-700">
                      Telp/WA: {pengaturan.no_telepon} {pengaturan.email_resmi ? `| Email: ${pengaturan.email_resmi}` : ''}
                    </p>
                  </div>
                </div>

                {/* NOMOR & TUJUAN SURAT */}
                <div className="flex justify-between items-start text-xs mb-4">
                  <div className="space-y-0.5">
                    <div>
                      <span className="inline-block w-20">Nomor</span>: {String(idx + 1).padStart(3, '0')}/KEU-AN1/{todayStr.slice(0, 4)}
                    </div>
                    <div>
                      <span className="inline-block w-20">Lampiran</span>: 1 Lembar Rincian
                    </div>
                    <div>
                      <span className="inline-block w-20">Perihal</span>:{' '}
                      <strong className="underline">Pemberitahuan Tunggakan Administrasi Santri</strong>
                    </div>
                  </div>
                  <div className="text-right">
                    <p>Bululawang, {formatTanggalIndo(todayStr)}</p>
                  </div>
                </div>

                <div className="text-xs mb-4 leading-relaxed">
                  <p>Kepada Yth.</p>
                  <p className="font-bold">Bapak/Ibu {getWaliDisplayName(target.santri)}</p>
                  <p>
                    Wali Santri dari <strong>{target.santri.nama_lengkap}</strong> (NIS: {target.santri.nis} / Kamar {target.santri.kamar})
                  </p>
                  <p>Di Tempat</p>
                </div>

                <div className="text-xs leading-relaxed space-y-2 mb-4">
                  <p className="italic font-semibold">Assalamu&apos;alaikum Warahmatullahi Wabarakatuh,</p>
                  <p className="text-justify">
                    Puji syukur kehadirat Allah SWT. Shalawat serta salam semoga senantiasa tercurah kepada junjungan kita Nabi Muhammad SAW. Dengan hormat, berdasarkan catatan pembukuan Bendahara {pengaturan.nama_pesantren} Tahun Ajaran {tahunAjaran}, kami sampaikan bahwa administrasi keuangan ananda <strong>{target.santri.nama_lengkap}</strong> masih terdapat tanggungan sebagai berikut:
                  </p>
                </div>

                {/* TABEL RINCIAN TUNGGAKAN */}
                <table className="w-full border-collapse border border-slate-800 text-xs mb-4">
                  <thead>
                    <tr className="bg-slate-100">
                      <th className="border border-slate-800 px-2.5 py-1.5 text-center w-10">No</th>
                      <th className="border border-slate-800 px-2.5 py-1.5 text-left">Keterangan Tagihan / Bulan</th>
                      <th className="border border-slate-800 px-2.5 py-1.5 text-right w-36">Nominal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {target.ktlSisa > 0 && (
                      <tr>
                        <td className="border border-slate-800 px-2.5 py-1 text-center">1</td>
                        <td className="border border-slate-800 px-2.5 py-1">
                          KTL ({target.ktlCatatan})
                        </td>
                        <td className="border border-slate-800 px-2.5 py-1 text-right font-semibold">
                          {formatRupiah(target.ktlSisa)}
                        </td>
                      </tr>
                    )}
                    {target.tunggakanBulan.map((b, bIdx) => (
                      <tr key={b.periode}>
                        <td className="border border-slate-800 px-2.5 py-1 text-center">
                          {(target.ktlSisa > 0 ? 1 : 0) + bIdx + 1}
                        </td>
                        <td className="border border-slate-800 px-2.5 py-1">
                          Syahriyah Bulan {b.label}
                        </td>
                        <td className="border border-slate-800 px-2.5 py-1 text-right font-semibold">
                          {formatRupiah(b.nominal)}
                        </td>
                      </tr>
                    ))}
                    {target.tunggakanTahunan.map((t, tIdx) => (
                      <tr key={t.kode}>
                        <td className="border border-slate-800 px-2.5 py-1 text-center">
                          {(target.ktlSisa > 0 ? 1 : 0) + target.tunggakanBulan.length + tIdx + 1}
                        </td>
                        <td className="border border-slate-800 px-2.5 py-1">{t.label}</td>
                        <td className="border border-slate-800 px-2.5 py-1 text-right font-semibold">
                          {formatRupiah(t.nominal)}
                        </td>
                      </tr>
                    ))}
                    <tr className="bg-slate-100 font-bold">
                      <td colSpan={2} className="border border-slate-800 px-2.5 py-1.5 text-right uppercase">
                        Total Tanggungan
                      </td>
                      <td className="border border-slate-800 px-2.5 py-1.5 text-right text-sm">
                        {formatRupiah(target.totalTagihan)}
                      </td>
                    </tr>
                  </tbody>
                </table>

                <p className="text-[11px] italic mb-3">
                  Terbilang: <strong># {terbilang(target.totalTagihan)} #</strong>
                </p>

                <div className="text-xs leading-relaxed space-y-2 mb-6">
                  <p className="text-justify">
                    Sehubungan dengan hal tersebut, kami mohon kepada Bapak/Ibu Wali Santri untuk segera menyelesaikan tanggungan administrasi tersebut melalui Kantor Bendahara Pondok atau menghubungi nomor layanan keuangan ({pengaturan.no_telepon}). Apabila Bapak/Ibu telah melakukan pembayaran namun belum tercatat pada surat ini, mohon berkenan menunjukkan bukti kuitansi pembayaran kepada petugas kami.
                  </p>
                  <p>Demikian surat pemberitahuan ini kami sampaikan. Atas perhatian dan kerjasamanya kami ucapkan terima kasih.</p>
                  <p className="italic font-semibold">Wassalamu&apos;alaikum Warahmatullahi Wabarakatuh.</p>
                </div>
              </div>

              {/* TANDA TANGAN KEPALA PONDOK & BENDAHARA */}
              <div className="grid grid-cols-2 gap-8 text-xs text-center pt-2">
                <div>
                  <p>Mengetahui,</p>
                  <p className="font-bold">Kepala Pondok</p>
                  <div className="h-16 flex items-center justify-center my-1">
                    {pengaturan.ttd_kepala_pondok_url && (
                      <img
                        src={pengaturan.ttd_kepala_pondok_url}
                        alt="TTD Kepala Pondok"
                        className="h-16 object-contain"
                      />
                    )}
                  </div>
                  <p className="font-bold underline">{pengaturan.nama_kepala_pondok}</p>
                </div>

                <div className="relative">
                  <p>Bululawang, {formatTanggalIndo(todayStr)}</p>
                  <p className="font-bold">Bendahara Pondok</p>
                  <div className="relative h-16 flex items-center justify-center my-1">
                    {pengaturan.stempel_url && (
                      <img
                        src={pengaturan.stempel_url}
                        alt="Stempel Pondok"
                        className="absolute left-12 -top-2 w-20 h-20 object-contain opacity-85"
                      />
                    )}
                    {pengaturan.ttd_bendahara_url && (
                      <img
                        src={pengaturan.ttd_bendahara_url}
                        alt="TTD Bendahara"
                        className="h-16 object-contain relative z-10"
                      />
                    )}
                  </div>
                  <p className="font-bold underline">{pengaturan.nama_bendahara}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {printMode === 'laporan_kas' && (
        <div id="print-laporan-kas" className="hidden print:block bg-white text-slate-900 text-xs">
          <div className="border-b-2 border-slate-900 pb-2 mb-3 flex items-center justify-between">
            <div>
              <h1 className="text-base font-extrabold uppercase">{pengaturan.nama_pesantren}</h1>
              <p className="text-[11px] text-slate-600">
                Laporan Buku Kas Keuangan &bull; Periode: {kasBulanFilter === 'SEMUA' ? 'Semua Bulan' : kasBulanFilter}
              </p>
            </div>
            <div className="text-right text-[11px]">
              <p>Dicetak: {formatTanggalIndo(todayStr)}</p>
              <p>Petugas: {petugasNama}</p>
            </div>
          </div>

          <table className="w-full border-collapse border border-slate-400 text-[10px]">
            <thead>
              <tr className="bg-slate-100">
                <th className="border border-slate-400 px-1.5 py-1">No</th>
                <th className="border border-slate-400 px-1.5 py-1">Tanggal</th>
                <th className="border border-slate-400 px-1.5 py-1">Dompet</th>
                <th className="border border-slate-400 px-1.5 py-1">Kategori / Uraian</th>
                <th className="border border-slate-400 px-1.5 py-1">Metode</th>
                <th className="border border-slate-400 px-1.5 py-1 text-right">Masuk</th>
                <th className="border border-slate-400 px-1.5 py-1 text-right">Keluar</th>
              </tr>
            </thead>
            <tbody>
              {filteredKasTransaksi.map((tx, idx) => (
                <tr key={tx.id}>
                  <td className="border border-slate-400 px-1.5 py-1 text-center">{idx + 1}</td>
                  <td className="border border-slate-400 px-1.5 py-1 whitespace-nowrap">{tx.tgl_transaksi}</td>
                  <td className="border border-slate-400 px-1.5 py-1">{DOMPET_META[tx.dompet]?.shortLabel}</td>
                  <td className="border border-slate-400 px-1.5 py-1">
                    <strong>{tx.kategori}</strong> - {tx.keterangan}
                  </td>
                  <td className="border border-slate-400 px-1.5 py-1 uppercase">{tx.metode_pembayaran}</td>
                  <td className="border border-slate-400 px-1.5 py-1 text-right">
                    {tx.tipe === 'masuk' ? formatRupiah(tx.nominal) : '-'}
                  </td>
                  <td className="border border-slate-400 px-1.5 py-1 text-right">
                    {tx.tipe === 'keluar' ? formatRupiah(tx.nominal) : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ====================================================================
          ANTARMUKA LAYAR UTAMA (DISEMBUNYIKAN TOTAL SAAT PRINT)
      ==================================================================== */}
      <div className="print:hidden space-y-4">
        {/* TOAST NOTIFICATIONS */}
        <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none">
          {toasts.map((t) => (
            <div
              key={t.id}
              className={`pointer-events-auto rounded-xl border p-3.5 shadow-lg backdrop-blur-sm transition-all flex items-start gap-3 ${
                t.type === 'success'
                  ? 'bg-emerald-950/95 border-emerald-700 text-white'
                  : t.type === 'error'
                  ? 'bg-rose-950/95 border-rose-700 text-white'
                  : t.type === 'warning'
                  ? 'bg-amber-950/95 border-amber-700 text-white'
                  : 'bg-slate-900/95 border-slate-700 text-white'
              }`}
            >
              <div className="mt-0.5 shrink-0">
                {t.type === 'success' && <CheckCircle2 className="w-5 h-5 text-emerald-400" />}
                {t.type === 'error' && <AlertTriangle className="w-5 h-5 text-rose-400" />}
                {t.type === 'warning' && <ShieldAlert className="w-5 h-5 text-amber-400" />}
                {t.type === 'info' && <Info className="w-5 h-5 text-sky-400" />}
              </div>
              <div className="flex-1 text-xs">
                <p className="font-bold text-sm">{t.title}</p>
                <p className="text-slate-200 mt-0.5 leading-relaxed">{t.message}</p>
              </div>
              <button
                onClick={() => setToasts((prev) => prev.filter((item) => item.id !== t.id))}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>

        {/* CONFIRMATION MODAL */}
        {confirmDialog.open && (
          <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-md w-full p-5 space-y-4">
              <div className="flex items-start gap-3">
                <div
                  className={`p-2.5 rounded-xl shrink-0 ${
                    confirmDialog.danger ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'
                  }`}
                >
                  <AlertTriangle className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-slate-900">{confirmDialog.title}</h3>
                  <p className="text-xs text-slate-600 mt-1 leading-relaxed">{confirmDialog.message}</p>
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  onClick={() => setConfirmDialog((prev) => ({ ...prev, open: false }))}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Batal
                </button>
                <button
                  onClick={async () => {
                    setConfirmDialog((prev) => ({ ...prev, open: false }));
                    await confirmDialog.onConfirm();
                  }}
                  className={`px-4 py-2 text-xs font-bold text-white rounded-xl shadow-xs ${
                    confirmDialog.danger
                      ? 'bg-rose-600 hover:bg-rose-700'
                      : 'bg-emerald-700 hover:bg-emerald-800'
                  }`}
                >
                  {confirmDialog.confirmText}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* BANNER MODE TRANSPARANSI & PRIVASI BISYAROH */}
        <TransparencyBanner
          moduleLabel="Keuangan Pondok"
          isReadOnly={!canEditKeuangan}
          extraNote={
            !canViewBisyaroh
              ? 'Data Bisyaroh Pengurus & rincian pencairannya disembunyikan (khusus Pimpinan Inti & Bendahara).'
              : undefined
          }
        />

        {/* HEADER RINGKAS & SALDO 4 DOMPET + TUNAI VS TRANSFER BULAN INI */}
        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-lg font-extrabold text-slate-900 flex items-center gap-2">
                <Wallet className="w-5 h-5 text-emerald-700" />
                Keuangan &amp; Pembayaran Santri
              </h1>
              <p className="text-xs text-slate-500">
                Pembukuan 4 Pos Kas Otomatis &bull; Tahun Ajaran <strong>{tahunAjaran}</strong> &bull; Jatuh Tempo Tgl <strong>{pengaturan.jatuh_tempo_tanggal}</strong>
              </p>
            </div>

            <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2 text-xs">
              <div className="px-2.5 sm:px-3 py-1.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 flex items-center justify-between sm:justify-start gap-1.5 min-w-0">
                <span className="flex items-center gap-1 truncate">
                  <Banknote className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                  <span className="truncate">Tunai Bln Ini:</span>
                </span>
                <strong className="font-mono tabular-nums shrink-0">{formatRupiah(walletSummary.tunaiMasukBulanIni)}</strong>
              </div>
              <div className="px-2.5 sm:px-3 py-1.5 rounded-xl bg-sky-50 border border-sky-200 text-sky-900 flex items-center justify-between sm:justify-start gap-1.5 min-w-0">
                <span className="flex items-center gap-1 truncate">
                  <CreditCard className="w-3.5 h-3.5 text-sky-700 shrink-0" />
                  <span className="truncate">Transfer Bln Ini:</span>
                </span>
                <strong className="font-mono tabular-nums shrink-0">{formatRupiah(walletSummary.transferMasukBulanIni)}</strong>
              </div>
              <div className="col-span-2 sm:col-span-1 flex items-center gap-2">
                <div className="flex-1 px-3 py-1.5 rounded-xl bg-slate-900 text-white flex items-center justify-between sm:justify-start gap-1.5 min-w-0">
                  <span className="truncate">Total 4 Dompet Tunai:</span>
                  <strong className="text-emerald-300 font-mono tabular-nums shrink-0">{formatRupiah(walletSummary.grandTotal)}</strong>
                </div>
                <button
                  onClick={fetchAllData}
                  title="Muat Ulang Data"
                  className="p-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-600 shrink-0"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                </button>
              </div>
            </div>
          </div>

          {/* 4 KARTU DOMPET TUNAI REAL-TIME */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
            {/* 1. Dompet Pendaftaran (Biru) */}
            <div className="rounded-xl border border-blue-700 bg-gradient-to-br from-blue-600 to-blue-800 p-2.5 sm:p-3.5 text-white shadow-xs">
              <div className="flex items-center justify-between text-blue-100 gap-1">
                <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider truncate">1. Pendaftaran (Tunai)</span>
                <Building2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-blue-200 shrink-0" />
              </div>
              <p className="text-sm sm:text-base font-extrabold text-white mt-1 tabular-nums font-mono">
                {formatRupiah(walletSummary.totals.pendaftaran)}
              </p>
              <p className="hidden sm:block text-[10.5px] text-blue-100/90 mt-0.5 truncate">
                PSB Tunai &amp; Infaq Madin
              </p>
            </div>

            {/* 2. Dompet Syahriyah & Iuran Tahunan (Hijau Emerald) */}
            <div className="rounded-xl border border-emerald-700 bg-gradient-to-br from-emerald-600 to-emerald-800 p-2.5 sm:p-3.5 text-white shadow-xs">
              <div className="flex items-center justify-between text-emerald-100 gap-1">
                <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider truncate">2. Syahriyah (Tunai)</span>
                <Wallet className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-200 shrink-0" />
              </div>
              <p className="text-sm sm:text-base font-extrabold text-white mt-1 tabular-nums font-mono">
                {formatRupiah(walletSummary.totals.operasional)}
              </p>
              <p className="hidden sm:block text-[10.5px] text-emerald-100/90 mt-0.5 truncate">
                Bulanan, Kalender, Haul, Kesehatan, Al-Adzkar, Almamater, Kitab
              </p>
            </div>

            {/* 3. Dompet Kas Lain-lain (Kuning Amber) */}
            <div className="rounded-xl border border-amber-600 bg-gradient-to-br from-amber-500 to-amber-700 p-2.5 sm:p-3.5 text-white shadow-xs">
              <div className="flex items-center justify-between text-amber-50 gap-1">
                <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider truncate">3. Kas Umum (Tunai)</span>
                <Landmark className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-100 shrink-0" />
              </div>
              <p className="text-sm sm:text-base font-extrabold text-white mt-1 tabular-nums font-mono">
                {formatRupiah(walletSummary.totals.kas_pondok)}
              </p>
              <p className="hidden sm:block text-[10.5px] text-amber-50/90 mt-0.5 truncate">
                Kotak Amal, Setoran Kantin &amp; Donasi Tunai
              </p>
            </div>

            {/* 4. Dompet MDA (Ungu) */}
            <div className="rounded-xl border border-purple-700 bg-gradient-to-br from-purple-600 to-purple-800 p-2.5 sm:p-3.5 text-white shadow-xs">
              <div className="flex items-center justify-between text-purple-100 gap-1">
                <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider truncate">4. Dompet MDA (Tunai)</span>
                <GraduationCap className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-purple-200 shrink-0" />
              </div>
              <p className="text-sm sm:text-base font-extrabold text-white mt-1 tabular-nums font-mono">
                {formatRupiah(walletSummary.totals.mda)}
              </p>
              <p className="hidden sm:block text-[10.5px] text-purple-100/90 mt-0.5 truncate">
                Ujian MDA Sm 1 &amp; 2, Raport Madin
              </p>
            </div>
          </div>

          {/* KARTU LAPORAN TERPISAH: PEMASUKAN TRANSFER (REKENING BANK, TERPISAH DARI KAS TUNAI) */}
          <div className="rounded-xl border border-sky-200 dark:border-white/20 bg-sky-50/55 dark:!bg-slate-800/90 overflow-hidden text-xs">
            <div className="px-3.5 py-3 flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div className="flex items-start sm:items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-lg bg-sky-700 text-white flex items-center justify-center shrink-0">
                  <CreditCard className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <h2 className="text-xs font-extrabold text-slate-900 dark:text-white uppercase tracking-wide">
                    Pemasukan Transfer
                  </h2>
                  <p className="text-[11px] text-sky-900/80 dark:text-sky-200 mt-0.5">
                    Rekening Transfer Bank &middot; Laporan khusus (tidak memengaruhi saldo kas tunai 4 dompet)
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 sm:gap-5 border-t md:border-t-0 md:border-l border-sky-200/80 dark:border-white/15 pt-2.5 md:pt-0 md:pl-5 shrink-0">
                <div className="flex sm:block items-center justify-between gap-2">
                  <span className="text-[11px] sm:text-[10px] font-semibold text-slate-500 dark:text-slate-300">
                    Masuk Bln Ini
                  </span>
                  <span className="text-xs sm:text-sm font-bold text-sky-900 dark:text-sky-300 font-mono tabular-nums sm:block">
                    {formatRupiah(walletSummary.syahriyahTransfer.bulanIniMasuk)}
                  </span>
                </div>
                <div className="flex sm:block items-center justify-between gap-2">
                  <span className="text-[11px] sm:text-[10px] font-semibold text-slate-500 dark:text-slate-300">
                    Keluar Rekening
                  </span>
                  <span className="text-xs sm:text-sm font-bold text-slate-700 dark:text-slate-100 font-mono tabular-nums sm:block">
                    {formatRupiah(walletSummary.syahriyahTransfer.totalKeluarAllTime)}
                  </span>
                </div>
                <div className="flex sm:block items-center justify-between gap-2">
                  <span className="text-[11px] sm:text-[10px] font-semibold text-slate-500 dark:text-slate-300">
                    Netto Rekening Transfer
                  </span>
                  <span className="text-sm sm:text-base font-extrabold text-sky-950 dark:text-white font-mono tabular-nums sm:block">
                    {formatRupiah(walletSummary.syahriyahTransfer.netAllTime)}
                  </span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 border-t border-sky-200/80 dark:border-white/15 bg-white/75 dark:!bg-slate-900/90 divide-y lg:divide-y-0 divide-x divide-sky-100 dark:divide-white/15">
              <div className="px-3.5 py-2 flex items-center justify-between gap-2">
                <span className="text-[11px] font-medium text-slate-600 dark:text-slate-300 truncate">Syahriyah &amp; Tahunan</span>
                <strong className="text-[11px] font-bold text-slate-900 dark:text-white font-mono tabular-nums whitespace-nowrap">
                  {formatRupiah(walletSummary.syahriyahTransfer.byDompetMasuk.operasional)}
                </strong>
              </div>
              <div className="px-3.5 py-2 flex items-center justify-between gap-2">
                <span className="text-[11px] font-medium text-slate-600 dark:text-slate-300 truncate">Pendaftaran</span>
                <strong className="text-[11px] font-bold text-slate-900 dark:text-white font-mono tabular-nums whitespace-nowrap">
                  {formatRupiah(walletSummary.syahriyahTransfer.byDompetMasuk.pendaftaran)}
                </strong>
              </div>
              <div className="px-3.5 py-2 flex items-center justify-between gap-2">
                <span className="text-[11px] font-medium text-slate-600 dark:text-slate-300 truncate">Dompet MDA</span>
                <strong className="text-[11px] font-bold text-slate-900 dark:text-white font-mono tabular-nums whitespace-nowrap">
                  {formatRupiah(walletSummary.syahriyahTransfer.byDompetMasuk.mda)}
                </strong>
              </div>
              <div className="px-3.5 py-2 flex items-center justify-between gap-2">
                <span className="text-[11px] font-medium text-slate-600 dark:text-slate-300 truncate">Kas Umum</span>
                <strong className="text-[11px] font-bold text-slate-900 dark:text-white font-mono tabular-nums whitespace-nowrap">
                  {formatRupiah(walletSummary.syahriyahTransfer.byDompetMasuk.kas_pondok)}
                </strong>
              </div>
            </div>
          </div>
        </div>

        {/* ==================================================================
            WORKSPACE FIT-TO-SCREEN (BILAH 5 TAB TERKUNCI UTUH DI TEPI ATAS)
        ================================================================== */}
        <div
          ref={workspaceRef}
          className="flex flex-col min-h-[540px] lg:h-[calc(100vh-1.5rem)] bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden"
        >
          {/* BILAH 5 TAB SUB-MENU (SELALU TERLIHAT UTUH SAAT DI-SCROLL MENTOK) */}
          <div className="shrink-0 bg-slate-50 border-b border-slate-200 px-2.5 sm:px-3 py-2 flex items-center gap-1.5 overflow-x-auto">
            <button
              onClick={() => setActiveTab('loket')}
              className={`px-2.5 sm:px-3.5 py-2 rounded-xl text-[11px] sm:text-xs font-bold flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-all ${
                activeTab === 'loket'
                  ? 'bg-emerald-800 text-white shadow-xs'
                  : 'text-slate-600 hover:bg-white hover:text-slate-900'
              }`}
            >
              <CreditCard className="w-3.5 h-3.5" />
              1. Loket Pembayaran
            </button>

            <button
              onClick={() => setActiveTab('kuitansi')}
              className={`px-2.5 sm:px-3.5 py-2 rounded-xl text-[11px] sm:text-xs font-bold flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-all ${
                activeTab === 'kuitansi'
                  ? 'bg-emerald-800 text-white shadow-xs'
                  : 'text-slate-600 hover:bg-white hover:text-slate-900'
              }`}
            >
              <ReceiptText className="w-3.5 h-3.5" />
              2. Kuitansi 21×10 cm
              <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] bg-black/15">
                {kuitansiGroups.length}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('penagihan')}
              className={`px-2.5 sm:px-3.5 py-2 rounded-xl text-[11px] sm:text-xs font-bold flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-all ${
                activeTab === 'penagihan'
                  ? 'bg-emerald-800 text-white shadow-xs'
                  : 'text-slate-600 hover:bg-white hover:text-slate-900'
              }`}
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              3. Penagihan Tunggakan
              {tunggakanData.length > 0 && (
                <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] bg-amber-500 text-white">
                  {tunggakanData.length}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('bukukas')}
              className={`px-2.5 sm:px-3.5 py-2 rounded-xl text-[11px] sm:text-xs font-bold flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-all ${
                activeTab === 'bukukas'
                  ? 'bg-emerald-800 text-white shadow-xs'
                  : 'text-slate-600 hover:bg-white hover:text-slate-900'
              }`}
            >
              <BookOpen className="w-3.5 h-3.5" />
              {canViewBisyaroh ? '4. Buku Kas & Bisyaroh' : '4. Buku Kas Umum'}
            </button>

            <button
              onClick={() => setActiveTab('migrasi')}
              className={`px-2.5 sm:px-3.5 py-2 rounded-xl text-[11px] sm:text-xs font-bold flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-all ${
                activeTab === 'migrasi'
                  ? 'bg-emerald-800 text-white shadow-xs'
                  : 'text-slate-600 hover:bg-white hover:text-slate-900'
              }`}
            >
              <DatabaseBackup className="w-3.5 h-3.5" />
              5. Migrasi &amp; KTL
            </button>
          </div>

          {/* ================================================================
              KONTEN TAB 1: LOKET PEMBAYARAN SANTRI (FIT-TO-SCREEN)
          ================================================================ */}
          {activeTab === 'loket' && (
            <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-12 lg:overflow-hidden">
              {/* PANEL KIRI: PENCARIAN & DAFTAR SANTRI (DESKTOP ONLY, MOBILE PAKAI PICKER MODAL) */}
              <div className="hidden lg:flex lg:col-span-4 xl:col-span-3 border-r border-slate-200 flex-col min-h-0 bg-slate-50/60">
                <div className="p-3 border-b border-slate-200 space-y-2 shrink-0 bg-white">
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={loketSearch}
                      onChange={(e) => setLoketSearch(e.target.value)}
                      placeholder="Cari nama santri / NIS..."
                      className="w-full pl-8 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-emerald-600"
                    />
                  </div>
                  <select
                    value={loketKamarFilter}
                    onChange={(e) => setLoketKamarFilter(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl font-semibold text-slate-700 focus:outline-none focus:border-emerald-600"
                  >
                    <option value="SEMUA">Semua Kamar ({santriList.filter((s) => s.status !== 'boyong' && s.status !== 'alumni' && s.status !== 'pindah_al_burhany').length} Santri)</option>
                    {allKamarOptions.map((km) => (
                      <option key={km} value={km}>
                        Kamar {km}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Daftar Kartu Santri (Scroll Internal) */}
                <div className="flex-1 min-h-0 overflow-y-auto p-2 space-y-1.5">
                  {filteredLoketSantri.length === 0 ? (
                    <div className="text-center py-10 text-xs text-slate-400">
                      Santri tidak ditemukan.
                    </div>
                  ) : (
                    filteredLoketSantri.map((s) => {
                      const isSelected = activeSantri?.id === s.id;
                      const vip = isSantriVip(s);
                      const ndalem = s.status === 'ndalem';
                      const hasKtl = Number(s.ktl_nominal || 0) > 0;
                      return (
                        <button
                          key={s.id}
                          onClick={() => setSelectedSantriId(s.id)}
                          className={`w-full text-left p-2.5 rounded-xl border transition-all ${
                            isSelected
                              ? 'bg-emerald-800 text-white border-emerald-800 shadow-xs'
                              : 'bg-white hover:bg-emerald-50/60 border-slate-200 text-slate-800'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-1">
                            <span className="font-bold text-xs truncate">{s.nama_lengkap}</span>
                            <span
                              className={`text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 ${
                                isSelected
                                  ? 'bg-white/20 text-white'
                                  : 'bg-slate-100 text-slate-700'
                              }`}
                            >
                              {s.kamar}
                            </span>
                          </div>
                          <div className="flex items-center justify-between mt-1 text-[10.5px]">
                            <span className={isSelected ? 'text-emerald-200' : 'text-slate-500'}>
                              NIS: {s.nis}
                            </span>
                            <div className="flex items-center gap-1">
                              {hasKtl && (
                                <span className="px-1.5 py-0.2 rounded bg-amber-500 text-white font-bold text-[9.5px]">
                                  KTL
                                </span>
                              )}
                              <span
                                className={`px-1.5 py-0.2 rounded font-bold text-[9.5px] ${
                                  isSelected
                                    ? 'bg-emerald-950 text-emerald-300'
                                    : ndalem
                                    ? 'bg-purple-100 text-purple-800'
                                    : vip
                                    ? 'bg-amber-100 text-amber-800'
                                    : 'bg-emerald-100 text-emerald-800'
                                }`}
                              >
                                {ndalem ? 'NDALEM' : vip ? 'VIP' : 'REGULER'}
                              </span>
                            </div>
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>

              {/* PANEL KANAN: MATRIKS PEMBAYARAN SANTRI & FOOTER EMERALD PEKAT */}
              <div className="lg:col-span-8 xl:col-span-9 flex flex-col min-h-0 bg-white">
                {!activeSantri ? (
                  <div className="flex-1 flex flex-col items-center justify-center gap-3 p-6 text-xs text-slate-400 text-center">
                    <span>Pilih santri untuk memulai transaksi pembayaran.</span>
                    <button
                      type="button"
                      onClick={() => setMobileSantriPickerOpen(true)}
                      className="lg:hidden px-4 py-2 rounded-xl bg-emerald-700 text-white font-bold text-xs inline-flex items-center gap-1.5"
                    >
                      <Users className="w-3.5 h-3.5" />
                      Pilih Santri
                    </button>
                  </div>
                ) : (
                  <>
                    {/* HEADER SANTRI TERPILIH (UTUH DI ATAS, TIDAK PERNAH TERPOTONG) */}
                    <div className="shrink-0 px-3 sm:px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                      <div className="min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                            <h2 className="text-sm font-extrabold text-slate-900 truncate">
                              {activeSantri.nama_lengkap}
                            </h2>
                            <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-900 whitespace-nowrap">
                              Kamar {activeSantri.kamar}
                            </span>
                            <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-slate-200 text-slate-800 whitespace-nowrap">
                              {activeSantri.status === 'ndalem'
                                ? 'Santri Ndalem'
                                : isSantriVip(activeSantri)
                                ? 'VIP'
                                : 'Reguler'}
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => setMobileSantriPickerOpen(true)}
                            className="lg:hidden px-2.5 py-1.5 rounded-lg bg-emerald-800 text-white text-[11px] font-bold inline-flex items-center gap-1 shrink-0 whitespace-nowrap cursor-pointer"
                          >
                            <Users className="w-3 h-3" />
                            Ganti Santri
                          </button>
                        </div>
                        <p className="text-[11px] text-slate-500 mt-1 truncate">
                          NIS: <strong>{activeSantri.nis}</strong> &bull; Wali: <strong>{getWaliDisplayName(activeSantri)}</strong>
                          {getActiveWaContact(activeSantri) && ` (${getActiveWaContact(activeSantri)?.number})`}
                        </p>
                      </div>

                      <div className="grid grid-cols-2 sm:flex items-center gap-2 text-xs shrink-0">
                        <div>
                          <label className="text-[10px] font-bold text-slate-500 block">Tahun Ajaran</label>
                          <select
                            value={tahunAjaran}
                            onChange={(e) => setTahunAjaran(e.target.value)}
                            className="w-full sm:w-auto px-2.5 py-1 bg-white border border-slate-300 rounded-lg font-bold text-slate-800 text-xs"
                          >
                            {(() => {
                              if (!todayStr && !tahunAjaran) return null;
                              const refYr = todayStr
                                ? Number(todayStr.slice(0, 4))
                                : Number(tahunAjaran.split('/')[0]);
                              const refMo = todayStr ? Number(todayStr.slice(5, 7)) : 7;
                              const activeStart = refMo >= 7 ? refYr : refYr - 1;
                              const maxStart = activeStart + 1;
                              const minStart = Math.min(2024, activeStart - 2);
                              const opts: string[] = [];
                              for (let y = minStart; y <= maxStart; y += 1) {
                                opts.push(`${y}/${y + 1}`);
                              }
                              if (tahunAjaran && !opts.includes(tahunAjaran)) opts.push(tahunAjaran);
                              return opts.map((ta) => (
                                <option key={ta} value={ta}>
                                  {ta}
                                </option>
                              ));
                            })()}
                          </select>
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-slate-500 block">Tanggal Transaksi</label>
                          <input
                            type="date"
                            value={tglBayarInput}
                            onChange={(e) => setTglBayarInput(e.target.value)}
                            className="w-full sm:w-auto px-2.5 py-1 bg-white border border-slate-300 rounded-lg font-semibold text-slate-800 text-xs"
                          />
                        </div>
                      </div>
                    </div>

                    {/* AREA MATRIKS PEMBAYARAN (BAGIAN A + KTL + BAGIAN B) */}
                    <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3 space-y-3">
                      {/* BANNER KTL (HANYA MUNCUL JIKA SANTRI PUNYA KEKURANGAN TAHUN LALU > 0) */}
                      {Number(activeSantri.ktl_nominal || 0) > 0 && (
                        <div
                          onClick={() => setBayarKtlChecked((prev) => !prev)}
                          className={`cursor-pointer rounded-xl border-2 p-2.5 transition-all flex flex-wrap items-center justify-between gap-2 ${
                            bayarKtlChecked
                              ? 'bg-amber-100/80 border-amber-500'
                              : 'bg-amber-50 border-amber-300 hover:border-amber-400'
                          }`}
                        >
                          <div className="flex items-center gap-2.5">
                            <input
                              type="checkbox"
                              checked={bayarKtlChecked}
                              onChange={() => {}}
                              className="w-4 h-4 accent-amber-600 rounded"
                            />
                            <div>
                              <span className="text-xs font-extrabold text-amber-950 flex items-center gap-1.5">
                                <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                                KTL (Kekurangan Tahun Lalu) — {activeSantri.ktl_catatan || 'Tunggakan Sebelumnya'}
                              </span>
                              <span className="text-[11px] text-amber-800">
                                Total Sisa KTL: <strong>{formatRupiah(activeSantri.ktl_nominal)}</strong> (Bisa dicicil sebagian)
                              </span>
                            </div>
                          </div>

                          {bayarKtlChecked && (
                            <div
                              onClick={(e) => e.stopPropagation()}
                              className="flex items-center gap-1.5"
                            >
                              <span className="text-[11px] font-bold text-amber-900">Nominal Bayar:</span>
                              <input
                                type="number"
                                min={1000}
                                max={Number(activeSantri.ktl_nominal)}
                                value={bayarKtlNominal}
                                onChange={(e) => setBayarKtlNominal(Number(e.target.value))}
                                className="w-32 px-2 py-1 text-xs font-bold bg-white border border-amber-400 rounded-lg text-right"
                              />
                            </div>
                          )}
                        </div>
                      )}

                      {/* LOKET BIAYA PENDAFTARAN SANTRI BARU (PSB VIP / REGULER + KUOTA FREE UANG PANGKAL) */}
                      <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 space-y-2.5 text-xs">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            {!activeSantriHasPsb ? (
                              <label className="inline-flex items-center gap-2 cursor-pointer font-extrabold text-slate-900">
                                <input
                                  type="checkbox"
                                  checked={bayarPsbChecked}
                                  onChange={(e) => setBayarPsbChecked(e.target.checked)}
                                  className="w-4 h-4 accent-emerald-700 rounded"
                                />
                                Biaya Pendaftaran Santri Baru (PSB)
                              </label>
                            ) : (
                              <span className="font-extrabold text-emerald-800 inline-flex items-center gap-1.5">
                                <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
                                Pendaftaran PSB Sudah Lunas (Masuk Dompet Pendaftaran)
                              </span>
                            )}
                          </div>
                          <span className="text-[11px] font-semibold text-slate-600 tabular-nums">
                            Kuota Free Uang Pangkal: {santriList.length}/{skemaPendaftaran.kuota_gratis_uang_pangkal} Pendaftar
                          </span>
                        </div>

                        {!activeSantriHasPsb && bayarPsbChecked && (
                          <div className="bg-white rounded-xl border border-slate-200 p-3 space-y-2.5">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="inline-flex rounded-lg bg-slate-100 p-1 gap-1">
                                <button
                                  type="button"
                                  onClick={() => setBayarPsbPaket('reguler')}
                                  className={`px-3 py-1 rounded-md text-[11px] font-bold cursor-pointer ${
                                    bayarPsbPaket === 'reguler'
                                      ? 'bg-emerald-700 text-white'
                                      : 'text-slate-700 hover:bg-white'
                                  }`}
                                >
                                  Reguler
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setBayarPsbPaket('vip')}
                                  className={`px-3 py-1 rounded-md text-[11px] font-bold cursor-pointer ${
                                    bayarPsbPaket === 'vip'
                                      ? 'bg-emerald-700 text-white'
                                      : 'text-slate-700 hover:bg-white'
                                  }`}
                                >
                                  Kamar VIP
                                </button>
                              </div>

                              <label className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-700 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={bayarPsbFreePangkal}
                                  onChange={(e) => setBayarPsbFreePangkal(e.target.checked)}
                                  className="w-3.5 h-3.5 accent-emerald-700 rounded"
                                />
                                Terapkan Free Uang Pangkal (Rp {skemaPendaftaran.uang_pangkal.toLocaleString('id-ID')})
                              </label>
                            </div>

                            <div className="divide-y divide-slate-100 text-[11px]">
                              {psbLoketPreview.items.map((item) => {
                                const skippedSyahriyah =
                                  item.targetDompet === 'operasional' && psbBulanPertamaSudahLunas;
                                return (
                                  <div key={item.label} className="py-1 flex items-center justify-between gap-2">
                                    <span className={skippedSyahriyah ? 'text-slate-400 line-through' : 'text-slate-700'}>
                                      {item.label}
                                      <span className="text-[10px] text-slate-400 ml-1">
                                        ({item.targetDompet === 'operasional' ? 'Dompet Operasional' : 'Dompet Pendaftaran'})
                                      </span>
                                    </span>
                                    <span className="font-mono font-bold tabular-nums shrink-0">
                                      {skippedSyahriyah ? (
                                        <span className="text-slate-400">Sudah dipilih/Lunas</span>
                                      ) : item.isFreePromo ? (
                                        <span className="text-emerald-700">GRATIS</span>
                                      ) : (
                                        formatRupiah(item.nominalBayar)
                                      )}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>

                            <div className="pt-1.5 border-t border-slate-100 flex flex-wrap justify-between gap-2 text-[11px] tabular-nums">
                              <span>
                                Dompet Pendaftaran: <strong>{formatRupiah(psbLoketPreview.nominalDompetPendaftaran)}</strong>
                              </span>
                              <span>
                                Dompet Operasional (Syahriyah Bln 1):{' '}
                                <strong>
                                  {psbBulanPertamaSudahLunas
                                    ? 'Rp 0 (Lunas/Terpilih)'
                                    : formatRupiah(psbLoketPreview.nominalSyahriyahBulanPertama)}
                                </strong>
                              </span>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* BAGIAN A: SYAHRIYAH BULANAN (12 BULAN JULI - JUNI) */}
                      <div>
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-0.5 mb-1.5">
                          <h3 className="text-xs font-extrabold text-slate-800 uppercase tracking-wide">
                            A. Syahriyah Bulanan (12 Bulan — TA {tahunAjaran})
                          </h3>
                          <span className="text-[10.5px] text-slate-500">
                            Masuk ke <strong>Dompet Syahriyah &amp; Iuran Tahunan</strong>
                          </span>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6 gap-2">
                          {periodeListTA.map((p) => {
                            const paidRec = activeSantriDetails.find(
                              (d) => d.item_kode === 'syahriyah' && d.periode_bulan === p.periode
                            );
                            const isChecked = selectedBulanPeriodes.includes(p.periode);
                            const tarifBulanIni = getSyahriyahNominalForPeriode(activeSantri, p.periode);

                            if (paidRec) {
                              return (
                                <div
                                  key={p.periode}
                                  className={`p-2 rounded-xl border text-left ${
                                    paidRec.is_migrasi
                                      ? 'bg-slate-100 border-slate-300 text-slate-600'
                                      : 'bg-emerald-50 border-emerald-300 text-emerald-900'
                                  }`}
                                >
                                  <div className="flex items-center justify-between">
                                    <span className="text-xs font-bold">{p.labelShort}</span>
                                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                                  </div>
                                  <p className="text-[10px] font-bold mt-1">
                                    {paidRec.is_migrasi ? 'LUNAS (MIGRASI)' : 'LUNAS'}
                                  </p>
                                  <p className="text-[9.5px] opacity-75 truncate">
                                    {paidRec.no_kuitansi || formatRupiah(paidRec.nominal)}
                                  </p>
                                </div>
                              );
                            }

                            return (
                              <button
                                key={p.periode}
                                type="button"
                                onClick={() => toggleBulanCheckbox(p.periode)}
                                className={`p-2 rounded-xl border text-left transition-all ${
                                  isChecked
                                    ? 'bg-emerald-700 text-white border-emerald-800 shadow-xs ring-2 ring-emerald-300'
                                    : 'bg-white hover:bg-emerald-50/60 border-slate-200 text-slate-800'
                                }`}
                              >
                                <div className="flex items-center justify-between">
                                  <span className="text-xs font-extrabold">{p.labelShort}</span>
                                  <input
                                    type="checkbox"
                                    checked={isChecked}
                                    onChange={() => {}}
                                    className="w-3.5 h-3.5 accent-emerald-600 rounded pointer-events-none"
                                  />
                                </div>
                                <p
                                  className={`text-[11px] font-bold mt-1 ${
                                    isChecked ? 'text-emerald-100' : 'text-emerald-800'
                                  }`}
                                >
                                  {formatRupiah(tarifBulanIni)}
                                </p>
                                <p
                                  className={`text-[9.5px] ${
                                    isChecked ? 'text-emerald-200' : 'text-slate-400'
                                  }`}
                                >
                                  Belum Bayar
                                </p>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* BAGIAN B: IURAN TAHUNAN & KATEGORI TAMBAHAN */}
                      <div>
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-0.5 mb-1.5">
                          <h3 className="text-xs font-extrabold text-slate-800 uppercase tracking-wide flex flex-wrap items-center gap-1.5">
                            <span>B. Iuran Tahunan &amp; Ujian Madin</span>
                            {activeSantri.status === 'ndalem' && (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-purple-100 text-purple-800 normal-case">
                                Santri Ndalem: Opsional / Tidak Wajib
                              </span>
                            )}
                          </h3>
                          <span className="text-[10.5px] text-slate-500">
                            Otomatis terpisah ke <strong>Syahriyah</strong>, <strong>Dompet MDA</strong> &amp; <strong>Pendaftaran</strong>
                          </span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                          {itemTahunanList.map((it) => {
                            const paidRec = activeSantriDetails.find(
                              (d) => d.item_kode === it.kode && d.periode_bulan === 'TAHUNAN'
                            );
                            const isChecked = selectedTahunanKodes.includes(it.kode);
                            const targetDompet = resolveCanonicalDompetForItem(it.kode, it.dompet_tujuan);
                            const isMda = targetDompet === 'mda';
                            const isPendaftaran = targetDompet === 'pendaftaran';

                            if (paidRec) {
                              return (
                                <div
                                  key={it.kode}
                                  className={`p-2.5 rounded-xl border flex items-center justify-between ${
                                    paidRec.is_migrasi
                                      ? 'bg-slate-100 border-slate-300 text-slate-600'
                                      : 'bg-emerald-50 border-emerald-300 text-emerald-900'
                                  }`}
                                >
                                  <div>
                                    <p className="text-xs font-bold">{it.nama_item}</p>
                                    <p className="text-[10px] font-semibold">
                                      {paidRec.is_migrasi ? 'LUNAS (MIGRASI)' : `LUNAS • ${paidRec.no_kuitansi || ''}`}
                                    </p>
                                  </div>
                                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                                </div>
                              );
                            }

                            return (
                              <button
                                key={it.kode}
                                type="button"
                                onClick={() => toggleTahunanCheckbox(it.kode)}
                                className={`p-2.5 rounded-xl border text-left transition-all flex items-center justify-between gap-2 ${
                                  isChecked
                                    ? 'bg-emerald-700 text-white border-emerald-800 shadow-xs ring-2 ring-emerald-300'
                                    : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-800'
                                }`}
                              >
                                <div className="min-w-0">
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-xs font-bold truncate">{it.nama_item}</span>
                                  </div>
                                  <div className="flex items-center gap-1.5 mt-0.5">
                                    <span
                                      className={`text-[11px] font-extrabold font-mono tabular-nums ${
                                        isChecked ? 'text-emerald-100' : 'text-emerald-800'
                                      }`}
                                    >
                                      {formatRupiah(it.nominal)}
                                    </span>
                                    <span
                                      className={`text-[9px] font-bold px-1.5 py-0.2 rounded ${
                                        isChecked
                                          ? 'bg-black/20 text-white'
                                          : isMda
                                          ? 'bg-indigo-100 text-indigo-800'
                                          : isPendaftaran
                                          ? 'bg-sky-100 text-sky-800'
                                          : 'bg-emerald-100 text-emerald-800'
                                      }`}
                                    >
                                      {isMda ? 'Dompet MDA' : isPendaftaran ? 'Pendaftaran' : 'Syahriyah'}
                                    </span>
                                  </div>
                                </div>

                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={() => {}}
                                  className="w-4 h-4 accent-emerald-600 rounded shrink-0 pointer-events-none"
                                />
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>

                    {/* STRIP RINGKAS UNGGAH BUKTI TRANSFER (MUNCUL SAAT TRANSFER BANK DIPILIH) */}
                    {metodeBayar === 'transfer' && (
                      <div className="shrink-0 px-3 sm:px-4 py-1.5 bg-sky-50 border-t border-sky-200 flex flex-wrap items-center justify-between gap-2 text-[11px]">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="font-bold text-sky-900 whitespace-nowrap">
                            Masuk: Pemasukan Transfer
                          </span>
                          <span className="hidden sm:inline text-sky-700 truncate">
                            (Hanya laporan bank, tidak masuk kas tunai dompet)
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          {loketBuktiPreview ? (
                            <>
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={loketBuktiPreview}
                                alt="Pratinjau Bukti Transfer"
                                className="w-7 h-7 rounded object-cover border border-sky-300 bg-white shrink-0"
                                referrerPolicy="no-referrer"
                              />
                              <span className="font-semibold text-sky-900 max-w-[120px] truncate">
                                {loketBuktiFile?.name || 'Bukti terpasang'}
                              </span>
                              <button
                                type="button"
                                onClick={() => {
                                  setLoketBuktiFile(null);
                                  setLoketBuktiPreview('');
                                }}
                                className="px-2 py-0.5 rounded bg-white border border-sky-200 text-rose-700 font-bold hover:bg-rose-50 cursor-pointer"
                              >
                                Hapus
                              </button>
                            </>
                          ) : (
                            <label className="px-2.5 py-1 rounded-lg bg-white hover:bg-sky-100 border border-sky-300 text-sky-900 font-bold inline-flex items-center gap-1 cursor-pointer whitespace-nowrap">
                              <ImagePlus className="w-3.5 h-3.5" />
                              + Bukti Transfer (Opsional)
                              <input
                                type="file"
                                accept="image/*"
                                onChange={(e) => {
                                  const f = e.target.files?.[0];
                                  if (!f) return;
                                  setLoketBuktiFile(f);
                                  const r = new FileReader();
                                  r.onload = () => setLoketBuktiPreview(String(r.result || ''));
                                  r.readAsDataURL(f);
                                }}
                                className="hidden"
                              />
                            </label>
                          )}
                        </div>
                      </div>
                    )}

                    {/* FOOTER BAR GRADASI HIJAU EMERALD PEKAT (RINGKAS DI HP, LENGKAP DI DESKTOP) */}
                    <div className="shrink-0 px-3 sm:px-4 py-2 lg:py-4 bg-gradient-to-r from-emerald-950 via-emerald-900 to-teal-900 text-white border-t border-emerald-700 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="hidden md:inline text-[11px] font-bold uppercase tracking-wider text-emerald-200">
                          Metode Bayar:
                        </span>
                        <div className="inline-flex rounded-xl bg-black/30 p-0.5 sm:p-1 border border-emerald-700/70">
                          <button
                            type="button"
                            onClick={() => setMetodeBayar('tunai')}
                            className={`px-2.5 sm:px-3 py-1 rounded-lg text-[11px] sm:text-xs font-bold transition-all ${
                              metodeBayar === 'tunai'
                                ? 'bg-emerald-500 text-emerald-950 shadow-xs'
                                : 'text-emerald-100 hover:text-white'
                            }`}
                          >
                            <span className="sm:hidden">Tunai</span>
                            <span className="hidden sm:inline">Tunai (Cash)</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setMetodeBayar('transfer')}
                            className={`px-2.5 sm:px-3 py-1 rounded-lg text-[11px] sm:text-xs font-bold transition-all ${
                              metodeBayar === 'transfer'
                                ? 'bg-sky-400 text-slate-950 shadow-xs'
                                : 'text-emerald-100 hover:text-white'
                            }`}
                          >
                            <span className="sm:hidden">Tf</span>
                            <span className="hidden sm:inline">Transfer Bank</span>
                          </button>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 sm:gap-4 min-w-0">
                        <div className="text-right min-w-0">
                          <span className="text-[9.5px] sm:text-[10px] font-bold uppercase tracking-wider text-emerald-300 block leading-tight">
                            Total ({loketCartSummary.items.length})
                          </span>
                          <span className="text-sm sm:text-lg font-extrabold text-white tracking-tight tabular-nums whitespace-nowrap font-mono">
                            {formatRupiah(loketCartSummary.total)}
                          </span>
                        </div>

                        {canEditKeuangan ? (
                          <button
                            type="button"
                            disabled={savingPayment || loketCartSummary.items.length === 0}
                            onClick={handleSimpanPembayaran}
                            className="px-3 sm:px-5 py-2 sm:py-2.5 rounded-xl bg-emerald-400 hover:bg-emerald-300 disabled:bg-slate-600 disabled:text-slate-300 text-emerald-950 font-extrabold text-[11px] sm:text-xs flex items-center gap-1.5 shadow-md transition-all cursor-pointer whitespace-nowrap shrink-0"
                          >
                            <ReceiptText className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
                            <span>
                              {savingPayment ? (
                                'Menyimpan...'
                              ) : (
                                <>
                                  <span className="sm:hidden">Bayar</span>
                                  <span className="hidden sm:inline">Simpan &amp; Terbitkan Kuitansi</span>
                                </>
                              )}
                            </span>
                          </button>
                        ) : (
                          <span className="px-3 py-2 rounded-xl bg-amber-500/20 border border-amber-300/40 text-amber-100 font-bold text-[11px] whitespace-nowrap shrink-0">
                            Hanya Lihat
                          </span>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {/* ================================================================
              KONTEN TAB 2: KUITANSI 21x10 CM (PREVIEW LANGSUNG + PRINT TUNGGAL + PNG + COPY TEKS + HAPUS)
          ================================================================ */}
          {activeTab === 'kuitansi' && (
            <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-12 lg:overflow-hidden">
              {/* PANEL KIRI: RIWAYAT KUITANSI TERBIT */}
              <div className="lg:col-span-4 border-b lg:border-b-0 lg:border-r border-slate-200 flex flex-col min-h-0 max-h-[280px] lg:max-h-none bg-slate-50/60">
                <div className="p-3 border-b border-slate-200 bg-white space-y-2 shrink-0">
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={kuitansiSearch}
                      onChange={(e) => setKuitansiSearch(e.target.value)}
                      placeholder="Cari No. Kuitansi / Nama / NIS..."
                      className="w-full pl-8 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-emerald-600"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <select
                      value={kuitansiBulanFilter}
                      onChange={(e) => setKuitansiBulanFilter(e.target.value)}
                      className="w-full px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl font-semibold text-slate-700"
                    >
                      <option value="SEMUA">Semua Tanggal Transaksi</option>
                      {Array.from(new Set(kuitansiGroups.map((k) => (k.tgl_bayar || '').slice(0, 7))))
                        .filter(Boolean)
                        .map((ym) => (
                          <option key={ym} value={ym}>
                            Bulan {ym}
                          </option>
                        ))}
                    </select>
                  </div>
                </div>

                <div className="flex-1 min-h-0 overflow-y-auto p-2 space-y-1.5">
                  {filteredKuitansiGroups.length === 0 ? (
                    <div className="text-center py-12 text-xs text-slate-400">
                      Belum ada kuitansi pembayaran yang diterbitkan.
                    </div>
                  ) : (
                    filteredKuitansiGroups.map((kwt) => {
                      const isSel = activeKuitansi?.no_kuitansi === kwt.no_kuitansi;
                      return (
                        <button
                          key={kwt.no_kuitansi}
                          onClick={() => setSelectedKuitansi(kwt)}
                          className={`w-full text-left p-2.5 rounded-xl border transition-all ${
                            isSel
                              ? 'bg-emerald-800 text-white border-emerald-800 shadow-xs'
                              : 'bg-white hover:bg-emerald-50/50 border-slate-200 text-slate-800'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-1">
                            <span className="font-mono text-[11px] font-extrabold">{kwt.no_kuitansi}</span>
                            <span
                              className={`text-[10px] font-bold px-1.5 py-0.2 rounded ${
                                isSel ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-700'
                              }`}
                            >
                              {formatTanggalIndo(kwt.tgl_bayar)}
                            </span>
                          </div>
                          <p className="text-xs font-bold mt-1 truncate">
                            {kwt.santri_nama} ({kwt.santri_kamar})
                          </p>
                          <div className="flex items-center justify-between mt-1 text-[11px]">
                            <span className={isSel ? 'text-emerald-200' : 'text-slate-500'}>
                              {kwt.items.length} item &bull; {kwt.metode_pembayaran.toUpperCase()}
                            </span>
                            <span className={`font-extrabold ${isSel ? 'text-emerald-300' : 'text-emerald-800'}`}>
                              {formatRupiah(kwt.total_nominal)}
                            </span>
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>

              {/* PANEL KANAN: PREVIEW KUITANSI 21x10 CM & BARIS TOMBOL AKSI */}
              <div className="lg:col-span-8 flex flex-col min-h-0 bg-slate-100/70">
                {!activeKuitansi ? (
                  <div className="flex-1 flex items-center justify-center text-xs text-slate-400">
                    Pilih kuitansi di daftar sebelah kiri untuk melihat pratinjau.
                  </div>
                ) : (
                  <>
                    {/* BARIS TOMBOL AKSI: PRINT 21x10 | COPY TEKS | UNDUH PNG | HAPUS TRANSAKSI */}
                    <div className="shrink-0 px-4 py-3 bg-white border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <span className="text-xs font-extrabold text-slate-900">
                          Pratinjau Kuitansi Ukuran 21 × 10 cm
                        </span>
                        <p className="text-[10.5px] text-slate-500">
                          Siap cetak satuan kertas potong 21×10 cm atau unduh gambar PNG untuk WhatsApp.
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => triggerPrint('kuitansi')}
                          className="px-3.5 py-2 rounded-xl bg-emerald-800 hover:bg-emerald-900 text-white text-xs font-bold flex items-center gap-1.5 shadow-xs cursor-pointer"
                        >
                          <Printer className="w-3.5 h-3.5" />
                          Print Kuitansi (21×10 cm)
                        </button>

                        <button
                          type="button"
                          onClick={() => handleCopyTeksKuitansi(activeKuitansi)}
                          className="px-3.5 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-xs cursor-pointer"
                        >
                          {copiedKuitansiNo === activeKuitansi.no_kuitansi ? (
                            <>
                              <Check className="w-3.5 h-3.5" />
                              Tersalin
                            </>
                          ) : (
                            <>
                              <Copy className="w-3.5 h-3.5" />
                              Copy Teks
                            </>
                          )}
                        </button>

                        <button
                          type="button"
                          disabled={downloadingPng}
                          onClick={() => handleDownloadKuitansiPng(activeKuitansi)}
                          className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold flex items-center gap-1.5 shadow-xs cursor-pointer"
                        >
                          <Download className="w-3.5 h-3.5" />
                          {downloadingPng ? 'Memproses...' : 'Unduh PNG'}
                        </button>

                        {(() => {
                          const linkedTx = kasTransaksi.find(
                            (t) => t.no_kuitansi === activeKuitansi.no_kuitansi
                          );
                          const existingUrl = linkedTx
                            ? resolveTxLampiranUrl(linkedTx, lampiranMap)
                            : resolveTxLampiranUrl(
                                { no_kuitansi: activeKuitansi.no_kuitansi },
                                lampiranMap
                              );
                          if (existingUrl) {
                            return (
                              <button
                                type="button"
                                onClick={() =>
                                  setLightboxLampiran({
                                    url: existingUrl,
                                    title: `Bukti Transfer (${activeKuitansi.no_kuitansi})`,
                                    subtitle: `${activeKuitansi.santri_nama} • ${formatRupiah(activeKuitansi.total_nominal)}`,
                                    txId: linkedTx?.id,
                                    noKuitansi: activeKuitansi.no_kuitansi,
                                  })
                                }
                                className="px-3 py-2 rounded-xl bg-sky-50 hover:bg-sky-100 text-sky-800 border border-sky-200 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                              >
                                <Eye className="w-3.5 h-3.5" />
                                Lihat Bukti TF
                              </button>
                            );
                          }
                          if (canEditKeuangan && activeKuitansi.metode_pembayaran === 'transfer') {
                            return (
                              <button
                                type="button"
                                disabled={uploadingLampiranId === activeKuitansi.no_kuitansi}
                                onClick={() => {
                                  setQuickAttachTarget({
                                    txId: linkedTx?.id,
                                    noKuitansi: activeKuitansi.no_kuitansi,
                                    kind: 'bukti_tf',
                                  });
                                  quickAttachInputRef.current?.click();
                                }}
                                className="px-3 py-2 rounded-xl bg-sky-50 hover:bg-sky-100 text-sky-800 border border-sky-200 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                              >
                                <ImagePlus className="w-3.5 h-3.5" />
                                {uploadingLampiranId === activeKuitansi.no_kuitansi
                                  ? 'Mengunggah...'
                                  : '+ Bukti TF'}
                              </button>
                            );
                          }
                          return null;
                        })()}

                        {/* TOMBOL HAPUS TRANSAKSI (HANYA PIMPINAN INTI / BENDAHARA, BENDAHARA MENDAPAT NOTIF PERINGATAN) */}
                        {canEditKeuangan && (
                          <button
                            type="button"
                            onClick={() => handleClickHapusKuitansi(activeKuitansi)}
                            title={
                              isPimpinanInti || userRole === 'super_admin'
                                ? 'Hapus Transaksi Pembayaran (Pimpinan Inti)'
                                : 'Khusus Pimpinan Inti'
                            }
                            className="px-3 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            Hapus Transaksi
                          </button>
                        )}
                      </div>
                    </div>

                    {/* KONTAINER PREVIEW KUITANSI DI TENGAH AREA */}
                    <div className="flex-1 min-h-0 overflow-x-auto overflow-y-auto p-3 sm:p-6 flex items-start lg:justify-center">
                      {renderKuitansi21x10Card(activeKuitansi, false)}
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {/* ================================================================
              KONTEN TAB 3: PENAGIHAN TUNGGAKAN 2 JALUR & FILTER DINAMIS
          ================================================================ */}
          {activeTab === 'penagihan' && (
            <div className="flex-1 min-h-0 flex flex-col lg:overflow-hidden">
              {/* PANEL FILTER & CHECKLIST ITEM TAHUNAN DINAMIS */}
              <div className="shrink-0 p-3.5 bg-slate-50 border-b border-slate-200 space-y-2.5">
                <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-2.5">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:flex lg:flex-wrap items-center gap-2 flex-1">
                    <div className="relative sm:col-span-2 lg:min-w-[220px] lg:flex-1">
                      <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        type="text"
                        value={tagihanSearch}
                        onChange={(e) => setTagihanSearch(e.target.value)}
                        placeholder="Cari santri menunggak..."
                        className="w-full min-h-[38px] pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-xl"
                      />
                    </div>

                    <select
                      value={tagihanKamarFilter}
                      onChange={(e) => setTagihanKamarFilter(e.target.value)}
                      className="min-h-[38px] px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-xl font-semibold"
                    >
                      <option value="SEMUA">Semua Kamar</option>
                      {allKamarOptions.map((km) => (
                        <option key={km} value={km}>
                          Kamar {km}
                        </option>
                      ))}
                    </select>

                    <div className="sm:col-span-2 lg:col-span-auto inline-flex items-center rounded-xl bg-white border border-slate-200 p-0.5 text-xs overflow-x-auto max-w-full">
                      <button
                        onClick={() => setTagihanKategoriFilter('SEMUA')}
                        className={`px-2.5 py-1.5 rounded-lg font-bold whitespace-nowrap shrink-0 ${
                          tagihanKategoriFilter === 'SEMUA'
                            ? 'bg-slate-800 text-white'
                            : 'text-slate-600'
                        }`}
                      >
                        Semua ({tunggakanData.length})
                      </button>
                      <button
                        onClick={() => setTagihanKategoriFilter('WA_1_2')}
                        className={`px-2.5 py-1.5 rounded-lg font-bold whitespace-nowrap shrink-0 ${
                          tagihanKategoriFilter === 'WA_1_2'
                            ? 'bg-emerald-700 text-white'
                            : 'text-slate-600'
                        }`}
                      >
                        1–2 Bln / WA ({tunggakanData.filter((r) => r.jalur === 'WA_1_2').length})
                      </button>
                      <button
                        onClick={() => setTagihanKategoriFilter('SURAT_3_PLUS')}
                        className={`px-2.5 py-1.5 rounded-lg font-bold whitespace-nowrap shrink-0 ${
                          tagihanKategoriFilter === 'SURAT_3_PLUS'
                            ? 'bg-rose-700 text-white'
                            : 'text-slate-600'
                        }`}
                      >
                        &ge; 3 Bln / Surat Fisik ({tunggakanData.filter((r) => r.jalur === 'SURAT_3_PLUS').length})
                      </button>
                    </div>
                  </div>

                  <button
                    onClick={handleCetakSuratTagihanMassal}
                    className="w-full xl:w-auto min-h-[38px] px-3.5 py-2 rounded-xl bg-rose-700 hover:bg-rose-800 text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-xs cursor-pointer whitespace-nowrap shrink-0"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    Cetak Surat Tagihan Massal ({selectedTagihanSantriIds.length > 0 ? `${selectedTagihanSantriIds.length} Dipilih` : 'Semua >= 3 Bln'})
                  </button>
                </div>

                {/* CHECKLIST ITEM TAHUNAN DINAMIS */}
                <div className="bg-white px-3 py-2.5 rounded-xl border border-slate-200 space-y-2 text-[11px]">
                  <span className="font-bold text-slate-700 flex items-center gap-1.5">
                    <Filter className="w-3 h-3 text-emerald-700 shrink-0" />
                    Sertakan Item Tahunan dalam Tagihan:
                  </span>
                  <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-1.5">
                    {itemTahunanList.map((it) => {
                      const checked = includedTahunanCodes.includes(it.kode);
                      return (
                        <label
                          key={it.kode}
                          className={`cursor-pointer px-2.5 py-1 rounded-lg border font-semibold flex items-center gap-1.5 min-w-0 ${
                            checked
                              ? 'bg-emerald-50 border-emerald-400 text-emerald-900'
                              : 'bg-slate-50 border-slate-200 text-slate-600'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() =>
                              setIncludedTahunanCodes((prev) =>
                                prev.includes(it.kode)
                                  ? prev.filter((k) => k !== it.kode)
                                  : [...prev, it.kode]
                              )
                            }
                            className="accent-emerald-700 shrink-0"
                          />
                          <span className="truncate">{it.nama_item}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* DAFTAR TUNGGAKAN: MOBILE CARDS + DESKTOP TABLE */}
              <div className="flex-1 min-h-0 overflow-y-auto">
                {/* MOBILE CARD VIEW PENAGIHAN */}
                <div className="md:hidden divide-y divide-slate-100">
                  {filteredTunggakan.length === 0 ? (
                    <div className="p-8 text-center text-xs text-slate-400">
                      Alhamdulillah, tidak ada tunggakan santri pada kriteria filter ini.
                    </div>
                  ) : (
                    filteredTunggakan.map((row) => (
                      <div key={row.santri.id} className="p-4 space-y-2.5 text-xs bg-white">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-start gap-2.5 min-w-0">
                            <input
                              type="checkbox"
                              aria-label={`Pilih ${row.santri.nama_lengkap}`}
                              checked={selectedTagihanSantriIds.includes(row.santri.id)}
                              onChange={(e) =>
                                setSelectedTagihanSantriIds((prev) =>
                                  e.target.checked
                                    ? [...prev, row.santri.id]
                                    : prev.filter((id) => id !== row.santri.id)
                                )
                              }
                              className="mt-0.5 w-4 h-4 accent-emerald-700 shrink-0"
                            />
                            <div className="min-w-0">
                              <p className="font-bold text-sm text-slate-900 leading-snug">
                                {row.santri.nama_lengkap}
                              </p>
                              <p className="text-[11px] text-slate-500 font-mono">
                                NIS {row.santri.nis} &bull; Kamar {row.santri.kamar}
                              </p>
                            </div>
                          </div>
                          {row.jalur === 'SURAT_3_PLUS' ? (
                            <span className="px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 font-bold text-[10px] whitespace-nowrap shrink-0">
                              &ge; 3 Bln
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold text-[10px] whitespace-nowrap shrink-0">
                              {row.jumlahBulanNunggak} Bln WA
                            </span>
                          )}
                        </div>

                        <div className="flex flex-wrap gap-1">
                          {row.ktlSisa > 0 && (
                            <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-900 font-bold text-[10px]">
                              KTL: {formatRupiah(row.ktlSisa)}
                            </span>
                          )}
                          {row.tunggakanBulan.map((b) => (
                            <span
                              key={b.periode}
                              className="px-2 py-0.5 rounded bg-rose-50 text-rose-800 border border-rose-200 font-semibold text-[10px]"
                            >
                              {b.label}
                            </span>
                          ))}
                          {row.tunggakanTahunan.map((t) => (
                            <span
                              key={t.kode}
                              className="px-2 py-0.5 rounded bg-indigo-50 text-indigo-800 border border-indigo-200 font-semibold text-[10px]"
                            >
                              {t.label}
                            </span>
                          ))}
                        </div>

                        <div className="flex items-center justify-between pt-0.5">
                          <span className="text-[11px] text-slate-500">Total Tagihan</span>
                          <span className="font-extrabold text-sm text-slate-900 tabular-nums">
                            {formatRupiah(row.totalTagihan)}
                          </span>
                        </div>

                        <div className="flex items-center gap-2 pt-0.5">
                          <button
                            onClick={() => handleChatWaTagihan(row)}
                            className="flex-1 min-h-[40px] px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer"
                          >
                            <Send className="w-3.5 h-3.5" />
                            Chat WA
                          </button>
                          <button
                            onClick={() => handleCetakSuratTagihanSatuan(row)}
                            className="flex-1 min-h-[40px] px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer"
                          >
                            <Printer className="w-3.5 h-3.5" />
                            Surat A4
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {/* DESKTOP TABLE VIEW PENAGIHAN */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead className="sticky top-0 bg-slate-100 text-slate-700 border-b border-slate-200 z-10 text-[11px] uppercase tracking-wider font-bold">
                      <tr>
                        <th className="py-3 px-3 w-10 text-center">
                          <input
                            type="checkbox"
                            aria-label="Pilih semua santri menunggak"
                            checked={
                              filteredTunggakan.length > 0 &&
                              selectedTagihanSantriIds.length === filteredTunggakan.length
                            }
                            onChange={(e) =>
                              setSelectedTagihanSantriIds(
                                e.target.checked ? filteredTunggakan.map((r) => r.santri.id) : []
                              )
                            }
                          />
                        </th>
                        <th className="py-3 px-3 min-w-[175px]">Santri &amp; Kamar</th>
                        <th className="py-3 px-3 min-w-[215px]">Rincian Tunggakan</th>
                        <th className="py-3 px-3 w-32 text-right whitespace-nowrap">Total Tagihan</th>
                        <th className="py-3 px-3 w-40 text-center whitespace-nowrap">Jalur Penagihan</th>
                        <th className="py-3 px-3 w-[195px] text-right whitespace-nowrap">Aksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredTunggakan.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="p-10 text-center text-slate-400">
                            Alhamdulillah, tidak ada tunggakan santri pada kriteria filter ini.
                          </td>
                        </tr>
                      ) : (
                        filteredTunggakan.map((row) => (
                          <tr key={row.santri.id} className="hover:bg-slate-50/80">
                            <td className="py-3 px-3 text-center">
                              <input
                                type="checkbox"
                                aria-label={`Pilih ${row.santri.nama_lengkap}`}
                                checked={selectedTagihanSantriIds.includes(row.santri.id)}
                                onChange={(e) =>
                                  setSelectedTagihanSantriIds((prev) =>
                                    e.target.checked
                                      ? [...prev, row.santri.id]
                                      : prev.filter((id) => id !== row.santri.id)
                                  )
                                }
                              />
                            </td>
                            <td className="py-3 px-3">
                              <p className="font-bold text-slate-900">{row.santri.nama_lengkap}</p>
                              <p className="text-[10.5px] text-slate-500 whitespace-nowrap tabular-nums">
                                NIS: {row.santri.nis} &bull; Kamar <strong>{row.santri.kamar}</strong>
                              </p>
                            </td>
                            <td className="py-3 px-3">
                              <div className="flex flex-wrap gap-1">
                                {row.ktlSisa > 0 && (
                                  <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-900 font-bold text-[10px] whitespace-nowrap">
                                    KTL: {formatRupiah(row.ktlSisa)}
                                  </span>
                                )}
                                {row.tunggakanBulan.map((b) => (
                                  <span
                                    key={b.periode}
                                    className="px-2 py-0.5 rounded bg-rose-50 text-rose-800 border border-rose-200 font-semibold text-[10px] whitespace-nowrap"
                                  >
                                    {b.label}
                                  </span>
                                ))}
                                {row.tunggakanTahunan.map((t) => (
                                  <span
                                    key={t.kode}
                                    className="px-2 py-0.5 rounded bg-indigo-50 text-indigo-800 border border-indigo-200 font-semibold text-[10px] whitespace-nowrap"
                                  >
                                    {t.label}
                                  </span>
                                ))}
                              </div>
                            </td>
                            <td className="py-3 px-3 text-right font-extrabold text-slate-900 whitespace-nowrap tabular-nums">
                              {formatRupiah(row.totalTagihan)}
                            </td>
                            <td className="py-3 px-3 text-center whitespace-nowrap">
                              {row.jalur === 'SURAT_3_PLUS' ? (
                                <span className="inline-flex px-2.5 py-1 rounded-full bg-rose-100 text-rose-800 font-bold text-[10px] whitespace-nowrap">
                                  &ge; 3 Bulan (Surat Fisik)
                                </span>
                              ) : (
                                <span className="inline-flex px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 font-bold text-[10px] whitespace-nowrap">
                                  {row.jumlahBulanNunggak} Bulan (Chat WA)
                                </span>
                              )}
                            </td>
                            <td className="py-3 px-3 text-right whitespace-nowrap">
                              <div className="inline-flex flex-nowrap items-center justify-end gap-1.5">
                                <button
                                  onClick={() => handleChatWaTagihan(row)}
                                  className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer whitespace-nowrap shrink-0"
                                >
                                  <Send className="w-3 h-3" />
                                  Chat WA
                                </button>
                                <button
                                  onClick={() => handleCetakSuratTagihanSatuan(row)}
                                  className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-900 text-white text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer whitespace-nowrap shrink-0"
                                >
                                  <Printer className="w-3 h-3" />
                                  Surat A4
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ================================================================
              KONTEN TAB 4: BUKU KAS UMUM & PENCAIRAN BISYAROH PENGURUS
          ================================================================ */}
          {activeTab === 'bukukas' && (
            <div className="flex-1 min-h-0 flex flex-col lg:overflow-hidden">
              {/* BAR FILTER & TOMBOL AKSI BUKU KAS */}
              <div className="shrink-0 p-3.5 bg-slate-50 border-b border-slate-200 space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 className="text-xs font-extrabold text-slate-900 uppercase">
                      Buku Kas Umum (Seluruh Mutasi Loket Santri &amp; Kas Operasional)
                    </h2>
                    <p className="text-[11px] text-slate-500">
                      Menampilkan pemasukan otomatis dari Loket Pembayaran Santri serta pencatatan kas masuk/keluar manual.
                    </p>
                  </div>

                  <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2 w-full sm:w-auto">
                    {canViewBisyaroh && canEditKeuangan && (
                      <button
                        onClick={() => setShowBisyarohModal(true)}
                        className="col-span-2 sm:col-span-1 min-h-[38px] px-3 py-1.5 rounded-xl bg-indigo-700 hover:bg-indigo-800 text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-xs cursor-pointer whitespace-nowrap"
                      >
                        <Users className="w-3.5 h-3.5 shrink-0" />
                        Pencairan Bisyaroh Pengurus
                      </button>
                    )}

                    {canEditKeuangan && (
                      <button
                        onClick={() => setShowKasModal(true)}
                        className="col-span-2 sm:col-span-1 min-h-[38px] px-3 py-1.5 rounded-xl bg-emerald-800 hover:bg-emerald-900 text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-xs cursor-pointer whitespace-nowrap"
                      >
                        <Plus className="w-3.5 h-3.5 shrink-0" />
                        Catat Kas Masuk / Keluar
                      </button>
                    )}

                    <button
                      onClick={handleExportBukuKasExcel}
                      className="min-h-[38px] px-3 py-1.5 rounded-xl bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap"
                    >
                      <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-700" />
                      Excel
                    </button>

                    <button
                      onClick={() => triggerPrint('laporan_kas')}
                      className="min-h-[38px] px-3 py-1.5 rounded-xl bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap"
                    >
                      <Printer className="w-3.5 h-3.5" />
                      Print A4
                    </button>
                  </div>
                </div>

                {/* FILTER & RINGKASAN ARUS KAS FILTERED */}
                <div className="space-y-2.5">
                  <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-2 text-xs">
                    <select
                      value={kasBulanFilter}
                      onChange={(e) => setKasBulanFilter(e.target.value)}
                      className="min-h-[38px] px-2.5 py-1.5 bg-white border border-slate-200 rounded-xl font-bold text-slate-700"
                    >
                      <option value="SEMUA">Semua Bulan</option>
                      {Array.from(
                        new Set([
                          currentMonthStr,
                          ...kasTransaksi.map((t) => (t.tgl_transaksi || '').slice(0, 7)),
                        ])
                      )
                        .filter(Boolean)
                        .sort((a, b) => b.localeCompare(a))
                        .map((ym) => (
                          <option key={ym} value={ym}>
                            Bulan {ym}
                          </option>
                        ))}
                    </select>

                    <select
                      value={kasDompetFilter}
                      onChange={(e) => setKasDompetFilter(e.target.value)}
                      className="min-h-[38px] px-2.5 py-1.5 bg-white border border-slate-200 rounded-xl font-semibold text-slate-700"
                    >
                      <option value="SEMUA">Semua 4 Dompet</option>
                      <option value="pendaftaran">1. Dompet Pendaftaran</option>
                      <option value="operasional">2. Syahriyah &amp; Tahunan</option>
                      <option value="kas_pondok">3. Dompet Kas Lain-lain</option>
                      <option value="mda">4. Dompet MDA</option>
                    </select>

                    <select
                      value={kasTipeFilter}
                      onChange={(e) => setKasTipeFilter(e.target.value)}
                      className="min-h-[38px] px-2.5 py-1.5 bg-white border border-slate-200 rounded-xl font-semibold text-slate-700"
                    >
                      <option value="SEMUA">Masuk &amp; Keluar</option>
                      <option value="masuk">Pemasukan Saja</option>
                      <option value="keluar">Pengeluaran Saja</option>
                    </select>

                    <select
                      value={kasMetodeFilter}
                      onChange={(e) => setKasMetodeFilter(e.target.value)}
                      className="min-h-[38px] px-2.5 py-1.5 bg-white border border-slate-200 rounded-xl font-semibold text-slate-700"
                    >
                      <option value="SEMUA">Tunai &amp; Transfer</option>
                      <option value="tunai">Tunai (Cash)</option>
                      <option value="transfer">Transfer Bank</option>
                    </select>

                    <div className="relative col-span-2 sm:col-span-4 lg:col-span-1">
                      <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        type="text"
                        value={kasSearch}
                        onChange={(e) => setKasSearch(e.target.value)}
                        placeholder="Cari uraian / kuitansi..."
                        className="w-full min-h-[38px] pl-8 pr-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 text-xs tabular-nums">
                    <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-3 py-2 flex items-center justify-between gap-2">
                      <span className="text-[11px] font-semibold text-emerald-800">Tunai Masuk</span>
                      <strong className="font-mono font-extrabold text-emerald-900">
                        {formatRupiah(kasFilteredTotals.tunaiMasuk)}
                      </strong>
                    </div>
                    <div className="rounded-xl bg-rose-50 border border-rose-200 px-3 py-2 flex items-center justify-between gap-2">
                      <span className="text-[11px] font-semibold text-rose-800">Tunai Keluar</span>
                      <strong className="font-mono font-extrabold text-rose-800">
                        {formatRupiah(kasFilteredTotals.tunaiKeluar)}
                      </strong>
                    </div>
                    <div className="col-span-2 sm:col-span-1 rounded-xl bg-slate-900 text-white px-3 py-2 flex items-center justify-between gap-2">
                      <span className="text-[11px] font-semibold text-slate-300">Saldo Netto Tunai</span>
                      <strong className="font-mono font-extrabold text-emerald-300">
                        {formatRupiah(kasFilteredTotals.tunaiNetto)}
                      </strong>
                    </div>
                    {(kasFilteredTotals.transferMasuk > 0 || kasFilteredTotals.transferKeluar > 0) && (
                      <div className="col-span-2 sm:col-span-3 lg:col-span-1 rounded-xl bg-sky-50 border border-sky-200 px-3 py-2 flex items-center justify-between gap-2 text-sky-900">
                        <span className="text-[11px] font-semibold">Transfer Filter</span>
                        <strong className="font-mono font-bold">
                          +{formatRupiah(kasFilteredTotals.transferMasuk)}
                          {kasFilteredTotals.transferKeluar > 0
                            ? ` / -${formatRupiah(kasFilteredTotals.transferKeluar)}`
                            : ''}
                        </strong>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* TABEL & KARTU MUTASI BUKU KAS */}
              <div className="flex-1 min-h-0 overflow-y-auto">
                {/* MOBILE CARD VIEW BUKU KAS */}
                <div className="md:hidden divide-y divide-slate-100">
                  {filteredKasTransaksi.length === 0 ? (
                    <div className="p-8 text-center text-xs text-slate-400">
                      Belum ada mutasi transaksi pada filter bulan/dompet ini.
                    </div>
                  ) : (
                    filteredKasTransaksi.map((tx) => {
                      const meta = DOMPET_META[tx.dompet] || DOMPET_META.operasional;
                      const lampiranUrl = resolveTxLampiranUrl(tx, lampiranMap);
                      const attachKind: 'bukti_tf' | 'nota' =
                        tx.metode_pembayaran === 'transfer' ? 'bukti_tf' : 'nota';
                      const lockKey = String(tx.no_kuitansi || tx.id);
                      return (
                        <div key={tx.id} className="p-4 space-y-2 text-xs bg-white">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <div className="font-semibold text-slate-800">
                                {formatTanggalIndo(tx.tgl_transaksi)}
                              </div>
                              {tx.no_kuitansi && (
                                <span className="font-mono text-[10px] text-emerald-700 font-bold">
                                  {tx.no_kuitansi}
                                </span>
                              )}
                            </div>
                            <span className={`px-2 py-0.5 rounded-full border text-[10px] font-bold whitespace-nowrap ${meta.badgeClass}`}>
                              {meta.shortLabel}
                            </span>
                          </div>

                          <div>
                            <p className="font-bold text-slate-900">{tx.kategori}</p>
                            {tx.keterangan && (
                              <p className="text-[11px] text-slate-500 mt-0.5">{tx.keterangan}</p>
                            )}
                          </div>

                          <div className="flex items-center justify-between gap-2 pt-0.5">
                            <div className="flex items-center gap-2">
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                                  tx.metode_pembayaran === 'transfer'
                                    ? 'bg-sky-100 text-sky-800'
                                    : 'bg-slate-100 text-slate-700'
                                }`}
                              >
                                {tx.metode_pembayaran}
                              </span>
                              <span
                                className={`font-extrabold text-sm tabular-nums font-mono ${
                                  tx.tipe === 'masuk' ? 'text-emerald-700' : 'text-rose-700'
                                }`}
                              >
                                {tx.tipe === 'masuk' ? '+' : '-'} {formatRupiah(tx.nominal)}
                              </span>
                            </div>

                            <div className="flex items-center gap-1.5">
                              {lampiranUrl ? (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setLightboxLampiran({
                                      url: lampiranUrl,
                                      title:
                                        attachKind === 'bukti_tf'
                                          ? 'Bukti Transfer Bank'
                                          : 'Scan Nota Pembelian',
                                      subtitle: `${formatTanggalIndo(tx.tgl_transaksi)} • ${tx.kategori} (${formatRupiah(tx.nominal)})`,
                                      txId: tx.id,
                                      noKuitansi: tx.no_kuitansi,
                                    })
                                  }
                                  className="min-h-[34px] px-2.5 py-1 rounded-lg bg-sky-50 border border-sky-200 text-sky-800 font-bold inline-flex items-center gap-1 cursor-pointer"
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                  {attachKind === 'bukti_tf' ? 'Bukti' : 'Nota'}
                                </button>
                              ) : canEditKeuangan ? (
                                <button
                                  type="button"
                                  disabled={uploadingLampiranId === lockKey}
                                  onClick={() => {
                                    setQuickAttachTarget({
                                      txId: tx.id,
                                      noKuitansi: tx.no_kuitansi,
                                      kind: attachKind,
                                    });
                                    quickAttachInputRef.current?.click();
                                  }}
                                  className="min-h-[34px] px-2.5 py-1 rounded-lg bg-slate-50 border border-slate-200 text-slate-700 font-semibold inline-flex items-center gap-1 cursor-pointer"
                                >
                                  <ImagePlus className="w-3.5 h-3.5" />
                                  {uploadingLampiranId === lockKey
                                    ? '...'
                                    : attachKind === 'bukti_tf'
                                    ? '+ Bukti'
                                    : '+ Nota'}
                                </button>
                              ) : null}

                              {canEditKeuangan && (
                                <button
                                  onClick={() => handleDeleteKasRow(tx)}
                                  title={tx.no_kuitansi ? 'Hapus lewat Tab 2 Kuitansi (Pimpinan Inti)' : 'Hapus catatan kas'}
                                  aria-label="Hapus transaksi kas"
                                  className="min-h-[36px] min-w-[36px] p-2 rounded-lg bg-slate-50 text-slate-500 hover:text-rose-600 hover:bg-rose-50 cursor-pointer flex items-center justify-center"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                {/* DESKTOP TABLE VIEW BUKU KAS */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead className="sticky top-0 bg-slate-100 text-slate-700 border-b border-slate-200 z-10 text-[11px] uppercase tracking-wider font-bold">
                      <tr>
                        <th className="py-3 px-3 w-36 whitespace-nowrap">Tanggal</th>
                        <th className="py-3 px-3 w-32 whitespace-nowrap">Dompet</th>
                        <th className="py-3 px-3 min-w-[200px]">Kategori &amp; Keterangan</th>
                        <th className="py-3 px-3 w-24 text-center whitespace-nowrap">Metode</th>
                        <th className="py-3 px-3 w-32 text-right whitespace-nowrap">Masuk</th>
                        <th className="py-3 px-3 w-32 text-right whitespace-nowrap">Keluar</th>
                        <th className="py-3 px-3 w-28 text-center whitespace-nowrap">Lampiran</th>
                        <th className="py-3 px-3 w-14 text-center whitespace-nowrap">Aksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredKasTransaksi.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="p-10 text-center text-slate-400">
                            Belum ada mutasi transaksi pada filter bulan/dompet ini.
                          </td>
                        </tr>
                      ) : (
                        filteredKasTransaksi.map((tx) => {
                          const meta = DOMPET_META[tx.dompet] || DOMPET_META.operasional;
                          const lampiranUrl = resolveTxLampiranUrl(tx, lampiranMap);
                          const attachKind: 'bukti_tf' | 'nota' =
                            tx.metode_pembayaran === 'transfer' ? 'bukti_tf' : 'nota';
                          const lockKey = String(tx.no_kuitansi || tx.id);
                          return (
                            <tr key={tx.id} className="hover:bg-slate-50/80">
                              <td className="py-3 px-3 whitespace-nowrap tabular-nums">
                                <p className="font-semibold text-slate-800">{formatTanggalIndo(tx.tgl_transaksi)}</p>
                                {tx.no_kuitansi && (
                                  <span className="font-mono text-[10px] text-emerald-700 font-bold">
                                    {tx.no_kuitansi}
                                  </span>
                                )}
                              </td>
                              <td className="py-3 px-3 whitespace-nowrap">
                                <span className={`inline-flex px-2 py-0.5 rounded-full border text-[10px] font-bold whitespace-nowrap ${meta.badgeClass}`}>
                                  {meta.shortLabel}
                                </span>
                              </td>
                              <td className="py-3 px-3">
                                <p className="font-bold text-slate-900">{tx.kategori}</p>
                                <p className="text-[11px] text-slate-500 line-clamp-1">{tx.keterangan}</p>
                              </td>
                              <td className="py-3 px-3 text-center whitespace-nowrap">
                                <span
                                  className={`inline-flex px-2 py-0.5 rounded text-[10px] font-bold uppercase whitespace-nowrap ${
                                    tx.metode_pembayaran === 'transfer'
                                      ? 'bg-sky-100 text-sky-800'
                                      : 'bg-slate-100 text-slate-700'
                                  }`}
                                >
                                  {tx.metode_pembayaran}
                                </span>
                              </td>
                              <td className="py-3 px-3 text-right font-extrabold text-emerald-700 whitespace-nowrap tabular-nums font-mono">
                                {tx.tipe === 'masuk' ? formatRupiah(tx.nominal) : '-'}
                              </td>
                              <td className="py-3 px-3 text-right font-extrabold text-rose-700 whitespace-nowrap tabular-nums font-mono">
                                {tx.tipe === 'keluar' ? formatRupiah(tx.nominal) : '-'}
                              </td>
                              <td className="py-3 px-3 text-center whitespace-nowrap">
                                {lampiranUrl ? (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setLightboxLampiran({
                                        url: lampiranUrl,
                                        title:
                                          attachKind === 'bukti_tf'
                                            ? 'Bukti Transfer Bank'
                                            : 'Scan Nota Pembelian',
                                        subtitle: `${formatTanggalIndo(tx.tgl_transaksi)} • ${tx.kategori} (${formatRupiah(tx.nominal)})`,
                                        txId: tx.id,
                                        noKuitansi: tx.no_kuitansi,
                                      })
                                    }
                                    className="px-2 py-1 rounded-lg bg-sky-50 hover:bg-sky-100 border border-sky-200 text-sky-800 text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer"
                                  >
                                    <Eye className="w-3 h-3" />
                                    {attachKind === 'bukti_tf' ? 'Lihat Bukti' : 'Lihat Nota'}
                                  </button>
                                ) : canEditKeuangan ? (
                                  <button
                                    type="button"
                                    disabled={uploadingLampiranId === lockKey}
                                    onClick={() => {
                                      setQuickAttachTarget({
                                        txId: tx.id,
                                        noKuitansi: tx.no_kuitansi,
                                        kind: attachKind,
                                      });
                                      quickAttachInputRef.current?.click();
                                    }}
                                    className="px-2 py-1 rounded-lg bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-600 text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer"
                                  >
                                    <Upload className="w-3 h-3" />
                                    {uploadingLampiranId === lockKey
                                      ? '...'
                                      : attachKind === 'bukti_tf'
                                      ? '+ Bukti TF'
                                      : '+ Nota'}
                                  </button>
                                ) : (
                                  <span className="text-[11px] text-slate-400">-</span>
                                )}
                              </td>
                              <td className="py-3 px-3 text-center">
                                {canEditKeuangan ? (
                                  <button
                                    onClick={() => handleDeleteKasRow(tx)}
                                    title={tx.no_kuitansi ? 'Hapus lewat Tab 2 Kuitansi (Pimpinan Inti)' : 'Hapus catatan kas'}
                                    aria-label="Hapus transaksi kas"
                                    className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                ) : (
                                  <span className="text-[11px] text-slate-400">-</span>
                                )}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ================================================================
              KONTEN TAB 5: MIGRASI BUKU LAMA & KTL TRANSISI
          ================================================================ */}
          {activeTab === 'migrasi' && (
            <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-5 bg-slate-50/40">
              {/* BAGIAN 1: IMPORT EXCEL MIGRASI & KTL MASSAL */}
              <div className="bg-white rounded-2xl border border-slate-200 p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div className="max-w-2xl">
                  <h3 className="text-xs font-extrabold text-slate-900 uppercase">
                    1. Import Excel Migrasi &amp; KTL Massal
                  </h3>
                  <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                    Unduh template Excel dengan kolom terpisah untuk setiap item tahunan (<strong>YA / TIDAK</strong>) serta nominal <strong>KTL (Kekurangan Tahun Lalu)</strong>. Data migrasi hanya menyinkronkan tunggakan transisi pembukuan manual ke aplikasi tanpa menambah saldo kas hari ini. (Pengaturan Saldo Awal 4 Dompet tersedia di menu <strong>Pengaturan Aplikasi</strong>.)
                  </p>
                </div>

                <div className="flex flex-col sm:flex-row gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={handleDownloadTemplateMigrasi}
                    className="py-2.5 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold flex items-center justify-center gap-2 cursor-pointer whitespace-nowrap"
                  >
                    <Download className="w-4 h-4 text-emerald-700" />
                    Download Template Excel Migrasi (.xlsx)
                  </button>

                  {canEditKeuangan && (
                    <label className="py-2.5 px-4 rounded-xl bg-emerald-800 hover:bg-emerald-900 text-white text-xs font-bold flex items-center justify-center gap-2 cursor-pointer whitespace-nowrap">
                      <FileSpreadsheet className="w-4 h-4" />
                      {importingMigrasi ? 'Mengimpor Data...' : 'Upload File Excel Migrasi (.xlsx)'}
                      <input
                        type="file"
                        accept=".xlsx,.xls"
                        disabled={importingMigrasi}
                        onChange={handleImportExcelMigrasi}
                        className="hidden"
                      />
                    </label>
                  )}
                </div>
              </div>

              {/* BAGIAN 2: SPLIT-PANEL SETEL LUNAS MIGRASI & KTL PER SANTRI */}
              <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                <div className="px-4 py-3 bg-slate-900 text-white flex items-center justify-between">
                  <div>
                    <h3 className="text-xs font-extrabold uppercase tracking-wide">
                      2. Setel Lunas Buku Lama (Migrasi) &amp; KTL Per Santri
                    </h3>
                    <p className="text-[11px] text-slate-300">
                      Pilih santri di panel kiri untuk menandai bulan lunas buku lama atau mencatat KTL (Kekurangan Tahun Lalu).
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 min-h-[380px]">
                  {/* PANEL KIRI: CARI & PILIH SANTRI INSTAN */}
                  <div className="lg:col-span-4 border-r border-slate-200 bg-slate-50/70 flex flex-col max-h-[460px]">
                    <div className="p-3 border-b border-slate-200 bg-white space-y-2">
                      <div className="relative">
                        <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                        <input
                          type="text"
                          value={migrasiSearch}
                          onChange={(e) => setMigrasiSearch(e.target.value)}
                          placeholder="Cari nama santri / NIS..."
                          className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl"
                        />
                      </div>
                      <select
                        value={migrasiKamarFilter}
                        onChange={(e) => setMigrasiKamarFilter(e.target.value)}
                        className="w-full px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl font-semibold"
                      >
                        <option value="SEMUA">Semua Kamar</option>
                        {allKamarOptions.map((km) => (
                          <option key={km} value={km}>
                            Kamar {km}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
                      {filteredMigrasiSantri.map((s) => {
                        const isSel = activeMigrasiSantri?.id === s.id;
                        return (
                          <button
                            key={s.id}
                            type="button"
                            onClick={() => setMigrasiSantriId(s.id)}
                            className={`w-full text-left p-2.5 rounded-xl border transition-all ${
                              isSel
                                ? 'bg-emerald-800 text-white border-emerald-800'
                                : 'bg-white hover:bg-emerald-50/60 border-slate-200 text-slate-800'
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-bold truncate">{s.nama_lengkap}</span>
                              <span
                                className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                                  isSel ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-700'
                                }`}
                              >
                                {s.kamar}
                              </span>
                            </div>
                            <div className="flex items-center justify-between mt-1 text-[10px]">
                              <span className={isSel ? 'text-emerald-200' : 'text-slate-500'}>
                                NIS: {s.nis}
                              </span>
                              {Number(s.ktl_nominal || 0) > 0 && (
                                <span className="px-1.5 py-0.2 rounded bg-amber-500 text-white font-bold">
                                  KTL: {formatRupiah(s.ktl_nominal)}
                                </span>
                              )}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* PANEL KANAN: FORM SETEL MIGRASI & KTL SANTRI */}
                  <div className="lg:col-span-8 p-4 space-y-4">
                    {!activeMigrasiSantri ? (
                      <div className="text-center py-12 text-xs text-slate-400">
                        Pilih santri di panel sebelah kiri.
                      </div>
                    ) : (
                      <>
                        <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <h4 className="text-sm font-extrabold text-emerald-950">
                              {activeMigrasiSantri.nama_lengkap}
                            </h4>
                            <p className="text-[11px] text-emerald-800">
                              NIS: {activeMigrasiSantri.nis} &bull; Kamar {activeMigrasiSantri.kamar} &bull; TA {tahunAjaran}
                            </p>
                          </div>
                          <span className="text-[10.5px] font-bold px-2.5 py-1 rounded-lg bg-white text-emerald-900 border border-emerald-300">
                            Mode Cut-Off (Tidak Menambah Saldo Kas)
                          </span>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                          <div>
                            <label className="font-bold text-slate-800 block mb-1">
                              Lunas Syahriyah di Buku Lama s/d Bulan:
                            </label>
                            <select
                              value={migrasiCutOffBulan}
                              onChange={(e) => setMigrasiCutOffBulan(e.target.value)}
                              className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-bold text-slate-800"
                            >
                              <option value="BELUM_ADA">-- Belum Ada yang Lunas di TA {tahunAjaran} --</option>
                              {periodeListTA.map((p) => (
                                <option key={p.periode} value={p.periode}>
                                  Lunas s/d {p.nama} {p.tahun}
                                </option>
                              ))}
                            </select>
                            <p className="text-[10.5px] text-slate-500 mt-1">
                              Bulan setelah pilihan ini otomatis terbaca sebagai tunggakan aktif.
                            </p>
                          </div>

                          {/* INPUT KTL (KEKURANGAN TAHUN LALU) */}
                          <div className="p-3 rounded-xl bg-amber-50/80 border border-amber-200 space-y-2">
                            <label className="font-extrabold text-amber-950 block">
                              KTL (Kekurangan Tahun Ajaran Sebelumnya)
                            </label>
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <span className="text-[10px] font-semibold text-amber-900 block mb-0.5">
                                  Total Nominal KTL (Rp)
                                </span>
                                <input
                                  type="number"
                                  min={0}
                                  value={migrasiKtlNominal}
                                  onChange={(e) => setMigrasiKtlNominal(e.target.value)}
                                  className="w-full px-2.5 py-1.5 bg-white border border-amber-300 rounded-lg font-bold"
                                />
                              </div>
                              <div>
                                <span className="text-[10px] font-semibold text-amber-900 block mb-0.5">
                                  Catatan Rincian KTL
                                </span>
                                <input
                                  type="text"
                                  value={migrasiKtlCatatan}
                                  onChange={(e) => setMigrasiKtlCatatan(e.target.value)}
                                  placeholder="Misal: Tunggakan bulan lalu"
                                  className="w-full px-2.5 py-1.5 bg-white border border-amber-300 rounded-lg"
                                />
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* PILIHAN ITEM TAHUNAN YANG SUDAH LUNAS DI BUKU LAMA */}
                        <div>
                          <label className="text-xs font-bold text-slate-800 block mb-1.5">
                            Centang Item Tahunan yang Sudah Lunas di Buku Lama:
                          </label>
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                            {itemTahunanList.map((it) => {
                              const checked = migrasiTahunanChecked.includes(it.kode);
                              return (
                                <label
                                  key={it.kode}
                                  className={`cursor-pointer p-2 rounded-xl border text-xs flex items-center justify-between ${
                                    checked
                                      ? 'bg-emerald-50 border-emerald-500 text-emerald-950 font-bold'
                                      : 'bg-white border-slate-200 text-slate-700'
                                  }`}
                                >
                                  <span className="truncate pr-1">{it.nama_item}</span>
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() =>
                                      setMigrasiTahunanChecked((prev) =>
                                        prev.includes(it.kode)
                                          ? prev.filter((k) => k !== it.kode)
                                          : [...prev, it.kode]
                                      )
                                    }
                                    className="accent-emerald-700"
                                  />
                                </label>
                              );
                            })}
                          </div>
                        </div>

                        {canEditKeuangan && (
                          <div className="pt-2 flex justify-end">
                            <button
                              type="button"
                              disabled={savingMigrasi}
                              onClick={handleSimpanMigrasiSatuan}
                              className="px-5 py-2.5 rounded-xl bg-emerald-800 hover:bg-emerald-900 text-white text-xs font-extrabold flex items-center gap-2 shadow-xs cursor-pointer"
                            >
                              <CheckCircle2 className="w-4 h-4" />
                              {savingMigrasi ? 'Menyimpan...' : 'Simpan Status Migrasi & KTL Santri'}
                            </button>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ==================================================================
            MODAL INPUT KAS MASUK / KELUAR MANUAL
        ================================================================== */}
        {showKasModal && (
          <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
            <form
              onSubmit={handleSimpanKasManual}
              className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-md w-full p-5 space-y-3 text-xs"
            >
              <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                <h3 className="text-sm font-extrabold text-slate-900">Catat Mutasi Kas Umum</h3>
                <button
                  type="button"
                  onClick={() => setShowKasModal(false)}
                  className="text-slate-400 hover:text-slate-700"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setKasForm((p) => ({ ...p, tipe: 'masuk' }))}
                  className={`py-2 rounded-xl font-bold flex items-center justify-center gap-1.5 border ${
                    kasForm.tipe === 'masuk'
                      ? 'bg-emerald-700 text-white border-emerald-700'
                      : 'bg-slate-50 text-slate-600 border-slate-200'
                  }`}
                >
                  <ArrowDownLeft className="w-4 h-4" />
                  Kas Masuk
                </button>
                <button
                  type="button"
                  onClick={() => setKasForm((p) => ({ ...p, tipe: 'keluar' }))}
                  className={`py-2 rounded-xl font-bold flex items-center justify-center gap-1.5 border ${
                    kasForm.tipe === 'keluar'
                      ? 'bg-rose-700 text-white border-rose-700'
                      : 'bg-slate-50 text-slate-600 border-slate-200'
                  }`}
                >
                  <ArrowUpRight className="w-4 h-4" />
                  Kas Keluar
                </button>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Pilih Pos Dompet</label>
                <select
                  value={kasForm.dompet}
                  onChange={(e) => setKasForm((p) => ({ ...p, dompet: e.target.value as DompetType }))}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-semibold"
                >
                  <option value="operasional">2. Dompet Syahriyah &amp; Iuran Tahunan (Operasional)</option>
                  <option value="kas_pondok">3. Dompet Kas (Kotak Amal, Kantin, Lain-lain)</option>
                  <option value="pendaftaran">1. Dompet Pendaftaran (PSB)</option>
                  <option value="mda">4. Dompet MDA (Madin)</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Tanggal</label>
                  <input
                    type="date"
                    required
                    value={kasForm.tgl_transaksi}
                    onChange={(e) => setKasForm((p) => ({ ...p, tgl_transaksi: e.target.value }))}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Metode</label>
                  <select
                    value={kasForm.metode_pembayaran}
                    onChange={(e) =>
                      setKasForm((p) => ({
                        ...p,
                        metode_pembayaran: e.target.value as 'tunai' | 'transfer',
                      }))
                    }
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-semibold"
                  >
                    <option value="tunai">Tunai (Cash)</option>
                    <option value="transfer">Transfer Bank</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Kategori Pos</label>
                <input
                  type="text"
                  required
                  value={kasForm.kategori}
                  onChange={(e) => setKasForm((p) => ({ ...p, kategori: e.target.value }))}
                  placeholder="Misal: Belanja Dapur, Listrik & Air, Setoran Kantin, Kotak Amal"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Nominal (Rp)</label>
                <input
                  type="number"
                  required
                  min={1}
                  value={kasForm.nominal}
                  onChange={(e) => setKasForm((p) => ({ ...p, nominal: e.target.value }))}
                  placeholder="Contoh: 500000"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-extrabold text-sm"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Keterangan / Uraian Lengkap</label>
                <textarea
                  rows={2}
                  value={kasForm.keterangan}
                  onChange={(e) => setKasForm((p) => ({ ...p, keterangan: e.target.value }))}
                  placeholder="Rincian transaksi..."
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl"
                />
              </div>

              {kasForm.metode_pembayaran === 'transfer' && (
                <div className="px-3 py-2 rounded-xl bg-sky-50 border border-sky-200 text-[11px] text-sky-900 font-medium">
                  Transaksi bermetode Transfer Bank dicatat di laporan <strong>Pemasukan Transfer</strong> dan tidak mengubah saldo kas tunai 4 Dompet.
                </div>
              )}

              <div className="space-y-1.5">
                <label className="font-bold text-slate-700 block">
                  {kasForm.metode_pembayaran === 'transfer'
                    ? 'Foto Bukti Transfer (Opsional)'
                    : 'Scan / Foto Nota Pembelian (Opsional)'}
                </label>
                <p className="text-[10.5px] text-slate-500">
                  Disarankan hasil scan/foto jelas; otomatis tampil di lampiran Pusat Laporan Keuangan.
                </p>
                {kasLampiranPreview ? (
                  <div className="p-2 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={kasLampiranPreview}
                        alt="Pratinjau Nota atau Bukti"
                        className="w-12 h-12 rounded-lg object-cover border border-slate-300 bg-white shrink-0"
                        referrerPolicy="no-referrer"
                      />
                      <span className="text-[11px] font-semibold text-slate-700 truncate">
                        {kasLampiranFile?.name || 'Lampiran siap disimpan'}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setKasLampiranFile(null);
                        setKasLampiranPreview('');
                      }}
                      className="px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-rose-700 font-bold hover:bg-rose-50 cursor-pointer shrink-0"
                    >
                      Hapus
                    </button>
                  </div>
                ) : (
                  <label className="w-full px-3 py-2.5 rounded-xl border border-dashed border-slate-300 bg-slate-50 hover:bg-slate-100 text-slate-700 font-semibold flex items-center justify-center gap-2 cursor-pointer">
                    <ImagePlus className="w-4 h-4 text-emerald-700" />
                    <span>
                      {kasForm.metode_pembayaran === 'transfer'
                        ? 'Pilih / Unggah Bukti Transfer'
                        : 'Pilih / Unggah Scan Nota Pembelian'}
                    </span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (!f) return;
                        setKasLampiranFile(f);
                        const r = new FileReader();
                        r.onload = () => setKasLampiranPreview(String(r.result || ''));
                        r.readAsDataURL(f);
                      }}
                      className="hidden"
                    />
                  </label>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowKasModal(false)}
                  className="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-100 font-semibold"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={savingKas}
                  className="px-4 py-2 rounded-xl bg-emerald-800 hover:bg-emerald-900 text-white font-bold"
                >
                  {savingKas ? 'Menyimpan...' : 'Simpan Transaksi Kas'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* ==================================================================
            MODAL PENCAIRAN KOLEKTIF BISYAROH PENGURUS
        ================================================================== */}
        {canEditKeuangan && canViewBisyaroh && showBisyarohModal && (
          <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-2xl w-full max-h-[88vh] flex flex-col text-xs overflow-hidden">
              <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-indigo-950 text-white">
                <div>
                  <h3 className="text-sm font-extrabold">Pencairan Kolektif Bisyaroh Pengurus</h3>
                  <p className="text-[11px] text-indigo-200">
                    Terhubung otomatis dengan data nominal bisyaroh pada Modul Data Pengurus.
                  </p>
                </div>
                <button onClick={() => setShowBisyarohModal(false)} className="text-indigo-200 hover:text-white">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-3 bg-slate-50 border-b border-slate-200 grid grid-cols-1 sm:grid-cols-4 gap-2">
                <div>
                  <label className="text-[10px] font-bold text-slate-600 block">Bulan Bisyaroh</label>
                  <input
                    type="text"
                    value={bisyarohBulanLabel}
                    onChange={(e) => setBisyarohBulanLabel(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg font-bold"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-600 block">Tanggal Cair</label>
                  <input
                    type="date"
                    value={bisyarohTgl}
                    onChange={(e) => setBisyarohTgl(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-600 block">Sumber Dompet</label>
                  <select
                    value={bisyarohDompet}
                    onChange={(e) => setBisyarohDompet(e.target.value as DompetType)}
                    className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg font-semibold"
                  >
                    <option value="operasional">Syahriyah &amp; Tahunan</option>
                    <option value="mda">Dompet MDA</option>
                    <option value="kas_pondok">Dompet Kas</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-600 block">Metode</label>
                  <select
                    value={bisyarohMetode}
                    onChange={(e) => setBisyarohMetode(e.target.value as 'tunai' | 'transfer')}
                    className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg font-semibold"
                  >
                    <option value="tunai">Tunai</option>
                    <option value="transfer">Transfer</option>
                  </select>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
                {pengurusList.length === 0 ? (
                  <div className="p-8 text-center text-slate-400">
                    Belum ada data pengurus aktif di database.
                  </div>
                ) : (
                  pengurusList.map((pg) => {
                    const st = selectedPengurusBisyaroh[pg.id] || {
                      checked: false,
                      nominal: Number(pg.nominal_bisyaroh || 0),
                    };
                    const jabatanUtama =
                      pg.jabatan_list?.find((j) => j.is_utama)?.nama_jabatan ||
                      pg.jabatan_list?.[0]?.nama_jabatan ||
                      'Pengurus';
                    return (
                      <div key={pg.id} className="px-4 py-2.5 flex items-center justify-between gap-3">
                        <label className="flex items-center gap-2.5 cursor-pointer min-w-0">
                          <input
                            type="checkbox"
                            checked={st.checked}
                            onChange={(e) =>
                              setSelectedPengurusBisyaroh((prev) => ({
                                ...prev,
                                [pg.id]: { ...st, checked: e.target.checked },
                              }))
                            }
                            className="w-4 h-4 accent-indigo-700"
                          />
                          <div className="min-w-0">
                            <p className="font-bold text-slate-900 truncate">{pg.nama_lengkap}</p>
                            <p className="text-[10.5px] text-slate-500 truncate">{jabatanUtama}</p>
                          </div>
                        </label>

                        <input
                          type="number"
                          value={st.nominal}
                          onChange={(e) =>
                            setSelectedPengurusBisyaroh((prev) => ({
                              ...prev,
                              [pg.id]: { ...st, nominal: Number(e.target.value) },
                            }))
                          }
                          className="w-32 px-2.5 py-1 bg-slate-50 border border-slate-300 rounded-lg text-right font-bold"
                        />
                      </div>
                    );
                  })
                )}
              </div>

              <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
                <div>
                  <span className="text-[10px] text-slate-500 block uppercase font-bold">Total Pencairan</span>
                  <span className="text-base font-extrabold text-indigo-950">
                    {formatRupiah(totalBisyarohDipilih)}
                  </span>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setShowBisyarohModal(false)}
                    className="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-200 font-semibold"
                  >
                    Batal
                  </button>
                  <button
                    type="button"
                    disabled={savingBisyaroh || totalBisyarohDipilih <= 0}
                    onClick={handleCairkanBisyarohKolektif}
                    className="px-4 py-2 rounded-xl bg-indigo-700 hover:bg-indigo-800 text-white font-bold"
                  >
                    {savingBisyaroh ? 'Memproses...' : 'Catat Pengeluaran Bisyaroh'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
        {/* ==================================================================
            MODAL PILIH SANTRI KHUSUS TAMPILAN MOBILE (<LG)
        ================================================================== */}
        {mobileSantriPickerOpen && (
          <div className="fixed inset-0 z-50 lg:hidden bg-slate-950/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4">
            <div className="bg-white w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl border border-slate-200 shadow-2xl max-h-[85vh] flex flex-col overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between bg-emerald-900 text-white">
                <div>
                  <h3 className="text-sm font-bold">Pilih Santri Pembayaran</h3>
                  <p className="text-[11px] text-emerald-200">
                    {filteredLoketSantri.length} santri aktif tersedia
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setMobileSantriPickerOpen(false)}
                  aria-label="Tutup daftar santri"
                  className="p-1.5 rounded-lg text-emerald-100 hover:bg-emerald-800"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-3 border-b border-slate-200 space-y-2 bg-slate-50">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={loketSearch}
                    onChange={(e) => setLoketSearch(e.target.value)}
                    placeholder="Cari nama santri / NIS..."
                    className="w-full pl-8 pr-3 py-2 text-xs bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-emerald-600"
                  />
                </div>
                <select
                  value={loketKamarFilter}
                  onChange={(e) => setLoketKamarFilter(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-xl font-semibold text-slate-700 focus:outline-none focus:border-emerald-600"
                >
                  <option value="SEMUA">
                    Semua Kamar ({santriList.filter((s) => s.status !== 'boyong' && s.status !== 'alumni' && s.status !== 'pindah_al_burhany').length} Santri)
                  </option>
                  {allKamarOptions.map((km) => (
                    <option key={km} value={km}>
                      Kamar {km}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex-1 overflow-y-auto p-2.5 space-y-1.5">
                {filteredLoketSantri.length === 0 ? (
                  <div className="text-center py-10 text-xs text-slate-400">
                    Santri tidak ditemukan.
                  </div>
                ) : (
                  filteredLoketSantri.map((s) => {
                    const isSelected = activeSantri?.id === s.id;
                    const vip = isSantriVip(s);
                    const ndalem = s.status === 'ndalem';
                    const hasKtl = Number(s.ktl_nominal || 0) > 0;
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => {
                          setSelectedSantriId(s.id);
                          setMobileSantriPickerOpen(false);
                        }}
                        className={`w-full text-left p-2.5 rounded-xl border transition-all ${
                          isSelected
                            ? 'bg-emerald-800 text-white border-emerald-800 shadow-xs'
                            : 'bg-white hover:bg-emerald-50/60 border-slate-200 text-slate-800'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-bold text-xs truncate">{s.nama_lengkap}</span>
                          <span
                            className={`text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 ${
                              isSelected ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-700'
                            }`}
                          >
                            {s.kamar}
                          </span>
                        </div>
                        <div className="flex items-center justify-between mt-1 text-[10.5px]">
                          <span className={isSelected ? 'text-emerald-200' : 'text-slate-500'}>
                            NIS: {s.nis}
                          </span>
                          <div className="flex items-center gap-1">
                            {hasKtl && (
                              <span className="px-1.5 py-0.2 rounded bg-amber-500 text-white font-bold text-[9.5px]">
                                KTL
                              </span>
                            )}
                            <span
                              className={`px-1.5 py-0.2 rounded font-bold text-[9.5px] ${
                                isSelected
                                  ? 'bg-emerald-950 text-emerald-300'
                                  : ndalem
                                  ? 'bg-purple-100 text-purple-800'
                                  : vip
                                  ? 'bg-amber-100 text-amber-800'
                                  : 'bg-emerald-100 text-emerald-800'
                              }`}
                            >
                              {ndalem ? 'NDALEM' : vip ? 'VIP' : 'REGULER'}
                            </span>
                          </div>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        )}

        {/* HIDDEN INPUT UNGGAH SUSULAN BUKTI TRANSFER / NOTA */}
        <input
          ref={quickAttachInputRef}
          type="file"
          accept="image/*"
          onChange={handleQuickAttachChange}
          className="hidden"
        />

        {/* MODAL LIGHTBOX LIHAT FOTO BUKTI TRANSFER / SCAN NOTA PEMBELIAN */}
        {lightboxLampiran && (
          <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-2xl w-full overflow-hidden flex flex-col max-h-[90vh]">
              <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="text-sm font-extrabold text-slate-900 truncate">
                    {lightboxLampiran.title}
                  </h3>
                  <p className="text-[11px] text-slate-500 truncate">{lightboxLampiran.subtitle}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setLightboxLampiran(null)}
                  aria-label="Tutup pratinjau lampiran"
                  className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-4 bg-slate-100 flex-1 overflow-auto flex items-center justify-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={lightboxLampiran.url}
                  alt={lightboxLampiran.title}
                  className="max-h-[65vh] max-w-full object-contain rounded-lg border border-slate-300 bg-white shadow-xs"
                  referrerPolicy="no-referrer"
                />
              </div>

              <div className="px-4 py-3 border-t border-slate-200 bg-white flex flex-wrap items-center justify-between gap-2 text-xs">
                {canEditKeuangan ? (
                  <button
                    type="button"
                    onClick={() => {
                      setQuickAttachTarget({
                        txId: lightboxLampiran.txId,
                        noKuitansi: lightboxLampiran.noKuitansi,
                        kind: lightboxLampiran.title.toLowerCase().includes('transfer')
                          ? 'bukti_tf'
                          : 'nota',
                      });
                      quickAttachInputRef.current?.click();
                    }}
                    className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    Ganti Foto
                  </button>
                ) : (
                  <span className="text-slate-500">Mode Hanya Lihat</span>
                )}

                <button
                  type="button"
                  onClick={() => setLightboxLampiran(null)}
                  className="px-4 py-2 rounded-xl bg-emerald-800 hover:bg-emerald-900 text-white font-bold cursor-pointer"
                >
                  Tutup
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}