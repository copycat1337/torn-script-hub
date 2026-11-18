// ==UserScript==
// @name         Torn - Director View
// @namespace    alex.tornpda.directorview
// @version      3.11.0
// @description  Dark ops-console overlay for Torn company management with instant-reaction DOM scraping, auto-adapting stat tracking, inventory, financial graph, advertising elasticity analyzer, and queue spotlight.
// @author       Alex
// @license      MIT
// @match        https://www.torn.com/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_xmlhttpRequest
// @downloadURL https://update.greasyfork.org/scripts/585850/Torn%20-%20Director%20View.user.js
// @updateURL https://update.greasyfork.org/scripts/585850/Torn%20-%20Director%20View.meta.js
// ==/UserScript==
 
(function () {
'use strict';
 
// ============================================================
// PAGE INJECTION LOGIC
// ============================================================
const isCompanyPage = window.location.pathname.includes('joblist.php') || window.location.pathname.includes('companies.php');
const showOnAllPages = GM_getValue('vt_show_all', false);
 
if (!isCompanyPage && !showOnAllPages) {
    return;
}
 
// ============================================================
// SECURE API KEY HANDLING
// ============================================================
let savedKey = GM_getValue('vt_api_key', '');
if (!savedKey || !/^[a-zA-Z0-9]{16}$/.test(savedKey)) {
    savedKey = prompt("Torn Director View:\nPlease enter your 16-character Torn API Key.\n(Limited Access required)");
    if (savedKey && /^[a-zA-Z0-9]{16}$/.test(savedKey)) {
        GM_setValue('vt_api_key', savedKey);
    } else {
        return;
    }
}
 
// ============================================================
// CONFIG
// ============================================================
const CONFIG = {
    API_KEY: savedKey,
    LAST_ACTIVE_WARN_MINUTES: 60,
    LAST_ACTIVE_CRIT_MINUTES: 60 * 24,
    ADDICTION_WARN: -6,
    ADDICTION_CRIT: -12,
    SILENT_FAILURE_WARN_THRESHOLD: 2
};
 
// ============================================================
// Addiction message settings (customizable) -- NEW in 3.7.0
// ============================================================
const ADDICTION_THRESHOLD_KEY = 'vt_addiction_msg_threshold';
const ADDICTION_TEMPLATE_KEY = 'vt_addiction_msg_template';
const DEFAULT_ADDICTION_TEMPLATE = `Hey {name},\n\nJust a heads up — your addiction level is sitting at {addiction}, which is getting into the range where it starts hurting your effectiveness. No pressure, just wanted to flag it so you can ease off before it dips further. Let me know if you have any questions!`;
 
function getAddictionThreshold() {
    const stored = GM_getValue(ADDICTION_THRESHOLD_KEY, null);
    const num = parseInt(stored, 10);
    return Number.isFinite(num) ? num : -3;
}
 
function getAddictionTemplate() {
    const stored = GM_getValue(ADDICTION_TEMPLATE_KEY, null);
    return (typeof stored === 'string' && stored.trim().length > 0) ? stored : DEFAULT_ADDICTION_TEMPLATE;
}
 
function buildAddictionMessage(emp) {
    return getAddictionTemplate()
        .replace(/\{name\}/g, emp.name)
        .replace(/\{addiction\}/g, emp.addiction);
}
 
// ============================================================
// STATE MANAGEMENT
// ============================================================
let appState = {
    company: null,
    employees: [],
    stock: [],
    history: [],
    statsHistory: [],
    stockHistory: [],
    trainingHistory: [],
    adHistory: [],
    skipOverrides: {},
    positionReqs: {},
    sortMode: 'default',
    activeTab: 'roster',
    financePeriod: 'daily',
    lastSyncError: null,
    lastSyncErrorTs: null,
    lastSyncOkTs: null
};
let isLoadingData = false;
let consecutiveSilentFailures = 0; 
 
// ============================================================
// STYLES
// ============================================================
const css = `
#vt-console-root, #vt-console-root * { box-sizing: border-box; }
#vt-console-root {
    --bg: #0A0C10; --panel: #14171D; --panel-raised: #191D24;
    --hairline: #262B33; --brass: #C98A4B; --brass-dim: #8A6237;
    --steel: #5B8AA6; --text: #E8E6E1; --text-muted: #9BA2AC;
    --text-faint: #767E89; --ok: #5FA777; --warn: #D6A14D; --crit: #C1554A;
    font-family: 'Inter', -apple-system, sans-serif;
}
 
#vt-toggle-tab {
    position: fixed; bottom: 90px; right: 12px; z-index: 999998;
    background: #14171D; border: 1px solid #C98A4B;
    color: #C98A4B; font-family: monospace; font-size: 11px;
    font-weight: 600; letter-spacing: 0.5px;
    padding: 10px 8px; border-radius: 8px 0 0 8px;
    box-shadow: 0 2px 12px rgba(0,0,0,0.5);
    cursor: pointer; writing-mode: vertical-rl; text-orientation: mixed;
}
@media (max-width: 600px) { #vt-toggle-tab { bottom: 140px; } }
 
.vt-tab-dot {
    display: none;
    width: 8px; height: 8px; border-radius: 50%;
    background: #5FA777; box-shadow: 0 0 6px #5FA777, 0 0 2px #5FA777;
    margin: 7px auto 0;
}
#vt-toggle-tab.vt-has-trainable .vt-tab-dot { display: block; }
 
#vt-toggle-tab.vt-sync-error {
    border-color: #C1554A; color: #C1554A;
}
 
.vt-native-badge {
    display: inline-flex; align-items: center; gap: 3px;
    background: #5FA777; color: #04140a;
    font-family: monospace; font-size: 10px; font-weight: 800;
    padding: 2px 6px; border-radius: 4px; margin-left: 6px;
    letter-spacing: 0.4px; white-space: nowrap; vertical-align: middle;
    box-shadow: 0 0 6px rgba(95,167,119,0.5);
}
 
#vt-console-root {
    position: fixed; top: 0; right: -100%; width: 92%; max-width: 420px;
    height: 100%; background: #0A0C10; z-index: 999999;
    overflow-y: auto; transition: right 0.28s ease;
    box-shadow: -4px 0 24px rgba(0,0,0,0.6);
    padding: 16px 14px 40px;
}
#vt-console-root.open { right: 0; }
 
@media (min-width: 1200px) {
    #vt-console-root { max-width: 460px; }
}
 
#vt-close-btn {
    position: absolute; top: 12px; right: 12px;
    color: var(--text-faint); font-family: monospace; font-size: 18px;
    cursor: pointer; padding: 4px 8px; z-index: 2;
}
 
.vt-status-strip {
    background: var(--panel); border: 1px solid var(--hairline);
    border-radius: 10px; padding: 16px 18px; display: flex;
    justify-content: space-between; align-items: center;
    margin-bottom: 14px; position: relative; overflow: hidden;
}
.vt-status-strip::before {
    content:""; position:absolute; left:0; top:0; bottom:0; width:3px;
    background: linear-gradient(180deg, var(--brass), var(--steel));
}
.vt-company-name { font-size: 18px; font-weight: 700; color: var(--text); padding-left:8px; }
.vt-company-sub { font-family: monospace; font-size: 12px; color: var(--text-muted); margin-top: 3px; }
.vt-metrics { display:flex; gap: 16px; text-align:right; }
.vt-metric-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.8px; color: var(--text-faint); margin-bottom: 4px; }
.vt-metric-value { font-family: monospace; font-size: 15px; font-weight: 600; }
.vt-brass { color: var(--brass); } .vt-steel { color: var(--steel); }
 
#vt-refresh-btn {
    font-family: monospace; font-size: 11px; font-weight: 600;
    color: var(--steel); border: 1px solid var(--steel);
    padding: 5px 10px; border-radius: 6px; cursor: pointer;
    background: rgba(91,138,166,0.08); white-space: nowrap;
}
#vt-refresh-btn.spinning { opacity: 0.5; pointer-events: none; }
.vt-header-row { display:flex; justify-content: flex-start; align-items:center; margin-bottom: 12px; margin-top: 8px; }
 
.vt-performance { display:flex; gap: 8px; margin-bottom: 14px; }
.vt-perf-chip { flex:1; background: var(--panel); border: 1px solid var(--hairline); border-radius: 8px; padding: 9px 10px; text-align:center; }
.vt-perf-chip.vt-perf-clickable { cursor: pointer; }
.vt-perf-chip.vt-perf-clickable:hover { border-color: var(--steel); background: rgba(255,255,255,0.02); }
.vt-perf-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.6px; color: var(--text-faint); margin-bottom: 4px; }
.vt-perf-value { font-family: monospace; font-size: 14px; font-weight: 600; }
 
.vt-view-tabs { display: flex; gap: 8px; margin-bottom: 14px; flex-wrap: wrap; }
.vt-view-tab { flex: 1; min-width: 70px; text-align: center; font-family: monospace; font-size: 11px; font-weight: 600; padding: 8px; background: var(--panel); border: 1px solid var(--hairline); border-radius: 6px; cursor: pointer; color: var(--text-faint); letter-spacing: 0.5px; }
.vt-view-tab.active { background: rgba(91,138,166,0.1); color: var(--steel); border-color: var(--steel); }
 
.vt-section-head { display:flex; justify-content: space-between; align-items:baseline; margin: 18px 0 8px 2px; }
.vt-section-title { font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 1px; color: var(--text-muted); }
 
.vt-sort-row { display:flex; gap: 6px; margin-bottom: 10px; flex-wrap: wrap;}
.vt-sort-btn {
    background: var(--panel); border: 1px solid var(--hairline); color: var(--text-muted);
    font-family: monospace; font-size: 10px; padding: 6px 9px; border-radius: 4px; cursor: pointer;
}
.vt-sort-btn.active { color: var(--brass); border-color: var(--brass); background: rgba(201, 138, 75, 0.1); }
 
.vt-roster { display: flex; flex-direction: column; gap: 8px; }
.vt-employee { background: var(--panel); border: 1px solid var(--hairline); border-radius: 8px; padding: 12px 13px; }
.vt-emp-top { display:flex; justify-content: space-between; align-items:center; margin-bottom: 8px; }
.vt-emp-name { font-weight: 600; font-size: 14px; color: var(--text); text-decoration: none; display: flex; align-items: center;}
.vt-emp-name:hover { text-decoration: underline; color: var(--brass); }
.vt-badge-train { background: var(--ok); color: #000; padding: 2px 5px; border-radius: 4px; font-size: 9px; font-weight: 800; margin-left: 6px; letter-spacing: 0.5px; white-space: nowrap;}
.vt-action-link { text-decoration: none; font-size: 14px; margin-left: 6px; opacity: 0.7; }
.vt-action-link:hover { opacity: 1; }
.vt-action-link-addiction {
    text-decoration: none; font-size: 11px; margin-left: 6px;
    font-family: monospace; font-weight: 700; color: var(--warn);
    border: 1px solid var(--warn); padding: 1px 6px; border-radius: 4px;
    white-space: nowrap;
}
.vt-action-link-addiction:hover { background: rgba(214,161,77,0.12); }
.vt-emp-role { font-family: monospace; font-size: 10.5px; color: var(--text-muted); text-transform: uppercase; margin-top:3px; }
.vt-emp-right { display:flex; align-items:center; gap: 10px; }
.vt-last-active { font-family: monospace; font-size: 11px; }
.vt-ok { color: var(--ok); } .vt-warn { color: var(--warn); } .vt-crit { color: var(--crit); }
.vt-ee-col { display: flex; flex-direction: column; align-items: flex-end; }
.vt-ee-number { font-family: monospace; font-size: 13px; font-weight: 600; min-width: 32px; text-align:right; color: var(--text); }
.vt-ee-breakdown { font-family: monospace; font-size: 9.5px; color: var(--text-faint); text-align:right; margin-top: 1px; white-space: nowrap; }
.vt-wage { font-family: monospace; font-size: 11px; color: var(--text-muted); margin-top: 5px; }
 
.vt-pulse-track { position: relative; height: 6px; background: #1F232B; border-radius: 3px; margin-top: 22px; }
.vt-pulse-fill { height: 100%; border-radius: 3px; background: linear-gradient(90deg, var(--steel), var(--brass)); }
.vt-addiction-tick { position: absolute; top: -3px; width: 2px; height: 12px; border-radius: 1px; background: var(--crit); z-index: 2; }
.vt-addiction-tick::after { content: attr(data-val); position: absolute; top: -15px; left: 50%; transform: translateX(-50%);
font-family: monospace; font-size: 9px; font-weight: 700; color: var(--crit); background: rgba(10,12,16,0.92);
border: 1px solid rgba(193,85,74,0.5); padding: 1px 4px; border-radius: 3px; white-space: nowrap; z-index: 3; }
 
.vt-btn-row { display: flex; gap: 8px; margin-top: 16px; }
.vt-action-btn {
    flex: 1; display:flex; align-items:center; justify-content:center; gap: 6px;
    font-family: monospace; font-size: 11px; font-weight: 600;
    color: var(--text); background: var(--panel-raised); border: 1px solid var(--hairline);
    padding: 11px; border-radius: 8px; cursor: pointer; transition: 0.2s;
}
.vt-action-btn:hover { background: #262B33; }
.vt-action-btn.copied { color: var(--ok); border-color: var(--ok); }
.vt-donate-btn { color: var(--brass); border-color: var(--brass); background: rgba(201, 138, 75, 0.05); }
.vt-donate-btn:hover { background: rgba(201, 138, 75, 0.15); color: #FFF; border-color: var(--brass); }
 
/* --- FINANCIAL PERFORMANCE GRAPH STYLES --- */
.vt-graph-card {
    background: var(--panel); border: 1px solid var(--hairline);
    border-radius: 10px; padding: 14px; margin-bottom: 14px;
    box-shadow: inset 0 0 12px rgba(0,0,0,0.2);
}
.vt-graph-legend {
    display: flex; justify-content: space-between; align-items: center;
    margin-bottom: 12px; padding-bottom: 8px;
    border-bottom: 1px dashed var(--hairline);
}
.vt-legend-group { display: flex; gap: 16px; }
.vt-legend-item {
    display: flex; align-items: center; gap: 6px;
    font-family: monospace; font-size: 11px; font-weight: 600; text-transform: uppercase;
}
.vt-legend-dot { width: 8px; height: 8px; border-radius: 2px; }
.vt-graph-empty {
    text-align: center; color: var(--text-faint); font-family: monospace;
    font-size: 12px; padding: 30px 0; line-height: 1.5;
}
.vt-graph-axis-label { font-family: monospace; font-size: 9px; fill: var(--text-faint); text-anchor: end; }
 
.vt-stock-list { display: flex; flex-direction: column; gap: 8px; margin-top: 4px; }
.vt-stock-item { background: var(--panel); border: 1px solid var(--hairline); border-radius: 8px; padding: 12px; display: flex; justify-content: space-between; align-items: center; }
.vt-stock-name { font-weight: 600; font-size: 14px; color: var(--text); max-width: 34%; word-wrap: break-word; line-height: 1.3;}
.vt-stock-status { font-family: monospace; font-size: 9px; font-weight: 700; letter-spacing: 0.5px; margin-top: 4px; }
.vt-stock-details { display:flex; gap: 9px; text-align:right; }
.vt-stock-stat { font-family: monospace; font-size: 12px; display:flex; flex-direction:column; align-items:flex-end; }
.vt-stock-label { font-size: 9px; color: var(--text-faint); margin-bottom: 3px; font-family: 'Inter', sans-serif;}
.vt-stock-val { font-weight: 600; color: var(--text); }
.vt-stock-val.low { color: var(--crit); }
 
.vt-spotlight-card {
    background: linear-gradient(135deg, rgba(95,167,119,0.16), rgba(95,167,119,0.03));
    border: 2px solid var(--ok); border-radius: 12px; padding: 18px;
    margin-bottom: 12px; text-align: center;
}
.vt-spotlight-label { font-family: monospace; font-size: 11px; font-weight: 800; letter-spacing: 2.5px; color: var(--ok); margin-bottom: 8px; }
.vt-spotlight-name { font-size: 23px; font-weight: 800; color: var(--text); text-decoration: none; display: inline-block; }
.vt-spotlight-name:hover { color: var(--brass); text-decoration: underline; }
.vt-spotlight-meta { font-family: monospace; font-size: 12px; color: var(--text-muted); margin-top: 6px; }
.vt-spotlight-stats { font-family: monospace; font-size: 13px; color: var(--text); margin-top: 8px; }
.vt-spotlight-link { display:inline-block; margin-top: 10px; font-family: monospace; font-size: 11px; font-weight: 700; color: #000; background: var(--ok); padding: 8px 16px; border-radius: 6px; text-decoration: none; letter-spacing: 0.5px; }
.vt-spotlight-link:hover { opacity: 0.85; }
 
.vt-skip-btn {
    font-family: monospace; font-size: 10px; font-weight: 700; letter-spacing: 0.5px;
    color: var(--text-muted); background: var(--panel-raised); border: 1px solid var(--hairline);
    padding: 6px 10px; border-radius: 6px; cursor: pointer; white-space: nowrap; flex-shrink: 0;
}
.vt-skip-btn:hover { border-color: var(--warn); color: var(--warn); }
.vt-skip-btn-restore { color: var(--ok); border-color: var(--ok); background: rgba(95,167,119,0.08); }
.vt-skip-btn-restore:hover { opacity: 0.85; }
.vt-skip-btn-spotlight { margin-top: 10px; margin-left: 8px; padding: 8px 14px; }
.vt-queue-info-top { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.vt-skipped-tag { font-family: monospace; font-size: 9px; font-weight: 800; letter-spacing: 0.5px; color: var(--warn); border: 1px solid var(--warn); padding: 1px 5px; border-radius: 4px; }
 
.vt-queue-list { display:flex; flex-direction:column; gap: 8px; }
.vt-queue-item { display:flex; gap:12px; background: var(--panel); border: 1px solid var(--hairline); border-radius: 8px; padding: 11px 13px; align-items:flex-start; }
.vt-queue-item.dimmed { opacity: 0.6; }
.vt-queue-item.active { border-color: var(--ok); background: rgba(95,167,119,0.06); }
.vt-queue-rank { flex-shrink:0; width: 26px; height: 26px; border-radius: 50%; background: var(--panel-raised); border: 1px solid var(--hairline); color: var(--text-faint); font-family: monospace; font-weight:700; font-size: 13px; display:flex; align-items:center; justify-content:center; margin-top: 1px; }
.vt-queue-rank.active { background: var(--ok); border-color: var(--ok); color: #000; }
.vt-queue-info { flex: 1; min-width: 0; }
.vt-queue-name { font-weight:600; font-size:14px; color: var(--text); text-decoration:none; }
.vt-queue-name:hover { color: var(--brass); text-decoration:underline; }
.vt-queue-meta { font-family: monospace; font-size: 11px; color: var(--text-muted); margin-top: 3px; }
.vt-queue-stats { font-family: monospace; font-size: 11px; color: var(--text-muted); margin-top: 4px; }
.vt-queue-divider { text-align:center; font-family: monospace; font-size: 10px; letter-spacing: 1.5px; color: var(--text-faint); margin: 6px 0; padding: 6px 0; border-top: 1px dashed var(--hairline); border-bottom: 1px dashed var(--hairline); }
.vt-queue-empty-note { font-family: monospace; font-size: 11px; color: var(--warn); text-align:center; padding: 8px 0 4px; }
 
.vt-history-list { display:flex; flex-direction:column; gap: 8px; }
.vt-history-item { background: var(--panel); border: 1px solid var(--hairline); border-radius: 8px; padding: 10px 13px; }
.vt-history-top { display:flex; justify-content:space-between; align-items:center; gap: 8px; }
.vt-history-name { font-weight:600; font-size:14px; color: var(--text); text-decoration:none; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.vt-history-name:hover { color: var(--brass); text-decoration:underline; }
.vt-history-time { font-family: monospace; font-size: 10px; color: var(--text-faint); white-space: nowrap; }
.vt-history-stats { font-family: monospace; font-size: 11px; color: var(--text-muted); margin-top: 5px; }
.vt-text-faint { color: var(--text-faint); }
 
/* --- FINANCE TAB STYLES --- */
.vt-finance-toggle { display:flex; gap: 6px; margin-bottom: 12px; }
.vt-finance-toggle .vt-sort-btn { flex: 1; text-align:center; padding: 8px; font-size: 11px; }
.vt-finance-grid { display:flex; flex-direction:column; gap: 8px; margin-bottom: 14px; }
.vt-finance-row {
    display:flex; justify-content: space-between; align-items:center;
    background: var(--panel); border: 1px solid var(--hairline); border-radius: 8px;
    padding: 11px 13px;
}
.vt-finance-row.vt-finance-total { border-color: var(--brass); background: rgba(201,138,75,0.06); }
.vt-finance-label { font-family: monospace; font-size: 11px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px; }
.vt-finance-row.vt-finance-total .vt-finance-label { color: var(--brass); }
.vt-finance-value { font-family: monospace; font-size: 14px; font-weight: 700; color: var(--text); }
.vt-finance-value.vt-neg { color: var(--crit); }
.vt-finance-value.vt-pos { color: var(--ok); }
.vt-finance-note { font-family: monospace; font-size: 10px; color: var(--text-faint); text-align:center; padding: 6px 4px 2px; line-height: 1.5; }
.vt-prod-item { background: var(--panel); border: 1px solid var(--hairline); border-radius: 8px; padding: 11px 13px; display:flex; justify-content: space-between; align-items:center; margin-bottom: 8px; }
.vt-prod-name { font-weight: 600; font-size: 13px; color: var(--text); max-width: 40%; }
.vt-prod-stats { display:flex; gap: 14px; text-align:right; }
.vt-prod-stat { font-family: monospace; font-size: 13px; display:flex; flex-direction:column; align-items:flex-end; }
.vt-prod-label { font-size: 9px; color: var(--text-faint); margin-bottom: 3px; font-family: 'Inter', sans-serif;}
.vt-prod-val { font-weight: 600; color: var(--text); }
.vt-prod-val.vt-anomaly { color: var(--warn); }
.vt-prod-anomaly-tag { font-family: monospace; font-size: 9px; color: var(--warn); margin-left: 4px; }
.vt-prod-day { margin-bottom: 14px; }
.vt-prod-day-head { display:flex; justify-content:space-between; align-items:baseline; font-family:monospace; font-size:11px; color:var(--text-muted); margin-bottom:6px; padding-bottom:5px; border-bottom:1px dashed var(--hairline); }
.vt-prod-day-date { letter-spacing:0.5px; }
.vt-prod-day-total { color: var(--ok); font-weight:700; font-size: 12px; }
.vt-prod-day-rows { display:flex; flex-direction:column; gap: 6px; }
.vt-prod-day-row { display:flex; justify-content:space-between; align-items:center; font-family:monospace; font-size:12px; padding: 2px 2px; }
.vt-prod-day-item-name { color: var(--text-muted); }
.vt-prod-day-item-vals { display:flex; gap: 12px; color: var(--text); }
.vt-prod-day-item-vals .vt-prod-sold { color: var(--text-faint); }
 
.vt-ad-tag {
    font-family: monospace; font-size: 10px; font-weight: 800; letter-spacing: 0.5px;
    padding: 2px 7px; border-radius: 4px; white-space: nowrap;
}
.vt-ad-tag.vt-pos { background: rgba(95,167,119,0.14); color: var(--ok); border: 1px solid var(--ok); }
.vt-ad-tag.vt-neg { background: rgba(193,85,74,0.14); color: var(--crit); border: 1px solid var(--crit); }
 
.vt-footer { text-align:center; font-family: monospace; font-size: 10px; color: var(--text-faint); margin-top: 16px; line-height: 1.9; }
.vt-footer-warn { color: var(--crit); }
.vt-loading { text-align:center; padding: 40px 0; color: var(--text-muted); font-family: monospace; font-size: 13px; }
.vt-error { color: var(--crit); font-family: monospace; font-size: 12px; padding: 10px; text-align: center; }
`;
const styleTag = document.createElement('style');
styleTag.textContent = css;
document.head.appendChild(styleTag);
 
// ============================================================
// DOM shell
// ============================================================
const toggleTab = document.createElement('div');
toggleTab.id = 'vt-toggle-tab';
toggleTab.innerHTML = 'DIRECTOR VIEW<div class="vt-tab-dot"></div>';
document.body.appendChild(toggleTab);
 
const root = document.createElement('div');
root.id = 'vt-console-root';
root.innerHTML = `<div id="vt-close-btn">✕</div><div id="vt-content"><div class="vt-loading">Loading company data...</div></div>`;
document.body.appendChild(root);
 
toggleTab.addEventListener('click', () => {
    root.classList.add('open');
    if (!root.dataset.loaded) loadData();
});
root.querySelector('#vt-close-btn').addEventListener('click', () => root.classList.remove('open'));
 
// ============================================================
// Native page injection
// ============================================================
let lastBadgedEmployeeId = null;
 
function getUpNextEmployee() {
    if (!appState.company || !appState.employees || appState.employees.length === 0) return null;
    const trainsAvailable = Math.max(0, parseInt(appState.company.trains, 10) || 0);
    if (trainsAvailable <= 0) return null;
    const rankedQueue = [...appState.employees].sort((a, b) => {
        const aRank = a.effectiveLastTrained ?? a.lastTrained;
        const bRank = b.effectiveLastTrained ?? b.lastTrained;
        if (aRank !== bRank) return aRank - bRank;
        if (a.ee !== b.ee) return a.ee - b.ee;
        return b.daysInCompany - a.daysInCompany;
    });
    return rankedQueue[0] || null;
}
 
function updateTabIndicator() {
    const upNext = isOnCompanyPageNow() ? getUpNextEmployee() : null;
    toggleTab.classList.toggle('vt-has-trainable', !!upNext);
    toggleTab.classList.toggle('vt-sync-error', consecutiveSilentFailures >= CONFIG.SILENT_FAILURE_WARN_THRESHOLD);
}
 
function clearInjectedBadges() {
    document.querySelectorAll('.vt-native-badge').forEach(b => b.remove());
}
 
function isOnCompanyPageNow() {
    const path = window.location.pathname;
    const hash = window.location.hash;
 
    if (path.includes('joblist.php')) return false; 
    if (path.includes('companies.php')) {
        return hash.includes('employees');
    }
    return false;
}
 
function injectEmployeeBadges() {
    if (!isOnCompanyPageNow()) {
        if (lastBadgedEmployeeId !== null || document.querySelector('.vt-native-badge')) {
            clearInjectedBadges();
            lastBadgedEmployeeId = null;
        }
        updateTabIndicator();
        return;
    }
 
    const upNext = getUpNextEmployee(); 
    const targetId = upNext ? upNext.id : null; 
    
    if (targetId === lastBadgedEmployeeId && document.querySelector('.vt-native-badge')) { 
        updateTabIndicator();
        return; 
    } 
    
    clearInjectedBadges(); 
    lastBadgedEmployeeId = targetId; 
    updateTabIndicator();
    if (!upNext) return; 
    
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, { 
        acceptNode: (node) => { 
            if (!node.nodeValue || node.nodeValue.trim() !== upNext.name) return NodeFilter.FILTER_REJECT; 
            if (!node.parentElement) return NodeFilter.FILTER_REJECT; 
            if (node.parentElement.closest('#vt-console-root, #vt-toggle-tab, [id*="torntools" i], [class*="torntools" i], [id*="tt-sidebar" i], [class*="tt-sidebar" i]')) return NodeFilter.FILTER_REJECT; 
            return NodeFilter.FILTER_ACCEPT; 
        } 
    }); 
    
    let node; 
    let injectedCount = 0; 
    while ((node = walker.nextNode()) && injectedCount < 3) { 
        const parent = node.parentElement; 
        if (!parent || parent.querySelector('.vt-native-badge')) continue; 
        const badge = document.createElement('span'); 
        badge.className = 'vt-native-badge'; 
        badge.textContent = '💪 NEXT'; 
        parent.appendChild(badge); 
        injectedCount++; 
    }
}
 
let injectDebounceTimer = null;
const pageObserver = new MutationObserver((mutations) => {
    const relevant = mutations.some(m => {
        const t = m.target;
        return !(t && t.closest && (t.closest('.vt-native-badge') || t.closest('#vt-console-root') || t.closest('#vt-toggle-tab')));
    });
    if (!relevant) return;
    clearTimeout(injectDebounceTimer);
    injectDebounceTimer = setTimeout(() => {
        if (root.dataset.loaded) injectEmployeeBadges();
    }, 400);
});
pageObserver.observe(document.body, { childList: true, subtree: true });
 
window.addEventListener('hashchange', () => {
    if (root.dataset.loaded) {
        setTimeout(() => {
            injectEmployeeBadges();
            updateTabIndicator();
        }, 100);
    }
});
 
loadData();
 
// ============================================================
// Queue Auto Refresh
// ============================================================
const AUTO_REFRESH_INTERVAL_MS = 60 * 1000;
setInterval(() => {
    if (document.visibilityState === 'visible' && root.dataset.loaded) {
        loadData(true);
    }
}, AUTO_REFRESH_INTERVAL_MS);
 
let trainClickRefreshTimer = null;
document.body.addEventListener('click', (e) => {
    const t = e.target;
    if (!t || !t.closest) return;
    if (t.closest('#vt-console-root, #vt-toggle-tab')) return;
    
    const clickable = t.closest('a, button') || t;
    const label = (clickable.textContent || '').trim();
    
    if (label.length > 0 && label.length <= 24 && /\btrain\b/i.test(label)) {
        if (isOnCompanyPageNow()) {
            let targetId = null;
            
            const row = clickable.closest('li, tr, [class*="employee"], .employee-list-wrap');
            if (row) {
                const link = row.querySelector('a[href*="XID="], a[href*="player="]');
                if (link) {
                    const match = link.href.match(/(?:XID|player)=(\d+)/i);
                    if (match) targetId = match[1];
                }
            }
            
            if (!targetId) {
                const nextEmp = getUpNextEmployee();
                if (nextEmp) targetId = nextEmp.id;
            }
 
            if (targetId && appState.employees.length > 0) {
                const emp = appState.employees.find(e => e.id === targetId);
                if (emp) {
                    const nowSecs = Math.floor(Date.now() / 1000);
                    emp.lastTrained = nowSecs;
                    emp.effectiveLastTrained = Math.max(emp.lastTrained, appState.skipOverrides[emp.id] || 0);
                    
                    if (appState.company && appState.company.trains > 0) {
                        appState.company.trains--;
                    }
 
                    const ev = { id: targetId, name: emp.name, timestamp: nowSecs };
                    appState.trainingHistory.push(ev);
                    
                    const historyList = loadTrainingHistory();
                    historyList.push(ev);
                    saveTrainingHistory(historyList);
 
                    render();
                    updateTabIndicator();
                    injectEmployeeBadges();
                }
            }
        }
 
        clearTimeout(trainClickRefreshTimer);
        trainClickRefreshTimer = setTimeout(() => loadData(true), 35000);
    }
}, true);
 
// ============================================================
// INSTANT METRICS SCRAPING ENGINE (BYPASSES CACHE)
// ============================================================
document.body.addEventListener('input', (e) => {
    const t = e.target;
    if (!t || !root.dataset.loaded) return;
 
    // 1. Capture Price Input changes instantly
    if (t.name && t.name.includes('price')) {
        const row = t.closest('li, tr, .stock-item-wrap, [class*="item"]');
        if (row) {
            const nameEl = row.querySelector('[class*="name" i], [class*="title" i], .name, .title, td:first-child, div:first-child');
            if (nameEl) {
                const rawName = nameEl.textContent.trim();
                const cleanPrice = parseInt(t.value.replace(/[^0-9]/g, ''), 10) || 0;
                const match = appState.stock.find(item => item.name === rawName);
                if (match) {
                    match.price = cleanPrice;
                    render();
                }
            }
        }
    }
 
    // 2. Capture Wage input updates instantly
    if (t.name && t.name.includes('wage')) {
        const row = t.closest('li, tr, .employee-list-wrap, [class*="row"]');
        if (row) {
            const link = row.querySelector('a[href*="XID="], a[href*="player="]');
            if (link) {
                const matchXID = link.href.match(/(?:XID|player)=(\d+)/i);
                if (matchXID) {
                    const empId = matchXID[1];
                    const cleanWage = parseInt(t.value.replace(/[^0-9]/g, ''), 10) || 0;
                    const emp = appState.employees.find(e => e.id === empId);
                    if (emp) {
                        emp.wage = cleanWage;
                        render();
                    }
                }
            }
        }
    }
});
 
document.body.addEventListener('click', (e) => {
    const t = e.target;
    if (!t || !root.dataset.loaded) return;
 
    // 3. Captures "Clear All" or "Save Prices" button clicks 
    if (t.closest('input[value*="price" i], button[class*="price" i], .save-prices-btn, [class*="save" i]')) {
        setTimeout(() => {
            document.querySelectorAll('input[name*="price"]').forEach(input => {
                const row = input.closest('li, tr, .stock-item-wrap, [class*="item"]');
                if (row) {
                    const nameEl = row.querySelector('[class*="name" i], [class*="title" i], .name, .title, td:first-child, div:first-child');
                    if (nameEl) {
                        const rawName = nameEl.textContent.trim();
                        const val = parseInt(input.value.replace(/[^0-9]/g, ''), 10) || 0;
                        const match = appState.stock.find(item => item.name === rawName);
                        if (match) match.price = val;
                    }
                }
            });
            render();
        }, 100);
    }
 
    // 4. Captures Advertising Budget Changes (if changed via input/button combo)
    if (t.closest('.advertising-budget-submit, [data-action="save-advertising"], [class*="advertising" i]')) {
        const adInput = document.querySelector('input[name*="advertising"], input[class*="budget" i]');
        if (adInput) {
            const newBudget = parseInt(adInput.value.replace(/[^0-9]/g, ''), 10) || 0;
            if (appState.company) {
                appState.company.advertising_budget = newBudget;
                render();
            }
        }
    }
}, true);
 
// ============================================================
// API helpers
// ============================================================
function apiGet(url) {
    return new Promise((resolve, reject) => {
        GM_xmlhttpRequest({
            method: 'GET',
            url: url,
            onload: function (res) {
                try {
                    const data = JSON.parse(res.responseText);
                    if (data.error) {
                        if ([2, 9, 10, 13, 16].includes(data.error.code)) {
                            GM_setValue('vt_api_key', '');
                            alert("Director View API Error: " + data.error.error + "\nYour key has been cleared. Please refresh the page to enter a new one.");
                        }
                        reject(data.error);
                    }
                    else resolve(data);
                } catch (e) { reject({ error: 'parse_failed', raw: res.responseText }); }
            },
            onerror: function (e) { reject({ error: 'network_failed', detail: e }); }
        });
    });
}
 
async function getGlobalCompanyData() {
    let cached = GM_getValue('vt_global_companies', null);
    let lastFetch = GM_getValue('vt_global_companies_ts', 0);
 
    if (cached && (Date.now() - lastFetch < 7 * 24 * 60 * 60 * 1000)) { 
        try { return JSON.parse(cached); } catch (e) {} 
    } 
    
    try { 
        const data = await apiGet(`https://api.torn.com/torn/?selections=companies&key=${CONFIG.API_KEY}`); 
        if (data && data.companies) { 
            GM_setValue('vt_global_companies', JSON.stringify(data.companies)); 
            GM_setValue('vt_global_companies_ts', Date.now()); 
            return data.companies; 
        } 
    } catch (e) { 
        console.warn("Director View: Could not fetch global company stats", e); 
    } 
    return null; 
}
 
// ============================================================
// Formatting & Export helpers
// ============================================================
function eeBreakdownLabel(e) {
    // Raw work-stat effectiveness isn't always present on older/cached snapshots - bail out cleanly if so.
    if (e.wsRaw === null || e.wsRaw === undefined) return '';
    const parts = [`${e.wsRaw} stat eff`];
    if (e.meritsBonus) parts.push(`+${e.meritsBonus} merits`);
    if (e.settledIn) parts.push(`+${e.settledIn} settled`);
    return parts.join(' / ');
}
 
function firstNum(...candidates) {
    for (const c of candidates) {
        if (typeof c === 'number' && !isNaN(c)) return c;
    }
    return null;
}
 
function minutesSince(timestamp) {
    if (!timestamp) return null;
    return Math.floor((Date.now() / 1000 - timestamp) / 60);
}
 
function lastActiveClass(mins) {
    if (mins === null) return 'vt-warn';
    if (mins <= CONFIG.LAST_ACTIVE_WARN_MINUTES) return 'vt-ok';
    if (mins <= CONFIG.LAST_ACTIVE_CRIT_MINUTES) return 'vt-warn';
    return 'vt-crit';
}
 
function relativeLabel(mins) {
    if (mins === null) return '—';
    if (mins < 60) return `${mins}m`;
    if (mins < 60 * 24) return `${Math.floor(mins / 60)}h`;
    return `${Math.floor(mins / (60 * 24))}d`;
}
 
function addictionClass(val) {
    if (val <= CONFIG.ADDICTION_CRIT) return 'vt-crit';
    if (val <= CONFIG.ADDICTION_WARN) return 'vt-warn';
    return 'vt-ok';
}
 
function getStatHtml(e) {
    const req = appState.positionReqs[e.position];
    const m = e.manual_labor || 0;
    const i = e.intelligence || 0;
    const en = e.endurance || 0;
 
    const mReq = req ? (req.man_required || 0) : 0; 
    const iReq = req ? (req.int_required || 0) : 0; 
    const enReq = req ? (req.end_required || 0) : 0; 
    
    const mCls = (mReq > 0 && m < mReq) ? 'vt-crit' : ''; 
    const iCls = (iReq > 0 && i < iReq) ? 'vt-crit' : ''; 
    const enCls = (enReq > 0 && en < enReq) ? 'vt-crit' : ''; 
    return `MAN <span class="${mCls}">${Number(m).toLocaleString()}</span> / INT <span class="${iCls}">${Number(i).toLocaleString()}</span> / END <span class="${enCls}">${Number(en).toLocaleString()}</span>`; 
}
 
function buildLLMExport() {
    const lines = [];
    lines.push(`COMPANY: ${appState.company.name || '—'} (Day ${appState.company.days_old ?? '—'})`);
    lines.push(`Funds: $${Number(appState.company.funds || 0).toLocaleString()} | Trains: ${appState.company.trains}`);
    lines.push(`Gross Income: $${Number(appState.company.daily_profit || 0).toLocaleString()} | Customers: ${appState.company.daily_customers}`);
    lines.push('');
    lines.push(`EMPLOYEES (${appState.employees.length}):`);
    appState.employees.forEach(e => {
        const wsText = `MAN ${Number(e.manual_labor || 0).toLocaleString()} / INT ${Number(e.intelligence || 0).toLocaleString()} / END ${Number(e.endurance || 0).toLocaleString()}`;
        lines.push(`- ${e.name} | ${e.position || 'no position'} (${e.daysInCompany} days) | EE ${e.ee} | addiction ${e.addiction} | wage $${Number(e.wage || 0).toLocaleString()}/day | last active ${relativeLabel(e.lastActiveMins)} | ${wsText}`);
    });
    return lines.join('\n');
}
 
// ============================================================
// History tracking (Performance graph)
// ============================================================
const HISTORY_KEY = 'vt_console_history_v3'; 
const HISTORY_MAX_POINTS = 30;
 
function saveScrapedHistory(historyList) {
    historyList.sort((a,b) => a.ts - b.ts);
    const seenDays = new Set();
    const clean = [];
 
    for(let i = historyList.length - 1; i >= 0; i--) { 
        const dateKey = new Date(historyList[i].ts).toDateString(); 
        if(!seenDays.has(dateKey)) { 
            seenDays.add(dateKey); 
            clean.unshift(historyList[i]); 
        } 
    } 
    
    if (clean.length > HISTORY_MAX_POINTS) { 
        GM_setValue(HISTORY_KEY, JSON.stringify(clean.slice(-HISTORY_MAX_POINTS))); 
        return clean.slice(-HISTORY_MAX_POINTS); 
    } 
    
    GM_setValue(HISTORY_KEY, JSON.stringify(clean)); 
    return clean; 
}
 
function buildTrendGraph(history) {
    const w = 340, h = 110;
    const paddingLeft = 44, paddingRight = 12, paddingTop = 10, paddingBottom = 10;
 
    const graphWidth = w - paddingLeft - paddingRight; 
    const graphHeight = h - paddingTop - paddingBottom; 
    
    if (history.length < 2) { 
        return `<div class="vt-graph-empty">📊 Gathering financial data...<br><span style="font-size:10px; color:var(--text-faint)">Historical metrics will display here automatically once logs map out.</span></div>`; 
    } 
    
    const activeMaxProfit = Math.max(...history.map(p => p.profit)); 
    const activeMaxCustomers = Math.max(...history.map(p => p.customers)); 
    const maxProfit = activeMaxProfit > 0 ? activeMaxProfit : 1000; 
    const maxCustomers = activeMaxCustomers > 0 ? activeMaxCustomers : 10; 
    const stepX = graphWidth / (history.length - 1); 
    
    const getProfitY = (val) => paddingTop + (graphHeight - ((val / maxProfit) * graphHeight)); 
    const getCustY = (val) => paddingTop + (graphHeight - ((val / maxCustomers) * graphHeight)); 
    
    const profitPoints = history.map((p, i) => ({ x: paddingLeft + i * stepX, y: getProfitY(p.profit) })); 
    const profitLineStr = profitPoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' '); 
    const profitAreaStr = `${profitLineStr} L ${profitPoints[profitPoints.length - 1].x.toFixed(1)} ${(paddingTop + graphHeight).toFixed(1)} L ${profitPoints[0].x.toFixed(1)} ${(paddingTop + graphHeight).toFixed(1)} Z`; 
    
    const custPoints = history.map((p, i) => ({ x: paddingLeft + i * stepX, y: getCustY(p.customers) })); 
    const custLineStr = custPoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' '); 
    const custAreaStr = `${custLineStr} L ${custPoints[custPoints.length - 1].x.toFixed(1)} ${(paddingTop + graphHeight).toFixed(1)} L ${custPoints[0].x.toFixed(1)} ${(paddingTop + graphHeight).toFixed(1)} Z`; 
    
    let dotsHtml = ''; 
    history.forEach((p, i) => { 
        dotsHtml += `<circle cx="${(paddingLeft + i * stepX).toFixed(1)}" cy="${getProfitY(p.profit).toFixed(1)}" r="2.5" fill="#5FA777" stroke="#0A0C10" stroke-width="0.7"/>`; 
        dotsHtml += `<circle cx="${(paddingLeft + i * stepX).toFixed(1)}" cy="${getCustY(p.customers).toFixed(1)}" r="2.5" fill="#5B8AA6" stroke="#0A0C10" stroke-width="0.7"/>`; 
    }); 
    
    const latest = history[history.length - 1]; 
    const compactCurrency = (num) => { 
        if (num >= 1e6) return `$${(num / 1e6).toFixed(1)}M`; 
        if (num >= 1e3) return `$${(num / 1e3).toFixed(0)}K`; 
        return `$${num}`; 
    }; 
    
    return ` 
        <div class="vt-graph-legend"> 
            <div class="vt-legend-group"> 
                <div class="vt-legend-item" style="color: var(--ok)"> 
                    <div class="vt-legend-dot" style="background:var(--ok);"></div> INCOME: $${latest.profit.toLocaleString()} 
                </div> 
                <div class="vt-legend-item" style="color: var(--steel)"> 
                    <div class="vt-legend-dot" style="background:var(--steel);"></div> GUESTS: ${latest.customers.toLocaleString()} 
                </div> 
            </div> 
            <div style="font-family:monospace; font-size:10px; color:var(--text-faint)">${history.length} DAYS RECORDED</div> 
        </div> 
        <svg width="100%" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" style="display:block; overflow:visible;"> 
            <defs> 
                <linearGradient id="g-prof" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#5FA777"/><stop offset="100%" stop-color="#5FA777" stop-opacity="0"/></linearGradient> 
                <linearGradient id="g-cust" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#5B8AA6"/><stop offset="100%" stop-color="#5B8AA6" stop-opacity="0"/></linearGradient> 
            </defs> 
            <line x1="${paddingLeft}" y1="${paddingTop}" x2="${w - paddingRight}" y2="${paddingTop}" stroke="#262B33" stroke-width="0.6" stroke-dasharray="2,3"/> 
            <text x="${paddingLeft - 6}" y="${paddingTop + 3}" class="vt-graph-axis-label">${compactCurrency(maxProfit)}</text> 
            <text x="${w - paddingRight + 4}" y="${paddingTop + 3}" class="vt-graph-axis-label" style="text-anchor:start; fill:var(--steel);">${maxCustomers.toLocaleString()}</text> 
            <line x1="${paddingLeft}" y1="${paddingTop + graphHeight / 2}" x2="${w - paddingRight}" y2="${paddingTop + graphHeight / 2}" stroke="#1F232B" stroke-width="0.6" stroke-dasharray="2,3"/> 
            <text x="${paddingLeft - 6}" y="${paddingTop + graphHeight / 2 + 3}" class="vt-graph-axis-label">${compactCurrency(maxProfit / 2)}</text> 
            <line x1="${paddingLeft}" y1="${paddingTop + graphHeight}" x2="${w - paddingRight}" y2="${paddingTop + graphHeight}" stroke="#262B33" stroke-width="1"/> 
            <text x="${paddingLeft - 6}" y="${paddingTop + graphHeight + 3}" class="vt-graph-axis-label">$0</text> 
            <path d="${profitAreaStr}" fill="url(#g-prof)" opacity="0.1"/> 
            <path d="${profitLineStr}" fill="none" stroke="#5FA777" stroke-width="2" stroke-linejoin="round"/> 
            <path d="${custAreaStr}" fill="url(#g-cust)" opacity="0.08"/> 
            <path d="${custLineStr}" fill="none" stroke="#5B8AA6" stroke-width="1.5" stroke-dasharray="3,1" stroke-linejoin="round"/> 
            ${dotsHtml} 
        </svg> 
    `; 
}
 
// ============================================================
// Company stats history (popularity / efficiency / environment)
// ============================================================
const STATS_HISTORY_KEY = 'vt_company_stats_history_v1';
const STATS_HISTORY_MAX_POINTS = 30;

function saveStatsSnapshot(statsList) {
    statsList.sort((a, b) => a.ts - b.ts);
    const seenDays = new Set();
    const clean = [];

    for (let i = statsList.length - 1; i >= 0; i--) {
        const dateKey = new Date(statsList[i].ts).toDateString();
        if (!seenDays.has(dateKey)) {
            seenDays.add(dateKey);
            clean.unshift(statsList[i]);
        }
    }

    const trimmed = clean.length > STATS_HISTORY_MAX_POINTS ? clean.slice(-STATS_HISTORY_MAX_POINTS) : clean;
    GM_setValue(STATS_HISTORY_KEY, JSON.stringify(trimmed));
    return trimmed;
}

function loadStatsHistory() {
    try { return JSON.parse(GM_getValue(STATS_HISTORY_KEY, '[]')); } catch (e) { return []; }
}

function buildStatsTrendGraph(history) {
    const w = 340, h = 100;
    const paddingLeft = 34, paddingRight = 12, paddingTop = 10, paddingBottom = 10;
    const graphWidth = w - paddingLeft - paddingRight;
    const graphHeight = h - paddingTop - paddingBottom;

    if (history.length < 2) {
        return `<div class="vt-graph-empty">📈 Gathering popularity / efficiency / environment data...<br><span style="font-size:10px; color:var(--text-faint)">This fills in automatically as you keep refreshing over time.</span></div>`;
    }

    const stepX = graphWidth / (history.length - 1);
    const getY = (val) => paddingTop + (graphHeight - ((Math.max(0, Math.min(100, val)) / 100) * graphHeight));

    const series = [
        { key: 'popularity', color: '#C98A4B', label: 'POP' },
        { key: 'efficiency', color: '#5FA777', label: 'EFF' },
        { key: 'environment', color: '#5B8AA6', label: 'ENV' }
    ];

    let pathsHtml = '';
    let dotsHtml = '';
    series.forEach(s => {
        const pts = history.map((p, i) => ({ x: paddingLeft + i * stepX, y: getY(p[s.key] || 0) }));
        const lineStr = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
        pathsHtml += `<path d="${lineStr}" fill="none" stroke="${s.color}" stroke-width="1.8" stroke-linejoin="round"/>`;
        pts.forEach(p => {
            dotsHtml += `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="2.2" fill="${s.color}" stroke="#0A0C10" stroke-width="0.6"/>`;
        });
    });

    const latest = history[history.length - 1];
    const legendHtml = series.map(s => `
        <div class="vt-legend-item" style="color:${s.color}">
            <div class="vt-legend-dot" style="background:${s.color};"></div> ${s.label}: ${Math.round(latest[s.key] || 0)}%
        </div>
    `).join('');

    return `
        <div class="vt-graph-legend">
            <div class="vt-legend-group">${legendHtml}</div>
            <div style="font-family:monospace; font-size:10px; color:var(--text-faint)">${history.length} DAYS RECORDED</div>
        </div>
        <svg width="100%" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" style="display:block; overflow:visible;">
            <line x1="${paddingLeft}" y1="${paddingTop}" x2="${w - paddingRight}" y2="${paddingTop}" stroke="#262B33" stroke-width="0.6" stroke-dasharray="2,3"/>
            <text x="${paddingLeft - 6}" y="${paddingTop + 3}" class="vt-graph-axis-label">100%</text>
            <line x1="${paddingLeft}" y1="${paddingTop + graphHeight / 2}" x2="${w - paddingRight}" y2="${paddingTop + graphHeight / 2}" stroke="#1F232B" stroke-width="0.6" stroke-dasharray="2,3"/>
            <text x="${paddingLeft - 6}" y="${paddingTop + graphHeight / 2 + 3}" class="vt-graph-axis-label">50%</text>
            <line x1="${paddingLeft}" y1="${paddingTop + graphHeight}" x2="${w - paddingRight}" y2="${paddingTop + graphHeight}" stroke="#262B33" stroke-width="1"/>
            <text x="${paddingLeft - 6}" y="${paddingTop + graphHeight + 3}" class="vt-graph-axis-label">0%</text>
            ${pathsHtml}
            ${dotsHtml}
        </svg>
    `;
}

// ============================================================
// Stock snapshot history
// ============================================================
const STOCK_HISTORY_KEY = 'vt_stock_history_v1';
const STOCK_HISTORY_MAX_DAYS = 30;
 
function saveStockSnapshot(snapshotList) {
    snapshotList.sort((a, b) => a.ts - b.ts);
    const seenDays = new Set();
    const clean = [];
 
    for (let i = snapshotList.length - 1; i >= 0; i--) {
        const dateKey = new Date(snapshotList[i].ts).toDateString();
        if (!seenDays.has(dateKey)) {
            seenDays.add(dateKey);
            clean.unshift(snapshotList[i]);
        }
    }
 
    const trimmed = clean.length > STOCK_HISTORY_MAX_DAYS ? clean.slice(-STOCK_HISTORY_MAX_DAYS) : clean;
    GM_setValue(STOCK_HISTORY_KEY, JSON.stringify(trimmed));
    return trimmed;
}
 
function loadStockHistory() {
    try { return JSON.parse(GM_getValue(STOCK_HISTORY_KEY, '[]')); } catch (e) { return []; }
}
 
// NOTE (v3.7.5): Torn's per-item `sold` and `in_stock` counters reset at the
// company's daily reset. If a baseline/latest snapshot pair straddles that
// reset, treating the deltas as monotonic produces either a huge false
// spike (sold appears to crash, inflating "produced") or a false zero
// (both counters near their post-reset floor). We detect the reset by
// checking whether `sold` went backwards, and handle that segment using
// only post-reset figures instead of a naive delta.
//
// NOTE (v3.9.0): This single-reset heuristic only works when the two
// snapshots being compared are ~1 day apart. If they're further apart
// (e.g. the user didn't have the tab open for a few days), more than one
// reset may have occurred in the gap and this function can't detect that
// on its own — the caller (getDailyProductionSeries) is responsible for
// flagging rows as `reset` when the snapshot gap is too large to trust.
function computeItemDeltas(baselineItems, latestItems, compTypeId) {
    const names = new Set([...Object.keys(baselineItems || {}), ...Object.keys(latestItems || {})]);
    const rows = [];
 
    // Add known Torn API company type IDs for raw material producers here to bypass the retail anomaly flag
    // 19 = Mining Corporation, 20 = Oil Rig, 21 = Farm, etc.
    const NON_RETAIL_TYPES = [19, 20, 21]; 
    const isRetail = !NON_RETAIL_TYPES.includes(parseInt(compTypeId, 10));
 
    names.forEach(name => {
        const b = baselineItems[name];
        const l = latestItems[name];
        if (!b || !l) return;
 
        const resetOccurred = (l.sold || 0) < (b.sold || 0);
        let produced, sold, anomaly = false, reset = false;
 
        if (resetOccurred) {
            // A daily reset happened somewhere between these two snapshots.
            // We've lost the pre-reset baseline, so estimate using only
            // what's accumulated since the reset: everything sold plus
            // whatever is still sitting in stock.
            reset = true;
            sold = Math.max(0, l.sold || 0);
            produced = Math.max(0, sold + (l.in_stock || 0));
        } else {
            const soldDelta = (l.sold || 0) - (b.sold || 0);
            const stockDelta = (l.in_stock || 0) - (b.in_stock || 0);
            produced = soldDelta + stockDelta;
 
            // Only apply the manual inventory correction trap to retail companies where large drops are abnormal
            if (isRetail && stockDelta < 0 && Math.abs(stockDelta) > Math.max(soldDelta, 0) * 2 + 10) {
                anomaly = true;
                produced = Math.max(0, soldDelta);
            }
 
            produced = Math.max(0, produced);
            sold = Math.max(0, soldDelta);
        }
 
        rows.push({ name, produced, sold, cost: l.cost || 0, anomaly, reset });
    });
 
    rows.sort((a, b) => b.produced - a.produced);
    return rows;
}
 
// v3.9.0: now flags rows with `reset: true` (and returns `gapDays`) whenever
// consecutive stock snapshots are more than ~1 day apart, since
// computeItemDeltas can only reliably detect a single daily reset. Without
// this, a multi-day gap (e.g. the tab wasn't open for a few days) silently
// produced an undercounted delta with no indication it was unreliable.
function getDailyProductionSeries(maxDays = 7) {
    const history = appState.stockHistory;
    if (!history || history.length < 2) return [];
 
    const days = [];
    for (let i = history.length - 1; i > 0 && days.length < maxDays; i--) {
        const prev = history[i - 1];
        const curr = history[i];
        const gapDays = (curr.ts - prev.ts) / (24 * 60 * 60 * 1000);
        const rows = computeItemDeltas(prev.items, curr.items, appState.company.typeId); 

        // More than ~1 reset could have occurred in this gap — the single-reset
        // heuristic in computeItemDeltas can't be trusted for spans this wide.
        if (gapDays > 1.5) {
            rows.forEach(r => { r.reset = true; });
        }

        const totalProduced = rows.reduce((sum, r) => sum + r.produced, 0);
        const totalSold = rows.reduce((sum, r) => sum + r.sold, 0);
        days.push({ ts: curr.ts, rows, totalProduced, totalSold, gapDays, hasAnomaly: rows.some(r => r.anomaly), hasReset: rows.some(r => r.reset) });
    }
    return days;
}
 
// ============================================================
// Finance breakdown
// ============================================================
// v3.9.0: getStockProduction now aggregates the same per-day series used by
// getDailyProductionSeries instead of diffing two far-apart snapshots
// directly. Previously, "weekly" period diffed a 7-day-old snapshot against
// today in one shot — but computeItemDeltas can only detect a single reset,
// so a week's worth of resets in between silently produced wrong numbers
// that disagreed with the (correctly computed) daily breakdown list further
// down the same tab.
function getStockProduction(period) {
    const history = appState.stockHistory;
    if (!history || history.length < 2) return null;
 
    const daysBack = period === 'weekly' ? 7 : 1;
    const dailySeries = getDailyProductionSeries(daysBack);
    if (dailySeries.length === 0) return null;
 
    const nameMap = {};
    dailySeries.forEach(day => {
        day.rows.forEach(r => {
            if (!nameMap[r.name]) {
                nameMap[r.name] = { name: r.name, produced: 0, sold: 0, cost: r.cost, anomaly: false, reset: false };
            }
            nameMap[r.name].produced += r.produced;
            nameMap[r.name].sold += r.sold;
            nameMap[r.name].anomaly = nameMap[r.name].anomaly || r.anomaly;
            nameMap[r.name].reset = nameMap[r.name].reset || r.reset;
        });
    });
 
    const rows = Object.values(nameMap).sort((a, b) => b.produced - a.produced);
    return {
        rows,
        spanDays: dailySeries.length,
        incomplete: dailySeries.length < daysBack,
        hasAnomaly: rows.some(r => r.anomaly),
        hasReset: rows.some(r => r.reset)
    };
}
 
// v3.9.0: weekly wages/advertising are now scaled to how many days of
// income history are actually available (`days`), instead of always ×7.
// Previously a company with only 1-2 days of profit history in
// appState.history (e.g. right after installing the script) would still
// have a full week of wages/ads subtracted against just 1-2 days of gross
// income, making weekly Net Income look artificially — and inconsistently —
// negative depending on how long the script had been tracking history.
function getFinanceBreakdown(period) {
    const isWeekly = period === 'weekly';
 
    let gross, days;
    if (isWeekly) {
        const recent = appState.history.slice(-7);
        gross = recent.reduce((sum, p) => sum + (p.profit || 0), 0);
        days = recent.length || 1;
    } else {
        gross = appState.company.daily_profit || 0;
        days = 1;
    }
 
    const totalWages = appState.employees.reduce((sum, e) => sum + (e.wage || 0), 0) * days;
 
    const adsAvailable = typeof appState.company.advertising_budget === 'number';
    const ads = adsAvailable ? appState.company.advertising_budget * days : 0;
 
    const production = getStockProduction(period);
    const cogs = production ? production.rows.reduce((sum, r) => sum + Math.max(0, r.produced) * r.cost, 0) : 0;
 
    const net = gross - totalWages - ads - cogs;
 
    return { gross, totalWages, ads, adsAvailable, cogs, hasStock: appState.stock.length > 0, net, production, daysCovered: days };
}
 
// ============================================================
// Training history tracking
// ============================================================
const TRAINING_HISTORY_KEY = 'vt_training_history_log';
const TRAINING_HISTORY_MAX = 500;
 
function loadTrainingHistory() {
    try { return JSON.parse(GM_getValue(TRAINING_HISTORY_KEY, '[]')); } catch (e) { return []; }
}
 
function saveTrainingHistory(events) {
    let trimmed = events;
    if (trimmed.length > TRAINING_HISTORY_MAX) trimmed = trimmed.slice(-TRAINING_HISTORY_MAX);
    GM_setValue(TRAINING_HISTORY_KEY, JSON.stringify(trimmed));
    return trimmed;
}
 
function mergeTrainingEvents(existing, freshEvents) {
    const seenKeys = new Set(existing.map(e => `${e.id}_${e.timestamp}`));
    const merged = existing.slice();
    freshEvents.forEach(ev => {
        const key = `${ev.id}_${ev.timestamp}`;
        if (!seenKeys.has(key)) {
            seenKeys.add(key);
            merged.push(ev);
        }
    });
    merged.sort((a, b) => a.timestamp - b.timestamp);
    return merged;
}
 
// ============================================================
// Advertising elasticity tracking
// ============================================================
// One snapshot per day of {budget, avgCustomers, avgGrossProfit, netProfit}.
// Elasticity compares the current budget against the most recent *different*
// budget on record (not just yesterday), since Torn's numbers take a few
// days to settle after a budget change — comparing same-budget days would
// always show zero delta and hide the actual mROAS.
const AD_HISTORY_KEY = 'vt_ad_history_v1';
const AD_HISTORY_MAX_POINTS = 30;
 
function loadAdHistory() {
    try { return JSON.parse(GM_getValue(AD_HISTORY_KEY, '[]')); } catch (e) { return []; }
}
 
function saveAdHistorySnapshot(adHistoryList) {
    adHistoryList.sort((a, b) => a.ts - b.ts);
    const seenDays = new Set();
    const clean = [];
 
    for (let i = adHistoryList.length - 1; i >= 0; i--) {
        const dateKey = new Date(adHistoryList[i].ts).toDateString();
        if (!seenDays.has(dateKey)) {
            seenDays.add(dateKey);
            clean.unshift(adHistoryList[i]);
        }
    }
 
    const trimmed = clean.length > AD_HISTORY_MAX_POINTS ? clean.slice(-AD_HISTORY_MAX_POINTS) : clean;
    GM_setValue(AD_HISTORY_KEY, JSON.stringify(trimmed));
    return trimmed;
}
 
function calculateAdElasticity(adHistory) {
    if (!adHistory || adHistory.length < 2) return null;
 
    const curr = adHistory[adHistory.length - 1];
    let prev = null;
    for (let i = adHistory.length - 2; i >= 0; i--) {
        if (adHistory[i].budget !== curr.budget) {
            prev = adHistory[i];
            break;
        }
    }
    if (!prev) return null;
 
    const deltaBudget = curr.budget - prev.budget;
    if (deltaBudget === 0) return null;
 
    const deltaGross = curr.avgGrossProfit - prev.avgGrossProfit;
    const deltaCustomers = curr.avgCustomers - prev.avgCustomers;
    const mROAS = deltaGross / deltaBudget;
    const costPerNewCustomer = deltaCustomers > 0 ? deltaBudget / deltaCustomers : null;
    const daysSincePrev = Math.max(1, Math.round((curr.ts - prev.ts) / (24 * 60 * 60 * 1000)));
 
    return {
        prevBudget: prev.budget,
        currBudget: curr.budget,
        deltaBudget,
        deltaGross,
        deltaCustomers,
        mROAS,
        costPerNewCustomer,
        isProfitable: mROAS > 1.0,
        daysSincePrev,
        settled: daysSincePrev >= 3
    };
}
 
// ============================================================
// Skip overrides
// ============================================================
const SKIP_OVERRIDES_KEY = 'vt_skip_overrides';
 
function loadSkipOverrides() {
    try { return JSON.parse(GM_getValue(SKIP_OVERRIDES_KEY, '{}')); } catch (e) { return {}; }
}
 
function saveSkipOverrides(overrides) {
    GM_setValue(SKIP_OVERRIDES_KEY, JSON.stringify(overrides));
}
 
function applyEffectiveTraining(employees, skipOverrides) {
    employees.forEach(emp => {
        const skipTs = skipOverrides[emp.id] || 0;
        emp.skippedAt = skipTs > emp.lastTrained ? skipTs : null;
        emp.effectiveLastTrained = Math.max(emp.lastTrained, skipTs);
    });
}
 
function toggleSkip(employeeId) {
    const overrides = appState.skipOverrides;
    if (overrides[employeeId]) {
        delete overrides[employeeId];
    } else {
        overrides[employeeId] = Math.floor(Date.now() / 1000);
    }
    saveSkipOverrides(overrides);
    applyEffectiveTraining(appState.employees, overrides);
    render();
    updateTabIndicator();
    injectEmployeeBadges();
}
 
// ============================================================
// Advertising Elasticity Analyzer (Finance tab card)
// ============================================================
function buildAdElasticityCard() {
    const fmtMoney = (n) => `$${Math.round(n).toLocaleString()}`;
    const adHistory = appState.adHistory || [];
 
    if (typeof appState.company.advertising_budget !== 'number') {
        return `<div class="vt-graph-empty">📢 Advertising budget isn't exposed by the Torn API for this company type, so elasticity can't be tracked here.</div>`;
    }
 
    if (adHistory.length === 0) {
        return `<div class="vt-graph-empty">📢 Gathering advertising data...<br><span style="font-size:10px; color:var(--text-faint)">Budget/customer snapshots are taken once per refresh cycle.</span></div>`;
    }
 
    const current = adHistory[adHistory.length - 1];
    const elasticity = calculateAdElasticity(adHistory);
 
    let rowsHtml = `
        <div class="vt-finance-row">
            <div class="vt-finance-label">Current Daily Budget</div>
            <div class="vt-finance-value">${fmtMoney(current.budget)}</div>
        </div>
    `;
 
    if (!elasticity) {
        rowsHtml += `<div class="vt-finance-note">No budget change detected yet in recorded history (${adHistory.length} day${adHistory.length === 1 ? '' : 's'} tracked). Elasticity compares your current budget against the last time it was different — change your budget and check back after it settles.</div>`;
        return rowsHtml;
    }
 
    const roasCls = elasticity.isProfitable ? 'vt-pos' : 'vt-neg';
    const roasTagCls = elasticity.isProfitable ? 'vt-pos' : 'vt-neg';
    const roasLabel = elasticity.isProfitable ? 'PROFITABLE SPEND' : 'DIMINISHING RETURNS';
    const custCls = elasticity.deltaCustomers >= 0 ? 'vt-pos' : 'vt-neg';
 
    rowsHtml += `
        <div class="vt-finance-row">
            <div class="vt-finance-label">Budget Change</div>
            <div class="vt-finance-value">${fmtMoney(elasticity.prevBudget)} → ${fmtMoney(elasticity.currBudget)}</div>
        </div>
        <div class="vt-finance-row">
            <div class="vt-finance-label">Est. Customer Yield</div>
            <div class="vt-finance-value ${custCls}">${elasticity.deltaCustomers >= 0 ? '+' : ''}${elasticity.deltaCustomers.toLocaleString()} guests</div>
        </div>
        <div class="vt-finance-row vt-finance-total">
            <div class="vt-finance-label">Marginal ROAS</div>
            <div class="vt-finance-value ${roasCls}" style="display:flex; align-items:center; gap:8px; justify-content:flex-end;">
                ${elasticity.mROAS.toFixed(2)}x
                <span class="vt-ad-tag ${roasTagCls}">${roasLabel}</span>
            </div>
        </div>
    `;
 
    if (elasticity.costPerNewCustomer !== null) {
        rowsHtml += `<div class="vt-finance-note">Cost per new customer: ${fmtMoney(elasticity.costPerNewCustomer)}. ${!elasticity.settled ? `Only ${elasticity.daysSincePrev} day${elasticity.daysSincePrev === 1 ? '' : 's'} since the change — Torn's algorithm can take up to 3 days to settle, so treat this as provisional.` : `Based on ${elasticity.daysSincePrev} days since the last budget change, past the ~3-day settlement window.`}</div>`;
    } else {
        rowsHtml += `<div class="vt-finance-note">Budget increased but customer count didn't rise — likely past your market's saturation point. ${!elasticity.settled ? `Only ${elasticity.daysSincePrev} day${elasticity.daysSincePrev === 1 ? '' : 's'} since the change, so this may still be settling.` : ''}</div>`;
    }
 
    return rowsHtml;
}
 
// ============================================================
// Render
// ============================================================
function render() {
    const content = root.querySelector('#vt-content');
 
    let dynamicContentHtml = ''; 
    const tabs = [{ key: 'roster', label: 'ROSTER' }]; 
    if (appState.stock.length > 0) tabs.push({ key: 'inventory', label: 'INVENTORY' }); 
    tabs.push({ key: 'training', label: 'TRAINING' }); 
    tabs.push({ key: 'finance', label: 'FINANCE' }); 
    
    if (appState.activeTab === 'inventory' && appState.stock.length === 0) { 
        appState.activeTab = 'roster'; 
    } 
    
    const tabHtml = `<div class="vt-view-tabs">${tabs.map(t => `<div class="vt-view-tab ${appState.activeTab === t.key ? 'active' : ''}" data-tab="${t.key}">${t.label}</div>`).join('')}</div>`; 
    
    if (appState.activeTab === 'roster') { 
        let sortedRoster = [...appState.employees]; 
        if (appState.sortMode === 'ee') { 
            sortedRoster.sort((a, b) => a.ee - b.ee); 
        } else if (appState.sortMode === 'inactive') { 
            sortedRoster.sort((a, b) => (b.lastActiveMins || 0) - (a.lastActiveMins || 0)); 
        } else if (appState.sortMode === 'addiction') { 
            sortedRoster.sort((a, b) => a.addiction - b.addiction); 
        } 
        
        const addictionThreshold = getAddictionThreshold();
        const rosterHtml = sortedRoster.map(e => { 
            return ` 
                <div class="vt-employee"> 
                    <div class="vt-emp-top"> 
                        <div> 
                            <div class="vt-emp-name"> 
                                <a href="https://www.torn.com/profiles.php?XID=${e.id}" target="_blank" class="vt-emp-name">${e.name}</a> 
                                <a href="https://www.torn.com/messages.php?action=send&player=${e.id}" target="_blank" class="vt-action-link" title="Message">✉</a> 
                                ${e.addiction <= addictionThreshold ? `<a href="https://www.torn.com/profiles.php?XID=${e.id}" target="_blank" class="vt-action-link-addiction" data-addiction-msg-id="${e.id}" title="Copy addiction warning template, then open profile">💊 MSG</a>` : ''} 
                            </div> 
                            <div class="vt-emp-role">${e.position || ''} · ${e.daysInCompany} days</div> 
                        </div> 
                        <div class="vt-emp-right"> 
                            <div class="vt-last-active ${lastActiveClass(e.lastActiveMins)}">● ${relativeLabel(e.lastActiveMins)}</div> 
                            <div class="vt-ee-col"> 
                                <div class="vt-ee-number">${e.ee}</div> 
                                <div class="vt-ee-breakdown">${eeBreakdownLabel(e)}</div> 
                            </div> 
                        </div> 
                    </div> 
                    <div class="vt-wage">$${Number(e.wage || 0).toLocaleString()}/day · ${getStatHtml(e)}</div> 
                    <div class="vt-pulse-track"> 
                        <div class="vt-pulse-fill" style="width:${Math.min(100, e.ee)}%;"></div> 
                        ${e.addiction < 0 ? `<div class="vt-addiction-tick ${addictionClass(e.addiction)}" style="left:${Math.min(88, Math.max(8, 100 + e.addiction * 3))}%;" data-val="${e.addiction}"></div>` : ''} 
                    </div> 
                </div> 
            `; 
        }).join(''); 
        
        dynamicContentHtml = ` 
            <div class="vt-section-head"><div class="vt-section-title">Performance Records</div></div> 
            <div class="vt-graph-card">${buildTrendGraph(appState.history)}</div> 
            <div class="vt-section-head"><div class="vt-section-title">Popularity / Efficiency / Environment</div></div> 
            <div class="vt-graph-card">${buildStatsTrendGraph(appState.statsHistory)}</div> 
            <div class="vt-section-head"><div class="vt-section-title">Roster</div></div> 
            <div class="vt-sort-row"> 
                <button class="vt-sort-btn ${appState.sortMode === 'ee' ? 'active' : ''}" data-sort="ee">⚠️ Worst EE</button> 
                <button class="vt-sort-btn ${appState.sortMode === 'inactive' ? 'active' : ''}" data-sort="inactive">💤 Most Inactive</button> 
                <button class="vt-sort-btn ${appState.sortMode === 'addiction' ? 'active' : ''}" data-sort="addiction">💊 High Addiction</button> 
            </div> 
            <div class="vt-roster">${rosterHtml}</div> 
            <div class="vt-btn-row"> 
                <div class="vt-action-btn" id="vt-llm-copy">⧉ COPY FOR LLM</div> 
                <div class="vt-action-btn vt-donate-btn" id="vt-donate-btn">💖 DONATE TO DEV</div> 
            </div> 
        `; 
    } else if (appState.activeTab === 'inventory') { 
        const stockHtml = appState.stock.map(item => { 
            const hasCost = item.cost > 0; 
            const profit = item.price - item.cost; 
            const vsRrpPct = item.rrp > 0 ? ((item.price - item.rrp) / item.rrp) * 100 : null; 
            const vsRrpCls = vsRrpPct === null ? '' : (vsRrpPct > 25 ? 'vt-crit' : (vsRrpPct > 10 ? 'vt-warn' : 'vt-ok')); 
            const vsRrpLabel = vsRrpPct === null ? '—' : `${vsRrpPct >= 0 ? '+' : ''}${vsRrpPct.toFixed(0)}%`; 
 
            return ` 
                <div class="vt-stock-item"> 
                    <div class="vt-stock-name">${item.name}</div> 
                    <div class="vt-stock-details"> 
                        <div class="vt-stock-stat"> 
                            <span class="vt-stock-label">VS RRP</span> 
                            <span class="vt-stock-val ${vsRrpCls}">${vsRrpLabel}</span> 
                        </div> 
                        ${hasCost ? `
                        <div class="vt-stock-stat"> 
                            <span class="vt-stock-label">PROFIT</span> 
                            <span class="vt-stock-val" style="color:var(--ok)">+$${profit.toLocaleString()}</span> 
                        </div>` : ''} 
                        <div class="vt-stock-stat"> 
                            <span class="vt-stock-label">PRICE</span> 
                            <span class="vt-stock-val">$${item.price.toLocaleString()}</span> 
                        </div> 
                        <div class="vt-stock-stat"> 
                            <span class="vt-stock-label">QTY</span> 
                            <span class="vt-stock-val ${item.in_stock === 0 ? 'low' : ''}">${item.in_stock.toLocaleString()}</span> 
                        </div> 
                    </div> 
                </div> 
            `; 
        }).join(''); 
        dynamicContentHtml = ` 
            <div class="vt-finance-note" style="margin-bottom:10px;">VS RRP = your price vs Torn's recommended retail price. <span class="vt-ok">green</span> ≤10% over, <span class="vt-warn">amber</span> 10–25%, <span class="vt-crit">red</span> 25%+ over — customers are price-sensitive against RRP. For pubs, stock is produced on demand by your employees (driven by demand, effectiveness, and price) rather than purchased ahead of time, so QTY reflects current sell-through, not a restocking backlog. Check the Finance tab's daily production breakdown to see which items are actually being produced/sold day to day.</div> 
            <div class="vt-stock-list">${stockHtml}</div> 
            <div class="vt-btn-row"> 
                <div class="vt-action-btn" id="vt-debug-stock-copy">🐞 COPY RAW STOCK JSON (debug)</div> 
            </div> 
        `; 
    } else if (appState.activeTab === 'training') { 
        const trainsAvailable = Math.max(0, parseInt(appState.company.trains, 10) || 0); 
        const rankedQueue = [...appState.employees].sort((a, b) => { 
            const aRank = a.effectiveLastTrained ?? a.lastTrained; 
            const bRank = b.effectiveLastTrained ?? b.lastTrained; 
            if (aRank !== bRank) return aRank - bRank; 
            if (a.ee !== b.ee) return a.ee - b.ee; 
            return b.daysInCompany - a.daysInCompany; 
        }); 
        
        const spotlightEmp = (trainsAvailable > 0 && rankedQueue.length > 0) ? rankedQueue[0] : null; 
        const spotlightHtml = spotlightEmp ? ` 
            <div class="vt-spotlight-card"> 
                <div class="vt-spotlight-label">💪 TRAIN NEXT</div> 
                <a href="https://www.torn.com/profiles.php?XID=${spotlightEmp.id}" target="_blank" class="vt-spotlight-name">${spotlightEmp.name}</a> 
                <div class="vt-spotlight-meta">${spotlightEmp.position || 'no position'} · EE ${spotlightEmp.ee} · last trained ${spotlightEmp.lastTrained ? relativeLabel(minutesSince(spotlightEmp.lastTrained)) + ' ago' : 'never'}</div> 
                <div class="vt-spotlight-stats">${getStatHtml(spotlightEmp)}</div> 
                <div> 
                    <a href="https://www.torn.com/profiles.php?XID=${spotlightEmp.id}" target="_blank" class="vt-spotlight-link">OPEN PROFILE →</a> 
                    <button class="vt-skip-btn vt-skip-btn-spotlight" data-skip-id="${spotlightEmp.id}">⏭ SKIP</button> 
                </div> 
            </div> 
        ` : ''; 
        
        let queueHtml = ''; 
        if (rankedQueue.length === 0) { 
            queueHtml = `<div class="vt-graph-empty">No employees on roster.</div>`; 
        } else { 
            rankedQueue.forEach((e, idx) => { 
                if (spotlightEmp && idx === 0) return; 
                
                if (idx === trainsAvailable && trainsAvailable < rankedQueue.length) { 
                    queueHtml += `<div class="vt-queue-divider">ON DECK</div>`; 
                } 
                
                const isTrainableNow = idx < trainsAvailable; 
                const rank = idx + 1; 
                const lastTrainedLabel = e.lastTrained ? `${relativeLabel(minutesSince(e.lastTrained))} ago` : 'never'; 
                const isSkipped = !!e.skippedAt; 
                const skipControl = isSkipped ? `<button class="vt-skip-btn vt-skip-btn-restore" data-skip-id="${e.id}">↺ RESTORE</button>` : `<button class="vt-skip-btn" data-skip-id="${e.id}">⏭ SKIP</button>`; 
                
                queueHtml += ` 
                    <div class="vt-queue-item ${isTrainableNow ? 'active' : 'dimmed'}"> 
                        <div class="vt-queue-rank ${isTrainableNow ? 'active' : ''}">${rank}</div> 
                        <div class="vt-queue-info"> 
                            <div class="vt-queue-info-top"> 
                                <a href="https://www.torn.com/profiles.php?XID=${e.id}" target="_blank" class="vt-queue-name">${e.name}</a> 
                                ${isSkipped ? `<span class="vt-skipped-tag">SKIPPED</span>` : ''} 
                            </div> 
                            <div class="vt-queue-meta">${e.position || 'no position'} · EE ${e.ee} · last trained ${lastTrainedLabel}</div> 
                            <div class="vt-queue-stats">${getStatHtml(e)}</div> 
                        </div> 
                        ${skipControl} 
                    </div> 
                `; 
            }); 
        } 
        
        const trainsNote = trainsAvailable === 0 ? `<div class="vt-queue-empty-note">No trains available right now — this list will activate after your next reset.</div>` : ''; 
        const historySorted = [...appState.trainingHistory].sort((a, b) => b.timestamp - a.timestamp); 
        const historyHtml = historySorted.length > 0 ? historySorted.map(ev => { 
            const liveEmp = appState.employees.find(emp => emp.id === ev.id); 
            const statsHtml = liveEmp ? getStatHtml(liveEmp) : `<span class="vt-text-faint">no longer employed</span>`; 
            const d = new Date(ev.timestamp * 1000); 
            const dateLabel = `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`; 
            
            return ` 
                <div class="vt-history-item"> 
                    <div class="vt-history-top"> 
                        <a href="https://www.torn.com/profiles.php?XID=${ev.id}" target="_blank" class="vt-history-name">${ev.name}</a> 
                        <div class="vt-history-time">${dateLabel}</div> 
                    </div> 
                    <div class="vt-history-stats">${statsHtml}</div> 
                </div> 
            `; 
        }).join('') : `<div class="vt-graph-empty">No training history recorded yet. History builds up locally over time as you refresh.</div>`; 
        
        dynamicContentHtml = ` 
            <div class="vt-section-head"><div class="vt-section-title">Up Next — ${trainsAvailable} Train${trainsAvailable === 1 ? '' : 's'} Available</div></div> 
            ${trainsNote} 
            ${spotlightHtml} 
            <div class="vt-queue-list">${queueHtml}</div> 
            <div class="vt-section-head"><div class="vt-section-title">Training History</div></div> 
            <div class="vt-history-list">${historyHtml}</div> 
        `; 
    } else if (appState.activeTab === 'finance') {
        const period = appState.financePeriod;
        const fx = getFinanceBreakdown(period);
        const netCls = fx.net >= 0 ? 'vt-pos' : 'vt-neg';
 
        let prodHtml = '';
        if (fx.hasStock) {
            if (!fx.production) {
                prodHtml = `<div class="vt-graph-empty">📦 Gathering production data...<br><span style="font-size:10px; color:var(--text-faint)">Stock levels are snapshotted once per refresh cycle — check back after a day or two of Director View being open.</span></div>`;
            } else if (fx.production.rows.length === 0) {
                prodHtml = `<div class="vt-graph-empty">No stock item overlaps between snapshots yet.</div>`;
            } else {
                prodHtml = fx.production.rows.map(r => `
                    <div class="vt-prod-item">
                        <div class="vt-prod-name">${r.name}${r.anomaly ? '<span class="vt-prod-anomaly-tag">⚠ ADJ</span>' : ''}</div>
                        <div class="vt-prod-stats">
                            <div class="vt-prod-stat">
                                <span class="vt-prod-label">PRODUCED</span>
                                <span class="vt-prod-val ${r.anomaly ? 'vt-anomaly' : ''}" style="${r.anomaly ? '' : 'color:var(--ok)'}">${r.produced.toLocaleString()}</span>
                            </div>
                            <div class="vt-prod-stat">
                                <span class="vt-prod-label">SOLD</span>
                                <span class="vt-prod-val">${r.sold.toLocaleString()}</span>
                            </div>
                        </div>
                    </div>
                `).join('');
                if (fx.production.incomplete) {
                    prodHtml += `<div class="vt-finance-note">Only ${fx.production.spanDays} day${fx.production.spanDays === 1 ? '' : 's'} of snapshot history so far — figures will fill out as more days are recorded.</div>`;
                }
                if (fx.production.hasAnomaly) {
                    prodHtml += `<div class="vt-finance-note">⚠ ADJ = a large inventory drop that sales alone can't explain (likely a manual stock correction or restock). Excluded from production/cost estimates.</div>`;
                }
                if (fx.production.hasReset) {
                    prodHtml += `<div class="vt-finance-note">⏳ Some figures span a daily reset and/or a gap of more than a day between refreshes — those numbers are estimated from post-reset counts only, so totals for that window may run low.</div>`;
                }
            }
        }
 
        let dailyProdHtml = '';
        if (fx.hasStock) {
            const dailySeries = getDailyProductionSeries(7);
            if (dailySeries.length === 0) {
                dailyProdHtml = `<div class="vt-graph-empty">📦 Gathering daily production data...<br><span style="font-size:10px; color:var(--text-faint)">Needs at least two days of snapshots — check back tomorrow.</span></div>`;
            } else {
                dailyProdHtml = dailySeries.map(day => {
                    const d = new Date(day.ts);
                    const isToday = new Date().toDateString() === d.toDateString();
                    const dateLabel = isToday ? 'TODAY' : d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
                    const gapNote = day.gapDays > 1.5 ? ` <span class="vt-prod-anomaly-tag">⏳ ${Math.round(day.gapDays)}d gap, est.</span>` : '';
                    const rowsHtml = day.rows.map(r => `
                        <div class="vt-prod-day-row">
                            <span class="vt-prod-day-item-name">${r.name}${r.anomaly ? ' <span class="vt-prod-anomaly-tag">⚠</span>' : ''}</span>
                            <span class="vt-prod-day-item-vals">
                                <span>+${r.produced.toLocaleString()}</span>
                                <span class="vt-prod-sold">sold ${r.sold.toLocaleString()}</span>
                            </span>
                        </div>
                    `).join('');
                    return `
                        <div class="vt-prod-day">
                            <div class="vt-prod-day-head">
                                <span class="vt-prod-day-date">${dateLabel}${gapNote}</span>
                                <span class="vt-prod-day-total">+${day.totalProduced.toLocaleString()} produced</span>
                            </div>
                            <div class="vt-prod-day-rows">${rowsHtml}</div>
                        </div>
                    `;
                }).join('');
            }
        }
 
        dynamicContentHtml = `
            <div class="vt-section-head"><div class="vt-section-title">Profit Breakdown</div></div>
            <div class="vt-finance-toggle">
                <button class="vt-sort-btn ${period === 'daily' ? 'active' : ''}" data-period="daily">DAILY</button>
                <button class="vt-sort-btn ${period === 'weekly' ? 'active' : ''}" data-period="weekly">WEEKLY</button>
            </div>
            <div class="vt-finance-grid">
                <div class="vt-finance-row">
                    <div class="vt-finance-label">Gross Income</div>
                    <div class="vt-finance-value vt-pos">$${Math.round(fx.gross).toLocaleString()}</div>
                </div>
                <div class="vt-finance-row">
                    <div class="vt-finance-label">Total Wages</div>
                    <div class="vt-finance-value vt-neg">-$${Math.round(fx.totalWages).toLocaleString()}</div>
                </div>
                <div class="vt-finance-row">
                    <div class="vt-finance-label">Advertising${fx.adsAvailable ? '' : ' (unavailable via API)'}</div>
                    <div class="vt-finance-value ${fx.ads > 0 ? 'vt-neg' : ''}">${fx.adsAvailable ? '-$' + Math.round(fx.ads).toLocaleString() : '—'}</div>
                </div>
                ${fx.hasStock ? `
                <div class="vt-finance-row">
                    <div class="vt-finance-label">Cost of Goods Produced</div>
                    <div class="vt-finance-value ${fx.cogs > 0 ? 'vt-neg' : ''}">${fx.production ? '-$' + Math.round(fx.cogs).toLocaleString() : '—'}</div>
                </div>` : ''}
                <div class="vt-finance-row vt-finance-total">
                    <div class="vt-finance-label">Net Income After Expenses</div>
                    <div class="vt-finance-value ${netCls}">$${Math.round(fx.net).toLocaleString()}</div>
                </div>
            </div>
            <div class="vt-finance-note">Wages/advertising use current daily payroll × ${fx.daysCovered} (day${fx.daysCovered === 1 ? '' : 's'} of income history currently available${period === 'weekly' && fx.daysCovered < 7 ? ' — will reach 7 as more history is recorded' : ''}). Advertising pulls from the company API when Torn exposes it for your company type. Cost of goods uses each item's current unit cost against units produced this period, since Torn doesn't expose historical cost.</div>
            <div class="vt-section-head"><div class="vt-section-title">📢 Advertising Elasticity</div></div>
            <div class="vt-finance-grid">${buildAdElasticityCard()}</div>
            ${fx.hasStock ? `
            <div class="vt-section-head"><div class="vt-section-title">Stock Production — ${period === 'weekly' ? 'Last 7 Days' : 'Today'}</div></div>
            ${prodHtml}
            <div class="vt-section-head"><div class="vt-section-title">Daily Production Breakdown</div></div>
            ${dailyProdHtml}
            ` : ''}
        `;
    }
    
    const isGlobal = GM_getValue('vt_show_all', false); 
 
    let syncStatusHtml = `LAST SYNC ${new Date().toLocaleTimeString()}`;
    if (consecutiveSilentFailures >= CONFIG.SILENT_FAILURE_WARN_THRESHOLD && appState.lastSyncError) {
        const ageMin = appState.lastSyncErrorTs ? Math.max(0, Math.floor((Date.now() - appState.lastSyncErrorTs) / 60000)) : null;
        syncStatusHtml = `<span class="vt-footer-warn">⚠ SYNC FAILING (${consecutiveSilentFailures}x) — ${appState.lastSyncError}${ageMin !== null ? ' · ' + ageMin + 'm ago' : ''}</span>`;
    }
 
    content.innerHTML = ` 
        <div class="vt-header-row"> 
            <div id="vt-refresh-btn">↻ REFRESH</div> 
        </div> 
        <div class="vt-status-strip"> 
            <div> 
                <div class="vt-company-name">${appState.company.name || 'Company'}</div> 
                <div class="vt-company-sub">DAY ${appState.company.days_old || '?'}</div> 
            </div> 
            <div class="vt-metrics"> 
                <div><div class="vt-metric-label">Trains</div><div class="vt-metric-value ${appState.company.trains > 0 ? 'vt-warn' : 'vt-text-faint'}">${appState.company.trains}</div></div> 
                <div><div class="vt-metric-label">Funds</div><div class="vt-metric-value vt-brass">$${Number(appState.company.funds || 0).toLocaleString()}</div></div> 
            </div> 
        </div> 
        <div class="vt-performance"> 
            <div class="vt-perf-chip"><div class="vt-perf-label">Gross Income</div><div class="vt-perf-value vt-steel" style="color:var(--ok);">$${Number(appState.company.daily_profit || 0).toLocaleString()}</div></div> 
            <div class="vt-perf-chip"><div class="vt-perf-label">Daily Guests</div><div class="vt-perf-value vt-brass">${Number(appState.company.daily_customers || 0).toLocaleString()}</div></div> 
            <div class="vt-perf-chip"><div class="vt-perf-label">Weekly Forecast</div><div class="vt-perf-value" style="color:var(--steel);">$${Number(appState.company.weekly_profit || 0).toLocaleString()}</div></div> 
        </div> 
        ${tabHtml} 
        ${dynamicContentHtml} 
        <div class="vt-footer"> 
            ${syncStatusHtml}<br> 
            <a href="#" id="vt-toggle-global" style="color:var(${isGlobal ? '--ok' : '--text-faint'}); text-decoration:none;">TAB ON ALL PAGES: ${isGlobal ? 'ON' : 'OFF'}</a> &nbsp;·&nbsp; 
            <a href="#" id="vt-edit-addiction-threshold" style="color:var(--text-faint); text-decoration:none;">ADDICTION THRESHOLD: ${getAddictionThreshold()}</a> &nbsp;·&nbsp; 
            <a href="#" id="vt-edit-addiction-template" style="color:var(--text-faint); text-decoration:none;">EDIT MSG TEMPLATE</a> &nbsp;·&nbsp; 
            <a href="#" id="vt-reset-key" style="color:var(--text-faint); text-decoration:none;">RESET API KEY</a> 
        </div> 
    `; 
 
    content.querySelectorAll('.vt-view-tab').forEach(btn => { 
        btn.addEventListener('click', (e) => { 
            appState.activeTab = e.target.getAttribute('data-tab'); 
            render(); 
        }); 
    }); 
    
    content.querySelectorAll('.vt-sort-btn[data-sort]').forEach(btn => { 
        btn.addEventListener('click', (e) => { 
            const type = e.target.getAttribute('data-sort'); 
            appState.sortMode = appState.sortMode === type ? 'default' : type; 
            render(); 
        }); 
    }); 
 
    content.querySelectorAll('.vt-sort-btn[data-period]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            appState.financePeriod = e.target.getAttribute('data-period');
            render();
        });
    });
    
    content.querySelectorAll('.vt-skip-btn').forEach(btn => { 
        btn.addEventListener('click', (e) => { 
            const id = e.currentTarget.getAttribute('data-skip-id'); 
            if (id) toggleSkip(id); 
        }); 
    }); 
 
    content.querySelectorAll('[data-addiction-msg-id]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const id = e.currentTarget.getAttribute('data-addiction-msg-id');
            const emp = appState.employees.find(x => x.id === id);
            if (!emp) return;
            navigator.clipboard.writeText(buildAddictionMessage(emp)).catch(() => {});
        });
    });
    
    const llmBtn = content.querySelector('#vt-llm-copy'); 
    if (llmBtn) { 
        llmBtn.addEventListener('click', (e) => { 
            navigator.clipboard.writeText(buildLLMExport()).then(() => { 
                const btn = e.target; 
                btn.textContent = '✓ COPIED'; 
                btn.classList.add('copied'); 
                setTimeout(() => { 
                    btn.textContent = '⧉ COPY FOR LLM'; 
                    btn.classList.remove('copied'); 
                }, 2000); 
            }); 
        }); 
    } 
    
    const donateBtn = content.querySelector('#vt-donate-btn'); 
    if (donateBtn) { 
        donateBtn.addEventListener('click', () => { 
            window.open("https://www.torn.com/profiles.php?XID=3259546&action=sendmoney", "_blank"); 
        }); 
    } 
 
    const debugStockBtn = content.querySelector('#vt-debug-stock-copy'); 
    if (debugStockBtn) { 
        debugStockBtn.addEventListener('click', (e) => { 
            const raw = appState.rawStockDebug || {}; 
            navigator.clipboard.writeText(JSON.stringify(raw, null, 2)).then(() => { 
                const btn = e.target; 
                const original = btn.textContent; 
                btn.textContent = '✓ COPIED — paste it to Claude'; 
                btn.classList.add('copied'); 
                setTimeout(() => { 
                    btn.textContent = original; 
                    btn.classList.remove('copied'); 
                }, 2500); 
            }); 
        }); 
    } 
    
    const refreshBtn = content.querySelector('#vt-refresh-btn'); 
    refreshBtn.addEventListener('click', () => { 
        refreshBtn.classList.add('spinning'); 
        refreshBtn.textContent = '↻ SYNCING...'; 
        loadData(); 
    }); 
    
    const resetBtn = content.querySelector('#vt-reset-key'); 
    if (resetBtn) { 
        resetBtn.addEventListener('click', (e) => { 
            e.preventDefault(); 
            if (confirm("Are you sure you want to clear your saved API key?")) { 
                GM_setValue('vt_api_key', ''); 
                alert("API Key cleared. Please refresh the page to enter a new one."); 
            } 
        }); 
    } 
    
    const toggleGlobalBtn = content.querySelector('#vt-toggle-global'); 
    if (toggleGlobalBtn) { 
        toggleGlobalBtn.addEventListener('click', (e) => { 
            e.preventDefault(); 
            const currentState = GM_getValue('vt_show_all', false); 
            GM_setValue('vt_show_all', !currentState); 
            render(); 
            if (!currentState) { 
                alert("Director View enabled globally! The tab will now appear on all Torn pages."); 
            } else { 
                alert("Director View restricted. The tab will now ONLY appear on company management pages."); 
            } 
        }); 
    } 
 
    const editThresholdBtn = content.querySelector('#vt-edit-addiction-threshold');
    if (editThresholdBtn) {
        editThresholdBtn.addEventListener('click', (e) => {
            e.preventDefault();
            const current = getAddictionThreshold();
            const input = prompt("Show the 💊 MSG button for employees at or below this addiction value:\n(e.g. -3 means anyone at -3, -4, -5... gets flagged)", current);
            if (input === null) return;
            const parsed = parseInt(input, 10);
            if (!Number.isFinite(parsed) || parsed > 0) {
                alert("Please enter a negative number (or 0).");
                return;
            }
            GM_setValue(ADDICTION_THRESHOLD_KEY, parsed);
            render();
        });
    }
 
    const editTemplateBtn = content.querySelector('#vt-edit-addiction-template');
    if (editTemplateBtn) {
        editTemplateBtn.addEventListener('click', (e) => {
            e.preventDefault();
            const current = getAddictionTemplate();
            const input = prompt("Edit the addiction warning message.\nUse {name} and {addiction} as placeholders — they'll be swapped in automatically.", current);
            if (input === null) return;
            if (input.trim().length === 0) {
                alert("Template can't be empty.");
                return;
            }
            GM_setValue(ADDICTION_TEMPLATE_KEY, input);
            render();
        });
    }
}
 
// ============================================================
// Main load
// ============================================================
async function loadData(silent = false) {
    if (isLoadingData) return;
    isLoadingData = true;
    const content = root.querySelector('#vt-content');
    
    if (!silent) {
        content.innerHTML = `<div class="vt-loading">Loading company data...</div>`;
    }
    
    try {
        const [raw, globalCompanies] = await Promise.all([
            apiGet(`https://api.torn.com/company/?selections=profile,employees,detailed,stock,news&key=${CONFIG.API_KEY}`),
            getGlobalCompanyData()
        ]);
 
        const detailed = raw.detailed || raw.company_detailed || {}; 
        const compProfile = raw.company || {}; 
        const compTypeId = parseInt(raw.company_type || compProfile.company_type, 10);

        const trainsAvail = parseInt( 
            raw.company_detailed?.trains_available ?? 
            raw.company_detailed?.trains ?? 
            raw.company?.trains_available ?? 
            raw.company?.trains ?? 
            raw.detailed?.trains_available ?? 
            raw.detailed?.trains ?? 
            detailed.trains_available ?? 
            detailed.trains ?? 
            raw.trains_available ?? 
            raw.trains ?? 0, 10
        ) || 0; 
        
        let parsedProfit = detailed.daily_profit ?? detailed.profit ?? compProfile.daily_profit ?? 0; 
        let parsedCustomers = detailed.daily_customers ?? detailed.customers ?? compProfile.daily_customers ?? 0; 
        let parsedWeeklyForecast = detailed.weekly_profit ?? compProfile.weekly_profit ?? 0; 
 
        const adsRaw = detailed.advertising_budget ?? detailed.daily_advertising_budget ?? compProfile.advertising_budget ?? raw.advertising_budget;
        const parsedAds = (typeof adsRaw === 'number') ? adsRaw : undefined; 
        
        let discoveredRecords = []; 
        const newsRaw = raw.company_news || raw.news || {}; 
        const newsVals = Object.values(newsRaw); 
        
        newsVals.forEach(n => { 
            const text = n.news || ""; 
            if (text.includes("customers and made a gross income of")) { 
                const matchCust = text.match(/total of ([\d,]+) customers/i); 
                const matchIncome = text.match(/gross income of \$([\d,]+)/i); 
                if (matchCust && matchIncome) { 
                    const cNum = parseInt(matchCust[1].replace(/,/g, ''), 10) || 0; 
                    const pNum = parseInt(matchIncome[1].replace(/,/g, ''), 10) || 0; 
                    discoveredRecords.push({ ts: n.timestamp * 1000, profit: pNum, customers: cNum }); 
                } 
            } 
        }); 
        
        let persistentHistory = []; 
        try { 
            persistentHistory = JSON.parse(GM_getValue(HISTORY_KEY, '[]')); 
        } catch(e) {} 
        
        let mergedHistory = [...persistentHistory, ...discoveredRecords]; 
        appState.history = saveScrapedHistory(mergedHistory); 
        
        if (appState.history.length > 0) { 
            const freshestRecord = appState.history[appState.history.length - 1]; 
            parsedProfit = freshestRecord.profit; 
            parsedCustomers = freshestRecord.customers; 
            
            let capturedProfitSum = 0; 
            const recentSamples = appState.history.slice(-7); 
            recentSamples.forEach(p => { 
                capturedProfitSum += p.profit; 
            }); 
            parsedWeeklyForecast = capturedProfitSum; 
        } 
        
        appState.company = { 
            typeId: compTypeId,
            name: raw.name || raw.company_name || compProfile.name, 
            days_old: raw.days_old !== undefined ? raw.days_old : (compProfile.days_old || 0), 
            funds: detailed.company_bank || raw.till || raw.funds || 0, 
            efficiency: detailed.efficiency, 
            popularity: detailed.popularity, 
            environment: detailed.environment, 
            trains: trainsAvail, 
            daily_profit: parsedProfit, 
            weekly_profit: parsedWeeklyForecast, 
            daily_customers: parsedCustomers,
            advertising_budget: parsedAds
        }; 
        
        let persistentStatsHistory = loadStatsHistory();
        persistentStatsHistory.push({
            ts: Date.now(),
            popularity: appState.company.popularity || 0,
            efficiency: appState.company.efficiency || 0,
            environment: appState.company.environment || 0
        });
        appState.statsHistory = saveStatsSnapshot(persistentStatsHistory);

        appState.positionReqs = {}; 
        
        if (globalCompanies && compTypeId && globalCompanies[compTypeId]) { 
            appState.positionReqs = globalCompanies[compTypeId].positions || {}; 
        } else if (globalCompanies) { 
            const employeesRaw = raw.company_employees || raw.employees || {}; 
            const employeeVals = Object.values(employeesRaw); 
            const samplePos = (employeeVals.length > 0 && employeeVals[0]) ? employeeVals[0].position : null; 
            if (samplePos) { 
                for (let id in globalCompanies) { 
                    if (globalCompanies[id].positions && globalCompanies[id].positions[samplePos]) { 
                        appState.positionReqs = globalCompanies[id].positions; 
                        break; 
                    } 
                } 
            } 
        } 
        
        const employeesRaw = raw.company_employees || raw.employees || {}; 
        const employeeIds = Object.keys(employeesRaw); 
        
        appState.employees = employeeIds.map(id => { 
            const e = employeesRaw[id]; 
            const addiction = (e.effectiveness && typeof e.effectiveness.addiction === 'number') ? e.effectiveness.addiction : (e.addiction || 0); 
            const ee = (e.effectiveness && typeof e.effectiveness.total === 'number') ? e.effectiveness.total : (e.effectiveness_ee || e.ee || 0); 
            const eff = e.effectiveness || {}; 
            // Confirmed against a live Torn API payload: working_stats / settled_in / merits. 
            const wsRaw = firstNum(eff.working_stats, eff.job, eff.stats); 
            const meritsBonus = firstNum(eff.merits) || 0; 
            const settledIn = firstNum(eff.settled_in) || 0; 
            const wage = e.wage !== undefined ? e.wage : (e.salary || 0); 
            
            let lastActiveMins = null; 
            if (e.last_action && e.last_action.timestamp) { 
                lastActiveMins = minutesSince(e.last_action.timestamp); 
            } 
            
            return { 
                id, 
                name: e.name || `#${id}`, 
                position: e.position || '', 
                ee, 
                wsRaw, 
                meritsBonus, 
                settledIn, 
                addiction, 
                wage, 
                daysInCompany: e.days_in_company || 0, 
                lastActiveMins: lastActiveMins, 
                manual_labor: e.manual_labor || 0, 
                intelligence: e.intelligence || 0, 
                endurance: e.endurance || 0, 
                lastTrained: 0 
            }; 
        }); 
        
        const newTrainingEvents = []; 
        newsVals.forEach(n => { 
            const txtLower = (n.news || "").toLowerCase(); 
            if (txtLower.includes("trained by the director")) { 
                let matchedId = null; 
                let matchedName = null; 
                const idMatch = n.news.match(/XID=(\d+)/i); 
                if (idMatch && idMatch[1]) { 
                    matchedId = idMatch[1]; 
                    const emp = appState.employees.find(e => e.id === matchedId); 
                    matchedName = emp ? emp.name : `#${matchedId}`; 
                } else { 
                    const emp = appState.employees.find(e => txtLower.includes(e.name.toLowerCase())); 
                    if (emp) { 
                        matchedId = emp.id; 
                        matchedName = emp.name; 
                    } 
                } 
                
                if (matchedId) { 
                    newTrainingEvents.push({ id: matchedId, name: matchedName, timestamp: n.timestamp }); 
                } 
            } 
        }); 
        
        const existingTrainingHistory = loadTrainingHistory(); 
        const mergedTrainingHistory = mergeTrainingEvents(existingTrainingHistory, newTrainingEvents); 
        saveTrainingHistory(mergedTrainingHistory); 
        appState.trainingHistory = mergedTrainingHistory; 
        
        const lastTrainedMap = {}; 
        mergedTrainingHistory.forEach(ev => { 
            if (!lastTrainedMap[ev.id] || ev.timestamp > lastTrainedMap[ev.id]) { 
                lastTrainedMap[ev.id] = ev.timestamp; 
            } 
        }); 
        
        appState.employees.forEach(emp => { 
            if (lastTrainedMap[emp.id]) { 
                emp.lastTrained = lastTrainedMap[emp.id]; 
            } 
        }); 
        
        const skipOverrides = loadSkipOverrides(); 
        appState.skipOverrides = skipOverrides; 
        applyEffectiveTraining(appState.employees, skipOverrides); 
        
        let overridesChanged = false; 
        Object.keys(skipOverrides).forEach(id => { 
            const emp = appState.employees.find(e => e.id === id); 
            if (!emp || emp.lastTrained >= skipOverrides[id]) { 
                delete skipOverrides[id]; 
                overridesChanged = true; 
            } 
        }); 
        
        if (overridesChanged) saveSkipOverrides(skipOverrides); 
        
        const stockRaw = raw.company_stock || raw.stock || {}; 
        const stockItems = Object.keys(stockRaw); 
        
        appState.stock = stockItems.map(itemNameKey => { 
            const itemData = stockRaw[itemNameKey];
            return { 
                id: itemNameKey,
                name: itemNameKey, 
                cost: itemData.cost || 0, 
                rrp: itemData.rrp || 0, 
                price: itemData.price || 0, 
                in_stock: itemData.in_stock || 0, 
                on_order: itemData.on_order || 0, 
                sold: itemData.sold_amount || 0 
            }; 
        }); 
        
        appState.stock.sort((a, b) => a.name.localeCompare(b.name)); 
        appState.rawStockDebug = stockRaw;
 
        if (appState.stock.length > 0) {
            const snapshotItems = {};
            appState.stock.forEach(item => {
                snapshotItems[item.name] = { in_stock: item.in_stock, sold: item.sold, cost: item.cost };
            });
            let persistentStockHistory = loadStockHistory();
            persistentStockHistory.push({ ts: Date.now(), items: snapshotItems });
            appState.stockHistory = saveStockSnapshot(persistentStockHistory);
        } else {
            appState.stockHistory = [];
        }
 
        // Advertising elasticity: one snapshot per day, using the same
        // net-income figure the Finance tab already computes (daily period)
        // so the elasticity card never disagrees with the profit breakdown.
        if (typeof appState.company.advertising_budget === 'number') {
            const dailyFx = getFinanceBreakdown('daily');
            let persistentAdHistory = loadAdHistory();
            persistentAdHistory.push({
                ts: Date.now(),
                budget: appState.company.advertising_budget,
                avgCustomers: appState.company.daily_customers || 0,
                avgGrossProfit: appState.company.daily_profit || 0,
                netProfit: dailyFx.net
            });
            appState.adHistory = saveAdHistorySnapshot(persistentAdHistory);
        } else {
            appState.adHistory = loadAdHistory();
        }
 
        consecutiveSilentFailures = 0;
        appState.lastSyncError = null;
        appState.lastSyncErrorTs = null;
        appState.lastSyncOkTs = Date.now();
        
        render(); 
        root.dataset.loaded = 'true'; 
        updateTabIndicator(); 
        injectEmployeeBadges(); 
        
    } catch (err) { 
        const errorText = err.error || err.error_code || JSON.stringify(err); 
 
        if (silent) {
            consecutiveSilentFailures++;
            appState.lastSyncError = errorText;
            appState.lastSyncErrorTs = Date.now();
            if (consecutiveSilentFailures >= CONFIG.SILENT_FAILURE_WARN_THRESHOLD) {
                updateTabIndicator();
                if (root.classList.contains('open')) render();
            }
        } else { 
            content.innerHTML = ` 
                <div class="vt-error" style="padding: 20px; text-align: center;"> 
                    <div style="font-size: 14px; margin-bottom: 10px; color: var(--text);">Failed to load company data.</div> 
                    <div style="color: var(--crit); margin-bottom: 20px; font-family: monospace;">API Error: ${errorText}</div> 
                    <button id="vt-error-reset-btn" style="background: var(--panel-raised); border: 1px solid var(--hairline); color: var(--text); padding: 8px 16px; border-radius: 6px; cursor: pointer; font-family: monospace; font-size: 11px;">🔄 RESET API KEY</button> 
                </div> 
            `; 
            content.querySelector('#vt-error-reset-btn').addEventListener('click', () => { 
                GM_setValue('vt_api_key', ''); 
                alert("API Key cleared. Please refresh the page to enter a new one."); 
                window.location.reload(); 
            }); 
        } 
        console.error('Director View error:', err); 
    } finally { 
        isLoadingData = false; 
    } 
}
 
})();
