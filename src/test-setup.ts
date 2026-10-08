/**
 * Setup test: Node 25 mengekspor global `localStorage` yang tidak lengkap
 * (tanpa getItem/setItem/clear) dan menimpa storage milik jsdom.
 * Kita ganti dengan implementasi in-memory sederhana agar aplikasi & tes
 * memakai localStorage yang benar-benar berfungsi.
 */
class MemoryStorage {
  private map = new Map<string, string>();

  get length(): number {
    return this.map.size;
  }

  clear(): void {
    this.map.clear();
  }

  getItem(key: string): string | null {
    return this.map.has(String(key)) ? this.map.get(String(key))! : null;
  }

  setItem(key: string, value: string): void {
    this.map.set(String(key), String(value));
  }

  removeItem(key: string): void {
    this.map.delete(String(key));
  }

  key(index: number): string | null {
    return [...this.map.keys()][index] ?? null;
  }
}

const storage = new MemoryStorage();

Object.defineProperty(globalThis, 'localStorage', {
  value: storage,
  configurable: true,
  writable: true,
});

try {
  Object.defineProperty(window, 'localStorage', {
    value: storage,
    configurable: true,
    writable: true,
  });
} catch {
  // bila window tidak tersedia, global sudah cukup
}
