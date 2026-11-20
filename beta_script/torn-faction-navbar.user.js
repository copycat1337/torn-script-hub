// ==UserScript==
// @name         Torn Faction Navbar Button
// @namespace    http://torn.city/
// @version      1.1
// @description  Adds a "Faction" button to the Torn sidebar that opens a navbar with links to H.O.F, Dash, Game and Scrips.
// @author       c0pyc4t 4039125
// @match        https://www.torn.com/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    const LOG = (...a) => console.log('[FactionNav]', ...a);

    // ---------- config ----------
    const LINKS = [
        { text: "H.O.F",  url: "https://hof.ghostprotocol.cyou/login" },
        { text: "Dash",   url: "https://torn-intel.com/" },
        { text: "Game",   url: "https://flash.ghostprotocol.cyou/" },
        { text: "Scrips", url: "https://hub.ghostprotocol.cyou/" },
    ];

    const isDark = () => document.body.classList.contains("dark-mode");

    // Robust sidebar lookup. #sidebar has been stable for years, but we add
    // fallbacks in case Torn wraps it again.
    function findSidebar() {
        return (
            document.querySelector("#sidebar") ||
            document.querySelector('[id*="sidebar"]') ||
            document.querySelector('nav[class*="sidebar"]') ||
            document.querySelector('[class*="sidebarRoot"]') ||
            null
        );
    }

    // Try to grab a native sidebar link so we can mirror its classes for
    // visual consistency. NEVER fail injection if this is missing.
    function findNativeLink(sidebar) {
        const candidates = [
            'a[class*="desktopLink___"]',
            'a[class*="sidebarLink___"]',
            'a[class*="navLink___"]',
            '#nav-home a',
            '#nav-items a',
            '#nav-profile a',
            'a[href*="/index.php"]',
            'a[href*="/home.php"]',
            'a[href*="profile.php"]',
        ];
        for (const sel of candidates) {
            const el = sidebar.querySelector(sel);
            if (el) { LOG('native link found via', sel); return el; }
        }
        LOG('no native link matched, using fallback styling');
        return null;
    }

    // Find a stable insertion anchor inside the sidebar.
    function findInsertionAnchor(sidebar) {
        const candidates = [
            '#nav-calendar',
            '#nav-items',
            '#nav-home',
            '#nav-profile',
            '[id^="nav-"]',
        ];
        for (const sel of candidates) {
            const el = sidebar.querySelector(sel);
            if (el && el.parentElement) { LOG('anchor found via', sel); return el; }
        }
        // Fallback: the last <a> in the sidebar.
        const links = sidebar.querySelectorAll('a');
        if (links.length) {
            const last = links[links.length - 1];
            LOG('anchor = last sidebar link');
            return last;
        }
        LOG('anchor = sidebar.appendChild');
        return null;
    }

    function injectMyDashboard() {
        const sidebar = findSidebar();
        if (!sidebar) { LOG('no sidebar yet'); return; }

        // If our badge already lives in THIS sidebar, do nothing.
        const existing = sidebar.querySelector("#myDashboardBadge");
        if (existing) return;

        const nativeLink = findNativeLink(sidebar);
        const nativeSvgWrap = nativeLink?.querySelector('span[class*="svgIconWrap___"]') || null;
        const nativeDefault = nativeLink?.querySelector('span[class*="defaultIcon___"]') || null;
        const nativeName    = nativeLink?.querySelector('span[class*="linkName___"]') || null;
        const dark = isDark();

        /* ---------- container ---------- */
        const badge = document.createElement("div");
        badge.id = "myDashboardBadge";
        badge.style.cssText =
            `position:relative;background:${dark ? "#333" : "#F2F2F2"};` +
            `border-radius:0 5px 5px 0;width:172px;box-sizing:border-box;margin-top:2px;`;

        /* ---------- trigger button ---------- */
        const link = document.createElement("a");
        link.href = "#";
        if (nativeLink) link.className = nativeLink.className;
        link.style.cssText =
            "display:flex;align-items:center;gap:8px;height:23px;padding:0 10px;" +
            "cursor:pointer;text-decoration:none;color:inherit;";
        link.setAttribute("role", "button");
        link.setAttribute("aria-haspopup", "true");
        link.setAttribute("aria-expanded", "false");
        link.setAttribute("data-faction-nav", "trigger");

        // Icon
        const iconWrap = document.createElement("span");
        if (nativeSvgWrap) iconWrap.className = nativeSvgWrap.className;
        iconWrap.style.cssText = "display:inline-flex;align-items:center;justify-content:center;width:16px;height:16px;";
        const inner = document.createElement("span");
        if (nativeDefault) inner.className = nativeDefault.className;
        inner.style.cssText = "display:inline-flex;align-items:center;justify-content:center;";
        inner.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>`;
        iconWrap.appendChild(inner);
        link.appendChild(iconWrap);

        // Label
        const label = document.createElement("span");
        if (nativeName) label.className = nativeName.className;
        label.style.cssText = "font-size:12px;line-height:1;white-space:nowrap;";
        label.textContent = "Faction";
        link.appendChild(label);

        /* ---------- dropdown navbar (rendered to <body> to escape clipping) ---------- */
        const menu = document.createElement("div");
        menu.id = "myFactionMenu";
        menu.setAttribute("data-faction-nav", "menu");
        menu.style.cssText =
            `display:none;position:fixed;z-index:2147483647;` +
            `min-width:172px;background:${dark ? "#2b2b2b" : "#fff"};` +
            `border:1px solid ${dark ? "#444" : "#ddd"};border-radius:0 0 5px 5px;` +
            `box-shadow:0 4px 12px rgba(0,0,0,.35);overflow:hidden;padding:2px 0;`;

        LINKS.forEach(item => {
            const a = document.createElement("a");
            a.href = item.url;
            a.target = "_blank";
            a.rel = "noopener noreferrer";
            a.textContent = item.text;
            a.style.cssText =
                `display:block;padding:8px 12px;color:${dark ? "#eee" : "#222"};` +
                `text-decoration:none;font-size:13px;white-space:nowrap;`;
            a.addEventListener("mouseenter", () => a.style.background = dark ? "#3a3a3a" : "#f2f2f2");
            a.addEventListener("mouseleave", () => a.style.background = "transparent");
            menu.appendChild(a);
        });

        /* ---------- open / close ---------- */
        let open = false;

        const positionMenu = () => {
            const r = link.getBoundingClientRect();
            // Open to the right of the button; if it would overflow the viewport,
            // flip to the left side of the button.
            const menuW = menu.offsetWidth || 172;
            let left = r.right;
            if (left + menuW > window.innerWidth - 4) left = r.left - menuW;
            if (left < 4) left = 4;
            menu.style.left = left + "px";
            menu.style.top  = r.top + "px";
        };

        const closeMenu = () => {
            menu.style.display = "none";
            link.setAttribute("aria-expanded", "false");
            open = false;
        };
        const openMenu = () => {
            if (!menu.isConnected) document.body.appendChild(menu);
            menu.style.display = "block";
            positionMenu();
            link.setAttribute("aria-expanded", "true");
            open = true;
        };

        link.addEventListener("click", e => {
            e.preventDefault();
            e.stopPropagation();
            open ? closeMenu() : openMenu();
        });

        // Close when clicking outside. Use pointerdown but ignore presses
        // that originate inside either the trigger or the menu.
        document.addEventListener("pointerdown", e => {
            if (!open) return;
            if (badge.contains(e.target) || menu.contains(e.target)) return;
            closeMenu();
        });
        document.addEventListener("keydown", e => {
            if (e.key === "Escape") closeMenu();
        });
        // Reposition / close on scroll & resize while open.
        window.addEventListener("scroll", () => { if (open) positionMenu(); }, { passive: true });
        window.addEventListener("resize", () => { if (open) positionMenu(); });

        badge.appendChild(link);

        /* ---------- insert into sidebar ---------- */
        const anchor = findInsertionAnchor(sidebar);
        if (anchor && anchor.parentElement) {
            anchor.parentElement.insertBefore(badge, anchor.nextSibling);
        } else {
            sidebar.appendChild(badge);
        }

        LOG('injected');
    }

    // ---------- wait for sidebar to render (Torn is a SPA) ----------
    function tryInject() {
        injectMyDashboard();
    }

    // Initial attempt
    tryInject();

    // Retry a few times in case sidebar loads late
    let tries = 0;
    const iv = setInterval(() => {
        tryInject();
        const sb = findSidebar();
        if ((sb && sb.querySelector("#myDashboardBadge")) || ++tries > 40) clearInterval(iv);
    }, 500);

    // Re-inject on SPA navigation (URL changes). Torn re-renders the sidebar,
    // which destroys our badge; MutationObserver catches the URL change and we
    // retry shortly after.
    let lastUrl = location.href;
    new MutationObserver(() => {
        if (location.href !== lastUrl) {
            lastUrl = location.href;
            setTimeout(tryInject, 300);
            setTimeout(tryInject, 800);
        }
    }).observe(document.body, { childList: true, subtree: true });
})();
