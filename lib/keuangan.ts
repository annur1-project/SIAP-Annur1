import { isMissingColumnError } from './pengaturan';
import { PSB_TABLE_SQL } from './psb';
import { supabase } from './supabase';

export type DompetType = 'pendaftaran' | 'operasional' | 'kas_pondok' | 'mda';

export interface WalletSaldoAwal {
  pendaftaran?: number;
  operasional?: number;
  kas_pondok?: number;
  mda?: number;
}

export interface WalletTxLike {
  id?: string;
  dompet?: string | null;
  tipe: 'masuk' | 'keluar';
  nominal: number | string;
  metode_pembayaran?: string | null;
  tgl_transaksi?: string | null;
  no_kuitansi?: string | null;
  lampiran_url?: string | null;
}

export interface SyahriyahTransferSummary {
  totalMasukAllTime: number;
  totalKeluarAllTime: number;
  netAllTime: number;
  bulanIniMasuk: number;
  bulanIniKeluar: number;
  byDompetMasuk: Record<DompetType, number>;
}

export interface WalletAndTransferSummary {
  totals: Record<DompetType, number>;
  grandTotalTunai: number;
  tunaiMasukBulanIni: number;
  tunaiKeluarBulanIni: number;
  syahriyahTransfer: SyahriyahTransferSummary;
}

export interface MasterFeeSeed {
  kode: string;
  nama_item: string;
  tipe_periode: 'bulanan' | 'tahunan';
  kategori_santri: 'semua';
  dompet_tujuan: DompetType;
  wajib_ndalem: boolean;
  urutan: number;
  defaultNominal: number;
}

export const NEW_MASTER_PEMBAYARAN_SEEDS: MasterFeeSeed[] = [
  {
    kode: 'al_adzkar',
    nama_item: 'Al-Adzkar',
    tipe_periode: 'tahunan',
    kategori_santri: 'semua',
    dompet_tujuan: 'operasional',
    wajib_ndalem: false,
    urutan: 10,
    defaultNominal: 35000,
  },
  {
    kode: 'almamater',
    nama_item: 'Almamater',
    tipe_periode: 'tahunan',
    kategori_santri: 'semua',
    dompet_tujuan: 'operasional',
    wajib_ndalem: false,
    urutan: 11,
    defaultNominal: 150000,
  },
  {
    kode: 'kitab_madin',
    nama_item: 'Kitab Madin',
    tipe_periode: 'tahunan',
    kategori_santri: 'semua',
    dompet_tujuan: 'operasional',
    wajib_ndalem: false,
    urutan: 12,
    defaultNominal: 120000,
  },
  {
    kode: 'infaq_madin',
    nama_item: 'Infaq Madin',
    tipe_periode: 'tahunan',
    kategori_santri: 'semua',
    dompet_tujuan: 'pendaftaran',
    wajib_ndalem: false,
    urutan: 13,
    defaultNominal: 50000,
  },
];

export const ANNUAL_FEE_FALLBACK_NOMINALS: Record<string, number> = {
  ujian_mda_1: 60000,
  ujian_mda_2: 60000,
  raport: 40000,
  raport_mda: 40000,
  kalender: 30000,
  kalender_pondok: 30000,
  haul: 50000,
  haul_masyayikh: 50000,
  kesehatan: 100000,
  kesehatan_tahunan: 100000,
  al_adzkar: 35000,
  almamater: 150000,
  kitab_madin: 120000,
  infaq_madin: 50000,
};

/**
 * Pemetaan kanonik item pembayaran -> pos dompet tujuan sesuai ketentuan pondok:
 * - Dompet Syahriyah (operasional): Syahriyah Bulanan, Kalender, Haul, Kesehatan, Al-Adzkar, Almamater, Kitab Madin, KTL
 * - Dompet MDA (mda): Khusus Ujian MDA 1 & 2 serta Raport saja
 * - Dompet Pendaftaran (pendaftaran): Infaq Madin dan rincian pendaftaran (PSB)
 */
export function resolveCanonicalDompetForItem(
  kode?: string | null,
  fallbackDompet?: string | null
): DompetType {
  const k = String(kode || '')
    .trim()
    .toLowerCase();

  if (k === 'ujian_mda_1' || k === 'ujian_mda_2' || k === 'raport' || k === 'raport_mda') {
    return 'mda';
  }
  if (k === 'infaq_madin' || k === 'psb_pendaftaran' || k.startsWith('psb_')) {
    return 'pendaftaran';
  }
  if (
    k === 'syahriyah' ||
    k.startsWith('syahriyah_') ||
    k === 'kalender' ||
    k === 'kalender_pondok' ||
    k === 'haul' ||
    k === 'haul_masyayikh' ||
    k === 'kesehatan' ||
    k === 'kesehatan_tahunan' ||
    k === 'al_adzkar' ||
    k === 'almamater' ||
    k === 'kitab_madin' ||
    k === 'ktl_tahun_lalu'
  ) {
    return 'operasional';
  }

  if (
    fallbackDompet === 'pendaftaran' ||
    fallbackDompet === 'operasional' ||
    fallbackDompet === 'kas_pondok' ||
    fallbackDompet === 'mda'
  ) {
    return fallbackDompet;
  }
  return 'operasional';
}

export function normalizeDompetKey(raw?: string | null): DompetType {
  if (
    raw === 'pendaftaran' ||
    raw === 'operasional' ||
    raw === 'kas_pondok' ||
    raw === 'mda'
  ) {
    return raw;
  }
  return 'operasional';
}

/**
 * Hitung saldo 4 Kartu Dompet (khusus TUNAI) & kartu laporan terpisah `Pemasukan Transfer`.
 * Seluruh pemasukan bermetode `transfer` tidak ditambahkan ke 4 kartu dompet tunai
 * dan hanya dirangkum dalam `syahriyahTransfer` (Pemasukan Transfer).
 */
export function computeWalletAndTransferSummary(
  transaksiList: WalletTxLike[],
  saldoAwal: WalletSaldoAwal,
  currentMonthStr: string
): WalletAndTransferSummary {
  const totals: Record<DompetType, number> = {
    pendaftaran: Number(saldoAwal.pendaftaran || 0),
    operasional: Number(saldoAwal.operasional || 0),
    kas_pondok: Number(saldoAwal.kas_pondok || 0),
    mda: Number(saldoAwal.mda || 0),
  };

  const byDompetMasuk: Record<DompetType, number> = {
    pendaftaran: 0,
    operasional: 0,
    kas_pondok: 0,
    mda: 0,
  };

  let tunaiMasukBulanIni = 0;
  let tunaiKeluarBulanIni = 0;
  let totalMasukAllTime = 0;
  let totalKeluarAllTime = 0;
  let bulanIniMasuk = 0;
  let bulanIniKeluar = 0;

  for (const tx of transaksiList) {
    const nom = Number(tx.nominal || 0);
    const dompet = normalizeDompetKey(tx.dompet);
    const isTransfer = tx.metode_pembayaran === 'transfer';
    const isThisMonth = Boolean(currentMonthStr && (tx.tgl_transaksi || '').startsWith(currentMonthStr));

    if (isTransfer) {
      if (tx.tipe === 'masuk') {
        totalMasukAllTime += nom;
        byDompetMasuk[dompet] += nom;
        if (isThisMonth) bulanIniMasuk += nom;
      } else {
        totalKeluarAllTime += nom;
        if (isThisMonth) bulanIniKeluar += nom;
      }
    } else {
      if (tx.tipe === 'masuk') {
        totals[dompet] += nom;
        if (isThisMonth) tunaiMasukBulanIni += nom;
      } else {
        totals[dompet] -= nom;
        if (isThisMonth) tunaiKeluarBulanIni += nom;
      }
    }
  }

  const grandTotalTunai =
    totals.pendaftaran + totals.operasional + totals.kas_pondok + totals.mda;

  return {
    totals,
    grandTotalTunai,
    tunaiMasukBulanIni,
    tunaiKeluarBulanIni,
    syahriyahTransfer: {
      totalMasukAllTime,
      totalKeluarAllTime,
      netAllTime: totalMasukAllTime - totalKeluarAllTime,
      bulanIniMasuk,
      bulanIniKeluar,
      byDompetMasuk,
    },
  };
}

/**
 * Nama kolom Excel template migrasi yang konsisten & backward-compatible dengan file lama.
 */
const LEGACY_MIGRASI_COL_ALIASES: Record<string, string[]> = {
  ujian_mda_1: ['Ujian_MDA_1_YA_TIDAK'],
  ujian_mda_2: ['Ujian_MDA_2_YA_TIDAK'],
  raport: ['Raport_YA_TIDAK', 'Raport_MDA_YA_TIDAK'],
  raport_mda: ['Raport_MDA_YA_TIDAK', 'Raport_YA_TIDAK'],
  kalender: ['Kalender_YA_TIDAK', 'Kalender_Pondok_YA_TIDAK'],
  kalender_pondok: ['Kalender_Pondok_YA_TIDAK', 'Kalender_YA_TIDAK'],
  haul: ['Haul_YA_TIDAK', 'Iuran_Haul_Masyayikh_YA_TIDAK'],
  haul_masyayikh: ['Haul_YA_TIDAK', 'Iuran_Haul_Masyayikh_YA_TIDAK'],
  kesehatan: ['Kesehatan_YA_TIDAK', 'Iuran_Kesehatan_Poskestren_YA_TIDAK'],
  kesehatan_tahunan: ['Kesehatan_YA_TIDAK', 'Iuran_Kesehatan_Poskestren_YA_TIDAK'],
  al_adzkar: ['Al_Adzkar_YA_TIDAK'],
  almamater: ['Almamater_YA_TIDAK'],
  kitab_madin: ['Kitab_Madin_YA_TIDAK'],
  infaq_madin: ['Infaq_Madin_YA_TIDAK'],
};

export function getMigrasiColNameForItem(kode: string, namaItem: string): string {
  const aliases = LEGACY_MIGRASI_COL_ALIASES[kode];
  if (aliases && aliases.length > 0) return aliases[0];
  const safe = namaItem
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
  return `${safe || kode}_YA_TIDAK`;
}

export function readMigrasiAnnualFlag(
  row: Record<string, unknown>,
  kode: string,
  namaItem: string
): boolean {
  const candidates = [
    getMigrasiColNameForItem(kode, namaItem),
    ...(LEGACY_MIGRASI_COL_ALIASES[kode] || []),
  ];
  for (const col of candidates) {
    const val = String(row[col] ?? '')
      .trim()
      .toUpperCase();
    if (val === 'YA' || val === 'YES' || val === 'TRUE' || val === '1') {
      return true;
    }
  }
  return false;
}

// ============================================================================
// PENYIMPANAN LAMPIRAN BUKTI TRANSFER & SCAN NOTA (DB + FALLBACK LOCALSTORAGE)
// ============================================================================

export const LS_KEUANGAN_LAMPIRAN_KEY = 'siap_keuangan_lampiran_v1';

export function readKeuanganLampiranMap(): Record<string, string> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(LS_KEUANGAN_LAMPIRAN_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, string>) : {};
  } catch {
    return {};
  }
}

export function writeKeuanganLampiranEntry(params: {
  txId?: string | null;
  noKuitansi?: string | null;
  url: string;
}): Record<string, string> {
  const map = readKeuanganLampiranMap();
  if (params.url) {
    if (params.txId) map[`tx:${params.txId}`] = params.url;
    if (params.noKuitansi) map[`kwt:${params.noKuitansi}`] = params.url;
  } else {
    if (params.txId) delete map[`tx:${params.txId}`];
    if (params.noKuitansi) delete map[`kwt:${params.noKuitansi}`];
  }
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(LS_KEUANGAN_LAMPIRAN_KEY, JSON.stringify(map));
    } catch {
      // ignore storage quota errors
    }
  }
  return map;
}

export function resolveTxLampiranUrl(
  tx: { id?: string | null; no_kuitansi?: string | null; lampiran_url?: string | null },
  localMap?: Record<string, string>
): string {
  const direct = String(tx.lampiran_url || '').trim();
  if (direct) return direct;
  const map = localMap ?? readKeuanganLampiranMap();
  if (tx.id && map[`tx:${tx.id}`]) return map[`tx:${tx.id}`];
  if (tx.no_kuitansi && map[`kwt:${tx.no_kuitansi}`]) return map[`kwt:${tx.no_kuitansi}`];
  return '';
}

/**
 * Kompresi gambar scan Nota Pembelian atau Bukti Transfer agar tetap tajam saat dicetak A4
 * (resolusi max 1600px, kualitas 0.85 JPEG) dan tetap cepat diunggah di HP.
 */
export async function compressScanImage(file: File): Promise<{
  blob: Blob;
  dataUrl: string;
}> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Gagal membaca file gambar.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Format gambar tidak didukung.'));
      img.onload = () => {
        const maxSide = 1600;
        let { width, height } = img;
        if (width > maxSide || height > maxSide) {
          if (width >= height) {
            height = Math.round((height * maxSide) / width);
            width = maxSide;
          } else {
            width = Math.round((width * maxSide) / height);
            height = maxSide;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas browser tidak tersedia.'));
          return;
        }
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error('Gagal memproses file scan gambar.'));
              return;
            }
            resolve({ blob, dataUrl });
          },
          'image/jpeg',
          0.85
        );
      };
      img.src = String(reader.result || '');
    };
    reader.readAsDataURL(file);
  });
}

export async function uploadKeuanganLampiranImage(
  file: File,
  kind: 'bukti_tf' | 'nota'
): Promise<string> {
  const { blob, dataUrl } = await compressScanImage(file);
  const path = `keuangan-lampiran/${kind}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.jpg`;

  for (const bucket of ['ttd-stempel', 'kegiatan-foto']) {
    try {
      const { error } = await supabase.storage
        .from(bucket)
        .upload(path, blob, { contentType: 'image/jpeg', upsert: true });
      if (!error) {
        const { data } = supabase.storage.from(bucket).getPublicUrl(path);
        if (data?.publicUrl) return data.publicUrl;
      }
    } catch {
      // try next bucket
    }
  }

  return dataUrl;
}

/**
 * Menyimpan baris ke `keuangan_transaksi` secara aman (otomatis tetap berhasil walaupun kolom
 * `lampiran_url` belum ditambahkan di Supabase, sambil menjaga URL di localStorage).
 */
export async function insertKeuanganTransaksiResilient(
  rows: Array<Record<string, unknown>>,
  attachmentUrl?: string
): Promise<{ error: { message?: string; code?: string } | null; insertedIds: string[] }> {
  const cleanUrl = String(attachmentUrl || '').trim();
  const payloadWithLampiran = cleanUrl
    ? rows.map((r) => ({ ...r, lampiran_url: cleanUrl }))
    : rows;

  const { data, error } = await supabase
    .from('keuangan_transaksi')
    .insert(payloadWithLampiran)
    .select('id, no_kuitansi');

  if (error && cleanUrl && isMissingColumnError(error)) {
    const fallbackPayload = rows.map((r) => {
      const copy = { ...r };
      delete copy.lampiran_url;
      return copy;
    });
    const retry = await supabase
      .from('keuangan_transaksi')
      .insert(fallbackPayload)
      .select('id, no_kuitansi');
    const insertedRows = Array.isArray(retry.data)
      ? (retry.data as Array<{ id?: string; no_kuitansi?: string | null }>)
      : [];
    insertedRows.forEach((ir) => {
      writeKeuanganLampiranEntry({ txId: ir.id, noKuitansi: ir.no_kuitansi, url: cleanUrl });
    });
    return {
      error: retry.error,
      insertedIds: insertedRows.map((r) => String(r.id || '')).filter(Boolean),
    };
  }

  const insertedRows = Array.isArray(data)
    ? (data as Array<{ id?: string; no_kuitansi?: string | null }>)
    : [];
  if (!error && cleanUrl) {
    insertedRows.forEach((ir) => {
      writeKeuanganLampiranEntry({ txId: ir.id, noKuitansi: ir.no_kuitansi, url: cleanUrl });
    });
  }

  return {
    error,
    insertedIds: insertedRows.map((r) => String(r.id || '')).filter(Boolean),
  };
}

/**
 * Memperbarui/menyusulkan lampiran foto untuk transaksi yang sudah ada (Buku Kas atau Kuitansi).
 */
export async function updateKeuanganLampiranResilient(params: {
  txId?: string | null;
  noKuitansi?: string | null;
  url: string;
}): Promise<{ persistedToDb: boolean }> {
  const cleanUrl = String(params.url || '').trim();
  writeKeuanganLampiranEntry({
    txId: params.txId,
    noKuitansi: params.noKuitansi,
    url: cleanUrl,
  });

  let persisted = true;
  if (params.noKuitansi) {
    const { error } = await supabase
      .from('keuangan_transaksi')
      .update({ lampiran_url: cleanUrl })
      .eq('no_kuitansi', params.noKuitansi);
    if (error && isMissingColumnError(error)) persisted = false;
  } else if (params.txId) {
    const { error } = await supabase
      .from('keuangan_transaksi')
      .update({ lampiran_url: cleanUrl })
      .eq('id', params.txId);
    if (error && isMissingColumnError(error)) persisted = false;
  }

  return { persistedToDb: persisted };
}

export const UNIFIED_KEUANGAN_PSB_SQL = `-- 1. Tambah kolom lampiran foto (Bukti Transfer & Scan Nota Pembelian) pada Keuangan
ALTER TABLE keuangan_transaksi
  ADD COLUMN IF NOT EXISTS lampiran_url text DEFAULT '';

-- 2. Pastikan pos Master Pembayaran sesuai pemetaan dompet terbaru
INSERT INTO master_pembayaran (kode, nama_item, tipe_periode, kategori_santri, dompet_tujuan, wajib_ndalem, aktif, urutan)
VALUES
  ('al_adzkar', 'Al-Adzkar', 'tahunan', 'semua', 'operasional', false, true, 10),
  ('almamater', 'Almamater', 'tahunan', 'semua', 'operasional', false, true, 11),
  ('kitab_madin', 'Kitab Madin', 'tahunan', 'semua', 'operasional', false, true, 12),
  ('infaq_madin', 'Infaq Madin', 'tahunan', 'semua', 'pendaftaran', false, true, 13)
ON CONFLICT (kode) DO UPDATE
SET
  nama_item = EXCLUDED.nama_item,
  dompet_tujuan = EXCLUDED.dompet_tujuan,
  aktif = true;

-- Isi tarif awal otomatis jika pos baru belum memiliki riwayat nominal
INSERT INTO master_pembayaran_riwayat (item_id, nominal, berlaku_mulai, catatan)
SELECT m.id,
  CASE m.kode
    WHEN 'al_adzkar' THEN 35000
    WHEN 'almamater' THEN 150000
    WHEN 'kitab_madin' THEN 120000
    WHEN 'infaq_madin' THEN 50000
    ELSE 50000
  END,
  '2026-07-01',
  'Tarif awal pos pembayaran baru'
FROM master_pembayaran m
WHERE m.kode IN ('al_adzkar', 'almamater', 'kitab_madin', 'infaq_madin')
  AND NOT EXISTS (
    SELECT 1 FROM master_pembayaran_riwayat r WHERE r.item_id = m.id
  );

-- 3. Pastikan tabel PSB tersedia
${PSB_TABLE_SQL}`;
