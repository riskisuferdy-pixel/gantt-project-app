import React, { useMemo, useState } from 'react';
import { useStore } from './store';
import type { Holiday, Member, Task } from './types';
import { computeSchedule } from './lib/schedule';
import { todayISO } from './lib/date';
import { GanttView } from './components/GanttView';
import { TaskModal } from './components/TaskModal';
import { TeamView } from './components/TeamView';
import { CalendarView } from './components/CalendarView';
import { AnalysisView } from './components/AnalysisView';

type Tab = 'gantt' | 'team' | 'calendar' | 'analysis';

function initialTab(): Tab {
  const raw = typeof window !== 'undefined'
    ? new URLSearchParams(window.location.search).get('tab')
    : null;
  return raw === 'team' || raw === 'calendar' || raw === 'analysis' || raw === 'gantt'
    ? raw
    : 'gantt';
}

const TABS: { key: Tab; label: string; icon: string }[] = [
  { key: 'gantt', label: 'Gantt Chart', icon: '📊' },
  { key: 'team', label: 'Tim & Sumber Daya', icon: '👥' },
  { key: 'calendar', label: 'Kalender Proyek', icon: '📅' },
  { key: 'analysis', label: 'Analisis', icon: '🎯' },
];

interface ModalState {
  editing: Task | null;
  presetParentId: string | null;
}

export default function App() {
  const { state, dispatch } = useStore();
  const { project, calendar, tasks, members } = state;
  const [tab, setTab] = useState<Tab>(initialTab);
  const [taskModal, setTaskModal] = useState<ModalState | null>(null);
  const [showCritical, setShowCritical] = useState(true);

  const schedule = useMemo(
    () => computeSchedule(tasks, calendar, todayISO()),
    [tasks, calendar],
  );

  // ---- task handlers ----
  const openAdd = (parentId: string | null) => setTaskModal({ editing: null, presetParentId: parentId });
  const openEdit = (task: Task) => setTaskModal({ editing: task, presetParentId: null });

  const saveTask = (task: Task) => {
    if (taskModal?.editing) {
      dispatch({ type: 'UPDATE_TASK', id: task.id, patch: task });
    } else {
      dispatch({ type: 'ADD_TASK', task });
    }
    setTaskModal(null);
  };

  const deleteTask = (id: string) => {
    dispatch({ type: 'DELETE_TASK', id });
    setTaskModal(null);
  };

  const updateTask = (id: string, patch: Partial<Task>) =>
    dispatch({ type: 'UPDATE_TASK', id, patch });

  // ---- member handlers ----
  const addMember = (m: Member) => dispatch({ type: 'ADD_MEMBER', member: m });
  const updateMember = (id: string, patch: Partial<Member>) =>
    dispatch({ type: 'UPDATE_MEMBER', id, patch });
  const deleteMember = (id: string) => dispatch({ type: 'DELETE_MEMBER', id });

  // ---- calendar handlers ----
  const setWeekend = (days: number[]) => dispatch({ type: 'SET_WEEKEND', days });
  const addHoliday = (h: Holiday) => dispatch({ type: 'ADD_HOLIDAY', holiday: h });
  const deleteHoliday = (id: string) => dispatch({ type: 'DELETE_HOLIDAY', id });

  const workingStats = useMemo(() => {
    const span = Math.max(
      1,
      Math.round((schedule.projectEnd.getTime() - schedule.projectStart.getTime()) / 86400000) + 1,
    );
    let working = 0;
    for (let i = 0; i < span; i++) {
      const d = new Date(
        schedule.projectStart.getFullYear(),
        schedule.projectStart.getMonth(),
        schedule.projectStart.getDate() + i,
      );
      const isWeekendDay = calendar.weekendDays.includes(d.getDay());
      const isHoliday = calendar.holidays.some((h) => h.date === toISO(d));
      if (!isWeekendDay && !isHoliday) working++;
    }
    return { total: span, working };
  }, [schedule, calendar]);

  const toggleCritical = () => setShowCritical((v) => !v);

  return (
    <div className="app">
      <header className="app-header">
        <div className="brand">
          <span className="brand-logo">◧</span>
          <span className="brand-name">GanttPro</span>
        </div>
        <input
          className="project-name-input"
          value={project.name}
          onChange={(e) => dispatch({ type: 'SET_PROJECT', patch: { name: e.target.value } })}
          title="Klik untuk mengubah nama proyek"
          aria-label="Nama proyek"
        />
        <nav className="tabs">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              className={`tab ${tab === t.key ? 'active' : ''}`}
              onClick={() => setTab(t.key)}
            >
              <span className="tab-icon">{t.icon}</span>
              {t.label}
            </button>
          ))}
        </nav>
        <div className="header-right">
          <span className="save-indicator" title="Data tersimpan otomatis di browser (localStorage)">
            ✓ Tersimpan
          </span>
          <button
            type="button"
            className="btn btn-ghost"
            title="Kembalikan data contoh semula"
            onClick={() => {
              if (window.confirm('Reset seluruh data ke contoh awal? Perubahan Anda akan hilang.')) {
                dispatch({ type: 'RESET' });
              }
            }}
          >
            Reset Data
          </button>
        </div>
      </header>

      <main className="app-main">
        {tab === 'gantt' && (
          <GanttView
            tasks={tasks}
            members={members}
            calendar={calendar}
            schedule={schedule}
            showCritical={showCritical}
            onToggleCritical={toggleCritical}
            onAdd={openAdd}
            onEdit={openEdit}
            onUpdate={updateTask}
          />
        )}
        {tab === 'team' && (
          <TeamView
            members={members}
            tasks={tasks}
            onAdd={addMember}
            onUpdate={updateMember}
            onDelete={deleteMember}
            onOpenTask={openEdit}
          />
        )}
        {tab === 'calendar' && (
          <CalendarView
            calendar={calendar}
            onSetWeekend={setWeekend}
            onAddHoliday={addHoliday}
            onDeleteHoliday={deleteHoliday}
            workingStats={workingStats}
          />
        )}
        {tab === 'analysis' && (
          <AnalysisView
            schedule={schedule}
            members={members}
            tasks={tasks}
            showCritical={showCritical}
            onToggleCritical={toggleCritical}
            onOpenTask={openEdit}
          />
        )}
      </main>

      {taskModal && (
        <TaskModal
          tasks={tasks}
          members={members}
          calendar={calendar}
          editing={taskModal.editing}
          presetParentId={taskModal.presetParentId}
          onSave={saveTask}
          onDelete={deleteTask}
          onClose={() => setTaskModal(null)}
        />
      )}
    </div>
  );
}

function toISO(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
