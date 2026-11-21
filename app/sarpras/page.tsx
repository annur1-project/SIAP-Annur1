'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import {
  Package,
  Wrench,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Plus,
  Search,
  RefreshCw,
  Camera,
  Image as ImageIcon,
  Printer,
  FileSpreadsheet,
  Trash2,
  Edit3,
  X,
  Loader2,
  Eye,
  Tag,
  MapPin,
  Wallet,
  Info,
} from 'lucide-react';
import SarprasQuickReportModal from '@/components/SarprasQuickReportModal';
import {
  type SarprasInventarisItem,
  type SarprasLaporanItem,
  type KondisiAsetSarpras,
  type StatusLaporanSarpras,
  type UrgensiSarpras,
  SARPRAS_RUANGAN_DEFAULT,
  SARPRAS_KATEGORI,
  SARPRAS_SATUAN_OPTIONS,
  createSarprasId,
  generateKodeAset,
  getLocalTodayStr,
  formatRupiah,
  formatTanggalPendek,
  compressImageForSarpras,
  uploadSarprasPhoto,
  removeSarprasStoragePhotos,
  fetchSarprasInventaris,
  fetchSarprasLaporan,
  saveSarprasInventarisRow,
  deleteSarprasInventarisRow,
  updateSarprasLaporanRow,
  deleteSarprasLaporanRow,
} from '@/lib/sarpras';
import { TransparencyBanner, useAuth } from '@/lib/auth';

type ActiveTab = 'laporan' | 'inventaris' | 'rekap';

interface ToastState {
  id: number;
  type: 'success' | 'error' | 'info';
  title: string;
  message: string;
}

const KONDISI_META: Record<
  KondisiAsetSarpras,
  { label: string; badge: string }
> = {
  baik: {
    label: 'Baik',
    badge: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  },
  rusak_ringan: {
    label: 'Rusak Ringan',
    badge: 'bg-amber-50 text-amber-800 border-amber-200',
  },
  rusak_berat: {
    label: 'Rusak Berat',
    badge: 'bg-rose-50 text-rose-700 border-rose-200',
  },
};

const URGENSI_META: Record<
  UrgensiSarpras,
  { label: string; badge: string }
> = {
  biasa: {
    label: 'Biasa',
    badge: 'bg-slate-100 text-slate-700 border-slate-200',
  },
  penting: {
    label: 'Penting',
    badge: 'bg-amber-50 text-amber-800 border-amber-200',
  },
  darurat: {
    label: 'Darurat',
    badge: 'bg-rose-50 text-rose-700 border-rose-200',
  },
};

const STATUS_LAPORAN_META: Record<
  StatusLaporanSarpras,
  { label: string; badge: string }
> = {
  menunggu: {
    label: 'Menunggu',
    badge: 'bg-sky-50 text-sky-800 border-sky-200',
  },
  diproses: {
    label: 'Sedang Diproses',
    badge: 'bg-amber-50 text-amber-800 border-amber-200',
  },
  selesai: {
    label: 'Selesai',
    badge: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  },
};

function subtractMonthsIso(todayIso: string, monthsAgo: number): string {
  const parts = todayIso.split('-').map((n) => parseInt(n, 10));
  if (parts.length !== 3) return todayIso;
  const d = new Date(parts[0], parts[1] - 1 - monthsAgo, parts[2]);
  return getLocalTodayStr(d);
}

export default function SarprasPage() {
  const { canEditModule } = useAuth();
  const canEditSarpras = canEditModule('sarpras');
  const [activeTab, setActiveTab] = useState<ActiveTab>('laporan');
  const [todayStr, setTodayStr] = useState<string>('');
  const [selectedMonth, setSelectedMonth] = useState<string>('');

  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [toasts, setToasts] = useState<ToastState[]>([]);

  // Core data
  const [inventarisList, setInventarisList] = useState<SarprasInventarisItem[]>([]);
  const [laporanList, setLaporanList] = useState<SarprasLaporanItem[]>([]);

  // Quick Report Modal
  const [showQuickReportModal, setShowQuickReportModal] = useState<boolean>(false);

  // Lightbox image preview
  const [lightboxPhoto, setLightboxPhoto] = useState<{
    url: string;
    title: string;
    subtitle: string;
  } | null>(null);

  // Tab 1: Laporan filters
  const [laporanSearch, setLaporanSearch] = useState<string>('');
  const [laporanStatusFilter, setLaporanStatusFilter] = useState<'semua' | StatusLaporanSarpras>('semua');
  const [laporanUrgensiFilter, setLaporanUrgensiFilter] = useState<'semua' | UrgensiSarpras>('semua');

  // Execute Laporan Modal (Proses / Selesai)
  const [execModal, setExecModal] = useState<{
    mode: 'proses' | 'selesai';
    ticket: SarprasLaporanItem;
  } | null>(null);
  const [execPetugas, setExecPetugas] = useState<string>('');
  const [execCatatan, setExecCatatan] = useState<string>('');
  const [execBiaya, setExecBiaya] = useState<string>('0');
  const [execRestoreAsset, setExecRestoreAsset] = useState<boolean>(true);
  const [execFile, setExecFile] = useState<File | null>(null);
  const [execPreviewUrl, setExecPreviewUrl] = useState<string>('');
  const [execCompressing, setExecCompressing] = useState<boolean>(false);
  const execCameraRef = useRef<HTMLInputElement | null>(null);
  const execGalleryRef = useRef<HTMLInputElement | null>(null);

  // Tab 2: Inventaris filters & modal
  const [invSearch, setInvSearch] = useState<string>('');
  const [invRoomFilter, setInvRoomFilter] = useState<string>('semua');
  const [invKategoriFilter, setInvKategoriFilter] = useState<string>('semua');
  const [invKondisiFilter, setInvKondisiFilter] = useState<'semua' | KondisiAsetSarpras>('semua');

  const [showInvModal, setShowInvModal] = useState<boolean>(false);
  const [editingInv, setEditingInv] = useState<SarprasInventarisItem | null>(null);
  const [invKode, setInvKode] = useState<string>('');
  const [invNama, setInvNama] = useState<string>('');
  const [invKategori, setInvKategori] = useState<string>(SARPRAS_KATEGORI[0]);
  const [invRuanganMode, setInvRuanganMode] = useState<'preset' | 'custom'>('preset');
  const [invRuanganPreset, setInvRuanganPreset] = useState<string>(SARPRAS_RUANGAN_DEFAULT[0]);
  const [invRuanganCustom, setInvRuanganCustom] = useState<string>('');
  const [invJumlah, setInvJumlah] = useState<string>('1');
  const [invSatuan, setInvSatuan] = useState<string>('Unit');
  const [invKondisi, setInvKondisi] = useState<KondisiAsetSarpras>('baik');
  const [invTahun, setInvTahun] = useState<string>('');
  const [invSumber, setInvSumber] = useState<string>('Kas Pondok');
  const [invNilai, setInvNilai] = useState<string>('0');
  const [invCatatan, setInvCatatan] = useState<string>('');

  // Print preview mode for KIR / Label Aset
  const [printPreviewMode, setPrintPreviewMode] = useState<'none' | 'kir' | 'labels'>('none');

  // Tab 3: Rekap Biaya & Cleanup
  const [rekapMonthFilter, setRekapMonthFilter] = useState<string>('semua');
  const [cleanupAgeMonths, setCleanupAgeMonths] = useState<number>(3);
  const [cleanupConfirmOpen, setCleanupConfirmOpen] = useState<boolean>(false);

  // Delete confirmation modal
  const [deleteConfirm, setDeleteConfirm] = useState<{
    kind: 'inventaris' | 'laporan';
    id: string;
    label: string;
    laporanObj?: SarprasLaporanItem;
  } | null>(null);

  const showToast = useCallback((type: ToastState['type'], title: string, message: string) => {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    setToasts((prev) => [...prev, { id, type, title, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4500);
  }, []);

  const loadAllData = useCallback(async () => {
    setLoading(true);
    try {
      const [invRes, lapRes] = await Promise.all([
        fetchSarprasInventaris(),
        fetchSarprasLaporan(),
      ]);
      setInventarisList(invRes.rows || []);
      setLaporanList(lapRes.rows || []);
    } catch (err) {
      showToast(
        'error',
        'Gagal Memuat Data Sarpras',
        err instanceof Error ? err.message : 'Terjadi kendala membaca database.'
      );
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    let active = true;
    Promise.resolve().then(() => {
      if (!active) return;
      const t = getLocalTodayStr();
      setTodayStr(t);
      setSelectedMonth(t.slice(0, 7));
      setInvTahun((prev) => prev || t.slice(0, 4));
      void loadAllData();
    });
    return () => {
      active = false;
    };
  }, [loadAllData]);

  // ==========================================
  // DERIVED METRICS
  // ==========================================

  const assetById = useMemo(() => {
    const map = new Map<string, SarprasInventarisItem>();
    for (const item of inventarisList) {
      map.set(item.id, item);
    }
    return map;
  }, [inventarisList]);

  const kpiStats = useMemo(() => {
    const totalJenis = inventarisList.length;
    let totalUnit = 0;
    let unitBaik = 0;
    let asetRusak = 0;
    let asetRusakBerat = 0;
    let totalNilaiAset = 0;

    for (const item of inventarisList) {
      const qty = Math.max(0, Number(item.jumlah || 0));
      totalUnit += qty;
      totalNilaiAset += qty * Math.max(0, Number(item.nilai_satuan || 0));
      if (item.kondisi === 'baik') {
        unitBaik += qty;
      } else {
        asetRusak += 1;
        if (item.kondisi === 'rusak_berat') asetRusakBerat += 1;
      }
    }

    const persenBaik = totalUnit > 0 ? Math.round((unitBaik / totalUnit) * 100) : 100;

    let menunggu = 0;
    let diproses = 0;
    let selesai = 0;
    let daruratAktif = 0;
    let biayaBulanIni = 0;
    let biayaTotal = 0;
    let totalPhotoKb = 0;
    let totalPhotoCount = 0;

    for (const r of laporanList) {
      if (r.status === 'menunggu') menunggu += 1;
      else if (r.status === 'diproses') diproses += 1;
      else if (r.status === 'selesai') selesai += 1;

      if (r.status !== 'selesai' && r.urgensi === 'darurat') daruratAktif += 1;

      const cost = Math.max(0, Number(r.biaya_perbaikan || 0));
      biayaTotal += cost;
      const dateRef = r.tgl_selesai || r.tanggal_lapor || '';
      if (selectedMonth && dateRef.startsWith(selectedMonth)) {
        biayaBulanIni += cost;
      }

      if (r.foto_rusak_url) totalPhotoCount += 1;
      if (r.foto_proses_url) totalPhotoCount += 1;
      if (r.foto_selesai_url) totalPhotoCount += 1;
      totalPhotoKb += Math.max(0, Number(r.ukuran_total_kb || 0));
    }

    // Estimate fallback KB if legacy records have URLs without tracked ukuran_total_kb
    if (totalPhotoCount > 0 && totalPhotoKb === 0) {
      totalPhotoKb = totalPhotoCount * 60;
    }

    return {
      totalJenis,
      totalUnit,
      persenBaik,
      asetRusak,
      asetRusakBerat,
      totalNilaiAset,
      menunggu,
      diproses,
      selesai,
      daruratAktif,
      biayaBulanIni,
      biayaTotal,
      totalPhotoKb,
      totalPhotoCount,
    };
  }, [inventarisList, laporanList, selectedMonth]);

  const roomFilterOptions = useMemo(() => {
    const set = new Set<string>(SARPRAS_RUANGAN_DEFAULT);
    for (const item of inventarisList) {
      if (item.ruangan?.trim()) set.add(item.ruangan.trim());
    }
    return Array.from(set);
  }, [inventarisList]);

  const filteredLaporan = useMemo(() => {
    const q = laporanSearch.trim().toLowerCase();
    return laporanList
      .filter((item) => {
        if (laporanStatusFilter !== 'semua' && item.status !== laporanStatusFilter) return false;
        if (laporanUrgensiFilter !== 'semua' && item.urgensi !== laporanUrgensiFilter) return false;
        if (!q) return true;
        return (
          item.kode_tiket.toLowerCase().includes(q) ||
          item.judul_kerusakan.toLowerCase().includes(q) ||
          item.ruangan.toLowerCase().includes(q) ||
          (item.petugas_sarpras || '').toLowerCase().includes(q) ||
          (item.rincian || '').toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        // Active urgent items first, then latest date
        const rankStatus = (s: StatusLaporanSarpras) =>
          s === 'menunggu' ? 0 : s === 'diproses' ? 1 : 2;
        const sa = rankStatus(a.status);
        const sb = rankStatus(b.status);
        if (sa !== sb) return sa - sb;
        return (b.tanggal_lapor || '').localeCompare(a.tanggal_lapor || '');
      });
  }, [laporanList, laporanSearch, laporanStatusFilter, laporanUrgensiFilter]);

  const filteredInventaris = useMemo(() => {
    const q = invSearch.trim().toLowerCase();
    return inventarisList.filter((item) => {
      if (invRoomFilter !== 'semua' && item.ruangan !== invRoomFilter) return false;
      if (invKategoriFilter !== 'semua' && item.kategori !== invKategoriFilter) return false;
      if (invKondisiFilter !== 'semua' && item.kondisi !== invKondisiFilter) return false;
      if (!q) return true;
      return (
        item.kode_aset.toLowerCase().includes(q) ||
        item.nama_barang.toLowerCase().includes(q) ||
        item.ruangan.toLowerCase().includes(q) ||
        item.kategori.toLowerCase().includes(q) ||
        (item.catatan || '').toLowerCase().includes(q)
      );
    });
  }, [inventarisList, invSearch, invRoomFilter, invKategoriFilter, invKondisiFilter]);

  const kirGroupedByRoom = useMemo(() => {
    const map = new Map<string, SarprasInventarisItem[]>();
    for (const item of filteredInventaris) {
      const room = item.ruangan || 'Umum';
      const arr = map.get(room) || [];
      arr.push(item);
      map.set(room, arr);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [filteredInventaris]);

  // Tab 3 derived data
  const rekapBiayaRows = useMemo(() => {
    return laporanList
      .filter((r) => {
        const cost = Number(r.biaya_perbaikan || 0);
        if (cost <= 0 && r.status !== 'selesai') return false;
        if (rekapMonthFilter !== 'semua') {
          const ref = r.tgl_selesai || r.tanggal_lapor || '';
          if (!ref.startsWith(rekapMonthFilter)) return false;
        }
        return true;
      })
      .sort((a, b) =>
        (b.tgl_selesai || b.tanggal_lapor || '').localeCompare(a.tgl_selesai || a.tanggal_lapor || '')
      );
  }, [laporanList, rekapMonthFilter]);

  const rekapMonthOptions = useMemo(() => {
    const set = new Set<string>();
    if (selectedMonth) set.add(selectedMonth);
    for (const r of laporanList) {
      const d = (r.tgl_selesai || r.tanggal_lapor || '').slice(0, 7);
      if (/^\d{4}-\d{2}$/.test(d)) set.add(d);
    }
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [laporanList, selectedMonth]);

  const rekapTotalBiayaFiltered = useMemo(() => {
    return rekapBiayaRows.reduce((sum, r) => sum + Math.max(0, Number(r.biaya_perbaikan || 0)), 0);
  }, [rekapBiayaRows]);

  const cleanupCandidates = useMemo(() => {
    const cutoff = todayStr ? subtractMonthsIso(todayStr, cleanupAgeMonths) : '';
    return laporanList.filter((r) => {
      if (r.status !== 'selesai') return false;
      const hasAnyPhoto = Boolean(r.foto_rusak_url || r.foto_proses_url || r.foto_selesai_url);
      if (!hasAnyPhoto) return false;
      if (cleanupAgeMonths === 0) return true;
      const refDate = r.tgl_selesai || r.tanggal_lapor || '';
      return Boolean(cutoff && refDate && refDate <= cutoff);
    });
  }, [laporanList, todayStr, cleanupAgeMonths]);

  const openExecModal = (mode: 'proses' | 'selesai', ticket: SarprasLaporanItem) => {
    if (!canEditSarpras) return;
    setExecModal({ mode, ticket });
    setExecPetugas(ticket.petugas_sarpras || '');
    setExecCatatan(mode === 'proses' ? ticket.catatan_proses || '' : ticket.catatan_selesai || '');
    setExecBiaya(String(ticket.biaya_perbaikan || 0));
    setExecRestoreAsset(true);
    setExecFile(null);
    setExecPreviewUrl(
      mode === 'proses' ? ticket.foto_proses_url || '' : ticket.foto_selesai_url || ''
    );
  };

  const handleExecPhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setExecCompressing(true);
    try {
      const res = await compressImageForSarpras(file);
      setExecFile(file);
      setExecPreviewUrl(res.dataUrlFallback);
    } catch (err) {
      showToast(
        'error',
        'Gagal Memproses Foto',
        err instanceof Error ? err.message : 'Pilih file gambar yang valid.'
      );
    } finally {
      setExecCompressing(false);
    }
  };

  const handleExecSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEditSarpras || !execModal) return;
    const { mode, ticket } = execModal;

    setSaving(true);
    try {
      const today = todayStr || getLocalTodayStr();
      let newPhotoUrl = mode === 'proses' ? ticket.foto_proses_url : ticket.foto_selesai_url;
      let addedKb = 0;

      if (execFile) {
        const up = await uploadSarprasPhoto(execFile, mode);
        newPhotoUrl = up.url;
        addedKb = up.compressedKb;
      } else if (!execPreviewUrl) {
        newPhotoUrl = null;
      }

      const nextKb = Math.max(0, Number(ticket.ukuran_total_kb || 0)) + addedKb;
      const patch: Partial<SarprasLaporanItem> =
        mode === 'proses'
          ? {
              status: 'diproses',
              petugas_sarpras: execPetugas.trim() || 'Sie Sarpras',
              catatan_proses: execCatatan.trim(),
              foto_proses_url: newPhotoUrl,
              tgl_proses: ticket.tgl_proses || today,
              ukuran_total_kb: nextKb,
            }
          : {
              status: 'selesai',
              petugas_sarpras: execPetugas.trim() || ticket.petugas_sarpras || 'Sie Sarpras',
              catatan_selesai: execCatatan.trim(),
              foto_selesai_url: newPhotoUrl,
              biaya_perbaikan: Math.max(0, parseInt(execBiaya.replace(/\D/g, '') || '0', 10)),
              tgl_proses: ticket.tgl_proses || today,
              tgl_selesai: today,
              ukuran_total_kb: nextKb,
            };

      await updateSarprasLaporanRow(ticket.id, patch);

      setLaporanList((prev) =>
        prev.map((row) => (row.id === ticket.id ? { ...row, ...patch } : row))
      );

      // Optional 1-click restore asset condition when ticket completed
      if (mode === 'selesai' && execRestoreAsset && ticket.inventaris_id) {
        const asset = assetById.get(ticket.inventaris_id);
        if (asset && asset.kondisi !== 'baik') {
          const updatedAsset: SarprasInventarisItem = {
            ...asset,
            kondisi: 'baik',
            updated_at: new Date().toISOString(),
          };
          await saveSarprasInventarisRow(updatedAsset, true);
          setInventarisList((prev) =>
            prev.map((a) => (a.id === updatedAsset.id ? updatedAsset : a))
          );
        }
      }

      setExecModal(null);
      showToast(
        'success',
        mode === 'proses' ? 'Tiket Sedang Diproses' : 'Perbaikan Selesai',
        mode === 'proses'
          ? `Laporan ${ticket.kode_tiket} masuk tahap pengerjaan.`
          : `Tiket ${ticket.kode_tiket} berhasil ditandai selesai.`
      );
    } catch (err) {
      showToast(
        'error',
        'Gagal Memperbarui Tiket',
        err instanceof Error ? err.message : 'Terjadi kesalahan saat menyimpan.'
      );
    } finally {
      setSaving(false);
    }
  };

  // ==========================================
  // HANDLERS: INVENTARIS CRUD & EXPORT
  // ==========================================

  const openAddInvModal = () => {
    if (!canEditSarpras) return;
    const defaultRoom =
      invRoomFilter !== 'semua' ? invRoomFilter : SARPRAS_RUANGAN_DEFAULT[0];
    const isPreset = roomFilterOptions.includes(defaultRoom);
    setEditingInv(null);
    setInvRuanganMode(isPreset ? 'preset' : 'custom');
    setInvRuanganPreset(isPreset ? defaultRoom : SARPRAS_RUANGAN_DEFAULT[0]);
    setInvRuanganCustom(isPreset ? '' : defaultRoom);
    setInvKode(generateKodeAset(defaultRoom, inventarisList));
    setInvNama('');
    setInvKategori(SARPRAS_KATEGORI[0]);
    setInvJumlah('1');
    setInvSatuan('Unit');
    setInvKondisi('baik');
    setInvTahun((todayStr || getLocalTodayStr()).slice(0, 4));
    setInvSumber('Kas Pondok');
    setInvNilai('0');
    setInvCatatan('');
    setShowInvModal(true);
  };

  const openEditInvModal = (item: SarprasInventarisItem) => {
    if (!canEditSarpras) return;
    const isPreset = roomFilterOptions.includes(item.ruangan);
    setEditingInv(item);
    setInvRuanganMode(isPreset ? 'preset' : 'custom');
    setInvRuanganPreset(isPreset ? item.ruangan : SARPRAS_RUANGAN_DEFAULT[0]);
    setInvRuanganCustom(isPreset ? '' : item.ruangan);
    setInvKode(item.kode_aset);
    setInvNama(item.nama_barang);
    setInvKategori(item.kategori);
    setInvJumlah(String(item.jumlah));
    setInvSatuan(item.satuan);
    setInvKondisi(item.kondisi);
    setInvTahun(item.tahun_perolehan || '');
    setInvSumber(item.sumber_dana || 'Kas Pondok');
    setInvNilai(String(item.nilai_satuan || 0));
    setInvCatatan(item.catatan || '');
    setShowInvModal(true);
  };

  const handleSaveInventaris = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEditSarpras) return;
    const ruangan =
      invRuanganMode === 'custom' ? invRuanganCustom.trim() : invRuanganPreset;
    if (!ruangan) {
      showToast('error', 'Ruangan Kosong', 'Pilih atau ketik nama ruangan/lokasi aset.');
      return;
    }
    if (!invNama.trim()) {
      showToast('error', 'Nama Barang Kosong', 'Nama barang inventaris wajib diisi.');
      return;
    }

    setSaving(true);
    try {
      const payload: SarprasInventarisItem = {
        id: editingInv ? editingInv.id : createSarprasId('inv'),
        kode_aset: invKode.trim() || generateKodeAset(ruangan, inventarisList),
        nama_barang: invNama.trim(),
        kategori: invKategori,
        ruangan,
        jumlah: Math.max(1, parseInt(invJumlah || '1', 10)),
        satuan: invSatuan || 'Unit',
        kondisi: invKondisi,
        tahun_perolehan: invTahun.trim(),
        sumber_dana: invSumber.trim() || 'Kas Pondok',
        nilai_satuan: Math.max(0, parseInt(invNilai.replace(/\D/g, '') || '0', 10)),
        catatan: invCatatan.trim(),
        updated_at: new Date().toISOString(),
      };

      const { saved } = await saveSarprasInventarisRow(
        payload,
        Boolean(editingInv)
      );

      setInventarisList((prev) =>
        editingInv
          ? prev.map((r) => (r.id === saved.id ? saved : r))
          : [saved, ...prev]
      );
      setShowInvModal(false);
      showToast(
        'success',
        editingInv ? 'Aset Diperbarui' : 'Aset Ditambahkan',
        `${saved.kode_aset} · ${saved.nama_barang} (${saved.ruangan})`
      );
    } catch (err) {
      showToast(
        'error',
        'Gagal Menyimpan Aset',
        err instanceof Error ? err.message : 'Terjadi kendala saat menyimpan aset.'
      );
    } finally {
      setSaving(false);
    }
  };

  const handleQuickKondisiChange = async (
    item: SarprasInventarisItem,
    nextKondisi: KondisiAsetSarpras
  ) => {
    if (!canEditSarpras) return;
    const updated: SarprasInventarisItem = {
      ...item,
      kondisi: nextKondisi,
      updated_at: new Date().toISOString(),
    };
    setInventarisList((prev) => prev.map((r) => (r.id === item.id ? updated : r)));
    await saveSarprasInventarisRow(updated, true);
    showToast(
      'info',
      'Kondisi Diperbarui',
      `${item.nama_barang} (${item.ruangan}) → ${KONDISI_META[nextKondisi].label}`
    );
  };

  const handleExportInventarisExcel = () => {
    const rows = filteredInventaris.map((item, idx) => ({
      No: idx + 1,
      'Kode Aset': item.kode_aset,
      Ruangan: item.ruangan,
      'Nama Barang': item.nama_barang,
      Kategori: item.kategori,
      Jumlah: item.jumlah,
      Satuan: item.satuan,
      Kondisi: KONDISI_META[item.kondisi].label,
      'Tahun Perolehan': item.tahun_perolehan || '-',
      'Sumber Dana': item.sumber_dana || '-',
      'Nilai Satuan (Rp)': item.nilai_satuan || 0,
      'Total Nilai (Rp)': (item.jumlah || 0) * (item.nilai_satuan || 0),
      Catatan: item.catatan || '',
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Inventaris Pondok');
    XLSX.writeFile(wb, `Inventaris_Sarpras_${todayStr || 'Pondok'}.xlsx`);
    showToast('success', 'Export Berhasil', `${rows.length} baris inventaris diekspor ke Excel.`);
  };

  const handleExportBiayaExcel = () => {
    const rows = rekapBiayaRows.map((r, idx) => ({
      No: idx + 1,
      'Kode Tiket': r.kode_tiket,
      'Tgl Lapor': r.tanggal_lapor,
      'Tgl Selesai': r.tgl_selesai || '-',
      Ruangan: r.ruangan,
      Kerusakan: r.judul_kerusakan,
      'Petugas Sarpras': r.petugas_sarpras || '-',
      'Catatan Selesai': r.catatan_selesai || '',
      'Biaya Perbaikan (Rp)': r.biaya_perbaikan || 0,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Biaya Perbaikan Sarpras');
    XLSX.writeFile(
      wb,
      `Rekap_Biaya_Sarpras_${rekapMonthFilter === 'semua' ? 'Semua' : rekapMonthFilter}.xlsx`
    );
    showToast('success', 'Export Berhasil', `${rows.length} tiket perbaikan diekspor ke Excel.`);
  };

  // ==========================================
  // HANDLERS: DELETE & STORAGE CLEANUP
  // ==========================================

  const handleExecuteDelete = async () => {
    if (!canEditSarpras || !deleteConfirm) return;
    setSaving(true);
    try {
      if (deleteConfirm.kind === 'inventaris') {
        await deleteSarprasInventarisRow(deleteConfirm.id);
        setInventarisList((prev) => prev.filter((r) => r.id !== deleteConfirm.id));
        showToast('info', 'Aset Dihapus', `${deleteConfirm.label} telah dihapus dari inventaris.`);
      } else if (deleteConfirm.laporanObj) {
        await deleteSarprasLaporanRow(deleteConfirm.laporanObj);
        setLaporanList((prev) => prev.filter((r) => r.id !== deleteConfirm.id));
        showToast('info', 'Laporan Dihapus', `Tiket ${deleteConfirm.label} beserta fotonya dihapus.`);
      }
      setDeleteConfirm(null);
    } finally {
      setSaving(false);
    }
  };

  const handleExecuteCleanupPhotos = async () => {
    if (!canEditSarpras || cleanupCandidates.length === 0) {
      setCleanupConfirmOpen(false);
      return;
    }
    setSaving(true);
    try {
      const urlsToDelete: Array<string | null | undefined> = [];
      for (const ticket of cleanupCandidates) {
        urlsToDelete.push(ticket.foto_rusak_url, ticket.foto_proses_url, ticket.foto_selesai_url);
      }
      await removeSarprasStoragePhotos(urlsToDelete);

      const candidateIds = new Set(cleanupCandidates.map((c) => c.id));
      for (const ticket of cleanupCandidates) {
        await updateSarprasLaporanRow(ticket.id, {
          foto_rusak_url: null,
          foto_proses_url: null,
          foto_selesai_url: null,
          ukuran_total_kb: 0,
        });
      }

      setLaporanList((prev) =>
        prev.map((r) =>
          candidateIds.has(r.id)
            ? {
                ...r,
                foto_rusak_url: null,
                foto_proses_url: null,
                foto_selesai_url: null,
                ukuran_total_kb: 0,
              }
            : r
        )
      );

      setCleanupConfirmOpen(false);
      showToast(
        'success',
        'Pembersihan Arsip Selesai',
        `Foto dari ${cleanupCandidates.length} tiket selesai lama berhasil dibersihkan. Riwayat laporan & biaya tetap aman.`
      );
    } catch (err) {
      showToast(
        'error',
        'Gagal Membersihkan Foto',
        err instanceof Error ? err.message : 'Terjadi kendala saat menghapus file lama.'
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      {/* ========================================================= */}
      {/* AREA LAYAR UTAMA (DISEMBUNYIKAN SAAT PRINT KIR / LABEL)    */}
      {/* ========================================================= */}
      <div className="print:hidden max-w-7xl mx-auto space-y-6">
        {/* TOAST NOTIFICATIONS */}
        {toasts.length > 0 && (
          <div className="fixed top-4 right-4 z-[60] space-y-2 max-w-sm w-full px-4 sm:px-0 pointer-events-none">
            {toasts.map((t) => (
              <div
                key={t.id}
                className={`pointer-events-auto p-3.5 rounded-xl border shadow-lg text-xs flex items-start gap-2.5 bg-white ${
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
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                ) : (
                  <Info className="w-4 h-4 text-sky-600 shrink-0 mt-0.5" />
                )}
                <div className="flex-1 min-w-0">
                  <strong className="block font-bold">{t.title}</strong>
                  <p className="text-[11px] opacity-85 mt-0.5">{t.message}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        <TransparencyBanner
          moduleLabel="Sarpras & Inventaris Pondok"
          isReadOnly={!canEditSarpras}
          extraNote="Tombol cepat Lapor Kerusakan Sarpras tetap terbuka bagi seluruh pengurus aktif."
        />

        {/* PAGE HEADER */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 flex items-center gap-2.5">
              <Package className="w-6 h-6 text-emerald-600 shrink-0" />
              Sarpras &amp; Inventaris Pondok
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 mt-1">
              Pencatatan inventaris per ruangan serta penanganan laporan kerusakan dari tahap masuk hingga selesai.
            </p>
          </div>

          <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2 w-full lg:w-auto">
            <button
              type="button"
              onClick={() => void loadAllData()}
              disabled={loading}
              className="min-h-[40px] px-3 py-2 bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 text-xs font-semibold rounded-xl inline-flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              Muat Ulang
            </button>

            {canEditSarpras && (
              <button
                type="button"
                onClick={openAddInvModal}
                className="min-h-[40px] px-3.5 py-2 bg-white hover:bg-emerald-50 border border-emerald-600 text-emerald-700 text-xs font-bold rounded-xl inline-flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0"
              >
                <Plus className="w-4 h-4" />
                Tambah Inventaris
              </button>
            )}

            <button
              type="button"
              onClick={() => setShowQuickReportModal(true)}
              className={`min-h-[40px] px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-sm inline-flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 ${
                canEditSarpras ? 'col-span-2 sm:col-span-1' : ''
              }`}
            >
              <Camera className="w-4 h-4" />
              Lapor Kerusakan
            </button>
          </div>
        </div>

        {/* KPI STRIP */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-slate-500">Total Aset Pondok</span>
              <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl">
                <Package className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-3">
              <strong className="text-xl sm:text-2xl font-bold text-slate-900 tabular-nums">
                {loading ? '...' : kpiStats.totalUnit}
              </strong>
              <span className="text-xs text-slate-500 ml-1.5 font-medium">
                unit ({kpiStats.totalJenis} jenis)
              </span>
              <p className="text-[11px] text-emerald-700 font-semibold mt-1 tabular-nums">
                {kpiStats.persenBaik}% kondisi baik
              </p>
            </div>
          </div>

          <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-slate-500">Aset Perlu Perhatian</span>
              <div className="p-2 bg-amber-50 text-amber-600 rounded-xl">
                <AlertTriangle className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-3">
              <strong
                className={`text-xl sm:text-2xl font-bold tabular-nums ${
                  kpiStats.asetRusak > 0 ? 'text-amber-700' : 'text-slate-900'
                }`}
              >
                {loading ? '...' : kpiStats.asetRusak}
              </strong>
              <span className="text-xs text-slate-500 ml-1.5">baris aset</span>
              <p className="text-[11px] text-slate-600 mt-1 tabular-nums">
                {kpiStats.asetRusakBerat > 0 ? (
                  <span className="text-rose-700 font-semibold">
                    {kpiStats.asetRusakBerat} kondisi rusak berat
                  </span>
                ) : (
                  'Tidak ada aset rusak berat'
                )}
              </p>
            </div>
          </div>

          <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-slate-500">Tiket Kerusakan Aktif</span>
              <div className="p-2 bg-sky-50 text-sky-600 rounded-xl">
                <Wrench className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-3">
              <strong
                className={`text-xl sm:text-2xl font-bold tabular-nums ${
                  kpiStats.daruratAktif > 0 ? 'text-rose-700' : 'text-slate-900'
                }`}
              >
                {loading ? '...' : kpiStats.menunggu + kpiStats.diproses}
              </strong>
              <span className="text-xs text-slate-500 ml-1.5">tiket aktif</span>
              <p className="text-[11px] text-slate-600 mt-1 tabular-nums">
                {kpiStats.menunggu} Menunggu &middot; {kpiStats.diproses} Diproses
              </p>
            </div>
          </div>

          <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-slate-500">Biaya Perbaikan Bulan Ini</span>
              <div className="p-2 bg-purple-50 text-purple-600 rounded-xl">
                <Wallet className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-3">
              <strong className="text-lg sm:text-xl font-bold text-slate-900 tabular-nums block truncate">
                {loading ? '...' : formatRupiah(kpiStats.biayaBulanIni)}
              </strong>
              <p className="text-[11px] text-slate-500 mt-1">
                Khusus catatan internal Sie Sarpras
              </p>
            </div>
          </div>
        </div>

        {/* NAVIGATION TABS */}
        <div className="bg-white p-1.5 rounded-2xl border border-slate-200 shadow-sm grid grid-cols-1 sm:grid-cols-3 gap-1.5">
          <button
            type="button"
            onClick={() => setActiveTab('laporan')}
            className={`min-h-[42px] px-4 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-colors ${
              activeTab === 'laporan'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Wrench className="w-4 h-4 shrink-0" />
            <span>Laporan Kerusakan ({kpiStats.menunggu + kpiStats.diproses} Aktif)</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('inventaris')}
            className={`min-h-[42px] px-4 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-colors ${
              activeTab === 'inventaris'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Package className="w-4 h-4 shrink-0" />
            <span>Inventaris Pondok ({inventarisList.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('rekap')}
            className={`min-h-[42px] px-4 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-colors ${
              activeTab === 'rekap'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Wallet className="w-4 h-4 shrink-0" />
            <span>Rekap Biaya &amp; Arsip</span>
          </button>
        </div>

        {/* ========================================================= */}
        {/* TAB 1: LAPORAN KERUSAKAN (ANTRIAN -> PROSES -> SELESAI)   */}
        {/* ========================================================= */}
        {activeTab === 'laporan' && (
          <div className="space-y-4">
            {/* FILTER BAR */}
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm grid grid-cols-1 md:grid-cols-12 gap-3 text-xs">
              <div className="md:col-span-6 relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={laporanSearch}
                  onChange={(e) => setLaporanSearch(e.target.value)}
                  placeholder="Cari kode tiket, kerusakan, ruangan, atau petugas..."
                  className="w-full pl-9 pr-3 py-2.5 border border-slate-300 rounded-xl bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="md:col-span-3">
                <select
                  value={laporanStatusFilter}
                  onChange={(e) =>
                    setLaporanStatusFilter(e.target.value as 'semua' | StatusLaporanSarpras)
                  }
                  className="w-full px-3 py-2.5 border border-slate-300 rounded-xl bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="semua">Semua Status Tiket</option>
                  <option value="menunggu">Menunggu ({kpiStats.menunggu})</option>
                  <option value="diproses">Sedang Diproses ({kpiStats.diproses})</option>
                  <option value="selesai">Selesai ({kpiStats.selesai})</option>
                </select>
              </div>

              <div className="md:col-span-3">
                <select
                  value={laporanUrgensiFilter}
                  onChange={(e) =>
                    setLaporanUrgensiFilter(e.target.value as 'semua' | UrgensiSarpras)
                  }
                  className="w-full px-3 py-2.5 border border-slate-300 rounded-xl bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="semua">Semua Urgensi</option>
                  <option value="darurat">Darurat</option>
                  <option value="penting">Penting</option>
                  <option value="biasa">Biasa</option>
                </select>
              </div>
            </div>

            {/* LIST TIKET LAPORAN */}
            {loading ? (
              <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center text-xs text-slate-500">
                Memuat antrean laporan sarpras...
              </div>
            ) : filteredLaporan.length === 0 ? (
              <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 mx-auto flex items-center justify-center">
                  <Wrench className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    Belum Ada Laporan Kerusakan
                  </h3>
                  <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                    Jika pengurus menemukan keran bocor, lampu mati, atau fasilitas kamar rusak, langsung kirim laporan beserta foto agar cepat ditangani Sie Sarpras.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowQuickReportModal(true)}
                  className="min-h-[40px] px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl inline-flex items-center gap-1.5"
                >
                  <Camera className="w-4 h-4" />
                  Buat Laporan Pertama
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {filteredLaporan.map((ticket) => {
                  const linkedAsset = ticket.inventaris_id
                    ? assetById.get(ticket.inventaris_id)
                    : undefined;
                  const statusMeta = STATUS_LAPORAN_META[ticket.status];
                  const urgensiMeta = URGENSI_META[ticket.urgensi];

                  return (
                    <div
                      key={ticket.id}
                      className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 sm:p-5 space-y-4"
                    >
                      {/* Top row */}
                      <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-3">
                        <div className="space-y-1.5 min-w-0">
                          <div className="flex flex-wrap items-center gap-2 text-[11px]">
                            <span className="font-mono font-bold px-2 py-0.5 rounded-md bg-slate-100 text-slate-800 border border-slate-200">
                              {ticket.kode_tiket}
                            </span>
                            <span
                              className={`font-semibold px-2 py-0.5 rounded-md border ${statusMeta.badge}`}
                            >
                              {statusMeta.label}
                            </span>
                            <span
                              className={`font-semibold px-2 py-0.5 rounded-md border ${urgensiMeta.badge}`}
                            >
                              Urgensi: {urgensiMeta.label}
                            </span>
                            <span className="inline-flex items-center gap-1 font-semibold text-slate-700">
                              <MapPin className="w-3.5 h-3.5 text-emerald-600" />
                              {ticket.ruangan}
                            </span>
                            <span className="text-slate-400">&middot;</span>
                            <span className="text-slate-500 tabular-nums">
                              Lapor {formatTanggalPendek(ticket.tanggal_lapor)}
                            </span>
                          </div>

                          <h3 className="text-sm sm:text-base font-bold text-slate-900">
                            {ticket.judul_kerusakan}
                          </h3>

                          {linkedAsset && (
                            <p className="text-xs text-slate-600">
                              Aset terkait:{' '}
                              <span className="font-mono text-emerald-800 font-semibold">
                                {linkedAsset.kode_aset} ({linkedAsset.nama_barang})
                              </span>
                            </p>
                          )}

                          {ticket.rincian && (
                            <p className="text-xs text-slate-700 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
                              {ticket.rincian}
                            </p>
                          )}
                        </div>

                        {/* Action Buttons */}
                        {canEditSarpras && (
                          <div className="flex flex-wrap items-center gap-2 shrink-0">
                            {ticket.status === 'menunggu' && (
                              <button
                                type="button"
                                onClick={() => openExecModal('proses', ticket)}
                                className="min-h-[40px] px-3.5 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-xl inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
                              >
                                <Wrench className="w-3.5 h-3.5" />
                                Proses Pengerjaan
                              </button>
                            )}

                            {ticket.status === 'diproses' && (
                              <button
                                type="button"
                                onClick={() => openExecModal('proses', ticket)}
                                className="min-h-[40px] px-3 py-2 bg-white hover:bg-amber-50 border border-amber-300 text-amber-800 text-xs font-semibold rounded-xl inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                                Update Proses
                              </button>
                            )}

                            {ticket.status !== 'selesai' ? (
                              <button
                                type="button"
                                onClick={() => openExecModal('selesai', ticket)}
                                className="min-h-[40px] px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
                              >
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                Tandai Selesai
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => openExecModal('selesai', ticket)}
                                className="min-h-[40px] px-3 py-2 bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 text-xs font-semibold rounded-xl inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                                Edit Selesai / Biaya
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={() =>
                                setDeleteConfirm({
                                  kind: 'laporan',
                                  id: ticket.id,
                                  label: ticket.kode_tiket,
                                  laporanObj: ticket,
                                })
                              }
                              aria-label={`Hapus tiket ${ticket.kode_tiket}`}
                              className="min-h-[40px] min-w-[40px] px-2.5 py-2 bg-white hover:bg-rose-50 border border-slate-200 hover:border-rose-300 text-rose-600 rounded-xl inline-flex items-center justify-center shrink-0"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        )}
                      </div>

                      {/* 3-STAGE PHOTO TIMELINE: RUSAK -> PROSES -> SELESAI */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-slate-100 text-xs">
                        {/* Stage 1: Foto Rusak */}
                        <div className="p-2.5 rounded-xl border border-slate-200 bg-slate-50/60 flex items-center gap-3">
                          {ticket.foto_rusak_url ? (
                            <button
                              type="button"
                              onClick={() =>
                                setLightboxPhoto({
                                  url: ticket.foto_rusak_url || '',
                                  title: `Foto Awal Kerusakan · ${ticket.kode_tiket}`,
                                  subtitle: `${ticket.ruangan} — ${ticket.judul_kerusakan}`,
                                })
                              }
                              className="relative w-16 h-16 rounded-lg overflow-hidden border border-slate-300 shrink-0 group"
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={ticket.foto_rusak_url}
                                alt="Foto kerusakan awal"
                                referrerPolicy="no-referrer"
                                className="w-full h-full object-cover"
                              />
                              <span className="absolute inset-0 bg-slate-900/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
                                <Eye className="w-4 h-4" />
                              </span>
                            </button>
                          ) : (
                            <div className="w-16 h-16 rounded-lg border border-dashed border-slate-300 bg-white flex items-center justify-center text-slate-400 shrink-0">
                              <ImageIcon className="w-5 h-5" />
                            </div>
                          )}
                          <div className="min-w-0">
                            <span className="font-bold text-slate-800 block">1. Kondisi Rusak</span>
                            <span className="text-[11px] text-slate-500 block">
                              {ticket.foto_rusak_url
                                ? 'Klik foto untuk perbesar'
                                : 'Tanpa lampiran foto awal'}
                            </span>
                            <span className="text-[11px] text-slate-500 tabular-nums">
                              {formatTanggalPendek(ticket.tanggal_lapor)}
                            </span>
                          </div>
                        </div>

                        {/* Stage 2: Foto Proses */}
                        <div className="p-2.5 rounded-xl border border-slate-200 bg-slate-50/60 flex items-center gap-3">
                          {ticket.foto_proses_url ? (
                            <button
                              type="button"
                              onClick={() =>
                                setLightboxPhoto({
                                  url: ticket.foto_proses_url || '',
                                  title: `Foto Proses Pengerjaan · ${ticket.kode_tiket}`,
                                  subtitle: `Petugas: ${ticket.petugas_sarpras || 'Sie Sarpras'}`,
                                })
                              }
                              className="relative w-16 h-16 rounded-lg overflow-hidden border border-amber-300 shrink-0 group"
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={ticket.foto_proses_url}
                                alt="Foto proses pengerjaan"
                                referrerPolicy="no-referrer"
                                className="w-full h-full object-cover"
                              />
                              <span className="absolute inset-0 bg-slate-900/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
                                <Eye className="w-4 h-4" />
                              </span>
                            </button>
                          ) : (
                            <div className="w-16 h-16 rounded-lg border border-dashed border-slate-300 bg-white flex items-center justify-center text-slate-400 shrink-0">
                              <Clock className="w-5 h-5" />
                            </div>
                          )}
                          <div className="min-w-0">
                            <span className="font-bold text-slate-800 block">2. Proses Perbaikan</span>
                            {ticket.petugas_sarpras ? (
                              <>
                                <span className="text-[11px] text-amber-800 font-semibold block truncate">
                                  PJ: {ticket.petugas_sarpras}
                                </span>
                                <span className="text-[11px] text-slate-600 line-clamp-1">
                                  {ticket.catatan_proses || formatTanggalPendek(ticket.tgl_proses)}
                                </span>
                              </>
                            ) : (
                              <span className="text-[11px] text-slate-500 block">
                                Menunggu eksekusi Sarpras
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Stage 3: Foto Selesai */}
                        <div className="p-2.5 rounded-xl border border-slate-200 bg-slate-50/60 flex items-center gap-3">
                          {ticket.foto_selesai_url ? (
                            <button
                              type="button"
                              onClick={() =>
                                setLightboxPhoto({
                                  url: ticket.foto_selesai_url || '',
                                  title: `Foto Hasil Selesai · ${ticket.kode_tiket}`,
                                  subtitle: `Biaya internal Sarpras: ${formatRupiah(ticket.biaya_perbaikan)}`,
                                })
                              }
                              className="relative w-16 h-16 rounded-lg overflow-hidden border border-emerald-300 shrink-0 group"
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={ticket.foto_selesai_url}
                                alt="Foto hasil perbaikan selesai"
                                referrerPolicy="no-referrer"
                                className="w-full h-full object-cover"
                              />
                              <span className="absolute inset-0 bg-slate-900/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
                                <Eye className="w-4 h-4" />
                              </span>
                            </button>
                          ) : (
                            <div className="w-16 h-16 rounded-lg border border-dashed border-slate-300 bg-white flex items-center justify-center text-slate-400 shrink-0">
                              <CheckCircle2 className="w-5 h-5" />
                            </div>
                          )}
                          <div className="min-w-0">
                            <span className="font-bold text-slate-800 block">3. Selesai &amp; Biaya</span>
                            {ticket.status === 'selesai' ? (
                              <>
                                <span className="text-[11px] font-bold text-emerald-700 font-mono tabular-nums block">
                                  {formatRupiah(ticket.biaya_perbaikan)}
                                </span>
                                <span className="text-[11px] text-slate-600 line-clamp-1">
                                  {ticket.catatan_selesai || formatTanggalPendek(ticket.tgl_selesai)}
                                </span>
                              </>
                            ) : (
                              <span className="text-[11px] text-slate-500 block">
                                Belum ditandai selesai
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 2: INVENTARIS PONDOK PER RUANGAN                      */}
        {/* ========================================================= */}
        {activeTab === 'inventaris' && (
          <div className="space-y-4">
            {/* FILTER & PRINT TOOLBAR */}
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-3 text-xs">
              <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                <div className="md:col-span-4 relative">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={invSearch}
                    onChange={(e) => setInvSearch(e.target.value)}
                    placeholder="Cari kode aset, nama barang, ruangan..."
                    className="w-full pl-9 pr-3 py-2.5 border border-slate-300 rounded-xl bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div className="md:col-span-3">
                  <select
                    value={invRoomFilter}
                    onChange={(e) => setInvRoomFilter(e.target.value)}
                    className="w-full px-3 py-2.5 border border-slate-300 rounded-xl bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="semua">Semua Ruangan / Kamar</option>
                    {roomFilterOptions.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="md:col-span-3">
                  <select
                    value={invKategoriFilter}
                    onChange={(e) => setInvKategoriFilter(e.target.value)}
                    className="w-full px-3 py-2.5 border border-slate-300 rounded-xl bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="semua">Semua Kategori</option>
                    {SARPRAS_KATEGORI.map((k) => (
                      <option key={k} value={k}>
                        {k}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="md:col-span-2">
                  <select
                    value={invKondisiFilter}
                    onChange={(e) =>
                      setInvKondisiFilter(e.target.value as 'semua' | KondisiAsetSarpras)
                    }
                    className="w-full px-3 py-2.5 border border-slate-300 rounded-xl bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="semua">Semua Kondisi</option>
                    <option value="baik">Baik</option>
                    <option value="rusak_ringan">Rusak Ringan</option>
                    <option value="rusak_berat">Rusak Berat</option>
                  </select>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100">
                <span className="text-slate-500 tabular-nums">
                  Menampilkan <strong className="text-slate-800">{filteredInventaris.length}</strong> baris aset di{' '}
                  <strong className="text-slate-800">{kirGroupedByRoom.length}</strong> ruangan
                </span>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={filteredInventaris.length === 0}
                    onClick={() => setPrintPreviewMode('kir')}
                    className="min-h-[38px] px-3 py-1.5 bg-white hover:bg-slate-50 disabled:opacity-50 border border-slate-300 text-slate-700 font-semibold rounded-xl inline-flex items-center gap-1.5"
                  >
                    <Printer className="w-3.5 h-3.5 text-emerald-700" />
                    Cetak KIR Ruangan
                  </button>

                  <button
                    type="button"
                    disabled={filteredInventaris.length === 0}
                    onClick={() => setPrintPreviewMode('labels')}
                    className="min-h-[38px] px-3 py-1.5 bg-white hover:bg-slate-50 disabled:opacity-50 border border-slate-300 text-slate-700 font-semibold rounded-xl inline-flex items-center gap-1.5"
                  >
                    <Tag className="w-3.5 h-3.5 text-amber-600" />
                    Cetak Label Aset
                  </button>

                  <button
                    type="button"
                    disabled={filteredInventaris.length === 0}
                    onClick={handleExportInventarisExcel}
                    className="min-h-[38px] px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 disabled:opacity-50 border border-emerald-200 text-emerald-800 font-semibold rounded-xl inline-flex items-center gap-1.5"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5" />
                    Export Excel
                  </button>
                </div>
              </div>
            </div>

            {/* LIST INVENTARIS */}
            {loading ? (
              <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center text-xs text-slate-500">
                Memuat buku induk inventaris pondok...
              </div>
            ) : filteredInventaris.length === 0 ? (
              <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 mx-auto flex items-center justify-center">
                  <Package className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    Belum Ada Data Inventaris
                  </h3>
                  <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                    Catat aset per ruangan (kipas angin, kasur, lemari, sound masjid, dispenser, dll.) agar mudah dicek kondisinya dan dicetak Kartu Inventaris Ruangan (KIR).
                  </p>
                </div>
                {canEditSarpras && (
                  <button
                    type="button"
                    onClick={openAddInvModal}
                    className="min-h-[40px] px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl inline-flex items-center gap-1.5"
                  >
                    <Plus className="w-4 h-4" />
                    Tambah Inventaris Pertama
                  </button>
                )}
              </div>
            ) : (
              <>
                {/* DESKTOP TABLE */}
                <div className="hidden md:block bg-white rounded-2xl border border-slate-200 shadow-sm overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase text-[11px]">
                        <th className="py-3 px-4">No</th>
                        <th className="py-3 px-4">Kode Aset</th>
                        <th className="py-3 px-4">Nama Barang &amp; Kategori</th>
                        <th className="py-3 px-4">Ruangan</th>
                        <th className="py-3 px-4 text-right">Jumlah</th>
                        <th className="py-3 px-4">Kondisi</th>
                        <th className="py-3 px-4 text-right">Nilai &amp; Perolehan</th>
                        <th className="py-3 px-4 text-right">Aksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredInventaris.map((item, idx) => (
                        <tr key={item.id} className="hover:bg-slate-50/70">
                          <td className="py-3 px-4 text-slate-400 tabular-nums">{idx + 1}</td>
                          <td className="py-3 px-4 font-mono font-bold text-slate-800 whitespace-nowrap">
                            {item.kode_aset}
                          </td>
                          <td className="py-3 px-4">
                            <span className="font-bold text-slate-900 block">
                              {item.nama_barang}
                            </span>
                            <span className="text-[11px] text-slate-500">
                              {item.kategori}
                              {item.catatan ? ` · ${item.catatan}` : ''}
                            </span>
                          </td>
                          <td className="py-3 px-4 font-semibold text-slate-700">
                            {item.ruangan}
                          </td>
                          <td className="py-3 px-4 text-right font-mono tabular-nums font-bold text-slate-800 whitespace-nowrap">
                            {item.jumlah} {item.satuan}
                          </td>
                          <td className="py-3 px-4">
                            <select
                              value={item.kondisi}
                              disabled={!canEditSarpras}
                              onChange={(e) =>
                                void handleQuickKondisiChange(
                                  item,
                                  e.target.value as KondisiAsetSarpras
                                )
                              }
                              aria-label={`Ubah kondisi ${item.nama_barang}`}
                              className={`px-2 py-1 rounded-lg border text-[11px] font-bold focus:outline-none ${KONDISI_META[item.kondisi].badge} ${canEditSarpras ? 'cursor-pointer' : 'opacity-80 cursor-not-allowed'}`}
                            >
                              <option value="baik">Baik</option>
                              <option value="rusak_ringan">Rusak Ringan</option>
                              <option value="rusak_berat">Rusak Berat</option>
                            </select>
                          </td>
                          <td className="py-3 px-4 text-right tabular-nums whitespace-nowrap">
                            <span className="font-bold text-slate-800 block">
                              {item.nilai_satuan > 0
                                ? formatRupiah(item.nilai_satuan * item.jumlah)
                                : '-'}
                            </span>
                            <span className="text-[11px] text-slate-500">
                              {item.tahun_perolehan || '-'} &middot; {item.sumber_dana || '-'}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right whitespace-nowrap">
                            {canEditSarpras ? (
                              <div className="inline-flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => openEditInvModal(item)}
                                  className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-lg inline-flex items-center gap-1"
                                >
                                  <Edit3 className="w-3.5 h-3.5" /> Edit
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setDeleteConfirm({
                                      kind: 'inventaris',
                                      id: item.id,
                                      label: `${item.kode_aset} (${item.nama_barang})`,
                                    })
                                  }
                                  aria-label={`Hapus ${item.nama_barang}`}
                                  className="p-1.5 bg-white hover:bg-rose-50 border border-slate-200 hover:border-rose-300 text-rose-600 rounded-lg"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ) : (
                              <span className="text-[11px] text-slate-400">Hanya Lihat</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* MOBILE PWA CARDS */}
                <div className="md:hidden space-y-3">
                  {filteredInventaris.map((item) => (
                    <div
                      key={item.id}
                      className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm space-y-3 text-xs"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <span className="font-mono text-[11px] font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-800 border border-slate-200 inline-block">
                            {item.kode_aset}
                          </span>
                          <h3 className="font-bold text-sm text-slate-900 mt-1">
                            {item.nama_barang}
                          </h3>
                          <p className="text-[11px] text-slate-500">
                            {item.ruangan} &middot; {item.kategori}
                          </p>
                        </div>
                        <span
                          className={`px-2 py-0.5 rounded-md border text-[11px] font-bold shrink-0 ${KONDISI_META[item.kondisi].badge}`}
                        >
                          {KONDISI_META[item.kondisi].label}
                        </span>
                      </div>

                      <div className="flex items-center justify-between text-[11px] text-slate-600 bg-slate-50 px-3 py-2 rounded-xl border border-slate-200 tabular-nums">
                        <span>
                          Jumlah: <strong className="text-slate-900">{item.jumlah} {item.satuan}</strong>
                        </span>
                        <span>
                          Thn {item.tahun_perolehan || '-'} &middot;{' '}
                          <strong className="text-slate-900">
                            {item.nilai_satuan > 0
                              ? formatRupiah(item.nilai_satuan * item.jumlah)
                              : 'Rp 0'}
                          </strong>
                        </span>
                      </div>

                      {canEditSarpras && (
                        <div className="flex items-center gap-2 pt-1">
                          <select
                            value={item.kondisi}
                            onChange={(e) =>
                              void handleQuickKondisiChange(
                                item,
                                e.target.value as KondisiAsetSarpras
                              )
                            }
                            className="flex-1 min-h-[40px] px-2.5 py-1.5 border border-slate-300 rounded-xl bg-white text-slate-800 font-semibold text-xs"
                          >
                            <option value="baik">Kondisi: Baik</option>
                            <option value="rusak_ringan">Kondisi: Rusak Ringan</option>
                            <option value="rusak_berat">Kondisi: Rusak Berat</option>
                          </select>
                          <button
                            type="button"
                            onClick={() => openEditInvModal(item)}
                            className="min-h-[40px] px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold rounded-xl inline-flex items-center gap-1"
                          >
                            <Edit3 className="w-3.5 h-3.5" /> Edit
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setDeleteConfirm({
                                kind: 'inventaris',
                                id: item.id,
                                label: `${item.kode_aset} (${item.nama_barang})`,
                              })
                            }
                            aria-label={`Hapus ${item.nama_barang}`}
                            className="min-h-[40px] min-w-[40px] bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-xl inline-flex items-center justify-center"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 3: REKAP BIAYA & PEMELIHARAAN ARSIP                   */}
        {/* ========================================================= */}
        {activeTab === 'rekap' && (
          <div className="space-y-6">
            {/* PEMELIHARAAN ARSIP FOTO LAMA */}
            {canEditSarpras && (
              <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm flex flex-col lg:flex-row lg:items-center justify-between gap-4 text-xs">
                <div className="space-y-1">
                  <h2 className="text-sm sm:text-base font-bold text-slate-900">
                    Pemeliharaan Arsip Foto Laporan Selesai
                  </h2>
                  <p className="text-slate-500">
                    Bersihkan file foto dari laporan perbaikan yang sudah selesai lama agar penyimpanan tetap ringan. Catatan kerusakan, tanggal, petugas, dan biaya perbaikan tetap tersimpan utuh.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <select
                    value={cleanupAgeMonths}
                    onChange={(e) => setCleanupAgeMonths(Number(e.target.value))}
                    className="min-h-[40px] px-3 py-2 border border-slate-300 rounded-xl bg-white text-slate-800 font-semibold"
                  >
                    <option value={6}>Selesai &gt; 6 Bulan Lalu</option>
                    <option value={3}>Selesai &gt; 3 Bulan Lalu</option>
                    <option value={0}>Semua Laporan Selesai</option>
                  </select>
                  <button
                    type="button"
                    disabled={cleanupCandidates.length === 0 || saving}
                    onClick={() => setCleanupConfirmOpen(true)}
                    className="min-h-[40px] px-4 py-2 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white font-bold rounded-xl whitespace-nowrap"
                  >
                    Bersihkan Foto ({cleanupCandidates.length} tiket)
                  </button>
                </div>
              </div>
            )}

            {/* PANEL REKAP BIAYA PERBAIKAN (TERISOLASI DI SARPRAS) */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                    <Wallet className="w-4 h-4 text-emerald-600" />
                    Rekap Biaya Perbaikan Sarpras (Khusus Internal Sarpras)
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Pencatatan biaya perbaikan &amp; pembelian bahan hanya tercatat di modul Sarpras dan tidak memotong saldo Keuangan Syahriyah pusat.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <select
                    value={rekapMonthFilter}
                    onChange={(e) => setRekapMonthFilter(e.target.value)}
                    className="min-h-[38px] px-3 py-1.5 border border-slate-300 rounded-xl bg-white text-slate-800 font-semibold"
                  >
                    <option value="semua">Semua Bulan</option>
                    {rekapMonthOptions.map((m) => (
                      <option key={m} value={m}>
                        Periode {m}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    disabled={rekapBiayaRows.length === 0}
                    onClick={handleExportBiayaExcel}
                    className="min-h-[38px] px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 disabled:opacity-50 border border-emerald-200 text-emerald-800 font-semibold rounded-xl inline-flex items-center gap-1.5"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5" />
                    Export Excel Biaya
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50">
                  <span className="text-slate-600 font-semibold block">
                    Total Biaya ({rekapMonthFilter === 'semua' ? 'Semua Waktu' : rekapMonthFilter})
                  </span>
                  <strong className="text-lg font-bold text-slate-900 font-mono tabular-nums mt-1 block">
                    {formatRupiah(rekapTotalBiayaFiltered)}
                  </strong>
                </div>
                <div className="p-3.5 rounded-xl border border-emerald-200 bg-emerald-50/70">
                  <span className="text-emerald-800 font-semibold block">Total Tiket Selesai</span>
                  <strong className="text-lg font-bold text-emerald-950 tabular-nums mt-1 block">
                    {rekapBiayaRows.length} perbaikan
                  </strong>
                </div>
                <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50">
                  <span className="text-slate-600 font-semibold block">Total Nilai Aset Inventaris</span>
                  <strong className="text-lg font-bold text-slate-900 font-mono tabular-nums mt-1 block">
                    {formatRupiah(kpiStats.totalNilaiAset)}
                  </strong>
                </div>
              </div>

              {rekapBiayaRows.length === 0 ? (
                <p className="text-xs text-slate-500 py-6 text-center border border-dashed border-slate-200 rounded-xl">
                  Belum ada catatan perbaikan selesai pada periode ini.
                </p>
              ) : (
                <div className="overflow-x-auto border border-slate-200 rounded-xl">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase text-[11px]">
                        <th className="py-2.5 px-3.5">Tiket &amp; Tgl</th>
                        <th className="py-2.5 px-3.5">Ruangan &amp; Kerusakan</th>
                        <th className="py-2.5 px-3.5">Petugas &amp; Catatan</th>
                        <th className="py-2.5 px-3.5 text-right">Biaya Perbaikan</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {rekapBiayaRows.map((r) => (
                        <tr key={r.id}>
                          <td className="py-2.5 px-3.5 whitespace-nowrap">
                            <span className="font-mono font-bold text-slate-800 block">
                              {r.kode_tiket}
                            </span>
                            <span className="text-[11px] text-slate-500 tabular-nums">
                              {formatTanggalPendek(r.tgl_selesai || r.tanggal_lapor)}
                            </span>
                          </td>
                          <td className="py-2.5 px-3.5">
                            <span className="font-bold text-slate-900 block">
                              {r.judul_kerusakan}
                            </span>
                            <span className="text-[11px] text-slate-500">{r.ruangan}</span>
                          </td>
                          <td className="py-2.5 px-3.5">
                            <span className="font-semibold text-slate-700 block">
                              {r.petugas_sarpras || '-'}
                            </span>
                            <span className="text-[11px] text-slate-500">
                              {r.catatan_selesai || '-'}
                            </span>
                          </td>
                          <td className="py-2.5 px-3.5 text-right font-mono font-bold text-slate-900 tabular-nums whitespace-nowrap">
                            {formatRupiah(r.biaya_perbaikan)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* MODAL: EKSEKUSI TIKET (PROSES / SELESAI + FOTO ~60 KB)    */}
        {/* ========================================================= */}
        {execModal && (
          <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-[2px] flex items-end sm:items-center justify-center p-0 sm:p-4 overflow-y-auto">
            <div className="bg-white w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl border border-slate-200 shadow-xl max-h-[92vh] flex flex-col overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/70">
                <div className="min-w-0">
                  <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                    {execModal.mode === 'proses' ? (
                      <Wrench className="w-4 h-4 text-amber-600" />
                    ) : (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    )}
                    {execModal.mode === 'proses'
                      ? 'Proses Pengerjaan Sarpras'
                      : 'Tandai Perbaikan Selesai'}
                  </h2>
                  <p className="text-[11px] text-slate-500 mt-0.5 truncate">
                    {execModal.ticket.kode_tiket} &middot; {execModal.ticket.ruangan} &middot;{' '}
                    {execModal.ticket.judul_kerusakan}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setExecModal(null)}
                  className="min-h-[36px] min-w-[36px] rounded-lg border border-slate-200 bg-white text-slate-600 flex items-center justify-center"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleExecSubmit} className="p-5 space-y-4 overflow-y-auto text-xs">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Nama Petugas / Teknisi Sarpras <span className="text-rose-600">*</span>
                  </label>
                  <input
                    type="text"
                    value={execPetugas}
                    onChange={(e) => setExecPetugas(e.target.value)}
                    placeholder="Contoh: Ust. Ahmad / Tim Sarpras"
                    className="w-full px-3 py-2.5 border border-slate-300 rounded-xl bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    required
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    {execModal.mode === 'proses'
                      ? 'Catatan Progress Pengerjaan'
                      : 'Catatan Hasil Perbaikan'}
                  </label>
                  <textarea
                    rows={2}
                    value={execCatatan}
                    onChange={(e) => setExecCatatan(e.target.value)}
                    placeholder={
                      execModal.mode === 'proses'
                        ? 'Contoh: Sedang bongkar pipa bocor dan beli lem/keran baru...'
                        : 'Contoh: Keran sudah diganti baru dan aliran air normal kembali...'
                    }
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                {execModal.mode === 'selesai' && (
                  <>
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">
                        Biaya Perbaikan / Bahan (Rp) — Khusus Rekap Sarpras
                      </label>
                      <input
                        type="number"
                        min={0}
                        value={execBiaya}
                        onChange={(e) => setExecBiaya(e.target.value)}
                        placeholder="0"
                        className="w-full px-3 py-2.5 border border-slate-300 rounded-xl bg-white text-slate-900 font-mono tabular-nums focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                      <p className="text-[11px] text-slate-500 mt-1">
                        Isi 0 jika perbaikan tanpa belanja bahan. Tidak memotong saldo Keuangan pusat.
                      </p>
                    </div>

                    {execModal.ticket.inventaris_id &&
                      assetById.get(execModal.ticket.inventaris_id) && (
                        <label className="flex items-center gap-2 p-3 rounded-xl bg-emerald-50/70 border border-emerald-200 text-emerald-900 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={execRestoreAsset}
                            onChange={(e) => setExecRestoreAsset(e.target.checked)}
                            className="rounded border-emerald-300 text-emerald-600 focus:ring-emerald-500"
                          />
                          <span>
                            Kembalikan kondisi aset{' '}
                            <strong>
                              {assetById.get(execModal.ticket.inventaris_id)?.kode_aset}
                            </strong>{' '}
                            di Inventaris menjadi <strong>Baik</strong>
                          </span>
                        </label>
                      )}
                  </>
                )}

                {/* Foto Bukti Proses / Selesai */}
                <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2.5">
                  <span className="font-bold text-slate-800 block">
                    {execModal.mode === 'proses'
                      ? 'Lampirkan Foto Proses Pengerjaan'
                      : 'Lampirkan Foto Hasil Selesai'}
                  </span>

                  <input
                    ref={execCameraRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={handleExecPhotoChange}
                    className="hidden"
                  />
                  <input
                    ref={execGalleryRef}
                    type="file"
                    accept="image/*"
                    onChange={handleExecPhotoChange}
                    className="hidden"
                  />

                  {!execPreviewUrl ? (
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        disabled={execCompressing}
                        onClick={() => execCameraRef.current?.click()}
                        className="min-h-[42px] px-3 py-2 bg-white hover:bg-emerald-50 border border-emerald-300 rounded-xl text-emerald-900 font-semibold flex items-center justify-center gap-1.5"
                      >
                        {execCompressing ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Camera className="w-4 h-4 text-emerald-600" />
                        )}
                        Kamera
                      </button>
                      <button
                        type="button"
                        disabled={execCompressing}
                        onClick={() => execGalleryRef.current?.click()}
                        className="min-h-[42px] px-3 py-2 bg-white hover:bg-slate-100 border border-slate-300 rounded-xl text-slate-800 font-semibold flex items-center justify-center gap-1.5"
                      >
                        <ImageIcon className="w-4 h-4 text-slate-600" />
                        Galeri
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3 bg-white p-2.5 rounded-xl border border-slate-200">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={execPreviewUrl}
                        alt="Pratinjau foto eksekusi"
                        referrerPolicy="no-referrer"
                        className="w-16 h-16 object-cover rounded-lg border border-slate-200 shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <span className="font-bold text-emerald-700 block">
                          Foto siap disimpan
                        </span>
                        <div className="flex gap-2 mt-1.5">
                          <button
                            type="button"
                            onClick={() => execCameraRef.current?.click()}
                            className="px-2 py-1 bg-slate-100 hover:bg-slate-200 rounded-lg text-[11px] font-semibold text-slate-700"
                          >
                            Ganti
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setExecFile(null);
                              setExecPreviewUrl('');
                            }}
                            className="px-2 py-1 bg-rose-50 hover:bg-rose-100 rounded-lg text-[11px] font-semibold text-rose-700"
                          >
                            Hapus
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="pt-2 border-t border-slate-200 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setExecModal(null)}
                    className="min-h-[42px] px-4 py-2 bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 font-semibold rounded-xl"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={saving || execCompressing}
                    className={`min-h-[42px] px-5 py-2 text-white font-bold rounded-xl shadow-sm flex items-center gap-2 disabled:opacity-60 ${
                      execModal.mode === 'proses'
                        ? 'bg-amber-600 hover:bg-amber-700'
                        : 'bg-emerald-600 hover:bg-emerald-700'
                    }`}
                  >
                    {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                    {execModal.mode === 'proses'
                      ? 'Simpan Status Diproses'
                      : 'Simpan Perbaikan Selesai'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* MODAL: TAMBAH / EDIT INVENTARIS PONDOK                    */}
        {/* ========================================================= */}
        {showInvModal && (
          <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-[2px] flex items-end sm:items-center justify-center p-0 sm:p-4 overflow-y-auto">
            <div className="bg-white w-full sm:max-w-xl rounded-t-2xl sm:rounded-2xl border border-slate-200 shadow-xl max-h-[92vh] flex flex-col overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/70">
                <div>
                  <h2 className="text-base font-bold text-slate-900">
                    {editingInv ? 'Edit Aset Inventaris' : 'Tambah Aset Inventaris Pondok'}
                  </h2>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Catat barang per ruangan lengkap dengan kode aset, kondisi, dan estimasi nilai.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowInvModal(false)}
                  className="min-h-[36px] min-w-[36px] rounded-lg border border-slate-200 bg-white text-slate-600 flex items-center justify-center"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleSaveInventaris} className="p-5 space-y-3.5 overflow-y-auto text-xs">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="font-semibold text-slate-700">
                        Ruangan / Kamar <span className="text-rose-600">*</span>
                      </label>
                      <button
                        type="button"
                        onClick={() =>
                          setInvRuanganMode((m) => (m === 'preset' ? 'custom' : 'preset'))
                        }
                        className="text-[11px] font-semibold text-emerald-700 hover:underline"
                      >
                        {invRuanganMode === 'preset' ? '+ Ketik Manual' : 'Pilih Daftar'}
                      </button>
                    </div>
                    {invRuanganMode === 'preset' ? (
                      <select
                        value={invRuanganPreset}
                        onChange={(e) => {
                          const nextRoom = e.target.value;
                          setInvRuanganPreset(nextRoom);
                          if (!editingInv) setInvKode(generateKodeAset(nextRoom, inventarisList));
                        }}
                        className="w-full px-3 py-2.5 border border-slate-300 rounded-xl bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      >
                        {roomFilterOptions.map((r) => (
                          <option key={r} value={r}>
                            {r}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type="text"
                        value={invRuanganCustom}
                        onChange={(e) => {
                          setInvRuanganCustom(e.target.value);
                          if (!editingInv && e.target.value.trim()) {
                            setInvKode(generateKodeAset(e.target.value, inventarisList));
                          }
                        }}
                        placeholder="Contoh: Ruang Tamu Gedung B"
                        className="w-full px-3 py-2.5 border border-slate-300 rounded-xl bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        required
                      />
                    )}
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      Kode Aset (Otomatis / Edit)
                    </label>
                    <input
                      type="text"
                      value={invKode}
                      onChange={(e) => setInvKode(e.target.value.toUpperCase())}
                      placeholder="INV-A1-001"
                      className="w-full px-3 py-2.5 border border-slate-300 rounded-xl bg-white text-slate-900 font-mono font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      Nama Barang / Aset <span className="text-rose-600">*</span>
                    </label>
                    <input
                      type="text"
                      value={invNama}
                      onChange={(e) => setInvNama(e.target.value)}
                      placeholder="Contoh: Kipas Angin Dinding Miyako"
                      className="w-full px-3 py-2.5 border border-slate-300 rounded-xl bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      required
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Kategori</label>
                    <select
                      value={invKategori}
                      onChange={(e) => setInvKategori(e.target.value)}
                      className="w-full px-3 py-2.5 border border-slate-300 rounded-xl bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    >
                      {SARPRAS_KATEGORI.map((k) => (
                        <option key={k} value={k}>
                          {k}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Jumlah</label>
                    <input
                      type="number"
                      min={1}
                      value={invJumlah}
                      onChange={(e) => setInvJumlah(e.target.value)}
                      className="w-full px-3 py-2.5 border border-slate-300 rounded-xl bg-white text-slate-900 font-mono tabular-nums"
                      required
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Satuan</label>
                    <select
                      value={invSatuan}
                      onChange={(e) => setInvSatuan(e.target.value)}
                      className="w-full px-3 py-2.5 border border-slate-300 rounded-xl bg-white text-slate-900"
                    >
                      {SARPRAS_SATUAN_OPTIONS.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Kondisi</label>
                    <select
                      value={invKondisi}
                      onChange={(e) => setInvKondisi(e.target.value as KondisiAsetSarpras)}
                      className="w-full px-3 py-2.5 border border-slate-300 rounded-xl bg-white text-slate-900 font-semibold"
                    >
                      <option value="baik">Baik</option>
                      <option value="rusak_ringan">Rusak Ringan</option>
                      <option value="rusak_berat">Rusak Berat</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      Tahun Perolehan
                    </label>
                    <input
                      type="text"
                      value={invTahun}
                      onChange={(e) => setInvTahun(e.target.value)}
                      placeholder={todayStr ? todayStr.slice(0, 4) : 'Tahun'}
                      className="w-full px-3 py-2.5 border border-slate-300 rounded-xl bg-white text-slate-900 font-mono"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Sumber Dana</label>
                    <input
                      type="text"
                      value={invSumber}
                      onChange={(e) => setInvSumber(e.target.value)}
                      placeholder="Kas Pondok / Wakaf / Hibah"
                      className="w-full px-3 py-2.5 border border-slate-300 rounded-xl bg-white text-slate-900"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      Nilai Satuan (Rp)
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={invNilai}
                      onChange={(e) => setInvNilai(e.target.value)}
                      className="w-full px-3 py-2.5 border border-slate-300 rounded-xl bg-white text-slate-900 font-mono tabular-nums"
                    />
                  </div>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Catatan Aset</label>
                  <input
                    type="text"
                    value={invCatatan}
                    onChange={(e) => setInvCatatan(e.target.value)}
                    placeholder="Merk, ukuran, atau keterangan khusus aset..."
                    className="w-full px-3 py-2.5 border border-slate-300 rounded-xl bg-white text-slate-900"
                  />
                </div>

                <div className="pt-2 border-t border-slate-200 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowInvModal(false)}
                    className="min-h-[42px] px-4 py-2 bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 font-semibold rounded-xl"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="min-h-[42px] px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-sm inline-flex items-center gap-2"
                  >
                    {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                    {editingInv ? 'Simpan Perubahan' : 'Simpan Aset'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* MODAL: PRATINJAU CETAK KIR / LABEL ASET                   */}
        {/* ========================================================= */}
        {printPreviewMode !== 'none' && (
          <div className="fixed inset-0 z-50 bg-slate-900/65 backdrop-blur-[2px] flex items-center justify-center p-4 overflow-y-auto">
            <div className="bg-white w-full max-w-4xl rounded-2xl border border-slate-200 shadow-xl max-h-[90vh] flex flex-col overflow-hidden">
              <div className="px-5 py-3.5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2 bg-slate-50">
                <div>
                  <h3 className="font-bold text-sm text-slate-900">
                    {printPreviewMode === 'kir'
                      ? 'Pratinjau Cetak Kartu Inventaris Ruangan (KIR)'
                      : 'Pratinjau Cetak Stiker Label Aset Sarpras'}
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Siap cetak ke kertas A4 atau simpan sebagai PDF.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => window.print()}
                    className="min-h-[38px] px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl inline-flex items-center gap-1.5"
                  >
                    <Printer className="w-4 h-4" />
                    Cetak Sekarang
                  </button>
                  <button
                    type="button"
                    onClick={() => setPrintPreviewMode('none')}
                    className="min-h-[38px] px-3 py-1.5 bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 text-xs font-semibold rounded-xl"
                  >
                    Tutup
                  </button>
                </div>
              </div>

              <div className="p-6 overflow-y-auto bg-slate-100">
                <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-6">
                  {printPreviewMode === 'kir' ? (
                    kirGroupedByRoom.map(([roomName, items]) => (
                      <div key={roomName} className="space-y-2 pb-4 border-b border-slate-200 last:border-b-0">
                        <div className="flex items-center justify-between border-b-2 border-slate-800 pb-2">
                          <div>
                            <h4 className="font-bold text-sm text-slate-900 uppercase">
                              KARTU INVENTARIS RUANGAN (KIR) — {roomName}
                            </h4>
                            <p className="text-[11px] text-slate-600">
                              Pondok Pesantren An-Nur 1 Bululawang &middot; Sie Sarpras
                            </p>
                          </div>
                          <span className="text-[11px] font-mono text-slate-600">
                            Cetak: {formatTanggalPendek(todayStr)}
                          </span>
                        </div>
                        <table className="w-full text-left border-collapse text-xs">
                          <thead>
                            <tr className="bg-slate-100 border border-slate-300 text-slate-800">
                              <th className="py-1.5 px-2 border border-slate-300">No</th>
                              <th className="py-1.5 px-2 border border-slate-300">Kode Aset</th>
                              <th className="py-1.5 px-2 border border-slate-300">Nama Barang</th>
                              <th className="py-1.5 px-2 border border-slate-300 text-center">Jml</th>
                              <th className="py-1.5 px-2 border border-slate-300">Kondisi</th>
                              <th className="py-1.5 px-2 border border-slate-300">Thn / Ket</th>
                            </tr>
                          </thead>
                          <tbody>
                            {items.map((it, i) => (
                              <tr key={it.id}>
                                <td className="py-1.5 px-2 border border-slate-300 tabular-nums">{i + 1}</td>
                                <td className="py-1.5 px-2 border border-slate-300 font-mono font-bold">{it.kode_aset}</td>
                                <td className="py-1.5 px-2 border border-slate-300 font-semibold">{it.nama_barang}</td>
                                <td className="py-1.5 px-2 border border-slate-300 text-center tabular-nums">
                                  {it.jumlah} {it.satuan}
                                </td>
                                <td className="py-1.5 px-2 border border-slate-300">{KONDISI_META[it.kondisi].label}</td>
                                <td className="py-1.5 px-2 border border-slate-300 text-[11px]">
                                  {it.tahun_perolehan || '-'} {it.catatan ? `· ${it.catatan}` : ''}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ))
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      {filteredInventaris.map((it) => (
                        <div
                          key={it.id}
                          className="border-2 border-slate-800 rounded-lg p-3 text-xs space-y-1 bg-white"
                        >
                          <div className="flex items-center justify-between border-b border-slate-300 pb-1">
                            <span className="font-bold text-[10px] uppercase text-emerald-800">
                              SARPRAS AN-NUR 1
                            </span>
                            <span className="font-mono text-[10px] font-bold text-slate-600">
                              {it.tahun_perolehan || (todayStr ? todayStr.slice(0, 4) : '-')}
                            </span>
                          </div>
                          <div className="font-mono font-extrabold text-sm text-slate-900 tracking-wide">
                            {it.kode_aset}
                          </div>
                          <div className="font-bold text-slate-800 truncate">{it.nama_barang}</div>
                          <div className="text-[11px] text-slate-600 flex justify-between">
                            <span>{it.ruangan}</span>
                            <span className="tabular-nums">
                              {it.jumlah} {it.satuan}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* MODAL: LIGHTBOX PERBESAR FOTO                             */}
        {/* ========================================================= */}
        {lightboxPhoto && (
          <div
            className="fixed inset-0 z-[70] bg-slate-950/85 flex items-center justify-center p-4"
            onClick={() => setLightboxPhoto(null)}
          >
            <div
              className="bg-white rounded-2xl max-w-2xl w-full overflow-hidden shadow-2xl border border-slate-200"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="text-sm font-bold text-slate-900 truncate">
                    {lightboxPhoto.title}
                  </h3>
                  <p className="text-[11px] text-slate-500 truncate">{lightboxPhoto.subtitle}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setLightboxPhoto(null)}
                  className="min-h-[34px] min-w-[34px] rounded-lg border border-slate-200 bg-slate-50 text-slate-700 flex items-center justify-center shrink-0"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="bg-slate-900 flex items-center justify-center max-h-[75vh] overflow-hidden p-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={lightboxPhoto.url}
                  alt={lightboxPhoto.title}
                  referrerPolicy="no-referrer"
                  className="max-h-[72vh] w-auto object-contain rounded-lg"
                />
              </div>
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* MODAL: KONFIRMASI HAPUS                                   */}
        {/* ========================================================= */}
        {deleteConfirm && (
          <div className="fixed inset-0 z-[65] bg-slate-900/60 flex items-center justify-center p-4">
            <div className="bg-white w-full max-w-sm rounded-2xl border border-slate-200 shadow-xl p-5 space-y-4 text-xs">
              <div className="flex items-start gap-3">
                <div className="p-2 bg-rose-50 text-rose-600 rounded-xl shrink-0">
                  <Trash2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Konfirmasi Hapus</h3>
                  <p className="text-slate-600 mt-1">
                    Yakin ingin menghapus{' '}
                    <strong className="text-slate-900">{deleteConfirm.label}</strong>?{' '}
                    {deleteConfirm.kind === 'laporan'
                      ? 'File foto pada tiket ini juga akan dibersihkan.'
                      : 'Tindakan ini tidak dapat dibatalkan.'}
                  </p>
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setDeleteConfirm(null)}
                  className="min-h-[38px] px-4 py-2 bg-white border border-slate-300 text-slate-700 font-semibold rounded-xl"
                >
                  Batal
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void handleExecuteDelete()}
                  className="min-h-[38px] px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl"
                >
                  {saving ? 'Menghapus...' : 'Ya, Hapus'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* MODAL: KONFIRMASI BERSIHKAN FOTO LAMA                     */}
        {/* ========================================================= */}
        {cleanupConfirmOpen && (
          <div className="fixed inset-0 z-[65] bg-slate-900/60 flex items-center justify-center p-4">
            <div className="bg-white w-full max-w-md rounded-2xl border border-slate-200 shadow-xl p-5 space-y-4 text-xs">
              <div className="flex items-start gap-3">
                <div className="p-2 bg-amber-50 text-amber-600 rounded-xl shrink-0">
                  <Trash2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    Konfirmasi Bersihkan Foto Lama
                  </h3>
                  <p className="text-slate-600 mt-1">
                    Akan menghapus file foto dari{' '}
                    <strong>{cleanupCandidates.length} tiket selesai</strong>. Data teks laporan, ruangan, petugas, dan biaya perbaikan tetap tersimpan utuh.
                  </p>
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setCleanupConfirmOpen(false)}
                  className="min-h-[38px] px-4 py-2 bg-white border border-slate-300 text-slate-700 font-semibold rounded-xl"
                >
                  Batal
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void handleExecuteCleanupPhotos()}
                  className="min-h-[38px] px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl"
                >
                  {saving ? 'Membersihkan...' : 'Ya, Bersihkan Foto'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* MODAL: LAPOR CEPAT SARPRAS */}
        <SarprasQuickReportModal
          isOpen={showQuickReportModal}
          onClose={() => setShowQuickReportModal(false)}
          inventarisList={inventarisList}
          existingLaporan={laporanList}
          onSubmitted={(saved, meta) => {
            setLaporanList((prev) => [saved, ...prev]);
            if (meta.updatedInventaris) {
              setInventarisList((prev) =>
                prev.map((a) =>
                  a.id === meta.updatedInventaris?.id ? meta.updatedInventaris : a
                )
              );
            }
            setActiveTab('laporan');
            showToast(
              'success',
              'Laporan Kerusakan Terkirim',
              `Tiket ${saved.kode_tiket} (${saved.ruangan}) masuk antrean Sie Sarpras.`
            );
          }}
        />
      </div>

      {/* ========================================================= */}
      {/* AREA KHUSUS PRINT A4 (KIR RUANGAN / STIKER LABEL ASET)     */}
      {/* ========================================================= */}
      {printPreviewMode !== 'none' && (
        <div className="hidden print:block p-4 bg-white text-slate-900 space-y-6">
          {printPreviewMode === 'kir' ? (
            kirGroupedByRoom.map(([roomName, items]) => (
              <div key={roomName} className="break-inside-avoid space-y-2 pb-6">
                <div className="flex items-center justify-between border-b-2 border-slate-900 pb-1.5">
                  <div>
                    <h2 className="font-bold text-sm uppercase">
                      KARTU INVENTARIS RUANGAN (KIR) — {roomName}
                    </h2>
                    <p className="text-[11px]">
                      Pondok Pesantren An-Nur 1 Bululawang &middot; Sie Sarpras
                    </p>
                  </div>
                  <span className="text-[11px] font-mono">
                    Tanggal Cetak: {formatTanggalPendek(todayStr)}
                  </span>
                </div>
                <table className="w-full text-left border-collapse text-[11px]">
                  <thead>
                    <tr className="bg-slate-100">
                      <th className="py-1 px-2 border border-slate-400">No</th>
                      <th className="py-1 px-2 border border-slate-400">Kode Aset</th>
                      <th className="py-1 px-2 border border-slate-400">Nama Barang</th>
                      <th className="py-1 px-2 border border-slate-400 text-center">Jml</th>
                      <th className="py-1 px-2 border border-slate-400">Kondisi</th>
                      <th className="py-1 px-2 border border-slate-400">Keterangan</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((it, i) => (
                      <tr key={it.id}>
                        <td className="py-1 px-2 border border-slate-400 tabular-nums">{i + 1}</td>
                        <td className="py-1 px-2 border border-slate-400 font-mono font-bold">{it.kode_aset}</td>
                        <td className="py-1 px-2 border border-slate-400 font-semibold">{it.nama_barang}</td>
                        <td className="py-1 px-2 border border-slate-400 text-center tabular-nums">
                          {it.jumlah} {it.satuan}
                        </td>
                        <td className="py-1 px-2 border border-slate-400">{KONDISI_META[it.kondisi].label}</td>
                        <td className="py-1 px-2 border border-slate-400">
                          {it.tahun_perolehan || '-'} {it.catatan ? `· ${it.catatan}` : ''}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))
          ) : (
            <div className="grid grid-cols-3 gap-3">
              {filteredInventaris.map((it) => (
                <div
                  key={it.id}
                  className="break-inside-avoid border-2 border-slate-900 rounded p-2.5 text-[11px] space-y-1"
                >
                  <div className="flex items-center justify-between border-b border-slate-400 pb-0.5 font-bold">
                    <span>SARPRAS AN-NUR 1</span>
                    <span className="font-mono">{it.tahun_perolehan || (todayStr ? todayStr.slice(0, 4) : '-')}</span>
                  </div>
                  <div className="font-mono font-extrabold text-xs">{it.kode_aset}</div>
                  <div className="font-bold truncate">{it.nama_barang}</div>
                  <div className="flex justify-between text-[10px]">
                    <span>{it.ruangan}</span>
                    <span>
                      {it.jumlah} {it.satuan}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
}
