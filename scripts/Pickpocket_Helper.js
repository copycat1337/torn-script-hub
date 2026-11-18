// ==UserScript==
// @name         Torn Pickpocket Helper
// @namespace    http://torn.city/
// @version      1.3
// @description  Adds difficulty scores, $$$ for best payers, highlights best targets, blinks when optimal conditions are met
// @author       c0pyc4t 4039125
// @match        https://www.torn.com/*
// @match        https://*.torn.com/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function() {
    'use strict';

    const difficultyMap = {
        'businessman': 3,
        'businesswoman': 3,
        'classy lady': 4,
        'cyclist': 4,
        'drunk man': 1,
        'drunk woman': 1,
        'elderly man': 1,
        'elderly woman': 1,
        'gang member': 4,
        'homeless person': 1,
        'jogger': 3,
        'junkie': 1,
        'laborer': 3,
        'mobster': 5,
        'police officer': 5,
        'postal worker': 3,
        'rich kid': 4,
        'sex worker': 4,
        'student': 3,
        'thug': 3,
        'young man': 2,
        'young woman': 2
    };

    const displayNames = {
        'businessman': 'Businessman',
        'businesswoman': 'Businesswoman',
        'classy lady': 'Classy Lady',
        'cyclist': 'Cyclist',
        'drunk man': 'Drunk Man',
        'drunk woman': 'Drunk Woman',
        'elderly man': 'Elderly Man',
        'elderly woman': 'Elderly Woman',
        'gang member': 'Gang Member',
        'homeless person': 'Homeless Person',
        'jogger': 'Jogger',
        'junkie': 'Junkie',
        'laborer': 'Laborer',
        'mobster': 'Mobster',
        'police officer': 'Police Officer',
        'postal worker': 'Postal Worker',
        'rich kid': 'Rich Kid',
        'sex worker': 'Sex Worker',
        'student': 'Student',
        'thug': 'Thug',
        'young man': 'Young Man',
        'young woman': 'Young Woman'
    };

    // Best payers — get $$$ marker regardless of condition state
    const highPayTargets = new Set([
        'elderly man',
        'elderly woman',
        'jogger',
        'laborer',
        'police officer',
        'postal worker',
        'rich kid'
    ]);

    const greenTargets = new Set([
        'cyclist',
        'elderly woman',
        'jogger',
        'laborer',
        'police officer',
        'postal worker',
        'rich kid'
    ]);

    const targetConditions = {
        'postal worker': { item: 'Lottery Voucher', condition: 'Distracted', match: false },
        'rich kid': { item: 'Six Pack of Alcohol', condition: 'Listening to Music', match: true },
        'police officer': { item: 'Billfold, Police Badge', condition: 'Running', match: false },
        'laborer': { item: 'Megaphone', condition: 'Walking', match: false },
        'jogger': { item: 'Can of Crocozade', condition: 'Walking', match: true },
        'cyclist': { item: 'Mountain Bike', condition: 'Cycling', match: true }
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
        if (difficultyMap[normDirect] !== undefined) {
            return normDirect;
        }
        return null;
    }

    function applyHighlights() {
        const candidates = document.querySelectorAll('div, span');

        candidates.forEach(el => {
            if (el.dataset.ppProcessed) return;
            if (el.classList.contains('pp-score-badge') ||
                el.classList.contains('pp-tooltip') ||
                el.classList.contains('pp-money-badge')) return;

            const key = getNameMatch(el);
            if (!key) return;

            const childHasSame = Array.from(el.children).some(child => {
                let ct = '';
                for (const c of child.childNodes) {
                    if (c.nodeType === Node.TEXT_NODE) ct += c.textContent;
                }
                return normalize(ct) === key;
            });
            if (childHasSame) return;

            el.dataset.ppProcessed = 'true';

            const score = difficultyMap[key];

            // $$$ marker first (immediately after name), for best payers
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
                el.appendChild(money);
            }

            // Score badge
            const badge = document.createElement('span');
            badge.className = 'pp-score-badge';
            badge.textContent = ` [${score}]`;
            badge.style.cssText = `
                color: #fff;
                background: ${score >= 4 ? '#c0392b' : score === 3 ? '#e67e22' : '#27ae60'};
                padding: 1px 5px;
                border-radius: 3px;
                font-size: 11px;
                font-weight: bold;
                margin-left: 4px;
                display: inline-block;
                vertical-align: middle;
            `;
            el.appendChild(badge);

            if (greenTargets.has(key)) {
                el.style.borderLeft = '3px solid #27ae60';
                el.style.paddingLeft = '5px';
                el.style.backgroundColor = 'rgba(39, 174, 96, 0.15)';
                el.dataset.ppStyleApplied = 'true';
            }

            const cond = targetConditions[key];
            if (cond && cond.match) {
                el.style.animation = 'pp-blink 1s ease-in-out infinite';
                el.style.backgroundColor = 'rgba(241, 196, 15, 0.3)';
                el.dataset.ppStyleApplied = 'true';

                const tip = document.createElement('span');
                tip.className = 'pp-tooltip';
                tip.textContent = ` → ${cond.item} (${cond.condition})`;
                tip.style.cssText = `
                    color: #f39c12;
                    font-size: 11px;
                    font-style: italic;
                    margin-left: 6px;
                `;
                el.appendChild(tip);
            }
        });
    }

    // Inject CSS via a style element (works in OC and PDA's webview)
    const style = document.createElement('style');
    style.type = 'text/css';
    style.textContent = `
        @keyframes pp-blink {
            0%, 100% { background-color: rgba(241, 196, 15, 0.3); box-shadow: 0 0 0 rgba(241, 196, 15, 0.6); }
            50% { background-color: rgba(241, 196, 15, 0.7); box-shadow: 0 0 8px rgba(241, 196, 15, 0.8); }
        }
    `;
    (document.head || document.documentElement).appendChild(style);

    // MutationObserver with a debounce so PDA's heavy DOM churn doesn't spam runs
    let pending = false;
    function scheduleRun() {
        if (pending) return;
        pending = true;
        setTimeout(() => {
            pending = false;
            applyHighlights();
        }, 100);
    }

    const observer = new MutationObserver(scheduleRun);
    observer.observe(document.body || document.documentElement, {
        childList: true,
        subtree: true
    });

    // Multiple staggered initial runs to catch late-rendered content (PDA is slower)
    [300, 800, 1500, 3000].forEach(ms => setTimeout(applyHighlights, ms));
    setInterval(applyHighlights, 2000);

    // Cleanup so re-renders don't stack duplicates
    setInterval(() => {
        document.querySelectorAll('.pp-score-badge, .pp-tooltip, .pp-money-badge').forEach(el => el.remove());
        document.querySelectorAll('[data-pp-processed]').forEach(el => {
            delete el.dataset.ppProcessed;
        });
        document.querySelectorAll('[data-pp-style-applied]').forEach(el => {
            el.style.borderLeft = '';
            el.style.paddingLeft = '';
            el.style.backgroundColor = '';
            el.style.animation = '';
            delete el.dataset.ppStyleApplied;
        });
    }, 4000);

})();