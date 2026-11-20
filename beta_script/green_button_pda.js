// ==UserScript==
// @name         Torn Dock Button — Torn PDA Edition
// @namespace    http://tampermonkey.net/
// @version      1.1.0
// @description  Self-running: adds a green "T3" button next to Torn's People panel button. Compatible with Torn PDA's userscript runner.
// @match        https://www.torn.com/*
// @run-at       document-start
// @noframes
// ==/UserScript==

/*
 * TORN PDA NOTES
 * --------------
 * - Torn PDA runs userscripts inside the app's WebView. Most Tampermonkey
 *   scripts work without changes, but:
 *     * GM_* APIs are shimmed but limited. We avoid them where possible.
 *     * @run-at document-start IS supported. We use it + wait for body.
 *     * GM_registerMenuCommand has no UI in PDA — skip it.
 *     * unsafeWindow === window (no sandbox), so all globals are shared.
 *     * pointerdown/click work normally in PDA's WebView.
 *
 * INSTALL
 * -------
 * In Torn PDA: Settings → Userscripts → + → paste this file → Save.
 * Reload the page (or restart the app) and you'll see the green T3 button.
 */

(function () {
  'use strict';

  // ============================================================
  // Config — edit these to customize your button
  // ============================================================
  const CONFIG = {
    buttonId: 'torn-dock-test-btn',
    label: 'T3',
    title: 'Torn Dock Test Button',
    ariaLabel: 'Torn Dock Test Button',
    backgroundColor: '#22c55e',  // bright green
    hoverColor: '#16a34a',
    textColor: '#fff',
    side: 'after',               // 'after' or 'before' the People button
    onClick: () => {
      console.log('[TornDockTest] onClick fired');
      alert('Torn Dock Test button clicked!');
    }
  };

  const STYLE_ID = 'torn-dock-test-style';
  const PEOPLE_ID = 'people_panel_button';

  // ============================================================
  // Styles
  // ============================================================
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
  -webkit-tap-highlight-color:transparent;
}
#${CONFIG.buttonId}:hover{ background:${CONFIG.hoverColor} !important; }
#${CONFIG.buttonId}:active{ background:${CONFIG.hoverColor} !important; }
`;
    // In PDA's document-start, <head> may not exist yet.
    (document.head || document.documentElement).appendChild(el);
  }

  // ============================================================
  // Button factory
  // ============================================================
  let buttonEl = null;

  function createButton() {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.id = CONFIG.buttonId;
    btn.title = CONFIG.title;
    btn.setAttribute('aria-label', CONFIG.ariaLabel);
    btn.textContent = CONFIG.label;

    // Bulletproof click handling:
    // - pointerdown fires FIRST (before React can detach the button)
    // - capture phase = runs before Torn's bubble-phase handlers
    // - stopImmediatePropagation = blocks other listeners on the same element
    const handler = (e) => {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      try { CONFIG.onClick(); } catch (err) { console.error('[TornDockTest] onClick threw', err); }
    };

    // pointerdown is the most reliable on mobile (PDA), click is the desktop fallback
    btn.addEventListener('pointerdown', handler, true);
    btn.addEventListener('click', handler, true);

    return btn;
  }

  // ============================================================
  // Find People button
  // ============================================================
  function peopleButton() {
    return (
      document.getElementById(PEOPLE_ID) ||
      document.querySelector('[id*="people_panel_button"]')
    );
  }

  // ============================================================
  // Sync — idempotent placement
  // ============================================================
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

  // ============================================================
  // Debounced sync
  // ============================================================
  let syncTimer = 0;
  function scheduleSync() {
    if (syncTimer) return;
    syncTimer = setTimeout(() => {
      syncTimer = 0;
      try { sync(); } catch (e) { console.warn('[TornDockTest] sync failed', e); }
    }, 200);
  }

  // ============================================================
  // Dock-row observer (childList only — no infinite loops)
  // ============================================================
  let observedRow = null;
  const rowObserver = new MutationObserver(scheduleSync);
  function observeRow(row) {
    if (row === observedRow) return;
    if (observedRow) rowObserver.disconnect();
    observedRow = row;
    if (row) rowObserver.observe(row, { childList: true });
  }

  // ============================================================
  // SPA navigation hook
  // ============================================================
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

  // ============================================================
  // PDA tab visibility — Torn PDA emits a custom event when the active
  // tab changes (script tab switching in the app's bottom nav).
  // We also fall back to the standard visibilitychange.
  // ============================================================
  const PDA_TAB_EVENT = 'tornpda:tabState';
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) scheduleSync();
  });
  window.addEventListener(PDA_TAB_EVENT, () => scheduleSync());

  // ============================================================
  // Poll for People button until found
  // ============================================================
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
      } else if (attempts > 60) {
        // give up after 30s
        clearInterval(iv);
      }
    }, 500);
  }

  // ============================================================
  // Boot — at document-start, body may not exist yet.
  // Wait for it, then proceed.
  // ============================================================
  function boot() {
    addStyle();
    startPolling();
    console.log('[TornDockTest] booted on PDA');
  }

  if (document.body) {
    boot();
  } else {
    // document-start: wait for body, but install the style ASAP
    addStyle();
    const iv = setInterval(() => {
      if (document.body) {
        clearInterval(iv);
        boot();
      }
    }, 30);
  }

  // Safety: also boot on DOMContentLoaded (in case PDA injects late)
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  }
})();
