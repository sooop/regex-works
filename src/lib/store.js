export function debounce(fn, ms) { let t; const f = (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; f.flush = (...a) => { clearTimeout(t); fn(...a); }; f.cancel = () => clearTimeout(t); return f; }
export function uid() { return Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-3); }
export function hashStr(s) { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); }
/* ---------- 저장소: IndexedDB → localStorage → 메모리 ---------- */
export const Store = {
  mode: 'memory', db: null, mem: new Map(),
  async init() {
    try {
      this.db = await new Promise((res, rej) => {
        const r = indexedDB.open('regex-bench', 1);
        r.onupgradeneeded = () => r.result.createObjectStore('kv');
        r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); r.onblocked = () => rej(new Error('blocked'));
      });
      this.mode = 'idb'; return;
    } catch (e) { this.db = null; }
    try { localStorage.setItem('__rb', '1'); localStorage.removeItem('__rb'); this.mode = 'ls'; } catch (e) { this.mode = 'memory'; }
  },
  async get(k, dflt) {
    try {
      if (this.mode === 'idb') {
        const v = await new Promise((res, rej) => { const r = this.db.transaction('kv').objectStore('kv').get(k); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
        return v === undefined ? dflt : v;
      }
      if (this.mode === 'ls') { const v = localStorage.getItem('rb:' + k); return v == null ? dflt : JSON.parse(v); }
    } catch (e) {}
    return this.mem.has(k) ? this.mem.get(k) : dflt;
  },
  async set(k, v) {
    this.mem.set(k, v);
    try {
      if (this.mode === 'idb') {
        await new Promise((res, rej) => { const tx = this.db.transaction('kv', 'readwrite'); tx.objectStore('kv').put(v, k); tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
      } else if (this.mode === 'ls') localStorage.setItem('rb:' + k, JSON.stringify(v));
    } catch (e) { if (this.onFail) this.onFail(); }
  }
};
export const Pref = {
  get(k, dflt) { try { const v = localStorage.getItem('regexbench.' + k); return v == null ? dflt : JSON.parse(v); } catch (e) { return dflt; } },
  set(k, v) { try { localStorage.setItem('regexbench.' + k, JSON.stringify(v)); } catch (e) {} }
};
