import React, { useMemo, useState } from 'react';
import type { Member, Task } from '../types';
import { PRIORITY_LABEL } from '../types';
import { formatDateID, formatIDR } from '../lib/date';
import { criticalChain, taskLaborCost } from '../lib/schedule';
import type { Schedule } from '../lib/schedule';
import { PertDiagram } from './PertDiagram';

interface Props {
  schedule: Schedule;
  members: Member[];
  tasks: Task[];
  showCritical: boolean;
  onToggleCritical: () => void;
  onOpenTask: (task: Task) => void;
}

type Filter = 'all' | 'critical' | 'free';

export function AnalysisView({
  schedule, members, tasks, showCritical, onToggleCritical, onOpenTask,
}: Props) {
  const [filter, setFilter] = useState<Filter>('all');
  const [sortKey, setSortKey] = useState<'es' | 'slack' | 'name'>('es');

  const salaryById = useMemo(() => new Map(members.map((m) => [m.id, m.salary])), [members]);

  const rows = useMemo(() => {
    let list = [...schedule.items.values()];
    if (filter === 'critical') list = list.filter((x) => x.critical);
    if (filter === 'free') list = list.filter((x) => !x.critical);
    list.sort((a, b) => {
      if (sortKey === 'name') return a.task.name.localeCompare(b.task.name);
      if (sortKey === 'slack') return a.slack - b.slack || a.es.getTime() - b.es.getTime();
      return a.es.getTime() - b.es.getTime() || a.task.name.localeCompare(b.task.name);
    });
    return list;
  }, [schedule, filter, sortKey]);

  const chain = useMemo(() => criticalChain(schedule), [schedule]);

  const totalCost = useMemo(
    () => tasks.reduce((sum, t) => sum + taskLaborCost(t, salaryById), 0),
    [tasks, salaryById],
  );

  const unassigned = tasks.filter((t) => t.assignees.length === 0 && !(childrenIds(tasks).has(t.id)));

  return (
    <div className="page">
      <div className="toolbar">
        <div>
          <h2>Analisis Proyek</h2>
          <p className="muted">Jalur kritis (Critical Path) dan diagram jaringan PERT.</p>
        </div>
        <div className="spacer" />
        <label className="check-inline" title="Sorot jalur kritis di tab Gantt & PERT">
          <input type="checkbox" checked={showCritical} onChange={onToggleCritical} />
          Sorot jalur kritis
        </label>
      </div>

      {schedule.hasCycle && (
        <div className="alert alert-error">
          Ditemukan siklus dependensi antar tugas. Periksa kembali hubungan predecessor —
          perhitungan jalur kritis mungkin tidak akurat.
        </div>
      )}

      <div className="stat-grid">
        <div className="stat-card">
          <span className="stat-label">Durasi Proyek</span>
          <span className="stat-value">{schedule.workingDuration} <small>hari kerja</small></span>
          <span className="stat-sub">{formatDateID(schedule.projectStart)} → {formatDateID(schedule.projectEnd)}</span>
        </div>
        <div className="stat-card critical">
          <span className="stat-label">Jalur Kritis</span>
          <span className="stat-value">{chain.length} <small>tugas</small></span>
          <span className="stat-sub">Slack = 0 · penentu durasi proyek</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Total Tugas</span>
          <span className="stat-value">{tasks.length}</span>
          <span className="stat-sub">{tasks.filter((t) => t.parentId).length} sub-tugas</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Estimasi Biaya Tenaga Kerja</span>
          <span className="stat-value">{formatIDR(totalCost)}</span>
          <span className="stat-sub">Σ (biaya harian × durasi)</span>
        </div>
      </div>

      {chain.length > 0 && (
        <div className="card">
          <h3 className="card-title">Urutan Jalur Kritis</h3>
          <div className="chain-row">
            {chain.map((it, i) => (
              <React.Fragment key={it.id}>
                {i > 0 && <span className="chain-arrow">→</span>}
                <button
                  type="button"
                  className={`chain-node ${it.critical ? 'critical' : ''}`}
                  style={{ borderColor: it.task.color }}
                  onClick={() => onOpenTask(it.task)}
                  title={`${it.task.name} · ${it.duration} hari kerja`}
                >
                  <span className="chain-name">{it.task.name}</span>
                  <span className="chain-dur">{it.duration} hr</span>
                </button>
              </React.Fragment>
            ))}
          </div>
          <p className="muted small">
            Durasi total jalur kritis ≈ {chain.reduce((s, x) => s + x.duration, 0)} hari kerja.
            Keterlambatan pada salah satu tugas di atas akan menunda seluruh proyek.
          </p>
        </div>
      )}

      <div className="card">
        <div className="card-head">
          <h3 className="card-title">Tabel Analisis Waktu (CPM)</h3>
          <div className="card-tools">
            <div className="seg">
              <button type="button" className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>Semua</button>
              <button type="button" className={filter === 'critical' ? 'active' : ''} onClick={() => setFilter('critical')}>Kritis</button>
              <button type="button" className={filter === 'free' ? 'active' : ''} onClick={() => setFilter('free')}>Berkelanjutan</button>
            </div>
            <select value={sortKey} onChange={(e) => setSortKey(e.target.value as typeof sortKey)} aria-label="Urutkan">
              <option value="es">Urut: Mulai (ES)</option>
              <option value="slack">Urut: Slack</option>
              <option value="name">Urut: Nama</option>
            </select>
          </div>
        </div>
        <div className="table-scroll">
          <table className="table table-analysis">
            <thead>
              <tr>
                <th>Tugas</th>
                <th className="num">Durasi</th>
                <th>ES (Early Start)</th>
                <th>EF (Early Finish)</th>
                <th>LS (Late Start)</th>
                <th>LF (Late Finish)</th>
                <th className="num">Slack</th>
                <th>Prioritas</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((it) => (
                <tr
                  key={it.id}
                  className={it.critical && showCritical ? 'row-critical' : ''}
                  onClick={() => onOpenTask(it.task)}
                  title="Klik untuk edit tugas"
                >
                  <td>
                    <div className="task-cell" style={{ paddingLeft: it.depth * 14 }}>
                      <span className="dot" style={{ background: it.task.color }} />
                      <span className="task-cell-name">{it.task.name}</span>
                      {it.task.parentId && <span className="badge badge-soft">sub</span>}
                    </div>
                  </td>
                  <td className="num">{it.duration} hr</td>
                  <td>{formatDateID(it.es)}</td>
                  <td>{formatDateID(it.ef)}</td>
                  <td>{formatDateID(it.ls)}</td>
                  <td>{formatDateID(it.lf)}</td>
                  <td className="num">{it.slack} hr</td>
                  <td>{PRIORITY_LABEL[it.task.priority]}</td>
                  <td>
                    {it.critical
                      ? <span className="badge badge-critical">Kritis</span>
                      : <span className="badge badge-ok">Slack {it.slack}</span>}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={9} className="muted center">Tidak ada tugas pada filter ini.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="hint">
          ES = waktu mulai tercepat · LF = waktu selesai terlambat · Slack = kelonggaran (hari kerja).
          Tugas dengan slack 0 berada pada jalur kritis.
          {unassigned.length > 0 && ` · ${unassigned.length} tugas belum dialokasikan anggota.`}
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <h3 className="card-title">Diagram PERT (Project Evaluation & Review Technique)</h3>
          <div className="card-tools">
            <span className="muted small">Geser untuk melihat seluruh jaringan →</span>
          </div>
        </div>
        <PertDiagram schedule={schedule} highlightCritical={showCritical} />
        <div className="pert-legend">
          <span><i className="sw crit" /> Node jalur kritis</span>
          <span><i className="sw normal" /> Node biasa</span>
          <span>ES/EF = jadwal tercepat · LS/LF = jadwal terlambat</span>
        </div>
      </div>
    </div>
  );
}

function childrenIds(tasks: Task[]): Set<string> {
  return new Set(tasks.filter((t) => t.parentId).map((t) => t.id));
}
