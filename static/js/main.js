(function () {
  'use strict';

  const SVGNS = 'http://www.w3.org/2000/svg';
  const MAGMA = ['#000004', '#1c1044', '#4f127b', '#812581', '#b5367a', '#e55964', '#fb8761', '#fec287', '#fcfdbf'];

  function hexToRgb(h) {
    const n = parseInt(h.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const MAGMA_RGB = MAGMA.map(hexToRgb);

  function magma(t) {
    t = Math.min(1, Math.max(0, t)) * (MAGMA_RGB.length - 1);
    const i = Math.min(MAGMA_RGB.length - 2, Math.floor(t));
    const f = t - i;
    const a = MAGMA_RGB[i], b = MAGMA_RGB[i + 1];
    return `rgb(${a.map((v, k) => Math.round(v + (b[k] - v) * f)).join(',')})`;
  }

  function el(tag, attrs, parent) {
    const e = document.createElementNS(SVGNS, tag);
    for (const k in attrs || {}) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }

  function getJSON(url) {
    return fetch(url).then(r => r.json());
  }

  /* ------------------------------------------------------------------ */
  /* Tabs                                                                */
  /* ------------------------------------------------------------------ */
  function initTabs() {
    document.querySelectorAll('.tabs[data-tabs]').forEach(group => {
      const name = group.dataset.tabs;
      group.querySelectorAll('button').forEach(btn => {
        btn.addEventListener('click', () => {
          group.querySelectorAll('button').forEach(b => b.classList.toggle('active', b === btn));
          document.querySelectorAll(`[data-pane^="${name}:"]`).forEach(p => {
            p.classList.toggle('active', p.dataset.pane === `${name}:${btn.dataset.tab}`);
          });
          group.dispatchEvent(new CustomEvent('tabchange', { detail: btn.dataset.tab }));
        });
      });
    });
  }

  /* ------------------------------------------------------------------ */
  /* Ant-Soccer heatmaps with hover readout                              */
  /* ------------------------------------------------------------------ */
  function initHeatmaps(data) {
    const [lo, hi] = data.range;
    const span = hi - lo;
    document.querySelectorAll('.teaser-card[data-map]').forEach(card => {
      const m = data.maps[card.dataset.map];
      const svg = card.querySelector('svg.overlay');
      const readout = card.querySelector('.readout');
      const [bx, by] = m.ball;
      const cx = bx - lo, cy = hi - by;
      el('circle', { cx, cy, r: 0.9, fill: 'none', stroke: '#fff', 'stroke-width': 0.13 }, svg);
      el('circle', { cx, cy, r: 0.3, fill: '#fff', stroke: '#111', 'stroke-width': 0.08 }, svg);
      el('circle', { cx, cy, r: 0.12, fill: '#111' }, svg);
      const probe = el('g', { opacity: 0 }, svg);
      el('circle', { r: 0.55, fill: 'none', stroke: '#fff', 'stroke-width': 0.08, 'stroke-dasharray': '0.2 0.15' }, probe);
      el('circle', { r: 0.14, fill: '#fff' }, probe);

      const n = m.grid.length;
      card.addEventListener('pointermove', e => {
        const r = card.getBoundingClientRect();
        const fx = (e.clientX - r.left) / r.width, fy = (e.clientY - r.top) / r.height;
        const x = lo + fx * span, y = hi - fy * span;
        const col = Math.min(n - 1, Math.max(0, Math.floor(((x - lo) / span) * n)));
        const row = Math.min(n - 1, Math.max(0, Math.floor(((y - lo) / span) * n)));
        const v = m.grid[row][col];
        readout.textContent = `ant at (${x.toFixed(1)}, ${y.toFixed(1)})  ·  Ê = ${v.toFixed(2)}`;
        probe.setAttribute('transform', `translate(${fx * span} ${fy * span})`);
        probe.setAttribute('opacity', 1);
      });
      card.addEventListener('pointerleave', () => probe.setAttribute('opacity', 0));
    });
  }

  /* ------------------------------------------------------------------ */
  /* Trajectory explorer                                                 */
  /* ------------------------------------------------------------------ */
  function Explorer(cfg) {
    const root = document.getElementById(cfg.id);
    const n = cfg.emp.length;
    const B = cfg.bounds; // phase boundaries as indices, length P+1
    const P = B.length - 1;
    const img = root.querySelector('.frame-box img');
    const flabel = root.querySelector('.frame-label');
    const range = root.querySelector('input[type=range]');
    const tval = root.querySelector('.tval');
    const playBtn = root.querySelector('.play');
    const svg = root.querySelector('.chart-box svg');

    // preload frames
    cfg.frames.forEach(f => { const im = new Image(); im.src = f.src; });

    function phaseOf(i) {
      for (let k = 0; k < P; k++) if (i < B[k + 1]) return k;
      return P - 1;
    }
    function warp(i) {
      const k = phaseOf(i);
      return k + (i - B[k]) / (B[k + 1] - B[k]);
    }
    function unwarp(x) {
      x = Math.min(P, Math.max(0, x));
      const k = Math.min(P - 1, Math.floor(x));
      return Math.round(B[k] + (x - k) * (B[k + 1] - B[k]));
    }

    // ---- chart geometry
    const W = 960, H = 330, L = 58, R = 16;
    const top = { y0: 34, y1: 196 }, bot = { y0: 232, y1: 304 };
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    const X = x => L + (x / P) * (W - L - R);
    const eMin = Math.min(...cfg.emp), eMax = Math.max(...cfg.emp);
    const pad = (eMax - eMin) * 0.08;
    const yLo = eMin - pad, yHi = eMax + pad;
    const YE = v => top.y1 - ((v - yLo) / (yHi - yLo)) * (top.y1 - top.y0);
    const YS = v => bot.y1 - (v / cfg.stateMax) * (bot.y1 - bot.y0);

    const defs = el('defs', {}, svg);
    const gid = cfg.id + '-grad';
    const grad = el('linearGradient', { id: gid, x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
    el('stop', { offset: '0%', 'stop-color': '#b5367a', 'stop-opacity': 0.28 }, grad);
    el('stop', { offset: '100%', 'stop-color': '#b5367a', 'stop-opacity': 0 }, grad);

    // phase bands + labels
    for (let k = 0; k < P; k++) {
      if (k % 2 === 1) el('rect', { x: X(k), y: top.y0 - 26, width: X(k + 1) - X(k), height: bot.y1 - top.y0 + 26, fill: '#f6f3f9' }, svg);
      const t = el('text', { x: (X(k) + X(k + 1)) / 2, y: top.y0 - 10, 'text-anchor': 'middle', 'font-size': 13, fill: '#6b6778', 'font-family': 'Inter, sans-serif' }, svg);
      t.textContent = cfg.phases[k];
    }
    // y grid (empowerment)
    const ticks = niceTicks(yLo, yHi, 4);
    ticks.forEach(v => {
      el('line', { x1: L, x2: W - R, y1: YE(v), y2: YE(v), stroke: '#e9e6ee', 'stroke-width': 1 }, svg);
      const t = el('text', { x: L - 8, y: YE(v) + 4, 'text-anchor': 'end', 'font-size': 12, fill: '#8a8794', 'font-family': 'Inter, sans-serif' }, svg);
      t.textContent = v.toFixed(2);
    });
    const yl = el('text', { x: 14, y: (top.y0 + top.y1) / 2, transform: `rotate(-90 14 ${(top.y0 + top.y1) / 2})`, 'text-anchor': 'middle', 'font-size': 13, fill: '#55525f', 'font-family': 'Inter, sans-serif' }, svg);
    yl.textContent = 'Empowerment';
    const yl2 = el('text', { x: 14, y: (bot.y0 + bot.y1) / 2, transform: `rotate(-90 14 ${(bot.y0 + bot.y1) / 2})`, 'text-anchor': 'middle', 'font-size': 12, fill: '#55525f', 'font-family': 'Inter, sans-serif' }, svg);
    yl2.textContent = 'State';
    el('line', { x1: L, x2: W - R, y1: bot.y1, y2: bot.y1, stroke: '#cfcbd6' }, svg);
    el('line', { x1: L, x2: W - R, y1: top.y1 + 4, y2: top.y1 + 4, stroke: '#e9e6ee' }, svg);
    // phase boundary ticks
    for (let k = 0; k <= P; k++) {
      el('line', { x1: X(k), x2: X(k), y1: top.y0 - 26, y2: bot.y1, stroke: '#ddd8e4', 'stroke-dasharray': '3 3' }, svg);
      const t = el('text', { x: X(k), y: bot.y1 + 17, 'text-anchor': 'middle', 'font-size': 12, fill: '#8a8794', 'font-family': 'Inter, sans-serif' }, svg);
      t.textContent = cfg.tOf(B[k]);
    }

    // area + line
    const pts = cfg.emp.map((v, i) => [X(warp(i)), YE(v)]);
    const lineD = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join('');
    el('path', { d: lineD + `L${X(P)} ${top.y1}L${X(0)} ${top.y1}Z`, fill: `url(#${gid})` }, svg);
    el('path', { d: lineD, fill: 'none', stroke: '#3b0f70', 'stroke-width': 2.2, 'stroke-linejoin': 'round' }, svg);

    // state lines
    cfg.states.forEach(s => {
      const d = s.values.map((v, i) => (i ? 'L' : 'M') + X(warp(i)).toFixed(1) + ' ' + YS(v).toFixed(1)).join('');
      el('path', { d, fill: 'none', stroke: s.color, 'stroke-width': 1.8, 'stroke-dasharray': s.dash || '' }, svg);
    });
    // state legend
    let lx = L + 8;
    cfg.states.forEach(s => {
      el('line', { x1: lx, x2: lx + 18, y1: bot.y0 - 14, y2: bot.y0 - 14, stroke: s.color, 'stroke-width': 2, 'stroke-dasharray': s.dash || '' }, svg);
      const t = el('text', { x: lx + 24, y: bot.y0 - 10, 'font-size': 11.5, fill: '#55525f', 'font-family': 'Inter, sans-serif' }, svg);
      t.textContent = s.label;
      lx += 32 + s.label.length * 6.4;
    });

    // frame markers
    cfg.frames.forEach(f => {
      const i = f.i;
      el('circle', { cx: X(warp(i)), cy: YE(cfg.emp[i]), r: 5, fill: '#fff', stroke: '#3b0f70', 'stroke-width': 1.8 }, svg);
    });

    // cursor
    const cursor = el('g', {}, svg);
    el('line', { y1: top.y0 - 26, y2: bot.y1, stroke: '#de4968', 'stroke-width': 1.5 }, cursor);
    const dot = el('circle', { r: 6, fill: '#de4968', stroke: '#fff', 'stroke-width': 2 }, svg);
    const bubbleG = el('g', {}, svg);
    const bubble = el('rect', { rx: 6, height: 22, fill: '#1d1628' }, bubbleG);
    const bubbleT = el('text', { 'font-size': 12, fill: '#fff', 'font-family': 'Inter, sans-serif', 'text-anchor': 'middle' }, bubbleG);

    range.max = n - 1;

    let cur = 0, timer = null;
    function set(i) {
      cur = Math.max(0, Math.min(n - 1, i));
      const x = X(warp(cur)), y = YE(cfg.emp[cur]);
      cursor.setAttribute('transform', `translate(${x} 0)`);
      dot.setAttribute('cx', x); dot.setAttribute('cy', y);
      const txt = cfg.emp[cur].toFixed(3);
      bubbleT.textContent = txt;
      const bw = 52;
      const bx = Math.min(W - R - bw / 2, Math.max(L + bw / 2, x));
      const by = y - 34 < top.y0 - 4 ? y + 14 : y - 32;
      bubble.setAttribute('x', bx - bw / 2); bubble.setAttribute('y', by); bubble.setAttribute('width', bw);
      bubbleT.setAttribute('x', bx); bubbleT.setAttribute('y', by + 15);
      range.value = cur;
      const k = phaseOf(cur);
      const f = cfg.frames[k];
      if (img.getAttribute('src') !== f.src) img.setAttribute('src', f.src);
      flabel.textContent = `${cfg.phases[k]} · rendered at t = ${cfg.tOf(f.i)}`;
      tval.textContent = `t = ${cfg.tOf(cur)}  ·  Ê = ${cfg.emp[cur].toFixed(3)}`;
      cfg.side(cur);
    }

    function pause() {
      if (timer) clearInterval(timer);
      timer = null;
      playBtn.innerHTML = '<svg viewBox="0 0 10 10"><path d="M2 1l7 4-7 4z"/></svg>';
      playBtn.setAttribute('aria-label', 'Play');
    }
    function play() {
      if (timer) return;
      if (cur >= n - 1) set(0);
      timer = setInterval(() => {
        if (cur >= n - 1) { pause(); return; }
        set(cur + 1);
      }, cfg.speed);
      playBtn.innerHTML = '<svg viewBox="0 0 10 10"><path d="M2 1h2v8H2zM6 1h2v8H6z"/></svg>';
      playBtn.setAttribute('aria-label', 'Pause');
    }
    playBtn.addEventListener('click', () => (timer ? pause() : play()));
    range.addEventListener('input', () => { pause(); set(+range.value); });

    function fromPointer(e) {
      const r = svg.getBoundingClientRect();
      const px = ((e.clientX - r.left) / r.width) * W;
      set(unwarp(((px - L) / (W - L - R)) * P));
    }
    let dragging = false;
    svg.addEventListener('pointerdown', e => { dragging = true; pause(); svg.setPointerCapture(e.pointerId); fromPointer(e); });
    svg.addEventListener('pointermove', e => { if (dragging) fromPointer(e); });
    svg.addEventListener('pointerup', () => { dragging = false; });

    set(0);
    pause();

    // autoplay once when scrolled into view
    if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver(entries => {
        if (entries.some(en => en.isIntersecting)) { play(); io.disconnect(); }
      }, { threshold: 0.3 });
      io.observe(root);
    }
  }

  function niceTicks(lo, hi, count) {
    const raw = (hi - lo) / count;
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const step = [1, 2, 2.5, 5, 10].map(s => s * mag).find(s => s >= raw);
    const out = [];
    for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(+v.toFixed(6));
    return out;
  }

  function initAntsoccer(d) {
    const root = document.getElementById('explorer-antsoccer');
    const td = root.querySelector('svg.topdown');
    const V = { x0: 3, x1: 19, y0: 1.5, y1: 17.5 };
    td.setAttribute('viewBox', `0 0 ${V.x1 - V.x0} ${V.y1 - V.y0}`);
    td.setAttribute('preserveAspectRatio', 'xMidYMid slice');
    const TX = x => x - V.x0, TY = y => V.y1 - y;
    // checker floor
    for (let gx = 0; gx < 20; gx += 2) for (let gy = 0; gy < 20; gy += 2) {
      el('rect', { x: TX(gx), y: TY(gy + 2), width: 2, height: 2, fill: ((gx + gy) / 2) % 2 ? '#2f3d62' : '#3a4b78' }, td);
    }
    const eMin = Math.min(...d.emp), eMax = Math.max(...d.emp);
    const trailG = el('g', {}, td);
    const ballTrail = el('polyline', { fill: 'none', stroke: 'rgba(255,255,255,0.55)', 'stroke-width': 0.08, 'stroke-dasharray': '0.25 0.18' }, td);
    const segs = [];
    for (let i = 1; i < d.t.length; i++) {
      segs.push(el('line', {
        x1: TX(d.ant[i - 1][0]), y1: TY(d.ant[i - 1][1]), x2: TX(d.ant[i][0]), y2: TY(d.ant[i][1]),
        stroke: magma(0.15 + 0.85 * (d.emp[i] - eMin) / (eMax - eMin)), 'stroke-width': 0.22, 'stroke-linecap': 'round', opacity: 0,
      }, trailG));
    }
    const ball = el('g', {}, td);
    el('circle', { r: 0.42, fill: '#fff', stroke: '#111', 'stroke-width': 0.07 }, ball);
    el('circle', { r: 0.16, fill: '#111' }, ball);
    const ant = el('g', {}, td);
    el('circle', { r: 0.95, fill: 'rgba(254,159,109,0.25)' }, ant);
    for (let a = 0; a < 4; a++) {
      const ang = Math.PI / 4 + a * Math.PI / 2;
      el('line', { x1: 0, y1: 0, x2: 0.75 * Math.cos(ang), y2: 0.75 * Math.sin(ang), stroke: '#f2b25c', 'stroke-width': 0.16, 'stroke-linecap': 'round' }, ant);
    }
    el('circle', { r: 0.34, fill: '#f6c070', stroke: '#c98a35', 'stroke-width': 0.05 }, ant);
    el('rect', { x: 0.5, y: V.y1 - V.y0 - 2.1, width: 3.1, height: 1.15, rx: 0.3, fill: 'rgba(0,0,0,0.55)' }, td);
    const lab = el('text', { x: 2.05, y: V.y1 - V.y0 - 1.28, 'text-anchor': 'middle', 'font-size': 0.7, fill: '#fff', 'font-family': 'Inter, sans-serif' }, td);

    const names = ['approach', 'kick', 'walk back', 'dribbling ball', 'kick again'];
    const frameT = [425, 465, 486, 565, 588];
    const frameSrc = ['approach_t425', 'kick1_t465', 'walkback_t486', 'atball_t565', 'kick2_t588'];
    const t0 = d.t[0];
    Explorer({
      id: 'explorer-antsoccer',
      emp: d.emp,
      bounds: [408, 459, 471, 500, 578, 600].map(t => t - t0),
      phases: names,
      frames: frameT.map((t, k) => ({ i: t - t0, src: `static/images/frames/as_${frameSrc[k]}.jpg` })),
      tOf: i => d.t[i],
      stateMax: 6.2,
      states: [
        { label: 'Ant–ball dist. (m)', color: '#d62728', values: d.dist },
        { label: 'Ball speed (m/s)', color: '#2ca02c', dash: '6 4', values: d.bspd.map(v => Math.min(v, 6.2)) },
      ],
      speed: 55,
      side: i => {
        ant.setAttribute('transform', `translate(${TX(d.ant[i][0])} ${TY(d.ant[i][1])})`);
        ball.setAttribute('transform', `translate(${TX(d.ball[i][0])} ${TY(d.ball[i][1])})`);
        segs.forEach((s, k) => s.setAttribute('opacity', k < i ? 1 : 0));
        ballTrail.setAttribute('points', d.ball.slice(0, i + 1).map(p => `${TX(p[0])},${TY(p[1])}`).join(' '));
        lab.textContent = `Ê = ${d.emp[i].toFixed(2)}`;
      },
    });
  }

  function initCube(d) {
    const root = document.getElementById('explorer-cube');
    const gbox = root.querySelector('.gauges');
    const eMin = Math.min(...d.emp), eMax = Math.max(...d.emp);
    const gauges = [
      { key: 'emp', label: 'Empowerment', max: eMax, min: eMin - 0.05, color: 'linear-gradient(90deg,#3b0f70,#b5367a,#fb8761)', fmt: v => v.toFixed(3), cls: 'emp' },
      { key: 'closed', label: 'Gripper closedness', max: 0.6, min: 0, color: '#9467bd', fmt: v => v.toFixed(2) },
      { key: 'height', label: 'Cube height (m)', max: 0.35, min: 0, color: '#2ca02c', fmt: v => v.toFixed(3) },
      { key: 'dist', label: 'Gripper–cube dist. (m)', max: 0.37, min: 0, color: '#d62728', fmt: v => v.toFixed(3) },
    ].map(g => {
      const w = document.createElement('div');
      w.className = 'gauge ' + (g.cls || '');
      w.innerHTML = `<div class="lbl"><span>${g.label}</span><span></span></div><div class="bar"><div style="background:${g.color}"></div></div>`;
      gbox.appendChild(w);
      g.val = w.querySelector('.lbl span:last-child');
      g.fill = w.querySelector('.bar > div');
      return g;
    });
    const n = d.emp.length;
    const names = ['approach', 'near', 'grab block', 'arc-up', 'descent', 'release'];
    const frameT = [8, 20, 33, 46, 56, 72];
    const frameSrc = ['approach_t008', 'near_t020', 'grab_t033', 'arcup_t046', 'descent_t056', 'release_t072'];
    Explorer({
      id: 'explorer-cube',
      emp: d.emp,
      bounds: [0, 19, 21, 40, 48, 69, n - 1],
      phases: names,
      frames: frameT.map((t, k) => ({ i: t, src: `static/images/frames/cube_${frameSrc[k]}.jpg` })),
      tOf: i => i,
      stateMax: 0.62,
      states: [
        { label: 'Gripper–cube dist. (m)', color: '#d62728', values: d.dist },
        { label: 'Cube height (m)', color: '#2ca02c', values: d.height },
        { label: 'Gripper closedness', color: '#9467bd', dash: '6 4', values: d.closed },
      ],
      speed: 130,
      side: i => {
        gauges.forEach(g => {
          const v = d[g.key][i];
          g.val.textContent = g.fmt(v);
          g.fill.style.width = (100 * Math.max(0, Math.min(1, (v - g.min) / (g.max - g.min)))).toFixed(1) + '%';
        });
      },
    });
  }

  /* ------------------------------------------------------------------ */
  /* Online exploration curves                                           */
  /* ------------------------------------------------------------------ */
  const STYLE = {
    crl: { color: '#8a897f', dash: '2 3' },
    ours: { color: '#2a78d6', dash: '' },
    rnd: { color: '#eb6834', dash: '7 4' },
    rnd_emp: { color: '#eb6834', dash: '' },
    supe: { color: '#e87ba4', dash: '7 4' },
    supe_emp: { color: '#2a78d6', dash: '' },
  };
  const FAMILY = { crl: ['crl', 'ours', 'rnd', 'rnd_emp'], supe: ['supe', 'supe_emp'] };

  function initOnline(panels) {
    const grid = document.getElementById('online-grid');
    const legend = document.getElementById('online-legend');
    const hidden = new Set();
    let family = 'crl';
    let renderers = [];

    function niceMax(x) {
      return [0.5, 1, 2, 5, 10, 20].find(v => v >= x - 1e-6) || x;
    }

    function build() {
      grid.innerHTML = '';
      renderers = panels.map(p => buildPanel(p));
      buildLegend();
    }

    function buildLegend() {
      legend.innerHTML = '';
      FAMILY[family].forEach(k => {
        const s = panels[0].series[k];
        if (!s) return;
        const item = document.createElement('span');
        item.className = 'item' + (hidden.has(k) ? ' off' : '');
        item.innerHTML = `<svg viewBox="0 0 28 10"><line x1="1" x2="27" y1="5" y2="5" stroke="${STYLE[k].color}" stroke-width="2.4" stroke-dasharray="${STYLE[k].dash}"/></svg>${s.label}`;
        item.addEventListener('click', () => {
          hidden.has(k) ? hidden.delete(k) : hidden.add(k);
          item.classList.toggle('off');
          renderers.forEach(r => r());
        });
        legend.appendChild(item);
      });
    }

    function buildPanel(p) {
      const keys = FAMILY[family].filter(k => p.series[k]);
      const xmax = niceMax(Math.max(...keys.map(k => p.series[k].x[p.series[k].x.length - 1])));
      const [env, ds] = p.title.split(' / ');
      const wrap = document.createElement('div');
      wrap.className = 'online-panel';
      wrap.innerHTML = `<h5>${env} <span>/ ${ds}</span></h5>`;
      const svg = el('svg', { viewBox: '0 0 320 230' });
      wrap.appendChild(svg);
      const tip = document.createElement('div');
      tip.className = 'tip';
      wrap.appendChild(tip);
      grid.appendChild(wrap);

      const L = 34, R = 10, T = 10, Bm = 200;
      const X = x => L + (x / xmax) * (320 - L - R);
      const Y = y => Bm - y * (Bm - T);
      [0, 0.25, 0.5, 0.75, 1].forEach(v => {
        el('line', { x1: L, x2: 320 - R, y1: Y(v), y2: Y(v), stroke: '#eeebf2' }, svg);
        if (v % 0.5 === 0) {
          const t = el('text', { x: L - 6, y: Y(v) + 4, 'text-anchor': 'end', 'font-size': 11.5, fill: '#8a8794', 'font-family': 'Inter, sans-serif' }, svg);
          t.textContent = v === 0 ? '0' : v === 1 ? '1' : '0.5';
        }
      });
      [0, xmax / 2, xmax].forEach(v => {
        const t = el('text', { x: X(v), y: Bm + 16, 'text-anchor': 'middle', 'font-size': 11.5, fill: '#8a8794', 'font-family': 'Inter, sans-serif' }, svg);
        t.textContent = v === 0 ? '0' : `${v}M`;
      });
      el('line', { x1: L, x2: 320 - R, y1: Bm, y2: Bm, stroke: '#bdb8c6' }, svg);
      const xl = el('text', { x: (L + 320 - R) / 2, y: Bm + 29, 'text-anchor': 'middle', 'font-size': 10, fill: '#8a8794', 'font-family': 'Inter, sans-serif' }, svg);
      xl.textContent = 'Environment steps';
      const yl = el('text', { x: 9, y: (T + Bm) / 2, transform: `rotate(-90 9 ${(T + Bm) / 2})`, 'text-anchor': 'middle', 'font-size': 10, fill: '#8a8794', 'font-family': 'Inter, sans-serif' }, svg);
      yl.textContent = 'Success rate';

      const layer = el('g', {}, svg);
      const hover = el('g', { opacity: 0 }, svg);
      el('line', { y1: T, y2: Bm, stroke: '#b9b3c4', 'stroke-dasharray': '3 3' }, hover);
      const dots = {};

      function render() {
        layer.innerHTML = '';
        // draw ours last so it sits on top
        const order = keys.slice().sort((a, b) => (STYLE[a].dash ? 0 : 1) - (STYLE[b].dash ? 0 : 1));
        order.forEach(k => {
          if (hidden.has(k)) return;
          const s = p.series[k];
          const up = s.x.map((x, i) => `${X(x).toFixed(1)} ${Y(Math.min(1, s.m[i] + s.se[i])).toFixed(1)}`);
          const dn = s.x.map((x, i) => `${X(x).toFixed(1)} ${Y(Math.max(0, s.m[i] - s.se[i])).toFixed(1)}`).reverse();
          el('path', { d: 'M' + up.join('L') + 'L' + dn.join('L') + 'Z', fill: STYLE[k].color, opacity: 0.14 }, layer);
          el('path', {
            d: 'M' + s.x.map((x, i) => `${X(x).toFixed(1)} ${Y(s.m[i]).toFixed(1)}`).join('L'),
            fill: 'none', stroke: STYLE[k].color, 'stroke-width': STYLE[k].dash ? 1.8 : 2.4,
            'stroke-dasharray': STYLE[k].dash, 'stroke-linejoin': 'round',
          }, layer);
        });
        keys.forEach(k => {
          if (!dots[k]) dots[k] = el('circle', { r: 3.5, fill: STYLE[k].color, stroke: '#fff', 'stroke-width': 1.5 }, hover);
          dots[k].style.display = hidden.has(k) ? 'none' : '';
        });
      }
      render();

      function interp(s, x) {
        if (x > s.x[s.x.length - 1]) return null;
        let i = s.x.findIndex(v => v >= x);
        if (i <= 0) return s.m[0];
        const f = (x - s.x[i - 1]) / (s.x[i] - s.x[i - 1]);
        return s.m[i - 1] + f * (s.m[i] - s.m[i - 1]);
      }

      svg.addEventListener('pointermove', e => {
        const r = svg.getBoundingClientRect();
        const px = ((e.clientX - r.left) / r.width) * 320;
        const x = Math.max(0, Math.min(xmax, ((px - L) / (320 - L - R)) * xmax));
        hover.setAttribute('opacity', 1);
        hover.querySelector('line').setAttribute('x1', X(x));
        hover.querySelector('line').setAttribute('x2', X(x));
        const rows = [];
        keys.forEach(k => {
          if (hidden.has(k)) return;
          const v = interp(p.series[k], x);
          if (v == null) { dots[k].style.display = 'none'; return; }
          dots[k].style.display = '';
          dots[k].setAttribute('cx', X(x)); dots[k].setAttribute('cy', Y(v));
          rows.push([v, `<span class="sw" style="background:${STYLE[k].color}"></span>${p.series[k].label}: <b>${(100 * v).toFixed(0)}%</b>`]);
        });
        rows.sort((a, b) => b[0] - a[0]);
        tip.innerHTML = `<div style="opacity:.7">${x < 1 ? (x * 1000).toFixed(0) + 'k' : x.toFixed(2) + 'M'} steps</div>` + rows.map(r => r[1]).join('<br>');
        tip.style.opacity = 1;
        const wr = wrap.getBoundingClientRect();
        let left = e.clientX - wr.left + 14;
        if (left + tip.offsetWidth > wr.width) left = e.clientX - wr.left - tip.offsetWidth - 14;
        tip.style.left = Math.max(4, left) + 'px';
        tip.style.top = Math.max(4, e.clientY - wr.top - tip.offsetHeight - 10) + 'px';
      });
      svg.addEventListener('pointerleave', () => { hover.setAttribute('opacity', 0); tip.style.opacity = 0; });
      return render;
    }

    document.querySelector('.tabs[data-tabs="online"]').addEventListener('tabchange', e => {
      family = e.detail;
      build();
    });
    build();
  }

  /* ------------------------------------------------------------------ */
  function initCopy() {
    const btn = document.querySelector('.copy');
    if (!btn) return;
    btn.addEventListener('click', () => {
      const txt = document.getElementById('bibtex-code').textContent;
      navigator.clipboard.writeText(txt).then(() => {
        btn.textContent = 'Copied!';
        setTimeout(() => (btn.textContent = 'Copy'), 1500);
      });
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    initTabs();
    initCopy();
    getJSON('static/data/antsoccer_grids.json').then(initHeatmaps);
    getJSON('static/data/antsoccer_traj.json').then(initAntsoccer);
    getJSON('static/data/cube_traj.json').then(initCube);
    getJSON('static/data/online_curves.json').then(initOnline);
  });
})();
