import React, { useMemo, useRef, useState } from 'react';
import type { CalendarConfig, Member, Task } from '../types';
import { PRIORITY_LABEL } from '../types';
import {
  BULAN_PANJANG,
  HARI,
  addDays,
  calendarDays,
  countInclusive,
  formatDateID,
  holidayOf,
  isWeekend,
  nextWorkingDay,
  toISO,
} from '../lib/date';
import type { Schedule, Scheduled } from '../lib/schedule';

const ROW_H = 36;
const MONTH_H = 28;
const DAY_H = 30;
const HEAD_H = MONTH_H + DAY_H;
const LEFT_W = 480;
const ZOOMS = [
  { key: 'sm', w: 16, label: 'Kecil' },
  { key: 'md', w: 24, label: 'Sedang' },
  { key: 'lg', w: 36, label: 'Besar' },
];
const PADS = 12; // hari cadangan di kanan timeline untuk ruang panah

interface Row {
  task: Task;
  depth: number;
  hasChildren: boolean;
}

interface Props {
  tasks: Task[];
  members: Member[];
  calendar: CalendarConfig;
  schedule: Schedule;
  showCritical: boolean;
  onToggleCritical: () => void;
  onAdd: (parentId: string | null) => void;
  onEdit: (task: Task) => void;
  onUpdate: (id: string, patch: Partial<Task>) => void;
}

function flatten(tasks: Task[], collapsed: Set<string>): Row[] {
  const childrenOf = new Map<string, Task[]>();
  const roots: Task[] = [];
  for (const t of tasks) {
    if (t.parentId && tasks.some((p) => p.id === t.parentId)) {
      const list = childrenOf.get(t.parentId) || [];
      list.push(t);
      childrenOf.set(t.parentId, list);
    } else {
      roots.push(t);
    }
  }
  const out: Row[] = [];
  const walk = (task: Task, depth: number) => {
    const kids = childrenOf.get(task.id) || [];
    out.push({ task, depth, hasChildren: kids.length > 0 });
    if (collapsed.has(task.id)) return;
    for (const k of kids) walk(k, depth + 1);
  };
  for (const r of roots) walk(r, 0);
  return out;
}

type DragMode = 'move' | 'resize';

interface DragState {
  taskId: string;
  mode: DragMode;
  x0: number;
  origStart: Date;
  origEnd: Date;
  duration: number;
}

export function GanttView({
  tasks, members, calendar, schedule, showCritical, onToggleCritical, onAdd, onEdit, onUpdate,
}: Props) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [zoomIdx, setZoomIdx] = useState(1);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [dragDelta, setDragDelta] = useState(0);
  const suppressClickRef = useRef(false);
  const dragRef = useRef<DragState | null>(null);
  const lastXRef = useRef(0);

  const dayWidth = ZOOMS[zoomIdx].w;
  const rows = useMemo(() => flatten(tasks, collapsed), [tasks, collapsed]);
  const rowIndex = useMemo(() => {
    const m = new Map<string, number>();
    rows.forEach((r, i) => m.set(r.task.id, i));
    return m;
  }, [rows]);

  const { timelineStart, totalDays, dayCells } = useMemo(() => {
    const start = schedule.projectStart;
    const span = calendarDays(start, schedule.projectEnd) + 1;
    const days = Math.max(30, span + PADS);
    const cells = Array.from({ length: days }, (_, i) => {
      const date = addDays(start, i);
      const holiday = holidayOf(date, calendar);
      return {
        i,
        date,
        weekend: isWeekend(date, calendar),
        holiday: Boolean(holiday),
        holidayName: holiday?.name ?? '',
        today: calendarDays(new Date(), date) === 0,
      };
    });
    return { timelineStart: start, totalDays: days, dayCells: cells };
  }, [schedule.projectStart, schedule.projectEnd, calendar]);

  const months = useMemo(() => {
    const out: { label: string; left: number; width: number }[] = [];
    let curY = -1;
    let curM = -1;
    let count = 0;
    let left = 0;
    for (const cell of dayCells) {
      const y = cell.date.getFullYear();
      const m = cell.date.getMonth();
      if (y !== curY || m !== curM) {
        if (count > 0) out.push({ label: `${BULAN_PANJANG[curM]} ${curY}`, left, width: count * dayWidth });
        curY = y;
        curM = m;
        count = 0;
        left = cell.i * dayWidth;
      }
      count++;
    }
    if (count > 0) out.push({ label: `${BULAN_PANJANG[curM]} ${curY}`, left, width: count * dayWidth });
    return out;
  }, [dayCells, dayWidth]);

  const timelineWidth = totalDays * dayWidth;
  const todayOffset = calendarDays(timelineStart, new Date());

  const toggleCollapse = (id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const beginDrag = (
    e: React.PointerEvent,
    task: Task,
    item: Scheduled,
    mode: DragMode,
  ) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const state: DragState = {
      taskId: task.id,
      mode,
      x0: e.clientX,
      origStart: item.start,
      origEnd: item.end,
      duration: item.duration,
    };
    dragRef.current = state;
    setDrag(state);
    setDragDelta(0);
  };

  React.useEffect(() => {
    if (!drag) return;
    const onMove = (ev: PointerEvent) => {
      const st = dragRef.current;
      if (!st) return;
      lastXRef.current = ev.clientX;
      setDragDelta(Math.round((ev.clientX - st.x0) / dayWidth));
    };
    const onUp = () => {
      const st = dragRef.current;
      if (st) {
        const delta = Math.round((lastXRef.current - st.x0) / dayWidth);
        if (delta !== 0) {
          suppressClickRef.current = true;
          if (st.mode === 'move') {
            const newStart = nextWorkingDay(addDays(st.origStart, delta), calendar);
            if (toISO(newStart) !== toISO(st.origStart)) {
              onUpdate(st.taskId, { startDate: toISO(newStart) });
            }
          } else {
            const newEnd = addDays(st.origEnd, delta);
            const newDur = Math.max(1, countInclusive(st.origStart, newEnd, calendar));
            if (newDur !== st.duration) onUpdate(st.taskId, { duration: newDur });
          }
        }
      }
      dragRef.current = null;
      setDrag(null);
      setDragDelta(0);
      window.removeEventListener('pointermove', onMove);
    };
    const onCancel = () => {
      dragRef.current = null;
      setDrag(null);
      setDragDelta(0);
      window.removeEventListener('pointermove', onMove);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp, { once: true });
    window.addEventListener('pointercancel', onCancel, { once: true });
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag, dayWidth, calendar, onUpdate]);

  const barClick = (task: Task) => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    onEdit(task);
  };

  // ---- geometri bar ----
  const barGeom = (task: Task): { left: number; width: number; item?: Scheduled } | null => {
    const item = schedule.items.get(task.id);
    if (!item) return null;
    const left = calendarDays(timelineStart, item.start) * dayWidth;
    const width = Math.max(6, (calendarDays(item.start, item.end) + 1) * dayWidth - 4);
    if (drag && drag.taskId === task.id) {
      if (drag.mode === 'move') return { left: left + 2 + dragDelta * dayWidth, width, item };
      if (drag.mode === 'resize') {
        const newEnd = addDays(drag.origEnd, dragDelta);
        const span = calendarDays(item.start, newEnd) + 1;
        return { left, width: Math.max(6, span * dayWidth - 4), item };
      }
    }
    return { left: left + 2, width, item };
  };

  // ---- panah dependensi ----
  const links = useMemo(() => {
    const out: { key: string; d: string; critical: boolean; title: string }[] = [];
    for (const row of rows) {
      const succIdx = rowIndex.get(row.task.id);
      if (succIdx === undefined) continue;
      const succGeom = barGeom(row.task);
      if (!succGeom || !succGeom.item) continue;
      for (const dep of row.task.dependencies) {
        const predIdx = rowIndex.get(dep.taskId);
        if (predIdx === undefined) continue;
        const predTask = tasks.find((t) => t.id === dep.taskId);
        if (!predTask) continue;
        const predGeom = barGeom(predTask);
        if (!predGeom || !predGeom.item) continue;

        const y1 = predIdx * ROW_H + ROW_H / 2;
        const y2 = succIdx * ROW_H + ROW_H / 2;
        const isCritical = showCritical && predGeom.item.critical && succGeom.item.critical;
        const title = `${dep.type} · jeda ${dep.delay} hari kerja`;

        let d: string;
        if (dep.type === 'FS') {
          const x1 = predGeom.left + predGeom.width;
          const x2 = succGeom.left;
          const gap = Math.max(1, x2 - x1);
          const off = Math.min(18, gap * 0.4);
          d = `M ${x1} ${y1} C ${x1 + off} ${y1}, ${x2 - off} ${y2}, ${x2} ${y2}`;
        } else {
          const x1 = predGeom.left;
          const x2 = succGeom.left;
          const c1 = x1 - 18;
          const c2 = x2 - 18;
          d = `M ${x1} ${y1} C ${c1} ${y1}, ${c2} ${y2}, ${x2} ${y2}`;
        }
        out.push({ key: `${dep.taskId}->${row.task.id}`, d, critical: isCritical, title });
      }
    }
    return out;
    // barGeom sengaja dibuat pure-terhadap drag via closure state
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, tasks, rowIndex, dayWidth, timelineStart, drag, dragDelta, showCritical, schedule]);

  const empty = tasks.length === 0;
  const memberName = (id: string) => members.find((m) => m.id === id)?.name ?? '';

  return (
    <div className="gantt-panel">
      <div className="toolbar">
        <button type="button" className="btn btn-primary" onClick={() => onAdd(null)}>
          + Tugas
        </button>
        <div className="seg">
          {ZOOMS.map((z, i) => (
            <button
              key={z.key}
              type="button"
              className={i === zoomIdx ? 'active' : ''}
              onClick={() => setZoomIdx(i)}
            >
              {z.label}
            </button>
          ))}
        </div>
        <label className="check-inline" title="Sorot tugas dengan slack = 0 pada chart">
          <input type="checkbox" checked={showCritical} onChange={onToggleCritical} />
          Sorot jalur kritis
        </label>
        <div className="spacer" />
        {schedule.hasCycle && (
          <span className="badge badge-danger" title="Periksa kembali hubungan predecessor">
            Siklus dependensi terdeteksi
          </span>
        )}
        <span className="toolbar-stat">
          {tasks.length} tugas · {schedule.criticalIds.length} kritis · {schedule.workingDuration} hari kerja
        </span>
        <span className="toolbar-stat" title="Rentang proyek">
          {formatDateID(schedule.projectStart)} → {formatDateID(schedule.projectEnd)}
        </span>
      </div>

      {empty ? (
        <div className="empty-state">
          <div className="empty-icon">📊</div>
          <h3>Belum ada tugas</h3>
          <p>Mulai dengan menambahkan tugas pertama untuk proyek Anda.</p>
          <button type="button" className="btn btn-primary" onClick={() => onAdd(null)}>
            + Tugas Pertama
          </button>
        </div>
      ) : (
        <div className="gantt-scroll">
          <div className="gantt-inner" style={{ width: LEFT_W + timelineWidth }}>
            {/* Panel kiri: daftar tugas */}
            <div className="gl-col" style={{ width: LEFT_W }}>
              <div className="gl-head">
                <div className="gl-name">Tugas</div>
                <div className="gl-date">Mulai</div>
                <div className="gl-date">Selesai</div>
                <div className="gl-dur">Hari</div>
                <div className="gl-act" />
              </div>
              <div className="gl-body">
                {rows.map((row) => {
                  const item = schedule.items.get(row.task.id);
                  const isSummary = row.hasChildren;
                  const isCritical = item?.critical && showCritical;
                  return (
                    <div
                      key={row.task.id}
                      className={`gl-row ${hoverId === row.task.id ? 'hover' : ''} ${isCritical ? 'critical' : ''}`}
                      style={{ height: ROW_H }}
                      onMouseEnter={() => setHoverId(row.task.id)}
                      onMouseLeave={() => setHoverId((h) => (h === row.task.id ? null : h))}
                    >
                      <div className="gl-name" style={{ paddingLeft: 8 + row.depth * 18 }}>
                        {isSummary ? (
                          <button
                            type="button"
                            className="chevron"
                            onClick={() => toggleCollapse(row.task.id)}
                            aria-label={collapsed.has(row.task.id) ? 'Buka' : 'Tutup'}
                          >
                            {collapsed.has(row.task.id) ? '▸' : '▾'}
                          </button>
                        ) : (
                          <span className="chevron-space" />
                        )}
                        <span className="dot" style={{ background: row.task.color }} />
                        <span
                          className="gl-task-name"
                          onClick={() => onEdit(row.task)}
                          title={`${row.task.name} — ${PRIORITY_LABEL[row.task.priority]}\n${row.task.description || ''}`}
                        >
                          {row.task.name}
                        </span>
                        {row.task.assignees.length > 0 && (
                          <span className="avatar-stack" title={row.task.assignees.map(memberName).join(', ')}>
                            {row.task.assignees.slice(0, 3).map((id) => (
                              <span key={id} className="avatar">{memberName(id).charAt(0) || '?'}</span>
                            ))}
                          </span>
                        )}
                      </div>
                      <div className="gl-date">{item ? formatDateID(item.start) : '—'}</div>
                      <div className="gl-date">{item ? formatDateID(item.end) : '—'}</div>
                      <div className="gl-dur">{item ? item.duration : row.task.duration}</div>
                      <div className="gl-act">
                        <button
                          type="button"
                          className="icon-btn row-btn"
                          title="Tambah sub-tugas"
                          onClick={() => onAdd(row.task.id)}
                        >
                          +
                        </button>
                        <button
                          type="button"
                          className="icon-btn row-btn"
                          title="Edit tugas"
                          onClick={() => onEdit(row.task)}
                        >
                          ✎
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Panel kanan: timeline */}
            <div className="gr-col" style={{ width: timelineWidth }}>
              <div className="gr-head" style={{ height: HEAD_H }}>
                <div className="gr-months" style={{ height: MONTH_H }}>
                  {months.map((m) => (
                    <div
                      key={`${m.label}-${m.left}`}
                      className="gr-month"
                      style={{ left: m.left, width: m.width }}
                    >
                      {m.label}
                    </div>
                  ))}
                </div>
                <div className="gr-days" style={{ height: DAY_H }}>
                  {dayCells.map((cell) => (
                    <div
                      key={cell.i}
                      className={`gr-day ${
                        cell.weekend ? 'nonwork' : ''
                      } ${cell.holiday ? 'holiday' : ''} ${cell.today ? 'today' : ''}`}
                      style={{ width: dayWidth }}
                      title={cell.holiday ? cell.holidayName : undefined}
                    >
                      <span className="wd">{HARI[cell.date.getDay()][0]}</span>
                      <span className="dn">{cell.date.getDate()}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="gr-body" style={{ height: rows.length * ROW_H, width: timelineWidth }}>
                {/* lapisan kolom (akhir pekan / libur / garis hari ini) */}
                <div className="gr-columns">
                  {dayCells.map((cell) => (
                    <div
                      key={cell.i}
                      className={`gr-col-cell ${cell.weekend ? 'nonwork' : ''} ${cell.holiday ? 'holiday' : ''}`}
                      style={{ left: cell.i * dayWidth, width: dayWidth }}
                    />
                  ))}
                  {todayOffset >= 0 && todayOffset < totalDays && (
                    <div className="today-line" style={{ left: todayOffset * dayWidth }}>
                      <span className="today-label">Hari ini</span>
                    </div>
                  )}
                </div>

                {/* baris */}
                <div className="gr-rows">
                  {rows.map((row, idx) => {
                    const geom = barGeom(row.task);
                    const item = geom?.item;
                    const isSummary = row.hasChildren;
                    const critical = item?.critical && showCritical;
                    const draggable = !isSummary && row.task.dependencies.length === 0;
                    const resizable = !isSummary;
                    const title = item
                      ? `${row.task.name}\n${formatDateID(item.start)} → ${formatDateID(item.end)} · ${item.duration} hari kerja` +
                        (item.critical ? '\n⭐ Jalur kritis' : item.slack > 0 ? `\nSlack: ${item.slack} hari` : '') +
                        (draggable ? '\n(Geser untuk ubah tanggal mulai)' : isSummary ? '\n(Tugas induk mengikuti sub-tugas)' : '')
                      : row.task.name;
                    return (
                      <div
                        key={row.task.id}
                        className={`gr-row ${hoverId === row.task.id ? 'hover' : ''}`}
                        style={{ height: ROW_H, width: timelineWidth }}
                        onMouseEnter={() => setHoverId(row.task.id)}
                        onMouseLeave={() => setHoverId((h) => (h === row.task.id ? null : h))}
                      >
                        {geom && item && (
                          <div
                            className={`bar ${isSummary ? 'bar-summary' : ''} ${critical ? 'bar-critical' : ''} ${
                              drag?.taskId === row.task.id ? 'dragging' : ''
                            } ${draggable ? 'draggable' : ''}`}
                            style={{
                              left: geom.left,
                              width: geom.width,
                              background: row.task.color,
                            }}
                            title={title}
                            onClick={() => barClick(row.task)}
                            onPointerDown={(e) => draggable && beginDrag(e, row.task, item, 'move')}
                          >
                            <span className="bar-label">{row.task.name}</span>
                            {!isSummary && (
                              <span
                                className="bar-resize"
                                onPointerDown={(e) => resizable && beginDrag(e, row.task, item, 'resize')}
                                title="Geser untuk ubah durasi"
                              />
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* panah dependensi */}
                <svg className="gr-links" width={timelineWidth} height={rows.length * ROW_H}>
                  <defs>
                    <marker id="arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto">
                      <path d="M0,0 L8,4 L0,8 z" fill="#64748b" />
                    </marker>
                    <marker id="arrow-crit" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto">
                      <path d="M0,0 L8,4 L0,8 z" fill="#dc2626" />
                    </marker>
                  </defs>
                  {links.map((l) => (
                    <path
                      key={l.key}
                      d={l.d}
                      className={`link ${l.critical ? 'link-critical' : ''}`}
                      markerEnd={l.critical ? 'url(#arrow-crit)' : 'url(#arrow)'}
                    >
                      <title>{l.title}</title>
                    </path>
                  ))}
                </svg>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="legend">
        <span className="legend-item"><span className="legend-line fs" /> FS (Finish-to-Start)</span>
        <span className="legend-item"><span className="legend-line ss" /> SS (Start-to-Start)</span>
        <span className="legend-item"><span className="legend-chip" /> Akhir pekan / hari libur</span>
        <span className="legend-item"><span className="legend-chip critical" /> Jalur kritis</span>
        <span className="legend-hint">Klik bar untuk edit · geser bar untuk ubah tanggal · seret tepi kanan untuk ubah durasi</span>
      </div>
    </div>
  );
}
