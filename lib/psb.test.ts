import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculatePsbBilling,
  computePromoDisplayRemaining,
  countVerifiedPsbQuota,
  generateNextNoRegistrasi,
  matchPsbRecordsForGuardian,
  normalizeWaNumber,
  PSB_PROFIL_PONDOK,
  PSB_STATUS_META,
  splitPelunasanForWallets,
  toWaMeDigits,
  type PsbPendaftaranRecord,
} from './psb';

function makeMockPsb(overrides: Partial<PsbPendaftaranRecord> = {}): PsbPendaftaranRecord {
  return {
    id: 'psb-1',
    no_registrasi: 'PSB-26-001',
    tahun_psb: 2026,
    status: 'menunggu_verifikasi',
    paket: 'reguler',
    kamar_rencana: '',
    rencana_tgl_masuk: '2026-07-15',
    nama_lengkap: 'Muhammad Zain',
    jk: 'L',
    tempat_lahir: 'Malang',
    tgl_lahir: '2013-04-12',
    jenjang_pendidikan: 'MTs / SMP',
    nama_ayah: 'H. Ahmad',
    nama_ibu: 'Hj. Fatimah',
    nama_wali: 'H. Ahmad',
    no_wa_wali: '081234567890',
    alamat_jalan: 'Jl. Diponegoro',
    desa: 'Bululawang',
    kecamatan: 'Bululawang',
    kabupaten: 'KAB. MALANG',
    provinsi: 'JAWA TIMUR',
    kode_pos: '65171',
    dapat_promo_pangkal: true,
    total_biaya_awal: 850000,
    nominal_keringanan: 0,
    catatan_keringanan: '',
    total_biaya_akhir: 850000,
    dp_nominal: 500000,
    dp_terbayar: 0,
    pelunasan_terbayar: 0,
    bukti_dp_url: '',
    metode_dp: 'transfer',
    tgl_verifikasi_dp: null,
    verifikator_dp: '',
    tgl_lunas: null,
    santri_id: null,
    nis_terbit: '',
    no_kuitansi_dp: '',
    no_kuitansi_lunas: '',
    catatan_wali: '',
    catatan_pengurus: '',
    setuju_ketentuan: true,
    created_at: '2026-11-18T08:00:00Z',
    updated_at: '2026-11-18T08:00:00Z',
    ...overrides,
  };
}

test('calculatePsbBilling memakai rincian terbaru aplikasi (Free Uang Pangkal 100 pendaftar pertama)', () => {
  const regPromo = calculatePsbBilling({
    paket: 'reguler',
    jumlahPendaftarTerhitung: 12,
    dpTerbayar: 500000,
  });
  assert.equal(regPromo.rincian.isFreeUangPangkal, true);
  assert.equal(regPromo.totalBiayaAwal, 850000);
  assert.equal(regPromo.sisaTagihan, 350000);

  const vipPromo = calculatePsbBilling({
    paket: 'vip',
    jumlahPendaftarTerhitung: 12,
    dpTerbayar: 500000,
  });
  assert.equal(vipPromo.rincian.isFreeUangPangkal, true);
  assert.equal(vipPromo.totalBiayaAwal, 2500000);
  assert.equal(vipPromo.sisaTagihan, 2000000);

  const regNormal = calculatePsbBilling({
    paket: 'reguler',
    jumlahPendaftarTerhitung: 100,
    nominalKeringanan: 500000,
    dpTerbayar: 500000,
  });
  assert.equal(regNormal.rincian.isFreeUangPangkal, false);
  assert.equal(regNormal.totalBiayaAwal, 5850000);
  assert.equal(regNormal.totalBiayaAkhir, 5350000);
  assert.equal(regNormal.sisaTagihan, 4850000);
});

test('generateNextNoRegistrasi menghasilkan kode PSB-27-XXX berurutan untuk TA 2027/2028', () => {
  assert.equal(generateNextNoRegistrasi([], 2027), 'PSB-27-001');
  assert.equal(
    generateNextNoRegistrasi(
      [{ no_registrasi: 'PSB-27-001' }, { no_registrasi: 'PSB-27-009' }],
      2027
    ),
    'PSB-27-010'
  );
});

test('normalizeWaNumber & matchPsbRecordsForGuardian mendukung 1 nomor WA untuk >1 anak', () => {
  assert.equal(normalizeWaNumber('+62 812-3456-7890'), '081234567890');
  assert.equal(toWaMeDigits('0856-0455-1562'), '6285604551562');

  const rows = [
    makeMockPsb({
      id: '1',
      no_registrasi: 'PSB-26-001',
      nama_lengkap: 'Kakak Putra',
      no_wa_wali: '081234567890',
      created_at: '2026-11-18T08:00:00Z',
    }),
    makeMockPsb({
      id: '2',
      no_registrasi: 'PSB-26-002',
      nama_lengkap: 'Adik Putra',
      no_wa_wali: '6281234567890',
      created_at: '2026-11-18T09:00:00Z',
    }),
    makeMockPsb({
      id: '3',
      no_registrasi: 'PSB-26-003',
      nama_lengkap: 'Santri Lain',
      no_wa_wali: '089999999999',
    }),
  ];

  // Tanpa nomor registrasi -> tampil semua anak untuk wali tersebut
  const multi = matchPsbRecordsForGuardian(rows, '+62 812-3456-7890', '');
  assert.equal(multi.length, 2);
  assert.equal(multi[0].nama_lengkap, 'Adik Putra');

  // Dengan nomor registrasi spesifik -> tampil 1 anak yang cocok
  const single = matchPsbRecordsForGuardian(rows, '081234567890', 'psb-26-001');
  assert.equal(single.length, 1);
  assert.equal(single[0].nama_lengkap, 'Kakak Putra');
});

test('countVerifiedPsbQuota tidak menghitung ganda santri yang sudah diresmikan', () => {
  const rows = [
    makeMockPsb({ status: 'menunggu_verifikasi' }),
    makeMockPsb({ status: 'dp_terverifikasi' }),
    makeMockPsb({ status: 'diterima_aktif' }),
  ];
  // Misalnya di tabel santri ada 5 santri (1 dari diterima_aktif, 4 lama)
  // Maka kuota terpakai = 4 lama + 2 terverifikasi = 6
  assert.equal(countVerifiedPsbQuota(rows, 5), 6);
});

test('splitPelunasanForWallets memisahkan porsi Syahriyah bulan pertama ke dompet operasional', () => {
  const regSplit = splitPelunasanForWallets({
    paket: 'reguler',
    totalSudahDibayarSebelumnya: 500000,
    bayarSekarang: 350000,
  });
  assert.equal(regSplit.keDompetOperasionalSyahriyah, 350000);
  assert.equal(regSplit.keDompetPendaftaran, 0);

  const vipSplit = splitPelunasanForWallets({
    paket: 'vip',
    totalSudahDibayarSebelumnya: 500000,
    bayarSekarang: 2000000,
  });
  assert.equal(vipSplit.keDompetOperasionalSyahriyah, 500000);
  assert.equal(vipSplit.keDompetPendaftaran, 1500000);
});

test('PSB_PROFIL_PONDOK memuat data historis dan persyaratan resmi dari PDF', () => {
  assert.equal(PSB_PROFIL_PONDOK.tahunBerdiri, 1940);
  assert.equal(PSB_PROFIL_PONDOK.rekeningOfflinePdf.nomor, '144-00-7488889-9');
  assert.ok(PSB_PROFIL_PONDOK.berkasFisikWajib.length >= 5);
});

test('computePromoDisplayRemaining menjaga tampilan kuota promosi tetap statis di slot promo selama masih tersedia', () => {
  assert.equal(
    computePromoDisplayRemaining({ psbRecordsCount: 0, kuotaTotal: 100, realQuotaUsed: 4 }),
    25
  );
  assert.equal(
    computePromoDisplayRemaining({ psbRecordsCount: 3, kuotaTotal: 100, realQuotaUsed: 7 }),
    25
  );
  assert.equal(
    computePromoDisplayRemaining({ psbRecordsCount: 10, kuotaTotal: 100, realQuotaUsed: 14, promoDisplayStart: 25 }),
    25
  );
  assert.equal(
    computePromoDisplayRemaining({ psbRecordsCount: 1, kuotaTotal: 100, realQuotaUsed: 90, promoDisplayStart: 25 }),
    10
  );
  assert.equal(
    computePromoDisplayRemaining({ psbRecordsCount: 1, kuotaTotal: 100, realQuotaUsed: 100 }),
    0
  );
});

test('PSB_STATUS_META mengikuti 3 tahapan baru tanpa wajib lunas sebelum aktif', () => {
  assert.equal(PSB_STATUS_META.menunggu_verifikasi.stepIndex, 1);
  assert.equal(PSB_STATUS_META.dp_terverifikasi.stepIndex, 2);
  assert.equal(PSB_STATUS_META.lunas_menunggu_kedatangan.stepIndex, 2);
  assert.equal(PSB_STATUS_META.diterima_aktif.stepIndex, 3);
  assert.equal(PSB_STATUS_META.ditolak.stepIndex, 0);
});
