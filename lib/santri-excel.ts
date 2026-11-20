import {
  generateNextNisForYear,
  type SkemaPendaftaranConfig,
} from './pengaturan';

export const SANTRI_ALLOWED_DB_COLUMNS = [
  'nis',
  'tgl_masuk',
  'nama_lengkap',
  'kamar',
  'tarif_syahriyah',
  'nisn',
  'nik',
  'no_kk',
  'tempat_lahir',
  'tgl_lahir',
  'jk',
  'hobi',
  'cita_cita',
  'status_ayah',
  'nama_ayah',
  'nik_ayah',
  'pendidikan_ayah',
  'pekerjaan_ayah',
  'penghasilan_ayah',
  'no_wa_ayah',
  'status_ibu',
  'nama_ibu',
  'nik_ibu',
  'pendidikan_ibu',
  'pekerjaan_ibu',
  'penghasilan_ibu',
  'no_wa_ibu',
  'nama_wali',
  'nik_wali',
  'pendidikan_wali',
  'pekerjaan_wali',
  'no_wa_wali',
  'alamat_jalan',
  'rt',
  'rw',
  'desa',
  'kecamatan',
  'kabupaten',
  'provinsi',
  'kode_pos',
  'status',
  'foto_url',
  'unit_asrama',
  'paket_pendaftaran',
  'nominal_pendaftaran',
  'catatan_keringanan',
] as const;

export function sanitizeSantriDbPayload(
  data: Record<string, unknown>
): Record<string, unknown> {
  const clean: Record<string, unknown> = {};
  SANTRI_ALLOWED_DB_COLUMNS.forEach((col) => {
    if (data[col] !== undefined) {
      clean[col] = data[col] === '' ? null : data[col];
    }
  });
  return clean;
}

export function normalizeExcelCellString(raw: unknown): string {
  if (raw === null || raw === undefined) return '';
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw)) return '';
    return String(raw).trim();
  }
  const s = String(raw).trim();
  if (s.toLowerCase() === 'null' || s.toLowerCase() === 'undefined') return '';
  return s;
}

export function normalizeExcelNis(raw: unknown): string {
  const s = normalizeExcelCellString(raw).replace(/\.0+$/, '');
  if (!s || s.toLowerCase().includes('kosongi')) return '';
  return s;
}

export function normalizeExcelDate(raw: unknown): string {
  if (raw === null || raw === undefined || raw === '') return '';
  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 20000 && raw < 80000) {
    // Excel serial date (epoch 1899-12-30)
    const ms = Math.round((raw - 25569) * 86400 * 1000);
    const d = new Date(ms);
    if (!Number.isNaN(d.getTime())) {
      return d.toISOString().slice(0, 10);
    }
  }
  const str = String(raw).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
    return str.slice(0, 10);
  }
  const slashMatch = str.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (slashMatch) {
    const [, dd, mm, yyyy] = slashMatch;
    return `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
  }
  return str;
}

export interface ExistingSantriRecord {
  id: string;
  nis?: string | null;
  tgl_masuk?: string | null;
  nama_lengkap?: string | null;
  kamar?: string | null;
  tarif_syahriyah?: number | null;
  status?: string | null;
  unit_asrama?: string | null;
  paket_pendaftaran?: string | null;
  nominal_pendaftaran?: number | null;
  catatan_keringanan?: string | null;
  foto_url?: string | null;
  [key: string]: unknown;
}

export interface SantriExcelUpdateItem {
  id: string;
  nis: string;
  payload: Record<string, unknown>;
}

export interface SantriExcelInsertItem {
  nis: string;
  payload: Record<string, unknown>;
}

export interface SantriExcelImportPlan {
  updates: SantriExcelUpdateItem[];
  inserts: SantriExcelInsertItem[];
  total: number;
}

function pickNonEmpty(excelVal: string, existingVal: unknown): unknown {
  if (excelVal !== '') return excelVal;
  return existingVal ?? null;
}

function resolveTarifFromRow(params: {
  tipeSppRaw: string;
  kamarVal: string;
  skema: SkemaPendaftaranConfig;
  existingTarif?: number | null;
  existingKamar?: string | null;
}): number {
  const tipe = params.tipeSppRaw.toLowerCase();
  const kamarUpper = params.kamarVal.toUpperCase();
  const oldKamarUpper = String(params.existingKamar || '').toUpperCase();

  if (tipe.includes('vip') || kamarUpper.includes('VIP')) {
    return Number(params.skema.syahriyah_vip || 500000);
  }
  if (tipe.includes('ndalem') || kamarUpper === 'NDALEM') {
    return 145000;
  }
  if (
    params.existingTarif &&
    params.existingTarif > 0 &&
    (!tipe || oldKamarUpper === kamarUpper)
  ) {
    return Number(params.existingTarif);
  }
  return Number(params.skema.syahriyah_reguler || 450000);
}

/**
 * Menyusun rencana Impor Excel Data Santri:
 * - Jika baris Excel memiliki NIS yang cocok dengan santri di database:
 *   -> TIDAK menerbitkan NIS baru; memperbarui kolom data EMIS/kamar pada record tersebut
 *      dengan tetap menjaga `status`, `paket_pendaftaran`, `nominal_pendaftaran`, dan `nis` aslinya.
 * - Jika NIS kosong (atau santri baru):
 *   -> Menerbitkan NIS berurutan berdasarkan tahun tanggal masuk (`generateNextNisForYear`).
 */
export function buildSantriExcelImportPlan(params: {
  rows: Array<Record<string, unknown>>;
  existingSantriList: ExistingSantriRecord[];
  skemaPendaftaran: SkemaPendaftaranConfig;
  todayStr: string;
}): SantriExcelImportPlan {
  const validRows = params.rows.filter((r) => {
    const nama = normalizeExcelCellString(r['Nama Lengkap']);
    return Boolean(nama) && !nama.toLowerCase().includes('wajib');
  });

  const existingByNis = new Map<string, ExistingSantriRecord>();
  params.existingSantriList.forEach((s) => {
    const key = normalizeExcelNis(s.nis);
    if (key) existingByNis.set(key, s);
  });

  const workingNisList: Array<{ nis?: string | null }> = params.existingSantriList.map((s) => ({
    nis: s.nis,
  }));

  const updates: SantriExcelUpdateItem[] = [];
  const inserts: SantriExcelInsertItem[] = [];

  for (const row of validRows) {
    const excelNis = normalizeExcelNis(row['NIS']);
    const existing = excelNis ? existingByNis.get(excelNis) : undefined;

    const rawTglMasuk = normalizeExcelDate(row['Tanggal Masuk']);
    const rawTglLahir = normalizeExcelDate(row['Tanggal Lahir']);
    const rawKamar = normalizeExcelCellString(row['Khos / Kamar']);
    const tipeSppRaw = normalizeExcelCellString(row['Tipe SPP']);
    const namaLengkap = normalizeExcelCellString(row['Nama Lengkap']);
    const jkRaw = normalizeExcelCellString(row['Jenis Kelamin (L/P)']).toUpperCase();
    const jk = jkRaw === 'P' ? 'P' : jkRaw === 'L' ? 'L' : '';

    const namaAyah = normalizeExcelCellString(row['Nama Ayah']);
    const nikAyah = normalizeExcelCellString(row['NIK Ayah']);
    const pendidikanAyah = normalizeExcelCellString(row['Pendidikan Ayah']);
    const pekerjaanAyah = normalizeExcelCellString(row['Pekerjaan Ayah']);
    const waAyah = normalizeExcelCellString(row['No HP/WA Ayah']);

    const namaWaliExcel = normalizeExcelCellString(row['Nama Wali']);
    const nikWaliExcel = normalizeExcelCellString(row['NIK Wali']);
    const pendWaliExcel = normalizeExcelCellString(row['Pendidikan Wali']);
    const pekWaliExcel = normalizeExcelCellString(row['Pekerjaan Wali']);
    const waWaliExcel = normalizeExcelCellString(row['No HP/WA Wali']);

    if (existing) {
      const tglMasuk = rawTglMasuk || normalizeExcelDate(existing.tgl_masuk) || params.todayStr || '2027-07-01';
      const kamar = rawKamar || String(existing.kamar || 'Menunggu Penempatan');
      const tarif = resolveTarifFromRow({
        tipeSppRaw,
        kamarVal: kamar,
        skema: params.skemaPendaftaran,
        existingTarif: existing.tarif_syahriyah,
        existingKamar: existing.kamar,
      });

      const mergedAyah = pickNonEmpty(namaAyah, existing.nama_ayah);
      const mergedNikAyah = pickNonEmpty(nikAyah, existing.nik_ayah);
      const mergedPendAyah = pickNonEmpty(pendidikanAyah, existing.pendidikan_ayah);
      const mergedPekAyah = pickNonEmpty(pekerjaanAyah, existing.pekerjaan_ayah);
      const mergedWaAyah = pickNonEmpty(waAyah, existing.no_wa_ayah);

      const payload = sanitizeSantriDbPayload({
        nis: existing.nis || excelNis,
        tgl_masuk: tglMasuk,
        nama_lengkap: namaLengkap || existing.nama_lengkap,
        kamar,
        tarif_syahriyah: tarif,
        nisn: pickNonEmpty(normalizeExcelCellString(row['NISN']), existing.nisn),
        nik: pickNonEmpty(normalizeExcelCellString(row['NIK']), existing.nik),
        no_kk: pickNonEmpty(normalizeExcelCellString(row['No KK']), existing.no_kk),
        tempat_lahir: pickNonEmpty(normalizeExcelCellString(row['Tempat Lahir']), existing.tempat_lahir),
        tgl_lahir: rawTglLahir || existing.tgl_lahir || null,
        jk: jk || existing.jk || 'L',
        hobi: pickNonEmpty(normalizeExcelCellString(row['Hobi']), existing.hobi),
        cita_cita: pickNonEmpty(normalizeExcelCellString(row['Cita-Cita']), existing.cita_cita),
        status_ayah: pickNonEmpty(normalizeExcelCellString(row['Status Ayah']), existing.status_ayah || 'Hidup'),
        nama_ayah: mergedAyah,
        nik_ayah: mergedNikAyah,
        pendidikan_ayah: mergedPendAyah,
        pekerjaan_ayah: mergedPekAyah,
        penghasilan_ayah: pickNonEmpty(
          normalizeExcelCellString(row['Penghasilan Ayah']),
          existing.penghasilan_ayah
        ),
        no_wa_ayah: mergedWaAyah,
        status_ibu: pickNonEmpty(normalizeExcelCellString(row['Status Ibu']), existing.status_ibu || 'Hidup'),
        nama_ibu: pickNonEmpty(normalizeExcelCellString(row['Nama Ibu']), existing.nama_ibu),
        nik_ibu: pickNonEmpty(normalizeExcelCellString(row['NIK Ibu']), existing.nik_ibu),
        pendidikan_ibu: pickNonEmpty(
          normalizeExcelCellString(row['Pendidikan Ibu']),
          existing.pendidikan_ibu
        ),
        pekerjaan_ibu: pickNonEmpty(
          normalizeExcelCellString(row['Pekerjaan Ibu']),
          existing.pekerjaan_ibu
        ),
        penghasilan_ibu: pickNonEmpty(
          normalizeExcelCellString(row['Penghasilan Ibu']),
          existing.penghasilan_ibu
        ),
        no_wa_ibu: pickNonEmpty(normalizeExcelCellString(row['No HP/WA Ibu']), existing.no_wa_ibu),
        nama_wali: namaWaliExcel || existing.nama_wali || mergedAyah,
        nik_wali: nikWaliExcel || existing.nik_wali || mergedNikAyah,
        pendidikan_wali: pendWaliExcel || existing.pendidikan_wali || mergedPendAyah,
        pekerjaan_wali: pekWaliExcel || existing.pekerjaan_wali || mergedPekAyah,
        no_wa_wali: waWaliExcel || existing.no_wa_wali || mergedWaAyah,
        alamat_jalan: pickNonEmpty(normalizeExcelCellString(row['Alamat Jalan']), existing.alamat_jalan),
        rt: pickNonEmpty(normalizeExcelCellString(row['RT']), existing.rt),
        rw: pickNonEmpty(normalizeExcelCellString(row['RW']), existing.rw),
        desa: pickNonEmpty(normalizeExcelCellString(row['Desa/Kelurahan']), existing.desa),
        kecamatan: pickNonEmpty(normalizeExcelCellString(row['Kecamatan']), existing.kecamatan),
        kabupaten: pickNonEmpty(normalizeExcelCellString(row['Kabupaten']), existing.kabupaten),
        provinsi: pickNonEmpty(normalizeExcelCellString(row['Provinsi']), existing.provinsi),
        kode_pos: pickNonEmpty(normalizeExcelCellString(row['Kode Pos']), existing.kode_pos),
        status: existing.status || 'aktif',
      });

      updates.push({
        id: existing.id,
        nis: String(existing.nis || excelNis),
        payload,
      });
    } else {
      const tglMasuk = rawTglMasuk || params.todayStr || '2027-07-01';
      const assignedNis = excelNis || generateNextNisForYear(tglMasuk, workingNisList, 1);
      workingNisList.push({ nis: assignedNis });

      const kamar = rawKamar || 'A1';
      const tarif = resolveTarifFromRow({
        tipeSppRaw,
        kamarVal: kamar,
        skema: params.skemaPendaftaran,
      });

      const payload = sanitizeSantriDbPayload({
        nis: assignedNis,
        tgl_masuk: tglMasuk,
        nama_lengkap: namaLengkap,
        kamar,
        tarif_syahriyah: tarif,
        nisn: normalizeExcelCellString(row['NISN']) || null,
        nik: normalizeExcelCellString(row['NIK']) || null,
        no_kk: normalizeExcelCellString(row['No KK']) || null,
        tempat_lahir: normalizeExcelCellString(row['Tempat Lahir']) || null,
        tgl_lahir: rawTglLahir || null,
        jk: jk || 'L',
        hobi: normalizeExcelCellString(row['Hobi']) || null,
        cita_cita: normalizeExcelCellString(row['Cita-Cita']) || null,
        status_ayah: normalizeExcelCellString(row['Status Ayah']) || 'Hidup',
        nama_ayah: namaAyah || null,
        nik_ayah: nikAyah || null,
        pendidikan_ayah: pendidikanAyah || null,
        pekerjaan_ayah: pekerjaanAyah || null,
        penghasilan_ayah: normalizeExcelCellString(row['Penghasilan Ayah']) || null,
        no_wa_ayah: waAyah || null,
        status_ibu: normalizeExcelCellString(row['Status Ibu']) || 'Hidup',
        nama_ibu: normalizeExcelCellString(row['Nama Ibu']) || null,
        nik_ibu: normalizeExcelCellString(row['NIK Ibu']) || null,
        pendidikan_ibu: normalizeExcelCellString(row['Pendidikan Ibu']) || null,
        pekerjaan_ibu: normalizeExcelCellString(row['Pekerjaan Ibu']) || null,
        penghasilan_ibu: normalizeExcelCellString(row['Penghasilan Ibu']) || null,
        no_wa_ibu: normalizeExcelCellString(row['No HP/WA Ibu']) || null,
        nama_wali: namaWaliExcel || namaAyah || null,
        nik_wali: nikWaliExcel || nikAyah || null,
        pendidikan_wali: pendWaliExcel || pendidikanAyah || null,
        pekerjaan_wali: pekWaliExcel || pekerjaanAyah || null,
        no_wa_wali: waWaliExcel || waAyah || null,
        alamat_jalan: normalizeExcelCellString(row['Alamat Jalan']) || null,
        rt: normalizeExcelCellString(row['RT']) || null,
        rw: normalizeExcelCellString(row['RW']) || null,
        desa: normalizeExcelCellString(row['Desa/Kelurahan']) || null,
        kecamatan: normalizeExcelCellString(row['Kecamatan']) || null,
        kabupaten: normalizeExcelCellString(row['Kabupaten']) || null,
        provinsi: normalizeExcelCellString(row['Provinsi']) || null,
        kode_pos: normalizeExcelCellString(row['Kode Pos']) || null,
        status: 'aktif',
        unit_asrama: 'Induk Putra',
      });

      inserts.push({
        nis: assignedNis,
        payload,
      });
    }
  }

  return {
    updates,
    inserts,
    total: updates.length + inserts.length,
  };
}
