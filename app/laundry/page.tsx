'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import {
  Calendar,
  CalendarOff,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardCopy,
  Clock,
  FileSpreadsheet,
  FileText,
  Loader2,
  Plus,
  Printer,
  RefreshCw,
  Settings2,
  Shirt,
  Trash2,
  X,
} from 'lucide-react';
import { addDaysIso } from '@/lib/dapur';
import {
  type HariLaundryKey,
  type LaundryCatatanItem,
  type LaundryJadwalKamar,
  type StatusLaundry,
  HARI_LABEL_MAP,
  HARI_OPERASIONAL_LIST,
  buildLaundryDailyWaText,
  createLaundryId,
  deleteLaundryCatatanRow,
  fetchAllKamarOptions,
  fetchLaundryCatatan,
  fetchLaundryJadwal,
  formatHariTanggalIndo,
  formatTanggalPendek,
  getCurrentHmLocal,
  getHariKeyFromIso,
  getLocalTodayStr,
  isHariLiburLaundry,
  saveLaundryCatatanRow,
  saveLaundryJadwalDay,
} from '@/lib/laundry';

type MainTab = 'harian' | 'jadwal' | 'laporan';

interface ToastState {
  id: number;
  type: 'success' | 'error' | 'info';
  title: string;
  message: string;
}

interface QuickInputDraft {
  jumlah: string;
  catatan: string;
}

export default function LaundryPage() {
  const [activeTab, setActiveTab] = useState<MainTab>('harian');
  const [todayStr, setTodayStr] = useState<string>('');
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [overrideFridayInput, setOverrideFridayInput] = useState<boolean>(false);

  const [loading, setLoading] = useState<boolean>(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [toasts, setToasts] = useState<ToastState[]>([]);

  const [jadwalList, setJadwalList] = useState<LaundryJadwalKamar[]>([]);
  const [catatanList, setCatatanList] = useState<LaundryCatatanItem[]>([]);
  const [kamarOptions, setKamarOptions] = useState<string[]>([]);

  // Quick inline input state for unrecorded scheduled rooms & existing edits
  const [quickDrafts, setQuickDrafts] = useState<Record<string, QuickInputDraft>>({});
  const [editQtyDrafts, setEditQtyDrafts] = useState<Record<string, QuickInputDraft>>({});

  // Kamar susulan input state
  const [susulanKamar, setSusulanKamar] = useState<string>('');
  const [susulanJumlah, setSusulanJumlah] = useState<string>('');
  const [susulanCatatan, setSusulanCatatan] = useState<string>('');

  // Modal edit jadwal per hari
  const [editingJadwalDay, setEditingJadwalDay] = useState<LaundryJadwalKamar | null>(null);
  const [modalKamarSelection, setModalKamarSelection] = useState<string[]>([]);
  const [customKamarName, setCustomKamarName] = useState<string>('');

  // Tab 3: Laporan Filters
  const [reportMonth, setReportMonth] = useState<string>('');
  const [reportHariFilter, setReportHariFilter] = useState<'semua' | HariLaundryKey>('semua');
  const [reportKamarFilter, setReportKamarFilter] = useState<string>('semua');

  // Delete confirmation modal
  const [deleteConfirm, setDeleteConfirm] = useState<LaundryCatatanItem | null>(null);

  const pushToast = useCallback(
    (type: ToastState['type'], title: string, message: string) => {
      const id = Date.now() + Math.floor(Math.random() * 1000);
      setToasts((prev) => [...prev, { id, type, title, message }]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 4200);
    },
    []
  );

  const loadAllData = useCallback(async () => {
    const [jdw, ctt, kmr] = await Promise.all([
      fetchLaundryJadwal(),
      fetchLaundryCatatan(),
      fetchAllKamarOptions(),
    ]);
    return { jdw, ctt, kmr };
  }, []);

  useEffect(() => {
    let active = true;
    Promise.resolve()
      .then(async () => {
        const today = getLocalTodayStr();
        const data = await loadAllData();
        if (!active) return;
        setTodayStr(today);
        setSelectedDate(today);
        setReportMonth(today.slice(0, 7));
        setJadwalList(data.jdw);
        setCatatanList(data.ctt);
        setKamarOptions(data.kmr);
        if (data.kmr.length > 0) setSusulanKamar(data.kmr[0]);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [loadAllData]);

  const handleRefresh = async () => {
    setLoading(true);
    try {
      const data = await loadAllData();
      setJadwalList(data.jdw);
      setCatatanList(data.ctt);
      setKamarOptions(data.kmr);
      pushToast('info', 'Data Diperbarui', 'Catatan dan jadwal giliran laundry berhasil dimuat.');
    } catch {
      pushToast('error', 'Gagal Memuat', 'Terjadi kendala saat memperbarui data laundry.');
    } finally {
      setLoading(false);
    }
  };

  const selectedHariKey = useMemo<HariLaundryKey>(
    () => (selectedDate ? getHariKeyFromIso(selectedDate) : 'senin'),
    [selectedDate]
  );

  const isFridaySelected = useMemo<boolean>(
    () => (selectedDate ? isHariLiburLaundry(selectedDate) : false),
    [selectedDate]
  );

  // Kamar terjadwal pada hari terpilih
  const scheduledRoomsForDay = useMemo<string[]>(() => {
    if (selectedHariKey === 'jumat') return [];
    const found = jadwalList.find((j) => j.hari_key === selectedHariKey);
    return found ? found.kamar_list : [];
  }, [jadwalList, selectedHariKey]);

  // Catatan pada tanggal terpilih
  const dailyRecords = useMemo<LaundryCatatanItem[]>(() => {
    if (!selectedDate) return [];
    return catatanList
      .filter((c) => c.tanggal === selectedDate)
      .sort((a, b) => a.kamar.localeCompare(b.kamar, 'id'));
  }, [catatanList, selectedDate]);

  // Map kamar -> record hari ini (untuk kamar terjadwal)
  const recordByKamarToday = useMemo(() => {
    const map = new Map<string, LaundryCatatanItem>();
    for (const r of dailyRecords) {
      if (!map.has(r.kamar)) map.set(r.kamar, r);
    }
    return map;
  }, [dailyRecords]);

  // Susulan hari ini (kamar yang tidak masuk daftar jadwal hari terpilih, atau bertipe susulan)
  const susulanRecordsToday = useMemo(() => {
    const scheduledSet = new Set(scheduledRoomsForDay);
    return dailyRecords.filter(
      (r) => r.tipe_setoran === 'susulan' || !scheduledSet.has(r.kamar)
    );
  }, [dailyRecords, scheduledRoomsForDay]);

  // Pilihan kamar untuk input susulan (utamakan kamar di luar giliran hari ini)
  const susulanKamarChoices = useMemo(() => {
    const scheduledSet = new Set(scheduledRoomsForDay);
    const others = kamarOptions.filter((k) => !scheduledSet.has(k));
    return others.length > 0 ? others : kamarOptions;
  }, [kamarOptions, scheduledRoomsForDay]);

  // Summary KPI untuk tanggal terpilih
  const dailySummary = useMemo(() => {
    let totalPotong = 0;
    let selesaiCount = 0;
    let masukCount = 0;
    for (const r of dailyRecords) {
      totalPotong += Number(r.jumlah_potong || 0);
      if (r.status === 'selesai') selesaiCount += 1;
      else masukCount += 1;
    }
    return {
      totalKamarSetor: dailyRecords.length,
      totalScheduled: scheduledRoomsForDay.length,
      totalPotong,
      selesaiCount,
      masukCount,
    };
  }, [dailyRecords, scheduledRoomsForDay.length]);

  // Sync edit drafts when dailyRecords changes
  useEffect(() => {
    let active = true;
    Promise.resolve().then(() => {
      if (!active) return;
      const next: Record<string, QuickInputDraft> = {};
      for (const r of dailyRecords) {
        next[r.id] = {
          jumlah: String(r.jumlah_potong),
          catatan: r.catatan || '',
        };
      }
      setEditQtyDrafts(next);
    });
    return () => {
      active = false;
    };
  }, [dailyRecords]);

  // Catat setoran kamar terjadwal
  const handleSaveScheduledRoom = async (kamar: string) => {
    if (!selectedDate) return;
    const draft = quickDrafts[kamar] || { jumlah: '', catatan: '' };
    const qty = parseInt(draft.jumlah, 10);
    if (Number.isNaN(qty) || qty <= 0) {
      pushToast('error', 'Jumlah Belum Valid', `Masukkan jumlah potong untuk kamar ${kamar}.`);
      return;
    }

    setSavingId(`new-${kamar}`);
    try {
      const nowIso = new Date().toISOString();
      const newItem: LaundryCatatanItem = {
        id: createLaundryId('lnd'),
        tanggal: selectedDate,
        hari_key: selectedHariKey,
        kamar,
        jumlah_potong: qty,
        status: 'masuk',
        tipe_setoran: 'terjadwal',
        jam_masuk: getCurrentHmLocal(),
        jam_selesai: '',
        catatan: draft.catatan.trim(),
        updated_at: nowIso,
        created_at: nowIso,
      };
      const saved = await saveLaundryCatatanRow(newItem, false);
      setCatatanList((prev) => [saved, ...prev]);
      setQuickDrafts((prev) => {
        const next = { ...prev };
        delete next[kamar];
        return next;
      });
      pushToast('success', 'Setoran Tercatat', `Kamar ${kamar} (${qty} potong) masuk daftar cuci.`);
    } finally {
      setSavingId(null);
    }
  };

  // Tambah kamar susulan
  const handleAddSusulan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDate) return;
    const kamar = susulanKamar.trim();
    const qty = parseInt(susulanJumlah, 10);
    if (!kamar) {
      pushToast('error', 'Pilih Kamar', 'Pilih kamar susulan terlebih dahulu.');
      return;
    }
    if (Number.isNaN(qty) || qty <= 0) {
      pushToast('error', 'Jumlah Belum Valid', 'Masukkan jumlah potong (pcs) yang valid.');
      return;
    }

    setSavingId('add-susulan');
    try {
      const nowIso = new Date().toISOString();
      const newItem: LaundryCatatanItem = {
        id: createLaundryId('lnd'),
        tanggal: selectedDate,
        hari_key: selectedHariKey,
        kamar,
        jumlah_potong: qty,
        status: 'masuk',
        tipe_setoran: 'susulan',
        jam_masuk: getCurrentHmLocal(),
        jam_selesai: '',
        catatan: susulanCatatan.trim(),
        updated_at: nowIso,
        created_at: nowIso,
      };
      const saved = await saveLaundryCatatanRow(newItem, false);
      setCatatanList((prev) => [saved, ...prev]);
      setSusulanJumlah('');
      setSusulanCatatan('');
      pushToast('success', 'Susulan Tercatat', `Kamar ${kamar} (${qty} potong) ditambahkan.`);
    } finally {
      setSavingId(null);
    }
  };

  // Update status Masuk <-> Selesai
  const handleToggleStatus = async (item: LaundryCatatanItem) => {
    const nextStatus: StatusLaundry = item.status === 'selesai' ? 'masuk' : 'selesai';
    const updated: LaundryCatatanItem = {
      ...item,
      status: nextStatus,
      jam_selesai: nextStatus === 'selesai' ? getCurrentHmLocal() : '',
      updated_at: new Date().toISOString(),
    };
    setSavingId(item.id);
    try {
      const saved = await saveLaundryCatatanRow(updated, true);
      setCatatanList((prev) => prev.map((r) => (r.id === saved.id ? saved : r)));
      pushToast(
        'success',
        nextStatus === 'selesai' ? 'Laundry Selesai' : 'Dikembalikan ke Masuk',
        `Kamar ${item.kamar} (${item.jumlah_potong} pcs) ditandai ${
          nextStatus === 'selesai' ? 'Selesai' : 'Masuk'
        }.`
      );
    } finally {
      setSavingId(null);
    }
  };

  // Simpan perubahan jumlah potong / catatan baris existing
  const handleUpdateExistingRow = async (item: LaundryCatatanItem) => {
    const draft = editQtyDrafts[item.id];
    if (!draft) return;
    const qty = parseInt(draft.jumlah, 10);
    if (Number.isNaN(qty) || qty <= 0) {
      pushToast('error', 'Jumlah Tidak Valid', 'Jumlah potong harus minimal 1.');
      return;
    }
    const updated: LaundryCatatanItem = {
      ...item,
      jumlah_potong: qty,
      catatan: draft.catatan.trim(),
      updated_at: new Date().toISOString(),
    };
    setSavingId(item.id);
    try {
      const saved = await saveLaundryCatatanRow(updated, true);
      setCatatanList((prev) => prev.map((r) => (r.id === saved.id ? saved : r)));
      pushToast('success', 'Perubahan Disimpan', `Kamar ${item.kamar} diperbarui (${qty} pcs).`);
    } finally {
      setSavingId(null);
    }
  };

  // Tandai semua selesai hari ini
  const handleMarkAllDoneToday = async () => {
    const pending = dailyRecords.filter((r) => r.status === 'masuk');
    if (pending.length === 0) return;
    const nowHm = getCurrentHmLocal();
    const nowIso = new Date().toISOString();
    const updatedMap = new Map<string, LaundryCatatanItem>();
    for (const item of pending) {
      const upd: LaundryCatatanItem = {
        ...item,
        status: 'selesai',
        jam_selesai: nowHm,
        updated_at: nowIso,
      };
      await saveLaundryCatatanRow(upd, true);
      updatedMap.set(upd.id, upd);
    }
    setCatatanList((prev) => prev.map((r) => updatedMap.get(r.id) || r));
    pushToast('success', 'Semua Selesai', `${pending.length} setoran kamar ditandai selesai.`);
  };

  // Hapus catatan
  const handleConfirmDelete = async () => {
    if (!deleteConfirm) return;
    await deleteLaundryCatatanRow(deleteConfirm.id);
    setCatatanList((prev) => prev.filter((r) => r.id !== deleteConfirm.id));
    pushToast('info', 'Catatan Dihapus', `Setoran Kamar ${deleteConfirm.kamar} telah dihapus.`);
    setDeleteConfirm(null);
  };

  // Modal Atur Jadwal Giliran Kamar
  const openEditJadwalModal = (row: LaundryJadwalKamar) => {
    setEditingJadwalDay(row);
    setModalKamarSelection([...row.kamar_list]);
    setCustomKamarName('');
  };

  const toggleKamarInModal = (kamar: string) => {
    setModalKamarSelection((prev) =>
      prev.includes(kamar) ? prev.filter((k) => k !== kamar) : [...prev, kamar]
    );
  };

  const handleAddCustomKamarInModal = () => {
    const clean = customKamarName.trim();
    if (!clean) return;
    if (!kamarOptions.includes(clean)) {
      setKamarOptions((prev) => [...prev, clean]);
    }
    if (!modalKamarSelection.includes(clean)) {
      setModalKamarSelection((prev) => [...prev, clean]);
    }
    setCustomKamarName('');
  };

  const handleSaveJadwalModal = async () => {
    if (!editingJadwalDay) return;
    const updated: LaundryJadwalKamar = {
      ...editingJadwalDay,
      kamar_list: modalKamarSelection,
      updated_at: new Date().toISOString(),
    };
    const saved = await saveLaundryJadwalDay(updated);
    setJadwalList((prev) =>
      prev.map((j) => (j.hari_key === saved.hari_key ? saved : j))
    );
    pushToast(
      'success',
      `Jadwal ${saved.hari_label} Disimpan`,
      `${saved.kamar_list.length} kamar dijadwalkan untuk hari ${saved.hari_label}.`
    );
    setEditingJadwalDay(null);
  };

  // Map kamar -> hari giliran untuk info di modal jadwal
  const roomAssignedDaysMap = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const j of jadwalList) {
      for (const km of j.kamar_list) {
        const cur = map.get(km) || [];
        cur.push(j.hari_label);
        map.set(km, cur);
      }
    }
    return map;
  }, [jadwalList]);

  // Tab 3: Laporan harian dikelompokkan per tanggal
  const reportFilteredRows = useMemo(() => {
    return catatanList.filter((c) => {
      if (reportMonth && !(c.tanggal || '').startsWith(reportMonth)) return false;
      const hariKey = getHariKeyFromIso(c.tanggal);
      if (reportHariFilter !== 'semua' && hariKey !== reportHariFilter) return false;
      if (reportKamarFilter !== 'semua' && c.kamar !== reportKamarFilter) return false;
      return true;
    });
  }, [catatanList, reportMonth, reportHariFilter, reportKamarFilter]);

  const reportDailyGroups = useMemo(() => {
    const groupMap = new Map<string, LaundryCatatanItem[]>();
    for (const r of reportFilteredRows) {
      const arr = groupMap.get(r.tanggal) || [];
      arr.push(r);
      groupMap.set(r.tanggal, arr);
    }
    const entries = Array.from(groupMap.entries()).sort((a, b) => b[0].localeCompare(a[0]));
    return entries.map(([tanggal, items]) => {
      const sortedItems = [...items].sort((a, b) => a.kamar.localeCompare(b.kamar, 'id'));
      const totalPotong = sortedItems.reduce((s, x) => s + Number(x.jumlah_potong || 0), 0);
      const selesaiCount = sortedItems.filter((x) => x.status === 'selesai').length;
      return {
        tanggal,
        hariLabel: HARI_LABEL_MAP[getHariKeyFromIso(tanggal)],
        items: sortedItems,
        totalKamar: sortedItems.length,
        totalPotong,
        selesaiCount,
      };
    });
  }, [reportFilteredRows]);

  const reportAggregate = useMemo(() => {
    let totalPotong = 0;
    let totalSelesai = 0;
    for (const r of reportFilteredRows) {
      totalPotong += Number(r.jumlah_potong || 0);
      if (r.status === 'selesai') totalSelesai += 1;
    }
    return {
      totalHari: reportDailyGroups.length,
      totalSetoran: reportFilteredRows.length,
      totalPotong,
      totalSelesai,
    };
  }, [reportFilteredRows, reportDailyGroups.length]);

  const handleCopyWaDaily = async (tgl: string, rows: LaundryCatatanItem[]) => {
    try {
      await navigator.clipboard.writeText(buildLaundryDailyWaText(tgl, rows));
      pushToast('success', 'Teks WA Disalin', `Laporan ${formatTanggalPendek(tgl)} siap ditempel.`);
    } catch {
      pushToast('error', 'Gagal Menyalin', 'Peramban tidak mengizinkan salin otomatis.');
    }
  };

  const handleCopyWaPeriod = async () => {
    if (reportDailyGroups.length === 0) {
      pushToast('info', 'Belum Ada Data', 'Tidak ada data laporan pada filter terpilih.');
      return;
    }
    const header = `*REKAP LAPORAN SIE LAUNDRY e-PONDOK AN-NUR 1*\nPeriode: ${
      reportMonth || 'Semua Bulan'
    }${reportHariFilter !== 'semua' ? ` · Hari ${HARI_LABEL_MAP[reportHariFilter]}` : ''}\nTotal: ${
      reportAggregate.totalHari
    } hari · ${reportAggregate.totalSetoran} setoran kamar · *${reportAggregate.totalPotong} potong*\n`;

    const body = reportDailyGroups
      .map((g) => {
        const listStr = g.items.map((x) => `${x.kamar} (${x.jumlah_potong} pcs)`).join(', ');
        return `- *${formatHariTanggalIndo(g.tanggal)}*: ${g.totalPotong} pcs — ${listStr}`;
      })
      .join('\n');

    try {
      await navigator.clipboard.writeText(`${header}\n${body}`);
      pushToast('success', 'Rekap WA Disalin', 'Ringkasan laporan laundry berhasil disalin.');
    } catch {
      pushToast('error', 'Gagal Menyalin', 'Peramban tidak mengizinkan salin otomatis.');
    }
  };

  const handleExportExcel = () => {
    const sourceRows = activeTab === 'laporan' ? reportFilteredRows : catatanList;
    if (sourceRows.length === 0) {
      pushToast('info', 'Belum Ada Data', 'Belum ada catatan laundry untuk diekspor.');
      return;
    }

    const detailRows = sourceRows.map((r, idx) => ({
      No: idx + 1,
      Tanggal: r.tanggal,
      Hari: HARI_LABEL_MAP[getHariKeyFromIso(r.tanggal)],
      Kamar: r.kamar,
      Tipe: r.tipe_setoran === 'susulan' ? 'Susulan' : 'Terjadwal',
      Jumlah_Potong_Pcs: r.jumlah_potong,
      Status: r.status === 'selesai' ? 'Selesai' : 'Masuk',
      Jam_Masuk: r.jam_masuk || '-',
      Jam_Selesai: r.jam_selesai || '-',
      Catatan: r.catatan || '',
    }));

    const dailyRows = reportDailyGroups.map((g, idx) => ({
      No: idx + 1,
      Tanggal: g.tanggal,
      Hari: g.hariLabel,
      Jumlah_Kamar: g.totalKamar,
      Total_Potong_Pcs: g.totalPotong,
      Selesai: `${g.selesaiCount}/${g.totalKamar}`,
      Rincian_Kamar: g.items.map((x) => `${x.kamar} (${x.jumlah_potong})`).join(', '),
    }));

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(detailRows), 'Setoran Per Kamar');
    if (dailyRows.length > 0) {
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(dailyRows), 'Rekap Per Hari');
    }
    XLSX.writeFile(wb, `Laporan-Sie-Laundry-${todayStr || 'export'}.xlsx`);
    pushToast('success', 'Excel Diunduh', 'Rekap laporan Sie Laundry berhasil diunduh.');
  };

  return (
    <div className="space-y-6">
      <div className="print:hidden space-y-6">
        {/* TOAST */}
        {toasts.length > 0 && (
          <div className="fixed bottom-16 md:bottom-6 right-4 z-50 space-y-2 max-w-sm w-full pointer-events-none">
            {toasts.map((t) => (
              <div
                key={t.id}
                className={`pointer-events-auto p-3.5 rounded-xl border shadow-lg text-xs flex items-start gap-2.5 bg-white ${
                  t.type === 'error'
                    ? 'border-rose-200 text-rose-900'
                    : t.type === 'success'
                    ? 'border-emerald-200 text-emerald-950'
                    : 'border-slate-200 text-slate-900'
                }`}
              >
                <CheckCircle2
                  className={`w-4 h-4 shrink-0 mt-0.5 ${
                    t.type === 'error'
                      ? 'text-rose-600'
                      : t.type === 'success'
                      ? 'text-emerald-600'
                      : 'text-sky-600'
                  }`}
                />
                <div className="min-w-0 flex-1">
                  <strong className="block font-bold">{t.title}</strong>
                  <span className="text-slate-600 block mt-0.5">{t.message}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* HEADER */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 flex items-center gap-2.5">
              <Shirt className="w-6 h-6 text-emerald-600 shrink-0" />
              Sie Laundry Pondok
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 mt-1">
              Pencatatan jumlah potong (Pcs) per kamar setiap hari Senin–Kamis &amp; Sabtu–Ahad (Hari Jumat Libur Laundry).
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleRefresh}
              disabled={loading}
              className="min-h-[40px] px-3 py-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 text-xs font-semibold rounded-xl inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              Muat Ulang
            </button>
            <button
              type="button"
              onClick={handleExportExcel}
              className="min-h-[40px] px-3 py-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 text-xs font-semibold rounded-xl inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
              Export Excel
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="min-h-[40px] px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-sm inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
            >
              <Printer className="w-4 h-4" />
              Cetak Rekap
            </button>
          </div>
        </div>

        {/* 4 SUMMARY KPI CARDS */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
          <div className="bg-white p-4 rounded-2xl border border-slate-200">
            <span className="text-xs font-semibold text-slate-500 block">
              Kamar Setor ({selectedDate ? formatTanggalPendek(selectedDate) : '-'})
            </span>
            <strong className="text-2xl font-bold text-slate-900 tabular-nums mt-1 block">
              {loading ? '...' : dailySummary.totalKamarSetor}
            </strong>
            <span className="text-[11px] text-slate-500 tabular-nums">
              {isFridaySelected
                ? 'Hari Jumat libur operasional'
                : `${dailySummary.totalScheduled} kamar sesuai giliran hari ini`}
            </span>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-slate-200">
            <span className="text-xs font-semibold text-slate-500 block">Total Jumlah Potong</span>
            <strong className="text-2xl font-bold text-emerald-700 tabular-nums mt-1 block">
              {loading ? '...' : `${dailySummary.totalPotong} pcs`}
            </strong>
            <span className="text-[11px] text-slate-500">Akumulasi potong cucian tanggal dipilih</span>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-slate-200">
            <span className="text-xs font-semibold text-slate-500 block">Sudah Selesai</span>
            <strong className="text-2xl font-bold text-slate-900 tabular-nums mt-1 block">
              {loading ? '...' : dailySummary.selesaiCount}
            </strong>
            <span className="text-[11px] text-emerald-700">Kamar tuntas siap/sudah kembali</span>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-slate-200">
            <span className="text-xs font-semibold text-slate-500 block">Status Masuk (Proses)</span>
            <strong className="text-2xl font-bold text-amber-700 tabular-nums mt-1 block">
              {loading ? '...' : dailySummary.masukCount}
            </strong>
            <span className="text-[11px] text-slate-500">Kamar sedang dalam proses cuci</span>
          </div>
        </div>

        {/* NAVIGATION TABS */}
        <div className="flex flex-wrap items-center gap-1.5 p-1 bg-slate-200/70 rounded-xl w-fit">
          <button
            type="button"
            onClick={() => setActiveTab('harian')}
            className={`min-h-[38px] px-4 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
              activeTab === 'harian'
                ? 'bg-white text-emerald-800 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Calendar className="w-3.5 h-3.5" />
            Catatan Harian
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('jadwal')}
            className={`min-h-[38px] px-4 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
              activeTab === 'jadwal'
                ? 'bg-white text-emerald-800 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Settings2 className="w-3.5 h-3.5" />
            Jadwal Giliran Kamar
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('laporan')}
            className={`min-h-[38px] px-4 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
              activeTab === 'laporan'
                ? 'bg-white text-emerald-800 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            Laporan Laundry
          </button>
        </div>

        {/* ======================================================= */}
        {/* TAB 1: CATATAN HARIAN                                   */}
        {/* ======================================================= */}
        {activeTab === 'harian' && (
          <div className="space-y-4">
            {/* PEMILIH TANGGAL & AKSI CEPAT */}
            <div className="bg-white p-4 rounded-2xl border border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    if (!selectedDate) return;
                    setSelectedDate(addDaysIso(selectedDate, -1));
                    setOverrideFridayInput(false);
                  }}
                  aria-label="Hari sebelumnya"
                  className="min-h-[40px] min-w-[40px] px-2.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 inline-flex items-center justify-center"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => {
                    setSelectedDate(e.target.value);
                    setOverrideFridayInput(false);
                  }}
                  className="min-h-[40px] px-3 py-1.5 text-xs sm:text-sm font-mono tabular-nums border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
                <button
                  type="button"
                  onClick={() => {
                    if (!selectedDate) return;
                    setSelectedDate(addDaysIso(selectedDate, 1));
                    setOverrideFridayInput(false);
                  }}
                  aria-label="Hari berikutnya"
                  className="min-h-[40px] min-w-[40px] px-2.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 inline-flex items-center justify-center"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
                {todayStr && selectedDate !== todayStr && (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedDate(todayStr);
                      setOverrideFridayInput(false);
                    }}
                    className="min-h-[40px] px-3 py-1.5 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-800 text-xs font-semibold whitespace-nowrap"
                  >
                    Hari Ini
                  </button>
                )}
                <div className="text-xs sm:text-sm font-bold text-slate-800 pl-1">
                  {selectedDate ? formatHariTanggalIndo(selectedDate) : '-'}
                  <span className="font-normal text-slate-500">
                    {' '}
                    &middot; {isFridaySelected ? 'Libur Laundry' : 'Hari Operasional'}
                  </span>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                {dailyRecords.some((r) => r.status === 'masuk') && (
                  <button
                    type="button"
                    onClick={handleMarkAllDoneToday}
                    className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-800 text-xs font-bold inline-flex items-center gap-1.5 whitespace-nowrap"
                  >
                    <Check className="w-3.5 h-3.5" />
                    Tandai Semua Selesai
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => handleCopyWaDaily(selectedDate, dailyRecords)}
                  className="min-h-[38px] px-3.5 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap"
                >
                  <ClipboardCopy className="w-3.5 h-3.5 text-emerald-600" />
                  Salin WA Hari Ini
                </button>
              </div>
            </div>

            {loading ? (
              <div className="bg-white p-10 rounded-2xl border border-slate-200 text-center text-xs text-slate-500 flex flex-col items-center gap-2">
                <Loader2 className="w-5 h-5 animate-spin text-emerald-600" />
                <span>Memuat catatan laundry...</span>
              </div>
            ) : isFridaySelected && !overrideFridayInput && dailyRecords.length === 0 ? (
              <div className="bg-white p-8 rounded-2xl border border-slate-200 text-center space-y-3">
                <CalendarOff className="w-10 h-10 text-slate-400 mx-auto" />
                <div className="max-w-md mx-auto space-y-1">
                  <h2 className="text-base font-bold text-slate-900">
                    Hari Jumat — Jadwal Libur Laundry
                  </h2>
                  <p className="text-xs text-slate-500">
                    Operasional Sie Laundry berjalan setiap hari Senin–Kamis &amp; Sabtu–Ahad.
                    Tidak ada giliran kamar terjadwal pada hari Jumat.
                  </p>
                </div>
                <div className="flex flex-wrap justify-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setSelectedDate(addDaysIso(selectedDate, 1))}
                    className="min-h-[40px] px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl"
                  >
                    Lanjut ke Hari Sabtu
                  </button>
                  <button
                    type="button"
                    onClick={() => setOverrideFridayInput(true)}
                    className="min-h-[40px] px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl"
                  >
                    Catat Setoran Susulan / Darurat
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-5">
                {/* BAGIAN A: KAMAR SESUAI JADWAL GILIRAN HARI INI */}
                {!isFridaySelected && (
                  <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                    <div className="px-5 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <h2 className="text-sm font-bold text-slate-900">
                          Jadwal Giliran Kamar Hari {HARI_LABEL_MAP[selectedHariKey]} (
                          {scheduledRoomsForDay.length} Kamar)
                        </h2>
                        <p className="text-xs text-slate-500 mt-0.5">
                          Masukkan jumlah potong (pcs) per kamar lalu klik Catat Masuk, atau ubah status ke Selesai jika sudah beres.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setActiveTab('jadwal')}
                        className="text-xs font-semibold text-emerald-700 hover:underline whitespace-nowrap"
                      >
                        Ubah Giliran Kamar
                      </button>
                    </div>

                    {scheduledRoomsForDay.length === 0 ? (
                      <div className="p-6 text-center text-xs text-slate-500">
                        Belum ada kamar terjadwal untuk hari {HARI_LABEL_MAP[selectedHariKey]}. Atur di tab Jadwal Giliran Kamar.
                      </div>
                    ) : (
                      <div className="divide-y divide-slate-100">
                        {scheduledRoomsForDay.map((kamar) => {
                          const existing = recordByKamarToday.get(kamar);
                          const draft = quickDrafts[kamar] || { jumlah: '', catatan: '' };
                          const editDraft = existing
                            ? editQtyDrafts[existing.id] || {
                                jumlah: String(existing.jumlah_potong),
                                catatan: existing.catatan,
                              }
                            : null;

                          if (!existing) {
                            return (
                              <div
                                key={kamar}
                                className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white hover:bg-slate-50/60"
                              >
                                <div className="min-w-0 sm:w-48">
                                  <span className="text-sm font-bold text-slate-900 block">
                                    Kamar {kamar}
                                  </span>
                                  <span className="text-[11px] text-slate-500">
                                    Giliran tetap &middot; Belum setor
                                  </span>
                                </div>

                                <div className="flex flex-wrap sm:flex-nowrap items-center gap-2 flex-1 justify-end">
                                  <div className="flex items-center gap-1.5">
                                    <input
                                      type="number"
                                      min={1}
                                      value={draft.jumlah}
                                      onChange={(e) =>
                                        setQuickDrafts((prev) => ({
                                          ...prev,
                                          [kamar]: { ...draft, jumlah: e.target.value },
                                        }))
                                      }
                                      placeholder="0"
                                      className="w-24 min-h-[40px] px-3 py-1.5 text-xs sm:text-sm font-mono font-bold tabular-nums text-right border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
                                    />
                                    <span className="text-xs font-semibold text-slate-500">pcs</span>
                                  </div>
                                  <input
                                    type="text"
                                    value={draft.catatan}
                                    onChange={(e) =>
                                      setQuickDrafts((prev) => ({
                                        ...prev,
                                        [kamar]: { ...draft, catatan: e.target.value },
                                      }))
                                    }
                                    placeholder="Catatan singkat (opsional)"
                                    className="flex-1 min-w-[140px] sm:max-w-xs min-h-[40px] px-3 py-1.5 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => handleSaveScheduledRoom(kamar)}
                                    disabled={savingId === `new-${kamar}`}
                                    className="min-h-[40px] px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-xs font-bold rounded-xl whitespace-nowrap shrink-0"
                                  >
                                    {savingId === `new-${kamar}` ? 'Menyimpan...' : 'Catat Masuk'}
                                  </button>
                                </div>
                              </div>
                            );
                          }

                          const isChanged =
                            editDraft !== null &&
                            (editDraft.jumlah !== String(existing.jumlah_potong) ||
                              editDraft.catatan !== (existing.catatan || ''));

                          return (
                            <div
                              key={existing.id}
                              className="p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3 bg-emerald-50/20"
                            >
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="text-sm font-bold text-slate-900">
                                    Kamar {existing.kamar}
                                  </span>
                                  <span
                                    className={`px-2 py-0.5 rounded-md border text-[11px] font-bold ${
                                      existing.status === 'selesai'
                                        ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                        : 'bg-amber-50 text-amber-800 border-amber-200'
                                    }`}
                                  >
                                    {existing.status === 'selesai' ? 'Selesai' : 'Masuk'}
                                  </span>
                                </div>
                                <div className="text-[11px] text-slate-500 mt-0.5 flex flex-wrap items-center gap-1.5 font-mono tabular-nums">
                                  <span className="inline-flex items-center gap-1">
                                    <Clock className="w-3 h-3" />
                                    Masuk {existing.jam_masuk || '-'}
                                  </span>
                                  {existing.jam_selesai && (
                                    <>
                                      <span aria-hidden="true">&middot;</span>
                                      <span>Selesai {existing.jam_selesai}</span>
                                    </>
                                  )}
                                </div>
                              </div>

                              <div className="flex flex-wrap items-center gap-2 justify-end">
                                <div className="flex items-center gap-1.5">
                                  <input
                                    type="number"
                                    min={1}
                                    value={editDraft?.jumlah ?? String(existing.jumlah_potong)}
                                    onChange={(e) =>
                                      setEditQtyDrafts((prev) => ({
                                        ...prev,
                                        [existing.id]: {
                                          jumlah: e.target.value,
                                          catatan: editDraft?.catatan ?? existing.catatan,
                                        },
                                      }))
                                    }
                                    className="w-20 min-h-[38px] px-2.5 py-1 text-xs font-mono font-bold tabular-nums text-right border border-slate-200 rounded-xl bg-white"
                                  />
                                  <span className="text-xs font-semibold text-slate-600">pcs</span>
                                </div>
                                <input
                                  type="text"
                                  value={editDraft?.catatan ?? existing.catatan}
                                  onChange={(e) =>
                                    setEditQtyDrafts((prev) => ({
                                      ...prev,
                                      [existing.id]: {
                                        jumlah: editDraft?.jumlah ?? String(existing.jumlah_potong),
                                        catatan: e.target.value,
                                      },
                                    }))
                                  }
                                  placeholder="Catatan..."
                                  className="w-36 sm:w-44 min-h-[38px] px-2.5 py-1 text-xs border border-slate-200 rounded-xl bg-white"
                                />
                                {isChanged && (
                                  <button
                                    type="button"
                                    onClick={() => handleUpdateExistingRow(existing)}
                                    disabled={savingId === existing.id}
                                    className="min-h-[38px] px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-900 text-white text-xs font-semibold whitespace-nowrap"
                                  >
                                    Simpan
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => handleToggleStatus(existing)}
                                  disabled={savingId === existing.id}
                                  className={`min-h-[38px] px-3.5 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap border transition-colors ${
                                    existing.status === 'selesai'
                                      ? 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                                      : 'bg-emerald-600 border-emerald-600 text-white hover:bg-emerald-700'
                                  }`}
                                >
                                  {existing.status === 'selesai'
                                    ? 'Ubah ke Masuk'
                                    : 'Tandai Selesai'}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setDeleteConfirm(existing)}
                                  aria-label="Hapus catatan"
                                  className="min-h-[38px] min-w-[38px] rounded-xl border border-rose-200 text-rose-600 hover:bg-rose-50 inline-flex items-center justify-center"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {/* BAGIAN B: KAMAR SUSULAN / DI LUAR GILIRAN */}
                <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                  <div className="px-5 py-4 border-b border-slate-200">
                    <h2 className="text-sm font-bold text-slate-900">
                      Setoran Kamar Susulan / Tambahan ({susulanRecordsToday.length})
                    </h2>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Catat kamar di luar giliran hari ini yang menyetor cucian susulan.
                    </p>
                  </div>

                  {/* Form Tambah Susulan */}
                  <form
                    onSubmit={handleAddSusulan}
                    className="p-4 bg-slate-50/70 border-b border-slate-200 flex flex-col sm:flex-row sm:items-end gap-2.5"
                  >
                    <div className="sm:w-52">
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                        Pilih Kamar
                      </label>
                      <select
                        value={susulanKamar}
                        onChange={(e) => setSusulanKamar(e.target.value)}
                        className="w-full min-h-[40px] px-3 py-1.5 text-xs border border-slate-200 rounded-xl bg-white font-medium"
                      >
                        {susulanKamarChoices.map((k) => (
                          <option key={k} value={k}>
                            Kamar {k}
                          </option>
                        ))}
                        {kamarOptions
                          .filter((k) => !susulanKamarChoices.includes(k))
                          .map((k) => (
                            <option key={k} value={k}>
                              Kamar {k} (Giliran hari ini)
                            </option>
                          ))}
                      </select>
                    </div>

                    <div className="sm:w-32">
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                        Jumlah (Potong)
                      </label>
                      <input
                        type="number"
                        min={1}
                        value={susulanJumlah}
                        onChange={(e) => setSusulanJumlah(e.target.value)}
                        placeholder="Contoh: 18"
                        className="w-full min-h-[40px] px-3 py-1.5 text-xs font-mono font-bold tabular-nums border border-slate-200 rounded-xl bg-white"
                      />
                    </div>

                    <div className="flex-1 min-w-0">
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                        Catatan (Opsional)
                      </label>
                      <input
                        type="text"
                        value={susulanCatatan}
                        onChange={(e) => setSusulanCatatan(e.target.value)}
                        placeholder="Misal: titipan telat dari hari kemarin"
                        className="w-full min-h-[40px] px-3 py-1.5 text-xs border border-slate-200 rounded-xl bg-white"
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={savingId === 'add-susulan'}
                      className="min-h-[40px] px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl inline-flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0"
                    >
                      <Plus className="w-4 h-4" />
                      Tambah Susulan
                    </button>
                  </form>

                  {susulanRecordsToday.length === 0 ? (
                    <div className="p-5 text-center text-xs text-slate-500">
                      Belum ada setoran kamar susulan pada tanggal ini.
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-100">
                      {susulanRecordsToday.map((item) => {
                        const editDraft = editQtyDrafts[item.id] || {
                          jumlah: String(item.jumlah_potong),
                          catatan: item.catatan,
                        };
                        const isChanged =
                          editDraft.jumlah !== String(item.jumlah_potong) ||
                          editDraft.catatan !== (item.catatan || '');

                        return (
                          <div
                            key={item.id}
                            className="p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3 bg-white"
                          >
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-sm font-bold text-slate-900">
                                  Kamar {item.kamar}
                                </span>
                                <span className="text-[11px] text-slate-500">&middot; Susulan</span>
                                <span
                                  className={`px-2 py-0.5 rounded-md border text-[11px] font-bold ${
                                    item.status === 'selesai'
                                      ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                      : 'bg-amber-50 text-amber-800 border-amber-200'
                                  }`}
                                >
                                  {item.status === 'selesai' ? 'Selesai' : 'Masuk'}
                                </span>
                              </div>
                              <div className="text-[11px] text-slate-500 mt-0.5 font-mono tabular-nums">
                                Masuk {item.jam_masuk || '-'}
                                {item.jam_selesai ? ` · Selesai ${item.jam_selesai}` : ''}
                              </div>
                            </div>

                            <div className="flex flex-wrap items-center gap-2 justify-end">
                              <div className="flex items-center gap-1.5">
                                <input
                                  type="number"
                                  min={1}
                                  value={editDraft.jumlah}
                                  onChange={(e) =>
                                    setEditQtyDrafts((prev) => ({
                                      ...prev,
                                      [item.id]: { ...editDraft, jumlah: e.target.value },
                                    }))
                                  }
                                  className="w-20 min-h-[38px] px-2.5 py-1 text-xs font-mono font-bold tabular-nums text-right border border-slate-200 rounded-xl"
                                />
                                <span className="text-xs font-semibold text-slate-600">pcs</span>
                              </div>
                              <input
                                type="text"
                                value={editDraft.catatan}
                                onChange={(e) =>
                                  setEditQtyDrafts((prev) => ({
                                    ...prev,
                                    [item.id]: { ...editDraft, catatan: e.target.value },
                                  }))
                                }
                                placeholder="Catatan..."
                                className="w-36 sm:w-44 min-h-[38px] px-2.5 py-1 text-xs border border-slate-200 rounded-xl"
                              />
                              {isChanged && (
                                <button
                                  type="button"
                                  onClick={() => handleUpdateExistingRow(item)}
                                  className="min-h-[38px] px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-900 text-white text-xs font-semibold"
                                >
                                  Simpan
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => handleToggleStatus(item)}
                                className={`min-h-[38px] px-3.5 py-1.5 rounded-xl text-xs font-bold border whitespace-nowrap ${
                                  item.status === 'selesai'
                                    ? 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                                    : 'bg-emerald-600 border-emerald-600 text-white hover:bg-emerald-700'
                                }`}
                              >
                                {item.status === 'selesai' ? 'Ubah ke Masuk' : 'Tandai Selesai'}
                              </button>
                              <button
                                type="button"
                                onClick={() => setDeleteConfirm(item)}
                                aria-label="Hapus catatan"
                                className="min-h-[38px] min-w-[38px] rounded-xl border border-rose-200 text-rose-600 hover:bg-rose-50 inline-flex items-center justify-center"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ======================================================= */}
        {/* TAB 2: JADWAL GILIRAN KAMAR                             */}
        {/* ======================================================= */}
        {activeTab === 'jadwal' && (
          <div className="space-y-4">
            <div className="bg-white p-5 rounded-2xl border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-sm sm:text-base font-bold text-slate-900">
                  Pembagian Jadwal Giliran Kamar Tetap (Sabtu–Kamis)
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Atur kamar mana saja yang terjadwal setor cucian pada tiap hari operasional. Hari Jumat otomatis libur laundry.
                </p>
              </div>
              <span className="px-3 py-1.5 rounded-xl bg-slate-100 text-slate-700 text-xs font-semibold whitespace-nowrap shrink-0">
                Jumat: Libur Operasional
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {HARI_OPERASIONAL_LIST.map((hari) => {
                const row = jadwalList.find((j) => j.hari_key === hari.key) || {
                  id: `ljk-${hari.key}`,
                  hari_key: hari.key,
                  hari_label: hari.label,
                  kamar_list: [],
                  updated_at: '',
                };

                return (
                  <div
                    key={hari.key}
                    className="bg-white rounded-2xl border border-slate-200 p-5 flex flex-col justify-between gap-4"
                  >
                    <div className="space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <span className="text-[11px] text-slate-500 block">Hari Operasional</span>
                          <h3 className="text-base font-bold text-slate-900">{hari.label}</h3>
                        </div>
                        <span className="font-mono tabular-nums text-xs font-bold text-emerald-700">
                          {row.kamar_list.length} Kamar
                        </span>
                      </div>

                      {row.kamar_list.length === 0 ? (
                        <p className="text-xs text-slate-400 italic py-2">
                          Belum ada kamar dijadwalkan pada hari {hari.label}.
                        </p>
                      ) : (
                        <div className="flex flex-wrap gap-1.5">
                          {row.kamar_list.map((kamar) => (
                            <span
                              key={kamar}
                              className="px-2.5 py-1 rounded-lg bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-800"
                            >
                              {kamar}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => openEditJadwalModal(row)}
                      className="min-h-[38px] w-full px-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-emerald-50 hover:border-emerald-200 hover:text-emerald-800 text-xs font-semibold text-slate-700 inline-flex items-center justify-center gap-1.5 transition-colors"
                    >
                      <Settings2 className="w-3.5 h-3.5" />
                      Atur Kamar Hari {hari.label}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ======================================================= */}
        {/* TAB 3: LAPORAN LAUNDRY                                  */}
        {/* ======================================================= */}
        {activeTab === 'laporan' && (
          <div className="space-y-4">
            <div className="bg-white p-4 rounded-2xl border border-slate-200 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="month"
                  value={reportMonth}
                  onChange={(e) => setReportMonth(e.target.value)}
                  className="min-h-[40px] px-3 py-1.5 text-xs font-mono tabular-nums border border-slate-200 rounded-xl bg-white"
                />
                {reportMonth && (
                  <button
                    type="button"
                    onClick={() => setReportMonth('')}
                    className="min-h-[40px] px-3 py-1.5 text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl"
                  >
                    Semua Bulan
                  </button>
                )}

                <select
                  value={reportHariFilter}
                  onChange={(e) =>
                    setReportHariFilter(e.target.value as 'semua' | HariLaundryKey)
                  }
                  className="min-h-[40px] px-3 py-1.5 text-xs border border-slate-200 rounded-xl bg-white font-medium text-slate-700"
                >
                  <option value="semua">Semua Hari</option>
                  {HARI_OPERASIONAL_LIST.map((h) => (
                    <option key={h.key} value={h.key}>
                      Hari {h.label}
                    </option>
                  ))}
                  <option value="jumat">Hari Jumat (Susulan)</option>
                </select>

                <select
                  value={reportKamarFilter}
                  onChange={(e) => setReportKamarFilter(e.target.value)}
                  className="min-h-[40px] px-3 py-1.5 text-xs border border-slate-200 rounded-xl bg-white font-medium text-slate-700"
                >
                  <option value="semua">Semua Kamar</option>
                  {kamarOptions.map((k) => (
                    <option key={k} value={k}>
                      Kamar {k}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={handleCopyWaPeriod}
                  className="min-h-[40px] px-3.5 py-2 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-xl inline-flex items-center gap-1.5 whitespace-nowrap"
                >
                  <ClipboardCopy className="w-3.5 h-3.5 text-emerald-600" />
                  Salin Rekap WA
                </button>
              </div>
            </div>

            {/* RINGKASAN PERIODE LAPORAN */}
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-white p-4 rounded-2xl border border-slate-200">
                <span className="text-xs text-slate-500 block">Hari Tercatat</span>
                <strong className="text-xl font-bold text-slate-900 tabular-nums mt-0.5 block">
                  {reportAggregate.totalHari} hari
                </strong>
              </div>
              <div className="bg-white p-4 rounded-2xl border border-slate-200">
                <span className="text-xs text-slate-500 block">Total Setoran Kamar</span>
                <strong className="text-xl font-bold text-slate-900 tabular-nums mt-0.5 block">
                  {reportAggregate.totalSetoran} kamar
                </strong>
              </div>
              <div className="bg-white p-4 rounded-2xl border border-slate-200">
                <span className="text-xs text-slate-500 block">Akumulasi Potong</span>
                <strong className="text-xl font-bold text-emerald-700 tabular-nums mt-0.5 block">
                  {reportAggregate.totalPotong} pcs
                </strong>
              </div>
            </div>

            {reportDailyGroups.length === 0 ? (
              <div className="bg-white p-10 rounded-2xl border border-slate-200 text-center space-y-2">
                <Shirt className="w-8 h-8 text-slate-400 mx-auto" />
                <p className="text-xs font-semibold text-slate-700">
                  Belum ada laporan setoran laundry pada filter ini.
                </p>
                <p className="text-[11px] text-slate-500">
                  Mulai catat setoran cucian per kamar di tab Catatan Harian.
                </p>
              </div>
            ) : (
              <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-slate-600">
                        <th className="px-4 py-3 font-semibold whitespace-nowrap">
                          Hari &amp; Tanggal
                        </th>
                        <th className="px-4 py-3 font-semibold">
                          Rincian Kamar &amp; Jumlah Potong
                        </th>
                        <th className="px-4 py-3 font-semibold text-right whitespace-nowrap">
                          Total Potong
                        </th>
                        <th className="px-4 py-3 font-semibold text-center whitespace-nowrap">
                          Status
                        </th>
                        <th className="px-4 py-3 font-semibold text-right whitespace-nowrap">
                          Aksi
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {reportDailyGroups.map((group) => (
                        <tr key={group.tanggal} className="hover:bg-slate-50/60 align-top">
                          <td className="px-4 py-3 whitespace-nowrap">
                            <span className="font-bold text-slate-900 block">
                              {group.hariLabel}
                            </span>
                            <span className="font-mono tabular-nums text-[11px] text-slate-500">
                              {formatTanggalPendek(group.tanggal)}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex flex-wrap gap-1.5">
                              {group.items.map((x) => (
                                <span
                                  key={x.id}
                                  className={`px-2 py-1 rounded-lg border text-[11px] font-medium tabular-nums ${
                                    x.status === 'selesai'
                                      ? 'bg-emerald-50/70 border-emerald-200 text-emerald-900'
                                      : 'bg-amber-50/70 border-amber-200 text-amber-900'
                                  }`}
                                >
                                  <strong>{x.kamar}</strong>: {x.jumlah_potong} pcs
                                  {x.tipe_setoran === 'susulan' ? ' (Susulan)' : ''}
                                </span>
                              ))}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right whitespace-nowrap font-mono font-bold text-slate-900 tabular-nums">
                            {group.totalPotong} pcs
                            <span className="block font-sans font-normal text-[11px] text-slate-500">
                              {group.totalKamar} kamar
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center whitespace-nowrap">
                            <span
                              className={`px-2 py-0.5 rounded-md border text-[11px] font-bold tabular-nums ${
                                group.selesaiCount === group.totalKamar
                                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                  : 'bg-amber-50 text-amber-800 border-amber-200'
                              }`}
                            >
                              {group.selesaiCount}/{group.totalKamar} Selesai
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right whitespace-nowrap">
                            <div className="inline-flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => handleCopyWaDaily(group.tanggal, group.items)}
                                title="Salin WA tanggal ini"
                                className="p-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
                              >
                                <ClipboardCopy className="w-3.5 h-3.5 text-emerald-600" />
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedDate(group.tanggal);
                                  setActiveTab('harian');
                                }}
                                className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-emerald-700 hover:bg-emerald-50"
                              >
                                Buka
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ======================================================= */}
      {/* MODAL ATUR KAMAR GILIRAN PER HARI                       */}
      {/* ======================================================= */}
      {editingJadwalDay && (
        <div className="print:hidden fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-[1px] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl w-full max-w-xl max-h-[90vh] flex flex-col overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-2">
              <div>
                <h3 className="text-sm sm:text-base font-bold text-slate-900">
                  Atur Giliran Kamar — Hari {editingJadwalDay.hari_label}
                </h3>
                <p className="text-xs text-slate-500">
                  Pilih kamar yang rutin menyetor cucian pada hari {editingJadwalDay.hari_label}.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingJadwalDay(null)}
                className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {kamarOptions.map((kamar) => {
                  const checked = modalKamarSelection.includes(kamar);
                  const otherDays = (roomAssignedDaysMap.get(kamar) || []).filter(
                    (d) => d !== editingJadwalDay.hari_label
                  );
                  return (
                    <button
                      key={kamar}
                      type="button"
                      onClick={() => toggleKamarInModal(kamar)}
                      className={`p-2.5 rounded-xl border text-left transition-colors ${
                        checked
                          ? 'bg-emerald-50 border-emerald-500 text-emerald-950'
                          : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-xs font-bold truncate">{kamar}</span>
                        {checked && <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />}
                      </div>
                      {otherDays.length > 0 && (
                        <span className="text-[10px] text-slate-500 block mt-0.5 truncate">
                          Juga di: {otherDays.join(', ')}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              <div className="border-t border-slate-200 pt-3 space-y-1.5">
                <label className="block text-xs font-semibold text-slate-700">
                  Tambah Nama Kamar Lainnya (Opsional)
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={customKamarName}
                    onChange={(e) => setCustomKamarName(e.target.value)}
                    placeholder="Contoh: B1 / Asrama Baru"
                    className="flex-1 min-h-[38px] px-3 py-1.5 text-xs border border-slate-200 rounded-xl"
                  />
                  <button
                    type="button"
                    onClick={handleAddCustomKamarInModal}
                    className="min-h-[38px] px-3.5 py-1.5 bg-slate-800 hover:bg-slate-900 text-white text-xs font-semibold rounded-xl"
                  >
                    Tambahkan
                  </button>
                </div>
              </div>
            </div>

            <div className="px-5 py-3.5 border-t border-slate-200 flex items-center justify-between gap-2">
              <span className="text-xs text-slate-500 tabular-nums">
                Terpilih: <strong>{modalKamarSelection.length}</strong> kamar
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setEditingJadwalDay(null)}
                  className="min-h-[38px] px-4 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={handleSaveJadwalModal}
                  className="min-h-[38px] px-4 py-1.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl"
                >
                  Simpan Jadwal
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL KONFIRMASI HAPUS */}
      {deleteConfirm && (
        <div className="print:hidden fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-[1px] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl w-full max-w-sm p-5 space-y-4">
            <h3 className="text-sm font-bold text-slate-900">Konfirmasi Hapus</h3>
            <p className="text-xs text-slate-600">
              Yakin ingin menghapus catatan laundry{' '}
              <strong>
                Kamar {deleteConfirm.kamar} ({deleteConfirm.jumlah_potong} pcs)
              </strong>{' '}
              pada tanggal {formatTanggalPendek(deleteConfirm.tanggal)}?
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteConfirm(null)}
                className="min-h-[38px] px-4 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                className="min-h-[38px] px-4 py-1.5 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl"
              >
                Ya, Hapus
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================= */}
      {/* LEMBAR CETAK REKAP LAUNDRY (HANYA TAMPIL SAAT PRINT)    */}
      {/* ======================================================= */}
      <div className="hidden print:block p-6 bg-white text-slate-900 space-y-4">
        <div className="border-b-2 border-slate-900 pb-3 text-center">
          <p className="text-xs font-bold uppercase tracking-wider">
            Pondok Pesantren An-Nur 1 Bululawang · Sie Laundry
          </p>
          <h1 className="text-xl font-bold mt-1">Rekap Laporan Setoran Laundry Kamar</h1>
          <p className="text-xs mt-1">
            Periode: {reportMonth || 'Semua Bulan'}
            {reportHariFilter !== 'semua'
              ? ` · Hari ${HARI_LABEL_MAP[reportHariFilter]}`
              : ''}{' '}
            &middot; Total {reportAggregate.totalPotong} potong ({reportAggregate.totalSetoran}{' '}
            setoran kamar)
          </p>
        </div>

        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="bg-slate-100">
              <th className="border border-slate-400 px-2.5 py-1.5 text-left w-36">Hari &amp; Tgl</th>
              <th className="border border-slate-400 px-2.5 py-1.5 text-left">
                Kamar &amp; Jumlah Potong (Pcs)
              </th>
              <th className="border border-slate-400 px-2.5 py-1.5 text-right w-24">Total Pcs</th>
              <th className="border border-slate-400 px-2.5 py-1.5 text-center w-24">Status</th>
            </tr>
          </thead>
          <tbody>
            {reportDailyGroups.map((g) => (
              <tr key={g.tanggal}>
                <td className="border border-slate-400 px-2.5 py-1.5 font-semibold">
                  {g.hariLabel}, {formatTanggalPendek(g.tanggal)}
                </td>
                <td className="border border-slate-400 px-2.5 py-1.5">
                  {g.items
                    .map(
                      (x) =>
                        `${x.kamar}: ${x.jumlah_potong} pcs (${
                          x.status === 'selesai' ? 'Selesai' : 'Masuk'
                        })`
                    )
                    .join(' · ')}
                </td>
                <td className="border border-slate-400 px-2.5 py-1.5 text-right font-mono font-bold">
                  {g.totalPotong}
                </td>
                <td className="border border-slate-400 px-2.5 py-1.5 text-center font-mono">
                  {g.selesaiCount}/{g.totalKamar}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
