'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { useAuth, TransparencyBanner } from '@/lib/auth';
import * as XLSX from 'xlsx';
import {
  HeartPulse,
  Plus,
  Search,
  Printer,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  RefreshCw,
  X,
  MessageCircle,
  Copy,
  Info,
  Trash2,
  UserCheck,
  Stethoscope,
  Pill,
  Megaphone,
  FileText,
  PackagePlus,
  Thermometer,
  Calendar,
} from 'lucide-react';

type StatusSakitDb = 'rawat_uks' | 'dirujuk' | 'sembuh';
type LokasiPerawatan = 'Kamar' | 'Poskestren' | 'Klinik / Puskesmas' | 'Rumah Sakit';
type ActiveTab = 'pantauan' | 'obat' | 'penyuluhan' | 'rekap';
type FilterStatus = 'semua' | 'rawat_uks' | 'dirujuk' | 'sembuh';
type KategoriObat = 'Obat Bebas' | 'P3K & Luka' | 'Kulit & Salep' | 'Vitamin & Suplemen';
type StatusPenyuluhan = 'terjadwal' | 'terlaksana';

interface SantriRow {
  id: string;
  nis: string;
  nama_lengkap: string;
  kamar: string;
  status: string;
  nama_ayah?: string;
  no_wa_ayah?: string;
  nama_ibu?: string;
  no_wa_ibu?: string;
  nama_wali?: string;
  no_wa_wali?: string;
}

interface PengurusRow {
  id: string;
  nama_lengkap: string;
  status?: string;
}

interface PengaturanRow {
  nama_pesantren: string;
  alamat_lengkap: string;
  no_telepon: string;
  email_resmi?: string;
  logo_url?: string;
  stempel_url?: string;
  nama_pengasuh?: string;
  ttd_pengasuh_url?: string;
  nama_kepala_pondok?: string;
  ttd_kepala_pondok_url?: string;
}

interface ObatDiberikanItem {
  obatId?: string;
  nama: string;
  dosis: string;
  qty: number;
}

interface KesehatanMeta {
  lk: LokasiPerawatan;
  sh: string; // suhu tubuh
  tn: string; // tensi
  ob: ObatDiberikanItem[];
  rj: string; // tempat rujukan
  cr: string; // catatan perkembangan / rujukan
  by: number; // biaya berobat luar / obat (terisolasi di Kesehatan)
  pp: boolean; // sudah diperiksa di Poskestren
  wl: boolean; // sudah dilaporkan ke Wali via WA
  pt: string; // nama petugas Sie Kesehatan
  ns: string; // nomor surat keterangan sakit / rujukan
}

interface SakitRecordRaw {
  id: string;
  santri_id: string;
  tgl_sakit: string;
  tgl_sembuh: string | null;
  keluhan: string;
  diagnosa: string | null;
  tindakan: string | null;
  status: StatusSakitDb;
  created_at?: string;
}

interface SakitViewItem extends SakitRecordRaw {
  santri?: SantriRow;
  meta: KesehatanMeta;
  tindakanTeks: string;
  durasiHari: number;
}

interface ObatItem {
  id: string;
  nama_obat: string;
  kategori: KategoriObat;
  satuan: string;
  stok: number;
  stok_minimum: number;
  harga_satuan: number;
  kadaluarsa: string;
  keterangan: string;
}

interface PenyuluhanItem {
  id: string;
  tanggal: string;
  judul: string;
  narasumber: string;
  sasaran: string;
  jumlah_peserta: number;
  status: StatusPenyuluhan;
  ringkasan: string;
}

interface ToastState {
  id: number;
  type: 'success' | 'error' | 'info';
  title: string;
  message: string;
}

const META_PREFIX = '[KESEHATAN_META:';
const META_SUFFIX = ']';
const LS_OBAT_KEY = 'siap_poskestren_obat_v1';
const LS_PENYULUHAN_KEY = 'siap_poskestren_penyuluhan_v1';

const MASTER_KAMAR_ORDER = [
  'A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7', 'A8', 'A9', 'A10',
  'C1', 'C2', 'C3', 'C4', 'C5', 'C6',
  'Al-Fachriyah 1 (VIP)',
  'Al-Fachriyah 2 (VIP)',
  'Al-Fachriyah 3 (VIP)',
  'Al-Fachriyah 4 (VIP)',
  'NDALEM',
];

const OPTIONAL_TABLES_SQL = `CREATE TABLE IF NOT EXISTS poskestren_obat (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  nama_obat text NOT NULL,
  kategori text NOT NULL DEFAULT 'Obat Bebas',
  satuan text NOT NULL DEFAULT 'tablet',
  stok integer NOT NULL DEFAULT 0,
  stok_minimum integer NOT NULL DEFAULT 5,
  harga_satuan integer NOT NULL DEFAULT 0,
  kadaluarsa text DEFAULT '',
  keterangan text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS poskestren_penyuluhan (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tanggal date NOT NULL,
  judul text NOT NULL,
  narasumber text DEFAULT 'Poskestren & Puskesmas Bululawang',
  sasaran text DEFAULT 'Seluruh Santri',
  jumlah_peserta integer DEFAULT 0,
  status text NOT NULL DEFAULT 'terjadwal',
  ringkasan text DEFAULT '',
  created_at timestamptz DEFAULT now()
);`;

const STARTER_OBAT_P3K: Omit<ObatItem, 'id'>[] = [
  {
    nama_obat: 'Paracetamol 500mg',
    kategori: 'Obat Bebas',
    satuan: 'tablet',
    stok: 50,
    stok_minimum: 15,
    harga_satuan: 500,
    kadaluarsa: '2027-12-31',
    keterangan: 'Penurun demam & pereda nyeri',
  },
  {
    nama_obat: 'Oralit Sachet',
    kategori: 'Obat Bebas',
    satuan: 'sachet',
    stok: 30,
    stok_minimum: 10,
    harga_satuan: 1500,
    kadaluarsa: '2027-10-31',
    keterangan: 'Rehidrasi diare / mual muntah',
  },
  {
    nama_obat: 'Salep Scabimite / Kulit',
    kategori: 'Kulit & Salep',
    satuan: 'tube',
    stok: 12,
    stok_minimum: 4,
    harga_satuan: 18000,
    kadaluarsa: '2027-08-31',
    keterangan: 'Penanganan gatal / keluhan kulit santri',
  },
  {
    nama_obat: 'Povidone Iodine / Antiseptik + Kasa',
    kategori: 'P3K & Luka',
    satuan: 'paket',
    stok: 15,
    stok_minimum: 5,
    harga_satuan: 8000,
    kadaluarsa: '2028-01-31',
    keterangan: 'Pembersih luka luar ringan',
  },
  {
    nama_obat: 'Vitamin C / Multivitamin',
    kategori: 'Vitamin & Suplemen',
    satuan: 'tablet',
    stok: 40,
    stok_minimum: 10,
    harga_satuan: 1000,
    kadaluarsa: '2027-11-30',
    keterangan: 'Pemulihan daya tahan tubuh santri',
  },
];

function getKamarSortWeight(kamar: string): number {
  const idx = MASTER_KAMAR_ORDER.findIndex(
    (k) => k.toLowerCase() === (kamar || '').trim().toLowerCase()
  );
  return idx >= 0 ? idx : 999;
}

function getLocalTodayStr(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function diffDaysIso(startIso: string, endIso: string): number {
  if (!startIso || !endIso) return 0;
  const sParts = startIso.split('-').map((v) => parseInt(v, 10));
  const eParts = endIso.split('-').map((v) => parseInt(v, 10));
  if (sParts.length !== 3 || eParts.length !== 3) return 0;
  const sDate = new Date(sParts[0], sParts[1] - 1, sParts[2]);
  const eDate = new Date(eParts[0], eParts[1] - 1, eParts[2]);
  return Math.max(0, Math.round((eDate.getTime() - sDate.getTime()) / (1000 * 60 * 60 * 24)));
}

function formatTanggalIndo(dateStr?: string | null): string {
  if (!dateStr) return '-';
  const bulan = [
    'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
  ];
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  const [y, m, d] = parts;
  const namaBulan = bulan[parseInt(m, 10) - 1] || m;
  return `${parseInt(d, 10)} ${namaBulan} ${y}`;
}

function formatRupiah(nominal: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(nominal || 0);
}

function formatWaNumber(raw?: string): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, '');
  if (!digits) return null;
  if (digits.startsWith('62')) return digits;
  if (digits.startsWith('0')) return `62${digits.slice(1)}`;
  return `62${digits}`;
}

function getDefaultWali(s?: SantriRow): { nama: string; wa: string } {
  if (!s) return { nama: '', wa: '' };
  const nama = s.nama_wali || s.nama_ayah || s.nama_ibu || '';
  const wa = s.no_wa_wali || s.no_wa_ayah || s.no_wa_ibu || '';
  return { nama, wa };
}

function createDefaultMeta(): KesehatanMeta {
  return {
    lk: 'Poskestren',
    sh: '',
    tn: '',
    ob: [],
    rj: '',
    cr: '',
    by: 0,
    pp: true,
    wl: false,
    pt: 'Sie Kesehatan Pondok',
    ns: '',
  };
}

function parseKesehatanTindakan(raw?: string | null): {
  meta: KesehatanMeta;
  tindakanTeks: string;
} {
  const val = (raw || '').trim();
  const base = createDefaultMeta();
  if (!val.startsWith(META_PREFIX)) {
    return { meta: base, tindakanTeks: val };
  }
  const endIdx = val.indexOf('}' + META_SUFFIX);
  if (endIdx < 0) {
    return { meta: base, tindakanTeks: val };
  }
  const jsonPart = val.slice(META_PREFIX.length, endIdx + 1);
  const textPart = val.slice(endIdx + 2).trim();
  try {
    const parsed = JSON.parse(jsonPart) as Partial<KesehatanMeta>;
    return {
      meta: {
        ...base,
        ...parsed,
        ob: Array.isArray(parsed.ob) ? parsed.ob : [],
        by: Number(parsed.by || 0),
        pp: parsed.pp !== undefined ? Boolean(parsed.pp) : true,
        wl: Boolean(parsed.wl),
      },
      tindakanTeks: textPart,
    };
  } catch {
    return { meta: base, tindakanTeks: val };
  }
}

function encodeKesehatanTindakan(meta: KesehatanMeta, tindakanTeks: string): string {
  const cleanText = tindakanTeks.trim();
  const json = JSON.stringify(meta);
  return cleanText
    ? `${META_PREFIX}${json}${META_SUFFIX} ${cleanText}`
    : `${META_PREFIX}${json}${META_SUFFIX}`;
}

function extractSupabaseError(err: unknown, fallback: string): string {
  if (err instanceof Error) return err.message || fallback;
  if (err && typeof err === 'object' && 'message' in err) {
    const msg = (err as { message?: unknown }).message;
    if (typeof msg === 'string' && msg) return msg;
  }
  return fallback;
}

function isMissingRelationError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const code = 'code' in err ? String((err as { code?: unknown }).code || '') : '';
  const msg = 'message' in err ? String((err as { message?: unknown }).message || '') : '';
  return (
    code === 'PGRST205' ||
    code === '42P01' ||
    msg.includes('Could not find the table') ||
    msg.includes('does not exist')
  );
}

function createLocalId(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export default function KesehatanPage() {
  const { canEditModule, pengurus } = useAuth();
  const canEdit = canEditModule('kesehatan');

  const [activeTab, setActiveTab] = useState<ActiveTab>('pantauan');
  const [todayStr, setTodayStr] = useState<string>('');

  const [santriList, setSantriList] = useState<SantriRow[]>([]);
  const [pengurusList, setPengurusList] = useState<PengurusRow[]>([]);
  const [sakitList, setSakitList] = useState<SakitRecordRaw[]>([]);
  const [obatList, setObatList] = useState<ObatItem[]>([]);
  const [penyuluhanList, setPenyuluhanList] = useState<PenyuluhanItem[]>([]);
  const [obatLocalFallback, setObatLocalFallback] = useState<boolean>(false);
  const [penyuluhanLocalFallback, setPenyuluhanLocalFallback] = useState<boolean>(false);
  const [showSqlHelper, setShowSqlHelper] = useState<boolean>(false);

  const [pengaturan, setPengaturan] = useState<PengaturanRow>({
    nama_pesantren: 'Pondok Pesantren An-Nur 1 Bululawang',
    alamat_lengkap: 'Jl. Diponegoro IV / 2-6 Bululawang, Kab. Malang, Jawa Timur',
    no_telepon: '085604551562',
    email_resmi: 'annur1bululawang@gmail.com',
    logo_url: '',
    stempel_url: '',
    nama_pengasuh: 'DR. KH. A. Fahrur Rozi',
    ttd_pengasuh_url: '',
    nama_kepala_pondok: 'Ust. M. Fajar Wahyudi',
    ttd_kepala_pondok_url: '',
  });

  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [toasts, setToasts] = useState<ToastState[]>([]);

  // Filter Pantauan & Rekap
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [filterKamar, setFilterKamar] = useState<string>('SEMUA');
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('semua');
  const [obatSearch, setObatSearch] = useState<string>('');
  const [rekapStartDate, setRekapStartDate] = useState<string>('');
  const [rekapEndDate, setRekapEndDate] = useState<string>('');

  // Modal Catat / Periksa Santri Sakit
  const [showSakitModal, setShowSakitModal] = useState<boolean>(false);
  const [editingSakit, setEditingSakit] = useState<SakitViewItem | null>(null);
  const [santriSearch, setSantriSearch] = useState<string>('');
  const [santriDropdownOpen, setSantriDropdownOpen] = useState<boolean>(false);
  const [formSantriId, setFormSantriId] = useState<string>('');
  const [formTglSakit, setFormTglSakit] = useState<string>('');
  const [formKeluhan, setFormKeluhan] = useState<string>('');
  const [formDiagnosa, setFormDiagnosa] = useState<string>('');
  const [formLokasi, setFormLokasi] = useState<LokasiPerawatan>('Poskestren');
  const [formSuhu, setFormSuhu] = useState<string>('');
  const [formTensi, setFormTensi] = useState<string>('');
  const [formTindakanText, setFormTindakanText] = useState<string>('');
  const [formPeriksaPoskestren, setFormPeriksaPoskestren] = useState<boolean>(true);
  const [formStatus, setFormStatus] = useState<StatusSakitDb>('rawat_uks');
  const [formTglSembuh, setFormTglSembuh] = useState<string>('');
  const [formTempatRujukan, setFormTempatRujukan] = useState<string>('');
  const [formCatatanRujukan, setFormCatatanRujukan] = useState<string>('');
  const [formBiaya, setFormBiaya] = useState<string>('0');
  const [formPetugasText, setFormPetugasText] = useState<string>('');
  const [petugasDropdownOpen, setPetugasDropdownOpen] = useState<boolean>(false);
  const [formObatItems, setFormObatItems] = useState<ObatDiberikanItem[]>([]);
  const [selectedObatIdToAdd, setSelectedObatIdToAdd] = useState<string>('');
  const [customObatName, setCustomObatName] = useState<string>('');
  const [customObatDosis, setCustomObatDosis] = useState<string>('3x1 sesudah makan');
  const [customObatQty, setCustomObatQty] = useState<string>('1');

  // Modal Obat Poskestren
  const [showObatModal, setShowObatModal] = useState<boolean>(false);
  const [editingObat, setEditingObat] = useState<ObatItem | null>(null);
  const [obatNama, setObatNama] = useState<string>('');
  const [obatKategori, setObatKategori] = useState<KategoriObat>('Obat Bebas');
  const [obatSatuan, setObatSatuan] = useState<string>('tablet');
  const [obatStok, setObatStok] = useState<string>('20');
  const [obatMin, setObatMin] = useState<string>('5');
  const [obatHarga, setObatHarga] = useState<string>('0');
  const [obatKadaluarsa, setObatKadaluarsa] = useState<string>('');
  const [obatKet, setObatKet] = useState<string>('');

  // Modal Penyuluhan
  const [showPenyuluhanModal, setShowPenyuluhanModal] = useState<boolean>(false);
  const [editingPenyuluhan, setEditingPenyuluhan] = useState<PenyuluhanItem | null>(null);
  const [pyTanggal, setPyTanggal] = useState<string>('');
  const [pyJudul, setPyJudul] = useState<string>('');
  const [pyNarasumber, setPyNarasumber] = useState<string>('Poskestren & Puskesmas Bululawang');
  const [pySasaran, setPySasaran] = useState<string>('Seluruh Santri');
  const [pyPeserta, setPyPeserta] = useState<string>('0');
  const [pyStatus, setPyStatus] = useState<StatusPenyuluhan>('terjadwal');
  const [pyRingkasan, setPyRingkasan] = useState<string>('');

  // Modal Pratinjau Surat Keterangan Sakit / Rujukan & Hapus
  const [printTarget, setPrintTarget] = useState<SakitViewItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SakitViewItem | null>(null);
  const [deleting, setDeleting] = useState<boolean>(false);

  const showToast = useCallback((type: ToastState['type'], title: string, message: string) => {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    setToasts((prev) => [...prev, { id, type, title, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((item) => item.id !== id));
    }, 4500);
  }, []);

  useEffect(() => {
    let active = true;
    Promise.resolve().then(() => {
      if (!active) return;
      const t = getLocalTodayStr();
      setTodayStr(t);
      setRekapStartDate((prev) => prev || `${t.slice(0, 7)}-01`);
      setRekapEndDate((prev) => prev || t);
    });
    return () => {
      active = false;
    };
  }, []);

  const readLocalObat = useCallback((): ObatItem[] => {
    if (typeof window === 'undefined') return [];
    try {
      const raw = window.localStorage.getItem(LS_OBAT_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as ObatItem[]) : [];
    } catch {
      return [];
    }
  }, []);

  const writeLocalObat = useCallback((items: ObatItem[]) => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(LS_OBAT_KEY, JSON.stringify(items));
    } catch {
      // ignore storage quota failure
    }
  }, []);

  const readLocalPenyuluhan = useCallback((): PenyuluhanItem[] => {
    if (typeof window === 'undefined') return [];
    try {
      const raw = window.localStorage.getItem(LS_PENYULUHAN_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as PenyuluhanItem[]) : [];
    } catch {
      return [];
    }
  }, []);

  const writeLocalPenyuluhan = useCallback((items: PenyuluhanItem[]) => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(LS_PENYULUHAN_KEY, JSON.stringify(items));
    } catch {
      // ignore storage quota failure
    }
  }, []);

  const fetchAllData = useCallback(async () => {
    const [santriRes, pengurusRes, sakitRes, pengaturanRes, obatRes, pyRes] = await Promise.all([
      supabase
        .from('santri')
        .select(
          'id, nis, nama_lengkap, kamar, status, nama_ayah, no_wa_ayah, nama_ibu, no_wa_ibu, nama_wali, no_wa_wali'
        )
        .in('status', ['aktif', 'ndalem', 'beasiswa_lazis']),
      supabase.from('pengurus').select('id, nama_lengkap, status').eq('status', 'aktif'),
      supabase.from('santri_sakit').select('*').order('tgl_sakit', { ascending: false }),
      supabase.from('pengaturan_aplikasi').select('*').limit(1).maybeSingle(),
      supabase.from('poskestren_obat').select('*').order('nama_obat', { ascending: true }),
      supabase.from('poskestren_penyuluhan').select('*').order('tanggal', { ascending: false }),
    ]);

    if (santriRes.error) throw santriRes.error;
    if (sakitRes.error) throw sakitRes.error;

    const sortedSantri = ((santriRes.data || []) as SantriRow[]).sort((a, b) => {
      const wa = getKamarSortWeight(a.kamar);
      const wb = getKamarSortWeight(b.kamar);
      if (wa !== wb) return wa - wb;
      const kc = (a.kamar || '').localeCompare(b.kamar || '', 'id', { numeric: true });
      if (kc !== 0) return kc;
      return (a.nama_lengkap || '').localeCompare(b.nama_lengkap || '', 'id');
    });

    const sortedPengurus = ((pengurusRes.data || []) as PengurusRow[]).sort((a, b) =>
      (a.nama_lengkap || '').localeCompare(b.nama_lengkap || '', 'id')
    );

    const isObatMissing = Boolean(obatRes.error && isMissingRelationError(obatRes.error));
    const isPyMissing = Boolean(pyRes.error && isMissingRelationError(pyRes.error));

    return {
      santri: sortedSantri,
      pengurus: sortedPengurus,
      sakit: (sakitRes.data || []) as SakitRecordRaw[],
      pengaturan: (pengaturanRes.data || null) as Partial<PengaturanRow> | null,
      obat: isObatMissing ? readLocalObat() : ((obatRes.data || []) as ObatItem[]),
      penyuluhan: isPyMissing
        ? readLocalPenyuluhan()
        : ((pyRes.data || []) as PenyuluhanItem[]),
      obatLocal: isObatMissing,
      pyLocal: isPyMissing,
    };
  }, [readLocalObat, readLocalPenyuluhan]);

  const handleReload = async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const res = await fetchAllData();
      setSantriList(res.santri);
      setPengurusList(res.pengurus);
      setSakitList(res.sakit);
      setObatList(res.obat);
      setPenyuluhanList(res.penyuluhan);
      setObatLocalFallback(res.obatLocal);
      setPenyuluhanLocalFallback(res.pyLocal);
      if (res.pengaturan) {
        setPengaturan((prev) => ({ ...prev, ...res.pengaturan }));
      }
    } catch (err: unknown) {
      const msg = extractSupabaseError(err, 'Gagal memuat data kesehatan santri.');
      setFetchError(msg);
      showToast('error', 'Gagal Memuat Data', msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let active = true;
    fetchAllData()
      .then((res) => {
        if (!active) return;
        setFetchError(null);
        setSantriList(res.santri);
        setPengurusList(res.pengurus);
        setSakitList(res.sakit);
        setObatList(res.obat);
        setPenyuluhanList(res.penyuluhan);
        setObatLocalFallback(res.obatLocal);
        setPenyuluhanLocalFallback(res.pyLocal);
        if (res.pengaturan) {
          setPengaturan((prev) => ({ ...prev, ...res.pengaturan }));
        }
      })
      .catch((err: unknown) => {
        if (!active) return;
        setFetchError(extractSupabaseError(err, 'Gagal memuat data kesehatan santri.'));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [fetchAllData]);

  const viewItems = useMemo<SakitViewItem[]>(() => {
    const santriMap = new Map(santriList.map((s) => [s.id, s]));
    return sakitList.map((row) => {
      const { meta, tindakanTeks } = parseKesehatanTindakan(row.tindakan);
      const endDate =
        row.status === 'sembuh' ? row.tgl_sembuh || row.tgl_sakit : todayStr || row.tgl_sakit;
      const durasiHari = Math.max(1, diffDaysIso(row.tgl_sakit, endDate) + 1);
      return {
        ...row,
        santri: santriMap.get(row.santri_id),
        meta,
        tindakanTeks,
        durasiHari,
      };
    });
  }, [sakitList, santriList, todayStr]);

  const kamarOptions = useMemo(() => {
    const set = new Set<string>();
    for (const s of santriList) {
      if (s.kamar) set.add(s.kamar);
    }
    return Array.from(set).sort((a, b) => {
      const wa = getKamarSortWeight(a);
      const wb = getKamarSortWeight(b);
      if (wa !== wb) return wa - wb;
      return a.localeCompare(b, 'id', { numeric: true });
    });
  }, [santriList]);

  const kpiStats = useMemo(() => {
    const monthPrefix = todayStr ? todayStr.slice(0, 7) : '';
    let dirawatUks = 0;
    let dirujuk = 0;
    let sembuhBulanIni = 0;
    let totalBiaya = 0;

    for (const item of viewItems) {
      totalBiaya += Number(item.meta.by || 0);
      if (item.status === 'rawat_uks') dirawatUks += 1;
      else if (item.status === 'dirujuk') dirujuk += 1;
      else if (item.status === 'sembuh') {
        const refDate = item.tgl_sembuh || item.tgl_sakit || '';
        if (!monthPrefix || refDate.startsWith(monthPrefix)) sembuhBulanIni += 1;
      }
    }

    const obatMenipis = obatList.filter((o) => o.stok <= o.stok_minimum).length;

    return {
      dirawatUks,
      dirujuk,
      sembuhBulanIni,
      totalBiaya,
      obatMenipis,
    };
  }, [viewItems, obatList, todayStr]);

  const filteredItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return viewItems.filter((item) => {
      const kamar = item.santri?.kamar || '';
      const nama = item.santri?.nama_lengkap || '';
      const nis = item.santri?.nis || '';

      const matchKamar = filterKamar === 'SEMUA' || kamar === filterKamar;
      const matchStatus = filterStatus === 'semua' || item.status === filterStatus;
      const matchSearch =
        !q ||
        nama.toLowerCase().includes(q) ||
        String(nis).toLowerCase().includes(q) ||
        (item.keluhan || '').toLowerCase().includes(q) ||
        (item.diagnosa || '').toLowerCase().includes(q) ||
        (item.meta.rj || '').toLowerCase().includes(q);

      return matchKamar && matchStatus && matchSearch;
    });
  }, [viewItems, searchQuery, filterKamar, filterStatus]);

  const rekapFilteredItems = useMemo(() => {
    return filteredItems.filter((item) => {
      if (rekapStartDate && item.tgl_sakit < rekapStartDate) return false;
      if (rekapEndDate && item.tgl_sakit > rekapEndDate) return false;
      return true;
    });
  }, [filteredItems, rekapStartDate, rekapEndDate]);

  const rekapSummary = useMemo(() => {
    let dirawat = 0;
    let dirujuk = 0;
    let sembuh = 0;
    let totalBiaya = 0;
    const keluhanCounter = new Map<string, number>();

    for (const item of rekapFilteredItems) {
      if (item.status === 'rawat_uks') dirawat += 1;
      else if (item.status === 'dirujuk') dirujuk += 1;
      else sembuh += 1;
      totalBiaya += Number(item.meta.by || 0);
      const label = (item.diagnosa || item.keluhan || 'Lainnya').trim();
      keluhanCounter.set(label, (keluhanCounter.get(label) || 0) + 1);
    }

    const topKeluhan = Array.from(keluhanCounter.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4);

    return {
      total: rekapFilteredItems.length,
      dirawat,
      dirujuk,
      sembuh,
      totalBiaya,
      topKeluhan,
    };
  }, [rekapFilteredItems]);

  const filteredObat = useMemo(() => {
    const q = obatSearch.trim().toLowerCase();
    if (!q) return obatList;
    return obatList.filter(
      (o) =>
        o.nama_obat.toLowerCase().includes(q) ||
        o.kategori.toLowerCase().includes(q) ||
        (o.keterangan || '').toLowerCase().includes(q)
    );
  }, [obatList, obatSearch]);

  const selectableSantri = useMemo(() => {
    const q = santriSearch.trim().toLowerCase();
    if (!q) return santriList;
    return santriList.filter(
      (s) =>
        s.nama_lengkap.toLowerCase().includes(q) ||
        String(s.nis || '').toLowerCase().includes(q) ||
        String(s.kamar || '').toLowerCase().includes(q)
    );
  }, [santriList, santriSearch]);

  const selectedFormSantri = useMemo(
    () => santriList.find((s) => s.id === formSantriId) || null,
    [santriList, formSantriId]
  );

  const selectablePengurus = useMemo(() => {
    const q = formPetugasText.trim().toLowerCase();
    if (!q) return pengurusList;
    return pengurusList.filter((p) => p.nama_lengkap.toLowerCase().includes(q));
  }, [pengurusList, formPetugasText]);

  // ==========================
  // HANDLERS MODAL SAKIT & POSKESTREN
  // ==========================
  const openCreateSakitModal = () => {
    if (!canEdit) return;
    const baseDate = todayStr || getLocalTodayStr();
    setEditingSakit(null);
    setSantriSearch('');
    setSantriDropdownOpen(false);
    setFormSantriId('');
    setFormTglSakit(baseDate);
    setFormKeluhan('');
    setFormDiagnosa('');
    setFormLokasi('Poskestren');
    setFormSuhu('');
    setFormTensi('');
    setFormTindakanText('');
    setFormPeriksaPoskestren(true);
    setFormStatus('rawat_uks');
    setFormTglSembuh('');
    setFormTempatRujukan('');
    setFormCatatanRujukan('');
    setFormBiaya('0');
    setFormPetugasText(pengurus?.nama_lengkap || '');
    setPetugasDropdownOpen(false);
    setFormObatItems([]);
    setSelectedObatIdToAdd('');
    setCustomObatName('');
    setCustomObatDosis('3x1 sesudah makan');
    setCustomObatQty('1');
    setShowSakitModal(true);
  };

  const openEditSakitModal = (item: SakitViewItem) => {
    if (!canEdit) return;
    setEditingSakit(item);
    setSantriSearch(item.santri?.nama_lengkap || '');
    setSantriDropdownOpen(false);
    setFormSantriId(item.santri_id);
    setFormTglSakit(item.tgl_sakit);
    setFormKeluhan(item.keluhan || '');
    setFormDiagnosa(item.diagnosa || '');
    setFormLokasi(item.meta.lk || 'Poskestren');
    setFormSuhu(item.meta.sh || '');
    setFormTensi(item.meta.tn || '');
    setFormTindakanText(item.tindakanTeks || '');
    setFormPeriksaPoskestren(item.meta.pp);
    setFormStatus(item.status);
    setFormTglSembuh(item.tgl_sembuh || todayStr || getLocalTodayStr());
    setFormTempatRujukan(item.meta.rj || '');
    setFormCatatanRujukan(item.meta.cr || '');
    setFormBiaya(String(item.meta.by || 0));
    setFormPetugasText(item.meta.pt === 'Sie Kesehatan Pondok' ? '' : item.meta.pt);
    setPetugasDropdownOpen(false);
    setFormObatItems(item.meta.ob || []);
    setSelectedObatIdToAdd('');
    setCustomObatName('');
    setCustomObatDosis('3x1 sesudah makan');
    setCustomObatQty('1');
    setShowSakitModal(true);
  };

  const handleAddObatToForm = () => {
    const qty = Math.max(1, parseInt(customObatQty || '1', 10) || 1);
    if (selectedObatIdToAdd) {
      const found = obatList.find((o) => o.id === selectedObatIdToAdd);
      if (!found) return;
      setFormObatItems((prev) => [
        ...prev,
        {
          obatId: found.id,
          nama: found.nama_obat,
          dosis: customObatDosis.trim() || 'Sesuai arahan Poskestren',
          qty,
        },
      ]);
      setSelectedObatIdToAdd('');
      return;
    }
    if (customObatName.trim()) {
      setFormObatItems((prev) => [
        ...prev,
        {
          nama: customObatName.trim(),
          dosis: customObatDosis.trim() || 'Sesuai arahan Poskestren',
          qty,
        },
      ]);
      setCustomObatName('');
    }
  };

  const decrementObatStock = async (newlyGiven: ObatDiberikanItem[]) => {
    if (newlyGiven.length === 0) return;
    const updatedLocal = [...obatList];
    let changed = false;

    for (const given of newlyGiven) {
      if (!given.obatId) continue;
      const idx = updatedLocal.findIndex((o) => o.id === given.obatId);
      if (idx < 0) continue;
      const nextStok = Math.max(0, Number(updatedLocal[idx].stok || 0) - Number(given.qty || 1));
      updatedLocal[idx] = { ...updatedLocal[idx], stok: nextStok };
      changed = true;

      if (!obatLocalFallback) {
        await supabase
          .from('poskestren_obat')
          .update({ stok: nextStok })
          .eq('id', given.obatId);
      }
    }

    if (changed) {
      setObatList(updatedLocal);
      if (obatLocalFallback) {
        writeLocalObat(updatedLocal);
      }
    }
  };

  const handleSaveSakit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit) return;
    if (!formSantriId) {
      showToast('error', 'Santri Belum Dipilih', 'Pilih santri yang sakit atau diperiksa.');
      return;
    }
    if (!formKeluhan.trim()) {
      showToast('error', 'Keluhan Wajib Diisi', 'Tuliskan keluhan utama santri.');
      return;
    }

    setSaving(true);
    try {
      const typedPetugas = formPetugasText.trim();
      const matchedPetugas = typedPetugas
        ? pengurusList.find((p) => p.nama_lengkap.toLowerCase() === typedPetugas.toLowerCase())
        : undefined;
      const petugasFinal =
        matchedPetugas?.nama_lengkap || typedPetugas || 'Sie Kesehatan Pondok';

      const baseTgl = formTglSakit || todayStr || getLocalTodayStr();
      const monthPrefix = baseTgl.slice(0, 7).replace('-', '/');
      const seq = String(sakitList.length + 1).padStart(3, '0');
      const nomorSurat = editingSakit?.meta.ns || `SKS/${monthPrefix}/${seq}`;

      const meta: KesehatanMeta = {
        lk: formLokasi,
        sh: formSuhu.trim(),
        tn: formTensi.trim(),
        ob: formObatItems,
        rj: formStatus === 'dirujuk' ? formTempatRujukan.trim() : formTempatRujukan.trim(),
        cr: formCatatanRujukan.trim(),
        by: Math.max(0, parseInt(formBiaya || '0', 10) || 0),
        pp: formPeriksaPoskestren,
        wl: editingSakit?.meta.wl || false,
        pt: petugasFinal,
        ns: nomorSurat,
      };

      const payload = {
        santri_id: formSantriId,
        tgl_sakit: baseTgl,
        tgl_sembuh: formStatus === 'sembuh' ? formTglSembuh || todayStr || getLocalTodayStr() : null,
        keluhan: formKeluhan.trim(),
        diagnosa: formDiagnosa.trim() || null,
        tindakan: encodeKesehatanTindakan(meta, formTindakanText),
        status: formStatus,
      };

      if (editingSakit) {
        const { error } = await supabase
          .from('santri_sakit')
          .update(payload)
          .eq('id', editingSakit.id);
        if (error) throw error;

        // Kurangi stok hanya untuk obat yang baru ditambahkan saat edit
        const oldCount = editingSakit.meta.ob.length;
        const newlyAdded = formObatItems.slice(oldCount);
        await decrementObatStock(newlyAdded);

        showToast(
          'success',
          'Catatan Kesehatan Diperbarui',
          `Rekam medis ${selectedFormSantri?.nama_lengkap || 'santri'} berhasil diperbarui.`
        );
      } else {
        const { error } = await supabase.from('santri_sakit').insert(payload);
        if (error) throw error;

        await decrementObatStock(formObatItems);

        showToast(
          'success',
          'Santri Sakit Tercatat',
          `Data pemeriksaan ${selectedFormSantri?.nama_lengkap || 'santri'} tersimpan.`
        );
      }

      const refreshed = await fetchAllData();
      setSantriList(refreshed.santri);
      setPengurusList(refreshed.pengurus);
      setSakitList(refreshed.sakit);
      setShowSakitModal(false);
    } catch (err: unknown) {
      showToast(
        'error',
        'Gagal Menyimpan Rekam Sakit',
        extractSupabaseError(err, 'Gagal menyimpan catatan kesehatan santri.')
      );
    } finally {
      setSaving(false);
    }
  };

  const handleMarkSembuh = async (item: SakitViewItem) => {
    if (!canEdit) return;
    setSaving(true);
    try {
      const t = todayStr || getLocalTodayStr();
      const { error } = await supabase
        .from('santri_sakit')
        .update({
          status: 'sembuh',
          tgl_sembuh: t,
        })
        .eq('id', item.id);
      if (error) throw error;

      const refreshed = await fetchAllData();
      setSakitList(refreshed.sakit);
      showToast(
        'success',
        'Santri Dinyatakan Sembuh',
        `${item.santri?.nama_lengkap || 'Santri'} ditandai sembuh per ${formatTanggalIndo(t)}.`
      );
    } catch (err: unknown) {
      showToast('error', 'Gagal Memperbarui Status', extractSupabaseError(err, 'Terjadi kesalahan.'));
    } finally {
      setSaving(false);
    }
  };

  const handleMarkWaliNotified = async (item: SakitViewItem) => {
    if (!canEdit) return;
    try {
      const nextMeta: KesehatanMeta = { ...item.meta, wl: true };
      await supabase
        .from('santri_sakit')
        .update({ tindakan: encodeKesehatanTindakan(nextMeta, item.tindakanTeks) })
        .eq('id', item.id);
      const refreshed = await fetchAllData();
      setSakitList(refreshed.sakit);
    } catch {
      // non-blocking log update
    }
  };

  const handleDeleteSakit = async () => {
    if (!canEdit || !deleteTarget) return;
    setDeleting(true);
    try {
      const { error } = await supabase.from('santri_sakit').delete().eq('id', deleteTarget.id);
      if (error) throw error;
      const refreshed = await fetchAllData();
      setSakitList(refreshed.sakit);
      setDeleteTarget(null);
      showToast('info', 'Catatan Dihapus', 'Rekam kesehatan santri berhasil dihapus.');
    } catch (err: unknown) {
      showToast('error', 'Gagal Menghapus', extractSupabaseError(err, 'Terjadi kesalahan.'));
    } finally {
      setDeleting(false);
    }
  };

  // ==========================
  // HANDLERS OBAT POSKESTREN
  // ==========================
  const openCreateObatModal = () => {
    if (!canEdit) return;
    setEditingObat(null);
    setObatNama('');
    setObatKategori('Obat Bebas');
    setObatSatuan('tablet');
    setObatStok('20');
    setObatMin('5');
    setObatHarga('0');
    setObatKadaluarsa('');
    setObatKet('');
    setShowObatModal(true);
  };

  const openEditObatModal = (item: ObatItem) => {
    if (!canEdit) return;
    setEditingObat(item);
    setObatNama(item.nama_obat);
    setObatKategori(item.kategori);
    setObatSatuan(item.satuan);
    setObatStok(String(item.stok));
    setObatMin(String(item.stok_minimum));
    setObatHarga(String(item.harga_satuan));
    setObatKadaluarsa(item.kadaluarsa || '');
    setObatKet(item.keterangan || '');
    setShowObatModal(true);
  };

  const handleSeedStarterObat = async () => {
    if (!canEdit) return;
    setSaving(true);
    try {
      if (obatLocalFallback) {
        const seeded = STARTER_OBAT_P3K.map((o) => ({
          ...o,
          id: createLocalId('obat'),
        }));
        const next = [...obatList, ...seeded];
        setObatList(next);
        writeLocalObat(next);
      } else {
        const { error } = await supabase.from('poskestren_obat').insert(STARTER_OBAT_P3K);
        if (error) throw error;
        const refreshed = await fetchAllData();
        setObatList(refreshed.obat);
      }
      showToast('success', 'Paket P3K Ditambahkan', '5 item obat standar Poskestren siap digunakan.');
    } catch (err: unknown) {
      showToast('error', 'Gagal Menambah Paket Obat', extractSupabaseError(err, 'Terjadi kesalahan.'));
    } finally {
      setSaving(false);
    }
  };

  const handleSaveObat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit) return;
    if (!obatNama.trim()) {
      showToast('error', 'Nama Obat Wajib Diisi', 'Masukkan nama obat atau perlengkapan P3K.');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        nama_obat: obatNama.trim(),
        kategori: obatKategori,
        satuan: obatSatuan.trim() || 'tablet',
        stok: Math.max(0, parseInt(obatStok || '0', 10) || 0),
        stok_minimum: Math.max(0, parseInt(obatMin || '5', 10) || 0),
        harga_satuan: Math.max(0, parseInt(obatHarga || '0', 10) || 0),
        kadaluarsa: obatKadaluarsa.trim(),
        keterangan: obatKet.trim(),
      };

      if (obatLocalFallback) {
        const next = editingObat
          ? obatList.map((o) => (o.id === editingObat.id ? { ...o, ...payload } : o))
          : [...obatList, { id: createLocalId('obat'), ...payload }];
        setObatList(next);
        writeLocalObat(next);
      } else {
        if (editingObat) {
          const { error } = await supabase
            .from('poskestren_obat')
            .update(payload)
            .eq('id', editingObat.id);
          if (error) throw error;
        } else {
          const { error } = await supabase.from('poskestren_obat').insert(payload);
          if (error) throw error;
        }
        const refreshed = await fetchAllData();
        setObatList(refreshed.obat);
      }

      setShowObatModal(false);
      showToast(
        'success',
        editingObat ? 'Data Obat Diperbarui' : 'Obat Ditambahkan',
        `${payload.nama_obat} (${payload.stok} ${payload.satuan}) tersimpan.`
      );
    } catch (err: unknown) {
      showToast('error', 'Gagal Menyimpan Obat', extractSupabaseError(err, 'Terjadi kesalahan.'));
    } finally {
      setSaving(false);
    }
  };

  const handleRestockObat = async (item: ObatItem, delta: number) => {
    if (!canEdit) return;
    const nextStok = Math.max(0, item.stok + delta);
    if (obatLocalFallback) {
      const next = obatList.map((o) => (o.id === item.id ? { ...o, stok: nextStok } : o));
      setObatList(next);
      writeLocalObat(next);
      return;
    }
    const { error } = await supabase
      .from('poskestren_obat')
      .update({ stok: nextStok })
      .eq('id', item.id);
    if (!error) {
      setObatList((prev) => prev.map((o) => (o.id === item.id ? { ...o, stok: nextStok } : o)));
    }
  };

  const handleDeleteObat = async (item: ObatItem) => {
    if (!canEdit) return;
    if (obatLocalFallback) {
      const next = obatList.filter((o) => o.id !== item.id);
      setObatList(next);
      writeLocalObat(next);
      showToast('info', 'Obat Dihapus', `${item.nama_obat} dihapus dari katalog.`);
      return;
    }
    const { error } = await supabase.from('poskestren_obat').delete().eq('id', item.id);
    if (!error) {
      setObatList((prev) => prev.filter((o) => o.id !== item.id));
      showToast('info', 'Obat Dihapus', `${item.nama_obat} dihapus dari katalog.`);
    }
  };

  // ==========================
  // HANDLERS PENYULUHAN
  // ==========================
  const openCreatePenyuluhanModal = () => {
    if (!canEdit) return;
    setEditingPenyuluhan(null);
    setPyTanggal(todayStr || getLocalTodayStr());
    setPyJudul('');
    setPyNarasumber('Poskestren & Puskesmas Bululawang');
    setPySasaran('Seluruh Santri');
    setPyPeserta('0');
    setPyStatus('terjadwal');
    setPyRingkasan('');
    setShowPenyuluhanModal(true);
  };

  const openEditPenyuluhanModal = (item: PenyuluhanItem) => {
    if (!canEdit) return;
    setEditingPenyuluhan(item);
    setPyTanggal(item.tanggal);
    setPyJudul(item.judul);
    setPyNarasumber(item.narasumber);
    setPySasaran(item.sasaran);
    setPyPeserta(String(item.jumlah_peserta || 0));
    setPyStatus(item.status);
    setPyRingkasan(item.ringkasan || '');
    setShowPenyuluhanModal(true);
  };

  const handleSavePenyuluhan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit) return;
    if (!pyJudul.trim() || !pyTanggal) {
      showToast('error', 'Data Belum Lengkap', 'Tanggal dan tema penyuluhan wajib diisi.');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        tanggal: pyTanggal,
        judul: pyJudul.trim(),
        narasumber: pyNarasumber.trim() || 'Poskestren Pondok',
        sasaran: pySasaran.trim() || 'Seluruh Santri',
        jumlah_peserta: Math.max(0, parseInt(pyPeserta || '0', 10) || 0),
        status: pyStatus,
        ringkasan: pyRingkasan.trim(),
      };

      if (penyuluhanLocalFallback) {
        const next = editingPenyuluhan
          ? penyuluhanList.map((p) => (p.id === editingPenyuluhan.id ? { ...p, ...payload } : p))
          : [{ id: createLocalId('py'), ...payload }, ...penyuluhanList];
        setPenyuluhanList(next);
        writeLocalPenyuluhan(next);
      } else {
        if (editingPenyuluhan) {
          const { error } = await supabase
            .from('poskestren_penyuluhan')
            .update(payload)
            .eq('id', editingPenyuluhan.id);
          if (error) throw error;
        } else {
          const { error } = await supabase.from('poskestren_penyuluhan').insert(payload);
          if (error) throw error;
        }
        const refreshed = await fetchAllData();
        setPenyuluhanList(refreshed.penyuluhan);
      }

      setShowPenyuluhanModal(false);
      showToast('success', 'Penyuluhan Tersimpan', `Agenda "${payload.judul}" berhasil disimpan.`);
    } catch (err: unknown) {
      showToast(
        'error',
        'Gagal Menyimpan Penyuluhan',
        extractSupabaseError(err, 'Terjadi kesalahan.')
      );
    } finally {
      setSaving(false);
    }
  };

  const handleTogglePenyuluhanStatus = async (item: PenyuluhanItem) => {
    if (!canEdit) return;
    const nextStatus: StatusPenyuluhan =
      item.status === 'terlaksana' ? 'terjadwal' : 'terlaksana';
    if (penyuluhanLocalFallback) {
      const next = penyuluhanList.map((p) =>
        p.id === item.id ? { ...p, status: nextStatus } : p
      );
      setPenyuluhanList(next);
      writeLocalPenyuluhan(next);
      return;
    }
    const { error } = await supabase
      .from('poskestren_penyuluhan')
      .update({ status: nextStatus })
      .eq('id', item.id);
    if (!error) {
      setPenyuluhanList((prev) =>
        prev.map((p) => (p.id === item.id ? { ...p, status: nextStatus } : p))
      );
    }
  };

  const handleDeletePenyuluhan = async (item: PenyuluhanItem) => {
    if (!canEdit) return;
    if (penyuluhanLocalFallback) {
      const next = penyuluhanList.filter((p) => p.id !== item.id);
      setPenyuluhanList(next);
      writeLocalPenyuluhan(next);
      showToast('info', 'Agenda Dihapus', `"${item.judul}" dihapus.`);
      return;
    }
    const { error } = await supabase.from('poskestren_penyuluhan').delete().eq('id', item.id);
    if (!error) {
      setPenyuluhanList((prev) => prev.filter((p) => p.id !== item.id));
      showToast('info', 'Agenda Dihapus', `"${item.judul}" dihapus.`);
    }
  };

  // ==========================
  // WA WALI & EKSPOR EXCEL
  // ==========================
  const buildWaWaliMessage = (item: SakitViewItem): string => {
    const namaSantri = item.santri?.nama_lengkap || 'Santri';
    const kamar = item.santri?.kamar || '-';
    const wali = getDefaultWali(item.santri).nama || 'Bapak/Ibu Wali Santri';
    const obatStr =
      item.meta.ob.length > 0
        ? item.meta.ob.map((o) => `${o.nama} (${o.qty}x · ${o.dosis})`).join(', ')
        : 'Perawatan & istirahat pondok';
    const vitalParts = [
      item.meta.sh ? `Suhu ${item.meta.sh}°C` : '',
      item.meta.tn ? `TD ${item.meta.tn}` : '',
    ].filter(Boolean);

    if (item.status === 'dirujuk') {
      return [
        `Assalamu'alaikum Wr. Wb.`,
        `Yth. Bapak/Ibu ${wali},`,
        `Wali santri dari *${namaSantri}* (Kamar ${kamar}).`,
        ``,
        `Kami Sie Kesehatan ${pengaturan.nama_pesantren} mengabarkan bahwa ananda membutuhkan penanganan medis lanjutan / rujukan:`,
        `• Tanggal Sakit: ${formatTanggalIndo(item.tgl_sakit)} (${item.durasiHari} hari)`,
        `• Keluhan: ${item.keluhan}${item.diagnosa ? ` (${item.diagnosa})` : ''}`,
        ...(vitalParts.length > 0 ? [`• Tanda Vital: ${vitalParts.join(' · ')}`] : []),
        `• Tindakan / Obat: ${obatStr}`,
        `• Tujuan Rujukan: *${item.meta.rj || 'Luar Balai Kesehatan Pondok'}*`,
        ...(item.meta.cr ? [`• Catatan: ${item.meta.cr}`] : []),
        ``,
        `Mohon segera berkomunikasi dengan Sie Kesehatan Pondok (${pengaturan.no_telepon}) untuk koordinasi lebih lanjut.`,
        `Wassalamu'alaikum Wr. Wb.`,
      ].join('\n');
    }

    if (item.status === 'sembuh') {
      return [
        `Assalamu'alaikum Wr. Wb.`,
        `Yth. Bapak/Ibu ${wali},`,
        `Wali santri dari *${namaSantri}* (Kamar ${kamar}).`,
        ``,
        `Alhamdulillah, ananda yang sebelumnya sakit dengan keluhan *${item.keluhan}* telah dinyatakan *SEMBUH* per ${formatTanggalIndo(
          item.tgl_sembuh || todayStr
        )} dan dapat kembali mengikuti kegiatan pondok seperti biasa.`,
        ``,
        `Terima kasih atas doa dan kerja samanya.`,
        `Wassalamu'alaikum Wr. Wb.`,
      ].join('\n');
    }

    return [
      `Assalamu'alaikum Wr. Wb.`,
      `Yth. Bapak/Ibu ${wali},`,
      `Wali santri dari *${namaSantri}* (Kamar ${kamar}).`,
      ``,
      `Kami Sie Kesehatan ${pengaturan.nama_pesantren} menginformasikan kondisi kesehatan ananda:`,
      `• Tanggal Sakit: ${formatTanggalIndo(item.tgl_sakit)} (${item.durasiHari} hari)`,
      `• Lokasi Rawat: ${item.meta.lk}`,
      `• Keluhan: ${item.keluhan}${item.diagnosa ? ` (${item.diagnosa})` : ''}`,
      ...(vitalParts.length > 0 ? [`• Tanda Vital: ${vitalParts.join(' · ')}`] : []),
      `• Penanganan / Obat: ${obatStr}`,
      ...(item.tindakanTeks ? [`• Arahan Poskestren: ${item.tindakanTeks}`] : []),
      ``,
      `Mohon doa untuk kesembuhan ananda. Informasi lebih lanjut dapat menghubungi Sie Kesehatan (${pengaturan.no_telepon}).`,
      `Wassalamu'alaikum Wr. Wb.`,
    ].join('\n');
  };

  const handleExportExcel = () => {
    const source = activeTab === 'rekap' ? rekapFilteredItems : filteredItems;
    const rows = source.map((item, idx) => ({
      No: idx + 1,
      'No Surat': item.meta.ns || '-',
      NIS: item.santri?.nis || '-',
      'Nama Santri': item.santri?.nama_lengkap || '-',
      Kamar: item.santri?.kamar || '-',
      'Tgl Sakit': item.tgl_sakit,
      'Tgl Sembuh': item.tgl_sembuh || '-',
      'Durasi (Hari)': item.durasiHari,
      Keluhan: item.keluhan,
      Diagnosa: item.diagnosa || '-',
      'Lokasi Rawat': item.meta.lk,
      'Suhu / Tensi': [item.meta.sh ? `${item.meta.sh}°C` : '', item.meta.tn || '']
        .filter(Boolean)
        .join(' / ') || '-',
      'Obat Diberikan':
        item.meta.ob.map((o) => `${o.nama} x${o.qty} (${o.dosis})`).join('; ') || '-',
      Tindakan: item.tindakanTeks || '-',
      'Tujuan Rujukan': item.meta.rj || '-',
      'Biaya Berobat (Rp)': Number(item.meta.by || 0),
      Status:
        item.status === 'rawat_uks'
          ? 'Dirawat UKS / Poskestren'
          : item.status === 'dirujuk'
          ? 'Dirujuk / Pantauan'
          : 'Sembuh',
      'Petugas Sie Kesehatan': item.meta.pt || '-',
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Kesehatan_Poskestren');
    XLSX.writeFile(wb, `REKAP_KESEHATAN_POSKESTREN_${todayStr || 'ANNUR1'}.xlsx`);
    showToast('success', 'Ekspor Excel Berhasil', 'Laporan kesehatan santri berhasil diunduh.');
  };

  return (
    <div className="space-y-5 relative print:space-y-0">
      {/* PRINT ISOLATION UNTUK SURAT KETERANGAN SAKIT / RUJUKAN POSKESTREN */}
      <style jsx global>{`
        @media print {
          @page {
            size: A4 portrait;
            margin: 12mm 14mm;
          }
          body {
            background: #ffffff !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          aside, nav, header {
            display: none !important;
          }
          body * {
            visibility: hidden;
          }
          #print-surat-kesehatan,
          #print-surat-kesehatan * {
            visibility: visible;
          }
          #print-surat-kesehatan {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            display: block !important;
            background: #ffffff !important;
          }
        }
      `}</style>

      {/* AREA CETAK SURAT KETERANGAN SAKIT / RUJUKAN POSKESTREN */}
      {printTarget && (
        <div
          id="print-surat-kesehatan"
          className="hidden bg-white text-slate-900 text-xs leading-relaxed"
        >
          <div className="border-2 border-slate-800 p-6 space-y-5">
            <div className="flex items-center gap-4 border-b-4 border-double border-emerald-900 pb-3">
              {pengaturan.logo_url && (
                <img
                  src={pengaturan.logo_url}
                  alt="Logo Pondok"
                  referrerPolicy="no-referrer"
                  className="w-16 h-16 object-contain shrink-0"
                />
              )}
              <div className="flex-1 text-center">
                <p className="text-[10px] font-bold tracking-widest uppercase text-emerald-900">
                  POS KESEHATAN PESANTREN (POSKESTREN) &amp; SIE KESEHATAN
                </p>
                <h1 className="text-lg font-extrabold uppercase text-slate-900">
                  {pengaturan.nama_pesantren}
                </h1>
                <p className="text-[11px] text-slate-600">{pengaturan.alamat_lengkap}</p>
                <p className="text-[11px] text-slate-600">
                  Telp/WA Sie Kesehatan &amp; Kantor: {pengaturan.no_telepon}
                </p>
              </div>
            </div>

            <div className="text-center">
              <h2 className="text-base font-extrabold uppercase underline underline-offset-4 text-slate-900">
                {printTarget.status === 'dirujuk'
                  ? 'SURAT PENGANTAR RUJUKAN & KETERANGAN SAKIT'
                  : 'SURAT KETERANGAN PEMERIKSAAN POSKESTREN'}
              </h2>
              <p className="text-[11px] font-mono text-slate-600 mt-1">
                Nomor: {printTarget.meta.ns || printTarget.id.slice(0, 8).toUpperCase()} &middot;{' '}
                {printTarget.status === 'dirujuk'
                  ? 'RUJUKAN MEDIS / WALI SANTRI'
                  : printTarget.status === 'sembuh'
                  ? 'TELAH SEMBUH'
                  : 'PERAWATAN PONDOK'}
              </p>
            </div>

            <p className="text-xs text-slate-800">
              Assalamu&apos;alaikum Wr. Wb. Pengurus Sie Kesehatan dan Poskestren{' '}
              {pengaturan.nama_pesantren} menerangkan bahwa santri di bawah ini telah menjalani
              pemeriksaan dan pelayanan kesehatan di pesantren:
            </p>

            <table className="w-full text-xs border-collapse">
              <tbody>
                <tr>
                  <td className="py-1 w-44 font-semibold text-slate-700">Nama Lengkap Santri</td>
                  <td className="py-1 w-4">:</td>
                  <td className="py-1 font-bold text-slate-900">
                    {printTarget.santri?.nama_lengkap || '-'}
                  </td>
                </tr>
                <tr>
                  <td className="py-1 font-semibold text-slate-700">NIS / Kamar</td>
                  <td className="py-1">:</td>
                  <td className="py-1 font-mono">
                    {printTarget.santri?.nis || '-'} / Kamar {printTarget.santri?.kamar || '-'}
                  </td>
                </tr>
                <tr>
                  <td className="py-1 font-semibold text-slate-700">Tanggal Mulai Sakit</td>
                  <td className="py-1">:</td>
                  <td className="py-1 font-mono">{formatTanggalIndo(printTarget.tgl_sakit)}</td>
                </tr>
                <tr>
                  <td className="py-1 font-semibold text-slate-700">Keluhan &amp; Diagnosa</td>
                  <td className="py-1">:</td>
                  <td className="py-1">
                    <strong>{printTarget.keluhan}</strong>
                    {printTarget.diagnosa ? ` — ${printTarget.diagnosa}` : ''}
                  </td>
                </tr>
                <tr>
                  <td className="py-1 font-semibold text-slate-700">Pemeriksaan Vital</td>
                  <td className="py-1">:</td>
                  <td className="py-1 font-mono">
                    {printTarget.meta.sh ? `Suhu ${printTarget.meta.sh}°C` : 'Suhu -'} &middot;{' '}
                    {printTarget.meta.tn ? `Tensi ${printTarget.meta.tn}` : 'Tensi -'}
                  </td>
                </tr>
                <tr>
                  <td className="py-1 font-semibold text-slate-700">Lokasi &amp; Tindakan</td>
                  <td className="py-1">:</td>
                  <td className="py-1">
                    {printTarget.meta.lk}
                    {printTarget.tindakanTeks ? ` — ${printTarget.tindakanTeks}` : ''}
                  </td>
                </tr>
                <tr>
                  <td className="py-1 font-semibold text-slate-700">Obat Diberikan</td>
                  <td className="py-1">:</td>
                  <td className="py-1">
                    {printTarget.meta.ob.length > 0
                      ? printTarget.meta.ob
                          .map((o) => `${o.nama} (${o.qty}x, ${o.dosis})`)
                          .join('; ')
                      : 'Observasi & istirahat'}
                  </td>
                </tr>
                {printTarget.status === 'dirujuk' && (
                  <tr>
                    <td className="py-1 font-semibold text-slate-700">Rujukan Lanjutan</td>
                    <td className="py-1">:</td>
                    <td className="py-1 font-bold text-rose-800">
                      {printTarget.meta.rj || 'Klinik / Rumah Sakit Luar / Perawatan Wali'}
                      {printTarget.meta.cr ? ` (${printTarget.meta.cr})` : ''}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>

            <div className="p-3 bg-slate-50 border border-slate-300 rounded text-[10.5px] text-slate-700 space-y-1">
              <p className="font-bold text-slate-900">Catatan Pedoman Kesehatan &amp; Perizinan:</p>
              <p>
                1. Surat ini merupakan bukti resmi bahwa santri telah mendapatkan pemeriksaan
                dan pengobatan dari Poskestren / Sie Kesehatan pondok.
              </p>
              <p>
                2. Apabila kondisi belum menunjukkan perkembangan signifikan dan memerlukan
                perizinan pulang sakit, surat ini dilampirkan ke bagian Keamanan Pondok.
              </p>
            </div>

            <div className="pt-2 grid grid-cols-2 gap-6 text-center text-[11px]">
              <div className="relative">
                <p>Petugas Sie Kesehatan / Poskestren,</p>
                <div className="h-16 flex items-center justify-center relative">
                  {pengaturan.stempel_url && (
                    <img
                      src={pengaturan.stempel_url}
                      alt="Stempel Pondok"
                      referrerPolicy="no-referrer"
                      className="w-16 h-16 object-contain opacity-75"
                    />
                  )}
                </div>
                <p className="font-bold underline underline-offset-2">{printTarget.meta.pt}</p>
              </div>

              <div>
                <p>Bululawang, {formatTanggalIndo(todayStr || printTarget.tgl_sakit)}</p>
                <p>Mengetahui Kepala Pondok,</p>
                <div className="h-12 flex items-center justify-center">
                  {pengaturan.ttd_kepala_pondok_url && (
                    <img
                      src={pengaturan.ttd_kepala_pondok_url}
                      alt="TTD Kepala Pondok"
                      referrerPolicy="no-referrer"
                      className="h-12 object-contain"
                    />
                  )}
                </div>
                <p className="font-bold underline underline-offset-2">
                  {pengaturan.nama_kepala_pondok || 'Kepala Pondok'}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TOAST NOTIFICATIONS (WHITE POPUP SENADA MODUL LAIN) */}
      {toasts.length > 0 && (
        <div className="fixed top-5 right-5 z-50 flex flex-col gap-2.5 max-w-sm w-full pointer-events-none print:hidden">
          {toasts.map((t) => (
            <div
              key={t.id}
              className={`pointer-events-auto p-4 rounded-xl shadow-xl border bg-white flex items-start gap-3 transition-all ${
                t.type === 'success'
                  ? 'border-emerald-200'
                  : t.type === 'error'
                  ? 'border-rose-200'
                  : 'border-sky-200'
              }`}
            >
              {t.type === 'success' ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
              ) : t.type === 'error' ? (
                <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
              ) : (
                <Info className="w-5 h-5 text-sky-600 shrink-0 mt-0.5" />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-slate-900">{t.title}</p>
                <p className="text-[11px] text-slate-600 mt-0.5 leading-relaxed">{t.message}</p>
              </div>
              <button
                type="button"
                onClick={() => setToasts((prev) => prev.filter((item) => item.id !== t.id))}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* HEADER UTAMA */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-xs print:hidden">
        <div>
          <h1 className="text-lg sm:text-xl font-bold text-slate-900 flex items-center gap-2">
            <HeartPulse className="w-5 h-5 text-emerald-700 shrink-0" />
            Poskestren &amp; Kesehatan Santri
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Pemantauan santri sakit, layanan Poskestren, stok obat, penyuluhan, laporan WA wali &amp;
            pintasan izin pulang sakit.
          </p>
        </div>

        <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleReload}
            disabled={loading}
            className="px-3.5 py-2.5 sm:py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Muat Ulang
          </button>

          <button
            type="button"
            onClick={handleExportExcel}
            className="px-3.5 py-2.5 sm:py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-xl flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 transition-colors"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            Ekspor Excel
          </button>

          {canEdit && (
            <button
              type="button"
              onClick={openCreateSakitModal}
              className="col-span-2 sm:col-span-1 px-4 py-2.5 sm:py-2 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold rounded-xl shadow-xs flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Catat Santri Sakit
            </button>
          )}
        </div>
      </div>

      <TransparencyBanner
        moduleLabel="Poskestren & Kesehatan Santri"
        isReadOnly={!canEdit}
      />

      {fetchError && (
        <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 flex items-start gap-3 text-rose-900 text-xs print:hidden">
          <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
          <div>
            <span className="font-bold">Kendala Database Kesehatan:</span> {fetchError}
          </div>
        </div>
      )}

      {/* INFO ISOLASI BIAYA */}
      <div className="bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-slate-600 print:hidden">
        <div className="flex items-start sm:items-center gap-2">
          <Info className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5 sm:mt-0" />
          <span>
            Biaya berobat luar &amp; obat dicatat terisolasi di modul <strong>Poskestren</strong>{' '}
            (tidak masuk otomatis ke kas Keuangan Pondok).
          </span>
        </div>
        {(obatLocalFallback || penyuluhanLocalFallback) && (
          <button
            type="button"
            onClick={() => setShowSqlHelper((v) => !v)}
            className="text-emerald-800 font-semibold hover:underline whitespace-nowrap shrink-0 self-start sm:self-auto"
          >
            {showSqlHelper ? 'Tutup SQL Sync' : 'Sinkronisasi Tabel Obat & Penyuluhan'}
          </button>
        )}
      </div>

      {showSqlHelper && (
        <div className="bg-white border border-slate-300 rounded-2xl p-4 space-y-2.5 text-xs print:hidden">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="font-bold text-slate-900">
                SQL Opsional untuk Sinkronisasi Tabel Obat &amp; Penyuluhan di Supabase
              </p>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Saat ini Rekam Sakit sudah tersimpan di Supabase (<code>santri_sakit</code>),
                sedangkan Katalog Obat &amp; Penyuluhan berjalan via penyimpanan lokal browser
                sampai 2 tabel opsional berikut dijalankan di SQL Editor Supabase.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(OPTIONAL_TABLES_SQL);
                showToast('info', 'SQL Disalin', 'Jalankan query di SQL Editor Supabase.');
              }}
              className="px-3 py-1.5 bg-slate-900 text-white rounded-lg font-semibold flex items-center gap-1.5 shrink-0"
            >
              <Copy className="w-3.5 h-3.5" />
              Salin SQL
            </button>
          </div>
          <pre className="p-3 bg-slate-900 text-emerald-200 rounded-xl overflow-x-auto text-[11px] font-mono">
            {OPTIONAL_TABLES_SQL}
          </pre>
        </div>
      )}

      {/* 4 KPI CARDS */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 print:hidden">
        <div className="bg-white p-3.5 sm:p-4 rounded-2xl border border-slate-200 shadow-xs">
          <span className="text-[11px] sm:text-xs font-semibold text-slate-500 block">
            Sedang Dirawat (UKS)
          </span>
          <strong className="text-xl sm:text-2xl font-extrabold text-sky-700 tabular-nums mt-1 block">
            {loading ? '...' : kpiStats.dirawatUks}
          </strong>
          <span className="text-[11px] text-slate-500 leading-snug block mt-0.5">
            Santri rawat pondok / Poskestren
          </span>
        </div>

        <div
          className={`p-3.5 sm:p-4 rounded-2xl border shadow-xs ${
            kpiStats.dirujuk > 0 ? 'bg-rose-50/70 border-rose-300' : 'bg-white border-slate-200'
          }`}
        >
          <span
            className={`text-[11px] sm:text-xs font-semibold block ${
              kpiStats.dirujuk > 0 ? 'text-rose-800' : 'text-slate-500'
            }`}
          >
            Dirujuk / Pantauan Khusus
          </span>
          <strong
            className={`text-xl sm:text-2xl font-extrabold tabular-nums mt-1 block ${
              kpiStats.dirujuk > 0 ? 'text-rose-700' : 'text-slate-800'
            }`}
          >
            {loading ? '...' : kpiStats.dirujuk}
          </strong>
          <span
            className={`text-[11px] leading-snug block mt-0.5 ${
              kpiStats.dirujuk > 0 ? 'text-rose-700 font-medium' : 'text-slate-500'
            }`}
          >
            {kpiStats.dirujuk > 0
              ? 'Perlu pantauan & laporan WA wali'
              : 'Tidak ada rujukan aktif'}
          </span>
        </div>

        <div className="bg-white p-3.5 sm:p-4 rounded-2xl border border-slate-200 shadow-xs">
          <span className="text-[11px] sm:text-xs font-semibold text-slate-500 block">
            Sembuh Bulan Ini
          </span>
          <strong className="text-xl sm:text-2xl font-extrabold text-emerald-700 tabular-nums mt-1 block">
            {loading ? '...' : kpiStats.sembuhBulanIni}
          </strong>
          <span className="text-[11px] text-slate-500 leading-snug block mt-0.5">
            Sudah kembali beraktivitas
          </span>
        </div>

        <div className="bg-white p-3.5 sm:p-4 rounded-2xl border border-slate-200 shadow-xs">
          <span className="text-[11px] sm:text-xs font-semibold text-slate-500 block">
            Biaya Berobat &amp; Stok Obat
          </span>
          <strong className="text-lg sm:text-xl font-extrabold text-slate-900 tabular-nums mt-1 block truncate">
            {loading ? '...' : formatRupiah(kpiStats.totalBiaya)}
          </strong>
          <span
            className={`text-[11px] tabular-nums leading-snug block mt-0.5 ${
              kpiStats.obatMenipis > 0 ? 'text-amber-700 font-semibold' : 'text-slate-500'
            }`}
          >
            {kpiStats.obatMenipis > 0
              ? `${kpiStats.obatMenipis} jenis obat stok menipis`
              : `${obatList.length} jenis obat terdata`}
          </span>
        </div>
      </div>

      {/* TAB NAVIGASI (SCROLLABLE SINGLE-ROW DI HP/PWA) */}
      <div className="flex items-center gap-1.5 overflow-x-auto bg-white p-1.5 sm:p-2 rounded-2xl border border-slate-200 shadow-xs print:hidden">
        <button
          type="button"
          onClick={() => setActiveTab('pantauan')}
          className={`px-3.5 py-2.5 sm:py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors ${
            activeTab === 'pantauan'
              ? 'bg-emerald-800 text-white'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Stethoscope className="w-3.5 h-3.5" />
          1. Pantauan Sakit
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('obat')}
          className={`px-3.5 py-2.5 sm:py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors ${
            activeTab === 'obat'
              ? 'bg-emerald-800 text-white'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Pill className="w-3.5 h-3.5" />
          2. Stok Obat ({obatList.length})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('penyuluhan')}
          className={`px-3.5 py-2.5 sm:py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors ${
            activeTab === 'penyuluhan'
              ? 'bg-emerald-800 text-white'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Megaphone className="w-3.5 h-3.5" />
          3. Penyuluhan ({penyuluhanList.length})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('rekap')}
          className={`px-3.5 py-2.5 sm:py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors ${
            activeTab === 'rekap'
              ? 'bg-emerald-800 text-white'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <FileText className="w-3.5 h-3.5" />
          4. Rekap &amp; Laporan
        </button>
      </div>

      {/* FILTER BAR (PANTAUAN & REKAP) */}
      {(activeTab === 'pantauan' || activeTab === 'rekap') && (
        <div className="bg-white p-3.5 sm:p-4 rounded-2xl border border-slate-200 shadow-xs space-y-2.5 print:hidden">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-2.5 items-center">
            <div className="relative md:col-span-8 lg:col-span-5 min-w-0">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                placeholder="Cari nama, NIS, keluhan, diagnosa, atau rujukan..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full min-h-[40px] pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-600"
              />
            </div>

            <select
              value={filterKamar}
              onChange={(e) => setFilterKamar(e.target.value)}
              className="md:col-span-4 lg:col-span-2 min-h-[40px] px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700"
            >
              <option value="SEMUA">Semua Kamar</option>
              {kamarOptions.map((k) => (
                <option key={k} value={k}>
                  Kamar {k}
                </option>
              ))}
            </select>

            <div className="md:col-span-12 lg:col-span-5 flex items-center lg:justify-end gap-1.5 overflow-x-auto pb-0.5 lg:pb-0">
              {(
                [
                  { id: 'semua', label: 'Semua' },
                  { id: 'rawat_uks', label: 'Dirawat UKS' },
                  { id: 'dirujuk', label: 'Dirujuk / Pantauan' },
                  { id: 'sembuh', label: 'Sembuh' },
                ] as const
              ).map((st) => (
                <button
                  key={st.id}
                  type="button"
                  onClick={() => setFilterStatus(st.id)}
                  className={`min-h-[38px] px-3 py-1.5 rounded-xl text-xs font-semibold border whitespace-nowrap shrink-0 transition-colors ${
                    filterStatus === st.id
                      ? 'bg-emerald-700 text-white border-emerald-700'
                      : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {st.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 1: PANTAUAN SAKIT & POSKESTREN */}
      {activeTab === 'pantauan' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden print:hidden">
          {/* TAMPILAN MOBILE / HP / PWA (CARD LIST RAMAH SENTUH) */}
          <div className="md:hidden divide-y divide-slate-100">
            {loading ? (
              <div className="p-8 text-center text-xs text-slate-400">
                Memuat catatan kesehatan santri...
              </div>
            ) : filteredItems.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-400 space-y-3">
                <p>Belum ada catatan santri sakit sesuai filter saat ini.</p>
                {canEdit && (
                  <button
                    type="button"
                    onClick={openCreateSakitModal}
                    className="px-4 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold rounded-xl inline-flex items-center gap-1.5"
                  >
                    <Plus className="w-4 h-4" />
                    Catat Santri Sakit Pertama
                  </button>
                )}
              </div>
            ) : (
              filteredItems.map((item, idx) => {
                const waliInfo = getDefaultWali(item.santri);
                const waDigits = formatWaNumber(waliInfo.wa);
                const waMsg = buildWaWaliMessage(item);

                return (
                  <div
                    key={item.id}
                    className={`p-4 space-y-3 ${item.status === 'dirujuk' ? 'bg-rose-50/40' : ''}`}
                  >
                    {/* Header Card: Santri & Status */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-[11px] text-slate-400 tabular-nums">
                            #{idx + 1}
                          </span>
                          <h3 className="text-sm font-bold text-slate-900 truncate">
                            {item.santri?.nama_lengkap || 'Santri tidak ditemukan'}
                          </h3>
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5 tabular-nums">
                          Kamar {item.santri?.kamar || '-'} &middot; NIS {item.santri?.nis || '-'}
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <span
                          className={`text-xs font-bold block ${
                            item.status === 'dirujuk'
                              ? 'text-rose-700'
                              : item.status === 'sembuh'
                              ? 'text-emerald-700'
                              : 'text-sky-700'
                          }`}
                        >
                          {item.status === 'dirujuk'
                            ? 'Dirujuk'
                            : item.status === 'sembuh'
                            ? 'Sembuh'
                            : 'Dirawat UKS'}
                        </span>
                        <span className="text-[10.5px] font-mono text-slate-500 tabular-nums block">
                          {formatTanggalIndo(item.tgl_sakit)}
                        </span>
                      </div>
                    </div>

                    {/* Ringkasan Medis */}
                    <div className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs bg-slate-50/80 border border-slate-100 rounded-xl p-3">
                      <div>
                        <span className="text-[10.5px] text-slate-500 block">Keluhan &amp; Durasi</span>
                        <span className="font-semibold text-slate-900 block">{item.keluhan}</span>
                        <span className="text-[11px] text-slate-500 tabular-nums">
                          {item.durasiHari} hari
                          {item.diagnosa ? ` · ${item.diagnosa}` : ''}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10.5px] text-slate-500 block">Lokasi &amp; Petugas</span>
                        <span className="font-semibold text-slate-800 block">
                          {item.meta.lk}
                          {item.meta.pp ? ' · Poskestren' : ''}
                        </span>
                        <span className="text-[11px] text-slate-500 block truncate">
                          Petugas: {item.meta.pt}
                        </span>
                      </div>
                      {(item.meta.ob.length > 0 || item.meta.by > 0 || item.meta.sh || item.meta.tn) && (
                        <div className="col-span-2 pt-1.5 border-t border-slate-200/70 space-y-0.5 text-[11px]">
                          {(item.meta.sh || item.meta.tn) && (
                            <div className="font-mono text-slate-600 tabular-nums">
                              {item.meta.sh ? `Suhu ${item.meta.sh}°C` : ''}
                              {item.meta.sh && item.meta.tn ? ' · ' : ''}
                              {item.meta.tn ? `TD ${item.meta.tn}` : ''}
                            </div>
                          )}
                          {item.meta.ob.length > 0 && (
                            <div className="text-slate-700">
                              Obat: {item.meta.ob.map((o) => `${o.nama} (${o.qty}x)`).join(', ')}
                            </div>
                          )}
                          {item.meta.by > 0 && (
                            <div className="font-mono font-semibold text-amber-800 tabular-nums">
                              Biaya Berobat: {formatRupiah(item.meta.by)}
                            </div>
                          )}
                        </div>
                      )}
                      {item.status === 'dirujuk' && item.meta.rj && (
                        <div className="col-span-2 text-[11px] font-semibold text-rose-700">
                          Tujuan Rujukan: {item.meta.rj}
                        </div>
                      )}
                    </div>

                    {/* Grid Aksi Mobile Ramah Sentuh */}
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      {canEdit && (
                        <button
                          type="button"
                          onClick={() => openEditSakitModal(item)}
                          className="min-h-[40px] px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl font-semibold text-center"
                        >
                          Periksa / Update
                        </button>
                      )}

                      {item.status !== 'sembuh' && canEdit ? (
                        <button
                          type="button"
                          onClick={() => handleMarkSembuh(item)}
                          disabled={saving}
                          className="min-h-[40px] px-3 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl font-semibold flex items-center justify-center gap-1.5"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Sembuh
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setPrintTarget(item)}
                          className={`min-h-[40px] px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl font-semibold flex items-center justify-center gap-1.5 ${
                            !canEdit ? 'col-span-2' : ''
                          }`}
                        >
                          <Printer className="w-3.5 h-3.5" />
                          Cetak Surat
                        </button>
                      )}

                      {waDigits && (
                        <a
                          href={`https://wa.me/${waDigits}?text=${encodeURIComponent(waMsg)}`}
                          target="_blank"
                          rel="noreferrer"
                          onClick={() => handleMarkWaliNotified(item)}
                          className={`min-h-[40px] px-3 py-2 rounded-xl font-bold flex items-center justify-center gap-1.5 ${
                            item.status === 'dirujuk'
                              ? 'bg-rose-600 hover:bg-rose-700 text-white'
                              : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200'
                          }`}
                        >
                          <MessageCircle className="w-3.5 h-3.5" />
                          WA Wali
                        </a>
                      )}

                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(waMsg);
                          handleMarkWaliNotified(item);
                          showToast(
                            'info',
                            'Teks WA Disalin',
                            'Pesan terformat untuk wali santri siap ditempel di WhatsApp.'
                          );
                        }}
                        className={`min-h-[40px] px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-semibold flex items-center justify-center gap-1.5 ${
                          waDigits ? '' : 'col-span-2'
                        }`}
                      >
                        <Copy className="w-3.5 h-3.5" />
                        Salin Teks WA
                      </button>

                      {item.status !== 'sembuh' && canEdit && (
                        <Link
                          href={`/perizinan?santri_id=${item.santri_id}&kategori=sakit`}
                          className="min-h-[40px] px-3 py-2 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 rounded-xl font-semibold flex items-center justify-center text-center"
                        >
                          Izin Pulang Sakit
                        </Link>
                      )}

                      {canEdit && (
                        <div className={`flex items-center gap-2 ${item.status === 'sembuh' ? 'col-span-2 justify-end' : ''}`}>
                          {item.status !== 'sembuh' && (
                            <button
                              type="button"
                              onClick={() => setPrintTarget(item)}
                              className="flex-1 min-h-[40px] px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl font-semibold flex items-center justify-center gap-1.5"
                            >
                              <Printer className="w-3.5 h-3.5" />
                              Surat
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => setDeleteTarget(item)}
                            title="Hapus catatan sakit"
                            className="min-h-[40px] min-w-[40px] px-3 bg-slate-100 hover:bg-rose-50 text-slate-500 hover:text-rose-600 rounded-xl flex items-center justify-center"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* TAMPILAN DESKTOP (TABEL TERSTRUKTUR & SEIMBANG) */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-700">
              <thead className="bg-slate-50 border-b border-slate-200 font-bold text-slate-600 uppercase text-[11px] tracking-wider">
                <tr>
                  <th className="py-3 px-3 w-11 text-center">No</th>
                  <th className="py-3 px-3.5 min-w-[175px]">Santri &amp; Kamar</th>
                  <th className="py-3 px-3.5 min-w-[205px]">Tgl Sakit &amp; Keluhan</th>
                  <th className="py-3 px-3.5 min-w-[195px]">Poskestren, Obat &amp; Biaya</th>
                  <th className="py-3 px-3.5 min-w-[165px]">Status Penanganan</th>
                  <th className="py-3 px-3.5 w-[258px] text-right">Aksi Cepat</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr>
                    <td colSpan={6} className="p-10 text-center text-slate-400">
                      Memuat catatan kesehatan santri...
                    </td>
                  </tr>
                ) : filteredItems.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-10 text-center text-slate-400 space-y-2">
                      <p>Belum ada catatan santri sakit sesuai filter saat ini.</p>
                      {canEdit && (
                        <button
                          type="button"
                          onClick={openCreateSakitModal}
                          className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold rounded-xl inline-flex items-center gap-1.5"
                        >
                          <Plus className="w-4 h-4" />
                          Catat Santri Sakit Pertama
                        </button>
                      )}
                    </td>
                  </tr>
                ) : (
                  filteredItems.map((item, idx) => {
                    const waliInfo = getDefaultWali(item.santri);
                    const waDigits = formatWaNumber(waliInfo.wa);
                    const waMsg = buildWaWaliMessage(item);

                    return (
                      <tr
                        key={item.id}
                        className={
                          item.status === 'dirujuk'
                            ? 'bg-rose-50/40 hover:bg-rose-50/70'
                            : 'hover:bg-slate-50/80'
                        }
                      >
                        <td className="py-3.5 px-3 align-top text-center font-mono text-slate-400 tabular-nums">
                          {idx + 1}
                        </td>

                        <td className="py-3.5 px-3.5 align-top">
                          <div className="font-bold text-slate-900 leading-snug">
                            {item.santri?.nama_lengkap || 'Santri tidak ditemukan'}
                          </div>
                          <div className="text-[11px] text-slate-500 mt-0.5 tabular-nums whitespace-nowrap">
                            Kamar {item.santri?.kamar || '-'} &middot; NIS {item.santri?.nis || '-'}
                          </div>
                          <div className="text-[11px] text-slate-500 mt-0.5">
                            Petugas: <span className="font-medium text-slate-700">{item.meta.pt}</span>
                          </div>
                        </td>

                        <td className="py-3.5 px-3.5 align-top">
                          <div className="font-mono text-[11px] font-bold text-slate-800 tabular-nums whitespace-nowrap">
                            {formatTanggalIndo(item.tgl_sakit)} &middot; {item.durasiHari} hari
                          </div>
                          <div className="font-semibold text-slate-900 mt-0.5 leading-snug">{item.keluhan}</div>
                          {item.diagnosa && (
                            <div className="text-[11px] text-slate-600 mt-0.5">
                              Diagnosa: {item.diagnosa}
                            </div>
                          )}
                          {(item.meta.sh || item.meta.tn) && (
                            <div className="text-[11px] text-slate-500 font-mono mt-0.5 tabular-nums">
                              {item.meta.sh ? `Suhu ${item.meta.sh}°C` : ''}
                              {item.meta.sh && item.meta.tn ? ' · ' : ''}
                              {item.meta.tn ? `TD ${item.meta.tn}` : ''}
                            </div>
                          )}
                        </td>

                        <td className="py-3.5 px-3.5 align-top">
                          <div className="font-semibold text-slate-800 leading-snug">
                            {item.meta.lk}
                            {item.meta.pp ? ' · Diperiksa Poskestren' : ''}
                          </div>
                          {item.meta.ob.length > 0 && (
                            <div className="text-[11px] text-slate-600 mt-0.5">
                              Obat: {item.meta.ob.map((o) => `${o.nama} (${o.qty}x)`).join(', ')}
                            </div>
                          )}
                          {item.tindakanTeks && (
                            <div className="text-[11px] text-slate-500 mt-0.5 line-clamp-2 max-w-xs">
                              {item.tindakanTeks}
                            </div>
                          )}
                          {item.meta.by > 0 && (
                            <div className="text-[11px] font-mono font-semibold text-amber-800 mt-0.5 tabular-nums whitespace-nowrap">
                              Biaya Berobat: {formatRupiah(item.meta.by)}
                            </div>
                          )}
                        </td>

                        <td className="py-3.5 px-3.5 align-top">
                          {item.status === 'dirujuk' ? (
                            <div className="space-y-0.5">
                              <span className="font-bold text-rose-700 block whitespace-nowrap">
                                Dirujuk / Pantauan
                              </span>
                              {item.meta.rj && (
                                <span className="text-[11px] text-rose-700 block">
                                  Tujuan: {item.meta.rj}
                                </span>
                              )}
                              {item.meta.wl && (
                                <span className="text-[11px] text-emerald-700 block whitespace-nowrap">
                                  Wali sudah diinfokan
                                </span>
                              )}
                            </div>
                          ) : item.status === 'sembuh' ? (
                            <div className="space-y-0.5">
                              <span className="font-bold text-emerald-700 block whitespace-nowrap">Sembuh</span>
                              <span className="text-[11px] text-slate-500 font-mono tabular-nums block whitespace-nowrap">
                                {formatTanggalIndo(item.tgl_sembuh)}
                              </span>
                            </div>
                          ) : (
                            <div className="space-y-0.5">
                              <span className="font-bold text-sky-700 block whitespace-nowrap">
                                Dirawat UKS / Pondok
                              </span>
                              {item.meta.wl && (
                                <span className="text-[11px] text-emerald-700 block whitespace-nowrap">
                                  Wali sudah diinfokan
                                </span>
                              )}
                            </div>
                          )}
                        </td>

                        <td className="py-3.5 px-3.5 align-top">
                          <div className="flex flex-col items-end gap-1.5">
                            {/* Baris 1: Aksi Klinis & Izin */}
                            {canEdit && (
                              <div className="flex flex-nowrap items-center justify-end gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => openEditSakitModal(item)}
                                  className="px-2.5 py-1.5 text-[11px] bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg font-semibold whitespace-nowrap shrink-0 transition-colors"
                                >
                                  Periksa
                                </button>

                                {item.status !== 'sembuh' && (
                                  <button
                                    type="button"
                                    onClick={() => handleMarkSembuh(item)}
                                    disabled={saving}
                                    className="px-2.5 py-1.5 text-[11px] bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg font-semibold flex items-center gap-1 whitespace-nowrap shrink-0 transition-colors"
                                  >
                                    <CheckCircle2 className="w-3.5 h-3.5" />
                                    Sembuh
                                  </button>
                                )}

                                {item.status !== 'sembuh' && (
                                  <Link
                                    href={`/perizinan?santri_id=${item.santri_id}&kategori=sakit`}
                                    className="px-2.5 py-1.5 text-[11px] bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 rounded-lg font-semibold whitespace-nowrap shrink-0 transition-colors"
                                  >
                                    Izin Pulang
                                  </Link>
                                )}
                              </div>
                            )}

                            {/* Baris 2: WA Wali, Salin WA Terformat, Surat & Hapus */}
                            <div className="flex flex-nowrap items-center justify-end gap-1.5">
                              {waDigits && (
                                <a
                                  href={`https://wa.me/${waDigits}?text=${encodeURIComponent(waMsg)}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  onClick={() => handleMarkWaliNotified(item)}
                                  className={`px-2.5 py-1.5 text-[11px] rounded-lg font-bold flex items-center gap-1 whitespace-nowrap shrink-0 transition-colors ${
                                    item.status === 'dirujuk'
                                      ? 'bg-rose-600 hover:bg-rose-700 text-white'
                                      : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200'
                                  }`}
                                >
                                  <MessageCircle className="w-3.5 h-3.5" />
                                  WA Wali
                                </a>
                              )}

                              <button
                                type="button"
                                onClick={() => {
                                  navigator.clipboard.writeText(waMsg);
                                  handleMarkWaliNotified(item);
                                  showToast(
                                    'info',
                                    'Teks WA Disalin',
                                    'Pesan berbaris rapi siap ditempel ke WhatsApp wali santri.'
                                  );
                                }}
                                className="px-2.5 py-1.5 text-[11px] bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-semibold flex items-center gap-1 whitespace-nowrap shrink-0 transition-colors"
                              >
                                <Copy className="w-3.5 h-3.5" />
                                Salin WA
                              </button>

                              <button
                                type="button"
                                onClick={() => setPrintTarget(item)}
                                className="px-2.5 py-1.5 text-[11px] bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg font-semibold flex items-center gap-1 whitespace-nowrap shrink-0 transition-colors"
                              >
                                <Printer className="w-3.5 h-3.5" />
                                Surat
                              </button>

                              {canEdit && (
                                <button
                                  type="button"
                                  onClick={() => setDeleteTarget(item)}
                                  title="Hapus catatan sakit"
                                  aria-label={`Hapus catatan sakit ${item.santri?.nama_lengkap || 'santri'}`}
                                  className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition-colors shrink-0"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              )}
                            </div>
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
      )}

      {/* TAB 2: STOK & PEMBERIAN OBAT POSKESTREN */}
      {activeTab === 'obat' && (
        <div className="space-y-4 print:hidden">
          <div className="bg-white p-3.5 sm:p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Cari nama obat, kategori, atau kegunaan..."
                value={obatSearch}
                onChange={(e) => setObatSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 sm:py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-600"
              />
            </div>
            {canEdit && (
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                {obatList.length === 0 && (
                  <button
                    type="button"
                    onClick={handleSeedStarterObat}
                    disabled={saving}
                    className="px-3.5 py-2.5 sm:py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold rounded-xl whitespace-nowrap shrink-0"
                  >
                    Isi Paket Obat Dasar P3K
                  </button>
                )}
                <button
                  type="button"
                  onClick={openCreateObatModal}
                  className="flex-1 sm:flex-none px-4 py-2.5 sm:py-2 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0"
                >
                  <PackagePlus className="w-4 h-4" />
                  Tambah Obat Poskestren
                </button>
              </div>
            )}
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            {/* MOBILE CARD VIEW OBAT */}
            <div className="md:hidden divide-y divide-slate-100">
              {filteredObat.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-400">
                  Belum ada data obat Poskestren. Klik &ldquo;Tambah Obat Poskestren&rdquo; atau
                  &ldquo;Isi Paket Obat Dasar P3K&rdquo;.
                </div>
              ) : (
                filteredObat.map((o) => {
                  const menipis = o.stok <= o.stok_minimum;
                  return (
                    <div key={o.id} className="p-4 space-y-2.5 text-xs">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h3 className="font-bold text-sm text-slate-900">{o.nama_obat}</h3>
                          <span className="text-[11px] text-slate-500">
                            {o.kategori}
                            {o.keterangan ? ` · ${o.keterangan}` : ''}
                          </span>
                        </div>
                        <div className="text-right shrink-0 tabular-nums">
                          <span
                            className={`font-mono font-bold text-sm block ${
                              o.stok === 0
                                ? 'text-rose-700'
                                : menipis
                                ? 'text-amber-700'
                                : 'text-emerald-800'
                            }`}
                          >
                            {o.stok} {o.satuan}
                          </span>
                          <span className="text-[10.5px] text-slate-400">
                            Min {o.stok_minimum}
                            {menipis ? ' · Menipis' : ''}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center justify-between text-[11px] text-slate-500 tabular-nums">
                        <span>
                          Harga:{' '}
                          <strong className="text-slate-700">
                            {o.harga_satuan > 0 ? formatRupiah(o.harga_satuan) : 'Gratis / Stok'}
                          </strong>
                        </span>
                        <span>ED: {o.kadaluarsa ? formatTanggalIndo(o.kadaluarsa) : '-'}</span>
                      </div>
                      {canEdit && (
                        <div className="flex items-center gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() => handleRestockObat(o, 10)}
                            className="flex-1 min-h-[40px] px-3 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-xl font-semibold"
                          >
                            +10 Stok
                          </button>
                          <button
                            type="button"
                            onClick={() => openEditObatModal(o)}
                            className="flex-1 min-h-[40px] px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-semibold"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteObat(o)}
                            title="Hapus obat"
                            className="min-h-[40px] min-w-[40px] bg-slate-100 text-slate-500 hover:text-rose-600 rounded-xl flex items-center justify-center"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            {/* DESKTOP TABLE VIEW OBAT */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-700">
                <thead className="bg-slate-50 border-b border-slate-200 font-bold text-slate-600 uppercase text-[11px]">
                  <tr>
                    <th className="py-3 px-3 w-11 text-center">No</th>
                    <th className="py-3 px-3.5 min-w-[165px]">Nama Obat / P3K</th>
                    <th className="py-3 px-3.5 min-w-[190px]">Kategori &amp; Kegunaan</th>
                    <th className="py-3 px-3.5 w-32 text-right whitespace-nowrap">Stok Tersedia</th>
                    <th className="py-3 px-3.5 w-32 text-right whitespace-nowrap">Harga Satuan</th>
                    <th className="py-3 px-3.5 w-32 whitespace-nowrap">Kedaluwarsa</th>
                    <th className="py-3 px-3.5 w-[200px] text-right whitespace-nowrap">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredObat.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-10 text-center text-slate-400">
                        Belum ada data obat Poskestren. Klik &ldquo;Tambah Obat Poskestren&rdquo;
                        atau &ldquo;Isi Paket Obat Dasar P3K&rdquo;.
                      </td>
                    </tr>
                  ) : (
                    filteredObat.map((o, idx) => {
                      const menipis = o.stok <= o.stok_minimum;
                      return (
                        <tr key={o.id} className="hover:bg-slate-50">
                          <td className="py-3 px-3 text-center font-mono text-slate-400 tabular-nums">
                            {idx + 1}
                          </td>
                          <td className="py-3 px-3.5 font-bold text-slate-900">{o.nama_obat}</td>
                          <td className="py-3 px-3.5">
                            <div className="font-semibold text-slate-700">{o.kategori}</div>
                            {o.keterangan && (
                              <div className="text-[11px] text-slate-500">{o.keterangan}</div>
                            )}
                          </td>
                          <td className="py-3 px-3.5 text-right tabular-nums whitespace-nowrap">
                            <span
                              className={`font-mono font-bold ${
                                o.stok === 0
                                  ? 'text-rose-700'
                                  : menipis
                                  ? 'text-amber-700'
                                  : 'text-emerald-800'
                              }`}
                            >
                              {o.stok} {o.satuan}
                            </span>
                            <div className="text-[11px] text-slate-400">
                              Min {o.stok_minimum} {o.satuan}
                              {menipis ? ' · Menipis' : ''}
                            </div>
                          </td>
                          <td className="py-3 px-3.5 text-right font-mono tabular-nums whitespace-nowrap">
                            {o.harga_satuan > 0 ? formatRupiah(o.harga_satuan) : 'Gratis / Stok'}
                          </td>
                          <td className="py-3 px-3.5 font-mono text-[11px] tabular-nums text-slate-600 whitespace-nowrap">
                            {o.kadaluarsa ? formatTanggalIndo(o.kadaluarsa) : '-'}
                          </td>
                          <td className="py-3 px-3.5">
                            {canEdit ? (
                              <div className="flex flex-nowrap items-center justify-end gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => handleRestockObat(o, 10)}
                                  className="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-lg font-semibold whitespace-nowrap shrink-0"
                                >
                                  +10 Stok
                                </button>
                                <button
                                  type="button"
                                  onClick={() => openEditObatModal(o)}
                                  className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-semibold whitespace-nowrap shrink-0"
                                >
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteObat(o)}
                                  title="Hapus obat"
                                  aria-label="Hapus obat"
                                  className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 shrink-0"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            ) : (
                              <div className="text-right text-[11px] text-slate-400">Hanya Lihat</div>
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

      {/* TAB 3: AGENDA & LAPORAN PENYULUHAN BERSAMA POSKESTREN */}
      {activeTab === 'penyuluhan' && (
        <div className="space-y-4 print:hidden">
          <div className="bg-white p-3.5 sm:p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="text-xs text-slate-600">
              Program kerja Sie Kesehatan (Pedoman Kerja halaman 12):{' '}
              <strong>Mengadakan penyuluhan yang dibutuhkan bersama Poskestren</strong> (PHBS,
              kesehatan kulit, gizi &amp; pencegahan penyakit menular).
            </div>
            {canEdit && (
              <button
                type="button"
                onClick={openCreatePenyuluhanModal}
                className="px-4 py-2.5 sm:py-2 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0"
              >
                <Plus className="w-4 h-4" />
                Agenda Penyuluhan Baru
              </button>
            )}
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            {/* MOBILE CARD VIEW PENYULUHAN */}
            <div className="md:hidden divide-y divide-slate-100">
              {penyuluhanList.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-400">
                  Belum ada agenda penyuluhan bersama Poskestren yang dicatat.
                </div>
              ) : (
                penyuluhanList.map((py) => (
                  <div key={py.id} className="p-4 space-y-2.5 text-xs">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="font-mono text-[11px] font-bold text-slate-600 tabular-nums block">
                          {formatTanggalIndo(py.tanggal)}
                        </span>
                        <h3 className="font-bold text-sm text-slate-900 mt-0.5">{py.judul}</h3>
                      </div>
                      <span
                        className={`font-bold shrink-0 ${
                          py.status === 'terlaksana' ? 'text-emerald-700' : 'text-amber-700'
                        }`}
                      >
                        {py.status === 'terlaksana' ? 'Terlaksana' : 'Terjadwal'}
                      </span>
                    </div>
                    {py.ringkasan && <p className="text-[11px] text-slate-600">{py.ringkasan}</p>}
                    <div className="text-[11px] text-slate-500 flex flex-wrap gap-x-3 gap-y-1 tabular-nums">
                      <span>Narasumber: {py.narasumber}</span>
                      <span>Sasaran: {py.sasaran}</span>
                      <span>Peserta: {py.jumlah_peserta || 0} santri</span>
                    </div>
                    {canEdit && (
                      <div className="flex items-center gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => handleTogglePenyuluhanStatus(py)}
                          className="flex-1 min-h-[40px] px-3 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-xl font-semibold"
                        >
                          {py.status === 'terlaksana' ? 'Set Terjadwal' : 'Tandai Terlaksana'}
                        </button>
                        <button
                          type="button"
                          onClick={() => openEditPenyuluhanModal(py)}
                          className="min-h-[40px] px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-semibold"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeletePenyuluhan(py)}
                          title="Hapus penyuluhan"
                          className="min-h-[40px] min-w-[40px] bg-slate-100 text-slate-500 hover:text-rose-600 rounded-xl flex items-center justify-center"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>

            {/* DESKTOP TABLE VIEW PENYULUHAN */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-700">
                <thead className="bg-slate-50 border-b border-slate-200 font-bold text-slate-600 uppercase text-[11px]">
                  <tr>
                    <th className="py-3 px-3 w-11 text-center">No</th>
                    <th className="py-3 px-3.5 w-32 whitespace-nowrap">Tanggal</th>
                    <th className="py-3 px-3.5 min-w-[215px]">Tema Penyuluhan &amp; Ringkasan</th>
                    <th className="py-3 px-3.5 min-w-[175px]">Narasumber &amp; Sasaran</th>
                    <th className="py-3 px-3.5 w-24 text-right whitespace-nowrap">Peserta</th>
                    <th className="py-3 px-3.5 w-28 whitespace-nowrap">Status</th>
                    <th className="py-3 px-3.5 w-[230px] text-right whitespace-nowrap">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {penyuluhanList.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-10 text-center text-slate-400">
                        Belum ada agenda penyuluhan bersama Poskestren yang dicatat.
                      </td>
                    </tr>
                  ) : (
                    penyuluhanList.map((py, idx) => (
                      <tr key={py.id} className="hover:bg-slate-50">
                        <td className="py-3 px-3 text-center font-mono text-slate-400 tabular-nums">
                          {idx + 1}
                        </td>
                        <td className="py-3 px-3.5 font-mono text-[11px] font-bold text-slate-800 tabular-nums whitespace-nowrap">
                          {formatTanggalIndo(py.tanggal)}
                        </td>
                        <td className="py-3 px-3.5">
                          <div className="font-bold text-slate-900">{py.judul}</div>
                          {py.ringkasan && (
                            <div className="text-[11px] text-slate-500 mt-0.5 max-w-md">
                              {py.ringkasan}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-3.5">
                          <div className="font-semibold text-slate-800">{py.narasumber}</div>
                          <div className="text-[11px] text-slate-500">Sasaran: {py.sasaran}</div>
                        </td>
                        <td className="py-3 px-3.5 text-right font-mono font-bold tabular-nums whitespace-nowrap">
                          {py.jumlah_peserta || 0} santri
                        </td>
                        <td className="py-3 px-3.5 whitespace-nowrap">
                          <span
                            className={`font-bold ${
                              py.status === 'terlaksana' ? 'text-emerald-700' : 'text-amber-700'
                            }`}
                          >
                            {py.status === 'terlaksana' ? 'Terlaksana' : 'Terjadwal'}
                          </span>
                        </td>
                        <td className="py-3 px-3.5">
                          {canEdit ? (
                            <div className="flex flex-nowrap items-center justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => handleTogglePenyuluhanStatus(py)}
                                className="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-lg font-semibold whitespace-nowrap shrink-0"
                              >
                                {py.status === 'terlaksana' ? 'Set Terjadwal' : 'Tandai Terlaksana'}
                              </button>
                              <button
                                type="button"
                                onClick={() => openEditPenyuluhanModal(py)}
                                className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-semibold whitespace-nowrap shrink-0"
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeletePenyuluhan(py)}
                                title="Hapus penyuluhan"
                                aria-label="Hapus penyuluhan"
                                className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 shrink-0"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          ) : (
                            <div className="text-right text-[11px] text-slate-400">Hanya Lihat</div>
                          )}
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

      {/* TAB 4: REKAP KESEHATAN & LAPORAN */}
      {activeTab === 'rekap' && (
        <div className="space-y-4 print:hidden">
          <div className="bg-white p-3.5 sm:p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div className="grid grid-cols-1 sm:flex sm:flex-wrap items-center gap-2 text-xs">
              <span className="font-semibold text-slate-600 flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-emerald-700" />
                Periode Tanggal Sakit:
              </span>
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={rekapStartDate}
                  onChange={(e) => setRekapStartDate(e.target.value)}
                  className="flex-1 sm:flex-none px-3 py-2 sm:py-1.5 bg-slate-50 border border-slate-200 rounded-xl font-semibold text-slate-800"
                />
                <span className="text-slate-400">s/d</span>
                <input
                  type="date"
                  value={rekapEndDate}
                  onChange={(e) => setRekapEndDate(e.target.value)}
                  className="flex-1 sm:flex-none px-3 py-2 sm:py-1.5 bg-slate-50 border border-slate-200 rounded-xl font-semibold text-slate-800"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600 tabular-nums">
              <span>
                Total: <strong className="text-slate-900">{rekapSummary.total}</strong>
              </span>
              <span aria-hidden="true">&middot;</span>
              <span>
                UKS: <strong className="text-sky-700">{rekapSummary.dirawat}</strong>
              </span>
              <span aria-hidden="true">&middot;</span>
              <span>
                Dirujuk: <strong className="text-rose-700">{rekapSummary.dirujuk}</strong>
              </span>
              <span aria-hidden="true">&middot;</span>
              <span>
                Sembuh: <strong className="text-emerald-700">{rekapSummary.sembuh}</strong>
              </span>
              <span aria-hidden="true">&middot;</span>
              <span>
                Biaya Luar:{' '}
                <strong className="text-slate-900">{formatRupiah(rekapSummary.totalBiaya)}</strong>
              </span>
            </div>
          </div>

          {rekapSummary.topKeluhan.length > 0 && (
            <div className="bg-white p-3.5 sm:p-4 rounded-2xl border border-slate-200 shadow-xs text-xs">
              <div className="font-bold text-slate-800 mb-2">
                Keluhan / Diagnosa Terbanyak pada Periode Ini
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3">
                {rekapSummary.topKeluhan.map(([label, count]) => (
                  <div
                    key={label}
                    className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between gap-2"
                  >
                    <span className="font-medium text-slate-700 truncate">{label}</span>
                    <strong className="font-mono text-slate-900 tabular-nums shrink-0">
                      {count}x
                    </strong>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            {/* MOBILE CARD VIEW REKAP */}
            <div className="md:hidden divide-y divide-slate-100">
              {rekapFilteredItems.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-400">
                  Belum ada data kesehatan pada rentang tanggal ini.
                </div>
              ) : (
                rekapFilteredItems.map((item) => (
                  <div key={item.id} className="p-4 space-y-1.5 text-xs">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-bold text-slate-900">
                          {item.santri?.nama_lengkap || '-'}
                        </div>
                        <div className="text-[11px] text-slate-500">
                          Kamar {item.santri?.kamar || '-'} &middot; {formatTanggalIndo(item.tgl_sakit)} ({item.durasiHari} hr)
                        </div>
                      </div>
                      <span
                        className={`font-bold shrink-0 ${
                          item.status === 'dirujuk'
                            ? 'text-rose-700'
                            : item.status === 'sembuh'
                            ? 'text-emerald-700'
                            : 'text-sky-700'
                        }`}
                      >
                        {item.status === 'rawat_uks'
                          ? 'Dirawat UKS'
                          : item.status === 'dirujuk'
                          ? 'Dirujuk'
                          : 'Sembuh'}
                      </span>
                    </div>
                    <div className="text-slate-700">
                      Keluhan: <strong>{item.keluhan}</strong>
                      {item.diagnosa ? ` (${item.diagnosa})` : ''}
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-slate-500 tabular-nums">
                      <span>{item.meta.lk}</span>
                      <span className="font-mono font-semibold text-slate-800">
                        {item.meta.by > 0 ? formatRupiah(item.meta.by) : 'Biaya -'}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* DESKTOP TABLE VIEW REKAP */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-700">
                <thead className="bg-slate-50 border-b border-slate-200 font-bold text-slate-600 uppercase text-[11px]">
                  <tr>
                    <th className="py-3 px-3 w-11 text-center">No</th>
                    <th className="py-3 px-3.5 w-36 whitespace-nowrap">Tanggal &amp; Durasi</th>
                    <th className="py-3 px-3.5 min-w-[165px]">Santri &amp; Kamar</th>
                    <th className="py-3 px-3.5 min-w-[180px]">Keluhan &amp; Diagnosa</th>
                    <th className="py-3 px-3.5 min-w-[175px]">Lokasi &amp; Obat</th>
                    <th className="py-3 px-3.5 w-28 text-right whitespace-nowrap">Biaya Luar</th>
                    <th className="py-3 px-3.5 w-28 whitespace-nowrap">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rekapFilteredItems.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-slate-400">
                        Belum ada data kesehatan pada rentang tanggal ini.
                      </td>
                    </tr>
                  ) : (
                    rekapFilteredItems.map((item, idx) => (
                      <tr key={item.id} className="hover:bg-slate-50">
                        <td className="py-3 px-3 text-center font-mono text-slate-400 tabular-nums">
                          {idx + 1}
                        </td>
                        <td className="py-3 px-3.5 font-mono text-[11px] tabular-nums whitespace-nowrap">
                          <div className="font-bold text-slate-800">
                            {formatTanggalIndo(item.tgl_sakit)}
                          </div>
                          <div className="text-slate-500">Durasi {item.durasiHari} hari</div>
                        </td>
                        <td className="py-3 px-3.5">
                          <div className="font-semibold text-slate-900">
                            {item.santri?.nama_lengkap || '-'}
                          </div>
                          <div className="text-[11px] text-slate-500 whitespace-nowrap">
                            Kamar {item.santri?.kamar || '-'}
                          </div>
                        </td>
                        <td className="py-3 px-3.5">
                          <div className="font-semibold text-slate-800">{item.keluhan}</div>
                          {item.diagnosa && (
                            <div className="text-[11px] text-slate-500">{item.diagnosa}</div>
                          )}
                        </td>
                        <td className="py-3 px-3.5">
                          <div className="font-medium text-slate-800">{item.meta.lk}</div>
                          <div className="text-[11px] text-slate-500">
                            {item.meta.ob.map((o) => `${o.nama} (${o.qty}x)`).join(', ') || '-'}
                          </div>
                        </td>
                        <td className="py-3 px-3.5 text-right font-mono tabular-nums whitespace-nowrap">
                          {item.meta.by > 0 ? formatRupiah(item.meta.by) : '-'}
                        </td>
                        <td className="py-3 px-3.5 whitespace-nowrap">
                          <span
                            className={`font-bold ${
                              item.status === 'dirujuk'
                                ? 'text-rose-700'
                                : item.status === 'sembuh'
                                ? 'text-emerald-700'
                                : 'text-sky-700'
                            }`}
                          >
                            {item.status === 'rawat_uks'
                              ? 'Dirawat UKS'
                              : item.status === 'dirujuk'
                              ? 'Dirujuk'
                              : 'Sembuh'}
                          </span>
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

      {/* MODAL CATAT / PERIKSA SANTRI SAKIT */}
      {showSakitModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 print:hidden">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden">
            <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-6 py-4 shrink-0 bg-white">
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  {editingSakit
                    ? 'Perbarui Pemeriksaan & Kondisi Santri'
                    : 'Catat Santri Sakit / Pemeriksaan Poskestren'}
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Layanan Sie Kesehatan &amp; Poskestren Pondok Pesantren An-Nur 1
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowSakitModal(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveSakit} className="flex flex-col flex-1 min-h-0 text-xs">
              <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
                {/* 1. PILIH SANTRI (UNIFIED SEARCHABLE COMBOBOX) */}
                <div className="space-y-1.5 relative">
                  <label className="font-bold text-slate-700 block">
                    1. Cari &amp; Pilih Santri
                  </label>
                  {selectedFormSantri ? (
                    <div className="flex items-center justify-between gap-3 px-3.5 py-2.5 bg-emerald-50/80 border border-emerald-600 rounded-xl">
                      <div className="min-w-0">
                        <div className="font-bold text-emerald-950 truncate">
                          {selectedFormSantri.nama_lengkap}
                        </div>
                        <div className="text-[11px] text-emerald-800 mt-0.5 tabular-nums">
                          Kamar <strong>{selectedFormSantri.kamar}</strong> &middot; NIS{' '}
                          <span className="font-mono">{selectedFormSantri.nis}</span>
                        </div>
                      </div>
                      {!editingSakit && (
                        <button
                          type="button"
                          onClick={() => {
                            setFormSantriId('');
                            setSantriSearch('');
                            setSantriDropdownOpen(true);
                          }}
                          className="px-2.5 py-1 bg-white hover:bg-emerald-100 text-emerald-900 border border-emerald-300 rounded-lg font-semibold text-[11px] shrink-0 flex items-center gap-1"
                        >
                          <X className="w-3.5 h-3.5" />
                          Ganti
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="relative">
                      <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        type="text"
                        placeholder="Ketik nama, NIS, atau kamar santri..."
                        value={santriSearch}
                        onFocus={() => setSantriDropdownOpen(true)}
                        onBlur={() => setTimeout(() => setSantriDropdownOpen(false), 160)}
                        onChange={(e) => {
                          setSantriSearch(e.target.value);
                          setSantriDropdownOpen(true);
                        }}
                        className="w-full pl-10 pr-24 py-2.5 bg-white border border-slate-300 rounded-xl font-medium text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-600"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-slate-400 tabular-nums pointer-events-none">
                        {selectableSantri.length} santri
                      </span>

                      {santriDropdownOpen && (
                        <div className="absolute left-0 right-0 top-full mt-1.5 z-30 bg-white border border-slate-200 rounded-xl shadow-xl max-h-60 overflow-y-auto divide-y divide-slate-100">
                          {selectableSantri.length === 0 ? (
                            <div className="px-4 py-3 text-slate-400 text-center">
                              Santri tidak ditemukan untuk kata kunci &ldquo;{santriSearch}&rdquo;
                            </div>
                          ) : (
                            selectableSantri.slice(0, 60).map((s) => (
                              <button
                                key={s.id}
                                type="button"
                                onMouseDown={(e) => {
                                  e.preventDefault();
                                  setFormSantriId(s.id);
                                  setSantriSearch(s.nama_lengkap);
                                  setSantriDropdownOpen(false);
                                }}
                                className="w-full px-3.5 py-2.5 text-left hover:bg-emerald-50 flex items-center justify-between gap-3 transition-colors"
                              >
                                <div className="min-w-0">
                                  <div className="font-semibold text-slate-900 truncate">
                                    {s.nama_lengkap}
                                  </div>
                                  <div className="text-[11px] text-slate-500">Kamar {s.kamar}</div>
                                </div>
                                <span className="text-[11px] font-mono text-slate-500 bg-slate-100 px-2 py-0.5 rounded shrink-0">
                                  {s.nis}
                                </span>
                              </button>
                            ))
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* TANGGAL, LOKASI & PETUGAS */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Tanggal Sakit</label>
                    <input
                      type="date"
                      required
                      value={formTglSakit}
                      onChange={(e) => setFormTglSakit(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl font-semibold"
                    />
                  </div>

                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Lokasi Rawat</label>
                    <select
                      value={formLokasi}
                      onChange={(e) => setFormLokasi(e.target.value as LokasiPerawatan)}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl font-semibold text-slate-800"
                    >
                      <option value="Poskestren">Poskestren (UKS)</option>
                      <option value="Kamar">Istirahat di Kamar</option>
                      <option value="Klinik / Puskesmas">Klinik / Puskesmas</option>
                      <option value="Rumah Sakit">Rumah Sakit</option>
                    </select>
                  </div>

                  <div className="relative">
                    <label className="font-bold text-slate-700 block mb-1">
                      Petugas Sie Kesehatan
                    </label>
                    <div className="relative">
                      <UserCheck className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        type="text"
                        placeholder="Ketik nama pengurus..."
                        value={formPetugasText}
                        onFocus={() => setPetugasDropdownOpen(true)}
                        onBlur={() => setTimeout(() => setPetugasDropdownOpen(false), 160)}
                        onChange={(e) => {
                          setFormPetugasText(e.target.value);
                          setPetugasDropdownOpen(true);
                        }}
                        className="w-full pl-9 pr-7 py-2 bg-white border border-slate-300 rounded-xl font-semibold text-slate-800 placeholder:text-slate-400 placeholder:font-normal focus:outline-none focus:ring-2 focus:ring-emerald-600"
                      />
                      {formPetugasText && (
                        <button
                          type="button"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            setFormPetugasText('');
                            setPetugasDropdownOpen(true);
                          }}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {petugasDropdownOpen && (
                        <div className="absolute left-0 right-0 top-full mt-1.5 z-30 bg-white border border-slate-200 rounded-xl shadow-xl max-h-44 overflow-y-auto divide-y divide-slate-100">
                          {selectablePengurus.length === 0 ? (
                            <button
                              type="button"
                              onMouseDown={(e) => {
                                e.preventDefault();
                                setPetugasDropdownOpen(false);
                              }}
                              className="w-full px-3 py-2 text-left text-slate-600 hover:bg-slate-50"
                            >
                              {formPetugasText.trim()
                                ? `Gunakan nama: "${formPetugasText.trim()}"`
                                : 'Belum ada daftar pengurus'}
                            </button>
                          ) : (
                            selectablePengurus.map((p) => (
                              <button
                                key={p.id}
                                type="button"
                                onMouseDown={(e) => {
                                  e.preventDefault();
                                  setFormPetugasText(p.nama_lengkap);
                                  setPetugasDropdownOpen(false);
                                }}
                                className="w-full px-3 py-2 text-left hover:bg-emerald-50 text-slate-800 font-medium"
                              >
                                {p.nama_lengkap}
                              </button>
                            ))
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* KELUHAN, DIAGNOSA & TANDA VITAL */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Keluhan Utama</label>
                    <input
                      type="text"
                      required
                      placeholder="Contoh: Demam tinggi, pusing, gatal kulit..."
                      value={formKeluhan}
                      onChange={(e) => setFormKeluhan(e.target.value)}
                      className="w-full px-3.5 py-2 bg-white border border-slate-300 rounded-xl"
                    />
                  </div>
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">
                      Diagnosa / Hasil Periksa Poskestren
                    </label>
                    <input
                      type="text"
                      placeholder="Contoh: ISPA ringan / Observasi demam..."
                      value={formDiagnosa}
                      onChange={(e) => setFormDiagnosa(e.target.value)}
                      className="w-full px-3.5 py-2 bg-white border border-slate-300 rounded-xl"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="font-bold text-slate-700 flex items-center gap-1 mb-1">
                      <Thermometer className="w-3.5 h-3.5 text-slate-400" />
                      Suhu Tubuh (°C)
                    </label>
                    <input
                      type="text"
                      placeholder="38.2"
                      value={formSuhu}
                      onChange={(e) => setFormSuhu(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl font-mono"
                    />
                  </div>
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Tensi Darah</label>
                    <input
                      type="text"
                      placeholder="110/70"
                      value={formTensi}
                      onChange={(e) => setFormTensi(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl font-mono"
                    />
                  </div>
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">
                      Biaya Berobat Luar (Rp)
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={formBiaya}
                      onChange={(e) => setFormBiaya(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl font-mono"
                    />
                  </div>
                </div>

                {/* PEMBERIAN OBAT POSKESTREN */}
                <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2.5">
                  <div className="font-bold text-slate-800 flex items-center justify-between">
                    <span>Pemberian Obat (Otomatis Potong Stok Poskestren)</span>
                    <span className="text-[11px] font-normal text-slate-500">
                      {formObatItems.length} item dipilih
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                    <div className="sm:col-span-5">
                      {obatList.length > 0 ? (
                        <select
                          value={selectedObatIdToAdd}
                          onChange={(e) => setSelectedObatIdToAdd(e.target.value)}
                          className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl font-medium"
                        >
                          <option value="">-- Pilih dari Stok Poskestren --</option>
                          {obatList.map((o) => (
                            <option key={o.id} value={o.id} disabled={o.stok <= 0}>
                              {o.nama_obat} (Sisa {o.stok} {o.satuan})
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          type="text"
                          placeholder="Nama obat diberikan..."
                          value={customObatName}
                          onChange={(e) => setCustomObatName(e.target.value)}
                          className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl"
                        />
                      )}
                    </div>
                    <div className="sm:col-span-4">
                      <input
                        type="text"
                        placeholder="Aturan pakai (3x1)"
                        value={customObatDosis}
                        onChange={(e) => setCustomObatDosis(e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl"
                      />
                    </div>
                    <div className="sm:col-span-1">
                      <input
                        type="number"
                        min={1}
                        value={customObatQty}
                        onChange={(e) => setCustomObatQty(e.target.value)}
                        className="w-full px-2 py-2 bg-white border border-slate-300 rounded-xl font-mono text-center"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <button
                        type="button"
                        onClick={handleAddObatToForm}
                        className="w-full py-2 bg-emerald-700 hover:bg-emerald-800 text-white font-bold rounded-xl"
                      >
                        + Obat
                      </button>
                    </div>
                  </div>

                  {obatList.length > 0 && (
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        placeholder="Atau ketik nama obat di luar katalog lalu klik + Obat..."
                        value={customObatName}
                        onChange={(e) => {
                          setCustomObatName(e.target.value);
                          setSelectedObatIdToAdd('');
                        }}
                        className="flex-1 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-[11px]"
                      />
                    </div>
                  )}

                  {formObatItems.length > 0 && (
                    <div className="divide-y divide-slate-200 bg-white border border-slate-200 rounded-xl">
                      {formObatItems.map((ob, idx) => (
                        <div
                          key={`${ob.nama}-${idx}`}
                          className="px-3 py-2 flex items-center justify-between gap-2 text-[11px]"
                        >
                          <div>
                            <strong className="text-slate-900">{ob.nama}</strong> &middot;{' '}
                            <span className="font-mono">{ob.qty}x</span> &middot;{' '}
                            <span className="text-slate-600">{ob.dosis}</span>
                          </div>
                          <button
                            type="button"
                            onClick={() =>
                              setFormObatItems((prev) => prev.filter((_, i) => i !== idx))
                            }
                            className="text-rose-600 hover:underline font-semibold"
                          >
                            Hapus
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">
                    Tindakan / Arahan Poskestren
                  </label>
                  <textarea
                    rows={2}
                    placeholder="Contoh: Kompres hangat, istirahat 1 hari dari kegiatan sekolah, pantau suhu malam..."
                    value={formTindakanText}
                    onChange={(e) => setFormTindakanText(e.target.value)}
                    className="w-full px-3.5 py-2 bg-white border border-slate-300 rounded-xl"
                  />
                </div>

                {/* STATUS PENANGANAN & RUJUKAN */}
                <div className="space-y-2">
                  <label className="font-bold text-slate-700 block">Status Kondisi Saat Ini</label>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => setFormStatus('rawat_uks')}
                      className={`p-3 rounded-xl border text-left transition-colors ${
                        formStatus === 'rawat_uks'
                          ? 'bg-sky-50 border-sky-600 text-sky-950 font-bold'
                          : 'bg-slate-50 border-slate-200 text-slate-700'
                      }`}
                    >
                      Dirawat UKS / Pondok
                    </button>
                    <button
                      type="button"
                      onClick={() => setFormStatus('dirujuk')}
                      className={`p-3 rounded-xl border text-left transition-colors ${
                        formStatus === 'dirujuk'
                          ? 'bg-rose-50 border-rose-600 text-rose-950 font-bold'
                          : 'bg-slate-50 border-slate-200 text-slate-700'
                      }`}
                    >
                      Dirujuk / Pantauan Wali
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setFormStatus('sembuh');
                        if (!formTglSembuh) setFormTglSembuh(todayStr || getLocalTodayStr());
                      }}
                      className={`p-3 rounded-xl border text-left transition-colors ${
                        formStatus === 'sembuh'
                          ? 'bg-emerald-50 border-emerald-600 text-emerald-950 font-bold'
                          : 'bg-slate-50 border-slate-200 text-slate-700'
                      }`}
                    >
                      Sudah Sembuh
                    </button>
                  </div>
                </div>

                {formStatus === 'dirujuk' && (
                  <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="font-bold text-rose-900 block mb-1">
                        Tujuan Rujukan (Klinik / RS / Pulang)
                      </label>
                      <input
                        type="text"
                        placeholder="Contoh: Puskesmas Bululawang / RS Mitra Delima"
                        value={formTempatRujukan}
                        onChange={(e) => setFormTempatRujukan(e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-rose-300 rounded-xl"
                      />
                    </div>
                    <div>
                      <label className="font-bold text-rose-900 block mb-1">
                        Alasan Rujukan / Pesan ke Wali
                      </label>
                      <input
                        type="text"
                        placeholder="Sudah lewat batas kendali Poskestren..."
                        value={formCatatanRujukan}
                        onChange={(e) => setFormCatatanRujukan(e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-rose-300 rounded-xl"
                      />
                    </div>
                  </div>
                )}

                {formStatus === 'sembuh' && (
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Tanggal Sembuh</label>
                    <input
                      type="date"
                      value={formTglSembuh}
                      onChange={(e) => setFormTglSembuh(e.target.value)}
                      className="w-full sm:w-56 px-3 py-2 bg-white border border-slate-300 rounded-xl font-semibold"
                    />
                  </div>
                )}

                <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formPeriksaPoskestren}
                    onChange={(e) => setFormPeriksaPoskestren(e.target.checked)}
                    className="rounded border-slate-300 text-emerald-700 focus:ring-emerald-600"
                  />
                  <span>Sudah diperiksa &amp; ditangani di Poskestren</span>
                </label>
              </div>

              <div className="px-6 py-4 border-t border-slate-200 bg-slate-50/70 flex items-center justify-end gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setShowSakitModal(false)}
                  className="px-4 py-2 bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 font-bold rounded-xl"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 bg-emerald-700 hover:bg-emerald-800 disabled:bg-slate-300 text-white font-bold rounded-xl shadow-xs"
                >
                  {saving ? 'Menyimpan...' : editingSakit ? 'Simpan Perubahan' : 'Simpan Catatan Sakit'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL TAMBAH / EDIT OBAT POSKESTREN */}
      {showObatModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 print:hidden">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-lg w-full max-h-[90vh] flex flex-col overflow-hidden">
            <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-6 py-4 shrink-0">
              <h2 className="text-base font-bold text-slate-900">
                {editingObat ? 'Edit Obat Poskestren' : 'Tambah Obat Poskestren'}
              </h2>
              <button
                type="button"
                onClick={() => setShowObatModal(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSaveObat} className="flex flex-col flex-1 min-h-0 text-xs">
              <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Nama Obat / Alat P3K</label>
                  <input
                    type="text"
                    required
                    placeholder="Contoh: Paracetamol 500mg"
                    value={obatNama}
                    onChange={(e) => setObatNama(e.target.value)}
                    className="w-full px-3.5 py-2 bg-white border border-slate-300 rounded-xl"
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Kategori</label>
                    <select
                      value={obatKategori}
                      onChange={(e) => setObatKategori(e.target.value as KategoriObat)}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl font-semibold"
                    >
                      <option value="Obat Bebas">Obat Bebas</option>
                      <option value="P3K & Luka">P3K &amp; Luka</option>
                      <option value="Kulit & Salep">Kulit &amp; Salep</option>
                      <option value="Vitamin & Suplemen">Vitamin &amp; Suplemen</option>
                    </select>
                  </div>
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Satuan</label>
                    <input
                      type="text"
                      placeholder="tablet / kapsul / botol / tube"
                      value={obatSatuan}
                      onChange={(e) => setObatSatuan(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Stok Saat Ini</label>
                    <input
                      type="number"
                      min={0}
                      value={obatStok}
                      onChange={(e) => setObatStok(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl font-mono"
                    />
                  </div>
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Batas Minimum</label>
                    <input
                      type="number"
                      min={0}
                      value={obatMin}
                      onChange={(e) => setObatMin(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl font-mono"
                    />
                  </div>
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Harga Satuan (Rp)</label>
                    <input
                      type="number"
                      min={0}
                      value={obatHarga}
                      onChange={(e) => setObatHarga(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl font-mono"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Tanggal Kedaluwarsa</label>
                    <input
                      type="date"
                      value={obatKadaluarsa}
                      onChange={(e) => setObatKadaluarsa(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl"
                    />
                  </div>
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Kegunaan / Catatan</label>
                    <input
                      type="text"
                      placeholder="Demam, batuk, luka..."
                      value={obatKet}
                      onChange={(e) => setObatKet(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl"
                    />
                  </div>
                </div>
              </div>
              <div className="px-6 py-4 border-t border-slate-200 bg-slate-50/70 flex justify-end gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setShowObatModal(false)}
                  className="px-4 py-2 bg-white border border-slate-300 rounded-xl font-bold text-slate-700"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl font-bold"
                >
                  {saving ? 'Menyimpan...' : 'Simpan Obat'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL AGENDA PENYULUHAN */}
      {showPenyuluhanModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 print:hidden">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-lg w-full max-h-[90vh] flex flex-col overflow-hidden">
            <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-6 py-4 shrink-0">
              <h2 className="text-base font-bold text-slate-900">
                {editingPenyuluhan ? 'Edit Agenda Penyuluhan' : 'Agenda Penyuluhan Poskestren'}
              </h2>
              <button
                type="button"
                onClick={() => setShowPenyuluhanModal(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSavePenyuluhan} className="flex flex-col flex-1 min-h-0 text-xs">
              <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Tanggal Kegiatan</label>
                    <input
                      type="date"
                      required
                      value={pyTanggal}
                      onChange={(e) => setPyTanggal(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl font-semibold"
                    />
                  </div>
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Status</label>
                    <select
                      value={pyStatus}
                      onChange={(e) => setPyStatus(e.target.value as StatusPenyuluhan)}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl font-semibold"
                    >
                      <option value="terjadwal">Terjadwal</option>
                      <option value="terlaksana">Terlaksana</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">
                    Tema / Judul Penyuluhan
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Contoh: Penyuluhan PHBS & Pencegahan Penyakit Kulit"
                    value={pyJudul}
                    onChange={(e) => setPyJudul(e.target.value)}
                    className="w-full px-3.5 py-2 bg-white border border-slate-300 rounded-xl"
                  />
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="col-span-2">
                    <label className="font-bold text-slate-700 block mb-1">
                      Narasumber / Instansi
                    </label>
                    <input
                      type="text"
                      value={pyNarasumber}
                      onChange={(e) => setPyNarasumber(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl"
                    />
                  </div>
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Jml Peserta</label>
                    <input
                      type="number"
                      min={0}
                      value={pyPeserta}
                      onChange={(e) => setPyPeserta(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl font-mono"
                    />
                  </div>
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Sasaran Peserta</label>
                  <input
                    type="text"
                    placeholder="Contoh: Seluruh Santri Baru / Kamar A1-A10"
                    value={pySasaran}
                    onChange={(e) => setPySasaran(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">
                    Ringkasan Materi &amp; Hasil Evaluasi
                  </label>
                  <textarea
                    rows={3}
                    placeholder="Poin materi penyuluhan dan tindak lanjut kebersihan kamar..."
                    value={pyRingkasan}
                    onChange={(e) => setPyRingkasan(e.target.value)}
                    className="w-full px-3.5 py-2 bg-white border border-slate-300 rounded-xl"
                  />
                </div>
              </div>
              <div className="px-6 py-4 border-t border-slate-200 bg-slate-50/70 flex justify-end gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setShowPenyuluhanModal(false)}
                  className="px-4 py-2 bg-white border border-slate-300 rounded-xl font-bold text-slate-700"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl font-bold"
                >
                  {saving ? 'Menyimpan...' : 'Simpan Agenda'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL PRATINJAU CETAK SURAT KETERANGAN SAKIT / RUJUKAN */}
      {printTarget && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 print:hidden">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-xl w-full max-h-[90vh] overflow-y-auto p-5 sm:p-6 space-y-4">
            <div className="flex items-start justify-between gap-3 border-b border-slate-200 pb-3">
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  Pratinjau Surat Keterangan Kesehatan
                </h2>
                <p className="text-xs text-slate-500">
                  {printTarget.meta.ns || '-'} &middot; {printTarget.santri?.nama_lengkap}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPrintTarget(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-xs space-y-2">
              <div className="flex justify-between gap-2">
                <span className="text-slate-500">Santri &amp; Kamar:</span>
                <strong>
                  {printTarget.santri?.nama_lengkap} (Kamar {printTarget.santri?.kamar})
                </strong>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-slate-500">Keluhan / Diagnosa:</span>
                <span>
                  {printTarget.keluhan}
                  {printTarget.diagnosa ? ` (${printTarget.diagnosa})` : ''}
                </span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-slate-500">Status:</span>
                <strong>
                  {printTarget.status === 'dirujuk'
                    ? `Dirujuk (${printTarget.meta.rj || 'Luar Pondok'})`
                    : printTarget.status === 'sembuh'
                    ? 'Sembuh'
                    : `Dirawat (${printTarget.meta.lk})`}
                </strong>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setPrintTarget(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl"
              >
                Tutup
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl flex items-center gap-2"
              >
                <Printer className="w-4 h-4" />
                Cetak Surat Resmi
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL KONFIRMASI HAPUS */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 print:hidden">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-sm w-full p-6 space-y-4 text-xs">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-6 h-6 text-rose-600 shrink-0" />
              <div>
                <h3 className="text-sm font-bold text-slate-900">Hapus Catatan Sakit?</h3>
                <p className="text-slate-600 mt-1">
                  Rekam sakit milik <strong>{deleteTarget.santri?.nama_lengkap}</strong> (
                  {formatTanggalIndo(deleteTarget.tgl_sakit)}) akan dihapus permanen.
                </p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={handleDeleteSakit}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl"
              >
                {deleting ? 'Menghapus...' : 'Ya, Hapus'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
