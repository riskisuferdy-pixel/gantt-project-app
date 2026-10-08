import { describe, expect, it } from 'vitest';
import type { CalendarConfig } from '../types';
import {
  addDays,
  calendarDays,
  countInclusive,
  countRange,
  durationEnd,
  isWorkingDay,
  nextWorkingDay,
  parseISO,
  shiftWorkingDays,
  toISO,
} from './date';

const cal: CalendarConfig = { weekendDays: [0, 6], holidays: [] };
const calWithHoliday: CalendarConfig = {
  weekendDays: [0, 6],
  holidays: [{ id: 'h1', date: '2026-10-06', name: 'Libur' }],
};

// 2026-10-01 = Kamis, 2026-10-02 = Jumat, 2026-10-05 = Senin
describe('date utils', () => {
  it('parseISO/toISO roundtrip', () => {
    expect(toISO(parseISO('2026-10-05'))).toBe('2026-10-05');
    expect(parseISO('2026-10-05').getDay()).toBe(1); // Senin
  });

  it('addDays melewati batas bulan', () => {
    expect(toISO(addDays(parseISO('2026-10-30'), 5))).toBe('2026-11-04');
    expect(toISO(addDays(parseISO('2026-10-01'), -1))).toBe('2026-09-30');
  });

  it('isWorkingDay mengetahui akhir pekan & hari libur', () => {
    expect(isWorkingDay(parseISO('2026-10-05'), cal)).toBe(true); // Senin
    expect(isWorkingDay(parseISO('2026-10-03'), cal)).toBe(false); // Sabtu
    expect(isWorkingDay(parseISO('2026-10-04'), cal)).toBe(false); // Minggu
    expect(isWorkingDay(parseISO('2026-10-06'), cal)).toBe(true);
    expect(isWorkingDay(parseISO('2026-10-06'), calWithHoliday)).toBe(false); // libur
  });

  it('nextWorkingDay melompati akhir pekan', () => {
    expect(toISO(nextWorkingDay(parseISO('2026-10-03'), cal))).toBe('2026-10-05');
    expect(toISO(nextWorkingDay(parseISO('2026-10-05'), cal))).toBe('2026-10-05'); // sudah kerja
    expect(toISO(nextWorkingDay(parseISO('2026-10-06'), calWithHoliday))).toBe('2026-10-07'); // Selasa libur
  });

  it('shiftWorkingDays maju/mundur dalam hari kerja', () => {
    // Senin +3 hari kerja = Kamis
    expect(toISO(shiftWorkingDays(parseISO('2026-10-05'), 3, cal))).toBe('2026-10-08');
    // Jumat +1 hari kerja = Senin (lewati weekend)
    expect(toISO(shiftWorkingDays(parseISO('2026-10-02'), 1, cal))).toBe('2026-10-05');
    // Senin -1 hari kerja = Jumat sebelumnya
    expect(toISO(shiftWorkingDays(parseISO('2026-10-05'), -1, cal))).toBe('2026-10-02');
    // mempertimbangkan hari libur
    expect(toISO(shiftWorkingDays(parseISO('2026-10-05'), 1, calWithHoliday))).toBe('2026-10-07');
    expect(toISO(shiftWorkingDays(parseISO('2026-10-05'), 0, cal))).toBe('2026-10-05');
  });

  it('countRange menghitung hari kerja [a, b)', () => {
    // Jumat 2 → Selasa 6: hanya Jumat & Senin (Selasa di luar rentang)
    expect(countRange(parseISO('2026-10-02'), parseISO('2026-10-06'), cal)).toBe(2);
    expect(countRange(parseISO('2026-10-05'), parseISO('2026-10-05'), cal)).toBe(0);
    expect(countRange(parseISO('2026-10-06'), parseISO('2026-10-05'), cal)).toBe(-1);
    expect(countRange(parseISO('2026-10-05'), parseISO('2026-10-07'), calWithHoliday)).toBe(1); // Selasa libur
  });

  it('countInclusive menghitung hari kerja [a, b]', () => {
    expect(countInclusive(parseISO('2026-10-05'), parseISO('2026-10-09'), cal)).toBe(5); // seminggu penuh
    expect(countInclusive(parseISO('2026-10-02'), parseISO('2026-10-05'), cal)).toBe(2); // Jumat + Senin
    expect(countInclusive(parseISO('2026-10-06'), parseISO('2026-10-05'), cal)).toBe(0);
  });

  it('durationEnd menghitung selesai = mulai + (durasi-1) hari kerja', () => {
    expect(toISO(durationEnd(parseISO('2026-10-05'), 3, cal))).toBe('2026-10-07');
    expect(toISO(durationEnd(parseISO('2026-10-02'), 2, cal))).toBe('2026-10-05'); // lintas weekend
    expect(toISO(durationEnd(parseISO('2026-10-04'), 1, cal))).toBe('2026-10-05'); // snap ke hari kerja
    expect(toISO(durationEnd(parseISO('2026-10-05'), 2, calWithHoliday))).toBe('2026-10-07'); // Selasa libur
  });

  it('calendarDays menghitung selisih hari kalender', () => {
    expect(calendarDays(parseISO('2026-10-05'), parseISO('2026-10-09'))).toBe(4);
    expect(calendarDays(parseISO('2026-10-09'), parseISO('2026-10-05'))).toBe(-4);
  });
});
