// Persistence. Settings, days and spend live in localStorage; reps and recordings in IndexedDB.
// Nothing leaves this device except the transcripts sent to Claude when the coach is on.

const P = 'speak.v1.';

export const ls = {
  get(k, d) { try { const v = localStorage.getItem(P + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(P + k, JSON.stringify(v)); return true; } catch { return false; } },
  del(k) { try { localStorage.removeItem(P + k); } catch { /* ignore */ } },
};

export const DEFAULT_SETTINGS = {
  name: '',
  about: '',
  sessionLength: 'standard', // quick | standard | deep
  lang: 'en-IN',
  capture: 'auto',            // auto | both | transcript | audio
  keepAudio: 30,              // recordings kept on this device
  model: 'claude-opus-5-5',
  effort: 'medium',
  ritual: true,
  theme: 'system',
  onboarded: false,
};

export function loadSettings() { return { ...DEFAULT_SETTINGS, ...ls.get('settings', {}) }; }
export function saveSettings(s) { ls.set('settings', s); }

export function getKey() { try { return localStorage.getItem(P + 'key') || ''; } catch { return ''; } }
export function setKey(k) { try { if (k) localStorage.setItem(P + 'key', k); else localStorage.removeItem(P + 'key'); } catch { /* ignore */ } }

// ---- IndexedDB -------------------------------------------------------------------------------
let dbp = null;
function db() {
  if (dbp) return dbp;
  dbp = new Promise((resolve) => {
    if (!('indexedDB' in window)) return resolve(null);
    let req;
    try { req = indexedDB.open('speak', 1); } catch { return resolve(null); }
    req.onupgradeneeded = () => {
      const d = req.result;
      if (!d.objectStoreNames.contains('reps')) d.createObjectStore('reps', { keyPath: 'id' });
      if (!d.objectStoreNames.contains('audio')) d.createObjectStore('audio', { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
    req.onblocked = () => resolve(null);
  });
  return dbp;
}

function tx(store, mode, fn) {
  return db().then((d) => new Promise((resolve, reject) => {
    if (!d) return resolve(undefined);
    const t = d.transaction(store, mode);
    const s = t.objectStore(store);
    let out;
    Promise.resolve(fn(s)).then((r) => { out = r; });
    t.oncomplete = () => resolve(out);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  }));
}
const reqP = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

// Reps fall back to localStorage when IndexedDB is unavailable (some private modes).
export async function loadReps() {
  const d = await db();
  if (!d) return ls.get('reps', []);
  const all = await tx('reps', 'readonly', (s) => reqP(s.getAll()));
  return (all || []).sort((a, b) => a.ts - b.ts);
}
export async function saveRep(rep) {
  const d = await db();
  if (!d) { const all = ls.get('reps', []).filter((r) => r.id !== rep.id); all.push(rep); ls.set('reps', all.slice(-400)); return; }
  await tx('reps', 'readwrite', (s) => s.put(rep));
}
export async function deleteRep(id) {
  const d = await db();
  if (!d) { ls.set('reps', ls.get('reps', []).filter((r) => r.id !== id)); return; }
  await tx('reps', 'readwrite', (s) => s.delete(id));
  await tx('audio', 'readwrite', (s) => s.delete(id));
}

export async function saveAudio(id, blob, mime, keep = 30) {
  if (!keep) return false;
  const d = await db();
  if (!d) return false;
  try {
    await tx('audio', 'readwrite', (s) => s.put({ id, blob, mime, ts: Date.now() }));
    // Keep the newest N. Ids start with a base-36 timestamp, so key order is time order,
    // and pruning never has to load the recordings themselves.
    const keys = (await tx('audio', 'readonly', (s) => reqP(s.getAllKeys()))) || [];
    const old = keys.slice(0, Math.max(0, keys.length - keep));
    if (old.length) await tx('audio', 'readwrite', (s) => { old.forEach((k) => s.delete(k)); });
    return true;
  } catch { return false; }
}
export async function getAudio(id) {
  const d = await db();
  if (!d) return null;
  try { return await tx('audio', 'readonly', (s) => reqP(s.get(id))); } catch { return null; }
}
export async function audioIds() {
  const d = await db();
  if (!d) return new Set();
  try { return new Set(await tx('audio', 'readonly', (s) => reqP(s.getAllKeys()))); } catch { return new Set(); }
}

// ---- Backup ----------------------------------------------------------------------------------
export async function exportData() {
  return {
    app: 'speak', version: 1, exported: new Date().toISOString(),
    settings: loadSettings(), days: ls.get('days', {}), usage: ls.get('usage', {}),
    wordsUsed: ls.get('wordsUsed', {}), reps: await loadReps(),
  };
}
export async function importData(data) {
  if (!data || data.app !== 'speak' || !Array.isArray(data.reps)) throw new Error('That file isn\'t a Speak backup.');
  saveSettings({ ...loadSettings(), ...data.settings, onboarded: true });
  ls.set('days', { ...ls.get('days', {}), ...(data.days || {}) });
  ls.set('usage', { ...ls.get('usage', {}), ...(data.usage || {}) });
  ls.set('wordsUsed', { ...ls.get('wordsUsed', {}), ...(data.wordsUsed || {}) });
  for (const r of data.reps) await saveRep(r);
  return data.reps.length;
}
export async function resetAll() {
  const d = await db();
  if (d) { d.close(); dbp = null; await new Promise((r) => { const q = indexedDB.deleteDatabase('speak'); q.onsuccess = q.onerror = q.onblocked = () => r(); }); }
  try { Object.keys(localStorage).filter((k) => k.startsWith(P)).forEach((k) => localStorage.removeItem(k)); } catch { /* ignore */ }
}

export function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
export function dayKey(d = new Date()) {
  const z = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
}
