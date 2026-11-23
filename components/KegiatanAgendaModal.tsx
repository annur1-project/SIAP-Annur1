'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Calendar, Check, ChevronDown, Layers, Search, Users, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import {
  type KategoriKegiatan,
  type KegiatanAgendaItem,
  type KegiatanFormatTemplate,
  type PersonelOption,
  type StatusKegiatan,
  LOKASI_KEGIATAN_OPTIONS,
  createKegiatanId,
  generateKodeKegiatan,
  instantiatePanitiaPreset,
  instantiatePengisiFromTemplate,
} from '@/lib/kegiatan';

export interface PengurusAutocompleteOption {
  id: string;
  nama_lengkap: string;
  jabatan?: string;
  no_wa?: string;
}

interface KegiatanAgendaModalProps {
  initialData: KegiatanAgendaItem | null;
  todayStr: string;
  formats: KegiatanFormatTemplate[];
  existingAgendas: KegiatanAgendaItem[];
  personelOptions: PersonelOption[];
  pengurusOptions?: PengurusAutocompleteOption[];
  onClose: () => void;
  onSave: (agenda: KegiatanAgendaItem, isEdit: boolean) => Promise<void>;
}

export default function KegiatanAgendaModal({
  initialData,
  todayStr,
  formats,
  existingAgendas,
  personelOptions,
  pengurusOptions,
  onClose,
  onSave,
}: KegiatanAgendaModalProps) {
  const isEdit = Boolean(initialData);

  const defaultFormat = useMemo(() => {
    if (initialData?.format_id) {
      return formats.find((f) => f.id === initialData.format_id) || formats[0] || null;
    }
    return formats.find((f) => f.id === 'fmt-burdah-12') || formats[0] || null;
  }, [formats, initialData]);

  const [judul, setJudul] = useState(initialData?.judul || '');
  const [kategori, setKategori] = useState<KategoriKegiatan>(
    initialData?.kategori || defaultFormat?.kategori_default || 'rutin'
  );
  const [selectedFormatId, setSelectedFormatId] = useState<string>(
    initialData?.format_id ?? defaultFormat?.id ?? ''
  );
  const [reapplySlotsOnEdit, setReapplySlotsOnEdit] = useState(false);
  const [tanggal, setTanggal] = useState(initialData?.tanggal || todayStr);
  const [jamMulai, setJamMulai] = useState(initialData?.jam_mulai || '20:00');
  const [jamSelesai, setJamSelesai] = useState(initialData?.jam_selesai || '21:30');
  const [lokasi, setLokasi] = useState(
    initialData?.lokasi || LOKASI_KEGIATAN_OPTIONS[0]
  );
  const [penanggungJawab, setPenanggungJawab] = useState(
    initialData?.penanggung_jawab || ''
  );
  const [pjDropdownOpen, setPjDropdownOpen] = useState(false);
  const [fetchedPengurus, setFetchedPengurus] = useState<PengurusAutocompleteOption[]>([]);
  const pjContainerRef = useRef<HTMLDivElement>(null);

  const [status, setStatus] = useState<StatusKegiatan>(
    initialData?.status || 'terjadwal'
  );
  const [catatan, setCatatan] = useState(initialData?.catatan || '');
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (pengurusOptions && pengurusOptions.length > 0) return;
    let active = true;
    Promise.resolve().then(async () => {
      try {
        const res = await supabase
          .from('v_pengurus_lengkap')
          .select('id, nama_lengkap, no_wa, status, jabatan_list');
        if (!res.error && Array.isArray(res.data) && res.data.length > 0) {
          if (!active) return;
          const rows = (res.data as Array<{
            id: string;
            nama_lengkap: string;
            no_wa?: string | null;
            status?: string | null;
            jabatan_list?: Array<{ divisi?: string; nama_jabatan?: string; is_utama?: boolean }>;
          }>)
            .filter((p) => !p.status || p.status.trim().toLowerCase() === 'aktif')
            .map((p) => {
              const j = p.jabatan_list?.find((x) => x.is_utama) || p.jabatan_list?.[0];
              return {
                id: String(p.id),
                nama_lengkap: p.nama_lengkap,
                jabatan: [j?.nama_jabatan, j?.divisi].filter(Boolean).join(' · '),
                no_wa: p.no_wa || '',
              };
            })
            .sort((a, b) => a.nama_lengkap.localeCompare(b.nama_lengkap, 'id'));
          setFetchedPengurus(rows);
          return;
        }
        const pgRes = await supabase
          .from('pengurus')
          .select('id, nama_lengkap, no_wa, status')
          .order('nama_lengkap', { ascending: true });
        if (!pgRes.error && Array.isArray(pgRes.data) && active) {
          const rows = (pgRes.data as Array<{
            id: string;
            nama_lengkap: string;
            no_wa?: string | null;
            status?: string | null;
          }>)
            .filter((p) => !p.status || p.status.trim().toLowerCase() === 'aktif')
            .map((p) => ({
              id: String(p.id),
              nama_lengkap: p.nama_lengkap,
              jabatan: 'Pengurus Pondok',
              no_wa: p.no_wa || '',
            }));
          setFetchedPengurus(rows);
        }
      } catch {
        // fallback handled via personelOptions below
      }
    });
    return () => {
      active = false;
    };
  }, [pengurusOptions]);

  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      if (
        pjContainerRef.current &&
        !pjContainerRef.current.contains(event.target as Node)
      ) {
        setPjDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  const effectivePengurusList = useMemo<PengurusAutocompleteOption[]>(() => {
    if (pengurusOptions && pengurusOptions.length > 0) return pengurusOptions;
    if (fetchedPengurus.length > 0) return fetchedPengurus;
    return personelOptions
      .filter((p) => p.sumber.toLowerCase().includes('pengurus'))
      .map((p) => ({
        id: p.id,
        nama_lengkap: p.nama,
        jabatan: p.info || p.sumber,
        no_wa: p.no_wa,
      }));
  }, [pengurusOptions, fetchedPengurus, personelOptions]);

  const filteredPengurusPj = useMemo(() => {
    const q = penanggungJawab.trim().toLowerCase();
    if (!q) return effectivePengurusList;
    return effectivePengurusList.filter(
      (p) =>
        p.nama_lengkap.toLowerCase().includes(q) ||
        (p.jabatan || '').toLowerCase().includes(q)
    );
  }, [effectivePengurusList, penanggungJawab]);

  const activeFormat = useMemo(
    () => formats.find((f) => f.id === selectedFormatId) || null,
    [formats, selectedFormatId]
  );

  const handleFormatChange = (newFormatId: string) => {
    setSelectedFormatId(newFormatId);
    const fmt = formats.find((f) => f.id === newFormatId);
    if (fmt && !isEdit) {
      setKategori(fmt.kategori_default);
      if (!judul.trim()) {
        setJudul(fmt.nama_format);
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    if (!judul.trim()) {
      setErrorMsg('Judul kegiatan wajib diisi.');
      return;
    }
    if (!tanggal) {
      setErrorMsg('Tanggal pelaksanaan wajib diisi.');
      return;
    }

    setSaving(true);
    try {
      const nowIso = new Date().toISOString();
      const shouldGenerateSlots = !isEdit || reapplySlotsOnEdit;
      const pengisiList = shouldGenerateSlots
        ? instantiatePengisiFromTemplate(activeFormat)
        : initialData?.pengisi_list || [];

      const panitiaList =
        kategori === 'event_besar'
          ? initialData?.panitia_list && initialData.panitia_list.length > 0
            ? initialData.panitia_list
            : instantiatePanitiaPreset()
          : initialData?.panitia_list || [];

      const rundownList =
        initialData?.rundown_list && initialData.rundown_list.length > 0
          ? initialData.rundown_list
          : [
              {
                id: createKegiatanId('rnd'),
                jam_mulai: jamMulai || '20:00',
                jam_selesai: jamSelesai || '21:30',
                sesi: judul.trim(),
                lokasi: lokasi.trim() || LOKASI_KEGIATAN_OPTIONS[0],
                pj: penanggungJawab.trim(),
                keterangan: '',
              },
            ];

      const payload: KegiatanAgendaItem = {
        id: initialData?.id || createKegiatanId('kgt'),
        kode_kegiatan:
          initialData?.kode_kegiatan || generateKodeKegiatan(tanggal, existingAgendas),
        judul: judul.trim(),
        kategori,
        format_id: activeFormat ? activeFormat.id : null,
        format_nama: activeFormat ? activeFormat.nama_format : 'Format Kustom',
        tanggal,
        jam_mulai: jamMulai || '20:00',
        jam_selesai: jamSelesai || '',
        lokasi: lokasi.trim() || LOKASI_KEGIATAN_OPTIONS[0],
        penanggung_jawab: penanggungJawab.trim(),
        status,
        pengisi_list: pengisiList,
        rundown_list: rundownList,
        panitia_list: panitiaList,
        notulensi: initialData?.notulensi || '',
        dokumentasi_urls: initialData?.dokumentasi_urls || [],
        catatan: catatan.trim(),
        updated_at: nowIso,
        created_at: initialData?.created_at || nowIso,
      };

      await onSave(payload, isEdit);
      onClose();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal menyimpan jadwal kegiatan.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-[1px] flex items-center justify-center p-3 sm:p-4">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xl w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-2 rounded-xl siap-soft-box shrink-0">
              <Calendar className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm sm:text-base font-bold text-slate-900 truncate">
                {isEdit ? 'Edit Informasi Kegiatan' : 'Jadwalkan Kegiatan Baru'}
              </h3>
              <p className="text-xs text-slate-500 truncate">
                Pilih format pengisi untuk membentuk daftar petugas secara otomatis.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup modal"
            className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 space-y-4">
          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-medium">
              {errorMsg}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Format Pengisi Acara
              </label>
              <select
                value={selectedFormatId}
                onChange={(e) => handleFormatChange(e.target.value)}
                className="w-full min-h-[40px] px-3 py-2 text-xs sm:text-sm border border-slate-200 rounded-xl bg-white focus:outline-none siap-ring-focus"
              >
                {formats.map((fmt) => (
                  <option key={fmt.id} value={fmt.id}>
                    {fmt.nama_format} ({fmt.slots.length} slot)
                  </option>
                ))}
                <option value="">Kosong / Tanpa Template Awal</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Kategori Kegiatan
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setKategori('rutin')}
                  className={`min-h-[40px] px-3 py-2 rounded-xl border text-xs font-semibold transition-colors whitespace-nowrap ${
                    kategori === 'rutin'
                      ? 'siap-btn-primary border-transparent'
                      : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  Rutin Mingguan
                </button>
                <button
                  type="button"
                  onClick={() => setKategori('event_besar')}
                  className={`min-h-[40px] px-3 py-2 rounded-xl border text-xs font-semibold transition-colors whitespace-nowrap ${
                    kategori === 'event_besar'
                      ? 'siap-btn-primary border-transparent'
                      : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  Event Besar
                </button>
              </div>
            </div>
          </div>

          {activeFormat && (
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="font-bold text-slate-800 flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 siap-text-accent shrink-0" />
                  Rincian Slot Terbentuk ({activeFormat.slots.length} Form Pengisi)
                </span>
                {isEdit && (
                  <label className="inline-flex items-center gap-1.5 text-[11px] font-medium text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={reapplySlotsOnEdit}
                      onChange={(e) => setReapplySlotsOnEdit(e.target.checked)}
                      className="rounded border-slate-300 siap-accent-control"
                    />
                    Terapkan ulang slot format ini
                  </label>
                )}
              </div>
              <p className="text-[11px] text-slate-600 leading-relaxed">
                {activeFormat.slots
                  .slice()
                  .sort((a, b) => a.urutan - b.urutan)
                  .map((s) => `${s.urutan}. ${s.peran}`)
                  .join(' · ')}
              </p>
            </div>
          )}

          {kategori === 'event_besar' && (
            <div className="p-3 rounded-xl bg-amber-50/70 border border-amber-200 text-xs text-amber-900 flex items-start gap-2">
              <Users className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
              <span>
                Kategori <strong>Event Besar</strong> otomatis menyiapkan form{' '}
                <strong>Susunan Panitia</strong> (Ketua, Sekretaris, Bendahara, hingga Seksi) di
                halaman detail kegiatan.
              </span>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Nama / Judul Kegiatan
            </label>
            <input
              type="text"
              value={judul}
              onChange={(e) => setJudul(e.target.value)}
              placeholder="Contoh: Pembacaan Burdah Malam Jumat / Peringatan Maulid Nabi"
              className="w-full min-h-[40px] px-3 py-2 text-xs sm:text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 siap-ring-focus"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Tanggal Pelaksanaan
              </label>
              <input
                type="date"
                value={tanggal}
                onChange={(e) => setTanggal(e.target.value)}
                className="w-full min-h-[40px] px-3 py-2 text-xs sm:text-sm font-mono tabular-nums border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Jam Mulai
              </label>
              <input
                type="time"
                value={jamMulai}
                onChange={(e) => setJamMulai(e.target.value)}
                className="w-full min-h-[40px] px-3 py-2 text-xs sm:text-sm font-mono tabular-nums border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Jam Selesai
              </label>
              <input
                type="time"
                value={jamSelesai}
                onChange={(e) => setJamSelesai(e.target.value)}
                className="w-full min-h-[40px] px-3 py-2 text-xs sm:text-sm font-mono tabular-nums border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Lokasi / Tempat
              </label>
              <input
                type="text"
                list="kegiatan-lokasi-list"
                value={lokasi}
                onChange={(e) => setLokasi(e.target.value)}
                placeholder="Pilih atau ketik lokasi"
                className="w-full min-h-[40px] px-3 py-2 text-xs sm:text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
              <datalist id="kegiatan-lokasi-list">
                {LOKASI_KEGIATAN_OPTIONS.map((loc) => (
                  <option key={loc} value={loc} />
                ))}
              </datalist>
            </div>

            <div ref={pjContainerRef} className="relative">
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Penanggung Jawab (PJ)
              </label>
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={penanggungJawab}
                  onFocus={() => setPjDropdownOpen(true)}
                  onChange={(e) => {
                    setPenanggungJawab(e.target.value);
                    setPjDropdownOpen(true);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') setPjDropdownOpen(false);
                  }}
                  placeholder="Ketik / cari nama pengurus..."
                  autoComplete="off"
                  className="w-full min-h-[40px] pl-9 pr-14 py-2 text-xs sm:text-sm border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
                <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
                  {penanggungJawab && (
                    <button
                      type="button"
                      onClick={() => {
                        setPenanggungJawab('');
                        setPjDropdownOpen(true);
                      }}
                      aria-label="Hapus PJ"
                      className="p-1 text-slate-400 hover:text-slate-600 rounded"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setPjDropdownOpen((prev) => !prev)}
                    aria-label="Buka daftar pengurus"
                    className="p-1 text-slate-400 hover:text-slate-600 rounded"
                  >
                    <ChevronDown className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {pjDropdownOpen && (
                <div className="absolute left-0 right-0 top-full mt-1 z-30 bg-white border border-slate-200 rounded-xl shadow-xl max-h-52 overflow-y-auto divide-y divide-slate-100">
                  {filteredPengurusPj.length === 0 ? (
                    <div className="px-3 py-2.5 text-xs text-slate-500">
                      {effectivePengurusList.length === 0
                        ? 'Daftar pengurus kosong. Ketik nama secara manual.'
                        : `Tidak ada pengurus cocok dengan "${penanggungJawab}".`}
                    </div>
                  ) : (
                    filteredPengurusPj.slice(0, 40).map((p) => {
                      const selected =
                        penanggungJawab.trim().toLowerCase() === p.nama_lengkap.toLowerCase();
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            setPenanggungJawab(p.nama_lengkap);
                            setPjDropdownOpen(false);
                          }}
                          className={`w-full px-3 py-2 text-left flex items-center justify-between gap-2 text-xs transition-colors ${
                            selected ? 'bg-emerald-50 text-emerald-900' : 'hover:bg-slate-50 text-slate-800'
                          }`}
                        >
                          <div className="min-w-0">
                            <p className="font-semibold truncate">{p.nama_lengkap}</p>
                            {p.jabatan && (
                              <p className="text-[11px] text-slate-500 truncate">{p.jabatan}</p>
                            )}
                          </div>
                          {selected && <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />}
                        </button>
                      );
                    })
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Status Kegiatan
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as StatusKegiatan)}
                className="w-full min-h-[40px] px-3 py-2 text-xs sm:text-sm border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                <option value="terjadwal">Terjadwal</option>
                <option value="berlangsung">Sedang Berlangsung</option>
                <option value="selesai">Selesai</option>
                <option value="ditunda">Ditunda</option>
              </select>
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Catatan Singkat
              </label>
              <input
                type="text"
                value={catatan}
                onChange={(e) => setCatatan(e.target.value)}
                placeholder="Perlengkapan, kostum santri, atau catatan tambahan"
                className="w-full min-h-[40px] px-3 py-2 text-xs sm:text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[40px] px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl whitespace-nowrap"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={saving}
              className="min-h-[40px] px-5 py-2 text-xs font-bold siap-btn-primary disabled:opacity-60 rounded-xl whitespace-nowrap"
            >
              {saving
                ? 'Menyimpan...'
                : isEdit
                ? 'Simpan Perubahan'
                : 'Simpan & Isi Pengisi Acara'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
