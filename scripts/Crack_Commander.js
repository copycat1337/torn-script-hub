// ==UserScript==
// @name         WoJ: Crack Commander
// @namespace    https://torn.mcgarvie.net/userscripts/crack-commander
// @description  Advanced cracking assistant with dictionary intelligence, difficulty analysis, nerve planning, profit per nerve, CS boosting picks, BFS estimation, rig advisor, and community password sharing.
// @version      1.3.3
// @author       themcgarvie (WolfOfJedah [3317459])
// @license      MIT
// @match        https://www.torn.com/loader.php?sid=crimes*
// @match        https://www.torn.com/page.php?sid=crimes*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=torn.com
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @connect      gitlab.com
// @connect      torn.mcgarvie.net
// @downloadURL https://update.greasyfork.org/scripts/581928/WoJ%3A%20Crack%20Commander.user.js
// @updateURL https://update.greasyfork.org/scripts/581928/WoJ%3A%20Crack%20Commander.meta.js
// ==/UserScript==

(async function () {
    'use strict';

    if (window.CRACK_COMMANDER_INJECTED) return;
    window.CRACK_COMMANDER_INJECTED = true;

    // ============================================================
    // Config
    // ============================================================

    const debug = false;
    const MIN_LENGTH = 4;
    const MAX_LENGTH = 10;

    const WORDLIST_URL =
        'https://gitlab.com/kalilinux/packages/seclists/-/raw/kali/master/Passwords/Common-Credentials/Pwdb_top-1000000.txt?ref_type=heads';

    const DOWNLOAD_MIN_DELTA       = 20;
    const CF_WORKER_ORIGIN = 'https://torn.mcgarvie.net/endpoints/crack';
    const CF_ADD_WORD_URL = `${CF_WORKER_ORIGIN}/submit.php`;
    const CF_STORAGE_BASE = `${CF_WORKER_ORIGIN}/words`;
    const METADATA_URL = `${CF_STORAGE_BASE}/metadata.php`;

    const SYNC_MIN_INTERVAL_MS     = 12 * 60 * 60 * 1000;
    const META_RETRY_MS            = 60 * 60 * 1000;       // after a failed metadata fetch
    const OUTBOX_FLUSH_INTERVAL_MS = 60 * 1000;            // collect words before posting
    const OUTBOX_POST_INTERVAL_MS  = 5000;
    const OUTBOX_BATCH_SIZE        = 50;                   // server max per request
    const OUTBOX_MAX_SIZE          = 500;
    const OUTBOX_BACKOFF_MIN_MS    = 60 * 1000;
    const OUTBOX_BACKOFF_MAX_MS    = 6 * 60 * 60 * 1000;
    const OUTBOX_REFUSED_PAUSE_MS  = 24 * 60 * 60 * 1000;  // 401/403/404/410 from the endpoint

    const SCRIPT_VERSION = (typeof GM_info !== 'undefined' && GM_info.script?.version) || 'unknown';

    const DB_NAME             = 'crack_commander';
    const STORE_NAME          = 'commander_dictionary';
    const EXCL_STORAGE_PREFIX = 'crackcommander_excl_';

    // Preference keys
    const PREF_SHOW_BADGE          = 'crackcommander_show_badge';
    const PREF_THEME               = 'crackcommander_theme';
    const PREF_SUG_FONT_PX         = 'crackcommander_sug_font_px';
    const PREF_SUG_TEXT_COLOR      = 'crackcommander_sug_text_color';
    const PREF_SUG_BG_COLOR        = 'crackcommander_sug_bg_color';
    const PREF_SHOW_ON_COMPLETE    = 'crackcommander_show_sug_on_complete';
    const PREF_SHOW_ADV_COLORS     = 'crackcommander_show_advanced_opt_color';
    const PREF_MAX_SUGGESTIONS     = 'crackcommander_max_suggestions_size';
    const PREF_DIFF_ENABLED        = 'crackcommander_diff_enabled';
    const PREF_NERVE_MODE          = 'crackcommander_nerve_mode';
    const PREF_STRATEGY_MODE        = 'crackcommander_strategy_mode';
    const PREF_DIFF_PANEL_STYLE     = 'crackcommander_diff_panel_style';
    const PREF_PICK_MODE            = 'crackcommander_pick_mode';   // 'profit' | 'cs'

    // Suggestion panel theme presets (only sug panel is theme-controlled now)
    const THEME_PRESETS = {
        dark:  { sugBg: '#000',  sugText: '#0f0',    border: '#0f0' },
        light: { sugBg: '#fff',  sugText: '#03396c', border: '#39ace7' },
    };

    // Difficulty colours
    const crackingHash = '#/cracking';
    const NERVE_MODES = {
        brute_only:           { label: 'Brute nerve only' },
        brute_plus_crack:     { label: 'Brute + crack' },
        remaining_brute_only: { label: 'Remaining brute only' },
    };
    const STRATEGY_MODES = {
        profit:       { label: 'Profit / nerve saver', hint: 'Guess when dictionary confidence is good; brute-force only what remains.' },
        efficient_cs: { label: 'Efficient CS',          hint: 'Reveal enough to crack; final crack is the efficient CS action.' },
        fast_cs:      { label: 'Fast CS',               hint: 'Brute-force more aggressively for faster CS, accepting worse nerve efficiency.' },
    };
    const TARGET_COMPLEXITY = {
        'ex-husband': 1, 'ex-wife': 1, 'ex-boyfriend': 1, 'ex-girlfriend': 1,
        'colleague': 1, 'friend': 1, 'online adversary': 1, 'neighbor': 1,
        'romantic interest': 1, 'informant': 1, 'juror': 1,
        'hacker': 1, 'police officer': 1,
        'doctor': 2, 'judge': 2, 'government official': 2, 'politician': 2,
        'pornography network': 2, 'campus network': 2, 'health service': 2,
        'games developer': 2, 'rival corporation': 2, 'crime syndicate': 2,
        'police department': 2,
        'government': 3, 'internet service provider': 3, 'armed forces': 3,
        'intelligence agency': 3,
    };
    const COMPLEXITY_DETAILS = {
        1: { code: 'C1', desc: 'Dictionary password', tip: 'C1 = Known password list entry', color: '#37b24d' },
        2: { code: 'C2', desc: 'Dictionary + suffix/prefix', tip: 'C2 = Password list entry with additions', color: '#f59f00' },
        3: { code: 'C3', desc: 'Brute-force likely', tip: 'C3 = Random / unknown password', color: '#f03e3e' },
    };
    const UNKNOWN_COMPLEXITY_DETAIL = { code: 'C?', desc: 'Unknown password pattern', tip: 'Complexity could not be detected for this target', color: '#adb5bd' };
    // Average payout per completed crack, by target type → targeted service.
    // Source: community cracking payout sheet (docs.google.com/spreadsheets/d/13wUFhhssuPdAONI_OmRJi6l_Bs7KRZXDgVFCn7uJJNQ).
    const TARGET_PAYOUTS = {
        'ex-wife': { 'video streaming service': 19366, 'legal advice portal': 25184, 'work email account': 19879, 'online payment service': 24775, 'personal blog': 15115, 'online therapy account': 15293 },
        'ex-husband': { 'personal email account': 15196, 'stock trading platform': 24876, 'cryptocurrency exchange': 24895, 'escort service website': 19880, 'online pharmacy account': 14842, 'porn site': 19852 },
        'ex-girlfriend': { 'music streaming service': 14932, 'home router access': 24991, 'clothing store account': 25307, 'fitness tracker': 15083, 'political party hub': 25290, 'game streaming account': 14931 },
        'ex-boyfriend': { 'online bank account': 25115, 'social network profile': 15162, 'dating site': 15251, 'online auction account': 24854, 'offshore investment account': 24836, 'online gambling account': 15147 },
        'romantic interest': { 'social media account': 25068, 'cloud storage bucket': 20096, 'cellphone provider': 14936, 'calendar app': 14939, 'online wishlist': 25036, 'university network authentication': 20089 },
        'colleague': { 'business communications platform': 19939, 'cryptocurrency exchange': 24818, 'cloud storage bucket': 20027, 'portfolio website': 19851, 'personal website': 20247, 'fantasy sports account': 15043, 'work email account': 24908 },
        'friend': { 'video game storefront': 19991, 'instant messenger': 19784, 'takeout delivery app': 15208, 'video calling app': 20179, 'online forum account': 15407, 'mmorpg account': 20025 },
        'neighbor': { 'home wi-fi network': 15292, 'hoa records': 15001, 'home security system': 19688, 'smart pet feeder': 15184, 'smart heating controls': 15107, 'nanny-cam access': 19618 },
        'online adversary': { 'online rpg account': 20144, 'remote pc access': 24765, 'image board account': 20293, 'crowdfunding account': 15341, 'search engine history': 15235 },
        'informant': { 'home network access': 34815, 'high school records': 39882, 'dental records': 35220, 'cellphone call history': 39976, 'online bank account': 44861, 'personal email account': 35194 },
        'juror': { 'mental health records': 45278, 'work disciplinary records': 35214, 'community q&a site': 35630, 'online photo collection': 34796, 'webcam network access': 45150, 'home security system': 40076 },
        'hacker': { 'stolen password repository': 60015, 'stolen credit card repository': 99566, 'vpn provider authentication': 120689, 'gore website': 60345, 'dark web storefront': 150787, 'software development hub': 124309, 'proxy server access': 60428, 'botnet command module': 84748, 'cryptocurrency mining cluster': 124924 },
        'police officer': { 'training records': 51085, 'drug test results': 80639, 'mental health records': 49604, 'personal email account': 59536 },
        'doctor': { 'prescription generating software': 42155, 'patient database': 69630, 'mortuary records': 119841 },
        'judge': { 'secure filing system': 59247, 'court docket library': 60227, 'sentencing history database': 50529, 'criminal records archive': 65404, 'personal email account': 78661 },
        'government official': { 'private email account': 80980, 'online filing system': 90029, 'government email account': 90012, 'document storage platform': 101025, 'home printer cache': 114711 },
        'politician': { 'private email account': 70602, 'offshore tax account': 109332, 'union membership forum': 70104, 'voicemail account': 74693, 'lobbying minutes archive': 89364 },
        'pornography network': { 'master password': 119528, 'credit card records': 125512, 'video comments log': 98738 },
        'campus network': { 'student grade records': 80279, 'student personal records': 69679, 'network superadmin authentication': 155219, 'enrollment documentation archive': 69718, 'student loan ledger': 115223 },
        'health service': { 'patient directory': 120331, 'medical records database': 134552, 'coroner post-mortem records': 124306, 'malpractice reports archive': 89263 },
        'games developer': { 'reward code directory': 101205, 'pre-release media bucket': 104195, 'version control system': 70262, 'source code repository': 99879, 'forum administrator access': 90452, 'payment processing portal': 134568 },
        'rival corporation': { 'client directory': 154715, 'research & development databank': 102516, 'sales ledger': 139892, 'patent filing catalog': 124125, 'digital storage platform': 98154, 'business communications platform': 119804, 'api gateway': 115756, 'corporate bank account': 198579 },
        'crime syndicate': { 'encrypted target list': 155120, 'slush fund account': 298612, 'sensitive financial ledger': 150976, 'foreign exchange account': 250141, 'secure communications channel': 173729, 'encrypted file sharing platform': 122919 },
        'police department': { 'bodycam footage repository': 176282, 'surveillance records': 150146, 'surveillance network access': 225576, 'arrest records': 152807, 'warrant database': 177276, 'people of interest list': 196157, 'vacated properties register': 177018, 'officer training records': 126330, 'dna database': 229355 },
        'internet service provider': { 'load balancing controller': 237956, 'vrf router': 275120, 'stacked network switch': 223663, 'multi cluster ingress': 257400, 'cross connect ingress': 210068, 'cookie log': 192935 },
        'government': { 'national archive': 197760, 'birth records': 199527, 'voting records': 226334, 'immigration records': 174694, 'political donations ledger': 247790, 'witness protection directory': 424829, 'secure data-sharing portal': 246367, 'import / export records': 207451, 'crime statistics database': 264880 },
        'armed forces': { 'internal network firewall': 599635, 'edge firewall': 475582, 'endpoint detection': 447092, 'contractor supply database': 550150, 'reconnaissance archive': 503103, 'mission report log': 499181, 'enhanced interrogation archive': 703388, 'military personnel records': 441809 },
        'intelligence agency': { 'primary load balancer': 499858, 'security mainframe': 548544, 'cell phone record database': 588792, 'primary access terminal': 845135, 'terrorist watch list': 503929, 'foreign intelligence records': 495902, 'encrypted communication channel': 702534, 'level 3 security authentication': 556625 },
    };
    const DIFF_PANEL_STYLES = {
        detailed: { label: 'Detailed' },
        compact:  { label: 'Compact' },
    };

    function getNerveMode() {
        const mode = getStrPref(PREF_NERVE_MODE, 'brute_plus_crack');
        return Object.prototype.hasOwnProperty.call(NERVE_MODES, mode) ? mode : 'brute_plus_crack';
    }
    function getStrategyMode() {
        const mode = getStrPref(PREF_STRATEGY_MODE, 'profit');
        return Object.prototype.hasOwnProperty.call(STRATEGY_MODES, mode) ? mode : 'profit';
    }
    // Pick mode decides what the highlighted targets optimise for:
    //   profit — $ per nerve / biggest payout / cheapest (original behaviour)
    //   cs     — CS boosting: most cracks per nerve bar / hardest per nerve
    function getPickMode() {
        return getStrPref(PREF_PICK_MODE, 'profit') === 'cs' ? 'cs' : 'profit';
    }
    function getDiffPanelStyle() {
        const style = getStrPref(PREF_DIFF_PANEL_STYLE, 'detailed');
        return Object.prototype.hasOwnProperty.call(DIFF_PANEL_STYLES, style) ? style : 'detailed';
    }
    const DIFF_COLORS = {
        OneAttempt:  '#37b24d',
        ThreeOrLess: '#74b816',
        FiveOrLess:  '#f59f00',
        SevenOrLess: '#f76707',
        TenOrLess:   '#f03e3e',
        MoreThanTen: '#7048e8',
    };

    // ============================================================
    // State
    // ============================================================

    let dict              = [];
    let dictLoaded        = false;
    let dictLoading       = false;
    let remoteWords       = new Set();
    let statusEl          = null;
    let menuBtnInjected   = false;   // set once — no more polling after injection
    let outboxFlushTimer  = null;
    let lastOutboxPost    = 0;
    let isOnCrackingPage  = false;

    // Best-target pick: nerve is read once on first load and kept fixed.
    let nerveAtLoad         = null;
    let targetPicks         = null;        // { best, big, quick, kind } — target keys
    const seenTargets       = new Map();   // target key → { tier, cost, payout, ppn, started }

    // Rig Advisor estimator: survives panel rebuilds when Torn remounts the rig.
    let visibleMaxCycles    = 0;           // hardest mounted target, for prefill
    let rigEstCycles        = null;        // user-entered cycles; null = auto
    let rigEstOpen          = false;
    let lastRigMips         = null;        // for per-target tooltip comparisons
    const targetFullCycles  = new Map();   // target key → whole-password cycles, for a stable $/N

    const prevRowStates     = new Map();
    const panelUpdateTimers = new Map();
    const LAST_INPUT        = { key: null, time: 0 };
    const isMobileView      = window.innerWidth <= 784;
    const __statusSinks     = new Set();

    // ============================================================
    // Styles
    // ============================================================

    GM_addStyle(`
        /* ── Difficulty line (replaces the target subtitle) ──
           Torn's cracking list is virtualised at a fixed row height, so
           everything here must fit inside the native row: growing rows
           makes Torn mount the wrong rows and the list jumps. */
        .cc-diff-line {
            display: flex;
            align-items: center;
            gap: 5px;
            min-width: 0;
            max-width: 100%;
            padding-left: 5px;
            box-sizing: border-box;
            font-family: Arial, sans-serif;
            font-size: 11px;
            line-height: 1.3;
            font-weight: 700;
            color: #e9ecef;
            white-space: nowrap;
        }
        .cc-diff-line .cc-stats {
            min-width: 0;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        .cc-diff-line .cc-c   { font-weight: 800; cursor: help; }
        .cc-diff-line .cc-payout { color: #fff; font-weight: 800; }
        .cc-diff-line .cc-profit { color: #8ce99a; font-weight: 800; }
        .cc-diff-line .cc-sep { opacity: 0.55; }
        .cc-diff-line .cc-sug-badge {
            flex-shrink: 0;
            padding: 0 4px;
            border-radius: 3px;
            background: rgba(255,255,255,0.10);
            cursor: pointer;
            font-weight: 700;
        }
        .cc-diff-line .cc-sug-badge:empty { display: none; }
        .cc-diff-line .cc-tag {
            flex-shrink: 0;
            padding: 0 4px;
            border-radius: 3px;
            font-size: 10px;
            font-weight: 800;
            color: #111;
        }
        .cc-diff-line .cc-tag:empty { display: none; }
        .cc-diff-line .cc-tag.best    { background: #37b24d; }
        .cc-diff-line .cc-tag.big     { background: #b197fc; }
        .cc-diff-line .cc-tag.quick   { background: #4dabf7; }
        .cc-diff-line .cc-tag.started { background: #f59f00; }
        .cc-diff-line .cc-tags { display: flex; gap: 3px; flex-shrink: 0; }
        .cc-diff-line .cc-tags:empty { display: none; }

        /* Row highlights: an overlay pseudo-element drawn above Torn's own
           child backgrounds; it takes no space, so row height never changes. */
        .cc-best > .crime-option, .cc-best > div[class*=crimeOption___],
        .cc-big > .crime-option, .cc-big > div[class*=crimeOption___],
        .cc-quick > .crime-option, .cc-quick > div[class*=crimeOption___],
        .cc-started > .crime-option, .cc-started > div[class*=crimeOption___] {
            position: relative !important;
        }
        .cc-best > .crime-option::after, .cc-best > div[class*=crimeOption___]::after,
        .cc-big > .crime-option::after, .cc-big > div[class*=crimeOption___]::after,
        .cc-quick > .crime-option::after, .cc-quick > div[class*=crimeOption___]::after,
        .cc-started > .crime-option::after, .cc-started > div[class*=crimeOption___]::after {
            content: '';
            position: absolute;
            inset: 0;
            pointer-events: none;
            z-index: 5;
            border-radius: inherit;
        }
        .cc-best > .crime-option::after, .cc-best > div[class*=crimeOption___]::after {
            box-shadow: inset 0 0 0 2px #37b24d, inset 0 0 22px rgba(55,178,77,0.35);
        }
        .cc-big > .crime-option::after, .cc-big > div[class*=crimeOption___]::after {
            box-shadow: inset 0 0 0 2px #b197fc, inset 0 0 22px rgba(177,151,252,0.30);
        }
        .cc-quick > .crime-option::after, .cc-quick > div[class*=crimeOption___]::after {
            box-shadow: inset 0 0 0 2px #4dabf7, inset 0 0 22px rgba(77,171,247,0.30);
        }
        /* BEST wins the outline when a row has several picks. */
        .cc-best > .crime-option::after, .cc-best > div[class*=crimeOption___]::after {
            box-shadow: inset 0 0 0 2px #37b24d, inset 0 0 22px rgba(55,178,77,0.35);
        }
        .cc-started > .crime-option::after, .cc-started > div[class*=crimeOption___]::after {
            box-shadow: inset 4px 0 0 #f59f00, inset 0 0 0 1px rgba(245,159,0,0.55);
        }
        .cc-diff-line .cc-sug-badge:hover { background: rgba(255,255,255,0.22); }
        .cc-diff-line[data-has-tip] .cc-stats { cursor: help; }
        .cc-diff-line .cc-info {
            flex-shrink: 0;
            color: #74c0fc;
            opacity: 0.75;
            cursor: help;
            font-weight: 400;
        }
        .cc-diff-line .cc-info:hover { opacity: 1; }
        .cc-diff-line:not([data-has-tip]) .cc-info { display: none; }
        @media only screen and (max-width: 784px) {
            .cc-diff-line { font-size: 9px; gap: 3px; }
        }

        /* ── Target tooltip (lives in <body>, outside the list) ── */
        .cc-tip {
            position: fixed;
            z-index: 2147483001;
            display: none;
            box-sizing: border-box;
            width: 290px;
            max-width: calc(100vw - 16px);
            padding: 10px 12px;
            font: 12px/1.4 Arial, Helvetica, sans-serif;
            color: #e9ecef;
            background: linear-gradient(180deg, rgba(16,22,28,0.98), rgba(10,14,18,0.98));
            border: 1px solid rgba(255,255,255,0.22);
            border-left: 3px solid var(--cc-tip-accent, #3498db);
            border-radius: 8px;
            box-shadow: 0 12px 32px rgba(0,0,0,0.65);
            pointer-events: none;
        }
        .cc-tip.open { display: block; }
        .cc-tip * { box-sizing: border-box; }
        .cc-tip .cc-tip-head { display: flex; align-items: center; gap: 8px; }
        .cc-tip .cc-tip-code {
            padding: 1px 6px;
            border-radius: 4px;
            font-weight: 900;
            color: #111;
            background: var(--cc-tip-accent, #3498db);
        }
        .cc-tip .cc-tip-title { font-size: 13px; font-weight: 800; }
        .cc-tip .cc-tip-sub { margin-top: 2px; color: #a9b4bd; font-size: 11px; }
        .cc-tip .cc-tip-section {
            margin: 10px 0 4px;
            padding-top: 8px;
            border-top: 1px solid rgba(255,255,255,0.12);
            color: #74c0fc;
            font-size: 10px;
            font-weight: 900;
            text-transform: uppercase;
            letter-spacing: 0.07em;
            display: flex;
            justify-content: space-between;
        }
        .cc-tip .cc-tip-section span { color: #a9b4bd; letter-spacing: 0; text-transform: none; font-weight: 700; }
        .cc-tip .cc-tip-grid {
            display: grid;
            grid-template-columns: auto 1fr;
            gap: 3px 12px;
        }
        .cc-tip .cc-tip-grid > :nth-child(odd) { color: #a9b4bd; }
        .cc-tip .cc-tip-grid > :nth-child(even) { text-align: right; font-weight: 800; }
        .cc-tip .cc-tip-grid small { color: #a9b4bd; font-weight: 500; }
        .cc-tip .cc-tip-mips {
            display: grid;
            grid-template-columns: auto auto 1fr auto;
            gap: 2px 10px;
            font-variant-numeric: tabular-nums;
        }
        .cc-tip .cc-tip-mips > .hdr { color: #a9b4bd; font-size: 10px; font-weight: 700; }
        .cc-tip .cc-tip-mips > .num { text-align: right; }
        .cc-tip .cc-tip-mips > .mips { text-align: right; font-weight: 800; }
        .cc-tip .cc-tip-mips > .have { text-align: right; font-weight: 800; }
        .cc-tip .cc-tip-ok   { color: #37b24d; }
        .cc-tip .cc-tip-need { color: #f59f00; }
        .cc-tip .cc-tip-advice {
            margin-top: 10px;
            padding: 6px 8px;
            color: #dfffe5;
            background: rgba(44,160,68,0.14);
            border: 1px solid rgba(103,217,111,0.35);
            border-radius: 6px;
            font-weight: 700;
        }
        .cc-tip .cc-tip-foot { margin-top: 6px; color: #868e96; font-size: 10px; }

        /* ── Suggestions popover (lives in <body>, outside the list) ── */
        .__crackcommander_panel.cc-sug-pop {
            position: fixed !important;
            z-index: 2147483000 !important;
            display: none;
            max-width: 320px;
            padding: 5px 6px !important;
            border-radius: 6px;
            box-shadow: 0 4px 14px rgba(0,0,0,0.55);
            text-align: left !important;
            line-height: 1.5;
        }
        .__crackcommander_panel.cc-sug-pop.open { display: block; }

        /* ── Rig advisor ───────────────────────────────────── */
        .cc-rig-advisor {
            margin-top: 8px;
            padding: 7px 10px;
            box-sizing: border-box;
            width: 100%;
            display: block;
            clear: both;
            font-family: Arial, sans-serif;
            font-size: 10px;
            line-height: 1.25;
            font-weight: 700;
            color: #e9ecef;
            background: rgba(0,0,0,0.24);
            border: 1px solid rgba(255,255,255,0.10);
            border-left: 3px solid #3498db;
            border-radius: 4px;
        }
        div.crime-root.cracking-root .cc-rig-expanded {
            overflow: visible !important;
        }
        div.crime-root.cracking-root .cc-rig-expanded > div[class^=rig___],
        div.crime-root.cracking-root .cc-rig-expanded > div[class*=rig___] {
            overflow: visible !important;
        }
        .cc-rig-advisor .cc-rig-line {
            display: flex;
            flex-wrap: wrap;
            gap: 5px;
            align-items: center;
            margin: 1px 0;
        }
        .cc-rig-advisor .cc-rig-title { color: #74c0fc; font-size: 11px; }
        .cc-rig-advisor .cc-rig-safe { color: #37b24d; }
        .cc-rig-advisor .cc-rig-warn { color: #f59f00; }
        .cc-rig-advisor .cc-rig-bad  { color: #f03e3e; }
        .cc-rig-advisor .cc-rig-muted { opacity: 0.72; }
        .cc-rig-advisor .cc-sep { opacity: 0.55; }
        .cc-rig-advisor .cc-rig-est { margin-top: 2px; }
        .cc-rig-advisor .cc-rig-est > summary { cursor: pointer; list-style: none; }
        .cc-rig-advisor .cc-rig-est > summary::-webkit-details-marker { display: none; }
        .cc-rig-advisor .cc-rig-est > summary::before { content: '▸ '; opacity: 0.7; }
        .cc-rig-advisor .cc-rig-est[open] > summary::before { content: '▾ '; }
        .cc-rig-advisor .cc-rig-est-body { padding: 3px 0 0 10px; }
        .cc-rig-advisor .cc-rig-est input {
            width: 56px;
            font: inherit;
            color: inherit;
            background: rgba(0,0,0,0.3);
            border: 1px solid rgba(255,255,255,0.18);
            border-radius: 3px;
            padding: 1px 4px;
        }
        .cc-rig-advisor .cc-rig-support {
            margin-top: 6px;
            padding-top: 5px;
            border-top: 1px solid rgba(255,255,255,0.10);
        }
        .cc-rig-advisor .woj-btn {
            all: unset;
            cursor: pointer;
            padding: 1px 7px;
            border-radius: 4px;
            background: rgba(255,255,255,0.08);
            border: 1px solid rgba(255,255,255,0.15);
            font-weight: 700;
            color: #e9ecef;
            transition: background 0.15s;
        }
        .cc-rig-advisor .woj-btn:hover { background: rgba(255,255,255,0.16); }
        .cc-rig-advisor .woj-btn-donate:hover { color: #37b24d; }
        .cc-rig-advisor a:not(.woj-btn) { color: #74c0fc; text-decoration: none; }
        .cc-rig-advisor a:not(.woj-btn):hover { text-decoration: underline; }
        @media only screen and (max-width: 784px) {
            .cc-rig-advisor { font-size: 9px; padding: 5px 6px; }
            .cc-rig-advisor .cc-rig-title { font-size: 10px; }
        }

        /* ── Status badge ─────────────────────────────────── */
        #__crackcommander_status {
            position: fixed;
            right: 10px;
            bottom: 40px;
            z-index: 10000;
            padding: 5px 12px;
            font-size: 11px;
            font-family: Arial, sans-serif;
            font-weight: 700;
            color: #fff;
            background: rgba(15, 15, 18, 0.92);
            border: 1px solid rgba(255, 255, 255, 0.15);
            border-radius: 6px;
            box-shadow: 0 2px 6px rgba(0,0,0,0.4);
            letter-spacing: 0.2px;
            opacity: 0.9;
        }

        /* ── Menu trigger button ──────────────────────────── */
        #__crackcommander_menu_btn {
            display: inline-flex !important;
            align-items: center !important;
            gap: 6px !important;
            font-size: 12px !important;
            font-weight: 700 !important;
            font-family: Arial, sans-serif !important;
            color: #fff !important;
            background: rgba(15, 15, 18, 0.92) !important;
            border: 1px solid rgba(255, 255, 255, 0.15) !important;
            border-radius: 6px !important;
            padding: 5px 12px !important;
            cursor: pointer !important;
            z-index: 9999 !important;
            letter-spacing: 0.2px !important;
            box-shadow: 0 2px 6px rgba(0,0,0,0.4) !important;
            transition: background 0.15s, border-color 0.15s !important;
        }
        #__crackcommander_menu_btn:hover {
            background: rgba(40, 40, 48, 0.97) !important;
            border-color: rgba(255, 255, 255, 0.28) !important;
        }

        /* ── Pick mode toggle (Profit ⇄ CS boost) ─────────── */
        #__crackcommander_mode_btn {
            display: inline-flex !important;
            align-items: center !important;
            margin-left: 6px !important;
            padding: 0 !important;
            font-size: 12px !important;
            font-weight: 700 !important;
            font-family: Arial, sans-serif !important;
            background: rgba(15, 15, 18, 0.92) !important;
            border: 1px solid rgba(255, 255, 255, 0.15) !important;
            border-radius: 6px !important;
            overflow: hidden !important;
            cursor: pointer !important;
            box-shadow: 0 2px 6px rgba(0,0,0,0.4) !important;
            vertical-align: middle !important;
        }
        #__crackcommander_mode_btn > span {
            padding: 5px 10px !important;
            color: rgba(255,255,255,0.45) !important;
            transition: background 0.15s, color 0.15s !important;
        }
        #__crackcommander_mode_btn[data-mode="profit"] > .cc-mode-profit {
            background: #2b8a3e !important; color: #fff !important;
        }
        #__crackcommander_mode_btn[data-mode="cs"] > .cc-mode-cs {
            background: #1971c2 !important; color: #fff !important;
        }
        #__crackcommander_mode_btn:hover > span:not(.cc-on) { color: rgba(255,255,255,0.8) !important; }

        /* ── Settings overlay ─────────────────────────────── */
        #cc-settings-overlay {
            position: fixed;
            top: 0; left: 0;
            width: 100vw; height: 100vh;
            background: rgba(0, 0, 0, 0.75);
            z-index: 2147483647;
            display: none;
            align-items: center;
            justify-content: center;
        }
        #cc-settings-overlay.active { display: flex; }

        #cc-settings {
            background: #1a1a1d;
            border: 1px solid rgba(255, 255, 255, 0.15);
            border-radius: 10px;
            box-shadow: 0 16px 48px rgba(0, 0, 0, 0.65);
            width: 90vw;
            max-width: 520px;
            max-height: 85vh;
            overflow: hidden;
            display: flex;
            flex-direction: column;
            font: 12px/1.4 Arial, sans-serif;
            color: #fff;
        }
        #cc-settings .cc-set-header {
            padding: 14px 16px;
            background: rgba(255, 255, 255, 0.04);
            border-bottom: 1px solid rgba(255, 255, 255, 0.1);
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        #cc-settings .cc-set-title { font-weight: 700; font-size: 14px; }
        #cc-settings .cc-set-body {
            padding: 16px;
            overflow-y: auto;
            flex: 1;
        }
        #cc-settings .cc-set-body::-webkit-scrollbar       { width: 8px; }
        #cc-settings .cc-set-body::-webkit-scrollbar-track { background: rgba(255,255,255,0.04); }
        #cc-settings .cc-set-body::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.15); border-radius: 4px; }
        #cc-settings .cc-set-footer {
            padding: 12px 16px;
            background: rgba(255, 255, 255, 0.02);
            border-top: 1px solid rgba(255, 255, 255, 0.1);
            display: flex;
            gap: 10px;
            justify-content: flex-end;
            flex-wrap: wrap;
        }
        #cc-settings .cc-group       { margin-bottom: 20px; }
        #cc-settings .cc-group-title {
            font-weight: 700;
            font-size: 11px;
            margin-bottom: 10px;
            text-transform: uppercase;
            letter-spacing: 0.3px;
            padding-bottom: 5px;
            border-bottom: 1px solid rgba(255, 255, 255, 0.08);
        }
        #cc-settings .cc-setting-item {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 10px 12px;
            margin: 6px 0;
            background: rgba(255, 255, 255, 0.04);
            border: 1px solid rgba(255, 255, 255, 0.08);
            border-radius: 6px;
            gap: 12px;
        }
        #cc-settings .cc-setting-label { font-size: 12px; opacity: 0.95; }
        #cc-settings .cc-setting-desc  { font-size: 10px; opacity: 0.6; margin-top: 2px; }
        #cc-settings input[type="text"],
        #cc-settings input[type="number"],
        #cc-settings select {
            all: unset;
            background: rgba(255, 255, 255, 0.08);
            border: 1px solid rgba(255, 255, 255, 0.12);
            border-radius: 5px;
            padding: 6px 10px;
            font-size: 12px;
            min-width: 100px;
            text-align: right;
            color: #fff;
            box-sizing: border-box;
        }
        #cc-settings input[type="text"]:focus,
        #cc-settings input[type="number"]:focus,
        #cc-settings select:focus {
            border-color: rgba(52, 152, 219, 0.6);
            outline: 2px solid rgba(52, 152, 219, 0.2);
        }
        #cc-settings input[type="checkbox"] {
            width: 16px; height: 16px;
            cursor: pointer;
            accent-color: #3498db;
            flex-shrink: 0;
        }
        #cc-settings .cc-btn {
            all: unset;
            cursor: pointer;
            padding: 8px 16px;
            border-radius: 6px;
            font-size: 12px;
            font-weight: 600;
            transition: all 0.15s;
            border: 1px solid rgba(255, 255, 255, 0.1);
        }
        #cc-settings .cc-btn.primary            { background: #3498db; border-color: #2980b9; color: #fff; }
        #cc-settings .cc-btn.primary:hover      { background: #2980b9; }
        #cc-settings .cc-btn.secondary          { background: rgba(255,255,255,0.08); color: #fff; }
        #cc-settings .cc-btn.secondary:hover    { background: rgba(255,255,255,0.14); }
        #cc-settings .cc-btn.danger             { background: rgba(231,76,60,0.18); border-color: rgba(231,76,60,0.4); color: #e74c3c; }
        #cc-settings .cc-btn.danger:hover       { background: rgba(231,76,60,0.32); }
        #cc-settings .cc-btn.close-x {
            all: unset;
            cursor: pointer;
            padding: 4px 9px;
            border-radius: 5px;
            background: rgba(255,255,255,0.08);
            border: 1px solid rgba(255,255,255,0.1);
            font-size: 11px;
            font-weight: 600;
            color: #fff;
            transition: background 0.15s;
        }
        #cc-settings .cc-btn.close-x:hover { background: rgba(255,255,255,0.18); }
        #cc-settings .cc-word-counts {
            font-size: 10px;
            opacity: 0.6;
            margin-top: 2px;
            white-space: pre-line;
            line-height: 1.6;
        }
    `);

    // ============================================================
    // Preference helpers
    // ============================================================

    function crackLog(...args) { if (debug) console.log('[CrackCommander]', ...args); }

    function getBoolPref(key, def = true) {
        const v = localStorage.getItem(key); return v === null ? def : v === '1';
    }
    function setBoolPref(key, val) { localStorage.setItem(key, val ? '1' : '0'); }
    function getStrPref(key, def = '') {
        const v = localStorage.getItem(key); return v === null ? def : String(v);
    }
    function setStrPref(key, val) { localStorage.setItem(key, String(val)); }
    function getIntPref(key, def = 0) {
        const v = localStorage.getItem(key);
        const n = v === null ? NaN : parseInt(v, 10);
        return Number.isFinite(n) ? n : def;
    }
    function setIntPref(key, val) {
        const n = Number(val);
        localStorage.setItem(key, String(Number.isFinite(n) ? Math.trunc(n) : 0));
    }

    // ============================================================
    // Suggestion panel theme  (only the sug panel is user-themed)
    // ============================================================

    function normalizeTheme(v) { return v === 'light' ? 'light' : 'dark'; }

    function getSugTheme() {
        const name = normalizeTheme(getStrPref(PREF_THEME, 'dark'));
        const p    = THEME_PRESETS[name];
        return {
            name,
            sugBg:    getStrPref(PREF_SUG_BG_COLOR,   p.sugBg),
            sugText:  getStrPref(PREF_SUG_TEXT_COLOR,  p.sugText),
            border:   p.border,
            fontPx:   getIntPref(PREF_SUG_FONT_PX, 10),
        };
    }

    function applyPreset(themeName) {
        const name = normalizeTheme(themeName);
        const p    = THEME_PRESETS[name];
        setStrPref(PREF_THEME, name);
        setStrPref(PREF_SUG_BG_COLOR,   p.sugBg);
        setStrPref(PREF_SUG_TEXT_COLOR, p.sugText);
        if (localStorage.getItem(PREF_SUG_FONT_PX) === null) setIntPref(PREF_SUG_FONT_PX, 10);
    }

    function styleSugSpan(sp) {
        const t = getSugTheme();
        sp.style.padding      = '2px 4px';
        sp.style.margin       = '0 2px';
        sp.style.display      = 'inline-block';
        sp.style.borderRadius = '3px';
        sp.style.fontSize     = `${t.fontPx}px`;
        sp.style.color        = t.sugText;
    }

    function applyPanelTheme(panel) {
        const t = getSugTheme();
        if (!panel) return;
        panel.style.background = t.sugBg;
        panel.style.color      = t.sugText;
        panel.style.fontSize   = `${t.fontPx}px`;
        panel.style.border     = `1px solid ${t.border}`;
        const listDiv = panel.querySelector(':scope > div');
        if (!listDiv) return;
        for (const child of Array.from(listDiv.children)) {
            if (child.dataset && child.dataset.kind === 'sug') styleSugSpan(child);
        }
    }

    function applyThemeEverywhere() {
        document.querySelectorAll('.__crackcommander_panel').forEach(applyPanelTheme);
    }

    // ============================================================
    // Status badge
    // ============================================================

    function ensureStatusBadge() {
        if (statusEl) return statusEl;
        statusEl = document.createElement('div');
        statusEl.id = '__crackcommander_status';
        statusEl.textContent = 'Dictionary: Idle';
        document.body.appendChild(statusEl);
        statusEl.style.display = getBoolPref(PREF_SHOW_BADGE, true) ? 'block' : 'none';
        return statusEl;
    }

    function registerStatusSink(el)   { if (el) __statusSinks.add(el); }
    function unregisterStatusSink(el) { if (el) __statusSinks.delete(el); }

    function setStatus(msg) {
        const text  = `Dictionary: ${msg}`;
        const badge = ensureStatusBadge();
        if (badge.textContent !== text) badge.textContent = text;
        __statusSinks.forEach(el => { if (el && el.textContent !== text) el.textContent = text; });
        crackLog('STATUS →', msg);
    }

    async function setStatusWithRemoteCount(prefix = 'Ready') {
        const remoteCount = await idbGet('cc_remote_count');
        const delta       = await idbGet('cc_pending_delta');
        const parts = [];
        if (remoteCount != null) parts.push(`remote: ${remoteCount}`);
        if (delta)               parts.push(`+${delta} pending`);
        setStatus(parts.length ? `${prefix} (${parts.join(', ')})` : prefix);
    }

    // ============================================================
    // Network helpers
    // ============================================================

    function gmRequest(opts) {
        return new Promise((resolve, reject) => {
            try {
                const safeOpts = Object.assign({}, opts);
                if (!safeOpts.responseType) safeOpts.responseType = 'text';
                safeOpts.headers = Object.assign({ Accept: 'application/json, text/plain, */*; q=0.1' }, safeOpts.headers || {});
                GM_xmlhttpRequest({ ...safeOpts, onload: resolve, onerror: reject, ontimeout: reject });
            } catch (err) { reject(err); }
        });
    }
    function getHeader(headers, name) {
        const m = headers && headers.match ? headers.match(new RegExp('^' + name + ':\\s*(.*)$', 'mi')) : null;
        return m ? m[1].trim() : null;
    }
    function isGzipPath(p) {
        try { return /\.gz$/i.test(String(p || '').split('?')[0]); } catch (_) { return false; }
    }
    async function gunzipArrayBufferToText(buf) {
        if (!buf) return '';
        if (typeof DecompressionStream !== 'function') throw new Error('DecompressionStream not supported.');
        const ds = new DecompressionStream('gzip');
        return await new Response(new Blob([buf]).stream().pipeThrough(ds)).text();
    }
    async function responseToText(res, pathOrUrl) {
        return isGzipPath(pathOrUrl) ? await gunzipArrayBufferToText(res.response) : (res.responseText || '');
    }
    function metadataURL(force = false) {
        return `${METADATA_URL}?cb=${force ? Date.now() : Math.floor(Date.now() / 60000)}`;
    }
    function formatShortDuration(ms) {
        if (ms <= 0) return 'now';
        const s = Math.floor(ms / 1000);
        const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600),
              m = Math.floor((s % 3600) / 60), sec = s % 60;
        if (d > 0) return `${d}d ${h}h ${m}m`;
        if (h > 0) return `${h}h ${m}m ${sec}s`;
        if (m > 0) return `${m}m ${sec}s`;
        return `${sec}s`;
    }

    // ============================================================
    // IndexedDB
    // ============================================================

    function openDB() {
        return new Promise((resolve, reject) => {
            const req = indexedDB.open(DB_NAME, 1);
            req.onupgradeneeded = () => {
                if (!req.result.objectStoreNames.contains(STORE_NAME)) req.result.createObjectStore(STORE_NAME);
            };
            req.onsuccess = () => resolve(req.result);
            req.onerror   = () => reject(req.error);
        });
    }
    async function idbSet(key, value) {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readwrite');
            tx.objectStore(STORE_NAME).put(value, key);
            tx.oncomplete = resolve; tx.onerror = () => reject(tx.error);
        });
    }
    async function idbGet(key) {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const tx  = db.transaction(STORE_NAME, 'readonly');
            const req = tx.objectStore(STORE_NAME).get(key);
            req.onsuccess = () => resolve(req.result);
            req.onerror   = () => reject(req.error);
        });
    }
    async function idbClear() {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readwrite');
            tx.objectStore(STORE_NAME).clear();
            tx.oncomplete = resolve; tx.onerror = () => reject(tx.error);
        });
    }
    async function clearLocalDictCache() {
        await idbClear();
        setStatus('Cache cleared — reload');
    }

    // ============================================================
    // Key capture
    // ============================================================

    document.addEventListener('keydown', e => {
        if (!e.key || !/^[A-Za-z0-9._]$/.test(e.key)) return;
        LAST_INPUT.key  = e.key.toUpperCase();
        LAST_INPUT.time = performance.now();
    }, true);

    // ============================================================
    // Dictionary loading
    // ============================================================

    function needReloadAfterBaseLoad() {
        try {
            if (sessionStorage.getItem('__crackcommander_base_reload_done') === '1') return false;
            sessionStorage.setItem('__crackcommander_base_reload_done', '1');
            return true;
        } catch { return false; }
    }

    async function commitBucketsToIDB(buckets) {
        for (const [lenStr, set] of Object.entries(buckets)) {
            const len      = parseInt(lenStr, 10);
            const existing = await idbGet(`len_${len}`) || [];
            const arr      = Array.from(new Set([...existing, ...set]));
            await idbSet(`len_${len}`, arr);
            dict[len] = arr;
        }
    }

    async function loadDict() {
        if (dictLoaded || dictLoading) return;
        dictLoading = true;

        // 1. Warm in-memory dict from IDB
        let anyFound = false;
        for (let len = MIN_LENGTH; len <= MAX_LENGTH; len++) {
            const chunk = await idbGet(`len_${len}`);
            if (chunk && chunk.length > 0) { dict[len] = chunk; anyFound = true; }
        }

        // 2. Attempt community sync (non-blocking on first load)
        await checkRemoteAndMaybeDownload(false).catch(() => {});

        // 3. Fall back to base wordlist only if IDB was empty
        if (!anyFound) {
            setStatus('Fetching base wordlist…');
            const DELAYS = [0, 3000, 8000, 20000];
            let ok = false, lastErr = null;
            for (let attempt = 0; attempt < DELAYS.length; attempt++) {
                try {
                    const res = await gmRequest({ method: 'GET', url: WORDLIST_URL, timeout: 120000, responseType: 'text' });
                    if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
                    setStatus('Indexing wordlist…');
                    const lines   = (res.responseText || '').split(/\r?\n/);
                    const buckets = {};
                    let processed = 0;
                    for (const raw of lines) {
                        const word = (raw || '').trim().toUpperCase();
                        if (!word || !/^[A-Z0-9_.]+$/.test(word)) continue;
                        const L = word.length;
                        if (L < MIN_LENGTH || L > MAX_LENGTH) continue;
                        if (!buckets[L]) buckets[L] = new Set();
                        buckets[L].add(word);
                        if (++processed % 5000 === 0) await new Promise(r => setTimeout(r, 0));
                    }
                    await commitBucketsToIDB(buckets);
                    ok = true;
                    break;
                } catch (e) {
                    lastErr = e;
                    const wait = DELAYS[attempt];
                    setStatus(`Download failed (try ${attempt + 1}/${DELAYS.length}) — retrying in ${Math.ceil(wait / 1000)}s…`);
                    if (wait) await new Promise(r => setTimeout(r, wait));
                }
            }
            if (!ok) {
                crackLog('Giving up on base download.', lastErr);
                dictLoading = false;
                setTimeout(() => loadDict().catch(() => {}), 60000);
                setStatus('Failed to fetch wordlist (will retry)…');
                return;
            }
            if (needReloadAfterBaseLoad()) {
                setStatus('Dictionary cached — reloading…');
                setTimeout(() => location.reload(), 120);
                return;
            }
        } else {
            crackLog('Dictionary loaded from IDB');
        }

        dictLoaded  = true;
        dictLoading = false;
        await setStatusWithRemoteCount();
    }

    // ============================================================
    // Remote community wordlist sync
    // ============================================================

    async function fetchRemoteMeta(force = false) {
        try {
            const lastSync    = Number(await idbGet('cc_last_sync_ts')) || 0;
            const metaRetryAt = Number(await idbGet('cc_meta_retry_at')) || 0;
            if (!force && ((Date.now() - lastSync) < SYNC_MIN_INTERVAL_MS || Date.now() < metaRetryAt)) {
                const cm = await idbGet('cc_metadata') || {};
                return { count: cm.count || Number(await idbGet('cc_remote_count')) || 0, snapshot_path: cm.snapshot_path || null, diff_path: cm.diff_path || null, generated_at: cm.generated_at || null };
            }
            const metaRes = await gmRequest({ method: 'GET', url: metadataURL(force), headers: { 'X-CC-Version': SCRIPT_VERSION }, timeout: 10000 });
            if (metaRes.status !== 200) {
                await idbSet('cc_meta_retry_at', Date.now() + META_RETRY_MS);
                const cm = await idbGet('cc_metadata') || {};
                return { count: cm.count || Number(await idbGet('cc_remote_count')) || 0, snapshot_path: cm.snapshot_path || null, diff_path: cm.diff_path || null, generated_at: cm.generated_at || null };
            }
            const meta   = JSON.parse(metaRes.responseText || '{}');
            await idbSet('cc_submit_enabled', meta.submit_enabled !== false);
            await idbSet('cc_meta_retry_at', 0);
            const toSave = { count: meta.count || 0, snapshot_path: meta.snapshot_path || meta.latest_path || null, diff_path: meta.diff_path || null, generated_at: meta.generated_at || null };
            await idbSet('cc_metadata', toSave);
            await idbSet('cc_remote_count', toSave.count);
            await idbSet('cc_last_sync_ts', Date.now());
            return toSave;
        } catch (e) {
            crackLog('fetchRemoteMeta failed:', e);
            try { await idbSet('cc_meta_retry_at', Date.now() + META_RETRY_MS); } catch {}
            return { count: Number(await idbGet('cc_remote_count')) || 0, snapshot_path: null, diff_path: null, generated_at: null };
        }
    }

    async function downloadCommunityWordlist(meta, ifNoneMatchEtag) {
        try {
            if (!meta?.snapshot_path) return 0;
            const snapshotUrl = `${CF_STORAGE_BASE}/${meta.snapshot_path}`;
            const isGz = isGzipPath(meta.snapshot_path);
            const res  = await gmRequest({ method: 'GET', url: snapshotUrl, headers: ifNoneMatchEtag ? { 'If-None-Match': ifNoneMatchEtag } : {}, timeout: 45000, responseType: isGz ? 'arraybuffer' : 'text' });
            const remoteEtag = getHeader(res.responseHeaders, 'ETag') || '';
            if (remoteEtag) await idbSet('cc_remote_etag', remoteEtag);
            if (res.status === 304) { await idbSet('cc_last_downloaded_count', meta.count || 0); await idbSet('cc_last_sync_ts', Date.now()); return 0; }
            if (res.status !== 200) return 0;
            const text    = await responseToText(res, meta.snapshot_path);
            const lines   = text.split(/\r?\n/);
            const buckets = {};
            let processed = 0;
            setStatus('Indexing snapshot…');
            for (const raw of lines) {
                const word = (raw || '').trim().toUpperCase();
                if (!word || !/^[A-Z0-9_.]+$/.test(word)) continue;
                const L = word.length;
                if (L < MIN_LENGTH || L > MAX_LENGTH) continue;
                if (!buckets[L]) buckets[L] = new Set();
                buckets[L].add(word);
                if (++processed % 5000 === 0) await new Promise(r => setTimeout(r, 0));
            }
            await commitBucketsToIDB(buckets);
            await idbSet('cc_remote_count', meta.count || 0);
            await idbSet('cc_last_downloaded_count', meta.count || 0);
            await idbSet('cc_last_sync_ts', Date.now());
            await idbSet('cc_metadata', { snapshot_path: meta.snapshot_path, diff_path: meta.diff_path || null, count: meta.count || 0, generated_at: meta.generated_at || null, etag: remoteEtag });
            await idbSet('cc_pending_delta', 0);
            return 1;
        } catch (e) { crackLog('downloadCommunityWordlist failed:', e); return 0; }
    }

    async function checkRemoteAndMaybeDownload(force = false) {
        const meta          = await fetchRemoteMeta(force);
        const lastDownloaded = (await idbGet('cc_last_downloaded_count')) || 0;
        const remoteCount   = meta.count || Number(await idbGet('cc_remote_count')) || 0;
        const delta         = Math.max(0, remoteCount - lastDownloaded);
        if (!force && delta < DOWNLOAD_MIN_DELTA) {
            await idbSet('cc_pending_delta', delta);
            return 0;
        }
        setStatus(force ? 'Manual sync…' : `Syncing (+${delta})…`);
        return await downloadCommunityWordlist(meta, (await idbGet('cc_remote_etag')) || '');
    }

    let autoSyncTimer = null, autoSyncInFlight = false;

    async function scheduleNextAutoSync() {
        if (autoSyncTimer) {
            clearTimeout(autoSyncTimer);
            autoSyncTimer = null;
        }

        let delay = SYNC_MIN_INTERVAL_MS;
        try {
            const last = Number(await idbGet('cc_last_sync_ts')) || 0;
            delay = last > 0
                ? Math.max(60 * 1000, SYNC_MIN_INTERVAL_MS - (Date.now() - last))
                : 60 * 1000;
            const metaRetryAt = Number(await idbGet('cc_meta_retry_at')) || 0;
            delay = Math.max(delay, metaRetryAt - Date.now());
        } catch (e) {
            crackLog('Unable to read next sync time', e);
            delay = 5 * 60 * 1000;
        }

        autoSyncTimer = setTimeout(async () => {
            if (autoSyncInFlight) {
                scheduleNextAutoSync().catch(() => {});
                return;
            }
            autoSyncInFlight = true;
            try {
                setStatus('Auto-syncing community words…');
                await checkRemoteAndMaybeDownload(false);
                await setStatusWithRemoteCount();
            } catch (e) {
                crackLog('Auto-sync failed', e);
                setStatus('Ready');
            } finally {
                autoSyncInFlight = false;
                scheduleNextAutoSync().catch(() => {});
            }
        }, delay);
    }

    function startAutoSyncHeartbeat() {
        if (autoSyncTimer) return;
        scheduleNextAutoSync().catch(e => crackLog('Auto-sync scheduler failed', e));
    }

    // ============================================================
    // Outbox
    // ============================================================

    async function enqueueOutbox(word) {
        if (!word) return;
        const w   = word.toUpperCase();
        const out = await idbGet('cc_outbox') || [];
        if (out.includes(w)) return;
        out.push(w);
        if (out.length > OUTBOX_MAX_SIZE) out.splice(0, out.length - OUTBOX_MAX_SIZE);
        await idbSet('cc_outbox', out);
        ensureOutboxFlushScheduled();
    }
    function ensureOutboxFlushScheduled(delay = OUTBOX_FLUSH_INTERVAL_MS) {
        if (outboxFlushTimer) return;
        outboxFlushTimer = setTimeout(flushOutbox, Math.max(1000, delay));
    }

    // Only one tab flushes at a time; others skip (the flushing tab re-reads the shared outbox)
    function withOutboxLock(fn) {
        if (!navigator.locks?.request) return fn();
        return navigator.locks.request('crackcommander-outbox', { ifAvailable: true }, lock => lock ? fn() : null);
    }

    async function pauseOutbox(ms, reason) {
        const jittered = Math.round(ms * (0.8 + Math.random() * 0.4));
        await idbSet('cc_outbox_retry_at', Date.now() + jittered);
        crackLog(`Outbox paused ${formatShortDuration(jittered)}: ${reason}`);
    }
    async function backoffOutbox(reason) {
        const prev = Number(await idbGet('cc_outbox_backoff_ms')) || 0;
        const next = Math.min(OUTBOX_BACKOFF_MAX_MS, Math.max(OUTBOX_BACKOFF_MIN_MS, prev * 2));
        await idbSet('cc_outbox_backoff_ms', next);
        await pauseOutbox(next, reason);
    }
    async function removeFromOutbox(words) {
        const cur = await idbGet('cc_outbox') || [];
        await idbSet('cc_outbox', cur.filter(w => !words.includes(w)));
    }

    // Resolves with the response for any HTTP status; rejects only on network error / timeout
    function postWords(words) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'POST',
                url: CF_ADD_WORD_URL,
                headers: { 'Content-Type': 'application/json', 'X-CC-Version': SCRIPT_VERSION },
                data: JSON.stringify({ words }),
                timeout: 15000,
                onload: resolve, onerror: reject, ontimeout: reject,
            });
        });
    }

    async function flushOutbox() {
        outboxFlushTimer = null;
        if ((await idbGet('cc_submit_enabled')) === false) return;

        const retryAt = Number(await idbGet('cc_outbox_retry_at')) || 0;
        if (Date.now() < retryAt) { ensureOutboxFlushScheduled(retryAt - Date.now()); return; }

        await withOutboxLock(async () => {
            while (true) {
                const batch = (await idbGet('cc_outbox') || []).slice(0, OUTBOX_BATCH_SIZE);
                if (!batch.length) return;

                const sinceLast = Date.now() - lastOutboxPost;
                if (sinceLast < OUTBOX_POST_INTERVAL_MS) await new Promise(r => setTimeout(r, OUTBOX_POST_INTERVAL_MS - sinceLast));
                lastOutboxPost = Date.now();

                let res;
                try { res = await postWords(batch); }
                catch { await backoffOutbox('network error'); break; }

                const status = res.status;
                if (status >= 200 && status < 300) {
                    await removeFromOutbox(batch);
                    batch.forEach(w => remoteWords.add(w));
                    await idbSet('cc_outbox_backoff_ms', 0);
                    continue;
                }
                if (status === 429 || status === 503) {
                    const retryAfter = Number(getHeader(res.responseHeaders, 'Retry-After')) * 1000;
                    await pauseOutbox(retryAfter > 0 ? retryAfter : OUTBOX_BACKOFF_MAX_MS, `HTTP ${status}`);
                    break;
                }
                if ([401, 403, 404, 405, 410].includes(status)) {
                    // Endpoint refusing us outright; don't keep knocking
                    await pauseOutbox(OUTBOX_REFUSED_PAUSE_MS, `HTTP ${status}`);
                    break;
                }
                if (status >= 400 && status < 500) {
                    // Server rejected this batch's content; retrying won't help
                    await removeFromOutbox(batch);
                    continue;
                }
                await backoffOutbox(`HTTP ${status}`);
                break;
            }
        });

        // Anything left over (paused or another tab held the lock) gets picked up later
        const retryAtAfter = Number(await idbGet('cc_outbox_retry_at')) || 0;
        if ((await idbGet('cc_outbox') || []).length) {
            ensureOutboxFlushScheduled(Math.max(OUTBOX_FLUSH_INTERVAL_MS, retryAtAfter - Date.now()));
        }
    }

    // ============================================================
    // Exclusions & Suggestions
    // ============================================================

    function loadExclusions(rowKey, len) {
        let arr = [];
        try { arr = JSON.parse(sessionStorage.getItem(EXCL_STORAGE_PREFIX + rowKey + '_' + len) || '[]'); } catch {}
        const out = new Array(len);
        for (let i = 0; i < len; i++) {
            const s = Array.isArray(arr[i]) ? arr[i] : (typeof arr[i] === 'string' ? arr[i].split('') : []);
            out[i] = new Set(s.map(c => String(c || '').toUpperCase()).filter(Boolean));
        }
        return out;
    }
    function saveExclusions(rowKey, len, sets) {
        const arr = new Array(len);
        for (let i = 0; i < len; i++) arr[i] = Array.from(sets[i] || new Set());
        sessionStorage.setItem(EXCL_STORAGE_PREFIX + rowKey + '_' + len, JSON.stringify(arr));
    }
    function schedulePanelUpdate(panel) {
        if (!panel) return;
        const key = panel.dataset.rowkey;
        if (panelUpdateTimers.has(key)) clearTimeout(panelUpdateTimers.get(key));
        panelUpdateTimers.set(key, setTimeout(() => { panel.updateSuggestions(); panelUpdateTimers.delete(key); }, 50));
    }
    function addExclusion(rowKey, pos, letter, len) {
        letter = String(letter || '').toUpperCase();
        if (!letter) return;
        const sets  = loadExclusions(rowKey, len);
        if (!sets[pos]) sets[pos] = new Set();
        const before = sets[pos].size;
        sets[pos].add(letter);
        if (sets[pos].size !== before) {
            saveExclusions(rowKey, len, sets);
            schedulePanelUpdate(document.querySelector(`.__crackcommander_panel[data-rowkey="${rowKey}"]`));
        }
    }

    async function suggest(pattern, rowKey) {
        const len = pattern.length;
        if (len < MIN_LENGTH || len > MAX_LENGTH) return [];
        if (!dict[len]) { const chunk = await idbGet(`len_${len}`); if (!chunk) return []; dict[len] = chunk; }
        const maxSug       = getIntPref(PREF_MAX_SUGGESTIONS, 8);
        const maxCandidates = maxSug * 50;
        const worker = new Worker(URL.createObjectURL(new Blob([`
            self.onmessage = function(e) {
                const { dictChunk, pattern, max } = e.data;
                const regex = new RegExp('^' + pattern.replace(/[*]/g, '.') + '$');
                const out = [];
                for (const word of dictChunk) {
                    if (regex.test(word)) out.push(word);
                    if (out.length >= max) break;
                }
                self.postMessage(out);
            };
        `], { type: 'application/javascript' })));
        const candidates = await new Promise(resolve => {
            worker.onmessage = e => { worker.terminate(); resolve([...new Set(e.data)]); };
            worker.postMessage({ dictChunk: dict[len], pattern: pattern.toUpperCase(), max: maxCandidates });
        });
        const exSets = loadExclusions(rowKey, len);
        return candidates.filter(w => {
            for (let i = 0; i < len; i++) if (exSets[i]?.has(w[i])) return false;
            return true;
        }).slice(0, maxSug);
    }

    function findSugPanel(rowKey) {
        return document.querySelector(`.__crackcommander_panel[data-rowkey="${rowKey}"]`);
    }

    function updateSugBadge(rowKey, count) {
        const badge = document.querySelector(`[data-crack-key="${rowKey}"] .cc-sug-badge`);
        if (!badge) return;
        const txt = count == null ? '' : `💡${count}`;
        if (badge.textContent !== txt) badge.textContent = txt;
    }

    // Popover is positioned against the badge in its row. It lives in <body>
    // so it never changes the height of Torn's virtualised rows.
    let sugHideTimer = null;
    function showSugPopover(badge) {
        const rowKey = badge.closest('[data-crack-key]')?.dataset.crackKey;
        const panel  = rowKey && findSugPanel(rowKey);
        if (!panel) return;
        clearTimeout(sugHideTimer);
        document.querySelectorAll('.cc-sug-pop.open').forEach(p => { if (p !== panel) p.classList.remove('open'); });
        panel.classList.add('open');
        const r  = badge.getBoundingClientRect();
        const pw = panel.offsetWidth;
        panel.style.left = `${Math.max(4, Math.min(r.left, window.innerWidth - pw - 4))}px`;
        panel.style.top  = `${r.bottom + 4}px`;
    }
    function hideSugPopoverSoon() {
        clearTimeout(sugHideTimer);
        sugHideTimer = setTimeout(() => document.querySelectorAll('.cc-sug-pop.open').forEach(p => p.classList.remove('open')), 250);
    }
    window.addEventListener('scroll', () => document.querySelectorAll('.cc-sug-pop.open').forEach(p => p.classList.remove('open')), { passive: true });
    document.addEventListener('click', e => {
        if (e.target.closest?.('.cc-sug-badge, .cc-sug-pop')) return;
        document.querySelectorAll('.cc-sug-pop.open').forEach(p => p.classList.remove('open'));
    });

    function prependPanelToRow(row, pat, rowKey) {
        let panel = findSugPanel(rowKey);
        if (!panel) {
            panel = document.createElement('div');
            panel.className       = '__crackcommander_panel cc-sug-pop';
            panel.dataset.rowkey  = rowKey;
            panel.dataset.pattern = pat;
            panel._seq = 0;
            panel.addEventListener('mouseenter', () => clearTimeout(sugHideTimer));
            panel.addEventListener('mouseleave', hideSugPopoverSoon);

            const listDiv = document.createElement('div');
            listDiv.className = 'cc-sug-list';
            panel.appendChild(listDiv);

            panel.updateSuggestions = async function () {
                const curPat    = panel.dataset.pattern;
                const curRowKey = panel.dataset.rowkey;
                const seq = ++panel._seq;
                const sugs = await suggest(curPat, curRowKey);
                if (seq !== panel._seq) return;

                for (let i = 0; i < sugs.length; i++) {
                    let sp = listDiv.children[i];
                    if (!sp) { sp = document.createElement('span'); listDiv.appendChild(sp); }
                    sp.dataset.kind = 'sug';
                    sp.style.background = '';
                    if (sp.textContent !== sugs[i]) sp.textContent = sugs[i];
                    // Click-to-copy with brief flash confirmation
                    const word = sugs[i];
                    sp.style.cursor = 'pointer';
                    sp.onclick = () => {
                        navigator.clipboard?.writeText(word).catch(() => {});
                        sp.textContent = '✓';
                        setTimeout(() => { sp.textContent = word; }, 600);
                    };
                    styleSugSpan(sp);
                }
                while (listDiv.children.length > sugs.length) listDiv.removeChild(listDiv.lastChild);

                if (sugs.length === 0) {
                    let sp = listDiv.firstChild;
                    if (!sp) { sp = document.createElement('span'); sp.dataset.kind = 'msg'; listDiv.appendChild(sp); }
                    const txt = dictLoaded ? '(no matches)' : '(loading dictionary…)';
                    if (sp.textContent !== txt) sp.textContent = txt;
                    sp.style.padding    = '2px 4px';
                    sp.style.color      = dictLoaded ? '#ff8787' : '#ff0';
                    sp.style.background = 'transparent';
                    sp.style.fontSize   = `${getSugTheme().fontPx}px`;
                    sp.onclick = null;
                    sp.dataset.kind = 'msg';
                    while (listDiv.children.length > 1) listDiv.removeChild(listDiv.lastChild);
                }

                updateSugBadge(curRowKey, dictLoaded ? sugs.length : '…');
            };

            document.body.appendChild(panel);
            applyPanelTheme(panel);
        } else {
            const patternChanged = panel.dataset.pattern !== pat;
            panel.dataset.pattern = pat;
            if (!patternChanged) return panel;
        }
        schedulePanelUpdate(panel);
        return panel;
    }

    async function isWordInLocalDict(word) {
        const len = word.length;
        if (!dict[len]) { const chunk = await idbGet(`len_${len}`); if (!chunk) return false; dict[len] = chunk; }
        return dict[len].includes(word);
    }
    async function addWordToLocalCache(word) {
        const len = word.length;
        if (len < MIN_LENGTH || len > MAX_LENGTH) return;
        const chunk = await idbGet(`len_${len}`) || [];
        if (!chunk.includes(word)) {
            chunk.push(word);
            await idbSet(`len_${len}`, chunk);
            if (!dict[len]) dict[len] = [];
            if (!dict[len].includes(word)) dict[len].push(word);
        }
    }

    function getRowKey(el) {
        if (!el.dataset.crackKey) el.dataset.crackKey = `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
        return el.dataset.crackKey;
    }

    function attachSlotSensors(crimeOption, rowKey) {
        if (crimeOption.dataset.crackDelegated === '1') return;
        crimeOption.dataset.crackDelegated = '1';
        const slotSel    = '[class^="charSlot"]:not([class*="charSlotDummy"])';
        const badLineSel = '[class*="incorrectGuessLine"]';
        const onVisualCue = ev => {
            const slot = ev.target.closest?.(slotSel);
            if (!slot || !crimeOption.contains(slot)) return;
            const slots = crimeOption.querySelectorAll(slotSel);
            const i     = Array.prototype.indexOf.call(slots, slot);
            if (i < 0) return;
            if (getComputedStyle(slot).borderColor === 'rgb(130, 201, 30)') return;
            const now   = performance.now();
            const shown = (slot.textContent || '').trim();
            if (shown && /^[A-Za-z0-9._]$/.test(shown)) return;
            const prev             = prevRowStates.get(rowKey) || null;
            const hasRowLastInput  = !!(prev?.lastInput && (now - prev.lastInput.time) <= 1800 && prev.lastInput.i === i);
            const isIncorrectLine  = ev.target.matches?.(badLineSel);
            const freshGlobal      = (now - (LAST_INPUT.time || 0)) <= 1800;
            let letter = null;
            if (hasRowLastInput)                             letter = prev.lastInput.letter;
            else if (isIncorrectLine && freshGlobal && LAST_INPUT.key) letter = LAST_INPUT.key.toUpperCase();
            else return;
            if (!/^[A-Za-z0-9._]$/.test(letter)) return;
            addExclusion(rowKey, i, letter, slots.length);
            schedulePanelUpdate(document.querySelector(`.__crackcommander_panel[data-rowkey="${rowKey}"]`));
        };
        crimeOption.addEventListener('animationstart', onVisualCue, true);
        crimeOption.addEventListener('transitionend',  onVisualCue, true);
    }

    // ============================================================
    // Difficulty overlay
    // ============================================================

    function readBruteForceStrength() {
        const el = document.querySelector('div[class^=rig___] div[class^=statistics___] div[class*=strength___] span[class^=value___]');
        return el ? (parseFloat(el.innerText) || 1) : 1;
    }

    function parseDifficulty(element) {
        const label = element.getAttribute('aria-label');
        if (label == null) return 0;
        if (element.querySelector('span[class^=discoveredChar___]') != null) return -1;
        const m = label.match(/, (\d+) encryption/);
        return m ? parseInt(m[1]) : null;
    }

    function difficultyColor(attempts) {
        if (attempts <= 1)  return DIFF_COLORS.OneAttempt;
        if (attempts <= 3)  return DIFF_COLORS.ThreeOrLess;
        if (attempts <= 5)  return DIFF_COLORS.FiveOrLess;
        if (attempts <= 7)  return DIFF_COLORS.SevenOrLess;
        if (attempts <= 10) return DIFF_COLORS.TenOrLess;
        return DIFF_COLORS.MoreThanTen;
    }

    function formatNum(n, digits = 1) {
        if (!Number.isFinite(n)) return '?';
        return Number(n.toFixed(digits)).toString();
    }

    // Brute-force strength from total MIPS: curve fitted to in-game readings
    // (same fit as sliw.co/rig). Matches Torn far better than the old
    // 0.0052·√MIPS − 0.6252 guide estimate, which overshoots above ~1M MIPS.
    // The fit peaks near 3.33M MIPS (~6.5 BFS), well past any real rig.
    const BFS_PEAK_MIPS = 3330000;
    function bfsForMips(mips) {
        if (!(mips > 0)) return 0;
        const x = mips / 100000;
        return Math.max(0, 1.450654 * Math.sqrt(x) + 0.240309 * Math.log(x) - 0.001976 * x * x - 0.485498);
    }

    // Inverse of bfsForMips; Infinity when no rig can reach that BFS.
    function mipsForBfs(bfs) {
        const need = Number(bfs);
        if (!Number.isFinite(need) || need <= 0) return 0;
        if (bfsForMips(BFS_PEAK_MIPS) < need) return Infinity;
        let lo = 0, hi = BFS_PEAK_MIPS;
        for (let i = 0; i < 40; i++) {
            const mid = (lo + hi) / 2;
            if (bfsForMips(mid) >= need) hi = mid; else lo = mid;
        }
        return Math.ceil(hi);
    }

    // BFS/MIPS needed to clear `cycles` in 1–4 Brute Force clicks.
    function bfsEstimates(cycles) {
        return [1, 2, 3, 4].map(clicks => {
            const bfs = cycles / clicks;
            return { clicks, bfs, need: mipsForBfs(bfs) };
        });
    }

    function formatMips(n) {
        if (n === Infinity) return 'n/a';
        if (!Number.isFinite(n)) return '?';
        if (n >= 1000000) return `${formatNum(n / 1000000, 2)}M`;
        if (n >= 1000) return `${formatNum(n / 1000, 0)}k`;
        return String(Math.ceil(n));
    }

    function getTargetComplexity(targetDescription) {
        // textContent, not innerText: the subtitle we hide must still count.
        const text = (targetDescription?.textContent || '').toLowerCase();
        let best = null;
        for (const name of Object.keys(TARGET_COMPLEXITY)) {
            if (text.includes(name) && (!best || name.length > best.length)) best = name;
        }
        return best ? TARGET_COMPLEXITY[best] : null;
    }

    // Visible text leaves of the target block (title + Torn's subtitle), ours excluded.
    function targetTexts(section) {
        return Array.from(section.querySelectorAll('*'))
            .filter(el => !el.children.length && !el.closest('.cc-diff-line'))
            .map(el => (el.textContent || '').trim()).filter(Boolean);
    }

    // Exact leaf match first, then the longest key contained in the text
    // ("government official" beats "government").
    function matchKey(keys, leaves, text) {
        const exact = keys.find(k => leaves.includes(k));
        if (exact) return exact;
        let best = null;
        for (const k of keys) if (text.includes(k) && (!best || k.length > best.length)) best = k;
        return best;
    }

    function getTargetPayout(section) {
        const leaves = targetTexts(section).map(t => t.toLowerCase());
        const text = leaves.join(' | ');
        const type = matchKey(Object.keys(TARGET_PAYOUTS), leaves, text);
        if (!type) return null;
        const service = matchKey(Object.keys(TARGET_PAYOUTS[type]), leaves, text);
        return service ? TARGET_PAYOUTS[type][service] : null;
    }

    function formatMoney(n) {
        if (!Number.isFinite(n)) return '?';
        if (n >= 1000000) return `$${formatNum(n / 1000000, 2)}M`;
        if (n >= 1000) return `$${formatNum(n / 1000, n >= 100000 ? 0 : 1)}k`;
        return `$${Math.round(n)}`;
    }
    function formatMoneyFull(n) {
        return Number.isFinite(n) ? `$${Math.round(n).toLocaleString('en-US')}` : '?';
    }

    function strategyHint(complexity) {
        const mode = getStrategyMode();
        if (mode === 'fast_cs') return 'Fast CS: brute-force aggressively';
        if (mode === 'efficient_cs') return 'Eff CS: reveal enough, then crack';
        if (complexity === 1) return 'Profit: try dictionary guesses';
        if (complexity === 2) return 'Profit: try dict + extra chars';
        if (complexity === 3) return 'Profit: brute-force likely';
        return STRATEGY_MODES[mode].hint;
    }

    function buildNerveText(cyclesNeeded, strength) {
        const mode = getNerveMode();
        const safeStrength = Math.max(0.01, Number(strength) || 1);
        const floorStrength = Math.max(1, Math.floor(safeStrength));
        const expectedAttempts = cyclesNeeded > 0 ? cyclesNeeded / safeStrength : 0;
        const worstAttempts = cyclesNeeded > 0 ? Math.ceil(cyclesNeeded / floorStrength) : 0;
        const expectedBruteNerve = expectedAttempts * 7;
        const worstBruteNerve = worstAttempts * 7;
        const expectedInclCrack = expectedBruteNerve + 5;
        const worstInclCrack = worstBruteNerve + 5;
        // Clicks are whole actions, so round the average up; nerve follows the clicks.
        const likelyClicks = Math.min(Math.ceil(expectedAttempts - 1e-9), worstAttempts);
        const likelyInclCrack = likelyClicks * 7 + 5;
        let nerveLine, detailedNerve;
        if (mode === 'brute_plus_crack') {
            nerveLine = `N${formatNum(expectedBruteNerve)}/${formatNum(expectedInclCrack)}`;
            detailedNerve = `Nerve ${formatNum(expectedBruteNerve)} BF / ${formatNum(expectedInclCrack)} Total`;
        } else {
            nerveLine = `N${formatNum(expectedBruteNerve)}/${worstBruteNerve}`;
            detailedNerve = `Nerve ${formatNum(expectedBruteNerve)} BF / ${worstBruteNerve} Worst`;
        }
        return {
            expectedAttempts,
            worstAttempts,
            expectedBruteNerve,
            worstBruteNerve,
            expectedInclCrack,
            worstInclCrack,
            likelyClicks,
            likelyInclCrack,
            nerveLine,
            detailedNerve,
            cyclesText: `${cyclesNeeded} cycle${cyclesNeeded === 1 ? '' : 's'}`,
            expectedText: `Expected ${formatNum(expectedAttempts)}`,
            worstText: `Worst ${worstAttempts}`,
            compactLine1: `${cyclesNeeded}c`,
            compactLine2: `E${formatNum(expectedAttempts)} W${worstAttempts}`,
            compactLine3: nerveLine,
        };
    }

    function findBruteForceElement(target) {
        const candidates = target.querySelectorAll('button, [role="button"], div[class*="button"], div[class*="Button"], a, span');
        for (const el of candidates) {
            if (/BRUTE\s*FORCE/i.test(el.textContent || '')) return el;
        }
        return null;
    }

    function getTranslateY(el) {
        const m = String(el?.style?.transform || '').match(/translateY\((-?\d+(?:\.\d+)?)px\)/);
        return m ? parseFloat(m[1]) : 0;
    }

    function setTranslateY(el, y) {
        if (!el) return;
        const next = `translateY(${Math.round(y)}px)`;
        if (el.style.transform !== next) el.style.transform = next;
        el.dataset.crkY = String(Math.round(y));
    }

    // Torn's virtual list writes its own translateY/height on every scroll
    // render. Remember the last values we wrote; anything different came from
    // React and is the row's native position/height.
    function nativeTranslateY(item) {
        const cur = getTranslateY(item);
        if (item.dataset.crkY === undefined || String(Math.round(cur)) !== item.dataset.crkY) {
            item.dataset.crkNativeY = String(cur);
        }
        return parseFloat(item.dataset.crkNativeY || '0') || 0;
    }

    function nativeInlineHeight(el) {
        const cur = parseFloat(el.style.height || '');
        if (!Number.isFinite(cur)) return parseFloat(el.dataset.crkNativeH || '0') || 0;
        if (el.dataset.crkH === undefined || String(Math.round(cur)) !== el.dataset.crkH) {
            el.dataset.crkNativeH = String(cur);
        }
        return parseFloat(el.dataset.crkNativeH || '0') || 0;
    }

    function setInlineHeight(el, h) {
        const px = `${Math.round(h)}px`;
        if (el.style.height !== px) el.style.height = px;
        if (el.style.minHeight !== px) el.style.minHeight = px;
        el.dataset.crkH = String(Math.round(h));
    }

    // Restack synchronously whenever React touches the list so the corrected
    // layout is applied before paint, instead of jumping on the next 800ms tick.
    function observeVirtualList(list) {
        if (list._ccObserver) return;
        let busy = false;
        list._ccObserver = new MutationObserver(mutations => {
            if (busy || !isOnCrackingPage) return;
            const relevant = mutations.some(m =>
                m.type === 'childList' ? m.target === list
                    : (m.target === list || m.target.parentElement === list));
            if (!relevant) return;
            // Newly mounted rows: add their stats line before the next paint.
            if (mutations.some(m => m.type === 'childList' && m.target === list && m.addedNodes.length) && !list._ccScanQueued) {
                list._ccScanQueued = true;
                requestAnimationFrame(() => { list._ccScanQueued = false; scanCrimePage(); });
            }
            busy = true;
            try { resizeCrackingVirtualList(list); }
            finally { list._ccObserver.takeRecords(); busy = false; }
        });
        list._ccObserver.observe(list, { childList: true, subtree: true, attributes: true, attributeFilter: ['style'] });
    }

    function measuredHeight(el) {
        if (!el) return 0;
        const rect = el.getBoundingClientRect ? el.getBoundingClientRect().height : 0;
        const scroll = Number(el.scrollHeight) || 0;
        return Math.ceil(Math.max(rect || 0, scroll || 0));
    }

    function resizeCrackingVirtualList(list) {
        if (!list) return;
        observeVirtualList(list);
        if (!list._ccExtras) list._ccExtras = new Map();   // native Y → extra height
        const extras = list._ccExtras;
        const items = Array.from(list.querySelectorAll(':scope > div[class^=virtualItem___], :scope > .virtual-item'))
            .map(item => ({ item, nativeY: nativeTranslateY(item) }))
            .sort((a, b) => a.nativeY - b.nativeY);
        if (!items.length) return;

        // When scrolled, the first mounted row is not row 0. Start from its
        // native offset plus the extra height of rows above it that we have
        // already expanded (they may be unmounted now).
        const firstY = items[0].nativeY;
        let y = firstY;
        for (const [ny, extra] of extras) if (ny < firstY) y += extra;

        for (const { item, nativeY } of items) {
            const nativeHeight = nativeInlineHeight(item);
            const rectHeight = item.getBoundingClientRect ? item.getBoundingClientRect().height : 0;

            const crimeOption = item.querySelector('div[class^=crimeOptionWrapper___] > .crime-option, div[class^=crimeOptionWrapper___] > div[class*=crimeOption___]');
            const rigAdvisor = item.querySelector(':scope > .cc-rig-advisor');
            const outcomeWrapper = item.querySelector(':scope > div[class*=outcomeWrapper___], div[class*=outcomeWrapper___]');

            // Normal cracking rows are virtualized at ~51px, while Torn's outcome
            // story text is placed in a sibling outcomeWrapper.  Do not rely on
            // Torn updating the inline virtual-row height; measure the actual
            // outcome content and add it explicitly so the next row cannot overlap.
            const crimeHeight = measuredHeight(crimeOption) || 51;
            const outcomeHeight = measuredHeight(outcomeWrapper);

            // Prefer Torn's own slot height so untouched rows keep their native
            // position exactly; the difficulty info now lives inside the row.
            const baseHeight = nativeHeight || (crimeOption ? Math.max(51, crimeHeight) : (rectHeight || 51));
            if (!item.dataset.crkBaseHeight) item.dataset.crkBaseHeight = String(nativeHeight || rectHeight || 51);

            let extraHeight = 0;

            if (outcomeHeight > 0) {
                extraHeight += outcomeHeight;
            }

            if (rigAdvisor) {
                const advisorHeight = measuredHeight(rigAdvisor);
                extraHeight += Math.max(isMobileView ? 86 : 92, advisorHeight + 10);
            }

            const nextHeight = Math.max(0, baseHeight + extraHeight);
            // Extra relative to Torn's own slot for this row (what shifts rows below).
            extras.set(nativeY, Math.max(0, nextHeight - (nativeHeight || baseHeight)));
            setInlineHeight(item, nextHeight);
            if (extraHeight > 0) {
                if (item.style.overflow !== 'visible') item.style.overflow = 'visible';
                item.classList.add('cc-virtual-expanded');
            }
            if (rigAdvisor) item.classList.add('cc-rig-expanded');
            setTranslateY(item, y);
            y += nextHeight;
        }

        let totalExtra = 0;
        for (const extra of extras.values()) totalExtra += extra;
        const nativeListHeight = nativeInlineHeight(list);
        const listHeight = Math.max(y, nativeListHeight + totalExtra);
        const px = `${Math.round(listHeight)}px`;
        if (list.style.height !== px) list.style.height = px;
        list.dataset.crkH = String(Math.round(listHeight));
    }

    function scheduleVirtualListRestack(fromEl) {
        const virtualList = fromEl?.closest?.('div[class^=virtualList___], .virtualList, .virtual-list');
        if (!virtualList) return;
        [50, 250, 700].forEach(delay => setTimeout(() => resizeCrackingVirtualList(virtualList), delay));
    }

    // Torn's target block is "title" over "subtitle". Find the subtitle leaf
    // (last text-only element that isn't ours) so our line can take its place.
    function findTargetSubtitle(section) {
        const hidden = section.querySelector('[data-cc-hidden="1"]');
        if (hidden) return hidden;
        const leaves = Array.from(section.querySelectorAll('*')).filter(el =>
            !el.children.length && (el.textContent || '').trim() && !el.closest('.cc-diff-line'));
        return leaves.length >= 2 ? leaves[leaves.length - 1] : null;
    }

    function hideSubtitleFor(section, line) {
        const subtitle = findTargetSubtitle(section);
        if (!subtitle) return false;
        if (subtitle.dataset.ccHidden !== '1') {
            subtitle.style.display = 'none';
            subtitle.dataset.ccHidden = '1';
        }
        if (subtitle.nextElementSibling !== line) subtitle.insertAdjacentElement('afterend', line);
        return true;
    }

    function ensureDiffLine(section) {
        let line = section.querySelector('.cc-diff-line');
        if (line) {
            // React may have swapped the subtitle node when the row was reused.
            hideSubtitleFor(section, line);
            return line;
        }
        line = document.createElement('div');
        line.className = 'cc-diff-line';
        line.innerHTML = '<span class="cc-tags"></span><span class="cc-stats"></span><span class="cc-info" aria-label="Target details">ⓘ</span><span class="cc-sug-badge" title="Password suggestions"></span>';
        const badge = line.querySelector('.cc-sug-badge');
        badge.addEventListener('mouseenter', () => showSugPopover(badge));
        badge.addEventListener('mouseleave', hideSugPopoverSoon);
        badge.addEventListener('click', e => {
            e.stopPropagation();
            const rowKey = badge.closest('[data-crack-key]')?.dataset.crackKey;
            const panel  = rowKey && findSugPanel(rowKey);
            if (panel?.classList.contains('open')) panel.classList.remove('open');
            else showSugPopover(badge);
        });
        // Stats text and the ⓘ icon both open the tooltip: hover on desktop,
        // tap toggles on mobile.
        line.querySelectorAll('.cc-stats, .cc-info').forEach(el => {
            el.addEventListener('mouseenter', () => showTargetTip(line));
            el.addEventListener('mouseleave', hideTargetTip);
            el.addEventListener('click', e => {
                if (!line._ccTip) return;
                e.stopPropagation();
                if (targetTipOwner === line) hideTargetTip();
                else showTargetTip(line);
            });
        });

        if (!hideSubtitleFor(section, line)) section.appendChild(line);
        return line;
    }

    // ── Target tooltip: one shared element in <body>, filled on hover ──
    let targetTipEl = null;
    let targetTipOwner = null;

    // "4" when likely and worst agree, else "4 · worst 5".
    function likelyWorst(likely, worst) {
        return likely === worst ? `${likely}` : `${likely} <small>· worst ${worst}</small>`;
    }

    function buildTargetTipHTML(tip) {
        const { detail, hint, stats, fullStats, cycles, payout } = tip;
        const likelyClicks = stats.likelyClicks;
        const likelyNerve = likelyClicks * 7;
        let html = `
            <div class="cc-tip-head"><span class="cc-tip-code">${detail.code}</span><span class="cc-tip-title">${detail.desc}</span></div>
            <div class="cc-tip-sub">${detail.tip}</div>
            <div class="cc-tip-section">Cost<span>${cycles} cycle${cycles === 1 ? '' : 's'}</span></div>
            <div class="cc-tip-grid">
                <span>BF clicks (approx.)</span><span>${likelyWorst(likelyClicks, stats.worstAttempts)}</span>
                <span>Brute nerve</span><span>${likelyWorst(likelyNerve, stats.worstBruteNerve)}</span>
                <span>Incl. crack</span><span>${likelyWorst(likelyNerve + 5, stats.worstInclCrack)}</span>
            </div>`;
        if (payout != null) {
            html += `
            <div class="cc-tip-section">Profit<span>avg payout</span></div>
            <div class="cc-tip-grid">
                <span>Per crack</span><span>${formatMoneyFull(payout)}</span>
                <span>Per nerve</span><span>${likelyWorst(formatMoneyFull(payout / fullStats.likelyInclCrack), formatMoneyFull(payout / fullStats.worstInclCrack))}</span>
            </div>`;
        }
        if (cycles > 0) {
            const rig = lastRigMips == null ? '' : `<span>your rig ${formatMips(lastRigMips)}</span>`;
            html += `<div class="cc-tip-section">MIPS to finish in${rig}</div><div class="cc-tip-mips">`;
            html += '<span class="hdr">Clicks</span><span class="hdr num">BFS</span><span class="hdr mips">MIPS</span><span class="hdr have"></span>';
            for (const { clicks, bfs, need } of bfsEstimates(cycles)) {
                const have = lastRigMips == null ? ''
                    : (lastRigMips >= need ? '<span class="cc-tip-ok">✓</span>'
                        : need === Infinity ? '<span class="cc-tip-need">out of reach</span>'
                        : `<span class="cc-tip-need">+${formatMips(need - lastRigMips)}</span>`);
                html += `<span>${clicks}</span><span class="num">${formatNum(bfs, 2)}</span><span class="mips">${formatMips(need)}</span><span class="have">${have}</span>`;
            }
            html += '</div>';
        }
        html += `<div class="cc-tip-advice">${hint}</div>`;
        html += '<div class="cc-tip-foot">MIPS targets use a BFS curve fitted to in-game readings (±0.5%)</div>';
        return html;
    }

    function showTargetTip(line) {
        const tip = line._ccTip;
        if (!tip) return;
        if (!targetTipEl) {
            targetTipEl = document.createElement('div');
            targetTipEl.className = 'cc-tip';
            document.body.appendChild(targetTipEl);
        }
        targetTipEl.style.setProperty('--cc-tip-accent', tip.detail.color);
        targetTipEl.innerHTML = buildTargetTipHTML(tip);
        targetTipEl.classList.add('open');
        targetTipOwner = line;

        // Below the stats text, flipped above when it would run off the bottom.
        const r = line.querySelector('.cc-stats').getBoundingClientRect();
        const w = targetTipEl.offsetWidth, h = targetTipEl.offsetHeight;
        let top = r.bottom + 6;
        if (top + h > window.innerHeight - 8) top = Math.max(8, r.top - h - 6);
        targetTipEl.style.left = `${Math.max(8, Math.min(r.left, window.innerWidth - w - 8))}px`;
        targetTipEl.style.top  = `${top}px`;
    }

    function hideTargetTip() {
        targetTipEl?.classList.remove('open');
        targetTipOwner = null;
    }
    window.addEventListener('scroll', hideTargetTip, { passive: true });
    document.addEventListener('click', e => {
        if (!e.target.closest?.('.cc-diff-line .cc-stats, .cc-diff-line .cc-info')) hideTargetTip();
    });

    function calculateDifficulty(target) {
        const targetDescription = target.querySelector('div[class*=targetSection___]');
        if (!targetDescription) return;
        const line = ensureDiffLine(targetDescription);
        const statsEl = line.querySelector('.cc-stats');

        const strength = readBruteForceStrength();
        let cyclesNeeded = 0, fullCycles = 0;
        target.querySelectorAll('div[class^=sections___] div[class^=charSlot___]').forEach(ch => {
            // Whole-password cycles value the target; revealed characters still count.
            const enc = (ch.getAttribute('aria-label') || '').match(/, (\d+) encryption/);
            fullCycles += (enc ? parseInt(enc[1]) : 0) + 1;
            const d = parseDifficulty(ch);
            // Revealed/discovered characters are already solved and should not add
            // another brute-force cycle. Encryption layers count as extra cycles.
            if (d === -1) return;
            cyclesNeeded += (d != null ? d : 0) + 1;
        });

        const stats = buildNerveText(cyclesNeeded, strength);
        const complexity = getTargetComplexity(targetDescription);
        const detail = complexity ? COMPLEXITY_DETAILS[complexity] : UNKNOWN_COMPLEXITY_DETAIL;
        const hint = strategyHint(complexity);
        const style = getDiffPanelStyle();
        // Same model as the payout sheet: payout ÷ (BF clicks × 7 + 5 crack),
        // over the whole password so the value stays put while you brute force.
        // Revealed slots may lose their encryption label, so keep the highest
        // count seen for this target.
        const key = targetKey(target, targetDescription);
        fullCycles = Math.max(fullCycles, cyclesNeeded, targetFullCycles.get(key) || 0);
        targetFullCycles.set(key, fullCycles);
        const payout = getTargetPayout(targetDescription);
        const fullStats = buildNerveText(fullCycles, strength);
        const ppn = payout != null ? payout / fullStats.likelyInclCrack : null;
        const info = { key, tier: complexity || 0, cost: stats.likelyInclCrack, cycles: cyclesNeeded, payout, ppn, line };

        if (!getBoolPref(PREF_DIFF_ENABLED, true)) {
            // Keep the badge for suggestions, but show Torn's own subtitle text.
            const sub = targetDescription.querySelector('[data-cc-hidden="1"]');
            const txt = (sub?.textContent || '').trim();
            if (statsEl.textContent !== txt) statsEl.textContent = txt;
            if (line.dataset.ccColor) { line.dataset.ccColor = ''; line.dataset.ccSig = ''; line.style.borderLeft = ''; }
            line._ccTip = null;
            delete line.dataset.hasTip;
            return info;
        }

        // Row shows what matters when choosing: payout, $ per nerve, nerve
        // needed. Complexity, cycles and attempts live in the tooltip.
        const attemptColor = difficultyColor(stats.expectedAttempts || stats.worstAttempts);
        const sep = '<span class="cc-sep"> • </span>';
        const nerve = getNerveMode() === 'brute_plus_crack' ? stats.likelyInclCrack : stats.likelyClicks * 7;
        const nerveText = style === 'compact' ? `${nerve}N` : `${nerve} nerve`;
        const parts = [];
        if (payout != null) {
            parts.push(`<span class="cc-payout">${formatMoney(payout)}</span>`);
            parts.push(`<span class="cc-profit">${formatMoney(ppn)}/N</span>`);
        }
        parts.push(`<span style="color:${attemptColor}">${nerveText}</span>`);
        const html = parts.join(style === 'compact' ? ' ' : sep);

        // Only touch the DOM when something changed.
        if (line.dataset.ccSig !== html) {
            line.dataset.ccSig = html;
            statsEl.innerHTML = html;
        }
        if (line.dataset.ccColor !== detail.color) {
            line.dataset.ccColor = detail.color;
            line.style.borderLeft = `2px solid ${detail.color}`;
        }
        // Tooltip HTML is built on hover so the rig MIPS comparison is current.
        line._ccTip = { detail, hint, stats, fullStats, cycles: cyclesNeeded, payout };
        line.dataset.hasTip = '1';
        return info;
    }

    // ============================================================
    // Best target for nerve balance + started cracks
    // ============================================================

    function parseBarValue(el) {
        const m = (el?.textContent || '').replace(/,/g, '').match(/(\d+)\s*\/\s*(\d+)/);
        return m ? Number(m[1]) : null;
    }

    function readNerveBalance() {
        // 1. Sidebar: <div barStats><p barName>Nerve:</p><p barValue>39/75</p>…
        //    (older layouts used bar-name / bar-value).
        for (const name of document.querySelectorAll('[class*=barName___], [class*=bar-name]')) {
            if (!/^\s*nerve/i.test(name.textContent || '')) continue;
            const host = name.parentElement;
            const v = parseBarValue(host?.querySelector('[class*=barValue___], [class*=bar-value]'));
            if (v != null) return v;
        }
        // 2. Known ids / class names for the nerve bar.
        const direct = document.querySelector('#barNerve [class*=barValue___], #barNerve [class*=bar-value], [id*=nerve i] [class*=barValue___], [class*=nerve___] [class*=barValue___], [class*=nerve___] [class*=bar-value]');
        const v = parseBarValue(direct);
        if (v != null) return v;
        // 3. Any element labelled "Nerve" with an "x/y" value nearby.
        for (const el of document.querySelectorAll('[aria-label*=Nerve i], [title*=Nerve i]')) {
            const n = parseBarValue(el) ?? parseBarValue({ textContent: el.getAttribute('aria-label') || el.getAttribute('title') });
            if (n != null) return n;
        }
        return null;
    }

    // Stable identity for a target across virtual-row recycling: its visible
    // text (title + Torn's subtitle) plus password length.
    function targetKey(target, section) {
        const text = targetTexts(section).join('|');
        const slots = target.querySelectorAll('div[class^=sections___] div[class^=charSlot___]').length;
        return `${text}#${slots}`;
    }

    // Three picks among unstarted targets affordable with the first-load nerve.
    // Targets missing from the payout table rank below priced ones, so with no
    // payout data the picks fall back to cost / tier.
    //   best  — highest $ per nerve (tie → uses more nerve)
    //   big   — highest payout per crack (tie → higher tier)
    //   quick — cheapest / fewest cycles (tie → higher $ per nerve)
    // kind says how they were chosen, so a mark is never silently missing:
    //   ok      — normal, against the first-load balance
    //   nonerve — nerve bar not found; same rules ignoring balance
    //   next    — nothing affordable; marks the best $ per nerve to save up for
    //
    // CS boosting mode reuses the same three slots with different rules:
    //   best  (★ CS)   — lowest nerve per crack = most cracks per nerve bar
    //                    (tie → higher tier, in case harder pays more CS)
    //   big   (◆ HARD) — highest tier per nerve, for if harder cracks give
    //                    more CS (tie → higher tier → cheaper)
    //   quick — unused (★ CS already is the cheapest)
    // Torn's CS formula isn't published, so both are heuristics.
    function csHardScore(t) {
        return (t.tier || 1) / Math.max(1, t.cost);
    }

    function pickTargetsCS(open, affordable) {
        const cheapest = (a, b) => b.cost - a.cost || a.tier - b.tier;
        if (!affordable.length) {
            const next = open.length ? top(open, cheapest) : null;
            return next ? { best: next, big: null, quick: null, kind: 'next', mode: 'cs' } : null;
        }
        const best = top(affordable, cheapest);
        const big  = top(affordable, (a, b) => csHardScore(a) - csHardScore(b) || a.tier - b.tier || b.cost - a.cost);
        return {
            best,
            big:   big !== best ? big : null,
            quick: null,
            kind:  nerveAtLoad == null ? 'nonerve' : 'ok',
            mode:  'cs',
        };
    }

    function top(list, cmp) {
        return list.reduce((a, b) => (cmp(b, a) > 0 ? b : a)).key;
    }

    function pickTargets() {
        const ppn = t => t.ppn ?? -1;
        const pay = t => t.payout ?? -1;
        const byBest = (a, b) => ppn(a) - ppn(b) || a.cost - b.cost || a.tier - b.tier;
        const open = [], affordable = [];
        for (const [key, t] of seenTargets) {
            if (t.started) continue;
            open.push({ key, ...t });
            if (nerveAtLoad == null || t.cost <= nerveAtLoad) affordable.push({ key, ...t });
        }
        if (getPickMode() === 'cs') return pickTargetsCS(open, affordable);
        if (!affordable.length) {
            // Nothing priced → cheapest, as before.
            const next = open.length && (open.some(t => t.ppn != null)
                ? top(open, (a, b) => ppn(a) - ppn(b) || b.cost - a.cost)
                : top(open, (a, b) => b.cost - a.cost));
            return next ? { best: next, big: null, quick: null, kind: 'next' } : null;
        }
        return {
            best:  top(affordable, byBest),
            big:   top(affordable, (a, b) => pay(a) - pay(b) || a.tier - b.tier || a.cost - b.cost),
            quick: top(affordable, (a, b) => b.cost - a.cost || ppn(a) - ppn(b) || a.tier - b.tier),
            kind:  nerveAtLoad == null ? 'nonerve' : 'ok',
        };
    }

    // A completed crack spends nerve and removes/replaces a target, so start
    // the picks over: re-read nerve and rebuild targets from what's mounted.
    function recalcTargetPicks() {
        if (!isOnCrackingPage) return;
        nerveAtLoad = null;
        targetPicks = null;
        seenTargets.clear();
        scanCrimePage();
    }

    // Capture phase so we see the click even if Torn stops propagation.
    // Sidebar nerve updates a beat after the action, hence the two passes.
    document.addEventListener('click', e => {
        if (!isOnCrackingPage) return;
        // Torn: <button class="commit-button" aria-label="Crack, 5 nerve">
        //          <span class="title___">Crack</span><span class="nerve___">5</span>…
        // (textContent is "Crack5", so read the aria-label / title span instead.)
        const btn = e.target.closest?.('button, [role="button"], a');
        if (!btn || !btn.closest('div.crime-root.cracking-root, [class^=currentCrime]')) return;
        const label = (btn.getAttribute('aria-label')
            || btn.querySelector('[class*=title___]')?.textContent
            || btn.textContent || '').trim();
        if (!/^crack\b/i.test(label)) return;
        [1200, 3000].forEach(delay => setTimeout(recalcTargetPicks, delay));
    }, true);

    function buildTag(cls, text, title) {
        return `<span class="cc-tag ${cls}" title="${title.replace(/"/g, '&quot;')}">${text}</span>`;
    }

    function applyTargetMarks(wrapper, info, started) {
        const p = !started && targetPicks ? targetPicks : {};
        const isBest = p.best === info.key, isBig = p.big === info.key, isQuick = p.quick === info.key;
        wrapper.classList.toggle('cc-best', isBest);
        wrapper.classList.toggle('cc-big', isBig && !isBest);
        wrapper.classList.toggle('cc-quick', isQuick && !isBest && !isBig);
        wrapper.classList.toggle('cc-started', started);

        const host = info.line.querySelector('.cc-tags');
        if (!host) return;
        const cost = formatNum(info.cost);
        const nerve = nerveAtLoad;
        const guess = p.kind === 'nonerve' ? '?' : '';
        const guessNote = p.kind === 'nonerve' ? ' (nerve balance not found on page — ignoring balance)' : '';
        const money = info.payout != null ? `${formatMoneyFull(info.payout)} avg, ${formatMoneyFull(info.ppn)}/nerve; ` : '';
        const tags = [];
        const perBar = nerve != null && info.cost > 0 ? Math.floor(nerve / info.cost) : null;
        const perBarNote = perBar != null ? ` — ≈${perBar} crack${perBar === 1 ? '' : 's'} from ${nerve} nerve` : '';
        if (started) {
            tags.push(buildTag('started', '▶ STARTED', 'Crack already in progress'));
        } else if (p.mode === 'cs') {
            if (isBest && p.kind === 'next') {
                tags.push(buildTag('best', '★ NEXT', `CS boost: nothing affordable with ${nerve} nerve; cheapest needs ≈${cost} (short ≈${formatNum(info.cost - nerve)})`));
            } else {
                if (isBest) tags.push(buildTag('best', `★ CS${guess}`, `CS boost — cheapest crack, most cracks per nerve: ≈${cost} nerve (C${info.tier || '?'})${perBarNote}${guessNote}`));
                if (isBig)  tags.push(buildTag('big',  `◆ HARD${guess}`, `CS boost — hardest crack per nerve (C${info.tier || '?'}), for if harder targets give more CS: ≈${cost} nerve${perBarNote}${guessNote}`));
            }
        } else if (isBest && p.kind === 'next') {
            const why = info.ppn != null ? `best $/nerve (${formatMoneyFull(info.ppn)}) needs` : 'cheapest needs';
            tags.push(buildTag('best', '★ NEXT', `Nothing affordable with ${nerve} nerve; ${why} ≈${cost} (short ≈${formatNum(info.cost - nerve)})`));
        } else {
            if (isBest)  tags.push(buildTag('best',  `★ BEST${guess}`,  `Best return on your ${nerve ?? '?'} nerve: ${money}≈${cost} nerve expected${nerve != null ? `, ≈${formatNum(nerve - info.cost)} left` : ''}${guessNote}`));
            if (isBig)   tags.push(buildTag('big',   `◆ BIG${guess}`,   `Biggest payout you can afford (C${info.tier || '?'}): ${money}≈${cost} nerve expected${guessNote}`));
            if (isQuick) tags.push(buildTag('quick', `⚡ QUICK${guess}`, `Cheapest / fastest affordable: ${money}≈${cost} nerve expected${guessNote}`));
        }
        const html = tags.join('');
        if (host.dataset.ccSig !== html) { host.dataset.ccSig = html; host.innerHTML = html; }
    }

    async function addDifficultyOverlays() {
        while (!document.querySelector('div.crime-root.cracking-root div[class^=currentCrime___]')) {
            if (!isOnCrackingPage) return;
            await new Promise(r => setTimeout(r, 50));
        }
        if (!isOnCrackingPage) return;
        document.querySelectorAll('div[class^=currentCrime___] div[class^=virtualList___] div[class^=crimeOptionWrapper___] div.crime-option')
            .forEach(calculateDifficulty);
    }

    // MutationObserver — re-run difficulty and restack after outcome animations.
    // Torn expands outcomeWrapper after brute force/crack clicks; measure it after
    // several animation frames so the in-game story text is not clipped.
    const crimesApp = document.querySelector('div.crimes-app');
    if (crimesApp) {
        new MutationObserver(mutations => {
            if (!isOnCrackingPage) return;
            for (const m of mutations) {
                const mt = m.target;
                const outcomeHost = mt?.closest?.('div[class*=outcomeWrapper___]') ||
                    (String(mt?.className || '').includes('outcomeWrapper___') ? mt : null);
                if (!outcomeHost) continue;

                scheduleVirtualListRestack(outcomeHost);

                const crimeOption = outcomeHost.parentNode?.querySelector('div.crime-option');
                if (crimeOption) {
                    [120, 500, 900].forEach(delay => setTimeout(() => calculateDifficulty(crimeOption), delay));
                }
                break;
            }
        }).observe(crimesApp, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class'] });
    }


    // ============================================================
    // Rig advisor
    // ============================================================

    function parseFirstNumber(text, def = 0) {
        const m = String(text || '').replace(/,/g, '').match(/-?\d+(?:\.\d+)?/);
        return m ? Number(m[0]) : def;
    }

    function parsePowerText(text) {
        const m = String(text || '').replace(/,/g, '').match(/(\d+(?:\.\d+)?)\s*w\s*\/\s*(\d+(?:\.\d+)?)\s*w/i);
        return m ? { used: Number(m[1]), cap: Number(m[2]) } : { used: 0, cap: 0 };
    }

    function parseOverheatedText(text) {
        const m = String(text || '').match(/(\d+)\s*\/\s*(\d+)/);
        return m ? { overheated: Number(m[1]), total: Number(m[2]) } : { overheated: 0, total: 0 };
    }

    function formatWatts(n) {
        if (!Number.isFinite(n)) return '?w';
        return `${Math.round(n)}w`;
    }

    function getRigAdvisorStats(rig) {
        const status = (rig.querySelector('span[class^=status___], span[class*=status___]')?.textContent || '').trim() || 'Unknown';
        const mipsText = rig.querySelector('div[class*=mips___] span[class^=value___], div[class*=mips___] span[class*=value___]')?.textContent || '';
        const strengthText = rig.querySelector('div[class*=strength___] span[class^=value___], div[class*=strength___] span[class*=value___]')?.textContent || '';
        const overheatedText = rig.querySelector('div[class*=overheated___] span[class^=value___], div[class*=overheated___] span[class*=value___]')?.textContent || '';
        const hottestText = rig.querySelector('div[class*=hottest___] span[class^=value___], div[class*=hottest___] span[class*=value___]')?.textContent || '';
        const powerText = rig.querySelector('div[class*=power___] span[class^=value___], div[class*=power___] span[class*=value___]')?.textContent || '';
        // Torn shows the hottest part's cooldown next to it, e.g. "100% (02:05)";
        // read it from the whole stat row since it may sit outside the value span.
        const hottestRow = rig.querySelector('div[class*=hottest___]')?.textContent || hottestText;
        const cooldown = (hottestRow.match(/\d{1,2}:\d{2}(?::\d{2})?/) || [null])[0];
        return {
            status,
            mips: parseFirstNumber(mipsText, 100000),
            bfs: parseFirstNumber(strengthText, 1),
            overheated: parseOverheatedText(overheatedText),
            hottest: parseFirstNumber(hottestText, 0),
            cooldown,
            power: parsePowerText(powerText),
        };
    }

    // Next whole BFS step above the current reading.
    function nextBfsTarget(stats) {
        const target = Math.floor(stats.bfs) + 1;
        const need = mipsForBfs(target);
        return { target, need, delta: need === Infinity ? Infinity : Math.max(0, need - stats.mips) };
    }

    // Heat advice from what Torn's rig panel shows: overheated count, hottest
    // part and its cooldown timer. Overheated parts stop working until cooled,
    // so the more of them there are, the more MIPS the rig is missing.
    function rigHeatStatus(stats) {
        const { overheated, total } = stats.overheated;
        const cooling = stats.cooldown ? ` • hottest cools in ${stats.cooldown}` : '';
        if (overheated > 0) {
            const share = total ? Math.round(overheated / total * 100) : 0;
            const severe = share >= 10;
            return {
                cls: severe ? 'cc-rig-bad' : 'cc-rig-warn',
                text: `Overheated: ${overheated}/${total} parts (${share}%) are offline until they cool${cooling}`,
                fix: severe
                    ? 'Layout runs too hot: put fans/water blocks next to the ✕ parts, or swap an HPCPU there for a CPU/eCPU'
                    : 'A few parts tripped: wait out the cooldown, or add a fan next to the ✕ parts',
            };
        }
        if (stats.hottest >= 80) {
            return { cls: 'cc-rig-warn', text: `Near limit: hottest ${formatNum(stats.hottest, 0)}%${cooling}`, fix: 'Another brute force may push parts past 100% and take them offline' };
        }
        if (stats.hottest >= 50) {
            return { cls: 'cc-rig-warn', text: `Warm: hottest ${formatNum(stats.hottest, 0)}%${cooling}` };
        }
        return { cls: 'cc-rig-safe', text: `Cool: hottest ${formatNum(stats.hottest, 0)}%` };
    }

    // Overclocking multiplies CPU heat and power by the same factor, so heat
    // decides first and power headroom second.
    function rigOverclockStatus(stats) {
        const used = stats.power.used;
        const cap = stats.power.cap;
        if (!cap) return { cls: 'cc-rig-muted', text: 'Power: no active rig' };
        const headroom = cap - used;
        const power = `Power ${formatWatts(used)} / ${formatWatts(cap)}`;
        if (stats.overheated.overheated > 0 || stats.hottest >= 80) {
            return { cls: 'cc-rig-bad', text: `${power} • Overclock? No, heat-limited (overclock raises CPU heat too)` };
        }
        if (headroom <= 0) return { cls: 'cc-rig-bad', text: `${power} • Power-limited: MIPS scaled down, add a PSU` };
        // Each +10% overclock adds ~10% to CPU power draw (fans don't scale).
        const ocSteps = used > 0 ? Math.min(5, Math.floor((cap / used - 1) * 10 + 1e-9)) : 0;
        if (ocSteps <= 0) return { cls: 'cc-rig-warn', text: `${power} • Overclock? Not enough spare power (${formatWatts(headroom)} free)` };
        return { cls: 'cc-rig-safe', text: `${power} • Power allows up to +${ocSteps * 10}% overclock; check heat in Cracking Lab first` };
    }

    function buildRigAdvisorHTML(stats) {
        const next = nextBfsTarget(stats);
        const heat = rigHeatStatus(stats);
        const oc = rigOverclockStatus(stats);
        const nextText = next.need === Infinity
            ? `At the top of the BFS curve (~${formatNum(bfsForMips(BFS_PEAK_MIPS), 1)} max)`
            : `Need +${formatMips(next.delta)} MIPS for ${next.target} BFS (${formatMips(next.need)} total)`;
        return `
            <div class="cc-rig-line"><span class="cc-rig-title">Rig Advisor</span><span class="cc-sep">•</span><span>BFS ${formatNum(stats.bfs, 2)}</span><span class="cc-sep">•</span><span>${formatMips(stats.mips)} MIPS</span><span class="cc-sep">•</span><span>${stats.status}</span></div>
            <div class="cc-rig-line"><span>${nextText}</span></div>
            <div class="cc-rig-line"><span class="${heat.cls}">${heat.text}</span></div>
            ${heat.fix ? `<div class="cc-rig-line"><span class="cc-rig-muted">↳ ${heat.fix}</span></div>` : ''}
            <div class="cc-rig-line"><span class="${oc.cls}">${oc.text}</span><span class="cc-sep">•</span><a href="https://torn.mcgarvie.net/cracking-lab/" target="_blank" rel="noopener" title="Plan and simulate rig builds">Cracking Lab ↗</a></div>
        `;
    }

    // Cycles for the estimator: the user's value, else the hardest mounted
    // target, else a typical 9-cycle job.
    function rigEstimatorCycles() {
        if (rigEstCycles) return { cycles: rigEstCycles, source: 'manual' };
        if (visibleMaxCycles > 0) return { cycles: visibleMaxCycles, source: 'hardest visible' };
        return { cycles: 9, source: 'default' };
    }

    function buildRigEstimatorSummary(stats) {
        const { cycles, source } = rigEstimatorCycles();
        const expectedNow = cycles / Math.max(0.01, stats.bfs || 1);
        return `Estimator<span class="cc-sep"> • </span>${cycles}c (${source})<span class="cc-sep"> • </span>now ≈${formatNum(expectedNow)} clicks`;
    }

    function buildRigEstimatorRows(stats) {
        const { cycles } = rigEstimatorCycles();
        return bfsEstimates(cycles).map(({ clicks, bfs, need }) => {
            const have = stats.mips >= need
                ? '<span class="cc-rig-safe">✓ have</span>'
                : need === Infinity
                    ? '<span class="cc-rig-muted">out of reach</span>'
                    : `<span class="cc-rig-warn">+${formatMips(need - stats.mips)}</span>`;
            return `<div class="cc-rig-line"><span>${clicks} click${clicks === 1 ? '' : 's'}: ${formatNum(bfs, 2)} BFS ≈ ${formatMips(need)} MIPS</span><span class="cc-sep">•</span>${have}</div>`;
        }).join('');
    }

    function buildRigEstimator(panel) {
        const est = document.createElement('details');
        est.className = 'cc-rig-est';
        est.open = rigEstOpen;
        est.innerHTML = `
            <summary class="cc-rig-line"></summary>
            <div class="cc-rig-est-body">
                <div class="cc-rig-line">
                    <label>Cycles <input type="number" min="1" step="1" placeholder="auto"></label>
                    <span class="cc-rig-muted">blank = hardest visible target · cycles = unsolved chars + encryption layers (the "c" on each target)</span>
                </div>
                <div class="cc-rig-est-rows"></div>
            </div>
        `;
        const input = est.querySelector('input');
        if (rigEstCycles) input.value = String(rigEstCycles);
        // Keep Torn's row handlers from reacting to clicks/keys in the estimator.
        ['click', 'keydown', 'keyup', 'input'].forEach(type => est.addEventListener(type, e => e.stopPropagation()));
        input.addEventListener('input', () => {
            const n = parseInt(input.value, 10);
            rigEstCycles = Number.isFinite(n) && n > 0 ? n : null;
            renderRigEstimator(panel);
        });
        est.addEventListener('toggle', () => {
            rigEstOpen = est.open;
            scheduleVirtualListRestack(panel);
        });
        return est;
    }

    function renderRigEstimator(panel) {
        const stats = panel._ccStats;
        const est = panel.querySelector(':scope > .cc-rig-est');
        if (!stats || !est) return;
        const summary = est.querySelector('summary');
        const rows = est.querySelector('.cc-rig-est-rows');
        const summaryHtml = buildRigEstimatorSummary(stats);
        const rowsHtml = buildRigEstimatorRows(stats);
        if (summary.innerHTML !== summaryHtml) summary.innerHTML = summaryHtml;
        if (rows.innerHTML !== rowsHtml) rows.innerHTML = rowsHtml;
    }

    function updateRigAdvisor(rig) {
        if (!rig) return;
        const rigStatus = rig.querySelector('div[class^=rigStatus___], div[class*=rigStatus___]');
        if (!rigStatus) return;
        const stats = getRigAdvisorStats(rig);
        const virtualItem = rig.closest('div[class^=virtualItem___], .virtual-item');
        const host = virtualItem || rig.parentElement || rig;

        // Remove the older v1.1.10 placement from inside Rig Status so the
        // advisor appears under the whole row of rig panels instead.
        rigStatus.querySelectorAll(':scope > .cc-rig-advisor').forEach(el => el.remove());

        let panel = host.querySelector(':scope > .cc-rig-advisor');
        if (!panel) {
            panel = document.createElement('div');
            panel.className = 'cc-rig-advisor';
            panel.innerHTML = '<div class="cc-rig-info"></div>';
            panel.appendChild(buildRigEstimator(panel));
            panel.insertAdjacentHTML('beforeend', `
                <div class="cc-rig-line cc-rig-support">
                    <span class="cc-rig-muted">Found this useful?</span>
                    <a class="woj-btn woj-btn-donate" href="https://www.torn.com/trade.php#step=start&userID=3317459" target="_blank" rel="noopener" title="Found this useful? Send a donation to WolfOfJedah [3317459]">Donate</a>
                    <span class="cc-sep">•</span>
                    <a href="https://greasyfork.org/en/users/1478881-themcgarvie" target="_blank" rel="noopener" title="More Torn scripts by themcgarvie">More scripts by WolfOfJedah ↗</a>
                </div>
            `);
            panel.querySelector(':scope > .cc-rig-support').addEventListener('click', e => e.stopPropagation());
            rig.insertAdjacentElement('afterend', panel);
        }
        // Only the info block is re-rendered; the estimator keeps its input focus.
        const info = panel.querySelector(':scope > .cc-rig-info');
        const html = buildRigAdvisorHTML(stats);
        if (info.innerHTML !== html) info.innerHTML = html;
        panel._ccStats = stats;
        lastRigMips = stats.mips;
        renderRigEstimator(panel);
        panel.title = 'BFS/MIPS targets use a curve fitted to in-game readings. Heat advice uses Torn\'s overheated count, hottest part and cooldown timer.';

        const list = virtualItem?.parentElement?.matches?.('div[class^=virtualList___], .virtualList, .virtual-list')
            ? virtualItem.parentElement
            : rig.closest('div[class^=virtualList___], .virtualList, .virtual-list');
        resizeCrackingVirtualList(list);
    }

    function scanRigAdvisor() {
        if (location.hash !== crackingHash) return;
        document.querySelectorAll('div[class^=rig___], div[class*=rig___]').forEach(updateRigAdvisor);
    }

    // ============================================================
    // Page scan — suggestions (single shared interval)
    // ============================================================

    function scanCrimePage() {
        if (location.hash !== crackingHash) return;
        const currentCrime = document.querySelector('[class^="currentCrime"]');
        if (!currentCrime) return;
        const container = currentCrime.querySelector('[class^="virtualList"]');
        if (!container) return;

        if (nerveAtLoad == null) nerveAtLoad = readNerveBalance();
        const marked = [];
        let newTargets = false;

        for (const crimeOption of container.querySelectorAll('[class^="crimeOptionWrapper"]')) {
            const rowKey = getRowKey(crimeOption);
            attachSlotSensors(crimeOption, rowKey);

            // Torn recycles/retargets visible rows while scrolling. Rebuild the
            // difficulty line for every currently visible virtual item so it
            // comes back immediately after a recycled row is mounted.
            const info = calculateDifficulty(crimeOption);

            const charSlots = crimeOption.querySelectorAll('[class^="charSlot"]:not([class*="charSlotDummy"])');
            const curChars  = Array.from(charSlots).map(cs => (cs.textContent || '').trim().toUpperCase() || '*');
            const patText   = curChars.join('');

            if (info) {
                const started = !!patText && !/^[*]+$/.test(patText);
                const seen = seenTargets.get(info.key);
                if (!seen) { seenTargets.set(info.key, { tier: info.tier, cost: info.cost, payout: info.payout, ppn: info.ppn, started }); newTargets = true; }
                else if (started) seen.started = true;
                marked.push({ crimeOption, info, started });
            }
            const now       = performance.now();
            const len       = curChars.length;
            const prev      = prevRowStates.get(rowKey) || { chars: Array(len).fill('*') };

            for (let i = 0; i < len; i++) {
                const was = prev.chars[i], is = curChars[i];
                if (was === '*' && is !== '*') prev.lastInput = { i, letter: is, time: now };
                if (was !== '*' && is === '*' && prev.lastInput?.i === i && prev.lastInput.letter === was && (now - prev.lastInput.time) <= 1800) {
                    addExclusion(rowKey, i, was, len);
                }
            }
            prevRowStates.set(rowKey, { chars: curChars, lastInput: prev.lastInput, time: now });

            // Learn newly revealed words
            if (!/[*]/.test(patText) && /^[A-Z0-9_.]+$/.test(patText)) {
                (async () => {
                    const localHas = await isWordInLocalDict(patText);
                    const supHas   = remoteWords.has(patText);
                    if (!localHas && !supHas) { await addWordToLocalCache(patText); await enqueueOutbox(patText); }
                    else if (supHas && !localHas) { await addWordToLocalCache(patText); }
                })();
            }

            const isComplete     = patText && !patText.includes('*');
            const showOnComplete = getBoolPref(PREF_SHOW_ON_COMPLETE, true);
            if ((isComplete && !showOnComplete) || /^[*]+$/.test(patText)) {
                removeSugPanel(rowKey);
            } else {
                prependPanelToRow(crimeOption, patText, rowKey);
            }
        }

        // Pick from first-load nerve; only reconsider when more targets mount
        // (virtual list) or the nerve value turns up, and freeze once any
        // picked target has been started (nerve is being spent).
        const pickStarted = targetPicks && [targetPicks.best, targetPicks.big, targetPicks.quick]
            .some(k => k && seenTargets.get(k)?.started);
        const nerveArrived = nerveAtLoad != null && targetPicks?.kind === 'nonerve';
        if ((targetPicks == null || newTargets || nerveArrived) && !pickStarted) {
            targetPicks = pickTargets();
            crackLog('Target picks', { nerveAtLoad, targetPicks, seen: [...seenTargets] });
        }
        for (const { crimeOption, info, started } of marked) applyTargetMarks(crimeOption, info, started);
        if (marked.length) visibleMaxCycles = Math.max(0, ...marked.map(m => m.info.cycles || 0));

        // Drop popovers whose row has been unmounted by the virtual list.
        document.querySelectorAll('.__crackcommander_panel[data-rowkey]').forEach(p => {
            if (!document.querySelector(`[data-crack-key="${p.dataset.rowkey}"]`)) removeSugPanel(p.dataset.rowkey);
        });

        // Only rows with outcome text or the rig advisor change height now.
        container.querySelectorAll(':scope > div[class^=virtualList___], :scope > .virtual-list').forEach(resizeCrackingVirtualList);
        resizeCrackingVirtualList(container);
    }

    function removeSugPanel(rowKey) {
        const existing = findSugPanel(rowKey);
        if (existing) {
            if (panelUpdateTimers.has(rowKey)) { clearTimeout(panelUpdateTimers.get(rowKey)); panelUpdateTimers.delete(rowKey); }
            existing.remove();
        }
        updateSugBadge(rowKey, null);
    }

    // ============================================================
    // URL change + shared tick
    // ============================================================

    function cleanupView() {
        document.getElementById('__crackcommander_menu_btn')?.remove();
        document.getElementById('__crackcommander_mode_btn')?.remove();
        menuBtnInjected = false;
        hideTargetTip();
        document.querySelectorAll('.__crackcommander_panel, .cc-diff-line, .cc-rig-advisor').forEach(el => el.remove());
        document.querySelectorAll('[data-cc-hidden="1"]').forEach(el => { el.style.display = ''; delete el.dataset.ccHidden; });
        document.querySelectorAll('.cc-rig-expanded').forEach(el => el.classList.remove('cc-rig-expanded'));
        document.querySelectorAll('.cc-best, .cc-big, .cc-quick, .cc-started').forEach(el => el.classList.remove('cc-best', 'cc-big', 'cc-quick', 'cc-started'));
        document.querySelectorAll('.cc-virtual-expanded').forEach(el => {
            if (el.dataset.crkBaseHeight) {
                el.style.height = `${el.dataset.crkBaseHeight}px`;
                el.style.minHeight = '';
                el.style.overflow = '';
            }
            el.classList.remove('cc-virtual-expanded');
        });
        document.querySelectorAll('.cc-type-service-expanded').forEach(el => el.classList.remove('cc-type-service-expanded'));
    }

    function checkURLChange() {
        const onCracking = window.location.hash === crackingHash;
        if (onCracking === isOnCrackingPage) return;
        isOnCrackingPage = onCracking;
        if (onCracking) {
            nerveAtLoad = null;
            targetPicks = null;
            seenTargets.clear();
            addDifficultyOverlays();
        } else {
            cleanupView();
        }
    }

    // Single shared interval replaces the separate 750ms and 800ms polls
    setInterval(() => {
        checkURLChange();
        injectMenuButton();
        if (isOnCrackingPage) {
            scanCrimePage();
            document.querySelectorAll('div.crime-root.cracking-root div[class^=virtualList___]').forEach(resizeCrackingVirtualList);
            scanRigAdvisor();
            // The virtual list can unmount the hovered row without a mouseleave.
            if (targetTipOwner && !targetTipOwner.isConnected) hideTargetTip();
        }
    }, 800);

    // ============================================================
    // Menu button injection
    // ============================================================

    function injectMenuButton() {
        if (!isOnCrackingPage || menuBtnInjected) return;
        if (document.getElementById('__crackcommander_menu_btn')) { menuBtnInjected = true; return; }
        const appHeader = document.querySelector('[class^="appHeaderDelimiter"]');
        if (!appHeader) return;
        const btn       = document.createElement('button');
        btn.id          = '__crackcommander_menu_btn';
        btn.textContent = '🧠 Crack Commander';
        btn.onclick     = openSettings;
        appHeader.appendChild(btn);
        appHeader.appendChild(buildModeToggle());
        menuBtnInjected = true;
        ensureStatusBadge();
    }

    // One-click switch between profit picks and CS boosting picks.
    function buildModeToggle() {
        const btn = document.createElement('button');
        btn.id = '__crackcommander_mode_btn';
        btn.type = 'button';
        btn.innerHTML = '<span class="cc-mode-profit">💰 Profit</span><span class="cc-mode-cs">🎓 CS boost</span>';
        syncModeToggle(btn);
        btn.onclick = () => {
            setStrPref(PREF_PICK_MODE, getPickMode() === 'cs' ? 'profit' : 'cs');
            syncModeToggle(btn);
            // Re-pick from the targets already seen; scan re-applies the marks.
            targetPicks = null;
            scanCrimePage();
        };
        return btn;
    }

    function syncModeToggle(btn) {
        const mode = getPickMode();
        btn.dataset.mode = mode;
        btn.querySelector('.cc-mode-profit').classList.toggle('cc-on', mode === 'profit');
        btn.querySelector('.cc-mode-cs').classList.toggle('cc-on', mode === 'cs');
        btn.title = mode === 'cs'
            ? 'CS boost: ★ CS = cheapest crack (most cracks per nerve), ◆ HARD = hardest per nerve. Click for profit picks.'
            : 'Profit: ★ BEST = $ per nerve, ◆ BIG = biggest payout, ⚡ QUICK = cheapest. Click for CS boosting picks.';
    }

    // ============================================================
    // Settings — WoJ-style modal
    // ============================================================

    async function buildWordCountText() {
        const stats = [];
        for (let len = MIN_LENGTH; len <= MAX_LENGTH; len++) {
            const chunk = await idbGet(`len_${len}`);
            stats.push(`${len}: ${chunk ? chunk.length : 0}`);
        }
        const remoteCount = await idbGet('cc_remote_count');
        const delta       = await idbGet('cc_pending_delta');
        return `Local words by length — ${stats.join(' · ')}\nRemote cracked: ${remoteCount ?? 'n/a'}${delta ? ` (+${delta} pending)` : ''}`;
    }

    async function buildNextSyncText() {
        const lastSyncTs = Number(await idbGet('cc_last_sync_ts')) || 0;
        const remaining  = (lastSyncTs + SYNC_MIN_INTERVAL_MS) - Date.now();
        const delta      = Number(await idbGet('cc_pending_delta')) || 0;
        const time       = remaining <= 0 ? 'now' : formatShortDuration(remaining);
        return `${time}${delta ? ` (+${delta} pending)` : ''}`;
    }

    function renderSettingsForm() {
        const body = document.querySelector('#cc-settings .cc-set-body');
        if (!body) return;

        const preset = THEME_PRESETS[normalizeTheme(getStrPref(PREF_THEME, 'dark'))];

        body.innerHTML = `
            <!-- Dictionary -->
            <div class="cc-group">
                <div class="cc-group-title">📖 Dictionary</div>
                <div class="cc-setting-item">
                    <div>
                        <div class="cc-setting-label">Status</div>
                        <div class="cc-setting-desc" id="cc-dict-status">${ensureStatusBadge().textContent}</div>
                    </div>
                    <button class="cc-btn danger" id="cc-clear-cache">Clear Cache</button>
                </div>
                <div class="cc-setting-item">
                    <div>
                        <div class="cc-setting-label">Next community sync</div>
                        <div class="cc-setting-desc" id="cc-next-sync">Calculating…</div>
                    </div>
                    <button class="cc-btn secondary" id="cc-force-sync">Force Sync</button>
                </div>
                <div class="cc-setting-item" style="display:block;">
                    <div class="cc-setting-label">Word counts</div>
                    <div class="cc-word-counts" id="cc-word-counts">Loading…</div>
                </div>
            </div>

            <!-- Suggestions -->
            <div class="cc-group">
                <div class="cc-group-title">💡 Suggestions</div>
                <div class="cc-setting-item">
                    <div>
                        <div class="cc-setting-label">Max suggestions</div>
                        <div class="cc-setting-desc">Number of word suggestions shown per target (1–20)</div>
                    </div>
                    <input type="number" id="cc-max-sug" min="1" max="20" step="1" value="${getIntPref(PREF_MAX_SUGGESTIONS, 8)}">
                </div>
                <div class="cc-setting-item">
                    <div>
                        <div class="cc-setting-label">Suggestion font size (px)</div>
                        <div class="cc-setting-desc">Size of text in the suggestion panel (5–20)</div>
                    </div>
                    <input type="number" id="cc-sug-font" min="5" max="20" step="1" value="${getIntPref(PREF_SUG_FONT_PX, 10)}">
                </div>
                <div class="cc-setting-item">
                    <div>
                        <div class="cc-setting-label">Show suggestions when complete</div>
                        <div class="cc-setting-desc">Keep panel visible after a word is fully revealed</div>
                    </div>
                    <input type="checkbox" id="cc-show-complete" ${getBoolPref(PREF_SHOW_ON_COMPLETE, true) ? 'checked' : ''}>
                </div>
            </div>

            <!-- Difficulty -->
            <div class="cc-group">
                <div class="cc-group-title">🎯 Difficulty Overlay</div>
                <div class="cc-setting-item">
                    <div>
                        <div class="cc-setting-label">Show difficulty info</div>
                        <div class="cc-setting-desc">Payout · $ per nerve · nerve needed on each target (details on hover)</div>
                    </div>
                    <input type="checkbox" id="cc-diff-enabled" ${getBoolPref(PREF_DIFF_ENABLED, true) ? 'checked' : ''}>
                </div>
                <div class="cc-setting-item">
                    <div>
                        <div class="cc-setting-label">Nerve calculation</div>
                        <div class="cc-setting-desc">Choose whether the overlay includes the final 5 nerve crack action</div>
                    </div>
                    <select id="cc-nerve-mode">
                        <option value="brute_only" ${getNerveMode() === 'brute_only' ? 'selected' : ''}>Brute nerve only</option>
                        <option value="brute_plus_crack" ${getNerveMode() === 'brute_plus_crack' ? 'selected' : ''}>Brute + crack</option>
                        <option value="remaining_brute_only" ${getNerveMode() === 'remaining_brute_only' ? 'selected' : ''}>Remaining brute only</option>
                    </select>
                </div>
                <div class="cc-setting-item">
                    <div>
                        <div class="cc-setting-label">Strategy mode</div>
                        <div class="cc-setting-desc">Changes the recommendation text shown on target rows</div>
                    </div>
                    <select id="cc-strategy-mode">
                        <option value="profit" ${getStrategyMode() === 'profit' ? 'selected' : ''}>Profit / nerve saver</option>
                        <option value="efficient_cs" ${getStrategyMode() === 'efficient_cs' ? 'selected' : ''}>Efficient CS</option>
                        <option value="fast_cs" ${getStrategyMode() === 'fast_cs' ? 'selected' : ''}>Fast CS</option>
                    </select>
                </div>
                <div class="cc-setting-item">
                    <div>
                        <div class="cc-setting-label">Difficulty panel style</div>
                        <div class="cc-setting-desc">Detailed is the default; Compact uses short labels if rows feel crowded.</div>
                    </div>
                    <select id="cc-diff-panel-style">
                        <option value="detailed" ${getDiffPanelStyle() === 'detailed' ? 'selected' : ''}>Detailed</option>
                        <option value="compact" ${getDiffPanelStyle() === 'compact' ? 'selected' : ''}>Compact</option>
                    </select>
                </div>
            </div>

            <!-- Suggestion panel theme -->
            <div class="cc-group">
                <div class="cc-group-title">🎨 Suggestion Panel Theme</div>
                <div class="cc-setting-item">
                    <div>
                        <div class="cc-setting-label">Preset</div>
                        <div class="cc-setting-desc">Base colour scheme for the suggestion panel</div>
                    </div>
                    <select id="cc-theme">
                        <option value="dark"  ${normalizeTheme(getStrPref(PREF_THEME, 'dark')) === 'dark'  ? 'selected' : ''}>Dark (default)</option>
                        <option value="light" ${normalizeTheme(getStrPref(PREF_THEME, 'dark')) === 'light' ? 'selected' : ''}>Light</option>
                    </select>
                </div>
                <div class="cc-setting-item">
                    <div>
                        <div class="cc-setting-label">Show advanced colour options</div>
                    </div>
                    <input type="checkbox" id="cc-show-adv" ${getBoolPref(PREF_SHOW_ADV_COLORS, true) ? 'checked' : ''}>
                </div>
                <div id="cc-adv-colors" style="display:${getBoolPref(PREF_SHOW_ADV_COLORS, true) ? 'block' : 'none'}">
                    <div class="cc-setting-item">
                        <div><div class="cc-setting-label">Suggestion text colour</div></div>
                        <input type="text" id="cc-col-sug-text" placeholder="${preset.sugText}" value="${getStrPref(PREF_SUG_TEXT_COLOR, preset.sugText)}" style="min-width:130px;">
                    </div>
                    <div class="cc-setting-item">
                        <div><div class="cc-setting-label">Suggestion background colour</div></div>
                        <input type="text" id="cc-col-sug-bg" placeholder="${preset.sugBg}" value="${getStrPref(PREF_SUG_BG_COLOR, preset.sugBg)}" style="min-width:130px;">
                    </div>
                </div>
            </div>

            <!-- Status badge -->
            <div class="cc-group">
                <div class="cc-group-title">📌 Status Badge</div>
                <div class="cc-setting-item">
                    <div>
                        <div class="cc-setting-label">Show status badge</div>
                        <div class="cc-setting-desc">Fixed dictionary status indicator (bottom-right)</div>
                    </div>
                    <input type="checkbox" id="cc-show-badge" ${getBoolPref(PREF_SHOW_BADGE, true) ? 'checked' : ''}>
                </div>
            </div>

            <div style="font-size:11px;opacity:0.4;text-align:center;padding-top:4px;">
                Crack Commander by themcgarvie (WolfOfJedah [3317459])
            </div>
        `;

        // Register status sink
        const statusDiv = body.querySelector('#cc-dict-status');
        registerStatusSink(statusDiv);


        // Populate async fields
        (async () => {
            const nextSyncDiv  = body.querySelector('#cc-next-sync');
            const wordCountDiv = body.querySelector('#cc-word-counts');
            if (nextSyncDiv)  nextSyncDiv.textContent  = await buildNextSyncText();
            if (wordCountDiv) wordCountDiv.textContent = await buildWordCountText();
        })();

        // Wire advanced toggle
        const advColors = body.querySelector('#cc-adv-colors');
        body.querySelector('#cc-show-adv').addEventListener('change', e => {
            setBoolPref(PREF_SHOW_ADV_COLORS, e.target.checked);
            advColors.style.display = e.target.checked ? 'block' : 'none';
        });

        // Theme preset change — refresh colour fields & panels live
        body.querySelector('#cc-theme').addEventListener('change', e => {
            applyPreset(e.target.value);
            const np = THEME_PRESETS[normalizeTheme(e.target.value)];
            body.querySelector('#cc-col-sug-text').value = getStrPref(PREF_SUG_TEXT_COLOR, np.sugText);
            body.querySelector('#cc-col-sug-bg').value   = getStrPref(PREF_SUG_BG_COLOR,   np.sugBg);
            applyThemeEverywhere();
        });

        // Clear cache
        body.querySelector('#cc-clear-cache').addEventListener('click', async () => {
            const btn = body.querySelector('#cc-clear-cache');
            btn.disabled = true; btn.textContent = 'Clearing…';
            await clearLocalDictCache();
            location.reload();
        });

        // Force sync — updates word count display after completing
        body.querySelector('#cc-force-sync').addEventListener('click', async () => {
            const btn          = body.querySelector('#cc-force-sync');
            const wordCountDiv = body.querySelector('#cc-word-counts');
            btn.disabled = true; btn.textContent = 'Syncing…';
            await checkRemoteAndMaybeDownload(true).catch(() => {});
            await setStatusWithRemoteCount();
            if (wordCountDiv) wordCountDiv.textContent = await buildWordCountText();
            btn.disabled = false; btn.textContent = 'Force Sync';
        });
    }

    function saveSettingsFromForm() {
        const body = document.querySelector('#cc-settings .cc-set-body');
        if (!body) return;

        const maxSugVal = parseInt(body.querySelector('#cc-max-sug')?.value, 10);
        if (Number.isFinite(maxSugVal) && maxSugVal >= 1) setIntPref(PREF_MAX_SUGGESTIONS, maxSugVal);

        const fontVal = parseInt(body.querySelector('#cc-sug-font')?.value, 10);
        if (Number.isFinite(fontVal) && fontVal >= 5) setIntPref(PREF_SUG_FONT_PX, fontVal);

        setBoolPref(PREF_SHOW_ON_COMPLETE, body.querySelector('#cc-show-complete')?.checked ?? true);
        setBoolPref(PREF_DIFF_ENABLED,     body.querySelector('#cc-diff-enabled')?.checked ?? true);
        const nerveMode = body.querySelector('#cc-nerve-mode')?.value;
        if (nerveMode && Object.prototype.hasOwnProperty.call(NERVE_MODES, nerveMode)) setStrPref(PREF_NERVE_MODE, nerveMode);
        const strategyMode = body.querySelector('#cc-strategy-mode')?.value;
        if (strategyMode && Object.prototype.hasOwnProperty.call(STRATEGY_MODES, strategyMode)) setStrPref(PREF_STRATEGY_MODE, strategyMode);
        const diffPanelStyle = body.querySelector('#cc-diff-panel-style')?.value;
        if (diffPanelStyle && Object.prototype.hasOwnProperty.call(DIFF_PANEL_STYLES, diffPanelStyle)) setStrPref(PREF_DIFF_PANEL_STYLE, diffPanelStyle);
        setBoolPref(PREF_SHOW_BADGE,       body.querySelector('#cc-show-badge')?.checked   ?? true);

        const colSugText = body.querySelector('#cc-col-sug-text')?.value.trim();
        const colSugBg   = body.querySelector('#cc-col-sug-bg')?.value.trim();
        if (colSugText) setStrPref(PREF_SUG_TEXT_COLOR, colSugText);
        if (colSugBg)   setStrPref(PREF_SUG_BG_COLOR,   colSugBg);

        // Badge visibility
        if (statusEl) statusEl.style.display = getBoolPref(PREF_SHOW_BADGE, true) ? 'block' : 'none';

        applyThemeEverywhere();
    }

    function createSettingsDialog() {
        const overlay = document.createElement('div');
        overlay.id = 'cc-settings-overlay';
        overlay.innerHTML = `
            <div id="cc-settings">
                <div class="cc-set-header">
                    <div class="cc-set-title">⚙ Crack Commander — Settings</div>
                    <button class="cc-btn close-x" id="cc-settings-x">✕</button>
                </div>
                <div class="cc-set-body"></div>
                <div class="cc-set-footer">
                    <button class="cc-btn danger"    id="cc-settings-reset">Reset to Preset</button>
                    <button class="cc-btn secondary" id="cc-settings-cancel">Cancel</button>
                    <button class="cc-btn primary"   id="cc-settings-save">Save</button>
                </div>
            </div>`;
        document.body.appendChild(overlay);

        const close = () => {
            overlay.classList.remove('active');
            overlay.querySelectorAll('#cc-dict-status').forEach(el => unregisterStatusSink(el));
        };

        overlay.querySelector('#cc-settings-x').addEventListener('click', close);
        overlay.querySelector('#cc-settings-cancel').addEventListener('click', close);
        overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
        overlay.querySelector('#cc-settings-reset').addEventListener('click', () => {
            const sel = overlay.querySelector('#cc-theme');
            if (sel) applyPreset(sel.value);
            renderSettingsForm();
            applyThemeEverywhere();
        });
        overlay.querySelector('#cc-settings-save').addEventListener('click', () => {
            saveSettingsFromForm();
            close();
        });

        return overlay;
    }

    function openSettings() {
        let overlay = document.getElementById('cc-settings-overlay');
        if (!overlay) overlay = createSettingsDialog();
        renderSettingsForm();
        overlay.classList.add('active');
    }

    // ============================================================
    // Init
    // ============================================================

    (async function init() {
        ensureStatusBadge();
        try { sessionStorage.removeItem('__crackcommander_base_reload_done'); } catch {}
        if (!localStorage.getItem(PREF_THEME)) applyPreset('dark');
        setStatus('Initializing…');
        loadDict();
        startAutoSyncHeartbeat();
        // Pick up words queued on a previous visit (flushOutbox honours any pause/backoff)
        idbGet('cc_outbox').then(out => { if (out?.length) ensureOutboxFlushScheduled(); }).catch(() => {});
        // Run once immediately so the button and scan fire without waiting 800ms
        checkURLChange();
        injectMenuButton();
        if (isOnCrackingPage) scanCrimePage();
    })();

})();