'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  ArrowDown,
  ArrowUp,
  Building2,
  Calendar,
  CreditCard,
  Edit3,
  GraduationCap,
  History,
  Image as ImageIcon,
  Landmark,
  Lock,
  Monitor,
  Moon,
  Palette,
  Plus,
  RotateCcw,
  Save,
  ShieldAlert,
  Sparkles,
  Sun,
  ToggleLeft,
  ToggleRight,
  Trash2,
  Type,
  Upload,
  Wallet,
} from 'lucide-react';
import {
  addKamarItem,
  computeTotalSaldoAwal,
  DEFAULT_KAMAR_MASTER,
  DEFAULT_PROFIL_PONDOK_PSB,
  DEFAULT_SKEMA_PENDAFTARAN,
  DEFAULT_TEMA_APLIKASI,
  FONT_OPTIONS,
  getDynamicTahunAjaranAktif,
  getDynamicTahunPsbInfo,
  getTarifAktifFromRiwayat,
  hitungRincianPendaftaran,
  isKeamananThresholdValid,
  mergeProfilPondokPsb,
  moveKamarItem,
  NAMA_DOMPET_MAP,
  removeKamarItem,
  runThemeTransitionWithAnimation,
  THEME_PRESETS,
  writeTemaModeOverride,
  type MasterPembayaranItem,
  type PengaturanFormState,
  type ProfilPondokPsbConfig,
  type SkemaPendaftaranConfig,
  type TarifRiwayatItem,
  type TemaAplikasiConfig,
  type ThemeDensity,
  type ThemeFont,
  type ThemeMode,
  type ThemeRadius,
} from '@/lib/pengaturan';

const HARI_OPTIONS = ['Sabtu', 'Ahad', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat'];

function formatRp(val: number): string {
  return `Rp ${Number(val || 0).toLocaleString('id-ID')}`;
}

/* ========================================================================== */
/* TAB 1: IDENTITAS PESANTREN & REKENING RESMI                               */
/* ========================================================================== */
interface IdentitasRekeningTabProps {
  formData: PengaturanFormState;
  onUpdateField: <K extends keyof PengaturanFormState>(field: K, value: PengaturanFormState[K]) => void;
}

export function IdentitasRekeningTab({ formData, onUpdateField }: IdentitasRekeningTabProps) {
  return (
    <div className="space-y-6">
      <section className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 space-y-5">
        <div className="border-b border-slate-100 pb-3">
          <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <Building2 className="w-4 h-4 siap-text-accent shrink-0" />
            Profil &amp; Identitas Pesantren
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Dipakai secara otomatis pada Kop Surat resmi, Kuitansi Keuangan, Surat Izin Pulang, dan Pusat Laporan.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          <div>
            <label htmlFor="nama_pesantren" className="font-semibold text-slate-700 block mb-1.5">
              Nama Pesantren
            </label>
            <input
              id="nama_pesantren"
              type="text"
              value={formData.nama_pesantren}
              onChange={(e) => onUpdateField('nama_pesantren', e.target.value)}
              className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 siap-ring-focus"
            />
          </div>

          <div>
            <label htmlFor="kota_surat" className="font-semibold text-slate-700 block mb-1.5">
              Kota Penetapan Surat &amp; Pengesahan
            </label>
            <input
              id="kota_surat"
              type="text"
              placeholder="Contoh: Bululawang, Malang"
              value={formData.kota_surat}
              onChange={(e) => onUpdateField('kota_surat', e.target.value)}
              className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600/20 focus:border-emerald-700"
            />
          </div>

          <div>
            <label htmlFor="no_telepon" className="font-semibold text-slate-700 block mb-1.5">
              No. Telepon / WhatsApp Resmi
            </label>
            <input
              id="no_telepon"
              type="text"
              value={formData.no_telepon}
              onChange={(e) => onUpdateField('no_telepon', e.target.value)}
              className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono tabular-nums text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600/20 focus:border-emerald-700"
            />
          </div>

          <div>
            <label htmlFor="email_resmi" className="font-semibold text-slate-700 block mb-1.5">
              Email Resmi Pondok
            </label>
            <input
              id="email_resmi"
              type="email"
              placeholder="admin@pondok.id"
              value={formData.email_resmi}
              onChange={(e) => onUpdateField('email_resmi', e.target.value)}
              className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600/20 focus:border-emerald-700"
            />
          </div>

          <div className="md:col-span-2">
            <label htmlFor="alamat_lengkap" className="font-semibold text-slate-700 block mb-1.5">
              Alamat Lengkap
            </label>
            <input
              id="alamat_lengkap"
              type="text"
              value={formData.alamat_lengkap}
              onChange={(e) => onUpdateField('alamat_lengkap', e.target.value)}
              className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600/20 focus:border-emerald-700"
            />
          </div>

          <div className="md:col-span-2">
            <label htmlFor="slogan" className="font-semibold text-slate-700 block mb-1.5">
              Slogan / Motto Pesantren
            </label>
            <input
              id="slogan"
              type="text"
              value={formData.slogan}
              onChange={(e) => onUpdateField('slogan', e.target.value)}
              className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600/20 focus:border-emerald-700"
            />
          </div>
        </div>
      </section>

      <section className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 space-y-5">
        <div className="border-b border-slate-100 pb-3">
          <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <CreditCard className="w-4 h-4 siap-text-accent shrink-0" />
            Rekening Transfer Resmi Pondok
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Ditampilkan sebagai rujukan transfer wali santri pada penagihan Syahriah dan catatan Laporan Keuangan.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
          <div>
            <label htmlFor="rekening_bank" className="font-semibold text-slate-700 block mb-1.5">
              Nama Bank
            </label>
            <input
              id="rekening_bank"
              type="text"
              placeholder="BSI / BRI / Mandiri"
              value={formData.rekening_bank}
              onChange={(e) => onUpdateField('rekening_bank', e.target.value)}
              className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600/20 focus:border-emerald-700"
            />
          </div>

          <div>
            <label htmlFor="rekening_nomor" className="font-semibold text-slate-700 block mb-1.5">
              Nomor Rekening
            </label>
            <input
              id="rekening_nomor"
              type="text"
              placeholder="Contoh: 7123456789"
              value={formData.rekening_nomor}
              onChange={(e) => onUpdateField('rekening_nomor', e.target.value)}
              className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono tabular-nums text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600/20 focus:border-emerald-700"
            />
          </div>

          <div>
            <label htmlFor="rekening_atas_nama" className="font-semibold text-slate-700 block mb-1.5">
              Atas Nama Rekening
            </label>
            <input
              id="rekening_atas_nama"
              type="text"
              placeholder="Pondok Pesantren An-Nur 1"
              value={formData.rekening_atas_nama}
              onChange={(e) => onUpdateField('rekening_atas_nama', e.target.value)}
              className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600/20 focus:border-emerald-700"
            />
          </div>
        </div>
      </section>
    </div>
  );
}

/* ========================================================================== */
/* TAB 2: LOGO, STEMPEL & TANDA TANGAN DIGITAL                                */
/* ========================================================================== */
interface LogoLegalitasTabProps {
  formData: PengaturanFormState;
  onUpdateField: <K extends keyof PengaturanFormState>(field: K, value: PengaturanFormState[K]) => void;
  onUploadImage: (e: React.ChangeEvent<HTMLInputElement>, fieldName: keyof PengaturanFormState) => void;
  uploadingField: string | null;
}

const ASSET_SLOTS: Array<{
  field: 'logo_url' | 'logo_watermark_url' | 'stempel_url';
  title: string;
  hint: string;
  accept: string;
}> = [
  {
    field: 'logo_url',
    title: 'Logo 1: Kop Surat & Dokumen',
    hint: 'Dipakai di header laporan, surat izin & kuitansi.',
    accept: 'image/*',
  },
  {
    field: 'logo_watermark_url',
    title: 'Logo 2: Watermark Kuitansi',
    hint: 'Logo latar belakang kuitansi resmi.',
    accept: 'image/*',
  },
  {
    field: 'stempel_url',
    title: 'Stempel Resmi Pondok',
    hint: 'Tampil di sebelah kiri TTD Pengasuh.',
    accept: 'image/png,image/*',
  },
];

const PEJABAT_SLOTS: Array<{
  nameField: 'nama_pengasuh' | 'nama_kepala_pondok' | 'nama_sekretaris' | 'nama_bendahara';
  ttdField: 'ttd_pengasuh_url' | 'ttd_kepala_pondok_url' | 'ttd_sekretaris_url' | 'ttd_bendahara_url';
  jabatanLabel: string;
  peranDoc: string;
}> = [
  {
    nameField: 'nama_pengasuh',
    ttdField: 'ttd_pengasuh_url',
    jabatanLabel: 'Pengasuh Pondok Pesantren',
    peranDoc: 'Mengetahui / Pengesahan Akhir Laporan',
  },
  {
    nameField: 'nama_kepala_pondok',
    ttdField: 'ttd_kepala_pondok_url',
    jabatanLabel: 'Ketua / Kepala Pondok',
    peranDoc: 'Penanggung Jawab Harian & Surat Resmi',
  },
  {
    nameField: 'nama_sekretaris',
    ttdField: 'ttd_sekretaris_url',
    jabatanLabel: 'Sekretaris Pondok',
    peranDoc: 'Penyusun Laporan Gabungan & Administrasi',
  },
  {
    nameField: 'nama_bendahara',
    ttdField: 'ttd_bendahara_url',
    jabatanLabel: 'Bendahara Pondok',
    peranDoc: 'Kuitansi Pembayaran & Laporan Keuangan',
  },
];

export function LogoLegalitasTab({
  formData,
  onUpdateField,
  onUploadImage,
  uploadingField,
}: LogoLegalitasTabProps) {
  return (
    <div className="space-y-6">
      {/* Kop Surat Resmi JPG/PNG (17,46 x 4,13 cm) */}
      <section className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
          <div>
            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <ImageIcon className="w-4 h-4 siap-text-accent shrink-0" />
              Kop Surat Resmi Pondok (JPG / PNG · Rasio 17,46 × 4,13 cm)
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Jika diunggah, Pusat Laporan otomatis memakai gambar Kop Surat asli ini (ukuran lebar penuh A4: 17,46 × 4,13 cm) menggantikan kop teks standar.
            </p>
          </div>
          <span className="text-[11px] font-semibold px-2.5 py-1 rounded-lg siap-soft-box border shrink-0 self-start sm:self-center">
            Rasio 17,46 × 4,13 cm
          </span>
        </div>

        <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
          <div className="w-full max-w-[17.46cm] mx-auto aspect-[1746/413] rounded-lg bg-white border border-dashed border-slate-300 flex items-center justify-center p-2 overflow-hidden">
            {formData.kop_surat_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={formData.kop_surat_url}
                alt="Kop Surat Resmi Pondok"
                referrerPolicy="no-referrer"
                className="w-full h-full object-contain"
              />
            ) : (
              <div className="text-center px-4">
                <p className="text-xs font-semibold text-slate-500">Belum ada gambar Kop Surat</p>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <label className="min-h-[38px] px-4 py-1.5 siap-btn-primary rounded-lg text-xs font-bold flex items-center justify-center gap-2 cursor-pointer transition-colors whitespace-nowrap">
              <Upload className="w-3.5 h-3.5 shrink-0" />
              {uploadingField === 'kop_surat_url'
                ? 'Mengunggah...'
                : formData.kop_surat_url
                ? 'Ganti File'
                : 'Unggah Foto'}
              <input
                type="file"
                accept="image/jpeg,image/png,image/*"
                disabled={uploadingField === 'kop_surat_url'}
                onChange={(e) => onUploadImage(e, 'kop_surat_url')}
                className="hidden"
              />
            </label>
            {formData.kop_surat_url && (
              <button
                type="button"
                onClick={() => onUpdateField('kop_surat_url', '')}
                className="min-h-[38px] px-3 py-1.5 bg-white hover:bg-rose-50 border border-slate-300 hover:border-rose-300 text-rose-600 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Hapus Kop Gambar
              </button>
            )}
          </div>
        </div>
      </section>

      {/* Aset Visual Logo & Stempel */}
      <section className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 space-y-5">
        <div className="border-b border-slate-100 pb-3">
          <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <ImageIcon className="w-4 h-4 siap-text-accent shrink-0" />
            Logo Lembaga &amp; Stempel Resmi
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Unggah logo lembaga dan stempel resmi pondok.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {ASSET_SLOTS.map((slot) => {
            const url = formData[slot.field];
            const isUploading = uploadingField === slot.field;
            return (
              <div
                key={slot.field}
                className="flex flex-col justify-between p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3"
              >
                <div className="space-y-1">
                  <div className="text-xs font-bold text-slate-900">{slot.title}</div>
                  <p className="text-[11px] text-slate-500 leading-relaxed">{slot.hint}</p>
                </div>

                <div className="h-24 rounded-lg bg-white border border-dashed border-slate-300 flex items-center justify-center p-2">
                  {url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={url}
                      alt={slot.title}
                      referrerPolicy="no-referrer"
                      className="max-h-20 max-w-full object-contain"
                    />
                  ) : (
                    <span className="text-[11px] text-slate-400">Belum ada gambar</span>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <label className="flex-1 min-h-[38px] px-3 py-1.5 bg-white hover:bg-slate-100 border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 flex items-center justify-center gap-1.5 cursor-pointer transition-colors whitespace-nowrap">
                    <Upload className="w-3.5 h-3.5 siap-text-accent shrink-0" />
                    {isUploading ? 'Mengunggah...' : url ? 'Ganti File' : 'Unggah File'}
                    <input
                      type="file"
                      accept={slot.accept}
                      disabled={isUploading}
                      onChange={(e) => onUploadImage(e, slot.field)}
                      className="hidden"
                    />
                  </label>
                  {url && (
                    <button
                      type="button"
                      onClick={() => onUpdateField(slot.field, '')}
                      aria-label={`Hapus ${slot.title}`}
                      className="min-h-[38px] px-2.5 py-1.5 bg-white hover:bg-rose-50 border border-slate-300 hover:border-rose-300 text-rose-600 rounded-lg transition-colors"
                      title="Hapus gambar"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* 4 Pejabat & Preview TTD */}
      <section className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 space-y-5">
        <div className="border-b border-slate-100 pb-3">
          <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <Landmark className="w-4 h-4 siap-text-accent shrink-0" />
            Pejabat Penanda Tangan &amp; TTD Digital
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Nama dan tanda tangan di bawah otomatis disinkronkan ke Lembar Pengesahan Pusat Laporan, Kuitansi, dan Surat Izin.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {PEJABAT_SLOTS.map((p) => {
            const ttdUrl = formData[p.ttdField];
            const isUploading = uploadingField === p.ttdField;
            return (
              <div
                key={p.nameField}
                className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3"
              >
                <div>
                  <label htmlFor={p.nameField} className="text-xs font-bold text-slate-900 block">
                    {p.jabatanLabel}
                  </label>
                  <span className="text-[11px] text-slate-500 block mt-0.5">{p.peranDoc}</span>
                </div>

                <input
                  id={p.nameField}
                  type="text"
                  value={formData[p.nameField]}
                  onChange={(e) => onUpdateField(p.nameField, e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-medium text-slate-900 siap-ring-focus"
                />

                {/* Preview proporsional seperti kertas pengesahan */}
                <div className="bg-white border border-slate-200 rounded-lg p-3 text-center space-y-1">
                  <div className="text-[10px] text-slate-400">{p.jabatanLabel}</div>
                  <div className="h-14 flex items-center justify-center relative">
                    {ttdUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={ttdUrl}
                        alt={`TTD ${p.jabatanLabel}`}
                        referrerPolicy="no-referrer"
                        className="max-h-14 max-w-[160px] object-contain"
                      />
                    ) : (
                      <span className="text-[10px] text-slate-300 italic">Area tanda tangan kosong</span>
                    )}
                  </div>
                  <div className="text-xs font-bold text-slate-800 underline underline-offset-4 decoration-slate-400">
                    {formData[p.nameField] || '-'}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <label className="flex-1 min-h-[38px] px-3 py-1.5 bg-white hover:bg-slate-100 border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 flex items-center justify-center gap-1.5 cursor-pointer transition-colors whitespace-nowrap">
                    <Upload className="w-3.5 h-3.5 siap-text-accent shrink-0" />
                    {isUploading ? 'Mengunggah...' : ttdUrl ? 'Ganti TTD' : 'Unggah TTD'}
                    <input
                      type="file"
                      accept="image/png,image/*"
                      disabled={isUploading}
                      onChange={(e) => onUploadImage(e, p.ttdField)}
                      className="hidden"
                    />
                  </label>
                  {ttdUrl && (
                    <button
                      type="button"
                      onClick={() => onUpdateField(p.ttdField, '')}
                      aria-label={`Hapus TTD ${p.jabatanLabel}`}
                      className="min-h-[38px] px-2.5 py-1.5 bg-white hover:bg-rose-50 border border-slate-300 hover:border-rose-300 text-rose-600 rounded-lg transition-colors"
                      title="Hapus TTD"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

/* ========================================================================== */
/* TAB 3: KEUANGAN, SALDO AWAL TRANSISI & MASTER TARIF DINAMIS                */
/* ========================================================================== */
interface KeuanganTarifTabProps {
  formData: PengaturanFormState;
  onUpdateField: <K extends keyof PengaturanFormState>(field: K, value: PengaturanFormState[K]) => void;
  onUpdateTahunAjaran: (val: string) => void;
  onUpdatePendaftaran: (updater: (prev: SkemaPendaftaranConfig) => SkemaPendaftaranConfig) => void;
  canManageFinance: boolean;
  masterItems: MasterPembayaranItem[];
  riwayatMap: Record<string, TarifRiwayatItem[]>;
  todayStr: string;
  onOpenNewModal: () => void;
  onOpenEditTarif: (item: MasterPembayaranItem, nominalAktif: number) => void;
  onToggleItemAktif: (item: MasterPembayaranItem) => void;
  togglingItemId: string | null;
}

export function KeuanganTarifTab({
  formData,
  onUpdateField,
  onUpdateTahunAjaran,
  onUpdatePendaftaran,
  canManageFinance,
  masterItems,
  riwayatMap,
  todayStr,
  onOpenNewModal,
  onOpenEditTarif,
  onToggleItemAktif,
  togglingItemId,
}: KeuanganTarifTabProps) {
  const totalSaldoAwal = computeTotalSaldoAwal(formData);
  const psb = formData.aturan_operasional.pendaftaran;
  const simVipPromo = hitungRincianPendaftaran({ paket: 'vip', jumlahPendaftarSaatIni: 0, skema: psb });
  const simVipNormal = hitungRincianPendaftaran({
    paket: 'vip',
    jumlahPendaftarSaatIni: psb.kuota_gratis_uang_pangkal,
    skema: psb,
  });
  const simRegPromo = hitungRincianPendaftaran({ paket: 'reguler', jumlahPendaftarSaatIni: 0, skema: psb });
  const simRegNormal = hitungRincianPendaftaran({
    paket: 'reguler',
    jumlahPendaftarSaatIni: psb.kuota_gratis_uang_pangkal,
    skema: psb,
  });

  return (
    <div className="space-y-6">
      {!canManageFinance && (
        <div className="bg-rose-50 border border-rose-200 rounded-xl px-4 py-3 text-xs text-rose-800 flex items-center gap-2 font-semibold">
          <Lock className="w-4 h-4 shrink-0" />
          Mode Baca Saja: Perubahan tarif, saldo awal, dan jatuh tempo Syahriah khusus untuk Admin Utama &amp; Bendahara.
        </div>
      )}

      {/* Bagian A: Siklus & Saldo Awal 4 Dompet */}
      <section className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
          <div>
            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Calendar className="w-4 h-4 siap-text-accent shrink-0" />
              Siklus Tahun Ajaran, Jatuh Tempo &amp; Saldo Awal 4 Dompet
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Saldo awal (Opening Balance) adalah sisa uang tunai/rekening riil saat mulai memakai aplikasi.
            </p>
          </div>
          <div className="text-left sm:text-right">
            <span className="text-[11px] text-slate-500 block">Total Saldo Awal 4 Dompet</span>
            <span className="text-sm font-mono font-extrabold siap-text-accent tabular-nums">
              {formatRp(totalSaldoAwal)}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
          <div>
            <label htmlFor="saldo_awal_pendaftaran" className="font-semibold text-slate-700 block mb-1.5">
              1. Saldo Awal Pendaftaran
            </label>
            <input
              id="saldo_awal_pendaftaran"
              type="number"
              min={0}
              disabled={!canManageFinance}
              value={formData.saldo_awal_pendaftaran}
              onChange={(e) => onUpdateField('saldo_awal_pendaftaran', Number(e.target.value || 0))}
              className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono tabular-nums text-slate-900 disabled:opacity-60"
            />
          </div>

          <div>
            <label htmlFor="saldo_awal_operasional" className="font-semibold text-slate-700 block mb-1.5">
              2. Saldo Awal Syahriyah &amp; Tahunan
            </label>
            <input
              id="saldo_awal_operasional"
              type="number"
              min={0}
              disabled={!canManageFinance}
              value={formData.saldo_awal_operasional}
              onChange={(e) => onUpdateField('saldo_awal_operasional', Number(e.target.value || 0))}
              className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono tabular-nums text-slate-900 disabled:opacity-60"
            />
          </div>

          <div>
            <label htmlFor="saldo_awal_kas_pondok" className="font-semibold text-slate-700 block mb-1.5">
              3. Saldo Awal Dompet Kas
            </label>
            <input
              id="saldo_awal_kas_pondok"
              type="number"
              min={0}
              disabled={!canManageFinance}
              value={formData.saldo_awal_kas_pondok}
              onChange={(e) => onUpdateField('saldo_awal_kas_pondok', Number(e.target.value || 0))}
              className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono tabular-nums text-slate-900 disabled:opacity-60"
            />
          </div>

          <div>
            <label htmlFor="saldo_awal_mda" className="font-semibold text-slate-700 block mb-1.5">
              4. Saldo Awal Dompet MDA
            </label>
            <input
              id="saldo_awal_mda"
              type="number"
              min={0}
              disabled={!canManageFinance}
              value={formData.saldo_awal_mda}
              onChange={(e) => onUpdateField('saldo_awal_mda', Number(e.target.value || 0))}
              className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono tabular-nums text-slate-900 disabled:opacity-60"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs pt-2 border-t border-slate-100">
          <div>
            <label htmlFor="tahun_ajaran_aktif" className="font-semibold text-slate-700 block mb-1.5">
              Tahun Ajaran Aktif Default
            </label>
            <input
              id="tahun_ajaran_aktif"
              type="text"
              placeholder={getDynamicTahunAjaranAktif()}
              disabled={!canManageFinance}
              value={formData.aturan_operasional.tahun_ajaran_aktif}
              onChange={(e) => onUpdateTahunAjaran(e.target.value)}
              className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono text-slate-900 disabled:opacity-60"
            />
            <span className="text-[11px] text-slate-400 mt-1 block">
              Menjadi acuan awal modul Keuangan dan tagihan tahunan santri.
            </span>
          </div>

          <div>
            <label htmlFor="jatuh_tempo_tanggal" className="font-semibold text-slate-700 block mb-1.5">
              Tanggal Jatuh Tempo Syahriyah Bulanan (1–28)
            </label>
            <input
              id="jatuh_tempo_tanggal"
              type="number"
              min={1}
              max={28}
              disabled={!canManageFinance}
              value={formData.jatuh_tempo_tanggal}
              onChange={(e) => onUpdateField('jatuh_tempo_tanggal', Number(e.target.value || 10))}
              className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono tabular-nums text-slate-900 disabled:opacity-60"
            />
            <span className="text-[11px] text-slate-400 mt-1 block">
              Lewat tanggal ini setiap bulan, tagihan bulan berjalan otomatis dihitung menunggak.
            </span>
          </div>
        </div>
      </section>

      {/* Bagian B: Master Tarif & Komponen Pembayaran */}
      <section className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-slate-100 pb-4">
          <div>
            <h2 className="font-bold text-sm text-slate-900 flex items-center gap-2">
              <Wallet className="w-4 h-4 siap-text-accent shrink-0" />
              Master Tarif &amp; Komponen Pembayaran Santri
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Perubahan nominal berlaku mulai tanggal yang ditetapkan; bulan sebelumnya tetap memakai tarif lama.
            </p>
          </div>

          {canManageFinance && (
            <button
              type="button"
              onClick={onOpenNewModal}
              className="w-full sm:w-auto min-h-[40px] px-4 py-2 siap-btn-primary text-xs font-bold rounded-xl inline-flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              Tambah Pembayaran Baru
            </button>
          )}
        </div>

        {/* Mobile Cards */}
        <div className="md:hidden divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
          {masterItems.map((item) => {
            const riwayatList = riwayatMap[item.id] || [];
            const tarifAktif = getTarifAktifFromRiwayat(riwayatList, todayStr);
            const isToggling = togglingItemId === item.id;
            return (
              <div key={item.id} className={`p-3.5 space-y-2.5 text-xs ${item.aktif ? 'bg-white' : 'bg-slate-50/70 opacity-80'}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-bold text-slate-900">{item.nama_item}</div>
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      {item.tipe_periode === 'bulanan' ? 'Bulanan' : 'Tahunan'} &middot;{' '}
                      {NAMA_DOMPET_MAP[item.dompet_tujuan] || item.dompet_tujuan} &middot;{' '}
                      {item.wajib_ndalem ? 'Ndalem Wajib' : 'Ndalem Opsional'}
                    </div>
                  </div>
                  <span className={`text-[11px] font-bold shrink-0 ${item.aktif ? 'siap-text-accent' : 'text-slate-400'}`}>
                    {item.aktif ? 'Aktif' : 'Nonaktif'}
                  </span>
                </div>

                <div className="font-mono font-extrabold siap-text-accent text-sm tabular-nums">
                  {formatRp(tarifAktif.nominal)}
                </div>

                {riwayatList.length > 0 && (
                  <div className="space-y-0.5">
                    {riwayatList.slice(0, 2).map((r) => (
                      <div key={r.id} className="text-[11px] text-slate-400 flex items-center gap-1">
                        <History className="w-3 h-3 shrink-0" />
                        {formatRp(r.nominal)} (mulai {r.berlaku_mulai})
                      </div>
                    ))}
                  </div>
                )}

                {canManageFinance && (
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => onOpenEditTarif(item, tarifAktif.nominal)}
                      className="flex-1 min-h-[38px] px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded-xl font-bold text-xs inline-flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Edit3 className="w-3.5 h-3.5" /> Ubah Tarif
                    </button>
                    <button
                      type="button"
                      disabled={isToggling}
                      onClick={() => onToggleItemAktif(item)}
                      className="min-h-[38px] px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl font-semibold text-xs inline-flex items-center justify-center gap-1 cursor-pointer"
                    >
                      {item.aktif ? <ToggleRight className="w-4 h-4 siap-text-accent" /> : <ToggleLeft className="w-4 h-4 text-slate-400" />}
                      {item.aktif ? 'Nonaktifkan' : 'Aktifkan'}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Desktop Table */}
        <div className="hidden md:block overflow-x-auto border border-slate-200 rounded-xl">
          <table className="w-full text-left text-xs text-slate-700">
            <thead className="bg-slate-50 border-b border-slate-200 font-bold text-slate-600 text-[11px]">
              <tr>
                <th className="py-3 px-4">Nama Pembayaran</th>
                <th className="py-3 px-3 whitespace-nowrap">Periode</th>
                <th className="py-3 px-3 whitespace-nowrap">Dompet Tujuan</th>
                <th className="py-3 px-3 whitespace-nowrap">Santri Ndalem</th>
                <th className="py-3 px-3">Tarif Aktif &amp; Riwayat</th>
                <th className="py-3 px-3 whitespace-nowrap">Status</th>
                <th className="py-3 px-4 text-right whitespace-nowrap">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {masterItems.map((item) => {
                const riwayatList = riwayatMap[item.id] || [];
                const tarifAktif = getTarifAktifFromRiwayat(riwayatList, todayStr);
                const isToggling = togglingItemId === item.id;
                return (
                  <tr
                    key={item.id}
                    className={`hover:bg-slate-50/70 ${item.aktif ? 'bg-white' : 'bg-slate-50/50 text-slate-400'}`}
                  >
                    <td className="py-3 px-4 font-bold text-slate-900">{item.nama_item}</td>
                    <td className="py-3 px-3 whitespace-nowrap font-medium">
                      {item.tipe_periode === 'bulanan' ? 'Bulanan' : 'Tahunan'}
                    </td>
                    <td className="py-3 px-3 text-[11px] text-slate-600 whitespace-nowrap">
                      {NAMA_DOMPET_MAP[item.dompet_tujuan] || item.dompet_tujuan}
                    </td>
                    <td className="py-3 px-3 whitespace-nowrap">
                      <span className={item.wajib_ndalem ? 'font-semibold siap-text-accent' : 'text-slate-500'}>
                        {item.wajib_ndalem ? 'Wajib' : 'Opsional'}
                      </span>
                    </td>
                    <td className="py-3 px-3">
                      <div className="font-mono font-extrabold siap-text-accent text-xs tabular-nums whitespace-nowrap">
                        {formatRp(tarifAktif.nominal)}
                      </div>
                      {riwayatList.length > 0 && (
                        <div className="mt-1 space-y-0.5">
                          {riwayatList.slice(0, 2).map((r) => (
                            <div key={r.id} className="text-[10px] text-slate-400 flex items-center gap-1 whitespace-nowrap tabular-nums">
                              <History className="w-2.5 h-2.5 shrink-0" />
                              {formatRp(r.nominal)} (mulai {r.berlaku_mulai})
                            </div>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-3 whitespace-nowrap">
                      {canManageFinance ? (
                        <button
                          type="button"
                          disabled={isToggling}
                          onClick={() => onToggleItemAktif(item)}
                          className="inline-flex items-center gap-1.5 text-xs font-semibold cursor-pointer hover:underline"
                          aria-label={`Ubah status aktif ${item.nama_item}`}
                        >
                          {item.aktif ? (
                            <>
                              <ToggleRight className="w-4 h-4 siap-text-accent" />
                              <span className="siap-text-accent">Aktif</span>
                            </>
                          ) : (
                            <>
                              <ToggleLeft className="w-4 h-4 text-slate-400" />
                              <span className="text-slate-500">Nonaktif</span>
                            </>
                          )}
                        </button>
                      ) : (
                        <span className={item.aktif ? 'siap-text-accent font-semibold' : 'text-slate-400'}>
                          {item.aktif ? 'Aktif' : 'Nonaktif'}
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      {canManageFinance ? (
                        <button
                          type="button"
                          onClick={() => onOpenEditTarif(item, tarifAktif.nominal)}
                          className="px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded-lg font-bold text-[11px] inline-flex items-center gap-1 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                        >
                          <Edit3 className="w-3 h-3" /> Ubah Tarif
                        </button>
                      ) : (
                        <span className="text-slate-400 text-[11px]">Terkunci</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Bagian C: Skema Biaya Pendaftaran Santri Baru (PSB) */}
      <section className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div>
            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <GraduationCap className="w-4 h-4 siap-text-accent shrink-0" />
              Skema Biaya Pendaftaran Santri Baru (PSB)
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Rincian biaya Paket VIP &amp; Reguler termasuk promo gratis Uang Pangkal untuk pendaftar pertama.
            </p>
          </div>
          {canManageFinance && (
            <button
              type="button"
              onClick={() => onUpdatePendaftaran(() => ({ ...DEFAULT_SKEMA_PENDAFTARAN }))}
              className="min-h-[36px] px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Reset Tarif PSB Standar
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
          <div>
            <label htmlFor="psb_uang_pangkal" className="font-semibold text-slate-700 block mb-1.5">
              1. Uang Pangkal Pondok (Rp)
            </label>
            <input
              id="psb_uang_pangkal"
              type="number"
              min={0}
              disabled={!canManageFinance}
              value={psb.uang_pangkal}
              onChange={(e) =>
                onUpdatePendaftaran((prev) => ({ ...prev, uang_pangkal: Number(e.target.value || 0) }))
              }
              className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono tabular-nums"
            />
          </div>

          <div>
            <label htmlFor="psb_dipan_vip" className="font-semibold text-slate-700 block mb-1.5">
              2. Dipan (Khusus VIP) (Rp)
            </label>
            <input
              id="psb_dipan_vip"
              type="number"
              min={0}
              disabled={!canManageFinance}
              value={psb.dipan_vip}
              onChange={(e) =>
                onUpdatePendaftaran((prev) => ({ ...prev, dipan_vip: Number(e.target.value || 0) }))
              }
              className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono tabular-nums"
            />
          </div>

          <div>
            <label htmlFor="psb_formulir" className="font-semibold text-slate-700 block mb-1.5">
              3. Formulir Pendaftaran (Rp)
            </label>
            <input
              id="psb_formulir"
              type="number"
              min={0}
              disabled={!canManageFinance}
              value={psb.formulir}
              onChange={(e) =>
                onUpdatePendaftaran((prev) => ({ ...prev, formulir: Number(e.target.value || 0) }))
              }
              className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono tabular-nums"
            />
          </div>

          <div>
            <label htmlFor="psb_kotak_almari" className="font-semibold text-slate-700 block mb-1.5">
              4. Kotak Almari (Rp)
            </label>
            <input
              id="psb_kotak_almari"
              type="number"
              min={0}
              disabled={!canManageFinance}
              value={psb.kotak_almari}
              onChange={(e) =>
                onUpdatePendaftaran((prev) => ({ ...prev, kotak_almari: Number(e.target.value || 0) }))
              }
              className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono tabular-nums"
            />
          </div>

          <div>
            <label htmlFor="psb_syahriyah_vip" className="font-semibold text-slate-700 block mb-1.5">
              5a. Syahriyah VIP Bulan 1 (Rp)
            </label>
            <input
              id="psb_syahriyah_vip"
              type="number"
              min={0}
              disabled={!canManageFinance}
              value={psb.syahriyah_vip}
              onChange={(e) =>
                onUpdatePendaftaran((prev) => ({ ...prev, syahriyah_vip: Number(e.target.value || 0) }))
              }
              className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono tabular-nums"
            />
          </div>

          <div>
            <label htmlFor="psb_syahriyah_reguler" className="font-semibold text-slate-700 block mb-1.5">
              5b. Syahriyah Reguler Bulan 1 (Rp)
            </label>
            <input
              id="psb_syahriyah_reguler"
              type="number"
              min={0}
              disabled={!canManageFinance}
              value={psb.syahriyah_reguler}
              onChange={(e) =>
                onUpdatePendaftaran((prev) => ({ ...prev, syahriyah_reguler: Number(e.target.value || 0) }))
              }
              className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono tabular-nums"
            />
          </div>

          <div>
            <label htmlFor="psb_kuota_promo" className="font-semibold text-slate-700 block mb-1.5">
              Kuota Gratis Uang Pangkal
            </label>
            <input
              id="psb_kuota_promo"
              type="number"
              min={0}
              disabled={!canManageFinance}
              value={psb.kuota_gratis_uang_pangkal}
              onChange={(e) =>
                onUpdatePendaftaran((prev) => ({
                  ...prev,
                  kuota_gratis_uang_pangkal: Number(e.target.value || 0),
                }))
              }
              className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono tabular-nums"
            />
          </div>

          <div>
            <label htmlFor="psb_tahun_psb" className="font-semibold text-slate-700 block mb-1.5">
              Tahun PSB (Prefix Reg &amp; NIS)
            </label>
            <input
              id="psb_tahun_psb"
              type="number"
              min={2025}
              max={2099}
              disabled={!canManageFinance}
              value={psb.tahun_psb || getDynamicTahunPsbInfo().tahunPsb}
              onChange={(e) =>
                onUpdatePendaftaran((prev) => ({
                  ...prev,
                  tahun_psb: Number(e.target.value || getDynamicTahunPsbInfo().tahunPsb),
                }))
              }
              className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono tabular-nums"
            />
          </div>

          <div>
            <label htmlFor="psb_tahun_ajaran" className="font-semibold text-slate-700 block mb-1.5">
              Tahun Ajaran PSB Publik
            </label>
            <input
              id="psb_tahun_ajaran"
              type="text"
              disabled={!canManageFinance}
              value={psb.tahun_ajaran_psb || getDynamicTahunPsbInfo().tahunAjaranPsb}
              onChange={(e) =>
                onUpdatePendaftaran((prev) => ({
                  ...prev,
                  tahun_ajaran_psb: e.target.value,
                }))
              }
              placeholder={getDynamicTahunPsbInfo().tahunAjaranPsb}
              className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono"
            />
          </div>

          <div>
            <label htmlFor="psb_kuota_promo_tampil" className="font-semibold text-slate-700 block mb-1.5">
              Tampilan Sisa Kuota Promo Awal
            </label>
            <input
              id="psb_kuota_promo_tampil"
              type="number"
              min={1}
              max={100}
              disabled={!canManageFinance}
              value={psb.kuota_promo_tampil_awal ?? 25}
              onChange={(e) =>
                onUpdatePendaftaran((prev) => ({
                  ...prev,
                  kuota_promo_tampil_awal: Number(e.target.value || 25),
                }))
              }
              className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono tabular-nums"
            />
          </div>

          <div className="flex items-end pb-2 sm:col-span-2 lg:col-span-3">
            <label className="inline-flex items-center gap-2 cursor-pointer font-semibold text-slate-800">
              <input
                type="checkbox"
                disabled={!canManageFinance}
                checked={psb.promo_aktif}
                onChange={(e) =>
                  onUpdatePendaftaran((prev) => ({ ...prev, promo_aktif: e.target.checked }))
                }
                className="w-4 h-4 siap-accent-control rounded"
              />
              Aktifkan Free Uang Pangkal
            </label>
          </div>
        </div>

        {/* Ringkasan Kalkulasi Paket VIP vs Reguler */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-slate-100 text-xs">
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-900">Paket Kamar VIP</span>
              <span className="text-[11px] font-mono font-bold siap-text-accent tabular-nums">
                Normal: {formatRp(simVipNormal.totalNormal)} &middot; Promo: {formatRp(simVipPromo.totalPromo)}
              </span>
            </div>
            <div className="text-[11px] text-slate-600 space-y-0.5 tabular-nums">
              <div>Uang Pangkal {formatRp(psb.uang_pangkal)} (Free untuk {psb.kuota_gratis_uang_pangkal} pendaftar pertama)</div>
              <div>Dipan {formatRp(psb.dipan_vip)} &middot; Formulir {formatRp(psb.formulir)} &middot; Kotak Almari {formatRp(psb.kotak_almari)}</div>
              <div>Syahriyah Bulan Pertama {formatRp(psb.syahriyah_vip)} (otomatis masuk Dompet Operasional)</div>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-900">Paket Kamar Reguler</span>
              <span className="text-[11px] font-mono font-bold siap-text-accent tabular-nums">
                Normal: {formatRp(simRegNormal.totalNormal)} &middot; Promo: {formatRp(simRegPromo.totalPromo)}
              </span>
            </div>
            <div className="text-[11px] text-slate-600 space-y-0.5 tabular-nums">
              <div>Uang Pangkal {formatRp(psb.uang_pangkal)} (Free untuk {psb.kuota_gratis_uang_pangkal} pendaftar pertama)</div>
              <div>Formulir {formatRp(psb.formulir)} &middot; Kotak Almari {formatRp(psb.kotak_almari)}</div>
              <div>Syahriyah Bulan Pertama {formatRp(psb.syahriyah_reguler)} (otomatis masuk Dompet Operasional)</div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

/* ========================================================================== */
/* TAB 4: ATURAN OPERASIONAL DIVISI & MASTER KAMAR                            */
/* ========================================================================== */
interface AturanDivisiTabProps {
  formData: PengaturanFormState;
  onUpdateAturan: (updater: (prev: PengaturanFormState['aturan_operasional']) => PengaturanFormState['aturan_operasional']) => void;
}

export function AturanDivisiTab({ formData, onUpdateAturan }: AturanDivisiTabProps) {
  const [newKamarInput, setNewKamarInput] = useState('');
  const [kamarError, setKamarError] = useState<string | null>(null);

  const aturan = formData.aturan_operasional;
  const spValid = isKeamananThresholdValid(aturan.keamanan);

  const handleAddKamar = () => {
    const res = addKamarItem(aturan.daftar_kamar, newKamarInput);
    if (res.error) {
      setKamarError(res.error);
      return;
    }
    setKamarError(null);
    setNewKamarInput('');
    onUpdateAturan((prev) => ({ ...prev, daftar_kamar: res.next }));
  };

  return (
    <div className="space-y-6">
      {/* 1. Master Daftar Kamar Resmi */}
      <section className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div>
            <h2 className="text-sm font-bold text-slate-900">
              Master Daftar Kamar Resmi Pondok ({aturan.daftar_kamar.length} Kamar)
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Urutan dan daftar kamar acuan untuk Data Santri, Musyrif Kamar, Absen Jamaah, Keamanan, dan Sie Laundry.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setKamarError(null);
              onUpdateAturan((prev) => ({ ...prev, daftar_kamar: [...DEFAULT_KAMAR_MASTER] }));
            }}
            className="min-h-[38px] px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset Standar
          </button>
        </div>

        <div className="flex flex-col sm:flex-row gap-2">
          <label htmlFor="input_kamar_baru" className="sr-only">
            Tambah nama kamar baru
          </label>
          <input
            id="input_kamar_baru"
            type="text"
            placeholder="Ketik nama kamar baru (mis. B1 atau Al-Fachriyah 5)"
            value={newKamarInput}
            onChange={(e) => {
              setNewKamarInput(e.target.value);
              if (kamarError) setKamarError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleAddKamar();
              }
            }}
            className="flex-1 px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 siap-ring-focus"
          />
          <button
            type="button"
            onClick={handleAddKamar}
            className="min-h-[40px] px-4 py-2 siap-btn-primary text-xs font-bold rounded-xl inline-flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Tambah Kamar
          </button>
        </div>

        {kamarError && <p className="text-xs font-semibold text-rose-600">{kamarError}</p>}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {aturan.daftar_kamar.map((kamar, idx) => (
            <div
              key={kamar}
              className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs"
            >
              <div className="min-w-0 flex items-center gap-2">
                <span className="text-[11px] font-mono text-slate-400 tabular-nums w-5">{idx + 1}.</span>
                <span className="font-semibold text-slate-800 truncate">{kamar}</span>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  disabled={idx === 0}
                  onClick={() =>
                    onUpdateAturan((prev) => ({
                      ...prev,
                      daftar_kamar: moveKamarItem(prev.daftar_kamar, idx, 'up'),
                    }))
                  }
                  aria-label={`Naikkan urutan kamar ${kamar}`}
                  className="p-1 text-slate-500 hover:text-slate-900 disabled:opacity-30 cursor-pointer"
                >
                  <ArrowUp className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  disabled={idx === aturan.daftar_kamar.length - 1}
                  onClick={() =>
                    onUpdateAturan((prev) => ({
                      ...prev,
                      daftar_kamar: moveKamarItem(prev.daftar_kamar, idx, 'down'),
                    }))
                  }
                  aria-label={`Turunkan urutan kamar ${kamar}`}
                  className="p-1 text-slate-500 hover:text-slate-900 disabled:opacity-30 cursor-pointer"
                >
                  <ArrowDown className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() =>
                    onUpdateAturan((prev) => ({
                      ...prev,
                      daftar_kamar: removeKamarItem(prev.daftar_kamar, kamar),
                    }))
                  }
                  aria-label={`Hapus kamar ${kamar}`}
                  className="p-1 text-rose-500 hover:text-rose-700 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 2. Aturan Perizinan & Keamanan */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 space-y-4">
          <div className="border-b border-slate-100 pb-3">
            <h2 className="text-sm font-bold text-slate-900">Aturan Perizinan Pulang</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Nominal infaq izin standar, denda keterlambatan, dan batas jam kembali harian.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div>
              <label htmlFor="infaq_tidak_menginap" className="font-semibold text-slate-700 block mb-1.5">
                Infaq Izin Tidak Menginap (Rp)
              </label>
              <input
                id="infaq_tidak_menginap"
                type="number"
                min={0}
                value={aturan.perizinan.infaq_tidak_menginap}
                onChange={(e) =>
                  onUpdateAturan((prev) => ({
                    ...prev,
                    perizinan: { ...prev.perizinan, infaq_tidak_menginap: Number(e.target.value || 0) },
                  }))
                }
                className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono tabular-nums"
              />
            </div>

            <div>
              <label htmlFor="infaq_menginap" className="font-semibold text-slate-700 block mb-1.5">
                Infaq Izin Menginap (Rp)
              </label>
              <input
                id="infaq_menginap"
                type="number"
                min={0}
                value={aturan.perizinan.infaq_menginap}
                onChange={(e) =>
                  onUpdateAturan((prev) => ({
                    ...prev,
                    perizinan: { ...prev.perizinan, infaq_menginap: Number(e.target.value || 0) },
                  }))
                }
                className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono tabular-nums"
              />
            </div>

            <div>
              <label htmlFor="denda_terlambat" className="font-semibold text-slate-700 block mb-1.5">
                Denda Infaq Keterlambatan (Rp)
              </label>
              <input
                id="denda_terlambat"
                type="number"
                min={0}
                value={aturan.perizinan.denda_terlambat}
                onChange={(e) =>
                  onUpdateAturan((prev) => ({
                    ...prev,
                    perizinan: { ...prev.perizinan, denda_terlambat: Number(e.target.value || 0) },
                  }))
                }
                className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono tabular-nums"
              />
            </div>

            <div>
              <label htmlFor="batas_jam_harian" className="font-semibold text-slate-700 block mb-1.5">
                Batas Jam Kembali Izin Harian
              </label>
              <input
                id="batas_jam_harian"
                type="time"
                value={aturan.perizinan.batas_jam_harian}
                onChange={(e) =>
                  onUpdateAturan((prev) => ({
                    ...prev,
                    perizinan: { ...prev.perizinan, batas_jam_harian: e.target.value },
                  }))
                }
                className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono tabular-nums"
              />
            </div>
          </div>
        </section>

        <section className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 space-y-4">
          <div className="border-b border-slate-100 pb-3">
            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 siap-text-accent shrink-0" />
              Ambang Poin Keamanan &amp; Jadwal Rutin
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Batas poin penerbitan Surat Peringatan (SP1–SP3) serta jadwal operasional mingguan pondok.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-3 text-xs">
            <div>
              <label htmlFor="poin_sp1" className="font-semibold text-slate-700 block mb-1.5">
                Batas SP 1
              </label>
              <input
                id="poin_sp1"
                type="number"
                min={1}
                value={aturan.keamanan.poin_sp1}
                onChange={(e) =>
                  onUpdateAturan((prev) => ({
                    ...prev,
                    keamanan: { ...prev.keamanan, poin_sp1: Number(e.target.value || 0) },
                  }))
                }
                className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono tabular-nums"
              />
            </div>
            <div>
              <label htmlFor="poin_sp2" className="font-semibold text-slate-700 block mb-1.5">
                Batas SP 2
              </label>
              <input
                id="poin_sp2"
                type="number"
                min={1}
                value={aturan.keamanan.poin_sp2}
                onChange={(e) =>
                  onUpdateAturan((prev) => ({
                    ...prev,
                    keamanan: { ...prev.keamanan, poin_sp2: Number(e.target.value || 0) },
                  }))
                }
                className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono tabular-nums"
              />
            </div>
            <div>
              <label htmlFor="poin_sp3" className="font-semibold text-slate-700 block mb-1.5">
                Batas SP 3
              </label>
              <input
                id="poin_sp3"
                type="number"
                min={1}
                value={aturan.keamanan.poin_sp3}
                onChange={(e) =>
                  onUpdateAturan((prev) => ({
                    ...prev,
                    keamanan: { ...prev.keamanan, poin_sp3: Number(e.target.value || 0) },
                  }))
                }
                className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono tabular-nums"
              />
            </div>
          </div>

          {!spValid && (
            <p className="text-[11px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              Urutan batas poin harus menanjak: SP 1 &lt; SP 2 &lt; SP 3 dan lebih dari 0.
            </p>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs pt-2 border-t border-slate-100">
            <div>
              <label htmlFor="hari_rapat_pengasuh" className="font-semibold text-slate-700 block mb-1.5">
                Hari Rapat Rutin Pengasuh
              </label>
              <select
                id="hari_rapat_pengasuh"
                value={aturan.jadwal.hari_rapat_pengasuh}
                onChange={(e) =>
                  onUpdateAturan((prev) => ({
                    ...prev,
                    jadwal: { ...prev.jadwal, hari_rapat_pengasuh: e.target.value },
                  }))
                }
                className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl"
              >
                {HARI_OPTIONS.map((h) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="hari_libur_laundry" className="font-semibold text-slate-700 block mb-1.5">
                Hari Libur Sie Laundry
              </label>
              <select
                id="hari_libur_laundry"
                value={aturan.jadwal.hari_libur_laundry}
                onChange={(e) =>
                  onUpdateAturan((prev) => ({
                    ...prev,
                    jadwal: { ...prev.jadwal, hari_libur_laundry: e.target.value },
                  }))
                }
                className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl"
              >
                {HARI_OPTIONS.map((h) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="jam_masak_pagi" className="font-semibold text-slate-700 block mb-1.5">
                Target Jam Masak Pagi (Dapur)
              </label>
              <input
                id="jam_masak_pagi"
                type="time"
                value={aturan.jadwal.jam_masak_pagi}
                onChange={(e) =>
                  onUpdateAturan((prev) => ({
                    ...prev,
                    jadwal: { ...prev.jadwal, jam_masak_pagi: e.target.value },
                  }))
                }
                className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono tabular-nums"
              />
            </div>

            <div>
              <label htmlFor="jam_masak_sore" className="font-semibold text-slate-700 block mb-1.5">
                Target Jam Masak Sore (Dapur)
              </label>
              <input
                id="jam_masak_sore"
                type="time"
                value={aturan.jadwal.jam_masak_sore}
                onChange={(e) =>
                  onUpdateAturan((prev) => ({
                    ...prev,
                    jadwal: { ...prev.jadwal, jam_masak_sore: e.target.value },
                  }))
                }
                className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono tabular-nums"
              />
            </div>

            <div className="sm:col-span-2">
              <label htmlFor="koreksi_hijriyah" className="font-semibold text-slate-700 block mb-1.5">
                Koreksi Kalender Hijriyah (Sesuai Rukyatul Hilal / PBNU)
              </label>
              <select
                id="koreksi_hijriyah"
                value={aturan.jadwal.koreksi_hijriyah}
                onChange={(e) =>
                  onUpdateAturan((prev) => ({
                    ...prev,
                    jadwal: { ...prev.jadwal, koreksi_hijriyah: Number(e.target.value || 0) },
                  }))
                }
                className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl"
              >
                <option value={-2}>-2 Hari</option>
                <option value={-1}>-1 Hari</option>
                <option value={0}>0 Hari (Hisab Ummul Qura / Standar)</option>
                <option value={1}>+1 Hari</option>
                <option value={2}>+2 Hari</option>
              </select>
            </div>
          </div>
        </section>
      </div>

      {/* Bagian 3: Profil Pondok, Berkas Wajib & Jadwal Santri (Tampil di /daftar) */}
      {(() => {
        const profil = mergeProfilPondokPsb(aturan.profil_pondok);
        const updateProfil = (
          updater: (curr: ProfilPondokPsbConfig) => ProfilPondokPsbConfig
        ) => {
          onUpdateAturan((prev) => ({
            ...prev,
            profil_pondok: updater(mergeProfilPondokPsb(prev.profil_pondok)),
          }));
        };
        const linesToArray = (text: string) =>
          text
            .split('\n')
            .map((s) => s.trim())
            .filter(Boolean);
        const jadwalToText = (items: Array<{ waktu: string; kegiatan: string }>) =>
          items.map((j) => `${j.waktu} | ${j.kegiatan}`).join('\n');
        const textToJadwal = (text: string) =>
          text
            .split('\n')
            .map((line) => {
              const idx = line.indexOf('|');
              if (idx === -1) return { waktu: '', kegiatan: line.trim() };
              return {
                waktu: line.slice(0, idx).trim(),
                kegiatan: line.slice(idx + 1).trim(),
              };
            })
            .filter((item) => item.waktu || item.kegiatan);

        return (
          <section className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
              <div>
                <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <GraduationCap className="w-4 h-4 siap-text-accent shrink-0" />
                  Profil Pondok, Berkas Wajib &amp; Jadwal Santri (Tampil di /daftar)
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Atur teks Sejarah, Visi, Misi, Berkas Wajib, Tata Tertib, dan Jadwal Kegiatan yang dibaca wali santri saat mendaftar.
                </p>
              </div>
              <button
                type="button"
                onClick={() =>
                  onUpdateAturan((prev) => ({
                    ...prev,
                    profil_pondok: { ...DEFAULT_PROFIL_PONDOK_PSB },
                  }))
                }
                className="min-h-[34px] px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-xs font-semibold text-slate-700 inline-flex items-center gap-1.5 cursor-pointer shrink-0"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Reset Profil Standar
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <div className="md:col-span-2">
                <label htmlFor="profil_sejarah" className="font-semibold text-slate-700 block mb-1.5">
                  Sejarah Singkat Pesantren
                </label>
                <textarea
                  id="profil_sejarah"
                  rows={3}
                  value={profil.sejarahSingkat}
                  onChange={(e) =>
                    updateProfil((p) => ({ ...p, sejarahSingkat: e.target.value }))
                  }
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                />
              </div>

              <div>
                <label htmlFor="profil_visi" className="font-semibold text-slate-700 block mb-1.5">
                  Visi Pesantren
                </label>
                <textarea
                  id="profil_visi"
                  rows={3}
                  value={profil.visi}
                  onChange={(e) => updateProfil((p) => ({ ...p, visi: e.target.value }))}
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                />
              </div>

              <div>
                <label htmlFor="profil_misi" className="font-semibold text-slate-700 block mb-1.5">
                  Misi Pesantren
                </label>
                <textarea
                  id="profil_misi"
                  rows={3}
                  value={profil.misi}
                  onChange={(e) => updateProfil((p) => ({ ...p, misi: e.target.value }))}
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                />
              </div>

              <div className="md:col-span-2">
                <label htmlFor="profil_jam_kantor" className="font-semibold text-slate-700 block mb-1.5">
                  Jam Layanan Kantor Sekretariat / Sowan
                </label>
                <input
                  id="profil_jam_kantor"
                  type="text"
                  value={profil.jamKantorOffline}
                  onChange={(e) =>
                    updateProfil((p) => ({ ...p, jamKantorOffline: e.target.value }))
                  }
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                />
              </div>

              <div>
                <label htmlFor="profil_berkas" className="font-semibold text-slate-700 block mb-1">
                  Berkas Fisik Wajib (1 baris = 1 poin)
                </label>
                <textarea
                  id="profil_berkas"
                  rows={5}
                  value={profil.berkasFisikWajib.join('\n')}
                  onChange={(e) =>
                    updateProfil((p) => ({
                      ...p,
                      berkasFisikWajib: linesToArray(e.target.value),
                    }))
                  }
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                />
              </div>

              <div>
                <label htmlFor="profil_ketentuan" className="font-semibold text-slate-700 block mb-1">
                  Ketentuan Santri &amp; Wali (1 baris = 1 poin)
                </label>
                <textarea
                  id="profil_ketentuan"
                  rows={5}
                  value={profil.ketentuanWali.join('\n')}
                  onChange={(e) =>
                    updateProfil((p) => ({
                      ...p,
                      ketentuanWali: linesToArray(e.target.value),
                    }))
                  }
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                />
              </div>

              <div className="md:col-span-2">
                <label htmlFor="profil_larangan" className="font-semibold text-slate-700 block mb-1">
                  Larangan &amp; Tata Tertib Pondok (1 baris = 1 poin)
                </label>
                <textarea
                  id="profil_larangan"
                  rows={3}
                  value={profil.laranganTataTertib.join('\n')}
                  onChange={(e) =>
                    updateProfil((p) => ({
                      ...p,
                      laranganTataTertib: linesToArray(e.target.value),
                    }))
                  }
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                />
              </div>

              <div>
                <label htmlFor="profil_jadwal_harian" className="font-semibold text-slate-700 block mb-1">
                  Jadwal Harian Santri (Format: <code className="font-mono">Waktu | Kegiatan</code>)
                </label>
                <textarea
                  id="profil_jadwal_harian"
                  rows={5}
                  value={jadwalToText(profil.jadwalHarian)}
                  onChange={(e) =>
                    updateProfil((p) => ({
                      ...p,
                      jadwalHarian: textToJadwal(e.target.value),
                    }))
                  }
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono text-[11px]"
                />
              </div>

              <div>
                <label htmlFor="profil_jadwal_jumat" className="font-semibold text-slate-700 block mb-1">
                  Jadwal Malam Jumat &amp; Hari Jumat (Format: <code className="font-mono">Waktu | Kegiatan</code>)
                </label>
                <textarea
                  id="profil_jadwal_jumat"
                  rows={5}
                  value={jadwalToText(profil.jadwalJumat)}
                  onChange={(e) =>
                    updateProfil((p) => ({
                      ...p,
                      jadwalJumat: textToJadwal(e.target.value),
                    }))
                  }
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono text-[11px]"
                />
              </div>
            </div>
          </section>
        );
      })()}
    </div>
  );
}

/* ========================================================================== */
/* TAB 5: TEMA & TAMPILAN APLIKASI                                            */
/* ========================================================================== */
interface TemaAplikasiTabProps {
  tema: TemaAplikasiConfig;
  logoUrl: string;
  isSuperAdmin?: boolean;
  onSaveLocalTheme?: () => void;
  onUpdateTema: (updater: (prev: TemaAplikasiConfig) => TemaAplikasiConfig) => void;
}

export function TemaAplikasiTab({
  tema,
  logoUrl,
  isSuperAdmin = false,
  onSaveLocalTheme,
  onUpdateTema,
}: TemaAplikasiTabProps) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* KIRI: PENGATURAN WARNA, MODE, FONT & KEPADATAN */}
        <div className="lg:col-span-8 space-y-6">
          {/* 1. Warna Tema & Preset */}
          <section className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
              <div>
                <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Palette className="w-4 h-4 siap-text-accent shrink-0" />
                  Palet Warna &amp; Sidebar Aplikasi
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Pilih tema siap pakai atau atur sendiri warna sidebar dan tombol utama sesuka hati.
                </p>
              </div>
              <button
                type="button"
                onClick={() => onUpdateTema(() => ({ ...DEFAULT_TEMA_APLIKASI }))}
                className="min-h-[36px] px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Reset Tema Standar
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              {THEME_PRESETS.map((p) => {
                const active = tema.preset === p.key;
                return (
                  <button
                    key={p.key}
                    type="button"
                    onClick={() =>
                      onUpdateTema((prev) => ({
                        ...prev,
                        preset: p.key,
                        primaryColor: p.primaryColor,
                        sidebarColor: p.sidebarColor,
                      }))
                    }
                    style={
                      active
                        ? {
                            borderColor: 'var(--siap-primary)',
                            boxShadow: '0 0 0 2px color-mix(in srgb, var(--siap-primary) 22%, transparent)',
                          }
                        : undefined
                    }
                    className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                      active
                        ? 'bg-slate-50'
                        : 'border-slate-200 hover:border-slate-300 bg-white'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 mb-2">
                      <span
                        className="w-5 h-5 rounded-md border border-black/10"
                        style={{ backgroundColor: p.sidebarColor }}
                      />
                      <span
                        className="w-5 h-5 rounded-md border border-black/10"
                        style={{ backgroundColor: p.primaryColor }}
                      />
                    </div>
                    <span className="text-xs font-semibold text-slate-800 block leading-snug">
                      {p.label}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Custom Color Pickers */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-3 border-t border-slate-100 text-xs">
              <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-slate-50 border border-slate-200">
                <div>
                  <label htmlFor="tema_sidebar_color" className="font-semibold text-slate-800 block">
                    Warna Sidebar &amp; Header HP
                  </label>
                  <span className="text-[11px] font-mono text-slate-500">{tema.sidebarColor}</span>
                </div>
                <input
                  id="tema_sidebar_color"
                  type="color"
                  value={tema.sidebarColor}
                  onChange={(e) =>
                    onUpdateTema((prev) => ({
                      ...prev,
                      preset: 'custom',
                      sidebarColor: e.target.value,
                    }))
                  }
                  className="w-11 h-9 rounded-lg border border-slate-300 cursor-pointer bg-white p-0.5"
                />
              </div>

              <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-slate-50 border border-slate-200">
                <div>
                  <label htmlFor="tema_primary_color" className="font-semibold text-slate-800 block">
                    Warna Aksen &amp; Tombol Utama
                  </label>
                  <span className="text-[11px] font-mono text-slate-500">{tema.primaryColor}</span>
                </div>
                <input
                  id="tema_primary_color"
                  type="color"
                  value={tema.primaryColor}
                  onChange={(e) =>
                    onUpdateTema((prev) => ({
                      ...prev,
                      preset: 'custom',
                      primaryColor: e.target.value,
                    }))
                  }
                  className="w-11 h-9 rounded-lg border border-slate-300 cursor-pointer bg-white p-0.5"
                />
              </div>
            </div>
          </section>

          {/* 2. Mode Tampilan, Font, Sudut & Kepadatan */}
          <section className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 space-y-5 text-xs">
            <div className="border-b border-slate-100 pb-3">
              <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Type className="w-4 h-4 siap-text-accent shrink-0" />
                Mode Layar, Jenis Huruf &amp; Gaya Antarmuka
              </h2>
            </div>

            {/* Mode Terang / Gelap / Otomatis (Sistem) / Hangat */}
            <div className="space-y-2">
              <span className="font-semibold text-slate-700 block">Mode Latar Aplikasi</span>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                {(
                  [
                    { key: 'light', label: 'Terang', desc: 'Latar putih bersih & tajam', icon: Sun },
                    { key: 'dark', label: 'Gelap', desc: 'Nyaman untuk malam hari', icon: Moon },
                    { key: 'system', label: 'Otomatis (Sistem)', desc: 'Ikuti setelan perangkat', icon: Monitor },
                    { key: 'warm', label: 'Terang Hangat', desc: 'Nuansa kertas krem lembut', icon: Sparkles },
                  ] as Array<{ key: ThemeMode; label: string; desc: string; icon: React.ComponentType<{ className?: string }> }>
                ).map((m) => {
                  const Icon = m.icon;
                  const active = tema.mode === m.key;
                  return (
                    <button
                      key={m.key}
                      type="button"
                      onClick={(e) => {
                        const rect = e.currentTarget.getBoundingClientRect();
                        const origin =
                          e.clientX || e.clientY
                            ? { x: e.clientX, y: e.clientY }
                            : { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
                        runThemeTransitionWithAnimation({
                          origin,
                          applyFn: () => {
                            writeTemaModeOverride(m.key);
                            onUpdateTema((prev) => ({ ...prev, mode: m.key }));
                          },
                        });
                      }}
                      style={
                        active
                          ? {
                              borderColor: 'var(--siap-primary)',
                              boxShadow: '0 0 0 2px color-mix(in srgb, var(--siap-primary) 22%, transparent)',
                            }
                          : undefined
                      }
                      className={`p-3 rounded-xl border text-left flex items-start gap-2.5 transition-all cursor-pointer ${
                        active
                          ? 'bg-slate-50'
                          : 'border-slate-200 bg-white hover:border-slate-300'
                      }`}
                    >
                      <Icon className="w-4 h-4 siap-text-accent shrink-0 mt-0.5" />
                      <div>
                        <span className="font-bold text-slate-900 block">{m.label}</span>
                        <span className="text-[11px] text-slate-500">{m.desc}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Pilihan Font */}
            <div className="space-y-2">
              <span className="font-semibold text-slate-700 block">Jenis Huruf (Tipografi)</span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {FONT_OPTIONS.map((f) => {
                  const active = tema.fontFamily === f.key;
                  return (
                    <button
                      key={f.key}
                      type="button"
                      onClick={() =>
                        onUpdateTema((prev) => ({ ...prev, fontFamily: f.key as ThemeFont }))
                      }
                      style={
                        active
                          ? {
                              borderColor: 'var(--siap-primary)',
                              boxShadow: '0 0 0 2px color-mix(in srgb, var(--siap-primary) 22%, transparent)',
                            }
                          : undefined
                      }
                      className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                        active
                          ? 'bg-slate-50'
                          : 'border-slate-200 bg-white hover:border-slate-300'
                      }`}
                    >
                      <span
                        className="font-bold text-slate-900 text-sm block"
                        style={{ fontFamily: f.cssVar }}
                      >
                        {f.label}
                      </span>
                      <span className="text-[11px] text-slate-500">{f.desc}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Sudut & Kepadatan */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-100">
              <div className="space-y-2">
                <span className="font-semibold text-slate-700 block">Lengkungan Sudut Kartu</span>
                <div className="grid grid-cols-3 gap-2">
                  {(
                    [
                      { key: 'sharp', label: 'Tajam' },
                      { key: 'medium', label: 'Standar' },
                      { key: 'rounded', label: 'Halus' },
                    ] as Array<{ key: ThemeRadius; label: string }>
                  ).map((r) => (
                    <button
                      key={r.key}
                      type="button"
                      onClick={() => onUpdateTema((prev) => ({ ...prev, radius: r.key }))}
                      className={`py-2 px-3 rounded-lg border text-xs font-semibold cursor-pointer ${
                        tema.radius === r.key
                          ? 'siap-btn-primary border-transparent'
                          : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <span className="font-semibold text-slate-700 block">Kepadatan Tata Letak</span>
                <div className="grid grid-cols-2 gap-2">
                  {(
                    [
                      { key: 'comfortable', label: 'Nyaman' },
                      { key: 'compact', label: 'Ringkas' },
                    ] as Array<{ key: ThemeDensity; label: string }>
                  ).map((d) => (
                    <button
                      key={d.key}
                      type="button"
                      onClick={() => onUpdateTema((prev) => ({ ...prev, density: d.key }))}
                      className={`py-2 px-3 rounded-lg border text-xs font-semibold cursor-pointer ${
                        tema.density === d.key
                          ? 'siap-btn-primary border-transparent'
                          : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Branding Sidebar & Generator Ikon PWA (Hanya Admin Utama / Super Admin) */}
            {isSuperAdmin && (
              <div className="space-y-4 pt-3 border-t border-slate-100">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="tema_app_title" className="font-semibold text-slate-700 block mb-1.5">
                      Judul Aplikasi di Sidebar
                    </label>
                    <input
                      id="tema_app_title"
                      type="text"
                      value={tema.appShortTitle}
                      onChange={(e) =>
                        onUpdateTema((prev) => ({ ...prev, appShortTitle: e.target.value }))
                      }
                      className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                    />
                  </div>
                  <div>
                    <label htmlFor="tema_app_subtitle" className="font-semibold text-slate-700 block mb-1.5">
                      Subjudul di Sidebar
                    </label>
                    <input
                      id="tema_app_subtitle"
                      type="text"
                      value={tema.appSubtitle}
                      onChange={(e) =>
                        onUpdateTema((prev) => ({ ...prev, appSubtitle: e.target.value }))
                      }
                      className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="inline-flex items-center gap-2 cursor-pointer font-semibold text-slate-800">
                      <input
                        type="checkbox"
                        checked={tema.sidebarShowLogo}
                        onChange={(e) =>
                          onUpdateTema((prev) => ({ ...prev, sidebarShowLogo: e.target.checked }))
                        }
                        className="w-4 h-4 siap-accent-control rounded"
                      />
                      Tampilkan Logo Kop Surat Pondok di pojok atas Sidebar (menggantikan inisial e1)
                    </label>
                  </div>
                </div>

                <div className="rounded-xl border siap-soft-box p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold flex items-center gap-1.5">
                      <Sparkles className="w-4 h-4 siap-text-accent" />
                      Generator Paket Ikon PWA &amp; Favicon
                    </p>
                    <p className="text-[11px] opacity-85 mt-0.5">
                      Kelola logo e1, maskable safe-zone 192/512, Apple Touch, dan monokrom Material You.
                    </p>
                  </div>
                  <Link
                    href="/tools/pwa-icon"
                    className="min-h-[38px] px-3.5 py-2 rounded-xl siap-btn-primary text-xs font-bold inline-flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0"
                  >
                    <ImageIcon className="w-3.5 h-3.5" />
                    Buka Studio Ikon PWA
                  </Link>
                </div>
              </div>
            )}

            {!isSuperAdmin && onSaveLocalTheme && (
              <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
                <p className="text-[11px] text-slate-500">
                  Preferensi tema ini berlaku khusus di perangkat Anda tanpa mengubah tampilan global pondok.
                </p>
                <button
                  type="button"
                  onClick={onSaveLocalTheme}
                  className="min-h-[40px] px-4 py-2 rounded-xl siap-btn-primary text-xs font-bold inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                >
                  <Save className="w-3.5 h-3.5" />
                  Simpan Preferensi Tema Perangkat
                </button>
              </div>
            )}
          </section>
        </div>

        {/* KANAN: PRATINJAU MINI LANGSUNG */}
        <div className="lg:col-span-4">
          <section className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4 sticky top-6">
            <h3 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-2">
              Pratinjau Tampilan Langsung
            </h3>

            <div className="rounded-xl overflow-hidden border border-slate-200 flex h-56 text-[11px]">
              {/* Mini Sidebar */}
              <div
                className="w-28 p-3 text-white flex flex-col justify-between shrink-0"
                style={{ backgroundColor: tema.sidebarColor }}
              >
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    {tema.sidebarShowLogo && logoUrl ? (
                      <div className="w-6 h-6 rounded-full bg-white p-0.5 shrink-0 overflow-hidden">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={logoUrl}
                          alt="Logo Preview"
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-contain"
                        />
                      </div>
                    ) : (
                      <div
                        className="w-6 h-6 rounded-full flex items-center justify-center font-bold text-[10px] border border-white/30 shrink-0"
                        style={{ backgroundColor: tema.primaryColor }}
                      >
                        e1
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="font-bold truncate leading-tight">{tema.appShortTitle || 'e-annursatu'}</div>
                      <div className="text-[9px] opacity-75 truncate">{tema.appSubtitle || 'An-Nur 1'}</div>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <div
                      className="px-2 py-1 rounded text-white font-semibold"
                      style={{ backgroundColor: tema.primaryColor }}
                    >
                      Beranda
                    </div>
                    <div className="px-2 py-1 rounded text-white/75">Keuangan</div>
                    <div className="px-2 py-1 rounded text-white/75">Pengaturan</div>
                  </div>
                </div>
                <div className="text-[9px] opacity-60">e-annursatu</div>
              </div>

              {/* Mini Canvas */}
              <div
                className="flex-1 p-3 space-y-2.5"
                style={{
                  backgroundColor:
                    tema.mode === 'dark' ? '#0b1120' : tema.mode === 'warm' ? '#f7f4ed' : '#f8fafc',
                  color: tema.mode === 'dark' ? '#f1f5f9' : '#0f172a',
                }}
              >
                <div
                  className="p-2.5 border"
                  style={{
                    backgroundColor:
                      tema.mode === 'dark' ? '#111827' : tema.mode === 'warm' ? '#fffdf9' : '#ffffff',
                    borderColor: tema.mode === 'dark' ? '#1e293b' : '#e2e8f0',
                    borderRadius:
                      tema.radius === 'sharp' ? '6px' : tema.radius === 'rounded' ? '16px' : '10px',
                  }}
                >
                  <div className="font-bold text-xs">Ringkasan Pondok</div>
                  <div className="text-[10px] opacity-70 mt-0.5">
                    Perubahan tema langsung terlihat pada menu dan seluruh halaman.
                  </div>
                  <div className="mt-2">
                    <span
                      className="inline-block px-2.5 py-1 rounded text-[10px] font-bold text-white"
                      style={{ backgroundColor: tema.primaryColor }}
                    >
                      Tombol Utama
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <p className="text-[11px] text-slate-500 leading-relaxed">
              {isSuperAdmin ? (
                <>
                  Setiap perubahan warna, mode, atau huruf langsung diterapkan sebagai pratinjau. Klik{' '}
                  <strong>Simpan Pengaturan</strong> untuk menyimpannya permanen.
                </>
              ) : (
                <>
                  Perubahan tema langsung terlihat dan tersimpan khusus untuk perangkat Anda.
                </>
              )}
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
