'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock,
  MapPin,
  Moon,
  Plus,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { useAuth, TransparencyBanner } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import {
  BULAN_INDO,
  computeJadwalSholatBululawang,
  computeMonthCalendarGrid,
  createKalenderId,
  deleteKalenderAgenda,
  fetchKalenderAgenda,
  formatHariPasaranIndo,
  getDayOfWeekIndex,
  getHariBesarInMonth,
  getHijriDate,
  getMonthHijriSpanLabel,
  getNextPrayerCountdown,
  getWibTodayIso,
  HARI_INDO,
  parseIsoParts,
  saveKalenderAgenda,
  type CalendarCell,
  type KalenderAgendaItem,
  type KategoriAgendaKalender,
} from '@/lib/kalender';
import { fetchKegiatanAgenda, type KegiatanAgendaItem } from '@/lib/kegiatan';
import {
  DEFAULT_PENGATURAN_FORM,
  extractExtendedPayload,
  isMissingColumnError,
  mergeAturanOperasional,
  readExtendedLocal,
  writeExtendedLocal,
  type PengaturanFormState,
} from '@/lib/pengaturan';

interface CombinedAgendaDisplay {
  id: string;
  tanggal: string;
  judul: string;
  sumber: 'kustom' | 'kegiatan' | 'rutin';
  kategoriLabel: string;
  waktu?: string;
  lokasi?: string;
  catatan?: string;
  rawKustom?: KalenderAgendaItem;
}

export default function KalenderPage() {
  const { canEditModule } = useAuth();
  const canEdit = canEditModule('kalender');

  const [todayIso, setTodayIso] = useState<string>('');
  const todayParts = useMemo(
    () => (todayIso ? parseIsoParts(todayIso) : { year: 2000, month: 1, day: 1 }),
    [todayIso]
  );

  const [viewYear, setViewYear] = useState<number>(2000);
  const [viewMonth, setViewMonth] = useState<number>(1);
  const [selectedIso, setSelectedIso] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'agenda' | 'hari_besar' | 'puasa'>('agenda');

  const [koreksiHijriyah, setKoreksiHijriyah] = useState<number>(0);
  const [jatuhTempoTanggal, setJatuhTempoTanggal] = useState<number>(10);
  const [hariRapatPengasuh, setHariRapatPengasuh] = useState<string>('Jumat');
  const [hariLiburLaundry, setHariLiburLaundry] = useState<string>('Jumat');
  const [pengaturanState, setPengaturanState] = useState<PengaturanFormState>(DEFAULT_PENGATURAN_FORM);

  const [agendaKustom, setAgendaKustom] = useState<KalenderAgendaItem[]>([]);
  const [kegiatanAgenda, setKegiatanAgenda] = useState<KegiatanAgendaItem[]>([]);
  const [nowTick, setNowTick] = useState<Date | null>(null);

  const [showModalAgenda, setShowModalAgenda] = useState(false);
  const [formJudul, setFormJudul] = useState('');
  const [formKategori, setFormKategori] = useState<KategoriAgendaKalender>('pondok');
  const [formWaktu, setFormWaktu] = useState('08:00 WIB');
  const [formLokasi, setFormLokasi] = useState('Aula Pondok');
  const [formCatatan, setFormCatatan] = useState('');
  const [savingAgenda, setSavingAgenda] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => {
      const now = new Date();
      const liveIso = getWibTodayIso(now);
      const liveParts = parseIsoParts(liveIso);
      setTodayIso(liveIso);
      setSelectedIso(liveIso);
      setViewYear(liveParts.year);
      setViewMonth(liveParts.month);
      setNowTick(now);
    }, 0);
    const timer = setInterval(() => {
      setNowTick(new Date());
    }, 1000);
    return () => {
      clearTimeout(t);
      clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    let active = true;
    const loadAll = async () => {
      const localExt = readExtendedLocal();
      const [pengaturanRes, kustomRows, kegiatanRows] = await Promise.all([
        supabase.from('pengaturan_aplikasi').select('*').eq('id', 1).maybeSingle(),
        fetchKalenderAgenda(),
        fetchKegiatanAgenda(),
      ]);
      if (!active) return;

      const row = pengaturanRes.data as Record<string, unknown> | null;
      const mergedAturan = mergeAturanOperasional(
        row?.aturan_operasional || localExt?.aturan_operasional
      );
      setKoreksiHijriyah(mergedAturan.jadwal.koreksi_hijriyah);
      setHariRapatPengasuh(mergedAturan.jadwal.hari_rapat_pengasuh || 'Jumat');
      setHariLiburLaundry(mergedAturan.jadwal.hari_libur_laundry || 'Jumat');
      setJatuhTempoTanggal(Number(row?.jatuh_tempo_tanggal || 10));

      setPengaturanState({
        ...DEFAULT_PENGATURAN_FORM,
        ...(row || {}),
        kota_surat: String(row?.kota_surat || localExt?.kota_surat || DEFAULT_PENGATURAN_FORM.kota_surat),
        rekening_bank: String(row?.rekening_bank || localExt?.rekening_bank || DEFAULT_PENGATURAN_FORM.rekening_bank),
        rekening_nomor: String(row?.rekening_nomor || localExt?.rekening_nomor || ''),
        rekening_atas_nama: String(row?.rekening_atas_nama || localExt?.rekening_atas_nama || DEFAULT_PENGATURAN_FORM.rekening_atas_nama),
        kop_surat_url: String(row?.kop_surat_url || localExt?.kop_surat_url || ''),
        aturan_operasional: mergedAturan,
      });

      setAgendaKustom(kustomRows);
      setKegiatanAgenda(kegiatanRows);
    };
    loadAll();
    return () => {
      active = false;
    };
  }, []);

  const cells = useMemo(
    () => (todayIso ? computeMonthCalendarGrid(viewYear, viewMonth, koreksiHijriyah) : []),
    [todayIso, viewYear, viewMonth, koreksiHijriyah]
  );

  const hijriSpanLabel = useMemo(
    () => (cells.length > 0 ? getMonthHijriSpanLabel(cells) : '...'),
    [cells]
  );
  const hariBesarBulanIni = useMemo(
    () => (todayIso ? getHariBesarInMonth(viewYear, viewMonth, koreksiHijriyah) : []),
    [todayIso, viewYear, viewMonth, koreksiHijriyah]
  );

  const selectedCell: CalendarCell | undefined = useMemo(
    () => cells.find((c) => c.isoDate === selectedIso),
    [cells, selectedIso]
  );

  const selectedHijri = useMemo(
    () =>
      selectedCell?.hijri ||
      (selectedIso
        ? getHijriDate(selectedIso, koreksiHijriyah)
        : { day: 1, month: 1, year: 1448, monthName: 'Muharram', arabicDay: '١', formatted: 'Memuat...' }),
    [selectedCell, selectedIso, koreksiHijriyah]
  );

  const todayHijri = useMemo(
    () =>
      todayIso
        ? getHijriDate(todayIso, koreksiHijriyah)
        : { day: 1, month: 1, year: 1448, monthName: 'Muharram', arabicDay: '١', formatted: 'Memuat...' },
    [todayIso, koreksiHijriyah]
  );

  const jadwalSholatToday = useMemo(
    () =>
      selectedIso
        ? computeJadwalSholatBululawang(selectedIso)
        : {
            isoDate: '',
            imsak: '--:--',
            subuh: '--:--',
            terbit: '--:--',
            dhuha: '--:--',
            dzuhur: '--:--',
            ashar: '--:--',
            maghrib: '--:--',
            isya: '--:--',
          },
    [selectedIso]
  );

  const nextPrayerToday = useMemo(
    () =>
      nowTick && todayIso
        ? getNextPrayerCountdown(nowTick, computeJadwalSholatBululawang(todayIso))
        : { nextName: 'Sholat', nextTime: '--:--', remainingSeconds: 0, remainingFormatted: '- --:--:--' },
    [nowTick, todayIso]
  );

  // Bangun agenda gabungan untuk seluruh sel bulan ini
  const monthAgendaMap = useMemo(() => {
    const map = new Map<string, CombinedAgendaDisplay[]>();
    const pushItem = (item: CombinedAgendaDisplay) => {
      const list = map.get(item.tanggal) || [];
      list.push(item);
      map.set(item.tanggal, list);
    };

    for (const a of agendaKustom) {
      pushItem({
        id: `kustom-${a.id}`,
        tanggal: a.tanggal,
        judul: a.judul,
        sumber: 'kustom',
        kategoriLabel: a.kategori.toUpperCase(),
        waktu: a.waktu,
        lokasi: a.lokasi,
        catatan: a.catatan,
        rawKustom: a,
      });
    }

    for (const k of kegiatanAgenda) {
      pushItem({
        id: `kgt-${k.id}`,
        tanggal: k.tanggal,
        judul: k.judul,
        sumber: 'kegiatan',
        kategoriLabel: k.kategori === 'event_besar' ? 'EVENT PONDOK' : 'RUTINAN',
        waktu: k.jam_mulai ? `${k.jam_mulai} WIB` : undefined,
        lokasi: k.lokasi,
        catatan: k.penanggung_jawab ? `PJ: ${k.penanggung_jawab}` : undefined,
      });
    }

    for (const c of cells) {
      const dayName = HARI_INDO[getDayOfWeekIndex(c.isoDate)];
      if (dayName.toLowerCase() === hariRapatPengasuh.toLowerCase()) {
        pushItem({
          id: `rapat-${c.isoDate}`,
          tanggal: c.isoDate,
          judul: 'Rapat Rutin Pengasuh & Pengurus',
          sumber: 'rutin',
          kategoriLabel: 'RUTIN MINGGUAN',
          waktu: 'Sesuai jadwal pondok',
          lokasi: 'Ndalem / Kantor Pondok',
        });
      }
      if (dayName.toLowerCase() === hariLiburLaundry.toLowerCase()) {
        pushItem({
          id: `laundry-${c.isoDate}`,
          tanggal: c.isoDate,
          judul: 'Libur Operasional Sie Laundry',
          sumber: 'rutin',
          kategoriLabel: 'LAUNDRY',
        });
      }
      if (c.day === jatuhTempoTanggal) {
        pushItem({
          id: `tempo-${c.isoDate}`,
          tanggal: c.isoDate,
          judul: `Jatuh Tempo Syahriyah Bulanan (Tgl ${jatuhTempoTanggal})`,
          sumber: 'rutin',
          kategoriLabel: 'KEUANGAN',
        });
      }
    }

    return map;
  }, [agendaKustom, kegiatanAgenda, cells, hariRapatPengasuh, hariLiburLaundry, jatuhTempoTanggal]);

  const selectedDateAgendas = monthAgendaMap.get(selectedIso) || [];
  const monthAgendaList = useMemo(() => {
    const out: CombinedAgendaDisplay[] = [];
    for (const c of cells) {
      if (!c.inCurrentMonth) continue;
      const items = monthAgendaMap.get(c.isoDate) || [];
      for (const it of items) {
        if (it.sumber !== 'rutin') out.push(it);
      }
    }
    return out;
  }, [cells, monthAgendaMap]);

  const puasaBulanIni = useMemo(() => {
    return cells
      .filter((c) => c.inCurrentMonth && (c.puasa.labels.length > 0 || c.puasa.isHaram))
      .map((c) => ({
        isoDate: c.isoDate,
        day: c.day,
        hijriFormatted: c.hijri.formatted,
        puasa: c.puasa,
      }));
  }, [cells]);

  const changeMonth = (delta: number) => {
    let nextMonth = viewMonth + delta;
    let nextYear = viewYear;
    if (nextMonth < 1) {
      nextMonth = 12;
      nextYear -= 1;
    } else if (nextMonth > 12) {
      nextMonth = 1;
      nextYear += 1;
    }
    setViewYear(nextYear);
    setViewMonth(nextMonth);
  };

  const jumpToToday = () => {
    setViewYear(todayParts.year);
    setViewMonth(todayParts.month);
    setSelectedIso(todayIso);
  };

  const handleUpdateKoreksi = async (nextVal: number) => {
    if (!canEdit) return;
    const clamped = Math.max(-2, Math.min(2, nextVal));
    setKoreksiHijriyah(clamped);

    const nextState: PengaturanFormState = {
      ...pengaturanState,
      aturan_operasional: {
        ...pengaturanState.aturan_operasional,
        jadwal: {
          ...pengaturanState.aturan_operasional.jadwal,
          koreksi_hijriyah: clamped,
        },
      },
    };
    setPengaturanState(nextState);
    const ext = extractExtendedPayload(nextState);
    writeExtendedLocal(ext);

    try {
      const { error } = await supabase
        .from('pengaturan_aplikasi')
        .update({ aturan_operasional: ext.aturan_operasional })
        .eq('id', 1);
      if (error && !isMissingColumnError(error)) {
        // local already updated
      }
    } catch {
      // ignore if column not yet migrated
    }
  };

  const handleSaveNewAgenda = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit || !formJudul.trim()) return;
    setSavingAgenda(true);
    const item: KalenderAgendaItem = {
      id: createKalenderId(),
      tanggal: selectedIso,
      judul: formJudul.trim(),
      kategori: formKategori,
      waktu: formWaktu.trim(),
      lokasi: formLokasi.trim(),
      catatan: formCatatan.trim(),
      created_at: new Date().toISOString(),
    };
    await saveKalenderAgenda(item, false);
    setAgendaKustom((prev) => [...prev, item]);
    setSavingAgenda(false);
    setShowModalAgenda(false);
    setFormJudul('');
    setFormCatatan('');
  };

  const handleDeleteAgenda = async (id: string) => {
    if (!canEdit) return;
    await deleteKalenderAgenda(id);
    setAgendaKustom((prev) => prev.filter((a) => a.id !== id));
  };

  return (
    <div className="max-w-7xl mx-auto space-y-4">
      <TransparencyBanner moduleLabel="Kalender Pendidikan & Agenda Pondok" isReadOnly={!canEdit} />
      {/* Header Mengikuti Preset Tema Pondok + Jadwal Sholat Bululawang */}
      <section
        className="rounded-2xl text-white p-4 sm:p-6 shadow-md"
        style={{
          background:
            'linear-gradient(135deg, var(--siap-sidebar, #064e3b) 0%, var(--siap-primary, #047857) 100%)',
        }}
      >
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-white/80 text-xs font-medium">
              <MapPin className="w-3.5 h-3.5" />
              <span>Bululawang, Kab. Malang (WIB)</span>
            </div>
            <h1 className="text-lg sm:text-2xl font-extrabold tracking-tight">
              {todayIso ? formatHariPasaranIndo(todayIso) : 'Memuat tanggal...'}
            </h1>
            <p className="text-sm sm:text-base font-semibold text-white/85 flex items-center gap-2">
              <Moon className="w-4 h-4" />
              {todayHijri.formatted} H
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="bg-white/10 border border-white/15 rounded-xl px-4 py-2.5 backdrop-blur-xs">
              <p className="text-[11px] text-emerald-200 font-medium">Waktu Sholat Berikutnya</p>
              <div className="flex items-baseline gap-2.5 mt-0.5">
                <span className="text-base sm:text-lg font-extrabold text-white tabular-nums">
                  {nextPrayerToday.nextName} {nextPrayerToday.nextTime} WIB
                </span>
                <span className="text-xs font-mono text-emerald-200 tabular-nums">
                  {nextPrayerToday.remainingFormatted}
                </span>
              </div>
            </div>

            <div className="bg-white/10 border border-white/15 rounded-xl px-3 py-2 flex items-center gap-2">
              <span className="text-[11px] font-medium text-emerald-100 whitespace-nowrap">
                Koreksi Hijriyah:
              </span>
              <select
                aria-label="Koreksi Tanggal Hijriyah"
                disabled={!canEdit}
                value={koreksiHijriyah}
                onChange={(e) => handleUpdateKoreksi(Number(e.target.value))}
                className="bg-emerald-950/80 border border-white/25 text-white text-xs font-bold rounded-lg px-2 py-1 outline-none disabled:opacity-75 disabled:cursor-not-allowed"
              >
                <option value={-2}>-2 hari</option>
                <option value={-1}>-1 hari</option>
                <option value={0}>0 (Standar)</option>
                <option value={1}>+1 hari</option>
                <option value={2}>+2 hari</option>
              </select>
            </div>
          </div>
        </div>

        {/* Strip Jadwal Sholat Bululawang pada tanggal terpilih */}
        <div className="mt-4 pt-3 border-t border-white/15">
          <div className="flex items-center justify-between text-[11px] text-white/80 mb-2">
            <span className="flex items-center gap-1.5 font-semibold">
              <Clock className="w-3.5 h-3.5" />
              Jadwal Sholat Bululawang (
              {selectedIso ? formatHariPasaranIndo(selectedIso) : 'Memuat...'})
            </span>
          </div>
          <div className="grid grid-cols-4 sm:grid-cols-8 gap-1.5 sm:gap-2">
            {[
              { label: 'Imsak', time: jadwalSholatToday.imsak },
              { label: 'Subuh', time: jadwalSholatToday.subuh },
              { label: 'Terbit', time: jadwalSholatToday.terbit },
              { label: 'Dhuha', time: jadwalSholatToday.dhuha },
              { label: 'Dzuhur', time: jadwalSholatToday.dzuhur },
              { label: 'Ashar', time: jadwalSholatToday.ashar },
              { label: 'Maghrib', time: jadwalSholatToday.maghrib },
              { label: 'Isya', time: jadwalSholatToday.isya },
            ].map((slot) => (
              <div
                key={slot.label}
                className="bg-black/20 border border-white/10 rounded-lg px-2 py-1.5 text-center"
              >
                <p className="text-[10px] text-emerald-200">{slot.label}</p>
                <p className="text-xs sm:text-sm font-bold text-white tabular-nums mt-0.5">
                  {slot.time}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Main Split Workspace: Kalender Grid (kiri) + Panel Detail 3 Tab (kanan) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        {/* KIRI: Grid Kalender */}
        <section className="lg:col-span-7 bg-white rounded-2xl border border-slate-200 shadow-xs p-3 sm:p-5">
          <div className="flex items-center justify-between gap-2 mb-4">
            <button
              type="button"
              onClick={() => changeMonth(-1)}
              aria-label="Bulan sebelumnya"
              className="p-2 rounded-xl border border-slate-200 hover:bg-slate-100 text-slate-700"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <div className="text-center">
              <h2 className="text-base sm:text-lg font-extrabold text-slate-900">
                {BULAN_INDO[viewMonth - 1]} {viewYear}
              </h2>
              <p className="text-xs font-medium text-[var(--siap-primary,#047857)]">
                {hijriSpanLabel} H
              </p>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={jumpToToday}
                className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-100"
              >
                Hari Ini
              </button>
              <button
                type="button"
                onClick={() => changeMonth(1)}
                aria-label="Bulan berikutnya"
                className="p-2 rounded-xl border border-slate-200 hover:bg-slate-100 text-slate-700"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Header Hari (Ahad - Sabtu) */}
          <div className="grid grid-cols-7 gap-1 text-center mb-1.5">
            {HARI_INDO.map((hari, idx) => (
              <div
                key={hari}
                className={`text-[11px] sm:text-xs font-bold py-1.5 ${
                  idx === 0
                    ? 'text-rose-600'
                    : idx === 5
                    ? 'text-emerald-700'
                    : 'text-slate-500'
                }`}
              >
                {hari}
              </div>
            ))}
          </div>

          {/* Grid Tanggal */}
          <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
            {cells.map((cell) => {
              const isSelected = cell.isoDate === selectedIso;
              const isToday = cell.isoDate === todayIso;
              const isAhad = getDayOfWeekIndex(cell.isoDate) === 0;
              const dayAgendas = monthAgendaMap.get(cell.isoDate) || [];
              const hasCustomOrKegiatan = dayAgendas.some((a) => a.sumber !== 'rutin');
              const hasHariBesar = cell.hariBesar.length > 0;
              const hasPuasa = cell.puasa.labels.length > 0 && !cell.puasa.isHaram;

              return (
                <button
                  key={cell.isoDate}
                  type="button"
                  onClick={() => {
                    setSelectedIso(cell.isoDate);
                    if (!cell.inCurrentMonth) {
                      setViewYear(cell.year);
                      setViewMonth(cell.month);
                    }
                  }}
                  style={
                    isSelected
                      ? {
                          borderColor: 'var(--siap-primary, #047857)',
                          backgroundColor: 'color-mix(in srgb, var(--siap-primary, #047857) 10%, white)',
                        }
                      : isToday
                      ? { borderColor: 'var(--siap-primary, #047857)' }
                      : undefined
                  }
                  className={`relative flex flex-col items-center justify-between rounded-xl p-1 sm:p-2 min-h-[58px] sm:min-h-[68px] border text-center transition-all ${
                    isSelected
                      ? 'shadow-xs ring-1 ring-[var(--siap-primary,#047857)]'
                      : isToday
                      ? 'bg-slate-50/70'
                      : cell.inCurrentMonth
                      ? 'bg-white border-slate-100 hover:bg-slate-50'
                      : 'bg-slate-50/60 border-transparent opacity-45 hover:opacity-75'
                  }`}
                >
                  <div className="flex items-baseline justify-center gap-0.5 sm:gap-1 leading-none">
                    <span className="text-[10px] sm:text-xs font-semibold text-emerald-700">
                      {cell.hijri.arabicDay}
                    </span>
                    <span
                      className={`text-sm sm:text-base font-extrabold tabular-nums ${
                        isAhad || hasHariBesar
                          ? 'text-rose-600'
                          : cell.isFriday
                          ? 'text-emerald-700'
                          : 'text-slate-800'
                      }`}
                    >
                      {cell.day}
                    </span>
                  </div>

                  <span className="text-[9px] sm:text-[10px] font-medium text-slate-500 truncate max-w-full">
                    {cell.pasaran}
                  </span>

                  {/* Indikator dot NU Online style */}
                  <div className="flex items-center justify-center gap-1 h-2">
                    {hasPuasa && (
                      <span
                        title={cell.puasa.labels.join(', ')}
                        className="w-1.5 h-1.5 rounded-full bg-amber-400"
                      />
                    )}
                    {hasCustomOrKegiatan && (
                      <span
                        title="Ada agenda/kegiatan"
                        className="w-1.5 h-1.5 rounded-full bg-sky-500"
                      />
                    )}
                    {hasHariBesar && (
                      <span
                        title={cell.hariBesar.map((h) => h.nama).join(', ')}
                        className="w-1.5 h-1.5 rounded-full bg-rose-500"
                      />
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Legenda Ringkas */}
          <div className="mt-3 pt-3 border-t border-slate-100 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-500">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-amber-400" />
              Puasa Sunnah / Wajib
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-sky-500" />
              Agenda / Kegiatan Pondok
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-rose-500" />
              Hari Besar Islam / Nasional
            </span>
          </div>
        </section>

        {/* KANAN: Detail Tanggal Terpilih + 3 Tab (Agenda Pondok | Hari Besar | Puasa) */}
        <section className="lg:col-span-5 bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="p-4 border-b border-slate-200 bg-slate-50/70">
            <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--siap-primary,#047857)]">
              Detail Tanggal Dipilih
            </p>
            <h3 className="text-base font-extrabold text-slate-900 mt-0.5">
              {selectedIso ? formatHariPasaranIndo(selectedIso) : 'Memuat tanggal...'}
            </h3>
            <p className="text-xs font-semibold text-slate-600 mt-0.5">
              {selectedHijri.formatted} H
            </p>
          </div>

          {/* 3 Tab */}
          <div className="grid grid-cols-3 border-b border-slate-200">
            {[
              { key: 'agenda', label: 'Agenda Pondok' },
              { key: 'hari_besar', label: 'Hari Besar' },
              { key: 'puasa', label: 'Puasa' },
            ].map((tab) => {
              const active = activeTab === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveTab(tab.key as 'agenda' | 'hari_besar' | 'puasa')}
                  style={
                    active
                      ? {
                          borderBottomColor: 'var(--siap-primary, #047857)',
                          color: 'var(--siap-primary, #047857)',
                        }
                      : undefined
                  }
                  className={`py-2.5 px-2 text-xs sm:text-sm font-semibold border-b-2 transition-colors ${
                    active
                      ? 'bg-slate-50'
                      : 'border-transparent text-slate-500 hover:text-slate-800'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          <div className="p-4 space-y-3 max-h-[540px] overflow-y-auto">
            {activeTab === 'agenda' && (
              <>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-slate-700">
                    Agenda Tanggal {selectedIso.split('-').reverse().join('/')}
                  </span>
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => setShowModalAgenda(true)}
                      style={{ backgroundColor: 'var(--siap-primary, #047857)' }}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-white text-xs font-bold hover:opacity-95"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Tambah Agenda
                    </button>
                  )}
                </div>

                {selectedDateAgendas.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-200 p-4 text-center text-xs text-slate-500">
                    <CalendarDays className="w-6 h-6 text-slate-300 mx-auto mb-1.5" />
                    Belum ada agenda khusus pada tanggal ini.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {selectedDateAgendas.map((item) => (
                      <div
                        key={item.id}
                        className="rounded-xl border border-slate-200 p-3 bg-slate-50/60 flex items-start justify-between gap-2"
                      >
                        <div className="min-w-0">
                          <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-wide">
                            {item.kategoriLabel}
                          </span>
                          <p className="text-xs sm:text-sm font-bold text-slate-900 mt-0.5">
                            {item.judul}
                          </p>
                          {(item.waktu || item.lokasi) && (
                            <p className="text-[11px] text-slate-500 mt-0.5">
                              {[item.waktu, item.lokasi].filter(Boolean).join(' · ')}
                            </p>
                          )}
                          {item.catatan && (
                            <p className="text-[11px] text-slate-600 mt-1">{item.catatan}</p>
                          )}
                        </div>
                        {canEdit && item.sumber === 'kustom' && item.rawKustom && (
                          <button
                            type="button"
                            onClick={() => handleDeleteAgenda(item.rawKustom!.id)}
                            aria-label="Hapus agenda"
                            className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-50 shrink-0"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {monthAgendaList.length > 0 && (
                  <div className="pt-2 border-t border-slate-100 space-y-1.5">
                    <p className="text-[11px] font-bold text-slate-500 uppercase">
                      Agenda Pondok Bulan {BULAN_INDO[viewMonth - 1]} ({monthAgendaList.length})
                    </p>
                    {monthAgendaList.map((it) => (
                      <button
                        key={it.id}
                        type="button"
                        onClick={() => setSelectedIso(it.tanggal)}
                        className="w-full text-left flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg border border-slate-100 hover:bg-slate-50 text-xs"
                      >
                        <span className="font-semibold text-slate-800 truncate">{it.judul}</span>
                        <span className="text-[11px] text-slate-500 tabular-nums shrink-0">
                          {it.tanggal.slice(8, 10)} {BULAN_INDO[viewMonth - 1].slice(0, 3)}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}

            {activeTab === 'hari_besar' && (
              <div className="space-y-3">
                {selectedCell && selectedCell.hariBesar.length > 0 && (
                  <div className="rounded-xl bg-rose-50 border border-rose-200 p-3">
                    <p className="text-[11px] font-bold text-rose-700 uppercase">
                      Hari Besar pada Tanggal Terpilih
                    </p>
                    {selectedCell.hariBesar.map((hb, idx) => (
                      <div key={idx} className="mt-1">
                        <p className="text-sm font-bold text-rose-900">{hb.nama}</p>
                        <p className="text-xs text-rose-700">{hb.keterangan}</p>
                      </div>
                    ))}
                  </div>
                )}

                <div>
                  <p className="text-xs font-bold text-slate-700 mb-2">
                    Daftar Hari Besar Bulan {BULAN_INDO[viewMonth - 1]} {viewYear}
                  </p>
                  {hariBesarBulanIni.length === 0 ? (
                    <p className="text-xs text-slate-500 rounded-xl border border-dashed border-slate-200 p-4 text-center">
                      Tidak ada peringatan hari besar Islam/nasional pada bulan ini.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {hariBesarBulanIni.map((hb, idx) => (
                        <button
                          key={`${hb.isoDate}-${idx}`}
                          type="button"
                          onClick={() => setSelectedIso(hb.isoDate)}
                          className="w-full text-left rounded-xl border border-slate-200 p-3 hover:bg-slate-50 transition-colors"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-bold text-slate-900">{hb.nama}</span>
                            <span className="text-[11px] font-bold text-rose-600 tabular-nums">
                              {hb.isoDate.split('-').reverse().join('/')}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-500 mt-0.5">{hb.keterangan}</p>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {activeTab === 'puasa' && (
              <div className="space-y-3">
                {selectedCell && (
                  <div
                    className={`rounded-xl border p-3 ${
                      selectedCell.puasa.isHaram
                        ? 'bg-rose-50 border-rose-200'
                        : selectedCell.puasa.labels.length > 0
                        ? 'bg-amber-50 border-amber-200'
                        : 'bg-slate-50 border-slate-200'
                    }`}
                  >
                    <p className="text-[11px] font-bold uppercase text-slate-600">
                      Status Puasa pada {formatHariPasaranIndo(selectedIso)}
                    </p>
                    {selectedCell.puasa.labels.length > 0 ? (
                      <ul className="mt-1 space-y-1">
                        {selectedCell.puasa.labels.map((lbl, idx) => (
                          <li key={idx} className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                            <Sparkles className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                            {lbl}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-xs text-slate-600 mt-1">
                        Tidak ada jadwal puasa sunnah khusus pada hari ini (boleh berpuasa sunnah mutlak/Daud).
                      </p>
                    )}
                  </div>
                )}

                <div>
                  <p className="text-xs font-bold text-slate-700 mb-2">
                    Jadwal Puasa Bulan {BULAN_INDO[viewMonth - 1]} ({puasaBulanIni.length} hari)
                  </p>
                  <div className="space-y-1.5">
                    {puasaBulanIni.map((item) => (
                      <button
                        key={item.isoDate}
                        type="button"
                        onClick={() => setSelectedIso(item.isoDate)}
                        className={`w-full text-left rounded-lg border px-3 py-2 flex items-center justify-between gap-2 text-xs transition-colors ${
                          item.isoDate === selectedIso
                            ? 'border-emerald-500 bg-emerald-50'
                            : 'border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        <div className="min-w-0">
                          <p className="font-bold text-slate-800 truncate">
                            {item.puasa.labels.join(' · ')}
                          </p>
                          <p className="text-[11px] text-slate-500">{item.hijriFormatted} H</p>
                        </div>
                        <span className="text-[11px] font-bold text-slate-600 tabular-nums shrink-0">
                          {item.day} {BULAN_INDO[viewMonth - 1].slice(0, 3)}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>
      </div>

      {/* Modal Tambah Agenda Kustom */}
      {showModalAgenda && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl border border-slate-200 shadow-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900">Tambah Agenda Pondok</h3>
                <p className="text-xs text-slate-500">{formatHariPasaranIndo(selectedIso)}</p>
              </div>
              <button
                type="button"
                onClick={() => setShowModalAgenda(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSaveNewAgenda} className="p-5 space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Judul Agenda</label>
                <input
                  type="text"
                  required
                  value={formJudul}
                  onChange={(e) => setFormJudul(e.target.value)}
                  placeholder="Contoh: Mujahadah Malam Jumat Legi"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-600"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Kategori</label>
                  <select
                    value={formKategori}
                    onChange={(e) => setFormKategori(e.target.value as KategoriAgendaKalender)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white outline-none focus:ring-2 focus:ring-emerald-600"
                  >
                    <option value="pondok">Agenda Pondok</option>
                    <option value="rapat">Rapat Pengurus</option>
                    <option value="akademik">Madin / Akademik</option>
                    <option value="libur">Libur / Perpulangan</option>
                    <option value="lainnya">Lainnya</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Waktu</label>
                  <input
                    type="text"
                    value={formWaktu}
                    onChange={(e) => setFormWaktu(e.target.value)}
                    placeholder="08:00 WIB"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-600"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Lokasi</label>
                <input
                  type="text"
                  value={formLokasi}
                  onChange={(e) => setFormLokasi(e.target.value)}
                  placeholder="Masjid / Aula Pondok"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-600"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Catatan (Opsional)</label>
                <textarea
                  rows={2}
                  value={formCatatan}
                  onChange={(e) => setFormCatatan(e.target.value)}
                  placeholder="Keterangan tambahan..."
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-600"
                />
              </div>
              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowModalAgenda(false)}
                  className="px-4 py-2 text-xs font-semibold rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={savingAgenda}
                  className="px-4 py-2 text-xs font-bold rounded-lg bg-emerald-700 text-white hover:bg-emerald-800 disabled:opacity-60"
                >
                  {savingAgenda ? 'Menyimpan...' : 'Simpan Agenda'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
