import React, { useMemo, useState } from 'react';
import type { Dependency, LinkType, Member, Priority, Task } from '../types';
import { BAR_COLORS, PRIORITY_COLOR, PRIORITY_LABEL, PRIORITY_ORDER } from '../types';
import { durationEnd, formatDateID, formatIDR, parseISO, todayISO } from '../lib/date';
import { taskLaborCost } from '../lib/schedule';
import { Modal } from './Modal';

interface Props {
  tasks: Task[];
  members: Member[];
  calendar: import('../types').CalendarConfig;
  /** tugas yang sedang diedit, atau null untuk tambah baru */
  editing: Task | null;
  /** preset induk saat menambah sub-tugas */
  presetParentId: string | null;
  onSave: (task: Task) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}

function descendantIds(tasks: Task[], rootId: string): Set<string> {
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

export function TaskModal({
  tasks, members, calendar, editing, presetParentId, onSave, onDelete, onClose,
}: Props) {
  const isNew = !editing;
  const [name, setName] = useState(editing?.name ?? '');
  const [description, setDescription] = useState(editing?.description ?? '');
  const [parentId, setParentId] = useState<string>(editing?.parentId ?? presetParentId ?? '');
  const [startDate, setStartDate] = useState(editing?.startDate ?? todayISO());
  const [duration, setDuration] = useState(editing?.duration ?? 3);
  const [priority, setPriority] = useState<Priority>(editing?.priority ?? 'medium');
  const [color, setColor] = useState(editing?.color ?? PRIORITY_COLOR[editing?.priority ?? 'medium']);
  const [dependencies, setDependencies] = useState<Dependency[]>(editing?.dependencies ?? []);
  const [assignees, setAssignees] = useState<string[]>(editing?.assignees ?? []);
  const [error, setError] = useState('');

  const excluded = useMemo(() => {
    if (!editing) return new Set<string>();
    const s = descendantIds(tasks, editing.id);
    s.add(editing.id);
    return s;
  }, [tasks, editing]);

  const parentOptions = tasks.filter((t) => !excluded.has(t.id));
  const depOptions = tasks.filter((t) => !excluded.has(t.id));
  const depIds = new Set(dependencies.map((d) => d.taskId));

  const salaryById = useMemo(
    () => new Map(members.map((m) => [m.id, m.salary])),
    [members],
  );

  const previewEnd = useMemo(
    () => durationEnd(parseISO(startDate), duration, calendar),
    [startDate, duration, calendar],
  );
  const laborCost = useMemo(
    () => taskLaborCost({ assignees } as Task, salaryById),
    [assignees, salaryById],
  );

  const setPriorityColor = (p: Priority) => {
    setPriority(p);
    setColor(PRIORITY_COLOR[p]);
  };

  const addDependency = (taskId: string) => {
    if (!taskId || depIds.has(taskId)) return;
    setDependencies([...dependencies, { taskId, type: 'FS', delay: 0 }]);
  };

  const updateDependency = (idx: number, patch: Partial<Dependency>) => {
    setDependencies(dependencies.map((d, i) => (i === idx ? { ...d, ...patch } : d)));
  };

  const removeDependency = (idx: number) => {
    setDependencies(dependencies.filter((_, i) => i !== idx));
  };

  const toggleAssignee = (id: string) => {
    setAssignees((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Nama tugas wajib diisi.');
      return;
    }
    if (!startDate) {
      setError('Tanggal mulai wajib diisi.');
      return;
    }
    if (parentId && editing && parentId === editing.id) {
      setError('Tugas tidak bisa menjadi induk dirinya sendiri.');
      return;
    }
    const task: Task = {
      id: editing?.id ?? `t_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
      name: name.trim(),
      description: description.trim(),
      parentId: parentId || null,
      startDate,
      duration: Math.max(1, Math.round(duration) || 1),
      priority,
      color,
      dependencies,
      assignees,
    };
    onSave(task);
  };

  const handleDelete = () => {
    if (!editing) return;
    const kids = descendantIds(tasks, editing.id).size - 1;
    const msg = kids > 0
      ? `Hapus "${editing.name}" beserta ${kids} sub-tugas di dalamnya?`
      : `Hapus tugas "${editing.name}"?`;
    if (window.confirm(msg)) onDelete(editing.id);
  };

  return (
    <Modal
      title={isNew ? 'Tambah Tugas' : 'Edit Tugas'}
      onClose={onClose}
      wide
      footer={
        <div className="modal-foot-row">
          {editing && (
            <button type="button" className="btn btn-danger-ghost" onClick={handleDelete}>
              Hapus
            </button>
          )}
          <div className="spacer" />
          <button type="button" className="btn btn-ghost" onClick={onClose}>Batal</button>
          <button type="submit" form="task-form" className="btn btn-primary">
            {isNew ? 'Tambah' : 'Simpan'}
          </button>
        </div>
      }
    >
      <form id="task-form" onSubmit={submit} className="form">
        {error && <div className="alert alert-error">{error}</div>}

        <div className="field field-full">
          <label htmlFor="task-name">Nama Tugas *</label>
          <input
            id="task-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="mis. Desain Antarmuka"
            autoFocus
          />
        </div>

        <div className="field field-full">
          <label htmlFor="task-desc">Deskripsi</label>
          <textarea
            id="task-desc"
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Deskripsi singkat tugas…"
          />
        </div>

        <div className="form-grid">
          <div className="field">
            <label htmlFor="task-parent">Tugas Induk (sub-tugas)</label>
            <select id="task-parent" value={parentId} onChange={(e) => setParentId(e.target.value)}>
              <option value="">— Tugas induk / root —</option>
              {parentOptions.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="task-start">Tanggal Mulai *</label>
            <input
              id="task-start"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>

          <div className="field">
            <label htmlFor="task-dur">Durasi (hari kerja) *</label>
            <input
              id="task-dur"
              type="number"
              min={1}
              value={duration}
              onChange={(e) => setDuration(Math.max(1, Number(e.target.value) || 1))}
            />
          </div>

          <div className="field">
            <label htmlFor="task-prio">Prioritas</label>
            <select
              id="task-prio"
              value={priority}
              onChange={(e) => setPriorityColor(e.target.value as Priority)}
            >
              {PRIORITY_ORDER.map((p) => (
                <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>
              ))}
            </select>
          </div>

          <div className="field field-full">
            <label>Warna Indikator</label>
            <div className="color-row">
              {BAR_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={`color-swatch ${color.toLowerCase() === c.toLowerCase() ? 'active' : ''}`}
                  style={{ background: c }}
                  onClick={() => setColor(c)}
                  aria-label={`Warna ${c}`}
                />
              ))}
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="color-input"
                aria-label="Pilih warna kustom"
              />
            </div>
          </div>
        </div>

        <div className="preview-strip">
          <span>
            Selesai efektif: <strong>{formatDateID(previewEnd)}</strong>
            {' · '}
            {duration} hari kerja
          </span>
          <span>
            Biaya tenaga kerja (est.): <strong>{formatIDR(laborCost)}</strong>
          </span>
        </div>

        <div className="form-grid">
          <div className="field">
            <label>Predecessors (hubungan antar tugas)</label>
            <div className="dep-list">
              {dependencies.length === 0 && (
                <div className="muted small">Belum ada hubungan. Tugas dimulai sesuai tanggal mulai manual.</div>
              )}
              {dependencies.map((dep, idx) => {
                const pred = tasks.find((t) => t.id === dep.taskId);
                return (
                  <div className="dep-row" key={`${dep.taskId}-${idx}`}>
                    <span className="dep-name" title={pred?.name}>{pred?.name ?? '(terhapus)'}</span>
                    <select
                      value={dep.type}
                      onChange={(e) => updateDependency(idx, { type: e.target.value as LinkType })}
                      aria-label="Tipe hubungan"
                    >
                      <option value="FS">FS (Finish-to-Start)</option>
                      <option value="SS">SS (Start-to-Start)</option>
                    </select>
                    <label className="delay-label">
                      Jeda
                      <input
                        type="number"
                        min={0}
                        value={dep.delay}
                        onChange={(e) => updateDependency(idx, { delay: Math.max(0, Number(e.target.value) || 0) })}
                        aria-label="Jeda hari"
                      />
                      hr
                    </label>
                    <button
                      type="button"
                      className="icon-btn"
                      onClick={() => removeDependency(idx)}
                      aria-label="Hapus hubungan"
                    >
                      ✕
                    </button>
                  </div>
                );
              })}
              <select
                className="dep-add"
                value=""
                onChange={(e) => addDependency(e.target.value)}
                aria-label="Tambah predecessor"
              >
                <option value="">+ Tambah predecessor…</option>
                {depOptions
                  .filter((t) => !depIds.has(t.id))
                  .map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
              </select>
            </div>
          </div>

          <div className="field">
            <label>Alokasi Anggota Tim</label>
            <div className="assignee-list">
              {members.length === 0 && (
                <div className="muted small">Belum ada anggota. Tambahkan lewat tab Tim.</div>
              )}
              {members.map((m) => (
                <label key={m.id} className={`check-row ${assignees.includes(m.id) ? 'checked' : ''}`}>
                  <input
                    type="checkbox"
                    checked={assignees.includes(m.id)}
                    onChange={() => toggleAssignee(m.id)}
                  />
                  <span className="check-name">{m.name}</span>
                  <span className="check-role">{m.role}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
      </form>
    </Modal>
  );
}
