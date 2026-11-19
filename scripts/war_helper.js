// ==UserScript==
// @name         Torn Custom Lists (Sidebar Dashboard v12)
// @namespace    http://torn.com/
// @version      12.0
// @description  Custom lists (Friends/Enemies/Targets) accessible from a native Torn sidebar item, with export/import and clear.
// @author       c0pyc4t 4039125
// @match        https://www.torn.com/*
// @grant        GM_setValue
// @grant        GM_getValue
// ==/UserScript==

(function() {
    'use strict';

    const STORAGE_KEYS = {
        friends: 'torn_custom_friends',
        enemies: 'torn_custom_enemies',
        targets: 'torn_custom_targets'
    };

    // --- Helpers ---
    function getList(key) { return GM_getValue(key, []); }
    function saveList(key, data) { GM_setValue(key, data); }

    function listIconSvg() {
        return `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="8" y1="6" x2="21" y2="6"></line>
            <line x1="8" y1="12" x2="21" y2="12"></line>
            <line x1="8" y1="18" x2="21" y2="18"></line>
            <line x1="3" y1="6" x2="3.01" y2="6"></line>
            <line x1="3" y1="12" x2="3.01" y2="12"></line>
            <line x1="3" y1="18" x2="3.01" y2="18"></line>
        </svg>`;
    }

    // ============================================================
    // 1. Sidebar item
    // ============================================================
    function injectSidebarItem() {
        const sidebar = document.querySelector("#sidebar");
        if (!sidebar || document.querySelector("#customListsBadge")) return;

        const nativeLink      = sidebar.querySelector('a[class*="desktopLink___"]');
        const nativeSvgWrap   = nativeLink?.querySelector('span[class*="svgIconWrap___"]');
        const nativeDefaultIc = nativeLink?.querySelector('span[class*="defaultIcon___"]');
        const nativeLinkName  = nativeLink?.querySelector('span[class*="linkName___"]');
        if (!nativeLink) return;

        const isDark = document.body.classList.contains("dark-mode");

        const badge = document.createElement("div");
        badge.id = "customListsBadge";
        badge.style.cssText = `
            background: ${isDark ? "#333" : "#F2F2F2"};
            padding: 0;
            border-radius: 0 5px 5px 0;
            width: 172px;
            height: 23px;
            box-sizing: border-box;
            margin-top: 2px;
            display: flex;
            align-items: center;
        `;

        const link = document.createElement("a");
        link.href = "#";
        link.className = nativeLink.className;
        link.style.cssText = "display:flex;align-items:center;height:100%;text-decoration:none;";
        link.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            togglePicker();
        });

        const iconWrap = document.createElement("span");
        if (nativeSvgWrap) iconWrap.className = nativeSvgWrap.className;
        iconWrap.style.cssText = "margin:0;padding:0;line-height:0;display:inline-flex;align-items:center;justify-content:center;width:24px;";

        const innerIcon = document.createElement("span");
        if (nativeDefaultIc) innerIcon.className = nativeDefaultIc.className;
        innerIcon.style.cssText = "margin:0;padding:0;line-height:0;display:inline-flex;align-items:center;justify-content:center;color:" + (isDark ? "#bbb" : "#555") + ";";
        innerIcon.innerHTML = listIconSvg();
        iconWrap.appendChild(innerIcon);
        link.appendChild(iconWrap);

        const text = document.createElement("span");
        if (nativeLinkName) text.className = nativeLinkName.className;
        text.textContent = "Custom Lists";
        link.appendChild(text);

        badge.appendChild(link);

        const navCalendar = sidebar.querySelector("#nav-calendar");
        if (navCalendar && navCalendar.parentElement) {
            navCalendar.parentElement.insertBefore(badge, navCalendar.nextSibling);
        } else {
            const areaDesktop = sidebar.querySelector('[class*="area-desktop___"]');
            if (areaDesktop && areaDesktop.parentElement) {
                areaDesktop.parentElement.insertBefore(badge, areaDesktop);
            } else {
                const areas = sidebar.querySelector('[class*="areas___"]');
                (areas || sidebar).appendChild(badge);
            }
        }
    }

    // ============================================================
    // 2. Toggle behavior (open/close picker)
    // ============================================================
    function togglePicker() {
        const existing = document.getElementById("custom-lists-picker");
        if (existing) {
            existing.remove();
        } else {
            openListPicker();
        }
    }

    function closePicker() {
        const p = document.getElementById("custom-lists-picker");
        if (p) p.remove();
    }

    // ============================================================
    // 3. Picker (list selector + export/import)
    // ============================================================
    function openListPicker() {
        // Close any existing picker first
        closePicker();

        const isDark = document.body.classList.contains("dark-mode");

        const picker = document.createElement("div");
        picker.id = "custom-lists-picker";
        picker.style.cssText = `
            position: fixed;
            top: 80px;
            left: 180px;
            width: 220px;
            background: ${isDark ? "#1e1e1e" : "#fff"};
            border: 1px solid ${isDark ? "#444" : "#ccc"};
            border-radius: 5px;
            z-index: 99999;
            font-family: Arial, sans-serif;
            box-shadow: 0 4px 15px rgba(0,0,0,0.5);
            display: flex;
            flex-direction: column;
            overflow: hidden;
        `;

        const header = document.createElement("div");
        header.textContent = "Custom Lists";
        header.style.cssText = `
            background: linear-gradient(180deg, #5a7c3a 0%, #3f5a28 100%);
            color: #fff; padding: 6px 10px; font-weight: bold; font-size: 12px;
        `;
        picker.appendChild(header);

        const content = document.createElement("div");
        content.style.cssText = "padding: 4px; display: flex; flex-direction: column; gap: 2px;";

        const lists = [
            { id: "friends", label: "Friends", icon: "👤+" },
            { id: "enemies", label: "Enemies", icon: "👤-" },
            { id: "targets", label: "Targets", icon: "🎯" }
        ];

        lists.forEach(list => {
            const row = document.createElement("div");
            row.style.cssText = `
                display: flex; justify-content: space-between; align-items: center;
                padding: 7px 10px; background: ${isDark ? "#2a2a2a" : "#f0f0f0"};
                color: ${isDark ? "#ccc" : "#333"}; cursor: pointer; font-size: 13px; border-radius: 3px;
            `;
            row.onmouseover = () => row.style.background = isDark ? "#383838" : "#e0e0e0";
            row.onmouseout  = () => row.style.background = isDark ? "#2a2a2a" : "#f0f0f0";

            const left = document.createElement("div");
            left.style.cssText = "display: flex; align-items: center; gap: 8px;";
            left.innerHTML = `<span style="opacity: 0.7;">${list.icon}</span> <span style="font-weight: bold;">${list.label}</span>`;

            const right = document.createElement("div");
            right.style.cssText = "display: flex; align-items: center; gap: 6px; color: #888;";
            right.innerHTML = `<span class="cat-count-${list.id}">${getList(STORAGE_KEYS[list.id]).length}</span> <span style="font-size:10px;">▶</span>`;

            row.appendChild(left);
            row.appendChild(right);
            row.onclick = () => {
                closePicker();
                openListPopup(list.id, list.label);
            };
            content.appendChild(row);
        });

        picker.appendChild(content);

        // --- Footer: Export / Import ---
        const footer = document.createElement("div");
        footer.style.cssText = `
            display: flex; gap: 4px; padding: 6px 6px; border-top: 1px solid ${isDark ? "#333" : "#ddd"};
            background: ${isDark ? "#181818" : "#f8f8f8"};
        `;

        const exportBtn = document.createElement("button");
        exportBtn.textContent = "⬇ Export";
        exportBtn.title = "Export all lists to a JSON file";
        exportBtn.style.cssText = `
            flex: 1; padding: 6px 4px; background: ${isDark ? "#2a2a2a" : "#e8e8e8"};
            color: ${isDark ? "#ccc" : "#333"}; border: 1px solid ${isDark ? "#444" : "#ccc"};
            border-radius: 3px; cursor: pointer; font-size: 11px; font-weight: bold;
        `;
        exportBtn.onclick = exportAll;

        const importBtn = document.createElement("button");
        importBtn.textContent = "⬆ Import";
        importBtn.title = "Import lists from a JSON file";
        importBtn.style.cssText = `
            flex: 1; padding: 6px 4px; background: ${isDark ? "#2a2a2a" : "#e8e8e8"};
            color: ${isDark ? "#ccc" : "#333"}; border: 1px solid ${isDark ? "#444" : "#ccc"};
            border-radius: 3px; cursor: pointer; font-size: 11px; font-weight: bold;
        `;
        importBtn.onclick = () => importFromFile(() => {
            // Refresh counts after import
            document.querySelectorAll(".cat-count-friends").forEach(el => el.textContent = getList(STORAGE_KEYS.friends).length);
            document.querySelectorAll(".cat-count-enemies").forEach(el => el.textContent = getList(STORAGE_KEYS.enemies).length);
            document.querySelectorAll(".cat-count-targets").forEach(el => el.textContent = getList(STORAGE_KEYS.targets).length);
        });

        footer.appendChild(exportBtn);
        footer.appendChild(importBtn);
        picker.appendChild(footer);

        document.body.appendChild(picker);

        // Close on outside click
        setTimeout(() => {
            const close = (e) => {
                if (!picker.contains(e.target) && !e.target.closest("#customListsBadge")) {
                    picker.remove();
                    document.removeEventListener("mousedown", close);
                }
            };
            document.addEventListener("mousedown", close);
        }, 0);
    }

    // ============================================================
    // 4. Export / Import
    // ============================================================
    function exportAll() {
        const data = {
            version: 1,
            exportedAt: new Date().toISOString(),
            lists: {
                friends: getList(STORAGE_KEYS.friends),
                enemies: getList(STORAGE_KEYS.enemies),
                targets: getList(STORAGE_KEYS.targets)
            }
        };
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
        a.href = url;
        a.download = `torn-custom-lists-${stamp}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    function importFromFile(onDone) {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = "application/json,.json";
        input.style.display = "none";
        input.onchange = () => {
            const file = input.files[0];
            if (!file) { input.remove(); return; }
            const reader = new FileReader();
            reader.onload = () => {
                try {
                    const parsed = JSON.parse(reader.result);
                    if (!parsed || typeof parsed !== "object" || !parsed.lists) {
                        throw new Error("Invalid file: missing 'lists' object.");
                    }

                    const mode = confirm(
                        "Import mode:\n\n" +
                        "OK = MERGE (add imported entries, keep existing)\n" +
                        "Cancel = REPLACE (overwrite current lists)"
                    ) ? "merge" : "replace";

                    let totalImported = 0;
                    for (const key of ["friends", "enemies", "targets"]) {
                        const incoming = Array.isArray(parsed.lists[key]) ? parsed.lists[key] : [];
                        if (incoming.length === 0) continue;

                        // Validate & normalize each entry
                        const cleaned = incoming
                            .filter(e => e && typeof e === "object" && e.userId != null)
                            .map(e => ({
                                name: String(e.name || "Unknown"),
                                userId: String(e.userId),
                                comment: String(e.comment || ""),
                                timestamp: Number(e.timestamp) || Date.now()
                            }));

                        if (mode === "replace") {
                            saveList(STORAGE_KEYS[key], cleaned);
                            totalImported += cleaned.length;
                        } else {
                            // Merge, dedupe by userId
                            const existing = getList(STORAGE_KEYS[key]);
                            const map = new Map();
                            for (const e of existing) map.set(String(e.userId), e);
                            for (const e of cleaned) map.set(String(e.userId), e);
                            const merged = Array.from(map.values());
                            saveList(STORAGE_KEYS[key], merged);
                            totalImported += cleaned.length;
                        }
                    }

                    alert(`Import complete (${mode}). ${totalImported} entries processed.`);
                    if (typeof onDone === "function") onDone();
                } catch (err) {
                    alert("Import failed: " + (err.message || err));
                } finally {
                    input.remove();
                }
            };
            reader.onerror = () => {
                alert("Could not read the file.");
                input.remove();
            };
            reader.readAsText(file);
        };
        document.body.appendChild(input);
        input.click();
    }

    // ============================================================
    // 5. List popup (view / add / delete / clear)
    // ============================================================
    function openListPopup(listId, listLabel) {
        const existing = document.getElementById("custom-list-popup");
        if (existing) existing.remove();
        window.activeRenderFunction = null;

        const overlay = document.createElement("div");
        overlay.id = "custom-list-popup";
        overlay.style.cssText = `
            position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background: rgba(0,0,0,0.8); display: flex; justify-content: center; align-items: center; z-index: 100000;
        `;

        const popup = document.createElement("div");
        popup.style.cssText = `
            background: #1e1e1e; color: #ccc; width: 900px; max-width: 95%; max-height: 85vh;
            border-radius: 5px; box-shadow: 0 4px 20px rgba(0,0,0,0.7);
            display: flex; flex-direction: column; border: 1px solid #444; font-family: Arial, sans-serif;
        `;

        // --- Header ---
        const header = document.createElement("div");
        header.style.cssText = `
            padding: 10px 15px; background: #2a2a2a; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #444;
        `;

        const headerLeft = document.createElement("div");
        headerLeft.style.cssText = "display:flex; align-items:center; gap:12px;";
        headerLeft.innerHTML = `<h3 style="margin:0; color:#fff; font-size:16px;">${listLabel}</h3>`;

        const clearBtn = document.createElement("button");
        clearBtn.textContent = "🗑 Clear list";
        clearBtn.title = "Remove all entries from this list";
        clearBtn.style.cssText = `
            background: #8b2c2c; color: #fff; border: none; border-radius: 3px;
            padding: 5px 10px; cursor: pointer; font-size: 12px; font-weight: bold;
        `;
        clearBtn.onclick = () => {
            const current = getList(STORAGE_KEYS[listId]);
            if (current.length === 0) {
                alert("This list is already empty.");
                return;
            }
            if (!confirm(`Delete ALL ${current.length} entries from "${listLabel}"?\n\nThis cannot be undone (unless you have an export).`)) return;
            saveList(STORAGE_KEYS[listId], []);
            renderTable();
        };
        headerLeft.appendChild(clearBtn);

        const headerRight = document.createElement("div");
        headerRight.style.cssText = "display:flex; align-items:center; gap:10px;";

        const exportOneBtn = document.createElement("button");
        exportOneBtn.textContent = "⬇ Export";
        exportOneBtn.title = `Export "${listLabel}" list to a JSON file`;
        exportOneBtn.style.cssText = `
            background: #444; color: #ccc; border: 1px solid #555; border-radius: 3px;
            padding: 5px 10px; cursor: pointer; font-size: 12px;
        `;
        exportOneBtn.onclick = () => {
            const data = {
                version: 1,
                exportedAt: new Date().toISOString(),
                lists: { [listId]: getList(STORAGE_KEYS[listId]) }
            };
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
            a.href = url;
            a.download = `torn-custom-${listId}-${stamp}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(() => URL.revokeObjectURL(url), 1000);
        };
        headerRight.appendChild(exportOneBtn);

        const closeBtn = document.createElement("button");
        closeBtn.textContent = "✕";
        closeBtn.style.cssText = `background: none; border: none; color: #aaa; font-size: 20px; cursor: pointer;`;
        closeBtn.onclick = () => { window.activeRenderFunction = null; overlay.remove(); };
        headerRight.appendChild(closeBtn);

        header.appendChild(headerLeft);
        header.appendChild(headerRight);

        // --- Input row ---
        const inputArea = document.createElement("div");
        inputArea.style.cssText = `padding: 10px 15px; display: flex; gap: 10px; border-bottom: 1px solid #333; background: #222;`;

        const nameInput = document.createElement("input");
        nameInput.placeholder = "Name";
        nameInput.style.cssText = `flex: 1; padding: 8px; background: #111; color: #fff; border: 1px solid #444; border-radius: 4px;`;

        const idInput = document.createElement("input");
        idInput.placeholder = "User ID";
        idInput.type = "number";
        idInput.style.cssText = `width: 100px; padding: 8px; background: #111; color: #fff; border: 1px solid #444; border-radius: 4px;`;

        const commentInput = document.createElement("input");
        commentInput.placeholder = "Comment";
        commentInput.style.cssText = `flex: 2; padding: 8px; background: #111; color: #fff; border: 1px solid #444; border-radius: 4px;`;

        const addBtn = document.createElement("button");
        addBtn.textContent = "Add Entry";
        addBtn.style.cssText = `padding: 8px 15px; background: #5a7c3a; color: #fff; border: none; border-radius: 4px; cursor: pointer; font-weight: bold;`;

        const addEntry = () => {
            const name = nameInput.value.trim();
            const userId = idInput.value.trim();
            const comment = commentInput.value.trim();
            if (!name) return alert("Enter a name.");
            if (!userId) return alert("Enter a User ID.");
            const list = getList(STORAGE_KEYS[listId]);
            list.push({ name, userId, comment, timestamp: Date.now() });
            saveList(STORAGE_KEYS[listId], list);
            nameInput.value = ""; idInput.value = ""; commentInput.value = "";
            renderTable();
        };

        addBtn.onclick = addEntry;
        [nameInput, idInput, commentInput].forEach(inp =>
            inp.addEventListener("keypress", e => e.key === "Enter" && addEntry())
        );

        inputArea.appendChild(nameInput);
        inputArea.appendChild(idInput);
        inputArea.appendChild(commentInput);
        inputArea.appendChild(addBtn);

        // --- Table ---
        const tableContainer = document.createElement("div");
        tableContainer.style.cssText = `padding: 15px; overflow-y: auto; flex: 1; min-height: 300px;`;

        function renderTable() {
            const list = getList(STORAGE_KEYS[listId]);
            if (list.length === 0) {
                tableContainer.innerHTML = `<p style="color:#777; text-align:center;">No entries yet.</p>`;
                return;
            }
            let html = `
                <table style="width:100%; border-collapse: collapse; font-size: 13px;">
                    <thead>
                        <tr style="border-bottom: 2px solid #444; color: #888; text-align: left;">
                            <th style="padding: 8px;">Name</th>
                            <th style="padding: 8px;">ID</th>
                            <th style="padding: 8px;">Comment</th>
                            <th style="padding: 8px;">Added</th>
                            <th style="padding: 8px; text-align:center;">Actions</th>
                            <th style="padding: 8px; width: 40px; text-align:center;">Del</th>
                        </tr>
                    </thead>
                    <tbody>
            `;
            list.forEach((entry, index) => {
                const date = new Date(entry.timestamp).toLocaleDateString();
                const profileUrl = `https://www.torn.com/profiles.php?XID=${entry.userId}`;
                const attackUrl  = `https://www.torn.com/page.php?sid=attack&user2ID=${entry.userId}`;
                html += `
                    <tr style="border-bottom: 1px solid #2a2a2a;">
                        <td style="padding: 8px; font-weight: bold;">
                            <a href="${profileUrl}" target="_blank" style="color: #fff; text-decoration: none; border-bottom: 1px dotted #fff;">${entry.name}</a>
                        </td>
                        <td style="padding: 8px; color: #888;">${entry.userId}</td>
                        <td style="padding: 8px; color: #aaa;">${entry.comment || '-'}</td>
                        <td style="padding: 8px; color: #666;">${date}</td>
                        <td style="padding: 8px; text-align:center;">
                            <a href="${attackUrl}" target="_blank" style="background:#8b2c2c; color:#fff; text-decoration: none; padding: 4px 8px; border-radius: 3px; font-size:12px; font-weight:bold;">⚔️ Attack</a>
                        </td>
                        <td style="padding: 8px; text-align:center;">
                            <button class="remove-btn" data-index="${index}" style="background:#444; color:#fff; border:none; border-radius:3px; padding:4px 8px; cursor:pointer;">✕</button>
                        </td>
                    </tr>
                `;
            });
            html += "</tbody></table>";
            tableContainer.innerHTML = html;
            tableContainer.querySelectorAll(".remove-btn").forEach(btn => {
                btn.onclick = () => {
                    const idx = parseInt(btn.dataset.index);
                    const currentList = getList(STORAGE_KEYS[listId]);
                    currentList.splice(idx, 1);
                    saveList(STORAGE_KEYS[listId], currentList);
                    renderTable();
                };
            });
        }

        renderTable();
        window.activeRenderFunction = renderTable;

        popup.appendChild(header);
        popup.appendChild(inputArea);
        popup.appendChild(tableContainer);
        overlay.appendChild(popup);

        overlay.addEventListener("click", (e) => {
            if (e.target === overlay) { window.activeRenderFunction = null; overlay.remove(); }
        });

        document.body.appendChild(overlay);
    }

    // ============================================================
    // 6. Keep the sidebar item alive
    // ============================================================
    function watchSidebar() {
        let lastTry = 0;
        let retryDelay = 500;
        const obs = new MutationObserver(() => {
            const badge = document.getElementById("customListsBadge");
            if (badge && badge.isConnected) return;
            const now = Date.now();
            if (now - lastTry < retryDelay) return;
            lastTry = now;
            injectSidebarItem();
            if (!document.getElementById("customListsBadge")) {
                retryDelay = Math.min(retryDelay * 2, 10000);
            } else {
                retryDelay = 500;
            }
        });
        obs.observe(document.body, { childList: true, subtree: true });
        window.addEventListener("hashchange", () => {
            retryDelay = 500;
            setTimeout(injectSidebarItem, 300);
        });
    }

    // ============================================================
    // 7. Init
    // ============================================================
    function init() {
        injectSidebarItem();
        watchSidebar();
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})();