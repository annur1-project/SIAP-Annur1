import { supabase } from '@/lib/supabase';
import {
  addDaysIso,
  isMissingRelationError,
  readLocalArray,
  writeLocalArray,
} from '@/lib/dapur';
import {
  PENGATURAN_EXTENDED_SQL,
  POSKESTREN_TABLES_SQL,
} from '@/lib/pengaturan';
import { DAPUR_TABLES_SQL } from '@/lib/dapur';
import { SARPRAS_SETUP_SQL } from '@/lib/sarpras';
import { PSB_TABLE_SQL } from '@/lib/psb';

export type PasaranJawa = 'Legi' | 'Pahing' | 'Pon' | 'Wage' | 'Kliwon';
export type KategoriAgendaKalender = 'pondok' | 'rapat' | 'libur' | 'akademik' | 'lainnya';

export interface HijriDateResult {
  day: number;
  month: number; // 1..12
  year: number;
  monthName: string;
  arabicDay: string;
  formatted: string;
}

export interface HariBesarItem {
  isoDate: string;
  nama: string;
  kategori: 'islam' | 'pesantren' | 'nasional';
  keterangan: string;
}

export interface PuasaSunnahInfo {
  canFast: boolean;
  isHaram: boolean;
  isWajib: boolean;
  labels: string[];
  haramReason?: string;
}

export interface CalendarCell {
  isoDate: string;
  day: number;
  month: number;
  year: number;
  inCurrentMonth: boolean;
  pasaran: PasaranJawa;
  hijri: HijriDateResult;
  hariBesar: HariBesarItem[];
  puasa: PuasaSunnahInfo;
  isFriday: boolean;
}

export interface JadwalSholatBululawang {
  isoDate: string;
  imsak: string;
  subuh: string;
  terbit: string;
  dhuha: string;
  dzuhur: string;
  ashar: string;
  maghrib: string;
  isya: string;
}

export interface NextPrayerCountdown {
  nextName: string;
  nextTime: string;
  remainingSeconds: number;
  remainingFormatted: string;
}

export interface KalenderAgendaItem {
  id: string;
  tanggal: string; // YYYY-MM-DD
  judul: string;
  kategori: KategoriAgendaKalender;
  waktu: string;
  lokasi: string;
  catatan: string;
  created_at?: string;
}

export const PASARAN_CYCLE: PasaranJawa[] = ['Legi', 'Pahing', 'Pon', 'Wage', 'Kliwon'];

export const HARI_INDO = ['Ahad', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'] as const;

export const BULAN_INDO = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
] as const;

export const HIJRI_MONTHS_ID = [
  'Muharram',
  'Shafar',
  'Rabiul Awal',
  'Rabiul Akhir',
  'Jumadal Ula',
  'Jumadal Akhirah',
  'Rajab',
  'Syaban',
  'Ramadhan',
  'Syawal',
  'Dzulqadah',
  'Dzulhijjah',
] as const;

export const LS_KALENDER_AGENDA_KEY = 'siap_kalender_agenda_v1';

// Koordinat Kecamatan Bululawang, Kab. Malang, Jawa Timur
export const BULULAWANG_LAT = -8.0833;
export const BULULAWANG_LON = 112.6333;
export const BULULAWANG_TZ = 7; // WIB (UTC+7)

export function createKalenderId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `kal-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function parseIsoParts(isoDate: string): { year: number; month: number; day: number } {
  const clean = (isoDate || '').slice(0, 10);
  const parts = clean.split('-').map((n) => parseInt(n, 10));
  if (parts.length === 3 && !parts.some((n) => Number.isNaN(n))) {
    return { year: parts[0], month: parts[1], day: parts[2] };
  }
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() };
}

export function formatIsoParts(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function getWibTodayIso(referenceDate = new Date()): string {
  const shifted = new Date(referenceDate.getTime() + 7 * 3600 * 1000);
  return shifted.toISOString().slice(0, 10);
}

export function toArabicIndic(num: number): string {
  const digits = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
  return String(Math.max(0, Math.trunc(num)))
    .split('')
    .map((ch) => digits[Number(ch)] ?? ch)
    .join('');
}

export function getDayOfWeekIndex(isoDate: string): number {
  const { year, month, day } = parseIsoParts(isoDate);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay(); // 0=Ahad..6=Sabtu
}

/**
 * 1970-01-01 UTC = Kamis Wage (index 3 in ['Legi', 'Pahing', 'Pon', 'Wage', 'Kliwon']).
 * Verified: 2026-11-18 is dayNum 20775 -> (20775 + 3) % 5 = 3 => 'Wage' (Rabu Wage).
 */
export function getPasaranJawa(isoDate: string): PasaranJawa {
  const { year, month, day } = parseIsoParts(isoDate);
  const dayNum = Math.floor(Date.UTC(year, month - 1, day) / 86_400_000);
  const idx = (((dayNum + 3) % 5) + 5) % 5;
  return PASARAN_CYCLE[idx];
}

export function formatHariPasaranIndo(isoDate: string): string {
  const { year, month, day } = parseIsoParts(isoDate);
  const dow = getDayOfWeekIndex(isoDate);
  const pasaran = getPasaranJawa(isoDate);
  const bulan = BULAN_INDO[month - 1] || '';
  return `${HARI_INDO[dow]} ${pasaran}, ${day} ${bulan} ${year}`;
}

/**
 * Kuwaiti / tabular Hijri arithmetic fallback when ICU islamic-umalqura is unavailable.
 */
function tabularHijriFromUtcDate(utcMs: number): { day: number; month: number; year: number } {
  const jd = Math.floor(utcMs / 86_400_000) + 2440588;
  let l = jd - 1948440 + 10632;
  const n = Math.floor((l - 1) / 10631);
  l = l - 10631 * n + 354;
  const j =
    Math.floor((10985 - l) / 5316) * Math.floor((50 * l) / 17719) +
    Math.floor(l / 5670) * Math.floor((43 * l) / 15238);
  l =
    l -
    Math.floor((30 - j) / 15) * Math.floor((17719 * j) / 50) -
    Math.floor(j / 16) * Math.floor((15238 * j) / 43) +
    29;
  const month = Math.floor((24 * l) / 709);
  const day = l - Math.floor((709 * month) / 24);
  const year = 30 * n + j - 30;
  return { day, month, year };
}

export function getHijriDate(isoDate: string, koreksiHari = 0): HijriDateResult {
  const offset = Math.max(-2, Math.min(2, Math.trunc(Number(koreksiHari) || 0)));
  const shiftedIso = offset === 0 ? isoDate : addDaysIso(isoDate, offset);
  const { year, month, day } = parseIsoParts(shiftedIso);
  const utcDate = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));

  let hDay = 1;
  let hMonth = 1;
  let hYear = 1448;
  let usedIntl = false;

  try {
    const fmt = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura', {
      day: 'numeric',
      month: 'numeric',
      year: 'numeric',
      timeZone: 'UTC',
    });
    const parts = fmt.formatToParts(utcDate);
    const dPart = parts.find((p) => p.type === 'day')?.value;
    const mPart = parts.find((p) => p.type === 'month')?.value;
    const yPart = parts.find((p) => p.type === 'year')?.value;
    const parsedDay = dPart ? parseInt(dPart, 10) : NaN;
    const parsedMonth = mPart ? parseInt(mPart, 10) : NaN;
    const parsedYear = yPart ? parseInt(yPart, 10) : NaN;
    if (!Number.isNaN(parsedDay) && !Number.isNaN(parsedMonth) && !Number.isNaN(parsedYear)) {
      hDay = parsedDay;
      hMonth = parsedMonth;
      hYear = parsedYear;
      usedIntl = true;
    }
  } catch {
    // fallback below
  }

  if (!usedIntl) {
    const tab = tabularHijriFromUtcDate(Date.UTC(year, month - 1, day));
    hDay = tab.day;
    hMonth = tab.month;
    hYear = tab.year;
  }

  const safeMonth = Math.max(1, Math.min(12, hMonth));
  const monthName = HIJRI_MONTHS_ID[safeMonth - 1] || HIJRI_MONTHS_ID[0];
  return {
    day: hDay,
    month: safeMonth,
    year: hYear,
    monthName,
    arabicDay: toArabicIndic(hDay),
    formatted: `${hDay} ${monthName} ${hYear}`,
  };
}

export function getHariBesarOnDate(isoDate: string, hijri: HijriDateResult): HariBesarItem[] {
  const items: HariBesarItem[] = [];
  const { month, day } = parseIsoParts(isoDate);

  // Hari Besar Islam (Kalender Hijriyah)
  if (hijri.month === 1 && hijri.day === 1) {
    items.push({ isoDate, nama: 'Tahun Baru Islam 1 Muharram', kategori: 'islam', keterangan: 'Awal Tahun Hijriyah' });
  }
  if (hijri.month === 1 && hijri.day === 10) {
    items.push({ isoDate, nama: 'Hari Asyura (10 Muharram)', kategori: 'islam', keterangan: 'Disunnahkan puasa Asyura & santunan anak yatim' });
  }
  if (hijri.month === 3 && hijri.day === 12) {
    items.push({ isoDate, nama: 'Maulid Nabi Muhammad SAW', kategori: 'islam', keterangan: '12 Rabiul Awal — Pembacaan Maulid Diba/Barzanji' });
  }
  if (hijri.month === 7 && hijri.day === 27) {
    items.push({ isoDate, nama: 'Isra Miraj Nabi Muhammad SAW', kategori: 'islam', keterangan: '27 Rajab — Pengajian & peringatan pondok' });
  }
  if (hijri.month === 8 && hijri.day === 15) {
    items.push({ isoDate, nama: 'Nisfu Syaban', kategori: 'islam', keterangan: '15 Syaban — Pembacaan Yasin 3x & doa bersama' });
  }
  if (hijri.month === 9 && hijri.day === 1) {
    items.push({ isoDate, nama: 'Awal Bulan Ramadhan', kategori: 'islam', keterangan: '1 Ramadhan — Awal puasa wajib' });
  }
  if (hijri.month === 9 && hijri.day === 17) {
    items.push({ isoDate, nama: 'Nuzulul Quran', kategori: 'islam', keterangan: '17 Ramadhan — Peringatan turunnya Al-Quran' });
  }
  if (hijri.month === 10 && hijri.day === 1) {
    items.push({ isoDate, nama: 'Hari Raya Idul Fitri', kategori: 'islam', keterangan: '1 Syawal — Haram berpuasa' });
  }
  if (hijri.month === 12 && hijri.day === 9) {
    items.push({ isoDate, nama: 'Hari Arafah (Wukuf)', kategori: 'islam', keterangan: '9 Dzulhijjah — Disunnahkan puasa Arafah' });
  }
  if (hijri.month === 12 && hijri.day === 10) {
    items.push({ isoDate, nama: 'Hari Raya Idul Adha', kategori: 'islam', keterangan: '10 Dzulhijjah — Penyembelihan hewan qurban' });
  }
  if (hijri.month === 12 && (hijri.day === 11 || hijri.day === 12 || hijri.day === 13)) {
    items.push({ isoDate, nama: 'Hari Tasyrik', kategori: 'islam', keterangan: `${hijri.day} Dzulhijjah — Dilarang berpuasa` });
  }

  // Hari Nasional & Pesantren (Kalender Masehi)
  if (month === 1 && day === 1) {
    items.push({ isoDate, nama: 'Tahun Baru Masehi', kategori: 'nasional', keterangan: '1 Januari' });
  }
  if (month === 1 && day === 31) {
    items.push({ isoDate, nama: 'Harlah Nahdlatul Ulama (Masehi)', kategori: 'pesantren', keterangan: '31 Januari 1926' });
  }
  if (month === 5 && day === 2) {
    items.push({ isoDate, nama: 'Hari Pendidikan Nasional', kategori: 'nasional', keterangan: '2 Mei' });
  }
  if (month === 8 && day === 17) {
    items.push({ isoDate, nama: 'Hari Kemerdekaan RI', kategori: 'nasional', keterangan: '17 Agustus — Upacara bendera santri' });
  }
  if (month === 10 && day === 22) {
    items.push({ isoDate, nama: 'Hari Santri Nasional (HSN)', kategori: 'pesantren', keterangan: '22 Oktober — Apel Hari Santri & kirab' });
  }
  if (month === 11 && day === 10) {
    items.push({ isoDate, nama: 'Hari Pahlawan', kategori: 'nasional', keterangan: '10 November — Mengenang Resolusi Jihad' });
  }
  if (month === 12 && day === 22) {
    items.push({ isoDate, nama: 'Hari Ibu', kategori: 'nasional', keterangan: '22 Desember' });
  }

  return items;
}

export function getPuasaSunnahOnDate(isoDate: string, hijri: HijriDateResult): PuasaSunnahInfo {
  const dow = getDayOfWeekIndex(isoDate);

  // Hari haram berpuasa: 1 Syawal, 10 Dzulhijjah, 11-13 Dzulhijjah
  if (hijri.month === 10 && hijri.day === 1) {
    return {
      canFast: false,
      isHaram: true,
      isWajib: false,
      labels: ['Haram Berpuasa (Idul Fitri)'],
      haramReason: '1 Syawal (Hari Raya Idul Fitri)',
    };
  }
  if (hijri.month === 12 && (hijri.day === 10 || (hijri.day >= 11 && hijri.day <= 13))) {
    return {
      canFast: false,
      isHaram: true,
      isWajib: false,
      labels: [hijri.day === 10 ? 'Haram Berpuasa (Idul Adha)' : 'Haram Berpuasa (Hari Tasyrik)'],
      haramReason:
        hijri.day === 10
          ? '10 Dzulhijjah (Hari Raya Idul Adha)'
          : `${hijri.day} Dzulhijjah (Hari Tasyrik)`,
    };
  }

  if (hijri.month === 9) {
    return {
      canFast: true,
      isHaram: false,
      isWajib: true,
      labels: [`Puasa Wajib Ramadhan (Hari ke-${hijri.day})`],
    };
  }

  const labels: string[] = [];
  if (hijri.month === 12 && hijri.day === 9) {
    labels.push('Puasa Sunnah Arafah (9 Dzulhijjah)');
  }
  if (hijri.month === 1 && hijri.day === 9) {
    labels.push("Puasa Sunnah Tasu'a (9 Muharram)");
  }
  if (hijri.month === 1 && hijri.day === 10) {
    labels.push('Puasa Sunnah Asyura (10 Muharram)');
  }
  if (hijri.month === 10 && hijri.day >= 2 && hijri.day <= 7) {
    labels.push('Puasa Sunnah 6 Hari Syawal');
  }
  if (hijri.day >= 13 && hijri.day <= 15) {
    labels.push(`Puasa Ayyamul Bidh (${hijri.day} ${hijri.monthName})`);
  }
  if (dow === 1) {
    labels.push('Puasa Sunnah Senin');
  } else if (dow === 4) {
    labels.push('Puasa Sunnah Kamis');
  }

  return {
    canFast: true,
    isHaram: false,
    isWajib: false,
    labels,
  };
}

export function computeMonthCalendarGrid(
  year: number,
  month: number,
  koreksiHari = 0
): CalendarCell[] {
  const firstDow = new Date(Date.UTC(year, month - 1, 1)).getUTCDay(); // 0=Ahad
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const totalSlots = firstDow + daysInMonth > 35 ? 42 : 35;
  const firstIso = formatIsoParts(year, month, 1);

  const cells: CalendarCell[] = [];
  for (let i = 0; i < totalSlots; i++) {
    const offsetDays = i - firstDow;
    const isoDate = addDaysIso(firstIso, offsetDays);
    const parts = parseIsoParts(isoDate);
    const hijri = getHijriDate(isoDate, koreksiHari);
    const pasaran = getPasaranJawa(isoDate);
    const hariBesar = getHariBesarOnDate(isoDate, hijri);
    const puasa = getPuasaSunnahOnDate(isoDate, hijri);
    const dow = getDayOfWeekIndex(isoDate);

    cells.push({
      isoDate,
      day: parts.day,
      month: parts.month,
      year: parts.year,
      inCurrentMonth: parts.month === month && parts.year === year,
      pasaran,
      hijri,
      hariBesar,
      puasa,
      isFriday: dow === 5,
    });
  }
  return cells;
}

export function getMonthHijriSpanLabel(cells: CalendarCell[]): string {
  const current = cells.filter((c) => c.inCurrentMonth);
  if (current.length === 0) return '';
  const first = current[0].hijri;
  const last = current[current.length - 1].hijri;
  if (first.month === last.month && first.year === last.year) {
    return `${first.monthName} ${first.year}`;
  }
  if (first.year === last.year) {
    return `${first.monthName} - ${last.monthName} ${first.year}`;
  }
  return `${first.monthName} ${first.year} - ${last.monthName} ${last.year}`;
}

export function getHariBesarInMonth(
  year: number,
  month: number,
  koreksiHari = 0
): HariBesarItem[] {
  const cells = computeMonthCalendarGrid(year, month, koreksiHari);
  const out: HariBesarItem[] = [];
  for (const c of cells) {
    if (!c.inCurrentMonth) continue;
    for (const hb of c.hariBesar) {
      out.push(hb);
    }
  }
  return out;
}

function degToRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

function radToDeg(rad: number): number {
  return (rad * 180) / Math.PI;
}

function fixAngle(a: number): number {
  return a - 360 * Math.floor(a / 360);
}

function formatMinutesToHm(minutesRaw: number): string {
  const totalMin = ((Math.round(minutesRaw) % 1440) + 1440) % 1440;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * Perhitungan Jadwal Sholat Bululawang, Malang (Metode Kemenag / NU: Subuh 20°, Isya 18°, +2m ihtiyat).
 */
export function computeJadwalSholatBululawang(isoDate: string): JadwalSholatBululawang {
  const { year, month, day } = parseIsoParts(isoDate);
  // Julian date pada 12:00 UT
  const a = Math.floor((14 - month) / 12);
  const y = year + 4800 - a;
  const m = month + 12 * a - 3;
  const jd =
    day +
    Math.floor((153 * m + 2) / 5) +
    365 * y +
    Math.floor(y / 4) -
    Math.floor(y / 100) +
    Math.floor(y / 400) -
    32045 -
    BULULAWANG_TZ / 24;

  const d = jd - 2451545.0;
  const g = fixAngle(357.529 + 0.98560028 * d);
  const q = fixAngle(280.459 + 0.98564736 * d);
  const L = fixAngle(q + 1.915 * Math.sin(degToRad(g)) + 0.02 * Math.sin(degToRad(2 * g)));
  const e = 23.439 - 0.00000036 * d;

  const decl = radToDeg(Math.asin(Math.sin(degToRad(e)) * Math.sin(degToRad(L))));
  let ra = radToDeg(Math.atan2(Math.cos(degToRad(e)) * Math.sin(degToRad(L)), Math.cos(degToRad(L)))) / 15;
  ra = ((ra % 24) + 24) % 24;
  const eqTime = q / 15 - (ra > 12 ? ra - 24 : ra);
  const eqNorm = Math.abs(eqTime) > 2 ? (eqTime > 0 ? eqTime - 24 : eqTime + 24) : eqTime;

  const midDayHours = 12 + BULULAWANG_TZ - BULULAWANG_LON / 15 - eqNorm;

  const hourAngleForAltitude = (altDeg: number): number => {
    const num =
      Math.sin(degToRad(altDeg)) -
      Math.sin(degToRad(BULULAWANG_LAT)) * Math.sin(degToRad(decl));
    const den = Math.cos(degToRad(BULULAWANG_LAT)) * Math.cos(degToRad(decl));
    const cosH = Math.max(-1, Math.min(1, num / den));
    return radToDeg(Math.acos(cosH)) / 15;
  };

  const fajrHa = hourAngleForAltitude(-20);
  const sunriseHa = hourAngleForAltitude(-0.833);
  const sunsetHa = hourAngleForAltitude(-0.833);
  const ishaHa = hourAngleForAltitude(-18);

  // Asr Shafi'i: cot(alt) = 1 + tan(|lat - decl|)
  const asrTargetAlt = radToDeg(Math.atan(1 / (1 + Math.tan(degToRad(Math.abs(BULULAWANG_LAT - decl))))));
  const asrHa = hourAngleForAltitude(asrTargetAlt);

  const subuhMin = (midDayHours - fajrHa) * 60 + 2;
  const imsakMin = subuhMin - 10;
  const terbitMin = (midDayHours - sunriseHa) * 60;
  const dhuhaMin = terbitMin + 24;
  const dzuhurMin = midDayHours * 60 + 2;
  const asharMin = (midDayHours + asrHa) * 60 + 2;
  const maghribMin = (midDayHours + sunsetHa) * 60 + 2;
  const isyaMin = (midDayHours + ishaHa) * 60 + 2;

  return {
    isoDate,
    imsak: formatMinutesToHm(imsakMin),
    subuh: formatMinutesToHm(subuhMin),
    terbit: formatMinutesToHm(terbitMin),
    dhuha: formatMinutesToHm(dhuhaMin),
    dzuhur: formatMinutesToHm(dzuhurMin),
    ashar: formatMinutesToHm(asharMin),
    maghrib: formatMinutesToHm(maghribMin),
    isya: formatMinutesToHm(isyaMin),
  };
}

function hmToSeconds(hm: string): number {
  const [hStr, mStr] = hm.split(':');
  return (parseInt(hStr || '0', 10) * 60 + parseInt(mStr || '0', 10)) * 60;
}

export function getNextPrayerCountdown(
  nowDate: Date,
  jadwal: JadwalSholatBululawang
): NextPrayerCountdown {
  // Konversi ke WIB (UTC+7) secara deterministik
  const wibDate = new Date(nowDate.getTime() + 7 * 3600 * 1000);
  const nowSec =
    wibDate.getUTCHours() * 3600 + wibDate.getUTCMinutes() * 60 + wibDate.getUTCSeconds();

  const slots: Array<{ name: string; time: string }> = [
    { name: 'Subuh', time: jadwal.subuh },
    { name: 'Dzuhur', time: jadwal.dzuhur },
    { name: 'Ashar', time: jadwal.ashar },
    { name: 'Maghrib', time: jadwal.maghrib },
    { name: 'Isya', time: jadwal.isya },
  ];

  let next = slots.find((s) => hmToSeconds(s.time) > nowSec);
  let remainingSeconds = 0;

  if (next) {
    remainingSeconds = hmToSeconds(next.time) - nowSec;
  } else {
    next = slots[0];
    remainingSeconds = 86400 - nowSec + hmToSeconds(next.time);
  }

  const hh = Math.floor(remainingSeconds / 3600);
  const mm = Math.floor((remainingSeconds % 3600) / 60);
  const ss = remainingSeconds % 60;
  const remainingFormatted = `- ${String(hh).padStart(2, '0')} : ${String(mm).padStart(2, '0')} : ${String(ss).padStart(2, '0')}`;

  return {
    nextName: next.name,
    nextTime: next.time,
    remainingSeconds,
    remainingFormatted,
  };
}

export async function fetchKalenderAgenda(): Promise<KalenderAgendaItem[]> {
  const local = readLocalArray<KalenderAgendaItem>(LS_KALENDER_AGENDA_KEY);
  try {
    const { data, error } = await supabase
      .from('kalender_agenda')
      .select('*')
      .order('tanggal', { ascending: true });
    if (!error && Array.isArray(data)) {
      const rows = data as KalenderAgendaItem[];
      writeLocalArray(LS_KALENDER_AGENDA_KEY, rows);
      return rows;
    }
    if (error && !isMissingRelationError(error)) {
      // fall through to local
    }
  } catch {
    // fallback to local
  }
  return local;
}

export async function saveKalenderAgenda(
  item: KalenderAgendaItem,
  isEdit: boolean
): Promise<KalenderAgendaItem> {
  const current = readLocalArray<KalenderAgendaItem>(LS_KALENDER_AGENDA_KEY);
  const next = isEdit
    ? current.map((r) => (r.id === item.id ? item : r))
    : [item, ...current.filter((r) => r.id !== item.id)];
  writeLocalArray(LS_KALENDER_AGENDA_KEY, next);

  try {
    if (isEdit) {
      await supabase
        .from('kalender_agenda')
        .update({
          tanggal: item.tanggal,
          judul: item.judul,
          kategori: item.kategori,
          waktu: item.waktu,
          lokasi: item.lokasi,
          catatan: item.catatan,
        })
        .eq('id', item.id);
    } else {
      await supabase.from('kalender_agenda').upsert([item], { onConflict: 'id' });
    }
  } catch {
    // local backup saved
  }
  return item;
}

export async function deleteKalenderAgenda(id: string): Promise<void> {
  const current = readLocalArray<KalenderAgendaItem>(LS_KALENDER_AGENDA_KEY);
  writeLocalArray(
    LS_KALENDER_AGENDA_KEY,
    current.filter((r) => r.id !== id)
  );
  try {
    await supabase.from('kalender_agenda').delete().eq('id', id);
  } catch {
    // local backup updated
  }
}

export const KALENDER_TABLES_SQL = `CREATE TABLE IF NOT EXISTS kalender_agenda (
  id text PRIMARY KEY,
  tanggal date NOT NULL,
  judul text NOT NULL,
  kategori text NOT NULL DEFAULT 'pondok',
  waktu text DEFAULT '',
  lokasi text DEFAULT '',
  catatan text DEFAULT '',
  created_at timestamptz DEFAULT now()
);`;

export const KEAMANAN_UNIFIED_SQL = `CREATE TABLE IF NOT EXISTS keamanan_master_pelanggaran (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  nama_pelanggaran text NOT NULL,
  tingkat text NOT NULL DEFAULT 'ringan',
  poin integer NOT NULL DEFAULT 5,
  takzir_default text DEFAULT '',
  aktif boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS keamanan_pelanggaran (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  santri_id uuid NOT NULL,
  master_id text DEFAULT null,
  nama_pelanggaran text NOT NULL,
  tingkat text NOT NULL DEFAULT 'ringan',
  poin integer NOT NULL DEFAULT 5,
  tanggal date NOT NULL,
  kronologi text DEFAULT '',
  takzir text DEFAULT '',
  status_takzir text NOT NULL DEFAULT 'belum_selesai',
  tgl_selesai_takzir date DEFAULT null,
  petugas text DEFAULT 'Sie Keamanan Pondok',
  wa_terkirim boolean NOT NULL DEFAULT false,
  izin_id text DEFAULT null,
  no_surat text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS keamanan_sita_barang (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  santri_id uuid NOT NULL,
  pelanggaran_id text DEFAULT null,
  nama_barang text NOT NULL,
  kategori text NOT NULL DEFAULT 'HP / Smartphone',
  jumlah integer NOT NULL DEFAULT 1,
  tgl_sita date NOT NULL,
  lokasi_simpan text DEFAULT 'Lemari Keamanan Pondok',
  petugas_penyita text DEFAULT 'Sie Keamanan Pondok',
  status text NOT NULL DEFAULT 'disita',
  tgl_kembali date DEFAULT null,
  penerima_kembali text DEFAULT null,
  catatan text DEFAULT '',
  wa_terkirim boolean NOT NULL DEFAULT false,
  no_tanda_terima text DEFAULT '',
  created_at timestamptz DEFAULT now()
);`;

export const KEGIATAN_LAUNDRY_SQL = `CREATE TABLE IF NOT EXISTS kegiatan_format_template (
  id text PRIMARY KEY,
  nama_format text NOT NULL,
  kategori_default text NOT NULL DEFAULT 'rutin',
  deskripsi text DEFAULT '',
  slots jsonb NOT NULL DEFAULT '[]'::jsonb,
  bawaan boolean NOT NULL DEFAULT false,
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS kegiatan_agenda (
  id text PRIMARY KEY,
  kode_kegiatan text NOT NULL,
  judul text NOT NULL,
  kategori text NOT NULL DEFAULT 'rutin',
  format_id text,
  format_nama text DEFAULT '',
  tanggal date NOT NULL,
  jam_mulai text DEFAULT '19:30',
  jam_selesai text DEFAULT '',
  lokasi text DEFAULT '',
  penanggung_jawab text DEFAULT '',
  status text NOT NULL DEFAULT 'terjadwal',
  pengisi_list jsonb NOT NULL DEFAULT '[]'::jsonb,
  rundown_list jsonb NOT NULL DEFAULT '[]'::jsonb,
  panitia_list jsonb NOT NULL DEFAULT '[]'::jsonb,
  notulensi text DEFAULT '',
  dokumentasi_urls jsonb NOT NULL DEFAULT '[]'::jsonb,
  catatan text DEFAULT '',
  updated_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS laundry_jadwal_kamar (
  id text PRIMARY KEY,
  hari_key text NOT NULL UNIQUE,
  hari_label text NOT NULL,
  kamar_list jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS laundry_catatan (
  id text PRIMARY KEY,
  tanggal date NOT NULL,
  hari_key text NOT NULL,
  kamar text NOT NULL,
  jumlah_potong integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'masuk',
  tipe_setoran text NOT NULL DEFAULT 'terjadwal',
  jam_masuk text DEFAULT '',
  jam_selesai text DEFAULT '',
  catatan text DEFAULT '',
  updated_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

INSERT INTO storage.buckets (id, name, public)
VALUES ('kegiatan-foto', 'kegiatan-foto', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES ('ttd-stempel', 'ttd-stempel', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES ('foto-santri', 'foto-santri', true)
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'kegiatan_foto_all'
  ) THEN
    CREATE POLICY kegiatan_foto_all ON storage.objects FOR ALL USING (bucket_id = 'kegiatan-foto') WITH CHECK (bucket_id = 'kegiatan-foto');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'ttd_stempel_all'
  ) THEN
    CREATE POLICY ttd_stempel_all ON storage.objects FOR ALL USING (bucket_id = 'ttd-stempel') WITH CHECK (bucket_id = 'ttd-stempel');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'foto_santri_all'
  ) THEN
    CREATE POLICY foto_santri_all ON storage.objects FOR ALL USING (bucket_id = 'foto-santri') WITH CHECK (bucket_id = 'foto-santri');
  END IF;
END $$;`;

export const UNIFIED_SUPABASE_SQL = `-- ============================================================
-- UNIFIED SUPABASE SQL — e-PONDOK AN-NUR 1 BULULAWANG
-- Aman dijalankan berulang (Idempotent: IF NOT EXISTS / IF EXISTS)
-- ============================================================

-- 1. PENGATURAN APLIKASI (Kop Surat JPG 17.46x4.13 cm, Rekening, Aturan, Tema)
${PENGATURAN_EXTENDED_SQL}

-- 2. KOLOM TAMBAHAN TABEL SANTRI (Pendaftaran VIP/Reguler & Keringanan)
ALTER TABLE santri
  ADD COLUMN IF NOT EXISTS paket_pendaftaran text DEFAULT 'reguler',
  ADD COLUMN IF NOT EXISTS nominal_pendaftaran integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS catatan_keringanan text DEFAULT '',
  ADD COLUMN IF NOT EXISTS ktl_nominal integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ktl_catatan text DEFAULT '',
  ADD COLUMN IF NOT EXISTS tgl_masuk date,
  ADD COLUMN IF NOT EXISTS unit_asrama text DEFAULT 'Induk Putra';

-- 3. ABSENSI SHOLAT JAMAAH (5 WAKTU WAJIB: Subuh, Dzuhur, Ashar, Maghrib, Isya)
ALTER TABLE public.absen_jamaah
  DROP CONSTRAINT IF EXISTS absen_jamaah_waktu_sholat_check;

ALTER TABLE public.absen_jamaah
  ADD CONSTRAINT absen_jamaah_waktu_sholat_check
  CHECK (waktu_sholat IN ('subuh', 'dzuhur', 'ashar', 'maghrib', 'isya'));

-- 4. DIVISI KESEHATAN / POSKESTREN
${POSKESTREN_TABLES_SQL}

-- 5. DIVISI KEAMANAN & KETERTIBAN
${KEAMANAN_UNIFIED_SQL}

-- 6. DIVISI DAPUR & KONSUMSI
${DAPUR_TABLES_SQL}

-- 7. DIVISI SARPRAS & ASET (termasuk bucket sarpras-foto)
${SARPRAS_SETUP_SQL}

-- 8. DIVISI KEGIATAN, SIE LAUNDRY & STORAGE BUCKETS
${KEGIATAN_LAUNDRY_SQL}

-- 9. MODUL KALENDER MASEHI, HIJRIYAH & AGENDA PONDOK
${KALENDER_TABLES_SQL}

-- 10. PENDAFTARAN SANTRI BARU (PSB) 1 PINTU
${PSB_TABLE_SQL}
`;
