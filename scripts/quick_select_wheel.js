// ==UserScript==
// @name         Torn Quick Select Wheel
// @namespace    torn-quick-select-wheel
// @version      2.2.8
// @description  A faster way around Torn, on mobile and on PC.
// @match        https://www.torn.com/*
// @run-at       document-start
// @noframes
// @grant        none
// @license      MIT
// @downloadURL https://update.greasyfork.org/scripts/601313/Torn%20Quick%20Select%20Wheel.user.js
// @updateURL https://update.greasyfork.org/scripts/601313/Torn%20Quick%20Select%20Wheel.meta.js
// ==/UserScript==

(function () {
  'use strict';

  if (window.__qsWheelLoaded) return;
  window.__qsWheelLoaded = true;

  // Loaded at document-start on touch devices: keep Torn's menu button and left-edge swipe dead
  // until the wheel is up, so the fly-out can't be opened (and then hidden open) mid-load.
  let mainUp = false;
  const lateStart = document.readyState !== 'loading'; // injected after the page loaded (PDA on "End")
  const earlyTouch = !(window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches);
  let earlyStyle = null;
  if (earlyTouch && document.readyState === 'loading') {
    earlyStyle = document.createElement('style');
    earlyStyle.textContent = '#fly-out-menu-button, button[aria-controls="fly-out-panel"] { visibility: hidden !important; pointer-events: none !important; }';
    const host = document.head || document.documentElement;
    if (host) host.appendChild(earlyStyle);
    else new MutationObserver((_, o) => {
      if (!document.documentElement) return;
      o.disconnect();
      if (!mainUp) document.documentElement.appendChild(earlyStyle);
    }).observe(document, { childList: true });
    let ex = null;
    document.addEventListener('touchstart', e => {
      ex = !mainUp && e.touches && e.touches.length === 1 && e.touches[0].clientX <= 24 ? e.touches[0].clientX : null;
    }, { capture: true, passive: true });
    document.addEventListener('touchmove', e => {
      if (mainUp || ex == null || !e.touches || !e.touches[0]) return;
      if (e.touches[0].clientX - ex > 8 && e.cancelable) e.preventDefault();
    }, { capture: true, passive: false });
  }

  // Torn opens its fly-out on a rightward swipe from anywhere on the page. On mobile the wheel
  // replaces it, so Torn's code never sees a rightward swipe. Propagation only, no preventDefault:
  // native scrolling is untouched. Sliders, carousels, fields and our own UI are left alone.
  let swipeGuard = earlyTouch; // main keeps this in step: off on PC and when logged out
  const SWIPE_SKIP = 'input, textarea, select, [contenteditable], [role="slider"], canvas, ' +
    '[class*="swiper" i], [class*="slider" i], [class*="carousel" i], [id^="qsw-"]';
  let sw = null;
  const swStart = (x, y, target) => {
    sw = null;
    if (!swipeGuard || (target && target.closest && target.closest(SWIPE_SKIP))) return;
    sw = { y0: y, minX: x, block: false };
  };
  // Watched for the whole gesture, not just its start: any return to the right (a C or U shape
  // that starts leftward) counts, measured from the furthest-left point. Mostly-vertical scrolls pass.
  const swMove = (x, y, e) => {
    if (!sw) return;
    if (x < sw.minX) sw.minX = x;
    if (!sw.block) {
      const right = x - sw.minX;
      if (right > 12 && right * 3 > Math.abs(y - sw.y0)) sw.block = true;
    }
    if (sw.block) e.stopImmediatePropagation();
  };
  const swEnd = e => { if (sw && sw.block) e.stopImmediatePropagation(); };
  const capP = { capture: true, passive: true };
  window.addEventListener('touchstart', e => {
    if (e.touches.length === 1) swStart(e.touches[0].clientX, e.touches[0].clientY, e.target); else sw = null;
  }, capP);
  window.addEventListener('touchmove', e => { if (e.touches[0]) swMove(e.touches[0].clientX, e.touches[0].clientY, e); }, capP);
  window.addEventListener('touchend', e => { swEnd(e); if (!e.touches.length) sw = null; }, capP);
  window.addEventListener('touchcancel', e => { swEnd(e); sw = null; }, capP);
  window.addEventListener('pointerdown', e => { if (e.pointerType === 'touch' && e.isPrimary) swStart(e.clientX, e.clientY, e.target); }, capP);
  window.addEventListener('pointermove', e => { if (e.pointerType === 'touch' && e.isPrimary) swMove(e.clientX, e.clientY, e); }, capP);
  window.addEventListener('pointerup', e => { if (e.pointerType === 'touch') swEnd(e); }, capP);
  window.addEventListener('pointercancel', e => { if (e.pointerType === 'touch') swEnd(e); }, capP);

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', main, { once: true });
  else main();

  function main() {

  let offline = false; // logged out / login page (see applyLoggedOut)

  // ---------- config ----------
  const ITEMS_KEY = 'qsWheel_items_v3';
  const LASTSYNC_KEY = 'qsWheel_lastSync_v1';         // last Refresh timestamp
  const LEFT_KEY = 'qsWheel_leftHanded_v1';          // button is on the left edge (wheel mirrored)
  const POS_KEY = 'qsWheel_buttonBottom_v1';         // dragged button height, px from the bottom
  const PINNED_KEY = 'qsWheel_pinned_v1';
  const NOTIFIED_KEY = 'qsWheel_notifiedCounts_v1'; // last badge counts already alerted on
  const CUSTOM_KEY = 'qsWheel_customSlots_v1';       // outer-ring shortcut slots
  const URLFIX_KEY = 'qsWheel_catalogUrlFix_v1';     // user-entered URLs, per catalogue id
  const LONG_PRESS_MS = 600;
  const IDLE_OPACITY = 0.5;
  const OPACITY_KEY = 'qsWheel_buttonOpacity_v1';    // idle button opacity, 0.1–1 (mobile)
  const BOTTOM_OFFSET = 56;
  const RIGHT_OFFSET = 14;
  const VISIBLE = 5;
  const BADGE_POLL_MS = 25000;       // badge / stat-bar poll interval
  // Torn-style green palette
  const ACCENT_1 = '#c6f24a';
  const ACCENT_2 = '#8bc63f';
  const ACCENT_3 = '#355e13';
  const ALERT_COLOR = ACCENT_1;   // unread highlight
  const STAT_FULL_COLOR = '#b6ff3f'; // Gym/Crimes wedge highlight when Energy/Nerve is capped

  // Wheel colours. a1 light, a2 main, a3 dark, stat = the "bar is full" glow. The colour-blind set
  // is the Okabe-Ito palette; its light/dark shades are mixed from the main colour.
  const THEME_KEY = 'qsWheel_theme_v1';
  const mixHex = (hex, to, t) => '#' + [1, 3, 5].map(i => {
    const c = parseInt(hex.substr(i, 2), 16), d = parseInt(to.substr(i, 2), 16);
    return Math.round(c + (d - c) * t).toString(16).padStart(2, '0');
  }).join('');
  const oi = (id, name, a2) => ({ id, name, cb: true, a2, a1: mixHex(a2, '#ffffff', .4), a3: mixHex(a2, '#000000', .65), stat: mixHex(a2, '#ffffff', .22) });
  const THEMES = [
    { id: 'green', name: 'Zesty Lime', a1: ACCENT_1, a2: ACCENT_2, a3: ACCENT_3, stat: STAT_FULL_COLOR },
    { id: 'neon-blue', name: 'Electric Lagoon', a1: '#8ef6ff', a2: '#1fb8ff', a3: '#0a3a5c', stat: '#5ff2ff' },
    { id: 'purple', name: 'Ultraviolet Dream', a1: '#e2b8ff', a2: '#a855f7', a3: '#3b1466', stat: '#d38cff' },
    { id: 'pink', name: 'Barbie Dreamhouse', a1: '#ffa8da', a2: '#e0218a', a3: '#5c0b37', stat: '#ff6ec7' },
    { id: 'orange', name: 'Sunset Spritz', a1: '#ffc996', a2: '#ff8a1f', a3: '#5c2e05', stat: '#ffae52' },
    { id: 'gold', name: 'Honey Glaze', a1: '#ffe98f', a2: '#f2b705', a3: '#574200', stat: '#ffd84d' },
    { id: 'aqua', name: 'Mint Mojito', a1: '#a3ffe8', a2: '#19d3a6', a3: '#0a4a3c', stat: '#5cffd6' },
    { id: 'silver', name: 'Moonlit Pebble', a1: '#ffffff', a2: '#c3cad3', a3: '#3a4048', stat: '#ffffff' },
    // Colour-blind names keep the colour word: the name is how the colour gets picked.
    oi('oi-orange', 'Marmalade Orange', '#e69f00'),
    oi('oi-sky', 'Seaside Sky Blue', '#56b4e9'),
    oi('oi-green', 'Garden Green', '#009e73'),
    oi('oi-yellow', 'Buttercup Yellow', '#f0e442'),
    oi('oi-blue', 'Deep Ocean Blue', '#0072b2'),
    oi('oi-vermillion', 'Paprika Red', '#d55e00'),
    oi('oi-purple', 'Heather Purple', '#cc79a7'),
  ];
  // Colour-blind mode swaps to the nearest Okabe-Ito colour, and back to the last regular one.
  const LAST_REG_KEY = 'qsWheel_themeRegular_v1';
  const TO_CB = { green: 'oi-green', 'neon-blue': 'oi-sky', purple: 'oi-purple', pink: 'oi-purple', orange: 'oi-orange', gold: 'oi-yellow', aqua: 'oi-green', silver: 'oi-sky' };
  const FROM_CB = { 'oi-orange': 'orange', 'oi-sky': 'neon-blue', 'oi-green': 'green', 'oi-yellow': 'gold', 'oi-blue': 'neon-blue', 'oi-vermillion': 'orange', 'oi-purple': 'pink' };
  const rgbOf = hex => [1, 3, 5].map(i => parseInt(hex.substr(i, 2), 16)).join(' ');
  const lum = hex => {
    const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.substr(i, 2), 16) / 255).map(c => c <= .03928 ? c / 12.92 : Math.pow((c + .055) / 1.055, 2.4));
    return .2126 * r + .7152 * g + .0722 * b;
  };
  // Dark or white text, whichever reads better on that colour.
  const inkOn = hex => (lum(hex) + .05) / .056 >= 1.05 / (lum(hex) + .05) ? '#0e1408' : '#ffffff';
  let themeId = 'green';
  try { themeId = localStorage.getItem(THEME_KEY) || 'green'; } catch (_) {}
  function applyTheme(id) {
    const t = THEMES.find(x => x.id === id) || THEMES[0];
    themeId = t.id;
    const st = document.documentElement.style;
    st.setProperty('--qsw-a1', t.a1);
    st.setProperty('--qsw-a2', t.a2);
    st.setProperty('--qsw-a3', t.a3);
    st.setProperty('--qsw-stat', t.stat);
    st.setProperty('--qsw-a1-rgb', rgbOf(t.a1));
    st.setProperty('--qsw-a2-rgb', rgbOf(t.a2));
    st.setProperty('--qsw-stat-rgb', rgbOf(t.stat));
    st.setProperty('--qsw-ink', inkOn(t.a2));
    st.setProperty('--qsw-ink1', inkOn(t.a1));
    return t;
  }
  applyTheme(themeId);

  // Animation level. Blur and glows cost far more than movement on weak phones, so they go first.
  const ANIM_KEY = 'qsWheel_anim_v1';
  const ANIM_LEVELS = [
    { id: 'quality', name: 'Quality', note: 'Full bloom and fold, ripple and glows. For modern phones.' },
    { id: 'balanced', name: 'Balanced', note: 'The ring fans in, a lighter blur, no ripple. For flagships a few years old.' },
    { id: 'perf', name: 'Performance', note: 'A quick fade with no blur or glows. For older or budget phones.' },
    { id: 'ultra', name: 'Ultra Performance', note: 'No animation, blur or glows. For very low-end phones.' },
  ];
  // Memory is the honest signal (even cheap phones have 8 slow cores). Browsers round it down to
  // 0.25/0.5/1/2/4/8 GB; iPhones don't report it, so cores stand in there.
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
    ANIM_LEVELS.forEach(l => cl.toggle('qsw-anim-' + l.id, l.id === animLevel));
  }
  applyAnim();

  // Vibration patterns (ms on/off) per pinned item
  const VIBE_PATTERNS = {
    'nav-messages': [70, 60, 70],
    'nav-events': [140, 70, 140, 70, 140],
    'nav-awards': [50, 50, 50, 50, 220],
  };

  // main ring geometry (px / degrees)
  const R_IN = 64;
  const R_OUT = 170;
  const GAP_DEG = 1.6;
  const STEP_SPIN = 90 / VISIBLE;

  // pinned-band geometry: a second ring outside the main one, split into 3 fixed arcs
  const PIN_GAP = 10;                // gap between the main ring and the pinned band
  const PIN_THICK = 40;              // thickness of the pinned band
  const PIN_R_IN = R_OUT + PIN_GAP;
  const PIN_R_OUT = PIN_R_IN + PIN_THICK;
  const PIN_GAP_DEG = 2.4;
  const PIN_SPAN = 90 / 3;

  // custom band geometry: outermost ring, 5 slots
  const CUST_COUNT = 5;
  const CUST_GAP = 8;
  const CUST_THICK = 38;
  const CUST_R_IN = PIN_R_OUT + CUST_GAP;
  const CUST_R_OUT = CUST_R_IN + CUST_THICK;
  const CUST_GAP_DEG = 2;
  const CUST_SPAN = 90 / CUST_COUNT;

  const SIZE = CUST_R_OUT + 10;

  const mod = (a, b) => ((a % b) + b) % b;
  const haptic = ms => { if (navigator.vibrate) { try { navigator.vibrate(ms); } catch (_) {} } };

  // ---------- left-edge (mirrored) layout ----------
  // The wheel is drawn from one corner point (OX) and touches are turned back into angles
  // from the same point, so mirroring only needs a different origin and x direction (SX).
  let leftHanded = false;
  try { leftHanded = localStorage.getItem(LEFT_KEY) === 'true'; } catch (_) {}
  const OX = () => (leftHanded ? 0 : SIZE);
  const SX = () => (leftHanded ? -1 : 1);

  // ---------- shared geometry helpers ----------
  function polar(r, deg) {
    const rad = (deg * Math.PI) / 180;
    return [OX() + SX() * r * Math.cos(rad), SIZE - r * Math.sin(rad)];
  }

  // annular-sector path between two radii and two angles, used for both rings
  function arcPath(rIn, rOut, a1, a2) {
    const [x1, y1] = polar(rOut, a1);
    const [x2, y2] = polar(rOut, a2);
    const [x3, y3] = polar(rIn, a2);
    const [x4, y4] = polar(rIn, a1);
    // Mirroring reverses the winding, so the arc sweep flags flip too.
    const so = leftHanded ? 1 : 0, si = leftHanded ? 0 : 1;
    return `M${x1} ${y1}A${rOut} ${rOut} 0 0 ${so} ${x2} ${y2}L${x3} ${y3}A${rIn} ${rIn} 0 0 ${si} ${x4} ${y4}Z`;
  }

  // small triangle pointing toward the centre, used as the "featured wedge" marker
  function pointerTriangle(rMid, angle) {
    const apex = polar(rMid - 7, angle);
    const b1 = polar(rMid + 6, angle - 2.2);
    const b2 = polar(rMid + 6, angle + 2.2);
    return `M${apex[0]} ${apex[1]} L${b1[0]} ${b1[1]} L${b2[0]} ${b2[1]} Z`;
  }

  function resolveUrl(href, fallback) {
    try {
      const u = new URL(href, location.href);
      return u.origin === location.origin ? u.pathname + u.search + u.hash : u.href;
    } catch (e) {
      return fallback;
    }
  }

  // ---------- fallback icons (until Torn's own sidebar icon is captured) ----------
  const S = 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';
  const ICONS = {
    gym: `<g ${S}><path d="M3 9v6M6 7v10M18 7v10M21 9v6M6 12h12"/></g>`,
    crimes: `<path fill-rule="evenodd" d="M3 7.5c2.2-1.8 5.2-2.7 9-2.7s6.8.9 9 2.7v3.2c0 3.2-2 5.8-4.6 5.8-1.8 0-2.8-1-3.9-2.3h-1c-1.1 1.3-2.1 2.3-3.9 2.3C5 16.5 3 13.9 3 10.7zM5.5 10.5a2 1.5 0 1 0 4 0a2 1.5 0 1 0-4 0zM14.5 10.5a2 1.5 0 1 0 4 0a2 1.5 0 1 0-4 0z"/>`,
    oc: `<g ${S}><circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><path d="M12 1.5v4M12 18.5v4M1.5 12h4M18.5 12h4"/></g><circle cx="12" cy="12" r="1.4"/>`,
    faction: `<path d="M12 2.5L4.5 5.5v5.6c0 4.7 3.2 8.7 7.5 10 4.3-1.3 7.5-5.3 7.5-10V5.5z"/>`,
    travel: `<path d="M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5z"/>`,
    messages: `<g ${S}><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/></g>`,
    events: `<g ${S}><circle cx="12" cy="12" r="9"/></g><rect x="11" y="6.3" width="2" height="7.4" rx="1"/><circle cx="12" cy="16.7" r="1.15"/>`,
    awards: `<g ${S}><circle cx="12" cy="14.5" r="5.3"/><path d="M9.3 9.8L7 3M14.7 9.8L17 3M9.6 14l2.4 1.6 2.4-1.6"/></g>`,
  };
  const MAIN_ICONS = {
    close: `<g ${S}><path d="M5 5l14 14M19 5L5 19"/></g>`,
  };
  function svg(inner) {
    return `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">${inner}</svg>`;
  }

  const DEFAULT_ITEMS = [
    { key: 'd-gym', label: 'Gym', url: '/gym.php', svg: svg(ICONS.gym) },
    { key: 'd-crimes', label: 'Crimes', url: '/page.php?sid=crimes', svg: svg(ICONS.crimes) },
    { key: 'd-oc', label: 'OC', url: '/factions.php?step=your#/tab=crimes', svg: svg(ICONS.oc) },
    { key: 'd-faction', label: 'Faction', url: '/factions.php?step=your', svg: svg(ICONS.faction) },
    { key: 'd-travel', label: 'Travel', url: '/page.php?sid=travel', svg: svg(ICONS.travel) },
  ];

  // ---------- shortcut catalogue (outer ring) ----------
  // Line icons traced from Torn's own artwork.
  const CAT_ICONS = {
    plus: `<g ${S}><path d="M12 5v14M5 12h14"/></g>`,
    city: `<g ${S}><g stroke-width="1.0667" transform="translate(12 12) scale(1.125) translate(-5.335 -8.9999)"><path d="M5.33,1A5.3,5.3,0,0,0,0,6.07C0,8.87,2.31,12.21,5.33,17c3-4.79,5.34-8.13,5.34-10.93A5.31,5.31,0,0,0,5.33,1m0,7.33a2,2,0,1,1,2-2,2,2,0,0,1-2,2"/></g></g>`,
    profile: `<g ${S}><g stroke-width="1.0667" transform="translate(12 12) scale(1.125) translate(-8 -8)"><path d="M13.88,12.06c-2.29-.52-4.43-1-3.39-2.94C13.63,3.18,11.32,0,8,0S2.36,3.3,5.51,9.12c1.07,2-1.15,2.43-3.39,2.94C.13,12.52,0,13.49,0,15.17V16H16v-.83C16,13.49,15.87,12.52,13.88,12.06Z"/></g></g>`,
    forums: `<g ${S}><g stroke-width="1.0667" transform="translate(12 12) scale(1.125) translate(-8 -8.335)"><path d="M13.08,14.74c-3.36.82-5.81-1.24-5.81-3.44s2.08-3.65,4.37-3.65S16,9.19,16,11.3a3.24,3.24,0,0,1-.74,2A5.81,5.81,0,0,0,16,15.67,10.19,10.19,0,0,1,13.08,14.74ZM5.94,11.3c0-2.75,2.55-5,5.7-5a6.21,6.21,0,0,1,1.69.23C13.32,3.32,10.16,1,6.67,1S0,3.35,0,6.57A4.9,4.9,0,0,0,1.14,9.7,8.71,8.71,0,0,1,0,13.24a16,16,0,0,0,4.43-1.41A9.91,9.91,0,0,0,6,12.07,4.9,4.9,0,0,1,5.94,11.3Z"/></g></g>`,
    gym: `<g ${S}><g stroke-width="1.3333" transform="translate(12 12) scale(0.9) translate(-153 -50.9998)"><path d="M156.583 54.1173V47.8843C156.583 47.6434 156.63 47.4049 156.722 47.1823C156.814 46.9597 156.95 46.7575 157.12 46.5872C157.29 46.4168 157.492 46.2818 157.715 46.1896C157.938 46.0975 158.176 46.0502 158.417 46.0503C158.903 46.0503 159.369 46.2434 159.713 46.5872C160.057 46.9309 160.25 47.3971 160.25 47.8833V54.1163C160.25 54.6024 160.057 55.0687 159.713 55.4124C159.369 55.7562 158.903 55.9493 158.417 55.9493C158.176 55.9494 157.938 55.9021 157.715 55.8102C157.493 55.7182 157.291 55.5832 157.121 55.4131C156.95 55.243 156.815 55.041 156.723 54.8187C156.631 54.5963 156.583 54.358 156.583 54.1173ZM145.75 54.1173V47.8843C145.75 47.6435 145.797 47.405 145.889 47.1825C145.981 46.96 146.116 46.7578 146.286 46.5875C146.457 46.4172 146.659 46.2821 146.881 46.1899C147.104 46.0977 147.342 46.0503 147.583 46.0503C148.069 46.0503 148.535 46.2434 148.879 46.5872C149.223 46.9309 149.416 47.3971 149.416 47.8833V54.1163C149.416 54.6024 149.223 55.0687 148.879 55.4124C148.535 55.7562 148.069 55.9493 147.583 55.9493C147.097 55.9493 146.631 55.7563 146.287 55.4128C145.944 55.0692 145.75 54.6033 145.75 54.1173ZM161.167 48.7503C161.41 48.7503 161.643 48.8468 161.815 49.0185C161.987 49.1903 162.084 49.4233 162.084 49.6663V52.3333C162.084 52.5765 161.987 52.8097 161.815 52.9817C161.643 53.1537 161.41 53.2503 161.167 53.2503V48.7503ZM143.917 52.3333V52.3503C143.674 52.3503 143.441 52.2537 143.269 52.0817C143.097 51.9097 143 51.6765 143 51.4333V50.5663C143 50.3233 143.097 50.0903 143.269 49.9185C143.441 49.7468 143.674 49.6503 143.917 49.6503V49.6663C143.917 49.4233 144.014 49.1903 144.186 49.0185C144.358 48.8468 144.591 48.7503 144.834 48.7503V53.2503C144.714 53.2503 144.594 53.2266 144.483 53.1805C144.372 53.1344 144.271 53.0669 144.186 52.9817C144.1 52.8966 144.033 52.7955 143.987 52.6842C143.941 52.573 143.917 52.4537 143.917 52.3333ZM162.084 49.6503C162.327 49.6503 162.56 49.7468 162.732 49.9186C162.903 50.0904 163 50.3234 163 50.5663V51.4333C163 51.6763 162.904 51.9094 162.732 52.0814C162.56 52.2533 162.327 52.35 162.084 52.3503V49.6503ZM150.334 52.3503V49.6503H155.664V52.3503H150.334Z"/></g></g>`,
    crimes: `<g ${S}><g stroke-width="1.2001" transform="translate(12 12) scale(0.9999) translate(-9 -8.9981)"><path d="M7.1,14.807a17.239,17.239,0,0,1-3.868,1.818.681.681,0,0,1-.544-.051.622.622,0,0,1-.32-.6.632.632,0,0,1,.433-.532c3.471-1.147,6.436-3.3,7.79-6.437A2.057,2.057,0,0,0,8.509,6.118,2.315,2.315,0,0,0,6.326,7.585c-.8,1.856-2.815,3.327-5.515,4.078A.634.634,0,0,1,0,11.077a.645.645,0,0,1,.478-.631C2.788,9.8,4.486,8.6,5.132,7.1a3.723,3.723,0,0,1,6.427-.7,3.127,3.127,0,0,1,.228,3.1A11.081,11.081,0,0,1,9.843,12.5a13.4,13.4,0,0,1-2.74,2.3Zm-6.07-.446c3.47-.819,6.784-2.725,8.163-5.92a.625.625,0,0,0-.346-.826A.653.653,0,0,0,8,7.953C6.945,10.405,4.271,12.3.749,13.13a.632.632,0,1,0,.284,1.231Zm15.565.916a.6.6,0,0,0,.208-.564.611.611,0,0,0-.388-.464,3.485,3.485,0,0,1-1.719-1.18,3.9,3.9,0,0,1-.086-2.759c.278-1.543.626-3.463-.759-5.4A6.209,6.209,0,0,0,9.415,2.419,6.74,6.74,0,0,0,4.191,4.1,6.745,6.745,0,0,0,2.905,5.781,3.642,3.642,0,0,1,.593,7.75a.626.626,0,0,0-.436.529.632.632,0,0,0,.831.669A4.808,4.808,0,0,0,4.023,6.415a5.593,5.593,0,0,1,1.05-1.388,5.424,5.424,0,0,1,4.2-1.354A4.911,4.911,0,0,1,12.79,5.629c1.079,1.511.808,3.011.547,4.462a4.869,4.869,0,0,0,.263,3.645,4.573,4.573,0,0,0,2.268,1.656.725.725,0,0,0,.73-.115Zm-8.8.91c-.3.169-.665.378-1.144.615a.629.629,0,0,0-.348.664.648.648,0,0,0,.922.467c.316-.156.586-.3.821-.431.933-.517,1.021-.526,1.9.109l.35.244a.671.671,0,0,0,.481.1.639.639,0,0,0,.523-.487.625.625,0,0,0-.268-.654c-.376-.252-.653-.467-.862-.631-.867-.673-1.157-.693-2.378,0ZM1.155,4.912a.575.575,0,0,0,.808-.156l.388-.562A7.564,7.564,0,0,1,9.673,1.338c2.886.37,5.257,1.978,6.037,4.1a8.112,8.112,0,0,1,.2,4.615c-.189,1.053-.353,1.963.22,2.692a2.267,2.267,0,0,0,1.021.7A.623.623,0,0,0,18,12.87a.672.672,0,0,0-.427-.619.989.989,0,0,1-.415-.274c-.229-.29-.115-.916.027-1.707a9.3,9.3,0,0,0-.255-5.26C15.985,2.45,13.2.518,9.842.088A10.9,10.9,0,0,0,8.473,0,8.8,8.8,0,0,0,1.921,2.7,4.67,4.67,0,0,0,.976,4.079a.6.6,0,0,0,.178.832Zm10.633,8.809a.658.658,0,0,0-.883-.236.621.621,0,0,0-.243.859,7.059,7.059,0,0,0,2.767,2.562.667.667,0,0,0,.61.018h0a.619.619,0,0,0,.034-1.107,5.819,5.819,0,0,1-2.286-2.1Z"/></g></g>`,
    ocrimes: `<g ${S}><g stroke-width="1.0667" transform="translate(12 12) scale(1.125) translate(-6.005 -8)"><path d="m6,0C2.97,0,0,2.3,0,5.33c0,1.84,1.35,4.05,2.6,5.81,1.19-1.88,3.67-2.43,5.55-1.24.49.31.91.73,1.23,1.22,1.29-1.78,2.63-3.94,2.63-5.78,0-3.03-2.97-5.33-6-5.33Zm-2.33,7.33c-.92,0-1.67-.75-1.67-1.67s.75-1.67,1.67-1.67,1.67.75,1.67,1.67h0c0,.92-.75,1.67-1.67,1.67Zm4.67,0c-.92,0-1.67-.74-1.67-1.66s.74-1.67,1.66-1.67,1.67.74,1.67,1.66c0,0,0,0,0,0,0,.92-.74,1.67-1.66,1.67,0,0,0,0,0,0h0Zm-2.34,3.27c-1.49,0-2.7,1.21-2.7,2.7s1.21,2.7,2.7,2.7,2.7-1.21,2.7-2.7h0c0-1.49-1.21-2.7-2.7-2.7Zm.7.98c.24,0,.43.19.43.43s-.19.43-.43.43-.43-.19-.43-.43.19-.43.43-.43h0Zm-1.43,0c.24,0,.43.19.43.43,0,.24-.19.43-.43.43-.24,0-.43-.19-.43-.43,0,0,0,0,0,0,0-.24.19-.43.43-.43Zm-.77,2.14c-.24,0-.43-.19-.43-.43s.19-.43.43-.43.43.19.43.43-.19.43-.43.43h0Zm.77,1.28c-.24,0-.43-.19-.43-.43,0-.24.19-.43.43-.43s.43.19.43.43c0,.23-.19.43-.42.43h0Zm.3-1.71c0-.24.19-.43.43-.43.24,0,.43.19.43.43,0,.23-.19.43-.42.43-.24,0-.43-.19-.43-.43,0,0,0,0,0,0h0Zm1.13,1.72c-.24,0-.43-.19-.43-.43s.19-.43.43-.43.43.19.43.43-.19.43-.43.43h0Zm.8-1.28c-.24,0-.43-.19-.43-.43s.19-.43.43-.43.43.19.43.43-.19.43-.43.43h0Z"/></g></g>`,
    item: `<g ${S}><g stroke-width="1.0667" transform="translate(12 12) scale(1.125) translate(-7.335 -9)"><path d="M10.32,7.16,8,8.43.79,4.23,3.11,2.92Zm1.38-.73L14,5.23,6.51,1,4.45,2.16ZM7.33,9.59,0,5.31v7.32l7.33,4.18Zm7.34-3.23v7.22L8.67,17V9.58Z"/></g></g>`,
    armory: `<g ${S}><g stroke-width="1.0667" transform="translate(12 12) scale(1.125) translate(-17 -119.45)"><path d="M17,112.4a3.069,3.069,0,0,0-.5-1.3q-.45-.75-1.2-1.8a6,6,0,0,1-.7-2,2.979,2.979,0,0,1-.1-1.3,1.014,1.014,0,0,1,.7-.6c.2,0,.5,0,.5-.1s.1-.3,0-.3a.349.349,0,0,0-.1-.2v-1.4a.2.2,0,0,0-.2-.2h-.5l-.1-.3h-.2l-.1.3H9.8l-.1.1H7.5a.1.1,0,0,0-.1-.1H1.9s0-.2-.1-.2-.2.2-.2.2H1.3c-.2,0-.2.4-.2.4a.1.1,0,0,0-.1.1v.9a.1.1,0,0,0,.1.1v.8a1.165,1.165,0,0,0,.2.7,3.73,3.73,0,0,0,1.2.2h.7c.5,0,2,.1,3,.1a.451.451,0,0,1,.3.3v1.1a.758.758,0,0,1-.2.4.367.367,0,0,0,.1.3c.1,0,.2.1.3.1a26.153,26.153,0,0,0,2.8,0c.2,0,.5-.3.7-.3a.749.749,0,0,1,.5.1c.1.3.4.8.4.9a4.331,4.331,0,0,0-.1.5c.1.1.3.1.3.2a4.875,4.875,0,0,1,.3.7c0,.1-.1.4-.1.5.1.1.3.1.3.3.1.2.3.7.4.9v.6c.1.2.2.2.2.2v.3c0,.1.1.2.3.2h2.9c.1,0,.2-.3.3-.3v-.1a1.007,1.007,0,0,1,.3-.1.887.887,0,0,0,.5-.4C17,112.8,17,112.7,17,112.4Zm-7.5-4.2h-2a.467.467,0,0,1-.5-.5c0-.1-.1-.7.1-.9a1.185,1.185,0,0,1,.7-.4c.4,0,1.2.1,1.2.1a.8.8,0,0,1-.4,1.2c-.2.1-.1.4.1.3a3.942,3.942,0,0,0,1.4-1s.4,1-.6,1.2Z" transform="translate(8 11.1)"></path></g></g>`,
    travel: `<g ${S}><g stroke-width="1.0663" transform="translate(12 12) scale(1.1254) translate(-16.9999 -17.0001)"><path d="M24.2051 9.584C24.028 9.57296 23.8504 9.59832 23.6834 9.65851C23.5164 9.71871 23.3635 9.81245 23.2341 9.93399L20.0961 12.583C19.9326 12.7073 19.7415 12.7905 19.5391 12.8253C19.3366 12.8601 19.1288 12.8456 18.9331 12.783L18.1831 12.495C18.1036 12.4702 18.0312 12.4265 17.9722 12.3676C17.9133 12.3087 17.8694 12.2365 17.8444 12.157C17.8195 12.0775 17.8141 11.9931 17.8289 11.9111C17.8436 11.8291 17.878 11.7518 17.9291 11.686L18.4621 10.908C18.4833 10.8849 18.4995 10.8578 18.5099 10.8282C18.5202 10.7987 18.5244 10.7673 18.5223 10.7361C18.5201 10.7048 18.5116 10.6743 18.4973 10.6465C18.4831 10.6186 18.4633 10.594 18.4391 10.574C18.3275 10.4869 18.1967 10.4276 18.0576 10.401C17.9185 10.3744 17.7751 10.3812 17.6391 10.421C17.4922 10.4878 17.3592 10.5818 17.2471 10.698L16.7011 11.289C16.552 11.4333 16.3722 11.5421 16.1751 11.6072C15.9781 11.6723 15.7689 11.6921 15.5631 11.665L14.2831 11.426C13.9111 11.357 13.7731 11.08 13.9761 10.808L14.3421 10.316C14.4424 10.1998 14.4936 10.0492 14.4851 9.896C14.4551 9.647 13.9851 9.48001 13.7001 9.55201C13.3321 9.70927 13.0078 9.95361 12.7551 10.264L12.6411 10.394C12.3412 10.6997 11.9333 10.8757 11.5051 10.884L10.4291 10.845C10.0501 10.831 9.58113 10.684 9.35413 10.703C9.2849 10.7096 9.21898 10.7357 9.16408 10.7784C9.10918 10.8211 9.06757 10.8785 9.04413 10.944C8.99879 11.0666 8.99044 11.1997 9.02013 11.327C9.07913 11.534 9.54213 11.754 9.87513 11.934C11.3381 12.734 14.4881 14.391 15.8121 15.087C15.8868 15.1158 15.9522 15.1643 16.0014 15.2274C16.0506 15.2905 16.0817 15.3658 16.0913 15.4453C16.101 15.5247 16.0889 15.6052 16.0562 15.6783C16.0236 15.7514 15.9717 15.8142 15.9061 15.86L12.1281 19.206C11.9639 19.3358 11.7739 19.429 11.5707 19.4793C11.3675 19.5297 11.156 19.5361 10.9501 19.498L10.5591 19.398C10.2487 19.2925 9.91855 19.2583 9.59313 19.298C9.32355 19.4458 9.11807 19.688 9.01613 19.978C8.93813 20.301 9.47514 20.696 9.82514 20.839C10.2805 20.9794 10.7023 21.2119 11.0641 21.522C11.4168 21.9223 11.6885 22.3872 11.8641 22.891C11.9941 23.245 12.2141 23.78 12.4851 23.737C12.6472 23.7003 12.795 23.6168 12.9101 23.497L13.1261 23.26C13.2591 22.9782 13.2791 22.6561 13.1821 22.36L13.1221 22.114C13.0845 21.9146 13.0985 21.7088 13.1627 21.5163C13.2269 21.3238 13.3393 21.1509 13.4891 21.014L17.8021 17.461C17.8611 17.4041 17.9334 17.3629 18.0125 17.3413C18.0915 17.3197 18.1747 17.3184 18.2544 17.3374C18.3342 17.3564 18.4078 17.3952 18.4686 17.4502C18.5293 17.5052 18.5753 17.5746 18.6021 17.652L21.3181 23.884C21.4691 24.23 22.0111 24.694 22.1301 24.336C22.211 23.964 22.211 23.579 22.1301 23.207C22.1301 23.207 22.1011 22.933 22.0661 22.596C22.0622 22.399 22.1023 22.2036 22.1834 22.024C22.2645 21.8445 22.3847 21.6853 22.5351 21.558L23.4141 20.853C23.5811 20.7163 23.7044 20.5338 23.7691 20.328C23.8691 19.987 23.5971 19.528 23.3751 19.559C23.0541 19.6618 22.744 19.7957 22.4491 19.959C22.1491 20.1 21.8811 19.908 21.8551 19.531L21.8091 18.846C21.8067 18.6415 21.8539 18.4395 21.9467 18.2573C22.0396 18.0751 22.1753 17.9182 22.3421 17.8L22.5701 17.656C22.9603 17.4306 23.277 17.0972 23.4821 16.696C23.5162 16.5192 23.4825 16.336 23.3879 16.1829C23.2932 16.0297 23.1445 15.9177 22.9711 15.869C22.587 15.9094 22.209 15.9953 21.8451 16.125C21.7636 16.1491 21.6777 16.1545 21.5939 16.1407C21.51 16.1269 21.4304 16.0943 21.3609 16.0453C21.2914 15.9963 21.2339 15.9323 21.1928 15.8579C21.1516 15.7836 21.1278 15.7009 21.1231 15.616L21.0881 15.27C21.0791 15.06 21.1132 14.8503 21.1881 14.6539C21.2631 14.4576 21.3775 14.2786 21.5241 14.128L24.2481 11.628C24.5933 11.339 24.8487 10.9573 24.9841 10.528C24.9911 10.4796 24.9955 10.4309 24.9971 10.382C24.9782 10.1778 24.8888 9.98646 24.7443 9.84087C24.5999 9.69528 24.4092 9.60447 24.2051 9.584Z"/></g></g>`,
    raceway: `<g ${S}><g stroke-width="1.0667" transform="translate(12 12) scale(1.125) translate(-153 -118.9995)"><path d="M159.946 123.806C160.638 122.561 161.001 121.159 161 119.734C161.01 117.568 160.169 115.485 158.656 113.934C157.923 113.175 157.044 112.57 156.072 112.158C155.1 111.745 154.055 111.532 153 111.532C151.944 111.532 150.899 111.745 149.927 112.158C148.955 112.57 148.076 113.175 147.343 113.934C145.831 115.485 144.989 117.568 145 119.734C144.999 121.183 145.374 122.607 146.089 123.867C146.477 124.549 146.962 125.172 147.527 125.716L148.308 126.467L149.773 124.867L148.992 124.116C148.74 123.874 148.511 123.611 148.305 123.328L149.605 122.558L148.918 121.337L147.618 122.108C147.304 121.357 147.142 120.55 147.142 119.736C147.142 118.921 147.304 118.115 147.618 117.363L148.918 118.133L149.605 116.912L148.305 116.143C148.774 115.494 149.371 114.948 150.06 114.54C150.749 114.131 151.515 113.87 152.31 113.77V115.31H153.686V113.77C154.481 113.87 155.247 114.131 155.936 114.54C156.625 114.948 157.222 115.494 157.691 116.143L156.391 116.912L157.079 118.133L158.379 117.363C158.738 118.22 158.898 119.146 158.847 120.074C158.796 121.001 158.536 121.904 158.085 122.716C158.022 122.828 157.955 122.939 157.885 123.048L156.671 122.113L157.187 125.844L160.827 125.316L159.597 124.369C159.723 124.185 159.839 123.998 159.946 123.806ZM153 118.506C152.755 118.5 152.514 118.566 152.307 118.697C152.101 118.828 151.937 119.018 151.839 119.242C151.74 119.466 151.71 119.714 151.753 119.955C151.796 120.196 151.91 120.419 152.08 120.595C152.25 120.771 152.469 120.893 152.708 120.944C152.947 120.996 153.197 120.975 153.424 120.884C153.652 120.793 153.847 120.637 153.985 120.435C154.123 120.233 154.198 119.994 154.2 119.749L156.284 117.744L153.558 118.644C153.387 118.552 153.195 118.503 153 118.503V118.506Z"/></g></g>`,
    job: `<g ${S}><g stroke-width="1.0667" transform="translate(12 12) scale(1.125) translate(-8 -7.665)"><path d="M16,14.33H0v-10H16ZM6,1A1.33,1.33,0,0,0,4.67,2.33V3.67H6v-1a.34.34,0,0,1,.33-.34H9.67a.34.34,0,0,1,.33.34v1h1.33V2.33A1.33,1.33,0,0,0,10,1Z"/></g></g>`,
    fist: `<g ${S}><g stroke-width="1.0667" transform="translate(12 12) scale(1.125) translate(-5.865 -9)"><path d="M3.46,17H9.12V12.29A6,6,0,0,0,10.59,9L9,9.06,6.61,8v1.1H5.44l2.34,1.11L6.61,13.49,6,10.79,2.32,8.46V7.83L5.44,8,6.61,6.85l-4.5-2L0,8.08l3.46,4.3Zm6.66-9,1.61-1.42-.58-1.63L9.46,7.61ZM9,6.85,10.43,4,8.81,3.21l-1,3.64ZM6.61,5.74,8.25,2.63,6.46,1.87l-.77,3ZM2.73,3.84l2,.9L5.8,1.62,4.41,1Z"/></g></g>`,
    calendar: `<g ${S}><g stroke-width="1.0667" transform="translate(12 12) scale(1.125) translate(-8 -9)"><path d="M16,2.33V17H0V2.33H2V3A1.34,1.34,0,0,0,4.67,3V2.33h6.66V3A1.34,1.34,0,0,0,14,3V2.33Zm-1.33,4H1.33v9.34H14.67ZM13.33,1.67A.66.66,0,0,0,12.67,1a.67.67,0,0,0-.67.67V3a.67.67,0,0,0,.67.67A.66.66,0,0,0,13.33,3ZM4,3a.67.67,0,0,1-.67.67A.66.66,0,0,1,2.67,3V1.67A.66.66,0,0,1,3.33,1,.67.67,0,0,1,4,1.67Zm4.46,9a1.15,1.15,0,0,0-.74-1.13,1.07,1.07,0,0,0,.56-1A1.59,1.59,0,0,0,6.56,8.42a1.72,1.72,0,0,0-1.78,1.85h1.1c0-.51.18-.88.68-.88a.58.58,0,0,1,.62.58c0,.5-.54.57-1,.53v.85c.71,0,1.14.05,1.14.66a.68.68,0,0,1-.73.7c-.55,0-.77-.41-.79-1H4.67a1.74,1.74,0,0,0,1.89,1.93A1.73,1.73,0,0,0,8.46,12Zm2.87,1.68V8.52h-.92c-.12.77-.67,1-1.45,1v.9h1.23v3.28Z"/></g></g>`,
    events: `<g ${S}><g stroke-width="1.0667" transform="translate(12 12) scale(1.125) translate(-8 -9)"><path d="M8,1a8,8,0,1,0,8,8A8,8,0,0,0,8,1ZM6.47,3.87H9.53l-.77,7.18H7.24ZM8,14.55A1.15,1.15,0,1,1,9.15,13.4,1.14,1.14,0,0,1,8,14.55Z"/></g></g>`,
    awards: `<g ${S}><g stroke-width="1.0667" transform="translate(12 12) scale(1.1249) translate(-18 -16.9995)"><path d="M-696-155a5.006,5.006,0,0,1,5-5,5.005,5.005,0,0,1,5,5,5.006,5.006,0,0,1-5,5A5.007,5.007,0,0,1-696-155Zm5,1.975,1.853,1.024-.354-2.171,1.5-1.537-2.074-.317L-691-158l-.928,1.975-2.072.317,1.5,1.537-.354,2.171,1.854-1.024Zm1-7.976,3-5,3,2-3,5Zm-8-3,3-2,3,5-3,2Zm6,1-2-3h6l-2,3Z" transform="translate(709 175)"/></g></g>`,
    education: `<g ${S}><g stroke-width="1.0667" transform="translate(12 12) scale(1.125) translate(-153 -17.0002)"><path d="M157.923 17.5367V20.6557C157.923 22.3507 154.36 23.1557 152.384 23.1557C150.506 23.1557 146.846 22.2987 146.846 20.6557V16.7827L152.384 19.7747L157.923 17.5367ZM152.949 10.8447L145 14.3827L152.384 18.3827L159.154 15.6647V20.0757H160.384V14.9987L152.949 10.8447ZM161 23.1527H158.538C158.945 22.3959 159.156 21.5498 159.154 20.6907H160.384C160.382 21.5497 160.594 22.3958 161 23.1527Z"/></g></g>`,
    hospital: `<g ${S}><g stroke-width="1.0667" transform="translate(12 12) scale(1.125) translate(-17 -187)"><path d="M7,168v6H1v4H7v6h4v-6h6v-4H11v-6Z" transform="translate(8 11)"></path></g></g>`,
    jail: `<g ${S}><g stroke-width="1.0708" transform="translate(12 12) scale(1.1207) translate(-119 -187)"><path d="M121.852 179V195H123.732V179H121.852ZM117.146 190.823H120.911V188.941H117.146V190.823ZM110.969 190.823H113.38V188.941H110.969V190.823ZM124.674 190.823H127.031V188.941H124.678L124.674 190.823ZM117.146 185.176H120.911V183.294H117.146V185.176ZM110.969 185.176H113.38V183.294H110.969V185.176ZM124.674 185.176H127.031V183.294H124.678L124.674 185.176ZM114.321 179V195H116.204V179H114.321Z"/></g></g>`,
    targets: `<g ${S}><g stroke-width="1.4" transform="translate(12 12) scale(0.8571) translate(-10.5 -7.9995)"><path d="M-8482,697l0-.828c0-1.68.132-2.65,2.117-3.108,2.244-.519,4.46-.983,3.394-2.946-3.152-5.82-.9-9.119,2.488-9.119,3.323,0,5.635,3.178,2.488,9.119-1.034,1.952,1.1,2.416,3.394,2.946,1.986.458,2.12,1.428,2.118,3.108l0,.828Zm16-4v-1.035a3.508,3.508,0,0,1-2.963-2.965H-8470v-1h1.037a3.506,3.506,0,0,1,2.963-2.965V684h1v1.037a3.507,3.507,0,0,1,2.966,2.965H-8461v1h-1.036a3.507,3.507,0,0,1-2.966,2.965V693Zm-2-4.5a2.5,2.5,0,0,0,2.5,2.5,2.5,2.5,0,0,0,2.5-2.5,2.5,2.5,0,0,0-2.5-2.5A2.5,2.5,0,0,0-8468,688.5Zm1,0a1.5,1.5,0,0,1,1.5-1.5,1.5,1.5,0,0,1,1.5,1.5,1.5,1.5,0,0,1-1.5,1.5A1.5,1.5,0,0,1-8467,688.5Z" transform="translate(8482 -681)"/></g></g>`,
    trophy: `<g ${S}><g stroke-width="1.0667" transform="translate(12 12) scale(1.125) translate(-17 -629.3)"><path d="M18,612.3a7.162,7.162,0,0,1-4.6,6.3l.6-1.2a6.034,6.034,0,0,0,3-4.2H15.2c0-.3.1-.6.1-.9Zm-16,0a7.162,7.162,0,0,0,4.6,6.3L6,617.4a6.034,6.034,0,0,1-3-4.2H4.8c0-.3-.1-.6-.1-.9ZM14.7,611c0,6.5-3.4,8.7-3.7,11.3H9.1c-.3-2.6-3.7-4.8-3.7-11.3Zm-4.9,8.7A15,15,0,0,1,8,612.3H6.9a11.564,11.564,0,0,0,2.9,7.4ZM11,623H9c-.1.8-.4,1.7-1.7,1.7v.9h5.3v-.9C11.3,624.7,11.1,623.8,11,623Z" transform="translate(7 11)"></path></g></g>`,
    recruit: `<g ${S}><g stroke-width="1.2444" transform="translate(12 12) scale(0.9643) translate(-7 -10.3331)"><path d="M381,1330a4.662,4.662,0,0,0,3.345-7.914l1.735-1.559a6.993,6.993,0,0,1-5.08,11.806v2.333l-3.865-3.529,3.865-3.471Zm0-14v2.333a6.993,6.993,0,0,0-5.08,11.806l1.735-1.559a4.662,4.662,0,0,1,3.345-7.914V1323l3.865-3.471Z" transform="translate(-374 -1315)"/></g></g>`,
    enemies: `<g ${S}><g stroke-width="1.2333" transform="translate(12 12) scale(0.973) translate(-9.25 -9)"><path d="M13.88,13.06c-2.29-.53-4.43-1-3.39-2.94C13.63,4.18,11.32,1,8,1S2.36,4.3,5.51,10.12c1.07,2-1.15,2.43-3.39,2.94C.13,13.52,0,14.49,0,16.17V17H16v-.83C16,14.49,15.87,13.52,13.88,13.06Z"/><rect x="12.5" y="7.5" width="6" height="2"></rect></g></g>`,
    friends: `<g ${S}><g stroke-width="1.2333" transform="translate(12 12) scale(0.973) translate(-9.25 -9)"><path d="M13.88,13.06c-2.29-.53-4.43-1-3.39-2.94C13.63,4.18,11.32,1,8,1S2.36,4.3,5.51,10.12c1.07,2-1.15,2.43-3.39,2.94C.13,13.52,0,14.49,0,16.17V17H16v-.83C16,14.49,15.87,13.52,13.88,13.06Z"/><polygon points="18.5 7.5 16.5 7.5 16.5 5.5 14.5 5.5 14.5 7.5 12.5 7.5 12.5 9.5 14.5 9.5 14.5 11.5 16.5 11.5 16.5 9.5 18.5 9.5 18.5 7.5"></polygon></g></g>`,
    messages: `<g ${S}><g stroke-width="1.2" transform="translate(12 12) scale(1) translate(-9 -7.5)"><path d="M9,8,0,1H18ZM4.93,6.7,0,2.85v9Zm8.14,0L18,11.88v-9Zm-1.17.91L9,9.87,6.1,7.61,0,14H18Z"/></g></g>`,
    compose: `<g ${S}><path d="M14 19H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v3.5"/><path d="M3 7l9 6 9-6"/><path d="M20.5 13.5l2 2-5.5 5.5H15v-2z"/></g>`,
    home: `<g ${S}><g stroke-width="1.0667" transform="translate(12 12) scale(1.125) translate(-8 -8.2)"><path d="M14,8.86V15.4H9.64V11H6.36V15.4H2V8.86H0L8,1l8,7.86ZM12.91,5.1V2.31H10.73v.88Z"/></g></g>`,
    key: `<g ${S}><g stroke-width="1.0666" transform="translate(12 12) scale(1.1251) translate(-187.0003 -17)"><path d="M189.245 9.00098C185.079 9.00098 183.468 14.001 186.731 17.268C188.821 19.361 191.974 19.6 193.775 17.796C196.815 14.752 193.776 9.00098 189.245 9.00098ZM192.517 16.526C191.194 17.851 189.143 17.136 189.309 15.38C189.318 15.2877 189.306 15.1946 189.275 15.1074C189.243 15.0201 189.193 14.9409 189.127 14.8754C189.062 14.8098 188.983 14.7596 188.895 14.7282C188.808 14.6969 188.715 14.6851 188.623 14.694C186.884 14.86 186.151 12.813 187.481 11.48C188.811 10.147 190.855 10.88 190.689 12.626C190.68 12.7183 190.692 12.8114 190.723 12.8986C190.754 12.9858 190.805 13.0651 190.87 13.1306C190.936 13.1962 191.015 13.2464 191.102 13.2778C191.189 13.3091 191.282 13.3208 191.375 13.312C193.113 13.147 193.848 15.192 192.517 16.526ZM184.652 21.226L186.065 22.64L185.123 23.584L184.181 22.64L183.71 23.112L184.652 24.056L183.71 24.999L182.297 23.584L180.884 24.999L179.001 23.112L184.928 17.176C185.184 17.545 185.473 17.8907 185.79 18.209C186.105 18.5233 186.447 18.8088 186.813 19.062L184.652 21.226Z"/></g></g>`,
    missions: `<g ${S}><g stroke-width="1.0666" transform="translate(12 12) scale(1.125) translate(-17.5001 -153.0003)"><path d="M13.4989 152.339C13.4964 152.972 13.7197 153.585 14.1288 154.068C14.5379 154.551 15.1058 154.872 15.7306 154.974C16.3553 155.076 16.9959 154.951 17.537 154.623C18.0782 154.295 18.4845 153.784 18.6829 153.183L20.1649 152.323V152.339C20.1669 153.221 19.8778 154.08 19.3424 154.781C18.807 155.482 18.0552 155.987 17.2036 156.218C16.352 156.448 15.448 156.392 14.632 156.056C13.8159 155.721 13.1333 155.126 12.6899 154.363C12.2465 153.6 12.0672 152.712 12.1796 151.837C12.2921 150.962 12.69 150.149 13.3119 149.523C13.9337 148.897 14.7446 148.494 15.619 148.375C16.4933 148.257 17.3822 148.431 18.1479 148.869L16.6749 149.724C16.2887 149.647 15.8904 149.657 15.5086 149.753C15.1268 149.849 14.771 150.029 14.4671 150.279C14.1631 150.529 13.9185 150.844 13.7509 151.2C13.5833 151.556 13.4969 151.945 13.4979 152.339H13.4989ZM16.1659 151.006C15.9023 151.006 15.6445 151.084 15.4253 151.231C15.2061 151.377 15.0353 151.585 14.9344 151.829C14.8335 152.073 14.8071 152.341 14.8585 152.599C14.9099 152.858 15.0369 153.095 15.2233 153.282C15.4098 153.468 15.6473 153.595 15.9058 153.647C16.1644 153.698 16.4324 153.672 16.676 153.571C16.9196 153.47 17.1278 153.299 17.2742 153.08C17.4207 152.861 17.4989 152.603 17.4989 152.339V152.329L19.7389 151.029C20.1355 150.872 20.5609 150.8 20.9872 150.818C21.4135 150.836 21.8312 150.944 22.2129 151.135L25.4999 149.227L23.3999 148.181L23.5129 145.759L20.2059 147.673C20.1818 148.099 20.068 148.515 19.8721 148.894C19.6762 149.274 19.4025 149.607 19.0689 149.873L16.8139 151.183C16.6167 151.069 16.3935 151.008 16.1659 151.006ZM22.8039 152.906C22.6633 152.693 22.4674 152.521 22.2371 152.41C22.0068 152.299 21.7506 152.252 21.4959 152.275V152.334C21.4998 153.515 21.1133 154.663 20.3965 155.601C19.6796 156.539 18.6727 157.214 17.5326 157.52C16.3925 157.826 15.1831 157.747 14.0929 157.294C13.0026 156.841 12.0927 156.041 11.5047 155.017C10.9168 153.993 10.6839 152.804 10.8423 151.634C11.0007 150.464 11.5415 149.38 12.3805 148.549C13.2195 147.719 14.3095 147.189 15.4809 147.042C16.6523 146.896 17.8392 147.141 18.8569 147.739C18.9744 147.517 19.0439 147.274 19.0612 147.023C19.0784 146.773 19.0429 146.522 18.9569 146.286C17.5086 145.616 15.8677 145.488 14.3329 145.925C12.7982 146.363 11.4717 147.337 10.595 148.671C9.71825 150.005 9.34966 151.609 9.55632 153.191C9.76298 154.774 10.5311 156.229 11.7209 157.293L10.8489 159.993C10.8318 160.048 10.8335 160.107 10.8535 160.161C10.8736 160.215 10.9109 160.261 10.9597 160.291C11.0085 160.321 11.066 160.335 11.1232 160.329C11.1804 160.323 11.2341 160.299 11.2759 160.259L13.2759 158.334C14.1763 158.772 15.1643 158.999 16.1654 158.999C17.1665 158.999 18.1545 158.772 19.0549 158.334L21.0549 160.258C21.0967 160.298 21.1504 160.322 21.2076 160.328C21.2648 160.334 21.3223 160.32 21.3711 160.29C21.4199 160.26 21.4572 160.214 21.4773 160.16C21.4973 160.106 21.499 160.047 21.4819 159.992L20.6109 157.292C21.8731 156.164 22.658 154.597 22.8059 152.911L22.8039 152.906Z"/></g></g>`,
    newspaper: `<g ${S}><g stroke-width="1.2" transform="translate(12 12) scale(1) translate(-9 -8.5)"><path d="M5.25,10.75H15v.75H5.25Zm3-3V10H12V7.75Zm-.75,0H5.25V8.5H7.5ZM5.25,10H7.5V9.25H5.25ZM15,9.25H12.75V10H15ZM9.79,4.32V4H8.88V5.48h.94v-.3H9.23v-.3h.53v-.3H9.23V4.32Zm1,.2.18,1h.38L11.76,4H11.4l-.19,1L11,4h-.37l-.21,1-.18-1H9.91l.34,1.46h.38Zm1.43.68a.89.89,0,0,1-.35-.08h0l-.07.29h0a1,1,0,0,0,.41.09c.44,0,.59-.25.59-.46s-.12-.34-.38-.44-.25-.11-.25-.18.07-.12.19-.12a.72.72,0,0,1,.29.06h0l.08-.29h0A.92.92,0,0,0,12.39,4c-.33,0-.55.18-.55.44s.14.35.4.44.23.11.23.19S12.39,5.2,12.26,5.2Zm-4,.28h.36V4H8.3v.9L7.82,4h-.4V5.48h.33v-1ZM15,6.25H5.25V7H15Zm0,1.5H12.75V8.5H15ZM2.25,1V13.9a.38.38,0,1,1-.75,0V2.5H0v12A1.52,1.52,0,0,0,1.51,16h15A1.52,1.52,0,0,0,18,14.48V1ZM16.5,13H3.75V2.5H16.5Z"/></g></g>`,
    casino: `<g ${S}><g stroke-width="1.0667" transform="translate(12 12) scale(1.125) translate(-153 -85)"><path d="M145 85C145 83.4178 145.469 81.871 146.348 80.5554C147.227 79.2398 148.477 78.2145 149.939 77.609C151.4 77.0035 153.009 76.845 154.561 77.1537C156.113 77.4624 157.538 78.2243 158.657 79.3431C159.776 80.462 160.538 81.8874 160.846 83.4393C161.155 84.9911 160.997 86.5997 160.391 88.0615C159.786 89.5233 158.76 90.7727 157.445 91.6518C156.129 92.5308 154.582 93 153 93C150.879 92.9982 148.845 92.1547 147.345 90.6548C145.845 89.1549 145.002 87.1212 145 85ZM150.288 91.552C151.147 91.9109 152.069 92.0942 153 92.091V90.575C152.267 90.575 151.54 90.4323 150.861 90.155L150.288 91.552ZM155.139 90.152L155.711 91.552C156.58 91.2013 157.366 90.6726 158.019 90L156.941 88.939C156.427 89.4598 155.815 89.8729 155.139 90.154V90.152ZM146.448 87.712C146.798 88.5768 147.32 89.3618 147.981 90.02L149.059 88.959C148.539 88.4386 148.126 87.8204 147.846 87.14L146.448 87.712ZM148.318 85C148.318 85.926 148.593 86.8312 149.107 87.6012C149.622 88.3711 150.353 88.9712 151.208 89.3256C152.064 89.68 153.005 89.7727 153.913 89.592C154.822 89.4114 155.656 88.9655 156.311 88.3107C156.965 87.6559 157.411 86.8216 157.592 85.9134C157.773 85.0052 157.68 84.0638 157.326 83.2083C156.971 82.3528 156.371 81.6215 155.601 81.1071C154.831 80.5926 153.926 80.318 153 80.318C151.758 80.318 150.567 80.8113 149.689 81.6893C148.811 82.5674 148.318 83.7583 148.318 85ZM158.17 87.139L159.57 87.711C159.922 86.8504 160.104 85.9298 160.107 85H158.592C158.592 85.7336 158.448 86.4602 158.17 87.139ZM145.91 85H147.425C147.425 84.2664 147.568 83.5398 147.846 82.861L146.446 82.289C146.087 83.1474 145.904 84.0695 145.91 85ZM156.941 81.025C157.461 81.5454 157.874 82.1636 158.154 82.844L159.554 82.273C159.2 81.4155 158.678 80.6368 158.021 79.982L156.941 81.025ZM147.964 80L149.042 81.059C149.565 80.542 150.183 80.1302 150.861 79.846L150.289 78.446C149.419 78.8053 148.629 79.3334 147.964 80ZM153 79.425C153.734 79.4249 154.46 79.5679 155.139 79.846L155.711 78.446C154.85 78.0944 153.93 77.9121 153 77.909V79.425ZM152.662 88.625C152.627 88.6227 152.594 88.6077 152.569 88.5829C152.544 88.558 152.529 88.525 152.527 88.49V87.8C152.186 87.7821 151.863 87.6428 151.616 87.4072C151.369 87.1717 151.215 86.8555 151.181 86.516C151.178 86.4968 151.179 86.477 151.184 86.4582C151.189 86.4394 151.199 86.4221 151.212 86.4075C151.225 86.3929 151.241 86.3814 151.259 86.3739C151.277 86.3663 151.296 86.363 151.316 86.364H152.04C152.071 86.3618 152.101 86.3707 152.126 86.389C152.151 86.4074 152.168 86.434 152.175 86.464C152.201 86.5694 152.262 86.6631 152.348 86.7303C152.433 86.7974 152.538 86.8343 152.647 86.835H153.254C153.429 86.8357 153.599 86.773 153.732 86.6586C153.865 86.5442 153.952 86.3856 153.978 86.212C153.986 86.116 153.974 86.0193 153.943 85.9281C153.912 85.8369 153.863 85.753 153.798 85.6817C153.733 85.6105 153.654 85.5534 153.566 85.514C153.478 85.4747 153.383 85.4539 153.287 85.453H152.832C152.414 85.4609 152.007 85.3144 151.69 85.0413C151.373 84.7682 151.168 84.3879 151.114 83.973C151.068 83.5478 151.191 83.1216 151.455 82.7853C151.719 82.449 152.104 82.2293 152.528 82.173V81.48C152.531 81.445 152.546 81.4122 152.57 81.3874C152.595 81.3626 152.628 81.3476 152.663 81.345H153.337C153.372 81.3473 153.405 81.3623 153.43 81.3872C153.455 81.412 153.47 81.445 153.472 81.48V82.171C153.813 82.1879 154.136 82.3264 154.383 82.5613C154.63 82.7961 154.785 83.1118 154.819 83.451C154.822 83.4702 154.821 83.4899 154.816 83.5087C154.811 83.5274 154.801 83.5447 154.788 83.5592C154.775 83.5738 154.759 83.5852 154.741 83.5926C154.723 83.6 154.703 83.6032 154.684 83.602H153.977C153.946 83.6042 153.915 83.5954 153.891 83.5771C153.866 83.5588 153.848 83.5321 153.841 83.502C153.815 83.3968 153.754 83.3032 153.669 83.2362C153.584 83.1692 153.478 83.1326 153.37 83.132H152.764C152.588 83.1309 152.418 83.1933 152.285 83.3078C152.152 83.4223 152.064 83.5812 152.039 83.755C152.031 83.851 152.043 83.9477 152.074 84.0389C152.105 84.1302 152.154 84.214 152.219 84.2853C152.284 84.3565 152.363 84.4136 152.451 84.453C152.539 84.4923 152.634 84.5131 152.73 84.514H153.252C153.483 84.5121 153.712 84.5592 153.923 84.6524C154.135 84.7455 154.324 84.8826 154.478 85.0543C154.633 85.2261 154.749 85.4288 154.819 85.6489C154.89 85.869 154.912 86.1015 154.886 86.331C154.843 86.6945 154.681 87.0337 154.425 87.2956C154.17 87.5575 153.834 87.7275 153.472 87.779V88.486C153.47 88.5211 153.455 88.5542 153.43 88.5791C153.405 88.604 153.372 88.6189 153.337 88.621L152.662 88.625Z"/></g></g>`,
    stats: `<g ${S}><g stroke-width="1.6" transform="translate(12 12) scale(0.75) translate(-607 -200.5)"><path d="M600,208h-4v-4h4Zm6,0h-4v-8h4Zm6,0h-4V195h4Zm6,0h-4V189h4Zm1,2H595v2h24Z"/></g></g>`,
    log: `<g ${S}><g stroke-width="1.1974" transform="translate(12 12) scale(1.0022) translate(-9.5 -9.0195)"><path d="M17,2.25V18H2V2.25H5.5l-2,2.106V16.5h12V4.356L13.543,2.25H17Zm-2.734,3L11.781,2.573V2.266A2.266,2.266,0,0,0,7.25,2.25v.323L4.777,5.25ZM9.5,1.5a.75.75,0,1,1-.75.75A.75.75,0,0,1,9.5,1.5ZM5.75,12.75h7.5v.75H5.75Zm0-.75h7.5v-.75H5.75Zm0-1.5h7.5V9.75H5.75Zm0-1.5h7.5V8.25H5.75Z"/></g></g>`,
    apiKey: `<path d="M20.80,7.37L20.35,6.14L19.94,5.30L19.33,5.40L18.87,5.39L18.41,5.32L17.96,5.19L17.54,4.99L17.15,4.74L16.80,4.44L16.38,3.99L16.19,3.75L15.95,3.37L15.77,2.95L15.64,2.51L15.59,2.06L15.59,1.60L15.66,1.15L15.74,0.86L15.33,0.64L14.56,0.31L13.68,-0L13.29,0.61L12.96,0.96L12.60,1.28L12.19,1.54L11.53,1.83L11.06,1.94L10.59,2L10.10,1.99L9.63,1.92L9.16,1.79L8.72,1.60L8.31,1.35L8.01,1.12L7.66,0.79L7.37,0.41L7.12,-0L6.68,0.14L5.90,0.45L5.06,0.86L5.17,1.30L5.22,1.91L5.18,2.36L5.08,2.80L4.92,3.23L4.70,3.63L4.42,3.99L3.89,4.55L3.52,4.83L3.12,5.06L2.69,5.24L2.39,5.32L1.93,5.39L1.62,5.40L1.16,5.36L0.86,5.30L0.56,5.89L0.27,6.58L-0,7.37L0.41,7.61L0.79,7.90L1.13,8.23L1.41,8.61L1.65,9.03L1.83,9.47L1.95,9.93L2,10.40L1.98,10.73L1.88,11.23L1.73,11.70L1.59,12.01L1.34,12.44L0.92,12.96L0.55,13.30L0,13.68L0.14,14.12L0.45,14.90L0.86,15.74L1.29,15.64L1.73,15.60L2.17,15.62L2.60,15.69L3.03,15.82L3.43,16L3.80,16.24L4.14,16.52L4.44,16.84L4.70,17.20L4.90,17.59L5.10,18.16L5.18,18.56L5.20,19.06L5.15,19.54L5.06,19.94L6.07,20.43L7.12,20.80L7.49,20.24L7.70,19.99L8.05,19.68L8.05,17.20L8.14,16.45L8.35,15.85L8.53,15.50L8.92,14.99L9.19,14.74L8.67,14.58L7.89,14.16L7.20,13.60L6.64,12.91L6.22,12.13L5.96,11.28L5.88,10.40L5.96,9.52L6.22,8.67L6.64,7.89L7.20,7.20L7.89,6.64L8.67,6.22L9.52,5.96L10.40,5.88L11.28,5.96L12.13,6.22L12.91,6.64L13.60,7.20L14.16,7.89L14.58,8.67L14.84,9.52L14.92,10.40L14.91,10.70L14.77,11.57L14.46,12.40L13.99,13.15L13.60,13.60L13.20,13.95L20.62,13.95L20.80,13.43L20.39,13.19L20.01,12.90L19.67,12.57L19.39,12.19L19.15,11.77L18.97,11.33L18.85,10.87L18.80,10.40L18.83,10.08L18.93,9.62L19.08,9.17L19.22,8.88L19.57,8.36L19.89,8L20.26,7.70ZM18.15,18.55L17.65,18.55L17.65,18.56L18.11,18.56ZM13.06,19.55L13.74,19.55L13.40,18.46ZM10.53,15.35L10.19,15.54L9.89,15.79L9.64,16.09L9.45,16.43L9.34,16.81L9.30,17.20L9.30,21.80L9.34,22.19L9.45,22.57L9.64,22.91L9.89,23.21L10.19,23.46L10.53,23.65L10.91,23.76L11.30,23.80L21.80,23.80L22.19,23.76L22.57,23.65L22.91,23.46L23.21,23.21L23.46,22.91L23.65,22.57L23.76,22.19L23.80,21.80L23.80,17.20L23.76,16.81L23.65,16.43L23.46,16.09L23.21,15.79L22.91,15.54L22.57,15.35L22.19,15.24L21.80,15.20L11.30,15.20L10.91,15.24ZM14.39,17.25L15.40,20.54L15.40,21.75L14.41,21.75L14.14,20.85L12.66,20.85L12.39,21.75L11.40,21.75L11.40,20.54L12.41,17.25ZM18.15,19.86L17.65,19.86L17.65,21.75L16.35,21.75L16.35,17.25L18.15,17.25L18.42,17.28L18.68,17.36L18.91,17.50L19.11,17.68L19.24,17.85L19.39,18.15L19.45,18.49L19.40,18.89L19.28,19.21L19.11,19.43L18.85,19.65L18.48,19.81ZM21.70,21.75L20.40,21.75L20.40,17.25L21.70,17.25Z"/>`,
    gear: `<g ${S}><g stroke-width="1.6" transform="translate(12 12) scale(0.75) translate(-12 -12)"><path d="M24 13.616v-3.232c-1.651-.587-2.694-.752-3.219-2.019v-.001c-.527-1.271.1-2.134.847-3.707l-2.285-2.285c-1.561.742-2.433 1.375-3.707.847h-.001c-1.269-.526-1.435-1.576-2.019-3.219h-3.232c-.582 1.635-.749 2.692-2.019 3.219h-.001c-1.271.528-2.132-.098-3.707-.847l-2.285 2.285c.745 1.568 1.375 2.434.847 3.707-.527 1.271-1.584 1.438-3.219 2.02v3.232c1.632.58 2.692.749 3.219 2.019.53 1.282-.114 2.166-.847 3.707l2.285 2.286c1.562-.743 2.434-1.375 3.707-.847h.001c1.27.526 1.436 1.579 2.019 3.219h3.232c.582-1.636.75-2.69 2.027-3.222h.001c1.262-.524 2.12.101 3.698.851l2.285-2.286c-.744-1.563-1.375-2.433-.848-3.706.527-1.271 1.588-1.44 3.221-2.021zm-12 2.384c-2.209 0-4-1.791-4-4s1.791-4 4-4 4 1.791 4 4-1.791 4-4 4z"/></g></g>`,
    laptop: `<g ${S}><rect x="4.5" y="4.5" width="15" height="10.5" rx="1.4"/><path d="M2 19.5h20l-1.5-4.5h-17z"/></g>`,
    basket: `<g ${S}><g stroke-width="1.2" transform="translate(12 12) scale(1) translate(-85 -51.0001)"><path d="M79.4 47.3001L82.9 43.8001C82.975 43.7126 83.0667 43.641 83.1697 43.5895C83.2727 43.5379 83.385 43.5076 83.5 43.5001C83.6055 43.4986 83.7102 43.5183 83.8079 43.558C83.9056 43.5976 83.9944 43.6565 84.069 43.7311C84.1436 43.8057 84.2024 43.8945 84.2421 43.9922C84.2818 44.0899 84.3015 44.1946 84.3 44.3001C84.3 44.5001 84.2 44.6001 84 44.8001L81.6 47.3001H79.4ZM88.4 47.3001H90.6L87.1 43.8001C87.025 43.7126 86.9333 43.641 86.8303 43.5895C86.7273 43.5379 86.615 43.5076 86.5 43.5001C86.3945 43.4986 86.2898 43.5183 86.1921 43.558C86.0944 43.5976 86.0056 43.6565 85.931 43.7311C85.8564 43.8057 85.7976 43.8945 85.7579 43.9922C85.7182 44.0899 85.6985 44.1946 85.7 44.3001C85.7618 44.4869 85.8643 44.6576 86 44.8001L88.4 47.3001ZM94 48.8001V50.3001H93.5C93.3044 50.2847 93.1094 50.3355 92.9462 50.4444C92.783 50.5532 92.661 50.7137 92.6 50.9001L89.5 58.5001H80.5L77.4 50.8001C77.3055 50.6465 77.1731 50.5198 77.0155 50.4322C76.8579 50.3446 76.6803 50.2991 76.5 50.3001H76V48.8001H94ZM82.8 51.8001C82.8015 51.6946 82.7818 51.5899 82.7421 51.4922C82.7024 51.3945 82.6436 51.3057 82.569 51.2311C82.4944 51.1565 82.4056 51.0976 82.3079 51.058C82.2102 51.0183 82.1055 50.9986 82 51.0001C81.5 51.0001 81.3 51.3001 81.3 51.8001V55.5001C81.2985 55.6055 81.3182 55.7102 81.3579 55.808C81.3976 55.9057 81.4564 55.9945 81.531 56.0691C81.6056 56.1436 81.6944 56.2025 81.7921 56.2422C81.8898 56.2819 81.9945 56.3016 82.1 56.3001C82.2075 56.3099 82.3159 56.296 82.4174 56.2593C82.5189 56.2225 82.6111 56.1639 82.6875 56.0876C82.7638 56.0112 82.8224 55.919 82.8592 55.8175C82.8959 55.716 82.9098 55.6076 82.9 55.5001V51.8001H82.8ZM85.8 51.8001C85.8 51.5879 85.7157 51.3844 85.5657 51.2344C85.4157 51.0844 85.2122 51.0001 85 51.0001C84.7878 51.0001 84.5843 51.0844 84.4343 51.2344C84.2843 51.3844 84.2 51.5879 84.2 51.8001V55.5001C84.2 55.7123 84.2843 55.9157 84.4343 56.0658C84.5843 56.2158 84.7878 56.3001 85 56.3001C85.2122 56.3001 85.4157 56.2158 85.5657 56.0658C85.7157 55.9157 85.8 55.7123 85.8 55.5001V51.8001ZM88.8 51.8001C88.8 51.695 88.7793 51.591 88.7391 51.4939C88.6989 51.3969 88.64 51.3087 88.5657 51.2344C88.4914 51.1601 88.4032 51.1012 88.3061 51.061C88.2091 51.0208 88.1051 51.0001 88 51.0001C87.8949 51.0001 87.7909 51.0208 87.6939 51.061C87.5968 51.1012 87.5086 51.1601 87.4343 51.2344C87.36 51.3087 87.3011 51.3969 87.2609 51.4939C87.2207 51.591 87.2 51.695 87.2 51.8001V55.5001C87.2 55.7123 87.2843 55.9157 87.4343 56.0658C87.5843 56.2158 87.7878 56.3001 88 56.3001C88.2122 56.3001 88.4157 56.2158 88.5657 56.0658C88.7157 55.9157 88.8 55.7123 88.8 55.5001V51.8001Z"/></g></g>`,
    gavel: `<g ${S}><g stroke-width="1.0668" transform="translate(12 12) scale(1.1248) translate(-84.9999 -17)"><path d="M90.7792 22.3489H78.1611C77.9976 22.3587 77.8377 22.4009 77.6907 22.473C77.5436 22.5451 77.4123 22.6457 77.3045 22.769C77.1966 22.8923 77.1144 23.0358 77.0625 23.1912C77.0106 23.3465 76.9901 23.5106 77.0021 23.674C76.9831 24.0026 77.0939 24.3257 77.3107 24.5735C77.5274 24.8213 77.8328 24.9741 78.1611 24.999H90.7792C91.0999 24.9557 91.394 24.7976 91.607 24.5539C91.82 24.3102 91.9374 23.9976 91.9374 23.674C91.9374 23.3503 91.82 23.0377 91.607 22.794C91.394 22.5503 91.0999 22.3922 90.7792 22.3489ZM92.6552 19.36L85.6982 15.4869L85.0162 16.676L91.9732 20.515C92.0734 20.5835 92.1928 20.6185 92.3142 20.615C92.4362 20.6114 92.5556 20.5787 92.6624 20.5195C92.7692 20.4604 92.8604 20.3765 92.9281 20.275C93.0069 20.1162 93.0225 19.9335 92.9719 19.7637C92.9212 19.5939 92.808 19.4496 92.6552 19.36ZM82.0372 11.514L79.7121 15.668L83.6121 17.835L85.9361 13.68L82.0372 11.514ZM81.9812 10.731L86.6192 13.313C86.7173 13.368 86.8254 13.4028 86.9372 13.4155C87.049 13.4281 87.1622 13.4183 87.2702 13.3867C87.3781 13.355 87.4786 13.3021 87.5659 13.2311C87.6531 13.16 87.7253 13.0723 87.7782 12.973L87.8461 12.838C87.8998 12.7402 87.9335 12.6327 87.9454 12.5219C87.9572 12.411 87.9469 12.2988 87.9151 12.192C87.8498 11.9755 87.7028 11.7929 87.5051 11.683L82.9052 9.10095C82.7785 9.03617 82.6384 9.00195 82.4961 9.00098C82.3436 9.00418 82.1944 9.04651 82.0629 9.1239C81.9314 9.2013 81.822 9.31112 81.7452 9.44293L81.6771 9.57794C81.6236 9.67575 81.59 9.78327 81.5784 9.89417C81.5667 10.0051 81.5771 10.1171 81.6091 10.2239C81.6689 10.4318 81.8008 10.6116 81.9812 10.731ZM78.0932 17.6949L82.7312 20.277C82.8294 20.332 82.9376 20.3668 83.0495 20.3795C83.1613 20.3922 83.2746 20.3824 83.3826 20.3508C83.4906 20.3191 83.5913 20.2662 83.6786 20.1951C83.7659 20.1241 83.8382 20.0363 83.8912 19.937L83.9592 19.801C84.0125 19.7032 84.0459 19.5959 84.0576 19.4852C84.0692 19.3745 84.0589 19.2626 84.0271 19.1559C83.9623 18.9395 83.8155 18.7569 83.6181 18.647L80.2761 16.778L78.9761 16.0649C78.8495 16.0001 78.7094 15.9658 78.5672 15.965C78.4147 15.9682 78.2656 16.0104 78.1342 16.0876C78.0027 16.1648 77.8932 16.2744 77.8161 16.4059L77.7482 16.542C77.6949 16.6399 77.6614 16.7473 77.6498 16.8582C77.6381 16.969 77.6484 17.0811 77.6802 17.188C77.7076 17.2981 77.7588 17.4009 77.8302 17.4891C77.9015 17.5774 77.9912 17.649 78.0932 17.699V17.6949Z"/></g></g>`,
    pointsMarket: `<g ${S}><g stroke-width="1.2" transform="translate(12 12) scale(1) translate(-85 -118.9999)"><path d="M85.9 118.999H84.1V117.199H85.9V118.999ZM82.3 115.399V122.599H84.1V120.799H85.9C86.3774 120.799 86.8352 120.609 87.1728 120.272C87.5104 119.934 87.7 119.476 87.7 118.999V117.199C87.7 116.722 87.5104 116.264 87.1728 115.926C86.8352 115.589 86.3774 115.399 85.9 115.399H82.3ZM90.553 121.699C90.0102 122.815 89.144 123.741 88.0671 124.357C86.9903 124.974 85.7528 125.251 84.5158 125.154C83.2789 125.057 82.0999 124.59 81.1324 123.813C80.165 123.036 79.454 121.986 79.092 120.799H77.1C77.4898 122.511 78.425 124.049 79.7649 125.183C81.1048 126.317 82.7769 126.985 84.5293 127.087C86.2817 127.188 88.0197 126.718 89.4816 125.746C90.9435 124.774 92.0502 123.354 92.635 121.699H94L91.75 118.099L89.5 121.699H90.553ZM79.447 116.299C79.9898 115.183 80.856 114.257 81.9329 113.641C83.0097 113.024 84.2472 112.747 85.4842 112.844C86.7211 112.941 87.9001 113.408 88.8676 114.185C89.835 114.962 90.546 116.012 90.908 117.199H92.9C92.5099 115.488 91.5746 113.95 90.2348 112.816C88.895 111.682 87.2233 111.014 85.4711 110.913C83.719 110.811 81.9813 111.282 80.5196 112.253C79.0578 113.225 77.9511 114.644 77.366 116.299H76L78.25 119.871L80.5 116.299H79.447Z"/></g></g>`,
    pointsP: `<g ${S}><g stroke-width="1.2" transform="translate(12 12) scale(1) translate(-85 -85)"><path d="M78.139 85C78.139 83.643 78.5414 82.3165 79.2953 81.1882C80.0492 80.0599 81.1207 79.1805 82.3744 78.6613C83.6281 78.142 85.0076 78.0061 86.3385 78.2708C87.6694 78.5355 88.8919 79.189 89.8515 80.1486C90.811 81.1081 91.4644 82.3306 91.7292 83.6615C91.9939 84.9924 91.858 86.3719 91.3387 87.6256C90.8195 88.8793 89.9401 89.9508 88.8118 90.7047C87.6835 91.4586 86.357 91.861 85 91.861C83.1813 91.8579 81.438 91.134 80.152 89.848C78.866 88.562 78.1422 86.8187 78.139 85ZM76 85C76 86.78 76.5279 88.5201 77.5168 90.0001C78.5057 91.4802 79.9113 92.6338 81.5558 93.3149C83.2004 93.9961 85.01 94.1744 86.7558 93.8271C88.5016 93.4798 90.1053 92.6226 91.364 91.364C92.6226 90.1053 93.4798 88.5016 93.8271 86.7558C94.1743 85.01 93.9961 83.2004 93.3149 81.5558C92.6337 79.9113 91.4802 78.5057 90.0001 77.5168C88.5201 76.5279 86.78 76 85 76C82.6131 76 80.3239 76.9482 78.636 78.636C76.9482 80.3239 76 82.6131 76 85ZM86 85H84V83H86V85ZM82 81V89H84V87H86C86.5304 87 87.0391 86.7893 87.4142 86.4142C87.7893 86.0391 88 85.5304 88 85V83C88 82.4696 87.7893 81.9609 87.4142 81.5858C87.0391 81.2107 86.5304 81 86 81H82Z"/></g></g>`,
    storefront: `<g ${S}><g stroke-width="1.2" transform="translate(12 12) scale(1) translate(-85 -595)"><path d="M93.25 604H76.75V593.5H93.25V604ZM78.25 602.25H91.75V595H78.25V602.25ZM81 601H79V596H81V601ZM84 601H82V596H84V601ZM88 601H86V596H88V601ZM91 601H89V596H91V601ZM79 589.73V590.55C79 590.948 78.8418 591.329 78.5605 591.61C78.2792 591.892 77.8978 592.05 77.5 592.05C77.1022 592.05 76.7208 591.892 76.4395 591.61C76.1582 591.329 76 590.948 76 590.55V589.73L79.6602 586H81.1699L79 589.73ZM82.75 589.73V590.55C82.75 590.948 82.5918 591.329 82.3105 591.61C82.0292 591.892 81.6478 592.05 81.25 592.05C80.8522 592.05 80.4708 591.892 80.1895 591.61C79.9082 591.329 79.75 590.948 79.75 590.55V589.73L82 586H83.4502L82.75 589.73ZM86.5 589.67V590.5C86.4899 590.895 86.3289 591.271 86.0498 591.55C85.7707 591.829 85.3946 591.99 85 592C84.6054 591.99 84.2293 591.829 83.9502 591.55C83.6711 591.271 83.5101 590.895 83.5 590.5V589.68L84.29 586H85.71L86.5 589.67ZM90.25 589.75V590.58C90.2369 590.966 90.0718 591.332 89.791 591.598C89.5103 591.863 89.1365 592.008 88.75 592C88.3636 591.991 87.9947 591.836 87.7168 591.567C87.4391 591.299 87.2725 590.935 87.25 590.55V589.68L86.5498 586H88L90.25 589.75ZM94 589.73V590.55C93.9895 590.94 93.8263 591.31 93.5459 591.581C93.2654 591.852 92.8901 592.003 92.5 592C92.1054 591.99 91.7293 591.829 91.4502 591.55C91.1711 591.271 91.0101 590.895 91 590.5V589.68L88.8301 586H90.3496L94 589.73Z"/></g></g>`,
    bazaarManage: `<g ${S}><path d="M3.5 9.5 5 4h14l1.5 5.5"/><path d="M3.5 9.5c0 1.4 1 2.3 2.2 2.3s2.2-.9 2.2-2.3c0 1.4 1 2.3 2.2 2.3s2.2-.9 2.2-2.3c0 1.4 1 2.3 2.2 2.3s2.2-.9 2.2-2.3c0 1.4 1 2.3 2.2 2.3s2.1-.9 2.1-2.3"/><path d="M9 4 8 9.5M12 4v5.5M15 4l1 5.5"/><path d="M5 12v8.5h8.3M19 12v1.2"/><path d="M8.5 20.5v-5h4v5"/><path d="M17.29 14.95L17.29 13.5L19.31 13.5L19.31 14.95L20.7 15.75L21.95 15.03L22.96 16.78L21.71 17.5L21.71 19.1L22.96 19.82L21.95 21.57L20.7 20.85L19.31 21.65L19.31 23.1L17.29 23.1L17.29 21.65L15.9 20.85L14.65 21.57L13.64 19.82L14.89 19.1L14.89 17.5L13.64 16.78L14.65 15.03L15.9 15.75Z"/><circle cx="18.3" cy="18.3" r="1.5"/></g>`,
    bazaarAdd: `<g ${S}><path d="M3.5 9.5 5 4h14l1.5 5.5"/><path d="M3.5 9.5c0 1.4 1 2.3 2.2 2.3s2.2-.9 2.2-2.3c0 1.4 1 2.3 2.2 2.3s2.2-.9 2.2-2.3c0 1.4 1 2.3 2.2 2.3s2.2-.9 2.2-2.3c0 1.4 1 2.3 2.2 2.3s2.1-.9 2.1-2.3"/><path d="M9 4 8 9.5M12 4v5.5M15 4l1 5.5"/><path d="M5 12v8.5h8.3M19 12v1.2"/><path d="M8.5 20.5v-5h4v5"/><path d="M18.5 14.5v8M14.5 18.5h8"/></g>`,
    trades: `<g ${S}><g stroke-width="1.2" transform="translate(12 12) scale(1) translate(-7.615 -10)"><path d="M6.76,7.1V8.76L2.86,4.88,6.76,1V2.65s7.93,0,8.47,9.31A7.94,7.94,0,0,0,6.76,7.1ZM0,8c.54,9.31,8.47,9.31,8.47,9.31V19l3.9-3.88-3.9-3.87V12.9A7.94,7.94,0,0,1,0,8Z"/></g></g>`,
    ammo: `<g ${S}><g stroke-width="1.0667" transform="translate(12 12) scale(1.125) translate(-6.395 -8)"><path d="m1.77,5.86h1.03v-1.82c.01-1.41-.35-2.79-1.04-4.01C1.09,1.25.74,2.63.73,4.03v1.82h1.04Zm1.07.73H.71c-.05.53-.2,1.06-.43,1.54h3c-.23-.48-.38-1-.43-1.54h0ZM0,15.89c0,.06.05.11.11.11,0,0,0,0,0,0h3.34c.06,0,.11-.05.11-.11,0,0,0,0,0,0v-7.04H0v7.04Zm4.62-.46c0,.3.24.54.53.55h2.47c.3,0,.55-.25.55-.55v-6.6h-3.56v6.6Zm2.84-8.87h-2.13c-.05.53-.2,1.05-.43,1.54h2.99c-.23-.48-.38-1-.43-1.53h0Zm-.03-2.55c.01-1.41-.35-2.79-1.04-4.01-.67,1.23-1.03,2.61-1.03,4.01v1.82h2.07v-1.82Zm4.61,0c.01-1.4-.35-2.79-1.04-4.01-.67,1.23-1.03,2.61-1.04,4.01v1.82h2.07v-1.82Zm.04,2.55h-2.13c-.05.53-.2,1.05-.43,1.54h2.99c-.23-.48-.38-1-.43-1.53h0Zm-2.84,2.26v6.6c0,.3.24.54.53.55h2.47c.3,0,.55-.25.55-.55v-6.6h-3.56Z"/></g></g>`,
    displayCase: `<g ${S}><g stroke-width="1.0667" transform="translate(12 12) scale(1.125) translate(-8 -8)"><path d="m0,0v16h16V0H0Zm1.33,4h6v10.67H1.33V4Zm13.33,10.67h-6V4h6v10.67Z"/></g></g>`,
    displayManage: `<g ${S}><path d="M13 20.5H3.5v-17h17V13M3.5 8h17M10 8v12.5"/><path d="M17.29 14.95L17.29 13.5L19.31 13.5L19.31 14.95L20.7 15.75L21.95 15.03L22.96 16.78L21.71 17.5L21.71 19.1L22.96 19.82L21.95 21.57L20.7 20.85L19.31 21.65L19.31 23.1L17.29 23.1L17.29 21.65L15.9 20.85L14.65 21.57L13.64 19.82L14.89 19.1L14.89 17.5L13.64 16.78L14.65 15.03L15.9 15.75Z"/><circle cx="18.3" cy="18.3" r="1.5"/></g>`,
    vault: `<path fill-rule="evenodd" d="M4 3h16a1 1 0 0 1 1 1v15a1 1 0 0 1-1 1h-.5v1.5h-2.5V20H7v1.5H4.5V20H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zm8 3.7a4.8 4.8 0 1 0 0 9.6 4.8 4.8 0 0 0 0-9.6zm0 2.6a2.2 2.2 0 1 1 0 4.4 2.2 2.2 0 0 1 0-4.4z"/>`,
    dump: `<g ${S}><g stroke-width="1.2" transform="translate(12 12) scale(1) translate(-17 -84.9999)"><path d="M12.17 84.7547C11.6632 84.8063 11.1823 85.0039 10.7856 85.3234C10.3888 85.6429 10.0933 86.0706 9.93475 86.5547C9.77622 87.0388 9.76152 87.5585 9.89243 88.0508C10.0233 88.543 10.2942 88.9868 10.6723 89.3282C11.0503 89.6696 11.5193 89.894 12.0223 89.9742C12.5253 90.0545 13.0409 89.9871 13.5063 89.7802C13.9718 89.5733 14.3673 89.2358 14.6449 88.8087C14.9224 88.3815 15.0701 87.8831 15.07 87.3737C15.0304 86.6427 14.7033 85.957 14.1599 85.4663C13.6166 84.9756 12.9013 84.7198 12.17 84.7547ZM12.17 88.9447C11.8663 88.9132 11.5783 88.7943 11.3407 88.6024C11.1032 88.4105 10.9264 88.1539 10.8318 87.8636C10.7371 87.5733 10.7287 87.2618 10.8074 86.9668C10.8862 86.6718 11.0488 86.406 11.2755 86.2015C11.5023 85.997 11.7834 85.8627 12.085 85.8147C12.3865 85.7668 12.6955 85.8072 12.9745 85.9313C13.2535 86.0553 13.4905 86.2576 13.6569 86.5136C13.8233 86.7696 13.9119 87.0684 13.912 87.3737C13.8882 87.8126 13.6916 88.2243 13.3652 88.5186C13.0387 88.813 12.609 88.9662 12.17 88.9447ZM21.618 84.7547C21.1112 84.8063 20.6303 85.0039 20.2336 85.3234C19.8368 85.6429 19.5413 86.0706 19.3828 86.5547C19.2242 87.0388 19.2095 87.5585 19.3404 88.0508C19.4713 88.543 19.7422 88.9868 20.1203 89.3282C20.4983 89.6696 20.9673 89.894 21.4703 89.9742C21.9733 90.0545 22.4889 89.9871 22.9543 89.7802C23.4198 89.5733 23.8153 89.2358 24.0929 88.8087C24.3704 88.3815 24.5181 87.8831 24.518 87.3737C24.4784 86.6427 24.1513 85.957 23.608 85.4663C23.0646 84.9756 22.3493 84.7198 21.618 84.7547ZM21.618 88.9447C21.3144 88.913 21.0264 88.7939 20.7891 88.602C20.5517 88.41 20.3751 88.1533 20.2806 87.863C20.1861 87.5728 20.1777 87.2613 20.2566 86.9664C20.3354 86.6714 20.4981 86.4057 20.7249 86.2013C20.9516 85.9969 21.2328 85.8627 21.5343 85.8148C21.8358 85.7669 22.1447 85.8074 22.4236 85.9315C22.7026 86.0555 22.9396 86.2578 23.1059 86.5137C23.2723 86.7697 23.3609 87.0684 23.361 87.3737C23.3372 87.8128 23.1405 88.2246 22.8138 88.519C22.4872 88.8134 22.0572 88.9665 21.618 88.9447ZM8.60001 87.3027H8V83.5407L9.55701 83.0637V80.9447H13.278L14.228 84.2957H11.966C11.137 84.3078 10.3401 84.6185 9.72176 85.1709C9.10342 85.7233 8.70513 86.4802 8.60001 87.3027ZM26 82.4217V83.6597L15.179 85.5167L13.802 80.5637H8.739V79.9927H14.229L14.691 81.4747L23.255 81.4797L26 82.4217Z"/></g></g>`,
    museum: `<g ${S}><g stroke-width="1.0667" transform="translate(12 12) scale(1.125) translate(-153 -187)"><path d="M146 186.5V194.5H149V186.5H151V187.5H150V194.5H151V188.5H155V194.5H156V187.5H155V186.5H157V194.5H160V186.5H161V185.5H145V186.5H146ZM145 183.5V184.5H161V183.5H145ZM147 181.5V182.5H159V181.5H147ZM149 179.5V180.5H157V179.5H149Z"/></g></g>`,
    loanShark: `<g ${S}><g stroke-width="1.2" transform="translate(12 12) scale(1) translate(-16.9999 -118.9998)"><path d="M18.1057 112.675C18.4837 112.435 18.8266 112.144 19.1247 111.809C19.3777 111.538 19.7107 111.19 19.6747 110.788C19.6568 110.663 19.5948 110.549 19.4998 110.465C19.4048 110.382 19.2832 110.335 19.1567 110.333C19.0738 110.324 18.9902 110.32 18.9067 110.321C18.8507 110.321 18.7367 110.307 18.6927 110.35C18.6007 110.441 18.5087 110.531 18.4177 110.622C18.3977 110.56 18.3787 110.498 18.3597 110.436C18.3546 110.42 18.3436 110.406 18.3287 110.398C18.3139 110.389 18.2964 110.387 18.2797 110.39C18.0308 110.448 17.7736 110.463 17.5197 110.433C17.2057 110.375 16.8967 110.286 16.5857 110.213C16.569 110.209 16.5513 110.211 16.5364 110.22C16.5214 110.229 16.5104 110.243 16.5057 110.259L16.4307 110.5C16.3207 110.39 16.2107 110.282 16.0997 110.174C16.0737 110.148 16.0377 110.093 15.9997 110.086L15.7777 110.048C15.6617 110.03 15.5457 110.017 15.4287 110.007C15.1727 109.987 14.7087 109.983 14.6947 110.341C14.6807 110.914 15.1827 111.368 15.5427 111.748C15.7944 111.988 16.0097 112.263 16.1817 112.564C15.2948 112.947 14.5414 113.584 14.0171 114.395C13.4928 115.206 13.2212 116.155 13.2367 117.12C13.2367 119.566 14.3877 120.236 17.0007 120.236C19.6137 120.236 20.7647 119.566 20.7647 117.12C20.7721 116.207 20.5279 115.309 20.0589 114.525C19.5899 113.741 18.9142 113.101 18.1057 112.675ZM17.9587 116.355H17.9537L18.0197 116.411L17.9627 116.363L17.9587 116.355ZM18.1047 117.48C18.0085 117.623 17.8783 117.74 17.7257 117.82C17.6458 117.861 17.562 117.895 17.4757 117.92L17.3507 117.954V118.27C17.3594 118.343 17.3494 118.417 17.3218 118.486C17.2941 118.554 17.2498 118.614 17.1927 118.66C17.1207 118.707 17.034 118.725 16.9492 118.712C16.8644 118.699 16.7874 118.655 16.7327 118.589C16.6668 118.484 16.638 118.359 16.6507 118.235V117.954L16.5637 117.928C16.5137 117.915 16.4637 117.898 16.4147 117.881L16.3277 117.849C16.3069 117.863 16.2852 117.876 16.2627 117.887C16.2235 117.907 16.1813 117.92 16.1377 117.925C16.0564 117.934 15.9745 117.914 15.9072 117.867C15.8398 117.821 15.7914 117.752 15.7707 117.672C15.7441 117.453 15.7441 117.232 15.7707 117.012C15.7919 116.929 15.8434 116.858 15.9151 116.811C15.9868 116.764 16.0734 116.746 16.1577 116.76C16.2412 116.771 16.3171 116.815 16.3687 116.881C16.3956 116.917 16.4162 116.958 16.4297 117C16.4395 117.04 16.4557 117.079 16.4777 117.113C16.5381 117.173 16.6139 117.216 16.6967 117.235C16.7963 117.267 16.9002 117.284 17.0047 117.283C17.1865 117.297 17.3662 117.238 17.5047 117.119C17.524 117.099 17.5379 117.073 17.5453 117.046C17.5527 117.019 17.5534 116.99 17.5473 116.963C17.5413 116.935 17.5285 116.909 17.5103 116.888C17.4921 116.866 17.4689 116.849 17.4427 116.838C17.3422 116.805 17.2392 116.78 17.1347 116.763L16.8427 116.708C16.5675 116.683 16.3075 116.571 16.0997 116.388C15.9769 116.259 15.8994 116.094 15.879 115.917C15.8586 115.74 15.8964 115.561 15.9867 115.407C16.0798 115.254 16.2139 115.13 16.3737 115.049C16.4562 115.008 16.5431 114.977 16.6327 114.955C16.6587 114.949 16.6557 114.955 16.6557 114.928V114.867C16.6557 114.767 16.6497 114.667 16.6557 114.575C16.655 114.493 16.683 114.412 16.735 114.348C16.7869 114.283 16.8597 114.239 16.9407 114.222C17.0237 114.207 17.1096 114.222 17.1815 114.267C17.2535 114.311 17.3063 114.38 17.3297 114.461C17.3534 114.57 17.3612 114.682 17.3527 114.793V114.946L17.4037 114.957C17.4287 114.962 17.4537 114.969 17.4787 114.976C17.5037 114.983 17.5337 115 17.5497 114.987C17.6211 114.927 17.7131 114.897 17.8064 114.903C17.8996 114.909 17.9869 114.951 18.0497 115.02C18.1248 115.147 18.1561 115.295 18.1387 115.441C18.1508 115.567 18.1369 115.695 18.0977 115.815C18.0609 115.893 17.996 115.954 17.9161 115.986C17.8362 116.018 17.7472 116.019 17.6667 115.988C17.5858 115.959 17.5195 115.899 17.4817 115.821C17.4708 115.799 17.4618 115.775 17.4547 115.751L17.4467 115.718C17.4386 115.712 17.4299 115.707 17.4207 115.703C17.3853 115.683 17.3477 115.667 17.3087 115.654C17.218 115.627 17.1234 115.615 17.0287 115.617C16.9409 115.616 16.8534 115.628 16.7687 115.651C16.6687 115.684 16.4837 115.812 16.6257 115.915C16.7202 115.97 16.8252 116.004 16.9337 116.015L17.1997 116.067C17.4724 116.097 17.7333 116.194 17.9587 116.35H17.9637C18.1197 116.49 18.2198 116.681 18.2458 116.889C18.2717 117.097 18.2216 117.307 18.1047 117.48ZM23.5047 122.132C22.6187 122.188 21.4517 123.08 20.3267 123.594C19.1843 123.952 17.9663 123.995 16.8017 123.717C17.1327 123.561 18.4777 123.238 18.7487 123.117C20.1897 122.478 20.0667 121.148 19.3817 121.159C18.4747 121.173 17.9427 121.397 16.1347 121.646C14.8702 121.697 13.6107 121.837 12.3657 122.064C11.2657 122.487 9.50073 125.33 9.50073 125.33L12.2317 128C12.2317 128 13.9237 126.32 14.7467 126.32C16.6237 126.32 16.6987 126.295 18.4407 126.2C18.89 126.207 19.3369 126.134 19.7607 125.985C21.5436 125.326 23.158 124.279 24.4877 122.92C24.5907 122.349 23.9707 122.1 23.4987 122.132H23.5047Z"/></g></g>`,
    church: `<g ${S}><g stroke-width="1.0666" transform="translate(12 12) scale(1.1251) translate(-17.0001 -51.0001)"><path d="M20.1401 47.8601C20.003 46.8254 19.5793 45.8496 18.9167 45.0432C18.2541 44.2368 17.3791 43.6318 16.3906 43.2967C15.4021 42.9616 14.3396 42.9097 13.3232 43.1469C12.3068 43.3841 11.377 43.9009 10.6389 44.6389C9.90091 45.377 9.38407 46.3068 9.14686 47.3232C8.90966 48.3396 8.96156 49.4021 9.29667 50.3906C9.63179 51.3791 10.2368 52.2541 11.0432 52.9167C11.8496 53.5793 12.8254 54.003 13.8601 54.1401C13.9971 55.1748 14.4209 56.1505 15.0835 56.9569C15.7461 57.7634 16.6211 58.3684 17.6096 58.7035C18.598 59.0386 19.6605 59.0905 20.677 58.8533C21.6934 58.6161 22.6232 58.0992 23.3612 57.3612C24.0992 56.6232 24.6161 55.6934 24.8533 54.677C25.0905 53.6605 25.0386 52.598 24.7035 51.6096C24.3684 50.6211 23.7634 49.7461 22.9569 49.0835C22.1505 48.4209 21.1748 47.9971 20.1401 47.8601ZM13.9241 52.2681C13.2542 52.1454 12.6307 51.8419 12.121 51.3903C11.6113 50.9387 11.2348 50.3563 11.0324 49.7061C10.8299 49.0559 10.8091 48.3628 10.9723 47.7016C11.1354 47.0405 11.4764 46.4366 11.9581 45.9553C12.4399 45.474 13.0441 45.1336 13.7054 44.9711C14.3666 44.8085 15.0598 44.8299 15.7098 45.033C16.3598 45.2361 16.9418 45.6131 17.3929 46.1232C17.844 46.6333 18.147 47.2571 18.2691 47.9271C17.1986 48.144 16.2156 48.6713 15.4429 49.4433C14.6702 50.2153 14.1419 51.1978 13.9241 52.2681ZM20.0761 49.7321C20.7459 49.8548 21.3693 50.1583 21.879 50.6099C22.3886 51.0614 22.7651 51.6438 22.9676 52.2939C23.17 52.944 23.1909 53.6371 23.0278 54.2982C22.8646 54.9593 22.5238 55.5632 22.0422 56.0445C21.5605 56.5258 20.9564 56.8662 20.2952 57.0289C19.634 57.1916 18.9409 57.1703 18.2909 56.9673C17.6409 56.7644 17.0588 56.3875 16.6076 55.8776C16.1564 55.3676 15.8533 54.7439 15.7311 54.0741C16.8016 53.8568 17.7844 53.3291 18.5571 52.557C19.3297 51.7849 19.858 50.8024 20.0761 49.7321ZM15.9001 52.1001C16.0867 51.5993 16.3789 51.1446 16.7567 50.7668C17.1346 50.3889 17.5893 50.0967 18.0901 49.9101C17.9037 50.411 17.6117 50.8659 17.2337 51.2438C16.8558 51.6217 16.401 51.9137 15.9001 52.1001Z"/></g></g>`,
    cityHall: `<g ${S}><g stroke-width="1.0667" transform="translate(12 12) scale(1.125) translate(-119 -17)"><path d="M122.06 22.333L124.388 25H122.6L120.268 22.333H122.06ZM118.318 25H119.682V22.333H118.318V25ZM123.091 13H121.727V18.333H123.091V13ZM113.601 25H115.393L117.725 22.333H115.925L113.601 25ZM116.954 17.667H115.591V18.333H116.954V17.667ZM119 16.333H117.636V18.333H119V16.333ZM121.045 15H119.682V18.333H121.045V15ZM126.5 11H125.818V21H112.182V11H111.5V9H126.5V11ZM124.455 11H113.545V19.667H124.455V11Z"/></g></g>`,
    stockMarket: `<g ${S}><g stroke-width="1.0667" transform="translate(12 12) scale(1.125) translate(-51 -119)"><path d="M50.318 124.333H51.682V127H50.318V124.333ZM52.265 124.333L54.6 127H56.391L54.063 124.333H52.265ZM45.6 127H47.391L49.723 124.333H47.923L45.6 127ZM50.781 116.995L51.801 117.995L54.112 115.741L54.681 116.294L55.09 114.335L53.044 114.7L53.629 115.27L51.805 117.056L50.782 116.056L48.282 118.47L48.763 118.943L50.781 116.995ZM55.09 119.667H47.59V114.333H46.908V120.333H55.09V119.667ZM58.5 113H57.818V123H44.182V113H43.5V111H58.5V113ZM56.455 113H45.545V121.667H56.455V113Z"/></g></g>`,
    info: `<g ${S}><g stroke-width="1.2" transform="translate(12 12) scale(1) translate(-118.9999 -152.9999)"><path d="M118.158 161.734C115.984 162.479 114.19 161.625 114.55 159.591C114.91 157.557 116.974 153.201 117.268 152.377C117.562 151.553 116.998 151.328 116.393 151.663C115.929 151.949 115.491 152.274 115.081 152.633C114.958 152.391 114.781 152.115 114.654 151.85C115.588 150.902 116.751 150.213 118.031 149.85C119.748 149.437 122.618 150.097 121.385 153.293C120.504 155.571 119.885 157.143 119.485 158.314C119.085 159.485 119.559 159.73 120.246 159.274C120.782 158.903 121.292 158.496 121.773 158.056C121.967 158.363 122.029 158.456 122.22 158.813C121.052 160.023 119.677 161.012 118.158 161.734ZM122.665 147.643C122.211 148.039 121.627 148.253 121.024 148.246C120.422 148.239 119.843 148.01 119.398 147.603C119.206 147.393 119.061 147.145 118.971 146.875C118.881 146.605 118.849 146.319 118.878 146.036C118.906 145.753 118.994 145.479 119.135 145.232C119.277 144.985 119.468 144.771 119.698 144.603C120.153 144.208 120.737 143.993 121.339 144C121.942 144.007 122.521 144.236 122.965 144.642C123.157 144.852 123.303 145.101 123.393 145.371C123.483 145.641 123.514 145.927 123.486 146.21C123.458 146.493 123.37 146.767 123.229 147.014C123.087 147.261 122.895 147.476 122.665 147.643Z"/></g></g>`,
    star: `<g ${S}><g stroke-width="1.0667" transform="translate(12 12) scale(1.125) translate(-17 -798.6)"><path d="M9,779.3l1.9,5.8H17l-4.9,3.6,1.9,5.8-5-3.6-4.9,3.6L6,788.7l-5-3.6H7.1Z" transform="translate(8 11.7)"></path></g></g>`,
    bank: `<g ${S}><g stroke-width="1.0667" transform="translate(12 12) scale(1.125) translate(-51 -17)"><path d="M50.889 9L43 13.444H59L50.889 9ZM57.771 13.8H44.213V22.689H43.142V25H58.842V22.689H57.772L57.771 13.8ZM48.316 22.689H46.532V16.289C46.532 16.0524 46.626 15.8255 46.7933 15.6583C46.9606 15.491 47.1874 15.397 47.424 15.397C47.6606 15.397 47.8875 15.491 48.0547 15.6583C48.222 15.8255 48.316 16.0524 48.316 16.289V22.689ZM51.884 22.689H50.1V16.289C50.1 16.0524 50.194 15.8255 50.3613 15.6583C50.5285 15.491 50.7554 15.397 50.992 15.397C51.2286 15.397 51.4555 15.491 51.6227 15.6583C51.79 15.8255 51.884 16.0524 51.884 16.289V22.689ZM55.451 22.689H53.668V16.289C53.668 16.0526 53.7619 15.8258 53.9291 15.6586C54.0963 15.4914 54.3231 15.3975 54.5595 15.3975C54.7959 15.3975 55.0227 15.4914 55.1899 15.6586C55.3571 15.8258 55.451 16.0526 55.451 16.289V22.689Z"/></g></g>`,
    peoplePair: `<g ${S}><g stroke-width="1.0666" transform="translate(12 12) scale(1.125) translate(-152.9996 -153)"><path d="M160.998 158.5H156.866C156.866 153.87 154.618 156.071 154.618 152.014C154.59 151.722 154.624 151.426 154.719 151.148C154.814 150.87 154.967 150.615 155.169 150.401C155.37 150.187 155.615 150.019 155.887 149.908C156.159 149.796 156.452 149.744 156.745 149.755C158.512 149.755 159.745 151.492 158.069 154.739C157.519 155.806 158.654 156.059 159.869 156.349C161.084 156.639 160.998 157.3 160.998 158.5ZM154.286 155.794C152.752 155.43 151.325 155.111 152.016 153.769C154.116 149.685 152.574 147.5 150.352 147.5C148.085 147.5 146.577 149.768 148.687 153.769C149.399 155.119 147.918 155.438 146.417 155.794C144.884 156.158 145.002 156.994 145.002 158.5H155.702C155.698 156.99 155.817 156.158 154.284 155.794H154.286Z"/></g></g>`,
    committee: `<g ${S}><g stroke-width="1.0667" transform="translate(12 12) scale(1.125) translate(-119 -51.0002)"><path d="M123.718 46.0547H122.487V43.5337H115.513V46.0547H114.282L111 49.9337H127L123.718 46.0547ZM115.513 48.5757H115.235C115.117 48.5886 114.998 48.5765 114.885 48.5401C114.772 48.5038 114.667 48.4441 114.579 48.3648C114.491 48.2856 114.42 48.1886 114.372 48.0802C114.323 47.9718 114.298 47.8544 114.298 47.7357C114.298 47.617 114.323 47.4996 114.372 47.3912C114.42 47.2828 114.491 47.1858 114.579 47.1066C114.667 47.0273 114.772 46.9676 114.885 46.9312C114.998 46.8949 115.117 46.8828 115.235 46.8957H115.513V48.5757ZM121.667 48.5757H116.333V44.3757H121.667V48.5757ZM122.767 48.5757H122.489V46.8957H122.767C122.885 46.8828 123.004 46.8949 123.117 46.9312C123.23 46.9676 123.335 47.0273 123.423 47.1066C123.511 47.1858 123.582 47.2828 123.63 47.3912C123.679 47.4996 123.704 47.617 123.704 47.7357C123.704 47.8544 123.679 47.9718 123.63 48.0802C123.582 48.1886 123.511 48.2856 123.423 48.3648C123.335 48.4441 123.23 48.5038 123.117 48.5401C123.004 48.5765 122.885 48.5886 122.767 48.5757ZM111 51.0007V58.4667H127V51.0007H111Z"/></g></g>`,
    msgInc: `<g ${S}><g stroke-width="1.0667" transform="translate(12 12) scale(1.125) translate(-51 -85)"><path d="M47.667 87.0005H56.333V87.6665H47.667V87.0005ZM50.333 84.3335V86.3335H53.667V84.3335H50.333ZM49.667 84.3335H47.667V85.0005H49.667V84.3335ZM47.667 86.3335H49.667V85.6665H47.667V86.3335ZM56.333 85.6665H54.333V86.3335H56.333V85.6665ZM51.699 81.2845V81.0205H50.889V82.3145H51.726V82.0505H51.206V81.7805H51.671V81.5185H51.206V81.2845H51.699ZM52.63 81.4585L52.789 82.3145H53.122L53.456 81.0205H53.135L52.969 81.9005L52.81 81.0205H52.482L52.302 81.9205L52.142 81.0205H51.8L52.107 82.3145H52.444L52.63 81.4585ZM53.897 82.0695C53.7892 82.0674 53.6833 82.041 53.587 81.9925L53.571 81.9835L53.505 82.2485L53.515 82.2545C53.6292 82.308 53.7539 82.3351 53.88 82.3335C54.267 82.3335 54.405 82.1145 54.405 81.9265C54.405 81.7385 54.298 81.6265 54.067 81.5365C53.898 81.4725 53.842 81.4365 53.842 81.3715C53.842 81.3065 53.909 81.2645 54.011 81.2645C54.1006 81.2643 54.1891 81.2841 54.27 81.3225L54.285 81.3305L54.357 81.0705L54.347 81.0655C54.2427 81.021 54.1303 80.9988 54.017 81.0005C53.717 81.0005 53.524 81.1595 53.524 81.4005C53.524 81.5755 53.645 81.7005 53.881 81.7875C54.032 81.8415 54.081 81.8875 54.081 81.9525C54.081 82.0175 54.015 82.0695 53.9 82.0695H53.897ZM50.347 82.3145H50.671V81.0205H50.379V81.8135L49.951 81.0205H49.6V82.3145H49.892V81.4335L50.347 82.3145ZM56.333 83.0005H47.667V83.6665H56.333V83.0005ZM56.333 84.3335H54.333V85.0005H56.333V84.3335ZM45 78.3335V89.7995C45.007 89.8473 45.0035 89.8961 44.99 89.9425C44.9764 89.9889 44.953 90.0319 44.9214 90.0685C44.8897 90.105 44.8506 90.1343 44.8066 90.1544C44.7626 90.1746 44.7149 90.1849 44.6665 90.1849C44.6182 90.1849 44.5704 90.1746 44.5264 90.1544C44.4824 90.1343 44.4433 90.105 44.4117 90.0685C44.38 90.0319 44.3566 89.9889 44.343 89.9425C44.3295 89.8961 44.3261 89.8473 44.333 89.7995V79.6665H43V90.3205C43.0003 90.6776 43.1423 91.0199 43.3949 91.2723C43.6474 91.5247 43.9899 91.6665 44.347 91.6665H57.652C57.8289 91.6668 58.0042 91.6321 58.1677 91.5646C58.3312 91.4971 58.4799 91.398 58.6051 91.273C58.7303 91.148 58.8296 90.9995 58.8973 90.8361C58.9651 90.6726 59 90.4974 59 90.3205V78.3335H45ZM57.667 89.0005H46.333V79.6665H57.667V89.0005Z"/></g></g>`,
    gun: `<g ${S}><g stroke-width="1.0667" transform="translate(12 12) scale(1.125) translate(-17 -119.45)"><path d="M17,112.4a3.069,3.069,0,0,0-.5-1.3q-.45-.75-1.2-1.8a6,6,0,0,1-.7-2,2.979,2.979,0,0,1-.1-1.3,1.014,1.014,0,0,1,.7-.6c.2,0,.5,0,.5-.1s.1-.3,0-.3a.349.349,0,0,0-.1-.2v-1.4a.2.2,0,0,0-.2-.2h-.5l-.1-.3h-.2l-.1.3H9.8l-.1.1H7.5a.1.1,0,0,0-.1-.1H1.9s0-.2-.1-.2-.2.2-.2.2H1.3c-.2,0-.2.4-.2.4a.1.1,0,0,0-.1.1v.9a.1.1,0,0,0,.1.1v.8a1.165,1.165,0,0,0,.2.7,3.73,3.73,0,0,0,1.2.2h.7c.5,0,2,.1,3,.1a.451.451,0,0,1,.3.3v1.1a.758.758,0,0,1-.2.4.367.367,0,0,0,.1.3c.1,0,.2.1.3.1a26.153,26.153,0,0,0,2.8,0c.2,0,.5-.3.7-.3a.749.749,0,0,1,.5.1c.1.3.4.8.4.9a4.331,4.331,0,0,0-.1.5c.1.1.3.1.3.2a4.875,4.875,0,0,1,.3.7c0,.1-.1.4-.1.5.1.1.3.1.3.3.1.2.3.7.4.9v.6c.1.2.2.2.2.2v.3c0,.1.1.2.3.2h2.9c.1,0,.2-.3.3-.3v-.1a1.007,1.007,0,0,1,.3-.1.887.887,0,0,0,.5-.4C17,112.8,17,112.7,17,112.4Zm-7.5-4.2h-2a.467.467,0,0,1-.5-.5c0-.1-.1-.7.1-.9a1.185,1.185,0,0,1,.7-.4c.4,0,1.2.1,1.2.1a.8.8,0,0,1-.4,1.2c-.2.1-.1.4.1.3a3.942,3.942,0,0,0,1.4-1s.4,1-.6,1.2Z" transform="translate(8 11.1)"></path></g></g>`,
    bunker: `<g ${S}><g stroke-width="1.2" transform="translate(12 12) scale(1) translate(-9.5 -8.5)"><path d="M-3917-4042h-3v-7a9.01,9.01,0,0,1,9-9,9.01,9.01,0,0,1,9,9v7h-3v-7a6.006,6.006,0,0,0-6-6,6.007,6.007,0,0,0-6,6v7Zm11,0h-10v-7a5.006,5.006,0,0,1,5-5,5.006,5.006,0,0,1,5,5v7Zm-8-6v1h6v-1Zm0-2v1h6v-1Z" transform="translate(3920.5 4058.5)"/></g></g>`,
    bag: `<g ${S}><g stroke-width="1.0667" transform="translate(12 12) scale(1.125) translate(-16.65 -832)"><path d="M14,817.7H11.3v-2A2.689,2.689,0,0,0,8.6,813,2.606,2.606,0,0,0,6,815.7v2H3.3L2,829H15.3Zm-7.3-2a2,2,0,0,1,4,0v2h-4ZM6,819v1a.265.265,0,0,0,.3.3.265.265,0,0,0,.3-.3v-1h4v1a.3.3,0,0,0,.6,0v-1h1.5l.3,2.7H4.2l.3-2.7Z" transform="translate(8 11)"></path></g></g>`,
    biohazard: `<g ${S}><g stroke-width="1.0661" transform="translate(12 12) scale(1.1255) translate(-17.0001 -526.3875)"><path d="M13.177,513.889A4.441,4.441,0,0,0,10.383,508v.3a3.046,3.046,0,0,1,1.4,4.392,3.329,3.329,0,0,1-4.392,1.2,3.144,3.144,0,0,1-1.2-4.292,3.477,3.477,0,0,1,1.4-1.3V508a4.325,4.325,0,0,0-2.6,2,4.264,4.264,0,0,0-.3,3.793A4.368,4.368,0,0,0,1,519.08l.3-.1a3.094,3.094,0,0,1,3.194-3.394,3.153,3.153,0,0,1,3.194,3.194,3.216,3.216,0,0,1-3.194,3.194,3.288,3.288,0,0,1-1.9-.6l-.3.2a4.758,4.758,0,0,0,3.094,1.2,4.258,4.258,0,0,0,3.494-1.7,4.553,4.553,0,0,0,3.494,1.7,4.758,4.758,0,0,0,3.094-1.2l-.3-.2a3.071,3.071,0,0,1-1.9.6,3.153,3.153,0,0,1-3.194-3.194,3.2,3.2,0,1,1,6.388.2l.3.1a4.212,4.212,0,0,0-3.593-5.19Zm-4.192,3.294a.943.943,0,0,1-1-1,1,1,0,0,1,1-1,.943.943,0,0,1,1,1,1,1,0,0,1-1,1Zm0-4.691a3.589,3.589,0,0,0-1.1.2,1.9,1.9,0,0,1-.7-1.1,5.653,5.653,0,0,1,1.8-.3,5.22,5.22,0,0,1,1.8.3,1.44,1.44,0,0,1-.7,1.1,1.973,1.973,0,0,0-1.1-.2Zm-2.6,6.288a1.757,1.757,0,0,1-.6,1.3,5,5,0,0,1-1.9-3.094,2.29,2.29,0,0,1,1.4.1,4.173,4.173,0,0,0,1.1,1.7Zm5.69,1.3a2.613,2.613,0,0,1-.6-1.3,3.662,3.662,0,0,0,1-1.7,1.716,1.716,0,0,1,1.4-.1,4.548,4.548,0,0,1-1.8,3.094Z" transform="translate(8.11 11)"></path></g></g>`,
    car: `<g ${S}><g stroke-width="1.0667" transform="translate(12 12) scale(1.125) translate(-16.9975 -697.0038)"><path d="M17.695,682.7a.265.265,0,0,1,.3.3v.3c0,.5-.6.7-1.1.7l-.7-1.3Zm-1,2.3a5.024,5.024,0,0,1,.6,2.4,7.208,7.208,0,0,1-.7,2.7v1.2a.684.684,0,0,1-.7.7h-1a.684.684,0,0,1-.7-.7v-.7H5.7v.7a.684.684,0,0,1-.7.7H4a.684.684,0,0,1-.7-.7v-1.2a6.764,6.764,0,0,1-.7-2.7,4.749,4.749,0,0,1,.6-2.4c.6-1,1.2-2.3,2-3.5.6-.9.8-1.1,1.5-1.3a15.667,15.667,0,0,1,3.2-.2,28.816,28.816,0,0,1,3.2.2c.7.1,1,.3,1.5,1.3a23.057,23.057,0,0,1,2.1,3.5ZM6,687a.945.945,0,0,0-1-1,1,1,0,1,0,0,2,.945.945,0,0,0,1-1Zm6.7.7a.265.265,0,0,0-.3-.3H7.7a.3.3,0,1,0,0,.6h4.7a.319.319,0,0,0,.3-.3Zm1.9-3.7a14.56,14.56,0,0,0-1.1-2.1.918.918,0,0,0-.6-.4,14.639,14.639,0,0,0-3-.2,28.315,28.315,0,0,0-3,.2c-.2,0-.4.2-.6.4A14.563,14.563,0,0,0,5.2,684a29.453,29.453,0,0,0,4.6.3,32.289,32.289,0,0,0,4.8-.3Zm1.4,3a1,1,0,1,0-1,1,.945.945,0,0,0,1-1ZM3.8,682.7H2.3a.265.265,0,0,0-.3.3v.3c0,.5.6.7,1.1.7Z" transform="translate(7 11.01)"></path></g></g>`,
    estate: `<g ${S}><g stroke-width="1.2" transform="translate(12 12) scale(1) translate(-85 -289)"><path d="M94 285.58V282.82H81.58V280H78.821V282.82H76V285.58H78.821V298H81.58V285.58H84.341V286.961H82.96V293.861H92.621V286.961H91.241V285.58H94ZM89.861 286.961H85.72V285.58H89.861V286.961Z"/></g></g>`,
    gem: `<g ${S}><g stroke-width="1.0667" transform="translate(12 12) scale(1.125) translate(-17 -494.35)"><path d="M12,476H4.1L0,480.7l8,10,8-9.9Zm-2.3,5.3L8,486.6l-1.7-5.2H9.7Zm-3-1.3L8,478.4,9.3,480Zm3.7-.7-1.6-2H11Zm-4.8,0L5,477.4H7.2Zm-1.2.7H2.3l1.5-1.7Zm.5,1.3,1.9,5.6-4.5-5.6Zm6.2,0h2.6L9.3,487Zm.5-1.3.6-1.7,1.5,1.7Z" transform="translate(9 11)"></path></g></g>`,
    basketball: `<g ${S}><g stroke-width="1.0667" transform="translate(12 12) scale(1.125) translate(-85 -357)"><path d="M85.592 364.982C87.3627 364.857 89.0405 364.143 90.357 362.952L87.574 360.171C86.3796 361.499 85.6796 363.198 85.592 364.982ZM90.962 362.347C92.1447 361.031 92.8554 359.358 92.982 357.593C91.203 357.68 89.5081 358.377 88.182 359.566L90.962 362.347ZM87.573 358.959C89.0662 357.606 90.9865 356.819 93 356.735C92.9413 354.852 92.2179 353.051 90.958 351.65L85.609 357L87.573 358.959ZM85 357.6L79.644 362.953C81.0439 364.218 82.8481 364.944 84.734 365C84.8185 362.982 85.6088 361.058 86.967 359.564L85 357.6ZM84.336 349.022C82.5938 349.16 80.946 349.87 79.648 351.04L82.364 353.755C83.5406 352.448 84.2375 350.78 84.34 349.024L84.336 349.022ZM85 356.389L90.348 351.043C88.9327 349.766 87.1056 349.041 85.2 349C85.103 350.992 84.3168 352.888 82.976 354.364L85 356.389ZM79.042 351.645C77.8709 352.945 77.1603 354.595 77.02 356.339C78.7783 356.236 80.4493 355.539 81.759 354.361L79.042 351.645ZM82.366 354.968C80.8896 356.311 78.9931 357.1 77 357.2C77.0437 359.105 77.7681 360.932 79.042 362.35L84.4 357L82.366 354.968Z"/></g></g>`,
    pawn: `<g ${S}><g stroke-width="1.2" transform="translate(12 12) scale(1) translate(-85 -391)"><path d="M82.428 397.429C82.4282 396.747 82.6994 396.093 83.1817 395.611C83.664 395.129 84.318 394.858 85 394.858C85.6819 394.858 86.3358 395.129 86.818 395.611C87.3001 396.093 87.571 396.747 87.571 397.429C87.571 398.111 87.3001 398.765 86.818 399.247C86.3358 399.729 85.6819 400 85 400C84.318 400 83.664 399.729 83.1817 399.247C82.6994 398.765 82.4282 398.111 82.428 397.429ZM88.857 393.572C88.857 392.89 89.128 392.236 89.6104 391.753C90.0927 391.271 90.7469 391 91.429 391C91.4278 389.74 91.0569 388.508 90.3622 387.457C89.6676 386.405 88.6797 385.581 87.521 385.086C87.4021 385.667 87.0862 386.189 86.6269 386.564C86.1675 386.938 85.5929 387.143 85 387.143C84.4073 387.143 83.8327 386.939 83.3734 386.564C82.914 386.189 82.5981 385.668 82.479 385.087C81.3205 385.582 80.3327 386.406 79.6381 387.457C78.9434 388.508 78.5724 389.74 78.571 391C79.2529 391 79.9069 391.271 80.389 391.754C80.8712 392.236 81.142 392.89 81.142 393.572C81.1418 394.254 80.8708 394.908 80.3887 395.39C79.9066 395.872 79.2528 396.143 78.571 396.143C77.8892 396.143 77.2354 395.872 76.7533 395.39C76.2712 394.908 76.0003 394.254 76 393.572C75.9999 393.119 76.1194 392.674 76.3464 392.282C76.5735 391.89 76.9001 391.565 77.293 391.34C77.2884 391.227 77.286 391.114 77.286 391C77.288 389.377 77.801 387.795 78.7523 386.48C79.7036 385.165 81.0449 384.182 82.586 383.672C82.7698 383.18 83.0996 382.757 83.5311 382.458C83.9626 382.159 84.4751 381.999 85 382C85.5239 382 86.0354 382.16 86.4659 382.459C86.8964 382.757 87.2255 383.18 87.409 383.671C88.9503 384.181 90.2918 385.164 91.2432 386.479C92.1945 387.795 92.7074 389.376 92.709 391C92.709 391.113 92.7067 391.227 92.702 391.34C93.096 391.565 93.4235 391.889 93.6515 392.281C93.8794 392.673 93.9997 393.119 94 393.572C94 394.254 93.7291 394.908 93.2469 395.39C92.7648 395.872 92.1109 396.143 91.429 396.143C90.7471 396.143 90.0932 395.872 89.611 395.39C89.1289 394.908 88.857 394.254 88.857 393.572ZM86.283 393.917C85.8935 393.69 85.4507 393.571 85 393.571C84.5495 393.571 84.107 393.69 83.717 393.915V388.085C84.108 388.311 84.5516 388.429 85.003 388.429C85.4544 388.429 85.8978 388.31 86.289 388.085V393.918L86.283 393.917Z"/></g></g>`,
    pharmacy: `<g ${S}><g stroke-width="1.2571" transform="translate(12 12) scale(0.9546) translate(-85 -424.9995)"><path d="M79.5 425C79.5 422.725 80.294 422.208 82.643 419.5H87.357C89.774 422.289 90.5 422.708 90.5 425V432.857C90.5 433.274 90.3345 433.674 90.0399 433.968C89.7452 434.263 89.3457 434.428 88.929 434.428H81.071C80.6543 434.428 80.2548 434.263 79.9601 433.968C79.6655 433.674 79.5 433.274 79.5 432.857V425ZM88.929 425H81.071V431.286H88.928L88.929 425ZM85.786 427.357H87.357V428.928H85.786V430.499H84.214V428.928H82.643V427.357H84.214V425.786H85.785L85.786 427.357ZM88.143 418.714H81.857V416.357C81.857 416.149 81.9398 415.949 82.0872 415.801C82.2346 415.654 82.4345 415.571 82.643 415.571H87.357C87.5655 415.571 87.7654 415.654 87.9128 415.801C88.0602 415.949 88.143 416.149 88.143 416.357V418.714Z"/></g></g>`,
    parcel: `<g ${S}><g stroke-width="1.0667" transform="translate(12 12) scale(1.125) translate(-17 -595)"><path d="M12.81,582.2l-2.19,1.3-6.857-4.2,2.19-1.3Zm1.333-.8,2.19-1.2L9.19,576l-2,1.2Zm-4.19,3.2L3,580.3v7.3l6.952,4.2ZM17,581.4v7.2L11.286,592v-7.4Z" transform="translate(7 11)"></path></g></g>`,
    palette: `<g ${S}><g stroke-width="1.0667" transform="translate(12 12) scale(1.125) translate(-85.0001 -662.9995)"><path d="M82.9987 664.323C83.0004 664.587 82.9241 664.844 82.7794 665.064C82.6347 665.284 82.4281 665.456 82.1856 665.559C81.9431 665.662 81.6757 665.69 81.4171 665.641C81.1585 665.591 80.9203 665.466 80.7326 665.282C80.5449 665.097 80.4162 664.861 80.3626 664.603C80.309 664.346 80.333 664.078 80.4315 663.834C80.5301 663.589 80.6988 663.38 80.9163 663.232C81.1338 663.083 81.3904 663.003 81.6537 663C81.8289 662.999 82.0028 663.031 82.1653 663.097C82.3278 663.163 82.4758 663.26 82.6008 663.383C82.7257 663.506 82.8252 663.652 82.8935 663.813C82.9617 663.975 82.9975 664.148 82.9987 664.323ZM82.3447 661.666C82.081 661.669 81.8225 661.593 81.602 661.448C81.3815 661.304 81.2088 661.097 81.1057 660.854C81.0027 660.612 80.9739 660.344 81.0231 660.085C81.0723 659.826 81.1972 659.587 81.382 659.399C81.5669 659.211 81.8033 659.082 82.0615 659.028C82.3197 658.975 82.5879 658.999 82.8324 659.098C83.0768 659.196 83.2865 659.366 83.4348 659.584C83.5831 659.802 83.6635 660.059 83.6657 660.322C83.6686 660.676 83.5311 661.016 83.2834 661.268C83.0357 661.52 82.698 661.663 82.3447 661.666ZM87.6657 658.99C87.6678 659.254 87.5918 659.512 87.4471 659.733C87.3025 659.953 87.0957 660.126 86.853 660.229C86.6102 660.331 86.3424 660.36 86.0834 660.311C85.8245 660.261 85.5859 660.136 85.3979 659.952C85.21 659.767 85.0811 659.53 85.0275 659.272C84.9739 659.014 84.9981 658.746 85.097 658.501C85.1959 658.257 85.365 658.047 85.583 657.899C85.801 657.751 86.058 657.67 86.3217 657.668C86.675 657.666 87.0147 657.804 87.2666 658.052C87.5185 658.3 87.662 658.637 87.6657 658.99ZM79.6657 669.555C82.7237 669.808 81.6287 666.56 84.4577 666.53L85.6827 667.553C85.9877 671.244 81.4727 672.067 79.6657 669.554V669.555ZM89.0427 664.812C89.9937 663.319 92.9427 658.312 92.9427 658.312C92.9924 658.225 93.0098 658.122 92.9918 658.023C92.9738 657.924 92.9215 657.834 92.8441 657.77C92.7667 657.705 92.6691 657.67 92.5683 657.67C92.4675 657.67 92.3699 657.706 92.2927 657.77C92.2927 657.77 87.9077 661.58 86.6157 662.787C85.5987 663.742 85.5897 664.178 85.2587 665.752L86.3787 666.685C87.8637 666.075 88.2907 665.992 89.0417 664.811L89.0427 664.812ZM80.6277 668.012C79.6067 667.126 78.8801 665.949 78.5446 664.639C78.209 663.33 78.2805 661.949 78.7494 660.68C79.2183 659.412 80.0625 658.317 81.1694 657.541C82.2764 656.764 83.5936 656.343 84.9457 656.334C87.5047 656.32 89.2647 657.604 89.2767 658.634L90.3857 657.663C89.7117 656.179 87.5987 654.964 84.9337 655C83.4156 655.013 81.9326 655.458 80.6578 656.282C79.383 657.106 78.369 658.276 77.7343 659.655C77.0996 661.034 76.8703 662.565 77.0733 664.07C77.2763 665.574 77.9032 666.99 78.8807 668.151C79.1524 668.305 79.4637 668.374 79.7749 668.35C80.0861 668.326 80.383 668.209 80.6277 668.015V668.012ZM89.1587 666.741C89.8647 668.054 88.2587 668.988 86.7957 669.402C86.6071 669.977 86.2944 670.503 85.8797 670.943C89.3797 670.549 91.9207 668.074 90.0567 665.684C89.8053 666.075 89.5026 666.431 89.1567 666.741H89.1587Z"/></g></g>`,
    recycle: `<g ${S}><g stroke-width="1.0667" transform="translate(12 12) scale(1.125) translate(-85 -629)"><path d="M78.077 628.583L77.053 627.926L80.653 627.514L81.935 630.863L80.923 630.222C79.935 631.822 79.023 633.699 79.604 635.486C77.935 634.071 77 632.984 77 631.671C77.1359 630.577 77.5031 629.524 78.077 628.583ZM80.777 632.333C80.275 633.143 80.0965 634.112 80.277 635.047C80.314 635.222 80.4102 635.38 80.5496 635.492C80.6889 635.605 80.8628 635.666 81.042 635.666H84.333V632.333H80.777ZM87.914 635.784V637L85.672 634.158L87.919 631.3V632.5C89.801 632.5 91.784 632.278 93 630.847C92.677 633.011 92.246 634.379 91.13 635.071C90.1217 635.532 89.0276 635.775 87.919 635.784H87.914ZM89.7 631.509C90.6522 631.511 91.5702 631.154 92.271 630.509C92.4006 630.385 92.4837 630.221 92.5063 630.043C92.5289 629.865 92.4896 629.685 92.395 629.533L90.662 626.735L87.829 628.491L89.7 631.509ZM89.075 623.8L90.148 623.227L88.748 626.57L85.2 626.057L86.253 625.486C85.34 623.841 84.147 622.134 82.3 621.764C83.3029 621.33 84.3727 621.072 85.463 621C86.955 621 87.823 621.843 89.076 623.8H89.075ZM84.482 624.33C84.021 623.497 83.263 622.868 82.359 622.568C82.1879 622.515 82.0037 622.522 81.8373 622.588C81.6709 622.655 81.5324 622.777 81.445 622.933L79.839 625.8L82.749 627.431L84.482 624.33Z"/></g></g>`,
    plug: `<g ${S}><g stroke-width="1.0669" transform="translate(12 12) scale(1.1247) translate(-17.0019 -459.0006)"><path d="M15.8,453.911l-2.385-2.385a16.559,16.559,0,0,0,.5-3.875,8.048,8.048,0,0,0-1.391-4.968.5.5,0,0,0-.6,0l-9.34,9.34a.365.365,0,0,0-.1.3c0,.1.1.2.1.3,2.583,2.385,8.346,1.093,8.843.994L13.811,456a.5.5,0,0,0,.6,0l1.49-1.49a.365.365,0,0,0,.1-.3C15.9,454.11,15.9,454.011,15.8,453.911ZM3.875,449.539l.994-.994a.5.5,0,0,0,0-.6l-2.981-2.981a1.128,1.128,0,0,0-.795-.3,1.129,1.129,0,0,0-.795.3,1.209,1.209,0,0,0,0,1.59l2.981,2.981a.373.373,0,0,0,.6,0Zm4.074-4.571a.365.365,0,0,0,.3.1.365.365,0,0,0,.3-.1l.994-.994a.5.5,0,0,0,0-.6L6.558,440.4a1.207,1.207,0,0,0-1.59,0,1.209,1.209,0,0,0,0,1.59Z" transform="translate(9 10.9)"></path></g></g>`,
    slots: `<g ${S}><g stroke-width="1.5" transform="translate(2.9 3.2) scale(1.32)"><path d="m0,0h1.77c0,.65.23.98.69.98l3.36-.98h.4c1.37.27,2.72.63,4.05,1.08h.29c.71-.04,1.35-.45,1.68-1.08h1.77v.29c0,1.58-1.05,3.2-3.15,4.84-.24.53-.37,1.1-.4,1.68v.2l.09.09v.09c-1.31.62-1.97,1.21-1.97,1.78v.49l.59,1.97c0,1.23-.96,1.96-2.87,2.18h-.4c-1.72,0-2.7-.73-2.95-2.18v-.09c.07-1.04.27-2.06.58-3.05l-.09-.7c1.68-1.12,3.42-2.14,5.22-3.05l.5-.69c0-.59-.79-.89-2.37-.89l-2.27-.8h-.1c-.93.04-1.72.68-1.97,1.57l-.09.5H0V0Z"/></g></g>`,
    roulette: `<g ${S}><g stroke-width="1.0667" transform="translate(12 12) scale(1.125) translate(-8 -6.975)"><path d="m12.07,3.49c.48,0,.87.39.87.87,0,.48-.39.87-.87.87-.48,0-.87-.39-.87-.87,0-.23.09-.45.26-.62.16-.16.39-.26.62-.26Zm-1.42.58c-.04.19-.04.39,0,.58h-1.48v-.58h1.48ZM6.55,1.46C6.55.65,7.2,0,8,0s1.46.65,1.46,1.45c0,.8-.65,1.46-1.45,1.46-.39,0-.76-.15-1.03-.43-.27-.27-.43-.64-.43-1.03m-2.62,3.78c-.48,0-.87-.39-.87-.87,0-.48.39-.87.87-.87.48,0,.87.39.87.87,0,.23-.09.45-.26.62-.16.16-.38.25-.62.26h0Zm1.42-.58c.04-.19.04-.39,0-.58h1.48v.58h-1.48Zm7.59,9.3H3.06v-1.16h9.88v1.16Zm3.06-4.07l-.93,2.32H.93l-.93-2.32h16Zm-3.95-.58H3.95l1.86-2.32h4.37l1.86,2.32Zm-4.63-2.91v-2.99c.38.11.78.11,1.16,0v2.99h-1.16Z"/></g></g>`,
    highlow: `<g ${S}><g stroke-width="1.0667" transform="translate(12 12) scale(1.125) translate(-8 -7.5)"><path d="M4.5,1,0,6.38H3.28v7H5.72v-7H9Zm8.22,7.38v-7H10.28v7H7L11.5,14,16,8.38Z"/></g></g>`,
    keno: `<g ${S}><g stroke-width="1.0667" transform="translate(12 12) scale(1.125) translate(-8 -8)"><path d="m8.21,5.81l2.2,2.2-2.91.66.71-2.86Zm7.79-3.38l-4.84,4.9-2.27-2.27L13.73.17l2.27,2.27Zm-4,5.94v.65c0,2.74-4,1.64-4,1.64,0,0,1.01,4-1.76,4H1.33V1.33h9.37l1.32-1.33H0v16h6.79c2.11,0,6.54-4.82,6.54-6.41v-2.56l-1.33,1.35Z"/></g></g>`,
    craps: `<g ${S}><g stroke-width="1.1716" transform="translate(12 12) scale(1.0243) translate(-8.7343 -8.7857)"><path d="m4.64,17.31L.26,12.94c-.35-.35-.35-.93,0-1.28l4.38-4.38c.35-.35.93-.35,1.28,0l4.37,4.38c.35.35.36.92,0,1.27,0,0,0,0,0,0l-4.37,4.38c-.35.35-.93.35-1.28,0Zm-.13-2.87c-.44.44-.43,1.15,0,1.58s1.15.43,1.58,0c.44-.44.43-1.15,0-1.58-.21-.21-.49-.33-.79-.33-.3,0-.58.12-.79.33h0Zm2.92-2.92c-.44.44-.43,1.15,0,1.58s1.15.43,1.58,0c.44-.44.43-1.15,0-1.58-.21-.21-.49-.33-.79-.33-.3,0-.58.12-.79.33h0Zm-2.95-.02c-.44.44-.44,1.15,0,1.58.44.44,1.15.44,1.59,0s.44-1.15,0-1.59c-.21-.21-.5-.33-.79-.33-.3,0-.58.12-.79.33h0Zm-2.95-.02c-.44.44-.45,1.15,0,1.6.44.44,1.15.44,1.6,0,.44-.44.45-1.15,0-1.59-.21-.21-.5-.33-.8-.33-.3,0-.58.12-.79.33h0Zm2.92-2.93c-.44.44-.45,1.15,0,1.6.44.44,1.15.44,1.6,0,.44-.44.45-1.15,0-1.59-.21-.21-.5-.33-.8-.33-.3,0-.58.12-.79.33h0Zm5.95,1.25l-3.09-5.36c-.25-.43-.11-.98.32-1.23,0,0,0,0,0,0L13.01.12c.43-.25.99-.1,1.24.33l3.1,5.36c.25.43.1.99-.33,1.24l-5.36,3.09c-.14.08-.29.12-.45.12-.33,0-.63-.17-.79-.45h0Zm.61-2.8c-.54.31-.72,1-.41,1.53s1,.72,1.53.41.72-1,.41-1.53c-.2-.35-.57-.56-.97-.56-.2,0-.39.05-.56.15h0Zm3.58-2.06c-.53.31-.71,1-.4,1.53s1,.71,1.53.4c.53-.31.71-1,.4-1.53-.2-.34-.57-.55-.97-.55-.2,0-.39.05-.56.15h0Zm-2.84-.78c-.54.31-.72,1-.41,1.53.31.54,1,.72,1.53.41.54-.31.72-1,.41-1.53-.2-.35-.57-.56-.97-.56-.2,0-.39.05-.56.15h0Zm-2.84-.78c-.54.31-.72,1-.42,1.54.31.54,1,.72,1.54.42.54-.31.72-1,.42-1.54-.2-.35-.57-.56-.97-.56-.2,0-.39.05-.57.15h0Zm3.58-2.06c-.54.31-.72,1-.41,1.53.31.54,1,.72,1.53.41.54-.31.72-1,.41-1.53-.2-.35-.57-.56-.97-.56-.2,0-.39.05-.56.15h0Z"/></g></g>`,
    bookie: `<g ${S}><g stroke-width="0.9347" transform="translate(12 12) scale(1.2839) translate(-6.485 -7.01)"><path d="m12.9,6.97c-.26-2.56-.72-6.97-.72-6.97l-3.27.36s.32,3,.72,6.92c.47,4.53-6.74,4.46-6.29,0,.39-3.91.72-6.92.72-6.92L.79,0S.33,4.41.07,6.97c-.29,1.89.32,3.8,1.64,5.19,2.7,2.48,6.85,2.48,9.55,0,1.32-1.38,1.93-3.3,1.64-5.19h0Zm-1.52-5.98l.2,1.8-1.48.16-.19-1.8,1.48-.16h0Zm-9.79,0l1.48.16-.19,1.8-1.48-.16.19-1.8Z"/></g></g>`,
    lottery: `<g ${S}><g stroke-width="1.0667" transform="translate(12 12) scale(1.125) translate(-8 -8)"><path d="m8,0c4.42,0,8,3.58,8,8s-3.58,8-8,8S0,12.42,0,8,3.58,0,8,0Zm0,3.33c2.03,0,3.67,1.64,3.67,3.67s-1.64,3.67-3.67,3.67-3.67-1.64-3.67-3.67h0c0-2.02,1.64-3.67,3.67-3.67Zm1.06,3.57c.28-.21.44-.55.43-.9,0-.74-.59-1.34-1.33-1.34-.05,0-.11,0-.16,0-.73-.09-1.4.44-1.48,1.17,0,.05,0,.11,0,.16-.01.35.15.69.43.9-.37.23-.59.64-.58,1.08,0,.82.59,1.35,1.65,1.35s1.65-.53,1.65-1.35c0-.44-.21-.85-.58-1.08Zm-1.06,1.47c-.3.04-.57-.16-.62-.46s.16-.57.46-.62c.05,0,.1,0,.15,0,.3-.04.57.16.62.46s-.16.57-.46.62c-.05,0-.1,0-.15,0Zm0-2.74c.24.02.42.23.4.47-.02.24-.23.42-.47.4-.23-.02-.41-.21-.41-.44,0-.24.18-.43.42-.44.02,0,.03,0,.05,0Z"/></g></g>`,
    spade: `<g ${S}><g stroke-width="1.0673" transform="translate(12 12) scale(1.1243) translate(-6.7658 -8.005)"><path d="m13.36,7.35C12.37,4.24,6.76,0,6.76,0,6.76,0,.93,4.19.18,7.31c-.71,2.92.78,5.42,2.85,5.42,1.77,0,2.41-1.9,2.97-3.27.08.76.29,1.47.28,1.64-.09,2.91-.68,4.48-3.3,4.91h7.54c-2.69-.66-3.11-1.76-3.35-4.91-.01-.15.25-.93.33-1.64.56,1.37,1.17,3.31,3.02,3.27,2.07-.04,3.54-3.16,2.83-5.38Z"/></g></g>`,
    poker: `<g ${S}><g stroke-width="1.0678" transform="translate(12 12) scale(1.1238) translate(-6.405 -8.01)"><path d="m4.01,16.01h8c.39.06.74-.21.8-.6,0-.07,0-.13,0-.2V4.01c.06-.39-.21-.74-.6-.8-.07,0-.13,0-.2,0H4.01c-.39-.06-.74.21-.8.6,0,.07,0,.13,0,.2v11.2c-.06.39.21.74.6.8.07,0,.13,0,.2,0Zm-3.2-3.2h1.44V4.01c0-1.31.52-1.87,1.76-1.87h5.6V.81c.06-.39-.21-.74-.6-.8-.07,0-.13,0-.2,0H.81C.42-.05.06.22,0,.61,0,.67,0,.74,0,.81v11.2c-.06.39.21.74.6.8.07,0,.13,0,.2,0Zm7.2-.31c-1.89-1.78-2.67-2.67-2.67-3.67-.1-.74.42-1.42,1.16-1.52.71-.1,1.37.37,1.51,1.07.15-.73.86-1.2,1.6-1.06.7.14,1.16.8,1.07,1.5,0,1-.78,1.89-2.67,3.67Z"/></g></g>`,
    rroulette: `<g ${S}><g stroke-width="1.067" transform="translate(12 12) scale(1.1246) translate(-7.685 -8)"><path d="m15.36,5.76c-.36-1.24-1.02-2.37-1.91-3.3-1.62.11-3.15-.77-3.87-2.23C8.34-.08,7.03-.08,5.78.23c-.71,1.46-2.24,2.35-3.87,2.23-.89.93-1.55,2.06-1.91,3.3.91,1.35.91,3.12,0,4.47.36,1.24,1.02,2.37,1.91,3.3,1.62-.11,3.15.77,3.87,2.24,1.25.31,2.56.31,3.81,0,.71-1.46,2.24-2.35,3.87-2.23.89-.93,1.55-2.06,1.91-3.3-.91-1.35-.91-3.12,0-4.47h0Zm-5.08-1.27c.55-.96,1.78-1.28,2.73-.73.96.55,1.28,1.78.73,2.73-.55.96-1.78,1.28-2.73.73,0,0,0,0,0,0-.96-.55-1.28-1.78-.73-2.73Zm-5.2,7c-.55.96-1.78,1.28-2.73.73s-1.28-1.78-.73-2.73c.55-.96,1.78-1.28,2.73-.73,0,0,0,0,0,0,.96.55,1.28,1.78.73,2.73m-1.73-4c-1.1,0-2-.9-2-2s.9-2,2-2,2,.9,2,2-.9,2-2,2m5.33,7.23c-.96.55-2.18.22-2.73-.73-.55-.96-.22-2.18.73-2.73s2.18-.22,2.73.73c0,0,0,0,0,0,.55.96.22,2.18-.73,2.73m-2-6.73c0-.55.45-1,1-1s1,.45,1,1-.45,1-1,1-1-.45-1-1m2-3.27c-.96.55-2.18.22-2.73-.73-.55-.96-.22-2.18.73-2.73.96-.55,2.18-.22,2.73.73h0c.55.96.22,2.18-.73,2.73m3.33,7.77c-1.1,0-2-.9-2-2s.9-2,2-2,2,.9,2,2-.9,2-2,2"/></g></g>`,
    spinWheel: `<g ${S}><g stroke-width="1.067" transform="translate(12 12) scale(1.1246) translate(-7.3352 -8.009)"><path d="m12.35,12.68l.96,2.99c.04.14-.03.28-.17.33-.09.03-.19,0-.26-.06l-2.17-2.09c-2.12,1.11-4.65,1.11-6.77,0l-2.17,2.09c-.1.1-.27.09-.37-.01-.06-.07-.09-.17-.06-.26l.96-2.99C-.64,9.91-.79,5.27,1.99,2.32c2.77-2.95,7.41-3.1,10.37-.33,2.95,2.77,3.1,7.41.33,10.37-.11.11-.22.22-.33.33Zm-5.02.66c3.31,0,6-2.69,6-6S10.65,1.34,7.33,1.34,1.33,4.03,1.33,7.34c0,3.31,2.69,6,6,6Zm4.67-6c0,2.58-2.09,4.67-4.67,4.67s-4.67-2.09-4.67-4.67c0-2.58,2.09-4.67,4.67-4.67h0c2.58,0,4.67,2.09,4.67,4.67h0Z"/></g></g>`,
    candy: `<g ${S}><g stroke-width="1.0867" transform="translate(12 12) scale(1.1043) translate(-17 -289.15)"><path d="M17.2,272.8c-.5-.5-.8-.2-1.3-.8-.5-.5-.2-.8-.8-1.3-.5-.5-.8-.2-1.3-.8l-.7,2.7a7,7,0,0,1,2.1,2.1L18,274C17.5,273.5,17.8,273.3,17.2,272.8ZM4.7,281.3,2,282c.5.5.2.8.8,1.3.5.5.8.2,1.3.8.5.5.2.8.8,1.3.5.5.8.2,1.3.8l.7-2.7a7.649,7.649,0,0,1-2.2-2.2Zm2.9-7.7-.1-.1a5.258,5.258,0,0,0-2.7,4.6,5.164,5.164,0,0,0,5.2,5.2,7.719,7.719,0,0,0,1.5-.2,6.983,6.983,0,0,1-2-4.9,6.585,6.585,0,0,0-1.9-4.6Zm2.4-.8a7.716,7.716,0,0,0-1.5.2,6.983,6.983,0,0,1,2,4.9,6.536,6.536,0,0,0,1.9,4.5l.1.1a5.258,5.258,0,0,0,2.7-4.6,5.143,5.143,0,0,0-5.2-5.1Z" transform="translate(7 11.1)"></path></g></g>`,
    jacket: `<g ${S}><g stroke-width="1.0667" transform="translate(12 12) scale(1.125) translate(-85 -561)"><path d="M89 568.999H81V560.999L79 567.904L77 567.389L79.667 555.665L82.188 554.33C81.91 555.662 82.668 557.285 83.199 558.436C83.735 557.967 84.066 557.664 84.999 556.936C85.928 557.665 86.213 557.926 86.799 558.436C87.352 557.236 88.089 555.646 87.811 554.337L90.333 555.671L93 567.389L91 567.876L89.079 560.999L89 568.999ZM83.383 557.566C81.983 554.535 82.683 552.993 84.998 553.001C86.923 553.001 88.213 554.102 86.613 557.566C86.028 557.055 85.171 556.392 84.998 556.259C84.979 556.245 83.4 557.547 83.383 557.566ZM85.009 556.082C85.939 555.803 87.67 553.659 85 553.665C82.33 553.671 84.073 555.818 85 556.085L85.009 556.082Z"/></g></g>`,
    swords: `<g ${S}><g stroke-width="1.0673" transform="translate(12 12) scale(1.1243) translate(-8 -7.995)"><path d="m0,0c2.11,3.71,4.77,7.08,7.88,10l.12.13h0l2.25,2.27c-.65.5-1.32.96-2.03,1.37l.94.94,2.33-2.34c1.43.95,2.64,2.18,3.57,3.63l.94-.94c-1.46-.89-2.69-2.1-3.6-3.55l2.33-2.35-.93-.94c-.37.73-.82,1.43-1.34,2.07-1.52-1.54-2.96-2.99-4.45-4.34h0C5.59,3.66,2.9,1.66,0,0Zm16,0c-2.7,1.55-5.23,3.4-7.53,5.51l.77.73,1.88-1.94.45.45-1.88,1.88.83.8c2.14-2.23,3.98-4.73,5.48-7.44ZM4.83,4.3l6.8,6.84-.45.45-6.8-6.84.45-.45Zm-2.6,3.87l-.94.94,2.33,2.35c-.91,1.46-2.15,2.7-3.62,3.6l.94.94c.91-1.44,2.12-2.67,3.53-3.61l2.33,2.34.94-.94c-.71-.41-1.39-.87-2.03-1.37l1.82-1.84-.83-.88-1.88,1.89-.45-.45,1.88-1.88-.8-.88c-.62.6-1.24,1.22-1.88,1.88-.51-.64-.96-1.34-1.34-2.07v-.02Z"/></g></g>`,
    flag: `<path d="M4 2.5h2.2v19H4z"/><path d="M7.4 3.5H20l-2.8 4.3L20 12.1H7.4z"/>`,
    flask: `<g ${S}><path d="M9 3h6M10.2 3v6.2L4.6 19a1.4 1.4 0 0 0 1.2 2h12.4a1.4 1.4 0 0 0 1.2-2l-5.6-9.8V3"/><path d="M7 15h10"/></g>`,
    deposit: `<path d="M10.9 2.5h2.2v7.6l2.7-2.7 1.6 1.6-5.4 5.4-5.4-5.4 1.6-1.6 2.7 2.7z"/><path d="M3 13.5h4.6l1.8 2.7h5.2l1.8-2.7H21v7H3z"/>`,
    moneyBag: `<g ${S}><path d="M9.3 3h5.4l-1.4 3.3c3 .9 5.2 3.7 5.2 7 0 4-2.9 7.2-6.5 7.2s-6.5-3.2-6.5-7.2c0-3.3 2.2-6.1 5.2-7z"/><path d="M13.7 11.4c-.3-.6-.9-.9-1.7-.9-.9 0-1.7.5-1.7 1.3 0 1.7 3.4.9 3.4 2.7 0 .8-.7 1.4-1.7 1.4-.8 0-1.5-.4-1.8-1M12 9.5v1M12 15.9v1"/></g>`,
    bounty: `<g ${S}><g stroke-width="1.0667" transform="translate(12 12) scale(1.125) translate(-8 -8)"><path d="m8,0C3.58,0,0,3.58,0,8s3.58,8,8,8,8-3.58,8-8C15.99,3.59,12.41.01,8,0Zm6.67,7.33h-1.33c-.3-2.4-2.2-4.3-4.6-4.6v-1.33c3.12.35,5.58,2.81,5.93,5.93Zm-2.73,1.33c-.28,1.68-1.59,2.99-3.27,3.27v-1.93h-1.33v1.93c-1.68-.28-2.99-1.59-3.27-3.27h1.93v-1.33h-1.93c.28-1.68,1.59-2.99,3.27-3.27v1.93h1.33v-1.93c1.68.28,2.99,1.59,3.27,3.27h-1.93v1.33h1.93ZM7.33,1.4v1.33c-2.4.3-4.3,2.2-4.6,4.6h-1.33c.31-3.14,2.79-5.62,5.93-5.93h0ZM1.4,8.67h1.33c.3,2.4,2.2,4.3,4.6,4.6v1.33c-3.16-.26-5.67-2.77-5.93-5.93h0Zm7.27,6v-1.33c2.4-.3,4.3-2.2,4.6-4.6h1.33c-.31,3.14-2.79,5.63-5.93,5.93h0Z"/></g></g>`,
    megaphone: `<g ${S}><g stroke-width="1.0669" transform="translate(12 12) scale(1.1247) translate(-7.9919 -7.3452)"><path d="m8.26.87c-.13-.33.04-.71.38-.83s.71.04.83.38c0,.02.01.03.02.05l3.8,9.52c.12.34-.05.71-.38.83s-.71-.05-.83-.38c0-.01,0-.02-.01-.03-1.72-.47-3.54-.42-5.24.14l1.87,2.9c.16.24.1.56-.14.72-.04.03-.08.05-.13.06l-1.27.42-.27.04c-.24,0-.47-.1-.64-.29l-2.57-2.83c-1.35.52-2.87-.08-3.51-1.38-.12-.3-.18-.62-.18-.95.03-1.07.68-2.03,1.66-2.45C7.36,3.99,8.26.87,8.26.87Zm4.04.61c2.19.92,3.21,3.44,2.29,5.63,0,0,0,0,0,0l.98.42c1.15-2.73-.12-5.88-2.85-7.04l-.42.98Zm-.71,1.68c1.26.53,1.85,1.98,1.32,3.24l.96.41c.75-1.79-.08-3.85-1.87-4.61l-.41.96Z"/></g></g>`,
    archive: `<g ${S}><g stroke-width="1.0667" transform="translate(12 12) scale(1.125) translate(-153 -221)"><path d="M146.2 218.666L145.667 216H160.333L159.8 218.666H158.447L158.707 217.333H147.293L147.569 218.666H146.2ZM158.583 214.666L158.986 213.333H147L147.459 214.666H158.583ZM161 220L159.667 228.667H146.333L145 220H161ZM155.667 222.667C155.667 222.579 155.65 222.493 155.616 222.412C155.583 222.331 155.534 222.257 155.472 222.195C155.41 222.133 155.336 222.084 155.255 222.051C155.174 222.017 155.088 222 155 222H151C150.91 221.997 150.821 222.011 150.737 222.043C150.653 222.075 150.576 222.124 150.512 222.186C150.447 222.248 150.396 222.323 150.36 222.405C150.325 222.488 150.307 222.577 150.307 222.667C150.307 222.756 150.325 222.845 150.36 222.928C150.396 223.01 150.447 223.085 150.512 223.147C150.576 223.209 150.653 223.258 150.737 223.29C150.821 223.322 150.91 223.336 151 223.333H155C155.088 223.333 155.174 223.316 155.255 223.283C155.336 223.249 155.41 223.2 155.472 223.138C155.534 223.076 155.583 223.002 155.616 222.921C155.65 222.84 155.667 222.755 155.667 222.667Z"/></g></g>`,
    forumGlobe: `<g ${S}><g stroke-width="1.3333" transform="translate(12 12) scale(0.9) translate(-10 -10)"><path d="m7.25,16.14C3.07,15.16,0,11.99,0,8.23,0,3.68,4.48,0,10,0s10,3.68,10,8.23c0,3.76-3.07,6.93-7.25,7.91l-2.75,3.86-2.75-3.86ZM1.67,8.23c0,3.42,2.99,5.59,6.58,6.43l1.76,2.46,1.76-2.46c3.55-.83,6.58-2.97,6.58-6.43S14.59,1.67,10,1.67,1.67,4.61,1.67,8.23h0Zm3.33-.23c0-2.76,2.24-5,5-5s5,2.24,5,5-2.24,5-5,5-5-2.24-5-5h0Zm5,4.06c.52-.72.88-1.53,1.07-2.39h-2.13c.19.86.55,1.68,1.07,2.39Zm-1.01-.01c-.44-.73-.75-1.54-.91-2.38h-1.9c.52,1.19,1.56,2.07,2.81,2.38h0Zm2.02,0c1.25-.32,2.29-1.19,2.81-2.37h-1.9c-.16.84-.47,1.64-.91,2.37h0Zm1.03-3.21h2.05c.11-.55.11-1.12,0-1.67h-2.07c.06.55.07,1.11.02,1.67h0Zm-3.23,0h2.4c.05-.55.05-1.11-.02-1.67h-2.35c-.07.55-.08,1.11-.03,1.67h0Zm-2.89,0h2.05c-.05-.55-.04-1.11.02-1.67h-2.07c-.11.55-.11,1.12,0,1.67h0Zm5.96-2.5h1.94c-.53-1.19-1.57-2.07-2.83-2.38.42.74.72,1.55.89,2.38h0Zm-2.91,0h2.05c-.2-.85-.55-1.67-1.03-2.41-.48.74-.82,1.55-1.03,2.41h0Zm-2.79,0h1.94c.18-.84.48-1.64.9-2.39-1.27.31-2.32,1.19-2.84,2.39h0Z"/></g></g>`,
    forumDollar: `<g ${S}><g stroke-width="1.3333" transform="translate(12 12) scale(0.9) translate(-10 -10)"><path d="m7.25,16.14C3.07,15.16,0,11.99,0,8.23,0,3.68,4.48,0,10,0s10,3.68,10,8.23c0,3.76-3.07,6.93-7.25,7.91l-2.75,3.86-2.75-3.86ZM1.67,8.23c0,3.42,2.99,5.59,6.58,6.43l1.76,2.46,1.76-2.46c3.55-.83,6.58-2.97,6.58-6.43S14.59,1.67,10,1.67,1.67,4.61,1.67,8.23h0Zm9.05,3.83s-4.45,0-4.72-5.17c.77,1.88,2.71,3,4.72,2.72v-.95l2.17,2.17-2.17,2.17v-.94Zm-.95-5.67v.94l-2.17-2.17,2.17-2.17v.95s4.39,0,4.72,5.17c-.78-1.87-2.71-2.99-4.72-2.72h0Z"/></g></g>`,
    forumQuestion: `<g ${S}><g stroke-width="1.3333" transform="translate(12 12) scale(0.9) translate(-10 -10)"><path d="m7.25,16.14C3.07,15.16,0,11.99,0,8.23,0,3.68,4.48,0,10,0s10,3.68,10,8.23c0,3.76-3.07,6.93-7.25,7.91l-2.75,3.86-2.75-3.86ZM1.67,8.23c0,3.42,2.99,5.59,6.58,6.43l1.76,2.46,1.76-2.46c3.55-.83,6.58-2.97,6.58-6.43S14.59,1.67,10,1.67,1.67,4.61,1.67,8.23h0Zm7.2,4.73c0-.57.46-1.04,1.04-1.04h0c.57,0,1.04.46,1.04,1.04h0c0,.58-.47,1.04-1.04,1.04-.57,0-1.04-.47-1.04-1.04h0Zm.2-1.88c-.2-1.14.26-2.29,1.17-3,.47-.45.84-.8.79-1.49-.04-.58-.54-1.02-1.12-1-.88,0-1.26.78-1.26,1.74h-1.65c0-2.21,1.26-3.33,2.94-3.33,1.41-.13,2.65.9,2.78,2.31.01.12.01.24,0,.36-.08.96-.53,1.85-1.26,2.47-.56.48-.85,1.21-.77,1.94h-1.64Z"/></g></g>`,
    forumFist: `<g ${S}><g stroke-width="1.3333" transform="translate(12 12) scale(0.9) translate(-10 -10)"><path d="m7.25,16.14C3.06,15.16,0,11.99,0,8.23,0,3.68,4.48,0,10,0s10,3.68,10,8.23c0,3.76-3.07,6.93-7.25,7.91l-2.75,3.86-2.75-3.86ZM1.67,8.23c0,3.42,2.99,5.59,6.58,6.43l1.76,2.47,1.76-2.47c3.55-.83,6.58-2.97,6.58-6.43S14.59,1.67,10,1.67,1.67,4.61,1.67,8.23Zm6.73,4.5v-1.93l-2.39-2.94,1.44-2.19,3.08,1.37-.82.75-2.12-.14v.48l2.53,1.57.34,1.85.82-2.26-1.57-.75h.82v-.75l1.64.75,1.09-.07c-.09.83-.42,1.62-.96,2.26v2h-3.9Zm4.1-5.21l1.09-1.78.41,1.09-1.09.96-.41-.27Zm-1.16-.55l.68-2.46,1.09.55-.96,1.91h-.82Zm-1.44-1.3l.55-2.05,1.16.48-1.09,2.12-.61-.55Zm-2.05-.75l1.16-1.92.96.41-.75,2.12-1.37-.61Z"/></g></g>`,
    forumCase: `<g ${S}><g stroke-width="1.3333" transform="translate(12 12) scale(0.9) translate(-10 -10)"><path d="m7.25,16.14C3.06,15.16,0,11.99,0,8.23,0,3.68,4.48,0,10,0s10,3.68,10,8.23c0,3.76-3.07,6.93-7.25,7.91l-2.75,3.86-2.75-3.86ZM1.67,8.23c0,3.42,2.99,5.59,6.58,6.43l1.76,2.47,1.76-2.47c3.55-.83,6.58-2.97,6.58-6.43S14.59,1.67,10,1.67,1.67,4.61,1.67,8.23Zm4.33,2.44v-5h8v5H6Zm5-5.33v-.5c0-.09-.07-.17-.17-.17h-1.67c-.09,0-.17.08-.17.17v.5h-.67v-.67c0-.37.3-.67.67-.67h2c.37,0,.67.3.67.67v.67h-.67Z"/></g></g>`,
    folder: `<g ${S}><g stroke-width="1.0667" transform="translate(12 12) scale(1.125) translate(-17 -17.65)"><path d="M16.7,13.3H3.3L2,4.7H18Zm.2-10,.4-2H8.7C7.3,1.3,7.3,1.1,6.5,0H2.7l.4,3.3Z" transform="translate(7 11)"></path></g></g>`,
    rifle: `<g ${S}><g stroke-width="1.1348" transform="translate(12 12) scale(1.0575) translate(-16.511 -86.1335)"><path d="M16,72.391V71.2a.263.263,0,0,0-.3-.3H14.314a.263.263,0,0,0-.3.3v.895H6.859v-.6a.263.263,0,0,0-.3-.3h-.3a.263.263,0,0,0-.3.3v.6H4.274v-.3a.263.263,0,0,0-.3-.3h-.5a.263.263,0,0,0-.3.3v.3h-.6v.6h-.6v.3H0v.6H1.988v.3h.6v.6H7.753v1.193H9.145l.3-.3v3.479a.263.263,0,0,0,.3.3h.9a.263.263,0,0,0,.3-.3v-.895a.263.263,0,0,1,.3-.3h.3a.263.263,0,0,0,.3-.3V74.478h2.584l1.69,1.491v1.093a.263.263,0,0,0,.3.3h.3a.263.263,0,0,0,.3-.3v-3.18ZM9.145,75.274H8.051v-.895h.895v.4l-.3.3h.1l.5-.4.1-.3h.2v.6Zm5.765-.8H16v.895Z" transform="translate(8 11.1)"></path></g></g>`,
    knife: `<g ${S}><g stroke-width="1.0664" transform="translate(12 12) scale(1.1253) translate(-17.0057 -50.7982)"><path d="M17.849,32.5A23.155,23.155,0,0,1,11.9,37.057L7.943,40.524l2.08,2.378C15.769,39.237,18.147,35.472,17.849,32.5ZM6.655,40.128a.442.442,0,0,0-.5,0,.436.436,0,0,0-.1.5l.991,1.189L2.3,45.874a1.26,1.26,0,0,0-.1,1.783,1.471,1.471,0,0,0,1.387.4c-.2-.793.4-1.189,1.09-.892l.3-.3c-.2-.793.3-1.288,1.09-.892l.2-.2c-.2-.793.4-1.288,1.09-.892l.2-.2c-.2-.793.4-1.288,1.189-.892l.1-.1.991,1.189a.442.442,0,0,0,.5,0,.436.436,0,0,0,.1-.5Z" transform="translate(7.13 10.5)"></path></g></g>`,
    grenade: `<g ${S}><g stroke-width="1.0669" transform="translate(12 12) scale(1.1247) translate(-16.4999 -222.002)"><path d="M10,215h2v-3H10Zm-4-3a9.427,9.427,0,0,0,.5,3H9v-3Zm4,6.9a3.4,3.4,0,0,0,1,.1,3.4,3.4,0,0,0,1-.1V216H10ZM6.9,216A5.558,5.558,0,0,0,9,218.4V216Zm6.1,2.4a5.493,5.493,0,0,0,2.1-2.4H13Zm2.5-3.4a9.427,9.427,0,0,0,.5-3H13v3Zm.5-4a9.469,9.469,0,0,0-.8-3H13v3Zm-7-3H6.9a9.469,9.469,0,0,0-.8,3h3v-3Zm3,0H10v3h2Zm-4-2v1h6v-2h1v-1H14v-1H8l-2,3Zm-4,3H3v5H4Zm-2-2.5A1.538,1.538,0,0,1,3.5,205a1.5,1.5,0,1,1,0,3A1.538,1.538,0,0,1,2,206.5Zm-1,0a2.476,2.476,0,1,0,.725-1.775A2.476,2.476,0,0,0,1,206.5Z" transform="translate(8 11)"></path></g></g>`,
    shield: `<g ${S}><g stroke-width="1.0667" transform="translate(12 12) scale(1.125) translate(-17 -153)"><path d="M9,137.3a8.33,8.33,0,0,0,3.3,1.2v5.2c0,1.1-.3,1.3-3.3,3.2-3.1-1.9-3.3-2.1-3.3-3.2v-5.2A8.33,8.33,0,0,0,9,137.3Zm6-1.3v7.7c0,3.1-2.1,3.9-6,6.3-3.9-2.4-6-3.2-6-6.3V136c2.3,0,3.8-.1,6-2C11.2,135.9,12.7,136,15,136Zm-1.3,1.3A8.3,8.3,0,0,1,9,135.7a8.064,8.064,0,0,1-4.7,1.6v6.4c0,2,1.1,2.6,4.7,4.7,3.5-2.2,4.7-2.7,4.7-4.7Z" transform="translate(8 11)"></path></g></g>`,
    shirt: `<g ${S}><g stroke-width="1.0667" transform="translate(12 12) scale(1.125) translate(-16.95 -663)"><path d="M14,644H6l-4,3.6L4,650l1.3-.7V660h9.3V649.3l1.3.8,2-2.4Zm-4,3a2.794,2.794,0,0,1-2.7-2.3h5.3A2.609,2.609,0,0,1,10,647Z" transform="translate(7 11)"></path></g></g>`,
    leaf: `<g ${S}><g stroke-width="1.1334" transform="translate(12 12) scale(1.0588) translate(-17 -323.5005)"><path d="M18,313.6a9.391,9.391,0,0,0-5.1,1.8,16.772,16.772,0,0,0,3.3-8.3,16.666,16.666,0,0,0-5.3,8.4A18.287,18.287,0,0,0,10,304a17.881,17.881,0,0,0-.8,11.6,17.92,17.92,0,0,0-5.4-8.5,16.772,16.772,0,0,0,3.3,8.3A9.391,9.391,0,0,0,2,313.6a9.183,9.183,0,0,0,3.8,3.6,4.269,4.269,0,0,0-1.4,1.3s2.8,0,4-1.9c.2,0,.6,1.7.6,1.8v2.1a.472.472,0,0,0,.5.5h.2a.472.472,0,0,0,.5-.5v-2.1s.3-1.7.6-1.8c1.3,1.9,4.6,1.9,4.6,1.9a4.269,4.269,0,0,0-1.4-1.3,8.984,8.984,0,0,0,4-3.6Z" transform="translate(7 11)"></path></g></g>`,
    can: `<g ${S}><g stroke-width="1.0733" transform="translate(12 12) scale(1.118) translate(-17 -255.05)"><path d="M5,251h8V241H5Zm5-9-1.5,3H12l-5,5,2.5-4H6Zm2-5.5H6v.5h6Zm-.5,1.5h-5L5,240h8ZM7,252.6h4l2-.6H5Z" transform="translate(8 10.5)"></path></g></g>`,
    martini: `<g ${S}><g stroke-width="1.0667" transform="translate(12 12) scale(1.125) translate(-16.7 -391)"><path d="M9.5,381.7h0l5.2-6.7h-3l1.4-2.5-.9-.5-1.7,3H3.3l5.2,6.7V387H6.4v1h5.2v-1H9.5Z" transform="translate(7.7 11)"></path></g></g>`,
    booster: `<g ${S}><g stroke-width="1.0667" transform="translate(12 12) scale(1.125) translate(-16.5 -425)"><path d="M5,420v2h7v-2Zm0-3v2h7v-2Zm3.5-11L3,412H5v4h7v-4h2Z" transform="translate(8 11)"></path></g></g>`,
    wand: `<g ${S}><g stroke-width="1.0733" transform="translate(12 12) scale(1.118) translate(-16.05 -358)"><path d="M1,353.1,2.9,355l12.7-12.7-1.9-1.9Zm10.4-9.4,2.4-2.4.9.9-2.4,2.4Zm-2-4.7a2.622,2.622,0,0,1-1.7,1.7,2.622,2.622,0,0,1,1.7,1.7,2.622,2.622,0,0,1,1.7-1.7A2.622,2.622,0,0,1,9.4,339Zm3.1,8.6a3.523,3.523,0,0,1,2.3,2.3,3.523,3.523,0,0,1,2.3-2.3,3.523,3.523,0,0,1-2.3-2.3,3.517,3.517,0,0,1-2.3,2.3ZM7.1,342a1.8,1.8,0,0,1-1.2,1.2,1.8,1.8,0,0,1,1.2,1.2,1.8,1.8,0,0,1,1.2-1.2A1.8,1.8,0,0,1,7.1,342ZM4,340.4a1.981,1.981,0,0,1,1.4,1.4,1.98,1.98,0,0,1,1.4-1.4A1.981,1.981,0,0,1,5.4,339,1.98,1.98,0,0,1,4,340.4Z" transform="translate(7 11)"></path></g></g>`,
    tools: `<g ${S}><g stroke-width="1.0668" transform="translate(12 12) scale(1.1248) translate(-17.0012 -935.0007)"><path d="M15.513,13.162,7.549,5.2a1.8,1.8,0,0,1-.522-1.41A3.508,3.508,0,0,0,3.526,0a3.562,3.562,0,0,0-1,.144L4.636,2.257A2.4,2.4,0,0,1,2.258,4.635L.145,2.522A3.558,3.558,0,0,0,0,3.528a3.511,3.511,0,0,0,3.789,3.5A1.8,1.8,0,0,1,5.2,7.551l7.964,7.963a1.662,1.662,0,1,0,2.351-2.351ZM14.333,15A.667.667,0,1,1,15,14.333.666.666,0,0,1,14.333,15ZM9.043,4.807l3.551-3.545a2,2,0,0,1,2.823,2.823L11.867,7.631ZM6.69,10.927,3.205,14.384a2.2,2.2,0,0,0-.383.516l-.2.387L1.222,16l-.555-.556.683-1.431.387-.2a2.146,2.146,0,0,0,.527-.372L5.748,9.983Z" transform="translate(9 927)"></path></g></g>`,
    materials: `<g ${S}><g stroke-width="1.1997" transform="translate(12 12) scale(1.0002) translate(-17.0019 -968.9251)"><path d="M39.281,167.357l1.557-2.7,0,0a1,1,0,0,0-1.738-1h0l-.007.012-1.551,2.686a1,1,0,0,0,1.738,1m4.666-3.7a1,1,0,0,0-1.37-.367.992.992,0,0,0-.362.357l-.01.018-3.1,5.373a1,1,0,1,0,1.734,1.011l3.116-5.4a1,1,0,0,0-.006-.993m1.188,2.326a1,1,0,0,0-1.37.368l-.006.009-1.546,2.676a1,1,0,1,0,1.734,1.012l1.559-2.7a1,1,0,0,0-.371-1.366m-9.285.705a.808.808,0,0,0-.021-.093.7.7,0,0,0-.029-.094.931.931,0,0,0-.043-.1c-.009-.017-.015-.036-.025-.053l-1.556-2.7c-.008-.013-.018-.027-.027-.04l-.02-.031a.982.982,0,0,0-.244-.243.41.41,0,0,0-.036-.025c-.014-.009-.026-.018-.039-.026s-.035-.016-.053-.025a.928.928,0,0,0-.1-.043.709.709,0,0,0-.094-.029.814.814,0,0,0-.093-.021c-.036-.006-.071-.009-.108-.011-.019,0-.037-.006-.056-.006H30.2c-.037,0-.075,0-.112.007h-.012a1.123,1.123,0,0,0-.17.038l-.04.015a.9.9,0,0,0-.165.074.922.922,0,0,0-.147.106c-.01.009-.021.018-.031.028a.973.973,0,0,0-.118.128l-.006.008a.885.885,0,0,0-.064.1l-1.556,2.7c-.01.017-.016.036-.025.054a1.03,1.03,0,0,0-.043.1c-.011.031-.02.062-.029.093s-.016.062-.021.094a.862.862,0,0,0-.01.106c0,.02-.007.038-.007.059s0,.032,0,.047l0,.043a1,1,0,0,0,.089.333l.017.034c.008.015.014.03.021.044l1.556,2.7c.01.017.024.03.035.047a.915.915,0,0,0,.062.085.67.67,0,0,0,.066.072c.023.023.046.045.071.065a.9.9,0,0,0,.087.063c.017.011.03.024.047.034s.028.014.042.02.027.014.041.02a1,1,0,0,0,.331.089l.042,0c.015,0,.03,0,.046,0h3.112c.011,0,.022,0,.034,0a.86.86,0,0,0,.106-.011.839.839,0,0,0,.092-.016.781.781,0,0,0,.091-.028.643.643,0,0,0,.092-.035.626.626,0,0,0,.086-.046c.027-.016.055-.03.081-.048s.052-.043.078-.064.046-.042.069-.064.04-.048.061-.074a.77.77,0,0,0,.061-.084c.006-.009.015-.017.02-.027l1.556-2.7c.008-.014.013-.029.021-.043l.017-.035a.967.967,0,0,0,.089-.332.306.306,0,0,0,0-.046c0-.015,0-.029,0-.045s0-.037-.006-.056c0-.037-.006-.072-.011-.108m-3.122,1.854H30.777l-.975-1.69.975-1.691h1.952l.976,1.691Zm1.853-8.327a1,1,0,1,0,1.37.368,1,1,0,0,0-1.37-.368m4.114-3.649a1,1,0,1,0-1.371-.368,1.005,1.005,0,0,0,1.371.368m-5.67,2.694a1,1,0,1,0-.367-1.371,1.005,1.005,0,0,0,.367,1.371m5.854-1.371a1,1,0,1,0,1.371-.368,1.005,1.005,0,0,0-1.371.368m-3.8-1.189a1,1,0,1,0-1-1,1,1,0,0,0,1,1m3.111,5.389a1,1,0,1,0-1-1,1,1,0,0,0,1,1m-.686-4.2a1,1,0,1,0-.368,1.371,1.005,1.005,0,0,0,.368-1.371" transform="translate(-19.64 806.3)" fill-rule="evenodd"></path></g></g>`,
    flower: `<g ${S}><g stroke-width="1.0619" transform="translate(12 12) scale(1.1301) translate(-16.5 -560.9658)"><path d="M7.495,14.305A5.951,5.951,0,0,0,0,10.215c1.718,1.022,2.382,6.135,7.495,6.135S13.313,11.238,15,10.215A6.135,6.135,0,0,0,7.495,14.305ZM2.873,8.17a2.045,2.045,0,0,0,2.72.736,2.045,2.045,0,0,0,4,0A2.045,2.045,0,0,0,11.636,5.44a2.045,2.045,0,0,0-2.045-3.4,2.045,2.045,0,0,0-4,0A2.045,2.045,0,0,0,3.548,5.492,2.045,2.045,0,0,0,2.873,8.17ZM7.495,3.743a1.708,1.708,0,1,1-1.7,1.7,1.708,1.708,0,0,1,1.7-1.7Z" transform="translate(9 552.58)"></path></g></g>`,
    bear: `<g ${S}><g stroke-width="1.0422" transform="translate(12 12) scale(1.1514) translate(-16.997 -764.8162)"><path d="M5.737,757.486a2.277,2.277,0,0,0-3.24.687,2.454,2.454,0,0,0,1.374,3.043,2.276,2.276,0,0,0,3.24-.687,2.385,2.385,0,0,0-1.374-3.043Zm10.5.687a2.356,2.356,0,0,0-3.24-.687,2.454,2.454,0,0,0-1.374,3.043,2.356,2.356,0,0,0,3.24.687,2.454,2.454,0,0,0,1.374-3.043ZM5.246,754.05a3.948,3.948,0,0,0-1.178,2.062h.295a4.927,4.927,0,0,1,1.178.2,4.5,4.5,0,0,1,.687-1.374,8.849,8.849,0,0,1-.982-.883Zm8.148,0a8.848,8.848,0,0,1-.982.884,8.917,8.917,0,0,1,.687,1.374,4.933,4.933,0,0,1,1.178-.2h.295a3.948,3.948,0,0,0-1.178-2.062Zm-3.043,5.6a3.023,3.023,0,0,1,.295-1.276,4.05,4.05,0,0,1,1.473-1.669,7.949,7.949,0,0,0-.589-1.276,5.822,5.822,0,0,1-2.258.491,5.819,5.819,0,0,1-2.258-.491,7.949,7.949,0,0,0-.589,1.276A3.465,3.465,0,0,1,7.9,758.369a2.913,2.913,0,0,1,0,2.552.981.981,0,0,1-.393.491,6.414,6.414,0,0,0,3.338,0c-.1-.2-.295-.294-.393-.491,0-.392-.1-.785-.1-1.275Zm-5.4-9.915h.1a2.16,2.16,0,0,0-.1.785,4.281,4.281,0,0,0,3.829,4.319V753.17c-.589-.1-1.08-.491-1.08-.982,0-.589.687-.982,1.571-.982s1.571.491,1.571.982-.491.884-1.08.982v1.669a4.352,4.352,0,0,0,3.829-4.319,1.913,1.913,0,0,0-.1-.785h.1a1.865,1.865,0,0,0,1.865-1.865A1.728,1.728,0,0,0,13.689,746a1.871,1.871,0,0,0-1.669,1.08,4.308,4.308,0,0,0-2.651-.883,4.756,4.756,0,0,0-2.651.883A1.814,1.814,0,0,0,5.05,746a1.865,1.865,0,0,0-1.865,1.865,1.784,1.784,0,0,0,1.767,1.865Zm6.086-.589a.687.687,0,1,1-.687.687.672.672,0,0,1,.687-.687Zm-3.338,0a.687.687,0,1,1-.687.687.672.672,0,0,1,.687-.687Z" transform="translate(7.63 11)"></path></g></g>`,
    pyramid: `<g ${S}><g stroke-width="1" transform="translate(12 12) scale(1.2) translate(-16.5 -731)"><path d="M11,723v-2H8v2Zm2.2-3-1.3-2h-2v2Zm1.9,3-1.3-2H12v2ZM14,726h3l-1.3-2H14Zm-4,0h3v-2H10Zm-4,0H9v-2H6Zm-2.8-2L2,726H5v-2Zm1.9-3-1.3,2H7v-2ZM7,718l-1.3,2H9v-2Zm2.5-4-1.8,3h3.7Z" transform="translate(7 11)"></path></g></g>`,
    books: `<g ${S}><g stroke-width="1.0667" transform="translate(12 12) scale(1.125) translate(-16.5 -867)"><path d="M15.9,850.1V864H18V850.1ZM13.3,864h1.6V848H13.3Zm-5.1,0h4.1V851.7H8.2Zm1-11.2h2.1v2.1H9.2ZM3,864H6.6v-2.7H3Zm0-3.7H6.6v-7.5H3Zm0-8.6H6.6V849H3Z" transform="translate(6 11)"></path></g></g>`,
    staff: `<g ${S}><g stroke-width="1.0667" transform="translate(12 12) scale(1.125) translate(-119 -119)"><path d="M124.882 123.064C122.589 122.535 120.455 122.071 121.489 120.119C124.635 114.177 122.322 111 119 111C115.612 111 113.358 114.3 116.513 120.119C117.577 122.082 115.363 122.546 113.119 123.064C111.133 123.523 111 124.493 111 126.173V127H117.99L118.458 125H119.536L120.005 127H127V126.173C127 124.493 126.868 123.523 124.882 123.064ZM119.395 124.333H118.619L118.012 123H120.012L119.395 124.333Z"/></g></g>`,
    moneyBagTorn: `<g ${S}><g stroke-width="0.6831" transform="translate(12 12) scale(1.7566) translate(-7.5099 -5.1165)"><path d="m8.6,2.68c.38-.24.72-.53,1.02-.87.25-.27.59-.62.55-1.02-.04-.26-.26-.45-.52-.45-.08,0-.17-.01-.25-.01-.06,0-.17-.01-.21.03-.09.09-.18.18-.27.27-.02-.06-.04-.12-.06-.19-.01-.03-.05-.05-.08-.05-.25.06-.51.07-.76.04-.31-.06-.62-.15-.93-.22-.03,0-.07.01-.08.05l-.07.24c-.11-.11-.22-.22-.33-.33-.03-.03-.06-.08-.1-.09l-.22-.04c-.12-.02-.23-.03-.35-.04-.26-.02-.72-.02-.73.33-.01.57.49,1.03.85,1.41.25.24.47.51.64.82-1.81.78-2.98,2.58-2.95,4.56,0,2.45,1.15,3.12,3.76,3.12s3.76-.67,3.76-3.12c.02-1.86-1.01-3.58-2.66-4.45Zm-.15,3.68h0l.07.06-.06-.05h0Zm.15,1.12c-.1.14-.23.26-.38.34-.08.04-.16.07-.25.1l-.12.03v.32c.02.15-.04.3-.16.39-.15.1-.35.07-.46-.07-.07-.11-.09-.23-.08-.35v-.28l-.09-.03c-.05-.01-.1-.03-.15-.05l-.09-.03s-.04.03-.07.04c-.04.02-.08.03-.12.04-.17.02-.32-.09-.37-.25-.03-.22-.03-.44,0-.66.04-.17.21-.28.39-.25.08.01.16.05.21.12.03.04.05.08.06.12,0,.04.03.08.05.11.06.06.14.1.22.12.1.03.2.05.31.05.18.01.36-.05.5-.16.07-.07.06-.18,0-.25-.02-.01-.03-.03-.05-.03-.1-.03-.2-.06-.31-.08l-.29-.05c-.28-.03-.54-.14-.74-.32-.25-.27-.3-.67-.11-.98.09-.15.23-.28.39-.36.08-.04.17-.07.26-.09.03,0,.02,0,.02-.03v-.06c0-.1,0-.2,0-.29,0-.17.12-.32.29-.35.17-.03.34.07.39.24.02.11.03.22.02.33v.15h.05s.05.02.07.03.05.02.07.01c.15-.13.37-.11.5.03.08.13.11.27.09.42.01.13,0,.25-.04.37-.08.16-.26.24-.43.17-.08-.03-.15-.09-.18-.17-.01-.02-.02-.05-.03-.07v-.03s-.02-.01-.03-.02c-.04-.02-.07-.04-.11-.05-.09-.03-.19-.04-.28-.04-.09,0-.18.01-.26.03-.1.03-.29.16-.14.26.09.05.2.09.31.1l.27.05c.27.03.53.13.76.28h0c.32.29.38.77.14,1.13h0Z"/></g></g>`,
  };

  // Torn's own icons are solid shapes, so the traced outlines are drawn filled (holes kept
  // with evenodd). Plus stays an outline: it marks an empty slot.
  function solidIcon(key) {
    const v = CAT_ICONS[key] || CAT_ICONS.item;
    if (key === 'plus') return v;
    return v.split(S).join('').replace(/ stroke-width="[^"]*"/g, '').replace(/<path (?!fill-rule)/g, '<path fill-rule="evenodd" ');
  }
  function mk(id, label, icon, url) {
    return { id, label, icon, svg: svg(solidIcon(icon)), url: url || '' };
  }
  const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  // [label, icon, url] rows -> catalogue entries
  const rows = (prefix, labelPrefix, list) => list.forEach(([name, icon, url]) =>
    CATALOG.push(mk(prefix + slug(name), labelPrefix + name, icon, url)));

  // Labels match Torn's shortcut names. My Profile and Property Vault have no fixed URL;
  // they're built per player (see DYNAMIC_URLS).
  const CATALOG = [];
  CATALOG.push(
    mk('home', 'Home', 'home', '/'),
    mk('city', 'City', 'city', '/city.php'),
    mk('my-profile', 'My Profile', 'profile'),
    mk('gym', 'Gym', 'gym', '/gym.php'),
    mk('crimes', 'Crimes', 'crimes', '/crimes.php'),
    mk('organized-crimes', 'Organised Crimes', 'ocrimes', '/factions.php?step=your&type=1#faction-crimes'),
    mk('items', 'Items', 'item', '/item.php'),
    mk('travel', 'Travel Agency', 'travel', '/page.php?sid=travel'),
    mk('raceway', 'Raceway', 'raceway', '/page.php?sid=racing'),
    mk('job', 'Job', 'job', '/jobs.php'),
    mk('calendar', 'Calendar', 'calendar', '/calendar.php'),
    mk('events', 'Events', 'events', '/page.php?sid=events'),
    mk('awards', 'Awards', 'awards', '/page.php?sid=awards'),
    mk('education', 'Education', 'education', '/page.php?sid=education'),
    mk('hospital', 'Hospital', 'hospital', '/hospitalview.php'),
    mk('jail', 'Jail', 'jail', '/jailview.php'),
    mk('targets', 'Targets', 'targets', '/page.php?sid=list&type=targets'),
    mk('hof', 'Hall of Fame', 'trophy', '/page.php?sid=hof'),
    mk('recruit-citizens', 'Recruit Citizens', 'recruit', '/bringafriend.php'),
    mk('enemies', 'Enemies', 'enemies', '/page.php?sid=list&type=enemies'),
    mk('friends', 'Friends', 'friends', '/page.php?sid=list&type=friends'),
    mk('messages', 'Messages', 'messages', '/messages.php'),
    mk('messages-compose', 'Messages: Compose', 'compose', '/messages.php#/p=compose'),
    mk('property', 'Properties', 'key', '/properties.php'),
    mk('missions', 'Missions', 'missions', '/loader.php?sid=missions'),
    mk('newspaper', 'Newspaper', 'newspaper', '/newspaper.php'),
    mk('casino', 'Casino', 'casino', '/casino.php'),
    mk('personalstats', 'Personal Stats', 'stats', '/personalstats.php'),
    mk('log', 'Log', 'log', '/page.php?sid=log'),
    mk('settings', 'Settings', 'gear', '/preferences.php'),
    mk('settings-api', 'Settings: API', 'apiKey', '/preferences.php#tab=api'),
    mk('laptop', 'Laptop', 'laptop', '/pc.php'),
    mk('forums', 'Forums', 'forums', '/forums.php'),

    // Newspaper & bounties
    mk('bounty-list', 'Bounties', 'bounty', '/bounties.php'),
    mk('bounty-place', 'Add Bounty', 'bounty', '/bounties.php#/p=add'),
    mk('newspaper-jobs', 'Job Listings', 'job', '/joblist.php#!p=main'),
    mk('newspaper-ads', 'Classified Ads', 'megaphone', '/newspaper_class.php'),

    // Trading
    mk('shop-item-market', 'Item Market', 'basket', '/page.php?sid=ItemMarket'),
    mk('shop-auction-house', 'Auction House', 'gavel', '/amarket.php'),
    mk('shop-points-market', 'Points Market', 'pointsMarket', '/pmarket.php'),
    mk('bazaar-directory', 'Bazaar Directory', 'storefront', '/page.php?sid=bazaar'),
    mk('trades', 'Trades', 'trades', '/trade.php'),
    mk('ammo', 'Ammo Locker', 'ammo', '/page.php?sid=ammo'),
    mk('bazaar', 'Bazaar', 'storefront', '/bazaar.php'),
    mk('bazaar-manage', 'Manage Bazaar', 'bazaarManage', '/bazaar.php#/manage'),
    mk('bazaar-add', 'Bazaar: Add items', 'bazaarAdd', '/bazaar.php#/add'),
    mk('display-case', 'Display Case', 'displayCase', '/displaycase.php'),
    mk('display-case-manage', 'Manage Display Case', 'displayCase', '/displaycase.php#manage'),
    mk('vault-property', 'Property Vault', 'vault') // URL built per player
  );

  // City buildings and shops
  rows('shop-', '', [
    ['Dump', 'dump', '/dump.php'],
    ['Museum', 'museum', '/museum.php'],
    ['Points Building', 'pointsP', '/page.php?sid=points'],
    ['Loan Shark', 'loanShark', '/loan.php'],
    ['Church', 'church', '/church.php'],
    ['City Hall', 'cityHall', '/citystats.php'],
    ['Visitor Center', 'info', 'https://wiki.torn.com/wiki/Main_Page'],
    ['Staff', 'staff', '/staff.php'],
    ['Donator House', 'star', '/donator.php'],
    ['Bank', 'bank', '/bank.php'],
    ['Stock Exchange', 'stockMarket', '/page.php?sid=stocks'],
    ['Community Center', 'peoplePair', '/fans.php'],
    ['Committee', 'committee', '/committee.php'],
    ['Msg Inc', 'msgInc', '/messageinc.php'],
    ['Chronicle Archives', 'archive', '/archives.php'],
    ["Big Al's Gun Shop", 'gun', '/bigalgunshop.php'],
    ["Big Al's Bunker", 'bunker', '/page.php?sid=bunker'],
    ["Bits 'n' Bobs", 'bag', '/shops.php?step=bitsnbobs'],
    ['Cyber Force', 'biohazard', '/shops.php?step=cyberforce'],
    ['Docks', 'car', '/shops.php?step=docks'],
    ['Estate Agents', 'estate', '/estateagents.php'],
    ['Jewelry Store', 'gem', '/shops.php?step=jewelry'],
    ['Nikeh Sports Shop', 'basketball', '/shops.php?step=nikeh'],
    ['Pawn Shop', 'pawn', '/shops.php?step=pawnshop'],
    ['Pharmacy', 'pharmacy', '/shops.php?step=pharmacy'],
    ['Post Office', 'parcel', '/shops.php?step=postoffice'],
    ['Print Store', 'palette', '/shops.php?step=printstore'],
    ['Recycling Center', 'recycle', '/shops.php?step=recyclingcenter'],
    ['Super Store', 'plug', '/shops.php?step=super'],
    ['Sweet Shop', 'candy', '/shops.php?step=candy'],
    ['TC Clothing', 'jacket', '/shops.php?step=clothes'],
    ['Token Shop', 'storefront', '/token_shop.php'],
  ]);
  // Labels that differ from the id-derived name
  Object.entries({
    'shop-visitor-center': 'Visitors Center', 'shop-bank': 'City Bank', 'shop-stock-exchange': 'Stock Market',
    'shop-community-center': 'Community Centre', 'shop-msg-inc': 'Classified Ads: Post',
    'shop-nikeh-sports-shop': 'Nikeh Performance',
  }).forEach(([id, label]) => { const c = CATALOG.find(e => e.id === id); if (c) c.label = label; });

  rows('casino-', '', [
    ['Slots', 'slots', '/page.php?sid=slots'],
    ['Roulette', 'roulette', '/page.php?sid=roulette'],
    ['High-Low', 'highlow', '/page.php?sid=highlow'],
    ['Keno', 'keno', '/page.php?sid=keno'],
    ['Craps', 'craps', '/page.php?sid=craps'],
    ['Bookie', 'bookie', '/page.php?sid=bookie'],
    ['Lottery', 'lottery', '/page.php?sid=lottery'],
    ['Blackjack', 'spade', '/page.php?sid=blackjack'],
    ['Poker', 'poker', '/page.php?sid=holdem'],
    ['Russian Roulette', 'rroulette', '/page.php?sid=russianRoulette'],
    ['Spin the Wheel', 'spinWheel', '/page.php?sid=spinTheWheel'],
  ]);

  CATALOG.push(
    mk('faction', 'My Faction', 'fist', '/factions.php?step=your'),
    mk('faction-armory', 'Faction Armory', 'armory', '/factions.php?step=your&type=1#/tab=armoury'),
    mk('faction-warfare', 'Faction Warfare', 'swords', '/page.php?sid=factionWarfare#/ranked')
  );
  const FAC = '/factions.php?step=your&type=5';
  rows('faction-', 'Faction: ', [
    ['Territory', 'flag', FAC + '#/tab=territory'],
    ['Weapons', 'rifle', FAC + '#/tab=armoury&start=0&sub=weapons'],
    ['Armor', 'shield', FAC + '#/tab=armoury&start=0&sub=armour'],
    ['Temporary', 'grenade', FAC + '#/tab=armoury&start=0&sub=temporary'],
    ['Medical', 'hospital', FAC + '#/tab=armoury&start=0&sub=medical'],
    ['Consumables', 'can', FAC + '#tab=armoury&sub=consumables'],
    ['Drugs', 'leaf', FAC + '#tab=armoury&sub=drugs'],
    ['Boosters', 'booster', FAC + '#tab=armoury&sub=boosters'],
    ['Utilities', 'tools', FAC + '#tab=armoury&sub=utilities'],
    ['Loot', 'parcel', FAC + '#tab=armoury&sub=loot'],
    ['Points', 'pointsP', FAC + '#tab=armoury&sub=points'],
    ['Deposit', 'deposit', FAC + '#tab=armoury&sub=donate'],
    ['Controls', 'gear', FAC + '#/tab=controls'],
    ['Give to User', 'moneyBagTorn', FAC + '#option-give-to-user'],
    ['Newsletter', 'messages', FAC + '#option-newsletter'],
    ['Pay Day', 'moneyBagTorn', FAC + '#option-pay-day'],
    ['Applications', 'log', FAC + '#option-application'],
    ['Members', 'peoplePair', FAC + '#option-members'],
    ['Positions', 'fist', FAC + '#option-positions'],
    ['Laboratory', 'flask', FAC + '#option-laboratory'],
    ['Announcement', 'megaphone', FAC + '#option-announcement'],
    ['Headlines', 'newspaper', FAC + '#option-headlines'],
  ]);
  CATALOG.find(e => e.id === 'faction-controls').label = 'Faction Controls';

  rows('items-', 'Items: ', [
    ['All', 'folder', '/item.php#all-items'],
    ['Primary weapon', 'rifle', '/item.php#primary-items'],
    ['Secondary weapon', 'gun', '/item.php#secondary-items'],
    ['Melee weapon', 'knife', '/item.php#melee-items'],
    ['Temporary weapon', 'grenade', '/item.php#temporary-items'],
    ['Armor', 'shield', '/item.php#armour-items'],
    ['Clothing', 'shirt', '/item.php#clothes-items'],
    ['Medical', 'hospital', '/item.php#medical-items'],
    ['Drugs', 'leaf', '/item.php#drugs-items'],
    ['Energy drink', 'can', '/item.php#energy-d-items'],
    ['Alcohol', 'martini', '/item.php#alcohol-items'],
    ['Candy', 'candy', '/item.php#candy-items'],
    ['Supply packs', 'parcel', '/item.php#supply-pck-items'],
    ['Boosters', 'booster', '/item.php#boosters-items'],
    ['Enhancer', 'wand', '/item.php#enhancers-items'],
    ['Tools', 'tools', '/item.php#tools-items'],
    ['Materials', 'materials', '/item.php#materials-items'],
    ['Jewelry', 'gem', '/item.php#jewelry-items'],
    ['Flowers', 'flower', '/item.php#flowers-items'],
    ['Plushies', 'bear', '/item.php#plushies-items'],
    ['Artifacts', 'pyramid', '/item.php#artifacts-items'],
    ['Books', 'books', '/item.php#books-items'],
    ['Special', 'star', '/item.php#special-items'],
    ['Miscellaneous', 'bag', '/item.php#miscellaneous-items'],
    ['Cars', 'car', '/item.php#cars-item'],
    ['Collectibles', 'trophy', '/item.php#collectibles-items'],
  ]);
  CATALOG.find(e => e.id === 'items-jewelry').label = 'Items: Jewellery';

  // Forum boards; the five that have their own icon on Torn use it
  const FORUM_ICON = { 'General Discussion': 'forumGlobe', 'Trading Post': 'forumDollar',
    'Questions & Answers': 'forumQuestion', 'Faction Discussion': 'forumFist', 'Company Discussion': 'forumCase' };
  rows('forums-', 'Forums: ', [
    ['Announcements', 1], ['Donator Forum', 8], ['VIP Corner', 48], ['Christmas Town', 70],
    ['General Discussion', 2], ['Non-Related Forums', 700], ['Questions & Answers', 3],
    ['Trading Post', 10], ['Fun & Games', 13], ['Community Events', 62], ['Achievements', 16],
    ['Faction Discussion', 9], ['Faction Recruitment', 24], ['Company Discussion', 20],
    ['Company Recruitment', 46], ['Attacking', 59], ['Stock Market', 11], ['Properties', 22],
    ['Gambling', 15], ['Poker', 69], ['Racing', 21], ['Missions', 47], ['Graphics', 23],
    ['Tools & Userscripts', 67], ['Discord', 14], ['API Development', 63], ['Suggestions', 19],
    ['Graveyard', 17],
  ].map(([name, f]) => [name, FORUM_ICON[name] || 'forums', `/forums.php?p=forums&f=${f}&b=0&a=0`]));
  // Torn PDA forum intentionally left out

  const CATALOG_BY_ID = {};
  CATALOG.forEach(c => { CATALOG_BY_ID[c.id] = c; });

  // ---------- pinned trio: Messages / Events / Awards ----------
  // Read from Torn's nav links, e.g. <a id="nav-events" aria-label="Events, 1 new">.
  // aria-label has no ", N new" part when nothing is unread.
  const PINNED_DEFS = [
    { id: 'nav-messages', label: 'Messages', url: '/messages.php', fallback: svg(ICONS.messages) },
    { id: 'nav-events', label: 'Events', url: '/page.php?sid=events', fallback: svg(ICONS.events) },
    { id: 'nav-awards', label: 'Awards', url: '/page.php?sid=awards', fallback: svg(ICONS.awards) },
  ];
  const PINNED_IDS = new Set(PINNED_DEFS.map(d => d.id));

  let pinnedCache = {};
  try {
    const c = JSON.parse(localStorage.getItem(PINNED_KEY) || '{}');
    if (c && typeof c === 'object') pinnedCache = c;
  } catch (e) {}

  // Same source icon, same result: skip the clone and re-crop (it forces a layout).
  const svgCache = new Map();
  function cleanSvg(svgEl) {
    const key = svgEl.outerHTML;
    const hit = svgCache.get(key);
    if (hit) return hit;
    const out = cleanSvgNow(svgEl);
    if (svgCache.size > 120) svgCache.clear();
    svgCache.set(key, out);
    return out;
  }
  function cleanSvgNow(svgEl) {
    const c = svgEl.cloneNode(true);
    ['width', 'height', 'style', 'class', 'filter', 'stroke', 'stroke-width']
      .forEach(a => c.removeAttribute(a));

    c.setAttribute('fill', 'currentColor');
    c.setAttribute('aria-hidden', 'true');

    // Some Torn icons have padded viewBoxes; re-crop to the drawn bounds so all icons
    // render at the same size.
    let vb = null;
    try {
      const bbox = svgEl.getBBox();
      if (bbox && bbox.width > 0 && bbox.height > 0) {
        const pad = Math.max(bbox.width, bbox.height) * 0.08;
        vb = `${(bbox.x - pad).toFixed(2)} ${(bbox.y - pad).toFixed(2)} ${(bbox.width + pad * 2).toFixed(2)} ${(bbox.height + pad * 2).toFixed(2)}`;
      }
    } catch (e) {}

    if (vb) {
      c.setAttribute('viewBox', vb);
    } else if (!c.getAttribute('viewBox')) {
      const w = parseFloat(svgEl.getAttribute('width')) || 17;
      const h = parseFloat(svgEl.getAttribute('height')) || 17;
      c.setAttribute('viewBox', `0 0 ${w} ${h}`);
    }

    c.querySelectorAll('linearGradient,radialGradient,filter,style,script').forEach(n => n.remove());
    c.querySelectorAll('*').forEach(n => {
      ['style', 'class', 'filter'].forEach(a => n.removeAttribute(a));
      const f = n.getAttribute('fill');
      if (f && f.indexOf('url(') === 0) n.setAttribute('fill', 'currentColor');
      const st = n.getAttribute('stroke');
      if (st && st.indexOf('url(') === 0) n.setAttribute('stroke', 'currentColor');
    });

    return c.outerHTML;
  }

  // Unread count: aria-label ("Label, N new") first, then the "amount" span.
  function readBadge(a) {
    const aria = a.getAttribute('aria-label') || '';
    const m = aria.match(/,\s*(\d+)\s*new/i);
    if (m) return parseInt(m[1], 10) || 0;
    const amt = a.querySelector('[class*="amount" i]');
    if (amt) {
      const n = parseInt((amt.textContent || '').replace(/\D/g, ''), 10);
      if (!isNaN(n)) return n;
    }
    return 0;
  }

  // Reads the 3 pinned nav links by id. A missing one falls back to its cached icon/url
  // with no badge.
  function readPinned() {
    let changed = false;
    const out = PINNED_DEFS.map(def => {
      const el = document.getElementById(def.id);
      if (el && el.tagName === 'A') {
        const svgEl = el.querySelector('svg');
        const url = resolveUrl(el.getAttribute('href') || def.url, def.url);
        const iconSvg = svgEl ? cleanSvg(svgEl) : ((pinnedCache[def.id] && pinnedCache[def.id].svg) || def.fallback);
        const badge = readBadge(el);
        const cached = pinnedCache[def.id];
        if (!cached || cached.url !== url || cached.svg !== iconSvg) {
          pinnedCache[def.id] = { url, svg: iconSvg };
          changed = true;
        }
        return { key: def.id, label: def.label, url, svg: iconSvg, badge };
      }
      const cached = pinnedCache[def.id];
      return {
        key: def.id,
        label: def.label,
        url: (cached && cached.url) || def.url,
        svg: (cached && cached.svg) || def.fallback,
        badge: 0,
      };
    });
    if (changed) { try { localStorage.setItem(PINNED_KEY, JSON.stringify(pinnedCache)); } catch (e) {} }
    return out;
  }

  // Energy/Nerve full check. Mobile layout: the visually-hidden ".wai" labels ("Energy:").
  // Desktop layout: <p class="barName___…">Energy:</p> beside <p class="barValue___…">cur/max</p>.
  // Matched on the label text, not the hashed class names.
  function readStatFull(label) {
    const wanted = label.toLowerCase() + ':';
    const labels = document.querySelectorAll('.wai, [class*="barName"]');
    for (const w of labels) {
      if ((w.textContent || '').trim().toLowerCase() !== wanted) continue;
      // The label's own row first (desktop), then its region (mobile).
      let valueEl = null;
      for (const row of [w.parentElement, w.closest('[role="region"]')]) {
        if (!row) continue;
        valueEl = Array.from(row.querySelectorAll('p')).find(p =>
          p !== w && /^\d+\s*\/\s*\d+$/.test((p.textContent || '').trim())
        );
        if (valueEl) break;
      }
      if (!valueEl) continue;
      const m = valueEl.textContent.trim().match(/^(\d+)\s*\/\s*(\d+)$/);
      if (!m) continue;
      const cur = parseInt(m[1], 10), max = parseInt(m[2], 10);
      if (isNaN(cur) || isNaN(max) || max <= 0) continue;
      return cur >= max;
    }
    return false;
  }

  function readStats() {
    return { energyFull: readStatFull('Energy'), nerveFull: readStatFull('Nerve') };
  }

  let pinned = readPinned();

  // Baseline unread counts on load so existing unreads don't trigger a vibration.
  let notifiedCounts = {};
  try {
    const c = JSON.parse(localStorage.getItem(NOTIFIED_KEY) || '{}');
    if (c && typeof c === 'object') notifiedCounts = c;
  } catch (e) {}
  pinned.forEach(p => { if (notifiedCounts[p.key] === undefined) notifiedCounts[p.key] = p.badge; });
  function saveNotified() { try { localStorage.setItem(NOTIFIED_KEY, JSON.stringify(notifiedCounts)); } catch (e) {} }

  // ---------- custom slots: state ----------
  // customSlots[i] is null (empty) or { catalogId, label, svg, url }.
  let customSlots = new Array(CUST_COUNT).fill(null);
  try {
    const c = JSON.parse(localStorage.getItem(CUSTOM_KEY) || 'null');
    if (Array.isArray(c)) {
      for (let i = 0; i < CUST_COUNT; i++) customSlots[i] = c[i] || null;
    }
  } catch (e) {}
  function saveCustomSlots() { try { localStorage.setItem(CUSTOM_KEY, JSON.stringify(customSlots)); } catch (e) {} }

  // URLs typed in by the user for catalogue entries without one, keyed by catalogue id.
  let urlFixes = {};
  try {
    const c = JSON.parse(localStorage.getItem(URLFIX_KEY) || '{}');
    if (c && typeof c === 'object') urlFixes = c;
  } catch (e) {}
  function saveUrlFixes() { try { localStorage.setItem(URLFIX_KEY, JSON.stringify(urlFixes)); } catch (e) {} }
  // ---------- My Profile ----------
  // Torn ID read from the account menu's "View Profile" link and cached. If it's never
  // found, the picker asks for it.
  const TORN_ID_KEY = 'qsWheel_tornId_v1';
  function detectTornId() {
    const a = document.querySelector('.settings-menu a[href*="profiles.php?XID="]');
    const m = a && /XID=(\d+)/.exec(a.getAttribute('href') || '');
    if (m) {
      try { localStorage.setItem(TORN_ID_KEY, m[1]); } catch (e) {}
      return m[1];
    }
    try { return localStorage.getItem(TORN_ID_KEY) || ''; } catch (e) { return ''; }
  }
  function saveTornId(id) { try { localStorage.setItem(TORN_ID_KEY, id); } catch (e) {} }
  detectTornId(); // cache while the account menu is present
  function myProfileUrl() {
    const id = detectTornId();
    return id ? '/profiles.php?XID=' + id : '';
  }

  // ---------- Property Vault ----------
  // Property ID read from the Vault link on properties.php and cached. Until it's known,
  // the shortcut opens properties.php.
  const PROPERTY_ID_KEY = 'qsWheel_propertyId_v1';
  const PROPERTY_OWNER_KEY = 'qsWheel_propertyOwner_v1'; // Torn ID the cached property belongs to
  function detectPropertyId() {
    const a = document.querySelector('a[href*="tab=vault"][href*="ID="]');
    const m = a && /[?&#/]ID=(\d+)/.exec(a.getAttribute('href') || '');
    const me = detectTornId();
    if (m) {
      try {
        localStorage.setItem(PROPERTY_ID_KEY, m[1]);
        if (me) localStorage.setItem(PROPERTY_OWNER_KEY, me);
      } catch (e) {}
      return m[1];
    }
    try {
      // A shared browser: ignore a property cached by a different account.
      const id = localStorage.getItem(PROPERTY_ID_KEY) || '';
      const owner = localStorage.getItem(PROPERTY_OWNER_KEY) || '';
      return id && owner && me && owner !== me ? '' : id;
    } catch (e) { return ''; }
  }
  function propertyVaultUrl() {
    const id = detectPropertyId();
    return id ? `/properties.php#/p=options&ID=${id}&tab=vault` : '/properties.php';
  }
  detectPropertyId();

  // Per-player URLs, resolved at tap time.
  const DYNAMIC_URLS = { 'my-profile': myProfileUrl, 'vault-property': propertyVaultUrl };
  function slotUrl(slot) {
    const dyn = slot && DYNAMIC_URLS[slot.catalogId];
    return (dyn && dyn()) || slot.url;
  }

  function resolveCatalogUrl(entry) {
    if (DYNAMIC_URLS[entry.id]) return DYNAMIC_URLS[entry.id]();
    return (urlFixes[entry.id] || entry.url || '').trim();
  }

  // Vibration queue: plays one pattern at a time, in order.
  let vibeQueue = [];
  let vibeBusy = false;
  function queueVibe(pattern) { vibeQueue.push(pattern); pumpVibe(); }
  function pumpVibe() {
    if (vibeBusy || !vibeQueue.length) return;
    vibeBusy = true;
    const pattern = vibeQueue.shift();
    haptic(pattern);
    burstMain();
    const total = pattern.reduce((a, b) => a + b, 0) + 250;
    setTimeout(() => { vibeBusy = false; pumpVibe(); }, total);
  }

  // Short pop on the main button for a new notification.
  function burstMain() {
    main.classList.remove('qsw-burst');
    void main.offsetWidth;
    main.classList.add('qsw-burst');
    setTimeout(() => main.classList.remove('qsw-burst'), 950);
  }

  // Vibrates/pops for any pinned count that went up and syncs the button's unread state.
  // Alerts only fire while the page is visible and focused (Torn scripting rules).
  const pageActive = () => document.visibilityState === 'visible' && document.hasFocus();

  function checkNotifications() {
    let touched = false;
    const mayAlert = pageActive();
    pinned.forEach(p => {
      const prev = notifiedCounts[p.key] || 0;
      if (p.badge > prev && mayAlert) queueVibe(VIBE_PATTERNS[p.key] || [100]);
      if (p.badge > prev) touched = true;
      if (notifiedCounts[p.key] !== p.badge) { notifiedCounts[p.key] = p.badge; touched = true; }
    });
    if (touched) saveNotified();
    main.classList.toggle('attention', pinned.some(p => p.badge > 0));
  }

  // ---------- reading Torn's sidebar ----------
  // Skips the pinned trio (own band) and Home (double-tap the button).
  function scanSidebar() {
    const sb = document.getElementById('sidebar');
    if (!sb) return null;

    const list = [];
    const seen = new Set();

    const consider = row => {
      const a = row.matches && row.matches('a[href]') ? row : row.querySelector('a[href]');
      if (!a) return;

      const href = a.getAttribute('href') || '';
      if (!href || href === '#' || /^javascript:/i.test(href)) return;

      // Nav rows are always kept: Torn may use an image or no icon (seasonal/event links).
      const svgEl = a.querySelector('svg');
      const imgEl = svgEl ? null : a.querySelector('img');
      const isNav = !!(row.id && row.id.indexOf('nav-') === 0);
      if (!svgEl && !isNav) return;

      const label = (a.textContent || '').replace(/\s+/g, ' ').trim();
      if (!label || label.length > 28) return;

      const key = row.id || ('sb-' + label.toLowerCase().replace(/[^a-z0-9]+/g, '-'));
      if (seen.has(key)) return;
      if (PINNED_IDS.has(key)) return;
      if (key === 'nav-home' || label.toLowerCase() === 'home') return;

      const url = resolveUrl(href, href);
      seen.add(key);
      let icon;
      if (svgEl) icon = cleanSvg(svgEl);
      else if (imgEl && imgEl.getAttribute('src')) {
        const src = resolveUrl(imgEl.getAttribute('src'), '').replace(/"/g, '&quot;');
        icon = `<img src="${src}" alt="" style="width:100%;height:100%;object-fit:contain;display:block">`;
      } else icon = svg('<circle cx="12" cy="12" r="5"/>');
      list.push({ key, label, url, svg: icon });
    };

    const rows = sb.querySelectorAll('[id^="nav-"]');
    if (rows.length) rows.forEach(consider);
    else sb.querySelectorAll('a[href]').forEach(consider);

    return list.length ? list : null;
  }

  let items = DEFAULT_ITEMS;
  try {
    const cached = JSON.parse(localStorage.getItem(ITEMS_KEY) || 'null');
    if (Array.isArray(cached) && cached.length) items = cached;
  } catch (e) {}

  // ---------- state ----------
  let n = 0, canSpin = false, vis = 0, step = 0;
  let rot = 0;
  let open = false;
  let activeI = -1;
  let featI = -1;            // item currently nearest the fixed pointer, while spinning
  let spinning = false;
  let dragging = false;
  let vel = 0;
  const MAX_VEL = 0.08; // items per ms; a hard flick
  let rafId = 0, lastFrame = 0, lastTickI = 0;
  let gesture = null;
  let settleT = null;
  let pendingRebuild = false;
  let shownLabel = null;

  // Mobile: the wheel replaces Torn's sidebar, so it's hidden. Desktop layout with a mouse
  // (pcMode): the sidebar stays and the compass wheel opens at the cursor instead.
  let pcMode = false;
  try { localStorage.removeItem('qsWheel_sidebarEnabled_v1'); } catch (_) {} // remove obsolete setting

  let reg = [];           // per main-ring item: { it, wg, ip, ico }
  let pgEls = [];          // the 3 pinned segment <g> groups
  let pinIcoEls = [];      // the 3 pinned icon layers
  let pinBadgeEls = [];    // the 3 pinned badge bubbles
  let cgEls = [];          // the 5 custom-slot segment <g> groups
  let custIcoEls = [];     // the 5 custom-slot icon layers
  let editingSlot = -1;    // which custom slot the picker is currently editing, -1 = none
  let pendingCatalogId = null; // entry awaiting a typed URL in the picker
  let pickerFromPanel = false; // picker opened from the Settings list: return there after

  let energyFull = false, nerveFull = false;
  const isGymItem = it => /\/gym\.php/i.test(it.url);
  const isCrimesItem = it => /sid=crimes\b|\/crimes\.php/i.test(it.url); // Torn uses /crimes.php now
  // Torn flags a sidebar row (new newspaper article, etc.) with an attention___ class; mirror it.
  const hasAttention = it => {
    const el = it && it.key && document.getElementById(it.key);
    return !!el && [...el.classList].some(c => c.indexOf('attention') === 0);
  };

  // ---------- styles ----------
  const style = document.createElement('style');
  style.textContent = `
    #qsw-root {
      --a1: var(--qsw-a1); --a2: var(--qsw-a2); --a3: var(--qsw-a3); --alert: var(--qsw-a1);
      --stat: var(--qsw-stat); --stat-glow: rgb(var(--qsw-stat-rgb) / .65);
      --spring: cubic-bezier(.34, 1.56, .64, 1);
      --ease: cubic-bezier(.22, 1, .36, 1);
      position: fixed; right: calc(${RIGHT_OFFSET}px + env(safe-area-inset-right, 0px));
      bottom: calc(${BOTTOM_OFFSET}px + env(safe-area-inset-bottom, 0px));
      z-index: 2147483645; width: 52px; height: 52px;
      font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
      -webkit-tap-highlight-color: transparent;
    }

    /* Button on the left edge: anchored bottom-left, fanning out to the top-right. */
    #qsw-root.qsw-left { right: auto; left: calc(${RIGHT_OFFSET}px + env(safe-area-inset-left, 0px)); --qsw-ox: 0px; --qsw-in-rot: 16deg; }
    #qsw-root.qsw-left #qsw-wheel { right: auto; left: 26px; transform-origin: 0 100%; }
    #qsw-root.qsw-left #qsw-panel { right: auto; left: 0; transform-origin: 0 100%; }
    #qsw-root.qsw-left #qsw-label { right: auto; left: -6px; }

    /* Typing on a phone: the button steps aside so it can't cover the text box or send button. */
    #qsw-root.qsw-typing #qsw-main { opacity: 0 !important; transform: scale(.6); pointer-events: none; animation: none; }
    /* Logged out / login page: nothing to navigate to. */
    #qsw-root.qsw-off { display: none !important; }

    /* Dragging the button: follows the finger, then snaps to the nearest side edge. */
    #qsw-root.qsw-dragging #qsw-main { opacity: 1; transform: scale(1.08); animation: none; }
    #qsw-root.qsw-snapping { transition: left .22s var(--ease), top .22s var(--ease); }

    /* Flat style, matching the wedges. */
    #qsw-main {
      position: absolute; inset: 0; border-radius: 50%;
      background: linear-gradient(135deg, rgba(255,255,255,.2), rgba(255,255,255,.04)), #15171b;
      border: 1px solid rgba(255,255,255,.16);
      color: #fff;
      display: flex; align-items: center; justify-content: center;
      touch-action: none; user-select: none; -webkit-user-select: none;
      -webkit-touch-callout: none; cursor: pointer; z-index: 2;
      opacity: var(--qsw-idle, ${IDLE_OPACITY});
      transition: opacity .25s var(--ease), transform .2s var(--spring), border-color .2s var(--ease), box-shadow .2s var(--ease);
    }

    /* Unread: lime outline + slow pulse. Paused while pressed/open. */
    #qsw-main.attention {
      opacity: max(.9, var(--qsw-idle, ${IDLE_OPACITY})); border-color: var(--alert); box-shadow: inset 0 0 0 1px var(--alert);
      animation: qsw-throb 1.8s ease-in-out infinite;
    }
    #qsw-main.attention.pressing, #qsw-main.attention.open, #qsw-main.attention.panel {
      animation: none;
    }

    @keyframes qsw-throb {
      0%, 100% { transform: scale(1); }
      50% { transform: scale(1.07); }
    }

    /* Pop when a new notification arrives. */
    #qsw-main.qsw-burst {
      border-color: var(--alert); box-shadow: inset 0 0 0 1px var(--alert);
      animation: qsw-burst .9s var(--spring);
    }

    @keyframes qsw-burst {
      0% { transform: scale(1); }
      35% { transform: scale(1.24); }
      65% { transform: scale(.96); }
      100% { transform: scale(1); }
    }

    /* X when open; rotates 45° into a plus when closed. */
    #qsw-main svg {
      width: 22px; height: 22px;
      transform: rotate(-45deg);
      transition: transform .42s var(--ease);
    }
    #qsw-main.open svg { transform: rotate(0deg); }

    #qsw-main.open, #qsw-main.pressing, #qsw-main.panel { opacity: 1; }
    /* Dragging the opacity slider: show the idle look live. */
    #qsw-root.qsw-preview #qsw-main { opacity: var(--qsw-idle, ${IDLE_OPACITY}) !important; }
    #qsw-main.open { border-color: var(--a2); box-shadow: inset 0 0 0 1px var(--a2); }
    #qsw-main.pressing {
      transform: scale(.9);
      background: linear-gradient(135deg, rgba(255,255,255,.3), rgba(255,255,255,.1)), #15171b;
    }

    #qsw-panel {
      position: absolute; right: 0; bottom: 66px; z-index: 3; width: 230px;
      padding: 14px; border-radius: 8px; color: #fff; box-sizing: border-box;
      background: #17191d;
      border: 1px solid rgba(255,255,255,.14);
      opacity: 0; transform: translateY(10px) scale(.94); transform-origin: 100% 100%;
      pointer-events: none;
      transition: opacity .2s var(--ease), transform .32s var(--spring);
    }

    #qsw-panel.show { opacity: 1; transform: none; pointer-events: auto; }
    .qsw-ptitle { font: 650 15px/1.2 system-ui, sans-serif; letter-spacing: 0; color: #fff; }
    .qsw-psync { margin: 14px 0 14px; }
    .qsw-psync-row { display: flex; align-items: center; gap: 10px; }
    .qsw-pstat { flex: 1; min-width: 0; font: 500 13px/1.3 system-ui, sans-serif; color: #fff; }
    .qsw-pstat span { display: block; white-space: nowrap; margin-top: 2px; font: 400 12px/1.3 system-ui, sans-serif; color: rgba(255,255,255,.55); }
    .qsw-pnote { display: none; margin-top: 8px; font: 400 12px/1.35 system-ui, sans-serif; color: rgba(255,255,255,.7); }
    .qsw-pnote.show { display: block; }

    #qsw-panel .qsw-pview-credits, #qsw-panel .qsw-pview-colours, #qsw-panel .qsw-pview-anim { display: none; }
    #qsw-panel.credits .qsw-pview-main, #qsw-panel.colours .qsw-pview-main, #qsw-panel.anim .qsw-pview-main { display: none; }
    #qsw-panel.credits .qsw-pview-credits, #qsw-panel.colours .qsw-pview-colours, #qsw-panel.anim .qsw-pview-anim { display: block; }

    /* Animation view: one option per row, with what it's for. */
    #qsw-panel.anim, #qsw-root.qsw-pc-mode #qsw-panel.anim { width: 300px; max-width: calc(100vw - 24px); }
    .qsw-alist { display: grid; gap: 6px; margin-top: 12px; }
    .qsw-alist button {
      display: block; width: 100%; margin: 0; padding: 9px 11px; height: auto; box-sizing: border-box; text-align: left; cursor: pointer;
      border: 1px solid rgba(255,255,255,.1); border-radius: 6px; background: rgba(255,255,255,.03); color: #fff;
      transition: border-color .15s ease, background-color .15s ease;
    }
    .qsw-alist button:hover { border-color: rgba(255,255,255,.28); }
    .qsw-alist button.on { border-color: var(--qsw-a2); background: rgb(var(--qsw-a2-rgb) / .14); }
    .qsw-alist b { display: block; font: 600 13px/18px system-ui, sans-serif; }
    .qsw-alist b i { font-style: normal; font-weight: 500; color: rgba(255,255,255,.5); }
    .qsw-alist span { display: block; margin-top: 1px; font: 400 11.5px/1.35 system-ui, sans-serif; color: rgba(255,255,255,.6); }

    /* Wheel colour: one row in Settings, opening its own view of named swatches. */
    .qsw-pcolsec { margin: 0 0 12px; }
    #qsw-pcol, #qsw-panim {
      display: flex; align-items: center; gap: 9px; width: 100%; margin: 0; padding: 8px 10px; height: auto;
      border: 1px solid rgba(255,255,255,.12); border-radius: 6px; background: rgba(255,255,255,.04);
      color: #fff; font: 500 13px/18px system-ui, sans-serif; text-align: left; cursor: pointer; box-sizing: border-box;
    }
    #qsw-pcol:hover, #qsw-panim:hover { border-color: rgb(var(--qsw-a2-rgb) / .5); }
    #qsw-pcol span, #qsw-panim span { flex: 1; }
    #qsw-pcol b, #qsw-panim b { font-weight: 400; font-size: 17px; line-height: 18px; color: rgba(255,255,255,.45); }
    .qsw-sw {
      display: block; flex: 0 0 16px; width: 16px; height: 16px; border-radius: 50%;
      background: linear-gradient(135deg, var(--sw1, var(--qsw-a1)), var(--sw2, var(--qsw-a2)));
      box-shadow: inset 0 0 0 1px rgba(0,0,0,.25);
    }
    #qsw-panel.colours, #qsw-root.qsw-pc-mode #qsw-panel.colours { width: 332px; max-width: calc(100vw - 24px); }
    .qsw-cbtog { margin-top: 12px; }
    .qsw-cbnote { display: none; margin: 2px 0 0; font: 400 11.5px/1.35 system-ui, sans-serif; color: rgba(255,255,255,.55); }
    #qsw-panel.cb .qsw-cbnote { display: block; }
    .qsw-cgrid { margin-top: 12px; }
    .qsw-cgrid { display: grid; grid-template-columns: repeat(auto-fill, minmax(146px, 1fr)); gap: 6px; }
    .qsw-cgrid button {
      display: flex; align-items: center; gap: 7px; min-width: 0; margin: 0; padding: 7px 8px; height: auto;
      border: 1px solid rgba(255,255,255,.1); border-radius: 6px; background: rgba(255,255,255,.03);
      color: rgba(255,255,255,.85); font: 500 12px/16px system-ui, sans-serif; text-align: left; cursor: pointer;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis; box-sizing: border-box;
      transition: border-color .15s ease, background-color .15s ease;
    }
    .qsw-cgrid button:hover { border-color: rgba(255,255,255,.28); }
    .qsw-cgrid button.on { border-color: var(--qsw-a2); background: rgb(var(--qsw-a2-rgb) / .14); color: #fff; }
    .qsw-cgrid button.on .qsw-sw { box-shadow: 0 0 0 2px #17191d, 0 0 0 3px var(--qsw-a2); }

    #qsw-prefresh, #qsw-pcback, #qsw-pcolback, #qsw-panimback {
      display: block; padding: 8px 12px; border-radius: 6px; margin: 0;
      font: 600 13px/18px system-ui, sans-serif; height: auto; box-sizing: border-box; cursor: pointer;
      transition: transform .18s var(--spring), background-color .15s ease;
    }
    #qsw-prefresh { flex: none; border: none; color: var(--qsw-ink); background: var(--a2); }
    #qsw-pcback, #qsw-pcolback, #qsw-panimback {
      width: 100%; margin: 12px 0 0; color: #fff;
      border: 1px solid rgba(255,255,255,.16); background: rgba(255,255,255,.06);
    }
    /* Credits: a quiet link at the foot of the panel. */
    #qsw-pcredits {
      display: block; margin: 2px auto 0; padding: 4px 8px; border: none; background: none;
      font: 500 11px/16px system-ui, sans-serif; height: auto; color: rgba(255,255,255,.45); cursor: pointer;
    }
    #qsw-pcredits:hover { color: rgba(255,255,255,.75); }
    #qsw-prefresh:active, #qsw-pcredits:active, #qsw-pcback:active, #qsw-pcolback:active, #qsw-pcol:active { transform: scale(.97); }

    .qsw-csec {
      margin: 12px 0 5px; font: 600 10px/1 system-ui, sans-serif; letter-spacing: .14em;
      text-transform: uppercase; color: var(--a2);
    }
    .qsw-cname {
      display: block; padding: 3px 0; font: 500 13px system-ui, sans-serif;
      color: #fff; text-decoration: none;
    }
    .qsw-cname span { color: rgba(255,255,255,.5); }
    #qsw-pbg { position: fixed; inset: 0; z-index: 2147483644; display: none; }
    #qsw-pbg.show { display: block; }

    /* ---- shortcut picker: assigns a custom-ring slot ---- */
    #qsw-picker {
      position: fixed; left: 10px; right: 10px; bottom: 10px;
      height: min(72vh, 560px); /* fixed: the list scrolls rather than the panel resizing */
      z-index: 2147483646; display: flex; flex-direction: column;
      border-radius: 8px; color: #fff;
      background: #17191d;
      border: 1px solid rgba(255,255,255,.14);
      opacity: 0; transform: translateY(16px) scale(.97); transform-origin: 50% 100%;
      pointer-events: none; padding: 14px;
      transition: opacity .2s var(--ease), transform .3s var(--spring);
    }

    #qsw-picker.show { opacity: 1; transform: none; pointer-events: auto; }

    .qsw-pk-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
    .qsw-pk-title { font: 600 13px system-ui, sans-serif; letter-spacing: .06em; color: #fff; }

    #qsw-pk-close {
      width: 28px; height: 28px; border-radius: 50%; border: none;
      background: rgba(255,255,255,.1); color: #fff; font: 18px/1 system-ui, sans-serif;
    }

    #qsw-pk-search {
      width: 100%; padding: 10px 12px; margin-bottom: 8px; box-sizing: border-box;
      border-radius: 6px; border: 1px solid rgba(255,255,255,.16);
      background: rgba(255,255,255,.06); color: #fff; font: 14px system-ui, sans-serif;
    }

    #qsw-pk-search:focus, #qsw-pk-url:focus { outline: none; border-color: var(--a2); }
    #qsw-pk-search::placeholder { color: rgba(255,255,255,.4); }

    .qsw-pk-clearbtn {
      width: 100%; padding: 9px; margin-bottom: 8px; border: 1px solid rgb(var(--qsw-a1-rgb) / .4);
      border-radius: 6px; background: rgb(var(--qsw-a1-rgb) / .12); color: var(--a1);
      font: 600 12px system-ui, sans-serif;
    }

    #qsw-pk-list {
      overflow-y: auto; flex: 1; display: flex; flex-direction: column; gap: 6px;
      -webkit-overflow-scrolling: touch;
    }

    .qsw-pk-item {
      display: flex; align-items: center; gap: 10px; width: 100%;
      padding: 10px 12px; border: 1px solid rgba(255,255,255,.1);
      border-radius: 6px; background: rgba(255,255,255,.04);
      color: #fff; font: 500 13px system-ui, sans-serif; text-align: left;
    }

    .qsw-pk-item:active { background: rgb(var(--qsw-a2-rgb) / .22); border-color: var(--a2); }
    .qsw-pk-item svg { width: 19px; height: 19px; flex: 0 0 19px; color: var(--a2); }
    .qsw-pk-empty { padding: 20px; text-align: center; color: rgba(255,255,255,.5); font: 13px system-ui, sans-serif; }

    .qsw-pk-confirm { display: none; flex-direction: column; gap: 10px; }
    .qsw-pk-confirm.show { display: flex; }
    .qsw-pk-ctitle { font: 700 15px system-ui, sans-serif; }
    .qsw-pk-cnote { font: 12px/1.4 system-ui, sans-serif; color: rgba(255,255,255,.6); }

    #qsw-pk-url {
      width: 100%; padding: 10px 12px; box-sizing: border-box;
      border-radius: 6px; border: 1px solid rgba(255,255,255,.16);
      background: rgba(255,255,255,.06); color: #fff; font: 14px system-ui, sans-serif;
    }

    .qsw-pk-crow { display: flex; gap: 8px; }

    #qsw-pk-back, #qsw-pk-save {
      flex: 1; padding: 11px; border: none; border-radius: 6px;
      font: 600 13px system-ui, sans-serif;
    }

    #qsw-pk-back { background: rgba(255,255,255,.1); color: #fff; }
    #qsw-pk-save { background: var(--a2); color: var(--qsw-ink); }

    /* Long-presses on the wheel must never start a text selection (its handles then eat taps). */
    #qsw-overlay, #qsw-root, #qsw-root *, #qsw-pbg, #qsw-pc, #qsw-pc * {
      -webkit-user-select: none; user-select: none; -webkit-touch-callout: none;
    }
    #qsw-root input { -webkit-user-select: text; user-select: text; -webkit-touch-callout: default; }

    #qsw-overlay {
      --ease: cubic-bezier(.22, 1, .36, 1); /* not inside #qsw-root, so the curve is set here too */
      position: fixed; inset: 0; z-index: 2147483644; touch-action: none;
      background: radial-gradient(120% 120% at 100% 100%, rgba(6,8,12,.8), rgba(6,8,12,.46) 60%, rgba(6,8,12,.32));
      -webkit-backdrop-filter: blur(5px) saturate(1.15);
              backdrop-filter: blur(5px) saturate(1.15);
      opacity: 0; pointer-events: none; transition: opacity .25s var(--ease);
    }

    #qsw-overlay.show { opacity: 1; pointer-events: auto; }
    #qsw-overlay.leaving { pointer-events: none; }

    #qsw-wheel {
      position: absolute; right: 26px; bottom: 26px; transform-origin: 100% 100%;
      width: ${SIZE}px; height: ${SIZE}px; z-index: 1;
      pointer-events: none;
      user-select: none; -webkit-user-select: none;
    }

    #qsw-wheel > svg { position: absolute; inset: 0; overflow: visible; pointer-events: none; }

    /* Fully hidden when closed. */
    #qsw-wheel:not(.open) { visibility: hidden !important; opacity: 0 !important; }
    #qsw-wheel.open { visibility: visible; opacity: 1; }
    /* Closing: stays up for the fold-away, then hides. */
    #qsw-wheel.closing { visibility: visible !important; opacity: 1 !important; }
    /* Glows and icon shadows are costly to redraw on phones, so they wait until the wheel has settled. */
    #qsw-wheel:not(.settled) .qsw-seg, #qsw-wheel:not(.settled) .qsw-pg-seg, #qsw-wheel:not(.settled) .qsw-cg-seg,
    #qsw-wheel:not(.settled) .qsw-ico, #qsw-wheel:not(.settled) .qsw-pin-ico, #qsw-wheel:not(.settled) .qsw-cust-ico { filter: none !important; }

    /* Open: a ripple of the wheel colour from the button. */
    .qsw-ripple {
      position: absolute; inset: 0; border-radius: 50%; z-index: 1; pointer-events: none;
      border: 2px solid var(--qsw-a2); opacity: 0;
    }
    .qsw-ripple.go { animation: qsw-ripple .5s cubic-bezier(.2, .7, .3, 1) both; }
    @keyframes qsw-ripple {
      from { opacity: .75; transform: scale(.92); }
      to { opacity: 0; transform: scale(2.5); }
    }


    /* Hide Torn's nav links (by id, so PDA's swiper carousel is covered too). */
    body.qsw-sidebar-disabled [id^="nav-"] { display: none !important; }
    body.qsw-sidebar-disabled .swiper-container:has([id^="nav-"]) { display: none !important; }

    /* The fly-out drawer reuses the nav-* ids and holds state the stats bar relies on, so keep
       its links rendered and collapse the drawer to 0x0 instead. */
    body.qsw-sidebar-disabled #fly-out-panel [id^="nav-"] { display: revert !important; }
    body.qsw-sidebar-disabled:not(.qsw-flyout-open) #fly-out-panel {
      width: 0 !important;
      height: 0 !important;
      min-width: 0 !important;
      min-height: 0 !important;
      max-height: 0 !important;
      max-width: 0 !important;
      padding: 0 !important;
      margin: 0 !important;
      border: 0 !important;
      overflow: hidden !important;
    }

    /* Header menu button that opens the fly-out. */
    body.qsw-sidebar-disabled #fly-out-menu-button,
    body.qsw-sidebar-disabled button[aria-controls="fly-out-panel"] { display: none !important; }

    /* ---- main spin ring ---- */
    .qsw-wg {
      transform-box: view-box; transform-origin: var(--qsw-ox, ${SIZE}px) ${SIZE}px;
      opacity: 0; transform: rotate(calc(var(--qsw-in-rot, -16deg) * 1.7)) scale(.35);
      transition: transform .2s cubic-bezier(.55, 0, .75, .2) var(--rd, 0ms), opacity .16s ease var(--rd, 0ms);
      will-change: transform, opacity;
    }

    #qsw-wheel.open .qsw-wg {
      opacity: 1; transform: none;
      transition: transform .44s var(--spring) var(--d, 0ms), opacity .16s ease var(--d, 0ms);
    }

    #qsw-wheel.open .qsw-wg.on {
      transform: scale(1.045);
      transition: transform .18s var(--spring), opacity .18s ease;
    }

    #qsw-wheel.open.settled .qsw-wg { transition-delay: 0ms; }
    .qsw-seg-bg { fill: rgba(12, 14, 18, .62); }

    .qsw-seg {
      fill: url(#qsw-g-off); stroke: rgba(255,255,255,.16); stroke-width: 1;
      transition: fill .16s ease, stroke .16s ease, filter .16s ease;
    }

    .qsw-wg.featured .qsw-seg {
      stroke: var(--a2); stroke-width: 1.3;
      filter: drop-shadow(0 0 8px rgb(var(--qsw-a2-rgb) / .5));
    }

    .qsw-wg.on .qsw-seg {
      fill: url(#qsw-g-on); stroke: rgba(255,255,255,.7);
      filter: drop-shadow(0 0 12px rgb(var(--qsw-a2-rgb) / .65));
    }

    /* Energy full -> Gym wedge, Nerve full -> Crimes wedge. Scoped to .open to beat the base rule. */
    #qsw-wheel.open .qsw-wg.stat-full .qsw-seg {
      stroke: var(--stat); stroke-width: 1.4;
      filter: drop-shadow(0 0 10px var(--stat-glow));
    }

    #qsw-icons { position: absolute; inset: 0; pointer-events: none; }

    .qsw-ip {
      position: absolute; left: 0; top: 0; width: 30px; height: 30px;
      margin: -15px 0 0 -15px; will-change: transform, opacity;
    }

    .qsw-ico {
      width: 100%; height: 100%;
      color: rgba(255,255,255,.82);
      filter: drop-shadow(0 1px 3px rgba(0,0,0,.6));
      opacity: 0; transform: translate(var(--fx, 0px), var(--fy, 0px)) scale(.3);
      transition: transform .2s cubic-bezier(.55, 0, .75, .2) var(--rd, 0ms), opacity .16s ease var(--rd, 0ms), color .16s ease;
      will-change: transform, opacity;
    }

    .qsw-ico svg { width: 100%; height: 100%; display: block; }

    #qsw-wheel.open .qsw-ico {
      opacity: 1; transform: none;
      transition: transform .4s var(--spring) calc(var(--d, 0ms) + 90ms), opacity .16s ease calc(var(--d, 0ms) + 90ms), color .16s ease;
    }

    #qsw-wheel.open .qsw-ico.featured { color: #fff; transform: scale(1.14); }

    #qsw-wheel.open .qsw-ico.on {
      color: #fff; transform: translate(var(--ox, 0px), var(--oy, 0px)) scale(1.32);
      transition: transform .18s var(--spring), opacity .18s ease, color .16s ease;
      filter: drop-shadow(0 0 8px rgb(var(--qsw-a1-rgb) / .7)) drop-shadow(0 1px 3px rgba(0,0,0,.6));
    }

    #qsw-wheel.open .qsw-ico.stat-full { color: var(--stat); }
    /* Torn marked the link (new newspaper article, etc.): same glow as unread Messages/Events. */
    #qsw-wheel.open .qsw-wg.attn .qsw-seg {
      stroke: var(--alert); stroke-width: 1.5;
      filter: drop-shadow(0 0 9px rgb(var(--qsw-a1-rgb) / .6));
    }
    #qsw-wheel.open .qsw-ico.attn { color: var(--alert); }

    #qsw-wheel.open.settled .qsw-ico { transition-delay: 0ms; }

    /* ---- fixed pointer: marks the featured wedge while spinning ---- */
    #qsw-pointer {
      fill: var(--a2);
      opacity: 0; transition: opacity .18s ease;
      filter: drop-shadow(0 0 5px rgb(var(--qsw-a2-rgb) / .85));
    }

    #qsw-wheel.open.can-spin #qsw-pointer { opacity: 1; }

    /* ---- pinned band: Messages / Events / Awards, always present ---- */
    /* Outer bands bloom segment by segment after the ring (delays set per segment), and fold first. */
    .qsw-pg, .qsw-cg {
      transform-box: view-box; transform-origin: var(--qsw-ox, ${SIZE}px) ${SIZE}px;
      opacity: 0; transform: rotate(var(--qsw-in-rot, -16deg)) scale(.72);
      transition: transform .2s cubic-bezier(.55, 0, .75, .2) var(--rd, 0ms), opacity .16s ease var(--rd, 0ms);
    }
    #qsw-wheel.open .qsw-pg, #qsw-wheel.open .qsw-cg {
      opacity: 1; transform: none;
      transition: transform .38s var(--spring) var(--d, 0ms), opacity .16s ease var(--d, 0ms);
    }
    .qsw-pin-ico, .qsw-cust-ico {
      opacity: 0; transform: scale(.4);
      transition: transform .2s ease var(--rd, 0ms), opacity .16s ease var(--rd, 0ms);
    }
    #qsw-wheel.open .qsw-pin-ico, #qsw-wheel.open .qsw-cust-ico {
      opacity: 1; transform: none;
      transition: transform .36s var(--spring) calc(var(--d, 0ms) + 70ms), opacity .16s ease calc(var(--d, 0ms) + 70ms);
    }
    #qsw-wheel.open.settled .qsw-pg, #qsw-wheel.open.settled .qsw-cg,
    #qsw-wheel.open.settled .qsw-pin-ico, #qsw-wheel.open.settled .qsw-cust-ico,
    #qsw-wheel.open.settled .qsw-pin-badge { transition-delay: 0ms; }

    .qsw-pg-bg { fill: rgba(10, 12, 16, .55); }

    .qsw-pg-seg {
      fill: rgba(255,255,255,.06); stroke: rgba(255,255,255,.16); stroke-width: 1;
      transition: fill .14s ease, stroke .16s ease, filter .2s ease;
    }

    .qsw-pg.press .qsw-pg-seg { fill: rgba(255,255,255,.18); }

    .qsw-pg.alert .qsw-pg-seg {
      stroke: var(--alert); stroke-width: 1.5;
      filter: drop-shadow(0 0 9px rgb(var(--qsw-a1-rgb) / .6));
    }

    .qsw-pg.alert.press .qsw-pg-seg { fill: rgb(var(--qsw-a1-rgb) / .24); }

    #qsw-pin-icons { position: absolute; inset: 0; pointer-events: none; }

    .qsw-pin-ico {
      position: absolute; width: 26px; height: 26px; margin: -13px 0 0 -13px;
      color: rgba(255,255,255,.85); filter: drop-shadow(0 1px 3px rgba(0,0,0,.6));
    }

    .qsw-pin-ico svg { width: 100%; height: 100%; display: block; }

    .qsw-pin-badge {
      position: absolute; min-width: 17px; height: 17px; margin: -9px 0 0 -9px;
      padding: 0 3px; border-radius: 999px; background: var(--alert);
      color: var(--qsw-ink1); font: 700 10px/17px system-ui, sans-serif; text-align: center;
      box-shadow: 0 2px 6px rgba(0,0,0,.5), 0 0 0 2px rgba(16,18,22,.9);
      opacity: 0; transform: scale(.5);
      transition: opacity .18s ease, transform .26s var(--spring);
    }

    #qsw-wheel.open .qsw-pin-badge.show { opacity: 1; transform: scale(1); transition-delay: calc(var(--d, 0ms) + 160ms); }

    /* ---- custom-shortcut band: 5 user-assigned slots, outermost ring ---- */

    .qsw-cg-bg { fill: rgba(8, 9, 12, .42); }

    .qsw-cg-seg {
      fill: rgba(255,255,255,.055); stroke: rgba(255,255,255,.18); stroke-width: 1;
      transition: fill .14s ease, stroke .16s ease, filter .2s ease;
    }

    /* Empty slots: dashed and dimmer. */
    .qsw-cg.empty .qsw-cg-seg { fill: rgba(255,255,255,.02); stroke: rgba(255,255,255,.16); stroke-dasharray: 3 3; }
    .qsw-cg.press .qsw-cg-seg { fill: rgb(var(--qsw-a2-rgb) / .22); stroke: var(--a2); stroke-dasharray: none; }

    #qsw-cust-icons { position: absolute; inset: 0; pointer-events: none; }

    .qsw-cust-ico {
      position: absolute; width: 23px; height: 23px; margin: -11.5px 0 0 -11.5px;
      color: rgba(255,255,255,.85); filter: drop-shadow(0 1px 3px rgba(0,0,0,.6));
    }

    .qsw-cust-ico.empty { color: rgba(255,255,255,.4); }

    .qsw-cust-ico svg { width: 100%; height: 100%; display: block; }

    #qsw-label {
      position: absolute; right: -6px; bottom: 100%; margin-bottom: 16px;
      padding: 8px 14px; border-radius: 6px;
      background: #17191d; border: 1px solid rgba(255,255,255,.16);
      font: 600 12px/1 system-ui, -apple-system, sans-serif;
      letter-spacing: .16em; text-transform: uppercase; color: #fff; white-space: nowrap;
      pointer-events: none; opacity: 0; transform: translateY(8px) scale(.96);
      transition: opacity .22s var(--ease), transform .32s var(--spring);
    }

    #qsw-wheel.open #qsw-label { opacity: 1; transform: none; transition-delay: .14s; }
    #qsw-label.dim { color: rgba(255,255,255,.6); }
    #qsw-label.pop { animation: qsw-pop .2s var(--spring); }

    /* ---- animation levels (class on <html>) ---- */
    /* Balanced: lighter blur, no ripple, outer bands fade (no transform), PC wedges fade. */
    .qsw-anim-balanced #qsw-overlay { -webkit-backdrop-filter: blur(3px); backdrop-filter: blur(3px); }
    .qsw-anim-balanced .qsw-ripple, .qsw-anim-balanced .qsw-pc-ripple { display: none; }
    .qsw-anim-balanced .qsw-pg, .qsw-anim-balanced .qsw-cg, .qsw-anim-balanced .qsw-pin-ico,
    .qsw-anim-balanced .qsw-cust-ico { transform: none !important; }
    .qsw-anim-balanced .qsw-pcg > path { scale: 1; }
    /* Performance: a quick plain fade; no blur, glows, ripple or pulsing button. */
    .qsw-anim-perf #qsw-overlay, .qsw-anim-ultra #qsw-overlay {
      -webkit-backdrop-filter: none; backdrop-filter: none;
      background: radial-gradient(120% 120% at 100% 100%, rgba(6,8,12,.95), rgba(6,8,12,.86) 60%, rgba(6,8,12,.8));
    }
    .qsw-anim-perf #qsw-overlay { transition-duration: .15s; }
    /* Only the animated layers: the ring places its wedges and icons with transforms of its own. */
    .qsw-anim-perf :is(.qsw-wg, .qsw-ico, .qsw-pg, .qsw-cg, .qsw-pin-ico, .qsw-cust-ico, .qsw-pin-badge, #qsw-label, #qsw-pc-wheel) {
      transform: none !important; transition-delay: 0ms !important; transition-duration: .15s !important;
    }
    .qsw-anim-perf :is(.qsw-pcg > path, .qsw-pci) { scale: 1 !important; transition-delay: 0ms !important; transition-duration: .15s !important; }
    .qsw-anim-perf #qsw-wheel *, .qsw-anim-perf #qsw-pc * { filter: none !important; animation: none !important; }
    .qsw-anim-perf .qsw-ripple, .qsw-anim-perf #qsw-main.attention,
    .qsw-anim-ultra .qsw-ripple, .qsw-anim-ultra #qsw-main.attention { animation: none !important; }
    .qsw-anim-perf .qsw-ripple, .qsw-anim-ultra .qsw-ripple { display: none; }
    /* Ultra Performance: nothing moves; the wheel just appears and goes. */
    .qsw-anim-ultra #qsw-overlay, .qsw-anim-ultra #qsw-wheel, .qsw-anim-ultra #qsw-wheel *,
    .qsw-anim-ultra #qsw-pc, .qsw-anim-ultra #qsw-pc *, .qsw-anim-ultra #qsw-main, .qsw-anim-ultra #qsw-main * {
      transition: none !important; animation: none !important;
    }
    .qsw-anim-ultra :is(.qsw-wg, .qsw-ico, .qsw-pg, .qsw-cg, .qsw-pin-ico, .qsw-cust-ico, .qsw-pin-badge, #qsw-label, #qsw-pc-wheel) { transform: none !important; }
    .qsw-anim-ultra :is(.qsw-pcg > path, .qsw-pci) { scale: 1 !important; }
    .qsw-anim-ultra #qsw-wheel *, .qsw-anim-ultra #qsw-pc * { filter: none !important; }
    .qsw-anim-ultra #qsw-main { box-shadow: none; }

    /* Reduce motion: a plain quick fade, no fans, ripple or glint. */
    @media (prefers-reduced-motion: reduce) {
      .qsw-wg, .qsw-ico, .qsw-pg, .qsw-cg, .qsw-pin-ico, .qsw-cust-ico { transform: none; transition: opacity .15s ease !important; }
      .qsw-ripple { display: none; }
    }

    @keyframes qsw-pop {
      from { opacity: .35; transform: translateY(5px) scale(.95); }
      to { opacity: 1; transform: none; }
    }

    /* ---- desktop mode: no button; settings and picker sit mid-screen ---- */
    #qsw-root.qsw-pc-mode { width: 0; height: 0; pointer-events: none; transform: none; }
    #qsw-root.qsw-pc-mode #qsw-main, #qsw-root.qsw-pc-mode #qsw-wheel { display: none; }
    #qsw-root.qsw-pc-mode #qsw-panel {
      position: fixed; left: 50%; top: 50%; right: auto; bottom: auto;
      transform-origin: 50% 50%; transform: translate(-50%, -46%) scale(.96);
    }
    #qsw-root.qsw-pc-mode #qsw-panel.show { transform: translate(-50%, -50%); }
    #qsw-root.qsw-pc-mode #qsw-panel { max-height: calc(100vh - 24px); overflow-y: auto; }
    #qsw-root.qsw-pc-mode #qsw-picker {
      left: 50%; right: auto; top: 50%; bottom: auto;
      width: 420px; max-width: calc(100vw - 20px);
      transform-origin: 50% 50%; transform: translate(-50%, calc(-50% + 16px)) scale(.97);
    }
    #qsw-root.qsw-pc-mode #qsw-picker.show { transform: translate(-50%, -50%); }
    #qsw-root.qsw-pc-mode .qsw-pk-item { cursor: pointer; }
    #qsw-root.qsw-pc-mode .qsw-pk-item:hover { background: rgb(var(--qsw-a2-rgb) / .14); border-color: rgb(var(--qsw-a2-rgb) / .5); }
    #qsw-root.qsw-pc-mode #qsw-pk-close, #qsw-root.qsw-pc-mode #qsw-pk-clear,
    #qsw-root.qsw-pc-mode #qsw-pk-back, #qsw-root.qsw-pc-mode #qsw-pk-save { cursor: pointer; }

    /* Desktop only: the 5 custom shortcuts, set from Settings. */
    .qsw-pslots { display: none; margin: 0 0 12px; }
    #qsw-root.qsw-pc-mode .qsw-pslots { display: block; }
    #qsw-root.qsw-pc-mode #qsw-panel { width: 260px; }
    #qsw-pslot-list { display: flex; flex-direction: column; gap: 5px; }
    .qsw-pslot {
      display: flex; align-items: center; gap: 9px; width: 100%; padding: 7px 10px;
      height: auto; min-height: 34px; margin: 0; box-sizing: border-box;
      border-radius: 6px; border: 1px solid rgba(255,255,255,.12); background: rgba(255,255,255,.04);
      color: #fff; font: 500 12.5px/18px system-ui, sans-serif; text-align: left; cursor: pointer;
    }
    .qsw-pslot:hover { background: rgb(var(--qsw-a2-rgb) / .14); border-color: rgb(var(--qsw-a2-rgb) / .5); }
    .qsw-pslot svg { width: 17px; height: 17px; flex: 0 0 17px; color: var(--a2); }
    /* Own line box: Torn's button styles otherwise squash it and the ellipsis clip cuts letters. */
    .qsw-pslot span {
      display: block; min-width: 0; padding: 1px 0; font: inherit; line-height: 18px;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    .qsw-pslot.empty { border-style: dashed; color: rgba(255,255,255,.5); }
    .qsw-pslot.empty svg { color: rgba(255,255,255,.4); }

    /* Desktop (Windows) only: which mouse button opens the wheel. */
    .qsw-ptrig { display: none; margin: 0 0 12px; }
    #qsw-root.qsw-pc-mode.qsw-win .qsw-ptrig { display: block; }
    .qsw-ptrig-l { margin-bottom: 6px; font: 600 10px/1 system-ui, sans-serif; letter-spacing: .14em; text-transform: uppercase; color: rgba(255,255,255,.6); }
    .qsw-ptrig-seg { display: flex; gap: 6px; }
    /* Mobile only: idle button opacity. */
    .qsw-pop { margin: 0 0 6px; }
    #qsw-root.qsw-pc-mode .qsw-pop { display: none; }
    .qsw-pop-head { display: flex; justify-content: space-between; align-items: baseline; }
    .qsw-pop-val { font: 600 12px/1 system-ui, sans-serif; color: var(--a2); }
    .qsw-slider { position: relative; height: 32px; touch-action: none; cursor: pointer; outline: none; }
    .qsw-sl-track { position: absolute; left: 11px; right: 11px; top: 13px; height: 6px; border-radius: 3px; background: rgba(255,255,255,.14); }
    .qsw-sl-fill { position: absolute; left: 0; top: 0; bottom: 0; width: calc(var(--f, 0) * 100%); border-radius: 3px; background: var(--a2); }
    .qsw-sl-thumb {
      position: absolute; top: 5px; left: calc(11px + (100% - 22px) * var(--f, 0)); width: 22px; height: 22px; margin-left: -11px;
      box-sizing: border-box; border-radius: 50%; background: #fff; border: 2px solid var(--a2);
      transition: transform .15s var(--spring);
    }
    .qsw-slider.active .qsw-sl-thumb { transform: scale(1.15); }
    .qsw-slider:focus-visible .qsw-sl-thumb { box-shadow: 0 0 0 3px rgb(var(--qsw-a2-rgb) / .4); }
    .qsw-ptrig-seg button {
      flex: 1; padding: 8px 6px; border-radius: 6px; cursor: pointer;
      height: auto; margin: 0; line-height: 18px; box-sizing: border-box;
      border: 1px solid rgba(255,255,255,.16); background: rgba(255,255,255,.06);
      color: #fff; font: 600 12px system-ui, sans-serif;
    }
    .qsw-ptrig-seg button.on { border-color: var(--a2); background: rgb(var(--qsw-a2-rgb) / .2); color: var(--a1); }

    /* Desktop options: on/off switches. */
    .qsw-popts { display: none; margin: 0 0 12px; }
    #qsw-root.qsw-pc-mode .qsw-popts { display: block; }
    .qsw-ptog {
      display: flex; align-items: center; justify-content: space-between; width: 100%;
      height: auto; margin: 0 0 5px; padding: 7px 10px; box-sizing: border-box; cursor: pointer;
      border-radius: 6px; border: 1px solid rgba(255,255,255,.12); background: rgba(255,255,255,.04);
      color: #fff; font: 500 12.5px/18px system-ui, sans-serif; text-align: left;
    }
    .qsw-ptog:hover { border-color: rgb(var(--qsw-a2-rgb) / .5); }
    .qsw-ptog span { line-height: 18px; }
    .qsw-ptog i {
      position: relative; flex: 0 0 30px; width: 30px; height: 16px; border-radius: 999px;
      background: rgba(255,255,255,.18); transition: background .15s ease;
    }
    .qsw-ptog i::after {
      content: ''; position: absolute; top: 2px; left: 2px; width: 12px; height: 12px;
      border-radius: 50%; background: #fff; transition: transform .18s var(--spring);
    }
    .qsw-ptog.on i { background: var(--a2); }
    .qsw-ptog.on i::after { transform: translateX(14px); }

    /* Desktop wheel button (optional): click to open, drag to move. */
    #qsw-pcbtn {
      position: fixed; z-index: 2147483643; width: 44px; height: 44px; margin: -22px 0 0 -22px;
      border-radius: 50%; box-sizing: border-box; cursor: pointer; touch-action: none;
      display: flex; align-items: center; justify-content: center; color: #fff;
      background: linear-gradient(135deg, rgba(255,255,255,.2), rgba(255,255,255,.04)), #15171b;
      border: 1px solid rgba(255,255,255,.16); opacity: .55;
      transition: opacity .2s ease, border-color .2s ease, transform .18s cubic-bezier(.34, 1.56, .64, 1);
      user-select: none; -webkit-user-select: none;
    }
    #qsw-pcbtn:hover { opacity: 1; border-color: var(--qsw-a2); }
    #qsw-pcbtn.drag { opacity: 1; transform: scale(1.08); cursor: grabbing; }
    #qsw-pcbtn svg { width: 19px; height: 19px; transform: rotate(-45deg); }

    /* First desktop visit: how to open the wheel. */
    #qsw-pchint {
      position: fixed; left: 50%; bottom: 24px; z-index: 2147483646; box-sizing: border-box;
      width: 380px; max-width: calc(100vw - 32px); padding: 14px 16px;
      transform: translate(-50%, 12px); opacity: 0; pointer-events: none;
      transition: opacity .2s ease, transform .3s cubic-bezier(.34, 1.56, .64, 1);
      border-radius: 8px; background: #17191d; border: 1px solid rgba(255,255,255,.14);
      border-left: 3px solid var(--qsw-a2); color: #fff;
      font: 13px/1.45 system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
    }
    #qsw-pchint.show, #qsw-pdatip.show { opacity: 1; transform: translate(-50%, 0); pointer-events: auto; }
    #qsw-pdatip {
      position: fixed; left: 50%; top: calc(16px + env(safe-area-inset-top, 0px)); z-index: 2147483646; box-sizing: border-box;
      width: 380px; max-width: calc(100vw - 32px); padding: 14px 16px;
      transform: translate(-50%, -12px); opacity: 0; pointer-events: none;
      transition: opacity .2s ease, transform .3s cubic-bezier(.34, 1.56, .64, 1);
      border-radius: 8px; background: #17191d; border: 1px solid rgba(255,255,255,.14);
      border-left: 3px solid var(--qsw-a2); color: #fff;
      font: 13px/1.45 system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
    }
    #qsw-pdatip b, #qsw-pchint b { display: block; margin-bottom: 3px; font: 600 11px/1.2 system-ui, sans-serif; letter-spacing: .14em; text-transform: uppercase; color: var(--qsw-a2); }
    #qsw-pchint button, #qsw-pdatip button {
      display: block; margin: 10px 0 0 auto; padding: 6px 14px; height: auto; line-height: 18px;
      border: none; border-radius: 6px; background: var(--qsw-a2); color: var(--qsw-ink);
      font: 600 12px system-ui, sans-serif; cursor: pointer;
    }

    /* ---- desktop compass wheel, opened at the cursor ---- */
    #qsw-pc {
      --a1: var(--qsw-a1); --a2: var(--qsw-a2); --alert: var(--qsw-a1);
      --stat: var(--qsw-stat); --stat-glow: rgb(var(--qsw-stat-rgb) / .65);
      --spring: cubic-bezier(.34, 1.56, .64, 1); --ease: cubic-bezier(.22, 1, .36, 1);
      position: fixed; inset: 0; z-index: 2147483644; pointer-events: none;
      font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
      user-select: none; -webkit-user-select: none;
    }
    /* Catches clicks only when the mouse drives it; while Ctrl+Shift is held, clicks pass through. */
    #qsw-pc.open.grab { pointer-events: auto; cursor: default; }
    #qsw-pc-dim {
      position: absolute; inset: 0; opacity: 0; transition: opacity .14s ease;
      background: radial-gradient(circle at var(--qsw-x, 50%) var(--qsw-y, 50%), rgba(6,8,12,.55), rgba(6,8,12,.28) 300px, rgba(6,8,12,.14));
    }
    #qsw-pc.open #qsw-pc-dim { opacity: 1; }
    #qsw-pc-wheel {
      position: absolute; left: 0; top: 0;
      opacity: 0; transform: scale(.9);
      transition: opacity .12s ease, transform .2s var(--spring);
    }
    /* Bloom: wedges sweep in round the circle from the hub (delay set per wedge), icons just after. */
    .qsw-pcg > path {
      transform-box: view-box; transform-origin: 50% 50%; scale: .62; opacity: 0;
      transition: scale .12s ease-in, opacity .1s ease, fill .12s ease, stroke .12s ease, filter .12s ease;
    }
    #qsw-pc.open .qsw-pcg > path {
      scale: 1; opacity: 1;
      transition: scale .28s var(--spring) var(--d, 0ms), opacity .12s ease var(--d, 0ms), fill .12s ease, stroke .12s ease, filter .12s ease;
    }
    #qsw-pc .qsw-pci { scale: .4; opacity: 0; }
    #qsw-pc.open .qsw-pci {
      scale: 1; opacity: 1;
      transition: scale .28s var(--spring) calc(var(--d, 0ms) + 40ms), opacity .12s ease calc(var(--d, 0ms) + 40ms), transform .16s var(--spring), color .12s ease;
    }
    .qsw-pc-ripple {
      fill: none; stroke: var(--qsw-a2); stroke-width: 2; opacity: 0; pointer-events: none;
      transform-box: fill-box; transform-origin: center;
    }
    #qsw-pc.open .qsw-pc-ripple { animation: qsw-pcrip .42s cubic-bezier(.2, .7, .3, 1) both; }
    @keyframes qsw-pcrip { from { opacity: .7; transform: scale(.6); } to { opacity: 0; transform: scale(2.3); } }
    @media (prefers-reduced-motion: reduce) {
      .qsw-pcg > path, #qsw-pc .qsw-pci { scale: 1; }
      .qsw-pc-ripple { display: none; }
    }
    #qsw-pc.open #qsw-pc-wheel { opacity: 1; transform: none; }
    #qsw-pc-wheel > svg { position: absolute; inset: 0; overflow: visible; }
    .qsw-pcw-bg { fill: #121418; } /* solid: busy pages (the City list) otherwise show through */
    .qsw-pc-hub { fill: #121418; stroke: rgba(255,255,255,.08); stroke-width: 1; }
    /* Solid disc under the ring: the gaps between wedges would otherwise show page text. */
    .qsw-pc-back { fill: #0b0c0f; filter: drop-shadow(0 10px 28px rgba(0,0,0,.55)); }
    .qsw-pcw {
      fill: url(#qsw-pc-g-off); stroke: rgba(255,255,255,.16); stroke-width: 1;
      transition: fill .12s ease, stroke .12s ease, filter .12s ease;
    }
    .qsw-pcg.empty .qsw-pcw { fill: rgba(255,255,255,.02); stroke-dasharray: 3 3; }
    .qsw-pcg.alert .qsw-pcw { stroke: var(--alert); stroke-width: 1.5; filter: drop-shadow(0 0 9px rgb(var(--qsw-a1-rgb) / .6)); }
    .qsw-pcg.stat-full .qsw-pcw { stroke: var(--stat); stroke-width: 1.4; filter: drop-shadow(0 0 10px var(--stat-glow)); }
    .qsw-pcg.on .qsw-pcw {
      fill: url(#qsw-pc-g-on); stroke: rgba(255,255,255,.7); stroke-dasharray: none;
      filter: drop-shadow(0 0 12px rgb(var(--qsw-a2-rgb) / .65));
    }
    #qsw-pc-icons { position: absolute; inset: 0; pointer-events: none; }
    .qsw-pci {
      position: absolute; width: 26px; height: 26px; margin: -13px 0 0 -13px;
      color: rgba(255,255,255,.82); filter: drop-shadow(0 1px 3px rgba(0,0,0,.6));
      transition: transform .16s var(--spring), color .12s ease;
    }
    .qsw-pci.small { width: 23px; height: 23px; margin: -11.5px 0 0 -11.5px; }
    .qsw-pci.link { width: 22px; height: 22px; margin: -11px 0 0 -11px; } /* link wedges are narrow */
    .qsw-pci svg { width: 100%; height: 100%; display: block; }
    .qsw-pci.empty { color: rgba(255,255,255,.4); }
    .qsw-pci.stat-full { color: var(--stat); }
    .qsw-pcg.attn .qsw-pcw { stroke: var(--alert); stroke-width: 1.5; filter: drop-shadow(0 0 9px rgb(var(--qsw-a1-rgb) / .6)); }
    .qsw-pci.attn { color: var(--alert); }
    .qsw-pci.on { color: #fff; transform: scale(1.25); filter: drop-shadow(0 0 8px rgb(var(--qsw-a1-rgb) / .7)) drop-shadow(0 1px 3px rgba(0,0,0,.6)); }
    .qsw-pcb {
      position: absolute; min-width: 17px; height: 17px; margin: -9px 0 0 -9px;
      padding: 0 3px; border-radius: 999px; background: var(--alert); box-sizing: border-box;
      color: var(--qsw-ink1); font: 700 10px/17px system-ui, sans-serif; text-align: center;
      box-shadow: 0 2px 6px rgba(0,0,0,.5), 0 0 0 2px rgba(16,18,22,.9);
    }
    #qsw-pc-label {
      position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%);
      padding: 7px 12px; border-radius: 6px; background: #17191d;
      border: 1px solid rgba(255,255,255,.16); color: #fff; white-space: nowrap;
      font: 600 11px/1 system-ui, -apple-system, sans-serif; letter-spacing: .14em; text-transform: uppercase;
      pointer-events: none;
    }
    #qsw-pc-label.hide { display: none; }

    @media (prefers-reduced-motion: reduce) {
      #qsw-pc *, #qsw-root.qsw-pc-mode * { transition-duration: .01s !important; }
    }

    @media (prefers-reduced-motion: reduce) {
      #qsw-root *, #qsw-root *::before {
        transition-duration: .01s !important;
        transition-delay: 0s !important;
        animation: none !important;
      }
    }
  `;

  document.head.appendChild(style);

  // ---------- DOM ----------
  const overlay = document.createElement('div');
  overlay.id = 'qsw-overlay';

  const root = document.createElement('div');
  root.id = 'qsw-root';

  const wheel = document.createElement('div');
  wheel.id = 'qsw-wheel';
  wheel.innerHTML = `
    <svg viewBox="0 0 ${SIZE} ${SIZE}" width="${SIZE}" height="${SIZE}">
      <defs>
        <linearGradient id="qsw-g-off" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#fff" stop-opacity=".2"/>
          <stop offset="1" stop-color="#fff" stop-opacity=".04"/>
        </linearGradient>
        <linearGradient id="qsw-g-on" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" style="stop-color:var(--qsw-a1)" stop-opacity=".8"/>
          <stop offset="1" style="stop-color:var(--qsw-a2)" stop-opacity=".4"/>
        </linearGradient>
      </defs>
      <g id="qsw-cust-group"></g>
      <g id="qsw-pin-group"></g>
      <g id="qsw-segs"></g>
      <path id="qsw-pointer"/>
    </svg>
    <div id="qsw-cust-icons"></div>
    <div id="qsw-pin-icons"></div>
    <div id="qsw-icons"></div>
    <div id="qsw-label" class="dim">Quick select</div>`;

  root.appendChild(wheel);

  const main = document.createElement('div');
  main.id = 'qsw-main';
  main.innerHTML = svg(MAIN_ICONS.close);

  root.appendChild(main);
  const ripple = document.createElement('span');
  ripple.className = 'qsw-ripple';
  root.appendChild(ripple);

  const panel = document.createElement('div');
  panel.id = 'qsw-panel';
  panel.innerHTML = `
    <div class="qsw-pview-main">
      <div class="qsw-ptitle">Quick select</div>
      <div class="qsw-psync">
        <div class="qsw-ptrig-l">Sidebar links</div>
        <div class="qsw-psync-row"><div class="qsw-pstat" id="qsw-pstat"></div><button id="qsw-prefresh" type="button">Refresh</button></div>
        <div class="qsw-pnote" id="qsw-pnote"></div>
      </div>
      <div class="qsw-pslots">
        <div class="qsw-ptrig-l">Shortcuts</div>
        <div id="qsw-pslot-list"></div>
      </div>
      <div class="qsw-ptrig">
        <div class="qsw-ptrig-l">Open wheel with</div>
        <div class="qsw-ptrig-seg"><button type="button" data-v="right">Hold right</button><button type="button" data-v="middle">Middle click</button></div>
      </div>
      <div class="qsw-pop">
        <div class="qsw-pop-head"><div class="qsw-ptrig-l">Button opacity</div><span class="qsw-pop-val" id="qsw-popacity-val"></span></div>
        <div id="qsw-popacity" class="qsw-slider" role="slider" tabindex="0" aria-label="Button opacity" aria-valuemin="10" aria-valuemax="100"><div class="qsw-sl-track"><div class="qsw-sl-fill"></div></div><div class="qsw-sl-thumb"></div></div>
      </div>
      <div class="qsw-pcolsec">
        <div class="qsw-ptrig-l">Wheel colour</div>
        <button type="button" id="qsw-pcol"><i class="qsw-sw"></i><span id="qsw-pcol-name"></span><b>›</b></button>
      </div>
      <div class="qsw-pcolsec">
        <div class="qsw-ptrig-l">Animation</div>
        <button type="button" id="qsw-panim"><span id="qsw-panim-name"></span><b>›</b></button>
      </div>
      <div class="qsw-popts">
        <div class="qsw-ptrig-l">Options</div>
        <button type="button" class="qsw-ptog" data-opt="button"><span>Wheel button</span><i></i></button>
        <button type="button" class="qsw-ptog" data-opt="keys"><span>Ctrl+Shift shortcut</span><i></i></button>
      </div>
      <button id="qsw-pcredits" type="button">Credits</button>
    </div>
    <div class="qsw-pview-colours">
      <div class="qsw-ptitle">Wheel colour</div>
      <button type="button" class="qsw-ptog qsw-cbtog" id="qsw-cbmode"><span>Colour-blind mode</span><i></i></button>
      <div class="qsw-cbnote">Colours that stay distinct with most kinds of colour blindness.</div>
      <div class="qsw-cgrid" id="qsw-cgrid"></div>
      <button id="qsw-pcolback" type="button">Done</button>
    </div>
    <div class="qsw-pview-anim">
      <div class="qsw-ptitle">Animation</div>
      <div class="qsw-alist" id="qsw-alist"></div>
      <button id="qsw-panimback" type="button">Done</button>
    </div>
    <div class="qsw-pview-credits">
      <div class="qsw-ptitle">Credits</div>
      <div class="qsw-csec">Developer</div>
      <a class="qsw-cname" href="/profiles.php?XID=1316121">Callaghan <span>[1316121]</span></a>
      <div class="qsw-csec">Thanks for testing</div>
      <a class="qsw-cname" href="/profiles.php?XID=2261496">Afanen <span>[2261496]</span></a>
      <a class="qsw-cname" href="/profiles.php?XID=2987822">Exodus <span>[2987822]</span></a>
      <a class="qsw-cname" href="/profiles.php?XID=3808575">Lurnz <span>[3808575]</span></a>
      <button id="qsw-pcback" type="button">Back</button>
    </div>`;

  root.appendChild(panel);

  // ---------- shortcut picker ----------
  const picker = document.createElement('div');
  picker.id = 'qsw-picker';
  picker.innerHTML = `
    <div class="qsw-pk-head">
      <div class="qsw-pk-title">Choose a shortcut</div>
      <button id="qsw-pk-close" type="button" aria-label="Close">&times;</button>
    </div>
    <input id="qsw-pk-search" type="text" placeholder="Search shortcuts…" autocomplete="off">
    <button id="qsw-pk-clear" type="button" class="qsw-pk-clearbtn">Clear this shortcut</button>
    <div id="qsw-pk-list"></div>
    <div id="qsw-pk-confirm" class="qsw-pk-confirm">
      <div class="qsw-pk-ctitle"></div>
      <div class="qsw-pk-cnote">Torn's exact URL for this one hasn't been captured yet — paste or type it below (you'll only need to do this once).</div>
      <input id="qsw-pk-url" type="text" placeholder="/page.php?sid=…" autocomplete="off">
      <div class="qsw-pk-crow">
        <button id="qsw-pk-back" type="button">Back</button>
        <button id="qsw-pk-save" type="button">Save &amp; assign</button>
      </div>
    </div>`;

  root.appendChild(picker);

  const pbg = document.createElement('div');
  pbg.id = 'qsw-pbg';

  const segsG = wheel.querySelector('#qsw-segs');
  const iconsLayer = wheel.querySelector('#qsw-icons');
  const labelEl = wheel.querySelector('#qsw-label');
  const pointerEl = wheel.querySelector('#qsw-pointer');
  const pinGroup = wheel.querySelector('#qsw-pin-group');
  const pinIconsLayer = wheel.querySelector('#qsw-pin-icons');
  const custGroup = wheel.querySelector('#qsw-cust-group');
  const custIconsLayer = wheel.querySelector('#qsw-cust-icons');

  // ---------- main ring: build + render ----------
  const rr = (R_IN + R_OUT) / 2;

  function rebuild() {
    n = items.length;
    canSpin = n > VISIBLE;
    vis = canSpin ? VISIBLE : n;
    step = canSpin ? STEP_SPIN : (n ? 90 / n : 90);

    if (!canSpin || rot >= n) rot = 0;
    rot = Math.round(rot);
    vel = 0;
    wheel.classList.toggle('can-spin', canSpin);

    const d = arcPath(R_IN, R_OUT, 90 + GAP_DEG / 2, 90 + step - GAP_DEG / 2);

    segsG.innerHTML = items.map(() =>
      `<g class="qsw-it"><g class="qsw-wg"><path class="qsw-seg-bg" d="${d}"/><path class="qsw-seg" d="${d}"/></g></g>`
    ).join('');

    iconsLayer.innerHTML = items.map(it =>
      `<div class="qsw-ip"><div class="qsw-ico">${it.svg}</div></div>`
    ).join('');

    reg = items.map((_, i) => ({
      it: segsG.children[i],
      wg: segsG.children[i].querySelector('.qsw-wg'),
      ip: iconsLayer.children[i],
      ico: iconsLayer.children[i].querySelector('.qsw-ico'),
    }));

    if (canSpin) {
      const anchorAngle = 90 + step / 2;
      pointerEl.setAttribute('d', pointerTriangle((R_OUT + PIN_R_IN) / 2, anchorAngle));
    }

    activeI = -1;
    featI = -1;
    lastTickI = Math.round(rot);
    render();
    updateFeatured();
    refreshLabel(false);
    applyStatFull();
  }

  // Highlights Gym when Energy is full and Crimes when Nerve is full (matched by URL).
  function applyStatFull() {
    reg.forEach((r, i) => {
      const it = items[i];
      const full = it && ((energyFull && isGymItem(it)) || (nerveFull && isCrimesItem(it)));
      r.wg.classList.toggle('stat-full', !!full);
      r.ico.classList.toggle('stat-full', !!full);
      const attn = !full && hasAttention(it);
      r.wg.classList.toggle('attn', attn);
      r.ico.classList.toggle('attn', attn);
    });
  }

  // Runs on the poll timer.
  function refreshStats() {
    const s = readStats();
    energyFull = s.energyFull;
    nerveFull = s.nerveFull;
    applyStatFull();
  }

  function slotPos(i) {
    return canSpin ? mod(i - rot + 1.5, n) - 1.5 : i;
  }

  function render() {
    for (let i = 0; i < n; i++) {
      const p = slotPos(i);
      const e = Math.max(-p, p + 1 - vis, 0);
      const v = Math.max(0, 1 - e * 1.25);
      const { it, ip } = reg[i];

      if (v <= 0.01) {
        it.style.display = 'none';
        ip.style.display = 'none';
        continue;
      }

      it.style.display = '';
      ip.style.display = '';
      it.setAttribute('transform', `rotate(${(-SX() * p * step).toFixed(2)} ${OX()} ${SIZE})`);
      it.style.opacity = v.toFixed(3);

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
      ico.style.setProperty('--fx', ((OX() - x) * 0.55).toFixed(1) + 'px');
      ico.style.setProperty('--fy', ((SIZE - y) * 0.55).toFixed(1) + 'px');
    }
  }

  // which item currently sits nearest the fixed pointer (slot 0) while the wheel can spin
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
      text = canSpin ? 'Drag to browse' : 'Quick select';
      dim = true;
    }

    if (text === shownLabel) return;

    shownLabel = text;
    labelEl.textContent = text;
    labelEl.classList.toggle('dim', dim);

    if (animate) {
      labelEl.classList.remove('pop');
      void labelEl.offsetWidth;
      labelEl.classList.add('pop');
    }
  }

  function setActive(i) {
    if (i === activeI) return;

    if (activeI >= 0 && reg[activeI]) {
      reg[activeI].wg.classList.remove('on');
      reg[activeI].ico.classList.remove('on');
    }

    activeI = i;

    if (i >= 0 && reg[i]) {
      const mid = 90 + (slotPos(i) + 0.5) * step;
      const rad = (mid * Math.PI) / 180;

      reg[i].ico.style.setProperty('--ox', (Math.cos(rad) * 7).toFixed(1) + 'px');
      reg[i].ico.style.setProperty('--oy', (-Math.sin(rad) * 7).toFixed(1) + 'px');
      reg[i].wg.classList.add('on');
      reg[i].ico.classList.add('on');
      haptic(8);
    }

    refreshLabel(true);
  }

  // ---------- pinned band: build + render ----------
  // Open: segments arrive one after another from the pointer end. Close: the outer bands fold first.
  const bandDelay = (base, step, i, count, closeStep) => `--d:${base + i * step}ms;--rd:${(count - 1 - i) * closeStep}ms`;

  function buildPinned() {
    pinGroup.innerHTML = pinned.map((p, i) => {
      const a1 = 90 + i * PIN_SPAN + PIN_GAP_DEG / 2;
      const a2 = 90 + (i + 1) * PIN_SPAN - PIN_GAP_DEG / 2;
      const d = arcPath(PIN_R_IN, PIN_R_OUT, a1, a2);
      return `<g class="qsw-pg" style="${bandDelay(110, 45, i, pinned.length, 6)}"><path class="qsw-pg-bg" d="${d}"/><path class="qsw-pg-seg" d="${d}"/></g>`;
    }).join('');

    pinIconsLayer.innerHTML = pinned.map((p, i) => {
      const mid = 90 + (i + 0.5) * PIN_SPAN;
      const [ix, iy] = polar((PIN_R_IN + PIN_R_OUT) / 2 - 3, mid);
      const [bx, by] = polar(PIN_R_OUT - 9, 90 + i * PIN_SPAN + PIN_SPAN * 0.76);
      const dl = bandDelay(110, 45, i, pinned.length, 6);
      return `<div class="qsw-pin-ico" style="left:${ix}px;top:${iy}px;${dl}">${p.svg}</div>` +
        `<div class="qsw-pin-badge" style="left:${bx}px;top:${by}px;${dl}">${p.badge > 99 ? '99+' : p.badge}</div>`;
    }).join('');

    pgEls = [...pinGroup.querySelectorAll('.qsw-pg')];
    pinIcoEls = [...pinIconsLayer.querySelectorAll('.qsw-pin-ico')];
    pinBadgeEls = [...pinIconsLayer.querySelectorAll('.qsw-pin-badge')];
    updatePinnedBadges();
  }

  function updatePinnedBadges() {
    pinned.forEach((p, i) => {
      const has = p.badge > 0;
      if (pgEls[i]) pgEls[i].classList.toggle('alert', has);
      if (pinBadgeEls[i]) {
        pinBadgeEls[i].classList.toggle('show', has);
        pinBadgeEls[i].textContent = p.badge > 99 ? '99+' : String(p.badge);
      }
    });
  }

  // ---------- custom band: build + render ----------
  function buildCustom() {
    custGroup.innerHTML = customSlots.map((_, i) => {
      const a1 = 90 + i * CUST_SPAN + CUST_GAP_DEG / 2;
      const a2 = 90 + (i + 1) * CUST_SPAN - CUST_GAP_DEG / 2;
      const d = arcPath(CUST_R_IN, CUST_R_OUT, a1, a2);
      return `<g class="qsw-cg" style="${bandDelay(170, 35, i, CUST_COUNT, 5)}"><path class="qsw-cg-bg" d="${d}"/><path class="qsw-cg-seg" d="${d}"/></g>`;
    }).join('');

    custIconsLayer.innerHTML = customSlots.map((slot, i) => {
      const mid = 90 + (i + 0.5) * CUST_SPAN;
      const [ix, iy] = polar((CUST_R_IN + CUST_R_OUT) / 2, mid);
      // Use the catalogue's current icon so saved slots pick up icon changes.
      const cat = slot && CATALOG_BY_ID[slot.catalogId];
      const svgContent = slot ? (cat ? cat.svg : slot.svg) : svg(CAT_ICONS.plus);
      return `<div class="qsw-cust-ico${slot ? '' : ' empty'}" style="left:${ix}px;top:${iy}px;${bandDelay(170, 35, i, CUST_COUNT, 5)}">${svgContent}</div>`;
    }).join('');

    cgEls = [...custGroup.querySelectorAll('.qsw-cg')];
    custIcoEls = [...custIconsLayer.querySelectorAll('.qsw-cust-ico')];
    customSlots.forEach((slot, i) => {
      if (cgEls[i]) cgEls[i].classList.toggle('empty', !slot);
    });
  }

  // Re-reads the pinned badges. Runs on open and on the poll timer.
  function refreshPinned() {
    pinned = readPinned();
    if (open) {
      if (pgEls.length === pinned.length) updatePinnedBadges();
      else buildPinned();
    }
    checkNotifications();
  }

  // Drop any text selection a long-press managed to start (iOS can still begin one).
  function clearSelection() {
    try {
      const sel = window.getSelection();
      if (sel && sel.rangeCount && !(document.activeElement && /^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName))) sel.removeAllRanges();
    } catch (_) {}
  }
  // While the wheel is open or being pressed, nothing on the page may start a selection.
  document.addEventListener('selectstart', e => {
    const t = e.target && (e.target.nodeType === 1 ? e.target : e.target.parentElement);
    if (t && t.closest && t.closest('#qsw-root input')) return;
    if (open || gesture || pressTimer) e.preventDefault();
  }, true);

  // ---------- open / close ----------
  let closeT = null, backdropT = null;
  function setOpen(state) {
    open = state;
    main.classList.toggle('open', open);
    clearTimeout(backdropT);
    if (open) overlay.classList.remove('leaving');
    overlay.classList.toggle('show', open || overlay.classList.contains('show'));
    clearTimeout(settleT);
    wheel.classList.remove('settled');

    if (open) {
      clearSelection();
      fitWheel();
      pinned = readPinned();
      buildPinned();
      refreshStats();
      buildCustom();
      prepEntrance();
      clearTimeout(closeT);
      wheel.classList.remove('closing');
      ripple.classList.remove('go');
      void ripple.offsetWidth;
      ripple.classList.add('go');
      wheel.classList.add('open');
      settleT = setTimeout(() => wheel.classList.add('settled'), 720);
    } else {
      wheel.classList.remove('open');
      wheel.classList.add('closing');
      overlay.classList.add('leaving'); // taps go straight through; the backdrop goes once the fold is done
      clearTimeout(closeT);
      const fold = animLevel === 'ultra' ? 0 : animLevel === 'perf' ? 150 : 210;
      closeT = setTimeout(() => wheel.classList.remove('closing'), fold + 50);
      backdropT = setTimeout(() => overlay.classList.remove('show', 'leaving'), fold);
      setActive(-1);
      dragging = false;
      spinning = false;
      vel = 0;
      gesture = null;
      pgEls.forEach(el => el.classList.remove('press'));
      cgEls.forEach(el => el.classList.remove('press'));
      rot = n ? mod(Math.round(rot), n) : 0;
      render();
      updateFeatured();
      refreshLabel(false);

      if (pendingRebuild) {
        pendingRebuild = false;
        rebuild();
      }
    }
  }

  function go(url) {
    setOpen(false);
    window.location.assign(url);
  }

  // ---------- spin physics ----------
  function afterRotChange() {
    rot = n ? mod(rot, n) : 0;
    if (!Number.isFinite(rot)) rot = 0;
    render();
    updateFeatured();

    const ti = Math.round(rot);
    if (ti !== lastTickI) {
      lastTickI = ti;
      haptic(5);
    }

    refreshLabel(true);
  }

  function loop() {
    rafId = 0;
    // Own clock: after a WebView resumes, rAF timestamps can lag performance.now(), which
    // made every frame count as 1ms and the spin never died down.
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
        if (diff !== 0) {
          rot = target;
          afterRotChange();
        }

        spinning = false;
        refreshLabel(true);
      }
    }

    if (animating) rafId = requestAnimationFrame(loop);
  }

  function kick() {
    if (rafId) return;
    lastFrame = performance.now();
    rafId = requestAnimationFrame(loop);
  }

  // Short screens (phones in landscape): shrink the wheel about its corner so it all fits,
  // label included. Touches are measured in the same scaled units.
  let wheelScale = 1;
  function fitWheel() {
    const r = main.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const side = leftHanded ? window.innerWidth - cx : cx;
    const s = Math.min(1, (cy - 6) / (SIZE + 50), (side - 6) / (SIZE + 4));
    wheelScale = Math.max(0.5, s);
    wheel.style.transform = wheelScale < 0.999 ? `scale(${wheelScale.toFixed(3)})` : '';
  }

  // ---------- touch handling: drag to spin, tap to select; pinned band is tap-only ----------
  function geom(cx, cy) {
    const r = main.getBoundingClientRect();
    const ox = r.left + r.width / 2;
    const oy = r.top + r.height / 2;
    const dx = SX() * (cx - ox);
    const dy = oy - cy;

    let deg = (Math.atan2(dy, dx) * 180) / Math.PI;
    if (deg < 0) deg += 360;

    return { dist: Math.hypot(dx, dy) / wheelScale, deg, x: cx, y: cy };
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

  function pinnedAt(g) {
    if (g.dist < PIN_R_IN - 4 || g.dist > PIN_R_OUT + 4) return -1;

    let sectorDeg = g.deg;
    if (sectorDeg < 90) sectorDeg += 360;
    if (sectorDeg < 90 || sectorDeg > 180) return -1;

    const idx = Math.floor((sectorDeg - 90) / PIN_SPAN);
    return idx >= 0 && idx < 3 ? idx : -1;
  }

  function customAt(g) {
    if (g.dist < CUST_R_IN - 4 || g.dist > CUST_R_OUT + 4) return -1;

    let sectorDeg = g.deg;
    if (sectorDeg < 90) sectorDeg += 360;
    if (sectorDeg < 90 || sectorDeg > 180) return -1;

    const idx = Math.floor((sectorDeg - 90) / CUST_SPAN);
    return idx >= 0 && idx < CUST_COUNT ? idx : -1;
  }

  function angleDelta(next, previous) {
    let d = next - previous;
    if (d > 180) d -= 360;
    if (d < -180) d += 360;
    return d;
  }

  overlay.addEventListener('pointerdown', e => {
    if (!open) return;
    clearSelection();

    const g = geom(e.clientX, e.clientY);
    vel = 0;

    const custIdx = customAt(g);
    if (custIdx >= 0) {
      try { overlay.setPointerCapture(e.pointerId); } catch (_) {}
      gesture = { zone: 'custom', idx: custIdx, longFired: false };
      if (cgEls[custIdx]) cgEls[custIdx].classList.add('press');
      gesture.timer = setTimeout(() => {
        gesture.longFired = true;
        clearSelection();
        if (cgEls[custIdx]) cgEls[custIdx].classList.remove('press');
        haptic(40);
        openPicker(custIdx);
      }, LONG_PRESS_MS);
      return;
    }

    const pinIdx = pinnedAt(g);
    if (pinIdx >= 0) {
      try { overlay.setPointerCapture(e.pointerId); } catch (_) {}
      gesture = { zone: 'pin', idx: pinIdx };
      if (pgEls[pinIdx]) pgEls[pinIdx].classList.add('press');
      return;
    }

    if (g.dist >= R_IN - 6 && g.dist <= R_OUT + 6) {
      try { overlay.setPointerCapture(e.pointerId); } catch (_) {}

      gesture = {
        zone: 'ring',
        startX: e.clientX,
        startY: e.clientY,
        lastDeg: g.deg,
        lastT: e.timeStamp,
        startItem: itemAt(g),
        moved: false
      };

      dragging = false;
      setActive(gesture.startItem);
    } else {
      gesture = { zone: 'out' };
    }
  });

  overlay.addEventListener('pointermove', e => {
    if (!open || !gesture) return;

    if (gesture.zone === 'custom') {
      const g = geom(e.clientX, e.clientY);
      const idx = customAt(g);
      if (idx !== gesture.idx) {
        clearTimeout(gesture.timer);
        if (cgEls[gesture.idx]) cgEls[gesture.idx].classList.remove('press');
        gesture = { zone: 'out' };
      }
      return;
    }

    if (gesture.zone === 'pin') {
      const g = geom(e.clientX, e.clientY);
      const idx = pinnedAt(g);
      if (idx !== gesture.idx) {
        if (pgEls[gesture.idx]) pgEls[gesture.idx].classList.remove('press');
        gesture = { zone: 'out' };
      }
      return;
    }

    if (gesture.zone !== 'ring') return;

    const g = geom(e.clientX, e.clientY);
    const dx = e.clientX - gesture.startX;
    const dy = e.clientY - gesture.startY;
    const movedDistance = Math.hypot(dx, dy);

    // Small moves still count as a tap; beyond that it's a spin.
    if (!gesture.moved && movedDistance < 11) {
      setActive(itemAt(g));
      return;
    }

    if (!canSpin) {
      gesture.moved = true;
      setActive(-1);
      return;
    }

    gesture.moved = true;
    dragging = true;
    spinning = true;
    setActive(-1);

    const dd = angleDelta(g.deg, gesture.lastDeg);
    const dRot = -dd / step;
    const rawDt = e.timeStamp - gesture.lastT;
    const dt = rawDt > 4 && rawDt < 200 ? rawDt : 16; // stale or clashing timestamps after a resume

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

    if (current.zone === 'custom') {
      clearTimeout(current.timer);
      if (cgEls[current.idx]) cgEls[current.idx].classList.remove('press');
      if (!current.longFired) {
        const slot = customSlots[current.idx];
        if (slot) go(slotUrl(slot));
        else openPicker(current.idx);
      }
      return;
    }

    if (current.zone === 'pin') {
      if (pgEls[current.idx]) pgEls[current.idx].classList.remove('press');
      const item = pinned[current.idx];
      if (item) go(item.url);
      return;
    }

    if (current.zone === 'ring') {
      if (current.moved) {
        dragging = false;
        kick();
      } else {
        const i = current.startItem;
        if (i >= 0 && items[i]) go(items[i].url);
        else setActive(-1);
      }
    } else {
      setOpen(false);
    }
  });

  overlay.addEventListener('pointercancel', () => {
    if (gesture && gesture.zone === 'custom') {
      clearTimeout(gesture.timer);
      if (cgEls[gesture.idx]) cgEls[gesture.idx].classList.remove('press');
    }
    if (gesture && gesture.zone === 'pin' && pgEls[gesture.idx]) pgEls[gesture.idx].classList.remove('press');
    gesture = null;
    dragging = false;
    setActive(-1);
    if (spinning) kick();
  });

  overlay.addEventListener('contextmenu', e => e.preventDefault());

  // Ghost taps: the wheel acts on finger-up and hides its layer, so the phone's follow-up click
  // would land on whatever was underneath (a link, a collapsible table). Cancel it at the touch,
  // and swallow any stray click outside our UI for a moment after.
  let tapGuardUntil = 0;
  function guardTap(e) { if (!e || e.pointerType !== 'mouse') tapGuardUntil = performance.now() + 500; }
  const ownUi = el => !!el && (root.contains(el) || overlay.contains(el) || picker.contains(el) || pbg.contains(el));
  window.addEventListener('click', e => {
    if (performance.now() > tapGuardUntil || ownUi(e.target)) return;
    tapGuardUntil = 0;
    e.preventDefault();
    e.stopImmediatePropagation();
  }, true);

  // Touches on our UI are ours alone. Torn's swipe-to-open reads a rightward spin as "open the
  // sidebar", so stop touch events at window capture (before any of Torn's listeners), and finger
  // pointer events once our own handlers have had them.
  const OUR_UI = [overlay, pbg, root];
  const inOurUi = t => !!t && OUR_UI.some(el => el.contains(t));
  ['touchstart', 'touchmove', 'touchend', 'touchcancel'].forEach(type => window.addEventListener(type, e => {
    if (pcMode || !inOurUi(e.target)) return;
    if (type === 'touchend' && e.cancelable && !root.contains(e.target)) e.preventDefault(); // no ghost click
    e.stopImmediatePropagation();
  }, { capture: true, passive: false }));
  ['pointerdown', 'pointermove', 'pointerup', 'pointercancel'].forEach(type => OUR_UI.forEach(el =>
    el.addEventListener(type, e => { if (e.pointerType !== 'mouse' && !pcMode) e.stopPropagation(); })));

  // ---------- main button: tap to open, double-tap for Home, hold for settings ----------
  let pressTimer = null;
  let longFired = false;
  let startX = 0, startY = 0;

  // Idle button opacity (mobile). Own slider: native range inputs won't drag in some WebViews.
  // Once touched, the button shows the chosen opacity until Settings closes.
  const opSlider = panel.querySelector('#qsw-popacity');
  const opVal = panel.querySelector('#qsw-popacity-val');
  const clampOp = v => Math.min(1, Math.max(0.1, v));
  let opacity = IDLE_OPACITY, opDrag = null;
  function readOpacity() {
    let v = NaN;
    try { v = parseFloat(localStorage.getItem(OPACITY_KEY)); } catch (_) {}
    return Number.isFinite(v) ? clampOp(v) : IDLE_OPACITY;
  }
  function applyOpacity(v) {
    opacity = clampOp(v);
    const pct = Math.round(opacity * 100);
    root.style.setProperty('--qsw-idle', String(opacity));
    opSlider.style.setProperty('--f', String((pct - 10) / 90));
    opSlider.setAttribute('aria-valuenow', String(pct));
    opVal.textContent = pct + '%';
  }
  const saveOpacity = () => { try { localStorage.setItem(OPACITY_KEY, String(opacity)); } catch (_) {} };
  function opFromX(x) {
    const r = opSlider.querySelector('.qsw-sl-track').getBoundingClientRect();
    const f = r.width ? Math.min(1, Math.max(0, (x - r.left) / r.width)) : 0;
    applyOpacity(Math.round((10 + f * 90) / 5) * 5 / 100);
  }
  applyOpacity(readOpacity());
  opSlider.addEventListener('pointerdown', e => {
    e.preventDefault();
    e.stopPropagation();
    try { opSlider.setPointerCapture(e.pointerId); } catch (_) {}
    opDrag = e.pointerId;
    opSlider.classList.add('active');
    root.classList.add('qsw-preview');
    opFromX(e.clientX);
  });
  opSlider.addEventListener('pointermove', e => { if (opDrag === e.pointerId) { e.preventDefault(); opFromX(e.clientX); } });
  const endOpDrag = e => {
    if (opDrag !== e.pointerId) return;
    opDrag = null;
    opSlider.classList.remove('active');
    saveOpacity();
  };
  opSlider.addEventListener('pointerup', endOpDrag);
  opSlider.addEventListener('pointercancel', endOpDrag);
  opSlider.addEventListener('lostpointercapture', endOpDrag);
  opSlider.addEventListener('keydown', e => {
    const d = { ArrowRight: 5, ArrowUp: 5, ArrowLeft: -5, ArrowDown: -5 }[e.key];
    if (!d) return;
    e.preventDefault();
    root.classList.add('qsw-preview');
    applyOpacity((Math.round(opacity * 100) + d) / 100);
    saveOpacity();
  });

  // Wheel colour view.
  const colName = panel.querySelector('#qsw-pcol-name');
  const cbBtn = panel.querySelector('#qsw-cbmode');
  const isCb = () => !!(THEMES.find(t => t.id === themeId) || {}).cb;
  function renderColours() {
    const cb = isCb();
    colName.textContent = (THEMES.find(t => t.id === themeId) || THEMES[0]).name;
    cbBtn.classList.toggle('on', cb);
    cbBtn.setAttribute('aria-pressed', String(cb));
    panel.classList.toggle('cb', cb);
    panel.querySelector('#qsw-cgrid').innerHTML = THEMES.filter(t => !!t.cb === cb).map(t =>
      `<button type="button" data-theme="${t.id}" class="${t.id === themeId ? 'on' : ''}" aria-pressed="${t.id === themeId}">` +
      `<i class="qsw-sw" style="--sw1:${t.a1};--sw2:${t.a2}"></i>${t.name}</button>`).join('');
  }
  function setTheme(id) {
    applyTheme(id);
    try { localStorage.setItem(THEME_KEY, themeId); } catch (_) {}
    if (!isCb()) try { localStorage.setItem(LAST_REG_KEY, themeId); } catch (_) {}
    renderColours();
  }
  renderColours();
  panel.querySelector('#qsw-pcol').addEventListener('click', () => { haptic(10); renderColours(); panel.classList.add('colours'); });
  panel.querySelector('#qsw-pcolback').addEventListener('click', () => { haptic(10); panel.classList.remove('colours'); });
  cbBtn.addEventListener('click', () => {
    haptic(10);
    if (isCb()) {
      let last = null;
      try { last = localStorage.getItem(LAST_REG_KEY); } catch (_) {}
      setTheme(THEMES.some(t => t.id === last && !t.cb) ? last : (FROM_CB[themeId] || 'green'));
    } else setTheme(TO_CB[themeId] || 'oi-green');
  });
  panel.querySelector('#qsw-cgrid').addEventListener('click', e => {
    const b = e.target.closest('[data-theme]');
    if (!b) return;
    haptic(8);
    setTheme(b.dataset.theme);
  });

  // Animation view.
  const animName = panel.querySelector('#qsw-panim-name');
  const aList = panel.querySelector('#qsw-alist');
  function renderAnim() {
    const cur = ANIM_LEVELS.find(l => l.id === animLevel);
    animName.textContent = cur.name + (animChosen ? '' : ' (auto)');
    aList.innerHTML = ANIM_LEVELS.map(l =>
      `<button type="button" data-anim="${l.id}" class="${l.id === animLevel ? 'on' : ''}" aria-pressed="${l.id === animLevel}">` +
      `<b>${l.name}${!animChosen && l.id === animLevel ? ' <i>· picked for this device</i>' : ''}</b><span>${l.note}</span></button>`).join('');
  }
  renderAnim();
  panel.querySelector('#qsw-panim').addEventListener('click', () => { haptic(10); renderAnim(); panel.classList.add('anim'); });
  panel.querySelector('#qsw-panimback').addEventListener('click', () => { haptic(10); panel.classList.remove('anim'); });
  aList.addEventListener('click', e => {
    const b = e.target.closest('[data-anim]');
    if (!b) return;
    haptic(8);
    animLevel = animChosen = b.dataset.anim;
    try { localStorage.setItem(ANIM_KEY, animLevel); } catch (_) {}
    applyAnim();
    renderAnim();
  });

  const statEl = panel.querySelector('#qsw-pstat');
  const noteEl = panel.querySelector('#qsw-pnote');
  const refreshBtn = panel.querySelector('#qsw-prefresh');
  const creditsBtn = panel.querySelector('#qsw-pcredits');
  const creditsBackBtn = panel.querySelector('#qsw-pcback');

  // ---------- header menu button ----------
  // Only opens the collapsed drawer, but Torn keeps re-showing it (e.g. on new events),
  // so hide it inline and re-apply when the header re-renders.
  const MENU_BTN_SEL = '#fly-out-menu-button, button[aria-controls="fly-out-panel"]';
  const watchedMenuBtns = new WeakSet();
  // By id first (cheap, and what Torn uses); the page-wide fallback runs at most once a second.
  let btnScanAt = 0, btnCache = [];
  function menuButtons() {
    const b = document.getElementById('fly-out-menu-button');
    if (b) return [b];
    const now = performance.now();
    if (now - btnScanAt > 1000) { btnScanAt = now; btnCache = [...document.querySelectorAll(MENU_BTN_SEL)]; }
    return btnCache.filter(x => x.isConnected);
  }
  function applyMenuButton() {
    menuButtons().forEach(b => {
      if (pcMode) {
        if (b.dataset.qswHidden) { b.style.removeProperty('display'); delete b.dataset.qswHidden; }
      } else if (b.style.getPropertyValue('display') !== 'none' || b.style.getPropertyPriority('display') !== 'important') {
        b.style.setProperty('display', 'none', 'important');
        b.dataset.qswHidden = '1';
      }
      if (!watchedMenuBtns.has(b)) {
        watchedMenuBtns.add(b);
        new MutationObserver(() => { applyMenuButton(); checkFlyout(); }).observe(b, { attributes: true, attributeFilter: ['style', 'class', 'hidden', 'aria-expanded'] });
      }
    });
  }
  // If Torn's fly-out does end up open, show it (and its backdrop) so it can be closed as normal,
  // rather than leaving an invisible drawer holding the page's scroll and taps.
  let watchedFlyout = null;
  function checkFlyout() {
    const p = document.getElementById('fly-out-panel');
    if (p && p !== watchedFlyout) {
      watchedFlyout = p;
      new MutationObserver(checkFlyout).observe(p, { attributes: true, attributeFilter: ['class', 'aria-hidden', 'data-state', 'style'] });
    }
    const btn = menuButtons()[0];
    let isOpen = !!(btn && btn.getAttribute('aria-expanded') === 'true');
    if (!isOpen && p) isOpen = [...p.classList].some(c => /^(open|visible|active|expanded|show)/i.test(c)) || p.getAttribute('data-state') === 'open';
    document.body.classList.toggle('qsw-flyout-open', !pcMode && isOpen);
  }

  let menuBtnQueued = false;
  new MutationObserver(recs => {
    if (!sbDirty) {
      const sb = document.getElementById('sidebar');
      sbDirty = !sb || sb !== sbEl || recs.some(r => sb.contains(r.target));
    }
    if (menuBtnQueued) return;
    menuBtnQueued = true;
    requestAnimationFrame(() => {
      menuBtnQueued = false;
      applyMode();
      applyLoggedOut();
      firstSync();
      autoSync();
      applyMenuButton();
      checkFlyout();
      // The Vault link renders late; grab the property ID once it appears.
      if (location.pathname === '/properties.php') detectPropertyId();
    });
  }).observe(document.body, { childList: true, subtree: true });

  creditsBtn.addEventListener('click', () => { haptic(10); panel.classList.add('credits'); });

  function applyHandedness() {
    root.classList.toggle('qsw-left', leftHanded);
    rebuild();
    buildPinned();
    buildCustom();
  }
  creditsBackBtn.addEventListener('click', () => { haptic(10); panel.classList.remove('credits'); });

  function updateStat(msg) {
    noteEl.textContent = msg || '';
    noteEl.classList.toggle('show', !!msg);
    let last = 0;
    try { last = parseInt(localStorage.getItem(LASTSYNC_KEY), 10) || 0; } catch (_) {}
    if (!last) { statEl.textContent = 'Not synced yet'; return; }
    const d = new Date(last);
    const opts = { day: 'numeric', month: 'short' };
    if (d.getFullYear() !== new Date().getFullYear()) opts.year = 'numeric';
    statEl.innerHTML = `${items.length} link${items.length === 1 ? '' : 's'}<span>Synced ${d.toLocaleDateString('en-GB', opts)}</span>`;
  }

  function openPanel() {
    updateStat();
    renderPanelSlots();
    panel.classList.remove('credits', 'colours', 'anim');
    panel.classList.add('show');
    pbg.classList.add('show');
    main.classList.add('panel');
  }

  function closePanel() {
    root.classList.remove('qsw-preview');
    panel.classList.remove('show');
    pbg.classList.remove('show');
    main.classList.remove('panel');
  }

  // ---------- shortcut picker: list + URL entry ----------
  const pickerList = picker.querySelector('#qsw-pk-list');
  const pickerSearch = picker.querySelector('#qsw-pk-search');
  const pickerCloseBtn = picker.querySelector('#qsw-pk-close');
  const pickerClearBtn = picker.querySelector('#qsw-pk-clear');
  const pickerConfirm = picker.querySelector('#qsw-pk-confirm');
  const pickerConfirmTitle = picker.querySelector('.qsw-pk-ctitle');
  const pickerConfirmNote = picker.querySelector('.qsw-pk-cnote');
  const URL_NOTE = pickerConfirmNote.textContent;
  const pickerUrlInput = picker.querySelector('#qsw-pk-url');
  const pickerBackBtn = picker.querySelector('#qsw-pk-back');
  const pickerSaveBtn = picker.querySelector('#qsw-pk-save');

  function renderPickerList(filter) {
    // Punctuation-insensitive, so "faction c" matches "Faction: Consumables".
    const norm = t => t.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    const q = norm(filter || '');
    const rows = q ? CATALOG.filter(c => norm(c.label).includes(q)) : CATALOG;
    pickerList.innerHTML = rows.length
      ? rows.map(c => `<button type="button" class="qsw-pk-item" data-id="${c.id}">${c.svg}<span>${c.label}</span></button>`).join('')
      : `<div class="qsw-pk-empty">No matches</div>`;
  }

  function showPickerList() {
    pendingCatalogId = null;
    pickerConfirm.classList.remove('show');
    pickerList.style.display = '';
    pickerSearch.style.display = '';
  }

  function showPickerConfirm(entry) {
    pendingCatalogId = entry.id;
    pickerConfirmTitle.textContent = entry.label;
    if (entry.id === 'my-profile') {
      pickerConfirmNote.textContent = "Couldn't read your Torn ID from this page. Enter it once — it's the number in your profile link (profiles.php?XID=…).";
      pickerUrlInput.placeholder = 'Your Torn ID, e.g. 1316121';
      pickerUrlInput.inputMode = 'numeric';
      pickerUrlInput.value = '';
    } else {
      pickerConfirmNote.textContent = URL_NOTE;
      pickerUrlInput.placeholder = '/page.php?sid=…';
      pickerUrlInput.inputMode = 'text';
      pickerUrlInput.value = urlFixes[entry.id] || '';
    }
    pickerList.style.display = 'none';
    pickerSearch.style.display = 'none';
    pickerConfirm.classList.add('show');
    setTimeout(() => pickerUrlInput.focus(), 50);
  }

  // Ignore the synthetic click that follows the touch that opened the picker; only accept
  // clicks once a touch has started inside it.
  let pickerArmed = false;
  picker.addEventListener('pointerdown', () => { pickerArmed = true; }, true);
  picker.addEventListener('click', e => {
    if (!pickerArmed) { e.preventDefault(); e.stopPropagation(); }
  }, true);

  // Height of anything fixed along the bottom of the screen (Torn's chat tab bar), so the
  // picker can sit above it instead of behind it.
  function bottomInset() {
    const ours = el => root.contains(el) || overlay.contains(el) || picker.contains(el) || pbg.contains(el);
    let inset = 0;
    for (const fx of [0.3, 0.5, 0.7, 0.9]) {
      const el = document.elementsFromPoint(window.innerWidth * fx, window.innerHeight - 3).find(e => !ours(e));
      if (!el) continue;
      let fixed = false;
      for (let a = el; a && a !== document.body; a = a.parentElement) {
        const pos = getComputedStyle(a).position;
        if (pos === 'fixed' || pos === 'sticky') { fixed = true; break; }
      }
      if (!fixed) continue;
      for (let a = el; a && a !== document.body; a = a.parentElement) {
        const r = a.getBoundingClientRect();
        if (r.height >= 28) {
          const h = window.innerHeight - r.top;
          if (h > 0 && h <= 120) inset = Math.max(inset, h);
          break;
        }
      }
    }
    return inset;
  }

  function openPicker(idx) {
    pickerArmed = false;
    clearSelection();
    if (pcMode) {
      picker.style.bottom = picker.style.height = ''; // centred by the desktop styles
    } else {
      const inset = bottomInset();
      picker.style.bottom = (10 + inset) + 'px';
      picker.style.height = `min(72vh, 560px, ${Math.max(240, window.innerHeight - inset - 30)}px)`;
    }
    editingSlot = idx;
    setOpen(false);
    closePanel();
    pickerSearch.value = '';
    renderPickerList('');
    showPickerList();
    pickerClearBtn.style.display = customSlots[idx] ? '' : 'none';
    picker.classList.add('show');
    pbg.classList.add('show');
    if (pcMode) setTimeout(() => pickerSearch.focus(), 60);
  }

  function closePicker() {
    const wasOpen = picker.classList.contains('show');
    picker.classList.remove('show');
    pbg.classList.remove('show');
    editingSlot = -1;
    pendingCatalogId = null;
    // Opened from the Settings list (desktop): go back to Settings.
    if (pickerFromPanel) { pickerFromPanel = false; if (wasOpen) openPanel(); }
  }

  function assignSlot(idx, entry, url) {
    customSlots[idx] = { catalogId: entry.id, label: entry.label, svg: entry.svg, url };
    saveCustomSlots();
    buildCustom();
    closePicker();
  }

  function clearCustomSlot(idx) {
    customSlots[idx] = null;
    saveCustomSlots();
    buildCustom();
    closePicker();
  }

  pickerSearch.addEventListener('input', () => renderPickerList(pickerSearch.value));

  pickerList.addEventListener('click', e => {
    const btn = e.target.closest('.qsw-pk-item');
    if (!btn || editingSlot < 0) return;
    const entry = CATALOG_BY_ID[btn.dataset.id];
    if (!entry) return;
    const url = resolveCatalogUrl(entry);
    if (url) {
      haptic(10);
      assignSlot(editingSlot, entry, url);
    } else {
      showPickerConfirm(entry);
    }
  });

  pickerClearBtn.addEventListener('click', () => {
    if (editingSlot >= 0) clearCustomSlot(editingSlot);
  });

  pickerBackBtn.addEventListener('click', showPickerList);

  pickerSaveBtn.addEventListener('click', () => {
    const url = pickerUrlInput.value.trim();
    if (!url || !pendingCatalogId || editingSlot < 0) return;
    const entry = CATALOG_BY_ID[pendingCatalogId];
    if (!entry) return;
    if (entry.id === 'my-profile') {
      // Accept a bare ID or a pasted profile link.
      const m = /(?:XID=)?(\d{1,12})/.exec(url);
      if (!m) { pickerUrlInput.focus(); return; }
      saveTornId(m[1]);
      haptic(15);
      assignSlot(editingSlot, entry, '/profiles.php?XID=' + m[1]);
      return;
    }
    urlFixes[entry.id] = url;
    saveUrlFixes();
    haptic(15);
    assignSlot(editingSlot, entry, url);
  });

  pickerCloseBtn.addEventListener('click', closePicker);

  pbg.addEventListener('pointerdown', e => { guardTap(e); pickerFromPanel = false; closePanel(); closePicker(); });


  refreshBtn.addEventListener('click', () => {
    haptic(15);
    const count = syncFromSidebar(true);
    if (count) {
      try { localStorage.setItem(LASTSYNC_KEY, String(Date.now())); } catch (_) {}
      updateStat();
    } else {
      const away = document.body && (document.body.dataset.traveling === 'true' || document.body.dataset.abroad === 'true');
      updateStat(away
        ? 'Torn hides the sidebar while you\u2019re travelling. Refresh once you\u2019re back in Torn.'
        : 'Sidebar not found on this page. Try again from another page.');
    }
  });

  function cancelPress() {
    clearTimeout(pressTimer);
    pressTimer = null;
    main.classList.remove('pressing');
  }

  // ---------- draggable button ----------
  // Drag to move; on release it snaps to the nearest side edge at the dropped height. The side
  // drives the wheel's direction (left edge = mirrored).
  const BTN = 52, EDGE = RIGHT_OFFSET;
  let btnBottom = null; // px from the viewport bottom; null = default position
  try { const v = parseFloat(localStorage.getItem(POS_KEY)); if (!isNaN(v)) btnBottom = v; } catch (_) {}
  // Keep the whole wheel (plus its label) on screen above the button.
  function clampBottom(b) {
    const max = window.innerHeight - BTN - (SIZE + 70);
    return Math.max(8, Math.min(b, Math.max(8, max)));
  }
  function applyPosition() {
    root.style.left = root.style.top = root.style.right = '';
    root.style.bottom = btnBottom == null ? '' : clampBottom(btnBottom) + 'px';
  }
  let drag = null;
  let snapTimer = null;
  let suppressClick = false;
  function moveDrag(e) {
    const cx = Math.min(Math.max(e.clientX, BTN / 2), window.innerWidth - BTN / 2);
    const cy = Math.min(Math.max(e.clientY, BTN / 2), window.innerHeight - BTN / 2);
    root.style.right = root.style.bottom = 'auto';
    root.style.left = (cx - BTN / 2) + 'px';
    root.style.top = (cy - BTN / 2) + 'px';
  }
  function startDrag(e) {
    clearTimeout(snapTimer); // re-grabbed mid-snap: the new drag takes over
    root.classList.remove('qsw-snapping');
    drag = true;
    main.classList.remove('pressing');
    root.classList.add('qsw-dragging');
    moveDrag(e);
  }
  function endDrag() {
    drag = null;
    suppressClick = true; // swallow the click that follows the drag's pointerup
    const r = root.getBoundingClientRect();
    const toLeft = r.left + BTN / 2 < window.innerWidth / 2;
    btnBottom = clampBottom(window.innerHeight - r.bottom);
    try { localStorage.setItem(POS_KEY, String(btnBottom)); } catch (_) {}
    root.classList.add('qsw-snapping');
    root.style.left = (toLeft ? EDGE : window.innerWidth - EDGE - BTN) + 'px';
    root.style.top = (window.innerHeight - btnBottom - BTN) + 'px';
    snapTimer = setTimeout(() => {
      root.classList.remove('qsw-snapping', 'qsw-dragging');
      if (toLeft !== leftHanded) {
        leftHanded = toLeft;
        try { localStorage.setItem(LEFT_KEY, String(leftHanded)); } catch (_) {}
        applyHandedness();
      }
      applyPosition();
    }, 240);
    haptic(10);
  }
  window.addEventListener('resize', () => { applyMode(); if (!drag) applyPosition(); if (open) fitWheel(); });

  main.addEventListener('pointerdown', e => {
    longFired = false;
    suppressClick = false;
    startX = e.clientX;
    startY = e.clientY;
    main.classList.add('pressing');
    try { main.setPointerCapture(e.pointerId); } catch (_) {}

    pressTimer = setTimeout(() => {
      longFired = true;
      clearSelection();
      main.classList.remove('pressing');
      haptic(40);
      setOpen(false);
      openPanel();
    }, LONG_PRESS_MS);
  });

  main.addEventListener('pointermove', e => {
    if (drag) { moveDrag(e); return; }
    if (pressTimer && Math.hypot(e.clientX - startX, e.clientY - startY) > 12) {
      cancelPress();
      // Only drag while everything is closed; otherwise a slide is just a cancelled press.
      if (!open && !panel.classList.contains('show')) startDrag(e);
    }
  });

  ['pointerup', 'pointercancel'].forEach(ev => main.addEventListener(ev, () => {
    if (drag) endDrag();
    cancelPress();
  }));
  main.addEventListener('pointerleave', () => { if (!drag) cancelPress(); });

  let tapTimer = null;
  let lastTapAt = 0;

  main.addEventListener('click', e => {
    if (suppressClick) {
      suppressClick = false;
      e.preventDefault();
      return;
    }
    if (longFired) {
      longFired = false;
      e.preventDefault();
      return;
    }

    const now = Date.now();

    if (now - lastTapAt <= 280) {
      clearTimeout(tapTimer);
      tapTimer = null;
      lastTapAt = 0;

      closePanel();
      setOpen(false);
      window.location.assign('/index.php');
      return;
    }

    // Act on the first tap straight away; a second tap within 280ms still means Home.
    lastTapAt = now;
    closePanel();
    setOpen(!open);
  });

  main.addEventListener('contextmenu', e => e.preventDefault());

  // ---------- sync from sidebar (Refresh) ----------
  function syncFromSidebar(force) {
    const list = scanSidebar();
    if (!list) return 0;

    const sig = JSON.stringify(list);
    const shape = l => l.map(i => i.key + '|' + i.label + '|' + i.url).join('\n');
    const changed = shape(list) !== shape(items);

    if (force || changed) {
      items = list;

      try {
        localStorage.setItem(ITEMS_KEY, sig);
      } catch (e) {}

      if (changed || force) {
        if (open) pendingRebuild = true;
        else rebuild();
      }
    }

    return list.length;
  }

  // Block Torn's left-edge swipe that opens the sidebar.
  let edgeTouch = null;

  document.addEventListener('touchstart', e => {
    if (pcMode || !e.touches || e.touches.length !== 1) return;

    const t = e.touches[0];
    // Ignore touches on our own UI (e.g. the button on the left edge).
    const own = e.target && e.target.closest && e.target.closest('#qsw-root, #qsw-overlay, #qsw-picker, #qsw-pbg');
    if (t.clientX <= 24 && !own) edgeTouch = { x: t.clientX, y: t.clientY };
    else edgeTouch = null;
  }, { capture: true, passive: true });

  document.addEventListener('touchmove', e => {
    if (pcMode || !edgeTouch || !e.touches || e.touches.length !== 1) return;

    const t = e.touches[0];
    const dx = t.clientX - edgeTouch.x;
    const dy = t.clientY - edgeTouch.y;

    if (dx > 8 && Math.abs(dx) > Math.abs(dy)) {
      if (e.cancelable) e.preventDefault();
      edgeTouch = null;
    }
  }, { capture: true, passive: false });

  ['touchend', 'touchcancel'].forEach(type =>
    document.addEventListener(type, () => { edgeTouch = null; }, true)
  );

  // ---------- desktop: compass wheel at the cursor ----------
  // Desktop layout + a real mouse only. Hold right (Windows) or middle, Ctrl+Shift, or the
  // optional button opens a full ring around the cursor: sidebar links left, Messages/Events/
  // Awards bottom, custom slots right, Home and Settings top. Flick toward a wedge and release.
  const PC_R_DEAD = 30;           // release inside this = no pick
  const PC_R_IN = 50;
  const PC_R_OUT = 132;
  const PC_REACH = PC_R_OUT + 48; // open-and-click mode: clicks beyond this close the wheel
  const PC_SIZE = (PC_R_OUT + 14) * 2;
  const PC_C = PC_SIZE / 2;
  const PC_WGAP = 1.6;            // degrees between wedges within a zone
  const PC_VISIBLE = 7;
  const PC_TAP_MS = 300;          // shorter press without moving = stay open
  const PC_MOVE_PX = 10;          // movement that turns a press into a flick
  const PC_KEY_DELAY = 170;       // Ctrl+Shift held this long with no other key = hold mode
  const PC_HOLD_MS = 200;         // right button held this long (or moved) = wheel, else a normal right-click
  const PCTRIG_KEY = 'qsWheel_pcTrigger_v1';
  // Which mouse button opens the wheel. Hold-right keeps middle-click (autoscroll, new tabs)
  // untouched, but needs the right-click menu to open on release, which is Windows only; Mac
  // and Linux browsers show it on press, so they use the middle button.
  const isWindows = /win/i.test((navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || '');
  let pcTrigger = 'middle';
  try { pcTrigger = isWindows && localStorage.getItem(PCTRIG_KEY) !== 'middle' ? 'right' : 'middle'; } catch (_) {}
  // Optional on-screen button (desktop): a mouse-only way in for trackpads with no middle
  // button. On by default on Mac/iPad, where right-hold isn't possible.
  const PCBTN_KEY = 'qsWheel_pcButton_v1';
  const PCBTN_POS_KEY = 'qsWheel_pcButtonPos_v1';  // { x, y } as fractions of the viewport
  const PCKEYS_KEY = 'qsWheel_pcKeys_v1';           // Ctrl+Shift shortcut on/off
  const PCHINT_KEY = 'qsWheel_pcHintSeen_v1';       // first-run "how to open" note shown
  const isMac = /mac|iphone|ipad/i.test((navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || '');
  let pcShowBtn = isMac, pcKeysOn = true;
  try {
    const v = localStorage.getItem(PCBTN_KEY);
    if (v === 'true' || v === 'false') pcShowBtn = v === 'true';
    pcKeysOn = localStorage.getItem(PCKEYS_KEY) !== 'false';
  } catch (_) {}
  // Zones in degrees, 0 = right, counter-clockwise. Hit-test borders sit mid-gap.
  const PCZ_TOP = [70, 110];      // Settings (right half), Home (left half)
  const PCZ_LEFT = [118, 232];    // sidebar links, top to bottom
  const PCZ_BOT = [240, 300];     // Messages, Events, Awards, left to right
  const PCZ_RIGHT = [308, 422];   // custom slots, top to bottom (422 = 62)
  const PC_TOP_ITEMS = [
    { label: 'Home', url: '/index.php', icon: 'home' },
    { label: 'Settings', icon: 'gear' },
  ];

  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
  const mobileLayout = () => {
    const sb = document.getElementById('sidebar');
    return !!sb && [...sb.classList].some(c => c.indexOf('mobile___') === 0);
  };

  const pcRoot = document.createElement('div');
  pcRoot.id = 'qsw-pc';
  pcRoot.innerHTML = `
    <div id="qsw-pc-dim"></div>
    <div id="qsw-pc-wheel" style="width:${PC_SIZE}px;height:${PC_SIZE}px">
      <svg viewBox="0 0 ${PC_SIZE} ${PC_SIZE}" width="${PC_SIZE}" height="${PC_SIZE}">
        <defs>
          <linearGradient id="qsw-pc-g-off" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stop-color="#fff" stop-opacity=".2"/>
            <stop offset="1" stop-color="#fff" stop-opacity=".04"/>
          </linearGradient>
          <linearGradient id="qsw-pc-g-on" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" style="stop-color:var(--qsw-a1)" stop-opacity=".8"/>
            <stop offset="1" style="stop-color:var(--qsw-a2)" stop-opacity=".4"/>
          </linearGradient>
        </defs>
        <circle class="qsw-pc-back" cx="${PC_C}" cy="${PC_C}" r="${PC_R_OUT + 3}"/>
        <circle class="qsw-pc-hub" cx="${PC_C}" cy="${PC_C}" r="${PC_R_IN - 4}"/>
        <g id="qsw-pc-fixed"></g>
        <g id="qsw-pc-links"></g>
        <circle class="qsw-pc-ripple" cx="${PC_C}" cy="${PC_C}" r="${PC_R_IN}"/>
      </svg>
      <div id="qsw-pc-icons"></div>
      <div id="qsw-pc-label" class="hide"></div>
    </div>`;
  const pcWheel = pcRoot.querySelector('#qsw-pc-wheel');
  const pcDim = pcRoot.querySelector('#qsw-pc-dim');
  const pcFixedG = pcRoot.querySelector('#qsw-pc-fixed');
  const pcLinksG = pcRoot.querySelector('#qsw-pc-links');
  const pcIcons = pcRoot.querySelector('#qsw-pc-icons');
  const pcLabel = pcRoot.querySelector('#qsw-pc-label');

  const pcPolar = (r, deg) => {
    const rad = (deg * Math.PI) / 180;
    return [PC_C + r * Math.cos(rad), PC_C - r * Math.sin(rad)];
  };
  function pcArc(a1, a2) {
    const [x1, y1] = pcPolar(PC_R_OUT, a1), [x2, y2] = pcPolar(PC_R_OUT, a2);
    const [x3, y3] = pcPolar(PC_R_IN, a2), [x4, y4] = pcPolar(PC_R_IN, a1);
    return `M${x1} ${y1}A${PC_R_OUT} ${PC_R_OUT} 0 0 0 ${x2} ${y2}L${x3} ${y3}A${PC_R_IN} ${PC_R_IN} 0 0 1 ${x4} ${y4}Z`;
  }
  const PC_R_MID = (PC_R_IN + PC_R_OUT) / 2;

  let pcOpen = false;
  let pcHow = null;          // 'mouse' | 'keys' (held) | 'sticky' (open until a click)
  let pcOX = 0, pcOY = 0;    // wheel centre, viewport px
  let pcPressX = 0, pcPressY = 0, pcPressAt = 0, pcMoved = false;
  let pcDownBtn = -1;        // button pressed while sticky, acted on at mouseup
  let pcHoldBtn = 1;         // button being held in 'mouse' mode
  let rArm = null;           // right button down, not yet a wheel: { x, y, at, timer }
  let pcRightDown = false;   // the right press that opened the wheel is still held
  let pcMenuBlock = 0;       // after a right-press wheel: swallow the menu event that follows (until)
  let pcHover = null;        // { zone, idx }
  let pcSwallowClick = 0;
  let mouseX = -1, mouseY = -1;
  // sidebar-link arc (scrolls like the mobile spin)
  let pcN = 0, pcCanSpin = false, pcVis = 0, pcStep = 0;
  let pcRot = 0, pcRotTarget = 0, pcRaf = 0, pcLast = 0, pcWheelAcc = 0;
  let pcLinkEls = [];        // per item: { g, ico }
  let pcFixedEls = {};       // zone -> [{ g, ico }]

  function pcBuild() {
    pcN = items.length;
    pcCanSpin = pcN > PC_VISIBLE;
    pcVis = pcCanSpin ? PC_VISIBLE : pcN;
    const span = PCZ_LEFT[1] - PCZ_LEFT[0];
    pcStep = pcCanSpin ? span / PC_VISIBLE : (pcN ? span / pcN : span);
    if (!pcCanSpin) pcRot = pcRotTarget = 0;

    // Bloom delay by angle, so the wedges sweep in round the circle.
    const bd = a => `--d:${Math.round(((a - 70 + 720) % 360) / 360 * 150)}ms`;
    const seg = (d, cls, a) => `<g class="qsw-pcg${cls ? ' ' + cls : ''}" style="${bd(a || 0)}"><path class="qsw-pcw-bg" d="${d}"/><path class="qsw-pcw" d="${d}"/></g>`;
    const ico = (x, y, inner, cls, a) => `<div class="qsw-pci${cls ? ' ' + cls : ''}" style="left:${x.toFixed(1)}px;top:${y.toFixed(1)}px;${bd(a || 0)}">${inner}</div>`;

    // fixed zones
    let g = '', ic = '';
    const order = [];
    PC_TOP_ITEMS.forEach((t, i) => {            // Home 90-110, Settings 70-90
      const a1 = i === 0 ? 90 : 70, a2 = a1 + 20;
      g += seg(pcArc(a1 + PC_WGAP / 2, a2 - PC_WGAP / 2), '', a1);
      const [x, y] = pcPolar(PC_R_MID, a1 + 10);
      ic += ico(x, y, svg(solidIcon(t.icon)), 'small', a1);
      order.push(['top', i]);
    });
    const pSpan = (PCZ_BOT[1] - PCZ_BOT[0]) / 3;
    pinned.forEach((p, i) => {
      const a1 = PCZ_BOT[0] + i * pSpan;
      g += seg(pcArc(a1 + PC_WGAP / 2, a1 + pSpan - PC_WGAP / 2), p.badge > 0 ? 'alert' : '', a1);
      const [x, y] = pcPolar(PC_R_MID - 4, a1 + pSpan / 2);
      ic += ico(x, y, p.svg, '', a1);
      if (p.badge > 0) {
        const [bx, by] = pcPolar(PC_R_OUT - 12, a1 + pSpan * 0.22);
        ic += `<div class="qsw-pcb" style="left:${bx.toFixed(1)}px;top:${by.toFixed(1)}px">${p.badge > 99 ? '99+' : p.badge}</div>`;
      }
      order.push(['bottom', i]);
    });
    const cSpan = (PCZ_RIGHT[1] - PCZ_RIGHT[0]) / CUST_COUNT;
    customSlots.forEach((slot, i) => {          // slot 0 at the top, going down
      const a2 = PCZ_RIGHT[1] - i * cSpan, a1 = a2 - cSpan;
      g += seg(pcArc(a1 + PC_WGAP / 2, a2 - PC_WGAP / 2), slot ? '' : 'empty', a1);
      const [x, y] = pcPolar(PC_R_MID, a1 + cSpan / 2);
      const cat = slot && CATALOG_BY_ID[slot.catalogId];
      ic += ico(x, y, slot ? (cat ? cat.svg : slot.svg) : svg(CAT_ICONS.plus), slot ? 'small' : 'small empty', a1);
      order.push(['right', i]);
    });
    pcFixedG.innerHTML = g;

    // sidebar links: one wedge shape at the arc's top slot, rotated into place per item
    const d = pcArc(PCZ_LEFT[0] + PC_WGAP / 2, PCZ_LEFT[0] + pcStep - PC_WGAP / 2);
    pcLinksG.innerHTML = items.map((it, i) => seg(d, '', PCZ_LEFT[0] + Math.min(i, PC_VISIBLE) * pcStep)).join('');
    pcIcons.innerHTML = ic + items.map((it, i) => `<div class="qsw-pci link" style="${bd(PCZ_LEFT[0] + Math.min(i, PC_VISIBLE) * pcStep)}">${it.svg}</div>`).join('');

    const fixedGs = [...pcFixedG.children];
    const icos = [...pcIcons.querySelectorAll('.qsw-pci')];
    pcFixedEls = { top: [], bottom: [], right: [] };
    order.forEach(([zone, i], k) => { pcFixedEls[zone][i] = { g: fixedGs[k], ico: icos[k] }; });
    pcLinkEls = items.map((it, i) => {
      const full = (energyFull && isGymItem(it)) || (nerveFull && isCrimesItem(it));
      const el = { g: pcLinksG.children[i], ico: icos[order.length + i] };
      el.g.classList.toggle('stat-full', !!full);
      el.ico.classList.toggle('stat-full', !!full);
      const attn = !full && hasAttention(it);
      el.g.classList.toggle('attn', attn);
      el.ico.classList.toggle('attn', attn);
      return el;
    });
    pcRenderLinks();
  }

  function pcSlotPos(i) {
    return pcCanSpin ? mod(i - pcRot + 1.5, pcN) - 1.5 : i;
  }

  function pcRenderLinks() {
    for (let i = 0; i < pcN; i++) {
      const p = pcSlotPos(i);
      const e = Math.max(-p, p + 1 - pcVis, 0);
      const v = Math.max(0, 1 - e * 1.25);
      const { g, ico } = pcLinkEls[i];
      if (v <= 0.01) { g.style.display = ico.style.display = 'none'; continue; }
      g.style.display = ico.style.display = '';
      g.setAttribute('transform', `rotate(${(-p * pcStep).toFixed(2)} ${PC_C} ${PC_C})`);
      g.style.opacity = ico.style.opacity = v.toFixed(3);
      const [x, y] = pcPolar(PC_R_MID, PCZ_LEFT[0] + (p + 0.5) * pcStep);
      ico.style.left = x.toFixed(1) + 'px';
      ico.style.top = y.toFixed(1) + 'px';
    }
  }

  // Which wedge a point aims at. Held: any distance past the dead zone counts (flick).
  // Sticky: only near the ring, so clicking elsewhere closes.
  function pcHitAt(x, y, sticky) {
    const dx = x - pcOX, dy = pcOY - y;
    const dist = Math.hypot(dx, dy);
    if (dist < PC_R_DEAD || (sticky && dist > PC_REACH)) return null;
    let a = (Math.atan2(dy, dx) * 180) / Math.PI;
    if (a < 0) a += 360;
    if (a >= 66 && a < 114) return { zone: 'top', idx: a >= 90 ? 0 : 1 };
    if (a >= 114 && a < 236) {
      if (!pcN) return null;
      const span = PCZ_LEFT[1] - PCZ_LEFT[0];
      const pos = Math.min(Math.max(a - PCZ_LEFT[0], 0), span - 0.001) / pcStep;
      const k = Math.min(Math.floor(pos), pcVis - 1);
      return { zone: 'left', idx: pcCanSpin ? mod(k + Math.round(pcRot), pcN) : Math.min(k, pcN - 1) };
    }
    if (a >= 236 && a < 304) {
      const pSpan = (PCZ_BOT[1] - PCZ_BOT[0]) / 3;
      return { zone: 'bottom', idx: Math.min(Math.max(Math.floor((a - PCZ_BOT[0]) / pSpan), 0), 2) };
    }
    const ar = a < 66 ? a + 360 : a;
    const cSpan = (PCZ_RIGHT[1] - PCZ_RIGHT[0]) / CUST_COUNT;
    return { zone: 'right', idx: Math.min(Math.max(Math.floor((PCZ_RIGHT[1] - ar) / cSpan), 0), CUST_COUNT - 1) };
  }

  const pcEl = h => h && (h.zone === 'left' ? pcLinkEls[h.idx] : (pcFixedEls[h.zone] || [])[h.idx]);

  function pcLabelFor(h) {
    if (!h) return null;
    if (h.zone === 'left') return items[h.idx] && items[h.idx].label;
    if (h.zone === 'top') return PC_TOP_ITEMS[h.idx].label;
    if (h.zone === 'bottom') return pinned[h.idx] && pinned[h.idx].label;
    const slot = customSlots[h.idx];
    return slot ? slot.label : 'Add shortcut';
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
    pcLabel.classList.toggle('hide', !text); // name box only while pointing at a wedge
  }

  function pcUpdateHover() {
    if (!pcOpen) return;
    if (Math.hypot(mouseX - pcPressX, mouseY - pcPressY) > PC_MOVE_PX) pcMoved = true;
    // Held: nothing lights up until the pointer actually moves (the origin can be nudged
    // in from a screen edge, leaving the cursor off-centre).
    pcSetHover(pcHow === 'sticky' || pcMoved ? pcHitAt(mouseX, mouseY, pcHow === 'sticky') : null);
  }

  function pcOpenAt(x, y, how) {
    if (x < 0 || y < 0) { x = window.innerWidth / 2; y = window.innerHeight / 2; }
    const m = PC_R_OUT + 16;
    pcOX = window.innerWidth > m * 2 ? Math.min(Math.max(x, m), window.innerWidth - m) : window.innerWidth / 2;
    pcOY = window.innerHeight > m * 2 ? Math.min(Math.max(y, m), window.innerHeight - m) : window.innerHeight / 2;
    pcPressX = x; pcPressY = y; pcPressAt = performance.now(); pcMoved = false;
    pcHow = how;
    pcRoot.classList.toggle('grab', how !== 'keys');
    pcDownBtn = -1;
    pinned = readPinned();
    pcBuild();
    pcWheel.style.left = (pcOX - PC_C) + 'px';
    pcWheel.style.top = (pcOY - PC_C) + 'px';
    pcWheel.style.transformOrigin = `${PC_C}px ${PC_C}px`;
    pcRoot.style.setProperty('--qsw-x', pcOX + 'px');
    pcRoot.style.setProperty('--qsw-y', pcOY + 'px');
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

  // Held press ended: go to the aimed wedge, else close. A quick middle click or a quick
  // Ctrl+Shift tap is the exception: it leaves the wheel open for clicking.
  function pcRelease() {
    const h = pcMoved ? pcHitAt(mouseX, mouseY, false) : null;
    const quick = !pcMoved && performance.now() - pcPressAt < PC_TAP_MS;
    if (h) pcActivate(h, false);
    else if (quick && !(pcHow === 'mouse' && pcHoldBtn === 2)) {
      pcHow = 'sticky';
      pcRoot.classList.add('grab');
      pcUpdateHover();
    }
    else pcClose();
  }

  function pcActivate(h, newTab) {
    let url = null;
    if (h.zone === 'left') url = items[h.idx] && items[h.idx].url;
    else if (h.zone === 'bottom') url = pinned[h.idx] && pinned[h.idx].url;
    else if (h.zone === 'top') {
      if (h.idx === 1) { pcClose(); openPanel(); return; }
      url = PC_TOP_ITEMS[0].url;
    } else {
      const slot = customSlots[h.idx];
      if (!slot) { pcClose(); openPicker(h.idx); return; }
      url = slotUrl(slot);
    }
    pcClose();
    if (!url) return;
    if (newTab) window.open(url, '_blank', 'noopener');
    else window.location.assign(url);
  }

  // scroll to spin the link arc
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

  const typingIn = el => !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));

  // A real mouse in use (pointerType 'mouse'; touch and pen never set it). Lets the cursor wheel
  // work in Torn's mobile layout too: a narrow desktop window, or a tablet with a mouse. The
  // mobile button stays available alongside it.
  let mouseSeen = false;
  let lastPointer = '';
  const noteMouse = e => {
    lastPointer = e.pointerType || lastPointer;
    if (e.pointerType === 'mouse') mouseSeen = true;
    // Touch on a desktop layout (touchscreen laptop, Surface): right-hold isn't possible with a
    // finger, so turn the wheel button on unless the player has set it themselves.
    if (e.pointerType === 'touch' && pcMode && !pcShowBtn) {
      let set = null;
      try { set = localStorage.getItem(PCBTN_KEY); } catch (_) {}
      if (set === null) {
        pcShowBtn = true;
        try { localStorage.setItem(PCBTN_KEY, 'true'); } catch (_) {}
        applyPcButton();
        showToggles();
      }
    }
  };
  window.addEventListener('pointermove', noteMouse, { capture: true, passive: true });
  window.addEventListener('pointerdown', noteMouse, { capture: true, passive: true });
  const cursorWheel = () => !offline && (pcMode || (mouseSeen && !open));
  const overlayUp = () => panel.classList.contains('show') || picker.classList.contains('show');

  function cancelRightArm() {
    if (rArm) { clearTimeout(rArm.timer); rArm = null; }
  }
  function openFromRight() {
    if (!rArm) return;
    const a = rArm;
    cancelRightArm();
    pcRightDown = true;
    pcOpenAt(a.x, a.y, 'mouse');
    pcHoldBtn = 2;
    pcPressAt = a.at;
    pcUpdateHover();
  }

  window.addEventListener('mousemove', e => {
    mouseX = e.clientX; mouseY = e.clientY;
    if (rArm) {
      if (!(e.buttons & 2)) cancelRightArm(); // released somewhere we didn't see
      else if (Math.hypot(mouseX - rArm.x, mouseY - rArm.y) > PC_MOVE_PX) openFromRight();
    }
    if (pcOpen) pcUpdateHover();
  }, { capture: true, passive: true });

  window.addEventListener('mousedown', e => {
    pcMenuBlock = 0; // a new press: any menu after this is a fresh right-click
    if (!cursorWheel()) return;
    // Ctrl+Shift+click is a browser shortcut (new tab): drop the wheel, let the click through.
    if (keyArm) { clearTimeout(keyArm.timer); keyArm = null; }
    if (pcOpen && pcHow === 'keys') { pcClose(true); return; }
    if (pcOpen) {
      e.preventDefault();
      e.stopPropagation();
      if (pcHow === 'sticky' && (e.button === 0 || e.button === 1)) pcDownBtn = e.button;
      return;
    }
    if (overlayUp()) return;
    const t = e.target;
    const near = sel => t && t.closest && t.closest(sel);
    mouseX = e.clientX; mouseY = e.clientY;
    if (pcTrigger === 'right' && e.button === 2) {
      // Fields keep their own menus (paste, spellcheck). Anywhere else, a quick right-click
      // still gets the normal menu; the wheel waits until the press is held or dragged.
      if (near('input, textarea, select, [contenteditable], #qsw-root, #qsw-pbg, #qsw-pcbtn, #qsw-pchint')) return;
      cancelRightArm();
      rArm = { x: e.clientX, y: e.clientY, at: performance.now() };
      rArm.timer = setTimeout(openFromRight, PC_HOLD_MS);
      return;
    }
    if (pcTrigger !== 'middle' || e.button !== 1) return;
    // Middle-clicking links (new tab), fields and our own UI keeps its normal behaviour.
    if (near('a[href], input, textarea, select, [contenteditable], #qsw-root, #qsw-pbg, #qsw-pcbtn, #qsw-pchint')) return;
    e.preventDefault(); // also stops the autoscroll compass
    pcOpenAt(e.clientX, e.clientY, 'mouse');
    pcHoldBtn = 1;
  }, true);

  window.addEventListener('mouseup', e => {
    if (e.button === 2 && rArm) { cancelRightArm(); return; } // plain right-click: menu as normal
    if (e.button === 2 && pcRightDown) {
      // This press opened the wheel, so the menu event that follows (after release on
      // Windows) is never shown, even if the wheel already closed (Esc etc.).
      pcRightDown = false;
      pcMenuBlock = performance.now() + 1500;
    }
    if (!pcOpen) return;
    mouseX = e.clientX; mouseY = e.clientY;
    if (pcHow === 'mouse' && e.button === pcHoldBtn) {
      e.preventDefault();
      pcRelease();
    } else if (pcHow === 'sticky' && e.button === pcDownBtn) {
      e.preventDefault();
      pcDownBtn = -1;
      const h = pcHitAt(e.clientX, e.clientY, true);
      if (h) pcActivate(h, e.button === 1); // middle-click a wedge = new tab
      else pcClose();
    }
  }, true);

  // Swallow the click/auxclick that trails a pick, so it can't land on the page underneath.
  ['click', 'auxclick'].forEach(type => window.addEventListener(type, e => {
    if (pcOpen || performance.now() < pcSwallowClick) {
      if (e.target && e.target.closest && e.target.closest('#qsw-root, #qsw-pbg')) return;
      e.preventDefault();
      e.stopPropagation();
    }
  }, true));

  // Right-click a custom slot to change or clear it (long-press on mobile).
  window.addEventListener('contextmenu', e => {
    if (rArm || pcRightDown || performance.now() < pcMenuBlock) {
      pcMenuBlock = 0;
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    if (!pcOpen) return;
    e.preventDefault();
    e.stopPropagation();
    const h = pcHitAt(e.clientX, e.clientY, true);
    if (h && h.zone === 'right') { pcClose(); openPicker(h.idx); }
  }, true);

  window.addEventListener('wheel', e => {
    if (rArm) openFromRight();
    if (!pcOpen) return;
    e.preventDefault(); // no page scroll, and no Ctrl+wheel zoom while Ctrl+Shift is held
    const d = e.deltaY * (e.deltaMode === 1 ? 40 : e.deltaMode === 2 ? 400 : 1);
    if (Math.abs(d) >= 50) { pcWheelAcc = 0; pcSpin(Math.sign(d)); return; } // mouse notch
    pcWheelAcc += d;                                                          // trackpad
    const steps = Math.trunc(pcWheelAcc / 50);
    if (steps) { pcWheelAcc -= steps * 50; pcSpin(steps); }
  }, { capture: true, passive: false });

  // Ctrl+Shift: hold, aim, release to go; tap to open and click. Any other key pressed with
  // them (Ctrl+Shift+T etc.) means it was a browser shortcut, so the wheel stays out of it.
  let keyArm = null;
  window.addEventListener('keydown', e => {
    if (!cursorWheel()) return;
    if (e.key === 'Escape' && pcOpen) { e.preventDefault(); e.stopPropagation(); pcClose(); return; }
    const isMod = e.key === 'Control' || e.key === 'Shift';
    if (isMod) {
      if (!pcKeysOn) return;
      if (!e.ctrlKey || !e.shiftKey || e.altKey || e.metaKey || e.repeat || keyArm) return;
      if (typingIn(document.activeElement) || overlayUp()) return;
      if (pcOpen) { pcClose(); return; }          // second tap closes
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
    cancelRightArm();
    pcRightDown = false;
    if (keyArm) { clearTimeout(keyArm.timer); keyArm = null; }
    if (pcOpen && pcHow !== 'sticky') pcClose();
  });

  // Settings: the 5 custom shortcuts (desktop has no long-press, so they're set here).
  const pslotList = panel.querySelector('#qsw-pslot-list');
  function renderPanelSlots() {
    pslotList.innerHTML = customSlots.map((slot, i) => {
      const cat = slot && CATALOG_BY_ID[slot.catalogId];
      const icon = slot ? (cat ? cat.svg : slot.svg) : svg(CAT_ICONS.plus);
      const label = slot ? slot.label : 'Add shortcut';
      return `<button type="button" class="qsw-pslot${slot ? '' : ' empty'}" data-i="${i}">${icon}<span>${label}</span></button>`;
    }).join('');
  }
  pslotList.addEventListener('click', e => {
    const b = e.target.closest('.qsw-pslot');
    if (!b) return;
    const i = parseInt(b.dataset.i, 10);
    if (!(i >= 0 && i < CUST_COUNT)) return;
    openPicker(i);
    pickerFromPanel = true;
  });

  // Settings: pick the opening button (Windows).
  const trigBtns = [...panel.querySelectorAll('.qsw-ptrig-seg button')];
  function showTrigger() { trigBtns.forEach(b => b.classList.toggle('on', b.dataset.v === pcTrigger)); }
  trigBtns.forEach(b => b.addEventListener('click', () => {
    pcTrigger = b.dataset.v === 'middle' ? 'middle' : 'right';
    try { localStorage.setItem(PCTRIG_KEY, pcTrigger); } catch (_) {}
    cancelRightArm();
    showTrigger();
  }));
  showTrigger();
  root.classList.toggle('qsw-win', isWindows);

  // Desktop wheel button: click opens the wheel (open-and-click), drag moves it.
  const pcBtn = document.createElement('div');
  pcBtn.id = 'qsw-pcbtn';
  pcBtn.setAttribute('role', 'button');
  pcBtn.setAttribute('aria-label', 'Open Quick Select');
  pcBtn.innerHTML = svg(MAIN_ICONS.close);
  let pcBtnPos = { x: 0.97, y: 0.88 };
  try {
    const v = JSON.parse(localStorage.getItem(PCBTN_POS_KEY) || 'null');
    if (v && v.x >= 0 && v.x <= 1 && v.y >= 0 && v.y <= 1) pcBtnPos = v;
  } catch (_) {}
  function placePcBtn() {
    const x = Math.min(Math.max(pcBtnPos.x * window.innerWidth, 30), window.innerWidth - 30);
    const y = Math.min(Math.max(pcBtnPos.y * window.innerHeight, 30), window.innerHeight - 30);
    pcBtn.style.left = x + 'px';
    pcBtn.style.top = y + 'px';
  }
  function applyPcButton() {
    const show = pcMode && pcShowBtn && !offline;
    pcBtn.style.display = show ? '' : 'none';
    if (show) placePcBtn();
  }
  let pcBtnDrag = null;
  pcBtn.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    e.preventDefault();
    try { pcBtn.setPointerCapture(e.pointerId); } catch (_) {}
    pcBtnDrag = { x: e.clientX, y: e.clientY, moved: false };
  });
  pcBtn.addEventListener('pointermove', e => {
    if (!pcBtnDrag) return;
    if (!pcBtnDrag.moved && Math.hypot(e.clientX - pcBtnDrag.x, e.clientY - pcBtnDrag.y) < 6) return;
    pcBtnDrag.moved = true;
    pcBtn.classList.add('drag');
    pcBtnPos = { x: e.clientX / window.innerWidth, y: e.clientY / window.innerHeight };
    placePcBtn();
  });
  const endPcBtn = e => {
    if (!pcBtnDrag) return;
    const d = pcBtnDrag;
    pcBtnDrag = null;
    pcBtn.classList.remove('drag');
    if (d.moved) {
      try { localStorage.setItem(PCBTN_POS_KEY, JSON.stringify(pcBtnPos)); } catch (_) {}
    } else if (e.type === 'pointerup' && !overlayUp()) {
      const r = pcBtn.getBoundingClientRect();
      pcOpenAt(r.left + r.width / 2, r.top + r.height / 2, 'sticky');
    }
  };
  pcBtn.addEventListener('pointerup', endPcBtn);
  pcBtn.addEventListener('pointercancel', endPcBtn);
  pcBtn.addEventListener('contextmenu', e => e.preventDefault());
  window.addEventListener('resize', () => { if (pcMode && pcShowBtn) placePcBtn(); });

  // First desktop visit: a one-off note on how to open the wheel.
  const pcHint = document.createElement('div');
  pcHint.id = 'qsw-pchint';
  let hintSeen = false;
  try { hintSeen = localStorage.getItem(PCHINT_KEY) === 'true'; } catch (_) {}
  function hintText() {
    const ways = [pcTrigger === 'right'
      ? 'Hold the right mouse button anywhere, flick toward a page and let go.'
      : 'Middle-click any empty spot, or hold it, flick toward a page and let go.'];
    if (pcShowBtn) ways.push('Or click the round wheel button.');
    if (pcKeysOn) ways.push('Keyboard: hold or tap Ctrl+Shift.');
    return ways.join(' ');
  }
  function markHintSeen() {
    if (hintSeen) return;
    hintSeen = true;
    try { localStorage.setItem(PCHINT_KEY, 'true'); } catch (_) {}
    pcHint.classList.remove('show');
  }
  function maybeShowHint() {
    if (hintSeen || !pcMode || offline) return;
    pcHint.innerHTML = `<b>Quick Select</b><div>${hintText()} Settings, where you pick your 5 shortcuts, is at the top of the wheel.</div><button type="button">Got it</button>`;
    pcHint.querySelector('button').addEventListener('click', markHintSeen);
    setTimeout(() => { if (!hintSeen && pcMode) pcHint.classList.add('show'); }, 800);
  }

  // Settings: desktop on/off options.
  const togBtns = [...panel.querySelectorAll('.qsw-ptog[data-opt]')];
  function showToggles() {
    togBtns.forEach(b => b.classList.toggle('on', b.dataset.opt === 'button' ? pcShowBtn : pcKeysOn));
  }
  togBtns.forEach(b => b.addEventListener('click', () => {
    if (b.dataset.opt === 'button') {
      pcShowBtn = !pcShowBtn;
      try { localStorage.setItem(PCBTN_KEY, String(pcShowBtn)); } catch (_) {}
      applyPcButton();
    } else {
      pcKeysOn = !pcKeysOn;
      try { localStorage.setItem(PCKEYS_KEY, String(pcKeysOn)); } catch (_) {}
      if (keyArm) { clearTimeout(keyArm.timer); keyArm = null; }
    }
    showToggles();
  }));
  showToggles();

  // ---------- mode switch ----------
  // pcMode needs a fine pointer that can hover and Torn not showing its mobile layout.
  // Phones and PDA never pass the pointer check, so they always run the mobile path.
  let modeSet = false;
  function applyMode() {
    const next = finePointer.matches && !mobileLayout();
    if (modeSet && next === pcMode) return;
    modeSet = true;
    pcMode = next;
    swipeGuard = !pcMode && !offline;
    if (pcMode) {
      if (open) setOpen(false);
      closePanel();
      closePicker();
      root.classList.add('qsw-pc-mode');
      document.body.classList.remove('qsw-sidebar-disabled');
      maybeShowHint();
    } else {
      pcHint.classList.remove('show');
      pcClose();
      if (keyArm) { clearTimeout(keyArm.timer); keyArm = null; }
      closePanel();
      closePicker();
      root.classList.remove('qsw-pc-mode');
      document.body.classList.add('qsw-sidebar-disabled');
      applyPosition();
    }
    applyMenuButton();
    applyPcButton();
  }
  if (finePointer.addEventListener) finePointer.addEventListener('change', applyMode);
  else if (finePointer.addListener) finePointer.addListener(applyMode);

  // ---------- it-just-works extras ----------
  // Logged out / login page: no sidebar, no account menu, and a login form. Flying also has no
  // sidebar, so the login form is what tells the two apart.
  function applyLoggedOut() {
    const v = !document.getElementById('sidebar') && !document.querySelector('.settings-menu') &&
      !!document.querySelector('input[type="password"]');
    swipeGuard = !pcMode && !v;
    if (v === offline) return;
    offline = v;
    if (v) { if (open) setOpen(false); closePanel(); closePicker(); pcClose(); pcHint.classList.remove('show'); }
    root.classList.toggle('qsw-off', v);
    applyPcButton();
  }

  // First run: sync from Torn's sidebar as soon as it's on the page, so the wheel isn't stuck on
  // placeholder links until someone finds Refresh.
  let firstSyncDone = true;
  try { firstSyncDone = !!(localStorage.getItem(LASTSYNC_KEY) || localStorage.getItem(ITEMS_KEY)); } catch (_) {}
  function firstSync() {
    if (firstSyncDone || offline) return;
    if (syncFromSidebar(true)) {
      firstSyncDone = true;
      try { localStorage.setItem(LASTSYNC_KEY, String(Date.now())); } catch (_) {}
    }
  }

  // Follow the sidebar as it changes (landing abroad adds Rehab and co., event links come and go),
  // with no Refresh needed. Cheap check first: row ids + hrefs.
  let sbSig = '', sbEl = null, sbDirty = true; // dirty: the sidebar changed since the last check
  function sidebarSig() {
    const sb = document.getElementById('sidebar');
    if (!sb) return '';
    let sig = '';
    sb.querySelectorAll('[id^="nav-"]').forEach(r => {
      const a = r.matches('a[href]') ? r : r.querySelector('a[href]');
      sig += r.id + '=' + (a ? a.getAttribute('href') : '') + '|';
    });
    return sig;
  }
  function autoSync() {
    if (offline || !sbDirty) return;
    sbDirty = false;
    sbEl = document.getElementById('sidebar');
    const sig = sidebarSig();
    if (!sig || sig === sbSig) return;
    sbSig = sig;
    if (syncFromSidebar(false)) {
      firstSyncDone = true;
      try { localStorage.setItem(LASTSYNC_KEY, String(Date.now())); } catch (_) {}
      if (panel.classList.contains('show')) updateStat();
    }
  }

  // Phones: the button steps aside while typing (Android lifts it above the keyboard, over the
  // text box). Only for fields tapped into, so an autofocused field doesn't hide it.
  const isTextField = el => !!el && (el.isContentEditable || el.tagName === 'TEXTAREA' ||
    (el.tagName === 'INPUT' && !/^(button|submit|checkbox|radio|range|color|file|image|reset|hidden)$/i.test(el.type)));
  // Looks inside shadow roots too, in case a chat box lives in one.
  const deepActive = () => { let a = document.activeElement; while (a && a.shadowRoot && a.shadowRoot.activeElement) a = a.shadowRoot.activeElement; return a; };
  document.addEventListener('focusin', e => {
    const t = (e.composedPath && e.composedPath()[0]) || e.target;
    if (!pcMode && lastPointer === 'touch' && isTextField(t) && !root.contains(t)) root.classList.add('qsw-typing');
  }, true);
  document.addEventListener('focusout', () => setTimeout(() => {
    const a = deepActive();
    if (!isTextField(a) || root.contains(a)) root.classList.remove('qsw-typing');
  }, 0), true);

  // Esc closes whatever is open: picker, then settings, then the mobile wheel.
  window.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if (picker.classList.contains('show')) closePicker();
    else if (panel.classList.contains('show')) closePanel();
    else if (open) setOpen(false);
    else return;
    e.preventDefault();
    e.stopPropagation();
  }, true);

  // Another Torn tab changed a setting: take it on here too, so this tab never saves stale data
  // over it.
  window.addEventListener('storage', e => {
    if (!e.key || e.key.indexOf('qsWheel_') !== 0) return;
    const read = (fallback) => { try { const v = JSON.parse(localStorage.getItem(e.key)); return v == null ? fallback : v; } catch (_) { return fallback; } };
    const raw = () => { try { return localStorage.getItem(e.key); } catch (_) { return null; } };
    switch (e.key) {
      case CUSTOM_KEY: {
        const c = read(null);
        customSlots = new Array(CUST_COUNT).fill(null);
        if (Array.isArray(c)) for (let i = 0; i < CUST_COUNT; i++) customSlots[i] = c[i] || null;
        buildCustom();
        if (panel.classList.contains('show')) renderPanelSlots();
        break;
      }
      case ITEMS_KEY: {
        const c = read(null);
        if (Array.isArray(c) && c.length) { items = c; if (open) pendingRebuild = true; else rebuild(); }
        firstSyncDone = true;
        break;
      }
      case URLFIX_KEY: { const c = read({}); if (c && typeof c === 'object') urlFixes = c; break; }
      case NOTIFIED_KEY: { const c = read({}); if (c && typeof c === 'object') notifiedCounts = c; break; }
      case PCTRIG_KEY: pcTrigger = isWindows && raw() !== 'middle' ? 'right' : 'middle'; showTrigger(); break;
      case OPACITY_KEY: applyOpacity(readOpacity()); break;
      case THEME_KEY: applyTheme(raw() || 'green'); renderColours(); break;
      case ANIM_KEY: { const v = raw(); animChosen = ANIM_LEVELS.some(l => l.id === v) ? v : null; animLevel = animChosen || autoAnim(); applyAnim(); renderAnim(); break; }
      case PCBTN_KEY: { const v = raw(); pcShowBtn = v === 'true' ? true : v === 'false' ? false : isMac; applyPcButton(); showToggles(); break; }
      case PCKEYS_KEY: pcKeysOn = raw() !== 'false'; showToggles(); break;
      case LEFT_KEY: case POS_KEY: {
        if (drag) break;
        if (e.key === LEFT_KEY) leftHanded = raw() === 'true';
        else { const v = parseFloat(raw()); btnBottom = isNaN(v) ? null : v; }
        applyHandedness();
        applyPosition();
        break;
      }
    }
  });

  // ---------- mount ----------
  document.body.appendChild(overlay);
  document.body.appendChild(pbg);
  document.body.appendChild(root);
  document.body.appendChild(pcRoot);
  document.body.appendChild(pcBtn);
  document.body.appendChild(pcHint);

  applyMode();
  applyLoggedOut();
  firstSync();
  autoSync();
  checkFlyout();

  // Torn PDA running the script on "End" (after the whole page has loaded): a one-off tip to switch
  // its Injection time to Start. Not shown to anyone already on Start.
  const PDATIP_KEY = 'qsWheel_pdaTipSeen_v1';
  const inPDA = !!window.flutter_inappwebview || typeof window.PDA_httpGet === 'function' || /TornPDA/i.test(navigator.userAgent);
  let pdaTipSeen = false;
  try { pdaTipSeen = localStorage.getItem(PDATIP_KEY) === 'true'; } catch (_) {}
  if (inPDA && lateStart && !pdaTipSeen) {
    const tip = document.createElement('div');
    tip.id = 'qsw-pdatip';
    tip.innerHTML = '<b>Torn PDA tip</b><div>The wheel can appear sooner. In PDA\u2019s userscript settings, set this script\u2019s <strong>Injection time</strong> to <strong>Start</strong>.</div><button type="button">Got it</button>';
    document.body.appendChild(tip);
    tip.querySelector('button').addEventListener('click', () => {
      try { localStorage.setItem(PDATIP_KEY, 'true'); } catch (_) {}
      tip.classList.remove('show');
      setTimeout(() => tip.remove(), 400);
    });
    setTimeout(() => { if (!offline) tip.classList.add('show'); }, 1200);
  }
  applyHandedness(); // set side, then build all rings
  applyPosition();
  refreshStats();
  checkNotifications(); // syncs unread state only; baseline already seeded

  // Poll pinned badges and stat bars, only while the page is visible and focused. Coming
  // back to the page resyncs silently (no vibration for things that arrived while away).
  setInterval(() => {
    if (!pageActive()) return;
    refreshPinned();
    refreshStats();
  }, BADGE_POLL_MS);

  function resyncSilently() {
    if (!pageActive()) return;
    pinned = readPinned();
    pinned.forEach(p => { notifiedCounts[p.key] = p.badge; });
    saveNotified();
    refreshPinned(); // counts already baselined, so no vibration
    refreshStats();
  }
  document.addEventListener('visibilitychange', resyncSilently);

  // Leaving the page mid-spin or mid-drag: stop dead and snap, so nothing is left running
  // (or half a gesture left open) when the app or tab comes back.
  function haltSpin() {
    if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
    if (gesture) {
      clearTimeout(gesture.timer);
      if (gesture.zone === 'custom' && cgEls[gesture.idx]) cgEls[gesture.idx].classList.remove('press');
      if (gesture.zone === 'pin' && pgEls[gesture.idx]) pgEls[gesture.idx].classList.remove('press');
      gesture = null;
    }
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
  window.addEventListener('focus', resyncSilently);
    mainUp = true;
    if (earlyStyle) earlyStyle.remove();
  }
})();
