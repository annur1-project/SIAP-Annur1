import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeJadwalSholatBululawang,
  computeMonthCalendarGrid,
  formatHariPasaranIndo,
  getHariBesarInMonth,
  getHijriDate,
  getNextPrayerCountdown,
  getPasaranJawa,
  getPuasaSunnahOnDate,
  toArabicIndic,
  UNIFIED_SUPABASE_SQL,
} from './kalender';

test('getPasaranJawa & formatHariPasaranIndo cocok dengan kalender Jawa (2026-11-18 = Rabu Wage)', () => {
  assert.equal(getPasaranJawa('2026-11-18'), 'Wage');
  assert.equal(getPasaranJawa('2026-11-19'), 'Kliwon');
  assert.equal(getPasaranJawa('2026-11-20'), 'Legi');
  assert.equal(getPasaranJawa('2026-11-21'), 'Pahing');
  assert.equal(getPasaranJawa('2026-11-22'), 'Pon');
  assert.equal(formatHariPasaranIndo('2026-11-18'), 'Rabu Wage, 18 November 2026');
});

test('getHijriDate menghitung tanggal Hijriyah dan mendukung koreksi -2..+2 hari', () => {
  const h = getHijriDate('2026-11-18', 0);
  assert.equal(h.day, 8);
  assert.equal(h.month, 6);
  assert.equal(h.year, 1448);
  assert.equal(h.monthName, 'Jumadal Akhirah');
  assert.equal(h.arabicDay, '٨');
  assert.equal(h.formatted, '8 Jumadal Akhirah 1448');

  const hPlus1 = getHijriDate('2026-11-18', 1);
  assert.equal(hPlus1.day, 9);
  const hMinus1 = getHijriDate('2026-11-18', -1);
  assert.equal(hMinus1.day, 7);
});

test('toArabicIndic mengubah angka ke digit Arab-Indic', () => {
  assert.equal(toArabicIndic(1), '١');
  assert.equal(toArabicIndic(18), '١٨');
  assert.equal(toArabicIndic(30), '٣٠');
});

test('computeMonthCalendarGrid menghasilkan grid November 2026 dimulai Ahad 1 Nov', () => {
  const grid = computeMonthCalendarGrid(2026, 11, 0);
  assert.equal(grid.length, 35);
  assert.equal(grid[0].isoDate, '2026-11-01');
  assert.equal(grid[0].inCurrentMonth, true);
  assert.equal(grid[0].pasaran, 'Pahing');
  assert.equal(grid[29].isoDate, '2026-11-30');
  assert.equal(grid[30].inCurrentMonth, false); // 1 Desember

  const rabu18 = grid.find((c) => c.isoDate === '2026-11-18');
  assert.ok(rabu18);
  assert.equal(rabu18.pasaran, 'Wage');
  assert.equal(rabu18.hijri.day, 8);
});

test('getPuasaSunnahOnDate mendeteksi Senin-Kamis, Ayyamul Bidh & Hari Haram Puasa', () => {
  // 2026-11-23 adalah Senin 13 Jumadal Akhirah 1448 -> Senin + Ayyamul Bidh
  const hijri23 = getHijriDate('2026-11-23', 0);
  assert.equal(hijri23.day, 13);
  const puasa23 = getPuasaSunnahOnDate('2026-11-23', hijri23);
  assert.equal(puasa23.canFast, true);
  assert.equal(puasa23.isHaram, false);
  assert.ok(puasa23.labels.some((l) => l.includes('Ayyamul Bidh')));
  assert.ok(puasa23.labels.some((l) => l.includes('Senin')));

  // Hari Raya Idul Fitri (1 Syawal) -> haram puasa
  const haramSyawal = getPuasaSunnahOnDate('2026-03-20', {
    day: 1,
    month: 10,
    year: 1447,
    monthName: 'Syawal',
    arabicDay: '١',
    formatted: '1 Syawal 1447',
  });
  assert.equal(haramSyawal.canFast, false);
  assert.equal(haramSyawal.isHaram, true);
});

test('getHariBesarInMonth menemukan Hari Santri di Oktober dan Hari Pahlawan di November', () => {
  const okt = getHariBesarInMonth(2026, 10, 0);
  assert.ok(okt.some((h) => h.isoDate === '2026-10-22' && h.nama.includes('Hari Santri')));
  const nov = getHariBesarInMonth(2026, 11, 0);
  assert.ok(nov.some((h) => h.isoDate === '2026-11-10' && h.nama.includes('Pahlawan')));
});

test('computeJadwalSholatBululawang & getNextPrayerCountdown menghasilkan waktu sholat valid untuk Bululawang Malang', () => {
  const jadwal = computeJadwalSholatBululawang('2026-11-18');
  assert.match(jadwal.subuh, /^03:\d{2}$/);
  assert.match(jadwal.dzuhur, /^11:\d{2}$/);
  assert.match(jadwal.ashar, /^14:\d{2}$/);
  assert.match(jadwal.maghrib, /^17:\d{2}$/);
  assert.match(jadwal.isya, /^18:\d{2}$/);

  // 15:40 WIB (08:40 UTC) -> berikutnya Maghrib
  const now1540 = new Date('2026-11-18T08:40:00Z');
  const cd = getNextPrayerCountdown(now1540, jadwal);
  assert.equal(cd.nextName, 'Maghrib');
  assert.equal(cd.nextTime, jadwal.maghrib);
  assert.ok(cd.remainingSeconds > 0);
});

test('UNIFIED_SUPABASE_SQL memuat seluruh tabel dan kolom baru termasuk kop_surat_url & kalender_agenda', () => {
  const requiredTokens = [
    'kop_surat_url',
    'poskestren_obat',
    'poskestren_penyuluhan',
    'keamanan_master_pelanggaran',
    'keamanan_pelanggaran',
    'keamanan_sita_barang',
    'dapur_sesi_masak',
    'sarpras_inventaris',
    'sarpras_laporan',
    'kegiatan_agenda',
    'laundry_catatan',
    'kalender_agenda',
    'absen_jamaah_waktu_sholat_check',
  ];
  for (const tok of requiredTokens) {
    assert.ok(UNIFIED_SUPABASE_SQL.includes(tok), `SQL harus memuat ${tok}`);
  }
});
