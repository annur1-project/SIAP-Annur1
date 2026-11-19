import { createClient, type SupabaseClient } from '@supabase/supabase-js';

type Row = Record<string, unknown>;

interface QueryResult {
  data: unknown;
  error: null;
}

interface MockQueryBuilder {
  select: (columns?: string) => MockQueryBuilder;
  insert: (rows: Row | Row[]) => MockQueryBuilder;
  update: (values: Row) => MockQueryBuilder;
  upsert: (rows: Row | Row[], opts?: { onConflict?: string }) => MockQueryBuilder;
  delete: () => MockQueryBuilder;
  eq: (col: string, val: unknown) => MockQueryBuilder;
  neq: (col: string, val: unknown) => MockQueryBuilder;
  ilike: (col: string, pattern: string) => MockQueryBuilder;
  not: (col: string, op: string, val: unknown) => MockQueryBuilder;
  in: (col: string, vals: unknown[]) => MockQueryBuilder;
  gte: (col: string, val: string | number) => MockQueryBuilder;
  lte: (col: string, val: string | number) => MockQueryBuilder;
  or: (expr: string) => MockQueryBuilder;
  order: (col: string, opts?: { ascending?: boolean }) => MockQueryBuilder;
  limit: (n: number) => MockQueryBuilder;
  single: () => MockQueryBuilder;
  maybeSingle: () => MockQueryBuilder;
  execute: () => Promise<QueryResult>;
  then: <TResult1 = QueryResult, TResult2 = never>(
    onfulfilled?: ((value: QueryResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ) => Promise<TResult1 | TResult2>;
}

interface GlobalSupabaseEnvHolder {
  __SIAP_SUPABASE_ENV__?: {
    url?: string;
    anonKey?: string;
  };
}

function readSyncCredentials(): { url: string; anonKey: string } {
  const inlineUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
  const inlineKey = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').trim();
  if (inlineUrl && inlineKey) {
    return { url: inlineUrl, anonKey: inlineKey };
  }

  if (typeof window !== 'undefined') {
    const winEnv = (window as unknown as GlobalSupabaseEnvHolder).__SIAP_SUPABASE_ENV__;
    const winUrl = (winEnv?.url || '').trim();
    const winKey = (winEnv?.anonKey || '').trim();
    if (winUrl && winKey) {
      return { url: winUrl, anonKey: winKey };
    }
  } else {
    const serverUrl = (process.env.SUPABASE_URL || '').trim();
    const serverKey = (process.env.SUPABASE_ANON_KEY || '').trim();
    if (serverUrl && serverKey) {
      return { url: serverUrl, anonKey: serverKey };
    }
  }

  return { url: '', anonKey: '' };
}

function createId(prefix = 'id'): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function createMockSupabaseClient(): SupabaseClient {
  const nowIso = new Date().toISOString();

  const db: Record<string, Row[]> = {
    profiles: [
      {
        id: 'mock-admin-id',
        role: 'super_admin',
        nama_divisi: 'Bendahara & Admin Pondok',
        username: 'super.admin',
      },
    ],
    pengaturan_aplikasi: [
      {
        id: 1,
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
        saldo_awal_pendaftaran: 15000000,
        saldo_awal_operasional: 24500000,
        saldo_awal_kas_pondok: 8200000,
        saldo_awal_mda: 1840000,
        updated_at: nowIso,
      },
    ],
    master_pembayaran: [
      {
        id: 'mp-1',
        kode: 'syahriyah_reguler',
        nama_item: 'Syahriyah Bulanan (Reguler)',
        tipe_periode: 'bulanan',
        kategori_santri: 'reguler',
        dompet_tujuan: 'operasional',
        wajib_ndalem: false,
        aktif: true,
        urutan: 1,
      },
      {
        id: 'mp-2',
        kode: 'syahriyah_vip',
        nama_item: 'Syahriyah Bulanan (VIP)',
        tipe_periode: 'bulanan',
        kategori_santri: 'vip',
        dompet_tujuan: 'operasional',
        wajib_ndalem: false,
        aktif: true,
        urutan: 2,
      },
      {
        id: 'mp-3',
        kode: 'syahriyah_ndalem',
        nama_item: 'Syahriyah Bulanan (Ndalem)',
        tipe_periode: 'bulanan',
        kategori_santri: 'ndalem',
        dompet_tujuan: 'operasional',
        wajib_ndalem: true,
        aktif: true,
        urutan: 3,
      },
      {
        id: 'mp-4',
        kode: 'ujian_mda_1',
        nama_item: 'Ujian MDA Semester 1',
        tipe_periode: 'tahunan',
        kategori_santri: 'semua',
        dompet_tujuan: 'mda',
        wajib_ndalem: false,
        aktif: true,
        urutan: 4,
      },
      {
        id: 'mp-5',
        kode: 'ujian_mda_2',
        nama_item: 'Ujian MDA Semester 2',
        tipe_periode: 'tahunan',
        kategori_santri: 'semua',
        dompet_tujuan: 'mda',
        wajib_ndalem: false,
        aktif: true,
        urutan: 5,
      },
      {
        id: 'mp-6',
        kode: 'raport_mda',
        nama_item: 'Raport MDA',
        tipe_periode: 'tahunan',
        kategori_santri: 'semua',
        dompet_tujuan: 'mda',
        wajib_ndalem: false,
        aktif: true,
        urutan: 6,
      },
      {
        id: 'mp-7',
        kode: 'kalender_pondok',
        nama_item: 'Kalender Pondok',
        tipe_periode: 'tahunan',
        kategori_santri: 'semua',
        dompet_tujuan: 'operasional',
        wajib_ndalem: false,
        aktif: true,
        urutan: 7,
      },
      {
        id: 'mp-8',
        kode: 'haul_masyayikh',
        nama_item: 'Iuran Haul Masyayikh',
        tipe_periode: 'tahunan',
        kategori_santri: 'semua',
        dompet_tujuan: 'operasional',
        wajib_ndalem: false,
        aktif: true,
        urutan: 8,
      },
      {
        id: 'mp-9',
        kode: 'kesehatan_tahunan',
        nama_item: 'Iuran Kesehatan / Poskestren',
        tipe_periode: 'tahunan',
        kategori_santri: 'semua',
        dompet_tujuan: 'operasional',
        wajib_ndalem: false,
        aktif: true,
        urutan: 9,
      },
      {
        id: 'mp-10',
        kode: 'al_adzkar',
        nama_item: 'Al-Adzkar',
        tipe_periode: 'tahunan',
        kategori_santri: 'semua',
        dompet_tujuan: 'operasional',
        wajib_ndalem: false,
        urutan: 10,
        aktif: true,
      },
      {
        id: 'mp-11',
        kode: 'almamater',
        nama_item: 'Almamater',
        tipe_periode: 'tahunan',
        kategori_santri: 'semua',
        dompet_tujuan: 'operasional',
        wajib_ndalem: false,
        urutan: 11,
        aktif: true,
      },
      {
        id: 'mp-12',
        kode: 'kitab_madin',
        nama_item: 'Kitab Madin',
        tipe_periode: 'tahunan',
        kategori_santri: 'semua',
        dompet_tujuan: 'operasional',
        wajib_ndalem: false,
        urutan: 12,
        aktif: true,
      },
      {
        id: 'mp-13',
        kode: 'infaq_madin',
        nama_item: 'Infaq Madin',
        tipe_periode: 'tahunan',
        kategori_santri: 'semua',
        dompet_tujuan: 'pendaftaran',
        wajib_ndalem: false,
        urutan: 13,
        aktif: true,
      },
    ],
    master_pembayaran_riwayat: [
      { id: 'mpr-1', item_id: 'mp-1', nominal: 425000, berlaku_mulai: '2024-07-01', catatan: 'Tarif awal' },
      { id: 'mpr-2', item_id: 'mp-2', nominal: 475000, berlaku_mulai: '2024-07-01', catatan: 'Tarif awal VIP' },
      { id: 'mpr-3', item_id: 'mp-3', nominal: 145000, berlaku_mulai: '2024-07-01', catatan: 'Tarif awal Ndalem' },
      { id: 'mpr-4', item_id: 'mp-4', nominal: 75000, berlaku_mulai: '2024-07-01', catatan: 'Tarif awal' },
      { id: 'mpr-5', item_id: 'mp-5', nominal: 75000, berlaku_mulai: '2024-07-01', catatan: 'Tarif awal' },
      { id: 'mpr-6', item_id: 'mp-6', nominal: 50000, berlaku_mulai: '2024-07-01', catatan: 'Tarif awal' },
      { id: 'mpr-7', item_id: 'mp-7', nominal: 35000, berlaku_mulai: '2024-07-01', catatan: 'Tarif awal' },
      { id: 'mpr-8', item_id: 'mp-8', nominal: 50000, berlaku_mulai: '2024-07-01', catatan: 'Tarif awal' },
      { id: 'mpr-9', item_id: 'mp-9', nominal: 50000, berlaku_mulai: '2024-07-01', catatan: 'Tarif awal' },
      { id: 'mpr-10', item_id: 'mp-10', nominal: 35000, berlaku_mulai: '2026-07-01', catatan: 'Tarif awal Al-Adzkar' },
      { id: 'mpr-11', item_id: 'mp-11', nominal: 150000, berlaku_mulai: '2026-07-01', catatan: 'Tarif awal Almamater' },
      { id: 'mpr-12', item_id: 'mp-12', nominal: 120000, berlaku_mulai: '2026-07-01', catatan: 'Tarif awal Kitab Madin' },
      { id: 'mpr-13', item_id: 'mp-13', nominal: 50000, berlaku_mulai: '2026-07-01', catatan: 'Tarif awal Infaq Madin' },
    ],
    santri: [
      {
        id: 'santri-1',
        nis: '260001',
        tgl_masuk: '2026-07-10',
        nama_lengkap: 'Ahmad Fauzan',
        kamar: 'A1',
        tarif_syahriyah: 425000,
        status: 'aktif',
        jk: 'L',
        tempat_lahir: 'Malang',
        tgl_lahir: '2012-05-10',
        nisn: '0091234567',
        nik: '3507123456780001',
        status_ayah: 'Hidup',
        nama_ayah: 'H. Abdul Karim',
        pendidikan_ayah: 'S1',
        pekerjaan_ayah: 'Wiraswasta',
        no_wa_ayah: '081234567890',
        status_ibu: 'Hidup',
        nama_ibu: 'Hj. Siti Aminah',
        pendidikan_ibu: 'SMA',
        pekerjaan_ibu: 'Ibu Rumah Tangga',
        no_wa_ibu: '081234567891',
        nama_wali: 'H. Abdul Karim',
        no_wa_wali: '081234567890',
        alamat_jalan: 'Jl. Raya Bululawang No. 12',
        desa: 'Bululawang',
        kecamatan: 'Bululawang',
        kabupaten: 'KAB. MALANG',
        provinsi: 'JAWA TIMUR',
        kode_pos: '65171',
        unit_asrama: 'Induk Putra',
      },
      {
        id: 'santri-2',
        nis: '260002',
        tgl_masuk: '2026-07-12',
        nama_lengkap: 'M. Akhdan Amirul Azhar',
        kamar: 'A10',
        tarif_syahriyah: 425000,
        status: 'aktif',
        jk: 'L',
        tempat_lahir: 'Pasuruan',
        tgl_lahir: '2011-08-21',
        status_ayah: 'Hidup',
        nama_ayah: 'Bapak Sulaiman',
        no_wa_ayah: '081333444555',
        status_ibu: 'Hidup',
        nama_ibu: 'Ibu Halimah',
        nama_wali: 'Bapak Sulaiman',
        no_wa_wali: '081333444555',
        alamat_jalan: 'Dusun Krajan RT 02 RW 01',
        desa: 'Krebet',
        kecamatan: 'Bululawang',
        kabupaten: 'KAB. MALANG',
        provinsi: 'JAWA TIMUR',
        kode_pos: '65171',
        unit_asrama: 'Induk Putra',
      },
      {
        id: 'santri-3',
        nis: '260003',
        tgl_masuk: '2026-07-14',
        nama_lengkap: 'Muhammad Rizqi Ramadhan',
        kamar: 'Al-Fachriyah 1 (VIP)',
        tarif_syahriyah: 475000,
        status: 'aktif',
        jk: 'L',
        nama_ayah: 'H. Moch. Yusuf',
        no_wa_ayah: '081555666777',
        nama_wali: 'H. Moch. Yusuf',
        no_wa_wali: '081555666777',
        alamat_jalan: 'Jl. Diponegoro No. 45',
        desa: 'Bululawang',
        kecamatan: 'Bululawang',
        kabupaten: 'KAB. MALANG',
        provinsi: 'JAWA TIMUR',
        kode_pos: '65171',
        unit_asrama: 'Induk Putra',
      },
    ],
    pengurus: [
      {
        id: 'pengurus-1',
        nama_lengkap: 'Dr. KH. A. Fahrur Rozi',
        no_wa: '081111222333',
        alamat: 'Bululawang, Malang',
        foto_url: null,
        ttd_url: null,
        nominal_bisyaroh: 0,
        status: 'aktif',
        masa_khidmat: '2026/2027',
        catatan: null,
        created_at: '2026-01-01T00:00:00Z',
      },
      {
        id: 'pengurus-2',
        nama_lengkap: 'Ust. M. Fajar Wahyudi',
        no_wa: '085604551562',
        alamat: 'Malang, Jawa Timur',
        foto_url: null,
        ttd_url: null,
        nominal_bisyaroh: 750000,
        status: 'aktif',
        masa_khidmat: '2026/2027',
        catatan: null,
        created_at: '2026-01-02T00:00:00Z',
      },
      {
        id: 'pengurus-3',
        nama_lengkap: 'Ust. Moh. Sayid Ali',
        no_wa: '081234000111',
        alamat: 'Bululawang, Malang',
        foto_url: null,
        ttd_url: null,
        nominal_bisyaroh: 600000,
        status: 'aktif',
        masa_khidmat: '2026/2027',
        catatan: null,
        created_at: '2026-01-03T00:00:00Z',
      },
      {
        id: 'pengurus-4',
        nama_lengkap: 'Ust. Ali Nur Ikasan',
        no_wa: '081234000222',
        alamat: 'Bululawang, Malang',
        foto_url: null,
        ttd_url: null,
        nominal_bisyaroh: 600000,
        status: 'aktif',
        masa_khidmat: '2026/2027',
        catatan: null,
        created_at: '2026-01-04T00:00:00Z',
      },
    ],
    pengurus_jabatan: [
      {
        id: 'jab-1',
        pengurus_id: 'pengurus-1',
        divisi: 'Pengasuh Pondok',
        nama_jabatan: 'Pengasuh Pondok',
        is_utama: true,
        urutan_struktur: 1,
      },
      {
        id: 'jab-2',
        pengurus_id: 'pengurus-2',
        divisi: 'Dewan Harian',
        nama_jabatan: 'Kepala Pondok',
        is_utama: true,
        urutan_struktur: 4,
      },
      {
        id: 'jab-3',
        pengurus_id: 'pengurus-3',
        divisi: 'Dewan Harian',
        nama_jabatan: 'Sekretaris',
        is_utama: true,
        urutan_struktur: 4,
      },
      {
        id: 'jab-4',
        pengurus_id: 'pengurus-4',
        divisi: 'Dewan Harian',
        nama_jabatan: 'Bendahara',
        is_utama: true,
        urutan_struktur: 4,
      },
    ],
    pembayaran_santri_detail: [],
    keuangan_transaksi: [],
    absen_jamaah: [],
    izin_pulang: [],
    santri_sakit: [],
    poskestren_obat: [],
    poskestren_penyuluhan: [],
    keamanan_pelanggaran: [],
    keamanan_sita_barang: [],
    keamanan_master_pelanggaran: [
      {
        id: 'kmp-1',
        nama_pelanggaran: 'Terlambat Kembali Izin Pulang',
        tingkat: 'sedang',
        poin: 15,
        takzir_default: 'Takzir kebersihan halaman & wajib lapor keamanan 3 hari',
        aktif: true,
      },
      {
        id: 'kmp-2',
        nama_pelanggaran: 'Tidak Mengikuti Sholat Jamaah Tanpa Udzur',
        tingkat: 'ringan',
        poin: 5,
        takzir_default: 'Membaca istighfar & piket kebersihan masjid/musholla',
        aktif: true,
      },
      {
        id: 'kmp-3',
        nama_pelanggaran: 'Keluar Area Pondok Tanpa Surat Izin',
        tingkat: 'sedang',
        poin: 20,
        takzir_default: 'Pembinaan khusus Sie Keamanan & kerja bakti asrama',
        aktif: true,
      },
      {
        id: 'kmp-4',
        nama_pelanggaran: 'Membawa / Menggunakan HP atau Elektronik Terlarang',
        tingkat: 'berat',
        poin: 35,
        takzir_default: 'Penyitaan barang oleh Keamanan & pemanggilan wali santri',
        aktif: true,
      },
      {
        id: 'kmp-5',
        nama_pelanggaran: 'Merokok / Membawa Rokok atau Vape di Pondok',
        tingkat: 'berat',
        poin: 30,
        takzir_default: 'Penyitaan barang, takzir hafalan surat & pembinaan wali',
        aktif: true,
      },
      {
        id: 'kmp-6',
        nama_pelanggaran: 'Terlambat Kegiatan Pengajian / Diniyah',
        tingkat: 'ringan',
        poin: 5,
        takzir_default: 'Berdiri membaca nadhom / membersihkan ruang kelas',
        aktif: true,
      },
      {
        id: 'kmp-7',
        nama_pelanggaran: 'Berkelahi / Mengintimidasi Sesama Santri',
        tingkat: 'berat',
        poin: 40,
        takzir_default: 'Sidang Sie Keamanan, surat pernyataan & panggilan wali',
        aktif: true,
      },
      {
        id: 'kmp-8',
        nama_pelanggaran: 'Kabur / Pulang Tanpa Izin (Minggat)',
        tingkat: 'berat',
        poin: 50,
        takzir_default: 'Wajib diantar wali menghadap Pengasuh / Kepala Pondok & SP',
        aktif: true,
      },
    ],
    wilayah_indonesia: [
      { Kelurahan: 'Bululawang', Kecamatan: 'Bululawang', Kabupaten: 'KAB. MALANG', Provinsi: 'JAWA TIMUR', 'Kode Pos': '65171' },
      { Kelurahan: 'Krebet', Kecamatan: 'Bululawang', Kabupaten: 'KAB. MALANG', Provinsi: 'JAWA TIMUR', 'Kode Pos': '65171' },
      { Kelurahan: 'Wandanpuro', Kecamatan: 'Bululawang', Kabupaten: 'KAB. MALANG', Provinsi: 'JAWA TIMUR', 'Kode Pos': '65171' },
      { Kelurahan: 'Kasri', Kecamatan: 'Bululawang', Kabupaten: 'KAB. MALANG', Provinsi: 'JAWA TIMUR', 'Kode Pos': '65171' },
      { Kelurahan: 'Sempalwadak', Kecamatan: 'Bululawang', Kabupaten: 'KAB. MALANG', Provinsi: 'JAWA TIMUR', 'Kode Pos': '65171' },
    ],
  };

  const storageUrls = new Map<string, string>();

  function getTableRows(table: string): Row[] {
    if (table === 'v_pengurus_lengkap') {
      return (db.pengurus || []).map((p) => ({
        ...p,
        jabatan_list: (db.pengurus_jabatan || []).filter((j) => j.pengurus_id === p.id),
      }));
    }
    if (!db[table]) db[table] = [];
    return db[table];
  }

  function matchIlike(value: unknown, pattern: string): boolean {
    if (value == null) return false;
    const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*');
    return new RegExp(`^${escaped}$`, 'i').test(String(value));
  }

  function createQueryBuilder(table: string): MockQueryBuilder {
    let action: 'select' | 'insert' | 'update' | 'upsert' | 'delete' = 'select';
    let payloadRows: Row[] = [];
    let payloadUpdate: Row = {};
    let upsertConflictKey = 'id';
    let wantSelectAfterMutation = false;
    let expectSingle = false;
    let expectMaybeSingle = false;
    let limitCount: number | null = null;
    const orders: Array<{ col: string; ascending: boolean }> = [];
    const filters: Array<(row: Row) => boolean> = [];

    const builder: MockQueryBuilder = {
      select() {
        if (action !== 'select') {
          wantSelectAfterMutation = true;
        }
        return builder;
      },
      insert(rows: Row | Row[]) {
        action = 'insert';
        payloadRows = Array.isArray(rows) ? rows : [rows];
        return builder;
      },
      update(values: Row) {
        action = 'update';
        payloadUpdate = values;
        return builder;
      },
      upsert(rows: Row | Row[], opts?: { onConflict?: string }) {
        action = 'upsert';
        payloadRows = Array.isArray(rows) ? rows : [rows];
        if (opts?.onConflict) upsertConflictKey = opts.onConflict;
        return builder;
      },
      delete() {
        action = 'delete';
        return builder;
      },
      eq(col: string, val: unknown) {
        filters.push((row) => row[col] === val);
        return builder;
      },
      neq(col: string, val: unknown) {
        filters.push((row) => row[col] !== val);
        return builder;
      },
      ilike(col: string, pattern: string) {
        filters.push((row) => matchIlike(row[col], pattern));
        return builder;
      },
      not(col: string, op: string, val: unknown) {
        if (op === 'is' && val === null) {
          filters.push((row) => row[col] !== null && row[col] !== undefined);
        } else if (op === 'ilike') {
          filters.push((row) => !matchIlike(row[col], String(val)));
        }
        return builder;
      },
      in(col: string, vals: unknown[]) {
        filters.push((row) => vals.includes(row[col]));
        return builder;
      },
      gte(col: string, val: string | number) {
        filters.push((row) => {
          const cur = row[col];
          return (typeof cur === 'string' || typeof cur === 'number') && cur >= val;
        });
        return builder;
      },
      lte(col: string, val: string | number) {
        filters.push((row) => {
          const cur = row[col];
          return (typeof cur === 'string' || typeof cur === 'number') && cur <= val;
        });
        return builder;
      },
      or(expr: string) {
        const clauses = expr.split(',');
        filters.push((row) =>
          clauses.some((clause) => {
            const parts = clause.split('.');
            if (parts.length >= 3 && parts[1] === 'ilike') {
              const col = parts[0];
              const pat = parts.slice(2).join('.');
              return matchIlike(row[col], pat);
            }
            return false;
          })
        );
        return builder;
      },
      order(col: string, opts?: { ascending?: boolean }) {
        orders.push({ col, ascending: opts?.ascending !== false });
        return builder;
      },
      limit(n: number) {
        limitCount = n;
        return builder;
      },
      single() {
        expectSingle = true;
        return builder;
      },
      maybeSingle() {
        expectMaybeSingle = true;
        return builder;
      },
      async execute(): Promise<QueryResult> {
        const applyFilters = (rows: Row[]) =>
          filters.length === 0 ? [...rows] : rows.filter((r) => filters.every((fn) => fn(r)));

        let resultRows: Row[] = [];

        if (action === 'select') {
          resultRows = applyFilters(getTableRows(table));
          if (table === 'keuangan_transaksi') {
            resultRows = resultRows.map((tx) => {
              const s = (db.santri || []).find((item) => item.id === tx.santri_id);
              return {
                ...tx,
                santri: s ? { nama_lengkap: s.nama_lengkap, nis: s.nis, kamar: s.kamar } : null,
              };
            });
          }
          if (orders.length > 0) {
            resultRows.sort((a, b) => {
              for (const o of orders) {
                const av = String(a[o.col] ?? '');
                const bv = String(b[o.col] ?? '');
                if (av < bv) return o.ascending ? -1 : 1;
                if (av > bv) return o.ascending ? 1 : -1;
              }
              return 0;
            });
          }
          if (limitCount !== null) {
            resultRows = resultRows.slice(0, limitCount);
          }
        } else if (action === 'insert') {
          const target = getTableRows(table);
          const inserted = payloadRows.map((item) => ({
            id: item.id || createId(table),
            created_at: item.created_at || new Date().toISOString(),
            ...item,
          }));
          target.push(...inserted);
          resultRows = inserted;
        } else if (action === 'update') {
          const target = getTableRows(table);
          const matched = applyFilters(target);
          matched.forEach((row) => Object.assign(row, payloadUpdate));
          resultRows = matched;
        } else if (action === 'upsert') {
          const target = getTableRows(table);
          const upserted: Row[] = [];
          for (const item of payloadRows) {
            const keyVal = item[upsertConflictKey];
            const existing = keyVal !== undefined ? target.find((r) => r[upsertConflictKey] === keyVal) : undefined;
            if (existing) {
              Object.assign(existing, item);
              upserted.push(existing);
            } else {
              const created = {
                id: item.id || createId(table),
                created_at: item.created_at || new Date().toISOString(),
                ...item,
              };
              target.push(created);
              upserted.push(created);
            }
          }
          resultRows = upserted;
        } else if (action === 'delete') {
          const target = getTableRows(table);
          const toDelete = new Set(applyFilters(target));
          db[table] = target.filter((r) => !toDelete.has(r));
          resultRows = Array.from(toDelete);
        }

        if (action !== 'select' && !wantSelectAfterMutation && !expectSingle && !expectMaybeSingle) {
          return { data: null, error: null };
        }

        if (expectSingle || expectMaybeSingle) {
          return { data: resultRows[0] ?? null, error: null };
        }

        return { data: resultRows, error: null };
      },
      then(onfulfilled, onrejected) {
        return builder.execute().then(onfulfilled, onrejected);
      },
    };

    return builder;
  }

  return {
    from: (table: string) => createQueryBuilder(table),
    auth: {
      getUser: async () => ({
        data: { user: { id: 'mock-admin-id', email: 'super.admin@annur1.local' } },
        error: null,
      }),
    },
    storage: {
      from: (bucket: string) => ({
        upload: async (fileName: string, file: Blob) => {
          let url = `/api/mock-storage/${bucket}/${fileName}`;
          if (typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
            try {
              url = URL.createObjectURL(file);
            } catch {
              // ignore in non-browser environment
            }
          }
          storageUrls.set(`${bucket}/${fileName}`, url);
          return { data: { path: fileName }, error: null };
        },
        getPublicUrl: (fileName: string) => ({
          data: {
            publicUrl: storageUrls.get(`${bucket}/${fileName}`) || `/favicon.ico`,
          },
        }),
      }),
    },
  } as unknown as SupabaseClient;
}

let cachedRealClient: SupabaseClient | null = null;
let cachedMockClient: SupabaseClient | null = null;
let runtimeEnvPromise: Promise<void> | null = null;

function getRealClientSync(): SupabaseClient | null {
  if (cachedRealClient) return cachedRealClient;
  const { url, anonKey } = readSyncCredentials();
  if (url && anonKey) {
    cachedRealClient = createClient(url, anonKey);
    return cachedRealClient;
  }
  return null;
}

async function resolveClientAsync(): Promise<SupabaseClient> {
  const immediate = getRealClientSync();
  if (immediate) return immediate;

  if (typeof window !== 'undefined') {
    if (!runtimeEnvPromise) {
      runtimeEnvPromise = fetch('/api/supabase-env', { cache: 'no-store' })
        .then(async (res) => {
          if (!res.ok) return;
          const json = (await res.json()) as { url?: string; anonKey?: string };
          const url = (json?.url || '').trim();
          const anonKey = (json?.anonKey || '').trim();
          if (url && anonKey) {
            (window as unknown as GlobalSupabaseEnvHolder).__SIAP_SUPABASE_ENV__ = { url, anonKey };
            cachedRealClient = createClient(url, anonKey);
          }
        })
        .catch(() => {
          // If runtime config endpoint fails, fallback remains available only when truly unconfigured
        });
    }
    await runtimeEnvPromise;
    if (cachedRealClient) return cachedRealClient;
  }

  if (!cachedMockClient) {
    cachedMockClient = createMockSupabaseClient();
  }
  return cachedMockClient;
}

function getFallbackClientSync(): SupabaseClient {
  const real = getRealClientSync();
  if (real) return real;
  if (!cachedMockClient) {
    cachedMockClient = createMockSupabaseClient();
  }
  return cachedMockClient;
}

type OpRecord = { method: string; args: unknown[] };

function createDeferredQueryBuilder(table: string): unknown {
  const ops: OpRecord[] = [];

  const proxy: Record<string, unknown> = {
    then(
      onfulfilled?: ((value: unknown) => unknown) | null,
      onrejected?: ((reason: unknown) => unknown) | null
    ) {
      return resolveClientAsync()
        .then((client) => {
          let target: unknown = client.from(table);
          for (const op of ops) {
            const fn = (target as Record<string, (...a: unknown[]) => unknown>)[op.method];
            target = fn.apply(target, op.args);
          }
          return target as Promise<unknown>;
        })
        .then(onfulfilled ?? undefined, onrejected ?? undefined);
    },
  };

  return new Proxy(proxy, {
    get(target, prop) {
      if (prop === 'then') return target.then;
      if (typeof prop === 'string') {
        return (...args: unknown[]) => {
          ops.push({ method: prop, args });
          return createProxyWrapper();
        };
      }
      return undefined;
    },
  });

  function createProxyWrapper(): unknown {
    return new Proxy(proxy, {
      get(target, prop) {
        if (prop === 'then') return target.then;
        if (typeof prop === 'string') {
          return (...args: unknown[]) => {
            ops.push({ method: prop, args });
            return createProxyWrapper();
          };
        }
        return undefined;
      },
    });
  }
}

export const supabase: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    const immediateReal = getRealClientSync();
    if (immediateReal) {
      const value = Reflect.get(immediateReal, prop, immediateReal);
      return typeof value === 'function' ? value.bind(immediateReal) : value;
    }

    if (prop === 'from') {
      return (table: string) => createDeferredQueryBuilder(table);
    }

    if (prop === 'auth') {
      return {
        getUser: async (...args: unknown[]) => {
          const client = await resolveClientAsync();
          return (client.auth.getUser as (...a: unknown[]) => Promise<unknown>)(...args);
        },
        getSession: async (...args: unknown[]) => {
          const client = await resolveClientAsync();
          return (client.auth.getSession as (...a: unknown[]) => Promise<unknown>)(...args);
        },
      };
    }

    if (prop === 'storage') {
      return {
        from: (bucket: string) => ({
          upload: async (path: string, fileBody: unknown, fileOptions?: unknown) => {
            const client = await resolveClientAsync();
            return client.storage.from(bucket).upload(path, fileBody as Blob, fileOptions as object);
          },
          getPublicUrl: (path: string) => {
            const client = getFallbackClientSync();
            return client.storage.from(bucket).getPublicUrl(path);
          },
        }),
      };
    }

    const fallback = getFallbackClientSync();
    const value = Reflect.get(fallback, prop, fallback);
    return typeof value === 'function' ? value.bind(fallback) : value;
  },
});