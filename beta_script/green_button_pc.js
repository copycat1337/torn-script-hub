// ==UserScript==
// @name         Torn  Button POC
// @namespace    http://tampermonkey.net/
// @version      1.0.9
// @description  Same green T3 button but with bulletproof click handling: capture phase, pointerdown + click, stopPropagation, prevents TornW3B Companion interference.
// @match        https://www.torn.com/*
// @run-at       document-idle
// @noframes
// ==/UserScript==

(function () {
  'use strict';

  const CONFIG = {
    buttonId: 'torn-dock-test-btn',
    label: 'T3',
    title: 'Torn Dock Test Button',
    ariaLabel: 'Torn Dock Test Button',
    backgroundColor: '#22c55e',
    hoverColor: '#16a34a',
    textColor: '#fff',
    side: 'after',
    onClick: () => {
      console.log('[TornDockTest] onClick fired');
      alert('Torn Dock Test button clicked!');
    }
  };

  const STYLE_ID = 'torn-dock-test-style';
  const PEOPLE_ID = 'people_panel_button';

  function addStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const el = document.createElement('style');
    el.id = STYLE_ID;
    el.textContent = `
#${CONFIG.buttonId}{
  display:inline-flex !important;
  flex:0 0 auto !important;
  align-items:center;
  justify-content:center;
  min-width:36px;
  min-height:24px;
  padding:0 10px;
  margin:0 2px;
  background:${CONFIG.backgroundColor} !important;
  color:${CONFIG.textColor} !important;
  border:2px solid #000 !important;
  border-radius:4px;
  font:700 11px Arial,Helvetica,sans-serif;
  cursor:pointer;
  user-select:none;
  pointer-events:auto !important;
  position:relative;
  z-index:1;
}
#${CONFIG.buttonId}:hover{ background:${CONFIG.hoverColor} !important; }
`;
    (document.head || document.documentElement).appendChild(el);
  }

  let buttonEl = null;

  function createButton() {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.id = CONFIG.buttonId;
    btn.title = CONFIG.title;
    btn.setAttribute('aria-label', CONFIG.ariaLabel);
    btn.textContent = CONFIG.label;

    // Use BOTH pointerdown (fires first) and click (compatibility).
    // Capture phase = runs before Torn's handlers can intercept.
    const handler = (e) => {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      console.log('[TornDockTest] event type:', e.type);
      try { CONFIG.onClick(); } catch (err) { console.error('[TornDockTest] onClick threw', err); }
    };

    btn.addEventListener('pointerdown', handler, true);
    btn.addEventListener('mousedown', handler, true);
    btn.addEventListener('click', handler, true);

    return btn;
  }

  function peopleButton() {
    return (
      document.getElementById(PEOPLE_ID) ||
      document.querySelector('[id*="people_panel_button"]')
    );
  }

  function sync() {
    const people = peopleButton();
    if (!people) return;
    const row = people.parentElement;
    if (!row) return;

    if (!buttonEl || !buttonEl.isConnected) {
      buttonEl = createButton();
    }

    if (CONFIG.side === 'before') {
      if (buttonEl.parentElement !== row || buttonEl.nextElementSibling !== people) {
        row.insertBefore(buttonEl, people);
      }
    } else {
      if (buttonEl.parentElement !== row || buttonEl.previousElementSibling !== people) {
        people.insertAdjacentElement('afterend', buttonEl);
      }
    }
  }

  let syncTimer = 0;
  function scheduleSync() {
    if (syncTimer) return;
    syncTimer = setTimeout(() => {
      syncTimer = 0;
      try { sync(); } catch (e) { console.warn('[TornDockTest] sync failed', e); }
    }, 200);
  }

  let observedRow = null;
  const rowObserver = new MutationObserver(scheduleSync);
  function observeRow(row) {
    if (row === observedRow) return;
    if (observedRow) rowObserver.disconnect();
    observedRow = row;
    if (row) rowObserver.observe(row, { childList: true });
  }

  let lastHref = location.href;
  function onNav() {
    if (location.href === lastHref) return;
    lastHref = location.href;
    scheduleSync();
  }
  for (const m of ['pushState', 'replaceState']) {
    const orig = history[m];
    history[m] = function (...args) {
      const r = orig.apply(this, args);
      scheduleSync();
      return r;
    };
  }
  window.addEventListener('popstate', onNav);
  window.addEventListener('hashchange', onNav);

  function findAndObserve() {
    const people = peopleButton();
    if (people && people.parentElement) {
      observeRow(people.parentElement);
      sync();
      return true;
    }
    return false;
  }

  function startPolling() {
    if (findAndObserve()) return;
    let attempts = 0;
    const iv = setInterval(() => {
      attempts++;
      if (findAndObserve()) {
        clearInterval(iv);
      } else if (attempts > 30) {
        clearInterval(iv);
      }
    }, 500);
  }

  function boot() {
    addStyle();
    startPolling();
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) scheduleSync();
    });

    // Global click capture: if any click reaches the document and was on
    // our button (or inside it), fire the handler. This catches the case
    // where Torn's React re-renders the row and detaches our button
    // between pointerdown and click.
    document.addEventListener('click', (e) => {
      if (e.target && (e.target.id === CONFIG.buttonId || e.target.closest('#' + CONFIG.buttonId))) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        console.log('[TornDockTest] global click capture fired');
        try { CONFIG.onClick(); } catch (err) { console.error('[TornDockTest] onClick threw', err); }
      }
    }, true);

    console.log('[TornDockTest] booted');
  }

  if (document.body) {
    boot();
  } else {
    const iv = setInterval(() => {
      if (document.body) {
        clearInterval(iv);
        boot();
      }
    }, 30);
  }
})();
