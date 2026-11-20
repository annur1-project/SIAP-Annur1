'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import * as XLSX from 'xlsx';
import {
  Utensils,
  Clock,
  Play,
  Square,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  RefreshCw,
  Plus,
  Copy,
  Printer,
  FileSpreadsheet,
  Wallet,
  TrendingUp,
  TrendingDown,
  Users,
  UserPlus,
  UserCheck,
  BarChart3,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Trash2,
  Edit3,
  Lock,
  X,
  Info,
  Search,
  Sun,
  Sunset,
  Award,
  ShieldAlert,
  ArrowRightLeft,
  Moon,
} from 'lucide-react';
import { useAuth, TransparencyBanner } from '@/lib/auth';
import {
  type DapurShift,
  type DapurSesiMasak,
  type DapurMenuJadwal,
  type DapurPetugas,
  type DapurAbsenPetugas,
  type DapurKasItem,
  type DapurBukuMasakItem,
  type DapurJualanMalamItem,
  type TipeBukuMasak,
  type TipeJualanMalam,
  type StatusAbsenPetugas,
  type JenisKasDapur,
  SHIFT_TARGET_TIME,
  DEFAULT_JATAH_MASAK_HARIAN,
  LS_DAPUR_SESI_KEY,
  LS_DAPUR_MENU_KEY,
  LS_DAPUR_PETUGAS_KEY,
  LS_DAPUR_ABSEN_KEY,
  LS_DAPUR_KAS_KEY,
  LS_DAPUR_BUKU_MASAK_KEY,
  LS_DAPUR_JUALAN_MALAM_KEY,
  KATEGORI_KAS_MASUK,
  KATEGORI_KAS_KELUAR,
  createDapurId,
  isMissingRelationError,
  extractSupabaseError,
  getLocalTodayStr,
  addDaysIso,
  getWeekRangeMondayToSunday,
  formatHariTanggalIndo,
  formatTanggalPendek,
  formatTimeClock,
  formatElapsedHms,
  formatRupiah,
  getShiftDeadlineDate,
  evaluateCookingCompletion,
  computeCookingTimelinessStats,
  computePetugasAnalytics,
  computeBukuMasakSummary,
  computeJualanMalamSummary,
  writeLocalArray,
  fetchTableWithFallback,
  buildAnalitikPetugasWaText,
} from '@/lib/dapur';

type ActiveTab = 'timer' | 'menu' | 'absen' | 'kas';

interface PengurusSourceRow {
  id: string;
  nama_lengkap: string;
  no_wa?: string | null;
  status?: string | null;
  jabatan_list?: Array<{
    divisi?: string;
    nama_jabatan?: string;
    is_utama?: boolean;
  }>;
}

interface ToastState {
  id: number;
  type: 'success' | 'error' | 'info';
  title: string;
  message: string;
}

const NAMA_BULAN = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];

function formatMonthLabel(ym: string): string {
  if (!ym || !/^\d{4}-\d{2}$/.test(ym)) return 'Semua Periode';
  const [y, m] = ym.split('-');
  const idx = parseInt(m, 10) - 1;
  return `${NAMA_BULAN[idx] || m} ${y}`;
}

export default function DapurPage() {
  const { canEditModule, pengurus } = useAuth();
  const canEditDapur = canEditModule('dapur');

  const [activeTab, setActiveTab] = useState<ActiveTab>('timer');
  const [todayStr, setTodayStr] = useState<string>('');
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [selectedMonth, setSelectedMonth] = useState<string>('');
  const [nowMs, setNowMs] = useState<number>(0);

  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [toasts, setToasts] = useState<ToastState[]>([]);

  // Core Data States
  const [sesiList, setSesiList] = useState<DapurSesiMasak[]>([]);
  const [menuList, setMenuList] = useState<DapurMenuJadwal[]>([]);
  const [petugasList, setPetugasList] = useState<DapurPetugas[]>([]);
  const [absenList, setAbsenList] = useState<DapurAbsenPetugas[]>([]);
  const [kasList, setKasList] = useState<DapurKasItem[]>([]);
  const [bukuMasakList, setBukuMasakList] = useState<DapurBukuMasakItem[]>([]);
  const [jualanMalamList, setJualanMalamList] = useState<DapurJualanMalamItem[]>([]);
  const [pengurusSource, setPengurusSource] = useState<PengurusSourceRow[]>([]);

  // Tab 1: Timer Filters & Edit Modal
  const [riwayatFilterShift, setRiwayatFilterShift] = useState<'semua' | DapurShift>('semua');
  const [riwayatFilterStatus, setRiwayatFilterStatus] = useState<'semua' | 'tepat_waktu' | 'terlambat'>('semua');
  const [editingSesi, setEditingSesi] = useState<DapurSesiMasak | null>(null);
  const [sesiMenuInput, setSesiMenuInput] = useState<string>('');
  const [sesiPjInput, setSesiPjInput] = useState<string>('');
  const [sesiCatatanInput, setSesiCatatanInput] = useState<string>('');

  // Tab 2: Menu Modal
  const [showMenuModal, setShowMenuModal] = useState<boolean>(false);
  const [editingMenuId, setEditingMenuId] = useState<string | null>(null);
  const [menuFormTanggal, setMenuFormTanggal] = useState<string>('');
  const [menuFormShift, setMenuFormShift] = useState<DapurShift>('pagi');
  const [menuFormUtama, setMenuFormUtama] = useState<string>('');
  const [menuFormSayur, setMenuFormSayur] = useState<string>('');
  const [menuFormLauk, setMenuFormLauk] = useState<string>('');
  const [menuFormPorsi, setMenuFormPorsi] = useState<string>('250');
  const [menuFormCatatan, setMenuFormCatatan] = useState<string>('');

  // Tab 3: Absen & Petugas States
  const [absenShiftView, setAbsenShiftView] = useState<DapurShift>('pagi');
  const [absenSearch, setAbsenSearch] = useState<string>('');
  const [showPetugasModal, setShowPetugasModal] = useState<boolean>(false);
  const [newPetugasNama, setNewPetugasNama] = useState<string>('');
  const [newPetugasJabatan, setNewPetugasJabatan] = useState<string>('Petugas Dapur');
  const [newPetugasWa, setNewPetugasWa] = useState<string>('');
  const [editingKetTarget, setEditingKetTarget] = useState<{
    petugas: DapurPetugas;
    shift: DapurShift;
    currentKet: string;
  } | null>(null);
  const [ketInput, setKetInput] = useState<string>('');

  // Tab 4: Keuangan Dapur (Buku 1 Masak & Buku 2 Jualan Malam + Legacy Kas)
  const [showBuku1Modal, setShowBuku1Modal] = useState<boolean>(false);
  const [buku1Tipe, setBuku1Tipe] = useState<'jatah_harian' | 'belanja_pagi' | 'belanja_sore'>('jatah_harian');
  const [buku1Tanggal, setBuku1Tanggal] = useState<string>('');
  const [buku1Nominal, setBuku1Nominal] = useState<string>(String(DEFAULT_JATAH_MASAK_HARIAN));
  const [buku1Uraian, setBuku1Uraian] = useState<string>('');
  const [buku1Pj, setBuku1Pj] = useState<string>('');
  const [buku1Catatan, setBuku1Catatan] = useState<string>('');

  const [showBuku2Modal, setShowBuku2Modal] = useState<boolean>(false);
  const [buku2Tipe, setBuku2Tipe] = useState<'omzet_jualan' | 'modal_belanja'>('omzet_jualan');
  const [buku2Tanggal, setBuku2Tanggal] = useState<string>('');
  const [buku2Nominal, setBuku2Nominal] = useState<string>('');
  const [buku2Uraian, setBuku2Uraian] = useState<string>('');
  const [buku2Pj, setBuku2Pj] = useState<string>('');
  const [buku2Catatan, setBuku2Catatan] = useState<string>('');

  const [showSubsidiModal, setShowSubsidiModal] = useState<boolean>(false);
  const [subsidiNominal, setSubsidiNominal] = useState<string>('');
  const [subsidiCatatan, setSubsidiCatatan] = useState<string>('');

  // Legacy Buku Kas Dapur States (tetap dipertahankan untuk arsip lama)
  const [kasFilterJenis, setKasFilterJenis] = useState<'semua' | JenisKasDapur>('semua');
  const [kasFilterPeriode, setKasFilterPeriode] = useState<'bulan_ini' | 'semua'>('bulan_ini');
  const [kasSearch, setKasSearch] = useState<string>('');
  const [showKasModal, setShowKasModal] = useState<boolean>(false);
  const [editingKas, setEditingKas] = useState<DapurKasItem | null>(null);
  const [kasFormTanggal, setKasFormTanggal] = useState<string>('');
  const [kasFormJenis, setKasFormJenis] = useState<JenisKasDapur>('keluar');
  const [kasFormKategori, setKasFormKategori] = useState<string>(KATEGORI_KAS_KELUAR[0]);
  const [kasFormUraian, setKasFormUraian] = useState<string>('');
  const [kasFormNominal, setKasFormNominal] = useState<string>('');
  const [kasFormPj, setKasFormPj] = useState<string>('');
  const [kasFormCatatan, setKasFormCatatan] = useState<string>('');

  // Delete confirmation modal
  const [deleteDialog, setDeleteDialog] = useState<{
    kind: 'menu' | 'petugas' | 'kas' | 'buku_masak' | 'jualan_malam';
    id: string;
    label: string;
  } | null>(null);

  const showToast = useCallback((type: ToastState['type'], title: string, message: string) => {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    setToasts((prev) => [...prev, { id, type, title, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((item) => item.id !== id));
    }, 4500);
  }, []);

  // Hydration-safe local date & live 1-second clock ticker
  useEffect(() => {
    let active = true;
    Promise.resolve().then(() => {
      if (!active) return;
      const now = new Date();
      const t = getLocalTodayStr(now);
      setTodayStr(t);
      setSelectedDate((prev) => prev || t);
      setSelectedMonth((prev) => prev || t.slice(0, 7));
      setNowMs(now.getTime());
    });

    const interval = setInterval(() => {
      setNowMs(Date.now());
    }, 1000);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);

  const loadAllData = useCallback(async () => {
    setLoading(true);
    try {
      const [sesiRes, menuRes, petugasRes, absenRes, kasRes, bukuMasakRes, jualanMalamRes, pengurusRes] =
        await Promise.all([
          fetchTableWithFallback<DapurSesiMasak>('dapur_sesi_masak', LS_DAPUR_SESI_KEY, {
            col: 'tanggal',
            ascending: false,
          }),
          fetchTableWithFallback<DapurMenuJadwal>('dapur_menu_jadwal', LS_DAPUR_MENU_KEY, {
            col: 'tanggal',
            ascending: true,
          }),
          fetchTableWithFallback<DapurPetugas>('dapur_petugas', LS_DAPUR_PETUGAS_KEY, {
            col: 'nama',
            ascending: true,
          }),
          fetchTableWithFallback<DapurAbsenPetugas>('dapur_absen_petugas', LS_DAPUR_ABSEN_KEY, {
            col: 'tanggal',
            ascending: false,
          }),
          fetchTableWithFallback<DapurKasItem>('dapur_kas', LS_DAPUR_KAS_KEY, {
            col: 'tanggal',
            ascending: false,
          }),
          fetchTableWithFallback<DapurBukuMasakItem>('dapur_buku_masak', LS_DAPUR_BUKU_MASAK_KEY, {
            col: 'tanggal',
            ascending: false,
          }),
          fetchTableWithFallback<DapurJualanMalamItem>(
            'dapur_jualan_malam',
            LS_DAPUR_JUALAN_MALAM_KEY,
            { col: 'tanggal', ascending: false }
          ),
          supabase.from('v_pengurus_lengkap').select('*'),
        ]);

      setSesiList(sesiRes.rows);
      setMenuList(menuRes.rows);
      setPetugasList(petugasRes.rows);
      setAbsenList(absenRes.rows);
      setKasList(kasRes.rows);
      setBukuMasakList(bukuMasakRes.rows);
      setJualanMalamList(jualanMalamRes.rows);

      if (!pengurusRes.error && Array.isArray(pengurusRes.data)) {
        const activePengurus = (pengurusRes.data as PengurusSourceRow[]).filter(
          (p) => !p.status || p.status === 'aktif'
        );
        setPengurusSource(activePengurus);
      }
    } catch (err) {
      showToast('error', 'Gagal Memuat Data', extractSupabaseError(err, 'Terjadi kendala koneksi.'));
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    let active = true;
    Promise.resolve().then(() => {
      if (active) {
        void loadAllData();
      }
    });
    return () => {
      active = false;
    };
  }, [loadAllData]);

  // Persistence helper for upsert/insert/delete across Supabase + localStorage
  const persistUpsert = useCallback(
    async <T extends { id: string }>(
      table: string,
      lsKey: string,
      nextRows: T[],
      itemToSave: T
    ): Promise<void> => {
      writeLocalArray(lsKey, nextRows);
      try {
        const { error } = await supabase.from(table).upsert(itemToSave, { onConflict: 'id' });
        if (error && !isMissingRelationError(error)) {
          throw error;
        }
      } catch {
        // Fallback ke localStorage tetap berjalan otomatis
      }
    },
    []
  );

  const persistDelete = useCallback(
    async <T extends { id: string }>(
      table: string,
      lsKey: string,
      nextRows: T[],
      id: string
    ): Promise<void> => {
      writeLocalArray(lsKey, nextRows);
      try {
        await supabase.from(table).delete().eq('id', id);
      } catch {
        // Fallback ke localStorage tetap berjalan otomatis
      }
    },
    []
  );

  // Derived Today/Selected Menu & Session
  const activeMenuPagi = useMemo(
    () => menuList.find((m) => m.tanggal === selectedDate && m.shift === 'pagi') || null,
    [menuList, selectedDate]
  );
  const activeMenuSore = useMemo(
    () => menuList.find((m) => m.tanggal === selectedDate && m.shift === 'sore') || null,
    [menuList, selectedDate]
  );

  const activeSesiPagi = useMemo(
    () => sesiList.find((s) => s.tanggal === selectedDate && s.shift === 'pagi') || null,
    [sesiList, selectedDate]
  );
  const activeSesiSore = useMemo(
    () => sesiList.find((s) => s.tanggal === selectedDate && s.shift === 'sore') || null,
    [sesiList, selectedDate]
  );

  // Cooking Timeliness Analytics (Selected Month)
  const timelinessStats = useMemo(
    () => computeCookingTimelinessStats(sesiList, selectedMonth),
    [sesiList, selectedMonth]
  );

  // Petugas Analytics & Automated Behavior Analysis (Selected Month)
  const { rekap: petugasRekap, analisis: analisisOtomatis } = useMemo(
    () => computePetugasAnalytics(petugasList, absenList, selectedMonth),
    [petugasList, absenList, selectedMonth]
  );

  // Buku Kas Dapur Running Balance & Summary
  const kasAllChrono = useMemo(() => {
    const sortedAsc = [...kasList].sort((a, b) => {
      if (a.tanggal !== b.tanggal) return a.tanggal < b.tanggal ? -1 : 1;
      return String(a.created_at || '').localeCompare(String(b.created_at || ''));
    });
    const withBalance: Array<DapurKasItem & { saldoBerjalan: number }> = [];
    let saldo = 0;
    for (const item of sortedAsc) {
      const nom = Number(item.nominal || 0);
      saldo += item.jenis === 'masuk' ? nom : -nom;
      withBalance.push({ ...item, saldoBerjalan: saldo });
    }
    return {
      ascWithBalance: withBalance,
      saldoAkhir: saldo,
      totalMasukAll: sortedAsc
        .filter((i) => i.jenis === 'masuk')
        .reduce((s, i) => s + Number(i.nominal || 0), 0),
      totalKeluarAll: sortedAsc
        .filter((i) => i.jenis === 'keluar')
        .reduce((s, i) => s + Number(i.nominal || 0), 0),
    };
  }, [kasList]);

  const kasFiltered = useMemo(() => {
    const q = kasSearch.trim().toLowerCase();
    return [...kasAllChrono.ascWithBalance]
      .reverse()
      .filter((item) => {
        if (kasFilterPeriode === 'bulan_ini' && selectedMonth && !item.tanggal.startsWith(selectedMonth)) {
          return false;
        }
        if (kasFilterJenis !== 'semua' && item.jenis !== kasFilterJenis) return false;
        if (q) {
          const hay = `${item.uraian} ${item.kategori} ${item.penanggung_jawab} ${item.catatan}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      });
  }, [kasAllChrono.ascWithBalance, kasFilterPeriode, selectedMonth, kasFilterJenis, kasSearch]);

  const kasPeriodeSummary = useMemo(() => {
    let masuk = 0;
    let keluar = 0;
    for (const item of kasFiltered) {
      if (item.jenis === 'masuk') masuk += Number(item.nominal || 0);
      else keluar += Number(item.nominal || 0);
    }
    return { masuk, keluar };
  }, [kasFiltered]);

  // 2 Pembukuan Terhubung: Buku 1 (Dompet Belanja Masak Harian) & Buku 2 (Kas Jualan Malam)
  const bukuMasakSummary = useMemo(
    () => computeBukuMasakSummary(bukuMasakList, selectedDate),
    [bukuMasakList, selectedDate]
  );

  const jualanMalamSummary = useMemo(
    () => computeJualanMalamSummary(jualanMalamList, selectedDate),
    [jualanMalamList, selectedDate]
  );

  const bukuMasakDisplay = useMemo(
    () =>
      [...bukuMasakSummary.ascWithBalance]
        .reverse()
        .filter((item) => (!selectedMonth ? true : item.tanggal.startsWith(selectedMonth))),
    [bukuMasakSummary.ascWithBalance, selectedMonth]
  );

  const jualanMalamDisplay = useMemo(
    () =>
      [...jualanMalamSummary.ascWithBalance]
        .reverse()
        .filter((item) => (!selectedMonth ? true : item.tanggal.startsWith(selectedMonth))),
    [jualanMalamSummary.ascWithBalance, selectedMonth]
  );

  // =========================================================
  // HANDLERS TAB 1: MULAI / SELESAI MEMASAK REAL-TIME
  // =========================================================
  const handleStartCooking = async (shift: DapurShift) => {
    if (!selectedDate) return;
    setSaving(true);
    try {
      const nowIso = new Date().toISOString();
      const linkedMenu = shift === 'pagi' ? activeMenuPagi : activeMenuSore;
      const existing = shift === 'pagi' ? activeSesiPagi : activeSesiSore;
      const menuText = linkedMenu
        ? [linkedMenu.menu_utama, linkedMenu.sayur_pendamping, linkedMenu.lauk_tambahan]
            .filter(Boolean)
            .join(' + ')
        : existing?.menu_ringkas || '';

      const nextItem: DapurSesiMasak = {
        id: existing?.id || createDapurId('sesi'),
        tanggal: selectedDate,
        shift,
        target_selesai: SHIFT_TARGET_TIME[shift],
        started_at: nowIso,
        finished_at: null,
        durasi_menit: 0,
        status_waktu: 'sedang_masak',
        selisih_menit: 0,
        menu_ringkas: menuText,
        petugas_pj: existing?.petugas_pj || '',
        catatan: existing?.catatan || '',
        created_at: existing?.created_at || nowIso,
      };

      const nextList = [nextItem, ...sesiList.filter((s) => s.id !== nextItem.id)];
      setSesiList(nextList);
      await persistUpsert('dapur_sesi_masak', LS_DAPUR_SESI_KEY, nextList, nextItem);
      showToast(
        'info',
        `Masak ${shift === 'pagi' ? 'Pagi' : 'Sore'} Dimulai`,
        `Waktu mulai tercatat pukul ${formatTimeClock(nowIso)} WIB. Batas matang ${SHIFT_TARGET_TIME[shift]} WIB.`
      );
    } finally {
      setSaving(false);
    }
  };

  const handleFinishCooking = async (shift: DapurShift) => {
    const existing = shift === 'pagi' ? activeSesiPagi : activeSesiSore;
    if (!existing || !existing.started_at) return;
    setSaving(true);
    try {
      const finishedIso = new Date().toISOString();
      const evalResult = evaluateCookingCompletion(
        existing.tanggal,
        shift,
        existing.started_at,
        finishedIso
      );

      const nextItem: DapurSesiMasak = {
        ...existing,
        finished_at: finishedIso,
        target_selesai: evalResult.target_selesai,
        durasi_menit: evalResult.durasi_menit,
        status_waktu: evalResult.status_waktu,
        selisih_menit: evalResult.selisih_menit,
      };

      const nextList = [nextItem, ...sesiList.filter((s) => s.id !== nextItem.id)];
      setSesiList(nextList);
      await persistUpsert('dapur_sesi_masak', LS_DAPUR_SESI_KEY, nextList, nextItem);

      const isOnTime = evalResult.status_waktu === 'tepat_waktu';
      showToast(
        isOnTime ? 'success' : 'error',
        isOnTime
          ? `Masak ${shift === 'pagi' ? 'Pagi' : 'Sore'} Tepat Waktu`
          : `Masak ${shift === 'pagi' ? 'Pagi' : 'Sore'} Terlambat +${evalResult.selisih_menit} Menit`,
        `Selesai pukul ${formatTimeClock(finishedIso)} WIB (Durasi ${evalResult.durasi_menit} menit).`
      );
    } finally {
      setSaving(false);
    }
  };

  const openEditSesiModal = (sesi: DapurSesiMasak) => {
    setEditingSesi(sesi);
    setSesiMenuInput(sesi.menu_ringkas || '');
    setSesiPjInput(sesi.petugas_pj || '');
    setSesiCatatanInput(sesi.catatan || '');
  };

  const handleSaveEditSesi = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSesi) return;
    setSaving(true);
    try {
      // Waktu mulai, waktu selesai, durasi, dan status ketepatan terkunci permanen (immutable)
      const nextItem: DapurSesiMasak = {
        ...editingSesi,
        menu_ringkas: sesiMenuInput.trim(),
        petugas_pj: sesiPjInput.trim(),
        catatan: sesiCatatanInput.trim(),
      };

      const nextList = [nextItem, ...sesiList.filter((s) => s.id !== nextItem.id)];
      setSesiList(nextList);
      await persistUpsert('dapur_sesi_masak', LS_DAPUR_SESI_KEY, nextList, nextItem);
      setEditingSesi(null);
      showToast('success', 'Catatan Sesi Disimpan', 'Menu ringkas, PJ, dan catatan sesi berhasil diperbarui.');
    } finally {
      setSaving(false);
    }
  };

  // =========================================================
  // HANDLERS TAB 2: JADWAL HARIAN MENU
  // =========================================================
  const weekDays = useMemo(
    () => (selectedDate ? getWeekRangeMondayToSunday(selectedDate) : []),
    [selectedDate]
  );

  const openMenuModal = (tanggal: string, shift: DapurShift, existing?: DapurMenuJadwal | null) => {
    setEditingMenuId(existing?.id || null);
    setMenuFormTanggal(tanggal);
    setMenuFormShift(shift);
    setMenuFormUtama(existing?.menu_utama || '');
    setMenuFormSayur(existing?.sayur_pendamping || '');
    setMenuFormLauk(existing?.lauk_tambahan || '');
    setMenuFormPorsi(String(existing?.estimasi_porsi || 250));
    setMenuFormCatatan(existing?.catatan_belanja || '');
    setShowMenuModal(true);
  };

  const handleSaveMenu = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!menuFormUtama.trim()) {
      showToast('error', 'Validasi Menu', 'Menu utama wajib diisi.');
      return;
    }
    setSaving(true);
    try {
      const existingBySlot = menuList.find(
        (m) => m.tanggal === menuFormTanggal && m.shift === menuFormShift
      );
      const id = editingMenuId || existingBySlot?.id || createDapurId('menu');
      const nextItem: DapurMenuJadwal = {
        id,
        tanggal: menuFormTanggal,
        shift: menuFormShift,
        menu_utama: menuFormUtama.trim(),
        sayur_pendamping: menuFormSayur.trim(),
        lauk_tambahan: menuFormLauk.trim(),
        estimasi_porsi: Math.max(1, parseInt(menuFormPorsi || '250', 10) || 250),
        catatan_belanja: menuFormCatatan.trim(),
        created_at: existingBySlot?.created_at || new Date().toISOString(),
      };
      const nextList = [...menuList.filter((m) => m.id !== id), nextItem];
      setMenuList(nextList);
      await persistUpsert('dapur_menu_jadwal', LS_DAPUR_MENU_KEY, nextList, nextItem);
      setShowMenuModal(false);
      showToast('success', 'Jadwal Menu Tersimpan', `Menu ${menuFormShift} untuk ${formatTanggalPendek(menuFormTanggal)} diperbarui.`);
    } finally {
      setSaving(false);
    }
  };

  const handleCopyLastWeekMenu = async () => {
    if (weekDays.length !== 7) return;
    let copiedCount = 0;
    const nextList = [...menuList];
    const itemsToSync: DapurMenuJadwal[] = [];

    for (const targetDay of weekDays) {
      const prevWeekDay = addDaysIso(targetDay, -7);
      for (const shift of ['pagi', 'sore'] as DapurShift[]) {
        const already = nextList.find((m) => m.tanggal === targetDay && m.shift === shift);
        const source = menuList.find((m) => m.tanggal === prevWeekDay && m.shift === shift);
        if (!already && source) {
          const cloned: DapurMenuJadwal = {
            ...source,
            id: createDapurId('menu'),
            tanggal: targetDay,
            created_at: new Date().toISOString(),
          };
          nextList.push(cloned);
          itemsToSync.push(cloned);
          copiedCount += 1;
        }
      }
    }

    if (copiedCount === 0) {
      showToast(
        'info',
        'Tidak Ada Slot Disalin',
        'Menu minggu sebelumnya kosong atau jadwal minggu ini sudah terisi penuh.'
      );
      return;
    }

    setSaving(true);
    try {
      setMenuList(nextList);
      writeLocalArray(LS_DAPUR_MENU_KEY, nextList);
      for (const item of itemsToSync) {
        await persistUpsert('dapur_menu_jadwal', LS_DAPUR_MENU_KEY, nextList, item);
      }
      showToast('success', 'Pola Menu Disalin', `${copiedCount} jadwal menu dari minggu lalu disalin ke minggu ini.`);
    } finally {
      setSaving(false);
    }
  };

  const handleCopyMenuWa = async () => {
    const lines: string[] = [
      `*JADWAL MENU DAPUR e-PONDOK AN-NUR 1*`,
      `Minggu: ${formatTanggalPendek(weekDays[0])} - ${formatTanggalPendek(weekDays[6])}`,
      ``,
    ];
    for (const day of weekDays) {
      const p = menuList.find((m) => m.tanggal === day && m.shift === 'pagi');
      const s = menuList.find((m) => m.tanggal === day && m.shift === 'sore');
      lines.push(`*${formatHariTanggalIndo(day)}*`);
      lines.push(
        `- Pagi (05:45): ${
          p
            ? [p.menu_utama, p.sayur_pendamping, p.lauk_tambahan].filter(Boolean).join(' + ')
            : '_Belum dijadwalkan_'
        }`
      );
      lines.push(
        `- Sore (16:45): ${
          s
            ? [s.menu_utama, s.sayur_pendamping, s.lauk_tambahan].filter(Boolean).join(' + ')
            : '_Belum dijadwalkan_'
        }`
      );
      lines.push('');
    }
    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      showToast('success', 'Jadwal Menu Disalin', 'Format pesan WhatsApp jadwal menu mingguan siap ditempel.');
    } catch {
      showToast('error', 'Gagal Menyalin', 'Browser memblokir akses clipboard.');
    }
  };

  // =========================================================
  // HANDLERS TAB 3: PETUGAS & ABSENSI + ANALISIS OTOMATIS
  // =========================================================
  const handleAddLocalPetugas = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPetugasNama.trim()) {
      showToast('error', 'Validasi', 'Nama petugas wajib diisi.');
      return;
    }
    setSaving(true);
    try {
      const nextItem: DapurPetugas = {
        id: createDapurId('ptg'),
        nama: newPetugasNama.trim(),
        divisi: 'Sie Konsumsi / Dapur',
        jabatan: newPetugasJabatan.trim() || 'Petugas Dapur',
        no_wa: newPetugasWa.trim(),
        sumber: 'lokal',
        aktif: true,
        created_at: new Date().toISOString(),
      };
      const nextList = [...petugasList, nextItem].sort((a, b) => a.nama.localeCompare(b.nama));
      setPetugasList(nextList);
      await persistUpsert('dapur_petugas', LS_DAPUR_PETUGAS_KEY, nextList, nextItem);
      setNewPetugasNama('');
      setNewPetugasWa('');
      showToast('success', 'Petugas Ditambahkan', `${nextItem.nama} masuk ke daftar piket dapur.`);
    } finally {
      setSaving(false);
    }
  };

  const handleImportPengurus = async (p: PengurusSourceRow) => {
    const exists = petugasList.some(
      (item) => item.nama.toLowerCase() === p.nama_lengkap.toLowerCase()
    );
    if (exists) {
      showToast('info', 'Sudah Terdaftar', `${p.nama_lengkap} sudah ada di daftar petugas dapur.`);
      return;
    }
    setSaving(true);
    try {
      const utamaJab = p.jabatan_list?.find((j) => j.is_utama) || p.jabatan_list?.[0];
      const nextItem: DapurPetugas = {
        id: `pg-${p.id}`,
        nama: p.nama_lengkap,
        divisi: utamaJab?.divisi || 'Pengurus Pondok',
        jabatan: utamaJab?.nama_jabatan || 'Petugas Dapur',
        no_wa: p.no_wa || '',
        sumber: 'pengurus',
        aktif: true,
        created_at: new Date().toISOString(),
      };
      const nextList = [...petugasList, nextItem].sort((a, b) => a.nama.localeCompare(b.nama));
      setPetugasList(nextList);
      await persistUpsert('dapur_petugas', LS_DAPUR_PETUGAS_KEY, nextList, nextItem);
      showToast('success', 'Pengurus Disinkronkan', `${nextItem.nama} ditambahkan ke roster dapur.`);
    } finally {
      setSaving(false);
    }
  };

  const handleMarkAbsen = async (
    petugas: DapurPetugas,
    shift: DapurShift,
    status: StatusAbsenPetugas
  ) => {
    if (!selectedDate) return;
    const nowTime = formatTimeClock(new Date().toISOString(), false);
    const existing = absenList.find(
      (a) => a.tanggal === selectedDate && a.shift === shift && a.petugas_id === petugas.id
    );
    const nextItem: DapurAbsenPetugas = {
      id: existing?.id || createDapurId('abs'),
      tanggal: selectedDate,
      shift,
      petugas_id: petugas.id,
      petugas_nama: petugas.nama,
      status,
      jam_catat: nowTime,
      keterangan: existing?.keterangan || '',
      created_at: existing?.created_at || new Date().toISOString(),
    };
    const nextList = [nextItem, ...absenList.filter((a) => a.id !== nextItem.id)];
    setAbsenList(nextList);
    await persistUpsert('dapur_absen_petugas', LS_DAPUR_ABSEN_KEY, nextList, nextItem);
  };

  const handleMarkAllHadir = async (shift: DapurShift) => {
    if (!selectedDate || petugasList.length === 0) return;
    const nowTime = formatTimeClock(new Date().toISOString(), false);
    setSaving(true);
    try {
      let nextList = [...absenList];
      const updatedItems: DapurAbsenPetugas[] = [];
      for (const p of petugasList.filter((x) => x.aktif !== false)) {
        const existing = nextList.find(
          (a) => a.tanggal === selectedDate && a.shift === shift && a.petugas_id === p.id
        );
        const item: DapurAbsenPetugas = {
          id: existing?.id || createDapurId('abs'),
          tanggal: selectedDate,
          shift,
          petugas_id: p.id,
          petugas_nama: p.nama,
          status: 'hadir',
          jam_catat: nowTime,
          keterangan: existing?.keterangan || '',
          created_at: existing?.created_at || new Date().toISOString(),
        };
        nextList = [item, ...nextList.filter((a) => a.id !== item.id)];
        updatedItems.push(item);
      }
      setAbsenList(nextList);
      writeLocalArray(LS_DAPUR_ABSEN_KEY, nextList);
      for (const item of updatedItems) {
        await persistUpsert('dapur_absen_petugas', LS_DAPUR_ABSEN_KEY, nextList, item);
      }
      showToast(
        'success',
        `Semua Hadir (${shift === 'pagi' ? 'Pagi' : 'Sore'})`,
        `${updatedItems.length} petugas ditandai Hadir.`
      );
    } finally {
      setSaving(false);
    }
  };

  const handleSaveKeteranganAbsen = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingKetTarget || !selectedDate) return;
    const { petugas, shift } = editingKetTarget;
    const existing = absenList.find(
      (a) => a.tanggal === selectedDate && a.shift === shift && a.petugas_id === petugas.id
    );
    const nextItem: DapurAbsenPetugas = {
      id: existing?.id || createDapurId('abs'),
      tanggal: selectedDate,
      shift,
      petugas_id: petugas.id,
      petugas_nama: petugas.nama,
      status: existing?.status || 'izin',
      jam_catat: existing?.jam_catat || formatTimeClock(new Date().toISOString(), false),
      keterangan: ketInput.trim(),
      created_at: existing?.created_at || new Date().toISOString(),
    };
    const nextList = [nextItem, ...absenList.filter((a) => a.id !== nextItem.id)];
    setAbsenList(nextList);
    await persistUpsert('dapur_absen_petugas', LS_DAPUR_ABSEN_KEY, nextList, nextItem);
    setEditingKetTarget(null);
    showToast('success', 'Keterangan Disimpan', `Catatan untuk ${petugas.nama} diperbarui.`);
  };

  const handleCopyAnalitikWa = async () => {
    const text = buildAnalitikPetugasWaText(
      formatMonthLabel(selectedMonth),
      timelinessStats,
      analisisOtomatis,
      petugasRekap
    );
    try {
      await navigator.clipboard.writeText(text);
      showToast(
        'success',
        'Laporan Disiplin Disalin',
        'Ringkasan ketepatan masak & analisis otomatis petugas siap ditempel ke WhatsApp.'
      );
    } catch {
      showToast('error', 'Gagal Menyalin', 'Browser memblokir akses clipboard.');
    }
  };

  // =========================================================
  // HANDLERS TAB 4: BUKU 1 (BELANJA MASAK) & BUKU 2 (JUALAN MALAM)
  // =========================================================
  const openBuku1Modal = (tipe: 'jatah_harian' | 'belanja_pagi' | 'belanja_sore') => {
    if (!canEditDapur) return;
    setBuku1Tipe(tipe);
    setBuku1Tanggal(selectedDate || todayStr);
    setBuku1Nominal(tipe === 'jatah_harian' ? String(DEFAULT_JATAH_MASAK_HARIAN) : '');
    setBuku1Uraian(
      tipe === 'jatah_harian'
        ? `Jatah Belanja Masak Harian (${formatTanggalPendek(selectedDate || todayStr)})`
        : tipe === 'belanja_pagi'
        ? 'Belanja Bahan Masak Pagi'
        : 'Belanja Bahan Masak Sore'
    );
    setBuku1Pj(pengurus?.nama_lengkap || 'Sie Dapur');
    setBuku1Catatan('');
    setShowBuku1Modal(true);
  };

  const handleSaveBuku1 = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEditDapur) return;
    const nom = parseInt(buku1Nominal.replace(/\D/g, ''), 10) || 0;
    if (!buku1Uraian.trim() || nom <= 0) {
      showToast('error', 'Validasi', 'Uraian dan nominal (> 0) wajib diisi.');
      return;
    }
    setSaving(true);
    try {
      const nextItem: DapurBukuMasakItem = {
        id: createDapurId('bmasak'),
        tanggal: buku1Tanggal || selectedDate || todayStr,
        tipe: buku1Tipe,
        arah: buku1Tipe === 'jatah_harian' ? 'masuk' : 'keluar',
        nominal: nom,
        uraian: buku1Uraian.trim(),
        penanggung_jawab: buku1Pj.trim() || 'Sie Dapur',
        catatan: buku1Catatan.trim(),
        created_at: new Date().toISOString(),
      };
      const nextList = [nextItem, ...bukuMasakList];
      setBukuMasakList(nextList);
      await persistUpsert('dapur_buku_masak', LS_DAPUR_BUKU_MASAK_KEY, nextList, nextItem);
      setShowBuku1Modal(false);
      showToast(
        'success',
        buku1Tipe === 'jatah_harian' ? 'Jatah Harian Diterima' : 'Belanja Masak Dicatat',
        `${nextItem.uraian} (${formatRupiah(nom)}) masuk ke Buku 1 Dompet Belanja Masak.`
      );
    } finally {
      setSaving(false);
    }
  };

  const openBuku2Modal = (tipe: 'omzet_jualan' | 'modal_belanja') => {
    if (!canEditDapur) return;
    setBuku2Tipe(tipe);
    setBuku2Tanggal(selectedDate || todayStr);
    setBuku2Nominal('');
    setBuku2Uraian(
      tipe === 'omzet_jualan'
        ? `Omzet Jualan Malam Dapur (${formatTanggalPendek(selectedDate || todayStr)})`
        : 'Belanja Modal / Bahan Jualan Malam'
    );
    setBuku2Pj(pengurus?.nama_lengkap || 'Sie Dapur');
    setBuku2Catatan('');
    setShowBuku2Modal(true);
  };

  const handleSaveBuku2 = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEditDapur) return;
    const nom = parseInt(buku2Nominal.replace(/\D/g, ''), 10) || 0;
    if (!buku2Uraian.trim() || nom <= 0) {
      showToast('error', 'Validasi', 'Uraian dan nominal (> 0) wajib diisi.');
      return;
    }
    setSaving(true);
    try {
      const nextItem: DapurJualanMalamItem = {
        id: createDapurId('bjual'),
        tanggal: buku2Tanggal || selectedDate || todayStr,
        tipe: buku2Tipe,
        arah: buku2Tipe === 'omzet_jualan' ? 'masuk' : 'keluar',
        nominal: nom,
        uraian: buku2Uraian.trim(),
        penanggung_jawab: buku2Pj.trim() || 'Sie Dapur',
        catatan: buku2Catatan.trim(),
        created_at: new Date().toISOString(),
      };
      const nextList = [nextItem, ...jualanMalamList];
      setJualanMalamList(nextList);
      await persistUpsert('dapur_jualan_malam', LS_DAPUR_JUALAN_MALAM_KEY, nextList, nextItem);
      setShowBuku2Modal(false);
      showToast(
        'success',
        buku2Tipe === 'omzet_jualan' ? 'Omzet Jualan Malam Tercatat' : 'Modal Jualan Malam Tercatat',
        `${nextItem.uraian} (${formatRupiah(nom)}) tersimpan di Buku 2 Kas Jualan Malam.`
      );
    } finally {
      setSaving(false);
    }
  };

  const openSubsidiModal = () => {
    if (!canEditDapur) return;
    if (!bukuMasakSummary.isMinus) {
      showToast(
        'info',
        'Tidak Perlu Subsidi',
        'Saldo Dompet Belanja Masak Harian masih aman (tidak minus). Dana Kas Jualan Malam tetap utuh.'
      );
      return;
    }
    if (jualanMalamSummary.saldoAkhir <= 0) {
      showToast('error', 'Saldo Jualan Malam Kosong', 'Saldo Kas Jualan Malam belum mencukupi untuk menutup kekurangan.');
      return;
    }
    const defaultAmount = Math.min(bukuMasakSummary.kekurangan, jualanMalamSummary.saldoAkhir);
    setSubsidiNominal(String(defaultAmount));
    setSubsidiCatatan(`Tutup kekurangan Dompet Belanja Masak (${formatTanggalPendek(selectedDate || todayStr)})`);
    setShowSubsidiModal(true);
  };

  const handleConfirmSubsidi = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEditDapur) return;
    if (!bukuMasakSummary.isMinus) return;

    const nom = parseInt(subsidiNominal.replace(/\D/g, ''), 10) || 0;
    if (nom <= 0) {
      showToast('error', 'Validasi', 'Nominal subsidi harus lebih dari Rp 0.');
      return;
    }
    if (nom > jualanMalamSummary.saldoAkhir) {
      showToast('error', 'Saldo Tidak Cukup', 'Nominal melebihi saldo Kas Jualan Malam yang tersedia.');
      return;
    }

    setSaving(true);
    try {
      const nowIso = new Date().toISOString();
      const tgl = selectedDate || todayStr || getLocalTodayStr();
      const pjName = pengurus?.nama_lengkap || 'Sie Dapur';
      const masakId = createDapurId('bmasak');
      const jualId = createDapurId('bjual');

      const buku1Item: DapurBukuMasakItem = {
        id: masakId,
        tanggal: tgl,
        tipe: 'subsidi_jualan_malam',
        arah: 'masuk',
        nominal: nom,
        uraian: 'Subsidi dari Kas Jualan Malam Dapur',
        penanggung_jawab: pjName,
        catatan: subsidiCatatan.trim(),
        created_at: nowIso,
      };

      const buku2Item: DapurJualanMalamItem = {
        id: jualId,
        tanggal: tgl,
        tipe: 'subsidi_ke_masak',
        arah: 'keluar',
        nominal: nom,
        uraian: 'Penarikan Subsidi Tutup Kekurangan Belanja Masak',
        penanggung_jawab: pjName,
        catatan: subsidiCatatan.trim(),
        linked_masak_id: masakId,
        created_at: nowIso,
      };

      const nextBuku1 = [buku1Item, ...bukuMasakList];
      const nextBuku2 = [buku2Item, ...jualanMalamList];
      setBukuMasakList(nextBuku1);
      setJualanMalamList(nextBuku2);

      await persistUpsert('dapur_buku_masak', LS_DAPUR_BUKU_MASAK_KEY, nextBuku1, buku1Item);
      await persistUpsert('dapur_jualan_malam', LS_DAPUR_JUALAN_MALAM_KEY, nextBuku2, buku2Item);

      setShowSubsidiModal(false);
      showToast(
        'success',
        'Kekurangan Ditutup Otomatis',
        `${formatRupiah(nom)} dipindahkan dari Buku 2 (Kas Jualan Malam) untuk menyeimbangkan Buku 1 (Belanja Masak).`
      );
    } finally {
      setSaving(false);
    }
  };

  // =========================================================
  // HANDLERS TAB 4 LEGACY: BUKU KAS DAPUR
  // =========================================================
  const openKasModal = (jenis: JenisKasDapur, item?: DapurKasItem) => {
    setEditingKas(item || null);
    setKasFormTanggal(item?.tanggal || selectedDate || todayStr);
    const j = item?.jenis || jenis;
    setKasFormJenis(j);
    setKasFormKategori(
      item?.kategori || (j === 'masuk' ? KATEGORI_KAS_MASUK[0] : KATEGORI_KAS_KELUAR[0])
    );
    setKasFormUraian(item?.uraian || '');
    setKasFormNominal(item ? String(item.nominal) : '');
    setKasFormPj(item?.penanggung_jawab || '');
    setKasFormCatatan(item?.catatan || '');
    setShowKasModal(true);
  };

  const handleSaveKas = async (e: React.FormEvent) => {
    e.preventDefault();
    const nom = parseInt(kasFormNominal.replace(/\D/g, ''), 10) || 0;
    if (!kasFormUraian.trim() || nom <= 0) {
      showToast('error', 'Validasi Kas', 'Uraian transaksi dan nominal (> 0) wajib diisi.');
      return;
    }
    setSaving(true);
    try {
      const id = editingKas?.id || createDapurId('kas');
      const nextItem: DapurKasItem = {
        id,
        tanggal: kasFormTanggal || selectedDate || todayStr,
        jenis: kasFormJenis,
        kategori: kasFormKategori,
        uraian: kasFormUraian.trim(),
        nominal: nom,
        penanggung_jawab: kasFormPj.trim() || 'Sie Dapur',
        catatan: kasFormCatatan.trim(),
        created_at: editingKas?.created_at || new Date().toISOString(),
      };
      const nextList = [nextItem, ...kasList.filter((k) => k.id !== id)];
      setKasList(nextList);
      await persistUpsert('dapur_kas', LS_DAPUR_KAS_KEY, nextList, nextItem);
      setShowKasModal(false);
      showToast(
        'success',
        kasFormJenis === 'masuk' ? 'Uang Masuk Dicatat' : 'Belanja Dapur Dicatat',
        `${nextItem.uraian} (${formatRupiah(nom)}) tersimpan di Buku Kas Dapur.`
      );
    } finally {
      setSaving(false);
    }
  };

  // Unified Delete Executor
  const handleConfirmDelete = async () => {
    if (!deleteDialog) return;
    setSaving(true);
    try {
      if (deleteDialog.kind === 'menu') {
        const next = menuList.filter((m) => m.id !== deleteDialog.id);
        setMenuList(next);
        await persistDelete('dapur_menu_jadwal', LS_DAPUR_MENU_KEY, next, deleteDialog.id);
      } else if (deleteDialog.kind === 'petugas') {
        const next = petugasList.filter((p) => p.id !== deleteDialog.id);
        setPetugasList(next);
        await persistDelete('dapur_petugas', LS_DAPUR_PETUGAS_KEY, next, deleteDialog.id);
      } else if (deleteDialog.kind === 'kas') {
        const next = kasList.filter((k) => k.id !== deleteDialog.id);
        setKasList(next);
        await persistDelete('dapur_kas', LS_DAPUR_KAS_KEY, next, deleteDialog.id);
      } else if (deleteDialog.kind === 'buku_masak') {
        const next = bukuMasakList.filter((b) => b.id !== deleteDialog.id);
        setBukuMasakList(next);
        await persistDelete('dapur_buku_masak', LS_DAPUR_BUKU_MASAK_KEY, next, deleteDialog.id);
      } else if (deleteDialog.kind === 'jualan_malam') {
        const next = jualanMalamList.filter((b) => b.id !== deleteDialog.id);
        setJualanMalamList(next);
        await persistDelete('dapur_jualan_malam', LS_DAPUR_JUALAN_MALAM_KEY, next, deleteDialog.id);
      }
      showToast('info', 'Data Dihapus', `${deleteDialog.label} telah dihapus.`);
      setDeleteDialog(null);
    } finally {
      setSaving(false);
    }
  };

  // Excel Exports
  const handleExportSesiExcel = () => {
    const rows = sesiList
      .filter((s) => (!selectedMonth ? true : s.tanggal.startsWith(selectedMonth)))
      .map((s, i) => ({
        No: i + 1,
        Tanggal: s.tanggal,
        Shift: s.shift === 'pagi' ? 'Pagi (05:45)' : 'Sore (16:45)',
        Menu: s.menu_ringkas || '-',
        Mulai: formatTimeClock(s.started_at),
        Selesai: formatTimeClock(s.finished_at),
        'Durasi (Menit)': s.durasi_menit,
        Status:
          s.status_waktu === 'tepat_waktu'
            ? 'Tepat Waktu'
            : s.status_waktu === 'terlambat'
            ? `Terlambat +${s.selisih_menit} mnt`
            : s.status_waktu,
        PJ: s.petugas_pj || '-',
        Catatan: s.catatan || '-',
      }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Ketepatan Masak');
    XLSX.writeFile(wb, `Dapur_Ketepatan_Masak_${selectedMonth || 'Semua'}.xlsx`);
  };

  const handleExportAbsenExcel = () => {
    const rows = petugasRekap.map((r, i) => ({
      No: i + 1,
      'Nama Petugas': r.nama,
      Jabatan: r.jabatan,
      'Total Sesi': r.totalTercatat,
      'Hadir Pagi': r.hadirPagi,
      'Jadwal Pagi': r.totalPagiTercatat,
      '% Pagi': r.persenHadirPagi !== null ? `${r.persenHadirPagi}%` : '-',
      'Hadir Sore': r.hadirSore,
      'Jadwal Sore': r.totalSoreTercatat,
      '% Sore': r.persenHadirSore !== null ? `${r.persenHadirSore}%` : '-',
      Izin: r.izin,
      Sakit: r.sakit,
      Alpha: r.alpha,
      '% Hadir Total': r.persenHadirTotal !== null ? `${r.persenHadirTotal}%` : '-',
      'Analisis Dominansi': r.dominansi,
      'Status Disiplin': r.statusDisiplin,
      Keterangan: r.alasanPembinaan.join('; ') || '-',
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Rekap Petugas Dapur');
    XLSX.writeFile(wb, `Dapur_Rekap_Petugas_${selectedMonth || 'Semua'}.xlsx`);
  };

  const handleExportKasExcel = () => {
    const rows = kasFiltered.map((k, i) => ({
      No: i + 1,
      Tanggal: k.tanggal,
      Jenis: k.jenis === 'masuk' ? 'Uang Masuk' : 'Pengeluaran Belanja',
      Kategori: k.kategori,
      Uraian: k.uraian,
      Nominal: k.nominal,
      'Saldo Berjalan': k.saldoBerjalan,
      'Penanggung Jawab': k.penanggung_jawab || '-',
      Catatan: k.catatan || '-',
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Buku Kas Dapur');
    XLSX.writeFile(wb, `Buku_Kas_Dapur_${selectedMonth || 'Semua'}.xlsx`);
  };

  // Filtered Session History
  const riwayatSesiFiltered = useMemo(() => {
    return sesiList.filter((s) => {
      if (selectedMonth && !s.tanggal.startsWith(selectedMonth)) return false;
      if (riwayatFilterShift !== 'semua' && s.shift !== riwayatFilterShift) return false;
      if (riwayatFilterStatus !== 'semua' && s.status_waktu !== riwayatFilterStatus) return false;
      return true;
    });
  }, [sesiList, selectedMonth, riwayatFilterShift, riwayatFilterStatus]);

  // Filtered Petugas Roster for Daily Attendance
  const rosterFiltered = useMemo(() => {
    const q = absenSearch.trim().toLowerCase();
    return petugasList.filter((p) => {
      if (p.aktif === false) return false;
      if (q && !`${p.nama} ${p.jabatan}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [petugasList, absenSearch]);

  // Helper to render Real-time Shift Card
  const renderShiftTimerCard = (
    shift: DapurShift,
    sesi: DapurSesiMasak | null,
    menu: DapurMenuJadwal | null
  ) => {
    const isPagi = shift === 'pagi';
    const targetLabel = SHIFT_TARGET_TIME[shift];
    const deadlineMs = selectedDate ? getShiftDeadlineDate(selectedDate, shift).getTime() : 0;

    const status = sesi?.status_waktu || 'belum_mulai';
    const isRunning = status === 'sedang_masak' && Boolean(sesi?.started_at);
    const isDone = status === 'tepat_waktu' || status === 'terlambat';

    const elapsedSec =
      isRunning && sesi?.started_at && nowMs > 0
        ? Math.max(0, Math.floor((nowMs - new Date(sesi.started_at).getTime()) / 1000))
        : 0;

    const diffToDeadlineSec =
      deadlineMs > 0 && nowMs > 0 ? Math.floor((deadlineMs - nowMs) / 1000) : 0;
    const isTodaySelected = Boolean(todayStr && selectedDate === todayStr);

    return (
      <div
        className={`rounded-2xl border p-4 sm:p-5 bg-white flex flex-col justify-between gap-4 ${
          status === 'sedang_masak'
            ? 'border-amber-300 ring-1 ring-amber-200'
            : status === 'tepat_waktu'
            ? 'border-emerald-300'
            : status === 'terlambat'
            ? 'border-rose-300'
            : 'border-slate-200'
        }`}
      >
        <div className="space-y-3">
          {/* Card Header */}
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <div
                className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                  isPagi
                    ? 'bg-amber-50 text-amber-600 border border-amber-200'
                    : 'bg-indigo-50 text-indigo-600 border border-indigo-200'
                }`}
              >
                {isPagi ? <Sun className="w-5 h-5" /> : <Sunset className="w-5 h-5" />}
              </div>
              <div className="min-w-0">
                <h3 className="font-bold text-base text-slate-900 leading-tight">
                  Masak Shift {isPagi ? 'Pagi' : 'Sore'}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5 tabular-nums">
                  Batas matang maksimal pukul{' '}
                  <strong className="text-slate-800">{targetLabel} WIB</strong>
                </p>
              </div>
            </div>

            <span
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border whitespace-nowrap shrink-0 ${
                status === 'tepat_waktu'
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : status === 'terlambat'
                  ? 'bg-rose-50 text-rose-700 border-rose-200'
                  : status === 'sedang_masak'
                  ? 'bg-amber-50 text-amber-700 border-amber-200'
                  : 'bg-slate-100 text-slate-600 border-slate-200'
              }`}
            >
              {status === 'tepat_waktu'
                ? 'Tepat Waktu'
                : status === 'terlambat'
                ? `Terlambat +${sesi?.selisih_menit || 0} mnt`
                : status === 'sedang_masak'
                ? 'Sedang Memasak'
                : 'Belum Dimulai'}
            </span>
          </div>

          {/* Menu Preview */}
          <div className="px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs">
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold text-slate-500">Menu Terjadwal:</span>
              {canEditDapur && (
                <button
                  type="button"
                  onClick={() => openMenuModal(selectedDate, shift, menu)}
                  className="text-[11px] font-semibold text-emerald-700 hover:underline whitespace-nowrap shrink-0"
                >
                  {menu ? 'Ubah Menu' : '+ Atur Menu'}
                </button>
              )}
            </div>
            <p className="font-semibold text-slate-800 mt-1">
              {menu
                ? [menu.menu_utama, menu.sayur_pendamping, menu.lauk_tambahan]
                    .filter(Boolean)
                    .join(' · ')
                : sesi?.menu_ringkas || 'Menu belum dijadwalkan untuk shift ini'}
            </p>
          </div>

          {/* Live Stopwatch & Timestamp Display */}
          <div className="p-4 rounded-xl bg-slate-900 text-white space-y-2.5">
            {isRunning && sesi?.started_at ? (
              <>
                <div className="flex items-center justify-between text-[11px] text-slate-300">
                  <span>Durasi Berjalan (Real-Time)</span>
                  <span className="tabular-nums">Mulai {formatTimeClock(sesi.started_at)} WIB</span>
                </div>
                <div className="text-3xl sm:text-4xl font-extrabold tracking-tight font-mono tabular-nums text-amber-400">
                  {formatElapsedHms(elapsedSec)}
                </div>
                <div className="text-xs font-medium tabular-nums">
                  {isTodaySelected ? (
                    diffToDeadlineSec >= 0 ? (
                      <span className="text-emerald-300">
                        Sisa {Math.floor(diffToDeadlineSec / 60)} menit sebelum batas {targetLabel} WIB
                      </span>
                    ) : (
                      <span className="text-rose-400 font-semibold">
                        Melewati batas {targetLabel} WIB (+
                        {Math.max(1, Math.ceil(Math.abs(diffToDeadlineSec) / 60))} menit)
                      </span>
                    )
                  ) : (
                    <span className="text-slate-300">
                      Sesi aktif tanggal {formatTanggalPendek(selectedDate)}
                    </span>
                  )}
                </div>
              </>
            ) : isDone && sesi ? (
              <>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div>
                    <span className="text-[10px] uppercase tracking-wider text-slate-400 block">
                      Mulai Klik
                    </span>
                    <strong className="font-mono text-sm sm:text-base tabular-nums text-white mt-0.5 block">
                      {formatTimeClock(sesi.started_at)}
                    </strong>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase tracking-wider text-slate-400 block">
                      Matang / Selesai
                    </span>
                    <strong
                      className={`font-mono text-sm sm:text-base tabular-nums mt-0.5 block ${
                        sesi.status_waktu === 'tepat_waktu' ? 'text-emerald-400' : 'text-rose-400'
                      }`}
                    >
                      {formatTimeClock(sesi.finished_at)}
                    </strong>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase tracking-wider text-slate-400 block">
                      Total Durasi
                    </span>
                    <strong className="font-mono text-sm sm:text-base tabular-nums text-amber-300 mt-0.5 block">
                      {sesi.durasi_menit} mnt
                    </strong>
                  </div>
                </div>
                <div className="pt-2 border-t border-slate-800 text-xs flex flex-wrap items-center justify-between gap-2 tabular-nums">
                  <span className="text-slate-300">
                    Target matang: <strong className="text-white">{targetLabel} WIB</strong>
                  </span>
                  <span
                    className={`font-bold ${
                      sesi.status_waktu === 'tepat_waktu' ? 'text-emerald-400' : 'text-rose-400'
                    }`}
                  >
                    {sesi.status_waktu === 'tepat_waktu'
                      ? sesi.selisih_menit < 0
                        ? `Tepat Waktu (${Math.abs(sesi.selisih_menit)} mnt lebih awal)`
                        : 'Tepat Waktu (Pas 00 mnt)'
                      : `Terlambat +${sesi.selisih_menit} menit`}
                  </span>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center justify-between text-[11px] text-slate-300">
                  <span>Status Waktu Masak</span>
                  <span className="tabular-nums">Batas {targetLabel} WIB</span>
                </div>
                <div className="text-2xl sm:text-3xl font-bold font-mono tabular-nums text-slate-400">
                  00:00:00
                </div>
                <div className="text-xs text-slate-300 tabular-nums">
                  {isTodaySelected && nowMs > 0 ? (
                    diffToDeadlineSec >= 0 ? (
                      <span>
                        Klik <strong>Mulai Memasak</strong> untuk mengunci jam mulai sekarang.
                      </span>
                    ) : (
                      <span className="text-rose-400">
                        Saat ini sudah melewati {targetLabel} WIB — klik Mulai jika masih memasak.
                      </span>
                    )
                  ) : (
                    <span>Klik tombol Mulai saat kompor/masakan mulai dikerjakan.</span>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        {canEditDapur && (
          <div className="flex flex-wrap items-center gap-2 pt-1">
            {!isRunning && !isDone && (
              <button
                type="button"
                disabled={saving || !selectedDate}
                onClick={() => handleStartCooking(shift)}
                className="flex-1 min-h-[48px] px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold text-sm rounded-xl shadow-xs transition-colors flex items-center justify-center gap-2 whitespace-nowrap"
              >
                <Play className="w-4 h-4 fill-current shrink-0" />
                Mulai Memasak {isPagi ? 'Pagi' : 'Sore'}
              </button>
            )}

            {isRunning && (
              <button
                type="button"
                disabled={saving}
                onClick={() => handleFinishCooking(shift)}
                className="flex-1 min-h-[48px] px-4 py-2.5 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-slate-950 font-bold text-sm rounded-xl shadow-xs transition-colors flex items-center justify-center gap-2 whitespace-nowrap"
              >
                <Square className="w-4 h-4 fill-current shrink-0" />
                Selesai Memasak (Matang)
              </button>
            )}

            {isDone && sesi && (
              <button
                type="button"
                onClick={() => openEditSesiModal(sesi)}
                className="flex-1 min-h-[44px] px-3.5 py-2 border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 font-semibold text-xs rounded-xl flex items-center justify-center gap-1.5 whitespace-nowrap"
              >
                <Edit3 className="w-3.5 h-3.5" />
                Tambah / Edit Catatan &amp; PJ
              </button>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="max-w-7xl mx-auto space-y-5">
      <TransparencyBanner moduleLabel="Dapur & Masak Pondok" isReadOnly={!canEditDapur} />
      {/* TOAST NOTIFICATIONS */}
      {toasts.length > 0 && (
        <div className="print:hidden fixed top-14 md:top-5 right-4 left-4 md:left-auto z-50 flex flex-col gap-2 md:w-96">
          {toasts.map((t) => (
            <div
              key={t.id}
              className={`p-3.5 rounded-xl border shadow-lg flex items-start gap-2.5 text-xs bg-white ${
                t.type === 'success'
                  ? 'border-emerald-300 text-emerald-950'
                  : t.type === 'error'
                  ? 'border-rose-300 text-rose-950'
                  : 'border-sky-300 text-sky-950'
              }`}
            >
              {t.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              ) : t.type === 'error' ? (
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              ) : (
                <Info className="w-4 h-4 text-sky-600 shrink-0 mt-0.5" />
              )}
              <div className="flex-1 min-w-0">
                <p className="font-bold">{t.title}</p>
                <p className="text-slate-600 mt-0.5">{t.message}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* HEADER BAR */}
      <div className="print:hidden bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-[11px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
              <Utensils className="w-3.5 h-3.5" />
              Sie Konsumsi &amp; Dapur Pondok
            </span>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-[11px] font-bold bg-slate-900 text-white font-mono tabular-nums">
              <Clock className="w-3 h-3 text-emerald-400" />
              {nowMs > 0 ? `${formatTimeClock(new Date(nowMs).toISOString())} WIB` : '--:--:-- WIB'}
            </span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
            Dapur &amp; Masak Pondok
          </h1>
          <p className="text-xs sm:text-sm text-slate-500">
            Timer masak real-time (Pagi maks 05:45 &bull; Sore maks 16:45), jadwal menu, analisis absen petugas &amp; kas dapur.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Navigasi Tanggal Aktif */}
          <div className="flex items-center bg-slate-50 border border-slate-200 rounded-xl p-1 gap-1">
            <button
              type="button"
              onClick={() => selectedDate && setSelectedDate(addDaysIso(selectedDate, -1))}
              aria-label="Hari sebelumnya"
              className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg hover:bg-white text-slate-600"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => {
                const v = e.target.value;
                setSelectedDate(v);
                if (v) setSelectedMonth(v.slice(0, 7));
              }}
              className="bg-transparent text-xs font-bold text-slate-800 px-1.5 focus:outline-none tabular-nums"
            />
            <button
              type="button"
              onClick={() => selectedDate && setSelectedDate(addDaysIso(selectedDate, 1))}
              aria-label="Hari berikutnya"
              className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg hover:bg-white text-slate-600"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            {todayStr && selectedDate !== todayStr && (
              <button
                type="button"
                onClick={() => {
                  setSelectedDate(todayStr);
                  setSelectedMonth(todayStr.slice(0, 7));
                }}
                className="px-2.5 py-1.5 text-[11px] font-bold bg-emerald-600 text-white rounded-lg whitespace-nowrap shrink-0"
              >
                Hari Ini
              </button>
            )}
          </div>

          {/* Filter Bulan Analitik */}
          <input
            type="month"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            aria-label="Periode bulan analitik"
            className="min-h-[40px] px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 tabular-nums"
          />

          <button
            type="button"
            onClick={loadAllData}
            disabled={loading}
            className="min-h-[40px] px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl flex items-center gap-1.5 whitespace-nowrap shrink-0"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Muat Ulang
          </button>
        </div>
      </div>

      {/* TOP 4 KPI STRIP */}
      <div className="print:hidden grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* KPI 1: Persentase Ketepatan Waktu */}
        <div className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-slate-500">
              Ketepatan Masak ({formatMonthLabel(selectedMonth)})
            </span>
            <Clock className="w-4 h-4 text-emerald-600 shrink-0" />
          </div>
          <div className="mt-2.5">
            <strong
              className={`text-2xl font-extrabold tabular-nums ${
                timelinessStats.persenTepatWaktu === null
                  ? 'text-slate-400'
                  : timelinessStats.persenTepatWaktu >= 80
                  ? 'text-emerald-700'
                  : timelinessStats.persenTepatWaktu >= 60
                  ? 'text-amber-600'
                  : 'text-rose-700'
              }`}
            >
              {loading
                ? '...'
                : timelinessStats.persenTepatWaktu !== null
                ? `${timelinessStats.persenTepatWaktu}%`
                : 'Belum Ada'}
            </strong>
            <p className="text-[11px] text-slate-500 mt-1 tabular-nums">
              Pagi: {timelinessStats.persenPagi !== null ? `${timelinessStats.persenPagi}%` : '-'} &bull; Sore:{' '}
              {timelinessStats.persenSore !== null ? `${timelinessStats.persenSore}%` : '-'}
            </p>
          </div>
        </div>

        {/* KPI 2: Status Hari Terpilih */}
        <div className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-slate-500">
              Progres Masak ({formatTanggalPendek(selectedDate)})
            </span>
            <Utensils className="w-4 h-4 text-amber-600 shrink-0" />
          </div>
          <div className="mt-2.5 space-y-1 text-xs">
            <div className="flex items-center justify-between gap-2">
              <span className="text-slate-600">Pagi (05:45):</span>
              <strong
                className={`tabular-nums ${
                  activeSesiPagi?.status_waktu === 'tepat_waktu'
                    ? 'text-emerald-700'
                    : activeSesiPagi?.status_waktu === 'terlambat'
                    ? 'text-rose-700'
                    : activeSesiPagi?.status_waktu === 'sedang_masak'
                    ? 'text-amber-600'
                    : 'text-slate-500'
                }`}
              >
                {activeSesiPagi?.status_waktu === 'tepat_waktu'
                  ? 'Tepat Waktu'
                  : activeSesiPagi?.status_waktu === 'terlambat'
                  ? `Telat +${activeSesiPagi.selisih_menit}m`
                  : activeSesiPagi?.status_waktu === 'sedang_masak'
                  ? 'Memasak...'
                  : 'Belum'}
              </strong>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-slate-600">Sore (16:45):</span>
              <strong
                className={`tabular-nums ${
                  activeSesiSore?.status_waktu === 'tepat_waktu'
                    ? 'text-emerald-700'
                    : activeSesiSore?.status_waktu === 'terlambat'
                    ? 'text-rose-700'
                    : activeSesiSore?.status_waktu === 'sedang_masak'
                    ? 'text-amber-600'
                    : 'text-slate-500'
                }`}
              >
                {activeSesiSore?.status_waktu === 'tepat_waktu'
                  ? 'Tepat Waktu'
                  : activeSesiSore?.status_waktu === 'terlambat'
                  ? `Telat +${activeSesiSore.selisih_menit}m`
                  : activeSesiSore?.status_waktu === 'sedang_masak'
                  ? 'Memasak...'
                  : 'Belum'}
              </strong>
            </div>
          </div>
        </div>

        {/* KPI 3: Kehadiran Petugas */}
        <div className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-slate-500">Kehadiran Petugas</span>
            <Users className="w-4 h-4 text-sky-600 shrink-0" />
          </div>
          <div className="mt-2.5">
            <strong className="text-2xl font-extrabold text-slate-900 tabular-nums">
              {loading
                ? '...'
                : analisisOtomatis.rataHadirKeseluruhan !== null
                ? `${analisisOtomatis.rataHadirKeseluruhan}%`
                : 'Belum Ada'}
            </strong>
            <p className="text-[11px] text-slate-500 mt-1 tabular-nums">
              Pagi: {analisisOtomatis.rataHadirPagi !== null ? `${analisisOtomatis.rataHadirPagi}%` : '-'} &bull; Sore:{' '}
              {analisisOtomatis.rataHadirSore !== null ? `${analisisOtomatis.rataHadirSore}%` : '-'}
              {analisisOtomatis.perluPembinaanList.length > 0 && (
                <span className="text-rose-600 font-semibold">
                  {' '}
                  &bull; {analisisOtomatis.perluPembinaanList.length} pembinaan
                </span>
              )}
            </p>
          </div>
        </div>

        {/* KPI 4: Saldo 2 Buku Keuangan Dapur */}
        <div className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-slate-500">Dompet Belanja Masak</span>
            <Wallet className="w-4 h-4 text-emerald-600 shrink-0" />
          </div>
          <div className="mt-2.5">
            <strong
              className={`text-base sm:text-xl font-extrabold tabular-nums block ${
                bukuMasakSummary.saldoAkhir < 0 ? 'text-rose-700' : 'text-slate-900'
              }`}
            >
              {loading ? '...' : formatRupiah(bukuMasakSummary.saldoAkhir)}
            </strong>
            <p className="text-[11px] text-slate-500 mt-1 tabular-nums truncate">
              Kas Jualan Malam: {formatRupiah(jualanMalamSummary.saldoAkhir)}
            </p>
          </div>
        </div>
      </div>

      {/* TAB NAVIGATION */}
      <div className="print:hidden bg-white border border-slate-200 rounded-2xl p-1.5 flex items-center gap-1 overflow-x-auto">
        {[
          { id: 'timer' as const, label: 'Kontrol Masak & Timer', icon: Clock },
          { id: 'menu' as const, label: 'Jadwal Harian Menu', icon: Utensils },
          { id: 'absen' as const, label: 'Absen & Analisis Petugas', icon: BarChart3 },
          { id: 'kas' as const, label: 'Keuangan Dapur (2 Buku)', icon: Wallet },
        ].map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 min-h-[42px] px-3.5 py-2 rounded-xl text-xs font-bold transition-colors flex items-center justify-center gap-2 whitespace-nowrap shrink-0 ${
                active
                  ? 'bg-emerald-700 text-white shadow-xs'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* ========================================================= */}
      {/* TAB 1: KONTROL MASAK REAL-TIME & KETEPATAN WAKTU          */}
      {/* ========================================================= */}
      {activeTab === 'timer' && (
        <div className="space-y-5">
          {/* 2 Hero Shift Cards */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {renderShiftTimerCard('pagi', activeSesiPagi, activeMenuPagi)}
            {renderShiftTimerCard('sore', activeSesiSore, activeMenuSore)}
          </div>

          {/* Panel Persentase Ketepatan Waktu Memasak */}
          <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="font-bold text-sm sm:text-base text-slate-900 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  Rekap Persentase Ketepatan Waktu Memasak ({formatMonthLabel(selectedMonth)})
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Akumulasi kedisiplinan jam matang terhadap target Pagi ≤ 05:45 WIB dan Sore ≤ 16:45 WIB.
                </p>
              </div>
              <button
                type="button"
                onClick={handleExportSesiExcel}
                disabled={sesiList.length === 0}
                className="min-h-[38px] px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 disabled:opacity-50 text-emerald-800 border border-emerald-200 rounded-xl text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                Export Excel
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                <span className="text-xs font-semibold text-slate-600 block">
                  Total Tepat Waktu
                </span>
                <div className="flex items-baseline gap-2 mt-1">
                  <strong className="text-2xl font-extrabold text-slate-900 tabular-nums">
                    {timelinessStats.persenTepatWaktu !== null
                      ? `${timelinessStats.persenTepatWaktu}%`
                      : '-'}
                  </strong>
                  <span className="text-xs text-slate-500 tabular-nums">
                    ({timelinessStats.tepatWaktuCount}/{timelinessStats.totalSelesai} sesi)
                  </span>
                </div>
                <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden mt-2">
                  <div
                    className="h-full bg-emerald-600 transition-all"
                    style={{ width: `${timelinessStats.persenTepatWaktu ?? 0}%` }}
                  />
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-amber-50/70 border border-amber-200">
                <span className="text-xs font-semibold text-amber-900 block">
                  Shift Pagi (≤ 05:45)
                </span>
                <div className="flex items-baseline gap-2 mt-1">
                  <strong className="text-2xl font-extrabold text-amber-950 tabular-nums">
                    {timelinessStats.persenPagi !== null ? `${timelinessStats.persenPagi}%` : '-'}
                  </strong>
                  <span className="text-xs text-amber-800 tabular-nums">
                    ({timelinessStats.pagiTepatWaktu} tepat &bull; {timelinessStats.pagiTerlambat} telat)
                  </span>
                </div>
                <div className="w-full h-2 bg-amber-200/70 rounded-full overflow-hidden mt-2">
                  <div
                    className="h-full bg-amber-600 transition-all"
                    style={{ width: `${timelinessStats.persenPagi ?? 0}%` }}
                  />
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-indigo-50/70 border border-indigo-200">
                <span className="text-xs font-semibold text-indigo-900 block">
                  Shift Sore (≤ 16:45)
                </span>
                <div className="flex items-baseline gap-2 mt-1">
                  <strong className="text-2xl font-extrabold text-indigo-950 tabular-nums">
                    {timelinessStats.persenSore !== null ? `${timelinessStats.persenSore}%` : '-'}
                  </strong>
                  <span className="text-xs text-indigo-800 tabular-nums">
                    ({timelinessStats.soreTepatWaktu} tepat &bull; {timelinessStats.soreTerlambat} telat)
                  </span>
                </div>
                <div className="w-full h-2 bg-indigo-200/70 rounded-full overflow-hidden mt-2">
                  <div
                    className="h-full bg-indigo-600 transition-all"
                    style={{ width: `${timelinessStats.persenSore ?? 0}%` }}
                  />
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                <span className="text-xs font-semibold text-slate-600 block">
                  Rata-Rata Durasi &amp; Telat
                </span>
                <div className="mt-1 space-y-1 text-xs tabular-nums">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Durasi Masak:</span>
                    <strong className="text-slate-900">{timelinessStats.avgDurasiMenit} menit</strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Rata-rata Telat:</span>
                    <strong className="text-rose-700">
                      {timelinessStats.terlambatCount > 0
                        ? `+${timelinessStats.avgTerlambatMenit} menit`
                        : '0 menit'}
                    </strong>
                  </div>
                  <div className="text-[11px] text-slate-600 pt-0.5">
                    {timelinessStats.shiftLebihSeringTelat === 'pagi'
                      ? 'Shift Pagi lebih sering melewati 05:45.'
                      : timelinessStats.shiftLebihSeringTelat === 'sore'
                      ? 'Shift Sore lebih sering melewati 16:45.'
                      : timelinessStats.totalSelesai > 0
                      ? 'Kedua shift terjaga baik.'
                      : 'Mulai rekam masak untuk melihat tren.'}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Riwayat Sesi Masak */}
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
            <div className="p-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
              <h3 className="font-bold text-sm text-slate-900">
                Riwayat Waktu Memasak ({formatMonthLabel(selectedMonth)})
              </h3>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={riwayatFilterShift}
                  onChange={(e) => setRiwayatFilterShift(e.target.value as 'semua' | DapurShift)}
                  className="min-h-[36px] px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700"
                >
                  <option value="semua">Semua Shift</option>
                  <option value="pagi">Shift Pagi</option>
                  <option value="sore">Shift Sore</option>
                </select>
                <select
                  value={riwayatFilterStatus}
                  onChange={(e) =>
                    setRiwayatFilterStatus(
                      e.target.value as 'semua' | 'tepat_waktu' | 'terlambat'
                    )
                  }
                  className="min-h-[36px] px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700"
                >
                  <option value="semua">Semua Status</option>
                  <option value="tepat_waktu">Tepat Waktu</option>
                  <option value="terlambat">Terlambat</option>
                </select>
              </div>
            </div>

            {riwayatSesiFiltered.length === 0 ? (
              <div className="p-8 text-center space-y-2">
                <Clock className="w-8 h-8 text-slate-300 mx-auto" />
                <p className="text-sm font-semibold text-slate-700">
                  Belum ada riwayat memasak pada periode ini
                </p>
                <p className="text-xs text-slate-500">
                  Klik tombol Mulai Memasak pada kartu Shift Pagi atau Sore di atas untuk merekam sesi pertama.
                </p>
              </div>
            ) : (
              <>
                {/* Desktop Table */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-50 text-slate-500 uppercase text-[11px] border-b border-slate-200">
                      <tr>
                        <th className="px-4 py-3 font-semibold">Tanggal</th>
                        <th className="px-4 py-3 font-semibold">Shift &amp; Target</th>
                        <th className="px-4 py-3 font-semibold">Menu &amp; PJ</th>
                        <th className="px-4 py-3 font-semibold">Mulai</th>
                        <th className="px-4 py-3 font-semibold">Selesai</th>
                        <th className="px-4 py-3 font-semibold text-right">Durasi</th>
                        <th className="px-4 py-3 font-semibold">Ketepatan</th>
                        <th className="px-4 py-3 font-semibold text-right">Aksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {riwayatSesiFiltered.map((s) => (
                        <tr key={s.id} className="hover:bg-slate-50/70">
                          <td className="px-4 py-3 font-semibold text-slate-800 whitespace-nowrap tabular-nums">
                            {formatTanggalPendek(s.tanggal)}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <span className="font-bold text-slate-800">
                              {s.shift === 'pagi' ? 'Pagi' : 'Sore'}
                            </span>{' '}
                            <span className="text-slate-500 tabular-nums">
                              (≤ {s.target_selesai})
                            </span>
                          </td>
                          <td className="px-4 py-3 max-w-xs">
                            <p className="font-medium text-slate-800 truncate">
                              {s.menu_ringkas || '-'}
                            </p>
                            {s.petugas_pj && (
                              <p className="text-[11px] text-slate-500">PJ: {s.petugas_pj}</p>
                            )}
                          </td>
                          <td className="px-4 py-3 font-mono tabular-nums text-slate-700 whitespace-nowrap">
                            {formatTimeClock(s.started_at)}
                          </td>
                          <td className="px-4 py-3 font-mono tabular-nums text-slate-700 whitespace-nowrap">
                            {s.finished_at ? formatTimeClock(s.finished_at) : '-'}
                          </td>
                          <td className="px-4 py-3 text-right font-mono tabular-nums font-semibold text-slate-800 whitespace-nowrap">
                            {s.finished_at ? `${s.durasi_menit} mnt` : '-'}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <span
                              className={`px-2 py-0.5 rounded-md text-[11px] font-bold border ${
                                s.status_waktu === 'tepat_waktu'
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                  : s.status_waktu === 'terlambat'
                                  ? 'bg-rose-50 text-rose-700 border-rose-200'
                                  : 'bg-amber-50 text-amber-700 border-amber-200'
                              }`}
                            >
                              {s.status_waktu === 'tepat_waktu'
                                ? 'Tepat Waktu'
                                : s.status_waktu === 'terlambat'
                                ? `Terlambat +${s.selisih_menit} mnt`
                                : 'Sedang Masak'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right whitespace-nowrap">
                            {canEditDapur && (
                              <button
                                type="button"
                                onClick={() => openEditSesiModal(s)}
                                className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-semibold"
                              >
                                Catatan
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Mobile Cards */}
                <div className="md:hidden divide-y divide-slate-100">
                  {riwayatSesiFiltered.map((s) => (
                    <div key={s.id} className="p-4 space-y-2 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <strong className="text-slate-900">
                          {formatTanggalPendek(s.tanggal)} &bull;{' '}
                          {s.shift === 'pagi' ? 'Pagi (05:45)' : 'Sore (16:45)'}
                        </strong>
                        <span
                          className={`px-2 py-0.5 rounded-md text-[11px] font-bold border whitespace-nowrap shrink-0 ${
                            s.status_waktu === 'tepat_waktu'
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : s.status_waktu === 'terlambat'
                              ? 'bg-rose-50 text-rose-700 border-rose-200'
                              : 'bg-amber-50 text-amber-700 border-amber-200'
                          }`}
                        >
                          {s.status_waktu === 'tepat_waktu'
                            ? 'Tepat Waktu'
                            : s.status_waktu === 'terlambat'
                            ? `Telat +${s.selisih_menit}m`
                            : 'Sedang Masak'}
                        </span>
                      </div>
                      <p className="text-slate-700 font-medium">{s.menu_ringkas || 'Menu belum diisi'}</p>
                      <div className="flex flex-wrap items-center justify-between gap-2 text-slate-500 font-mono tabular-nums">
                        <span>
                          Mulai {formatTimeClock(s.started_at, false)} &rarr; Selesai{' '}
                          {s.finished_at ? formatTimeClock(s.finished_at, false) : '-'} ({s.durasi_menit} mnt)
                        </span>
                        {canEditDapur && (
                          <button
                            type="button"
                            onClick={() => openEditSesiModal(s)}
                            className="min-h-[36px] px-3 py-1 bg-slate-100 text-slate-700 rounded-lg font-semibold font-sans"
                          >
                            Catatan
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB 2: JADWAL HARIAN MENU                                 */}
      {/* ========================================================= */}
      {activeTab === 'menu' && (
        <div className="space-y-5">
          {/* Menu Hari Terpilih */}
          <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-bold text-sm sm:text-base text-slate-900 flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-emerald-600" />
                  Menu Masak {formatHariTanggalIndo(selectedDate)}
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Rincian menu Pagi (matang ≤ 05:45) dan Sore (matang ≤ 16:45) beserta estimasi porsi.
                </p>
              </div>
              <div className="print:hidden flex flex-wrap items-center gap-2">
                {canEditDapur && (
                  <button
                    type="button"
                    onClick={handleCopyLastWeekMenu}
                    disabled={saving}
                    className="min-h-[38px] px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    Salin Minggu Lalu
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleCopyMenuWa}
                  className="min-h-[38px] px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-xl text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0"
                >
                  <Copy className="w-3.5 h-3.5" />
                  Salin WA Mingguan
                </button>
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="min-h-[38px] px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0"
                >
                  <Printer className="w-3.5 h-3.5" />
                  Cetak Jadwal
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {(['pagi', 'sore'] as DapurShift[]).map((shift) => {
                const item = shift === 'pagi' ? activeMenuPagi : activeMenuSore;
                return (
                  <div
                    key={shift}
                    className="p-4 rounded-xl border border-slate-200 bg-slate-50/70 flex flex-col justify-between gap-3"
                  >
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-bold uppercase tracking-wide text-emerald-800">
                          Menu Shift {shift === 'pagi' ? 'Pagi (05:45)' : 'Sore (16:45)'}
                        </span>
                        {item && (
                          <span className="text-[11px] font-semibold text-slate-500 tabular-nums">
                            {item.estimasi_porsi} porsi
                          </span>
                        )}
                      </div>
                      {item ? (
                        <div className="space-y-1 text-xs">
                          <p className="text-base font-bold text-slate-900">{item.menu_utama}</p>
                          {item.sayur_pendamping && (
                            <p className="text-slate-700">
                              <span className="text-slate-500">Sayur/Pendamping:</span>{' '}
                              {item.sayur_pendamping}
                            </p>
                          )}
                          {item.lauk_tambahan && (
                            <p className="text-slate-700">
                              <span className="text-slate-500">Lauk/Pelengkap:</span>{' '}
                              {item.lauk_tambahan}
                            </p>
                          )}
                          {item.catatan_belanja && (
                            <p className="text-[11px] text-slate-500 pt-1">
                              Catatan: {item.catatan_belanja}
                            </p>
                          )}
                        </div>
                      ) : (
                        <p className="text-xs text-slate-500 italic py-2">
                          Belum ada menu terjadwal untuk shift ini.
                        </p>
                      )}
                    </div>
                    {canEditDapur && (
                      <div className="print:hidden flex items-center gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => openMenuModal(selectedDate, shift, item)}
                          className="min-h-[40px] px-3.5 py-2 bg-white hover:bg-emerald-50 border border-slate-200 hover:border-emerald-300 text-emerald-800 rounded-xl text-xs font-bold flex items-center gap-1.5 whitespace-nowrap"
                        >
                          {item ? <Edit3 className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
                          {item ? 'Edit Menu' : 'Tambah Menu'}
                        </button>
                        {item && (
                          <button
                            type="button"
                            onClick={() =>
                              setDeleteDialog({
                                kind: 'menu',
                                id: item.id,
                                label: `Menu ${shift} (${formatTanggalPendek(item.tanggal)})`,
                              })
                            }
                            className="min-h-[40px] px-3 py-2 text-rose-600 hover:bg-rose-50 border border-rose-200 rounded-xl text-xs font-semibold"
                          >
                            Hapus
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Jadwal Mingguan (7 Hari) */}
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
            <div className="p-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-bold text-sm text-slate-900">
                Jadwal Menu 7 Hari ({formatTanggalPendek(weekDays[0])} &ndash;{' '}
                {formatTanggalPendek(weekDays[6])})
              </h3>
              <span className="text-xs text-slate-500">
                Klik tombol Edit / Atur pada hari yang diinginkan
              </span>
            </div>

            <div className="divide-y divide-slate-100">
              {weekDays.map((day) => {
                const pagi = menuList.find((m) => m.tanggal === day && m.shift === 'pagi') || null;
                const sore = menuList.find((m) => m.tanggal === day && m.shift === 'sore') || null;
                const isSelected = day === selectedDate;
                return (
                  <div
                    key={day}
                    className={`p-4 grid grid-cols-1 md:grid-cols-12 gap-3 items-start ${
                      isSelected ? 'bg-emerald-50/40' : 'bg-white'
                    }`}
                  >
                    <div className="md:col-span-3">
                      <button
                        type="button"
                        onClick={() => setSelectedDate(day)}
                        className="text-left group"
                      >
                        <span className="font-bold text-xs sm:text-sm text-slate-900 group-hover:text-emerald-700 block">
                          {formatHariTanggalIndo(day)}
                        </span>
                        {day === todayStr && (
                          <span className="text-[10px] font-bold text-emerald-700 uppercase">
                            Hari Ini
                          </span>
                        )}
                      </button>
                    </div>

                    <div className="md:col-span-4 flex items-start justify-between gap-2 p-2.5 rounded-xl border border-slate-200 bg-slate-50/70">
                      <div className="min-w-0 text-xs">
                        <span className="text-[10px] font-bold uppercase text-amber-800 block">
                          Pagi (05:45)
                        </span>
                        <p className="font-semibold text-slate-800 mt-0.5">
                          {pagi
                            ? [pagi.menu_utama, pagi.sayur_pendamping, pagi.lauk_tambahan]
                                .filter(Boolean)
                                .join(' + ')
                            : 'Belum diatur'}
                        </p>
                      </div>
                      {canEditDapur && (
                        <button
                          type="button"
                          onClick={() => openMenuModal(day, 'pagi', pagi)}
                          className="print:hidden px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-[11px] font-semibold text-emerald-700 hover:bg-emerald-50 whitespace-nowrap shrink-0"
                        >
                          {pagi ? 'Edit' : '+ Atur'}
                        </button>
                      )}
                    </div>

                    <div className="md:col-span-5 flex items-start justify-between gap-2 p-2.5 rounded-xl border border-slate-200 bg-slate-50/70">
                      <div className="min-w-0 text-xs">
                        <span className="text-[10px] font-bold uppercase text-indigo-800 block">
                          Sore (16:45)
                        </span>
                        <p className="font-semibold text-slate-800 mt-0.5">
                          {sore
                            ? [sore.menu_utama, sore.sayur_pendamping, sore.lauk_tambahan]
                                .filter(Boolean)
                                .join(' + ')
                            : 'Belum diatur'}
                        </p>
                      </div>
                      {canEditDapur && (
                        <button
                          type="button"
                          onClick={() => openMenuModal(day, 'sore', sore)}
                          className="print:hidden px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-[11px] font-semibold text-emerald-700 hover:bg-emerald-50 whitespace-nowrap shrink-0"
                        >
                          {sore ? 'Edit' : '+ Atur'}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB 3: ABSENSI PETUGAS, % PER ORANG & ANALISIS OTOMATIS   */}
      {/* ========================================================= */}
      {activeTab === 'absen' && (
        <div className="space-y-5">
          {/* SECTION A: INPUT ABSEN HARIAN PAGI & SORE */}
          <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="font-bold text-sm sm:text-base text-slate-900 flex items-center gap-2">
                  <UserCheck className="w-4 h-4 text-emerald-600" />
                  Absen Petugas Dapur &mdash; {formatHariTanggalIndo(selectedDate)}
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Catat kehadiran setiap kali masak Shift Pagi dan Shift Sore secara terpisah.
                </p>
              </div>
              {canEditDapur && (
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowPetugasModal(true)}
                    className="min-h-[40px] px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 whitespace-nowrap shrink-0"
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    Kelola Petugas ({petugasList.filter((p) => p.aktif !== false).length})
                  </button>
                </div>
              )}
            </div>

            {/* Shift Switcher + Search + Mark All */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="grid grid-cols-2 sm:inline-flex bg-slate-100 p-1 rounded-xl gap-1">
                <button
                  type="button"
                  onClick={() => setAbsenShiftView('pagi')}
                  className={`min-h-[40px] px-4 py-1.5 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 whitespace-nowrap ${
                    absenShiftView === 'pagi'
                      ? 'bg-white text-amber-800 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Sun className="w-3.5 h-3.5" />
                  Shift Pagi (05:45)
                </button>
                <button
                  type="button"
                  onClick={() => setAbsenShiftView('sore')}
                  className={`min-h-[40px] px-4 py-1.5 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 whitespace-nowrap ${
                    absenShiftView === 'sore'
                      ? 'bg-white text-indigo-800 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Sunset className="w-3.5 h-3.5" />
                  Shift Sore (16:45)
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="relative flex-1 sm:w-56">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={absenSearch}
                    onChange={(e) => setAbsenSearch(e.target.value)}
                    placeholder="Cari nama petugas..."
                    className="w-full min-h-[38px] pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:border-emerald-500"
                  />
                </div>
                {canEditDapur && rosterFiltered.length > 0 && (
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => handleMarkAllHadir(absenShiftView)}
                    className="min-h-[38px] px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-xl text-xs font-bold whitespace-nowrap shrink-0"
                  >
                    Tandai Semua Hadir
                  </button>
                )}
              </div>
            </div>

            {rosterFiltered.length === 0 ? (
              <div className="p-8 border border-dashed border-slate-300 rounded-xl text-center space-y-3 bg-slate-50/60">
                <Users className="w-8 h-8 text-slate-400 mx-auto" />
                <div className="space-y-1">
                  <p className="text-sm font-bold text-slate-800">
                    Daftar Petugas Dapur Masih Kosong
                  </p>
                  <p className="text-xs text-slate-500 max-w-md mx-auto">
                    Tambahkan nama petugas dapur secara langsung atau pilih dari daftar Pengurus Pondok aktif untuk mulai mencatat absensi Pagi &amp; Sore.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowPetugasModal(true)}
                  className="min-h-[42px] px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold inline-flex items-center gap-1.5"
                >
                  <UserPlus className="w-4 h-4" />
                  Tambah / Ambil Petugas Dapur
                </button>
              </div>
            ) : (
              <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
                {rosterFiltered.map((p) => {
                  const rec = absenList.find(
                    (a) =>
                      a.tanggal === selectedDate &&
                      a.shift === absenShiftView &&
                      a.petugas_id === p.id
                  );
                  return (
                    <div
                      key={p.id}
                      className="p-3.5 bg-white flex flex-col md:flex-row md:items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <strong className="text-sm text-slate-900">{p.nama}</strong>
                          <span className="text-[11px] text-slate-500">&bull; {p.jabatan}</span>
                          {rec && (
                            <span className="text-[11px] text-slate-400 font-mono tabular-nums">
                              ({rec.jam_catat})
                            </span>
                          )}
                        </div>
                        {rec?.keterangan && (
                          <p className="text-[11px] text-amber-700 mt-0.5">
                            Catatan: {rec.keterangan}
                          </p>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5">
                        {(
                          [
                            {
                              val: 'hadir' as const,
                              label: 'Hadir',
                              activeCls: 'bg-emerald-600 text-white border-emerald-600',
                            },
                            {
                              val: 'izin' as const,
                              label: 'Izin',
                              activeCls: 'bg-sky-600 text-white border-sky-600',
                            },
                            {
                              val: 'sakit' as const,
                              label: 'Sakit',
                              activeCls: 'bg-amber-500 text-slate-950 border-amber-500',
                            },
                            {
                              val: 'alpha' as const,
                              label: 'Alpha',
                              activeCls: 'bg-rose-600 text-white border-rose-600',
                            },
                          ] as const
                        ).map((opt) => {
                          const isSelected = rec?.status === opt.val;
                          return (
                            <button
                              key={opt.val}
                              type="button"
                              disabled={!canEditDapur}
                              onClick={() => canEditDapur && handleMarkAbsen(p, absenShiftView, opt.val)}
                              className={`min-h-[40px] px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors whitespace-nowrap shrink-0 disabled:opacity-60 ${
                                isSelected
                                  ? opt.activeCls
                                  : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
                              }`}
                            >
                              {opt.label}
                            </button>
                          );
                        })}

                        {canEditDapur && (
                          <button
                            type="button"
                            onClick={() => {
                              setEditingKetTarget({
                                petugas: p,
                                shift: absenShiftView,
                                currentKet: rec?.keterangan || '',
                              });
                              setKetInput(rec?.keterangan || '');
                            }}
                            className="min-h-[40px] px-2.5 py-1.5 bg-white hover:bg-slate-50 border border-slate-200 text-slate-600 rounded-lg text-xs font-medium whitespace-nowrap shrink-0"
                          >
                            Catatan
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* SECTION B: ANALISIS OTOMATIS POLA & DISIPLIN PETUGAS */}
          <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-bold text-sm sm:text-base text-slate-900 flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-emerald-600" />
                  Analisis Otomatis Pola &amp; Kedisiplinan Petugas ({formatMonthLabel(selectedMonth)})
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Deteksi otomatis siapa yang dominan shift pagi, dominan shift sore, pilih-pilih shift, atau sering absen.
                </p>
              </div>
              <div className="print:hidden flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleCopyAnalitikWa}
                  className="min-h-[38px] px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-xl text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0"
                >
                  <Copy className="w-3.5 h-3.5" />
                  Salin Evaluasi WA
                </button>
                <button
                  type="button"
                  onClick={handleExportAbsenExcel}
                  disabled={petugasRekap.length === 0}
                  className="min-h-[38px] px-3 py-1.5 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 text-slate-700 rounded-xl text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                  Export Excel
                </button>
              </div>
            </div>

            {/* 4 Highlight Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="p-3.5 rounded-xl bg-amber-50/70 border border-amber-200 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-amber-900">Dominan Masak Pagi</span>
                  <Sun className="w-4 h-4 text-amber-600" />
                </div>
                {analisisOtomatis.dominanPagiList.length === 0 ? (
                  <p className="text-xs text-amber-800/70">Belum ada pola dominan pagi.</p>
                ) : (
                  <ul className="space-y-1 text-xs text-amber-950">
                    {analisisOtomatis.dominanPagiList.slice(0, 3).map((r) => (
                      <li key={r.petugasId} className="flex justify-between gap-2 tabular-nums">
                        <span className="font-semibold truncate">{r.nama}</span>
                        <span className="shrink-0">
                          Pagi {r.hadirPagi}x / Sore {r.hadirSore}x
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="p-3.5 rounded-xl bg-indigo-50/70 border border-indigo-200 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-indigo-900">Dominan Masak Sore</span>
                  <Sunset className="w-4 h-4 text-indigo-600" />
                </div>
                {analisisOtomatis.dominanSoreList.length === 0 ? (
                  <p className="text-xs text-indigo-800/70">Belum ada pola dominan sore.</p>
                ) : (
                  <ul className="space-y-1 text-xs text-indigo-950">
                    {analisisOtomatis.dominanSoreList.slice(0, 3).map((r) => (
                      <li key={r.petugasId} className="flex justify-between gap-2 tabular-nums">
                        <span className="font-semibold truncate">{r.nama}</span>
                        <span className="shrink-0">
                          Sore {r.hadirSore}x / Pagi {r.hadirPagi}x
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="p-3.5 rounded-xl bg-emerald-50/70 border border-emerald-200 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-emerald-900">Petugas Teladan</span>
                  <Award className="w-4 h-4 text-emerald-600" />
                </div>
                {analisisOtomatis.teladanList.length === 0 ? (
                  <p className="text-xs text-emerald-800/70">Belum ada data mencukupi.</p>
                ) : (
                  <ul className="space-y-1 text-xs text-emerald-950">
                    {analisisOtomatis.teladanList.slice(0, 3).map((r) => (
                      <li key={r.petugasId} className="flex justify-between gap-2 tabular-nums">
                        <span className="font-semibold truncate">{r.nama}</span>
                        <strong className="shrink-0">{r.persenHadirTotal}%</strong>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div
                className={`p-3.5 rounded-xl border space-y-1.5 ${
                  analisisOtomatis.perluPembinaanList.length > 0
                    ? 'bg-rose-50/80 border-rose-300'
                    : 'bg-slate-50 border-slate-200'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span
                    className={`text-xs font-bold ${
                      analisisOtomatis.perluPembinaanList.length > 0
                        ? 'text-rose-900'
                        : 'text-slate-700'
                    }`}
                  >
                    Perlu Pembinaan / Teguran
                  </span>
                  <ShieldAlert
                    className={`w-4 h-4 ${
                      analisisOtomatis.perluPembinaanList.length > 0
                        ? 'text-rose-600'
                        : 'text-slate-400'
                    }`}
                  />
                </div>
                {analisisOtomatis.perluPembinaanList.length === 0 ? (
                  <p className="text-xs text-slate-500">
                    Tidak ada petugas berstatus perlu pembinaan.
                  </p>
                ) : (
                  <ul className="space-y-1 text-xs text-rose-950">
                    {analisisOtomatis.perluPembinaanList.slice(0, 3).map((r) => (
                      <li key={r.petugasId} className="flex justify-between gap-2 tabular-nums">
                        <span className="font-semibold truncate">{r.nama}</span>
                        <span className="shrink-0 text-rose-700 font-bold">
                          {r.persenHadirTotal ?? 0}% (A:{r.alpha})
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            {/* Kesimpulan Narasi Otomatis */}
            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5">
              <span className="text-xs font-bold text-slate-800 block">
                Ringkasan Kesimpulan Otomatis:
              </span>
              <ul className="space-y-1 text-xs text-slate-700 list-disc pl-4">
                {analisisOtomatis.summaryBullets.map((b, i) => (
                  <li key={i}>{b}</li>
                ))}
              </ul>
            </div>
          </div>

          {/* SECTION C: PERSENTASE KEHADIRAN PER ORANG */}
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
            <div className="p-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-bold text-sm text-slate-900">
                Persentase Kehadiran Per Petugas ({formatMonthLabel(selectedMonth)})
              </h3>
              <span className="text-xs text-slate-500 tabular-nums">
                {petugasRekap.length} petugas terdaftar
              </span>
            </div>

            {petugasRekap.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">
                Belum ada petugas maupun catatan absensi untuk ditampilkan.
              </div>
            ) : (
              <>
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-50 text-slate-500 uppercase text-[11px] border-b border-slate-200">
                      <tr>
                        <th className="px-4 py-3 font-semibold">Petugas</th>
                        <th className="px-4 py-3 font-semibold text-center">Sesi</th>
                        <th className="px-4 py-3 font-semibold text-center">Shift Pagi</th>
                        <th className="px-4 py-3 font-semibold text-center">Shift Sore</th>
                        <th className="px-4 py-3 font-semibold text-center">I / S / A</th>
                        <th className="px-4 py-3 font-semibold">% Kehadiran</th>
                        <th className="px-4 py-3 font-semibold">Dominansi Shift</th>
                        <th className="px-4 py-3 font-semibold">Evaluasi Otomatis</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {petugasRekap.map((r) => (
                        <tr key={r.petugasId} className="hover:bg-slate-50/70">
                          <td className="px-4 py-3">
                            <p className="font-bold text-slate-900">{r.nama}</p>
                            <p className="text-[11px] text-slate-500">{r.jabatan}</p>
                          </td>
                          <td className="px-4 py-3 text-center font-mono tabular-nums font-semibold text-slate-700">
                            {r.totalTercatat}
                          </td>
                          <td className="px-4 py-3 text-center font-mono tabular-nums">
                            <span className="font-bold text-slate-800">
                              {r.hadirPagi}/{r.totalPagiTercatat}
                            </span>
                            <span className="text-[11px] text-slate-500 block">
                              {r.persenHadirPagi !== null ? `${r.persenHadirPagi}%` : '-'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center font-mono tabular-nums">
                            <span className="font-bold text-slate-800">
                              {r.hadirSore}/{r.totalSoreTercatat}
                            </span>
                            <span className="text-[11px] text-slate-500 block">
                              {r.persenHadirSore !== null ? `${r.persenHadirSore}%` : '-'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center font-mono tabular-nums">
                            <span className="text-sky-700">{r.izin}</span> /{' '}
                            <span className="text-amber-700">{r.sakit}</span> /{' '}
                            <span className={r.alpha > 0 ? 'text-rose-700 font-bold' : 'text-slate-500'}>
                              {r.alpha}
                            </span>
                          </td>
                          <td className="px-4 py-3 min-w-[130px]">
                            <div className="flex items-center justify-between gap-2 tabular-nums">
                              <strong
                                className={`text-sm font-extrabold ${
                                  r.persenHadirTotal === null
                                    ? 'text-slate-400'
                                    : r.persenHadirTotal >= 85
                                    ? 'text-emerald-700'
                                    : r.persenHadirTotal >= 70
                                    ? 'text-amber-700'
                                    : 'text-rose-700'
                                }`}
                              >
                                {r.persenHadirTotal !== null ? `${r.persenHadirTotal}%` : '-'}
                              </strong>
                              <span className="text-[11px] text-slate-500">
                                {r.totalHadir}/{r.totalTercatat}
                              </span>
                            </div>
                            <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden mt-1">
                              <div
                                className={`h-full ${
                                  (r.persenHadirTotal ?? 0) >= 85
                                    ? 'bg-emerald-600'
                                    : (r.persenHadirTotal ?? 0) >= 70
                                    ? 'bg-amber-500'
                                    : 'bg-rose-600'
                                }`}
                                style={{ width: `${r.persenHadirTotal ?? 0}%` }}
                              />
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`inline-block px-2 py-0.5 rounded-md text-[11px] font-bold border whitespace-nowrap ${
                                r.dominansi === 'Dominan Pagi'
                                  ? 'bg-amber-50 text-amber-800 border-amber-200'
                                  : r.dominansi === 'Dominan Sore'
                                  ? 'bg-indigo-50 text-indigo-800 border-indigo-200'
                                  : r.dominansi === 'Seimbang'
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                  : 'bg-slate-100 text-slate-600 border-slate-200'
                              }`}
                            >
                              {r.dominansi}
                            </span>
                            <p className="text-[11px] text-slate-500 mt-0.5 tabular-nums">
                              {r.dominansiDetail}
                            </p>
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`inline-block px-2 py-0.5 rounded-md text-[11px] font-bold border whitespace-nowrap ${
                                r.statusDisiplin === 'Teladan'
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                  : r.statusDisiplin === 'Perlu Pembinaan'
                                  ? 'bg-rose-50 text-rose-700 border-rose-200'
                                  : r.statusDisiplin === 'Cukup'
                                  ? 'bg-sky-50 text-sky-700 border-sky-200'
                                  : 'bg-slate-100 text-slate-500 border-slate-200'
                              }`}
                            >
                              {r.statusDisiplin}
                            </span>
                            {r.alasanPembinaan.length > 0 && (
                              <p className="text-[11px] text-rose-700 mt-0.5">
                                {r.alasanPembinaan.join(' · ')}
                              </p>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Mobile Cards */}
                <div className="md:hidden divide-y divide-slate-100">
                  {petugasRekap.map((r) => (
                    <div key={r.petugasId} className="p-4 space-y-2.5 text-xs">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <strong className="text-sm text-slate-900 block">{r.nama}</strong>
                          <span className="text-[11px] text-slate-500">{r.jabatan}</span>
                        </div>
                        <div className="text-right shrink-0">
                          <strong
                            className={`text-lg font-extrabold tabular-nums block ${
                              r.persenHadirTotal === null
                                ? 'text-slate-400'
                                : r.persenHadirTotal >= 85
                                ? 'text-emerald-700'
                                : r.persenHadirTotal >= 70
                                ? 'text-amber-700'
                                : 'text-rose-700'
                            }`}
                          >
                            {r.persenHadirTotal !== null ? `${r.persenHadirTotal}%` : '-'}
                          </strong>
                          <span className="text-[10px] text-slate-500 tabular-nums">
                            {r.totalHadir}/{r.totalTercatat} sesi
                          </span>
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-2 p-2.5 bg-slate-50 rounded-xl border border-slate-200 text-center tabular-nums">
                        <div>
                          <span className="text-[10px] text-slate-500 block">Pagi</span>
                          <strong className="text-slate-800">
                            {r.hadirPagi}/{r.totalPagiTercatat} (
                            {r.persenHadirPagi !== null ? `${r.persenHadirPagi}%` : '-'})
                          </strong>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-500 block">Sore</span>
                          <strong className="text-slate-800">
                            {r.hadirSore}/{r.totalSoreTercatat} (
                            {r.persenHadirSore !== null ? `${r.persenHadirSore}%` : '-'})
                          </strong>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-500 block">I / S / A</span>
                          <strong className="text-slate-800">
                            {r.izin}/{r.sakit}/{r.alpha}
                          </strong>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5">
                        <span
                          className={`px-2 py-0.5 rounded-md text-[11px] font-bold border ${
                            r.dominansi === 'Dominan Pagi'
                              ? 'bg-amber-50 text-amber-800 border-amber-200'
                              : r.dominansi === 'Dominan Sore'
                              ? 'bg-indigo-50 text-indigo-800 border-indigo-200'
                              : r.dominansi === 'Seimbang'
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : 'bg-slate-100 text-slate-600 border-slate-200'
                          }`}
                        >
                          {r.dominansi}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded-md text-[11px] font-bold border ${
                            r.statusDisiplin === 'Teladan'
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : r.statusDisiplin === 'Perlu Pembinaan'
                              ? 'bg-rose-50 text-rose-700 border-rose-200'
                              : 'bg-slate-100 text-slate-600 border-slate-200'
                          }`}
                        >
                          {r.statusDisiplin}
                        </span>
                      </div>
                      {r.alasanPembinaan.length > 0 && (
                        <p className="text-[11px] text-rose-700 font-medium">
                          {r.alasanPembinaan.join(' · ')}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB 4: KEUANGAN DAPUR (2 PEMBUKUAN TERHUBUNG)             */}
      {/* ========================================================= */}
      {activeTab === 'kas' && (
        <div className="space-y-6">
          {/* RINGKASAN 2 PEMBUKUAN TERHUBUNG */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* KARTU BUKU 1: DOMPET BELANJA MASAK HARIAN */}
            <div className="bg-white border border-slate-200 rounded-2xl p-5 flex flex-col justify-between gap-4">
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-700">
                      Buku 1 &bull; Anggaran Pondok
                    </span>
                    <h2 className="text-lg font-extrabold text-slate-900 mt-0.5">
                      Dompet Belanja Masak Harian
                    </h2>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Sisa jatah belanja tidak hangus dan otomatis mengendap menambah saldo hari berikutnya (tidak dipindah ke kas jualan).
                    </p>
                  </div>
                  <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center justify-center shrink-0">
                    <Wallet className="w-5 h-5" />
                  </div>
                </div>

                <div
                  className={`p-4 rounded-xl border ${
                    bukuMasakSummary.isMinus
                      ? 'bg-rose-50 border-rose-300'
                      : 'bg-emerald-50/60 border-emerald-200'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-slate-600">
                      Saldo Tersedia (Carry-Forward)
                    </span>
                    {bukuMasakSummary.isMinus ? (
                      <span className="text-[11px] font-bold text-rose-700">
                        Kurang / Minus
                      </span>
                    ) : (
                      <span className="text-[11px] font-bold text-emerald-700">
                        Sisa Mengendap Aman
                      </span>
                    )}
                  </div>
                  <strong
                    className={`text-2xl sm:text-3xl font-extrabold font-mono tabular-nums block mt-1 ${
                      bukuMasakSummary.isMinus ? 'text-rose-700' : 'text-emerald-800'
                    }`}
                  >
                    {formatRupiah(bukuMasakSummary.saldoAkhir)}
                  </strong>
                  <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-slate-200/70 text-[11px] tabular-nums">
                    <div>
                      <span className="text-slate-500 block">Jatah Hari Ini</span>
                      <strong className="text-slate-900 font-mono">
                        {formatRupiah(bukuMasakSummary.jatahHariIni)}
                      </strong>
                    </div>
                    <div>
                      <span className="text-slate-500 block">Belanja Hari Ini</span>
                      <strong className="text-rose-700 font-mono">
                        {formatRupiah(bukuMasakSummary.belanjaHariIni)}
                      </strong>
                    </div>
                    <div>
                      <span className="text-slate-500 block">Subsidi Masuk</span>
                      <strong className="text-indigo-700 font-mono">
                        {formatRupiah(bukuMasakSummary.totalSubsidiMasuk)}
                      </strong>
                    </div>
                  </div>
                </div>
              </div>

              {canEditDapur && (
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => openBuku1Modal('jatah_harian')}
                    className="flex-1 min-h-[44px] px-3.5 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 whitespace-nowrap"
                  >
                    <Plus className="w-4 h-4 shrink-0" />
                    Terima Jatah Harian
                  </button>
                  <button
                    type="button"
                    onClick={() => openBuku1Modal('belanja_pagi')}
                    className="min-h-[44px] px-3.5 py-2 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 whitespace-nowrap"
                  >
                    <Sun className="w-3.5 h-3.5 shrink-0" />
                    Belanja Pagi
                  </button>
                  <button
                    type="button"
                    onClick={() => openBuku1Modal('belanja_sore')}
                    className="min-h-[44px] px-3.5 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-900 border border-indigo-200 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 whitespace-nowrap"
                  >
                    <Sunset className="w-3.5 h-3.5 shrink-0" />
                    Belanja Sore
                  </button>
                </div>
              )}
            </div>

            {/* KARTU BUKU 2: DOMPET KAS JUALAN MALAM DAPUR */}
            <div className="bg-white border border-slate-200 rounded-2xl p-5 flex flex-col justify-between gap-4">
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-700">
                      Buku 2 &bull; Usaha Jualan Malam
                    </span>
                    <h2 className="text-lg font-extrabold text-slate-900 mt-0.5">
                      Dompet Kas Jualan Malam Dapur
                    </h2>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Dana jualan malam HANYA boleh ditarik untuk menutup kekurangan apabila Dompet Belanja Masak Harian minus.
                    </p>
                  </div>
                  <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-700 border border-indigo-200 flex items-center justify-center shrink-0">
                    <Moon className="w-5 h-5" />
                  </div>
                </div>

                <div className="p-4 rounded-xl border bg-indigo-50/50 border-indigo-200">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-slate-600">
                      Saldo Kas Jualan Malam
                    </span>
                    <span className="text-[11px] font-bold text-indigo-800 tabular-nums">
                      Laba Bersih: {formatRupiah(jualanMalamSummary.labaBersihTotal)}
                    </span>
                  </div>
                  <strong className="text-2xl sm:text-3xl font-extrabold font-mono tabular-nums text-indigo-950 block mt-1">
                    {formatRupiah(jualanMalamSummary.saldoAkhir)}
                  </strong>
                  <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-indigo-200/60 text-[11px] tabular-nums">
                    <div>
                      <span className="text-slate-500 block">Total Omzet</span>
                      <strong className="text-emerald-700 font-mono">
                        {formatRupiah(jualanMalamSummary.totalOmzet)}
                      </strong>
                    </div>
                    <div>
                      <span className="text-slate-500 block">Total Modal</span>
                      <strong className="text-rose-700 font-mono">
                        {formatRupiah(jualanMalamSummary.totalModal)}
                      </strong>
                    </div>
                    <div>
                      <span className="text-slate-500 block">Subsidi Keluar</span>
                      <strong className="text-amber-700 font-mono">
                        {formatRupiah(jualanMalamSummary.totalSubsidiKeluar)}
                      </strong>
                    </div>
                  </div>
                </div>
              </div>

              {canEditDapur && (
                <div className="space-y-2">
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => openBuku2Modal('omzet_jualan')}
                      className="flex-1 min-h-[44px] px-3.5 py-2 bg-indigo-700 hover:bg-indigo-800 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 whitespace-nowrap"
                    >
                      <Plus className="w-4 h-4 shrink-0" />
                      Catat Omzet Malam
                    </button>
                    <button
                      type="button"
                      onClick={() => openBuku2Modal('modal_belanja')}
                      className="flex-1 min-h-[44px] px-3.5 py-2 bg-rose-50 hover:bg-rose-100 text-rose-800 border border-rose-200 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 whitespace-nowrap"
                    >
                      <TrendingDown className="w-4 h-4 shrink-0" />
                      Belanja / Modal Malam
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={openSubsidiModal}
                    disabled={!bukuMasakSummary.isMinus || jualanMalamSummary.saldoAkhir <= 0}
                    className={`w-full min-h-[44px] px-4 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-colors ${
                      bukuMasakSummary.isMinus && jualanMalamSummary.saldoAkhir > 0
                        ? 'bg-amber-500 hover:bg-amber-600 text-slate-950'
                        : 'bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200'
                    }`}
                  >
                    <ArrowRightLeft className="w-4 h-4 shrink-0" />
                    {bukuMasakSummary.isMinus
                      ? `Tutup Kekurangan ${formatRupiah(bukuMasakSummary.kekurangan)} dari Kas Jualan Malam`
                      : 'Tutup Kekurangan dari Kas Jualan Malam (Nonaktif — Buku 1 Tidak Minus)'}
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* TABEL RIWAYAT 2 BUKU TERHUBUNG */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Riwayat Buku 1 */}
            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
              <div className="p-4 border-b border-slate-200 flex items-center justify-between gap-2">
                <div>
                  <h3 className="font-bold text-sm text-slate-900">
                    Mutasi Buku 1 &mdash; Belanja Masak ({formatMonthLabel(selectedMonth)})
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Jatah harian masuk, belanja pagi/sore, dan subsidi penutup kekurangan.
                  </p>
                </div>
                <span className="text-xs font-mono font-bold text-emerald-700 tabular-nums">
                  {bukuMasakDisplay.length} entri
                </span>
              </div>

              {bukuMasakDisplay.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-500">
                  Belum ada catatan Buku 1 pada periode ini. Klik <strong>Terima Jatah Harian</strong> untuk memulai.
                </div>
              ) : (
                <div className="divide-y divide-slate-100 max-h-[420px] overflow-y-auto">
                  {bukuMasakDisplay.map((item) => (
                    <div key={item.id} className="p-3.5 flex items-start justify-between gap-3 text-xs">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="font-mono text-[11px] text-slate-500 tabular-nums">
                            {formatTanggalPendek(item.tanggal)}
                          </span>
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                              item.tipe === 'jatah_harian'
                                ? 'bg-emerald-50 text-emerald-700'
                                : item.tipe === 'subsidi_jualan_malam'
                                ? 'bg-indigo-50 text-indigo-700'
                                : item.tipe === 'belanja_pagi'
                                ? 'bg-amber-50 text-amber-800'
                                : 'bg-rose-50 text-rose-700'
                            }`}
                          >
                            {item.tipe === 'jatah_harian'
                              ? 'Jatah Harian'
                              : item.tipe === 'subsidi_jualan_malam'
                              ? 'Subsidi Jualan Malam'
                              : item.tipe === 'belanja_pagi'
                              ? 'Belanja Pagi'
                              : 'Belanja Sore'}
                          </span>
                        </div>
                        <p className="font-semibold text-slate-900 mt-1">{item.uraian}</p>
                        <p className="text-[11px] text-slate-500">
                          PJ: {item.penanggung_jawab || '-'}
                          {item.catatan ? ` · ${item.catatan}` : ''}
                        </p>
                      </div>
                      <div className="text-right shrink-0 flex items-start gap-2">
                        <div>
                          <strong
                            className={`font-mono tabular-nums block ${
                              item.arah === 'masuk' ? 'text-emerald-700' : 'text-rose-700'
                            }`}
                          >
                            {item.arah === 'masuk' ? '+' : '-'} {formatRupiah(item.nominal)}
                          </strong>
                          <span className="text-[10px] text-slate-500 font-mono tabular-nums">
                            Saldo {formatRupiah(item.saldoBerjalan)}
                          </span>
                        </div>
                        {canEditDapur && (
                          <button
                            type="button"
                            onClick={() =>
                              setDeleteDialog({
                                kind: 'buku_masak',
                                id: item.id,
                                label: `${item.uraian} (${formatRupiah(item.nominal)})`,
                              })
                            }
                            className="p-1 text-slate-400 hover:text-rose-600 rounded"
                            aria-label="Hapus entri Buku 1"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Riwayat Buku 2 */}
            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
              <div className="p-4 border-b border-slate-200 flex items-center justify-between gap-2">
                <div>
                  <h3 className="font-bold text-sm text-slate-900">
                    Mutasi Buku 2 &mdash; Kas Jualan Malam ({formatMonthLabel(selectedMonth)})
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Omzet penjualan malam, belanja modal, dan penarikan subsidi jika Buku 1 minus.
                  </p>
                </div>
                <span className="text-xs font-mono font-bold text-indigo-700 tabular-nums">
                  {jualanMalamDisplay.length} entri
                </span>
              </div>

              {jualanMalamDisplay.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-500">
                  Belum ada catatan Buku 2 pada periode ini. Klik <strong>Catat Omzet Malam</strong> untuk memulai.
                </div>
              ) : (
                <div className="divide-y divide-slate-100 max-h-[420px] overflow-y-auto">
                  {jualanMalamDisplay.map((item) => (
                    <div key={item.id} className="p-3.5 flex items-start justify-between gap-3 text-xs">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="font-mono text-[11px] text-slate-500 tabular-nums">
                            {formatTanggalPendek(item.tanggal)}
                          </span>
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                              item.tipe === 'omzet_jualan'
                                ? 'bg-emerald-50 text-emerald-700'
                                : item.tipe === 'subsidi_ke_masak'
                                ? 'bg-amber-50 text-amber-800'
                                : 'bg-rose-50 text-rose-700'
                            }`}
                          >
                            {item.tipe === 'omzet_jualan'
                              ? 'Omzet Malam'
                              : item.tipe === 'subsidi_ke_masak'
                              ? 'Subsidi ke Buku 1'
                              : 'Modal / Belanja'}
                          </span>
                        </div>
                        <p className="font-semibold text-slate-900 mt-1">{item.uraian}</p>
                        <p className="text-[11px] text-slate-500">
                          PJ: {item.penanggung_jawab || '-'}
                          {item.catatan ? ` · ${item.catatan}` : ''}
                        </p>
                      </div>
                      <div className="text-right shrink-0 flex items-start gap-2">
                        <div>
                          <strong
                            className={`font-mono tabular-nums block ${
                              item.arah === 'masuk' ? 'text-emerald-700' : 'text-rose-700'
                            }`}
                          >
                            {item.arah === 'masuk' ? '+' : '-'} {formatRupiah(item.nominal)}
                          </strong>
                          <span className="text-[10px] text-slate-500 font-mono tabular-nums">
                            Saldo {formatRupiah(item.saldoBerjalan)}
                          </span>
                        </div>
                        {canEditDapur && (
                          <button
                            type="button"
                            onClick={() =>
                              setDeleteDialog({
                                kind: 'jualan_malam',
                                id: item.id,
                                label: `${item.uraian} (${formatRupiah(item.nominal)})`,
                              })
                            }
                            className="p-1 text-slate-400 hover:text-rose-600 rounded"
                            aria-label="Hapus entri Buku 2"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* ARSIP BUKU KAS DAPUR UMUM (JIKA ADA DATA LAMA) */}
          {(kasList.length > 0 || canEditDapur) && (
            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
              <div className="p-4 border-b border-slate-200 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                <div>
                  <h3 className="font-bold text-sm text-slate-900">
                    Catatan Kas Dapur Umum / Arsip
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Saldo arsip kas umum: <strong className="font-mono">{formatRupiah(kasAllChrono.saldoAkhir)}</strong>
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {canEditDapur && (
                    <>
                      <button
                        type="button"
                        onClick={() => openKasModal('masuk')}
                        className="min-h-[38px] px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-xl text-xs font-bold flex items-center gap-1.5 whitespace-nowrap"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Kas Masuk Lain
                      </button>
                      <button
                        type="button"
                        onClick={() => openKasModal('keluar')}
                        className="min-h-[38px] px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-800 border border-rose-200 rounded-xl text-xs font-bold flex items-center gap-1.5 whitespace-nowrap"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Belanja Lain
                      </button>
                    </>
                  )}
                  <div className="relative sm:w-44">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={kasSearch}
                      onChange={(e) => setKasSearch(e.target.value)}
                      placeholder="Cari arsip..."
                      className="w-full min-h-[38px] pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                  <select
                    value={kasFilterPeriode}
                    onChange={(e) => setKasFilterPeriode(e.target.value as 'bulan_ini' | 'semua')}
                    className="min-h-[38px] px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700"
                  >
                    <option value="bulan_ini">Bulan {formatMonthLabel(selectedMonth)}</option>
                    <option value="semua">Semua Riwayat</option>
                  </select>
                  <select
                    value={kasFilterJenis}
                    onChange={(e) => setKasFilterJenis(e.target.value as 'semua' | JenisKasDapur)}
                    className="min-h-[38px] px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700"
                  >
                    <option value="semua">Semua Jenis</option>
                    <option value="masuk">Uang Masuk</option>
                    <option value="keluar">Pengeluaran</option>
                  </select>
                  <button
                    type="button"
                    onClick={handleExportKasExcel}
                    disabled={kasFiltered.length === 0}
                    className="min-h-[38px] px-3 py-1.5 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 text-slate-700 rounded-xl text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5" />
                    Excel
                  </button>
                </div>
              </div>

              {kasFiltered.length > 0 && (
                <div className="divide-y divide-slate-100">
                  {kasFiltered.map((k) => (
                    <div key={k.id} className="px-4 py-3 flex items-center justify-between gap-3 text-xs">
                      <div className="min-w-0">
                        <span className="text-[11px] text-slate-500 tabular-nums">
                          {formatTanggalPendek(k.tanggal)} &bull; {k.kategori}
                        </span>
                        <p className="font-semibold text-slate-900 truncate">{k.uraian}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <div className="text-right font-mono tabular-nums">
                          <strong className={k.jenis === 'masuk' ? 'text-emerald-700' : 'text-rose-700'}>
                            {k.jenis === 'masuk' ? '+' : '-'} {formatRupiah(k.nominal)}
                          </strong>
                          <span className="text-[10px] text-slate-500 block">
                            Saldo {formatRupiah(k.saldoBerjalan)}
                          </span>
                        </div>
                        {canEditDapur && (
                          <button
                            type="button"
                            onClick={() => openKasModal(k.jenis, k)}
                            className="px-2 py-1 bg-slate-100 hover:bg-slate-200 rounded-lg font-semibold text-slate-700"
                          >
                            Edit
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ========================================================= */}
      {/* MODALS                                                    */}
      {/* ========================================================= */}

      {/* Modal Catatan & PJ Sesi Masak (Waktu Terkunci Permanen) */}
      {editingSesi && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <form
            onSubmit={handleSaveEditSesi}
            className="bg-white rounded-2xl max-w-md w-full p-5 space-y-4 shadow-xl border border-slate-200"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-base text-slate-900">
                Catatan &amp; PJ Sesi Masak {editingSesi.shift === 'pagi' ? 'Pagi' : 'Sore'}
              </h3>
              <button
                type="button"
                onClick={() => setEditingSesi(null)}
                className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-2 text-xs">
              <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-600">
                <Lock className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                <span>Waktu Masak Terkunci Real-Time (Tidak Dapat Diubah)</span>
              </div>
              <div className="grid grid-cols-2 gap-3 pt-1">
                <div>
                  <span className="text-[11px] text-slate-500 block">Jam Mulai</span>
                  <strong className="font-mono text-sm text-slate-900 tabular-nums">
                    {formatTimeClock(editingSesi.started_at)} WIB
                  </strong>
                </div>
                <div>
                  <span className="text-[11px] text-slate-500 block">Jam Matang / Selesai</span>
                  <strong className="font-mono text-sm text-slate-900 tabular-nums">
                    {editingSesi.finished_at
                      ? `${formatTimeClock(editingSesi.finished_at)} WIB`
                      : 'Masih Memasak'}
                  </strong>
                </div>
              </div>
            </div>

            <div className="text-xs">
              <label className="font-semibold text-slate-700 block mb-1">Menu Ringkas</label>
              <input
                type="text"
                value={sesiMenuInput}
                onChange={(e) => setSesiMenuInput(e.target.value)}
                placeholder="Contoh: Nasi Putih + Sayur Sop + Tahu Tempe"
                className="w-full min-h-[40px] px-3 py-2 border border-slate-200 rounded-xl"
              />
            </div>

            <div className="text-xs">
              <label className="font-semibold text-slate-700 block mb-1">Penanggung Jawab</label>
              <input
                type="text"
                value={sesiPjInput}
                onChange={(e) => setSesiPjInput(e.target.value)}
                placeholder="Nama koordinator / petugas shift"
                className="w-full min-h-[40px] px-3 py-2 border border-slate-200 rounded-xl"
              />
            </div>

            <div className="text-xs">
              <label className="font-semibold text-slate-700 block mb-1">Catatan</label>
              <textarea
                rows={2}
                value={sesiCatatanInput}
                onChange={(e) => setSesiCatatanInput(e.target.value)}
                placeholder="Catatan kendala gas/bahan atau kondisi masakan..."
                className="w-full px-3 py-2 border border-slate-200 rounded-xl"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditingSesi(null)}
                className="min-h-[40px] px-4 py-2 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={saving}
                className="min-h-[40px] px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold"
              >
                Simpan Catatan
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal Tambah / Edit Menu */}
      {showMenuModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <form
            onSubmit={handleSaveMenu}
            className="bg-white rounded-2xl max-w-md w-full p-5 space-y-4 shadow-xl border border-slate-200"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-base text-slate-900">
                Jadwal Menu Shift {menuFormShift === 'pagi' ? 'Pagi (05:45)' : 'Sore (16:45)'}
              </h3>
              <button
                type="button"
                onClick={() => setShowMenuModal(false)}
                className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <label className="font-semibold text-slate-700 block mb-1">Tanggal</label>
                <input
                  type="date"
                  value={menuFormTanggal}
                  onChange={(e) => setMenuFormTanggal(e.target.value)}
                  required
                  className="w-full min-h-[40px] px-3 py-2 border border-slate-200 rounded-xl"
                />
              </div>
              <div>
                <label className="font-semibold text-slate-700 block mb-1">Shift</label>
                <select
                  value={menuFormShift}
                  onChange={(e) => setMenuFormShift(e.target.value as DapurShift)}
                  className="w-full min-h-[40px] px-3 py-2 border border-slate-200 rounded-xl"
                >
                  <option value="pagi">Pagi (Maks 05:45)</option>
                  <option value="sore">Sore (Maks 16:45)</option>
                </select>
              </div>
            </div>

            <div className="text-xs">
              <label className="font-semibold text-slate-700 block mb-1">Menu Utama *</label>
              <input
                type="text"
                required
                value={menuFormUtama}
                onChange={(e) => setMenuFormUtama(e.target.value)}
                placeholder="Contoh: Nasi Putih / Nasi Goreng Santri"
                className="w-full min-h-[40px] px-3 py-2 border border-slate-200 rounded-xl"
              />
            </div>

            <div className="text-xs">
              <label className="font-semibold text-slate-700 block mb-1">Sayur / Pendamping</label>
              <input
                type="text"
                value={menuFormSayur}
                onChange={(e) => setMenuFormSayur(e.target.value)}
                placeholder="Contoh: Sayur Lodeh / Tumis Kangkung"
                className="w-full min-h-[40px] px-3 py-2 border border-slate-200 rounded-xl"
              />
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <label className="font-semibold text-slate-700 block mb-1">Lauk / Tambahan</label>
                <input
                  type="text"
                  value={menuFormLauk}
                  onChange={(e) => setMenuFormLauk(e.target.value)}
                  placeholder="Contoh: Telur Dadar + Sambal"
                  className="w-full min-h-[40px] px-3 py-2 border border-slate-200 rounded-xl"
                />
              </div>
              <div>
                <label className="font-semibold text-slate-700 block mb-1">Estimasi Porsi</label>
                <input
                  type="number"
                  min={1}
                  value={menuFormPorsi}
                  onChange={(e) => setMenuFormPorsi(e.target.value)}
                  className="w-full min-h-[40px] px-3 py-2 border border-slate-200 rounded-xl tabular-nums"
                />
              </div>
            </div>

            <div className="text-xs">
              <label className="font-semibold text-slate-700 block mb-1">Catatan Belanja / Bahan</label>
              <textarea
                rows={2}
                value={menuFormCatatan}
                onChange={(e) => setMenuFormCatatan(e.target.value)}
                placeholder="Kebutuhan bahan pokok atau catatan alergi/khusus..."
                className="w-full px-3 py-2 border border-slate-200 rounded-xl"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowMenuModal(false)}
                className="min-h-[40px] px-4 py-2 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={saving}
                className="min-h-[40px] px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold"
              >
                Simpan Menu
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal Kelola Petugas Dapur */}
      {showPetugasModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full max-h-[90vh] flex flex-col shadow-xl border border-slate-200 overflow-hidden">
            <div className="p-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="font-bold text-base text-slate-900">Kelola Daftar Petugas Dapur</h3>
              <button
                type="button"
                onClick={() => setShowPetugasModal(false)}
                className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 overflow-y-auto space-y-5 text-xs">
              {/* Tambah Manual */}
              <form
                onSubmit={handleAddLocalPetugas}
                className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-3"
              >
                <span className="font-bold text-slate-800 block">
                  + Tambah Petugas Dapur Baru
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <input
                    type="text"
                    required
                    value={newPetugasNama}
                    onChange={(e) => setNewPetugasNama(e.target.value)}
                    placeholder="Nama Lengkap Petugas *"
                    className="min-h-[38px] px-3 py-1.5 bg-white border border-slate-200 rounded-xl"
                  />
                  <input
                    type="text"
                    value={newPetugasJabatan}
                    onChange={(e) => setNewPetugasJabatan(e.target.value)}
                    placeholder="Jabatan (mis: Koki Utama / Piket)"
                    className="min-h-[38px] px-3 py-1.5 bg-white border border-slate-200 rounded-xl"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={newPetugasWa}
                    onChange={(e) => setNewPetugasWa(e.target.value)}
                    placeholder="No. WhatsApp (opsional)"
                    className="flex-1 min-h-[38px] px-3 py-1.5 bg-white border border-slate-200 rounded-xl"
                  />
                  <button
                    type="submit"
                    disabled={saving}
                    className="min-h-[38px] px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold whitespace-nowrap shrink-0"
                  >
                    Tambahkan
                  </button>
                </div>
              </form>

              {/* Sinkron dari Pengurus Pondok */}
              {pengurusSource.length > 0 && (
                <div className="space-y-2">
                  <span className="font-bold text-slate-800 block">
                    Ambil Cepat dari Data Pengurus Aktif:
                  </span>
                  <div className="max-h-40 overflow-y-auto divide-y divide-slate-100 border border-slate-200 rounded-xl">
                    {pengurusSource.map((p) => {
                      const already = petugasList.some(
                        (item) => item.nama.toLowerCase() === p.nama_lengkap.toLowerCase()
                      );
                      return (
                        <div
                          key={p.id}
                          className="px-3 py-2 flex items-center justify-between gap-2 bg-white"
                        >
                          <div className="min-w-0">
                            <p className="font-semibold text-slate-800 truncate">{p.nama_lengkap}</p>
                            <p className="text-[11px] text-slate-500 truncate">
                              {p.jabatan_list?.[0]?.divisi || 'Pengurus Pondok'}
                            </p>
                          </div>
                          <button
                            type="button"
                            disabled={already || saving}
                            onClick={() => handleImportPengurus(p)}
                            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold whitespace-nowrap shrink-0 ${
                              already
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : 'bg-slate-900 hover:bg-slate-800 text-white'
                            }`}
                          >
                            {already ? 'Sudah Masuk' : '+ Pilih'}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Daftar Petugas Dapur Aktif */}
              <div className="space-y-2">
                <span className="font-bold text-slate-800 block">
                  Petugas Dapur Terdaftar ({petugasList.length}):
                </span>
                {petugasList.length === 0 ? (
                  <p className="text-slate-500 italic">Belum ada petugas terdaftar.</p>
                ) : (
                  <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
                    {petugasList.map((pt) => (
                      <div
                        key={pt.id}
                        className="px-3 py-2 flex items-center justify-between gap-2 bg-white"
                      >
                        <div className="min-w-0">
                          <p className="font-bold text-slate-900 truncate">{pt.nama}</p>
                          <p className="text-[11px] text-slate-500">
                            {pt.jabatan} &bull; Sumber: {pt.sumber === 'pengurus' ? 'Pengurus' : 'Lokal'}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            setDeleteDialog({
                              kind: 'petugas',
                              id: pt.id,
                              label: `Petugas ${pt.nama}`,
                            })
                          }
                          className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg shrink-0"
                          aria-label="Hapus petugas"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Keterangan Absen */}
      {editingKetTarget && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <form
            onSubmit={handleSaveKeteranganAbsen}
            className="bg-white rounded-2xl max-w-sm w-full p-5 space-y-4 shadow-xl border border-slate-200 text-xs"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-sm text-slate-900">
                Catatan Absen: {editingKetTarget.petugas.nama}
              </h3>
              <button
                type="button"
                onClick={() => setEditingKetTarget(null)}
                className="p-1 rounded-lg hover:bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div>
              <label className="font-semibold text-slate-700 block mb-1">
                Keterangan Shift {editingKetTarget.shift === 'pagi' ? 'Pagi' : 'Sore'}
              </label>
              <input
                type="text"
                value={ketInput}
                onChange={(e) => setKetInput(e.target.value)}
                placeholder="Misal: Tukar jaga / izin pulang / terlambat bangun"
                className="w-full min-h-[40px] px-3 py-2 border border-slate-200 rounded-xl"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditingKetTarget(null)}
                className="min-h-[38px] px-3.5 py-1.5 border border-slate-200 rounded-xl font-semibold"
              >
                Batal
              </button>
              <button
                type="submit"
                className="min-h-[38px] px-3.5 py-1.5 bg-emerald-600 text-white rounded-xl font-bold"
              >
                Simpan
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal Buku Kas Dapur */}
      {showKasModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <form
            onSubmit={handleSaveKas}
            className="bg-white rounded-2xl max-w-md w-full p-5 space-y-4 shadow-xl border border-slate-200 text-xs"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-base text-slate-900">
                {editingKas ? 'Edit Transaksi Kas Dapur' : 'Catat Kas Dapur'}
              </h3>
              <button
                type="button"
                onClick={() => setShowKasModal(false)}
                className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="font-semibold text-slate-700 block mb-1">Jenis Transaksi</label>
                <select
                  value={kasFormJenis}
                  onChange={(e) => {
                    const j = e.target.value as JenisKasDapur;
                    setKasFormJenis(j);
                    setKasFormKategori(
                      j === 'masuk' ? KATEGORI_KAS_MASUK[0] : KATEGORI_KAS_KELUAR[0]
                    );
                  }}
                  className="w-full min-h-[40px] px-3 py-2 border border-slate-200 rounded-xl font-semibold"
                >
                  <option value="masuk">Uang Masuk (+)</option>
                  <option value="keluar">Pengeluaran Belanja (-)</option>
                </select>
              </div>
              <div>
                <label className="font-semibold text-slate-700 block mb-1">Tanggal</label>
                <input
                  type="date"
                  required
                  value={kasFormTanggal}
                  onChange={(e) => setKasFormTanggal(e.target.value)}
                  className="w-full min-h-[40px] px-3 py-2 border border-slate-200 rounded-xl"
                />
              </div>
            </div>

            <div>
              <label className="font-semibold text-slate-700 block mb-1">Kategori</label>
              <select
                value={kasFormKategori}
                onChange={(e) => setKasFormKategori(e.target.value)}
                className="w-full min-h-[40px] px-3 py-2 border border-slate-200 rounded-xl"
              >
                {(kasFormJenis === 'masuk' ? KATEGORI_KAS_MASUK : KATEGORI_KAS_KELUAR).map(
                  (kat) => (
                    <option key={kat} value={kat}>
                      {kat}
                    </option>
                  )
                )}
              </select>
            </div>

            <div>
              <label className="font-semibold text-slate-700 block mb-1">Uraian Belanja / Sumber Dana *</label>
              <input
                type="text"
                required
                value={kasFormUraian}
                onChange={(e) => setKasFormUraian(e.target.value)}
                placeholder={
                  kasFormJenis === 'masuk'
                    ? 'Contoh: Dropping dana belanja mingguan dari Bendahara'
                    : 'Contoh: Belanja sayur pasar + ayam 15 kg + 2 tabung gas LPG'
                }
                className="w-full min-h-[40px] px-3 py-2 border border-slate-200 rounded-xl"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="font-semibold text-slate-700 block mb-1">Nominal (Rp) *</label>
                <input
                  type="number"
                  required
                  min={1}
                  value={kasFormNominal}
                  onChange={(e) => setKasFormNominal(e.target.value)}
                  placeholder="250000"
                  className="w-full min-h-[40px] px-3 py-2 border border-slate-200 rounded-xl font-mono tabular-nums"
                />
              </div>
              <div>
                <label className="font-semibold text-slate-700 block mb-1">Penanggung Jawab</label>
                <input
                  type="text"
                  value={kasFormPj}
                  onChange={(e) => setKasFormPj(e.target.value)}
                  placeholder="Nama petugas belanja"
                  className="w-full min-h-[40px] px-3 py-2 border border-slate-200 rounded-xl"
                />
              </div>
            </div>

            <div>
              <label className="font-semibold text-slate-700 block mb-1">Catatan (Opsional)</label>
              <input
                type="text"
                value={kasFormCatatan}
                onChange={(e) => setKasFormCatatan(e.target.value)}
                placeholder="Nomor nota / keterangan tambahan"
                className="w-full min-h-[40px] px-3 py-2 border border-slate-200 rounded-xl"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowKasModal(false)}
                className="min-h-[40px] px-4 py-2 border border-slate-200 rounded-xl font-semibold text-slate-700"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={saving}
                className={`min-h-[40px] px-4 py-2 text-white rounded-xl font-bold ${
                  kasFormJenis === 'masuk'
                    ? 'bg-emerald-600 hover:bg-emerald-700'
                    : 'bg-rose-600 hover:bg-rose-700'
                }`}
              >
                Simpan Transaksi
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal Buku 1: Dompet Belanja Masak Harian */}
      {showBuku1Modal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <form
            onSubmit={handleSaveBuku1}
            className="bg-white rounded-2xl max-w-md w-full p-5 space-y-4 shadow-xl border border-slate-200 text-xs"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-base text-slate-900">
                {buku1Tipe === 'jatah_harian'
                  ? 'Terima Jatah Belanja Harian'
                  : buku1Tipe === 'belanja_pagi'
                  ? 'Catat Belanja Masak Pagi'
                  : 'Catat Belanja Masak Sore'}
              </h3>
              <button
                type="button"
                onClick={() => setShowBuku1Modal(false)}
                className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="font-semibold text-slate-700 block mb-1">Tanggal</label>
                <input
                  type="date"
                  required
                  value={buku1Tanggal}
                  onChange={(e) => setBuku1Tanggal(e.target.value)}
                  className="w-full min-h-[40px] px-3 py-2 border border-slate-200 rounded-xl"
                />
              </div>
              <div>
                <label className="font-semibold text-slate-700 block mb-1">Nominal (Rp) *</label>
                <input
                  type="number"
                  required
                  min={1}
                  value={buku1Nominal}
                  onChange={(e) => setBuku1Nominal(e.target.value)}
                  className="w-full min-h-[40px] px-3 py-2 border border-slate-200 rounded-xl font-mono tabular-nums"
                />
              </div>
            </div>
            <div>
              <label className="font-semibold text-slate-700 block mb-1">Uraian *</label>
              <input
                type="text"
                required
                value={buku1Uraian}
                onChange={(e) => setBuku1Uraian(e.target.value)}
                className="w-full min-h-[40px] px-3 py-2 border border-slate-200 rounded-xl"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="font-semibold text-slate-700 block mb-1">Penanggung Jawab</label>
                <input
                  type="text"
                  value={buku1Pj}
                  onChange={(e) => setBuku1Pj(e.target.value)}
                  className="w-full min-h-[40px] px-3 py-2 border border-slate-200 rounded-xl"
                />
              </div>
              <div>
                <label className="font-semibold text-slate-700 block mb-1">Catatan</label>
                <input
                  type="text"
                  value={buku1Catatan}
                  onChange={(e) => setBuku1Catatan(e.target.value)}
                  placeholder="Opsional..."
                  className="w-full min-h-[40px] px-3 py-2 border border-slate-200 rounded-xl"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowBuku1Modal(false)}
                className="min-h-[40px] px-4 py-2 border border-slate-200 rounded-xl font-semibold text-slate-700"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={saving}
                className="min-h-[40px] px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl font-bold"
              >
                Simpan ke Buku 1
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal Buku 2: Dompet Kas Jualan Malam */}
      {showBuku2Modal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <form
            onSubmit={handleSaveBuku2}
            className="bg-white rounded-2xl max-w-md w-full p-5 space-y-4 shadow-xl border border-slate-200 text-xs"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-base text-slate-900">
                {buku2Tipe === 'omzet_jualan'
                  ? 'Catat Omzet Jualan Malam'
                  : 'Catat Modal / Belanja Jualan Malam'}
              </h3>
              <button
                type="button"
                onClick={() => setShowBuku2Modal(false)}
                className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="font-semibold text-slate-700 block mb-1">Tanggal</label>
                <input
                  type="date"
                  required
                  value={buku2Tanggal}
                  onChange={(e) => setBuku2Tanggal(e.target.value)}
                  className="w-full min-h-[40px] px-3 py-2 border border-slate-200 rounded-xl"
                />
              </div>
              <div>
                <label className="font-semibold text-slate-700 block mb-1">Nominal (Rp) *</label>
                <input
                  type="number"
                  required
                  min={1}
                  value={buku2Nominal}
                  onChange={(e) => setBuku2Nominal(e.target.value)}
                  className="w-full min-h-[40px] px-3 py-2 border border-slate-200 rounded-xl font-mono tabular-nums"
                />
              </div>
            </div>
            <div>
              <label className="font-semibold text-slate-700 block mb-1">Uraian *</label>
              <input
                type="text"
                required
                value={buku2Uraian}
                onChange={(e) => setBuku2Uraian(e.target.value)}
                className="w-full min-h-[40px] px-3 py-2 border border-slate-200 rounded-xl"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="font-semibold text-slate-700 block mb-1">Penanggung Jawab</label>
                <input
                  type="text"
                  value={buku2Pj}
                  onChange={(e) => setBuku2Pj(e.target.value)}
                  className="w-full min-h-[40px] px-3 py-2 border border-slate-200 rounded-xl"
                />
              </div>
              <div>
                <label className="font-semibold text-slate-700 block mb-1">Catatan</label>
                <input
                  type="text"
                  value={buku2Catatan}
                  onChange={(e) => setBuku2Catatan(e.target.value)}
                  placeholder="Opsional..."
                  className="w-full min-h-[40px] px-3 py-2 border border-slate-200 rounded-xl"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowBuku2Modal(false)}
                className="min-h-[40px] px-4 py-2 border border-slate-200 rounded-xl font-semibold text-slate-700"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={saving}
                className="min-h-[40px] px-4 py-2 bg-indigo-700 hover:bg-indigo-800 text-white rounded-xl font-bold"
              >
                Simpan ke Buku 2
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal Tutup Kekurangan dari Kas Jualan Malam */}
      {showSubsidiModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <form
            onSubmit={handleConfirmSubsidi}
            className="bg-white rounded-2xl max-w-md w-full p-5 space-y-4 shadow-xl border border-slate-200 text-xs"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-base text-slate-900">
                Tutup Kekurangan dari Kas Jualan Malam
              </h3>
              <button
                type="button"
                onClick={() => setShowSubsidiModal(false)}
                className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 space-y-1.5">
              <div className="flex justify-between">
                <span className="text-slate-600">Kekurangan Buku 1 (Belanja Masak):</span>
                <strong className="font-mono text-rose-700">
                  -{formatRupiah(bukuMasakSummary.kekurangan)}
                </strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Saldo Buku 2 (Kas Jualan Malam):</span>
                <strong className="font-mono text-indigo-800">
                  {formatRupiah(jualanMalamSummary.saldoAkhir)}
                </strong>
              </div>
            </div>

            <div>
              <label className="font-semibold text-slate-700 block mb-1">
                Nominal Subsidi Penutup (Rp) *
              </label>
              <input
                type="number"
                required
                min={1}
                max={jualanMalamSummary.saldoAkhir}
                value={subsidiNominal}
                onChange={(e) => setSubsidiNominal(e.target.value)}
                className="w-full min-h-[40px] px-3 py-2 border border-slate-200 rounded-xl font-mono tabular-nums font-bold"
              />
            </div>

            <div>
              <label className="font-semibold text-slate-700 block mb-1">Keterangan</label>
              <input
                type="text"
                value={subsidiCatatan}
                onChange={(e) => setSubsidiCatatan(e.target.value)}
                className="w-full min-h-[40px] px-3 py-2 border border-slate-200 rounded-xl"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowSubsidiModal(false)}
                className="min-h-[40px] px-4 py-2 border border-slate-200 rounded-xl font-semibold text-slate-700"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={saving}
                className="min-h-[40px] px-4 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 rounded-xl font-bold"
              >
                Pindahkan &amp; Seimbangkan
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal Konfirmasi Hapus */}
      {deleteDialog && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-5 space-y-4 shadow-xl border border-slate-200 text-xs">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
              <div>
                <h3 className="font-bold text-sm text-slate-900">Konfirmasi Hapus Data</h3>
                <p className="text-slate-600 mt-1">
                  Anda yakin ingin menghapus <strong>{deleteDialog.label}</strong>? Tindakan ini
                  tidak dapat dibatalkan.
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteDialog(null)}
                className="min-h-[38px] px-3.5 py-1.5 border border-slate-200 rounded-xl font-semibold text-slate-700"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={handleConfirmDelete}
                className="min-h-[38px] px-3.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-bold"
              >
                Ya, Hapus
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
