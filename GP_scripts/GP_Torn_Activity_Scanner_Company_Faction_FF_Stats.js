// ==UserScript==
// @name         Torn Activity Scanner (Company + Faction + FF Stats)
// @namespace    https://torn.com/
// @version      12.0
// @description  Activity scanner with FF Scouter battle stats integration and status indicators - Auto-refresh every 1 hour
// @author       c0pyc4t 4039125
// @license      MIT
// @match        https://www.torn.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @grant        GM_addStyle
// @connect      api.torn.com
// @connect      ffscouter.com
// ==/UserScript==

(function () {
    'use strict';

    // ============================================================
    // STYLES - Modern Dark Theme
    // ============================================================
    GM_addStyle(`
        .activity-floating-panel {
            position: fixed;
            bottom: 20px;
            left: 20px;
            width: 460px;
            max-height: 450px;
            background: linear-gradient(135deg, #0a0e1a 0%, #0d1117 100%);
            border-radius: 12px;
            box-shadow: 0 20px 40px rgba(0,0,0,0.4), 0 0 0 1px rgba(48, 54, 61, 0.5);
            z-index: 100000;
            display: flex;
            flex-direction: column;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Inter', 'Roboto', monospace;
            backdrop-filter: blur(10px);
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }

        .activity-floating-panel.minimized {
            width: auto;
            max-height: none;
            min-width: 100px;
            border-radius: 20px;
            cursor: pointer;
        }

        .activity-floating-panel.minimized .activity-panel-content,
        .activity-floating-panel.minimized .activity-tabs,
        .activity-floating-panel.minimized .activity-timestamp,
        .activity-floating-panel.minimized .button-group {
            display: none !important;
        }

        .activity-panel-header {
            background: linear-gradient(135deg, rgba(16, 20, 30, 0.98) 0%, rgba(10, 14, 23, 0.98) 100%);
            padding: 10px 14px;
            border-radius: 12px 12px 0 0;
            cursor: move;
            display: flex;
            justify-content: space-between;
            align-items: center;
            color: #e8edf5;
            font-weight: 600;
            border-bottom: 1px solid rgba(48, 54, 61, 0.5);
            backdrop-filter: blur(10px);
            letter-spacing: -0.2px;
        }

        .activity-floating-panel.minimized .activity-panel-header {
            border-radius: 20px;
            border-bottom: none;
            padding: 8px 16px;
            cursor: pointer;
            justify-content: center;
            background: linear-gradient(135deg, #0d1117 0%, #0a0e1a 100%);
        }

        .activity-panel-title {
            font-size: 12px;
            display: flex;
            align-items: center;
            gap: 6px;
            font-weight: 600;
            color: #e8edf5;
        }

        .activity-panel-title::before {
            content: "⚡";
            font-size: 14px;
            filter: drop-shadow(0 0 2px rgba(0,200,83,0.5));
        }

        .activity-floating-panel.minimized .activity-panel-title {
            font-size: 13px;
            font-weight: 700;
        }

        .activity-floating-panel.minimized .activity-panel-title span {
            display: inline;
        }

        .activity-floating-panel.minimized .activity-panel-title::before {
            font-size: 16px;
        }

        .button-group {
            display: flex;
            gap: 6px;
        }

        .activity-refresh-btn {
            background: rgba(48, 54, 61, 0.6);
            border: 1px solid rgba(72, 78, 85, 0.5);
            color: #b4bec8;
            cursor: pointer;
            font-size: 10px;
            padding: 4px 12px;
            border-radius: 6px;
            transition: all 0.2s;
            font-weight: 600;
            white-space: nowrap;
        }

        .activity-refresh-btn:hover {
            background: rgba(0, 200, 83, 0.2);
            border-color: #00c853;
            color: #00c853;
            transform: translateY(-1px);
        }

        .minimize-btn {
            background: rgba(48, 54, 61, 0.5);
            border: none;
            color: #b4bec8;
            cursor: pointer;
            font-size: 16px;
            padding: 0 6px;
            border-radius: 6px;
            transition: all 0.2s;
            font-weight: bold;
            line-height: 1;
        }

        .minimize-btn:hover {
            background: rgba(0, 200, 83, 0.2);
            color: #00c853;
            transform: scale(1.05);
        }

        .activity-tabs {
            display: flex;
            background: rgba(10, 14, 23, 0.95);
            border-bottom: 1px solid rgba(48, 54, 61, 0.5);
            padding: 4px 6px 0 6px;
            gap: 4px;
        }

        .activity-tab {
            flex: 1;
            padding: 6px 10px;
            text-align: center;
            cursor: pointer;
            font-size: 11px;
            font-weight: 600;
            color: #8b96a5;
            transition: all 0.2s;
            border: none;
            background: transparent;
            white-space: nowrap;
            border-radius: 6px 6px 0 0;
            letter-spacing: -0.2px;
        }

        .activity-tab:hover {
            background: rgba(48, 54, 61, 0.5);
            color: #d1d9e8;
        }

        .activity-tab.active {
            color: #00c853;
            border-bottom: 2px solid #00c853;
            background: rgba(0, 200, 83, 0.08);
        }

        .activity-panel-content {
            padding: 10px;
            overflow-y: auto;
            max-height: 460px;
            font-size: 11px;
            background: linear-gradient(180deg, rgba(13, 17, 23, 0.95) 0%, rgba(10, 14, 23, 0.95) 100%);
        }

        .activity-panel-content::-webkit-scrollbar {
            width: 5px;
        }

        .activity-panel-content::-webkit-scrollbar-track {
            background: rgba(48, 54, 61, 0.3);
            border-radius: 3px;
        }

        .activity-panel-content::-webkit-scrollbar-thumb {
            background: #00c853;
            border-radius: 3px;
        }

        .activity-tab-content {
            display: none;
            animation: fadeIn 0.3s ease;
        }

        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(-10px); }
            to { opacity: 1; transform: translateY(0); }
        }

        .activity-tab-content.active {
            display: block;
        }

        .activity-player-item {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 8px 10px;
            border-bottom: 1px solid rgba(48, 54, 61, 0.3);
            gap: 8px;
            flex-wrap: wrap;
            transition: all 0.2s;
            border-radius: 6px;
            margin-bottom: 2px;
        }

        .activity-player-item:hover {
            background: rgba(48, 54, 61, 0.3);
            transform: translateX(2px);
        }

        .player-info-row {
            display: flex;
            align-items: center;
            gap: 8px;
            flex: 2;
            flex-wrap: wrap;
            min-width: 0;
        }

        .activity-player-name {
            color: #e8edf5;
            font-weight: 500;
            flex: 1;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            font-size: 11px;
            cursor: pointer;
            min-width: 80px;
            transition: color 0.2s;
        }

        .activity-player-name:hover {
            color: #00c853;
            text-decoration: none;
            text-shadow: 0 0 8px rgba(0,200,83,0.3);
        }

        .activity-player-badge {
            padding: 3px 10px;
            border-radius: 16px;
            font-size: 9px;
            font-weight: 600;
            white-space: nowrap;
            min-width: 70px;
            text-align: center;
            letter-spacing: 0.2px;
            transition: all 0.2s;
            backdrop-filter: blur(4px);
        }

        .ff-badge {
            background: linear-gradient(135deg, rgba(106, 27, 154, 0.9) 0%, rgba(81, 45, 168, 0.9) 100%);
            color: white;
            cursor: help;
            border: 1px solid rgba(156, 39, 176, 0.5);
            font-size: 9px;
            padding: 3px 8px;
            min-width: 60px;
        }

        .ff-badge:hover {
            background: linear-gradient(135deg, rgba(142, 36, 170, 0.95) 0%, rgba(106, 27, 154, 0.95) 100%);
            transform: scale(1.02);
        }

        .badge-green {
            background: linear-gradient(135deg, rgba(0, 200, 83, 0.9) 0%, rgba(0, 150, 60, 0.9) 100%);
            color: white;
            border: 1px solid rgba(0, 200, 83, 0.5);
        }
        .badge-yellow {
            background: linear-gradient(135deg, rgba(255, 214, 0, 0.9) 0%, rgba(230, 190, 0, 0.9) 100%);
            color: #1a1a1a;
            border: 1px solid rgba(255, 214, 0, 0.5);
        }
        .badge-orange {
            background: linear-gradient(135deg, rgba(255, 109, 0, 0.9) 0%, rgba(230, 81, 0, 0.9) 100%);
            color: white;
            border: 1px solid rgba(255, 109, 0, 0.5);
        }
        .badge-red {
            background: linear-gradient(135deg, rgba(255, 23, 68, 0.9) 0%, rgba(200, 0, 50, 0.9) 100%);
            color: white;
            border: 1px solid rgba(255, 23, 68, 0.5);
        }
        .badge-black {
            background: linear-gradient(135deg, rgba(35, 39, 45, 0.95) 0%, rgba(20, 24, 30, 0.95) 100%);
            color: #b4bec8;
            border: 1px solid rgba(72, 78, 85, 0.5);
        }

        .status-hospital {
            background: linear-gradient(135deg, rgba(233, 30, 99, 0.9) 0%, rgba(200, 0, 70, 0.9) 100%);
            color: white;
            border: 1px solid rgba(233, 30, 99, 0.5);
        }
        .status-traveling {
            background: linear-gradient(135deg, rgba(33, 150, 243, 0.9) 0%, rgba(25, 118, 210, 0.9) 100%);
            color: white;
            border: 1px solid rgba(33, 150, 243, 0.5);
        }

        .activity-loading {
            text-align: center;
            padding: 30px;
            color: #8b96a5;
            font-size: 11px;
        }

        .activity-loading::after {
            content: " ⚡";
            animation: pulse 1s ease-in-out infinite;
            display: inline-block;
        }

        @keyframes pulse {
            0%, 100% { opacity: 0.5; transform: scale(1); }
            50% { opacity: 1; transform: scale(1.1); }
        }

        .activity-empty {
            text-align: center;
            padding: 30px;
            color: #5a6575;
            font-size: 11px;
            font-style: italic;
        }

        .activity-timestamp {
            font-size: 8px;
            text-align: center;
            padding: 6px;
            color: #5a6575;
            border-top: 1px solid rgba(48, 54, 61, 0.5);
            background: rgba(10, 14, 23, 0.95);
            font-weight: 500;
            letter-spacing: 0.5px;
        }

        .activity-toast {
            position: fixed;
            bottom: 20px;
            right: 20px;
            background: linear-gradient(135deg, #1a1f2e 0%, #0d1117 100%);
            color: #e8edf5;
            padding: 8px 16px;
            border-radius: 10px;
            font-size: 11px;
            z-index: 100001;
            border-left: 3px solid #00c853;
            opacity: 0;
            transition: opacity 0.3s;
            pointer-events: none;
            font-weight: 500;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        }

        .activity-toast.show {
            opacity: 1;
        }

        .target-actions {
            display: flex;
            gap: 4px;
        }
    `);

    // ============================================================
    // CONFIGURATION
    // ============================================================
    const CACHE_DURATION = 60 * 60 * 1000; // 1 hour
    const FF_CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours for FF stats
    const API_DELAY = 800;
    const FF_API_DELAY = 500;
    const AUTO_REFRESH_INTERVAL = 60 * 60 * 1000; // 1 hour auto-refresh

    let TORN_API_KEY = GM_getValue('torn_api_key', '');
    let FF_API_KEY = GM_getValue('ff_api_key', '');

    // ============================================================
    // PERSISTENT STORAGE KEYS
    // ============================================================
    const STORAGE_KEYS = {
        FACTION_DATA: 'torn_activity_faction_data',
        FACTION_TIMESTAMP: 'torn_activity_faction_timestamp',
        COMPANY_DATA: 'torn_activity_company_data',
        COMPANY_TIMESTAMP: 'torn_activity_company_timestamp',
        PANEL_MINIMIZED: 'torn_activity_panel_minimized',
        MY_XID: 'torn_activity_my_xid',
        FF_CACHE: 'ff_scouter_cache',
        LAST_REFRESH: 'torn_activity_last_refresh'
    };

    // Data structures
    let factionPlayers = new Map();
    let companyPlayers = new Map();
    let ffCache = new Map(); // player_id -> { ff, bs_estimate, distribution, last_updated }

    let lastFactionFetch = 0;
    let lastCompanyFetch = 0;
    let isFetching = false;
    let currentTab = 'faction';
    let panel = null;
    let isPanelMinimized = false;
    let autoRefreshTimer = null;

    // Rate limiting: Track API calls within last minute
    let apiCallTimestamps = [];

    function canMakeAPICall() {
        const now = Date.now();
        const oneMinuteAgo = now - 60000;
        // Remove timestamps older than 1 minute
        apiCallTimestamps = apiCallTimestamps.filter(ts => ts > oneMinuteAgo);
        return apiCallTimestamps.length < 100;
    }

    function recordAPICall() {
        apiCallTimestamps.push(Date.now());
    }

    async function rateLimitedAPICall(url, retryDelay = 2000) {
        while (!canMakeAPICall()) {
            const oldestCall = apiCallTimestamps[0];
            const waitTime = 60000 - (Date.now() - oldestCall) + 100;
            console.log(`[Rate Limit] Waiting ${waitTime}ms before next API call...`);
            await new Promise(r => setTimeout(r, Math.min(waitTime, 5000)));
        }
        recordAPICall();
        return apiRequest(url);
    }

    // ============================================================
    // FF SCOUTER API INTEGRATION
    // ============================================================
    const FF_BASE_URL = "https://ffscouter.com";

    function loadFFCache() {
        const saved = GM_getValue(STORAGE_KEYS.FF_CACHE, null);
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                ffCache = new Map(parsed);
                // Clean expired entries
                const now = Date.now();
                for (const [id, data] of ffCache) {
                    if (data.expiry && data.expiry < now) {
                        ffCache.delete(id);
                    }
                }
                return true;
            } catch (e) {
                console.error('[Scanner] Failed to parse FF cache:', e);
            }
        }
        return false;
    }

    function saveFFCache() {
        const dataToSave = Array.from(ffCache.entries());
        GM_setValue(STORAGE_KEYS.FF_CACHE, JSON.stringify(dataToSave));
    }

    async function fetchFFStats(playerIds) {
        if (!FF_API_KEY || playerIds.length === 0) return new Map();

        // Filter out cached entries
        const now = Date.now();
        const uncachedIds = playerIds.filter(id => {
            const cached = ffCache.get(id);
            return !cached || cached.expiry < now;
        });

        if (uncachedIds.length === 0) return new Map();

        const results = new Map();
        const playerIdList = uncachedIds.join(",");
        const url = `${FF_BASE_URL}/api/v1/get-stats?key=${FF_API_KEY}&targets=${playerIdList}`;

        return new Promise((resolve) => {
            GM_xmlhttpRequest({
                method: "GET",
                url: url,
                timeout: 15000,
                onload: function (response) {
                    if (response.status === 200 && response.responseText) {
                        try {
                            const ffResponse = JSON.parse(response.responseText);
                            if (ffResponse && !ffResponse.error) {
                                const expiry = now + FF_CACHE_DURATION;
                                for (const result of ffResponse) {
                                    if (result && result.player_id) {
                                        const cacheEntry = {
                                            player_id: result.player_id,
                                            ff: result.fair_fight,
                                            bs_estimate: result.bs_estimate,
                                            bs_estimate_human: result.bs_estimate_human,
                                            distribution_human: result.distribution?.distribution_human,
                                            last_updated: result.last_updated,
                                            expiry: expiry
                                        };
                                        ffCache.set(result.player_id.toString(), cacheEntry);
                                        results.set(result.player_id.toString(), cacheEntry);
                                    }
                                }
                                saveFFCache();
                            }
                        } catch (e) {
                            console.error('[FF] Parse error:', e);
                        }
                    }
                    resolve(results);
                },
                onerror: () => resolve(new Map())
            });
        });
    }

    async function getFFStatsForPlayers(playerIds) {
        const now = Date.now();
        const result = new Map();
        const needFetch = [];

        for (const id of playerIds) {
            const cached = ffCache.get(id);
            if (cached && cached.expiry > now) {
                result.set(id, cached);
            } else {
                needFetch.push(id);
            }
        }

        if (needFetch.length > 0) {
            // Batch fetch in chunks of 50
            for (let i = 0; i < needFetch.length; i += 50) {
                const chunk = needFetch.slice(i, i + 50);
                const fetched = await fetchFFStats(chunk);
                for (const [id, data] of fetched) {
                    result.set(id, data);
                }
                await new Promise(r => setTimeout(r, FF_API_DELAY));
            }
        }

        return result;
    }

    function getFFBadgeHtml(ffData) {
        if (!ffData || ffData.ff === null || ffData.ff === undefined) {
            return '<span class="activity-player-badge ff-badge" title="No FF data available">❓ No FF</span>';
        }

        const ff = ffData.ff;
        const ffString = ff.toFixed(2);
        let difficulty = '';
        let bgColor = '';

        if (ff <= 1) {
            difficulty = 'Extremely easy';
            bgColor = '#00c853';
        } else if (ff <= 2) {
            difficulty = 'Easy';
            bgColor = '#69f0ae';
        } else if (ff <= 3.5) {
            difficulty = 'Moderately difficult';
            bgColor = '#ffd600';
        } else if (ff <= 4.5) {
            difficulty = 'Difficult';
            bgColor = '#ff6d00';
        } else {
            difficulty = 'May be impossible';
            bgColor = '#ff1744';
        }

        const statLine = ffData.bs_estimate_human ? ` ${ffData.bs_estimate_human}` : '';
        const title = `FF: ${ffString} (${difficulty})${statLine}`;

        return `<span class="activity-player-badge ff-badge" style="background: linear-gradient(135deg, ${bgColor}CC 0%, ${bgColor}99 100%); color: ${bgColor === '#ffd600' ? '#1a1a1a' : 'white'}; border: 1px solid ${bgColor}80;" title="${title}">⚔️ ${ffString}${statLine}</span>`;
    }

    // ============================================================
    // UTILITIES
    // ============================================================
    function showToast(msg, duration = 2500) {
        let toast = document.querySelector('.activity-toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.className = 'activity-toast';
            document.body.appendChild(toast);
        }
        toast.textContent = msg;
        toast.classList.add('show');
        setTimeout(() => toast.classList.remove('show'), duration);
    }

    function formatTimeAsHours(minutes) {
        if (minutes <= 0) return '0m';
        const hours = Math.floor(minutes / 60);
        const mins = minutes % 60;
        if (hours > 0 && mins > 0) return `${hours}h ${mins}m`;
        if (hours > 0) return `${hours}h`;
        return `${mins}m`;
    }

    function formatTimeDisplayFromRelative(relative, minutes) {
        if (relative?.toLowerCase().includes('online')) return '🟢 Online';
        if (minutes <= 0) return '0m';
        return formatTimeAsHours(minutes);
    }

    function minutesFromText(text) {
        if (!text) return 999999;
        text = text.toLowerCase();
        let total = 0;
        const daysMatch = text.match(/(\d+)\s*day/);
        const hoursMatch = text.match(/(\d+)\s*hour/);
        const minutesMatch = text.match(/(\d+)\s*min/);

        if (daysMatch) total += parseInt(daysMatch[1]) * 1440;
        if (hoursMatch) total += parseInt(hoursMatch[1]) * 60;
        if (minutesMatch) total += parseInt(minutesMatch[1]);

        if (total === 0 && (text.includes('sec') || text.includes('just now'))) total = 1;
        return total;
    }

    function getBadgeClass(minutes) {
        if (minutes >= 4320) return 'badge-black';
        if (minutes >= 1440) return 'badge-red';
        if (minutes >= 900) return 'badge-orange';
        if (minutes >= 240) return 'badge-yellow';
        return 'badge-green';
    }

    function escapeHtml(str) {
        if (!str) return 'Unknown';
        return str.replace(/[&<>]/g, function(m) {
            if (m === '&') return '&amp;';
            if (m === '<') return '&lt;';
            if (m === '>') return '&gt;';
            return m;
        });
    }

    function openProfile(id) {
        window.open(`https://www.torn.com/profiles.php?XID=${id}`, '_blank');
    }

    function updateTimestamp() {
        const timestampEl = document.getElementById('activity-timestamp');
        if (timestampEl) {
            const lastRefresh = GM_getValue(STORAGE_KEYS.LAST_REFRESH, null);
            if (lastRefresh) {
                const timeAgo = Math.floor((Date.now() - lastRefresh) / 60000);
                if (timeAgo < 1) {
                    timestampEl.textContent = `Last refresh: just now | Auto-refresh every 1 hour`;
                } else if (timeAgo < 60) {
                    timestampEl.textContent = `Last refresh: ${timeAgo} min ago | Auto-refresh every 1 hour`;
                } else {
                    const hours = Math.floor(timeAgo / 60);
                    const mins = timeAgo % 60;
                    timestampEl.textContent = `Last refresh: ${hours}h ${mins}m ago | Auto-refresh every 1 hour`;
                }
            } else {
                timestampEl.textContent = `Ready | Auto-refresh every 1 hour`;
            }
        }
    }

    // ============================================================
    // API FETCH (Torn)
    // ============================================================
    function apiRequest(url) {
        return new Promise((resolve) => {
            GM_xmlhttpRequest({
                method: 'GET',
                url: url,
                timeout: 10000,
                onload: (resp) => {
                    try {
                        resolve(JSON.parse(resp.responseText));
                    } catch (e) {
                        resolve({ error: { error: 'Parse error' } });
                    }
                },
                onerror: () => resolve({ error: { error: 'Network error' } })
            });
        });
    }

    async function fetchMyXID() {
        let xid = GM_getValue(STORAGE_KEYS.MY_XID, null);
        if (xid) return xid;
        if (!TORN_API_KEY) return null;

        const json = await rateLimitedAPICall(`https://api.torn.com/user/?selections=profile&key=${TORN_API_KEY}`);
        if (json.player_id) {
            GM_setValue(STORAGE_KEYS.MY_XID, json.player_id);
            return json.player_id;
        }
        return null;
    }

    // ============================================================
    // FACTION/COMPANY DATA
    // ============================================================
    async function fetchGroupMembers(category) {
        if (!TORN_API_KEY) return new Map();

        const url = category === 'faction'
            ? `https://api.torn.com/faction/?selections=basic&key=${TORN_API_KEY}`
            : `https://api.torn.com/company/?selections=employees&key=${TORN_API_KEY}`;

        const json = await rateLimitedAPICall(url);
        if (json.error) return new Map();

        const membersKey = category === 'faction' ? 'members' : 'company_employees';
        const members = json[membersKey];
        if (!members) return new Map();

        const playersMap = new Map();
        for (const [id, member] of Object.entries(members)) {
            const relative = member.last_action?.relative;
            playersMap.set(id, {
                name: member.name || `User ${id}`,
                data: relative ? { relative, minutes: minutesFromText(relative) } : null,
                timestamp: Date.now()
            });
        }
        return playersMap;
    }

    async function refreshCategory(category, forceRefresh = false, isAutoRefresh = false) {
        if (!TORN_API_KEY) {
            if (!isAutoRefresh) showToast('⚠️ Please set your Torn API Key first!', 5000);
            return false;
        }

        // Check if we can make an API call (rate limiting)
        if (!canMakeAPICall()) {
            const waitMsg = 'Rate limit approaching 100/min, waiting...';
            console.log(`[Refresh] ${waitMsg}`);
            if (!isAutoRefresh) showToast(waitMsg, 2000);

            // Wait for rate limit to clear
            while (!canMakeAPICall()) {
                const oldestCall = apiCallTimestamps[0];
                const waitTime = 60000 - (Date.now() - oldestCall) + 100;
                await new Promise(r => setTimeout(r, Math.min(waitTime, 5000)));
            }
        }

        isFetching = true;
        if (panel) panel.classList.add('activity-fetching');

        const playersMap = await fetchGroupMembers(category);
        const cacheMap = category === 'faction' ? factionPlayers : companyPlayers;

        cacheMap.clear();
        for (const [id, entry] of playersMap) {
            cacheMap.set(id, entry);
        }

        // Get all player IDs for FF stats (respect rate limits)
        const playerIds = Array.from(cacheMap.keys());
        await getFFStatsForPlayers(playerIds);

        if (category === 'faction') {
            lastFactionFetch = Date.now();
            saveFactionData();
        } else {
            lastCompanyFetch = Date.now();
            saveCompanyData();
        }

        isFetching = false;
        if (panel) panel.classList.remove('activity-fetching');

        updateTabContent(category);

        // Update last refresh timestamp
        GM_setValue(STORAGE_KEYS.LAST_REFRESH, Date.now());
        updateTimestamp();

        if (!isAutoRefresh) {
            showToast(`✅ Loaded ${cacheMap.size} ${category} members`, 3000);
        }
        return true;
    }

    // Force refresh both tabs (used by auto-refresh)
    async function forceRefreshAll() {
        if (isFetching) {
            console.log('[Auto-Refresh] Already fetching, skipping...');
            return;
        }
        console.log('[Auto-Refresh] Starting scheduled refresh...');
        showToast('🔄 Auto-refreshing data...', 2000);

        // Refresh faction first, then company with a delay to respect rate limits
        await refreshCategory('faction', true, true);
        // Add delay between refreshes to respect rate limits
        await new Promise(r => setTimeout(r, API_DELAY * 2));
        await refreshCategory('company', true, true);

        console.log('[Auto-Refresh] Completed');
    }

    function saveFactionData() {
        GM_setValue(STORAGE_KEYS.FACTION_DATA, JSON.stringify(Array.from(factionPlayers.entries())));
        GM_setValue(STORAGE_KEYS.FACTION_TIMESTAMP, lastFactionFetch);
    }

    function saveCompanyData() {
        GM_setValue(STORAGE_KEYS.COMPANY_DATA, JSON.stringify(Array.from(companyPlayers.entries())));
        GM_setValue(STORAGE_KEYS.COMPANY_TIMESTAMP, lastCompanyFetch);
    }

    function loadFactionData() {
        const saved = GM_getValue(STORAGE_KEYS.FACTION_DATA, null);
        if (saved) {
            try {
                factionPlayers = new Map(JSON.parse(saved));
                lastFactionFetch = GM_getValue(STORAGE_KEYS.FACTION_TIMESTAMP, 0);
                return true;
            } catch (e) {}
        }
        return false;
    }

    function loadCompanyData() {
        const saved = GM_getValue(STORAGE_KEYS.COMPANY_DATA, null);
        if (saved) {
            try {
                companyPlayers = new Map(JSON.parse(saved));
                lastCompanyFetch = GM_getValue(STORAGE_KEYS.COMPANY_TIMESTAMP, 0);
                return true;
            } catch (e) {}
        }
        return false;
    }

    // ============================================================
    // UI COMPONENTS
    // ============================================================
    function toggleMinimized() {
        isPanelMinimized = !isPanelMinimized;
        GM_setValue(STORAGE_KEYS.PANEL_MINIMIZED, isPanelMinimized);

        if (panel) {
            if (isPanelMinimized) {
                panel.classList.add('minimized');
            } else {
                panel.classList.remove('minimized');
            }
        }
    }

    function startAutoRefreshTimer() {
        if (autoRefreshTimer) {
            clearInterval(autoRefreshTimer);
        }
        autoRefreshTimer = setInterval(() => {
            forceRefreshAll();
        }, AUTO_REFRESH_INTERVAL);
        console.log(`[Auto-Refresh] Timer started - will refresh every ${AUTO_REFRESH_INTERVAL / 60000} minutes`);
    }

    function createFloatingPanel() {
        if (panel) return panel;

        const savedMinimized = GM_getValue(STORAGE_KEYS.PANEL_MINIMIZED, false);
        isPanelMinimized = savedMinimized;

        panel = document.createElement('div');
        panel.className = 'activity-floating-panel';
        if (isPanelMinimized) panel.classList.add('minimized');

        panel.innerHTML = `
            <div class="activity-panel-header">
                <span class="activity-panel-title"><span>Activity Scanner</span></span>
                <div class="button-group">
                    <button class="activity-refresh-btn" id="activity-force-refresh">🔄 Force Refresh</button>
                    <button class="minimize-btn" id="minimize-panel">−</button>
                </div>
            </div>
            <div class="activity-tabs">
                <button class="activity-tab" data-tab="faction">🏢 Faction</button>
                <button class="activity-tab" data-tab="company">💼 Company</button>
            </div>
            <div class="activity-panel-content">
                <div id="faction-tab" class="activity-tab-content"><div class="activity-loading">Loading...</div></div>
                <div id="company-tab" class="activity-tab-content"><div class="activity-loading">Loading...</div></div>
            </div>
            <div class="activity-timestamp" id="activity-timestamp">Ready</div>
        `;
        document.body.appendChild(panel);

        // Tab switching
        document.querySelectorAll('.activity-tab').forEach(tab => {
            tab.addEventListener('click', () => switchTab(tab.dataset.tab));
        });

        // Force Refresh button - only this button remains
        document.getElementById('activity-force-refresh').addEventListener('click', () => {
            forceRefreshAll();
        });

        // Minimize button
        document.getElementById('minimize-panel').addEventListener('click', (e) => {
            e.stopPropagation();
            toggleMinimized();
        });

        // When minimized, clicking anywhere on the panel expands it
        panel.addEventListener('click', (e) => {
            if (isPanelMinimized && !e.target.closest('.minimize-btn')) {
                toggleMinimized();
            }
        });

        // Draggable (only when not minimized)
        let isDragging = false, startX, startY, startLeft, startBottom;
        const header = panel.querySelector('.activity-panel-header');
        header.addEventListener('mousedown', (e) => {
            if (isPanelMinimized) return;
            if (e.target.classList.contains('minimize-btn') || e.target.classList.contains('activity-refresh-btn')) return;
            isDragging = true;
            startX = e.clientX;
            startY = e.clientY;
            startLeft = parseInt(panel.style.left) || 20;
            startBottom = parseInt(panel.style.bottom) || 20;
            panel.style.transition = 'none';
        });
        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            panel.style.left = `${startLeft + (e.clientX - startX)}px`;
            panel.style.bottom = `${startBottom + (startY - e.clientY)}px`;
        });
        document.addEventListener('mouseup', () => {
            isDragging = false;
            panel.style.transition = '';
        });

        return panel;
    }

    function switchTab(tabName) {
        currentTab = tabName;
        document.querySelectorAll('.activity-tab').forEach(tab => {
            tab.classList.toggle('active', tab.dataset.tab === tabName);
        });
        document.querySelectorAll('.activity-tab-content').forEach(content => {
            content.classList.remove('active');
        });
        document.getElementById(`${tabName}-tab`).classList.add('active');
        updateTabContent(tabName);
    }

    async function updateTabContent(tabName) {
        // Faction or Company tab
        const container = document.getElementById(`${tabName}-tab`);
        const players = tabName === 'faction' ? factionPlayers : companyPlayers;

        if (players.size === 0) {
            container.innerHTML = '<div class="activity-empty">No data loaded. Click Force Refresh to fetch.</div>';
            return;
        }

        const playerIds = Array.from(players.keys());
        await getFFStatsForPlayers(playerIds);

        let html = '';
        const sorted = Array.from(players.entries()).sort((a, b) => {
            const minA = a[1].data?.minutes ?? 999999;
            const minB = b[1].data?.minutes ?? 999999;
            return minA - minB;
        });

        for (const [id, { name, data }] of sorted) {
            const ffData = ffCache.get(id);
            const ffBadge = getFFBadgeHtml(ffData);

            if (!data) {
                html += `<div class="activity-player-item">
                            <div class="player-info-row">
                                <span class="activity-player-name" data-id="${id}">${escapeHtml(name)}</span>
                                ${ffBadge}
                                <span class="activity-player-badge" style="background: #2a2e3a;">⏳ pending</span>
                            </div>
                            <div class="target-actions"></div>
                         </div>`;
            } else {
                const timeDisplay = formatTimeDisplayFromRelative(data.relative, data.minutes);
                const badgeClass = getBadgeClass(data.minutes);
                html += `<div class="activity-player-item">
                            <div class="player-info-row">
                                <span class="activity-player-name" data-id="${id}">${escapeHtml(name)}</span>
                                ${ffBadge}
                                <span class="activity-player-badge ${badgeClass}">⏱️ ${timeDisplay}</span>
                            </div>
                            <div class="target-actions"></div>
                         </div>`;
            }
        }
        container.innerHTML = html;

        container.querySelectorAll('.activity-player-name').forEach(el => {
            el.addEventListener('click', () => openProfile(el.dataset.id));
        });
    }

    // ============================================================
    // INITIALIZATION
    // ============================================================
    async function initialize() {
        createFloatingPanel();
        loadFactionData();
        loadCompanyData();
        loadFFCache();

        if (!TORN_API_KEY) {
            const warn = document.createElement('div');
            warn.textContent = '⚠️ Activity Scanner: Set Torn API Key via Tampermonkey Menu → "Set Torn API Key"';
            warn.style.cssText = 'position:fixed;top:0;left:0;right:0;background:linear-gradient(135deg,#ff9800,#ff6d00);color:#fff;text-align:center;padding:6px;z-index:999999;font-size:11px;font-weight:600;box-shadow:0 2px 8px rgba(0,0,0,0.2);';
            document.body.appendChild(warn);
        }

        if (!FF_API_KEY) {
            showToast('💡 Tip: Set FF Scouter API Key via Tampermonkey Menu for battle stats', 5000);
        }

        switchTab('faction');
        updateTimestamp();

        // Load initial data if cache empty
        if (factionPlayers.size === 0) setTimeout(() => refreshCategory('faction', false), 1000);
        if (companyPlayers.size === 0) setTimeout(() => refreshCategory('company', false), 2000);

        // Start auto-refresh timer
        startAutoRefreshTimer();

        // Menu commands
        GM_registerMenuCommand('🔑 Set Torn API Key', () => {
            const input = prompt('Enter your Torn API key (Limited, with Profile access):', TORN_API_KEY);
            if (input?.trim()) {
                TORN_API_KEY = input.trim();
                GM_setValue('torn_api_key', TORN_API_KEY);
                showToast('✅ Torn API Key saved! Refreshing...', 2000);
                setTimeout(() => { forceRefreshAll(); }, 1000);
            }
        });

        GM_registerMenuCommand('🔑 Set FF Scouter API Key', () => {
            const input = prompt('Enter your FF Scouter API key (from ffscouter.com):', FF_API_KEY);
            if (input?.trim()) {
                FF_API_KEY = input.trim();
                GM_setValue('ff_api_key', FF_API_KEY);
                showToast('✅ FF Scouter API Key saved!', 2000);
            }
        });

        GM_registerMenuCommand('🗑️ Clear All Cached Data', () => {
            if (confirm('Clear all cached data?')) {
                GM_setValue(STORAGE_KEYS.FACTION_DATA, null);
                GM_setValue(STORAGE_KEYS.COMPANY_DATA, null);
                GM_setValue(STORAGE_KEYS.FF_CACHE, null);
                factionPlayers.clear();
                companyPlayers.clear();
                ffCache.clear();
                showToast('🗑️ All cached data cleared!', 2000);
                setTimeout(() => location.reload(), 1500);
            }
        });

        GM_registerMenuCommand('📌 Toggle Panel Minimized', () => toggleMinimized());

        console.log('[Activity Scanner] v12.0 - Single force refresh button, auto-refresh every 1 hour with rate limiting (max 100 API/min)');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initialize);
    } else {
        initialize();
    }
})();