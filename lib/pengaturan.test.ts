import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addKamarItem,
  computeTotalSaldoAwal,
  DEFAULT_KAMAR_MASTER,
  DEFAULT_MENU_CEPAT_IDS,
  DEFAULT_MOBILE_NAV_HREFS,
  DEFAULT_PENGATURAN_FORM,
  DEFAULT_TEMA_APLIKASI,
  extractExtendedPayload,
  generateNextNisForYear,
  getTahunAjaranForDate,
  getTarifAktifFromRiwayat,
  hitungRincianPendaftaran,
  isKeamananThresholdValid,
  isMissingColumnError,
  mergeAturanOperasional,
  mergeTemaAplikasi,
  moveKamarItem,
  normalizeKamarList,
  normalizeMenuCepatIds,
  normalizeMobileNavHrefs,
  removeKamarItem,
  sanitizeCorePayload,
} from './pengaturan';
import { buildSantriExcelImportPlan } from './santri-excel';

test('getTarifAktifFromRiwayat memilih tarif terakhir yang sudah berlaku pada tanggal acuan', () => {
  const riwayat = [
    { id: '1', item_id: 'a', nominal: 400000, berlaku_mulai: '2025-07-01' },
    { id: '2', item_id: 'a', nominal: 425000, berlaku_mulai: '2026-07-01' },
    { id: '3', item_id: 'a', nominal: 450000, berlaku_mulai: '2027-01-01' },
  ];

  const aktif2026 = getTarifAktifFromRiwayat(riwayat, '2026-11-17');
  assert.equal(aktif2026.nominal, 425000);
  assert.equal(aktif2026.berlaku_mulai, '2026-07-01');

  const fallbackFuture = getTarifAktifFromRiwayat(
    [{ id: '9', item_id: 'b', nominal: 350000, berlaku_mulai: '2027-07-01' }],
    '2026-11-17'
  );
  assert.equal(fallbackFuture.nominal, 350000);
  assert.deepEqual(getTarifAktifFromRiwayat([], '2026-11-17'), { nominal: 0, berlaku_mulai: '-' });
});

test('hitungRincianPendaftaran menghitung VIP (7.5jt/2.5jt) & Reguler (5.85jt/850rb) dan memecah ke 2 dompet', () => {
  // Promo (< 100 pendaftar): Gratis Uang Pangkal Rp 5.000.000
  const vipPromo = hitungRincianPendaftaran({
    paket: 'vip',
    jumlahPendaftarSaatIni: 12,
  });
  assert.equal(vipPromo.isFreeUangPangkal, true);
  assert.equal(vipPromo.sisaKuotaPromo, 88);
  assert.equal(vipPromo.totalNormal, 7500000);
  assert.equal(vipPromo.totalPromo, 2500000);
  assert.equal(vipPromo.totalBayar, 2500000);
  assert.equal(vipPromo.nominalDompetPendaftaran, 2000000); // Dipan 1.6jt + Formulir 50rb + Almari 350rb
  assert.equal(vipPromo.nominalSyahriyahBulanPertama, 500000);

  const regPromo = hitungRincianPendaftaran({
    paket: 'reguler',
    jumlahPendaftarSaatIni: 99,
  });
  assert.equal(regPromo.isFreeUangPangkal, true);
  assert.equal(regPromo.sisaKuotaPromo, 1);
  assert.equal(regPromo.totalNormal, 5850000);
  assert.equal(regPromo.totalPromo, 850000);
  assert.equal(regPromo.totalBayar, 850000);
  assert.equal(regPromo.nominalDompetPendaftaran, 400000); // Formulir 50rb + Almari 350rb
  assert.equal(regPromo.nominalSyahriyahBulanPertama, 450000);

  // Kuota 100 habis (>= 100 pendaftar): Tarif Normal penuh
  const vipNormal = hitungRincianPendaftaran({
    paket: 'vip',
    jumlahPendaftarSaatIni: 100,
  });
  assert.equal(vipNormal.isFreeUangPangkal, false);
  assert.equal(vipNormal.sisaKuotaPromo, 0);
  assert.equal(vipNormal.totalBayar, 7500000);
  assert.equal(vipNormal.nominalDompetPendaftaran, 7000000);
  assert.equal(vipNormal.nominalSyahriyahBulanPertama, 500000);

  const regNormal = hitungRincianPendaftaran({
    paket: 'reguler',
    jumlahPendaftarSaatIni: 105,
  });
  assert.equal(regNormal.isFreeUangPangkal, false);
  assert.equal(regNormal.totalBayar, 5850000);
  assert.equal(regNormal.nominalDompetPendaftaran, 5400000);
  assert.equal(regNormal.nominalSyahriyahBulanPertama, 450000);

  // Custom nominal masuk dompet pendaftaran
  const custom = hitungRincianPendaftaran({
    paket: 'reguler',
    jumlahPendaftarSaatIni: 10,
    customNominal: 500000,
  });
  assert.equal(custom.totalBayar, 500000);
  assert.equal(custom.nominalDompetPendaftaran, 500000);
  assert.equal(custom.nominalSyahriyahBulanPertama, 0);
});

test('getTahunAjaranForDate menentukan tahun ajaran Juli-Juni dengan benar', () => {
  assert.equal(getTahunAjaranForDate('2026-11-18'), '2026/2027');
  assert.equal(getTahunAjaranForDate('2027-02-15'), '2026/2027');
  assert.equal(getTahunAjaranForDate('2026-07-01'), '2026/2027');
  assert.equal(getTahunAjaranForDate('2026-06-30'), '2025/2026');
});

test('computeTotalSaldoAwal menjumlahkan keempat dompet dengan aman', () => {
  const total = computeTotalSaldoAwal({
    saldo_awal_pendaftaran: 1500000,
    saldo_awal_operasional: 4200000,
    saldo_awal_kas_pondok: 800000,
    saldo_awal_mda: 500000,
  });
  assert.equal(total, 7000000);
  assert.equal(computeTotalSaldoAwal({}), 0);
});

test('manajemen daftar kamar menjaga keunikan case-insensitive, urutan, dan penghapusan', () => {
  const norm = normalizeKamarList([' A1 ', '', 'a1', 'C2']);
  assert.deepEqual(norm, ['A1', 'C2']);
  assert.deepEqual(normalizeKamarList([]), DEFAULT_KAMAR_MASTER);

  const dup = addKamarItem(['A1', 'A2'], 'a1');
  assert.ok(dup.error);
  assert.deepEqual(dup.next, ['A1', 'A2']);

  const added = addKamarItem(['A1', 'A2'], 'B1');
  assert.equal(added.error, undefined);
  assert.deepEqual(added.next, ['A1', 'A2', 'B1']);

  assert.deepEqual(moveKamarItem(['A1', 'A2', 'B1'], 2, 'up'), ['A1', 'B1', 'A2']);
  assert.deepEqual(moveKamarItem(['A1', 'A2', 'B1'], 0, 'down'), ['A2', 'A1', 'B1']);
  assert.deepEqual(removeKamarItem(['A1', 'A2', 'B1'], 'A2'), ['A1', 'B1']);
});

test('isKeamananThresholdValid memastikan SP1 < SP2 < SP3 dan bernilai positif', () => {
  assert.equal(isKeamananThresholdValid({ poin_sp1: 25, poin_sp2: 50, poin_sp3: 100 }), true);
  assert.equal(isKeamananThresholdValid({ poin_sp1: 50, poin_sp2: 50, poin_sp3: 100 }), false);
  assert.equal(isKeamananThresholdValid({ poin_sp1: 0, poin_sp2: 50, poin_sp3: 100 }), false);
});

test('mergeTemaAplikasi & sanitizeCorePayload memvalidasi hex warna, kop_surat_url, dan memisahkan payload', () => {
  const tema = mergeTemaAplikasi({
    preset: 'navy',
    primaryColor: '#1d4ed8',
    sidebarColor: 'bukan-hex',
    mode: 'dark',
    fontFamily: 'lora',
    radius: 'rounded',
    density: 'compact',
  });
  assert.equal(tema.preset, 'navy');
  assert.equal(tema.primaryColor, '#1d4ed8');
  assert.equal(tema.sidebarColor, DEFAULT_TEMA_APLIKASI.sidebarColor);
  assert.equal(tema.mode, 'dark');
  assert.equal(tema.fontFamily, 'lora');

  const state = {
    ...DEFAULT_PENGATURAN_FORM,
    nama_pesantren: '  An-Nur 1  ',
    jatuh_tempo_tanggal: 35,
    kota_surat: '  Malang  ',
    kop_surat_url: '  https://example.com/kop.jpg  ',
    aturan_operasional: mergeAturanOperasional({
      tahun_ajaran_aktif: '2027/2028',
      pendaftaran: { uang_pangkal: 5500000 },
      jadwal: {
        hari_rapat_pengasuh: 'Jumat',
        hari_libur_laundry: 'Jumat',
        jam_masak_pagi: '05:30',
        jam_masak_sore: '16:30',
        koreksi_hijriyah: 5,
      },
    }),
  };

  const core = sanitizeCorePayload(state);
  assert.equal(core.nama_pesantren, 'An-Nur 1');
  assert.equal(core.jatuh_tempo_tanggal, 28);
  assert.equal('kota_surat' in core, false);

  const ext = extractExtendedPayload(state);
  assert.equal(ext.kota_surat, 'Malang');
  assert.equal(ext.kop_surat_url, 'https://example.com/kop.jpg');
  assert.equal(ext.aturan_operasional.pendaftaran.uang_pangkal, 5500000);
  assert.equal(ext.aturan_operasional.jadwal.koreksi_hijriyah, 2);
});

test('normalizeMenuCepatIds & normalizeMobileNavHrefs menjaga keunikan dan batas jumlah slot', () => {
  assert.deepEqual(normalizeMenuCepatIds([]), DEFAULT_MENU_CEPAT_IDS);
  assert.deepEqual(
    normalizeMenuCepatIds(['keuangan', 'keuangan', 'tidak-ada', 'kalender']),
    ['keuangan', 'kalender']
  );

  assert.deepEqual(normalizeMobileNavHrefs([]), DEFAULT_MOBILE_NAV_HREFS);
  assert.deepEqual(
    normalizeMobileNavHrefs(['/keuangan', '/absen-jamaah', '/keuangan', '/dapur']),
    ['/keuangan', '/absen-jamaah', '/dapur', '/']
  );
});

test('isMissingColumnError mengenali error kolom PostgREST / PostgreSQL', () => {
  assert.equal(isMissingColumnError({ code: 'PGRST204', message: "Could not find the 'kota_surat' column" }), true);
  assert.equal(isMissingColumnError({ code: '42703', message: 'column "aturan_operasional" does not exist' }), true);
  assert.equal(isMissingColumnError({ code: '23505', message: 'duplicate key value' }), false);
  assert.equal(isMissingColumnError(null), false);
});

test('generateNextNisForYear memisahkan urutan NIS PSB 2027 (27XXXX) dan Mutasi 2026 (26XXXX)', () => {
  const existing = [{ nis: '260004' }, { nis: '260012' }, { nis: '270001' }];
  // Santri Mutasi masuk Nov 2026 -> 260013
  assert.equal(generateNextNisForYear('2026-11-19', existing), '260013');
  // Santri PSB TA 2027/2028 -> 270002 (tidak tercampur urutan 260012)
  assert.equal(generateNextNisForYear('2027-07-01', existing), '270002');
  assert.equal(generateNextNisForYear('2027-07-01', existing, 2), '270003');
});

test('buildSantriExcelImportPlan memperbarui data EMIS berdasarkan NIS tanpa menerbitkan NIS baru', () => {
  const existing = [
    {
      id: 'santri-1',
      nis: '270001',
      tgl_masuk: '2027-07-01',
      nama_lengkap: 'Ahmad Santri PSB',
      kamar: 'Menunggu Penempatan',
      tarif_syahriyah: 500000,
      status: 'ndalem',
      paket_pendaftaran: 'vip',
      nominal_pendaftaran: 2500000,
      nama_ayah: 'H. Ahmad',
    },
  ];

  const plan = buildSantriExcelImportPlan({
    rows: [
      {
        NIS: '270001',
        'Tanggal Masuk': '2027-07-01',
        'Nama Lengkap': 'Ahmad Santri PSB',
        'Khos / Kamar': 'Al-Fachriyah 1 (VIP)',
        'Tipe SPP': 'VIP',
        NISN: 991234567,
        NIK: '3507123456780001',
        'Tempat Lahir': 'Malang',
        'Tanggal Lahir': '2013-05-01',
        'Jenis Kelamin (L/P)': 'L',
      },
      {
        NIS: '',
        'Tanggal Masuk': '2026-11-19',
        'Nama Lengkap': 'Santri Mutasi Baru',
        'Khos / Kamar': 'A2',
        'Tipe SPP': 'Reguler',
      },
    ],
    existingSantriList: existing,
    skemaPendaftaran: DEFAULT_PENGATURAN_FORM.aturan_operasional.pendaftaran,
    todayStr: '2026-11-19',
  });

  assert.equal(plan.updates.length, 1);
  assert.equal(plan.updates[0].id, 'santri-1');
  assert.equal(plan.updates[0].nis, '270001');
  assert.equal(plan.updates[0].payload.nis, '270001');
  assert.equal(plan.updates[0].payload.status, 'ndalem'); // status asli terjaga
  assert.equal(plan.updates[0].payload.kamar, 'Al-Fachriyah 1 (VIP)');
  assert.equal(plan.updates[0].payload.nisn, '991234567');

  assert.equal(plan.inserts.length, 1);
  assert.equal(plan.inserts[0].nis, '260001');
  assert.equal(plan.inserts[0].payload.nama_lengkap, 'Santri Mutasi Baru');
});


