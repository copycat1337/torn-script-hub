// ==UserScript==
// @name         Black Friday Search v3
// @namespace    fancy.torn.bazaar
// @version      4.3.0
// @description  Sidebar Bazaar navigator with quick seller arrows, persistent dashboard, and weav3r dollar-bazaar scanner.
// @author       c0pyc4t
// @match        https://www.torn.com/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_xmlhttpRequest
// @connect      weav3r.dev
// @run-at       document-idle
// @downloadURL https://update.greasyfork.org/scripts/607525/Black%20Friday%20Search.user.js
// @updateURL https://update.greasyfork.org/scripts/607525/Black%20Friday%20Search.meta.js
// ==/UserScript==

(function () {
    'use strict';

    // ============================================================
    // 1. STORAGE
    // ============================================================

    const LIST_KEY = 'fancyBazaarHunterV3';
    const POSITION_KEY = 'fancyBazaarPositionV3';
    const PANEL_KEY = 'fancyBazaarPanelOpenV3';

    const SEEN_KEY = 'bfs_bazaarSeen_v2'; 
    const LAST_TRIGGER_KEY = 'bfs_bazaarLastTrigger';
    const CONFIG_KEY = 'bfs_bazaarConfig';
    const SCANNER_ENABLED_KEY = 'bfs_scannerEnabled';
    const MAX_SEEN = 2000;

    let players = GM_getValue(LIST_KEY, []);
    let position = GM_getValue(POSITION_KEY, 0);
    if (!Array.isArray(players)) players = [];
    if (!Number.isInteger(position)) position = 0;

    let panelOpen = GM_getValue(PANEL_KEY, false);

    let seenMap = new Map(); 
    try {
        const raw = GM_getValue(SEEN_KEY, []);
        if (Array.isArray(raw)) {
            for (const entry of raw) {
                if (entry && entry.id) seenMap.set(String(entry.id), Number(entry.value) || 0);
            }
        }
    } catch (e) {}

    let lastTriggered = GM_getValue(LAST_TRIGGER_KEY, null);
    if (lastTriggered && typeof lastTriggered !== 'object') lastTriggered = null;

    let scannerConfig = GM_getValue(CONFIG_KEY, {
        minTotalValue: 1000000,
        checkInterval: 300,
        maxPages: 50,
        soundEnabled: true,
    });
    if (!scannerConfig || typeof scannerConfig !== 'object') {
        scannerConfig = { minTotalValue: 1000000, checkInterval: 300, maxPages: 50, soundEnabled: true };
    }

    let scannerEnabled = GM_getValue(SCANNER_ENABLED_KEY, true);

    let intervalHandle = null;
    let consecutiveErrors = 0;
    let busy = false;
    let isHidden = false;

    function save() {
        GM_setValue(LIST_KEY, players);
        GM_setValue(POSITION_KEY, position);
    }

    function savePanelState() { GM_setValue(PANEL_KEY, panelOpen); }

    function saveSeen() {
        try {
            const arr = Array.from(seenMap.entries()).map(([id, value]) => ({ id, value }));
            GM_setValue(SEEN_KEY, arr.slice(-MAX_SEEN));
        } catch (e) {}
    }

    function saveLastTriggered(data) {
        lastTriggered = data;
        try { GM_setValue(LAST_TRIGGER_KEY, data); } catch (e) {}
    }

    function saveScannerConfig() { try { GM_setValue(CONFIG_KEY, scannerConfig); } catch (e) {} }
    function saveScannerEnabled() { try { GM_setValue(SCANNER_ENABLED_KEY, scannerEnabled); } catch (e) {} }

    function currentPlayer() { return players[position] || null; }

    // ============================================================
    // 2. HELPERS & SCANNER
    // ============================================================

    function extractId(value) {
        const text = String(value || '');
        const urlMatch = text.match(/(?:userId=|XID=)(\d+)/i);
        if (urlMatch) return urlMatch[1];
        const bracketMatch = text.match(/\[(\d+)\]/);
        if (bracketMatch) return bracketMatch[1];
        const numberMatch = text.match(/\b(\d{3,})\b/);
        return numberMatch ? numberMatch[1] : null;
    }

    function escapeHtml(value) {
        return String(value || '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
    }

    function bazaarUrl(id) { return `https://www.torn.com/bazaar.php?userId=${encodeURIComponent(id)}#/`; }

    function detectCurrentSeller() {
        const match = window.location.href.match(/userId=(\d+)/i);
        if (!match) return;
        const index = players.findIndex(p => String(p.id) === match[1]);
        if (index !== -1) { position = index; save(); }
    }

    function valueOf(rec) {
        const v = parseFloat(rec?.totalMarketValue ?? 0);
        return isNaN(v) ? 0 : v;
    }

    function apiGet(url) {
        return new Promise((resolve) => {
            GM_xmlhttpRequest({
                method: 'GET',
                url: url,
                headers: { 'Accept': 'application/json' },
                timeout: 10000,
                onload: (res) => {
                    let data = null;
                    try { data = JSON.parse(res.responseText); } catch {}
                    resolve({ status: res.status, data });
                },
                onerror: (err) => resolve({ status: 0, data: null, err: String(err) }),
                ontimeout: () => resolve({ status: 0, data: null, err: 'Timeout' })
            });
        });
    }

    async function fetchBazaars() {
        const maxPages = Math.max(1, parseInt(scannerConfig.maxPages) || 50);
        const minValue = parseInt(scannerConfig.minTotalValue) || 1000000;
        const all = [];
        let page = 1;

        while (page <= maxPages) {
            const url = `https://weav3r.dev/api/dollar-bazaars/bazaars?page=${page}&limit=100`;
            const { status, data } = await apiGet(url);
            
            if (status === 0) return { ok: false, reason: 'Network error' };
            if (!data) return { ok: false, reason: `HTTP ${status}: non-JSON` };
            if (data.error) return { ok: false, reason: `API error: ${data.error}` };

            const batch = data.bazaars || [];
            all.push(...batch);

            if (batch.length < 100) break;

            const lastVal = valueOf(batch[batch.length - 1]);
            if (lastVal < minValue) break;

            page++;
            await new Promise((r) => setTimeout(r, 700));
        }
        return { ok: true, bazaars: all };
    }

    let audioCtx = null;
    function playBeep() {
        try {
            if (!audioCtx) {
                const Ctx = window.AudioContext || window.webkitAudioContext;
                if (!Ctx) return;
                audioCtx = new Ctx();
            }
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.type = 'sine';
            osc.frequency.value = 880;
            gain.gain.value = 0.15;
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            const now = audioCtx.currentTime;
            osc.start(now);
            osc.stop(now + 0.15);
        } catch (e) {}
    }

    function fireAlert(bazaar) {
        const name = bazaar.name || `Player ${bazaar.playerId}`;
        const value = valueOf(bazaar);
        const trigger = {
            playerId: String(bazaar.playerId),
            name,
            value,
            itemCount: bazaar.itemCount,
            time: Date.now(),
        };

        saveLastTriggered(trigger);
        if (scannerConfig.soundEnabled) playBeep();
        console.log(`[bfs][bazaar] TRIGGER: ${name} (${bazaar.playerId}) $${value.toLocaleString()}`);

        if (panelOpen) renderPanel();
        updateQuickButtons();
    }

    async function checkBazaars(force = false) {
        if (!scannerEnabled) return;
        if (busy) return;
        if (isHidden && !force) return;
        if (consecutiveErrors >= 3 && !force && Math.random() < 0.66) return;

        busy = true;
        const minValue = parseInt(scannerConfig.minTotalValue) || 1000000;
        
        try {
            const res = await fetchBazaars();
            if (!res.ok) {
                consecutiveErrors++;
                return;
            }
            consecutiveErrors = 0;
            let fired = 0;

            for (const b of res.bazaars) {
                const value = valueOf(b);
                if (value < minValue) continue;

                const key = String(b.playerId);
                const prevValue = seenMap.get(key) || 0;

                if (value > prevValue) {
                    fireAlert(b);
                    fired++;
                    seenMap.set(key, value);
                }
            }
            if (fired > 0) console.log(`[bfs][bazaar] ${fired} alerts fired this tick.`);
        } catch (e) {
            console.warn('[bfs][bazaar] check failed:', e);
        } finally {
            saveSeen();
            busy = false;
        }
    }

    function startScanner() {
        stopScanner();
        if (!scannerEnabled) return;
        const secs = Math.max(60, parseInt(scannerConfig.checkInterval) || 300);
        intervalHandle = setInterval(() => {
            try { checkBazaars(); } catch (e) {}
        }, secs * 1000);
        setTimeout(() => { try { checkBazaars(); } catch (e) {} }, 2000);
    }

    function stopScanner() {
        if (intervalHandle) clearInterval(intervalHandle);
        intervalHandle = null;
    }

    function openTriggeredBazaar() {
        if (!lastTriggered || !lastTriggered.playerId) return;
        window.location.href = bazaarUrl(lastTriggered.playerId);
    }

    // FIXED: Now clears the trigger state entirely and silences the UI
    function markTriggeredAsSeen() {
        if (!lastTriggered || !lastTriggered.playerId) return;
        
        // Add to seen map with current value so it won't re-trigger unless value increases
        const key = String(lastTriggered.playerId);
        seenMap.set(key, lastTriggered.value);
        saveSeen();
        
        // Clear the active trigger state
        saveLastTriggered(null);
        
        // Update UI
        updateQuickButtons();
        if (panelOpen) renderPanel();
    }

    function importPlayers(text) {
        const lines = String(text || '').split(/\r?\n/).map(line => line.trim()).filter(Boolean);
        let added = 0;

        lines.forEach(line => {
            const id = extractId(line);
            if (!id) return;
            if (players.some(p => String(p.id) === id)) return;

            let name = line.replace(id, '').replace(/[|,;]/g, ' ').trim();
            if (!name || /^\d+$/.test(name)) name = `Player ${id}`;

            players.push({ id, name });
            added++;
        });

        if (position >= players.length) position = 0;
        save();
        return added;
    }

    function importFile() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.txt,.csv';
        input.onchange = () => {
            const file = input.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = () => {
                const added = importPlayers(reader.result);
                alert(`${added} new seller(s) imported.`);
                renderPanel();
                updateQuickButtons();
            };
            reader.onerror = () => alert('Could not read the selected file.');
            reader.readAsText(file);
        };
        input.click();
    }

    function navigate(index) {
        if (!players.length) return;
        position = (index + players.length) % players.length;
        save();
        const player = currentPlayer();
        if (player) window.location.href = bazaarUrl(player.id);
    }

    function previousPlayer() { navigate(position - 1); }
    function nextPlayer() { navigate(position + 1); }

    function deleteCurrent() {
        const player = currentPlayer();
        if (!player) return;
        if (!confirm(`Remove ${player.name} (${player.id}) from the list?`)) return;
        players.splice(position, 1);
        if (position >= players.length) position = 0;
        save();
        renderPanel();
        updateQuickButtons();
    }

    // ============================================================
    // 3. UI INJECTION & RENDERING
    // ============================================================

    function sidebarIconSvg() {
        return `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"></circle><circle cx="11" cy="11" r="3"></circle><path d="M16 16l5 5"></path></svg>`;
    }

    function injectSidebarItem() {
        const sidebar = document.querySelector('#sidebar');
        if (!sidebar) return;

        if (!document.querySelector('#bazaarHunterBadge')) {
            const nativeLink = sidebar.querySelector('a[class*="desktopLink___"]');
            if (!nativeLink) return;

            const nativeSvgWrap = nativeLink.querySelector('span[class*="svgIconWrap___"]');
            const nativeDefaultIcon = nativeLink.querySelector('span[class*="defaultIcon___"]');
            const nativeLinkName = nativeLink.querySelector('span[class*="linkName___"]');
            const isDark = document.body.classList.contains('dark-mode');

            const badge = document.createElement('div');
            badge.id = 'bazaarHunterBadge';
            badge.style.cssText = `background: ${isDark ? '#333' : '#F2F2F2'}; padding: 0; border-radius: 0 5px 5px 0; width: 172px; height: 23px; box-sizing: border-box; margin-top: 2px; display: flex; align-items: center;`;

            const link = document.createElement('a');
            link.href = '#';
            link.className = nativeLink.className;
            link.style.cssText = `display:flex; align-items:center; height:100%; width:100%; text-decoration:none;`;
            link.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); togglePanel(); });

            const iconWrap = document.createElement('span');
            if (nativeSvgWrap) iconWrap.className = nativeSvgWrap.className;
            iconWrap.style.cssText = `margin:0; padding:0; line-height:0; display:inline-flex; align-items:center; justify-content:center; width:24px;`;

            const innerIcon = document.createElement('span');
            if (nativeDefaultIcon) innerIcon.className = nativeDefaultIcon.className;
            innerIcon.style.cssText = `margin:0; padding:0; line-height:0; display:inline-flex; align-items:center; justify-content:center; color:${isDark ? '#bbb' : '#555'};`;
            innerIcon.innerHTML = sidebarIconSvg();
            iconWrap.appendChild(innerIcon);
            link.appendChild(iconWrap);

            const label = document.createElement('span');
            if (nativeLinkName) label.className = nativeLinkName.className;
            label.textContent = 'Bazaar Hunter';
            link.appendChild(label);
            badge.appendChild(link);

            const navCalendar = sidebar.querySelector('#nav-calendar');
            if (navCalendar && navCalendar.parentElement) {
                navCalendar.parentElement.insertBefore(badge, navCalendar.nextSibling);
            } else {
                const desktopArea = sidebar.querySelector('[class*="area-desktop___"]');
                if (desktopArea && desktopArea.parentElement) {
                    desktopArea.parentElement.insertBefore(badge, desktopArea);
                } else {
                    (sidebar.querySelector('[class*="areas___"]') || sidebar).appendChild(badge);
                }
            }
        }
        injectQuickButtons();
    }

    function injectQuickButtons() {
        const badge = document.getElementById('bazaarHunterBadge');
        if (!badge) return;

        let quickNav = document.getElementById('bazaarHunterQuickNav');
        if (!quickNav) {
            quickNav = document.createElement('div');
            quickNav.id = 'bazaarHunterQuickNav';
            quickNav.style.cssText = `display:flex; gap:4px; width:172px; padding:3px 5px 4px; box-sizing:border-box; justify-content:center; background:transparent;`;
            const isDark = document.body.classList.contains('dark-mode');

            const makeBtn = (id, text, title) => {
                const btn = document.createElement('button');
                btn.id = id; btn.textContent = text; btn.title = title;
                btn.style.cssText = `flex:1; height:21px; border:1px solid ${isDark ? '#444' : '#ccc'}; border-radius:3px; background:${isDark ? '#292929' : '#e7e7e7'}; color:${isDark ? '#ddd' : '#333'}; font-size:11px; font-weight:bold; cursor:pointer; transition:0.2s;`;
                return btn;
            };

            const previous = makeBtn('bazaarHunterPrevious', '◀', 'Previous seller');
            const next = makeBtn('bazaarHunterNext', '▶', 'Next seller');
            const trigger = makeBtn('bazaarHunterTriggered', '🔔', 'Open triggered bazaar');
            const snooze = makeBtn('bazaarHunterSnooze', '💤', 'Clear alarm & mark as seen');

            previous.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); previousPlayer(); });
            next.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); nextPlayer(); });
            trigger.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); openTriggeredBazaar(); });
            snooze.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); markTriggeredAsSeen(); });

            quickNav.append(previous, next, trigger, snooze);
            badge.insertAdjacentElement('afterend', quickNav);
        }
        updateQuickButtons();
    }

    function updateQuickButtons() {
        const previous = document.getElementById('bazaarHunterPrevious');
        const next = document.getElementById('bazaarHunterNext');
        const trigger = document.getElementById('bazaarHunterTriggered');
        const snooze = document.getElementById('bazaarHunterSnooze');
        if (!previous || !next || !trigger || !snooze) return;

        const disabled = players.length === 0;
        previous.disabled = disabled; next.disabled = disabled;
        previous.style.opacity = disabled ? '0.4' : '1';
        next.style.opacity = disabled ? '0.4' : '1';

        const hasTrigger = !!(lastTriggered && lastTriggered.playerId);
        
        trigger.disabled = !hasTrigger;
        trigger.style.opacity = hasTrigger ? '1' : '0.4';
        trigger.style.color = hasTrigger ? '#ffd166' : '';
        trigger.title = hasTrigger ? `Open trigger: ${lastTriggered.name} ($${Number(lastTriggered.value).toLocaleString()})` : 'No active trigger';

        snooze.disabled = !hasTrigger;
        snooze.style.opacity = hasTrigger ? '1' : '0.4';
        snooze.style.color = hasTrigger ? '#f44336' : '';
        snooze.title = hasTrigger ? 'Mark as seen & clear alarm' : 'No active trigger';
    }

    function togglePanel() {
        const existing = document.getElementById('bazaar-hunter-panel');
        if (existing) closePanel(); else openPanel();
    }

    function closePanel() {
        const panel = document.getElementById('bazaar-hunter-panel');
        if (panel) panel.remove();
        panelOpen = false;
        savePanelState();
    }

    function openPanel() {
        closePanel();
        panelOpen = true;
        savePanelState();
        const isDark = document.body.classList.contains('dark-mode');

        const panel = document.createElement('div');
        panel.id = 'bazaar-hunter-panel';
        panel.style.cssText = `
            position:fixed; top:80px; left:180px; width:260px; 
            background:${isDark ? '#1e1e1e' : '#fff'}; 
            color:${isDark ? '#ddd' : '#333'}; 
            border:1px solid ${isDark ? '#444' : '#ccc'}; 
            border-radius:8px; z-index:99999; 
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; 
            box-shadow:0 10px 30px rgba(0,0,0,0.5); 
            overflow:hidden; max-height:90vh; display:flex; flex-direction:column;
        `;

        const header = document.createElement('div');
        header.style.cssText = `background:linear-gradient(180deg,#315d48 0%,#193b2c 100%); color:#fff; padding:10px 12px; display:flex; align-items:center; justify-content:space-between; font-size:13px; font-weight:bold; flex-shrink:0;`;

        const title = document.createElement('span');
        title.textContent = '🎯 Bazaar Hunter';

        const closeButton = document.createElement('button');
        closeButton.textContent = '✕';
        closeButton.style.cssText = `background:transparent; border:none; color:#fff; cursor:pointer; font-size:14px; padding:0; opacity:0.7; transition:0.2s;`;
        closeButton.onmouseover = () => closeButton.style.opacity = '1';
        closeButton.onmouseout = () => closeButton.style.opacity = '0.7';
        closeButton.onclick = closePanel;

        header.append(title, closeButton);

        const content = document.createElement('div');
        content.id = 'bazaar-hunter-content';
        content.style.cssText = `padding:10px; display:flex; flex-direction:column; gap:8px; overflow-y:auto;`;

        panel.append(header, content);
        document.body.appendChild(panel);
        renderPanel();
    }

    function makeButton(label, bgColor, textColor = '#fff') {
        const btn = document.createElement('button');
        btn.textContent = label;
        btn.style.cssText = `
            width:100%; padding:8px; background:${bgColor}; color:${textColor}; 
            border:none; border-radius:5px; cursor:pointer; font-size:11px; 
            font-weight:600; transition:0.2s; display:flex; justify-content:center; align-items:center;
        `;
        btn.onmouseover = () => btn.style.filter = 'brightness(1.15)';
        btn.onmouseout = () => btn.style.filter = 'none';
        return btn;
    }

    function renderSettingsSection(parent, isDark) {
        const section = document.createElement('div');
        section.style.cssText = `border-top:1px solid ${isDark ? '#333' : '#eee'}; margin-top:5px; padding-top:10px; display:flex; flex-direction:column; gap:8px;`;

        const heading = document.createElement('div');
        heading.textContent = '⚙️ Scanner Settings';
        heading.style.cssText = `font-size:11px; font-weight:bold; color:${isDark ? '#aaa' : '#666'}; margin-bottom:2px;`;
        section.appendChild(heading);

        const checkRow = (label, checked, onChange) => {
            const row = document.createElement('label');
            row.style.cssText = `display:flex; align-items:center; gap:6px; font-size:11px; cursor:pointer;`;
            const input = document.createElement('input');
            input.type = 'checkbox'; input.checked = checked; input.onchange = (e) => onChange(e.target.checked);
            input.style.cssText = `cursor:pointer; margin:0;`;
            row.append(input, document.createTextNode(label));
            return row;
        };

        section.appendChild(checkRow('Enable Scanner', !!scannerEnabled, (val) => {
            scannerEnabled = val; saveScannerEnabled();
            if (scannerEnabled) startScanner(); else stopScanner();
        }));

        section.appendChild(checkRow('Play Sound', !!scannerConfig.soundEnabled, (val) => {
            scannerConfig.soundEnabled = val; saveScannerConfig();
        }));

        const inputField = (label, value, min, max, step, onChange) => {
            const row = document.createElement('div');
            row.style.cssText = `display:flex; align-items:center; justify-content:space-between; gap:8px; font-size:11px;`;
            const span = document.createElement('span');
            span.textContent = label;
            const input = document.createElement('input');
            input.type = 'number'; input.value = value; input.min = min; input.max = max; input.step = step;
            input.style.cssText = `width:75px; padding:4px 6px; font-size:11px; border-radius:4px; border:1px solid ${isDark ? '#555' : '#ccc'}; background:${isDark ? '#111' : '#f9f9f9'}; color:${isDark ? '#eee' : '#333'}; outline:none;`;
            input.onchange = () => {
                let v = Number(input.value);
                if (!Number.isFinite(v)) v = value;
                v = Math.min(max, Math.max(min, v));
                input.value = v;
                onChange(v);
            };
            row.append(span, input);
            return row;
        };

        section.appendChild(inputField('Min Value ($)', parseInt(scannerConfig.minTotalValue) || 1000000, 0, 1e12, 100000, v => { scannerConfig.minTotalValue = v; saveScannerConfig(); }));
        section.appendChild(inputField('Interval (s)', parseInt(scannerConfig.checkInterval) || 300, 60, 86400, 60, v => { scannerConfig.checkInterval = v; saveScannerConfig(); if (scannerEnabled) startScanner(); }));
        section.appendChild(inputField('Max Pages', parseInt(scannerConfig.maxPages) || 50, 1, 500, 1, v => { scannerConfig.maxPages = v; saveScannerConfig(); }));

        const btnRow = document.createElement('div');
        btnRow.style.cssText = 'display:flex; gap:6px; margin-top:4px;';

        const checkBtn = makeButton('Check Now', '#315d48');
        checkBtn.style.flex = '1'; checkBtn.style.padding = '6px';
        checkBtn.onclick = () => checkBazaars(true);

        const resetBtn = makeButton('Reset Seen', '#555');
        resetBtn.style.flex = '1'; resetBtn.style.padding = '6px';
        resetBtn.onclick = () => {
            if (!confirm('Clear the seen-list? Every matching bazaar will trigger again.')) return;
            seenMap.clear(); saveSeen(); updateQuickButtons(); renderPanel();
        };

        btnRow.append(checkBtn, resetBtn);
        section.appendChild(btnRow);
        parent.appendChild(section);
    }

    function renderPanel() {
        const content = document.getElementById('bazaar-hunter-content');
        if (!content) return;

        const player = currentPlayer();
        const total = players.length;
        const isDark = document.body.classList.contains('dark-mode');

        content.innerHTML = '';

        // 1. Current Seller Info
        const info = document.createElement('div');
        info.style.cssText = `background:${isDark ? '#292929' : '#f1f1f1'}; border-radius:6px; padding:10px; text-align:center;`;
        if (player) {
            info.innerHTML = `
                <div style="font-size:10px; color:#888; text-transform:uppercase; font-weight:bold; margin-bottom:4px;">Seller ${position + 1} / ${total}</div>
                <div style="font-size:14px; font-weight:bold; overflow-wrap:anywhere;">${escapeHtml(player.name)}</div>
                <div style="font-size:11px; color:#888; margin-top:2px;">ID: ${escapeHtml(player.id)}</div>
            `;
        } else {
            info.innerHTML = `<div style="font-size:12px; color:#888;">No sellers loaded</div>`;
        }
        content.appendChild(info);

        // 2. Trigger Info Box (Only shows if there IS an active trigger)
        if (lastTriggered && lastTriggered.playerId) {
            const triggerInfo = document.createElement('div');
            triggerInfo.style.cssText = `background:${isDark ? '#3a3320' : '#fff8e1'}; border:1px solid ${isDark ? '#5c5020' : '#f0d97a'}; border-radius:6px; padding:8px; font-size:11px; color:${isDark ? '#ffd166' : '#7a5f00'}; line-height:1.4;`;
            const when = new Date(lastTriggered.time);
            const timeStr = isNaN(when.getTime()) ? '' : when.toLocaleTimeString();
            triggerInfo.innerHTML = `
                <div style="font-weight:bold; font-size:12px; margin-bottom:2px;">🔔 Active Trigger</div>
                <div>${escapeHtml(lastTriggered.name)} (${escapeHtml(lastTriggered.playerId)})</div>
                <div>$${Number(lastTriggered.value).toLocaleString()} • ${escapeHtml(String(lastTriggered.itemCount ?? '?'))} items</div>
                ${timeStr ? `<div style="opacity:0.7; margin-top:2px;">at ${escapeHtml(timeStr)}</div>` : ''}
            `;
            content.appendChild(triggerInfo);
        }

        // 3. Import Section
        const importWrap = document.createElement('div');
        importWrap.style.cssText = `display:flex; flex-direction:column; gap:6px;`;

        const uploadBtn = makeButton('⬆ Upload List', '#365b47');
        uploadBtn.onclick = importFile;
        importWrap.appendChild(uploadBtn);

        const textarea = document.createElement('textarea');
        textarea.placeholder = 'Paste player IDs here (one per line)...';
        textarea.rows = 3;
        // FIXED VISIBILITY: High-contrast border and distinct background
        textarea.style.cssText = `
            width:100%; box-sizing:border-box; resize:vertical; padding:6px; border-radius:4px; 
            border:1px solid ${isDark ? '#666' : '#bbb'}; background:${isDark ? '#000' : '#fff'}; 
            color:${isDark ? '#fff' : '#000'}; font-size:11px; font-family:monospace; outline:none;
        `;
        importWrap.appendChild(textarea);

        const importBtn = makeButton('Import Pasted IDs', '#444');
        importBtn.onclick = () => {
            if (!textarea.value.trim()) return;
            const added = importPlayers(textarea.value);
            alert(`${added} new seller(s) imported.`);
            renderPanel();
            updateQuickButtons();
        };
        importWrap.appendChild(importBtn);
        content.appendChild(importWrap);

        // 4. Navigation Buttons
        const navRow = document.createElement('div');
        navRow.style.cssText = 'display:flex; gap:6px; margin-top:2px;';
        const prevBtn = makeButton('◀ Prev', '#444'); prevBtn.style.flex = '1'; prevBtn.disabled = !total; prevBtn.onclick = previousPlayer;
        const nextBtn = makeButton('Next ▶', '#365b47'); nextBtn.style.flex = '1'; nextBtn.disabled = !total; nextBtn.onclick = nextPlayer;
        navRow.append(prevBtn, nextBtn);
        content.appendChild(navRow);

        // 5. Action Buttons
        const openCurrentBtn = makeButton('Open Current Bazaar', '#315d48');
        openCurrentBtn.disabled = !player;
        openCurrentBtn.onclick = () => { if (player) window.location.href = bazaarUrl(player.id); };
        content.appendChild(openCurrentBtn);

        const hasTrigger = !!(lastTriggered && lastTriggered.playerId);
        
        const openTriggerBtn = makeButton('🔔 Open Triggered', '#7a5f00');
        openTriggerBtn.disabled = !hasTrigger;
        if (!hasTrigger) openTriggerBtn.style.opacity = '0.5';
        openTriggerBtn.onclick = openTriggeredBazaar;
        content.appendChild(openTriggerBtn);

        // FIXED: Mark as Seen actually clears the trigger
        const markSeenBtn = makeButton('✔ Mark as Seen / Mute', '#4a4a4a');
        markSeenBtn.disabled = !hasTrigger;
        if (!hasTrigger) markSeenBtn.style.opacity = '0.5';
        markSeenBtn.onclick = markTriggeredAsSeen;
        content.appendChild(markSeenBtn);

        const deleteBtn = makeButton('✕ Remove Seller', '#792e2e');
        deleteBtn.disabled = !player;
        deleteBtn.onclick = deleteCurrent;
        content.appendChild(deleteBtn);

        // 6. Settings
        renderSettingsSection(content, isDark);

        // 7. Footer
        const footer = document.createElement('div');
        footer.style.cssText = `text-align:center; color:#888; font-size:10px; padding-top:4px; border-top:1px solid ${isDark ? '#333' : '#eee'}; margin-top:4px;`;
        footer.textContent = `${total} sellers • ${seenMap.size} tracked`;
        content.appendChild(footer);
    }

    // ============================================================
    // 4. INITIALIZATION
    // ============================================================

    function watchSidebar() {
        let lastTry = 0;
        let retryDelay = 500;

        const observer = new MutationObserver(() => {
            const badge = document.getElementById('bazaarHunterBadge');
            const arrows = document.getElementById('bazaarHunterQuickNav');
            if (badge && badge.isConnected && arrows && arrows.isConnected) return;

            const now = Date.now();
            if (now - lastTry < retryDelay) return;
            lastTry = now;
            injectSidebarItem();

            const ready = document.getElementById('bazaarHunterBadge') && document.getElementById('bazaarHunterQuickNav');
            retryDelay = ready ? 500 : Math.min(retryDelay * 2, 10000);
        });

        observer.observe(document.body, { childList: true, subtree: true });
        window.addEventListener('hashchange', () => { retryDelay = 500; setTimeout(injectSidebarItem, 300); });
    }

    function init() {
        detectCurrentSeller();
        injectSidebarItem();
        watchSidebar();

        if (panelOpen) openPanel();
        if (scannerEnabled) startScanner();

        document.addEventListener('visibilitychange', () => {
            isHidden = document.hidden;
            if (!isHidden && scannerEnabled) {
                setTimeout(() => { try { checkBazaars(); } catch (e) {} }, 500);
            }
        });

        window.addEventListener('beforeunload', stopScanner);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();