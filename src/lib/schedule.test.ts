import { describe, expect, it } from 'vitest';
import type { CalendarConfig, Task } from '../types';
import { computeSchedule, criticalChain } from './schedule';
import { toISO } from './date';

const cal: CalendarConfig = { weekendDays: [0, 6], holidays: [] };
const calHoliday: CalendarConfig = {
  weekendDays: [0, 6],
  holidays: [{ id: 'h1', date: '2026-10-06', name: 'Libur' }],
};

function task(partial: Partial<Task> & { id: string; name: string }): Task {
  return {
    description: '',
    parentId: null,
    startDate: '2026-10-05',
    duration: 3,
    priority: 'medium',
    color: '#3b82f6',
    dependencies: [],
    assignees: [],
    ...partial,
  };
}

describe('computeSchedule — forward pass', () => {
  it('tugas tanpa predecessor memakai tanggal mulai manual', () => {
    const a = task({ id: 'a', name: 'A', startDate: '2026-10-05', duration: 3 });
    const s = computeSchedule([a], cal, '2026-10-05');
    const it = s.items.get('a')!;
    expect(toISO(it.start)).toBe('2026-10-05');
    expect(toISO(it.end)).toBe('2026-10-07'); // Senin–Rabu
    expect(s.workingDuration).toBe(3);
  });

  it('FS: successor mulai pada hari kerja setelah predecessor selesai', () => {
    const a = task({ id: 'a', name: 'A', startDate: '2026-10-05', duration: 3 });
    const b = task({
      id: 'b', name: 'B', duration: 2,
      dependencies: [{ taskId: 'a', type: 'FS', delay: 0 }],
    });
    const s = computeSchedule([a, b], cal, '2026-10-05');
    expect(toISO(s.items.get('b')!.start)).toBe('2026-10-08'); // Kamis
    expect(toISO(s.items.get('b')!.end)).toBe('2026-10-09');
  });

  it('FS + jeda (delay) menambah hari kerja', () => {
    const a = task({ id: 'a', name: 'A', startDate: '2026-10-05', duration: 3 }); // selesai 7 Okt
    const b = task({
      id: 'b', name: 'B', duration: 1,
      dependencies: [{ taskId: 'a', type: 'FS', delay: 2 }],
    });
    const s = computeSchedule([a, b], cal, '2026-10-05');
    // 7 Okt (Rabu) + 1 + 2 hari kerja = Kamis(8), Jumat(9), Senin(12)
    expect(toISO(s.items.get('b')!.start)).toBe('2026-10-12');
  });

  it('SS: successor mulai bersamaan + jeda', () => {
    const a = task({ id: 'a', name: 'A', startDate: '2026-10-05', duration: 5 });
    const b = task({
      id: 'b', name: 'B', duration: 2,
      dependencies: [{ taskId: 'a', type: 'SS', delay: 2 }],
    });
    const s = computeSchedule([a, b], cal, '2026-10-05');
    expect(toISO(s.items.get('b')!.start)).toBe('2026-10-07'); // Senin + 2 hr kerja
  });

  it('multiple predecessor diambil yang paling lambat', () => {
    const a = task({ id: 'a', name: 'A', startDate: '2026-10-05', duration: 1 }); // 5 Okt
    const b = task({ id: 'b', name: 'B', startDate: '2026-10-05', duration: 5 }); // 9 Okt
    const c = task({
      id: 'c', name: 'C', duration: 1,
      dependencies: [
        { taskId: 'a', type: 'FS', delay: 0 },
        { taskId: 'b', type: 'FS', delay: 0 },
      ],
    });
    const s = computeSchedule([a, b, c], cal, '2026-10-05');
    expect(toISO(s.items.get('c')!.start)).toBe('2026-10-12'); // setelah B (9 Okt)
  });

  it('tanggal akhir pekan & hari libur dilewati', () => {
    const a = task({ id: 'a', name: 'A', startDate: '2026-10-02', duration: 2 }); // Jumat + Senin
    const s = computeSchedule([a], cal, '2026-10-02');
    expect(toISO(s.items.get('a')!.end)).toBe('2026-10-05');

    const a2 = task({ id: 'a2', name: 'A2', startDate: '2026-10-05', duration: 2 });
    const s2 = computeSchedule([a2], calHoliday, '2026-10-05');
    // Senin 5, Selasa 6 libur → selesai Rabu 7
    expect(toISO(s2.items.get('a2')!.end)).toBe('2026-10-07');
  });

  it('sub-tugas tidak boleh mulai sebelum tanggal induk', () => {
    const parent = task({ id: 'p', name: 'Parent', startDate: '2026-10-07', duration: 5 });
    const child = task({ id: 'c', name: 'Child', startDate: '2026-10-05', duration: 2, parentId: 'p' });
    const s = computeSchedule([parent, child], cal, '2026-10-05');
    expect(toISO(s.items.get('c')!.start)).toBe('2026-10-07'); // di-dorong ke induk
  });

  it('rollup: tanggal & durasi induk mengikuti gabungan sub-tugas', () => {
    const parent = task({ id: 'p', name: 'Parent', startDate: '2026-10-05', duration: 1 });
    const c1 = task({ id: 'c1', name: 'C1', startDate: '2026-10-05', duration: 2, parentId: 'p' });
    const c2 = task({
      id: 'c2', name: 'C2', duration: 2, parentId: 'p',
      dependencies: [{ taskId: 'c1', type: 'FS', delay: 0 }],
    });
    const s = computeSchedule([parent, c1, c2], cal, '2026-10-05');
    const p = s.items.get('p')!;
    expect(toISO(p.start)).toBe('2026-10-05');
    expect(toISO(p.end)).toBe('2026-10-08');
    expect(p.duration).toBe(4); // Senin..Kamis
    expect(p.hasChildren).toBe(true);
  });
});

describe('computeSchedule — backward pass & jalur kritis', () => {
  it('rantai FS penuh: semua tugas kritis (slack 0)', () => {
    const a = task({ id: 'a', name: 'A', startDate: '2026-10-05', duration: 3 });
    const b = task({
      id: 'b', name: 'B', duration: 2,
      dependencies: [{ taskId: 'a', type: 'FS', delay: 0 }],
    });
    const c = task({
      id: 'c', name: 'C', duration: 1,
      dependencies: [{ taskId: 'b', type: 'FS', delay: 0 }],
    });
    const s = computeSchedule([a, b, c], cal, '2026-10-05');
    expect(s.items.get('a')!.slack).toBe(0);
    expect(s.items.get('b')!.slack).toBe(0);
    expect(s.items.get('c')!.slack).toBe(0);
    expect(s.criticalIds.sort()).toEqual(['a', 'b', 'c']);
    expect(s.hasCycle).toBe(false);
  });

  it('tugas yang jauh dari akhir proyek punya slack > 0', () => {
    const short = task({ id: 's', name: 'Pendek', startDate: '2026-10-05', duration: 1 });
    const long = task({ id: 'l', name: 'Panjang', startDate: '2026-10-05', duration: 5 });
    const s = computeSchedule([short, long], cal, '2026-10-05');
    expect(s.items.get('l')!.slack).toBe(0);
    expect(s.items.get('l')!.critical).toBe(true);
    expect(s.items.get('s')!.slack).toBe(4); // 4 hari kerja kelonggaran
    expect(s.items.get('s')!.critical).toBe(false);
  });

  it('LF backward pass untuk FS dengan jeda', () => {
    const a = task({ id: 'a', name: 'A', startDate: '2026-10-05', duration: 3 });
    const b = task({
      id: 'b', name: 'B', duration: 1,
      dependencies: [{ taskId: 'a', type: 'FS', delay: 2 }],
    });
    const s = computeSchedule([a, b], cal, '2026-10-05');
    const it = s.items.get('a')!;
    // LS(B) = 12 Okt → LF(A) = mundur 1+2 hari kerja = 7 Okt
    expect(toISO(it.lf)).toBe('2026-10-07');
    expect(toISO(it.ls)).toBe('2026-10-05');
    expect(it.critical).toBe(true);
  });

  it('tugas induk kritis bila salah satu sub-tugas kritis', () => {
    const parent = task({ id: 'p', name: 'Parent', startDate: '2026-10-05', duration: 5 });
    const c1 = task({ id: 'c1', name: 'C1', startDate: '2026-10-05', duration: 5, parentId: 'p' });
    const c2 = task({
      id: 'c2', name: 'C2', startDate: '2026-10-05', duration: 2, parentId: 'p',
    });
    const s = computeSchedule([parent, c1, c2], cal, '2026-10-05');
    expect(s.items.get('c1')!.critical).toBe(true);
    expect(s.items.get('c2')!.critical).toBe(false);
    expect(s.items.get('p')!.critical).toBe(true);
  });

  it('mendeteksi siklus dependensi', () => {
    const a = task({ id: 'a', name: 'A', dependencies: [{ taskId: 'b', type: 'FS', delay: 0 }] });
    const b = task({ id: 'b', name: 'B', dependencies: [{ taskId: 'a', type: 'FS', delay: 0 }] });
    const s = computeSchedule([a, b], cal, '2026-10-05');
    expect(s.hasCycle).toBe(true);
    expect(s.items.size).toBe(2); // tetap dihitung agar UI tidak rusak
  });

  it('criticalChain mengurutkan berdasarkan early start', () => {
    const a = task({ id: 'a', name: 'A', startDate: '2026-10-05', duration: 3 });
    const b = task({
      id: 'b', name: 'B', duration: 2,
      dependencies: [{ taskId: 'a', type: 'FS', delay: 0 }],
    });
    const s = computeSchedule([a, b], cal, '2026-10-05');
    expect(criticalChain(s).map((x) => x.id)).toEqual(['a', 'b']);
  });

  it('proyek kosong tidak melempar error', () => {
    const s = computeSchedule([], cal, '2026-10-05');
    expect(s.items.size).toBe(0);
    expect(s.workingDuration).toBeGreaterThan(0);
  });
});
