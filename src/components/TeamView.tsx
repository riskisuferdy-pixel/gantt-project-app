import React, { useMemo, useState } from 'react';
import type { Member, Task } from '../types';
import { formatDateID, formatIDR } from '../lib/date';
import { taskLaborCost } from '../lib/schedule';
import { Modal } from './Modal';
import { uid } from '../store';

interface Props {
  members: Member[];
  tasks: Task[];
  onAdd: (m: Member) => void;
  onUpdate: (id: string, patch: Partial<Member>) => void;
  onDelete: (id: string) => void;
  onOpenTask: (task: Task) => void;
}

interface FormState {
  id?: string;
  name: string;
  email: string;
  role: string;
  salary: string;
}

const EMPTY: FormState = { name: '', email: '', role: '', salary: '' };

export function TeamView({ members, tasks, onAdd, onUpdate, onDelete, onOpenTask }: Props) {
  const [form, setForm] = useState<FormState | null>(null);
  const [error, setError] = useState('');

  const allocations = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const m of members) map.set(m.id, []);
    for (const t of tasks) {
      for (const id of t.assignees) {
        if (!map.has(id)) map.set(id, []);
        map.get(id)!.push(t);
      }
    }
    return map;
  }, [members, tasks]);

  const salaryById = useMemo(() => new Map(members.map((m) => [m.id, m.salary])), [members]);

  const stats = useMemo(() => {
    let monthly = 0;
    let allocatedCost = 0;
    for (const m of members) monthly += m.salary;
    for (const t of tasks) allocatedCost += taskLaborCost(t, salaryById);
    return { monthly, allocatedCost };
  }, [members, tasks, salaryById]);

  const openNew = () => { setError(''); setForm({ ...EMPTY }); };
  const openEdit = (m: Member) => {
    setError('');
    setForm({ id: m.id, name: m.name, email: m.email, role: m.role, salary: String(m.salary) });
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form) return;
    if (!form.name.trim()) { setError('Nama wajib diisi.'); return; }
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      setError('Format email tidak valid.');
      return;
    }
    const data = {
      name: form.name.trim(),
      email: form.email.trim(),
      role: form.role.trim() || 'Anggota',
      salary: Math.max(0, Number(form.salary) || 0),
    };
    if (form.id) onUpdate(form.id, data);
    else onAdd({ id: uid('m'), ...data });
    setForm(null);
  };

  return (
    <div className="page">
      <div className="toolbar">
        <div>
          <h2>Manajemen Sumber Daya</h2>
          <p className="muted">Daftarkan anggota tim dan alokasikan ke tugas melalui form tugas.</p>
        </div>
        <div className="spacer" />
        <button type="button" className="btn btn-primary" onClick={openNew}>+ Anggota Tim</button>
      </div>

      <div className="stat-grid">
        <div className="stat-card">
          <span className="stat-label">Total Anggota</span>
          <span className="stat-value">{members.length}</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Total Gaji / Bulan</span>
          <span className="stat-value">{formatIDR(stats.monthly)}</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Estimasi Biaya Tenaga Kerja Proyek</span>
          <span className="stat-value">{formatIDR(stats.allocatedCost)}</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Tugas Ter-alokasi</span>
          <span className="stat-value">
            {tasks.filter((t) => t.assignees.length > 0).length} / {tasks.length}
          </span>
        </div>
      </div>

      {members.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">👥</div>
          <h3>Belum ada anggota tim</h3>
          <p>Tambahkan anggota untuk mengalokasikannya ke tugas proyek.</p>
          <button type="button" className="btn btn-primary" onClick={openNew}>+ Anggota Tim</button>
        </div>
      ) : (
        <div className="card">
          <table className="table">
            <thead>
              <tr>
                <th>Nama</th>
                <th>Email</th>
                <th>Peran</th>
                <th className="num">Gaji / Bulan</th>
                <th className="num">Biaya / Hari</th>
                <th>Alokasi Tugas</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {members.map((m) => {
                const list = allocations.get(m.id) || [];
                return (
                  <tr key={m.id}>
                    <td>
                      <div className="member-cell">
                        <span className="avatar lg">{m.name.charAt(0).toUpperCase()}</span>
                        <strong>{m.name}</strong>
                      </div>
                    </td>
                    <td className="muted">{m.email || '—'}</td>
                    <td><span className="badge">{m.role}</span></td>
                    <td className="num">{formatIDR(m.salary)}</td>
                    <td className="num muted">{formatIDR(Math.round(m.salary / 22))}</td>
                    <td>
                      <div className="chip-row">
                        {list.length === 0 && <span className="muted small">Belum dialokasikan</span>}
                        {list.map((t) => (
                          <button
                            key={t.id}
                            type="button"
                            className="chip"
                            style={{ borderColor: t.color }}
                            onClick={() => onOpenTask(t)}
                            title={`${t.name} · ${t.duration} hari kerja · ${formatDateID(scheduleDate(tasks, t))}`}
                          >
                            <span className="chip-dot" style={{ background: t.color }} />
                            {t.name}
                          </button>
                        ))}
                      </div>
                    </td>
                    <td className="row-actions">
                      <button type="button" className="icon-btn" title="Edit" onClick={() => openEdit(m)}>✎</button>
                      <button
                        type="button"
                        className="icon-btn danger"
                        title="Hapus"
                        onClick={() => {
                          if (window.confirm(`Hapus anggota "${m.name}"? Alokasinya akan dilepas dari semua tugas.`)) {
                            onDelete(m.id);
                          }
                        }}
                      >
                        🗑
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {form && (
        <Modal
          title={form.id ? 'Edit Anggota' : 'Tambah Anggota Tim'}
          onClose={() => setForm(null)}
          footer={
            <div className="modal-foot-row">
              <div className="spacer" />
              <button type="button" className="btn btn-ghost" onClick={() => setForm(null)}>Batal</button>
              <button type="submit" form="member-form" className="btn btn-primary">
                {form.id ? 'Simpan' : 'Tambah'}
              </button>
            </div>
          }
        >
          <form id="member-form" className="form" onSubmit={submit}>
            {error && <div className="alert alert-error">{error}</div>}
            <div className="field">
              <label htmlFor="m-name">Nama Lengkap *</label>
              <input id="m-name" value={form.name} autoFocus
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="mis. John Doe" />
            </div>
            <div className="field">
              <label htmlFor="m-email">Email</label>
              <input id="m-email" type="email" value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="nama@perusahaan.id" />
            </div>
            <div className="field">
              <label htmlFor="m-role">Peran</label>
              <input id="m-role" value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value })}
                placeholder="mis. Frontend Developer" />
            </div>
            <div className="field">
              <label htmlFor="m-salary">Gaji / Bulan (Rp) *</label>
              <input id="m-salary" type="number" min={0} step={100000} value={form.salary}
                onChange={(e) => setForm({ ...form, salary: e.target.value })}
                placeholder="12000000" />
              <span className="hint">Biaya harian dihitung: gaji ÷ 22 hari kerja.</span>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

/** Tanggal mulai tugas dari data mentah (untuk tooltip chip). */
function scheduleDate(tasks: Task[], task: Task): Date {
  const d = task.startDate.split('-').map(Number);
  return new Date(d[0], (d[1] || 1) - 1, d[2] || 1);
}
