// Speak: daily speaking reps. Router and the non-session views.
import { DRILLS, DRILL_ORDER, SKILLS, PLAYBOOK, WORDS } from './content.js';
import { personalCrutches } from './analyze.js';
import { platform, resolveMode, MODE_LABEL, deviceFlags, setDeviceFlag, Capture, ISSUE_TEXT } from './audio.js';
import { MODELS, testKey } from './coach.js';
import * as store from './store.js';
import * as plan from './plan.js';
import { lineChart, heatmap } from './charts.js';
import { S, loadState, today, repById, saveSettings, go, removeRep, monthUsage } from './state.js';
import { esc, $, on, bindActions, toast, icon, fmtSec, fmtDay, fmtTime, greeting, plural, usd, download } from './ui.js';
import * as session from './session.js';

const TABS = [['today', 'Today', 'today'], ['practice', 'Practice', 'mic'], ['progress', 'Progress', 'chart'], ['learn', 'Learn', 'book']];
const ROLE = { warm: 'Warm-up', main: 'Main', bonus: 'Bonus' };
const DIMS = ['clarity', 'structure', 'concision', 'confidence', 'precision'];
const ui = { detailEdit: null, keyTesting: false, micTest: null };

function route() {
  const h = location.hash.replace(/^#\/?/, '');
  const [name, ...rest] = h.split('/');
  return { name: name || 'today', arg: decodeURIComponent(rest.join('/')) };
}

function applyTheme() {
  const t = S.settings.theme;
  if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
  else delete document.documentElement.dataset.theme;
}

function topbar(title = '') {
  return `<header class="top">
    <a class="brand" href="#/today"><span class="logo" aria-hidden="true">${icon('wave', 18)}</span><span>Speak</span></a>
    <span class="top-title">${esc(title)}</span>
    <a class="icon-btn" href="#/settings" aria-label="Settings">${icon('gear', 22)}</a>
  </header>`;
}

function renderTabs(active) {
  const nav = document.getElementById('tabs');
  nav.innerHTML = TABS.map(([id, label, ic]) => `<a href="#/${id}" class="${active === id ? 'on' : ''}" ${active === id ? 'aria-current="page"' : ''}>${icon(ic, 22)}<span>${label}</span></a>`).join('');
}

export function render() {
  const r = route();
  const view = document.getElementById('view');
  if (!S.settings.onboarded && r.name !== 'welcome' && r.name !== 'learn') { go('#/welcome'); return; }
  const run = session.activeRun();
  if (r.name !== 'session' && run && run.cap) { run.cap.cancel(); run.cap = null; run.phase = 'brief'; }
  if (r.name !== 'session' && r.name !== 'rep') session.stopPlayer();
  document.body.dataset.view = r.name;
  renderTabs(r.name === 'rep' ? 'progress' : r.name);
  switch (r.name) {
    case 'session':
      if (!run) { go('#/today'); return; }
      session.render();
      return;
    case 'practice': view.innerHTML = topbar() + practiceView(); break;
    case 'progress': view.innerHTML = topbar() + progressView(); mountCharts(); break;
    case 'rep': view.innerHTML = topbar() + repView(r.arg); session.prepPlayer(r.arg); break;
    case 'learn': view.innerHTML = topbar() + learnView(r.arg); break;
    case 'settings': view.innerHTML = topbar() + settingsView(); if (r.arg) setTimeout(() => { const t = document.getElementById('set-' + r.arg); if (t) t.scrollIntoView({ block: 'start' }); }, 30); break;
    case 'welcome': view.innerHTML = welcomeView(); break;
    default: view.innerHTML = topbar() + todayView();
  }
  if (r.name !== 'settings' || !r.arg) window.scrollTo(0, 0);
}

// ---------- Today -----------------------------------------------------------------------------
function weekDots() {
  const now = new Date(); now.setHours(12, 0, 0, 0);
  const dow = (now.getDay() + 6) % 7;
  const out = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(now); d.setDate(now.getDate() - dow + i);
    const k = store.dayKey(d);
    const rec = S.days[k];
    const did = rec && (rec.done || rec.reps > 0);
    out.push(`<span class="wd ${did ? 'on' : ''} ${k === today() ? 'today' : ''} ${d > now ? 'future' : ''}" title="${esc(fmtDay(k))}${did ? ': practised' : ''}"><i>${did ? icon('check', 14) : ''}</i><small>${'MTWTFSS'[i]}</small></span>`);
  }
  return out.join('');
}

function firstAttempts(days = 7) {
  const since = Date.now() - days * 864e5;
  return S.reps.filter((r) => (r.attempt || 1) === 1 && r.ts >= since);
}
const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
const round1 = (v) => (v == null ? null : Math.round(v * 10) / 10);

function tile(label, value, sub = '', deltaHTML = '') {
  return `<div class="tile"><span class="tile-l">${esc(label)}</span><span class="tile-v">${value == null ? '—' : esc(value)}</span><span class="tile-s">${deltaHTML}${esc(sub)}</span></div>`;
}

function deltaTag(cur, prev, lowerBetter = false, digits = 1) {
  if (cur == null || prev == null) return '';
  const d = Math.round((cur - prev) * Math.pow(10, digits)) / Math.pow(10, digits);
  if (!d) return '<em class="flat">±0</em> ';
  const good = lowerBetter ? d < 0 : d > 0;
  return `<em class="${good ? 'up' : 'down'}">${d > 0 ? '+' : '−'}${Math.abs(d)}</em> `;
}

function todayView() {
  const p = plan.today(S);
  const st = plan.streak(S.days);
  const steps = plan.steps(p, S.settings.sessionLength);
  const mins = plan.estimateMinutes(steps);
  const rec = S.days[today()] || {};
  const run = session.activeRun();
  const len = S.settings.sessionLength;
  const wk = firstAttempts(7), prev = S.reps.filter((r) => (r.attempt || 1) === 1 && r.ts < Date.now() - 7 * 864e5 && r.ts >= Date.now() - 14 * 864e5);
  const coachAvg = (list) => avg(list.filter((r) => r.ai && r.ai.feedback).map((r) => r.ai.feedback.scores.overall));
  const crispAvg = (list) => avg(list.filter((r) => r.metrics && r.metrics.crisp != null).map((r) => r.metrics.crisp));
  const fillAvg = (list) => avg(list.filter((r) => r.metrics && r.metrics.words >= 15).map((r) => r.metrics.fillerPerMin));
  const c1 = round1(coachAvg(wk)), c0 = round1(coachAvg(prev));
  const k1 = crispAvg(wk), k0 = crispAvg(prev);
  const f1 = round1(fillAvg(wk)), f0 = round1(fillAvg(prev));
  return `<section class="page">
    <p class="eyebrow">${esc(fmtDay(today()))}</p>
    <h1 class="h1">${esc(greeting(S.settings.name))}</h1>
    <div class="card streak">
      <div class="streak-n">${icon('flame', 30)}<b>${st.current}</b><span>day streak</span></div>
      <div class="week">${weekDots()}</div>
      <p class="muted small">Best ${st.best} · ${plural(st.total, 'practice day')}</p>
    </div>
    ${run && run.phase !== 'done' ? `<div class="card resume"><div><p class="eyebrow">In progress</p><p><b>${esc(DRILLS[run.steps[run.i].drill].name)}</b> · ${esc(ROLE[run.steps[run.i].role] || 'Practice')}</p></div><a class="btn primary" href="#/session">Resume</a></div>` : ''}
    <div class="card plan ${rec.done ? 'is-done' : ''}">
      <p class="eyebrow">Week ${p.week} · Day ${p.day}${p.day > 28 ? ' · adaptive' : ''}</p>
      <h2 class="h2">${esc(p.theme)}</h2>
      <p class="muted">${esc(p.goal)}</p>
      ${p.note ? `<p class="note">${icon('info', 16)}<span>${esc(p.note)}</span></p>` : ''}
      <ol class="plan-steps">${steps.map((s) => `<li><span class="role">${esc(ROLE[s.role])}</span><b>${esc(DRILLS[s.drill].name)}</b><span class="muted">${esc(DRILLS[s.drill].tagline)}</span></li>`).join('')}</ol>
      ${rec.done
        ? `<p class="done-line">${icon('check', 18)} Done for today. Your streak is safe.</p><div class="row gap wrap"><button class="btn ghost" data-act="start-daily">Run it again</button><a class="btn ghost" href="#/practice">Extra practice</a></div>`
        : `<button class="btn primary big" data-act="start-daily">Start today’s reps <small>about ${mins} min</small></button>`}
      <div class="seg" role="radiogroup" aria-label="Session length">${[['quick', 'Quick'], ['standard', 'Standard'], ['deep', 'Deep']].map(([v, l]) => `<button role="radio" aria-checked="${len === v}" class="${len === v ? 'on' : ''}" data-act="len" data-v="${v}">${l}</button>`).join('')}</div>
    </div>
    ${!store.getKey() ? `<div class="card cta">${icon('spark', 22)}<div><p><b>Turn on the AI coach</b></p><p class="muted small">Line-by-line feedback and a stronger version of every answer. Two-minute setup with your own Claude API key, or copy each prompt into Claude instead.</p></div><a class="btn small primary" href="#/settings/coach">Set up</a></div>` : ''}
    ${S.reps.length ? `<div class="tiles">
      ${tile('Coach score', c1 == null ? null : c1, 'last 7 days', deltaTag(c1, c0))}
      ${tile('Crispness', k1 == null ? null : Math.round(k1), 'last 7 days', deltaTag(k1 == null ? null : Math.round(k1), k0 == null ? null : Math.round(k0), false, 0))}
      ${tile('Fillers / min', f1, 'last 7 days', deltaTag(f1, f0, true))}
    </div>` : ''}
    <div class="quick">
      <button class="card quick-btn" data-act="free" data-id="rehearse">${icon('target', 22)}<span><b>Rehearse something real</b><small>Tomorrow’s update, an interview answer, a demo</small></span>${icon('chev', 18)}</button>
      <a class="card quick-btn" href="#/practice">${icon('mic', 22)}<span><b>Free practice</b><small>Any of the ${DRILL_ORDER.length - 1} drills</small></span>${icon('chev', 18)}</a>
    </div>
  </section>`;
}

// ---------- Practice ------------------------------------------------------------------------
function practiceView() {
  const card = (id) => {
    const d = DRILLS[id];
    const n = S.reps.filter((r) => r.drill === id && (r.attempt || 1) === 1).length;
    const t = d.passes ? d.passes.reduce((a, b) => a + b, 0) : d.speak;
    return `<button class="card drill" data-act="free" data-id="${id}">
      <span class="drill-top"><span class="tag">${esc((SKILLS[d.skill] || { label: '' }).label)}</span><span class="muted small">${fmtSec(t)}</span></span>
      <b>${esc(d.name)}</b><span class="muted small">${esc(d.tagline)}</span>
      <span class="muted small">${n ? plural(n, 'rep') : 'New'}</span>
    </button>`;
  };
  return `<section class="page">
    <h1 class="h1">Practice</h1>
    <p class="lede">Pick a drill. Every rep: plan, speak, get feedback, redo.</p>
    <button class="card feature" data-act="free" data-id="rehearse">${icon('target', 26)}<span><b>Rehearse It</b><small>${esc(DRILLS.rehearse.tagline)}</small></span>${icon('chev', 18)}</button>
    <div class="grid">${DRILL_ORDER.filter((id) => id !== 'rehearse').map(card).join('')}</div>
  </section>`;
}

// ---------- Progress ------------------------------------------------------------------------
function byDay(reps, pick) {
  const m = new Map();
  for (const r of reps) {
    const v = pick(r);
    if (v == null || Number.isNaN(v)) continue;
    if (!m.has(r.day)) m.set(r.day, []);
    m.get(r.day).push(v);
  }
  return [...m.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).slice(-45).map(([x, vs]) => ({ x, y: vs.reduce((a, b) => a + b, 0) / vs.length, n: vs.length }));
}

function progressView() {
  const st = plan.streak(S.days);
  const secs = S.reps.reduce((a, r) => a + (r.durationSec || 0), 0);
  const first = S.reps.filter((r) => (r.attempt || 1) === 1);
  const crutch = personalCrutches(first.slice(-30));
  const recent = (from, to) => first.filter((r) => r.ai && r.ai.feedback && r.ts >= Date.now() - from * 864e5 && r.ts < Date.now() - to * 864e5);
  const cur = recent(14, 0), old = recent(28, 14);
  const dimAvg = (list, k) => avg(list.map((r) => r.ai.feedback.scores[k]));
  const intro = first.filter((r) => r.drill === 'intro');
  const thenNow = intro.length >= 2 && intro[intro.length - 1].ts - intro[0].ts > 5 * 864e5 ? [intro[0], intro[intro.length - 1]] : null;
  const history = S.reps.slice(-60).reverse();
  const empty = !S.reps.length;
  return `<section class="page">
    <h1 class="h1">Progress</h1>
    ${empty ? `<div class="card"><p>Nothing here yet. Do your first rep and this fills up: scores, crutch words, and your “before and after”.</p><button class="btn primary" data-act="start-daily">Start today’s reps</button></div>` : ''}
    <div class="tiles four">
      ${tile('Streak', st.current, `best ${st.best}`)}
      ${tile('Practice days', st.total)}
      ${tile('Reps', S.reps.length)}
      ${tile('Time spoken', fmtSec(secs))}
    </div>
    <div class="card"><h3>Practice, last 12 weeks</h3><div id="heat"></div></div>
    <p class="muted small chart-note">Charts use first attempts only: how you sound cold, which is how you sound in real life.</p>
    <div class="charts">
      <div class="card"><h3>Coach score</h3><p class="muted small">Daily average, out of 10</p><div id="ch-score"></div></div>
      <div class="card"><h3>Crispness</h3><p class="muted small">Daily average, out of 100</p><div id="ch-crisp"></div></div>
      <div class="card"><h3>Fillers per minute</h3><p class="muted small">Lower is better. Browser transcripts miss most “um”s.</p><div id="ch-fill"></div></div>
      <div class="card"><h3>Pace</h3><p class="muted small">Words per minute. Shaded: 130–170, the comfortable range.</p><div id="ch-wpm"></div></div>
    </div>
    ${crutch.length ? `<div class="card"><h3>Your crutch words</h3><p class="muted small">From your last 30 first attempts. Pick the top one and hunt it this week.</p>
      <ol class="crutch">${crutch.map((c) => `<li><b>“${esc(c.term)}”</b><span class="muted">${c.n} times · ${c.per100} per 100 words · ${c.cat === 'hedge' ? 'hedge' : 'filler'}</span></li>`).join('')}</ol></div>` : ''}
    ${cur.length >= 2 ? `<div class="card"><h3>Skills</h3><p class="muted small">Coach scores, last 14 days${old.length >= 2 ? ' vs the 14 before' : ''}</p>
      <div class="dims big">${DIMS.map((k) => { const a = dimAvg(cur, k), b = old.length >= 2 ? dimAvg(old, k) : null; return `<div class="dim"><span>${k}</span><i role="meter" aria-valuemin="1" aria-valuemax="10" aria-valuenow="${round1(a)}" aria-label="${k}"><b style="width:${a * 10}%"></b></i><em>${round1(a)}</em><small>${deltaTag(round1(a), round1(b))}</small></div>`; }).join('')}</div>
      <p class="muted small">Weakest right now: <b>${esc(SKILLS[plan.weakestSkill(S.reps)].label)}</b>. After day 28 your daily plan targets it automatically.</p></div>` : ''}
    ${thenNow ? `<div class="card"><h3>Then vs now</h3><p class="muted small">Your first “Tell me about yourself” and your latest.</p>
      ${thenNow.map((r, i) => `<div class="tn"><span class="tag">${i ? 'Now' : 'Then'} · ${esc(fmtDay(r.day))}</span><span>${r.metrics && r.metrics.crisp != null ? 'Crisp ' + r.metrics.crisp : ''}${r.ai && r.ai.feedback ? ' · Coach ' + r.ai.feedback.scores.overall + '/10' : ''}</span>${S.audio.has(r.id) ? `<button class="btn small ghost" data-act="tn-play" data-id="${r.id}">${icon('play', 14)} Play</button>` : ''}<a class="btn small link" href="#/rep/${r.id}">Open</a></div>`).join('')}</div>` : ''}
    ${history.length ? `<div class="card"><h3>History</h3><ul class="hist">${history.map((r) => `<li><a href="#/rep/${r.id}"><span class="h-when">${esc(fmtDay(r.day))} · ${esc(fmtTime(r.ts))}</span><span class="h-what"><b>${esc(DRILLS[r.drill] ? DRILLS[r.drill].name : r.drill)}</b>${(r.attempt || 1) > 1 ? ` <span class="tag">redo</span>` : ''}<span class="muted">${esc((r.custom || r.prompt || '').slice(0, 90))}</span></span><span class="h-score">${r.ai && r.ai.feedback ? `<b>${r.ai.feedback.scores.overall}</b><small>/10</small>` : r.metrics && r.metrics.crisp != null ? `<b>${r.metrics.crisp}</b><small>crisp</small>` : ''}</span></a></li>`).join('')}</ul></div>` : ''}
  </section>`;
}

function mountCharts() {
  const first = S.reps.filter((r) => (r.attempt || 1) === 1);
  const minutes = {};
  for (const r of S.reps) minutes[r.day] = (minutes[r.day] || 0) + (r.durationSec || 0) / 60;
  const h = document.getElementById('heat');
  if (h) heatmap(h, minutes, 12);
  const mount = (id, pts, opts) => { const el = document.getElementById(id); if (el) lineChart(el, pts, opts); };
  mount('ch-score', byDay(first, (r) => (r.ai && r.ai.feedback ? r.ai.feedback.scores.overall : null)), { yMin: 0, yMax: 10, label: 'Coach score', empty: 'Turn on the coach to see this.', fmt: (v) => (Math.round(v * 10) / 10).toString() });
  mount('ch-crisp', byDay(first, (r) => (r.metrics ? r.metrics.crisp : null)), { yMin: 0, yMax: 100, label: 'Crispness', fmt: (v) => String(Math.round(v)) });
  mount('ch-fill', byDay(first, (r) => (r.metrics && r.metrics.words >= 15 ? r.metrics.fillerPerMin : null)), { yMin: 0, label: 'Fillers per minute', unit: '/min' });
  mount('ch-wpm', byDay(first, (r) => (r.metrics && r.metrics.words >= 15 ? r.metrics.wpm : null)), { band: [130, 170], label: 'Words per minute', unit: 'wpm', fmt: (v) => String(Math.round(v)) });
}

let tnAudio = null;
on('tn-play', async (el) => {
  if (tnAudio) { tnAudio.pause(); URL.revokeObjectURL(tnAudio.src); const same = tnAudio.dataset.id === el.dataset.id; tnAudio = null; if (same) return; }
  const rec = await store.getAudio(el.dataset.id);
  if (!rec) return toast('That recording is no longer on this device.');
  tnAudio = new Audio(URL.createObjectURL(rec.blob));
  tnAudio.dataset.id = el.dataset.id;
  tnAudio.play().catch(() => toast('Tap play again to start the audio.'));
});

// ---------- Rep detail ----------------------------------------------------------------------
function repView(id) {
  const rep = repById(id);
  if (!rep) return `<section class="page"><p>That rep isn’t on this device.</p><a class="btn ghost" href="#/progress">Back to Progress</a></section>`;
  const kids = S.reps.filter((r) => r.parent === rep.id);
  const parent = rep.parent && repById(rep.parent);
  return `<section class="page">
    <a class="back" href="#/progress">${icon('back', 18)} Progress</a>
    <p class="eyebrow">${esc(fmtDay(rep.day))} · ${esc(fmtTime(rep.ts))}</p>
    ${session.repBlocks(rep, { editing: ui.detailEdit === rep.id })}
    ${parent || kids.length ? `<div class="card"><h3>Other attempts</h3><ul class="hist">${[parent, ...kids].filter(Boolean).map((r) => `<li><a href="#/rep/${r.id}"><span class="h-what"><b>Attempt ${r.attempt || 1}</b></span><span class="h-score">${r.ai && r.ai.feedback ? `<b>${r.ai.feedback.scores.overall}</b><small>/10</small>` : r.metrics && r.metrics.crisp != null ? `<b>${r.metrics.crisp}</b><small>crisp</small>` : ''}</span></a></li>`).join('')}</ul></div>` : ''}
    <div class="actions stack">
      <button class="btn primary" data-act="again" data-id="${rep.id}">${icon('redo', 18)} Practise this prompt again</button>
      <button class="btn link danger" data-act="del-rep" data-id="${rep.id}">${icon('trash', 16)} Delete this rep</button>
    </div>
  </section>`;
}

window.addEventListener('speak:rep', (e) => { if (route().name === 'rep' && route().arg === e.detail) { const y = window.scrollY; render(); window.scrollTo(0, y); } });
window.addEventListener('speak:edit', (e) => { ui.detailEdit = e.detail; if (route().name === 'rep') render(); });

on('again', (el) => {
  const rep = repById(el.dataset.id);
  if (!rep) return;
  const words = rep.words ? rep.words.map((w) => WORDS.find((x) => x[0] === w)).filter(Boolean) : null;
  session.startFree(rep.drill, { prompt: rep.prompt, promptIdx: rep.promptIdx, custom: rep.custom || undefined, speak: rep.drill === 'rehearse' ? rep.target : undefined, words });
});
on('del-rep', async (el) => {
  if (!confirm('Delete this rep and its recording?')) return;
  await removeRep(el.dataset.id);
  toast('Deleted.');
  go('#/progress');
});

// ---------- Learn ---------------------------------------------------------------------------
const LEARN = [
  ['method', 'How this works', 'Why each part of a rep exists, and the research behind it.'],
  ['frameworks', 'Frameworks', 'Thirteen structures for answers, updates, stories and pitches.'],
  ['phrases', 'Phrase bank', 'Lines for buying time, signposting, disagreeing and landing the point.'],
  ['upgrades', 'Word upgrades', 'Vague words and the sharper ones to use instead.'],
  ['delivery', 'Delivery', 'Pace, pauses, endings, emphasis, breath.'],
  ['interview', 'Interview kit', 'Story bank, "tell me about yourself", design and coding interviews.'],
  ['drills', 'Drill guides', 'Every drill: why it works, how to do it, weak vs strong.'],
  ['sources', 'The science', 'Studies and books behind the method, with how strong the evidence is.'],
];

function learnView(arg) {
  const [sec, sub] = (arg || '').split('/');
  const back = `<a class="back" href="#/learn">${icon('back', 18)} Learn</a>`;
  if (!sec) {
    return `<section class="page"><h1 class="h1">Learn</h1><p class="lede">The playbook. Read one section a day while your coffee brews.</p>
      <div class="list">${LEARN.map(([id, t, d]) => `<a class="card row-link" href="#/learn/${id}"><span><b>${esc(t)}</b><small class="muted">${esc(d)}</small></span>${icon('chev', 18)}</a>`).join('')}</div></section>`;
  }
  const title = (LEARN.find((x) => x[0] === sec) || [, ''])[1];
  let body = '';
  if (sec === 'method') {
    body = PLAYBOOK.method.map((m) => `<div class="card"><h3>${esc(m.t)}</h3><p>${esc(m.d)}</p><p class="ev"><span class="tag">${esc(m.ev)}</span><span class="muted small">${esc(m.src)}</span></p></div>`).join('')
      + `<div class="card"><h3>The daily loop</h3><ol class="steps"><li><b>Warm-up rep</b>: a short, easy drill to get your mouth and brain going.</li><li><b>Main rep</b>: today’s skill, with a planning window, then coach feedback.</li><li><b>Redo</b>: the same prompt again with one fix. This is where the gains are.</li><li><b>Wrap-up</b>: write one thing to use in a real conversation.</li></ol><p class="muted small">Weeks 1–4 build the foundation skills in order. After that, each day targets your weakest skill from your recent scores, and think time shrinks as drills get familiar.</p></div>`;
  } else if (sec === 'frameworks') {
    body = PLAYBOOK.frameworks.map(([n, f, u]) => `<div class="card fw"><h3>${esc(n)}</h3><p class="fw-f">${esc(f)}</p><p class="muted small">${esc(u)}</p></div>`).join('');
  } else if (sec === 'phrases') {
    body = PLAYBOOK.phrases.map(([h, list]) => `<div class="card"><h3>${esc(h)}</h3><ul class="phrases">${list.map((p) => `<li><span>${esc(p)}</span><button class="icon-btn sm" data-act="say" data-text="${esc(p)}" aria-label="Hear it">${icon('volume', 16)}</button></li>`).join('')}</ul></div>`).join('');
  } else if (sec === 'upgrades') {
    body = `<div class="card"><table class="tbl upg-t"><thead><tr><th>Instead of</th><th>Say</th></tr></thead><tbody>${PLAYBOOK.upgrades.map(([a, b]) => `<tr><td><s>${esc(a)}</s></td><td>${esc(b)}</td></tr>`).join('')}</tbody></table></div>
      <div class="card"><h3>Precise words to practise</h3><p class="muted small">Word Upgrade pulls three of these into each rep, least-practised first.</p><div class="wordlist">${WORDS.map(([w, m]) => `<span title="${esc(m)}"><b>${esc(w)}</b> <small class="muted">${esc(m)}</small></span>`).join('')}</div></div>`;
  } else if (sec === 'delivery') {
    body = PLAYBOOK.delivery.map(([h, t]) => `<div class="card"><h3>${esc(h)}</h3><p>${esc(t)}</p></div>`).join('');
  } else if (sec === 'interview') {
    body = PLAYBOOK.interview.map(([h, t]) => `<div class="card"><h3>${esc(h)}</h3><p>${esc(t)}</p></div>`).join('')
      + `<div class="row gap wrap"><button class="btn primary" data-act="free" data-id="star">Practise a STAR story</button><button class="btn ghost" data-act="free" data-id="intro">Practise your intro</button><button class="btn ghost" data-act="free" data-id="design">Practise design out loud</button></div>`;
  } else if (sec === 'drills') {
    if (sub && DRILLS[sub]) {
      const d = DRILLS[sub];
      return `<section class="page"><a class="back" href="#/learn/drills">${icon('back', 18)} Drill guides</a><h1 class="h1">${esc(d.name)}</h1><p class="lede">${esc(d.tagline)}</p>${session.lessonHTML(d)}<div class="actions"><button class="btn primary" data-act="free" data-id="${sub}">Practise this now</button></div></section>`;
    }
    body = `<div class="list">${DRILL_ORDER.map((id) => `<a class="card row-link" href="#/learn/drills/${id}"><span><b>${esc(DRILLS[id].name)}</b><small class="muted">${esc(DRILLS[id].tagline)}</small></span>${icon('chev', 18)}</a>`).join('')}</div>`;
  } else if (sec === 'sources') {
    body = `<div class="card"><p class="small">Evidence ratings in “How this works” are honest: <b>strong</b> means many studies; <b>moderate</b> means several studies, often small or in a different population (like second-language learners); some advice here is widely used by coaches and interviewers but has little formal testing, and it’s labelled as practice wisdom where it appears.</p></div>
      <div class="card"><ol class="sources">${PLAYBOOK.sources.map(([c, t]) => `<li><span>${esc(c)}</span><small class="muted">${esc(t)}</small></li>`).join('')}</ol></div>`;
  }
  return `<section class="page">${back}<h1 class="h1">${esc(title)}</h1>${body}</section>`;
}

// ---------- Settings ------------------------------------------------------------------------
function settingsView() {
  const s = S.settings;
  const key = store.getKey();
  const u = monthUsage();
  const p = platform();
  const mode = resolveMode(s.capture);
  const flags = deviceFlags();
  const opt = (v, l, cur) => `<option value="${esc(v)}" ${v === cur ? 'selected' : ''}>${esc(l)}</option>`;
  const mt = ui.micTest;
  return `<section class="page settings">
    <h1 class="h1">Settings</h1>

    <div class="card" id="set-coach"><h3>${icon('spark', 18)} AI coach</h3>
      <p class="muted small">Feedback comes from Claude through your own Anthropic API key. The key stays in this browser on this device, and your transcripts go straight from here to Anthropic, never through anyone else.</p>
      <label class="lbl" for="api-key">Anthropic API key</label>
      <div class="row gap"><input id="api-key" type="password" autocomplete="off" spellcheck="false" placeholder="${key ? 'Saved: ' + esc(key.slice(0, 10)) + '…' : 'sk-ant-…'}"><button class="btn small primary" data-act="key-save">Save</button></div>
      <div class="row gap wrap">${key ? `<button class="btn small ghost" data-act="key-test" ${ui.keyTesting ? 'disabled' : ''}>${ui.keyTesting ? 'Testing…' : 'Test key'}</button><button class="btn small link danger" data-act="key-del">Remove key</button>` : ''}</div>
      <label class="lbl" for="model">Model</label>
      <select id="model" data-change="set" data-k="model">${MODELS.map((m) => opt(m.id, m.short, s.model)).join('')}</select>
      <label class="lbl" for="effort">Coach depth</label>
      <select id="effort" data-change="set" data-k="effort">${opt('low', 'Quick · fastest', s.effort)}${opt('medium', 'Balanced (recommended)', s.effort)}${opt('high', 'Thorough · slower', s.effort)}</select>
      <p class="muted small">This month: ${plural(u.calls, 'coach call')} · about ${usd(u.usd)}. A rep costs a few cents with Opus.</p>
      <details><summary>How to get a key (2 minutes)</summary><ol class="steps small"><li>Go to <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener">console.anthropic.com → API keys</a> and create a key just for this app.</li><li>Under Limits, set a monthly spend limit (for example $10), so a leaked key can’t cost much.</li><li>Paste it above and tap Test key.</li></ol><p class="muted small">The key is stored in this browser’s local storage for this site. Anyone with access to this browser profile could read it, so use a dedicated, limited key and remove it from shared devices. Without a key, every review has “Copy prompt for Claude”, which works with your normal Claude app.</p></details>
    </div>

    <div class="card"><h3>About you</h3>
      <label class="lbl" for="name">First name (for the greeting)</label>
      <input id="name" data-change="set" data-k="name" value="${esc(s.name)}" maxlength="40" autocomplete="given-name">
      <label class="lbl" for="about">Background for the coach</label>
      <textarea id="about" data-change="set" data-k="about" rows="5" maxlength="1500" placeholder="Your role, your current projects with real numbers, what you're preparing for, your habits. e.g. AI engineer: I build agents and RAG systems. Preparing for senior interviews. I over-explain and say 'basically' a lot.">${esc(s.about)}</textarea>
      <p class="muted small">Sent with each coach request so feedback and the stronger versions use your real projects and goals.</p>
    </div>

    <div class="card"><h3>Practice</h3>
      <label class="lbl" for="len">Daily session</label>
      <select id="len" data-change="set" data-k="sessionLength">${opt('quick', 'Quick · about 5 min', s.sessionLength)}${opt('standard', 'Standard · about 8 min', s.sessionLength)}${opt('deep', 'Deep · about 12 min', s.sessionLength)}</select>
      <p class="muted small">Quick: one main rep and its redo. Standard adds a warm-up rep. Deep adds a bonus rep too.</p>
      <label class="check"><input type="checkbox" data-change="set-bool" data-k="ritual" ${s.ritual ? 'checked' : ''}> Start sessions with the 20-second “get excited” warm-up</label>
      <label class="lbl" for="theme">Appearance</label>
      <select id="theme" data-change="set" data-k="theme">${opt('system', 'Match my device', s.theme)}${opt('light', 'Light', s.theme)}${opt('dark', 'Dark', s.theme)}</select>
    </div>

    <div class="card" id="set-speech"><h3>${icon('mic', 18)} Speech</h3>
      <label class="lbl" for="lang">Recognition language</label>
      <select id="lang" data-change="set" data-k="lang">${[['en-IN', 'English (India)'], ['en-US', 'English (US)'], ['en-GB', 'English (UK)'], ['en-AU', 'English (Australia)'], ['en-CA', 'English (Canada)'], ['en-SG', 'English (Singapore)']].map(([v, l]) => opt(v, l, s.lang)).join('')}</select>
      <label class="lbl" for="capture">Capture</label>
      <select id="capture" data-change="set" data-k="capture">${opt('auto', 'Automatic (recommended)', s.capture)}${opt('both', 'Audio + live transcript', s.capture)}${opt('transcript', 'Live transcript only', s.capture)}${opt('audio', 'Audio only', s.capture)}</select>
      <p class="muted small">This device: ${p.ios ? 'iPhone/iPad' : p.android ? 'Android' : 'computer'}${p.standalone ? ' (Home Screen app)' : ''} · live transcript ${p.recognition ? 'available' : 'not available'} · recording ${p.recorder ? 'available' : 'not available'}. Using: <b>${esc(MODE_LABEL[mode])}</b>.</p>
      ${p.mobile ? `<p class="muted small">Phones can’t reliably record and transcribe at the same moment, so Automatic transcribes only. To hear yourself back, choose “Audio + live transcript” and test it. If one of them fails, the app notices and switches back.</p>` : ''}
      ${p.ios && p.standalone ? `<p class="notice small">${icon('info', 16)}<span>iOS blocks live transcripts in Home Screen apps. For transcripts and coaching, open this page in a Safari tab instead (you can turn off “Open as Web App” when adding it to your Home Screen).</span></p>` : ''}
      ${flags.noBoth ? `<p class="muted small">Audio + transcript failed on this device before, so Automatic avoids it. <button class="btn small link" data-act="reset-flags">Try it again</button></p>` : ''}
      <button class="btn small ghost" data-act="mic-test" ${mt && mt.running ? 'disabled' : ''}>${icon('mic', 16)} ${mt && mt.running ? 'Listening… say a sentence' : 'Test the microphone (5 s)'}</button>
      ${mt && mt.result ? `<div class="mictest small"><p><b>${esc(MODE_LABEL[mt.result.mode])}</b>: ${mt.result.transcript ? `heard “${esc(mt.result.transcript.replace(/\n/g, ' '))}”` : 'no words recognized'}${mt.result.vad ? ` · voice detected for ${mt.result.vad.speechSec}s` : ''}${mt.result.audio ? ' · audio recorded' : ''}</p>${(mt.result.issues || []).map((i) => `<p class="muted">${esc(ISSUE_TEXT[i] || i)}</p>`).join('')}</div>` : ''}
      ${mt && mt.error ? `<p class="err small">${esc(mt.error)}</p>` : ''}
      <label class="lbl" for="keep">Keep recordings on this device</label>
      <select id="keep" data-change="set-num" data-k="keepAudio">${[[0, 'Don’t keep audio'], [10, 'Last 10'], [30, 'Last 30'], [100, 'Last 100']].map(([v, l]) => `<option value="${v}" ${v === s.keepAudio ? 'selected' : ''}>${l}</option>`).join('')}</select>
    </div>

    <div class="card"><h3>${icon('cal', 18)} Daily reminder</h3>
      <p class="muted small">Habits stick when they have a fixed time. Add a recurring 10-minute event to your calendar.</p>
      <div class="row gap"><input id="remind" type="time" value="${esc(store.ls.get('remindAt', '08:30'))}"><button class="btn small primary" data-act="ics">Add to calendar</button></div>
    </div>

    <div class="card"><h3>Your data</h3>
      <p class="muted small">Everything (reps, transcripts, recordings, settings) lives in this browser only. Back it up to move between your phone and laptop.</p>
      <div class="row gap wrap"><button class="btn small ghost" data-act="export">${icon('download', 16)} Export backup</button><label class="btn small ghost file">${icon('upload', 16)} Import backup<input type="file" accept="application/json,.json" data-change="import" hidden></label><button class="btn small link danger" data-act="reset">Erase everything</button></div>
    </div>

    <p class="muted small center">Speak · daily reps for clear, sharp speaking · <a href="#/learn/sources">The science</a></p>
  </section>`;
}

on('set', (el) => {
  const k = el.dataset.k;
  const v = el.value;
  saveSettings({ [k]: k === 'about' ? v.slice(0, 1500) : v });
  if (k === 'theme') applyTheme();
  if (k === 'capture' || k === 'sessionLength') render();
  if (k === 'about' || k === 'name') toast('Saved.');
});
on('set-bool', (el) => saveSettings({ [el.dataset.k]: el.checked }));
on('set-num', (el) => saveSettings({ [el.dataset.k]: parseInt(el.value, 10) || 0 }));
on('reset-flags', () => { setDeviceFlag('noBoth', undefined); toast('Okay. Automatic will try audio + transcript again.'); render(); });

on('key-save', async () => {
  const v = ($('#api-key').value || '').trim();
  if (!v) return toast('Paste your key first.');
  if (!/^sk-ant-/.test(v)) return toast('That doesn’t look like an Anthropic key (they start with sk-ant-).');
  store.setKey(v);
  toast('Saved. Testing it…');
  await keyTest();
});
async function keyTest() {
  ui.keyTesting = true; render();
  try { await testKey(store.getKey(), S.settings.model); toast('Key works. The coach is on.', 3500); } catch (e) { toast(e.message, 6000); }
  ui.keyTesting = false; if (route().name === 'settings') render();
}
on('key-test', () => keyTest());
on('key-del', () => { if (!confirm('Remove the API key from this browser?')) return; store.setKey(''); toast('Key removed.'); render(); });

on('mic-test', async () => {
  ui.micTest = { running: true };
  const cap = new Capture({ mode: S.settings.capture, lang: S.settings.lang });
  render();
  try {
    await cap.start();
    await new Promise((r) => setTimeout(r, 5000));
    const res = await cap.stop();
    ui.micTest = { result: { mode: res.mode, transcript: res.transcript, vad: res.vad, audio: !!res.audio, issues: res.issues } };
  } catch (e) {
    cap.cancel();
    ui.micTest = { error: e.message };
  }
  if (route().name === 'settings') render();
});

on('ics', () => {
  const t = ($('#remind').value || '08:30');
  store.ls.set('remindAt', t);
  const [hh, mm] = t.split(':').map((x) => parseInt(x, 10));
  const d = new Date(); d.setHours(hh, mm, 0, 0);
  if (d < new Date()) d.setDate(d.getDate() + 1);
  const z = (n) => String(n).padStart(2, '0');
  const local = `${d.getFullYear()}${z(d.getMonth() + 1)}${z(d.getDate())}T${z(hh)}${z(mm)}00`;
  const now = new Date();
  const stamp = `${now.getUTCFullYear()}${z(now.getUTCMonth() + 1)}${z(now.getUTCDate())}T${z(now.getUTCHours())}${z(now.getUTCMinutes())}${z(now.getUTCSeconds())}Z`;
  const url = location.origin + location.pathname;
  const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Speak//Daily reps//EN', 'CALSCALE:GREGORIAN', 'BEGIN:VEVENT',
    `UID:speak-daily-${now.getTime()}@speak`, `DTSTAMP:${stamp}`, `DTSTART:${local}`, 'DURATION:PT10M', 'RRULE:FREQ=DAILY',
    'SUMMARY:Speak: daily reps', `DESCRIPTION:Plan\\, speak\\, redo. ${url}`, `URL:${url}`,
    'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:Time for your speaking reps', 'TRIGGER:PT0M', 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
  download('speak-daily-reminder.ics', ics, 'text/calendar');
  toast('Open the downloaded file to add the reminder.');
});

on('export', async () => {
  const data = await store.exportData();
  download(`speak-backup-${today()}.json`, JSON.stringify(data, null, 1));
  toast('Backup downloaded (recordings and your API key are not included).', 4000);
});
on('import', async (el) => {
  const f = el.files && el.files[0];
  if (!f) return;
  try {
    const n = await store.importData(JSON.parse(await f.text()));
    S.settings = store.loadSettings();
    await loadState();
    S.days = store.ls.get('days', {}); S.usage = store.ls.get('usage', {}); S.wordsUsed = store.ls.get('wordsUsed', {});
    toast(`Imported ${plural(n, 'rep')}.`);
    render();
  } catch (e) { toast(e.message || 'Couldn’t read that file.', 5000); }
});
on('reset', async () => {
  if (!confirm('Erase every rep, recording, setting and your API key from this browser? This can’t be undone.')) return;
  session.exitSession();
  await store.resetAll();
  location.hash = '#/welcome';
  location.reload();
});

// ---------- Welcome -------------------------------------------------------------------------
function welcomeView() {
  const s = S.settings;
  const p = platform();
  return `<section class="page welcome">
    <div class="hero">
      <p class="eyebrow">${icon('wave', 16)} Speak · daily reps</p>
      <h1 class="display">Think first.<br><i>Then</i> speak.</h1>
      <p class="lede">Five to ten minutes a day. Plan for ten seconds, speak, get instant feedback, then do it again, better. The drills come from research on fluency, filler words and confident speech, aimed at technical talk, interviews and presenting your work.</p>
    </div>
    <ol class="how">
      <li><b>${icon('clock', 18)} Plan</b><span>A short window to decide your first sentence and structure.</span></li>
      <li><b>${icon('mic', 18)} Speak</b><span>Out loud, against the clock, with a live transcript.</span></li>
      <li><b>${icon('spark', 18)} Review</b><span>Fillers, hedges, pace, and line-by-line coaching.</span></li>
      <li><b>${icon('redo', 18)} Redo</b><span>Same prompt, one fix. The redo is where you improve.</span></li>
    </ol>
    <div class="card">
      <label class="lbl" for="w-name">First name <span class="muted">(optional)</span></label>
      <input id="w-name" value="${esc(s.name)}" maxlength="40" autocomplete="given-name">
      <label class="lbl" for="w-about">What do you want to get better at? <span class="muted">(optional, helps the coach)</span></label>
      <textarea id="w-about" rows="4" maxlength="1500" placeholder="e.g. AI engineer. I build agents and RAG systems. Preparing for senior interviews and presenting my work. I tend to ramble and say 'basically'.">${esc(s.about)}</textarea>
      <label class="lbl" for="w-len">Daily session</label>
      <select id="w-len">${[['quick', 'Quick, about 5 minutes'], ['standard', 'Standard, about 8 minutes'], ['deep', 'Deep, about 12 minutes']].map(([v, l]) => `<option value="${v}" ${v === s.sessionLength ? 'selected' : ''}>${l}</option>`).join('')}</select>
    </div>
    <div class="card">
      <h3>${icon('spark', 18)} AI coach <span class="muted small">(optional)</span></h3>
      <p class="muted small">Paste an Anthropic API key to get Claude’s feedback right inside the app; it stays in this browser. Skip it and every review offers “Copy prompt for Claude” instead. You can add it later in Settings.</p>
      <input id="w-key" type="password" autocomplete="off" spellcheck="false" placeholder="sk-ant-… (optional)">
    </div>
    ${!p.recognition && !p.recorder ? `<p class="notice">${icon('info', 18)}<span>This browser can’t use the microphone here. Open this page in Chrome or Safari.</span></p>` : ''}
    ${p.ios && p.standalone ? `<p class="notice">${icon('info', 18)}<span>On iPhone, live transcripts only work in a Safari tab, not in Home Screen apps. Open this page in Safari for the full experience.</span></p>` : ''}
    <div class="actions stack"><button class="btn primary big" data-act="welcome-done">Start day 1</button><a class="btn link" href="#/learn/method">How it works, and why</a></div>
  </section>`;
}

on('welcome-done', () => {
  const key = ($('#w-key').value || '').trim();
  if (key && !/^sk-ant-/.test(key)) return toast('That doesn’t look like an Anthropic key (they start with sk-ant-). Leave it empty to skip.');
  if (key) store.setKey(key);
  saveSettings({ name: ($('#w-name').value || '').trim(), about: ($('#w-about').value || '').trim(), sessionLength: $('#w-len').value, onboarded: true });
  if (key) testKey(key, S.settings.model).then(() => toast('Coach is on.')).catch((e) => toast(e.message, 6000));
  go('#/today');
});

// ---------- shared actions -------------------------------------------------------------------
on('start-daily', () => session.startDaily());
on('free', (el) => session.startFree(el.dataset.id));
on('len', (el) => { saveSettings({ sessionLength: el.dataset.v }); render(); });

// ---------- boot ----------------------------------------------------------------------------
async function boot() {
  applyTheme();
  bindActions();
  await loadState();
  window.addEventListener('hashchange', render);
  render();
  document.documentElement.classList.add('ready');
}
boot();
