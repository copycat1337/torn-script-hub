// ==UserScript==
// @name         Cortex - RW Auction Insights
// @namespace    https://torn-cortex.pages.dev/
// @version      4.29.2
// @description  AAV (Average Auction Value) on every Ranked War weapon and armor auction. Shows what comparable gear actually sold for, how the current bid compares, and price trends. Built from completed sales via the official Torn API. No API key needed.
// @author       Cortex
// @match        https://www.torn.com/amarket.php*
// @run-at       document-end
// @homepageURL  https://torncortex.com
// @connect      torncortex.com
// @connect      api.torncortex.com
// @connect      torn-sentinel-api.somethingagainstme.workers.dev
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        GM_xmlhttpRequest
// @grant        GM.xmlHttpRequest
// @inject-into  auto
// @license      MIT
// @noframes
// @downloadURL https://update.greasyfork.org/scripts/587466/Cortex%20-%20RW%20Auction%20Insights.user.js
// @updateURL https://update.greasyfork.org/scripts/587466/Cortex%20-%20RW%20Auction%20Insights.meta.js
// ==/UserScript==
//
// COMPLIANCE: This script makes ZERO requests to Torn's servers. All auction
// data comes from a server-side data lake that ingests completed sales via
// Torn's official API. The script only reads the auction page you have open
// and fetches pre-computed valuations from our own worker. No API key needed.
// No scraping. No off-page access. No background requests of any kind.
//
// It is matched on the auction house alone, so your manager does not load it
// on any other Torn page. Once loaded it keeps watching the address, so the
// panel is taken down cleanly if you leave the auction house without the page
// reloading.
//
// Cortex: https://torncortex.com/companion
// Generated from source — do not edit by hand.

"use strict";
(() => {
  var RW_RARITIES = /* @__PURE__ */ new Set(["yellow", "orange", "red"]);
  function hasPerk(x) {
    return (x.bonuses ?? []).some((b) => typeof b?.id === "number" && Number.isFinite(b.id));
  }
  function isRwRarity(rarity) {
    return typeof rarity === "string" && RW_RARITIES.has(rarity.toLowerCase());
  }
  function isRwGearSale(s) {
    return hasPerk(s) && isRwRarity(s.rarity);
  }
  var WARLORD_BONUS_ID = 81;
  var REVITALIZE_BONUS_ID = 41;
  var PERK_CLASS = {
    warlord: "Utility",
    revitalize: "Utility",
    stricken: "Utility",
    plunder: "Utility",
    proficience: "Utility",
    irradiate: "Utility",
    eviscerate: "Support",
    weaken: "Support",
    wither: "Support",
    slow: "Support",
    cripple: "Support",
    motivation: "Support",
    suppress: "Support",
    paralyze: "Support",
    "home run": "Support",
    stun: "Support",
    disarm: "Support",
    achilles: "Damage",
    assassinate: "Damage",
    backstab: "Damage",
    berserk: "Damage",
    bleed: "Damage",
    blindside: "Damage",
    bloodlust: "Damage",
    comeback: "Damage",
    conserve: "Damage",
    crusher: "Damage",
    cupid: "Damage",
    deadeye: "Damage",
    deadly: "Damage",
    "double-edged": "Damage",
    "double tap": "Damage",
    empower: "Damage",
    execute: "Damage",
    expose: "Damage",
    finale: "Damage",
    focus: "Damage",
    frenzy: "Damage",
    fury: "Damage",
    grace: "Damage",
    parry: "Damage",
    penetrate: "Damage",
    powerful: "Damage",
    puncture: "Damage",
    quicken: "Damage",
    rage: "Damage",
    roshambo: "Damage",
    smurf: "Damage",
    specialist: "Damage",
    "sure shot": "Damage",
    throttle: "Damage",
    "wind-up": "Damage"
  };
  function perkClassOf(title) {
    if (!title) return null;
    return PERK_CLASS[title.trim().toLowerCase()] ?? null;
  }
  var BONUS_CATALOG = [
    { id: 50, title: "Achilles" },
    { id: 72, title: "Assassinate" },
    { id: 52, title: "Backstab" },
    { id: 54, title: "Berserk" },
    { id: 57, title: "Bleed" },
    { id: 33, title: "Blindfire" },
    { id: 51, title: "Blindside" },
    { id: 85, title: "Bloodlust" },
    { id: 67, title: "Comeback" },
    { id: 55, title: "Conserve" },
    { id: 45, title: "Cripple" },
    { id: 49, title: "Crusher" },
    { id: 47, title: "Cupid" },
    { id: 63, title: "Deadeye" },
    { id: 62, title: "Deadly" },
    { id: 36, title: "Demoralize" },
    { id: 86, title: "Disarm" },
    { id: 105, title: "Double Tap" },
    { id: 74, title: "Double-edged" },
    { id: 87, title: "Empower" },
    { id: 56, title: "Eviscerate" },
    { id: 75, title: "Execute" },
    { id: 1, title: "Expose" },
    { id: 82, title: "Finale" },
    { id: 79, title: "Focus" },
    { id: 38, title: "Freeze" },
    { id: 80, title: "Frenzy" },
    { id: 64, title: "Fury" },
    { id: 53, title: "Grace" },
    { id: 34, title: "Hazardous" },
    { id: 83, title: "Home run" },
    { id: 115, title: "Immutable", label: "Immutable (Helmet)" },
    { id: 26, title: "Impassable" },
    { id: 17, title: "Impenetrable" },
    { id: 22, title: "Imperviable", label: "Imperviable (Face Mask)" },
    { id: 15, title: "Impregnable" },
    { id: 92, title: "Insurmountable" },
    { id: 91, title: "Invulnerable", label: "Invulnerable (Gas Mask)" },
    { id: 102, title: "Irradiate" },
    { id: 121, title: "Irrepressible", label: "Irrepressible (Respirator)" },
    { id: 112, title: "Kinetokinesis", label: "Kinetokinesis (Hooves)" },
    { id: 89, title: "Lacerate" },
    { id: 61, title: "Motivation" },
    { id: 59, title: "Paralyze" },
    { id: 84, title: "Parry" },
    { id: 101, title: "Penetrate" },
    { id: 21, title: "Plunder" },
    { id: 68, title: "Powerful" },
    { id: 14, title: "Proficience" },
    { id: 66, title: "Puncture" },
    { id: 88, title: "Quicken" },
    { id: 90, title: "Radiation Protection" },
    { id: 65, title: "Rage" },
    { id: 41, title: "Revitalize" },
    { id: 43, title: "Roshambo" },
    { id: 120, title: "Shock" },
    { id: 44, title: "Slow" },
    { id: 104, title: "Smash" },
    { id: 73, title: "Smurf" },
    { id: 71, title: "Specialist" },
    { id: 35, title: "Spray" },
    { id: 37, title: "Storage" },
    { id: 20, title: "Stricken" },
    { id: 58, title: "Stun" },
    { id: 60, title: "Suppress" },
    { id: 78, title: "Sure Shot" },
    { id: 48, title: "Throttle" },
    { id: 103, title: "Toxin" },
    { id: 81, title: "Warlord" },
    { id: 46, title: "Weaken" },
    { id: 76, title: "Wind-up" },
    { id: 42, title: "Wither" }
  ];
  var BONUS_ALIASES = [
    { id: 116, title: "Immutable", label: "Immutable (Apron)" },
    { id: 117, title: "Immutable", label: "Immutable (Pants)" },
    { id: 118, title: "Immutable", label: "Immutable (Boots)" },
    { id: 119, title: "Immutable", label: "Immutable (Gloves)" },
    { id: 97, title: "Imperviable", label: "Imperviable (Body)" },
    { id: 98, title: "Imperviable", label: "Imperviable (Pants)" },
    { id: 99, title: "Imperviable", label: "Imperviable (Boots)" },
    { id: 100, title: "Imperviable", label: "Imperviable (Gloves)" },
    { id: 122, title: "Irrepressible", label: "Irrepressible (Body)" },
    { id: 123, title: "Irrepressible", label: "Irrepressible (Pants)" },
    { id: 124, title: "Irrepressible", label: "Irrepressible (Boots)" },
    { id: 125, title: "Irrepressible", label: "Irrepressible (Gloves)" },
    { id: 93, title: "Invulnerable", label: "Invulnerable (Body)" },
    { id: 94, title: "Invulnerable", label: "Invulnerable (Pants)" },
    { id: 95, title: "Invulnerable", label: "Invulnerable (Boots)" },
    { id: 96, title: "Invulnerable", label: "Invulnerable (Gloves)" },
    { id: 113, title: "Kinetokinesis", label: "Kinetokinesis (Clawshields)" },
    { id: 114, title: "Kinetokinesis", label: "Kinetokinesis (Visage)" }
  ];
  var TITLE_BY_ID = new Map(
    [...BONUS_CATALOG, ...BONUS_ALIASES].map((b) => [b.id, b.title])
  );
  function normalizeBonusName(name) {
    return String(name || "").toLowerCase().replace(/[\s-]/g, "");
  }
  var ID_BY_NORMALIZED_TITLE = new Map(
    [...BONUS_ALIASES, ...BONUS_CATALOG].map((b) => [normalizeBonusName(b.title), b.id])
  );
  var IDS_BY_NORMALIZED_TITLE = (() => {
    const map = /* @__PURE__ */ new Map();
    for (const b of [...BONUS_CATALOG, ...BONUS_ALIASES]) {
      const key = normalizeBonusName(b.title);
      const list = map.get(key);
      if (list) {
        if (!list.includes(b.id)) list.push(b.id);
      } else {
        map.set(key, [b.id]);
      }
    }
    return map;
  })();
  function bonusTitle(id) {
    return TITLE_BY_ID.get(id) ?? `Bonus #${id}`;
  }
  function bonusIdByTitle(name) {
    const key = normalizeBonusName(name);
    return key ? ID_BY_NORMALIZED_TITLE.get(key) ?? null : null;
  }
  function bonusIdsByTitle(name) {
    const key = normalizeBonusName(name);
    const ids = key ? IDS_BY_NORMALIZED_TITLE.get(key) : void 0;
    return ids ? [...ids] : [];
  }
  var PERK_RARITY_RANGES = [
    { id: 50, title: "Achilles", unit: "percent", yellow: [50, 74], orange: [75, 112], red: [113, 169] },
    { id: 72, title: "Assassinate", unit: "percent", yellow: [50, 70], orange: [70, 100], red: [100, 148] },
    { id: 52, title: "Backstab", unit: "percent", yellow: [30, 43], orange: [37, 64], red: [44, 96] },
    { id: 54, title: "Berserk", unit: "percent", yellow: [20, 35], orange: [36, 58], red: [60, 88] },
    { id: 57, title: "Bleed", unit: "percent", yellow: [20, 30], orange: [31, 46], red: [48, 72] },
    { id: 51, title: "Blindside", unit: "percent", yellow: [25, 39], orange: [40, 62], red: [63, 97] },
    { id: 85, title: "Bloodlust", unit: "percent", yellow: [10, 12], orange: [12, 15], red: [15, 19] },
    { id: 67, title: "Comeback", unit: "percent", yellow: [50, 70], orange: [70, 99], red: [102, 138] },
    { id: 55, title: "Conserve", unit: "percent", yellow: [25, 30], orange: [30, 37], red: [38, 49] },
    { id: 45, title: "Cripple", unit: "percent", yellow: [20, 29], orange: [29, 41], red: [43, 63] },
    { id: 49, title: "Crusher", unit: "percent", yellow: [50, 74], orange: [75, 108], red: [114, 171] },
    { id: 47, title: "Cupid", unit: "percent", yellow: [50, 74], orange: [75, 111], red: [113, 168] },
    { id: 63, title: "Deadeye", unit: "percent", yellow: [25, 45], orange: [45, 74], red: [75, 123] },
    { id: 62, title: "Deadly", unit: "percent", yellow: [2, 3], orange: [4, 6], red: [7, 10] },
    { id: 86, title: "Disarm", unit: "turns", yellow: [3, 5], orange: [5, 9], red: [9, 15] },
    { id: 74, title: "Double-edged", unit: "percent", yellow: [10, 16], orange: [16, 24], red: [25, 40] },
    { id: 105, title: "Double Tap", unit: "percent", yellow: [15, 24], orange: [24, 36], red: [38, 57] },
    { id: 87, title: "Empower", unit: "percent", yellow: [50, 89], orange: [90, 147], red: [152, 245] },
    { id: 56, title: "Eviscerate", unit: "percent", yellow: [15, 19], orange: [19, 25], red: [25, 34] },
    { id: 75, title: "Execute", unit: "percent", yellow: [15, 18], orange: [18, 22], red: [23, 30] },
    { id: 1, title: "Expose", unit: "percent", yellow: [7, 9], orange: [9, 14], red: [14, 21] },
    { id: 82, title: "Finale", unit: "percent", yellow: [10, 12], orange: [12, 15], red: [13, 18] },
    { id: 79, title: "Focus", unit: "percent", yellow: [15, 19], orange: [19, 24], red: [25, 35] },
    { id: 80, title: "Frenzy", unit: "percent", yellow: [5, 7], orange: [7, 10], red: [10, 14] },
    { id: 64, title: "Fury", unit: "percent", yellow: [10, 16], orange: [16, 24], red: [25, 40] },
    { id: 53, title: "Grace", unit: "percent", yellow: [20, 36], orange: [36, 55], red: [60, 84] },
    { id: 83, title: "Home run", unit: "percent", yellow: [50, 59], orange: [60, 74], red: [71, 93] },
    { id: 102, title: "Irradiate", unit: "percent", yellow: [0, 19], orange: [0, 49], red: [26, 86] },
    { id: 61, title: "Motivation", unit: "percent", yellow: [15, 19], orange: [19, 25], red: [25, 35] },
    { id: 59, title: "Paralyze", unit: "percent", yellow: [5, 8], orange: [8, 12], red: [13, 18] },
    { id: 84, title: "Parry", unit: "percent", yellow: [50, 60], orange: [60, 74], red: [71, 95] },
    { id: 101, title: "Penetrate", unit: "percent", yellow: [25, 30], orange: [30, 37], red: [38, 49] },
    { id: 21, title: "Plunder", unit: "percent", yellow: [20, 26], orange: [26, 35], red: [35, 49] },
    { id: 68, title: "Powerful", unit: "percent", yellow: [15, 22], orange: [22, 32], red: [33, 50] },
    { id: 14, title: "Proficience", unit: "percent", yellow: [20, 28], orange: [28, 39], red: [40, 60] },
    { id: 66, title: "Puncture", unit: "percent", yellow: [15, 20], orange: [20, 27], red: [28, 39] },
    { id: 88, title: "Quicken", unit: "percent", yellow: [50, 89], orange: [90, 149], red: [150, 245] },
    { id: 65, title: "Rage", unit: "percent", yellow: [4, 6], orange: [7, 11], red: [11, 18] },
    { id: 41, title: "Revitalize", unit: "percent", yellow: [10, 13], orange: [13, 17], red: [18, 24] },
    { id: 43, title: "Roshambo", unit: "percent", yellow: [50, 73], orange: [75, 107], red: [113, 160] },
    { id: 44, title: "Slow", unit: "percent", yellow: [20, 29], orange: [29, 42], red: [43, 64] },
    { id: 73, title: "Smurf", unit: "percent", yellow: [1, 1], orange: [2, 3], red: [4, 4] },
    { id: 71, title: "Specialist", unit: "percent", yellow: [20, 28], orange: [28, 39], red: [40, 59] },
    { id: 20, title: "Stricken", unit: "percent", yellow: [30, 43], orange: [44, 63], red: [69, 99] },
    { id: 58, title: "Stun", unit: "percent", yellow: [10, 16], orange: [16, 25], red: [25, 40] },
    { id: 60, title: "Suppress", unit: "percent", yellow: [25, 32], orange: [30, 42], red: [43, 51] },
    { id: 78, title: "Sure Shot", unit: "percent", yellow: [3, 4], orange: [5, 8], red: [8, 12] },
    { id: 48, title: "Throttle", unit: "percent", yellow: [50, 74], orange: [75, 111], red: [113, 170] },
    { id: 81, title: "Warlord", unit: "percent", yellow: [15, 20], orange: [20, 27], red: [28, 45] },
    { id: 46, title: "Weaken", unit: "percent", yellow: [20, 29], orange: [29, 42], red: [43, 63] },
    { id: 76, title: "Wind-up", unit: "percent", yellow: [125, 145], orange: [145, 174], red: [175, 221] },
    { id: 42, title: "Wither", unit: "percent", yellow: [20, 29], orange: [29, 42], red: [43, 64] }
  ];
  var BY_ID = new Map(PERK_RARITY_RANGES.map((p) => [p.id, p]));
  var finite = (n) => typeof n === "number" && Number.isFinite(n);
  function normalizeRarity(rarity) {
    const r = String(rarity ?? "").toLowerCase();
    return r === "yellow" || r === "orange" || r === "red" ? r : null;
  }
  function perkRangeEntry(bonusId) {
    return BY_ID.get(bonusId) ?? null;
  }
  function perkRangeByTitle(name) {
    const id = bonusIdByTitle(name);
    return id == null ? null : perkRangeEntry(id);
  }
  function rollBandFor(bonusId, rarity) {
    const entry = BY_ID.get(bonusId);
    if (!entry || entry.unit !== "percent") return null;
    const r = normalizeRarity(rarity);
    if (!r) return null;
    return entry[r] ?? null;
  }
  function rollBandWidth(bonusId, rarity) {
    const band = rollBandFor(bonusId, rarity);
    return band ? band[1] - band[0] : null;
  }
  var POSITION_LABEL = { low: "low roll", mid: "medium roll", high: "high roll" };
  function classifyRollPosition(bonusId, rarity, value, tolerance = 0) {
    const band = rollBandFor(bonusId, rarity);
    if (!band || !finite(value)) return null;
    const [min, max] = band;
    const v = value;
    const inBand = v >= min - tolerance && v <= max + tolerance;
    let position;
    if (max <= min) {
      position = "high";
    } else {
      const third = (max - min) / 3;
      if (v < min + third) position = "low";
      else if (v < min + 2 * third) position = "mid";
      else position = "high";
    }
    return { position, inBand, min, max, label: POSITION_LABEL[position] };
  }
  function rollBandTolerance(bonusId, rarity, opts) {
    const width = rollBandWidth(bonusId, rarity);
    if (width == null) return null;
    if (opts.valueSensitive(bonusId)) return opts.tightTol;
    return Math.max(0, Math.min(opts.defaultTol, Math.floor(width / 2)));
  }
  function perkUnitSuffix(name) {
    const entry = perkRangeByTitle(name);
    if (!entry) return "%";
    if (entry.unit === "turns") return "T";
    if (entry.unit === "hours") return "h";
    return "%";
  }
  var DEFAULT_WPV_CONFIG = {
    minComps: 4,
    minFitComps: 6,
    minQualitySpread: 8,
    minR2: 0.25,
    dealDiscount: 0.1,
    resaleTax: 0.05,
    minTrendSales: 8,
    minTrendHalf: 3,
    minTrendDays: 45,
    trendFlatThreshold: 0.05,
    sellUndercut: 0.02,
    outlierMadK: 4,
    minOutlierSamples: 6,
    qualityBandWidth: 15,
    minBandSales: 3,
    perkBandTight: 0,
    perkBandDefault: 2,
    minSurfaceComps: 10,
    minPerkSpread: 2,
    maxSurfaceCollinearity: 0.9,
    surfaceHalfLifeDays: 60,
    recencyHalfLifeDays: 45,
    itemTypes: ["weapon"]
  };
  function typeAllowed(sale, config) {
    return (config.itemTypes ?? ["weapon"]).includes((sale.type ?? "").toLowerCase());
  }
  var finite2 = (n) => typeof n === "number" && Number.isFinite(n);
  var round = (n) => Math.round(n);
  var RARITY_RANK = { grey: 0, gray: 0, yellow: 1, orange: 2, red: 3 };
  function dominantRarity(sales) {
    const counts = /* @__PURE__ */ new Map();
    for (const s of sales) {
      const r = typeof s.rarity === "string" ? s.rarity.toLowerCase() : "";
      if (r) counts.set(r, (counts.get(r) ?? 0) + 1);
    }
    if (counts.size === 0) return null;
    let best = null;
    let bestN = -1;
    for (const [r, n] of counts) {
      if (n > bestN || n === bestN && (RARITY_RANK[r] ?? -1) > (RARITY_RANK[best ?? ""] ?? -1)) {
        best = r;
        bestN = n;
      }
    }
    return best;
  }
  function median(sortedAsc) {
    const n = sortedAsc.length;
    if (n === 0) return 0;
    const mid = Math.floor(n / 2);
    return n % 2 ? sortedAsc[mid] : (sortedAsc[mid - 1] + sortedAsc[mid]) / 2;
  }
  function quantile(sortedAsc, q) {
    const n = sortedAsc.length;
    if (n === 0) return 0;
    if (n === 1) return sortedAsc[0];
    const pos = (n - 1) * q;
    const lo = Math.floor(pos);
    const frac = pos - lo;
    return lo + 1 < n ? sortedAsc[lo] + (sortedAsc[lo + 1] - sortedAsc[lo]) * frac : sortedAsc[lo];
  }
  function weightedMedian(pairs) {
    if (pairs.length === 0) return 0;
    const sorted = [...pairs].sort((a, b) => a.value - b.value);
    const total = sorted.reduce((s, x) => s + (x.weight > 0 ? x.weight : 0), 0);
    if (!(total > 0)) return median(sorted.map((x) => x.value));
    let cum = 0;
    for (const x of sorted) {
      cum += Math.max(0, x.weight);
      if (cum >= total / 2) return x.value;
    }
    return sorted[sorted.length - 1].value;
  }
  function recencyWeightedPrice(sales, halfLifeDays, now = Date.now()) {
    const hl = Math.max(1, halfLifeDays) * 86400;
    const nowSec = now / 1e3;
    const pairs = (sales ?? []).filter((s) => finite2(s.price) && s.price > 0).map((s) => ({ value: s.price, weight: finite2(s.timestamp) ? Math.pow(0.5, Math.max(0, nowSec - s.timestamp) / hl) : 1 }));
    return round(weightedMedian(pairs));
  }
  var MAD_TO_SIGMA = 1.4826;
  function rejectPriceOutliers(sales, config = DEFAULT_WPV_CONFIG) {
    const valid = (sales ?? []).filter((s) => finite2(s.price) && s.price > 0);
    if (valid.length < config.minOutlierSamples) return { kept: valid, removed: [] };
    const logs = valid.map((s) => Math.log(s.price)).sort((a, b) => a - b);
    const med = median(logs);
    const absDev = logs.map((x) => Math.abs(x - med)).sort((a, b) => a - b);
    const mad = median(absDev);
    if (!(mad > 0)) return { kept: valid, removed: [] };
    const threshold = config.outlierMadK * mad * MAD_TO_SIGMA;
    const kept = [];
    const removed = [];
    for (const s of valid) {
      if (Math.abs(Math.log(s.price) - med) <= threshold) kept.push(s);
      else removed.push(s);
    }
    if (removed.length > valid.length / 3) return { kept: valid, removed: [] };
    return { kept, removed };
  }
  function fitQualityModel(group, config) {
    const pts = group.filter((s) => finite2(s.quality)).map((s) => ({ x: s.quality, y: s.price }));
    if (pts.length < config.minFitComps) return null;
    const qMin = Math.min(...pts.map((p) => p.x));
    const qMax = Math.max(...pts.map((p) => p.x));
    if (qMax - qMin < config.minQualitySpread) return null;
    const now = Date.now() / 1e3;
    const decay = Math.LN2 / (config.recencyHalfLifeDays * 86400);
    const weights = group.filter((s) => finite2(s.quality)).map((s) => Math.exp(-decay * Math.max(0, now - s.timestamp)));
    const fit = wlsLinearFit(pts, weights);
    if (!fit) return null;
    return {
      n: fit.n,
      slope: Math.round(fit.slope),
      intercept: Math.round(fit.intercept),
      r2: Math.round(fit.r2 * 100) / 100,
      qualityMin: Math.round(qMin * 10) / 10,
      qualityMax: Math.round(qMax * 10) / 10
    };
  }
  function wlsLinearFit(pts, weights) {
    const n = pts.length;
    if (n < 3 || weights.length !== n) return null;
    let sw = 0, swx = 0, swy = 0, swxx = 0, swxy = 0;
    for (let i = 0; i < n; i++) {
      const w = weights[i];
      sw += w;
      swx += w * pts[i].x;
      swy += w * pts[i].y;
      swxx += w * pts[i].x * pts[i].x;
      swxy += w * pts[i].x * pts[i].y;
    }
    const denom = sw * swxx - swx * swx;
    if (Math.abs(denom) < 1e-10) return null;
    const slope = (sw * swxy - swx * swy) / denom;
    const intercept = (swy - slope * swx) / sw;
    let ssTot = 0, ssRes = 0;
    const yMean = swy / sw;
    for (let i = 0; i < n; i++) {
      const w = weights[i];
      const pred = slope * pts[i].x + intercept;
      ssRes += w * (pts[i].y - pred) ** 2;
      ssTot += w * (pts[i].y - yMean) ** 2;
    }
    const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 0;
    if (!Number.isFinite(slope) || !Number.isFinite(intercept)) return null;
    return { n, slope, intercept, r2 };
  }
  function pearson(xs, ys) {
    const n = xs.length;
    if (n < 2 || ys.length !== n) return null;
    let sx = 0, sy = 0;
    for (let i = 0; i < n; i++) {
      sx += xs[i];
      sy += ys[i];
    }
    const mx = sx / n, my = sy / n;
    let sxy = 0, sxx = 0, syy = 0;
    for (let i = 0; i < n; i++) {
      const dx = xs[i] - mx, dy = ys[i] - my;
      sxy += dx * dy;
      sxx += dx * dx;
      syy += dy * dy;
    }
    const denom = Math.sqrt(sxx * syy);
    return denom > 0 ? sxy / denom : null;
  }
  function det3(m) {
    return m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
  }
  function solve3(A, b) {
    const d = det3(A);
    if (!Number.isFinite(d) || Math.abs(d) < 1e-6) return null;
    const col = (j) => A.map((row, i) => row.map((v, k) => k === j ? b[i] : v));
    const x0 = det3(col(0)) / d;
    const x1 = det3(col(1)) / d;
    const x2 = det3(col(2)) / d;
    return [x0, x1, x2].every((v) => Number.isFinite(v)) ? [x0, x1, x2] : null;
  }
  var round1 = (n) => Math.round(n * 10) / 10;
  function fitPerkQualityModel(group, bonusId, config = DEFAULT_WPV_CONFIG) {
    const pts = [];
    for (const s of group ?? []) {
      if (!finite2(s.price) || s.price <= 0 || !finite2(s.quality)) continue;
      const b = (s.bonuses ?? []).find((x) => x.id === bonusId && finite2(x.value));
      if (!b) continue;
      pts.push({ perk: b.value, q: s.quality, price: s.price, ts: finite2(s.timestamp) ? s.timestamp : 0 });
    }
    if (pts.length < config.minSurfaceComps) return null;
    const perks = pts.map((p) => p.perk);
    const quals = pts.map((p) => p.q);
    const perkMin = Math.min(...perks), perkMax = Math.max(...perks);
    const qMin = Math.min(...quals), qMax = Math.max(...quals);
    if (perkMax - perkMin < config.minPerkSpread) return null;
    const n = pts.length;
    const newestTs = Math.max(...pts.map((p) => p.ts));
    const halfLife = Math.max(1, config.surfaceHalfLifeDays) * 86400;
    const weightOf = (ts) => newestTs > 0 && ts > 0 ? Math.pow(0.5, (newestTs - ts) / halfLife) : 1;
    const qualityMedian = round1(median([...quals].sort((a, b) => a - b)));
    const corr = pearson(perks, quals);
    if (corr != null && Math.abs(corr) > config.maxSurfaceCollinearity) return null;
    if (qMax - qMin >= config.minQualitySpread) {
      let Sw = 0, Sx1 = 0, Sx2 = 0, Sy = 0, Sx1x1 = 0, Sx2x2 = 0, Sx1x2 = 0, Sx1y = 0, Sx2y = 0;
      for (const p of pts) {
        const w = weightOf(p.ts);
        Sw += w;
        Sx1 += w * p.perk;
        Sx2 += w * p.q;
        Sy += w * p.price;
        Sx1x1 += w * p.perk * p.perk;
        Sx2x2 += w * p.q * p.q;
        Sx1x2 += w * p.perk * p.q;
        Sx1y += w * p.perk * p.price;
        Sx2y += w * p.q * p.price;
      }
      const sol = solve3(
        [
          [Sw, Sx1, Sx2],
          [Sx1, Sx1x1, Sx1x2],
          [Sx2, Sx1x2, Sx2x2]
        ],
        [Sy, Sx1y, Sx2y]
      );
      if (!sol) return null;
      const [b0, b1, b2] = sol;
      const meanY2 = Sy / Sw;
      let ssTot2 = 0, ssRes2 = 0;
      for (const p of pts) {
        const w = weightOf(p.ts);
        const pred = b0 + b1 * p.perk + b2 * p.q;
        ssTot2 += w * (p.price - meanY2) ** 2;
        ssRes2 += w * (p.price - pred) ** 2;
      }
      const r22 = ssTot2 === 0 ? 0 : 1 - ssRes2 / ssTot2;
      if (!(r22 >= config.minR2)) return null;
      return {
        n,
        perkSlope: Math.round(b1),
        qualitySlope: Math.round(b2),
        intercept: Math.round(b0),
        r2: Math.round(r22 * 100) / 100,
        perkMin: round1(perkMin),
        perkMax: round1(perkMax),
        qualityMin: round1(qMin),
        qualityMax: round1(qMax),
        qualityMedian
      };
    }
    let Pw = 0, Px = 0, Py = 0, Pxx = 0, Pxy = 0;
    for (const p of pts) {
      const w = weightOf(p.ts);
      Pw += w;
      Px += w * p.perk;
      Py += w * p.price;
      Pxx += w * p.perk * p.perk;
      Pxy += w * p.perk * p.price;
    }
    const denom = Pw * Pxx - Px * Px;
    if (!Number.isFinite(denom) || Math.abs(denom) < 1e-6) return null;
    const slope = (Pw * Pxy - Px * Py) / denom;
    const intercept = (Py - slope * Px) / Pw;
    if (!Number.isFinite(slope) || !Number.isFinite(intercept)) return null;
    const meanY = Py / Pw;
    let ssTot = 0, ssRes = 0;
    for (const p of pts) {
      const w = weightOf(p.ts);
      const pred = intercept + slope * p.perk;
      ssTot += w * (p.price - meanY) ** 2;
      ssRes += w * (p.price - pred) ** 2;
    }
    const r2 = ssTot === 0 ? 0 : 1 - ssRes / ssTot;
    if (!(r2 >= config.minR2)) return null;
    return {
      n,
      perkSlope: Math.round(slope),
      qualitySlope: 0,
      intercept: Math.round(intercept),
      r2: Math.round(r2 * 100) / 100,
      perkMin: round1(perkMin),
      perkMax: round1(perkMax),
      qualityMin: round1(qMin),
      qualityMax: round1(qMax),
      qualityMedian
    };
  }
  var QUALITY_REFINE_MIN_R2 = 0.25;
  var MAX_QUALITY_NUDGE_SHARE = 0.35;
  var QUALITY_NUDGE_SHRINK = 0.5;
  function refineForQuality(baseValue, baselineQuality, actualQuality, plane) {
    if (!plane || plane.r2 < QUALITY_REFINE_MIN_R2 || !finite2(baselineQuality) || !finite2(actualQuality)) {
      return { value: baseValue, refined: false, shift: 0 };
    }
    const q = actualQuality;
    if (q < plane.qualityMin || q > plane.qualityMax) return { value: baseValue, refined: false, shift: 0 };
    const delta = q - baselineQuality;
    if (delta === 0) return { value: baseValue, refined: false, shift: 0 };
    const nudge = plane.qualitySlope * delta * QUALITY_NUDGE_SHRINK;
    const cap = Math.abs(baseValue) * MAX_QUALITY_NUDGE_SHARE;
    const clamped = Math.max(-cap, Math.min(cap, nudge));
    const value = Math.round(baseValue + clamped);
    const refined = value > 0 && clamped !== 0;
    return { value: value > 0 ? value : baseValue, refined, shift: refined ? clamped : 0 };
  }
  function shiftBand(low, high, shift) {
    if (!finite2(low) || !finite2(high)) return null;
    return { low: Math.round(low + shift), high: Math.round(high + shift) };
  }
  function copiesOf(rolls) {
    let sum = 0;
    let any = false;
    for (const r of rolls) {
      if (!finite2(r.distinctItems)) continue;
      any = true;
      sum += r.distinctItems;
    }
    return any ? sum : null;
  }
  function valuePerRoll(priceByValue, medianPrice, roll, actualQuality, plane) {
    const pbv = priceByValue.filter((p) => finite2(p.value) && finite2(p.median) && p.median > 0 && finite2(p.count));
    const totalComps = pbv.reduce((s, p) => s + p.count, 0);
    const refine = (value, baselineQuality) => refineForQuality(value, baselineQuality, actualQuality, plane);
    const statedAt = (baselineQuality, refined) => refined ? finite2(actualQuality) ? actualQuality : null : finite2(baselineQuality) ? baselineQuality : null;
    if (pbv.length === 0 || !finite2(roll)) {
      if (!finite2(medianPrice) || medianPrice <= 0) return null;
      const r2 = refine(medianPrice, null);
      return { value: round(r2.value), basis: "median", bound: null, comps: totalComps, qualityRefined: r2.refined, baselineQuality: statedAt(null, r2.refined), low: null, high: null, sourceRolls: [], sourceDistinctItems: null, predLow: null, predHigh: null };
    }
    const r = roll;
    const exact = pbv.find((p) => p.value === r);
    if (exact) {
      const ref = refine(exact.median, exact.qualityMedian);
      const band = shiftBand(exact.low, exact.high, ref.shift);
      const pband = shiftBand(exact.predLow, exact.predHigh, ref.shift);
      return { value: round(ref.value), basis: "roll", bound: null, comps: exact.count, qualityRefined: ref.refined, baselineQuality: statedAt(exact.qualityMedian, ref.refined), low: band?.low ?? null, high: band?.high ?? null, predLow: pband?.low ?? null, predHigh: pband?.high ?? null, sourceRolls: [exact.value], sourceDistinctItems: copiesOf([exact]) };
    }
    const sorted = [...pbv].sort((a, b) => a.value - b.value);
    const lo = [...sorted].reverse().find((p) => p.value < r) ?? null;
    const hi = sorted.find((p) => p.value > r) ?? null;
    if (lo && hi) {
      const t = (r - lo.value) / (hi.value - lo.value);
      const interpolated = lo.median + t * (hi.median - lo.median);
      const baselineQ = finite2(lo.qualityMedian) && finite2(hi.qualityMedian) ? lo.qualityMedian + t * (hi.qualityMedian - lo.qualityMedian) : null;
      const ref = refine(interpolated, baselineQ);
      const interpLow = finite2(lo.low) && finite2(hi.low) ? lo.low + t * (hi.low - lo.low) : null;
      const interpHigh = finite2(lo.high) && finite2(hi.high) ? lo.high + t * (hi.high - lo.high) : null;
      const band = shiftBand(interpLow, interpHigh, ref.shift);
      const interpPredLow = finite2(lo.predLow) && finite2(hi.predLow) ? lo.predLow + t * (hi.predLow - lo.predLow) : null;
      const interpPredHigh = finite2(lo.predHigh) && finite2(hi.predHigh) ? lo.predHigh + t * (hi.predHigh - lo.predHigh) : null;
      const pband = shiftBand(interpPredLow, interpPredHigh, ref.shift);
      return { value: round(ref.value), basis: "interp", bound: null, comps: lo.count + hi.count, qualityRefined: ref.refined, baselineQuality: statedAt(baselineQ, ref.refined), low: band?.low ?? null, high: band?.high ?? null, predLow: pband?.low ?? null, predHigh: pband?.high ?? null, sourceRolls: [lo.value, hi.value], sourceDistinctItems: copiesOf([lo, hi]) };
    }
    if (lo) {
      const ref = refine(lo.median, lo.qualityMedian);
      const band = shiftBand(lo.low, lo.high, ref.shift);
      const pband = shiftBand(lo.predLow, lo.predHigh, ref.shift);
      return { value: round(ref.value), basis: "roll", bound: "floor", comps: lo.count, qualityRefined: ref.refined, baselineQuality: statedAt(lo.qualityMedian, ref.refined), low: band?.low ?? null, high: band?.high ?? null, predLow: pband?.low ?? null, predHigh: pband?.high ?? null, sourceRolls: [lo.value], sourceDistinctItems: copiesOf([lo]) };
    }
    if (hi) {
      const ref = refine(hi.median, hi.qualityMedian);
      const band = shiftBand(hi.low, hi.high, ref.shift);
      const pband = shiftBand(hi.predLow, hi.predHigh, ref.shift);
      return { value: round(ref.value), basis: "roll", bound: "ceiling", comps: hi.count, qualityRefined: ref.refined, baselineQuality: statedAt(hi.qualityMedian, ref.refined), low: band?.low ?? null, high: band?.high ?? null, predLow: pband?.low ?? null, predHigh: pband?.high ?? null, sourceRolls: [hi.value], sourceDistinctItems: copiesOf([hi]) };
    }
    return null;
  }
  function fairValueOnSurfaceAt(surface, perkValue, quality) {
    if (!surface || !finite2(perkValue)) return null;
    const p = perkValue;
    const span = Math.max(0, surface.perkMax - surface.perkMin);
    const margin = Math.max(3, span * 0.25);
    let usedPerk = p;
    let perkBound = null;
    if (p > surface.perkMax) {
      if (p > surface.perkMax + margin) return null;
      usedPerk = surface.perkMax;
      perkBound = surface.perkSlope >= 0 ? "floor" : "ceiling";
    } else if (p < surface.perkMin) {
      if (p < surface.perkMin - margin) return null;
      usedPerk = surface.perkMin;
      perkBound = surface.perkSlope >= 0 ? "ceiling" : "floor";
    }
    const qInRange = finite2(quality) && quality >= surface.qualityMin && quality <= surface.qualityMax;
    const q = qInRange ? quality : surface.qualityMedian;
    const est = surface.intercept + surface.perkSlope * usedPerk + surface.qualitySlope * q;
    if (!finite2(est) || est <= 0) return null;
    return { value: Math.round(est), usedTypicalQuality: !qInRange, perkBound };
  }
  function qualityBands(group, config) {
    const width = config.qualityBandWidth > 0 ? config.qualityBandWidth : 15;
    const byBand = /* @__PURE__ */ new Map();
    for (const s of group) {
      if (!finite2(s.quality)) continue;
      const band = Math.floor(s.quality / width) * width;
      const arr = byBand.get(band);
      if (arr) arr.push(s);
      else byBand.set(band, [s]);
    }
    const out = [];
    for (const [band, sales] of byBand) {
      if (sales.length < config.minBandSales) continue;
      out.push({ band, bandWidth: width, sales: sales.length, median: recencyWeightedPrice(sales, config.recencyHalfLifeDays) });
    }
    out.sort((a, b) => a.band - b.band);
    return out;
  }
  function toRecentSale(sale) {
    return {
      saleId: finite2(sale.saleId) ? sale.saleId : null,
      timestamp: sale.timestamp,
      price: round(sale.price),
      quality: finite2(sale.quality) ? sale.quality : null,
      damage: finite2(sale.damage) ? sale.damage : null,
      accuracy: finite2(sale.accuracy) ? sale.accuracy : null,
      armor: finite2(sale.armor) ? sale.armor : null,
      perks: (sale.bonuses ?? []).map((b) => b.value).filter(finite2),
      sellerId: finite2(sale.sellerId) ? sale.sellerId : null,
      buyerId: finite2(sale.buyerId) ? sale.buyerId : null,
      sellerName: typeof sale.sellerName === "string" ? sale.sellerName : null,
      buyerName: typeof sale.buyerName === "string" ? sale.buyerName : null
    };
  }
  function representativeSales(sales, limit = 5) {
    const take = Number.isFinite(limit) ? Math.max(0, Math.floor(limit)) : 0;
    if (take === 0) return [];
    const valid = (sales ?? []).filter((s) => finite2(s.timestamp) && finite2(s.price) && s.price > 0);
    const perk = (s) => (s.bonuses ?? [])[0]?.value;
    const byNewest = [...valid].sort((a, b) => b.timestamp - a.timestamp || (b.saleId ?? -1) - (a.saleId ?? -1) || b.price - a.price);
    if (valid.length <= take) return byNewest.map(toRecentSale);
    const perks = valid.map(perk).filter(finite2);
    const spread = perks.length ? Math.max(...perks) - Math.min(...perks) : 0;
    if (perks.length < valid.length || spread < 1) return byNewest.slice(0, take).map(toRecentSale);
    const byPerk = [...valid].sort((a, b) => perk(a) - perk(b) || b.timestamp - a.timestamp);
    const chosen = /* @__PURE__ */ new Set([byPerk[0], byPerk[byPerk.length - 1]]);
    for (const s of byNewest) {
      if (chosen.size >= take) break;
      chosen.add(s);
    }
    return [...chosen].sort((a, b) => (perk(a) ?? 0) - (perk(b) ?? 0) || b.timestamp - a.timestamp).slice(0, take).map(toRecentSale);
  }
  function marketConcentration(sales) {
    const withSeller = (sales ?? []).filter((s) => finite2(s.sellerId));
    if (withSeller.length < 4) return null;
    const sellerCount = /* @__PURE__ */ new Map();
    const pairCount = /* @__PURE__ */ new Map();
    for (const s of withSeller) {
      const sid = s.sellerId;
      sellerCount.set(sid, (sellerCount.get(sid) ?? 0) + 1);
      if (finite2(s.buyerId)) {
        const k = `${sid}:${s.buyerId}`;
        pairCount.set(k, (pairCount.get(k) ?? 0) + 1);
      }
    }
    const n = withSeller.length;
    const topSeller = Math.max(...sellerCount.values());
    const topPair = pairCount.size ? Math.max(...pairCount.values()) : 0;
    return {
      uniqueSellers: sellerCount.size,
      topSellerShare: Math.round(topSeller / n * 100) / 100,
      topPairShare: Math.round(topPair / n * 100) / 100,
      sales: n
    };
  }
  function concentrationFlag(c) {
    if (!c || c.sales < 4) return null;
    if (c.topPairShare >= 0.5) return "wash";
    if (c.topSellerShare >= 0.6 && c.uniqueSellers <= 3) return "one-seller";
    return null;
  }
  function cohortStats(group, config) {
    const prices = group.map((s) => s.price).sort((a, b) => a - b);
    const times = group.map((s) => s.timestamp);
    const quals = group.map((s) => s.quality).filter(finite2);
    const oldest = Math.min(...times);
    const newest = Math.max(...times);
    const windowDays = newest > oldest ? (newest - oldest) / 86400 : null;
    return {
      comps: group.length,
      windowDays: windowDays != null ? Math.round(windowDays * 10) / 10 : null,
      perDay: windowDays && windowDays > 0 ? Math.round(group.length / windowDays * 100) / 100 : null,
      medianPrice: median(prices),
      recencyMedian: recencyWeightedPrice(group, config.recencyHalfLifeDays),
      lowPrice: prices[0],
      highPrice: prices[prices.length - 1],
      lowTrimmed: round(quantile(prices, 0.1)),
      highTrimmed: round(quantile(prices, 0.9)),
      qualityMin: quals.length ? Math.round(Math.min(...quals) * 10) / 10 : null,
      qualityMax: quals.length ? Math.round(Math.max(...quals) * 10) / 10 : null,
      qualityMedian: quals.length ? Math.round(median([...quals].sort((a, b) => a - b)) * 10) / 10 : null,
      priceSpread: (() => {
        const med = median(prices);
        return med > 0 ? Math.round((quantile(prices, 0.75) - quantile(prices, 0.25)) / med * 1e3) / 1e3 : 0;
      })(),
      model: fitQualityModel(group, config),
      recentSales: representativeSales(group, config.recentSalesLimit ?? 5),
      rarity: dominantRarity(group),
      bands: qualityBands(group, config),
      concentration: marketConcentration(group)
    };
  }
  function buildCohortValue(sales, config = DEFAULT_WPV_CONFIG) {
    const clean2 = rejectPriceOutliers(sales, config).kept.filter((s) => finite2(s.price) && s.price > 0 && finite2(s.timestamp));
    if (clean2.length === 0) return null;
    const stats = cohortStats(clean2, config);
    return { ...stats, trend: computePriceTrend(clean2, stats.model, config) };
  }
  var HIGH_IMPACT_PERK_IDS = /* @__PURE__ */ new Set([WARLORD_BONUS_ID, REVITALIZE_BONUS_ID]);
  function perkValueTolerance(bonusId, config = DEFAULT_WPV_CONFIG) {
    return HIGH_IMPACT_PERK_IDS.has(bonusId) ? config.perkBandTight : config.perkBandDefault;
  }
  function effectivePerkTolerance(bonusId, rarity, config = DEFAULT_WPV_CONFIG) {
    const ranged = rollBandTolerance(bonusId, rarity, {
      defaultTol: config.perkBandDefault,
      tightTol: config.perkBandTight,
      valueSensitive: (id) => HIGH_IMPACT_PERK_IDS.has(id)
    });
    return ranged ?? perkValueTolerance(bonusId, config);
  }
  function valueForRollBand(sales, target, config = DEFAULT_WPV_CONFIG) {
    if (!target.rarity || target.perks.length === 0 || target.perks.some((p) => !finite2(p.id) || !finite2(p.value))) return null;
    const wantRarity = target.rarity.toLowerCase();
    const base = (sales ?? []).filter((s) => {
      if (s.itemId !== target.itemId) return false;
      if ((s.rarity ?? "").toLowerCase() !== wantRarity) return false;
      const bs = (s.bonuses ?? []).filter((b) => finite2(b.id) && finite2(b.value));
      return bs.length >= 2 === target.wantDouble;
    });
    const within = (tol) => base.filter((s) => {
      const bs = (s.bonuses ?? []).filter((b) => finite2(b.id) && finite2(b.value));
      return target.perks.every((tp) => bs.some((b) => b.id === tp.id && Math.abs(b.value - tp.value) <= tol(tp.id)));
    });
    const exact = buildCohortValue(within(() => 0), config);
    if (exact && exact.comps >= config.minComps) return exact;
    const banded = buildCohortValue(within((id) => effectivePerkTolerance(id, target.rarity, config)), config);
    return banded && banded.comps >= config.minComps ? banded : null;
  }
  function fairValueAt(v, quality, config = DEFAULT_WPV_CONFIG) {
    const m = v.model;
    if (m && m.r2 >= config.minR2 && finite2(quality) && quality >= m.qualityMin && quality <= m.qualityMax) {
      const est = m.slope * quality + m.intercept;
      if (finite2(est) && est > 0) return { value: est, basis: "model" };
    }
    if (finite2(quality) && Array.isArray(v.bands) && v.bands.length > 0) {
      const q = quality;
      let match = v.bands.find((b) => q >= b.band && q < b.band + b.bandWidth);
      if (!match) {
        match = v.bands.reduce((best, b) => {
          const dBest = Math.min(Math.abs(q - best.band), Math.abs(q - (best.band + best.bandWidth)));
          const dCur = Math.min(Math.abs(q - b.band), Math.abs(q - (b.band + b.bandWidth)));
          return dCur < dBest ? b : best;
        });
      }
      if (match && match.median > 0) return { value: match.median, basis: "quality-band" };
    }
    return { value: finite2(v.recencyMedian) ? v.recencyMedian : v.medianPrice, basis: "median" };
  }
  function projectAuctionReturn(fairValue, currentBid, resaleTaxRate = DEFAULT_WPV_CONFIG.resaleTax) {
    if (!finite2(fairValue) || fairValue <= 0 || !finite2(currentBid) || currentBid <= 0) return null;
    if (!finite2(resaleTaxRate) || resaleTaxRate < 0 || resaleTaxRate >= 1) return null;
    const resaleTax = round(fairValue * resaleTaxRate);
    const netProceeds = round(fairValue - resaleTax);
    const netProfit = netProceeds - round(currentBid);
    return {
      currentBid: round(currentBid),
      fairValue: round(fairValue),
      resaleTaxRate,
      resaleTax,
      netProceeds,
      netProfit,
      roi: Math.round(netProfit / currentBid * 1e3) / 1e3,
      breakEvenBid: netProceeds
    };
  }
  function computePriceTrend(sales, model, config = DEFAULT_WPV_CONFIG) {
    const trustworthy = !!model && model.r2 >= config.minR2 && finite2(model.slope);
    const usable = (sales ?? []).filter(
      (s) => finite2(s.price) && s.price > 0 && finite2(s.timestamp) && (!trustworthy || finite2(s.quality))
    );
    if (usable.length < config.minTrendSales) return null;
    const sorted = [...usable].sort((a, b) => a.timestamp - b.timestamp);
    const spanDays = (sorted[sorted.length - 1].timestamp - sorted[0].timestamp) / 86400;
    if (!(spanDays >= config.minTrendDays)) return null;
    const quals = sorted.map((s) => s.quality).filter(finite2);
    const refQuality = quals.length ? median([...quals].sort((a, b) => a - b)) : 0;
    const priceOf = (s) => trustworthy && finite2(s.quality) ? s.price + model.slope * (refQuality - s.quality) : s.price;
    const mid = Math.floor(sorted.length / 2);
    const older = sorted.slice(0, mid);
    const recent = sorted.slice(mid);
    if (older.length < config.minTrendHalf || recent.length < config.minTrendHalf) return null;
    const olderMedian = median(older.map(priceOf).sort((a, b) => a - b));
    const recentMedian = median(recent.map(priceOf).sort((a, b) => a - b));
    if (!(olderMedian > 0)) return null;
    const changePct = (recentMedian - olderMedian) / olderMedian;
    const direction = Math.abs(changePct) < config.trendFlatThreshold ? "flat" : changePct > 0 ? "up" : "down";
    return {
      direction,
      changePct: Math.round(changePct * 1e3) / 1e3,
      recentMedian: round(recentMedian),
      olderMedian: round(olderMedian),
      recentSales: recent.length,
      olderSales: older.length,
      spanDays: Math.round(spanDays),
      qualityAdjusted: trustworthy
    };
  }
  function valueByWeaponPerk(sales, config = DEFAULT_WPV_CONFIG) {
    const valid = (sales ?? []).filter(
      (s) => typeAllowed(s, config) && isRwGearSale(s) && finite2(s.price) && s.price > 0 && finite2(s.timestamp) && finite2(s.itemId)
    );
    const groups = /* @__PURE__ */ new Map();
    const perkOf = /* @__PURE__ */ new Map();
    for (const s of valid) {
      for (const b of s.bonuses ?? []) {
        if (!finite2(b.id)) continue;
        const key = `${s.itemId}#${b.id}`;
        const arr = groups.get(key);
        if (arr) arr.push(s);
        else groups.set(key, [s]);
        if (!perkOf.has(key)) perkOf.set(key, { bonusId: b.id, title: b.title || `bonus ${b.id}` });
      }
    }
    const out = [];
    for (const [key, rawGroup] of groups) {
      const group = rejectPriceOutliers(rawGroup, config).kept;
      if (group.length < config.minComps) continue;
      const meta = perkOf.get(key);
      const rep = group[0];
      const stats = cohortStats(group, config);
      const perkValues = group.map((s) => (s.bonuses ?? []).find((b) => b.id === meta.bonusId)?.value).filter(finite2);
      out.push({
        itemId: rep.itemId,
        weaponName: rep.name ?? `item ${rep.itemId}`,
        subType: rep.subType,
        bonusId: meta.bonusId,
        perkTitle: meta.title,
        perkClass: perkClassOf(meta.title),
        perkValueMin: perkValues.length ? Math.min(...perkValues) : 0,
        perkValueMax: perkValues.length ? Math.max(...perkValues) : 0,
        ...stats,
        trend: computePriceTrend(group, stats.model, config)
      });
    }
    out.sort((a, b) => b.comps - a.comps || a.itemId - b.itemId || a.bonusId - b.bonusId);
    return out;
  }
  function valueByWeaponPerkSegmented(sales, config = DEFAULT_WPV_CONFIG) {
    const valid = (sales ?? []).filter(
      (s) => typeAllowed(s, config) && isRwGearSale(s) && finite2(s.price) && s.price > 0 && finite2(s.timestamp) && finite2(s.itemId)
    );
    const groups = /* @__PURE__ */ new Map();
    const metaOf = /* @__PURE__ */ new Map();
    for (const s of valid) {
      const bonuses = (s.bonuses ?? []).filter((b) => finite2(b.id));
      const perkCount = bonuses.length;
      const doublePerk = perkCount >= 2;
      const rarity = typeof s.rarity === "string" && s.rarity ? s.rarity.toLowerCase() : null;
      for (const b of bonuses) {
        const key = `${s.itemId}#${b.id}#${rarity ?? "unknown"}#${doublePerk ? "D" : "S"}`;
        const arr = groups.get(key);
        if (arr) arr.push(s);
        else groups.set(key, [s]);
        if (!metaOf.has(key)) metaOf.set(key, { bonusId: b.id, title: b.title || `bonus ${b.id}`, rarity, doublePerk, perkCount });
      }
    }
    const out = [];
    for (const [key, rawGroup] of groups) {
      const group = rejectPriceOutliers(rawGroup, config).kept;
      if (group.length < config.minComps) continue;
      const meta = metaOf.get(key);
      const rep = group[0];
      const stats = cohortStats(group, config);
      const perkValues = group.map((s) => (s.bonuses ?? []).find((b) => b.id === meta.bonusId)?.value).filter(finite2);
      out.push({
        itemId: rep.itemId,
        weaponName: rep.name ?? `item ${rep.itemId}`,
        subType: rep.subType,
        bonusId: meta.bonusId,
        perkTitle: meta.title,
        perkClass: perkClassOf(meta.title),
        perkValueMin: perkValues.length ? Math.min(...perkValues) : 0,
        perkValueMax: perkValues.length ? Math.max(...perkValues) : 0,
        ...stats,
        trend: computePriceTrend(group, stats.model, config),
        cohortRarity: meta.rarity,
        doublePerk: meta.doublePerk,
        perkCount: Math.max(...group.map((s) => (s.bonuses ?? []).filter((b) => finite2(b.id)).length), meta.perkCount),
        surface: meta.doublePerk ? null : fitPerkQualityModel(group, meta.bonusId, config)
      });
    }
    out.sort((a, b) => b.comps - a.comps || a.itemId - b.itemId || a.bonusId - b.bonusId);
    return out;
  }
  function perkRollSignatureKey(bonuses) {
    const normalized = (bonuses ?? []).filter((b) => finite2(b.id) && finite2(b.value)).map((b) => ({ id: b.id, value: Math.round(b.value * 1e3) / 1e3 })).sort((a, b) => a.id - b.id || a.value - b.value);
    return normalized.map((b) => `${b.id}:${b.value}`).join("+");
  }
  function valueByPerkSignature(sales, config = DEFAULT_WPV_CONFIG) {
    const valid = (sales ?? []).filter(
      (s) => typeAllowed(s, config) && isRwGearSale(s) && finite2(s.price) && s.price > 0 && finite2(s.timestamp) && finite2(s.itemId)
    );
    const groups = /* @__PURE__ */ new Map();
    const metaOf = /* @__PURE__ */ new Map();
    for (const s of valid) {
      const bs = (s.bonuses ?? []).filter((b) => finite2(b.id) && finite2(b.value)).map((b) => ({ ...b, value: Math.round(b.value * 1e3) / 1e3 })).sort((a, b) => a.id - b.id || a.value - b.value);
      if (bs.length === 0) continue;
      const rarity = (s.rarity ?? "").toLowerCase();
      const key = `${s.itemId}#${rarity}#${perkRollSignatureKey(bs)}`;
      const arr = groups.get(key);
      if (arr) arr.push(s);
      else groups.set(key, [s]);
      if (!metaOf.has(key)) {
        metaOf.set(key, {
          bonusIds: bs.map((b) => b.id),
          values: bs.map((b) => b.value),
          titles: bs.map((b) => b.title || `bonus ${b.id}`)
        });
      }
    }
    const out = [];
    for (const [key, rawGroup] of groups) {
      const group = rejectPriceOutliers(rawGroup, config).kept;
      if (group.length < config.minComps) continue;
      const meta = metaOf.get(key);
      const rep = group[0];
      const stats = cohortStats(group, config);
      out.push({
        itemId: rep.itemId,
        weaponName: rep.name ?? `item ${rep.itemId}`,
        subType: rep.subType,
        bonusIds: meta.bonusIds,
        perkValues: meta.values,
        perkTitles: meta.titles,
        perkClasses: meta.titles.map((t) => perkClassOf(t)),
        ...stats,
        trend: computePriceTrend(group, stats.model, config)
      });
    }
    out.sort((a, b) => b.bonusIds.length - a.bonusIds.length || b.comps - a.comps || a.itemId - b.itemId);
    return out;
  }
  var DOUBLE_PERK_PREMIUM = [
    { rarity: "orange", sales: 4792, median: 1.34, p25: 0.96, p75: 1.74 },
    { rarity: "red", sales: 123, median: 1.54, p25: 1.04, p75: 2.56 }
  ];
  var MIN_PREMIUM_SALES = 100;
  function doublePerkPremium(rarity) {
    if (!rarity) return null;
    const key = rarity.toLowerCase();
    const hit = DOUBLE_PERK_PREMIUM.find((p) => p.rarity === key);
    return hit && hit.sales >= MIN_PREMIUM_SALES ? hit : null;
  }
  function doublePerkRangeText(rarity) {
    const p = doublePerkPremium(rarity);
    if (!p) return null;
    const fmt = (n) => `${n.toFixed(1)}x`;
    return `Two-perk ${p.rarity} weapons usually sell for ${fmt(p.p25)} to ${fmt(p.p75)} the price of one perk alone, ${fmt(p.median)} typically, across ${p.sales.toLocaleString("en-US")} sales.`;
  }
  var BRIDGE_STEPS = [
    { from: "yellow", to: "orange" },
    { from: "orange", to: "red" }
  ];
  var PERK_BRIDGE_RATIOS = [
    { bonusId: 1, from: "yellow", to: "orange", ratio: 3.258, pairs: 51 },
    { bonusId: 14, from: "yellow", to: "orange", ratio: 3.667, pairs: 11 },
    { bonusId: 20, from: "yellow", to: "orange", ratio: 3.436, pairs: 4 },
    { bonusId: 21, from: "yellow", to: "orange", ratio: 4.568, pairs: 32 },
    { bonusId: 41, from: "yellow", to: "orange", ratio: 10.194, pairs: 11 },
    { bonusId: 42, from: "yellow", to: "orange", ratio: 4.141, pairs: 37 },
    { bonusId: 43, from: "yellow", to: "orange", ratio: 3.041, pairs: 8 },
    { bonusId: 44, from: "yellow", to: "orange", ratio: 3.367, pairs: 30 },
    { bonusId: 45, from: "yellow", to: "orange", ratio: 3.043, pairs: 17 },
    { bonusId: 46, from: "yellow", to: "orange", ratio: 3.792, pairs: 30 },
    { bonusId: 47, from: "yellow", to: "orange", ratio: 2.946, pairs: 35 },
    { bonusId: 48, from: "yellow", to: "orange", ratio: 2.929, pairs: 26 },
    { bonusId: 49, from: "yellow", to: "orange", ratio: 3.081, pairs: 10 },
    { bonusId: 50, from: "yellow", to: "orange", ratio: 2.969, pairs: 35 },
    { bonusId: 51, from: "yellow", to: "orange", ratio: 2.978, pairs: 7 },
    { bonusId: 52, from: "yellow", to: "orange", ratio: 2.983, pairs: 10 },
    { bonusId: 53, from: "yellow", to: "orange", ratio: 4.172, pairs: 9 },
    { bonusId: 54, from: "yellow", to: "orange", ratio: 3.502, pairs: 10 },
    { bonusId: 55, from: "yellow", to: "orange", ratio: 2.902, pairs: 26 },
    { bonusId: 56, from: "yellow", to: "orange", ratio: 6.05, pairs: 28 },
    { bonusId: 57, from: "yellow", to: "orange", ratio: 4.894, pairs: 28 },
    { bonusId: 58, from: "yellow", to: "orange", ratio: 3.001, pairs: 22 },
    { bonusId: 59, from: "yellow", to: "orange", ratio: 3.419, pairs: 5 },
    { bonusId: 60, from: "yellow", to: "orange", ratio: 4.134, pairs: 5 },
    { bonusId: 61, from: "yellow", to: "orange", ratio: 5, pairs: 49 },
    { bonusId: 62, from: "yellow", to: "orange", ratio: 3.077, pairs: 7 },
    { bonusId: 63, from: "yellow", to: "orange", ratio: 3.07, pairs: 41 },
    { bonusId: 64, from: "yellow", to: "orange", ratio: 3.031, pairs: 30 },
    { bonusId: 65, from: "yellow", to: "orange", ratio: 3.439, pairs: 32 },
    { bonusId: 66, from: "yellow", to: "orange", ratio: 3.422, pairs: 26 },
    { bonusId: 67, from: "yellow", to: "orange", ratio: 2.761, pairs: 11 },
    { bonusId: 68, from: "yellow", to: "orange", ratio: 3.19, pairs: 49 },
    { bonusId: 71, from: "yellow", to: "orange", ratio: 2.974, pairs: 55 },
    { bonusId: 72, from: "yellow", to: "orange", ratio: 3.15, pairs: 35 },
    { bonusId: 73, from: "yellow", to: "orange", ratio: 14.317, pairs: 4 },
    { bonusId: 74, from: "yellow", to: "orange", ratio: 3.03, pairs: 11 },
    { bonusId: 75, from: "yellow", to: "orange", ratio: 8.953, pairs: 16 },
    { bonusId: 76, from: "yellow", to: "orange", ratio: 2.967, pairs: 29 },
    { bonusId: 78, from: "yellow", to: "orange", ratio: 3.196, pairs: 12 },
    { bonusId: 79, from: "yellow", to: "orange", ratio: 3.115, pairs: 12 },
    { bonusId: 80, from: "yellow", to: "orange", ratio: 3.203, pairs: 30 },
    { bonusId: 81, from: "yellow", to: "orange", ratio: 4.186, pairs: 40 },
    { bonusId: 82, from: "yellow", to: "orange", ratio: 3.251, pairs: 5 },
    { bonusId: 83, from: "yellow", to: "orange", ratio: 3.206, pairs: 11 },
    { bonusId: 84, from: "yellow", to: "orange", ratio: 4.944, pairs: 11 },
    { bonusId: 85, from: "yellow", to: "orange", ratio: 5.823, pairs: 11 },
    { bonusId: 86, from: "yellow", to: "orange", ratio: 3.208, pairs: 59 },
    { bonusId: 87, from: "yellow", to: "orange", ratio: 3.756, pairs: 31 },
    { bonusId: 88, from: "yellow", to: "orange", ratio: 4.508, pairs: 38 },
    { bonusId: 101, from: "yellow", to: "orange", ratio: 3.169, pairs: 26 },
    { bonusId: 102, from: "yellow", to: "orange", ratio: 2.666, pairs: 9 },
    { bonusId: 105, from: "yellow", to: "orange", ratio: 3.145, pairs: 16 },
    { bonusId: 1, from: "orange", to: "red", ratio: 6.325, pairs: 21 },
    { bonusId: 14, from: "orange", to: "red", ratio: 6.064, pairs: 5 },
    { bonusId: 42, from: "orange", to: "red", ratio: 6.23, pairs: 14 },
    { bonusId: 44, from: "orange", to: "red", ratio: 6.654, pairs: 10 },
    { bonusId: 45, from: "orange", to: "red", ratio: 4.331, pairs: 6 },
    { bonusId: 46, from: "orange", to: "red", ratio: 3.902, pairs: 10 },
    { bonusId: 47, from: "orange", to: "red", ratio: 3.164, pairs: 5 },
    { bonusId: 48, from: "orange", to: "red", ratio: 3.01, pairs: 6 },
    { bonusId: 50, from: "orange", to: "red", ratio: 3.465, pairs: 5 },
    { bonusId: 51, from: "orange", to: "red", ratio: 4.103, pairs: 3 },
    { bonusId: 55, from: "orange", to: "red", ratio: 4.196, pairs: 13 },
    { bonusId: 56, from: "orange", to: "red", ratio: 5.979, pairs: 5 },
    { bonusId: 57, from: "orange", to: "red", ratio: 5.365, pairs: 8 },
    { bonusId: 58, from: "orange", to: "red", ratio: 4.44, pairs: 4 },
    { bonusId: 61, from: "orange", to: "red", ratio: 7.442, pairs: 18 },
    { bonusId: 62, from: "orange", to: "red", ratio: 3.687, pairs: 6 },
    { bonusId: 63, from: "orange", to: "red", ratio: 6.093, pairs: 15 },
    { bonusId: 65, from: "orange", to: "red", ratio: 8.859, pairs: 3 },
    { bonusId: 66, from: "orange", to: "red", ratio: 3.605, pairs: 6 },
    { bonusId: 67, from: "orange", to: "red", ratio: 4.614, pairs: 6 },
    { bonusId: 68, from: "orange", to: "red", ratio: 5.279, pairs: 19 },
    { bonusId: 71, from: "orange", to: "red", ratio: 4.391, pairs: 18 },
    { bonusId: 72, from: "orange", to: "red", ratio: 4.572, pairs: 13 },
    { bonusId: 74, from: "orange", to: "red", ratio: 4.856, pairs: 3 },
    { bonusId: 75, from: "orange", to: "red", ratio: 10.704, pairs: 6 },
    { bonusId: 76, from: "orange", to: "red", ratio: 4.331, pairs: 6 },
    { bonusId: 78, from: "orange", to: "red", ratio: 7.483, pairs: 7 },
    { bonusId: 79, from: "orange", to: "red", ratio: 6.277, pairs: 4 },
    { bonusId: 80, from: "orange", to: "red", ratio: 6.519, pairs: 7 },
    { bonusId: 81, from: "orange", to: "red", ratio: 4.736, pairs: 6 },
    { bonusId: 83, from: "orange", to: "red", ratio: 7.377, pairs: 3 },
    { bonusId: 86, from: "orange", to: "red", ratio: 5.445, pairs: 18 },
    { bonusId: 87, from: "orange", to: "red", ratio: 6.526, pairs: 6 },
    { bonusId: 88, from: "orange", to: "red", ratio: 5.646, pairs: 15 },
    { bonusId: 105, from: "orange", to: "red", ratio: 4.939, pairs: 8 }
  ];
  var GLOBAL_BRIDGE_RATIOS = [
    { from: "yellow", to: "orange", ratio: 3.341, pairs: 1193 },
    { from: "orange", to: "red", ratio: 5.346, pairs: 318 }
  ];
  var BRIDGE_BAND = {
    "yellow>orange": { pairTight: 0.224, pairFair: 0.389, pairNoisy: 0.532, perk: 0.404, global: 0.422 },
    "orange>red": { pairTight: 0.275, pairFair: 0.498, pairNoisy: 0.738, perk: 0.476, global: 0.53 }
  };
  var BRIDGE_CV_TIGHT = 0.3;
  var BRIDGE_CV_NOISY = 0.5;
  var BRIDGE_MIN_FROM_COMPS = 4;
  var BRIDGE_MIN_PAIR_COMPS = 3;
  var BRIDGE_WIDE_RATIO = 3;
  var finite3 = (v) => typeof v === "number" && Number.isFinite(v);
  var norm = (r) => (r ?? "").toLowerCase();
  function isBridgeStep(from, to) {
    const f = norm(from);
    const t = norm(to);
    return BRIDGE_STEPS.some((s) => s.from === f && s.to === t);
  }
  function perkBridgeRatio(bonusId, from, to) {
    if (!finite3(bonusId)) return null;
    const f = norm(from);
    const t = norm(to);
    return PERK_BRIDGE_RATIOS.find((r) => r.bonusId === bonusId && r.from === f && r.to === t) ?? null;
  }
  function globalBridgeRatio(from, to) {
    const f = norm(from);
    const t = norm(to);
    return GLOBAL_BRIDGE_RATIOS.find((r) => r.from === f && r.to === t) ?? null;
  }
  function bandFor(from, to, scope, cv) {
    const key = `${norm(from)}>${norm(to)}`;
    const row = BRIDGE_BAND[key];
    if (!row) return 0.5;
    if (scope === "global") return row.global;
    if (scope === "perk") return row.perk;
    if (!finite3(cv)) return row.pairFair;
    return cv < BRIDGE_CV_TIGHT ? row.pairTight : cv < BRIDGE_CV_NOISY ? row.pairFair : row.pairNoisy;
  }
  function bridgeRarityValue(input) {
    const { from, to, fromMedian, fromComps, bonusId } = input;
    if (!isBridgeStep(from, to)) return null;
    if (!finite3(fromMedian) || fromMedian <= 0) return null;
    if (!finite3(fromComps) || fromComps < BRIDGE_MIN_FROM_COMPS) return null;
    let ratio = null;
    let scope = "global";
    let evidence = 0;
    let cv = null;
    if (finite3(input.pairRatio) && input.pairRatio > 0 && finite3(input.pairComps) && input.pairComps >= BRIDGE_MIN_PAIR_COMPS) {
      ratio = input.pairRatio;
      scope = "pair";
      evidence = input.pairComps;
      cv = finite3(input.pairCv) ? input.pairCv : null;
    } else {
      const perk = perkBridgeRatio(bonusId, from, to);
      if (perk) {
        ratio = perk.ratio;
        scope = "perk";
        evidence = perk.pairs;
      } else {
        const g = globalBridgeRatio(from, to);
        if (!g) return null;
        ratio = g.ratio;
        scope = "global";
        evidence = g.pairs;
      }
    }
    if (!finite3(ratio) || ratio <= 0) return null;
    const value = Math.round(fromMedian * ratio);
    if (!(value > 0)) return null;
    const halfWidth = bandFor(from, to, scope, cv);
    const low = Math.round(value * (1 - Math.min(0.95, halfWidth)));
    const high = Math.round(value * (1 + halfWidth));
    return {
      value,
      low: Math.max(1, low),
      high,
      ratio,
      scope,
      evidence,
      halfWidth,
      from: norm(from),
      to: norm(to),
      wide: high / Math.max(1, low) > BRIDGE_WIDE_RATIO
    };
  }
  function bridgeDisclosure(b, fromComps) {
    const times = `${b.ratio.toFixed(1)}x`;
    const base = `Laddered up from ${b.from} (${fromComps} ${fromComps === 1 ? "sale" : "sales"}) at ${times}`;
    const src = b.scope === "pair" ? `, the step measured on this weapon and perk (${b.evidence} ${b.to} ${b.evidence === 1 ? "sale" : "sales"})` : b.scope === "perk" ? `, the typical step for this perk across ${b.evidence} weapons` : `, the market-wide step across ${b.evidence} weapon and perk pairs`;
    return `${base}${src}. The roll is not distinguished within the tier.`;
  }
  var PERK_PREMIUMS = [
    { bonusId: 41, ratio: 6.473, p25: 4.412, p75: 13.9, n: 128, pairs: 59 },
    { bonusId: 85, ratio: 6.427, p25: 3.261, p75: 8.851, n: 24, pairs: 15 },
    { bonusId: 84, ratio: 5.175, p25: 4.377, p75: 8.228, n: 33, pairs: 24 },
    { bonusId: 81, ratio: 3.94, p25: 2.504, p75: 6.31, n: 375, pairs: 194 },
    { bonusId: 75, ratio: 2.819, p25: 2.038, p75: 3.956, n: 210, pairs: 107 },
    { bonusId: 56, ratio: 2.563, p25: 1.775, p75: 3.745, n: 159, pairs: 94 },
    { bonusId: 101, ratio: 2.438, p25: 1.724, p75: 3.245, n: 158, pairs: 82 },
    { bonusId: 61, ratio: 2.332, p25: 1.769, p75: 3.39, n: 433, pairs: 215 },
    { bonusId: 57, ratio: 2.178, p25: 1.718, p75: 3.718, n: 177, pairs: 90 },
    { bonusId: 88, ratio: 2.062, p25: 1.554, p75: 2.926, n: 383, pairs: 180 },
    { bonusId: 42, ratio: 2.06, p25: 1.531, p75: 3.027, n: 360, pairs: 176 },
    { bonusId: 63, ratio: 2.055, p25: 1.462, p75: 3.241, n: 192, pairs: 120 },
    { bonusId: 66, ratio: 1.997, p25: 1.546, p75: 2.695, n: 195, pairs: 116 },
    { bonusId: 21, ratio: 1.96, p25: 1.497, p75: 2.756, n: 165, pairs: 92 },
    { bonusId: 87, ratio: 1.931, p25: 1.51, p75: 2.999, n: 129, pairs: 77 },
    { bonusId: 65, ratio: 1.901, p25: 1.496, p75: 3.06, n: 104, pairs: 69 },
    { bonusId: 44, ratio: 1.829, p25: 1.418, p75: 2.647, n: 248, pairs: 115 },
    { bonusId: 105, ratio: 1.823, p25: 1.443, p75: 2.52, n: 190, pairs: 90 },
    { bonusId: 68, ratio: 1.803, p25: 1.47, p75: 2.511, n: 436, pairs: 210 },
    { bonusId: 14, ratio: 1.768, p25: 1.291, p75: 2.248, n: 177, pairs: 67 },
    { bonusId: 72, ratio: 1.698, p25: 1.4, p75: 2.421, n: 409, pairs: 192 },
    { bonusId: 80, ratio: 1.69, p25: 1.439, p75: 2.152, n: 123, pairs: 79 },
    { bonusId: 1, ratio: 1.688, p25: 1.39, p75: 2.313, n: 485, pairs: 242 },
    { bonusId: 46, ratio: 1.648, p25: 1.459, p75: 2.25, n: 281, pairs: 162 },
    { bonusId: 64, ratio: 1.641, p25: 1.357, p75: 2.019, n: 161, pairs: 99 },
    { bonusId: 86, ratio: 1.588, p25: 1.359, p75: 1.962, n: 499, pairs: 252 },
    { bonusId: 45, ratio: 1.575, p25: 1.367, p75: 1.953, n: 143, pairs: 65 },
    { bonusId: 79, ratio: 1.551, p25: 1.367, p75: 2.203, n: 89, pairs: 55 },
    { bonusId: 102, ratio: 1.545, p25: 1.132, p75: 1.779, n: 32, pairs: 22 },
    { bonusId: 62, ratio: 1.54, p25: 1.4, p75: 1.996, n: 104, pairs: 43 },
    { bonusId: 78, ratio: 1.527, p25: 1.178, p75: 1.912, n: 140, pairs: 76 },
    { bonusId: 83, ratio: 1.518, p25: 1.214, p75: 1.952, n: 47, pairs: 28 },
    { bonusId: 58, ratio: 1.509, p25: 1.304, p75: 1.88, n: 129, pairs: 71 },
    { bonusId: 71, ratio: 1.474, p25: 1.087, p75: 1.883, n: 567, pairs: 270 },
    { bonusId: 51, ratio: 1.463, p25: 1.262, p75: 1.677, n: 122, pairs: 57 },
    { bonusId: 49, ratio: 1.44, p25: 1.231, p75: 1.632, n: 37, pairs: 26 },
    { bonusId: 55, ratio: 1.403, p25: 1.047, p75: 1.724, n: 283, pairs: 152 },
    { bonusId: 52, ratio: 1.356, p25: 0.733, p75: 1.504, n: 36, pairs: 26 },
    { bonusId: 47, ratio: 1.323, p25: 0.949, p75: 1.51, n: 255, pairs: 159 },
    { bonusId: 53, ratio: 1.268, p25: 0.976, p75: 1.486, n: 50, pairs: 31 },
    { bonusId: 43, ratio: 1.24, p25: 0.816, p75: 1.485, n: 33, pairs: 27 },
    { bonusId: 76, ratio: 1.236, p25: 0.85, p75: 1.534, n: 117, pairs: 62 },
    { bonusId: 54, ratio: 1.18, p25: 0.849, p75: 1.455, n: 57, pairs: 36 },
    { bonusId: 50, ratio: 1.178, p25: 0.741, p75: 1.444, n: 270, pairs: 150 },
    { bonusId: 67, ratio: 1.177, p25: 0.702, p75: 1.465, n: 55, pairs: 29 },
    { bonusId: 48, ratio: 1.056, p25: 0.726, p75: 1.429, n: 276, pairs: 142 },
    { bonusId: 74, ratio: 1.043, p25: 0.723, p75: 1.406, n: 49, pairs: 30 }
  ];
  var BY_ID2 = new Map(PERK_PREMIUMS.map((p) => [p.bonusId, p]));
  var PREMIUM_MIN_N = 20;
  var PREMIUM_MIN_REF_SALES = 6;
  var DOUBLE_PERK_RARITIES = /* @__PURE__ */ new Set(["orange", "red"]);
  var DISAGREE_DIFFER = 1.5;
  var DISAGREE_CONFLICT = 2.5;
  var CONFLICT_SPAN_PAD = 0.2;
  var PREMIUM_BAND = {
    /** Orange, both estimates agreeing (or only one available): captured 78%. */
    agree: 0.45,
    /** Orange, estimates 1.5x-2.5x apart: captured 74%. */
    differ: 0.6,
    /** Red priced off a real red tier median: captured 71%. */
    redOwn: 0.6,
    /** Red priced off a bridged base: captured 73%. */
    redBridged: 0.75
  };
  var finite4 = (n) => typeof n === "number" && Number.isFinite(n);
  var norm2 = (r) => r.trim().toLowerCase();
  function perkPremium(bonusId) {
    if (!finite4(bonusId)) return null;
    const p = BY_ID2.get(bonusId);
    return p && p.n >= PREMIUM_MIN_N ? p : null;
  }
  function isDoublePerkRarity(rarity) {
    return typeof rarity === "string" && DOUBLE_PERK_RARITIES.has(norm2(rarity));
  }
  function composeDoublePerkValue(rarity, sides) {
    if (!isDoublePerkRarity(rarity) || sides.length !== 2) return null;
    const estimates = [];
    for (let i = 0; i < 2; i++) {
      const added = perkPremium(sides[i].bonusId);
      const partner = sides[1 - i];
      if (!added || !finite4(partner.refValue) || partner.refValue <= 0 || !partner.refScope) continue;
      if (partner.refScope === "bridge-global") continue;
      if (partner.refScope === "own" && finite4(partner.refSales) && partner.refSales < PREMIUM_MIN_REF_SALES) continue;
      estimates.push({ value: partner.refValue * added.ratio, scope: partner.refScope, premium: added });
    }
    if (estimates.length === 0) return null;
    const lo = Math.min(...estimates.map((e) => e.value));
    const hi = Math.max(...estimates.map((e) => e.value));
    const value = Math.round(Math.exp(estimates.reduce((t, e) => t + Math.log(e.value), 0) / estimates.length));
    if (!(value > 0)) return null;
    const disagree = estimates.length === 2 ? hi / lo : null;
    const agreement = disagree == null ? "single" : disagree < DISAGREE_DIFFER ? "agree" : disagree < DISAGREE_CONFLICT ? "differ" : "conflict";
    const scopes = new Set(estimates.map((e) => e.scope));
    const basis = scopes.size === 1 && scopes.has("own") ? "own" : scopes.has("own") ? "mixed" : "bridged";
    let low;
    let high;
    let halfWidth = null;
    if (agreement === "conflict") {
      low = Math.round(lo * (1 - CONFLICT_SPAN_PAD));
      high = Math.round(hi * (1 + CONFLICT_SPAN_PAD));
    } else {
      halfWidth = norm2(rarity) === "red" ? basis === "bridged" ? PREMIUM_BAND.redBridged : PREMIUM_BAND.redOwn : agreement === "differ" ? PREMIUM_BAND.differ : PREMIUM_BAND.agree;
      low = Math.round(value * (1 - halfWidth));
      high = Math.round(value * (1 + halfWidth));
    }
    return {
      value,
      low: Math.max(1, low),
      high,
      agreement,
      disagree: disagree == null ? null : Math.round(disagree * 100) / 100,
      basis,
      applied: estimates.map((e) => ({
        bonusId: e.premium.bonusId,
        ratio: e.premium.ratio,
        n: e.premium.n,
        pairs: e.premium.pairs,
        refScope: e.scope
      })),
      halfWidth,
      wide: high / Math.max(1, low) > 3
    };
  }
  function doublePerkDisclosure(result, titleOf) {
    const first = result.applied[0];
    const added = titleOf(first.bonusId);
    const bridged = first.refScope !== "own";
    const parts = [
      `This pair has not sold, so the value is ${titleOf(result.applied[1]?.bonusId ?? first.bonusId)} alone${bridged ? " (itself estimated from the tier below)" : ""} times the ${first.ratio.toFixed(1)}x typical lift from adding ${added}, measured across ${first.n} two-perk sales`
    ];
    if (result.agreement === "conflict") {
      parts.push("Its two perks price it very differently, so the range spans both readings");
    } else if (result.agreement === "differ") {
      parts.push("Its two perks price it somewhat differently");
    }
    return parts.join(". ") + ".";
  }
  var CX_OWNED_ATTR = "data-cx-owned";
  function cleanNativeText(value) {
    return String(value ?? "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
  }
  function nativeText(element) {
    const clone = element.cloneNode(true);
    clone.querySelectorAll(`[${CX_OWNED_ATTR}]`).forEach((node) => node.remove());
    if (clone.hasAttribute(CX_OWNED_ATTR)) return "";
    return cleanNativeText(clone.textContent);
  }
  function findNativeBidCountAnchor(row, bidAreaSelector) {
    const bidControl = [...row.querySelectorAll('button, [role="button"]')].find((element) => /^bid$/i.test(nativeText(element)));
    if (!bidControl) return null;
    const matches = /* @__PURE__ */ new Set();
    for (const area of row.querySelectorAll(bidAreaSelector)) {
      for (const element of [area, ...area.querySelectorAll("*")]) {
        if (element.hasAttribute(CX_OWNED_ATTR) || element.closest('button, [role="button"]')) continue;
        if (element.hidden || element.getAttribute("aria-hidden") === "true") continue;
        if (/^\d+\s+bids?$/i.test(nativeText(element))) matches.add(element);
      }
    }
    const leaves = [...matches].filter((candidate) => ![...matches].some((other) => other !== candidate && candidate.contains(other)));
    return leaves.length === 1 && leaves[0].parentElement != null ? leaves[0] : null;
  }
  function moduleSelector(local, el = "") {
    return `${el}[class^="${local}___"], ${el}[class*=" ${local}___"]`;
  }
  function parseQualityText(text) {
    if (!text) return null;
    const m = text.match(/([\d.]+)\s*%?\s*Quality/i) || text.match(/Quality:?\s*([\d.]+)\s*%?/i);
    if (!m) return null;
    const q = Number(m[1]);
    return Number.isFinite(q) && q > 0 && q <= 1e3 ? Math.round(q * 100) / 100 : null;
  }
  function parseAuctionQuality(row) {
    const scope = row.querySelector(".show-item-info") ?? row;
    for (const prop of scope.querySelectorAll(moduleSelector("propertyWrapper", "li"))) {
      const titleEl = prop.querySelector(moduleSelector("title")) ?? prop.querySelector('[class*="title"]');
      if (!/^Quality:?$/i.test(cleanNativeText(titleEl?.textContent))) continue;
      for (const v of prop.querySelectorAll(moduleSelector("valueWrapper"))) {
        const q2 = parseQualityText(v.getAttribute("aria-label") || v.textContent);
        if (q2 != null) return q2;
      }
      const q = parseQualityText(cleanNativeText(prop.textContent));
      if (q != null) return q;
    }
    const ariaEl = scope.querySelector('[aria-label*="Quality" i]');
    return parseQualityText(ariaEl?.getAttribute("aria-label"));
  }
  var RARITY_WORD_RE = /\b(yellow|orange|red)\b/i;
  function parseAuctionRarity(row) {
    const scope = row.querySelector(".show-item-info") ?? row;
    for (const prop of scope.querySelectorAll(moduleSelector("propertyWrapper", "li"))) {
      const titleEl = prop.querySelector(moduleSelector("title")) ?? prop.querySelector('[class*="title"]');
      if (!/^Quality:?$/i.test(cleanNativeText(titleEl?.textContent))) continue;
      for (const v of prop.querySelectorAll(moduleSelector("valueWrapper"))) {
        const hit2 = cleanNativeText(v.getAttribute("aria-label") || v.textContent).match(RARITY_WORD_RE);
        if (hit2) return hit2[1].toLowerCase();
      }
      const hit = cleanNativeText(prop.textContent).match(RARITY_WORD_RE);
      if (hit) return hit[1].toLowerCase();
    }
    for (const el of scope.querySelectorAll('[aria-label*="Quality" i]')) {
      const label = cleanNativeText(el.getAttribute("aria-label"));
      if (!/quality/i.test(label)) continue;
      const hit = label.match(RARITY_WORD_RE);
      if (hit) return hit[1].toLowerCase();
    }
    return null;
  }
  var PLATE_SEL = '.item-plate, [class*="item-plate"]';
  function parseItemPlateRarity(row) {
    for (const plate of row.querySelectorAll(PLATE_SEL)) {
      if (plate === row) continue;
      for (const cls of plate.classList) {
        const hit = /^glow-(yellow|orange|red)$/i.exec(cls);
        if (hit) return hit[1].toLowerCase();
      }
    }
    return null;
  }
  function parseAuctionProperty(row, label) {
    const scope = row.querySelector(".show-item-info") ?? row;
    const num = (s) => {
      const m = cleanNativeText(s).match(/(\d{1,4}(?:\.\d+)?)/);
      if (!m) return null;
      const n = Number(m[1]);
      return Number.isFinite(n) && n > 0 && n <= 1e5 ? Math.round(n * 100) / 100 : null;
    };
    for (const prop of scope.querySelectorAll(moduleSelector("propertyWrapper", "li"))) {
      const titleEl = prop.querySelector(moduleSelector("title")) ?? prop.querySelector('[class*="title"]');
      if (!label.test(cleanNativeText(titleEl?.textContent))) continue;
      for (const v of prop.querySelectorAll(moduleSelector("valueWrapper"))) {
        const n2 = num(v.getAttribute("aria-label") || v.textContent);
        if (n2 != null) return n2;
      }
      const n = num(prop.textContent);
      if (n != null) return n;
    }
    return null;
  }
  function hasCompleteExactSignature(rarity, perkPercents) {
    return !!rarity && perkPercents.length > 0 && perkPercents.every((percent) => percent != null && Number.isFinite(percent));
  }
  function shouldScheduleDeep(state) {
    return state.hasJob && !state.exhausted && !state.inFlight && !state.queued && !state.failed && state.needsDeep;
  }
  function parseNativeBidPrice(row, priceSelector) {
    const bidAreas = [...row.querySelectorAll(priceSelector)];
    for (const area of [...bidAreas, row]) {
      const explicit = nativeText(area).match(/\bbid\s*:\s*\$\s*([\d,]+)/i);
      if (!explicit) continue;
      const value = Number(explicit[1].replace(/,/g, ""));
      if (Number.isFinite(value) && value > 0) return value;
    }
    for (const area of bidAreas) {
      const generic = nativeText(area).match(/\$\s*([\d,]+)/);
      if (!generic) continue;
      const value = Number(generic[1].replace(/,/g, ""));
      if (Number.isFinite(value) && value > 0) return value;
    }
    return null;
  }
  var TwoPhaseItemQueue = class {
    constructor() {
      this.initial = [];
      this.deep = [];
    }
    enqueueInitial(itemId) {
      if (!this.has(itemId)) this.initial.push(itemId);
    }
    enqueueDeep(itemId) {
      if (!this.has(itemId)) this.deep.push(itemId);
    }
    shift() {
      const initial = this.initial.shift();
      if (initial != null) return { itemId: initial, phase: "initial" };
      const deep = this.deep.shift();
      return deep != null ? { itemId: deep, phase: "deep" } : null;
    }
    has(itemId) {
      return this.initial.includes(itemId) || this.deep.includes(itemId);
    }
    removeNotIn(visibleItemIds) {
      for (let i = this.initial.length - 1; i >= 0; i--) {
        if (!visibleItemIds.has(this.initial[i])) this.initial.splice(i, 1);
      }
      for (let i = this.deep.length - 1; i >= 0; i--) {
        if (!visibleItemIds.has(this.deep[i])) this.deep.splice(i, 1);
      }
    }
    clear() {
      this.initial.length = 0;
      this.deep.length = 0;
    }
    get size() {
      return this.initial.length + this.deep.length;
    }
    /** Initial-page work still waiting; the first pass isn't done until this is zero. */
    get initialSize() {
      return this.initial.length;
    }
    /** Deep-enrichment work still waiting (runs quietly after the first pass). */
    get deepSize() {
      return this.deep.length;
    }
  };
  function finitePositive(value) {
    return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
  }
  function nullableFinite(value) {
    return typeof value === "number" && Number.isFinite(value) ? value : null;
  }
  var RARITY_CODE = { yellow: 1, orange: 2, red: 3 };
  var CODE_RARITY = { 1: "yellow", 2: "orange", 3: "red" };
  var FIVE_MIN_MS = 5 * 6e4;
  function capSales(sales, cap) {
    const seen = /* @__PURE__ */ new Set();
    const deduped = [];
    for (const s of sales) {
      if (s.saleId != null) {
        if (seen.has(s.saleId)) continue;
        seen.add(s.saleId);
      }
      deduped.push(s);
    }
    if (deduped.length <= cap) return deduped;
    return [...deduped].sort((a, b) => b.timestamp - a.timestamp).slice(0, Math.max(0, cap));
  }
  function mergeSales(existing, incoming, now, windowMs, cap) {
    const cutoffSec = Math.floor((now - windowMs) / 1e3);
    const futureSec = Math.floor((now + FIVE_MIN_MS) / 1e3);
    const all = [...existing ?? [], ...incoming ?? []].filter(
      (s) => s && Number.isFinite(s.timestamp) && s.timestamp >= cutoffSec && s.timestamp <= futureSec
    );
    return capSales(all, cap);
  }
  function encodeSale(s) {
    if (s.saleId == null || !Number.isFinite(s.saleId)) return null;
    if (!(s.price > 0) || !Number.isFinite(s.timestamp)) return null;
    const code = s.rarity ? RARITY_CODE[s.rarity.toLowerCase()] : void 0;
    if (!code) return null;
    const bonuses = (s.bonuses ?? []).filter((b) => Number.isFinite(b.id) && Number.isFinite(b.value)).map((b) => [b.id, b.value]);
    if (bonuses.length === 0) return null;
    return [s.saleId, s.price, s.timestamp, nullableFinite(s.quality), code, bonuses, nullableFinite(s.damage), nullableFinite(s.accuracy), nullableFinite(s.sellerId), nullableFinite(s.buyerId), nullableFinite(s.armor)];
  }
  function decodeSale(tuple, itemId, name, subType) {
    if (!Array.isArray(tuple) || tuple.length < 6) return null;
    const [saleId, price, ts, quality, code, bonuses, damage, accuracy, sellerId, buyerId, armor] = tuple;
    const p = finitePositive(price);
    const t = finitePositive(ts);
    const sid = nullableFinite(saleId);
    const rarity = CODE_RARITY[Number(code)];
    if (p == null || t == null || sid == null || !rarity) return null;
    if (!Array.isArray(bonuses) || bonuses.length === 0) return null;
    const parsedBonuses = [];
    for (const b of bonuses) {
      if (!Array.isArray(b) || b.length < 2) return null;
      const id = Number(b[0]);
      const value = Number(b[1]);
      if (!Number.isFinite(id) || !Number.isFinite(value)) return null;
      parsedBonuses.push({ id, title: bonusTitle(id), value });
    }
    return {
      saleId: sid,
      price: p,
      timestamp: t,
      quality: nullableFinite(quality),
      damage: nullableFinite(damage),
      accuracy: nullableFinite(accuracy),
      armor: nullableFinite(armor),
      sellerId: nullableFinite(sellerId),
      buyerId: nullableFinite(buyerId),
      rarity,
      bonuses: parsedBonuses,
      uid: null,
      itemId,
      name,
      type: "Weapon",
      subType
    };
  }
  var MAX_PERSISTED_COHORTS = 600;
  function decodeSalesDbCohorts(raw, now, maxAgeMs) {
    if (!raw) return [];
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return [];
    }
    if (parsed.v !== 5 || !Array.isArray(parsed.ch)) return [];
    const at = nullableFinite(parsed.chAt);
    if (at == null || at > now + FIVE_MIN_MS || now - at > maxAgeMs) return [];
    const out = [];
    for (const entry of parsed.ch) {
      if (!entry || typeof entry !== "object") continue;
      const e = entry;
      if (typeof e.key !== "string" || e.key === "" || !e.cohort || typeof e.cohort !== "object") continue;
      const c = e.cohort;
      if (typeof c.rarity !== "string" || !Array.isArray(c.priceByValue)) continue;
      out.push({ key: e.key, cohort: e.cohort });
      if (out.length >= MAX_PERSISTED_COHORTS) break;
    }
    return out;
  }
  function encodeSalesDb(items, limits, cohorts = [], now = Date.now()) {
    const kept = [...items].filter((it) => Number.isFinite(it.itemId) && it.itemId > 0 && Array.isArray(it.sales) && it.sales.length > 0).sort((a, b) => b.at - a.at).slice(0, Math.max(0, limits.maxItems));
    const out = kept.map((it) => {
      const keptSales = capSales(it.sales, limits.maxSalesPerItem);
      const encoded = keptSales.map((sale) => ({ sale, tuple: encodeSale(sale) })).filter((entry) => entry.tuple != null);
      const sales = encoded.map((entry) => entry.tuple);
      const retentionTruncated = encoded.length < it.sales.length;
      const oldestRetained = encoded.reduce(
        (oldest, entry) => oldest == null || entry.sale.timestamp < oldest ? entry.sale.timestamp : oldest,
        null
      );
      return {
        i: it.itemId,
        n: it.name ?? null,
        s: it.subType ?? null,
        c: it.category ?? null,
        at: it.at,
        to: retentionTruncated ? oldestRetained : it.to ?? null,
        pp: it.pagesPulled,
        ex: retentionTruncated ? false : it.exhausted === true,
        d: sales
      };
    }).filter((it) => it.d.length > 0);
    const ch = [...cohorts].filter((c) => c && typeof c.key === "string" && c.key !== "" && c.cohort && typeof c.cohort === "object").slice(0, MAX_PERSISTED_COHORTS);
    return JSON.stringify({ v: 5, items: out, ch, chAt: now });
  }
  function decodeSalesDb(raw, now, limits) {
    if (!raw) return [];
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return [];
    }
    if (parsed.v !== 5 || !Array.isArray(parsed.items)) return [];
    const cutoffSec = Math.floor((now - limits.windowMs) / 1e3);
    const futureSec = Math.floor((now + FIVE_MIN_MS) / 1e3);
    const items = [];
    for (const candidate of parsed.items) {
      if (!candidate || typeof candidate !== "object") continue;
      const it = candidate;
      const itemId = finitePositive(it.i);
      const at = nullableFinite(it.at);
      if (itemId == null || at == null) continue;
      if (at > now + FIVE_MIN_MS || now - at > limits.maxAgeMs) continue;
      const name = typeof it.n === "string" ? it.n : null;
      const subType = typeof it.s === "string" ? it.s : null;
      const category = typeof it.c === "string" ? it.c : null;
      const to = nullableFinite(it.to);
      if (to != null && (to <= 0 || to > futureSec)) continue;
      let pagesPulled = Number(it.pp);
      if (!Number.isInteger(pagesPulled) || pagesPulled < 0) pagesPulled = 0;
      const rawSales = Array.isArray(it.d) ? it.d : [];
      const seen = /* @__PURE__ */ new Set();
      const sales = [];
      for (const tuple of rawSales) {
        const sale = decodeSale(tuple, itemId, name, subType);
        if (!sale) continue;
        if (sale.timestamp < cutoffSec || sale.timestamp > futureSec) continue;
        if (sale.saleId != null) {
          if (seen.has(sale.saleId)) continue;
          seen.add(sale.saleId);
        }
        sales.push(sale);
        if (sales.length >= limits.maxSalesPerItem) break;
      }
      if (sales.length === 0) continue;
      items.push({ itemId, name, subType, category, at, to, pagesPulled, exhausted: it.ex === true, sales });
      if (items.length >= Math.max(0, limits.maxItems)) break;
    }
    return items;
  }
  function resolveMatchTier(exactRoll, hasBand, isFloor) {
    if (exactRoll) return "exact";
    if (hasBand) return "close";
    if (isFloor) return "rare";
    return "rough";
  }
  var MIN_EXACT_ROLL_COMPS = 3;
  function isServerExactMatch(basis, bound, comps, derived, distinctItems) {
    if (basis !== "server-roll" || bound !== null) return false;
    if (derived === true) return false;
    if (comps == null) return true;
    const independent = distinctItems != null && distinctItems > 0 ? Math.min(distinctItems, comps) : comps;
    return independent >= MIN_EXACT_ROLL_COMPS;
  }
  function preferServerValue(local, server) {
    if (!server) return false;
    if (!local) return true;
    if (server.basis !== "server-roll" || server.bound !== null) return false;
    return server.comps >= local.comps;
  }
  function evidenceForMatch(sales, isDirectMatch, rollCount, roll) {
    if (rollCount !== 1 || roll == null) return sales;
    if (isDirectMatch) return sales.filter((s) => s.perks.length === 1 && s.perks[0] === roll);
    return sales.filter((s) => s.perks.length === 1 && Math.abs((s.perks[0] ?? -999) - roll) <= 2);
  }
  function suppressFlip(tier) {
    return tier === "rare";
  }
  var TIMER_SELECTORS = [
    '[class*="timer" i]',
    '[class*="countdown" i]',
    '[class*="timeLeft" i]',
    '[class*="time-left" i]',
    '[class*="auctionEnd" i]',
    '[class*="expire" i]'
  ].join(",");
  function parseAuctionTimer(row) {
    const timerEls = row.querySelectorAll(TIMER_SELECTORS);
    for (const el of timerEls) {
      const seconds = parseTimerText(cleanNativeText(el.textContent));
      if (seconds != null) return seconds;
      const label = el.getAttribute("aria-label") || el.getAttribute("data-time") || el.getAttribute("title");
      if (label) {
        const s = parseTimerText(cleanNativeText(label));
        if (s != null) return s;
      }
    }
    const rowText = cleanNativeText(row.textContent);
    const timeLeftMatch = rowText.match(/time\s*left\s*:?\s*(?:\u231b|\u23f3)?\s*([\ddhms\s:]+)/i);
    if (timeLeftMatch) {
      const seconds = parseTimerText(timeLeftMatch[1].trim());
      if (seconds != null) return seconds;
    }
    const bidAreas = row.querySelectorAll('.c-bid-wrap, .bids-wrap, [class*="c-bid"]');
    for (const area of bidAreas) {
      const seconds = parseTimerText(cleanNativeText(area.textContent));
      if (seconds != null) return seconds;
    }
    return null;
  }
  function parseTimerText(text) {
    if (!text) return null;
    const s = text.trim().toLowerCase();
    if (!s || s.length > 40) return null;
    if (/^<\s*1\s*m/i.test(s)) return 30;
    const named = s.match(/(?:(\d+)\s*d)?\s*(?:(\d+)\s*h)?\s*(?:(\d+)\s*m(?:in)?)?\s*(?:(\d+)\s*s)?/);
    if (named && (named[1] || named[2] || named[3] || named[4])) {
      const days = Number(named[1] || 0);
      const hours = Number(named[2] || 0);
      const mins = Number(named[3] || 0);
      const secs = Number(named[4] || 0);
      const total = days * 86400 + hours * 3600 + mins * 60 + secs;
      return total > 0 && total < 30 * 86400 ? total : null;
    }
    const colon = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
    if (colon) {
      if (colon[3] != null) {
        const total2 = Number(colon[1]) * 3600 + Number(colon[2]) * 60 + Number(colon[3]);
        return total2 > 0 && total2 < 30 * 86400 ? total2 : null;
      }
      const total = Number(colon[1]) * 60 + Number(colon[2]);
      return total > 0 && total < 30 * 86400 ? total : null;
    }
    return null;
  }
  function formatTimeRemaining(seconds) {
    if (seconds == null || seconds <= 0) return null;
    if (seconds < 60) return "< 1m";
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor(seconds % 86400 / 3600);
    const mins = Math.floor(seconds % 3600 / 60);
    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${mins}m`;
    return `${mins}m`;
  }
  function calendarDaysAgo(timestampSec, nowSec) {
    const midnight = (sec) => {
      const d = new Date(sec * 1e3);
      d.setHours(0, 0, 0, 0);
      return d.getTime();
    };
    return Math.max(0, Math.round((midnight(nowSec) - midnight(timestampSec)) / 864e5));
  }
  function freshnessPhrase(freshDays) {
    if (freshDays == null) return null;
    if (freshDays <= 0) return "today";
    if (freshDays === 1) return "yesterday";
    return `${freshDays} days ago`;
  }
  var RECENT_WINDOW_DAYS = 365;
  function spanPhrase(windowDays) {
    if (windowDays == null || !Number.isFinite(windowDays)) return null;
    const days = Math.round(windowDays);
    if (days <= RECENT_WINDOW_DAYS) return null;
    if (days >= 730) return `drawn from ${(days / 365).toFixed(1)} years of history`;
    return `drawn from ${days} days of history`;
  }
  function deriveConfidence(comps, recentSales, nowSec) {
    const stamps = recentSales.map((s) => s.timestamp).filter((t) => Number.isFinite(t) && t > 0);
    const newest = stamps.length > 0 ? Math.max(...stamps) : null;
    const freshDays = newest != null ? calendarDaysAgo(newest, nowSec) : null;
    let tier;
    if (comps >= 16 && freshDays != null && freshDays <= 14) {
      tier = "solid";
    } else if (comps >= 6 && (freshDays == null || freshDays <= 45)) {
      tier = "moderate";
    } else {
      tier = "thin";
    }
    const phrase = freshnessPhrase(freshDays);
    const label = phrase ? `${comps} comps, latest ${phrase}` : `${comps} comps`;
    return { comps, freshDays, tier, label };
  }
  function instanceFingerprint(itemId, rarity, quality, perks) {
    if (!Number.isFinite(itemId) || !rarity || quality == null || !Number.isFinite(quality)) return null;
    if (perks.length === 0) return null;
    const parts = [];
    for (const p of perks) {
      if (p.id == null || p.value == null || !Number.isFinite(p.id) || !Number.isFinite(p.value)) return null;
      parts.push(`${p.id}-${p.value}`);
    }
    return `${itemId}:${rarity.toLowerCase()}:${quality}:${parts.sort().join("+")}`;
  }
  var CATALOG_KEY = "cortex_trade_catalog_v4";
  var SALES_DB_KEY = "cortex_auction_db_v3";
  var LEGACY_SALES_DB_KEY = "cortex_auction_db_v2";
  var LEGACY_SALES_CACHE_KEY = "cortex_auction_sales_v1";
  var CATALOG_TTL_MS = 7 * 24 * 60 * 60 * 1e3;
  var LEGACY_DISABLED_KEY = "cortex_auction_disabled_v1";
  var LEGACY_COLLAPSE_KEY = "cortex_auction_collapsed_v1";
  var ROOT_ID = "cortex-auction-root";
  var STYLE_ID = "cx-auction-style";
  var FONT_BASE = "https://torncortex.com/fonts";
  function cortexMarkSvg(size) {
    return `<svg viewBox="0 0 64 64" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M46.85 17.15A21 21 0 1 0 46.85 46.85" opacity="0.7"></path><path d="M16 43L25 36L33 39L50 21"></path><circle cx="50" cy="21" r="3.5" fill="var(--cx-accent)" stroke="none"></circle></svg>`;
  }
  var FONT_ID = "cx-auction-font";
  var OWNER_EVENT = "cortex-auction-owner";
  var THEME_KEY = "cortex_trade_theme_v1";
  var PREFS_KEY = "cortex_trade_prefs_v1";
  var DRAWER_SECTIONS = ["insights", "sales"];
  var DEFAULT_PREFS = {
    theme: "dark",
    panelMode: "docked",
    tabVisible: true,
    badgeSize: "medium",
    autoOpen: { insights: false, sales: false },
    panelPos: null,
    tabPos: null
  };
  function readAutoOpen(stored) {
    const src = stored ?? {};
    const next = src.autoOpen;
    if (next && typeof next === "object") {
      const flags = next;
      return { insights: flags.insights === true, sales: flags.sales === true };
    }
    return { insights: src.defaultSection === "insights", sales: src.defaultSection === "sales" };
  }
  function sanePos(v) {
    if (!v || typeof v !== "object") return null;
    const { x, y } = v;
    if (typeof x !== "number" || typeof y !== "number") return null;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    return { x, y };
  }
  function loadPrefs() {
    try {
      const raw = storageGet(PREFS_KEY);
      const painted = readTheme();
      if (!raw) return { ...DEFAULT_PREFS, theme: painted };
      const stored = JSON.parse(raw);
      const merged = { ...DEFAULT_PREFS, ...stored, theme: painted, autoOpen: readAutoOpen(stored) };
      if (merged.panelMode !== "undocked") {
        merged.panelPos = null;
        merged.tabPos = null;
      } else {
        merged.panelPos = sanePos(merged.panelPos);
        merged.tabPos = sanePos(merged.tabPos);
      }
      return merged;
    } catch {
      return { ...DEFAULT_PREFS, theme: readTheme() };
    }
  }
  function savePrefs(p) {
    storageSet(PREFS_KEY, JSON.stringify(p));
  }
  var prefs = loadPrefs();
  var BEST_BUYS_KEY = "cortex_trade_bestbuys_v1";
  var UI_VERSION = "4.29.2";
  var PRODUCT_NAME = "Cortex - RW Auction Insights";
  var AAV_WORD = "AAV";
  var AAV_FULL = "Average Auction Value";
  function gearNoun(kind) {
    if (kind === "armor") return "armor piece";
    if (kind === "weapon") return "weapon";
    return "item";
  }
  function gearPluralForm(kind) {
    if (kind === "armor") return { noun: "armor", verb: "carries" };
    if (kind === "weapon") return { noun: "weapons", verb: "carry" };
    return { noun: "gear", verb: "carries" };
  }
  function compareVersions(a, b) {
    const left = a.split(".").map(Number);
    const right = b.split(".").map(Number);
    for (let i = 0; i < Math.max(left.length, right.length); i++) {
      const delta = (Number.isFinite(left[i]) ? left[i] : 0) - (Number.isFinite(right[i]) ? right[i] : 0);
      if (delta !== 0) return delta;
    }
    return 0;
  }
  var DEEP_PAGES = 6;
  var WINDOW_MS = 365 * 24 * 60 * 60 * 1e3;
  var REFRESH_INTERVAL_MS = 6 * 60 * 60 * 1e3;
  var LAKE_BASE_PRIMARY = "https://api.torncortex.com";
  var SITE_URL = "https://torncortex.com/database";
  var LAKE_BASE_FALLBACK = "https://torn-sentinel-api.somethingagainstme.workers.dev";
  var LAKE_BASE = LAKE_BASE_PRIMARY;
  var lakeHostPinned = false;
  var LAKE_BATCH_PATH = "/api/sales/batch";
  var LAKE_INSTANCE_PATH = "/api/instance";
  var LAKE_ROLL_SALES_PATH = "/api/roll-sales";
  var ROLL_SALES_LIMIT = 20;
  var ROLL_SALES_MAX_PAIRS = 8;
  var INSTANCE_BATCH_SIZE = 15;
  var LAKE_TIMEOUT_MS = 8e3;
  var RESTORE_TIMEOUT_MS = 2e3;
  var LAKE_MAX_ITEMS_PER_REQUEST = 12;
  var LAKE_MAX_PERKS_PER_REQUEST = 40;
  var LAKE_RETRY_DELAY_MS = 1500;
  var LAKE_RETRY_BUDGET = 2;
  var LS_DB_LIMITS = {
    maxItems: 48,
    maxSalesPerItem: 600,
    maxAgeMs: 14 * 24 * 60 * 60 * 1e3,
    windowMs: WINDOW_MS
  };
  var IDB_DB_LIMITS = {
    maxItems: 72,
    maxSalesPerItem: 900,
    maxAgeMs: 21 * 24 * 60 * 60 * 1e3,
    windowMs: WINDOW_MS
  };
  var GEAR_CONFIG = { ...DEFAULT_WPV_CONFIG, itemTypes: ["weapon", "armor"], recentSalesLimit: 20 };
  function storageGet(name) {
    try {
      if (typeof GM_getValue === "function") return GM_getValue(name) ?? null;
    } catch {
    }
    try {
      return window.localStorage.getItem(name);
    } catch {
      return null;
    }
  }
  function storageSet(name, value) {
    try {
      if (typeof GM_setValue === "function") {
        GM_setValue(name, value);
        return;
      }
    } catch {
    }
    try {
      window.localStorage.setItem(name, value);
    } catch {
    }
  }
  function storageDelete(name) {
    try {
      if (typeof GM_deleteValue === "function") {
        GM_deleteValue(name);
        return;
      }
    } catch {
    }
    try {
      window.localStorage.removeItem(name);
    } catch {
    }
  }
  var IDB_NAME = "cortex_trade";
  var IDB_STORE = "kv";
  function idbAvailable() {
    try {
      return typeof indexedDB !== "undefined" && indexedDB != null;
    } catch {
      return false;
    }
  }
  function dbLimits() {
    return idbAvailable() ? IDB_DB_LIMITS : LS_DB_LIMITS;
  }
  var IDB_OPEN_TIMEOUT_MS = 1500;
  function idbOpen() {
    return new Promise((resolve) => {
      let settled = false;
      const finish = (db) => {
        if (settled) return;
        settled = true;
        resolve(db);
      };
      setTimeout(() => finish(null), IDB_OPEN_TIMEOUT_MS);
      try {
        const req = indexedDB.open(IDB_NAME, 1);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE);
        };
        req.onsuccess = () => finish(req.result);
        req.onerror = () => finish(null);
        req.onblocked = () => finish(null);
      } catch {
        finish(null);
      }
    });
  }
  function idbGet(key) {
    return idbOpen().then(
      (db) => new Promise((resolve) => {
        if (!db) return resolve(null);
        try {
          const tx = db.transaction(IDB_STORE, "readonly");
          const req = tx.objectStore(IDB_STORE).get(key);
          req.onsuccess = () => resolve(typeof req.result === "string" ? req.result : null);
          req.onerror = () => resolve(null);
          tx.oncomplete = () => db.close();
        } catch {
          resolve(null);
        }
      })
    );
  }
  function idbSet(key, value) {
    return idbOpen().then(
      (db) => new Promise((resolve) => {
        if (!db) return resolve(false);
        try {
          const tx = db.transaction(IDB_STORE, "readwrite");
          tx.objectStore(IDB_STORE).put(value, key);
          tx.oncomplete = () => {
            db.close();
            resolve(true);
          };
          tx.onerror = () => resolve(false);
          tx.onabort = () => resolve(false);
        } catch {
          resolve(false);
        }
      })
    );
  }
  function idbDelete(key) {
    return idbOpen().then(
      (db) => new Promise((resolve) => {
        if (!db) return resolve();
        try {
          const tx = db.transaction(IDB_STORE, "readwrite");
          tx.objectStore(IDB_STORE).delete(key);
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => resolve();
        } catch {
          resolve();
        }
      })
    );
  }
  async function loadDbPayload() {
    if (idbAvailable()) {
      const fromIdb = await idbGet(SALES_DB_KEY);
      if (fromIdb != null) return fromIdb;
      const legacy = storageGet(SALES_DB_KEY);
      if (legacy != null) {
        await idbSet(SALES_DB_KEY, legacy);
        return legacy;
      }
      return null;
    }
    return storageGet(SALES_DB_KEY);
  }
  async function saveDbPayload(payload) {
    if (idbAvailable()) {
      const ok = await idbSet(SALES_DB_KEY, payload);
      if (ok) return;
    }
    storageSet(SALES_DB_KEY, payload);
  }
  async function deleteDbPayload() {
    storageDelete(SALES_DB_KEY);
    if (idbAvailable()) await idbDelete(SALES_DB_KEY);
  }
  function readTheme() {
    return storageGet(THEME_KEY) === "light" ? "light" : "dark";
  }
  function pdaBridge() {
    const w = window;
    return w.flutter_inappwebview && typeof w.flutter_inappwebview.callHandler === "function" ? w.flutter_inappwebview : null;
  }
  function gmRequest() {
    if (typeof GM_xmlhttpRequest === "function") return GM_xmlhttpRequest;
    try {
      const dot = window.GM;
      if (dot && typeof dot.xmlHttpRequest === "function") return dot.xmlHttpRequest.bind(dot);
    } catch {
    }
    return null;
  }
  async function crossOriginGet(url, timeoutMs) {
    const first = await crossOriginGetOnce(url, timeoutMs);
    if (first !== null) {
      if (url.startsWith(LAKE_BASE)) lakeHostPinned = true;
      return first;
    }
    if (lakeHostPinned || !url.startsWith(LAKE_BASE)) return null;
    const other = LAKE_BASE === LAKE_BASE_PRIMARY ? LAKE_BASE_FALLBACK : LAKE_BASE_PRIMARY;
    const retried = await crossOriginGetOnce(other + url.slice(LAKE_BASE.length), timeoutMs);
    if (retried !== null) {
      LAKE_BASE = other;
      lakeHostPinned = true;
    }
    return retried;
  }
  function crossOriginGetOnce(url, timeoutMs) {
    const bridge = pdaBridge();
    if (bridge) {
      return Promise.race([
        bridge.callHandler("PDA_httpGet", url, {}).then((res) => {
          const text = res?.responseText ?? "";
          return text ? JSON.parse(text) : null;
        }),
        new Promise((resolve) => setTimeout(() => resolve(null), timeoutMs))
      ]).catch(() => null);
    }
    const gm = gmRequest();
    if (gm) {
      return new Promise((resolve) => {
        const timer2 = setTimeout(() => resolve(null), timeoutMs);
        gm({
          method: "GET",
          url,
          responseType: "json",
          timeout: timeoutMs,
          onload(response) {
            clearTimeout(timer2);
            if (!(response.status >= 200 && response.status < 300)) return resolve(null);
            const body = response.response;
            if (typeof body === "string") {
              try {
                return resolve(JSON.parse(body));
              } catch {
                return resolve(null);
              }
            }
            if (body === null || body === void 0) {
              const text = response.responseText ?? "";
              try {
                return resolve(text ? JSON.parse(text) : null);
              } catch {
                return resolve(null);
              }
            }
            resolve(body);
          },
          onerror() {
            clearTimeout(timer2);
            resolve(null);
          },
          ontimeout() {
            clearTimeout(timer2);
            resolve(null);
          },
          onabort() {
            clearTimeout(timer2);
            resolve(null);
          }
        });
      });
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    return fetch(url, { signal: controller.signal, credentials: "omit" }).then((r) => {
      clearTimeout(timer);
      return r.ok ? r.json() : null;
    }).catch(() => {
      clearTimeout(timer);
      return null;
    });
  }
  function pageIsActive() {
    try {
      if (document.visibilityState === "hidden") return false;
      if (pdaBridge()) return true;
      return typeof document.hasFocus !== "function" || document.hasFocus();
    } catch {
      return false;
    }
  }
  function hasLayout() {
    try {
      return typeof document !== "undefined" && document.body != null && document.body.getClientRects().length > 0;
    } catch {
      return false;
    }
  }
  function rowIsVisible(row) {
    return !hasLayout() || row.getClientRects().length > 0;
  }
  function isDesktopView() {
    try {
      return !pdaBridge() && typeof window !== "undefined" && window.innerWidth >= 900;
    } catch {
      return false;
    }
  }
  function ensureFont() {
    try {
      if (document.getElementById(FONT_ID)) return;
      const s = document.createElement("style");
      s.id = FONT_ID;
      s.textContent = `@font-face{font-family:'Archivo';font-style:normal;font-weight:100 900;font-display:swap;src:url('${FONT_BASE}/archivo-variable-latin.woff2') format('woff2');}@font-face{font-family:'Chivo Mono';font-style:normal;font-weight:100 900;font-display:swap;src:url('${FONT_BASE}/chivo-mono-variable-latin.woff2') format('woff2');}`;
      (document.head || document.documentElement).appendChild(s);
    } catch {
    }
  }
  function readCatalogCache() {
    const raw = storageGet(CATALOG_KEY);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      if (!parsed.at || Date.now() - parsed.at > CATALOG_TTL_MS || !Array.isArray(parsed.items)) return null;
      return parsed.items.map((i) => ({ ...i, subType: i.subType ?? null, category: i.category ?? null, kind: i.kind ?? "weapon", lower: i.name.toLowerCase() }));
    } catch {
      return null;
    }
  }
  async function loadCatalog() {
    const cached = readCatalogCache();
    if (cached) return sortForMatch(cached);
    const url = `${LAKE_BASE}/api/catalog`;
    const raw = await crossOriginGet(url, 5e3);
    if (!raw || !Array.isArray(raw.items) || raw.items.length === 0) {
      throw new Error("Catalog unavailable");
    }
    const entries = raw.items.filter((it) => it && Number.isFinite(Number(it.id)) && typeof it.name === "string").map((it) => ({
      id: Number(it.id),
      name: String(it.name),
      baseDamage: typeof it.baseDamage === "number" ? it.baseDamage : null,
      baseAccuracy: typeof it.baseAccuracy === "number" ? it.baseAccuracy : null,
      subType: typeof it.subType === "string" ? it.subType : null,
      category: typeof it.category === "string" ? it.category : null,
      kind: it.type === "Armor" ? "armor" : "weapon"
    }));
    if (entries.length > 0) storageSet(CATALOG_KEY, JSON.stringify({ at: Date.now(), items: entries }));
    return sortForMatch(entries.map((e) => ({ ...e, kind: e.kind ?? "weapon", lower: e.name.toLowerCase() })));
  }
  function sortForMatch(entries) {
    return [...entries].sort((a, b) => b.lower.length - a.lower.length);
  }
  function money(n) {
    if (!Number.isFinite(n)) return "\u2014";
    const s = n < 0 ? "-" : "";
    const v = Math.abs(n);
    if (v >= 1e9) return `${s}$${(v / 1e9).toFixed(2)}b`;
    if (v >= 1e6) return `${s}$${(v / 1e6).toFixed(1)}m`;
    if (v >= 1e3) return `${s}$${(v / 1e3).toFixed(1)}k`;
    return `${s}$${Math.round(v)}`;
  }
  function moneyC(n) {
    return money(n).replace(/\.0+(?=[a-z]?$)/, "");
  }
  var TIER_COLOR = { good: "#56d57b", fair: "#f0bb3b", over: "#fa6863" };
  var AUCTION_ROW_SEL = [
    "#types-tab-1 .items-list > li",
    '#types-tab-1 li[class*="bg-"]',
    "#types-tab-2 .items-list > li",
    '#types-tab-2 li[class*="bg-"]',
    "#auction-house-tabs .items-list > li",
    '#auction-house-tabs li[class*="bg-"]',
    '.items-list > li[class*="bg-"]'
  ].join(",");
  var TITLE_SEL = ".item-cont-wrap > .title, .item-cont-wrap .title, .item-cont-wrap .item-name, .item-name";
  var BONUS_SPAN_SEL = '.iconsbonuses span[title], [class*="iconsbonuses"] span[title]';
  var PRICE_SEL = '.c-bid-wrap, .bids-wrap, [class*="c-bid"]';
  var BADGE_ATTR = "data-cx-sig";
  var BADGE_CLASS = "cx-auction-badge";
  function clean(s) {
    return String(s || "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
  }
  function normalizePerk(name) {
    return String(name || "").toLowerCase().replace(/[\s-]/g, "");
  }
  function statedRarity(row) {
    return parseAuctionRarity(row) ?? parseItemPlateRarity(row);
  }
  var MIN_RARITY_EVIDENCE = 2;
  var DOUBLE_PERK_RARITIES2 = ["orange", "red"];
  var RARITY_TIERS = ["yellow", "orange", "red"];
  var bestBonusesByRow = /* @__PURE__ */ new WeakMap();
  function mergeBonusReads(prev, fresh) {
    if (!prev || prev.length === 0) return fresh;
    const prevPct = /* @__PURE__ */ new Map();
    for (const b of prev) if (b.percent != null) prevPct.set(normalizePerk(b.name), b.percent);
    return fresh.map((b) => {
      if (b.percent == null) {
        const restored = prevPct.get(normalizePerk(b.name));
        if (restored != null) return { name: b.name, percent: restored };
      }
      return b;
    });
  }
  var ROLL_PCT_RE = /(\d+(?:\.\d+)?)\s*%/;
  var ROLL_TURNS_RE = /(\d+(?:\.\d+)?)\s*(?:T\b|turns?\b)/i;
  var ROLL_HOURS_RE = /(\d+(?:\.\d+)?)\s*(?:h\b|hours?\b)/i;
  var rollNum = (m) => m ? Number(m[1]) : null;
  function parsePerkRoll(name, text) {
    const entry = perkRangeByTitle(name);
    if (entry?.unit === "turns") return rollNum(text.match(ROLL_TURNS_RE));
    if (entry?.unit === "hours") return rollNum(text.match(ROLL_HOURS_RE));
    if (entry) return rollNum(text.match(ROLL_PCT_RE));
    return rollNum(text.match(ROLL_PCT_RE)) ?? rollNum(text.match(ROLL_TURNS_RE)) ?? rollNum(text.match(ROLL_HOURS_RE));
  }
  function parseBonuses(row) {
    const fresh = [];
    const seen = /* @__PURE__ */ new Set();
    const spans = row.querySelectorAll(BONUS_SPAN_SEL);
    spans.forEach((span) => {
      const title = span.getAttribute("title") || "";
      let name = "";
      const b = title.match(/<b[^>]*>\s*([^<]+?)\s*<\/b>/i);
      if (b) name = clean(b[1]);
      if (!name) {
        const icon = span.querySelector('i[class*="bonus-attachment-"]');
        const m = icon && String(icon.className).match(/bonus-attachment-([a-z0-9-]+)/i);
        if (m) name = m[1].replace(/-/g, " ");
      }
      if (!name) return;
      const key = normalizePerk(name);
      if (seen.has(key)) return;
      seen.add(key);
      const plain = `${title.replace(/<[^>]+>/g, " ")} ${span.textContent || ""}`;
      fresh.push({ name: name.toLowerCase(), percent: parsePerkRoll(name, plain) });
    });
    const merged = mergeBonusReads(bestBonusesByRow.get(row), fresh);
    if (merged.length > 0) bestBonusesByRow.set(row, merged);
    return merged;
  }
  function parsePrice(row) {
    return parseNativeBidPrice(row, PRICE_SEL);
  }
  var QUALITY_EL_SEL = '[class*="quality" i], [class*="Quality"], [title*="quality" i]';
  function parseQuality(row) {
    const fromPanel = parseAuctionQuality(row);
    if (fromPanel != null) return fromPanel;
    const qEl = row.querySelector(QUALITY_EL_SEL);
    if (!qEl) return null;
    return parseQualityText(clean(`${qEl.getAttribute("title") || ""} ${qEl.textContent || ""}`));
  }
  function parseRowStats(row) {
    return {
      damage: parseAuctionProperty(row, /^Damage:?$/i),
      accuracy: parseAuctionProperty(row, /^Accuracy:?$/i)
    };
  }
  function main() {
    if (window.top !== window.self) return;
    if (location.pathname !== "/amarket.php") return;
    const existingRoot = document.querySelector(`#${ROOT_ID}`);
    const existingVersion = existingRoot?.dataset.cxVersion ?? "";
    if (existingRoot && existingVersion && compareVersions(existingVersion, UI_VERSION) >= 0) return;
    document.dispatchEvent(new CustomEvent(OWNER_EVENT, { detail: { version: UI_VERSION } }));
    document.querySelectorAll(`#${ROOT_ID}`).forEach((n) => n.remove());
    document.getElementById(STYLE_ID)?.remove();
    storageDelete(LEGACY_DISABLED_KEY);
    storageDelete(LEGACY_COLLAPSE_KEY);
    storageDelete(LEGACY_SALES_CACHE_KEY);
    storageDelete(LEGACY_SALES_DB_KEY);
    let catalog = [];
    let catalogReady = false;
    let catalogLoading = false;
    let catalogFailed = false;
    const valueCache = /* @__PURE__ */ new Map();
    const EMPTY_VALUE_CACHE = { at: 0, sales: [], cards: [], broad: [], sigs: [] };
    const jobs = /* @__PURE__ */ new Map();
    const catalogById = /* @__PURE__ */ new Map();
    const requirementsByItem = /* @__PURE__ */ new Map();
    const inFlight = /* @__PURE__ */ new Set();
    const failedItems = /* @__PURE__ */ new Set();
    const lakeItemIds = /* @__PURE__ */ new Set();
    const lakeAttempted = /* @__PURE__ */ new Set();
    const lakeInFlight = /* @__PURE__ */ new Set();
    const lakeAttemptedItems = /* @__PURE__ */ new Set();
    const bridgeRatios = /* @__PURE__ */ new Map();
    const tierMedians = /* @__PURE__ */ new Map();
    const cohortSurfaces = /* @__PURE__ */ new Map();
    const rollSalesCache = /* @__PURE__ */ new Map();
    const rollSalesPending = /* @__PURE__ */ new Set();
    const instanceHistory = /* @__PURE__ */ new Map();
    const instanceQuality = /* @__PURE__ */ new Map();
    function lakeQualityForUid(uid) {
      if (uid == null) return null;
      return instanceQuality.get(String(uid)) ?? null;
    }
    const instanceRarity = /* @__PURE__ */ new Map();
    function lakeRarityForUid(uid) {
      if (uid == null) return null;
      return instanceRarity.get(String(uid)) ?? null;
    }
    let lakePending = false;
    let lakeDiag = "not tried";
    let lakeRetryTimer = null;
    let lakeRetryBudget = LAKE_RETRY_BUDGET;
    let lastInteractionAt = 0;
    const INTERACTION_GRACE_MS = 4e3;
    const bootStart = Date.now();
    let settleMs = 0;
    const queue = new TwoPhaseItemQueue();
    let initialInFlight = 0;
    let stopped = false;
    let renderTimer = null;
    let persistTimer = null;
    let observer = null;
    function rebuildValue(itemId, at = Date.now()) {
      const job = jobs.get(itemId);
      if (!job) return;
      const cutoffSec = Math.floor((Date.now() - WINDOW_MS) / 1e3);
      const sales = job.sales.filter((sale) => sale.timestamp >= cutoffSec);
      valueCache.set(itemId, {
        at,
        sales,
        cards: valueByWeaponPerk(sales, GEAR_CONFIG),
        broad: valueByWeaponPerkSegmented(sales, GEAR_CONFIG),
        sigs: valueByPerkSignature(sales, GEAR_CONFIG)
      });
    }
    let restorePromise = null;
    function ensureRestored() {
      if (!restorePromise) {
        restorePromise = Promise.race([
          restoreSalesDb().catch(() => {
          }),
          new Promise((resolve) => setTimeout(resolve, RESTORE_TIMEOUT_MS))
        ]);
      }
      return restorePromise;
    }
    async function restoreSalesDb() {
      const payload = await loadDbPayload();
      if (stopped) return;
      for (const saved of decodeSalesDb(payload, Date.now(), dbLimits())) {
        const seen = new Set(saved.sales.flatMap((sale) => sale.saleId != null ? [sale.saleId] : []));
        jobs.set(saved.itemId, {
          itemId: saved.itemId,
          sales: saved.sales,
          seen,
          to: saved.to,
          pagesPulled: saved.pagesPulled,
          requestsThisRun: 0,
          exhausted: saved.exhausted,
          completedAt: saved.at,
          category: saved.category
        });
        rebuildValue(saved.itemId, saved.at);
      }
      for (const saved of decodeSalesDbCohorts(payload, Date.now(), dbLimits().maxAgeMs)) {
        if (!cohortSurfaces.has(saved.key)) {
          const cohort = saved.cohort;
          cohortSurfaces.set(saved.key, cohort);
          if (Number.isFinite(cohort.itemId)) lakeItemIds.add(cohort.itemId);
        }
      }
    }
    async function flushSalesDb() {
      if (persistTimer) {
        clearTimeout(persistTimer);
        persistTimer = null;
      }
      const items = [...jobs.values()].filter((job) => job.completedAt != null && job.sales.length > 0).map((job) => {
        const entry = catalogById.get(job.itemId);
        const rep = job.sales[0];
        return {
          itemId: job.itemId,
          name: entry?.name ?? rep?.name ?? null,
          subType: entry?.subType ?? rep?.subType ?? null,
          category: job.category ?? entry?.category ?? null,
          at: job.completedAt ?? Date.now(),
          to: job.to,
          pagesPulled: job.pagesPulled,
          exhausted: job.exhausted,
          sales: job.sales
        };
      });
      const cohorts = [...cohortSurfaces].map(([key, cohort]) => ({ key, cohort }));
      await saveDbPayload(encodeSalesDb(items, dbLimits(), cohorts));
    }
    function requirementNeedsDeep(itemId, cached, requirement) {
      const exactFieldsAvailable = hasCompleteExactSignature(requirement.rarity, requirement.bonuses.map((bonus) => bonus.percent));
      if (!exactFieldsAvailable) {
        if (cached.sales.length >= 200 && !pageLimitByItem.has(itemId)) return false;
        return broadForRow(cached.broad, requirement.bonuses, requirement.rarity) == null;
      }
      if (signatureForRow(cached.sigs, requirement.bonuses, requirement.rarity) != null) return false;
      const seg = segmentedForRow(cached.broad, requirement.bonuses, requirement.rarity);
      if (seg && seg.surface) {
        const roll = requirement.bonuses[0]?.percent;
        if (roll != null && (roll < seg.surface.perkMin || roll > seg.surface.perkMax)) {
          if (lakeAttemptedItems.has(itemId) && lakeItemIds.has(itemId)) return false;
          return true;
        }
        return false;
      }
      if (requirement.bonuses.length === 1) return true;
      return rollBandValue(cached.sales, itemId, requirement.bonuses, requirement.rarity) == null;
    }
    function itemNeedsDeep(itemId) {
      if (lakeAttemptedItems.has(itemId) && lakeItemIds.has(itemId)) return false;
      const cached = valueCache.get(itemId);
      const requirements = requirementsByItem.get(itemId) ?? [];
      return !!cached && requirements.some((requirement) => requirementNeedsDeep(itemId, cached, requirement));
    }
    const DEEP_PAGES_REDUCED = 3;
    const pageLimitByItem = /* @__PURE__ */ new Map();
    function itemHasExactRequirement(itemId) {
      const requirements = requirementsByItem.get(itemId) ?? [];
      return requirements.some((req) => hasCompleteExactSignature(req.rarity, req.bonuses.map((b) => b.percent)));
    }
    function effectivePageLimit(itemId) {
      const explicit = pageLimitByItem.get(itemId);
      if (explicit != null) return explicit;
      return itemHasExactRequirement(itemId) ? DEEP_PAGES : DEEP_PAGES_REDUCED;
    }
    function enqueue(_itemId) {
    }
    function scheduleDeepWork(visibleItemIds) {
      if (!firstPassComplete()) return;
      for (const itemId of visibleItemIds) {
        const job = jobs.get(itemId);
        const needsDeep = itemNeedsDeep(itemId);
        if (!shouldScheduleDeep({
          hasJob: job != null,
          exhausted: job?.exhausted ?? false,
          inFlight: inFlight.has(itemId),
          queued: queue.has(itemId),
          failed: failedItems.has(itemId),
          needsDeep
        })) continue;
        if (job && canDeepen(job)) {
          job.completedAt = null;
          queue.enqueueDeep(itemId);
        }
      }
      void drain();
    }
    function canDeepen(job) {
      return !job.exhausted && itemNeedsDeep(job.itemId) && job.requestsThisRun < effectivePageLimit(job.itemId);
    }
    function firstPassComplete() {
      return catalogReady && queue.initialSize === 0 && initialInFlight === 0;
    }
    function itemHasSearchableGap(itemId) {
      const job = jobs.get(itemId);
      if (!job || job.exhausted) return false;
      if (itemNeedsDeep(itemId)) return true;
      const cached = valueCache.get(itemId);
      const requirements = requirementsByItem.get(itemId) ?? [];
      if (!cached) return false;
      return requirements.some((req) => {
        const exactFieldsAvailable = hasCompleteExactSignature(req.rarity, req.bonuses.map((b) => b.percent));
        if (!exactFieldsAvailable && cached.sales.length >= 200 && !pageLimitByItem.has(itemId)) {
          return broadForRow(cached.broad, req.bonuses, req.rarity) == null;
        }
        return false;
      });
    }
    function hasSearchableGap() {
      for (const [itemId] of requirementsByItem) if (itemHasSearchableGap(itemId)) return true;
      return false;
    }
    function checkRemaining() {
      for (const [itemId] of requirementsByItem) {
        const job = jobs.get(itemId);
        if (!job || job.exhausted || !itemNeedsDeep(itemId)) continue;
        pageLimitByItem.set(itemId, Math.max(effectivePageLimit(itemId), job.requestsThisRun) + DEEP_PAGES);
      }
      if (catalogReady) annotateAll();
    }
    async function drain() {
      return;
    }
    void ensureRestored();
    function injectStyle() {
      ensureFont();
      const prior = document.getElementById(STYLE_ID);
      if (prior) prior.remove();
      const light = theme === "light";
      const bg = light ? "#ffffff" : "#0e0e13";
      const base = light ? "#41414a" : "#c6c6d0";
      const border = light ? "rgba(115,77,190,.40)" : "rgba(178,150,255,.40)";
      const good = light ? "#007e34" : TIER_COLOR.good;
      const fair = light ? "#905d00" : TIER_COLOR.fair;
      const over = light ? "#cc272e" : TIER_COLOR.over;
      const est = light ? "#696972" : "#9797a0";
      const s = document.createElement("style");
      s.id = STYLE_ID;
      s.textContent = `
			.${BADGE_CLASS}{display:inline-flex!important;align-items:center;gap:4px;margin-left:6px;
				height:16px;padding:0 6px;border:1px solid ${border};border-radius:4px;
				font:600 10px/1 'Archivo',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif!important;
				font-variant-numeric:tabular-nums;white-space:nowrap;letter-spacing:.01em;vertical-align:middle;color:${base};background:${bg};
				box-sizing:border-box;position:relative;z-index:5;overflow:visible;pointer-events:none;}
			.${BADGE_CLASS}.cx-good{color:${good};border-color:${good};}
			.${BADGE_CLASS}.cx-fair{color:${fair};border-color:${fair};}
			.${BADGE_CLASS}.cx-over{color:${over};border-color:${over};}
			.${BADGE_CLASS}.cx-est{color:${est};}
			.${BADGE_CLASS}.cx-loading{color:${est};border-style:dotted;}
			.${BADGE_CLASS}.cx-none{color:${fair};border-color:${fair};border-style:dotted;}
			.${BADGE_CLASS}.cx-clickable{pointer-events:auto;cursor:pointer;transition:filter .12s ease,color .15s ease,border-color .15s ease;}
			.${BADGE_CLASS}.cx-clickable:hover{filter:brightness(1.15);}
			/* Badge size. These rules MUST live in the page stylesheet keyed off a class on
			   <html>: the badge is mounted into the auction row in the host document, not in
			   the shadow root, so the ':host(.cx-badge-*)' rules this setting used to rely on
			   could never match it and the control did nothing at all. font-size also needs
			   !important to override the base 'font:' shorthand above, which carries it. */
			html.cx-badge-sm .${BADGE_CLASS}{height:14px;padding:0 5px;font-size:9px!important;}
			html.cx-badge-sm .${BADGE_CLASS} .cx-ld{width:4px;height:4px;}
			html.cx-badge-lg .${BADGE_CLASS}{height:21px;padding:0 9px;font-size:13px!important;}
			html.cx-badge-lg .${BADGE_CLASS} .cx-ld{width:6px;height:6px;}
			.${BADGE_CLASS} .cx-ld{width:5px;height:5px;border-radius:50%;background:currentColor;
				will-change:opacity,transform;animation:cx-ld-breathe 1.8s cubic-bezier(.45,0,.55,1) infinite;}
			@keyframes cx-ld-breathe{0%{opacity:.3;transform:scale(.7)}50%{opacity:1;transform:scale(1.1)}100%{opacity:.3;transform:scale(.7)}}
			@media (prefers-reduced-motion:reduce){.${BADGE_CLASS} .cx-ld{animation:none}}
		`;
      (document.head || document.documentElement).appendChild(s);
    }
    function applyTheme(next) {
      theme = next;
      storageSet(THEME_KEY, next);
      host.classList.toggle("cx-light", theme === "light");
      injectStyle();
      applyPrefs();
    }
    function catalogMatch(titleText) {
      const hay = titleText.toLowerCase();
      for (const e of catalog) {
        if (e.lower.length >= 3 && hay.includes(e.lower)) return e;
      }
      return null;
    }
    function rowItemId(row) {
      for (const el of row.querySelectorAll('span.item-hover[item], [class*="item-hover"][item]')) {
        const raw = Number(el.getAttribute("item"));
        if (Number.isFinite(raw) && raw > 0 && catalogById.has(raw)) return raw;
      }
      return null;
    }
    function rowItemUid(row) {
      for (const el of row.querySelectorAll('span.item-hover[armoury], [class*="item-hover"][armoury]')) {
        const raw = Number(el.getAttribute("armoury"));
        if (Number.isFinite(raw) && raw > 0) return raw;
      }
      return null;
    }
    function resolveRowWeapon(row, titleEl) {
      const stated = rowItemId(row);
      if (stated != null) {
        const entry = catalogById.get(stated);
        if (entry) return entry;
      }
      return titleEl ? catalogMatch(clean(titleEl.textContent)) : null;
    }
    const identityByRow = /* @__PURE__ */ new WeakMap();
    const STATED_BY_UID_MAX = 2e3;
    const statedByUid = /* @__PURE__ */ new Map();
    function rememberStated(uid, tier, quality) {
      const prev = statedByUid.get(uid);
      const next = { tier: tier ?? prev?.tier ?? null, quality: quality ?? prev?.quality ?? null };
      if (prev) statedByUid.delete(uid);
      statedByUid.set(uid, next);
      if (statedByUid.size > STATED_BY_UID_MAX) {
        const oldest = statedByUid.keys().next().value;
        if (oldest !== void 0) statedByUid.delete(oldest);
      }
    }
    function rowIdentity(row, titleEl) {
      const prev = identityByRow.get(row);
      const weapon = resolveRowWeapon(row, titleEl) ?? prev?.weapon ?? null;
      if (!weapon) return null;
      const bonuses = parseBonuses(row);
      const uid = rowItemUid(row) ?? prev?.uid ?? null;
      const held = uid != null ? statedByUid.get(uid) : void 0;
      const pageQuality = parseQuality(row) ?? prev?.quality ?? held?.quality ?? null;
      const quality = pageQuality ?? lakeQualityForUid(uid);
      const statedTier = statedRarity(row) ?? prev?.statedTier ?? held?.tier ?? null;
      if (uid != null) rememberStated(uid, statedTier, pageQuality);
      const identity = { weapon, bonuses, quality, uid, statedTier };
      identityByRow.set(row, identity);
      return identity;
    }
    const RARITY_RANK2 = { grey: 0, gray: 0, yellow: 1, orange: 2, red: 3 };
    const rankOf = (r) => r && RARITY_RANK2[r.toLowerCase()] != null ? RARITY_RANK2[r.toLowerCase()] : -1;
    function broadForRow(segmented, bonuses, rarity) {
      const wantDouble = bonuses.length >= 2;
      const names = new Set(bonuses.map((b) => normalizePerk(b.name)));
      const mine = segmented.filter((c) => names.has(normalizePerk(c.perkTitle)));
      const byComps = (arr) => arr.slice().sort((a, b) => b.comps - a.comps)[0] ?? null;
      if (rarity) {
        const rk = rankOf(rarity);
        if (!wantDouble) {
          const same = byComps(mine.filter((c) => !c.doublePerk && rankOf(c.cohortRarity) === rk));
          if (same) return { value: same, matchedRarity: same.cohortRarity, crossedRarity: false, floor: false };
        } else {
          const sameSingles = mine.filter((c) => !c.doublePerk && rankOf(c.cohortRarity) === rk);
          const bestSingle = sameSingles.slice().sort((a, b) => b.medianPrice - a.medianPrice || b.comps - a.comps)[0];
          if (bestSingle) return { value: bestSingle, matchedRarity: bestSingle.cohortRarity, crossedRarity: false, floor: true };
        }
        const lower = mine.filter((c) => !c.doublePerk && rankOf(c.cohortRarity) >= 0 && rankOf(c.cohortRarity) < rk).sort((a, b) => rankOf(b.cohortRarity) - rankOf(a.cohortRarity) || b.comps - a.comps);
        if (lower[0]) return { value: lower[0], matchedRarity: lower[0].cohortRarity, crossedRarity: true, floor: true };
        return null;
      }
      return null;
    }
    function perkIdForRow(itemId, name) {
      const ids = bonusIdsByTitle(name);
      if (ids.length <= 1) return ids[0] ?? null;
      const job = jobs.get(itemId);
      if (job) {
        for (const id of ids) if (job.sales.some((s) => s.bonuses.some((b) => b.id === id))) return id;
      }
      for (const id of ids) {
        for (const rarity of ["yellow", "orange", "red"]) {
          if (cohortSurfaces.has(`${itemId}:${id}:${rarity}`)) return id;
        }
      }
      return ids[0];
    }
    function rollBandValue(sales, itemId, bonuses, rarity) {
      if (!rarity || bonuses.length === 0 || bonuses.some((b) => b.percent == null)) return null;
      const perks = bonuses.map((b) => ({ id: perkIdForRow(itemId, b.name), value: b.percent })).filter((p) => p.id != null);
      if (perks.length !== bonuses.length) return null;
      const value = valueForRollBand(sales, { itemId, rarity, perks, wantDouble: bonuses.length >= 2 }, GEAR_CONFIG);
      if (!value) return null;
      return { value, tol: Math.max(...perks.map((p) => effectivePerkTolerance(p.id, rarity))) };
    }
    function segmentedForRow(segmented, bonuses, rarity) {
      if (!rarity || bonuses.length !== 1 || bonuses[0].percent == null) return null;
      const rk = rankOf(rarity);
      const name = normalizePerk(bonuses[0].name);
      return segmented.filter((c) => !c.doublePerk && rankOf(c.cohortRarity) === rk && normalizePerk(c.perkTitle) === name).sort((a, b) => b.comps - a.comps)[0] ?? null;
    }
    function signatureForRow(sigs, bonuses, rarity) {
      if (!rarity || bonuses.length === 0 || bonuses.some((b) => b.percent == null)) return null;
      const want = [...bonuses].sort((a, b) => a.name.localeCompare(b.name));
      let best = null;
      for (const s of sigs) {
        if (s.perkTitles.length !== want.length) continue;
        if (rarity && s.rarity?.toLowerCase() !== rarity.toLowerCase()) continue;
        const have = s.perkTitles.map((title, i) => ({ name: title.toLowerCase(), percent: s.perkValues[i] })).sort((a, b) => a.name.localeCompare(b.name));
        const same = have.every(
          (x, i) => normalizePerk(x.name) === normalizePerk(want[i].name) && want[i].percent != null && Math.abs(x.percent - want[i].percent) < 1e-3
        );
        if (same && (!best || s.comps > best.comps)) best = s;
      }
      return best;
    }
    function observedSaleSpread(cohort, roll) {
      if (!cohort || roll == null || !Number.isFinite(roll)) return null;
      const entry = cohort.priceByValue?.find((e) => e.value === roll);
      if (!entry) return null;
      const low = Number(entry.spreadLow);
      const high = Number(entry.spreadHigh);
      if (!Number.isFinite(low) || !Number.isFinite(high)) return null;
      if ((entry.count ?? 0) < 4 || !(high > low)) return null;
      return { low, high };
    }
    function aavSpreadHalf(priceSpread) {
      const s = Number.isFinite(priceSpread) ? priceSpread : 0;
      return Math.min(0.4, Math.max(0.06, s)) / 2;
    }
    function effectiveQualityRate(slope) {
      if (slope == null || !Number.isFinite(slope) || slope <= 0) return null;
      return slope * QUALITY_NUDGE_SHRINK;
    }
    function perkSensitivityFor(itemId, bonuses, rarity, localSurface, model) {
      if (bonuses.length !== 1) return { perkSensitivity: null, qualitySensitivity: null, sensitivityFit: null };
      if (rarity) {
        const server = cohortForPerk(itemId, bonuses[0].name, rarity);
        if (server?.plane && server.plane.perkSlope > 0) {
          const coherent = slopeAgreesWithLadder(server.plane.perkSlope, server.priceByValue);
          return {
            perkSensitivity: coherent ? server.plane.perkSlope : null,
            qualitySensitivity: effectiveQualityRate(server.plane.qualitySlope),
            sensitivityFit: coherent ? server.plane.r2 >= 0.5 ? "strong" : "rough" : null
          };
        }
      }
      if (localSurface && localSurface.perkSlope > 0) {
        return {
          perkSensitivity: localSurface.perkSlope,
          qualitySensitivity: effectiveQualityRate(localSurface.qualitySlope),
          sensitivityFit: "rough"
        };
      }
      const qs = model && model.r2 >= 0.25 ? effectiveQualityRate(model.slope) : null;
      return { perkSensitivity: null, qualitySensitivity: qs, sensitivityFit: qs != null ? "rough" : null };
    }
    function slopeAgreesWithLadder(perkSlope, ladder) {
      if (!Array.isArray(ladder) || ladder.length < 3) return true;
      const sorted = [...ladder].filter((e) => Number.isFinite(e.value) && e.median > 0).sort((a, b) => a.value - b.value);
      if (sorted.length < 3) return true;
      const span = sorted[sorted.length - 1].value - sorted[0].value;
      if (!(span > 0)) return true;
      const ladderSlope = (sorted[sorted.length - 1].median - sorted[0].median) / span;
      if (!(ladderSlope > 0)) return true;
      const ratio = perkSlope / ladderSlope;
      return ratio >= 0.5 && ratio <= 2;
    }
    function cohortForPerk(itemId, perkName, rarity) {
      let best = null;
      for (const id of bonusIdsByTitle(perkName)) {
        const found = cohortSurfaces.get(`${itemId}:${id}:${rarity.toLowerCase()}`);
        if (found && (!best || found.comps > best.comps)) best = found;
      }
      return best;
    }
    const bridgeKey = (itemId, bonusId, from, to) => `${itemId}:${bonusId}:${from.toLowerCase()}>${to.toLowerCase()}`;
    function bridgedValueFor(itemId, bonuses, rarity) {
      if (bonuses.length !== 1 || !rarity) return null;
      const step = BRIDGE_STEPS.find((s) => s.to === rarity.toLowerCase());
      if (!step) return null;
      for (const bonusId of bonusIdsByTitle(bonuses[0].name)) {
        const lower = cohortSurfaces.get(`${itemId}:${bonusId}:${step.from}`);
        const pair = bridgeRatios.get(bridgeKey(itemId, bonusId, step.from, step.to));
        const fromMedian = pair?.fromMedian ?? lower?.medianPrice ?? 0;
        const fromComps = pair?.fromComps ?? lower?.comps ?? 0;
        if (!(fromMedian > 0)) continue;
        const result = bridgeRarityValue({
          from: step.from,
          to: step.to,
          fromMedian,
          fromComps,
          bonusId,
          pairRatio: pair?.ratio ?? null,
          pairCv: pair?.cv ?? null,
          pairComps: pair?.toComps ?? null
        });
        if (result) return { ...result, fromComps };
      }
      return null;
    }
    function singlePerkReference(itemId, perkName, rarity) {
      if (!rarity) return null;
      const tier = rarity.toLowerCase();
      for (const bonusId of bonusIdsByTitle(perkName)) {
        const own = tierMedians.get(`${itemId}:${bonusId}:${tier}`);
        if (own && own.median > 0 && own.sales >= PREMIUM_MIN_REF_SALES) {
          return { value: own.median, scope: "own", sales: own.sales };
        }
      }
      const laddered = bridgedValueFor(itemId, [{ name: perkName, percent: null }], rarity);
      return laddered ? { value: laddered.value, scope: `bridge-${laddered.scope}`, sales: null } : null;
    }
    function composedForRow(itemId, bonuses, rarity) {
      if (bonuses.length !== 2 || !isDoublePerkRarity(rarity)) return null;
      const sides = bonuses.map((b) => {
        const ref = singlePerkReference(itemId, b.name, rarity);
        return {
          bonusId: perkIdForRow(itemId, b.name),
          refValue: ref?.value ?? null,
          refScope: ref?.scope ?? null,
          refSales: ref?.sales ?? null
        };
      });
      return composeDoublePerkValue(rarity, sides);
    }
    function serverCohortFor(itemId, bonuses, rarity) {
      if (bonuses.length !== 1 || !rarity) return null;
      return cohortForPerk(itemId, bonuses[0].name, rarity);
    }
    function rarityCandidatesForRoll(itemId, bonusIds, roll, perkName, sales) {
      const lake = (tiers) => ({ tiers, fromSourcedTable: false });
      if (roll == null || !Number.isFinite(roll) || bonusIds.length === 0) return lake([]);
      const bands = [];
      for (const rarity of RARITY_TIERS) {
        let best = null;
        for (const id of bonusIds) {
          const ladder = cohortSurfaces.get(`${itemId}:${id}:${rarity}`)?.priceByValue;
          if (!ladder?.length) continue;
          const values = ladder.map((e) => e.value).filter((v) => Number.isFinite(v));
          if (values.length === 0) continue;
          const atRoll = ladder.find((e) => e.value === roll)?.count ?? 0;
          const candidate = { min: Math.min(...values), max: Math.max(...values), atRoll };
          if (!best || candidate.atRoll > best.atRoll) best = candidate;
        }
        if (!best && perkName) {
          const rolls = [];
          for (const s of sales) {
            if (s.rarity?.toLowerCase() !== rarity) continue;
            if (s.bonuses.length !== 1) continue;
            if (normalizePerk(s.bonuses[0].title ?? "") !== normalizePerk(perkName)) continue;
            const v = s.bonuses[0].value;
            if (typeof v === "number" && Number.isFinite(v)) rolls.push(v);
          }
          if (rolls.length > 0) {
            best = {
              min: Math.min(...rolls),
              max: Math.max(...rolls),
              atRoll: rolls.filter((v) => v === roll).length
            };
          }
        }
        if (best) bands.push({ rarity, ...best });
      }
      if (bands.length === 0) {
        const only = RARITY_TIERS.filter((rarity) => rollIsInSourcedBand(bonusIds, roll, rarity));
        return only.length === 1 ? { tiers: only, fromSourcedTable: true } : lake([]);
      }
      const traded = bands.filter((b) => b.atRoll >= MIN_RARITY_EVIDENCE);
      if (traded.length > 0) {
        const allowed = traded.filter((b) => rollCanBeTier(bonusIds, roll, b.rarity));
        const pool2 = allowed.length > 0 ? allowed : traded;
        if (pool2.length > 1) {
          const sorted = [...pool2].sort((a, b) => b.atRoll - a.atRoll);
          const dominant = sorted[0];
          const rest = sorted.slice(1).reduce((sum, b) => sum + b.atRoll, 0);
          if (dominant.atRoll >= 3 * Math.max(1, rest)) {
            return lake([dominant.rarity]);
          }
          if (dominant.atRoll >= 8 && dominant.atRoll >= 2 * Math.max(1, rest)) {
            return lake([dominant.rarity]);
          }
        }
        return lake(pool2.map((b) => b.rarity));
      }
      const inBand = bands.filter((b) => roll >= b.min && roll <= b.max && rollCanBeTier(bonusIds, roll, b.rarity));
      if (inBand.length > 0) return lake(inBand.map((b) => b.rarity));
      const inBandRaw = bands.filter((b) => roll >= b.min && roll <= b.max);
      if (inBandRaw.length > 0 && !RARITY_TIERS.some((r) => rollIsInSourcedBand(bonusIds, roll, r))) {
        return lake(inBandRaw.map((b) => b.rarity));
      }
      const sourced = RARITY_TIERS.filter((rarity) => rollIsInSourcedBand(bonusIds, roll, rarity));
      if (sourced.length === 1) return { tiers: sourced, fromSourcedTable: true };
      const pool = sourced.length > 1 ? bands.filter((b) => sourced.includes(b.rarity)) : bands;
      if (pool.length === 0) return sourced.length > 1 ? { tiers: sourced, fromSourcedTable: true } : lake([]);
      const distance = (b) => roll < b.min ? b.min - roll : roll - b.max;
      const nearest = Math.min(...pool.map(distance));
      return lake(pool.filter((b) => distance(b) === nearest).map((b) => b.rarity));
    }
    function rollIsInSourcedBand(bonusIds, roll, rarity) {
      for (const id of bonusIds) {
        const band = rollBandFor(id, rarity);
        if (band && roll >= band[0] && roll <= band[1]) return true;
      }
      return false;
    }
    function rollCanBeTier(bonusIds, roll, rarity) {
      const covered = bonusIds.some((id) => rollBandFor(id, rarity) != null);
      return covered ? rollIsInSourcedBand(bonusIds, roll, rarity) : true;
    }
    function resolveRowRarity(itemId, bonuses, row, sales, rememberedTier = null) {
      const stated = statedRarity(row) ?? rememberedTier ?? lakeRarityForUid(rowItemUid(row));
      if (stated) return { rarity: stated, basis: "stated", candidates: [stated] };
      if (bonuses.length > 1) {
        const seen = DOUBLE_PERK_RARITIES2.filter(
          (rarity) => sales.some(
            (s) => s.rarity?.toLowerCase() === rarity && s.bonuses.length === bonuses.length && bonuses.every((b) => s.bonuses.some((sb) => normalizePerk(sb.title ?? "") === normalizePerk(b.name)))
          )
        );
        if (seen.length === 1) return { rarity: seen[0], basis: "lake", candidates: seen };
        const candidates3 = seen.length > 1 ? seen : DOUBLE_PERK_RARITIES2.slice();
        return { rarity: null, basis: "ambiguous", candidates: candidates3 };
      }
      const roll = bonuses[0]?.percent ?? null;
      if (roll == null) return { rarity: null, basis: "unknown", candidates: [] };
      const ids = bonusIdsByTitle(bonuses[0].name);
      if (ids.length === 0) return { rarity: null, basis: "unknown", candidates: [] };
      const { tiers: candidates2, fromSourcedTable } = rarityCandidatesForRoll(itemId, ids, roll, bonuses[0].name, sales);
      if (candidates2.length === 1) {
        return { rarity: candidates2[0], basis: fromSourcedTable ? "sourced" : "lake", candidates: candidates2 };
      }
      if (candidates2.length > 1) return { rarity: null, basis: "ambiguous", candidates: candidates2 };
      return { rarity: null, basis: "unknown", candidates: [] };
    }
    function valueFromServerCohort(c, roll, quality) {
      const v = valuePerRoll(c.priceByValue, c.medianPrice, roll, quality, c.plane);
      if (!v) return null;
      const basis = v.basis === "roll" ? "server-roll" : v.basis === "interp" ? "server-interp" : "server-median";
      return {
        value: v.value,
        basis,
        bound: v.bound,
        comps: v.comps || c.comps,
        perDay: c.perDay,
        windowDays: c.spanDays,
        low: v.low,
        high: v.high,
        qualityRefined: v.qualityRefined,
        refQuality: v.baselineQuality,
        sourceRolls: v.sourceRolls,
        sourceDistinctItems: v.sourceDistinctItems,
        predLow: v.predLow,
        predHigh: v.predHigh
      };
    }
    function serverCohortTierValue(c) {
      const medians = (c.priceByValue ?? []).map((e) => e.median).filter((v) => typeof v === "number" && Number.isFinite(v) && v > 0).sort((a, b) => a - b);
      const value = medians.length > 0 ? medians[Math.floor(medians.length / 2)] : c.medianPrice;
      if (!Number.isFinite(value) || value <= 0) return null;
      return {
        value,
        basis: "server-median",
        bound: null,
        comps: c.comps,
        perDay: c.perDay,
        windowDays: c.spanDays,
        low: medians.length > 0 ? medians[0] : value,
        high: medians.length > 0 ? medians[medians.length - 1] : value,
        qualityRefined: false,
        refQuality: null,
        sourceRolls: [],
        sourceDistinctItems: null,
        predLow: null,
        predHigh: null
      };
    }
    function resolveSpanView(row, weapon, cached, bonuses, read, quality, price) {
      const views = read.candidates.map((r) => resolveRowView(row, weapon, cached, bonuses, r, quality, price, read)).filter((v) => v != null);
      if (views.length === 0) return null;
      const low = Math.min(...views.map((v) => Math.min(v.aavLow, v.fair)));
      const high = Math.max(...views.map((v) => Math.max(v.aavHigh, v.fair)));
      const base = views.slice().sort((a, b) => a.fair - b.fair)[0];
      return {
        ...base,
        aavLow: low,
        aavHigh: high,
        comps: views.reduce((sum, v) => sum + v.comps, 0),
        perkBound: null,
        projection: null,
        bridge: null,
        valueRolls: [],
        valueRollDistinctItems: null,
        predLow: null,
        predHigh: null,
        pair: null,
        rarityBasis: "ambiguous",
        rarityCandidates: read.candidates,
        matchedRarity: null,
        sigKey: `ambiguous:${read.candidates.join("|")}:${bonuses.map((b) => Math.round(b.percent ?? 0)).join("+")}`
      };
    }
    function resolveRowView(row, weapon, cached, bonuses, rarity, quality, price, rarityRead) {
      const exactFieldsAvailable = !!rarity && bonuses.length > 0 && bonuses.every((bonus) => bonus.percent != null);
      const exact = signatureForRow(cached.sigs, bonuses, rarity);
      const seg = exact ? null : segmentedForRow(cached.broad, bonuses, rarity);
      const surface = seg ? fairValueOnSurfaceAt(seg.surface, bonuses[0]?.percent ?? null, quality) : null;
      const useSurface = surface != null && seg != null;
      const composed = exact || useSurface ? null : composedForRow(weapon.id, bonuses, rarity);
      const band = exact || useSurface || composed ? null : rollBandValue(cached.sales, weapon.id, bonuses, rarity);
      const serverCohort = serverCohortFor(weapon.id, bonuses, rarity);
      const serverRoll = bonuses[0]?.percent ?? null;
      const serverCandidate = serverCohort ? serverRoll != null ? valueFromServerCohort(serverCohort, serverRoll, quality) : serverCohortTierValue(serverCohort) : null;
      const serverVal = preferServerValue(exact, serverCandidate) ? serverCandidate : null;
      const qualitySensitive = serverCohort?.plane != null && Number.isFinite(serverCohort.plane.r2) && serverCohort.plane.r2 >= QUALITY_REFINE_MIN_R2 && Number.isFinite(serverCohort.plane.qualitySlope) && serverCohort.plane.qualitySlope > 0;
      const bridged = !exact && !serverVal && !useSurface && !band ? bridgedValueFor(weapon.id, bonuses, rarity) : null;
      const broad = exact || useSurface || band || bridged || composed ? null : broadForRow(cached.broad, bonuses, rarity);
      const source = exact ?? (useSurface ? seg : null) ?? band?.value ?? broad?.value ?? null;
      if (!source && !serverVal && !bridged && !composed) return null;
      const effectiveSource = source ?? (serverVal ? {
        comps: serverVal.comps,
        windowDays: serverVal.windowDays,
        perDay: serverVal.perDay,
        medianPrice: serverVal.value,
        recencyMedian: serverVal.value,
        lowPrice: serverVal.low ?? serverVal.value,
        highPrice: serverVal.high ?? serverVal.value,
        lowTrimmed: 0,
        highTrimmed: 0,
        perkValueMin: serverCohort.perkMin,
        perkValueMax: serverCohort.perkMax,
        qualityMin: serverCohort?.plane?.qualityMin ?? null,
        qualityMax: serverCohort?.plane?.qualityMax ?? null,
        qualityMedian: serverCohort?.qualityMedian ?? null,
        model: null,
        trend: null,
        rarity: serverCohort.rarity,
        bands: [],
        recentSales: [],
        priceSpread: 0,
        concentration: null
      } : composed && !bridged ? (
        {
          comps: 0,
          windowDays: null,
          perDay: null,
          medianPrice: composed.value,
          recencyMedian: composed.value,
          lowPrice: composed.low,
          highPrice: composed.high,
          lowTrimmed: 0,
          highTrimmed: 0,
          perkValueMin: null,
          perkValueMax: null,
          qualityMin: null,
          qualityMax: null,
          qualityMedian: null,
          model: null,
          trend: null,
          rarity,
          bands: [],
          recentSales: [],
          priceSpread: 0,
          concentration: null
        }
      ) : (
        {
          comps: bridged.fromComps,
          windowDays: null,
          perDay: null,
          medianPrice: bridged.value,
          recencyMedian: bridged.value,
          lowPrice: bridged.low,
          highPrice: bridged.high,
          lowTrimmed: 0,
          highTrimmed: 0,
          perkValueMin: null,
          perkValueMax: null,
          qualityMin: null,
          qualityMax: null,
          qualityMedian: null,
          model: null,
          trend: null,
          rarity,
          bands: [],
          recentSales: [],
          priceSpread: 0,
          concentration: null
        }
      ));
      let fair;
      let typicalQuality = false;
      let pricedQuality = null;
      if (useSurface) {
        fair = { value: surface.value, basis: "perk-quality" };
        typicalQuality = surface.usedTypicalQuality;
        pricedQuality = typicalQuality ? seg.surface.qualityMedian : quality;
      } else if (source) {
        const fallbackQuality = quality ?? effectiveSource.qualityMedian;
        fair = fairValueAt(source, fallbackQuality);
        typicalQuality = quality == null && fallbackQuality != null && fair.basis !== "median";
        pricedQuality = fair.basis === "median" ? null : fallbackQuality;
      } else if (bridged) {
        fair = { value: bridged.value, basis: "perk-quality" };
      } else if (composed) {
        fair = { value: composed.value, basis: "perk-quality" };
      } else {
        fair = { value: serverVal.value, basis: "perk-quality" };
      }
      if (serverVal) {
        fair = { value: serverVal.value, basis: "perk-quality" };
        typicalQuality = !serverVal.qualityRefined;
        pricedQuality = serverVal.refQuality;
      }
      const rowStats = parseRowStats(row);
      const sane = (v, base) => {
        if (v == null) return null;
        if (base == null || base <= 0) return v;
        return v >= base * 0.4 && v <= base * 2 ? v : null;
      };
      const rowDamage = weapon.kind === "weapon" ? sane(rowStats.damage, weapon.baseDamage) : null;
      const rowAccuracy = weapon.kind === "weapon" ? sane(rowStats.accuracy, weapon.baseAccuracy) : null;
      const rowArmor = weapon.kind === "armor" ? parseAuctionProperty(row, /^Armor:?$/i) : null;
      const exactRoll = exact != null;
      let estimateBound = null;
      if (!exactRoll && !useSurface && !serverVal && !bridged && !composed && bonuses.length === 1 && bonuses[0]?.percent != null) {
        const rollPct = bonuses[0].percent;
        const observedRolls = effectiveSource.recentSales.map((s) => s.perks[0]).filter((v) => Number.isFinite(v));
        if (observedRolls.length >= 3) {
          const lo = Math.min(...observedRolls);
          const hi = Math.max(...observedRolls);
          if (rollPct < lo && effectiveSource.lowTrimmed > 0) {
            estimateBound = "ceiling";
            fair = { value: effectiveSource.lowTrimmed, basis: fair.basis };
          } else if (rollPct > hi && effectiveSource.highTrimmed > 0) {
            estimateBound = "floor";
            fair = { value: effectiveSource.highTrimmed, basis: fair.basis };
          }
        }
      }
      const serverRollEntry = serverCohort && serverRoll != null ? serverCohort.priceByValue?.find((e) => e.value === serverRoll) ?? null : null;
      const serverExactRoll = serverVal != null && isServerExactMatch(
        serverVal.basis,
        serverVal.bound,
        serverVal.comps,
        serverRollEntry?.derived,
        serverRollEntry?.distinctItems
      );
      const serverEstimate = serverVal != null && !serverExactRoll;
      const isDirectMatch = exactRoll || serverExactRoll;
      const matchTier = resolveMatchTier(
        isDirectMatch,
        useSurface || band != null || serverEstimate || bridged != null || composed != null,
        broad?.floor === true && !serverVal && !bridged && !composed
      );
      const rollForEvidence = bonuses.length === 1 && isDirectMatch ? bonuses[0]?.percent ?? null : null;
      const recentSalesEvidence = evidenceForMatch(
        [...effectiveSource.recentSales].sort((a, b) => b.timestamp - a.timestamp),
        isDirectMatch,
        bonuses.length,
        rollForEvidence
      );
      let rollKey;
      if (exact) rollKey = perkRollSignatureKey(exact.bonusIds.map((id, i) => ({ id, value: exact.perkValues[i] })));
      else if (useSurface) rollKey = `surface:${seg.itemId}:${seg.bonusId}:${seg.cohortRarity ?? "any"}`;
      else if (band) rollKey = `band:${rarity}:${bonuses.map((b) => `${normalizePerk(b.name)}${b.percent}`).sort().join("+")}`;
      else if (broad) rollKey = `broad:${broad.value.bonusId}:${broad.matchedRarity ?? "any"}:${broad.floor ? "floor" : "est"}`;
      else if (bridged)
        rollKey = `bridge:${weapon.id}:${bridged.from}>${bridged.to}:${bridged.scope}:${bonuses.map((b) => `${normalizePerk(b.name)}${b.percent}`).sort().join("+")}`;
      else if (composed)
        rollKey = `pair:${weapon.id}:${rarity ?? "unknown"}:${composed.agreement}:${composed.basis}:${bonuses.map((b) => `${normalizePerk(b.name)}${b.percent}`).sort().join("+")}`;
      else rollKey = `server:${weapon.id}:${serverVal.basis}:${rarity ?? "unknown"}:${bonuses.map((b) => `${normalizePerk(b.name)}${b.percent}`).sort().join("+")}`;
      return {
        row,
        itemId: weapon.id,
        weaponName: weapon.name,
        rarity,
        bonuses,
        fair: fair.value,
        fairBasis: fair.basis,
        evidence: isDirectMatch ? "verified" : "indicative",
        matchTier,
        perkTol: band ? band.tol : null,
        estimateReason: isDirectMatch ? null : exactFieldsAvailable ? "sparse" : "missing-details",
        crossedRarity: !serverVal && (broad?.crossedRarity ?? false),
        broadFloor: !serverVal && (broad?.floor ?? false),
        matchedRarity: isDirectMatch || useSurface || band || serverVal ? rarity : broad?.matchedRarity ?? null,
        doublePerk: bonuses.length >= 2,
        rarityBasis: rarityRead?.basis ?? (rarity ? "stated" : "unknown"),
        rarityCandidates: rarityRead?.candidates ?? (rarity ? [rarity] : []),
        quality,
        typicalQuality,
        pricedQuality,
        qualitySensitive,
        perkBound: serverVal ? serverVal.bound : useSurface ? surface.perkBound : estimateBound,
        kind: weapon.kind,
        rowDamage,
        rowAccuracy,
        rowArmor,
        price,
        projection: suppressFlip(matchTier) ? null : projectAuctionReturn(fair.value, price, 0),
        trend: serverCohort?.trend ? {
          direction: serverCohort.trend.direction,
          changePct: serverCohort.trend.changePct,
          recentMedian: 0,
          olderMedian: 0,
          recentSales: serverCohort.trend.sales ?? 0,
          olderSales: 0,
          spanDays: serverCohort.trend.spanDays,
          qualityAdjusted: true
        } : effectiveSource.trend,
        comps: serverVal ? serverVal.comps : effectiveSource.comps,
        exactRollComps: serverRollEntry?.count ?? 0,
        rollDerived: serverVal != null && serverRollEntry?.derived === true,
        rollBlockRolls: serverRollEntry?.blockRolls ?? 0,
        rollDistinctItems: serverRollEntry?.distinctItems ?? 0,
        valueRolls: serverVal?.sourceRolls ?? [],
        valueRollDistinctItems: serverVal?.sourceDistinctItems ?? null,
        predLow: serverVal?.predLow ?? null,
        predHigh: serverVal?.predHigh ?? null,
        rollNewestTs: serverRollEntry?.newestTs ?? null,
        olderRollComps: serverRollEntry?.olderCount ?? 0,
        outlierRollComps: serverRollEntry?.outlierCount ?? 0,
        olderCohortComps: serverCohort?.olderSales ?? 0,
        pricedSinceTs: serverCohort?.pricedSinceTs ?? null,
        windowDays: serverVal ? serverVal.windowDays : effectiveSource.windowDays,
        perDay: serverVal ? serverVal.perDay : effectiveSource.perDay,
        recentSales: recentSalesEvidence,
        aavLow: composed?.low ?? bridged?.low ?? serverVal?.low ?? Math.round(fair.value * (1 - aavSpreadHalf(effectiveSource.priceSpread))),
        aavHigh: composed?.high ?? bridged?.high ?? serverVal?.high ?? Math.round(fair.value * (1 + aavSpreadHalf(effectiveSource.priceSpread))),
        bridge: bridged ? {
          text: bridgeDisclosure(bridged, bridged.fromComps),
          from: bridged.from,
          scope: bridged.scope,
          wide: bridged.wide
        } : null,
        pair: composed ? {
          text: doublePerkDisclosure(composed, (id) => bonusTitle(id)),
          agreement: composed.agreement,
          basis: composed.basis,
          wide: composed.wide
        } : null,
        aavHalfLifeDays: serverVal != null && (serverCohort?.recencyWeightedRolls ?? 0) > 0 ? serverCohort?.aavHalfLifeDays ?? null : null,
        concentration: serverCohort?.concentration ? serverCohort.concentration.flag : concentrationFlag(effectiveSource.concentration),
        dealKey: `${weapon.id}:${rarity ?? "?"}:${bonuses.map((b) => Math.round(b.percent ?? 0)).sort((a, z) => a - z).join("+")}`,
        sigKey: `${isDirectMatch ? "exact" : "estimate"}:${rarity ?? "unknown"}:${rollKey}`,
        endsInSeconds: parseAuctionTimer(row),
        confidence: deriveConfidence(serverVal ? serverVal.comps : effectiveSource.comps, recentSalesEvidence, Math.floor(Date.now() / 1e3)),
        ...perkSensitivityFor(weapon.id, bonuses, rarity, useSurface ? seg?.surface ?? null : null, effectiveSource.model),
        isNewRow: initialPassDone && !knownRows.has(row),
        reconciled: (serverCohort?.isotonicAdjusted ?? 0) > 0,
        saleSpread: bonuses.length === 1 && bonuses[0]?.percent != null ? observedSaleSpread(serverCohort, bonuses[0].percent) : null,
        ladder: bonuses.length === 1 && Array.isArray(serverCohort?.priceByValue) ? serverCohort.priceByValue : null,
        trendCi: serverCohort?.trend?.ciLowPct != null && serverCohort.trend.ciHighPct != null ? {
          low: serverCohort.trend.ciLowPct,
          high: serverCohort.trend.ciHighPct,
          horizonDays: serverCohort.trend.horizonDays ?? serverCohort.trend.spanDays
        } : null,
        history: instanceHistoryFor(row, weapon, rarity, quality, bonuses)
      };
    }
    function instanceHistoryFor(row, weapon, rarity, quality, bonuses) {
      const uid = rowItemUid(row);
      if (uid != null) {
        const byUid = instanceHistory.get(String(uid));
        if (byUid !== void 0) return byUid;
        return null;
      }
      const fp = instanceFingerprint(
        weapon.id,
        rarity,
        quality,
        bonuses.map((b) => ({ id: perkIdForRow(weapon.id, b.name), value: b.percent }))
      );
      return instanceHistory.get(fp ?? "") ?? null;
    }
    function roiTier(view) {
      const vs = bidVsAav(view);
      if (!vs) return "fair";
      if (vs.within) return "fair";
      if (vs.below) return vs.pct >= 10 ? "good" : "fair";
      return "over";
    }
    function buildLoadingBadge() {
      const el = document.createElement("span");
      el.setAttribute(CX_OWNED_ATTR, "auction-loading");
      el.className = `${BADGE_CLASS} cx-loading`;
      el.append(text("span", "cx-ld", ""), document.createTextNode("Cortex"));
      el.title = "Cortex is loading this price from completed sales.";
      return el;
    }
    function buildUnavailableBadge(searchable, tier) {
      const el = document.createElement("span");
      el.setAttribute(CX_OWNED_ATTR, "auction-no-comps");
      el.className = `${BADGE_CLASS} cx-none`;
      el.textContent = searchable ? "Search older" : tier ? `No ${tier} comps` : "No comps";
      el.title = searchable ? "No usable cohort in the first six pages. Open Cortex to search older completed sales." : tier ? `Only a ${tier} weapon rolls this perk this high, and no ${tier} sale of this weapon and perk has been recorded. Cortex will not price it from a lower tier.` : "No comparable completed sales were found. Cortex will not invent a value.";
      return el;
    }
    function sourcedTierFor(bonuses) {
      if (bonuses.length !== 1) return null;
      const roll = bonuses[0].percent;
      if (roll == null || !Number.isFinite(roll)) return null;
      const ids = bonusIdsByTitle(bonuses[0].name);
      if (ids.length === 0) return null;
      const tiers = RARITY_TIERS.filter((rarity) => rollIsInSourcedBand(ids, roll, rarity));
      return tiers.length === 1 ? tiers[0] : null;
    }
    function mountRowBadge(row, badge) {
      const bidCount = findNativeBidCountAnchor(row, PRICE_SEL);
      if (bidCount) {
        bidCount.appendChild(badge);
        return true;
      }
      const title = row.querySelector(TITLE_SEL);
      const interactive = title?.closest('button,a,[role="button"]') ?? null;
      if (title && !interactive) title.appendChild(badge);
      else if (interactive?.parentElement && row.contains(interactive)) interactive.insertAdjacentElement("afterend", badge);
      else row.appendChild(badge);
      return true;
    }
    function buildBadge(view) {
      const badge = document.createElement("span");
      badge.setAttribute(CX_OWNED_ATTR, "auction-value");
      badge.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        pendingFocusRow = view.row;
        panelOpen = true;
        panelView = "main";
        renderChrome();
      });
      const tier = roiTier(view);
      const loose = view.matchTier !== "exact" || view.perkBound != null;
      badge.className = `${BADGE_CLASS} cx-clickable cx-${tier}${loose ? " cx-est" : ""}`;
      const worth = aavText(view);
      const vs = bidVsAav(view);
      const vsText = vs ? vs.within ? " \xB7 in range" : vs.pct === 0 ? " \xB7 at value" : ` \xB7 ${vs.pct}% ${vs.below ? "under" : "over"}` : "";
      badge.textContent = `${worth}${vsText}`;
      if (view.matchTier === "rare") {
        badge.title = `Few sales at this rarity/roll. More common versions around ${money(view.fair)}.`;
        return badge;
      }
      if (view.perkBound === "floor") {
        badge.title = `Nothing has sold at this roll yet, so ${money(view.fair)} is estimated from the highest roll that has.`;
        return badge;
      }
      if (view.perkBound === "ceiling") {
        badge.title = `This roll is below every recent sale, so it's worth about ${money(view.fair)} at most.`;
        return badge;
      }
      const how = view.matchTier === "exact" ? `${view.comps} ${view.comps === 1 ? "sale" : "sales"} of this exact ${gearNoun(view.kind)}, rarity and roll` : view.matchTier === "close" ? view.perkTol != null ? `${view.comps} ${view.comps === 1 ? "sale" : "sales"} near this roll` : `${view.comps} similar ${view.comps === 1 ? "sale" : "sales"}` : `${view.comps} ${view.matchedRarity ?? "comparable"} ${view.comps === 1 ? "sale" : "sales"}`;
      const vsNote = vs ? vs.within ? " Bid is within the estimated range." : ` Bid ${vs.pct}% ${vs.below ? "below" : "above"}.` : "";
      badge.title = `${AAV_WORD} ${money(view.fair)} \xB7 ${how}.${vsNote}`;
      return badge;
    }
    let valued = 0;
    let unavailable = 0;
    let candidates = 0;
    let lakeResolved = 0;
    let activeKind = null;
    const kindCounts = { weapon: 0, armor: 0 };
    const rowViews = /* @__PURE__ */ new Map();
    const knownRows = /* @__PURE__ */ new WeakSet();
    const expandedCards = /* @__PURE__ */ new Set();
    const autoOpenApplied = /* @__PURE__ */ new Set();
    const autoOpened = /* @__PURE__ */ new Set();
    const drawerToggles = /* @__PURE__ */ new Map();
    const segSyncs = [];
    let tabHintEl = null;
    let resetPosEl = null;
    let panelHintEl = null;
    let initialPassDone = false;
    const sessionDeals = /* @__PURE__ */ new Map();
    const SESSION_DEAL_TTL_MS = 30 * 60 * 1e3;
    let scanStartedAt = null;
    let progressTimer = null;
    function checkedCount() {
      return valued + unavailable;
    }
    function progressPct() {
      return candidates > 0 ? Math.min(100, Math.round(checkedCount() / candidates * 100)) : 0;
    }
    function progressMeta() {
      const secs = scanStartedAt ? Math.max(0, (Date.now() - scanStartedAt) / 1e3) : 0;
      const elapsed = `${secs.toFixed(1)}s`;
      if (lakeResolved > 0 && lakeResolved === valued) return `${valued} priced from cache \xB7 ${elapsed}`;
      if (lakeResolved > 0) return `${lakeResolved} from cache \xB7 ${valued - lakeResolved} from API \xB7 ${elapsed}`;
      return catalogReady && candidates > 0 ? `${checkedCount()} of ${candidates} checked \xB7 ${valued} priced \xB7 ${elapsed}` : elapsed;
    }
    function renderProgress() {
      const wrap = document.createElement("div");
      wrap.className = "cx-progress";
      const done = catalogReady && candidates > 0 && checkedCount() >= candidates;
      const determinate = catalogReady && candidates > 0;
      const head = document.createElement("div");
      head.className = "cx-progress-head";
      head.append(
        text("span", "cx-progress-label", done ? `${valued} priced` : determinate ? "Pricing auctions" : "Loading recent sales"),
        text("span", "cx-progress-meta", progressMeta())
      );
      const track = document.createElement("div");
      track.className = `cx-progress-track${done ? " done" : determinate ? "" : " indet"}`;
      const fill = document.createElement("div");
      fill.className = "cx-progress-fill";
      if (determinate) fill.style.width = `${progressPct()}%`;
      track.appendChild(fill);
      wrap.append(head, track);
      return wrap;
    }
    function progressTick() {
      if (scanState() !== "checking" || !panelOpen) {
        stopProgressTimer();
        return;
      }
      const bar = shadow.querySelector(".cx-progress");
      if (!bar) return;
      const meta = bar.querySelector(".cx-progress-meta");
      if (meta) meta.textContent = progressMeta();
      const fill = bar.querySelector(".cx-progress-fill");
      if (fill && catalogReady && candidates > 0) fill.style.width = `${progressPct()}%`;
    }
    function stopProgressTimer() {
      if (progressTimer) {
        clearInterval(progressTimer);
        progressTimer = null;
      }
    }
    function syncScanClock() {
      const checking = scanState() === "checking";
      if (checking && scanStartedAt == null) scanStartedAt = Date.now();
      else if (!checking) scanStartedAt = null;
    }
    function ensureProgressTimer() {
      if (panelOpen && scanState() === "checking") {
        if (!progressTimer) progressTimer = setInterval(progressTick, 200);
      } else {
        stopProgressTimer();
      }
    }
    function annotateRow(row, visibleItemIds) {
      if (!rowIsVisible(row)) return;
      const titleEl = row.querySelector(TITLE_SEL);
      if (!titleEl) return;
      const bonuses = parseBonuses(row);
      if (bonuses.length === 0) return;
      const identity = rowIdentity(row, titleEl);
      if (!identity) {
        const diagSig = `unmatched:${clean(titleEl.textContent).slice(0, 40)}`;
        if (row.getAttribute(BADGE_ATTR) !== diagSig) {
          row.setAttribute(BADGE_ATTR, diagSig);
          row.querySelectorAll(`.${BADGE_CLASS}`).forEach((node) => node.remove());
          const badge = document.createElement("span");
          badge.setAttribute(CX_OWNED_ATTR, "auction-unmatched");
          badge.className = `${BADGE_CLASS} cx-none`;
          badge.textContent = "?";
          badge.title = `Cortex can't identify "${clean(titleEl.textContent).slice(0, 30)}" from the weapon/armor catalog. This item won't be valued.`;
          mountRowBadge(row, badge);
        }
        return;
      }
      const weapon = identity.weapon;
      kindCounts[weapon.kind]++;
      visibleItemIds.add(weapon.id);
      const cached = valueCache.get(weapon.id);
      const rarityRead = resolveRowRarity(weapon.id, bonuses, row, cached?.sales ?? [], identity.statedTier);
      const rarity = rarityRead.rarity;
      const requirements = requirementsByItem.get(weapon.id) ?? [];
      requirements.push({ bonuses, rarity });
      requirementsByItem.set(weapon.id, requirements);
      candidates++;
      enqueue(weapon.id);
      const quality = identity.quality;
      const price = parsePrice(row);
      const valuationInput = cached ?? (rarityRead.candidates.some(
        (r) => serverCohortFor(weapon.id, bonuses, r) || bridgedValueFor(weapon.id, bonuses, r) || composedForRow(weapon.id, bonuses, r)
      ) ? EMPTY_VALUE_CACHE : null);
      const view = !valuationInput ? null : rarityRead.basis === "ambiguous" ? resolveSpanView(row, weapon, valuationInput, bonuses, rarityRead, quality, price) : resolveRowView(row, weapon, valuationInput, bonuses, rarity, quality, price, rarityRead);
      if (!view) {
        const failed = failedItems.has(weapon.id);
        const awaitingOwnPair = bonuses.some((b) => lakeInFlight.has(pairKey(weapon.id, bonusIdsByTitle(b.name)[0] ?? null)));
        const withinGrace = Date.now() - lastInteractionAt < INTERACTION_GRACE_MS;
        const pending = !failed && (awaitingOwnPair || !cached && lakePending || !cached && withinGrace);
        const searchable = false;
        const sourcedTier = sourcedTierFor(bonuses);
        const state = failed ? "failed" : pending ? "loading" : "unavailable";
        const sig2 = `${weapon.id}:${state}:${sourcedTier ?? "-"}:${bonuses.map((b) => `${normalizePerk(b.name)}:${b.percent ?? "?"}`).join("+")}`;
        if (row.getAttribute(BADGE_ATTR) !== sig2 || !row.querySelector(`.${BADGE_CLASS}`)) {
          row.setAttribute(BADGE_ATTR, sig2);
          row.querySelectorAll(`.${BADGE_CLASS}`).forEach((node) => node.remove());
          if (failed) {
            const badge = buildUnavailableBadge(true);
            badge.textContent = "API error";
            badge.title = "The official Torn API request failed. Open Cortex to retry.";
            mountRowBadge(row, badge);
          } else mountRowBadge(row, pending ? buildLoadingBadge() : buildUnavailableBadge(searchable, sourcedTier));
        }
        if (!pending && !failed) unavailable++;
        return;
      }
      rowViews.set(row, view);
      knownRows.add(row);
      if (lakeItemIds.has(weapon.id)) lakeResolved++;
      const dealVs = bidVsAav(view);
      if (view.projection && view.projection.roi > 0 && dealVs && dealVs.below && !dealVs.within && dealVs.pct > 0) {
        sessionDeals.set(view.dealKey, { key: view.dealKey, weapon: view.weaponName, perk: bonusLabel(view.bonuses), kind: view.kind, below: dealVs.pct / 100, worth: view.fair, seenAt: Date.now() });
      }
      const sig = `${weapon.id}:${view.sigKey}:${quality ?? ""}:${price ?? ""}:${Math.round(view.fair)}`;
      if (row.getAttribute(BADGE_ATTR) !== sig || !row.querySelector(`.${BADGE_CLASS}`)) {
        row.setAttribute(BADGE_ATTR, sig);
        row.querySelectorAll(`.${BADGE_CLASS}`).forEach((node) => node.remove());
        mountRowBadge(row, buildBadge(view));
      }
      valued++;
    }
    function annotateAll() {
      if (stopped || !catalogReady || !pageIsActive()) return;
      if (!enforceSingleRoot()) return;
      valued = 0;
      unavailable = 0;
      candidates = 0;
      lakeResolved = 0;
      rowViews.clear();
      requirementsByItem.clear();
      kindCounts.weapon = 0;
      kindCounts.armor = 0;
      const visibleItemIds = /* @__PURE__ */ new Set();
      const rows = document.querySelectorAll(AUCTION_ROW_SEL);
      rows.forEach((row) => {
        try {
          annotateRow(row, visibleItemIds);
        } catch {
        }
      });
      activeKind = kindCounts.weapon === 0 && kindCounts.armor === 0 ? null : kindCounts.armor > kindCounts.weapon ? "armor" : "weapon";
      for (const itemId of failedItems) {
        if (!visibleItemIds.has(itemId)) failedItems.delete(itemId);
      }
      queue.removeNotIn(visibleItemIds);
      scheduleDeepWork(visibleItemIds);
      if (!initialPassDone && firstPassComplete()) initialPassDone = true;
      renderChromeIfDataChanged();
    }
    let theme = readTheme();
    const host = document.createElement("div");
    host.id = ROOT_ID;
    host.dataset.cxVersion = UI_VERSION;
    host.classList.toggle("cx-light", theme === "light");
    host.classList.toggle("cx-desktop", isDesktopView());
    const shadow = host.attachShadow({ mode: "open" });
    const cstyle = document.createElement("style");
    cstyle.textContent = `
		:host{
			all:initial;color-scheme:dark;color:var(--cx-text);
			--cx-bg:#0e0e13;--cx-head:#131218;--cx-surface:#151419;--cx-surface-2:#101015;
			--cx-tile:#121118;--cx-hero-2:#181620;--cx-input:#0b0b0f;
			--cx-border:#24242c;--cx-border-2:#30303a;--cx-border-soft:rgba(120,112,150,.20);
			--cx-text:#ececf1;--cx-text-2:#c6c6d0;--cx-text-3:#9797a0;--cx-text-muted:#7b7b87;
			--cx-accent:#b296ff;--cx-accent-2:#c6b2ff;--cx-accent-bg:#1b1730;--cx-accent-bg-2:#231d3d;--cx-accent-border:#3a3060;--cx-on-accent:#17141f;
			--cx-good:#56d57b;--cx-bad:#fa6863;--cx-warn:#f0bb3b;
			--cx-chip-good:#7fe0a0;--cx-chip-info:#c0acff;--cx-chip-warn:#f0c96a;--cx-chip-muted:#a2a2ac;
			--cx-rarity-yellow:#eccc48;--cx-rarity-orange:#fd923e;--cx-rarity-red:#ff6561;
			--cx-shadow:0 20px 52px rgba(0,0,0,.55);--cx-tab-shadow:-6px 0 22px rgba(0,0,0,.45);
			--cx-scroll:#33333f;
			/* The site's own faces, loaded from torncortex.com (see FONT_STYLE_ID). Previously
			   both of these were 'Inter' \u2014 including --cx-mono, which is not a monospace at all,
			   so every figure in this panel was set in a different face AND different metrics from
			   the same figure on the site. The fallbacks matter: if the fetch fails the panel must
			   still look deliberate, so sans falls back to the system UI stack and mono to a real
			   monospace rather than to sans. */
			--cx-font:'Archivo',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;
			--cx-mono:'Chivo Mono',ui-monospace,'SF Mono',SFMono-Regular,Menlo,Consolas,monospace;
			font-variant-numeric:tabular-nums;
			-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility;
		}
		:host(.cx-light){
			color-scheme:light;
			/* Anchored to the site's light theme as the BROWSER paints it, not as it is authored:
			   app.css declares these in oklch(), and scripts/token-export.mjs reads the
			   gamut-mapped sRGB back out. The dark palette above was already in step; light had
			   drifted a long way \u2014 its background was #f4f4f7 (cool) against the site's #f7f7f4
			   (warm), and its accent #6d3fce against the site's #734dbe. Values marked "derived"
			   are panel-only shades with no site counterpart, stepped from the nearest token. */
			--cx-bg:#f7f7f4;--cx-head:#ececf1;--cx-surface:#fdfcfa;--cx-surface-2:#f7f7f4;
			--cx-tile:#fdfcfa;--cx-hero-2:#ebe4ff;--cx-input:#ffffff;
			--cx-border:#b6b7be;--cx-border-2:#9b9da6;--cx-border-soft:rgba(120,112,150,.22);
			--cx-text:#14141b;--cx-text-2:#41414a;--cx-text-3:#696972;--cx-text-muted:#7d7d86;
			--cx-accent:#734dbe;--cx-accent-2:#573a93;--cx-accent-bg:#ebe4ff;--cx-accent-bg-2:#ded3ff;--cx-accent-border:#c9b8f5;--cx-on-accent:#ffffff;
			--cx-good:#007e34;--cx-bad:#cc272e;--cx-warn:#905d00;
			--cx-chip-good:#007e34;--cx-chip-info:#734dbe;--cx-chip-warn:#905d00;--cx-chip-muted:#696972;
			--cx-rarity-yellow:#a1790c;--cx-rarity-orange:#b75400;--cx-rarity-red:#c2272d;
			--cx-shadow:0 16px 44px rgba(30,25,50,.16);--cx-tab-shadow:-6px 0 20px rgba(30,25,50,.14);
			--cx-scroll:#c9cad1;
		}
		/* Desktop Torn renders this panel far wider than a phone, so its text reads tiny.
		   Scale the whole panel + tab up (PDA/mobile keeps its native size). */
		/* zoom multiplies the rendered box but vh inside it still resolves against the full
		   viewport, so the base 84vh/780px budget became 100.8vh/936px here \u2014 taller than the
		   screen. The panel then overflowed the top edge and took its header, which is also the
		   drag handle, off screen with it. Pre-divide the budget by the zoom factor. */
		:host(.cx-desktop) .panel{zoom:1.2;max-height:min(70vh,650px);}
		/* Badge size lives in the PAGE stylesheet (see injectStyle), because the badge is
		   mounted in the auction row, outside this shadow root. */
		:host(.cx-desktop) .tab{zoom:1.15;}
		/* Undocked = draggable. The docked right/bottom anchors are only released once a
		   real position exists (applyFloatPos writes left/top inline). Releasing them
		   unconditionally left a position:fixed element with all four offsets auto, which
		   drops it at the document's static origin \u2014 off-screen the moment the page is
		   scrolled, so the panel silently never appeared. */
		:host(.cx-undocked) .panel-head{cursor:grab;touch-action:none;}
		:host(.cx-undocked) .tab{cursor:grab;touch-action:none;}
		*{box-sizing:border-box;}
		button,input{font:inherit;}
		button{appearance:none;border:0;margin:0;}
		.status-dot{width:8px;height:8px;border-radius:50%;flex:none;background:var(--cx-warn);box-shadow:0 0 6px color-mix(in srgb,var(--cx-warn) 55%,transparent);}
		.status-dot.checking{animation:cx-status-pulse 1.9s cubic-bezier(.4,0,.6,1) infinite;}
		.status-dot.ready{background:var(--cx-good);box-shadow:0 0 6px color-mix(in srgb,var(--cx-good) 60%,transparent);}
		@keyframes cx-status-pulse{0%,100%{opacity:.4;transform:scale(.82)}50%{opacity:1;transform:scale(1)}}
		@keyframes cx-panel-in{from{opacity:0;transform:translateY(12px) scale(.97)}to{opacity:1;transform:translateY(0) scale(1)}}
		/* Expanded loading bar: real fill + count + elapsed while prices come in. */
		.cx-progress{margin-bottom:11px;padding:11px 12px;border:1px solid var(--cx-border);border-radius:6px;background:var(--cx-surface);}
		.cx-progress-head{display:flex;align-items:baseline;justify-content:space-between;gap:10px;margin-bottom:8px;}
		.cx-progress-label{color:var(--cx-text-2);font-size:11px;font-weight:600;}
		.cx-progress-meta{color:var(--cx-text-3);font:500 10px/1 var(--cx-mono);white-space:nowrap;}
		.cx-progress-track{position:relative;height:5px;border-radius:2px;background:var(--cx-tile);overflow:hidden;}
		.cx-progress-fill{height:100%;width:0;border-radius:2px;background:var(--cx-accent);transition:width .3s ease;}
		.cx-progress-track.done .cx-progress-fill{width:100%;background:var(--cx-good);}
		.cx-progress-track.indet .cx-progress-fill{width:38%;animation:cx-indet 1.25s ease-in-out infinite;}
		@keyframes cx-indet{0%{transform:translateX(-110%)}100%{transform:translateX(320%)}}
		/* Closed state: one slim right-edge control on the Auction House. */
		.tab{position:fixed;right:0;top:50%;transform:translateY(-50%);z-index:2147482000;
			display:flex;flex-direction:column;align-items:center;gap:7px;cursor:pointer;
			background:var(--cx-head);color:var(--cx-text-2);border:1px solid var(--cx-border-2);border-right:none;
			border-radius:6px 0 0 6px;padding:11px 5px;box-shadow:var(--cx-tab-shadow);
			font:600 12px/1 var(--cx-font);transition:background .14s,color .14s;}
		.tab:hover,.tab:focus-visible{color:var(--cx-text);border-color:var(--cx-accent-border);outline:none;background:var(--cx-accent-bg);}
		.tab .cx-arrow{color:var(--cx-accent-2);font-size:15px;line-height:1;}
		.tab .cx-name{writing-mode:vertical-rl;text-orientation:upright;letter-spacing:.16em;}
		.tab .cx-count{writing-mode:vertical-rl;color:var(--cx-text-3);font-weight:500;font-size:9px;}
		.tab .status-dot{margin-bottom:1px;}
		.panel{position:fixed;right:8px;bottom:8px;z-index:2147481999;width:min(432px,calc(100vw - 16px));max-height:min(84vh,780px);
			display:flex;flex-direction:column;background:var(--cx-bg);color:var(--cx-text);border:1px solid var(--cx-border-2);border-radius:8px;
			box-shadow:var(--cx-shadow);font:400 13px/1.5 var(--cx-font);overflow:hidden;
			/* Colours transition so switching theme reads as the panel changing rather than being
			   replaced. Named properties only, never the all keyword: position and size must not
			   animate, and a backtick in here would terminate this template literal. */
			transition:background-color .18s ease,color .18s ease,border-color .18s ease;}
		/* The entrance belongs to OPENING the panel, not to existing. While it sat on .panel
		   itself, every rebuild replayed it \u2014 and since each settings tap rebuilt the panel, every
		   tap fired a 220ms fade-and-slide of the whole window. Measured from opacity 0 and
		   translateY(12px) on a Badge-size tap. */
		.panel.cx-enter{animation:cx-panel-in .22s cubic-bezier(.16,1,.3,1) both;}
		/* A conditional row is shown or hidden rather than created and destroyed, so the attribute
		   needs to actually win against the display each of those rows sets for itself. */
		[hidden]{display:none!important;}
		.panel-head{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:13px 14px 12px;border-bottom:1px solid var(--cx-border);background:var(--cx-head);}
		/* Mark + wordmark as one unit. min-width:0 on the text column so a long title still
		   truncates rather than shoving the head actions off the edge. */
		.panel-brand{display:flex;align-items:center;gap:9px;min-width:0;}
		.panel-titles{min-width:0;}
		/* The mark sits INSIDE the panel header, which is the drag handle, and inside the tab
		   button. Taking a decorative glyph out of hit-testing means the pointerdown target is
		   always the handle itself, whatever part of the header the gesture starts on \u2014 so the drag
		   and tap logic never has to reason about which descendant was grabbed.
		   (Scrolling is already covered without this: touch-action is not inherited, but the
		   effective touch behaviour intersects the hit element WITH ITS ANCESTORS, so the header's
		   touch-action:none applies to anything inside it. This is about the event target.) */
		.brand-mark{display:flex;flex:none;color:var(--cx-text-2);pointer-events:none;}
		.tab .brand-mark{color:var(--cx-text-3);}
		/* The heading must be allowed to shrink or the longer product name pushes the
		   status text and the two icon buttons off the panel edge. */
		.panel-head > div:first-child{min-width:0;}
		.head-actions{flex:0 0 auto;}
		.panel-title{font-size:13.5px;font-weight:700;color:var(--cx-text);letter-spacing:-.01em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
		.panel-sub{margin-top:2px;color:var(--cx-text-3);font-size:10px;font-weight:500;}
		.head-actions{display:flex;align-items:center;gap:7px;}
		.status{display:flex;align-items:center;gap:6px;color:var(--cx-text-3);font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;white-space:nowrap;}
		.icon-btn{display:inline-flex;align-items:center;justify-content:center;width:30px;height:30px;border-radius:6px;background:var(--cx-surface);color:var(--cx-text-3);cursor:pointer;font-size:17px;line-height:1;border:1px solid var(--cx-border);transition:background .12s,color .12s,border-color .12s;}
		.icon-btn svg{display:block;}
		.icon-btn:hover,.icon-btn:focus-visible{color:var(--cx-text);background:var(--cx-accent-bg);border-color:var(--cx-accent-border);outline:none;}
		.icon-btn.active{color:var(--cx-accent);background:var(--cx-accent-bg);border-color:var(--cx-accent-border);}
		.panel-body{overflow:auto;padding:12px;scrollbar-width:thin;scrollbar-color:var(--cx-scroll) transparent;}
		.kpis{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:11px;}
		.kpi{padding:9px 10px;border:1px solid var(--cx-border);border-radius:6px;background:var(--cx-surface);min-width:0;}
		.kpi b{display:block;color:var(--cx-text);font:700 16px/1.1 var(--cx-mono);}
		.kpi span{display:block;margin-top:4px;color:var(--cx-text-3);font-size:8px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
		.deals{margin-bottom:11px;padding:11px 12px;border:1px solid var(--cx-border);border-radius:6px;background:var(--cx-surface);}
		.deals-header{display:flex;align-items:center;gap:6px;width:100%;padding:0;margin:0;background:none;color:var(--cx-text-3);font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;cursor:pointer;border:none;}
		.deals-header:hover{color:var(--cx-text-2);}
		.deals-arrow{display:inline-block;transition:transform .15s ease;font-size:11px;line-height:1;color:var(--cx-accent);}
		.deals-arrow.open{transform:rotate(90deg);}
		.deals-content{margin-top:7px;}
		.deal{display:grid;grid-template-columns:1fr auto;align-items:center;gap:10px;padding:6px 0;border-top:1px solid var(--cx-border-soft);}
		.deal:first-of-type{border-top:none;padding-top:1px;}
		.deal-main{min-width:0;}
		.deal-w{display:block;color:var(--cx-text-2);font-size:11.5px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
		.deal-perk{display:block;margin-top:1px;color:var(--cx-text-3);font-size:9px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
		.deal-right{text-align:right;white-space:nowrap;}
		.deal-roi{color:var(--cx-good);font:700 13px/1.1 var(--cx-mono);}
		.deal-v{display:block;margin-top:1px;color:var(--cx-text-muted);font:500 9px/1 var(--cx-mono);}
		.notice{padding:12px;margin-bottom:10px;border:1px solid var(--cx-border);border-radius:6px;background:var(--cx-surface);color:var(--cx-text-2);}
		.notice .primary{display:block;margin-top:9px;}
		.notice strong{display:block;color:var(--cx-text);margin-bottom:3px;}
		.cards{display:grid;gap:10px;}
		.card{position:relative;border:1px solid var(--cx-border);border-radius:6px;background:var(--cx-surface);padding:12px 13px 13px;overflow:hidden;}
		.card.indicative{background:var(--cx-surface-2);}
		/* Rarity as a small colored tag inline with the weapon name \u2014 clean and modern,
		   no full-card border glow that clutters the layout. */
		.c-rarity-tag{display:inline-block;width:6px;height:14px;border-radius:2px;margin-right:6px;vertical-align:middle;position:relative;top:-1px;}
		.c-rarity-tag[data-rarity="yellow" i]{background:var(--cx-rarity-yellow);}
		.c-rarity-tag[data-rarity="orange" i]{background:var(--cx-rarity-orange);}
		.c-rarity-tag[data-rarity="red" i]{background:var(--cx-rarity-red);}
		.c-head{display:flex;align-items:flex-start;justify-content:space-between;gap:8px;}
		.c-id{min-width:0;}
		.c-weapon{font-size:13px;font-weight:700;color:var(--cx-text);line-height:1.2;}
		.c-perk{margin-top:2px;color:var(--cx-accent);font-size:11px;font-weight:600;}
		.c-stats{display:flex;flex-wrap:wrap;gap:1px 10px;margin-top:3px;color:var(--cx-text-muted);font:600 9px/1.4 var(--cx-mono);letter-spacing:.02em;}
		/* Held to just under half the head so the name and its stat line keep enough room to
		   sit on one line each; at 58% the stats wrapped after a separator. */
		.c-chips{display:flex;flex-wrap:wrap;gap:4px;justify-content:flex-end;align-items:center;max-width:48%;}
		.chip{padding:2px 7px;border-radius:4px;border:1px solid var(--cx-border);background:transparent;color:var(--cx-text-3);font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;white-space:nowrap;}
		.chip.verified{color:var(--cx-chip-good);border-color:color-mix(in srgb,var(--cx-good) 40%,transparent);}
		.chip.indicative{color:var(--cx-chip-warn);border-color:color-mix(in srgb,var(--cx-warn) 40%,transparent);}
		.chip.close{color:var(--cx-chip-info);border-color:color-mix(in srgb,var(--cx-accent) 40%,transparent);}
		.chip.none{color:var(--cx-chip-muted);border-color:var(--cx-border);}
		.c-tiles{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin-top:9px;}
		.tile{position:relative;padding:9px 11px;border-radius:6px;background:var(--cx-tile);border:1px solid var(--cx-border);min-width:0;}
		.tile.hero{grid-column:1 / -1;padding:11px 13px;background:var(--cx-surface-2);border-color:var(--cx-border-2);}
		.t-label{display:block;color:var(--cx-text-muted);font-size:8px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
		.tile.hero .t-label{font-size:9px;color:var(--cx-text-3);letter-spacing:.09em;}
		.t-val{display:block;margin-top:3px;color:var(--cx-text);font:700 17px/1.05 var(--cx-mono);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
		.tile.hero .t-val{margin-top:5px;font-size:27px;font-weight:800;letter-spacing:-.02em;}
		.t-val.positive{color:var(--cx-good);}.t-val.negative{color:var(--cx-bad);}.t-val.neutral{color:var(--cx-warn);}
		.t-sub{display:block;margin-top:3px;color:var(--cx-text-muted);font-size:9px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
		.tile.hero .t-sub{font-size:10px;}
		.c-trend{margin:10px 0 0;color:var(--cx-text-3);font-size:10px;font-weight:600;}
		.c-trend.up,.c-trend.down{color:var(--cx-text-2);}
		/* One insight grammar. Every row in the Insights drawer is a label column plus a
		   value, on one type scale, one rhythm and one neutral surface \u2014 so five facts read
		   as one panel instead of five competing boxes. Colour is reserved for the two rows
		   where it means something (market direction, caution). */
		.c-ins{display:grid;grid-template-columns:4.5rem 1fr;gap:7px 10px;align-items:baseline;}
		.c-ins-row{display:grid;grid-template-columns:subgrid;grid-column:1/-1;align-items:baseline;}
		.c-ins-k{color:var(--cx-text-muted);font:700 8px/1.6 var(--cx-font);text-transform:uppercase;letter-spacing:.07em;}
		.c-ins-v{margin:0;color:var(--cx-text-2);font-size:10.5px;font-weight:500;line-height:1.45;}
		.c-ins-v b{color:var(--cx-text);font-family:var(--cx-mono);font-weight:700;}
		.c-ins-row.warn .c-ins-k{color:var(--cx-warn);}
		/* Fallback for engines without subgrid: the row becomes its own two-column grid on
		   the same track sizes, so the columns still line up. */
		@supports not (grid-template-columns: subgrid){
			.c-ins{display:flex;flex-direction:column;gap:7px;}
			.c-ins-row{display:grid;grid-template-columns:4.5rem 1fr;gap:10px;}
		}
		.c-details-toggle{display:flex;align-items:center;gap:5px;width:100%;margin:10px 0 0;padding:7px 0;background:none;border:none;border-top:1px solid var(--cx-border-soft);color:var(--cx-text-3);font:600 10px/1 var(--cx-font);text-transform:uppercase;letter-spacing:.05em;cursor:pointer;transition:color .12s;}
		.c-details-toggle:hover,.c-details-toggle:focus-visible{color:var(--cx-text-2);outline:none;}
		.c-details-toggle::before{content:'\\203a';display:inline-block;font-size:13px;line-height:1;color:var(--cx-accent);transition:transform .15s ease;}
		.c-details-toggle.open::before{transform:rotate(90deg);}
		.c-details{margin-top:2px;}
		.c-note{margin:10px 0 0;padding:9px 11px;border-radius:6px;background:var(--cx-surface-2);border:1px solid var(--cx-border);color:var(--cx-text-2);font-size:10.5px;line-height:1.5;font-weight:400;}
		.c-empty-sales{margin:10px 0 0;color:var(--cx-text-muted);font-size:10px;font-style:italic;text-align:center;line-height:1.4;}
		.sales{margin-top:9px;padding-top:8px;border-top:1px solid var(--cx-border);}
		.sales-title{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:6px;color:var(--cx-text-2);font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;}
		.sales-title span{color:var(--cx-text-muted);font-size:9px;font-weight:500;text-transform:none;letter-spacing:0;}
		/* Fixed px, not rem: this grid sits in a Shadow DOM on Torn's own page, whose
		   root font-size Cortex does not control. rem widths here would silently
		   rescale with whatever the host page sets, re-creating the exact column
		   overlap this fix removes; px stays correct regardless of the host page. */
		.sale > *{min-width:0;overflow:hidden;text-overflow:ellipsis;}
		.sale:first-of-type{border-top:none;}
		.sale b{color:var(--cx-text);font:700 11px/1 var(--cx-mono);text-align:right;}
		.sale em{color:var(--cx-text-3);font-style:normal;font:500 9px/1 var(--cx-mono);text-align:right;}
		.sale .s-perk{color:var(--cx-text-2);}
		/* A sale the value was not priced from: still real history, so it is dimmed rather than
		   hidden, and marked on the date so the reason reads as "too old" rather than "unimportant".
		   Removing these rows would be the wrong fix \u2014 the trader is entitled to see them. */
		.sale.cx-unpriced{opacity:.5;}
		.sale.cx-unpriced .s-date::after{content:'\\00a0*';color:var(--cx-text-muted);}
		.sales-foot{margin:5px 0 0;color:var(--cx-text-muted);font-size:9px;line-height:1.45;}
		.sale-h{border-top:none;padding:0 0 3px;color:var(--cx-text-muted);font-size:8px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;}
		.sale-h span{text-align:right;}.sale-h span:first-child{text-align:left;}
		.sales-expand{margin-top:2px;}
		.sales-more{display:block;width:100%;padding:6px 0;border:none;background:none;color:var(--cx-accent);font:600 9px/1 var(--cx-mono);text-transform:uppercase;letter-spacing:.04em;cursor:pointer;text-align:center;transition:color .12s;}
		.sales-more:hover{color:var(--cx-text);}
		/* This exact item's own past sales \u2014 first in the drawer, because when it exists
		   it is the strongest evidence there is for this listing. */
		/* Sits in the value column of its own insight row, so it needs no box of its own \u2014
		   just the price and the date it fetched, stacked. */
		.c-history{display:flex;flex-direction:column;gap:2px;}
		.c-history-row{display:flex;align-items:baseline;gap:8px;}
		.c-history-row b{min-width:4.25rem;color:var(--cx-text);font-family:var(--cx-mono);font-weight:700;}
		.c-history-row .s-date{color:var(--cx-text-muted);font-size:10.5px;font-weight:500;}
		/* Value-by-roll ladder: bars are compared with each other, so the current roll
		   is the only one that needs to stand out. */
		/* Direction is the one value here that reads differently to a buyer than a seller, so
		   it keeps its colour \u2014 on the text alone, no filled block. */
		.c-trend-line.trend-up{color:var(--cx-good);font-weight:600;}
		.c-trend-line.trend-down{color:var(--cx-bad);font-weight:600;}
		/* Sortable header */
		.sort-btn{position:relative;background:none;border:none;padding:0 10px 0 0;margin:0;color:var(--cx-text-muted);font:700 8px/1 var(--cx-font);text-transform:uppercase;letter-spacing:.04em;cursor:pointer;text-align:right;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;transition:color .1s;}
		.sort-btn:first-child{text-align:left;}
		.sort-btn:hover,.sort-btn.active{color:var(--cx-accent);}
		/* Sort caret drawn from borders. Nothing here depends on a font having
		   geometric shapes, which PDA's fallback stack does not. */
		.sort-btn.active::after{content:'';position:absolute;right:0;top:50%;transform:translateY(-50%);width:0;height:0;border-left:3px solid transparent;border-right:3px solid transparent;}
		.sort-btn.active.desc::after{border-top:4px solid currentColor;}
		.sort-btn.active.asc::after{border-bottom:4px solid currentColor;}
		/* Profile links */
		.s-profile{color:var(--cx-text-3);font:500 9px/1 var(--cx-mono);text-decoration:none;text-align:right;overflow:hidden;text-overflow:ellipsis;}
		.s-profile:hover{color:var(--cx-accent);text-decoration:underline;}
		a.s-profile{cursor:pointer;}
		.s-date{color:var(--cx-text-3);font-size:9px;}
		/* Updated sale grid for new columns (Date/Price/Perk/Qual/Seller/Buyer) */
		.sales.no-perk .sale{grid-template-columns:52px 64px 36px 1fr 1fr;}
		.sale{display:grid;grid-template-columns:52px 64px 36px 36px 1fr 1fr;align-items:center;gap:4px;padding:4px 0;border-top:1px solid var(--cx-border-soft);color:var(--cx-text-3);font-size:10px;min-width:0;}
		.sale.k-armor{grid-template-columns:52px 64px 36px 36px 1fr 1fr;}
		/* Drawer animation \u2014 slightly longer for noticeable smoothness */
		@keyframes cx-drawer-in{from{opacity:0;transform:translateY(-10px)}to{opacity:1;transform:translateY(0)}}
		@keyframes cx-row-in{from{opacity:0;transform:translateX(-4px)}to{opacity:1;transform:translateX(0)}}
		/* Class-gated, so a drawer fades in every time it is OPENED and never merely because it
		   was rebuilt while already open. Unconditionally on .c-details it did the opposite: the
		   content animated whenever it was built, which is during a re-render, and an open drawer
		   re-opening after a deliberate toggle got nothing at all because the content was only
		   ever built once. */
		.c-details.cx-in{animation:cx-drawer-in .22s cubic-bezier(.16,1,.3,1);}
		.c-section-label{color:var(--cx-text-muted);font:700 8px/1 var(--cx-font);text-transform:uppercase;letter-spacing:.06em;margin:12px 0 6px;padding-bottom:4px;border-bottom:1px solid var(--cx-border-soft);}
		.c-section-label:first-child{margin-top:0;}
		/* "Go to listing" lives inside the bid tile (position:relative from .tile), top-right.
		   Quiet muted link that accents on hover; does not crowd the header chip row. */
		.jump{position:absolute;top:9px;right:11px;padding:3px 0;background:none;color:var(--cx-text-muted);border:none;cursor:pointer;font:700 8px/1.2 var(--cx-font);letter-spacing:.07em;text-transform:uppercase;white-space:nowrap;transition:color .12s;}
		.jump:hover,.jump:focus-visible{color:var(--cx-accent);outline:none;}
		.key{padding:12px;border:1px solid var(--cx-border);border-radius:6px;background:var(--cx-surface);color:var(--cx-text-2);}
		.key label{display:block;color:var(--cx-text);font-weight:700;margin-bottom:3px;}.key p{margin:0;color:var(--cx-text-3);font-size:10px;line-height:1.5;}
		.key input{width:100%;margin:9px 0 7px;padding:9px;background:var(--cx-input);border:1px solid var(--cx-border);border-radius:6px;color:var(--cx-text);outline:none;}
		.key input:focus{border-color:var(--cx-accent);}
		.primary{background:var(--cx-accent);color:var(--cx-on-accent);border-radius:6px;padding:8px 13px;font-weight:700;font-size:10px;cursor:pointer;}
		.primary:hover,.primary:focus-visible{filter:brightness(1.08);outline:none;}
		.error{margin-top:6px;color:var(--cx-bad);font-size:10px;}
		.key .get-key{margin:10px 0 4px;display:inline-block;}
		.key-trust{display:flex;flex-wrap:wrap;gap:12px;margin-top:11px;padding-top:10px;border-top:1px solid var(--cx-border-soft);}
		.key-trust a,.key-trust .linkish{color:var(--cx-accent);font-size:10px;font-weight:600;text-decoration:none;background:none;border:0;padding:0;cursor:pointer;}
		.key-trust a:hover,.key-trust .linkish:hover{text-decoration:underline;}
		.key-pop{margin:9px 0 0;color:var(--cx-text-3);font-size:10px;line-height:1.55;}
		/* --- Settings view --- */
		.settings{display:flex;flex-direction:column;gap:11px;}
		.set-card{padding:12px;border:1px solid var(--cx-border);border-radius:6px;background:var(--cx-surface);display:flex;flex-direction:column;gap:9px;}
		/* Underlined, not accent-coloured alone: colour by itself is not a link signal, and the site's
		   own pass measured the accent at 1.19-2.05:1 against surrounding text where 3:1 is asked for.
		   min-height keeps it a 24px tap target on a phone. */
		.site-link{display:inline-flex;align-items:center;min-height:24px;align-self:flex-start;color:var(--cx-accent);font:600 11px/1.4 var(--cx-mono);text-decoration:underline;text-underline-offset:2px;}
		.site-link:hover{color:var(--cx-accent-hover);}
		.set-h{color:var(--cx-text);font-size:11px;font-weight:700;letter-spacing:.02em;text-transform:uppercase;}
		.set-copy{margin:0;color:var(--cx-text-3);font-size:10px;line-height:1.5;}
		.set-row{display:flex;align-items:center;justify-content:space-between;gap:10px;}
		.set-key{padding:12px;border:1px solid var(--cx-border);border-radius:6px;background:var(--cx-surface);display:flex;flex-direction:column;gap:8px;}
		.key-row{display:flex;align-items:center;gap:8px;}
		.key-ok{display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;border-radius:50%;background:color-mix(in srgb,var(--cx-good) 20%,transparent);color:var(--cx-good);font-size:11px;font-weight:700;flex:none;}
		.key-mask{font:600 13px/1 var(--cx-mono);color:var(--cx-text-2);letter-spacing:.1em;background:var(--cx-input);border:1px solid var(--cx-border);border-radius:4px;padding:7px 10px;}
		.key-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:2px;}
		.set-key input{width:100%;padding:9px;background:var(--cx-input);border:1px solid var(--cx-border);border-radius:6px;color:var(--cx-text);outline:none;}
		.set-key input:focus{border-color:var(--cx-accent);}
		.ghost{background:transparent;color:var(--cx-text-2);border:1px solid var(--cx-border);border-radius:6px;padding:7px 13px;font-weight:600;font-size:10px;cursor:pointer;transition:background .12s,color .12s;}
		.ghost:hover,.ghost:focus-visible{background:var(--cx-accent-bg);color:var(--cx-text);border-color:var(--cx-accent-border);outline:none;}
		.ghost.danger{color:var(--cx-bad);border-color:color-mix(in srgb,var(--cx-bad) 40%,var(--cx-border));}
		.ghost.danger:hover,.ghost.danger:focus-visible{background:color-mix(in srgb,var(--cx-bad) 14%,transparent);color:var(--cx-bad);}
		/* segmented control (theme toggle) */
		.seg{display:inline-flex;border:1px solid var(--cx-border);border-radius:6px;background:var(--cx-input);overflow:hidden;}
		.seg button{padding:6px 13px;font-weight:700;font-size:10px;color:var(--cx-text-3);background:transparent;cursor:pointer;}
		.seg button.on{background:var(--cx-accent-bg);color:var(--cx-accent);}
		.legend{display:flex;flex-direction:column;gap:0;padding:12px;border:1px solid var(--cx-border);border-radius:6px;background:var(--cx-surface);}
		.legend .set-h{margin-bottom:8px;}
		.legend-row{display:grid;grid-template-columns:8.5rem 1fr;gap:8px 12px;padding:7px 0;border-top:1px solid var(--cx-border-soft);}
		.legend-row:first-of-type{border-top:none;padding-top:0;}
		.legend-term{color:var(--cx-text-2);font-size:10px;font-weight:700;line-height:1.35;}
		.legend-desc{color:var(--cx-text-3);font-size:10px;line-height:1.45;font-weight:400;}
		.set-foot{margin:0;color:var(--cx-text-muted);font-size:9px;line-height:1.5;}
		@media (max-width:520px){.panel{right:6px;bottom:6px;width:calc(100vw - 12px);max-height:80vh}.panel-body{padding:9px}.panel-head{padding:12px}.status{font-size:8px}.legend-row{grid-template-columns:1fr}.legend-desc{margin-top:1px}}
		/* Everything that moves has to stop here, not just the panel and the pulse.
		   The drawer, its rows and the first-run hint were still animating. */
		@media (prefers-reduced-motion:reduce){
			.status-dot.checking,.cx-progress-track.indet .cx-progress-fill{animation:none}
			/* Named after what actually animates. This listed c-drawer, which never had an
			   animation, while the drawer's real one sat on its c-details child \u2014 so the opt-out
			   missed it entirely. The sale rows need !important because their animation is set
			   inline, and an inline style beats a stylesheet rule without it: the opt-out was
			   being ignored for exactly the rows that animate most. */
			.panel.cx-enter,.c-details.cx-in{animation:none}
			.sale{animation:none!important}
			.panel{transition:none}
			.deals-arrow,.c-details-toggle::before,.tab,.icon-btn,.sales-more,.sort-btn{transition:none}
		}
	`;
    shadow.appendChild(cstyle);
    const chromeMount = document.createElement("div");
    shadow.appendChild(chromeMount);
    let panelOpen = false;
    let panelView = "main";
    let panelEntered = false;
    let pendingFocusRow = null;
    let focusCardEl = null;
    let lastRenderAt = 0;
    let lastRenderedState = null;
    let pendingRenderTimer = null;
    const RENDER_THROTTLE_MS = 900;
    const DRAG_THRESHOLD_PX = 6;
    const ONSCREEN_MARGIN_PX = 32;
    function viewportSize() {
      const w = window.innerWidth || document.documentElement?.clientWidth || 0;
      const h = window.innerHeight || document.documentElement?.clientHeight || 0;
      return { w, h };
    }
    function zoomFactor(el) {
      const own = el.offsetWidth;
      const painted = el.getBoundingClientRect().width;
      if (!(own > 0) || !(painted > 0)) return 1;
      const factor = painted / own;
      return Number.isFinite(factor) && factor > 0.1 && factor < 10 ? factor : 1;
    }
    function clampToViewport(x, y, elW, elH, zoom = 1) {
      const { w, h } = viewportSize();
      if (!(w > 0) || !(h > 0)) return { x, y };
      const z = zoom > 0 ? zoom : 1;
      const vw = w / z;
      const vh = h / z;
      const margin = ONSCREEN_MARGIN_PX / z;
      const maxX = Math.max(0, vw - Math.max(elW, margin));
      const maxY = Math.max(0, vh - Math.max(elH, margin));
      const safeX = Number.isFinite(x) ? x : 0;
      const safeY = Number.isFinite(y) ? y : 0;
      return { x: Math.min(Math.max(0, safeX), maxX), y: Math.min(Math.max(0, safeY), maxY) };
    }
    function applyFloatPos(el, pos) {
      const { x, y } = clampToViewport(pos.x, pos.y, el.offsetWidth, el.offsetHeight, zoomFactor(el));
      el.style.left = x + "px";
      el.style.top = y + "px";
      el.style.right = "auto";
      el.style.bottom = "auto";
      el.style.transform = "none";
    }
    function readFloatPos(el) {
      const rect = el.getBoundingClientRect();
      const z = zoomFactor(el);
      return { x: Math.round(rect.left / z), y: Math.round(rect.top / z) };
    }
    function clearFloatPos(el) {
      el.style.left = "";
      el.style.top = "";
      el.style.right = "";
      el.style.bottom = "";
      el.style.transform = "";
    }
    function makeDraggable(el, handle, onEnd, enabled = () => true) {
      handle.addEventListener("pointerdown", (e) => {
        if (!enabled()) return;
        if (e.target?.closest("button, a, input, select") && e.currentTarget !== e.target) return;
        if (e.button != null && e.button !== 0) return;
        const startX = e.clientX;
        const startY = e.clientY;
        const origin = readFloatPos(el);
        const zoom = zoomFactor(el);
        let dragging = false;
        const onMove = (ev) => {
          const dx = ev.clientX - startX;
          const dy = ev.clientY - startY;
          if (!dragging) {
            if (Math.abs(dx) < DRAG_THRESHOLD_PX && Math.abs(dy) < DRAG_THRESHOLD_PX) return;
            dragging = true;
            handle.style.cursor = "grabbing";
          }
          if (ev.cancelable) ev.preventDefault();
          applyFloatPos(el, { x: origin.x + dx / zoom, y: origin.y + dy / zoom });
        };
        const finish = () => {
          handle.removeEventListener("pointermove", onMove);
          handle.removeEventListener("pointerup", finish);
          handle.removeEventListener("pointercancel", finish);
          handle.style.cursor = "";
          if (!dragging) return;
          const swallow = (ce) => {
            ce.stopPropagation();
            ce.preventDefault();
          };
          handle.addEventListener("click", swallow, { capture: true, once: true });
          setTimeout(() => handle.removeEventListener("click", swallow, { capture: true }), 0);
          onEnd(readFloatPos(el));
        };
        try {
          handle.setPointerCapture(e.pointerId);
        } catch {
        }
        handle.addEventListener("pointermove", onMove);
        handle.addEventListener("pointerup", finish);
        handle.addEventListener("pointercancel", finish);
      });
    }
    function pricedWindowPhrase(view) {
      if (view.pricedSinceTs == null) return "";
      const days = Math.round((Date.now() / 1e3 - view.pricedSinceTs) / 86400);
      if (!(days > 0)) return "";
      const months = Math.round(days / 30);
      if (months < 12 || months % 12 !== 0) return `${months} months`;
      const years = months / 12;
      return years === 1 ? "a year" : `${years} years`;
    }
    function notCountedSummary(view) {
      const parts = [];
      if (view.olderRollComps > 0) {
        const window2 = pricedWindowPhrase(view) || "the priced window";
        const n = view.olderRollComps;
        parts.push(`${n} ${n === 1 ? "sale" : "sales"} older than ${window2}`);
      }
      if (view.outlierRollComps > 0) {
        parts.push(`${view.outlierRollComps} ${view.outlierRollComps === 1 ? "outlier" : "outliers"}`);
      }
      return parts.length ? parts.join(" \xB7 ") : null;
    }
    function rangeSourceSummary(view) {
      if (!view.rollDerived || view.exactRollComps <= 0) return null;
      return view.rollBlockRolls > 1 ? `${view.rollBlockRolls} nearby rolls` : "Nearby rolls";
    }
    function boundSourceRoll(view) {
      if (view.perkBound == null || view.valueRolls.length !== 1 || view.bonuses.length !== 1) return null;
      const own = view.bonuses[0].percent;
      const source = view.valueRolls[0];
      if (own == null || !Number.isFinite(source) || Math.round(source) === Math.round(own)) return null;
      return source;
    }
    function boundSourceSummary(view) {
      const source = boundSourceRoll(view);
      if (source == null) return null;
      const unit = perkUnitSuffix(view.bonuses[0].name);
      const edge = view.perkBound === "floor" ? "highest" : "lowest";
      const n = view.comps;
      const copies = view.valueRollDistinctItems;
      const copyNote = copies != null && copies > 0 && copies < n ? copies === 1 ? ", all the same item" : `, from ${copies} different items` : "";
      return `${source}${unit}, the ${edge} roll that has sold (${n} ${n === 1 ? "sale" : "sales"}${copyNote})`;
    }
    function qualityBasisSummary(view) {
      const q = view.pricedQuality;
      if (q == null || !Number.isFinite(q)) return null;
      const qt = `q${Number(q.toFixed(1))}`;
      if (view.typicalQuality) {
        if (!view.qualitySensitive) return null;
        return `Priced at ${qt}, typical for this roll, not this item's own`;
      }
      return `Priced at this item's own ${qt}`;
    }
    function replayDrawerIn(drawer) {
      const inner = drawer.firstElementChild;
      if (!inner) return;
      inner.classList.remove("cx-in");
      void inner.offsetWidth;
      inner.classList.add("cx-in");
    }
    function flashHighlight(el) {
      if (typeof el.scrollIntoView === "function") el.scrollIntoView({ behavior: "smooth", block: "center" });
      if (typeof el.animate !== "function") return;
      const r = "rgba(178,150,255,";
      const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      if (reduce) {
        el.animate([{ boxShadow: `0 0 0 3px ${r}.95)` }, { boxShadow: `0 0 0 3px ${r}0)` }], { duration: 1400, easing: "ease-out", fill: "none" });
        return;
      }
      el.animate(
        [
          { boxShadow: `0 0 0 0 ${r}0)`, backgroundColor: `${r}0)`, offset: 0 },
          { boxShadow: `0 0 0 4px ${r}.95), 0 0 20px 4px ${r}.45)`, backgroundColor: `${r}.22)`, offset: 0.2 },
          { boxShadow: `0 0 0 0 ${r}0)`, backgroundColor: `${r}0)`, offset: 1 }
        ],
        { duration: 1400, easing: "ease-out" }
      );
    }
    function enforceSingleRoot() {
      const roots = [...document.querySelectorAll(`#${ROOT_ID}`)];
      const newerOwner = roots.find(
        (node) => node !== host && !!node.dataset.cxVersion && compareVersions(node.dataset.cxVersion, UI_VERSION) >= 0
      );
      if (newerOwner) return false;
      roots.forEach((node) => {
        if (node !== host) node.remove();
      });
      if (!host.isConnected && document.body) document.body.appendChild(host);
      return true;
    }
    function retryChecks() {
      catalogFailed = false;
      failedItems.clear();
      renderChrome();
      if (catalogReady) annotateAll();
      else void boot();
    }
    function text(tag, className, value) {
      const el = document.createElement(tag);
      el.className = className;
      el.textContent = value;
      return el;
    }
    function scanState() {
      if (catalogFailed && !catalogReady) return "problem";
      if (catalogLoading || !catalogReady) return "checking";
      if (failedItems.size > 0) return "problem";
      if (candidates > 0 && checkedCount() < candidates) return "checking";
      if (settleMs === 0 && candidates > 0) settleMs = Date.now() - bootStart;
      if (unavailable > 0) return "partial";
      return "ready";
    }
    function scanStatusLabel(state = scanState()) {
      if (state === "ready") return lakeResolved > 0 ? `${valued} priced` : "Ready";
      if (state === "partial") return `${valued} priced \xB7 ${unavailable} no comps`;
      if (state === "checking") {
        if (lakeResolved > 0 && lakeResolved < candidates) return `${lakeResolved} instant \xB7 ${candidates - lakeResolved} checking`;
        return "Checking page";
      }
      if (state === "problem") return "Try again";
      return "API key needed";
    }
    function statusDot(state = scanState()) {
      const cls = state === "ready" ? "ready" : state === "checking" ? "checking" : "";
      return text("span", `status-dot ${cls}`, "");
    }
    function bonusLabel(bonuses) {
      return bonuses.map((bonus) => `${bonus.name.replace(/\b\w/g, (c) => c.toUpperCase())}${bonus.percent != null ? ` ${bonus.percent}${perkUnitSuffix(bonus.name)}` : ""}`).join(" + ");
    }
    const SALE_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    function saleDate(timestamp) {
      const d = new Date(timestamp * 1e3);
      const month = SALE_MONTHS[d.getMonth()];
      if (!month) return new Date(timestamp * 1e3).toISOString().slice(0, 10);
      return `${month} ${d.getDate()} '${String(d.getFullYear() % 100).padStart(2, "0")}`;
    }
    function aavText(view) {
      if (view.rarityBasis === "ambiguous") return rangeText(view.aavLow, view.aavHigh);
      if (view.matchTier === "rare") return `${moneyC(view.fair)}+`;
      if (view.perkBound === "ceiling") return `up to ${moneyC(view.fair)}`;
      return view.matchTier === "exact" ? moneyC(view.fair) : `~${moneyC(view.fair)}`;
    }
    function aavRangeText(view) {
      if (view.rarityBasis === "ambiguous") return rangeText(view.aavLow, view.aavHigh);
      if (view.matchTier === "rare") return `${moneyC(view.fair)}+`;
      if (view.perkBound === "ceiling") return `up to ${moneyC(view.fair)}`;
      if (view.matchTier === "exact") return moneyC(view.fair);
      return rangeText(view.aavLow, view.aavHigh);
    }
    function rangeText(low, high) {
      const l = moneyC(low), h = moneyC(high);
      if (l === h || !(high > low)) return moneyC(Math.round((low + high) / 2));
      const lu = l.slice(-1), hu = h.slice(-1);
      return lu === hu && /[a-z]/i.test(hu) ? `${l.slice(0, -1)} \u2013 ${h.slice(1)}` : `${l} \u2013 ${h}`;
    }
    function bidVsAav(view) {
      if (!view.price || view.price <= 0 || view.fair <= 0) return null;
      if (view.rarityBasis === "ambiguous") return null;
      if (view.matchTier === "rare") return null;
      if (view.perkBound === "ceiling") {
        if (view.price <= view.fair) return null;
        return { pct: Math.round((view.price - view.fair) / view.fair * 100), below: false, within: false, delta: view.price - view.fair };
      }
      if (view.matchTier !== "exact" && view.aavHigh > view.aavLow) {
        if (view.price >= view.aavLow && view.price <= view.aavHigh) return { pct: 0, below: true, within: true, delta: 0 };
        if (view.price < view.aavLow) return { pct: Math.round((view.aavLow - view.price) / view.aavLow * 100), below: true, within: false, delta: view.aavLow - view.price };
        return { pct: Math.round((view.price - view.aavHigh) / view.aavHigh * 100), below: false, within: false, delta: view.price - view.aavHigh };
      }
      const gap = (view.fair - view.price) / view.fair;
      const below = gap >= 0;
      return { pct: Math.round(Math.abs(gap) * 100), below, within: false, delta: Math.abs(view.fair - view.price) };
    }
    function vsTileContent(view, vs) {
      if (view.price == null) return { val: "\u2014", cls: "", sub: "no bid yet" };
      if (vs) {
        if (vs.within) return { val: "In range", cls: "neutral", sub: "bid within the estimate" };
        if (vs.pct === 0) return { val: "At value", cls: "neutral", sub: "bid matches AAV" };
        const cls = vs.below ? vs.pct >= 10 ? "positive" : "neutral" : "negative";
        return { val: `${vs.pct}% ${vs.below ? "below" : "above"}`, cls, sub: `${moneyC(vs.delta)} ${vs.below ? "under" : "over"}` };
      }
      if (view.matchTier === "rare") return { val: "\u2014", cls: "", sub: "too rare to call" };
      if (view.perkBound === "ceiling") return { val: "\u2014", cls: "", sub: "bid is under the cap" };
      return { val: "\u2014", cls: "", sub: "no bid yet" };
    }
    function matchChip(view) {
      if (view.rarityBasis === "ambiguous") {
        const tiers = view.rarityCandidates.join(" or ");
        return {
          label: "Tier not stated",
          cls: "close",
          title: `This roll is sold as ${tiers}, so the tier cannot be read from the roll alone. The range covers both. Click the listing to see the tier and get one value.`
        };
      }
      if (view.matchTier === "exact")
        return { label: "Direct comps", cls: "verified", title: `${view.comps} past sales of this exact ${gearNoun(view.kind)}, rarity and roll.` };
      if (view.matchTier === "rare")
        return { label: "Not enough history", cls: "none", title: "Few sales at this exact version, so this is a floor from more common ones." };
      const edge = boundSourceRoll(view);
      if (edge != null) {
        const unit = perkUnitSuffix(view.bonuses[0].name);
        return {
          label: "Range estimate",
          cls: "close",
          title: view.perkBound === "ceiling" ? `Nothing has sold at this roll. ${edge}${unit} is the lowest that has, and a worse roll is not worth more, so the value is a cap rather than a reading.` : `Nothing has sold at this roll. Estimated from ${edge}${unit}, the highest roll that has, so the real price could land either side of this range.`
        };
      }
      return { label: "Range estimate", cls: "close", title: `From ${view.comps} similar recent sales.` };
    }
    function rollChips(view) {
      if (!view.rarity) return [];
      const single = view.bonuses.length === 1;
      const out = [];
      for (const b of view.bonuses) {
        if (b.percent == null) continue;
        const id = bonusIdByTitle(b.name);
        if (id == null) continue;
        const c = classifyRollPosition(id, view.rarity, b.percent);
        if (!c) continue;
        const cls = c.position === "high" ? "verified" : c.position === "mid" ? "close" : "none";
        const bandTxt = c.min === c.max ? `${c.min}%` : `${c.min}\u2013${c.max}%`;
        const tierWord = c.label.replace(" roll", "");
        const perkName = b.name.replace(/\b\w/g, (ch) => ch.toUpperCase());
        const suffix = c.inBand ? "" : " (outside the usual band)";
        out.push({
          label: single ? `${tierWord} roll` : `${perkName}: ${tierWord}`,
          cls,
          title: `${perkName} ${b.percent}% is a ${c.label} for ${view.rarity} (usual range ${bandTxt})${suffix}. Higher rolls are worth more.`
        });
      }
      return out;
    }
    function chip(label, cls, title = "") {
      const el = text("span", `chip ${cls}`, label);
      if (title) el.title = title;
      return el;
    }
    function tile(label, value, valueCls = "", sub = "") {
      const t = document.createElement("div");
      t.className = "tile";
      t.append(text("span", "t-label", label), text("b", `t-val ${valueCls}`, value));
      if (sub) t.append(text("span", "t-sub", sub));
      return t;
    }
    function renderDecisionCard(view) {
      const tier = roiTier(view);
      const card = document.createElement("article");
      const rare = view.matchTier === "rare";
      const loose = view.matchTier === "rough" || rare || view.perkBound != null;
      card.className = `card ${tier}${loose ? " indicative" : ""}`;
      if (pendingFocusRow && view.row === pendingFocusRow) focusCardEl = card;
      const head = document.createElement("div");
      head.className = "c-head";
      const id = document.createElement("div");
      id.className = "c-id";
      const nameRow = document.createElement("div");
      nameRow.className = "c-weapon";
      if (view.rarity) {
        const tag = document.createElement("span");
        tag.className = "c-rarity-tag";
        tag.dataset.rarity = view.rarity;
        nameRow.appendChild(tag);
      }
      nameRow.appendChild(document.createTextNode(view.weaponName));
      id.append(nameRow, text("div", "c-perk", bonusLabel(view.bonuses)));
      const q1 = (n) => Math.round(n * 10) / 10;
      const statBits = [];
      if (view.rowArmor != null) statBits.push(`${q1(view.rowArmor)}\xA0Armor`);
      if (view.rowDamage != null) statBits.push(`${q1(view.rowDamage)}\xA0Damage`);
      if (view.rowAccuracy != null) statBits.push(`${q1(view.rowAccuracy)}\xA0Accuracy`);
      if (view.quality != null) statBits.push(`${q1(view.quality)}\xA0Quality`);
      if (statBits.length) {
        const stats = document.createElement("div");
        stats.className = "c-stats";
        for (const bit of statBits) stats.appendChild(text("span", "", bit));
        id.appendChild(stats);
      }
      const chips = document.createElement("div");
      chips.className = "c-chips";
      const mc = matchChip(view);
      const mcTitle = `${mc.title} ${evidenceSummary(view)}.`;
      chips.appendChild(chip(mc.label, mc.cls, mcTitle));
      for (const rc of rollChips(view)) chips.appendChild(chip(rc.label, rc.cls, rc.title));
      head.append(id, chips);
      card.appendChild(head);
      const tiles = document.createElement("div");
      tiles.className = "c-tiles";
      const rareSub = view.doublePerk && !view.crossedRarity && view.matchedRarity ? `at least, from ${view.matchedRarity} sales` : "at least this";
      const worthTile = tile(AAV_FULL, aavRangeText(view), "", rare ? rareSub : "");
      worthTile.classList.add("hero");
      worthTile.title = view.predLow != null && view.predHigh != null ? `${AAV_FULL}. The typical price this roll sells at, from completed auction sales. Open the details for the range a single sale usually lands in, which is wider.` : `${AAV_FULL}. The typical price this roll sells at, from completed auction sales.`;
      const vs = bidVsAav(view);
      const vt = vsTileContent(view, vs);
      const vsTile = tile("vs AAV", vt.val, vt.cls, vt.sub);
      vsTile.title = "Current bid against AAV.";
      const timeLeft = formatTimeRemaining(view.endsInSeconds);
      const bidTile = tile("Current bid", view.price != null ? money(view.price) : "\u2014", "", timeLeft ? `Ends in ${timeLeft}` : "");
      const jump = document.createElement("button");
      jump.type = "button";
      jump.className = "jump";
      jump.textContent = "Go to listing";
      jump.addEventListener("click", () => {
        panelOpen = false;
        renderChrome();
        flashHighlight(view.row);
      });
      bidTile.appendChild(jump);
      tiles.append(worthTile, bidTile, vsTile);
      card.appendChild(tiles);
      if (rare) {
        const doubleRange = view.doublePerk && !view.crossedRarity ? doublePerkRangeText(view.matchedRarity) : null;
        const note = view.doublePerk && !view.crossedRarity && view.matchedRarity ? `Priced from single-perk ${view.matchedRarity} sales, so it is a floor. ${doubleRange ?? "A second perk adds to it."}` : `Floor from more common versions. Few sales at this rarity.`;
        card.appendChild(text("p", "c-note", note));
      } else if (view.perkBound === "floor") {
        card.appendChild(text("p", "c-note", "Nothing has sold at this roll yet, so the value comes from the highest roll that has."));
      } else if (view.perkBound === "ceiling") {
        card.appendChild(text("p", "c-note", "This roll is below every recent sale, so the value below is a cap from the lowest roll that has sold."));
      }
      const insightsKey = view.dealKey + ":insights";
      const salesKey = view.dealKey + ":sales";
      function makeDrawer(label, stateKey, buildFn) {
        const wrap = document.createElement("div");
        wrap.className = "c-section";
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "c-details-toggle";
        const drawer = document.createElement("div");
        drawer.className = "c-drawer";
        let built = false;
        const setOpen = (open, animate = false) => {
          if (open && !built) {
            drawer.appendChild(buildFn());
            built = true;
          }
          drawer.style.display = open ? "block" : "none";
          btn.textContent = open ? `Hide ${label.toLowerCase()}` : label;
          btn.classList.toggle("open", open);
          btn.setAttribute("aria-expanded", open ? "true" : "false");
          if (open && animate) replayDrawerIn(drawer);
        };
        btn.addEventListener("click", () => {
          const open = !expandedCards.has(stateKey);
          if (open) expandedCards.add(stateKey);
          else expandedCards.delete(stateKey);
          autoOpened.delete(stateKey);
          setOpen(open, true);
        });
        setOpen(expandedCards.has(stateKey));
        drawerToggles.set(stateKey, setOpen);
        wrap.append(btn, drawer);
        return wrap;
      }
      const hasSalesDrawer = view.recentSales.length > 0 || view.comps > 0;
      const sections = [
        { section: "insights", key: insightsKey, exists: true },
        { section: "sales", key: salesKey, exists: hasSalesDrawer }
      ];
      for (const { section, key, exists } of sections) {
        if (!exists || !prefs.autoOpen[section] || autoOpenApplied.has(key)) continue;
        autoOpenApplied.add(key);
        if (!expandedCards.has(key)) {
          expandedCards.add(key);
          autoOpened.add(key);
        }
      }
      card.appendChild(makeDrawer("Insights", insightsKey, () => buildInsights(view, rare)));
      if (hasSalesDrawer) {
        card.appendChild(makeDrawer("Sales", salesKey, () => buildSalesSection(view, rare)));
      }
      return card;
    }
    function evidenceSummary(view) {
      const single = view.bonuses.length === 1 && view.bonuses[0]?.percent != null;
      const roll = single ? view.bonuses[0].percent : null;
      const unit = single ? perkUnitSuffix(view.bonuses[0].name) : "";
      const parts = [];
      const copies = view.rollDistinctItems;
      const copiesNote = copies > 0 && copies < view.exactRollComps ? copies === 1 ? ", all the same item" : `, from ${copies} different items` : "";
      if (view.pair) {
        const laddered = view.pair.basis !== "own" ? ", with this tier laddered from the one below" : "";
        parts.push(`No sales of this perk pair, so each perk is priced on its own${laddered}`);
      } else if (view.bridge) {
        const to = view.rarity ? view.rarity.toLowerCase() : "this tier";
        parts.push(`Too few ${to} sales of this weapon and perk, so this is estimated from the tier below`);
      } else if (roll != null && view.exactRollComps > 0) {
        const n = view.exactRollComps;
        parts.push(`${n} ${n === 1 ? "sale" : "sales"} at exactly ${roll}${unit}${copiesNote}`);
      } else if (roll != null) {
        parts.push(
          boundSourceRoll(view) != null ? `No sales at exactly ${roll}${unit}` : `No sales at exactly ${roll}${unit}, so nearby rolls set the range`
        );
      } else if (view.bonuses.length === 1 && view.comps > 0) {
        const tierWord = view.rarity ? view.rarity.toLowerCase() : "tier";
        parts.push(
          `Torn states no roll for this perk, so this is the ${tierWord} range across ${view.comps} ${view.comps === 1 ? "sale" : "sales"}`
        );
      } else {
        parts.push(`${view.comps} comparable ${view.comps === 1 ? "sale" : "sales"}`);
      }
      const rollScoped = roll != null && view.exactRollComps > 0;
      const dateDays = rollScoped ? (
        view.rollNewestTs != null ? calendarDaysAgo(view.rollNewestTs, Math.floor(Date.now() / 1e3)) : null
      ) : view.confidence.freshDays;
      const phrase = freshnessPhrase(dateDays);
      if (phrase) {
        const one = rollScoped ? view.exactRollComps === 1 : view.comps === 1;
        parts.push(one ? phrase : `latest ${phrase}`);
      }
      const span = spanPhrase(view.windowDays);
      if (span) parts.push(span);
      return parts.join(", ");
    }
    function insightRow(label, value, opts = {}) {
      const row = document.createElement("div");
      row.className = `c-ins-row${opts.tone ? ` ${opts.tone}` : ""}`;
      row.appendChild(text("span", "c-ins-k", label));
      if (typeof value === "string") {
        row.appendChild(text("span", `c-ins-v${opts.valueClass ? ` ${opts.valueClass}` : ""}`, value));
      } else {
        value.classList.add("c-ins-v");
        if (opts.valueClass) value.classList.add(...opts.valueClass.split(" "));
        row.appendChild(value);
      }
      if (opts.title) row.title = opts.title;
      return row;
    }
    function buildInsights(view, rare) {
      const details = document.createElement("div");
      details.className = "c-details";
      const list = document.createElement("div");
      list.className = "c-ins";
      list.appendChild(insightRow("Evidence", evidenceSummary(view), { valueClass: "c-meta" }));
      const rangeSource = rangeSourceSummary(view);
      if (rangeSource) {
        list.appendChild(
          insightRow("Range from", rangeSource, {
            valueClass: "c-meta",
            title: "Too few sales at this exact roll to price it on their own, so the range is taken from the rolls either side of it. A higher roll is never priced below a lower one."
          })
        );
      }
      const boundSource = boundSourceSummary(view);
      if (boundSource) {
        list.appendChild(
          insightRow("Estimated from", boundSource, {
            valueClass: "c-meta",
            title: view.perkBound === "floor" ? "Nothing has sold at this roll, so the value is carried over from the highest roll that has. Its sales are listed below. A better roll should fetch more, but measured against sales it had never seen this figure is beaten from below about as often as from above, so treat it as an estimate and not a minimum." : "Nothing has sold at this roll, so the value is carried over from the lowest roll that has. Its sales are listed below. A worse roll should fetch less, but measured against sales it had never seen this figure is not a reliable maximum, so treat it as an estimate."
          })
        );
      }
      const notCounted = notCountedSummary(view);
      if (notCounted) {
        list.appendChild(
          insightRow("Not counted", notCounted, {
            valueClass: "c-meta",
            title: "Sales at this roll that exist in the database but did not set this value: older than the window it is priced from, or rejected as price outliers. They are still listed under Sales, marked with an asterisk."
          })
        );
      }
      const qualityNote = qualityBasisSummary(view);
      if (qualityNote) {
        list.appendChild(
          insightRow("Quality", qualityNote, {
            valueClass: "c-meta",
            title: "Torn prints a listing's quality only in the expanded item panel. Where this exact item has sold before, or where Cortex has looked it up, its own quality is used and the value does not wait for you to expand anything. Otherwise this roll is priced at the quality its own sales typically carry, which is a different item from the one in front of you. Expanding will move the figure, but measured against sales the model had not seen it does not make it more accurate. Quality turns out to be a weak price signal."
          })
        );
      }
      if (view.history && view.history.sales.length > 0) {
        const wrap = document.createElement("div");
        wrap.className = "c-history";
        for (const sale of view.history.sales.slice(0, 4)) {
          const row = document.createElement("div");
          row.className = "c-history-row";
          row.append(text("b", "", money(sale.price)), text("span", "s-date", saleDate(sale.ts)));
          wrap.appendChild(row);
        }
        list.appendChild(
          insightRow("This item", wrap, {
            title: "This same item, matched by rarity, perk roll and quality, and only shown when that identifies exactly one item. Prices it actually fetched, not a forecast."
          })
        );
      }
      if (view.pair) {
        list.appendChild(
          insightRow("Estimate basis", view.pair.wide ? `${view.pair.text} Wide estimate \u2014 the live bid is often the better guide here.` : view.pair.text, {
            valueClass: "c-meta",
            title: "This exact pair of perks has almost never sold, so the value is built from what one perk is worth alone on this weapon times the lift that adding the other perk is measured to give across thousands of two-perk sales. The published range is the measured error of that method on sales held back from it."
          })
        );
      }
      if (view.bridge) {
        list.appendChild(
          insightRow("Estimate basis", view.bridge.wide ? `${view.bridge.text} Wide estimate \u2014 the live bid is often the better guide here.` : view.bridge.text, {
            valueClass: "c-meta",
            title: "This tier has no completed sales of its own for this weapon and perk, so the value is laddered up from the tier below by a step measured on real sales. The published range is the measured error of that method, not a guess."
          })
        );
      }
      if (view.perkSensitivity != null && view.bonuses.length === 1) {
        const perk = view.bonuses[0].name.replace(/\b\w/g, (c) => c.toUpperCase());
        const unit = perkUnitSuffix(view.bonuses[0].name);
        let line = `+${moneyC(view.perkSensitivity)} per 1${unit} ${perk}`;
        if (view.qualitySensitivity != null && view.qualitySensitivity > 0) {
          line += ` \xB7 +${moneyC(view.qualitySensitivity)} per quality point`;
        }
        if (view.sensitivityFit === "rough") line += " \xB7 rough guide";
        list.appendChild(
          insightRow("Drivers", line, {
            title: view.sensitivityFit === "rough" ? "Fitted across this cohort\u2019s completed sales, but the fit is loose \u2014 treat the rate as a direction, not a price. Rates that disagree with this weapon\u2019s own roll ladder are not shown at all." : "Fitted across this cohort\u2019s completed sales, and cross-checked against this weapon\u2019s own roll ladder."
          })
        );
      }
      if (view.saleSpread && view.matchTier === "exact") {
        list.appendChild(
          insightRow("Sale range", `${moneyC(view.saleSpread.low)} \u2013 ${moneyC(view.saleSpread.high)}`, {
            valueClass: "c-meta",
            title: "The range this exact roll's own completed sales actually covered."
          })
        );
      }
      if (view.predLow != null && view.predHigh != null && view.predHigh > view.predLow) {
        list.appendChild(
          insightRow("One sale lands", `${moneyC(view.predLow)} \u2013 ${moneyC(view.predHigh)}`, {
            valueClass: "c-meta",
            title: "Where a single further sale of this exact roll usually ends up, about nine times in ten. Wider than the value range above on purpose: that one says how well the typical price is known, and individual copies scatter much further than the typical price moves."
          })
        );
      }
      if (view.trend && view.trend.direction !== "flat" && view.comps >= 8) {
        const pct = Math.abs(Math.round(view.trend.changePct * 100));
        const dir = view.trend.direction === "up" ? "up" : "down";
        const days = view.trendCi?.horizonDays ?? 90;
        list.appendChild(
          insightRow("Market", `Trending ${dir} ${pct}% over ${days} days`, {
            valueClass: `c-trend-line trend-${dir}`,
            title: view.trendCi ? `95% interval: ${Math.round(view.trendCi.low * 100)}% to ${Math.round(view.trendCi.high * 100)}%` : ""
          })
        );
      }
      if (!rare && view.concentration) {
        const msg = view.concentration === "wash" ? "Same seller and buyer recur across recent sales" : "Most recent sales are from one seller";
        list.appendChild(insightRow("Caution", msg, { tone: "warn" }));
      }
      details.appendChild(list);
      return details;
    }
    function rollSalesKeysFor(view) {
      if (view.bonuses.length !== 1 || !view.rarity) return [];
      const roll = view.bonuses[0].percent;
      if (roll == null || !Number.isFinite(roll)) return [];
      const bonusId = perkIdForRow(view.itemId, view.bonuses[0].name);
      if (bonusId == null) return [];
      const prefix = `${view.itemId}:${bonusId}:${view.rarity.toLowerCase()}`;
      const rolls = [Math.round(roll)];
      for (const source of view.valueRolls) {
        if (!Number.isFinite(source)) continue;
        const r = Math.round(source);
        if (!rolls.includes(r)) rolls.push(r);
      }
      return rolls.slice(0, ROLL_SALES_MAX_PAIRS).map((r) => `${prefix}:${r}`);
    }
    async function fetchRollSales(keys, onDone) {
      const wanted = keys.filter((k) => !rollSalesCache.has(k) && !rollSalesPending.has(k));
      if (wanted.length === 0) return;
      if (typeof location === "undefined" || !location.hostname?.includes("torn.com")) return;
      for (const k of wanted) rollSalesPending.add(k);
      try {
        const parsed = await crossOriginGet(
          `${LAKE_BASE}${LAKE_ROLL_SALES_PATH}?pairs=${encodeURIComponent(wanted.join(","))}&limit=${ROLL_SALES_LIMIT}`,
          LAKE_TIMEOUT_MS
        );
        if (stopped) return;
        let answered = false;
        for (const key of wanted) {
          const rows = parsed?.groups?.[key];
          if (!Array.isArray(rows)) continue;
          answered = true;
          const mapped = [];
          for (const ls of rows) {
            if (!Number.isFinite(ls?.price) || ls.price <= 0 || !Number.isFinite(ls?.timestamp)) continue;
            mapped.push({
              saleId: ls.id ?? null,
              timestamp: ls.timestamp,
              price: ls.price,
              quality: Number.isFinite(ls.quality) ? ls.quality : null,
              damage: null,
              accuracy: null,
              armor: null,
              perks: (ls.bonuses ?? []).map((b) => b.value).filter((v) => Number.isFinite(v)),
              sellerId: Number.isFinite(ls.sellerId) ? ls.sellerId : null,
              buyerId: Number.isFinite(ls.buyerId) ? ls.buyerId : null,
              sellerName: ls.sellerName ?? null,
              buyerName: ls.buyerName ?? null
            });
          }
          mapped.sort((a, b) => b.timestamp - a.timestamp);
          rollSalesCache.set(key, mapped);
        }
        if (answered) onDone();
      } catch {
      } finally {
        for (const k of wanted) rollSalesPending.delete(k);
      }
    }
    function mergeSalesById(a, b) {
      const seen = /* @__PURE__ */ new Set();
      const out = [];
      for (const s of [...a, ...b]) {
        const key = s.saleId != null ? `id:${s.saleId}` : `tp:${s.timestamp}:${s.price}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(s);
      }
      return out.sort((x, y) => y.timestamp - x.timestamp);
    }
    function buildSalesSection(view, rare) {
      const details = document.createElement("div");
      details.className = "c-details";
      const rollKeys = rollSalesKeysFor(view);
      const fetched = (() => {
        const answered = rollKeys.map((k) => rollSalesCache.get(k)).filter((v) => v !== void 0);
        if (answered.length === 0) return void 0;
        return answered.reduce((acc, cur) => mergeSalesById(acc, cur), []);
      })();
      const canFetch = rollKeys.length > 0 && rollKeys.some((k) => !rollSalesCache.has(k));
      const localRows = view.recentSales;
      const rows = !fetched || fetched.length === 0 ? localRows : view.matchTier === "exact" ? fetched.length >= localRows.length ? fetched : localRows : mergeSalesById(localRows, fetched);
      if (rows.length === 0 && !canFetch && view.comps > 0) {
        const empty = document.createElement("p");
        empty.className = "c-empty-sales";
        empty.textContent = `${view.comps} sale${view.comps === 1 ? "" : "s"} in full history (none cached locally)`;
        details.appendChild(empty);
        return details;
      }
      if (rows.length > 0 || canFetch) {
        let sortedSales2 = function() {
          const arr = [...currentRows];
          const dir = sortDir === "asc" ? 1 : -1;
          if (sortCol === "date") return arr.sort((a, b) => dir * (a.timestamp - b.timestamp));
          if (sortCol === "price") return arr.sort((a, b) => dir * (a.price - b.price));
          if (sortCol === "perk") return arr.sort((a, b) => dir * ((a.perks[0] ?? 0) - (b.perks[0] ?? 0)));
          if (sortCol === "qual") return arr.sort((a, b) => dir * ((a.quality ?? 0) - (b.quality ?? 0)));
          if (sortCol === "seller") return arr.sort((a, b) => dir * ((a.sellerId ?? 0) - (b.sellerId ?? 0)));
          if (sortCol === "buyer") return arr.sort((a, b) => dir * ((a.buyerId ?? 0) - (b.buyerId ?? 0)));
          return arr;
        }, renderTitle2 = function() {
          const shown = currentRows.length;
          const saleWord = shown === 1 ? "sale" : "sales";
          if (rollKeys.some((k) => rollSalesPending.has(k)) && shown === 0) {
            titleCount.textContent = "loading";
            return;
          }
          const rollTxt = exactTier && view.bonuses.length === 1 && view.bonuses[0].percent != null ? ` at ${view.bonuses[0].percent}${perkUnitSuffix(view.bonuses[0].name)}` : "";
          titleCount.textContent = `${shown} ${saleWord}${rollTxt}`;
        }, buildTable2 = function() {
          tableWrap.innerHTML = "";
          const cols = [
            { key: "date", label: "Date" },
            { key: "price", label: "Price" },
            ...showPerk ? [{ key: "perk", label: "Perk" }] : [],
            { key: "qual", label: "Qual" },
            { key: "seller", label: "Seller" },
            { key: "buyer", label: "Buyer" }
          ];
          const header = document.createElement("div");
          header.className = "sale sale-h";
          for (const col of cols) {
            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = "sort-btn";
            btn.textContent = col.label;
            if (sortCol === col.key) {
              btn.classList.add("active");
              btn.classList.add(sortDir === "asc" ? "asc" : "desc");
            }
            btn.addEventListener("click", () => {
              if (sortCol === col.key) {
                sortDir = sortDir === "desc" ? "asc" : sortDir === "asc" ? null : "desc";
                if (sortDir === null) {
                  sortCol = "date";
                  sortDir = "desc";
                }
              } else {
                sortCol = col.key;
                sortDir = "desc";
              }
              buildTable2();
            });
            header.appendChild(btn);
          }
          tableWrap.appendChild(header);
          const q1 = (n) => Math.round(n * 10) / 10;
          const stat = (n) => n != null ? String(q1(n)) : "\u2014";
          const profileLink = (pid, name, cls) => {
            if (!pid) return text("span", cls, "\u2014");
            const a = document.createElement("a");
            a.className = cls;
            a.href = `https://www.torn.com/profiles.php?XID=${pid}`;
            a.target = "_blank";
            a.rel = "noopener";
            a.textContent = name || `#${String(pid).slice(-4)}`;
            a.title = name ? `${name} [${pid}]` : `Player ${pid}`;
            return a;
          };
          const allSorted = sortedSales2();
          const visible = allSorted.slice(0, showCount);
          for (const sale of visible) {
            const row = document.createElement("div");
            row.className = "sale";
            if (view.pricedSinceTs != null && sale.timestamp < view.pricedSinceTs) {
              row.classList.add("cx-unpriced");
              row.title = "Older than the window this value was priced from, so it is history rather than evidence for the figure above.";
            }
            if (isFirstBuild) row.style.animation = "cx-row-in .18s ease-out";
            const perkUnit = view.bonuses.length === 1 ? perkUnitSuffix(view.bonuses[0].name) : "%";
            const perkTxt = sale.perks.length ? sale.perks.map((p) => `${p}${perkUnit}`).join("/") : "\u2014";
            row.append(text("span", "s-date", saleDate(sale.timestamp)), text("b", "", money(sale.price)));
            if (showPerk) row.appendChild(text("em", "s-perk", perkTxt));
            row.append(
              text("em", "", stat(sale.quality)),
              profileLink(sale.sellerId, sale.sellerName, "s-profile"),
              profileLink(sale.buyerId, sale.buyerName, "s-profile")
            );
            tableWrap.appendChild(row);
          }
          if (allSorted.length > showCount) {
            if (!moreBtn) {
              moreBtn = document.createElement("button");
              moreBtn.type = "button";
              moreBtn.className = "sales-more";
              moreBtn.addEventListener("click", () => {
                showCount += PAGE_SIZE;
                buildTable2();
              });
            }
            moreBtn.textContent = `Show ${Math.min(PAGE_SIZE, allSorted.length - showCount)} more`;
            tableWrap.appendChild(moreBtn);
          }
          const unpriced = visible.filter((s) => view.pricedSinceTs != null && s.timestamp < view.pricedSinceTs).length;
          const window2 = pricedWindowPhrase(view);
          if (unpriced > 0 && window2) {
            tableWrap.appendChild(text("p", "sales-foot", `* Older than ${window2}. Shown as history, not counted in the value.`));
          }
        };
        var sortedSales = sortedSales2, renderTitle = renderTitle2, buildTable = buildTable2;
        const sales = document.createElement("div");
        const exactTier = view.matchTier === "exact";
        let sortCol = "date";
        let sortDir = "desc";
        let currentRows = rows;
        const salesTitle = document.createElement("div");
        salesTitle.className = "sales-title";
        const titleMain = rare ? "Sales history" : exactTier ? "Sales history" : "Comparable sales";
        const titleCount = text("span", "", "");
        renderTitle2();
        salesTitle.append(document.createTextNode(titleMain), titleCount);
        sales.appendChild(salesTitle);
        const tableWrap = document.createElement("div");
        tableWrap.className = "sales-table";
        const PAGE_SIZE = 5;
        let showCount = PAGE_SIZE;
        let moreBtn = null;
        let isFirstBuild = true;
        const showPerk = true;
        sales.className = "sales";
        buildTable2();
        isFirstBuild = false;
        sales.appendChild(tableWrap);
        details.appendChild(sales);
        if (canFetch) {
          renderTitle2();
          void fetchRollSales(rollKeys, () => {
            const got = rollKeys.map((k) => rollSalesCache.get(k)).filter((v) => v !== void 0).reduce((acc, cur) => mergeSalesById(acc, cur), []);
            if (got.length === 0) {
              renderTitle2();
              return;
            }
            const next = exactTier ? got.length >= currentRows.length ? got : currentRows : mergeSalesById(currentRows, got);
            if (next.length <= currentRows.length) {
              renderTitle2();
              return;
            }
            currentRows = next;
            showCount = PAGE_SIZE;
            moreBtn = null;
            renderTitle2();
            buildTable2();
          });
        }
      }
      return details;
    }
    function renderPanel() {
      const panel = document.createElement("section");
      panel.className = "panel";
      panel.setAttribute("aria-label", PRODUCT_NAME);
      const head = document.createElement("header");
      head.className = "panel-head";
      const heading = document.createElement("div");
      heading.className = "panel-brand";
      const brandMark = document.createElement("span");
      brandMark.className = "brand-mark";
      brandMark.innerHTML = cortexMarkSvg(20);
      const headingText = document.createElement("div");
      headingText.className = "panel-titles";
      headingText.append(
        text("div", "panel-title", PRODUCT_NAME),
        text("div", "panel-sub", "Auction values from completed sales")
      );
      heading.append(brandMark, headingText);
      const headActions = document.createElement("div");
      headActions.className = "head-actions";
      const state = scanState();
      const status = document.createElement("div");
      status.className = "status";
      status.setAttribute("role", "status");
      status.append(statusDot(state), document.createTextNode(scanStatusLabel(state)));
      const inSettings = panelView === "settings";
      const gear = document.createElement("button");
      gear.type = "button";
      gear.className = `icon-btn${inSettings ? " active" : ""}`;
      if (inSettings) {
        gear.textContent = "\u2039";
      } else {
        gear.innerHTML = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true" focusable="false"><path d="M4 7h10M18 7h2M4 17h4M12 17h8"></path><circle cx="16" cy="7" r="2.1"></circle><circle cx="10" cy="17" r="2.1"></circle></svg>';
      }
      gear.title = inSettings ? "Back to auctions" : "Settings & legend";
      gear.setAttribute("aria-label", inSettings ? "Back to auctions" : "Open settings and legend");
      gear.addEventListener("click", () => {
        panelView = inSettings ? "main" : "settings";
        renderChrome();
      });
      const close = document.createElement("button");
      close.type = "button";
      close.className = "icon-btn";
      close.textContent = "\xD7";
      close.title = "Close Cortex";
      close.setAttribute("aria-label", "Close Cortex");
      close.addEventListener("click", () => {
        panelOpen = false;
        panelView = "main";
        renderChrome();
      });
      headActions.append(status, gear, close);
      head.append(heading, headActions);
      panel.appendChild(head);
      const body = document.createElement("div");
      body.className = "panel-body";
      if (inSettings) {
        body.appendChild(renderSettings());
        panel.appendChild(body);
        return panel;
      }
      if (!catalogReady) {
        if (catalogFailed) {
          const failedNotice = document.createElement("div");
          failedNotice.className = "notice";
          failedNotice.append(text("strong", "", "Couldn't load catalog"), document.createTextNode("Cortex couldn't reach the data service. Check your connection."));
          const retry = document.createElement("button");
          retry.type = "button";
          retry.className = "primary";
          retry.textContent = "Try again";
          retry.addEventListener("click", retryChecks);
          failedNotice.appendChild(retry);
          body.appendChild(failedNotice);
        } else {
          body.appendChild(renderProgress());
        }
        panel.appendChild(body);
        return panel;
      }
      if (state === "checking") body.appendChild(renderProgress());
      const views = [...rowViews.values()];
      if (failedItems.size > 0) {
        const failed = document.createElement("div");
        failed.className = "notice";
        failed.append(text("strong", "", `${failedItems.size} item${failedItems.size === 1 ? "" : "s"} could not be checked`), document.createTextNode("The official Torn API did not return completed sales for every item."));
        const retry = document.createElement("button");
        retry.type = "button";
        retry.className = "primary";
        retry.textContent = "Try again";
        retry.addEventListener("click", retryChecks);
        failed.appendChild(retry);
        body.appendChild(failed);
      }
      if (state === "partial" && hasSearchableGap()) {
        const partial = document.createElement("div");
        partial.className = "notice";
        partial.append(
          text("strong", "", `${checkedCount()} of ${candidates} checked \xB7 ${valued} priced`),
          document.createTextNode("One or more uncommon perks still have older completed-sale history available beyond the automatic six-page search.")
        );
        const more = document.createElement("button");
        more.type = "button";
        more.className = "primary";
        more.textContent = "Search older sales";
        more.addEventListener("click", checkRemaining);
        partial.appendChild(more);
        body.appendChild(partial);
      } else if (state === "partial") {
        const partial = document.createElement("div");
        partial.className = "notice";
        partial.append(
          text("strong", "", `${checkedCount()} of ${candidates} checked \xB7 ${valued} priced`),
          document.createTextNode(`${unavailable} ${unavailable === 1 ? "listing has" : "listings have"} no comparable completed sales. Cortex marks the row instead of inventing a value.`)
        );
        body.appendChild(partial);
      }
      const positive = views.filter((view) => {
        const vs = bidVsAav(view);
        return !!vs && vs.below && !vs.within && vs.pct > 0;
      }).length;
      const bestDiscount = views.reduce((max, v) => {
        const vs = bidVsAav(v);
        return vs && vs.below && !vs.within && vs.pct > max ? vs.pct : max;
      }, 0);
      const kpis = document.createElement("div");
      kpis.className = "kpis";
      const kpiData = [
        [`${valued}/${candidates}`, "Priced"],
        [`${positive}`, "Below AAV"],
        [bestDiscount > 0 ? `${bestDiscount}%` : "\u2014", "Biggest discount"]
      ];
      for (const [value, label] of kpiData) {
        const kpi = document.createElement("div");
        kpi.className = "kpi";
        kpi.append(text("b", "", value), text("span", "", label));
        kpis.appendChild(kpi);
      }
      body.appendChild(kpis);
      const dealNow = Date.now();
      for (const [k, d] of sessionDeals) if (dealNow - d.seenAt >= SESSION_DEAL_TTL_MS) sessionDeals.delete(k);
      const topDeals = [...sessionDeals.values()].filter((d) => activeKind == null || d.kind === activeKind).sort((a, b) => b.below - a.below).slice(0, 5);
      if (topDeals.length > 0) {
        const deals = document.createElement("div");
        deals.className = "deals";
        const bestBuysOpen = storageGet(BEST_BUYS_KEY) === "open";
        const header = document.createElement("button");
        header.type = "button";
        header.className = "deals-header";
        header.textContent = `Best buys (${topDeals.length})`;
        header.title = bestBuysOpen ? "Collapse best buys" : "Expand best buys";
        header.setAttribute("aria-expanded", bestBuysOpen ? "true" : "false");
        const arrow = text("span", `deals-arrow${bestBuysOpen ? " open" : ""}`, "\u203A");
        header.prepend(arrow);
        const content = document.createElement("div");
        content.className = "deals-content";
        content.style.display = bestBuysOpen ? "block" : "none";
        header.addEventListener("click", () => {
          const isOpen = content.style.display !== "none";
          content.style.display = isOpen ? "none" : "block";
          arrow.className = `deals-arrow${isOpen ? "" : " open"}`;
          header.title = isOpen ? "Expand best buys" : "Collapse best buys";
          header.setAttribute("aria-expanded", isOpen ? "false" : "true");
          storageSet(BEST_BUYS_KEY, isOpen ? "closed" : "open");
        });
        for (const d of topDeals) {
          const rowEl = document.createElement("div");
          rowEl.className = "deal";
          const main2 = document.createElement("div");
          main2.className = "deal-main";
          main2.append(text("span", "deal-w", d.weapon), text("span", "deal-perk", d.perk));
          const right = document.createElement("div");
          right.className = "deal-right";
          right.append(text("b", "deal-roi", `${Math.round(d.below * 100)}% under`), text("span", "deal-v", `AAV ${moneyC(d.worth)}`));
          rowEl.append(main2, right);
          content.appendChild(rowEl);
        }
        deals.append(header, content);
        body.appendChild(deals);
      }
      if (views.length === 0) {
        const empty = document.createElement("div");
        empty.className = "notice";
        const { noun, verb } = gearPluralForm(activeKind);
        empty.append(
          text("strong", "", candidates > 0 ? "Checking recent sales" : `No ranked-war ${noun} here`),
          document.createTextNode(
            candidates > 0 ? "Rare rolls may not have a value until more sales come in." : `Cortex values yellow, orange and red ${noun} that ${verb} a perk.`
          )
        );
        body.appendChild(empty);
      } else {
        views.sort((a, b) => {
          const ar = a.projection?.roi ?? Number.NEGATIVE_INFINITY;
          const br = b.projection?.roi ?? Number.NEGATIVE_INFINITY;
          return br - ar || Number(b.evidence === "verified") - Number(a.evidence === "verified") || b.comps - a.comps;
        });
        const cards = document.createElement("div");
        cards.className = "cards";
        views.forEach((view) => cards.appendChild(renderDecisionCard(view)));
        body.appendChild(cards);
      }
      panel.appendChild(body);
      const h = panel.querySelector(".panel-head");
      if (h) {
        makeDraggable(panel, h, (pos) => {
          prefs.panelPos = pos;
          savePrefs(prefs);
        }, () => prefs.panelMode === "undocked");
      }
      if (prefs.panelMode === "undocked" && prefs.panelPos) {
        applyFloatPos(panel, prefs.panelPos);
        requestAnimationFrame(() => {
          if (panel.isConnected && prefs.panelMode === "undocked" && prefs.panelPos) applyFloatPos(panel, prefs.panelPos);
        });
      }
      return panel;
    }
    function segControl(options, isOn, onPick) {
      const seg = document.createElement("div");
      seg.className = "seg";
      const buttons = [];
      const sync = () => {
        for (const { value, el } of buttons) {
          const on = isOn(value);
          el.classList.toggle("on", on);
          el.setAttribute("aria-pressed", on ? "true" : "false");
        }
      };
      for (const opt of options) {
        const el = document.createElement("button");
        el.type = "button";
        el.textContent = opt.label;
        el.addEventListener("click", () => {
          onPick(opt.value);
          sync();
        });
        buttons.push({ value: opt.value, el });
        seg.appendChild(el);
      }
      sync();
      segSyncs.push(sync);
      return seg;
    }
    function settingsRow(label, control) {
      const row = document.createElement("div");
      row.className = "set-row";
      row.appendChild(text("div", "set-h", label));
      row.appendChild(control);
      return row;
    }
    function sectionOfKey(stateKey) {
      const tail = stateKey.slice(stateKey.lastIndexOf(":") + 1);
      return tail === "insights" || tail === "sales" ? tail : null;
    }
    function setAutoOpenSection(section, on) {
      prefs.autoOpen[section] = on;
      savePrefs(prefs);
      applyAutoOpen();
    }
    function clearAutoOpen() {
      for (const section of DRAWER_SECTIONS) prefs.autoOpen[section] = false;
      savePrefs(prefs);
      applyAutoOpen();
    }
    function applyAutoOpen() {
      for (const section of DRAWER_SECTIONS) {
        if (prefs.autoOpen[section]) continue;
        for (const key of [...autoOpenApplied]) {
          if (sectionOfKey(key) !== section) continue;
          autoOpenApplied.delete(key);
          if (!autoOpened.has(key)) continue;
          autoOpened.delete(key);
          expandedCards.delete(key);
          drawerToggles.get(key)?.(false, true);
        }
      }
      for (const [key, toggle] of drawerToggles) {
        const section = sectionOfKey(key);
        if (!section || !prefs.autoOpen[section] || autoOpenApplied.has(key)) continue;
        autoOpenApplied.add(key);
        if (expandedCards.has(key)) continue;
        expandedCards.add(key);
        autoOpened.add(key);
        toggle(true, true);
      }
      syncSettingsUi();
    }
    function renderAppearance() {
      const card = document.createElement("div");
      card.className = "set-card";
      segSyncs.length = 0;
      card.appendChild(settingsRow("Theme", segControl(
        [{ value: "dark", label: "Dark" }, { value: "light", label: "Light" }],
        (v) => v === prefs.theme,
        (v) => {
          prefs.theme = v;
          savePrefs(prefs);
          applyTheme(v);
        }
      )));
      card.appendChild(settingsRow("Panel", segControl(
        [{ value: "docked", label: "Docked" }, { value: "undocked", label: "Undocked" }],
        (v) => v === prefs.panelMode,
        (v) => {
          prefs.panelMode = v;
          if (v === "docked") {
            prefs.panelPos = null;
            prefs.tabPos = null;
          }
          savePrefs(prefs);
          applyPrefs();
        }
      )));
      panelHintEl = text("p", "set-copy", "Undocking is for desktop. On a phone the panel fills most of the screen, so there is almost nowhere to move it to.");
      card.appendChild(panelHintEl);
      card.appendChild(settingsRow("Tab", segControl(
        [{ value: "true", label: "Visible" }, { value: "false", label: "Hidden" }],
        (v) => v === (prefs.tabVisible ? "true" : "false"),
        (v) => {
          prefs.tabVisible = v === "true";
          savePrefs(prefs);
          applyPrefs();
        }
      )));
      tabHintEl = text("p", "set-copy", "The tab is hidden. Open Cortex from the value badge on any listing.");
      card.appendChild(tabHintEl);
      card.appendChild(settingsRow("Badge size", segControl(
        [{ value: "small", label: "S" }, { value: "medium", label: "M" }, { value: "large", label: "L" }],
        (v) => v === prefs.badgeSize,
        (v) => {
          prefs.badgeSize = v;
          savePrefs(prefs);
          applyPrefs();
        }
      )));
      card.appendChild(settingsRow("Auto-open", segControl(
        [{ value: "none", label: "None" }, { value: "insights", label: "Insights" }, { value: "sales", label: "Sales" }],
        (v) => v === "none" ? !prefs.autoOpen.insights && !prefs.autoOpen.sales : prefs.autoOpen[v],
        (v) => {
          if (v === "none") clearAutoOpen();
          else setAutoOpenSection(v, !prefs.autoOpen[v]);
        }
      )));
      const reset = document.createElement("button");
      reset.type = "button";
      reset.className = "ghost";
      reset.textContent = "Reset position";
      reset.addEventListener("click", () => {
        prefs.panelPos = null;
        prefs.tabPos = null;
        savePrefs(prefs);
        applyPrefs();
      });
      resetPosEl = reset;
      card.appendChild(reset);
      syncSettingsUi();
      return card;
    }
    function syncSettingsUi() {
      for (const sync of segSyncs) sync();
      if (tabHintEl) tabHintEl.hidden = prefs.tabVisible;
      if (resetPosEl) resetPosEl.hidden = !(prefs.panelMode === "undocked" && (prefs.panelPos || prefs.tabPos));
      if (panelHintEl) panelHintEl.hidden = isDesktopView();
    }
    function applyPrefs() {
      host.classList.toggle("cx-undocked", prefs.panelMode === "undocked");
      const docEl = document.documentElement;
      if (docEl) {
        docEl.classList.toggle("cx-badge-sm", prefs.badgeSize === "small");
        docEl.classList.toggle("cx-badge-lg", prefs.badgeSize === "large");
      }
      const tabEl = shadow.querySelector(".tab");
      if (tabEl) tabEl.style.display = prefs.tabVisible ? "" : "none";
      const undocked = prefs.panelMode === "undocked";
      const panelEl = shadow.querySelector(".panel");
      if (panelEl) {
        if (undocked && prefs.panelPos) applyFloatPos(panelEl, prefs.panelPos);
        else clearFloatPos(panelEl);
      }
      if (tabEl) {
        if (undocked && prefs.tabPos) applyFloatPos(tabEl, prefs.tabPos);
        else clearFloatPos(tabEl);
      }
      syncSettingsUi();
    }
    function renderSiteCard() {
      const card = document.createElement("div");
      card.className = "set-card";
      card.appendChild(text("div", "set-h", "AH Database"));
      card.appendChild(text("p", "set-copy", "Look up the full sale history for any item."));
      const link = document.createElement("a");
      link.className = "site-link";
      link.href = SITE_URL;
      link.target = "_blank";
      link.rel = "noopener";
      link.textContent = "torncortex.com";
      link.title = "Open the AH Database in a new tab";
      card.appendChild(link);
      return card;
    }
    function renderDataCard() {
      const card = document.createElement("div");
      card.className = "set-card";
      card.appendChild(text("div", "set-h", "Data"));
      const saved = [...jobs.values()].filter((j) => j.sales.length > 0).length;
      card.appendChild(text("p", "set-copy", `${saved} item${saved === 1 ? "" : "s"} cached on this device. Sales refresh on their own; force it here if you want the newest now.`));
      const actions = document.createElement("div");
      actions.className = "key-actions";
      const refresh = document.createElement("button");
      refresh.type = "button";
      refresh.className = "ghost";
      refresh.textContent = "Refresh now";
      refresh.addEventListener("click", () => {
        for (const v of rowViews.values()) {
          const c = valueCache.get(v.itemId);
          if (c) c.at = 0;
        }
        panelView = "main";
        renderChrome();
        if (catalogReady) annotateAll();
        else void boot();
      });
      const clear = document.createElement("button");
      clear.type = "button";
      clear.className = "ghost danger";
      clear.textContent = "Clear cached sales";
      clear.addEventListener("click", () => {
        clearSalesData();
      });
      actions.append(refresh, clear);
      card.appendChild(actions);
      return card;
    }
    function clearSalesData() {
      void deleteDbPayload();
      jobs.clear();
      valueCache.clear();
      pageLimitByItem.clear();
      requirementsByItem.clear();
      failedItems.clear();
      queue.clear();
      rowViews.clear();
      sessionDeals.clear();
      lakeAttempted.clear();
      lakeInFlight.clear();
      lakeAttemptedItems.clear();
      lakeItemIds.clear();
      cohortSurfaces.clear();
      lakeRetryBudget = LAKE_RETRY_BUDGET;
      valued = 0;
      unavailable = 0;
      document.querySelectorAll(`.${BADGE_CLASS}`).forEach((node) => node.remove());
      document.querySelectorAll(`[${BADGE_ATTR}]`).forEach((node) => node.removeAttribute(BADGE_ATTR));
      panelView = "main";
      renderChrome();
      if (catalogReady) schedule(0);
      else void boot();
    }
    function renderSettings() {
      const wrap = document.createElement("div");
      wrap.className = "settings";
      wrap.appendChild(renderAppearance());
      wrap.appendChild(renderDataCard());
      wrap.appendChild(renderSiteCard());
      const legend = document.createElement("div");
      legend.className = "legend";
      legend.appendChild(text("div", "set-h", "Reference"));
      const items = [
        [`${AAV_WORD}`, `${AAV_FULL}. Typical sale price from completed auctions.`],
        ["vs AAV", "Current bid against AAV."],
        ["Direct comps", "Same item, rarity and roll."],
        ["Range estimate", "From similar sales; shown as a range."],
        ["Not enough history", "Floor from more common versions."],
        ["Tier not stated", "This roll sells at two tiers; click the listing to resolve it."],
        ["High / medium / low", "Where the perk % sits in its range."],
        ["Trend", "Recent sales against older."],
        ["Flag", "One dominant seller, or a repeat buyer/seller pair."]
      ];
      for (const [term, desc] of items) {
        const row = document.createElement("div");
        row.className = "legend-row";
        row.append(text("div", "legend-term", term), text("div", "legend-desc", desc));
        legend.appendChild(row);
      }
      wrap.appendChild(legend);
      wrap.appendChild(text("p", "set-foot", "Prices from completed Auction House sales. No API key needed."));
      wrap.appendChild(text("p", "set-foot", `${PRODUCT_NAME} v${UI_VERSION}`));
      wrap.appendChild(text("p", "set-foot", `Data source: ${lakeDiag}`));
      return wrap;
    }
    let lastChromeDataSignature = "";
    function chromeDataSignature() {
      const rows = [...rowViews.values()].map((view) => {
        const recent = view.recentSales.map((sale) => `${sale.saleId ?? ""}:${sale.timestamp}:${sale.price}:${sale.quality ?? ""}`).join(",");
        return `${view.itemId}:${view.sigKey}:${view.price ?? ""}:${Math.round(view.fair)}:${view.comps}:${view.evidence}:${view.estimateReason ?? ""}:${recent}`;
      }).sort().join("|");
      return `${scanState()}:${"ok"}:${catalogReady}:${valued}:${unavailable}:${candidates}:${rows}`;
    }
    function renderChromeIfDataChanged() {
      if (panelOpen && panelView === "settings") return;
      const next = chromeDataSignature();
      if (next === lastChromeDataSignature) return;
      const state = scanState();
      if (panelOpen && state === "checking" && lastRenderedState === "checking") {
        progressTick();
        return;
      }
      if (state === "checking" && !panelOpen && state === lastRenderedState) {
        const sinceLast = Date.now() - lastRenderAt;
        if (sinceLast < RENDER_THROTTLE_MS) {
          if (!pendingRenderTimer) {
            pendingRenderTimer = setTimeout(() => {
              pendingRenderTimer = null;
              if (!stopped) renderChrome();
            }, RENDER_THROTTLE_MS - sinceLast);
          }
          return;
        }
      }
      renderChrome();
    }
    function renderChrome() {
      if (stopped) return;
      if (pendingRenderTimer) {
        clearTimeout(pendingRenderTimer);
        pendingRenderTimer = null;
      }
      lastRenderAt = Date.now();
      lastRenderedState = scanState();
      syncScanClock();
      ensureProgressTimer();
      lastChromeDataSignature = chromeDataSignature();
      const prevScroll = shadow.querySelector(".panel-body")?.scrollTop ?? 0;
      drawerToggles.clear();
      chromeMount.textContent = "";
      if (!panelOpen) {
        panelEntered = false;
        const state = scanState();
        const tab = document.createElement("button");
        tab.type = "button";
        tab.className = "tab";
        tab.title = `${scanStatusLabel(state)}. Open ${PRODUCT_NAME}`;
        tab.setAttribute("aria-label", `${scanStatusLabel(state)}. Open ${PRODUCT_NAME}`);
        const tabMark = document.createElement("span");
        tabMark.className = "brand-mark";
        tabMark.innerHTML = cortexMarkSvg(15);
        tab.append(
          statusDot(state),
          tabMark,
          text("span", "cx-arrow", "\u2039"),
          text("span", "cx-name", "CORTEX")
        );
        if (candidates > 0) tab.append(text("span", "cx-count", `${checkedCount()}/${candidates}`));
        tab.addEventListener("click", () => {
          panelOpen = true;
          renderChrome();
        });
        makeDraggable(tab, tab, (pos) => {
          prefs.tabPos = pos;
          savePrefs(prefs);
        }, () => prefs.panelMode === "undocked");
        if (prefs.panelMode === "undocked" && prefs.tabPos) {
          applyFloatPos(tab, prefs.tabPos);
          requestAnimationFrame(() => {
            if (tab.isConnected && prefs.panelMode === "undocked" && prefs.tabPos) applyFloatPos(tab, prefs.tabPos);
          });
        }
        if (!prefs.tabVisible) tab.style.display = "none";
        chromeMount.appendChild(tab);
        return;
      }
      const panelEl = renderPanel();
      if (!panelEntered) {
        panelEl.classList.add("cx-enter");
        panelEntered = true;
      }
      chromeMount.appendChild(panelEl);
      const body = shadow.querySelector(".panel-body");
      if (body && prevScroll > 0) body.scrollTop = prevScroll;
      if (focusCardEl) {
        const target = focusCardEl;
        requestAnimationFrame(() => flashHighlight(target));
        focusCardEl = null;
        pendingFocusRow = null;
      }
    }
    function schedule(delay = 300) {
      if (stopped) return;
      if (renderTimer) clearTimeout(renderTimer);
      renderTimer = setTimeout(() => {
        if (catalogReady && lakeTargets().targets.length > 0) {
          lakePending = true;
          annotateAll();
          void tryLakeBatch().catch(() => {
          }).finally(() => {
            lakePending = false;
            if (stopped) return;
            annotateAll();
            scheduleFollowUp();
          });
        } else {
          annotateAll();
          if (Date.now() - lastInteractionAt < INTERACTION_GRACE_MS) {
            scheduleFollowUp();
          }
        }
      }, delay);
    }
    let followUpTimer = null;
    let followUpStep = 0;
    function scheduleFollowUp() {
      if (stopped) return;
      followUpStep = 0;
      runFollowUp();
    }
    function runFollowUp() {
      if (stopped || followUpStep >= 3) return;
      const delays = [500, 1e3, 2e3];
      const delay = delays[followUpStep] ?? 2e3;
      if (followUpTimer) clearTimeout(followUpTimer);
      followUpTimer = setTimeout(() => {
        followUpTimer = null;
        if (stopped) return;
        followUpStep++;
        const { targets } = lakeTargets();
        if (targets.length > 0) {
          lakePending = true;
          annotateAll();
          void tryLakeBatch().catch(() => {
          }).finally(() => {
            lakePending = false;
            if (!stopped) {
              annotateAll();
              runFollowUp();
            }
          });
        } else {
          annotateAll();
        }
      }, delay);
    }
    function pairKey(itemId, bonusId) {
      return `${itemId}:${bonusId ?? "?"}`;
    }
    function localHasPerk(itemId, bonusIds) {
      if (bonusIds.length === 0) return false;
      const job = jobs.get(itemId);
      if (!job) return false;
      const matching = job.sales.filter((s) => s.bonuses.some((b) => bonusIds.includes(b.id)));
      return matching.length >= GEAR_CONFIG.minComps;
    }
    function lakeTargets() {
      const byItem = /* @__PURE__ */ new Map();
      const covered = /* @__PURE__ */ new Set();
      let allResolved = true;
      const now = Date.now();
      document.querySelectorAll(AUCTION_ROW_SEL).forEach((row) => {
        if (!rowIsVisible(row)) return;
        const titleEl = row.querySelector(TITLE_SEL);
        if (!titleEl) return;
        const bonuses = parseBonuses(row);
        if (bonuses.length === 0) return;
        const weapon = resolveRowWeapon(row, titleEl);
        if (!weapon) return;
        const cached = valueCache.get(weapon.id);
        const fresh = cached != null && now - cached.at < REFRESH_INTERVAL_MS;
        for (const b of bonuses) {
          const ids = bonusIdsByTitle(b.name);
          if (ids.length === 0) allResolved = false;
          const key = pairKey(weapon.id, ids[0] ?? null);
          if (lakeAttempted.has(key)) {
            covered.add(weapon.id);
            continue;
          }
          if (fresh && localHasPerk(weapon.id, ids)) {
            covered.add(weapon.id);
            continue;
          }
          let target = byItem.get(weapon.id);
          if (!target) {
            target = { itemId: weapon.id, perkIds: [], pairs: [] };
            byItem.set(weapon.id, target);
          }
          if (!target.pairs.includes(key)) target.pairs.push(key);
          for (const id of ids) if (!target.perkIds.includes(id)) target.perkIds.push(id);
        }
      });
      for (const id of covered) if (!byItem.has(id)) lakeItemIds.add(id);
      return { targets: [...byItem.values()], allResolved };
    }
    async function tryLakeBatch() {
      if (stopped || !catalogReady || !pageIsActive()) return;
      if (typeof location === "undefined" || !location.hostname?.includes("torn.com")) return;
      const { targets, allResolved } = lakeTargets();
      if (targets.length === 0) {
        await tryInstanceHistory();
        return;
      }
      for (const target of targets) {
        for (const key of target.pairs) {
          lakeAttempted.add(key);
          lakeInFlight.add(key);
        }
        lakeAttemptedItems.add(target.itemId);
      }
      let failed = false;
      for (const chunk of chunkTargets(targets)) {
        const ok = await requestLakeChunk(chunk, allResolved);
        for (const target of chunk) {
          for (const key of target.pairs) lakeInFlight.delete(key);
          if (ok) continue;
          for (const key of target.pairs) lakeAttempted.delete(key);
          lakeAttemptedItems.delete(target.itemId);
        }
        failed = failed || !ok;
        if (stopped) return;
        if (ok && targets.length > LAKE_MAX_ITEMS_PER_REQUEST) annotateAll();
      }
      if (failed) scheduleLakeRetry();
      await tryInstanceHistory();
    }
    async function tryInstanceHistory() {
      if (stopped || !catalogReady || !pageIsActive()) return;
      if (typeof location === "undefined" || !location.hostname?.includes("torn.com")) return;
      const wantedUids = [];
      const wanted = [];
      document.querySelectorAll(AUCTION_ROW_SEL).forEach((row) => {
        if (!rowIsVisible(row)) return;
        const titleEl = row.querySelector(TITLE_SEL);
        if (!titleEl) return;
        const identity = rowIdentity(row, titleEl);
        if (!identity) return;
        const weapon = identity.weapon;
        if (identity.uid != null) {
          const key = String(identity.uid);
          if (!instanceHistory.has(key) && !wantedUids.includes(key)) wantedUids.push(key);
          return;
        }
        const fp = instanceFingerprint(
          weapon.id,
          resolveRowRarity(weapon.id, identity.bonuses, row, valueCache.get(weapon.id)?.sales ?? [], identity.statedTier).rarity,
          identity.quality,
          identity.bonuses.map((b) => ({ id: perkIdForRow(weapon.id, b.name), value: b.percent }))
        );
        if (fp && !instanceHistory.has(fp) && !wanted.includes(fp)) wanted.push(fp);
      });
      if (wanted.length === 0 && wantedUids.length === 0) return;
      for (let i = 0; i < wantedUids.length; i += INSTANCE_BATCH_SIZE) {
        const batch = wantedUids.slice(i, i + INSTANCE_BATCH_SIZE);
        const parsed = await crossOriginGet(
          `${LAKE_BASE}${LAKE_INSTANCE_PATH}?uids=${batch.join(",")}`,
          LAKE_TIMEOUT_MS
        );
        if (stopped) return;
        if (!parsed || !Array.isArray(parsed.instances)) break;
        for (const inst of parsed.instances) {
          if (!inst || typeof inst.key !== "string") continue;
          const sales = (inst.matched && Array.isArray(inst.sales) ? inst.sales : []).filter((s) => Number.isFinite(s?.ts) && Number.isFinite(s?.price) && s.price > 0).sort((a, b) => b.ts - a.ts);
          instanceHistory.set(inst.key, inst.matched === true && sales.length > 0 ? { sales } : null);
          if (typeof inst.quality === "number" && Number.isFinite(inst.quality) && inst.quality > 0) {
            instanceQuality.set(inst.key, inst.quality);
          }
          if (typeof inst.rarity === "string" && RARITY_TIERS.includes(inst.rarity)) {
            instanceRarity.set(inst.key, inst.rarity);
          }
        }
      }
      for (let i = 0; i < wanted.length; i += INSTANCE_BATCH_SIZE) {
        const batch = wanted.slice(i, i + INSTANCE_BATCH_SIZE);
        const parsed = await crossOriginGet(
          `${LAKE_BASE}${LAKE_INSTANCE_PATH}?fp=${batch.map(encodeURIComponent).join(",")}`,
          LAKE_TIMEOUT_MS
        );
        if (stopped) return;
        if (!parsed || !Array.isArray(parsed.instances)) return;
        for (const inst of parsed.instances) {
          if (!inst || typeof inst.key !== "string") continue;
          const sales = (inst.matched && Array.isArray(inst.sales) ? inst.sales : []).filter((s) => Number.isFinite(s?.ts) && Number.isFinite(s?.price) && s.price > 0).sort((a, b) => b.ts - a.ts);
          instanceHistory.set(inst.key, inst.matched === true && sales.length > 0 ? { sales } : null);
        }
      }
      if (!stopped) annotateAll();
    }
    function chunkTargets(targets) {
      const chunks = [];
      let current = [];
      let perks = /* @__PURE__ */ new Set();
      for (const target of targets) {
        const wouldBe = /* @__PURE__ */ new Set([...perks, ...target.perkIds]);
        const full = current.length >= LAKE_MAX_ITEMS_PER_REQUEST || current.length > 0 && wouldBe.size > LAKE_MAX_PERKS_PER_REQUEST;
        if (full) {
          chunks.push(current);
          current = [];
          perks = /* @__PURE__ */ new Set();
        }
        current.push(target);
        for (const id of target.perkIds) perks.add(id);
      }
      if (current.length > 0) chunks.push(current);
      return chunks;
    }
    function scheduleLakeRetry() {
      if (stopped || lakeRetryBudget <= 0 || lakeRetryTimer) return;
      lakeRetryBudget--;
      lakeRetryTimer = setTimeout(() => {
        lakeRetryTimer = null;
        if (!stopped) schedule(0);
      }, LAKE_RETRY_DELAY_MS);
    }
    async function requestLakeChunk(chunk, allResolved) {
      const itemIds = chunk.map((t) => t.itemId);
      const perkIds = [...new Set(chunk.flatMap((t) => t.perkIds))];
      const perkParam = perkIds.length > 0 ? `&perks=${perkIds.join(",")}${allResolved ? "&scopeSales=1" : ""}` : "";
      const url = `${LAKE_BASE}${LAKE_BATCH_PATH}?items=${itemIds.join(",")}&months=24&perCohort=12${perkParam}`;
      const lakeStart = Date.now();
      const transport = pdaBridge() ? "pda" : gmRequest() ? "gm" : "fetch";
      try {
        const parsed = await crossOriginGet(url, LAKE_TIMEOUT_MS);
        const ms = Date.now() - lakeStart;
        if (!parsed || !Array.isArray(parsed.sales)) {
          lakeDiag = `${transport} failed ${ms}ms (${itemIds.length} items)`;
          return false;
        }
        const data = parsed;
        const itemMeta = parsed?.itemMeta ?? {};
        const perkTitles = parsed?.perkTitles ?? {};
        const cohorts = parsed?.cohorts;
        if (Array.isArray(cohorts)) {
          for (const c of cohorts) {
            if (!c.rarity || !Array.isArray(c.priceByValue)) continue;
            cohortSurfaces.set(`${c.itemId}:${c.bonusId}:${c.rarity.toLowerCase()}`, c);
            lakeItemIds.add(c.itemId);
          }
        }
        const lakeBridges = parsed?.bridges;
        if (Array.isArray(lakeBridges)) {
          for (const b of lakeBridges) {
            if (!Number.isFinite(b.itemId) || !Number.isFinite(b.bonusId)) continue;
            if (!(b.fromMedian > 0) || !Number.isFinite(b.fromComps)) continue;
            if (typeof b.from !== "string" || typeof b.to !== "string") continue;
            bridgeRatios.set(bridgeKey(b.itemId, b.bonusId, b.from, b.to), b);
          }
        }
        const lakeTierMedians = parsed?.tierMedians;
        if (Array.isArray(lakeTierMedians)) {
          for (const t of lakeTierMedians) {
            if (!Number.isFinite(t.itemId) || !Number.isFinite(t.bonusId) || typeof t.rarity !== "string") continue;
            if (!(t.median > 0) || !Number.isFinite(t.sales)) continue;
            tierMedians.set(`${t.itemId}:${t.bonusId}:${t.rarity.toLowerCase()}`, t);
          }
        }
        if (stopped || data.sales.length === 0) {
          lakeDiag = `${transport} empty ${ms}ms (${itemIds.length} items)`;
          return !stopped;
        }
        lakeDiag = `${transport} ${data.sales.length} sales ${ms}ms`;
        const byItem = /* @__PURE__ */ new Map();
        for (const ls of data.sales) {
          if (!Number.isFinite(ls.itemId) || !Number.isFinite(ls.price) || ls.price <= 0) continue;
          if (!Number.isFinite(ls.timestamp)) continue;
          const meta = itemMeta[String(ls.itemId)];
          const sale = {
            saleId: ls.id ?? null,
            price: ls.price,
            timestamp: ls.timestamp,
            quality: Number.isFinite(ls.quality) ? ls.quality : null,
            damage: null,
            accuracy: null,
            armor: null,
            sellerId: Number.isFinite(ls.sellerId) ? ls.sellerId : null,
            buyerId: Number.isFinite(ls.buyerId) ? ls.buyerId : null,
            sellerName: ls.sellerName ?? null,
            buyerName: ls.buyerName ?? null,
            rarity: ls.rarity ?? null,
            bonuses: (ls.bonuses ?? []).map((b) => ({ id: b.id, title: b.title ?? perkTitles[String(b.id)] ?? "", value: b.value })),
            uid: null,
            itemId: ls.itemId,
            name: ls.name ?? meta?.name ?? null,
            type: ls.type ?? meta?.type ?? "Weapon",
            subType: ls.subType ?? meta?.subType ?? null
          };
          const arr = byItem.get(ls.itemId);
          if (arr) arr.push(sale);
          else byItem.set(ls.itemId, [sale]);
        }
        const now = Date.now();
        const limits = dbLimits();
        for (const [itemId, sales] of byItem) {
          if (sales.length === 0) continue;
          const existingJob = jobs.get(itemId);
          const merged = existingJob ? mergeSales(existingJob.sales, sales, now, limits.windowMs, limits.maxSalesPerItem) : sales;
          const oldest = merged.reduce((min, s) => s.timestamp < min ? s.timestamp : min, merged[0].timestamp);
          jobs.set(itemId, {
            itemId,
            sales: merged,
            seen: new Set(merged.filter((s) => s.saleId != null).map((s) => s.saleId)),
            to: oldest,
            pagesPulled: existingJob ? existingJob.pagesPulled : 1,
            requestsThisRun: 0,
            exhausted: existingJob ? existingJob.exhausted : false,
            completedAt: now,
            category: catalogById.get(itemId)?.category ?? null
          });
          lakeItemIds.add(itemId);
          rebuildValue(itemId, now);
        }
        return true;
      } catch (e) {
        lakeDiag = `${transport} error ${Date.now() - lakeStart}ms: ${e instanceof Error ? e.message.slice(0, 40) : "unknown"}`;
        return false;
      }
    }
    async function boot() {
      if (stopped) return;
      await ensureRestored();
      if (stopped) return;
      renderChrome();
      if (catalogReady || catalogLoading || !pageIsActive()) return;
      catalogLoading = true;
      catalogFailed = false;
      renderChromeIfDataChanged();
      try {
        catalog = await loadCatalog();
        if (stopped) return;
        catalogReady = catalog.length > 0;
        catalogFailed = !catalogReady;
        catalogById.clear();
        for (const entry of catalog) catalogById.set(entry.id, entry);
      } catch {
        if (!stopped) {
          catalogReady = false;
          catalogFailed = true;
        }
      } finally {
        catalogLoading = false;
      }
      if (stopped) return;
      if (catalogReady) {
        lakePending = true;
        annotateAll();
        try {
          await tryLakeBatch();
        } catch {
        }
        lakePending = false;
        if (stopped) return;
        annotateAll();
      } else renderChromeIfDataChanged();
    }
    function onPageActive() {
      if (stopped || !pageIsActive()) return;
      if (catalogReady) {
        annotateAll();
        return;
      }
      if (!catalogLoading) void boot();
    }
    function teardown() {
      if (stopped) return;
      stopped = true;
      observer?.disconnect();
      observer = null;
      if (renderTimer) clearTimeout(renderTimer);
      renderTimer = null;
      if (pendingRenderTimer) clearTimeout(pendingRenderTimer);
      pendingRenderTimer = null;
      if (lakeRetryTimer) clearTimeout(lakeRetryTimer);
      lakeRetryTimer = null;
      if (followUpTimer) clearTimeout(followUpTimer);
      followUpTimer = null;
      stopProgressTimer();
      void flushSalesDb();
      queue.clear();
      document.removeEventListener("visibilitychange", onPageActive);
      document.removeEventListener("click", onPageInteract, true);
      window.removeEventListener("focus", onPageActive);
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("resize", onViewportResize);
      window.removeEventListener("orientationchange", onViewportResize);
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = null;
      document.removeEventListener(OWNER_EVENT, onNewOwner);
      document.querySelectorAll(`.${BADGE_CLASS}`).forEach((node) => node.remove());
      document.querySelectorAll(`[${BADGE_ATTR}]`).forEach((node) => node.removeAttribute(BADGE_ATTR));
      document.documentElement?.classList.remove("cx-badge-sm", "cx-badge-lg");
      host.remove();
      document.getElementById(STYLE_ID)?.remove();
    }
    function onPageHide() {
      teardown();
    }
    let resizeTimer = null;
    function onViewportResize() {
      if (stopped) return;
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        resizeTimer = null;
        if (stopped) return;
        applyPrefs();
      }, 150);
    }
    function onPageInteract(event) {
      const target = event.target;
      if (target && target.nodeType === 1 && target.closest?.(`#${ROOT_ID}`)) return;
      lastInteractionAt = Date.now();
      schedule(350);
    }
    function onNewOwner(event) {
      const version = event.detail?.version;
      if (version && compareVersions(version, UI_VERSION) >= 0) teardown();
    }
    ensureFont();
    injectStyle();
    enforceSingleRoot();
    applyPrefs();
    observer = new MutationObserver((mutations) => {
      if (stopped) return;
      for (const m of mutations) {
        const t = m.target;
        if (t && t.nodeType === 1 && (t.closest?.(`.${BADGE_CLASS}`) || t.id === ROOT_ID)) continue;
        schedule(300);
        return;
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    document.addEventListener("visibilitychange", onPageActive);
    document.addEventListener(OWNER_EVENT, onNewOwner);
    document.addEventListener("click", onPageInteract, true);
    window.addEventListener("focus", onPageActive);
    window.addEventListener("pagehide", onPageHide, { once: true });
    window.addEventListener("resize", onViewportResize);
    window.addEventListener("orientationchange", onViewportResize);
    void boot();
  }
  var AUCTION_PATH = "/amarket.php";
  var NAV_POLL_MS = 500;
  function unmountAuctionUi() {
    if (!document.querySelector(`#${ROOT_ID}`)) return;
    document.dispatchEvent(new CustomEvent(OWNER_EVENT, { detail: { version: UI_VERSION } }));
    document.querySelectorAll(`#${ROOT_ID}`).forEach((node) => node.remove());
    document.getElementById(STYLE_ID)?.remove();
  }
  function syncToLocation() {
    if (location.pathname === AUCTION_PATH) main();
    else unmountAuctionUi();
  }
  var lastHref = location.href;
  function onNavigation() {
    if (location.href === lastHref) return;
    lastHref = location.href;
    syncToLocation();
  }
  var navTimer = null;
  function watchNavigation() {
    const w = window;
    if (w.__cxAuctionRouter && compareVersions(w.__cxAuctionRouter, UI_VERSION) >= 0) return;
    w.__cxAuctionRouter = UI_VERSION;
    window.addEventListener("popstate", onNavigation);
    window.addEventListener("hashchange", onNavigation);
    navTimer = setInterval(onNavigation, NAV_POLL_MS);
    window.addEventListener(
      "pagehide",
      () => {
        if (navTimer) clearInterval(navTimer);
        navTimer = null;
        w.__cxAuctionRouter = void 0;
      },
      { once: true }
    );
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      watchNavigation();
      syncToLocation();
    });
  } else {
    watchNavigation();
    syncToLocation();
  }
})();