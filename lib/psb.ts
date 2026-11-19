import {
  DEFAULT_SKEMA_PENDAFTARAN,
  hitungRincianPendaftaran,
  type HasilRincianPendaftaran,
  type SkemaPendaftaranConfig,
} from './pengaturan';
import { supabase } from './supabase';

export type PsbStatus =
  | 'menunggu_verifikasi'
  | 'dp_terverifikasi'
  | 'lunas_menunggu_kedatangan'
  | 'diterima_aktif'
  | 'ditolak';

export type PsbPaket = 'reguler' | 'vip';

export interface PsbPendaftaranRecord {
  id: string;
  no_registrasi: string;
  tahun_psb: number;
  status: PsbStatus;
  paket: PsbPaket;
  kamar_rencana: string;
  rencana_tgl_masuk: string;
  nama_lengkap: string;
  jk: 'L' | 'P';
  tempat_lahir: string;
  tgl_lahir: string;
  jenjang_pendidikan: string;
  nama_ayah: string;
  nama_ibu: string;
  nama_wali: string;
  no_wa_wali: string;
  alamat_jalan: string;
  desa: string;
  kecamatan: string;
  kabupaten: string;
  provinsi: string;
  kode_pos: string;
  dapat_promo_pangkal: boolean;
  total_biaya_awal: number;
  nominal_keringanan: number;
  catatan_keringanan: string;
  total_biaya_akhir: number;
  dp_nominal: number;
  dp_terbayar: number;
  pelunasan_terbayar: number;
  bukti_dp_url: string;
  metode_dp: 'transfer' | 'tunai';
  tgl_verifikasi_dp: string | null;
  verifikator_dp: string;
  tgl_lunas: string | null;
  santri_id: string | null;
  nis_terbit: string;
  no_kuitansi_dp: string;
  no_kuitansi_lunas: string;
  catatan_wali: string;
  catatan_pengurus: string;
  setuju_ketentuan: boolean;
  created_at: string;
  updated_at: string;
}

export const PSB_MIN_DP = 500000;
export const LS_PSB_KEY = 'siap_psb_pendaftaran_v1';

export const PSB_JENJANG_OPTIONS = [
  'MTs / SMP',
  'MA / SMA / SMK',
  'Kuliah / Perguruan Tinggi',
  'Takhassus / Salaf Murni',
] as const;

/**
 * Informasi resmi Pondok Pesantren An-Nur 1 Bululawang
 * disarikan dari dokumen Profil Lengkap Pondok Pesantren An-Nur 1.
 */
export const PSB_PROFIL_PONDOK = {
  namaResmi: 'Pondok Pesantren An-Nur 1 Bululawang',
  namaArab: 'معهد النور الأول الإسلامي',
  pendiri: 'KH. Anwar Noer',
  tahunBerdiri: 1940,
  pengasuhSekarang: 'Dr. KH. A. Fahrur Rozi Burhan, S.Ag., M.Pd.',
  alamat: 'Jl. Diponegoro IV / 2-6 Bululawang (65171), Kab. Malang, Jawa Timur',
  telepon: '(0341) 805610',
  waAdminDefault: '085604551562',
  rekeningOfflinePdf: {
    bank: 'MANDIRI',
    nomor: '144-00-7488889-9',
    atasNama: 'AN NUR 1 MALANG',
  },
  jamKantorOffline: 'Setiap Hari, Pukul 07.00 – 16.00 WIB',
  sejarahSingkat:
    'Didirikan oleh KH. Anwar Noer pada tahun 1940 berawal dari langgar mengaji di desa Bululawang. Kini di bawah bimbingan Dr. KH. A. Fahrur Rozi Burhan, S.Ag., M.Pd., An-Nur 1 memadukan ketajaman intelektual, pengajian kitab & Al-Qur’an, serta pembinaan akhlaqul karimah.',
  visi:
    'Mewujudkan insan kamil yang berimbang dalam kapasitas intelektual dan moralitas serta mencetak pribadi yang shalihin dan shalihat.',
  misi:
    'Menyediakan akses pendidikan sesuai dengan tingkatan, membimbing santri dalam penguatan kajian keagamaan, serta membina santri dalam keberagamaan.',
  berkasFisikWajib: [
    'Fotocopy / Scan Kartu Keluarga (KK) — 2 lembar',
    'Fotocopy / Scan KTP Orang Tua — 2 lembar',
    'Fotocopy / Scan Akta Kelahiran — 2 lembar',
    'Fotocopy / Scan Ijazah / SKL terakhir — 2 lembar',
    'Pas Foto ukuran 3×4 — 2 lembar',
    'Wajib diantar Wali Santri & Sowan Pengasuh saat masuk pondok',
  ],
  ketentuanWali: [
    'Santri wajib menaati peraturan pondok pesantren dan prosedur perizinan.',
    'Wali tidak menjenguk santri saat kegiatan belajar/mengaji sedang berlangsung.',
    'Wali tidak menjemput santri keluar lingkungan pondok kecuali sesuai prosedur resmi.',
    'Pembayaran Syahriyah bulanan dilunasi paling lambat tanggal 10 setiap bulan.',
  ],
  peraturanRingkas: {
    kewajiban: [
      'Sekolah formal dan mengaji diniyah sesuai tingkatannya.',
      'Sholat berjamaah apabila tidak ada udzur syar’i.',
      'Menjaga nama baik pondok, kesopanan, kebersihan, serta berpakaian sopan & berkopyah saat keluar pondok.',
    ],
    larangan: [
      'Membawa atau menggunakan alat elektronik terlarang (HP, MP3, MP4, radio, dll.).',
      'Merokok, mencuri/ghosob, serta keluar area pondok tanpa izin resmi.',
      'Pulang ke rumah kecuali hari libur pondok atau izin mendesak yang disahkan Pengasuh.',
    ],
  },
  jadwalHarian: [
    { waktu: '03.00 – 05.40', kegiatan: 'Bangun, Sholat Malam, Subuh Berjamaah, Istighotsah & Pengajian Pengasuh' },
    { waktu: '06.00 – 12.00', kegiatan: 'Sholat Duha & Sekolah Formal sesuai tingkatan' },
    { waktu: '12.30 – 15.00', kegiatan: 'Jamaah Dzuhur, Madrasah Murottilil Qur’an & Istirahat' },
    { waktu: '15.30 – 17.30', kegiatan: 'Jamaah Ashar, Jam Belajar & Makan Sore' },
    { waktu: '18.00 – 22.30', kegiatan: 'Jamaah Maghrib, Yasin/Waqi’ah/Al-Mulk/Rotib, Isya, Madrasah Diniyah & Tidur' },
  ],
  jadwalJumat: [
    { waktu: 'Kamis 18.00 – 21.00', kegiatan: 'Tahlil, Yasin, Waqi’ah, Al-Mulk, Mushofahah, Muhadloroh/Manaqib/Diba’' },
    { waktu: 'Jum’at 04.15 – 08.00', kegiatan: 'Subuh & Surah Al-Kahfi, Sholat Duha, Ro’an Bersama, Khotmil Qur’an' },
    { waktu: 'Jum’at 11.30 – 16.00', kegiatan: 'Sholat Jum’at (Masjid An-Nur Al-Burhany), Ashar, Yasin & Tahlil di Maqbaroh' },
  ],
};

export const PSB_STATUS_META: Record<
  PsbStatus,
  { label: string; shortLabel: string; badgeClass: string; stepIndex: number }
> = {
  menunggu_verifikasi: {
    label: 'Menunggu Verifikasi DP',
    shortLabel: 'Menunggu DP',
    badgeClass: 'bg-amber-50 text-amber-800 border-amber-200',
    stepIndex: 1,
  },
  dp_terverifikasi: {
    label: 'DP Terverifikasi (Belum Lunas)',
    shortLabel: 'DP Terverifikasi',
    badgeClass: 'bg-sky-50 text-sky-800 border-sky-200',
    stepIndex: 2,
  },
  lunas_menunggu_kedatangan: {
    label: 'Lunas · Siap Masuk Pondok',
    shortLabel: 'Lunas (Siap Sowan)',
    badgeClass: 'bg-indigo-50 text-indigo-800 border-indigo-200',
    stepIndex: 3,
  },
  diterima_aktif: {
    label: 'Resmi Santri Aktif',
    shortLabel: 'Santri Aktif',
    badgeClass: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    stepIndex: 4,
  },
  ditolak: {
    label: 'Ditolak / Perlu Perbaikan',
    shortLabel: 'Ditolak',
    badgeClass: 'bg-rose-50 text-rose-800 border-rose-200',
    stepIndex: 0,
  },
};

export const PSB_TABLE_SQL = `CREATE TABLE IF NOT EXISTS psb_pendaftaran (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  no_registrasi text NOT NULL UNIQUE,
  tahun_psb integer NOT NULL DEFAULT 2026,
  status text NOT NULL DEFAULT 'menunggu_verifikasi',
  paket text NOT NULL DEFAULT 'reguler',
  kamar_rencana text DEFAULT '',
  rencana_tgl_masuk date,
  nama_lengkap text NOT NULL,
  jk text NOT NULL DEFAULT 'L',
  tempat_lahir text DEFAULT '',
  tgl_lahir date,
  jenjang_pendidikan text DEFAULT 'MTs / SMP',
  nama_ayah text DEFAULT '',
  nama_ibu text DEFAULT '',
  nama_wali text NOT NULL,
  no_wa_wali text NOT NULL,
  alamat_jalan text DEFAULT '',
  desa text DEFAULT '',
  kecamatan text DEFAULT '',
  kabupaten text DEFAULT '',
  provinsi text DEFAULT '',
  kode_pos text DEFAULT '',
  dapat_promo_pangkal boolean NOT NULL DEFAULT true,
  total_biaya_awal integer NOT NULL DEFAULT 850000,
  nominal_keringanan integer NOT NULL DEFAULT 0,
  catatan_keringanan text DEFAULT '',
  total_biaya_akhir integer NOT NULL DEFAULT 850000,
  dp_nominal integer NOT NULL DEFAULT 500000,
  dp_terbayar integer NOT NULL DEFAULT 0,
  pelunasan_terbayar integer NOT NULL DEFAULT 0,
  bukti_dp_url text DEFAULT '',
  metode_dp text DEFAULT 'transfer',
  tgl_verifikasi_dp timestamptz,
  verifikator_dp text DEFAULT '',
  tgl_lunas timestamptz,
  santri_id uuid DEFAULT null,
  nis_terbit text DEFAULT '',
  no_kuitansi_dp text DEFAULT '',
  no_kuitansi_lunas text DEFAULT '',
  catatan_wali text DEFAULT '',
  catatan_pengurus text DEFAULT '',
  setuju_ketentuan boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);`;

/**
 * Normalisasi nomor HP / WhatsApp agar konsisten (format 08... untuk pencocokan)
 */
export function normalizeWaNumber(raw: string): string {
  const digits = String(raw || '').replace(/[^0-9]/g, '');
  if (!digits) return '';
  if (digits.startsWith('62')) return `0${digits.slice(2)}`;
  if (digits.startsWith('8')) return `0${digits}`;
  return digits;
}

/**
 * Konversi nomor WA lokal (08...) menjadi format link wa.me (628...)
 */
export function toWaMeDigits(raw: string): string {
  const digits = String(raw || '').replace(/[^0-9]/g, '');
  if (!digits) return '';
  if (digits.startsWith('0')) return `62${digits.slice(1)}`;
  if (digits.startsWith('8')) return `62${digits}`;
  return digits;
}

/**
 * Buat nomor registrasi PSB unik berurutan: PSB-26-001, PSB-26-002, dst.
 */
export function generateNextNoRegistrasi(
  existingList: Array<Pick<PsbPendaftaranRecord, 'no_registrasi'>>,
  yearFull = 2026
): string {
  const yy = String(yearFull).slice(-2);
  const prefix = `PSB-${yy}-`;
  let maxSeq = 0;
  for (const row of existingList) {
    const code = String(row.no_registrasi || '').toUpperCase();
    if (!code.startsWith(prefix)) continue;
    const seq = parseInt(code.slice(prefix.length), 10);
    if (!Number.isNaN(seq) && seq > maxSeq) {
      maxSeq = seq;
    }
  }
  return `${prefix}${String(maxSeq + 1).padStart(3, '0')}`;
}

export interface PsbBillingSummary {
  rincian: HasilRincianPendaftaran;
  totalBiayaAwal: number;
  nominalKeringanan: number;
  totalBiayaAkhir: number;
  totalSudahDibayar: number;
  sisaTagihan: number;
  sudahLunas: boolean;
}

/**
 * Hitung total tagihan akhir, keringanan, jumlah sudah dibayar, dan sisa tagihan PSB.
 * Konsisten memakai skema terbaru (Free Uang Pangkal Rp5.000.000 untuk 100 pendaftar pertama:
 * Reguler Rp850.000 / VIP Rp2.500.000; Normal: Reguler Rp5.850.000 / VIP Rp7.500.000).
 */
export function calculatePsbBilling(params: {
  paket: PsbPaket;
  jumlahPendaftarTerhitung: number;
  skema?: Partial<SkemaPendaftaranConfig>;
  forceFreeUangPangkal?: boolean;
  nominalKeringanan?: number;
  dpTerbayar?: number;
  pelunasanTerbayar?: number;
}): PsbBillingSummary {
  const rincian = hitungRincianPendaftaran({
    paket: params.paket,
    jumlahPendaftarSaatIni: params.jumlahPendaftarTerhitung,
    skema: params.skema ?? DEFAULT_SKEMA_PENDAFTARAN,
    forceFreeUangPangkal: params.forceFreeUangPangkal,
  });

  const totalBiayaAwal = rincian.totalBayar;
  const keringanan = Math.min(totalBiayaAwal, Math.max(0, Number(params.nominalKeringanan || 0)));
  const totalBiayaAkhir = Math.max(0, totalBiayaAwal - keringanan);
  const totalSudahDibayar =
    Math.max(0, Number(params.dpTerbayar || 0)) +
    Math.max(0, Number(params.pelunasanTerbayar || 0));
  const sisaTagihan = Math.max(0, totalBiayaAkhir - totalSudahDibayar);

  return {
    rincian,
    totalBiayaAwal,
    nominalKeringanan: keringanan,
    totalBiayaAkhir,
    totalSudahDibayar,
    sisaTagihan,
    sudahLunas: sisaTagihan === 0 && totalBiayaAkhir >= 0,
  };
}

/**
 * Hitung jumlah kuota promo yang sudah terpakai (terverifikasi DP / lunas / resmi aktif).
 */
export function countVerifiedPsbQuota(
  records: Array<Pick<PsbPendaftaranRecord, 'status' | 'dapat_promo_pangkal'>>,
  existingSantriCount = 0
): number {
  const verifiedOnline = records.filter(
    (r) =>
      r.status === 'dp_terverifikasi' ||
      r.status === 'lunas_menunggu_kedatangan' ||
      r.status === 'diterima_aktif'
  ).length;
  // Catatan: saat santri diresmikan dari PSB, santri masuk ke tabel santri juga.
  // Hitung santri yang belum berasal dari status diterima_aktif agar tidak double count:
  const activeFromPsb = records.filter((r) => r.status === 'diterima_aktif').length;
  const nonPsbSantri = Math.max(0, Number(existingSantriCount || 0) - activeFromPsb);
  return nonPsbSantri + verifiedOnline;
}

/**
 * Pencarian antrean PSB publik untuk /cek-daftar.
 * Mendukung 1 No. WA Wali untuk >1 anak (jika noRegistrasi dikosongkan).
 */
export function matchPsbRecordsForGuardian(
  records: PsbPendaftaranRecord[],
  noWaInput: string,
  noRegistrasiInput?: string
): PsbPendaftaranRecord[] {
  const normWa = normalizeWaNumber(noWaInput);
  if (!normWa || normWa.length < 8) return [];
  const normReg = String(noRegistrasiInput || '').trim().toUpperCase();

  return records
    .filter((rec) => {
      const recWa = normalizeWaNumber(rec.no_wa_wali);
      if (recWa !== normWa) return false;
      if (normReg) {
        return String(rec.no_registrasi || '').trim().toUpperCase() === normReg;
      }
      return true;
    })
    .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
}

export function splitPelunasanForWallets(params: {
  paket: PsbPaket;
  totalSudahDibayarSebelumnya: number;
  bayarSekarang: number;
  skema?: Partial<SkemaPendaftaranConfig>;
}): { keDompetPendaftaran: number; keDompetOperasionalSyahriyah: number } {
  const s = { ...DEFAULT_SKEMA_PENDAFTARAN, ...(params.skema || {}) };
  const syahriyahTarget = params.paket === 'vip' ? Number(s.syahriyah_vip) : Number(s.syahriyah_reguler);
  const nominalSekarang = Math.max(0, Number(params.bayarSekarang || 0));
  if (nominalSekarang <= 0) {
    return { keDompetPendaftaran: 0, keDompetOperasionalSyahriyah: 0 };
  }
  const syahriyahPorsi = Math.min(nominalSekarang, syahriyahTarget);
  const pendaftaranPorsi = Math.max(0, nominalSekarang - syahriyahPorsi);
  return {
    keDompetPendaftaran: pendaftaranPorsi,
    keDompetOperasionalSyahriyah: syahriyahPorsi,
  };
}

function readLocalPsb(): PsbPendaftaranRecord[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(LS_PSB_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as PsbPendaftaranRecord[]) : [];
  } catch {
    return [];
  }
}

function writeLocalPsb(rows: PsbPendaftaranRecord[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(LS_PSB_KEY, JSON.stringify(rows));
  } catch {
    // ignore storage quota errors
  }
}

export async function fetchPsbRecords(): Promise<{
  records: PsbPendaftaranRecord[];
  tableMissing: boolean;
}> {
  const localRows = readLocalPsb();
  try {
    const { data, error } = await supabase
      .from('psb_pendaftaran')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      const msg = String(error.message || '').toLowerCase();
      const missing =
        msg.includes('does not exist') ||
        msg.includes('404') ||
        msg.includes('could not find') ||
        String(error.code || '') === 'PGRST205';
      return { records: localRows, tableMissing: missing };
    }

    const remoteRows = (data || []) as PsbPendaftaranRecord[];
    const mergedMap = new Map<string, PsbPendaftaranRecord>();
    for (const r of remoteRows) mergedMap.set(r.id, r);
    for (const l of localRows) {
      if (!mergedMap.has(l.id)) mergedMap.set(l.id, l);
    }
    const merged = Array.from(mergedMap.values()).sort((a, b) =>
      (b.created_at || '').localeCompare(a.created_at || '')
    );
    writeLocalPsb(merged);
    return { records: merged, tableMissing: false };
  } catch {
    return { records: localRows, tableMissing: true };
  }
}

export async function savePsbRecord(record: PsbPendaftaranRecord): Promise<{
  record: PsbPendaftaranRecord;
  persistedToDb: boolean;
  tableMissing: boolean;
}> {
  const local = readLocalPsb();
  const next = [record, ...local.filter((r) => r.id !== record.id)];
  writeLocalPsb(next);

  try {
    const { data, error } = await supabase
      .from('psb_pendaftaran')
      .upsert([record], { onConflict: 'id' })
      .select()
      .maybeSingle();

    if (error) {
      const msg = String(error.message || '').toLowerCase();
      const missing =
        msg.includes('does not exist') ||
        msg.includes('could not find') ||
        String(error.code || '') === 'PGRST205';
      return { record, persistedToDb: false, tableMissing: missing };
    }
    const saved = (data as PsbPendaftaranRecord) || record;
    writeLocalPsb([saved, ...local.filter((r) => r.id !== saved.id)]);
    return { record: saved, persistedToDb: true, tableMissing: false };
  } catch {
    return { record, persistedToDb: false, tableMissing: true };
  }
}

export async function deletePsbRecord(id: string): Promise<void> {
  const local = readLocalPsb();
  writeLocalPsb(local.filter((r) => r.id !== id));
  try {
    await supabase.from('psb_pendaftaran').delete().eq('id', id);
  } catch {
    // local already updated
  }
}

/**
 * Kompresi gambar bukti transfer di browser sebelum upload agar cepat & hemat kuota.
 */
export async function compressBuktiTransfer(file: File): Promise<{
  blob: Blob;
  dataUrl: string;
}> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Gagal membaca file gambar.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Format gambar tidak valid.'));
      img.onload = () => {
        const maxSide = 1280;
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
          reject(new Error('Canvas tidak tersedia.'));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.78);
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error('Gagal memproses gambar.'));
              return;
            }
            resolve({ blob, dataUrl });
          },
          'image/jpeg',
          0.78
        );
      };
      img.src = String(reader.result || '');
    };
    reader.readAsDataURL(file);
  });
}
