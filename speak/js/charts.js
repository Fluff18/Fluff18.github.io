// Small, quiet SVG charts: single-series lines with a crosshair tooltip, and a practice heatmap.
// Colors come from CSS variables (--viz-*) so light and dark themes each use their own validated steps.

const NS = 'http://www.w3.org/2000/svg';
const el = (tag, attrs = {}, parent) => {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  if (parent) parent.appendChild(n);
  return n;
};
const fmtDate = (k) => new Date(k + 'T12:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
const toTime = (k) => new Date(k + 'T12:00:00').getTime();

function niceTicks(min, max, count = 3) {
  const span = max - min || 1;
  const step0 = span / (count - 1);
  const mag = Math.pow(10, Math.floor(Math.log10(step0)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= step0) || step0;
  const lo = Math.floor(min / step) * step;
  const ticks = [];
  for (let v = lo; v < max + step - step * 0.001; v += step) ticks.push(Math.round(v * 100) / 100);
  if (ticks.length < 2) ticks.push(Math.round((lo + step) * 100) / 100);
  return ticks;
}

// points: [{x: 'YYYY-MM-DD', y: number}] sorted by x. opts: {yMin, yMax, band:[lo,hi], fmt, label}
export function lineChart(host, points, opts = {}) {
  host.innerHTML = '';
  host.classList.add('chart');
  const fmt = opts.fmt || ((v) => String(Math.round(v * 10) / 10));
  if (!points.length) {
    const p = document.createElement('p');
    p.className = 'chart-empty';
    p.textContent = opts.empty || 'Not enough data yet.';
    host.appendChild(p);
    return;
  }
  const W = 320, H = 128, L = 30, R = 42, T = 10, B = 20;
  const ys = points.map((p) => p.y);
  let yMin = opts.yMin != null ? opts.yMin : Math.min(...ys);
  let yMax = opts.yMax != null ? opts.yMax : Math.max(...ys);
  if (opts.band) { yMin = Math.min(yMin, opts.band[0]); yMax = Math.max(yMax, opts.band[1]); }
  if (yMax === yMin) { yMax += 1; yMin = Math.max(0, yMin - 1); }
  const ticks = niceTicks(yMin, yMax, 3);
  yMin = Math.min(yMin, ticks[0]);
  yMax = Math.max(yMax, ticks[ticks.length - 1]);
  const t0 = toTime(points[0].x);
  const t1 = Math.max(toTime(points[points.length - 1].x), t0 + 6 * 864e5);
  const X = (k) => L + ((toTime(k) - t0) / (t1 - t0)) * (W - L - R);
  const Y = (v) => T + (1 - (v - yMin) / (yMax - yMin)) * (H - T - B);

  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart-svg', role: 'img', 'aria-label': `${opts.label || 'Chart'}: latest ${fmt(points[points.length - 1].y)}` });
  for (const v of ticks) {
    el('line', { x1: L, x2: W - R + 8, y1: Y(v), y2: Y(v), class: 'viz-grid' }, svg);
    const t = el('text', { x: L - 6, y: Y(v) + 3.5, class: 'viz-tick', 'text-anchor': 'end' }, svg);
    t.textContent = opts.tickFmt ? opts.tickFmt(v) : String(v);
  }
  if (opts.band) {
    el('rect', { x: L, width: W - L - R + 8, y: Y(opts.band[1]), height: Y(opts.band[0]) - Y(opts.band[1]), class: 'viz-band' }, svg);
  }
  const first = el('text', { x: L, y: H - 5, class: 'viz-tick', 'text-anchor': 'start' }, svg);
  first.textContent = fmtDate(points[0].x);
  if (points.length > 1) {
    const last = el('text', { x: X(points[points.length - 1].x), y: H - 5, class: 'viz-tick', 'text-anchor': 'end' }, svg);
    last.textContent = fmtDate(points[points.length - 1].x);
  }
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${X(p.x).toFixed(1)},${Y(p.y).toFixed(1)}`).join(' ');
  if (points.length > 1) el('path', { d, class: 'viz-line' }, svg);
  const lp = points[points.length - 1];
  el('circle', { cx: X(lp.x), cy: Y(lp.y), r: 4, class: 'viz-dot' }, svg);
  const endLabel = el('text', { x: X(lp.x) + 8, y: Y(lp.y) + 4, class: 'viz-end' }, svg);
  endLabel.textContent = fmt(lp.y);

  // Hover layer: a crosshair that snaps to the nearest day, and one tooltip.
  const cross = el('line', { y1: T, y2: H - B, class: 'viz-cross', visibility: 'hidden' }, svg);
  const hot = el('circle', { r: 4, class: 'viz-dot', visibility: 'hidden' }, svg);
  const hit = el('rect', { x: 0, y: 0, width: W, height: H, fill: 'transparent', tabindex: '0', 'aria-label': `${opts.label || 'Chart'}, use arrow keys to read values` }, svg);
  host.appendChild(svg);
  const tip = document.createElement('div');
  tip.className = 'viz-tip';
  tip.hidden = true;
  const tv = document.createElement('strong');
  const tl = document.createElement('span');
  tip.append(tv, tl);
  host.appendChild(tip);

  let cur = points.length - 1;
  const show = (i) => {
    cur = Math.max(0, Math.min(points.length - 1, i));
    const p = points[cur];
    const x = X(p.x), y = Y(p.y);
    cross.setAttribute('x1', x); cross.setAttribute('x2', x); cross.setAttribute('visibility', 'visible');
    hot.setAttribute('cx', x); hot.setAttribute('cy', y); hot.setAttribute('visibility', 'visible');
    tv.textContent = fmt(p.y) + (opts.unit ? ' ' + opts.unit : '');
    tl.textContent = fmtDate(p.x) + (p.n ? ` · ${p.n} rep${p.n > 1 ? 's' : ''}` : '');
    tip.hidden = false;
    const box = svg.getBoundingClientRect();
    const px = (x / W) * box.width;
    tip.style.left = Math.max(0, Math.min(box.width - tip.offsetWidth, px - tip.offsetWidth / 2)) + 'px';
  };
  const hide = () => { cross.setAttribute('visibility', 'hidden'); hot.setAttribute('visibility', 'hidden'); tip.hidden = true; };
  const nearest = (clientX) => {
    const box = svg.getBoundingClientRect();
    const sx = ((clientX - box.left) / box.width) * W;
    let best = 0, bd = Infinity;
    points.forEach((p, i) => { const dd = Math.abs(X(p.x) - sx); if (dd < bd) { bd = dd; best = i; } });
    return best;
  };
  hit.addEventListener('pointermove', (e) => show(nearest(e.clientX)));
  hit.addEventListener('pointerdown', (e) => show(nearest(e.clientX)));
  hit.addEventListener('pointerleave', hide);
  hit.addEventListener('focus', () => show(cur));
  hit.addEventListener('blur', hide);
  hit.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') { show(cur - 1); e.preventDefault(); }
    if (e.key === 'ArrowRight') { show(cur + 1); e.preventDefault(); }
  });

  // Table view, so no value is reachable only by hovering.
  const det = document.createElement('details');
  det.className = 'viz-table';
  const sum = document.createElement('summary');
  sum.textContent = 'Show data';
  const table = document.createElement('table');
  const hr = table.insertRow();
  ['Day', opts.label || 'Value'].forEach((h) => { const th = document.createElement('th'); th.textContent = h; hr.appendChild(th); });
  points.slice().reverse().forEach((p) => {
    const r = table.insertRow();
    r.insertCell().textContent = fmtDate(p.x);
    r.insertCell().textContent = fmt(p.y);
  });
  det.append(sum, table);
  host.appendChild(det);
}

// GitHub-style grid of practice minutes for the last `weeks` weeks, Monday-first.
export function heatmap(host, minutesByDay, weeks = 12) {
  host.innerHTML = '';
  host.classList.add('chart');
  const today = new Date(); today.setHours(12, 0, 0, 0);
  const dow = (today.getDay() + 6) % 7; // Monday = 0
  const start = new Date(today); start.setDate(start.getDate() - dow - (weeks - 1) * 7);
  const C = 13, G = 3, top = 14, left = 20;
  const W = left + weeks * (C + G), H = top + 7 * (C + G);
  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, class: 'heat-svg', role: 'img' });
  ['M', '', 'W', '', 'F', '', ''].forEach((t, i) => { if (t) { const x = el('text', { x: 0, y: top + i * (C + G) + 10, class: 'viz-tick' }, svg); x.textContent = t; } });
  const key = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const level = (m) => (!m ? 0 : m < 3 ? 1 : m < 6 ? 2 : m < 10 ? 3 : 4);
  const tip = document.createElement('div');
  tip.className = 'viz-tip';
  tip.hidden = true;
  let total = 0, active = 0, lastMonth = -1;
  for (let w = 0; w < weeks; w++) {
    for (let r = 0; r < 7; r++) {
      const d = new Date(start); d.setDate(start.getDate() + w * 7 + r);
      if (d > today) continue;
      if (r === 0 && d.getMonth() !== lastMonth) {
        lastMonth = d.getMonth();
        if (w < weeks - 1) { const m = el('text', { x: left + w * (C + G), y: 9, class: 'viz-tick' }, svg); m.textContent = d.toLocaleDateString(undefined, { month: 'short' }); }
      }
      const k = key(d);
      const mins = minutesByDay[k] || 0;
      if (mins) { total += mins; active++; }
      const cell = el('rect', { x: left + w * (C + G), y: top + r * (C + G), width: C, height: C, rx: 3, class: `heat-cell h${level(mins)}`, tabindex: '-1' }, svg);
      const label = `${d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}: ${mins ? Math.round(mins * 10) / 10 + ' min' : 'no practice'}`;
      const t = el('title', {}, cell); t.textContent = label;
      cell.addEventListener('pointerenter', () => {
        tip.textContent = label;
        tip.hidden = false;
        const box = svg.getBoundingClientRect();
        const px = ((left + w * (C + G)) / W) * box.width;
        tip.style.left = Math.max(0, Math.min(box.width - tip.offsetWidth, px - tip.offsetWidth / 2)) + 'px';
      });
      cell.addEventListener('pointerleave', () => { tip.hidden = true; });
    }
  }
  svg.setAttribute('aria-label', `Practice over the last ${weeks} weeks: ${active} days, ${Math.round(total)} minutes`);
  host.appendChild(svg);
  host.appendChild(tip);
  const leg = document.createElement('div');
  leg.className = 'heat-legend';
  leg.innerHTML = '<span>Less</span>' + [0, 1, 2, 3, 4].map((i) => `<i class="heat-cell h${i}"></i>`).join('') + '<span>More</span>';
  host.appendChild(leg);
}
