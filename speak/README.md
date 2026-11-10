# Speak · daily reps

A 5–10 minute daily speaking practice app: **plan → speak → instant feedback → redo**.
It is aimed at technical communication, interviews and presenting your work. It's a static page
at `/speak/` on this site, not linked from the portfolio and marked `noindex`.

## A session

| Step | What happens | Why |
|---|---|---|
| Warm-up ritual (20 s, optional) | Slow exhale, say "I'm excited" | Reappraising nerves as excitement improves performance (Brooks 2014) |
| Warm-up rep | A short, easy drill | Gets you talking before the hard part |
| Main rep | Today's skill: lesson the first time, a planning timer, then speak against the clock | Brief guided planning improves fluency (Foster & Skehan 1996) |
| Review | Crispness score, pace, fillers, hedges, pauses, highlighted transcript, playback with a "tap each filler you hear" counter, Claude's coaching | Awareness training cuts fillers (Mancuso & Miltenberger 2016) |
| Redo | Same prompt, one specific fix, side-by-side comparison | Feedback, then an immediate retry, is the core of deliberate practice |
| Wrap-up | Rate the session, write one thing to use in a real conversation | Turns practice into behaviour |

The first four weeks run a fixed foundation program:

1. Lead with the point
2. Structure under pressure
3. Precision and concision
4. Stories and persuasion

After day 28, each day targets your weakest skill, based on recent coach scores and filler rate.
Think time shrinks as each drill gets familiar. Day 7 records a "Tell me about yourself" baseline,
and day 28 repeats it so you can compare them in Progress.

There are 14 drills plus **Rehearse It**, which lets you practise a real upcoming moment.
The drills are Answer First, Status Update, Explain It, Say It Shorter (90/60/30 s, adapted from
the 4/3/2 technique), Zero-Filler Minute, Mean It (hedges to calibrated claims), Tough Question,
Word Upgrade, Tell a Story, Interview Story (STAR), Pitch Yourself, Design Out Loud, Disagree Well
and Make the Case. Prompts are written for an AI/software engineer.

## AI coach

- **What it does.** Claude reviews each transcript against the drill's rubric. It returns scores
  for clarity, structure, concision, confidence and precision, the one thing to fix first, line
  edits, a "stronger version" you can listen to, word upgrades and a redo goal. On a redo, it says
  whether you met the goal.
- **How it connects.** The browser calls the Messages API directly with your own key, using
  `dangerouslyAllowBrowser`. The key is stored in `localStorage` on that device only.
  Use a dedicated key with a monthly spend limit.
- **Request settings.**
  - Default model: `claude-opus-5-5`, at effort `medium`.
  - Feedback comes back as JSON-schema structured output and is streamed.
  - Server-side fallback is on (`fallbacks: "default"`, beta `server-side-fallback-2026-07-01`)
    for Opus and Sonnet.
  - The system prompt is cached.
- **Without a key.** Every review has **Copy prompt for Claude**, which produces the same coaching
  prompt to paste into the Claude app.
- **Cost.** Settings shows an approximate monthly spend from the token usage on each response.

## Capture and devices

- **Desktop Chrome, Edge and Safari:** audio recording, a live transcript and pause detection all
  run at once.
- **Phones:** iOS and Android can't reliably record and run speech recognition at the same time,
  so the automatic mode only transcribes. Zero-Filler Minute offers **Record audio instead** for
  the listen-back filler hunt. If running both fails on a device, the app remembers and stops
  trying.
- **iPhone Home Screen apps:** iOS blocks speech recognition there (WebKit bug 225298). The manifest
  uses `display: browser`, and the app tells you to use a Safari tab. Typing or keyboard dictation
  in the review screen always works as a fallback.
- **Transcript accuracy:** browser transcripts usually drop "um" and "uh". Lexical crutches such as
  "basically", "like", "you know" and "the thing is" come through, and those are what the local
  analysis counts. The self-tap counter during playback catches the rest.

## Privacy

Everything stays in this browser:

- **Stored locally:** reps, transcripts, recordings (the last N, configurable), streaks and settings.
- **Sent out:** only transcripts and metrics, and only to `api.anthropic.com`, when the coach runs.
- **Backups:** export and import are JSON files. They exclude audio and the API key.

## Files

```
index.html            app shell
app.css               design system (light + dark)
js/app.js             router and views: Today, Practice, Progress, Learn, Settings, Welcome, rep detail
js/session.js         the session state machine, review screen, coach calls, playback
js/content.js         drills, prompts, lessons, the 4-week program, playbook and sources
js/analyze.js         local transcript analysis (fillers, hedges, vague words, pace, crispness)
js/audio.js           capture: MediaRecorder + Web Speech + Web Audio pause detection
js/coach.js           Claude request, schema, prompt, errors, cost
js/plan.js            program day, adaptive drill choice, prompt rotation, think time, streaks
js/charts.js          SVG line charts and heatmap
js/store.js, state.js persistence (localStorage + IndexedDB)
vendor/anthropic-sdk.mjs  @anthropic-ai/sdk 1.3.0, browser bundle (Apache-2.0)
```

## Developing

There is no build step. Serve the repo root and open `/speak/`:

```bash
python3 -m http.server 8000   # then http://localhost:8000/speak/
```

The microphone needs HTTPS or localhost.

To update the vendored SDK, run:

```bash
npm i @anthropic-ai/sdk@<version> esbuild
echo "import A from '@anthropic-ai/sdk'; export default A;" > entry.js
npx esbuild entry.js --bundle --format=esm --platform=browser --target=es2020 --minify --outfile=vendor/anthropic-sdk.mjs
```

Then update the version in the banner and in this file.
