// ==UserScript==
// @name         C0pyc4t Dibs (PC Version)
// @namespace    https://dibs.ghostprotocol.cyou/
// @version      3.7.0-PC
// @description  War-aware faction calling; release only after confirmed combat hospitalizations. Torn PDA friendly: dedicated Call column, on-screen API key entry, touch-optimised.
// @author       c0pyc4t [4039125] & Gezkeni [4501153] (PDA port)
// @match        https://www.torn.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_registerMenuCommand
// @connect      dibs.ghostprotocol.cyou
// @connect      api.torn.com
// @run-at       document-idle
// ==/UserScript==

(function () {
  "use strict";

  const SERVER = "https://dibs.ghostprotocol.cyou";
  const POLL_CALLS_MS = 3000;
  const POLL_STATUS_MS = 20000;
  const POLL_WAR_MS = 120000;
  const DEBUG = true;

  const log = (...args) => { if (DEBUG) console.log("[CAT Dibs PDA]", ...args); };
  const getKey = () => GM_getValue("catlite_key", "");
  const getToken = () => GM_getValue("catlite_token", "");
  const getFaction = () => GM_getValue("catlite_faction", "");
  const getPlayer = () => GM_getValue("catlite_player_name", "");
  const getPlayerId = () => GM_getValue("catlite_player_id", "");

  const setStorage = (token, playerName, playerId, factionId, key) => {
    GM_setValue("catlite_token", token);
    GM_setValue("catlite_player_name", playerName);
    GM_setValue("catlite_player_id", String(playerId));
    GM_setValue("catlite_faction", String(factionId));
    GM_setValue("catlite_key", key);
  };

  const wipeStorage = () => {
    for (const name of ["catlite_token", "catlite_player_name", "catlite_player_id", "catlite_faction", "catlite_key"])
      GM_setValue(name, "");
    window.location.reload();
  };

  /**
   * Detect Torn PDA (Android/iOS WebView wrapper).
   * Torn PDA advertises itself via a distinctive User-Agent substring.
   * Used to tune touch targets and observer cadence.
   */
  const isPDA = (() => {
    const ua = (typeof navigator !== "undefined" ? navigator.userAgent || "" : "");
    return /Torn\s?PDA|TornPDA|PDA\/\d/i.test(ua) || (ua.includes("wv") && /Android/i.test(ua) && /Torn/i.test(document.referrer || ""));
  })();

  /**
   * Detect Torn's actual dark mode.
   * IMPORTANT: do NOT use [class*="dark"] or [class*="war"] — those substring
   * selectors match unrelated Torn classes (e.g. war_overview) and force dark
   * styling on the light theme. Only target real dark-mode root classes.
   */
  function isTornDarkMode() {
    return !!(document.querySelector(
      "html.dark-mode, body.dark-mode, body.dark-mode-lt, html[data-theme='dark'], body[data-theme='dark']"
    ));
  }

  function http(method, path, body, token) {
    return new Promise(resolve => {
      const headers = { "Content-Type": "application/json" };
      if (token) headers.Authorization = "Bearer " + token;
      GM_xmlhttpRequest({
        method,
        url: SERVER + path,
        headers,
        data: body == null ? undefined : JSON.stringify(body),
        timeout: 12000,
        onload: r => {
          let data = {};
          try { data = JSON.parse(r.responseText || "{}"); }
          catch { log("Invalid server JSON:", path); }
          resolve({ status: r.status, data });
        },
        onerror: e => { console.error("[CAT Lite PDA] Server network error:", path, e); resolve({ status: 0, data: { error: "network_error" } }); },
        ontimeout: () => { console.warn("[CAT Lite PDA] Server request timed out:", path); resolve({ status: 0, data: { error: "timeout" } }); }
      });
    });
  }

  async function register(key) {
    const { status, data } = await http("POST", "/api/register", { tornApiKey: key });
    if (status !== 200 || !data.success) throw new Error(data.error || "register_failed");
    setStorage(data.token, data.playerName || "", data.playerId || "", data.factionId || "", key);
    return data;
  }

  // ---- On-page API key entry ----
  let overlayEl = null;

  function removeOverlay() {
    if (overlayEl && overlayEl.parentNode) overlayEl.parentNode.removeChild(overlayEl);
    overlayEl = null;
  }

  function showKeyOverlay() {
    if (overlayEl) return;
    overlayEl = document.createElement("div");
    overlayEl.id = "catlite-overlay";
    overlayEl.style.cssText = `
      position:fixed;inset:0;z-index:2147483647;
      background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;
      font-family:Arial,sans-serif;
      -webkit-tap-highlight-color:transparent;
    `;

    const box = document.createElement("div");
    box.style.cssText = `
      background:#1c1c1c;border:1px solid #444;border-radius:10px;
      padding:18px;width:min(90vw,360px);color:#eee;box-shadow:0 8px 30px #000;
    `;

    const title = document.createElement("div");
    title.textContent = "CAT Dibs — Enter Torn API Key";
    title.style.cssText = "font-weight:700;font-size:15px;margin-bottom:10px;";

    const input = document.createElement("input");
    input.type = "text";
    input.placeholder = "Paste Public API Key";
    input.value = getKey();
    input.autocomplete = "off";
    input.spellcheck = false;
    input.style.cssText = `
      width:100%;box-sizing:border-box;padding:10px;border-radius:6px;
      border:1px solid #555;background:#111;color:#eee;font-size:16px;
    `;
    // font-size 16px prevents iOS zoom-on-focus inside PDA WebView

    const statusLine = document.createElement("div");
    statusLine.style.cssText = "margin-top:8px;font-size:12px;color:#f0ad4e;min-height:16px;";

    const row = document.createElement("div");
    row.style.cssText = "display:flex;gap:8px;margin-top:12px;";

    const saveBtn = document.createElement("button");
    saveBtn.type = "button";
    saveBtn.textContent = "Save & Login";
    saveBtn.style.cssText = `
      flex:1;padding:12px;border-radius:6px;border:1px solid #2a2a2a;cursor:pointer;
      font-weight:700;color:#fff;background:linear-gradient(180deg,#4a7a00,#2e4d00);
      touch-action:manipulation;-webkit-tap-highlight-color:transparent;
    `;

    const cancelBtn = document.createElement("button");
    cancelBtn.type = "button";
    cancelBtn.textContent = "Cancel";
    cancelBtn.style.cssText = `
      flex:1;padding:12px;border-radius:6px;border:1px solid #2a2a2a;cursor:pointer;
      font-weight:700;color:#eee;background:linear-gradient(180deg,#333,#1a1a1a);
      touch-action:manipulation;-webkit-tap-highlight-color:transparent;
    `;

    saveBtn.onclick = async () => {
      const key = input.value.trim();
      if (!key) { statusLine.textContent = "Please enter a key."; return; }
      saveBtn.disabled = true; cancelBtn.disabled = true;
      statusLine.style.color = "#f0ad4e";
      statusLine.textContent = "Registering...";
      try {
        await register(key);
        statusLine.style.color = "#7CFC00";
        statusLine.textContent = `Success! Logged in as ${getPlayer()}. Reloading...`;
        setTimeout(() => { removeOverlay(); window.location.reload(); }, 900);
      } catch (e) {
        saveBtn.disabled = false; cancelBtn.disabled = false;
        statusLine.style.color = "#ff5555";
        statusLine.textContent = "Error: " + e.message;
      }
    };

    cancelBtn.onclick = () => removeOverlay();

    input.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") saveBtn.click();
    });

    row.appendChild(saveBtn);
    row.appendChild(cancelBtn);
    box.appendChild(title);
    box.appendChild(input);
    box.appendChild(statusLine);
    box.appendChild(row);
    overlayEl.appendChild(box);
    document.body.appendChild(overlayEl);
    setTimeout(() => input.focus(), 50);
  }

  // Floating launcher button (only shown when not logged in)
  let launcherEl = null;
  function updateLauncher() {
    const loggedIn = !!getToken();
    if (loggedIn) {
      if (launcherEl && launcherEl.parentNode) launcherEl.parentNode.removeChild(launcherEl);
      launcherEl = null;
      removeOverlay();
      return;
    }
    if (launcherEl) return;
    launcherEl = document.createElement("button");
    launcherEl.id = "catlite-launcher";
    launcherEl.type = "button";
    launcherEl.textContent = "CAT";
    launcherEl.title = "Set Torn API Key for CAT Lite";
    // 56px so it clears Android's 48dp minimum touch target inside PDA.
    launcherEl.style.cssText = `
      position:fixed;right:14px;bottom:80px;z-index:2147483646;
      width:56px;height:56px;border-radius:50%;
      border:1px solid #2a2a2a;cursor:pointer;
      font:700 13px Arial,sans-serif;color:#fff;
      background:linear-gradient(180deg,#4a7a00,#2e4d00);
      box-shadow:0 4px 14px #000;text-shadow:0 1px 0 #000;
      touch-action:manipulation;-webkit-tap-highlight-color:transparent;
      user-select:none;-webkit-user-select:none;
    `;
    launcherEl.onclick = showKeyOverlay;
    document.body.appendChild(launcherEl);
  }

  GM_registerMenuCommand("1. Set Torn API Key", showKeyOverlay);
  GM_registerMenuCommand("2. Disconnect / Wipe Account", () => {
    if (confirm("Are you sure you want to clear your CAT login?")) wipeStorage();
  });
  GM_registerMenuCommand("3. Check Login Status", () => {
    alert(`CAT Status:\nPlayer: ${getPlayer()}\nID: ${getPlayerId()}\nMy faction: ${getFaction()}\nWar opponent: ${opponentFactionName || "None detected"}${opponentFactionId ? " (" + opponentFactionId + ")" : ""}\nToken: ${getToken() ? "Active" : "Missing"}\nPDA: ${isPDA ? "Yes" : "No"}\nDark mode: ${isTornDarkMode() ? "Yes" : "No"}`);
  });

  // ---- Core logic ----
  let calls = new Map();
  let statusCache = {};
  const eligibleCalls = new Set();
  let checkingStatuses = false;
  let refreshingCalls = false;
  let opponentFactionId = "";
  let opponentFactionName = "";
  let lastWarCheck = 0;
  let detectingWar = false;
  let cancelInProgress = new Set();
  const pendingTargets = new Set();
  let paintObserver = null;

  function injectStyles() {
    if (document.getElementById("catlite-styles")) return;
    const style = document.createElement("style");
    style.id = "catlite-styles";

    // Touch sizing: bigger on PDA, comfortable on desktop.
    // touch-action: manipulation kills the 300ms tap delay on mobile WebViews.
    const btnHeight = isPDA ? "26px" : "22px";
    const btnFont   = isPDA ? "bold 12px" : "bold 11px";
    const btnMinW   = isPDA ? "58px" : "50px";
    const colWidth  = isPDA ? "70px" : "60px";

    style.textContent = `
      .catlite-wrapper {
        display: inline-flex !important;
        align-items: center !important;
        justify-content: center !important;
        line-height: 0 !important;
      }

      .catlite-btn {
        display: inline-flex !important;
        align-items: center !important;
        justify-content: center !important;
        box-sizing: border-box !important;
        padding: 0 8px !important;
        min-width: ${btnMinW} !important;
        height: ${btnHeight} !important;
        line-height: ${btnHeight} !important;
        font: ${btnFont} Arial, sans-serif !important;
        cursor: pointer !important;
        border-radius: 3px !important;
        border: 1px solid #5a5a5a !important;
        /* Classic light theme: dark-grey button is far more legible on light
           backgrounds than a near-white one. */
        background: linear-gradient(180deg, #6a6a6a, #3a3a3a) !important;
        color: #fff !important;
        text-shadow: 0 1px 0 #000 !important;
        white-space: nowrap !important;
        pointer-events: auto !important;
        touch-action: manipulation !important;
        -webkit-tap-highlight-color: transparent !important;
        user-select: none !important;
        -webkit-user-select: none !important;
        box-shadow: 0 1px 0 rgba(0,0,0,0.3) !important;
      }
      .catlite-btn:hover:not(:disabled) {
        filter: brightness(1.12) !important;
      }

      /* Real Torn dark mode only — do NOT use [class*="dark"] or [class*="war"]
         (they catch unrelated Torn classes and break the light theme). */
      html.dark-mode .catlite-btn,
      body.dark-mode .catlite-btn,
      body.dark-mode-lt .catlite-btn,
      html[data-theme="dark"] .catlite-btn,
      body[data-theme="dark"] .catlite-btn {
        border: 1px solid #111 !important;
        background: linear-gradient(180deg, #4a4a4a, #222) !important;
        color: #f0f0f0 !important;
        text-shadow: 0 1px 0 #000 !important;
      }

      .catlite-btn[data-mine="true"] {
        background: linear-gradient(180deg, #4a7a00, #2e4d00) !important;
        color: #fff !important;
        border-color: #1c2f00 !important;
        text-shadow: 0 1px 0 #000 !important;
      }
      .catlite-btn[data-other="true"] {
        background: linear-gradient(180deg, #7a2200, #4d1500) !important;
        color: #fff !important;
        border-color: #2a0a00 !important;
        text-shadow: 0 1px 0 #000 !important;
      }
      .catlite-btn:disabled {
        opacity: 0.7 !important;
        cursor: wait !important;
      }

      /* Custom Call column (old/classic theme list layout) */
      .catlite-custom-td {
        vertical-align: middle !important;
        text-align: center !important;
        padding: 0 5px !important;
        width: ${colWidth} !important;
        min-width: ${colWidth} !important;
        box-sizing: border-box !important;
        /* Ensure the cell stays visible and doesn't get squashed by flex siblings */
        flex: 0 0 ${colWidth} !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
      }
      .catlite-custom-th {
        width: ${colWidth} !important;
        min-width: ${colWidth} !important;
        flex: 0 0 ${colWidth} !important;
        text-align: center !important;
        box-sizing: border-box !important;
      }

      /* On very narrow PDA viewports, shrink the column slightly so we don't
         push the Attack button off-screen. */
      @media (max-width: 480px) {
        .catlite-custom-td, .catlite-custom-th {
          width: 56px !important;
          min-width: 56px !important;
          flex: 0 0 56px !important;
          padding: 0 3px !important;
        }
        .catlite-btn {
          min-width: 52px !important;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function paintAll() {
    // 1. New Theme (Table Layout) - inject into the name cell, keep layout
    const newThemeRows = document.querySelectorAll(
      'tr[data-warhelper-user-id], tr.members-row, tr[data-user-id]'
    );
    newThemeRows.forEach(tr => {
      const a = tr.querySelector('a[href*="XID="]');
      if (!a) return;
      const memberId = a.getAttribute("href")?.match(/XID=(\d+)/)?.[1];
      if (!memberId) return;

      const targetContainer =
        tr.querySelector('.__warhelper_war_overview_name-content') ||
        tr.querySelector('td.__warhelper_war_overview_name') ||
        tr.querySelector('.member-name, .name, td.name');
      if (!targetContainer) return;

      let wrapper = targetContainer.querySelector(":scope > .catlite-wrapper");
      if (!wrapper) {
        wrapper = document.createElement("span");
        wrapper.className = "catlite-wrapper";
        wrapper.style.marginLeft = "8px";
        targetContainer.appendChild(wrapper);
      }
      injectButton(wrapper, memberId, a);
    });

    // 2. Old Theme (List Layout) - inject a whole new column
    const oldThemeRows = document.querySelectorAll(
      'li.table-row, .table-body li, .members-list li, ul.members-list > li'
    );
    if (oldThemeRows.length > 0) {
      // Add Header Column if missing — try several known header containers
      // (desktop classic + PDA mobile variants)
      const headerCandidates = [
        '.table-header',
        '.members-list .table-header',
        '.table-head',
        'ul.table-header',
        '.members-table-head',
        '.content-scroll .table-header'
      ];
      for (const sel of headerCandidates) {
        const headerRow = document.querySelector(sel);
        if (headerRow && !headerRow.querySelector('.catlite-custom-th')) {
          const th = document.createElement('div');
          th.className = 'table-cell catlite-custom-th';
          th.textContent = 'Call';
          headerRow.appendChild(th);
          break; // only inject into the first matching header
        }
      }

      oldThemeRows.forEach(li => {
        const a = li.querySelector('a[href*="XID="]');
        if (!a) return;
        const memberId = a.getAttribute("href")?.match(/XID=(\d+)/)?.[1];
        if (!memberId) return;

        // Skip if we already injected the cell
        let targetCell = li.querySelector(':scope > .catlite-custom-td, .catlite-custom-td');
        if (!targetCell) {
          targetCell = document.createElement('div');
          // Preserve Torn's table-cell class so it inherits the row's flex layout
          targetCell.className = 'table-cell catlite-custom-td';

          // Append after the last existing cell so we don't displace Attack.
          // On PDA the last child may be a status / action cell; appending
          // after it keeps the new column on the right edge of the row.
          const lastCell = li.querySelector('.table-cell:last-of-type') ||
                           li.querySelector('.table-cell:last-child') ||
                           li.lastElementChild;
          if (lastCell && lastCell !== targetCell) {
            lastCell.parentNode.insertBefore(targetCell, lastCell.nextSibling);
          } else {
            li.appendChild(targetCell);
          }
        }

        let wrapper = targetCell.querySelector(":scope > .catlite-wrapper");
        if (!wrapper) {
          wrapper = document.createElement("span");
          wrapper.className = "catlite-wrapper";
          targetCell.appendChild(wrapper);
        }

        injectButton(wrapper, memberId, a);
      });
    }
  }

  // Helper: button logic shared between themes
  function injectButton(wrapper, memberId, a) {
    let btn = wrapper.querySelector(".catlite-btn");
    if (!btn) {
      btn = document.createElement("button");
      btn.type = "button";
      btn.className = "catlite-btn";
      wrapper.appendChild(btn);
    }

    const call = calls.get(memberId);
    if (pendingTargets.has(memberId)) {
      if (btn.textContent !== "...") btn.textContent = "...";
      btn.disabled = true;
      btn.onclick = null;
      return;
    }
    btn.disabled = false;

    if (!call) {
      if (btn.dataset.state !== "call") {
        btn.dataset.state = "call";
        btn.dataset.mine = "false";
        btn.dataset.other = "false";
        btn.textContent = "CALL";
        btn.onclick = async (e) => {
          e.preventDefault();
          e.stopPropagation();

          if (pendingTargets.has(memberId)) return;
          pendingTargets.add(memberId);
          paintAll();

          const name = a.textContent?.trim() || "Target";
          try {
            const res = await http("POST", "/api/call", { memberId, memberName: name }, getToken());
            if (res.status === 200 && res.data?.success) {
              calls.set(memberId, {
                id: res.data.data.id,
                callerId: String(getPlayerId()),
                callerName: getPlayer(),
                isMine: true
              });
              const snapshot = statusCache[memberId];
              if (snapshot && snapshot.state.toLowerCase() !== "hospital") {
                eligibleCalls.add(String(res.data.data.id));
              }
            } else {
              alert("Server Rejected:\n" + (res.data?.error || "Unknown"));
            }
          } finally {
            pendingTargets.delete(memberId);
            paintAll();
          }
        };
      }
    } else {
      const callerName = String(call.callerName || "Unknown");
      const displayName = callerName.length > 8 ? callerName.substring(0, 7) + "…" : callerName;

      if (btn.dataset.state !== displayName) {
        btn.dataset.state = displayName;
        btn.textContent = displayName;
        btn.dataset.mine = call.isMine ? "true" : "false";
        btn.dataset.other = !call.isMine ? "true" : "false";

        if (call.isMine) {
          btn.onclick = async (e) => {
            e.preventDefault();
            e.stopPropagation();

            if (pendingTargets.has(memberId)) return;
            pendingTargets.add(memberId);
            paintAll();
            try {
              const res = await http("POST", "/api/call/" + encodeURIComponent(call.id) + "/cancel", null, getToken());
              if (res.status === 200 && res.data?.success) {
                calls.delete(memberId);
              } else {
                console.warn("[CAT Lite PDA] Manual cancel rejected:", res);
                alert("Cancel failed: " + (res.data?.error || "Unknown"));
              }
            } finally {
              pendingTargets.delete(memberId);
              paintAll();
            }
          };
        } else {
          btn.onclick = null;
        }
      }
    }
  }

  function startPaintObserver() {
    if (paintObserver) return;
    // Debounce more aggressively on PDA to save battery and reduce jank.
    const debounceMs = isPDA ? 450 : 300;
    paintObserver = new MutationObserver(() => {
      if (startPaintObserver._t) clearTimeout(startPaintObserver._t);
      startPaintObserver._t = setTimeout(paintAll, debounceMs);
    });
    paintObserver.observe(document.body, { childList: true, subtree: true });
  }

  async function refreshCalls() {
    if (!getToken() || refreshingCalls) return;
    refreshingCalls = true;
    try {
      const res = await http("GET", "/api/calls", null, getToken());
      if (res.status !== 200 || !res.data?.success) return;
      const me = String(getPlayerId());
      const next = new Map();
      for (const c of res.data.calls || []) {
        next.set(String(c.memberId), {
          id: c.id,
          callerId: String(c.callerId),
          callerName: c.callerName,
          isMine: String(c.callerId) === me
        });
      }
      calls = next;
      const activeIds = new Set([...next.values()].map(c => String(c.id)));
      for (const id of eligibleCalls) if (!activeIds.has(id)) eligibleCalls.delete(id);
      paintAll();
    } finally {
      refreshingCalls = false;
    }
  }

  function tornGet(path, key) {
    return new Promise((resolve, reject) => {
      const joiner = path.includes("?") ? "&" : "?";
      GM_xmlhttpRequest({
        method: "GET",
        url: `https://api.torn.com/v2${path}${joiner}key=${encodeURIComponent(key)}`,
        timeout: 12000,
        onload: r => {
          try {
            const data = JSON.parse(r.responseText || "{}");
            if (r.status !== 200 || data.error)
              throw new Error(JSON.stringify(data.error || { status: r.status }));
            resolve(data);
          } catch (e) { reject(e); }
        },
        onerror: () => reject(new Error("Torn API network error")),
        ontimeout: () => reject(new Error("Torn API request timeout"))
      });
    });
  }

  async function detectWarOpponent(force = false) {
    const key = getKey();
    const ownId = String(getFaction());
    if (!key || !ownId || detectingWar) return;
    if (!force && Date.now() - lastWarCheck < POLL_WAR_MS) return;
    detectingWar = true;
    try {
      const data = await tornGet(`/faction/${encodeURIComponent(ownId)}/wars`, key);
      const ranked = data.wars?.ranked;
      const warEnd = Number(ranked?.end || 0);
      const active = ranked && Array.isArray(ranked.factions) &&
        (!warEnd || warEnd * 1000 > Date.now());
      const enemy = active ? ranked.factions.find(f => String(f.id) !== ownId) : null;
      opponentFactionId = enemy ? String(enemy.id) : "";
      opponentFactionName = enemy?.name || "";
      lastWarCheck = Date.now();
      log(opponentFactionId
        ? `Ranked-war opponent: ${opponentFactionName} (${opponentFactionId})`
        : "No current ranked-war opponent detected; monitoring own faction for testing.");
    } catch (e) {
      console.warn("[CAT Lite PDA] Opponent detection failed:", e);
    } finally {
      detectingWar = false;
    }
  }

  function parseMemberStatuses(rawMembers) {
    const result = {};
    const members = Array.isArray(rawMembers)
      ? rawMembers
      : Object.entries(rawMembers || {}).map(([id, m]) => ({ ...m, id: m.id ?? id }));
    for (const m of members) {
      const id = m.id ?? m.user_id ?? m.player_id;
      if (id == null) continue;
      result[String(id)] = {
        state: String(m.status?.state ?? "").trim(),
        details: String(m.status?.details ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim(),
        until: Number(m.status?.until ?? 0)
      };
    }
    return result;
  }

  function isCombatHospitalization(status) {
    if (!status || status.state.toLowerCase() !== "hospital") return false;
    const reason = status.details.toLowerCase();
    return /\b(hospitalized by|attacked by|mugged by|lost to)\b/i.test(reason);
  }

  async function checkStatusesAndRelease() {
    const token = getToken();
    const key = getKey();
    const ownId = String(getFaction());
    if (!token || !key || !ownId || checkingStatuses) return;

    checkingStatuses = true;
    try {
      await detectWarOpponent();
      const ids = [...new Set([ownId, opponentFactionId].filter(Boolean))];
      const responses = await Promise.allSettled(
        ids.map(id => tornGet(`/faction/${encodeURIComponent(id)}/members`, key))
      );
      const nextCache = {};
      let successCount = 0;
      responses.forEach((result, index) => {
        if (result.status === "fulfilled" && result.value.members) {
          Object.assign(nextCache, parseMemberStatuses(result.value.members));
          successCount++;
        } else {
          console.warn("[CAT Lite PDA] Could not load member statuses for faction", ids[index],
            result.status === "rejected" ? result.reason : "missing members");
        }
      });
      if (!successCount) return;
      statusCache = nextCache;
      log("Monitored factions:", ids, "players loaded:", Object.keys(statusCache).length);

      const res = await http("GET", "/api/calls", null, token);
      if (res.status !== 200 || !res.data?.success) {
        console.warn("[CAT Lite PDA] Unable to retrieve calls for hospital check:", res);
        return;
      }

      let changed = false;
      for (const call of res.data.calls || []) {
        const targetId = String(call.memberId);
        const targetStatus = statusCache[targetId];
        const callId = String(call.id);
        if (targetStatus === undefined) {
          log("Target not in monitored faction rosters:", targetId);
          continue;
        }
        if (!targetStatus.state || targetStatus.state.toLowerCase() !== "hospital") {
          if (targetStatus.state) eligibleCalls.add(callId);
          continue;
        }
        if (!eligibleCalls.has(callId)) {
          log("Hospitalized target was never observed available after CALL; leaving call intact:",
            { targetId, reason: targetStatus.details });
          continue;
        }
        if (!isCombatHospitalization(targetStatus)) {
          log("Non-combat or unknown hospital reason; keeping CALL:",
            { targetId, reason: targetStatus.details });
          continue;
        }
        if (cancelInProgress.has(callId)) continue;

        cancelInProgress.add(callId);
        try {
          log("Hospitalized target. Cancelling call:", { targetId, callId: call.id });
          const result = await http("POST", `/api/call/${encodeURIComponent(call.id)}/cancel`, null, token);
          if (result.status === 200 && result.data?.success) {
            changed = true;
            eligibleCalls.delete(callId);
            log("Combat auto-release succeeded:", targetId);
          } else {
            console.warn("[CAT Lite PDA] Auto-release rejected by server:", { targetId, result });
          }
        } finally {
          cancelInProgress.delete(callId);
        }
      }
      if (changed) await refreshCalls();
    } catch (e) {
      console.error("[CAT Lite PDA] Hospital check failed:", e);
    } finally {
      checkingStatuses = false;
    }
  }

  function boot() {
    injectStyles();
    updateLauncher();
    setInterval(updateLauncher, 5000);

    if (!location.pathname.includes("factions.php") || !getToken()) return;

    startPaintObserver();
    refreshCalls();
    setInterval(refreshCalls, POLL_CALLS_MS);
    setInterval(paintAll, 2000);
    detectWarOpponent(true).then(checkStatusesAndRelease);
    setInterval(detectWarOpponent, POLL_WAR_MS);
    setInterval(checkStatusesAndRelease, POLL_STATUS_MS);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
