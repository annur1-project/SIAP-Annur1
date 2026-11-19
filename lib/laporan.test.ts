import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildAllDivisionReports,
  buildKeuanganReport,
  buildLaundryReport,
  computeDelta,
  computePeriodWindow,
  getNearestFridayIso,
  type AllLaporanRawData,
} from './laporan';

test('computePeriodWindow mingguan menghitung 7 hari dan pekan pembanding sebelumnya', () => {
  const w = computePeriodWindow('mingguan', {
    anchorDate: '2026-11-20', // Jum'at
    todayStr: '2026-11-17',
  });
  assert.equal(w.startDate, '2026-11-14'); // Sabtu
  assert.equal(w.endDate, '2026-11-20'); // Jum'at
  assert.equal(w.prevStartDate, '2026-11-07');
  assert.equal(w.prevEndDate, '2026-11-13');
  assert.equal(w.dayCount, 7);
});

test('getNearestFridayIso menemukan hari Jumat rapat pekan berjalan', () => {
  assert.equal(getNearestFridayIso('2026-11-17'), '2026-11-20'); // Selasa -> Jumat 20 Nov
  assert.equal(getNearestFridayIso('2026-11-20'), '2026-11-20'); // Jumat -> Jumat itu sendiri
  assert.equal(getNearestFridayIso('2026-11-21'), '2026-11-27'); // Sabtu -> Jumat depan
});

test('computePeriodWindow bulanan termasuk pergantian tahun Januari ke Desember', () => {
  const w = computePeriodWindow('bulanan', { monthStr: '2026-01', todayStr: '2026-01-15' });
  assert.equal(w.startDate, '2026-01-01');
  assert.equal(w.endDate, '2026-01-31');
  assert.equal(w.prevStartDate, '2025-12-01');
  assert.equal(w.prevEndDate, '2025-12-31');
});

test('computePeriodWindow rentang menukar urutan tanggal terbalik & hitung span simetris', () => {
  const w = computePeriodWindow('rentang', {
    startDate: '2026-10-15',
    endDate: '2026-10-11',
  });
  assert.equal(w.startDate, '2026-10-11');
  assert.equal(w.endDate, '2026-10-15');
  assert.equal(w.dayCount, 5);
  assert.equal(w.prevStartDate, '2026-10-06');
  assert.equal(w.prevEndDate, '2026-10-10');
});

test('computeDelta menghitung selisih, persentase, dan arah perubahan', () => {
  const up = computeDelta(120, 100);
  assert.equal(up.diff, 20);
  assert.equal(up.pct, 20);
  assert.equal(up.direction, 'up');

  const down = computeDelta(75, 100);
  assert.equal(down.diff, -25);
  assert.equal(down.pct, -25);
  assert.equal(down.direction, 'down');

  const fromZero = computeDelta(5, 0);
  assert.equal(fromZero.diff, 5);
  assert.equal(fromZero.pct, null);
  assert.equal(fromZero.direction, 'up');
});

test('buildKeuanganReport mengelompokkan tunai/transfer mingguan & tunggakan 1/2/>2 bulan', () => {
  const window = computePeriodWindow('bulanan', {
    monthStr: '2026-10',
    todayStr: '2026-10-31',
  });
  const laporan = buildKeuanganReport(
    [
      {
        id: 't1',
        santri_id: 's1',
        dompet: 'operasional',
        tipe: 'masuk',
        kategori: 'Syahriyah',
        nominal: 425000,
        metode_pembayaran: 'tunai',
        tgl_transaksi: '2026-10-02',
      },
      {
        id: 't2',
        santri_id: 's2',
        dompet: 'operasional',
        tipe: 'keluar',
        kategori: 'Dapur',
        nominal: 125000,
        metode_pembayaran: 'tunai',
        tgl_transaksi: '2026-10-09',
      },
      {
        id: 't3',
        santri_id: 's1',
        dompet: 'operasional',
        tipe: 'masuk',
        kategori: 'Transfer Syahriyah',
        nominal: 475000,
        metode_pembayaran: 'transfer',
        tgl_transaksi: '2026-10-16',
        no_kuitansi: 'KWT-1',
      },
    ],
    [
      // s1 bayar Jul, Agu, Sep -> nunggak Okt saja (1 bulan)
      { id: 'p1', santri_id: 's1', tahun_ajaran: '2026/2027', item_kode: 'syahriyah', periode_bulan: '2026-07', nominal: 425000 },
      { id: 'p2', santri_id: 's1', tahun_ajaran: '2026/2027', item_kode: 'syahriyah', periode_bulan: '2026-08', nominal: 425000 },
      { id: 'p3', santri_id: 's1', tahun_ajaran: '2026/2027', item_kode: 'syahriyah', periode_bulan: '2026-09', nominal: 425000 },
      // s2 bayar Jul, Agu -> nunggak Sep & Okt (2 bulan)
      { id: 'p4', santri_id: 's2', tahun_ajaran: '2026/2027', item_kode: 'syahriyah', periode_bulan: '2026-07', nominal: 425000 },
      { id: 'p5', santri_id: 's2', tahun_ajaran: '2026/2027', item_kode: 'syahriyah', periode_bulan: '2026-08', nominal: 425000 },
    ],
    [],
    [],
    [
      { id: 's1', nama_lengkap: 'Ahmad', kamar: 'A1', status: 'aktif', tarif_syahriyah: 425000 },
      { id: 's2', nama_lengkap: 'Budi', kamar: 'A2', status: 'aktif', tarif_syahriyah: 425000 },
      // s3 belum bayar Jul-Okt -> 4 bulan (>2 bulan)
      { id: 's3', nama_lengkap: 'Choirul', kamar: 'A3', status: 'aktif', tarif_syahriyah: 425000 },
    ],
    [{ id: 'pg1', nama_lengkap: 'Ust. Fajar', nominal_bisyaroh: 500000, status: 'aktif' }],
    { jatuh_tempo_tanggal: 10, saldo_awal_operasional: 1000000 },
    window,
    '2026-10-31'
  );

  assert.equal(laporan.masukTotal.current, 900000);
  assert.equal(laporan.keluarTotal.current, 125000);
  assert.equal(laporan.weeklyBuckets.length, 4);
  assert.equal(laporan.weeklyBuckets[0].tunaiSaldoAkhir, 1425000);
  assert.equal(laporan.weeklyBuckets[1].tunaiSaldoAkhir, 1300000);
  assert.equal(laporan.weeklyBuckets[2].transferRows.length, 1);
  assert.equal(laporan.tunggakan1Bulan.length, 1);
  assert.equal(laporan.tunggakan2Bulan.length, 1);
  assert.equal(laporan.tunggakanLebih2Bulan.length, 1);
  assert.equal(laporan.totalBisyaroh, 500000);
});

test('buildAllDivisionReports & buildLaundryReport menghasilkan perbandingan periode ini vs lalu', () => {
  const window = computePeriodWindow('mingguan', {
    anchorDate: '2026-11-20',
    todayStr: '2026-11-17',
  });

  const raw: AllLaporanRawData = {
    pengaturan: { nama_pesantren: 'PP An-Nur 1', jatuh_tempo_tanggal: 10 },
    santri: [
      { id: 's1', nama_lengkap: 'Santri Satu', kamar: 'A1', status: 'aktif' },
      { id: 's2', nama_lengkap: 'Santri Dua', kamar: 'NDALEM', status: 'ndalem' },
    ],
    pengurus: [{ id: 'pg1', nama_lengkap: 'Ust. Sayid', status: 'aktif', nominal_bisyaroh: 350000 }],
    transaksi: [],
    pembayaranDetails: [],
    masterPembayaran: [],
    tarifRiwayat: [],
    izinPulang: [
      {
        id: 'iz1',
        santri_id: 's1',
        jenis_izin: 'menginap',
        tgl_pulang: '2026-11-15',
        tgl_rencana_kembali: '2026-11-16',
        tgl_aktual_kembali: '2026-11-16',
        alasan: 'Acara keluarga',
        status: 'kembali',
      },
    ],
    pelanggaran: [],
    sitaBarang: [],
    absenJamaah: [
      { id: 'ab1', santri_id: 's1', tgl: '2026-11-16', waktu_sholat: 'subuh', status: 'hadir' },
      { id: 'ab2', santri_id: 's1', tgl: '2026-11-16', waktu_sholat: 'dzuhur', status: 'alpha' },
    ],
    santriSakit: [],
    obatList: [],
    penyuluhan: [],
    dapurSesi: [],
    dapurAbsen: [],
    dapurKas: [],
    sarprasInventaris: [],
    sarprasLaporan: [],
    kegiatanAgenda: [],
    laundryCatatan: [
      {
        id: 'l1',
        tanggal: '2026-11-16',
        hari_key: 'senin',
        kamar: 'A1',
        jumlah_potong: 42,
        status: 'selesai',
        tipe_setoran: 'terjadwal',
        jam_masuk: '08:00',
        jam_selesai: '16:00',
        catatan: '',
        updated_at: '2026-11-16T08:00:00Z',
      },
      {
        id: 'l2',
        tanggal: '2026-11-09',
        hari_key: 'senin',
        kamar: 'A1',
        jumlah_potong: 30,
        status: 'selesai',
        tipe_setoran: 'terjadwal',
        jam_masuk: '08:00',
        jam_selesai: '16:00',
        catatan: '',
        updated_at: '2026-11-09T08:00:00Z',
      },
    ],
    laundryJadwal: [],
  };

  const bundle = buildAllDivisionReports(raw, window, '2026-11-17');
  assert.equal(bundle.perizinan.totalIzin.current, 1);
  assert.equal(bundle.perizinan.totalIzin.previous, 0);
  assert.equal(bundle.jamaah.persenHadir.current, 50);
  assert.equal(bundle.laundry.totalPotong.current, 42);
  assert.equal(bundle.laundry.totalPotong.previous, 30);
  assert.equal(bundle.laundry.totalPotong.diff, 12);
  assert.equal(bundle.charts.trendPoints.length, 6);

  const lnd = buildLaundryReport(raw.laundryCatatan, window);
  assert.equal(lnd.dailyRows.length, 1);
});
