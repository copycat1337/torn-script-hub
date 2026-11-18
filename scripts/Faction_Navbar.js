// ==UserScript==
// @name         Torn Faction Navbar Button
// @namespace    http://torn.city/
// @version      1.0
// @description  Adds a "Faction" button to the Torn sidebar that opens a navbar with links to H.O.F, Dash, Game and Scrips.
// @author       c0pyc4t 4039125
// @match        https://www.torn.com/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    // ---------- config ----------
    const LINKS = [
        { text: "H.O.F",  url: "https://hof.ghostprotocol.cyou/login" },
        { text: "Dash",   url: "https://torn-intel.com/" },
        { text: "Game",   url: "https://flash.ghostprotocol.cyou/" },
        { text: "Scrips", url: "https://hub.ghostprotocol.cyou/" },
    ];

    function injectMyDashboard() {
        const sidebar = document.querySelector("#sidebar");
        if (!sidebar || document.querySelector("#myDashboardBadge")) return;

        const nativeLink = sidebar.querySelector('a[class*="desktopLink___"]');
        if (!nativeLink) return;

        const nativeSvgWrap = nativeLink.querySelector('span[class*="svgIconWrap___"]');
        const nativeDefault = nativeLink.querySelector('span[class*="defaultIcon___"]');
        const nativeName    = nativeLink.querySelector('span[class*="linkName___"]');
        const isDark = document.body.classList.contains("dark-mode");

        /* ---------- container ---------- */
        const badge = document.createElement("div");
        badge.id = "myDashboardBadge";
        badge.style.cssText =
            `position:relative;background:${isDark ? "#333" : "#F2F2F2"};` +
            `border-radius:0 5px 5px 0;width:172px;box-sizing:border-box;margin-top:2px;`;

        /* ---------- trigger button ---------- */
        const link = document.createElement("a");
        link.href = "#";
        link.className = nativeLink.className;
        link.style.cssText = "display:flex;align-items:center;height:23px;cursor:pointer;";
        link.setAttribute("role", "button");
        link.setAttribute("aria-haspopup", "true");
        link.setAttribute("aria-expanded", "false");

        // Icon
        const iconWrap = document.createElement("span");
        if (nativeSvgWrap) iconWrap.className = nativeSvgWrap.className;
        const inner = document.createElement("span");
        if (nativeDefault) inner.className = nativeDefault.className;
        inner.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>`;
        iconWrap.appendChild(inner);
        link.appendChild(iconWrap);

        // Label
        const label = document.createElement("span");
        if (nativeName) label.className = nativeName.className;
        label.textContent = "Faction";
        link.appendChild(label);

        /* ---------- dropdown navbar ---------- */
        const menu = document.createElement("div");
        menu.id = "myFactionMenu";
        menu.style.cssText =
            `display:none;position:absolute;top:100%;left:0;z-index:9999;` +
            `min-width:172px;background:${isDark ? "#2b2b2b" : "#fff"};` +
            `border:1px solid ${isDark ? "#444" : "#ddd"};border-radius:0 0 5px 5px;` +
            `box-shadow:0 4px 12px rgba(0,0,0,.25);overflow:hidden;`;

        LINKS.forEach(item => {
            const a = document.createElement("a");
            a.href = item.url;
            a.target = "_blank";
            a.rel = "noopener noreferrer";
            a.textContent = item.text;
            a.style.cssText =
                `display:block;padding:8px 12px;color:${isDark ? "#eee" : "#222"};` +
                `text-decoration:none;font-size:13px;white-space:nowrap;`;
            a.addEventListener("mouseenter", () => a.style.background = isDark ? "#3a3a3a" : "#f2f2f2");
            a.addEventListener("mouseleave", () => a.style.background = "transparent");
            menu.appendChild(a);
        });

        /* ---------- open / close ---------- */
        const closeMenu = () => {
            menu.style.display = "none";
            link.setAttribute("aria-expanded", "false");
        };
        const openMenu = () => {
            menu.style.display = "block";
            link.setAttribute("aria-expanded", "true");
        };

        link.addEventListener("click", e => {
            e.preventDefault();
            e.stopPropagation();
            (menu.style.display === "block") ? closeMenu() : openMenu();
        });

        document.addEventListener("pointerdown", e => {
            if (!badge.contains(e.target)) closeMenu();
        });
        document.addEventListener("keydown", e => {
            if (e.key === "Escape") closeMenu();
        });

        badge.appendChild(link);
        badge.appendChild(menu);

        /* ---------- insert into sidebar ---------- */
        const anchor = sidebar.querySelector("#nav-calendar");
        if (anchor?.parentElement) {
            anchor.parentElement.insertBefore(badge, anchor.nextSibling);
        } else {
            sidebar.appendChild(badge);
        }
    }

    // ---------- wait for sidebar to render (Torn is a SPA) ----------
    function tryInject() {
        if (document.querySelector("#sidebar")) {
            injectMyDashboard();
        }
    }

    // Initial attempt
    tryInject();

    // Retry a few times in case sidebar loads late
    let tries = 0;
    const iv = setInterval(() => {
        tryInject();
        if (document.querySelector("#myDashboardBadge") || ++tries > 40) clearInterval(iv);
    }, 500);

    // Re-inject on SPA navigation (URL changes)
    let lastUrl = location.href;
    new MutationObserver(() => {
        if (location.href !== lastUrl) {
            lastUrl = location.href;
            // sidebar may be re-rendered; give it a moment
            setTimeout(tryInject, 500);
        }
    }).observe(document.body, { childList: true, subtree: true });
})();