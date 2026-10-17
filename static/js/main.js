(function () {
  'use strict';

  const SVGNS = 'http://www.w3.org/2000/svg';
  const INK = '#333', INK2 = '#666', GRID = '#e6e6e6';

  function el(tag, attrs, parent) {
    const e = document.createElementNS(SVGNS, tag);
    for (const k in attrs || {}) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }

  function text(parent, x, y, str, attrs) {
    const t = el('text', Object.assign({ x, y, fill: INK2, 'font-size': 12 }, attrs || {}), parent);
    t.textContent = str;
    return t;
  }

  function getJSON(url) {
    return fetch(url).then(r => r.json());
  }

  function niceTicks(lo, hi, count) {
    const raw = (hi - lo) / count;
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const step = [1, 2, 2.5, 5, 10].map(s => s * mag).find(s => s >= raw);
    const out = [];
    for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(+v.toFixed(6));
    return out;
  }

  /* ------------------------------------------------------------------ */
  /* Trajectory video + synced empowerment plot                          */
  /* ------------------------------------------------------------------ */
  function TrajectoryPanel(cfg) {
    const root = document.getElementById(cfg.id);
    const video = root.querySelector('video');
    const svg = root.querySelector('svg');
    const btn = root.querySelector('.controls button');
    const tval = root.querySelector('.tval');
    const n = cfg.emp.length;
    const B = cfg.bounds;
    const P = B.length - 1;

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

    const W = 520, H = 330, L = 52, R = 10;
    const top = { y0: 44, y1: 200 }, bot = { y0: 236, y1: 300 };
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    const X = x => L + (x / P) * (W - L - R);
    const eMin = Math.min(...cfg.emp), eMax = Math.max(...cfg.emp);
    const pad = (eMax - eMin) * 0.08;
    const yLo = eMin - pad, yHi = eMax + pad;
    const YE = v => top.y1 - ((v - yLo) / (yHi - yLo)) * (top.y1 - top.y0);
    const YS = v => bot.y1 - (Math.min(v, cfg.stateMax) / cfg.stateMax) * (bot.y1 - bot.y0);

    // frames around the two panels
    el('rect', { x: L, y: 4, width: W - L - R, height: top.y1 - 4, fill: 'none', stroke: '#999' }, svg);
    el('rect', { x: L, y: bot.y0 - 22, width: W - L - R, height: bot.y1 - bot.y0 + 22, fill: 'none', stroke: '#999' }, svg);
    // phase separators and labels
    for (let k = 0; k <= P; k++) {
      el('line', { x1: X(k), x2: X(k), y1: 4, y2: top.y1, stroke: '#ddd' }, svg);
      el('line', { x1: X(k), x2: X(k), y1: bot.y0 - 22, y2: bot.y1, stroke: '#ddd' }, svg);
      text(svg, X(k), bot.y1 + 15, String(cfg.tOf(B[k])), { 'text-anchor': 'middle', 'font-size': 11 });
    }
    cfg.phases.forEach((name, k) => {
      const words = name.split(' ');
      words.forEach((w, j) => {
        text(svg, (X(k) + X(k + 1)) / 2, 18 + j * 13 + (words.length === 1 ? 6 : 0), w, { 'text-anchor': 'middle', 'font-size': 11.5, fill: '#555' });
      });
    });
    text(svg, (L + W - R) / 2, H - 2, 'Timestep (equal-width phases)', { 'text-anchor': 'middle', 'font-size': 12 });
    // y axis
    niceTicks(yLo, yHi, 4).forEach(v => {
      el('line', { x1: L, x2: W - R, y1: YE(v), y2: YE(v), stroke: GRID }, svg);
      text(svg, L - 6, YE(v) + 4, v.toFixed(2), { 'text-anchor': 'end', 'font-size': 11 });
    });
    text(svg, 12, (top.y0 + top.y1) / 2, 'Empowerment', { transform: `rotate(-90 12 ${(top.y0 + top.y1) / 2})`, 'text-anchor': 'middle', 'font-size': 12.5, fill: INK });
    text(svg, 12, (bot.y0 + bot.y1) / 2 - 8, 'State', { transform: `rotate(-90 12 ${(bot.y0 + bot.y1) / 2 - 8})`, 'text-anchor': 'middle', 'font-size': 12.5, fill: INK });
    [0, cfg.stateMax / 2].forEach(v => text(svg, L - 6, YS(v) + 4, String(+v.toFixed(2)), { 'text-anchor': 'end', 'font-size': 11 }));

    // empowerment curve
    el('path', {
      d: cfg.emp.map((v, i) => (i ? 'L' : 'M') + X(warp(i)).toFixed(1) + ' ' + YE(v).toFixed(1)).join(''),
      fill: 'none', stroke: '#1f4e79', 'stroke-width': 1.8, 'stroke-linejoin': 'round',
    }, svg);
    // state curves + legend
    let lx = L + 8;
    cfg.states.forEach(s => {
      el('path', {
        d: s.values.map((v, i) => (i ? 'L' : 'M') + X(warp(i)).toFixed(1) + ' ' + YS(v).toFixed(1)).join(''),
        fill: 'none', stroke: s.color, 'stroke-width': 1.6, 'stroke-dasharray': s.dash || '',
      }, svg);
      el('line', { x1: lx, x2: lx + 16, y1: bot.y0 - 11, y2: bot.y0 - 11, stroke: s.color, 'stroke-width': 1.8, 'stroke-dasharray': s.dash || '' }, svg);
      const t = text(svg, lx + 20, bot.y0 - 7, s.label, { 'font-size': 10.5, fill: '#444' });
      lx += 28 + s.label.length * 5.4;
      return t;
    });

    // cursor
    const cursor = el('line', { y1: 4, y2: bot.y1, stroke: '#aa551c', 'stroke-width': 1.4 }, svg);
    const dot = el('circle', { r: 4.2, fill: '#fff', stroke: '#aa551c', 'stroke-width': 1.8 }, svg);

    let shown = -1;
    function draw(i) {
      if (i === shown) return;
      shown = i;
      const x = X(warp(i));
      cursor.setAttribute('x1', x); cursor.setAttribute('x2', x);
      dot.setAttribute('cx', x); dot.setAttribute('cy', YE(cfg.emp[i]));
      tval.textContent = `t = ${cfg.tOf(i)}   empowerment = ${cfg.emp[i].toFixed(3)}`;
    }
    function frameNow() {
      return Math.max(0, Math.min(n - 1, Math.floor(video.currentTime * cfg.fps + 1e-3)));
    }
    function tick() {
      draw(frameNow());
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);

    function setBtn() { btn.textContent = video.paused ? 'Play' : 'Pause'; }
    video.addEventListener('play', setBtn);
    video.addEventListener('pause', setBtn);
    btn.addEventListener('click', () => (video.paused ? video.play() : video.pause()));
    setBtn();

    function seek(e) {
      const r = svg.getBoundingClientRect();
      const px = ((e.clientX - r.left) / r.width) * W;
      const i = unwarp(((px - L) / (W - L - R)) * P);
      video.currentTime = (i + 0.5) / cfg.fps;
      draw(i);
    }
    let dragging = false;
    svg.addEventListener('pointerdown', e => { dragging = true; video.pause(); svg.setPointerCapture(e.pointerId); seek(e); });
    svg.addEventListener('pointermove', e => { if (dragging) seek(e); });
    svg.addEventListener('pointerup', () => { dragging = false; });

    // play while on screen
    if ('IntersectionObserver' in window) {
      let userPaused = false;
      btn.addEventListener('click', () => { userPaused = video.paused; });
      new IntersectionObserver(entries => {
        entries.forEach(en => {
          if (en.isIntersecting && !userPaused && !dragging) video.play().catch(() => {});
          else if (!en.isIntersecting) video.pause();
        });
      }, { threshold: 0.25 }).observe(root);
    } else {
      video.play().catch(() => {});
    }
  }

  function initAntsoccer(d) {
    const t0 = d.t[0];
    TrajectoryPanel({
      id: 'traj-antsoccer',
      fps: 15,
      emp: d.emp,
      bounds: [408, 459, 471, 500, 578, 600].map(t => t - t0),
      phases: ['approach', 'kick', 'walk back', 'dribbling ball', 'kick again'],
      tOf: i => d.t[i],
      stateMax: 6,
      states: [
        { label: 'Ant–ball dist. (m)', color: '#d62728', values: d.dist },
        { label: 'Ball speed (m/s)', color: '#2ca02c', dash: '5 3', values: d.bspd },
      ],
    });
  }

  function initCube(d) {
    const n = d.emp.length;
    TrajectoryPanel({
      id: 'traj-cube',
      fps: 12,
      emp: d.emp,
      bounds: [0, 19, 21, 40, 48, 69, n - 1],
      phases: ['approach', 'near', 'grab block', 'arc-up', 'descent', 'release'],
      tOf: i => i,
      stateMax: 0.6,
      states: [
        { label: 'Gripper–cube dist. (m)', color: '#d62728', values: d.dist },
        { label: 'Cube height (m)', color: '#2ca02c', values: d.height },
        { label: 'Gripper closedness', color: '#9467bd', dash: '5 3', values: d.closed },
      ],
    });
  }

  /* ------------------------------------------------------------------ */
  /* Online exploration curves                                           */
  /* ------------------------------------------------------------------ */
  const STYLE = {
    crl: { color: '#8a897f', dash: '2 2.5' },
    ours: { color: '#2a78d6', dash: '' },
    rnd: { color: '#eb6834', dash: '6 3' },
    rnd_emp: { color: '#eb6834', dash: '' },
    supe: { color: '#e87ba4', dash: '6 3' },
    supe_emp: { color: '#2a78d6', dash: '' },
  };
  const FAMILY = { crl: ['crl', 'ours', 'rnd', 'rnd_emp'], supe: ['supe', 'supe_emp'] };

  function initOnline(panels) {
    const grid = document.getElementById('online-grid');
    const legend = document.getElementById('online-legend');
    const hidden = new Set();
    let family = 'crl';
    let renderers = [];

    const niceMax = x => [0.5, 1, 2, 5, 10, 20].find(v => v >= x - 1e-6) || x;

    function build() {
      grid.innerHTML = '';
      renderers = panels.map(buildPanel);
      legend.innerHTML = '';
      FAMILY[family].forEach(k => {
        const s = panels[0].series[k];
        if (!s) return;
        const item = document.createElement('span');
        item.className = 'item' + (hidden.has(k) ? ' off' : '');
        item.innerHTML = `<svg viewBox="0 0 28 10"><line x1="1" x2="27" y1="5" y2="5" stroke="${STYLE[k].color}" stroke-width="2.2" stroke-dasharray="${STYLE[k].dash}"/></svg>${s.label}`;
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
      wrap.innerHTML = `<h5>${env}<br><span>${ds}</span></h5>`;
      const VW = 300, VH = 220;
      const svg = el('svg', { viewBox: `0 0 ${VW} ${VH}` });
      wrap.appendChild(svg);
      const tip = document.createElement('div');
      tip.className = 'tip';
      wrap.appendChild(tip);
      grid.appendChild(wrap);

      const L = 40, R = 10, T = 8, Bm = 186;
      const X = x => L + (x / xmax) * (VW - L - R);
      const Y = y => Bm - y * (Bm - T);
      [0, 0.25, 0.5, 0.75, 1].forEach(v => {
        el('line', { x1: L, x2: VW - R, y1: Y(v), y2: Y(v), stroke: GRID }, svg);
        if (v === 0 || v === 0.5 || v === 1) text(svg, L - 6, Y(v) + 4, v === 0.5 ? '0.5' : String(v), { 'text-anchor': 'end', 'font-size': 12 });
      });
      el('line', { x1: L, x2: L, y1: T, y2: Bm, stroke: '#999' }, svg);
      el('line', { x1: L, x2: VW - R, y1: Bm, y2: Bm, stroke: '#999' }, svg);
      [0, xmax / 2, xmax].forEach(v => text(svg, X(v), Bm + 15, v === 0 ? '0' : `${v}M`, { 'text-anchor': 'middle', 'font-size': 12 }));
      text(svg, (L + VW - R) / 2, VH - 2, 'Environment steps', { 'text-anchor': 'middle', 'font-size': 12 });
      text(svg, 11, (T + Bm) / 2, 'Success rate', { transform: `rotate(-90 11 ${(T + Bm) / 2})`, 'text-anchor': 'middle', 'font-size': 12 });

      const layer = el('g', {}, svg);
      const hover = el('g', { opacity: 0 }, svg);
      const vline = el('line', { y1: T, y2: Bm, stroke: '#bbb', 'stroke-dasharray': '3 3' }, hover);
      const dots = {};
      keys.forEach(k => { dots[k] = el('circle', { r: 3.2, fill: STYLE[k].color, stroke: '#fff', 'stroke-width': 1.2 }, hover); });

      function render() {
        layer.innerHTML = '';
        const order = keys.slice().sort((a, b) => (STYLE[a].dash ? 0 : 1) - (STYLE[b].dash ? 0 : 1));
        order.forEach(k => {
          if (hidden.has(k)) return;
          const s = p.series[k];
          const up = s.x.map((x, i) => `${X(x).toFixed(1)} ${Y(Math.min(1, s.m[i] + s.se[i])).toFixed(1)}`);
          const dn = s.x.map((x, i) => `${X(x).toFixed(1)} ${Y(Math.max(0, s.m[i] - s.se[i])).toFixed(1)}`).reverse();
          el('path', { d: 'M' + up.join('L') + 'L' + dn.join('L') + 'Z', fill: STYLE[k].color, opacity: 0.15 }, layer);
          el('path', {
            d: 'M' + s.x.map((x, i) => `${X(x).toFixed(1)} ${Y(s.m[i]).toFixed(1)}`).join('L'),
            fill: 'none', stroke: STYLE[k].color, 'stroke-width': 1.7, 'stroke-dasharray': STYLE[k].dash, 'stroke-linejoin': 'round',
          }, layer);
        });
      }
      render();

      function interp(s, x) {
        if (x > s.x[s.x.length - 1]) return null;
        const i = s.x.findIndex(v => v >= x);
        if (i <= 0) return s.m[0];
        const f = (x - s.x[i - 1]) / (s.x[i] - s.x[i - 1]);
        return s.m[i - 1] + f * (s.m[i] - s.m[i - 1]);
      }

      svg.addEventListener('pointermove', e => {
        const r = svg.getBoundingClientRect();
        const px = ((e.clientX - r.left) / r.width) * VW;
        const x = Math.max(0, Math.min(xmax, ((px - L) / (VW - L - R)) * xmax));
        hover.setAttribute('opacity', 1);
        vline.setAttribute('x1', X(x)); vline.setAttribute('x2', X(x));
        const rows = [];
        keys.forEach(k => {
          const v = hidden.has(k) ? null : interp(p.series[k], x);
          if (v == null) { dots[k].style.display = 'none'; return; }
          dots[k].style.display = '';
          dots[k].setAttribute('cx', X(x)); dots[k].setAttribute('cy', Y(v));
          rows.push([v, `<span class="sw" style="background:${STYLE[k].color}"></span>${p.series[k].label}: ${(100 * v).toFixed(0)}%`]);
        });
        rows.sort((a, b) => b[0] - a[0]);
        tip.innerHTML = `<div style="color:#888">${x < 1 ? (x * 1000).toFixed(0) + 'k' : x.toFixed(2) + 'M'} steps</div>` + rows.map(r => r[1]).join('<br>');
        tip.style.opacity = 1;
        const wr = wrap.getBoundingClientRect();
        let left = e.clientX - wr.left + 12;
        if (left + tip.offsetWidth > wr.width) left = e.clientX - wr.left - tip.offsetWidth - 12;
        tip.style.left = Math.max(0, left) + 'px';
        tip.style.top = Math.max(0, e.clientY - wr.top - tip.offsetHeight - 8) + 'px';
      });
      svg.addEventListener('pointerleave', () => { hover.setAttribute('opacity', 0); tip.style.opacity = 0; });
      return render;
    }

    document.querySelectorAll('#online-toggle button').forEach(b => {
      b.addEventListener('click', () => {
        document.querySelectorAll('#online-toggle button').forEach(x => x.classList.toggle('active', x === b));
        family = b.dataset.family;
        build();
      });
    });
    build();
  }

  document.addEventListener('DOMContentLoaded', () => {
    getJSON('static/data/antsoccer_traj.json').then(initAntsoccer);
    getJSON('static/data/cube_traj.json').then(initCube);
    getJSON('static/data/online_curves.json').then(initOnline);
  });
})();
