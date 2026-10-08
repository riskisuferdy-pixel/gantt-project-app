import React, { createContext, useContext, useEffect, useMemo, useReducer } from 'react';
import type {
  CalendarConfig,
  Holiday,
  Member,
  ProjectMeta,
  ProjectState,
  Task,
} from './types';

export const STORAGE_KEY = 'ganttpro:state:v1';

export type Action =
  | { type: 'ADD_TASK'; task: Task }
  | { type: 'UPDATE_TASK'; id: string; patch: Partial<Task> }
  | { type: 'DELETE_TASK'; id: string }
  | { type: 'ADD_MEMBER'; member: Member }
  | { type: 'UPDATE_MEMBER'; id: string; patch: Partial<Member> }
  | { type: 'DELETE_MEMBER'; id: string }
  | { type: 'SET_WEEKEND'; days: number[] }
  | { type: 'ADD_HOLIDAY'; holiday: Holiday }
  | { type: 'DELETE_HOLIDAY'; id: string }
  | { type: 'SET_PROJECT'; patch: Partial<ProjectMeta> }
  | { type: 'RESET' }
  | { type: 'LOAD'; state: ProjectState };

export function uid(prefix = 'id'): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function collectDescendants(tasks: Task[], rootId: string): Set<string> {
  const out = new Set<string>([rootId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const t of tasks) {
      if (t.parentId && out.has(t.parentId) && !out.has(t.id)) {
        out.add(t.id);
        changed = true;
      }
    }
  }
  return out;
}

export function reducer(state: ProjectState, action: Action): ProjectState {
  switch (action.type) {
    case 'ADD_TASK':
      return { ...state, tasks: [...state.tasks, action.task] };

    case 'UPDATE_TASK':
      return {
        ...state,
        tasks: state.tasks.map((t) =>
          t.id === action.id ? { ...t, ...action.patch, id: t.id } : t,
        ),
      };

    case 'DELETE_TASK': {
      const removed = collectDescendants(state.tasks, action.id);
      return {
        ...state,
        tasks: state.tasks
          .filter((t) => !removed.has(t.id))
          .map((t) => ({
            ...t,
            dependencies: t.dependencies.filter((d) => !removed.has(d.taskId)),
          })),
      };
    }

    case 'ADD_MEMBER':
      return { ...state, members: [...state.members, action.member] };

    case 'UPDATE_MEMBER':
      return {
        ...state,
        members: state.members.map((m) =>
          m.id === action.id ? { ...m, ...action.patch, id: m.id } : m,
        ),
      };

    case 'DELETE_MEMBER':
      return {
        ...state,
        members: state.members.filter((m) => m.id !== action.id),
        tasks: state.tasks.map((t) => ({
          ...t,
          assignees: t.assignees.filter((a) => a !== action.id),
        })),
      };

    case 'SET_WEEKEND':
      return {
        ...state,
        calendar: { ...state.calendar, weekendDays: [...action.days].sort((a, b) => a - b) },
      };

    case 'ADD_HOLIDAY':
      return {
        ...state,
        calendar: {
          ...state.calendar,
          holidays: [
            ...state.calendar.holidays.filter((h) => h.date !== action.holiday.date),
            action.holiday,
          ].sort((a, b) => a.date.localeCompare(b.date)),
        },
      };

    case 'DELETE_HOLIDAY':
      return {
        ...state,
        calendar: {
          ...state.calendar,
          holidays: state.calendar.holidays.filter((h) => h.id !== action.id),
        },
      };

    case 'SET_PROJECT':
      return { ...state, project: { ...state.project, ...action.patch } };

    case 'LOAD':
      return action.state;

    case 'RESET':
      return createSeedState();

    default:
      return state;
  }
}

// ---------------------------------------------------------------------------
// Seed data (demo proyek berbahasa Indonesia)
// ---------------------------------------------------------------------------

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

function safeISO(v: unknown, fallback: string): string {
  return typeof v === 'string' && ISO_RE.test(v) ? v : fallback;
}

function coerceState(raw: unknown): ProjectState | null {
  if (!raw || typeof raw !== 'object') return null;
  const s = raw as Partial<ProjectState>;
  if (!Array.isArray(s.tasks) || !Array.isArray(s.members)) return null;
  const cal = (s.calendar || {}) as Partial<CalendarConfig>;
  return {
    project: {
      name: typeof s.project?.name === 'string' && s.project.name ? s.project.name : 'Proyek Baru',
      description: typeof s.project?.description === 'string' ? s.project.description : '',
    },
    calendar: {
      weekendDays: Array.isArray(cal.weekendDays) && cal.weekendDays.length
        ? cal.weekendDays.filter((n) => Number.isInteger(n) && n >= 0 && n <= 6)
        : [0, 6],
      holidays: Array.isArray(cal.holidays) ? cal.holidays : [],
    },
    tasks: s.tasks.map((t: Partial<Task>) => ({
      id: String(t.id ?? uid('t')),
      name: String(t.name ?? 'Tugas'),
      description: String(t.description ?? ''),
      parentId: t.parentId ?? null,
      startDate: safeISO(t.startDate, '2026-10-05'),
      duration: Math.max(1, Number(t.duration) || 1),
      priority: (t.priority as Task['priority']) || 'medium',
      color: typeof t.color === 'string' && t.color ? t.color : '#3b82f6',
      dependencies: Array.isArray(t.dependencies)
        ? t.dependencies.map((d) => ({
            taskId: String(d.taskId),
            type: d.type === 'SS' ? 'SS' : 'FS',
            delay: Math.max(0, Number(d.delay) || 0),
          }))
        : [],
      assignees: Array.isArray(t.assignees) ? t.assignees.map(String) : [],
    })),
    members: s.members.map((m: Partial<Member>) => ({
      id: String(m.id ?? uid('m')),
      name: String(m.name ?? ''),
      email: String(m.email ?? ''),
      role: String(m.role ?? ''),
      salary: Math.max(0, Number(m.salary) || 0),
    })),
  };
}

export function createSeedState(): ProjectState {
  const t = (
    id: string,
    name: string,
    startDate: string,
    duration: number,
    priority: Task['priority'],
    color: string,
    parentId: string | null = null,
    dependencies: Task['dependencies'] = [],
    assignees: string[] = [],
    description = '',
  ): Task => ({
    id, name, description, parentId, startDate, duration, priority, color,
    dependencies, assignees,
  });

  const members: Member[] = [
    { id: 'm1', name: 'Budi Santoso', email: 'budi@perusahaan.id', role: 'Project Manager', salary: 18_000_000 },
    { id: 'm2', name: 'Siti Aminah', email: 'siti@perusahaan.id', role: 'UI/UX Designer', salary: 12_000_000 },
    { id: 'm3', name: 'Andi Wijaya', email: 'andi@perusahaan.id', role: 'Backend Developer', salary: 14_000_000 },
    { id: 'm4', name: 'Rina Putri', email: 'rina@perusahaan.id', role: 'Frontend Developer', salary: 13_000_000 },
    { id: 'm5', name: 'Dimas Pratama', email: 'dimas@perusahaan.id', role: 'QA Engineer', salary: 11_000_000 },
  ];

  const tasks: Task[] = [
    t('t1', 'Analisis Kebutuhan', '2026-10-05', 5, 'high', '#6366f1', null, [], ['m1'],
      'Tahap pengumpulan dan validasi kebutuhan bisnis.'),
    t('t1a', 'Identifikasi Kebutuhan', '2026-10-05', 3, 'high', '#3b82f6', 't1', [], ['m1', 'm3']),
    t('t1b', 'Dokumentasi Requirement', '2026-10-06', 2, 'medium', '#8b5cf6', 't1',
      [{ taskId: 't1a', type: 'SS', delay: 1 }], ['m1']),

    t('t2', 'Desain Sistem', '2026-10-08', 5, 'medium', '#ec4899', null,
      [{ taskId: 't1', type: 'FS', delay: 0 }], ['m2'],
      'Desain arsitektur, database, dan antarmuka.'),
    t('t2a', 'Desain Database & ERD', '2026-10-08', 2, 'medium', '#10b981', 't2',
      [{ taskId: 't1b', type: 'FS', delay: 0 }], ['m3']),
    t('t2b', 'Desain UI/UX', '2026-10-09', 3, 'medium', '#f59e0b', 't2',
      [{ taskId: 't2a', type: 'SS', delay: 1 }], ['m2', 'm4']),

    t('t3', 'Pengembangan', '2026-10-13', 10, 'high', '#f97316', null,
      [{ taskId: 't2', type: 'FS', delay: 1 }], ['m3', 'm4'],
      'Implementasi backend, frontend, dan integrasi.'),
    t('t3a', 'Setup Environment', '2026-10-13', 1, 'low', '#64748b', 't3',
      [{ taskId: 't2a', type: 'FS', delay: 0 }], ['m3']),
    t('t3b', 'Backend API', '2026-10-14', 5, 'critical', '#ef4444', 't3',
      [{ taskId: 't3a', type: 'FS', delay: 0 }], ['m3']),
    t('t3c', 'Frontend Aplikasi', '2026-10-15', 5, 'high', '#14b8a6', 't3',
      [{ taskId: 't3b', type: 'SS', delay: 2 }], ['m4']),
    t('t3d', 'Integrasi & Deployment', '2026-10-21', 3, 'critical', '#ef4444', 't3',
      [
        { taskId: 't3b', type: 'FS', delay: 1 },
        { taskId: 't3c', type: 'FS', delay: 0 },
      ], ['m3', 'm4']),

    t('t4', 'Pengujian', '2026-10-27', 5, 'medium', '#84cc16', null,
      [{ taskId: 't3', type: 'FS', delay: 0 }], ['m5'],
      'Pengujian unit, integrasi, dan uji pengguna.'),
    t('t4a', 'Pengujian Unit & Integrasi', '2026-10-27', 3, 'medium', '#84cc16', 't4',
      [{ taskId: 't3d', type: 'FS', delay: 0 }], ['m5', 'm3']),
    t('t4b', 'User Acceptance Test', '2026-10-30', 2, 'high', '#f59e0b', 't4',
      [{ taskId: 't4a', type: 'FS', delay: 1 }], ['m5', 'm1']),

    t('t5', 'Peluncuran & Serah Terima', '2026-11-03', 2, 'critical', '#ef4444', null,
      [{ taskId: 't4', type: 'FS', delay: 1 }], ['m1', 'm5'],
      'Go-live dan serah terima proyek ke klien.'),
  ];

  return {
    project: {
      name: 'Implementasi Sistem Informasi Absensi',
      description: 'Proyek pengembangan aplikasi absensi online untuk klien korporat.',
    },
    calendar: {
      weekendDays: [0, 6],
      holidays: [
        { id: 'h1', date: '2026-10-14', name: 'Hari Libur Nasional' },
        { id: 'h2', date: '2026-10-22', name: 'Hari Santri Nasional' },
        { id: 'h3', date: '2026-11-05', name: 'Cuti Bersama' },
      ],
    },
    tasks,
    members,
  };
}

function loadState(): ProjectState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = coerceState(JSON.parse(raw));
      if (parsed) return parsed;
    }
  } catch {
    // abaikan data rusak → pakai seed
  }
  return createSeedState();
}

interface StoreValue {
  state: ProjectState;
  dispatch: React.Dispatch<Action>;
}

const StoreContext = createContext<StoreValue | null>(null);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, loadState);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // kuota penuh → abaikan
    }
  }, [state]);

  const value = useMemo(() => ({ state, dispatch }), [state]);
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore harus dipakai di dalam StoreProvider');
  return ctx;
}

export function useTasks(): Task[] {
  return useStore().state.tasks;
}
