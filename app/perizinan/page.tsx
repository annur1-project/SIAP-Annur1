'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth, TransparencyBanner } from '@/lib/auth';
import * as XLSX from 'xlsx';
import {
  FileText,
  Plus,
  Search,
  Printer,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Clock,
  RefreshCw,
  X,
  MessageCircle,
  Copy,
  Info,
  Trash2,
  UserCheck,
  Calendar,
  ArrowRightLeft,
} from 'lucide-react';

type JenisIzin = 'tidak_menginap' | 'menginap';
type StatusIzinDb = 'disetujui' | 'kembali' | 'terlambat';
type StatusDenda = 'tidak_ada' | 'belum_bayar' | 'lunas' | 'dibebaskan';
type ActiveTab = 'daftar' | 'rekap';
type FilterStatus = 'semua' | 'sedang_pulang' | 'terlambat' | 'kembali';

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

interface IzinMeta {
  k: string; // Kategori alasan resmi Pedoman
  b: string; // Batas jam kembali untuk tidak_menginap (default '17:00')
  p: string; // Nama orang tua / wali penjemput
  w: string; // No WA penjemput
  d: boolean; // Sudah ada surat keterangan dokter
  jk: string; // Jam kembali aktual (HH:MM)
  dn: number; // Nominal denda keterlambatan (0 | 20000)
  ds: StatusDenda; // Status denda
  pt: string; // Nama petugas keamanan/pengurus
  ns: string; // Nomor surat izin
}

interface IzinRecordRaw {
  id: string;
  santri_id: string;
  jenis_izin: JenisIzin;
  infaq_nominal: number;
  tgl_pulang: string;
  tgl_rencana_kembali: string;
  tgl_aktual_kembali: string | null;
  alasan: string | null;
  status: StatusIzinDb;
  petugas_id: string | null;
  created_at?: string;
}

interface IzinViewItem extends IzinRecordRaw {
  santri?: SantriRow;
  petugasNama: string;
  meta: IzinMeta;
  alasanTeks: string;
  isOverdueNow: boolean;
  overdueLabel: string;
}

interface ToastState {
  id: number;
  type: 'success' | 'error' | 'info';
  title: string;
  message: string;
}

const META_PREFIX = '[IZIN_META:';
const META_SUFFIX = ']';

const KATEGORI_ALASAN_PEDOMAN = [
  'Sakit (Sudah Diperiksa Pondok)',
  'Keluarga Meninggal',
  'Pernikahan Saudara Kandung (Sertakan Undangan)',
  'Keperluan Amat Penting',
] as const;

const MASTER_KAMAR_ORDER = [
  'A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7', 'A8', 'A9', 'A10',
  'C1', 'C2', 'C3', 'C4', 'C5', 'C6',
  'Al-Fachriyah 1 (VIP)',
  'Al-Fachriyah 2 (VIP)',
  'Al-Fachriyah 3 (VIP)',
  'Al-Fachriyah 4 (VIP)',
  'NDALEM',
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

function getLocalTimeHm(): string {
  const d = new Date();
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

function addDaysToIso(isoDate: string, deltaDays: number): string {
  const parts = isoDate.split('-').map((v) => parseInt(v, 10));
  if (parts.length !== 3 || parts.some(Number.isNaN)) return isoDate;
  const d = new Date(parts[0], parts[1] - 1, parts[2]);
  d.setDate(d.getDate() + deltaDays);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function diffDaysIso(startIso: string, endIso: string): number {
  const sParts = startIso.split('-').map((v) => parseInt(v, 10));
  const eParts = endIso.split('-').map((v) => parseInt(v, 10));
  if (sParts.length !== 3 || eParts.length !== 3) return 0;
  const sDate = new Date(sParts[0], sParts[1] - 1, sParts[2]);
  const eDate = new Date(eParts[0], eParts[1] - 1, eParts[2]);
  return Math.round((eDate.getTime() - sDate.getTime()) / (1000 * 60 * 60 * 24));
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

function createDefaultMeta(): IzinMeta {
  return {
    k: KATEGORI_ALASAN_PEDOMAN[3],
    b: '17:00',
    p: '',
    w: '',
    d: false,
    jk: '',
    dn: 0,
    ds: 'tidak_ada',
    pt: '',
    ns: '',
  };
}

function parseIzinAlasan(raw?: string | null): { meta: IzinMeta; alasanTeks: string } {
  const val = (raw || '').trim();
  const baseMeta = createDefaultMeta();
  if (!val.startsWith(META_PREFIX)) {
    return { meta: baseMeta, alasanTeks: val };
  }
  const endIdx = val.indexOf('}' + META_SUFFIX);
  if (endIdx < 0) {
    return { meta: baseMeta, alasanTeks: val };
  }
  const jsonPart = val.slice(META_PREFIX.length, endIdx + 1);
  const textPart = val.slice(endIdx + 2).trim();
  try {
    const parsed = JSON.parse(jsonPart) as Partial<IzinMeta>;
    return {
      meta: {
        ...baseMeta,
        ...parsed,
        b: parsed.b || '17:00',
        dn: Number(parsed.dn || 0),
        d: Boolean(parsed.d),
      },
      alasanTeks: textPart,
    };
  } catch {
    return { meta: baseMeta, alasanTeks: val };
  }
}

function encodeIzinAlasan(meta: IzinMeta, alasanTeks: string): string {
  const cleanText = alasanTeks.trim();
  const json = JSON.stringify(meta);
  return cleanText ? `${META_PREFIX}${json}${META_SUFFIX} ${cleanText}` : `${META_PREFIX}${json}${META_SUFFIX}`;
}

function extractSupabaseError(err: unknown, fallback: string): string {
  if (err instanceof Error) return err.message || fallback;
  if (err && typeof err === 'object' && 'message' in err) {
    const msg = (err as { message?: unknown }).message;
    if (typeof msg === 'string' && msg) return msg;
  }
  return fallback;
}

function computeOverdueInfo(
  row: IzinRecordRaw,
  meta: IzinMeta,
  todayStr: string,
  currentHm: string
): { isOverdueNow: boolean; overdueLabel: string } {
  if (!todayStr) return { isOverdueNow: false, overdueLabel: '' };
  const batasJam = meta.b || '17:00';

  if (row.status === 'terlambat') {
    const endRef = row.tgl_aktual_kembali || todayStr;
    const daysLate = Math.max(0, diffDaysIso(row.tgl_rencana_kembali, endRef));
    if (daysLate > 0) {
      return { isOverdueNow: true, overdueLabel: `Terlambat ${daysLate} hari` };
    }
    if (row.jenis_izin === 'tidak_menginap' && meta.jk && meta.jk > batasJam) {
      return { isOverdueNow: true, overdueLabel: `Kembali pukul ${meta.jk} (batas ${batasJam})` };
    }
    return { isOverdueNow: true, overdueLabel: 'Kembali terlambat' };
  }

  if (row.status === 'kembali') {
    return { isOverdueNow: false, overdueLabel: '' };
  }

  // status === 'disetujui' (Sedang Pulang)
  const daysOver = diffDaysIso(row.tgl_rencana_kembali, todayStr);
  if (daysOver > 0) {
    return { isOverdueNow: true, overdueLabel: `Lewat ${daysOver} hari` };
  }
  if (
    row.jenis_izin === 'tidak_menginap' &&
    daysOver === 0 &&
    currentHm &&
    currentHm > batasJam
  ) {
    return { isOverdueNow: true, overdueLabel: `Lewat batas pukul ${batasJam} WIB` };
  }
  return { isOverdueNow: false, overdueLabel: '' };
}

export default function PerizinanPage() {
  const { canEditModule, pengurus } = useAuth();
  const canEdit = canEditModule('perizinan');

  const [activeTab, setActiveTab] = useState<ActiveTab>('daftar');
  const [todayStr, setTodayStr] = useState<string>('');
  const [currentHm, setCurrentHm] = useState<string>('');

  const [santriList, setSantriList] = useState<SantriRow[]>([]);
  const [pengurusList, setPengurusList] = useState<PengurusRow[]>([]);
  const [izinList, setIzinList] = useState<IzinRecordRaw[]>([]);
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

  // Filter Daftar & Rekap
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [filterKamar, setFilterKamar] = useState<string>('SEMUA');
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('semua');
  const [filterJenis, setFilterJenis] = useState<'semua' | JenisIzin>('semua');
  const [rekapStartDate, setRekapStartDate] = useState<string>('');
  const [rekapEndDate, setRekapEndDate] = useState<string>('');

  // Modal Buat Izin Baru
  const queryHandledRef = useRef<boolean>(false);
  const [showCreateModal, setShowCreateModal] = useState<boolean>(false);
  const [santriSearch, setSantriSearch] = useState<string>('');
  const [santriDropdownOpen, setSantriDropdownOpen] = useState<boolean>(false);
  const [formSantriId, setFormSantriId] = useState<string>('');
  const [formJenis, setFormJenis] = useState<JenisIzin>('tidak_menginap');
  const [formKategori, setFormKategori] = useState<string>(KATEGORI_ALASAN_PEDOMAN[3]);
  const [formAlasanDetail, setFormAlasanDetail] = useState<string>('');
  const [formTglPulang, setFormTglPulang] = useState<string>('');
  const [formTglRencanaKembali, setFormTglRencanaKembali] = useState<string>('');
  const [formBatasJam, setFormBatasJam] = useState<string>('17:00');
  const [formPenjemput, setFormPenjemput] = useState<string>('');
  const [formWaPenjemput, setFormWaPenjemput] = useState<string>('');
  const [formSuratDokter, setFormSuratDokter] = useState<boolean>(false);
  const [formPetugasId, setFormPetugasId] = useState<string>('');
  const [formPetugasText, setFormPetugasText] = useState<string>('');
  const [petugasDropdownOpen, setPetugasDropdownOpen] = useState<boolean>(false);

  // Modal Konfirmasi Kembali & Penanganan Terlambat / Denda
  const [returnTarget, setReturnTarget] = useState<IzinViewItem | null>(null);
  const [returnTglAktual, setReturnTglAktual] = useState<string>('');
  const [returnJamAktual, setReturnJamAktual] = useState<string>('');
  const [returnForceTerlambat, setReturnForceTerlambat] = useState<boolean>(false);
  const [returnDendaStatus, setReturnDendaStatus] = useState<StatusDenda>('belum_bayar');

  // Modal Pratinjau Cetak Surat Izin & Hapus
  const [printTarget, setPrintTarget] = useState<IzinViewItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<IzinViewItem | null>(null);
  const [deleting, setDeleting] = useState<boolean>(false);

  const showToast = useCallback((type: ToastState['type'], title: string, message: string) => {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    setToasts((prev) => [...prev, { id, type, title, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((item) => item.id !== id));
    }, 4500);
  }, []);

  // Inisialisasi tanggal & jam secara asinkron agar kompatibel dengan Next.js cacheComponents
  useEffect(() => {
    let active = true;
    const syncClock = () => {
      if (!active) return;
      const t = getLocalTodayStr();
      const hm = getLocalTimeHm();
      setTodayStr(t);
      setCurrentHm(hm);
      setRekapStartDate((prev) => prev || `${t.slice(0, 7)}-01`);
      setRekapEndDate((prev) => prev || t);
    };
    Promise.resolve().then(syncClock);
    const timer = setInterval(syncClock, 60000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

  const fetchAllData = useCallback(async () => {
    const [santriRes, pengurusRes, izinRes, pengaturanRes] = await Promise.all([
      supabase
        .from('santri')
        .select(
          'id, nis, nama_lengkap, kamar, status, nama_ayah, no_wa_ayah, nama_ibu, no_wa_ibu, nama_wali, no_wa_wali'
        )
        .in('status', ['aktif', 'ndalem', 'beasiswa_lazis']),
      supabase.from('pengurus').select('id, nama_lengkap, status').eq('status', 'aktif'),
      supabase.from('izin_pulang').select('*').order('created_at', { ascending: false }),
      supabase.from('pengaturan_aplikasi').select('*').limit(1).maybeSingle(),
    ]);

    if (santriRes.error) throw santriRes.error;
    if (izinRes.error) throw izinRes.error;

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

    return {
      santri: sortedSantri,
      pengurus: sortedPengurus,
      izin: (izinRes.data || []) as IzinRecordRaw[],
      pengaturan: (pengaturanRes.data || null) as Partial<PengaturanRow> | null,
    };
  }, []);

  const handleReload = async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const res = await fetchAllData();
      setSantriList(res.santri);
      setPengurusList(res.pengurus);
      setIzinList(res.izin);
      if (res.pengaturan) {
        setPengaturan((prev) => ({ ...prev, ...res.pengaturan }));
      }
    } catch (err: unknown) {
      const msg = extractSupabaseError(err, 'Gagal memuat data perizinan pulang.');
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
        if (res.pengaturan) {
          setPengaturan((prev) => ({ ...prev, ...res.pengaturan }));
        }

        if (!queryHandledRef.current && typeof window !== 'undefined') {
          const params = new URLSearchParams(window.location.search);
          const santriIdParam = params.get('santri_id');
          const kategoriParam = params.get('kategori');
          if (!santriIdParam) {
            queryHandledRef.current = true;
          } else {
            const matchedSantri = res.santri.find((item) => item.id === santriIdParam);
            if (matchedSantri) {
              queryHandledRef.current = true;
              const baseDate = getLocalTodayStr();
              const wali = getDefaultWali(matchedSantri);

              setSantriSearch(matchedSantri.nama_lengkap);
              setSantriDropdownOpen(false);
              setFormSantriId(matchedSantri.id);
              setFormJenis('tidak_menginap');
              setFormTglPulang(baseDate);
              setFormTglRencanaKembali(baseDate);
              setFormBatasJam('17:00');
              setFormPenjemput(wali.nama);
              setFormWaPenjemput(wali.wa);
              setFormPetugasId('');
              setFormPetugasText('');
              setPetugasDropdownOpen(false);

              if (kategoriParam === 'sakit') {
                setFormKategori(KATEGORI_ALASAN_PEDOMAN[0]);
                setFormSuratDokter(true);
                setFormAlasanDetail('Izin pulang sakit setelah pemeriksaan Poskestren');
              } else {
                setFormKategori(KATEGORI_ALASAN_PEDOMAN[3]);
                setFormSuratDokter(false);
                setFormAlasanDetail('');
              }

              setShowCreateModal(true);
              window.history.replaceState({}, '', '/perizinan');
            }
          }
        }
      })
      .catch((err: unknown) => {
        if (!active) return;
        setFetchError(extractSupabaseError(err, 'Gagal memuat data perizinan pulang.'));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [fetchAllData]);

  const viewItems = useMemo<IzinViewItem[]>(() => {
    const santriMap = new Map(santriList.map((s) => [s.id, s]));
    const pengurusMap = new Map(pengurusList.map((p) => [p.id, p]));
    return izinList.map((row) => {
      const { meta, alasanTeks } = parseIzinAlasan(row.alasan);
      const { isOverdueNow, overdueLabel } = computeOverdueInfo(row, meta, todayStr, currentHm);
      const petugas = row.petugas_id ? pengurusMap.get(row.petugas_id) : undefined;
      return {
        ...row,
        santri: santriMap.get(row.santri_id),
        petugasNama: petugas?.nama_lengkap || meta.pt || 'Keamanan Pondok',
        meta,
        alasanTeks,
        isOverdueNow,
        overdueLabel,
      };
    });
  }, [izinList, santriList, pengurusList, todayStr, currentHm]);

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
    let sedangPulang = 0;
    let terlambat = 0;
    let sudahKembali = 0;
    let totalInfaq = 0;
    let totalDendaLunas = 0;
    let totalDendaBelumBayar = 0;

    for (const item of viewItems) {
      totalInfaq += Number(item.infaq_nominal || 0);
      if (item.meta.ds === 'lunas') totalDendaLunas += Number(item.meta.dn || 0);
      if (item.meta.ds === 'belum_bayar') totalDendaBelumBayar += Number(item.meta.dn || 0);

      if (item.status === 'disetujui') {
        sedangPulang += 1;
        if (item.isOverdueNow) terlambat += 1;
      } else {
        sudahKembali += 1;
        if (item.status === 'terlambat') terlambat += 1;
      }
    }

    return {
      sedangPulang,
      terlambat,
      sudahKembali,
      totalInfaq,
      totalDendaLunas,
      totalDendaBelumBayar,
      totalPenerimaan: totalInfaq + totalDendaLunas,
    };
  }, [viewItems]);

  const filteredItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return viewItems.filter((item) => {
      const kamar = item.santri?.kamar || '';
      const nama = item.santri?.nama_lengkap || '';
      const nis = item.santri?.nis || '';
      const penjemput = item.meta.p || '';

      const matchKamar = filterKamar === 'SEMUA' || kamar === filterKamar;
      const matchJenis = filterJenis === 'semua' || item.jenis_izin === filterJenis;
      const matchSearch =
        !q ||
        nama.toLowerCase().includes(q) ||
        String(nis).toLowerCase().includes(q) ||
        penjemput.toLowerCase().includes(q) ||
        item.alasanTeks.toLowerCase().includes(q);

      let matchStatus = true;
      if (filterStatus === 'sedang_pulang') matchStatus = item.status === 'disetujui';
      else if (filterStatus === 'terlambat')
        matchStatus = item.status === 'terlambat' || (item.status === 'disetujui' && item.isOverdueNow);
      else if (filterStatus === 'kembali')
        matchStatus = item.status === 'kembali' || item.status === 'terlambat';

      return matchKamar && matchJenis && matchSearch && matchStatus;
    });
  }, [viewItems, searchQuery, filterKamar, filterJenis, filterStatus]);

  const rekapFilteredItems = useMemo(() => {
    return filteredItems.filter((item) => {
      if (rekapStartDate && item.tgl_pulang < rekapStartDate) return false;
      if (rekapEndDate && item.tgl_pulang > rekapEndDate) return false;
      return true;
    });
  }, [filteredItems, rekapStartDate, rekapEndDate]);

  const rekapSummary = useMemo(() => {
    let tidakMenginapCount = 0;
    let menginapCount = 0;
    let infaqTotal = 0;
    let dendaLunas = 0;
    let dendaBelum = 0;
    let terlambatCount = 0;

    for (const item of rekapFilteredItems) {
      if (item.jenis_izin === 'tidak_menginap') tidakMenginapCount += 1;
      else menginapCount += 1;
      infaqTotal += Number(item.infaq_nominal || 0);
      if (item.status === 'terlambat' || (item.status === 'disetujui' && item.isOverdueNow)) {
        terlambatCount += 1;
      }
      if (item.meta.ds === 'lunas') dendaLunas += Number(item.meta.dn || 0);
      if (item.meta.ds === 'belum_bayar') dendaBelum += Number(item.meta.dn || 0);
    }

    return {
      totalIzin: rekapFilteredItems.length,
      tidakMenginapCount,
      menginapCount,
      infaqTotal,
      dendaLunas,
      dendaBelum,
      terlambatCount,
    };
  }, [rekapFilteredItems]);

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

  const openCreateModal = () => {
    if (!canEdit) return;
    const baseDate = todayStr || getLocalTodayStr();
    setSantriSearch('');
    setSantriDropdownOpen(false);
    setFormSantriId('');
    setFormJenis('tidak_menginap');
    setFormKategori(KATEGORI_ALASAN_PEDOMAN[3]);
    setFormAlasanDetail('');
    setFormTglPulang(baseDate);
    setFormTglRencanaKembali(baseDate);
    setFormBatasJam('17:00');
    setFormPenjemput('');
    setFormWaPenjemput('');
    setFormSuratDokter(false);
    setFormPetugasId(pengurus?.id || '');
    setFormPetugasText(pengurus?.nama_lengkap || '');
    setPetugasDropdownOpen(false);
    setShowCreateModal(true);
  };

  const handleSelectFormSantri = (sid: string) => {
    setFormSantriId(sid);
    setSantriDropdownOpen(false);
    const s = santriList.find((item) => item.id === sid);
    setSantriSearch(s ? s.nama_lengkap : '');
    const wali = getDefaultWali(s);
    setFormPenjemput(wali.nama);
    setFormWaPenjemput(wali.wa);
  };

  const handleChangeFormJenis = (nextJenis: JenisIzin) => {
    setFormJenis(nextJenis);
    const basePulang = formTglPulang || todayStr || getLocalTodayStr();
    if (nextJenis === 'tidak_menginap') {
      setFormTglRencanaKembali(basePulang);
      if (!formBatasJam) setFormBatasJam('17:00');
    } else {
      setFormTglRencanaKembali(addDaysToIso(basePulang, 3));
    }
  };

  const handleChangeFormTglPulang = (nextPulang: string) => {
    setFormTglPulang(nextPulang);
    if (formJenis === 'tidak_menginap') {
      setFormTglRencanaKembali(nextPulang);
    } else if (nextPulang && (!formTglRencanaKembali || formTglRencanaKembali < nextPulang)) {
      setFormTglRencanaKembali(addDaysToIso(nextPulang, 3));
    }
  };

  const formDurationDays = useMemo(() => {
    if (!formTglPulang || !formTglRencanaKembali) return 0;
    return diffDaysIso(formTglPulang, formTglRencanaKembali);
  }, [formTglPulang, formTglRencanaKembali]);

  const handleCreateIzin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit) return;
    if (!formSantriId) {
      showToast('error', 'Santri Belum Dipilih', 'Pilih santri yang mengajukan izin pulang.');
      return;
    }
    if (!formTglPulang || !formTglRencanaKembali) {
      showToast('error', 'Tanggal Wajib Diisi', 'Lengkapi tanggal pulang dan tanggal rencana kembali.');
      return;
    }
    if (formTglRencanaKembali < formTglPulang) {
      showToast(
        'error',
        'Tanggal Tidak Valid',
        'Tanggal rencana kembali tidak boleh lebih awal dari tanggal pulang.'
      );
      return;
    }
    if (!formPenjemput.trim()) {
      showToast(
        'error',
        'Wali Penjemput Wajib Diisi',
        'Sesuai Pedoman Pengurus, izin pulang harus disertai orang tua/wali penjemput.'
      );
      return;
    }

    setSaving(true);
    try {
      const infaqNominal = formJenis === 'tidak_menginap' ? 5000 : 10000;
      const monthPrefix = formTglPulang.slice(0, 7).replace('-', '/');
      const seq = String(izinList.length + 1).padStart(3, '0');
      const nomorSurat = `SIP/${monthPrefix}/${seq}`;
      const typedPetugas = formPetugasText.trim();
      const selectedPetugas =
        pengurusList.find((p) => p.id === formPetugasId) ||
        (typedPetugas
          ? pengurusList.find((p) => p.nama_lengkap.toLowerCase() === typedPetugas.toLowerCase())
          : undefined);
      const namaPetugasFinal =
        selectedPetugas?.nama_lengkap || typedPetugas || 'Keamanan Pondok';

      const meta: IzinMeta = {
        k: formKategori,
        b: formJenis === 'tidak_menginap' ? formBatasJam || '17:00' : '',
        p: formPenjemput.trim(),
        w: formWaPenjemput.trim(),
        d: formSuratDokter,
        jk: '',
        dn: 0,
        ds: 'tidak_ada',
        pt: namaPetugasFinal,
        ns: nomorSurat,
      };

      const { data: inserted, error } = await supabase
        .from('izin_pulang')
        .insert({
          santri_id: formSantriId,
          jenis_izin: formJenis,
          infaq_nominal: infaqNominal,
          tgl_pulang: formTglPulang,
          tgl_rencana_kembali: formTglRencanaKembali,
          tgl_aktual_kembali: null,
          alasan: encodeIzinAlasan(meta, formAlasanDetail),
          status: 'disetujui',
          petugas_id: selectedPetugas?.id || null,
        })
        .select()
        .single();

      if (error) throw error;

      const refreshed = await fetchAllData();
      setSantriList(refreshed.santri);
      setPengurusList(refreshed.pengurus);
      setIzinList(refreshed.izin);
      setShowCreateModal(false);

      const createdRow = inserted as IzinRecordRaw | null;
      if (createdRow) {
        const santriObj = refreshed.santri.find((s) => s.id === createdRow.santri_id);
        const parsed = parseIzinAlasan(createdRow.alasan);
        setPrintTarget({
          ...createdRow,
          santri: santriObj,
          petugasNama: selectedPetugas?.nama_lengkap || parsed.meta.pt || 'Keamanan Pondok',
          meta: parsed.meta,
          alasanTeks: parsed.alasanTeks,
          isOverdueNow: false,
          overdueLabel: '',
        });
      }

      showToast(
        'success',
        'Surat Izin Pulang Diterbitkan',
        `Izin ${formJenis === 'tidak_menginap' ? 'Tidak Menginap' : 'Menginap'} (Infaq ${formatRupiah(
          infaqNominal
        )}) tersimpan dan siap dicetak.`
      );
    } catch (err: unknown) {
      showToast(
        'error',
        'Gagal Menyimpan Izin',
        extractSupabaseError(err, 'Gagal mencatat izin pulang santri.')
      );
    } finally {
      setSaving(false);
    }
  };

  const openReturnModal = (item: IzinViewItem) => {
    if (!canEdit) return;
    const t = todayStr || getLocalTodayStr();
    const hm = currentHm || getLocalTimeHm();
    const batasJam = item.meta.b || '17:00';
    const autoLate =
      t > item.tgl_rencana_kembali ||
      (item.jenis_izin === 'tidak_menginap' && t === item.tgl_rencana_kembali && hm > batasJam);

    setReturnTarget(item);
    setReturnTglAktual(t);
    setReturnJamAktual(hm);
    setReturnForceTerlambat(autoLate);
    setReturnDendaStatus(autoLate ? 'belum_bayar' : 'tidak_ada');
  };

  const handleComputeReturnLatePreview = (tgl: string, jam: string, target: IzinViewItem) => {
    const batasJam = target.meta.b || '17:00';
    const isLate =
      tgl > target.tgl_rencana_kembali ||
      (target.jenis_izin === 'tidak_menginap' && tgl === target.tgl_rencana_kembali && jam > batasJam);
    setReturnForceTerlambat(isLate);
    setReturnDendaStatus(isLate ? 'belum_bayar' : 'tidak_ada');
  };

  const handleConfirmReturn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit || !returnTarget) return;

    setSaving(true);
    try {
      const nextStatus: StatusIzinDb = returnForceTerlambat ? 'terlambat' : 'kembali';
      const nextDendaNominal =
        returnForceTerlambat && returnDendaStatus !== 'dibebaskan' && returnDendaStatus !== 'tidak_ada'
          ? 20000
          : 0;

      const nextMeta: IzinMeta = {
        ...returnTarget.meta,
        jk: returnJamAktual || '',
        dn: nextDendaNominal,
        ds: returnForceTerlambat ? returnDendaStatus : 'tidak_ada',
      };

      const { error } = await supabase
        .from('izin_pulang')
        .update({
          status: nextStatus,
          tgl_aktual_kembali: returnTglAktual || getLocalTodayStr(),
          alasan: encodeIzinAlasan(nextMeta, returnTarget.alasanTeks),
        })
        .eq('id', returnTarget.id);

      if (error) throw error;

      const refreshed = await fetchAllData();
      setSantriList(refreshed.santri);
      setPengurusList(refreshed.pengurus);
      setIzinList(refreshed.izin);
      setReturnTarget(null);

      showToast(
        'success',
        returnForceTerlambat ? 'Kepulangan Terlambat Dicatat' : 'Santri Kembali Tepat Waktu',
        returnForceTerlambat
          ? `Status diperbarui ke Terlambat dengan opsi denda Rp 20.000 (${
              returnDendaStatus === 'lunas'
                ? 'Lunas'
                : returnDendaStatus === 'belum_bayar'
                ? 'Belum Bayar'
                : 'Dibebaskan'
            }).`
          : 'Kepulangan santri telah dikonfirmasi tepat waktu.'
      );
    } catch (err: unknown) {
      showToast(
        'error',
        'Gagal Memperbarui Kepulangan',
        extractSupabaseError(err, 'Gagal memperbarui status kepulangan.')
      );
    } finally {
      setSaving(false);
    }
  };

  const handleToggleDendaLunas = async (item: IzinViewItem) => {
    if (!canEdit) return;
    setSaving(true);
    try {
      const nextStatusDenda: StatusDenda = item.meta.ds === 'lunas' ? 'belum_bayar' : 'lunas';
      const nextMeta: IzinMeta = {
        ...item.meta,
        dn: 20000,
        ds: nextStatusDenda,
      };
      const { error } = await supabase
        .from('izin_pulang')
        .update({ alasan: encodeIzinAlasan(nextMeta, item.alasanTeks) })
        .eq('id', item.id);
      if (error) throw error;

      const refreshed = await fetchAllData();
      setIzinList(refreshed.izin);
      showToast(
        'success',
        nextStatusDenda === 'lunas' ? 'Denda Rp 20.000 Lunas' : 'Denda Ditandai Belum Bayar',
        `Status denda infaq keterlambatan ${item.santri?.nama_lengkap || ''} diperbarui.`
      );
    } catch (err: unknown) {
      showToast('error', 'Gagal Memperbarui Denda', extractSupabaseError(err, 'Terjadi kesalahan.'));
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteIzin = async () => {
    if (!canEdit || !deleteTarget) return;
    setDeleting(true);
    try {
      const { error } = await supabase.from('izin_pulang').delete().eq('id', deleteTarget.id);
      if (error) throw error;
      const refreshed = await fetchAllData();
      setIzinList(refreshed.izin);
      setDeleteTarget(null);
      showToast('info', 'Catatan Izin Dihapus', 'Data perizinan pulang berhasil dihapus.');
    } catch (err: unknown) {
      showToast('error', 'Gagal Menghapus', extractSupabaseError(err, 'Gagal menghapus catatan izin.'));
    } finally {
      setDeleting(false);
    }
  };

  const buildWaMessage = (item: IzinViewItem): string => {
    const namaSantri = item.santri?.nama_lengkap || 'Santri';
    const kamar = item.santri?.kamar || '-';
    const penjemput = item.meta.p || 'Bapak/Ibu Wali Santri';
    const jenisLabel =
      item.jenis_izin === 'tidak_menginap' ? 'Pulang Tidak Menginap' : 'Pulang Menginap';
    const batasWaktu =
      item.jenis_izin === 'tidak_menginap'
        ? `${formatTanggalIndo(item.tgl_rencana_kembali)} pukul ${item.meta.b || '17:00'} WIB`
        : `${formatTanggalIndo(item.tgl_rencana_kembali)}`;

    if (item.status === 'disetujui' && item.isOverdueNow) {
      return [
        `Assalamu'alaikum Wr. Wb.`,
        `Yth. Bapak/Ibu ${penjemput},`,
        `Wali santri dari *${namaSantri}* (Kamar ${kamar}).`,
        ``,
        `Kami pengurus Keamanan ${pengaturan.nama_pesantren} menginformasikan bahwa masa izin pulang ananda telah melewati batas waktu:`,
        `• Jenis Izin: ${jenisLabel}`,
        `• Batas Kembali: ${batasWaktu}`,
        `• Status: *${item.overdueLabel}*`,
        ``,
        `Mohon konfirmasi kepada Keamanan Pondok terkait kepulangan ananda. Sesuai Pedoman Tata Tertib, keterlambatan tanpa konfirmasi dikenakan denda infaq Rp 20.000.`,
        `Wassalamu'alaikum Wr. Wb.`,
      ].join('\n');
    }

    if (item.status === 'terlambat') {
      return [
        `Assalamu'alaikum Wr. Wb.`,
        `Yth. Bapak/Ibu ${penjemput},`,
        `Wali santri dari *${namaSantri}* (Kamar ${kamar}).`,
        ``,
        `Menginformasikan bahwa ananda telah kembali ke ${pengaturan.nama_pesantren}:`,
        `• Tanggal Kembali: ${formatTanggalIndo(item.tgl_aktual_kembali)}${
          item.meta.jk ? ` pukul ${item.meta.jk} WIB` : ''
        }`,
        `• Keterangan: Terlambat (${item.overdueLabel})`,
        ...(item.meta.dn > 0
          ? [
              `• Denda Infaq: Rp 20.000 (${
                item.meta.ds === 'lunas' ? 'Sudah Lunas' : 'Belum Dibayar'
              })`,
            ]
          : []),
        ``,
        `Terima kasih atas kerja samanya.`,
        `Wassalamu'alaikum Wr. Wb.`,
      ].join('\n');
    }

    return [
      `Assalamu'alaikum Wr. Wb.`,
      `Yth. Bapak/Ibu ${penjemput},`,
      `Wali santri dari *${namaSantri}* (Kamar ${kamar}).`,
      ``,
      `Berikut konfirmasi Surat Izin Pulang di ${pengaturan.nama_pesantren}:`,
      `• No. Surat: ${item.meta.ns || '-'}`,
      `• Jenis Izin: ${jenisLabel}`,
      `• Tanggal Berangkat: ${formatTanggalIndo(item.tgl_pulang)}`,
      `• Batas Kembali: *${batasWaktu}*`,
      `• Keperluan: ${item.meta.k}${item.alasanTeks ? ` — ${item.alasanTeks}` : ''}`,
      ``,
      `Mohon bantuannya agar ananda kembali tepat waktu sesuai jadwal.`,
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
      'Jenis Izin': item.jenis_izin === 'tidak_menginap' ? 'Pulang Tidak Menginap' : 'Pulang Menginap',
      'Kategori Alasan': item.meta.k,
      'Keterangan Alasan': item.alasanTeks || '-',
      'Wali Penjemput': item.meta.p || '-',
      'Tanggal Pulang': item.tgl_pulang,
      'Batas Kembali':
        item.jenis_izin === 'tidak_menginap'
          ? `${item.tgl_rencana_kembali} (${item.meta.b || '17:00'} WIB)`
          : item.tgl_rencana_kembali,
      'Tanggal Kembali Aktual': item.tgl_aktual_kembali || '-',
      'Jam Kembali Aktual': item.meta.jk || '-',
      'Infaq (Rp)': Number(item.infaq_nominal || 0),
      'Denda Telat (Rp)': Number(item.meta.dn || 0),
      'Status Denda':
        item.meta.ds === 'lunas'
          ? 'Lunas'
          : item.meta.ds === 'belum_bayar'
          ? 'Belum Bayar'
          : item.meta.ds === 'dibebaskan'
          ? 'Dibebaskan'
          : '-',
      Status:
        item.status === 'disetujui'
          ? item.isOverdueNow
            ? `Melewati Batas (${item.overdueLabel})`
            : 'Sedang Pulang'
          : item.status === 'terlambat'
          ? 'Kembali Terlambat'
          : 'Kembali Tepat Waktu',
      'Petugas Keamanan': item.petugasNama,
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Perizinan_Pulang');
    XLSX.writeFile(wb, `REKAP_PERIZINAN_PULANG_${todayStr || 'ANNUR1'}.xlsx`);
    showToast('success', 'Ekspor Excel Berhasil', 'Data perizinan pulang berhasil diunduh.');
  };

  return (
    <div className="space-y-5 relative print:space-y-0">
      {/* PRINT ISOLATION UNTUK SURAT IZIN PULANG RESMI */}
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
          #print-surat-izin,
          #print-surat-izin * {
            visibility: visible;
          }
          #print-surat-izin {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            display: block !important;
            background: #ffffff !important;
          }
        }
      `}</style>

      {/* AREA CETAK SURAT IZIN PULANG RESMI (TERISOLASI SAAT PRINT) */}
      {printTarget && (
        <div id="print-surat-izin" className="hidden bg-white text-slate-900 text-xs leading-relaxed">
          <div className="border-2 border-slate-800 p-6 space-y-5">
            {/* Kop Lembaga */}
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
                  YAYASAN PENDIDIKAN PONDOK PESANTREN AN-NUR
                </p>
                <h1 className="text-lg font-extrabold uppercase text-slate-900">
                  {pengaturan.nama_pesantren}
                </h1>
                <p className="text-[11px] text-slate-600">{pengaturan.alamat_lengkap}</p>
                <p className="text-[11px] text-slate-600">
                  Telp/WA Keamanan &amp; Kantor: {pengaturan.no_telepon}
                </p>
              </div>
            </div>

            <div className="text-center">
              <h2 className="text-base font-extrabold uppercase underline underline-offset-4 text-slate-900">
                SURAT IZIN PULANG SANTRI
              </h2>
              <p className="text-[11px] font-mono text-slate-600 mt-1">
                Nomor: {printTarget.meta.ns || printTarget.id.slice(0, 8).toUpperCase()} &middot;{' '}
                {printTarget.jenis_izin === 'tidak_menginap'
                  ? 'PULANG TIDAK MENGINAP'
                  : 'PULANG MENGINAP'}
              </p>
            </div>

            <p className="text-xs text-slate-800">
              Assalamu&apos;alaikum Wr. Wb. Pengurus Sie Keamanan Pondok Pesantren An-Nur 1 Bululawang
              memberikan izin pulang kepada santri berikut ini:
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
                  <td className="py-1 font-semibold text-slate-700">Kategori &amp; Alasan Izin</td>
                  <td className="py-1">:</td>
                  <td className="py-1">
                    <strong>{printTarget.meta.k}</strong>
                    {printTarget.alasanTeks ? ` — ${printTarget.alasanTeks}` : ''}
                    {printTarget.meta.d ? ' (Disertai Surat Keterangan Dokter)' : ''}
                  </td>
                </tr>
                <tr>
                  <td className="py-1 font-semibold text-slate-700">Orang Tua / Wali Penjemput</td>
                  <td className="py-1">:</td>
                  <td className="py-1 font-semibold">
                    {printTarget.meta.p || '-'}
                    {printTarget.meta.w ? ` (${printTarget.meta.w})` : ''}
                  </td>
                </tr>
                <tr>
                  <td className="py-1 font-semibold text-slate-700">Tanggal Berangkat</td>
                  <td className="py-1">:</td>
                  <td className="py-1 font-mono">{formatTanggalIndo(printTarget.tgl_pulang)}</td>
                </tr>
                <tr>
                  <td className="py-1 font-semibold text-slate-700">Batas Waktu Kembali</td>
                  <td className="py-1">:</td>
                  <td className="py-1 font-bold text-slate-900">
                    {formatTanggalIndo(printTarget.tgl_rencana_kembali)}
                    {printTarget.jenis_izin === 'tidak_menginap'
                      ? ` (Maksimal pukul ${printTarget.meta.b || '17:00'} WIB)`
                      : ' (Maksimal 3 hari izin menginap)'}
                  </td>
                </tr>
                <tr>
                  <td className="py-1 font-semibold text-slate-700">Infaq Administrasi Izin</td>
                  <td className="py-1">:</td>
                  <td className="py-1 font-mono font-bold">
                    {formatRupiah(printTarget.infaq_nominal)}
                  </td>
                </tr>
              </tbody>
            </table>

            <div className="p-3 bg-slate-50 border border-slate-300 rounded text-[10.5px] text-slate-700 space-y-1">
              <p className="font-bold text-slate-900">Ketentuan Tata Tertib Perizinan:</p>
              <p>1. Santri wajib diantar/dijemput oleh orang tua atau wali yang sah.</p>
              <p>
                2. Apabila berhalangan kembali tepat waktu wajib konfirmasi kepada Keamanan Pondok;
                melampaui batas izin tanpa keterangan dikenakan denda infaq Rp 20.000,-.
              </p>
              {printTarget.jenis_izin === 'menginap' && (
                <p>
                  3. Untuk izin pulang menginap, santri wajib membawa buku santri untuk ditandatangani
                  Kepala Pondok dan Pengasuh sebelum meninggalkan area pesantren.
                </p>
              )}
              <p>
                {printTarget.jenis_izin === 'menginap' ? '4.' : '3.'} Setibanya kembali di pondok,
                surat izin ini wajib disetorkan kembali ke kantor Keamanan Pondok.
              </p>
            </div>

            <div className="pt-2 grid grid-cols-3 gap-4 text-center text-[11px]">
              <div>
                <p>Orang Tua / Wali Penjemput,</p>
                <div className="h-16" />
                <p className="font-bold underline underline-offset-2">
                  {printTarget.meta.p || '..............................'}
                </p>
              </div>

              <div className="relative">
                <p>Petugas Keamanan Pondok,</p>
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
                <p className="font-bold underline underline-offset-2">{printTarget.petugasNama}</p>
              </div>

              <div>
                <p>Bululawang, {formatTanggalIndo(printTarget.tgl_pulang)}</p>
                <p>
                  {printTarget.jenis_izin === 'menginap'
                    ? 'Mengetahui Kepala Pondok,'
                    : 'Mengetahui Pengurus,'}
                </p>
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

            {printTarget.jenis_izin === 'menginap' && (
              <div className="pt-2 border-t border-slate-300 text-center text-[11px]">
                <p>Mengesahkan, Pengasuh Pondok Pesantren An-Nur 1 Bululawang</p>
                <div className="h-12 flex items-center justify-center">
                  {pengaturan.ttd_pengasuh_url && (
                    <img
                      src={pengaturan.ttd_pengasuh_url}
                      alt="TTD Pengasuh"
                      referrerPolicy="no-referrer"
                      className="h-12 object-contain"
                    />
                  )}
                </div>
                <p className="font-bold underline underline-offset-2">
                  {pengaturan.nama_pengasuh || 'DR. KH. A. Fahrur Rozi'}
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TOAST NOTIFICATIONS (PUTIH BERSIH SENADA MODUL LAIN) */}
      <div className="fixed top-5 right-5 z-[100] flex flex-col gap-2.5 max-w-sm w-full pointer-events-none print:hidden">
        {toasts.map((t) => (
          <div
            key={t.id}
            className="pointer-events-auto bg-white border border-slate-200 rounded-2xl shadow-xl p-4 flex items-start gap-3"
          >
            {t.type === 'success' && (
              <CheckCircle2 className="w-5 h-5 text-emerald-700 shrink-0 mt-0.5" />
            )}
            {t.type === 'error' && (
              <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
            )}
            {t.type === 'info' && <Info className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />}
            <div className="flex-1 text-xs">
              <h4 className="font-bold text-slate-800">{t.title}</h4>
              <p className="text-slate-600 mt-0.5 leading-relaxed">{t.message}</p>
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

      {/* HEADER MODUL */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4 print:hidden">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
              <FileText className="w-6 h-6 text-emerald-700 shrink-0" />
              Perizinan Pulang Santri
            </h1>
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 mt-1">
              <span>Pedoman Pengurus 2026/2027</span>
              <span aria-hidden="true">&middot;</span>
              <span>Tidak Menginap Rp 5.000 (Default 17:00 WIB)</span>
              <span aria-hidden="true">&middot;</span>
              <span>Menginap Rp 10.000 (Maks 3 Hari)</span>
            </div>
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
              className="px-3.5 sm:px-4 py-2.5 sm:py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 transition-colors"
            >
              <FileSpreadsheet className="w-4 h-4" />
              Ekspor Excel
            </button>
            {canEdit && (
              <button
                type="button"
                onClick={openCreateModal}
                className="col-span-2 sm:col-span-1 px-4 py-2.5 sm:py-2 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 shadow-xs transition-colors"
              >
                <Plus className="w-4 h-4" />
                Buat Izin Pulang Baru
              </button>
            )}
          </div>
        </div>

        {/* BILAH TAB */}
        <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-xl w-full sm:w-fit overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveTab('daftar')}
            className={`px-3.5 sm:px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2 whitespace-nowrap shrink-0 transition-colors ${
              activeTab === 'daftar'
                ? 'bg-emerald-800 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
            }`}
          >
            <UserCheck className="w-4 h-4" />
            1. Daftar &amp; Kontrol ({kpiStats.sedangPulang})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('rekap')}
            className={`px-3.5 sm:px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2 whitespace-nowrap shrink-0 transition-colors ${
              activeTab === 'rekap'
                ? 'bg-emerald-800 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
            }`}
          >
            <Calendar className="w-4 h-4" />
            2. Rekap Infaq &amp; Denda
          </button>
        </div>
      </div>

      <TransparencyBanner moduleLabel="Perizinan Pulang Santri" isReadOnly={!canEdit} />

      {/* ERROR BANNER */}
      {fetchError && (
        <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 flex items-center justify-between gap-3 text-rose-900 text-xs print:hidden">
          <div className="flex items-center gap-2.5">
            <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />
            <span>
              <strong>Kendala Memuat Data:</strong> {fetchError}
            </span>
          </div>
          <button
            type="button"
            onClick={handleReload}
            className="px-3.5 py-1.5 bg-white border border-rose-300 hover:bg-rose-100 rounded-lg font-bold text-rose-800 whitespace-nowrap shrink-0"
          >
            Coba Lagi
          </button>
        </div>
      )}

      {/* 4 KPI METRIC CARDS */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 print:hidden">
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
          <span className="text-xs font-semibold text-slate-500 block">Sedang Pulang</span>
          <strong className="text-2xl font-bold text-sky-700 tabular-nums block mt-1">
            {loading ? '...' : kpiStats.sedangPulang}
          </strong>
          <span className="text-[11px] text-slate-500">Santri berada di rumah</span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
          <span className="text-xs font-semibold text-slate-500 block">Melewati Batas / Terlambat</span>
          <strong className="text-2xl font-bold text-rose-700 tabular-nums block mt-1">
            {loading ? '...' : kpiStats.terlambat}
          </strong>
          <span className="text-[11px] text-rose-600">
            Denda belum bayar: {formatRupiah(kpiStats.totalDendaBelumBayar)}
          </span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
          <span className="text-xs font-semibold text-slate-500 block">Sudah Kembali</span>
          <strong className="text-2xl font-bold text-emerald-800 tabular-nums block mt-1">
            {loading ? '...' : kpiStats.sudahKembali}
          </strong>
          <span className="text-[11px] text-slate-500">Total izin selesai tercatat</span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
          <span className="text-xs font-semibold text-slate-500 block">Infaq &amp; Denda Tercatat</span>
          <strong className="text-xl font-bold text-slate-900 tabular-nums block mt-1 truncate">
            {loading ? '...' : formatRupiah(kpiStats.totalPenerimaan)}
          </strong>
          <span className="text-[11px] text-slate-500 tabular-nums">
            Infaq {formatRupiah(kpiStats.totalInfaq)} &middot; Denda lunas{' '}
            {formatRupiah(kpiStats.totalDendaLunas)}
          </span>
        </div>
      </div>

      {/* FILTER BAR */}
      <div className="bg-white p-3.5 sm:p-4 rounded-2xl border border-slate-200 shadow-xs grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-2.5 items-center print:hidden">
        <div className="relative sm:col-span-2 lg:col-span-4 min-w-0">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            placeholder="Cari Nama, NIS, Penjemput..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full min-h-[40px] pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-600"
          />
        </div>

        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value as FilterStatus)}
          className="lg:col-span-3 min-h-[40px] bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-700 px-3 py-2 rounded-xl"
        >
          <option value="semua">Semua Status ({viewItems.length})</option>
          <option value="sedang_pulang">Sedang Pulang ({kpiStats.sedangPulang})</option>
          <option value="terlambat">Melewati Batas / Terlambat ({kpiStats.terlambat})</option>
          <option value="kembali">Sudah Kembali ({kpiStats.sudahKembali})</option>
        </select>

        <select
          value={filterJenis}
          onChange={(e) => setFilterJenis(e.target.value as 'semua' | JenisIzin)}
          className="lg:col-span-3 min-h-[40px] bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-700 px-3 py-2 rounded-xl"
        >
          <option value="semua">Semua Jenis Izin</option>
          <option value="tidak_menginap">Pulang Tidak Menginap (Rp 5.000)</option>
          <option value="menginap">Pulang Menginap (Rp 10.000)</option>
        </select>

        <select
          value={filterKamar}
          onChange={(e) => setFilterKamar(e.target.value)}
          className="sm:col-span-2 lg:col-span-2 min-h-[40px] bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-700 px-3 py-2 rounded-xl"
        >
          <option value="SEMUA">Semua Kamar</option>
          {kamarOptions.map((km) => (
            <option key={km} value={km}>
              Kamar {km}
            </option>
          ))}
        </select>
      </div>

      {/* TAB 1: DAFTAR & KONTROL KEPULANGAN */}
      {activeTab === 'daftar' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden print:hidden">
          {/* TAMPILAN MOBILE / HP / PWA */}
          <div className="md:hidden divide-y divide-slate-100">
            {loading ? (
              <div className="p-8 text-center text-xs text-slate-400">
                Memuat data perizinan pulang santri...
              </div>
            ) : filteredItems.length === 0 ? (
              <div className="p-8 text-center space-y-3 text-xs">
                <p className="text-slate-500">
                  Belum ada data izin pulang yang sesuai filter saat ini.
                </p>
                {canEdit && (
                  <button
                    type="button"
                    onClick={openCreateModal}
                    className="px-4 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold rounded-xl inline-flex items-center gap-1.5"
                  >
                    <Plus className="w-4 h-4" />
                    Catat Izin Pulang Pertama
                  </button>
                )}
              </div>
            ) : (
              filteredItems.map((item, idx) => {
                const waDigits = formatWaNumber(
                  item.meta.w ||
                    item.santri?.no_wa_wali ||
                    item.santri?.no_wa_ayah ||
                    item.santri?.no_wa_ibu
                );
                const waText = buildWaMessage(item);

                return (
                  <div
                    key={item.id}
                    className={`p-4 space-y-3 text-xs ${
                      item.status === 'disetujui' && item.isOverdueNow ? 'bg-rose-50/45' : ''
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-[11px] text-slate-400 tabular-nums">
                            #{idx + 1}
                          </span>
                          <h3 className="text-sm font-bold text-slate-900 truncate">
                            {item.santri?.nama_lengkap || 'Santri'}
                          </h3>
                        </div>
                        <div className="text-[11px] text-slate-500 font-mono tabular-nums mt-0.5">
                          {item.santri?.nis || '-'} &middot; Kamar {item.santri?.kamar || '-'}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <span
                          className={`font-bold block ${
                            item.status === 'disetujui'
                              ? item.isOverdueNow
                                ? 'text-rose-700'
                                : 'text-sky-700'
                              : item.status === 'terlambat'
                              ? 'text-amber-700'
                              : 'text-emerald-700'
                          }`}
                        >
                          {item.status === 'disetujui'
                            ? item.isOverdueNow
                              ? 'Melewati Batas'
                              : 'Sedang Pulang'
                            : item.status === 'terlambat'
                            ? 'Kembali Terlambat'
                            : 'Sudah Kembali'}
                        </span>
                        <span className="font-mono font-bold text-slate-800 tabular-nums block">
                          {formatRupiah(item.infaq_nominal)}
                        </span>
                      </div>
                    </div>

                    <div className="bg-slate-50/80 border border-slate-100 rounded-xl p-3 space-y-1.5">
                      <div className="flex justify-between gap-2">
                        <span className="font-semibold text-slate-800">
                          {item.jenis_izin === 'tidak_menginap'
                            ? 'Pulang Tidak Menginap'
                            : 'Pulang Menginap'}
                        </span>
                        <span className="font-mono text-[11px] text-slate-500">
                          {item.meta.ns || '-'}
                        </span>
                      </div>
                      <div className="text-[11px] text-emerald-800 font-semibold tabular-nums">
                        Batas: {formatTanggalIndo(item.tgl_rencana_kembali)}
                        {item.jenis_izin === 'tidak_menginap'
                          ? ` · ${item.meta.b || '17:00'} WIB`
                          : ''}
                      </div>
                      <div className="text-[11px] text-slate-600">
                        {item.meta.k}
                        {item.alasanTeks ? ` — ${item.alasanTeks}` : ''}
                      </div>
                      <div className="text-[11px] text-slate-500">
                        Penjemput: <strong className="text-slate-700">{item.meta.p || '-'}</strong>
                      </div>
                      {item.meta.dn > 0 && (
                        <div className="flex items-center justify-between pt-1 border-t border-slate-200/70">
                          <span className="text-[11px] font-bold text-rose-700 tabular-nums">
                            + Denda {formatRupiah(item.meta.dn)}
                          </span>
                          {canEdit ? (
                            <button
                              type="button"
                              disabled={saving}
                              onClick={() => handleToggleDendaLunas(item)}
                              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border ${
                                item.meta.ds === 'lunas'
                                  ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                                  : 'bg-rose-50 text-rose-700 border-rose-300'
                              }`}
                            >
                              {item.meta.ds === 'lunas' ? 'Denda Lunas' : 'Tandai Lunas'}
                            </button>
                          ) : (
                            <span
                              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border ${
                                item.meta.ds === 'lunas'
                                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                  : 'bg-rose-50 text-rose-700 border-rose-200'
                              }`}
                            >
                              {item.meta.ds === 'lunas' ? 'Denda Lunas' : 'Belum Bayar'}
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      {canEdit && item.status === 'disetujui' && (
                        <button
                          type="button"
                          onClick={() => openReturnModal(item)}
                          className="col-span-2 min-h-[40px] px-3 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl font-bold flex items-center justify-center gap-1.5"
                        >
                          <ArrowRightLeft className="w-3.5 h-3.5" />
                          Konfirmasi Kembali
                        </button>
                      )}

                      {waDigits && (
                        <a
                          href={`https://wa.me/${waDigits}?text=${encodeURIComponent(waText)}`}
                          target="_blank"
                          rel="noreferrer"
                          className={`min-h-[40px] px-3 py-2 rounded-xl font-bold flex items-center justify-center gap-1.5 ${
                            item.isOverdueNow
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
                          navigator.clipboard.writeText(waText);
                          showToast(
                            'info',
                            'Teks WA Disalin',
                            'Pesan terformat siap ditempel ke WhatsApp wali santri.'
                          );
                        }}
                        className={`min-h-[40px] px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-semibold flex items-center justify-center gap-1.5 ${
                          waDigits ? '' : 'col-span-2'
                        }`}
                      >
                        <Copy className="w-3.5 h-3.5" />
                        Salin WA
                      </button>

                      <button
                        type="button"
                        onClick={() => setPrintTarget(item)}
                        className="min-h-[40px] px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl font-semibold flex items-center justify-center gap-1.5"
                      >
                        <Printer className="w-3.5 h-3.5" />
                        Cetak Surat
                      </button>

                      {canEdit && (
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(item)}
                          className="min-h-[40px] px-3 py-2 bg-slate-100 hover:bg-rose-50 text-slate-600 hover:text-rose-600 rounded-xl font-semibold flex items-center justify-center gap-1.5"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          Hapus
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* TAMPILAN DESKTOP */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-700">
              <thead className="bg-slate-50 border-b border-slate-200 font-bold text-slate-600 uppercase text-[11px] tracking-wider">
                <tr>
                  <th className="py-3 px-3 w-11 text-center">No</th>
                  <th className="py-3 px-3.5 min-w-[170px]">Santri &amp; Kamar</th>
                  <th className="py-3 px-3.5 min-w-[190px]">Jenis Izin &amp; Batas Waktu</th>
                  <th className="py-3 px-3.5 min-w-[195px]">Alasan &amp; Penjemput</th>
                  <th className="py-3 px-3.5 w-36 text-right whitespace-nowrap">Infaq / Denda</th>
                  <th className="py-3 px-3.5 min-w-[150px]">Status</th>
                  <th className="py-3 px-3.5 w-[258px] text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-slate-400">
                      Memuat data perizinan pulang santri...
                    </td>
                  </tr>
                ) : filteredItems.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-10 text-center space-y-3">
                      <p className="text-slate-500">
                        Belum ada data izin pulang yang sesuai filter saat ini.
                      </p>
                      {canEdit && (
                        <button
                          type="button"
                          onClick={openCreateModal}
                          className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold rounded-xl inline-flex items-center gap-1.5"
                        >
                          <Plus className="w-4 h-4" />
                          Catat Izin Pulang Pertama
                        </button>
                      )}
                    </td>
                  </tr>
                ) : (
                  filteredItems.map((item, idx) => {
                    const waDigits = formatWaNumber(
                      item.meta.w ||
                        item.santri?.no_wa_wali ||
                        item.santri?.no_wa_ayah ||
                        item.santri?.no_wa_ibu
                    );
                    const waText = buildWaMessage(item);

                    return (
                      <tr
                        key={item.id}
                        className={`transition-colors ${
                          item.status === 'disetujui' && item.isOverdueNow
                            ? 'bg-rose-50/45 hover:bg-rose-50/75'
                            : 'hover:bg-slate-50'
                        }`}
                      >
                        <td className="py-3.5 px-3 align-top text-center font-mono text-slate-400 tabular-nums">
                          {idx + 1}
                        </td>
                        <td className="py-3.5 px-3.5 align-top">
                          <div className="font-semibold text-slate-900 leading-snug">
                            {item.santri?.nama_lengkap || 'Santri'}
                          </div>
                          <div className="text-[11px] text-slate-500 font-mono tabular-nums mt-0.5 whitespace-nowrap">
                            {item.santri?.nis || '-'} &middot; Kamar {item.santri?.kamar || '-'}
                          </div>
                          <div className="text-[11px] text-slate-400 font-mono mt-0.5 whitespace-nowrap">
                            {item.meta.ns || '-'}
                          </div>
                        </td>
                        <td className="py-3.5 px-3.5 align-top">
                          <div className="font-bold text-slate-800 whitespace-nowrap">
                            {item.jenis_izin === 'tidak_menginap'
                              ? 'Pulang Tidak Menginap'
                              : 'Pulang Menginap'}
                          </div>
                          <div className="text-[11px] text-slate-600 tabular-nums mt-0.5 whitespace-nowrap">
                            Berangkat: {formatTanggalIndo(item.tgl_pulang)}
                          </div>
                          <div className="text-[11px] font-semibold text-emerald-800 tabular-nums whitespace-nowrap">
                            Batas: {formatTanggalIndo(item.tgl_rencana_kembali)}
                            {item.jenis_izin === 'tidak_menginap'
                              ? ` · ${item.meta.b || '17:00'} WIB`
                              : ''}
                          </div>
                        </td>
                        <td className="py-3.5 px-3.5 align-top">
                          <div className="font-semibold text-slate-800 leading-snug">{item.meta.k}</div>
                          {item.alasanTeks && (
                            <div className="text-[11px] text-slate-600 mt-0.5 line-clamp-2">
                              {item.alasanTeks}
                            </div>
                          )}
                          <div className="text-[11px] text-slate-500 mt-1">
                            Penjemput: <strong className="text-slate-700">{item.meta.p || '-'}</strong>
                            {item.meta.d ? ' · Surat Dokter' : ''}
                          </div>
                        </td>
                        <td className="py-3.5 px-3.5 align-top text-right font-mono tabular-nums whitespace-nowrap">
                          <div className="font-bold text-slate-900">
                            {formatRupiah(item.infaq_nominal)}
                          </div>
                          {item.meta.dn > 0 && (
                            <div className="mt-1 space-y-1">
                              <div className="text-[11px] font-bold text-rose-700">
                                + Denda {formatRupiah(item.meta.dn)}
                              </div>
                              {canEdit ? (
                                <button
                                  type="button"
                                  disabled={saving}
                                  onClick={() => handleToggleDendaLunas(item)}
                                  className={`px-2 py-0.5 rounded-md text-[10px] font-bold border whitespace-nowrap transition-colors ${
                                    item.meta.ds === 'lunas'
                                      ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                                      : 'bg-rose-50 text-rose-700 border-rose-300 hover:bg-rose-100'
                                  }`}
                                >
                                  {item.meta.ds === 'lunas' ? 'Denda Lunas' : 'Tandai Lunas'}
                                </button>
                              ) : (
                                <span
                                  className={`inline-block px-2 py-0.5 rounded-md text-[10px] font-bold border whitespace-nowrap ${
                                    item.meta.ds === 'lunas'
                                      ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                      : 'bg-rose-50 text-rose-700 border-rose-200'
                                  }`}
                                >
                                  {item.meta.ds === 'lunas' ? 'Denda Lunas' : 'Belum Bayar'}
                                </span>
                              )}
                            </div>
                          )}
                          {item.meta.ds === 'dibebaskan' && (
                            <div className="text-[10px] text-slate-500 mt-0.5">Denda dibebaskan</div>
                          )}
                        </td>
                        <td className="py-3.5 px-3.5 align-top">
                          {item.status === 'disetujui' ? (
                            item.isOverdueNow ? (
                              <div className="text-rose-700">
                                <span className="font-bold flex items-center gap-1 whitespace-nowrap">
                                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                                  Melewati Batas
                                </span>
                                <span className="text-[11px] block mt-0.5">{item.overdueLabel}</span>
                              </div>
                            ) : (
                              <div className="text-sky-700">
                                <span className="font-bold flex items-center gap-1 whitespace-nowrap">
                                  <Clock className="w-3.5 h-3.5 shrink-0" />
                                  Sedang Pulang
                                </span>
                                <span className="text-[11px] text-slate-500 block mt-0.5 whitespace-nowrap">
                                  Dalam batas waktu
                                </span>
                              </div>
                            )
                          ) : item.status === 'terlambat' ? (
                            <div className="text-amber-700">
                              <span className="font-bold flex items-center gap-1 whitespace-nowrap">
                                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                                Kembali Terlambat
                              </span>
                              <span className="text-[11px] text-slate-500 block mt-0.5 tabular-nums whitespace-nowrap">
                                {formatTanggalIndo(item.tgl_aktual_kembali)}
                                {item.meta.jk ? ` · ${item.meta.jk} WIB` : ''}
                              </span>
                            </div>
                          ) : (
                            <div className="text-emerald-700">
                              <span className="font-bold flex items-center gap-1 whitespace-nowrap">
                                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                                Sudah Kembali
                              </span>
                              <span className="text-[11px] text-slate-500 block mt-0.5 tabular-nums whitespace-nowrap">
                                {formatTanggalIndo(item.tgl_aktual_kembali)}
                                {item.meta.jk ? ` · ${item.meta.jk} WIB` : ''}
                              </span>
                            </div>
                          )}
                        </td>
                        <td className="py-3.5 px-3.5 align-top">
                          <div className="flex flex-col items-end gap-1.5">
                            {canEdit && item.status === 'disetujui' && (
                              <button
                                type="button"
                                onClick={() => openReturnModal(item)}
                                className="px-3 py-1.5 text-[11px] bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg font-bold flex items-center gap-1 whitespace-nowrap shrink-0"
                              >
                                <ArrowRightLeft className="w-3.5 h-3.5" />
                                Konfirmasi Kembali
                              </button>
                            )}

                            <div className="flex flex-nowrap items-center justify-end gap-1.5">
                              {waDigits && (
                                <a
                                  href={`https://wa.me/${waDigits}?text=${encodeURIComponent(waText)}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  className={`px-2.5 py-1.5 text-[11px] rounded-lg font-bold flex items-center gap-1 whitespace-nowrap shrink-0 ${
                                    item.isOverdueNow
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
                                  navigator.clipboard.writeText(waText);
                                  showToast(
                                    'info',
                                    'Teks WA Disalin',
                                    'Pesan terformat siap ditempel ke WhatsApp wali santri.'
                                  );
                                }}
                                className="px-2.5 py-1.5 text-[11px] bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-semibold flex items-center gap-1 whitespace-nowrap shrink-0"
                              >
                                <Copy className="w-3.5 h-3.5" />
                                Salin WA
                              </button>

                              <button
                                type="button"
                                onClick={() => setPrintTarget(item)}
                                className="px-2.5 py-1.5 text-[11px] bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg font-semibold flex items-center gap-1 whitespace-nowrap shrink-0"
                              >
                                <Printer className="w-3.5 h-3.5" />
                                Surat
                              </button>

                              {canEdit && (
                                <button
                                  type="button"
                                  onClick={() => setDeleteTarget(item)}
                                  title="Hapus catatan izin"
                                  aria-label={`Hapus izin ${item.santri?.nama_lengkap || 'santri'}`}
                                  className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 shrink-0"
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

      {/* TAB 2: REKAP INFAQ, DENDA & RIWAYAT */}
      {activeTab === 'rekap' && (
        <div className="space-y-4 print:hidden">
          <div className="bg-white p-3.5 sm:p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div className="grid grid-cols-1 sm:flex sm:flex-wrap items-center gap-2 text-xs">
              <span className="font-semibold text-slate-600">Periode Tanggal Pulang:</span>
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
                Total Izin: <strong className="text-slate-900">{rekapSummary.totalIzin}</strong>
              </span>
              <span aria-hidden="true">&middot;</span>
              <span>
                Tidak Menginap:{' '}
                <strong className="text-slate-900">{rekapSummary.tidakMenginapCount}</strong>
              </span>
              <span aria-hidden="true">&middot;</span>
              <span>
                Menginap: <strong className="text-slate-900">{rekapSummary.menginapCount}</strong>
              </span>
              <span aria-hidden="true">&middot;</span>
              <span>
                Infaq: <strong className="text-emerald-800">{formatRupiah(rekapSummary.infaqTotal)}</strong>
              </span>
              <span aria-hidden="true">&middot;</span>
              <span>
                Denda Lunas:{' '}
                <strong className="text-emerald-800">{formatRupiah(rekapSummary.dendaLunas)}</strong>
              </span>
              {rekapSummary.dendaBelum > 0 && (
                <>
                  <span aria-hidden="true">&middot;</span>
                  <span>
                    Denda Belum Bayar:{' '}
                    <strong className="text-rose-700">{formatRupiah(rekapSummary.dendaBelum)}</strong>
                  </span>
                </>
              )}
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            {/* MOBILE CARD VIEW REKAP */}
            <div className="md:hidden divide-y divide-slate-100">
              {rekapFilteredItems.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-400">
                  Belum ada catatan perizinan pada rentang tanggal ini.
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
                          Kamar {item.santri?.kamar || '-'} &middot; {item.meta.ns || '-'}
                        </div>
                      </div>
                      <span className="font-mono font-bold text-slate-900 tabular-nums shrink-0">
                        {formatRupiah(item.infaq_nominal)}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-600 tabular-nums">
                      {item.jenis_izin === 'tidak_menginap' ? 'Tidak Menginap' : 'Menginap'} &middot;{' '}
                      {formatTanggalIndo(item.tgl_pulang)} &rarr;{' '}
                      {item.tgl_aktual_kembali
                        ? formatTanggalIndo(item.tgl_aktual_kembali)
                        : 'Belum kembali'}
                    </div>
                    {item.meta.dn > 0 && (
                      <div
                        className={`text-[11px] font-bold tabular-nums ${
                          item.meta.ds === 'lunas' ? 'text-emerald-700' : 'text-rose-700'
                        }`}
                      >
                        Denda {formatRupiah(item.meta.dn)} (
                        {item.meta.ds === 'lunas' ? 'Lunas' : 'Belum'})
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>

            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-700">
                <thead className="bg-slate-50 border-b border-slate-200 font-bold text-slate-600 uppercase text-[11px]">
                  <tr>
                    <th className="py-3 px-3 w-11 text-center">No</th>
                    <th className="py-3 px-3.5 min-w-[140px] whitespace-nowrap">No. Surat &amp; Tanggal</th>
                    <th className="py-3 px-3.5 min-w-[165px]">Santri &amp; Kamar</th>
                    <th className="py-3 px-3.5 min-w-[155px]">Jenis &amp; Batas</th>
                    <th className="py-3 px-3.5 min-w-[140px] whitespace-nowrap">Kembali Aktual</th>
                    <th className="py-3 px-3.5 w-28 text-right whitespace-nowrap">Infaq</th>
                    <th className="py-3 px-3.5 w-36 text-right whitespace-nowrap">Denda Telat</th>
                    <th className="py-3 px-3.5 min-w-[130px]">Petugas</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rekapFilteredItems.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="p-8 text-center text-slate-400">
                        Belum ada catatan perizinan pada rentang tanggal ini.
                      </td>
                    </tr>
                  ) : (
                    rekapFilteredItems.map((item, idx) => (
                      <tr key={item.id} className="hover:bg-slate-50">
                        <td className="py-3 px-3 text-center font-mono text-slate-400 tabular-nums">
                          {idx + 1}
                        </td>
                        <td className="py-3 px-3.5 font-mono text-[11px] tabular-nums whitespace-nowrap">
                          <div className="font-bold text-slate-800">{item.meta.ns || '-'}</div>
                          <div className="text-slate-500">{formatTanggalIndo(item.tgl_pulang)}</div>
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
                          <div className="font-semibold text-slate-800 whitespace-nowrap">
                            {item.jenis_izin === 'tidak_menginap' ? 'Tidak Menginap' : 'Menginap'}
                          </div>
                          <div className="text-[11px] text-slate-500 tabular-nums whitespace-nowrap">
                            {formatTanggalIndo(item.tgl_rencana_kembali)}
                            {item.jenis_izin === 'tidak_menginap'
                              ? ` · ${item.meta.b || '17:00'} WIB`
                              : ''}
                          </div>
                        </td>
                        <td className="py-3 px-3.5 tabular-nums whitespace-nowrap">
                          {item.tgl_aktual_kembali ? (
                            <span>
                              {formatTanggalIndo(item.tgl_aktual_kembali)}
                              {item.meta.jk ? ` · ${item.meta.jk} WIB` : ''}
                            </span>
                          ) : (
                            <span className="text-sky-700 font-semibold">Belum kembali</span>
                          )}
                        </td>
                        <td className="py-3 px-3.5 text-right font-mono font-bold text-slate-900 tabular-nums whitespace-nowrap">
                          {formatRupiah(item.infaq_nominal)}
                        </td>
                        <td className="py-3 px-3.5 text-right font-mono tabular-nums whitespace-nowrap">
                          {item.meta.dn > 0 ? (
                            <span
                              className={
                                item.meta.ds === 'lunas'
                                  ? 'text-emerald-700 font-bold'
                                  : 'text-rose-700 font-bold'
                              }
                            >
                              {formatRupiah(item.meta.dn)} (
                              {item.meta.ds === 'lunas' ? 'Lunas' : 'Belum'})
                            </span>
                          ) : item.meta.ds === 'dibebaskan' ? (
                            <span className="text-slate-500">Dibebaskan</span>
                          ) : (
                            <span className="text-slate-400">-</span>
                          )}
                        </td>
                        <td className="py-3 px-3.5 text-slate-600">{item.petugasNama}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* MODAL BUAT IZIN PULANG BARU */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 print:hidden">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden">
            <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-6 py-4 shrink-0 bg-white">
              <div>
                <h2 className="text-base font-bold text-slate-900">Buat Surat Izin Pulang Baru</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Mengacu Tata Tertib Perizinan Pulang Pondok Pesantren An-Nur 1 (2026/2027)
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form
              onSubmit={handleCreateIzin}
              className="flex flex-col flex-1 min-h-0 text-xs"
            >
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
                        className="w-full pl-10 pr-24 py-2.5 bg-white border border-slate-300 rounded-xl font-medium text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-emerald-600"
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
                                  handleSelectFormSantri(s.id);
                                }}
                                className="w-full px-3.5 py-2.5 text-left hover:bg-emerald-50 flex items-center justify-between gap-3 transition-colors"
                              >
                                <div className="min-w-0">
                                  <div className="font-semibold text-slate-900 truncate">
                                    {s.nama_lengkap}
                                  </div>
                                  <div className="text-[11px] text-slate-500">
                                    Kamar {s.kamar}
                                  </div>
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

                {/* JENIS IZIN PULANG (2 KATEGORI) */}
                <div className="space-y-1.5">
                  <label className="font-bold text-slate-700 block">
                    2. Kategori Izin Pulang &amp; Tarif Infaq
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <button
                      type="button"
                      onClick={() => handleChangeFormJenis('tidak_menginap')}
                      className={`p-3.5 rounded-xl border text-left transition-colors ${
                        formJenis === 'tidak_menginap'
                          ? 'bg-emerald-50 border-emerald-700 text-emerald-950'
                          : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      <div className="font-bold">Pulang Tidak Menginap</div>
                      <div className="text-[11px] mt-0.5 text-slate-600">
                        Infaq Rp 5.000 &middot; Batas default 17:00 WIB (bisa diubah)
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleChangeFormJenis('menginap')}
                      className={`p-3.5 rounded-xl border text-left transition-colors ${
                        formJenis === 'menginap'
                          ? 'bg-emerald-50 border-emerald-700 text-emerald-950'
                          : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      <div className="font-bold">Pulang Menginap</div>
                      <div className="text-[11px] mt-0.5 text-slate-600">
                        Infaq Rp 10.000 &middot; Maksimal 3 hari &middot; TTD Kep. Pondok &amp; Pengasuh
                      </div>
                    </button>
                  </div>
                </div>

                {/* TANGGAL & BATAS JAM KEMBALI */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Tanggal Berangkat</label>
                    <input
                      type="date"
                      required
                      value={formTglPulang}
                      onChange={(e) => handleChangeFormTglPulang(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl font-semibold"
                    />
                  </div>

                  <div>
                    <label className="font-bold text-slate-700 block mb-1">
                      Tanggal Rencana Kembali
                    </label>
                    <input
                      type="date"
                      required
                      value={formTglRencanaKembali}
                      min={formTglPulang}
                      onChange={(e) => setFormTglRencanaKembali(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl font-semibold"
                    />
                  </div>

                  {formJenis === 'tidak_menginap' ? (
                    <div>
                      <label className="font-bold text-slate-700 block mb-1">
                        Batas Jam Kembali (WIB)
                      </label>
                      <input
                        type="time"
                        required
                        value={formBatasJam}
                        onChange={(e) => setFormBatasJam(e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl font-bold text-emerald-900"
                      />
                    </div>
                  ) : (
                    <div className="flex flex-col justify-end">
                      <div className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-[11px] text-slate-600 tabular-nums">
                        Durasi izin: <strong>{formDurationDays} hari</strong>
                      </div>
                    </div>
                  )}
                </div>

                {formJenis === 'tidak_menginap' && (
                  <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-[11px] text-slate-600">
                    <span>
                      Default batas pukul <strong>17:00 WIB</strong>, dapat diubah jika ada keperluan
                      khusus (misal periksa dokter malam).
                    </span>
                    <div className="flex items-center gap-1.5">
                      {['17:00', '20:30', '21:30', '22:00'].map((jam) => (
                        <button
                          key={jam}
                          type="button"
                          onClick={() => setFormBatasJam(jam)}
                          className={`px-2 py-1 rounded-lg font-mono font-bold border transition-colors ${
                            formBatasJam === jam
                              ? 'bg-emerald-700 text-white border-emerald-700'
                              : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                          }`}
                        >
                          {jam}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {formJenis === 'menginap' && formDurationDays > 3 && (
                  <div className="p-3 bg-amber-50 border border-amber-300 rounded-xl text-[11px] text-amber-900 flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <span>
                      Sesuai Pedoman Pengurus, batas izin pulang menginap maksimal{' '}
                      <strong>3 hari</strong>. Jika karena sakit lebih dari 3 hari, wajib menyerahkan{' '}
                      <strong>Surat Keterangan Dokter</strong>.
                    </span>
                  </div>
                )}

                {/* ALASAN RESMI PEDOMAN & PEMBERI IZIN (AUTOCOMPLETE PENGURUS) */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">
                      Kategori Alasan Resmi
                    </label>
                    <select
                      value={formKategori}
                      onChange={(e) => setFormKategori(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl font-semibold text-slate-800"
                    >
                      {KATEGORI_ALASAN_PEDOMAN.map((kat) => (
                        <option key={kat} value={kat}>
                          {kat}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="relative">
                    <label className="font-bold text-slate-700 block mb-1">
                      Pemberi Izin (Pengurus / Keamanan)
                    </label>
                    <div className="relative">
                      <UserCheck className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        type="text"
                        placeholder="Ketik nama pengurus pemberi izin..."
                        value={formPetugasText}
                        onFocus={() => setPetugasDropdownOpen(true)}
                        onBlur={() => setTimeout(() => setPetugasDropdownOpen(false), 160)}
                        onChange={(e) => {
                          setFormPetugasText(e.target.value);
                          setFormPetugasId('');
                          setPetugasDropdownOpen(true);
                        }}
                        className="w-full pl-9 pr-8 py-2 bg-white border border-slate-300 rounded-xl font-semibold text-slate-800 placeholder:text-slate-400 placeholder:font-normal focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-emerald-600"
                      />
                      {formPetugasText && (
                        <button
                          type="button"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            setFormPetugasId('');
                            setFormPetugasText('');
                            setPetugasDropdownOpen(true);
                          }}
                          title="Hapus pilihan pengurus"
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}

                      {petugasDropdownOpen && (
                        <div className="absolute left-0 right-0 top-full mt-1.5 z-30 bg-white border border-slate-200 rounded-xl shadow-xl max-h-48 overflow-y-auto divide-y divide-slate-100">
                          {selectablePengurus.length === 0 ? (
                            <button
                              type="button"
                              onMouseDown={(e) => {
                                e.preventDefault();
                                setPetugasDropdownOpen(false);
                              }}
                              className="w-full px-3.5 py-2.5 text-left text-slate-600 hover:bg-slate-50"
                            >
                              {formPetugasText.trim()
                                ? `Gunakan nama: "${formPetugasText.trim()}"`
                                : 'Belum ada daftar pengurus aktif'}
                            </button>
                          ) : (
                            selectablePengurus.map((p) => {
                              const isPicked =
                                formPetugasId === p.id ||
                                formPetugasText.trim().toLowerCase() ===
                                  p.nama_lengkap.toLowerCase();
                              return (
                                <button
                                  key={p.id}
                                  type="button"
                                  onMouseDown={(e) => {
                                    e.preventDefault();
                                    setFormPetugasId(p.id);
                                    setFormPetugasText(p.nama_lengkap);
                                    setPetugasDropdownOpen(false);
                                  }}
                                  className={`w-full px-3.5 py-2 text-left flex items-center justify-between gap-2 transition-colors ${
                                    isPicked
                                      ? 'bg-emerald-50 text-emerald-950 font-bold'
                                      : 'hover:bg-emerald-50 text-slate-800 font-medium'
                                  }`}
                                >
                                  <span className="truncate">{p.nama_lengkap}</span>
                                  {isPicked && (
                                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                                  )}
                                </button>
                              );
                            })
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">
                    Keterangan Tambahan / Keperluan
                  </label>
                  <textarea
                    rows={2}
                    placeholder="Contoh: Periksa ke dokter praktek malam di Bululawang / menghadiri walimah saudara..."
                    value={formAlasanDetail}
                    onChange={(e) => setFormAlasanDetail(e.target.value)}
                    className="w-full px-3.5 py-2 bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-600"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">
                      Nama Orang Tua / Wali Penjemput
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Nama lengkap wali yang menjemput..."
                      value={formPenjemput}
                      onChange={(e) => setFormPenjemput(e.target.value)}
                      className="w-full px-3.5 py-2 bg-white border border-slate-300 rounded-xl"
                    />
                  </div>
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">
                      No. WhatsApp Penjemput / Wali
                    </label>
                    <input
                      type="text"
                      placeholder="08xxxxxxxxxx"
                      value={formWaPenjemput}
                      onChange={(e) => setFormWaPenjemput(e.target.value)}
                      className="w-full px-3.5 py-2 bg-white border border-slate-300 rounded-xl font-mono"
                    />
                  </div>
                </div>

                <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formSuratDokter}
                    onChange={(e) => setFormSuratDokter(e.target.checked)}
                    className="rounded border-slate-300 text-emerald-700 focus:ring-emerald-600"
                  />
                  <span>Menyertakan Surat Keterangan Dokter / Undangan Resmi</span>
                </label>
              </div>

              <div className="px-6 py-4 border-t border-slate-200 bg-slate-50/70 flex items-center justify-end gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 font-bold rounded-xl"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 bg-emerald-700 hover:bg-emerald-800 disabled:bg-slate-300 text-white font-bold rounded-xl shadow-xs"
                >
                  {saving ? 'Menyimpan...' : 'Simpan & Terbitkan Surat Izin'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL KONFIRMASI KEPULANGAN & PENANGANAN TERLAMBAT / DENDA */}
      {returnTarget && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 print:hidden">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-start justify-between gap-3 border-b border-slate-200 pb-3">
              <div>
                <h2 className="text-base font-bold text-slate-900">Konfirmasi Santri Kembali</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  {returnTarget.santri?.nama_lengkap} &middot; Kamar {returnTarget.santri?.kamar}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setReturnTarget(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleConfirmReturn} className="space-y-4 text-xs">
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                <div className="flex justify-between">
                  <span className="text-slate-500">Batas Rencana Kembali:</span>
                  <strong className="text-slate-900 tabular-nums">
                    {formatTanggalIndo(returnTarget.tgl_rencana_kembali)}
                    {returnTarget.jenis_izin === 'tidak_menginap'
                      ? ` · ${returnTarget.meta.b || '17:00'} WIB`
                      : ''}
                  </strong>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Tanggal Kembali</label>
                  <input
                    type="date"
                    required
                    value={returnTglAktual}
                    onChange={(e) => {
                      setReturnTglAktual(e.target.value);
                      handleComputeReturnLatePreview(
                        e.target.value,
                        returnJamAktual,
                        returnTarget
                      );
                    }}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl font-semibold"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Jam Kembali (WIB)</label>
                  <input
                    type="time"
                    value={returnJamAktual}
                    onChange={(e) => {
                      setReturnJamAktual(e.target.value);
                      handleComputeReturnLatePreview(
                        returnTglAktual,
                        e.target.value,
                        returnTarget
                      );
                    }}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl font-semibold"
                  />
                </div>
              </div>

              <label className="flex items-center gap-2 font-semibold text-slate-800 cursor-pointer">
                <input
                  type="checkbox"
                  checked={returnForceTerlambat}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setReturnForceTerlambat(checked);
                    setReturnDendaStatus(checked ? 'belum_bayar' : 'tidak_ada');
                  }}
                  className="rounded border-slate-300 text-rose-600 focus:ring-rose-500"
                />
                <span>Tandai sebagai Kembali Terlambat (Molor)</span>
              </label>

              {returnForceTerlambat && (
                <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl space-y-2.5">
                  <div className="font-bold text-rose-900">
                    Sanksi Melampaui Batas Izin: Denda Infaq Rp 20.000
                  </div>
                  <select
                    value={returnDendaStatus}
                    onChange={(e) => setReturnDendaStatus(e.target.value as StatusDenda)}
                    className="w-full px-3 py-2 bg-white border border-rose-300 rounded-xl font-semibold text-slate-800"
                  >
                    <option value="belum_bayar">Denda Rp 20.000 — Belum Dibayar</option>
                    <option value="lunas">Denda Rp 20.000 — Sudah Lunas</option>
                    <option value="dibebaskan">Dibebaskan (Sudah Konfirmasi ke Keamanan)</option>
                  </select>
                </div>
              )}

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setReturnTarget(null)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 bg-emerald-700 hover:bg-emerald-800 disabled:bg-slate-300 text-white font-bold rounded-xl"
                >
                  {saving ? 'Menyimpan...' : 'Simpan Konfirmasi'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL PRATINJAU CETAK SURAT IZIN */}
      {printTarget && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto print:hidden">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-2xl w-full p-6 space-y-4 my-6">
            <div className="flex items-start justify-between gap-3 border-b border-slate-200 pb-3">
              <div>
                <h2 className="text-base font-bold text-slate-900">Pratinjau Surat Izin Pulang</h2>
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
              <div className="flex justify-between">
                <span className="text-slate-500">Jenis Izin:</span>
                <strong>
                  {printTarget.jenis_izin === 'tidak_menginap'
                    ? 'Pulang Tidak Menginap (Infaq Rp 5.000)'
                    : 'Pulang Menginap (Infaq Rp 10.000)'}
                </strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Berangkat &amp; Batas Kembali:</span>
                <strong className="tabular-nums">
                  {formatTanggalIndo(printTarget.tgl_pulang)} &rarr;{' '}
                  {formatTanggalIndo(printTarget.tgl_rencana_kembali)}
                  {printTarget.jenis_izin === 'tidak_menginap'
                    ? ` (${printTarget.meta.b || '17:00'} WIB)`
                    : ''}
                </strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Penjemput (Wali):</span>
                <strong>{printTarget.meta.p || '-'}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Alasan:</span>
                <span>
                  {printTarget.meta.k}
                  {printTarget.alasanTeks ? ` — ${printTarget.alasanTeks}` : ''}
                </span>
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
                Cetak Surat Izin Resmi
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
                <h3 className="text-sm font-bold text-slate-900">Hapus Catatan Izin Pulang?</h3>
                <p className="text-slate-600 mt-1">
                  Catatan izin milik <strong>{deleteTarget.santri?.nama_lengkap}</strong> (
                  {formatTanggalIndo(deleteTarget.tgl_pulang)}) akan dihapus permanen.
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
                onClick={handleDeleteIzin}
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
