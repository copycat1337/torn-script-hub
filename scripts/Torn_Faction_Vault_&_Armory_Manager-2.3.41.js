// ==UserScript==
// @name         Torn Faction Vault & Armory Manager
// @namespace    torn-fvam-v1
// @version      2.3.41
// @description  Faction vault & armory dashboard — vault breakdown, consumable stock alerts, weapon/armor loan tracking, analytics, donation log
// @author       TheOddSod [2640064]
// @match        https://www.torn.com/factions.php*
// @match        https://www.torn.com/item.php*
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addStyle
// @connect      api.torn.com
// @downloadURL https://update.greasyfork.org/scripts/574375/Torn%20Faction%20Vault%20%20Armory%20Manager.user.js
// @updateURL https://update.greasyfork.org/scripts/574375/Torn%20Faction%20Vault%20%20Armory%20Manager.meta.js
// ==/UserScript==
//
// ── CHANGELOG ────────────────────────────────────────────────────────────────
//
// v2.3.41 — 2026-08-23
//   • Fix: v2.3.40's v1 fallback retried the entire combined selection string
//     (e.g. "balance,drugs,medical,boosters,temporary") on v1 whenever ANY one
//     of those selections got kicked back to v1-only — but 'balance' and
//     'members' have no v1 equivalent, so that fallback then failed with
//     error 23 ("only available in API v2"). apiCall() now fetches every
//     selection in a group individually (apiCallOne), falling each one back
//     to v1 in isolation only if it specifically needs it, then merges the
//     results. A v1/v2 mismatch on one selection can no longer take a sibling
//     selection down with it in either direction.
//
// v2.3.40 — 2026-08-23
//   • Fix: apiCall() now transparently falls back to the v1 endpoint when Torn's
//     v2 API returns error 22 ("This selection is only available in API v1") for
//     any faction selection. Torn periodically un-migrates/re-restricts v2
//     selections without warning; previously this surfaced as a hard "API error
//     / Error 22" in the dashboard with no data loading at all. New apiCallV1()
//     helper retries the failed selection against https://api.torn.com/faction/
//     and returns that response instead — normalise() already handles both v1's
//     object-keyed and v2's array-keyed shapes, so no downstream parsing changes
//     were needed.
//
// v2.3.39 — 2026-07-04
//   Polish: Full Design_details_II specification pass — purely cosmetic, no
//           functional changes. Specifically:
//           • Default colour theme changed from dark-blue (OCM palette) to
//             grey/amber matching the shared Torn script design system. This
//             is a visible change for existing users; all 8 themes remain
//             selectable in Config. Other themes' FVAM extension tokens
//             (status-info, status-warn-alt etc.) updated to match each
//             theme's own palette rather than the old dark-blue defaults.
//           • CSS reset added (:where box-sizing + margin/padding zero).
//           • Root: no border, no box-shadow, margin 12px 0 (was margin-
//             bottom:16px with border + box-shadow).
//           • Header: padding 10px 14px (was 9px), title is now a
//             .fvam-title span at 15px bold (was h2 at 13px).
//           • Card headers: left 3px accent border + uppercase 12px section
//             title (was accent-coloured text at 11.5px, no border).
//           • Body padding: 16px 14px desktop, 8px mobile (was 10px flat).
//           • Mobile breakpoint: 700px (was 600px).
//           • Font family: system-ui stack (was Arial only).
//           • Button primary style: accent background, bg-deep text (was
//             accent-hover background, white text).
//           • Metadata: @namespace, @author [2640064], URL alignment fixed.
//
// v2.3.38 — 2026-06-19
//   • Loan Summary (Analytics tab) now groups each member's loaned weapons by
//     slot — Primary / Secondary / Melee — plus a separate Armor group, instead
//     of one flat item list. Makes it easy to spot a member holding two items
//     in the same weapon slot (e.g. 2x Primary), which can mean a bonus weapon
//     is being sat on instead of being available to whoever needs it.
//   • New passive DOM scraper reads per-copy weapon/armor bonus info (e.g.
//     "Warlord 16%") from the Armoury Weapons/Armor sub-tabs as you browse
//     them, caching it locally per armoury copy ID. No extra network calls —
//     this data isn't exposed by the Torn API, only by the page itself, and
//     only while that specific sub-tab is visible. Loan Summary shows the
//     bonus next to each item once it's been seen; un-scraped items show name
//     only until you visit the relevant sub-tab.
//   • Members holding 2+ items in the same weapon slot get an inline
//     stockpile warning badge (e.g. "⚠ Primary x2") in Loan Summary.
//
// v2.3.37 — 2026-06-19
//   • Fixed: item/member links added in v2.3.36 were rendering in the
//     browser's default blue instead of inheriting the surrounding text
//     colour, making them hard to read against dark rows (e.g. OC Item
//     Requirements, Low Stock block). Added a single global link rule so
//     all links keep normal text colour and only show the accent colour
//     on hover.
//
// v2.3.36 — 2026-06-19
//   • Full 8-theme colour system added (Default, Torn Classic, High Contrast,
//     Deuteranopia, Protanopia, Tritanopia, Low Vision, Light Mode), matching
//     the shared OCM design system. Every background, border, text, and status
//     colour in the dashboard now uses --fvam-* CSS variables instead of
//     hardcoded hex values. New theme selector at the top of the Config tab.
//   • Item names throughout the dashboard now link to the Torn item market
//     (Vault tab consumables, Armory tab weapons/armor/utilities/loot,
//     Analytics Stock Alerts, OC Item Requirements, Unnecessary Utility Loans,
//     Loan Summary).
//   • Member names not already linked now link to their Torn profile (vault
//     current/ex-member deposit tables, Loan Summary borrower names, donation
//     log donor names).
//
// v2.3.35 — 2026-06-01
//   • Config: OC Item Stock Thresholds section is now collapsible — collapsed
//     by default so the config panel isn't overwhelmed by long utility item
//     lists. Click the header to expand/collapse. State is not persisted
//     (always starts collapsed) since it's a rarely-edited section.
//
// v2.3.34 — 2026-06-01
//   • Config: new "OC Item Stock Thresholds" section — group default minimum
//     (default 5) plus per-item overrides for each utility armory item.
//     Thresholds are stored in cfg.ocItemMinimums (per-item) and
//     cfg.ocGroupMinimum (group default).
//   • Analytics: OC Item Requirements card now shows a stock warning block
//     at the top when any utility item has fewer available copies (not on
//     loan) than its threshold. Each row shows item name, available count,
//     threshold, and how many are currently on loan — sorted by most critical
//     first (lowest available/threshold ratio).
//   • Analytics: OC Item Requirements card header badge now also reflects
//     stock alert count alongside unconfirmed slot count.
//
// v2.3.33 — 2026-06-01
//   • Vault: true faction funds now calculated correctly using the v2 API
//     /faction/balance endpoint with cat=current and cat=all parameters.
//     cat=all returns every depositor including ex-members; cat=current returns
//     only current members. Comparing the two sets gives us:
//       - True faction funds  = faction.money (all) − sum of ALL member balances
//       - Ex-member deposits  = sum of balances for IDs in all but not in current
//       - Current deposits    = sum from cat=current members
//     This replaces the previous arithmetic fallback and gives exact figures
//     matching what Torn's own Controls page displays.
//   • Vault: "Faction + Ex-Members" tile reverted to "Faction Funds" now that
//     we have the true figure. Tile sub-label reads "faction-owned funds".
//   • Vault: Vault Breakdown card now shows Current Member Deposits and
//     Ex-Member Deposits as separate labelled rows when ex-members exist.
//   • Vault: Current Member Deposits card table uses cat=current member list.
//   • fetchAll: added fourth balance call (cat=all) before the existing
//     balance,drugs,medical,boosters,temporary call; parseVault updated to
//     accept both responses and compute the three-way split.
//
// v2.3.32 — 2026-06-01
//   • Vault: renamed "Faction Funds" to "Faction + Ex-Members" to reflect API
//     limitation (reverted in v2.3.33 now that cat=all is available).
//   • Removed Controls page scrape infrastructure from v2.3.31.
//
// v2.3.31 — 2026-06-01
//   • Vault: attempted Controls page scrape for true faction funds (reverted in v2.3.32).
//
// v2.3.30 — 2026-05-31
//   • Vault: simplified to three authoritative figures:
//     1. Total vault = fac.money from API
//     2. Current member deposits = sum of balances for IDs in current members list
//     3. Ex-member/unidentified deposits = total - faction funds - current member deposits
//     No longer attempts to identify individual ex-members; the balancing figure
//     is derived purely from arithmetic.
//
// v2.3.29 — 2026-05-31
//   • Vault: totalVault is now recalculated as factionFunds + allMemberDeposits
//     in categoriseDeposits() rather than using fac.money directly from parseVault.
//
// v2.3.28 — 2026-05-31
//   • Vault: categoriseDeposits() now uses ID-only matching to classify
//     current vs ex-members.
//
// v2.3.27 — 2026-05-31
//   • Vault Breakdown: stats card now shows Current member deposits and
//     Ex-member deposits as separate lines.
//
// v2.3.26 — 2026-05-31
//   • Vault: "Member Deposits" label and value now shows ALL depositors.
//   • Config: Auto-refresh interval field added.
//
// v2.3.25 — 2026-04-27
//   • Donations: duplicate window reduced from 60 seconds to 10 seconds.
//
// v2.3.24 — 2026-04-27
//   • Donations: duplicate check now uses a 60-second window.
//
// v2.3.23 — 2026-04-27
//   • Donations export: TornPDA fallback modal with textarea + Copy to Clipboard.
//
// v2.3.22 — 2026-04-27
//   • Member mode: item.php DOM scanner for faction-loaned items.
//   • @match extended to item.php.
//
// v2.3.20 — 2026-04-27
//   • OC Item Requirements: Tool/Material split into own column.
//
// v2.3.19 — 2026-04-27
//   • OC Item Requirements: status column shows Ready/Missing + source/type badges.
//
// v2.3.18 — 2026-04-27
//   • Unnecessary Utility Loans: reason column no longer truncated.
//
// v2.3.17 — 2026-04-25
//   • Analytics: new "Unnecessary Utility Loans" card.
//
// v2.3.16 — 2026-04-25
//   • Fix: fetchPointsPrice() now runs before saveSnapshot().
//
// v2.3.15 — 2026-04-24
//   • Fix: fallback POINTS_EST updated to $34,250.
//
// v2.3.14 — 2026-04-24
//   • History chart: hover/tap tooltips with crosshair.
//
// v2.3.13 — 2026-04-24
//   • Faction Funds History chart: 4 toggle buttons.
//
// v2.3.12 — 2026-04-24
//   • Visual refresh: adopted OC Manager colour palette throughout.
//
// ─────────────────────────────────────────────────────────────────────────────

(function () {
    'use strict';

    // ── Duplicate-load guard ───────────────────────────────────────────────────
    if (window._fvamLoaded) return;
    window._fvamLoaded = true;

    // ── Constants ─────────────────────────────────────────────────────────────
    var SK         = 'fvam_';
    var VERSION    = '2.3.41';
    var API_BASE   = 'https://api.torn.com/v2';
    var POINTS_EST = 34250;  // fallback — overwritten by live pointsmarket API fetch
    var PANEL_ID   = 'fvam-root';
    var LOANS_CACHE_KEY  = SK + 'memberLoans';   // faction-loaned items seen on item.php
    var BONUS_CACHE_KEY  = SK + 'armoryBonuses'; // per-copy bonus info scraped from armoury sub-tabs, keyed by armoryId
    var POLL_MS    = 600;
    var MAX_HIST   = 20;
    var HIST_GAP   = 10 * 60 * 1000;

    // ── Defaults ──────────────────────────────────────────────────────────────
    var DEFAULTS = {
        apiKey:       '',
        activeTab:    'vault',
        collapsed:    false,
        sectionsOpen: {},
        groupMinimums: { drugs: 5, medical: 10, boosters: 5, temporary: 20, consumables: 5 },
        itemMinimums:  {},
        pointsOverride: null,
        refreshInterval: 60,
        ocGroupMinimum: 5,
        ocItemMinimums: {}
    };

    var cfg        = {};
    var dataLoaded = false;

    // ── Data store ────────────────────────────────────────────────────────────
    var store = {
        vault: null,
        drugs: [], medical: [], boosters: [], temporary: [],
        weapons: [], armor: [], utilities: [], loot: [],
        crimes: [],
        tornItems: {},
        members: {},
        memberBalances: [], currentDeposits: [], exMemberDeposits: [], exMemberBalances: []
    };

    // ── Config persistence ────────────────────────────────────────────────────
    function loadCfg() {
        try {
            var raw = GM_getValue(SK + 'config', null);
            if (raw) {
                var p = JSON.parse(raw);
                cfg = Object.assign({}, DEFAULTS, p);
                cfg.groupMinimums = Object.assign({}, DEFAULTS.groupMinimums, p.groupMinimums || {});
                cfg.itemMinimums  = p.itemMinimums  || {};
                cfg.sectionsOpen  = p.sectionsOpen  || {};
                cfg.pointsOverride   = p.pointsOverride  != null ? Number(p.pointsOverride)  : null;
                cfg.refreshInterval  = p.refreshInterval  != null ? Number(p.refreshInterval)  : 60;
                cfg.ocGroupMinimum   = p.ocGroupMinimum   != null ? Number(p.ocGroupMinimum)   : 5;
                cfg.ocItemMinimums   = p.ocItemMinimums   || {};
                cfg.collapsed = !!cfg.collapsed;
            } else {
                cfg = JSON.parse(JSON.stringify(DEFAULTS));
            }
        } catch (_) { cfg = JSON.parse(JSON.stringify(DEFAULTS)); }
    }
    function saveCfg() { GM_setValue(SK + 'config', JSON.stringify(cfg)); }

    // ── API helper ────────────────────────────────────────────────────────────
    /**
     * Fetches a single selection against the v2 endpoint. If v2 rejects it with
     * error 22 ("only available in API v1"), transparently retries that ONE
     * selection against the v1 endpoint. Selections are fetched individually
     * (never as a combined comma-list) specifically so that a v1/v2 mismatch on
     * one selection can never take down a sibling selection that needs the
     * other version — e.g. 'temporary' needing v1 must not drag 'balance' (a
     * v2-only selection with no v1 equivalent) into a v1 call, which would
     * itself fail with error 23 ("only available in API v2").
     */
    function apiCallOne(sel) {
        return new Promise(function (resolve, reject) {
            GM_xmlhttpRequest({
                method: 'GET',
                url: API_BASE + '/faction?selections=' + sel + '&key=' + cfg.apiKey,
                onload: function (r) {
                    try {
                        var j = JSON.parse(r.responseText);
                        if (j.error) {
                            if (j.error.code === 22) {
                                apiCallOneV1(sel).then(resolve).catch(reject);
                            } else {
                                reject(j.error);
                            }
                        } else resolve(j);
                    } catch (e) { reject({ code: -1, error: 'Parse error' }); }
                },
                onerror: function () { reject({ code: -1, error: 'Network error' }); }
            });
        });
    }

    function apiCallOneV1(sel) {
        return new Promise(function (resolve, reject) {
            GM_xmlhttpRequest({
                method: 'GET',
                url: 'https://api.torn.com/faction/?selections=' + sel + '&key=' + cfg.apiKey,
                onload: function (r) {
                    try {
                        var j = JSON.parse(r.responseText);
                        if (j.error) reject(j.error); else resolve(j);
                    } catch (e) { reject({ code: -1, error: 'Parse error (v1 fallback)' }); }
                },
                onerror: function () { reject({ code: -1, error: 'Network error (v1 fallback)' }); }
            });
        });
    }

    /**
     * Fetches each selection in a comma-separated list independently (see
     * apiCallOne for why) and merges the resulting objects back into one,
     * so every existing call site — apiCall('balance,drugs,medical,...') —
     * keeps working unchanged.
     */
    function apiCall(sel) {
        var names = sel.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
        return Promise.all(names.map(apiCallOne)).then(function (results) {
            var merged = {};
            results.forEach(function (r) { Object.assign(merged, r); });
            return merged;
        });
    }

    // ── Controls page scrape ──────────────────────────────────────────────────
    // ── Vault history ─────────────────────────────────────────────────────────
    function loadHistory() {
        try { return JSON.parse(GM_getValue(SK + 'history', '[]')); } catch (_) { return []; }
    }
    function saveSnapshot(v) {
        var h = loadHistory(), now = Date.now();
        if (h.length && (now - h[h.length - 1].ts) < HIST_GAP) return;
        h.push({
            ts: now,
            totalVault:    v.totalVault    || 0,
            factionFunds:  v.factionFunds  || 0,
            memberTotal:   v.memberTotal   || 0,
            memberCount:   v.memberCount   || 0,
            factionPoints: v.factionPoints || 0,
            pointsPrice:   POINTS_EST      || 0
        });
        if (h.length > MAX_HIST) h = h.slice(-MAX_HIST);
        GM_setValue(SK + 'history', JSON.stringify(h));
    }

    // ── Vault parsing ─────────────────────────────────────────────────────────
    /**
     * Parse vault figures from two balance API responses.
     *
     * rawCurrent = response from balance,drugs,... (cat=current behaviour)
     *   → members[] contains only current faction members
     *
     * rawAll = response from /faction/balance?cat=all
     *   → members[] contains current + ex-members. faction.money is authoritative.
     *
     * Three-way split:
     *   factionFunds  = faction.money(all) − sum(all members)
     *   currentTotal  = sum(current members)
     *   exMemberTotal = sum(all) − sum(current)
     *   memberTotal   = currentTotal + exMemberTotal
     */
    function parseVault(rawCurrent, rawAll) {
        var balCur  = (rawCurrent && rawCurrent.balance) || {};
        var balAll  = (rawAll     && rawAll.balance)     || {};
        var fac     = balAll.faction || balCur.faction   || {};
        var tv      = fac.money  || 0;
        var fp      = fac.points || 0;

        // All depositors (current + ex-members) from cat=all
        var arrAll  = Array.isArray(balAll.members)  ? balAll.members  : [];
        // Current members only — from the regular balance call
        var arrCur  = Array.isArray(balCur.members)  ? balCur.members  : arrAll;

        var allSum  = arrAll.reduce(function (s, m) { return s + (m.money || 0); }, 0);
        var curSum  = arrCur.reduce(function (s, m) { return s + (m.money || 0); }, 0);

        // Build current-member ID set for cross-referencing
        var curIds  = {};
        arrCur.forEach(function (m) { curIds[String(m.id)] = true; });

        // Ex-members: present in cat=all but absent from current member list
        var exMembers = arrAll.filter(function (m) { return !curIds[String(m.id)]; });
        var exSum     = exMembers.reduce(function (s, m) { return s + (m.money || 0); }, 0);

        // Sort for display tables
        store.memberBalances   = arrCur.slice().sort(function (a, b) { return (b.money || 0) - (a.money || 0); });
        store.exMemberBalances = exMembers.slice().sort(function (a, b) { return (b.money || 0) - (a.money || 0); });

        return {
            totalVault:    tv,
            factionFunds:  Math.max(0, tv - allSum),  // true faction-owned funds
            currentTotal:  curSum,                     // current members only
            exMemberTotal: exSum,                      // ex-members only
            memberTotal:   curSum + exSum,             // all member deposits combined
            factionPoints: fp,
            memberCount:   arrCur.length,
            hasAllData:    arrAll.length > 0           // false if cat=all failed/empty
        };
    }

    // ── Loan helpers ──────────────────────────────────────────────────────────
    function loanIds(item) {
        if (!item.loaned || item.loaned === 0) return [];
        var raw = item.loaned_to;
        if (raw === null || raw === undefined || raw === 0 || raw === '') return [];
        return String(raw).split(',').map(function (s) { return s.trim(); })
            .filter(Boolean)
            .slice(0, item.loaned);
    }
    function loanNames(item) {
        return loanIds(item).map(function (id) { return store.members[id] || ('ID ' + id); });
    }

    // ── Normalise API items ───────────────────────────────────────────────────
    function normalise(raw) {
        if (!raw) return [];
        if (Array.isArray(raw)) {
            return raw.map(function (item) {
                if (item && typeof item === 'object' && !item.id && item.ID) {
                    item.id = String(item.ID);
                }
                return item;
            });
        }
        return Object.keys(raw).map(function (k) {
            var item = raw[k];
            if (item && typeof item === 'object') { item.id = item.id || k; return item; }
            return { id: k, name: String(item), quantity: 0 };
        });
    }

    // ── Categorise deposits ───────────────────────────────────────────────────
    function categoriseDeposits() {
        // currentDeposits: members present in the current member map (from cat=current)
        // exMemberBalances is already set by parseVault from the cat=all diff
        store.currentDeposits = store.memberBalances.filter(function (m) {
            return !!store.members[String(m.id)];
        }).sort(function (a, b) { return (b.money || 0) - (a.money || 0); });

        if (store.vault) {
            // currentMemberTotal from vault is already the authoritative sum;
            // keep a reference on vault for legacy render code
            store.vault.currentMemberTotal = store.vault.currentTotal || 0;
        }
    }

    // ── fetchAll ──────────────────────────────────────────────────────────────
    async function fetchAll() {
        if (!cfg.apiKey) return { err: 'no_key' };

        // Warm POINTS_EST from cache synchronously
        try {
            var _pc = GM_getValue(POINTS_CACHE_KEY, null);
            if (_pc) {
                var _po = JSON.parse(_pc);
                if (_po && _po.price && _po.price > 1000) POINTS_EST = _po.price;
            }
        } catch (_) {}

        try {
            // Fetch cat=all first so we have full depositor list for vault split.
            // Falls back gracefully — parseVault handles a missing rawAll.
            var bAll = null;
            try {
                bAll = await new Promise(function (resolve, reject) {
                    GM_xmlhttpRequest({
                        method: 'GET',
                        url: 'https://api.torn.com/v2/faction/balance?cat=all&key=' + cfg.apiKey,
                        onload: function (r) {
                            try {
                                var j = JSON.parse(r.responseText);
                                if (j.error) reject(j.error); else resolve(j);
                            } catch (e) { reject(e); }
                        },
                        onerror: function () { reject({ code: -1, error: 'Network error' }); }
                    });
                });
            } catch (_) { bAll = null; }

            var b1 = await apiCall('balance,drugs,medical,boosters,temporary');
            store.vault     = parseVault(b1, bAll);   // pass both for three-way split
            store.drugs     = normalise(b1.drugs);
            store.medical   = normalise(b1.medical);
            store.boosters  = normalise(b1.boosters);
            store.temporary = normalise(b1.temporary);

            var b2 = await apiCall('armor,weapons,members');
            store.weapons   = normalise(b2.weapons);
            store.armor     = normalise(b2.armor);

            try {
                var b3 = await apiCall('utilities,caches');
                store.utilities = normalise(b3.utilities);
                store.loot      = normalise(b3.caches);
            } catch (_) {
                store.utilities = [];
                store.loot      = [];
            }

            // Build member ID → name map
            store.members = {};
            if (Array.isArray(b2.members)) {
                b2.members.forEach(function (m) {
                    store.members[String(m.id)] = m.name || m.username || ('ID ' + m.id);
                });
            } else if (b2.members) {
                Object.keys(b2.members).forEach(function (id) {
                    var m = b2.members[id];
                    store.members[id] = m.name || m.username || ('ID ' + id);
                });
            }

            categoriseDeposits();

            // Fetch live points price BEFORE saving snapshot
            await fetchPointsPrice();
            saveSnapshot(store.vault);

            try {
                var b4 = await apiCall('crimes');
                store.crimes = parseCrimes(b4.crimes);
            } catch (_) {
                store.crimes = [];
            }

            await ensureTornItems();

            return { ok: true };
        } catch (err) {
            var code = (err && err.code !== undefined) ? err.code : '?';
            var msg  = (err && (err.error || err.message)) || JSON.stringify(err);
            return { err: 'api', code: code, msg: 'Error ' + code + ': ' + msg };
        }
    }

    // ── Torn item catalogue ───────────────────────────────────────────────────
    var ITEMS_CACHE_KEY = SK + 'tornItems';
    var ITEMS_CACHE_TTL = 24 * 60 * 60 * 1000;

    async function ensureTornItems() {
        var neededIds = {};
        store.crimes.forEach(function (crime) {
            crime.participants.forEach(function (p) {
                if (p.itemId) neededIds[p.itemId] = true;
            });
        });
        var ids = Object.keys(neededIds);
        if (ids.length === 0) return;

        var cached = {};
        try {
            var raw = GM_getValue(ITEMS_CACHE_KEY, null);
            if (raw) {
                var obj = JSON.parse(raw);
                if (obj && obj.ts && (Date.now() - obj.ts) < ITEMS_CACHE_TTL && obj.items) {
                    cached = obj.items;
                }
            }
        } catch (_) {}

        var missing = ids.filter(function (id) { return !cached[id]; });
        if (missing.length > 0) {
            try {
                var url = 'https://api.torn.com/torn/' + missing.join(',')
                        + '?selections=items&key=' + cfg.apiKey;
                var resp = await new Promise(function (resolve, reject) {
                    GM_xmlhttpRequest({
                        method: 'GET',
                        url: url,
                        onload: function (r) {
                            try {
                                var j = JSON.parse(r.responseText);
                                if (j.error) reject(j.error); else resolve(j);
                            } catch (e) { reject({ code: -1, error: 'Parse error' }); }
                        },
                        onerror: function () { reject({ code: -1, error: 'Network error' }); }
                    });
                });
                if (resp && resp.items) {
                    Object.keys(resp.items).forEach(function (id) {
                        var item = resp.items[id];
                        if (item && item.name) cached[String(id)] = item.name;
                    });
                    GM_setValue(ITEMS_CACHE_KEY, JSON.stringify({ ts: Date.now(), items: cached }));
                }
            } catch (_) {}
        }

        store.tornItems = cached;
    }

    // ── Points market price ───────────────────────────────────────────────────
    var POINTS_CACHE_KEY = SK + 'pointsPrice';
    var POINTS_CACHE_TTL = 60 * 60 * 1000;

    async function fetchPointsPrice() {
        if (cfg.pointsOverride != null && cfg.pointsOverride > 0) {
            POINTS_EST = cfg.pointsOverride;
            return;
        }
        try {
            var raw = GM_getValue(POINTS_CACHE_KEY, null);
            if (raw) {
                var obj = JSON.parse(raw);
                if (obj && obj.ts && (Date.now() - obj.ts) < POINTS_CACHE_TTL && obj.price) {
                    POINTS_EST = obj.price;
                    return;
                }
            }
        } catch (_) {}

        try {
            var resp = await new Promise(function (resolve, reject) {
                GM_xmlhttpRequest({
                    method: 'GET',
                    url: 'https://api.torn.com/market/?selections=pointsmarket&key=' + cfg.apiKey,
                    onload: function (r) {
                        try {
                            var j = JSON.parse(r.responseText);
                            if (j.error) reject(j.error); else resolve(j);
                        } catch (e) { reject(e); }
                    },
                    onerror: function () { reject(); }
                });
            });
            var listings = resp.pointsmarket || {};
            var cheapest = null;
            Object.keys(listings).forEach(function (id) {
                var cost = listings[id].cost;
                if (cost && cost > 1000 && (cheapest === null || cost < cheapest)) {
                    cheapest = cost;
                }
            });
            if (cheapest) {
                POINTS_EST = cheapest;
                GM_setValue(POINTS_CACHE_KEY, JSON.stringify({ ts: Date.now(), price: cheapest }));
            }
        } catch (_) {}
    }

    // ── OC / Crimes parsing ───────────────────────────────────────────────────
    function parseCrimes(raw) {
        if (!raw) return [];
        var list = Array.isArray(raw) ? raw : Object.keys(raw).map(function (k) { return raw[k]; });
        var active = [];
        var SKIP = { successful: 1, failure: 1, expired: 1, completed: 1 };
        list.forEach(function (c) {
            var st = String(c.status || '').toLowerCase();
            if (SKIP[st]) return;
            var slots = c.slots || c.participants || [];
            if (!Array.isArray(slots)) slots = Object.keys(slots).map(function (k) { return slots[k]; });
            var participants = [];
            slots.forEach(function (slot) {
                if (!slot || !slot.user) return;
                var mid = String(slot.user.id || '');
                if (!mid || mid === '0') return;
                var req = slot.item_requirement || null;
                participants.push({
                    memberId:    mid,
                    memberName:  store.members[mid] || ('ID ' + mid),
                    itemId:      req ? String(req.id || '') : null,
                    isAvailable: req ? !!req.is_available : true,
                    isReusable:  req ? !!req.is_reusable  : false,
                    hasReq:      !!req
                });
            });
            active.push({
                id:           c.id,
                name:         c.name || 'Unknown OC',
                status:       st,
                readyAt:      c.ready_at   || null,
                expiredAt:    c.expired_at || null,
                participants: participants
            });
        });
        return active;
    }

    function ocInfoForMemberId(memberId) {
        var mid = String(memberId);
        for (var ci = 0; ci < store.crimes.length; ci++) {
            var crime = store.crimes[ci];
            for (var pi = 0; pi < crime.participants.length; pi++) {
                var p = crime.participants[pi];
                if (p.memberId === mid) {
                    return {
                        ocName:      crime.name,
                        status:      crime.status,
                        readyAt:     crime.readyAt,
                        expiredAt:   crime.expiredAt,
                        hasReq:      p.hasReq,
                        itemId:      p.itemId,
                        isAvailable: p.isAvailable
                    };
                }
            }
        }
        return null;
    }

    function fmtOcTime(status, readyAt, expiredAt) {
        var now = Math.floor(Date.now() / 1000);
        if (status === 'planning' && readyAt) {
            var secs = readyAt - now;
            if (secs <= 0) return 'executing';
            return fmtSecs(secs);
        }
        if (expiredAt) {
            var secsEx = expiredAt - now;
            if (secsEx <= 0) return 'expiring';
            return 'expires ' + fmtSecs(secsEx);
        }
        return '';
    }
    function fmtSecs(secs) {
        if (secs < 3600)  return Math.ceil(secs / 60) + 'm';
        if (secs < 86400) return (secs / 3600).toFixed(1) + 'h';
        return Math.ceil(secs / 86400) + 'd';
    }

    // ── Donations ─────────────────────────────────────────────────────────────
    function loadDonations() {
        try { return JSON.parse(GM_getValue(SK + 'donations', '[]')); } catch (_) { return []; }
    }
    function saveDonations(log) { GM_setValue(SK + 'donations', JSON.stringify(log)); }
    function donationHash(armoryId, donorId, dateStr) {
        var s = armoryId + '|' + donorId + '|' + dateStr, h = 0;
        for (var i = 0; i < s.length; i++) h = Math.imul(31, h) + s.charCodeAt(i) | 0;
        return Math.abs(h).toString(36);
    }
    function addDonation(armoryId, itemName, donorId, donorName, note) {
        var log = loadDonations(), ds = new Date().toISOString();
        var nowMs = Date.now();
        if (log.some(function (e) {
            return e.armoryId === armoryId
                && String(e.donorId) === String(donorId)
                && (nowMs - new Date(e.date).getTime()) < 10000;
        })) return { err: 'dup' };
        log.push({ id: donationHash(armoryId, donorId, ds), armoryId: armoryId, itemName: itemName,
                   donorId: donorId, donorName: donorName, date: ds, note: note || '', returned: false });
        saveDonations(log);
        return { ok: true };
    }
    function deleteDonation(id) { saveDonations(loadDonations().filter(function (e) { return e.id !== id; })); }
    function toggleDonationReturned(id) {
        var log = loadDonations();
        log.forEach(function (e) { if (e.id === id) e.returned = !e.returned; });
        saveDonations(log);
    }

    /**
     * Show a modal overlay with CSV text + copy button.
     * Used as fallback when the blob download fails (e.g. TornPDA).
     */
    function showCsvModal(csvText, filename) {
        var existing = document.getElementById('fvam-csv-modal');
        if (existing) existing.remove();
        var modal = document.createElement('div');
        modal.id  = 'fvam-csv-modal';
        modal.innerHTML =
            '<div id="fvam-csv-modal-inner">'
            + '<div id="fvam-csv-modal-hdr">'
            +   '<span>&#11015; ' + filename + '</span>'
            +   '<button id="fvam-csv-modal-close" title="Close">&#10005;</button>'
            + '</div>'
            + '<div id="fvam-csv-modal-body">'
            +   '<p>Your browser does not support direct file downloads. Select all and copy the text below, then paste into a .csv file.</p>'
            +   '<textarea id="fvam-csv-textarea" readonly>' + csvText.replace(/</g,'&lt;') + '</textarea>'
            +   '<button id="fvam-csv-copy-btn">&#128203; Copy to Clipboard</button>'
            +   '<div id="fvam-csv-copy-status"></div>'
            + '</div>'
            + '</div>';
        document.body.appendChild(modal);
        var ta = document.getElementById('fvam-csv-textarea');
        if (ta) ta.addEventListener('focus', function(){ ta.select(); });
        var copyBtn = document.getElementById('fvam-csv-copy-btn');
        var copyStatus = document.getElementById('fvam-csv-copy-status');
        if (copyBtn) {
            copyBtn.addEventListener('click', function() {
                if (navigator.clipboard && navigator.clipboard.writeText) {
                    navigator.clipboard.writeText(csvText).then(function() {
                        if (copyStatus) copyStatus.textContent = '&#10003; Copied!';
                    }).catch(function() {
                        if (ta) { ta.select(); document.execCommand('copy'); }
                        if (copyStatus) copyStatus.textContent = '&#10003; Copied!';
                    });
                } else {
                    if (ta) { ta.select(); document.execCommand('copy'); }
                    if (copyStatus) copyStatus.textContent = '&#10003; Copied!';
                }
                setTimeout(function(){ if (copyStatus) copyStatus.textContent = ''; }, 2000);
            });
        }
        document.getElementById('fvam-csv-modal-close').addEventListener('click', function(){ modal.remove(); });
        modal.addEventListener('click', function(e){ if (e.target === modal) modal.remove(); });
    }

    function exportDonationsCSV() {
        var log  = loadDonations();
        var CRLF = String.fromCharCode(13) + String.fromCharCode(10);
        var hdr  = ['"id"','"armoryId"','"itemName"','"donorId"','"donorName"','"date"','"note"','"returned"'].join(',');
        var body = log.map(function (e) {
            return [e.id, e.armoryId, e.itemName, e.donorId, e.donorName, e.date, e.note || '', e.returned ? 'yes' : 'no']
                .map(function (c) { return '"' + String(c == null ? '' : c).split('"').join('""') + '"'; }).join(',');
        }).join(CRLF);
        var csvText  = hdr + CRLF + body;
        var filename = 'fvam-donations-' + new Date().toISOString().slice(0, 10) + '.csv';
        try {
            var blob = new Blob([csvText], { type: 'text/csv' });
            var url  = URL.createObjectURL(blob);
            var a    = document.createElement('a');
            a.href     = url;
            a.download = filename;
            a.style.display = 'none';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(function() { URL.revokeObjectURL(url); }, 500);
            if (/TornPDA/i.test(navigator.userAgent)) {
                showCsvModal(csvText, filename);
            }
        } catch (_) {
            showCsvModal(csvText, filename);
        }
    }

    function importDonationsCSV(text) {
        var CR = String.fromCharCode(13), LF = String.fromCharCode(10);
        var lines = text.trim().split(CR).join('').split(LF);
        var added = 0, skipped = 0, existing = loadDonations(), seen = {};
        existing.forEach(function (e) { seen[e.id] = true; });
        for (var i = 1; i < lines.length; i++) {
            var cells = parseCSVLine(lines[i]);
            if (cells.length < 6) continue;
            var entry = { id: cells[0], armoryId: cells[1], itemName: cells[2],
                          donorId: cells[3], donorName: cells[4], date: cells[5],
                          note: cells[6] || '', returned: cells[7] === 'yes' };
            if (!entry.id || seen[entry.id]) { skipped++; continue; }
            existing.push(entry); seen[entry.id] = true; added++;
        }
        saveDonations(existing);
        return { added: added, skipped: skipped };
    }
    function parseCSVLine(line) {
        var cells = [], cur = '', inQ = false;
        for (var i = 0; i < line.length; i++) {
            var ch = line[i];
            if (inQ) {
                if (ch === '"' && line[i+1] === '"') { cur += '"'; i++; }
                else if (ch === '"') { inQ = false; }
                else { cur += ch; }
            } else {
                if (ch === '"') { inQ = true; }
                else if (ch === ',') { cells.push(cur); cur = ''; }
                else { cur += ch; }
            }
        }
        cells.push(cur);
        return cells;
    }

    // ── Utilities ─────────────────────────────────────────────────────────────
    function fmt$(n) {
        if (n >= 1e12) return '$' + (n/1e12).toFixed(2) + 'T';
        if (n >= 1e9)  return '$' + (n/1e9).toFixed(2)  + 'B';
        if (n >= 1e6)  return '$' + (n/1e6).toFixed(2)  + 'M';
        if (n >= 1e3)  return '$' + (n/1e3).toFixed(1)  + 'K';
        return '$' + Number(n).toLocaleString();
    }
    function fmtNum(n) { return Number(n).toLocaleString(); }
    function getMin(name, grp) {
        return cfg.itemMinimums[name] !== undefined ? cfg.itemMinimums[name] : (cfg.groupMinimums[grp] || 0);
    }
    // Get OC item minimum available threshold (per-item override or group default)
    function getOcMin(name) {
        return cfg.ocItemMinimums[name] !== undefined ? cfg.ocItemMinimums[name] : (cfg.ocGroupMinimum != null ? cfg.ocGroupMinimum : 5);
    }
    function qtyClass(q, min) {
        if (min <= 0)        return 'neutral';
        if (q === 0)         return 'critical';
        if (q < min * 0.5)  return 'critical';
        if (q < min)         return 'warn';
        return 'ok';
    }
    function esc(s) {
        return String(s)
            .replace(/&/g,'&amp;').replace(/</g,'&lt;')
            .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }
    /** Wrap an item name in a link to the Torn item market, if an id is available. */
    function itemLink(name, id) {
        var label = esc(name);
        if (!id) return label;
        return '<a href="https://www.torn.com/page.php?sid=ItemMarket#/market/view=search&itemID=' + encodeURIComponent(id) + '" target="_blank">' + label + '</a>';
    }
    /** Wrap a member name in a link to their Torn profile, if an id is available. */
    function memberLink(name, id) {
        var label = esc(name);
        if (!id) return label;
        return '<a href="/profiles.php?XID=' + encodeURIComponent(id) + '" target="_blank">' + label + '</a>';
    }
    function isOpen(key, def) {
        return cfg.sectionsOpen[key] !== undefined ? cfg.sectionsOpen[key] : (def !== false);
    }
    function mkCard(key, title, meta, body, defOpen) {
        var open = isOpen(key, defOpen);
        return '<div class="fvam-card">'
            + '<div class="fvam-card-hdr' + (open ? '' : ' fvam-collapsed') + '" data-fvam-section="' + key + '">'
            +   '<span class="fvam-card-title">' + title + '</span>'
            +   '<div class="fvam-card-meta">' + meta + '<span class="fvam-chevron">&#9660;</span></div>'
            + '</div>'
            + '<div class="fvam-card-body' + (open ? '' : ' fvam-hidden') + '">' + body + '</div>'
            + '</div>';
    }

    // ── Theme system ──────────────────────────────────────────────────────────
    // Full 8-theme palette per torn-ocm-design-system.md, using --fvam-* tokens.
    var THEMES = {
        // ── Default — grey/amber per Design_details_II §3 ─────────────────
        default: {
            '--fvam-bg-deep':'#141414','--fvam-bg-dark':'#191919','--fvam-bg-base':'#202020',
            '--fvam-bg-card':'#242424','--fvam-bg-header':'#1c1c1c','--fvam-bg-hover':'#2c2c2c',
            '--fvam-bg-input':'#161616','--fvam-bg-dropdown':'#141414','--fvam-bg-row':'#1c1c1c',
            '--fvam-border-faint':'#2a2a2a','--fvam-border-card':'#333','--fvam-border-strip':'#2e2e2e',
            '--fvam-border-input':'#3a3a3a','--fvam-border-accent':'#d98a3d','--fvam-border-section':'#333',
            '--fvam-accent':'#e8973f','--fvam-accent-hover':'#f0a656','--fvam-accent-dim':'#b8752f',
            '--fvam-text-primary':'#e6e6e6','--fvam-text-card':'#c8c8c8','--fvam-text-secondary':'#9a9a9a',
            '--fvam-text-label':'#8e8e8e','--fvam-text-muted':'#828282','--fvam-text-disabled':'#707070','--fvam-text-dead':'#6a6a6a',
            '--fvam-status-ok':'#5cbf7f','--fvam-status-warn':'#d9a441','--fvam-status-crit':'#d16060',
            '--fvam-status-ok-bg':'#16281d','--fvam-status-warn-bg':'#2a2114','--fvam-status-crit-bg':'#2a1818',
            '--fvam-status-ok-border':'#2f5e40','--fvam-status-warn-border':'#5c4a24','--fvam-status-crit-border':'#5e3030',
            '--fvam-status-jail':'#d99640','--fvam-status-hospital':'#d16060','--fvam-status-travel':'#7c9cc4',
            '--fvam-status-abroad':'#8fb0cc','--fvam-status-blocked':'#b56ab5','--fvam-status-respect':'#d9b85c',
            '--fvam-phase-plan-bg':'#1e2833','--fvam-phase-plan-text':'#8aa8c4','--fvam-phase-plan-border':'#3a5064',
            '--fvam-phase-rec-bg':'#2a2114','--fvam-phase-rec-text':'#d9a441','--fvam-phase-rec-border':'#5c4a24',
            '--fvam-stuck-bg':'#2a1818','--fvam-stuck-border':'#8a3030',
            '--fvam-banner-ok-bg':'#16281d','--fvam-banner-ok-border':'#2f5e40','--fvam-banner-ok-text':'#7cc498',
            '--fvam-banner-warn-bg':'#2a2114','--fvam-banner-warn-border':'#5c4a24','--fvam-banner-warn-text':'#d9b877',
            '--fvam-banner-crit-bg':'#2a1818','--fvam-banner-crit-border':'#5e3030','--fvam-banner-crit-text':'#d98a7a',
            '--fvam-weight-high':'#d9905c','--fvam-weight-mid':'#9a9a9a','--fvam-weight-low':'#555',
            // FVAM extension tokens (not in standard spec set)
            '--fvam-status-info':'#7c9cc4','--fvam-status-info-bg':'#1e2833',
            '--fvam-status-warn-alt':'#d9a441','--fvam-status-crit-alt':'#d16060','--fvam-status-avail':'#5cbf7f',
            '--fvam-shape-ok':'""','--fvam-shape-warn':'""','--fvam-shape-crit':'""','--fvam-font-scale':'1',
        },
        torn: {
            '--fvam-bg-deep':'#111','--fvam-bg-dark':'#1a1a1a','--fvam-bg-base':'#222',
            '--fvam-bg-card':'#1c1c1c','--fvam-bg-header':'#1c1c1c','--fvam-bg-hover':'#2a2a2a',
            '--fvam-bg-input':'#2a2a2a','--fvam-bg-dropdown':'#111','--fvam-bg-row':'#1a1a1a',
            '--fvam-border-faint':'#2a2a2a','--fvam-border-card':'#3a3a3a','--fvam-border-strip':'#333',
            '--fvam-border-input':'#555','--fvam-border-accent':'#c03020','--fvam-border-section':'#444',
            '--fvam-accent':'#e04030','--fvam-accent-hover':'#c03020','--fvam-accent-dim':'#aa2010',
            '--fvam-text-primary':'#ddd','--fvam-text-card':'#ccc','--fvam-text-secondary':'#aaa',
            '--fvam-text-label':'#888','--fvam-text-muted':'#666','--fvam-text-disabled':'#555','--fvam-text-dead':'#333',
            '--fvam-status-ok':'#44ee88','--fvam-status-warn':'#ffaa00','--fvam-status-crit':'#ff4444',
            '--fvam-status-ok-bg':'#003322','--fvam-status-warn-bg':'#2a1a00','--fvam-status-crit-bg':'#330a00',
            '--fvam-status-ok-border':'#006644','--fvam-status-warn-border':'#664400','--fvam-status-crit-border':'#882200',
            '--fvam-status-info':'#42a5f5','--fvam-status-info-bg':'#0d2a3d',
            '--fvam-status-warn-alt':'#ffaa33','--fvam-status-crit-alt':'#ff6633','--fvam-status-avail':'#44884a',
            '--fvam-weight-high':'#ff8844','--fvam-weight-mid':'#aaa','--fvam-weight-low':'#555',
            '--fvam-shape-ok':'""','--fvam-shape-warn':'""','--fvam-shape-crit':'""','--fvam-font-scale':'1',
            // FVAM extension tokens (not in standard spec set)
            '--fvam-status-info':'#7c9cc4','--fvam-status-info-bg':'#1a2030',
            '--fvam-status-warn-alt':'#ffaa33','--fvam-status-crit-alt':'#ff6633','--fvam-status-avail':'#44ee88',
        },
        highcontrast: {
            '--fvam-bg-deep':'#000','--fvam-bg-dark':'#000','--fvam-bg-base':'#000',
            '--fvam-bg-card':'#0a0a0a','--fvam-bg-header':'#000','--fvam-bg-hover':'#1a1a1a',
            '--fvam-bg-input':'#111','--fvam-bg-dropdown':'#000','--fvam-bg-row':'#000',
            '--fvam-border-faint':'#444','--fvam-border-card':'#fff','--fvam-border-strip':'#888',
            '--fvam-border-input':'#fff','--fvam-border-accent':'#ffff00','--fvam-border-section':'#888',
            '--fvam-accent':'#ffff00','--fvam-accent-hover':'#ffee00','--fvam-accent-dim':'#cccc00',
            '--fvam-text-primary':'#fff','--fvam-text-card':'#fff','--fvam-text-secondary':'#eee',
            '--fvam-text-label':'#ddd','--fvam-text-muted':'#bbb','--fvam-text-disabled':'#888','--fvam-text-dead':'#666',
            '--fvam-status-ok':'#00ff88','--fvam-status-warn':'#ffdd00','--fvam-status-crit':'#ff4444',
            '--fvam-status-ok-bg':'#003318','--fvam-status-warn-bg':'#332200','--fvam-status-crit-bg':'#330000',
            '--fvam-status-ok-border':'#00ff88','--fvam-status-warn-border':'#ffdd00','--fvam-status-crit-border':'#ff4444',
            '--fvam-status-info':'#aaccff','--fvam-status-info-bg':'#001a33',
            '--fvam-status-warn-alt':'#ffdd00','--fvam-status-crit-alt':'#ff6666','--fvam-status-avail':'#00ff88',
            '--fvam-weight-high':'#ffaa44','--fvam-weight-mid':'#ddd','--fvam-weight-low':'#888',
            '--fvam-shape-ok':'""','--fvam-shape-warn':'""','--fvam-shape-crit':'""','--fvam-font-scale':'1',
            // FVAM extension tokens (not in standard spec set)
            '--fvam-status-info':'#aaccff','--fvam-status-info-bg':'#001a33',
            '--fvam-status-warn-alt':'#ffdd00','--fvam-status-crit-alt':'#ff6666','--fvam-status-avail':'#00ff88',
        },
        deuteranopia: {
            '--fvam-bg-deep':'#0f1a30','--fvam-bg-dark':'#111827','--fvam-bg-base':'#16213e',
            '--fvam-bg-card':'#1a1a2e','--fvam-bg-header':'#1a1a2e','--fvam-bg-hover':'#1e1e36',
            '--fvam-bg-input':'#0f3460','--fvam-bg-dropdown':'#0f1a30','--fvam-bg-row':'#111827',
            '--fvam-border-faint':'#111','--fvam-border-card':'#2a2a4a','--fvam-border-strip':'#1a2a4a',
            '--fvam-border-input':'#2a4a7a','--fvam-border-accent':'#0088cc','--fvam-border-section':'#333',
            '--fvam-accent':'#0099ee','--fvam-accent-hover':'#0077cc','--fvam-accent-dim':'#005599',
            '--fvam-text-primary':'#e0e0e0','--fvam-text-card':'#ccc','--fvam-text-secondary':'#aaa',
            '--fvam-text-label':'#888','--fvam-text-muted':'#666','--fvam-text-disabled':'#555','--fvam-text-dead':'#444',
            '--fvam-status-ok':'#4499ff','--fvam-status-warn':'#ffcc00','--fvam-status-crit':'#ff6600',
            '--fvam-status-ok-bg':'#001833','--fvam-status-warn-bg':'#332a00','--fvam-status-crit-bg':'#331500',
            '--fvam-status-ok-border':'#2266cc','--fvam-status-warn-border':'#886600','--fvam-status-crit-border':'#994400',
            '--fvam-status-info':'#88ccff','--fvam-status-info-bg':'#0d2a4a',
            '--fvam-status-warn-alt':'#ffcc44','--fvam-status-crit-alt':'#ff8844','--fvam-status-avail':'#4499ff',
            '--fvam-weight-high':'#ffaa44','--fvam-weight-mid':'#aaa','--fvam-weight-low':'#555',
            '--fvam-shape-ok':'"\u2713 "','--fvam-shape-warn':'"\u26a0 "','--fvam-shape-crit':'"\u2717 "','--fvam-font-scale':'1',
            // FVAM extension tokens (not in standard spec set)
            '--fvam-status-info':'#4499ff','--fvam-status-info-bg':'#001833',
            '--fvam-status-warn-alt':'#ffcc44','--fvam-status-crit-alt':'#ff8844','--fvam-status-avail':'#4499ff',
        },
        protanopia: {
            '--fvam-bg-deep':'#0f1a30','--fvam-bg-dark':'#111827','--fvam-bg-base':'#16213e',
            '--fvam-bg-card':'#1a1a2e','--fvam-bg-header':'#1a1a2e','--fvam-bg-hover':'#1e1e36',
            '--fvam-bg-input':'#0f3460','--fvam-bg-dropdown':'#0f1a30','--fvam-bg-row':'#111827',
            '--fvam-border-faint':'#111','--fvam-border-card':'#2a2a4a','--fvam-border-strip':'#1a2a4a',
            '--fvam-border-input':'#2a4a7a','--fvam-border-accent':'#00aacc','--fvam-border-section':'#333',
            '--fvam-accent':'#00bbdd','--fvam-accent-hover':'#0099bb','--fvam-accent-dim':'#007799',
            '--fvam-text-primary':'#e0e0e0','--fvam-text-card':'#ccc','--fvam-text-secondary':'#aaa',
            '--fvam-text-label':'#888','--fvam-text-muted':'#666','--fvam-text-disabled':'#555','--fvam-text-dead':'#444',
            '--fvam-status-ok':'#00ddcc','--fvam-status-warn':'#ffcc00','--fvam-status-crit':'#ffffff',
            '--fvam-status-ok-bg':'#002a28','--fvam-status-warn-bg':'#332a00','--fvam-status-crit-bg':'#333333',
            '--fvam-status-ok-border':'#009988','--fvam-status-warn-border':'#886600','--fvam-status-crit-border':'#aaaaaa',
            '--fvam-status-info':'#88ccff','--fvam-status-info-bg':'#0d2a4a',
            '--fvam-status-warn-alt':'#ffcc44','--fvam-status-crit-alt':'#ffffff','--fvam-status-avail':'#00ddcc',
            '--fvam-weight-high':'#ffcc44','--fvam-weight-mid':'#aaa','--fvam-weight-low':'#555',
            '--fvam-shape-ok':'"\u2713 "','--fvam-shape-warn':'"\u26a0 "','--fvam-shape-crit':'"\u2717 "','--fvam-font-scale':'1',
            // FVAM extension tokens (not in standard spec set)
            '--fvam-status-info':'#00ddcc','--fvam-status-info-bg':'#002a28',
            '--fvam-status-warn-alt':'#ffcc44','--fvam-status-crit-alt':'#ffffff','--fvam-status-avail':'#00ddcc',
        },
        tritanopia: {
            '--fvam-bg-deep':'#1a0f1a','--fvam-bg-dark':'#1a111a','--fvam-bg-base':'#221522',
            '--fvam-bg-card':'#1e121e','--fvam-bg-header':'#1e121e','--fvam-bg-hover':'#281828',
            '--fvam-bg-input':'#2a0a2a','--fvam-bg-dropdown':'#1a0f1a','--fvam-bg-row':'#1a111a',
            '--fvam-border-faint':'#2a1a2a','--fvam-border-card':'#3a2a3a','--fvam-border-strip':'#2a1a2a',
            '--fvam-border-input':'#6a3a6a','--fvam-border-accent':'#cc0066','--fvam-border-section':'#442244',
            '--fvam-accent':'#ff1177','--fvam-accent-hover':'#cc0055','--fvam-accent-dim':'#990033',
            '--fvam-text-primary':'#e0e0e0','--fvam-text-card':'#ccc','--fvam-text-secondary':'#bbb',
            '--fvam-text-label':'#999','--fvam-text-muted':'#777','--fvam-text-disabled':'#555','--fvam-text-dead':'#444',
            '--fvam-status-ok':'#00ddaa','--fvam-status-warn':'#ff88cc','--fvam-status-crit':'#ff2255',
            '--fvam-status-ok-bg':'#002a22','--fvam-status-warn-bg':'#2a0a1a','--fvam-status-crit-bg':'#2a001a',
            '--fvam-status-ok-border':'#009977','--fvam-status-warn-border':'#884466','--fvam-status-crit-border':'#880033',
            '--fvam-status-info':'#ff99dd','--fvam-status-info-bg':'#1a0a2a',
            '--fvam-status-warn-alt':'#ff88cc','--fvam-status-crit-alt':'#ff6688','--fvam-status-avail':'#00ddaa',
            '--fvam-weight-high':'#ff88cc','--fvam-weight-mid':'#bbb','--fvam-weight-low':'#555',
            '--fvam-shape-ok':'"\u2713 "','--fvam-shape-warn':'"\u26a0 "','--fvam-shape-crit':'"\u2717 "','--fvam-font-scale':'1',
            // FVAM extension tokens (not in standard spec set)
            '--fvam-status-info':'#00ddaa','--fvam-status-info-bg':'#002a22',
            '--fvam-status-warn-alt':'#ff88cc','--fvam-status-crit-alt':'#ff6688','--fvam-status-avail':'#00ddaa',
        },
        lowvision: {
            '--fvam-bg-deep':'#080d18','--fvam-bg-dark':'#0a1020','--fvam-bg-base':'#0d1628',
            '--fvam-bg-card':'#111828','--fvam-bg-header':'#111828','--fvam-bg-hover':'#161c30',
            '--fvam-bg-input':'#0a2a50','--fvam-bg-dropdown':'#080d18','--fvam-bg-row':'#0a1020',
            '--fvam-border-faint':'#333','--fvam-border-card':'#4a4a7a','--fvam-border-strip':'#2a3a6a',
            '--fvam-border-input':'#4a6a9a','--fvam-border-accent':'#ff8800','--fvam-border-section':'#555',
            '--fvam-accent':'#ff9900','--fvam-accent-hover':'#ff7700','--fvam-accent-dim':'#dd6600',
            '--fvam-text-primary':'#ffffff','--fvam-text-card':'#eee','--fvam-text-secondary':'#ccc',
            '--fvam-text-label':'#aaa','--fvam-text-muted':'#888','--fvam-text-disabled':'#666','--fvam-text-dead':'#555',
            '--fvam-status-ok':'#66ffaa','--fvam-status-warn':'#ffcc00','--fvam-status-crit':'#ff5555',
            '--fvam-status-ok-bg':'#003322','--fvam-status-warn-bg':'#332a00','--fvam-status-crit-bg':'#330a00',
            '--fvam-status-ok-border':'#33cc77','--fvam-status-warn-border':'#998800','--fvam-status-crit-border':'#cc2200',
            '--fvam-status-info':'#99bbff','--fvam-status-info-bg':'#0a2040',
            '--fvam-status-warn-alt':'#ffee66','--fvam-status-crit-alt':'#ff8877','--fvam-status-avail':'#66ffaa',
            '--fvam-weight-high':'#ffaa55','--fvam-weight-mid':'#bbb','--fvam-weight-low':'#666',
            '--fvam-shape-ok':'"\u2713 "','--fvam-shape-warn':'"\u26a0 "','--fvam-shape-crit':'"\u2717 "','--fvam-font-scale':'1.1',
            // FVAM extension tokens (not in standard spec set)
            '--fvam-status-info':'#99bbff','--fvam-status-info-bg':'#0a2040',
            '--fvam-status-warn-alt':'#ffee66','--fvam-status-crit-alt':'#ff8877','--fvam-status-avail':'#66ffaa',
        },
        light: {
            '--fvam-bg-deep':'#dde4f0','--fvam-bg-dark':'#e8eef8','--fvam-bg-base':'#eef2fa',
            '--fvam-bg-card':'#f4f6fc','--fvam-bg-header':'#f4f6fc','--fvam-bg-hover':'#e8ecf8',
            '--fvam-bg-input':'#dde4f0','--fvam-bg-dropdown':'#dde4f0','--fvam-bg-row':'#e8eef8',
            '--fvam-border-faint':'#ccd4e8','--fvam-border-card':'#b8c4dc','--fvam-border-strip':'#c8d4e8',
            '--fvam-border-input':'#9aaac8','--fvam-border-accent':'#cc5500','--fvam-border-section':'#b0bcd8',
            '--fvam-accent':'#cc5500','--fvam-accent-hover':'#aa4400','--fvam-accent-dim':'#993300',
            '--fvam-text-primary':'#1a1a2e','--fvam-text-card':'#222','--fvam-text-secondary':'#444',
            '--fvam-text-label':'#666','--fvam-text-muted':'#777','--fvam-text-disabled':'#999','--fvam-text-dead':'#aaa',
            '--fvam-status-ok':'#006622','--fvam-status-warn':'#885500','--fvam-status-crit':'#cc1111',
            '--fvam-status-ok-bg':'#d4f0dd','--fvam-status-warn-bg':'#fff0cc','--fvam-status-crit-bg':'#ffe0dd',
            '--fvam-status-ok-border':'#44aa66','--fvam-status-warn-border':'#cc8800','--fvam-status-crit-border':'#dd4444',
            '--fvam-status-info':'#1144aa','--fvam-status-info-bg':'#d8e8f8',
            '--fvam-status-warn-alt':'#774400','--fvam-status-crit-alt':'#880000','--fvam-status-avail':'#006622',
            '--fvam-weight-high':'#cc5500','--fvam-weight-mid':'#555','--fvam-weight-low':'#999',
            '--fvam-shape-ok':'""','--fvam-shape-warn':'""','--fvam-shape-crit':'""','--fvam-font-scale':'1',
            // FVAM extension tokens (not in standard spec set)
            '--fvam-status-info':'#1144aa','--fvam-status-info-bg':'#d8e8f8',
            '--fvam-status-warn-alt':'#774400','--fvam-status-crit-alt':'#880000','--fvam-status-avail':'#006622',
        },
    };

    /** Apply a theme by setting its CSS variables on #fvam-root. */
    function applyTheme(themeKey) {
        var theme = THEMES[themeKey] || THEMES.default;
        var root  = document.getElementById('fvam-root');
        if (!root) return;
        for (var prop in theme) {
            if (Object.prototype.hasOwnProperty.call(theme, prop) && prop.indexOf('--') === 0) {
                root.style.setProperty(prop, theme[prop]);
            }
        }
        root.style.fontSize = (12 * parseFloat(theme['--fvam-font-scale'] || '1')) + 'px';
        GM_setValue(SK + 'theme', themeKey);
    }

    // ── CSS ───────────────────────────────────────────────────────────────────
    function injectStyles() {
        GM_addStyle(`
/* ══════════════════════════════════════════════════════════════════════════
   Torn Faction Vault & Armory Manager — CSS
   Design system: torn-ocm-design-system / Design_details_II
   Prefix: --fvam-*   Root ID: #fvam-root
   ══════════════════════════════════════════════════════════════════════════ */

/* ── Box-sizing reset — prevents any inherited box-model quirks from Torn ── */
:where(#fvam-root, #fvam-root *) { box-sizing: border-box; }
:where(#fvam-root *) { margin: 0; padding: 0; }

/* ── Root — CSS variable defaults (grey/amber per Design_details_II §3)
   applyTheme() overwrites these at runtime for non-default themes.
   FVAM-specific extensions beyond the standard token set are marked [ext]. */
#fvam-root {
    /* Backgrounds */
    --fvam-bg-deep:    #141414;
    --fvam-bg-dark:    #191919;
    --fvam-bg-base:    #202020;
    --fvam-bg-card:    #242424;
    --fvam-bg-header:  #1c1c1c;
    --fvam-bg-hover:   #2c2c2c;
    --fvam-bg-input:   #161616;
    --fvam-bg-dropdown:#141414;
    --fvam-bg-row:     #1c1c1c;
    /* Borders */
    --fvam-border-faint:  #2a2a2a;
    --fvam-border-card:   #333;
    --fvam-border-strip:  #2e2e2e;
    --fvam-border-input:  #3a3a3a;
    --fvam-border-accent: #d98a3d;
    --fvam-border-section:#333;
    /* Accent */
    --fvam-accent:       #e8973f;
    --fvam-accent-hover: #f0a656;
    --fvam-accent-dim:   #b8752f;
    /* Text hierarchy */
    --fvam-text-primary:  #e6e6e6;
    --fvam-text-card:     #c8c8c8;
    --fvam-text-secondary:#9a9a9a;
    --fvam-text-label:    #8e8e8e;
    --fvam-text-muted:    #828282;
    --fvam-text-disabled: #707070;
    --fvam-text-dead:     #6a6a6a;
    /* Status colours */
    --fvam-status-ok:   #5cbf7f;
    --fvam-status-warn: #d9a441;
    --fvam-status-crit: #d16060;
    /* Status backgrounds */
    --fvam-status-ok-bg:   #16281d;
    --fvam-status-warn-bg: #2a2114;
    --fvam-status-crit-bg: #2a1818;
    /* Status borders */
    --fvam-status-ok-border:   #2f5e40;
    --fvam-status-warn-border: #5c4a24;
    --fvam-status-crit-border: #5e3030;
    /* Game statuses */
    --fvam-status-jail:    #d99640;
    --fvam-status-hospital:#d16060;
    --fvam-status-travel:  #7c9cc4;
    --fvam-status-abroad:  #8fb0cc;
    --fvam-status-blocked: #b56ab5;
    --fvam-status-respect: #d9b85c;
    /* Phase colours */
    --fvam-phase-plan-bg:    #1e2833;
    --fvam-phase-plan-text:  #8aa8c4;
    --fvam-phase-plan-border:#3a5064;
    --fvam-phase-rec-bg:     #2a2114;
    --fvam-phase-rec-text:   #d9a441;
    --fvam-phase-rec-border: #5c4a24;
    --fvam-stuck-bg:    #2a1818;
    --fvam-stuck-border:#8a3030;
    /* Banners */
    --fvam-banner-ok-bg:    #16281d;
    --fvam-banner-ok-border:#2f5e40;
    --fvam-banner-ok-text:  #7cc498;
    --fvam-banner-warn-bg:  #2a2114;
    --fvam-banner-warn-border:#5c4a24;
    --fvam-banner-warn-text:#d9b877;
    --fvam-banner-crit-bg:  #2a1818;
    --fvam-banner-crit-border:#5e3030;
    --fvam-banner-crit-text:#d98a7a;
    /* Role weights */
    --fvam-weight-high:#d9905c;
    --fvam-weight-mid: #9a9a9a;
    --fvam-weight-low: #555;
    /* FVAM extensions — not in standard token set but required for armory logic */
    --fvam-status-info:     #7c9cc4; /* loan/donor highlight — matches travel blue */
    --fvam-status-info-bg:  #1e2833;
    --fvam-status-warn-alt: #d9a441; /* secondary warn shade for badges */
    --fvam-status-crit-alt: #d16060; /* secondary crit shade for badges */
    --fvam-status-avail:    #5cbf7f; /* "available" copy text — matches status-ok */
    /* Shape indicators — empty by default; colourblind themes set ✓/⚠/✗ */
    --fvam-shape-ok:   "";
    --fvam-shape-warn: "";
    --fvam-shape-crit: "";
    /* Font scale — lowvision theme sets 1.1 */
    --fvam-font-scale: 1;

    /* Root layout — spec §10: 6px radius, 12px margin, overflow hidden, no border/shadow */
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
    font-size: calc(13px * var(--fvam-font-scale));
    line-height: 1.55;
    color: var(--fvam-text-primary);
    background: var(--fvam-bg-base);
    border-radius: 6px;
    margin: 12px 0;
    overflow: hidden;
    width: 100%;
}

/* ── Global link reset — links inherit surrounding text colour, accent on hover ── */
#fvam-root a { color: inherit; text-decoration: none; }
#fvam-root a:hover,
#fvam-root a:focus { color: var(--fvam-accent); text-decoration: underline; }

/* ── Header — spec §10: 2px accent bottom border, 10px 14px padding ────── */
#fvam-hdr {
    background: var(--fvam-bg-header);
    border-bottom: 2px solid var(--fvam-border-accent);
    border-radius: 6px 6px 0 0;
    padding: 10px 14px;
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
}
/* Title — spec §9: 15px bold, accent colour */
.fvam-title {
    color: var(--fvam-accent);
    font-size: 15px;
    font-weight: bold;
    flex: 1;
}
/* Version number — spec §9: 10px, 50% opacity */
.fvam-version {
    font-size: 10px;
    font-weight: normal;
    opacity: 0.5;
}
/* Last-updated timestamp */
.fvam-updated {
    color: var(--fvam-text-label);
    font-size: 11px;
    margin-left: auto;
}
/* Right-side header button group */
#fvam-hdr-right { display: flex; gap: 6px; align-items: center; }

/* Header action buttons (Refresh / Collapse) */
.fvam-hdr-btn {
    background: transparent;
    border: 1px solid var(--fvam-border-input);
    border-radius: 4px;
    color: var(--fvam-text-secondary);
    cursor: pointer;
    padding: 4px 10px;
    font-size: 11px;
    transition: background .15s, color .15s, border-color .15s;
}
.fvam-hdr-btn:hover {
    background: var(--fvam-bg-hover);
    color: var(--fvam-text-primary);
    border-color: var(--fvam-accent-dim);
}
#fvam-collapse-btn { min-width: 26px; text-align: center; }
#fvam-last-upd { font-size: 10px; color: var(--fvam-text-disabled); }

/* ── Collapsed state — hide everything below header ─────────────────────── */
#fvam-root.fvam-dash-collapsed #fvam-hdr {
    border-bottom: none;
    border-radius: 6px;
}
#fvam-collapsible {
    overflow: hidden;
    transition: max-height .25s ease, opacity .2s ease;
}
#fvam-root.fvam-dash-collapsed #fvam-collapsible {
    max-height: 0 !important;
    opacity: 0;
}

/* ── Tabs — strip below header ───────────────────────────────────────────── */
#fvam-tabs {
    display: flex;
    background: var(--fvam-bg-base);
    border-bottom: 1px solid var(--fvam-border-strip);
    overflow-x: auto;
}
#fvam-tabs::-webkit-scrollbar { height: 0; }
.fvam-tab {
    padding: 8px 15px;
    cursor: pointer;
    color: var(--fvam-text-muted);
    font-size: 11px;
    font-weight: 600;
    white-space: nowrap;
    border-bottom: 2px solid transparent;
    transition: all .15s;
    flex-shrink: 0;
}
.fvam-tab:hover {
    color: var(--fvam-text-secondary);
    background: var(--fvam-bg-hover);
}
.fvam-tab.active {
    color: var(--fvam-accent);
    border-bottom-color: var(--fvam-border-accent);
    background: var(--fvam-bg-card);
}

/* ── Body — spec §10: 16px 14px padding desktop ─────────────────────────── */
#fvam-body { padding: 16px 14px; background: var(--fvam-bg-base); }

/* ── Cards — spec §10: 6px radius, 1px border-card, accent border on hover ─ */
.fvam-card {
    margin-bottom: 10px;
    border: 1px solid var(--fvam-border-card);
    border-radius: 6px;
    overflow: hidden;
    transition: border-color .15s;
}
.fvam-card:last-child { margin-bottom: 0; }
.fvam-card:hover { border-color: var(--fvam-accent-dim); }

/* Card header — spec §10: section titles have left 3px accent border */
.fvam-card-hdr {
    background: var(--fvam-bg-card);
    border-left: 3px solid var(--fvam-accent);
    border-bottom: 1px solid var(--fvam-border-section);
    padding: 7px 10px 7px 12px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    cursor: pointer;
    user-select: none;
    transition: background .12s;
}
.fvam-card-hdr:hover { background: var(--fvam-bg-hover); }
/* Section title — spec §9: 12px bold uppercase */
.fvam-card-title {
    font-weight: bold;
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: .5px;
    color: var(--fvam-text-primary);
}
.fvam-card-meta  { display: flex; gap: 5px; align-items: center; }
.fvam-card-body  { padding: 4px 0; background: var(--fvam-bg-base); }
.fvam-card-body.fvam-hidden { display: none; }
.fvam-chevron {
    font-size: 9px;
    color: var(--fvam-accent);
    margin-left: 3px;
    transition: transform .2s;
}
.fvam-card-hdr.fvam-collapsed .fvam-chevron { transform: rotate(-90deg); }

/* ── Badges ──────────────────────────────────────────────────────────────── */
.fvam-badge {
    font-size: 10px;
    padding: 1px 6px;
    border-radius: 10px;
    font-weight: bold;
    white-space: nowrap;
}
.fvam-badge-ok       { background: var(--fvam-status-ok-bg);   color: var(--fvam-status-ok); }
.fvam-badge-warn     { background: var(--fvam-status-warn-bg);  color: var(--fvam-status-warn-alt); }
.fvam-badge-critical { background: var(--fvam-status-crit-bg);  color: var(--fvam-status-crit-alt); }
.fvam-badge-info     { background: var(--fvam-status-info-bg);  color: var(--fvam-status-info); }
.fvam-badge-neutral  { background: var(--fvam-bg-input);        color: var(--fvam-text-primary); }

/* Shape indicators for accessibility (colourblind themes set ✓/⚠/✗) */
.fvam-badge-ok::before       { content: var(--fvam-shape-ok,   ""); font-size: 9px; }
.fvam-badge-warn::before     { content: var(--fvam-shape-warn, ""); font-size: 9px; }
.fvam-badge-critical::before { content: var(--fvam-shape-crit, ""); font-size: 9px; }

/* ── Consumable item rows ─────────────────────────────────────────────────── */
.fvam-item-row {
    display: grid;
    grid-template-columns: 1fr auto auto;
    gap: 8px;
    padding: 5px 10px;
    align-items: center;
    border-bottom: 1px solid var(--fvam-border-strip);
    transition: background .1s;
}
.fvam-item-row:last-child { border-bottom: none; }
.fvam-item-row:hover { background: var(--fvam-bg-card); }
.fvam-item-name { color: var(--fvam-text-card); font-size: 11.5px; }
.fvam-item-min  { font-size: 10px; color: var(--fvam-text-disabled); text-align: right; }
.fvam-qty { font-weight: bold; text-align: right; font-size: 12px; }
.fvam-qty.ok       { color: var(--fvam-status-ok); }
.fvam-qty.warn     { color: var(--fvam-status-warn); }
.fvam-qty.critical { color: var(--fvam-status-crit); }
.fvam-qty.neutral  { color: var(--fvam-text-secondary); }

/* ── Equipment rows (weapons / armor copies with loan detail) ─────────────── */
.fvam-eq-row {
    padding: 6px 10px;
    border-bottom: 1px solid var(--fvam-border-strip);
    transition: background .1s;
}
.fvam-eq-row:last-child { border-bottom: none; }
.fvam-eq-row:hover { background: var(--fvam-bg-card); }
.fvam-eq-name   { font-weight: bold; color: var(--fvam-text-secondary); font-size: 11px; margin-bottom: 3px; }
.fvam-eq-copies { display: flex; flex-direction: column; gap: 2px; padding-bottom: 1px; }
.fvam-eq-copy   { display: flex; align-items: center; gap: 6px; }
.fvam-copy-status { font-size: 10px; font-weight: 600; min-width: 75px; flex-shrink: 0; }
.fvam-copy-status.avail  { color: var(--fvam-status-avail); }
.fvam-copy-status.loaned { color: var(--fvam-status-info); }

/* ── Loot rows ───────────────────────────────────────────────────────────── */
.fvam-loot-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 5px 10px;
    border-bottom: 1px solid var(--fvam-border-strip);
    transition: background .1s;
}
.fvam-loot-row:last-child { border-bottom: none; }
.fvam-loot-row:hover { background: var(--fvam-bg-card); }
.fvam-loot-name { color: var(--fvam-text-card); font-size: 11.5px; }
.fvam-loot-qty  { font-weight: bold; color: var(--fvam-text-secondary); font-size: 12px; }

/* ── Vault tile grid ─────────────────────────────────────────────────────── */
.fvam-vault-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; padding: 10px; }
.fvam-vault-card {
    background: var(--fvam-bg-card);
    border: 1px solid var(--fvam-border-card);
    border-radius: 6px;
    padding: 12px 16px;
    text-align: center;
}
.fvam-vault-lbl { font-size: 10px; color: var(--fvam-text-muted); text-transform: uppercase; letter-spacing: 1px; }
/* Vault values — spec §9: strong values use accent */
.fvam-vault-val { font-size: 17px; font-weight: bold; color: var(--fvam-accent); margin-top: 4px; line-height: 1; }
.fvam-vault-sub { font-size: 10px; color: var(--fvam-text-disabled); margin-top: 3px; }

/* ── Generic stat rows ───────────────────────────────────────────────────── */
.fvam-stat-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 5px 10px;
    border-bottom: 1px solid var(--fvam-border-strip);
}
.fvam-stat-row:last-child { border-bottom: none; }
.fvam-stat-lbl { color: var(--fvam-text-muted); font-size: 11px; }
.fvam-stat-val { font-weight: 600; color: var(--fvam-text-card); font-size: 11px; }
.fvam-stat-val.hi   { color: var(--fvam-accent); }
.fvam-stat-val.good { color: var(--fvam-status-ok); }
.fvam-stat-val.bad  { color: var(--fvam-status-crit); }
.fvam-stat-val.warn { color: var(--fvam-status-warn); }

/* ── Analytics rows ──────────────────────────────────────────────────────── */
.fvam-alert-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 5px 10px;
    border-bottom: 1px solid var(--fvam-border-strip);
}
.fvam-alert-row:last-child { border-bottom: none; }
.fvam-alert-name  { flex: 1; color: var(--fvam-text-card); font-size: 11px; }
.fvam-alert-stock { font-weight: bold; color: var(--fvam-status-crit); font-size: 11px; min-width: 40px; text-align: right; }
.fvam-alert-need  {
    font-size: 10px;
    background: var(--fvam-status-crit-bg);
    color: var(--fvam-status-crit-alt);
    padding: 1px 6px;
    border-radius: 10px;
    font-weight: bold;
}

/* ── Loan Summary blocks ─────────────────────────────────────────────────── */
.fvam-loan-block { padding: 6px 10px; border-bottom: 1px solid var(--fvam-border-strip); }
.fvam-loan-block:last-child { border-bottom: none; }
.fvam-loan-member { font-weight: 600; color: var(--fvam-status-info); font-size: 11.5px; margin-bottom: 2px; }
.fvam-loan-count  { color: var(--fvam-text-disabled); font-weight: normal; font-size: 10px; margin-left: 5px; }
.fvam-loan-items  { font-size: 10.5px; color: var(--fvam-text-muted); line-height: 1.4; }

/* ── Config panel ────────────────────────────────────────────────────────── */
.fvam-cfg-section { margin-bottom: 14px; }
/* Config section headers — same left-border treatment as card titles */
.fvam-cfg-hdr {
    font-size: 9px;
    font-weight: bold;
    color: var(--fvam-text-muted);
    text-transform: uppercase;
    letter-spacing: .5px;
    margin-bottom: 6px;
    padding-bottom: 4px;
    border-bottom: 1px solid var(--fvam-border-section);
}
/* Collapsible config sub-section (e.g. OC item threshold list) */
.fvam-cfg-collapsible-hdr {
    display: flex;
    justify-content: space-between;
    align-items: center;
    cursor: pointer;
    font-size: 9px;
    font-weight: bold;
    color: var(--fvam-text-muted);
    text-transform: uppercase;
    letter-spacing: .5px;
    padding-bottom: 4px;
    border-bottom: 1px solid var(--fvam-border-section);
    margin-bottom: 6px;
    user-select: none;
}
.fvam-cfg-collapsible-hdr:hover { color: var(--fvam-text-secondary); }
.fvam-cfg-collapsible-hdr .fvam-cfg-chevron { font-size: 9px; color: var(--fvam-text-disabled); transition: transform .2s; }
.fvam-cfg-collapsible-hdr.fvam-cfg-open   .fvam-cfg-chevron { transform: rotate(0deg); }
.fvam-cfg-collapsible-hdr.fvam-cfg-closed .fvam-cfg-chevron { transform: rotate(-90deg); }
.fvam-cfg-collapsible-body { overflow: hidden; }
.fvam-cfg-collapsible-body.fvam-cfg-hidden { display: none; }
/* Config hint text — spec §9: 10-11px, muted */
.fvam-cfg-hint { font-size: 10px; color: var(--fvam-text-muted); margin-bottom: 7px; }
.fvam-cfg-row  { display: grid; grid-template-columns: 1fr 90px; gap: 6px; align-items: center; margin-bottom: 5px; }
.fvam-cfg-lbl  { font-size: 11px; color: var(--fvam-text-secondary); }
/* Theme selector dropdown */
.fvam-theme-select {
    background: var(--fvam-bg-input);
    border: 1px solid var(--fvam-border-input);
    border-radius: 4px;
    color: var(--fvam-text-primary);
    padding: 5px 8px;
    font-size: 12px;
    cursor: pointer;
    width: 100%;
}

/* ── Inputs — spec §5: bg-input, 1px border-input, 4px radius ───────────── */
.fvam-input {
    background: var(--fvam-bg-input);
    border: 1px solid var(--fvam-border-input);
    border-radius: 4px;
    color: var(--fvam-text-primary);
    padding: 5px 8px;
    font-size: 12px;
    box-sizing: border-box;
    width: 100%;
    transition: border-color .15s;
}
.fvam-input:focus { outline: none; border-color: var(--fvam-accent); }
.fvam-input.full  { display: block; }

/* ── Buttons — spec §5 primary/secondary pattern ─────────────────────────── */
/* Primary: filled accent, dark text */
.fvam-btn {
    background: var(--fvam-accent);
    border: 1px solid var(--fvam-accent);
    border-radius: 4px;
    color: var(--fvam-bg-deep);
    padding: 5px 12px;
    cursor: pointer;
    font-size: 12px;
    font-weight: bold;
    transition: background .15s, border-color .15s;
}
.fvam-btn:hover {
    background: var(--fvam-accent-hover);
    border-color: var(--fvam-accent-hover);
}
/* Ghost / secondary: transparent background, border only */
.fvam-btn.ghost {
    background: transparent;
    border: 1px solid var(--fvam-border-input);
    color: var(--fvam-text-secondary);
}
.fvam-btn.ghost:hover {
    background: var(--fvam-bg-hover);
    color: var(--fvam-text-primary);
    border-color: var(--fvam-accent-dim);
}
.fvam-btn-row { display: flex; gap: 8px; margin-top: 12px; }
.fvam-btn-row .fvam-btn { flex: 1; }
#fvam-cfg-status { text-align: center; font-size: 11px; margin-top: 8px; min-height: 14px; }

/* ── OC cross-reference tags ─────────────────────────────────────────────── */
.fvam-oc-tag {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    font-size: 10px;
    font-weight: 600;
    padding: 1px 6px;
    border-radius: 10px;
    white-space: nowrap;
    margin-left: 4px;
}
.fvam-oc-tag.confirmed   { background: var(--fvam-status-info-bg);  color: var(--fvam-status-info); }
.fvam-oc-tag.unconfirmed { background: var(--fvam-status-crit-bg);  color: var(--fvam-status-crit-alt); }
.fvam-oc-tag.nooc        { background: var(--fvam-status-warn-bg);  color: var(--fvam-status-warn-alt); }

/* ── OC Item Requirements grid ───────────────────────────────────────────── */
.fvam-oc-req-hdr {
    display: grid;
    grid-template-columns: 110px 1fr 110px 70px 1fr;
    gap: 6px;
    padding: 4px 10px;
    border-bottom: 1px solid var(--fvam-border-strip);
    font-size: 9px;
    color: var(--fvam-text-disabled);
    text-transform: uppercase;
    letter-spacing: .5px;
}
.fvam-oc-req-row {
    display: grid;
    grid-template-columns: 110px 1fr 110px 70px 1fr;
    gap: 6px;
    padding: 5px 10px;
    border-bottom: 1px solid var(--fvam-border-strip);
    align-items: center;
    font-size: 11px;
}
.fvam-oc-req-row:last-child { border-bottom: none; }
.fvam-oc-req-row:hover { background: var(--fvam-bg-card); }
.fvam-oc-req-row.unconfirmed { background: var(--fvam-bg-row); }
.fvam-oc-req-member { color: var(--fvam-text-card); font-size: 11px; }
.fvam-oc-req-crime  { color: var(--fvam-text-muted); font-size: 10px; margin-top: 1px; }
.fvam-oc-req-item   { color: var(--fvam-text-secondary); font-size: 11px; }

/* ── Unnecessary loans grid ──────────────────────────────────────────────── */
.fvam-ul-hdr {
    display: grid;
    grid-template-columns: 120px 1fr 1fr auto;
    gap: 6px;
    padding: 4px 10px;
    border-bottom: 1px solid var(--fvam-border-strip);
    font-size: 9px;
    color: var(--fvam-text-disabled);
    text-transform: uppercase;
    letter-spacing: .5px;
}
.fvam-ul-row {
    display: grid;
    grid-template-columns: 120px 1fr 1fr auto;
    gap: 6px;
    padding: 5px 10px;
    border-bottom: 1px solid var(--fvam-border-strip);
    align-items: center;
    font-size: 11px;
}
.fvam-ul-row:last-child { border-bottom: none; }
.fvam-ul-row:hover { background: var(--fvam-bg-card); }
.fvam-ul-row.unconfirmed { background: var(--fvam-bg-row); }

/* ── Miscellaneous states ────────────────────────────────────────────────── */
.fvam-empty {
    padding: 14px;
    text-align: center;
    color: var(--fvam-text-disabled);
    font-size: 11px;
}
.fvam-loading {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    padding: 28px;
    color: var(--fvam-text-muted);
}
.fvam-spinner {
    width: 18px;
    height: 18px;
    border: 2px solid var(--fvam-border-strip);
    border-top-color: var(--fvam-accent);
    border-radius: 50%;
    flex-shrink: 0;
    animation: fvam-spin .7s linear infinite;
}
@keyframes fvam-spin { to { transform: rotate(360deg); } }
.fvam-err-box {
    padding: 18px;
    text-align: center;
    color: var(--fvam-text-label);
    font-size: 11.5px;
    line-height: 1.7;
}
.fvam-err-box strong { color: var(--fvam-status-crit); }
/* Welcome / info notice strip */
.fvam-notice {
    margin: 0 0 10px;
    padding: 8px 12px;
    background: var(--fvam-banner-ok-bg);
    border: 1px solid var(--fvam-banner-ok-border);
    border-radius: 4px;
    font-size: 11px;
    color: var(--fvam-banner-ok-text);
    line-height: 1.5;
}

/* ── Donation UI ─────────────────────────────────────────────────────────── */
.fvam-don-form { padding: 10px; border-bottom: 1px solid var(--fvam-border-strip); display: flex; flex-direction: column; gap: 7px; }
.fvam-don-form select.fvam-input { cursor: pointer; }
.fvam-don-row { display: flex; gap: 6px; align-items: center; }
.fvam-don-row .fvam-input { flex: 1; }
.fvam-don-status { font-size: 11px; min-height: 14px; padding: 0 10px 6px; }
.fvam-don-date   { color: var(--fvam-text-disabled); font-size: 10px; }
.fvam-don-donor  { color: var(--fvam-status-info); font-weight: 600; }
.fvam-don-item   { color: var(--fvam-text-card); }
.fvam-don-note   { color: var(--fvam-text-muted); font-size: 10px; font-style: italic; }
.fvam-don-del {
    color: var(--fvam-text-disabled);
    cursor: pointer;
    font-size: 13px;
    line-height: 1;
    background: none;
    border: none;
    padding: 0 2px;
    transition: color .15s;
}
.fvam-don-del:hover { color: var(--fvam-status-crit); }
.fvam-don-ret {
    font-size: 10px;
    cursor: pointer;
    background: none;
    border: 1px solid var(--fvam-border-strip);
    color: var(--fvam-text-muted);
    border-radius: 4px;
    padding: 1px 6px;
    transition: all .15s;
    white-space: nowrap;
}
.fvam-don-ret:hover { border-color: var(--fvam-status-ok); color: var(--fvam-status-ok); }
.fvam-don-ret.returned { background: var(--fvam-status-ok-bg); border-color: var(--fvam-status-ok-border); color: var(--fvam-status-ok); }
.fvam-don-row-returned { opacity: .45; }
.fvam-don-log-row {
    display: grid;
    grid-template-columns: 90px 110px 1fr auto auto;
    gap: 6px;
    padding: 5px 10px;
    border-bottom: 1px solid var(--fvam-border-strip);
    align-items: start;
    font-size: 11px;
}
.fvam-don-log-row:last-child { border-bottom: none; }
.fvam-don-log-row:hover { background: var(--fvam-bg-card); }
.fvam-don-log-row.fvam-don-row-returned .fvam-don-item { text-decoration: line-through; color: var(--fvam-text-disabled); }
.fvam-don-summary-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 5px 10px;
    border-bottom: 1px solid var(--fvam-border-strip);
    font-size: 11px;
}
.fvam-don-summary-row:last-child { border-bottom: none; }
.fvam-don-lbl { color: var(--fvam-text-muted); }
.fvam-don-val { color: var(--fvam-text-card); font-weight: 600; }
.fvam-io-row { display: flex; gap: 8px; padding: 10px; border-top: 1px solid var(--fvam-border-strip); }
.fvam-io-row .fvam-btn { flex: 1; font-size: 11px; }

/* ── CSV export modal ────────────────────────────────────────────────────── */
#fvam-csv-modal {
    position: fixed;
    top: 0; left: 0; right: 0; bottom: 0;
    z-index: 99999;
    background: rgba(0, 0, 0, .75);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 16px;
}
#fvam-csv-modal-inner {
    background: var(--fvam-bg-card);
    border: 1px solid var(--fvam-border-accent);
    border-radius: 6px;
    width: 100%;
    max-width: 600px;
    max-height: 80vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
}
#fvam-csv-modal-hdr {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 14px;
    border-bottom: 1px solid var(--fvam-border-strip);
    flex-shrink: 0;
}
#fvam-csv-modal-hdr span { color: var(--fvam-accent); font-weight: bold; font-size: 12px; }
#fvam-csv-modal-close { background: none; border: none; color: var(--fvam-text-secondary); font-size: 16px; cursor: pointer; padding: 0 4px; }
#fvam-csv-modal-close:hover { color: var(--fvam-text-primary); }
#fvam-csv-modal-body { padding: 10px 14px; overflow-y: auto; flex: 1; }
#fvam-csv-modal-body p { font-size: 11px; color: var(--fvam-text-label); margin: 0 0 8px; }
#fvam-csv-textarea {
    width: 100%;
    height: 180px;
    background: var(--fvam-bg-deep);
    border: 1px solid var(--fvam-border-input);
    border-radius: 4px;
    color: var(--fvam-text-card);
    font-size: 10px;
    padding: 6px 8px;
    font-family: monospace;
    resize: vertical;
}
#fvam-csv-copy-btn {
    display: block;
    width: 100%;
    margin-top: 8px;
    background: var(--fvam-accent);
    color: var(--fvam-bg-deep);
    border: none;
    border-radius: 4px;
    padding: 7px;
    font-size: 11px;
    font-weight: bold;
    cursor: pointer;
    transition: background .15s;
}
#fvam-csv-copy-btn:hover { background: var(--fvam-accent-hover); }
#fvam-csv-copy-status { font-size: 10px; color: var(--fvam-status-ok); text-align: center; min-height: 14px; margin-top: 4px; }

/* ── Mobile / PDA — spec §10: 700px breakpoint ───────────────────────────── */
@media (max-width: 700px) {
    #fvam-root    { font-size: 12px; margin: 4px 0; border-radius: 4px; }
    #fvam-hdr     { padding: 8px 10px; gap: 6px; }
    .fvam-title   { font-size: 13px; }
    #fvam-body    { padding: 8px; }
    .fvam-vault-grid { grid-template-columns: 1fr 1fr; }
}
        `);
    }

    // ── Render helpers ────────────────────────────────────────────────────────

    function consCard(key, title, icon, grp, items) {
        if (!items || items.length === 0)
            return mkCard(key, icon + ' ' + title,
                '<span class="fvam-badge fvam-badge-neutral">Empty</span>',
                '<div class="fvam-empty">No items in armory.</div>', false);

        var alerts = 0, total = 0;
        var rows = items.map(function (item) {
            var min = getMin(item.name, grp), cls = qtyClass(item.quantity, min);
            if (cls === 'warn' || cls === 'critical') alerts++;
            total += (item.quantity || 0);
            var minTag = min > 0
                ? '<span class="fvam-item-min">min ' + min + '</span>'
                : '<span></span>';
            return '<div class="fvam-item-row">'
                + '<span class="fvam-item-name">' + itemLink(item.name, item.id) + '</span>'
                + minTag
                + '<span class="fvam-qty ' + cls + '">' + fmtNum(item.quantity) + '</span>'
                + '</div>';
        }).join('');

        var bc = alerts > 0 ? 'fvam-badge-warn' : 'fvam-badge-ok';
        var bt = alerts > 0 ? '&#9888; ' + alerts + ' low' : '&#10003; OK';
        var meta = '<span class="fvam-badge ' + bc + '">' + bt + '</span>'
                 + '<span class="fvam-badge fvam-badge-neutral">' + total + ' total</span>';
        return mkCard(key, icon + ' ' + title, meta, rows);
    }

    function equipCard(key, title, icon, items) {
        if (!items || items.length === 0)
            return mkCard(key, icon + ' ' + title,
                '<span class="fvam-badge fvam-badge-neutral">Empty</span>',
                '<div class="fvam-empty">No items in armory.</div>', false);

        var totalLoaned = items.reduce(function (s, i) { return s + (i.loaned || 0); }, 0);
        var rows = items.map(function (item) {
            var names  = loanNames(item);
            var ids    = loanIds(item);
            var nLoan  = item.loaned    || 0;
            var nAvail = item.available || 0;
            var total  = nLoan + nAvail;
            var totalLabel = total === 1 ? '1 item' : (total + ' items');
            var countLabel = ' <span style="font-size:10px;color:#555;font-weight:normal">' + totalLabel + '</span>';
            var copies = '';
            for (var ci = 0; ci < total; ci++) {
                var isLoan = ci < nLoan;
                copies += '<div class="fvam-eq-copy">'
                    + '<span style="color:#333;font-size:10px;min-width:14px;flex-shrink:0">' + (ci + 1) + '.</span>'
                    + (isLoan
                        ? '<span class="fvam-copy-status loaned">Loaned to: ' + memberLink(names[ci] || '?', ids[ci]) + '</span>'
                        : '<span class="fvam-copy-status avail">Available</span>')
                    + '</div>';
            }
            return '<div class="fvam-eq-row">'
                + '<div class="fvam-eq-name">' + itemLink(item.name, item.id) + countLabel + '</div>'
                + '<div class="fvam-eq-copies">' + copies + '</div>'
                + '</div>';
        }).join('');

        var meta = totalLoaned > 0
            ? '<span class="fvam-badge fvam-badge-info">'    + totalLoaned + ' on loan</span>'
            + '<span class="fvam-badge fvam-badge-neutral">' + items.length + ' types</span>'
            : '<span class="fvam-badge fvam-badge-neutral">' + items.length + ' items</span>';
        return mkCard(key, icon + ' ' + title, meta, rows);
    }

    function utilsCard(key, title, icon, items) {
        if (!items || items.length === 0)
            return mkCard(key, icon + ' ' + title,
                '<span class="fvam-badge fvam-badge-neutral">Empty</span>',
                '<div class="fvam-empty">No items in armory.</div>', false);

        var totalLoaned = items.reduce(function (s, i) { return s + (i.loaned || 0); }, 0);
        var hasCrimes   = store.crimes.length > 0;

        var rows = items.map(function (item) {
            var ids    = loanIds(item);
            var names  = loanNames(item);
            var nLoan  = item.loaned    || 0;
            var nAvail = item.available || 0;
            var total  = nLoan + nAvail;
            var totalLabel = total === 1 ? '1 item' : (total + ' items');
            var countLabel = ' <span style="font-size:10px;color:#555;font-weight:normal">' + totalLabel + '</span>';
            var copies = '';
            for (var ci = 0; ci < total; ci++) {
                var isLoan = ci < nLoan;
                var memberId   = ids[ci]   || '';
                var memberName = names[ci] || '?';
                var ocTag = '';

                if (isLoan && hasCrimes && memberId) {
                    var oc = ocInfoForMemberId(memberId);
                    if (!oc) {
                        ocTag = '<span class="fvam-oc-tag nooc">&#9888; No active OC</span>';
                    } else {
                        var ocTime = fmtOcTime(oc.status, oc.readyAt, oc.expiredAt);
                        var ocTimeStr = ocTime ? ' &middot; ' + ocTime : '';
                        if (!oc.hasReq) {
                            ocTag = '<span class="fvam-oc-tag confirmed">' + esc(oc.ocName) + ocTimeStr + '</span>';
                        } else if (oc.isAvailable) {
                            ocTag = '<span class="fvam-oc-tag confirmed">&#10003; ' + esc(oc.ocName) + ocTimeStr + '</span>';
                        } else {
                            ocTag = '<span class="fvam-oc-tag unconfirmed">&#33; ' + esc(oc.ocName) + ' &middot; item unconfirmed</span>';
                        }
                    }
                }

                copies += '<div class="fvam-eq-copy">'
                    + '<span style="color:#333;font-size:10px;min-width:14px;flex-shrink:0">' + (ci + 1) + '.</span>'
                    + (isLoan
                        ? '<span class="fvam-copy-status loaned">Loaned to: ' + memberLink(memberName, memberId) + '</span>' + ocTag
                        : '<span class="fvam-copy-status avail">Available</span>')
                    + '</div>';
            }
            return '<div class="fvam-eq-row">'
                + '<div class="fvam-eq-name">' + itemLink(item.name, item.id) + countLabel + '</div>'
                + '<div class="fvam-eq-copies">' + copies + '</div>'
                + '</div>';
        }).join('');

        var meta = totalLoaned > 0
            ? '<span class="fvam-badge fvam-badge-info">'    + totalLoaned + ' on loan</span>'
            + '<span class="fvam-badge fvam-badge-neutral">' + items.length + ' types</span>'
            : '<span class="fvam-badge fvam-badge-neutral">' + items.length + ' items</span>';
        return mkCard(key, icon + ' ' + title, meta, rows);
    }

    function lootCard(key, title, icon, items) {
        if (!items || items.length === 0)
            return mkCard(key, icon + ' ' + title,
                '<span class="fvam-badge fvam-badge-neutral">Empty</span>',
                '<div class="fvam-empty">No loot in armory.</div>', false);

        var total = items.reduce(function (s, i) { return s + (i.quantity || 0); }, 0);
        var rows  = items.map(function (item) {
            return '<div class="fvam-loot-row">'
                + '<span class="fvam-loot-name">' + itemLink(item.name, item.id) + '</span>'
                + '<span class="fvam-loot-qty">'  + fmtNum(item.quantity || 0) + '</span>'
                + '</div>';
        }).join('');

        var meta = '<span class="fvam-badge fvam-badge-neutral">' + items.length + ' types</span>'
                 + '<span class="fvam-badge fvam-badge-neutral">' + total + ' total</span>';
        return mkCard(key, icon + ' ' + title, meta, rows);
    }

    // ── Tab renderers ─────────────────────────────────────────────────────────
    function tabVault() {
        var v   = store.vault || {};
        var tf  = v.factionFunds   || 0;   // true faction-owned (from cat=all)
        var ct  = v.currentTotal   || 0;   // current members sum
        var ext = v.exMemberTotal  || 0;   // ex-members sum
        var mt  = v.memberTotal    || 0;   // ct + ext
        var tv  = v.totalVault     || 0;
        var fp  = v.factionPoints  || 0;
        var mc  = v.memberCount    || store.currentDeposits.length || 0;
        var pv  = fp * POINTS_EST;
        var hasAll = !!v.hasAllData;       // true when cat=all succeeded

        // Tile 1: Faction Funds — exact when cat=all available, estimated otherwise
        var ffLbl = hasAll ? 'Faction Funds' : 'Faction + Ex-Members';
        var ffSub = hasAll ? 'faction-owned funds' : 'faction funds + ex-member deposits';
        var ffVal = hasAll ? tf : tf;  // same number, different label

        // Tile 2: Member Deposits — show current; note ex if present
        var memSub = hasAll && ext > 0
            ? fmt$(ct) + ' current + ' + fmt$(ext) + ' ex'
            : mc + ' current members';

        var grid = '<div class="fvam-vault-grid">'
            + '<div class="fvam-vault-card">'
            +   '<div class="fvam-vault-lbl">' + ffLbl + '</div>'
            +   '<div class="fvam-vault-val">' + fmt$(ffVal) + '</div>'
            +   '<div class="fvam-vault-sub">' + ffSub + '</div>'
            + '</div>'
            + '<div class="fvam-vault-card">'
            +   '<div class="fvam-vault-lbl">Member Deposits</div>'
            +   '<div class="fvam-vault-val">' + fmt$(hasAll ? mt : ct) + '</div>'
            +   '<div class="fvam-vault-sub">' + memSub + '</div>'
            + '</div>'
            + '<div class="fvam-vault-card">'
            +   '<div class="fvam-vault-lbl">Points Value</div>'
            +   '<div class="fvam-vault-val">' + fmt$(pv) + '</div>'
            +   '<div class="fvam-vault-sub">' + fmtNum(fp) + ' pts @ ' + fmt$(POINTS_EST) + '</div>'
            + '</div>'
            + '<div class="fvam-vault-card">'
            +   '<div class="fvam-vault-lbl">Total Vault</div>'
            +   '<div class="fvam-vault-val">' + fmt$(tv) + '</div>'
            +   '<div class="fvam-vault-sub">all cash combined</div>'
            + '</div>'
            + '</div>';

        var fPct  = tv > 0 ? Math.round(tf / tv * 100) : 0;
        var ctPct = tv > 0 ? Math.round(ct / tv * 100) : 0;
        var exPct = tv > 0 ? Math.round(ext / tv * 100) : 0;
        var mtPct = tv > 0 ? Math.round(mt / tv * 100) : 0;

        var statsBody = ''
            + '<div class="fvam-stat-row"><span class="fvam-stat-lbl">Faction-owned funds'
            +   (!hasAll ? ' <span style="font-size:9px;color:#888" title="cat=all unavailable — figure includes ex-member deposits">&#9432; estimated</span>' : '')
            + '</span><span class="fvam-stat-val hi">' + fmt$(tf) + ' (' + fPct + '%)</span></div>'
            + (hasAll && ext > 0
                ? '<div class="fvam-stat-row"><span class="fvam-stat-lbl">Ex-member deposits</span>'
                +   '<span class="fvam-stat-val warn">' + fmt$(ext) + ' (' + exPct + '%)</span></div>'
                : '')
            + '<div class="fvam-stat-row"><span class="fvam-stat-lbl">Current member deposits</span>'
            +   '<span class="fvam-stat-val hi">' + fmt$(ct) + ' (' + ctPct + '%)</span></div>'
            + (hasAll && ext > 0
                ? '<div class="fvam-stat-row"><span class="fvam-stat-lbl">Total member deposits</span>'
                +   '<span class="fvam-stat-val">' + fmt$(mt) + ' (' + mtPct + '%)</span></div>'
                : '')
            + '<div class="fvam-stat-row"><span class="fvam-stat-lbl">Total vault balance</span>'
            +   '<span class="fvam-stat-val">' + fmt$(tv) + '</span></div>'
            + '<div class="fvam-stat-row"><span class="fvam-stat-lbl">Points (' + fmtNum(fp) + ')'
            +   (cfg.pointsOverride != null
                ? '<span style="font-size:9px;color:#ffa726;margin-left:5px">&#9998; override</span>'
                : '<span style="font-size:9px;color:#555;margin-left:5px">&#127760; live</span>')
            + '</span><span class="fvam-stat-val">approx ' + fmt$(pv)
            +   ' <span style="font-size:9px;color:#555;font-weight:normal">@ ' + fmt$(POINTS_EST) + '/pt</span></span></div>'
            + '<div class="fvam-stat-row"><span class="fvam-stat-lbl">Est. total value</span>'
            +   '<span class="fvam-stat-val hi">' + fmt$(tv + pv) + '</span></div>';

        function mRow(m, idx) {
            var name = m.username || m.name || ('ID ' + m.id);
            var pct  = tv > 0 ? (m.money / tv * 100).toFixed(1) : '0.0';
            return '<div class="fvam-item-row" style="grid-template-columns:20px 1fr auto auto">'
                + '<span style="color:#444;font-size:10px">' + (idx+1) + '</span>'
                + '<span class="fvam-item-name">' + memberLink(name, m.id) + '</span>'
                + '<span style="font-size:10px;color:#555">' + pct + '%</span>'
                + '<span class="fvam-qty neutral">' + fmt$(m.money || 0) + '</span>'
                + '</div>';
        }

        var currentRows = store.currentDeposits.length
            ? store.currentDeposits.map(mRow).join('')
            : '<div class="fvam-empty">No member deposit data.</div>';

        var hist = loadHistory();
        var histContent = '';
        if (hist.length < 2) {
            histContent = '<div class="fvam-empty">Refresh a few times to build history.</div>';
        } else {
            var HIST_MODES = [
                { key: 'factionFunds',  label: 'Faction Funds',   color: '#ff7700' },
                { key: 'memberTotal',   label: 'Member Deposits', color: '#42a5f5' },
                { key: 'totalVault',    label: 'Total Vault',     color: '#44ee88' },
                { key: 'pointsValue',   label: 'Points Value',    color: '#ffcc44' },
            ];

            function buildHistChart(modeKey) {
                var W = 460, H = 90, px = 6, py = 10;
                var TH = 32;
                var TOTAL_H = H + TH;
                var color = HIST_MODES.filter(function(m){return m.key===modeKey;})[0].color;
                var isPoints = modeKey === 'pointsValue';
                var vals = hist.map(function (s) {
                    if (isPoints) return (s.factionPoints || 0) * (s.pointsPrice || POINTS_EST || 0);
                    return s[modeKey] || s.factionMoney || 0;
                });
                var estimated = isPoints ? hist.map(function(s){ return !s.pointsPrice; }) : null;
                var maxV = Math.max.apply(null, vals), minV = Math.min.apply(null, vals), rng = maxV - minV || 1;
                var cW = W - px * 2, cH = H - py * 2;
                var chartOffY = TH;
                var coords = vals.map(function(v, i) {
                    var x = px + (hist.length > 1 ? (i / (hist.length - 1)) * cW : cW / 2);
                    var y = chartOffY + H - py - ((v - minV) / rng) * cH;
                    return { x: parseFloat(x.toFixed(1)), y: parseFloat(y.toFixed(1)) };
                });
                var solidPts = coords.map(function(c){ return c.x + ',' + c.y; }).join(' ');
                var dashedPts = '';
                if (isPoints) {
                    var dashSegs = [], curSeg = null;
                    estimated.forEach(function(est, i) {
                        if (est) {
                            if (!curSeg) curSeg = [];
                            if (i > 0 && !estimated[i-1]) curSeg.push(coords[i-1].x+','+coords[i-1].y);
                            curSeg.push(coords[i].x+','+coords[i].y);
                        } else {
                            if (curSeg) { curSeg.push(coords[i].x+','+coords[i].y); dashSegs.push(curSeg); curSeg = null; }
                        }
                    });
                    if (curSeg) dashSegs.push(curSeg);
                    dashedPts = dashSegs.map(function(seg){
                        return '<polyline points="'+seg.join(' ')+'" fill="none" stroke="'+color+'" stroke-width="1.5" stroke-dasharray="4,3" opacity="0.5" stroke-linejoin="round"/>';
                    }).join('');
                }
                var aF = px + ',' + (chartOffY + H - py);
                var aL = (W - px) + ',' + (chartOffY + H - py);
                var dots = coords.map(function(c, i) {
                    return '<circle class="fvam-hc-dot" cx="'+c.x+'" cy="'+c.y+'" r="2.5" fill="'+color+'" opacity="0.7" data-i="'+i+'"/>';
                }).join('');
                var hitTargets = coords.map(function(c, i) {
                    var halfGap = hist.length > 1 ? (cW / (hist.length - 1)) / 2 : cW / 2;
                    var hitX = Math.max(px, c.x - halfGap);
                    var hitW = Math.min(halfGap * 2, W - hitX - px);
                    return '<rect class="fvam-hc-hit" x="'+hitX+'" y="'+chartOffY+'" width="'+hitW+'" height="'+H+'" fill="transparent" data-i="'+i+'" style="cursor:crosshair"/>';
                }).join('');
                var crosshair = '<line id="fvam-hc-xhair" x1="0" y1="'+chartOffY+'" x2="0" y2="'+(chartOffY+H)+'" stroke="'+color+'" stroke-width="0.5" opacity="0.6" style="display:none"/>';
                var tooltip = '<g id="fvam-hc-tip" style="display:none">'
                    + '<rect id="fvam-hc-tip-bg" x="0" y="2" width="120" height="26" rx="3" fill="#0f1a30" stroke="'+color+'" stroke-width="0.5" opacity="0.95"/>'
                    + '<text id="fvam-hc-tip-t1" x="6" y="13" font-size="9" fill="#ccc"></text>'
                    + '<text id="fvam-hc-tip-t2" x="6" y="24" font-size="9" fill="'+color+'" font-weight="bold"></text>'
                    + '</g>';
                var hlCircle = '<circle id="fvam-hc-hl" cx="0" cy="0" r="4" fill="'+color+'" stroke="#0f1a30" stroke-width="1.5" style="display:none"/>';
                var svgId = 'fvam-hc-' + modeKey;
                var svg = '<svg id="'+svgId+'" width="100%" viewBox="0 0 '+W+' '+TOTAL_H+'" style="display:block;padding:0 10px;box-sizing:border-box;overflow:visible">'
                    + '<defs><linearGradient id="fvamG2" x1="0" y1="0" x2="0" y2="1">'
                    + '<stop offset="0%" stop-color="'+color+'" stop-opacity=".18"/>'
                    + '<stop offset="100%" stop-color="'+color+'" stop-opacity="0"/>'
                    + '</linearGradient></defs>'
                    + '<polygon points="'+aF+' '+solidPts+' '+aL+'" fill="url(#fvamG2)"/>'
                    + '<polyline points="'+solidPts+'" fill="none" stroke="'+color+'" stroke-width="1.5" stroke-linejoin="round"/>'
                    + dashedPts
                    + '<text x="'+px+'" y="'+(chartOffY+H-2)+'" font-size="9" fill="#555">'+fmt$(minV)+'</text>'
                    + '<text x="'+px+'" y="'+(chartOffY+12)+'" font-size="9" fill="#555">'+fmt$(maxV)+'</text>'
                    + (isPoints && estimated && estimated.some(function(e){return e;})
                        ? '<text x="'+(W-px)+'" y="'+(chartOffY+H-2)+'" font-size="8" fill="#666" text-anchor="end">dashed = est. price</text>'
                        : '')
                    + crosshair + dots + hlCircle + tooltip + hitTargets
                    + '</svg>';

                setTimeout(function() {
                    var svgEl = document.getElementById(svgId);
                    if (!svgEl) return;
                    function showTip(i) {
                        var snap = hist[i], val = vals[i], prev = i > 0 ? vals[i-1] : null;
                        var diff = prev !== null ? val - prev : null;
                        var c = coords[i];
                        var dt = new Date(snap.ts);
                        var ts = dt.toLocaleDateString('en-GB',{day:'2-digit',month:'short'}) + ' ' + dt.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
                        var diffStr = diff !== null && diff !== 0 ? ' (' + (diff > 0 ? '+' : '') + fmt$(diff) + ')' : '';
                        var line1 = ts + diffStr;
                        var line2 = fmt$(val);
                        if (isPoints) {
                            var pts2 = snap.factionPoints || 0, price = snap.pointsPrice || POINTS_EST || 0, isEst = !snap.pointsPrice;
                            line2 = fmt$(val) + ' (' + fmtNum(pts2) + 'pts @ ' + fmt$(price) + (isEst?' est.':'') + ')';
                        }
                        var tipW = Math.min(Math.max(line1.length, line2.length) * 5.2 + 12, 200);
                        var tipX = c.x + 6;
                        if (tipX + tipW > W - px) tipX = c.x - tipW - 6;
                        tipX = Math.max(px, tipX);
                        var tipEl  = svgEl.querySelector('#fvam-hc-tip');
                        var tipBg  = svgEl.querySelector('#fvam-hc-tip-bg');
                        var tipT1  = svgEl.querySelector('#fvam-hc-tip-t1');
                        var tipT2  = svgEl.querySelector('#fvam-hc-tip-t2');
                        var xhair  = svgEl.querySelector('#fvam-hc-xhair');
                        var hlEl   = svgEl.querySelector('#fvam-hc-hl');
                        if (tipEl)  { tipEl.style.display  = ''; tipEl.setAttribute('transform','translate('+tipX+',0)'); }
                        if (tipBg)  { tipBg.setAttribute('width', tipW); }
                        if (tipT1)  tipT1.textContent = line1;
                        if (tipT2)  tipT2.textContent = line2;
                        if (xhair)  { xhair.style.display=''; xhair.setAttribute('x1',c.x); xhair.setAttribute('x2',c.x); }
                        if (hlEl)   { hlEl.style.display=''; hlEl.setAttribute('cx',c.x); hlEl.setAttribute('cy',c.y); }
                    }
                    function hideTip() {
                        ['#fvam-hc-tip','#fvam-hc-xhair','#fvam-hc-hl'].forEach(function(sel){
                            var el = svgEl.querySelector(sel); if (el) el.style.display = 'none';
                        });
                    }
                    svgEl.querySelectorAll('.fvam-hc-hit').forEach(function(hit) {
                        var i = parseInt(hit.dataset.i, 10);
                        hit.addEventListener('mouseenter', function(){ showTip(i); });
                        hit.addEventListener('mouseleave', hideTip);
                        hit.addEventListener('touchstart', function(e){ e.preventDefault(); showTip(i); }, {passive:false});
                        hit.addEventListener('touchend', hideTip);
                    });
                }, 60);
                return svg;
            }

            function buildHistRows(modeKey) {
                var isPoints = modeKey === 'pointsValue';
                var shown = hist.slice().reverse().slice(0, 15);
                return shown.map(function (snap, idx) {
                    var sv, priceNote = '';
                    if (isPoints) {
                        var pts2 = snap.factionPoints || 0, price = snap.pointsPrice || POINTS_EST || 0;
                        sv = pts2 * price;
                        var isEst = !snap.pointsPrice;
                        priceNote = ' <span style="font-size:9px;color:' + (isEst ? '#888' : '#555') + '">'
                            + (isEst ? '~' : '') + fmtNum(pts2) + 'pts @ ' + fmt$(price) + (isEst ? ' est.' : '') + '</span>';
                    } else {
                        sv = snap[modeKey] || snap.factionMoney || 0;
                    }
                    var prv = shown[idx + 1];
                    var pv2 = prv ? (isPoints ? ((prv.factionPoints||0)*(prv.pointsPrice||POINTS_EST||0)) : (prv[modeKey]||prv.factionMoney||0)) : null;
                    var d = pv2 !== null ? sv - pv2 : null;
                    var dTag = '';
                    if (d !== null && d !== 0) {
                        var cls2 = d > 0 ? 'good' : 'bad';
                        dTag = '<span class="fvam-stat-val ' + cls2 + '" style="font-size:10px;margin-right:6px">' + (d > 0 ? '+' : '') + fmt$(d) + '</span>';
                    }
                    var dt = new Date(snap.ts);
                    var ts = dt.toLocaleDateString() + ' ' + dt.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'});
                    return '<div class="fvam-stat-row"><span class="fvam-stat-lbl">' + ts + priceNote + '</span>'
                        + '<div style="display:flex;align-items:center">' + dTag
                        + '<span class="fvam-stat-val">' + fmt$(sv) + '</span></div></div>';
                }).join('');
            }

            var toggleBtns = HIST_MODES.map(function(m) {
                var active = m.key === 'factionFunds';
                return '<button data-fvam-hist-mode="' + m.key + '" style="'
                    + 'background:' + (active ? m.color : '#0f3460') + ';'
                    + 'color:' + (active ? '#000' : '#aaa') + ';'
                    + 'border:1px solid ' + (active ? m.color : '#2a4a7a') + ';'
                    + 'border-radius:3px;padding:2px 8px;font-size:10px;cursor:pointer;font-weight:'
                    + (active ? '700' : 'normal') + '">' + m.label + '</button>';
            }).join('');

            histContent = '<div style="display:flex;gap:5px;flex-wrap:wrap;padding:6px 10px 4px" id="fvam-hist-btns">' + toggleBtns + '</div>'
                + '<div id="fvam-hist-chart">' + buildHistChart('factionFunds') + '</div>'
                + '<div id="fvam-hist-rows">' + buildHistRows('factionFunds') + '</div>';

            setTimeout(function() {
                var btns = document.querySelectorAll('[data-fvam-hist-mode]');
                if (!btns.length) return;
                btns.forEach(function(btn) {
                    btn.addEventListener('click', function() {
                        var mode = btn.dataset.fvamHistMode;
                        var modeObj = HIST_MODES.filter(function(m){return m.key===mode;})[0];
                        btns.forEach(function(b) {
                            var mo = HIST_MODES.filter(function(m){return m.key===b.dataset.fvamHistMode;})[0];
                            b.style.background = (b === btn) ? mo.color : '#0f3460';
                            b.style.color      = (b === btn) ? '#000' : '#aaa';
                            b.style.border     = '1px solid ' + ((b === btn) ? mo.color : '#2a4a7a');
                            b.style.fontWeight = (b === btn) ? '700' : 'normal';
                        });
                        var chartEl = document.getElementById('fvam-hist-chart');
                        var rowsEl  = document.getElementById('fvam-hist-rows');
                        if (chartEl) chartEl.innerHTML = buildHistChart(mode);
                        if (rowsEl)  rowsEl.innerHTML  = buildHistRows(mode);
                    });
                });
            }, 50);
        }

        return grid
            + mkCard('vault-stats', 'Vault Breakdown', '', statsBody, true)
            + mkCard('vault-members', 'Current Member Deposits',
                '<span class="fvam-badge fvam-badge-neutral">' + mc + ' members &middot; ' + fmt$(ct) + '</span>',
                currentRows, false)
            + (ext > 0
                ? mkCard('vault-ex', 'Ex-Member Deposits',
                    '<span class="fvam-badge fvam-badge-warn">&#9888; ' + store.exMemberBalances.length + ' ex-members &middot; ' + fmt$(ext) + '</span>',
                    store.exMemberBalances.map(function (m, idx) {
                        var pct = tv > 0 ? (m.money / tv * 100).toFixed(1) : '0.0';
                        return '<div class="fvam-item-row" style="grid-template-columns:20px 1fr auto auto">'
                            + '<span style="color:#444;font-size:10px">' + (idx+1) + '</span>'
                            + '<span class="fvam-item-name" style="color:#ffaa33">' + memberLink(m.username || ('ID ' + m.id), m.id) + '</span>'
                            + '<span style="font-size:10px;color:#555">' + pct + '%</span>'
                            + '<span class="fvam-qty warn">' + fmt$(m.money || 0) + '</span>'
                            + '</div>';
                    }).join('') || '<div class="fvam-empty">No ex-member data.</div>',
                    true)
                : '')
            + mkCard('vault-history', 'Faction Funds History',
                '<span class="fvam-badge fvam-badge-neutral">' + hist.length + ' snapshots</span>',
                histContent, false);
    }

    function tabArmory() {
        return consCard('sec-drugs',     'Drugs',       '&#128138;', 'drugs',     store.drugs)
             + consCard('sec-medical',   'Medical',     '&#127973;', 'medical',   store.medical)
             + consCard('sec-boosters',  'Boosters',    '&#9889;',   'boosters',  store.boosters)
             + consCard('sec-temp',      'Temporary',   '&#128248;', 'temporary', store.temporary)
             + equipCard('sec-weapons',  'Weapons',     '&#128299;', store.weapons)
             + equipCard('sec-armor',    'Armor',       '&#128737;', store.armor)
             + utilsCard('sec-utils',    'Utilities',   '&#128736;', store.utilities)
             + lootCard('sec-loot',      'Loot',        '&#128142;', store.loot);
    }

    function tabAnalytics() {
        var groups = [
            { key: 'drugs',     items: store.drugs,     icon: '&#128138;' },
            { key: 'medical',   items: store.medical,   icon: '&#127973;' },
            { key: 'boosters',  items: store.boosters,  icon: '&#9889;'   },
            { key: 'temporary', items: store.temporary, icon: '&#128248;' }
        ];

        var alerts = [];
        groups.forEach(function (g) {
            g.items.forEach(function (item) {
                var min = getMin(item.name, g.key);
                if (min > 0 && item.quantity < min)
                    alerts.push({ icon: g.icon, name: item.name, id: item.id, qty: item.quantity, min: min,
                                  deficit: min - item.quantity, pct: Math.round(item.quantity / min * 100) });
            });
        });
        alerts.sort(function (a, b) { return a.pct - b.pct; });

        var alertBody = alerts.length === 0
            ? '<div class="fvam-empty">All items are above minimum stock levels.</div>'
            : alerts.map(function (a) {
                return '<div class="fvam-alert-row">'
                    + '<span class="fvam-alert-name">' + a.icon + ' ' + itemLink(a.name, a.id) + '</span>'
                    + '<span class="fvam-alert-stock">' + a.qty + '/' + a.min + '</span>'
                    + '<span class="fvam-alert-need">-' + a.deficit + '</span></div>';
              }).join('');
        var alertBadge = alerts.length > 0
            ? '<span class="fvam-badge fvam-badge-critical">&#9888; ' + alerts.length + '</span>'
            : '<span class="fvam-badge fvam-badge-ok">&#10003; All clear</span>';

        var allEquip    = store.weapons.concat(store.armor).concat(store.utilities);
        var totalLoaned = allEquip.reduce(function (s, i) { return s + (i.loaned || 0); }, 0);

        // Build itemId -> name lookup for the scraped breakdown to resolve names against
        var itemNameLookup = {};
        allEquip.forEach(function (item) { if (item.id) itemNameLookup[String(item.id)] = item.name; });

        // Flat per-member item list (API-sourced, always available) — used as the
        // source of truth for member list + counts, and as fallback content for
        // any item the scraper hasn't slot/bonus-tagged yet.
        var loanMap = {};
        allEquip.forEach(function (item) {
            var maxLoans = item.loaned || 0;
            var names    = loanNames(item);
            var ids      = loanIds(item);
            for (var ni = 0; ni < Math.min(names.length, maxLoans); ni++) {
                var n = names[ni];
                if (!loanMap[n]) loanMap[n] = { memberId: ids[ni] || '', items: [] };
                loanMap[n].items.push({ name: item.name, id: item.id });
            }
        });
        var bCount = Object.keys(loanMap).length;

        // Slot-grouped breakdown sourced from the armoury sub-tab scraper (weapons/armor
        // only — utilities aren't shown on those sub-tabs so they stay in the flat list).
        var slotBreakdown = buildMemberSlotBreakdown(itemNameLookup);
        var SLOT_ORDER = ['Primary', 'Secondary', 'Melee', 'Armor'];
        var SLOT_ICON  = { Primary: '&#128299;', Secondary: '&#128299;', Melee: '&#129704;', Armor: '&#129533;' };

        var loanBody = bCount === 0
            ? '<div class="fvam-empty">No equipment currently on loan.</div>'
            : '<div class="fvam-cfg-hint" style="padding:6px 10px 0">Primary/Secondary/Melee bonuses populate as you browse the Weapons and Armor sub-tabs — items not yet seen show name only.</div>'
            + Object.keys(loanMap).sort().map(function (m) {
                var entry  = loanMap[m];
                var its    = entry.items;
                var slots  = slotBreakdown[entry.memberId];

                var stockpileWarn = '';
                var slotHtml = '';
                if (slots) {
                    var stockpiled = SLOT_ORDER.slice(0, 3).filter(function (s) { return slots[s].length > 1; });
                    if (stockpiled.length > 0) {
                        stockpileWarn = '<span class="fvam-badge fvam-badge-warn" title="Holding more than one item in the same weapon slot — may be blocking others from accessing a bonus weapon">'
                            + '&#9888; ' + stockpiled.join(', ') + ' x' + stockpiled.map(function (s) { return slots[s].length; }).join('/') + '</span>';
                    }
                    slotHtml = SLOT_ORDER.map(function (slotKey) {
                        var list = slots[slotKey];
                        if (!list.length) return '';
                        var rowCls = list.length > 1 && slotKey !== 'Armor' ? ' style="color:var(--fvam-status-warn-alt)"' : '';
                        var itemsLine = list.map(function (it) {
                            var label = itemLink(it.name, it.itemId);
                            return it.bonusLabel ? (label + ' <span style="color:var(--fvam-status-info)">(' + esc(it.bonusLabel) + ')</span>') : label;
                        }).join(', ');
                        return '<div' + rowCls + '><strong style="font-size:10px;text-transform:uppercase;letter-spacing:.3px;color:var(--fvam-text-disabled)">' + SLOT_ICON[slotKey] + ' ' + slotKey + ':</strong> ' + itemsLine + '</div>';
                    }).join('');
                }

                // Fallback flat list for any flagged items not represented in the slot
                // breakdown (utilities, or weapons/armor not yet scraped for this member)
                var slottedNames = {};
                if (slots) {
                    SLOT_ORDER.forEach(function (sk) { slots[sk].forEach(function (it) { slottedNames[it.name] = true; }); });
                }
                var unslotted = its.filter(function (it) { return !slottedNames[it.name]; });
                var unslottedHtml = unslotted.length
                    ? '<div><strong style="font-size:10px;text-transform:uppercase;letter-spacing:.3px;color:var(--fvam-text-disabled)">&#128230; Other:</strong> '
                        + unslotted.map(function (it) { return itemLink(it.name, it.id); }).join(', ') + '</div>'
                    : '';

                var bodyHtml = (slotHtml || unslottedHtml) ? (slotHtml + unslottedHtml) : its.map(function (it) { return itemLink(it.name, it.id); }).join(', ');

                return '<div class="fvam-loan-block">'
                    + '<div class="fvam-loan-member">' + memberLink(m, entry.memberId)
                    + '<span class="fvam-loan-count">' + its.length + ' item' + (its.length > 1 ? 's' : '') + '</span>'
                    + stockpileWarn + '</div>'
                    + '<div class="fvam-loan-items">' + bodyHtml + '</div>'
                    + '</div>';
              }).join('');
        var loanBadge = '<span class="fvam-badge fvam-badge-info">'    + totalLoaned + ' on loan</span>'
                      + '<span class="fvam-badge fvam-badge-neutral">' + bCount + ' borrower' + (bCount !== 1 ? 's' : '') + '</span>';

        var v  = store.vault || {};
        var mc = store.currentDeposits.length || v.memberCount || 0;
        var td = store.drugs.reduce(function (s, i)     { return s + i.quantity; }, 0);
        var tm = store.medical.reduce(function (s, i)   { return s + i.quantity; }, 0);
        var tb = store.boosters.reduce(function (s, i)  { return s + i.quantity; }, 0);
        var tt = store.temporary.reduce(function (s, i) { return s + i.quantity; }, 0);
        var totalEquipQty = allEquip.reduce(function (s, i) { return s + (i.available || 0) + (i.loaned || 0); }, 0);
        var totalLootQty  = store.loot.reduce(function (s, i) { return s + (i.quantity || 0); }, 0);
        var lp            = totalEquipQty > 0 ? Math.round(totalLoaned / totalEquipQty * 100) : 0;

        var snapBody = ''
            + '<div class="fvam-stat-row"><span class="fvam-stat-lbl">Faction funds</span>'
            +   '<span class="fvam-stat-val hi">' + fmt$(v.factionFunds || 0) + '</span></div>'
            + '<div class="fvam-stat-row"><span class="fvam-stat-lbl">Member deposits</span>'
            +   '<span class="fvam-stat-val hi">' + fmt$(v.memberTotal || 0) + '</span></div>'
            + '<div class="fvam-stat-row"><span class="fvam-stat-lbl">Active members</span>'
            +   '<span class="fvam-stat-val">' + mc + '</span></div>'
            + '<div class="fvam-stat-row"><span class="fvam-stat-lbl">Drug units</span>'
            +   '<span class="fvam-stat-val">' + fmtNum(td) + (mc > 0 ? ' (' + (td/mc).toFixed(1) + '/mbr)' : '') + '</span></div>'
            + '<div class="fvam-stat-row"><span class="fvam-stat-lbl">Medical units</span>'
            +   '<span class="fvam-stat-val">' + fmtNum(tm) + (mc > 0 ? ' (' + (tm/mc).toFixed(1) + '/mbr)' : '') + '</span></div>'
            + '<div class="fvam-stat-row"><span class="fvam-stat-lbl">Booster units</span>'
            +   '<span class="fvam-stat-val">' + fmtNum(tb) + '</span></div>'
            + '<div class="fvam-stat-row"><span class="fvam-stat-lbl">Temporary units</span>'
            +   '<span class="fvam-stat-val">' + fmtNum(tt) + '</span></div>'
            + '<div class="fvam-stat-row"><span class="fvam-stat-lbl">Weapon types</span>'
            +   '<span class="fvam-stat-val">' + store.weapons.length + '</span></div>'
            + '<div class="fvam-stat-row"><span class="fvam-stat-lbl">Armor types</span>'
            +   '<span class="fvam-stat-val">' + store.armor.length + '</span></div>'
            + (store.utilities.length > 0
                ? '<div class="fvam-stat-row"><span class="fvam-stat-lbl">Utility types</span>'
                +   '<span class="fvam-stat-val">' + store.utilities.length + '</span></div>'
                : '')
            + (store.loot.length > 0
                ? '<div class="fvam-stat-row"><span class="fvam-stat-lbl">Loot items</span>'
                +   '<span class="fvam-stat-val">' + store.loot.length + ' types &middot; ' + fmtNum(totalLootQty) + ' total</span></div>'
                : '')
            + '<div class="fvam-stat-row"><span class="fvam-stat-lbl">Equipment on loan</span>'
            +   '<span class="fvam-stat-val ' + (lp > 50 ? 'bad' : 'good') + '">'
            + totalLoaned + ' of ' + totalEquipQty + ' (' + lp + '%)</span></div>';

        // ── OC Item Requirements card ─────────────────────────────────────────
        var ocReqCard = '';
        if (store.crimes.length > 0 || store.utilities.length > 0) {
            var utilItemMap = {};
            var allArmoryItems = store.utilities.concat(store.weapons).concat(store.armor)
                                 .concat(store.drugs).concat(store.medical)
                                 .concat(store.boosters).concat(store.temporary)
                                 .concat(store.loot);
            allArmoryItems.forEach(function (item) {
                var tid = String(item.ID || item.id || '');
                if (tid && item.name) utilItemMap[tid] = item.name;
            });
            Object.keys(store.tornItems).forEach(function (id) {
                utilItemMap[String(id)] = store.tornItems[id];
            });

            var ocRows = [];
            store.crimes.forEach(function (crime) {
                crime.participants.forEach(function (p) {
                    if (!p.hasReq) return;
                    var memberHasLoan = false;
                    var allArmoryForLoan = store.utilities.concat(store.weapons).concat(store.armor);
                    allArmoryForLoan.forEach(function (armItem) {
                        var armItemTypeId = String(armItem.ID || armItem.id || '');
                        if (armItemTypeId && armItemTypeId === String(p.itemId || '')) {
                            var ids = loanIds(armItem);
                            if (ids.indexOf(p.memberId) !== -1) memberHasLoan = true;
                        }
                    });
                    ocRows.push({
                        memberName:        p.memberName,
                        memberId:          p.memberId,
                        ocName:            crime.name,
                        status:            crime.status,
                        readyAt:           crime.readyAt,
                        expiredAt:         crime.expiredAt,
                        itemId:            p.itemId,
                        itemName:          p.itemId ? (utilItemMap[String(p.itemId)] || 'Item #' + p.itemId) : '',
                        isAvailable:       p.isAvailable,
                        isReusable:        p.isReusable,
                        fromFactionArmory: memberHasLoan
                    });
                });
            });

            ocRows.sort(function (a, b) {
                var aKey = (a.status === 'planning' && a.readyAt) ? a.readyAt : (a.expiredAt ? a.expiredAt + 1e9 : Infinity);
                var bKey = (b.status === 'planning' && b.readyAt) ? b.readyAt : (b.expiredAt ? b.expiredAt + 1e9 : Infinity);
                return aKey - bKey;
            });

            // ── Stock warning rows for utility items below threshold ──────────
            var stockWarnings = [];
            store.utilities.forEach(function (item) {
                var min   = getOcMin(item.name);
                var avail = item.available || 0;
                var loan  = item.loaned    || 0;
                var total = avail + loan;
                if (min > 0 && avail < min) {
                    stockWarnings.push({
                        name:  item.name,
                        id:    item.id,
                        avail: avail,
                        loan:  loan,
                        total: total,
                        min:   min,
                        // ratio for sorting: lower = more critical
                        ratio: min > 0 ? avail / min : 1
                    });
                }
            });
            stockWarnings.sort(function (a, b) { return a.ratio - b.ratio; });

            var stockBlock = '';
            if (stockWarnings.length > 0) {
                stockBlock = '<div style="margin:6px 8px 4px;padding:6px 8px;background:#1a0a00;border:1px solid #664400;border-radius:4px">'
                    + '<div style="font-size:9px;color:#cc8800;text-transform:uppercase;letter-spacing:.5px;margin-bottom:5px">&#9888; Low Stock — OC Items</div>'
                    + '<div style="display:grid;grid-template-columns:1fr auto auto auto;gap:4px 10px;align-items:center">'
                    + '<span style="font-size:9px;color:#555">Item</span>'
                    + '<span style="font-size:9px;color:#555;text-align:right">Available</span>'
                    + '<span style="font-size:9px;color:#555;text-align:right">On Loan</span>'
                    + '<span style="font-size:9px;color:#555;text-align:right">Min</span>'
                    + stockWarnings.map(function (w) {
                        var cls = w.avail === 0 ? '#ff4444' : '#ffaa33';
                        return '<span style="font-size:11px;color:#ccc">' + itemLink(w.name, w.id) + '</span>'
                            + '<span style="font-size:11px;font-weight:700;color:' + cls + ';text-align:right">' + w.avail + '</span>'
                            + '<span style="font-size:11px;color:#666;text-align:right">' + w.loan + '</span>'
                            + '<span style="font-size:11px;color:#888;text-align:right">' + w.min + '</span>';
                    }).join('')
                    + '</div></div>';
            }

            if (ocRows.length === 0 && stockWarnings.length === 0) {
                ocReqCard = mkCard('an-oc', '&#127918; OC Item Requirements',
                    '<span class="fvam-badge fvam-badge-ok">&#10003; All clear</span>',
                    '<div class="fvam-empty">No item requirements in active OCs and all stock above threshold.</div>', false);
            } else if (ocRows.length === 0) {
                // Stock warnings only, no active OC rows
                var swBadge = '<span class="fvam-badge fvam-badge-warn">&#9888; ' + stockWarnings.length + ' low stock</span>';
                ocReqCard = mkCard('an-oc', '&#127918; OC Item Requirements', swBadge, stockBlock, true);
            } else {
                var unconfirmedCount = ocRows.filter(function (r) { return !r.isAvailable; }).length;
                var ocBadge = '';
                if (unconfirmedCount > 0 || stockWarnings.length > 0) {
                    ocBadge = (unconfirmedCount > 0
                        ? '<span class="fvam-badge fvam-badge-critical">&#9888; ' + unconfirmedCount + ' unconfirmed</span>'
                        : '')
                        + (stockWarnings.length > 0
                        ? '<span class="fvam-badge fvam-badge-warn">&#9888; ' + stockWarnings.length + ' low stock</span>'
                        : '')
                        + '<span class="fvam-badge fvam-badge-neutral">' + ocRows.length + ' slots</span>';
                } else {
                    ocBadge = '<span class="fvam-badge fvam-badge-ok">&#10003; All confirmed</span>'
                        + '<span class="fvam-badge fvam-badge-neutral">' + ocRows.length + ' slots</span>';
                }

                var ocBody = stockBlock + '<div class="fvam-oc-req-hdr">'
                    + '<span>Member</span><span>OC</span><span>Item</span><span>Type</span><span>Status</span></div>'
                    + ocRows.map(function (r) {
                        var ocTime = fmtOcTime(r.status, r.readyAt, r.expiredAt);
                        var timeStr = ocTime ? '<span style="color:#555;font-size:10px"> &middot; ' + esc(ocTime) + '</span>' : '';
                        var readyTag = r.isAvailable
                            ? '<span class="fvam-oc-tag confirmed">&#10003; Ready</span>'
                            : '<span class="fvam-oc-tag unconfirmed">&#33; Missing</span>';
                        var sourceTag = r.isAvailable
                            ? (r.fromFactionArmory
                                ? '<span class="fvam-oc-tag confirmed" style="background:#0a2040;margin-left:3px">&#127962; Faction loan</span>'
                                : '<span class="fvam-oc-tag confirmed" style="background:#0a2a10;margin-left:3px">&#10003; Own inventory</span>')
                            : '';
                        var typeTag = r.isReusable != null
                            ? (r.isReusable
                                ? '<span style="font-size:10px;color:#555">&#128295; Tool</span>'
                                : '<span style="font-size:10px;color:#885500">&#128230; Material</span>')
                            : '<span style="color:#333;font-size:10px">—</span>';
                        return '<div class="fvam-oc-req-row' + (r.isAvailable ? '' : ' unconfirmed') + '">'
                            + '<span class="fvam-oc-req-member">' + memberLink(r.memberName, r.memberId) + '</span>'
                            + '<span style="color:#ccc">' + esc(r.ocName) + timeStr + '</span>'
                            + '<span style="color:#aaa;font-size:10.5px">' + itemLink(r.itemName, r.itemId) + '</span>'
                            + typeTag
                            + '<span style="display:flex;align-items:center;flex-wrap:wrap;gap:2px">' + readyTag + sourceTag + '</span>'
                            + '</div>';
                    }).join('');
                ocReqCard = mkCard('an-oc', '&#127918; OC Item Requirements', ocBadge, ocBody, unconfirmedCount > 0 || stockWarnings.length > 0);
            }
        }

        // ── Unnecessary Utility Loans card ───────────────────────────────────
        var unnecessaryCard = '';
        if (store.utilities.length > 0) {
            var unnecessaryRows = [];
            store.utilities.forEach(function (item) {
                var ids = loanIds(item);
                ids.forEach(function (memberId) {
                    var memberName = store.members[memberId] || ('ID ' + memberId);
                    var oc = ocInfoForMemberId(memberId);
                    var reason, reasonTag, urgency;
                    if (!oc) {
                        reason = 'No OC'; urgency = 0;
                        reasonTag = '<span class="fvam-oc-tag nooc">&#9888; No active OC</span>';
                    } else if (!oc.hasReq) {
                        var ocTime = fmtOcTime(oc.status, oc.readyAt, oc.expiredAt);
                        reason = 'Not required'; urgency = 2;
                        reasonTag = '<span class="fvam-oc-tag nooc">&#9432; No item needed' + (ocTime ? ' &middot; ' + esc(ocTime) : '') + '</span>';
                    } else {
                        var itemTypeId = String(item.ID || item.id || '');
                        if (oc.itemId && oc.itemId === itemTypeId) return;
                        var reqName = oc.itemId ? (store.tornItems[oc.itemId] || 'Item #' + oc.itemId) : 'unknown item';
                        var ocTime2 = fmtOcTime(oc.status, oc.readyAt, oc.expiredAt);
                        reason = 'Wrong item'; urgency = 1;
                        reasonTag = '<span class="fvam-oc-tag unconfirmed">&#33; Needs ' + esc(reqName) + (ocTime2 ? ' &middot; ' + esc(ocTime2) : '') + '</span>';
                    }
                    unnecessaryRows.push({
                        memberId:   memberId,
                        memberName: memberName,
                        itemName:   item.name,
                        itemId:     item.id,
                        ocLabel:    oc ? esc(oc.ocName) : '<span style="color:#555">—</span>',
                        reasonTag:  reasonTag,
                        urgency:    urgency
                    });
                });
            });
            unnecessaryRows.sort(function (a, b) { return a.urgency - b.urgency; });
            if (unnecessaryRows.length > 0) {
                var unnecBadge = '<span class="fvam-badge fvam-badge-warn">&#9888; ' + unnecessaryRows.length + ' unnecessary loan' + (unnecessaryRows.length !== 1 ? 's' : '') + '</span>';
                var unnecBody = '<div class="fvam-ul-hdr"><span>Member</span><span>Item</span><span>OC</span><span>Reason</span></div>'
                    + unnecessaryRows.map(function (r) {
                        return '<div class="fvam-ul-row unconfirmed">'
                            + '<span class="fvam-oc-req-member">' + memberLink(r.memberName, r.memberId) + '</span>'
                            + '<span style="color:#aaa;font-size:10.5px">' + itemLink(r.itemName, r.itemId) + '</span>'
                            + '<span style="color:#666;font-size:10px">' + r.ocLabel + '</span>'
                            + r.reasonTag
                            + '</div>';
                    }).join('');
                unnecessaryCard = mkCard('an-unnecessary', '&#128228; Unnecessary Utility Loans', unnecBadge, unnecBody, true);
            }
        }

        return mkCard('an-alerts', '&#9888;&#65039; Stock Alerts',   alertBadge, alertBody)
             + mkCard('an-loans',  '&#128228; Loan Summary',         loanBadge,  loanBody)
             + ocReqCard
             + unnecessaryCard
             + mkCard('an-snap',   '&#128202; Inventory Snapshot',   '', snapBody);
    }

    function tabDonations() {
        var log      = loadDonations();
        var donEquip = store.weapons.concat(store.armor);
        var itemOpts = '<option value="">&#8212; Select item &#8212;</option>';
        donEquip.slice().sort(function (a, b) { return a.name.localeCompare(b.name); }).forEach(function (item) {
            itemOpts += '<option value="' + esc(item.name) + '">' + esc(item.name) + '</option>';
        });
        var memberOpts = '<option value="">&#8212; Select donor &#8212;</option>';
        Object.keys(store.members).slice().sort(function (a, b) {
            return store.members[a].localeCompare(store.members[b]);
        }).forEach(function (id) {
            memberOpts += '<option value="' + esc(id) + '">' + esc(store.members[id]) + '</option>';
        });

        var form = '<div class="fvam-don-form">'
            + '<select class="fvam-input" id="fvam-don-item">' + itemOpts + '</select>'
            + '<select class="fvam-input" id="fvam-don-donor">' + memberOpts + '</select>'
            + '<div class="fvam-don-row">'
            +   '<input class="fvam-input" id="fvam-don-note" type="text" placeholder="Item identifier, e.g. Warlord 16% (optional)" maxlength="120">'
            +   '<button class="fvam-btn" style="flex:0;white-space:nowrap" data-fvam-action="don-add">+ Add</button>'
            + '</div></div>'
            + '<div class="fvam-don-status" id="fvam-don-status"></div>';

        var logBody = log.length === 0
            ? '<div class="fvam-empty">No donations recorded yet.</div>'
            : '<div style="padding:4px 10px 2px;display:grid;grid-template-columns:90px 110px 1fr auto auto;gap:6px;font-size:9px;color:#444;text-transform:uppercase;letter-spacing:.5px">'
            +   '<span>Date</span><span>Donor</span><span>Item / Note</span><span></span><span></span></div>'
            + log.slice().sort(function (a, b) { return new Date(b.date) - new Date(a.date); })
                  .map(function (e) {
                    var d   = new Date(e.date);
                    var ds  = d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'});
                    var note = e.note ? '<div class="fvam-don-note">&#128221; ' + esc(e.note) + '</div>' : '';
                    var ret  = e.returned;
                    var rowCls = ret ? ' fvam-don-row-returned' : '';
                    return '<div class="fvam-don-log-row' + rowCls + '">'
                        + '<span class="fvam-don-date">'  + esc(ds)          + '</span>'
                        + '<span class="fvam-don-donor">' + memberLink(e.donorName, e.donorId) + '</span>'
                        + '<div class="fvam-don-item">'   + esc(e.itemName)  + note + '</div>'
                        + '<button class="fvam-don-ret' + (ret ? ' returned' : '') + '" data-fvam-action="don-ret" data-don-id="' + esc(e.id) + '" title="' + (ret ? 'Mark as not returned' : 'Mark as returned') + '">'
                        +   (ret ? '&#10003; Returned' : 'Returned?') + '</button>'
                        + '<button class="fvam-don-del" data-fvam-action="don-del" data-don-id="' + esc(e.id) + '" title="Delete">&#x2715;</button>'
                        + '</div>';
                  }).join('');

        var totals = {}, retTotals = {};
        log.forEach(function (e) {
            totals[e.donorName]    = (totals[e.donorName]    || 0) + 1;
            if (e.returned) retTotals[e.donorName] = (retTotals[e.donorName] || 0) + 1;
        });
        var summaryBody = Object.keys(totals).length === 0
            ? '<div class="fvam-empty">No data yet.</div>'
            : Object.keys(totals).slice().sort(function (a, b) { return totals[b] - totals[a]; })
                  .map(function (n) {
                    var ret = retTotals[n] || 0, tot = totals[n];
                    var retTag = ret > 0 ? ' <span style="color:#66bb6a;font-size:10px">(' + ret + ' returned)</span>' : '';
                    return '<div class="fvam-don-summary-row">'
                        + '<span class="fvam-don-lbl">' + esc(n) + retTag + '</span>'
                        + '<span class="fvam-don-val">' + tot + ' item' + (tot > 1 ? 's' : '') + '</span></div>';
                  }).join('');

        var io = '<div class="fvam-io-row">'
            + '<button class="fvam-btn ghost" data-fvam-action="don-export">&#11015; Export CSV</button>'
            + '<label class="fvam-btn ghost" style="text-align:center;cursor:pointer">&#11014; Import CSV'
            +   '<input type="file" accept=".csv" id="fvam-don-import" style="display:none">'
            + '</label></div>'
            + '<div class="fvam-don-status" id="fvam-don-io-status" style="padding:4px 10px 8px"></div>';

        return mkCard('don-add',  '&#10133; Record Donation',
                    '<span class="fvam-badge fvam-badge-neutral">' + log.length + ' total</span>', form, true)
             + mkCard('don-log',  '&#128203; Donation Log',
                    '<span class="fvam-badge fvam-badge-neutral">' + log.length + ' entries</span>', logBody, log.length > 0)
             + mkCard('don-summ', '&#128202; By Donor', '', summaryBody, true)
             + io;
    }

    function tabConfig() {
        var groups = [
            { key: 'drugs',       label: '&#128138; Drugs' },
            { key: 'medical',     label: '&#127973; Medical' },
            { key: 'boosters',    label: '&#9889; Boosters' },
            { key: 'temporary',   label: '&#128248; Temporary' },
            { key: 'consumables', label: '&#128230; Consumables' }
        ];
        var groupRows = groups.map(function (g) {
            var v = cfg.groupMinimums[g.key] !== undefined ? cfg.groupMinimums[g.key] : '';
            return '<div class="fvam-cfg-row">'
                + '<span class="fvam-cfg-lbl">' + g.label + '</span>'
                + '<input class="fvam-input" type="number" min="0" data-grp="' + g.key + '" value="' + v + '" placeholder="0">'
                + '</div>';
        }).join('');

        var allItems = store.drugs.concat(store.medical).concat(store.boosters).concat(store.temporary);
        var itemRows = allItems.length > 0
            ? allItems.map(function (item) {
                var v = cfg.itemMinimums[item.name] !== undefined ? cfg.itemMinimums[item.name] : '';
                return '<div class="fvam-cfg-row">'
                    + '<span class="fvam-cfg-lbl">' + esc(item.name) + '</span>'
                    + '<input class="fvam-input" type="number" min="0" data-item="' + esc(item.name) + '" value="' + v + '" placeholder="&#8212;">'
                    + '</div>';
              }).join('')
            : '<div class="fvam-cfg-hint">Per-item fields appear after the first successful data load.</div>';

        var themeOptions = [
            ['default', 'Default (current look)'],
            ['torn', 'Torn Classic'],
            ['highcontrast', 'High Contrast (WCAG AAA)'],
            ['deuteranopia', 'Deuteranopia (Red/Green CB)'],
            ['protanopia', 'Protanopia (Red Deficiency)'],
            ['tritanopia', 'Tritanopia (Blue/Yellow CB)'],
            ['lowvision', 'Low Vision'],
            ['light', 'Light Mode']
        ];
        var savedTheme = GM_getValue(SK + 'theme', 'default');
        var themeOptHtml = themeOptions.map(function (t) {
            return '<option value="' + t[0] + '"' + (t[0] === savedTheme ? ' selected' : '') + '>' + t[1] + '</option>';
        }).join('');

        return '<div class="fvam-cfg-section">'
            + '<div class="fvam-cfg-hdr">&#127912; Colour Theme</div>'
            + '<div class="fvam-cfg-hint">Accessibility themes add &#10003; &#9888; &#10007; shape markers so status isn\'t colour-only.</div>'
            + '<select id="fvam-theme-select" class="fvam-input fvam-theme-select">' + themeOptHtml + '</select>'
            + '</div>'
            + '<div class="fvam-cfg-section">'
            + '<div class="fvam-cfg-hdr">&#128273; API Key</div>'
            + '<div class="fvam-cfg-hint">'
            +   'Requires <strong>Faction</strong> access (read). '
            +   'Your key is stored locally in this browser — it is never sent anywhere except api.torn.com. '
            +   'Error 16 = faction permission missing.'
            + '</div>'
            + '<input id="fvam-key-in" class="fvam-input full" type="password" value="' + esc(cfg.apiKey) + '" placeholder="Enter your Torn API key&#8230;">'
            + '</div>'
            + '<div class="fvam-cfg-section">'
            + '<div class="fvam-cfg-hdr">&#128176; Points Market Value</div>'
            + '<div class="fvam-cfg-hint">Auto-fetched from the live points market each hour. Enter a value below to override it manually. Clear the field to revert to live pricing.</div>'
            + '<div class="fvam-cfg-row">'
            + '<span class="fvam-cfg-lbl">Price per point ($)'
            +   (cfg.pointsOverride != null
                ? ' <span style="color:#ffa726;font-size:10px">&#9998; override active</span>'
                : ' <span style="color:#555;font-size:10px">&#127760; using live price (' + fmt$(POINTS_EST) + ')</span>')
            + '</span>'
            + '<input id="fvam-points-override" class="fvam-input" type="number" min="1" max="999999" value="' + (cfg.pointsOverride != null ? cfg.pointsOverride : '') + '" placeholder="' + POINTS_EST + ' (live)">'
            + '</div></div>'
            + '<div class="fvam-cfg-section">'
            + '<div class="fvam-cfg-hdr">&#128230; Group Minimum Stock</div>'
            + '<div class="fvam-cfg-hint">Alerts fire when stock falls below this level. Set 0 to disable a group.</div>'
            + groupRows + '</div>'
            + '<div class="fvam-cfg-section">'
            + '<div class="fvam-cfg-hdr">&#127919; Per-Item Overrides</div>'
            + '<div class="fvam-cfg-hint">Overrides the group minimum. Leave blank to use group default.</div>'
            + itemRows + '</div>'
            + '<div class="fvam-cfg-section">'
            + '<div class="fvam-cfg-collapsible-hdr fvam-cfg-closed" id="fvam-cfg-oc-toggle">'
            +   '&#128736; OC Item Stock Thresholds'
            +   '<span class="fvam-cfg-chevron">&#9660;</span>'
            + '</div>'
            + '<div class="fvam-cfg-collapsible-body fvam-cfg-hidden" id="fvam-cfg-oc-body">'
            + '<div class="fvam-cfg-hint">Alert in Analytics when available copies (not on loan) of a utility armory item fall below the threshold. Set 0 to disable.</div>'
            + '<div class="fvam-cfg-row">'
            +   '<span class="fvam-cfg-lbl">&#128230; Group default (all utility items)</span>'
            +   '<input id="fvam-cfg-oc-group" class="fvam-input" type="number" min="0" max="99"'
            +     ' value="' + (cfg.ocGroupMinimum != null ? cfg.ocGroupMinimum : 5) + '" placeholder="5">'
            + '</div>'
            + (store.utilities.length > 0
                ? store.utilities.map(function (item) {
                    var v = cfg.ocItemMinimums[item.name] !== undefined ? cfg.ocItemMinimums[item.name] : '';
                    var avail = item.available || 0;
                    var loan  = item.loaned    || 0;
                    return '<div class="fvam-cfg-row">'
                        + '<span class="fvam-cfg-lbl">' + esc(item.name)
                        +   ' <span style="color:#555;font-size:10px">' + avail + ' avail / ' + loan + ' on loan</span>'
                        + '</span>'
                        + '<input class="fvam-input" type="number" min="0" max="99" data-oc-item="' + esc(item.name) + '"'
                        +   ' value="' + v + '" placeholder="&#8212;">'
                        + '</div>';
                  }).join('')
                : '<div class="fvam-cfg-hint">Per-item overrides appear after the first successful data load.</div>')
            + '</div>'
            + '</div>'
            + '<div class="fvam-cfg-section">'
            + '<div class="fvam-cfg-hdr">&#8635; Auto-Refresh</div>'
            + '<div class="fvam-cfg-hint">How often the dashboard automatically refreshes data. Minimum 30 seconds.</div>'
            + '<div class="fvam-cfg-row">'
            + '<span class="fvam-cfg-lbl">Refresh every (seconds)</span>'
            + '<input id="fvam-cfg-refresh" class="fvam-input" type="number" min="30" max="3600" value="' + (cfg.refreshInterval || 60) + '" placeholder="60">'
            + '</div></div>'
            + '<div class="fvam-btn-row">'
            + '<button class="fvam-btn" data-fvam-action="save">&#128190; Save &amp; Refresh</button>'
            + '<button class="fvam-btn ghost" data-fvam-action="refresh">&#8635; Refresh Data</button>'
            + '</div>'
            + '<div id="fvam-cfg-status"></div>'
            + '<div style="margin-top:10px;font-size:10px;color:#555;text-align:center">Vault &amp; Armory Manager v' + VERSION + '</div>';
    }

    // ── Panel state ───────────────────────────────────────────────────────────
    function getBody() { return document.getElementById('fvam-body'); }

    function setLoading(msg) {
        var b = getBody();
        if (b) b.innerHTML = '<div class="fvam-loading"><div class="fvam-spinner"></div><span>' + (msg || 'Loading&#8230;') + '</span></div>';
    }

    function setError(html) {
        var b = getBody();
        if (b) b.innerHTML = '<div class="fvam-err-box">' + html + '</div>';
    }

    function renderTab(tab) {
        document.querySelectorAll('[data-fvam-tab]').forEach(function (el) {
            el.classList.toggle('active', el.dataset.fvamTab === tab);
        });
        var b = getBody();
        if (!b) return;
        if      (tab === 'vault')     b.innerHTML = tabVault();
        else if (tab === 'armory')    b.innerHTML = tabArmory();
        else if (tab === 'analytics') b.innerHTML = tabAnalytics();
        else if (tab === 'donations') b.innerHTML = tabDonations();
        else if (tab === 'config')    b.innerHTML = tabConfig();
    }

    // ── Dashboard collapse ────────────────────────────────────────────────────
    function applyCollapseState() {
        var root        = document.getElementById(PANEL_ID);
        var btn         = document.getElementById('fvam-collapse-btn');
        var collapsible = document.getElementById('fvam-collapsible');
        if (!root || !collapsible) return;
        if (cfg.collapsed) {
            root.classList.add('fvam-dash-collapsed');
            collapsible.style.maxHeight = '0';
            if (btn) { btn.title = 'Expand dashboard'; btn.innerHTML = '&#9650;'; }
        } else {
            root.classList.remove('fvam-dash-collapsed');
            collapsible.style.maxHeight = collapsible.scrollHeight + 'px';
            if (btn) { btn.title = 'Collapse dashboard'; btn.innerHTML = '&#9660;'; }
        }
    }

    function refreshCollapsibleHeight() {
        if (cfg.collapsed) return;
        var collapsible = document.getElementById('fvam-collapsible');
        if (collapsible) collapsible.style.maxHeight = collapsible.scrollHeight + 'px';
    }

    // ── Panel injection ───────────────────────────────────────────────────────
    function findTarget() {
        var sels = [
            '.armory-container','.faction-armoury-wrap','#faction-armoury',
            '.armoury-wrap','[class*="armoury"]','[class*="armory"]',
            '.content-wrapper','#faction-main-wrap','.mob-pad','.default-layout'
        ];
        for (var i = 0; i < sels.length; i++) {
            var el = document.querySelector(sels[i]);
            if (el) return el;
        }
        return null;
    }

    function buildRoot() {
        var root = document.createElement('div');
        root.id  = PANEL_ID;
        root.innerHTML =
            '<div id="fvam-hdr">'
            + '<span class="fvam-title">&#128176; Vault &amp; Armory Manager <span class="fvam-version">v' + VERSION + '</span></span>'
            + '<div id="fvam-hdr-right">'
            +   '<span id="fvam-last-upd"></span>'
            +   '<button class="fvam-hdr-btn" data-fvam-action="refresh" title="Refresh data">&#8635; Refresh</button>'
            +   '<button class="fvam-hdr-btn" id="fvam-collapse-btn" data-fvam-action="toggle-collapse" title="Collapse dashboard">&#9660;</button>'
            + '</div>'
            + '</div>'
            + '<div id="fvam-collapsible">'
            +   '<div id="fvam-tabs">'
            +     '<div class="fvam-tab" data-fvam-tab="vault">&#128176; Vault</div>'
            +     '<div class="fvam-tab" data-fvam-tab="armory">&#128299; Armory</div>'
            +     '<div class="fvam-tab" data-fvam-tab="analytics">&#128202; Analytics</div>'
            +     '<div class="fvam-tab" data-fvam-tab="donations">&#127873; Donations</div>'
            +     '<div class="fvam-tab" data-fvam-tab="config">&#9881;&#65039; Config</div>'
            +   '</div>'
            +   '<div id="fvam-body">'
            +     '<div class="fvam-loading"><div class="fvam-spinner"></div><span>Initialising&#8230;</span></div>'
            +   '</div>'
            + '</div>';
        return root;
    }

    // ── Global action handlers ────────────────────────────────────────────────
    window.fvamDonAdd = function () {
        var itemSel  = document.getElementById('fvam-don-item');
        var donorSel = document.getElementById('fvam-don-donor');
        var noteIn   = document.getElementById('fvam-don-note');
        var status   = document.getElementById('fvam-don-status');
        if (!itemSel || !donorSel) return;
        var itemName = itemSel.value, donorId = donorSel.value;
        if (!itemName) { if (status) { status.style.color='#ffa726'; status.textContent='Please select an item.'; } return; }
        if (!donorId)  { if (status) { status.style.color='#ffa726'; status.textContent='Please select a donor.'; } return; }
        var donorName = store.members[donorId] || ('ID ' + donorId);
        var note      = noteIn ? noteIn.value.trim() : '';
        var result    = addDonation(itemName, itemName, donorId, donorName, note);
        if (result.err === 'dup') {
            if (status) { status.style.color='#ffa726'; status.textContent='Already recorded today for this item + donor.'; }
            return;
        }
        if (status) { status.style.color='#66bb6a'; status.textContent='Donation recorded.'; }
        if (noteIn) noteIn.value = '';
        setTimeout(function () { renderTab('donations'); refreshCollapsibleHeight(); }, 600);
    };

    // ── Delegated event handler ───────────────────────────────────────────────
    function attachPanelEvents(root) {
        root.addEventListener('click', function (e) {
            var tabEl = e.target.closest('[data-fvam-tab]');
            if (tabEl) {
                cfg.activeTab = tabEl.dataset.fvamTab; saveCfg();
                renderTab(cfg.activeTab); refreshCollapsibleHeight(); return;
            }
            var hdr = e.target.closest('[data-fvam-section]');
            if (hdr) {
                hdr.classList.toggle('fvam-collapsed');
                var body = hdr.nextElementSibling;
                if (body) body.classList.toggle('fvam-hidden');
                cfg.sectionsOpen[hdr.dataset.fvamSection] = !hdr.classList.contains('fvam-collapsed');
                saveCfg(); refreshCollapsibleHeight(); return;
            }
            // Config sub-section collapsible toggle (OC item thresholds)
            var cfgToggle = e.target.closest('#fvam-cfg-oc-toggle');
            if (cfgToggle) {
                var cfgBody = document.getElementById('fvam-cfg-oc-body');
                var isOpen  = cfgToggle.classList.contains('fvam-cfg-open');
                cfgToggle.classList.toggle('fvam-cfg-open',   !isOpen);
                cfgToggle.classList.toggle('fvam-cfg-closed',  isOpen);
                if (cfgBody) cfgBody.classList.toggle('fvam-cfg-hidden', isOpen);
                refreshCollapsibleHeight(); return;
            }
            var btn = e.target.closest('[data-fvam-action]');
            if (btn) {
                var action = btn.dataset.fvamAction;
                if (action === 'toggle-collapse') { cfg.collapsed = !cfg.collapsed; saveCfg(); applyCollapseState(); return; }
                if (action === 'refresh')    { window.fvamRefresh(); return; }
                if (action === 'save')       { window.fvamSave();    return; }
                if (action === 'don-export') { exportDonationsCSV(); return; }
                if (action === 'don-add')    { window.fvamDonAdd();  return; }
                if (action === 'don-del') { deleteDonation(btn.dataset.donId); renderTab('donations'); refreshCollapsibleHeight(); return; }
                if (action === 'don-ret') { toggleDonationReturned(btn.dataset.donId); renderTab('donations'); refreshCollapsibleHeight(); return; }
            }
        });

        root.addEventListener('change', function (e) {
            var input = e.target;
            if (input.id === 'fvam-theme-select') { applyTheme(input.value); return; }
            if (input.id !== 'fvam-don-import' || !input.files || !input.files[0]) return;
            var reader = new FileReader();
            reader.onload = function (ev) {
                var result = importDonationsCSV(ev.target.result);
                var status = document.getElementById('fvam-don-io-status');
                if (status) {
                    status.style.color = result.added > 0 ? '#66bb6a' : '#aaa';
                    status.textContent = result.added + ' imported, ' + result.skipped + ' skipped (duplicates).';
                }
                renderTab('donations'); refreshCollapsibleHeight();
            };
            reader.readAsText(input.files[0]);
            input.value = '';
        });
    }

    window.fvamShowTab = function (tab) { cfg.activeTab = tab; saveCfg(); renderTab(tab); refreshCollapsibleHeight(); };

    window.fvamSave = async function () {
        var keyEl = document.getElementById('fvam-key-in');
        if (keyEl) cfg.apiKey = keyEl.value.trim();
        document.querySelectorAll('[data-grp]').forEach(function (el) {
            cfg.groupMinimums[el.dataset.grp] = parseInt(el.value) || 0;
        });
        cfg.itemMinimums = {};
        document.querySelectorAll('[data-item]').forEach(function (el) {
            var v = el.value.trim();
            if (v !== '' && !isNaN(parseInt(v))) cfg.itemMinimums[el.dataset.item] = parseInt(v);
        });
        var pointsEl = document.getElementById('fvam-points-override');
        if (pointsEl) {
            var pv = pointsEl.value.trim();
            cfg.pointsOverride = (pv !== '' && !isNaN(parseInt(pv)) && parseInt(pv) > 0) ? parseInt(pv) : null;
        }
        var refreshEl = document.getElementById('fvam-cfg-refresh');
        if (refreshEl) {
            var rv = parseInt(refreshEl.value.trim());
            cfg.refreshInterval = (!isNaN(rv) && rv >= 30) ? rv : 60;
        }
        // OC item stock thresholds
        var ocGrpEl = document.getElementById('fvam-cfg-oc-group');
        if (ocGrpEl) {
            var ogv = parseInt(ocGrpEl.value.trim());
            cfg.ocGroupMinimum = (!isNaN(ogv) && ogv >= 0) ? ogv : 5;
        }
        cfg.ocItemMinimums = {};
        document.querySelectorAll('[data-oc-item]').forEach(function (el) {
            var v = el.value.trim();
            if (v !== '' && !isNaN(parseInt(v))) cfg.ocItemMinimums[el.dataset.ocItem] = parseInt(v);
        });
        saveCfg();
        var s = document.getElementById('fvam-cfg-status');
        if (s) { s.style.color = '#66bb6a'; s.textContent = '&#10003; Saved'; }
        await window.fvamRefresh();
    };

    window.fvamRefresh = async function () {
        if (!cfg.apiKey) { renderTab('config'); refreshCollapsibleHeight(); return; }
        setLoading('Fetching armory data&#8230;');
        var result = await fetchAll();
        if (result.err) {
            var MSGS = {
                no_key: '<strong>No API key set.</strong> Add one in the &#9881;&#65039; Config tab.',
                api:    '<strong>API error</strong><br><span style="font-size:11px;color:#aaa">' + (result.msg || result.err) + '</span>'
            };
            setError(MSGS[result.err] || MSGS.api.replace('API error', 'API error ' + result.err));
            refreshCollapsibleHeight(); return;
        }
        dataLoaded = true;
        var ts = document.getElementById('fvam-last-upd');
        if (ts) ts.textContent = 'Updated ' + new Date().toLocaleTimeString();
        renderTab(cfg.activeTab || 'vault');
        refreshCollapsibleHeight();
        clearTimeout(window._fvamAutoRefresh);
        var intervalMs = Math.max(30, (cfg.refreshInterval || 60)) * 1000;
        window._fvamAutoRefresh = setTimeout(function() {
            if (cfg.apiKey) window.fvamRefresh();
        }, intervalMs);
    };

    // ── SPA Poller ────────────────────────────────────────────────────────────
    function onArmouryTab() {
        var h = window.location.hash;
        return h.indexOf('tab=armoury') !== -1 || h.indexOf('tab=armory') !== -1;
    }

    function poll() {
        var root = document.getElementById(PANEL_ID);
        if (!onArmouryTab()) { if (root) root.style.display = 'none'; return; }
        scrapeArmouryBonuses();
        if (root && root.style.display !== 'none') return;
        if (root) { root.style.display = ''; applyCollapseState(); return; }
        var target = findTarget();
        if (!target) return;
        var newRoot = buildRoot();
        target.insertBefore(newRoot, target.firstChild);
        applyTheme(GM_getValue(SK + 'theme', 'default'));
        attachPanelEvents(newRoot);
        applyCollapseState();
        if (!cfg.apiKey) {
            var body = getBody();
            if (body) {
                body.innerHTML =
                    '<div class="fvam-notice">&#128075; Welcome! Enter your faction API key in the Config tab to get started.</div>'
                    + tabConfig();
                document.querySelectorAll('[data-fvam-tab]').forEach(function (el) {
                    el.classList.toggle('active', el.dataset.fvamTab === 'config');
                });
            }
            refreshCollapsibleHeight(); return;
        }
        if (!dataLoaded) { window.fvamRefresh(); } else { renderTab(cfg.activeTab || 'vault'); refreshCollapsibleHeight(); }
    }

    // ── Armoury sub-tab bonus scraper ───────────────────────────────────────────
    /**
     * Scrapes per-copy weapon/armor bonus info from the currently-visible armoury
     * sub-tab (Weapons or Armor) DOM. Torn renders one <li> per physical copy with
     * a data-armoryid + data-itemid pair on the .img-wrap, and an optional bonus
     * <i title="<b>Name</b><br/>description with a number"> inside ul.bonuses.
     *
     * Since only one sub-tab's items are in the DOM at a time, results are merged
     * into the existing cache rather than replacing it wholesale — so previously
     * seen Weapons bonuses survive while the Armor sub-tab is being viewed, etc.
     * No network requests — purely DOM reading, mirrors scanItemPage()'s approach.
     */
    function loadBonusCache() {
        try { return JSON.parse(GM_getValue(BONUS_CACHE_KEY, '{}')) || {}; }
        catch (_) { return {}; }
    }
    function saveBonusCache(cache) {
        try { GM_setValue(BONUS_CACHE_KEY, JSON.stringify(cache)); } catch (_) {}
    }
    /** Parse a Torn bonus title attribute "<b>Name</b><br/>description with N%" into {name, pct}. */
    function parseBonusTitle(title) {
        if (!title) return null;
        var nameMatch = title.match(/<b>([^<]+)<\/b>/);
        if (!nameMatch) return null;
        var name = nameMatch[1].trim();
        var descMatch = title.match(/<\/b>.*?(\d+(?:\.\d+)?)/);
        var pct = descMatch ? parseFloat(descMatch[1]) : null;
        return { name: name, pct: pct };
    }
    function scrapeArmouryBonuses() {
        if (!onArmouryTab()) return;
        var rows = document.querySelectorAll('.img-wrap[data-armoryid][data-itemid]');
        if (!rows.length) return;
        var cache = loadBonusCache();
        var changed = false;
        rows.forEach(function (imgWrap) {
            var armoryId = imgWrap.getAttribute('data-armoryid');
            var itemId   = imgWrap.getAttribute('data-itemid');
            if (!armoryId || !itemId) return;
            var li = imgWrap.closest('li');
            if (!li) return;
            var bonusIcon = li.querySelector('ul.bonuses li.bonus i[title]');
            var parsed    = bonusIcon ? parseBonusTitle(bonusIcon.getAttribute('title')) : null;
            // Loaned-to member, if any — same <li> also carries this, so we capture
            // armoryId -> memberId mapping here too (the v2 API gives us member IDs
            // per item type but not per physical copy, so this is the only source).
            var loanLink = li.querySelector('.loaned a[href*="XID="]');
            var memberId = null;
            if (loanLink) {
                var m = loanLink.getAttribute('href').match(/XID=(\d+)/);
                if (m) memberId = m[1];
            }
            var slotType = '';
            var typeEl = li.querySelector('.type');
            if (typeEl) slotType = typeEl.textContent.trim();
            var entry = {
                itemId:   itemId,
                name:     parsed ? parsed.name : null,
                pct:      parsed ? parsed.pct  : null,
                memberId: memberId,
                slot:     slotType || null
            };
            var prev = cache[armoryId];
            if (!prev || prev.itemId !== entry.itemId || prev.name !== entry.name
                || prev.pct !== entry.pct || prev.memberId !== entry.memberId || prev.slot !== entry.slot) {
                cache[armoryId] = entry;
                changed = true;
            }
        });
        if (changed) saveBonusCache(cache);
    }
    /** Look up cached bonus info for a specific armory copy. Returns null if not yet scraped or no bonus. */
    function getBonusForArmoryId(armoryId) {
        if (!armoryId) return null;
        var cache = loadBonusCache();
        var entry = cache[armoryId];
        if (!entry || !entry.name) return null;
        return entry;
    }
    /**
     * Build a per-member breakdown of loaned copies grouped by slot (Primary,
     * Secondary, Melee, Armor), sourced entirely from the scraped armoury cache
     * (which carries memberId + slot + bonus per physical copy). Items resolve
     * their display name via utilItemMap/store data by itemId.
     * Returns Map<memberId, { Primary:[], Secondary:[], Melee:[], Armor:[] }>
     * where each array entry is { itemId, name, bonusLabel }.
     * Members/items not yet seen by the scraper (e.g. sub-tab never visited)
     * simply won't appear here — caller should fall back to the API-only view.
     */
    function buildMemberSlotBreakdown(itemNameLookup) {
        var cache = loadBonusCache();
        var bySlot = {};
        Object.keys(cache).forEach(function (armoryId) {
            var entry = cache[armoryId];
            if (!entry || !entry.memberId) return;
            var slotKey = entry.slot === 'Primary' ? 'Primary'
                        : entry.slot === 'Secondary' ? 'Secondary'
                        : entry.slot === 'Melee' ? 'Melee'
                        : entry.slot === 'Defensive' ? 'Armor'
                        : null;
            if (!slotKey) return;
            if (!bySlot[entry.memberId]) bySlot[entry.memberId] = { Primary: [], Secondary: [], Melee: [], Armor: [] };
            var name = (itemNameLookup && itemNameLookup[entry.itemId]) || ('Item #' + entry.itemId);
            var bonusLabel = entry.name ? (entry.name + (entry.pct != null ? ' ' + entry.pct + '%' : '')) : null;
            bySlot[entry.memberId][slotKey].push({ itemId: entry.itemId, name: name, bonusLabel: bonusLabel });
        });
        return bySlot;
    }

    // ── item.php DOM scanner ──────────────────────────────────────────────────
    /**
     * Runs on item.php only. Scans the DOM for items with a "Return to Faction"
     * button (faction-loaned items) and caches them in GM storage so the armory
     * dashboard can cross-reference them with active OC requirements.
     * No network requests — purely DOM reading.
     */
    function scanItemPage() {
        if (!location.href.includes('item.php')) return;
        function doScan() {
            var loans = [];
            document.querySelectorAll('li.return[data-action="return"]').forEach(function (returnBtn) {
                var itemLi = returnBtn.closest('li[data-item]');
                if (!itemLi) return;
                var itemId   = itemLi.dataset.item     || '';
                var armoryId = itemLi.dataset.armoryid || '';
                var nameEl   = itemLi.querySelector('.name');
                var name     = nameEl ? nameEl.textContent.trim() : ('Item #' + itemId);
                if (itemId && armoryId) loans.push({ itemId: itemId, armoryId: armoryId, name: name });
            });
            GM_setValue(LOANS_CACHE_KEY, JSON.stringify({ ts: Math.floor(Date.now() / 1000), loans: loans }));
        }
        if (document.querySelector('li[data-item]')) {
            doScan();
        } else {
            var obs = new MutationObserver(function () {
                if (document.querySelector('li[data-item]')) { obs.disconnect(); setTimeout(doScan, 500); }
            });
            obs.observe(document.body, { childList: true, subtree: true });
        }
    }

    // ── Init ──────────────────────────────────────────────────────────────────
    function init() {
        loadCfg();
        if (location.href.includes('item.php')) { scanItemPage(); return; }
        injectStyles();
        setInterval(poll, POLL_MS);
        poll();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();