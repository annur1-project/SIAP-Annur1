export type PengaturanTabKey = 'identitas' | 'legalitas' | 'keuangan' | 'operasional' | 'tema';

export interface MasterPembayaranItem {
  id: string;
  kode: string;
  nama_item: string;
  tipe_periode: 'bulanan' | 'tahunan';
  kategori_santri?: string;
  dompet_tujuan: string;
  wajib_ndalem: boolean;
  aktif: boolean;
  urutan: number;
}

export interface TarifRiwayatItem {
  id: string;
  item_id: string;
  nominal: number;
  berlaku_mulai: string;
  catatan?: string | null;
}

export interface AturanPerizinan {
  infaq_tidak_menginap: number;
  infaq_menginap: number;
  denda_terlambat: number;
  batas_jam_harian: string;
}

export interface AturanKeamanan {
  poin_sp1: number;
  poin_sp2: number;
  poin_sp3: number;
}

export interface AturanJadwalRutin {
  hari_rapat_pengasuh: string;
  hari_libur_laundry: string;
  jam_masak_pagi: string;
  jam_masak_sore: string;
  koreksi_hijriyah: number;
}

export interface SkemaPendaftaranConfig {
  uang_pangkal: number;
  dipan_vip: number;
  formulir: number;
  kotak_almari: number;
  syahriyah_vip: number;
  syahriyah_reguler: number;
  kuota_gratis_uang_pangkal: number;
  promo_aktif: boolean;
  tahun_psb?: number;
  tahun_ajaran_psb?: string;
  kuota_promo_tampil_awal?: number;
}

export interface ProfilPondokJadwalItem {
  waktu: string;
  kegiatan: string;
}

export interface ProfilPondokPsbConfig {
  sejarahSingkat: string;
  visi: string;
  misi: string;
  jamKantorOffline: string;
  berkasFisikWajib: string[];
  ketentuanWali: string[];
  laranganTataTertib: string[];
  jadwalHarian: ProfilPondokJadwalItem[];
  jadwalJumat: ProfilPondokJadwalItem[];
}

export type ThemePresetKey =
  | 'emerald'
  | 'navy'
  | 'teal'
  | 'forest'
  | 'indigo'
  | 'amber'
  | 'slate'
  | 'custom';

export type ThemeMode = 'light' | 'warm' | 'dark';
export type ThemeFont = 'jakarta' | 'dmsans' | 'manrope' | 'lora';
export type ThemeRadius = 'sharp' | 'medium' | 'rounded';
export type ThemeDensity = 'comfortable' | 'compact';

export interface TemaAplikasiConfig {
  preset: ThemePresetKey;
  primaryColor: string;
  sidebarColor: string;
  mode: ThemeMode;
  fontFamily: ThemeFont;
  radius: ThemeRadius;
  density: ThemeDensity;
  sidebarShowLogo: boolean;
  appShortTitle: string;
  appSubtitle: string;
}

export interface AturanOperasional {
  tahun_ajaran_aktif: string;
  daftar_kamar: string[];
  perizinan: AturanPerizinan;
  keamanan: AturanKeamanan;
  jadwal: AturanJadwalRutin;
  pendaftaran: SkemaPendaftaranConfig;
  profil_pondok?: ProfilPondokPsbConfig;
  tema: TemaAplikasiConfig;
  menu_cepat_ids: string[];
}

export interface PengaturanCoreFields {
  nama_pesantren: string;
  alamat_lengkap: string;
  no_telepon: string;
  email_resmi: string;
  slogan: string;
  logo_url: string;
  logo_watermark_url: string;
  stempel_url: string;
  nama_pengasuh: string;
  ttd_pengasuh_url: string;
  nama_kepala_pondok: string;
  ttd_kepala_pondok_url: string;
  nama_sekretaris: string;
  ttd_sekretaris_url: string;
  nama_bendahara: string;
  ttd_bendahara_url: string;
  jatuh_tempo_tanggal: number;
  saldo_awal_pendaftaran: number;
  saldo_awal_operasional: number;
  saldo_awal_kas_pondok: number;
  saldo_awal_mda: number;
}

export interface PengaturanExtendedFields {
  kota_surat: string;
  rekening_bank: string;
  rekening_nomor: string;
  rekening_atas_nama: string;
  kop_surat_url: string;
  aturan_operasional: AturanOperasional;
}

export type PengaturanFormState = PengaturanCoreFields & PengaturanExtendedFields;

export const NAMA_DOMPET_MAP: Record<string, string> = {
  pendaftaran: '1. Dompet Pendaftaran',
  operasional: '2. Syahriyah & Iuran Tahunan (Operasional)',
  kas_pondok: '3. Dompet Kas (Lain-lain)',
  mda: '4. Dompet MDA (Madin)',
};

export const DEFAULT_KAMAR_MASTER: string[] = [
  'A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7', 'A8', 'A9', 'A10',
  'C1', 'C2', 'C3', 'C4', 'C5', 'C6',
  'Al-Fachriyah 1 (VIP)',
  'Al-Fachriyah 2 (VIP)',
  'Al-Fachriyah 3 (VIP)',
  'Al-Fachriyah 4 (VIP)',
  'NDALEM',
];

export const DEFAULT_SKEMA_PENDAFTARAN: SkemaPendaftaranConfig = {
  uang_pangkal: 5000000,
  dipan_vip: 1600000,
  formulir: 50000,
  kotak_almari: 350000,
  syahriyah_vip: 500000,
  syahriyah_reguler: 450000,
  kuota_gratis_uang_pangkal: 100,
  promo_aktif: true,
  tahun_psb: 2027,
  tahun_ajaran_psb: '2027/2028',
  kuota_promo_tampil_awal: 28,
};

export const DEFAULT_PROFIL_PONDOK_PSB: ProfilPondokPsbConfig = {
  sejarahSingkat:
    'Didirikan oleh KH. Anwar Noer pada tahun 1940 berawal dari langgar mengaji di desa Bululawang. Kini di bawah bimbingan Dr. KH. A. Fahrur Rozi Burhan, S.Ag., M.Pd., An-Nur 1 memadukan ketajaman intelektual, pengajian kitab & Al-Qur’an, serta pembinaan akhlaqul karimah.',
  visi:
    'Mewujudkan insan kamil yang berimbang dalam kapasitas intelektual dan moralitas serta mencetak pribadi yang shalihin dan shalihat.',
  misi:
    'Menyediakan akses pendidikan sesuai dengan tingkatan, membimbing santri dalam penguatan kajian keagamaan, serta membina santri dalam keberagamaan.',
  jamKantorOffline: 'Setiap Hari, Pukul 07.00 – 16.00 WIB',
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
  laranganTataTertib: [
    'Membawa atau menggunakan alat elektronik terlarang (HP, MP3, MP4, radio, dll.).',
    'Merokok, mencuri/ghosob, serta keluar area pondok tanpa izin resmi.',
    'Pulang ke rumah kecuali hari libur pondok atau izin mendesak yang disahkan Pengasuh.',
  ],
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

export const THEME_PRESETS: Array<{
  key: Exclude<ThemePresetKey, 'custom'>;
  label: string;
  primaryColor: string;
  sidebarColor: string;
}> = [
  { key: 'emerald', label: 'Hijau Pesantren (Default)', primaryColor: '#047857', sidebarColor: '#064e3b' },
  { key: 'forest', label: 'Zamrud Klasik', primaryColor: '#15803d', sidebarColor: '#14532d' },
  { key: 'teal', label: 'Teal Samudera', primaryColor: '#0f766e', sidebarColor: '#134e4a' },
  { key: 'navy', label: 'Biru Maritim', primaryColor: '#1d4ed8', sidebarColor: '#1e3a8a' },
  { key: 'indigo', label: 'Indigo Elegan', primaryColor: '#4338ca', sidebarColor: '#312e81' },
  { key: 'amber', label: 'Cokelat Kayu', primaryColor: '#b45309', sidebarColor: '#78350f' },
  { key: 'slate', label: 'Slate Minimalis', primaryColor: '#334155', sidebarColor: '#0f172a' },
];

export const FONT_OPTIONS: Array<{ key: ThemeFont; label: string; desc: string; cssVar: string }> = [
  { key: 'jakarta', label: 'Plus Jakarta Sans', desc: 'Modern, bersih & mudah dipindai', cssVar: 'var(--font-jakarta), sans-serif' },
  { key: 'dmsans', label: 'DM Sans', desc: 'Rapi, ringkas & netral', cssVar: 'var(--font-dmsans), sans-serif' },
  { key: 'manrope', label: 'Manrope', desc: 'Tegas & profesional untuk angka', cssVar: 'var(--font-manrope), sans-serif' },
  { key: 'lora', label: 'Lora Editorial', desc: 'Klasik bernuansa buku & pesantren', cssVar: 'var(--font-lora), serif' },
];

export const DEFAULT_TEMA_APLIKASI: TemaAplikasiConfig = {
  preset: 'emerald',
  primaryColor: '#047857',
  sidebarColor: '#064e3b',
  mode: 'light',
  fontFamily: 'jakarta',
  radius: 'medium',
  density: 'comfortable',
  sidebarShowLogo: true,
  appShortTitle: 'e-annursatu',
  appSubtitle: 'An-Nur 1 Bululawang',
};

export const DEFAULT_ATURAN_OPERASIONAL: AturanOperasional = {
  tahun_ajaran_aktif: '2026/2027',
  daftar_kamar: [...DEFAULT_KAMAR_MASTER],
  perizinan: {
    infaq_tidak_menginap: 5000,
    infaq_menginap: 10000,
    denda_terlambat: 20000,
    batas_jam_harian: '17:00',
  },
  keamanan: {
    poin_sp1: 25,
    poin_sp2: 50,
    poin_sp3: 100,
  },
  jadwal: {
    hari_rapat_pengasuh: 'Jumat',
    hari_libur_laundry: 'Jumat',
    jam_masak_pagi: '05:30',
    jam_masak_sore: '16:30',
    koreksi_hijriyah: 0,
  },
  pendaftaran: { ...DEFAULT_SKEMA_PENDAFTARAN },
  profil_pondok: { ...DEFAULT_PROFIL_PONDOK_PSB },
  tema: { ...DEFAULT_TEMA_APLIKASI },
  menu_cepat_ids: ['keuangan', 'absen-jamaah', 'perizinan', 'santri', 'kesehatan', 'keamanan', 'kalender', 'laporan'],
};

export interface QuickMenuCatalogItem {
  id: string;
  href: string;
  label: string;
  shortLabel: string;
  iconKey:
    | 'home'
    | 'users'
    | 'user-plus'
    | 'user-check'
    | 'wallet'
    | 'check-square'
    | 'file-text'
    | 'shield-alert'
    | 'heart-pulse'
    | 'utensils'
    | 'package'
    | 'calendar-days'
    | 'calendar'
    | 'shirt'
    | 'sparkles'
    | 'store'
    | 'file-spreadsheet'
    | 'settings';
  tone: 'emerald' | 'blue' | 'amber' | 'rose' | 'indigo' | 'teal' | 'violet' | 'slate';
}

export const QUICK_MENU_CATALOG: QuickMenuCatalogItem[] = [
  { id: 'beranda', href: '/', label: 'Beranda Utama', shortLabel: 'Beranda', iconKey: 'home', tone: 'emerald' },
  { id: 'keuangan', href: '/keuangan', label: 'Keuangan & Loket', shortLabel: 'Keuangan', iconKey: 'wallet', tone: 'emerald' },
  { id: 'koperasi', href: '/koperasi', label: 'Koperasi Pondok', shortLabel: 'Koperasi', iconKey: 'store', tone: 'teal' },
  { id: 'kebersihan', href: '/kebersihan', label: 'Kebersihan & Piket', shortLabel: 'Kebersihan', iconKey: 'sparkles', tone: 'emerald' },
  { id: 'absen-jamaah', href: '/absen-jamaah', label: 'Absen Jamaah', shortLabel: 'Jamaah', iconKey: 'check-square', tone: 'blue' },
  { id: 'kalender', href: '/kalender', label: 'Kalender & Sholat', shortLabel: 'Kalender', iconKey: 'calendar-days', tone: 'teal' },
  { id: 'pendaftaran', href: '/pendaftaran', label: 'Pendaftaran PSB', shortLabel: 'PSB', iconKey: 'user-plus', tone: 'emerald' },
  { id: 'santri', href: '/santri', label: 'Data Santri', shortLabel: 'Santri', iconKey: 'users', tone: 'indigo' },
  { id: 'perizinan', href: '/perizinan', label: 'Perizinan Pulang', shortLabel: 'Izin', iconKey: 'file-text', tone: 'amber' },
  { id: 'kesehatan', href: '/kesehatan', label: 'Poskestren', shortLabel: 'Poskestren', iconKey: 'heart-pulse', tone: 'rose' },
  { id: 'keamanan', href: '/keamanan', label: 'Keamanan & Poin', shortLabel: 'Keamanan', iconKey: 'shield-alert', tone: 'rose' },
  { id: 'dapur', href: '/dapur', label: 'Dapur & Masak', shortLabel: 'Dapur', iconKey: 'utensils', tone: 'amber' },
  { id: 'sarpras', href: '/sarpras', label: 'Sarpras & Aset', shortLabel: 'Sarpras', iconKey: 'package', tone: 'slate' },
  { id: 'kegiatan', href: '/kegiatan', label: 'Kegiatan Pondok', shortLabel: 'Kegiatan', iconKey: 'calendar', tone: 'violet' },
  { id: 'laundry', href: '/laundry', label: 'Sie Laundry', shortLabel: 'Laundry', iconKey: 'shirt', tone: 'blue' },
  { id: 'pengurus', href: '/pengurus', label: 'Data Pengurus', shortLabel: 'Pengurus', iconKey: 'user-check', tone: 'teal' },
  { id: 'laporan', href: '/laporan', label: 'Pusat Laporan', shortLabel: 'Laporan', iconKey: 'file-spreadsheet', tone: 'indigo' },
  { id: 'pengaturan', href: '/pengaturan', label: 'Pengaturan', shortLabel: 'Atur', iconKey: 'settings', tone: 'slate' },
];

export const DEFAULT_MENU_CEPAT_IDS: string[] = [
  'keuangan',
  'absen-jamaah',
  'perizinan',
  'santri',
  'kesehatan',
  'keamanan',
  'kalender',
  'laporan',
];

export const DEFAULT_MOBILE_NAV_HREFS: string[] = ['/', '/keuangan', '/absen-jamaah', '/kalender'];

export const DEFAULT_PENGATURAN_FORM: PengaturanFormState = {
  nama_pesantren: 'Pondok Pesantren An-Nur 1 Bululawang',
  alamat_lengkap: 'Jl. Diponegoro IV / 2-6 Bululawang, Kab. Malang, Jawa Timur',
  no_telepon: '085604551562',
  email_resmi: 'annur1bululawang@gmail.com',
  slogan: "Mencetak Generasi Qur'ani, Berakhlakul Karimah, dan Berwawasan Luas",
  logo_url: '',
  logo_watermark_url: '',
  stempel_url: '',
  nama_pengasuh: 'Dr. KH. A. Fahrur Rozi',
  ttd_pengasuh_url: '',
  nama_kepala_pondok: 'Ust. M. Fajar Wahyudi',
  ttd_kepala_pondok_url: '',
  nama_sekretaris: 'Ust. Moh. Sayid Ali',
  ttd_sekretaris_url: '',
  nama_bendahara: 'Ust. Ali Nur Ikasan',
  ttd_bendahara_url: '',
  jatuh_tempo_tanggal: 10,
  saldo_awal_pendaftaran: 0,
  saldo_awal_operasional: 0,
  saldo_awal_kas_pondok: 0,
  saldo_awal_mda: 0,
  kota_surat: 'Bululawang, Malang',
  rekening_bank: 'BSI (Bank Syariah Indonesia)',
  rekening_nomor: '',
  rekening_atas_nama: 'Pondok Pesantren An-Nur 1',
  kop_surat_url: '',
  aturan_operasional: {
    ...DEFAULT_ATURAN_OPERASIONAL,
    daftar_kamar: [...DEFAULT_ATURAN_OPERASIONAL.daftar_kamar],
    perizinan: { ...DEFAULT_ATURAN_OPERASIONAL.perizinan },
    keamanan: { ...DEFAULT_ATURAN_OPERASIONAL.keamanan },
    jadwal: { ...DEFAULT_ATURAN_OPERASIONAL.jadwal },
    pendaftaran: { ...DEFAULT_ATURAN_OPERASIONAL.pendaftaran },
    tema: { ...DEFAULT_ATURAN_OPERASIONAL.tema },
    menu_cepat_ids: [...DEFAULT_MENU_CEPAT_IDS],
  },
};

export const LS_PENGATURAN_EXTENDED_KEY = 'siap_pengaturan_extended_v1';
export const LS_TEMA_APLIKASI_KEY = 'siap_tema_aplikasi_v1';
export const LS_MOBILE_NAV_KEY = 'siap_mobile_nav_v1';
export const THEME_UPDATED_EVENT = 'siap-theme-updated';
export const MOBILE_NAV_UPDATED_EVENT = 'siap-mobile-nav-updated';

export const PENGATURAN_EXTENDED_SQL = `ALTER TABLE pengaturan_aplikasi
  ADD COLUMN IF NOT EXISTS kota_surat text DEFAULT 'Bululawang, Malang',
  ADD COLUMN IF NOT EXISTS rekening_bank text DEFAULT 'BSI (Bank Syariah Indonesia)',
  ADD COLUMN IF NOT EXISTS rekening_nomor text DEFAULT '',
  ADD COLUMN IF NOT EXISTS rekening_atas_nama text DEFAULT 'Pondok Pesantren An-Nur 1',
  ADD COLUMN IF NOT EXISTS kop_surat_url text DEFAULT '',
  ADD COLUMN IF NOT EXISTS aturan_operasional jsonb DEFAULT '{}'::jsonb;`;

export const POSKESTREN_TABLES_SQL = `CREATE TABLE IF NOT EXISTS poskestren_obat (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  nama_obat text NOT NULL,
  kategori text NOT NULL DEFAULT 'Obat Bebas',
  satuan text NOT NULL DEFAULT 'tablet',
  stok integer NOT NULL DEFAULT 0,
  stok_minimum integer NOT NULL DEFAULT 5,
  harga_satuan integer NOT NULL DEFAULT 0,
  kadaluarsa text DEFAULT '',
  keterangan text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS poskestren_penyuluhan (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tanggal date NOT NULL,
  judul text NOT NULL,
  narasumber text DEFAULT 'Poskestren & Puskesmas Bululawang',
  sasaran text DEFAULT 'Seluruh Santri',
  jumlah_peserta integer DEFAULT 0,
  status text NOT NULL DEFAULT 'terjadwal',
  ringkasan text DEFAULT '',
  created_at timestamptz DEFAULT now()
);`;

export interface RincianItemPendaftaran {
  label: string;
  nominalNormal: number;
  nominalBayar: number;
  isFreePromo?: boolean;
  targetDompet: 'pendaftaran' | 'operasional';
}

export interface HasilRincianPendaftaran {
  paket: 'reguler' | 'vip';
  isFreeUangPangkal: boolean;
  sisaKuotaPromo: number;
  kuotaPromoTotal: number;
  items: RincianItemPendaftaran[];
  totalNormal: number;
  totalPromo: number;
  totalBayar: number;
  nominalDompetPendaftaran: number;
  nominalSyahriyahBulanPertama: number;
}

export function hitungRincianPendaftaran(params: {
  paket: 'reguler' | 'vip';
  jumlahPendaftarSaatIni: number;
  skema?: Partial<SkemaPendaftaranConfig>;
  customNominal?: number | null;
  forceFreeUangPangkal?: boolean;
}): HasilRincianPendaftaran {
  const s: SkemaPendaftaranConfig = {
    ...DEFAULT_SKEMA_PENDAFTARAN,
    ...(params.skema || {}),
  };

  const kuota = Math.max(0, Number(s.kuota_gratis_uang_pangkal || 0));
  const used = Math.max(0, Number(params.jumlahPendaftarSaatIni || 0));
  const sisaKuotaPromo = Math.max(0, kuota - used);
  const eligibleByQuota = Boolean(s.promo_aktif) && used < kuota;
  const isFreeUangPangkal =
    typeof params.forceFreeUangPangkal === 'boolean' ? params.forceFreeUangPangkal : eligibleByQuota;

  const isVip = params.paket === 'vip';
  const syahriyahNom = isVip ? Number(s.syahriyah_vip) : Number(s.syahriyah_reguler);

  const items: RincianItemPendaftaran[] = [
    {
      label: 'Uang Pangkal Pondok',
      nominalNormal: Number(s.uang_pangkal),
      nominalBayar: isFreeUangPangkal ? 0 : Number(s.uang_pangkal),
      isFreePromo: isFreeUangPangkal,
      targetDompet: 'pendaftaran',
    },
    ...(isVip
      ? [
          {
            label: 'Dipan',
            nominalNormal: Number(s.dipan_vip),
            nominalBayar: Number(s.dipan_vip),
            targetDompet: 'pendaftaran' as const,
          },
        ]
      : []),
    {
      label: 'Formulir',
      nominalNormal: Number(s.formulir),
      nominalBayar: Number(s.formulir),
      targetDompet: 'pendaftaran',
    },
    {
      label: 'Kotak Almari',
      nominalNormal: Number(s.kotak_almari),
      nominalBayar: Number(s.kotak_almari),
      targetDompet: 'pendaftaran',
    },
    {
      label: 'Syahriyah (Bulan Pertama)',
      nominalNormal: syahriyahNom,
      nominalBayar: syahriyahNom,
      targetDompet: 'operasional',
    },
  ];

  const totalNormal = items.reduce((sum, it) => sum + it.nominalNormal, 0);
  const totalPromo = items.reduce(
    (sum, it) => sum + (it.label === 'Uang Pangkal Pondok' ? 0 : it.nominalNormal),
    0
  );
  const calculatedTotal = items.reduce((sum, it) => sum + it.nominalBayar, 0);

  const isCustom = typeof params.customNominal === 'number' && !Number.isNaN(params.customNominal);
  const totalBayar = isCustom ? Math.max(0, Number(params.customNominal)) : calculatedTotal;

  if (isCustom) {
    return {
      paket: params.paket,
      isFreeUangPangkal,
      sisaKuotaPromo,
      kuotaPromoTotal: kuota,
      items,
      totalNormal,
      totalPromo,
      totalBayar,
      nominalDompetPendaftaran: totalBayar,
      nominalSyahriyahBulanPertama: 0,
    };
  }

  const nominalDompetPendaftaran = items
    .filter((i) => i.targetDompet === 'pendaftaran')
    .reduce((sum, i) => sum + i.nominalBayar, 0);
  const nominalSyahriyahBulanPertama = items
    .filter((i) => i.targetDompet === 'operasional')
    .reduce((sum, i) => sum + i.nominalBayar, 0);

  return {
    paket: params.paket,
    isFreeUangPangkal,
    sisaKuotaPromo,
    kuotaPromoTotal: kuota,
    items,
    totalNormal,
    totalPromo,
    totalBayar,
    nominalDompetPendaftaran,
    nominalSyahriyahBulanPertama,
  };
}

export function getTahunAjaranForDate(isoDate: string): string {
  const clean = (isoDate || '').slice(0, 10);
  const parts = clean.split('-');
  const yr = parseInt(parts[0] || String(new Date().getFullYear()), 10);
  const mo = parseInt(parts[1] || String(new Date().getMonth() + 1), 10);
  const startYr = mo >= 7 ? yr : yr - 1;
  return `${startYr}/${startYr + 1}`;
}

/**
 * Menghasilkan NIS berurutan per 2-digit tahun masuk (`YYXXXX`),
 * sehingga santri PSB TA 2027/2028 memakai awalan `27` sementara santri Mutasi
 * yang masuk di tahun berjalan memakai awalan tahun tanggal masuknya tanpa bentrok urutan.
 */
export function generateNextNisForYear(
  tglMasukOrYear: string | number,
  existingList: Array<{ nis?: string | null }>,
  offset = 1
): string {
  let yearPrefix = '27';
  if (typeof tglMasukOrYear === 'number') {
    yearPrefix = String(tglMasukOrYear).slice(-2).padStart(2, '0');
  } else {
    const clean = String(tglMasukOrYear || '').trim();
    if (/^\d{4}/.test(clean)) {
      yearPrefix = clean.slice(2, 4);
    } else if (/^\d{2}$/.test(clean)) {
      yearPrefix = clean;
    }
  }

  const maxSeq = existingList.reduce((max, s) => {
    const raw = String(s.nis || '').trim();
    if (!raw.startsWith(yearPrefix)) return max;
    const seq = parseInt(raw.slice(2), 10);
    return !Number.isNaN(seq) && seq > max ? seq : max;
  }, 0);

  return `${yearPrefix}${String(maxSeq + offset).padStart(4, '0')}`;
}

export function getTarifAktifFromRiwayat(
  riwayatList: TarifRiwayatItem[] | undefined,
  todayStr: string
): { nominal: number; berlaku_mulai: string } {
  if (!riwayatList || riwayatList.length === 0) {
    return { nominal: 0, berlaku_mulai: '-' };
  }
  const sorted = [...riwayatList].sort((a, b) =>
    b.berlaku_mulai.localeCompare(a.berlaku_mulai)
  );
  const aktif = sorted.find((r) => r.berlaku_mulai <= todayStr) || sorted[sorted.length - 1];
  return {
    nominal: Number(aktif.nominal || 0),
    berlaku_mulai: aktif.berlaku_mulai || '-',
  };
}

export function computeTotalSaldoAwal(form: Partial<PengaturanCoreFields>): number {
  return (
    Number(form.saldo_awal_pendaftaran || 0) +
    Number(form.saldo_awal_operasional || 0) +
    Number(form.saldo_awal_kas_pondok || 0) +
    Number(form.saldo_awal_mda || 0)
  );
}

export function normalizeKamarList(rawList: unknown): string[] {
  if (!Array.isArray(rawList) || rawList.length === 0) {
    return [...DEFAULT_KAMAR_MASTER];
  }
  const seen = new Set<string>();
  const cleaned: string[] = [];
  for (const item of rawList) {
    const val = String(item || '').trim();
    if (!val) continue;
    const key = val.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    cleaned.push(val);
  }
  return cleaned.length > 0 ? cleaned : [...DEFAULT_KAMAR_MASTER];
}

export function addKamarItem(list: string[], rawName: string): { next: string[]; error?: string } {
  const name = rawName.trim();
  if (!name) {
    return { next: list, error: 'Nama kamar tidak boleh kosong.' };
  }
  const exists = list.some((k) => k.toLowerCase() === name.toLowerCase());
  if (exists) {
    return { next: list, error: `Kamar "${name}" sudah ada di daftar.` };
  }
  return { next: [...list, name] };
}

export function removeKamarItem(list: string[], name: string): string[] {
  return list.filter((k) => k !== name);
}

export function moveKamarItem(list: string[], index: number, direction: 'up' | 'down'): string[] {
  if (index < 0 || index >= list.length) return list;
  const targetIdx = direction === 'up' ? index - 1 : index + 1;
  if (targetIdx < 0 || targetIdx >= list.length) return list;
  const next = [...list];
  const [moved] = next.splice(index, 1);
  next.splice(targetIdx, 0, moved);
  return next;
}

export function isKeamananThresholdValid(keamanan: AturanKeamanan): boolean {
  const sp1 = Number(keamanan.poin_sp1 || 0);
  const sp2 = Number(keamanan.poin_sp2 || 0);
  const sp3 = Number(keamanan.poin_sp3 || 0);
  return sp1 > 0 && sp1 < sp2 && sp2 < sp3;
}

export function sanitizeHexColor(val: string | undefined, fallback: string): string {
  if (!val) return fallback;
  const trimmed = val.trim();
  return /^#[0-9a-fA-F]{6}$/.test(trimmed) ? trimmed : fallback;
}

export function mergeTemaAplikasi(raw: unknown): TemaAplikasiConfig {
  const obj = raw && typeof raw === 'object' ? (raw as Partial<TemaAplikasiConfig>) : {};
  const preset =
    obj.preset &&
    ['emerald', 'navy', 'teal', 'forest', 'indigo', 'amber', 'slate', 'custom'].includes(obj.preset)
      ? obj.preset
      : DEFAULT_TEMA_APLIKASI.preset;

  return {
    preset,
    primaryColor: sanitizeHexColor(obj.primaryColor, DEFAULT_TEMA_APLIKASI.primaryColor),
    sidebarColor: sanitizeHexColor(obj.sidebarColor, DEFAULT_TEMA_APLIKASI.sidebarColor),
    mode:
      obj.mode && ['light', 'warm', 'dark'].includes(obj.mode)
        ? obj.mode
        : DEFAULT_TEMA_APLIKASI.mode,
    fontFamily:
      obj.fontFamily && ['jakarta', 'dmsans', 'manrope', 'lora'].includes(obj.fontFamily)
        ? obj.fontFamily
        : DEFAULT_TEMA_APLIKASI.fontFamily,
    radius:
      obj.radius && ['sharp', 'medium', 'rounded'].includes(obj.radius)
        ? obj.radius
        : DEFAULT_TEMA_APLIKASI.radius,
    density:
      obj.density && ['comfortable', 'compact'].includes(obj.density)
        ? obj.density
        : DEFAULT_TEMA_APLIKASI.density,
    sidebarShowLogo: Boolean(obj.sidebarShowLogo ?? DEFAULT_TEMA_APLIKASI.sidebarShowLogo),
    appShortTitle:
      typeof obj.appShortTitle === 'string' && obj.appShortTitle.trim()
        ? obj.appShortTitle.trim()
        : DEFAULT_TEMA_APLIKASI.appShortTitle,
    appSubtitle:
      typeof obj.appSubtitle === 'string' && obj.appSubtitle.trim()
        ? obj.appSubtitle.trim()
        : DEFAULT_TEMA_APLIKASI.appSubtitle,
  };
}

export function mergeAturanOperasional(raw: unknown): AturanOperasional {
  const obj = raw && typeof raw === 'object' ? (raw as Partial<AturanOperasional>) : {};
  return {
    tahun_ajaran_aktif:
      typeof obj.tahun_ajaran_aktif === 'string' && obj.tahun_ajaran_aktif.trim()
        ? obj.tahun_ajaran_aktif.trim()
        : DEFAULT_ATURAN_OPERASIONAL.tahun_ajaran_aktif,
    daftar_kamar: normalizeKamarList(obj.daftar_kamar),
    perizinan: {
      infaq_tidak_menginap: Number(
        obj.perizinan?.infaq_tidak_menginap ?? DEFAULT_ATURAN_OPERASIONAL.perizinan.infaq_tidak_menginap
      ),
      infaq_menginap: Number(
        obj.perizinan?.infaq_menginap ?? DEFAULT_ATURAN_OPERASIONAL.perizinan.infaq_menginap
      ),
      denda_terlambat: Number(
        obj.perizinan?.denda_terlambat ?? DEFAULT_ATURAN_OPERASIONAL.perizinan.denda_terlambat
      ),
      batas_jam_harian:
        typeof obj.perizinan?.batas_jam_harian === 'string' && obj.perizinan.batas_jam_harian
          ? obj.perizinan.batas_jam_harian
          : DEFAULT_ATURAN_OPERASIONAL.perizinan.batas_jam_harian,
    },
    keamanan: {
      poin_sp1: Number(obj.keamanan?.poin_sp1 ?? DEFAULT_ATURAN_OPERASIONAL.keamanan.poin_sp1),
      poin_sp2: Number(obj.keamanan?.poin_sp2 ?? DEFAULT_ATURAN_OPERASIONAL.keamanan.poin_sp2),
      poin_sp3: Number(obj.keamanan?.poin_sp3 ?? DEFAULT_ATURAN_OPERASIONAL.keamanan.poin_sp3),
    },
    jadwal: {
      hari_rapat_pengasuh:
        typeof obj.jadwal?.hari_rapat_pengasuh === 'string' && obj.jadwal.hari_rapat_pengasuh
          ? obj.jadwal.hari_rapat_pengasuh
          : DEFAULT_ATURAN_OPERASIONAL.jadwal.hari_rapat_pengasuh,
      hari_libur_laundry:
        typeof obj.jadwal?.hari_libur_laundry === 'string' && obj.jadwal.hari_libur_laundry
          ? obj.jadwal.hari_libur_laundry
          : DEFAULT_ATURAN_OPERASIONAL.jadwal.hari_libur_laundry,
      jam_masak_pagi:
        typeof obj.jadwal?.jam_masak_pagi === 'string' && obj.jadwal.jam_masak_pagi
          ? obj.jadwal.jam_masak_pagi
          : DEFAULT_ATURAN_OPERASIONAL.jadwal.jam_masak_pagi,
      jam_masak_sore:
        typeof obj.jadwal?.jam_masak_sore === 'string' && obj.jadwal.jam_masak_sore
          ? obj.jadwal.jam_masak_sore
          : DEFAULT_ATURAN_OPERASIONAL.jadwal.jam_masak_sore,
      koreksi_hijriyah: Math.max(
        -2,
        Math.min(2, Math.trunc(Number(obj.jadwal?.koreksi_hijriyah ?? DEFAULT_ATURAN_OPERASIONAL.jadwal.koreksi_hijriyah) || 0))
      ),
    },
    pendaftaran: {
      uang_pangkal: Number(obj.pendaftaran?.uang_pangkal ?? DEFAULT_SKEMA_PENDAFTARAN.uang_pangkal),
      dipan_vip: Number(obj.pendaftaran?.dipan_vip ?? DEFAULT_SKEMA_PENDAFTARAN.dipan_vip),
      formulir: Number(obj.pendaftaran?.formulir ?? DEFAULT_SKEMA_PENDAFTARAN.formulir),
      kotak_almari: Number(obj.pendaftaran?.kotak_almari ?? DEFAULT_SKEMA_PENDAFTARAN.kotak_almari),
      syahriyah_vip: Number(obj.pendaftaran?.syahriyah_vip ?? DEFAULT_SKEMA_PENDAFTARAN.syahriyah_vip),
      syahriyah_reguler: Number(
        obj.pendaftaran?.syahriyah_reguler ?? DEFAULT_SKEMA_PENDAFTARAN.syahriyah_reguler
      ),
      kuota_gratis_uang_pangkal: Number(
        obj.pendaftaran?.kuota_gratis_uang_pangkal ?? DEFAULT_SKEMA_PENDAFTARAN.kuota_gratis_uang_pangkal
      ),
      promo_aktif:
        typeof obj.pendaftaran?.promo_aktif === 'boolean'
          ? obj.pendaftaran.promo_aktif
          : DEFAULT_SKEMA_PENDAFTARAN.promo_aktif,
      tahun_psb: Number(obj.pendaftaran?.tahun_psb ?? DEFAULT_SKEMA_PENDAFTARAN.tahun_psb ?? 2027),
      tahun_ajaran_psb:
        typeof obj.pendaftaran?.tahun_ajaran_psb === 'string' &&
        obj.pendaftaran.tahun_ajaran_psb.trim()
          ? obj.pendaftaran.tahun_ajaran_psb.trim()
          : DEFAULT_SKEMA_PENDAFTARAN.tahun_ajaran_psb,
      kuota_promo_tampil_awal: Math.max(
        1,
        Number(
          obj.pendaftaran?.kuota_promo_tampil_awal ??
            DEFAULT_SKEMA_PENDAFTARAN.kuota_promo_tampil_awal ??
            28
        )
      ),
    },
    profil_pondok: mergeProfilPondokPsb(obj.profil_pondok),
    tema: mergeTemaAplikasi(obj.tema),
    menu_cepat_ids: normalizeMenuCepatIds(obj.menu_cepat_ids),
  };
}

export function mergeProfilPondokPsb(raw: unknown): ProfilPondokPsbConfig {
  const obj = raw && typeof raw === 'object' ? (raw as Partial<ProfilPondokPsbConfig>) : {};
  const strArr = (val: unknown, fallback: string[]) =>
    Array.isArray(val) && val.map((x) => String(x || '').trim()).filter(Boolean).length > 0
      ? val.map((x) => String(x || '').trim()).filter(Boolean)
      : [...fallback];
  const jadwalArr = (val: unknown, fallback: ProfilPondokJadwalItem[]) => {
    if (!Array.isArray(val)) return fallback.map((j) => ({ ...j }));
    const cleaned = val
      .map((item) => ({
        waktu: String((item as Partial<ProfilPondokJadwalItem>)?.waktu || '').trim(),
        kegiatan: String((item as Partial<ProfilPondokJadwalItem>)?.kegiatan || '').trim(),
      }))
      .filter((item) => item.waktu || item.kegiatan);
    return cleaned.length > 0 ? cleaned : fallback.map((j) => ({ ...j }));
  };

  return {
    sejarahSingkat:
      typeof obj.sejarahSingkat === 'string' && obj.sejarahSingkat.trim()
        ? obj.sejarahSingkat.trim()
        : DEFAULT_PROFIL_PONDOK_PSB.sejarahSingkat,
    visi:
      typeof obj.visi === 'string' && obj.visi.trim()
        ? obj.visi.trim()
        : DEFAULT_PROFIL_PONDOK_PSB.visi,
    misi:
      typeof obj.misi === 'string' && obj.misi.trim()
        ? obj.misi.trim()
        : DEFAULT_PROFIL_PONDOK_PSB.misi,
    jamKantorOffline:
      typeof obj.jamKantorOffline === 'string' && obj.jamKantorOffline.trim()
        ? obj.jamKantorOffline.trim()
        : DEFAULT_PROFIL_PONDOK_PSB.jamKantorOffline,
    berkasFisikWajib: strArr(obj.berkasFisikWajib, DEFAULT_PROFIL_PONDOK_PSB.berkasFisikWajib),
    ketentuanWali: strArr(obj.ketentuanWali, DEFAULT_PROFIL_PONDOK_PSB.ketentuanWali),
    laranganTataTertib: strArr(
      obj.laranganTataTertib,
      DEFAULT_PROFIL_PONDOK_PSB.laranganTataTertib
    ),
    jadwalHarian: jadwalArr(obj.jadwalHarian, DEFAULT_PROFIL_PONDOK_PSB.jadwalHarian),
    jadwalJumat: jadwalArr(obj.jadwalJumat, DEFAULT_PROFIL_PONDOK_PSB.jadwalJumat),
  };
}

export function normalizeMenuCepatIds(rawIds: unknown): string[] {
  const validIds = new Set(QUICK_MENU_CATALOG.map((item) => item.id));
  if (!Array.isArray(rawIds) || rawIds.length === 0) {
    return [...DEFAULT_MENU_CEPAT_IDS];
  }
  const seen = new Set<string>();
  const cleaned: string[] = [];
  for (const id of rawIds) {
    const val = String(id || '').trim();
    if (!val || !validIds.has(val) || seen.has(val)) continue;
    seen.add(val);
    cleaned.push(val);
  }
  return cleaned.length > 0 ? cleaned.slice(0, 12) : [...DEFAULT_MENU_CEPAT_IDS];
}

export function normalizeMobileNavHrefs(rawHrefs: unknown): string[] {
  const validHrefs = new Set(QUICK_MENU_CATALOG.map((item) => item.href));
  const result: string[] = [];
  if (Array.isArray(rawHrefs)) {
    for (const h of rawHrefs) {
      const val = String(h || '').trim();
      if (!val || !validHrefs.has(val) || result.includes(val)) continue;
      result.push(val);
      if (result.length === 4) break;
    }
  }
  for (const defHref of DEFAULT_MOBILE_NAV_HREFS) {
    if (result.length === 4) break;
    if (!result.includes(defHref)) result.push(defHref);
  }
  return result.slice(0, 4);
}

export function readMobileNavPrefs(): string[] {
  if (typeof window === 'undefined') return [...DEFAULT_MOBILE_NAV_HREFS];
  try {
    const raw = window.localStorage.getItem(LS_MOBILE_NAV_KEY);
    if (!raw) return [...DEFAULT_MOBILE_NAV_HREFS];
    return normalizeMobileNavHrefs(JSON.parse(raw));
  } catch {
    return [...DEFAULT_MOBILE_NAV_HREFS];
  }
}

export function writeMobileNavPrefs(hrefs: string[]): string[] {
  const normalized = normalizeMobileNavHrefs(hrefs);
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(LS_MOBILE_NAV_KEY, JSON.stringify(normalized));
      window.dispatchEvent(
        new CustomEvent(MOBILE_NAV_UPDATED_EVENT, { detail: { hrefs: normalized } })
      );
    } catch {
      // ignore storage quota errors
    }
  }
  return normalized;
}

export function sanitizeCorePayload(form: PengaturanFormState): PengaturanCoreFields {
  return {
    nama_pesantren: form.nama_pesantren.trim(),
    alamat_lengkap: form.alamat_lengkap.trim(),
    no_telepon: form.no_telepon.trim(),
    email_resmi: form.email_resmi.trim(),
    slogan: form.slogan.trim(),
    logo_url: form.logo_url || '',
    logo_watermark_url: form.logo_watermark_url || '',
    stempel_url: form.stempel_url || '',
    nama_pengasuh: form.nama_pengasuh.trim(),
    ttd_pengasuh_url: form.ttd_pengasuh_url || '',
    nama_kepala_pondok: form.nama_kepala_pondok.trim(),
    ttd_kepala_pondok_url: form.ttd_kepala_pondok_url || '',
    nama_sekretaris: form.nama_sekretaris.trim(),
    ttd_sekretaris_url: form.ttd_sekretaris_url || '',
    nama_bendahara: form.nama_bendahara.trim(),
    ttd_bendahara_url: form.ttd_bendahara_url || '',
    jatuh_tempo_tanggal: Math.min(28, Math.max(1, Number(form.jatuh_tempo_tanggal || 10))),
    saldo_awal_pendaftaran: Number(form.saldo_awal_pendaftaran || 0),
    saldo_awal_operasional: Number(form.saldo_awal_operasional || 0),
    saldo_awal_kas_pondok: Number(form.saldo_awal_kas_pondok || 0),
    saldo_awal_mda: Number(form.saldo_awal_mda || 0),
  };
}

export function extractExtendedPayload(form: PengaturanFormState): PengaturanExtendedFields {
  return {
    kota_surat: form.kota_surat.trim() || 'Bululawang, Malang',
    rekening_bank: form.rekening_bank.trim(),
    rekening_nomor: form.rekening_nomor.trim(),
    rekening_atas_nama: form.rekening_atas_nama.trim(),
    kop_surat_url: (form.kop_surat_url || '').trim(),
    aturan_operasional: mergeAturanOperasional(form.aturan_operasional),
  };
}

export function isMissingColumnError(err: { code?: string; message?: string } | null | undefined): boolean {
  if (!err) return false;
  const code = String(err.code || '').toUpperCase();
  const msg = String(err.message || '').toLowerCase();
  return (
    code === 'PGRST204' ||
    code === '42703' ||
    msg.includes('could not find the') ||
    (msg.includes('column') && msg.includes('does not exist'))
  );
}

export function readExtendedLocal(): Partial<PengaturanExtendedFields> | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(LS_PENGATURAN_EXTENDED_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as Partial<PengaturanExtendedFields>;
  } catch {
    return null;
  }
}

export function writeExtendedLocal(ext: PengaturanExtendedFields): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(LS_PENGATURAN_EXTENDED_KEY, JSON.stringify(ext));
    writeTemaLocal(ext.aturan_operasional.tema);
  } catch {
    // Abaikan jika storage penuh
  }
}

export function readTemaLocal(): TemaAplikasiConfig | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(LS_TEMA_APLIKASI_KEY);
    if (!raw) return null;
    return mergeTemaAplikasi(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function writeTemaLocal(tema: TemaAplikasiConfig): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(LS_TEMA_APLIKASI_KEY, JSON.stringify(tema));
  } catch {
    // Abaikan jika storage penuh
  }
}

export function applyThemeToDocument(
  rawTema: TemaAplikasiConfig,
  extra?: { logoUrl?: string }
): void {
  if (typeof document === 'undefined') return;
  const tema = mergeTemaAplikasi(rawTema);
  const root = document.documentElement;

  const fontSpec = FONT_OPTIONS.find((f) => f.key === tema.fontFamily) || FONT_OPTIONS[0];
  const radiusPx = tema.radius === 'sharp' ? '6px' : tema.radius === 'rounded' ? '20px' : '12px';

  root.style.setProperty('--siap-primary', tema.primaryColor);
  root.style.setProperty('--siap-sidebar', tema.sidebarColor);
  root.style.setProperty('--siap-font', fontSpec.cssVar);
  root.style.setProperty('--siap-radius', radiusPx);

  if (tema.mode === 'dark') {
    root.classList.add('dark');
    root.style.setProperty('--siap-bg', '#0b1120');
    root.style.setProperty('--siap-surface', '#111827');
    root.style.setProperty('--siap-text', '#f1f5f9');
    root.style.colorScheme = 'dark';
  } else if (tema.mode === 'warm') {
    root.classList.remove('dark');
    root.style.setProperty('--siap-bg', '#f7f4ed');
    root.style.setProperty('--siap-surface', '#fffdf9');
    root.style.setProperty('--siap-text', '#1c1917');
    root.style.colorScheme = 'light';
  } else {
    root.classList.remove('dark');
    root.style.setProperty('--siap-bg', '#f8fafc');
    root.style.setProperty('--siap-surface', '#ffffff');
    root.style.setProperty('--siap-text', '#0f172a');
    root.style.colorScheme = 'light';
  }

  root.dataset.themeMode = tema.mode;
  root.dataset.themeFont = tema.fontFamily;
  root.dataset.themeRadius = tema.radius;
  root.dataset.themeDensity = tema.density;

  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent(THEME_UPDATED_EVENT, { detail: { tema, logoUrl: extra?.logoUrl } })
    );
  }
}
