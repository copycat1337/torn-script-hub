// ==UserScript==
// @name         Torn Chain Watcher (Both Sides)
// @namespace    twse.chainwatcher
// @version      1.1.0
// @description  Tiny floating widget that watches both factions' chains on the Torn war page and warns when a chain is about to die (<1 min).
// @author       c0pyc4t 4039125
// @license      MIT
// @match        https://www.torn.com/factions.php*
// @connect      api.torn.com
// @grant        GM_registerMenuCommand
// @grant        GM_addStyle
// @grant        GM_xmlhttpRequest
// @grant        unsafeWindow
// @run-at       document-end
// ==/UserScript==

(function () {
  'use strict';

  // ---------------------------------------------------------------------------
  // CONFIG / STORAGE
  // ---------------------------------------------------------------------------
  const STORAGE_PREFIX = 'tcw-';
  const config = {
    get apiKey()      { return localStorage.getItem(STORAGE_PREFIX + 'apikey') || ''; },
    set apiKey(v)     { localStorage.setItem(STORAGE_PREFIX + 'apikey', v); },
    get position()    { try { return JSON.parse(localStorage.getItem(STORAGE_PREFIX + 'pos')); } catch { return null; } },
    set position(v)   { v === null ? localStorage.removeItem(STORAGE_PREFIX + 'pos') : localStorage.setItem(STORAGE_PREFIX + 'pos', JSON.stringify(v)); },
    get soundEnabled(){ return localStorage.getItem(STORAGE_PREFIX + 'sound') !== '0'; },
    set soundEnabled(v){ localStorage.setItem(STORAGE_PREFIX + 'sound', v ? '1' : '0'); },
    get warnSeconds() { return parseInt(localStorage.getItem(STORAGE_PREFIX + 'warn') || '60', 10); },
    set warnSeconds(v){ localStorage.setItem(STORAGE_PREFIX + 'warn', String(v)); }
  };

  const POLL_MS     = 5000;   // faster than before — chain timers move quickly
  const WATCH_MS    = 500;
  const CACHE_TTL_MS = 3000;  // short cache; still avoids double-hits if 2 factions polled in same tick

  // ---------------------------------------------------------------------------
  // LOGGING
  // ---------------------------------------------------------------------------
  const LOG_PREFIX = '[TCW]';
  const log  = (...a) => console.log(LOG_PREFIX, ...a);
  const warn = (...a) => console.warn(LOG_PREFIX, ...a);

  // ---------------------------------------------------------------------------
  // STYLES
  // ---------------------------------------------------------------------------
  GM_addStyle(`
    #tcw-bubble {
      position: fixed; bottom: 100px; right: 20px; z-index: 999999;
      background: rgba(30,30,30,0.92); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
      border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; padding: 8px 10px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.4); color: #e0e0e0;
      font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 12px; line-height: 1.4; min-width: 170px; cursor: grab;
      user-select: none; -webkit-user-select: none; touch-action: none;
      display: flex; flex-direction: column; gap: 6px;
    }
    #tcw-bubble.tcw-hidden { display: none !important; }
    #tcw-bubble .tcw-header {
      display: flex; align-items: center; justify-content: space-between; gap: 8px;
      font-weight: 700; font-size: 10px; letter-spacing: 0.5px; opacity: 0.75;
      padding-bottom: 4px; border-bottom: 1px solid rgba(255,255,255,0.08);
    }
    #tcw-bubble .tcw-collapse { cursor: pointer; background: none; border: none; color: #aaa; font-size: 11px; padding: 0 4px; }
    #tcw-bubble.tcw-collapsed .tcw-body { display: none; }
    #tcw-bubble .tcw-body { display: flex; flex-direction: column; gap: 5px; }
    .tcw-row { display: flex; align-items: center; gap: 8px; padding: 4px 6px; border-radius: 6px; background: rgba(255,255,255,0.04); transition: background 0.2s ease; }
    .tcw-row.tcw-warn   { background: rgba(255,170,40,0.18); }
    .tcw-row.tcw-danger { background: rgba(255,60,60,0.22); animation: tcw-blink 1s ease-in-out infinite alternate; }
    .tcw-label { font-weight: 700; font-size: 10px; letter-spacing: 0.5px; opacity: 0.8; min-width: 44px; }
    .tcw-count { font-weight: 700; color: #fff; min-width: 42px; }
    .tcw-timer {
      margin-left: auto; font-family: ui-monospace, Menlo, Consolas, monospace; font-weight: 700;
      padding: 2px 6px; border-radius: 4px; background: rgba(0,0,0,0.35); min-width: 52px; text-align: center;
    }
    .tcw-timer.okay     { color: #69eb69; }
    .tcw-timer.warn     { color: #ffb347; background: rgba(255,170,40,0.18); }
    .tcw-timer.danger   { color: #ff5252; background: rgba(255,82,82,0.22); }
    .tcw-timer.cooldown { color: #64b5f6; background: rgba(100,181,246,0.15); }
    .tcw-timer.negative { color: #ff5252; }
    .tcw-empty { opacity: 0.6; font-style: italic; padding: 4px 2px; font-size: 11px; }
    .tcw-err   { color: #ff9b9b; font-size: 11px; padding: 4px 2px; }
    @keyframes tcw-blink {
      from { box-shadow: 0 0 3px rgba(255,60,60,0.35); }
      to   { box-shadow: 0 0 12px rgba(255,60,60,0.9); }
    }
    #tcw-toast {
      position: fixed; top: 20px; left: 50%; transform: translateX(-50%);
      background: #c0392b; color: #fff; padding: 10px 16px; border-radius: 8px;
      font-weight: 700; z-index: 10000000; box-shadow: 0 6px 20px rgba(0,0,0,0.4);
      font-family: Inter, sans-serif;
    }
  `);

  // ---------------------------------------------------------------------------
  // HELPERS
  // ---------------------------------------------------------------------------
  function getCurrentTime() {
    const w = unsafeWindow || window;
    if (typeof w.getCurrentTimestamp === 'function') {
      try { return w.getCurrentTimestamp(); } catch (_) {}
    }
    return Date.now();
  }
  const pad = (n) => (n < 10 ? `0${n}` : `${n}`);

  function formatChainTimer(seconds) {
    const neg = seconds < 0;
    const abs = Math.abs(seconds);
    const m = Math.floor(abs / 60);
    const s = Math.floor(abs % 60);
    return `${neg ? '-' : ''}${m}:${pad(s)}`;
  }
  function formatCooldown(seconds) {
    if (seconds <= 0) return '0:00';
    const s = Math.floor(seconds % 60);
    const m = Math.floor(seconds / 60 % 60);
    const h = Math.floor(seconds / 3600 % 24);
    const d = Math.floor(seconds / 86400);
    if (d > 0) return `${d}d${h}h`;
    if (h > 0) return `${h}h${m}m`;
    if (m >= 10) return `${m}m`;
    return `${m}:${pad(s)}`;
  }

  function parseHrefParam(anchor, name) {
    try { return new URL(anchor.href, 'https://www.torn.com').searchParams.get(name); }
    catch { return null; }
  }
  function getFactionIds() {
    const ids = [];
    for (const list of document.querySelectorAll('ul.members-list')) {
      const anchor = list.querySelector("a[href^='/factions.php']");
      if (!anchor) continue;
      const id = parseHrefParam(anchor, 'ID');
      if (id) ids.push(id);
    }
    return ids;
  }
  function getYourFactionId() {
    const yourLi = document.querySelector('ul.members-list li.your');
    if (!yourLi) return null;
    const anchor = yourLi.closest('ul.members-list')?.querySelector("a[href^='/factions.php']");
    if (!anchor) return null;
    return parseHrefParam(anchor, 'ID');
  }

  // ---------------------------------------------------------------------------
  // API  — v1 endpoint, which reliably returns chain data for a faction
  // ---------------------------------------------------------------------------
  const cache = new Map();      // factionId -> { data, at }
  const lastError = new Map();  // factionId -> { code, msg, at }

  function fetchFactionChain(factionId) {
    return new Promise((resolve) => {
      const now = Date.now();
      const cached = cache.get(factionId);
      if (cached && now - cached.at < CACHE_TTL_MS) {
        resolve(cached.data);
        return;
      }

      const key = config.apiKey;
      if (!key || key.length !== 16) {
        lastError.set(factionId, { code: 'NO_KEY', msg: 'Set an API key via the Tampermonkey menu', at: now });
        resolve(null);
        return;
      }

      // v1 endpoint — battle-tested for chain data. We add `&timestamp=`
      // to defeat Torn's own CDN caching.
      const url = `https://api.torn.com/faction/${factionId}`
        + `?selections=chain,timestamp`
        + `&key=${encodeURIComponent(key)}`
        + `&comment=ChainWatcher`
        + `&timestamp=${(now % 1000) + 10}`;

      GM_xmlhttpRequest({
        method: 'GET',
        url,
        timeout: 10000,
        onload: (res) => {
          let data = null;
          try { data = JSON.parse(res.responseText); }
          catch (e) { warn('JSON parse failed', e, res.responseText?.slice(0, 200)); }

          if (!data) {
            lastError.set(factionId, { code: 'PARSE', msg: 'Bad JSON from API', at: now });
            resolve(null);
            return;
          }
          if (data.error) {
            lastError.set(factionId, { code: data.error.code, msg: data.error.error, at: now });
            warn(`API error ${data.error.code}: ${data.error.error}`);
            resolve(null);
            return;
          }
          if (!data.chain) {
            lastError.set(factionId, { code: 'NO_CHAIN', msg: 'Response had no chain object', at: now });
            resolve(null);
            return;
          }

          lastError.delete(factionId);
          cache.set(factionId, { data, at: now });
          resolve(data);
        },
        onerror: (e) => {
          lastError.set(factionId, { code: 'NET', msg: 'Network error', at: now });
          warn('network error', e);
          resolve(null);
        },
        ontimeout: () => {
          lastError.set(factionId, { code: 'TIMEOUT', msg: 'Request timed out', at: now });
          warn('request timed out');
          resolve(null);
        }
      });
    });
  }

  // ---------------------------------------------------------------------------
  // WIDGET
  // ---------------------------------------------------------------------------
  let bubble = null;
  let bodyEl = null;
  let lastHtml = '';
  let isDragging = false;
  const chainState = new Map();   // factionId -> chain object
  const warned = new Map();       // factionId -> bool

  function buildBubble() {
    if (bubble) return;
    bubble = document.createElement('div');
    bubble.id = 'tcw-bubble';
    bubble.innerHTML = `
      <div class="tcw-header">
        <span>⚔ CHAINS</span>
        <button type="button" class="tcw-collapse" title="Collapse">–</button>
      </div>
      <div class="tcw-body">
        <div class="tcw-empty">Waiting for war page…</div>
      </div>
    `;
    document.body.appendChild(bubble);
    bodyEl = bubble.querySelector('.tcw-body');

    const pos = config.position;
    if (pos) {
      bubble.style.bottom = 'auto';
      bubble.style.right = 'auto';
      bubble.style.left = `${pos.left}px`;
      bubble.style.top = `${pos.top}px`;
    }

    bubble.querySelector('.tcw-collapse').addEventListener('click', (e) => {
      e.stopPropagation();
      bubble.classList.toggle('tcw-collapsed');
    });

    let startX = 0, startY = 0, initialLeft = 0, initialTop = 0;

    const onMove = (clientX, clientY) => {
      if (!isDragging) return;
      const dx = clientX - startX, dy = clientY - startY;
      const rect = bubble.getBoundingClientRect();
      let newLeft = initialLeft + dx;
      let newTop  = initialTop + dy;
      newLeft = Math.max(0, Math.min(newLeft, window.innerWidth  - rect.width));
      newTop  = Math.max(0, Math.min(newTop,  window.innerHeight - rect.height));
      bubble.style.bottom = 'auto';
      bubble.style.right  = 'auto';
      bubble.style.left   = `${newLeft}px`;
      bubble.style.top    = `${newTop}px`;
    };
    const onEnd = () => {
      if (!isDragging) return;
      isDragging = false;
      bubble.style.cursor = 'grab';
      const left = parseFloat(bubble.style.left) || 0;
      const top  = parseFloat(bubble.style.top)  || 0;
      config.position = { left, top };
      document.removeEventListener('mousemove', mouseMove);
      document.removeEventListener('mouseup', onEnd);
      bubble.removeEventListener('touchmove', touchMove);
      bubble.removeEventListener('touchend', onEnd);
      bubble.removeEventListener('touchcancel', onEnd);
    };
    const mouseMove = (e) => onMove(e.clientX, e.clientY);
    const touchMove = (e) => {
      if (e.touches.length) onMove(e.touches[0].clientX, e.touches[0].clientY);
      if (e.cancelable) e.preventDefault();
    };
    const onStart = (clientX, clientY, e) => {
      if (e.target.closest('.tcw-collapse')) return;
      isDragging = true;
      startX = clientX; startY = clientY;
      const rect = bubble.getBoundingClientRect();
      initialLeft = rect.left; initialTop = rect.top;
      bubble.style.cursor = 'grabbing';
      document.addEventListener('mousemove', mouseMove);
      document.addEventListener('mouseup', onEnd);
      bubble.addEventListener('touchmove', touchMove, { passive: false });
      bubble.addEventListener('touchend', onEnd);
      bubble.addEventListener('touchcancel', onEnd);
    };
    bubble.addEventListener('mousedown', (e) => onStart(e.clientX, e.clientY, e));
    bubble.addEventListener('touchstart', (e) => {
      if (e.touches.length) onStart(e.touches[0].clientX, e.touches[0].clientY, e);
    }, { passive: true });

    window.addEventListener('resize', () => {
      if (!config.position) return;
      const rect = bubble.getBoundingClientRect();
      const left = Math.max(0, Math.min(rect.left, window.innerWidth  - rect.width));
      const top  = Math.max(0, Math.min(rect.top,  window.innerHeight - rect.height));
      bubble.style.left = `${left}px`;
      bubble.style.top  = `${top}px`;
      config.position = { left, top };
    });
  }

  function maybeWarn(factionId, isYours, remainingSec, chain) {
    if (chain.cooldown > 0 || chain.current === 0 || remainingSec < 0) {
      warned.delete(factionId);
      return;
    }
    if (remainingSec > config.warnSeconds) return;
    if (warned.get(factionId)) return;
    warned.set(factionId, true);

    const who = isYours ? 'YOUR' : 'ENEMY';
    const msg = `⚠️ ${who} chain (${chain.current}/${chain.max}) dying in ${Math.round(remainingSec)}s!`;
    showToast(msg);
    if (config.soundEnabled) playBeep();
  }

  function showToast(msg) {
    const toast = document.createElement('div');
    toast.id = 'tcw-toast';
    toast.textContent = msg;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 6000);
  }
  function playBeep() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = 880;
      gain.gain.value = 0.08;
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      setTimeout(() => { osc.stop(); ctx.close(); }, 220);
    } catch (_) {}
  }

  function renderBubble() {
    if (!bubble || !bodyEl) return;

    const nowSec = getCurrentTime() / 1000;
    const yourId = getYourFactionId();

    if (chainState.size === 0) {
      const errs = Array.from(lastError.values());
      let emptyMsg = '<div class="tcw-empty">Waiting for war page…</div>';
      if (errs.length) {
        const e = errs[0];
        emptyMsg = `<div class="tcw-err">⚠ ${e.msg}${e.code ? ` (${e.code})` : ''}</div>`;
      }
      if (lastHtml !== emptyMsg) { bodyEl.innerHTML = emptyMsg; lastHtml = emptyMsg; }
      return;
    }

    const ordered = Array.from(chainState.entries()).sort((a, b) => {
      if (yourId) {
        if (a[0] === yourId) return -1;
        if (b[0] === yourId) return 1;
      }
      return String(a[0]).localeCompare(String(b[0]));
    });

    let html = '';
    for (const [factionId, chain] of ordered) {
      const isYours = yourId && factionId === yourId;
      const label = isYours ? 'YOU' : 'ENEMY';

      let timerText = '';
      let timerClass = 'okay';
      let rowClass = '';

      if (chain.cooldown > 0) {
        const remainingCd = Math.max(0, chain.cooldown - nowSec);
        timerText = formatCooldown(remainingCd);
        timerClass = 'cooldown';
      } else if (chain.current === 0 || !chain.end || chain.end === 0) {
        timerText = '-:--';
      } else {
        const remaining = chain.end - nowSec;
        timerText = formatChainTimer(remaining);
        if (remaining < 0) {
          timerClass = 'negative'; rowClass = 'tcw-danger';
        } else if (remaining <= config.warnSeconds) {
          timerClass = 'danger'; rowClass = 'tcw-danger';
        } else if (remaining <= config.warnSeconds * 2) {
          timerClass = 'warn'; rowClass = 'tcw-warn';
        }
        maybeWarn(factionId, isYours, remaining, chain);
      }

      html += `
        <div class="tcw-row ${rowClass}" data-fid="${factionId}">
          <span class="tcw-label">${label}</span>
          <span class="tcw-count">${chain.current}/${chain.max}</span>
          <span class="tcw-timer ${timerClass}">${timerText}</span>
        </div>
      `;
    }

    if (html !== lastHtml) {
      bodyEl.innerHTML = html;
      lastHtml = html;
    }
  }

  // ---------------------------------------------------------------------------
  // POLLING
  // ---------------------------------------------------------------------------
  let pollTimer = null, watchTimer = null, running = false;

  async function pollOnce() {
    if (!running) return;
    if (!window.location.hash.startsWith('#/war/')) return;

    const factionIds = getFactionIds();
    if (factionIds.length === 0) return;

    log('polling factions:', factionIds.join(', '));

    // Fire all faction requests in parallel — no reason to serialize.
    const results = await Promise.all(
      factionIds.map(async (fid) => ({ fid, data: await fetchFactionChain(fid) }))
    );

    for (const { fid, data } of results) {
      if (!data || !data.chain) continue;
      const c = data.chain;
      chainState.set(fid, {
        current: c.current ?? 0,
        max: c.max ?? 0,
        timeout: c.timeout ?? 0,
        modifier: c.modifier ?? 1,
        cooldown: c.cooldown ?? 0,
        end: c.end ?? 0
      });
      log(`faction ${fid}: ${c.current}/${c.max}, cooldown=${c.cooldown ?? 0}, end=${c.end}`);
    }
  }

  function shouldShow() {
    return window.location.href.includes('factions.php')
      && window.location.hash.startsWith('#/war/');
  }

  function startLoops() {
    if (running) return;
    running = true;
    buildBubble();
    pollOnce();
    pollTimer  = setInterval(pollOnce, POLL_MS);
    watchTimer = setInterval(() => {
      if (!shouldShow()) { bubble?.classList.add('tcw-hidden'); return; }
      bubble?.classList.remove('tcw-hidden');
      renderBubble();
    }, WATCH_MS);
  }

  function stopLoops() {
    running = false;
    if (pollTimer)  { clearInterval(pollTimer);  pollTimer  = null; }
    if (watchTimer) { clearInterval(watchTimer); watchTimer = null; }
    chainState.clear();
    warned.clear();
    cache.clear();
    lastError.clear();
    bubble?.remove();
    bubble = null; bodyEl = null; lastHtml = '';
  }

  function onNavigation() {
    if (shouldShow()) startLoops();
    else stopLoops();
  }

  const nav = window.navigation;
  if (nav && typeof nav.addEventListener === 'function') {
    nav.addEventListener('currententrychange', onNavigation);
  } else {
    window.addEventListener('popstate',  () => setTimeout(onNavigation, 0));
    window.addEventListener('hashchange', () => setTimeout(onNavigation, 0));
  }

  const mo = new MutationObserver(() => {
    if (shouldShow() && !running) startLoops();
    if (!shouldShow() && running)  stopLoops();
  });
  mo.observe(document.documentElement, { childList: true, subtree: true });

  // ---------------------------------------------------------------------------
  // MENU COMMANDS
  // ---------------------------------------------------------------------------
  if (typeof GM_registerMenuCommand !== 'undefined') {
    GM_registerMenuCommand('Chain Watcher: Set API Key', () => {
      const current = config.apiKey;
      const input = prompt('Enter your 16-character Torn API key:', current);
      if (input === null) return;
      const trimmed = input.trim();
      if (trimmed === '') { config.apiKey = ''; alert('API key cleared.'); return; }
      if (trimmed.length !== 16) { alert('Invalid key — must be exactly 16 characters.'); return; }
      config.apiKey = trimmed;
      // Bust caches so the next poll uses the new key immediately
      cache.clear(); lastError.clear();
      alert('API key saved.');
    });
    GM_registerMenuCommand('Chain Watcher: Toggle Sound', () => {
      config.soundEnabled = !config.soundEnabled;
      alert(`Sound ${config.soundEnabled ? 'enabled' : 'disabled'}.`);
    });
    GM_registerMenuCommand('Chain Watcher: Set Warning Seconds', () => {
      const input = prompt('Warn when chain timer is under (seconds):', String(config.warnSeconds));
      if (input === null) return;
      const n = parseInt(input, 10);
      if (!Number.isFinite(n) || n < 5 || n > 600) { alert('Enter a number between 5 and 600.'); return; }
      config.warnSeconds = n;
      alert(`Warning threshold set to ${n} seconds.`);
    });
    GM_registerMenuCommand('Chain Watcher: Reset Position', () => {
      config.position = null;
      if (bubble) {
        bubble.style.left = ''; bubble.style.top = '';
        bubble.style.right = '20px'; bubble.style.bottom = '100px';
      }
      alert('Position reset.');
    });
  }

  onNavigation();
})();