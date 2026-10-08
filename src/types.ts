export type Priority = 'low' | 'medium' | 'high' | 'critical';

export type LinkType = 'FS' | 'SS';

export interface Dependency {
  /** id tugas pendahulu (predecessor) */
  taskId: string;
  type: LinkType;
  /** jeda (lag) dalam hari kerja */
  delay: number;
}

export interface Task {
  id: string;
  name: string;
  description: string;
  parentId: string | null;
  /** tanggal mulai manual (YYYY-MM-DD) — dipakai bila tugas tidak punya predecessor */
  startDate: string;
  /** durasi dalam hari kerja */
  duration: number;
  priority: Priority;
  /** warna indikator bar Gantt */
  color: string;
  dependencies: Dependency[];
  /** id anggota tim yang dialokasikan ke tugas ini */
  assignees: string[];
}

export interface Member {
  id: string;
  name: string;
  email: string;
  role: string;
  /** gaji per bulan (IDR) */
  salary: number;
}

export interface Holiday {
  id: string;
  date: string;
  name: string;
}

export interface CalendarConfig {
  /** hari akhir pekan: 0=Minggu .. 6=Sabtu */
  weekendDays: number[];
  holidays: Holiday[];
}

export interface ProjectMeta {
  name: string;
  description: string;
}

export interface ProjectState {
  project: ProjectMeta;
  calendar: CalendarConfig;
  tasks: Task[];
  members: Member[];
}

export const PRIORITY_LABEL: Record<Priority, string> = {
  low: 'Rendah',
  medium: 'Sedang',
  high: 'Tinggi',
  critical: 'Kritis',
};

export const PRIORITY_COLOR: Record<Priority, string> = {
  low: '#3b82f6',
  medium: '#f59e0b',
  high: '#f97316',
  critical: '#ef4444',
};

export const PRIORITY_ORDER: Priority[] = ['low', 'medium', 'high', 'critical'];

export const BAR_COLORS = [
  '#3b82f6',
  '#6366f1',
  '#8b5cf6',
  '#ec4899',
  '#ef4444',
  '#f97316',
  '#f59e0b',
  '#84cc16',
  '#10b981',
  '#14b8a6',
  '#64748b',
];
