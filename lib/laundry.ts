import { supabase } from '@/lib/supabase';
import {
  extractSupabaseError,
  fetchTableWithFallback,
  formatHariTanggalIndo,
  formatTanggalPendek,
  getLocalTodayStr,
  isMissingRelationError,
  readLocalArray,
  writeLocalArray,
} from '@/lib/dapur';

export {
  extractSupabaseError,
  formatHariTanggalIndo,
  formatTanggalPendek,
  getLocalTodayStr,
};

export type HariLaundryKey =
  | 'senin'
  | 'selasa'
  | 'rabu'
  | 'kamis'
  | 'jumat'
  | 'sabtu'
  | 'ahad';

export type HariOperasionalKey = HariLaundryKey;
export type StatusLaundry = 'masuk' | 'selesai';
export type TipeSetoranLaundry = 'terjadwal' | 'susulan';

export interface LaundryJadwalKamar {
  id: string;
  hari_key: HariOperasionalKey;
  hari_label: string;
  kamar_list: string[];
  updated_at: string;
}

export interface LaundryCatatanItem {
  id: string;
  tanggal: string; // YYYY-MM-DD
  hari_key: HariLaundryKey;
  kamar: string;
  jumlah_potong: number;
  status: StatusLaundry;
  tipe_setoran: TipeSetoranLaundry;
  jam_masuk: string; // HH:mm
  jam_selesai: string; // HH:mm
  catatan: string;
  updated_at: string;
  created_at?: string;
}

export const LS_LAUNDRY_JADWAL_KEY = 'siap_laundry_jadwal_v1';
export const LS_LAUNDRY_CATATAN_KEY = 'siap_laundry_catatan_v1';

export const HARI_OPERASIONAL_LIST: Array<{
  key: HariOperasionalKey;
  label: string;
}> = [
  { key: 'senin', label: 'Senin' },
  { key: 'selasa', label: 'Selasa' },
  { key: 'rabu', label: 'Rabu' },
  { key: 'kamis', label: 'Kamis' },
  { key: 'sabtu', label: 'Sabtu' },
  { key: 'ahad', label: 'Ahad' },
];

export const HARI_LABEL_MAP: Record<HariLaundryKey, string> = {
  senin: 'Senin',
  selasa: 'Selasa',
  rabu: 'Rabu',
  kamis: 'Kamis',
  jumat: 'Jumat',
  sabtu: 'Sabtu',
  ahad: 'Ahad',
};

export const DEFAULT_KAMAR_PONDOK: string[] = [
  'A1',
  'A2',
  'A3',
  'A4',
  'A5',
  'A6',
  'A7',
  'A8',
  'A9',
  'A10',
  'C1',
  'C2',
  'C3',
  'C4',
  'C5',
  'C6',
  'Tahfidz',
  'Al-Fachriyah 1 (VIP)',
  'Al-Fachriyah 2 (VIP)',
  'Al-Fachriyah 3 (VIP)',
  'Al-Fachriyah 4 (VIP)',
];

export function createLaundryId(prefix = 'lnd'): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function getHariKeyFromIso(isoDate: string): HariLaundryKey {
  const parts = (isoDate || '').split('-').map((n) => parseInt(n, 10));
  if (parts.length !== 3) return 'senin';
  const dt = new Date(parts[0], parts[1] - 1, parts[2]);
  const map: HariLaundryKey[] = [
    'ahad',
    'senin',
    'selasa',
    'rabu',
    'kamis',
    'jumat',
    'sabtu',
  ];
  return map[dt.getDay()] || 'senin';
}

export function isHariLiburLaundry(
  isoDate: string,
  hariLibur: HariLaundryKey = 'jumat'
): boolean {
  return getHariKeyFromIso(isoDate) === hariLibur;
}

export function getCurrentHmLocal(): string {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
}

export function buildDefaultJadwalKamar(): LaundryJadwalKamar[] {
  const nowIso = '2026-01-01T00:00:00.000Z';
  return [
    {
      id: 'ljk-senin',
      hari_key: 'senin',
      hari_label: 'Senin',
      kamar_list: ['A1', 'A2', 'A3', 'A4'],
      updated_at: nowIso,
    },
    {
      id: 'ljk-selasa',
      hari_key: 'selasa',
      hari_label: 'Selasa',
      kamar_list: ['A5', 'A6', 'A7', 'A8'],
      updated_at: nowIso,
    },
    {
      id: 'ljk-rabu',
      hari_key: 'rabu',
      hari_label: 'Rabu',
      kamar_list: ['A9', 'A10', 'C1', 'C2'],
      updated_at: nowIso,
    },
    {
      id: 'ljk-kamis',
      hari_key: 'kamis',
      hari_label: 'Kamis',
      kamar_list: ['C3', 'C4', 'C5', 'C6'],
      updated_at: nowIso,
    },
    {
      id: 'ljk-sabtu',
      hari_key: 'sabtu',
      hari_label: 'Sabtu',
      kamar_list: ['Tahfidz', 'Al-Fachriyah 1 (VIP)', 'Al-Fachriyah 2 (VIP)'],
      updated_at: nowIso,
    },
    {
      id: 'ljk-ahad',
      hari_key: 'ahad',
      hari_label: 'Ahad',
      kamar_list: ['Al-Fachriyah 3 (VIP)', 'Al-Fachriyah 4 (VIP)'],
      updated_at: nowIso,
    },
  ];
}

function normalizeJadwalRows(rows: LaundryJadwalKamar[]): LaundryJadwalKamar[] {
  const defaults = buildDefaultJadwalKamar();
  const byKey = new Map<HariLaundryKey, LaundryJadwalKamar>();
  for (const r of rows) {
    if (r.hari_key && HARI_LABEL_MAP[r.hari_key]) {
      byKey.set(r.hari_key, {
        ...r,
        hari_label: HARI_LABEL_MAP[r.hari_key] || r.hari_label,
        kamar_list: Array.isArray(r.kamar_list) ? r.kamar_list : [],
      });
    }
  }
  const merged = defaults.map((def) => byKey.get(def.hari_key) || def);
  const extraJumat = byKey.get('jumat');
  if (extraJumat) {
    merged.push(extraJumat);
  }
  return merged;
}

export async function fetchLaundryJadwal(): Promise<LaundryJadwalKamar[]> {
  const res = await fetchTableWithFallback<LaundryJadwalKamar>(
    'laundry_jadwal_kamar',
    LS_LAUNDRY_JADWAL_KEY
  );
  if (res.rows && res.rows.length > 0) {
    return normalizeJadwalRows(res.rows);
  }
  const defaults = buildDefaultJadwalKamar();
  writeLocalArray(LS_LAUNDRY_JADWAL_KEY, defaults);
  return defaults;
}

export async function saveLaundryJadwalDay(
  item: LaundryJadwalKamar
): Promise<LaundryJadwalKamar> {
  const currentLocal = readLocalArray<LaundryJadwalKamar>(LS_LAUNDRY_JADWAL_KEY);
  const normalizedBase = normalizeJadwalRows(currentLocal);
  const exists = normalizedBase.some((r) => r.hari_key === item.hari_key);
  const nextLocal = exists
    ? normalizedBase.map((r) => (r.hari_key === item.hari_key ? item : r))
    : [...normalizedBase, item];
  writeLocalArray(LS_LAUNDRY_JADWAL_KEY, nextLocal);

  try {
    const { error } = await supabase
      .from('laundry_jadwal_kamar')
      .upsert([item], { onConflict: 'id' });
    if (error && !isMissingRelationError(error)) {
      // local copy already saved
    }
  } catch {
    // ignore fallback error
  }
  return item;
}

export async function fetchLaundryCatatan(): Promise<LaundryCatatanItem[]> {
  const res = await fetchTableWithFallback<LaundryCatatanItem>(
    'laundry_catatan',
    LS_LAUNDRY_CATATAN_KEY,
    { col: 'tanggal', ascending: false }
  );
  return (res.rows || []).map((r) => ({
    ...r,
    jumlah_potong: Number(r.jumlah_potong || 0),
    catatan: r.catatan || '',
    jam_masuk: r.jam_masuk || '',
    jam_selesai: r.jam_selesai || '',
  }));
}

export async function saveLaundryCatatanRow(
  item: LaundryCatatanItem,
  isEdit: boolean
): Promise<LaundryCatatanItem> {
  const currentLocal = readLocalArray<LaundryCatatanItem>(LS_LAUNDRY_CATATAN_KEY);
  const nextLocal = isEdit
    ? currentLocal.map((r) => (r.id === item.id ? item : r))
    : [item, ...currentLocal.filter((r) => r.id !== item.id)];
  writeLocalArray(LS_LAUNDRY_CATATAN_KEY, nextLocal);

  try {
    if (isEdit) {
      const { error } = await supabase
        .from('laundry_catatan')
        .update({
          tanggal: item.tanggal,
          hari_key: item.hari_key,
          kamar: item.kamar,
          jumlah_potong: item.jumlah_potong,
          status: item.status,
          tipe_setoran: item.tipe_setoran,
          jam_masuk: item.jam_masuk,
          jam_selesai: item.jam_selesai,
          catatan: item.catatan,
          updated_at: item.updated_at,
        })
        .eq('id', item.id);
      if (error && !isMissingRelationError(error)) {
        // local copy saved
      }
    } else {
      const { data, error } = await supabase
        .from('laundry_catatan')
        .insert([item])
        .select('*')
        .maybeSingle();
      if (!error && data) {
        return data as LaundryCatatanItem;
      }
    }
  } catch {
    // ignore fallback error
  }

  return item;
}

export async function deleteLaundryCatatanRow(id: string): Promise<void> {
  const currentLocal = readLocalArray<LaundryCatatanItem>(LS_LAUNDRY_CATATAN_KEY);
  writeLocalArray(
    LS_LAUNDRY_CATATAN_KEY,
    currentLocal.filter((r) => r.id !== id)
  );
  try {
    await supabase.from('laundry_catatan').delete().eq('id', id);
  } catch {
    // ignore fallback error
  }
}

export async function fetchAllKamarOptions(): Promise<string[]> {
  const seen = new Set<string>(DEFAULT_KAMAR_PONDOK);
  const list = [...DEFAULT_KAMAR_PONDOK];

  try {
    const { data, error } = await supabase
      .from('santri')
      .select('kamar, status');
    if (!error && Array.isArray(data)) {
      for (const s of data as Array<{ kamar?: string | null; status?: string }>) {
        const km = (s.kamar || '').trim();
        if (km && !seen.has(km)) {
          seen.add(km);
          list.push(km);
        }
      }
    }
  } catch {
    // fallback to default kamar list
  }

  return list;
}

export function buildLaundryDailyWaText(
  tanggal: string,
  rows: LaundryCatatanItem[]
): string {
  const hariLabel = formatHariTanggalIndo(tanggal);
  if (rows.length === 0) {
    return `*LAPORAN SIE LAUNDRY PONDOK PESANTREN AN-NUR 1*\nTanggal: ${hariLabel}\nBelum ada setoran laundry tercatat.`;
  }
  const totalPcs = rows.reduce((sum, r) => sum + Number(r.jumlah_potong || 0), 0);
  const selesaiCount = rows.filter((r) => r.status === 'selesai').length;

  const lines = [
    `*LAPORAN SIE LAUNDRY PONDOK PESANTREN AN-NUR 1*`,
    `Hari/Tgl: ${hariLabel}`,
    `Total: *${rows.length} kamar* (${totalPcs} potong) · Selesai: ${selesaiCount}/${rows.length}`,
    ``,
    ...rows.map((r, idx) => {
      const tipe = r.tipe_setoran === 'susulan' ? ' [Susulan]' : '';
      const statusTxt = r.status === 'selesai' ? 'Selesai' : 'Masuk';
      return `${idx + 1}. Kamar *${r.kamar}*${tipe}: *${r.jumlah_potong} potong* — (${statusTxt})${
        r.catatan ? ` _${r.catatan}_` : ''
      }`;
    }),
  ];
  return lines.join('\n');
}
