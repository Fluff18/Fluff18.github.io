// Capture: records audio (MediaRecorder), transcribes live (Web Speech API) and measures pauses (Web Audio).
// Phones can't reliably do recording and recognition at the same time (iOS and Android give the
// microphone to one of them), so the capture mode adapts per device and remembers what failed.

const SR = typeof window !== 'undefined' ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null;
const STEP_MS = 50;

export function platform() {
  const ua = navigator.userAgent || '';
  const ios = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const android = /Android/i.test(ua);
  const standalone = (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
  const safari = ios || (/Safari\//.test(ua) && !/Chrome\/|Chromium\/|CriOS|FxiOS|Edg\//.test(ua));
  return {
    ios, android, safari, standalone, mobile: ios || android,
    // iOS exposes the API in Home Screen apps but it never delivers results (WebKit bug 225298).
    recognition: !!SR && !(ios && standalone),
    recorder: !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder),
    secure: window.isSecureContext !== false,
  };
}

const FLAG = 'speak.v1.device';
export function deviceFlags() { try { return JSON.parse(localStorage.getItem(FLAG)) || {}; } catch { return {}; } }
export function setDeviceFlag(k, v) {
  const f = deviceFlags();
  if (v === undefined) delete f[k]; else f[k] = v;
  try { localStorage.setItem(FLAG, JSON.stringify(f)); } catch { /* storage unavailable */ }
}

// Modes: both (audio + live transcript), transcript, audio, none.
export function resolveMode(pref = 'auto') {
  const p = platform();
  const canT = p.recognition, canA = p.recorder;
  const fallback = (a, b) => (a ? a : b);
  if (pref === 'transcript') return canT ? 'transcript' : fallback(canA && 'audio', 'none');
  if (pref === 'audio') return canA ? 'audio' : fallback(canT && 'transcript', 'none');
  if (pref === 'both') return canT && canA ? 'both' : fallback(canT && 'transcript', fallback(canA && 'audio', 'none'));
  if (!canT) return canA ? 'audio' : 'none';
  if (!canA) return 'transcript';
  if (p.mobile || deviceFlags().noBoth) return 'transcript';
  return 'both';
}

export const MODE_LABEL = {
  both: 'Audio + live transcript',
  transcript: 'Live transcript',
  audio: 'Audio only',
  none: 'Typing only',
};

export function pickMime() {
  if (!window.MediaRecorder || !MediaRecorder.isTypeSupported) return '';
  const order = platform().safari
    ? ['audio/mp4', 'audio/mp4;codecs=mp4a.40.2', 'audio/aac', 'audio/webm;codecs=opus', 'audio/webm']
    : ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'];
  return order.find((t) => MediaRecorder.isTypeSupported(t)) || '';
}

function dedupe(list) {
  const out = [];
  for (const raw of list) {
    const s = raw.trim();
    if (!s) continue;
    const last = out[out.length - 1];
    const a = s.toLowerCase(), b = (last || '').toLowerCase();
    if (last && a.startsWith(b)) out[out.length - 1] = s;      // Android repeats the growing phrase
    else if (last && b.startsWith(a)) continue;
    else out.push(s);
  }
  return out;
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms) { const t = Date.now(); while (!fn() && Date.now() - t < ms) await wait(40); }

export class CaptureError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

export class Capture {
  constructor({ mode = 'auto', lang = 'en-IN', onText = () => {}, onLevel = () => {}, onLive = () => {} } = {}) {
    this.mode = resolveMode(mode);
    this.lang = lang;
    this.onText = onText;
    this.onLevel = onLevel;
    this.onLive = onLive;
    this.segs = [];          // committed transcript segments [{t, text}]
    this.sess = [];          // finals in the current recognition session
    this.sessT = [];
    this.interim = '';
    this.pendingStart = null;
    this.frames = [];
    this.recErrors = [];
    this.restarts = 0;
    this.active = false;
  }

  get hasAudio() { return this.mode === 'both' || this.mode === 'audio'; }
  get hasTranscript() { return this.mode === 'both' || this.mode === 'transcript'; }

  // Call straight from a click/tap: iOS needs the AudioContext and recognition started inside the gesture.
  async start() {
    if (this.mode === 'none') throw new CaptureError('unsupported', 'This browser can\'t record or transcribe. Try Chrome or Safari, or type your answer instead.');
    this.active = true;
    this.t0 = performance.now();
    if (this.hasAudio) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) { try { this.ctx = new AC(); } catch { this.ctx = null; } }
    }
    if (this.hasTranscript) this._startRecognition();
    if (this.hasAudio) {
      try {
        this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      } catch (e) {
        if (this.hasTranscript) { this.mode = 'transcript'; this.audioError = e.name; }
        else {
          this.active = false;
          throw new CaptureError(e.name === 'NotFoundError' ? 'no-mic' : 'mic-blocked',
            e.name === 'NotFoundError' ? 'No microphone found.' : 'Microphone access is blocked. Allow it for this site in your browser settings, then try again.');
        }
      }
      if (this.stream) { this._startRecorder(); this._markLive(); }
    }
    if (!this.hasAudio || !this.stream) setTimeout(() => this._markLive(), 1500); // if audiostart never fires
    this._wake();
  }

  // The clock starts when the microphone is actually live, not when a permission prompt is still showing.
  _markLive() {
    if (this.live || !this.active) return;
    this.live = true;
    this.t0 = performance.now();
    this.onLive();
  }

  _startRecorder() {
    this.mime = pickMime();
    try {
      this.rec = new MediaRecorder(this.stream, this.mime ? { mimeType: this.mime } : undefined);
      this.chunks = [];
      this.rec.ondataavailable = (e) => { if (e.data && e.data.size) this.chunks.push(e.data); };
      this.rec.start(1000);
    } catch { this.rec = null; }
    if (this.ctx) {
      try {
        if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
        const src = this.ctx.createMediaStreamSource(this.stream);
        this.an = this.ctx.createAnalyser();
        this.an.fftSize = 2048;
        src.connect(this.an);
        this.buf = new Float32Array(this.an.fftSize);
        this.timer = setInterval(() => this._tick(), STEP_MS);
      } catch { this.an = null; }
    }
  }

  _tick() {
    if (!this.an) return;
    this.an.getFloatTimeDomainData(this.buf);
    let sum = 0;
    for (let i = 0; i < this.buf.length; i++) sum += this.buf[i] * this.buf[i];
    const rms = Math.sqrt(sum / this.buf.length);
    this.frames.push(rms);
    this.onLevel(Math.min(1, rms * 12));
  }

  _startRecognition() {
    if (!SR) return;
    const r = new SR();
    r.lang = this.lang;
    r.interimResults = true;
    r.maxAlternatives = 1;
    r.continuous = !platform().android; // Android repeats results in continuous mode; restart instead
    r.onresult = (e) => {
      const finals = [];
      let interim = '';
      for (let i = 0; i < e.results.length; i++) {
        const res = e.results[i];
        const txt = res[0] ? res[0].transcript : '';
        if (res.isFinal) finals.push(txt);
        else if (i >= e.resultIndex) interim += txt;
      }
      const now = this._now();
      if (!this.pendingStart && (interim || finals.length > this.sess.length)) this.pendingStart = now;
      const next = dedupe(finals);
      while (this.sessT.length < next.length) { this.sessT.push(this.pendingStart ?? now); this.pendingStart = interim ? now : null; }
      this.sess = next;
      this.interim = interim.trim();
      this.onText(this.text(true));
    };
    r.onaudiostart = () => { if (!this.stream) this._markLive(); };
    r.onerror = (e) => {
      this.recErrors.push(e.error);
      if (['not-allowed', 'service-not-allowed', 'audio-capture', 'language-not-supported'].includes(e.error)) this.recDead = e.error;
    };
    r.onend = () => {
      this._commit();
      this.recEnded = true;
      if (this.active && !this.recDead && this.restarts < 80) {
        this.restarts++;
        setTimeout(() => {
          if (!this.active) return;
          try { this.recEnded = false; r.start(); } catch { /* already started */ }
        }, 150);
      }
    };
    try { r.start(); } catch { this.recDead = 'start-failed'; this.recEnded = true; }
    this.recog = r;
  }

  _now() { return Math.max(0, (performance.now() - this.t0) / 1000); }

  _commit() {
    this.sess.forEach((text, i) => this.segs.push({ t: Math.round((this.sessT[i] || 0) * 10) / 10, text }));
    this.sess = [];
    this.sessT = [];
  }

  // Transcript with one line per recognized phrase (the analyser treats line breaks as sentence starts).
  text(withInterim = false) {
    const parts = this.segs.map((s) => s.text).concat(this.sess);
    if (withInterim && this.interim) parts.push(this.interim);
    return parts.map((s) => s.trim()).filter(Boolean).join('\n');
  }

  elapsed() { return this.active ? this._now() : 0; }

  async stop() {
    const durationSec = this._now();
    this.active = false;
    if (this.recog) {
      try { this.recog.stop(); } catch { /* not running */ }
      await until(() => this.recEnded, 1800);
    }
    this._commit();
    if (this.interim) { this.segs.push({ t: Math.round((this.pendingStart || durationSec) * 10) / 10, text: this.interim }); this.interim = ''; }
    let audio = null;
    if (this.rec && this.rec.state !== 'inactive') {
      await new Promise((res) => { this.rec.onstop = res; try { this.rec.stop(); } catch { res(); } setTimeout(res, 2500); });
    }
    if (this.chunks && this.chunks.length) {
      const type = (this.rec && this.rec.mimeType) || this.mime || 'audio/webm';
      audio = { blob: new Blob(this.chunks, { type }), mime: type };
    }
    this._release();
    const vad = this.frames.length > 10 ? computeVad(this.frames, STEP_MS) : null;
    const transcript = this.text(false);
    return { transcript, segments: this.segs.slice(), durationSec, audio, vad, mode: this.mode, issues: this._diagnose(transcript, vad) };
  }

  cancel() {
    this.active = false;
    try { this.recog && this.recog.abort(); } catch { /* ignore */ }
    try { this.rec && this.rec.state !== 'inactive' && this.rec.stop(); } catch { /* ignore */ }
    this._release();
  }

  _release() {
    clearInterval(this.timer);
    if (this.stream) this.stream.getTracks().forEach((t) => t.stop());
    if (this.ctx) this.ctx.close().catch(() => {});
    this.stream = null; this.ctx = null; this.an = null;
    try { this.wake && this.wake.release(); } catch { /* ignore */ }
    this.wake = null;
  }

  async _wake() { try { this.wake = await navigator.wakeLock.request('screen'); } catch { this.wake = null; } }

  // Work out what went wrong, and remember device-level conflicts so the next rep picks a mode that works.
  _diagnose(transcript, vad) {
    const issues = [];
    const words = transcript ? transcript.split(/\s+/).filter(Boolean).length : 0;
    if (this.hasTranscript) {
      if (this.recDead === 'not-allowed' || this.recDead === 'service-not-allowed') issues.push('recognition-blocked');
      else if (this.recErrors.includes('network')) issues.push('recognition-network');
    }
    if (this.mode === 'both') {
      const spoke = vad && vad.speechSec >= 4;
      if (words < 3 && (spoke || this.recDead === 'audio-capture')) { issues.push('conflict-transcript'); setDeviceFlag('noBoth', true); }
      else if (words >= 10 && vad && vad.silent) { issues.push('conflict-audio'); setDeviceFlag('noBoth', true); }
    }
    if (this.hasTranscript && !words && !issues.length) issues.push('no-speech');
    if (this.audioError) issues.push('mic-blocked-audio');
    return issues;
  }
}

// Voice activity from RMS frames: pauses, long pauses, time to first word.
export function computeVad(frames, stepMs = STEP_MS) {
  const n = frames.length;
  const sorted = Float32Array.from(frames).sort();
  const floor = sorted[Math.floor(n * 0.1)] || 0;
  const peak = sorted[Math.floor(n * 0.98)] || 0;
  const silent = peak < 0.0015;
  const thr = Math.max(floor * 2.5, floor + (peak - floor) * 0.12, 0.003);
  const sp = frames.map((v) => v > thr);
  // Fill gaps under 200 ms inside speech, drop blips under 100 ms.
  const fill = Math.round(200 / stepMs), blip = Math.round(100 / stepMs);
  for (let i = 0; i < n;) {
    if (sp[i]) { i++; continue; }
    let j = i; while (j < n && !sp[j]) j++;
    if (i > 0 && j < n && j - i < fill) for (let k = i; k < j; k++) sp[k] = true;
    i = j;
  }
  for (let i = 0; i < n;) {
    if (!sp[i]) { i++; continue; }
    let j = i; while (j < n && sp[j]) j++;
    if (j - i < blip) for (let k = i; k < j; k++) sp[k] = false;
    i = j;
  }
  const first = sp.indexOf(true), last = sp.lastIndexOf(true);
  if (first < 0) return { speechSec: 0, pauses: 0, longPauses: 0, longestPause: 0, startLatency: null, silent: true };
  let pauses = 0, longPauses = 0, longest = 0, run = 0, speech = 0;
  for (let i = first; i <= last; i++) {
    if (sp[i]) {
      if (run) {
        const sec = (run * stepMs) / 1000;
        if (sec >= 0.5) pauses++;
        if (sec >= 2) longPauses++;
        if (sec > longest) longest = sec;
        run = 0;
      }
      speech++;
    } else run++;
  }
  const r1 = (x) => Math.round(x * 10) / 10;
  return { speechSec: r1((speech * stepMs) / 1000), pauses, longPauses, longestPause: r1(longest), startLatency: r1((first * stepMs) / 1000), silent };
}

export const ISSUE_TEXT = {
  'recognition-blocked': 'Speech recognition is blocked. On iPhone, turn on Siri & Dictation; elsewhere, allow the microphone for this site.',
  'recognition-network': 'Speech recognition needs an internet connection and couldn\'t reach its service.',
  'conflict-transcript': 'This device couldn\'t transcribe while recording audio, so from now on it will only transcribe. You can change this in Settings → Capture.',
  'conflict-audio': 'This device muted the recording while transcribing, so from now on it will only transcribe. You can change this in Settings → Capture.',
  'no-speech': 'No words came through. Check that the right microphone is selected, or type your answer below.',
  'mic-blocked-audio': 'The microphone recording was blocked, so there\'s no audio to replay. Only the transcript was captured.',
};
