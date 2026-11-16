'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import * as XLSX from 'xlsx';
import {
  CheckSquare,
  Calendar,
  Search,
  Save,
  RotateCcw,
  Printer,
  FileSpreadsheet,
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  X,
  RefreshCw,
  Copy,
  MessageCircle,
  Users,
  BarChart3,
  Clock,
  Info,
  ClipboardList,
  ShieldCheck,
} from 'lucide-react';

type WaktuSholat = 'subuh' | 'dzuhur' | 'ashar' | 'maghrib' | 'isya';
type StatusAbsen = 'hadir' | 'alpha' | 'izin' | 'sakit';
type ActiveTab = 'input' | 'laporan' | 'rekap' | 'alpha';
type RekapPeriod = 'harian' | 'mingguan' | 'bulanan';
type RekapGroupBy = 'santri' | 'kamar';

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

interface AbsenRecord {
  id: string;
  santri_id: string;
  tgl: string;
  waktu_sholat: WaktuSholat;
  status: StatusAbsen;
  catatan?: string | null;
  created_at?: string;
}

interface PengaturanRow {
  nama_pesantren: string;
  alamat_lengkap: string;
  no_telepon: string;
  email_resmi?: string;
  logo_url?: string;
  stempel_url?: string;
  nama_kepala_pondok: string;
  ttd_kepala_pondok_url?: string;
}

interface DailySantriDraft {
  statuses: Record<WaktuSholat, StatusAbsen>;
  alasan: string;
  sudahTakzir: boolean;
}

interface ToastState {
  id: number;
  type: 'success' | 'error' | 'info';
  title: string;
  message: string;
}

const TAKZIR_PREFIX = '[TAKZIR_SELESAI]';

const SUPABASE_FIVE_WAKTU_SQL = `ALTER TABLE public.absen_jamaah
  DROP CONSTRAINT IF EXISTS absen_jamaah_waktu_sholat_check;

ALTER TABLE public.absen_jamaah
  ADD CONSTRAINT absen_jamaah_waktu_sholat_check
  CHECK (waktu_sholat IN ('subuh', 'dzuhur', 'ashar', 'maghrib', 'isya'));`;

function extractSupabaseError(
  err: unknown,
  fallback: string
): { message: string; isWaktuConstraint: boolean } {
  if (err instanceof Error) {
    const isConstraint = err.message.includes('absen_jamaah_waktu_sholat_check');
    return {
      message: isConstraint
        ? 'Constraint absen_jamaah di Supabase masih membatasi 3 waktu (Subuh/Dzuhur/Ashar). Jalankan SQL update di SQL Editor Supabase.'
        : err.message || fallback,
      isWaktuConstraint: isConstraint,
    };
  }
  if (err && typeof err === 'object') {
    const rec = err as { code?: string; message?: string; details?: string; hint?: string };
    const rawMsg = typeof rec.message === 'string' ? rec.message : '';
    const isConstraint =
      rec.code === '23514' ||
      rawMsg.includes('absen_jamaah_waktu_sholat_check') ||
      (typeof rec.details === 'string' &&
        (rec.details.includes('maghrib') || rec.details.includes('isya')));
    if (isConstraint) {
      return {
        message:
          'Constraint database absen_jamaah di Supabase masih 3 waktu (Subuh, Dzuhur, Ashar). Perbarui constraint menjadi 5 waktu via SQL Editor Supabase.',
        isWaktuConstraint: true,
      };
    }
    if (rawMsg) {
      return {
        message: rec.hint ? `${rawMsg} (${rec.hint})` : rawMsg,
        isWaktuConstraint: false,
      };
    }
  }
  return { message: fallback, isWaktuConstraint: false };
}

const WAKTU_SHOLAT_LIST: Array<{ key: WaktuSholat; label: string; shortLabel: string }> = [
  { key: 'subuh', label: 'Subuh', shortLabel: 'Sbh' },
  { key: 'dzuhur', label: 'Dzuhur', shortLabel: 'Dzh' },
  { key: 'ashar', label: 'Ashar', shortLabel: 'Ash' },
  { key: 'maghrib', label: 'Maghrib', shortLabel: 'Mgh' },
  { key: 'isya', label: 'Isya', shortLabel: 'Isy' },
];

const STATUS_CYCLE: Record<StatusAbsen, StatusAbsen> = {
  hadir: 'alpha',
  alpha: 'izin',
  izin: 'sakit',
  sakit: 'hadir',
};

const STATUS_META: Record<
  StatusAbsen,
  { code: string; label: string; buttonClass: string; textClass: string }
> = {
  hadir: {
    code: 'H',
    label: 'Hadir',
    buttonClass: 'bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100',
    textClass: 'text-emerald-700',
  },
  alpha: {
    code: 'A',
    label: 'Alpha',
    buttonClass: 'bg-rose-600 text-white border-rose-700 hover:bg-rose-700 shadow-xs',
    textClass: 'text-rose-700',
  },
  izin: {
    code: 'I',
    label: 'Izin',
    buttonClass: 'bg-sky-600 text-white border-sky-700 hover:bg-sky-700 shadow-xs',
    textClass: 'text-sky-700',
  },
  sakit: {
    code: 'S',
    label: 'Sakit',
    buttonClass: 'bg-amber-500 text-white border-amber-600 hover:bg-amber-600 shadow-xs',
    textClass: 'text-amber-700',
  },
};

const MASTER_KAMAR_ORDER = [
  'A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7', 'A8', 'A9', 'A10',
  'C1', 'C2', 'C3', 'C4', 'C5', 'C6',
  'Al-Fachriyah 1 (VIP)',
  'Al-Fachriyah 2 (VIP)',
  'Al-Fachriyah 3 (VIP)',
  'Al-Fachriyah 4 (VIP)',
  'NDALEM',
];

function parseCatatan(raw?: string | null): { sudahTakzir: boolean; alasan: string } {
  const val = (raw || '').trim();
  if (!val) return { sudahTakzir: false, alasan: '' };
  if (val.startsWith(TAKZIR_PREFIX)) {
    return {
      sudahTakzir: true,
      alasan: val.slice(TAKZIR_PREFIX.length).trim(),
    };
  }
  return { sudahTakzir: false, alasan: val };
}

function encodeCatatan(alasan: string, sudahTakzir: boolean): string | null {
  const clean = alasan.trim();
  if (sudahTakzir) {
    return clean ? `${TAKZIR_PREFIX} ${clean}` : TAKZIR_PREFIX;
  }
  return clean || null;
}

function getKamarSortWeight(kamar: string): number {
  const idx = MASTER_KAMAR_ORDER.findIndex((k) => k.toLowerCase() === (kamar || '').trim().toLowerCase());
  return idx >= 0 ? idx : 999;
}

function getLocalTodayStr(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
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

function formatTanggalIndo(dateStr?: string): string {
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

function getWaliContact(s: SantriRow): { nama: string; wa: string | null } {
  const nama = s.nama_wali || s.nama_ayah || s.nama_ibu || 'Bapak/Ibu Wali Santri';
  const wa = formatWaNumber(s.no_wa_wali || s.no_wa_ayah || s.no_wa_ibu);
  return { nama, wa };
}

function createDefaultStatuses(): Record<WaktuSholat, StatusAbsen> {
  return {
    subuh: 'hadir',
    dzuhur: 'hadir',
    ashar: 'hadir',
    maghrib: 'hadir',
    isya: 'hadir',
  };
}

export default function AbsenJamaahPage() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('input');
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [selectedKamar, setSelectedKamar] = useState<string>('SEMUA');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [takzirFilter, setTakzirFilter] = useState<'semua' | 'belum' | 'sudah'>('semua');

  const [rekapPeriod, setRekapPeriod] = useState<RekapPeriod>('mingguan');
  const [rekapGroupBy, setRekapGroupBy] = useState<RekapGroupBy>('santri');
  const [alphaWindowDays, setAlphaWindowDays] = useState<number>(30);
  const [alphaThreshold, setAlphaThreshold] = useState<number>(3);

  const [santriList, setSantriList] = useState<SantriRow[]>([]);
  const [absenList, setAbsenList] = useState<AbsenRecord[]>([]);
  const [pengaturan, setPengaturan] = useState<PengaturanRow>({
    nama_pesantren: 'Pondok Pesantren An-Nur 1 Bululawang',
    alamat_lengkap: 'Jl. Diponegoro IV / 2-6 Bululawang, Kab. Malang, Jawa Timur',
    no_telepon: '085604551562',
    email_resmi: 'annur1bululawang@gmail.com',
    logo_url: '',
    stempel_url: '',
    nama_kepala_pondok: 'Ust. M. Fajar Wahyudi',
    ttd_kepala_pondok_url: '',
  });

  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [togglingTakzirId, setTogglingTakzirId] = useState<string | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [dbConstraintFixNeeded, setDbConstraintFixNeeded] = useState<boolean>(false);
  const [draftOverrides, setDraftOverrides] = useState<Record<string, Record<string, DailySantriDraft>>>({});
  const [toasts, setToasts] = useState<ToastState[]>([]);

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
      setSelectedDate((prev) => prev || getLocalTodayStr());
    });
    return () => {
      active = false;
    };
  }, []);

  const rangeStart = useMemo(() => {
    if (!selectedDate) return '';
    const monthStart = `${selectedDate.slice(0, 7)}-01`;
    const windowStart = addDaysToIso(selectedDate, -Math.max(alphaWindowDays - 1, 30));
    return monthStart < windowStart ? monthStart : windowStart;
  }, [selectedDate, alphaWindowDays]);

  const rangeEnd = useMemo(() => {
    if (!selectedDate) return '';
    const [yStr, mStr] = selectedDate.split('-');
    const y = parseInt(yStr, 10);
    const m = parseInt(mStr, 10);
    if (Number.isNaN(y) || Number.isNaN(m)) return selectedDate;
    const lastDay = new Date(y, m, 0).getDate();
    const monthEnd = `${yStr}-${mStr}-${String(lastDay).padStart(2, '0')}`;
    return monthEnd > selectedDate ? monthEnd : selectedDate;
  }, [selectedDate]);

  const fetchData = useCallback(async () => {
    const [santriRes, absenRes, pengaturanRes] = await Promise.all([
      supabase
        .from('santri')
        .select('id, nis, nama_lengkap, kamar, status, nama_ayah, no_wa_ayah, nama_ibu, no_wa_ibu, nama_wali, no_wa_wali')
        .in('status', ['aktif', 'ndalem', 'beasiswa_lazis']),
      supabase
        .from('absen_jamaah')
        .select('*')
        .gte('tgl', rangeStart)
        .lte('tgl', rangeEnd)
        .order('tgl', { ascending: false }),
      supabase.from('pengaturan_aplikasi').select('*').limit(1).maybeSingle(),
    ]);

    if (santriRes.error) throw santriRes.error;
    if (absenRes.error) throw absenRes.error;

    const activeSantri = ((santriRes.data || []) as SantriRow[]).sort((a, b) => {
      const wa = getKamarSortWeight(a.kamar);
      const wb = getKamarSortWeight(b.kamar);
      if (wa !== wb) return wa - wb;
      const kc = (a.kamar || '').localeCompare(b.kamar || '', 'id', { numeric: true });
      if (kc !== 0) return kc;
      return (a.nama_lengkap || '').localeCompare(b.nama_lengkap || '', 'id');
    });

    return {
      santri: activeSantri,
      absen: (absenRes.data || []) as AbsenRecord[],
      pengaturan: (pengaturanRes.data || null) as Partial<PengaturanRow> | null,
    };
  }, [rangeStart, rangeEnd]);

  const handleReload = async () => {
    if (!selectedDate) return;
    setLoading(true);
    setFetchError(null);
    try {
      const res = await fetchData();
      setSantriList(res.santri);
      setAbsenList(res.absen);
      if (res.pengaturan) {
        setPengaturan((prev) => ({ ...prev, ...res.pengaturan }));
      }
    } catch (err: unknown) {
      const { message } = extractSupabaseError(err, 'Gagal memuat data absen jamaah.');
      setFetchError(message);
      showToast('error', 'Gagal Memuat Data', message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!selectedDate) return;
    let active = true;
    fetchData()
      .then((res) => {
        if (!active) return;
        setFetchError(null);
        setSantriList(res.santri);
        setAbsenList(res.absen);
        if (res.pengaturan) {
          setPengaturan((prev) => ({ ...prev, ...res.pengaturan }));
        }
      })
      .catch((err: unknown) => {
        if (!active) return;
        const { message } = extractSupabaseError(err, 'Gagal memuat data absen jamaah.');
        setFetchError(message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [fetchData, selectedDate]);

  // Peta absensi 5 waktu per santri untuk tanggal yang dipilih
  const dailyMap = useMemo(() => {
    const dayRows = absenList.filter((r) => r.tgl === selectedDate);
    const bySantri = new Map<string, AbsenRecord[]>();
    for (const row of dayRows) {
      const list = bySantri.get(row.santri_id) || [];
      list.push(row);
      bySantri.set(row.santri_id, list);
    }

    const overrides = draftOverrides[selectedDate] || {};
    const merged: Record<string, DailySantriDraft> = {};

    for (const s of santriList) {
      if (overrides[s.id]) {
        merged[s.id] = overrides[s.id];
        continue;
      }

      const records = bySantri.get(s.id) || [];
      const statuses = createDefaultStatuses();
      let alasan = '';
      let sudahTakzir = false;

      for (const rec of records) {
        if (WAKTU_SHOLAT_LIST.some((w) => w.key === rec.waktu_sholat)) {
          statuses[rec.waktu_sholat] = rec.status;
        }
        const parsed = parseCatatan(rec.catatan);
        if (parsed.alasan && !alasan) alasan = parsed.alasan;
        if (rec.status === 'alpha' && parsed.sudahTakzir) sudahTakzir = true;
      }

      merged[s.id] = { statuses, alasan, sudahTakzir };
    }
    return merged;
  }, [absenList, santriList, selectedDate, draftOverrides]);

  const kamarOptions = useMemo(() => {
    const unique = new Set<string>();
    for (const s of santriList) {
      if (s.kamar) unique.add(s.kamar);
    }
    return Array.from(unique).sort((a, b) => {
      const wa = getKamarSortWeight(a);
      const wb = getKamarSortWeight(b);
      if (wa !== wb) return wa - wb;
      return a.localeCompare(b, 'id', { numeric: true });
    });
  }, [santriList]);

  const allRoomsForWaReport = useMemo(() => {
    const set = new Set<string>(MASTER_KAMAR_ORDER);
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

  const filteredSantri = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return santriList.filter((s) => {
      const matchKamar = selectedKamar === 'SEMUA' || s.kamar === selectedKamar;
      const matchSearch =
        !q ||
        s.nama_lengkap.toLowerCase().includes(q) ||
        String(s.nis || '').toLowerCase().includes(q) ||
        String(s.kamar || '').toLowerCase().includes(q);
      return matchKamar && matchSearch;
    });
  }, [santriList, selectedKamar, searchQuery]);

  const savedSantriIdsOnDate = useMemo(() => {
    const set = new Set<string>();
    for (const r of absenList) {
      if (r.tgl === selectedDate) set.add(r.santri_id);
    }
    return set;
  }, [absenList, selectedDate]);

  const savedCountInScope = useMemo(
    () => filteredSantri.filter((s) => savedSantriIdsOnDate.has(s.id)).length,
    [filteredSantri, savedSantriIdsOnDate]
  );

  const dailySummary = useMemo(() => {
    let totalSlots = 0;
    let hadir = 0;
    let alpha = 0;
    let izin = 0;
    let sakit = 0;
    let santriDenganAlpha = 0;

    for (const s of filteredSantri) {
      const entry = dailyMap[s.id];
      if (!entry) continue;
      let hasAlpha = false;
      for (const w of WAKTU_SHOLAT_LIST) {
        totalSlots += 1;
        const st = entry.statuses[w.key];
        if (st === 'hadir') hadir += 1;
        else if (st === 'alpha') {
          alpha += 1;
          hasAlpha = true;
        } else if (st === 'izin') izin += 1;
        else if (st === 'sakit') sakit += 1;
      }
      if (hasAlpha) santriDenganAlpha += 1;
    }
    return {
      totalSantri: filteredSantri.length,
      totalSlots,
      hadir,
      alpha,
      izin,
      sakit,
      santriDenganAlpha,
    };
  }, [filteredSantri, dailyMap]);

  const handleCycleStatus = (santriId: string, waktu: WaktuSholat) => {
    if (!selectedDate) return;
    setDraftOverrides((prev) => {
      const dayOverrides = prev[selectedDate] || {};
      const current = dailyMap[santriId] || {
        statuses: createDefaultStatuses(),
        alasan: '',
        sudahTakzir: false,
      };
      const nextStatus = STATUS_CYCLE[current.statuses[waktu]];
      const nextStatuses = { ...current.statuses, [waktu]: nextStatus };
      const stillNonHadir = WAKTU_SHOLAT_LIST.some((w) => nextStatuses[w.key] !== 'hadir');
      const stillAlpha = WAKTU_SHOLAT_LIST.some((w) => nextStatuses[w.key] === 'alpha');

      return {
        ...prev,
        [selectedDate]: {
          ...dayOverrides,
          [santriId]: {
            statuses: nextStatuses,
            alasan: stillNonHadir ? current.alasan : '',
            sudahTakzir: stillAlpha ? current.sudahTakzir : false,
          },
        },
      };
    });
  };

  const handleChangeAlasan = (santriId: string, alasan: string) => {
    if (!selectedDate) return;
    setDraftOverrides((prev) => {
      const dayOverrides = prev[selectedDate] || {};
      const current = dailyMap[santriId] || {
        statuses: createDefaultStatuses(),
        alasan: '',
        sudahTakzir: false,
      };
      return {
        ...prev,
        [selectedDate]: {
          ...dayOverrides,
          [santriId]: {
            ...current,
            alasan,
          },
        },
      };
    });
  };

  const handleSetSemuaHadir = () => {
    if (!selectedDate) return;
    setDraftOverrides((prev) => {
      const updated = { ...(prev[selectedDate] || {}) };
      for (const s of filteredSantri) {
        updated[s.id] = {
          statuses: createDefaultStatuses(),
          alasan: '',
          sudahTakzir: false,
        };
      }
      return { ...prev, [selectedDate]: updated };
    });
    showToast(
      'info',
      'Reset ke Default Hadir (H)',
      `Seluruh 5 waktu untuk ${filteredSantri.length} santri diset Hadir. Klik Simpan Absen 5 Waktu untuk menyimpan.`
    );
  };

  const handleSaveDailyFiveWaktu = async () => {
    if (!selectedDate) return;
    if (filteredSantri.length === 0) {
      showToast('error', 'Tidak Ada Data', 'Tidak ada santri pada filter kamar atau pencarian ini.');
      return;
    }

    setSaving(true);
    try {
      const targetIds = filteredSantri.map((s) => s.id);
      const idChunkSize = 100;
      for (let i = 0; i < targetIds.length; i += idChunkSize) {
        const chunk = targetIds.slice(i, i + idChunkSize);
        const { error: delErr } = await supabase
          .from('absen_jamaah')
          .delete()
          .eq('tgl', selectedDate)
          .in('santri_id', chunk);
        if (delErr) throw delErr;
      }

      const payload: Array<{
        santri_id: string;
        tgl: string;
        waktu_sholat: WaktuSholat;
        status: StatusAbsen;
        catatan: string | null;
      }> = [];

      for (const s of filteredSantri) {
        const entry = dailyMap[s.id] || {
          statuses: createDefaultStatuses(),
          alasan: '',
          sudahTakzir: false,
        };
        for (const w of WAKTU_SHOLAT_LIST) {
          const st = entry.statuses[w.key];
          const catatan =
            st === 'hadir'
              ? null
              : encodeCatatan(entry.alasan, st === 'alpha' ? entry.sudahTakzir : false);
          payload.push({
            santri_id: s.id,
            tgl: selectedDate,
            waktu_sholat: w.key,
            status: st,
            catatan,
          });
        }
      }

      const rowChunkSize = 500;
      for (let i = 0; i < payload.length; i += rowChunkSize) {
        const chunk = payload.slice(i, i + rowChunkSize);
        const { error: insErr } = await supabase.from('absen_jamaah').insert(chunk);
        if (insErr) throw insErr;
      }

      const refreshed = await fetchData();
      setSantriList(refreshed.santri);
      setAbsenList(refreshed.absen);
      setDbConstraintFixNeeded(false);
      setDraftOverrides((prev) => {
        const next = { ...prev };
        delete next[selectedDate];
        return next;
      });

      showToast(
        'success',
        'Absen 5 Waktu Tersimpan',
        `Presensi 5 waktu (${formatTanggalIndo(selectedDate)}) untuk ${filteredSantri.length} santri berhasil disimpan.`
      );
    } catch (err: unknown) {
      const { message, isWaktuConstraint } = extractSupabaseError(
        err,
        'Gagal menyimpan presensi 5 waktu.'
      );
      if (isWaktuConstraint) setDbConstraintFixNeeded(true);
      showToast('error', 'Gagal Menyimpan Presensi', message);
    } finally {
      setSaving(false);
    }
  };

  // ============================================================================
  // DAFTAR TAKZIR HARIAN & GENERATOR LAPORAN GRUP WA PENGURUS (SEMUA KAMAR)
  // ============================================================================
  const dailyTakzirList = useMemo(() => {
    const items: Array<{
      santri: SantriRow;
      alphaTimes: WaktuSholat[];
      alasan: string;
      sudahTakzir: boolean;
    }> = [];

    for (const s of santriList) {
      const entry = dailyMap[s.id];
      if (!entry) continue;
      const alphaTimes = WAKTU_SHOLAT_LIST.filter((w) => entry.statuses[w.key] === 'alpha').map(
        (w) => w.key
      );
      if (alphaTimes.length === 0) continue;
      items.push({
        santri: s,
        alphaTimes,
        alasan: entry.alasan,
        sudahTakzir: entry.sudahTakzir,
      });
    }

    return items.filter((it) => {
      const matchKamar = selectedKamar === 'SEMUA' || it.santri.kamar === selectedKamar;
      const q = searchQuery.trim().toLowerCase();
      const matchSearch =
        !q ||
        it.santri.nama_lengkap.toLowerCase().includes(q) ||
        String(it.santri.nis || '').toLowerCase().includes(q);
      const matchTakzir =
        takzirFilter === 'semua' ||
        (takzirFilter === 'belum' && !it.sudahTakzir) ||
        (takzirFilter === 'sudah' && it.sudahTakzir);
      return matchKamar && matchSearch && matchTakzir;
    });
  }, [santriList, dailyMap, selectedKamar, searchQuery, takzirFilter]);

  const handleToggleTakzirStatus = async (santriId: string, nextSudahTakzir: boolean) => {
    if (!selectedDate) return;
    setTogglingTakzirId(santriId);

    try {
      const entry = dailyMap[santriId];
      if (!entry) return;

      const alphaRows = absenList.filter(
        (r) => r.tgl === selectedDate && r.santri_id === santriId && r.status === 'alpha'
      );

      if (alphaRows.length === 0) {
        // Jika belum pernah klik Simpan setelah ubah ke Alpha di Tab 1, simpan dulu baris tanggal ini
        const targetSantri = santriList.find((s) => s.id === santriId);
        if (targetSantri) {
          const payload = WAKTU_SHOLAT_LIST.map((w) => {
            const st = entry.statuses[w.key];
            return {
              santri_id: santriId,
              tgl: selectedDate,
              waktu_sholat: w.key,
              status: st,
              catatan:
                st === 'hadir'
                  ? null
                  : encodeCatatan(entry.alasan, st === 'alpha' ? nextSudahTakzir : false),
            };
          });
          await supabase.from('absen_jamaah').delete().eq('tgl', selectedDate).eq('santri_id', santriId);
          const { error: insErr } = await supabase.from('absen_jamaah').insert(payload);
          if (insErr) throw insErr;
        }
      } else {
        const newCatatan = encodeCatatan(entry.alasan, nextSudahTakzir);
        const { error: updErr } = await supabase
          .from('absen_jamaah')
          .update({ catatan: newCatatan })
          .eq('tgl', selectedDate)
          .eq('santri_id', santriId)
          .eq('status', 'alpha');

        if (updErr) throw updErr;
      }

      const refreshed = await fetchData();
      setSantriList(refreshed.santri);
      setAbsenList(refreshed.absen);
      setDraftOverrides((prev) => {
        const dayOverrides = prev[selectedDate];
        if (!dayOverrides || !dayOverrides[santriId]) return prev;
        const nextDay = { ...dayOverrides };
        delete nextDay[santriId];
        return { ...prev, [selectedDate]: nextDay };
      });

      showToast(
        'success',
        nextSudahTakzir ? 'Ditandai Sudah Ditakzir' : 'Dikembalikan ke Belum Ditakzir',
        `Status takzir telah diperbarui untuk ${formatTanggalIndo(selectedDate)}.`
      );
    } catch (err: unknown) {
      const { message, isWaktuConstraint } = extractSupabaseError(
        err,
        'Gagal memperbarui status takzir.'
      );
      if (isWaktuConstraint) setDbConstraintFixNeeded(true);
      showToast('error', 'Gagal Memperbarui Takzir', message);
    } finally {
      setTogglingTakzirId(null);
    }
  };

  const whatsappReportText = useMemo(() => {
    const lines: string[] = [];
    lines.push(`*LAPORAN ABSEN SHOLAT JAMAAH HARIAN*`);
    lines.push(`${pengaturan.nama_pesantren}`);
    lines.push(`Tanggal: *${formatTanggalIndo(selectedDate)}*`);
    lines.push(`--------------------------------`);

    const allTakzirLines: string[] = [];

    for (const kamar of allRoomsForWaReport) {
      const roomSantri = santriList.filter((s) => s.kamar === kamar);
      if (roomSantri.length === 0) {
        lines.push(`\n*Kamar ${kamar}*`);
        lines.push(`- Nihil (Belum ada data santri aktif)`);
        continue;
      }

      const nonAttendingEntries: string[] = [];

      for (const s of roomSantri) {
        const entry = dailyMap[s.id];
        if (!entry) continue;

        const nonHadirDetails: string[] = [];
        const alphaLabels: string[] = [];

        for (const w of WAKTU_SHOLAT_LIST) {
          const st = entry.statuses[w.key];
          if (st !== 'hadir') {
            nonHadirDetails.push(`${w.label} (${STATUS_META[st].label})`);
            if (st === 'alpha') alphaLabels.push(w.label);
          }
        }

        if (nonHadirDetails.length > 0) {
          const reasonPart = entry.alasan ? ` — Alasan: ${entry.alasan}` : '';
          nonAttendingEntries.push(
            `${nonAttendingEntries.length + 1}. ${s.nama_lengkap}: ${nonHadirDetails.join(', ')}${reasonPart}`
          );
        }

        if (alphaLabels.length > 0) {
          const takzirTag = entry.sudahTakzir ? 'Sudah Ditakzir' : 'Belum Ditakzir';
          allTakzirLines.push(
            `${allTakzirLines.length + 1}. ${s.nama_lengkap} (${s.kamar}) — Alpha: ${alphaLabels.join(', ')} [${takzirTag}]`
          );
        }
      }

      lines.push(`\n*Kamar ${kamar}*`);
      if (nonAttendingEntries.length === 0) {
        lines.push(`- Nihil (Hadir semua 5 waktu)`);
      } else {
        lines.push(...nonAttendingEntries);
      }
    }

    lines.push(`\n--------------------------------`);
    lines.push(`*DAFTAR WAJIB TAKZIR (ALPHA):*`);
    if (allTakzirLines.length === 0) {
      lines.push(`- Nihil (Tidak ada santri Alpha hari ini)`);
    } else {
      lines.push(...allTakzirLines);
    }

    return lines.join('\n');
  }, [allRoomsForWaReport, santriList, dailyMap, pengaturan.nama_pesantren, selectedDate]);

  // ============================================================================
  // PERHITUNGAN REKAP HARIAN / MINGGUAN / BULANAN (5 WAKTU)
  // ============================================================================
  const rekapBounds = useMemo(() => {
    if (!selectedDate) {
      return { start: '', end: '', label: '-' };
    }
    if (rekapPeriod === 'harian') {
      return {
        start: selectedDate,
        end: selectedDate,
        label: `Harian · ${formatTanggalIndo(selectedDate)}`,
      };
    }
    if (rekapPeriod === 'mingguan') {
      const start = addDaysToIso(selectedDate, -6);
      return {
        start,
        end: selectedDate,
        label: `Mingguan · ${formatTanggalIndo(start)} s/d ${formatTanggalIndo(selectedDate)}`,
      };
    }
    const prefix = selectedDate.slice(0, 7);
    const [yStr, mStr] = prefix.split('-');
    const lastDay = new Date(parseInt(yStr, 10), parseInt(mStr, 10), 0).getDate();
    const start = `${prefix}-01`;
    const end = `${prefix}-${String(lastDay).padStart(2, '0')}`;
    return {
      start,
      end,
      label: `Bulanan · ${formatTanggalIndo(start)} s/d ${formatTanggalIndo(end)}`,
    };
  }, [rekapPeriod, selectedDate]);

  const rekapRecords = useMemo(
    () => absenList.filter((r) => r.tgl >= rekapBounds.start && r.tgl <= rekapBounds.end),
    [absenList, rekapBounds]
  );

  const rekapPerSantri = useMemo(() => {
    const map = new Map<
      string,
      { total: number; hadir: number; sakit: number; izin: number; alpha: number }
    >();
    for (const r of rekapRecords) {
      const cur = map.get(r.santri_id) || { total: 0, hadir: 0, sakit: 0, izin: 0, alpha: 0 };
      cur.total += 1;
      if (r.status === 'hadir') cur.hadir += 1;
      else if (r.status === 'sakit') cur.sakit += 1;
      else if (r.status === 'izin') cur.izin += 1;
      else if (r.status === 'alpha') cur.alpha += 1;
      map.set(r.santri_id, cur);
    }

    return filteredSantri.map((s) => {
      const stats = map.get(s.id) || { total: 0, hadir: 0, sakit: 0, izin: 0, alpha: 0 };
      const pct = stats.total > 0 ? Math.round((stats.hadir / stats.total) * 100) : 0;
      return { santri: s, ...stats, pct };
    });
  }, [filteredSantri, rekapRecords]);

  const rekapPerKamar = useMemo(() => {
    const santriById = new Map(santriList.map((s) => [s.id, s]));
    const kamarStats = new Map<
      string,
      {
        kamar: string;
        jumlahSantri: number;
        total: number;
        hadir: number;
        sakit: number;
        izin: number;
        alpha: number;
      }
    >();

    for (const s of santriList) {
      if (selectedKamar !== 'SEMUA' && s.kamar !== selectedKamar) continue;
      if (!kamarStats.has(s.kamar)) {
        kamarStats.set(s.kamar, {
          kamar: s.kamar,
          jumlahSantri: 0,
          total: 0,
          hadir: 0,
          sakit: 0,
          izin: 0,
          alpha: 0,
        });
      }
      kamarStats.get(s.kamar)!.jumlahSantri += 1;
    }

    for (const r of rekapRecords) {
      const s = santriById.get(r.santri_id);
      if (!s) continue;
      if (selectedKamar !== 'SEMUA' && s.kamar !== selectedKamar) continue;
      const entry = kamarStats.get(s.kamar);
      if (!entry) continue;
      entry.total += 1;
      if (r.status === 'hadir') entry.hadir += 1;
      else if (r.status === 'sakit') entry.sakit += 1;
      else if (r.status === 'izin') entry.izin += 1;
      else if (r.status === 'alpha') entry.alpha += 1;
    }

    return Array.from(kamarStats.values())
      .sort((a, b) => {
        const wa = getKamarSortWeight(a.kamar);
        const wb = getKamarSortWeight(b.kamar);
        if (wa !== wb) return wa - wb;
        return a.kamar.localeCompare(b.kamar, 'id', { numeric: true });
      })
      .map((item) => ({
        ...item,
        pct: item.total > 0 ? Math.round((item.hadir / item.total) * 100) : 0,
      }));
  }, [santriList, rekapRecords, selectedKamar]);

  const rekapTotals = useMemo(() => {
    return rekapPerSantri.reduce(
      (acc, row) => {
        acc.total += row.total;
        acc.hadir += row.hadir;
        acc.sakit += row.sakit;
        acc.izin += row.izin;
        acc.alpha += row.alpha;
        return acc;
      },
      { total: 0, hadir: 0, sakit: 0, izin: 0, alpha: 0 }
    );
  }, [rekapPerSantri]);

  const rekapGlobalStats = useMemo(() => {
    const activeIds = new Set(santriList.map((s) => s.id));
    const daysSet = new Set<string>();
    let total = 0;
    let hadir = 0;
    let alpha = 0;
    let izin = 0;
    let sakit = 0;

    for (const r of rekapRecords) {
      if (!activeIds.has(r.santri_id)) continue;
      total += 1;
      daysSet.add(r.tgl);
      if (r.status === 'hadir') hadir += 1;
      else if (r.status === 'alpha') alpha += 1;
      else if (r.status === 'izin') izin += 1;
      else if (r.status === 'sakit') sakit += 1;
    }

    return {
      totalSantri: santriList.length,
      hariTercatat: daysSet.size,
      total,
      hadir,
      alpha,
      izin,
      sakit,
      pctHadir: total > 0 ? Math.round((hadir / total) * 100) : 0,
      pctAlpha: total > 0 ? Math.round((alpha / total) * 100) : 0,
      pctIzin: total > 0 ? Math.round((izin / total) * 100) : 0,
      pctSakit: total > 0 ? Math.round((sakit / total) * 100) : 0,
    };
  }, [santriList, rekapRecords]);

  // ============================================================================
  // PERINGATAN DINI SANTRI SERING ALPHA
  // ============================================================================
  const alphaStart = useMemo(
    () => (selectedDate ? addDaysToIso(selectedDate, -(alphaWindowDays - 1)) : ''),
    [selectedDate, alphaWindowDays]
  );

  const frequentAlphaList = useMemo(() => {
    const map = new Map<string, { count: number; dates: string[] }>();

    for (const r of absenList) {
      if (r.status !== 'alpha') continue;
      if (r.tgl < alphaStart || r.tgl > selectedDate) continue;
      const cur = map.get(r.santri_id) || { count: 0, dates: [] };
      cur.count += 1;
      const wLabel = WAKTU_SHOLAT_LIST.find((w) => w.key === r.waktu_sholat)?.label || r.waktu_sholat;
      cur.dates.push(`${r.tgl} (${wLabel})`);
      map.set(r.santri_id, cur);
    }

    return filteredSantri
      .map((s) => {
        const info = map.get(s.id);
        return {
          santri: s,
          alphaCount: info?.count || 0,
          recentDates: (info?.dates || []).slice(0, 5),
        };
      })
      .filter((item) => item.alphaCount >= alphaThreshold)
      .sort((a, b) => b.alphaCount - a.alphaCount);
  }, [absenList, filteredSantri, alphaStart, selectedDate, alphaThreshold]);

  // ============================================================================
  // EKSPOR EXCEL & CETAK A4
  // ============================================================================
  const handleExportExcel = () => {
    if (activeTab === 'alpha') {
      const rows = frequentAlphaList.map((item, idx) => ({
        No: idx + 1,
        NIS: item.santri.nis,
        'Nama Lengkap': item.santri.nama_lengkap,
        Kamar: item.santri.kamar,
        'Jumlah Alpha': item.alphaCount,
        'Rentang Hari': `${alphaWindowDays} Hari Terakhir (${alphaStart} s/d ${selectedDate})`,
        'Riwayat Alpha Terakhir': item.recentDates.join(', '),
      }));
      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Santri_Sering_Alpha');
      XLSX.writeFile(wb, `PERINGATAN_ALPHA_JAMAAH_${selectedDate}.xlsx`);
      showToast('success', 'Excel Diunduh', 'Daftar peringatan dini santri Alpha berhasil diekspor.');
      return;
    }

    if (activeTab === 'laporan') {
      const rows = dailyTakzirList.map((item, idx) => ({
        No: idx + 1,
        NIS: item.santri.nis,
        'Nama Lengkap': item.santri.nama_lengkap,
        Kamar: item.santri.kamar,
        'Waktu Alpha': item.alphaTimes
          .map((t) => WAKTU_SHOLAT_LIST.find((w) => w.key === t)?.label || t)
          .join(', '),
        Alasan: item.alasan || '-',
        'Status Takzir': item.sudahTakzir ? 'Sudah Ditakzir' : 'Belum Ditakzir',
      }));
      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Takzir_Harian');
      XLSX.writeFile(wb, `DAFTAR_TAKZIR_JAMAAH_${selectedDate}.xlsx`);
      showToast('success', 'Excel Diunduh', 'Daftar takzir harian berhasil diekspor.');
      return;
    }

    if (rekapGroupBy === 'kamar') {
      const rows = rekapPerKamar.map((row, idx) => ({
        No: idx + 1,
        Kamar: row.kamar,
        'Jumlah Santri': row.jumlahSantri,
        'Total Sesi (5 Waktu)': row.total,
        Hadir: row.hadir,
        Sakit: row.sakit,
        Izin: row.izin,
        Alpha: row.alpha,
        'Kehadiran (%)': `${row.pct}%`,
      }));
      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Rekap_Per_Kamar');
      XLSX.writeFile(wb, `REKAP_JAMAAH_5WAKTU_KAMAR_${rekapPeriod.toUpperCase()}_${selectedDate}.xlsx`);
    } else {
      const rows = rekapPerSantri.map((row, idx) => ({
        No: idx + 1,
        NIS: row.santri.nis,
        'Nama Lengkap': row.santri.nama_lengkap,
        Kamar: row.santri.kamar,
        'Total Sesi': row.total,
        Hadir: row.hadir,
        Sakit: row.sakit,
        Izin: row.izin,
        Alpha: row.alpha,
        'Kehadiran (%)': `${row.pct}%`,
      }));
      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Rekap_Per_Santri');
      XLSX.writeFile(wb, `REKAP_JAMAAH_5WAKTU_SANTRI_${rekapPeriod.toUpperCase()}_${selectedDate}.xlsx`);
    }
    showToast('success', 'Export Excel Berhasil', 'File rekap absen jamaah 5 waktu telah diunduh.');
  };

  const handlePrintRekap = () => {
    window.print();
  };

  const buildWaWaliMessage = (s: SantriRow, alphaCount: number, recentDates: string[]) => {
    const wali = getWaliContact(s);
    return `Assalamu'alaikum Wr. Wb. Yth. Bapak/Ibu ${wali.nama}, kami pengurus ${pengaturan.nama_pesantren} menginformasikan bahwa ananda ${s.nama_lengkap} (NIS ${s.nis}, Kamar ${s.kamar}) tercatat tidak mengikuti sholat berjamaah tanpa keterangan (Alpha) sebanyak ${alphaCount} waktu dalam ${alphaWindowDays} hari terakhir (${recentDates.slice(0, 3).join(', ')}). Mohon doa serta dukungan keluarga agar ananda semakin istiqomah berjamaah. Wassalamu'alaikum Wr. Wb.`;
  };

  return (
    <div className="space-y-5 relative print:space-y-0">
      {/* PRINT ISOLATION FOR REKAP A4 */}
      <style jsx global>{`
        @media print {
          @page {
            size: A4 portrait;
            margin: 10mm 12mm;
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
          #print-absen-rekap,
          #print-absen-rekap * {
            visibility: visible;
          }
          #print-absen-rekap {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            display: block !important;
            background: #ffffff !important;
          }
        }
      `}</style>

      {/* AREA CETAK REKAP A4 RESMI */}
      <div id="print-absen-rekap" className="hidden bg-white text-slate-900 text-xs">
        <div className="flex items-center gap-4 border-b-4 border-double border-emerald-900 pb-3 mb-4">
          {pengaturan.logo_url && (
            <img
              src={pengaturan.logo_url}
              alt="Logo Pondok"
              referrerPolicy="no-referrer"
              className="w-14 h-14 object-contain shrink-0"
            />
          )}
          <div className="flex-1 text-center">
            <p className="text-[10px] font-bold tracking-widest uppercase text-emerald-900">
              YAYASAN PENDIDIKAN PONDOK PESANTREN AN-NUR
            </p>
            <h1 className="text-base font-extrabold uppercase text-slate-900">
              {pengaturan.nama_pesantren}
            </h1>
            <p className="text-[10px] text-slate-600">{pengaturan.alamat_lengkap}</p>
            <p className="text-[10px] text-slate-600">Telp/WA: {pengaturan.no_telepon}</p>
          </div>
        </div>

        <div className="text-center mb-4">
          <h2 className="text-sm font-extrabold uppercase tracking-wide text-slate-900">
            LAPORAN REKAPITULASI ABSEN SHOLAT JAMAAH 5 WAKTU
          </h2>
          <p className="text-[11px] text-slate-600 mt-0.5">
            {rekapBounds.label} &bull; Cakupan Kamar: {selectedKamar === 'SEMUA' ? 'Semua Kamar' : `Kamar ${selectedKamar}`}
          </p>
          <p className="text-[11px] font-bold text-emerald-900 mt-1">
            Persentase Jamaah Seluruh Santri ({rekapPeriod.toUpperCase()}):{' '}
            {rekapGlobalStats.total > 0 ? `${rekapGlobalStats.pctHadir}%` : '-'} (
            {rekapGlobalStats.hadir}/{rekapGlobalStats.total} sesi &bull; Alpha:{' '}
            {rekapGlobalStats.alpha}, Izin: {rekapGlobalStats.izin}, Sakit: {rekapGlobalStats.sakit})
          </p>
        </div>

        {rekapGroupBy === 'kamar' ? (
          <table className="w-full border-collapse border border-slate-400 text-[10.5px]">
            <thead>
              <tr className="bg-slate-100">
                <th className="border border-slate-400 px-2 py-1.5 text-center">No</th>
                <th className="border border-slate-400 px-2 py-1.5 text-left">Kamar</th>
                <th className="border border-slate-400 px-2 py-1.5 text-right">Santri</th>
                <th className="border border-slate-400 px-2 py-1.5 text-right">Sesi</th>
                <th className="border border-slate-400 px-2 py-1.5 text-right">Hadir</th>
                <th className="border border-slate-400 px-2 py-1.5 text-right">Sakit</th>
                <th className="border border-slate-400 px-2 py-1.5 text-right">Izin</th>
                <th className="border border-slate-400 px-2 py-1.5 text-right">Alpha</th>
                <th className="border border-slate-400 px-2 py-1.5 text-right">Kehadiran</th>
              </tr>
            </thead>
            <tbody>
              {rekapPerKamar.map((row, idx) => (
                <tr key={row.kamar}>
                  <td className="border border-slate-400 px-2 py-1 text-center tabular-nums">{idx + 1}</td>
                  <td className="border border-slate-400 px-2 py-1 font-bold">{row.kamar}</td>
                  <td className="border border-slate-400 px-2 py-1 text-right tabular-nums">{row.jumlahSantri}</td>
                  <td className="border border-slate-400 px-2 py-1 text-right tabular-nums">{row.total}</td>
                  <td className="border border-slate-400 px-2 py-1 text-right tabular-nums">{row.hadir}</td>
                  <td className="border border-slate-400 px-2 py-1 text-right tabular-nums">{row.sakit}</td>
                  <td className="border border-slate-400 px-2 py-1 text-right tabular-nums">{row.izin}</td>
                  <td className="border border-slate-400 px-2 py-1 text-right tabular-nums font-bold">{row.alpha}</td>
                  <td className="border border-slate-400 px-2 py-1 text-right tabular-nums font-bold">{row.pct}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <table className="w-full border-collapse border border-slate-400 text-[10.5px]">
            <thead>
              <tr className="bg-slate-100">
                <th className="border border-slate-400 px-2 py-1.5 text-center">No</th>
                <th className="border border-slate-400 px-2 py-1.5 text-left">NIS</th>
                <th className="border border-slate-400 px-2 py-1.5 text-left">Nama Santri</th>
                <th className="border border-slate-400 px-2 py-1.5 text-left">Kamar</th>
                <th className="border border-slate-400 px-2 py-1.5 text-right">Sesi</th>
                <th className="border border-slate-400 px-2 py-1.5 text-right">Hadir</th>
                <th className="border border-slate-400 px-2 py-1.5 text-right">Sakit</th>
                <th className="border border-slate-400 px-2 py-1.5 text-right">Izin</th>
                <th className="border border-slate-400 px-2 py-1.5 text-right">Alpha</th>
                <th className="border border-slate-400 px-2 py-1.5 text-right">Kehadiran</th>
              </tr>
            </thead>
            <tbody>
              {rekapPerSantri.map((row, idx) => (
                <tr key={row.santri.id}>
                  <td className="border border-slate-400 px-2 py-1 text-center tabular-nums">{idx + 1}</td>
                  <td className="border border-slate-400 px-2 py-1 font-mono tabular-nums">{row.santri.nis}</td>
                  <td className="border border-slate-400 px-2 py-1 font-semibold">{row.santri.nama_lengkap}</td>
                  <td className="border border-slate-400 px-2 py-1">{row.santri.kamar}</td>
                  <td className="border border-slate-400 px-2 py-1 text-right tabular-nums">{row.total}</td>
                  <td className="border border-slate-400 px-2 py-1 text-right tabular-nums">{row.hadir}</td>
                  <td className="border border-slate-400 px-2 py-1 text-right tabular-nums">{row.sakit}</td>
                  <td className="border border-slate-400 px-2 py-1 text-right tabular-nums">{row.izin}</td>
                  <td className="border border-slate-400 px-2 py-1 text-right tabular-nums font-bold">{row.alpha}</td>
                  <td className="border border-slate-400 px-2 py-1 text-right tabular-nums font-bold">{row.pct}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <div className="mt-8 flex justify-end text-center text-[11px]">
          <div className="min-w-[200px] relative">
            <p>Bululawang, {formatTanggalIndo(selectedDate)}</p>
            <p className="font-bold">Kepala Pondok,</p>
            <div className="h-14 relative flex items-center justify-center my-1">
              {pengaturan.stempel_url && (
                <img
                  src={pengaturan.stempel_url}
                  alt="Stempel"
                  referrerPolicy="no-referrer"
                  className="h-14 object-contain opacity-80 -ml-14 absolute"
                />
              )}
              {pengaturan.ttd_kepala_pondok_url && (
                <img
                  src={pengaturan.ttd_kepala_pondok_url}
                  alt="TTD Kepala Pondok"
                  referrerPolicy="no-referrer"
                  className="h-12 object-contain relative z-10"
                />
              )}
            </div>
            <p className="font-bold underline">{pengaturan.nama_kepala_pondok}</p>
          </div>
        </div>
      </div>

      {/* TOAST NOTIFICATIONS (SENADA MODUL LAIN) */}
      <div className="fixed top-5 right-5 z-[100] flex flex-col gap-2.5 max-w-sm w-full pointer-events-none print:hidden">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto bg-white border border-slate-200 border-l-4 rounded-2xl shadow-xl p-4 flex items-start gap-3 ${
              t.type === 'success'
                ? 'border-l-emerald-700'
                : t.type === 'error'
                ? 'border-l-rose-600'
                : 'border-l-amber-600'
            }`}
          >
            {t.type === 'success' && (
              <CheckCircle2 className="w-5 h-5 text-emerald-700 shrink-0 mt-0.5" />
            )}
            {t.type === 'error' && (
              <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
            )}
            {t.type === 'info' && (
              <Info className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            )}
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
              <CheckSquare className="w-6 h-6 text-emerald-700 shrink-0" />
              Absen Sholat Jamaah 5 Waktu
            </h1>
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 mt-1">
              <span>Subuh &middot; Dzuhur &middot; Ashar &middot; Maghrib &middot; Isya</span>
              <span aria-hidden="true">&middot;</span>
              <span>Klik berulang siklus H &rarr; A &rarr; I &rarr; S</span>
              <span aria-hidden="true">&middot;</span>
              <span className="tabular-nums font-medium text-slate-700">
                {santriList.length} Santri Aktif
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleReload}
              disabled={loading}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              Muat Ulang
            </button>
            <button
              type="button"
              onClick={handleExportExcel}
              className="px-4 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 text-xs font-bold rounded-xl flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors"
            >
              <FileSpreadsheet className="w-4 h-4" />
              Ekspor Excel
            </button>
            <button
              type="button"
              onClick={handlePrintRekap}
              className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors"
            >
              <Printer className="w-4 h-4" />
              Cetak Rekap A4
            </button>
          </div>
        </div>

        {/* BILAH 4 TAB FUNGSIONAL */}
        <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-xl overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveTab('input')}
            className={`px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2 whitespace-nowrap shrink-0 transition-colors ${
              activeTab === 'input'
                ? 'bg-emerald-800 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
            }`}
          >
            <CheckSquare className="w-4 h-4" />
            1. Input 5 Waktu Berjejer
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('laporan')}
            className={`px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2 whitespace-nowrap shrink-0 transition-colors ${
              activeTab === 'laporan'
                ? 'bg-emerald-800 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
            }`}
          >
            <ClipboardList className="w-4 h-4" />
            2. Laporan WA &amp; Takzir ({dailySummary.santriDenganAlpha})
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('rekap')}
            className={`px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2 whitespace-nowrap shrink-0 transition-colors ${
              activeTab === 'rekap'
                ? 'bg-emerald-800 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
            }`}
          >
            <BarChart3 className="w-4 h-4" />
            3. Rekap Harian, Mingguan &amp; Bulanan
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('alpha')}
            className={`px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2 whitespace-nowrap shrink-0 transition-colors ${
              activeTab === 'alpha'
                ? 'bg-emerald-800 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
            }`}
          >
            <AlertTriangle className="w-4 h-4" />
            4. Peringatan Dini Alpha ({frequentAlphaList.length})
          </button>
        </div>
      </div>

      {/* ERROR STATE BANNER */}
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

      {/* BANTUAN SQL CONSTRAINT 5 WAKTU (HANYA MUNCUL JIKA SUPABASE MENOLAK MAGHRIB/ISYA) */}
      {dbConstraintFixNeeded && (
        <div className="bg-amber-50 border border-amber-300 rounded-2xl p-4 space-y-3 text-xs text-slate-800 print:hidden">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-2.5">
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-slate-900">
                  Perbarui Constraint Tabel <code className="font-mono">absen_jamaah</code> di Supabase (Sekali Saja)
                </p>
                <p className="text-slate-600 mt-0.5 leading-relaxed">
                  Tidak perlu menambah kolom baru. Salin SQL berikut dan jalankan di{' '}
                  <strong>Supabase Dashboard &rarr; SQL Editor</strong> agar kolom{' '}
                  <code className="font-mono">waktu_sholat</code> menerima Maghrib &amp; Isya:
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setDbConstraintFixNeeded(false)}
              className="text-slate-400 hover:text-slate-600"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <pre className="p-3 bg-white border border-amber-200 rounded-xl font-mono text-[11px] text-slate-800 overflow-x-auto">
            {SUPABASE_FIVE_WAKTU_SQL}
          </pre>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(SUPABASE_FIVE_WAKTU_SQL);
                showToast(
                  'info',
                  'SQL Disalin',
                  'Tempel dan klik Run di SQL Editor Supabase, lalu coba simpan presensi lagi.'
                );
              }}
              className="px-3.5 py-2 bg-emerald-700 hover:bg-emerald-800 text-white font-bold rounded-xl flex items-center gap-1.5"
            >
              <Copy className="w-3.5 h-3.5" />
              Salin Kode SQL
            </button>
          </div>
        </div>
      )}

      {/* KONTROL FILTER UMUM (TANGGAL, KAMAR, PENCARIAN) */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3 print:hidden">
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5">
            <Calendar className="w-4 h-4 text-emerald-700 shrink-0" />
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="bg-transparent text-xs font-bold text-slate-800 focus:outline-none"
            />
          </div>

          <select
            value={selectedKamar}
            onChange={(e) => setSelectedKamar(e.target.value)}
            className="bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-700 px-3 py-2 rounded-xl"
          >
            <option value="SEMUA">Semua Kamar ({santriList.length})</option>
            {kamarOptions.map((km) => (
              <option key={km} value={km}>
                Kamar {km}
              </option>
            ))}
          </select>

          <div className="flex items-center gap-2 text-xs text-slate-500 px-2">
            <span className="font-bold text-emerald-800">H</span> Hadir
            <span aria-hidden="true">&middot;</span>
            <span className="font-bold text-rose-700">A</span> Alpha
            <span aria-hidden="true">&middot;</span>
            <span className="font-bold text-sky-700">I</span> Izin
            <span aria-hidden="true">&middot;</span>
            <span className="font-bold text-amber-700">S</span> Sakit
          </div>
        </div>

        <div className="relative flex-1 lg:max-w-xs">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Cari Nama atau NIS..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-emerald-600"
          />
        </div>
      </div>

      {/* ====================================================================
          TAB 1: MATRIKS INPUT 5 WAKTU BERJEJER (H -> A -> I -> S)
      ==================================================================== */}
      {activeTab === 'input' && (
        <div className="space-y-4 print:hidden">
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col xl:flex-row xl:items-center justify-between gap-4">
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 flex-1">
              <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200">
                <span className="text-[11px] text-slate-500 block">Santri Tampil</span>
                <strong className="text-lg font-bold text-slate-900 tabular-nums">
                  {dailySummary.totalSantri}
                </strong>
              </div>
              <div className="p-2.5 bg-emerald-50 rounded-xl border border-emerald-200">
                <span className="text-[11px] text-emerald-700 block">Hadir (H)</span>
                <strong className="text-lg font-bold text-emerald-900 tabular-nums">
                  {dailySummary.hadir}
                </strong>
              </div>
              <div className="p-2.5 bg-rose-50 rounded-xl border border-rose-200">
                <span className="text-[11px] text-rose-700 block">Alpha (A)</span>
                <strong className="text-lg font-bold text-rose-900 tabular-nums">
                  {dailySummary.alpha}
                </strong>
              </div>
              <div className="p-2.5 bg-sky-50 rounded-xl border border-sky-200">
                <span className="text-[11px] text-sky-700 block">Izin (I)</span>
                <strong className="text-lg font-bold text-sky-900 tabular-nums">
                  {dailySummary.izin}
                </strong>
              </div>
              <div className="p-2.5 bg-amber-50 rounded-xl border border-amber-200">
                <span className="text-[11px] text-amber-700 block">Sakit (S)</span>
                <strong className="text-lg font-bold text-amber-900 tabular-nums">
                  {dailySummary.sakit}
                </strong>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center gap-2.5 shrink-0">
              <div className="text-xs text-slate-600 mr-1">
                {savedCountInScope > 0 ? (
                  <span className="text-emerald-800 font-semibold flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    Tercatat ({savedCountInScope}/{filteredSantri.length})
                  </span>
                ) : (
                  <span className="text-slate-500 flex items-center gap-1.5">
                    <Clock className="w-4 h-4 text-slate-400 shrink-0" />
                    Belum disimpan (Default H)
                  </span>
                )}
              </div>

              <button
                type="button"
                onClick={handleSetSemuaHadir}
                className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Set Semua Hadir
              </button>

              <button
                type="button"
                disabled={saving || loading || filteredSantri.length === 0}
                onClick={handleSaveDailyFiveWaktu}
                className="px-5 py-2.5 bg-emerald-700 hover:bg-emerald-800 disabled:bg-slate-300 text-white text-xs font-bold rounded-xl flex items-center justify-center gap-2 shadow-xs whitespace-nowrap shrink-0 transition-colors"
              >
                <Save className="w-4 h-4" />
                {saving ? 'Menyimpan...' : 'Simpan Absen 5 Waktu'}
              </button>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-700">
                <thead className="bg-slate-50 border-b border-slate-200 font-bold text-slate-600 uppercase text-[11px]">
                  <tr>
                    <th className="p-3.5 w-10 text-center">No</th>
                    <th className="p-3.5">NIS &amp; Nama Santri</th>
                    <th className="p-3.5">Kamar</th>
                    {WAKTU_SHOLAT_LIST.map((w) => (
                      <th key={w.key} className="p-2.5 text-center whitespace-nowrap">
                        {w.label}
                      </th>
                    ))}
                    <th className="p-3.5 min-w-[200px]">Alasan Ketidakhadiran</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {loading ? (
                    <tr>
                      <td colSpan={9} className="p-8 text-center text-slate-400">
                        Memuat daftar santri dan presensi 5 waktu...
                      </td>
                    </tr>
                  ) : filteredSantri.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="p-8 text-center text-slate-400">
                        Tidak ada santri aktif yang cocok dengan filter kamar atau pencarian.
                      </td>
                    </tr>
                  ) : (
                    filteredSantri.map((s, idx) => {
                      const entry = dailyMap[s.id] || {
                        statuses: createDefaultStatuses(),
                        alasan: '',
                        sudahTakzir: false,
                      };
                      const hasNonHadir = WAKTU_SHOLAT_LIST.some(
                        (w) => entry.statuses[w.key] !== 'hadir'
                      );
                      return (
                        <tr
                          key={s.id}
                          className={`transition-colors ${
                            hasNonHadir ? 'bg-amber-50/35 hover:bg-amber-50/60' : 'hover:bg-slate-50'
                          }`}
                        >
                          <td className="p-3.5 text-center font-mono text-slate-400 tabular-nums">
                            {idx + 1}
                          </td>
                          <td className="p-3.5">
                            <div className="font-semibold text-slate-900">{s.nama_lengkap}</div>
                            <div className="font-mono text-[11px] text-emerald-800 tabular-nums">
                              {s.nis}
                            </div>
                          </td>
                          <td className="p-3.5 whitespace-nowrap font-medium text-slate-700">
                            {s.kamar}
                          </td>
                          {WAKTU_SHOLAT_LIST.map((w) => {
                            const st = entry.statuses[w.key];
                            const meta = STATUS_META[st];
                            return (
                              <td key={w.key} className="p-2 text-center">
                                <button
                                  type="button"
                                  title={`${w.label}: ${meta.label} (Klik untuk ubah H → A → I → S)`}
                                  onClick={() => handleCycleStatus(s.id, w.key)}
                                  className={`min-w-[44px] min-h-[40px] px-2.5 py-1.5 rounded-xl border text-xs font-extrabold whitespace-nowrap transition-colors cursor-pointer ${meta.buttonClass}`}
                                >
                                  {meta.code}
                                </button>
                              </td>
                            );
                          })}
                          <td className="p-3">
                            {hasNonHadir ? (
                              <input
                                type="text"
                                placeholder="Tulis alasan (misal sakit demam / izin pulang)..."
                                value={entry.alasan}
                                onChange={(e) => handleChangeAlasan(s.id, e.target.value)}
                                className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-600"
                              />
                            ) : (
                              <span className="text-[11px] text-slate-400">Hadir 5 waktu</span>
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

      {/* ====================================================================
          TAB 2: DAFTAR TAKZIR HARIAN (ALPHA) & LAPORAN GRUP WA SEMUA KAMAR
      ==================================================================== */}
      {activeTab === 'laporan' && (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 print:hidden">
          {/* KOLOM KIRI: DAFTAR TAKZIR HARIAN KHUSUS ALPHA */}
          <div className="xl:col-span-7 bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden flex flex-col">
            <div className="p-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-rose-600" />
                  Daftar Wajib Takzir Harian (Alpha)
                </h2>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Tandai status pelaksanaan takzir bagi santri yang tercatat Alpha pada{' '}
                  {formatTanggalIndo(selectedDate)}.
                </p>
              </div>

              <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl text-xs">
                {(['semua', 'belum', 'sudah'] as const).map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setTakzirFilter(f)}
                    className={`px-3 py-1.5 rounded-lg font-bold capitalize whitespace-nowrap shrink-0 transition-colors ${
                      takzirFilter === f
                        ? 'bg-emerald-800 text-white'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {f === 'semua' ? 'Semua' : f === 'belum' ? 'Belum' : 'Sudah'}
                  </button>
                ))}
              </div>
            </div>

            <div className="overflow-x-auto flex-1">
              <table className="w-full text-left text-xs text-slate-700">
                <thead className="bg-slate-50 border-b border-slate-200 font-bold text-slate-600 uppercase text-[11px]">
                  <tr>
                    <th className="p-3.5 w-10 text-center">No</th>
                    <th className="p-3.5">Santri &amp; Kamar</th>
                    <th className="p-3.5">Waktu Alpha</th>
                    <th className="p-3.5">Keterangan</th>
                    <th className="p-3.5 text-right">Status Takzir</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {dailyTakzirList.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="p-8 text-center text-slate-500">
                        Alhamdulillah, tidak ada santri wajib takzir (Alpha) pada filter saat ini.
                      </td>
                    </tr>
                  ) : (
                    dailyTakzirList.map((item, idx) => (
                      <tr key={item.santri.id} className="hover:bg-slate-50">
                        <td className="p-3.5 text-center font-mono text-slate-400 tabular-nums">
                          {idx + 1}
                        </td>
                        <td className="p-3.5">
                          <div className="font-semibold text-slate-900">{item.santri.nama_lengkap}</div>
                          <div className="text-[11px] text-slate-500">
                            Kamar {item.santri.kamar} &middot; NIS {item.santri.nis}
                          </div>
                        </td>
                        <td className="p-3.5 font-semibold text-rose-700">
                          {item.alphaTimes
                            .map((t) => WAKTU_SHOLAT_LIST.find((w) => w.key === t)?.label || t)
                            .join(', ')}
                        </td>
                        <td className="p-3.5 text-slate-600">{item.alasan || '-'}</td>
                        <td className="p-3.5 text-right">
                          <button
                            type="button"
                            disabled={togglingTakzirId === item.santri.id}
                            onClick={() =>
                              handleToggleTakzirStatus(item.santri.id, !item.sudahTakzir)
                            }
                            className={`min-h-[36px] px-3.5 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap shrink-0 transition-colors border ${
                              item.sudahTakzir
                                ? 'bg-emerald-700 text-white border-emerald-700 hover:bg-emerald-800'
                                : 'bg-rose-50 text-rose-700 border-rose-300 hover:bg-rose-100'
                            }`}
                          >
                            {togglingTakzirId === item.santri.id
                              ? 'Menyimpan...'
                              : item.sudahTakzir
                              ? 'Sudah Ditakzir'
                              : 'Belum Ditakzir'}
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* KOLOM KANAN: GENERATOR LAPORAN HARIAN GRUP WA SEMUA KAMAR */}
          <div className="xl:col-span-5 bg-white rounded-2xl border border-slate-200 shadow-xs p-4 flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                  <MessageCircle className="w-4 h-4 text-emerald-700" />
                  Laporan Harian Grup WA Pengurus
                </h2>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Menampilkan seluruh kamar; hanya santri tidak jamaah beserta alasannya &amp; daftar takzir.
                </p>
              </div>
            </div>

            <textarea
              readOnly
              value={whatsappReportText}
              rows={18}
              className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl font-mono text-[11.5px] leading-relaxed text-slate-800 focus:outline-none resize-y"
            />

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(whatsappReportText);
                  showToast(
                    'success',
                    'Laporan WA Disalin',
                    'Format laporan harian seluruh kamar sudah disalin dan siap ditempel ke grup WA pengurus.'
                  );
                }}
                className="flex-1 px-4 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold rounded-xl flex items-center justify-center gap-2 whitespace-nowrap transition-colors"
              >
                <Copy className="w-4 h-4" />
                Salin Teks Laporan WA
              </button>

              <a
                href={`https://wa.me/?text=${encodeURIComponent(whatsappReportText)}`}
                target="_blank"
                rel="noreferrer"
                className="px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl flex items-center justify-center gap-2 whitespace-nowrap shrink-0 transition-colors"
              >
                <MessageCircle className="w-4 h-4" />
                Buka WhatsApp
              </a>
            </div>
          </div>
        </div>
      )}

      {/* ====================================================================
          TAB 3: REKAP HARIAN, MINGGUAN & BULANAN
      ==================================================================== */}
      {activeTab === 'rekap' && (
        <div className="space-y-4 print:hidden">
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2.5">
              <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl">
                {(['harian', 'mingguan', 'bulanan'] as RekapPeriod[]).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setRekapPeriod(p)}
                    className={`px-3.5 py-1.5 rounded-lg text-xs font-bold capitalize whitespace-nowrap shrink-0 transition-colors ${
                      rekapPeriod === p
                        ? 'bg-emerald-800 text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl">
                <button
                  type="button"
                  onClick={() => setRekapGroupBy('santri')}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors ${
                    rekapGroupBy === 'santri'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Users className="w-3.5 h-3.5" />
                  Per Santri
                </button>
                <button
                  type="button"
                  onClick={() => setRekapGroupBy('kamar')}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap shrink-0 transition-colors ${
                    rekapGroupBy === 'kamar'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Per Kamar
                </button>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600">
              <span>{rekapBounds.label}</span>
              <span aria-hidden="true">&middot;</span>
              <span className="tabular-nums font-bold text-emerald-800">
                Hadir (Filter): {rekapTotals.hadir}
              </span>
              <span className="tabular-nums font-bold text-rose-700">
                Alpha: {rekapTotals.alpha}
              </span>
              <span className="tabular-nums font-semibold text-sky-700">
                Izin: {rekapTotals.izin}
              </span>
              <span className="tabular-nums font-semibold text-amber-700">
                Sakit: {rekapTotals.sakit}
              </span>
            </div>
          </div>

          {/* RINGKASAN PERSENTASE JAMAAH SELURUH SANTRI MENGIKUTI PERIODE */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-xs font-bold uppercase tracking-wide text-slate-700">
                  Persentase Jamaah Seluruh Santri ({rekapPeriod})
                </h2>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Akumulasi seluruh {rekapGlobalStats.totalSantri} santri aktif pada periode{' '}
                  <span className="font-semibold text-slate-700">{rekapBounds.label}</span>
                </p>
              </div>
              <span className="text-[11px] font-semibold text-slate-500 tabular-nums">
                {rekapGlobalStats.hariTercatat} hari tercatat &middot; {rekapGlobalStats.total} sesi
              </span>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
              <div className="col-span-2 lg:col-span-1 p-3 bg-emerald-50 border border-emerald-200 rounded-xl">
                <span className="text-[11px] font-semibold text-emerald-800 block">
                  Persentase Jamaah
                </span>
                <strong className="text-2xl font-extrabold text-emerald-900 tabular-nums block mt-0.5">
                  {rekapGlobalStats.total > 0 ? `${rekapGlobalStats.pctHadir}%` : '0%'}
                </strong>
                <span className="text-[11px] text-emerald-700 tabular-nums">
                  {rekapGlobalStats.hadir}/{rekapGlobalStats.total} sesi hadir
                </span>
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                <span className="text-[11px] font-semibold text-slate-600 block">Hadir (H)</span>
                <strong className="text-xl font-bold text-emerald-800 tabular-nums block mt-0.5">
                  {rekapGlobalStats.hadir}
                </strong>
                <span className="text-[11px] text-slate-500 tabular-nums">
                  {rekapGlobalStats.pctHadir}% dari total sesi
                </span>
              </div>

              <div className="p-3 bg-rose-50/70 border border-rose-200 rounded-xl">
                <span className="text-[11px] font-semibold text-rose-700 block">Alpha (A)</span>
                <strong className="text-xl font-bold text-rose-700 tabular-nums block mt-0.5">
                  {rekapGlobalStats.alpha}
                </strong>
                <span className="text-[11px] text-rose-600 tabular-nums">
                  {rekapGlobalStats.pctAlpha}% dari total sesi
                </span>
              </div>

              <div className="p-3 bg-sky-50/70 border border-sky-200 rounded-xl">
                <span className="text-[11px] font-semibold text-sky-700 block">Izin (I)</span>
                <strong className="text-xl font-bold text-sky-700 tabular-nums block mt-0.5">
                  {rekapGlobalStats.izin}
                </strong>
                <span className="text-[11px] text-sky-600 tabular-nums">
                  {rekapGlobalStats.pctIzin}% dari total sesi
                </span>
              </div>

              <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-xl">
                <span className="text-[11px] font-semibold text-amber-700 block">Sakit (S)</span>
                <strong className="text-xl font-bold text-amber-700 tabular-nums block mt-0.5">
                  {rekapGlobalStats.sakit}
                </strong>
                <span className="text-[11px] text-amber-600 tabular-nums">
                  {rekapGlobalStats.pctSakit}% dari total sesi
                </span>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              {rekapGroupBy === 'santri' ? (
                <table className="w-full text-left text-xs text-slate-700">
                  <thead className="bg-slate-50 border-b border-slate-200 font-bold text-slate-600 uppercase text-[11px]">
                    <tr>
                      <th className="p-3.5 w-12 text-center">No</th>
                      <th className="p-3.5">NIS</th>
                      <th className="p-3.5">Nama Santri</th>
                      <th className="p-3.5">Kamar</th>
                      <th className="p-3.5 text-right">Sesi</th>
                      <th className="p-3.5 text-right">Hadir</th>
                      <th className="p-3.5 text-right">Alpha</th>
                      <th className="p-3.5 text-right">Izin</th>
                      <th className="p-3.5 text-right">Sakit</th>
                      <th className="p-3.5 text-right">Kehadiran</th>
                      <th className="p-3.5">Evaluasi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {rekapPerSantri.length === 0 ? (
                      <tr>
                        <td colSpan={11} className="p-8 text-center text-slate-400">
                          Belum ada data santri yang dapat direkap.
                        </td>
                      </tr>
                    ) : (
                      rekapPerSantri.map((row, idx) => (
                        <tr key={row.santri.id} className="hover:bg-slate-50">
                          <td className="p-3.5 text-center font-mono text-slate-400 tabular-nums">
                            {idx + 1}
                          </td>
                          <td className="p-3.5 font-mono font-bold text-emerald-800 tabular-nums">
                            {row.santri.nis}
                          </td>
                          <td className="p-3.5 font-semibold text-slate-900">
                            {row.santri.nama_lengkap}
                          </td>
                          <td className="p-3.5 text-slate-600">{row.santri.kamar}</td>
                          <td className="p-3.5 text-right font-mono tabular-nums">{row.total}</td>
                          <td className="p-3.5 text-right font-mono font-semibold text-emerald-700 tabular-nums">
                            {row.hadir}
                          </td>
                          <td className="p-3.5 text-right font-mono font-bold text-rose-700 tabular-nums">
                            {row.alpha}
                          </td>
                          <td className="p-3.5 text-right font-mono text-sky-700 tabular-nums">
                            {row.izin}
                          </td>
                          <td className="p-3.5 text-right font-mono text-amber-700 tabular-nums">
                            {row.sakit}
                          </td>
                          <td className="p-3.5 text-right font-mono font-bold text-slate-900 tabular-nums">
                            {row.total > 0 ? `${row.pct}%` : '-'}
                          </td>
                          <td className="p-3.5">
                            {row.total === 0 ? (
                              <span className="text-slate-400">Belum ada sesi</span>
                            ) : row.pct >= 90 ? (
                              <span className="text-emerald-700 font-semibold">Baik</span>
                            ) : row.pct >= 75 ? (
                              <span className="text-amber-700 font-semibold">Perlu Pantau</span>
                            ) : (
                              <span className="text-rose-700 font-bold">Kurang</span>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              ) : (
                <table className="w-full text-left text-xs text-slate-700">
                  <thead className="bg-slate-50 border-b border-slate-200 font-bold text-slate-600 uppercase text-[11px]">
                    <tr>
                      <th className="p-3.5 w-12 text-center">No</th>
                      <th className="p-3.5">Kamar / Khos</th>
                      <th className="p-3.5 text-right">Santri Aktif</th>
                      <th className="p-3.5 text-right">Sesi Tercatat</th>
                      <th className="p-3.5 text-right">Hadir</th>
                      <th className="p-3.5 text-right">Alpha</th>
                      <th className="p-3.5 text-right">Izin</th>
                      <th className="p-3.5 text-right">Sakit</th>
                      <th className="p-3.5 text-right">Kehadiran</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {rekapPerKamar.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="p-8 text-center text-slate-400">
                          Belum ada data kamar yang tersedia.
                        </td>
                      </tr>
                    ) : (
                      rekapPerKamar.map((row, idx) => (
                        <tr key={row.kamar} className="hover:bg-slate-50">
                          <td className="p-3.5 text-center font-mono text-slate-400 tabular-nums">
                            {idx + 1}
                          </td>
                          <td className="p-3.5 font-bold text-slate-900">Kamar {row.kamar}</td>
                          <td className="p-3.5 text-right font-mono tabular-nums">{row.jumlahSantri}</td>
                          <td className="p-3.5 text-right font-mono tabular-nums">{row.total}</td>
                          <td className="p-3.5 text-right font-mono font-semibold text-emerald-700 tabular-nums">
                            {row.hadir}
                          </td>
                          <td className="p-3.5 text-right font-mono font-bold text-rose-700 tabular-nums">
                            {row.alpha}
                          </td>
                          <td className="p-3.5 text-right font-mono text-sky-700 tabular-nums">
                            {row.izin}
                          </td>
                          <td className="p-3.5 text-right font-mono text-amber-700 tabular-nums">
                            {row.sakit}
                          </td>
                          <td className="p-3.5 text-right font-mono font-bold text-slate-900 tabular-nums">
                            {row.total > 0 ? `${row.pct}%` : '-'}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ====================================================================
          TAB 4: PERINGATAN DINI SANTRI SERING ALPHA
      ==================================================================== */}
      {activeTab === 'alpha' && (
        <div className="space-y-4 print:hidden">
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3 text-xs">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-slate-600">Periode Evaluasi:</span>
                <select
                  value={alphaWindowDays}
                  onChange={(e) => setAlphaWindowDays(Number(e.target.value))}
                  className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800"
                >
                  <option value={7}>7 Hari Terakhir</option>
                  <option value={14}>14 Hari Terakhir</option>
                  <option value={30}>30 Hari Terakhir</option>
                </select>
              </div>

              <div className="flex items-center gap-2">
                <span className="font-semibold text-slate-600">Ambang Peringatan:</span>
                <select
                  value={alphaThreshold}
                  onChange={(e) => setAlphaThreshold(Number(e.target.value))}
                  className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-rose-700"
                >
                  <option value={1}>Alpha &ge; 1x</option>
                  <option value={2}>Alpha &ge; 2x</option>
                  <option value={3}>Alpha &ge; 3x</option>
                  <option value={5}>Alpha &ge; 5x</option>
                </select>
              </div>
            </div>

            <div className="text-xs text-slate-500">
              Rentang: <span className="font-medium text-slate-700">{formatTanggalIndo(alphaStart)}</span> s/d{' '}
              <span className="font-medium text-slate-700">{formatTanggalIndo(selectedDate)}</span>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-700">
                <thead className="bg-slate-50 border-b border-slate-200 font-bold text-slate-600 uppercase text-[11px]">
                  <tr>
                    <th className="p-3.5 w-12 text-center">No</th>
                    <th className="p-3.5">NIS</th>
                    <th className="p-3.5">Nama Santri</th>
                    <th className="p-3.5">Kamar</th>
                    <th className="p-3.5 text-right">Total Alpha</th>
                    <th className="p-3.5">Riwayat Terakhir</th>
                    <th className="p-3.5 text-right">Tindak Lanjut Wali</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {frequentAlphaList.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-slate-500">
                        Alhamdulillah, tidak ada santri dengan Alpha &ge; {alphaThreshold} waktu pada rentang{' '}
                        {alphaWindowDays} hari terakhir.
                      </td>
                    </tr>
                  ) : (
                    frequentAlphaList.map((item, idx) => {
                      const wali = getWaliContact(item.santri);
                      const msg = buildWaWaliMessage(item.santri, item.alphaCount, item.recentDates);
                      return (
                        <tr key={item.santri.id} className="hover:bg-rose-50/30">
                          <td className="p-3.5 text-center font-mono text-slate-400 tabular-nums">
                            {idx + 1}
                          </td>
                          <td className="p-3.5 font-mono font-bold text-emerald-800 tabular-nums">
                            {item.santri.nis}
                          </td>
                          <td className="p-3.5 font-semibold text-slate-900">
                            {item.santri.nama_lengkap}
                          </td>
                          <td className="p-3.5 text-slate-600">{item.santri.kamar}</td>
                          <td className="p-3.5 text-right font-mono font-extrabold text-rose-700 tabular-nums">
                            {item.alphaCount}x Alpha
                          </td>
                          <td className="p-3.5 text-[11px] text-slate-500">
                            {item.recentDates.join(' · ')}
                          </td>
                          <td className="p-3.5">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => {
                                  navigator.clipboard.writeText(msg);
                                  showToast(
                                    'info',
                                    'Pesan Disalin',
                                    `Pesan peringatan untuk wali ${item.santri.nama_lengkap} disalin ke clipboard.`
                                  );
                                }}
                                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-semibold flex items-center gap-1 whitespace-nowrap shrink-0"
                              >
                                <Copy className="w-3.5 h-3.5" />
                                Salin Pesan
                              </button>

                              {wali.wa ? (
                                <a
                                  href={`https://wa.me/${wali.wa}?text=${encodeURIComponent(msg)}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg font-bold flex items-center gap-1 whitespace-nowrap shrink-0"
                                >
                                  <MessageCircle className="w-3.5 h-3.5" />
                                  Kirim WA
                                </a>
                              ) : (
                                <span className="text-[11px] text-slate-400">No. WA kosong</span>
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
        </div>
      )}
    </div>
  );
}
