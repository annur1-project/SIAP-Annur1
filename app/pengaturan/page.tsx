'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Building2,
  CheckCircle2,
  Copy,
  Database,
  Download,
  Landmark,
  Palette,
  Save,
  Settings,
  SlidersHorizontal,
  Sparkles,
  Wallet,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { useAuth, TransparencyBanner } from '@/lib/auth';
import { E_ANNURSATU_UPGRADE_SQL } from '@/lib/sql-schema';
import { supabase } from '@/lib/supabase';
import {
  applyThemeToDocument,
  DEFAULT_PENGATURAN_FORM,
  extractExtendedPayload,
  isKeamananThresholdValid,
  isMissingColumnError,
  mergeAturanOperasional,
  readExtendedLocal,
  sanitizeCorePayload,
  writeExtendedLocal,
  writeTemaLocal,
  type MasterPembayaranItem,
  type PengaturanFormState,
  type PengaturanTabKey,
  type TarifRiwayatItem,
} from '@/lib/pengaturan';
import {
  AturanDivisiTab,
  IdentitasRekeningTab,
  KeuanganTarifTab,
  LogoLegalitasTab,
  TemaAplikasiTab,
} from '@/components/PengaturanTabs';
import {
  NEW_MASTER_PEMBAYARAN_SEEDS,
  resolveCanonicalDompetForItem,
} from '@/lib/keuangan';

const TAB_ITEMS: Array<{
  key: PengaturanTabKey;
  label: string;
  shortLabel: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { key: 'identitas', label: '1. Identitas & Rekening', shortLabel: '1. Identitas', icon: Building2 },
  { key: 'legalitas', label: '2. Logo, Stempel & TTD', shortLabel: '2. Logo & Kop', icon: Landmark },
  { key: 'keuangan', label: '3. Keuangan & Tarif', shortLabel: '3. Keuangan', icon: Wallet },
  { key: 'operasional', label: '4. Aturan Divisi & Kamar', shortLabel: '4. Aturan & Kal', icon: SlidersHorizontal },
  { key: 'tema', label: '5. Tema & Tampilan', shortLabel: '5. Tema & Tampilan', icon: Palette },
];

export default function PengaturanPage() {
  const {
    canEditModule,
    isPimpinanInti,
    isBendahara,
    canManageAccounts,
    jabatanLabels,
  } = useAuth();
  const canEdit = canEditModule('pengaturan');
  const canManageFinance = isPimpinanInti || isBendahara;

  const [activeTab, setActiveTab] = useState<PengaturanTabKey>('identitas');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingField, setUploadingField] = useState<string | null>(null);
  const [togglingItemId, setTogglingItemId] = useState<string | null>(null);
  const [todayStr, setTodayStr] = useState('');
  const [showSqlCard, setShowSqlCard] = useState(false);

  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const showToast = (type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  };

  const [formData, setFormData] = useState<PengaturanFormState>(DEFAULT_PENGATURAN_FORM);
  const [savedSnapshot, setSavedSnapshot] = useState<string>(JSON.stringify(DEFAULT_PENGATURAN_FORM));

  // Master Pembayaran & Riwayat Tarif
  const [masterItems, setMasterItems] = useState<MasterPembayaranItem[]>([]);
  const [riwayatMap, setRiwayatMap] = useState<Record<string, TarifRiwayatItem[]>>({});

  // Modal Edit Nominal + Tanggal Berlaku
  const [editTarifItem, setEditTarifItem] = useState<MasterPembayaranItem | null>(null);
  const [newNominal, setNewNominal] = useState<number>(0);
  const [berlakuMulai, setBerlakuMulai] = useState<string>('');
  const [catatanPerubahan, setCatatanPerubahan] = useState<string>('');

  // Modal Tambah Kategori Pembayaran Baru
  const [showModalBaru, setShowModalBaru] = useState(false);
  const [newItemForm, setNewItemForm] = useState({
    nama_item: '',
    tipe_periode: 'tahunan' as 'bulanan' | 'tahunan',
    dompet_tujuan: 'operasional',
    nominal_awal: 0,
    berlaku_mulai: '',
    wajib_ndalem: false,
  });

  const hasUnsavedChanges = useMemo(
    () => JSON.stringify(formData) !== savedSnapshot,
    [formData, savedSnapshot]
  );

  const loadAllData = async (showSpinner = false) => {
    if (showSpinner) setLoading(true);
    const [{ data: setRow }, { data: items }, { data: riwayat }] =
      await Promise.all([
        supabase.from('pengaturan_aplikasi').select('*').eq('id', 1).maybeSingle(),
        supabase.from('master_pembayaran').select('*').order('urutan', { ascending: true }),
        supabase
          .from('master_pembayaran_riwayat')
          .select('*')
          .order('berlaku_mulai', { ascending: false }),
      ]);

    const localExt = readExtendedLocal();
    const rowObj = (setRow || {}) as Record<string, unknown>;

    const nextForm: PengaturanFormState = {
      ...DEFAULT_PENGATURAN_FORM,
      nama_pesantren: String(rowObj.nama_pesantren ?? DEFAULT_PENGATURAN_FORM.nama_pesantren),
      alamat_lengkap: String(rowObj.alamat_lengkap ?? DEFAULT_PENGATURAN_FORM.alamat_lengkap),
      no_telepon: String(rowObj.no_telepon ?? DEFAULT_PENGATURAN_FORM.no_telepon),
      email_resmi: String(rowObj.email_resmi ?? DEFAULT_PENGATURAN_FORM.email_resmi),
      slogan: String(rowObj.slogan ?? DEFAULT_PENGATURAN_FORM.slogan),
      logo_url: String(rowObj.logo_url ?? ''),
      logo_watermark_url: String(rowObj.logo_watermark_url ?? ''),
      stempel_url: String(rowObj.stempel_url ?? ''),
      nama_pengasuh: String(rowObj.nama_pengasuh ?? DEFAULT_PENGATURAN_FORM.nama_pengasuh),
      ttd_pengasuh_url: String(rowObj.ttd_pengasuh_url ?? ''),
      nama_kepala_pondok: String(
        rowObj.nama_kepala_pondok ?? DEFAULT_PENGATURAN_FORM.nama_kepala_pondok
      ),
      ttd_kepala_pondok_url: String(rowObj.ttd_kepala_pondok_url ?? ''),
      nama_sekretaris: String(rowObj.nama_sekretaris ?? DEFAULT_PENGATURAN_FORM.nama_sekretaris),
      ttd_sekretaris_url: String(rowObj.ttd_sekretaris_url ?? ''),
      nama_bendahara: String(rowObj.nama_bendahara ?? DEFAULT_PENGATURAN_FORM.nama_bendahara),
      ttd_bendahara_url: String(rowObj.ttd_bendahara_url ?? ''),
      jatuh_tempo_tanggal: Number(rowObj.jatuh_tempo_tanggal ?? 10),
      saldo_awal_pendaftaran: Number(rowObj.saldo_awal_pendaftaran ?? 0),
      saldo_awal_operasional: Number(rowObj.saldo_awal_operasional ?? 0),
      saldo_awal_kas_pondok: Number(rowObj.saldo_awal_kas_pondok ?? 0),
      saldo_awal_mda: Number(rowObj.saldo_awal_mda ?? 0),
      kota_surat: String(
        rowObj.kota_surat ?? localExt?.kota_surat ?? DEFAULT_PENGATURAN_FORM.kota_surat
      ),
      rekening_bank: String(
        rowObj.rekening_bank ?? localExt?.rekening_bank ?? DEFAULT_PENGATURAN_FORM.rekening_bank
      ),
      rekening_nomor: String(
        rowObj.rekening_nomor ?? localExt?.rekening_nomor ?? DEFAULT_PENGATURAN_FORM.rekening_nomor
      ),
      rekening_atas_nama: String(
        rowObj.rekening_atas_nama ??
          localExt?.rekening_atas_nama ??
          DEFAULT_PENGATURAN_FORM.rekening_atas_nama
      ),
      kop_surat_url: String(
        rowObj.kop_surat_url ?? localExt?.kop_surat_url ?? ''
      ),
      aturan_operasional: mergeAturanOperasional(
        rowObj.aturan_operasional ?? localExt?.aturan_operasional
      ),
    };

    setFormData(nextForm);
    setSavedSnapshot(JSON.stringify(nextForm));
    applyThemeToDocument(nextForm.aturan_operasional.tema, { logoUrl: nextForm.logo_url });

    const today = new Date().toISOString().split('T')[0];
    setTodayStr(today);
    setBerlakuMulai((prev) => prev || today);
    setNewItemForm((prev) => (prev.berlaku_mulai ? prev : { ...prev, berlaku_mulai: today }));

    const rawItems = (items as MasterPembayaranItem[]) || [];
    const existingKodes = new Set(rawItems.map((m) => m.kode));
    const missingSeeds = NEW_MASTER_PEMBAYARAN_SEEDS.filter((seed) => !existingKodes.has(seed.kode));

    let effectiveItems = [...rawItems];
    const grouped: Record<string, TarifRiwayatItem[]> = {};
    ((riwayat as TarifRiwayatItem[]) || []).forEach((r) => {
      if (!grouped[r.item_id]) grouped[r.item_id] = [];
      grouped[r.item_id].push(r);
    });

    if (missingSeeds.length > 0) {
      let syncedFromDb = false;

      if (canManageFinance) {
        const { data: upserted } = await supabase
          .from('master_pembayaran')
          .upsert(
            missingSeeds.map((seed) => ({
              kode: seed.kode,
              nama_item: seed.nama_item,
              tipe_periode: seed.tipe_periode,
              kategori_santri: seed.kategori_santri,
              dompet_tujuan: seed.dompet_tujuan,
              wajib_ndalem: seed.wajib_ndalem,
              aktif: true,
              urutan: seed.urutan,
            })),
            { onConflict: 'kode' }
          )
          .select('*');

        if (Array.isArray(upserted) && upserted.length > 0) {
          syncedFromDb = true;
          const upsertedItems = upserted as MasterPembayaranItem[];
          const riwayatSeeds = upsertedItems
            .filter((it) => !grouped[it.id] || grouped[it.id].length === 0)
            .map((it) => {
              const seedInfo = NEW_MASTER_PEMBAYARAN_SEEDS.find((s) => s.kode === it.kode);
              return {
                item_id: it.id,
                nominal: seedInfo?.defaultNominal ?? 50000,
                berlaku_mulai: '2026-07-01',
                catatan: 'Tarif awal pos pembayaran baru',
              };
            });

          if (riwayatSeeds.length > 0) {
            const { data: insertedRiwayat } = await supabase
              .from('master_pembayaran_riwayat')
              .insert(riwayatSeeds)
              .select('*');
            ((insertedRiwayat as TarifRiwayatItem[]) || []).forEach((r) => {
              if (!grouped[r.item_id]) grouped[r.item_id] = [];
              grouped[r.item_id].push(r);
            });
          }

          upsertedItems.forEach((it) => {
            if (!existingKodes.has(it.kode)) {
              effectiveItems.push(it);
              existingKodes.add(it.kode);
            }
          });
        }
      }

      if (!syncedFromDb) {
        missingSeeds.forEach((seed) => {
          const virtualId = `seed-${seed.kode}`;
          effectiveItems.push({
            id: virtualId,
            kode: seed.kode,
            nama_item: seed.nama_item,
            tipe_periode: seed.tipe_periode,
            kategori_santri: seed.kategori_santri,
            dompet_tujuan: seed.dompet_tujuan,
            wajib_ndalem: seed.wajib_ndalem,
            aktif: true,
            urutan: seed.urutan,
          });
          grouped[virtualId] = [
            {
              id: `seed-riwayat-${seed.kode}`,
              item_id: virtualId,
              nominal: seed.defaultNominal,
              berlaku_mulai: '2026-07-01',
              catatan: 'Tarif awal pos pembayaran baru',
            },
          ];
        });
      }
    }

    effectiveItems = effectiveItems
      .map((item) => ({
        ...item,
        dompet_tujuan: resolveCanonicalDompetForItem(item.kode, item.dompet_tujuan),
      }))
      .sort((a, b) => Number(a.urutan || 0) - Number(b.urutan || 0));

    setMasterItems(effectiveItems);
    setRiwayatMap(grouped);
    setLoading(false);
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadAllData(false);
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  const handleUpdateField = <K extends keyof PengaturanFormState>(
    field: K,
    value: PengaturanFormState[K]
  ) => {
    if (!canEdit && !canManageFinance) return;
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleUploadImage = async (
    e: React.ChangeEvent<HTMLInputElement>,
    fieldName: keyof PengaturanFormState
  ) => {
    if (!canEdit) return;
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingField(fieldName);
    const ext = file.name.split('.').pop();
    const fileName = `${fieldName}_${Date.now()}.${ext}`;
    const { error } = await supabase.storage
      .from('ttd-stempel')
      .upload(fileName, file, { upsert: true });
    setUploadingField(null);
    if (error) {
      showToast('error', 'Gagal unggah gambar: ' + error.message);
      return;
    }
    const { data } = supabase.storage.from('ttd-stempel').getPublicUrl(fileName);
    setFormData((prev) => ({ ...prev, [fieldName]: data.publicUrl }));
    showToast('success', 'Gambar terunggah. Tekan Simpan Pengaturan untuk menerapkan.');
  };

  const handleSavePengaturan = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!canEdit && !(activeTab === 'keuangan' && canManageFinance)) return;
    if (!isKeamananThresholdValid(formData.aturan_operasional.keamanan)) {
      setActiveTab('operasional');
      showToast('error', 'Ambang poin keamanan harus menanjak: SP 1 < SP 2 < SP 3.');
      return;
    }

    setSaving(true);
    const core = sanitizeCorePayload(formData);
    const ext = extractExtendedPayload(formData);
    const updatedAt = new Date().toISOString();

    const { error: fullError } = await supabase.from('pengaturan_aplikasi').upsert({
      id: 1,
      ...core,
      ...ext,
      updated_at: updatedAt,
    });

    if (fullError && isMissingColumnError(fullError)) {
      const { error: coreError } = await supabase.from('pengaturan_aplikasi').upsert({
        id: 1,
        ...core,
        updated_at: updatedAt,
      });
      setSaving(false);
      if (coreError) {
        showToast('error', 'Gagal menyimpan pengaturan: ' + coreError.message);
        return;
      }
      writeExtendedLocal(ext);
      writeTemaLocal(formData.aturan_operasional.tema);
      applyThemeToDocument(formData.aturan_operasional.tema, { logoUrl: formData.logo_url });
      setSavedSnapshot(JSON.stringify(formData));
      showToast(
        'success',
        'Pengaturan inti tersimpan ke database & aturan lanjutan tersimpan lokal.'
      );
      return;
    }

    setSaving(false);
    if (fullError) {
      showToast('error', 'Gagal menyimpan: ' + fullError.message);
      return;
    }

    writeExtendedLocal(ext);
    writeTemaLocal(formData.aturan_operasional.tema);
    applyThemeToDocument(formData.aturan_operasional.tema, { logoUrl: formData.logo_url });
    setSavedSnapshot(JSON.stringify(formData));
    showToast('success', 'Seluruh pengaturan pondok, keuangan, legalitas, divisi & tema tersimpan!');
  };

  const handleSaveEditTarif = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editTarifItem || !canManageFinance) return;

    setSaving(true);
    let targetItemId = editTarifItem.id;

    if (targetItemId.startsWith('seed-')) {
      const { data: ensured, error: upsertErr } = await supabase
        .from('master_pembayaran')
        .upsert(
          [
            {
              kode: editTarifItem.kode,
              nama_item: editTarifItem.nama_item,
              tipe_periode: editTarifItem.tipe_periode,
              kategori_santri: editTarifItem.kategori_santri || 'semua',
              dompet_tujuan: resolveCanonicalDompetForItem(
                editTarifItem.kode,
                editTarifItem.dompet_tujuan
              ),
              wajib_ndalem: editTarifItem.wajib_ndalem,
              aktif: editTarifItem.aktif,
              urutan: editTarifItem.urutan,
            },
          ],
          { onConflict: 'kode' }
        )
        .select('id')
        .single();
      if (upsertErr || !ensured) {
        setSaving(false);
        showToast(
          'error',
          'Gagal menyinkronkan pos pembayaran: ' + (upsertErr?.message || 'Error DB')
        );
        return;
      }
      targetItemId = String((ensured as { id: string }).id);
    }

    const { error } = await supabase.from('master_pembayaran_riwayat').insert([
      {
        item_id: targetItemId,
        nominal: Number(newNominal),
        berlaku_mulai: berlakuMulai || todayStr,
        catatan: catatanPerubahan || `Penyesuaian tarif per ${berlakuMulai || todayStr}`,
      },
    ]);

    if (!error && editTarifItem.kode.startsWith('syahriyah_')) {
      const targetKategori = editTarifItem.kategori_santri;
      if (targetKategori === 'vip') {
        await supabase
          .from('santri')
          .update({ tarif_syahriyah: Number(newNominal) })
          .ilike('kamar', '%VIP%');
      } else if (targetKategori === 'ndalem') {
        await supabase
          .from('santri')
          .update({ tarif_syahriyah: Number(newNominal) })
          .eq('kamar', 'NDALEM');
      } else if (targetKategori === 'reguler') {
        await supabase
          .from('santri')
          .update({ tarif_syahriyah: Number(newNominal) })
          .not('kamar', 'ilike', '%VIP%')
          .neq('kamar', 'NDALEM');
      }
    }

    setSaving(false);
    if (error) {
      showToast('error', 'Gagal menyimpan penyesuaian tarif: ' + error.message);
    } else {
      setEditTarifItem(null);
      setCatatanPerubahan('');
      showToast('success', `Tarif ${editTarifItem.nama_item} diperbarui mulai ${berlakuMulai}!`);
      void loadAllData(false);
    }
  };

  const handleCreateItemBaru = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManageFinance || !newItemForm.nama_item.trim()) return;

    setSaving(true);
    const slugKode = `custom_${newItemForm.nama_item
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '')}_${Date.now().toString().slice(-4)}`;

    const { data: created, error } = await supabase
      .from('master_pembayaran')
      .insert([
        {
          kode: slugKode,
          nama_item: newItemForm.nama_item.trim(),
          tipe_periode: newItemForm.tipe_periode,
          kategori_santri: 'semua',
          dompet_tujuan: newItemForm.dompet_tujuan,
          wajib_ndalem: newItemForm.wajib_ndalem,
          aktif: true,
          urutan: masterItems.length + 1,
        },
      ])
      .select()
      .single();

    if (error || !created) {
      setSaving(false);
      showToast('error', 'Gagal menambah kategori: ' + (error?.message || 'Unknown error'));
      return;
    }

    await supabase.from('master_pembayaran_riwayat').insert([
      {
        item_id: created.id,
        nominal: Number(newItemForm.nominal_awal),
        berlaku_mulai: newItemForm.berlaku_mulai || todayStr,
        catatan: 'Kategori pembayaran baru',
      },
    ]);

    setSaving(false);
    setShowModalBaru(false);
    setNewItemForm({
      nama_item: '',
      tipe_periode: 'tahunan',
      dompet_tujuan: 'operasional',
      nominal_awal: 0,
      berlaku_mulai: todayStr,
      wajib_ndalem: false,
    });
    showToast('success', `Kategori "${created.nama_item}" ditambahkan ke matriks Keuangan!`);
    void loadAllData(false);
  };

  const handleToggleItemAktif = async (item: MasterPembayaranItem) => {
    if (!canManageFinance) return;
    setTogglingItemId(item.id);
    const nextStatus = !item.aktif;

    if (item.id.startsWith('seed-')) {
      const { error } = await supabase.from('master_pembayaran').upsert(
        [
          {
            kode: item.kode,
            nama_item: item.nama_item,
            tipe_periode: item.tipe_periode,
            kategori_santri: item.kategori_santri || 'semua',
            dompet_tujuan: resolveCanonicalDompetForItem(item.kode, item.dompet_tujuan),
            wajib_ndalem: item.wajib_ndalem,
            aktif: nextStatus,
            urutan: item.urutan,
          },
        ],
        { onConflict: 'kode' }
      );
      setTogglingItemId(null);
      if (error) {
        showToast('error', 'Gagal mengubah status item: ' + error.message);
        return;
      }
      showToast(
        'success',
        `"${item.nama_item}" sekarang ${nextStatus ? 'Aktif' : 'Nonaktif'}.`
      );
      void loadAllData(false);
      return;
    }

    const { error } = await supabase
      .from('master_pembayaran')
      .update({ aktif: nextStatus })
      .eq('id', item.id);
    setTogglingItemId(null);
    if (error) {
      showToast('error', 'Gagal mengubah status item: ' + error.message);
      return;
    }
    setMasterItems((prev) =>
      prev.map((m) => (m.id === item.id ? { ...m, aktif: nextStatus } : m))
    );
    showToast(
      'success',
      `"${item.nama_item}" sekarang ${nextStatus ? 'Aktif' : 'Nonaktif'}.`
    );
  };

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto space-y-5">
        <div className="h-20 rounded-2xl bg-slate-200/70 animate-pulse" />
        <div className="h-12 rounded-xl bg-slate-200/70 animate-pulse" />
        <div className="h-80 rounded-2xl bg-slate-200/70 animate-pulse" />
      </div>
    );
  }

  return (
    <div className="space-y-5 max-w-6xl mx-auto pb-24">
      {toast && (
        <div
          className={`fixed top-5 right-5 z-50 px-4 py-3 rounded-xl shadow-lg text-xs font-bold flex items-center gap-2 border ${
            toast.type === 'success'
              ? 'bg-emerald-900 text-white border-emerald-700'
              : 'bg-rose-600 text-white border-rose-700'
          }`}
        >
          {toast.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 shrink-0" />
          )}
          {toast.message}
        </div>
      )}

      {/* HEADER UTAMA */}
      <div className="bg-white p-4 sm:p-6 rounded-2xl border border-slate-200 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <Settings className="w-5 h-5 text-emerald-700 shrink-0" />
            Pengaturan Aplikasi Pondok
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Pusat identitas resmi, kop surat JPG, legalitas TTD, tarif &amp; tema &middot; Jabatan:{' '}
            <span className="font-semibold text-slate-700">
              {jabatanLabels.length > 0 ? jabatanLabels.join(', ') : 'Pengurus Aktif'}
            </span>
          </p>
        </div>

        <div className="w-full sm:w-auto flex flex-wrap items-center gap-2 shrink-0">
          {canManageAccounts && (
            <>
              <Link
                href="/tools/pwa-icon"
                className="min-h-[40px] px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl inline-flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
              >
                <Sparkles className="w-3.5 h-3.5 text-emerald-700" />
                Studio Ikon PWA
              </Link>
              <button
                type="button"
                onClick={() => setShowSqlCard((v) => !v)}
                className="min-h-[40px] px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl inline-flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Database className="w-3.5 h-3.5 text-emerald-700" />
                Skema SQL &amp; RLS
              </button>
            </>
          )}
          {(canEdit || (activeTab === 'keuangan' && canManageFinance)) && (
            <button
              type="button"
              disabled={saving}
              onClick={() => handleSavePengaturan()}
              className="w-full sm:w-auto min-h-[40px] px-4 py-2 bg-emerald-700 hover:bg-emerald-800 disabled:opacity-60 text-white text-xs font-bold rounded-xl inline-flex items-center justify-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Save className="w-4 h-4" />
              {saving ? 'Menyimpan...' : 'Simpan Pengaturan'}
            </button>
          )}
        </div>
      </div>

      <TransparencyBanner
        moduleLabel="Pengaturan Aplikasi Pondok"
        isReadOnly={!canEdit}
        extraNote={
          isBendahara && !canEdit
            ? 'Khusus Tab 3 (Keuangan & Tarif) tetap dapat Anda kelola sebagai Bendahara.'
            : undefined
        }
      />

      {canManageAccounts && showSqlCard && (
        <div className="bg-slate-900 text-slate-100 rounded-2xl border border-slate-700 p-4 sm:p-5 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <Database className="w-4 h-4 text-emerald-400" />
                Skrip Migrasi Supabase PostgreSQL &amp; RLS (e-annursatu)
              </h2>
              <p className="text-xs text-slate-300 mt-0.5">
                Salin dan jalankan di Supabase SQL Editor untuk mengaktifkan tabel Kebersihan, Koperasi, Dapur 2 Buku, dan RLS Multi-Jabatan.
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(E_ANNURSATU_UPGRADE_SQL);
                    showToast('success', 'Skrip SQL berhasil disalin ke clipboard.');
                  } catch {
                    showToast('error', 'Gagal menyalin skrip SQL.');
                  }
                }}
                className="min-h-[36px] px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Copy className="w-3.5 h-3.5" />
                Salin SQL
              </button>
              <button
                type="button"
                onClick={() => {
                  const blob = new Blob([E_ANNURSATU_UPGRADE_SQL], { type: 'text/sql;charset=utf-8' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = 'e-annursatu-supabase-upgrade.sql';
                  a.click();
                  URL.revokeObjectURL(url);
                }}
                className="min-h-[36px] px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-100 text-xs font-semibold inline-flex items-center gap-1.5 border border-slate-600 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                Unduh .sql
              </button>
            </div>
          </div>
          <pre className="max-h-56 overflow-auto rounded-xl bg-slate-950 p-3 text-[11px] font-mono text-emerald-200 border border-slate-800">
            {E_ANNURSATU_UPGRADE_SQL}
          </pre>
        </div>
      )}

      {/* NAVIGASI 5 TAB (Rapi di HP & Desktop) */}
      <div
        role="tablist"
        aria-label="Kategori Pengaturan Aplikasi"
        className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-1.5 p-1.5 bg-slate-100 rounded-xl border border-slate-200"
      >
        {TAB_ITEMS.map((tab, idx) => {
          const Icon = tab.icon;
          const active = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setActiveTab(tab.key)}
              className={`min-h-[40px] px-3 py-2 rounded-lg text-xs font-semibold inline-flex items-center justify-center sm:justify-start gap-1.5 transition-colors whitespace-nowrap cursor-pointer ${
                idx === TAB_ITEMS.length - 1 ? 'col-span-2 sm:col-span-1' : ''
              } ${
                active
                  ? 'bg-white text-emerald-800 shadow-xs border border-slate-200/80'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span className="sm:hidden">{tab.shortLabel}</span>
              <span className="hidden sm:inline">{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* KONTEN TAB AKTIF */}
      {activeTab === 'identitas' && (
        <fieldset disabled={!canEdit} className="border-0 p-0 m-0 min-w-0">
          <IdentitasRekeningTab formData={formData} onUpdateField={handleUpdateField} />
        </fieldset>
      )}

      {activeTab === 'legalitas' && (
        <fieldset disabled={!canEdit} className="border-0 p-0 m-0 min-w-0">
          <LogoLegalitasTab
            formData={formData}
            onUpdateField={handleUpdateField}
            onUploadImage={handleUploadImage}
            uploadingField={uploadingField}
          />
        </fieldset>
      )}

      {activeTab === 'keuangan' && (
        <KeuanganTarifTab
          formData={formData}
          onUpdateField={handleUpdateField}
          onUpdateTahunAjaran={(val) => {
            if (!canManageFinance && !canEdit) return;
            setFormData((prev) => ({
              ...prev,
              aturan_operasional: { ...prev.aturan_operasional, tahun_ajaran_aktif: val },
            }));
          }}
          onUpdatePendaftaran={(updater) => {
            if (!canManageFinance && !canEdit) return;
            setFormData((prev) => ({
              ...prev,
              aturan_operasional: {
                ...prev.aturan_operasional,
                pendaftaran: updater(prev.aturan_operasional.pendaftaran),
              },
            }));
          }}
          canManageFinance={canManageFinance}
          masterItems={masterItems}
          riwayatMap={riwayatMap}
          todayStr={todayStr}
          onOpenNewModal={() => {
            if (canManageFinance) setShowModalBaru(true);
          }}
          onOpenEditTarif={(item, nominalAktif) => {
            if (!canManageFinance) return;
            setEditTarifItem(item);
            setNewNominal(nominalAktif);
            setBerlakuMulai(todayStr);
            setCatatanPerubahan('');
          }}
          onToggleItemAktif={handleToggleItemAktif}
          togglingItemId={togglingItemId}
        />
      )}

      {activeTab === 'operasional' && (
        <fieldset disabled={!canEdit} className="border-0 p-0 m-0 min-w-0">
          <AturanDivisiTab
            formData={formData}
            onUpdateAturan={(updater) => {
              if (!canEdit) return;
              setFormData((prev) => ({
                ...prev,
                aturan_operasional: updater(prev.aturan_operasional),
              }));
            }}
          />
        </fieldset>
      )}

      {activeTab === 'tema' && (
        <fieldset disabled={!canEdit} className="border-0 p-0 m-0 min-w-0">
          <TemaAplikasiTab
            tema={formData.aturan_operasional.tema}
            logoUrl={formData.logo_url}
            onUpdateTema={(updater) => {
              if (!canEdit) return;
              const nextTema = updater(formData.aturan_operasional.tema);
              setFormData((prev) => ({
                ...prev,
                aturan_operasional: {
                  ...prev.aturan_operasional,
                  tema: nextTema,
                },
              }));
              applyThemeToDocument(nextTema, { logoUrl: formData.logo_url });
            }}
          />
        </fieldset>
      )}

      {/* STICKY SAVE BAR SAAT ADA PERUBAHAN BELUM DISIMPAN */}
      {hasUnsavedChanges && (canEdit || (activeTab === 'keuangan' && canManageFinance)) && (
        <div className="fixed bottom-16 md:bottom-5 inset-x-4 md:left-72 md:right-8 z-40 max-w-4xl mx-auto">
          <div className="bg-slate-900 text-white rounded-xl px-4 py-2.5 shadow-xl border border-slate-700 flex items-center justify-between gap-3">
            <span className="text-xs font-medium truncate">
              Ada perubahan pengaturan yang belum disimpan
            </span>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => {
                  const reverted = JSON.parse(savedSnapshot) as PengaturanFormState;
                  setFormData(reverted);
                  applyThemeToDocument(reverted.aturan_operasional.tema, {
                    logoUrl: reverted.logo_url,
                  });
                }}
                className="min-h-[36px] px-3 py-1.5 text-xs font-semibold text-slate-300 hover:text-white cursor-pointer whitespace-nowrap"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => handleSavePengaturan()}
                className="min-h-[36px] px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
              >
                <Save className="w-3.5 h-3.5" />
                {saving ? 'Menyimpan...' : 'Simpan Sekarang'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL EDIT NOMINAL + KONFIRMASI TANGGAL MULAI BERLAKU */}
      {editTarifItem && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden">
            <div className="bg-emerald-900 text-white px-6 py-4 flex justify-between items-center">
              <div>
                <h3 className="font-bold text-sm">Penyesuaian Nominal Tarif</h3>
                <span className="text-[11px] text-emerald-200">{editTarifItem.nama_item}</span>
              </div>
              <button
                type="button"
                onClick={() => setEditTarifItem(null)}
                aria-label="Tutup modal ubah tarif"
                className="text-emerald-200 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEditTarif} className="p-6 space-y-4 text-xs">
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-[11px] text-amber-900 leading-relaxed">
                <strong>Aturan Berlaku Surut Aman:</strong> Bulan/tagihan sebelum tanggal mulai berlaku tetap ditagih memakai tarif lama.
              </div>

              <div>
                <label htmlFor="nominal_baru" className="font-bold text-slate-700 block mb-1">
                  Nominal Baru (Rp) *
                </label>
                <input
                  id="nominal_baru"
                  type="number"
                  required
                  min={0}
                  value={newNominal}
                  onChange={(e) => setNewNominal(Number(e.target.value))}
                  className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl font-mono font-bold text-sm tabular-nums"
                />
              </div>

              <div>
                <label htmlFor="berlaku_mulai" className="font-bold text-slate-700 block mb-1">
                  Berlaku Mulai Tanggal *
                </label>
                <input
                  id="berlaku_mulai"
                  type="date"
                  required
                  value={berlakuMulai}
                  onChange={(e) => setBerlakuMulai(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl"
                />
              </div>

              <div>
                <label htmlFor="catatan_perubahan" className="font-semibold text-slate-700 block mb-1">
                  Catatan Penyesuaian (Opsional)
                </label>
                <input
                  id="catatan_perubahan"
                  type="text"
                  placeholder="Contoh: Penyesuaian hasil rapat pengurus"
                  value={catatanPerubahan}
                  onChange={(e) => setCatatanPerubahan(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditTarifItem(null)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 bg-emerald-700 hover:bg-emerald-800 text-white font-bold rounded-xl cursor-pointer"
                >
                  {saving ? 'Menyimpan...' : 'Konfirmasi Perubahan Tarif'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL TAMBAH KATEGORI PEMBAYARAN BARU */}
      {showModalBaru && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden">
            <div className="bg-emerald-900 text-white px-6 py-4 flex justify-between items-center">
              <h3 className="font-bold text-sm">Tambah Kategori Pembayaran Baru</h3>
              <button
                type="button"
                onClick={() => setShowModalBaru(false)}
                aria-label="Tutup modal tambah pembayaran"
                className="text-emerald-200 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateItemBaru} className="p-6 space-y-4 text-xs">
              <div>
                <label htmlFor="nama_item_baru" className="font-bold text-slate-700 block mb-1">
                  Nama Pembayaran *
                </label>
                <input
                  id="nama_item_baru"
                  type="text"
                  required
                  placeholder="Contoh: Seragam Pondok / Kitab Madin"
                  value={newItemForm.nama_item}
                  onChange={(e) => setNewItemForm({ ...newItemForm, nama_item: e.target.value })}
                  className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="tipe_periode_baru" className="font-bold text-slate-700 block mb-1">
                    Jenis Periode *
                  </label>
                  <select
                    id="tipe_periode_baru"
                    value={newItemForm.tipe_periode}
                    onChange={(e) =>
                      setNewItemForm({
                        ...newItemForm,
                        tipe_periode: e.target.value as 'bulanan' | 'tahunan',
                      })
                    }
                    className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl"
                  >
                    <option value="tahunan">Tahunan (Per Tahun Ajaran)</option>
                    <option value="bulanan">Bulanan (12 Bulan)</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="dompet_tujuan_baru" className="font-bold text-slate-700 block mb-1">
                    Masuk ke Dompet *
                  </label>
                  <select
                    id="dompet_tujuan_baru"
                    value={newItemForm.dompet_tujuan}
                    onChange={(e) => setNewItemForm({ ...newItemForm, dompet_tujuan: e.target.value })}
                    className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl"
                  >
                    <option value="operasional">2. Syahriyah &amp; Tahunan</option>
                    <option value="mda">4. Dompet MDA</option>
                    <option value="kas_pondok">3. Dompet Kas</option>
                    <option value="pendaftaran">1. Dompet Pendaftaran</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="nominal_awal_baru" className="font-bold text-slate-700 block mb-1">
                    Nominal (Rp) *
                  </label>
                  <input
                    id="nominal_awal_baru"
                    type="number"
                    required
                    min={0}
                    value={newItemForm.nominal_awal}
                    onChange={(e) =>
                      setNewItemForm({ ...newItemForm, nominal_awal: Number(e.target.value) })
                    }
                    className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl font-mono tabular-nums"
                  />
                </div>

                <div>
                  <label htmlFor="berlaku_mulai_baru" className="font-bold text-slate-700 block mb-1">
                    Berlaku Mulai *
                  </label>
                  <input
                    id="berlaku_mulai_baru"
                    type="date"
                    required
                    value={newItemForm.berlaku_mulai}
                    onChange={(e) => setNewItemForm({ ...newItemForm, berlaku_mulai: e.target.value })}
                    className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl"
                  />
                </div>
              </div>

              <label className="flex items-center gap-2 cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={newItemForm.wajib_ndalem}
                  onChange={(e) => setNewItemForm({ ...newItemForm, wajib_ndalem: e.target.checked })}
                />
                <span className="font-semibold text-slate-700">Wajib dibayar juga oleh Santri Ndalem</span>
              </label>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModalBaru(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 bg-emerald-700 hover:bg-emerald-800 text-white font-bold rounded-xl cursor-pointer"
                >
                  {saving ? 'Menyimpan...' : 'Simpan Kategori Baru'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}