// App state shared by every view, plus the small write-through helpers that keep it persisted.
import * as store from './store.js';

export const S = {
  settings: store.loadSettings(),
  reps: [],
  days: store.ls.get('days', {}),
  usage: store.ls.get('usage', {}),
  wordsUsed: store.ls.get('wordsUsed', {}),
  audio: new Set(),
  ready: false,
};

export async function loadState() {
  S.reps = await store.loadReps();
  S.audio = await store.audioIds();
  S.ready = true;
}

export const today = () => store.dayKey();
export const repById = (id) => S.reps.find((r) => r.id === id);
export const children = (id) => S.reps.filter((r) => r.parent === id);

export function saveSettings(patch) {
  Object.assign(S.settings, patch);
  store.saveSettings(S.settings);
}
export function saveDays() { store.ls.set('days', S.days); }
export function saveWords() { store.ls.set('wordsUsed', S.wordsUsed); }

export async function putRep(rep) {
  const i = S.reps.findIndex((r) => r.id === rep.id);
  if (i >= 0) S.reps[i] = rep; else S.reps.push(rep);
  await store.saveRep(rep);
}

export async function removeRep(id) {
  S.reps = S.reps.filter((r) => r.id !== id);
  S.audio.delete(id);
  await store.deleteRep(id);
}

export function addUsage(cost, usage) {
  const m = new Date().toISOString().slice(0, 7);
  const u = S.usage[m] || { calls: 0, usd: 0, inTok: 0, outTok: 0 };
  u.calls++;
  u.usd = Math.round((u.usd + (cost || 0)) * 10000) / 10000;
  if (usage) { u.inTok += (usage.input_tokens || 0) + (usage.cache_read_input_tokens || 0) + (usage.cache_creation_input_tokens || 0); u.outTok += usage.output_tokens || 0; }
  S.usage[m] = u;
  store.ls.set('usage', S.usage);
}

export function monthUsage() {
  return S.usage[new Date().toISOString().slice(0, 7)] || { calls: 0, usd: 0 };
}

export function go(hash) {
  if (location.hash === hash) window.dispatchEvent(new HashChangeEvent('hashchange'));
  else location.hash = hash;
}
