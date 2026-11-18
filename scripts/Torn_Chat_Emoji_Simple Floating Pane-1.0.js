// ==UserScript==
// @name         Torn Chat Emoji - Simple Floating Pane
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Adds a simple floating emoji picker panel to Torn chat inputs. Includes frequently used section and fixes insertion. Released by MrYahooHH
// @author       MrYahooHH
// @match        https://www.torn.com/*
// @license      MIT License
// @grant        none
// @run-at       document-end
// @downloadURL https://update.greasyfork.org/scripts/587840/Torn%20Chat%20Emoji%20-%20Simple%20Floating%20Pane.user.js
// @updateURL https://update.greasyfork.org/scripts/587840/Torn%20Chat%20Emoji%20-%20Simple%20Floating%20Pane.meta.js
// ==/UserScript==

(function() {
    'use strict';

    // Standard emoji set
    const EMOJIS = [
        '😀','😃','😄','😁','😆','😅','😂','🤣','😊','😇','🙂','🙃','😉','😌','😍','🥰',
        '😘','😗','😙','😚','😋','😛','😝','😜','🤪','🤨','🧐','🤓','😎','🥸','🤩','🥳',
        '😏','😒','😞','😔','😟','😕','🙁','☹️','😣','😖','😫','😩','🥺','😢','😭','😤',
        '😠','😡','🤬','🤯','😳','🥵','🥶','😱','😨','😰','😥','😓','😶','😐','😑','😬',
        '❤️','💔','💕','💞','💓','💗','💖','💘','💝','💟','🩷','🩵','🩶','🤎','🤍','🖤',
        '👍','👎','👌','✌️','🤞','🤟','🤘','🤙','👈','👉','👆','👇','☝️','👋','🤚','✋','🙏',
        '👏','🙌','🤲','💪','🤝','🐶','🐱','🐭','🐹','🐰','🐻','🐼','🐨','🐯','🦁','🐮','🐷',
        '🐸','🐵','🐔','🐧','🐦','🍕','🍔','🍟','🍩','🍪','🍫','🍬','🍭','🍮','🍯',
        '🍎','🍐','🍊','🍋','🍌','🍉','🍇','🍓','🍒','🍑','🍍','🍄','☕','🍵','🍺','🍷','🍾',
        '🎉','🎊','🎈','🎁','🎂','🎄','🌟','⭐','✨','⚡','🔥','💫','💥','💤','💢','💬',
        '💭','💯','🎵','🎶','🎸','🎹','🎺','🎻','🥁','🎤','🎧','🎼','📚','📖',
        '✏️','✒️','📝','📌','💡','💻','📱','📞','⏰','🕰️','🎮','🎲','🧩','🧸',
        '⚽','🏀','🏈','⚾','🎾','🚀','✈️','🚗','🚕','🚑','🚒','🚓','🚔','🏠','🏡','🏢',
        '🏬','🏭','🏛️','🏰','⛪','🕌','🕍','🏖️','🏝️','🏜️','🌋','⛰️','🏔️','🗻',
        '🌅','🌄','🌠','🌌','🌉','🌊','🌈','☀️','🌤️','⛅','☁️','🌧️','⛈️','🌩️','❄️','☃️','☔',
        '💨','💧','💦','🌫️'
    ];

    const STORAGE_KEY = 'torn_emoji_frequent';
    const MAX_FREQUENT = 10;

    let lastChatInput = null;
    let panelOpen = false;

    // --- Utilities ---

    function findInputs() {
        const candidates = [];
        const selectors = [
            'textarea[name="msg"]',
            'textarea[name="message"]',
            'textarea[name="chat"]',
            'textarea[name="text"]',
            '.chat-box textarea',
            '#chat textarea',
            '.chat textarea',
            '.message-input textarea',
            'textarea',
            '[contenteditable="true"]',
        ];
        selectors.forEach(s => {
            document.querySelectorAll(s).forEach(el => {
                if (!candidates.includes(el)) candidates.push(el);
            });
        });
        return candidates;
    }

    function updateLastInput() {
        const candidates = findInputs();
        for (const c of candidates) {
            if (document.activeElement === c) {
                lastChatInput = c;
                return;
            }
        }
        // If nothing focused but we have a recent input, keep it if visible
        if (lastChatInput && lastChatInput.isConnected) {
            return;
        }
        if (candidates.length > 0) {
            lastChatInput = candidates[candidates.length - 1];
        }
    }

    function getUsedEmojis() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return [];
            const parsed = JSON.parse(raw);
            const sorted = Object.entries(parsed)
                .sort((a, b) => b[1] - a[1])
                .slice(0, MAX_FREQUENT)
                .map(([emoji]) => emoji);
            return sorted;
        } catch (e) {
            return [];
        }
    }

    function recordEmoji(emoji) {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            const counts = raw ? JSON.parse(raw) : {};
            counts[emoji] = (counts[emoji] || 0) + 1;
            localStorage.setItem(STORAGE_KEY, JSON.stringify(counts));
        } catch (e) {
            // ignore storage errors
        }
    }

    // --- Insertion ---

    function insertEmoji(emoji) {
        recordEmoji(emoji);
        updateLastInput();

        let target = lastChatInput;
        if (!target || !target.isConnected) {
            const candidates = findInputs();
            target = candidates.length > 0 ? candidates[candidates.length - 1] : null;
            lastChatInput = target;
        }
        if (!target) {
            console.log('Torn Emoji: No chat input found');
            return;
        }

        // Handle contenteditable
        if (target.isContentEditable) {
            const selection = window.getSelection();
            if (selection.rangeCount > 0) {
                const range = selection.getRangeAt(0);
                const textNode = document.createTextNode(emoji);
                range.deleteContents();
                range.insertNode(textNode);
                range.setStartAfter(textNode);
                range.setEndAfter(textNode);
                selection.removeAllRanges();
                selection.addRange(range);
            } else {
                target.innerText += emoji;
            }
            target.focus();
            return;
        }

        // Textarea/input
        if (typeof target.value !== 'undefined') {
            const start = target.selectionStart || target.value.length;
            const end = target.selectionEnd || target.value.length;
            const newValue = target.value.slice(0, start) + emoji + target.value.slice(end);

            // Bypass framework-controlled inputs (React/etc.) by using native setter
            try {
                const nativeSetter = target.tagName === 'TEXTAREA'
                    ? Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value").set
                    : Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
                if (nativeSetter) {
                    nativeSetter.call(target, newValue);
                } else {
                    target.value = newValue;
                }
            } catch (e) {
                target.value = newValue;
            }

            target.selectionStart = target.selectionEnd = start + emoji.length;
            target.focus();
            // Dispatch input event to notify framework
            const event = new Event('input', { bubbles: true });
            target.dispatchEvent(event);
        }
    }

    // --- Panel ---

    function createPanel() {
        if (document.getElementById('torn-emoji-panel')) {
            return document.getElementById('torn-emoji-panel');
        }

        const panel = document.createElement('div');
        panel.id = 'torn-emoji-panel';
        panel.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            width: 360px;
            max-height: 460px;
            background: #2a2a3c;
            color: #f0f0f0;
            border: 2px solid #777;
            border-radius: 12px;
            box-shadow: 0 14px 50px rgba(0,0,0,0.8);
            z-index: 9999999;
            display: none;
            font-family: system-ui, sans-serif;
            overflow: hidden;
            animation: tornEmojiFade 0.15s ease-out;
        `;

        // Inject simple fade animation
        if (!document.getElementById('torn-emoji-anim')) {
            const style = document.createElement('style');
            style.id = 'torn-emoji-anim';
            style.textContent = `
                @keyframes tornEmojiFade {
                    from { opacity: 0; transform: translate(-50%, -48%) scale(0.98); }
                    to   { opacity: 1; transform: translate(-50%, -50%) scale(1); }
                }
            `;
            document.head.appendChild(style);
        }

        // Header
        const header = document.createElement('div');
        header.style.cssText = `
            padding: 12px 16px;
            background: linear-gradient(90deg, #3b3b52, #454568);
            border-bottom: 1px solid #555;
            display: flex;
            justify-content: space-between;
            align-items: center;
            font-weight: bold;
            font-size: 15px;
            letter-spacing: 0.3px;
        `;
        header.innerHTML = `<span>😀 Emoji Picker</span>`;

        const closeBtn = document.createElement('button');
        closeBtn.innerText = '✕';
        closeBtn.title = 'Close (Esc)';
        closeBtn.style.cssText = `
            background: rgba(255,255,255,0.08);
            border: 1px solid rgba(255,255,255,0.15);
            color: #ddd;
            font-size: 16px;
            border-radius: 6px;
            padding: 2px 8px;
            cursor: pointer;
            transition: background 0.15s;
        `;
        closeBtn.addEventListener('mouseenter', () => closeBtn.style.background = 'rgba(255,255,255,0.2)');
        closeBtn.addEventListener('mouseleave', () => closeBtn.style.background = 'rgba(255,255,255,0.08)');
        closeBtn.addEventListener('click', () => {
            panel.style.display = 'none';
            panelOpen = false;
        });
        header.appendChild(closeBtn);
        panel.appendChild(header);

        // Main scrollable body
        const body = document.createElement('div');
        body.id = 'torn-emoji-body';
        body.style.cssText = `
            padding: 12px 16px;
            max-height: 360px;
            overflow-y: auto;
            scrollbar-width: thin;
            scrollbar-color: #777 #2a2a3c;
        `;

        // Frequently used section
        const frequent = getUsedEmojis();
        if (frequent.length > 0) {
            const freqSection = document.createElement('div');
            freqSection.style.marginBottom = '14px';
            const freqTitle = document.createElement('div');
            freqTitle.innerText = 'Frequently Used Emoji';
            freqTitle.style.cssText = `
                font-size: 11px;
                text-transform: uppercase;
                letter-spacing: 0.8px;
                color: #aaa;
                margin-bottom: 6px;
                font-weight: 600;
            `;
            freqSection.appendChild(freqTitle);

            const freqGrid = document.createElement('div');
            freqGrid.style.cssText = `
                display: flex;
                flex-wrap: wrap;
                gap: 6px;
            `;
            frequent.forEach(emoji => {
                freqGrid.appendChild(makeEmojiButton(emoji, body, panel));
            });
            freqSection.appendChild(freqGrid);
            body.appendChild(freqSection);

            // Divider
            const divider = document.createElement('div');
            divider.style.cssText = 'border-top: 1px solid #444; margin-bottom: 14px;';
            body.appendChild(divider);
        }

        // All emojis section title
        const allTitle = document.createElement('div');
        allTitle.innerText = '📚 All Emojis';
        allTitle.style.cssText = `
            font-size: 11px;
            text-transform: uppercase;
            letter-spacing: 0.8px;
            color: #aaa;
            margin-bottom: 8px;
            font-weight: 600;
        `;
        body.appendChild(allTitle);

        // All emojis grid
        const grid = document.createElement('div');
        grid.style.cssText = `
            display: grid;
            grid-template-columns: repeat(8, 1fr);
            gap: 6px;
        `;
        EMOJIS.forEach(emoji => {
            grid.appendChild(makeEmojiButton(emoji, body, panel));
        });
        body.appendChild(grid);
        panel.appendChild(body);
        document.body.appendChild(panel);
        return panel;
    }

    function makeEmojiButton(emoji, body, panel) {
        const btn = document.createElement('button');
        btn.innerText = emoji;
        btn.title = emoji;
        btn.style.cssText = `
            font-size: 19px;
            padding: 6px 0;
            border: 1px solid #555;
            border-radius: 8px;
            background: linear-gradient(180deg, #3a3a52, #2e2e42);
            color: inherit;
            cursor: pointer;
            transition: background 0.15s, transform 0.1s, border-color 0.15s;
            line-height: 1.2;
        `;
        btn.addEventListener('mouseenter', () => {
            btn.style.background = 'linear-gradient(180deg, #4a4a62, #3e3e52)';
            btn.style.transform = 'scale(1.08)';
            btn.style.borderColor = '#777';
        });
        btn.addEventListener('mouseleave', () => {
            btn.style.background = 'linear-gradient(180deg, #3a3a52, #2e2e42)';
            btn.style.transform = 'scale(1)';
            btn.style.borderColor = '#555';
        });
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            insertEmoji(emoji);
            panel.style.display = 'none';
            panelOpen = false;
        });
        return btn;
    }

    // --- Trigger Button ---

    function addTriggerButton() {
        if (document.getElementById('torn-emoji-trigger')) return;

        const btn = document.createElement('button');
        btn.id = 'torn-emoji-trigger';
        btn.innerText = '😀';
        btn.title = 'Open emoji picker';
        btn.style.cssText = `
            position: fixed;
            bottom: 28px;
            right: 74px;
            width: 36px;
            height: 36px;
            border-radius: 50%;
            border: none;
            background: linear-gradient(135deg, #6a6a8a, #4a4a6a);
            color: #fff;
            font-size: 16px;
            cursor: pointer;
            box-shadow: 0 4px 10px rgba(0,0,0,0.6);
            z-index: 999998;
            display: flex;
            align-items: center;
            justify-content: center;
            line-height: 1;
            transition: transform 0.12s, box-shadow 0.2s;
        `;
        btn.addEventListener('mouseenter', () => {
            btn.style.transform = 'scale(1.08)';
            btn.style.boxShadow = '0 6px 12px rgba(0,0,0,0.8)';
        });
        btn.addEventListener('mouseleave', () => {
            btn.style.transform = 'scale(1)';
            btn.style.boxShadow = '0 4px 10px rgba(0,0,0,0.6)';
        });
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const panel = createPanel();
            panel.style.display = 'block';
            panelOpen = true;
        });
        document.body.appendChild(btn);
    }

    // --- Tracking focus ---

    function trackFocus() {
        document.addEventListener('focusin', (e) => {
            const candidates = findInputs();
            for (const c of candidates) {
                if (e.target === c || e.target.closest('.chat-box') || e.target.closest('#chat')) {
                    lastChatInput = e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT' ? e.target : (e.target.isContentEditable ? e.target : c);
                    // If focused inside a contenteditable, find the closest contenteditable
                    if (e.target.isContentEditable) {
                        lastChatInput = e.target;
                    } else if (e.target !== lastChatInput && c) {
                        lastChatInput = c;
                    }
                    break;
                }
            }
        });
    }

    // --- Init ---

    function init() {
        addTriggerButton();
        trackFocus();

        // Watch for dynamically added inputs and re-add trigger if needed
        const observer = new MutationObserver(() => {
            addTriggerButton();
            updateLastInput();
        });
        observer.observe(document.body, { childList: true, subtree: true });

        // Close on Escape
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && panelOpen) {
                const panel = document.getElementById('torn-emoji-panel');
                if (panel) {
                    panel.style.display = 'none';
                    panelOpen = false;
                }
            }
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
