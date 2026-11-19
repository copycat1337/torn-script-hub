// ==UserScript==
// @name         Quick Bookmark Wheel
// @namespace    quick-bookmark-wheel
// @author       c0pyc4t 4039125
// @version      1.2.0
// @match        https://www.torn.com/*
// @exclude      https://www.torn.com/*
// @description  Spin a wheel of your bookmarks on any site. Ctrl+Shift or right-edge swipe to open. All items editable.
// @match        *://*/*
// @run-at       document-idle
// @noframes
// @grant        none
// @license      MIT
// ==/UserScript==

(function () {
  'use strict';
  if (window.__qbWheel) return;
  window.__qbWheel = true;

  // ---------- config ----------
  const BM_KEY = 'qbWheel_bookmarks_v1';
  const THEME_KEY = 'qbWheel_theme_v1';
  const ANIM_KEY = 'qbWheel_anim_v1';
  const HINT_KEY = 'qbWheel_hintSeen_v1';
  const LONG_PRESS_MS = 600;

  // wheel geometry (mobile arc)
  const R_IN = 64;
  const R_OUT = 170;
  const GAP_DEG = 1.6;
  const VISIBLE = 5;
  const STEP_SPIN = 90 / VISIBLE;
  const SIZE = R_OUT + 10;
  const rr = (R_IN + R_OUT) / 2;

  // desktop compass geometry
  const PC_R_IN = 50;
  const PC_R_OUT = 132;
  const PC_SIZE = (PC_R_OUT + 14) * 2;
  const PC_C = PC_SIZE / 2;
  const PC_WGAP = 1.6;
  const PC_VISIBLE = 30;
  const PC_SETTINGS_SPAN = 32; // degrees for the Settings wedge at top
  const PC_SETTINGS_CENTER = 90; // straight up
  const PC_BOOKMARK_SPAN = 360 - PC_SETTINGS_SPAN;
  const PC_BOOKMARK_START = PC_SETTINGS_CENTER + PC_SETTINGS_SPAN / 2; // clockwise from top-right

  const MAX_VEL = 0.08;
  const mod = (a, b) => ((a % b) + b) % b;
  const haptic = ms => { if (navigator.vibrate) { try { navigator.vibrate(ms); } catch (_) {} } };

  // ---------- default bookmarks ----------
  const DEFAULT_BM = [
    { id: 'bm-google', label: 'Google', url: 'https://google.com' },
    { id: 'bm-youtube', label: 'YouTube', url: 'https://youtube.com' },
    { id: 'bm-github', label: 'GitHub', url: 'https://github.com' },
    { id: 'bm-gmail', label: 'Gmail', url: 'https://mail.google.com' },
    { id: 'bm-reddit', label: 'Reddit', url: 'https://reddit.com' },
    { id: 'bm-wikipedia', label: 'Wikipedia', url: 'https://wikipedia.org' },
    { id: 'bm-amazon', label: 'Amazon', url: 'https://amazon.com' },
    { id: 'bm-chatgpt', label: 'ChatGPT', url: 'https://chat.openai.com' },
  ];
  const SETTINGS_ITEM = { id: '__settings__', label: 'Settings', isSettings: true };

  // ---------- theme ----------
  const mixHex = (hex, to, t) => '#' + [1, 3, 5].map(i => {
    const c = parseInt(hex.substr(i, 2), 16), d = parseInt(to.substr(i, 2), 16);
    return Math.round(c + (d - c) * t).toString(16).padStart(2, '0');
  }).join('');
  const THEMES = [
    { id: 'green', name: 'Lime', a1: '#c6f24a', a2: '#8bc63f', a3: '#355e13' },
    { id: 'blue', name: 'Ocean', a1: '#8ef6ff', a2: '#1fb8ff', a3: '#0a3a5c' },
    { id: 'purple', name: 'Grape', a1: '#e2b8ff', a2: '#a855f7', a3: '#3b1466' },
    { id: 'pink', name: 'Rose', a1: '#ffa8da', a2: '#e0218a', a3: '#5c0b37' },
    { id: 'orange', name: 'Sunset', a1: '#ffc996', a2: '#ff8a1f', a3: '#5c2e05' },
    { id: 'gold', name: 'Gold', a1: '#ffe98f', a2: '#f2b705', a3: '#574200' },
    { id: 'aqua', name: 'Mint', a1: '#a3ffe8', a2: '#19d3a6', a3: '#0a4a3c' },
    { id: 'silver', name: 'Steel', a1: '#ffffff', a2: '#c3cad3', a3: '#3a4048' },
  ];
  const rgbOf = hex => [1, 3, 5].map(i => parseInt(hex.substr(i, 2), 16)).join(' ');
  const lum = hex => {
    const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.substr(i, 2), 16) / 255)
      .map(c => c <= .03928 ? c / 12.92 : Math.pow((c + .055) / 1.055, 2.4));
    return .2126 * r + .7152 * g + .0722 * b;
  };
  const inkOn = hex => (lum(hex) + .05) / .056 >= 1.05 / (lum(hex) + .05) ? '#0e1408' : '#ffffff';
  let themeId = 'green';
  try { themeId = localStorage.getItem(THEME_KEY) || 'green'; } catch (_) {}
  function applyTheme(id) {
    const t = THEMES.find(x => x.id === id) || THEMES[0];
    themeId = t.id;
    const st = document.documentElement.style;
    st.setProperty('--qb-a1', t.a1);
    st.setProperty('--qb-a2', t.a2);
    st.setProperty('--qb-a3', t.a3);
    st.setProperty('--qb-a1-rgb', rgbOf(t.a1));
    st.setProperty('--qb-a2-rgb', rgbOf(t.a2));
    st.setProperty('--qb-ink', inkOn(t.a2));
    st.setProperty('--qb-ink1', inkOn(t.a1));
  }
  applyTheme(themeId);

  // ---------- animation ----------
  const ANIM_LEVELS = [
    { id: 'quality', name: 'Quality', note: 'Full bloom, blur and glows. Modern devices.' },
    { id: 'balanced', name: 'Balanced', note: 'Lighter blur, no ripple. Mid-range devices.' },
    { id: 'perf', name: 'Performance', note: 'Quick fade, no blur or glows. Older devices.' },
    { id: 'ultra', name: 'Ultra', note: 'No animation at all. Very low-end devices.' },
  ];
  function autoAnim() {
    const mem = navigator.deviceMemory || 0, cores = navigator.hardwareConcurrency || 0;
    if (mem) return mem <= 1 ? 'ultra' : mem <= 2 ? 'perf' : mem <= 4 ? 'balanced' : 'quality';
    return cores && cores <= 2 ? 'perf' : 'quality';
  }
  let animChosen = null;
  try { animChosen = localStorage.getItem(ANIM_KEY); } catch (_) {}
  if (!ANIM_LEVELS.some(l => l.id === animChosen)) animChosen = null;
  let animLevel = animChosen || autoAnim();
  function applyAnim() {
    const cl = document.documentElement.classList;
    ANIM_LEVELS.forEach(l => cl.toggle('qb-anim-' + l.id, l.id === animLevel));
  }
  applyAnim();

  // ---------- geometry ----------
  function polar(r, deg) {
    const rad = (deg * Math.PI) / 180;
    return [SIZE + r * Math.cos(rad), SIZE - r * Math.sin(rad)];
  }
  function arcPath(rIn, rOut, a1, a2) {
    const [x1, y1] = polar(rOut, a1);
    const [x2, y2] = polar(rOut, a2);
    const [x3, y3] = polar(rIn, a2);
    const [x4, y4] = polar(rIn, a1);
    return `M${x1} ${y1}A${rOut} ${rOut} 0 0 0 ${x2} ${y2}L${x3} ${y3}A${rIn} ${rIn} 0 0 1 ${x4} ${y4}Z`;
  }
  function pointerTriangle(rMid, angle) {
    const apex = polar(rMid - 7, angle);
    const b1 = polar(rMid + 6, angle - 2.2);
    const b2 = polar(rMid + 6, angle + 2.2);
    return `M${apex[0]} ${apex[1]} L${b1[0]} ${b1[1]} L${b2[0]} ${b2[1]} Z`;
  }
  // desktop compass polar (centred)
  function pcPolar(r, deg) {
    const rad = (deg * Math.PI) / 180;
    return [PC_C + r * Math.cos(rad), PC_C - r * Math.sin(rad)];
  }
  function pcArc(a1, a2) {
    const [x1, y1] = pcPolar(PC_R_OUT, a1), [x2, y2] = pcPolar(PC_R_OUT, a2);
    const [x3, y3] = pcPolar(PC_R_IN, a2), [x4, y4] = pcPolar(PC_R_IN, a1);
    return `M${x1} ${y1}A${PC_R_OUT} ${PC_R_OUT} 0 0 0 ${x2} ${y2}L${x3} ${y3}A${PC_R_IN} ${PC_R_IN} 0 0 1 ${x4} ${y4}Z`;
  }

  // ---------- icons ----------
  const S = 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';
  const ICONS = {
    gear: `<g ${S}><circle cx="12" cy="12" r="3.2"/><path d="M19.4 13a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z"/></g>`,
    plus: `<g ${S}><path d="M12 5v14M5 12h14"/></g>`,
    close: `<g ${S}><path d="M5 5l14 14M19 5L5 19"/></g>`,
    edit: `<g ${S}><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></g>`,
    trash: `<g ${S}><path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></g>`,
    external: `<g ${S}><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><path d="M15 3h6v6M10 14L21 3"/></g>`,
  };
  function svg(inner) { return `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">${inner}</svg>`; }

  // deterministic colour from a label, so the same bookmark always gets the same colour
  const ICON_COLORS = ['#e04040', '#40a0e0', '#e0a040', '#40c060', '#a060e0', '#e060a0', '#60c0c0', '#e0c040', '#c06040', '#4060c0'];
  function colorForLabel(label) {
    let hash = 0;
    for (let i = 0; i < label.length; i++) hash = (hash * 31 + label.charCodeAt(i)) | 0;
    return ICON_COLORS[Math.abs(hash) % ICON_COLORS.length];
  }

  // favicon-based icon for a bookmark, with a coloured-letter fallback always visible behind it.
  // If the favicon loads it covers the letter; if it fails (onerror) the img is removed and the
  // letter shows through.
  function bookmarkIcon(item) {
    if (item.isSettings) return svg(ICONS.gear);
    if (item.iconSvg) return item.iconSvg;
    const letter = ((item.label || '?')[0] || '?').toUpperCase();
    const color = colorForLabel(item.label || '?');
    const fallback = `<span class="qb-letter" style="color:${color}">${letter}</span>`;
    try {
      const u = new URL(item.url);
      return fallback + `<img src="https://www.google.com/s2/favicons?domain=${u.hostname}&sz=64" alt="" onerror="this.remove()">`;
    } catch (_) {
      return fallback;
    }
  }

  // small icon for settings panel list (same approach, smaller letter)
  function bookmarkIconSmall(item) {
    if (item.isSettings) return svg(ICONS.gear);
    const letter = ((item.label || '?')[0] || '?').toUpperCase();
    const color = colorForLabel(item.label || '?');
    const fallback = `<span class="qb-letter" style="color:${color}">${letter}</span>`;
    try {
      const u = new URL(item.url);
      return fallback + `<img src="https://www.google.com/s2/favicons?domain=${u.hostname}&sz=64" alt="" onerror="this.remove()">`;
    } catch (_) {
      return fallback;
    }
  }

  // ---------- state ----------
  let bookmarks = [];
  try {
    const cached = JSON.parse(localStorage.getItem(BM_KEY) || 'null');
    if (Array.isArray(cached)) bookmarks = cached;
    else bookmarks = DEFAULT_BM.map(b => ({ ...b }));
  } catch (_) { bookmarks = DEFAULT_BM.map(b => ({ ...b })); }
  function saveBookmarks() { try { localStorage.setItem(BM_KEY, JSON.stringify(bookmarks)); } catch (_) {} }

  // wheel items = Settings (fixed) + bookmarks
  function getItems() { return [SETTINGS_ITEM, ...bookmarks]; }
  let items = getItems();

  // ---------- CSS ----------
  const style = document.createElement('style');
  style.textContent = `
    #qb-root {
      --a1: var(--qb-a1); --a2: var(--qb-a2); --a3: var(--qb-a3);
      --ink: var(--qb-ink); --ink1: var(--qb-ink1);
      --spring: cubic-bezier(.34, 1.56, .64, 1);
      --ease: cubic-bezier(.22, 1, .36, 1);
      font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
      -webkit-tap-highlight-color: transparent;
    }
    #qb-root * { -webkit-user-select: none; user-select: none; -webkit-touch-callout: none; }
    #qb-root input { -webkit-user-select: text; user-select: text; -webkit-touch-callout: default; }

    #qb-overlay {
      position: fixed; inset: 0; z-index: 2147483644; touch-action: none;
      background: radial-gradient(120% 120% at 100% 100%, rgba(6,8,12,.8), rgba(6,8,12,.46) 60%, rgba(6,8,12,.32));
      -webkit-backdrop-filter: blur(5px) saturate(1.15);
      backdrop-filter: blur(5px) saturate(1.15);
      opacity: 0; pointer-events: none;
      transition: opacity .25s var(--ease);
    }
    #qb-overlay.show { opacity: 1; pointer-events: auto; }
    #qb-overlay.leaving { pointer-events: none; }

    #qb-wheel {
      position: fixed; right: 26px; bottom: 26px; transform-origin: 100% 100%;
      width: ${SIZE}px; height: ${SIZE}px; z-index: 2147483645;
      pointer-events: none; user-select: none; -webkit-user-select: none;
    }
    #qb-wheel > svg { position: absolute; inset: 0; overflow: visible; pointer-events: none; }
    #qb-wheel:not(.open) { visibility: hidden !important; opacity: 0 !important; }
    #qb-wheel.open { visibility: visible; opacity: 1; }
    #qb-wheel.closing { visibility: visible !important; opacity: 1 !important; }
    #qb-wheel:not(.settled) .qb-wg, #qb-wheel:not(.settled) .qb-ico { filter: none !important; }

    .qb-wg {
      transform-box: view-box; transform-origin: ${SIZE}px ${SIZE}px;
      opacity: 0; transform: rotate(-27deg) scale(.35);
      transition: transform .2s cubic-bezier(.55, 0, .75, .2) var(--rd, 0ms), opacity .16s ease var(--rd, 0ms);
      will-change: transform, opacity;
    }
    #qb-wheel.open .qb-wg {
      opacity: 1; transform: none;
      transition: transform .44s var(--spring) var(--d, 0ms), opacity .16s ease var(--d, 0ms);
    }
    #qb-wheel.open .qb-wg.on {
      transform: scale(1.045);
      transition: transform .18s var(--spring), opacity .18s ease;
    }
    .qb-seg-bg { fill: rgba(12, 14, 18, .62); }
    .qb-seg {
      fill: url(#qb-g-off); stroke: rgba(255,255,255,.16); stroke-width: 1;
      transition: fill .16s ease, stroke .16s ease, filter .16s ease;
    }
    .qb-wg.featured .qb-seg {
      stroke: var(--a2); stroke-width: 1.3;
      filter: drop-shadow(0 0 8px rgb(var(--qb-a2-rgb) / .5));
    }
    .qb-wg.on .qb-seg {
      fill: url(#qb-g-on); stroke: rgba(255,255,255,.7);
      filter: drop-shadow(0 0 12px rgb(var(--qb-a2-rgb) / .65));
    }
    .qb-wg.settings .qb-seg {
      fill: url(#qb-g-on); stroke: var(--a2); stroke-width: 1.2;
    }

    #qb-icons { position: absolute; inset: 0; pointer-events: none; }
    .qb-ip {
      position: absolute; left: 0; top: 0; width: 30px; height: 30px;
      margin: -15px 0 0 -15px; will-change: transform, opacity;
    }
    .qb-ico {
      width: 100%; height: 100%; color: rgba(255,255,255,.82);
      filter: drop-shadow(0 1px 3px rgba(0,0,0,.6));
      opacity: 0; transform: scale(.3);
      transition: transform .2s cubic-bezier(.55, 0, .75, .2) var(--rd, 0ms), opacity .16s ease var(--rd, 0ms), color .16s ease;
      will-change: transform, opacity;
      display: flex; align-items: center; justify-content: center; position: relative;
    }
    .qb-ico svg { width: 100%; height: 100%; display: block; }
    .qb-ico .qb-letter { font: 700 13px system-ui; display: flex; align-items: center; justify-content: center; }
    .qb-ico img { position: absolute; width: 22px; height: 22px; object-fit: contain; border-radius: 3px; }
    #qb-wheel.open .qb-ico {
      opacity: 1; transform: none;
      transition: transform .4s var(--spring) calc(var(--d, 0ms) + 90ms), opacity .16s ease calc(var(--d, 0ms) + 90ms), color .16s ease;
    }
    #qb-wheel.open .qb-ico.featured { color: #fff; transform: scale(1.14); }
    #qb-wheel.open .qb-ico.on {
      color: #fff; transform: scale(1.32);
      filter: drop-shadow(0 0 8px rgb(var(--qb-a1-rgb) / .7)) drop-shadow(0 1px 3px rgba(0,0,0,.6));
    }
    #qb-wheel.open .qb-ico.settings { color: var(--a1); }
    #qb-wheel.open.settled .qb-wg, #qb-wheel.open.settled .qb-ico { transition-delay: 0ms; }

    #qb-pointer {
      fill: var(--a2); opacity: 0; transition: opacity .18s ease;
      filter: drop-shadow(0 0 5px rgb(var(--qb-a2-rgb) / .85));
    }
    #qb-wheel.open.can-spin #qb-pointer { opacity: 1; }

    #qb-label {
      position: absolute; right: -6px; bottom: 100%; margin-bottom: 16px;
      padding: 8px 14px; border-radius: 6px;
      background: #17191d; border: 1px solid rgba(255,255,255,.16);
      font: 600 12px/1 system-ui; letter-spacing: .16em; text-transform: uppercase;
      color: #fff; white-space: nowrap;
      pointer-events: none; opacity: 0; transform: translateY(8px) scale(.96);
      transition: opacity .22s var(--ease), transform .32s var(--spring);
    }
    #qb-wheel.open #qb-label { opacity: 1; transform: none; transition-delay: .14s; }
    #qb-label.dim { color: rgba(255,255,255,.6); }
    #qb-label.pop { animation: qb-pop .2s var(--spring); }
    @keyframes qb-pop { from { opacity: .35; transform: translateY(5px) scale(.95); } to { opacity: 1; transform: none; } }

    /* ---- settings panel ---- */
    #qb-panel {
      position: fixed; right: 14px; bottom: 80px; z-index: 2147483646;
      width: 300px; max-width: calc(100vw - 20px); max-height: calc(100vh - 100px); overflow-y: auto;
      padding: 14px; border-radius: 8px; color: #fff; box-sizing: border-box;
      background: #17191d; border: 1px solid rgba(255,255,255,.14);
      opacity: 0; transform: translateY(10px) scale(.94); transform-origin: 100% 100%;
      pointer-events: none;
      transition: opacity .2s var(--ease), transform .32s var(--spring);
    }
    #qb-panel.show { opacity: 1; transform: none; pointer-events: auto; }
    .qb-ptitle { font: 650 15px/1.2 system-ui; color: #fff; margin-bottom: 4px; }
    .qb-pdesc { font: 400 12px/1.4 system-ui; color: rgba(255,255,255,.5); margin-bottom: 12px; }
    .qb-psec {
      margin: 14px 0 6px; font: 600 10px/1 system-ui; letter-spacing: .14em;
      text-transform: uppercase; color: var(--a2);
    }

    .qb-bm-list { display: flex; flex-direction: column; gap: 4px; }
    .qb-bm-item {
      display: flex; align-items: center; gap: 8px; width: 100%;
      padding: 8px 10px; border-radius: 6px;
      border: 1px solid rgba(255,255,255,.1); background: rgba(255,255,255,.04);
      color: #fff; font: 500 12.5px/18px system-ui; text-align: left; cursor: pointer;
      box-sizing: border-box; transition: background .15s ease, border-color .15s ease;
    }
    .qb-bm-item:hover { background: rgb(var(--qb-a2-rgb) / .14); border-color: rgb(var(--qb-a2-rgb) / .4); }
    .qb-bm-item .qb-bm-ico { width: 18px; height: 18px; flex: 0 0 18px; display: flex; align-items: center; justify-content: center; position: relative; }
    .qb-bm-item .qb-bm-ico img { position: absolute; width: 18px; height: 18px; object-fit: contain; border-radius: 3px; }
    .qb-bm-item .qb-bm-ico .qb-letter { font: 700 10px system-ui; display: flex; align-items: center; justify-content: center; }
    .qb-bm-item span.qb-bm-label { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .qb-bm-item .qb-bm-edit { flex: 0 0 16px; width: 16px; height: 16px; color: rgba(255,255,255,.4); }
    .qb-bm-item:hover .qb-bm-edit { color: var(--a1); }
    .qb-bm-del {
      flex: 0 0 22px; width: 22px; height: 22px; padding: 0; border: none;
      background: none; color: rgba(255,255,255,.3); cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      border-radius: 4px; transition: color .15s ease, background .15s ease;
    }
    .qb-bm-del:hover { color: #ff6060; background: rgba(255,80,80,.12); }
    .qb-bm-del svg { width: 14px; height: 14px; }
    .qb-bm-settings { border-style: dashed; color: rgba(255,255,255,.6); }

    .qb-btn {
      display: block; width: 100%; padding: 9px 12px; border-radius: 6px; margin: 0;
      font: 600 13px/18px system-ui; height: auto; box-sizing: border-box; cursor: pointer;
      border: 1px solid rgba(255,255,255,.16); background: rgba(255,255,255,.06);
      color: #fff; transition: transform .18s var(--spring), background .15s ease;
    }
    .qb-btn:hover { background: rgba(255,255,255,.1); }
    .qb-btn:active { transform: scale(.97); }
    .qb-btn.primary { border-color: var(--a2); background: rgb(var(--qb-a2-rgb) / .2); color: var(--a1); }
    .qb-btn.primary:hover { background: rgb(var(--qb-a2-rgb) / .3); }
    .qb-btn.danger { border-color: rgba(255,80,80,.4); background: rgba(255,80,80,.1); color: #ff8080; }
    .qb-btn.danger:hover { background: rgba(255,80,80,.18); }

    .qb-tgrid { display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 4px; }
    .qb-tgrid button {
      display: flex; align-items: center; gap: 6px; padding: 6px 8px;
      border-radius: 6px; border: 1px solid rgba(255,255,255,.1);
      background: rgba(255,255,255,.03); color: rgba(255,255,255,.85);
      font: 500 11px/16px system-ui; cursor: pointer; text-align: left;
      transition: border-color .15s ease, background .15s ease;
    }
    .qb-tgrid button:hover { border-color: rgba(255,255,255,.28); }
    .qb-tgrid button.on { border-color: var(--a2); background: rgb(var(--qb-a2-rgb) / .14); color: #fff; }
    .qb-tsw {
      width: 14px; height: 14px; border-radius: 50%; flex: 0 0 14px;
      background: linear-gradient(135deg, var(--sw1, var(--qb-a1)), var(--sw2, var(--qb-a2)));
      box-shadow: inset 0 0 0 1px rgba(0,0,0,.25);
    }

    .qb-alist { display: grid; gap: 4px; }
    .qb-alist button {
      padding: 8px 10px; border-radius: 6px; border: 1px solid rgba(255,255,255,.1);
      background: rgba(255,255,255,.03); color: #fff; cursor: pointer; text-align: left;
      transition: border-color .15s ease, background .15s ease;
    }
    .qb-alist button:hover { border-color: rgba(255,255,255,.28); }
    .qb-alist button.on { border-color: var(--a2); background: rgb(var(--qb-a2-rgb) / .14); }
    .qb-alist b { font: 600 12px/18px system-ui; display: block; }
    .qb-alist b i { font-style: normal; font-weight: 500; color: rgba(255,255,255,.5); }
    .qb-alist span { font: 400 11px/1.35 system-ui; color: rgba(255,255,255,.6); display: block; margin-top: 1px; }

    /* ---- picker ---- */
    #qb-picker {
      position: fixed; left: 50%; top: 50%; transform: translate(-50%, -50%) scale(.97);
      z-index: 2147483647; width: 340px; max-width: calc(100vw - 20px);
      padding: 16px; border-radius: 8px; color: #fff; box-sizing: border-box;
      background: #17191d; border: 1px solid rgba(255,255,255,.14);
      opacity: 0; pointer-events: none;
      transition: opacity .2s var(--ease), transform .3s var(--spring);
    }
    #qb-picker.show { opacity: 1; transform: translate(-50%, -50%) scale(1); pointer-events: auto; }
    .qb-pk-title { font: 600 14px system-ui; margin-bottom: 12px; }
    .qb-pk-lbl { display: block; font: 600 11px/1 system-ui; letter-spacing: .08em; text-transform: uppercase; color: rgba(255,255,255,.5); margin: 10px 0 4px; }
    .qb-pk-input {
      width: 100%; padding: 9px 11px; box-sizing: border-box;
      border-radius: 6px; border: 1px solid rgba(255,255,255,.16);
      background: rgba(255,255,255,.06); color: #fff; font: 14px system-ui;
    }
    .qb-pk-input:focus { outline: none; border-color: var(--a2); }
    .qb-pk-input::placeholder { color: rgba(255,255,255,.35); }
    .qb-pk-preview {
      display: flex; align-items: center; gap: 8px; margin-top: 12px; padding: 8px 10px;
      border-radius: 6px; background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.1);
    }
    .qb-pk-preview .qb-pp-ico { width: 20px; height: 20px; flex: 0 0 20px; display: flex; align-items: center; justify-content: center; }
    .qb-pk-preview .qb-pp-ico img { width: 20px; height: 20px; border-radius: 3px; object-fit: contain; }
    .qb-pk-preview .qb-pp-letter { font: 700 12px system-ui; color: var(--a1); }
    .qb-pk-preview span { font: 500 12px system-ui; color: rgba(255,255,255,.7); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .qb-pk-row { display: flex; gap: 8px; margin-top: 14px; }
    .qb-pk-row .qb-btn { flex: 1; }

    #qb-pbg { position: fixed; inset: 0; z-index: 2147483643; display: none; }
    #qb-pbg.show { display: block; }

    /* ---- desktop compass wheel ---- */
    #qb-pc {
      --a1: var(--qb-a1); --a2: var(--qb-a2); --a3: var(--qb-a3);
      --ink: var(--qb-ink); --ink1: var(--qb-ink1);
      --spring: cubic-bezier(.34, 1.56, .64, 1); --ease: cubic-bezier(.22, 1, .36, 1);
      position: fixed; inset: 0; z-index: 2147483644; pointer-events: none;
      font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
      user-select: none; -webkit-user-select: none;
    }
    #qb-pc.open.grab { pointer-events: auto; cursor: default; }
    #qb-pc-dim {
      position: absolute; inset: 0; opacity: 0; transition: opacity .14s ease;
      background: radial-gradient(circle at var(--qb-x, 50%) var(--qb-y, 50%), rgba(6,8,12,.55), rgba(6,8,12,.28) 300px, rgba(6,8,12,.14));
    }
    #qb-pc.open #qb-pc-dim { opacity: 1; }
    #qb-pc-wheel {
      position: absolute; left: 0; top: 0;
      opacity: 0; transform: scale(.9);
      transition: opacity .12s ease, transform .2s var(--spring);
    }
    #qb-pc.open #qb-pc-wheel { opacity: 1; transform: none; }
    #qb-pc-wheel > svg { position: absolute; inset: 0; overflow: visible; }
    .qb-pc-back { fill: #0b0c0f; filter: drop-shadow(0 10px 28px rgba(0,0,0,.55)); }
    .qb-pc-hub { fill: #121418; stroke: rgba(255,255,255,.08); stroke-width: 1; }
    .qb-pcw {
      fill: url(#qb-pc-g-off); stroke: rgba(255,255,255,.16); stroke-width: 1;
      transition: fill .12s ease, stroke .12s ease, filter .12s ease;
    }
    .qb-pcg.on .qb-pcw {
      fill: url(#qb-pc-g-on); stroke: rgba(255,255,255,.7);
      filter: drop-shadow(0 0 12px rgb(var(--qb-a2-rgb) / .65));
    }
    .qb-pcg.settings .qb-pcw { fill: url(#qb-pc-g-on); stroke: var(--a2); stroke-width: 1.2; }
    #qb-pc-icons { position: absolute; inset: 0; pointer-events: none; }
    .qb-pci {
      position: absolute; width: 20px; height: 20px; margin: -10px 0 0 -10px;
      color: rgba(255,255,255,.82); filter: drop-shadow(0 1px 3px rgba(0,0,0,.6));
      transition: transform .16s var(--spring), color .12s ease;
      display: flex; align-items: center; justify-content: center;
    }
    .qb-pci svg { width: 100%; height: 100%; display: block; }
    .qb-pci .qb-letter { font: 700 10px system-ui; display: flex; align-items: center; justify-content: center; }
    .qb-pci img { position: absolute; width: 16px; height: 16px; object-fit: contain; border-radius: 3px; }
    .qb-pci.settings { color: var(--a1); }
    .qb-pci.on { color: #fff; transform: scale(1.25); filter: drop-shadow(0 0 8px rgb(var(--qb-a1-rgb) / .7)) drop-shadow(0 1px 3px rgba(0,0,0,.6)); }
    .qb-pcg > path {
      transform-box: view-box; transform-origin: 50% 50%; scale: .62; opacity: 0;
      transition: scale .12s ease-in, opacity .1s ease, fill .12s ease, stroke .12s ease, filter .12s ease;
    }
    #qb-pc.open .qb-pcg > path {
      scale: 1; opacity: 1;
      transition: scale .28s var(--spring) var(--d, 0ms), opacity .12s ease var(--d, 0ms), fill .12s ease, stroke .12s ease, filter .12s ease;
    }
    .qb-pci { scale: .4; opacity: 0; }
    #qb-pc.open .qb-pci {
      scale: 1; opacity: 1;
      transition: scale .28s var(--spring) calc(var(--d, 0ms) + 40ms), opacity .12s ease calc(var(--d, 0ms) + 40ms), transform .16s var(--spring), color .12s ease;
    }
    #qb-pc-label {
      position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%);
      padding: 7px 12px; border-radius: 6px; background: #17191d;
      border: 1px solid rgba(255,255,255,.16); color: #fff; white-space: nowrap;
      font: 600 11px/1 system-ui; letter-spacing: .14em; text-transform: uppercase;
      pointer-events: none;
    }
    #qb-pc-label.hide { display: none; }

    /* ---- first-run hint ---- */
    #qb-hint {
      position: fixed; left: 50%; bottom: 24px; z-index: 2147483646; box-sizing: border-box;
      width: 380px; max-width: calc(100vw - 32px); padding: 14px 16px;
      transform: translate(-50%, 12px); opacity: 0; pointer-events: none;
      transition: opacity .2s ease, transform .3s var(--spring);
      border-radius: 8px; background: #17191d; border: 1px solid rgba(255,255,255,.14);
      border-left: 3px solid var(--qb-a2); color: #fff;
      font: 13px/1.45 system-ui, -apple-system, sans-serif;
    }
    #qb-hint.show { opacity: 1; transform: translate(-50%, 0); pointer-events: auto; }
    #qb-hint b { display: block; margin-bottom: 3px; font: 600 11px/1.2 system-ui; letter-spacing: .14em; text-transform: uppercase; color: var(--qb-a2); }
    #qb-hint button {
      display: block; margin: 10px 0 0 auto; padding: 6px 14px; height: auto; line-height: 18px;
      border: none; border-radius: 6px; background: var(--qb-a2); color: var(--qb-ink);
      font: 600 12px system-ui; cursor: pointer;
    }

    /* ---- animation levels ---- */
    .qb-anim-balanced #qb-overlay { -webkit-backdrop-filter: blur(3px); backdrop-filter: blur(3px); }
    .qb-anim-perf #qb-overlay, .qb-anim-ultra #qb-overlay {
      -webkit-backdrop-filter: none; backdrop-filter: none;
      background: radial-gradient(120% 120% at 100% 100%, rgba(6,8,12,.95), rgba(6,8,12,.86) 60%, rgba(6,8,12,.8));
    }
    .qb-anim-perf .qb-wg, .qb-anim-perf .qb-ico { transform: none !important; transition-duration: .15s !important; }
    .qb-anim-perf #qb-wheel *, .qb-anim-perf #qb-pc * { filter: none !important; animation: none !important; }
    .qb-anim-ultra #qb-wheel *, .qb-anim-ultra #qb-pc *, .qb-anim-ultra #qb-overlay { transition: none !important; animation: none !important; }
    .qb-anim-ultra .qb-wg, .qb-anim-ultra .qb-ico { transform: none !important; }
    .qb-anim-ultra #qb-wheel *, .qb-anim-ultra #qb-pc * { filter: none !important; }

    @media (prefers-reduced-motion: reduce) {
      .qb-wg, .qb-ico { transform: none !important; transition: opacity .15s ease !important; }
      #qb-pc * { transition-duration: .01s !important; }
    }
  `;
  document.head.appendChild(style);

  // ---------- DOM ----------
  const root = document.createElement('div');
  root.id = 'qb-root';

  const overlay = document.createElement('div');
  overlay.id = 'qb-overlay';

  const wheel = document.createElement('div');
  wheel.id = 'qb-wheel';
  wheel.innerHTML = `
    <svg viewBox="0 0 ${SIZE} ${SIZE}" width="${SIZE}" height="${SIZE}">
      <defs>
        <linearGradient id="qb-g-off" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#fff" stop-opacity=".2"/>
          <stop offset="1" stop-color="#fff" stop-opacity=".04"/>
        </linearGradient>
        <linearGradient id="qb-g-on" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" style="stop-color:var(--qb-a1)" stop-opacity=".8"/>
          <stop offset="1" style="stop-color:var(--qb-a2)" stop-opacity=".4"/>
        </linearGradient>
      </defs>
      <g id="qb-segs"></g>
      <path id="qb-pointer"/>
    </svg>
    <div id="qb-icons"></div>
    <div id="qb-label" class="dim">Bookmarks</div>`;

  root.appendChild(wheel);
  root.appendChild(overlay);

  // settings panel
  const panel = document.createElement('div');
  panel.id = 'qb-panel';
  panel.innerHTML = `
    <div class="qb-ptitle">Quick Bookmarks</div>
    <div class="qb-pdesc">Long-press (mobile) or right-click (desktop) any wheel item to edit it.</div>
    <div class="qb-psec">Bookmarks</div>
    <div class="qb-bm-list" id="qb-bm-list"></div>
    <button type="button" class="qb-btn primary" id="qb-bm-add" style="margin-top:6px">${svg(ICONS.plus)} Add bookmark</button>
    <div class="qb-psec">Theme</div>
    <div class="qb-tgrid" id="qb-tgrid"></div>
    <div class="qb-psec">Animation</div>
    <div class="qb-alist" id="qb-alist"></div>`;

  root.appendChild(panel);

  // picker
  const picker = document.createElement('div');
  picker.id = 'qb-picker';
  picker.innerHTML = `
    <div class="qb-pk-title" id="qb-pk-title">Add bookmark</div>
    <label class="qb-pk-lbl">Label</label>
    <input id="qb-pk-label" class="qb-pk-input" type="text" placeholder="My bookmark" autocomplete="off">
    <label class="qb-pk-lbl">URL</label>
    <input id="qb-pk-url" class="qb-pk-input" type="text" placeholder="https://example.com" autocomplete="off">
    <div class="qb-pk-preview" id="qb-pk-preview" style="display:none">
      <div class="qb-pp-ico" id="qb-pp-ico"></div>
      <span id="qb-pp-label"></span>
    </div>
    <div class="qb-pk-row">
      <button type="button" class="qb-btn danger" id="qb-pk-remove" style="display:none">Remove</button>
      <button type="button" class="qb-btn" id="qb-pk-cancel">Cancel</button>
      <button type="button" class="qb-btn" id="qb-pk-save-new" style="display:none">Save &amp; New</button>
      <button type="button" class="qb-btn primary" id="qb-pk-save">Save &amp; Close</button>
    </div>`;

  root.appendChild(picker);

  const pbg = document.createElement('div');
  pbg.id = 'qb-pbg';

  // desktop compass wheel
  const pcRoot = document.createElement('div');
  pcRoot.id = 'qb-pc';
  pcRoot.innerHTML = `
    <div id="qb-pc-dim"></div>
    <div id="qb-pc-wheel" style="width:${PC_SIZE}px;height:${PC_SIZE}px">
      <svg viewBox="0 0 ${PC_SIZE} ${PC_SIZE}" width="${PC_SIZE}" height="${PC_SIZE}">
        <defs>
          <linearGradient id="qb-pc-g-off" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stop-color="#fff" stop-opacity=".2"/>
            <stop offset="1" stop-color="#fff" stop-opacity=".04"/>
          </linearGradient>
          <linearGradient id="qb-pc-g-on" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" style="stop-color:var(--qb-a1)" stop-opacity=".8"/>
            <stop offset="1" style="stop-color:var(--qb-a2)" stop-opacity=".4"/>
          </linearGradient>
        </defs>
        <circle class="qb-pc-back" cx="${PC_C}" cy="${PC_C}" r="${PC_R_OUT + 3}"/>
        <circle class="qb-pc-hub" cx="${PC_C}" cy="${PC_C}" r="${PC_R_IN - 4}"/>
        <g id="qb-pc-segs"></g>
      </svg>
      <div id="qb-pc-icons"></div>
      <div id="qb-pc-label" class="hide"></div>
    </div>`;

  // first-run hint
  const hint = document.createElement('div');
  hint.id = 'qb-hint';

  // mount
  document.body.appendChild(root);
  document.body.appendChild(pbg);
  document.body.appendChild(pcRoot);
  document.body.appendChild(hint);

  // references
  const segsG = wheel.querySelector('#qb-segs');
  const iconsLayer = wheel.querySelector('#qb-icons');
  const labelEl = wheel.querySelector('#qb-label');
  const pointerEl = wheel.querySelector('#qb-pointer');
  const bmList = panel.querySelector('#qb-bm-list');
  const bmAddBtn = panel.querySelector('#qb-bm-add');
  const tgrid = panel.querySelector('#qb-tgrid');
  const alist = panel.querySelector('#qb-alist');
  const pcWheel = pcRoot.querySelector('#qb-pc-wheel');
  const pcDim = pcRoot.querySelector('#qb-pc-dim');
  const pcSegsG = pcRoot.querySelector('#qb-pc-segs');
  const pcIcons = pcRoot.querySelector('#qb-pc-icons');
  const pcLabel = pcRoot.querySelector('#qb-pc-label');

  // picker refs
  const pkTitle = picker.querySelector('#qb-pk-title');
  const pkLabelInput = picker.querySelector('#qb-pk-label');
  const pkUrlInput = picker.querySelector('#qb-pk-url');
  const pkPreview = picker.querySelector('#qb-pk-preview');
  const ppIco = picker.querySelector('#qb-pp-ico');
  const ppLabel = picker.querySelector('#qb-pp-label');
  const pkSaveBtn = picker.querySelector('#qb-pk-save');
  const pkSaveNewBtn = picker.querySelector('#qb-pk-save-new');
  const pkCancelBtn = picker.querySelector('#qb-pk-cancel');
  const pkRemoveBtn = picker.querySelector('#qb-pk-remove');

  // ---------- state ----------
  let n = 0, canSpin = false, vis = 0, step = 0;
  let rot = 0, open = false, activeI = -1, featI = -1;
  let spinning = false, dragging = false, vel = 0;
  let rafId = 0, lastFrame = 0, lastTickI = 0;
  let gesture = null, settleT = null, closeT = null, backdropT = null;
  let pendingRebuild = false, shownLabel = null;
  let reg = [];
  let editingIdx = -1; // index into bookmarks array (-1 = adding new)

  // desktop mode
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
  let pcMode = finePointer.matches;
  if (finePointer.addEventListener) finePointer.addEventListener('change', () => { pcMode = finePointer.matches; applyMode(); });

  // ---------- wheel build + render ----------
  function rebuild() {
    items = getItems();
    n = items.length;
    canSpin = n > VISIBLE;
    vis = canSpin ? VISIBLE : n;
    step = canSpin ? STEP_SPIN : (n ? 90 / n : 90);

    if (!canSpin || rot >= n) rot = 0;
    rot = Math.round(rot);
    vel = 0;
    wheel.classList.toggle('can-spin', canSpin);

    const d = arcPath(R_IN, R_OUT, 90 + GAP_DEG / 2, 90 + step - GAP_DEG / 2);

    segsG.innerHTML = items.map(it => {
      const cls = it.isSettings ? ' settings' : '';
      return `<g class="qb-wg${cls}"><path class="qb-seg-bg" d="${d}"/><path class="qb-seg" d="${d}"/></g>`;
    }).join('');

    iconsLayer.innerHTML = items.map(it =>
      `<div class="qb-ip${it.isSettings ? ' settings' : ''}"><div class="qb-ico${it.isSettings ? ' settings' : ''}">${bookmarkIcon(it)}</div></div>`
    ).join('');

    reg = items.map((_, i) => ({
      wg: segsG.children[i],
      ip: iconsLayer.children[i],
      ico: iconsLayer.children[i].querySelector('.qb-ico'),
    }));

    if (canSpin) {
      const anchorAngle = 90 + step / 2;
      pointerEl.setAttribute('d', pointerTriangle((R_OUT + 10) / 2 + 5, anchorAngle));
    }

    activeI = -1;
    featI = -1;
    lastTickI = Math.round(rot);
    render();
    updateFeatured();
    refreshLabel(false);
  }

  function slotPos(i) {
    return canSpin ? mod(i - rot + 1.5, n) - 1.5 : i;
  }

  function render() {
    for (let i = 0; i < n; i++) {
      const p = slotPos(i);
      const e = Math.max(-p, p + 1 - vis, 0);
      const v = Math.max(0, 1 - e * 1.25);
      const { wg, ip } = reg[i];

      if (v <= 0.01) { wg.style.display = 'none'; ip.style.display = 'none'; continue; }
      wg.style.display = '';
      ip.style.display = '';
      wg.setAttribute('transform', `rotate(${(-p * step).toFixed(2)} ${SIZE} ${SIZE})`);
      wg.style.opacity = v.toFixed(3);

      const [x, y] = polar(rr, 90 + (p + 0.5) * step);
      ip.style.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px) scale(${(0.7 + 0.3 * v).toFixed(3)})`;
      ip.style.opacity = v.toFixed(3);
    }
  }

  function prepEntrance() {
    for (let i = 0; i < n; i++) {
      const p = slotPos(i);
      const k = Math.min(Math.max(Math.round(p), 0), Math.max(vis - 1, 0));
      const [x, y] = polar(rr, 90 + (p + 0.5) * step);
      const d = `${k * 40}ms`, rd = `${(vis - 1 - k) * 8}ms`;
      const { wg, ico } = reg[i];
      wg.style.setProperty('--d', d);
      wg.style.setProperty('--rd', rd);
      ico.style.setProperty('--d', d);
      ico.style.setProperty('--rd', rd);
    }
  }

  function featuredIndex() {
    if (!canSpin || !n) return -1;
    let best = 0, bestAbs = Infinity;
    for (let i = 0; i < n; i++) {
      const d = Math.abs(slotPos(i));
      if (d < bestAbs) { bestAbs = d; best = i; }
    }
    return best;
  }

  function updateFeatured() {
    const f = featuredIndex();
    if (f === featI) return;
    if (featI >= 0 && reg[featI]) { reg[featI].wg.classList.remove('featured'); reg[featI].ico.classList.remove('featured'); }
    featI = f;
    if (featI >= 0 && reg[featI]) { reg[featI].wg.classList.add('featured'); reg[featI].ico.classList.add('featured'); }
  }

  function refreshLabel(animate) {
    let text, dim = false;
    if (activeI >= 0 && items[activeI]) {
      text = items[activeI].label;
    } else if (canSpin && featI >= 0 && items[featI]) {
      text = items[featI].label;
    } else {
      text = canSpin ? 'Drag to browse' : 'Bookmarks';
      dim = true;
    }
    if (text === shownLabel) return;
    shownLabel = text;
    labelEl.textContent = text;
    labelEl.classList.toggle('dim', dim);
    if (animate) { labelEl.classList.remove('pop'); void labelEl.offsetWidth; labelEl.classList.add('pop'); }
  }

  function setActive(i) {
    if (i === activeI) return;
    if (activeI >= 0 && reg[activeI]) { reg[activeI].wg.classList.remove('on'); reg[activeI].ico.classList.remove('on'); }
    activeI = i;
    if (i >= 0 && reg[i]) { reg[i].wg.classList.add('on'); reg[i].ico.classList.add('on'); haptic(8); }
    refreshLabel(true);
  }

  // ---------- spin physics ----------
  function afterRotChange() {
    rot = n ? mod(rot, n) : 0;
    if (!Number.isFinite(rot)) rot = 0;
    render();
    updateFeatured();
    const ti = Math.round(rot);
    if (ti !== lastTickI) { lastTickI = ti; haptic(5); }
    refreshLabel(true);
  }

  function loop() {
    rafId = 0;
    const t = performance.now();
    const dt = Math.min(48, Math.max(1, t - lastFrame));
    lastFrame = t;
    if (dragging) return;
    let animating = false;
    if (Math.abs(vel) > 0.0004) {
      rot += vel * dt;
      vel *= Math.pow(0.945, dt / 16.7);
      animating = true;
      afterRotChange();
    } else {
      vel = 0;
      const target = Math.round(rot);
      const diff = target - rot;
      if (Math.abs(diff) > 0.002) {
        rot += diff * (1 - Math.pow(0.0004, dt / 1000));
        animating = true;
        afterRotChange();
      } else {
        if (diff !== 0) { rot = target; afterRotChange(); }
        spinning = false;
        refreshLabel(true);
      }
    }
    if (animating) rafId = requestAnimationFrame(loop);
  }
  function kick() { if (rafId) return; lastFrame = performance.now(); rafId = requestAnimationFrame(loop); }

  // ---------- geometry helpers for touch ----------
  function geom(cx, cy) {
    const r = wheel.getBoundingClientRect();
    // the wheel may be scaled on short screens
    const scale = r.width / SIZE || 1;
    const ox = r.left + r.width; // bottom-right corner (transform-origin)
    const oy = r.top + r.height;
    const dx = cx - ox;
    const dy = oy - cy;
    let deg = (Math.atan2(dy, dx) * 180) / Math.PI;
    if (deg < 0) deg += 360;
    return { dist: Math.hypot(dx, dy) / scale, deg, scale };
  }

  function itemAt(g) {
    if (!n) return -1;
    if (g.dist < R_IN - 6 || g.dist > R_OUT + 6) return -1;
    let sectorDeg = g.deg;
    if (sectorDeg < 90) sectorDeg += 360;
    const pos = (sectorDeg - 90) / step;
    if (pos < 0 || pos >= vis) return -1;
    return canSpin ? mod(Math.floor(pos + rot), n) : Math.min(Math.floor(pos), n - 1);
  }

  function angleDelta(next, previous) {
    let d = next - previous;
    if (d > 180) d -= 360;
    if (d < -180) d += 360;
    return d;
  }

  // ---------- touch handling ----------
  function clearSelection() {
    try {
      const sel = window.getSelection();
      if (sel && sel.rangeCount && !(document.activeElement && /^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName))) sel.removeAllRanges();
    } catch (_) {}
  }

  overlay.addEventListener('pointerdown', e => {
    if (!open) return;
    clearSelection();
    const g = geom(e.clientX, e.clientY);
    vel = 0;
    if (g.dist >= R_IN - 6 && g.dist <= R_OUT + 6) {
      try { overlay.setPointerCapture(e.pointerId); } catch (_) {}
      const startItem = itemAt(g);
      gesture = {
        zone: 'ring', startX: e.clientX, startY: e.clientY,
        lastDeg: g.deg, lastT: e.timeStamp, startItem, moved: false, longFired: false
      };
      // long-press to edit (skip Settings)
      if (startItem >= 0 && !items[startItem].isSettings) {
        gesture.timer = setTimeout(() => {
          if (!gesture || gesture.zone !== 'ring') return;
          gesture.longFired = true;
          clearSelection();
          haptic(40);
          setOpen(false);
          // items[startItem] is a bookmark at index startItem-1 in bookmarks array
          openPicker(startItem - 1);
        }, LONG_PRESS_MS);
      }
      dragging = false;
      setActive(startItem);
    } else {
      gesture = { zone: 'out' };
    }
  });

  overlay.addEventListener('pointermove', e => {
    if (!open || !gesture || gesture.zone !== 'ring') return;
    const g = geom(e.clientX, e.clientY);
    const dx = e.clientX - gesture.startX;
    const dy = e.clientY - gesture.startY;
    const movedDistance = Math.hypot(dx, dy);
    if (!gesture.moved && movedDistance < 11) { setActive(itemAt(g)); return; }
    if (gesture.timer) { clearTimeout(gesture.timer); gesture.timer = null; }
    if (!canSpin) { gesture.moved = true; setActive(-1); return; }
    gesture.moved = true;
    dragging = true;
    spinning = true;
    setActive(-1);
    const dd = angleDelta(g.deg, gesture.lastDeg);
    const dRot = -dd / step;
    const rawDt = e.timeStamp - gesture.lastT;
    const dt = rawDt > 4 && rawDt < 200 ? rawDt : 16;
    vel = Math.max(-MAX_VEL, Math.min(MAX_VEL, 0.75 * vel + 0.25 * (dRot / dt)));
    gesture.lastDeg = g.deg;
    gesture.lastT = e.timeStamp;
    rot += dRot;
    afterRotChange();
  });

  overlay.addEventListener('pointerup', e => {
    if (!open || !gesture) return;
    guardTap(e);
    const current = gesture;
    gesture = null;
    if (current.zone === 'ring') {
      if (current.timer) clearTimeout(current.timer);
      if (current.moved) { dragging = false; kick(); }
      else if (current.longFired) { /* picker already opened */ }
      else {
        const i = current.startItem;
        if (i >= 0 && items[i]) {
          if (items[i].isSettings) { setOpen(false); openPanel(); }
          else go(items[i].url);
        } else setActive(-1);
      }
    } else {
      setOpen(false);
    }
  });

  overlay.addEventListener('pointercancel', () => {
    if (gesture && gesture.timer) clearTimeout(gesture.timer);
    gesture = null;
    dragging = false;
    setActive(-1);
    if (spinning) kick();
  });

  overlay.addEventListener('contextmenu', e => e.preventDefault());

  // ghost tap guard
  let tapGuardUntil = 0;
  function guardTap(e) { if (!e || e.pointerType !== 'mouse') tapGuardUntil = performance.now() + 500; }
  const ownUi = el => !!el && (root.contains(el) || overlay.contains(el) || picker.contains(el) || pbg.contains(el));
  window.addEventListener('click', e => {
    if (performance.now() > tapGuardUntil || ownUi(e.target)) return;
    tapGuardUntil = 0;
    e.preventDefault();
    e.stopImmediatePropagation();
  }, true);

  // our UI touch events are ours alone
  ['touchstart', 'touchmove', 'touchend', 'touchcancel'].forEach(type => window.addEventListener(type, e => {
    if (pcMode || !ownUi(e.target)) return;
    if (type === 'touchend' && e.cancelable && !root.contains(e.target)) e.preventDefault();
    e.stopImmediatePropagation();
  }, { capture: true, passive: false }));
  ['pointerdown', 'pointermove', 'pointerup', 'pointercancel'].forEach(type =>
    [overlay, pbg, root].forEach(el => el.addEventListener(type, e => { if (e.pointerType !== 'mouse' && !pcMode) e.stopPropagation(); })));

  // ---------- open / close ----------
  let wheelScale = 1;
  function fitWheel() {
    const margin = 6;
    const availH = window.innerHeight - margin;
    const availW = window.innerWidth - margin;
    const s = Math.min(1, availH / (SIZE + 50), availW / (SIZE + 4));
    wheelScale = Math.max(0.5, s);
    wheel.style.transform = wheelScale < 0.999 ? `scale(${wheelScale.toFixed(3)})` : '';
  }

  function setOpen(state) {
    open = state;
    clearTimeout(backdropT);
    if (open) overlay.classList.remove('leaving');
    overlay.classList.toggle('show', open || overlay.classList.contains('show'));
    clearTimeout(settleT);
    wheel.classList.remove('settled');

    if (open) {
      clearSelection();
      fitWheel();
      rebuild();
      prepEntrance();
      clearTimeout(closeT);
      wheel.classList.remove('closing');
      wheel.classList.add('open');
      settleT = setTimeout(() => wheel.classList.add('settled'), 720);
    } else {
      wheel.classList.remove('open');
      wheel.classList.add('closing');
      overlay.classList.add('leaving');
      clearTimeout(closeT);
      const fold = animLevel === 'ultra' ? 0 : animLevel === 'perf' ? 150 : 210;
      closeT = setTimeout(() => wheel.classList.remove('closing'), fold + 50);
      backdropT = setTimeout(() => overlay.classList.remove('show', 'leaving'), fold);
      setActive(-1);
      dragging = false;
      spinning = false;
      vel = 0;
      gesture = null;
      rot = n ? mod(Math.round(rot), n) : 0;
      render();
      updateFeatured();
      refreshLabel(false);
      if (pendingRebuild) { pendingRebuild = false; rebuild(); }
    }
  }

  function go(url) {
    setOpen(false);
    window.location.assign(url);
  }

  // ---------- settings panel ----------
  function openPanel() {
    renderBmList();
    renderTheme();
    renderAnim();
    panel.classList.add('show');
    pbg.classList.add('show');
  }
  function closePanel() {
    panel.classList.remove('show');
    pbg.classList.remove('show');
  }

  function renderBmList() {
    bmList.innerHTML = bookmarks.map((bm, i) => {
      const ico = bookmarkIconSmall(bm);
      return `<div class="qb-bm-item" data-i="${i}">
        <span class="qb-bm-ico">${ico}</span>
        <span class="qb-bm-label">${bm.label}</span>
        ${svg(ICONS.edit).replace('<svg', '<svg class="qb-bm-edit"')}
        <button type="button" class="qb-bm-del" data-i="${i}" aria-label="Remove bookmark">${svg(ICONS.trash)}</button>
      </div>`;
    }).join('');
  }

  bmList.addEventListener('click', e => {
    const delBtn = e.target.closest('.qb-bm-del');
    if (delBtn) {
      e.stopPropagation();
      const i = parseInt(delBtn.dataset.i, 10);
      if (i >= 0 && i < bookmarks.length) {
        haptic(15);
        bookmarks.splice(i, 1);
        saveBookmarks();
        rebuild();
        renderBmList();
      }
      return;
    }
    const b = e.target.closest('.qb-bm-item');
    if (!b) return;
    const i = parseInt(b.dataset.i, 10);
    if (i >= 0 && i < bookmarks.length) openPicker(i);
  });

  bmAddBtn.addEventListener('click', () => { haptic(10); openPicker(-1); });

  function renderTheme() {
    tgrid.innerHTML = THEMES.map(t =>
      `<button type="button" data-theme="${t.id}" class="${t.id === themeId ? 'on' : ''}">` +
      `<i class="qb-tsw" style="--sw1:${t.a1};--sw2:${t.a2}"></i>${t.name}</button>`).join('');
  }
  tgrid.addEventListener('click', e => {
    const b = e.target.closest('[data-theme]');
    if (!b) return;
    haptic(8);
    applyTheme(b.dataset.theme);
    try { localStorage.setItem(THEME_KEY, themeId); } catch (_) {}
    renderTheme();
  });

  function renderAnim() {
    alist.innerHTML = ANIM_LEVELS.map(l =>
      `<button type="button" data-anim="${l.id}" class="${l.id === animLevel ? 'on' : ''}">` +
      `<b>${l.name}${!animChosen && l.id === animLevel ? ' <i>· auto</i>' : ''}</b><span>${l.note}</span></button>`).join('');
  }
  alist.addEventListener('click', e => {
    const b = e.target.closest('[data-anim]');
    if (!b) return;
    haptic(8);
    animLevel = animChosen = b.dataset.anim;
    try { localStorage.setItem(ANIM_KEY, animLevel); } catch (_) {}
    applyAnim();
    renderAnim();
  });

  // ---------- picker ----------
  function updatePickerPreview() {
    const label = pkLabelInput.value.trim() || '?';
    const url = pkUrlInput.value.trim();
    ppLabel.textContent = label;
    if (url) {
      try {
        const u = new URL(url);
        ppIco.innerHTML = `<img src="https://www.google.com/s2/favicons?domain=${u.hostname}&sz=64" alt="" style="width:20px;height:20px;border-radius:3px;object-fit:contain">`;
      } catch (_) {
        ppIco.innerHTML = `<span class="qb-pp-letter">${label[0].toUpperCase()}</span>`;
      }
    } else {
      ppIco.innerHTML = `<span class="qb-pp-letter">${label[0].toUpperCase()}</span>`;
    }
    pkPreview.style.display = 'flex';
  }

  function openPicker(idx) {
    editingIdx = idx;
    closePanel();
    if (idx >= 0 && bookmarks[idx]) {
      pkTitle.textContent = 'Edit bookmark';
      pkLabelInput.value = bookmarks[idx].label || '';
      pkUrlInput.value = bookmarks[idx].url || '';
      pkRemoveBtn.style.display = '';
      pkSaveNewBtn.style.display = 'none'; // no "save & new" when editing
      pkSaveBtn.textContent = 'Save & Close';
    } else {
      pkTitle.textContent = 'Add bookmark';
      pkLabelInput.value = '';
      pkUrlInput.value = '';
      pkRemoveBtn.style.display = 'none';
      pkSaveNewBtn.style.display = ''; // show "save & new" when adding
      pkSaveBtn.textContent = 'Save & Close';
    }
    updatePickerPreview();
    picker.classList.add('show');
    pbg.classList.add('show');
    setTimeout(() => pkLabelInput.focus(), 60);
  }

  function closePicker() {
    picker.classList.remove('show');
    pbg.classList.remove('show');
    editingIdx = -1;
  }

  pkLabelInput.addEventListener('input', updatePickerPreview);
  pkUrlInput.addEventListener('input', updatePickerPreview);

  // Enter in Label field moves to URL; Enter in URL field saves
  pkLabelInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); pkUrlInput.focus(); }
  });
  pkUrlInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      // When adding, Enter = Save & New; when editing, Enter = Save & Close
      if (editingIdx < 0) { if (saveBookmark()) { editingIdx = -1; pkTitle.textContent = 'Add another bookmark'; pkLabelInput.value = ''; pkUrlInput.value = ''; pkRemoveBtn.style.display = 'none'; updatePickerPreview(); pkLabelInput.focus(); } }
      else { if (saveBookmark()) closePicker(); }
    }
  });

  pkCancelBtn.addEventListener('click', closePicker);

  // Shared save logic. Returns true on success.
  function saveBookmark() {
    const label = pkLabelInput.value.trim();
    let url = pkUrlInput.value.trim();
    if (!label) { pkLabelInput.focus(); return false; }
    if (!url) { pkUrlInput.focus(); return false; }
    // ensure URL has a protocol
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
    try { new URL(url); } catch (_) { pkUrlInput.focus(); return false; }

    haptic(15);
    if (editingIdx >= 0 && bookmarks[editingIdx]) {
      bookmarks[editingIdx] = { ...bookmarks[editingIdx], label, url };
    } else {
      bookmarks.push({ id: 'bm-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6), label, url });
    }
    saveBookmarks();
    rebuild();
    renderBmList();
    return true;
  }

  // Save & Close
  pkSaveBtn.addEventListener('click', () => {
    if (saveBookmark()) closePicker();
  });

  // Save & New: save the current bookmark, then clear the form to add another
  pkSaveNewBtn.addEventListener('click', () => {
    if (!saveBookmark()) return;
    // Reset to "add another" mode
    editingIdx = -1;
    pkTitle.textContent = 'Add another bookmark';
    pkLabelInput.value = '';
    pkUrlInput.value = '';
    pkRemoveBtn.style.display = 'none';
    updatePickerPreview();
    pkLabelInput.focus();
  });

  pkRemoveBtn.addEventListener('click', () => {
    if (editingIdx < 0) return;
    haptic(15);
    bookmarks.splice(editingIdx, 1);
    saveBookmarks();
    rebuild();
    renderBmList();
    closePicker();
  });

  pbg.addEventListener('pointerdown', e => { guardTap(e); closePanel(); closePicker(); });

  // Esc closes whatever is open
  window.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if (picker.classList.contains('show')) closePicker();
    else if (panel.classList.contains('show')) closePanel();
    else if (open) setOpen(false);
    else if (pcOpen) pcClose();
    else return;
    e.preventDefault();
    e.stopPropagation();
  }, true);

  // ---------- desktop compass wheel ----------
  let pcOpen = false;
  let pcHow = null;
  let pcOX = 0, pcOY = 0;
  let pcPressX = 0, pcPressY = 0, pcPressAt = 0, pcMoved = false;
  let pcHoldBtn = 1;
  let pcHover = null;
  let pcSwallowClick = 0;
  let mouseX = -1, mouseY = -1;
  let pcN = 0, pcCanSpin = false, pcVis = 0, pcStep = 0;
  let pcRot = 0, pcRotTarget = 0, pcRaf = 0, pcLast = 0, pcWheelAcc = 0;
  let pcLinkEls = [];
  let pcSettingsEl = null;
  const PC_R_MID = (PC_R_IN + PC_R_OUT) / 2;
  const PC_TAP_MS = 300;
  const PC_MOVE_PX = 10;
  const PC_KEY_DELAY = 170;
  const PCKEYS_KEY = 'qbWheel_pcKeys_v1';
  let pcKeysOn = true;
  try { pcKeysOn = localStorage.getItem(PCKEYS_KEY) !== 'false'; } catch (_) {}

  function pcBuild() {
    const bmCount = bookmarks.length;
    pcN = bmCount;
    const bmSpan = PC_BOOKMARK_SPAN;
    pcCanSpin = pcN > PC_VISIBLE;
    pcVis = pcCanSpin ? PC_VISIBLE : pcN;
    pcStep = pcCanSpin ? bmSpan / PC_VISIBLE : (pcN ? bmSpan / pcN : bmSpan);
    if (!pcCanSpin) pcRot = pcRotTarget = 0;

    // bloom delay by angle
    const bd = a => `--d:${Math.round(((a - 70 + 720) % 360) / 360 * 150)}ms`;
    let g = '', ic = '';

    // Settings wedge at top
    const sA1 = PC_SETTINGS_CENTER - PC_SETTINGS_SPAN / 2 + PC_WGAP / 2;
    const sA2 = PC_SETTINGS_CENTER + PC_SETTINGS_SPAN / 2 - PC_WGAP / 2;
    g += `<g class="qb-pcg settings" style="${bd(PC_SETTINGS_CENTER)}"><path class="qb-pcw" d="${pcArc(sA1, sA2)}"/></g>`;
    const [sx, sy] = pcPolar(PC_R_MID, PC_SETTINGS_CENTER);
    ic += `<div class="qb-pci settings" style="left:${sx.toFixed(1)}px;top:${sy.toFixed(1)}px;${bd(PC_SETTINGS_CENTER)}">${svg(ICONS.gear)}</div>`;

    // bookmark wedges
    if (pcN > 0) {
      const d = pcArc(PC_BOOKMARK_START + PC_WGAP / 2, PC_BOOKMARK_START + pcStep - PC_WGAP / 2);
      for (let i = 0; i < pcN; i++) {
        const a = PC_BOOKMARK_START + Math.min(i, PC_VISIBLE) * pcStep;
        g += `<g class="qb-pcg" style="${bd(a)}"><path class="qb-pcw" d="${d}"/></g>`;
      }
      // bookmark icons
      for (let i = 0; i < pcN; i++) {
        const a = PC_BOOKMARK_START + Math.min(i, PC_VISIBLE) * pcStep;
        // icons will be positioned in pcRenderLinks
        ic += `<div class="qb-pci" style="${bd(a)}">${bookmarkIcon(bookmarks[i])}</div>`;
      }
    }

    pcSegsG.innerHTML = g;
    pcIcons.innerHTML = ic;

    // collect refs
    const allGs = [...pcSegsG.children];
    const allIcs = [...pcIcons.querySelectorAll('.qb-pci')];
    pcSettingsEl = { g: allGs[0], ico: allIcs[0] };
    pcLinkEls = [];
    for (let i = 0; i < pcN; i++) {
      pcLinkEls.push({ g: allGs[1 + i], ico: allIcs[1 + i] });
    }
    pcRenderLinks();
  }

  function pcSlotPos(i) {
    return pcCanSpin ? mod(i - pcRot + 0.5, pcN) - 0.5 : i;
  }

  function pcRenderLinks() {
    for (let i = 0; i < pcN; i++) {
      const p = pcSlotPos(i);
      const e = Math.max(-p, p + 1 - pcVis, 0);
      const v = Math.max(0, 1 - e * 1.25);
      const { g, ico } = pcLinkEls[i];
      if (v <= 0.01) { g.style.display = 'none'; ico.style.display = 'none'; continue; }
      g.style.display = '';
      ico.style.display = '';
      g.setAttribute('transform', `rotate(${(-p * pcStep).toFixed(2)} ${PC_C} ${PC_C})`);
      g.style.opacity = v.toFixed(3);
      const a = PC_BOOKMARK_START + (p + 0.5) * pcStep;
      const [x, y] = pcPolar(PC_R_MID, a);
      ico.style.left = x.toFixed(1) + 'px';
      ico.style.top = y.toFixed(1) + 'px';
      ico.style.opacity = v.toFixed(3);
    }
  }

  function pcHitAt(x, y, sticky) {
    const dx = x - pcOX, dy = pcOY - y;
    const dist = Math.hypot(dx, dy);
    if (dist < PC_R_IN * .6 || (sticky && dist > PC_R_OUT + 50)) return null;
    let a = (Math.atan2(dy, dx) * 180) / Math.PI;
    if (a < 0) a += 360;
    // Settings zone
    const sHalf = PC_SETTINGS_SPAN / 2;
    let sCenter = PC_SETTINGS_CENTER;
    let da = ((a - sCenter) % 360 + 540) % 360 - 180;
    if (Math.abs(da) <= sHalf) return { zone: 'settings', idx: 0 };
    // Bookmark zone
    if (!pcN) return null;
    let daBm = ((a - PC_BOOKMARK_START) % 360 + 360) % 360;
    const pos = Math.min(Math.max(daBm / pcStep, 0), PC_BOOKMARK_SPAN / pcStep - 0.001);
    const k = Math.min(Math.floor(pos), pcVis - 1);
    return { zone: 'bookmark', idx: pcCanSpin ? mod(k + Math.round(pcRot), pcN) : Math.min(k, pcN - 1) };
  }

  const pcEl = h => h && (h.zone === 'bookmark' ? pcLinkEls[h.idx] : (h.zone === 'settings' ? pcSettingsEl : null));

  function pcLabelFor(h) {
    if (!h) return null;
    if (h.zone === 'settings') return 'Settings';
    if (h.zone === 'bookmark') return bookmarks[h.idx] && bookmarks[h.idx].label;
    return null;
  }

  function pcSetHover(h) {
    const same = h && pcHover && h.zone === pcHover.zone && h.idx === pcHover.idx;
    if (!same) {
      const old = pcEl(pcHover), now = pcEl(h);
      if (old) { old.g.classList.remove('on'); old.ico.classList.remove('on'); }
      if (now) { now.g.classList.add('on'); now.ico.classList.add('on'); }
      pcHover = h;
    }
    const text = pcLabelFor(h);
    if (text && pcLabel.textContent !== text) pcLabel.textContent = text;
    pcLabel.classList.toggle('hide', !text);
  }

  function pcUpdateHover() {
    if (!pcOpen) return;
    if (Math.hypot(mouseX - pcPressX, mouseY - pcPressY) > PC_MOVE_PX) pcMoved = true;
    pcSetHover(pcHow === 'sticky' || pcMoved ? pcHitAt(mouseX, mouseY, pcHow === 'sticky') : null);
  }

  function pcOpenAt(x, y, how) {
    const m = PC_R_OUT + 16;
    pcOX = window.innerWidth > m * 2 ? Math.min(Math.max(x, m), window.innerWidth - m) : window.innerWidth / 2;
    pcOY = window.innerHeight > m * 2 ? Math.min(Math.max(y, m), window.innerHeight - m) : window.innerHeight / 2;
    pcPressX = x; pcPressY = y; pcPressAt = performance.now(); pcMoved = false;
    pcHow = how;
    pcRoot.classList.toggle('grab', how !== 'keys');
    pcBuild();
    pcWheel.style.left = (pcOX - PC_C) + 'px';
    pcWheel.style.top = (pcOY - PC_C) + 'px';
    pcRoot.style.setProperty('--qb-x', pcOX + 'px');
    pcRoot.style.setProperty('--qb-y', pcOY + 'px');
    pcHover = null;
    pcOpen = true;
    pcRoot.classList.add('open');
    markHintSeen();
    pcSetHover(null);
    pcUpdateHover();
  }

  function pcClose(letClickThrough) {
    if (!pcOpen) return;
    pcOpen = false;
    pcHow = null;
    pcSetHover(null);
    pcRoot.classList.remove('open', 'grab');
    pcSwallowClick = letClickThrough ? 0 : performance.now() + 400;
  }

  function pcRelease() {
    const h = pcMoved ? pcHitAt(mouseX, mouseY, false) : null;
    const quick = !pcMoved && performance.now() - pcPressAt < PC_TAP_MS;
    if (h) pcActivate(h, false);
    else if (quick && pcHow !== 'keys') {
      pcHow = 'sticky';
      pcRoot.classList.add('grab');
      pcUpdateHover();
    } else pcClose();
  }

  function pcActivate(h, newTab) {
    if (h.zone === 'settings') { pcClose(); openPanel(); return; }
    const bm = bookmarks[h.idx];
    if (!bm) { pcClose(); return; }
    pcClose();
    if (newTab) window.open(bm.url, '_blank', 'noopener');
    else window.location.assign(bm.url);
  }

  function pcSpinLoop(t) {
    pcRaf = 0;
    const dt = Math.min(48, Math.max(1, t - pcLast));
    pcLast = t;
    const diff = pcRotTarget - pcRot;
    if (Math.abs(diff) < 0.002) pcRot = pcRotTarget;
    else pcRot += diff * (1 - Math.pow(1e-7, dt / 1000));
    pcRenderLinks();
    pcUpdateHover();
    if (pcRot !== pcRotTarget) pcRaf = requestAnimationFrame(pcSpinLoop);
    else if (Math.abs(pcRot) > pcN * 50) pcRot = pcRotTarget = mod(pcRot, pcN);
  }
  function pcSpin(steps) {
    if (!pcCanSpin || !steps) return;
    pcRotTarget += steps;
    if (!pcRaf) { pcLast = performance.now(); pcRaf = requestAnimationFrame(pcSpinLoop); }
  }

  // desktop: keyboard + mouse triggers
  const typingIn = el => !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
  let mouseSeen = false;
  window.addEventListener('pointermove', e => {
    if (e.pointerType === 'mouse') mouseSeen = true;
    mouseX = e.clientX; mouseY = e.clientY;
    if (pcOpen) pcUpdateHover();
  }, { capture: true, passive: true });

  const overlayUp = () => panel.classList.contains('show') || picker.classList.contains('show');

  // middle-click to open
  window.addEventListener('mousedown', e => {
    if (!pcMode) return;
    if (pcOpen && pcHow === 'keys') { pcClose(true); return; }
    if (pcOpen) {
      e.preventDefault(); e.stopPropagation();
      if (pcHow === 'sticky' && (e.button === 0 || e.button === 1)) {
        const h = pcHitAt(e.clientX, e.clientY, true);
        if (h) pcActivate(h, e.button === 1);
        else pcClose();
      }
      return;
    }
    if (overlayUp()) return;
    if (e.button !== 1) return;
    const t = e.target;
    const near = sel => t && t.closest && t.closest(sel);
    if (near('a[href], input, textarea, select, [contenteditable], #qb-root, #qb-pbg, #qb-hint')) return;
    e.preventDefault();
    pcOpenAt(e.clientX, e.clientY, 'mouse');
    pcHoldBtn = 1;
  }, true);

  window.addEventListener('mouseup', e => {
    if (!pcOpen) return;
    mouseX = e.clientX; mouseY = e.clientY;
    if (pcHow === 'mouse' && e.button === pcHoldBtn) {
      e.preventDefault();
      pcRelease();
    }
  }, true);

  ['click', 'auxclick'].forEach(type => window.addEventListener(type, e => {
    if (pcOpen || performance.now() < pcSwallowClick) {
      if (e.target && e.target.closest && e.target.closest('#qb-root, #qb-pbg')) return;
      e.preventDefault();
      e.stopPropagation();
    }
  }, true));

  // right-click to edit a bookmark on the desktop wheel
  window.addEventListener('contextmenu', e => {
    if (!pcOpen) return;
    e.preventDefault();
    e.stopPropagation();
    const h = pcHitAt(e.clientX, e.clientY, true);
    if (h && h.zone === 'bookmark') { pcClose(); openPicker(h.idx); }
  }, true);

  // scroll to spin
  window.addEventListener('wheel', e => {
    if (!pcOpen) return;
    e.preventDefault();
    const d = e.deltaY * (e.deltaMode === 1 ? 40 : e.deltaMode === 2 ? 400 : 1);
    if (Math.abs(d) >= 50) { pcWheelAcc = 0; pcSpin(Math.sign(d)); return; }
    pcWheelAcc += d;
    const steps = Math.trunc(pcWheelAcc / 50);
    if (steps) { pcWheelAcc -= steps * 50; pcSpin(steps); }
  }, { capture: true, passive: false });

  // Ctrl+Shift
  let keyArm = null;
  window.addEventListener('keydown', e => {
    if (!pcMode) return;
    if (e.key === 'Escape' && pcOpen) { e.preventDefault(); e.stopPropagation(); pcClose(); return; }
    const isMod = e.key === 'Control' || e.key === 'Shift';
    if (isMod) {
      if (!pcKeysOn) return;
      if (!e.ctrlKey || !e.shiftKey || e.altKey || e.metaKey || e.repeat || keyArm) return;
      if (typingIn(document.activeElement) || overlayUp()) return;
      if (pcOpen) { pcClose(); return; }
      keyArm = { at: performance.now(), opened: false };
      keyArm.timer = setTimeout(() => {
        if (!keyArm || pcOpen) return;
        keyArm.opened = true;
        pcOpenAt(mouseX, mouseY, 'keys');
        pcPressAt = keyArm.at;
      }, PC_KEY_DELAY);
      return;
    }
    if (keyArm) {
      clearTimeout(keyArm.timer);
      if (keyArm.opened && pcHow === 'keys') pcClose();
      keyArm = null;
    }
  }, true);

  window.addEventListener('keyup', e => {
    if (!keyArm || (e.key !== 'Control' && e.key !== 'Shift')) return;
    const arm = keyArm;
    keyArm = null;
    clearTimeout(arm.timer);
    if (!arm.opened) pcOpenAt(mouseX, mouseY, 'sticky');
    else if (pcOpen && pcHow === 'keys') pcRelease();
  }, true);

  window.addEventListener('blur', () => {
    if (keyArm) { clearTimeout(keyArm.timer); keyArm = null; }
    if (pcOpen && pcHow !== 'sticky') pcClose();
  });

  // ---------- mobile: right-edge swipe to open ----------
  let edgeSwipe = null;
  document.addEventListener('touchstart', e => {
    if (pcMode || !e.touches || e.touches.length !== 1) { edgeSwipe = null; return; }
    const t = e.touches[0];
    const own = e.target && e.target.closest && e.target.closest('#qb-root, #qb-overlay, #qb-picker, #qb-pbg');
    if (t.clientX > window.innerWidth - 28 && !own) {
      const tag = e.target.tagName;
      if (!/INPUT|TEXTAREA|SELECT/.test(tag) && !e.target.isContentEditable) {
        edgeSwipe = { x: t.clientX, y: t.clientY, t: Date.now() };
      }
    } else edgeSwipe = null;
  }, { capture: true, passive: true });

  document.addEventListener('touchmove', e => {
    if (pcMode || !edgeSwipe || !e.touches || e.touches.length !== 1) return;
    const t = e.touches[0];
    const dx = t.clientX - edgeSwipe.x;
    const dy = t.clientY - edgeSwipe.y;
    if (dx < -24 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      // swipe detected — open the wheel
      setOpen(true);
      markHintSeen();
      edgeSwipe = null;
    }
  }, { capture: true, passive: true });

  ['touchend', 'touchcancel'].forEach(type => document.addEventListener(type, () => { edgeSwipe = null; }, { capture: true, passive: true }));

  // ---------- mode ----------
  function applyMode() {
    if (pcMode) {
      if (open) setOpen(false);
      closePanel();
      closePicker();
    } else {
      pcClose();
      if (keyArm) { clearTimeout(keyArm.timer); keyArm = null; }
      closePanel();
      closePicker();
    }
    maybeShowHint();
  }

  // ---------- first-run hint ----------
  let hintSeen = false;
  try { hintSeen = localStorage.getItem(HINT_KEY) === 'true'; } catch (_) {}
  function markHintSeen() {
    if (hintSeen) return;
    hintSeen = true;
    try { localStorage.setItem(HINT_KEY, 'true'); } catch (_) {}
    hint.classList.remove('show');
  }
  function maybeShowHint() {
    if (hintSeen) return;
    const msg = pcMode
      ? 'Hold Ctrl+Shift, or middle-click an empty spot. Aim at a bookmark and release. Right-click a bookmark to edit it.'
      : 'Swipe inward from the right edge of the screen. Long-press any bookmark to edit it.';
    hint.innerHTML = `<b>Quick Bookmark Wheel</b><div>${msg}</div><button type="button">Got it</button>`;
    hint.querySelector('button').addEventListener('click', markHintSeen);
    setTimeout(() => { if (!hintSeen) hint.classList.add('show'); }, 800);
  }

  // ---------- halt spin on page hide ----------
  function haltSpin() {
    if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
    if (gesture && gesture.timer) clearTimeout(gesture.timer);
    gesture = null;
    vel = 0;
    dragging = false;
    spinning = false;
    rot = n ? mod(Math.round(rot), n) : 0;
    if (!Number.isFinite(rot)) rot = 0;
    render();
    updateFeatured();
    refreshLabel(false);
  }
  document.addEventListener('visibilitychange', () => { if (document.hidden) haltSpin(); });
  window.addEventListener('pagehide', haltSpin);
  window.addEventListener('pageshow', e => { if (e.persisted) haltSpin(); });

  // ---------- storage sync (cross-tab) ----------
  window.addEventListener('storage', e => {
    if (!e.key || e.key.indexOf('qbWheel_') !== 0) return;
    if (e.key === BM_KEY) {
      try {
        const c = JSON.parse(localStorage.getItem(BM_KEY) || 'null');
        if (Array.isArray(c)) { bookmarks = c; rebuild(); if (panel.classList.contains('show')) renderBmList(); }
      } catch (_) {}
    } else if (e.key === THEME_KEY) {
      applyTheme(localStorage.getItem(THEME_KEY) || 'green');
      renderTheme();
    } else if (e.key === ANIM_KEY) {
      const v = localStorage.getItem(ANIM_KEY);
      animChosen = ANIM_LEVELS.some(l => l.id === v) ? v : null;
      animLevel = animChosen || autoAnim();
      applyAnim();
      renderAnim();
    }
  });

  // ---------- init ----------
  rebuild();
  applyMode();
  maybeShowHint();
  window.addEventListener('resize', () => { if (open) fitWheel(); });

})();
