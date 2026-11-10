// A practice session: ritual → lesson → brief → plan → speak → review (→ redo) → … → reflect → done.
import { DRILLS, WORDS, RITUAL, TWISTERS, SKILLS } from './content.js';
import { analyze, highlight, findSpans, paceLabel } from './analyze.js';
import { Capture, ISSUE_TEXT, MODE_LABEL, resolveMode } from './audio.js';
import { coach, copyPrompt, partialHeadline, MODELS } from './coach.js';
import * as store from './store.js';
import * as plan from './plan.js';
import { S, today, repById, putRep, saveDays, saveWords, saveSettings, addUsage, go } from './state.js';
import { esc, $, on, toast, icon, fmtSec, copyText, speak, stopSpeaking, plural } from './ui.js';

let R = null;        // the active run
const RUNS = new Map(); // repId -> coach request state, so feedback can finish after you move on
let tick = null;
let player = null;   // { id, audio, url }

export const activeRun = () => R;
const step = () => (R ? R.steps[R.i] : null);
// The session can stay open in the background (Today shows "Resume"); only draw it on its own screen.
const inSession = () => !!R && location.hash.startsWith('#/session');
const ROLE = { warm: 'Warm-up', main: 'Main rep', bonus: 'Bonus rep', free: 'Practice' };
const DIMS = ['clarity', 'structure', 'concision', 'confidence', 'precision'];
const trunc = (s, n) => (s && s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s || '');
const modelName = (id) => (MODELS.find((m) => id && id.startsWith(m.id)) || { name: id || 'Claude' }).name;

export function startDaily() {
  const p = plan.today(S);
  const k = today();
  S.days[k] = { ...(S.days[k] || {}), plan: p };
  saveDays();
  R = { kind: 'daily', plan: p, steps: plan.steps(p, S.settings.sessionLength).map((s) => ({ ...s })), i: 0, ritual: S.settings.ritual };
  enterStep(0);
  go('#/session');
}

export function startFree(drillId, extra = {}) {
  R = { kind: 'free', steps: [{ role: 'free', drill: drillId, ...extra }], i: 0, ritual: false };
  enterStep(0);
  go('#/session');
}

export function exitSession() {
  stopTick();
  stopSpeaking();
  stopPlayer();
  if (R && R.cap) R.cap.cancel();
  R = null; // coach requests in flight keep going and save to their rep
}

function enterStep(i) {
  R.i = i;
  const st = R.steps[i];
  const d = DRILLS[st.drill];
  st.attempt = 1;
  st.parentRepId = null;
  st.redoGoal = '';
  if (!d.custom && !st.prompt) { const pk = plan.pickPrompt(st.drill, S.reps); st.prompt = pk.text; st.promptIdx = pk.idx; }
  if (d.mode === 'words' && !st.words) st.words = plan.pickWords(S.wordsUsed);
  st.think = plan.thinkTime(st.drill, S.reps, 1);
  st.speak = st.speak || d.speak;
  resetPasses(st);
  if (R.ritual && i === 0) R.phase = 'ritual';
  else R.phase = st.role !== 'warm' && !plan.lessonSeen(S.reps, st.drill) && !d.custom ? 'lesson' : 'brief';
  render();
}

function resetPasses(st) {
  const d = DRILLS[st.drill];
  st.passes = d.passes ? d.passes.slice() : null;
  st.passIdx = 0;
  st.passResults = [];
}

const targetOf = (st) => (st.passes ? st.passes[st.passIdx] : st.speak);

// ---------- rendering -------------------------------------------------------------------------
export function render() {
  const view = document.getElementById('view');
  if (!view || !inSession()) return;
  const st = step();
  let body = '';
  switch (R.phase) {
    case 'ritual': body = ritualView(); break;
    case 'lesson': body = lessonView(st); break;
    case 'brief': body = briefView(st); break;
    case 'think': body = thinkView(st); break;
    case 'live': body = liveView(st); break;
    case 'between': body = betweenView(st); break;
    case 'review': body = reviewView(st); break;
    case 'reflect': body = reflectView(); break;
    case 'done': body = doneView(); break;
    default: body = '';
  }
  view.innerHTML = (R.phase === 'done' ? '' : header(st)) + body;
  view.scrollTop = 0;
  if (R.phase === 'review') prepPlayer(R.cur && R.cur.repId);
}

function header(st) {
  const dots = R.steps.map((s, i) => `<i class="${i < R.i ? 'done' : i === R.i ? 'cur' : ''}" title="${esc(ROLE[s.role])}"></i>`).join('');
  return `<div class="sbar">
    <button class="icon-btn" data-act="s-exit" aria-label="Leave the session">${icon('x', 22)}</button>
    <div class="sbar-mid"><span class="sbar-role">${esc(R.phase === 'reflect' ? 'Wrap-up' : ROLE[st.role])} · ${esc(DRILLS[st.drill].name)}</span>${R.steps.length > 1 ? `<span class="dots">${dots}</span>` : ''}</div>
    <span class="sbar-side"></span>
  </div>`;
}

function ritualView() {
  const tw = TWISTERS[new Date().getDate() % TWISTERS.length];
  return `<section class="stage center">
    <p class="eyebrow">Before you start · 20 seconds</p>
    <h1 class="h1">${esc(RITUAL.title)}</h1>
    <div class="breath" aria-hidden="true"><i></i></div>
    <ol class="ritual">${RITUAL.lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ol>
    <p class="muted small">Loosen up your mouth: say “${esc(tw)}” three times, quickly and clearly.</p>
    <div class="actions stack">
      <button class="btn primary big" data-act="s-ritual-done">I’m ready</button>
      <button class="btn link" data-act="s-ritual-off">Skip, and don’t show this again</button>
    </div>
  </section>`;
}

export function lessonHTML(d) {
  const L = d.lesson;
  return `<div class="card"><h3>Why it works</h3><p>${esc(L.why)}</p></div>
    <div class="card"><h3>How to do it</h3><ol class="steps">${L.how.map((x) => `<li>${esc(x)}</li>`).join('')}</ol></div>
    ${L.weak ? `<div class="card contrast"><h3>Hear the difference</h3><p class="q">${esc(L.q)}</p>
      <div class="weak"><span class="tag">Weak</span><p>${esc(L.weak)}</p></div>
      <div class="strong"><span class="tag">Strong</span><p>${esc(L.strong)}</p>
      <button class="btn small ghost" data-act="say" data-text="${esc(L.strong)}">${icon('volume', 16)} Hear it</button></div></div>` : ''}
    <p class="tip">${icon('bolt', 16)}<span>${esc(L.tip)}</span></p>`;
}

function lessonView(st) {
  const d = DRILLS[st.drill];
  return `<section class="stage">
    <p class="eyebrow">New drill · ${esc((SKILLS[d.skill] || { label: d.skill }).label)}</p>
    <h1 class="h1">${esc(d.name)}</h1>
    <p class="lede">${esc(d.tagline)}</p>
    ${lessonHTML(d)}
    <div class="actions"><button class="btn primary big" data-act="s-lesson-done">Got it. Let’s go</button></div>
  </section>`;
}

function scaffoldHTML(d, compact = false) {
  return `<div class="scaffold ${compact ? 'compact' : ''}">${compact ? '' : '<p class="eyebrow">Structure</p>'}<ol>${d.scaffold.map(([k, v]) => `<li><b>${esc(k)}</b><span>${esc(v)}</span></li>`).join('')}</ol></div>`;
}

function wordsHTML(st) {
  return st.words ? `<div class="words">${st.words.map(([w, m]) => `<div class="word"><b>${esc(w)}</b><span>${esc(m)}</span></div>`).join('')}</div>` : '';
}

function briefView(st) {
  const d = DRILLS[st.drill];
  let promptBlock;
  if (d.custom) {
    promptBlock = `<div class="card">
      <label class="lbl" for="custom">What are you rehearsing?</label>
      <textarea id="custom" rows="4" placeholder="Who is listening, what's the situation, and what do you need from them? e.g. Tomorrow's standup: the eval migration slipped two days, and I need the data team to unblock labelling.">${esc(st.custom || '')}</textarea>
      <label class="lbl" for="custom-time">How long will you have?</label>
      <select id="custom-time">${[30, 45, 60, 90, 120, 180].map((s) => `<option value="${s}" ${s === st.speak ? 'selected' : ''}>${fmtSec(s)}</option>`).join('')}</select>
    </div>`;
  } else if (st.editing) {
    promptBlock = `<div class="card">
      <label class="lbl" for="own">Your prompt</label>
      <textarea id="own" rows="3" placeholder="A question you expect, or something you need to explain">${esc(st.prompt)}</textarea>
      <div class="row gap"><button class="btn small primary" data-act="s-own-save">Use this</button><button class="btn small ghost" data-act="s-own-cancel">Cancel</button></div>
    </div>`;
  } else {
    promptBlock = `<div class="prompt-card">
      <p class="prompt">${esc(st.prompt)}</p>
      ${st.attempt === 1 && !st.fixedPrompt ? `<div class="prompt-tools">
        <button class="chip-btn" data-act="s-shuffle">${icon('shuffle', 16)} New prompt</button>
        <button class="chip-btn" data-act="s-own">${icon('pencil', 16)} Use my own</button></div>` : ''}
    </div>`;
  }
  const redo = st.attempt > 1 ? `<div class="redo-goal">${icon('target', 20)}<div><p class="eyebrow">Your goal for this attempt</p><p>${esc(st.redoGoal || 'Same prompt. Apply the feedback.')}</p></div></div>` : '';
  const passes = st.passes ? `<p class="muted">Three passes: ${st.passes.map((p) => p + 's').join(' → ')}. Same message every time, with less time.</p>` : '';
  const lessonLink = d.custom ? '' : `<details class="mini-lesson"><summary>${icon('book', 16)} How to do this well</summary><ol>${d.lesson.how.map((x) => `<li>${esc(x)}</li>`).join('')}</ol><p class="tip">${icon('bolt', 16)}<span>${esc(d.lesson.tip)}</span></p></details>`;
  return `<section class="stage">
    <p class="eyebrow">${esc(d.name)}${st.attempt > 1 ? ` · Attempt ${st.attempt}` : ''}</p>
    ${promptBlock}
    ${redo}
    ${wordsHTML(st)}
    ${modeSwap(st)}
    ${scaffoldHTML(d)}
    ${passes}
    <div class="meta-row"><span>${icon('clock', 16)} ${st.passes ? fmtSec(st.passes[0]) + ' first pass' : fmtSec(st.speak) + ' to speak'}</span><span>${icon('target', 16)} ${st.think}s to plan</span></div>
    ${lessonLink}
    <div class="actions stack">
      <button class="btn primary big" data-act="s-think">${icon('clock', 20)} Plan for ${st.think} seconds</button>
      <button class="btn ghost" data-act="s-speak">${icon('mic', 18)} Skip planning and speak</button>
    </div>
  </section>`;
}

// On phones the default is transcript-only. The filler hunt needs audio, so offer a swap for that drill.
function modeSwap(st) {
  if (DRILLS[st.drill].mode !== 'clean') return '';
  const base = resolveMode(S.settings.capture);
  if (st.mode === 'audio') return `<div class="mode-swap"><span>${icon('ear', 18)} Recording audio for the filler hunt. No live transcript this time.</span><button class="btn small ghost" data-act="s-mode" data-v="">Undo</button></div>`;
  if (base !== 'transcript' || resolveMode('audio') !== 'audio') return '';
  return `<div class="mode-swap"><span>${icon('ear', 18)} Want to hear yourself back and count your fillers?</span><button class="btn small ghost" data-act="s-mode" data-v="audio">Record audio instead</button></div>`;
}

function thinkView(st) {
  const d = DRILLS[st.drill];
  return `<section class="stage center">
    <p class="eyebrow">Plan your first sentence and your structure. Don’t script.</p>
    <div class="ring" id="think-ring" style="--p:0"><span id="think-left">${st.think}</span><small>seconds</small></div>
    <p class="prompt small-prompt">${esc(st.prompt)}</p>
    ${st.redoGoal && st.attempt > 1 ? `<p class="goal-line">${icon('target', 16)} ${esc(st.redoGoal)}</p>` : ''}
    ${st.words ? `<p class="muted">Use: ${st.words.map((w) => `<b>${esc(w[0])}</b>`).join(' · ')}</p>` : ''}
    ${scaffoldHTML(d, true)}
    <div class="actions"><button class="btn primary big" id="go-btn" data-act="s-speak">${icon('mic', 20)} Speak now</button></div>
  </section>`;
}

function modeNote(mode) {
  if (mode === 'audio') return 'Recording audio only on this device: no live transcript. You can type or dictate what you said afterwards for feedback.';
  return '';
}

function liveView(st) {
  const hasT = R.cap && R.cap.hasTranscript;
  return `<section class="stage center live">
    <p class="eyebrow" id="live-status">Starting the microphone…</p>
    <div class="ring rec" id="live-ring" style="--p:0"><span id="live-time">0:00</span><small>of ${fmtSec(targetOf(st))}</small></div>
    <div class="meter ${R.cap && R.cap.hasAudio ? '' : 'idle'}" id="meter" aria-hidden="true">${'<i></i>'.repeat(16)}</div>
    ${st.passes ? `<p class="pass-label">Pass ${st.passIdx + 1} of ${st.passes.length}</p>` : ''}
    <p class="prompt small-prompt">${esc(st.prompt)}</p>
    ${st.words ? `<p class="muted">Use: ${st.words.map((w) => `<b>${esc(w[0])}</b>`).join(' · ')}</p>` : ''}
    <div class="live-text" id="live-text">${hasT ? '<span class="muted">Your words appear here as you speak…</span>' : `<span class="muted">${esc(modeNote(R.cap ? R.cap.mode : ''))}</span>`}</div>
    <div class="actions row">
      <button class="btn ghost" data-act="s-cancel">${icon('x', 18)} Cancel</button>
      <button class="btn rec big" data-act="s-stop" id="stop-btn">${icon('stop', 20)} Done</button>
    </div>
  </section>`;
}

function betweenView(st) {
  const last = st.passResults[st.passResults.length - 1];
  const next = st.passes[st.passIdx];
  return `<section class="stage center">
    <p class="eyebrow">Pass ${st.passIdx} done · ${fmtSec(last.durationSec)} · ${plural(last.metrics.words, 'word')}</p>
    <h1 class="h1">Now say it in ${next} seconds.</h1>
    <p class="lede">${st.passIdx === 1 ? 'Same message. Drop your weakest point.' : 'One point, one proof, one close.'}</p>
    <div class="actions"><button class="btn primary big" data-act="s-speak">${icon('mic', 20)} Go: ${next} seconds</button></div>
  </section>`;
}

// ---------- review (also used to view saved reps) ---------------------------------------------
const tone = (v, ok, warn) => (v <= ok ? 'good' : v <= warn ? 'ok' : 'warn');
const crispTone = (c) => (c >= 80 ? 'good' : c >= 60 ? 'ok' : 'warn');
const stat = (label, value, unit, t) => `<div class="stat ${t}"><span class="stat-l">${esc(label)}</span><span class="stat-v">${esc(value)}</span><span class="stat-u">${esc(unit)}</span></div>`;

export function statsHTML(rep) {
  const m = rep.metrics;
  if (!m || !m.words) return '';
  const pace = paceLabel(m.wpm);
  return `<div class="stats">
    ${m.crisp != null ? stat('Crispness', m.crisp, 'of 100', crispTone(m.crisp)) : ''}
    ${stat('Pace', m.wpm, 'wpm · ' + pace.label, pace.tone)}
    ${stat('Fillers', m.fillerPerMin, 'per min', tone(m.fillerPerMin, 2, 4))}
    ${stat('Hedges', m.hedgePerMin, 'per min', tone(m.hedgePerMin, 1.5, 3))}
    ${m.longPauses != null ? stat('Long pauses', m.longPauses, '2s or more', m.longPauses > 2 ? 'warn' : 'good') : ''}
    ${stat('Time', fmtSec(m.durationSec), rep.target ? 'of ' + fmtSec(rep.target) : '', rep.target && m.durationSec > rep.target * 1.25 ? 'warn' : 'good')}
  </div>`;
}

function compareHTML(rep) {
  const p = rep.parent && repById(rep.parent);
  if (!p) return '';
  const rows = [
    ['Crispness', p.metrics && p.metrics.crisp, rep.metrics && rep.metrics.crisp, false],
    ['Fillers / min', p.metrics && p.metrics.fillerPerMin, rep.metrics && rep.metrics.fillerPerMin, true],
    ['Hedges / min', p.metrics && p.metrics.hedgePerMin, rep.metrics && rep.metrics.hedgePerMin, true],
    ['Coach score', p.ai && p.ai.feedback && p.ai.feedback.scores.overall, rep.ai && rep.ai.feedback && rep.ai.feedback.scores.overall, false],
  ].filter((r) => r[1] != null && r[2] != null);
  if (!rows.length) return '';
  const cell = ([label, a, b, lowerBetter]) => {
    const better = lowerBetter ? b < a : b > a;
    const same = a === b;
    return `<div class="cmp-cell ${same ? '' : better ? 'up' : 'down'}"><span class="stat-l">${esc(label)}</span><span class="cmp-v">${esc(a)} → <b>${esc(b)}</b></span><span class="cmp-d">${same ? 'same' : better ? icon('check', 14) + ' better' : 'worse'}</span></div>`;
  };
  return `<div class="card cmp"><h3>Attempt ${p.attempt || 1} → ${rep.attempt}</h3><div class="cmp-grid">${rows.map(cell).join('')}</div></div>`;
}

function passesHTML(rep) {
  if (!rep.passes) return '';
  return `<div class="card"><h3>Your three passes</h3>
    <table class="tbl"><thead><tr><th>Pass</th><th>Time</th><th>Words</th><th>wpm</th><th>Fillers</th><th>Crisp</th></tr></thead><tbody>
    ${rep.passes.map((p, i) => `<tr><td>${i + 1} · ${p.target}s</td><td>${fmtSec(p.durationSec)}</td><td>${p.metrics.words}</td><td>${p.metrics.wpm}</td><td>${p.metrics.filler}</td><td>${p.metrics.crisp == null ? '—' : p.metrics.crisp}</td></tr>`).join('')}
    </tbody></table>
    <details><summary>All three transcripts</summary>${rep.passes.map((p, i) => `<p class="tx"><b>Pass ${i + 1}.</b> ${highlight(p.transcript)}</p>`).join('')}</details>
  </div>`;
}

function wordCheckHTML(rep) {
  if (!rep.words || !rep.words.length) return '';
  const flat = (rep.transcript || '').toLowerCase().replace(/[^a-z]/g, '');
  const ai = (rep.ai && rep.ai.feedback && rep.ai.feedback.word_check) || [];
  return `<div class="card"><h3>Target words</h3>${rep.words.map((w) => {
    const stem = w.toLowerCase().replace(/[^a-z]/g, '');
    const heard = flat.includes(stem.slice(0, Math.max(5, stem.length - 2)));
    const a = ai.find((x) => x.word && x.word.toLowerCase().replace(/[^a-z]/g, '') === stem);
    const ok = a ? a.used && a.natural : heard;
    const note = a ? a.note : heard ? 'Heard in your answer.' : 'Not heard in the transcript.';
    return `<div class="wc ${ok ? 'ok' : 'miss'}">${icon(ok ? 'check' : 'x', 16)}<b>${esc(w)}</b><span>${esc(note)}</span></div>`;
  }).join('')}</div>`;
}

function feedbackHTML(rep) {
  const f = rep.ai.feedback;
  const s = f.scores;
  const p = rep.parent && repById(rep.parent);
  const ps = p && p.ai && p.ai.feedback ? p.ai.feedback.scores : null;
  const d = ps ? s.overall - ps.overall : 0;
  return `<div class="coach-head">${icon('spark', 18)}<span>Coach</span><span class="muted small">${esc(modelName(rep.ai.model))}</span></div>
    <p class="headline">${esc(f.headline)}</p>
    <div class="scores">
      <div class="score-main"><b>${s.overall}</b><span>/10</span>${ps ? `<em class="${d > 0 ? 'up' : d < 0 ? 'down' : ''}">${d > 0 ? '+' + d : d < 0 ? d : '±0'} vs last</em>` : ''}</div>
      <div class="dims">${DIMS.map((k) => `<div class="dim"><span>${k}</span><i role="meter" aria-valuemin="1" aria-valuemax="10" aria-valuenow="${s[k]}" aria-label="${k}"><b style="width:${s[k] * 10}%"></b></i><em>${s[k]}</em></div>`).join('')}</div>
    </div>
    ${f.progress_note ? `<p class="progress-note">${icon('redo', 16)}<span>${esc(f.progress_note)}</span></p>` : ''}
    <div class="fix"><p class="eyebrow">Fix this first</p><p class="fix-issue">${esc(f.fix_first.issue)}</p>${f.fix_first.why ? `<p class="muted">${esc(f.fix_first.why)}</p>` : ''}<p class="fix-how">${esc(f.fix_first.how)}</p></div>
    ${f.worked.length ? `<div class="block"><p class="eyebrow">What worked</p><ul class="ticks">${f.worked.map((w) => `<li>${icon('check', 16)}<span>${esc(w)}</span></li>`).join('')}</ul></div>` : ''}
    ${f.line_edits.length ? `<div class="block"><p class="eyebrow">Line edits</p>${f.line_edits.map((e) => `<div class="edit"><p class="said">“${esc(e.said)}”</p><p class="better">${esc(e.better)}</p>${e.why ? `<p class="why">${esc(e.why)}</p>` : ''}</div>`).join('')}</div>` : ''}
    ${f.stronger_version ? `<div class="stronger"><div class="row-between"><p class="eyebrow">Stronger version</p><button class="btn small ghost" data-act="say" data-text="${esc(f.stronger_version)}">${icon('volume', 16)} Hear it</button></div><p>${esc(f.stronger_version)}</p><p class="muted small">Read it aloud once, then redo in your own words.</p></div>` : ''}
    ${f.word_upgrades.length ? `<div class="block"><p class="eyebrow">Word upgrades</p>${f.word_upgrades.map((u) => `<p class="upg"><s>${esc(u.vague)}</s> ${icon('chev', 14)} ${(u.sharper || []).map(esc).join(' · ')}</p>`).join('')}</div>` : ''}
    ${f.delivery ? `<p class="delivery">${icon('wave', 16)}<span>${esc(f.delivery)}</span></p>` : ''}
    ${f.structure_used ? `<p class="muted small">Structure you used: ${esc(f.structure_used)}</p>` : ''}`;
}

function coachInner(rep) {
  if (rep.ai && rep.ai.feedback) return feedbackHTML(rep);
  const c = RUNS.get(rep.id);
  if (c && c.state === 'loading') {
    return `<div class="coach-head">${icon('spark', 18)}<span>Coach</span><span class="muted small" id="coach-secs">${Math.round((Date.now() - c.t0) / 1000)}s</span></div>
      <p class="headline ${c.headline ? '' : 'muted'}">${esc(c.headline || (c.phase === 'writing' ? 'Writing your feedback…' : 'Reading your answer…'))}</p>
      <div class="shimmer" aria-hidden="true"><i></i><i></i><i></i></div>
      <p class="muted small">While you wait: read your transcript below. Can you spot the weakest sentence?</p>
      <button class="btn small link" data-act="s-coach-cancel" data-id="${rep.id}">Cancel</button>`;
  }
  const copy = `<button class="btn small ghost" data-act="s-copy" data-id="${rep.id}">${icon('copy', 16)} Copy prompt for Claude</button>`;
  if (c && c.state === 'error') {
    return `<div class="coach-head">${icon('spark', 18)}<span>Coach</span></div>
      <p class="err">${esc(c.message)}</p>
      <div class="row gap wrap"><button class="btn small primary" data-act="s-coach" data-id="${rep.id}">${icon('redo', 16)} Try again</button>${copy}${['auth', 'permission', 'model', 'nokey'].includes(c.code) ? '<a class="btn small ghost" href="#/settings">Settings</a>' : ''}</div>`;
  }
  if (!store.getKey()) {
    return `<div class="coach-head">${icon('spark', 18)}<span>Coach</span></div>
      <p>Get line-by-line feedback and a stronger version of this answer.</p>
      <div class="row gap wrap"><a class="btn small primary" href="#/settings/coach">Turn on the coach</a>${copy}<a class="btn small link" href="https://claude.ai/new" target="_blank" rel="noopener">Open Claude</a></div>
      <p class="muted small">No key? Copy the prompt and paste it into Claude. You get the same coaching there.</p>`;
  }
  const short = !rep.metrics || rep.metrics.words < 8;
  return `<div class="coach-head">${icon('spark', 18)}<span>Coach</span></div>
    <p>${short ? 'That one was very short. Get feedback anyway?' : 'Want the coach’s take on this rep?'}</p>
    <div class="row gap wrap"><button class="btn small primary" data-act="s-coach" data-id="${rep.id}">${icon('spark', 16)} Get feedback</button>${copy}</div>`;
}

function transcriptHTML(rep, editing) {
  if (editing || !rep.transcript) {
    const why = !rep.transcript ? (rep.mode === 'audio' ? 'This device recorded audio only.' : 'No words came through the speech recognizer.') : '';
    return `<div class="card"><h3>Your words</h3>${why ? `<p class="muted">${esc(why)} Type or paste what you said to get feedback. On iPhone, the keyboard’s mic button dictates here.</p>` : '<p class="muted small">Fix any words the recognizer got wrong, then re-analyze.</p>'}
      <textarea id="tx-edit" rows="6">${esc(rep.transcript || '')}</textarea>
      <div class="row gap"><button class="btn small primary" data-act="s-tx-save" data-id="${rep.id}">Analyze</button>${editing ? `<button class="btn small ghost" data-act="s-tx-cancel">Cancel</button>` : ''}</div></div>`;
  }
  const m = rep.metrics;
  return `<div class="card transcript">
    <div class="row-between"><h3>Your words</h3><button class="btn small ghost" data-act="s-tx-edit" data-id="${rep.id}">${icon('edit', 16)} Fix words</button></div>
    <p class="tx">${highlight(rep.transcript, findSpans(rep.transcript).spans)}</p>
    <p class="legend"><mark class="m-filler">filler</mark><mark class="m-hedge">hedge</mark><mark class="m-vague">vague</mark><span class="muted small">Browser transcripts drop most “um”s; your ears catch those.</span></p>
    ${m && m.notes && m.notes.length ? `<ul class="notes">${m.notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>` : ''}
  </div>`;
}

function playerHTML(rep, hunt) {
  if (!S.audio.has(rep.id)) return '';
  const taps = rep.selfTaps;
  return `<div class="card player ${hunt ? 'hunt' : ''}">
    <div class="row-between"><h3>${hunt ? 'Filler hunt' : 'Listen back'}</h3><span class="muted small" id="p-time">0:00</span></div>
    <p class="muted small">Play it and tap the button every time you hear “um”, “uh”, “like”, “basically”… Noticing them is how they disappear.</p>
    <div class="player-row">
      <button class="btn round" data-act="s-play" data-id="${rep.id}" id="p-btn" aria-label="Play">${icon('play', 22)}</button>
      <div class="pbar" id="p-bar"><b></b></div>
    </div>
    <button class="btn tap" data-act="s-tap" data-id="${rep.id}" id="tap-btn">${icon('ear', 20)} Heard a filler <b id="tap-n">${taps || 0}</b></button>
    <p class="muted small" id="tap-sum">${taps != null ? esc(tapSummary(rep)) : ''}</p>
  </div>`;
}

function tapSummary(rep) {
  const det = rep.metrics ? rep.metrics.filler : 0;
  const n = rep.selfTaps || 0;
  if (n === 0) return 'You counted none. Either it was clean, or listen again more closely.';
  return `You heard ${n}; the transcript caught ${det}. ${n > det ? 'Your ears are the better counter: most “um”s never reach the transcript.' : ''}`;
}

export function repBlocks(rep, { live = false, editing = false } = {}) {
  const d = DRILLS[rep.drill];
  const hunt = d.mode === 'clean';
  const issues = (rep.issues || []).filter((i) => ISSUE_TEXT[i] && i !== 'no-speech');
  return `
    ${issues.length ? `<div class="notice">${icon('info', 18)}<span>${issues.map((i) => esc(ISSUE_TEXT[i])).join(' ')}</span></div>` : ''}
    <div class="prompt-card quiet"><p class="eyebrow">${esc(d.name)} · ${rep.attempt > 1 ? 'Attempt ' + rep.attempt : 'First attempt'}</p><p class="prompt">${esc(rep.custom || rep.prompt)}</p></div>
    ${statsHTML(rep)}
    ${compareHTML(rep)}
    ${hunt ? playerHTML(rep, true) : ''}
    <div class="card coach" id="coach" data-id="${rep.id}">${coachInner(rep)}</div>
    ${wordCheckHTML(rep)}
    ${passesHTML(rep)}
    ${transcriptHTML(rep, editing)}
    ${hunt ? '' : playerHTML(rep, false)}
    ${live ? '' : ''}`;
}

function reviewView(st) {
  const rep = repById(R.cur.repId);
  if (!rep) return '';
  const d = DRILLS[rep.drill];
  const isLast = R.i >= R.steps.length - 1;
  const next = isLast ? (R.kind === 'daily' ? 'Finish today' : 'Finish') : `Next: ${ROLE[R.steps[R.i + 1].role]}`;
  const goal = (rep.ai && rep.ai.feedback && rep.ai.feedback.redo_goal) || (rep.metrics && rep.metrics.notes && rep.metrics.notes[0]) || '';
  const canRedo = (rep.attempt || 1) < 3;
  const redoPrimary = canRedo && st.role !== 'warm';
  return `<section class="stage review">
    ${repBlocks(rep, { live: true, editing: R.editing })}
    <div class="actions stack">
      ${canRedo ? `<button class="btn ${redoPrimary ? 'primary big' : 'ghost'}" data-act="s-redo">${icon('redo', 18)} ${redoPrimary ? 'Redo it' : 'Redo'}${goal && redoPrimary ? `<small>${esc(trunc(goal, 80))}</small>` : ''}</button>` : ''}
      <button class="btn ${redoPrimary ? 'ghost' : 'primary big'}" data-act="s-next">${esc(next)} ${icon('chev', 18)}</button>
    </div>
    ${d.mode === 'compress' || rep.attempt > 1 ? '' : '<p class="muted small center">The redo is where most of the improvement happens. Do it while the feedback is fresh.</p>'}
  </section>`;
}

function reflectView() {
  const reps = S.reps.filter((r) => r.day === today());
  const lastGoal = reps.map((r) => r.ai && r.ai.feedback && r.ai.feedback.redo_goal).filter(Boolean).pop() || '';
  return `<section class="stage">
    <p class="eyebrow">Wrap up · 20 seconds</p>
    <h1 class="h1">How did today feel?</h1>
    <div class="rating" role="group" aria-label="How did it feel">${['Rough', 'Meh', 'OK', 'Good', 'Great'].map((l, i) => `<button class="rate ${R.rating === i + 1 ? 'on' : ''}" data-act="s-rate" data-n="${i + 1}" aria-pressed="${R.rating === i + 1}">${l}</button>`).join('')}</div>
    <label class="lbl" for="refl">One thing you’ll do differently in your next real conversation</label>
    <textarea id="refl" rows="3" placeholder="e.g. Answer first in standup tomorrow.">${esc(R.note != null ? R.note : lastGoal)}</textarea>
    <p class="muted small">Writing down when and how you’ll use it makes it far more likely to show up in real life.</p>
    <div class="actions"><button class="btn primary big" data-act="s-reflect-save">Save and finish</button></div>
  </section>`;
}

function doneView() {
  const st = plan.streak(S.days);
  const reps = S.reps.filter((r) => r.day === today());
  const secs = reps.reduce((a, r) => a + (r.durationSec || 0), 0);
  let best = '';
  for (const r of reps) {
    const p = r.parent && repById(r.parent);
    if (p && p.metrics && r.metrics && p.metrics.crisp != null && r.metrics.crisp != null && r.metrics.crisp > p.metrics.crisp) {
      best = `Your redo beat your first try: crispness ${p.metrics.crisp} → ${r.metrics.crisp}.`;
    }
  }
  return `<section class="stage center done">
    <div class="flame-big">${icon('flame', 56)}</div>
    <h1 class="h1">${st.current}-day streak</h1>
    <p class="lede">${R.kind === 'daily' ? `Day ${R.plan.day} done. ` : ''}${plural(reps.length, 'rep')} today · ${fmtSec(secs)} spoken.</p>
    ${best ? `<p class="win">${icon('check', 18)} ${esc(best)}</p>` : ''}
    <div class="actions stack">
      <button class="btn primary big" data-act="s-home">Back to Today</button>
      <button class="btn ghost" data-act="s-more">One more rep</button>
      <a class="btn link" href="#/progress">See your progress</a>
    </div>
  </section>`;
}

// ---------- timers ----------------------------------------------------------------------------
function stopTick() { clearInterval(tick); tick = null; }
function startTick(fn, ms = 100) { stopTick(); tick = setInterval(fn, ms); }

function thinkTick() {
  const st = step();
  const left = Math.max(0, st.think - (performance.now() - R.thinkAt) / 1000);
  const el = $('#think-left'), ring = $('#think-ring');
  if (!el) return stopTick();
  el.textContent = Math.ceil(left);
  ring.style.setProperty('--p', String(1 - left / st.think));
  if (left <= 0) {
    stopTick();
    ring.classList.add('over');
    el.textContent = 'Go';
    const b = $('#go-btn');
    if (b) { b.classList.add('pulse'); b.innerHTML = `${icon('mic', 20)} Time’s up: speak`; }
    if (navigator.vibrate) navigator.vibrate(40);
  }
}

function liveTick() {
  const st = step();
  if (!R.cap) return stopTick();
  const t = R.cap.live ? R.cap.elapsed() : 0;
  const target = targetOf(st);
  const el = $('#live-time'), ring = $('#live-ring');
  if (el) el.textContent = fmtSec(t);
  if (ring) ring.style.setProperty('--p', String(Math.min(1, t / target)));
  if (t >= target && !R.over) {
    R.over = true;
    if (ring) ring.classList.add('over');
    setStatus('Time. Land your last sentence, then tap Done.');
    if (navigator.vibrate) navigator.vibrate([30, 60, 30]);
  }
  const hard = st.passes ? target + 10 : Math.min(300, Math.max(target * 1.5, target + 20));
  if (t >= hard) stopLive();
}

function setStatus(s) { const e = $('#live-status'); if (e) e.textContent = s; }

let levelRaf = 0, levelV = 0;
function onLevel(v) {
  levelV = v;
  if (levelRaf) return;
  levelRaf = requestAnimationFrame(() => {
    levelRaf = 0;
    const bars = document.querySelectorAll('#meter i');
    bars.forEach((b, i) => { const k = Math.abs(i - (bars.length - 1) / 2) / bars.length; b.style.transform = `scaleY(${Math.max(0.12, Math.min(1, levelV * (1.25 - k * 1.6) * (0.75 + Math.random() * 0.5)))})`; });
  });
}

function onText(t) {
  const box = $('#live-text');
  if (!box) return;
  box.textContent = t.replace(/\n/g, ' ');
  box.scrollTop = box.scrollHeight;
}

// ---------- capture -----------------------------------------------------------------------------
function beginLive() {
  stopTick();
  stopSpeaking();
  stopPlayer();
  const st = step();
  R.over = false;
  const cap = new Capture({
    mode: st.mode || S.settings.capture, lang: S.settings.lang,
    onText, onLevel,
    onLive: () => { setStatus(st.passes ? `Pass ${st.passIdx + 1}: speaking` : 'Speaking'); },
  });
  R.cap = cap;
  R.phase = 'live';
  render();
  // Must run inside the tap: iOS only unlocks audio and recognition from a user gesture.
  cap.start().then(() => {
    if (cap.mode === 'transcript' && !cap.hasAudio) { const m = $('#meter'); if (m) m.classList.add('idle'); }
  }).catch((e) => {
    R.cap = null;
    R.phase = 'brief';
    render();
    toast(e.message, 6000);
  });
  startTick(liveTick, 100);
}

async function stopLive() {
  if (!R || !R.cap || R.stopping) return;
  R.stopping = true;
  const st = step();
  const cap = R.cap;
  setStatus('Wrapping up…');
  const b = $('#stop-btn'); if (b) b.disabled = true;
  stopTick();
  let res;
  try { res = await cap.stop(); } catch (e) { res = { transcript: '', segments: [], durationSec: cap.elapsed(), audio: null, vad: null, mode: cap.mode, issues: [] }; }
  R.cap = null;
  R.stopping = false;
  await processResult(st, res);
}

async function processResult(st, res) {
  const target = targetOf(st);
  const metrics = analyze(res.transcript, { durationSec: res.durationSec, speechSec: res.vad && res.vad.speechSec, vad: res.vad, prompt: st.prompt, target });
  const take = { target, durationSec: res.durationSec, transcript: res.transcript, segments: res.segments, metrics, audio: res.audio };
  if (st.passes) {
    st.passResults.push(take);
    if (st.passIdx < st.passes.length - 1) { st.passIdx++; R.phase = 'between'; render(); return; }
  }
  const final = st.passes ? st.passResults[st.passResults.length - 1] : take;
  const rep = {
    id: store.uid(), ts: Date.now(), day: today(), drill: st.drill, role: st.role, kind: R.kind,
    prompt: st.prompt, promptIdx: st.promptIdx == null ? -1 : st.promptIdx, custom: st.custom || '',
    words: st.words ? st.words.map((w) => w[0]) : null,
    attempt: st.attempt, parent: st.parentRepId || null, target: final.target,
    durationSec: Math.round(st.passes ? st.passResults.reduce((a, p) => a + p.durationSec, 0) : final.durationSec),
    transcript: final.transcript, segments: final.segments, metrics: final.metrics,
    mode: res.mode, issues: res.issues || [],
    passes: st.passes ? st.passResults.map((p) => ({ target: p.target, durationSec: Math.round(p.durationSec), transcript: p.transcript, segments: p.segments, metrics: p.metrics })) : null,
    ai: null, selfTaps: null,
  };
  await putRep(rep);
  if (final.audio && S.settings.keepAudio > 0) {
    if (await store.saveAudio(rep.id, final.audio.blob, final.audio.mime, S.settings.keepAudio)) S.audio = await store.audioIds();
  }
  markDay(rep);
  R.cur = { repId: rep.id };
  R.editing = false;
  st.lastRepId = rep.id;
  R.phase = 'review';
  render();
  window.scrollTo(0, 0);
  if (store.getKey() && st.role !== 'warm' && rep.metrics && rep.metrics.words >= 8) runCoach(rep);
}

function markDay(rep) {
  const k = rep.day;
  const day = S.days[k] || {};
  day.reps = (day.reps || 0) + 1;
  day.seconds = Math.round((day.seconds || 0) + (rep.durationSec || 0));
  if (R && R.kind === 'daily') { day.plan = day.plan || R.plan; if (rep.role === 'main') day.done = true; }
  S.days[k] = day;
  saveDays();
}

// ---------- coach -----------------------------------------------------------------------------
export function coachInput(rep) {
  const parent = rep.parent && repById(rep.parent);
  return {
    drill: DRILLS[rep.drill], prompt: rep.custom || rep.prompt, target: rep.target, attempt: rep.attempt || 1,
    transcript: rep.transcript, segments: rep.segments, metrics: rep.metrics, about: S.settings.about,
    custom: rep.custom, words: rep.words ? rep.words.map((w) => WORDS.find((x) => x[0] === w) || [w, '']) : null,
    prev: parent ? { transcript: parent.transcript, segments: parent.segments, redoGoal: parent.ai && parent.ai.feedback && parent.ai.feedback.redo_goal } : null,
    passes: rep.passes || null,
  };
}

function patchCoach(rep) {
  const box = document.getElementById('coach');
  if (box && box.dataset.id === rep.id) box.innerHTML = coachInner(rep);
}

export async function runCoach(rep) {
  const old = RUNS.get(rep.id);
  if (old && old.state === 'loading') return;
  const ctrl = new AbortController();
  const run = { state: 'loading', phase: 'thinking', t0: Date.now(), headline: '', ctrl };
  RUNS.set(rep.id, run);
  patchCoach(rep);
  const secs = setInterval(() => { const e = document.getElementById('coach-secs'); if (e && document.getElementById('coach').dataset.id === rep.id) e.textContent = Math.round((Date.now() - run.t0) / 1000) + 's'; }, 1000);
  try {
    const out = await coach({
      apiKey: store.getKey(), model: S.settings.model, effort: S.settings.effort, input: coachInput(rep), signal: ctrl.signal,
      onPhase: (p) => { run.phase = p; if (!run.headline) patchCoach(rep); },
      onText: (t) => { const h = partialHeadline(t); if (h && h !== run.headline) { run.headline = h; patchCoach(rep); } },
    });
    rep.ai = { feedback: out.feedback, model: out.model, cost: out.cost, at: Date.now() };
    await putRep(rep);
    addUsage(out.cost, out.usage);
    if (rep.words) {
      for (const w of out.feedback.word_check || []) if (w.used && w.natural && w.word) { const k = w.word.toLowerCase(); S.wordsUsed[k] = (S.wordsUsed[k] || 0) + 1; }
      saveWords();
    }
    RUNS.delete(rep.id);
  } catch (e) {
    if (e.code === 'aborted') RUNS.delete(rep.id);
    else RUNS.set(rep.id, { state: 'error', message: e.message, code: e.code });
  } finally {
    clearInterval(secs);
  }
  const box = document.getElementById('coach');
  if (!box || box.dataset.id !== rep.id) return;
  const y = window.scrollY;
  if (inSession() && R.phase === 'review' && R.cur && R.cur.repId === rep.id) render();
  else window.dispatchEvent(new CustomEvent('speak:rep', { detail: rep.id }));
  window.scrollTo(0, y);
}

// ---------- playback & filler hunt ---------------------------------------------------------------
function stopPlayer() {
  if (player) { try { player.audio.pause(); } catch { /* ignore */ } URL.revokeObjectURL(player.url); player = null; }
}

async function prepPlayer(id) {
  if (!id || !S.audio.has(id)) return;
  if (player && player.id === id) return;
  stopPlayer();
  const rec = await store.getAudio(id);
  if (!rec || !rec.blob) return;
  const url = URL.createObjectURL(rec.blob);
  const audio = new Audio();
  audio.preload = 'auto';
  audio.src = url;
  player = { id, audio, url, taps: null };
  audio.addEventListener('timeupdate', () => {
    const bar = document.querySelector('#p-bar b'), t = document.getElementById('p-time');
    const dur = isFinite(audio.duration) ? audio.duration : 0;
    if (bar && dur) bar.style.width = (100 * audio.currentTime / dur) + '%';
    if (t) t.textContent = fmtSec(audio.currentTime) + (dur ? ' / ' + fmtSec(dur) : '');
  });
  const setBtn = (playing) => { const b = document.getElementById('p-btn'); if (b) { b.innerHTML = icon(playing ? 'pause' : 'play', 22); b.setAttribute('aria-label', playing ? 'Pause' : 'Play'); } };
  audio.addEventListener('play', () => setBtn(true));
  audio.addEventListener('pause', () => setBtn(false));
  audio.addEventListener('ended', async () => {
    setBtn(false);
    const rep = repById(id);
    if (rep && player && player.taps != null) {
      rep.selfTaps = player.taps;
      await putRep(rep);
      const s = document.getElementById('tap-sum');
      if (s) s.textContent = tapSummary(rep);
    }
  });
}
export { prepPlayer, stopPlayer };

on('s-play', async (el) => {
  const id = el.dataset.id;
  if (!player || player.id !== id) { await prepPlayer(id); }
  if (!player) return toast('That recording is no longer on this device.');
  if (player.audio.paused) {
    if (player.audio.ended || player.audio.currentTime === 0) { player.taps = 0; const n = document.getElementById('tap-n'); if (n) n.textContent = '0'; }
    player.audio.play().catch(() => toast('Tap play again to start the audio.'));
  } else player.audio.pause();
});

on('s-tap', (el) => {
  if (!player || player.id !== el.dataset.id) return toast('Press play first, then tap each time you hear a filler.');
  if (player.taps == null) player.taps = 0;
  player.taps++;
  const n = document.getElementById('tap-n');
  if (n) n.textContent = player.taps;
  el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump');
  if (navigator.vibrate) navigator.vibrate(12);
});

// ---------- actions -------------------------------------------------------------------------------
on('s-ritual-done', () => { R.ritual = false; enterStep(R.i); });
on('s-ritual-off', () => { saveSettings({ ritual: false }); R.ritual = false; enterStep(R.i); toast('Turned off. You can bring it back in Settings.'); });
on('s-lesson-done', () => { R.phase = 'brief'; render(); });

on('s-shuffle', () => { const st = step(); const pk = plan.pickPrompt(st.drill, S.reps, st.promptIdx); st.prompt = pk.text; st.promptIdx = pk.idx; if (DRILLS[st.drill].mode === 'words') st.words = plan.pickWords(S.wordsUsed); render(); });
on('s-own', () => { step().editing = true; render(); setTimeout(() => { const t = $('#own'); if (t) { t.focus(); t.select(); } }, 30); });
on('s-own-cancel', () => { step().editing = false; render(); });
on('s-own-save', () => {
  const st = step(); const v = ($('#own').value || '').trim();
  if (v.length < 8) return toast('Write a full question or situation.');
  st.prompt = v; st.promptIdx = -1; st.editing = false; render();
});

function readCustom(st) {
  const v = (($('#custom') || {}).value || '').trim();
  if (v.length < 10) { toast('Describe what you’re rehearsing first: who’s listening and what you need.'); return false; }
  st.custom = v;
  st.prompt = v.length > 160 ? v.slice(0, 157) + '…' : v;
  st.speak = parseInt(($('#custom-time') || {}).value, 10) || 90;
  return true;
}

on('s-think', () => {
  const st = step();
  if (st.editing) return toast('Save or cancel your prompt first.');
  if (DRILLS[st.drill].custom && !readCustom(st)) return;
  R.phase = 'think';
  R.thinkAt = performance.now();
  render();
  startTick(thinkTick, 100);
});

on('s-speak', () => {
  const st = step();
  if (R.phase === 'brief') {
    if (st.editing) return toast('Save or cancel your prompt first.');
    if (DRILLS[st.drill].custom && !readCustom(st)) return;
  }
  beginLive();
});

on('s-stop', () => stopLive());
on('s-mode', (el) => { step().mode = el.dataset.v || null; render(); });
on('s-cancel', () => {
  if (R.cap) R.cap.cancel();
  R.cap = null;
  stopTick();
  resetPasses(step());
  R.phase = 'brief';
  render();
});

on('s-redo', () => {
  const st = step();
  const rep = repById(R.cur.repId);
  stopPlayer(); stopSpeaking();
  st.attempt = (rep.attempt || 1) + 1;
  st.parentRepId = rep.id;
  st.redoGoal = (rep.ai && rep.ai.feedback && rep.ai.feedback.redo_goal) || (rep.metrics && rep.metrics.notes && rep.metrics.notes[0]) || '';
  st.think = plan.thinkTime(st.drill, S.reps, st.attempt);
  resetPasses(st);
  R.phase = 'brief';
  render();
});

on('s-next', () => {
  stopPlayer(); stopSpeaking();
  // Feedback still loading keeps going in the background and is saved to the rep (see History).
  if (R.i < R.steps.length - 1) enterStep(R.i + 1);
  else { R.phase = R.kind === 'daily' ? 'reflect' : 'done'; render(); }
});

on('s-coach', (el) => { const rep = repById(el.dataset.id); if (rep) runCoach(rep); });
on('s-coach-cancel', (el) => { const run = RUNS.get(el.dataset.id); if (run && run.ctrl) run.ctrl.abort(); });
on('s-copy', async (el) => {
  const rep = repById(el.dataset.id);
  if (!rep) return;
  const ok = await copyText(copyPrompt(coachInput(rep)));
  toast(ok ? 'Copied. Paste it into Claude for full feedback.' : 'Couldn’t copy on this browser.');
});

on('s-tx-edit', (el) => { if (inSession()) { R.editing = true; render(); } else window.dispatchEvent(new CustomEvent('speak:edit', { detail: el.dataset.id })); });
on('s-tx-cancel', () => { if (inSession()) { R.editing = false; render(); } else window.dispatchEvent(new CustomEvent('speak:edit', { detail: null })); });
on('s-tx-save', async (el) => {
  const rep = repById(el.dataset.id);
  const v = ($('#tx-edit').value || '').trim();
  if (!rep) return;
  if (v.split(/\s+/).length < 3) return toast('Add a few more words first.');
  rep.transcript = v;
  rep.segments = [];
  rep.metrics = analyze(v, { durationSec: rep.metrics ? rep.metrics.durationSec : rep.durationSec, prompt: rep.prompt, target: rep.target, vad: rep.metrics && rep.metrics.pauses != null ? { pauses: rep.metrics.pauses, longPauses: rep.metrics.longPauses, longestPause: rep.metrics.longestPause, startLatency: rep.metrics.startLatency } : null });
  rep.ai = null;
  await putRep(rep);
  RUNS.delete(rep.id);
  if (inSession()) { R.editing = false; render(); } else window.dispatchEvent(new CustomEvent('speak:edit', { detail: null }));
  if (store.getKey()) runCoach(rep);
});

on('s-rate', (el) => { R.rating = +el.dataset.n; R.note = ($('#refl') || {}).value; render(); });
on('s-reflect-save', () => {
  const k = today();
  const note = (($('#refl') || {}).value || '').trim();
  S.days[k] = { ...(S.days[k] || {}), reflection: { rating: R.rating || null, note } };
  saveDays();
  R.phase = 'done';
  render();
});
on('s-home', () => { exitSession(); go('#/today'); });
on('s-more', () => { const main = R && R.steps.find((s) => s.role === 'main'); const id = main ? main.drill : 'answer-first'; exitSession(); startFree(id); });
on('s-exit', () => {
  if (R && R.cap && !confirm('Stop recording and leave? This rep won’t be saved.')) return;
  exitSession();
  go('#/today');
});
on('say', (el) => {
  const t = el.dataset.text;
  if (el.classList.contains('speaking')) { stopSpeaking(); el.classList.remove('speaking'); return; }
  document.querySelectorAll('.speaking').forEach((x) => x.classList.remove('speaking'));
  if (!speak(t, S.settings.lang, () => el.classList.remove('speaking'))) return toast('This browser can’t read text aloud.');
  el.classList.add('speaking');
});

export function captureModeNow() { return resolveMode(S.settings.capture); }
export { MODE_LABEL };
