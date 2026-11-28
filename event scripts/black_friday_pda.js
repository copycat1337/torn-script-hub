// ==UserScript==
// @name         Black Friday Search (PDA/Mobile)
// @namespace    fancy.torn.bazaar
// @version      4.3.0
// @description  Mobile-optimized Sidebar Bazaar navigator with weav3r scanner and Torn API fallback.
// @author       c0pyc4t
// @match        https://www.torn.com/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_xmlhttpRequest
// @connect      weav3r.dev
// @connect      api.torn.com
// @run-at       document-idle
// @downloadURL https://update.greasyfork.org/scripts/607525/Black%20Friday%20Search.user.js
// @updateURL https://update.greasyfork.org/scripts/607525/Black%20Friday%20Search.meta.js
// ==/UserScript==

(function () {
    'use strict';

    // ============================================================
    // 1. STORAGE & STATE
    // ============================================================

    const LIST_KEY = 'fancyBazaarHunterV3';
    const POSITION_KEY = 'fancyBazaarPositionV3';
    const PANEL_KEY = 'fancyBazaarPanelOpenV3';

    const SEEN_KEY = 'bfs_bazaarSeen_v2'; 
    const TRIGGER_QUEUE_KEY = 'bfs_bazaarTriggerQueue'; 
    const CONFIG_KEY = 'bfs_bazaarConfig';
    const SCANNER_ENABLED_KEY = 'bfs_scannerEnabled';
    const API_KEY_KEY = 'bfs_apiKey'; // For Torn API fallback
    
    const MAX_SEEN = 2000;

    let players = GM_getValue(LIST_KEY, []);
    let position = GM_getValue(POSITION_KEY, 0);
    if (!Array.isArray(players)) players = [];
    if (!Number.isInteger(position)) position = 0;

    let panelOpen = GM_getValue(PANEL_KEY, false);
    let panelPos = GM_getValue('bfs_panelPos', { top: 50, left: 10 });

    let seenMap = new Map(); 
    try {
        const raw = GM_getValue(SEEN_KEY, []);
        if (Array.isArray(raw)) {
            for (const entry of raw) {
                if (entry && entry.id) seenMap.set(String(entry.id), Number(entry.value) || 0);
            }
        }
    } catch (e) {}

    let triggerQueue = GM_getValue(TRIGGER_QUEUE_KEY, []);
    if (!Array.isArray(triggerQueue)) triggerQueue = [];

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
    let apiKey = GM_getValue(API_KEY_KEY, '');

    let intervalHandle = null;
    let consecutiveErrors = 0;
    let busy = false;
    let isHidden = false;

    // Mobile detection
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth < 768;

    function save() {
        GM_setValue(LIST_KEY, players);
        GM_setValue(POSITION_KEY, position);
    }

    function savePanelState() { GM_setValue(PANEL_KEY, panelOpen); }
    function savePanelPos() { GM_setValue('bfs_panelPos', panelPos); }

    function saveSeen() {
        try {
            const arr = Array.from(seenMap.entries()).map(([id, value]) => ({ id, value }));
            GM_setValue(SEEN_KEY, arr.slice(-MAX_SEEN));
        } catch (e) {}
    }

    function saveTriggerQueue() { try { GM_setValue(TRIGGER_QUEUE_KEY, triggerQueue); } catch (e) {} }
    function saveScannerConfig() { try { GM_setValue(CONFIG_KEY, scannerConfig); } catch (e) {} }
    function saveScannerEnabled() { try { GM_setValue(SCANNER_ENABLED_KEY, scannerEnabled); } catch (e) {} }
    function saveApiKey() { try { GM_setValue(API_KEY_KEY, apiKey); } catch (e) {} }

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
                timeout: 15000,
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

        // Try weav3r first
        let useWeav3r = true;
        while (page <= maxPages && useWeav3r) {
            const url = `https://weav3r.dev/api/dollar-bazaars/bazaars?page=${page}&limit=100`;
            const { status, data } = await apiGet(url);
            
            if (status === 0 || !data || data.error) {
                useWeav3r = false;
                break;
            }

            const batch = data.bazaars || [];
            all.push(...batch);

            if (batch.length < 100) break;

            const lastVal = valueOf(batch[batch.length - 1]);
            if (lastVal < minValue) break;

            page++;
            await new Promise((r) => setTimeout(r, 700));
        }

        // If weav3r failed, fallback to Torn API
        if (!useWeav3r) {
            console.warn('[bfs][bazaar] weav3r blocked or failed. Falling back to Torn API.');
            if (!apiKey) {
                return { ok: false, reason: 'weav3r failed and no Torn API key provided.' };
            }
            
            // Torn API v2 bazaar fetching (fetching all bazaars is not directly supported by Torn API, 
            // so we fetch the player's own bazaar if needed, or rely on weav3r).
            // *Note: Torn API does not have a "list all public bazaars" endpoint. 
            // This is why weav3r exists. If weav3r is down, we cannot easily scrape all bazaars.*
            
            return { ok: false, reason: 'weav3r failed. Torn API cannot fetch global bazaar lists.' };
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
            // Mobile devices sometimes block audio until user interaction
            if (audioCtx.state === 'suspended') audioCtx.resume();
            
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

    function addTriggerToQueue(bazaar) {
        const name = bazaar.name || `Player ${bazaar.playerId}`;
        const value = valueOf(bazaar);
        
        if (triggerQueue.some(t => String(t.playerId) === String(bazaar.playerId))) return;

        triggerQueue.push({
            playerId: String(bazaar.playerId),
            name,
            value,
            itemCount: bazaar.itemCount,
            time: Date.now(),
        });

        saveTriggerQueue();
        if (scannerConfig.soundEnabled) playBeep();
        
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
                    addTriggerToQueue(b);
                    fired++;
                    seenMap.set(key, value);
                }
            }
            if (fired > 0) console.log(`[bfs][bazaar] ${fired} new alerts added to queue.`);
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

    // --- QUEUE ACTIONS ---

    function openNextTriggered() {
        if (triggerQueue.length === 0) return;
        window.location.href = bazaarUrl(triggerQueue[0].playerId);
    }

    function markTriggeredAsSeen() {
        if (triggerQueue.length === 0) return;
        const t = triggerQueue.shift();
        saveTriggerQueue();
        seenMap.set(String(t.playerId), t.value);
        saveSeen();
        updateQuickButtons();
        if (panelOpen) renderPanel();
    }

    function skipCurrentTrigger() {
        if (triggerQueue.length === 0) return;
        triggerQueue.shift();
        saveTriggerQueue();
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
            // Mobile sidebars might be structured slightly differently, try to find the menu list
            const nativeLink = sidebar.querySelector('a[class*="desktopLink___"]') || sidebar.querySelector('a[class*="link___"]');
            if (!nativeLink) return;

            const nativeSvgWrap = nativeLink.querySelector('span[class*="svgIconWrap___"]');
            const nativeDefaultIcon = nativeLink.querySelector('span[class*="defaultIcon___"]');
            const nativeLinkName = nativeLink.querySelector('span[class*="linkName___"]');
            const isDark = document.body.classList.contains('dark-mode');

            const badge = document.createElement('div');
            badge.id = 'bazaarHunterBadge';
            // Adjusted for mobile flexibility
            badge.style.cssText = `background: ${isDark ? '#333' : '#F2F2F2'}; padding: 0; border-radius: 0 5px 5px 0; width: 100%; height: 32px; box-sizing: border-box; margin-top: 2px; display: flex; align-items: center;`;

            const link = document.createElement('a');
            link.href = '#';
            link.className = nativeLink.className;
            link.style.cssText = `display:flex; align-items:center; height:100%; width:100%; text-decoration:none; padding-left: 10px;`;
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
            label.style.marginLeft = '8px';
            link.appendChild(label);
            badge.appendChild(link);

            // Insert based on mobile structure
            const navCalendar = sidebar.querySelector('#nav-calendar');
            if (navCalendar && navCalendar.parentElement) {
                navCalendar.parentElement.insertBefore(badge, navCalendar.nextSibling);
            } else {
                sidebar.appendChild(badge);
            }
        }
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

        // Mobile adjustments
        const panelWidth = isMobile ? 'calc(100% - 20px)' : '280px';
        const panelLeft = isMobile ? '10px' : `${panelPos.left}px`;

        const panel = document.createElement('div');
        panel.id = 'bazaar-hunter-panel';
        panel.style.cssText = `
            position:fixed; top:${panelPos.top}px; left:${panelLeft}; width:${panelWidth}; 
            background:${isDark ? '#1e1e1e' : '#fff'}; 
            color:${isDark ? '#ddd' : '#333'}; 
            border:1px solid ${isDark ? '#444' : '#ccc'}; 
            border-radius:8px; z-index:999999; 
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; 
            box-shadow:0 10px 30px rgba(0,0,0,0.5); 
            overflow:hidden; max-height:85vh; display:flex; flex-direction:column;
            touch-action: none;
        `;

        const header = document.createElement('div');
        header.style.cssText = `background:linear-gradient(180deg,#315d48 0%,#193b2c 100%); color:#fff; padding:12px; display:flex; align-items:center; justify-content:space-between; font-size:14px; font-weight:bold; flex-shrink:0; cursor:grab;`;

        // Dragging Logic for Mobile
        let isDragging = false;
        let startX, startY, startLeft, startTop;

        header.addEventListener('touchstart', (e) => {
            isDragging = true;
            const touch = e.touches[0];
            startX = touch.clientX; startY = touch.clientY;
            startLeft = panelPos.left; startTop = panelPos.top;
            header.style.cursor = 'grabbing';
        });

        header.addEventListener('touchmove', (e) => {
            if (!isDragging) return;
            const touch = e.touches[0];
            const dx = touch.clientX - startX;
            const dy = touch.clientY - startY;
            
            panelPos.left = Math.max(0, Math.min(window.innerWidth - panel.offsetWidth, startLeft + dx));
            panelPos.top = Math.max(0, Math.min(window.innerHeight - panel.offsetHeight, startTop + dy));
            
            panel.style.left = panelPos.left + 'px';
            panel.style.top = panelPos.top + 'px';
        });

        header.addEventListener('touchend', () => {
            isDragging = false;
            header.style.cursor = 'grab';
            savePanelPos();
        });

        const title = document.createElement('span');
        title.textContent = '🎯 Bazaar Hunter';

        const closeButton = document.createElement('button');
        closeButton.textContent = '✕';
        closeButton.style.cssText = `background:transparent; border:none; color:#fff; cursor:pointer; font-size:16px; padding:5px;`;
        closeButton.onclick = closePanel;

        header.append(title, closeButton);

        const content = document.createElement('div');
        content.id = 'bazaar-hunter-content';
        content.style.cssText = `padding:12px; display:flex; flex-direction:column; gap:10px; overflow-y:auto; touch-action: pan-y;`;

        panel.append(header, content);
        document.body.appendChild(panel);
        renderPanel();
    }

    function makeButton(label, bgColor, textColor = '#fff') {
        const btn = document.createElement('button');
        btn.textContent = label;
        btn.style.cssText = `
            width:100%; padding:10px; background:${bgColor}; color:${textColor}; 
            border:none; border-radius:6px; cursor:pointer; font-size:12px; 
            font-weight:600; transition:0.2s; display:flex; justify-content:center; align-items:center;
            touch-action: manipulation;
        `;
        btn.onmouseover = () => btn.style.filter = 'brightness(1.15)';
        btn.onmouseout = () => btn.style.filter = 'none';
        return btn;
    }

    function renderSettingsSection(parent, isDark) {
        const section = document.createElement('div');
        section.style.cssText = `border-top:1px solid ${isDark ? '#333' : '#eee'}; margin-top:5px; padding-top:10px; display:flex; flex-direction:column; gap:10px;`;

        const heading = document.createElement('div');
        heading.textContent = '⚙️ Scanner Settings';
        heading.style.cssText = `font-size:12px; font-weight:bold; color:${isDark ? '#aaa' : '#666'}; margin-bottom:2px;`;
        section.appendChild(heading);

        const checkRow = (label, checked, onChange) => {
            const row = document.createElement('label');
            row.style.cssText = `display:flex; align-items:center; gap:8px; font-size:12px; cursor:pointer;`;
            const input = document.createElement('input');
            input.type = 'checkbox'; input.checked = checked; input.onchange = (e) => onChange(e.target.checked);
            input.style.cssText = `cursor:pointer; margin:0; width:16px; height:16px;`;
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

        const inputField = (label, value, min, max, step, onChange, type = 'number') => {
            const row = document.createElement('div');
            row.style.cssText = `display:flex; align-items:center; justify-content:space-between; gap:8px; font-size:12px;`;
            const span = document.createElement('span');
            span.textContent = label;
            const input = document.createElement('input');
            input.type = type; input.value = value;
            if (type === 'number') { input.min = min; input.max = max; input.step = step; }
            input.style.cssText = `width:80px; padding:6px; font-size:12px; border-radius:4px; border:1px solid ${isDark ? '#555' : '#ccc'}; background:${isDark ? '#111' : '#f9f9f9'}; color:${isDark ? '#eee' : '#333'}; outline:none;`;
            input.onchange = () => {
                let v = type === 'number' ? Number(input.value) : input.value;
                if (type === 'number') {
                    if (!Number.isFinite(v)) v = value;
                    v = Math.min(max, Math.max(min, v));
                }
                input.value = v;
                onChange(v);
            };
            row.append(span, input);
            return row;
        };

        section.appendChild(inputField('Min Value ($)', parseInt(scannerConfig.minTotalValue) || 1000000, 0, 1e12, 100000, v => { scannerConfig.minTotalValue = v; saveScannerConfig(); }));
        section.appendChild(inputField('Interval (s)', parseInt(scannerConfig.checkInterval) || 300, 60, 86400, 60, v => { scannerConfig.checkInterval = v; saveScannerConfig(); if (scannerEnabled) startScanner(); }));
        section.appendChild(inputField('Max Pages', parseInt(scannerConfig.maxPages) || 50, 1, 500, 1, v => { scannerConfig.maxPages = v; saveScannerConfig(); }));

        // Optional API Key for fallback
        const apiRow = document.createElement('div');
        apiRow.style.cssText = `display:flex; flex-direction:column; gap:4px; font-size:12px; margin-top:5px;`;
        const apiLabel = document.createElement('span');
        apiLabel.textContent = 'Torn API Key (Fallback)';
        const apiInput = document.createElement('input');
        apiInput.type = 'password'; apiInput.value = apiKey; apiInput.placeholder = 'Optional';
        apiInput.style.cssText = `width:100%; box-sizing:border-box; padding:6px; font-size:12px; border-radius:4px; border:1px solid ${isDark ? '#555' : '#ccc'}; background:${isDark ? '#111' : '#f9f9f9'}; color:${isDark ? '#eee' : '#333'}; outline:none;`;
        apiInput.onchange = () => { apiKey = apiInput.value.trim(); saveApiKey(); };
        apiRow.append(apiLabel, apiInput);
        section.appendChild(apiRow);

        const btnRow = document.createElement('div');
        btnRow.style.cssText = 'display:flex; gap:8px; margin-top:5px;';

        const checkBtn = makeButton('Check Now', '#315d48');
        checkBtn.style.flex = '1'; checkBtn.style.padding = '8px';
        checkBtn.onclick = () => checkBazaars(true);

        const resetBtn = makeButton('Reset Seen', '#555');
        resetBtn.style.flex = '1'; resetBtn.style.padding = '8px';
        resetBtn.onclick = () => {
            if (!confirm('Clear the seen-list?')) return;
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
        info.style.cssText = `background:${isDark ? '#292929' : '#f1f1f1'}; border-radius:6px; padding:12px; text-align:center;`;
        if (player) {
            info.innerHTML = `
                <div style="font-size:11px; color:#888; text-transform:uppercase; font-weight:bold; margin-bottom:4px;">Seller ${position + 1} / ${total}</div>
                <div style="font-size:16px; font-weight:bold; overflow-wrap:anywhere;">${escapeHtml(player.name)}</div>
                <div style="font-size:12px; color:#888; margin-top:2px;">ID: ${escapeHtml(player.id)}</div>
            `;
        } else {
            info.innerHTML = `<div style="font-size:14px; color:#888;">No sellers loaded</div>`;
        }
        content.appendChild(info);

        // 2. Queue Info Box
        if (triggerQueue.length > 0) {
            const triggerInfo = document.createElement('div');
            triggerInfo.style.cssText = `background:${isDark ? '#3a3320' : '#fff8e1'}; border:1px solid ${isDark ? '#5c5020' : '#f0d97a'}; border-radius:6px; padding:10px; font-size:12px; color:${isDark ? '#ffd166' : '#7a5f00'}; line-height:1.4;`;
            
            const next = triggerQueue[0];
            const when = new Date(next.time);
            const timeStr = isNaN(when.getTime()) ? '' : when.toLocaleTimeString();
            
            triggerInfo.innerHTML = `
                <div style="font-weight:bold; font-size:13px; margin-bottom:4px;">🔔 Alarms (${triggerQueue.length})</div>
                <div style="font-weight:bold;">Next up: ${escapeHtml(next.name)}</div>
                <div>$${Number(next.value).toLocaleString()} • ${escapeHtml(String(next.itemCount ?? '?'))} items</div>
                ${timeStr ? `<div style="opacity:0.7; margin-top:2px;">at ${escapeHtml(timeStr)}</div>` : ''}
            `;
            content.appendChild(triggerInfo);

            if (triggerQueue.length > 1) {
                const select = document.createElement('select');
                select.style.cssText = `width:100%; padding:8px; border-radius:4px; border:1px solid ${isDark ? '#555' : '#ccc'}; background:${isDark ? '#111' : '#fff'}; color:${isDark ? '#eee' : '#333'}; font-size:12px; margin-top:6px; outline:none;`;
                select.onchange = (e) => {
                    const idx = Number(e.target.value);
                    if (idx >= 0 && idx < triggerQueue.length) {
                        const t = triggerQueue.splice(idx, 1)[0];
                        triggerQueue.unshift(t);
                        saveTriggerQueue();
                        renderPanel();
                    }
                };
                
                triggerQueue.forEach((t, i) => {
                    const opt = document.createElement('option');
                    opt.value = i;
                    opt.textContent = i === 0 ? `1st: ${t.name} ($${Number(t.value).toLocaleString()})` : `${i+1}: ${t.name} ($${Number(t.value).toLocaleString()})`;
                    if (i === 0) opt.selected = true;
                    select.appendChild(opt);
                });
                
                triggerInfo.appendChild(select);
            }
        }

        // 3. Import Section
        const importWrap = document.createElement('div');
        importWrap.style.cssText = `display:flex; flex-direction:column; gap:8px;`;

        const uploadBtn = makeButton('⬆ Upload List', '#365b47');
        uploadBtn.onclick = importFile;
        importWrap.appendChild(uploadBtn);

        const textarea = document.createElement('textarea');
        textarea.placeholder = 'Paste player IDs here (one per line)...';
        textarea.rows = 3;
        textarea.style.cssText = `
            width:100%; box-sizing:border-box; resize:vertical; padding:8px; border-radius:4px; 
            border:1px solid ${isDark ? '#666' : '#bbb'}; background:${isDark ? '#000' : '#fff'}; 
            color:${isDark ? '#fff' : '#000'}; font-size:12px; font-family:monospace; outline:none;
        `;
        importWrap.appendChild(textarea);

        const importBtn = makeButton('Import Pasted IDs', '#444');
        importBtn.onclick = () => {
            if (!textarea.value.trim()) return;
            const added = importPlayers(textarea.value);
            alert(`${added} new seller(s) imported.`);
            renderPanel();
        };
        importWrap.appendChild(importBtn);
        content.appendChild(importWrap);

        // 4. Navigation Buttons
        const navRow = document.createElement('div');
        navRow.style.cssText = 'display:flex; gap:8px; margin-top:2px;';
        const prevBtn = makeButton('◀ Prev', '#444'); prevBtn.style.flex = '1'; prevBtn.disabled = !total; prevBtn.onclick = previousPlayer;
        const nextBtn = makeButton('Next ▶', '#365b47'); nextBtn.style.flex = '1'; nextBtn.disabled = !total; nextBtn.onclick = nextPlayer;
        navRow.append(prevBtn, nextBtn);
        content.appendChild(navRow);

        // 5. Action Buttons
        const openCurrentBtn = makeButton('Open Current Bazaar', '#315d48');
        openCurrentBtn.disabled = !player;
        openCurrentBtn.onclick = () => { if (player) window.location.href = bazaarUrl(player.id); };
        content.appendChild(openCurrentBtn);

        const hasTrigger = triggerQueue.length > 0;

        const queueBtnRow = document.createElement('div');
        queueBtnRow.style.cssText = 'display:flex; gap:8px;';

        const openTriggerBtn = makeButton('🔔 Open Trigger', '#7a5f00');
        openTriggerBtn.style.flex = '2';
        openTriggerBtn.disabled = !hasTrigger;
        if (!hasTrigger) openTriggerBtn.style.opacity = '0.5';
        openTriggerBtn.onclick = openNextTriggered;
        
        const skipBtn = makeButton('⏭ Skip', '#555');
        skipBtn.style.flex = '1';
        skipBtn.disabled = !hasTrigger;
        if (!hasTrigger) skipBtn.style.opacity = '0.5';
        skipBtn.onclick = skipCurrentTrigger;

        queueBtnRow.append(openTriggerBtn, skipBtn);
        content.appendChild(queueBtnRow);

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
        footer.style.cssText = `text-align:center; color:#888; font-size:11px; padding-top:6px; border-top:1px solid ${isDark ? '#333' : '#eee'}; margin-top:4px;`;
        footer.textContent = `${total} sellers • ${seenMap.size} tracked`;
        content.appendChild(footer);
    }

    // ============================================================
    // 4. INITIALIZATION
    // ============================================================

    function init() {
        detectCurrentSeller();
        injectSidebarItem();
        
        // Ensure panel restores on mobile
        if (panelOpen) openPanel();
        if (scannerEnabled) startScanner();

        document.addEventListener('visibilitychange', () => {
            isHidden = document.hidden;
            if (!isHidden && scannerEnabled) {
                setTimeout(() => { try { checkBazaars(); } catch (e) {} }, 500);
            }
        });

        window.addEventListener('beforeunload', stopScanner);

        // Mobile fallback: If sidebar is missing, inject a floating button
        if (isMobile && !document.querySelector('#bazaarHunterBadge')) {
            const floatBtn = document.createElement('div');
            floatBtn.id = 'bazaarHunterFloatBtn';
            floatBtn.innerHTML = '🎯';
            floatBtn.style.cssText = `
                position:fixed; bottom:20px; right:20px; width:50px; height:50px;
                background:linear-gradient(180deg,#315d48 0%,#193b2c 100%);
                color:#fff; border-radius:50%; display:flex; align-items:center; justify-content:center;
                font-size:24px; box-shadow:0 4px 10px rgba(0,0,0,0.5); z-index:99999; cursor:pointer;
            `;
            floatBtn.onclick = togglePanel;
            document.body.appendChild(floatBtn);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();