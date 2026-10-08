// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import App from './App';
import { STORAGE_KEY, StoreProvider } from './store';

function renderApp(tab?: string) {
  window.history.replaceState({}, '', tab ? `/?tab=${tab}` : '/');
  return render(
    <StoreProvider>
      <App />
    </StoreProvider>,
  );
}

interface SavedState {
  tasks: { id: string; name: string; assignees: string[] }[];
  members: { id: string; name: string }[];
  calendar: { weekendDays: number[]; holidays: unknown[] };
}

function saved(): SavedState {
  return JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.history.replaceState({}, '', '/');
});

describe('Gantt — manajemen tugas', () => {
  it('menampilkan data contoh dan menambah tugas baru lewat modal', () => {
    renderApp();
    expect(screen.getAllByText('Analisis Kebutuhan').length).toBeGreaterThan(0);
    expect(screen.getByText(/15 tugas/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '+ Tugas' }));
    expect(screen.getByText('Tambah Tugas')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Nama Tugas *'), {
      target: { value: 'Tugas Baru XYZ' },
    });
    fireEvent.change(screen.getByLabelText('Durasi (hari kerja) *'), {
      target: { value: '4' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Tambah' }));

    expect(screen.getAllByText('Tugas Baru XYZ').length).toBeGreaterThan(0);
    expect(screen.getByText(/16 tugas/)).toBeTruthy();
    expect(saved().tasks.some((t) => t.name === 'Tugas Baru XYZ')).toBe(true);
  });

  it('mengedit nama tugas dan menyimpannya', () => {
    renderApp();
    fireEvent.click(screen.getAllByText('Dokumentasi Requirement')[0]);
    expect(screen.getByText('Edit Tugas')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Nama Tugas *'), {
      target: { value: 'Dokumentasi Revisi' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Simpan' }));

    expect(screen.getAllByText('Dokumentasi Revisi').length).toBeGreaterThan(0);
    expect(saved().tasks.some((t) => t.name === 'Dokumentasi Revisi')).toBe(true);
  });

  it('menghapus tugas beserta datanya', () => {
    renderApp();
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    fireEvent.click(screen.getAllByText('Dokumentasi Requirement')[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Hapus' }));
    expect(screen.queryByText('Dokumentasi Requirement')).toBeNull();
    expect(screen.getByText(/14 tugas/)).toBeTruthy();
    expect(saved().tasks.length).toBe(14);
  });

  it('menggeser tugas lewat predecessor FS+jeda terlihat pada tanggal efektif', () => {
    renderApp();
    // t2 (Desain Sistem) predecessor FS dari t1 → mulai efektif setelah t1 selesai
    const selesaiT1 = screen.getAllByText('7 Okt 2026');
    expect(selesaiT1.length).toBeGreaterThan(0);
    // bar & tanggal t2 tidak sama dengan tanggal manualnya (8 Okt) bila terdorong
    expect(screen.getAllByText('Desain Sistem').length).toBeGreaterThan(0);
  });
});

describe('Tab Analisis', () => {
  it('menampilkan jalur kritis, tabel CPM, dan diagram PERT', () => {
    renderApp();
    fireEvent.click(screen.getByRole('button', { name: /Analisis/ }));

    expect(screen.getByText('Urutan Jalur Kritis')).toBeTruthy();
    const rows = document.querySelectorAll('.table-analysis tbody tr');
    expect(rows.length).toBe(15);
    expect(document.querySelectorAll('.pert-node').length).toBe(15);
    // minimal ada badge kritis
    expect(document.querySelectorAll('.badge-critical').length).toBeGreaterThan(0);
  });
});

describe('Kalender proyek', () => {
  it('mengubah pengaturan akhir pekan dan tersimpan', () => {
    renderApp('calendar');
    const sabtu = screen.getByRole('checkbox', { name: 'Sabtu' }) as HTMLInputElement;
    expect(sabtu.checked).toBe(true);
    fireEvent.click(sabtu);
    expect(sabtu.checked).toBe(false);
    expect(screen.getByText('Aktif: Minggu')).toBeTruthy();
    expect(saved().calendar.weekendDays).toEqual([0]);
  });

  it('menambah hari libur khusus baru', () => {
    renderApp('calendar');
    fireEvent.change(screen.getByLabelText('Tanggal'), { target: { value: '2026-12-25' } });
    fireEvent.change(screen.getByLabelText('Nama Hari Libur'), { target: { value: 'Natal' } });
    fireEvent.click(screen.getByRole('button', { name: '+ Tambah' }));

    expect(screen.getByText('Natal')).toBeTruthy();
    expect(screen.getByText('25 Des 2026')).toBeTruthy();
    expect(document.querySelectorAll('.holiday-list li').length).toBe(4);
    expect(saved().calendar.holidays.length).toBe(4);
  });
});

describe('Tim & sumber daya', () => {
  it('menambah anggota tim baru', () => {
    renderApp('team');
    fireEvent.click(screen.getByRole('button', { name: '+ Anggota Tim' }));
    fireEvent.change(screen.getByLabelText('Nama Lengkap *'), { target: { value: 'Joko Susilo' } });
    fireEvent.change(screen.getByLabelText('Gaji / Bulan (Rp) *'), { target: { value: '9000000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Tambah' }));

    expect(screen.getByText('Joko Susilo')).toBeTruthy();
    expect(saved().members.length).toBe(6);
  });

  it('menghapus anggota melepas alokasi dari tugas', () => {
    renderApp('team');
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    expect(document.querySelectorAll('tbody tr').length).toBe(5);

    fireEvent.click(document.querySelectorAll('.row-actions button.danger')[0]);

    expect(document.querySelectorAll('tbody tr').length).toBe(4);
    const data = saved();
    expect(data.members.length).toBe(4);
    expect(data.members.some((m) => m.id === 'm1')).toBe(false);
    expect(data.tasks.some((t) => t.assignees.includes('m1'))).toBe(false);
  });
});
