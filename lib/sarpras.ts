import { supabase } from '@/lib/supabase';
import {
  fetchTableWithFallback,
  getLocalTodayStr,
  isMissingRelationError,
  readLocalArray,
  writeLocalArray,
  formatRupiah,
  formatTanggalPendek,
  extractSupabaseError,
} from '@/lib/dapur';

export { getLocalTodayStr, formatRupiah, formatTanggalPendek, extractSupabaseError };

export type UrgensiSarpras = 'biasa' | 'penting' | 'darurat';
export type StatusLaporanSarpras = 'menunggu' | 'diproses' | 'selesai';
export type KondisiAsetSarpras = 'baik' | 'rusak_ringan' | 'rusak_berat';

export interface SarprasInventarisItem {
  id: string;
  kode_aset: string;
  nama_barang: string;
  kategori: string;
  ruangan: string;
  jumlah: number;
  satuan: string;
  kondisi: KondisiAsetSarpras;
  tahun_perolehan: string;
  sumber_dana: string;
  nilai_satuan: number;
  catatan: string;
  updated_at: string;
  created_at?: string;
}

export interface SarprasLaporanItem {
  id: string;
  kode_tiket: string;
  tanggal_lapor: string; // YYYY-MM-DD
  pelapor_nama: string;
  ruangan: string;
  inventaris_id: string | null;
  judul_kerusakan: string;
  rincian: string;
  urgensi: UrgensiSarpras;
  status: StatusLaporanSarpras;
  foto_rusak_url: string | null;
  foto_proses_url: string | null;
  foto_selesai_url: string | null;
  petugas_sarpras: string;
  catatan_proses: string;
  catatan_selesai: string;
  biaya_perbaikan: number;
  tgl_proses: string | null; // YYYY-MM-DD
  tgl_selesai: string | null; // YYYY-MM-DD
  ukuran_total_kb: number;
  created_at?: string;
}

export interface CompressedImageResult {
  blob: Blob;
  dataUrlFallback: string;
  originalKb: number;
  compressedKb: number;
  ext: 'webp' | 'jpg';
  mimeType: 'image/webp' | 'image/jpeg';
  width: number;
  height: number;
}

export interface UploadPhotoResult {
  url: string;
  compressedKb: number;
  originalKb: number;
  usedStorage: boolean;
  bucketMissing: boolean;
}

export const SARPRAS_STORAGE_BUCKET = 'sarpras-foto';
export const LS_SARPRAS_INVENTARIS_KEY = 'siap_sarpras_inventaris_v1';
export const LS_SARPRAS_LAPORAN_KEY = 'siap_sarpras_laporan_v1';

export const SARPRAS_RUANGAN_DEFAULT: string[] = [
  'Kamar A1',
  'Kamar A2',
  'Kamar A3',
  'Kamar A4',
  'Kamar A5',
  'Kamar A6',
  'Kamar A7',
  'Kamar A8',
  'Kamar A9',
  'Kamar A10',
  'Kamar C1',
  'Kamar C2',
  'Kamar C3',
  'Kamar C4',
  'Kamar C5',
  'Kamar C6',
  'Al-Fachriyah 1 (VIP)',
  'Al-Fachriyah 2 (VIP)',
  'Al-Fachriyah 3 (VIP)',
  'Al-Fachriyah 4 (VIP)',
  'Ndalem',
  'Masjid / Musholla',
  'Aula Pondok',
  'Kantor Pondok / TU',
  'Dapur Umum',
  'Poskestren / UKS',
  'Kamar Mandi / MCK Putra',
  'Perpustakaan / Madin',
  'Halaman & Gerbang',
  'Gudang Sarpras',
];

export const SARPRAS_KATEGORI: string[] = [
  'Bangunan & Kamar',
  'Listrik & Penerangan',
  'Air & Sanitasi',
  'Mebel & Kasur',
  'Elektronik & Audio',
  'Peralatan Kebersihan & Lainnya',
];

export const SARPRAS_SATUAN_OPTIONS: string[] = [
  'Unit',
  'Buah',
  'Set',
  'Lembar',
  'Pasang',
  'Titik',
  'Meter',
];

export const SARPRAS_SETUP_SQL = `-- 1. Tabel Inventaris Pondok per Ruangan
CREATE TABLE IF NOT EXISTS sarpras_inventaris (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  kode_aset text NOT NULL,
  nama_barang text NOT NULL,
  kategori text NOT NULL DEFAULT 'Mebel & Kasur',
  ruangan text NOT NULL,
  jumlah integer NOT NULL DEFAULT 1,
  satuan text NOT NULL DEFAULT 'Unit',
  kondisi text NOT NULL DEFAULT 'baik' CHECK (kondisi IN ('baik', 'rusak_ringan', 'rusak_berat')),
  tahun_perolehan text DEFAULT '',
  sumber_dana text DEFAULT 'Kas Pondok',
  nilai_satuan integer NOT NULL DEFAULT 0,
  catatan text DEFAULT '',
  updated_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

-- 2. Tabel Laporan Kerusakan Sarpras (Hemat DB: hanya simpan URL foto, bukan file biner)
CREATE TABLE IF NOT EXISTS sarpras_laporan (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  kode_tiket text NOT NULL,
  tanggal_lapor date NOT NULL,
  pelapor_nama text NOT NULL,
  ruangan text NOT NULL,
  inventaris_id text,
  judul_kerusakan text NOT NULL,
  rincian text DEFAULT '',
  urgensi text NOT NULL DEFAULT 'biasa' CHECK (urgensi IN ('biasa', 'penting', 'darurat')),
  status text NOT NULL DEFAULT 'menunggu' CHECK (status IN ('menunggu', 'diproses', 'selesai')),
  foto_rusak_url text,
  foto_proses_url text,
  foto_selesai_url text,
  petugas_sarpras text DEFAULT '',
  catatan_proses text DEFAULT '',
  catatan_selesai text DEFAULT '',
  biaya_perbaikan integer NOT NULL DEFAULT 0,
  tgl_proses date,
  tgl_selesai date,
  ukuran_total_kb integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- 3. Bucket Storage Hemat Kuota (~60KB per foto WebP/JPEG)
INSERT INTO storage.buckets (id, name, public)
VALUES ('sarpras-foto', 'sarpras-foto', true)
ON CONFLICT (id) DO NOTHING;

-- 4. Policy Akses Bucket sarpras-foto (Izinkan baca, upload & hapus foto lama)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'sarpras_foto_select'
  ) THEN
    CREATE POLICY sarpras_foto_select ON storage.objects FOR SELECT USING (bucket_id = 'sarpras-foto');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'sarpras_foto_insert'
  ) THEN
    CREATE POLICY sarpras_foto_insert ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'sarpras-foto');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'sarpras_foto_update'
  ) THEN
    CREATE POLICY sarpras_foto_update ON storage.objects FOR UPDATE USING (bucket_id = 'sarpras-foto');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'sarpras_foto_delete'
  ) THEN
    CREATE POLICY sarpras_foto_delete ON storage.objects FOR DELETE USING (bucket_id = 'sarpras-foto');
  END IF;
END $$;`;

export function createSarprasId(prefix = 'srp'): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function extractRoomShortCode(ruangan: string): string {
  const clean = ruangan.trim().toUpperCase();
  const kamarMatch = clean.match(/\b([AC]\d{1,2})\b/);
  if (kamarMatch) return kamarMatch[1];
  const vipMatch = clean.match(/AL-FACHRIYAH\s*(\d+)/);
  if (vipMatch) return `VIP${vipMatch[1]}`;
  const words = clean
    .replace(/[^A-Z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return 'UMM';
  if (words.length === 1) return words[0].slice(0, 4);
  return words
    .slice(0, 3)
    .map((w) => w.slice(0, 2))
    .join('')
    .slice(0, 5);
}

export function generateKodeAset(
  ruangan: string,
  existing: SarprasInventarisItem[]
): string {
  const roomCode = extractRoomShortCode(ruangan || 'Umum');
  const prefix = `INV-${roomCode}-`;
  let maxNum = 0;
  for (const item of existing) {
    if (item.kode_aset.startsWith(prefix)) {
      const tail = parseInt(item.kode_aset.slice(prefix.length), 10);
      if (!Number.isNaN(tail) && tail > maxNum) maxNum = tail;
    }
  }
  return `${prefix}${String(maxNum + 1).padStart(3, '0')}`;
}

export function generateKodeTiket(
  tanggalIso: string,
  existing: SarprasLaporanItem[]
): string {
  const clean = (tanggalIso || getLocalTodayStr()).replace(/-/g, '');
  const yymm = clean.slice(2, 6); // e.g., 2611
  const prefix = `SRP-${yymm}-`;
  let maxNum = 0;
  for (const item of existing) {
    if (item.kode_tiket.startsWith(prefix)) {
      const tail = parseInt(item.kode_tiket.slice(prefix.length), 10);
      if (!Number.isNaN(tail) && tail > maxNum) maxNum = tail;
    }
  }
  return `${prefix}${String(maxNum + 1).padStart(3, '0')}`;
}

export function formatKbSize(kb: number): string {
  if (!kb || kb <= 0) return '0 KB';
  if (kb >= 1024) return `${(kb / 1024).toFixed(2)} MB`;
  return `${Math.round(kb)} KB`;
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(new Error('Gagal membaca hasil kompresi gambar.'));
    reader.readAsDataURL(blob);
  });
}

function loadImageElement(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('File yang dipilih bukan gambar yang valid.'));
    };
    img.src = objectUrl;
  });
}

function canvasToBlobAsync(
  canvas: HTMLCanvasElement,
  mimeType: string,
  quality: number
): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), mimeType, quality);
  });
}

/**
 * Kompresi foto di sisi browser sebelum upload ke Supabase Storage.
 * Target ukuran ~40–80 KB dengan sisi terpanjang maks 960px agar kuota Supabase Free (1 GB) sangat awet.
 */
export async function compressImageForSarpras(file: File): Promise<CompressedImageResult> {
  const originalKb = Math.max(1, Math.round(file.size / 1024));
  const img = await loadImageElement(file);

  const renderAtMaxDim = async (
    maxDim: number,
    mimeType: 'image/webp' | 'image/jpeg',
    quality: number
  ): Promise<{ blob: Blob; width: number; height: number } | null> => {
    const scale = Math.min(1, maxDim / Math.max(img.width || 1, img.height || 1));
    const width = Math.max(1, Math.round((img.width || maxDim) * scale));
    const height = Math.max(1, Math.round((img.height || maxDim) * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);
    const blob = await canvasToBlobAsync(canvas, mimeType, quality);
    if (!blob) return null;
    return { blob, width, height };
  };

  // Pass 1: WebP 960px quality 0.62
  let chosenMime: 'image/webp' | 'image/jpeg' = 'image/webp';
  let chosenExt: 'webp' | 'jpg' = 'webp';
  let attempt = await renderAtMaxDim(960, 'image/webp', 0.62);

  // Check if browser actually encoded WebP (some Safari/older browsers fall back to image/png)
  if (!attempt || attempt.blob.type !== 'image/webp') {
    chosenMime = 'image/jpeg';
    chosenExt = 'jpg';
    attempt = await renderAtMaxDim(960, 'image/jpeg', 0.68);
  }

  // Pass 2: If still > 85 KB, tighten dimension & quality so consistently ~40-80 KB
  if (attempt && attempt.blob.size > 85 * 1024) {
    const tighter = await renderAtMaxDim(
      760,
      chosenMime,
      chosenMime === 'image/webp' ? 0.5 : 0.55
    );
    if (tighter && tighter.blob.size < attempt.blob.size) {
      attempt = tighter;
    }
  }

  // Pass 3: Extreme high-detail image still > 95 KB -> 640px quality 0.45
  if (attempt && attempt.blob.size > 95 * 1024) {
    const smallest = await renderAtMaxDim(640, chosenMime, 0.45);
    if (smallest && smallest.blob.size < attempt.blob.size) {
      attempt = smallest;
    }
  }

  if (!attempt) {
    throw new Error('Peramban gagal memproses kompresi gambar.');
  }

  const dataUrlFallback = await blobToDataUrl(attempt.blob);
  const compressedKb = Math.max(1, Math.round(attempt.blob.size / 1024));

  return {
    blob: attempt.blob,
    dataUrlFallback,
    originalKb,
    compressedKb,
    ext: chosenExt,
    mimeType: chosenMime,
    width: attempt.width,
    height: attempt.height,
  };
}

function isSupabaseConfiguredClient(): boolean {
  const inlineUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
  const inlineKey = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').trim();
  if (inlineUrl && inlineKey) return true;
  if (typeof window !== 'undefined') {
    const winEnv = (
      window as unknown as { __SIAP_SUPABASE_ENV__?: { url?: string; anonKey?: string } }
    ).__SIAP_SUPABASE_ENV__;
    if (winEnv?.url && winEnv?.anonKey) return true;
  }
  return false;
}

export async function uploadSarprasPhoto(
  file: File,
  stagePrefix: 'rusak' | 'proses' | 'selesai'
): Promise<UploadPhotoResult> {
  const compressed = await compressImageForSarpras(file);
  const now = new Date();
  const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const filePath = `${ym}/${stagePrefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${compressed.ext}`;

  try {
    const { error: uploadError } = await supabase.storage
      .from(SARPRAS_STORAGE_BUCKET)
      .upload(filePath, compressed.blob, {
        contentType: compressed.mimeType,
        upsert: true,
      });

    if (uploadError) {
      const msg = extractSupabaseError(uploadError, '');
      const bucketMissing =
        msg.toLowerCase().includes('bucket') ||
        msg.toLowerCase().includes('not found') ||
        msg.toLowerCase().includes('policy') ||
        msg.toLowerCase().includes('row-level security');
      return {
        url: compressed.dataUrlFallback,
        compressedKb: compressed.compressedKb,
        originalKb: compressed.originalKb,
        usedStorage: false,
        bucketMissing,
      };
    }

    const { data: urlData } = supabase.storage
      .from(SARPRAS_STORAGE_BUCKET)
      .getPublicUrl(filePath);

    const publicUrl = urlData?.publicUrl || '';
    // Jika masih mode mock (publicUrl berupa blob: sementara), gunakan dataUrl terkompresi (~60KB)
    // agar pratinjau tetap muncul setelah reload halaman.
    if (!publicUrl || publicUrl.startsWith('blob:') || !isSupabaseConfiguredClient()) {
      return {
        url: compressed.dataUrlFallback,
        compressedKb: compressed.compressedKb,
        originalKb: compressed.originalKb,
        usedStorage: false,
        bucketMissing: false,
      };
    }

    return {
      url: publicUrl,
      compressedKb: compressed.compressedKb,
      originalKb: compressed.originalKb,
      usedStorage: true,
      bucketMissing: false,
    };
  } catch {
    return {
      url: compressed.dataUrlFallback,
      compressedKb: compressed.compressedKb,
      originalKb: compressed.originalKb,
      usedStorage: false,
      bucketMissing: true,
    };
  }
}

export function extractStoragePathFromUrl(url: string | null | undefined): string | null {
  if (!url || typeof url !== 'string') return null;
  if (url.startsWith('data:') || url.startsWith('blob:')) return null;
  const marker = `/object/public/${SARPRAS_STORAGE_BUCKET}/`;
  const idx = url.indexOf(marker);
  if (idx === -1) return null;
  return decodeURIComponent(url.slice(idx + marker.length).split('?')[0]);
}

export async function removeSarprasStoragePhotos(urls: Array<string | null | undefined>): Promise<void> {
  const paths = urls
    .map((u) => extractStoragePathFromUrl(u))
    .filter((p): p is string => Boolean(p));
  if (paths.length === 0) return;

  try {
    const bucketClient = supabase.storage.from(SARPRAS_STORAGE_BUCKET) as unknown as {
      remove?: (paths: string[]) => Promise<{ error?: unknown }>;
    };
    if (typeof bucketClient.remove === 'function') {
      await bucketClient.remove(paths);
    }
  } catch {
    // Ignore cleanup errors on mock / unconfigured storage
  }
}

// ==========================================
// DATA ACCESS HELPERS (SUPABASE + FALLBACK)
// ==========================================

export async function fetchSarprasInventaris(): Promise<{
  rows: SarprasInventarisItem[];
  usingLocal: boolean;
}> {
  return fetchTableWithFallback<SarprasInventarisItem>(
    'sarpras_inventaris',
    LS_SARPRAS_INVENTARIS_KEY,
    { col: 'ruangan', ascending: true }
  );
}

export async function fetchSarprasLaporan(): Promise<{
  rows: SarprasLaporanItem[];
  usingLocal: boolean;
}> {
  return fetchTableWithFallback<SarprasLaporanItem>(
    'sarpras_laporan',
    LS_SARPRAS_LAPORAN_KEY,
    { col: 'tanggal_lapor', ascending: false }
  );
}

export async function saveSarprasInventarisRow(
  item: SarprasInventarisItem,
  isEdit: boolean
): Promise<{ saved: SarprasInventarisItem; usingLocal: boolean }> {
  const localRows = readLocalArray<SarprasInventarisItem>(LS_SARPRAS_INVENTARIS_KEY);
  const nextLocal = isEdit
    ? localRows.map((r) => (r.id === item.id ? item : r))
    : [item, ...localRows];
  writeLocalArray(LS_SARPRAS_INVENTARIS_KEY, nextLocal);

  try {
    if (isEdit) {
      const { error } = await supabase
        .from('sarpras_inventaris')
        .update({
          kode_aset: item.kode_aset,
          nama_barang: item.nama_barang,
          kategori: item.kategori,
          ruangan: item.ruangan,
          jumlah: item.jumlah,
          satuan: item.satuan,
          kondisi: item.kondisi,
          tahun_perolehan: item.tahun_perolehan,
          sumber_dana: item.sumber_dana,
          nilai_satuan: item.nilai_satuan,
          catatan: item.catatan,
          updated_at: item.updated_at,
        })
        .eq('id', item.id);
      if (error) {
        if (isMissingRelationError(error)) return { saved: item, usingLocal: true };
        throw error;
      }
      return { saved: item, usingLocal: false };
    } else {
      const { data, error } = await supabase
        .from('sarpras_inventaris')
        .insert([item])
        .select('*')
        .maybeSingle();
      if (error) {
        if (isMissingRelationError(error)) return { saved: item, usingLocal: true };
        throw error;
      }
      const saved = (data as SarprasInventarisItem) || item;
      return { saved, usingLocal: false };
    }
  } catch (err) {
    if (isMissingRelationError(err)) return { saved: item, usingLocal: true };
    return { saved: item, usingLocal: true };
  }
}

export async function deleteSarprasInventarisRow(id: string): Promise<void> {
  const localRows = readLocalArray<SarprasInventarisItem>(LS_SARPRAS_INVENTARIS_KEY);
  writeLocalArray(
    LS_SARPRAS_INVENTARIS_KEY,
    localRows.filter((r) => r.id !== id)
  );
  try {
    await supabase.from('sarpras_inventaris').delete().eq('id', id);
  } catch {
    // ignore fallback error
  }
}

export async function createSarprasLaporanRow(
  item: SarprasLaporanItem
): Promise<{ saved: SarprasLaporanItem; usingLocal: boolean }> {
  const localRows = readLocalArray<SarprasLaporanItem>(LS_SARPRAS_LAPORAN_KEY);
  writeLocalArray(LS_SARPRAS_LAPORAN_KEY, [item, ...localRows.filter((r) => r.id !== item.id)]);

  try {
    const { data, error } = await supabase
      .from('sarpras_laporan')
      .insert([item])
      .select('*')
      .maybeSingle();
    if (error) {
      if (isMissingRelationError(error)) return { saved: item, usingLocal: true };
      throw error;
    }
    const saved = (data as SarprasLaporanItem) || item;
    return { saved, usingLocal: false };
  } catch (err) {
    if (isMissingRelationError(err)) return { saved: item, usingLocal: true };
    return { saved: item, usingLocal: true };
  }
}

export async function updateSarprasLaporanRow(
  id: string,
  patch: Partial<SarprasLaporanItem>
): Promise<{ usingLocal: boolean }> {
  const localRows = readLocalArray<SarprasLaporanItem>(LS_SARPRAS_LAPORAN_KEY);
  writeLocalArray(
    LS_SARPRAS_LAPORAN_KEY,
    localRows.map((r) => (r.id === id ? { ...r, ...patch } : r))
  );

  try {
    const { error } = await supabase.from('sarpras_laporan').update(patch).eq('id', id);
    if (error) {
      if (isMissingRelationError(error)) return { usingLocal: true };
      throw error;
    }
    return { usingLocal: false };
  } catch (err) {
    if (isMissingRelationError(err)) return { usingLocal: true };
    return { usingLocal: true };
  }
}

export async function deleteSarprasLaporanRow(item: SarprasLaporanItem): Promise<void> {
  await removeSarprasStoragePhotos([
    item.foto_rusak_url,
    item.foto_proses_url,
    item.foto_selesai_url,
  ]);

  const localRows = readLocalArray<SarprasLaporanItem>(LS_SARPRAS_LAPORAN_KEY);
  writeLocalArray(
    LS_SARPRAS_LAPORAN_KEY,
    localRows.filter((r) => r.id !== item.id)
  );

  try {
    await supabase.from('sarpras_laporan').delete().eq('id', item.id);
  } catch {
    // ignore fallback error
  }
}
