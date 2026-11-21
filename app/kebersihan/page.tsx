'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  ClipboardList,
  Copy,
  Edit3,
  MapPin,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Sun,
  Sunset,
  Trash2,
  Users,
  X,
  XCircle,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { TransparencyBanner, useAuth } from '@/lib/auth';
import { DEFAULT_KAMAR_MASTER } from '@/lib/pengaturan';
import {
  formatTanggalIndoKebersihan,
  getWibTodayDateStr,
  isFridayIso,
  type KebersihanArea,
  type KebersihanJadwalItem,
  type KebersihanMode,
  type KebersihanSesi,
  type KebersihanStatus,
} from '@/lib/kebersihan';

interface SantriOption {
  id: string;
  nis: string;
  nama_lengkap: string;
  kamar: string;
  status: string;
}

type ActiveTab = 'jadwal' | 'area' | 'evaluasi';

export default function KebersihanPage() {
  const { canEditModule, pengurus } = useAuth();
  const canEdit = canEditModule('kebersihan');
  const isReadOnly = !canEdit;

  const [activeTab, setActiveTab] = useState<ActiveTab>('jadwal');
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [mode, setMode] = useState<KebersihanMode>('harian');
  const [sesi, setSesi] = useState<KebersihanSesi>('pagi');

  const [areas, setAreas] = useState<KebersihanArea[]>([]);
  const [jadwalList, setJadwalList] = useState<KebersihanJadwalItem[]>([]);
  const [santriList, setSantriList] = useState<SantriOption[]>([]);
  const [kamarOptions, setKamarOptions] = useState<string[]>(DEFAULT_KAMAR_MASTER);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Form Area Modal
  const [areaModalOpen, setAreaModalOpen] = useState(false);
  const [editingArea, setEditingArea] = useState<KebersihanArea | null>(null);
  const [areaNama, setAreaNama] = useState('');
  const [areaDeskripsi, setAreaDeskripsi] = useState('');
  const [areaUrutan, setAreaUrutan] = useState('1');

  // Form Plotting Petugas / Kamar
  const [plotAreaId, setPlotAreaId] = useState('');
  const [plotSantriSearch, setPlotSantriSearch] = useState('');
  const [plotSantriId, setPlotSantriId] = useState('');
  const [showSantriDropdown, setShowSantriDropdown] = useState(false);
  const [plotKamar, setPlotKamar] = useState('');
  const [plotCatatan, setPlotCatatan] = useState('');

  // Filter Evaluasi Ketidaklaksanaan
  const [evalSearch, setEvalSearch] = useState('');
  const [evalModeFilter, setEvalModeFilter] = useState<'semua' | KebersihanMode>('semua');

  const showToast = useCallback((type: 'success' | 'error', text: string) => {
    setToast({ type, text });
    setTimeout(() => setToast(null), 4000);
  }, []);

  const handleDateChange = (nextDate: string) => {
    setSelectedDate(nextDate);
    if (isFridayIso(nextDate)) {
      setMode('roan_jumat');
      setSesi('jumat_pagi');
    } else if (mode === 'roan_jumat') {
      setMode('harian');
      setSesi('pagi');
    }
  };

  const handleModeChange = (nextMode: KebersihanMode) => {
    setMode(nextMode);
    if (nextMode === 'roan_jumat') {
      setSesi('jumat_pagi');
    } else if (sesi === 'jumat_pagi') {
      setSesi('pagi');
    }
  };

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [areaRes, jadwalRes, santriRes, settingRes] = await Promise.all([
        supabase.from('kebersihan_area').select('*').order('urutan', { ascending: true }),
        supabase
          .from('kebersihan_jadwal')
          .select('*')
          .order('tanggal', { ascending: false })
          .limit(600),
        supabase
          .from('v_santri_aman')
          .select('id, nis, nama_lengkap, kamar, status')
          .in('status', ['aktif', 'ndalem', 'beasiswa_lazis'])
          .order('nama_lengkap', { ascending: true }),
        supabase
          .from('pengaturan_aplikasi')
          .select('aturan_operasional')
          .eq('id', 1)
          .maybeSingle(),
      ]);

      const loadedAreas = (areaRes.data || []) as KebersihanArea[];
      setAreas(loadedAreas);
      if (loadedAreas.length > 0 && !plotAreaId) {
        setPlotAreaId(loadedAreas[0].id);
      }

      setJadwalList((jadwalRes.data || []) as KebersihanJadwalItem[]);

      // Fallback ke tabel santri bila view v_santri_aman belum dibuat di DB
      if (santriRes.error) {
        const fallbackSantri = await supabase
          .from('santri')
          .select('id, nis, nama_lengkap, kamar, status')
          .in('status', ['aktif', 'ndalem', 'beasiswa_lazis'])
          .order('nama_lengkap', { ascending: true });
        setSantriList((fallbackSantri.data || []) as SantriOption[]);
      } else {
        setSantriList((santriRes.data || []) as SantriOption[]);
      }

      const aturan = (settingRes.data as { aturan_operasional?: { daftar_kamar?: string[] } } | null)
        ?.aturan_operasional;
      if (Array.isArray(aturan?.daftar_kamar) && aturan.daftar_kamar.length > 0) {
        setKamarOptions(aturan.daftar_kamar);
        if (!plotKamar) setPlotKamar(aturan.daftar_kamar[0]);
      } else if (!plotKamar) {
        setPlotKamar(DEFAULT_KAMAR_MASTER[0]);
      }
    } finally {
      setLoading(false);
    }
  }, [plotAreaId, plotKamar]);

  useEffect(() => {
    const timer = setTimeout(() => {
      const today = getWibTodayDateStr();
      setSelectedDate((prev) => prev || today);
      if (isFridayIso(today)) {
        setMode('roan_jumat');
        setSesi('jumat_pagi');
      }
      void fetchAll();
    }, 0);
    return () => clearTimeout(timer);
  }, [fetchAll]);

  const activeAreas = useMemo(() => areas.filter((a) => a.aktif !== false), [areas]);

  const currentSlotItems = useMemo(() => {
    return jadwalList.filter(
      (item) => item.tanggal === selectedDate && item.mode === mode && item.sesi === sesi
    );
  }, [jadwalList, mode, selectedDate, sesi]);

  const slotStats = useMemo(() => {
    const total = currentSlotItems.length;
    const terlaksana = currentSlotItems.filter((i) => i.status === 'terlaksana').length;
    const tidak = total - terlaksana;
    const persen = total > 0 ? Math.round((terlaksana / total) * 100) : 0;
    return { total, terlaksana, tidak, persen };
  }, [currentSlotItems]);

  const filteredSantriOptions = useMemo(() => {
    const q = plotSantriSearch.trim().toLowerCase();
    if (!q) return santriList.slice(0, 60);
    return santriList
      .filter(
        (s) =>
          s.nama_lengkap.toLowerCase().includes(q) ||
          (s.kamar || '').toLowerCase().includes(q) ||
          (s.nis || '').toLowerCase().includes(q)
      )
      .slice(0, 60);
  }, [plotSantriSearch, santriList]);

  const missedHistory = useMemo(() => {
    return jadwalList.filter((item) => {
      if (item.status !== 'tidak_terlaksana') return false;
      if (evalModeFilter !== 'semua' && item.mode !== evalModeFilter) return false;
      const q = evalSearch.trim().toLowerCase();
      if (!q) return true;
      return (
        (item.santri_nama || '').toLowerCase().includes(q) ||
        (item.kamar || '').toLowerCase().includes(q) ||
        (item.area_nama || '').toLowerCase().includes(q)
      );
    });
  }, [evalModeFilter, evalSearch, jadwalList]);

  const handleSaveArea = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit || !areaNama.trim()) return;
    setSaving(true);
    try {
      const payload = {
        nama_area: areaNama.trim(),
        deskripsi: areaDeskripsi.trim(),
        urutan: parseInt(areaUrutan, 10) || 10,
        aktif: true,
      };
      if (editingArea) {
        const { error } = await supabase
          .from('kebersihan_area')
          .update(payload)
          .eq('id', editingArea.id);
        if (error) throw error;
        showToast('success', `Area "${payload.nama_area}" diperbarui.`);
      } else {
        const { error } = await supabase.from('kebersihan_area').insert(payload);
        if (error) throw error;
        showToast('success', `Area "${payload.nama_area}" ditambahkan.`);
      }
      setAreaModalOpen(false);
      setEditingArea(null);
      setAreaNama('');
      setAreaDeskripsi('');
      await fetchAll();
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Gagal menyimpan area.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteArea = async (area: KebersihanArea) => {
    if (!canEdit) return;
    setSaving(true);
    try {
      const { error } = await supabase.from('kebersihan_area').delete().eq('id', area.id);
      if (error) throw error;
      showToast('success', `Area "${area.nama_area}" dihapus.`);
      await fetchAll();
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Gagal menghapus area.');
    } finally {
      setSaving(false);
    }
  };

  const handleAddPlotting = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit) return;

    const area = activeAreas.find((a) => a.id === plotAreaId) || activeAreas[0];
    if (!area) {
      showToast('error', 'Buat minimal 1 Area Piket terlebih dahulu.');
      return;
    }

    if (mode === 'harian' && !plotSantriId) {
      showToast('error', 'Pilih nama santri yang bertugas pada area ini.');
      return;
    }
    if (mode === 'roan_jumat' && !plotKamar) {
      showToast('error', 'Pilih kamar yang bertugas pada area Ro\'an Jum\'at.');
      return;
    }

    const santri = santriList.find((s) => s.id === plotSantriId);

    setSaving(true);
    try {
      const { error } = await supabase.from('kebersihan_jadwal').insert({
        tanggal: selectedDate,
        mode,
        sesi,
        area_id: area.id,
        area_nama: area.nama_area,
        santri_id: mode === 'harian' ? santri?.id || null : null,
        santri_nama: mode === 'harian' ? santri?.nama_lengkap || null : null,
        kamar: mode === 'roan_jumat' ? plotKamar : santri?.kamar || null,
        status: 'tidak_terlaksana',
        catatan: plotCatatan.trim(),
        dicatat_oleh: pengurus?.nama_lengkap || '',
      });
      if (error) throw error;

      setPlotCatatan('');
      setPlotSantriId('');
      setPlotSantriSearch('');
      setShowSantriDropdown(false);
      showToast('success', 'Petugas piket berhasil diplot.');
      await fetchAll();
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Gagal menyimpan jadwal.');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleStatus = async (item: KebersihanJadwalItem, nextStatus: KebersihanStatus) => {
    if (!canEdit) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from('kebersihan_jadwal')
        .update({
          status: nextStatus,
          dicatat_oleh: pengurus?.nama_lengkap || '',
          updated_at: new Date().toISOString(),
        })
        .eq('id', item.id);
      if (error) throw error;
      setJadwalList((prev) =>
        prev.map((row) => (row.id === item.id ? { ...row, status: nextStatus } : row))
      );
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Gagal mengubah status.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteJadwal = async (id: string) => {
    if (!canEdit) return;
    setSaving(true);
    try {
      const { error } = await supabase.from('kebersihan_jadwal').delete().eq('id', id);
      if (error) throw error;
      setJadwalList((prev) => prev.filter((row) => row.id !== id));
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Gagal menghapus tugas.');
    } finally {
      setSaving(false);
    }
  };

  const handleCopyPreviousSchedule = async () => {
    if (!canEdit) return;
    const prevSlots = jadwalList.filter(
      (item) => item.mode === mode && item.sesi === sesi && item.tanggal < selectedDate
    );
    if (prevSlots.length === 0) {
      showToast('error', 'Belum ada data pembagian tugas sebelumnya untuk disalin.');
      return;
    }
    const latestPrevDate = prevSlots.reduce(
      (acc, cur) => (cur.tanggal > acc ? cur.tanggal : acc),
      prevSlots[0].tanggal
    );
    const sourceRows = prevSlots.filter((item) => item.tanggal === latestPrevDate);

    setSaving(true);
    try {
      const rowsToInsert = sourceRows.map((src) => ({
        tanggal: selectedDate,
        mode,
        sesi,
        area_id: src.area_id,
        area_nama: src.area_nama,
        santri_id: src.santri_id || null,
        santri_nama: src.santri_nama || null,
        kamar: src.kamar || null,
        status: 'tidak_terlaksana' as KebersihanStatus,
        catatan: '',
        dicatat_oleh: pengurus?.nama_lengkap || '',
      }));

      const { error } = await supabase.from('kebersihan_jadwal').insert(rowsToInsert);
      if (error) throw error;
      showToast(
        'success',
        `Berhasil menyalin ${rowsToInsert.length} pembagian tugas dari ${formatTanggalIndoKebersihan(latestPrevDate)}.`
      );
      await fetchAll();
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Gagal menyalin jadwal sebelumnya.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <TransparencyBanner moduleLabel="Kebersihan & Jadwal Piket" isReadOnly={isReadOnly} />

      {toast && (
        <div
          className={`fixed bottom-20 md:bottom-6 right-4 z-50 rounded-xl px-4 py-3 text-sm font-semibold shadow-lg border ${
            toast.type === 'success'
              ? 'bg-emerald-900 text-white border-emerald-700'
              : 'bg-rose-800 text-white border-rose-700'
          }`}
        >
          {toast.text}
        </div>
      )}

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 flex items-center gap-2.5">
            <Sparkles className="w-6 h-6 text-[#065f46]" />
            Kebersihan &amp; Jadwal Piket Pondok
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Plotting piket harian per santri (Sabtu–Kamis Pagi &amp; Sore), Ro&apos;an Jum&apos;at Pagi per kamar, dan rekap evaluasi.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void fetchAll()}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 px-3.5 py-2 text-xs sm:text-sm font-semibold text-slate-700 min-h-[42px]"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Muat Ulang
        </button>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl w-full sm:w-fit overflow-x-auto border border-slate-200">
        <button
          type="button"
          onClick={() => setActiveTab('jadwal')}
          className={`px-4 py-2 text-xs sm:text-sm font-semibold rounded-lg transition whitespace-nowrap shrink-0 min-h-[40px] ${
            activeTab === 'jadwal'
              ? 'bg-white text-slate-900 shadow-xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          Jadwal &amp; Ceklis Piket
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('area')}
          className={`px-4 py-2 text-xs sm:text-sm font-semibold rounded-lg transition whitespace-nowrap shrink-0 min-h-[40px] ${
            activeTab === 'area'
              ? 'bg-white text-slate-900 shadow-xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          Master Area Piket ({activeAreas.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('evaluasi')}
          className={`px-4 py-2 text-xs sm:text-sm font-semibold rounded-lg transition whitespace-nowrap shrink-0 min-h-[40px] ${
            activeTab === 'evaluasi'
              ? 'bg-white text-slate-900 shadow-xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          Riwayat Tidak Terlaksana ({missedHistory.length})
        </button>
      </div>

      {activeTab === 'jadwal' && (
        <div className="space-y-5">
          {/* Toolbar Tanggal, Mode & Sesi */}
          <div className="rounded-2xl bg-white border border-slate-200 p-4 sm:p-5 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                  Tanggal Pelaksanaan
                </label>
                <div className="relative">
                  <Calendar className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="date"
                    value={selectedDate}
                    onChange={(e) => handleDateChange(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 text-sm rounded-xl border border-slate-300 bg-white text-slate-900 font-medium min-h-[42px]"
                  />
                </div>
                <p className="text-xs text-slate-500 mt-1">{formatTanggalIndoKebersihan(selectedDate)}</p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                  Mode Jadwal Piket
                </label>
                <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-100 rounded-xl border border-slate-200">
                  <button
                    type="button"
                    onClick={() => handleModeChange('harian')}
                    className={`py-2 px-2.5 text-xs font-semibold rounded-lg transition min-h-[38px] ${
                      mode === 'harian'
                        ? 'bg-[#065f46] text-white'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Piket Harian (Sabtu–Kamis)
                  </button>
                  <button
                    type="button"
                    onClick={() => handleModeChange('roan_jumat')}
                    className={`py-2 px-2.5 text-xs font-semibold rounded-lg transition min-h-[38px] ${
                      mode === 'roan_jumat'
                        ? 'bg-[#065f46] text-white'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Ro&apos;an Jum&apos;at Pagi
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                  {mode === 'harian' ? 'Sesi Harian' : 'Sesi General Cleaning'}
                </label>
                {mode === 'harian' ? (
                  <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-100 rounded-xl border border-slate-200">
                    <button
                      type="button"
                      onClick={() => setSesi('pagi')}
                      className={`inline-flex items-center justify-center gap-1.5 py-2 px-3 text-xs font-semibold rounded-lg transition min-h-[38px] ${
                        sesi === 'pagi'
                          ? 'bg-white text-slate-900 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <Sun className="w-3.5 h-3.5 text-amber-600" />
                      Pagi
                    </button>
                    <button
                      type="button"
                      onClick={() => setSesi('sore')}
                      className={`inline-flex items-center justify-center gap-1.5 py-2 px-3 text-xs font-semibold rounded-lg transition min-h-[38px] ${
                        sesi === 'sore'
                          ? 'bg-white text-slate-900 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <Sunset className="w-3.5 h-3.5 text-orange-600" />
                      Sore
                    </button>
                  </div>
                ) : (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-xs font-semibold text-emerald-900 min-h-[42px] flex items-center gap-2">
                    <Users className="w-4 h-4 text-emerald-700" />
                    Ro&apos;an Jum&apos;at Pagi (Plotting Per Kamar)
                  </div>
                )}
              </div>
            </div>

            {/* Ringkasan Cepat + Tombol Salin */}
            <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-4 text-xs sm:text-sm text-slate-600 tabular-nums">
                <span>
                  Total Plotting: <strong className="text-slate-900">{slotStats.total}</strong>
                </span>
                <span aria-hidden="true">·</span>
                <span className="text-emerald-700 font-semibold">
                  Terlaksana: {slotStats.terlaksana}
                </span>
                <span aria-hidden="true">·</span>
                <span className="text-rose-700 font-semibold">
                  Tidak Terlaksana: {slotStats.tidak}
                </span>
                <span aria-hidden="true">·</span>
                <span>
                  Capaian: <strong className="text-slate-900">{slotStats.persen}%</strong>
                </span>
              </div>

              {canEdit && (
                <button
                  type="button"
                  onClick={() => void handleCopyPreviousSchedule()}
                  disabled={saving}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-700 text-emerald-800 hover:bg-emerald-50 px-3.5 py-2 text-xs font-semibold transition disabled:opacity-50 min-h-[40px]"
                >
                  <Copy className="w-3.5 h-3.5" />
                  Salin Pembagian Tugas Sebelumnya
                </button>
              )}
            </div>
          </div>

          {/* Form Tambah Plotting (Khusus Pengurus Berwenang) */}
          {canEdit && (
            <form
              onSubmit={handleAddPlotting}
              className="rounded-2xl bg-white border border-slate-200 p-4 sm:p-5 space-y-4"
            >
              <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Plus className="w-4 h-4 text-[#065f46]" />
                {mode === 'harian'
                  ? 'Plot Santri ke Area Piket Harian'
                  : "Plot Kamar ke Area Ro'an Jum'at Pagi"}
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Area Piket
                  </label>
                  <select
                    value={plotAreaId}
                    onChange={(e) => setPlotAreaId(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 min-h-[42px]"
                  >
                    {activeAreas.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.nama_area}
                      </option>
                    ))}
                  </select>
                </div>

                {mode === 'harian' ? (
                  <div className="md:col-span-2 relative">
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Cari &amp; Pilih Santri Bertugas
                    </label>
                    <div className="relative">
                      <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        type="text"
                        value={plotSantriSearch}
                        onFocus={() => setShowSantriDropdown(true)}
                        onBlur={() => setTimeout(() => setShowSantriDropdown(false), 150)}
                        onChange={(e) => {
                          setPlotSantriSearch(e.target.value);
                          setPlotSantriId('');
                          setShowSantriDropdown(true);
                        }}
                        placeholder="Ketik nama santri, NIS, atau kamar..."
                        autoComplete="off"
                        className={`w-full pl-9 pr-9 py-2 text-sm rounded-xl border bg-white min-h-[42px] focus:outline-none focus:ring-2 focus:ring-emerald-600 ${
                          plotSantriId
                            ? 'border-emerald-500 text-slate-900 font-semibold'
                            : 'border-slate-300 text-slate-900'
                        }`}
                      />
                      {(plotSantriSearch || plotSantriId) && (
                        <button
                          type="button"
                          aria-label="Hapus pilihan santri"
                          onClick={() => {
                            setPlotSantriSearch('');
                            setPlotSantriId('');
                            setShowSantriDropdown(true);
                          }}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>

                    {showSantriDropdown && (
                      <div className="absolute z-30 left-0 right-0 mt-1 max-h-60 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-xl divide-y divide-slate-100">
                        {filteredSantriOptions.length === 0 ? (
                          <div className="px-3.5 py-3 text-xs text-slate-500">
                            Tidak ditemukan santri yang cocok dengan &ldquo;{plotSantriSearch}&rdquo;.
                          </div>
                        ) : (
                          filteredSantriOptions.map((s) => (
                            <button
                              key={s.id}
                              type="button"
                              onMouseDown={(e) => {
                                e.preventDefault();
                                setPlotSantriId(s.id);
                                setPlotSantriSearch(`${s.nama_lengkap} (${s.kamar || '-'})`);
                                setShowSantriDropdown(false);
                              }}
                              className={`w-full text-left px-3.5 py-2.5 text-xs hover:bg-emerald-50 flex items-center justify-between gap-2 transition-colors ${
                                plotSantriId === s.id ? 'bg-emerald-50/80' : ''
                              }`}
                            >
                              <div className="min-w-0">
                                <p className="font-bold text-slate-900 truncate">{s.nama_lengkap}</p>
                                <p className="text-[11px] text-slate-500 font-mono tabular-nums">
                                  NIS {s.nis || '-'}
                                </p>
                              </div>
                              <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 font-semibold text-[11px] shrink-0">
                                Kamar {s.kamar || '-'}
                              </span>
                            </button>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="md:col-span-2">
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Pilih Kamar Bertugas (Ro&apos;an Serentak)
                    </label>
                    <select
                      value={plotKamar}
                      onChange={(e) => setPlotKamar(e.target.value)}
                      required
                      className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 min-h-[42px]"
                    >
                      {kamarOptions.map((k) => (
                        <option key={k} value={k}>
                          Kamar {k}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div>
                  <button
                    type="submit"
                    disabled={saving}
                    className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-[#065f46] hover:bg-emerald-900 text-white px-4 py-2.5 text-sm font-semibold transition disabled:opacity-50 min-h-[42px]"
                  >
                    <Plus className="w-4 h-4" />
                    Tambah Tugas
                  </button>
                </div>
              </div>
            </form>
          )}

          {/* Daftar Area & Petugas */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {activeAreas.map((area) => {
              const items = currentSlotItems.filter(
                (i) => i.area_id === area.id || i.area_nama === area.nama_area
              );
              return (
                <div
                  key={area.id}
                  className="rounded-2xl bg-white border border-slate-200 p-4 sm:p-5 flex flex-col gap-3"
                >
                  <div className="flex items-start justify-between gap-2 border-b border-slate-100 pb-3">
                    <div>
                      <h3 className="text-sm sm:text-base font-bold text-slate-900 flex items-center gap-2">
                        <MapPin className="w-4 h-4 text-[#065f46] shrink-0" />
                        {area.nama_area}
                      </h3>
                      {area.deskripsi && (
                        <p className="text-xs text-slate-500 mt-0.5">{area.deskripsi}</p>
                      )}
                    </div>
                    <span className="text-xs font-semibold text-slate-500 tabular-nums whitespace-nowrap">
                      {items.length} tugas
                    </span>
                  </div>

                  {items.length === 0 ? (
                    <p className="text-xs text-slate-400 py-4 text-center">
                      Belum ada petugas diplot untuk area ini pada sesi terpilih.
                    </p>
                  ) : (
                    <div className="divide-y divide-slate-100">
                      {items.map((item) => {
                        const isDone = item.status === 'terlaksana';
                        return (
                          <div
                            key={item.id}
                            className="py-2.5 flex flex-wrap items-center justify-between gap-2"
                          >
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-slate-900 truncate">
                                {item.mode === 'roan_jumat'
                                  ? `Kamar ${item.kamar || '-'}`
                                  : item.santri_nama || '-'}
                              </p>
                              <p className="text-xs text-slate-500">
                                {item.mode === 'roan_jumat'
                                  ? "Ro'an Jum'at Pagi"
                                  : `Kamar ${item.kamar || '-'}`}
                              </p>
                            </div>

                            <div className="flex items-center gap-1.5 shrink-0">
                              <button
                                type="button"
                                disabled={isReadOnly || saving}
                                onClick={() => void handleToggleStatus(item, 'terlaksana')}
                                className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold border transition min-h-[38px] ${
                                  isDone
                                    ? 'bg-emerald-700 text-white border-emerald-700'
                                    : 'bg-white text-slate-600 border-slate-300 hover:bg-emerald-50 disabled:opacity-60'
                                }`}
                              >
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                Terlaksana
                              </button>
                              <button
                                type="button"
                                disabled={isReadOnly || saving}
                                onClick={() => void handleToggleStatus(item, 'tidak_terlaksana')}
                                className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold border transition min-h-[38px] ${
                                  !isDone
                                    ? 'bg-rose-700 text-white border-rose-700'
                                    : 'bg-white text-slate-600 border-slate-300 hover:bg-rose-50 disabled:opacity-60'
                                }`}
                              >
                                <XCircle className="w-3.5 h-3.5" />
                                Tidak Terlaksana
                              </button>
                              {canEdit && (
                                <button
                                  type="button"
                                  onClick={() => void handleDeleteJadwal(item.id)}
                                  aria-label="Hapus plotting"
                                  className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-lg text-slate-400 hover:text-rose-700 hover:bg-rose-50"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {activeTab === 'area' && (
        <div className="rounded-2xl bg-white border border-slate-200 p-4 sm:p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-slate-900">Master Area Piket Dinamis</h2>
              <p className="text-xs text-slate-500">
                Tambah, ubah, atau hapus lokasi kebersihan sesuai kebutuhan pondok.
              </p>
            </div>
            {canEdit && (
              <button
                type="button"
                onClick={() => {
                  setEditingArea(null);
                  setAreaNama('');
                  setAreaDeskripsi('');
                  setAreaUrutan(String(areas.length + 1));
                  setAreaModalOpen(true);
                }}
                className="inline-flex items-center gap-2 rounded-xl bg-[#065f46] hover:bg-emerald-900 text-white px-4 py-2 text-xs sm:text-sm font-semibold min-h-[42px]"
              >
                <Plus className="w-4 h-4" />
                Tambah Area Baru
              </button>
            )}
          </div>

          <div className="divide-y divide-slate-100">
            {areas.map((area) => (
              <div
                key={area.id}
                className="py-3 flex flex-wrap items-center justify-between gap-3"
              >
                <div>
                  <p className="text-sm font-bold text-slate-900">
                    {area.urutan}. {area.nama_area}
                  </p>
                  <p className="text-xs text-slate-500">{area.deskripsi || 'Tanpa keterangan'}</p>
                </div>
                {canEdit && (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingArea(area);
                        setAreaNama(area.nama_area);
                        setAreaDeskripsi(area.deskripsi || '');
                        setAreaUrutan(String(area.urutan || 1));
                        setAreaModalOpen(true);
                      }}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 min-h-[38px]"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDeleteArea(area)}
                      className="inline-flex items-center gap-1 rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-50 min-h-[38px]"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Hapus
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'evaluasi' && (
        <div className="rounded-2xl bg-white border border-slate-200 p-4 sm:p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <ClipboardList className="w-5 h-5 text-rose-700" />
                Rekap &amp; Riwayat Ketidaklaksanaan Piket
              </h2>
              <p className="text-xs text-slate-500">
                Bahan evaluasi pengurus terhadap santri maupun kamar dengan status Tidak Terlaksana.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={evalSearch}
                  onChange={(e) => setEvalSearch(e.target.value)}
                  placeholder="Cari santri / kamar / area..."
                  className="pl-9 pr-3 py-2 text-xs sm:text-sm rounded-xl border border-slate-300 min-h-[40px]"
                />
              </div>
              <select
                value={evalModeFilter}
                onChange={(e) => setEvalModeFilter(e.target.value as 'semua' | KebersihanMode)}
                className="rounded-xl border border-slate-300 px-3 py-2 text-xs sm:text-sm min-h-[40px]"
              >
                <option value="semua">Semua Mode</option>
                <option value="harian">Piket Harian</option>
                <option value="roan_jumat">Ro&apos;an Jum&apos;at</option>
              </select>
            </div>
          </div>

          {missedHistory.length === 0 ? (
            <div className="py-10 text-center text-sm text-slate-500">
              Tidak ada catatan ketidaklaksanaan yang cocok dengan filter.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs sm:text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500">
                    <th className="py-2.5 pr-3 font-semibold">Tanggal</th>
                    <th className="py-2.5 pr-3 font-semibold">Mode &amp; Sesi</th>
                    <th className="py-2.5 pr-3 font-semibold">Area Piket</th>
                    <th className="py-2.5 pr-3 font-semibold">Santri / Kamar</th>
                    <th className="py-2.5 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {missedHistory.map((row) => (
                    <tr key={row.id} className="hover:bg-slate-50">
                      <td className="py-2.5 pr-3 whitespace-nowrap tabular-nums">
                        {formatTanggalIndoKebersihan(row.tanggal)}
                      </td>
                      <td className="py-2.5 pr-3 whitespace-nowrap">
                        {row.mode === 'roan_jumat'
                          ? "Ro'an Jum'at Pagi"
                          : `Harian · ${row.sesi === 'pagi' ? 'Pagi' : 'Sore'}`}
                      </td>
                      <td className="py-2.5 pr-3 font-medium text-slate-800">{row.area_nama}</td>
                      <td className="py-2.5 pr-3 font-semibold text-slate-900">
                        {row.mode === 'roan_jumat'
                          ? `Kamar ${row.kamar || '-'}`
                          : `${row.santri_nama || '-'} (${row.kamar || '-'})`}
                      </td>
                      <td className="py-2.5">
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-rose-700">
                          <AlertTriangle className="w-3.5 h-3.5" />
                          Tidak Terlaksana
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Modal Tambah / Edit Area */}
      {areaModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl bg-white border border-slate-200 p-5 shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900">
                {editingArea ? 'Edit Area Piket' : 'Tambah Area Piket Baru'}
              </h3>
              <button
                type="button"
                onClick={() => setAreaModalOpen(false)}
                className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSaveArea} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Nama Area Piket
                </label>
                <input
                  type="text"
                  required
                  value={areaNama}
                  onChange={(e) => setAreaNama(e.target.value)}
                  placeholder="Contoh: Musala, Halaman, Kamar Mandi"
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm min-h-[42px]"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Deskripsi Tugas / Cakupan
                </label>
                <input
                  type="text"
                  value={areaDeskripsi}
                  onChange={(e) => setAreaDeskripsi(e.target.value)}
                  placeholder="Keterangan singkat cakupan kebersihan"
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm min-h-[42px]"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Urutan Tampil
                </label>
                <input
                  type="number"
                  min={1}
                  value={areaUrutan}
                  onChange={(e) => setAreaUrutan(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm min-h-[42px]"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setAreaModalOpen(false)}
                  className="rounded-xl border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-xl bg-[#065f46] hover:bg-emerald-900 text-white px-4 py-2 text-xs font-semibold disabled:opacity-50"
                >
                  {saving ? 'Menyimpan...' : 'Simpan Area'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
