// The AI coach: sends a transcript and its metrics to Claude, straight from the browser, with the
// user's own API key (kept only in this browser). Returns structured feedback for the review screen.

export const MODELS = [
  { id: 'claude-opus-5-5', name: 'Claude Opus 5.5', short: 'Opus 5.5 · sharpest (default)', note: 'Sharpest coaching (default)' },
  { id: 'claude-sonnet-5-5', name: 'Claude Sonnet 5.5', short: 'Sonnet 5.5 · faster, half the cost', note: 'Faster, about half the cost' },
  { id: 'claude-haiku-5-5', name: 'Claude Haiku 5.5', short: 'Haiku 5.5 · fastest, lighter', note: 'Fastest and cheapest, lighter feedback' },
];

// USD per million tokens: input, output, cache write, cache read. Approximate, for the spend counter.
const PRICES = {
  'claude-opus-5-5': [4, 20, 5, 0.2],
  'claude-sonnet-5-5': [2, 10, 2.5, 0.1],
  'claude-haiku-5-5': [0.1, 0.5, 0.125, 0.01],
  'claude-opus-5': [5, 25, 6.25, 0.5],
  'claude-sonnet-5': [2, 10, 2.5, 0.2],
  'claude-opus-4-8': [5, 25, 6.25, 0.5],
};

export const SYSTEM = `You are a speaking coach for one person: a software / AI engineer who practises out loud for 5–10 minutes a day so they can communicate like the clearest, most persuasive person in the room: in technical discussions, interviews and presentations. After each attempt you receive what they said (a speech-recognition transcript) plus measured delivery metrics, and you give feedback they can use in their very next attempt. Address them directly as "you".

What great sounds like
- The point comes first, and the structure is easy to hear: signposts, short sentences, a clean ending.
- Precision: concrete nouns, numbers and examples instead of vague words. The right word, not the fanciest one.
- Calibrated confidence: claims stated plainly; real uncertainty stated once and precisely (a number or a condition), not spread across every sentence as hedges.
- Spoken English, not written English. It should sound like a sharp person talking, not an essay read aloud.

How to coach
- Be specific. Quote their exact words when you point at a problem, and show the better version. Never give generic advice ("be more confident", "add examples") without showing what that sounds like for this answer.
- Prioritize. Pick the one change that would most improve this answer; that is fix_first and the redo goal. Everything else is secondary.
- Be honest and warm, like a coach who believes in them. Name what genuinely worked and never invent praise. Calibrate scores: 5 is a typical engineer, 7 is clearly good, 9 is exceptional and rare. Don't inflate.
- Respect their voice. Never treat accent or regional English (for example Indian English) as an error. Do point out phrasing that a global professional audience might find unclear or unidiomatic, gently, with a natural alternative.
- The stronger version rewrites THEIR answer: keep their content, facts and intent; improve structure, precision and flow; keep it speakable within the time limit at a normal pace. Never invent facts, numbers or achievements. Where a specific would help, use a placeholder such as [number] or [example].
- Judge against the drill's rubric and the stated audience.

About the input
- The transcript comes from browser speech recognition. It usually drops "um" and "uh", often lacks punctuation, and may mishear words, especially technical terms and names. Don't penalize likely recognition errors; infer the intended words. Line breaks mark recognized phrases, and [m:ss] marks roughly when a phrase began.
- Filler, hedge and pace numbers in the metrics are computed separately; use them for the delivery note.
- On a redo you also get the previous attempt and its redo goal. Say in progress_note whether they met the goal and what improved or slipped. Scores always reflect this attempt's absolute quality.
- If the transcript is empty, very short or off-topic, say so kindly in the headline and give the most useful guidance you can for the next attempt.`;

const str = (description) => ({ type: 'string', description });
const int = (description) => ({ type: 'integer', description });
const obj = (properties) => ({ type: 'object', additionalProperties: false, required: Object.keys(properties), properties });

export const SCHEMA = obj({
  headline: str('One-sentence verdict, specific to this answer.'),
  scores: obj({
    overall: int('1-10'), clarity: int('1-10'), structure: int('1-10'),
    concision: int('1-10'), confidence: int('1-10'), precision: int('1-10'),
  }),
  structure_used: str('The shape they actually used, e.g. "Context → context → point at 0:40 → trailing summary".'),
  worked: { type: 'array', items: { type: 'string' }, description: '1-2 specific strengths, quoting them where possible.' },
  fix_first: obj({
    issue: str('The single most important problem.'),
    why: str('Why it matters to the listener.'),
    how: str('Exactly what to do differently on the redo, with an example line.'),
  }),
  line_edits: {
    type: 'array', description: '2-4 rewrites of specific lines.',
    items: obj({ said: str('Exact quote from the transcript.'), better: str('How to say it.'), why: str('Short reason.') }),
  },
  word_upgrades: {
    type: 'array', description: '0-3 vague words or phrases they used, with sharper alternatives that fit this context.',
    items: obj({ vague: str('What they said.'), sharper: { type: 'array', items: { type: 'string' } } }),
  },
  stronger_version: str('Their answer as a sharp communicator would say it aloud. Same facts; placeholders like [number] for missing specifics.'),
  redo_goal: str('One short instruction for the next attempt.'),
  progress_note: str('Redo attempts only: whether they met the previous redo goal and what improved or slipped. Empty string on a first attempt.'),
  word_check: {
    type: 'array', description: 'Word Upgrade drill only: one entry per target word. Empty array for every other drill.',
    items: obj({ word: { type: 'string' }, used: { type: 'boolean' }, natural: { type: 'boolean' }, note: str('How they used it, or a natural example sentence.') }),
  },
  delivery: str('One sentence on pace, pauses and fillers from the metrics. Empty string if nothing is notable.'),
});

const mmss = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

function withTimes(transcript, segments) {
  if (segments && segments.length) return segments.map((s) => `[${mmss(s.t || 0)}] ${s.text}`).join('\n');
  return transcript || '(no words were captured)';
}

function metricLine(m) {
  if (!m) return 'unavailable';
  const top = (list) => (list && list.length ? ': ' + list.map(([t, n]) => `${t}×${n}`).join(', ') : '');
  const parts = [
    `${m.words} words in ${m.durationSec}s`, `${m.wpm} wpm`,
    `fillers ${m.filler} (${m.fillerPerMin}/min${top(m.topFillers)})`,
    `hedges ${m.hedge} (${m.hedgePerMin}/min${top(m.topHedges)})`,
    `vague words ${m.vague}${top(m.topVague)}`,
  ];
  if (m.pauses != null) parts.push(`pauses ≥0.5s: ${m.pauses}, ≥2s: ${m.longPauses}, longest ${m.longestPause}s`);
  if (m.weakOpen) parts.push(`opened with "${m.weakOpen}"`);
  if (m.weakEnd) parts.push(`ended with "${m.weakEnd}"`);
  return parts.join(' · ');
}

// input: { drill, prompt, target, attempt, transcript, segments, metrics, about, custom, words, prev, passes }
export function buildUserMessage(i) {
  const d = i.drill;
  const L = [];
  L.push(`DRILL: ${d.name}: ${d.tagline}`);
  L.push(`FRAMEWORK: ${d.scaffold.map((s) => s[0]).join(' → ')}`);
  L.push(`WHAT GREAT LOOKS LIKE: ${d.rubric}`);
  L.push(`PROMPT: ${i.prompt}`);
  if (i.custom) L.push(`THE REAL SITUATION, IN THE SPEAKER'S WORDS: ${i.custom}`);
  if (i.words && i.words.length) L.push(`TARGET WORDS (use each one naturally): ${i.words.map(([w, m]) => `${w} (${m})`).join('; ')}`);
  if (!i.passes) L.push(`TIME LIMIT: ${i.target}s`);
  if (i.about) L.push(`ABOUT THE SPEAKER (their own notes; use them to judge accuracy and to tailor the stronger version): ${i.about}`);
  L.push(`ATTEMPT: ${i.attempt || 1}${(i.attempt || 1) > 1 ? ' (a redo of the same prompt)' : ''}`);
  if (i.prev) {
    L.push('', 'PREVIOUS ATTEMPT:', withTimes(i.prev.transcript, i.prev.segments));
    L.push(`PREVIOUS REDO GOAL: ${i.prev.redoGoal || '(none given)'}`);
  }
  if (i.passes) {
    L.push('This drill has several passes of the same message with less time each. Judge the progression, and the final pass most.');
    i.passes.forEach((p, n) => {
      L.push('', `PASS ${n + 1} (limit ${p.target}s, spoke ${Math.round(p.durationSec)}s) · ${metricLine(p.metrics)}`, withTimes(p.transcript, p.segments));
    });
  } else {
    L.push('', `METRICS: ${metricLine(i.metrics)}`, '', 'TRANSCRIPT:', withTimes(i.transcript, i.segments));
  }
  return L.join('\n');
}

export function copyPrompt(i) {
  const extras = [i.prev ? 'Progress since last attempt' : '', i.words && i.words.length ? 'Target words check' : ''].filter(Boolean);
  return `${SYSTEM}

Reply in Markdown with these sections: Verdict (one sentence) · Scores (overall, clarity, structure, concision, confidence, precision; 1–10) · What worked · Fix this first (issue, why, how) · Line edits (said → better, why) · Word upgrades · Stronger version · Redo goal${extras.length ? ' · ' + extras.join(' · ') : ''}.

${buildUserMessage(i)}`;
}

export class CoachError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

let sdkP = null;
function sdk() {
  if (!sdkP) sdkP = import('../vendor/anthropic-sdk.mjs').then((m) => m.default).catch((e) => { sdkP = null; throw new CoachError('load', 'Couldn\'t load the coach. Check your connection and reload. (' + e.message + ')'); });
  return sdkP;
}

async function client(apiKey) {
  const Anthropic = await sdk();
  return { Anthropic, c: new Anthropic({ apiKey, dangerouslyAllowBrowser: true, maxRetries: 2, timeout: 180000 }) };
}

function friendly(e, A) {
  if (e instanceof CoachError) return e;
  if (A) {
    if (e instanceof A.APIUserAbortError) return new CoachError('aborted', 'Cancelled.');
    if (e instanceof A.AuthenticationError) return new CoachError('auth', 'Anthropic rejected this API key. Check it in Settings.');
    if (e instanceof A.PermissionDeniedError) return new CoachError('permission', 'This key isn\'t allowed to use that model. Pick another model in Settings, or check the key in the Anthropic Console.');
    if (e instanceof A.NotFoundError) return new CoachError('model', 'That model isn\'t available to your account. Pick another model in Settings.');
    if (e instanceof A.RateLimitError) return new CoachError('rate', 'Anthropic is rate-limiting this key. Wait a minute and try again.');
    if (e instanceof A.BadRequestError) return new CoachError('bad', 'Anthropic rejected the request: ' + (e.message || 'bad request'));
    if (e instanceof A.APIConnectionError) return new CoachError('network', 'Couldn\'t reach Anthropic. Check your connection and try again.');
    if (e instanceof A.InternalServerError) return new CoachError('server', 'Anthropic is having trouble right now. Try again in a moment.');
    if (e instanceof A.APIError) return new CoachError('api', e.message || 'The API returned an error.');
  }
  if (e && e.name === 'AbortError') return new CoachError('aborted', 'Cancelled.');
  return new CoachError('unknown', (e && e.message) || String(e));
}

export function costOf(model, u) {
  const p = PRICES[model] || PRICES['claude-opus-5-5'];
  if (!u) return 0;
  return ((u.input_tokens || 0) * p[0] + (u.output_tokens || 0) * p[1] + (u.cache_creation_input_tokens || 0) * p[2] + (u.cache_read_input_tokens || 0) * p[3]) / 1e6;
}

const clamp = (n) => Math.max(1, Math.min(10, Math.round(Number(n) || 0))) || 1;

function normalize(f) {
  const s = f.scores || {};
  return {
    headline: f.headline || '',
    scores: { overall: clamp(s.overall), clarity: clamp(s.clarity), structure: clamp(s.structure), concision: clamp(s.concision), confidence: clamp(s.confidence), precision: clamp(s.precision) },
    structure_used: f.structure_used || '',
    worked: Array.isArray(f.worked) ? f.worked.slice(0, 3) : [],
    fix_first: f.fix_first || { issue: '', why: '', how: '' },
    line_edits: Array.isArray(f.line_edits) ? f.line_edits.slice(0, 5) : [],
    word_upgrades: Array.isArray(f.word_upgrades) ? f.word_upgrades.slice(0, 4) : [],
    stronger_version: f.stronger_version || '',
    redo_goal: f.redo_goal || '',
    progress_note: f.progress_note || '',
    word_check: Array.isArray(f.word_check) ? f.word_check : [],
    delivery: f.delivery || '',
  };
}

// Pulls the headline out of a partial JSON stream so the review screen can show it early.
export function partialHeadline(text) {
  const m = /"headline"\s*:\s*"((?:[^"\\]|\\.)*)/.exec(text || '');
  if (!m) return '';
  try { return JSON.parse('"' + m[1].replace(/\\$/, '') + '"'); } catch { return m[1]; }
}

export async function coach({ apiKey, model = 'claude-opus-5-5', effort = 'medium', input, onPhase = () => {}, onText = () => {}, signal }) {
  if (!apiKey) throw new CoachError('nokey', 'Add your Anthropic API key in Settings to turn on the coach.');
  const { Anthropic, c } = await client(apiKey).catch((e) => { throw friendly(e); });
  const params = {
    model,
    max_tokens: 8000,
    output_config: { effort, format: { type: 'json_schema', schema: SCHEMA } },
    system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: buildUserMessage(input) }],
  };
  // Server-side fallback re-runs a declined request on another model inside the same call.
  // Haiku has no fallback target, so it goes without.
  if (!model.startsWith('claude-haiku')) {
    params.betas = ['server-side-fallback-2026-07-01'];
    params.fallbacks = 'default';
  }
  onPhase('thinking');
  let msg;
  try {
    const stream = c.beta.messages.stream(params, { signal });
    let writing = false;
    stream.on('text', (_delta, snapshot) => {
      if (!writing) { writing = true; onPhase('writing'); }
      onText(snapshot);
    });
    msg = await stream.finalMessage();
  } catch (e) {
    throw friendly(e, Anthropic);
  }
  if (msg.stop_reason === 'refusal') {
    const cat = msg.stop_details && msg.stop_details.category;
    throw new CoachError('refusal', `Claude declined to review this attempt${cat ? ` (${cat})` : ''}. Try a different prompt, or rephrase.`);
  }
  // With a fallback, only the text after the last switch point belongs to the model that answered.
  const blocks = msg.content || [];
  let from = 0;
  blocks.forEach((b, idx) => { if (b.type === 'fallback') from = idx + 1; });
  const text = blocks.slice(from).filter((b) => b.type === 'text').map((b) => b.text).join('');
  let parsed;
  try { parsed = JSON.parse(text); } catch {
    throw new CoachError(msg.stop_reason === 'max_tokens' ? 'cutoff' : 'parse',
      msg.stop_reason === 'max_tokens' ? 'The feedback was cut off. Try again, or set Coach depth to Low in Settings.' : 'The coach replied in an unexpected format. Try again.');
  }
  const served = msg.model || model;
  return { feedback: normalize(parsed), model: served, usage: msg.usage, cost: costOf(served, msg.usage) };
}

// Free check that the key works and can use the model (token counting isn't billed).
export async function testKey(apiKey, model = 'claude-opus-5-5') {
  const { Anthropic, c } = await client(apiKey).catch((e) => { throw friendly(e); });
  try {
    await c.messages.countTokens({ model, messages: [{ role: 'user', content: 'Hello' }] });
    return true;
  } catch (e) { throw friendly(e, Anthropic); }
}
