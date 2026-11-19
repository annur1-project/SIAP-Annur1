'use client';

import React, { useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Layers,
  ListPlus,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import {
  type KategoriKegiatan,
  type KegiatanFormatTemplate,
  type KegiatanTemplateSlot,
  createKegiatanId,
} from '@/lib/kegiatan';

interface KegiatanFormatModalProps {
  initialData: KegiatanFormatTemplate | null;
  onClose: () => void;
  onSave: (template: KegiatanFormatTemplate, isEdit: boolean) => Promise<void>;
}

export default function KegiatanFormatModal({
  initialData,
  onClose,
  onSave,
}: KegiatanFormatModalProps) {
  const isEdit = Boolean(initialData);
  const [namaFormat, setNamaFormat] = useState(initialData?.nama_format || '');
  const [kategoriDefault, setKategoriDefault] = useState<KategoriKegiatan>(
    initialData?.kategori_default || 'rutin'
  );
  const [deskripsi, setDeskripsi] = useState(initialData?.deskripsi || '');
  const [slots, setSlots] = useState<KegiatanTemplateSlot[]>(() => {
    if (initialData?.slots && initialData.slots.length > 0) {
      return [...initialData.slots].sort((a, b) => a.urutan - b.urutan);
    }
    return [
      { id: createKegiatanId('slot'), urutan: 1, peran: 'Tawasul' },
      { id: createKegiatanId('slot'), urutan: 2, peran: 'Isi Utama' },
      { id: createKegiatanId('slot'), urutan: 3, peran: 'Doa' },
    ];
  });

  const [singleSlotName, setSingleSlotName] = useState('');
  const [rangePrefix, setRangePrefix] = useState('Fashl');
  const [rangeStart, setRangeStart] = useState('1');
  const [rangeEnd, setRangeEnd] = useState('10');
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const reindexSlots = (list: KegiatanTemplateSlot[]): KegiatanTemplateSlot[] =>
    list.map((s, idx) => ({ ...s, urutan: idx + 1 }));

  const handleAddSingleSlot = () => {
    const label = singleSlotName.trim();
    if (!label) return;
    setSlots((prev) =>
      reindexSlots([
        ...prev,
        { id: createKegiatanId('slot'), urutan: prev.length + 1, peran: label },
      ])
    );
    setSingleSlotName('');
  };

  const handleAddRangeSlots = () => {
    const prefix = rangePrefix.trim() || 'Bagian';
    const start = Math.max(1, parseInt(rangeStart, 10) || 1);
    const end = Math.min(50, Math.max(start, parseInt(rangeEnd, 10) || start));
    const additions: KegiatanTemplateSlot[] = [];
    for (let i = start; i <= end; i += 1) {
      additions.push({
        id: createKegiatanId('slot'),
        urutan: 0,
        peran: `${prefix} ${i}`,
      });
    }
    setSlots((prev) => reindexSlots([...prev, ...additions]));
  };

  const handleMoveSlot = (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= slots.length) return;
    const copy = [...slots];
    const temp = copy[index];
    copy[index] = copy[target];
    copy[target] = temp;
    setSlots(reindexSlots(copy));
  };

  const handleUpdateSlotPeran = (id: string, value: string) => {
    setSlots((prev) => prev.map((s) => (s.id === id ? { ...s, peran: value } : s)));
  };

  const handleDeleteSlot = (id: string) => {
    setSlots((prev) => reindexSlots(prev.filter((s) => s.id !== id)));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    if (!namaFormat.trim()) {
      setErrorMsg('Nama format kegiatan wajib diisi.');
      return;
    }
    const cleanSlots = reindexSlots(
      slots.filter((s) => s.peran.trim().length > 0).map((s) => ({ ...s, peran: s.peran.trim() }))
    );
    if (cleanSlots.length === 0) {
      setErrorMsg('Minimal harus terdapat 1 slot rincian pengisi.');
      return;
    }

    setSaving(true);
    try {
      const payload: KegiatanFormatTemplate = {
        id: initialData?.id || createKegiatanId('fmt'),
        nama_format: namaFormat.trim(),
        kategori_default: kategoriDefault,
        deskripsi: deskripsi.trim(),
        slots: cleanSlots,
        bawaan: initialData?.bawaan || false,
        updated_at: new Date().toISOString(),
      };
      await onSave(payload, isEdit);
      onClose();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal menyimpan format kegiatan.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-[1px] flex items-center justify-center p-3 sm:p-4">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xl w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-2 rounded-xl bg-emerald-50 text-emerald-700 shrink-0">
              <Layers className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm sm:text-base font-bold text-slate-900 truncate">
                {isEdit ? 'Ubah Format Pengisi Kegiatan' : 'Buat Format Pengisi Baru'}
              </h3>
              <p className="text-xs text-slate-500 truncate">
                Susun urutan slot pengisi sesuai kebutuhan acara (misal Tawasul, Fashl 1–10, Doa).
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

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 space-y-5">
          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-medium">
              {errorMsg}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Nama Format Kegiatan
              </label>
              <input
                type="text"
                value={namaFormat}
                onChange={(e) => setNamaFormat(e.target.value)}
                placeholder="Contoh: Pembacaan Burdah (10 Fashl)"
                className="w-full min-h-[40px] px-3 py-2 text-xs sm:text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Kategori Default
              </label>
              <select
                value={kategoriDefault}
                onChange={(e) => setKategoriDefault(e.target.value as KategoriKegiatan)}
                className="w-full min-h-[40px] px-3 py-2 text-xs sm:text-sm border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                <option value="rutin">Rutin Mingguan</option>
                <option value="event_besar">Event Besar</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Keterangan Singkat
            </label>
            <input
              type="text"
              value={deskripsi}
              onChange={(e) => setDeskripsi(e.target.value)}
              placeholder="Contoh: 1 Tawasul, 10 Fashl, dan 1 Doa penutup"
              className="w-full min-h-[40px] px-3 py-2 text-xs sm:text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          <div className="border-t border-slate-200 pt-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h4 className="text-xs font-bold text-slate-800">
                  Daftar Slot Rincian Pengisi ({slots.length} Slot)
                </h4>
                <p className="text-[11px] text-slate-500">
                  Tambahkan satu per satu atau buat seri berurutan otomatis.
                </p>
              </div>
            </div>

            {/* Tambah Slot Satuan & Generator Rentang Cepat */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-3 bg-slate-50 border border-slate-200 rounded-xl">
              <div className="space-y-1.5">
                <span className="text-[11px] font-semibold text-slate-700 block">
                  Tambah 1 Slot Pengisi
                </span>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={singleSlotName}
                    onChange={(e) => setSingleSlotName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddSingleSlot();
                      }
                    }}
                    placeholder="Misal: Tawasul / MC / Doa"
                    className="flex-1 min-w-0 min-h-[38px] px-2.5 py-1.5 text-xs border border-slate-200 bg-white rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                  <button
                    type="button"
                    onClick={handleAddSingleSlot}
                    className="min-h-[38px] px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg inline-flex items-center gap-1 whitespace-nowrap shrink-0"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Tambah
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <span className="text-[11px] font-semibold text-slate-700 block">
                  Buat Rentang Otomatis (misal Fashl 1–10)
                </span>
                <div className="flex items-center gap-1.5">
                  <input
                    type="text"
                    value={rangePrefix}
                    onChange={(e) => setRangePrefix(e.target.value)}
                    placeholder="Fashl"
                    className="flex-1 min-w-0 min-h-[38px] px-2.5 py-1.5 text-xs border border-slate-200 bg-white rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                  <input
                    type="number"
                    min={1}
                    max={50}
                    value={rangeStart}
                    onChange={(e) => setRangeStart(e.target.value)}
                    className="w-14 min-h-[38px] px-2 py-1.5 text-xs font-mono tabular-nums border border-slate-200 bg-white rounded-lg text-center"
                  />
                  <span className="text-xs text-slate-500">s/d</span>
                  <input
                    type="number"
                    min={1}
                    max={50}
                    value={rangeEnd}
                    onChange={(e) => setRangeEnd(e.target.value)}
                    className="w-14 min-h-[38px] px-2 py-1.5 text-xs font-mono tabular-nums border border-slate-200 bg-white rounded-lg text-center"
                  />
                  <button
                    type="button"
                    onClick={handleAddRangeSlots}
                    className="min-h-[38px] px-2.5 py-1.5 bg-slate-800 hover:bg-slate-900 text-white text-xs font-semibold rounded-lg inline-flex items-center gap-1 whitespace-nowrap shrink-0"
                  >
                    <ListPlus className="w-3.5 h-3.5" />
                    Sisipkan
                  </button>
                </div>
              </div>
            </div>

            {/* Daftar Slot */}
            <div className="border border-slate-200 rounded-xl divide-y divide-slate-100 max-h-64 overflow-y-auto">
              {slots.length === 0 ? (
                <div className="p-4 text-center text-xs text-slate-500">
                  Belum ada slot pengisi. Tambahkan minimal 1 slot di atas.
                </div>
              ) : (
                slots.map((slot, idx) => (
                  <div
                    key={slot.id}
                    className="px-3 py-2 flex items-center gap-2 bg-white hover:bg-slate-50"
                  >
                    <span className="w-7 text-xs font-mono font-bold text-slate-500 tabular-nums text-center shrink-0">
                      {String(idx + 1).padStart(2, '0')}
                    </span>
                    <input
                      type="text"
                      value={slot.peran}
                      onChange={(e) => handleUpdateSlotPeran(slot.id, e.target.value)}
                      className="flex-1 min-w-0 min-h-[36px] px-2.5 py-1 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleMoveSlot(idx, -1)}
                        disabled={idx === 0}
                        aria-label="Naikkan urutan"
                        className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 disabled:opacity-35"
                      >
                        <ArrowUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleMoveSlot(idx, 1)}
                        disabled={idx === slots.length - 1}
                        aria-label="Turunkan urutan"
                        className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 disabled:opacity-35"
                      >
                        <ArrowDown className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteSlot(slot.id)}
                        aria-label="Hapus slot"
                        className="p-1.5 rounded-lg border border-rose-200 text-rose-600 hover:bg-rose-50"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))
              )}
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
              className="min-h-[40px] px-5 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 rounded-xl whitespace-nowrap"
            >
              {saving ? 'Menyimpan...' : isEdit ? 'Simpan Perubahan Format' : 'Simpan Format Baru'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
