# Reel analysis: Dd_rIaZC1ay (sl_tech_journal)

Source material: `transcript.txt`, `caption.txt`, `contact-sheet.jpg` (12 frames) and the seven keyframes f004–f033. The reel is a phone recording of a laptop showing a one-page portfolio for "Lohitha", scrolled top to bottom, with a talking avatar in the hero. Caption: "Talking hero video, flipping ID card, periodic table of skills, and achievements that scroll sideways. Clean black & white. Zero clutter."

## What the reel does, section by section

### 0. Global frame (all keyframes)
- Cream, almost-white paper background. Ink is near-black; the only colour is a tiny purple cursor dot. Everything else is grey scale.
- Top-left: a small round dark badge with initials ("LD") and the full name beside it. Top-right: a frosted pill nav with About / Skills / Work / Experience / Achievements / Contact; the active item is a solid dark pill.
- Bottom-left of the hero: a small round dark button with an "N" in it.
- Section headings follow one formula: numbered small-caps eyebrow ("01 — ABOUT"), then a huge grotesque headline where the last word is a serif italic ("Hi, I'm *Lohitha.*", "The periodic table *of my stack.*", "Things I've *built.*", "Always *learning.*", "Proud *moments.*").
- Transitions: every section's eyebrow, headline and content slide up and fade in as it enters the viewport. Children stagger (tiles, rows, cards appear one after another).

### 1. Hero (f004, frames 1–3)
- Giant faded "LOHITHA" letters span the full width, about 6% ink on cream, vertically centred.
- A full-body avatar (white shirt, dark trousers, white sneakers) stands centred on the baseline, in front of the letters. It is a talking video: the avatar gestures with her hands while the narration plays ("Hi, I'm Louisa. I'm a full-stack developer. I build responsive web applications, interactive websites, and AI-powered platforms."). Shadow under the feet.
- Bottom-left: eyebrow "LOHITHA DANISETTI", then "Full Stack Developer." in two lines with a dark full stop, and a one-line tagline under it.
- Bottom-right: stacked actions "Explore work ↗" (dark), "Let's talk →", "Resume ↓".
- The hero fades/scales in on load: letters first, then the figure, then the text block.

### 2. About (f010, frame 4)
- Three columns. Left: eyebrow "01 ABOUT", "Hi, I'm *Lohitha.*", a short lede, a second line, then three buttons: Résumé (dark), GitHub ↗, LinkedIn ↗.
- Middle: an ID card hanging from a lanyard strap. The strap comes from the top of the section, a clip, then the card. Card has a slot hole, "What I am", five rows with a dark round check and a bold label plus grey sub-line, and a signature in serif italic at the bottom. The card swings slightly and flips on hover to a back with a photo and a quote.
- Right: eyebrow "OTHER FACTS", a definition list (Based in, Studying, Started, Focus...) with hairline dividers, and a serif italic quote at the bottom.

### 3. Skills (f016, frames 5–7)
- "The periodic table *of my stack.*" with a lede "Elements in six families. Hover a tile to see it, or pick a family to light it up."
- Family chips in a row (Languages, Frontend, Backend, Databases, Tools, Core), each with a small coloured square. Chips use five greys plus dark.
- A grid of square tiles like periodic elements: small number top-left, big two-letter symbol, name under it. Tiles are tinted by family in grey scale (dark, charcoal, warm grey, sand, cream).
- Right of the grid: a card that shows the hovered element's real logo (the PostgreSQL elephant) and its name. The panel content swaps as the cursor moves.
- Tiles pop in with a stagger when the section enters.

### 4. Work (f022, frame 8)
- "Things I've *built.*" with a lede.
- A sideways accordion. Closed panels are tall narrow columns with the project title written vertically and a round "+" at the bottom. The open panel is wide and shows a mock (phone/laptop screenshot) on the left, the title, a line of text and a "View on GitHub" button on the right. Clicking a column slides it open (flex animation) while the others slim down.

### 5. Always learning (f028, frame 9)
- Two columns. Left: eyebrow "05 CERTIFICATIONS", "Always *learning.*", a lede about certifications.
- Right: a numbered list (01, 02...) of certifications with an issuer sub-line and a "↗" on the right. The hovered row turns into a dark rounded bar with white text; it reads like a cursor highlight.

### 6. Experience (f031, frame 10)
- A big bold year ("2026") sits beside a vertical hairline, the year dot sits on the line. Right of the line: a white card with the role ("Full Stack Development Intern"), the organisation in small caps, bullet points and chip tags. Rows slide in one at a time.

### 7. Achievements (f033, frame 11)
- "Proud *moments.*" with arrows top-right.
- Cards scroll sideways. Each card: a small icon in a rounded square, a huge number ("No. 1", "96", "20+"), a title and a sub-line, a date top-right.

### 8. Avatar guide (frame 12)
- The last frame is the creator's prompt for the talking avatar: "natural animation, natural blinking, subtle facial expressions, gentle body movement, no exaggerated gestures, the character must remain standing in the centre while speaking, camera static". So the hero is an AI-generated video (Google Flow / Veo style) made from a photo, not a real recording.

## What v3 already matches
- Structure and order: hero, About, Skills, Work, Experience, Always learning, Achievements, Contact.
- Cream paper with ink only; no purple, no neon (the reel's purple cursor dot was dropped on purpose).
- Grotesque + serif-italic headline formula with numbered eyebrows.
- Round initials badge top-left, frosted pill nav with a solid active item top-right.
- Hero: giant faded "RAHUL" letters, eyebrow, "AI Engineer." with a dark full stop, tagline, three stacked actions bottom-right, a figure standing on the baseline with a ground shadow, a small dark button bottom-left (square rather than round).
- About: three columns, lanyard strap plus ID card with five checked rows and a signature, flip to a back face with a photo and a quote, "Other facts" dl and italic quote.
- Skills: family chips with colour squares, numbered element tiles tinted by family, info panel on the right that swaps on hover, family filter dims the rest.
- Work: sideways accordion with vertical titles, round "+" buttons, flex animation, open body with image, title, text and a button.
- Always learning: numbered list with sub-lines and "↗", dark hover row.
- Experience: big year beside a vertical line with dots, white card with role, org, bullets and chips.
- Achievements: sideways strip with icon, big number, title, sub-line, date and arrows.
- Reduced-motion fallback.

## What v3 misses (gaps, biggest first)
1. **Hero figure.** The reel has a full-body talking avatar. v3 has a chest-up photo cutout that is static. A real fix needs the avatar video (made from a photo with an external generator, saved as `v3/hero.mp4`; the hook `data-video` already exists). Until that file exists, the cutout should at least behave like a presence: fade and rise in on load, breathe slightly, and sit cleanly on the baseline. An AI-generated full-body figure cannot be produced inside this sandbox.
2. **Motion.** The reel is alive: hero elements animate in sequence, each section's heading and children stagger in, tiles pop, timeline rows slide, cards drop onto the lanyard. v3 only has a single fade-up on whole blocks. Missing: a load sequence for the hero, staggered children (facts rows, tiles, chips, accordion columns, timeline rows, achievement cards, list rows), a lanyard drop for the card, a slide for the accordion body, a swap transition on the element info panel, number count-ups on the achievement cards, and a rotate of "+" when a panel opens.
3. **Element info panel** shows a big two-letter tile, not a logo. Real brand logos would need external assets; keeping the symbol is acceptable but the panel should animate when it swaps.
4. **Bottom-left button** in the reel is round. v3's is a rounded square; tester rules ask for varied radii, so round is fine here since the buttons elsewhere are 12px.
5. **Hover row on the learning list** jumps because margins change on hover; the reel's row grows smoothly.
6. **Accordion "+"** does not change state when a panel is open.
7. Minor: the hero tagline is typed out (v3 addition that stands in for the voice); the reel's figure has a static tagline. Keep the typed line since it carries the transcript.

## Plan for this pass (v3-reel only)
- Hero load sequence: letters scale in, figure rises with a soft clip, eyebrow/headline/tagline/actions stagger. Figure gets a slow breathing drift. Bottom-left button becomes round.
- Staggered reveals through a `data-stagger` container: children get increasing delays via `--i`.
- Lanyard: strap grows from the top, card drops with a slight overshoot, then the sway starts.
- Periodic table: tiles pop in with stagger; info panel content cross-fades/scales on swap.
- Accordion: body slides in from the left; "+" rotates to "x" on open; columns stagger in on first render and on filter change.
- Timeline rows slide in from the left with the dot scaling; achievement cards rise with stagger and numbers count up.
- Learning list hover grows via padding transition without layout jump.
- All of it gated behind `prefers-reduced-motion`.
- Rules kept: no emoji, no Inter/Geist/Space Grotesk, no purple/neon, varied radii, no uniform drop shadows, text ≥ 11px, 4.5:1 contrast, hero actions in normal flow.
