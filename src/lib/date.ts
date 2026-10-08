import type { CalendarConfig } from '../types';

export const DAY_MS = 86400000;

export const HARI = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
export const BULAN = [
  'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun',
  'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des',
];
export const BULAN_PANJANG = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];
export const HARI_PANJANG = [
  'Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu',
];

const pad = (n: number) => String(n).padStart(2, '0');

/** Parse 'YYYY-MM-DD' menjadi Date lokal (bukan UTC). */
export function parseISO(s: string): Date {
  const parts = (s || '').split('-').map(Number);
  const y = parts[0] || new Date().getFullYear();
  const m = parts[1] || 1;
  const d = parts[2] || 1;
  return new Date(y, m - 1, d);
}

export function toISO(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function todayISO(): string {
  return toISO(new Date());
}

export function addDays(d: Date, n: number): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() + n);
  return x;
}

export function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate();
}

export function isWeekend(d: Date, cal: CalendarConfig): boolean {
  return cal.weekendDays.includes(d.getDay());
}

export function holidayOf(d: Date, cal: CalendarConfig) {
  const iso = toISO(d);
  return cal.holidays.find((h) => h.date === iso);
}

export function isHoliday(d: Date, cal: CalendarConfig): boolean {
  return cal.holidays.some((h) => h.date === toISO(d));
}

export function isWorkingDay(d: Date, cal: CalendarConfig): boolean {
  return !isWeekend(d, cal) && !isHoliday(d, cal);
}

/** Geser ke hari kerja berikutnya (bila sudah hari kerja, dikembalikan apa adanya). */
export function nextWorkingDay(d: Date, cal: CalendarConfig): Date {
  let x = new Date(d);
  let guard = 0;
  while (!isWorkingDay(x, cal) && guard++ < 3660) x = addDays(x, 1);
  return x;
}

/** Geser ke hari kerja sebelumnya. */
export function prevWorkingDay(d: Date, cal: CalendarConfig): Date {
  let x = new Date(d);
  let guard = 0;
  while (!isWorkingDay(x, cal) && guard++ < 3660) x = addDays(x, -1);
  return x;
}

/**
 * Geser tanggal sebanyak n hari kerja (tanggal asal tidak dihitung).
 * n > 0 maju, n < 0 mundur, n = 0 dikembalikan apa adanya.
 */
export function shiftWorkingDays(d: Date, n: number, cal: CalendarConfig): Date {
  if (n === 0) return new Date(d);
  const step = n > 0 ? 1 : -1;
  let remaining = Math.abs(Math.trunc(n));
  let x = new Date(d);
  let guard = 0;
  while (remaining > 0 && guard++ < 36600) {
    x = addDays(x, step);
    if (isWorkingDay(x, cal)) remaining--;
  }
  return x;
}

/** Jumlah hari kerja pada rentang [a, b). Menghasilkan negatif bila b < a. */
export function countRange(a: Date, b: Date, cal: CalendarConfig): number {
  const cmp = a.getTime() - b.getTime();
  if (cmp === 0) return 0;
  if (cmp > 0) return -countRange(b, a, cal);
  let count = 0;
  let d = new Date(a);
  while (d.getTime() < b.getTime()) {
    if (isWorkingDay(d, cal)) count++;
    d = addDays(d, 1);
  }
  return count;
}

/** Jumlah hari kerja pada rentang inklusif [a, b]. */
export function countInclusive(a: Date, b: Date, cal: CalendarConfig): number {
  if (b.getTime() < a.getTime()) return 0;
  return countRange(a, addDays(b, 1), cal);
}

/**
 * Tanggal selesai dari sebuah tugas: mulai (di-snap ke hari kerja)
 * lalu maju durasi-1 hari kerja.
 */
export function durationEnd(start: Date, duration: number, cal: CalendarConfig): Date {
  const s = nextWorkingDay(start, cal);
  return shiftWorkingDays(s, Math.max(1, Math.trunc(duration) || 1) - 1, cal);
}

/** Selisih hari kalender (dibulatkan). */
export function calendarDays(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / DAY_MS);
}

export function formatDateID(d: Date): string {
  return `${d.getDate()} ${BULAN[d.getMonth()]} ${d.getFullYear()}`;
}

export function formatShortID(d: Date): string {
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

export function formatDM(d: Date): string {
  return `${pad(d.getDate())} ${BULAN[d.getMonth()]}`;
}

export function formatMonthYear(d: Date): string {
  return `${BULAN_PANJANG[d.getMonth()]} ${d.getFullYear()}`;
}

export function formatIDR(n: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(n || 0);
}

export function formatDateInput(d: Date): string {
  return toISO(d);
}
