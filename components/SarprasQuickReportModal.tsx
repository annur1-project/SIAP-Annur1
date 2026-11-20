'use client';

import React, { useMemo, useRef, useState } from 'react';
import {
  Camera,
  Image as ImageIcon,
  X,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  Package,
  Trash2,
} from 'lucide-react';
import {
  type SarprasInventarisItem,
  type SarprasLaporanItem,
  type UrgensiSarpras,
  type KondisiAsetSarpras,
  SARPRAS_RUANGAN_DEFAULT,
  compressImageForSarpras,
  uploadSarprasPhoto,
  createSarprasLaporanRow,
  saveSarprasInventarisRow,
  createSarprasId,
  generateKodeTiket,
  getLocalTodayStr,
} from '@/lib/sarpras';
import { useAuth } from '@/lib/auth';

export interface SarprasQuickReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  inventarisList: SarprasInventarisItem[];
  existingLaporan: SarprasLaporanItem[];
  onSubmitted: (
    saved: SarprasLaporanItem,
    meta: {
      usedStorage: boolean;
      bucketMissing: boolean;
      updatedInventaris?: SarprasInventarisItem;
    }
  ) => void;
}

export default function SarprasQuickReportModal(props: SarprasQuickReportModalProps) {
  if (!props.isOpen) return null;
  return <SarprasQuickReportForm {...props} />;
}

function SarprasQuickReportForm({
  onClose,
  inventarisList,
  existingLaporan,
  onSubmitted,
}: SarprasQuickReportModalProps) {
  const { pengurus } = useAuth();
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const galleryInputRef = useRef<HTMLInputElement | null>(null);

  const [ruanganMode, setRuanganMode] = useState<'preset' | 'custom'>('preset');
  const [ruanganPreset, setRuanganPreset] = useState(SARPRAS_RUANGAN_DEFAULT[0]);
  const [ruanganCustom, setRuanganCustom] = useState('');
  const [inventarisId, setInventarisId] = useState('');
  const [syncKondisiAset, setSyncKondisiAset] = useState(true);
  const [judulKerusakan, setJudulKerusakan] = useState('');
  const [rincian, setRincian] = useState('');
  const [urgensi, setUrgensi] = useState<UrgensiSarpras>('biasa');

  // Photo preview state (kompresi tetap berjalan otomatis di latar belakang)
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string>('');
  const [compressing, setCompressing] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const activeRuangan = useMemo(() => {
    return ruanganMode === 'custom' ? ruanganCustom.trim() : ruanganPreset;
  }, [ruanganMode, ruanganCustom, ruanganPreset]);

  const roomOptions = useMemo(() => {
    const set = new Set<string>(SARPRAS_RUANGAN_DEFAULT);
    for (const item of inventarisList) {
      if (item.ruangan?.trim()) set.add(item.ruangan.trim());
    }
    return Array.from(set);
  }, [inventarisList]);

  const matchingAssets = useMemo(() => {
    if (!activeRuangan) return inventarisList;
    const lower = activeRuangan.toLowerCase();
    return inventarisList.filter((a) => a.ruangan.toLowerCase() === lower);
  }, [inventarisList, activeRuangan]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setErrorMsg(null);
    setCompressing(true);
    try {
      const result = await compressImageForSarpras(file);
      setSelectedFile(file);
      setPreviewUrl(result.dataUrlFallback);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal memproses gambar.');
    } finally {
      setCompressing(false);
    }
  };

  const clearPhoto = () => {
    setSelectedFile(null);
    setPreviewUrl('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!activeRuangan) {
      setErrorMsg('Lokasi atau nama ruangan wajib diisi.');
      return;
    }
    if (!judulKerusakan.trim()) {
      setErrorMsg('Judul / ringkasan kerusakan wajib diisi.');
      return;
    }

    setSubmitting(true);
    try {
      const todayIso = getLocalTodayStr();
      let fotoUrl: string | null = null;
      let usedStorage = false;
      let bucketMissing = false;
      let totalKb = 0;

      if (selectedFile) {
        const up = await uploadSarprasPhoto(selectedFile, 'rusak');
        fotoUrl = up.url;
        usedStorage = up.usedStorage;
        bucketMissing = up.bucketMissing;
        totalKb = up.compressedKb;
      }

      const newReport: SarprasLaporanItem = {
        id: createSarprasId('lpr'),
        kode_tiket: generateKodeTiket(todayIso, existingLaporan),
        tanggal_lapor: todayIso,
        pelapor_nama: pengurus?.nama_lengkap || 'Pengurus',
        ruangan: activeRuangan,
        inventaris_id: inventarisId || null,
        judul_kerusakan: judulKerusakan.trim(),
        rincian: rincian.trim(),
        urgensi,
        status: 'menunggu',
        foto_rusak_url: fotoUrl,
        foto_proses_url: null,
        foto_selesai_url: null,
        petugas_sarpras: '',
        catatan_proses: '',
        catatan_selesai: '',
        biaya_perbaikan: 0,
        tgl_proses: null,
        tgl_selesai: null,
        ukuran_total_kb: totalKb,
      };

      const { saved } = await createSarprasLaporanRow(newReport);

      let updatedInventaris: SarprasInventarisItem | undefined;
      if (inventarisId && syncKondisiAset) {
        const targetAsset = inventarisList.find((a) => a.id === inventarisId);
        if (targetAsset) {
          const nextCondition: KondisiAsetSarpras =
            urgensi === 'darurat' ? 'rusak_berat' : 'rusak_ringan';
          if (targetAsset.kondisi === 'baik' || nextCondition === 'rusak_berat') {
            const patched: SarprasInventarisItem = {
              ...targetAsset,
              kondisi: nextCondition,
              updated_at: new Date().toISOString(),
            };
            await saveSarprasInventarisRow(patched, true);
            updatedInventaris = patched;
          }
        }
      }

      onSubmitted(saved, { usedStorage, bucketMissing, updatedInventaris });
      onClose();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal mengirim laporan sarpras.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-[2px] flex items-end sm:items-center justify-center p-0 sm:p-4 overflow-y-auto">
      <div className="bg-white w-full sm:max-w-xl rounded-t-2xl sm:rounded-2xl border border-slate-200 shadow-xl max-h-[92vh] flex flex-col overflow-hidden">
        {/* Header Modal */}
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-3 bg-slate-50/70">
          <div className="min-w-0">
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Package className="w-4 h-4 text-emerald-600 shrink-0" />
              Lapor Kerusakan Sarpras
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Laporkan fasilitas atau sarana pondok yang rusak agar segera ditangani Sie Sarpras.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup modal lapor sarpras"
            className="min-h-[36px] min-w-[36px] rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-slate-600 flex items-center justify-center shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4 overflow-y-auto text-xs">
          {errorMsg && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="font-semibold text-slate-700">
                Ruangan / Lokasi <span className="text-rose-600">*</span>
              </label>
              <button
                type="button"
                onClick={() => {
                  setRuanganMode((m) => (m === 'preset' ? 'custom' : 'preset'));
                  setInventarisId('');
                }}
                className="text-[11px] font-semibold text-emerald-700 hover:underline"
              >
                {ruanganMode === 'preset' ? '+ Ketik Manual' : 'Pilih Daftar'}
              </button>
            </div>
            {ruanganMode === 'preset' ? (
              <select
                value={ruanganPreset}
                onChange={(e) => {
                  setRuanganPreset(e.target.value);
                  setInventarisId('');
                }}
                className="w-full px-3 py-2.5 border border-slate-300 rounded-xl bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                {roomOptions.map((room) => (
                  <option key={room} value={room}>
                    {room}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                value={ruanganCustom}
                onChange={(e) => {
                  setRuanganCustom(e.target.value);
                  setInventarisId('');
                }}
                placeholder="Contoh: Teras Gedung B Lt. 2"
                className="w-full px-3 py-2.5 border border-slate-300 rounded-xl bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                required
              />
            )}
          </div>

          {matchingAssets.length > 0 && (
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
              <label className="block font-semibold text-slate-700">
                Tautkan ke Aset Inventaris di {activeRuangan} (Opsional)
              </label>
              <select
                value={inventarisId}
                onChange={(e) => setInventarisId(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                <option value="">-- Tidak ditautkan ke aset tertentu --</option>
                {matchingAssets.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.kode_aset} · {a.nama_barang} ({a.jumlah} {a.satuan} ·{' '}
                    {a.kondisi === 'baik'
                      ? 'Baik'
                      : a.kondisi === 'rusak_ringan'
                      ? 'Rusak Ringan'
                      : 'Rusak Berat'}
                    )
                  </option>
                ))}
              </select>
              {inventarisId && (
                <label className="flex items-center gap-2 text-[11px] text-slate-600 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={syncKondisiAset}
                    onChange={(e) => setSyncKondisiAset(e.target.checked)}
                    className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                  />
                  Tandai kondisi aset ini di Inventaris sebagai rusak saat laporan dikirim
                </label>
              )}
            </div>
          )}

          <div>
            <label className="block font-semibold text-slate-700 mb-1">
              Judul / Ringkasan Kerusakan <span className="text-rose-600">*</span>
            </label>
            <input
              type="text"
              value={judulKerusakan}
              onChange={(e) => setJudulKerusakan(e.target.value)}
              placeholder="Contoh: Keran air wudhu patah / Lampu kamar mati 2 titik"
              className="w-full px-3 py-2.5 border border-slate-300 rounded-xl bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              required
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1.5">Tingkat Urgensi</label>
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  {
                    value: 'biasa',
                    label: 'Biasa',
                    desc: 'Antrean normal',
                    activeClass: 'bg-slate-800 text-white border-slate-800',
                  },
                  {
                    value: 'penting',
                    label: 'Penting',
                    desc: 'Perlu segera',
                    activeClass: 'bg-amber-600 text-white border-amber-600',
                  },
                  {
                    value: 'darurat',
                    label: 'Darurat',
                    desc: 'Air/Listrik/Kritis',
                    activeClass: 'bg-rose-600 text-white border-rose-600',
                  },
                ] as const
              ).map((opt) => {
                const active = urgensi === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setUrgensi(opt.value)}
                    className={`p-2.5 rounded-xl border text-left transition-colors ${
                      active
                        ? opt.activeClass
                        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <span className="font-bold block">{opt.label}</span>
                    <span
                      className={`text-[10px] block mt-0.5 ${
                        active ? 'text-white/85' : 'text-slate-500'
                      }`}
                    >
                      {opt.desc}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">
              Rincian Kerusakan &amp; Posisi
            </label>
            <textarea
              rows={2}
              value={rincian}
              onChange={(e) => setRincian(e.target.value)}
              placeholder="Jelaskan bagian mana yang rusak, jumlahnya, atau posisi tepatnya..."
              className="w-full px-3 py-2 border border-slate-300 rounded-xl bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          {/* Foto Kondisi Rusak */}
          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2.5">
            <div>
              <span className="font-bold text-slate-800 block">
                Foto Kondisi Rusak (Opsional)
              </span>
              <span className="text-[11px] text-slate-500">
                Lampirkan foto lokasi atau bagian yang rusak agar Sie Sarpras lebih cepat mengecek.
              </span>
            </div>

            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleFileChange}
              className="hidden"
            />
            <input
              ref={galleryInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              className="hidden"
            />

            {!previewUrl ? (
              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  disabled={compressing}
                  onClick={() => cameraInputRef.current?.click()}
                  className="min-h-[44px] px-3 py-2.5 bg-white hover:bg-emerald-50 border border-emerald-300 rounded-xl text-emerald-900 font-semibold flex items-center justify-center gap-2 transition-colors"
                >
                  {compressing ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Camera className="w-4 h-4 text-emerald-600" />
                  )}
                  Ambil Kamera
                </button>
                <button
                  type="button"
                  disabled={compressing}
                  onClick={() => galleryInputRef.current?.click()}
                  className="min-h-[44px] px-3 py-2.5 bg-white hover:bg-slate-50 border border-slate-300 rounded-xl text-slate-800 font-semibold flex items-center justify-center gap-2 transition-colors"
                >
                  <ImageIcon className="w-4 h-4 text-slate-600" />
                  Pilih Galeri
                </button>
              </div>
            ) : (
              <div className="flex items-start gap-3 bg-white p-2.5 rounded-xl border border-emerald-200">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={previewUrl}
                  alt="Pratinjau foto kerusakan"
                  referrerPolicy="no-referrer"
                  className="w-20 h-20 object-cover rounded-lg border border-slate-200 shrink-0"
                />
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center gap-1.5 text-emerald-700 font-bold">
                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                    <span>Foto siap dikirim</span>
                  </div>
                  <p className="text-[11px] text-slate-500">
                    Gambar telah dilampirkan untuk laporan ini.
                  </p>
                  <div className="flex flex-wrap gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => cameraInputRef.current?.click()}
                      className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-semibold text-[11px]"
                    >
                      Ganti Foto
                    </button>
                    <button
                      type="button"
                      onClick={clearPhoto}
                      className="px-2.5 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-lg font-semibold text-[11px] inline-flex items-center gap-1"
                    >
                      <Trash2 className="w-3 h-3" /> Hapus
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="pt-2 flex flex-col-reverse sm:flex-row justify-end gap-2 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="min-h-[44px] px-4 py-2 bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 font-semibold rounded-xl"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={submitting || compressing}
              className="min-h-[44px] px-5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-bold rounded-xl shadow-sm flex items-center justify-center gap-2"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Mengirim Laporan...
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  Kirim Laporan Kerusakan
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
