'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import {
  Archive,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Calendar,
  CalendarPlus,
  Camera,
  CheckCircle2,
  ClipboardCopy,
  Clock,
  Copy,
  Edit3,
  FileSpreadsheet,
  FileText,
  Image as ImageIcon,
  Layers,
  ListChecks,
  Loader2,
  MapPin,
  Plus,
  Printer,
  RefreshCw,
  Save,
  Search,
  Sparkles,
  Trash2,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import { useAuth, TransparencyBanner } from '@/lib/auth';
import KegiatanAgendaModal from '@/components/KegiatanAgendaModal';
import KegiatanFormatModal from '@/components/KegiatanFormatModal';
import {
  type KategoriKegiatan,
  type KegiatanAgendaItem,
  type KegiatanFormatTemplate,
  type KegiatanPanitiaItem,
  type KegiatanPengisiSlot,
  type KegiatanRundownItem,
  type PersonelOption,
  type StatusKegiatan,
  type StatusSlotPengisi,
  MAX_DOKUMENTASI_FOTO,
  addDaysIso,
  buildKegiatanWaText,
  countPengisiProgress,
  createKegiatanId,
  deleteKegiatanAgendaRow,
  deleteKegiatanFormatRow,
  fetchKegiatanAgenda,
  fetchKegiatanFormats,
  fetchPersonelOptions,
  formatHariTanggalIndo,
  formatTanggalPendek,
  generateKodeKegiatan,
  getLocalTodayStr,
  instantiatePanitiaPreset,
  removeKegiatanStoragePhotos,
  saveKegiatanAgendaRow,
  saveKegiatanFormatRow,
  uploadKegiatanPhoto,
} from '@/lib/kegiatan';

type MainTab = 'agenda' | 'format' | 'arsip';
type DetailTab = 'pengisi' | 'rundown' | 'panitia' | 'dokumentasi';

interface ToastState {
  id: number;
  type: 'success' | 'error' | 'info';
  title: string;
  message: string;
}

const STATUS_KEGIATAN_META: Record<StatusKegiatan, { label: string; badge: string }> = {
  terjadwal: {
    label: 'Terjadwal',
    badge: 'bg-sky-50 text-sky-800 border-sky-200',
  },
  berlangsung: {
    label: 'Berlangsung',
    badge: 'bg-amber-50 text-amber-800 border-amber-200',
  },
  selesai: {
    label: 'Selesai',
    badge: 'siap-soft-box border',
  },
  ditunda: {
    label: 'Ditunda',
    badge: 'bg-rose-50 text-rose-700 border-rose-200',
  },
};

const SLOT_STATUS_META: Record<StatusSlotPengisi, { label: string; cls: string }> = {
  belum: {
    label: 'Belum',
    cls: 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200',
  },
  siap: {
    label: 'Siap',
    cls: 'siap-soft-box border hover:opacity-90',
  },
  selesai: {
    label: 'Selesai',
    cls: 'bg-sky-50 text-sky-700 border-sky-200 hover:bg-sky-100',
  },
};

export default function KegiatanPage() {
  const { canEditModule } = useAuth();
  const canEdit = canEditModule('kegiatan');

  const [mainTab, setMainTab] = useState<MainTab>('agenda');
  const [detailTab, setDetailTab] = useState<DetailTab>('pengisi');
  const [todayStr, setTodayStr] = useState<string>('');
  const [archiveMonth, setArchiveMonth] = useState<string>('');

  const [loading, setLoading] = useState<boolean>(true);
  const [savingDetail, setSavingDetail] = useState<boolean>(false);
  const [uploadingPhoto, setUploadingPhoto] = useState<boolean>(false);
  const [toasts, setToasts] = useState<ToastState[]>([]);

  const [formats, setFormats] = useState<KegiatanFormatTemplate[]>([]);
  const [agendas, setAgendas] = useState<KegiatanAgendaItem[]>([]);
  const [personelOptions, setPersonelOptions] = useState<PersonelOption[]>([]);

  // Filters
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [kategoriFilter, setKategoriFilter] = useState<'semua' | KategoriKegiatan>('semua');
  const [statusFilter, setStatusFilter] = useState<'semua' | StatusKegiatan>('semua');

  // Selected agenda & draft detail state
  const [selectedAgendaId, setSelectedAgendaId] = useState<string | null>(null);
  const [mobileShowDetail, setMobileShowDetail] = useState<boolean>(false);
  const [draftPengisi, setDraftPengisi] = useState<KegiatanPengisiSlot[]>([]);
  const [draftRundown, setDraftRundown] = useState<KegiatanRundownItem[]>([]);
  const [draftPanitia, setDraftPanitia] = useState<KegiatanPanitiaItem[]>([]);
  const [draftNotulensi, setDraftNotulensi] = useState<string>('');
  const [draftDirty, setDraftDirty] = useState<boolean>(false);

  // Modals
  const [agendaModal, setAgendaModal] = useState<{
    open: boolean;
    editing: KegiatanAgendaItem | null;
    presetFormatId?: string;
  }>({ open: false, editing: null });

  const [formatModal, setFormatModal] = useState<{
    open: boolean;
    editing: KegiatanFormatTemplate | null;
  }>({ open: false, editing: null });

  const [duplicateModal, setDuplicateModal] = useState<{
    item: KegiatanAgendaItem;
    targetDate: string;
    clearPengisi: boolean;
  } | null>(null);

  const [deleteConfirm, setDeleteConfirm] = useState<{
    kind: 'agenda' | 'format';
    id: string;
    label: string;
    itemAgenda?: KegiatanAgendaItem;
  } | null>(null);

  const [lightboxUrl, setLightboxUrl] = useState<{ url: string; title: string } | null>(null);
  const [printTarget, setPrintTarget] = useState<KegiatanAgendaItem | null>(null);

  const pushToast = useCallback(
    (type: ToastState['type'], title: string, message: string) => {
      const id = Date.now() + Math.floor(Math.random() * 1000);
      setToasts((prev) => [...prev, { id, type, title, message }]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 4500);
    },
    []
  );

  const loadAllData = useCallback(async () => {
    const [fmtList, agdList, persList] = await Promise.all([
      fetchKegiatanFormats(),
      fetchKegiatanAgenda(),
      fetchPersonelOptions(),
    ]);
    return { fmtList, agdList, persList };
  }, []);

  useEffect(() => {
    let active = true;
    Promise.resolve()
      .then(async () => {
        const today = getLocalTodayStr();
        const data = await loadAllData();
        if (!active) return;
        setTodayStr(today);
        setArchiveMonth(today.slice(0, 7));
        setFormats(data.fmtList);
        setAgendas(data.agdList);
        setPersonelOptions(data.persList);
        if (data.agdList.length > 0) {
          const sortedInitial = [...data.agdList].sort((a, b) =>
            (a.tanggal || '').localeCompare(b.tanggal || '')
          );
          const upcoming =
            sortedInitial.find((x) => x.tanggal >= today && x.status !== 'selesai') ||
            sortedInitial[0];
          setSelectedAgendaId(upcoming.id);
        }
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
      setFormats(data.fmtList);
      setAgendas(data.agdList);
      setPersonelOptions(data.persList);
      pushToast('info', 'Data Diperbarui', 'Daftar jadwal dan format kegiatan berhasil dimuat ulang.');
    } catch {
      pushToast('error', 'Gagal Memuat', 'Terjadi kendala saat memperbarui data kegiatan.');
    } finally {
      setLoading(false);
    }
  };

  const selectedAgenda = useMemo(
    () => agendas.find((a) => a.id === selectedAgendaId) || null,
    [agendas, selectedAgendaId]
  );

  // Sync draft state whenever selectedAgenda changes
  useEffect(() => {
    let active = true;
    Promise.resolve().then(() => {
      if (!active) return;
      if (!selectedAgenda) {
        setDraftPengisi([]);
        setDraftRundown([]);
        setDraftPanitia([]);
        setDraftNotulensi('');
        setDraftDirty(false);
        return;
      }
      setDraftPengisi(
        [...(selectedAgenda.pengisi_list || [])].sort((a, b) => a.urutan - b.urutan)
      );
      setDraftRundown([...(selectedAgenda.rundown_list || [])]);
      setDraftPanitia(
        selectedAgenda.kategori === 'event_besar'
          ? selectedAgenda.panitia_list && selectedAgenda.panitia_list.length > 0
            ? [...selectedAgenda.panitia_list]
            : instantiatePanitiaPreset()
          : [...(selectedAgenda.panitia_list || [])]
      );
      setDraftNotulensi(selectedAgenda.notulensi || '');
      setDraftDirty(false);
      if (selectedAgenda.kategori !== 'event_besar' && detailTab === 'panitia') {
        setDetailTab('pengisi');
      }
    });
    return () => {
      active = false;
    };
  }, [selectedAgenda, detailTab]);

  // Filtered agendas for Tab 1
  const filteredAgendas = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return agendas
      .filter((item) => {
        if (kategoriFilter !== 'semua' && item.kategori !== kategoriFilter) return false;
        if (statusFilter !== 'semua' && item.status !== statusFilter) return false;
        if (q) {
          const hitTitle = item.judul.toLowerCase().includes(q);
          const hitLok = item.lokasi.toLowerCase().includes(q);
          const hitPj = item.penanggung_jawab.toLowerCase().includes(q);
          const hitPengisi = item.pengisi_list.some((s) =>
            s.petugas_nama.toLowerCase().includes(q)
          );
          if (!hitTitle && !hitLok && !hitPj && !hitPengisi) return false;
        }
        return true;
      })
      .sort((a, b) => {
        const aDone = a.status === 'selesai' ? 1 : 0;
        const bDone = b.status === 'selesai' ? 1 : 0;
        if (aDone !== bDone) return aDone - bDone;
        if (a.tanggal !== b.tanggal) return (a.tanggal || '').localeCompare(b.tanggal || '');
        return (a.jam_mulai || '').localeCompare(b.jam_mulai || '');
      });
  }, [agendas, searchQuery, kategoriFilter, statusFilter]);

  // Summary metrics
  const summaryStats = useMemo(() => {
    let terjadwal = 0;
    let eventBesarAktif = 0;
    let totalSlotAktif = 0;
    let totalSlotTerisi = 0;
    let selesaiCount = 0;
    let totalFoto = 0;

    for (const a of agendas) {
      totalFoto += (a.dokumentasi_urls || []).length;
      if (a.status === 'selesai') {
        selesaiCount += 1;
      } else if (a.status !== 'ditunda') {
        terjadwal += 1;
        if (a.kategori === 'event_besar') eventBesarAktif += 1;
        const prog = countPengisiProgress(a.pengisi_list);
        totalSlotAktif += prog.total;
        totalSlotTerisi += prog.terisi;
      }
    }

    const persenSiap =
      totalSlotAktif > 0 ? Math.round((totalSlotTerisi / totalSlotAktif) * 100) : 0;

    return {
      terjadwal,
      eventBesarAktif,
      totalSlotAktif,
      totalSlotTerisi,
      persenSiap,
      selesaiCount,
      totalFoto,
    };
  }, [agendas]);

  // Archive list for Tab 3
  const archiveAgendas = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return agendas
      .filter((a) => {
        if (a.status !== 'selesai' && (a.dokumentasi_urls || []).length === 0) return false;
        if (archiveMonth && !(a.tanggal || '').startsWith(archiveMonth)) return false;
        if (q) {
          const hitTitle = a.judul.toLowerCase().includes(q);
          const hitNotes = (a.notulensi || '').toLowerCase().includes(q);
          if (!hitTitle && !hitNotes) return false;
        }
        return true;
      })
      .sort((a, b) => (b.tanggal || '').localeCompare(a.tanggal || ''));
  }, [agendas, archiveMonth, searchQuery]);

  // Save Agenda (create or edit metadata)
  const handleSaveAgenda = async (payload: KegiatanAgendaItem, isEdit: boolean) => {
    if (!canEdit) return;
    const saved = await saveKegiatanAgendaRow(payload, isEdit);
    setAgendas((prev) =>
      isEdit ? prev.map((a) => (a.id === saved.id ? saved : a)) : [saved, ...prev]
    );
    setSelectedAgendaId(saved.id);
    setMobileShowDetail(true);
    pushToast(
      'success',
      isEdit ? 'Kegiatan Diperbarui' : 'Kegiatan Dijadwalkan',
      `${saved.judul} (${formatTanggalPendek(saved.tanggal)}) berhasil disimpan.`
    );
  };

  // Save Detail Edits (Pengisi, Rundown, Panitia, Notulensi)
  const handleSaveDetailDraft = async (override?: Partial<KegiatanAgendaItem>) => {
    if (!selectedAgenda || !canEdit) return;
    setSavingDetail(true);
    try {
      const reindexedPengisi = draftPengisi.map((s, idx) => ({
        ...s,
        urutan: idx + 1,
      }));
      const updated: KegiatanAgendaItem = {
        ...selectedAgenda,
        pengisi_list: reindexedPengisi,
        rundown_list: draftRundown,
        panitia_list: draftPanitia,
        notulensi: draftNotulensi,
        ...override,
        updated_at: new Date().toISOString(),
      };
      const saved = await saveKegiatanAgendaRow(updated, true);
      setAgendas((prev) => prev.map((a) => (a.id === saved.id ? saved : a)));
      setDraftDirty(false);
      pushToast('success', 'Perubahan Disimpan', `Detail ${saved.judul} berhasil diperbarui.`);
    } catch {
      pushToast('error', 'Gagal Menyimpan', 'Tidak dapat menyimpan perubahan detail kegiatan.');
    } finally {
      setSavingDetail(false);
    }
  };

  const handleQuickStatusChange = async (newStatus: StatusKegiatan) => {
    if (!selectedAgenda || !canEdit) return;
    await handleSaveDetailDraft({ status: newStatus });
  };

  // Pengisi Slot Actions
  const handleAddPengisiSlot = () => {
    if (!canEdit) return;
    setDraftPengisi((prev) => [
      ...prev,
      {
        id: createKegiatanId('pgs'),
        urutan: prev.length + 1,
        peran: `Pengisi ${prev.length + 1}`,
        petugas_nama: '',
        status: 'belum',
        catatan: '',
      },
    ]);
    setDraftDirty(true);
  };

  const handleUpdatePengisi = (id: string, patch: Partial<KegiatanPengisiSlot>) => {
    if (!canEdit) return;
    setDraftPengisi((prev) =>
      prev.map((s) => {
        if (s.id !== id) return s;
        const next = { ...s, ...patch };
        if (
          patch.petugas_nama !== undefined &&
          patch.petugas_nama.trim().length > 0 &&
          s.status === 'belum' &&
          patch.status === undefined
        ) {
          next.status = 'siap';
        }
        return next;
      })
    );
    setDraftDirty(true);
  };

  const handleCycleSlotStatus = (id: string) => {
    if (!canEdit) return;
    setDraftPengisi((prev) =>
      prev.map((s) => {
        if (s.id !== id) return s;
        const order: StatusSlotPengisi[] = ['belum', 'siap', 'selesai'];
        const nextStatus = order[(order.indexOf(s.status) + 1) % order.length];
        return { ...s, status: nextStatus };
      })
    );
    setDraftDirty(true);
  };

  const handleMovePengisi = (index: number, dir: -1 | 1) => {
    if (!canEdit) return;
    const target = index + dir;
    if (target < 0 || target >= draftPengisi.length) return;
    const copy = [...draftPengisi];
    const tmp = copy[index];
    copy[index] = copy[target];
    copy[target] = tmp;
    setDraftPengisi(copy.map((s, idx) => ({ ...s, urutan: idx + 1 })));
    setDraftDirty(true);
  };

  const handleDeletePengisi = (id: string) => {
    if (!canEdit) return;
    setDraftPengisi((prev) =>
      prev.filter((s) => s.id !== id).map((s, idx) => ({ ...s, urutan: idx + 1 }))
    );
    setDraftDirty(true);
  };

  const handleMarkAllPengisiSiap = () => {
    if (!canEdit) return;
    setDraftPengisi((prev) =>
      prev.map((s) =>
        s.petugas_nama.trim().length > 0 && s.status === 'belum'
          ? { ...s, status: 'siap' }
          : s
      )
    );
    setDraftDirty(true);
  };

  // Rundown Actions
  const handleAddRundown = () => {
    if (!canEdit) return;
    const last = draftRundown[draftRundown.length - 1];
    setDraftRundown((prev) => [
      ...prev,
      {
        id: createKegiatanId('rnd'),
        jam_mulai: last?.jam_selesai || selectedAgenda?.jam_mulai || '20:00',
        jam_selesai: selectedAgenda?.jam_selesai || '20:30',
        sesi: '',
        lokasi: selectedAgenda?.lokasi || '',
        pj: '',
        keterangan: '',
      },
    ]);
    setDraftDirty(true);
  };

  const handleGenerateRundownFromPengisi = () => {
    if (!canEdit || !selectedAgenda || draftPengisi.length === 0) return;
    const baseStart = selectedAgenda.jam_mulai || '20:00';
    const generated: KegiatanRundownItem[] = draftPengisi.map((s) => ({
      id: createKegiatanId('rnd'),
      jam_mulai: baseStart,
      jam_selesai: selectedAgenda.jam_selesai || '',
      sesi: s.peran,
      lokasi: selectedAgenda.lokasi || '',
      pj: s.petugas_nama || selectedAgenda.penanggung_jawab || '',
      keterangan: s.catatan || '',
    }));
    setDraftRundown(generated);
    setDraftDirty(true);
    pushToast('info', 'Rundown Dibuat', 'Baris rundown disiapkan dari daftar slot pengisi.');
  };

  const handleUpdateRundown = (id: string, patch: Partial<KegiatanRundownItem>) => {
    if (!canEdit) return;
    setDraftRundown((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    setDraftDirty(true);
  };

  const handleMoveRundown = (index: number, dir: -1 | 1) => {
    if (!canEdit) return;
    const target = index + dir;
    if (target < 0 || target >= draftRundown.length) return;
    const copy = [...draftRundown];
    const tmp = copy[index];
    copy[index] = copy[target];
    copy[target] = tmp;
    setDraftRundown(copy);
    setDraftDirty(true);
  };

  const handleDeleteRundown = (id: string) => {
    if (!canEdit) return;
    setDraftRundown((prev) => prev.filter((r) => r.id !== id));
    setDraftDirty(true);
  };

  // Panitia Actions (Event Besar)
  const handleAddPanitia = () => {
    if (!canEdit) return;
    setDraftPanitia((prev) => [
      ...prev,
      {
        id: createKegiatanId('pnt'),
        jabatan: 'Anggota Panitia',
        nama: '',
        no_wa: '',
        tugas: '',
      },
    ]);
    setDraftDirty(true);
  };

  const handleUpdatePanitia = (id: string, patch: Partial<KegiatanPanitiaItem>) => {
    if (!canEdit) return;
    setDraftPanitia((prev) =>
      prev.map((p) => {
        if (p.id !== id) return p;
        const next = { ...p, ...patch };
        if (patch.nama !== undefined && !p.no_wa) {
          const found = personelOptions.find(
            (opt) => opt.nama.toLowerCase() === patch.nama?.trim().toLowerCase()
          );
          if (found?.no_wa) next.no_wa = found.no_wa;
        }
        return next;
      })
    );
    setDraftDirty(true);
  };

  const handleDeletePanitia = (id: string) => {
    if (!canEdit) return;
    setDraftPanitia((prev) => prev.filter((p) => p.id !== id));
    setDraftDirty(true);
  };

  // Documentation Photo Upload
  const handleUploadFotoDokumentasi = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!canEdit || !selectedAgenda) return;
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (files.length === 0) return;

    const existingUrls = selectedAgenda.dokumentasi_urls || [];
    const remainingSlots = MAX_DOKUMENTASI_FOTO - existingUrls.length;
    if (remainingSlots <= 0) {
      pushToast(
        'error',
        'Batas Foto Tercapai',
        `Maksimal ${MAX_DOKUMENTASI_FOTO} foto dokumentasi per kegiatan.`
      );
      return;
    }

    setUploadingPhoto(true);
    try {
      const toUpload = files.slice(0, remainingSlots);
      const uploadedUrls: string[] = [];
      for (const file of toUpload) {
        const res = await uploadKegiatanPhoto(file);
        if (res.url) uploadedUrls.push(res.url);
      }

      const nextUrls = [...existingUrls, ...uploadedUrls];
      await handleSaveDetailDraft({ dokumentasi_urls: nextUrls });
    } catch {
      pushToast('error', 'Gagal Mengunggah', 'Terjadi kendala saat memproses foto dokumentasi.');
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleDeleteFotoDokumentasi = async (urlToRemove: string) => {
    if (!canEdit || !selectedAgenda) return;
    await removeKegiatanStoragePhotos([urlToRemove]);
    const nextUrls = (selectedAgenda.dokumentasi_urls || []).filter((u) => u !== urlToRemove);
    await handleSaveDetailDraft({ dokumentasi_urls: nextUrls });
  };

  // Duplicate Weekly Action
  const handleConfirmDuplicate = async () => {
    if (!canEdit || !duplicateModal) return;
    const { item, targetDate, clearPengisi } = duplicateModal;
    const nowIso = new Date().toISOString();
    const clonedPengisi: KegiatanPengisiSlot[] = item.pengisi_list.map((s) => ({
      ...s,
      id: createKegiatanId('pgs'),
      petugas_nama: clearPengisi ? '' : s.petugas_nama,
      status: clearPengisi ? 'belum' : s.petugas_nama.trim() ? 'siap' : 'belum',
    }));
    const clonedRundown: KegiatanRundownItem[] = item.rundown_list.map((r) => ({
      ...r,
      id: createKegiatanId('rnd'),
      pj: clearPengisi ? '' : r.pj,
    }));
    const clonedPanitia: KegiatanPanitiaItem[] = item.panitia_list.map((p) => ({
      ...p,
      id: createKegiatanId('pnt'),
      nama: clearPengisi ? '' : p.nama,
      no_wa: clearPengisi ? '' : p.no_wa,
    }));

    const nextAgenda: KegiatanAgendaItem = {
      ...item,
      id: createKegiatanId('kgt'),
      kode_kegiatan: generateKodeKegiatan(targetDate, agendas),
      tanggal: targetDate,
      status: 'terjadwal',
      pengisi_list: clonedPengisi,
      rundown_list: clonedRundown,
      panitia_list: clonedPanitia,
      notulensi: '',
      dokumentasi_urls: [],
      created_at: nowIso,
      updated_at: nowIso,
    };

    const saved = await saveKegiatanAgendaRow(nextAgenda, false);
    setAgendas((prev) => [saved, ...prev]);
    setSelectedAgendaId(saved.id);
    setMobileShowDetail(true);
    setDuplicateModal(null);
    pushToast(
      'success',
      'Jadwal Diduplikasi',
      `Jadwal baru dibuat untuk ${formatHariTanggalIndo(targetDate)}.`
    );
  };

  // Format Templates Save & Duplicate
  const handleSaveFormat = async (template: KegiatanFormatTemplate, isEdit: boolean) => {
    if (!canEdit) return;
    const saved = await saveKegiatanFormatRow(template, isEdit);
    setFormats((prev) =>
      isEdit ? prev.map((f) => (f.id === saved.id ? saved : f)) : [saved, ...prev]
    );
    pushToast(
      'success',
      isEdit ? 'Format Diperbarui' : 'Format Baru Disimpan',
      `${saved.nama_format} (${saved.slots.length} slot pengisi).`
    );
  };

  const handleDuplicateFormat = async (fmt: KegiatanFormatTemplate) => {
    if (!canEdit) return;
    const copy: KegiatanFormatTemplate = {
      ...fmt,
      id: createKegiatanId('fmt'),
      nama_format: `${fmt.nama_format} (Salinan)`,
      bawaan: false,
      slots: fmt.slots.map((s) => ({ ...s, id: createKegiatanId('slot') })),
      updated_at: new Date().toISOString(),
    };
    await handleSaveFormat(copy, false);
  };

  // Confirm Delete (Agenda or Format)
  const handleExecuteDelete = async () => {
    if (!canEdit || !deleteConfirm) return;
    if (deleteConfirm.kind === 'agenda' && deleteConfirm.itemAgenda) {
      await deleteKegiatanAgendaRow(deleteConfirm.itemAgenda);
      const remaining = agendas.filter((a) => a.id !== deleteConfirm.id);
      setAgendas(remaining);
      if (selectedAgendaId === deleteConfirm.id) {
        setSelectedAgendaId(remaining[0]?.id || null);
        setMobileShowDetail(false);
      }
      pushToast('info', 'Agenda Dihapus', `${deleteConfirm.label} telah dihapus.`);
    } else if (deleteConfirm.kind === 'format') {
      await deleteKegiatanFormatRow(deleteConfirm.id);
      setFormats((prev) => prev.filter((f) => f.id !== deleteConfirm.id));
      pushToast('info', 'Format Dihapus', `${deleteConfirm.label} telah dihapus.`);
    }
    setDeleteConfirm(null);
  };

  // Copy WhatsApp text
  const handleCopyWa = async (item: KegiatanAgendaItem) => {
    const syncedItem: KegiatanAgendaItem =
      selectedAgenda?.id === item.id
        ? {
            ...item,
            pengisi_list: draftPengisi,
            rundown_list: draftRundown,
            panitia_list: draftPanitia,
          }
        : item;
    const text = buildKegiatanWaText(syncedItem);
    try {
      await navigator.clipboard.writeText(text);
      pushToast('success', 'Teks WA Disalin', 'Jadwal pengisi siap ditempel ke grup WhatsApp.');
    } catch {
      pushToast('error', 'Gagal Menyalin', 'Peramban tidak mengizinkan salin otomatis.');
    }
  };

  // Print Schedule Sheet
  const handlePrintJadwal = (item: KegiatanAgendaItem) => {
    const syncedItem: KegiatanAgendaItem =
      selectedAgenda?.id === item.id
        ? {
            ...item,
            pengisi_list: draftPengisi,
            rundown_list: draftRundown,
            panitia_list: draftPanitia,
            notulensi: draftNotulensi,
          }
        : item;
    setPrintTarget(syncedItem);
    setTimeout(() => {
      window.print();
    }, 150);
  };

  // Export Excel
  const handleExportExcel = () => {
    if (agendas.length === 0) {
      pushToast('info', 'Belum Ada Data', 'Tambahkan minimal 1 kegiatan sebelum ekspor.');
      return;
    }

    const agendaRows = agendas.map((a, idx) => {
      const prog = countPengisiProgress(a.pengisi_list);
      return {
        No: idx + 1,
        Kode: a.kode_kegiatan,
        Tanggal: a.tanggal,
        Waktu: `${a.jam_mulai}${a.jam_selesai ? ` - ${a.jam_selesai}` : ''}`,
        Judul: a.judul,
        Kategori: a.kategori === 'event_besar' ? 'Event Besar' : 'Rutin Mingguan',
        Format: a.format_nama,
        Lokasi: a.lokasi,
        PJ: a.penanggung_jawab,
        Status: STATUS_KEGIATAN_META[a.status].label,
        Pengisi_Terisi: `${prog.terisi}/${prog.total}`,
        Notulensi: a.notulensi,
      };
    });

    const pengisiRows: Array<Record<string, string | number>> = [];
    for (const a of agendas) {
      for (const s of [...a.pengisi_list].sort((x, y) => x.urutan - y.urutan)) {
        pengisiRows.push({
          Kode_Kegiatan: a.kode_kegiatan,
          Tanggal: a.tanggal,
          Kegiatan: a.judul,
          Urutan: s.urutan,
          Bagian_Slot: s.peran,
          Nama_Pengisi: s.petugas_nama || '-',
          Status_Slot: SLOT_STATUS_META[s.status].label,
          Catatan: s.catatan || '',
        });
      }
    }

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(agendaRows), 'Jadwal Kegiatan');
    if (pengisiRows.length > 0) {
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(pengisiRows), 'Rincian Pengisi');
    }
    XLSX.writeFile(wb, `Rekap-Kegiatan-Pondok-${todayStr || 'export'}.xlsx`);
    pushToast('success', 'Excel Diunduh', 'File rekap jadwal & rincian pengisi berhasil diunduh.');
  };

  return (
    <div className="space-y-6">
      {/* AREA TAMPILAN LAYAR (DISembunyikan SAAT PRINT) */}
      <div className="print:hidden space-y-6">
        {/* TOAST NOTIFICATIONS */}
        {toasts.length > 0 && (
          <div className="fixed bottom-16 md:bottom-6 right-4 z-50 space-y-2 max-w-sm w-full pointer-events-none">
            {toasts.map((t) => (
              <div
                key={t.id}
                className={`pointer-events-auto p-3.5 rounded-xl border shadow-lg text-xs flex items-start gap-2.5 bg-white ${
                  t.type === 'error'
                    ? 'border-rose-200 text-rose-900'
                    : t.type === 'success'
                    ? 'siap-border-accent text-slate-900'
                    : 'border-slate-200 text-slate-900'
                }`}
              >
                <CheckCircle2
                  className={`w-4 h-4 shrink-0 mt-0.5 ${
                    t.type === 'error'
                      ? 'text-rose-600'
                      : t.type === 'success'
                      ? 'siap-text-accent'
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

        {/* HEADER MODUL */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 flex items-center gap-2.5">
              <Calendar className="w-6 h-6 siap-text-accent shrink-0" />
              Modul Kegiatan Pondok
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 mt-1">
              Kelola jadwal rutin mingguan, peringatan hari besar, format pengisi acara, susunan panitia, rundown, dan dokumentasi.
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
              <FileSpreadsheet className="w-3.5 h-3.5 siap-text-accent" />
              Export Excel
            </button>
            {canEdit && (
              <button
                type="button"
                onClick={() => setAgendaModal({ open: true, editing: null })}
                className="min-h-[40px] px-4 py-2 siap-btn-primary text-xs font-bold rounded-xl shadow-sm inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
              >
                <Plus className="w-4 h-4" />
                Jadwalkan Kegiatan
              </button>
            )}
          </div>
        </div>

        <TransparencyBanner moduleLabel="Jadwal & Pengisi Kegiatan" isReadOnly={!canEdit} />

        {/* 4 SUMMARY KPI CARDS */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
          <div className="bg-white p-4 rounded-2xl border border-slate-200">
            <span className="text-xs font-semibold text-slate-500 block">Agenda Aktif / Terjadwal</span>
            <strong className="text-2xl font-bold text-slate-900 tabular-nums mt-1 block">
              {loading ? '...' : summaryStats.terjadwal}
            </strong>
            <span className="text-[11px] text-slate-500">Kegiatan rutin &amp; event mendatang</span>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-slate-200">
            <span className="text-xs font-semibold text-slate-500 block">Event Hari Besar Aktif</span>
            <strong className="text-2xl font-bold text-amber-700 tabular-nums mt-1 block">
              {loading ? '...' : summaryStats.eventBesarAktif}
            </strong>
            <span className="text-[11px] text-slate-500">Dilengkapi susunan kepanitiaan</span>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-slate-200">
            <span className="text-xs font-semibold text-slate-500 block">Kesiapan Pengisi Acara</span>
            <strong className="text-2xl font-bold siap-text-accent tabular-nums mt-1 block">
              {loading ? '...' : `${summaryStats.persenSiap}%`}
            </strong>
            <span className="text-[11px] text-slate-500 tabular-nums">
              {summaryStats.totalSlotTerisi}/{summaryStats.totalSlotAktif} slot pengisi terisi
            </span>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-slate-200">
            <span className="text-xs font-semibold text-slate-500 block">Terlaksana &amp; Arsip</span>
            <strong className="text-2xl font-bold text-slate-900 tabular-nums mt-1 block">
              {loading ? '...' : summaryStats.selesaiCount}
            </strong>
            <span className="text-[11px] text-slate-500 tabular-nums">
              {summaryStats.totalFoto} foto dokumentasi tersimpan
            </span>
          </div>
        </div>

        {/* NAVIGATION TABS */}
        <div className="flex items-center gap-1.5 p-1 bg-slate-200/70 rounded-xl w-full sm:w-fit overflow-x-auto">
          <button
            type="button"
            onClick={() => setMainTab('agenda')}
            className={`min-h-[38px] px-4 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
              mainTab === 'agenda'
                ? 'bg-white siap-text-accent shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Calendar className="w-3.5 h-3.5" />
            Agenda &amp; Jadwal
          </button>
          <button
            type="button"
            onClick={() => setMainTab('format')}
            className={`min-h-[38px] px-4 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
              mainTab === 'format'
                ? 'bg-white siap-text-accent shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            Format Pengisi ({formats.length})
          </button>
          <button
            type="button"
            onClick={() => setMainTab('arsip')}
            className={`min-h-[38px] px-4 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
              mainTab === 'arsip'
                ? 'bg-white siap-text-accent shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Archive className="w-3.5 h-3.5" />
            Arsip &amp; Dokumentasi
          </button>
        </div>

        {/* TAB 1: AGENDA & JADWAL */}
        {mainTab === 'agenda' && (
          <div className="space-y-4">
            {/* FILTER BAR */}
            <div className="bg-white p-3.5 rounded-2xl border border-slate-200 flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
              <div className="relative flex-1 min-w-0">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Cari nama kegiatan, lokasi, PJ, atau nama pengisi..."
                  className="w-full min-h-[40px] pl-9 pr-3 py-2 text-xs sm:text-sm border border-slate-200 rounded-xl focus:outline-none siap-ring-focus"
                />
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <select
                  value={kategoriFilter}
                  onChange={(e) =>
                    setKategoriFilter(e.target.value as 'semua' | KategoriKegiatan)
                  }
                  className="min-h-[40px] px-3 py-2 text-xs border border-slate-200 rounded-xl bg-white text-slate-700 font-medium"
                >
                  <option value="semua">Semua Kategori</option>
                  <option value="rutin">Rutin Mingguan</option>
                  <option value="event_besar">Event Besar</option>
                </select>

                <select
                  value={statusFilter}
                  onChange={(e) =>
                    setStatusFilter(e.target.value as 'semua' | StatusKegiatan)
                  }
                  className="min-h-[40px] px-3 py-2 text-xs border border-slate-200 rounded-xl bg-white text-slate-700 font-medium"
                >
                  <option value="semua">Semua Status</option>
                  <option value="terjadwal">Terjadwal</option>
                  <option value="berlangsung">Berlangsung</option>
                  <option value="selesai">Selesai</option>
                  <option value="ditunda">Ditunda</option>
                </select>
              </div>
            </div>

            {loading ? (
              <div className="bg-white p-10 rounded-2xl border border-slate-200 text-center text-xs text-slate-500 flex flex-col items-center gap-2">
                <Loader2 className="w-5 h-5 animate-spin siap-text-accent" />
                <span>Memuat daftar jadwal kegiatan pondok...</span>
              </div>
            ) : filteredAgendas.length === 0 ? (
              <div className="bg-white p-10 rounded-2xl border border-slate-200 text-center space-y-3">
                <CalendarPlus className="w-10 h-10 siap-text-accent mx-auto" />
                <div className="max-w-md mx-auto space-y-1">
                  <h3 className="text-sm font-bold text-slate-900">
                    Belum Ada Jadwal Kegiatan Sesuai Filter
                  </h3>
                  <p className="text-xs text-slate-500">
                    Mulai jadwalkan kegiatan rutin seperti Pembacaan Burdah (otomatis 12 slot:
                    Tawasul, Fashl 1–10, Doa) atau buat jadwal Event Hari Besar.
                  </p>
                </div>
                {canEdit && (
                  <div className="flex flex-wrap justify-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() =>
                        setAgendaModal({
                          open: true,
                          editing: null,
                          presetFormatId: 'fmt-burdah-12',
                        })
                      }
                      className="min-h-[40px] px-4 py-2 siap-btn-primary text-xs font-bold rounded-xl inline-flex items-center gap-1.5"
                    >
                      <Plus className="w-4 h-4" />
                      Buat Jadwal Kegiatan Pertama
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
                {/* KOLOM KIRI: DAFTAR AGENDA */}
                <div
                  className={`lg:col-span-5 space-y-2.5 ${
                    mobileShowDetail ? 'hidden lg:block' : 'block'
                  }`}
                >
                  {filteredAgendas.map((item) => {
                    const isSelected = selectedAgenda?.id === item.id;
                    const prog = countPengisiProgress(item.pengisi_list);
                    const statusMeta = STATUS_KEGIATAN_META[item.status];

                    return (
                      <div
                        key={item.id}
                        className={`rounded-2xl border bg-white p-4 transition-colors cursor-pointer ${
                          isSelected
                            ? 'siap-border-accent ring-1'
                            : 'border-slate-200 hover:border-slate-300'
                        }`}
                        onClick={() => {
                          setSelectedAgendaId(item.id);
                          setMobileShowDetail(true);
                        }}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="text-[11px] text-slate-500 flex flex-wrap items-center gap-1.5">
                              <span className="font-mono font-semibold text-slate-600">
                                {item.kode_kegiatan}
                              </span>
                              <span aria-hidden="true">&middot;</span>
                              <span className="font-medium text-slate-700">
                                {item.kategori === 'event_besar' ? 'Event Besar' : 'Rutin Mingguan'}
                              </span>
                              {item.tanggal === todayStr && (
                                <>
                                  <span aria-hidden="true">&middot;</span>
                                  <span className="font-bold siap-text-accent">Hari Ini</span>
                                </>
                              )}
                            </div>
                            <h3 className="text-sm font-bold text-slate-900 mt-1 truncate">
                              {item.judul}
                            </h3>
                          </div>

                          <span
                            className={`px-2 py-0.5 rounded-md border text-[11px] font-semibold whitespace-nowrap shrink-0 ${statusMeta.badge}`}
                          >
                            {statusMeta.label}
                          </span>
                        </div>

                        <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600">
                          <span className="inline-flex items-center gap-1 font-mono tabular-nums">
                            <Calendar className="w-3.5 h-3.5 text-slate-400" />
                            {formatHariTanggalIndo(item.tanggal)}
                          </span>
                          <span className="inline-flex items-center gap-1 font-mono tabular-nums">
                            <Clock className="w-3.5 h-3.5 text-slate-400" />
                            {item.jam_mulai}
                            {item.jam_selesai ? `–${item.jam_selesai}` : ''} WIB
                          </span>
                        </div>

                        <div className="mt-1 text-xs text-slate-500 flex items-center gap-1 truncate">
                          <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span className="truncate">{item.lokasi}</span>
                          {item.penanggung_jawab && (
                            <>
                              <span aria-hidden="true">&middot;</span>
                              <span className="truncate">PJ: {item.penanggung_jawab}</span>
                            </>
                          )}
                        </div>

                        {/* Progress Pengisi */}
                        <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between text-[11px] mb-1">
                              <span className="text-slate-600 font-medium">
                                Pengisi: <strong className="tabular-nums">{prog.terisi}/{prog.total}</strong> slot
                              </span>
                              <span className="font-mono tabular-nums siap-text-accent font-semibold">
                                {prog.persenTerisi}%
                              </span>
                            </div>
                            <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                              <div
                                className="h-full siap-progress-fill rounded-full transition-all"
                                style={{ width: `${prog.persenTerisi}%` }}
                              />
                            </div>
                          </div>

                          {canEdit && (
                            <div
                              className="flex items-center gap-1 shrink-0"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <button
                                type="button"
                                title="Duplikat ke pekan berikutnya"
                                onClick={() =>
                                  setDuplicateModal({
                                    item,
                                    targetDate: addDaysIso(item.tanggal, 7),
                                    clearPengisi: true,
                                  })
                                }
                                className="p-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
                              >
                                <Copy className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                title="Edit info kegiatan"
                                onClick={() =>
                                  setAgendaModal({ open: true, editing: item })
                                }
                                className="p-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                title="Hapus kegiatan"
                                onClick={() =>
                                  setDeleteConfirm({
                                    kind: 'agenda',
                                    id: item.id,
                                    label: item.judul,
                                    itemAgenda: item,
                                  })
                                }
                                className="p-2 rounded-lg border border-rose-200 text-rose-600 hover:bg-rose-50"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* KOLOM KANAN: DETAIL OPERASIONAL KEGIATAN */}
                <div
                  className={`lg:col-span-7 bg-white rounded-2xl border border-slate-200 overflow-hidden ${
                    mobileShowDetail ? 'block' : 'hidden lg:block'
                  }`}
                >
                  {!selectedAgenda ? (
                    <div className="p-10 text-center text-xs text-slate-500">
                      Pilih salah satu agenda kegiatan di sebelah kiri untuk mengisi petugas, rundown, atau dokumentasi.
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-200">
                      {/* HEADER DETAIL */}
                      <div className="p-5 space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <button
                            type="button"
                            onClick={() => setMobileShowDetail(false)}
                            className="lg:hidden min-h-[36px] px-3 py-1.5 rounded-lg bg-slate-100 text-slate-700 text-xs font-semibold inline-flex items-center gap-1"
                          >
                            <ArrowLeft className="w-3.5 h-3.5" />
                            Daftar Agenda
                          </button>

                          <div className="text-xs text-slate-500 flex flex-wrap items-center gap-1.5">
                            <span className="font-mono font-bold text-slate-700">
                              {selectedAgenda.kode_kegiatan}
                            </span>
                            <span aria-hidden="true">&middot;</span>
                            <span>
                              {selectedAgenda.kategori === 'event_besar'
                                ? 'Event Besar'
                                : 'Rutin Mingguan'}
                            </span>
                            <span aria-hidden="true">&middot;</span>
                            <span>{selectedAgenda.format_nama}</span>
                          </div>

                          <div className="flex flex-wrap items-center gap-1.5">
                            {canEdit ? (
                              <select
                                value={selectedAgenda.status}
                                onChange={(e) =>
                                  handleQuickStatusChange(e.target.value as StatusKegiatan)
                                }
                                className="min-h-[36px] px-2.5 py-1 text-xs font-semibold border border-slate-200 rounded-lg bg-white text-slate-800"
                              >
                                <option value="terjadwal">Status: Terjadwal</option>
                                <option value="berlangsung">Status: Berlangsung</option>
                                <option value="selesai">Status: Selesai</option>
                                <option value="ditunda">Status: Ditunda</option>
                              </select>
                            ) : (
                              <span
                                className={`px-2.5 py-1 rounded-lg border text-xs font-semibold ${
                                  STATUS_KEGIATAN_META[selectedAgenda.status].badge
                                }`}
                              >
                                Status: {STATUS_KEGIATAN_META[selectedAgenda.status].label}
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                          <div>
                            <h2 className="text-lg font-bold text-slate-900">
                              {selectedAgenda.judul}
                            </h2>
                            <p className="text-xs text-slate-600 mt-1">
                              {formatHariTanggalIndo(selectedAgenda.tanggal)} &middot;{' '}
                              <span className="font-mono tabular-nums">
                                {selectedAgenda.jam_mulai}
                                {selectedAgenda.jam_selesai
                                  ? `–${selectedAgenda.jam_selesai}`
                                  : ''}{' '}
                                WIB
                              </span>{' '}
                              &middot; {selectedAgenda.lokasi}
                            </p>
                            {selectedAgenda.penanggung_jawab && (
                              <p className="text-xs text-slate-500 mt-0.5">
                                Penanggung Jawab: <strong>{selectedAgenda.penanggung_jawab}</strong>
                              </p>
                            )}
                          </div>

                          <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              onClick={() => handleCopyWa(selectedAgenda)}
                              className="min-h-[36px] px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 inline-flex items-center gap-1 whitespace-nowrap"
                            >
                              <ClipboardCopy className="w-3.5 h-3.5 siap-text-accent" />
                              Salin WA
                            </button>
                            <button
                              type="button"
                              onClick={() => handlePrintJadwal(selectedAgenda)}
                              className="min-h-[36px] px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 inline-flex items-center gap-1 whitespace-nowrap"
                            >
                              <Printer className="w-3.5 h-3.5 text-slate-600" />
                              Cetak Jadwal
                            </button>
                            {canEdit && (
                              <button
                                type="button"
                                onClick={() =>
                                  setAgendaModal({ open: true, editing: selectedAgenda })
                                }
                                className="min-h-[36px] px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 inline-flex items-center gap-1 whitespace-nowrap"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                                Edit Info
                              </button>
                            )}
                          </div>
                        </div>

                        {/* SUB-TABS DETAIL */}
                        <div className="flex flex-wrap items-center gap-1 pt-2">
                          <button
                            type="button"
                            onClick={() => setDetailTab('pengisi')}
                            className={`min-h-[38px] px-3.5 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                              detailTab === 'pengisi'
                                ? 'siap-btn-primary'
                                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                            }`}
                          >
                            <UserCheck className="w-3.5 h-3.5" />
                            Rincian Pengisi ({draftPengisi.length})
                          </button>
                          <button
                            type="button"
                            onClick={() => setDetailTab('rundown')}
                            className={`min-h-[38px] px-3.5 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                              detailTab === 'rundown'
                                ? 'siap-btn-primary'
                                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                            }`}
                          >
                            <ListChecks className="w-3.5 h-3.5" />
                            Rundown ({draftRundown.length})
                          </button>
                          {selectedAgenda.kategori === 'event_besar' && (
                            <button
                              type="button"
                              onClick={() => setDetailTab('panitia')}
                              className={`min-h-[38px] px-3.5 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                                detailTab === 'panitia'
                                  ? 'siap-btn-primary'
                                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                              }`}
                            >
                              <Users className="w-3.5 h-3.5" />
                              Susunan Panitia ({draftPanitia.length})
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => setDetailTab('dokumentasi')}
                            className={`min-h-[38px] px-3.5 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                              detailTab === 'dokumentasi'
                                ? 'siap-btn-primary'
                                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                            }`}
                          >
                            <Camera className="w-3.5 h-3.5" />
                            Dokumentasi ({(selectedAgenda.dokumentasi_urls || []).length})
                          </button>
                        </div>
                      </div>

                      {/* DATALIST PERSONEL UNTUK AUTO-SUGGEST PENGISI & PANITIA */}
                      <datalist id="kegiatan-personel-detail">
                        {personelOptions.map((p) => (
                          <option key={p.id} value={p.nama}>
                            {p.sumber} · {p.info}
                          </option>
                        ))}
                      </datalist>

                      {/* SUB-TAB CONTENT: RINCIAN PENGISI */}
                      {detailTab === 'pengisi' && (
                        <div className="p-5 space-y-4">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="text-xs text-slate-600">
                              {canEdit
                                ? 'Isi nama santri atau pengurus pada setiap slot. Klik status untuk menandai kesiapan.'
                                : 'Daftar pengisi acara pada setiap slot kegiatan (View Only).'}
                            </div>
                            {canEdit && (
                              <div className="flex flex-wrap items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={handleMarkAllPengisiSiap}
                                  className="min-h-[36px] px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap"
                                >
                                  Tandai Terisi = Siap
                                </button>
                                <button
                                  type="button"
                                  onClick={handleAddPengisiSlot}
                                  className="min-h-[36px] px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-900 text-white text-xs font-semibold inline-flex items-center gap-1 whitespace-nowrap"
                                >
                                  <Plus className="w-3.5 h-3.5" />
                                  Tambah Slot
                                </button>
                              </div>
                            )}
                          </div>

                          {draftPengisi.length === 0 ? (
                            <div className="p-6 rounded-xl bg-slate-50 border border-slate-200 text-center space-y-2">
                              <p className="text-xs text-slate-600">
                                Belum ada slot pengisi pada kegiatan ini.
                              </p>
                              {canEdit && (
                                <button
                                  type="button"
                                  onClick={handleAddPengisiSlot}
                                  className="min-h-[36px] px-3.5 py-1.5 siap-btn-primary text-xs font-semibold rounded-lg inline-flex items-center gap-1"
                                >
                                  <Plus className="w-3.5 h-3.5" />
                                  Tambah Slot Pengisi
                                </button>
                              )}
                            </div>
                          ) : (
                            <div className="border border-slate-200 rounded-xl divide-y divide-slate-100 overflow-hidden">
                              {draftPengisi.map((slot, idx) => {
                                const slotMeta = SLOT_STATUS_META[slot.status];
                                return (
                                  <div
                                    key={slot.id}
                                    className="p-3 bg-white hover:bg-slate-50/70 space-y-2 sm:space-y-0 sm:grid sm:grid-cols-12 sm:items-center sm:gap-2"
                                  >
                                    <div className="sm:col-span-4 flex items-center gap-2 min-w-0">
                                      <span className="w-6 text-xs font-mono font-bold text-slate-400 tabular-nums shrink-0">
                                        {String(idx + 1).padStart(2, '0')}
                                      </span>
                                      <input
                                        type="text"
                                        readOnly={!canEdit}
                                        value={slot.peran}
                                        onChange={(e) =>
                                          handleUpdatePengisi(slot.id, { peran: e.target.value })
                                        }
                                        placeholder="Bagian / Fashl"
                                        className="flex-1 min-w-0 min-h-[36px] px-2.5 py-1 text-xs font-semibold text-slate-800 border border-slate-200 rounded-lg siap-ring-focus read-only:bg-slate-50"
                                      />
                                    </div>

                                    <div className="sm:col-span-4">
                                      <input
                                        type="text"
                                        readOnly={!canEdit}
                                        list="kegiatan-personel-detail"
                                        value={slot.petugas_nama}
                                        onChange={(e) =>
                                          handleUpdatePengisi(slot.id, {
                                            petugas_nama: e.target.value,
                                          })
                                        }
                                        placeholder="Pilih / ketik nama pengisi..."
                                        className="w-full min-h-[36px] px-2.5 py-1 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 read-only:bg-slate-50"
                                      />
                                    </div>

                                    <div className="sm:col-span-4 flex items-center justify-between sm:justify-end gap-1.5">
                                      <input
                                        type="text"
                                        readOnly={!canEdit}
                                        value={slot.catatan}
                                        onChange={(e) =>
                                          handleUpdatePengisi(slot.id, { catatan: e.target.value })
                                        }
                                        placeholder="Ket."
                                        className="w-24 sm:flex-1 min-w-0 min-h-[36px] px-2 py-1 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 read-only:bg-slate-50"
                                      />
                                      <button
                                        type="button"
                                        disabled={!canEdit}
                                        onClick={() => handleCycleSlotStatus(slot.id)}
                                        className={`min-h-[36px] px-2.5 py-1 rounded-lg border text-[11px] font-bold whitespace-nowrap shrink-0 disabled:cursor-default ${slotMeta.cls}`}
                                      >
                                        {slotMeta.label}
                                      </button>
                                      {canEdit && (
                                        <>
                                          <button
                                            type="button"
                                            onClick={() => handleMovePengisi(idx, -1)}
                                            disabled={idx === 0}
                                            aria-label="Naikkan"
                                            className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-100 disabled:opacity-30"
                                          >
                                            <ArrowUp className="w-3.5 h-3.5" />
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => handleMovePengisi(idx, 1)}
                                            disabled={idx === draftPengisi.length - 1}
                                            aria-label="Turunkan"
                                            className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-100 disabled:opacity-30"
                                          >
                                            <ArrowDown className="w-3.5 h-3.5" />
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => handleDeletePengisi(slot.id)}
                                            aria-label="Hapus slot"
                                            className="p-1.5 rounded-lg border border-rose-200 text-rose-600 hover:bg-rose-50"
                                          >
                                            <Trash2 className="w-3.5 h-3.5" />
                                          </button>
                                        </>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}

                          {canEdit && (
                            <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
                              <span className="text-xs text-slate-500">
                                {draftDirty
                                  ? 'Ada perubahan yang belum disimpan.'
                                  : 'Semua perubahan rincian pengisi sudah tersimpan.'}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleSaveDetailDraft()}
                                disabled={savingDetail}
                                className="min-h-[40px] px-4 py-2 siap-btn-primary text-xs font-bold rounded-xl inline-flex items-center gap-1.5 whitespace-nowrap"
                              >
                                <Save className="w-3.5 h-3.5" />
                                {savingDetail ? 'Menyimpan...' : 'Simpan Rincian Pengisi'}
                              </button>
                            </div>
                          )}
                        </div>
                      )}

                      {/* SUB-TAB CONTENT: RUNDOWN ACARA */}
                      {detailTab === 'rundown' && (
                        <div className="p-5 space-y-4">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="text-xs text-slate-600">
                              Susunan waktu dan sesi acara dari pembukaan hingga selesai.
                            </span>
                            {canEdit && (
                              <div className="flex flex-wrap items-center gap-1.5">
                                {draftPengisi.length > 0 && (
                                  <button
                                    type="button"
                                    onClick={handleGenerateRundownFromPengisi}
                                    className="min-h-[36px] px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 inline-flex items-center gap-1 whitespace-nowrap"
                                  >
                                    <Sparkles className="w-3.5 h-3.5 text-amber-600" />
                                    Tarik dari Slot Pengisi
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={handleAddRundown}
                                  className="min-h-[36px] px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-900 text-white text-xs font-semibold inline-flex items-center gap-1 whitespace-nowrap"
                                >
                                  <Plus className="w-3.5 h-3.5" />
                                  Tambah Sesi
                                </button>
                              </div>
                            )}
                          </div>

                          {draftRundown.length === 0 ? (
                            <div className="p-6 rounded-xl bg-slate-50 border border-slate-200 text-center space-y-2">
                              <p className="text-xs text-slate-600">
                                Belum ada rundown acara tercatat.
                              </p>
                              {canEdit && (
                                <button
                                  type="button"
                                  onClick={handleAddRundown}
                                  className="min-h-[36px] px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg inline-flex items-center gap-1"
                                >
                                  <Plus className="w-3.5 h-3.5" />
                                  Tambah Sesi Pertama
                                </button>
                              )}
                            </div>
                          ) : (
                            <div className="space-y-2.5">
                              {draftRundown.map((row, idx) => (
                                <div
                                  key={row.id}
                                  className="p-3 rounded-xl border border-slate-200 bg-slate-50/40 space-y-2"
                                >
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="text-xs font-mono font-bold text-slate-500 tabular-nums">
                                      #{idx + 1}
                                    </span>
                                    <input
                                      type="time"
                                      readOnly={!canEdit}
                                      value={row.jam_mulai}
                                      onChange={(e) =>
                                        handleUpdateRundown(row.id, { jam_mulai: e.target.value })
                                      }
                                      className="min-h-[36px] px-2 py-1 text-xs font-mono tabular-nums border border-slate-200 rounded-lg bg-white read-only:bg-slate-50"
                                    />
                                    <span className="text-xs text-slate-400">s/d</span>
                                    <input
                                      type="time"
                                      readOnly={!canEdit}
                                      value={row.jam_selesai}
                                      onChange={(e) =>
                                        handleUpdateRundown(row.id, { jam_selesai: e.target.value })
                                      }
                                      className="min-h-[36px] px-2 py-1 text-xs font-mono tabular-nums border border-slate-200 rounded-lg bg-white read-only:bg-slate-50"
                                    />
                                    <input
                                      type="text"
                                      readOnly={!canEdit}
                                      value={row.sesi}
                                      onChange={(e) =>
                                        handleUpdateRundown(row.id, { sesi: e.target.value })
                                      }
                                      placeholder="Nama sesi / agenda"
                                      className="flex-1 min-w-[160px] min-h-[36px] px-2.5 py-1 text-xs font-semibold border border-slate-200 rounded-lg bg-white read-only:bg-slate-50"
                                    />
                                    {canEdit && (
                                      <div className="flex items-center gap-1 shrink-0">
                                        <button
                                          type="button"
                                          onClick={() => handleMoveRundown(idx, -1)}
                                          disabled={idx === 0}
                                          aria-label="Naikkan sesi"
                                          className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-100 disabled:opacity-30"
                                        >
                                          <ArrowUp className="w-3.5 h-3.5" />
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => handleMoveRundown(idx, 1)}
                                          disabled={idx === draftRundown.length - 1}
                                          aria-label="Turunkan sesi"
                                          className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-100 disabled:opacity-30"
                                        >
                                          <ArrowDown className="w-3.5 h-3.5" />
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => handleDeleteRundown(row.id)}
                                          aria-label="Hapus sesi"
                                          className="p-1.5 rounded-lg border border-rose-200 bg-white text-rose-600 hover:bg-rose-50"
                                        >
                                          <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                      </div>
                                    )}
                                  </div>

                                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                    <input
                                      type="text"
                                      readOnly={!canEdit}
                                      list="kegiatan-personel-detail"
                                      value={row.pj}
                                      onChange={(e) =>
                                        handleUpdateRundown(row.id, { pj: e.target.value })
                                      }
                                      placeholder="Penanggung jawab sesi"
                                      className="min-h-[34px] px-2.5 py-1 text-xs border border-slate-200 rounded-lg bg-white read-only:bg-slate-50"
                                    />
                                    <input
                                      type="text"
                                      readOnly={!canEdit}
                                      value={row.lokasi}
                                      onChange={(e) =>
                                        handleUpdateRundown(row.id, { lokasi: e.target.value })
                                      }
                                      placeholder="Lokasi sesi"
                                      className="min-h-[34px] px-2.5 py-1 text-xs border border-slate-200 rounded-lg bg-white read-only:bg-slate-50"
                                    />
                                    <input
                                      type="text"
                                      readOnly={!canEdit}
                                      value={row.keterangan}
                                      onChange={(e) =>
                                        handleUpdateRundown(row.id, { keterangan: e.target.value })
                                      }
                                      placeholder="Keterangan / perlengkapan"
                                      className="min-h-[34px] px-2.5 py-1 text-xs border border-slate-200 rounded-lg bg-white read-only:bg-slate-50"
                                    />
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}

                          {canEdit && (
                            <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
                              <span className="text-xs text-slate-500">
                                {draftDirty
                                  ? 'Ada perubahan rundown yang belum disimpan.'
                                  : 'Semua perubahan rundown tersimpan.'}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleSaveDetailDraft()}
                                disabled={savingDetail}
                                className="min-h-[40px] px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-xs font-bold rounded-xl inline-flex items-center gap-1.5 whitespace-nowrap"
                              >
                                <Save className="w-3.5 h-3.5" />
                                {savingDetail ? 'Menyimpan...' : 'Simpan Rundown'}
                              </button>
                            </div>
                          )}
                        </div>
                      )}

                      {/* SUB-TAB CONTENT: SUSUNAN PANITIA (KHUSUS EVENT BESAR) */}
                      {detailTab === 'panitia' && selectedAgenda.kategori === 'event_besar' && (
                        <div className="p-5 space-y-4">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="text-xs text-slate-600">
                              Struktur kepanitiaan khusus acara hari besar pondok.
                            </span>
                            {canEdit && (
                              <div className="flex flex-wrap items-center gap-1.5">
                                {draftPanitia.length === 0 && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setDraftPanitia(instantiatePanitiaPreset());
                                      setDraftDirty(true);
                                    }}
                                    className="min-h-[36px] px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                                  >
                                    Muat Jabatan Standar
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={handleAddPanitia}
                                  className="min-h-[36px] px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-900 text-white text-xs font-semibold inline-flex items-center gap-1"
                                >
                                  <Plus className="w-3.5 h-3.5" />
                                  Tambah Jabatan
                                </button>
                              </div>
                            )}
                          </div>

                          <div className="border border-slate-200 rounded-xl divide-y divide-slate-100 overflow-hidden">
                            {draftPanitia.map((p) => (
                              <div
                                key={p.id}
                                className="p-3 bg-white space-y-2 sm:space-y-0 sm:grid sm:grid-cols-12 sm:items-center sm:gap-2"
                              >
                                <div className="sm:col-span-3">
                                  <input
                                    type="text"
                                    readOnly={!canEdit}
                                    value={p.jabatan}
                                    onChange={(e) =>
                                      handleUpdatePanitia(p.id, { jabatan: e.target.value })
                                    }
                                    placeholder="Jabatan / Seksi"
                                    className="w-full min-h-[36px] px-2.5 py-1 text-xs font-semibold text-slate-800 border border-slate-200 rounded-lg read-only:bg-slate-50"
                                  />
                                </div>
                                <div className="sm:col-span-3">
                                  <input
                                    type="text"
                                    readOnly={!canEdit}
                                    list="kegiatan-personel-detail"
                                    value={p.nama}
                                    onChange={(e) =>
                                      handleUpdatePanitia(p.id, { nama: e.target.value })
                                    }
                                    placeholder="Nama panitia"
                                    className="w-full min-h-[36px] px-2.5 py-1 text-xs border border-slate-200 rounded-lg read-only:bg-slate-50"
                                  />
                                </div>
                                <div className="sm:col-span-2">
                                  <input
                                    type="text"
                                    readOnly={!canEdit}
                                    value={p.no_wa}
                                    onChange={(e) =>
                                      handleUpdatePanitia(p.id, { no_wa: e.target.value })
                                    }
                                    placeholder="No. WA"
                                    className="w-full min-h-[36px] px-2.5 py-1 text-xs font-mono tabular-nums border border-slate-200 rounded-lg read-only:bg-slate-50"
                                  />
                                </div>
                                <div className="sm:col-span-4 flex items-center gap-1.5">
                                  <input
                                    type="text"
                                    readOnly={!canEdit}
                                    value={p.tugas}
                                    onChange={(e) =>
                                      handleUpdatePanitia(p.id, { tugas: e.target.value })
                                    }
                                    placeholder="Tugas singkat"
                                    className="flex-1 min-w-0 min-h-[36px] px-2.5 py-1 text-xs border border-slate-200 rounded-lg read-only:bg-slate-50"
                                  />
                                  {canEdit && (
                                    <button
                                      type="button"
                                      onClick={() => handleDeletePanitia(p.id)}
                                      aria-label="Hapus jabatan"
                                      className="p-1.5 rounded-lg border border-rose-200 text-rose-600 hover:bg-rose-50 shrink-0"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>

                          {canEdit && (
                            <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
                              <span className="text-xs text-slate-500">
                                {draftDirty
                                  ? 'Ada perubahan kepanitiaan yang belum disimpan.'
                                  : 'Susunan panitia sudah tersimpan.'}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleSaveDetailDraft()}
                                disabled={savingDetail}
                                className="min-h-[40px] px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-xs font-bold rounded-xl inline-flex items-center gap-1.5 whitespace-nowrap"
                              >
                                <Save className="w-3.5 h-3.5" />
                                {savingDetail ? 'Menyimpan...' : 'Simpan Susunan Panitia'}
                              </button>
                            </div>
                          )}
                        </div>
                      )}

                      {/* SUB-TAB CONTENT: DOKUMENTASI & NOTULENSI */}
                      {detailTab === 'dokumentasi' && (
                        <div className="p-5 space-y-5">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div>
                              <h4 className="text-xs font-bold text-slate-900">
                                Galeri Foto Dokumentasi ({(selectedAgenda.dokumentasi_urls || []).length}/{MAX_DOKUMENTASI_FOTO})
                              </h4>
                              <p className="text-[11px] text-slate-500">
                                Unggah hingga {MAX_DOKUMENTASI_FOTO} foto kegiatan sebagai arsip dokumentasi pondok.
                              </p>
                            </div>

                            {canEdit && (
                              <div className="flex flex-wrap items-center gap-2">
                                {selectedAgenda.status !== 'selesai' && (
                                  <button
                                    type="button"
                                    onClick={() => handleQuickStatusChange('selesai')}
                                    className="min-h-[38px] px-3.5 py-1.5 siap-soft-box hover:opacity-90 border text-xs font-bold rounded-xl inline-flex items-center gap-1.5 whitespace-nowrap"
                                  >
                                    <CheckCircle2 className="w-3.5 h-3.5" />
                                    Tandai Kegiatan Selesai
                                  </button>
                                )}

                                {(selectedAgenda.dokumentasi_urls || []).length <
                                  MAX_DOKUMENTASI_FOTO && (
                                  <label className="min-h-[38px] px-3.5 py-1.5 siap-btn-primary text-xs font-bold rounded-xl inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap">
                                    {uploadingPhoto ? (
                                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                    ) : (
                                      <Camera className="w-3.5 h-3.5" />
                                    )}
                                    {uploadingPhoto ? 'Mengunggah...' : 'Unggah Foto'}
                                    <input
                                      type="file"
                                      accept="image/*"
                                      multiple
                                      disabled={uploadingPhoto}
                                      onChange={handleUploadFotoDokumentasi}
                                      className="hidden"
                                    />
                                  </label>
                                )}
                              </div>
                            )}
                          </div>

                          {(selectedAgenda.dokumentasi_urls || []).length === 0 ? (
                            <div className="p-6 rounded-xl bg-slate-50 border border-dashed border-slate-300 text-center space-y-1.5">
                              <ImageIcon className="w-7 h-7 text-slate-400 mx-auto" />
                              <p className="text-xs text-slate-600 font-medium">
                                Belum ada foto dokumentasi untuk kegiatan ini.
                              </p>
                              {canEdit && (
                                <p className="text-[11px] text-slate-500">
                                  Klik tombol Unggah Foto untuk melampirkan dokumentasi acara.
                                </p>
                              )}
                            </div>
                          ) : (
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                              {(selectedAgenda.dokumentasi_urls || []).map((url, idx) => (
                                <div
                                  key={`${url}-${idx}`}
                                  className="relative group rounded-xl border border-slate-200 overflow-hidden bg-slate-100 aspect-[4/3]"
                                >
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img
                                    src={url}
                                    alt={`Dokumentasi ${selectedAgenda.judul} ${idx + 1}`}
                                    referrerPolicy="no-referrer"
                                    onClick={() =>
                                      setLightboxUrl({
                                        url,
                                        title: `${selectedAgenda.judul} — Foto ${idx + 1}`,
                                      })
                                    }
                                    className="w-full h-full object-cover cursor-pointer"
                                  />
                                  {canEdit && (
                                    <button
                                      type="button"
                                      onClick={() => handleDeleteFotoDokumentasi(url)}
                                      aria-label="Hapus foto dokumentasi"
                                      className="absolute top-1.5 right-1.5 p-1.5 rounded-lg bg-slate-900/75 text-white hover:bg-rose-600 transition-colors"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}

                          <div className="space-y-2 border-t border-slate-200 pt-4">
                            <label className="block text-xs font-bold text-slate-800">
                              Notulensi / Catatan Hasil Kegiatan
                            </label>
                            <textarea
                              rows={4}
                              readOnly={!canEdit}
                              value={draftNotulensi}
                              onChange={(e) => {
                                setDraftNotulensi(e.target.value);
                                setDraftDirty(true);
                              }}
                              placeholder={
                                canEdit
                                  ? 'Catat ringkasan jalannya acara, estimasi kehadiran santri/tamu, pesan pengasuh, atau evaluasi untuk kegiatan berikutnya...'
                                  : 'Belum ada catatan notulensi.'
                              }
                              className="w-full p-3 text-xs sm:text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 read-only:bg-slate-50"
                            />
                            {canEdit && (
                              <div className="flex justify-end">
                                <button
                                  type="button"
                                  onClick={() => handleSaveDetailDraft()}
                                  disabled={savingDetail}
                                  className="min-h-[40px] px-4 py-2 siap-btn-primary disabled:opacity-60 text-xs font-bold rounded-xl inline-flex items-center gap-1.5"
                                >
                                  <Save className="w-3.5 h-3.5" />
                                  {savingDetail ? 'Menyimpan...' : 'Simpan Dokumentasi & Notulensi'}
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 2: FORMAT PENGISI (TEMPLATE BUILDER) */}
        {mainTab === 'format' && (
          <div className="space-y-4">
            <div className="bg-white p-5 rounded-2xl border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-sm sm:text-base font-bold text-slate-900">
                  Master Format Pengisi Kegiatan Pondok
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Atur jumlah dan urutan slot pengisi untuk tiap jenis kegiatan (contoh: Burdah dengan 1 Tawasul, 10 Fashl, dan Doa = 12 slot).
                </p>
              </div>
              {canEdit && (
                <button
                  type="button"
                  onClick={() => setFormatModal({ open: true, editing: null })}
                  className="min-h-[40px] px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
                >
                  <Plus className="w-4 h-4" />
                  Buat Format Baru
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {formats.map((fmt) => {
                const sortedSlots = [...fmt.slots].sort((a, b) => a.urutan - b.urutan);
                return (
                  <div
                    key={fmt.id}
                    className="bg-white rounded-2xl border border-slate-200 p-5 flex flex-col justify-between gap-4"
                  >
                    <div className="space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <span className="text-[11px] text-slate-500 block">
                            {fmt.kategori_default === 'event_besar'
                              ? 'Event Besar'
                              : 'Rutin Mingguan'}{' '}
                            &middot;{' '}
                            <span className="font-mono tabular-nums font-semibold siap-text-accent">
                              {sortedSlots.length} Slot Pengisi
                            </span>
                          </span>
                          <h3 className="text-sm font-bold text-slate-900 mt-0.5">
                            {fmt.nama_format}
                          </h3>
                        </div>
                      </div>

                      {fmt.deskripsi && (
                        <p className="text-xs text-slate-600">{fmt.deskripsi}</p>
                      )}

                      <div className="border-t border-slate-100 pt-2.5">
                        <span className="text-[11px] font-semibold text-slate-500 block mb-1.5">
                          Urutan Slot Pengisi:
                        </span>
                        <div className="max-h-40 overflow-y-auto space-y-1 pr-1">
                          {sortedSlots.map((slot) => (
                            <div
                              key={slot.id}
                              className="text-xs text-slate-700 flex items-center gap-2 py-0.5"
                            >
                              <span className="w-5 font-mono tabular-nums text-[11px] text-slate-400 shrink-0">
                                {String(slot.urutan).padStart(2, '0')}.
                              </span>
                              <span className="truncate">{slot.peran}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    {canEdit && (
                      <div className="border-t border-slate-100 pt-3 flex flex-wrap items-center justify-between gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            setAgendaModal({
                              open: true,
                              editing: null,
                              presetFormatId: fmt.id,
                            })
                          }
                          className="min-h-[36px] px-3 py-1.5 siap-btn-primary text-xs font-bold rounded-lg inline-flex items-center gap-1 whitespace-nowrap"
                        >
                          <CalendarPlus className="w-3.5 h-3.5" />
                          Jadwalkan
                        </button>

                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleDuplicateFormat(fmt)}
                            title="Duplikat format"
                            className="p-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setFormatModal({ open: true, editing: fmt })}
                            title="Ubah urutan & slot"
                            className="p-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setDeleteConfirm({
                                kind: 'format',
                                id: fmt.id,
                                label: fmt.nama_format,
                              })
                            }
                            title="Hapus format"
                            className="p-2 rounded-lg border border-rose-200 text-rose-600 hover:bg-rose-50"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* TAB 3: ARSIP & DOKUMENTASI */}
        {mainTab === 'arsip' && (
          <div className="space-y-4">
            <div className="bg-white p-4 rounded-2xl border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-bold text-slate-900">
                  Arsip Kegiatan Terlaksana &amp; Dokumentasi
                </h2>
                <p className="text-xs text-slate-500">
                  Menampilkan kegiatan selesai dan galeri dokumentasi per bulan.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="month"
                  value={archiveMonth}
                  onChange={(e) => setArchiveMonth(e.target.value)}
                  className="min-h-[38px] px-3 py-1.5 text-xs font-mono tabular-nums border border-slate-200 rounded-xl bg-white"
                />
                {archiveMonth && (
                  <button
                    type="button"
                    onClick={() => setArchiveMonth('')}
                    className="min-h-[38px] px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl"
                  >
                    Semua Bulan
                  </button>
                )}
              </div>
            </div>

            {archiveAgendas.length === 0 ? (
              <div className="bg-white p-10 rounded-2xl border border-slate-200 text-center space-y-2">
                <FileText className="w-8 h-8 text-slate-400 mx-auto" />
                <p className="text-xs font-semibold text-slate-700">
                  Belum ada arsip kegiatan selesai atau dokumentasi pada periode ini.
                </p>
                <p className="text-[11px] text-slate-500">
                  Ubah status kegiatan menjadi &ldquo;Selesai&rdquo; atau unggah foto dokumentasi pada menu Agenda &amp; Jadwal.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {archiveAgendas.map((item) => {
                  const prog = countPengisiProgress(item.pengisi_list);
                  return (
                    <div
                      key={item.id}
                      className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <span className="text-[11px] text-slate-500 block">
                            {formatHariTanggalIndo(item.tanggal)} &middot; {item.lokasi}
                          </span>
                          <h3 className="text-sm font-bold text-slate-900 mt-0.5">
                            {item.judul}
                          </h3>
                        </div>
                        <span className="px-2 py-0.5 rounded-md border text-[11px] font-semibold siap-soft-box whitespace-nowrap">
                          {STATUS_KEGIATAN_META[item.status].label}
                        </span>
                      </div>

                      {item.notulensi && (
                        <p className="text-xs text-slate-600 bg-slate-50 border border-slate-100 rounded-xl p-3">
                          {item.notulensi}
                        </p>
                      )}

                      {(item.dokumentasi_urls || []).length > 0 && (
                        <div className="grid grid-cols-4 gap-2">
                          {(item.dokumentasi_urls || []).map((url, idx) => (
                            /* eslint-disable-next-line @next/next/no-img-element */
                            <img
                              key={`${url}-${idx}`}
                              src={url}
                              alt={`${item.judul} ${idx + 1}`}
                              referrerPolicy="no-referrer"
                              onClick={() =>
                                setLightboxUrl({
                                  url,
                                  title: `${item.judul} — Foto ${idx + 1}`,
                                })
                              }
                              className="w-full aspect-[4/3] object-cover rounded-lg border border-slate-200 cursor-pointer"
                            />
                          ))}
                        </div>
                      )}

                      <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2 text-xs">
                        <span className="text-slate-500 tabular-nums">
                          Pengisi: {prog.terisi}/{prog.total} slot &middot; PJ:{' '}
                          {item.penanggung_jawab || '-'}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedAgendaId(item.id);
                            setMainTab('agenda');
                            setDetailTab('dokumentasi');
                            setMobileShowDetail(true);
                          }}
                          className="font-semibold siap-text-accent hover:underline whitespace-nowrap"
                        >
                          Buka Detail
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ======================================================= */}
      {/* MODALS                                                  */}
      {/* ======================================================= */}

      {agendaModal.open && (
        <KegiatanAgendaModal
          initialData={
            agendaModal.editing
              ? agendaModal.editing
              : agendaModal.presetFormatId
              ? ({
                  id: '',
                  kode_kegiatan: '',
                  judul: '',
                  kategori:
                    formats.find((f) => f.id === agendaModal.presetFormatId)
                      ?.kategori_default || 'rutin',
                  format_id: agendaModal.presetFormatId,
                  format_nama: '',
                  tanggal: todayStr,
                  jam_mulai: '20:00',
                  jam_selesai: '21:30',
                  lokasi: 'Masjid / Musholla Utama',
                  penanggung_jawab: '',
                  status: 'terjadwal',
                  pengisi_list: [],
                  rundown_list: [],
                  panitia_list: [],
                  notulensi: '',
                  dokumentasi_urls: [],
                  catatan: '',
                  updated_at: '',
                } as KegiatanAgendaItem)
              : null
          }
          todayStr={todayStr}
          formats={formats}
          existingAgendas={agendas}
          personelOptions={personelOptions}
          onClose={() => setAgendaModal({ open: false, editing: null })}
          onSave={async (payload) => {
            const actualEdit = Boolean(agendaModal.editing);
            await handleSaveAgenda(payload, actualEdit);
          }}
        />
      )}

      {formatModal.open && (
        <KegiatanFormatModal
          initialData={formatModal.editing}
          onClose={() => setFormatModal({ open: false, editing: null })}
          onSave={handleSaveFormat}
        />
      )}

      {/* MODAL DUPLIKAT JADWAL */}
      {duplicateModal && (
        <div className="print:hidden fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-[1px] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl w-full max-w-md p-5 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-bold text-slate-900">Duplikat Jadwal Kegiatan</h3>
              <button
                type="button"
                onClick={() => setDuplicateModal(null)}
                className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-slate-600">
              Buat jadwal baru dari <strong>{duplicateModal.item.judul}</strong> lengkap dengan{' '}
              <strong>{duplicateModal.item.pengisi_list.length} slot pengisi</strong> dan rundownnya.
            </p>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Tanggal Pelaksanaan Baru
              </label>
              <input
                type="date"
                value={duplicateModal.targetDate}
                onChange={(e) =>
                  setDuplicateModal((prev) =>
                    prev ? { ...prev, targetDate: e.target.value } : null
                  )
                }
                className="w-full min-h-[40px] px-3 py-2 text-xs font-mono tabular-nums border border-slate-200 rounded-xl"
              />
            </div>
            <label className="flex items-start gap-2 text-xs text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={duplicateModal.clearPengisi}
                onChange={(e) =>
                  setDuplicateModal((prev) =>
                    prev ? { ...prev, clearPengisi: e.target.checked } : null
                  )
                }
                className="mt-0.5 rounded border-slate-300 siap-accent-control"
              />
              <span>
                Kosongkan nama pengisi (pertahankan daftar slot seperti Tawasul, Fashl 1–10, Doa
                untuk diisi petugas baru)
              </span>
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDuplicateModal(null)}
                className="min-h-[38px] px-4 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleConfirmDuplicate}
                className="min-h-[38px] px-4 py-1.5 text-xs font-bold siap-btn-primary rounded-xl"
              >
                Buat Jadwal Duplikat
              </button>
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
              Yakin ingin menghapus <strong>{deleteConfirm.label}</strong>? Tindakan ini tidak
              dapat dibatalkan.
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
                onClick={handleExecuteDelete}
                className="min-h-[38px] px-4 py-1.5 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl"
              >
                Ya, Hapus
              </button>
            </div>
          </div>
        </div>
      )}

      {/* LIGHTBOX FOTO */}
      {lightboxUrl && (
        <div
          className="print:hidden fixed inset-0 z-50 bg-slate-950/85 flex items-center justify-center p-4"
          onClick={() => setLightboxUrl(null)}
        >
          <div
            className="max-w-3xl w-full bg-white rounded-2xl overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between gap-2">
              <span className="text-xs font-bold text-slate-900 truncate">{lightboxUrl.title}</span>
              <button
                type="button"
                onClick={() => setLightboxUrl(null)}
                className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="bg-slate-900 flex items-center justify-center max-h-[75vh]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={lightboxUrl.url}
                alt={lightboxUrl.title}
                referrerPolicy="no-referrer"
                className="max-h-[75vh] w-auto object-contain"
              />
            </div>
          </div>
        </div>
      )}

      {/* ======================================================= */}
      {/* LEMBAR CETAK MADING / ARSIP (HANYA TAMPIL SAAT PRINT)   */}
      {/* ======================================================= */}
      {printTarget && (
        <div className="hidden print:block p-6 bg-white text-slate-900 space-y-5">
          <div className="border-b-2 border-slate-900 pb-3 text-center">
            <p className="text-xs font-bold uppercase tracking-wider">
              Pondok Pesantren An-Nur 1 Bululawang · Sie Kegiatan
            </p>
            <h1 className="text-xl font-bold mt-1">{printTarget.judul}</h1>
            <p className="text-xs mt-1">
              {formatHariTanggalIndo(printTarget.tanggal)} &middot; Pukul {printTarget.jam_mulai}
              {printTarget.jam_selesai ? `–${printTarget.jam_selesai}` : ''} WIB &middot; Tempat:{' '}
              {printTarget.lokasi}
            </p>
            {printTarget.penanggung_jawab && (
              <p className="text-xs mt-0.5">
                Penanggung Jawab: <strong>{printTarget.penanggung_jawab}</strong>
              </p>
            )}
          </div>

          {printTarget.pengisi_list.length > 0 && (
            <div>
              <h2 className="text-sm font-bold mb-2">A. Daftar Rincian Pengisi Acara</h2>
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-100">
                    <th className="border border-slate-400 px-2.5 py-1.5 text-center w-10">No</th>
                    <th className="border border-slate-400 px-2.5 py-1.5 text-left">Bagian / Slot</th>
                    <th className="border border-slate-400 px-2.5 py-1.5 text-left">Nama Pengisi</th>
                    <th className="border border-slate-400 px-2.5 py-1.5 text-left w-32">Keterangan</th>
                  </tr>
                </thead>
                <tbody>
                  {[...printTarget.pengisi_list]
                    .sort((a, b) => a.urutan - b.urutan)
                    .map((s) => (
                      <tr key={s.id}>
                        <td className="border border-slate-400 px-2.5 py-1.5 text-center font-mono">
                          {s.urutan}
                        </td>
                        <td className="border border-slate-400 px-2.5 py-1.5 font-semibold">
                          {s.peran}
                        </td>
                        <td className="border border-slate-400 px-2.5 py-1.5">
                          {s.petugas_nama || '.................................'}
                        </td>
                        <td className="border border-slate-400 px-2.5 py-1.5">
                          {s.catatan || ''}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}

          {printTarget.rundown_list.length > 0 && (
            <div>
              <h2 className="text-sm font-bold mb-2">B. Rundown Acara</h2>
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-100">
                    <th className="border border-slate-400 px-2.5 py-1.5 text-left w-32">Waktu (WIB)</th>
                    <th className="border border-slate-400 px-2.5 py-1.5 text-left">Sesi / Agenda</th>
                    <th className="border border-slate-400 px-2.5 py-1.5 text-left">PJ / Lokasi</th>
                  </tr>
                </thead>
                <tbody>
                  {printTarget.rundown_list.map((r) => (
                    <tr key={r.id}>
                      <td className="border border-slate-400 px-2.5 py-1.5 font-mono">
                        {r.jam_mulai}
                        {r.jam_selesai ? ` - ${r.jam_selesai}` : ''}
                      </td>
                      <td className="border border-slate-400 px-2.5 py-1.5 font-semibold">
                        {r.sesi}
                      </td>
                      <td className="border border-slate-400 px-2.5 py-1.5">
                        {[r.pj, r.lokasi].filter(Boolean).join(' · ') || '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {printTarget.kategori === 'event_besar' && printTarget.panitia_list.length > 0 && (
            <div>
              <h2 className="text-sm font-bold mb-2">C. Susunan Panitia Event Besar</h2>
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-100">
                    <th className="border border-slate-400 px-2.5 py-1.5 text-left">Jabatan / Seksi</th>
                    <th className="border border-slate-400 px-2.5 py-1.5 text-left">Nama Panitia</th>
                    <th className="border border-slate-400 px-2.5 py-1.5 text-left">Tugas</th>
                  </tr>
                </thead>
                <tbody>
                  {printTarget.panitia_list.map((p) => (
                    <tr key={p.id}>
                      <td className="border border-slate-400 px-2.5 py-1.5 font-semibold">
                        {p.jabatan}
                      </td>
                      <td className="border border-slate-400 px-2.5 py-1.5">
                        {p.nama || '.................................'}
                      </td>
                      <td className="border border-slate-400 px-2.5 py-1.5">{p.tugas}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
