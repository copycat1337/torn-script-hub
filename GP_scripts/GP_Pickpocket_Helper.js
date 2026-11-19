// ==UserScript==
// @name         Torn Pickpocket Helper
// @namespace    http://torn.city/
// @version      2.0
// @description  Adds difficulty scores, $$$ for best payers, highlights best targets, colors the pickpocket button
// @author       c0pyc4t [4039125]
// @match        https://www.torn.com/*
// @match        https://*.torn.com/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function() {
    'use strict';

    // ---- YOUR RANKING SYSTEM ----
    const difficultyMap = {
        'businessman': 3, 'businesswoman': 3, 'classy lady': 4, 'cyclist': 4,
        'drunk man': 1, 'drunk woman': 1, 'elderly man': 1, 'elderly woman': 1,
        'gang member': 4, 'homeless person': 1, 'jogger': 3, 'junkie': 1,
        'laborer': 3, 'mobster': 5, 'police officer': 5, 'postal worker': 3,
        'rich kid': 4, 'sex worker': 4, 'student': 3, 'thug': 3,
        'young man': 2, 'young woman': 2
    };

    const highPayTargets = new Set([
        'elderly woman', 'jogger', 'laborer', 'police officer', 'postal worker', 'rich kid'
    ]);

    // Conditions that trigger the flashing button
    const targetConditions = {
        'postal worker': { item: 'Lottery Voucher', condition: 'Distracted', match: false },
        'rich kid': { item: 'Six Pack of Alcohol', condition: 'Listening to Music', match: true },
        'police officer': { item: 'Billfold, Police Badge', condition: 'Running', match: false },
        'laborer': { item: 'Megaphone', condition: 'Walking', match: false },
        'jogger': { item: 'Can of Crocozade', condition: 'Walking', match: true },
        'cyclist': { item: 'Mountain Bike', condition: 'Cycling', match: true }
    };

    // ---- JARVIS-style palette (applied to the button) ----
    const scoreColors = {
        1: '#35ec03', // Ideal (Green)
        2: '#35ec03', // Easy (Light Green)
        3: '#f5ce32', // Medium (Orange)
        4: '#cb5757', // Hard (Light Red)
        5: '#b51a09'  // Very Hard (Dark Red)
    };

    function normalize(str) {
        return (str || '').replace(/\s+/g, ' ').trim().toLowerCase();
    }

    function getNameMatch(el) {
        let directText = '';
        for (const child of el.childNodes) {
            if (child.nodeType === Node.TEXT_NODE) {
                directText += child.textContent;
            }
        }
        const normDirect = normalize(directText);
        if (!normDirect) return null;
        if (difficultyMap[normDirect] !== undefined) return normDirect;
        return null;
    }

    function applyHighlights() {
        // Use a specific class Torn uses for crime list items, fallback to generic rows
        const rows = document.querySelectorAll('li[class*="crime"], [class*="virtualItem"]');

        rows.forEach(row => {
            // 1. Find the name element inside the row
            const potentialNames = row.querySelectorAll('div, span');
            let nameEl = null;
            let key = null;

            for (const el of potentialNames) {
                const match = getNameMatch(el);
                if (match) {
                    // Ensure we get the deepest element (avoid parent wrappers)
                    const childHasSame = Array.from(el.children).some(child => {
                        let ct = '';
                        for (const c of child.childNodes) {
                            if (c.nodeType === Node.TEXT_NODE) ct += c.textContent;
                        }
                        return normalize(ct) === match;
                    });
                    if (!childHasSame) {
                        nameEl = el;
                        key = match;
                        break;
                    }
                }
            }

            if (!nameEl || !key) return;

            // 2. Inject Badges / Tooltips (only if not already done)
            if (!nameEl.dataset.ppProcessed) {
                nameEl.dataset.ppProcessed = 'true';
                const score = difficultyMap[key];
                const cond = targetConditions[key];

                // $$$ marker
                if (highPayTargets.has(key)) {
                    const money = document.createElement('span');
                    money.className = 'pp-money-badge';
                    money.textContent = ' $$$';
                    money.style.cssText = `
                        color: #f1c40f;
                        font-weight: bold;
                        font-size: 12px;
                        margin-left: 2px;
                        text-shadow: 0 0 2px rgba(0,0,0,0.8);
                    `;
                    nameEl.appendChild(money);
                }

                // Score badge
                const badge = document.createElement('span');
                badge.className = 'pp-score-badge';
                badge.textContent = ` [${score}]`;
                badge.style.cssText = `
                    color: #fff;
                    font-weight: bold;
                    font-size: 11px;
                    margin-left: 4px;
                    vertical-align: middle;
                `;
                nameEl.appendChild(badge);

                // Tooltip for optimal
                if (cond && cond.match) {
                    const tip = document.createElement('span');
                    tip.className = 'pp-tooltip';
                    tip.textContent = ` → ${cond.item}`; // <-- Removed (${cond.condition})
                    tip.style.cssText = `
                        color: #f39c12;
                        font-size: 11px;
                        font-style: italic;
                        margin-left: 6px;
                    `;
                    nameEl.appendChild(tip);
                }
            }

            // 3. Find and Color the Button
            // Torn's button usually lives in a right-aligned section with "commit" or "action" in the class.
            // We'll scan all divs in the row for one that contains the text "PICKPOCKET"
            let btnContainer = null;
            const allDivs = row.querySelectorAll('div');
            for (const div of allDivs) {
                const txt = normalize(div.textContent);
                if (txt === 'pickpocket' || txt === 'pickpocket 5' || txt === 'pickpocket5') {
                    // Find the visual background container (usually the element itself or its parent)
                    btnContainer = div;
                    break;
                }
            }

            if (btnContainer) {
                const score = difficultyMap[key];
                const cond = targetConditions[key];
                const isOptimal = cond && cond.match;

                // Clear previous inline styles so we can re-apply accurately
                btnContainer.style.backgroundColor = '';
                btnContainer.style.animation = '';

                if (isOptimal) {
                    btnContainer.style.animation = 'pp-btn-blink 1s ease-in-out infinite';
                } else {
                    btnContainer.style.backgroundColor = scoreColors[score];
                }
            }
        });
    }

    // ---- Blink keyframe ----
    const style = document.createElement('style');
    style.type = 'text/css';
    style.textContent = `
        @keyframes pp-btn-blink {
            0%, 100% { background-color: rgba(241, 196, 15, 0.8); box-shadow: 0 0 0 rgba(241, 196, 15, 0.6); }
            50% { background-color: rgba(241, 196, 15, 1.0); box-shadow: 0 0 10px rgba(241, 196, 15, 0.9); }
        }
    `;
    (document.head || document.documentElement).appendChild(style);

    // Debounced observer
    let pending = false;
    function scheduleRun() {
        if (pending) return;
        pending = true;
        setTimeout(() => { pending = false; applyHighlights(); }, 100);
    }

    const observer = new MutationObserver(scheduleRun);
    observer.observe(document.body || document.documentElement, { childList: true, subtree: true });

    [300, 800, 1500, 3000].forEach(ms => setTimeout(applyHighlights, ms));
    setInterval(applyHighlights, 3000); // Slower interval to allow styles to settle

})();