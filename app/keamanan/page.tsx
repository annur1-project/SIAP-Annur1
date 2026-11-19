'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import * as XLSX from 'xlsx';
import {
  ShieldAlert,
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
  Package,
  Award,
  SlidersHorizontal,
  ArrowRight,
  Clock,
  Edit3,
  Undo2,
  FileText,
} from 'lucide-react';

type ActiveTab = 'pelanggaran' | 'poin' | 'sita' | 'master';
type TingkatPelanggaran = 'ringan' | 'sedang' | 'berat';
type StatusTakzir = 'belum_selesai' | 'selesai';
type StatusSita = 'disita' | 'dikembalikan' | 'dimusnahkan';
type KategoriBarang = 'HP / Smartphone' | 'Rokok / Vape' | 'Uang Berlebih' | 'Alat Elektronik' | 'Lainnya';

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

interface IzinPulangRaw {
  id: string;
  santri_id: string;
  jenis_izin: 'tidak_menginap' | 'menginap';
  tgl_pulang: string;
  tgl_rencana_kembali: string;
  tgl_aktual_kembali: string | null;
  alasan: string | null;
  status: 'disetujui' | 'kembali' | 'terlambat';
}

interface MasterPelanggaranItem {
  id: string;
  nama_pelanggaran: string;
  tingkat: TingkatPelanggaran;
  poin: number;
  takzir_default: string;
  aktif: boolean;
}

interface PelanggaranRaw {
  id: string;
  santri_id: string;
  master_id: string | null;
  nama_pelanggaran: string;
  tingkat: TingkatPelanggaran;
  poin: number;
  tanggal: string;
  kronologi: string;
  takzir: string;
  status_takzir: StatusTakzir;
  tgl_selesai_takzir: string | null;
  petugas: string;
  wa_terkirim: boolean;
  izin_id: string | null;
  no_surat: string;
  created_at?: string;
}

interface PelanggaranViewItem extends PelanggaranRaw {
  santri?: SantriRow;
}

interface SitaBarangRaw {
  id: string;
  santri_id: string;
  pelanggaran_id: string | null;
  nama_barang: string;
  kategori: KategoriBarang | string;
  jumlah: number;
  tgl_sita: string;
  lokasi_simpan: string;
  petugas_penyita: string;
  status: StatusSita;
  tgl_kembali: string | null;
  penerima_kembali: string | null;
  catatan: string;
  wa_terkirim: boolean;
  no_tanda_terima: string;
  created_at?: string;
}

interface SitaBarangViewItem extends SitaBarangRaw {
  santri?: SantriRow;
}

interface SantriPoinSummary {
  santri: SantriRow;
  totalPoin: number;
  totalKasus: number;
  ringanCount: number;
  sedangCount: number;
  beratCount: number;
  takzirAktif: number;
  spLevel: 0 | 1 | 2 | 3;
  spLabel: string;
  spKeterangan: string;
  kasusList: PelanggaranViewItem[];
  lastTanggal: string;
}

interface OverdueIzinAlert {
  izin: IzinPulangRaw;
  santri?: SantriRow;
  batasJam: string;
  dendaLabel: string;
  keteranganTelat: string;
}

interface ToastState {
  id: number;
  type: 'success' | 'error' | 'info';
  title: string;
  message: string;
}

type PrintDocState =
  | { type: 'ba_pelanggaran'; item: PelanggaranViewItem; totalPoinSantri: number }
  | { type: 'surat_peringatan'; summary: SantriPoinSummary; spTarget: 1 | 2 | 3; nomorSurat: string }
  | { type: 'tanda_terima_sita'; item: SitaBarangViewItem };

const LS_PELANGGARAN_KEY = 'siap_keamanan_pelanggaran_v1';
const LS_SITA_KEY = 'siap_keamanan_sita_v1';
const LS_MASTER_KEY = 'siap_keamanan_master_v1';

const MASTER_KAMAR_ORDER = [
  'A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7', 'A8', 'A9', 'A10',
  'C1', 'C2', 'C3', 'C4', 'C5', 'C6',
  'Al-Fachriyah 1 (VIP)',
  'Al-Fachriyah 2 (VIP)',
  'Al-Fachriyah 3 (VIP)',
  'Al-Fachriyah 4 (VIP)',
  'NDALEM',
];

const KATEGORI_BARANG_LIST: KategoriBarang[] = [
  'HP / Smartphone',
  'Rokok / Vape',
  'Uang Berlebih',
  'Alat Elektronik',
  'Lainnya',
];

const STARTER_MASTER_PELANGGARAN: Omit<MasterPelanggaranItem, 'id'>[] = [
  {
    nama_pelanggaran: 'Terlambat Kembali Izin Pulang',
    tingkat: 'sedang',
    poin: 15,
    takzir_default: 'Takzir kebersihan halaman & wajib lapor keamanan 3 hari',
    aktif: true,
  },
  {
    nama_pelanggaran: 'Tidak Mengikuti Sholat Jamaah Tanpa Udzur',
    tingkat: 'ringan',
    poin: 5,
    takzir_default: 'Membaca istighfar & piket kebersihan masjid/musholla',
    aktif: true,
  },
  {
    nama_pelanggaran: 'Terlambat Kegiatan Pengajian / Diniyah',
    tingkat: 'ringan',
    poin: 5,
    takzir_default: 'Berdiri membaca nadhom / membersihkan ruang kelas',
    aktif: true,
  },
  {
    nama_pelanggaran: 'Tidak Menjaga Kebersihan & Ketertiban Kamar',
    tingkat: 'ringan',
    poin: 5,
    takzir_default: 'Piket kebersihan asrama & halaman kamar',
    aktif: true,
  },
  {
    nama_pelanggaran: 'Keluar Area Pondok Tanpa Surat Izin',
    tingkat: 'sedang',
    poin: 20,
    takzir_default: 'Pembinaan khusus Sie Keamanan & kerja bakti asrama',
    aktif: true,
  },
  {
    nama_pelanggaran: 'Membawa / Menggunakan HP atau Elektronik Terlarang',
    tingkat: 'berat',
    poin: 35,
    takzir_default: 'Penyitaan barang oleh Keamanan & pemanggilan wali santri',
    aktif: true,
  },
  {
    nama_pelanggaran: 'Merokok / Membawa Rokok atau Vape di Pondok',
    tingkat: 'berat',
    poin: 30,
    takzir_default: 'Penyitaan barang, takzir hafalan surat & pembinaan wali',
    aktif: true,
  },
  {
    nama_pelanggaran: 'Berkelahi / Mengintimidasi Sesama Santri',
    tingkat: 'berat',
    poin: 40,
    takzir_default: 'Sidang Sie Keamanan, surat pernyataan & panggilan wali',
    aktif: true,
  },
  {
    nama_pelanggaran: 'Kabur / Pulang Tanpa Izin (Minggat)',
    tingkat: 'berat',
    poin: 50,
    takzir_default: 'Wajib diantar wali menghadap Pengasuh / Kepala Pondok & SP',
    aktif: true,
  },
];

const KEAMANAN_TABLES_SQL = `CREATE TABLE IF NOT EXISTS keamanan_master_pelanggaran (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  nama_pelanggaran text NOT NULL,
  tingkat text NOT NULL DEFAULT 'ringan',
  poin integer NOT NULL DEFAULT 5,
  takzir_default text DEFAULT '',
  aktif boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS keamanan_pelanggaran (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  santri_id uuid NOT NULL,
  master_id text DEFAULT null,
  nama_pelanggaran text NOT NULL,
  tingkat text NOT NULL DEFAULT 'ringan',
  poin integer NOT NULL DEFAULT 5,
  tanggal date NOT NULL,
  kronologi text DEFAULT '',
  takzir text DEFAULT '',
  status_takzir text NOT NULL DEFAULT 'belum_selesai',
  tgl_selesai_takzir date DEFAULT null,
  petugas text DEFAULT 'Sie Keamanan Pondok',
  wa_terkirim boolean NOT NULL DEFAULT false,
  izin_id text DEFAULT null,
  no_surat text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS keamanan_sita_barang (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  santri_id uuid NOT NULL,
  pelanggaran_id text DEFAULT null,
  nama_barang text NOT NULL,
  kategori text NOT NULL DEFAULT 'HP / Smartphone',
  jumlah integer NOT NULL DEFAULT 1,
  tgl_sita date NOT NULL,
  lokasi_simpan text DEFAULT 'Lemari Keamanan Pondok',
  petugas_penyita text DEFAULT 'Sie Keamanan Pondok',
  status text NOT NULL DEFAULT 'disita',
  tgl_kembali date DEFAULT null,
  penerima_kembali text DEFAULT null,
  catatan text DEFAULT '',
  wa_terkirim boolean NOT NULL DEFAULT false,
  no_tanda_terima text DEFAULT '',
  created_at timestamptz DEFAULT now()
);`;

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

function getLocalTimeHm(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
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

function parseIzinBatasJam(alasan?: string | null): { batasJam: string; dn: number } {
  if (!alasan) return { batasJam: '17:00', dn: 0 };
  const marker = '[IZIN_META:';
  const idx = alasan.indexOf(marker);
  if (idx === -1) return { batasJam: '17:00', dn: 0 };
  try {
    const endIdx = alasan.indexOf(']', idx);
    const raw = alasan.slice(idx + marker.length, endIdx);
    const parsed = JSON.parse(raw) as { b?: string; dn?: number };
    const batasJam = typeof parsed.b === 'string' && /^\d{2}:\d{2}$/.test(parsed.b) ? parsed.b : '17:00';
    return { batasJam, dn: Number(parsed.dn || 0) };
  } catch {
    return { batasJam: '17:00', dn: 0 };
  }
}

function getSpClassification(totalPoin: number): {
  level: 0 | 1 | 2 | 3;
  label: string;
  keterangan: string;
} {
  if (totalPoin >= 100) {
    return {
      level: 3,
      label: 'SP 3 (Kritis)',
      keterangan: 'Peringatan Terakhir · Sidang Pengasuh & Wali',
    };
  }
  if (totalPoin >= 50) {
    return {
      level: 2,
      label: 'SP 2',
      keterangan: 'Surat Peringatan 2 & Panggilan Wali Santri',
    };
  }
  if (totalPoin >= 25) {
    return {
      level: 1,
      label: 'SP 1',
      keterangan: 'Surat Peringatan 1 & Pembinaan Sie Keamanan',
    };
  }
  if (totalPoin > 0) {
    return {
      level: 0,
      label: 'Pembinaan',
      keterangan: 'Di bawah ambang SP 1 (< 25 poin)',
    };
  }
  return {
    level: 0,
    label: 'Tertib',
    keterangan: 'Belum ada catatan pelanggaran',
  };
}

function getTingkatStyle(tingkat: TingkatPelanggaran): {
  label: string;
  badgeClass: string;
} {
  if (tingkat === 'berat') {
    return {
      label: 'Berat',
      badgeClass: 'bg-rose-50 text-rose-800 border-rose-200',
    };
  }
  if (tingkat === 'sedang') {
    return {
      label: 'Sedang',
      badgeClass: 'bg-amber-50 text-amber-800 border-amber-200',
    };
  }
  return {
    label: 'Ringan',
    badgeClass: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  };
}

export default function KeamananPage() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('pelanggaran');
  const [todayStr, setTodayStr] = useState<string>('');
  const [currentHm, setCurrentHm] = useState<string>('12:00');

  const [santriList, setSantriList] = useState<SantriRow[]>([]);
  const [pengurusList, setPengurusList] = useState<PengurusRow[]>([]);
  const [izinList, setIzinList] = useState<IzinPulangRaw[]>([]);
  const [masterList, setMasterList] = useState<MasterPelanggaranItem[]>([]);
  const [pelanggaranList, setPelanggaranList] = useState<PelanggaranRaw[]>([]);
  const [sitaList, setSitaList] = useState<SitaBarangRaw[]>([]);

  const [pelanggaranLocalFallback, setPelanggaranLocalFallback] = useState<boolean>(false);
  const [sitaLocalFallback, setSitaLocalFallback] = useState<boolean>(false);
  const [masterLocalFallback, setMasterLocalFallback] = useState<boolean>(false);
  const [showSqlModal, setShowSqlModal] = useState<boolean>(false);

  const [pengaturan, setPengaturan] = useState<PengaturanRow>({
    nama_pesantren: 'Pondok Pesantren An-Nur 1 Bululawang',
    alamat_lengkap: 'Jl. Diponegoro IV / 2-6 Bululawang, Kab. Malang, Jawa Timur',
    no_telepon: '085604551562',
  });

  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [toasts, setToasts] = useState<ToastState[]>([]);

  // Filter Tab 1 (Pelanggaran)
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [filterTingkat, setFilterTingkat] = useState<'semua' | TingkatPelanggaran>('semua');
  const [filterTakzir, setFilterTakzir] = useState<'semua' | StatusTakzir>('semua');
  const [filterKamar, setFilterKamar] = useState<string>('SEMUA');

  // Filter Tab 2 (Poin & SP)
  const [poinSearch, setPoinSearch] = useState<string>('');
  const [filterSpScope, setFilterSpScope] = useState<'berpoin' | 'ambang_sp' | 'semua'>('berpoin');

  // Filter Tab 3 (Sita Barang)
  const [sitaSearch, setSitaSearch] = useState<string>('');
  const [filterSitaStatus, setFilterSitaStatus] = useState<'semua' | StatusSita>('semua');

  // Modal Catat / Edit Pelanggaran
  const [showPelanggaranModal, setShowPelanggaranModal] = useState<boolean>(false);
  const [editingPelanggaran, setEditingPelanggaran] = useState<PelanggaranViewItem | null>(null);
  const [santriSearch, setSantriSearch] = useState<string>('');
  const [santriDropdownOpen, setSantriDropdownOpen] = useState<boolean>(false);
  const [formSantriId, setFormSantriId] = useState<string>('');
  const [formMasterId, setFormMasterId] = useState<string>('');
  const [formNamaPelanggaran, setFormNamaPelanggaran] = useState<string>('');
  const [formTingkat, setFormTingkat] = useState<TingkatPelanggaran>('ringan');
  const [formPoin, setFormPoin] = useState<string>('5');
  const [formTanggal, setFormTanggal] = useState<string>('');
  const [formKronologi, setFormKronologi] = useState<string>('');
  const [formTakzir, setFormTakzir] = useState<string>('');
  const [formStatusTakzir, setFormStatusTakzir] = useState<StatusTakzir>('belum_selesai');
  const [formTglSelesaiTakzir, setFormTglSelesaiTakzir] = useState<string>('');
  const [formPetugasText, setFormPetugasText] = useState<string>('');
  const [petugasDropdownOpen, setPetugasDropdownOpen] = useState<boolean>(false);
  const [formLinkedIzinId, setFormLinkedIzinId] = useState<string | null>(null);
  const [formIncludeSita, setFormIncludeSita] = useState<boolean>(false);
  const [formSitaNama, setFormSitaNama] = useState<string>('');
  const [formSitaKategori, setFormSitaKategori] = useState<KategoriBarang>('HP / Smartphone');
  const [formSitaLokasi, setFormSitaLokasi] = useState<string>('Lemari Keamanan Pondok');

  // Modal Sita Barang (Tambah / Edit & Kembalikan)
  const [showSitaModal, setShowSitaModal] = useState<boolean>(false);
  const [editingSita, setEditingSita] = useState<SitaBarangViewItem | null>(null);
  const [sitaSantriSearch, setSitaSantriSearch] = useState<string>('');
  const [sitaSantriDropdownOpen, setSitaSantriDropdownOpen] = useState<boolean>(false);
  const [sitaFormSantriId, setSitaFormSantriId] = useState<string>('');
  const [sitaFormNama, setSitaFormNama] = useState<string>('');
  const [sitaFormKategori, setSitaFormKategori] = useState<string>('HP / Smartphone');
  const [sitaFormJumlah, setSitaFormJumlah] = useState<string>('1');
  const [sitaFormTanggal, setSitaFormTanggal] = useState<string>('');
  const [sitaFormLokasi, setSitaFormLokasi] = useState<string>('Lemari Keamanan Pondok');
  const [sitaFormPetugasText, setSitaFormPetugasText] = useState<string>('');
  const [sitaPetugasDropdownOpen, setSitaPetugasDropdownOpen] = useState<boolean>(false);
  const [sitaFormCatatan, setSitaFormCatatan] = useState<string>('');

  const [returnTarget, setReturnTarget] = useState<SitaBarangViewItem | null>(null);
  const [returnStatus, setReturnStatus] = useState<'dikembalikan' | 'dimusnahkan'>('dikembalikan');
  const [returnTanggal, setReturnTanggal] = useState<string>('');
  const [returnPenerima, setReturnPenerima] = useState<string>('');
  const [returnCatatan, setReturnCatatan] = useState<string>('');

  // Modal Master Pelanggaran
  const [showMasterModal, setShowMasterModal] = useState<boolean>(false);
  const [editingMaster, setEditingMaster] = useState<MasterPelanggaranItem | null>(null);
  const [masterNama, setMasterNama] = useState<string>('');
  const [masterTingkat, setMasterTingkat] = useState<TingkatPelanggaran>('ringan');
  const [masterPoin, setMasterPoin] = useState<string>('5');
  const [masterTakzir, setMasterTakzir] = useState<string>('');
  const [masterAktif, setMasterAktif] = useState<boolean>(true);

  // Print & Delete Modals
  const [printDoc, setPrintDoc] = useState<PrintDocState | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<
    | { kind: 'pelanggaran'; item: PelanggaranViewItem }
    | { kind: 'sita'; item: SitaBarangViewItem }
    | { kind: 'master'; item: MasterPelanggaranItem }
    | null
  >(null);
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
      setTodayStr(getLocalTodayStr());
      setCurrentHm(getLocalTimeHm());
    });
    return () => {
      active = false;
    };
  }, []);

  const readLocalArray = useCallback(<T,>(key: string): T[] => {
    if (typeof window === 'undefined') return [];
    try {
      const raw = window.localStorage.getItem(key);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as T[]) : [];
    } catch {
      return [];
    }
  }, []);

  const writeLocalArray = useCallback(<T,>(key: string, items: T[]) => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(key, JSON.stringify(items));
    } catch {
      // ignore storage quota errors
    }
  }, []);

  const fetchAllData = useCallback(async () => {
    const [santriRes, pengurusRes, izinRes, pengaturanRes, masterRes, pelanggaranRes, sitaRes] =
      await Promise.all([
        supabase
          .from('santri')
          .select(
            'id, nis, nama_lengkap, kamar, status, nama_ayah, no_wa_ayah, nama_ibu, no_wa_ibu, nama_wali, no_wa_wali'
          )
          .in('status', ['aktif', 'ndalem', 'beasiswa_lazis']),
        supabase.from('pengurus').select('id, nama_lengkap, status').eq('status', 'aktif'),
        supabase
          .from('izin_pulang')
          .select(
            'id, santri_id, jenis_izin, tgl_pulang, tgl_rencana_kembali, tgl_aktual_kembali, alasan, status'
          ),
        supabase.from('pengaturan_aplikasi').select('*').limit(1).maybeSingle(),
        supabase.from('keamanan_master_pelanggaran').select('*').order('poin', { ascending: true }),
        supabase.from('keamanan_pelanggaran').select('*').order('tanggal', { ascending: false }),
        supabase.from('keamanan_sita_barang').select('*').order('tgl_sita', { ascending: false }),
      ]);

    if (santriRes.error) throw santriRes.error;

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

    const isMasterMissing = Boolean(masterRes.error && isMissingRelationError(masterRes.error));
    const isPelanggaranMissing = Boolean(
      pelanggaranRes.error && isMissingRelationError(pelanggaranRes.error)
    );
    const isSitaMissing = Boolean(sitaRes.error && isMissingRelationError(sitaRes.error));

    let masterItems: MasterPelanggaranItem[] = [];
    if (isMasterMissing) {
      const cached = readLocalArray<MasterPelanggaranItem>(LS_MASTER_KEY);
      if (cached.length > 0) {
        masterItems = cached;
      } else {
        masterItems = STARTER_MASTER_PELANGGARAN.map((item, idx) => ({
          id: `kmp-local-${idx + 1}`,
          ...item,
        }));
        writeLocalArray(LS_MASTER_KEY, masterItems);
      }
    } else {
      masterItems = (masterRes.data || []) as MasterPelanggaranItem[];
      if (masterItems.length === 0) {
        // Seed starter rules into database / mock client when empty
        const { data: insertedMaster } = await supabase
          .from('keamanan_master_pelanggaran')
          .insert(STARTER_MASTER_PELANGGARAN)
          .select();
        if (Array.isArray(insertedMaster) && insertedMaster.length > 0) {
          masterItems = insertedMaster as MasterPelanggaranItem[];
        } else {
          masterItems = STARTER_MASTER_PELANGGARAN.map((item, idx) => ({
            id: `kmp-local-${idx + 1}`,
            ...item,
          }));
        }
      }
    }

    const pelanggaranItems = isPelanggaranMissing
      ? readLocalArray<PelanggaranRaw>(LS_PELANGGARAN_KEY)
      : ((pelanggaranRes.data || []) as PelanggaranRaw[]);

    const sitaItems = isSitaMissing
      ? readLocalArray<SitaBarangRaw>(LS_SITA_KEY)
      : ((sitaRes.data || []) as SitaBarangRaw[]);

    return {
      santri: sortedSantri,
      pengurus: sortedPengurus,
      izin: (izinRes.error ? [] : izinRes.data || []) as IzinPulangRaw[],
      pengaturan: (pengaturanRes.data || null) as Partial<PengaturanRow> | null,
      master: masterItems,
      pelanggaran: pelanggaranItems,
      sita: sitaItems,
      masterLocal: isMasterMissing,
      pelanggaranLocal: isPelanggaranMissing,
      sitaLocal: isSitaMissing,
    };
  }, [readLocalArray, writeLocalArray]);

  const handleReload = async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const res = await fetchAllData();
      setSantriList(res.santri);
      setPengurusList(res.pengurus);
      setIzinList(res.izin);
      setMasterList(res.master);
      setPelanggaranList(res.pelanggaran);
      setSitaList(res.sita);
      setMasterLocalFallback(res.masterLocal);
      setPelanggaranLocalFallback(res.pelanggaranLocal);
      setSitaLocalFallback(res.sitaLocal);
      if (res.pengaturan) {
        setPengaturan((prev) => ({ ...prev, ...res.pengaturan }));
      }
    } catch (err: unknown) {
      const msg = extractSupabaseError(err, 'Gagal memuat data modul keamanan.');
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
        setIzinList(res.izin);
        setMasterList(res.master);
        setPelanggaranList(res.pelanggaran);
        setSitaList(res.sita);
        setMasterLocalFallback(res.masterLocal);
        setPelanggaranLocalFallback(res.pelanggaranLocal);
        setSitaLocalFallback(res.sitaLocal);
        if (res.pengaturan) {
          setPengaturan((prev) => ({ ...prev, ...res.pengaturan }));
        }
      })
      .catch((err: unknown) => {
        if (!active) return;
        setFetchError(extractSupabaseError(err, 'Gagal memuat data modul keamanan.'));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [fetchAllData]);

  const santriMap = useMemo(() => new Map(santriList.map((s) => [s.id, s])), [santriList]);

  const pelanggaranViewItems = useMemo<PelanggaranViewItem[]>(() => {
    return pelanggaranList
      .map((row) => ({
        ...row,
        poin: Number(row.poin || 0),
        santri: santriMap.get(row.santri_id),
      }))
      .sort((a, b) => {
        if (a.tanggal !== b.tanggal) return b.tanggal.localeCompare(a.tanggal);
        return (b.created_at || '').localeCompare(a.created_at || '');
      });
  }, [pelanggaranList, santriMap]);

  const sitaViewItems = useMemo<SitaBarangViewItem[]>(() => {
    return sitaList
      .map((row) => ({
        ...row,
        jumlah: Number(row.jumlah || 1),
        santri: santriMap.get(row.santri_id),
      }))
      .sort((a, b) => {
        if (a.status === 'disita' && b.status !== 'disita') return -1;
        if (a.status !== 'disita' && b.status === 'disita') return 1;
        return b.tgl_sita.localeCompare(a.tgl_sita);
      });
  }, [sitaList, santriMap]);

  const overdueIzinAlerts = useMemo<OverdueIzinAlert[]>(() => {
    if (!todayStr) return [];
    const loggedIzinIds = new Set(
      pelanggaranList.map((p) => p.izin_id).filter((id): id is string => Boolean(id))
    );
    const refToday = todayStr;
    const refHm = currentHm || '12:00';
    const alerts: OverdueIzinAlert[] = [];

    for (const izin of izinList) {
      if (loggedIzinIds.has(izin.id)) continue;
      const { batasJam, dn } = parseIzinBatasJam(izin.alasan);
      const isActiveOverdue =
        izin.status === 'disetujui' &&
        (refToday > izin.tgl_rencana_kembali ||
          (izin.jenis_izin === 'tidak_menginap' &&
            refToday === izin.tgl_rencana_kembali &&
            refHm > batasJam));

      if (izin.status !== 'terlambat' && !isActiveOverdue) continue;

      const santri = santriMap.get(izin.santri_id);
      const dendaLabel = dn > 0 ? 'Denda izin Rp 20.000' : 'Terlambat kembali izin';
      const keteranganTelat =
        izin.status === 'terlambat'
          ? `Kembali terlambat (Aktual: ${formatTanggalIndo(izin.tgl_aktual_kembali || refToday)}, Batas: ${formatTanggalIndo(izin.tgl_rencana_kembali)})`
          : `Belum kembali melewati batas (${formatTanggalIndo(izin.tgl_rencana_kembali)}${izin.jenis_izin === 'tidak_menginap' ? ` · ${batasJam} WIB` : ''})`;

      alerts.push({
        izin,
        santri,
        batasJam,
        dendaLabel,
        keteranganTelat,
      });
    }

    return alerts;
  }, [izinList, pelanggaranList, santriMap, todayStr, currentHm]);

  const santriPoinSummaries = useMemo<SantriPoinSummary[]>(() => {
    const grouped = new Map<string, PelanggaranViewItem[]>();
    for (const item of pelanggaranViewItems) {
      const existing = grouped.get(item.santri_id) || [];
      existing.push(item);
      grouped.set(item.santri_id, existing);
    }

    const result: SantriPoinSummary[] = [];
    for (const s of santriList) {
      const list = grouped.get(s.id) || [];
      let totalPoin = 0;
      let ringanCount = 0;
      let sedangCount = 0;
      let beratCount = 0;
      let takzirAktif = 0;
      let lastTanggal = '';

      for (const k of list) {
        totalPoin += Number(k.poin || 0);
        if (k.tingkat === 'ringan') ringanCount += 1;
        else if (k.tingkat === 'sedang') sedangCount += 1;
        else beratCount += 1;
        if (k.status_takzir === 'belum_selesai') takzirAktif += 1;
        if (!lastTanggal || k.tanggal > lastTanggal) lastTanggal = k.tanggal;
      }

      const spInfo = getSpClassification(totalPoin);
      result.push({
        santri: s,
        totalPoin,
        totalKasus: list.length,
        ringanCount,
        sedangCount,
        beratCount,
        takzirAktif,
        spLevel: spInfo.level,
        spLabel: spInfo.label,
        spKeterangan: spInfo.keterangan,
        kasusList: list,
        lastTanggal,
      });
    }

    return result.sort((a, b) => {
      if (b.totalPoin !== a.totalPoin) return b.totalPoin - a.totalPoin;
      if (b.totalKasus !== a.totalKasus) return b.totalKasus - a.totalKasus;
      return a.santri.nama_lengkap.localeCompare(b.santri.nama_lengkap, 'id');
    });
  }, [santriList, pelanggaranViewItems]);

  const santriTotalPoinMap = useMemo(
    () => new Map(santriPoinSummaries.map((item) => [item.santri.id, item.totalPoin])),
    [santriPoinSummaries]
  );

  const kpiStats = useMemo(() => {
    const monthPrefix = todayStr ? todayStr.slice(0, 7) : '';
    const kasusBulanIni = monthPrefix
      ? pelanggaranViewItems.filter((p) => (p.tanggal || '').startsWith(monthPrefix)).length
      : pelanggaranViewItems.length;
    const takzirBelumSelesai = pelanggaranViewItems.filter(
      (p) => p.status_takzir === 'belum_selesai'
    ).length;
    const barangDisita = sitaViewItems.filter((s) => s.status === 'disita').length;
    const santriAmbangSp = santriPoinSummaries.filter((s) => s.totalPoin >= 25).length;

    return {
      kasusBulanIni,
      takzirBelumSelesai,
      barangDisita,
      santriAmbangSp,
    };
  }, [pelanggaranViewItems, sitaViewItems, santriPoinSummaries, todayStr]);

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

  const filteredPelanggaran = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return pelanggaranViewItems.filter((item) => {
      const nama = item.santri?.nama_lengkap || '';
      const nis = item.santri?.nis || '';
      const kamar = item.santri?.kamar || '';

      if (filterKamar !== 'SEMUA' && kamar !== filterKamar) return false;
      if (filterTingkat !== 'semua' && item.tingkat !== filterTingkat) return false;
      if (filterTakzir !== 'semua' && item.status_takzir !== filterTakzir) return false;

      if (!q) return true;
      return (
        nama.toLowerCase().includes(q) ||
        String(nis).toLowerCase().includes(q) ||
        kamar.toLowerCase().includes(q) ||
        item.nama_pelanggaran.toLowerCase().includes(q) ||
        (item.takzir || '').toLowerCase().includes(q) ||
        (item.petugas || '').toLowerCase().includes(q)
      );
    });
  }, [pelanggaranViewItems, searchQuery, filterTingkat, filterTakzir, filterKamar]);

  const filteredPoinSummaries = useMemo(() => {
    const q = poinSearch.trim().toLowerCase();
    return santriPoinSummaries.filter((item) => {
      if (filterSpScope === 'berpoin' && item.totalPoin <= 0 && item.totalKasus <= 0) return false;
      if (filterSpScope === 'ambang_sp' && item.totalPoin < 25) return false;

      if (!q) return true;
      return (
        item.santri.nama_lengkap.toLowerCase().includes(q) ||
        String(item.santri.nis || '').toLowerCase().includes(q) ||
        String(item.santri.kamar || '').toLowerCase().includes(q)
      );
    });
  }, [santriPoinSummaries, poinSearch, filterSpScope]);

  const filteredSita = useMemo(() => {
    const q = sitaSearch.trim().toLowerCase();
    return sitaViewItems.filter((item) => {
      if (filterSitaStatus !== 'semua' && item.status !== filterSitaStatus) return false;
      if (!q) return true;
      return (
        item.nama_barang.toLowerCase().includes(q) ||
        item.kategori.toLowerCase().includes(q) ||
        (item.santri?.nama_lengkap || '').toLowerCase().includes(q) ||
        String(item.santri?.nis || '').toLowerCase().includes(q) ||
        String(item.santri?.kamar || '').toLowerCase().includes(q) ||
        (item.lokasi_simpan || '').toLowerCase().includes(q)
      );
    });
  }, [sitaViewItems, sitaSearch, filterSitaStatus]);

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

  const selectableSitaSantri = useMemo(() => {
    const q = sitaSantriSearch.trim().toLowerCase();
    if (!q) return santriList;
    return santriList.filter(
      (s) =>
        s.nama_lengkap.toLowerCase().includes(q) ||
        String(s.nis || '').toLowerCase().includes(q) ||
        String(s.kamar || '').toLowerCase().includes(q)
    );
  }, [santriList, sitaSantriSearch]);

  const selectedSitaSantri = useMemo(
    () => santriList.find((s) => s.id === sitaFormSantriId) || null,
    [santriList, sitaFormSantriId]
  );

  const selectablePengurus = useMemo(() => {
    const q = formPetugasText.trim().toLowerCase();
    if (!q) return pengurusList;
    return pengurusList.filter((p) => p.nama_lengkap.toLowerCase().includes(q));
  }, [pengurusList, formPetugasText]);

  const selectableSitaPengurus = useMemo(() => {
    const q = sitaFormPetugasText.trim().toLowerCase();
    if (!q) return pengurusList;
    return pengurusList.filter((p) => p.nama_lengkap.toLowerCase().includes(q));
  }, [pengurusList, sitaFormPetugasText]);

  const activeMasterOptions = useMemo(
    () => masterList.filter((m) => m.aktif),
    [masterList]
  );

  // ==========================
  // MODAL HANDLERS: PELANGGARAN
  // ==========================
  const applyMasterChoice = (masterId: string) => {
    setFormMasterId(masterId);
    if (!masterId) return;
    const found = masterList.find((m) => m.id === masterId);
    if (found) {
      setFormNamaPelanggaran(found.nama_pelanggaran);
      setFormTingkat(found.tingkat);
      setFormPoin(String(found.poin));
      setFormTakzir(found.takzir_default || '');
    }
  };

  const openCreatePelanggaranModal = (prefillAlert?: OverdueIzinAlert) => {
    const baseDate = todayStr || getLocalTodayStr();
    setEditingPelanggaran(null);
    setSantriDropdownOpen(false);
    setPetugasDropdownOpen(false);
    setFormStatusTakzir('belum_selesai');
    setFormTglSelesaiTakzir('');
    setFormPetugasText('');
    setFormIncludeSita(false);
    setFormSitaNama('');
    setFormSitaKategori('HP / Smartphone');
    setFormSitaLokasi('Lemari Keamanan Pondok');
    setFormTanggal(baseDate);

    if (prefillAlert) {
      setFormSantriId(prefillAlert.izin.santri_id);
      setSantriSearch(prefillAlert.santri?.nama_lengkap || '');
      setFormLinkedIzinId(prefillAlert.izin.id);
      const telatMaster = activeMasterOptions.find((m) =>
        m.nama_pelanggaran.toLowerCase().includes('terlambat kembali')
      );
      if (telatMaster) {
        setFormMasterId(telatMaster.id);
        setFormNamaPelanggaran(telatMaster.nama_pelanggaran);
        setFormTingkat(telatMaster.tingkat);
        setFormPoin(String(telatMaster.poin));
        setFormTakzir(telatMaster.takzir_default);
      } else {
        setFormMasterId('');
        setFormNamaPelanggaran('Terlambat Kembali Izin Pulang');
        setFormTingkat('sedang');
        setFormPoin('15');
        setFormTakzir('Takzir kebersihan halaman & wajib lapor keamanan 3 hari');
      }
      setFormKronologi(`${prefillAlert.keteranganTelat} · ${prefillAlert.dendaLabel}`);
    } else {
      setFormSantriId('');
      setSantriSearch('');
      setFormLinkedIzinId(null);
      const firstMaster = activeMasterOptions[0];
      if (firstMaster) {
        setFormMasterId(firstMaster.id);
        setFormNamaPelanggaran(firstMaster.nama_pelanggaran);
        setFormTingkat(firstMaster.tingkat);
        setFormPoin(String(firstMaster.poin));
        setFormTakzir(firstMaster.takzir_default);
      } else {
        setFormMasterId('');
        setFormNamaPelanggaran('');
        setFormTingkat('ringan');
        setFormPoin('5');
        setFormTakzir('');
      }
      setFormKronologi('');
    }

    setShowPelanggaranModal(true);
  };

  const openEditPelanggaranModal = (item: PelanggaranViewItem) => {
    setEditingPelanggaran(item);
    setFormSantriId(item.santri_id);
    setSantriSearch(item.santri?.nama_lengkap || '');
    setSantriDropdownOpen(false);
    setFormMasterId(item.master_id || '');
    setFormNamaPelanggaran(item.nama_pelanggaran);
    setFormTingkat(item.tingkat);
    setFormPoin(String(item.poin));
    setFormTanggal(item.tanggal);
    setFormKronologi(item.kronologi || '');
    setFormTakzir(item.takzir || '');
    setFormStatusTakzir(item.status_takzir);
    setFormTglSelesaiTakzir(item.tgl_selesai_takzir || todayStr || getLocalTodayStr());
    setFormPetugasText(item.petugas === 'Sie Keamanan Pondok' ? '' : item.petugas);
    setPetugasDropdownOpen(false);
    setFormLinkedIzinId(item.izin_id);
    setFormIncludeSita(false);
    setFormSitaNama('');
    setShowPelanggaranModal(true);
  };

  const handleSavePelanggaran = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formSantriId) {
      showToast('error', 'Santri Belum Dipilih', 'Pilih santri terlebih dahulu dari daftar.');
      return;
    }
    if (!formNamaPelanggaran.trim()) {
      showToast('error', 'Pelanggaran Wajib Diisi', 'Isi jenis/nama pelanggaran.');
      return;
    }
    if (formIncludeSita && !editingPelanggaran && !formSitaNama.trim()) {
      showToast('error', 'Nama Barang Wajib Diisi', 'Isi nama barang sitaan yang diamankan.');
      return;
    }

    setSaving(true);
    try {
      const baseDate = formTanggal || todayStr || getLocalTodayStr();
      const nomorSurat =
        editingPelanggaran?.no_surat ||
        `KEAM/${baseDate.replace(/-/g, '')}/${Math.floor(100 + Math.random() * 900)}`;

      const payload: Omit<PelanggaranRaw, 'id'> = {
        santri_id: formSantriId,
        master_id: formMasterId || null,
        nama_pelanggaran: formNamaPelanggaran.trim(),
        tingkat: formTingkat,
        poin: Math.max(0, parseInt(formPoin, 10) || 0),
        tanggal: baseDate,
        kronologi: formKronologi.trim(),
        takzir: formTakzir.trim() || 'Pembinaan & teguran tertulis Sie Keamanan',
        status_takzir: formStatusTakzir,
        tgl_selesai_takzir:
          formStatusTakzir === 'selesai' ? formTglSelesaiTakzir || baseDate : null,
        petugas: formPetugasText.trim() || 'Sie Keamanan Pondok',
        wa_terkirim: editingPelanggaran?.wa_terkirim || false,
        izin_id: formLinkedIzinId,
        no_surat: nomorSurat,
      };

      let savedPelanggaranId = editingPelanggaran?.id || createLocalId('pel');

      if (pelanggaranLocalFallback) {
        const nextList = editingPelanggaran
          ? pelanggaranList.map((p) =>
              p.id === editingPelanggaran.id ? { ...p, ...payload } : p
            )
          : [{ id: savedPelanggaranId, created_at: new Date().toISOString(), ...payload }, ...pelanggaranList];
        setPelanggaranList(nextList);
        writeLocalArray(LS_PELANGGARAN_KEY, nextList);
      } else if (editingPelanggaran) {
        const { error } = await supabase
          .from('keamanan_pelanggaran')
          .update(payload)
          .eq('id', editingPelanggaran.id);
        if (error) throw error;
      } else {
        const { data: inserted, error } = await supabase
          .from('keamanan_pelanggaran')
          .insert(payload)
          .select()
          .single();
        if (error) throw error;
        if (inserted && typeof inserted === 'object' && 'id' in inserted) {
          savedPelanggaranId = String((inserted as { id: string }).id);
        }
      }

      // Catat barang sitaan sekaligus bila dicentang
      if (formIncludeSita && !editingPelanggaran) {
        const sitaPayload: Omit<SitaBarangRaw, 'id'> = {
          santri_id: formSantriId,
          pelanggaran_id: savedPelanggaranId,
          nama_barang: formSitaNama.trim(),
          kategori: formSitaKategori,
          jumlah: 1,
          tgl_sita: baseDate,
          lokasi_simpan: formSitaLokasi.trim() || 'Lemari Keamanan Pondok',
          petugas_penyita: payload.petugas,
          status: 'disita',
          tgl_kembali: null,
          penerima_kembali: null,
          catatan: `Terkait pelanggaran: ${payload.nama_pelanggaran}`,
          wa_terkirim: false,
          no_tanda_terima: `SITA/${baseDate.replace(/-/g, '')}/${Math.floor(100 + Math.random() * 900)}`,
        };

        if (sitaLocalFallback) {
          const nextSita = [
            { id: createLocalId('sita'), created_at: new Date().toISOString(), ...sitaPayload },
            ...sitaList,
          ];
          setSitaList(nextSita);
          writeLocalArray(LS_SITA_KEY, nextSita);
        } else {
          const { error: sitaErr } = await supabase.from('keamanan_sita_barang').insert(sitaPayload);
          if (sitaErr) throw sitaErr;
        }
      }

      if (!pelanggaranLocalFallback || (formIncludeSita && !sitaLocalFallback)) {
        const refreshed = await fetchAllData();
        setPelanggaranList(refreshed.pelanggaran);
        setSitaList(refreshed.sita);
      }

      setShowPelanggaranModal(false);
      showToast(
        'success',
        editingPelanggaran ? 'Pelanggaran Diperbarui' : 'Pelanggaran Tercatat',
        formIncludeSita && !editingPelanggaran
          ? `Catatan pelanggaran (+${payload.poin} poin) & barang sitaan berhasil disimpan.`
          : `Catatan pelanggaran (+${payload.poin} poin) berhasil disimpan.`
      );
    } catch (err: unknown) {
      showToast(
        'error',
        'Gagal Menyimpan',
        extractSupabaseError(err, 'Gagal menyimpan catatan pelanggaran.')
      );
    } finally {
      setSaving(false);
    }
  };

  const handleToggleTakzirSelesai = async (item: PelanggaranViewItem) => {
    const nextStatus: StatusTakzir =
      item.status_takzir === 'selesai' ? 'belum_selesai' : 'selesai';
    const nextTgl = nextStatus === 'selesai' ? todayStr || getLocalTodayStr() : null;

    if (pelanggaranLocalFallback) {
      const next = pelanggaranList.map((p) =>
        p.id === item.id ? { ...p, status_takzir: nextStatus, tgl_selesai_takzir: nextTgl } : p
      );
      setPelanggaranList(next);
      writeLocalArray(LS_PELANGGARAN_KEY, next);
    } else {
      const { error } = await supabase
        .from('keamanan_pelanggaran')
        .update({ status_takzir: nextStatus, tgl_selesai_takzir: nextTgl })
        .eq('id', item.id);
      if (error) {
        showToast('error', 'Gagal Memperbarui Status', extractSupabaseError(error, 'Error database.'));
        return;
      }
      setPelanggaranList((prev) =>
        prev.map((p) =>
          p.id === item.id ? { ...p, status_takzir: nextStatus, tgl_selesai_takzir: nextTgl } : p
        )
      );
    }

    showToast(
      'success',
      nextStatus === 'selesai' ? 'Takzir Dituntaskan' : 'Takzir Dibuka Kembali',
      `${item.santri?.nama_lengkap || 'Santri'} — ${item.nama_pelanggaran}`
    );
  };

  // ==========================
  // MODAL HANDLERS: SITA BARANG
  // ==========================
  const openCreateSitaModal = () => {
    const baseDate = todayStr || getLocalTodayStr();
    setEditingSita(null);
    setSitaSantriSearch('');
    setSitaSantriDropdownOpen(false);
    setSitaFormSantriId('');
    setSitaFormNama('');
    setSitaFormKategori('HP / Smartphone');
    setSitaFormJumlah('1');
    setSitaFormTanggal(baseDate);
    setSitaFormLokasi('Lemari Keamanan Pondok');
    setSitaFormPetugasText('');
    setSitaPetugasDropdownOpen(false);
    setSitaFormCatatan('');
    setShowSitaModal(true);
  };

  const openEditSitaModal = (item: SitaBarangViewItem) => {
    setEditingSita(item);
    setSitaFormSantriId(item.santri_id);
    setSitaSantriSearch(item.santri?.nama_lengkap || '');
    setSitaSantriDropdownOpen(false);
    setSitaFormNama(item.nama_barang);
    setSitaFormKategori(item.kategori);
    setSitaFormJumlah(String(item.jumlah));
    setSitaFormTanggal(item.tgl_sita);
    setSitaFormLokasi(item.lokasi_simpan);
    setSitaFormPetugasText(
      item.petugas_penyita === 'Sie Keamanan Pondok' ? '' : item.petugas_penyita
    );
    setSitaPetugasDropdownOpen(false);
    setSitaFormCatatan(item.catatan || '');
    setShowSitaModal(true);
  };

  const handleSaveSita = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sitaFormSantriId) {
      showToast('error', 'Santri Belum Dipilih', 'Pilih pemilik barang sitaan.');
      return;
    }
    if (!sitaFormNama.trim()) {
      showToast('error', 'Nama Barang Kosong', 'Masukkan nama/merk/deskripsi barang sitaan.');
      return;
    }

    setSaving(true);
    try {
      const baseDate = sitaFormTanggal || todayStr || getLocalTodayStr();
      const payload: Omit<SitaBarangRaw, 'id'> = {
        santri_id: sitaFormSantriId,
        pelanggaran_id: editingSita?.pelanggaran_id || null,
        nama_barang: sitaFormNama.trim(),
        kategori: sitaFormKategori.trim() || 'Lainnya',
        jumlah: Math.max(1, parseInt(sitaFormJumlah, 10) || 1),
        tgl_sita: baseDate,
        lokasi_simpan: sitaFormLokasi.trim() || 'Lemari Keamanan Pondok',
        petugas_penyita: sitaFormPetugasText.trim() || 'Sie Keamanan Pondok',
        status: editingSita?.status || 'disita',
        tgl_kembali: editingSita?.tgl_kembali || null,
        penerima_kembali: editingSita?.penerima_kembali || null,
        catatan: sitaFormCatatan.trim(),
        wa_terkirim: editingSita?.wa_terkirim || false,
        no_tanda_terima:
          editingSita?.no_tanda_terima ||
          `SITA/${baseDate.replace(/-/g, '')}/${Math.floor(100 + Math.random() * 900)}`,
      };

      if (sitaLocalFallback) {
        const next = editingSita
          ? sitaList.map((s) => (s.id === editingSita.id ? { ...s, ...payload } : s))
          : [{ id: createLocalId('sita'), created_at: new Date().toISOString(), ...payload }, ...sitaList];
        setSitaList(next);
        writeLocalArray(LS_SITA_KEY, next);
      } else if (editingSita) {
        const { error } = await supabase
          .from('keamanan_sita_barang')
          .update(payload)
          .eq('id', editingSita.id);
        if (error) throw error;
        const refreshed = await fetchAllData();
        setSitaList(refreshed.sita);
      } else {
        const { error } = await supabase.from('keamanan_sita_barang').insert(payload);
        if (error) throw error;
        const refreshed = await fetchAllData();
        setSitaList(refreshed.sita);
      }

      setShowSitaModal(false);
      showToast('success', 'Barang Sitaan Tersimpan', `${payload.nama_barang} berhasil dicatat.`);
    } catch (err: unknown) {
      showToast('error', 'Gagal Menyimpan Barang', extractSupabaseError(err, 'Gagal menyimpan.'));
    } finally {
      setSaving(false);
    }
  };

  const openReturnSitaModal = (item: SitaBarangViewItem) => {
    const wali = getDefaultWali(item.santri);
    setReturnTarget(item);
    setReturnStatus('dikembalikan');
    setReturnTanggal(todayStr || getLocalTodayStr());
    setReturnPenerima(wali.nama || 'Wali Santri');
    setReturnCatatan(item.catatan || '');
  };

  const handleConfirmReturnSita = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!returnTarget) return;
    setSaving(true);
    try {
      const updateFields = {
        status: returnStatus,
        tgl_kembali: returnTanggal || todayStr || getLocalTodayStr(),
        penerima_kembali:
          returnStatus === 'dikembalikan'
            ? returnPenerima.trim() || 'Wali Santri'
            : 'Dimusnahkan / Diserahkan ke Pengurus',
        catatan: returnCatatan.trim(),
      };

      if (sitaLocalFallback) {
        const next = sitaList.map((s) =>
          s.id === returnTarget.id ? { ...s, ...updateFields } : s
        );
        setSitaList(next);
        writeLocalArray(LS_SITA_KEY, next);
      } else {
        const { error } = await supabase
          .from('keamanan_sita_barang')
          .update(updateFields)
          .eq('id', returnTarget.id);
        if (error) throw error;
        setSitaList((prev) =>
          prev.map((s) => (s.id === returnTarget.id ? { ...s, ...updateFields } : s))
        );
      }

      setReturnTarget(null);
      showToast(
        'success',
        returnStatus === 'dikembalikan' ? 'Barang Dikembalikan' : 'Status Barang Diperbarui',
        `${returnTarget.nama_barang} (${returnTarget.santri?.nama_lengkap || 'Santri'}) diperbarui.`
      );
    } catch (err: unknown) {
      showToast('error', 'Gagal Memperbarui', extractSupabaseError(err, 'Terjadi kesalahan.'));
    } finally {
      setSaving(false);
    }
  };

  // ==========================
  // MODAL HANDLERS: MASTER KATEGORI
  // ==========================
  const openCreateMasterModal = () => {
    setEditingMaster(null);
    setMasterNama('');
    setMasterTingkat('ringan');
    setMasterPoin('5');
    setMasterTakzir('');
    setMasterAktif(true);
    setShowMasterModal(true);
  };

  const openEditMasterModal = (item: MasterPelanggaranItem) => {
    setEditingMaster(item);
    setMasterNama(item.nama_pelanggaran);
    setMasterTingkat(item.tingkat);
    setMasterPoin(String(item.poin));
    setMasterTakzir(item.takzir_default || '');
    setMasterAktif(item.aktif);
    setShowMasterModal(true);
  };

  const handleSaveMaster = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!masterNama.trim()) {
      showToast('error', 'Nama Pelanggaran Kosong', 'Isi nama jenis pelanggaran.');
      return;
    }

    setSaving(true);
    try {
      const payload: Omit<MasterPelanggaranItem, 'id'> = {
        nama_pelanggaran: masterNama.trim(),
        tingkat: masterTingkat,
        poin: Math.max(1, parseInt(masterPoin, 10) || 5),
        takzir_default: masterTakzir.trim() || 'Pembinaan & takzir Sie Keamanan',
        aktif: masterAktif,
      };

      if (masterLocalFallback) {
        const next = editingMaster
          ? masterList.map((m) => (m.id === editingMaster.id ? { ...m, ...payload } : m))
          : [...masterList, { id: createLocalId('kmp'), ...payload }];
        setMasterList(next);
        writeLocalArray(LS_MASTER_KEY, next);
      } else if (editingMaster) {
        const { error } = await supabase
          .from('keamanan_master_pelanggaran')
          .update(payload)
          .eq('id', editingMaster.id);
        if (error) throw error;
        const refreshed = await fetchAllData();
        setMasterList(refreshed.master);
      } else {
        const { error } = await supabase.from('keamanan_master_pelanggaran').insert(payload);
        if (error) throw error;
        const refreshed = await fetchAllData();
        setMasterList(refreshed.master);
      }

      setShowMasterModal(false);
      showToast('success', 'Master Poin Tersimpan', `${payload.nama_pelanggaran} (+${payload.poin} poin).`);
    } catch (err: unknown) {
      showToast('error', 'Gagal Menyimpan Master', extractSupabaseError(err, 'Gagal menyimpan.'));
    } finally {
      setSaving(false);
    }
  };

  const handleSeedStarterMaster = async () => {
    const existingNames = new Set(masterList.map((m) => m.nama_pelanggaran.toLowerCase()));
    const toAdd = STARTER_MASTER_PELANGGARAN.filter(
      (item) => !existingNames.has(item.nama_pelanggaran.toLowerCase())
    );
    if (toAdd.length === 0) {
      showToast('info', 'Master Sudah Lengkap', 'Semua kategori standar pedoman pondok sudah tersedia.');
      return;
    }
    if (masterLocalFallback) {
      const next = [
        ...masterList,
        ...toAdd.map((item) => ({ id: createLocalId('kmp'), ...item })),
      ];
      setMasterList(next);
      writeLocalArray(LS_MASTER_KEY, next);
      showToast('success', 'Template Dimuat', `${toAdd.length} kategori pelanggaran standar ditambahkan.`);
      return;
    }
    const { error } = await supabase.from('keamanan_master_pelanggaran').insert(toAdd);
    if (!error) {
      const refreshed = await fetchAllData();
      setMasterList(refreshed.master);
      showToast('success', 'Template Dimuat', `${toAdd.length} kategori pelanggaran standar ditambahkan.`);
    }
  };

  // ==========================
  // DELETE HANDLER
  // ==========================
  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      if (deleteTarget.kind === 'pelanggaran') {
        if (pelanggaranLocalFallback) {
          const next = pelanggaranList.filter((p) => p.id !== deleteTarget.item.id);
          setPelanggaranList(next);
          writeLocalArray(LS_PELANGGARAN_KEY, next);
        } else {
          const { error } = await supabase
            .from('keamanan_pelanggaran')
            .delete()
            .eq('id', deleteTarget.item.id);
          if (error) throw error;
          setPelanggaranList((prev) => prev.filter((p) => p.id !== deleteTarget.item.id));
        }
        showToast('info', 'Catatan Dihapus', 'Catatan pelanggaran berhasil dihapus.');
      } else if (deleteTarget.kind === 'sita') {
        if (sitaLocalFallback) {
          const next = sitaList.filter((s) => s.id !== deleteTarget.item.id);
          setSitaList(next);
          writeLocalArray(LS_SITA_KEY, next);
        } else {
          const { error } = await supabase
            .from('keamanan_sita_barang')
            .delete()
            .eq('id', deleteTarget.item.id);
          if (error) throw error;
          setSitaList((prev) => prev.filter((s) => s.id !== deleteTarget.item.id));
        }
        showToast('info', 'Barang Dihapus', 'Data barang sitaan dihapus.');
      } else {
        if (masterLocalFallback) {
          const next = masterList.filter((m) => m.id !== deleteTarget.item.id);
          setMasterList(next);
          writeLocalArray(LS_MASTER_KEY, next);
        } else {
          const { error } = await supabase
            .from('keamanan_master_pelanggaran')
            .delete()
            .eq('id', deleteTarget.item.id);
          if (error) throw error;
          setMasterList((prev) => prev.filter((m) => m.id !== deleteTarget.item.id));
        }
        showToast('info', 'Master Dihapus', 'Aturan poin pelanggaran dihapus.');
      }
      setDeleteTarget(null);
    } catch (err: unknown) {
      showToast('error', 'Gagal Menghapus', extractSupabaseError(err, 'Gagal menghapus data.'));
    } finally {
      setDeleting(false);
    }
  };

  // ==========================
  // WHATSAPP BUILDERS (MULTI-LINE)
  // ==========================
  const buildWaPelanggaran = (item: PelanggaranViewItem): string => {
    const nama = item.santri?.nama_lengkap || 'Santri';
    const kamar = item.santri?.kamar || '-';
    const wali = getDefaultWali(item.santri).nama || 'Bapak/Ibu Wali Santri';
    const totalPoin = santriTotalPoinMap.get(item.santri_id) || item.poin;
    const sp = getSpClassification(totalPoin);
    const tingkatLabel =
      item.tingkat === 'berat' ? 'Berat' : item.tingkat === 'sedang' ? 'Sedang' : 'Ringan';

    return [
      `Assalamu'alaikum Wr. Wb.`,
      `Yth. Bapak/Ibu ${wali},`,
      `Wali santri dari *${nama}* (Kamar ${kamar}).`,
      ``,
      `Kami Sie Keamanan & Ketertiban ${pengaturan.nama_pesantren} menyampaikan catatan pembinaan tata tertib ananda:`,
      `• Tanggal: ${formatTanggalIndo(item.tanggal)}`,
      `• Pelanggaran: *${item.nama_pelanggaran}*`,
      `• Kategori & Poin: ${tingkatLabel} (+${item.poin} poin)`,
      `• Takzir / Pembinaan: ${item.takzir || 'Pembinaan Sie Keamanan'} (${
        item.status_takzir === 'selesai' ? 'Sudah Tuntas' : 'Sedang Dijalani'
      })`,
      `• Akumulasi Poin Saat Ini: *${totalPoin} poin* (${sp.label})`,
      ...(item.kronologi ? [`• Keterangan: ${item.kronologi}`] : []),
      ``,
      `Mohon kerja sama dan pendampingan Bapak/Ibu dalam menasihati ananda agar semakin tertib dalam mengikuti tata tertib pesantren.`,
      `Informasi lebih lanjut dapat menghubungi Sie Keamanan (${pengaturan.no_telepon}).`,
      `Wassalamu'alaikum Wr. Wb.`,
    ].join('\n');
  };

  const buildWaSpSummary = (summary: SantriPoinSummary): string => {
    const wali = getDefaultWali(summary.santri).nama || 'Bapak/Ibu Wali Santri';
    const recentCases = summary.kasusList.slice(0, 4).map(
      (k, idx) => `${idx + 1}. ${formatTanggalIndo(k.tanggal)} — ${k.nama_pelanggaran} (+${k.poin} poin)`
    );

    return [
      `Assalamu'alaikum Wr. Wb.`,
      `Yth. Bapak/Ibu ${wali},`,
      `Wali santri dari *${summary.santri.nama_lengkap}* (Kamar ${summary.santri.kamar} · NIS ${summary.santri.nis}).`,
      ``,
      `Kami Pengurus Sie Keamanan ${pengaturan.nama_pesantren} menginformasikan rekapitulasi poin ketertiban ananda:`,
      `• Total Akumulasi Poin: *${summary.totalPoin} poin* (${summary.totalKasus} catatan)`,
      `• Status Pembinaan: *${summary.spLabel}*`,
      `• Keterangan: ${summary.spKeterangan}`,
      ...(recentCases.length > 0 ? [``, `Riwayat catatan terakhir:`, ...recentCases] : []),
      ``,
      summary.spLevel >= 2
        ? `Mengingat poin telah mencapai ambang ${summary.spLabel}, kami mohon kehadiran/komunikasi Bapak/Ibu Wali Santri ke Kantor Keamanan Pondok (${pengaturan.no_telepon}) untuk pembinaan bersama.`
        : `Mohon perhatian dan nasihat Bapak/Ibu agar ananda dapat menjaga kedisiplinan di lingkungan pesantren.`,
      `Wassalamu'alaikum Wr. Wb.`,
    ].join('\n');
  };

  const buildWaSita = (item: SitaBarangViewItem): string => {
    const nama = item.santri?.nama_lengkap || 'Santri';
    const kamar = item.santri?.kamar || '-';
    const wali = getDefaultWali(item.santri).nama || 'Bapak/Ibu Wali Santri';

    return [
      `Assalamu'alaikum Wr. Wb.`,
      `Yth. Bapak/Ibu ${wali},`,
      `Wali santri dari *${nama}* (Kamar ${kamar}).`,
      ``,
      `Kami Sie Keamanan ${pengaturan.nama_pesantren} menginformasikan pencatatan barang milik ananda yang diamankan di Kantor Keamanan:`,
      `• Barang: *${item.nama_barang}* (${item.jumlah} unit · ${item.kategori})`,
      `• Tanggal Diamankan: ${formatTanggalIndo(item.tgl_sita)}`,
      `• Penyimpanan: ${item.lokasi_simpan}`,
      `• Status Saat Ini: ${
        item.status === 'disita'
          ? 'Masih diamankan di Kantor Keamanan'
          : item.status === 'dikembalikan'
          ? `Sudah dikembalikan kepada ${item.penerima_kembali || 'Wali'} (${formatTanggalIndo(item.tgl_kembali)})`
          : 'Dimusnahkan sesuai tata tertib pondok'
      }`,
      ...(item.catatan ? [`• Catatan: ${item.catatan}`] : []),
      ``,
      item.status === 'disita'
        ? `Pengambilan barang sitaan hanya dapat dilakukan langsung oleh Orang Tua / Wali Santri ke Kantor Keamanan Pondok (${pengaturan.no_telepon}).`
        : `Terima kasih atas kerja sama Bapak/Ibu Wali Santri.`,
      `Wassalamu'alaikum Wr. Wb.`,
    ].join('\n');
  };

  const handleCopyText = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      showToast('success', 'Pesan Disalin', `${label} berhasil disalin dengan susunan baris rapi.`);
    } catch {
      showToast('error', 'Gagal Menyalin', 'Browser menolak akses clipboard.');
    }
  };

  const markPelanggaranWaSent = async (item: PelanggaranViewItem) => {
    if (item.wa_terkirim) return;
    if (pelanggaranLocalFallback) {
      const next = pelanggaranList.map((p) =>
        p.id === item.id ? { ...p, wa_terkirim: true } : p
      );
      setPelanggaranList(next);
      writeLocalArray(LS_PELANGGARAN_KEY, next);
      return;
    }
    const { error } = await supabase
      .from('keamanan_pelanggaran')
      .update({ wa_terkirim: true })
      .eq('id', item.id);
    if (!error) {
      setPelanggaranList((prev) =>
        prev.map((p) => (p.id === item.id ? { ...p, wa_terkirim: true } : p))
      );
    }
  };

  const markSitaWaSent = async (item: SitaBarangViewItem) => {
    if (item.wa_terkirim) return;
    if (sitaLocalFallback) {
      const next = sitaList.map((s) => (s.id === item.id ? { ...s, wa_terkirim: true } : s));
      setSitaList(next);
      writeLocalArray(LS_SITA_KEY, next);
      return;
    }
    const { error } = await supabase
      .from('keamanan_sita_barang')
      .update({ wa_terkirim: true })
      .eq('id', item.id);
    if (!error) {
      setSitaList((prev) =>
        prev.map((s) => (s.id === item.id ? { ...s, wa_terkirim: true } : s))
      );
    }
  };

  const handleExportExcel = () => {
    const rows = filteredPelanggaran.map((item, idx) => ({
      No: idx + 1,
      'No Surat': item.no_surat || '-',
      NIS: item.santri?.nis || '-',
      'Nama Santri': item.santri?.nama_lengkap || '-',
      Kamar: item.santri?.kamar || '-',
      Tanggal: item.tanggal,
      Pelanggaran: item.nama_pelanggaran,
      Tingkat: item.tingkat.toUpperCase(),
      Poin: item.poin,
      'Total Poin Santri': santriTotalPoinMap.get(item.santri_id) || item.poin,
      Takzir: item.takzir || '-',
      'Status Takzir': item.status_takzir === 'selesai' ? 'Selesai' : 'Belum Selesai',
      Petugas: item.petugas || '-',
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Keamanan_Pelanggaran');
    XLSX.writeFile(wb, `REKAP_KEAMANAN_POIN_${todayStr || 'ANNUR1'}.xlsx`);
    showToast('success', 'Ekspor Excel Berhasil', 'Laporan pelanggaran & poin santri diunduh.');
  };

  const hasLocalFallback = pelanggaranLocalFallback || sitaLocalFallback || masterLocalFallback;

  return (
    <div className="space-y-5 relative print:space-y-0">
      {/* PRINT ISOLATION UNTUK DOKUMEN KEAMANAN */}
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
          aside,
          nav,
          header {
            display: none !important;
          }
          body * {
            visibility: hidden;
          }
          #print-surat-keamanan,
          #print-surat-keamanan * {
            visibility: visible;
          }
          #print-surat-keamanan {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            display: block !important;
            background: #ffffff !important;
          }
        }
      `}</style>

      {/* AREA CETAK A4 RESMI */}
      {printDoc && (
        <div
          id="print-surat-keamanan"
          className="hidden bg-white text-slate-900 text-xs leading-relaxed"
        >
          <div className="border-2 border-slate-800 p-6 space-y-5">
            {/* KOP SURAT PESANTREN */}
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
                  DEWAN KEAMANAN &amp; KETERTIBAN PONDOK (SIE KEAMANAN)
                </p>
                <h1 className="text-lg font-extrabold uppercase text-slate-900">
                  {pengaturan.nama_pesantren}
                </h1>
                <p className="text-[11px] text-slate-600">{pengaturan.alamat_lengkap}</p>
                <p className="text-[11px] text-slate-600">
                  Telp/WA Kantor Keamanan: {pengaturan.no_telepon}
                </p>
              </div>
            </div>

            {printDoc.type === 'surat_peringatan' && (
              <>
                <div className="text-center">
                  <h2 className="text-base font-extrabold uppercase underline underline-offset-4 text-slate-900">
                    SURAT PERINGATAN {printDoc.spTarget} (SP-{printDoc.spTarget})
                  </h2>
                  <p className="text-[11px] font-mono text-slate-600 mt-1">
                    Nomor: {printDoc.nomorSurat}
                  </p>
                </div>

                <p className="text-xs text-slate-800">
                  Assalamu&apos;alaikum Wr. Wb. Dengan ini Pengurus Sie Keamanan dan Ketertiban{' '}
                  {pengaturan.nama_pesantren} menyampaikan <strong>Surat Peringatan ke-{printDoc.spTarget}</strong>{' '}
                  kepada santri dan Bapak/Ibu Wali Santri dari:
                </p>

                <table className="w-full text-xs border-collapse">
                  <tbody>
                    <tr>
                      <td className="py-1 w-44 font-semibold text-slate-700">Nama Lengkap Santri</td>
                      <td className="py-1 w-4">:</td>
                      <td className="py-1 font-bold text-slate-900">
                        {printDoc.summary.santri.nama_lengkap}
                      </td>
                    </tr>
                    <tr>
                      <td className="py-1 font-semibold text-slate-700">NIS / Kamar</td>
                      <td className="py-1">:</td>
                      <td className="py-1 font-mono">
                        {printDoc.summary.santri.nis} / Kamar {printDoc.summary.santri.kamar}
                      </td>
                    </tr>
                    <tr>
                      <td className="py-1 font-semibold text-slate-700">Nama Orang Tua / Wali</td>
                      <td className="py-1">:</td>
                      <td className="py-1">{getDefaultWali(printDoc.summary.santri).nama || '-'}</td>
                    </tr>
                    <tr>
                      <td className="py-1 font-semibold text-slate-700">Akumulasi Poin</td>
                      <td className="py-1">:</td>
                      <td className="py-1 font-bold text-rose-800">
                        {printDoc.summary.totalPoin} Poin ({printDoc.summary.totalKasus} catatan
                        pelanggaran)
                      </td>
                    </tr>
                  </tbody>
                </table>

                <div>
                  <p className="font-bold text-slate-800 mb-1.5">
                    Rincian Catatan Pelanggaran Tata Tertib:
                  </p>
                  <table className="w-full border-collapse border border-slate-400 text-[11px]">
                    <thead>
                      <tr className="bg-slate-100">
                        <th className="border border-slate-400 px-2 py-1 text-left w-8">No</th>
                        <th className="border border-slate-400 px-2 py-1 text-left w-28">Tanggal</th>
                        <th className="border border-slate-400 px-2 py-1 text-left">Pelanggaran</th>
                        <th className="border border-slate-400 px-2 py-1 text-center w-16">Tingkat</th>
                        <th className="border border-slate-400 px-2 py-1 text-center w-14">Poin</th>
                      </tr>
                    </thead>
                    <tbody>
                      {printDoc.summary.kasusList.slice(0, 10).map((k, idx) => (
                        <tr key={k.id}>
                          <td className="border border-slate-400 px-2 py-1 text-center">{idx + 1}</td>
                          <td className="border border-slate-400 px-2 py-1 font-mono">
                            {formatTanggalIndo(k.tanggal)}
                          </td>
                          <td className="border border-slate-400 px-2 py-1">
                            {k.nama_pelanggaran}
                          </td>
                          <td className="border border-slate-400 px-2 py-1 text-center capitalize">
                            {k.tingkat}
                          </td>
                          <td className="border border-slate-400 px-2 py-1 text-center font-bold">
                            +{k.poin}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="p-3 bg-slate-50 border border-slate-300 rounded text-[11px] text-slate-800 space-y-1">
                  <p className="font-bold text-slate-900">Ketentuan Tindak Lanjut:</p>
                  {printDoc.spTarget === 3 ? (
                    <p>
                      Surat Peringatan ke-3 (SP-3) merupakan peringatan terakhir. Orang Tua/Wali
                      Santri diwajibkan menghadap Pengasuh dan Kepala Pondok bersama ananda untuk
                      evaluasi kelanjutan pembinaan di pesantren.
                    </p>
                  ) : printDoc.spTarget === 2 ? (
                    <p>
                      Surat Peringatan ke-2 (SP-2) mewajibkan Orang Tua/Wali Santri hadir atau
                      berkomunikasi langsung dengan Kepala Pondok / Sie Keamanan serta menandatangani
                      surat pernyataan pembinaan.
                    </p>
                  ) : (
                    <p>
                      Surat Peringatan ke-1 (SP-1) diberikan sebagai teguran resmi tertulis agar
                      ananda memperbaiki kedisiplinan dan menyelesaikan seluruh takzir yang
                      ditetapkan.
                    </p>
                  )}
                </div>

                <div className="pt-2 grid grid-cols-3 gap-4 text-center text-[11px]">
                  <div>
                    <p>Mengetahui,</p>
                    <p className="font-bold">Kepala Pondok</p>
                    <div className="h-16 flex items-center justify-center">
                      {pengaturan.ttd_kepala_pondok_url && (
                        <img
                          src={pengaturan.ttd_kepala_pondok_url}
                          alt="TTD Kepala Pondok"
                          referrerPolicy="no-referrer"
                          className="h-14 object-contain"
                        />
                      )}
                    </div>
                    <p className="font-bold underline">
                      {pengaturan.nama_kepala_pondok || 'Kepala Pondok'}
                    </p>
                  </div>

                  <div className="relative">
                    <p>Mengetahui,</p>
                    <p className="font-bold">Pengasuh Pondok</p>
                    <div className="h-16 flex items-center justify-center relative">
                      {pengaturan.stempel_url && (
                        <img
                          src={pengaturan.stempel_url}
                          alt="Stempel Pondok"
                          referrerPolicy="no-referrer"
                          className="w-16 h-16 object-contain opacity-80 absolute -left-2"
                        />
                      )}
                      {pengaturan.ttd_pengasuh_url && (
                        <img
                          src={pengaturan.ttd_pengasuh_url}
                          alt="TTD Pengasuh"
                          referrerPolicy="no-referrer"
                          className="h-14 object-contain relative z-10"
                        />
                      )}
                    </div>
                    <p className="font-bold underline">
                      {pengaturan.nama_pengasuh || 'Pengasuh Pondok'}
                    </p>
                  </div>

                  <div>
                    <p>Bululawang, {formatTanggalIndo(todayStr)}</p>
                    <p className="font-bold">Sie Keamanan Pondok</p>
                    <div className="h-16" />
                    <p className="font-bold underline">Pengurus Keamanan</p>
                  </div>
                </div>
              </>
            )}

            {printDoc.type === 'ba_pelanggaran' && (
              <>
                <div className="text-center">
                  <h2 className="text-base font-extrabold uppercase underline underline-offset-4 text-slate-900">
                    BERITA ACARA PELANGGARAN &amp; TAKZIR SANTRI
                  </h2>
                  <p className="text-[11px] font-mono text-slate-600 mt-1">
                    Nomor: {printDoc.item.no_surat || printDoc.item.id.slice(0, 8).toUpperCase()}
                  </p>
                </div>

                <table className="w-full text-xs border-collapse">
                  <tbody>
                    <tr>
                      <td className="py-1 w-44 font-semibold text-slate-700">Nama Lengkap Santri</td>
                      <td className="py-1 w-4">:</td>
                      <td className="py-1 font-bold text-slate-900">
                        {printDoc.item.santri?.nama_lengkap || '-'}
                      </td>
                    </tr>
                    <tr>
                      <td className="py-1 font-semibold text-slate-700">NIS / Kamar</td>
                      <td className="py-1">:</td>
                      <td className="py-1 font-mono">
                        {printDoc.item.santri?.nis || '-'} / Kamar{' '}
                        {printDoc.item.santri?.kamar || '-'}
                      </td>
                    </tr>
                    <tr>
                      <td className="py-1 font-semibold text-slate-700">Tanggal Kejadian</td>
                      <td className="py-1">:</td>
                      <td className="py-1 font-mono">{formatTanggalIndo(printDoc.item.tanggal)}</td>
                    </tr>
                    <tr>
                      <td className="py-1 font-semibold text-slate-700">Jenis Pelanggaran</td>
                      <td className="py-1">:</td>
                      <td className="py-1 font-bold">{printDoc.item.nama_pelanggaran}</td>
                    </tr>
                    <tr>
                      <td className="py-1 font-semibold text-slate-700">Tingkat &amp; Bobot Poin</td>
                      <td className="py-1">:</td>
                      <td className="py-1 capitalize">
                        {printDoc.item.tingkat} (+{printDoc.item.poin} poin) &middot; Total
                        akumulasi santri: <strong>{printDoc.totalPoinSantri} poin</strong>
                      </td>
                    </tr>
                    <tr>
                      <td className="py-1 font-semibold text-slate-700">Kronologi / Keterangan</td>
                      <td className="py-1">:</td>
                      <td className="py-1">{printDoc.item.kronologi || '-'}</td>
                    </tr>
                    <tr>
                      <td className="py-1 font-semibold text-slate-700">Takzir / Pembinaan</td>
                      <td className="py-1">:</td>
                      <td className="py-1">
                        {printDoc.item.takzir || '-'} (
                        {printDoc.item.status_takzir === 'selesai'
                          ? `Tuntas ${formatTanggalIndo(printDoc.item.tgl_selesai_takzir)}`
                          : 'Belum Selesai'}
                        )
                      </td>
                    </tr>
                  </tbody>
                </table>

                <div className="pt-4 grid grid-cols-2 gap-6 text-center text-[11px]">
                  <div>
                    <p>Santri Yang Bersangkutan,</p>
                    <div className="h-16" />
                    <p className="font-bold underline">
                      {printDoc.item.santri?.nama_lengkap || 'Santri'}
                    </p>
                  </div>
                  <div className="relative">
                    <p>Bululawang, {formatTanggalIndo(printDoc.item.tanggal)}</p>
                    <p className="font-bold">Petugas Sie Keamanan,</p>
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
                    <p className="font-bold underline">{printDoc.item.petugas}</p>
                  </div>
                </div>
              </>
            )}

            {printDoc.type === 'tanda_terima_sita' && (
              <>
                <div className="text-center">
                  <h2 className="text-base font-extrabold uppercase underline underline-offset-4 text-slate-900">
                    BERITA ACARA &amp; TANDA TERIMA SITA BARANG
                  </h2>
                  <p className="text-[11px] font-mono text-slate-600 mt-1">
                    Nomor: {printDoc.item.no_tanda_terima || printDoc.item.id.slice(0, 8).toUpperCase()}
                  </p>
                </div>

                <table className="w-full text-xs border-collapse">
                  <tbody>
                    <tr>
                      <td className="py-1 w-44 font-semibold text-slate-700">Nama Pemilik (Santri)</td>
                      <td className="py-1 w-4">:</td>
                      <td className="py-1 font-bold text-slate-900">
                        {printDoc.item.santri?.nama_lengkap || '-'} (Kamar{' '}
                        {printDoc.item.santri?.kamar || '-'} · NIS {printDoc.item.santri?.nis || '-'})
                      </td>
                    </tr>
                    <tr>
                      <td className="py-1 font-semibold text-slate-700">Nama &amp; Jumlah Barang</td>
                      <td className="py-1">:</td>
                      <td className="py-1 font-bold">
                        {printDoc.item.nama_barang} ({printDoc.item.jumlah} unit ·{' '}
                        {printDoc.item.kategori})
                      </td>
                    </tr>
                    <tr>
                      <td className="py-1 font-semibold text-slate-700">Tanggal Penyitaan</td>
                      <td className="py-1">:</td>
                      <td className="py-1 font-mono">{formatTanggalIndo(printDoc.item.tgl_sita)}</td>
                    </tr>
                    <tr>
                      <td className="py-1 font-semibold text-slate-700">Lokasi Penyimpanan</td>
                      <td className="py-1">:</td>
                      <td className="py-1">{printDoc.item.lokasi_simpan}</td>
                    </tr>
                    <tr>
                      <td className="py-1 font-semibold text-slate-700">Status Barang</td>
                      <td className="py-1">:</td>
                      <td className="py-1 font-bold">
                        {printDoc.item.status === 'disita'
                          ? 'MASIH DIAMANKAN DI KANTOR KEAMANAN'
                          : printDoc.item.status === 'dikembalikan'
                          ? `SUDAH DIKEMBALIKAN (${formatTanggalIndo(printDoc.item.tgl_kembali)} · Penerima: ${printDoc.item.penerima_kembali || '-'})`
                          : `DIMUSNAHKAN (${formatTanggalIndo(printDoc.item.tgl_kembali)})`}
                      </td>
                    </tr>
                    <tr>
                      <td className="py-1 font-semibold text-slate-700">Catatan</td>
                      <td className="py-1">:</td>
                      <td className="py-1">{printDoc.item.catatan || '-'}</td>
                    </tr>
                  </tbody>
                </table>

                <div className="pt-4 grid grid-cols-2 gap-6 text-center text-[11px]">
                  <div>
                    <p>
                      {printDoc.item.status === 'dikembalikan'
                        ? 'Penerima Barang (Wali Santri),'
                        : 'Santri Pemilik Barang,'}
                    </p>
                    <div className="h-16" />
                    <p className="font-bold underline">
                      {printDoc.item.status === 'dikembalikan'
                        ? printDoc.item.penerima_kembali || 'Wali Santri'
                        : printDoc.item.santri?.nama_lengkap || 'Santri'}
                    </p>
                  </div>
                  <div className="relative">
                    <p>Petugas Keamanan Penyita,</p>
                    <div className="h-16 flex items-center justify-center">
                      {pengaturan.stempel_url && (
                        <img
                          src={pengaturan.stempel_url}
                          alt="Stempel Pondok"
                          referrerPolicy="no-referrer"
                          className="w-16 h-16 object-contain opacity-75"
                        />
                      )}
                    </div>
                    <p className="font-bold underline">{printDoc.item.petugas_penyita}</p>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* TOAST NOTIFICATIONS */}
      <div className="fixed top-4 right-4 left-4 sm:left-auto z-[100] flex flex-col gap-2.5 sm:max-w-sm sm:w-full pointer-events-none print:hidden">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto p-3.5 rounded-xl shadow-lg border bg-white flex items-start gap-3 ${
              t.type === 'success'
                ? 'border-emerald-200'
                : t.type === 'error'
                ? 'border-rose-200'
                : 'border-sky-200'
            }`}
          >
            {t.type === 'success' && (
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
            )}
            {t.type === 'error' && (
              <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
            )}
            {t.type === 'info' && <Info className="w-5 h-5 text-sky-600 shrink-0 mt-0.5" />}
            <div className="min-w-0 flex-1">
              <div className="text-xs font-bold text-slate-900">{t.title}</div>
              <div className="text-[11px] text-slate-600 mt-0.5 leading-snug">{t.message}</div>
            </div>
            <button
              type="button"
              onClick={() => setToasts((prev) => prev.filter((item) => item.id !== t.id))}
              className="text-slate-400 hover:text-slate-600 p-0.5"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>

      {/* HEADER UTAMA */}
      <div className="print:hidden flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs font-semibold text-emerald-800">
            <ShieldAlert className="w-4 h-4 shrink-0" />
            <span>Sie Keamanan &amp; Ketertiban Pondok</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight mt-0.5">
            Keamanan, Poin &amp; Sita Barang
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Pencatatan pelanggaran berpoin otomatis, pantauan takzir, inventaris barang sitaan, dan cetak SP 1–3.
          </p>
        </div>

        <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleReload}
            disabled={loading}
            className="min-h-[40px] px-3 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Muat Ulang
          </button>

          <button
            type="button"
            onClick={handleExportExcel}
            className="min-h-[40px] px-3 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-700" />
            Ekspor Excel
          </button>

          <button
            type="button"
            onClick={openCreateSitaModal}
            className="min-h-[40px] px-3.5 py-2 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap"
          >
            <Package className="w-4 h-4" />
            Sita Barang
          </button>

          <button
            type="button"
            onClick={() => openCreatePelanggaranModal()}
            className="min-h-[40px] px-4 py-2 bg-emerald-800 hover:bg-emerald-900 text-white rounded-xl text-xs font-bold shadow-xs flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            Catat Pelanggaran
          </button>
        </div>
      </div>

      {fetchError && (
        <div className="print:hidden bg-rose-50 border border-rose-200 rounded-2xl p-4 flex items-start gap-3 text-rose-900 text-xs">
          <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <span className="font-bold">Kendala Memuat Database:</span> {fetchError}
          </div>
        </div>
      )}

      {hasLocalFallback && (
        <div className="print:hidden bg-amber-50/80 border border-amber-200 rounded-2xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-amber-950">
          <div className="flex items-start gap-2.5">
            <Info className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold">Mode Penyimpanan Lokal Aktif:</span> Tabel{' '}
              <span className="font-mono">keamanan_*</span> belum tersedia di Supabase sehingga data
              keamanan disimpan sementara di peramban ini.
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowSqlModal(true)}
            className="min-h-[36px] px-3 py-1.5 bg-white hover:bg-amber-100 text-amber-900 border border-amber-300 rounded-lg font-bold text-[11px] shrink-0 whitespace-nowrap"
          >
            Lihat SQL Tabel Supabase
          </button>
        </div>
      )}

      {/* 4 KARTU KPI KEAMANAN */}
      <div className="print:hidden grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-white p-4 rounded-2xl border border-slate-200">
          <span className="text-xs font-semibold text-slate-500 block">Kasus Bulan Ini</span>
          <strong className="text-2xl font-extrabold text-slate-900 tabular-nums mt-1.5 block">
            {loading ? '...' : kpiStats.kasusBulanIni}
          </strong>
          <span className="text-[11px] text-slate-500 mt-0.5 block">
            Total {pelanggaranViewItems.length} catatan tersimpan
          </span>
        </div>

        <div
          className={`p-4 rounded-2xl border ${
            kpiStats.takzirBelumSelesai > 0
              ? 'bg-rose-50/70 border-rose-200'
              : 'bg-white border-slate-200'
          }`}
        >
          <span
            className={`text-xs font-semibold block ${
              kpiStats.takzirBelumSelesai > 0 ? 'text-rose-800' : 'text-slate-500'
            }`}
          >
            Takzir Belum Selesai
          </span>
          <strong
            className={`text-2xl font-extrabold tabular-nums mt-1.5 block ${
              kpiStats.takzirBelumSelesai > 0 ? 'text-rose-700' : 'text-slate-900'
            }`}
          >
            {loading ? '...' : kpiStats.takzirBelumSelesai}
          </strong>
          <span
            className={`text-[11px] mt-0.5 block ${
              kpiStats.takzirBelumSelesai > 0 ? 'text-rose-700 font-medium' : 'text-slate-500'
            }`}
          >
            {kpiStats.takzirBelumSelesai > 0
              ? 'Perlu pantauan penyelesaian sanksi'
              : 'Semua takzir sudah tuntas'}
          </span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200">
          <span className="text-xs font-semibold text-slate-500 block">Barang Masih Disita</span>
          <strong className="text-2xl font-extrabold text-amber-800 tabular-nums mt-1.5 block">
            {loading ? '...' : kpiStats.barangDisita}
          </strong>
          <span className="text-[11px] text-slate-500 mt-0.5 block">
            Tersimpan di Kantor Keamanan
          </span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200">
          <span className="text-xs font-semibold text-slate-500 block">Santri Ambang SP</span>
          <strong className="text-2xl font-extrabold text-slate-900 tabular-nums mt-1.5 block">
            {loading ? '...' : kpiStats.santriAmbangSp}
          </strong>
          <span className="text-[11px] text-slate-500 mt-0.5 block">
            Akumulasi &ge; 25 poin (SP 1–3)
          </span>
        </div>
      </div>

      {/* TAB NAVIGASI (SCROLLABLE ON MOBILE) */}
      <div className="print:hidden w-full overflow-x-auto pb-1">
        <div className="inline-flex items-center gap-1 p-1 bg-slate-100 border border-slate-200 rounded-xl min-w-max">
          <button
            type="button"
            onClick={() => setActiveTab('pelanggaran')}
            className={`min-h-[38px] px-3.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
              activeTab === 'pelanggaran'
                ? 'bg-white text-emerald-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <ShieldAlert className="w-3.5 h-3.5" />
            Pelanggaran &amp; Takzir
            {overdueIzinAlerts.length > 0 && (
              <span className="ml-0.5 px-1.5 py-0.5 rounded-md bg-rose-600 text-white text-[10px] font-bold tabular-nums">
                {overdueIzinAlerts.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('poin')}
            className={`min-h-[38px] px-3.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
              activeTab === 'poin'
                ? 'bg-white text-emerald-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Award className="w-3.5 h-3.5" />
            Poin &amp; Ambang SP
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('sita')}
            className={`min-h-[38px] px-3.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
              activeTab === 'sita'
                ? 'bg-white text-emerald-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Package className="w-3.5 h-3.5" />
            Sita Barang
            {kpiStats.barangDisita > 0 && (
              <span className="ml-0.5 px-1.5 py-0.5 rounded-md bg-amber-600 text-white text-[10px] font-bold tabular-nums">
                {kpiStats.barangDisita}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('master')}
            className={`min-h-[38px] px-3.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
              activeTab === 'master'
                ? 'bg-white text-emerald-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            Master Kategori &amp; Poin
          </button>
        </div>
      </div>

      {/* ================================================================= */}
      {/* TAB 1: PELANGGARAN & TAKZIR + SINKRON TELAT IZIN                  */}
      {/* ================================================================= */}
      {activeTab === 'pelanggaran' && (
        <div className="print:hidden space-y-4">
          {/* PANEL SINKRON TELAT IZIN DARI MODUL PERIZINAN */}
          {overdueIzinAlerts.length > 0 && (
            <div className="bg-amber-50/80 border border-amber-300 rounded-2xl p-4 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-start gap-2.5">
                  <Clock className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
                  <div>
                    <h2 className="text-xs sm:text-sm font-extrabold text-amber-950">
                      Sinkron Telat Izin Pulang ({overdueIzinAlerts.length} santri belum masuk catatan Keamanan)
                    </h2>
                    <p className="text-[11px] text-amber-900 mt-0.5">
                      Data terdeteksi otomatis dari modul Perizinan (melewati batas waktu kembali atau berstatus terlambat).
                    </p>
                  </div>
                </div>
                <Link
                  href="/perizinan"
                  className="text-xs font-bold text-amber-900 hover:underline inline-flex items-center gap-1 shrink-0 whitespace-nowrap"
                >
                  Buka Perizinan <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>

              <div className="divide-y divide-amber-200/80 bg-white rounded-xl border border-amber-200">
                {overdueIzinAlerts.map((alert) => (
                  <div
                    key={alert.izin.id}
                    className="p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs"
                  >
                    <div className="min-w-0">
                      <div className="font-bold text-slate-900">
                        {alert.santri?.nama_lengkap || 'Santri'}
                        <span className="font-normal text-slate-500 ml-1.5">
                          Kamar {alert.santri?.kamar || '-'} &middot; NIS {alert.santri?.nis || '-'}
                        </span>
                      </div>
                      <div className="text-[11px] text-amber-900 mt-0.5">
                        {alert.keteranganTelat} &middot; {alert.dendaLabel}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => openCreatePelanggaranModal(alert)}
                      className="min-h-[40px] px-3.5 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold shrink-0 whitespace-nowrap flex items-center justify-center gap-1.5"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Catat Pelanggaran Telat
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* FILTER BAR PELANGGARAN */}
          <div className="bg-white p-3.5 sm:p-4 rounded-2xl border border-slate-200 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-2.5">
            <div className="relative sm:col-span-2 lg:col-span-5 min-w-0">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                placeholder="Cari nama santri, NIS, pelanggaran, takzir, petugas..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full min-h-[40px] pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-600"
              />
            </div>

            <select
              value={filterTingkat}
              onChange={(e) =>
                setFilterTingkat(e.target.value as 'semua' | TingkatPelanggaran)
              }
              className="lg:col-span-2 min-h-[40px] px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800"
            >
              <option value="semua">Semua Tingkat</option>
              <option value="ringan">Ringan</option>
              <option value="sedang">Sedang</option>
              <option value="berat">Berat</option>
            </select>

            <select
              value={filterTakzir}
              onChange={(e) => setFilterTakzir(e.target.value as 'semua' | StatusTakzir)}
              className="lg:col-span-3 min-h-[40px] px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800"
            >
              <option value="semua">Semua Status Takzir</option>
              <option value="belum_selesai">Takzir Belum Selesai</option>
              <option value="selesai">Takzir Sudah Selesai</option>
            </select>

            <select
              value={filterKamar}
              onChange={(e) => setFilterKamar(e.target.value)}
              className="sm:col-span-2 lg:col-span-2 min-h-[40px] px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800"
            >
              <option value="SEMUA">Semua Kamar</option>
              {kamarOptions.map((k) => (
                <option key={k} value={k}>
                  Kamar {k}
                </option>
              ))}
            </select>
          </div>

          {/* DAFTAR PELANGGARAN: DESKTOP TABLE */}
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            {loading ? (
              <div className="p-10 text-center text-xs text-slate-500">
                Memuat catatan pelanggaran &amp; poin keamanan...
              </div>
            ) : filteredPelanggaran.length === 0 ? (
              <div className="p-10 text-center space-y-3">
                <ShieldAlert className="w-10 h-10 text-slate-300 mx-auto" />
                <div>
                  <p className="text-sm font-bold text-slate-800">
                    Belum Ada Catatan Pelanggaran
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    Tidak ada kasus yang cocok dengan filter saat ini, atau klik tombol di bawah untuk mencatat kasus baru.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => openCreatePelanggaranModal()}
                  className="min-h-[40px] px-4 py-2 bg-emerald-800 hover:bg-emerald-900 text-white rounded-xl text-xs font-bold inline-flex items-center gap-1.5"
                >
                  <Plus className="w-4 h-4" />
                  Catat Pelanggaran Pertama
                </button>
              </div>
            ) : (
              <>
                {/* DESKTOP HIGH-DENSITY TABLE */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                        <th className="py-3 px-3 w-11 text-center">No</th>
                        <th className="py-3 px-3.5 min-w-[175px]">Santri &amp; Kamar</th>
                        <th className="py-3 px-3.5 min-w-[235px]">Tanggal &amp; Pelanggaran</th>
                        <th className="py-3 px-3.5 w-40 whitespace-nowrap">Tingkat &amp; Poin</th>
                        <th className="py-3 px-3.5 min-w-[195px]">Takzir &amp; Status</th>
                        <th className="py-3 px-3.5 text-right w-[268px]">Aksi Cepat</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredPelanggaran.map((item, idx) => {
                        const tStyle = getTingkatStyle(item.tingkat);
                        const wali = getDefaultWali(item.santri);
                        const waNum = formatWaNumber(wali.wa);
                        const waMsg = buildWaPelanggaran(item);
                        const totalPoin = santriTotalPoinMap.get(item.santri_id) || item.poin;

                        return (
                          <tr key={item.id} className="hover:bg-slate-50/70 transition-colors">
                            <td className="py-3.5 px-3 align-top text-center text-slate-400 font-semibold tabular-nums">
                              {idx + 1}
                            </td>

                            <td className="py-3.5 px-3.5 align-top">
                              <div className="font-bold text-slate-900 leading-snug">
                                {item.santri?.nama_lengkap || 'Santri'}
                              </div>
                              <div className="text-[11px] text-slate-500 mt-0.5 tabular-nums whitespace-nowrap">
                                Kamar {item.santri?.kamar || '-'} &middot; NIS{' '}
                                {item.santri?.nis || '-'}
                              </div>
                              <div className="text-[11px] text-slate-500 mt-0.5">
                                Petugas: <span className="font-semibold text-slate-700">{item.petugas}</span>
                              </div>
                            </td>

                            <td className="py-3.5 px-3.5 align-top">
                              <div className="text-[11px] font-semibold text-slate-500 tabular-nums flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                                <span className="whitespace-nowrap">{formatTanggalIndo(item.tanggal)}</span>
                                {item.izin_id && (
                                  <span className="text-amber-700 font-bold whitespace-nowrap">
                                    &middot; Sinkron Telat Izin
                                  </span>
                                )}
                              </div>
                              <div className="font-bold text-slate-900 mt-0.5 leading-snug">
                                {item.nama_pelanggaran}
                              </div>
                              {item.kronologi && (
                                <p className="text-[11px] text-slate-600 mt-0.5 line-clamp-2 leading-relaxed">
                                  {item.kronologi}
                                </p>
                              )}
                            </td>

                            <td className="py-3.5 px-3.5 align-top whitespace-nowrap">
                              <span
                                className={`inline-flex items-center px-2.5 py-1 rounded-md border text-[11px] font-bold whitespace-nowrap ${tStyle.badgeClass}`}
                              >
                                {tStyle.label} &middot; +{item.poin} poin
                              </span>
                              <div className="text-[11px] text-slate-600 mt-1.5 tabular-nums">
                                Akumulasi: <strong>{totalPoin} poin</strong>
                              </div>
                            </td>

                            <td className="py-3.5 px-3.5 align-top">
                              <div className="font-semibold text-slate-800 leading-snug">{item.takzir}</div>
                              <div className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px]">
                                <span
                                  className={`font-bold ${
                                    item.status_takzir === 'selesai'
                                      ? 'text-emerald-700'
                                      : 'text-rose-700'
                                  }`}
                                >
                                  {item.status_takzir === 'selesai'
                                    ? `Takzir Tuntas (${formatTanggalIndo(item.tgl_selesai_takzir)})`
                                    : 'Takzir Belum Selesai'}
                                </span>
                                {item.wa_terkirim && (
                                  <span className="text-emerald-700 font-semibold whitespace-nowrap">
                                    &middot; Wali diinfokan
                                  </span>
                                )}
                              </div>
                            </td>

                            <td className="py-3.5 px-3.5 align-top text-right">
                              <div className="flex flex-col items-end gap-1.5">
                                <div className="flex flex-nowrap items-center justify-end gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => handleToggleTakzirSelesai(item)}
                                    className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold inline-flex items-center gap-1 whitespace-nowrap shrink-0 transition-colors ${
                                      item.status_takzir === 'selesai'
                                        ? 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                                        : 'bg-emerald-700 hover:bg-emerald-800 text-white'
                                    }`}
                                  >
                                    <CheckCircle2 className="w-3.5 h-3.5" />
                                    {item.status_takzir === 'selesai'
                                      ? 'Buka Ulang'
                                      : 'Tuntaskan Takzir'}
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => openEditPelanggaranModal(item)}
                                    className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-bold inline-flex items-center gap-1 whitespace-nowrap shrink-0"
                                  >
                                    <Edit3 className="w-3.5 h-3.5" />
                                    Edit
                                  </button>
                                </div>

                                <div className="flex flex-nowrap items-center justify-end gap-1.5">
                                  {waNum && (
                                    <a
                                      href={`https://wa.me/${waNum}?text=${encodeURIComponent(waMsg)}`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      onClick={() => markPelanggaranWaSent(item)}
                                      className="px-2.5 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border border-emerald-200 text-[11px] font-bold inline-flex items-center gap-1 whitespace-nowrap shrink-0"
                                    >
                                      <MessageCircle className="w-3.5 h-3.5" />
                                      WA Wali
                                    </a>
                                  )}

                                  <button
                                    type="button"
                                    onClick={() => handleCopyText(waMsg, 'Pesan WA Pelanggaran')}
                                    className="px-2.5 py-1.5 rounded-lg bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 text-[11px] font-semibold inline-flex items-center gap-1 whitespace-nowrap shrink-0"
                                  >
                                    <Copy className="w-3.5 h-3.5" />
                                    Salin WA
                                  </button>

                                  <button
                                    type="button"
                                    title="Cetak Berita Acara Pelanggaran"
                                    onClick={() =>
                                      setPrintDoc({
                                        type: 'ba_pelanggaran',
                                        item,
                                        totalPoinSantri: totalPoin,
                                      })
                                    }
                                    className="px-2.5 py-1.5 rounded-lg bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 text-[11px] font-semibold inline-flex items-center gap-1 whitespace-nowrap shrink-0"
                                  >
                                    <Printer className="w-3.5 h-3.5" />
                                    BA
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => setDeleteTarget({ kind: 'pelanggaran', item })}
                                    title="Hapus catatan"
                                    aria-label={`Hapus catatan ${item.nama_pelanggaran}`}
                                    className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 shrink-0"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </div>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* MOBILE / PWA CARD VIEW */}
                <div className="md:hidden divide-y divide-slate-200">
                  {filteredPelanggaran.map((item) => {
                    const tStyle = getTingkatStyle(item.tingkat);
                    const wali = getDefaultWali(item.santri);
                    const waNum = formatWaNumber(wali.wa);
                    const waMsg = buildWaPelanggaran(item);
                    const totalPoin = santriTotalPoinMap.get(item.santri_id) || item.poin;

                    return (
                      <div key={item.id} className="p-4 space-y-3 text-xs">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="font-bold text-sm text-slate-900 truncate">
                              {item.santri?.nama_lengkap || 'Santri'}
                            </div>
                            <div className="text-[11px] text-slate-500 mt-0.5 tabular-nums">
                              Kamar {item.santri?.kamar || '-'} &middot; NIS {item.santri?.nis || '-'}
                            </div>
                          </div>
                          <span
                            className={`px-2.5 py-0.5 rounded-md border text-[11px] font-bold shrink-0 whitespace-nowrap ${tStyle.badgeClass}`}
                          >
                            {tStyle.label} +{item.poin}
                          </span>
                        </div>

                        <div className="space-y-1">
                          <div className="text-[11px] text-slate-500 tabular-nums">
                            {formatTanggalIndo(item.tanggal)} &middot; Total {totalPoin} poin
                          </div>
                          <div className="font-bold text-slate-900">{item.nama_pelanggaran}</div>
                          {item.kronologi && (
                            <p className="text-[11px] text-slate-600">{item.kronologi}</p>
                          )}
                          <div className="text-[11px] text-slate-700 pt-0.5">
                            <span className="font-semibold">Takzir:</span> {item.takzir}
                          </div>
                          <div
                            className={`text-[11px] font-bold ${
                              item.status_takzir === 'selesai'
                                ? 'text-emerald-700'
                                : 'text-rose-700'
                            }`}
                          >
                            {item.status_takzir === 'selesai'
                              ? `Takzir Tuntas (${formatTanggalIndo(item.tgl_selesai_takzir)})`
                              : 'Takzir Belum Selesai'}
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() => handleToggleTakzirSelesai(item)}
                            className={`min-h-[40px] px-3 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 ${
                              item.status_takzir === 'selesai'
                                ? 'bg-slate-100 text-slate-700'
                                : 'bg-emerald-700 text-white'
                            }`}
                          >
                            <CheckCircle2 className="w-4 h-4" />
                            {item.status_takzir === 'selesai' ? 'Buka Takzir' : 'Tuntaskan'}
                          </button>

                          {waNum ? (
                            <a
                              href={`https://wa.me/${waNum}?text=${encodeURIComponent(waMsg)}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={() => markPelanggaranWaSent(item)}
                              className="min-h-[40px] px-3 py-2 rounded-xl bg-emerald-50 text-emerald-900 border border-emerald-200 text-xs font-bold flex items-center justify-center gap-1.5"
                            >
                              <MessageCircle className="w-4 h-4" />
                              WA Wali
                            </a>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleCopyText(waMsg, 'Pesan WA Pelanggaran')}
                              className="min-h-[40px] px-3 py-2 rounded-xl bg-slate-100 text-slate-700 text-xs font-bold flex items-center justify-center gap-1.5"
                            >
                              <Copy className="w-4 h-4" />
                              Salin WA
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => handleCopyText(waMsg, 'Pesan WA Pelanggaran')}
                            className="min-h-[40px] px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-slate-700 text-xs font-semibold flex items-center justify-center gap-1.5"
                          >
                            <Copy className="w-3.5 h-3.5" />
                            Salin WA
                          </button>

                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() =>
                                setPrintDoc({
                                  type: 'ba_pelanggaran',
                                  item,
                                  totalPoinSantri: totalPoin,
                                })
                              }
                              className="flex-1 min-h-[40px] px-2.5 py-2 rounded-xl bg-slate-50 border border-slate-200 text-slate-700 text-xs font-semibold flex items-center justify-center gap-1"
                            >
                              <Printer className="w-3.5 h-3.5" />
                              BA
                            </button>
                            <button
                              type="button"
                              onClick={() => openEditPelanggaranModal(item)}
                              aria-label="Edit pelanggaran"
                              className="min-h-[40px] min-w-[40px] rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center"
                            >
                              <Edit3 className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeleteTarget({ kind: 'pelanggaran', item })}
                              aria-label="Hapus pelanggaran"
                              className="min-h-[40px] min-w-[40px] rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* TAB 2: AKUMULASI POIN & AMBANG SURAT PERINGATAN (SP 1 - SP 3)     */}
      {/* ================================================================= */}
      {activeTab === 'poin' && (
        <div className="print:hidden space-y-4">
          <div className="bg-white p-4 rounded-2xl border border-slate-200 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs">
              <div>
                <h2 className="font-bold text-slate-900">Ambang Poin &amp; Surat Peringatan (SP)</h2>
                <p className="text-slate-500 mt-0.5">
                  1–24 Poin: Pembinaan &middot; 25–49 Poin: SP 1 &middot; 50–99 Poin: SP 2 &middot; &ge; 100 Poin: SP 3
                </p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {(
                  [
                    { id: 'berpoin', label: 'Santri Berpoin (>0)' },
                    { id: 'ambang_sp', label: 'Ambang SP (≥25)' },
                    { id: 'semua', label: 'Semua Santri' },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setFilterSpScope(opt.id)}
                    className={`min-h-[36px] px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors whitespace-nowrap ${
                      filterSpScope === opt.id
                        ? 'bg-emerald-800 text-white border-emerald-800'
                        : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                placeholder="Cari santri, NIS, atau kamar di rekap poin..."
                value={poinSearch}
                onChange={(e) => setPoinSearch(e.target.value)}
                className="w-full min-h-[40px] pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-600"
              />
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            {filteredPoinSummaries.length === 0 ? (
              <div className="p-10 text-center text-xs text-slate-500">
                Belum ada santri yang sesuai dengan filter poin saat ini.
              </div>
            ) : (
              <>
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                        <th className="py-3 px-3 w-11 text-center">No</th>
                        <th className="py-3 px-3.5 min-w-[180px]">Santri &amp; Kamar</th>
                        <th className="py-3 px-3.5 min-w-[165px]">Rincian Kasus</th>
                        <th className="py-3 px-3.5 w-28 text-right whitespace-nowrap">Total Poin</th>
                        <th className="py-3 px-3.5 min-w-[195px]">Status Ambang SP</th>
                        <th className="py-3 px-3.5 text-right w-[235px]">Aksi Pembinaan &amp; SP</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredPoinSummaries.map((summary, idx) => {
                        const wali = getDefaultWali(summary.santri);
                        const waNum = formatWaNumber(wali.wa);
                        const waMsg = buildWaSpSummary(summary);
                        const spTarget: 1 | 2 | 3 =
                          summary.spLevel >= 3 ? 3 : summary.spLevel === 2 ? 2 : 1;

                        return (
                          <tr key={summary.santri.id} className="hover:bg-slate-50/70">
                            <td className="py-3.5 px-3 align-top text-center text-slate-400 font-semibold tabular-nums">
                              {idx + 1}
                            </td>
                            <td className="py-3.5 px-3.5 align-top">
                              <div className="font-bold text-slate-900">
                                {summary.santri.nama_lengkap}
                              </div>
                              <div className="text-[11px] text-slate-500 mt-0.5 tabular-nums whitespace-nowrap">
                                Kamar {summary.santri.kamar} &middot; NIS {summary.santri.nis}
                              </div>
                            </td>
                            <td className="py-3.5 px-3.5 align-top text-[11px] text-slate-600 tabular-nums">
                              <div className="whitespace-nowrap">
                                Total <strong>{summary.totalKasus}</strong> kasus
                                {summary.takzirAktif > 0 && (
                                  <span className="text-rose-700 font-bold ml-1">
                                    ({summary.takzirAktif} aktif)
                                  </span>
                                )}
                              </div>
                              <div className="mt-0.5 whitespace-nowrap">
                                R: {summary.ringanCount} &middot; S: {summary.sedangCount} &middot; B:{' '}
                                {summary.beratCount}
                              </div>
                            </td>
                            <td className="py-3.5 px-3.5 align-top text-right whitespace-nowrap">
                              <strong
                                className={`text-lg font-extrabold tabular-nums ${
                                  summary.totalPoin >= 50
                                    ? 'text-rose-700'
                                    : summary.totalPoin >= 25
                                    ? 'text-amber-700'
                                    : 'text-slate-900'
                                }`}
                              >
                                {summary.totalPoin}
                              </strong>
                            </td>
                            <td className="py-3.5 px-3.5 align-top">
                              <span
                                className={`inline-flex items-center px-2.5 py-1 rounded-md border text-[11px] font-bold whitespace-nowrap ${
                                  summary.spLevel >= 2
                                    ? 'bg-rose-50 text-rose-800 border-rose-200'
                                    : summary.spLevel === 1
                                    ? 'bg-amber-50 text-amber-800 border-amber-200'
                                    : 'bg-slate-50 text-slate-700 border-slate-200'
                                }`}
                              >
                                {summary.spLabel}
                              </span>
                              <div className="text-[11px] text-slate-500 mt-1 leading-snug">
                                {summary.spKeterangan}
                              </div>
                            </td>
                            <td className="py-3.5 px-3.5 align-top text-right">
                              <div className="flex flex-col items-end gap-1.5">
                                <div className="flex flex-nowrap items-center justify-end gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setPrintDoc({
                                        type: 'surat_peringatan',
                                        summary,
                                        spTarget,
                                        nomorSurat: `SP-${spTarget}/KEAM/${(todayStr || getLocalTodayStr()).replace(/-/g, '')}/${summary.santri.nis}`,
                                      })
                                    }
                                    className="px-2.5 py-1.5 rounded-lg bg-rose-700 hover:bg-rose-800 text-white text-[11px] font-bold inline-flex items-center gap-1 whitespace-nowrap shrink-0"
                                  >
                                    <Printer className="w-3.5 h-3.5" />
                                    Cetak SP-{spTarget}
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => {
                                      setSearchQuery(summary.santri.nama_lengkap);
                                      setActiveTab('pelanggaran');
                                    }}
                                    className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-semibold whitespace-nowrap shrink-0"
                                  >
                                    Lihat Kasus
                                  </button>
                                </div>

                                <div className="flex flex-nowrap items-center justify-end gap-1.5">
                                  {waNum && (
                                    <a
                                      href={`https://wa.me/${waNum}?text=${encodeURIComponent(waMsg)}`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="px-2.5 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border border-emerald-200 text-[11px] font-bold inline-flex items-center gap-1 whitespace-nowrap shrink-0"
                                    >
                                      <MessageCircle className="w-3.5 h-3.5" />
                                      WA Wali
                                    </a>
                                  )}

                                  <button
                                    type="button"
                                    onClick={() => handleCopyText(waMsg, 'Rekap Poin & SP')}
                                    className="px-2.5 py-1.5 rounded-lg bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 text-[11px] font-semibold inline-flex items-center gap-1 whitespace-nowrap shrink-0"
                                  >
                                    <Copy className="w-3.5 h-3.5" />
                                    Salin WA
                                  </button>
                                </div>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* MOBILE CARDS POIN & SP */}
                <div className="md:hidden divide-y divide-slate-200">
                  {filteredPoinSummaries.map((summary) => {
                    const wali = getDefaultWali(summary.santri);
                    const waNum = formatWaNumber(wali.wa);
                    const waMsg = buildWaSpSummary(summary);
                    const spTarget: 1 | 2 | 3 =
                      summary.spLevel >= 3 ? 3 : summary.spLevel === 2 ? 2 : 1;

                    return (
                      <div key={summary.santri.id} className="p-4 space-y-2.5 text-xs">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="font-bold text-sm text-slate-900 truncate">
                              {summary.santri.nama_lengkap}
                            </div>
                            <div className="text-[11px] text-slate-500 tabular-nums">
                              Kamar {summary.santri.kamar} &middot; {summary.totalKasus} kasus
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <strong
                              className={`text-lg font-extrabold tabular-nums block leading-none ${
                                summary.totalPoin >= 50
                                  ? 'text-rose-700'
                                  : summary.totalPoin >= 25
                                  ? 'text-amber-700'
                                  : 'text-slate-900'
                              }`}
                            >
                              {summary.totalPoin} poin
                            </strong>
                            <span className="text-[11px] font-bold text-slate-600">
                              {summary.spLabel}
                            </span>
                          </div>
                        </div>

                        <p className="text-[11px] text-slate-600">{summary.spKeterangan}</p>

                        <div className="grid grid-cols-2 gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() =>
                              setPrintDoc({
                                type: 'surat_peringatan',
                                summary,
                                spTarget,
                                nomorSurat: `SP-${spTarget}/KEAM/${(todayStr || getLocalTodayStr()).replace(/-/g, '')}/${summary.santri.nis}`,
                              })
                            }
                            className="min-h-[40px] px-3 py-2 rounded-xl bg-rose-700 text-white text-xs font-bold flex items-center justify-center gap-1.5"
                          >
                            <Printer className="w-4 h-4" />
                            Cetak SP-{spTarget}
                          </button>

                          {waNum ? (
                            <a
                              href={`https://wa.me/${waNum}?text=${encodeURIComponent(waMsg)}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="min-h-[40px] px-3 py-2 rounded-xl bg-emerald-50 text-emerald-900 border border-emerald-200 text-xs font-bold flex items-center justify-center gap-1.5"
                            >
                              <MessageCircle className="w-4 h-4" />
                              WA Wali
                            </a>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleCopyText(waMsg, 'Rekap Poin & SP')}
                              className="min-h-[40px] px-3 py-2 rounded-xl bg-slate-100 text-slate-700 text-xs font-bold flex items-center justify-center gap-1.5"
                            >
                              <Copy className="w-4 h-4" />
                              Salin WA
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => handleCopyText(waMsg, 'Rekap Poin & SP')}
                            className="min-h-[40px] px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-slate-700 text-xs font-semibold flex items-center justify-center gap-1.5"
                          >
                            <Copy className="w-3.5 h-3.5" />
                            Salin WA
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setSearchQuery(summary.santri.nama_lengkap);
                              setActiveTab('pelanggaran');
                            }}
                            className="min-h-[40px] px-3 py-2 rounded-xl bg-slate-100 text-slate-700 text-xs font-semibold flex items-center justify-center"
                          >
                            Lihat Kasus
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* TAB 3: SITA BARANG & PENGEMBALIAN                                 */}
      {/* ================================================================= */}
      {activeTab === 'sita' && (
        <div className="print:hidden space-y-4">
          <div className="bg-white p-3.5 sm:p-4 rounded-2xl border border-slate-200 grid grid-cols-1 md:grid-cols-12 gap-2.5 items-center">
            <div className="relative md:col-span-6 min-w-0">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                placeholder="Cari barang sitaan, kategori, nama santri, atau kamar..."
                value={sitaSearch}
                onChange={(e) => setSitaSearch(e.target.value)}
                className="w-full min-h-[40px] pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-600"
              />
            </div>

            <select
              value={filterSitaStatus}
              onChange={(e) => setFilterSitaStatus(e.target.value as 'semua' | StatusSita)}
              className="md:col-span-3 min-h-[40px] px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800"
            >
              <option value="semua">Semua Status Barang</option>
              <option value="disita">Masih Disita</option>
              <option value="dikembalikan">Sudah Dikembalikan</option>
              <option value="dimusnahkan">Dimusnahkan</option>
            </select>

            <button
              type="button"
              onClick={openCreateSitaModal}
              className="md:col-span-3 min-h-[40px] px-4 py-2 bg-emerald-800 hover:bg-emerald-900 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 whitespace-nowrap"
            >
              <Plus className="w-4 h-4" />
              Catat Barang Sitaan
            </button>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            {filteredSita.length === 0 ? (
              <div className="p-10 text-center space-y-3">
                <Package className="w-10 h-10 text-slate-300 mx-auto" />
                <div>
                  <p className="text-sm font-bold text-slate-800">Belum Ada Barang Sitaan</p>
                  <p className="text-xs text-slate-500 mt-1">
                    Catat barang terlarang milik santri (HP, rokok/vape, elektronik) yang diamankan di Kantor Keamanan.
                  </p>
                </div>
              </div>
            ) : (
              <>
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                        <th className="py-3 px-3 w-11 text-center">No</th>
                        <th className="py-3 px-3.5 min-w-[170px]">Santri &amp; Kamar</th>
                        <th className="py-3 px-3.5 min-w-[205px]">Barang Sitaan</th>
                        <th className="py-3 px-3.5 min-w-[175px]">Tgl Sita &amp; Penyimpanan</th>
                        <th className="py-3 px-3.5 min-w-[160px]">Status Barang</th>
                        <th className="py-3 px-3.5 text-right w-[258px]">Aksi Cepat</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredSita.map((item, idx) => {
                        const wali = getDefaultWali(item.santri);
                        const waNum = formatWaNumber(wali.wa);
                        const waMsg = buildWaSita(item);

                        return (
                          <tr key={item.id} className="hover:bg-slate-50/70">
                            <td className="py-3.5 px-3 align-top text-center text-slate-400 font-semibold tabular-nums">
                              {idx + 1}
                            </td>
                            <td className="py-3.5 px-3.5 align-top">
                              <div className="font-bold text-slate-900">
                                {item.santri?.nama_lengkap || 'Santri'}
                              </div>
                              <div className="text-[11px] text-slate-500 mt-0.5 tabular-nums whitespace-nowrap">
                                Kamar {item.santri?.kamar || '-'} &middot; NIS {item.santri?.nis || '-'}
                              </div>
                            </td>
                            <td className="py-3.5 px-3.5 align-top">
                              <div className="font-bold text-slate-900 leading-snug">
                                {item.nama_barang} ({item.jumlah} unit)
                              </div>
                              <div className="text-[11px] text-slate-500 mt-0.5">
                                {item.kategori}
                                {item.catatan ? ` · ${item.catatan}` : ''}
                              </div>
                            </td>
                            <td className="py-3.5 px-3.5 align-top text-[11px] text-slate-600">
                              <div className="font-semibold text-slate-800 tabular-nums whitespace-nowrap">
                                {formatTanggalIndo(item.tgl_sita)}
                              </div>
                              <div className="mt-0.5">{item.lokasi_simpan}</div>
                              <div className="mt-0.5 text-slate-500">
                                Penyita: {item.petugas_penyita}
                              </div>
                            </td>
                            <td className="py-3.5 px-3.5 align-top">
                              {item.status === 'disita' ? (
                                <span className="inline-flex items-center px-2.5 py-1 rounded-md border bg-amber-50 text-amber-900 border-amber-200 text-[11px] font-bold whitespace-nowrap">
                                  Disita di Keamanan
                                </span>
                              ) : item.status === 'dikembalikan' ? (
                                <div>
                                  <span className="inline-flex items-center px-2.5 py-1 rounded-md border bg-emerald-50 text-emerald-800 border-emerald-200 text-[11px] font-bold whitespace-nowrap">
                                    Dikembalikan
                                  </span>
                                  <div className="text-[11px] text-slate-600 mt-1">
                                    {formatTanggalIndo(item.tgl_kembali)} &middot;{' '}
                                    {item.penerima_kembali}
                                  </div>
                                </div>
                              ) : (
                                <span className="inline-flex items-center px-2.5 py-1 rounded-md border bg-slate-100 text-slate-700 border-slate-300 text-[11px] font-bold whitespace-nowrap">
                                  Dimusnahkan ({formatTanggalIndo(item.tgl_kembali)})
                                </span>
                              )}
                            </td>
                            <td className="py-3.5 px-3.5 align-top text-right">
                              <div className="flex flex-col items-end gap-1.5">
                                <div className="flex flex-nowrap items-center justify-end gap-1.5">
                                  {item.status === 'disita' && (
                                    <button
                                      type="button"
                                      onClick={() => openReturnSitaModal(item)}
                                      className="px-2.5 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-[11px] font-bold inline-flex items-center gap-1 whitespace-nowrap shrink-0"
                                    >
                                      <Undo2 className="w-3.5 h-3.5" />
                                      Kembalikan
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => openEditSitaModal(item)}
                                    className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-bold inline-flex items-center gap-1 whitespace-nowrap shrink-0"
                                  >
                                    <Edit3 className="w-3.5 h-3.5" />
                                    Edit
                                  </button>
                                </div>

                                <div className="flex flex-nowrap items-center justify-end gap-1.5">
                                  {waNum && (
                                    <a
                                      href={`https://wa.me/${waNum}?text=${encodeURIComponent(waMsg)}`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      onClick={() => markSitaWaSent(item)}
                                      className="px-2.5 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border border-emerald-200 text-[11px] font-bold inline-flex items-center gap-1 whitespace-nowrap shrink-0"
                                    >
                                      <MessageCircle className="w-3.5 h-3.5" />
                                      WA Wali
                                    </a>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => handleCopyText(waMsg, 'Info Sita Barang')}
                                    className="px-2.5 py-1.5 rounded-lg bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 text-[11px] font-semibold inline-flex items-center gap-1 whitespace-nowrap shrink-0"
                                  >
                                    <Copy className="w-3.5 h-3.5" />
                                    Salin WA
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setPrintDoc({ type: 'tanda_terima_sita', item })
                                    }
                                    className="px-2.5 py-1.5 rounded-lg bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 text-[11px] font-semibold inline-flex items-center gap-1 whitespace-nowrap shrink-0"
                                  >
                                    <Printer className="w-3.5 h-3.5" />
                                    Bukti
                                  </button>
                                  <button
                                    type="button"
                                    aria-label={`Hapus sita ${item.nama_barang}`}
                                    onClick={() => setDeleteTarget({ kind: 'sita', item })}
                                    className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 shrink-0"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </div>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* MOBILE CARDS SITA BARANG */}
                <div className="md:hidden divide-y divide-slate-200">
                  {filteredSita.map((item) => {
                    const wali = getDefaultWali(item.santri);
                    const waNum = formatWaNumber(wali.wa);
                    const waMsg = buildWaSita(item);

                    return (
                      <div key={item.id} className="p-4 space-y-2.5 text-xs">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="font-bold text-sm text-slate-900 truncate">
                              {item.nama_barang} ({item.jumlah}x)
                            </div>
                            <div className="text-[11px] text-slate-500 mt-0.5">
                              {item.santri?.nama_lengkap || 'Santri'} &middot; Kamar{' '}
                              {item.santri?.kamar || '-'}
                            </div>
                          </div>
                          <span
                            className={`px-2 py-0.5 rounded-md border text-[11px] font-bold shrink-0 whitespace-nowrap ${
                              item.status === 'disita'
                                ? 'bg-amber-50 text-amber-900 border-amber-200'
                                : item.status === 'dikembalikan'
                                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                : 'bg-slate-100 text-slate-700 border-slate-300'
                            }`}
                          >
                            {item.status === 'disita'
                              ? 'Disita'
                              : item.status === 'dikembalikan'
                              ? 'Kembali'
                              : 'Musnah'}
                          </span>
                        </div>

                        <div className="text-[11px] text-slate-600">
                          {item.kategori} &middot; {formatTanggalIndo(item.tgl_sita)} &middot;{' '}
                          {item.lokasi_simpan}
                        </div>

                        <div className="grid grid-cols-2 gap-2 pt-1">
                          {item.status === 'disita' ? (
                            <button
                              type="button"
                              onClick={() => openReturnSitaModal(item)}
                              className="min-h-[40px] px-3 py-2 rounded-xl bg-emerald-700 text-white text-xs font-bold flex items-center justify-center gap-1.5"
                            >
                              <Undo2 className="w-4 h-4" />
                              Kembalikan
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => openEditSitaModal(item)}
                              className="min-h-[40px] px-3 py-2 rounded-xl bg-slate-100 text-slate-700 text-xs font-bold flex items-center justify-center gap-1.5"
                            >
                              <Edit3 className="w-4 h-4" />
                              Edit Data
                            </button>
                          )}

                          {waNum ? (
                            <a
                              href={`https://wa.me/${waNum}?text=${encodeURIComponent(waMsg)}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={() => markSitaWaSent(item)}
                              className="min-h-[40px] px-3 py-2 rounded-xl bg-emerald-50 text-emerald-900 border border-emerald-200 text-xs font-bold flex items-center justify-center gap-1.5"
                            >
                              <MessageCircle className="w-4 h-4" />
                              WA Wali
                            </a>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleCopyText(waMsg, 'Info Sita Barang')}
                              className="min-h-[40px] px-3 py-2 rounded-xl bg-slate-100 text-slate-700 text-xs font-bold flex items-center justify-center gap-1.5"
                            >
                              <Copy className="w-4 h-4" />
                              Salin WA
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => handleCopyText(waMsg, 'Info Sita Barang')}
                            className="min-h-[40px] px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-slate-700 text-xs font-semibold flex items-center justify-center gap-1.5"
                          >
                            <Copy className="w-3.5 h-3.5" />
                            Salin WA
                          </button>

                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => setPrintDoc({ type: 'tanda_terima_sita', item })}
                              className="flex-1 min-h-[40px] px-2.5 py-2 rounded-xl bg-slate-50 border border-slate-200 text-slate-700 text-xs font-semibold flex items-center justify-center gap-1"
                            >
                              <Printer className="w-3.5 h-3.5" />
                              Bukti
                            </button>
                            <button
                              type="button"
                              onClick={() => openEditSitaModal(item)}
                              aria-label="Edit barang sitaan"
                              className="min-h-[40px] min-w-[40px] rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center"
                            >
                              <Edit3 className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeleteTarget({ kind: 'sita', item })}
                              aria-label="Hapus barang sitaan"
                              className="min-h-[40px] min-w-[40px] rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* TAB 4: MASTER KATEGORI & BOBOT POIN                               */}
      {/* ================================================================= */}
      {activeTab === 'master' && (
        <div className="print:hidden space-y-4">
          <div className="bg-white p-4 rounded-2xl border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="text-xs">
              <h2 className="font-bold text-slate-900">
                Master Jenis Pelanggaran &amp; Bobot Poin Otomatis
              </h2>
              <p className="text-slate-500 mt-0.5">
                Daftar aturan Ringan, Sedang, dan Berat ini otomatis mengisi poin &amp; takzir saat petugas mencatat pelanggaran.
              </p>
            </div>
            <div className="flex flex-wrap gap-2 shrink-0">
              <button
                type="button"
                onClick={handleSeedStarterMaster}
                className="min-h-[40px] px-3.5 py-2 bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl text-xs font-semibold whitespace-nowrap"
              >
                Muat Template Pedoman
              </button>
              <button
                type="button"
                onClick={openCreateMasterModal}
                className="min-h-[40px] px-4 py-2 bg-emerald-800 hover:bg-emerald-900 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 whitespace-nowrap"
              >
                <Plus className="w-4 h-4" />
                Tambah Aturan Poin
              </button>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    <th className="py-3 px-3 w-11 text-center">No</th>
                    <th className="py-3 px-3.5 min-w-[210px]">Nama Jenis Pelanggaran</th>
                    <th className="py-3 px-3.5 w-28 whitespace-nowrap">Tingkat</th>
                    <th className="py-3 px-3.5 w-24 text-right whitespace-nowrap">Poin</th>
                    <th className="py-3 px-3.5 min-w-[220px]">Takzir Bawaan</th>
                    <th className="py-3 px-3.5 text-right w-32">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {masterList.map((m, idx) => {
                    const tStyle = getTingkatStyle(m.tingkat);
                    return (
                      <tr key={m.id} className="hover:bg-slate-50/70">
                        <td className="py-3 px-3 text-center text-slate-400 font-semibold tabular-nums">
                          {idx + 1}
                        </td>
                        <td className="py-3 px-3.5 font-bold text-slate-900">
                          {m.nama_pelanggaran}
                          {!m.aktif && (
                            <span className="ml-2 text-[11px] font-normal text-slate-400">
                              (Nonaktif)
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-3.5 whitespace-nowrap">
                          <span
                            className={`inline-flex items-center px-2.5 py-0.5 rounded-md border text-[11px] font-bold whitespace-nowrap ${tStyle.badgeClass}`}
                          >
                            {tStyle.label}
                          </span>
                        </td>
                        <td className="py-3 px-3.5 text-right font-extrabold text-slate-900 tabular-nums whitespace-nowrap">
                          +{m.poin}
                        </td>
                        <td className="py-3 px-3.5 text-slate-600">{m.takzir_default || '-'}</td>
                        <td className="py-3 px-3.5 text-right">
                          <div className="inline-flex flex-nowrap items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => openEditMasterModal(m)}
                              className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-bold whitespace-nowrap"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              aria-label={`Hapus aturan ${m.nama_pelanggaran}`}
                              onClick={() => setDeleteTarget({ kind: 'master', item: m })}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="md:hidden divide-y divide-slate-200">
              {masterList.map((m) => {
                const tStyle = getTingkatStyle(m.tingkat);
                return (
                  <div key={m.id} className="p-4 space-y-2 text-xs">
                    <div className="flex items-start justify-between gap-2">
                      <div className="font-bold text-slate-900">{m.nama_pelanggaran}</div>
                      <span
                        className={`px-2 py-0.5 rounded-md border text-[11px] font-bold shrink-0 whitespace-nowrap ${tStyle.badgeClass}`}
                      >
                        {tStyle.label} +{m.poin}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-600">{m.takzir_default}</p>
                    <div className="flex gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => openEditMasterModal(m)}
                        className="min-h-[38px] px-3 py-1.5 rounded-xl bg-slate-100 text-slate-700 font-bold text-xs"
                      >
                        Edit Aturan
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteTarget({ kind: 'master', item: m })}
                        className="min-h-[38px] px-3 py-1.5 rounded-xl bg-rose-50 text-rose-600 font-bold text-xs"
                      >
                        Hapus
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* MODAL CATAT / EDIT PELANGGARAN                                    */}
      {/* ================================================================= */}
      {showPelanggaranModal && (
        <div className="print:hidden fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div>
                <h2 className="text-sm sm:text-base font-extrabold text-slate-900">
                  {editingPelanggaran ? 'Edit Catatan Pelanggaran' : 'Catat Pelanggaran & Takzir Santri'}
                </h2>
                <p className="text-[11px] text-slate-500">
                  Pilih pelanggaran dari master untuk mengisi tingkat &amp; bobot poin otomatis.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowPelanggaranModal(false)}
                className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSavePelanggaran} className="p-5 space-y-4 overflow-y-auto text-xs">
              {/* 1. CARI & PILIH SANTRI */}
              <div className="space-y-1.5">
                <label className="font-bold text-slate-700 block">1. Cari &amp; Pilih Santri</label>
                {selectedFormSantri ? (
                  <div className="flex items-center justify-between gap-3 px-3.5 py-2.5 bg-emerald-50 border border-emerald-700 rounded-xl">
                    <div className="min-w-0">
                      <div className="font-bold text-emerald-950 truncate">
                        {selectedFormSantri.nama_lengkap}
                      </div>
                      <div className="text-[11px] text-emerald-800 mt-0.5 tabular-nums">
                        Kamar <strong>{selectedFormSantri.kamar}</strong> &middot; NIS{' '}
                        <span className="font-mono">{selectedFormSantri.nis}</span> &middot; Poin
                        saat ini:{' '}
                        <strong>{santriTotalPoinMap.get(selectedFormSantri.id) || 0} poin</strong>
                      </div>
                    </div>
                    {!editingPelanggaran && (
                      <button
                        type="button"
                        onClick={() => {
                          setFormSantriId('');
                          setSantriSearch('');
                          setSantriDropdownOpen(true);
                        }}
                        className="px-2.5 py-1.5 bg-white hover:bg-emerald-100 text-emerald-900 border border-emerald-300 rounded-lg font-semibold text-[11px] shrink-0 flex items-center gap-1"
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
                      className="w-full pl-10 pr-24 py-2.5 bg-white border border-slate-300 rounded-xl font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-600"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-slate-400 tabular-nums pointer-events-none">
                      {selectableSantri.length} santri
                    </span>

                    {santriDropdownOpen && (
                      <div className="absolute left-0 right-0 top-full mt-1.5 z-30 bg-white border border-slate-200 rounded-xl shadow-xl max-h-56 overflow-y-auto divide-y divide-slate-100">
                        {selectableSantri.length === 0 ? (
                          <div className="px-4 py-3 text-slate-400 text-center">
                            Santri tidak ditemukan
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
                              className="w-full px-3.5 py-2.5 text-left hover:bg-emerald-50 flex items-center justify-between gap-3"
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

              {/* 2. MASTER PELANGGARAN & TANGGAL */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <label className="font-bold text-slate-700 block mb-1">
                    2. Pilih dari Master Kategori &amp; Poin
                  </label>
                  <select
                    value={formMasterId}
                    onChange={(e) => applyMasterChoice(e.target.value)}
                    className="w-full px-3 py-2.5 bg-white border border-slate-300 rounded-xl font-semibold text-slate-900"
                  >
                    <option value="">-- Input Manual / Khusus --</option>
                    {activeMasterOptions.map((m) => (
                      <option key={m.id} value={m.id}>
                        [{m.tingkat.toUpperCase()} · +{m.poin}] {m.nama_pelanggaran}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">Tanggal Kejadian</label>
                  <input
                    type="date"
                    required
                    value={formTanggal}
                    onChange={(e) => setFormTanggal(e.target.value)}
                    className="w-full px-3 py-2.5 bg-white border border-slate-300 rounded-xl font-semibold text-slate-900"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <div className="sm:col-span-2">
                  <label className="font-bold text-slate-700 block mb-1">
                    Nama / Bentuk Pelanggaran
                  </label>
                  <input
                    type="text"
                    required
                    value={formNamaPelanggaran}
                    onChange={(e) => setFormNamaPelanggaran(e.target.value)}
                    placeholder="Contoh: Keluar area pondok tanpa izin"
                    className="w-full px-3 py-2.5 bg-white border border-slate-300 rounded-xl font-semibold text-slate-900"
                  />
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">Tingkat</label>
                  <select
                    value={formTingkat}
                    onChange={(e) => setFormTingkat(e.target.value as TingkatPelanggaran)}
                    className="w-full px-3 py-2.5 bg-white border border-slate-300 rounded-xl font-semibold text-slate-900"
                  >
                    <option value="ringan">Ringan</option>
                    <option value="sedang">Sedang</option>
                    <option value="berat">Berat</option>
                  </select>
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">Bobot Poin</label>
                  <input
                    type="number"
                    min={0}
                    required
                    value={formPoin}
                    onChange={(e) => setFormPoin(e.target.value)}
                    className="w-full px-3 py-2.5 bg-white border border-slate-300 rounded-xl font-extrabold text-rose-700 tabular-nums"
                  />
                </div>
              </div>

              {/* 3. KRONOLOGI & TAKZIR */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">
                    Takzir / Sanksi Pembinaan
                  </label>
                  <textarea
                    rows={2}
                    value={formTakzir}
                    onChange={(e) => setFormTakzir(e.target.value)}
                    placeholder="Sanksi / takzir yang ditetapkan Sie Keamanan..."
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-slate-900 placeholder:text-slate-400"
                  />
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">
                    Kronologi / Keterangan Kejadian
                  </label>
                  <textarea
                    rows={2}
                    value={formKronologi}
                    onChange={(e) => setFormKronologi(e.target.value)}
                    placeholder="Waktu, tempat, atau catatan pembinaan..."
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-slate-900 placeholder:text-slate-400"
                  />
                </div>
              </div>

              {/* 4. STATUS TAKZIR & PETUGAS */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Status Takzir</label>
                  <select
                    value={formStatusTakzir}
                    onChange={(e) => setFormStatusTakzir(e.target.value as StatusTakzir)}
                    className="w-full px-3 py-2.5 bg-white border border-slate-300 rounded-xl font-semibold text-slate-900"
                  >
                    <option value="belum_selesai">Belum Selesai (Masih Berjalan)</option>
                    <option value="selesai">Sudah Selesai / Tuntas</option>
                  </select>
                </div>

                <div className="relative">
                  <label className="font-bold text-slate-700 block mb-1">
                    Petugas Sie Keamanan
                  </label>
                  <div className="relative">
                    <UserCheck className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="text"
                      placeholder="Ketik nama pengurus keamanan..."
                      value={formPetugasText}
                      onFocus={() => setPetugasDropdownOpen(true)}
                      onBlur={() => setTimeout(() => setPetugasDropdownOpen(false), 160)}
                      onChange={(e) => {
                        setFormPetugasText(e.target.value);
                        setPetugasDropdownOpen(true);
                      }}
                      className="w-full pl-9 pr-8 py-2.5 bg-white border border-slate-300 rounded-xl font-semibold text-slate-900 placeholder:text-slate-400 placeholder:font-normal"
                    />
                    {petugasDropdownOpen && selectablePengurus.length > 0 && (
                      <div className="absolute left-0 right-0 top-full mt-1.5 z-30 bg-white border border-slate-200 rounded-xl shadow-xl max-h-44 overflow-y-auto divide-y divide-slate-100">
                        {selectablePengurus.map((p) => (
                          <button
                            key={p.id}
                            type="button"
                            onMouseDown={(e) => {
                              e.preventDefault();
                              setFormPetugasText(p.nama_lengkap);
                              setPetugasDropdownOpen(false);
                            }}
                            className="w-full px-3.5 py-2 text-left hover:bg-emerald-50 font-semibold text-slate-800"
                          >
                            {p.nama_lengkap}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {!editingPelanggaran && (
                <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                  <label className="flex items-center gap-2 font-bold text-slate-800 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formIncludeSita}
                      onChange={(e) => setFormIncludeSita(e.target.checked)}
                      className="w-4 h-4 accent-emerald-700"
                    />
                    Sekaligus Catat Barang Sitaan (misal HP / Rokok / Elektronik)
                  </label>

                  {formIncludeSita && (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
                      <div>
                        <label className="text-[11px] font-bold text-slate-700 block mb-1">
                          Nama / Merk Barang
                        </label>
                        <input
                          type="text"
                          value={formSitaNama}
                          onChange={(e) => setFormSitaNama(e.target.value)}
                          placeholder="Contoh: HP Samsung A14"
                          className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-slate-900"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] font-bold text-slate-700 block mb-1">
                          Kategori Barang
                        </label>
                        <select
                          value={formSitaKategori}
                          onChange={(e) => setFormSitaKategori(e.target.value as KategoriBarang)}
                          className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-slate-900"
                        >
                          {KATEGORI_BARANG_LIST.map((kat) => (
                            <option key={kat} value={kat}>
                              {kat}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="text-[11px] font-bold text-slate-700 block mb-1">
                          Lokasi Simpan
                        </label>
                        <input
                          type="text"
                          value={formSitaLokasi}
                          onChange={(e) => setFormSitaLokasi(e.target.value)}
                          className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-slate-900"
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowPelanggaranModal(false)}
                  className="min-h-[40px] px-4 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-xl font-bold"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="min-h-[40px] px-5 py-2 bg-emerald-800 hover:bg-emerald-900 text-white rounded-xl font-bold"
                >
                  {saving ? 'Menyimpan...' : editingPelanggaran ? 'Simpan Perubahan' : 'Simpan Pelanggaran'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* MODAL CATAT / EDIT SITA BARANG                                    */}
      {/* ================================================================= */}
      {showSitaModal && (
        <div className="print:hidden fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-xl max-h-[92vh] flex flex-col overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <h2 className="text-sm sm:text-base font-extrabold text-slate-900">
                {editingSita ? 'Edit Data Barang Sitaan' : 'Catat Penyitaan Barang Santri'}
              </h2>
              <button
                type="button"
                onClick={() => setShowSitaModal(false)}
                className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveSita} className="p-5 space-y-4 overflow-y-auto text-xs">
              <div className="space-y-1.5">
                <label className="font-bold text-slate-700 block">Santri Pemilik Barang</label>
                {selectedSitaSantri ? (
                  <div className="flex items-center justify-between gap-3 px-3.5 py-2.5 bg-emerald-50 border border-emerald-700 rounded-xl">
                    <div className="min-w-0">
                      <div className="font-bold text-emerald-950 truncate">
                        {selectedSitaSantri.nama_lengkap}
                      </div>
                      <div className="text-[11px] text-emerald-800 tabular-nums">
                        Kamar {selectedSitaSantri.kamar} &middot; NIS {selectedSitaSantri.nis}
                      </div>
                    </div>
                    {!editingSita && (
                      <button
                        type="button"
                        onClick={() => {
                          setSitaFormSantriId('');
                          setSitaSantriSearch('');
                          setSitaSantriDropdownOpen(true);
                        }}
                        className="px-2.5 py-1 bg-white border border-emerald-300 rounded-lg font-semibold text-[11px]"
                      >
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
                      value={sitaSantriSearch}
                      onFocus={() => setSitaSantriDropdownOpen(true)}
                      onBlur={() => setTimeout(() => setSitaSantriDropdownOpen(false), 160)}
                      onChange={(e) => {
                        setSitaSantriSearch(e.target.value);
                        setSitaSantriDropdownOpen(true);
                      }}
                      className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-300 rounded-xl text-slate-900"
                    />
                    {sitaSantriDropdownOpen && (
                      <div className="absolute left-0 right-0 top-full mt-1.5 z-30 bg-white border border-slate-200 rounded-xl shadow-xl max-h-52 overflow-y-auto divide-y divide-slate-100">
                        {selectableSitaSantri.slice(0, 60).map((s) => (
                          <button
                            key={s.id}
                            type="button"
                            onMouseDown={(e) => {
                              e.preventDefault();
                              setSitaFormSantriId(s.id);
                              setSitaSantriSearch(s.nama_lengkap);
                              setSitaSantriDropdownOpen(false);
                            }}
                            className="w-full px-3.5 py-2.5 text-left hover:bg-emerald-50 flex items-center justify-between gap-2"
                          >
                            <span className="font-semibold text-slate-900">{s.nama_lengkap}</span>
                            <span className="text-[11px] text-slate-500">
                              Kamar {s.kamar} · {s.nis}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <label className="font-bold text-slate-700 block mb-1">Nama / Merk Barang</label>
                  <input
                    type="text"
                    required
                    value={sitaFormNama}
                    onChange={(e) => setSitaFormNama(e.target.value)}
                    placeholder="Contoh: HP Oppo A57 warna hitam"
                    className="w-full px-3 py-2.5 bg-white border border-slate-300 rounded-xl text-slate-900"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Jumlah</label>
                  <input
                    type="number"
                    min={1}
                    required
                    value={sitaFormJumlah}
                    onChange={(e) => setSitaFormJumlah(e.target.value)}
                    className="w-full px-3 py-2.5 bg-white border border-slate-300 rounded-xl text-slate-900 tabular-nums"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Kategori Barang</label>
                  <select
                    value={sitaFormKategori}
                    onChange={(e) => setSitaFormKategori(e.target.value)}
                    className="w-full px-3 py-2.5 bg-white border border-slate-300 rounded-xl text-slate-900 font-semibold"
                  >
                    {KATEGORI_BARANG_LIST.map((kat) => (
                      <option key={kat} value={kat}>
                        {kat}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Tanggal Sita</label>
                  <input
                    type="date"
                    required
                    value={sitaFormTanggal}
                    onChange={(e) => setSitaFormTanggal(e.target.value)}
                    className="w-full px-3 py-2.5 bg-white border border-slate-300 rounded-xl text-slate-900"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Lokasi Penyimpanan</label>
                  <input
                    type="text"
                    value={sitaFormLokasi}
                    onChange={(e) => setSitaFormLokasi(e.target.value)}
                    className="w-full px-3 py-2.5 bg-white border border-slate-300 rounded-xl text-slate-900"
                  />
                </div>
                <div className="relative">
                  <label className="font-bold text-slate-700 block mb-1">Petugas Penyita</label>
                  <input
                    type="text"
                    value={sitaFormPetugasText}
                    placeholder="Ketik nama pengurus..."
                    onFocus={() => setSitaPetugasDropdownOpen(true)}
                    onBlur={() => setTimeout(() => setSitaPetugasDropdownOpen(false), 160)}
                    onChange={(e) => {
                      setSitaFormPetugasText(e.target.value);
                      setSitaPetugasDropdownOpen(true);
                    }}
                    className="w-full px-3 py-2.5 bg-white border border-slate-300 rounded-xl text-slate-900"
                  />
                  {sitaPetugasDropdownOpen && selectableSitaPengurus.length > 0 && (
                    <div className="absolute left-0 right-0 top-full mt-1 z-30 bg-white border border-slate-200 rounded-xl shadow-xl max-h-40 overflow-y-auto divide-y divide-slate-100">
                      {selectableSitaPengurus.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            setSitaFormPetugasText(p.nama_lengkap);
                            setSitaPetugasDropdownOpen(false);
                          }}
                          className="w-full px-3 py-2 text-left hover:bg-emerald-50 font-semibold text-slate-800"
                        >
                          {p.nama_lengkap}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Catatan Tambahan</label>
                <textarea
                  rows={2}
                  value={sitaFormCatatan}
                  onChange={(e) => setSitaFormCatatan(e.target.value)}
                  placeholder="Kondisi barang atau keterangan razia..."
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-slate-900"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowSitaModal(false)}
                  className="min-h-[40px] px-4 py-2 bg-white border border-slate-300 text-slate-700 rounded-xl font-bold"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="min-h-[40px] px-5 py-2 bg-emerald-800 hover:bg-emerald-900 text-white rounded-xl font-bold"
                >
                  {saving ? 'Menyimpan...' : 'Simpan Barang Sitaan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* MODAL PENGEMBALIAN / PEMUSNAHAN BARANG SITAAN                     */}
      {/* ================================================================= */}
      {returnTarget && (
        <div className="print:hidden fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-md overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <h2 className="text-sm font-extrabold text-slate-900">
                Penyelesaian Barang Sitaan
              </h2>
              <button
                type="button"
                onClick={() => setReturnTarget(null)}
                className="p-1 text-slate-500 hover:bg-slate-200 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleConfirmReturnSita} className="p-5 space-y-3.5 text-xs">
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                <div className="font-bold text-slate-900">{returnTarget.nama_barang}</div>
                <div className="text-[11px] text-slate-600">
                  Milik {returnTarget.santri?.nama_lengkap || 'Santri'} (Kamar{' '}
                  {returnTarget.santri?.kamar || '-'})
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Tindakan Akhir</label>
                <select
                  value={returnStatus}
                  onChange={(e) =>
                    setReturnStatus(e.target.value as 'dikembalikan' | 'dimusnahkan')
                  }
                  className="w-full px-3 py-2.5 bg-white border border-slate-300 rounded-xl font-semibold text-slate-900"
                >
                  <option value="dikembalikan">Dikembalikan ke Orang Tua / Wali</option>
                  <option value="dimusnahkan">Dimusnahkan Sesuai Tata Tertib</option>
                </select>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Tanggal Proses</label>
                <input
                  type="date"
                  required
                  value={returnTanggal}
                  onChange={(e) => setReturnTanggal(e.target.value)}
                  className="w-full px-3 py-2.5 bg-white border border-slate-300 rounded-xl text-slate-900"
                />
              </div>

              {returnStatus === 'dikembalikan' && (
                <div>
                  <label className="font-bold text-slate-700 block mb-1">
                    Nama Penerima (Wali Santri)
                  </label>
                  <input
                    type="text"
                    required
                    value={returnPenerima}
                    onChange={(e) => setReturnPenerima(e.target.value)}
                    className="w-full px-3 py-2.5 bg-white border border-slate-300 rounded-xl text-slate-900"
                  />
                </div>
              )}

              <div>
                <label className="font-bold text-slate-700 block mb-1">Catatan Berita Acara</label>
                <textarea
                  rows={2}
                  value={returnCatatan}
                  onChange={(e) => setReturnCatatan(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-slate-900"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setReturnTarget(null)}
                  className="min-h-[40px] px-4 py-2 border border-slate-300 rounded-xl font-bold text-slate-700"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="min-h-[40px] px-4 py-2 bg-emerald-800 hover:bg-emerald-900 text-white rounded-xl font-bold"
                >
                  {saving ? 'Memproses...' : 'Simpan Status'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* MODAL MASTER KATEGORI & POIN                                      */}
      {/* ================================================================= */}
      {showMasterModal && (
        <div className="print:hidden fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-md overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <h2 className="text-sm font-extrabold text-slate-900">
                {editingMaster ? 'Edit Aturan Poin Pelanggaran' : 'Tambah Aturan Poin Pelanggaran'}
              </h2>
              <button
                type="button"
                onClick={() => setShowMasterModal(false)}
                className="p-1 text-slate-500 hover:bg-slate-200 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleSaveMaster} className="p-5 space-y-3.5 text-xs">
              <div>
                <label className="font-bold text-slate-700 block mb-1">Nama Pelanggaran</label>
                <input
                  type="text"
                  required
                  value={masterNama}
                  onChange={(e) => setMasterNama(e.target.value)}
                  className="w-full px-3 py-2.5 bg-white border border-slate-300 rounded-xl text-slate-900 font-semibold"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Tingkat</label>
                  <select
                    value={masterTingkat}
                    onChange={(e) => setMasterTingkat(e.target.value as TingkatPelanggaran)}
                    className="w-full px-3 py-2.5 bg-white border border-slate-300 rounded-xl text-slate-900 font-semibold"
                  >
                    <option value="ringan">Ringan</option>
                    <option value="sedang">Sedang</option>
                    <option value="berat">Berat</option>
                  </select>
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Poin Otomatis</label>
                  <input
                    type="number"
                    min={1}
                    required
                    value={masterPoin}
                    onChange={(e) => setMasterPoin(e.target.value)}
                    className="w-full px-3 py-2.5 bg-white border border-slate-300 rounded-xl text-slate-900 font-bold tabular-nums"
                  />
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Saran Takzir Bawaan</label>
                <textarea
                  rows={2}
                  value={masterTakzir}
                  onChange={(e) => setMasterTakzir(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-slate-900"
                />
              </div>

              <label className="flex items-center gap-2 font-semibold text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={masterAktif}
                  onChange={(e) => setMasterAktif(e.target.checked)}
                  className="w-4 h-4 accent-emerald-700"
                />
                Aturan aktif saat pencatatan pelanggaran
              </label>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowMasterModal(false)}
                  className="min-h-[40px] px-4 py-2 border border-slate-300 rounded-xl font-bold text-slate-700"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="min-h-[40px] px-4 py-2 bg-emerald-800 hover:bg-emerald-900 text-white rounded-xl font-bold"
                >
                  Simpan Aturan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* MODAL PRATINJAU CETAK SURAT (SP / BA / SITA)                      */}
      {/* ================================================================= */}
      {printDoc && (
        <div className="print:hidden fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-5 space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div className="flex items-center gap-2 font-extrabold text-sm text-slate-900">
                <FileText className="w-4 h-4 text-emerald-700" />
                Pratinjau Cetak Dokumen Keamanan (A4)
              </div>
              <button
                type="button"
                onClick={() => setPrintDoc(null)}
                className="p-1 text-slate-500 hover:bg-slate-100 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {printDoc.type === 'surat_peringatan' && (
              <div className="space-y-3">
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                  <div className="font-bold text-slate-900">
                    Surat Peringatan ke-{printDoc.spTarget} (SP-{printDoc.spTarget})
                  </div>
                  <div className="text-slate-600">
                    Santri: <strong>{printDoc.summary.santri.nama_lengkap}</strong> (Kamar{' '}
                    {printDoc.summary.santri.kamar})
                  </div>
                  <div className="text-slate-600">
                    Akumulasi Poin: <strong className="text-rose-700">{printDoc.summary.totalPoin} poin</strong>
                  </div>
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">
                    Pilih Tingkat SP yang Dicetak
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {([1, 2, 3] as const).map((lv) => (
                      <button
                        key={lv}
                        type="button"
                        onClick={() =>
                          setPrintDoc({
                            ...printDoc,
                            spTarget: lv,
                            nomorSurat: `SP-${lv}/KEAM/${(todayStr || getLocalTodayStr()).replace(/-/g, '')}/${printDoc.summary.santri.nis}`,
                          })
                        }
                        className={`min-h-[38px] rounded-xl border font-bold ${
                          printDoc.spTarget === lv
                            ? 'bg-rose-700 text-white border-rose-700'
                            : 'bg-white text-slate-700 border-slate-300'
                        }`}
                      >
                        SP-{lv}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {printDoc.type === 'ba_pelanggaran' && (
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                <div className="font-bold text-slate-900">
                  Berita Acara Pelanggaran &amp; Takzir
                </div>
                <div className="text-slate-600">
                  Santri: <strong>{printDoc.item.santri?.nama_lengkap}</strong> &middot;{' '}
                  {printDoc.item.nama_pelanggaran} (+{printDoc.item.poin} poin)
                </div>
              </div>
            )}

            {printDoc.type === 'tanda_terima_sita' && (
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                <div className="font-bold text-slate-900">
                  Berita Acara &amp; Tanda Terima Sita Barang
                </div>
                <div className="text-slate-600">
                  {printDoc.item.nama_barang} ({printDoc.item.jumlah} unit) &middot;{' '}
                  {printDoc.item.santri?.nama_lengkap}
                </div>
              </div>
            )}

            <p className="text-[11px] text-slate-500">
              Dokumen dicetak dengan kop resmi {pengaturan.nama_pesantren}, stempel pondok, dan
              tanda tangan berwenang.
            </p>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setPrintDoc(null)}
                className="min-h-[40px] px-4 py-2 border border-slate-300 rounded-xl font-bold text-slate-700"
              >
                Tutup
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                className="min-h-[40px] px-5 py-2 bg-emerald-800 hover:bg-emerald-900 text-white rounded-xl font-bold flex items-center gap-1.5"
              >
                <Printer className="w-4 h-4" />
                Cetak / Simpan PDF
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* MODAL KONFIRMASI HAPUS                                            */}
      {/* ================================================================= */}
      {deleteTarget && (
        <div className="print:hidden fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-sm p-5 space-y-4 text-xs">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-6 h-6 text-rose-600 shrink-0" />
              <div>
                <h3 className="font-extrabold text-sm text-slate-900">Konfirmasi Hapus Data</h3>
                <p className="text-slate-600 mt-1">
                  Data yang dihapus tidak dapat dikembalikan. Pastikan Anda yakin ingin menghapus catatan ini.
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="min-h-[40px] px-4 py-2 border border-slate-300 rounded-xl font-bold text-slate-700"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={handleConfirmDelete}
                className="min-h-[40px] px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-bold"
              >
                {deleting ? 'Menghapus...' : 'Ya, Hapus'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* MODAL SQL MIGRASI TABEL KEAMANAN SUPABASE                         */}
      {/* ================================================================= */}
      {showSqlModal && (
        <div className="print:hidden fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-xl max-h-[88vh] flex flex-col overflow-hidden text-xs">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <h3 className="font-extrabold text-sm text-slate-900">
                Skrip SQL Tabel Keamanan (Supabase)
              </h3>
              <button
                type="button"
                onClick={() => setShowSqlModal(false)}
                className="p-1 text-slate-500 hover:bg-slate-200 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 overflow-y-auto space-y-3">
              <p className="text-slate-600">
                Jalankan skrip berikut di Supabase SQL Editor untuk mengaktifkan penyimpanan cloud
                penuh untuk modul Keamanan &amp; Poin:
              </p>
              <pre className="p-3 bg-slate-900 text-emerald-200 rounded-xl text-[11px] font-mono overflow-x-auto">
                {KEAMANAN_TABLES_SQL}
              </pre>
            </div>
            <div className="px-5 py-3 border-t border-slate-200 flex justify-end gap-2 bg-slate-50">
              <button
                type="button"
                onClick={() => setShowSqlModal(false)}
                className="min-h-[38px] px-4 py-1.5 border border-slate-300 rounded-xl font-bold text-slate-700 bg-white"
              >
                Tutup
              </button>
              <button
                type="button"
                onClick={() => handleCopyText(KEAMANAN_TABLES_SQL, 'Skrip SQL Keamanan')}
                className="min-h-[38px] px-4 py-1.5 bg-emerald-800 hover:bg-emerald-900 text-white rounded-xl font-bold flex items-center gap-1.5"
              >
                <Copy className="w-3.5 h-3.5" />
                Salin SQL
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
