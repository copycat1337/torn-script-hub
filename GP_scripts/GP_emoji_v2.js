// ==UserScript==
// @name         Torn Chat Emoji - Simple Floating Pane
// @namespace    http://tampermonkey.net/
// @version      1.4
// @description  Adds a simple floating emoji picker panel to Torn chat inputs. Includes favorites and frequently used sections. Released by MrYahooHH
// @author       c0pycat
// @match        https://www.torn.com/*
// @license      MIT License
// @grant        none
// @run-at       document-end
// ==/UserScript==

(function() {
    'use strict';

    // Emoji set — Torn-themed (attack, hit, hospital, jail, energy, crime, etc.)
    const EMOJIS = [
        // Faces / reactions
        '😀','😃','😄','😁','😆','😅','😂','🤣','😊','😇','🙂','🙃','😉','😌','😍','🥰',
        '😘','😗','😙','😚','😋','😛','😝','😜','🤪','🤨','🧐','🤓','😎','🥸','🤩','🥳',
        '😏','😒','😞','😔','😟','😕','🙁','☹️','😣','😖','😫','😩','🥺','😢','😭','😤',
        '😠','😡','🤬','🤯','😳','🥵','🥶','😱','😨','😰','😥','😓','😶','😐','😑','😬',
        // Hearts / love
        '❤️','💔','💕','💞',
        // Hands / gestures
        '👍','👎','👌','✌️','🤞','🤟','🤘','🤙','👈','👉','👆','👇','☝️','👋','🤚','✋','🙏',
        '👏','🤲','💪','🤝',
        // Torn-themed: combat / attack / hit
        '🔫','🔪','🗡️','⚔️','🛡️','💣','🧨','🪓','🏹','🥊','🥋','💥','💢','💫','⚡','🔥',
        '☠️','💀','🩸','🩹','🩺','💉','🧪','☢️','⚠️','🚨','🔞','🚫','⛔','❗','❓','⁉️',
        // Torn-themed: hospital / jail / crime
        '🏥','🦽','🤕','🤒','🤢','🤮','😷','🫀','🧠','👮',
        '🔒','🔓','🔑','🗝️','🏚️','🏚','💰','💵','💸',
        // Torn-themed: energy / status / misc
        '🔋','🔌','💡','⏰','📈','📉','📊','💯','🎯','🎲','🎰',
        '🃏','🀄','🎴','🕵️','🦹','🦸','🧙','🧟','🧛','👻','👽','🤖','💩','🕳️','🪦','⚰️',
        // Animals / pets (kept a few)
        '🐶','🐱','🐭','🐹','🐰','🐻','🐼','🐨','🐯','🦁','🐮','🐷','🐸','🐵','🐔','🐧','🐦',
        // Nature / weather
        '🌅','🌄','🌠','🌌','🌉','🌊','🌈','☀️','🌤️','⛅','☁️','🌧️','⛈️','🌩️','❄️','☃️','☔',
        '💨','💧','💦','🌫️',
        // Celebration / objects
        '🎉','🎊','🎈','🎁','🎂','🎄','🌟','⭐','✨','💤','💬','💭','🎵','🎶','🎸','🎹',
        '🎺','🎻','🥁','🎤','🎧','🎼','📚','📖','✏️','✒️','📝','📌','💻','📱','📞','🕰️',
        '🎮','🧩','🧸','⚽','🏀','🏈','⚾','🎾','🚀','✈️','🏠','🏡','🏢','🏬','🏭','🏛️',
        '🏰','⛪','🕌','🕍','🏖️','🏝️','🏜️','🌋','⛰️','🏔️','🗻'
    ];

    const STORAGE_KEY = 'torn_emoji_frequent';
    const FAVORITES_KEY = 'torn_emoji_favorites';
    const POSITION_KEY = 'torn_emoji_trigger_pos';
    const MAX_FREQUENT = 10;
    const MAX_FAVORITES = 10;

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
        } catch (e) {}
    }

    // --- Favorites ---

    function getFavorites() {
        try {
            const raw = localStorage.getItem(FAVORITES_KEY);
            if (!raw) return [];
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) return parsed;
            return [];
        } catch (e) {
            return [];
        }
    }

    function saveFavorites(favs) {
        try {
            localStorage.setItem(FAVORITES_KEY, JSON.stringify(favs));
        } catch (e) {}
    }

    function isFavorite(emoji) {
        return getFavorites().includes(emoji);
    }

    function toggleFavorite(emoji) {
        const favs = getFavorites();
        const idx = favs.indexOf(emoji);
        if (idx >= 0) {
            favs.splice(idx, 1);
            saveFavorites(favs);
            return { added: false, full: false };
        } else {
            if (favs.length >= MAX_FAVORITES) {
                return { added: false, full: true };
            }
            favs.push(emoji);
            saveFavorites(favs);
            return { added: true, full: false };
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

        if (typeof target.value !== 'undefined') {
            const start = target.selectionStart || target.value.length;
            const end = target.selectionEnd || target.value.length;
            const newValue = target.value.slice(0, start) + emoji + target.value.slice(end);

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

        if (!document.getElementById('torn-emoji-anim')) {
            const style = document.createElement('style');
            style.id = 'torn-emoji-anim';
            style.textContent = `
                @keyframes tornEmojiFade {
                    from { opacity: 0; transform: translate(-50%, -48%) scale(0.98); }
                    to   { opacity: 1; transform: translate(-50%, -50%) scale(1); }
                }
                .torn-emoji-fav-badge {
                    position: absolute;
                    top: -3px;
                    right: -3px;
                    font-size: 9px;
                    color: #ffd700;
                    text-shadow: 0 0 2px #000;
                    pointer-events: none;
                }
            `;
            document.head.appendChild(style);
        }

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

        const body = document.createElement('div');
        body.id = 'torn-emoji-body';
        body.style.cssText = `
            padding: 12px 16px;
            max-height: 360px;
            overflow-y: auto;
            scrollbar-width: thin;
            scrollbar-color: #777 #2a2a3c;
        `;

        // --- Favorites section (top) ---
        const favorites = getFavorites();
        if (favorites.length > 0) {
            const favSection = document.createElement('div');
            favSection.style.marginBottom = '14px';
            const favTitle = document.createElement('div');
            favTitle.innerText = '⭐ Favorites (Shift+Click to remove)';
            favTitle.style.cssText = `
                font-size: 11px;
                text-transform: uppercase;
                letter-spacing: 0.8px;
                color: #ffd700;
                margin-bottom: 6px;
                font-weight: 600;
            `;
            favSection.appendChild(favTitle);

            const favGrid = document.createElement('div');
            favGrid.style.cssText = `
                display: flex;
                flex-wrap: wrap;
                gap: 6px;
            `;
            favorites.forEach(emoji => {
                favGrid.appendChild(makeEmojiButton(emoji, body, panel, true));
            });
            favSection.appendChild(favGrid);
            body.appendChild(favSection);

            const divider = document.createElement('div');
            divider.style.cssText = 'border-top: 1px solid #444; margin-bottom: 14px;';
            body.appendChild(divider);
        }

        // --- Frequently used section ---
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

            const divider = document.createElement('div');
            divider.style.cssText = 'border-top: 1px solid #444; margin-bottom: 14px;';
            body.appendChild(divider);
        }

        const allTitle = document.createElement('div');
        allTitle.innerText = '📚 All Emojis (Shift+Click to favorite)';
        allTitle.style.cssText = `
            font-size: 11px;
            text-transform: uppercase;
            letter-spacing: 0.8px;
            color: #aaa;
            margin-bottom: 8px;
            font-weight: 600;
        `;
        body.appendChild(allTitle);

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

    function makeEmojiButton(emoji, body, panel, isFavSection) {
        const btn = document.createElement('button');
        btn.style.cssText = `
            position: relative;
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

        // Emoji text
        const span = document.createElement('span');
        span.innerText = emoji;
        btn.appendChild(span);

        // Star badge if favorited (only in the main/frequent sections, not fav section)
        if (!isFavSection && isFavorite(emoji)) {
            const badge = document.createElement('span');
            badge.className = 'torn-emoji-fav-badge';
            badge.innerText = '★';
            btn.appendChild(badge);
        }

        btn.title = isFavSection
            ? `${emoji} — Shift+Click to remove from favorites`
            : `${emoji} — Click to insert, Shift+Click to ${isFavorite(emoji) ? 'remove from' : 'add to'} favorites`;

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

            if (e.shiftKey) {
                // Toggle favorite
                const result = toggleFavorite(emoji);
                if (result.full) {
                    showToast('Favorites full (max ' + MAX_FAVORITES + ')', '#ff6b6b');
                    return;
                }
                // Rebuild the panel to reflect changes
                rebuildPanel(panel);
                return;
            }

            // Normal click — insert
            insertEmoji(emoji);
            panel.style.display = 'none';
            panelOpen = false;
        });
        return btn;
    }

    function rebuildPanel(panel) {
        // Preserve scroll position
        const oldBody = document.getElementById('torn-emoji-body');
        const scrollTop = oldBody ? oldBody.scrollTop : 0;

        // Remove panel and recreate
        panel.remove();
        const newPanel = createPanel();
        newPanel.style.display = 'block';
        panelOpen = true;

        const newBody = document.getElementById('torn-emoji-body');
        if (newBody) newBody.scrollTop = scrollTop;
    }

    function showToast(message, color) {
        const toast = document.createElement('div');
        toast.innerText = message;
        toast.style.cssText = `
            position: fixed;
            top: 20px;
            left: 50%;
            transform: translateX(-50%);
            background: ${color || '#333'};
            color: #fff;
            padding: 8px 16px;
            border-radius: 8px;
            font-family: system-ui, sans-serif;
            font-size: 13px;
            z-index: 10000000;
            box-shadow: 0 4px 12px rgba(0,0,0,0.5);
            pointer-events: none;
            animation: tornEmojiToast 0.2s ease-out;
        `;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 1800);
    }

    // --- Trigger Button (Draggable, left side) ---

    function getSavedPosition() {
        try {
            const raw = localStorage.getItem(POSITION_KEY);
            if (raw) {
                const pos = JSON.parse(raw);
                if (typeof pos.left === 'number' && typeof pos.top === 'number') {
                    return pos;
                }
            }
        } catch (e) {}
        return null;
    }

    function addTriggerButton() {
        if (document.getElementById('torn-emoji-trigger')) return;

        const btn = document.createElement('button');
        btn.id = 'torn-emoji-trigger';
        btn.innerText = '😀';
        btn.title = 'Open emoji picker (drag to move)';

        const savedPos = getSavedPosition();
        const left = savedPos ? savedPos.left : 12;
        const top = savedPos ? savedPos.top : (window.innerHeight - 64);

        btn.style.cssText = `
            position: fixed;
            left: ${left}px;
            top: ${top}px;
            width: 36px;
            height: 36px;
            border-radius: 50%;
            border: none;
            background: linear-gradient(135deg, #6a6a8a, #4a4a6a);
            color: #fff;
            font-size: 16px;
            cursor: grab;
            box-shadow: 0 4px 10px rgba(0,0,0,0.6);
            z-index: 999998;
            display: flex;
            align-items: center;
            justify-content: center;
            line-height: 1;
            transition: box-shadow 0.2s;
            user-select: none;
            touch-action: none;
        `;

        let isDragging = false;
        let dragMoved = false;
        let offsetX = 0;
        let offsetY = 0;

        function onPointerDown(e) {
            if (e.button !== 0 && e.pointerType === 'mouse') return;
            isDragging = true;
            dragMoved = false;
            const rect = btn.getBoundingClientRect();
            offsetX = e.clientX - rect.left;
            offsetY = e.clientY - rect.top;
            btn.style.cursor = 'grabbing';
            btn.style.transition = 'none';
            btn.setPointerCapture(e.pointerId);
            e.preventDefault();
        }

        function onPointerMove(e) {
            if (!isDragging) return;
            const dx = Math.abs(e.clientX - (btn.getBoundingClientRect().left + offsetX));
            const dy = Math.abs(e.clientY - (btn.getBoundingClientRect().top + offsetY));
            if (dx > 3 || dy > 3) dragMoved = true;

            let newLeft = e.clientX - offsetX;
            let newTop = e.clientY - offsetY;
            newLeft = Math.max(0, Math.min(newLeft, window.innerWidth - btn.offsetWidth));
            newTop = Math.max(0, Math.min(newTop, window.innerHeight - btn.offsetHeight));

            btn.style.left = newLeft + 'px';
            btn.style.top = newTop + 'px';
        }

        function onPointerUp(e) {
            if (!isDragging) return;
            isDragging = false;
            btn.style.cursor = 'grab';
            btn.style.transition = 'box-shadow 0.2s';
            try { btn.releasePointerCapture(e.pointerId); } catch (err) {}

            if (dragMoved) {
                const rect = btn.getBoundingClientRect();
                try {
                    localStorage.setItem(POSITION_KEY, JSON.stringify({
                        left: Math.round(rect.left),
                        top: Math.round(rect.top)
                    }));
                } catch (err) {}
            } else {
                const panel = createPanel();
                panel.style.display = 'block';
                panelOpen = true;
            }
        }

        btn.addEventListener('pointerdown', onPointerDown);
        btn.addEventListener('pointermove', onPointerMove);
        btn.addEventListener('pointerup', onPointerUp);
        btn.addEventListener('pointercancel', onPointerUp);

        btn.addEventListener('mouseenter', () => {
            if (!isDragging) btn.style.boxShadow = '0 6px 12px rgba(0,0,0,0.8)';
        });
        btn.addEventListener('mouseleave', () => {
            if (!isDragging) btn.style.boxShadow = '0 4px 10px rgba(0,0,0,0.6)';
        });

        btn.addEventListener('contextmenu', (e) => e.preventDefault());

        document.body.appendChild(btn);
    }

    // --- Tracking focus ---

    function trackFocus() {
        document.addEventListener('focusin', (e) => {
            const candidates = findInputs();
            for (const c of candidates) {
                if (e.target === c || e.target.closest('.chat-box') || e.target.closest('#chat')) {
                    lastChatInput = e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT' ? e.target : (e.target.isContentEditable ? e.target : c);
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

        const observer = new MutationObserver(() => {
            addTriggerButton();
            updateLastInput();
        });
        observer.observe(document.body, { childList: true, subtree: true });

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