// Instant, local analysis of a spoken transcript: fillers, hedges, vague words, pace, openings and endings.
// Browser speech recognition usually drops "um"/"uh", so vocal fillers are under-counted; lexical crutches
// ("basically", "you know", "like") come through and are what this mostly measures.

export const CATS = {
  filler: { label: 'Filler', plural: 'Fillers', tip: 'Adds sound, not meaning. Try a short pause instead.' },
  hedge: { label: 'Hedge', plural: 'Hedges', tip: 'Softens your claim. Keep it only if the doubt is real, and then put a number on it.' },
  vague: { label: 'Vague', plural: 'Vague words', tip: 'A sharper word, or a number, would carry more meaning.' },
};

const SENT_START_FILLERS = new Set(['so', 'well', 'okay', 'ok', 'see', 'like', 'right', 'yeah', 'anyway', 'anyways']);
const LIKE_FILLER_PREV = new Set(['and', 'so', 'but', 'or', 'um', 'uh', 'umm', 'uhh', 'yeah', 'okay', 'ok', 'basically', 'actually', 'literally', 'mean', 'know']);
const KIND_OF_TYPE_PREV = new Set(['what', 'this', 'that', 'the', 'a', 'an', 'any', 'some', 'every', 'which', 'one', 'same', 'different', 'other', 'these', 'those', 'all', 'no', 'each', 'certain', 'right', 'wrong']);
const PRETTY_NEXT = new Set(['good', 'bad', 'much', 'cool', 'nice', 'well', 'big', 'easy', 'hard', 'fast', 'slow', 'sure', 'great', 'interesting', 'simple', 'straightforward', 'quick', 'clear', 'important', 'decent']);

const isNum = (t) => /^\d/.test(t) || /^(one|two|three|four|five|six|seven|eight|nine|ten|twenty|thirty|forty|fifty|hundred|thousand|a)$/.test(t);

// [phrase, category, condition?]. Longest phrase wins at each position.
const LEXICON = [
  // vocal fillers (rarely survive browser transcription, but count them when they do)
  ...['um', 'umm', 'ummm', 'uh', 'uhh', 'uhm', 'er', 'erm', 'ah', 'ahh', 'hmm', 'mm', 'mmm'].map((p) => [p, 'filler']),
  // crutch words and runway phrases
  ['you know', 'filler', (c) => !['do', 'did', "don't", 'if', 'as', 'would', 'will', 'might', 'probably'].includes(c.prev(0)) && !['how', 'what', 'that', 'about', 'the', 'it', 'this', 'him', 'her', 'them', 'me', 'us', 'more', 'where', 'when', 'why', 'who', 'which', 'whether'].includes(c.next(0))],
  ['you know what i mean', 'filler'],
  ['i mean', 'filler', (c) => c.prev(0) !== 'what' && c.prev(0) !== 'do' && !['that', 'it', 'to', 'by', 'what', 'this'].includes(c.next(0))],
  ['basically', 'filler'], ['actually', 'filler'], ['literally', 'filler'], ['essentially', 'filler'],
  ['honestly', 'filler'], ['to be honest', 'filler'], ['obviously', 'filler'],
  ['you see', 'filler'], ['okay so', 'filler'], ['ok so', 'filler'], ['yeah so', 'filler'], ['so yeah', 'filler'], ['and yeah', 'filler'],
  ['right so', 'filler'], ['and all', 'filler', (c) => c.atBoundaryAfter()], ['what to say', 'filler'],
  ['the thing is', 'filler'], ['what happens is', 'filler'], ['at the end of the day', 'filler'], ['let me tell you', 'filler'],
  ['like', 'filler', (c) => c.atSentenceStart() || LIKE_FILLER_PREV.has(c.prev(0)) || isNum(c.next(0)) || ['um', 'uh', 'basically', 'actually', 'literally'].includes(c.next(0))],
  ['so', 'filler', (c) => c.atSentenceStart() && !['that', 'far', 'much', 'many', 'long'].includes(c.next(0))],
  ['well', 'filler', (c) => c.atSentenceStart() && !['being', 'known', 'done'].includes(c.next(0))],
  ['okay', 'filler', (c) => c.atSentenceStart()], ['ok', 'filler', (c) => c.atSentenceStart()],
  ['see', 'filler', (c) => c.atSentenceStart() && !['you', 'if', 'the', 'how', 'what', 'that', 'this', 'it'].includes(c.next(0))],
  ['anyway', 'filler', (c) => c.atSentenceStart()], ['anyways', 'filler'],
  ['right', 'filler', (c) => c.atBoundaryAfter() && !['the', 'now', 'away', 'thing', 'answer', 'one', "that's", 'is', 'all', 'turn', 'left', 'it', 'you\'re', 'be', 'get', 'got', 'exactly', 'quite', 'not', 'are', 'was', 'were'].includes(c.prev(0))],
  ['yeah', 'filler', (c) => c.atSentenceStart() || c.atEnd()],
  // hedges and cushions
  ['i think', 'hedge'], ['i guess', 'hedge'], ['i feel like', 'hedge'], ['i suppose', 'hedge'], ['i believe', 'hedge'],
  ['i would say', 'hedge'], ["i'd say", 'hedge'], ['i would think', 'hedge'], ['in my opinion', 'hedge'],
  ['maybe', 'hedge'], ['perhaps', 'hedge'], ['probably', 'hedge'], ['possibly', 'hedge'], ['hopefully', 'hedge'],
  ['kind of', 'hedge', (c) => !KIND_OF_TYPE_PREV.has(c.prev(0))], ['sort of', 'hedge', (c) => !KIND_OF_TYPE_PREV.has(c.prev(0))],
  ['kinda', 'hedge'], ['sorta', 'hedge'], ['a little bit', 'hedge'], ['a bit', 'hedge'], ['somewhat', 'hedge'],
  ['more or less', 'hedge'], ['to some extent', 'hedge'], ['in a way', 'hedge'], ['you could say', 'hedge'],
  ["i'm not sure", 'hedge'], ['not sure', 'hedge'], ['i don\'t know', 'hedge', (c) => c.next(0) !== 'how' && c.next(0) !== 'what' && c.next(0) !== 'if' && c.next(0) !== 'whether'],
  ['does that make sense', 'hedge'], ['if that makes sense', 'hedge'], ['just', 'hedge', (c) => !['in', 'now', 'as', 'because', 'before', 'after', 'like', 'right', 'about', 'then', 'enough'].includes(c.next(0))],
  ['sorry', 'hedge'],
  // neutral phrases: consumed so their words are not flagged
  ...['good question', 'good morning', 'good afternoon', 'good evening', 'good luck', 'good news', 'bad news', 'a good fit', 'really appreciate', 'just in time', 'so that', 'so far', 'so much', 'so many', 'like i said', 'feel like a', 'looks like', 'look like', 'sounds like', 'seems like', 'would like', "i'd like", 'just like', 'things like', 'something like', 'more like', 'like this one'].map((p) => [p, 'ok']),
  // vague words
  ['thing', 'vague'], ['things', 'vague'], ['stuff', 'vague'], ['very', 'vague'], ['really', 'vague'], ['super', 'vague'],
  ['a lot', 'vague'], ['a lot of', 'vague'], ['lots of', 'vague'], ['lots', 'vague'],
  ['good', 'vague'], ['bad', 'vague'], ['nice', 'vague'],
  ['pretty sure', 'hedge'], ...[...PRETTY_NEXT].filter((w) => w !== 'sure').map((w) => ['pretty ' + w, 'vague']), ['somehow', 'vague'], ['something like that', 'vague'], ['some kind of', 'vague'],
  ['whatever', 'vague'], ['etcetera', 'vague'], ['etc', 'vague'], ['and stuff', 'vague'], ['and things', 'vague'],
  ['or something', 'vague'], ['or whatever', 'vague'], ['and everything', 'vague'], ['things like that', 'vague'], ['stuff like that', 'vague'],
];

const BY_FIRST = new Map();
for (const [phrase, cat, cond] of LEXICON) {
  const toks = phrase.split(' ');
  if (!BY_FIRST.has(toks[0])) BY_FIRST.set(toks[0], []);
  BY_FIRST.get(toks[0]).push({ phrase, toks, cat, cond });
}
for (const list of BY_FIRST.values()) list.sort((a, b) => b.toks.length - a.toks.length);

const STOP = new Set(('a an the and or but so to of in on at for with from by as is are was were be been being it its it\'s this that these those i me my we our you your he she they them their there here what which who whom when where why how ' +
  'not no do does did done have has had having can could would should will shall may might must just also very really then than too into about over under up down out off again once all any both each few more most other some such only own same ' +
  'if because while until like get got make made go going went one two three yes yeah okay ok um uh well now let lets let\'s i\'m we\'re they\'re you\'re that\'s there\'s what\'s don\'t didn\'t doesn\'t isn\'t wasn\'t can\'t won\'t i\'ve we\'ve i\'ll we\'ll ' +
  'thing things stuff lot lots something anything everything kind sort way much many even still actually basically know mean think say said see want need use used').split(' '));

export function tokenize(text) {
  const src = String(text || '').replace(/[’‘]/g, "'");
  const re = /[A-Za-z0-9]+(?:'[A-Za-z]+)*/g;
  const toks = [];
  let m;
  while ((m = re.exec(src))) toks.push({ w: m[0].toLowerCase(), s: m.index, e: m.index + m[0].length });
  // Sentence starts: first token, after a newline (recognition segment) or after . ? !
  for (let i = 0; i < toks.length; i++) {
    const gapBefore = i === 0 ? '' : src.slice(toks[i - 1].e, toks[i].s);
    const gapAfter = src.slice(toks[i].e, i + 1 < toks.length ? toks[i + 1].s : src.length);
    toks[i].start = i === 0 || /[.?!\n]/.test(gapBefore);
    toks[i].end = i === toks.length - 1 || /[.?!\n,;:]/.test(gapAfter);
  }
  return toks;
}

function ctxAt(toks, i, j) {
  return {
    prev: (k) => (toks[i - 1 - k] || {}).w || '',
    next: (k) => (toks[j + k] || {}).w || '',
    atSentenceStart: () => toks[i].start,
    atBoundaryAfter: () => toks[j - 1].end,
    atEnd: () => j === toks.length,
  };
}

export function findSpans(text) {
  const toks = tokenize(text);
  const spans = [];
  for (let i = 0; i < toks.length;) {
    const cands = BY_FIRST.get(toks[i].w);
    let hit = null;
    if (cands) {
      for (const c of cands) {
        const j = i + c.toks.length;
        if (j > toks.length) continue;
        let ok = true;
        for (let k = 1; k < c.toks.length; k++) if (toks[i + k].w !== c.toks[k]) { ok = false; break; }
        if (ok && (!c.cond || c.cond(ctxAt(toks, i, j)))) { hit = { c, j }; break; }
      }
    }
    if (hit) {
      if (hit.c.cat !== 'ok') spans.push({ s: toks[i].s, e: toks[hit.j - 1].e, cat: hit.c.cat, term: hit.c.phrase, ti: i });
      i = hit.j;
    } else i++;
  }
  return { toks, spans };
}

const WEAK_END = ['so yeah', 'and yeah', "that's it", 'that is it', "that's about it", 'that is about it', "that's all", 'that is all', 'or something', 'and stuff', 'i guess', 'or whatever', 'so ya', 'and all', 'something like that', 'yeah'];

export function analyze(text, opts = {}) {
  const durationSec = Math.max(1, opts.durationSec || 0);
  const minutes = durationSec / 60;
  const { toks, spans } = findSpans(text);
  const words = toks.length;
  const count = { filler: 0, hedge: 0, vague: 0 };
  const terms = { filler: {}, hedge: {}, vague: {} };
  for (const sp of spans) {
    count[sp.cat]++;
    terms[sp.cat][sp.term] = (terms[sp.cat][sp.term] || 0) + 1;
  }
  const top = (cat) => Object.entries(terms[cat]).sort((a, b) => b[1] - a[1]);

  // Opening: a filler or cushion in the first three words.
  let weakOpen = '';
  const firstSpan = spans[0];
  if (firstSpan && firstSpan.ti <= 2 && firstSpan.cat !== 'vague') weakOpen = String(text).slice(toks[0].s, firstSpan.e);
  // Ending: trailing-off phrases in the last few words.
  let weakEnd = '';
  if (words >= 8) {
    const tail = ' ' + toks.slice(-6).map((t) => t.w).join(' ') + ' ';
    let at = -1;
    for (const p of WEAK_END) {
      const i = tail.indexOf(' ' + p + ' ');
      if (i >= 0 && (at < 0 || i < at)) at = i;
    }
    if (at >= 0) weakEnd = tail.slice(at).trim();
  }

  // Overused content words (excluding words from the prompt).
  const promptWords = new Set(tokenize(opts.prompt || '').map((t) => t.w));
  const freq = {};
  for (const t of toks) if (t.w.length > 2 && !STOP.has(t.w) && !promptWords.has(t.w) && !/^\d+$/.test(t.w)) freq[t.w] = (freq[t.w] || 0) + 1;
  const repeats = Object.entries(freq).filter(([, n]) => n >= 4 && n / Math.max(words, 1) >= 0.025).sort((a, b) => b[1] - a[1]).slice(0, 3);

  // "And then … and then …" chains.
  let andChains = 0;
  for (let i = 0; i < toks.length - 1; i++) if (toks[i].w === 'and' && ['then', 'also', 'so'].includes(toks[i + 1].w)) andChains++;

  const wpm = words ? Math.round(words / minutes) : 0;
  const speechSec = opts.speechSec || 0;
  const artWpm = speechSec > 5 && words ? Math.round(words / (speechSec / 60)) : 0;
  const rate = (n) => Math.round((n / minutes) * 10) / 10;
  const m = {
    words, durationSec: Math.round(durationSec), wpm, artWpm,
    filler: count.filler, hedge: count.hedge, vague: count.vague,
    fillerPerMin: rate(count.filler), hedgePerMin: rate(count.hedge), vaguePerMin: rate(count.vague),
    topFillers: top('filler').slice(0, 4), topHedges: top('hedge').slice(0, 4), topVague: top('vague').slice(0, 4),
    terms, weakOpen, weakEnd, repeats, andChains,
  };
  if (opts.vad) {
    m.pauses = opts.vad.pauses;
    m.longPauses = opts.vad.longPauses;
    m.longestPause = opts.vad.longestPause;
    m.startLatency = opts.vad.startLatency;
  }
  m.target = opts.target || 0;
  m.crisp = words >= 15 ? crispness(m) : null;
  m.notes = notes(m);
  return m;
}

export function crispness(m) {
  let s = 100;
  s -= Math.min(30, m.fillerPerMin * 5);
  s -= Math.min(20, m.hedgePerMin * 4);
  s -= Math.min(10, m.vaguePerMin * 1.5);
  if (m.wpm && m.wpm < 110) s -= Math.min(12, (110 - m.wpm) * 0.4);
  if (m.wpm > 185) s -= Math.min(12, (m.wpm - 185) * 0.4);
  if (m.weakOpen) s -= 6;
  if (m.weakEnd) s -= 6;
  if (m.longPauses > 1) s -= Math.min(9, (m.longPauses - 1) * 3);
  if (m.target && m.durationSec > m.target * 1.25) s -= 5;
  return Math.max(0, Math.min(100, Math.round(s)));
}

export function paceLabel(wpm) {
  if (!wpm) return { label: '—', tone: 'mute' };
  if (wpm < 110) return { label: 'Slow', tone: 'warn' };
  if (wpm < 130) return { label: 'Measured', tone: 'ok' };
  if (wpm <= 170) return { label: 'Sweet spot', tone: 'good' };
  if (wpm <= 185) return { label: 'Brisk', tone: 'ok' };
  return { label: 'Fast', tone: 'warn' };
}

function notes(m) {
  const out = [];
  if (m.words < 15) return ['Too short to analyse. Aim to fill most of the time.'];
  if (m.weakOpen) out.push(`You opened with "${m.weakOpen}". Start with your point instead.`);
  if (m.weakEnd) out.push(`You trailed off with "${m.weakEnd}". End on a clear closing line, then stop.`);
  if (m.topFillers[0] && m.topFillers[0][1] >= 3) out.push(`"${m.topFillers[0][0]}" ×${m.topFillers[0][1]}: your crutch this time. Pause instead.`);
  if (m.hedgePerMin >= 3) out.push(`${m.hedge} hedges. Keep only the doubts that are real, and put a number on them.`);
  if (m.wpm > 185) out.push(`${m.wpm} words a minute is fast. Slow down for your key point and your numbers.`);
  else if (m.wpm && m.wpm < 110) out.push(`${m.wpm} words a minute is slow. Plan the next sentence during the pause, not mid-sentence.`);
  if (m.repeats[0]) out.push(`You said "${m.repeats[0][0]}" ${m.repeats[0][1]} times. Vary it, or say it once with emphasis.`);
  if (m.andChains >= 4) out.push(`${m.andChains} "and then / and so" links. End a sentence instead and start a new one.`);
  if (m.longPauses >= 3) out.push(`${m.longPauses} long pauses mid-answer. Plan your structure in the think time so you're not searching.`);
  if (m.target && m.durationSec > m.target * 1.25) out.push(`You ran ${m.durationSec - m.target}s over the limit. Cut, don't cram.`);
  if (!out.length) out.push('Clean delivery: no crutches, hedges or pace problems detected.');
  return out.slice(0, 4);
}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Transcript HTML with categories marked. Newlines (recognition segments) render as spaces.
export function highlight(text, spans) {
  const src = String(text || '');
  let out = '';
  let pos = 0;
  for (const sp of spans || findSpans(src).spans) {
    out += esc(src.slice(pos, sp.s));
    out += `<mark class="m-${sp.cat}" title="${esc(CATS[sp.cat].label + ': ' + CATS[sp.cat].tip)}">${esc(src.slice(sp.s, sp.e))}</mark>`;
    pos = sp.e;
  }
  out += esc(src.slice(pos));
  return out.replace(/\n+/g, ' ');
}

// Crutch words across many reps: [{term, cat, per100, n}] sorted by how much they cost.
export function personalCrutches(reps, limit = 5) {
  const agg = {};
  let words = 0;
  for (const r of reps) {
    if (!r.metrics || !r.metrics.terms) continue;
    words += r.metrics.words || 0;
    for (const cat of ['filler', 'hedge']) {
      for (const [term, n] of Object.entries(r.metrics.terms[cat] || {})) {
        const k = cat + ':' + term;
        agg[k] = agg[k] || { term, cat, n: 0 };
        agg[k].n += n;
      }
    }
  }
  return Object.values(agg)
    .map((x) => ({ ...x, per100: words ? Math.round((x.n / words) * 1000) / 10 : 0 }))
    .filter((x) => x.n >= 3)
    .sort((a, b) => b.n - a.n)
    .slice(0, limit);
}
