import React, { useMemo, useState } from 'react';
import type { CalendarConfig, Holiday } from '../types';
import {
  BULAN_PANJANG,
  HARI_PANJANG,
  addDays,
  formatDateID,
  holidayOf,
  isWeekend,
  isWorkingDay,
  parseISO,
  toISO,
  todayISO,
} from '../lib/date';
import { uid } from '../store';

interface Props {
  calendar: CalendarConfig;
  onSetWeekend: (days: number[]) => void;
  onAddHoliday: (h: Holiday) => void;
  onDeleteHoliday: (id: string) => void;
  /** total tugas yang terdampak jika hari libur dihapus — info saja */
  workingStats: { total: number; working: number };
}

export function CalendarView({ calendar, onSetWeekend, onAddHoliday, onDeleteHoliday, workingStats }: Props) {
  const [cursor, setCursor] = useState(() => {
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), 1);
  });
  const [hDate, setHDate] = useState(todayISO());
  const [hName, setHName] = useState('');
  const [error, setError] = useState('');

  const toggleWeekend = (day: number) => {
    const has = calendar.weekendDays.includes(day);
    const next = has
      ? calendar.weekendDays.filter((d) => d !== day)
      : [...calendar.weekendDays, day];
    onSetWeekend(next);
  };

  const addHoliday = (e: React.FormEvent) => {
    e.preventDefault();
    if (!hDate) { setError('Tanggal wajib diisi.'); return; }
    if (!hName.trim()) { setError('Nama hari libur wajib diisi.'); return; }
    onAddHoliday({ id: uid('h'), date: hDate, name: hName.trim() });
    setHName('');
    setError('');
  };

  const grid = useMemo(() => {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const startPad = first.getDay(); // 0 = Minggu
    const daysInMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
    const cells: (Date | null)[] = [];
    for (let i = 0; i < startPad; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(cursor.getFullYear(), cursor.getMonth(), d));
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [cursor]);

  const monthStats = useMemo(() => {
    let weekend = 0;
    let holiday = 0;
    for (const c of grid) {
      if (!c) continue;
      if (isWeekend(c, calendar)) weekend++;
      else if (holidayOf(c, calendar)) holiday++;
    }
    return { weekend, holiday };
  }, [grid, calendar]);

  const shiftMonth = (n: number) =>
    setCursor((c) => new Date(c.getFullYear(), c.getMonth() + n, 1));

  return (
    <div className="page">
      <div className="toolbar">
        <div>
          <h2>Kalender Proyek</h2>
          <p className="muted">Atur akhir pekan dan hari libur khusus — seluruh jadwal dihitung dalam hari kerja.</p>
        </div>
      </div>

      <div className="calendar-layout">
        <div className="calendar-left">
          <div className="card">
            <h3 className="card-title">Pengaturan Akhir Pekan</h3>
            <p className="muted small">Pilih hari yang dianggap tidak bekerja.</p>
            <div className="weekend-grid">
              {HARI_PANJANG.map((name, idx) => (
                <label key={idx} className={`weekend-chip ${calendar.weekendDays.includes(idx) ? 'active' : ''}`}>
                  <input
                    type="checkbox"
                    checked={calendar.weekendDays.includes(idx)}
                    onChange={() => toggleWeekend(idx)}
                  />
                  <span>{name}</span>
                </label>
              ))}
            </div>
            <div className="hint">
              Aktif: {calendar.weekendDays.length === 0 ? 'tanpa akhir pekan' : calendar.weekendDays.map((d) => HARI_PANJANG[d]).join(', ')}
            </div>
          </div>

          <div className="card">
            <h3 className="card-title">Tambah Hari Libur Khusus</h3>
            <form className="holiday-form" onSubmit={addHoliday}>
              {error && <div className="alert alert-error">{error}</div>}
              <div className="field">
                <label htmlFor="h-date">Tanggal</label>
                <input id="h-date" type="date" value={hDate} onChange={(e) => setHDate(e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="h-name">Nama Hari Libur</label>
                <input
                  id="h-name"
                  value={hName}
                  onChange={(e) => setHName(e.target.value)}
                  placeholder="mis. Cuti Bersama"
                />
              </div>
              <button type="submit" className="btn btn-primary">+ Tambah</button>
            </form>

            <h4 className="sub-title">Daftar Hari Libur ({calendar.holidays.length})</h4>
            {calendar.holidays.length === 0 ? (
              <div className="muted small">Belum ada hari libur khusus.</div>
            ) : (
              <ul className="holiday-list">
                {[...calendar.holidays]
                  .sort((a, b) => a.date.localeCompare(b.date))
                  .map((h) => (
                    <li key={h.id}>
                      <span className="holiday-date">{formatDateID(parseISO(h.date))}</span>
                      <span className="holiday-name">{h.name}</span>
                      <button
                        type="button"
                        className="icon-btn danger"
                        title="Hapus hari libur"
                        onClick={() => onDeleteHoliday(h.id)}
                      >
                        🗑
                      </button>
                    </li>
                  ))}
              </ul>
            )}
          </div>

          <div className="card">
            <h3 className="card-title">Ringkasan</h3>
            <div className="mini-stats">
              <div><span>{workingStats.working}</span><label>Hari kerja terpakai</label></div>
              <div><span>{workingStats.total - workingStats.working}</span><label>Hari non-kerja</label></div>
              <div><span>{monthStats.weekend}</span><label>Akhir pekan (bulan ini)</label></div>
              <div><span>{monthStats.holiday}</span><label>Libur (bulan ini)</label></div>
            </div>
          </div>
        </div>

        <div className="card calendar-card">
          <div className="cal-nav">
            <button type="button" className="btn btn-ghost" onClick={() => shiftMonth(-1)}>‹ Sebelumnya</button>
            <h3>{BULAN_PANJANG[cursor.getMonth()]} {cursor.getFullYear()}</h3>
            <button type="button" className="btn btn-ghost" onClick={() => shiftMonth(1)}>Berikutnya ›</button>
          </div>
          <div className="cal-grid cal-head">
            {HARI_PANJANG.map((h) => (
              <div key={h} className="cal-weekday">{h.slice(0, 3)}</div>
            ))}
          </div>
          <div className="cal-grid">
            {grid.map((d, i) => {
              if (!d) return <div key={`p${i}`} className="cal-cell empty" />;
              const holiday = holidayOf(d, calendar);
              const weekend = isWeekend(d, calendar);
              const working = isWorkingDay(d, calendar);
              const isToday = toISO(d) === todayISO();
              return (
                <div
                  key={toISO(d)}
                  className={`cal-cell ${weekend ? 'weekend' : ''} ${holiday ? 'holiday' : ''} ${isToday ? 'today' : ''} ${working ? 'work' : ''}`}
                  title={holiday ? holiday.name : working ? 'Hari kerja' : 'Akhir pekan'}
                >
                  <span className="cal-num">{d.getDate()}</span>
                  {holiday && <span className="cal-holiday-name">{holiday.name}</span>}
                  {!holiday && !weekend && <span className="cal-dot" />}
                </div>
              );
            })}
          </div>
          <div className="cal-legend">
            <span><i className="sw work" /> Hari kerja</span>
            <span><i className="sw weekend" /> Akhir pekan</span>
            <span><i className="sw holiday" /> Hari libur</span>
          </div>
        </div>
      </div>
    </div>
  );
}
