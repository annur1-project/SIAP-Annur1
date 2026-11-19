import { supabase } from '@/lib/supabase';
import {
  addDaysIso,
  extractSupabaseError,
  fetchTableWithFallback,
  formatHariTanggalIndo,
  formatTanggalPendek,
  getLocalTodayStr,
  isMissingRelationError,
  readLocalArray,
  writeLocalArray,
} from '@/lib/dapur';
import { compressImageForSarpras } from '@/lib/sarpras';

export {
  addDaysIso,
  extractSupabaseError,
  formatHariTanggalIndo,
  formatTanggalPendek,
  getLocalTodayStr,
};

export type KategoriKegiatan = 'rutin' | 'event_besar';
export type StatusKegiatan = 'terjadwal' | 'berlangsung' | 'selesai' | 'ditunda';
export type StatusSlotPengisi = 'belum' | 'siap' | 'selesai';

export interface KegiatanTemplateSlot {
  id: string;
  urutan: number;
  peran: string;
  catatan_default?: string;
}

export interface KegiatanFormatTemplate {
  id: string;
  nama_format: string;
  kategori_default: KategoriKegiatan;
  deskripsi: string;
  slots: KegiatanTemplateSlot[];
  bawaan: boolean;
  updated_at: string;
}

export interface KegiatanPengisiSlot {
  id: string;
  urutan: number;
  peran: string;
  petugas_nama: string;
  status: StatusSlotPengisi;
  catatan: string;
}

export interface KegiatanRundownItem {
  id: string;
  jam_mulai: string;
  jam_selesai: string;
  sesi: string;
  lokasi: string;
  pj: string;
  keterangan: string;
}

export interface KegiatanPanitiaItem {
  id: string;
  jabatan: string;
  nama: string;
  no_wa: string;
  tugas: string;
}

export interface KegiatanAgendaItem {
  id: string;
  kode_kegiatan: string;
  judul: string;
  kategori: KategoriKegiatan;
  format_id: string | null;
  format_nama: string;
  tanggal: string; // YYYY-MM-DD
  jam_mulai: string; // HH:mm
  jam_selesai: string; // HH:mm
  lokasi: string;
  penanggung_jawab: string;
  status: StatusKegiatan;
  pengisi_list: KegiatanPengisiSlot[];
  rundown_list: KegiatanRundownItem[];
  panitia_list: KegiatanPanitiaItem[];
  notulensi: string;
  dokumentasi_urls: string[];
  catatan: string;
  updated_at: string;
  created_at?: string;
}

export interface PersonelOption {
  id: string;
  nama: string;
  sumber: 'Pengurus' | 'Santri';
  info: string;
  no_wa?: string;
}

export const KEGIATAN_STORAGE_BUCKET = 'kegiatan-foto';
export const LS_KEGIATAN_FORMAT_KEY = 'siap_kegiatan_format_v1';
export const LS_KEGIATAN_AGENDA_KEY = 'siap_kegiatan_agenda_v1';
export const MAX_DOKUMENTASI_FOTO = 4;

export const LOKASI_KEGIATAN_OPTIONS = [
  'Masjid / Musholla Utama',
  'Aula Pondok Pesantren',
  'Halaman Tengah Pondok',
  'Serambi Ndalem',
  'Gedung Madrasah Diniyah',
  'Lapangan Pondok',
];

export const PANITIA_EVENT_PRESET: Array<{ jabatan: string; tugas: string }> = [
  { jabatan: 'Penanggung Jawab', tugas: 'Koordinasi umum dengan Pengasuh & Kepala Pondok' },
  { jabatan: 'Ketua Panitia', tugas: 'Memimpin persiapan, rapat panitia & pelaksanaan acara' },
  { jabatan: 'Sekretaris', tugas: 'Surat-menyurat, undangan, rundown & notulensi' },
  { jabatan: 'Bendahara', tugas: 'Pengelolaan anggaran & laporan nota kegiatan' },
  { jabatan: 'Sie Acara & Pengisi', tugas: 'Pengaturan MC, qori, penceramah & ketepatan rundown' },
  { jabatan: 'Sie Perlengkapan & Dekorasi', tugas: 'Panggung, sound system, terop, karpet & kebersihan lokasi' },
  { jabatan: 'Sie Konsumsi', tugas: 'Konsumsi tamu undangan, panitia & santri' },
  { jabatan: 'Sie Keamanan & Parkir', tugas: 'Ketertiban area pondok, tamu & kelancaran lalu lintas' },
  { jabatan: 'Sie Publikasi & Dokumentasi', tugas: 'Foto, video & pengarsipan laporan kegiatan' },
];

export function createKegiatanId(prefix = 'kgt'): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function buildDefaultFormatTemplates(): KegiatanFormatTemplate[] {
  const nowIso = '2026-01-01T00:00:00.000Z';

  const burdahSlots: KegiatanTemplateSlot[] = [
    { id: 'slot-burdah-1', urutan: 1, peran: 'Tawasul' },
    ...Array.from({ length: 10 }, (_, idx) => ({
      id: `slot-burdah-${idx + 2}`,
      urutan: idx + 2,
      peran: `Fashl ${idx + 1}`,
    })),
    { id: 'slot-burdah-12', urutan: 12, peran: 'Doa' },
  ];

  const dibaSlots: KegiatanTemplateSlot[] = [
    { id: 'slot-diba-1', urutan: 1, peran: 'Tawasul & Pembukaan' },
    { id: 'slot-diba-2', urutan: 2, peran: 'Ya Nabi Salam Alaika' },
    { id: 'slot-diba-3', urutan: 3, peran: 'Rawi 1' },
    { id: 'slot-diba-4', urutan: 4, peran: 'Rawi 2' },
    { id: 'slot-diba-5', urutan: 5, peran: 'Mahallul Qiyam' },
    { id: 'slot-diba-6', urutan: 6, peran: 'Rawi 3' },
    { id: 'slot-diba-7', urutan: 7, peran: 'Rawi 4' },
    { id: 'slot-diba-8', urutan: 8, peran: 'Qoshidah Penutup' },
    { id: 'slot-diba-9', urutan: 9, peran: 'Doa' },
  ];

  const manaqibSlots: KegiatanTemplateSlot[] = [
    { id: 'slot-manaqib-1', urutan: 1, peran: 'Tawasul' },
    { id: 'slot-manaqib-2', urutan: 2, peran: 'Manaqib Bab 1–2' },
    { id: 'slot-manaqib-3', urutan: 3, peran: 'Manaqib Bab 3–4' },
    { id: 'slot-manaqib-4', urutan: 4, peran: 'Manaqib Bab 5–6' },
    { id: 'slot-manaqib-5', urutan: 5, peran: 'Manaqib Bab 7–8' },
    { id: 'slot-manaqib-6', urutan: 6, peran: 'Tahlil Singkat' },
    { id: 'slot-manaqib-7', urutan: 7, peran: 'Doa Manaqib' },
  ];

  const muhadhorohSlots: KegiatanTemplateSlot[] = [
    { id: 'slot-muh-1', urutan: 1, peran: 'Pembawa Acara (MC)' },
    { id: 'slot-muh-2', urutan: 2, peran: "Qori' / Tilawah" },
    { id: 'slot-muh-3', urutan: 3, peran: 'Sambutan Pembina / Pengurus' },
    { id: 'slot-muh-4', urutan: 4, peran: 'Khitobah 1 (Bahasa Indonesia)' },
    { id: 'slot-muh-5', urutan: 5, peran: 'Khitobah 2 (Bahasa Arab / Jawa)' },
    { id: 'slot-muh-6', urutan: 6, peran: 'Doa Penutup' },
  ];

  const khotmilSlots: KegiatanTemplateSlot[] = [
    { id: 'slot-khm-1', urutan: 1, peran: 'Tawasul & Iftitah' },
    { id: 'slot-khm-2', urutan: 2, peran: 'Juz 1–10' },
    { id: 'slot-khm-3', urutan: 3, peran: 'Juz 11–20' },
    { id: 'slot-khm-4', urutan: 4, peran: 'Juz 21–29' },
    { id: 'slot-khm-5', urutan: 5, peran: 'Khotaman (Juz 30 & Surat Pendek)' },
    { id: 'slot-khm-6', urutan: 6, peran: "Doa Khotmil Qur'an" },
  ];

  const eventBesarSlots: KegiatanTemplateSlot[] = [
    { id: 'slot-ev-1', urutan: 1, peran: 'Pembawa Acara (MC)' },
    { id: 'slot-ev-2', urutan: 2, peran: "Qori' / Pembacaan Ayat Suci Al-Qur'an" },
    { id: 'slot-ev-3', urutan: 3, peran: 'Tawasul & Pembacaan Sholawat' },
    { id: 'slot-ev-4', urutan: 4, peran: 'Sambutan Ketua Panitia' },
    { id: 'slot-ev-5', urutan: 5, peran: 'Sambutan Pengasuh / Kepala Pondok' },
    { id: 'slot-ev-6', urutan: 6, peran: "Mau'idoh Hasanah / Pembicara Utama" },
    { id: 'slot-ev-7', urutan: 7, peran: 'Penyerahan Penghargaan / Santunan' },
    { id: 'slot-ev-8', urutan: 8, peran: 'Doa Penutup' },
  ];

  return [
    {
      id: 'fmt-burdah-12',
      nama_format: 'Pembacaan Burdah (10 Fashl)',
      kategori_default: 'rutin',
      deskripsi: '1 Tawasul, 10 Fashl (Fashl 1 s/d 10), dan 1 Doa (Total 12 slot pengisi)',
      slots: burdahSlots,
      bawaan: true,
      updated_at: nowIso,
    },
    {
      id: 'fmt-diba-9',
      nama_format: "Pembacaan Maulid Diba' / Barzanji",
      kategori_default: 'rutin',
      deskripsi: 'Tawasul, Ya Nabi Salam, Rawi 1–4, Mahallul Qiyam, Qoshidah & Doa',
      slots: dibaSlots,
      bawaan: true,
      updated_at: nowIso,
    },
    {
      id: 'fmt-manaqib-7',
      nama_format: 'Pembacaan Manaqib',
      kategori_default: 'rutin',
      deskripsi: 'Tawasul, pembagian Bab Manaqib, Tahlil singkat, dan Doa Manaqib',
      slots: manaqibSlots,
      bawaan: true,
      updated_at: nowIso,
    },
    {
      id: 'fmt-muhadhoroh-6',
      nama_format: 'Muhadhoroh / Latihan Khitobah',
      kategori_default: 'rutin',
      deskripsi: 'MC, Tilawah, Sambutan, Khitobah per bahasa, dan Doa',
      slots: muhadhorohSlots,
      bawaan: true,
      updated_at: nowIso,
    },
    {
      id: 'fmt-khotmil-6',
      nama_format: "Khotmil Qur'an",
      kategori_default: 'rutin',
      deskripsi: "Pembagian kelompok juz hingga Khotaman & Doa Khotmil Qur'an",
      slots: khotmilSlots,
      bawaan: true,
      updated_at: nowIso,
    },
    {
      id: 'fmt-event-besar-8',
      nama_format: 'Peringatan Hari Besar / Haul / Imtihan',
      kategori_default: 'event_besar',
      deskripsi: "Rangkaian pengisi acara akbar: MC, Qori', Sholawat, Sambutan, Mau'idoh & Doa",
      slots: eventBesarSlots,
      bawaan: true,
      updated_at: nowIso,
    },
  ];
}

export function generateKodeKegiatan(
  tanggalIso: string,
  existing: KegiatanAgendaItem[]
): string {
  const clean = (tanggalIso || getLocalTodayStr()).replace(/-/g, '');
  const yymm = clean.slice(2, 6);
  const prefix = `KGT-${yymm}-`;
  let maxNum = 0;
  for (const item of existing) {
    if (item.kode_kegiatan.startsWith(prefix)) {
      const tail = parseInt(item.kode_kegiatan.slice(prefix.length), 10);
      if (!Number.isNaN(tail) && tail > maxNum) maxNum = tail;
    }
  }
  return `${prefix}${String(maxNum + 1).padStart(3, '0')}`;
}

export function instantiatePengisiFromTemplate(
  template: KegiatanFormatTemplate | null | undefined
): KegiatanPengisiSlot[] {
  if (!template || !Array.isArray(template.slots)) return [];
  const sorted = [...template.slots].sort((a, b) => a.urutan - b.urutan);
  return sorted.map((s, idx) => ({
    id: createKegiatanId('pgs'),
    urutan: idx + 1,
    peran: s.peran,
    petugas_nama: '',
    status: 'belum',
    catatan: s.catatan_default || '',
  }));
}

export function instantiatePanitiaPreset(): KegiatanPanitiaItem[] {
  return PANITIA_EVENT_PRESET.map((p) => ({
    id: createKegiatanId('pnt'),
    jabatan: p.jabatan,
    nama: '',
    no_wa: '',
    tugas: p.tugas,
  }));
}

export function countPengisiProgress(slots: KegiatanPengisiSlot[]): {
  total: number;
  terisi: number;
  siap: number;
  selesai: number;
  persenTerisi: number;
} {
  const total = Array.isArray(slots) ? slots.length : 0;
  if (total === 0) {
    return { total: 0, terisi: 0, siap: 0, selesai: 0, persenTerisi: 0 };
  }
  let terisi = 0;
  let siap = 0;
  let selesai = 0;
  for (const s of slots) {
    if ((s.petugas_nama || '').trim().length > 0) terisi += 1;
    if (s.status === 'siap') siap += 1;
    if (s.status === 'selesai') selesai += 1;
  }
  return {
    total,
    terisi,
    siap,
    selesai,
    persenTerisi: Math.round((terisi / total) * 100),
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

export async function uploadKegiatanPhoto(file: File): Promise<{ url: string }> {
  const compressed = await compressImageForSarpras(file);
  const now = new Date();
  const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const filePath = `${ym}/dok-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${compressed.ext}`;

  try {
    const { error: uploadError } = await supabase.storage
      .from(KEGIATAN_STORAGE_BUCKET)
      .upload(filePath, compressed.blob, {
        contentType: compressed.mimeType,
        upsert: true,
      });

    if (uploadError) {
      return { url: compressed.dataUrlFallback };
    }

    const { data: urlData } = supabase.storage
      .from(KEGIATAN_STORAGE_BUCKET)
      .getPublicUrl(filePath);

    const publicUrl = urlData?.publicUrl || '';
    if (!publicUrl || publicUrl.startsWith('blob:') || !isSupabaseConfiguredClient()) {
      return { url: compressed.dataUrlFallback };
    }

    return { url: publicUrl };
  } catch {
    return { url: compressed.dataUrlFallback };
  }
}

function extractKegiatanStoragePath(url: string | null | undefined): string | null {
  if (!url || typeof url !== 'string') return null;
  if (url.startsWith('data:') || url.startsWith('blob:')) return null;
  const marker = `/object/public/${KEGIATAN_STORAGE_BUCKET}/`;
  const idx = url.indexOf(marker);
  if (idx === -1) return null;
  return decodeURIComponent(url.slice(idx + marker.length).split('?')[0]);
}

export async function removeKegiatanStoragePhotos(
  urls: Array<string | null | undefined>
): Promise<void> {
  const paths = urls
    .map((u) => extractKegiatanStoragePath(u))
    .filter((p): p is string => Boolean(p));
  if (paths.length === 0) return;

  try {
    const bucketClient = supabase.storage.from(KEGIATAN_STORAGE_BUCKET) as unknown as {
      remove?: (paths: string[]) => Promise<{ error?: unknown }>;
    };
    if (typeof bucketClient.remove === 'function') {
      await bucketClient.remove(paths);
    }
  } catch {
    // ignore storage cleanup errors
  }
}

function normalizeFormatTemplate(raw: KegiatanFormatTemplate): KegiatanFormatTemplate {
  const slots = Array.isArray(raw.slots) ? raw.slots : [];
  return {
    ...raw,
    slots: slots.map((s, idx) => ({
      id: s.id || createKegiatanId('slot'),
      urutan: typeof s.urutan === 'number' ? s.urutan : idx + 1,
      peran: s.peran || `Pengisi ${idx + 1}`,
      catatan_default: s.catatan_default || '',
    })),
  };
}

function normalizeAgendaItem(raw: KegiatanAgendaItem): KegiatanAgendaItem {
  return {
    ...raw,
    pengisi_list: Array.isArray(raw.pengisi_list) ? raw.pengisi_list : [],
    rundown_list: Array.isArray(raw.rundown_list) ? raw.rundown_list : [],
    panitia_list: Array.isArray(raw.panitia_list) ? raw.panitia_list : [],
    dokumentasi_urls: Array.isArray(raw.dokumentasi_urls) ? raw.dokumentasi_urls : [],
    notulensi: raw.notulensi || '',
    catatan: raw.catatan || '',
  };
}

export async function fetchKegiatanFormats(): Promise<KegiatanFormatTemplate[]> {
  const res = await fetchTableWithFallback<KegiatanFormatTemplate>(
    'kegiatan_format_template',
    LS_KEGIATAN_FORMAT_KEY,
    { col: 'nama_format', ascending: true }
  );
  const rows = (res.rows || []).map(normalizeFormatTemplate);
  if (rows.length > 0) return rows;

  const defaults = buildDefaultFormatTemplates();
  writeLocalArray(LS_KEGIATAN_FORMAT_KEY, defaults);
  return defaults;
}

export async function saveKegiatanFormatRow(
  item: KegiatanFormatTemplate,
  isEdit: boolean
): Promise<KegiatanFormatTemplate> {
  const normalized = normalizeFormatTemplate(item);
  const currentLocal = readLocalArray<KegiatanFormatTemplate>(LS_KEGIATAN_FORMAT_KEY);
  const baseList = currentLocal.length > 0 ? currentLocal : buildDefaultFormatTemplates();
  const nextLocal = isEdit
    ? baseList.map((r) => (r.id === normalized.id ? normalized : r))
    : [normalized, ...baseList];
  writeLocalArray(LS_KEGIATAN_FORMAT_KEY, nextLocal);

  try {
    if (isEdit) {
      const { error } = await supabase
        .from('kegiatan_format_template')
        .update({
          nama_format: normalized.nama_format,
          kategori_default: normalized.kategori_default,
          deskripsi: normalized.deskripsi,
          slots: normalized.slots,
          bawaan: normalized.bawaan,
          updated_at: normalized.updated_at,
        })
        .eq('id', normalized.id);
      if (error && !isMissingRelationError(error)) {
        // fallback already persisted in localStorage
      }
    } else {
      const { data, error } = await supabase
        .from('kegiatan_format_template')
        .insert([normalized])
        .select('*')
        .maybeSingle();
      if (!error && data) {
        return normalizeFormatTemplate(data as KegiatanFormatTemplate);
      }
    }
  } catch {
    // ignore fallback error
  }
  return normalized;
}

export async function deleteKegiatanFormatRow(id: string): Promise<void> {
  const currentLocal = readLocalArray<KegiatanFormatTemplate>(LS_KEGIATAN_FORMAT_KEY);
  writeLocalArray(
    LS_KEGIATAN_FORMAT_KEY,
    currentLocal.filter((r) => r.id !== id)
  );
  try {
    await supabase.from('kegiatan_format_template').delete().eq('id', id);
  } catch {
    // ignore fallback error
  }
}

export async function fetchKegiatanAgenda(): Promise<KegiatanAgendaItem[]> {
  const res = await fetchTableWithFallback<KegiatanAgendaItem>(
    'kegiatan_agenda',
    LS_KEGIATAN_AGENDA_KEY,
    { col: 'tanggal', ascending: true }
  );
  return (res.rows || []).map(normalizeAgendaItem);
}

export async function saveKegiatanAgendaRow(
  item: KegiatanAgendaItem,
  isEdit: boolean
): Promise<KegiatanAgendaItem> {
  const normalized = normalizeAgendaItem(item);
  const currentLocal = readLocalArray<KegiatanAgendaItem>(LS_KEGIATAN_AGENDA_KEY);
  const nextLocal = isEdit
    ? currentLocal.map((r) => (r.id === normalized.id ? normalized : r))
    : [normalized, ...currentLocal.filter((r) => r.id !== normalized.id)];
  writeLocalArray(LS_KEGIATAN_AGENDA_KEY, nextLocal);

  try {
    if (isEdit) {
      const { error } = await supabase
        .from('kegiatan_agenda')
        .update({
          kode_kegiatan: normalized.kode_kegiatan,
          judul: normalized.judul,
          kategori: normalized.kategori,
          format_id: normalized.format_id,
          format_nama: normalized.format_nama,
          tanggal: normalized.tanggal,
          jam_mulai: normalized.jam_mulai,
          jam_selesai: normalized.jam_selesai,
          lokasi: normalized.lokasi,
          penanggung_jawab: normalized.penanggung_jawab,
          status: normalized.status,
          pengisi_list: normalized.pengisi_list,
          rundown_list: normalized.rundown_list,
          panitia_list: normalized.panitia_list,
          notulensi: normalized.notulensi,
          dokumentasi_urls: normalized.dokumentasi_urls,
          catatan: normalized.catatan,
          updated_at: normalized.updated_at,
        })
        .eq('id', normalized.id);
      if (error && !isMissingRelationError(error)) {
        // local copy saved
      }
    } else {
      const { data, error } = await supabase
        .from('kegiatan_agenda')
        .insert([normalized])
        .select('*')
        .maybeSingle();
      if (!error && data) {
        return normalizeAgendaItem(data as KegiatanAgendaItem);
      }
    }
  } catch {
    // ignore fallback error
  }

  return normalized;
}

export async function deleteKegiatanAgendaRow(item: KegiatanAgendaItem): Promise<void> {
  if (Array.isArray(item.dokumentasi_urls) && item.dokumentasi_urls.length > 0) {
    await removeKegiatanStoragePhotos(item.dokumentasi_urls);
  }
  const currentLocal = readLocalArray<KegiatanAgendaItem>(LS_KEGIATAN_AGENDA_KEY);
  writeLocalArray(
    LS_KEGIATAN_AGENDA_KEY,
    currentLocal.filter((r) => r.id !== item.id)
  );
  try {
    await supabase.from('kegiatan_agenda').delete().eq('id', item.id);
  } catch {
    // ignore fallback error
  }
}

export async function fetchPersonelOptions(): Promise<PersonelOption[]> {
  const [pengurusRes, santriRes] = await Promise.all([
    supabase.from('pengurus').select('id, nama_lengkap, no_wa, status').eq('status', 'aktif'),
    supabase.from('santri').select('id, nama_lengkap, kamar, status'),
  ]);

  const options: PersonelOption[] = [];
  const seenNames = new Set<string>();

  if (!pengurusRes.error && Array.isArray(pengurusRes.data)) {
    for (const p of pengurusRes.data as Array<{
      id: string;
      nama_lengkap?: string;
      no_wa?: string | null;
    }>) {
      const nama = (p.nama_lengkap || '').trim();
      if (!nama || seenNames.has(nama.toLowerCase())) continue;
      seenNames.add(nama.toLowerCase());
      options.push({
        id: `p-${p.id}`,
        nama,
        sumber: 'Pengurus',
        info: 'Pengurus Pondok',
        no_wa: p.no_wa || '',
      });
    }
  }

  if (!santriRes.error && Array.isArray(santriRes.data)) {
    for (const s of santriRes.data as Array<{
      id: string;
      nama_lengkap?: string;
      kamar?: string;
      status?: string;
    }>) {
      if (s.status && !['aktif', 'ndalem', 'beasiswa_lazis'].includes(s.status)) continue;
      const nama = (s.nama_lengkap || '').trim();
      if (!nama || seenNames.has(nama.toLowerCase())) continue;
      seenNames.add(nama.toLowerCase());
      options.push({
        id: `s-${s.id}`,
        nama,
        sumber: 'Santri',
        info: s.kamar ? `Kamar ${s.kamar}` : 'Santri Aktif',
      });
    }
  }

  return options.sort((a, b) => a.nama.localeCompare(b.nama, 'id'));
}

export function buildKegiatanWaText(item: KegiatanAgendaItem): string {
  const kategoriLabel = item.kategori === 'event_besar' ? 'Event Besar' : 'Kegiatan Rutin';
  const lines: string[] = [
    `*JADWAL KEGIATAN e-PONDOK AN-NUR 1*`,
    `*${item.judul}* (${kategoriLabel})`,
    `Hari/Tgl: ${formatHariTanggalIndo(item.tanggal)}`,
    `Waktu: ${item.jam_mulai}${item.jam_selesai ? ` - ${item.jam_selesai}` : ''} WIB`,
    `Lokasi: ${item.lokasi || '-'}`,
    item.penanggung_jawab ? `Penanggung Jawab: ${item.penanggung_jawab}` : '',
    ``,
  ].filter(Boolean);

  if (item.pengisi_list.length > 0) {
    lines.push(`*RINCIAN PENGISI ACARA (${item.pengisi_list.length} Slot):*`);
    for (const s of [...item.pengisi_list].sort((a, b) => a.urutan - b.urutan)) {
      const petugas = s.petugas_nama.trim() || '_Belum ditunjuk_';
      const note = s.catatan.trim() ? ` (${s.catatan.trim()})` : '';
      lines.push(`${s.urutan}. ${s.peran}: *${petugas}*${note}`);
    }
    lines.push('');
  }

  if (item.rundown_list.length > 0) {
    lines.push(`*RUNDOWN ACARA:*`);
    for (const r of item.rundown_list) {
      const waktu = r.jam_selesai ? `${r.jam_mulai}-${r.jam_selesai}` : r.jam_mulai;
      lines.push(`- [${waktu} WIB] ${r.sesi}${r.pj ? ` (PJ: ${r.pj})` : ''}`);
    }
    lines.push('');
  }

  if (item.kategori === 'event_besar' && item.panitia_list.length > 0) {
    const filledPanitia = item.panitia_list.filter((p) => p.nama.trim().length > 0);
    if (filledPanitia.length > 0) {
      lines.push(`*SUSUNAN PANITIA:*`);
      for (const p of filledPanitia) {
        lines.push(`- ${p.jabatan}: ${p.nama}${p.no_wa ? ` (${p.no_wa})` : ''}`);
      }
    }
  }

  return lines.join('\n').trim();
}
