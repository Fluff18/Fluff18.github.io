// What to practise today: the 4-week foundation, then an adaptive mix aimed at your weakest skill.
import { DRILLS, PROGRAM, WARMUPS, SKILLS, WORDS } from './content.js';
import { dayKey } from './store.js';

const DIMS = ['clarity', 'structure', 'concision', 'confidence', 'precision'];

export function doneDays(days) {
  return Object.keys(days).filter((k) => days[k] && days[k].done).sort();
}

// Any practice keeps the streak alive; only finishing the daily plan advances the program.
export function practiceDays(days) {
  return Object.keys(days).filter((k) => days[k] && (days[k].done || days[k].reps > 0)).sort();
}

export function streak(days, today = dayKey()) {
  const done = new Set(practiceDays(days));
  const back = (k, n) => { const d = new Date(k + 'T12:00:00'); d.setDate(d.getDate() - n); return dayKey(d); };
  let cur = 0;
  let k = done.has(today) ? today : back(today, 1);
  while (done.has(k)) { cur++; k = back(k, 1); }
  let best = 0, run = 0, prev = null;
  for (const d of practiceDays(days)) {
    run = prev && back(d, 1) === prev ? run + 1 : 1;
    best = Math.max(best, run);
    prev = d;
  }
  return { current: cur, best: Math.max(best, cur), total: done.size, todayDone: done.has(today) };
}

// Day number in the program counts practice days, not calendar days: a missed day never skips content.
export function programIndex(days, today = dayKey()) {
  return doneDays(days).filter((k) => k < today).length;
}

const recent = (reps, drillId, n = 50) => reps.filter((r) => r.drill === drillId).slice(-n);

export function lastPractised(reps, drillId) {
  const r = recent(reps, drillId, 1)[0];
  return r ? r.ts : 0;
}

// Average coach scores across recent reps, and filler rate.
export function skillProfile(reps, n = 20) {
  const scored = reps.filter((r) => r.ai && r.ai.feedback && r.ai.feedback.scores).slice(-n);
  const prof = {};
  for (const d of DIMS) {
    const vals = scored.map((r) => r.ai.feedback.scores[d]).filter((v) => typeof v === 'number');
    prof[d] = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  }
  const withM = reps.filter((r) => r.metrics && r.metrics.words >= 15).slice(-n);
  prof.fillerPerMin = withM.length ? withM.reduce((a, r) => a + (r.metrics.fillerPerMin || 0), 0) / withM.length : null;
  prof.samples = scored.length;
  return prof;
}

export function weakestSkill(reps) {
  const p = skillProfile(reps);
  let worst = null;
  for (const d of DIMS) if (p[d] != null && (worst == null || p[d] < p[worst])) worst = d;
  if (p.fillerPerMin != null && p.fillerPerMin >= 3 && (worst == null || p[worst] >= 6)) return 'fluency';
  return worst || 'structure';
}

function adaptiveDay(reps, n) {
  const weak = weakestSkill(reps);
  const byAge = (ids) => ids.slice().sort((a, b) => lastPractised(reps, a) - lastPractised(reps, b));
  const main = byAge(SKILLS[weak].drills)[0];
  const warms = WARMUPS.filter((w) => w !== main);
  const warm = warms[n % warms.length] || 'clean';
  const pool = Object.keys(DRILLS).filter((d) => d !== 'rehearse' && d !== main && d !== warm);
  const bonus = byAge(pool)[0];
  return { main, warm, bonus, weak };
}

export function today(state, todayKey = dayKey()) {
  const saved = state.days[todayKey] && state.days[todayKey].plan;
  if (saved) return saved;
  const idx = programIndex(state.days, todayKey);
  let p;
  if (idx < 28) {
    const wk = PROGRAM[Math.floor(idx / 7)];
    const d = wk.days[idx % 7];
    p = { ...d, week: Math.floor(idx / 7) + 1, day: idx + 1, theme: wk.theme, goal: wk.goal };
  } else {
    const a = adaptiveDay(state.reps, idx);
    p = { ...a, week: Math.floor(idx / 7) + 1, day: idx + 1, theme: 'Sharpen your weakest skill', goal: `Focus: ${SKILLS[a.weak].label.toLowerCase()}, based on your recent scores.` };
    if ((idx + 1) % 28 === 0) { p.main = 'intro'; p.note = 'Monthly benchmark: compare this "Tell me about yourself" with your earlier ones in Progress.'; }
  }
  return p;
}

export function steps(p, length = 'standard') {
  const out = [];
  if (length !== 'quick' && p.warm) out.push({ role: 'warm', drill: p.warm });
  out.push({ role: 'main', drill: p.main });
  if (length === 'deep' && p.bonus) out.push({ role: 'bonus', drill: p.bonus });
  return out;
}

export function estimateMinutes(list) {
  return Math.round(list.reduce((sum, s) => {
    const d = DRILLS[s.drill];
    const speak = d.passes ? d.passes.reduce((a, b) => a + b, 0) : d.speak;
    const once = (d.think + speak) / 60 + 1.2; // plus reading feedback
    return sum + (s.role === 'warm' ? once : once * 1.9); // main and bonus include a redo
  }, 0));
}

// Prompt rotation: avoid the ones used recently for this drill.
export function pickPrompt(drillId, reps, exclude = -1) {
  const list = DRILLS[drillId].prompts;
  if (!list.length) return { text: '', idx: -1 };
  const used = new Set(recent(reps, drillId, Math.max(1, list.length - 3)).map((r) => r.promptIdx));
  let pool = list.map((_, i) => i).filter((i) => !used.has(i) && i !== exclude);
  if (!pool.length) pool = list.map((_, i) => i).filter((i) => i !== exclude);
  const idx = pool[Math.floor(Math.random() * pool.length)];
  return { text: list[idx], idx };
}

// Least-practised words first, with a little randomness.
export function pickWords(wordsUsed = {}, n = 3) {
  return WORDS.map((w) => ({ w, k: (wordsUsed[w[0]] || 0) + Math.random() * 0.9 }))
    .sort((a, b) => a.k - b.k).slice(0, n).map((x) => x.w);
}

// Think time shrinks as a drill gets familiar: planning faster is part of the skill.
export function thinkTime(drillId, reps, attempt = 1) {
  const base = DRILLS[drillId].think;
  const n = recent(reps, drillId).filter((r) => (r.attempt || 1) === 1).length;
  let t = base;
  if (n >= 8) t = Math.round(base * 0.5);
  else if (n >= 4) t = Math.round(base * 0.75);
  if (attempt > 1) t = Math.round(t * 0.6);
  return Math.max(5, t);
}

export function lessonSeen(reps, drillId) {
  return reps.some((r) => r.drill === drillId);
}
