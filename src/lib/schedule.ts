import type { CalendarConfig, Dependency, Task } from '../types';
import {
  addDays,
  calendarDays,
  countInclusive,
  countRange,
  durationEnd,
  nextWorkingDay,
  parseISO,
  shiftWorkingDays,
} from './date';

export interface Scheduled {
  id: string;
  task: Task;
  /** tanggal mulai efektif (sudah snap ke hari kerja, mempertimbangkan predecessor) */
  start: Date;
  /** tanggal selesai efektif */
  end: Date;
  /** durasi efektif dalam hari kerja (otomatis dirangkum untuk tugas induk) */
  duration: number;
  /** Early Start / Early Finish */
  es: Date;
  ef: Date;
  /** Late Start / Late Finish */
  ls: Date;
  lf: Date;
  /** float/ slack dalam hari kerja */
  slack: number;
  critical: boolean;
  depth: number;
  hasChildren: boolean;
  /** peringkat untuk diagram PERT (kolom jaringan) */
  rank: number;
}

export interface Schedule {
  items: Map<string, Scheduled>;
  /** urutan topologis (untuk iterasi aman) */
  order: string[];
  /** daftar tugas terlihat (hierarchy) — diisi sesuai kebutuhan UI */
  projectStart: Date;
  projectEnd: Date;
  /** durasi proyek dalam hari kerja */
  workingDuration: number;
  /** true bila ditemukan siklus dependensi */
  hasCycle: boolean;
  criticalIds: string[];
}

function topoSort(tasks: Task[]): { order: Task[]; cyclic: boolean } {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const indeg = new Map<string, number>();
  const adj = new Map<string, string[]>();
  for (const t of tasks) {
    indeg.set(t.id, 0);
    adj.set(t.id, []);
  }
  const addEdge = (a: string, b: string) => {
    if (a === b || !byId.has(a) || !byId.has(b)) return;
    adj.get(a)!.push(b);
    indeg.set(b, (indeg.get(b) || 0) + 1);
  };
  for (const t of tasks) {
    for (const dep of t.dependencies) addEdge(dep.taskId, t.id);
    if (t.parentId) addEdge(t.parentId, t.id);
  }

  const order: Task[] = [];
  const queue = tasks.filter((t) => indeg.get(t.id) === 0).map((t) => t.id);
  while (queue.length > 0) {
    const id = queue.shift()!;
    order.push(byId.get(id)!);
    for (const next of adj.get(id) || []) {
      const v = (indeg.get(next) || 0) - 1;
      indeg.set(next, v);
      if (v === 0) queue.push(next);
    }
  }
  const cyclic = order.length < tasks.length;
  if (cyclic) {
    const seen = new Set(order.map((t) => t.id));
    for (const t of tasks) if (!seen.has(t.id)) order.push(t);
  }
  return { order, cyclic };
}

function computeDepths(tasks: Task[]): Map<string, number> {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const depth = new Map<string, number>();
  const resolve = (t: Task, guard: Set<string>): number => {
    if (depth.has(t.id)) return depth.get(t.id)!;
    if (!t.parentId || !byId.has(t.parentId) || guard.has(t.id)) {
      depth.set(t.id, 0);
      return 0;
    }
    guard.add(t.id);
    const d = resolve(byId.get(t.parentId)!, guard) + 1;
    depth.set(t.id, d);
    return d;
  };
  for (const t of tasks) resolve(t, new Set());
  return depth;
}

/**
 * Hitung jadwal seluruh tugas:
 * 1) Forward pass (ES/EF) memakai predecessor FS/SS + lag, floor tanggal induk.
 * 2) Rollup tugas induk dari sub-tugas.
 * 3) Backward pass (LS/LF) dari akhir proyek → slack & jalur kritis.
 */
export function computeSchedule(
  tasks: Task[],
  cal: CalendarConfig,
  projectStartISO: string,
): Schedule {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const children = new Map<string, string[]>();
  for (const t of tasks) children.set(t.id, []);
  for (const t of tasks) {
    if (t.parentId && byId.has(t.parentId)) children.get(t.parentId)!.push(t.id);
  }
  const depth = computeDepths(tasks);
  const { order, cyclic } = topoSort(tasks);

  const items = new Map<string, Scheduled>();

  // ---- Forward pass ----
  for (const t of order) {
    const dur = Math.max(1, Math.trunc(t.duration) || 1);
    const validDeps = t.dependencies.filter((d) => items.has(d.taskId));
    let base: Date | null = null;
    if (validDeps.length > 0) {
      for (const dep of validDeps) {
        const p = items.get(dep.taskId)!;
        const cand = dep.type === 'SS'
          ? shiftWorkingDays(p.start, dep.delay, cal)
          : shiftWorkingDays(p.end, 1 + dep.delay, cal);
        if (!base || cand.getTime() > base.getTime()) base = cand;
      }
    } else {
      base = parseISO(t.startDate);
    }
    if (t.parentId && items.has(t.parentId)) {
      const ps = items.get(t.parentId)!.start;
      if (!base || ps.getTime() > base.getTime()) base = ps;
    }
    if (!base) base = parseISO(t.startDate);
    const es = nextWorkingDay(base, cal);
    const ef = durationEnd(es, dur, cal);
    items.set(t.id, {
      id: t.id,
      task: t,
      start: es,
      end: ef,
      duration: dur,
      es,
      ef,
      ls: es,
      lf: ef,
      slack: 0,
      critical: false,
      depth: depth.get(t.id) || 0,
      hasChildren: (children.get(t.id) || []).length > 0,
      rank: 0,
    });
  }

  // ---- Rollup tugas induk (dari sub-tugas) ----
  const summaries = tasks
    .filter((t) => (children.get(t.id) || []).length > 0)
    .sort((a, b) => (depth.get(b.id) || 0) - (depth.get(a.id) || 0));
  for (const t of summaries) {
    const kids = (children.get(t.id) || [])
      .map((id) => items.get(id))
      .filter((x): x is Scheduled => Boolean(x));
    if (kids.length === 0) continue;
    const s = new Date(Math.min(...kids.map((k) => k.start.getTime())));
    const e = new Date(Math.max(...kids.map((k) => k.end.getTime())));
    const it = items.get(t.id)!;
    it.start = nextWorkingDay(s, cal);
    it.end = e;
    it.es = it.start;
    it.ef = it.end;
    it.duration = Math.max(1, countInclusive(it.start, it.end, cal));
  }

  // ---- Rentang proyek ----
  let ps: Date | null = null;
  let pe: Date | null = null;
  items.forEach((it) => {
    if (!ps || it.start.getTime() < ps.getTime()) ps = it.start;
    if (!pe || it.end.getTime() > pe.getTime()) pe = it.end;
  });
  const projectStart: Date = ps ?? parseISO(projectStartISO);
  const projectEnd: Date = pe ?? durationEnd(projectStart, 20, cal);

  // ---- Backward pass ----
  const succMap = new Map<string, { succ: Task; dep: Dependency }[]>();
  for (const t of tasks) {
    for (const dep of t.dependencies) {
      if (!byId.has(dep.taskId)) continue;
      const list = succMap.get(dep.taskId) || [];
      list.push({ succ: t, dep });
      succMap.set(dep.taskId, list);
    }
  }

  for (let i = order.length - 1; i >= 0; i--) {
    const t = order[i];
    const it = items.get(t.id);
    if (!it) continue;
    const dur = it.duration;

    let lf: Date | null = null;
    for (const { succ, dep } of succMap.get(t.id) || []) {
      const s = items.get(succ.id);
      if (!s) continue;
      const cand = dep.type === 'SS'
        ? shiftWorkingDays(
            shiftWorkingDays(s.ls, -dep.delay, cal),
            dur - 1,
            cal,
          )
        : shiftWorkingDays(s.ls, -(1 + dep.delay), cal);
      if (!lf || cand.getTime() < lf.getTime()) lf = cand;
    }
    if (!lf) lf = projectEnd;

    let ls = shiftWorkingDays(lf, -(dur - 1), cal);
    let slack = Math.max(0, countRange(it.start, ls, cal));

    // Tugas induk: konsolidasi dari sub-tugas (LF tidak boleh lebih awal
    // daripada LF sub-tugas, slack = slack terkecil di antaranya).
    const kids = (children.get(t.id) || [])
      .map((id) => items.get(id))
      .filter((x): x is Scheduled => Boolean(x));
    if (kids.length > 0) {
      const childLs = new Date(Math.min(...kids.map((k) => k.ls.getTime())));
      const childLf = new Date(Math.max(...kids.map((k) => k.lf.getTime())));
      if (childLf.getTime() > lf.getTime()) lf = childLf;
      ls = shiftWorkingDays(lf, -(dur - 1), cal);
      if (childLs.getTime() < ls.getTime()) ls = childLs;
      slack = Math.min(slack, ...kids.map((k) => k.slack));
      slack = Math.max(0, slack);
    }

    it.ls = ls;
    it.lf = lf;
    it.slack = slack;
    it.critical = slack <= 0;
  }

  // ---- PERT rank (longest path dari akar lewat predecessor) ----
  const rankOf = (t: Task, guard: Set<string>): number => {
    const it = items.get(t.id);
    if (!it) return 0;
    if (guard.has(t.id)) return it.rank;
    guard.add(t.id);
    let r = 0;
    for (const dep of t.dependencies) {
      const p = byId.get(dep.taskId);
      if (!p) continue;
      r = Math.max(r, rankOf(p, guard) + 1);
    }
    it.rank = r;
    return r;
  };
  for (const t of tasks) rankOf(t, new Set());

  const criticalIds = [...items.values()].filter((x) => x.critical).map((x) => x.id);
  const workingDuration = countInclusive(projectStart, projectEnd, cal);

  return {
    items,
    order: order.map((t) => t.id),
    projectStart,
    projectEnd,
    workingDuration,
    hasCycle: cyclic,
    criticalIds,
  };
}

/** Urutan jalur kritis untuk ditampilkan sebagai rantai (berdasarkan ES). */
export function criticalChain(sched: Schedule): Scheduled[] {
  return [...sched.items.values()]
    .filter((x) => x.critical)
    .sort((a, b) => a.es.getTime() - b.es.getTime() || a.task.name.localeCompare(b.task.name));
}

/** Estimasi biaya tenaga kerja sebuah tugas = Σ(gaji harian anggota) × durasi. */
export function taskLaborCost(
  task: Task,
  salaryById: Map<string, number>,
): number {
  let daily = 0;
  for (const id of task.assignees) {
    const salary = salaryById.get(id);
    if (salary) daily += salary / 22;
  }
  return Math.round(daily * task.duration);
}

/** Offset hari kalender dari tanggal proyek (untuk positioning bar Gantt). */
export function dayOffset(from: Date, to: Date): number {
  return calendarDays(from, to);
}

/** Banyaknya hari kalender sebuah tugas (untuk lebar bar). */
export function taskSpanDays(item: Scheduled): number {
  return calendarDays(item.start, item.end) + 1;
}

/** Tambah n hari kalender dari tanggal (helper untuk drag bar). */
export function addCalendarDays(d: Date, n: number): Date {
  return addDays(d, n);
}
