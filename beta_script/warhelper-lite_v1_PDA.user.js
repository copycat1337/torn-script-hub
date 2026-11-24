// ==UserScript==
// @name        TORN War Helper (Lite + FFScouter)
// @namespace   finally.torn.warhelper.lite
// @version     20261121.2
// @description War Overview dashboard, quick-attack button, favorite-member pinning, dark-mode-aware overlays, FFScouter FF stat spies, and FFScouter premium flight-time tracker. Stripped rebuild: no TornStats/BSP/YATA, no Seintz server features (Dibs, stored loadouts).
// @author      finally [2060206] et al. - lite rebuild
// @license     GNU GPLv3
// @run-at      document-start
// @match       https://www.torn.com/factions.php*
// @match       https://www.torn.com/war.php?step=rankreport*
// @grant       GM_xmlhttpRequest
// @grant       GM_addStyle
// @grant       GM_getValue
// @grant       GM_setValue
// @grant       unsafeWindow
// @connect     api.torn.com
// @connect     ffscouter.com
// @connect     nstorn.gitlab.io
// ==/UserScript==


(function () {
  const uw = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
  if (uw.__WARHELPER_RUNNING) return;
  uw.__WARHELPER_RUNNING = true;
"use strict";
(() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __esm = (fn, res) => function __init() {
    return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
  };
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };

  // src/Platform.ts
  function jsonParse(value) {
    try {
      return JSON.parse(value);
    } catch {
      return void 0;
    }
  }
  function isPDA() {
    return window.flutter !== void 0 || window.flutter_inappwebview !== void 0;
  }
  var init_Platform = __esm({
    "src/Platform.ts"() {
      "use strict";
    }
  });

  // src/SecretStore.ts
  function createSecretStore() {
    if (isPDA()) {
      return typeof PDA_storage !== "undefined" ? new PdaSecretStore() : new LocalStorageSecretStore();
    }
    if (typeof GM_getValue === "function" && typeof GM_setValue === "function") {
      return new GmSecretStore();
    }
    return new LocalStorageSecretStore();
  }
  var STORAGE_KEY, PdaSecretStore, GmSecretStore, LocalStorageSecretStore;
  var init_SecretStore = __esm({
    "src/SecretStore.ts"() {
      "use strict";
      init_Platform();
      STORAGE_KEY = "__warhelper_secrets";
      PdaSecretStore = class {
        constructor() {
          this.name = "PDA_storage";
          this.isolated = true;
        }
        async load() {
          const value = await PDA_storage.get(STORAGE_KEY, {});
          return value && typeof value === "object" ? value : {};
        }
        async save(secrets) {
          await PDA_storage.set(STORAGE_KEY, secrets);
        }
      };
      GmSecretStore = class {
        constructor() {
          this.name = "GM_setValue";
          this.isolated = true;
        }
        load() {
          const value = GM_getValue(STORAGE_KEY, {});
          return value && typeof value === "object" ? value : {};
        }
        save(secrets) {
          GM_setValue(STORAGE_KEY, secrets);
        }
      };
      LocalStorageSecretStore = class {
        constructor() {
          this.name = "localStorage";
          this.isolated = false;
        }
        load() {
          return jsonParse(localStorage.getItem(STORAGE_KEY) || "") || {};
        }
        save(secrets) {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(secrets));
        }
      };
    }
  });

  // src/ChaCha20.ts
  function rotl(value, bits) {
    return value << bits | value >>> 32 - bits;
  }
  function quarterRound(s, a, b, c, d) {
    s[a] = s[a] + s[b] >>> 0;
    s[d] = rotl(s[d] ^ s[a], 16);
    s[c] = s[c] + s[d] >>> 0;
    s[b] = rotl(s[b] ^ s[c], 12);
    s[a] = s[a] + s[b] >>> 0;
    s[d] = rotl(s[d] ^ s[a], 8);
    s[c] = s[c] + s[d] >>> 0;
    s[b] = rotl(s[b] ^ s[c], 7);
  }
  function chacha20(key, nonce, data, counter = 0) {
    if (key.length !== 32 || nonce.length !== 12) {
      throw new Error("chacha20: key must be 32 bytes and nonce 12 bytes");
    }
    const keyView = new DataView(key.buffer, key.byteOffset, key.byteLength);
    const nonceView = new DataView(nonce.buffer, nonce.byteOffset, nonce.byteLength);
    const state = new Uint32Array(16);
    state.set(SIGMA);
    for (let i = 0; i < 8; i++) {
      state[4 + i] = keyView.getUint32(i * 4, true);
    }
    state[12] = counter >>> 0;
    for (let i = 0; i < 3; i++) {
      state[13 + i] = nonceView.getUint32(i * 4, true);
    }
    const out = new Uint8Array(data.length);
    const block = new Uint32Array(16);
    const keystream = new Uint8Array(64);
    const keystreamView = new DataView(keystream.buffer);
    for (let offset = 0; offset < data.length; offset += 64) {
      block.set(state);
      for (let round = 0; round < 10; round++) {
        quarterRound(block, 0, 4, 8, 12);
        quarterRound(block, 1, 5, 9, 13);
        quarterRound(block, 2, 6, 10, 14);
        quarterRound(block, 3, 7, 11, 15);
        quarterRound(block, 0, 5, 10, 15);
        quarterRound(block, 1, 6, 11, 12);
        quarterRound(block, 2, 7, 8, 13);
        quarterRound(block, 3, 4, 9, 14);
      }
      for (let i = 0; i < 16; i++) {
        keystreamView.setUint32(i * 4, block[i] + state[i] >>> 0, true);
      }
      const length = Math.min(64, data.length - offset);
      for (let i = 0; i < length; i++) {
        out[offset + i] = data[offset + i] ^ keystream[i];
      }
      state[12] = state[12] + 1 >>> 0;
    }
    return out;
  }
  function bytesToLatin1(bytes) {
    const chunks = [];
    for (let i = 0; i < bytes.length; i += 8192) {
      chunks.push(String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + 8192))));
    }
    return chunks.join("");
  }
  function latin1ToBytes(text2) {
    const bytes = new Uint8Array(text2.length);
    for (let i = 0; i < text2.length; i++) {
      bytes[i] = text2.charCodeAt(i) & 255;
    }
    return bytes;
  }
  var SIGMA;
  var init_ChaCha20 = __esm({
    "src/ChaCha20.ts"() {
      "use strict";
      SIGMA = [1634760805, 857760878, 2036477234, 1797285236];
    }
  });

  // src/Cache.ts
  var Cache;
  var init_Cache = __esm({
    "src/Cache.ts"() {
      "use strict";
      init_Platform();
      init_SecretStore();
      init_ChaCha20();
      Cache = class _Cache {
        static {
          this.legacyCacheKey = "__warhelper";
        }
        static {
          this.cacheKey = _Cache.legacyCacheKey + (true ? "" : "");
        }
        static {
          // General cache, stored (encrypted when possible) in localStorage.
          this.cache = {};
        }
        static {
          // Settings and keys, stored somewhere page scripts can't read when possible.
          this.secrets = {};
        }
        static {
          this.secretStore = createSecretStore();
        }
        static {
          this.secretsLoaded = false;
        }
        static {
          this.onBustHandlers = [];
        }
        static {
          this.writeTimer = null;
        }
        static {
          // Each write re-encrypts the whole cache, so batch them.
          this.writeDelayMs = 2e3;
        }
        static {
          this.cacheDirty = false;
        }
        static {
          // General-cache keys set or removed here since the last write; other keys come from storage.
          this.pendingKeys = /* @__PURE__ */ new Set();
        }
        static {
          this.secretsDirty = false;
        }
        static {
          // Held until the secret store has loaded.
          this.bulkWritable = false;
        }
        static {
          // Encryption key for the localStorage cache, kept in the secret store.
          this.blobMagic = "__wh1:";
        }
        static {
          this.blobKeyName = "__blob_key";
        }
        static {
          this.blobKey = null;
        }
        static {
          // Encrypted cache waiting for its key to load.
          this.pendingCiphertext = null;
        }
        static {
          // Cache was unencrypted and should be re-saved encrypted.
          this.legacyPlaintext = false;
        }
        static {
          // Cleared on load if they have no expiry. Must stay above the static block.
          this.mustExpirePrefixes = [];
        }
        static {
          let raw = localStorage.getItem(this.cacheKey);
          if (raw === null && this.cacheKey !== this.legacyCacheKey) {
            const legacy = localStorage.getItem(this.legacyCacheKey);
            if (legacy && !legacy.startsWith(this.blobMagic)) {
              raw = legacy;
            }
          }
          if (raw && raw.startsWith(this.blobMagic)) {
            this.pendingCiphertext = raw;
          } else if (raw) {
            this.loadBulk(raw);
            this.legacyPlaintext = this.secretStore.isolated;
          }
          const loaded = this.secretStore.load();
          if (loaded instanceof Promise) {
            this.ready = loaded.catch((error) => {
              console.warn(`[warhelper] failed to load secrets from ${this.secretStore.name}`, error);
              return {};
            }).then((secrets) => this.applyLoadedSecrets(secrets));
          } else {
            this.applyLoadedSecrets(loaded);
            this.ready = Promise.resolve();
          }
          window.addEventListener("pagehide", () => this.flushWrite());
          window.addEventListener("storage", (event) => {
            if (event.key === this.cacheKey && event.newValue && this.bulkWritable) {
              const stored = this.parseStored(event.newValue);
              if (stored) {
                this.cache = this.mergeStored(stored);
              }
            }
          });
          document.addEventListener("visibilitychange", () => {
            if (document.visibilityState === "hidden") {
              this.flushWrite();
            }
          });
        }
        // Keys stored in the secret store: settings and your own battle stats.
        static isSecretKey(key) {
          return key.startsWith("config_") || /^user_\d+$/.test(key);
        }
        static isReady() {
          return this.secretsLoaded;
        }
        // Loads saved cache data, skipping expired entries.
        static loadBulk(json) {
          const parsed = jsonParse(json);
          if (!parsed || typeof parsed !== "object") {
            return;
          }
          let changed = false;
          Object.entries(parsed).forEach(([key, entry]) => {
            if (this.cache[key] !== void 0) {
              return;
            }
            if (entry.expiry > 0 && entry.expiry < Date.now()) {
              changed = true;
              return;
            }
            if (entry.expiry === 0 && this.mustExpirePrefixes.some((prefix) => key.startsWith(prefix))) {
              changed = true;
              return;
            }
            this.cache[key] = entry;
          });
          if (changed) {
            this.markDirty(false);
          }
        }
        static applyLoadedSecrets(secrets) {
          Object.keys(secrets).forEach((key) => {
            if (key !== this.blobKeyName && !this.isSecretKey(key)) {
              if (this.cache[key] === void 0) {
                this.cache[key] = secrets[key];
              }
              this.secretsDirty = true;
              this.cacheDirty = true;
              return;
            }
            if (this.secrets[key] === void 0) {
              this.secrets[key] = secrets[key];
            }
          });
          this.secretsLoaded = true;
          const legacyKeys = Object.keys(this.cache).filter((key) => this.isSecretKey(key));
          legacyKeys.forEach((key) => {
            const entry = this.cache[key];
            if (entry && this.secrets[key] === void 0) {
              this.secrets[key] = entry;
            }
          });
          let newBlobKey = null;
          if (this.secretStore.isolated) {
            const existing = this.parseBlobKey(this.secrets[this.blobKeyName]?.value);
            if (existing) {
              this.blobKey = existing;
            } else {
              newBlobKey = crypto.getRandomValues(new Uint8Array(32));
              this.secrets[this.blobKeyName] = { value: this.formatBlobKey(newBlobKey), expiry: 0 };
            }
          }
          const finish = (saved) => {
            if (saved) {
              if (newBlobKey) {
                this.blobKey = newBlobKey;
              }
              legacyKeys.forEach((key) => {
                delete this.cache[key];
                this.pendingKeys.add(key);
              });
              if (legacyKeys.length) {
                this.markDirty(false);
              }
            } else {
              console.warn(`[warhelper] could not persist secrets to ${this.secretStore.name}, keeping localStorage as-is`);
              if (newBlobKey) {
                delete this.secrets[this.blobKeyName];
              }
              this.legacyPlaintext = false;
            }
            if (this.pendingCiphertext !== null) {
              const json = this.decryptBlob(this.pendingCiphertext);
              this.pendingCiphertext = null;
              if (json !== null) {
                this.loadBulk(json);
              } else {
                console.warn("[warhelper] could not decrypt cached data, starting with an empty cache");
                this.markDirty(false);
              }
            } else if (this.legacyPlaintext && this.blobKey) {
              this.legacyPlaintext = false;
              this.markDirty(false);
            }
            this.bulkWritable = true;
            if (this.secretsDirty || this.cacheDirty) {
              this.write();
            }
          };
          if (!legacyKeys.length && !newBlobKey) {
            finish(true);
            return;
          }
          this.secretsDirty = false;
          try {
            const saved = this.secretStore.save(this.secrets);
            if (saved instanceof Promise) {
              saved.then(() => finish(true), (error) => {
                console.warn(`[warhelper] secret store write failed`, error);
                finish(false);
              });
            } else {
              finish(true);
            }
          } catch (error) {
            console.warn(`[warhelper] secret store write failed`, error);
            finish(false);
          }
        }
        static parseBlobKey(value) {
          if (typeof value !== "string" || !/^[0-9a-f]{64}$/.test(value)) {
            return null;
          }
          return new Uint8Array(value.match(/../g).map((byte) => parseInt(byte, 16)));
        }
        static formatBlobKey(key) {
          return Array.from(key, (byte) => byte.toString(16).padStart(2, "0")).join("");
        }
        static encryptBlob(json) {
          const nonce = new Uint8Array(12);
          crypto.getRandomValues(nonce);
          const ciphertext = chacha20(this.blobKey, nonce, new TextEncoder().encode(json));
          return this.blobMagic + bytesToLatin1(nonce) + bytesToLatin1(ciphertext);
        }
        static decryptBlob(raw) {
          if (!this.blobKey) {
            return null;
          }
          const body = raw.slice(this.blobMagic.length);
          if (body.length < 12) {
            return null;
          }
          try {
            const nonce = latin1ToBytes(body.slice(0, 12));
            const plaintext = chacha20(this.blobKey, nonce, latin1ToBytes(body.slice(12)));
            const json = new TextDecoder().decode(plaintext);
            return jsonParse(json) === void 0 ? null : json;
          } catch {
            return null;
          }
        }
        static onBust(handler) {
          this.onBustHandlers.push(handler);
        }
        // Marks a general-cache key as changed by this tab.
        static touch(key) {
          if (!this.isSecretKey(key)) {
            this.pendingKeys.add(key);
          }
        }
        static markDirty(secret) {
          if (secret) {
            this.secretsDirty = true;
          } else {
            this.cacheDirty = true;
          }
          this.write();
        }
        static write() {
          if (this.writeTimer !== null) {
            return;
          }
          this.writeTimer = window.setTimeout(() => this.flushWrite(), this.writeDelayMs);
        }
        static flushWrite() {
          if (this.writeTimer !== null) {
            window.clearTimeout(this.writeTimer);
            this.writeTimer = null;
          }
          if (this.cacheDirty && this.bulkWritable) {
            this.cacheDirty = false;
            this.writeBulk();
          }
          if (this.secretsDirty && this.secretsLoaded) {
            this.secretsDirty = false;
            try {
              const saved = this.secretStore.save(this.secrets);
              if (saved instanceof Promise) {
                saved.catch((error) => console.warn(`[warhelper] failed to save secrets to ${this.secretStore.name}`, error));
              }
            } catch (error) {
              console.warn(`[warhelper] failed to save secrets to ${this.secretStore.name}`, error);
            }
          }
        }
        // Reads a saved cache blob; null if missing or unreadable.
        static parseStored(raw) {
          if (!raw) {
            return null;
          }
          const json = raw.startsWith(this.blobMagic) ? this.decryptBlob(raw) : raw;
          const parsed = json !== null ? jsonParse(json) : null;
          return parsed && typeof parsed === "object" ? parsed : null;
        }
        // Stored entries with this tab's pending changes on top, minus expired ones.
        static mergeStored(stored) {
          const merged = {};
          const now2 = Date.now();
          Object.entries(stored).forEach(([key, entry]) => {
            if (!this.pendingKeys.has(key) && entry && !(entry.expiry > 0 && entry.expiry < now2)) {
              merged[key] = entry;
            }
          });
          this.pendingKeys.forEach((key) => {
            const entry = this.cache[key];
            if (entry) {
              merged[key] = entry;
            }
          });
          return merged;
        }
        static writeBulk() {
          const stored = this.parseStored(localStorage.getItem(this.cacheKey));
          if (stored) {
            this.cache = this.mergeStored(stored);
          }
          const store = () => {
            const json = JSON.stringify(this.cache);
            localStorage.setItem(this.cacheKey, this.blobKey ? this.encryptBlob(json) : json);
            this.pendingKeys.clear();
          };
          try {
            store();
          } catch (error) {
            console.warn("[warhelper] cache write failed", error);
            while (this.shrinkForQuota()) {
              try {
                store();
                return;
              } catch {
              }
            }
            console.warn("[warhelper] cache write failed after shrinking");
          }
        }
        static {
          // Data that can be fetched again. Settings and favourites are never evicted.
          this.rebuildablePrefixes = [
            "user_status_"
          ];
        }
        // Frees space after a failed save, cheapest data first. Returns true if anything was removed.
        static shrinkForQuota() {
          const now2 = Date.now();
          const tiers = [
            (_key, entry) => entry.expiry > 0 && entry.expiry < now2,
            ...this.rebuildablePrefixes.map((prefix) => (key) => key.startsWith(prefix))
          ];
          for (const shouldEvict of tiers) {
            const keys = Object.keys(this.cache).filter((key) => shouldEvict(key, this.cache[key]));
            if (keys.length) {
              keys.forEach((key) => delete this.cache[key]);
              return true;
            }
          }
          return false;
        }
        static lookup(key) {
          if (!this.isSecretKey(key)) {
            return this.cache[key];
          }
          return this.secrets[key] ?? this.cache[key];
        }
        static get(key) {
          const entry = this.lookup(key);
          if (!entry) {
            return;
          }
          if (entry.expiry > 0 && entry.expiry < Date.now()) {
            const secret = this.isSecretKey(key);
            delete (secret ? this.secrets : this.cache)[key];
            this.touch(key);
            this.markDirty(secret);
            return;
          }
          return entry.value;
        }
        // Deletes one key without triggering a full cache clear.
        static remove(key) {
          const secret = this.isSecretKey(key);
          const store = secret ? this.secrets : this.cache;
          if (store[key] === void 0) {
            return;
          }
          delete store[key];
          this.touch(key);
          this.markDirty(secret);
        }
        static bust(key) {
          const bustKeys = Array.isArray(key) ? key : [key];
          const matches = (key2) => bustKeys.some((bustKey) => key2.startsWith(bustKey));
          Object.keys(this.cache).forEach((key2) => {
            if (matches(key2)) {
              delete this.cache[key2];
              this.touch(key2);
            }
          });
          this.markDirty(false);
          const secretKeys = Object.keys(this.secrets).filter(matches);
          if (secretKeys.length) {
            secretKeys.forEach((key2) => delete this.secrets[key2]);
            this.markDirty(true);
          }
          this.onBustHandlers.forEach((handler) => {
            handler();
          });
        }
        static set(key, value, expirySeconds = 0) {
          const keys = Array.isArray(key) ? key : [key];
          const values = Array.isArray(value) ? value : [value];
          if (keys.length !== values.length) {
            throw new Error("Keys and values arrays must be of the same length");
          }
          keys.forEach((key2, index) => {
            const secret = this.isSecretKey(key2);
            (secret ? this.secrets : this.cache)[key2] = {
              value: values[index],
              expiry: expirySeconds > 0 ? Date.now() + expirySeconds * 1e3 : 0
            };
            this.touch(key2);
            this.markDirty(secret);
          });
        }
        static seconds(value) {
          return value;
        }
        static minutes(value) {
          return this.seconds(60) * value;
        }
        static hours(value) {
          return this.minutes(60) * value;
        }
        static days(value) {
          return this.hours(24) * value;
        }
      };
    }
  });

  // src/Utilities.ts
  async function sleep(timeout) {
    return new Promise((resolve) => setTimeout(resolve, timeout));
  }
  function normalizeServerTimeMs(value) {
    const timestamp = Number(value);
    if (!Number.isFinite(timestamp) || timestamp <= 0) {
      return null;
    }
    return timestamp < 1e12 ? timestamp * 1e3 : timestamp;
  }
  function updateServerTime(value) {
    const serverTimeMs = normalizeServerTimeMs(value);
    if (serverTimeMs === null) {
      return;
    }
    serverTimeOffsetMs = serverTimeMs - Date.now();
  }
  function getServerTimeMs() {
    return Date.now() + serverTimeOffsetMs;
  }
  function getServerTimestampSeconds() {
    return Math.floor(getServerTimeMs() / 1e3);
  }
  function waitForElement(selector) {
    return new Promise((resolve) => {
      const interval = setInterval(() => {
        const node = document.querySelector(selector);
        if (!node) {
          return;
        }
        clearInterval(interval);
        resolve(node);
      }, 500);
    });
  }
  function whenDomReady(callback) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", callback, { once: true });
      return;
    }
    callback();
  }
  function addStyle(css) {
    if (!document.head) {
      document.addEventListener("DOMContentLoaded", () => addStyle(css));
      return;
    }
    if (typeof GM_addStyle !== "undefined") {
      GM_addStyle(css);
      return;
    }
    const styleElement = document.createElement("style");
    styleElement.type = "text/css";
    styleElement.innerText = css;
    document.head.appendChild(styleElement);
  }
  function getRandomEmoji() {
    const range = [128512, 128591];
    const codePoint = Math.floor(Math.random() * (range[1] - range[0] + 1)) + range[0];
    return String.fromCodePoint(codePoint);
  }
  function hasNestedProperty(obj, path) {
    if (!Array.isArray(path)) {
      return hasNestedProperty(obj, path.split("."));
    }
    let current = obj;
    for (const key of path) {
      if (current == null || !(key in current)) {
        return false;
      }
      current = current[key];
    }
    return true;
  }
  function formatTimeDifference(timestampSeconds) {
    let difference = Math.round(getServerTimeMs() / 1e3) - timestampSeconds;
    if (difference < 0) return "now";
    if (difference > 365 * 24 * 60 * 60) {
      return `${Math.floor(difference / (365 * 24 * 60 * 60))} years ago`;
    } else if (difference > 30 * 24 * 60 * 60) {
      return `${Math.floor(difference / (30 * 24 * 60 * 60))} months ago`;
    } else if (difference > 24 * 60 * 60) {
      return `${Math.floor(difference / (24 * 60 * 60))} days ago`;
    } else if (difference > 60 * 60) {
      return `${Math.floor(difference / (60 * 60))} hours ago`;
    } else if (difference > 60) {
      return `${Math.floor(difference / 60)} minutes ago`;
    }
    return `${Math.floor(difference)} seconds ago`;
  }
  function escapeHtml(value) {
    return value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
  }
  function formatTimestamp(timestampSeconds) {
    const totalSeconds = timestampSeconds - getServerTimestampSeconds();
    if (totalSeconds <= 0) return "Okay";
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor(totalSeconds % 3600 / 60);
    const seconds = Math.floor(totalSeconds % 60);
    let formatted = "";
    if (hours > 0) formatted += `${hours.toString().padStart(2, "0")}:`;
    formatted += `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
    return formatted;
  }
  function abbreviateNumber(value, decimals, units = ["K", "M", "B", "T", "Q"]) {
    for (let i = 0; i < units.length; i++) {
      value = value / 1e3;
      if (value >= 1e3 && i < units.length - 1) continue;
      const fixedValue = value.toFixed(decimals ? decimals : value >= 100 ? 0 : value >= 10 ? 1 : 2);
      return `${fixedValue}${units[i]}`;
    }
    return "?";
  }
  function isStringArray(value) {
    return Array.isArray(value) && value.every((item) => typeof item === "string");
  }
  function isOnPage(value) {
    return window.location.href.indexOf(value) !== -1;
  }
  function isOnWarResultPage() {
    return isOnPage("war.php");
  }
  function isOnFactionPage() {
    return isOnPage("factions.php");
  }
  function isOnOwnFactionPage() {
    return document.querySelector("#factions .respect-icon+span.title")?.textContent?.includes("YOUR") === true;
  }
  function svgDataUri(svg) {
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  }
  function unionJackSvgContent(x, y, width, height) {
    const cx = x + width / 2;
    const cy = y + height / 2;
    return `
    <rect x="${x}" y="${y}" width="${width}" height="${height}" fill="#012169"/>
    <line x1="${x}" y1="${y}" x2="${x + width}" y2="${y + height}" stroke="#fff" stroke-width="${height * 0.24}"/>
    <line x1="${x + width}" y1="${y}" x2="${x}" y2="${y + height}" stroke="#fff" stroke-width="${height * 0.24}"/>
    <line x1="${x}" y1="${y}" x2="${x + width}" y2="${y + height}" stroke="#c8102e" stroke-width="${height * 0.1}"/>
    <line x1="${x + width}" y1="${y}" x2="${x}" y2="${y + height}" stroke="#c8102e" stroke-width="${height * 0.1}"/>
    <rect x="${x}" y="${cy - height * 0.14}" width="${width}" height="${height * 0.28}" fill="#fff"/>
    <rect x="${cx - width * 0.09}" y="${y}" width="${width * 0.18}" height="${height}" fill="#fff"/>
    <rect x="${x}" y="${cy - height * 0.08}" width="${width}" height="${height * 0.16}" fill="#c8102e"/>
    <rect x="${cx - width * 0.05}" y="${y}" width="${width * 0.1}" height="${height}" fill="#c8102e"/>
  `;
  }
  function starPoints(cx, cy, outer, inner) {
    const points = [];
    for (let i = 0; i < 10; i++) {
      const radius = i % 2 === 0 ? outer : inner;
      const angle = (-90 + i * 36) * Math.PI / 180;
      points.push(`${(cx + Math.cos(angle) * radius).toFixed(2)},${(cy + Math.sin(angle) * radius).toFixed(2)}`);
    }
    return points.join(" ");
  }
  var targetWindow, serverTimeOffsetMs, FLAG_URLS, AREAS, TRAVELING_SIGN, TERRITORY_VIEW_CLASS;
  var init_Utilities = __esm({
    "src/Utilities.ts"() {
      "use strict";
      init_Platform();
      targetWindow = typeof unsafeWindow !== "undefined" ? unsafeWindow : window;
      serverTimeOffsetMs = 0;
      FLAG_URLS = {
        MX: svgDataUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 30 20"><rect width="10" height="20" fill="#006847"/><rect x="10" width="10" height="20" fill="#fff"/><rect x="20" width="10" height="20" fill="#ce1126"/><circle cx="15" cy="10" r="2" fill="#9c6b30"/></svg>`),
        HI: svgDataUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 20"><rect width="32" height="20" fill="#fff"/><rect y="2.5" width="32" height="2.5" fill="#cf142b"/><rect y="5" width="32" height="2.5" fill="#00247d"/><rect y="10" width="32" height="2.5" fill="#cf142b"/><rect y="12.5" width="32" height="2.5" fill="#00247d"/><rect y="17.5" width="32" height="2.5" fill="#cf142b"/>${unionJackSvgContent(0, 0, 14, 10)}</svg>`),
        ZA: svgDataUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 30 20"><path fill="#de3831" d="M0 0h30v10H0z"/><path fill="#002395" d="M0 10h30v10H0z"/><path fill="#fff" d="M0 0l16 10L0 20h6l16-10L6 0z"/><path fill="#007a4d" d="M0 2l12 8L0 18h4l14-8L4 2z"/><path fill="#ffb612" d="M0 4l8 6-8 6z"/><path fill="#000" d="M0 5.5L6 10l-6 4.5z"/></svg>`),
        JP: svgDataUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 30 20"><rect width="30" height="20" fill="#fff"/><circle cx="15" cy="10" r="5.5" fill="#bc002d"/></svg>`),
        CN: svgDataUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 30 20"><rect width="30" height="20" fill="#de2910"/><polygon points="${starPoints(7, 5.5, 3, 1.25)}" fill="#ffde00"/><circle cx="13" cy="4" r="1" fill="#ffde00"/><circle cx="15" cy="7" r="1" fill="#ffde00"/><circle cx="15" cy="11" r="1" fill="#ffde00"/><circle cx="13" cy="14" r="1" fill="#ffde00"/></svg>`),
        AR: svgDataUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 30 20"><rect width="30" height="20" fill="#74acdf"/><rect y="6.67" width="30" height="6.66" fill="#fff"/><circle cx="15" cy="10" r="2" fill="#f6b40e"/></svg>`),
        CH: svgDataUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><rect width="20" height="20" fill="#d52b1e"/><rect x="8" y="4" width="4" height="12" fill="#fff"/><rect x="4" y="8" width="12" height="4" fill="#fff"/></svg>`),
        CA: svgDataUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 30 20"><rect width="7" height="20" fill="#d52b1e"/><rect x="7" width="16" height="20" fill="#fff"/><rect x="23" width="7" height="20" fill="#d52b1e"/><polygon points="15,3 16.2,7.1 19.2,6 17.7,8.9 20.5,10 17.1,11 18.1,14.5 15,12.3 11.9,14.5 12.9,11 9.5,10 12.3,8.9 10.8,6 13.8,7.1" fill="#d52b1e"/></svg>`),
        GB: svgDataUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 30 20">${unionJackSvgContent(0, 0, 30, 20)}</svg>`),
        AE: svgDataUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 30 20"><rect width="30" height="20" fill="#fff"/><rect x="8" width="22" height="6.67" fill="#009739"/><rect x="8" y="13.33" width="22" height="6.67" fill="#000"/><rect width="8" height="20" fill="#ef3340"/></svg>`),
        KY: svgDataUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 30 20"><rect width="30" height="20" fill="#00247d"/>${unionJackSvgContent(0, 0, 14, 10)}<circle cx="23" cy="11" r="4" fill="#fff"/><circle cx="23" cy="11" r="2.6" fill="#d52b1e"/></svg>`)
      };
      AREAS = {
        1: { name: "Torn", abbr: "Torn" },
        2: { name: "Mexico", abbr: "MX", flagUrl: FLAG_URLS.MX },
        3: { name: "Hawaii", abbr: "HI", flagUrl: FLAG_URLS.HI },
        4: { name: "South Africa", abbr: "ZA", flagUrl: FLAG_URLS.ZA },
        5: { name: "Japan", abbr: "JP", flagUrl: FLAG_URLS.JP },
        6: { name: "China", abbr: "CN", flagUrl: FLAG_URLS.CN },
        7: { name: "Argentina", abbr: "AR", flagUrl: FLAG_URLS.AR },
        8: { name: "Switzerland", abbr: "CH", flagUrl: FLAG_URLS.CH },
        9: { name: "Canada", abbr: "CA", flagUrl: FLAG_URLS.CA },
        10: { name: "United Kingdom", abbr: "UK", flagUrl: FLAG_URLS.GB },
        11: { name: "United Arab Emirates", abbr: "UAE", flagUrl: FLAG_URLS.AE },
        12: { name: "Cayman Islands", abbr: "KY", flagUrl: FLAG_URLS.KY }
      };
      TRAVELING_SIGN = "\u2708\uFE0E";
      TERRITORY_VIEW_CLASS = "__warhelper_territory_view";
    }
  });

  // src/TabBus.ts
  function isRecord(value) {
    return typeof value === "object" && value !== null;
  }
  var TabBus;
  var init_TabBus = __esm({
    "src/TabBus.ts"() {
      "use strict";
      TabBus = class {
        static {
          this.channelName = "__warhelper";
        }
        static {
          this.heartbeatMs = 1e3;
        }
        static {
          this.peerTtlMs = 3500;
        }
        static {
          this.tabId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
        }
        static {
          this.channel = null;
        }
        static {
          this.peers = /* @__PURE__ */ new Map();
        }
        static {
          this.handlers = /* @__PURE__ */ new Map();
        }
        static {
          this.masterChangeHandlers = /* @__PURE__ */ new Set();
        }
        static {
          this.master = false;
        }
        static {
          this.init();
        }
        static isMaster() {
          return this.master;
        }
        static on(topic, handler) {
          let handlers = this.handlers.get(topic);
          if (!handlers) {
            handlers = /* @__PURE__ */ new Set();
            this.handlers.set(topic, handlers);
          }
          handlers.add(handler);
          return () => {
            handlers?.delete(handler);
          };
        }
        static onMasterChange(handler) {
          this.masterChangeHandlers.add(handler);
          handler(this.master);
          return () => {
            this.masterChangeHandlers.delete(handler);
          };
        }
        static post(topic, payload) {
          this.channel?.postMessage({
            source: this.tabId,
            type: "message",
            topic,
            payload
          });
        }
        static init() {
          if (typeof BroadcastChannel !== "undefined") {
            try {
              this.channel = new BroadcastChannel(this.channelName);
              this.channel.addEventListener("message", (event) => this.handleMessage(event.data));
            } catch {
              this.channel = null;
            }
          }
          document.addEventListener("visibilitychange", () => {
            this.sendHeartbeat();
            this.recomputeMaster();
          });
          window.setInterval(() => {
            this.prunePeers();
            this.sendHeartbeat();
            this.recomputeMaster();
          }, this.heartbeatMs);
          this.sendHeartbeat();
          this.recomputeMaster();
        }
        static handleMessage(value) {
          if (!isRecord(value)) {
            return;
          }
          const message = value;
          const source = typeof message.source === "string" ? message.source : "";
          if (!source || source === this.tabId) {
            return;
          }
          if (message.type === "heartbeat") {
            this.peers.set(source, {
              visible: message.visible === true,
              lastSeen: Date.now()
            });
            this.recomputeMaster();
            return;
          }
          if (message.type !== "message" || typeof message.topic !== "string") {
            return;
          }
          this.handlers.get(message.topic)?.forEach((handler) => {
            handler(message.payload);
          });
        }
        static sendHeartbeat() {
          if (!this.channel) {
            return;
          }
          this.channel.postMessage({
            source: this.tabId,
            type: "heartbeat",
            visible: !document.hidden
          });
        }
        static prunePeers() {
          const cutoff = Date.now() - this.peerTtlMs;
          this.peers.forEach((peer, id) => {
            if (peer.lastSeen < cutoff) {
              this.peers.delete(id);
            }
          });
        }
        static recomputeMaster() {
          if (!this.channel) {
            this.setMaster(!document.hidden);
            return;
          }
          const candidates = [];
          if (!document.hidden) {
            candidates.push(this.tabId);
          }
          const cutoff = Date.now() - this.peerTtlMs;
          this.peers.forEach((peer, id) => {
            if (peer.visible && peer.lastSeen >= cutoff) {
              candidates.push(id);
            }
          });
          candidates.sort();
          this.setMaster(candidates[0] === this.tabId);
        }
        static setMaster(master) {
          if (this.master === master) {
            return;
          }
          this.master = master;
          this.masterChangeHandlers.forEach((handler) => {
            handler(master);
          });
        }
      };
    }
  });

  // src/Config.ts
  var Config_exports = {};
  __export(Config_exports, {
    Config: () => Config
  });
  var BUST_PREFIXES, BUST_TOPIC, Config;
  var init_Config = __esm({
    "src/Config.ts"() {
      "use strict";
      init_Utilities();
      init_Cache();
      init_TabBus();
      BUST_PREFIXES = ["ffs_", "torn_api_"];
      BUST_TOPIC = "cache_bust";
      Config = class _Config {
        static {
          this.configKeyEntries = [
            { type: "text", id: "torn_key", label: "Torn Key", placeholder: "Limited Key (optional)" },
            { type: "text", id: "ffs_key", label: "FFScouter Key", placeholder: "FFScouter API key" }
          ];
        }
        static {
          this.configOptionsEntries = [
            { type: "checkbox", id: "hide_faction_icon", label: "Hide Faction Icon", placeholder: "" },
            { type: "checkbox", id: "show_original_war_view", label: "Show Original War View", placeholder: "" },
            { type: "checkbox", id: "disable_hiding_cosmetics", label: "Disable Hiding Cosmetics", placeholder: "" }
          ];
        }
        static {
          this.onChangeHandlers = {};
        }
        static {
          this.keyStatuses = /* @__PURE__ */ new Map();
        }
        static {
          TabBus.on(BUST_TOPIC, () => Cache.bust(BUST_PREFIXES));
          Cache.ready.then(() => whenDomReady(() => this.init()));
          if (!Cache.isReady()) {
            Cache.ready.then(() => {
              this.configKeyEntries.forEach(({ id }) => {
                const value = Cache.get(`config_${id}`);
                if (value !== void 0) {
                  this.onChangeHandlers[id]?.forEach((handler) => handler(id, value));
                }
              });
            });
          }
        }
        static init() {
          if (targetWindow["__warhelper_config_initialized"]) {
            return;
          }
          targetWindow["__warhelper_config_initialized"] = true;
          this.createConfigOverlay();
          this.injectButton();
        }
        static async injectButton() {
          const linksList = await waitForElement("#top-page-links-list");
          this.configButton = document.createElement("a");
          this.configButton.className = "t-clear line-h24 right __warhelper_button";
          this.configButton.href = "#";
          const emojiSpan = document.createElement("span");
          emojiSpan.className = "icon-wrap svg-icon-wrap";
          emojiSpan.innerHTML = getRandomEmoji();
          const textSpan = document.createElement("span");
          textSpan.innerHTML = "War Helper";
          this.configButton.appendChild(emojiSpan);
          this.configButton.appendChild(textSpan);
          linksList.appendChild(this.configButton);
          this.configButton.addEventListener("click", (event) => {
            event.preventDefault();
            this.toggleConfig(event.target);
          });
          this.configButton.addEventListener("mouseenter", () => {
            emojiSpan.innerHTML = getRandomEmoji();
          });
        }
        static createConfigEntry(entry) {
          return `
      <label class="__warhelper_config_${entry.type}">
        ${entry.type != "checkbox" ? entry.label : ""}
        <input 
          data-id="${entry.id}" 
          type="${entry.type}" 
          placeholder="${entry.placeholder || ""}"
          ${entry.type == "checkbox" ? `${_Config.get(entry.id) == "true" ? "checked" : ""}` : `value="${_Config.get(entry.id) || ""}"`}
        />
        <span></span>
        ${entry.type == "checkbox" ? entry.label : ""}
      </label>
      ${entry.type != "checkbox" ? `<div class="__warhelper_config_key_status" data-key-status="${entry.id}"></div>` : ""}
    `;
        }
        // Short status line under a key field, e.g. the key's tier.
        static setKeyStatus(id, text2, tone = "") {
          this.keyStatuses.set(id, { text: text2, tone });
          this.renderKeyStatus(id);
        }
        static renderKeyStatus(id) {
          const node = this.configElement?.querySelector(`[data-key-status="${id}"]`);
          if (!(node instanceof HTMLElement)) {
            return;
          }
          const status = this.keyStatuses.get(id);
          node.textContent = status?.text || "";
          node.className = `__warhelper_config_key_status ${status?.tone || ""}`;
        }
        // Torn API terms of use disclosure for the key fields.
        static createKeyDisclosure() {
          return `
      <details class="__warhelper_config_disclosure">
        <summary>What are these keys used for?</summary>
        <p><b>Torn Key</b> (Limited access) is used to fetch your own battle stats from the Torn API, which is needed to calculate the Fair Fight (FF) modifier shown next to each opponent's spy data.</p>
        <p><b>FFScouter Key</b> is sent to ffscouter.com to fetch Fair Fight estimates and (with a premium key) current flight times for traveling members. Without it, the BS column and flight tooltips won't populate.</p>
        <p>Each key is only sent to its own service. The Torn key is also used to check the key's access level so the script doesn't keep asking for data the key can't return.</p>
      </details>
    `;
        }
        static createConfigOverlay() {
          this.configElement = document.createElement("div");
          this.configElement.className = "__warhelper_config";
          this.configElement.style.display = "none";
          this.configElement.innerHTML = `
      <div class="__warhelper_config_tabs">
        <select class="__warhelper_config_tab-select">
          <option value="__warhelper_config_tab1" selected>Keys</option>
          <option value="__warhelper_config_tab2">Options</option>
        </select>

        <div id="__warhelper_config_tab1" class="__warhelper_config_tab-content active" data-tab-content>
          ${this.configKeyEntries.map((entry) => {
            return _Config.createConfigEntry(entry);
          }).join("\n")}
          ${this.createKeyDisclosure()}
        </div>
        <div id="__warhelper_config_tab2"class="__warhelper_config_tab-content" data-tab-content>
          ${this.configOptionsEntries.map((entry) => {
            return _Config.createConfigEntry(entry);
          }).join("\n")}
        </div>
      </div>

      <button class="torn-btn save">SAVE</button>
      <button class="torn-btn bust">CLEAR CACHE</button>`;
          const style = `
@media screen and (max-width: 784px) {
  .__warhelper_button:nth-child(2) {
    display: none;
  }
}

.__warhelper_config {
  --wh-config-bg: #ffffff;
  --wh-config-panel-bg: #f5f6f8;
  --wh-config-control-bg: #ffffff;
  --wh-config-control-hover-bg: #eef1f5;
  --wh-config-text: #222;
  --wh-config-muted: #606873;
  --wh-config-border: #c8cdd4;
  --wh-config-border-strong: #9aa3ad;
  --wh-config-focus: rgba(44, 124, 207, 0.2);
  --wh-config-check-bg: #ffffff;
  --wh-config-check-active-bg: #3d6ea8;
  --wh-config-check-color: #ffffff;
  --wh-config-success: #2f7d32;
  --wh-config-error: #b3261e;
  position: absolute;
  background: var(--wh-config-bg);
  color: var(--wh-config-text);
  padding: 10px;
  border: 1px solid var(--wh-config-border);
  border-radius: 5px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18);
  z-index: 99;
}

body.dark-mode .__warhelper_config {
  --wh-config-bg: #2f2f2f;
  --wh-config-panel-bg: #383838;
  --wh-config-control-bg: #242424;
  --wh-config-control-hover-bg: #333333;
  --wh-config-text: #ddd;
  --wh-config-muted: #b8b8b8;
  --wh-config-border: #555;
  --wh-config-border-strong: #777;
  --wh-config-focus: rgba(255, 255, 255, 0.07);
  --wh-config-check-bg: #2b2b2b;
  --wh-config-check-active-bg: #444;
  --wh-config-check-color: #eee;
  --wh-config-success: #b9e6b9;
  --wh-config-error: #ffb3b3;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.42);
}

.__warhelper_config_tab-content {
  display: none;
}

.__warhelper_config_tab-content.active {
  display: block;
}

.__warhelper_config select {
  width: 100%;
  padding: 8px 10px;
  border-radius: 5px;
  border: 1px solid var(--wh-config-border);
  background: var(--wh-config-control-bg);
  color: var(--wh-config-text);
  font-size: 14px;
  cursor: pointer;

  appearance: none; /* remove default arrow */
  -webkit-appearance: none;
  -moz-appearance: none;

  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}

.__warhelper_config select {
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath fill='%235f6873' d='M0 0l5 6 5-6z'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 10px center;
  background-size: 10px;
  padding-right: 30px;
}

body.dark-mode .__warhelper_config select {
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath fill='%23cccccc' d='M0 0l5 6 5-6z'/%3E%3C/svg%3E");
}

.__warhelper_config select:hover {
  border-color: var(--wh-config-border-strong);
}

.__warhelper_config select:focus {
  outline: none;
  border-color: var(--wh-config-border-strong);
  box-shadow: 0 0 0 2px var(--wh-config-focus);
}

.__warhelper_config label {
  font-weight: bold;
  color: var(--wh-config-text);
}

.__warhelper_config button {
  width: 100%;
}

.__warhelper_config button:not(.torn-btn) {
  border: 1px solid var(--wh-config-border);
  border-radius: 4px;
  background: var(--wh-config-control-bg);
  color: var(--wh-config-text);
  cursor: pointer;
}

.__warhelper_config button:not(.torn-btn):hover:not(:disabled) {
  border-color: var(--wh-config-border-strong);
  background: var(--wh-config-control-hover-bg);
}

.__warhelper_config_text {
  display: block;
  margin: 10px 0;
}

.__warhelper_config .__warhelper_config_key_status {
  margin-top: -6px;
  color: var(--wh-config-muted);
  font-size: 12px;
}

.__warhelper_config .__warhelper_config_key_status:empty {
  display: none;
}

.__warhelper_config .__warhelper_config_key_status.success {
  color: var(--wh-config-success);
}

.__warhelper_config .__warhelper_config_key_status.error {
  color: var(--wh-config-error);
}

.__warhelper_config_disclosure {
  max-width: 260px;
  margin-top: 10px;
  color: var(--wh-config-muted);
  font-size: 12px;
  line-height: 1.4;
}

.__warhelper_config_disclosure summary {
  cursor: pointer;
  color: var(--wh-config-text);
}

.__warhelper_config_disclosure p,
.__warhelper_config_disclosure ul,
.__warhelper_config_disclosure dl {
  margin: 6px 0;
}

.__warhelper_config_disclosure ul {
  padding-left: 16px;
  list-style: disc;
}

.__warhelper_config_disclosure dt {
  color: var(--wh-config-text);
  font-weight: bold;
}

.__warhelper_config_disclosure dd {
  margin: 0 0 4px;
}

.__warhelper_config input:not([type='checkbox']) {
  display: block;
  vertical-align: middle;
  text-align: left;
  color: var(--input-money-color, var(--wh-config-text));
  background: var(--input-money-background-color, var(--wh-config-control-bg));
  border: 1px solid var(--input-money-border-color, var(--wh-config-border));
  border-radius: 5px;
  padding: 9px 5px;
  line-height: 14px;
  margin-left: 10px;
}

.__warhelper_config input:not([type='checkbox']):focus {
  outline: none;
  border-color: var(--wh-config-border-strong);
  box-shadow: 0 0 0 2px var(--wh-config-focus);
}

.__warhelper_config_checkbox {
  display: flex;
  margin: 10px 0;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  font-family: sans-serif;
  color: var(--wh-config-text);
}

.__warhelper_config_checkbox input {
  display: none;
}

.__warhelper_config_checkbox span {
  width: 18px;
  height: 18px;
  border: 2px solid var(--wh-config-border);
  border-radius: 4px;
  background: var(--wh-config-check-bg);
  display: inline-block;
  position: relative;
  transition: all 0.2s ease;
}

/* checkmark */
.__warhelper_config_checkbox span::after {
  content: "";
  position: absolute;
  left: 4px;
  top: 0px;
  width: 5px;
  height: 10px;
  border: solid var(--wh-config-check-color);
  border-width: 0 2px 2px 0;
  transform: rotate(45deg) scale(0);
  transition: transform 0.15s ease;
}

/* checked state */
.__warhelper_config_checkbox input:checked + span {
  background: var(--wh-config-check-active-bg);
  border-color: var(--wh-config-border-strong);
}

.__warhelper_config_checkbox input:checked + span::after {
  transform: rotate(45deg) scale(1);
}

/* hover */
.__warhelper_config_checkbox:hover span {
  border-color: var(--wh-config-border-strong);
}
    `;
          document.body.insertAdjacentElement("beforeend", this.configElement);
          addStyle(style);
          const tabSelect = this.configElement.querySelector("select.__warhelper_config_tab-select");
          tabSelect.addEventListener("change", () => this.selectTab(tabSelect.value));
          this.keyStatuses.forEach((_status, id) => this.renderKeyStatus(id));
          const saveButton = this.configElement.querySelector(`button.save`);
          if (saveButton === null) {
            return;
          }
          saveButton.addEventListener("click", () => {
            if (this.configElement === null) {
              return;
            }
            const changes = [];
            this.configElement.querySelectorAll("input[data-id]").forEach((element2) => {
              if (!(element2 instanceof HTMLInputElement)) {
                return;
              }
              const id = element2.dataset["id"];
              if (!id) {
                return;
              }
              const key = `config_${id}`;
              const value = element2.type == "checkbox" ? String(element2.checked) : element2.value;
              if (Cache.get(key) !== value) {
                changes.push({ id, value });
              }
            });
            changes.forEach(({ id, value }) => {
              this.updateConfigValue(id, value);
            });
            this.toggleConfig(null);
          });
          const bustButton = this.configElement.querySelector(`button.bust`);
          if (bustButton === null) {
            return;
          }
          bustButton.addEventListener("click", () => {
            Cache.bust(BUST_PREFIXES);
            TabBus.post(BUST_TOPIC, BUST_PREFIXES);
          });
          document.body.addEventListener("click", (event) => {
            if (this.configElement?.contains(event.target) || this.configButton?.contains(event.target)) {
              return;
            }
            this.toggleConfig(null);
          });
        }
        static updateConfigValue(id, value) {
          const key = `config_${id}`;
          if (Cache.get(key) === value) {
            return;
          }
          Cache.set(key, value);
          this.onChangeHandlers[id]?.forEach((handler) => {
            handler(id, value);
          });
        }
        static selectTab(tabId) {
          const tabSelect = this.configElement.querySelector("select.__warhelper_config_tab-select");
          if (!(tabSelect instanceof HTMLSelectElement)) {
            return;
          }
          const option = Array.from(tabSelect.options).find((option2) => option2.value === tabId);
          if (!option || option.hidden || option.disabled) {
            tabId = "__warhelper_config_tab1";
          }
          tabSelect.value = tabId;
          this.configElement.querySelectorAll("[data-tab-content]").forEach((content) => {
            content.classList.toggle("active", content.id === tabId);
          });
        }
        static toggleConfig(target) {
          if (this.configElement === null) {
            return;
          }
          if (target === null || !(target instanceof HTMLElement)) {
            this.configElement.style.display = "none";
            return;
          }
          if (this.configElement.style.display != "none") {
            this.configElement.style.display = "none";
          } else {
            this.configElement.style.display = "";
          }
          const pos = target.getBoundingClientRect();
          const size = this.configElement.getBoundingClientRect();
          const bodySize = document.body.getBoundingClientRect();
          const left = Math.min(
            pos.left + pos.width / 2 - size.width / 2,
            bodySize.width - size.width
          );
          this.configElement.style.left = `${left}px`;
          this.configElement.style.top = `${pos.top + pos.height}px`;
        }
        static set(key, value) {
          return Cache.set(`config_${key}`, value);
        }
        static get(key) {
          const value = Cache.get(`config_${key}`);
          return value === void 0 ? this.getDefaultValue(key) : value;
        }
        static onChange(key, handler) {
          if (this.onChangeHandlers[key] === void 0) {
            this.onChangeHandlers[key] = [];
          }
          this.onChangeHandlers[key].push(handler);
        }
        static getDefaultValue(key) {
          return void 0;
        }
      };
    }
  });

  // src/Http.ts
  function whenVisible(url) {
    if (!document.hidden || url.startsWith(TORN_API_ORIGIN)) {
      return Promise.resolve();
    }
    if (!visibleTab) {
      visibleTab = new Promise((resolve) => {
        const onChange = () => {
          if (document.hidden) {
            return;
          }
          document.removeEventListener("visibilitychange", onChange);
          visibleTab = null;
          resolve();
        };
        document.addEventListener("visibilitychange", onChange);
      });
    }
    return visibleTab;
  }
  var TORN_API_ORIGIN, visibleTab, Http;
  var init_Http = __esm({
    "src/Http.ts"() {
      "use strict";
      TORN_API_ORIGIN = "https://api.torn.com/";
      visibleTab = null;
      Http = class {
        static request(input, timeout = 3e4) {
          const options = typeof input === "string" ? { method: "GET", url: input, timeout } : { method: "GET", timeout: 3e4, ...input };
          return whenVisible(options.url).then(() => new Promise((resolve, reject) => {
            if (typeof GM_xmlhttpRequest === "undefined") {
              reject(new Error("GM_xmlhttpRequest is not available"));
              return;
            }
            GM_xmlhttpRequest({
              method: options.method || "GET",
              url: options.url,
              headers: options.headers,
              data: options.data,
              timeout: options.timeout,
              onload: (response) => resolve(typeof input === "string" ? response.responseText : response),
              onabort: () => reject(new Error("HTTP request aborted")),
              onerror: (reason) => reject(reason || new Error("HTTP request failed")),
              ontimeout: (reason) => reject(reason || new Error("HTTP request timed out"))
            });
          }));
        }
      };
    }
  });

  // src/Network.ts
  var HOOKED_KEY, Network;
  var init_Network = __esm({
    "src/Network.ts"() {
      "use strict";
      init_Utilities();
      HOOKED_KEY = "__warhelperNetworkHooked";
      Network = class _Network {
        static {
          this.handlers = [];
        }
        static {
          this.holds = [];
        }
        static {
          targetWindow.__warhelperSendChatMessage = (channelId, message) => {
            return this.sendChatMessage(channelId, message);
          };
          this.hookWindow(targetWindow);
          this.injectWebsocket();
        }
        // Routes another window's fetch/XHR (the PDA attack iframe) through the same handlers.
        static hookWindow(win) {
          if (!win || win[HOOKED_KEY]) {
            return;
          }
          win[HOOKED_KEY] = true;
          this.injectXHR(win);
          this.injectFetch(win);
        }
        static injectXHR(win) {
          const originalXHROpen = win.XMLHttpRequest.prototype.open;
          win.XMLHttpRequest.prototype.open = function(...args) {
            const url = String(args[1] ?? "");
            if (!_Network.hasMatchingHandlers(0 /* XHR */, url)) {
              return originalXHROpen.apply(this, args);
            }
            const that = this;
            this.addEventListener("readystatechange", () => {
              if (that.readyState !== 4) {
                return;
              }
              const status = that.status;
              if (status !== 0 && (status < 200 || status >= 400)) {
                return;
              }
              _Network.handleMessage(0 /* XHR */, that.responseText, url);
            });
            return originalXHROpen.apply(this, args);
          };
        }
        static injectFetch(win) {
          const originalFetch = win.fetch;
          win.fetch = async function(...args) {
            const url = args[0]?.url || args[0];
            const response = await originalFetch.apply(this, args);
            if (!_Network.hasMatchingHandlers(1 /* Fetch */, url)) {
              return response;
            }
            await _Network.waitForHolds(String(url));
            const text2 = await response.clone().text().then((text3) => _Network.handleMessage(1 /* Fetch */, text3, url));
            if (text2 === void 0) {
              return response;
            }
            const modifiedResponse = new win.Response(text2, {
              status: response.status,
              statusText: response.statusText,
              headers: response.headers
            });
            return modifiedResponse;
          };
        }
        static injectWebsocket() {
          const originalWebSocket = targetWindow.WebSocket;
          targetWindow.WebSocket = function(...args) {
            const socket = new originalWebSocket(...args);
            const originalAddEventListener = socket.addEventListener;
            const originalRemoveEventListener = socket.removeEventListener;
            const wrappedMessageListeners = /* @__PURE__ */ new Map();
            let onMessageListener = null;
            let wrappedOnMessageListener = null;
            const createMessageListener = (listener) => function(event) {
              const modifiedData = _Network.handleMessage(2 /* WebSocket */, event.data);
              const modifiedEvent = new MessageEvent("message", {
                data: modifiedData === void 0 ? event.data : modifiedData,
                origin: event.origin,
                lastEventId: event.lastEventId,
                source: event.source,
                ports: Array.from(event.ports || [])
              });
              if (typeof listener === "function") {
                return listener.call(socket, modifiedEvent);
              }
              if (listener && typeof listener.handleEvent === "function") {
                return listener.handleEvent(modifiedEvent);
              }
            };
            socket.addEventListener = function(...args2) {
              const [type, listener, options] = args2;
              if (type !== "message" || !listener) {
                return originalAddEventListener.apply(socket, args2);
              }
              const wrappedListener = createMessageListener(listener);
              wrappedMessageListeners.set(listener, wrappedListener);
              return originalAddEventListener.call(socket, type, wrappedListener, options);
            };
            socket.removeEventListener = function(...args2) {
              const [type, listener, options] = args2;
              if (type !== "message" || !listener) {
                return originalRemoveEventListener.apply(socket, args2);
              }
              const wrappedListener = wrappedMessageListeners.get(listener) || listener;
              wrappedMessageListeners.delete(listener);
              return originalRemoveEventListener.call(socket, type, wrappedListener, options);
            };
            Object.defineProperty(socket, "onmessage", {
              get() {
                return onMessageListener;
              },
              set(fn) {
                if (wrappedOnMessageListener) {
                  originalRemoveEventListener.call(socket, "message", wrappedOnMessageListener);
                  wrappedOnMessageListener = null;
                }
                onMessageListener = fn;
                if (!fn) {
                  return;
                }
                wrappedOnMessageListener = createMessageListener(fn);
                originalAddEventListener.call(socket, "message", wrappedOnMessageListener);
              },
              configurable: true
            });
            return socket;
          };
          targetWindow.WebSocket.prototype = originalWebSocket.prototype;
          try {
            Object.setPrototypeOf(targetWindow.WebSocket, originalWebSocket);
          } catch {
          }
        }
        static sendChatMessage(channelId, message) {
          const url = channelId == "faction" ? "https://www.torn.com/tchat/rooms/faction/messages" : `https://www.torn.com/tchat/dm/${channelId}/messages`;
          targetWindow.fetch(url, {
            method: "POST",
            body: JSON.stringify({
              "content": message,
              "reqId": this.createChatMessageId()
            })
          });
        }
        static createChatMessageId() {
          const cryptoObject = targetWindow.crypto || window.crypto;
          if (cryptoObject && typeof cryptoObject.randomUUID === "function") {
            return cryptoObject.randomUUID();
          }
          return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (value) => {
            const random = Math.floor(Math.random() * 16);
            const digit = value === "x" ? random : random & 3 | 8;
            return digit.toString(16);
          });
        }
        // filter: URL pattern for Fetch/XHR, dotted payload path for WebSocket.
        // Returns an unsubscribe function.
        static onMessage(type, callback, filter) {
          const handler = {
            type,
            callback,
            filter: this.isUrlFilteredType(type) ? filter ? new RegExp(filter) : filter : filter ? filter.split(".") : filter
          };
          this.handlers.push(handler);
          return () => {
            const index = this.handlers.indexOf(handler);
            if (index !== -1) {
              this.handlers.splice(index, 1);
            }
          };
        }
        // Delays the next fetch response whose URL matches, until the promise from `hold` settles.
        // One-shot: removed on first match. Returns a function that removes it.
        static holdNextFetch(filter, hold) {
          const entry = { filter: new RegExp(filter), hold };
          this.holds.push(entry);
          return () => {
            const index = this.holds.indexOf(entry);
            if (index !== -1) {
              this.holds.splice(index, 1);
            }
          };
        }
        static async waitForHolds(url) {
          const matched = this.holds.filter((entry) => entry.filter.test(url));
          if (!matched.length) {
            return;
          }
          this.holds = this.holds.filter((entry) => !matched.includes(entry));
          const waits = matched.map((entry) => {
            try {
              return entry.hold();
            } catch {
              return null;
            }
          });
          await Promise.all(waits.map((wait) => wait?.catch(() => void 0)));
        }
        static isUrlFilteredType(type) {
          return type == 1 /* Fetch */ || type == 0 /* XHR */;
        }
        static handleMessage(type, message, url = "") {
          const data = jsonParse(message);
          if (!data) {
            return void 0;
          }
          const result = this.emitMessage(type, data, url);
          return result === void 0 ? void 0 : JSON.stringify(result);
        }
        static emitMessage(type, data, url) {
          const handlers = this.handlers.filter((handler) => handler.type == type || handler.type == 3 /* All */);
          let modifiedData;
          handlers.forEach((handler) => {
            if (!handler.filter || this.isUrlFilteredType(type) && handler.filter instanceof RegExp && handler.filter.test(url) || type == 2 /* WebSocket */ && isStringArray(handler.filter) && hasNestedProperty(data, handler.filter)) {
              let result;
              try {
                result = handler.callback(data, url);
              } catch (error) {
                console.error("[warhelper] network handler failed", error);
                return;
              }
              if (result !== void 0) {
                data = result;
                modifiedData = result;
              }
            }
          });
          return modifiedData;
        }
        static hasMatchingHandlers(type, url) {
          return this.handlers.some((handler) => {
            return (handler.type == type || handler.type == 3 /* All */) && (!handler.filter || this.isUrlFilteredType(type) && handler.filter instanceof RegExp && handler.filter.test(url));
          });
        }
      };
    }
  });

  // src/DataMonitor.ts
  function hasOwn(value, key) {
    return Object.prototype.hasOwnProperty.call(value, key);
  }
  function toFiniteNumber(value) {
    const normalized = typeof value === "string" ? value.replace(/,/g, "").trim() : value;
    if (normalized === "") {
      return null;
    }
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }
  function normalizeStatusText(value) {
    if (typeof value !== "string") {
      return null;
    }
    switch (value.trim().toLowerCase()) {
      case "okay":
        return "Okay";
      case "hospital":
        return "Hospital";
      case "jail":
        return "Jail";
      case "traveling":
      case "travelling":
        return "Traveling";
      case "abroad":
        return "Abroad";
      case "federal":
        return "Federal";
      case "fallen":
        return "Fallen";
      default:
        return null;
    }
  }
  function getStatusText(status) {
    return normalizeStatusText(status.text) || normalizeStatusText(status.state);
  }
  function getStatusUpdateAt(status) {
    if (hasOwn(status, "updateAt")) {
      return toFiniteNumber(status.updateAt);
    }
    if (hasOwn(status, "until")) {
      return toFiniteNumber(status.until);
    }
    return null;
  }
  function hasStatusData(status) {
    const updateAt = getStatusUpdateAt(status);
    return getStatusText(status) !== null || updateAt !== null && updateAt > 0;
  }
  function getLoggedInUserId() {
    const userNode = document.querySelector('.settings-menu a[href*="XID="]');
    if (!(userNode instanceof HTMLAnchorElement)) {
      return 0;
    }
    const match = userNode.href.match(/XID=(\d+)/i);
    return match?.[1] ? parseInt(match[1]) : 0;
  }
  function getWarMemberFactionId(member) {
    return toFiniteNumber(
      member?.factionId ?? member?.factionID ?? member?.faction_id ?? member?.faction?.id ?? member?.faction?.ID
    );
  }
  function getWarMemberUserId(member) {
    return toFiniteNumber(
      member?.userID ?? member?.userId ?? member?.user_id ?? member?.user?.id ?? member?.user?.ID
    );
  }
  function getAttackDefenderUserId(data) {
    return toFiniteNumber(
      data?.DB?.defenderUserId ?? data?.DB?.defenderUserID ?? data?.DB?.defenderId ?? data?.DB?.defenderID ?? data?.defenderUserId ?? data?.defenderUserID ?? data?.defenderId ?? data?.defenderID ?? data?.defender?.userID ?? data?.defender?.userId
    );
  }
  function getWarMemberName(member) {
    const value = member?.playername ?? member?.playerName ?? member?.player_name ?? member?.name ?? member?.userName ?? member?.username ?? member?.user?.name;
    return typeof value === "string" && value.trim() ? value.trim() : null;
  }
  function getOnlineStatusFromValue(value) {
    if (typeof value === "string") {
      const normalized = value.trim().toLowerCase();
      if (normalized === "online" || normalized === "idle" || normalized === "offline") {
        return normalized;
      }
    }
    if (value && typeof value === "object") {
      const record = value;
      return getOnlineStatusFromValue(
        record["status"] ?? record["state"] ?? record["text"] ?? record["type"]
      );
    }
    return "unknown";
  }
  function getWarMemberOnlineStatus(member) {
    return getOnlineStatusFromValue(
      member?.onlineStatus ?? member?.online_status ?? member?.activityStatus ?? member?.activity_status ?? member?.lastAction ?? member?.last_action ?? member?.lastaction ?? member?.user?.lastAction ?? member?.user?.last_action ?? member?.onlineStatus?.status
    );
  }
  function getMemberStatus(member) {
    const value = member?.status ?? member?.userStatus ?? member?.user_status ?? member?.state;
    if (value && typeof value === "object") {
      return value;
    }
    const text2 = typeof value === "string" ? value : "";
    if (!text2) {
      return null;
    }
    const status = { state: text2 };
    const until = toFiniteNumber(
      member?.updateAt ?? member?.until ?? member?.statusUntil ?? member?.status_until
    );
    if (until !== null) {
      status.until = until;
    }
    const area = toFiniteNumber(member?.area ?? member?.travelArea ?? member?.travel_area);
    if (area !== null) {
      status.area = area;
    }
    return status;
  }
  function isCachedUserStatus(value) {
    if (!value || typeof value !== "object") {
      return false;
    }
    const record = value;
    const onlineStatus = record["onlineStatus"];
    return toFiniteNumber(record["area"]) !== null && typeof record["status"] === "string" && toFiniteNumber(record["updateAt"]) !== null && toFiniteNumber(record["score"]) !== null && toFiniteNumber(record["factionId"]) !== null && typeof record["name"] === "string" && normalizeStatusText(record["status"]) !== null && (onlineStatus === "online" || onlineStatus === "idle" || onlineStatus === "offline" || onlineStatus === "unknown");
  }
  var USER_STATUS_CACHE_PREFIX, USER_STATUS_CACHE_SECONDS, HELD_UPDATES_LIMIT, DataMonitor;
  var init_DataMonitor = __esm({
    "src/DataMonitor.ts"() {
      "use strict";
      init_Cache();
      init_Config();
      init_Network();
      init_Utilities();
      USER_STATUS_CACHE_PREFIX = "user_status_";
      USER_STATUS_CACHE_SECONDS = 2 * 24 * 60 * 60;
      HELD_UPDATES_LIMIT = 1e4;
      DataMonitor = class _DataMonitor extends EventTarget {
        static {
          this.currentUser = 0;
        }
        static {
          this.userStatus = {};
        }
        static {
          this.observedStatusUserIds = /* @__PURE__ */ new Set();
        }
        static {
          this.statusObservedAt = {};
        }
        static {
          this.userStatusChangedFrame = null;
        }
        static {
          this.pendingChangedUserIds = /* @__PURE__ */ new Set();
        }
        static {
          this.pendingStatusChangedUserIds = /* @__PURE__ */ new Set();
        }
        static {
          this.pendingObservedUserIds = /* @__PURE__ */ new Set();
        }
        static {
          this.warStatus = null;
        }
        static {
          this.warMemberIds = /* @__PURE__ */ new Set();
        }
        static {
          this.warFactions = [];
        }
        static {
          this.territoryWarIds = /* @__PURE__ */ new Set();
        }
        static {
          this.rankedWarList = true;
        }
        static {
          this.warGraph = { score: [], goal: [] };
        }
        static {
          this.warGraphSnapshot = null;
        }
        static {
          this.missedUpdates = false;
        }
        static {
          this.heldUpdates = [];
        }
        static {
          this.replayObservedAt = null;
        }
        static {
          this.statusTransitionHandlers = [];
        }
        static {
          Network.onMessage(3 /* All */, (data) => this.handleMessage(data));
          document.addEventListener("visibilitychange", () => {
            if (!document.hidden) {
              this.applyHeldUpdates();
            }
          });
        }
        static {
          this._instance = new _DataMonitor();
        }
        static dispatch(event) {
          this._instance.dispatchEvent(event);
        }
        static dispatchUserStatusChanged() {
          if (this.userStatusChangedFrame !== null) {
            return;
          }
          this.userStatusChangedFrame = requestAnimationFrame(() => {
            const userIds = Array.from(this.pendingChangedUserIds);
            const statusUserIds = Array.from(this.pendingStatusChangedUserIds);
            const observedUserIds = Array.from(this.pendingObservedUserIds);
            this.pendingChangedUserIds.clear();
            this.pendingStatusChangedUserIds.clear();
            this.pendingObservedUserIds.clear();
            this.userStatusChangedFrame = null;
            if (userIds.length > 0) {
              this.dispatch(new CustomEvent("UserStatusChanged", {
                detail: { userIds, statusUserIds }
              }));
            }
            if (observedUserIds.length > 0) {
              this.dispatch(new CustomEvent("UserStatusObserved", {
                detail: { userIds: observedUserIds }
              }));
            }
          });
        }
        static on(type, listener) {
          this._instance.addEventListener(type, listener);
        }
        static onStatusTransition(handler) {
          this.statusTransitionHandlers.push(handler);
        }
        static parseWarGraphEntries(entries) {
          if (!Array.isArray(entries)) {
            return [];
          }
          return entries.reduce((parsed, entry) => {
            if (!Array.isArray(entry) || entry.length < 2) {
              return parsed;
            }
            const timestamp = toFiniteNumber(entry[0]);
            const value = toFiniteNumber(entry[1]);
            if (timestamp === null || value === null) {
              return parsed;
            }
            parsed.push({ timestamp, value });
            return parsed;
          }, []);
        }
        static areWarGraphEntriesEqual(a, b) {
          if (a.length !== b.length) {
            return false;
          }
          return a.every((entry, index) => {
            const other = b[index];
            return other?.timestamp === entry.timestamp && other.value === entry.value;
          });
        }
        static updateUserStatus(userId, status = null, score = null, factionId = null, name = null, onlineStatus = "unknown") {
          const numericUserId = toFiniteNumber(userId);
          if (numericUserId === null || numericUserId == 0) {
            return;
          }
          let dataChanged = false;
          let statusChanged = false;
          if (this.userStatus[numericUserId] === void 0) {
            dataChanged = true;
            this.userStatus[numericUserId] = {
              area: 1,
              status: "Okay",
              updateAt: 0,
              score: 0,
              factionId: 0,
              name: "",
              onlineStatus: "unknown"
            };
          }
          const hasObservedStatus = status ? hasStatusData(status) : false;
          const previous = hasObservedStatus && this.observedStatusUserIds.has(numericUserId) ? { ...this.userStatus[numericUserId] } : null;
          if (status) {
            if (hasObservedStatus) {
              this.observedStatusUserIds.add(numericUserId);
              this.statusObservedAt[numericUserId] = this.replayObservedAt ?? getServerTimestampSeconds();
              this.pendingObservedUserIds.add(numericUserId);
            }
            const nextArea = hasOwn(status, "area") ? toFiniteNumber(status.area) : null;
            const nextStatus = getStatusText(status);
            const nextUpdateAt = getStatusUpdateAt(status);
            if (nextArea !== null && this.userStatus[numericUserId].area != nextArea) {
              this.userStatus[numericUserId].area = nextArea;
              dataChanged = true;
              statusChanged = true;
            }
            if (nextStatus !== null && this.userStatus[numericUserId].status != nextStatus) {
              this.userStatus[numericUserId].status = nextStatus;
              dataChanged = true;
              statusChanged = true;
            }
            if (nextUpdateAt !== null && this.userStatus[numericUserId].updateAt != nextUpdateAt) {
              this.userStatus[numericUserId].updateAt = nextUpdateAt;
              dataChanged = true;
              statusChanged = true;
            }
          }
          const numericScore = score !== null ? toFiniteNumber(score) : null;
          if (numericScore !== null) {
            const current = this.userStatus[numericUserId].score;
            const nextScore = numericScore < 0 ? Math.abs(numericScore) : current + numericScore;
            if (nextScore !== current) {
              this.userStatus[numericUserId].score = nextScore;
              dataChanged = true;
            }
          }
          if (factionId !== null && this.userStatus[numericUserId].factionId != factionId) {
            this.userStatus[numericUserId].factionId = factionId;
            dataChanged = true;
          }
          if (name !== null && this.userStatus[numericUserId].name != name) {
            this.userStatus[numericUserId].name = name;
            dataChanged = true;
          }
          if (onlineStatus !== "unknown" && this.userStatus[numericUserId].onlineStatus != onlineStatus) {
            this.userStatus[numericUserId].onlineStatus = onlineStatus;
            dataChanged = true;
          }
          if (dataChanged) {
            this.pendingChangedUserIds.add(numericUserId);
            if (statusChanged) {
              this.pendingStatusChangedUserIds.add(numericUserId);
            }
            if (hasObservedStatus) {
              this.cacheUserStatus(numericUserId);
            }
          }
          if (previous && previous.status !== this.userStatus[numericUserId].status) {
            const next = { ...this.userStatus[numericUserId] };
            const observedAt = this.statusObservedAt[numericUserId];
            this.statusTransitionHandlers.forEach((handler) => handler(numericUserId, previous, next, observedAt));
          }
          if (dataChanged || hasObservedStatus) {
            this.dispatchUserStatusChanged();
          }
        }
        static getUserStatusCacheKey(userId) {
          return `${USER_STATUS_CACHE_PREFIX}${userId}`;
        }
        static cacheUserStatus(userId) {
          const status = this.userStatus[userId];
          if (!status) {
            return;
          }
          Cache.set(this.getUserStatusCacheKey(userId), { ...status }, USER_STATUS_CACHE_SECONDS);
        }
        static readCachedUserStatus(userId) {
          const cached = Cache.get(this.getUserStatusCacheKey(userId));
          if (!isCachedUserStatus(cached)) {
            return;
          }
          return { ...cached };
        }
        static setDefenderItems(userId, items, source, observedAt) {
          // Lite build: loadout substitution removed. No-op stub retained so callers don't crash.
        }
        static handleDefenderItems(userId, items) {
          return null;
        }
        static getDefenderLoadout(userId) {
          return null;
        }
        static getCurrentUserId() {
          if (!this.currentUser) {
            this.currentUser = getLoggedInUserId();
          }
          return this.currentUser;
        }
        static applyUpdates(data) {
          const attackerUser = data?.DB?.attackerUser;
          if (attackerUser) {
            this.updateUserStatus(
              getWarMemberUserId(attackerUser) || 0,
              getMemberStatus(attackerUser),
              null,
              getWarMemberFactionId(attackerUser),
              getWarMemberName(attackerUser),
              getWarMemberOnlineStatus(attackerUser)
            );
          }
          const defenderUser = data?.DB?.defenderUser;
          const defenderUserId = getWarMemberUserId(defenderUser) || getAttackDefenderUserId(data) || 0;
          if (defenderUser) {
            this.updateUserStatus(
              defenderUserId,
              getMemberStatus(defenderUser),
              null,
              getWarMemberFactionId(defenderUser),
              getWarMemberName(defenderUser),
              getWarMemberOnlineStatus(defenderUser)
            );
          }
          const updateStatus = data?.push?.pub?.data?.message?.namespaces?.users?.actions?.updateStatus;
          if (updateStatus) {
            this.updateUserStatus(
              updateStatus.userId,
              updateStatus.status
            );
          }
          const attackFinish = data?.push?.pub?.data?.message?.namespaces?.warBoxes?.actions?.attackFinish;
          if (attackFinish) {
            this.updateUserStatus(
              attackFinish.attacker.userId,
              null,
              attackFinish.respect
            );
          }
          this.setTerritoryWars(data);
          const warMembers = data?.warDesc?.members;
          if (warMembers) {
            this.setMissedUpdates(false);
            this.setWarMembers(data.warDesc);
            warMembers.forEach((member) => {
              const score = toFiniteNumber(member.score);
              this.updateUserStatus(
                getWarMemberUserId(member) || 0,
                member.status,
                score !== null ? -score : null,
                getWarMemberFactionId(member),
                getWarMemberName(member),
                getWarMemberOnlineStatus(member)
              );
            });
          }
          const graph = data?.warDesc?.graph;
          let graphChanged = false;
          if (graph?.data) {
            const nextScore = this.parseWarGraphEntries(graph.data);
            if (!this.areWarGraphEntriesEqual(this.warGraph.score, nextScore)) {
              this.warGraph.score = nextScore;
              graphChanged = true;
            }
          }
          if (graph?.respectRequirement) {
            const nextGoal = this.parseWarGraphEntries(graph.respectRequirement);
            if (!this.areWarGraphEntriesEqual(this.warGraph.goal, nextGoal)) {
              this.warGraph.goal = nextGoal;
              graphChanged = true;
            }
          }
          if (graphChanged) {
            this.dispatch(new Event("WarGraphChanged"));
          }
          const users = data?.users;
          if (users) {
            Object.keys(users).forEach((id) => {
              this.updateUserStatus(
                id,
                users[id].status,
                null,
                null,
                null,
                getWarMemberOnlineStatus(users[id])
              );
            });
          }
          const rankedWarMembers = data?.rankedWarMembers;
          if (rankedWarMembers) {
            Object.keys(rankedWarMembers).forEach((id) => {
              this.updateUserStatus(
                id,
                null,
                null,
                null,
                null,
                getWarMemberOnlineStatus(rankedWarMembers[id])
              );
            });
          }
          const war = data?.wars?.find((e) => e.key == "rank");
          if (war) {
            const nextWarStatus = {
              started: toFiniteNumber(war.timer),
              initRespectRequirement: toFiniteNumber(war.initRespectRequirement),
              respectRequirement: toFiniteNumber(war.respectRequirement),
              ownScore: Math.floor(toFiniteNumber(war.currentFaction?.score) || 0),
              opponentScore: Math.floor(toFiniteNumber(war.opponentFaction?.score) || 0)
            };
            if (nextWarStatus.started !== null && nextWarStatus.initRespectRequirement !== null && nextWarStatus.respectRequirement !== null && nextWarStatus.ownScore !== null && nextWarStatus.opponentScore !== null) {
              const previousWarStatus = this.warStatus;
              this.warStatus = nextWarStatus;
              if (!previousWarStatus || previousWarStatus.started !== this.warStatus.started || previousWarStatus.initRespectRequirement !== this.warStatus.initRespectRequirement || previousWarStatus.respectRequirement !== this.warStatus.respectRequirement || previousWarStatus.ownScore !== this.warStatus.ownScore || previousWarStatus.opponentScore !== this.warStatus.opponentScore) {
                this.dispatch(new Event("WarStatusChanged"));
              }
            }
          }
          const time = data?.time;
          if (time && this.replayObservedAt === null) {
            updateServerTime(time);
          }
        }
        static holdUpdate(data) {
          const namespaces = data?.push?.pub?.data?.message?.namespaces;
          if (!data?.DB?.attackerUser && !data?.DB?.defenderUser && !namespaces?.users?.actions?.updateStatus && !namespaces?.warBoxes?.actions?.attackFinish && !data?.warDesc && !data?.users && !data?.rankedWarMembers && !data?.wars) {
            return;
          }
          if (this.heldUpdates.length >= HELD_UPDATES_LIMIT) {
            this.heldUpdates = [];
            this.setMissedUpdates(true);
            return;
          }
          this.heldUpdates.push({ data, receivedAt: getServerTimestampSeconds() });
        }
        // Applies what a hidden tab held, in order, with the time each arrived.
        static applyHeldUpdates() {
          const held = this.heldUpdates;
          this.heldUpdates = [];
          held.forEach(({ data, receivedAt }) => {
            this.replayObservedAt = receivedAt;
            try {
              this.applyUpdates(data);
            } catch {
            }
          });
          this.replayObservedAt = null;
        }
        static handleMessage(data) {
          try {
            if (typeof data !== "object") {
              data = JSON.parse(data);
            }
            if (typeof data !== "object") {
              return;
            }
            // Lite build: loadout substitution removed. We only consume status updates.
            if (document.hidden) {
              this.holdUpdate(data);
            } else {
              this.applyUpdates(data);
            }
            return void 0;
          } catch (e) {
          }
        }
        // True when a hidden tab held more updates than it could replay and no full
        // war reload has arrived since.
        static hasMissedUpdates() {
          return this.missedUpdates;
        }
        static setMissedUpdates(missed) {
          if (this.missedUpdates === missed) {
            return;
          }
          this.missedUpdates = missed;
          this.dispatch(new Event("MissedUpdatesChanged"));
        }
        static getUserStatus(userId) {
          const status = this.userStatus[userId];
          if (!status) {
            return this.readCachedUserStatus(userId);
          }
          if (this.observedStatusUserIds.has(userId)) {
            return status;
          }
          return this.readCachedUserStatus(userId);
        }
        // When we last saw this user's status live, or null.
        static getStatusObservedAt(userId) {
          return this.statusObservedAt[userId] ?? null;
        }
        static setUserStatus(userId, status) {
          this.updateUserStatus(userId, status);
        }
        static getWarMemberIds() {
          return this.warMemberIds;
        }
        static isRankedWarList() {
          return this.rankedWarList;
        }
        // The URL's war (#/war/<id>) is a territory war, else the last loaded war list was a wall.
        static isTerritoryWarView() {
          return this.territoryWarIds.has(Number(location.hash.match(/\/war\/(\d+)/)?.[1])) || !this.rankedWarList;
        }
        static getWarFactions() {
          return this.warFactions;
        }
        // Territory war ids from getwardata's list, so the war view can step aside for them.
        static setTerritoryWars(data) {
          if (!Array.isArray(data?.wars)) {
            return;
          }
          data.wars.forEach((war) => {
            const warId = toFiniteNumber(war?.warID ?? war?.ID);
            if ((war?.isTerritorial || war?.type === "territory") && warId) {
              this.territoryWarIds.add(warId);
            }
          });
        }
        static setWarMembers(warDesc) {
          const memberIds = [];
          const factions = [];
          const addFaction = (id, name) => {
            if (id && id > 0 && !factions.some((faction) => faction.id === id)) {
              factions.push({ id, name: typeof name === "string" ? name.trim() : "" });
            }
          };
          addFaction(toFiniteNumber(warDesc?.currentFaction?.id), warDesc?.currentFaction?.name);
          addFaction(toFiniteNumber(warDesc?.opponentFaction?.id), warDesc?.opponentFaction?.name);
          Object.values(warDesc?.members || {}).forEach((member) => {
            const userId = getWarMemberUserId(member);
            if (userId) {
              memberIds.push(userId);
            }
            addFaction(getWarMemberFactionId(member), null);
          });
          if (!memberIds.length) {
            return;
          }
          const key = (list) => list.map((faction) => faction.id).sort((a, b) => a - b).join(",");
          const sameWar = key(factions) === key(this.warFactions);
          const membersChanged = memberIds.length !== this.warMemberIds.size || memberIds.some((userId) => !this.warMemberIds.has(userId));
          const ranked = Boolean(warDesc?.currentFaction && warDesc?.opponentFaction);
          const rankedChanged = ranked !== this.rankedWarList;
          this.rankedWarList = ranked;
          this.warMemberIds = new Set(memberIds);
          if (sameWar) {
            factions.forEach((faction) => {
              const known = this.warFactions.find((entry) => entry.id === faction.id);
              if (known && !known.name && faction.name) {
                known.name = faction.name;
              }
            });
          } else {
            this.warFactions = factions;
          }
          if (!sameWar || membersChanged || rankedChanged) {
            this.dispatch(new Event("WarStatusChanged"));
          }
        }
        static getWarStatus() {
          return this.warStatus ? { ...this.warStatus } : null;
        }
        // Returns a copy of the war graph, reused until the data actually changes.
        static getWarGraph() {
          const snapshot = this.warGraphSnapshot;
          if (snapshot !== null && snapshot.sourceScore === this.warGraph.score && snapshot.sourceGoal === this.warGraph.goal) {
            return snapshot.value;
          }
          const value = {
            score: this.warGraph.score.map((entry) => ({ ...entry })),
            goal: this.warGraph.goal.map((entry) => ({ ...entry }))
          };
          this.warGraphSnapshot = {
            sourceScore: this.warGraph.score,
            sourceGoal: this.warGraph.goal,
            value
          };
          return value;
        }
        static getWarUserStatuses() {
          const statuses = {};
          Object.keys(this.userStatus).forEach((userId) => {
            const status = this.userStatus[Number(userId)];
            if (!status?.factionId) {
              return;
            }
            statuses[Number(userId)] = { ...status };
          });
          return statuses;
        }
        static getCurrentFactionId() {
          return this.getCurrentUserStatus()?.factionId || 0;
        }
        static getCurrentUserStatus() {
          return this.userStatus[this.getCurrentUserId()];
        }
      };
    }
  });

  // src/Tooltip.ts
  var TOOLTIP_ID, Tooltip;
  var init_Tooltip = __esm({
    "src/Tooltip.ts"() {
      "use strict";
      TOOLTIP_ID = "__warhelper_custom_tooltip";
      Tooltip = class {
        static {
          this.documentStates = /* @__PURE__ */ new WeakMap();
        }
        static {
          this.states = [];
        }
        static bind(owner, options) {
          this.init(owner.ownerDocument);
          let currentOptions = options;
          const showFromPointer = (event) => {
            if (event.pointerType === "touch") {
              return;
            }
            this.show(owner, currentOptions, event, false);
          };
          const moveFromPointer = (event) => {
            if (event.pointerType === "touch") {
              return;
            }
            this.move(owner, event);
          };
          const toggleFromTouch = (event) => {
            if (event.pointerType !== "touch") {
              return;
            }
            const documentState = this.getDocumentState(owner.ownerDocument);
            if (documentState.state?.owner === owner && documentState.state.pinned) {
              this.hide(owner);
              return;
            }
            this.show(owner, currentOptions, owner, true);
          };
          const hideFromPointer = (event) => {
            if (event.pointerType === "touch") {
              return;
            }
            this.hide(owner);
          };
          const showFromFocus = () => this.show(owner, currentOptions, owner, true);
          const hideFromFocus = () => this.hide(owner);
          const hideFromEscape = (event) => {
            if (event.key === "Escape") {
              this.hide(owner);
            }
          };
          owner.addEventListener("pointerenter", showFromPointer);
          owner.addEventListener("pointermove", moveFromPointer);
          owner.addEventListener("pointerdown", toggleFromTouch);
          owner.addEventListener("pointerleave", hideFromPointer);
          owner.addEventListener("pointercancel", hideFromPointer);
          owner.addEventListener("focus", showFromFocus);
          owner.addEventListener("blur", hideFromFocus);
          owner.addEventListener("keydown", hideFromEscape);
          return {
            update: (nextOptions) => {
              currentOptions = nextOptions;
              const documentState = this.getDocumentState(owner.ownerDocument);
              if (documentState.state?.owner === owner) {
                this.show(owner, currentOptions, documentState.state.anchor, documentState.state.pinned);
              }
            },
            destroy: () => {
              owner.removeEventListener("pointerenter", showFromPointer);
              owner.removeEventListener("pointermove", moveFromPointer);
              owner.removeEventListener("pointerdown", toggleFromTouch);
              owner.removeEventListener("pointerleave", hideFromPointer);
              owner.removeEventListener("pointercancel", hideFromPointer);
              owner.removeEventListener("focus", showFromFocus);
              owner.removeEventListener("blur", hideFromFocus);
              owner.removeEventListener("keydown", hideFromEscape);
              this.hide(owner);
            }
          };
        }
        static show(owner, options, anchor, pinned = false) {
          const documentState = this.init(owner.ownerDocument);
          const content = this.getContent(options);
          if (!content) {
            this.hide(owner);
            return;
          }
          const node = this.getNode(documentState);
          node.className = `__warhelper_custom_tooltip ${options.className || ""}`.trim();
          node.style.visibility = "hidden";
          node.style.display = "block";
          node.setAttribute("role", "tooltip");
          if (options.html) {
            node.innerHTML = content;
          } else {
            node.textContent = content;
          }
          owner.setAttribute("aria-describedby", TOOLTIP_ID);
          documentState.state = { owner, options, anchor, pinned };
          this.position(documentState, anchor, options.placement || (this.isHTMLElement(anchor) ? "element" : "pointer"), options.side);
          node.style.visibility = "";
        }
        static hide(owner) {
          if (owner) {
            const documentState = this.documentStates.get(owner.ownerDocument);
            if (!documentState || documentState.state?.owner !== owner) {
              return;
            }
            this.hideState(documentState);
            return;
          }
          this.states.forEach((state) => this.hideState(state));
        }
        static refresh(owner) {
          if (owner) {
            const documentState = this.documentStates.get(owner.ownerDocument);
            if (!documentState?.state || documentState.state.owner !== owner) {
              return;
            }
            this.show(documentState.state.owner, documentState.state.options, documentState.state.anchor, documentState.state.pinned);
            return;
          }
          this.states.forEach((documentState) => {
            if (documentState.state) {
              this.show(documentState.state.owner, documentState.state.options, documentState.state.anchor, documentState.state.pinned);
            }
          });
        }
        static move(owner, anchor) {
          const documentState = this.documentStates.get(owner.ownerDocument);
          if (!documentState?.state || documentState.state.owner !== owner || documentState.state.pinned) {
            return;
          }
          documentState.state.anchor = anchor;
          this.position(documentState, anchor, documentState.state.options.placement || "pointer", documentState.state.options.side);
        }
        static init(documentNode) {
          const documentState = this.getDocumentState(documentNode);
          if (documentState.initialized) {
            return documentState;
          }
          documentState.initialized = true;
          this.addStyle(documentNode, `
.__warhelper_custom_tooltip {
  position: fixed;
  z-index: 100000;
  box-sizing: border-box;
  max-width: calc(100vw - 16px);
  padding: 7px 9px;
  border: 1px solid rgba(20, 24, 28, 0.18);
  border-radius: 4px;
  background: #fff;
  color: #222;
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.28);
  pointer-events: none;
  font-size: 11px;
  line-height: 14px;
}

body.dark-mode .__warhelper_custom_tooltip {
  border-color: rgba(255, 255, 255, 0.18);
  background: #20252b;
  color: #e8edf2;
}

.__warhelper_custom_tooltip .__warhelper_tooltip {
  border-collapse: collapse;
  font-family: monospace;
}

.__warhelper_custom_tooltip .__warhelper_tooltip_title {
  margin-bottom: 4px;
  font-weight: bold;
  text-align: center;
}

.__warhelper_custom_tooltip .__warhelper_tooltip_rows {
  display: grid;
  gap: 2px;
}

.__warhelper_custom_tooltip .__warhelper_tooltip_row {
  display: grid;
  grid-template-columns: auto auto;
  column-gap: 8px;
  color: inherit;
}

.__warhelper_custom_tooltip .__warhelper_tooltip_row span:last-child {
  text-align: right;
  white-space: nowrap;
}

.__warhelper_custom_tooltip .__warhelper_tooltip td {
  padding: 2px 0;
  color: inherit;
  white-space: nowrap;
}

.__warhelper_custom_tooltip .__warhelper_tooltip td + td {
  padding-left: 8px;
  text-align: right;
}
`);
          documentNode.addEventListener("pointerdown", (event) => this.hideOnOutsidePointer(documentState, event), true);
          documentNode.defaultView?.addEventListener("scroll", () => this.hideState(documentState), true);
          documentNode.defaultView?.addEventListener("blur", () => this.hideState(documentState));
          return documentState;
        }
        static getDocumentState(documentNode) {
          let documentState = this.documentStates.get(documentNode);
          if (documentState) {
            return documentState;
          }
          documentState = {
            document: documentNode,
            initialized: false,
            node: null,
            state: null
          };
          this.documentStates.set(documentNode, documentState);
          this.states.push(documentState);
          return documentState;
        }
        static getNode(documentState) {
          if (documentState.node?.isConnected) {
            return documentState.node;
          }
          const node = documentState.document.createElement("div");
          node.id = TOOLTIP_ID;
          node.style.display = "none";
          (documentState.document.body || documentState.document.documentElement).appendChild(node);
          documentState.node = node;
          return node;
        }
        static getContent(options) {
          return typeof options.content === "function" ? options.content() : options.content;
        }
        static hideState(documentState) {
          if (documentState.state) {
            documentState.state.owner.removeAttribute("aria-describedby");
          }
          documentState.state = null;
          if (documentState.node) {
            documentState.node.style.display = "none";
            documentState.node.textContent = "";
          }
        }
        static hideOnOutsidePointer(documentState, event) {
          const owner = documentState.state?.owner;
          const target = this.isNode(event.target, documentState.document) ? event.target : null;
          if (!owner || owner.contains(target)) {
            return;
          }
          this.hideState(documentState);
        }
        static position(documentState, anchor, placement, side = "top") {
          const node = this.getNode(documentState);
          const view = documentState.document.defaultView || window;
          const margin = 8;
          const offset = 8;
          const width = node.offsetWidth || 220;
          const height = node.offsetHeight || 100;
          const maxLeft = Math.max(margin, view.innerWidth - width - margin);
          const maxTop = Math.max(margin, view.innerHeight - height - margin);
          let left;
          let top;
          if (placement === "element" || this.isHTMLElement(anchor)) {
            const element2 = this.isHTMLElement(anchor) ? anchor : documentState.state?.owner;
            const rect = element2?.getBoundingClientRect();
            left = rect ? rect.left + rect.width / 2 - width / 2 : margin;
            if (rect) {
              const topPlacement = rect.top - height - offset;
              const bottomPlacement = rect.bottom + offset;
              top = side === "bottom" ? bottomPlacement : topPlacement;
              if (side === "bottom" && top > maxTop) {
                top = topPlacement;
              } else if (side === "top" && top < margin) {
                top = bottomPlacement;
              }
            } else {
              top = margin;
            }
          } else {
            left = anchor.clientX + offset;
            top = anchor.clientY + offset;
            if (left > maxLeft) {
              left = anchor.clientX - width - offset;
            }
            if (top > maxTop) {
              top = anchor.clientY - height - offset;
            }
          }
          node.style.left = `${Math.max(margin, Math.min(left, maxLeft))}px`;
          node.style.top = `${Math.max(margin, Math.min(top, maxTop))}px`;
        }
        static isHTMLElement(value) {
          if (!value || typeof value !== "object") {
            return false;
          }
          const documentNode = value.ownerDocument;
          const view = documentNode?.defaultView;
          return view ? value instanceof view.HTMLElement : value instanceof HTMLElement;
        }
        static isNode(value, documentNode) {
          if (!value || typeof value !== "object") {
            return false;
          }
          const view = documentNode.defaultView;
          return view ? value instanceof view.Node : value instanceof Node;
        }
        static addStyle(documentNode, css) {
          const styleElement = documentNode.createElement("style");
          styleElement.type = "text/css";
          styleElement.textContent = css;
          (documentNode.head || documentNode.documentElement).appendChild(styleElement);
        }
      };
    }
  });

  // src/HtmlObserver.ts
  var HtmlObserver;
  var init_HtmlObserver = __esm({
    "src/HtmlObserver.ts"() {
      "use strict";
      HtmlObserver = class {
        static {
          this.addHandlers = {};
        }
        static {
          this.observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
              if (!mutation) {
                return;
              }
              mutation.addedNodes.forEach((addedNode) => {
                if (!(addedNode instanceof HTMLElement)) {
                  return;
                }
                Object.keys(this.addHandlers).forEach((selector) => {
                  const elements = addedNode.matches(selector) ? [addedNode] : Array.from(addedNode.querySelectorAll(selector));
                  if (!elements.length) {
                    return;
                  }
                  elements.forEach((node) => {
                    if (this.addHandlers[selector] === void 0) {
                      return;
                    }
                    this.emitAdd(selector, node);
                  });
                });
              });
            });
          });
          this.observe();
        }
        static emitAdd(selector, node) {
          const handlers = this.addHandlers[selector];
          if (handlers === void 0) {
            return;
          }
          [...handlers].forEach((handler) => {
            const index = handlers.findIndex((h) => h.callback == handler.callback);
            if (index === -1) {
              return;
            }
            handler.callback(node);
            if (handler.once) {
              handlers.splice(index, 1);
            }
          });
        }
        static observe() {
          if (!document.body) {
            document.addEventListener("DOMContentLoaded", () => this.observe());
            return;
          }
          this.observer.observe(document.body, { childList: true, subtree: true });
        }
        static onAdd(selector, callback, once = false) {
          if (this.addHandlers[selector] === void 0) {
            this.addHandlers[selector] = [];
          }
          this.addHandlers[selector].push({
            callback,
            once
          });
          const nodes = Array.from(document.querySelectorAll(selector));
          if (!nodes.length) {
            return;
          }
          nodes.forEach((node) => {
            this.emitAdd(selector, node);
          });
        }
      };
    }
  });

  // src/Faction.ts
  var Faction_exports = {};
  __export(Faction_exports, {
    Faction: () => Faction
  });
  function getAreaSortName(area) {
    if (area == 1) {
      return "Torn";
    }
    return AREAS[area]?.name || "";
  }
  function isAwayFromTorn(userStatus) {
    return Boolean(
      userStatus && (userStatus.status == "Traveling" || userStatus.area !== 1 && (userStatus.status == "Abroad" || userStatus.status == "Hospital"))
    );
  }
  function compareSortUserName(a, b, ascending) {
    const comparison = a.userName.localeCompare(b.userName, void 0, { sensitivity: "base" });
    if (comparison != 0) {
      return ascending ? comparison : -comparison;
    }
    return a.userId - b.userId;
  }
  function compareSortNumeric(a, b, isAscending) {
    if (a.numeric == b.numeric) {
      return compareSortUserName(a, b, true);
    }
    return isAscending ? a.numeric - b.numeric : b.numeric - a.numeric;
  }
  function getAwayStatusValue(userStatus, isAscending) {
    if (userStatus.status == "Hospital") {
      return isAscending ? 2 : 1;
    }
    if (userStatus.status == "Jail") {
      return 3;
    }
    if (userStatus.status == "Traveling") {
      return 4;
    }
    return isAscending ? 1 : 2;
  }
  function getTravelSortTimestamp(userId, userStatus) {
    if (userStatus.status != "Traveling") {
      return userStatus.updateAt;
    }
    return Fly.getFlightArrivalTimestamp(userId) || userStatus.updateAt;
  }
  function getFlightPhaseSortValue(userId, userStatus) {
    if (userStatus.status != "Traveling") {
      return 0;
    }
    const phase = Fly.getFlightArrivalPhase(userId);
    if (phase == "possible") {
      return 0;
    }
    if (phase == "expected") {
      return 1;
    }
    return 2;
  }
  function getStatusSortKey(userId, userStatus, context) {
    if (!userStatus) {
      return [0, 0, "", 0, 0, 0];
    }
    const areaSortName = getAreaSortName(userStatus.area);
    if (userStatus.status == "Traveling" || userStatus.area != 1) {
      const isCurrentArea = context.canPrioritizeCurrentArea && context.userStatusCurrent !== void 0 && userStatus.area == context.userStatusCurrent.area;
      return [
        isCurrentArea ? context.currentAway : context.otherAway,
        isCurrentArea ? 0 : 1,
        areaSortName,
        getAwayStatusValue(userStatus, context.isAscending),
        getFlightPhaseSortValue(userId, userStatus),
        getTravelSortTimestamp(userId, userStatus)
      ];
    } else if (userStatus.status == "Hospital") {
      return [context.hospital, 0, "", 0, 0, userStatus.updateAt];
    } else if (userStatus.status == "Jail") {
      return [context.jailed, 0, "", 0, 0, userStatus.updateAt];
    } else {
      return [context.okay, 0, "", 0, 0, 0];
    }
  }
  function compareStatusSortKey(a, b, isAscending) {
    const keyA = a.status;
    const keyB = b.status;
    if (keyA === null || keyB === null) {
      return 0;
    }
    const [statusA, currentAreaA, areaA, awayStatusA, flightPhaseA, updateA] = keyA;
    const [statusB, currentAreaB, areaB, awayStatusB, flightPhaseB, updateB] = keyB;
    if (statusA != statusB) {
      return statusA - statusB;
    } else if (currentAreaA != currentAreaB) {
      return currentAreaA - currentAreaB;
    } else if (areaA != areaB) {
      if (areaA == "Torn") {
        return -1;
      }
      if (areaB == "Torn") {
        return 1;
      }
      const areaComparison = areaA.localeCompare(areaB, void 0, { sensitivity: "base" });
      return isAscending ? areaComparison : -areaComparison;
    } else if (awayStatusA != awayStatusB) {
      return awayStatusA - awayStatusB;
    } else if (flightPhaseA != flightPhaseB) {
      return isAscending ? flightPhaseA - flightPhaseB : flightPhaseB - flightPhaseA;
    } else if (updateA != updateB) {
      return isAscending ? updateA - updateB : updateB - updateA;
    } else {
      return compareSortUserName(a, b, true);
    }
  }
  var OUTSIDE_TERRITORY, BATTLE_STATS_SPY_TIMEOUT_MS, Faction;
  var init_Faction = __esm({
    "src/Faction.ts"() {
      "use strict";
      init_HtmlObserver();
      init_DataMonitor();
      init_Spy();
      init_Cache();
      init_Config();
      init_Fly();
      init_Tooltip();
      init_User();
      init_Utilities();
      OUTSIDE_TERRITORY = `:not(:where(body.${TERRITORY_VIEW_CLASS} .f-war-list *))`;
      BATTLE_STATS_SPY_TIMEOUT_MS = 3e4;
      Faction = class {
        static {
          this.battleStatNodes = [];
        }
        static {
          this.battleStatTooltipBindings = /* @__PURE__ */ new WeakMap();
        }
        static {
          this.timerNodes = [];
        }
        static {
          this.battleStatsUpdateRun = 0;
        }
        static {
          this.battleStatsReloadTimer = null;
        }
        static {
          this.sortFrame = null;
        }
        static {
          this.init();
        }
        static init() {
          if (!isOnFactionPage() && !isOnWarResultPage()) {
            return;
          }
          Fly.start();
          HtmlObserver.onAdd(".members-list", (node) => this.handleNode(node));
          DataMonitor.on("UserStatusChanged", () => this.scheduleSort());
          Fly.onDataChange(() => this.scheduleStatusSort());
          window.setTimeout(() => this.updateTimers(), 0);
          Cache.onBust(() => this.reloadBattleStats());
          ["torn_key", "tornstats_key", "bsp_key", "ffs_key", "yata_key", "spy_source_order"].forEach((key) => {
            Config.onChange(key, () => this.scheduleBattleStatsReload());
          });
          whenDomReady(() => {
            if (Config.get("hide_faction_icon") == "true" || false) {
              document.body.classList.add("__warhelper_hide_fac_icon");
            }
            if (Config.get("hide_whore") == "true" || false) {
              document.body.classList.add("__warhelper_hide_whore");
            }
            if (Config.get("ffcolor_bg") == "true" || false) {
              document.body.classList.add("__warhelper_ff_bgcolor");
            }
            if (Config.get("colorblind") == "true" || false) {
              document.body.classList.add("__warhelper_colorblind");
            }
          });
          Config.onChange("hide_faction_icon", (_key, value) => {
            if (value == "true") {
              document.body.classList.add("__warhelper_hide_fac_icon");
            } else {
              document.body.classList.remove("__warhelper_hide_fac_icon");
            }
          });
          Config.onChange("hide_whore", (_key, value) => {
            if (value == "true") {
              document.body.classList.add("__warhelper_hide_whore");
            } else {
              document.body.classList.remove("__warhelper_hide_whore");
            }
          });
          Config.onChange("ffcolor_bg", (_key, value) => {
            if (value == "true") {
              document.body.classList.add("__warhelper_ff_bgcolor");
            } else {
              document.body.classList.remove("__warhelper_ff_bgcolor");
            }
          });
          Config.onChange("colorblind", (_key, value) => {
            if (value == "true") {
              document.body.classList.add("__warhelper_colorblind");
            } else {
              document.body.classList.remove("__warhelper_colorblind");
            }
          });
          addStyle(`
body.__warhelper_hide_fac_icon .member${OUTSIDE_TERRITORY} div[class^="factionWrap_"] {
  display: none !important;
}
/*.member div[class^="factionWrap_"],
.member div[class^="honorWrap_"] img,
.member div[class^="honorWrap_"] .honor-text-svg {
  display: none !important;
}
.member div[class^="honorWrap_"] .honor-text {
  position: relative;
  font-family: inherit;
  font-size: inherit;
  font-weight: inherit;
  color: inherit;
  stroke: inherit;
}
.member div[class^="honorWrap_"] a {
  text-decoration: none;
}*/

.members-list > li${OUTSIDE_TERRITORY} {
  user-select: none;
}

.members-list > li${OUTSIDE_TERRITORY} .icons {
  overflow: hidden;
}

.member${OUTSIDE_TERRITORY} div[class^="honorWrap_"] {
  margin: 0 !important;
}

.member${OUTSIDE_TERRITORY} {
  overflow: hidden;
}
@media screen and (max-width: 784px) {
  .member${OUTSIDE_TERRITORY} {
    width: 100px !important;
  }
}

/* Hide levels only where Warhelper supplied a replacement stats cell. */
.members-cont :has(> .bs.__warhelper) > .level:not(.__warhelper):not(.bs) {
  display: none !important;
}

.tt-stats-estimate${OUTSIDE_TERRITORY} {
  display: none !important;
}

.level.__warhelper,
.lvl.__warhelper {
  display: block !important;
  position: relative;
}

.level.__warhelper,
.lvl.__warhelper {
  width: 40px !important;
  justify-content: right !important;
}

.__warhelper_status_icon {
  display: inline-block;
  margin-right: 2px;
}

.__warhelper_status_flag {
  display: inline-block;
  width: 14px;
  height: 10px;
  margin-right: 3px;
  border: 1px solid rgba(0, 0, 0, 0.35);
  box-sizing: border-box;
  background-position: center;
  background-repeat: no-repeat;
  background-size: cover;
  vertical-align: -1px;
}

.status:not(.__warhelper_status_multiline)${OUTSIDE_TERRITORY} {
  white-space: nowrap;
}

.status.__warhelper_status_multiline {
  align-content: center !important;
  justify-content: flex-end;
  flex-wrap: wrap;
  column-gap: 3px;
  row-gap: 0;
  white-space: normal !important;
  overflow: visible !important;
  line-height: 13px !important;
  min-height: 20px;
}

.status.__warhelper_status_multiline .__warhelper_status_icon,
.status.__warhelper_status_multiline .__warhelper_status_flag {
  margin-right: 0;
}

.status.__warhelper_status_multiline .__warhelper_status_main {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  white-space: nowrap;
  line-height: 13px;
}

.status.__warhelper_status_multiline .__warhelper_status_text {
  display: inline-block;
  white-space: normal;
  overflow-wrap: anywhere;
  line-height: 13px;
}

.status.__warhelper_status_multiline .__warhelper_status_detail {
  flex-basis: 100%;
  text-align: right;
  white-space: nowrap;
  line-height: 13px;
}

.status.__warhelper_status_multiline .__warhelper_status_detail.__warhelper_status_detail_hospital {
  color: #d9534f !important;
}

.status.jail${OUTSIDE_TERRITORY} {
  color: #f0ad4e !important;
}

.status.__warhelper_status_multiline .__warhelper_status_detail.__warhelper_status_detail_flight_possible {
  color: #d6b94c !important;
}

.members-list > li.__warhelper_status_multiline_row {
  height: auto !important;
  min-height: 32px;
  align-items: center;
}

.faction-info-wrap .level.__warhelper,
.faction-info-wrap .lvl.__warhelper {
  width: 50px !important;
  overflow: hidden;
}

.faction-info-wrap .__warhelper_total {
  line-height: 36px;
}

.__warhelper_tooltip {
  font-family: monospace;
}

.__warhelper_tooltip td {
  color: var(--default-gray-6-color);
}

.__warhelper_tooltip td:nth-child(2) {
  padding-left: 5px;
  text-align: right;
}

.__warhelper_fly_title {
  text-align: center;
  margin-bottom: 4px;
}

.__warhelper_fly_times {
  display: grid;
  gap: 2px;
}

.__warhelper_fly_time_row {
  display: grid;
  grid-template-columns: auto auto;
  column-gap: 8px;
  color: var(--default-gray-6-color);
}

.__warhelper_fly_time_row span:last-child {
  text-align: right;
  white-space: nowrap;
}

body:not(.__warhelper_hide_whore) .__warhelper_total.str {
  color: #CC6666;
}

body:not(.__warhelper_hide_whore) .__warhelper_total.def {
  color: #6699CC;
}

body:not(.__warhelper_hide_whore) .__warhelper_total.spd {
  color: #99CC66;
}

body:not(.__warhelper_hide_whore) .__warhelper_total.dex {
  color: #9966CC;
}

.__warhelper_bstype {
  position: absolute;
  top: 0;
  left: 0;
  color: #ddd;
  text-align: center;
  font-family: monospace;
  font-weight: bold;
  line-height: 14px;
  padding-top: 1px;
  padding-left: 1px;
  padding-right: 10px;
  padding-bottom: 10px;
  background-color: #999999;
  clip-path: polygon(0 0, 100% 0, 100% 0%, 0% 100%);
}

.__warhelper_bstype.T {
  background-color: #663399;
}

.__warhelper_bstype.B {
  background-color: #336699;
}

.__warhelper_bstype.Y {
  background-color: #669966;
}

.__warhelper_bstype.YE {
  background-color: #9c9c00;
}

.__warhelper_bstype.F {
  background-color: #a65e2e;
}

.__warhelper_compare {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 3px;
  background: linear-gradient(to right, var(--color) var(--fill), transparent var(--fill));
}

body.__warhelper_ff_bgcolor .__warhelper.bs:has(.__warhelper_compare.r) {
  color: #000;
  background-color: #D44A4A;
}
.__warhelper_compare.r {
  --color: #D44A4A;
}
body.__warhelper_ff_bgcolor .__warhelper.bs:has(.__warhelper_compare.y) {
  color: #000;
  background-color: #F1C232;
}
.__warhelper_compare.y {
  --color: #F1C232;
}
body.__warhelper_ff_bgcolor .__warhelper.bs:has(.__warhelper_compare.g) {
  color: #000;
  background-color: #5CB85C;
}
.__warhelper_compare.g {
  --color: #5CB85C;
}
body.__warhelper_colorblind.__warhelper_ff_bgcolor .__warhelper.bs:has(.__warhelper_compare.g) {
  color: #fff;
  background-color: #0072B2;
}
body.__warhelper_colorblind .__warhelper_compare.g {
  --color: #0072B2;
}
body.__warhelper_ff_bgcolor .__warhelper.bs:has(.__warhelper_compare.w) {
  color: #000;
  background-color: #F8F9FA;
}
.__warhelper_compare.w {
  --color: #F8F9FA;
}

div[class^="sortIcon__"]${OUTSIDE_TERRITORY} {
  display: none !important;
}

.__warhelper_sort {
  overflow: visible !important;
}

.__warhelper_sort.asc div[class^="sortIcon__"],
.__warhelper_sort.desc div[class^="sortIcon__"] {
  display: block !important;
  border: none !important;
}

.__warhelper_sort.asc div[class^="sortIcon__"]:after {
  border-top: none !important;
  border-bottom: 5px solid black !important;
}
.__warhelper_sort.desc div[class^="sortIcon__"]:after {
  top: 0px !important;
  border-top: 5px solid black !important;
  border-bottom: none !important;
}

.__warhelper_favorite {
  cursor: pointer;
}

.__warhelper_favorite_icon {
  position: relative;
  display: inline-block;
  line-height: 0;
  vertical-align: middle;
  isolation: isolate;
}

.__warhelper_favorite_icon::before {
  content: "";
  position: absolute;
  left: 50%;
  top: 50%;
  z-index: 0;
  width: 25px;
  height: 25px;
  pointer-events: none;
  opacity: 0;
  transform: translate(-50%, -50%) scale(0.82) rotate(-18deg);
  transition: opacity 120ms ease, transform 120ms ease;
  background: linear-gradient(135deg, #ffe27a 0%, #daa520 55%, #9b6b0d 100%);
  clip-path: polygon(50% 0%, 61% 34%, 98% 34%, 68% 55%, 79% 91%, 50% 70%, 21% 91%, 32% 55%, 2% 34%, 39% 34%);
  filter: drop-shadow(0 0 3px rgba(218, 165, 32, 0.8));
}

.__warhelper_favorite_icon > img {
  display: block;
  position: relative;
  z-index: 1;
}

.__warhelper_favorite.active .__warhelper_favorite_icon::before {
  opacity: 1;
  transform: translate(-50%, -50%) scale(1) rotate(-18deg);
}

.__warhelper_favorite.active .__warhelper_favorite_icon > img {
  filter: drop-shadow(0 0 2px rgba(0, 0, 0, 0.55));
}

@media (hover: hover) and (pointer: fine) {
  .__warhelper_favorite:hover .__warhelper_favorite_icon::before {
    opacity: 1;
    transform: translate(-50%, -50%) scale(1) rotate(-18deg);
  }

  .__warhelper_favorite:hover .__warhelper_favorite_icon > img {
    filter: drop-shadow(0 0 2px rgba(0, 0, 0, 0.55));
  }
}


/* Quick-attack button: dedicated icon next to the status icon on every member row. */
.__warhelper_attack_btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  margin-left: 4px;
  border-radius: 4px;
  background: rgba(60, 60, 60, 0.35);
  color: #f0f0f0;
  text-decoration: none !important;
  cursor: pointer;
  transition: background 0.15s ease, transform 0.1s ease;
  vertical-align: middle;
}

.__warhelper_attack_btn:hover {
  background: rgba(200, 40, 40, 0.85);
  color: #fff;
}

.__warhelper_attack_btn:active {
  transform: scale(0.94);
}

.__warhelper_attack_btn_icon {
  font-size: 14px;
  line-height: 1;
  pointer-events: none;
}

body.dark-mode .__warhelper_attack_btn {
  background: rgba(80, 80, 80, 0.55);
  color: #e8edf2;
}

body.dark-mode .__warhelper_attack_btn:hover {
  background: rgba(200, 40, 40, 0.9);
  color: #fff;
}

.__warhelper_bs_loading {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.__warhelper_bs_loading::before {
  content: "";
  width: 12px;
  height: 12px;
  box-sizing: border-box;
  border: 2px solid rgba(128, 128, 128, 0.3);
  border-top-color: #888;
  border-radius: 50%;
  animation: __warhelper_bs_spin 0.8s linear infinite;
}

@keyframes __warhelper_bs_spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .__warhelper_bs_loading::before {
    animation-duration: 2.4s;
  }
}

.
`);
        }
        static {
          this.sortFields = ["id", "member", "members", "bs", "points", "status"];
        }
        static overwriteSort(node) {
          if (!node.parentNode) {
            return;
          }
          const factionId = this.getFactionId(node.parentNode);
          const sorting = Cache.get(`faction_sorting_${factionId}`);
          const sortField = this.sortFields[~~sorting?.field || 1] || "bs";
          const headers = Array.from(node.parentNode.querySelectorAll(this.sortFields.map((v) => `.members-cont > div > .${v}, .f-war-list > ul > .${v}`).join(",")));
          headers.forEach((header) => {
            header.classList.add("__warhelper_sort");
            header.addEventListener("click", (event) => {
              event.stopImmediatePropagation();
              this.sort(header);
            });
            if (!header.classList.contains(sortField)) {
              return;
            }
            header.classList.add(sorting?.asc ? "asc" : "desc");
            this.sort(header, true);
          });
        }
        static sort(node = null, keepDirection = false) {
          if (node === null) {
            Array.from(document.querySelectorAll(".__warhelper_sort.asc, .__warhelper_sort.desc")).forEach((node2) => this.sort(node2, true));
            return;
          }
          if (node.parentNode == null) {
            return;
          }
          if (node.parentNode.parentNode == null) {
            return;
          }
          if (!keepDirection) {
            const asc = node.classList.contains("asc");
            node.parentNode.querySelectorAll(".asc, .desc").forEach((node2) => {
              node2.classList.remove("asc");
              node2.classList.remove("desc");
            });
            asc ? node.classList.add("desc") : node.classList.add("asc");
          }
          const factionId = this.getFactionId(node.parentNode.parentNode);
          const sortField = this.sortFields.findIndex((v) => node.classList.contains(v));
          const isAscending = node.classList.contains("asc") == true;
          if (!keepDirection) {
            Cache.set(`faction_sorting_${factionId}`, { field: sortField, asc: isAscending });
          }
          const list = node.parentNode.parentNode.querySelector("ul.members-list, ul.table-body");
          if (list == null) {
            return;
          }
          const items = Array.from(list.childNodes);
          if (items.length < 2) {
            return;
          }
          const context = this.createSortContext(sortField, isAscending);
          const entries = items.map((node2, index) => this.createSortEntry(node2, index, sortField, context));
          entries.sort((a, b) => this.compareSortEntries(a, b, sortField, isAscending));
          if (entries.every((entry, index) => entry.index === index)) {
            return;
          }
          const fragment = document.createDocumentFragment();
          entries.forEach((entry) => fragment.appendChild(entry.node));
          list.appendChild(fragment);
        }
        static createSortContext(sortField, isAscending) {
          if (sortField !== 5 || isOnWarResultPage()) {
            return null;
          }
          const userStatusCurrent = DataMonitor.getCurrentUserStatus();
          const isAbroad = isAwayFromTorn(userStatusCurrent);
          return {
            userStatusCurrent,
            isAscending,
            canPrioritizeCurrentArea: isAbroad && !(userStatusCurrent?.status == "Traveling" && userStatusCurrent.area == 1),
            currentAway: isAbroad ? 1 : 4,
            otherAway: isAbroad ? 5 : 4,
            okay: isAbroad ? isAscending ? 2 : 4 : isAscending ? 1 : 3,
            jailed: isAbroad ? 3 : 2,
            hospital: isAbroad ? isAscending ? 4 : 2 : isAscending ? 3 : 1
          };
        }
        static createSortEntry(node, index, sortField, context) {
          const userId = this.getUserId(node);
          return {
            node,
            index,
            userId,
            isTotal: node.querySelector("[class*='total__']") !== null,
            isFavorite: node.querySelector(".__warhelper_favorite.active") !== null,
            userName: this.getUserName(node),
            numeric: this.getSortNumeric(node, sortField),
            status: context === null ? null : getStatusSortKey(userId, DataMonitor.getUserStatus(userId), context)
          };
        }
        static getSortNumeric(node, sortField) {
          switch (sortField) {
            case 0:
              return parseFloat(node.querySelector(".id")?.innerHTML.replaceAll("#", "") || "");
            case 3:
              return parseFloat(node.querySelector(".bs")?.dataset["bs"] || "");
            case 4:
              return parseFloat(node.querySelector(".points")?.innerHTML.replaceAll(",", "") || "");
            case 5:
              return isOnWarResultPage() ? parseFloat(node.querySelector(".status")?.innerHTML.replaceAll(",", "") || "") : 0;
            default:
              return 0;
          }
        }
        static compareSortEntries(a, b, sortField, isAscending) {
          if (a.isTotal) return 1;
          if (b.isTotal) return -1;
          if (a.isFavorite && !b.isFavorite) {
            return -1;
          } else if (!a.isFavorite && b.isFavorite) {
            return 1;
          }
          switch (sortField) {
            case 0:
            // id
            case 3:
            // battlestat
            case 4:
              return compareSortNumeric(a, b, isAscending);
            case 1:
            case 2:
              return compareSortUserName(a, b, isAscending);
            case 5: {
              if (a.status === null || b.status === null) {
                return compareSortNumeric(a, b, isAscending);
              }
              return compareStatusSortKey(a, b, isAscending);
            }
          }
          return 0;
        }
        static scheduleSort() {
          if (this.sortFrame !== null) {
            return;
          }
          this.sortFrame = requestAnimationFrame(() => {
            this.sortFrame = null;
            this.sort();
          });
        }
        static scheduleStatusSort() {
          if (!document.querySelector(".__warhelper_sort.status.asc, .__warhelper_sort.status.desc")) {
            return;
          }
          this.scheduleSort();
        }
        static handleNode(node) {
          if (!node?.classList || node.classList.contains("__warhelper")) {
            return;
          }
          node.classList.add("__warhelper");
          const isWall = !node.matches(".f-war-list");
          if (isWall) return;
          isWall ? this.injectRankedWarHtml(node) : this.injectMemberListHtml(node);
          this.overwriteSort(node);
          const pendingLevelCells = /* @__PURE__ */ new Set();
          let injectionFrame = null;
          const queueLevelCells = (root) => {
            const levelCells = [
              ...root.matches(".level:not(.__warhelper), .lvl:not(.__warhelper)") ? [root] : [],
              ...Array.from(root.querySelectorAll(".level:not(.__warhelper), .lvl:not(.__warhelper)"))
            ];
            levelCells.forEach((levelCell) => {
              if (!this.hasStatsCell(levelCell)) {
                pendingLevelCells.add(levelCell);
              }
            });
            if (!pendingLevelCells.size || injectionFrame !== null) {
              return;
            }
            injectionFrame = requestAnimationFrame(() => {
              injectionFrame = null;
              const cells = Array.from(pendingLevelCells).filter((levelCell) => {
                return levelCell.isConnected && !levelCell.classList.contains("__warhelper") && !this.hasStatsCell(levelCell);
              });
              pendingLevelCells.clear();
              this.injectCells(cells);
            });
          };
          new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
              mutation.addedNodes.forEach((addedNode) => {
                if (addedNode instanceof HTMLElement) {
                  queueLevelCells(addedNode);
                }
              });
            });
          }).observe(node, { subtree: true, childList: true });
        }
        // True if this row already has our stats cell.
        static hasStatsCell(levelCell) {
          return levelCell.parentElement?.querySelector(":scope > .__warhelper.bs") != null;
        }
        static getId(node, selector, regexp) {
          const idNode = node.querySelector(selector) || node.parentNode?.querySelector(selector);
          if (!idNode || !(idNode instanceof HTMLAnchorElement)) {
            return 0;
          }
          const match = idNode.href.match(regexp);
          return match?.[1] ? parseInt(match[1]) : 0;
        }
        static getUserId(node) {
          return this.getId(node, 'a[href*="XID"]', /.*?XID=(\d+)/i);
        }
        static getUserName(node) {
          const profileLink = node.querySelector('a[href*="profiles.php?XID="], a[href*="XID="]');
          if (profileLink instanceof HTMLElement) {
            const honorName = profileLink.querySelector(".honor-text:not(.honor-text-svg)");
            const honorText = honorName instanceof HTMLElement ? honorName.innerText : honorName?.textContent;
            if (honorText?.trim()) {
              return honorText.trim();
            }
            const linkText = profileLink.innerText || profileLink.textContent || "";
            if (linkText.trim()) {
              return linkText.trim();
            }
          }
          const fallback = node.querySelector(".honor-text:not(.honor-text-svg)");
          const fallbackText = fallback instanceof HTMLElement ? fallback.innerText : fallback?.textContent;
          return fallbackText?.trim() || "";
        }
        static getFactionId(node) {
          return this.getId(node, 'a[href*="factions.php"]', /.*?ID=(\d+)/i);
        }
        static injectHeader(levelHeader) {
          if (levelHeader.firstChild) {
            levelHeader.firstChild.textContent = "Lv";
          }
          const statsHeader = levelHeader.cloneNode(true);
          statsHeader.classList.add("__warhelper");
          statsHeader.classList.add("bs");
          if (statsHeader.firstChild) {
            statsHeader.firstChild.textContent = "BS";
          }
          if (!levelHeader.parentNode) {
            return;
          }
          levelHeader.parentNode.insertBefore(statsHeader, levelHeader.nextSibling);
        }
        static openAttackPage(userId) {
          const tab = window.open(`page.php?sid=attack&user2ID=${userId}`, isPDA() ? `_warhelper_${Date.now()}` : "_warhelper");
          tab?.focus();
        }
        static bindStatsCellAttack(statsCell, userId) {
          let touchStart = null;
          let lastTouchOpenAt = 0;
          let lastContextMenuAt = 0;
          statsCell.addEventListener("touchstart", (event) => {
            if (event.touches.length !== 1) {
              touchStart = null;
              return;
            }
            const touch = event.touches[0];
            if (!touch) {
              touchStart = null;
              return;
            }
            touchStart = { x: touch.clientX, y: touch.clientY, at: Date.now() };
          }, { passive: true });
          statsCell.addEventListener("touchcancel", () => {
            touchStart = null;
          });
          statsCell.addEventListener("contextmenu", () => {
            lastContextMenuAt = Date.now();
            touchStart = null;
          });
          statsCell.addEventListener("touchend", (event) => {
            const touch = event.changedTouches[0];
            if (!touchStart || !touch) {
              touchStart = null;
              return;
            }
            const moved = Math.hypot(touch.clientX - touchStart.x, touch.clientY - touchStart.y);
            const heldFor = Date.now() - touchStart.at;
            touchStart = null;
            if (moved > 12 || heldFor > 500 || Date.now() - lastContextMenuAt < 1e3) {
              return;
            }
            event.preventDefault();
            event.stopPropagation();
            lastTouchOpenAt = Date.now();
            this.openAttackPage(userId);
          }, { passive: false });
          statsCell.addEventListener("click", () => {
            if (Date.now() - lastTouchOpenAt < 700 || Date.now() - lastContextMenuAt < 1e3) {
              return;
            }
            this.openAttackPage(userId);
          });
        }
        static injectCells(levelCells) {
          if (!levelCells?.length) {
            return;
          }
          levelCells.forEach((levelCell) => {
            const rowNode = levelCell.parentElement;
            if (!rowNode || this.hasStatsCell(levelCell)) {
              return;
            }
            const statsCell = levelCell.cloneNode(true);
            statsCell.classList.add("__warhelper");
            statsCell.classList.add("bs");
            if (statsCell.innerHTML.indexOf("--") !== -1) {
              statsCell.innerHTML = `--`;
            } else {
              statsCell.innerHTML = `<div class="__warhelper_bs_loading"></div>`;
              statsCell.dataset["bs"] = "0";
            }
            rowNode.insertBefore(statsCell, levelCell.nextSibling);
            const userId = this.getUserId(levelCell);
            if (!userId) return;
            const factionId = this.getFactionId(levelCell);
            this.battleStatNodes.push({ userId, factionId, node: statsCell });
            Fly.trackUser(userId, factionId);
            this.bindStatsCellAttack(statsCell, userId);
            const statusNode = rowNode.querySelector('div[class^="userStatusWrap__"]');
            if (!statusNode?.parentNode) {
              return;
            }
            const active = Cache.get(`faction_favorite_${userId}`) || false;
            const favoriteNode = statusNode;
            favoriteNode.classList.add("__warhelper_favorite");
            const favoriteImage = Array.from(favoriteNode.children).find((child) => child instanceof HTMLImageElement);
            if (favoriteImage && !favoriteImage.parentElement?.classList.contains("__warhelper_favorite_icon")) {
              const favoriteIcon = document.createElement("span");
              favoriteIcon.className = "__warhelper_favorite_icon";
              favoriteImage.parentElement?.insertBefore(favoriteIcon, favoriteImage);
              favoriteIcon.appendChild(favoriteImage);
            }
            if (active) {
              favoriteNode.classList.add("active");
            }
            favoriteNode.addEventListener("click", () => {
              const active2 = favoriteNode.classList.toggle("active");
              Cache.set(`faction_favorite_${userId}`, active2);
              this.scheduleSort();
            });
            // Dedicated quick-attack button next to the status icon.
            if (!rowNode.querySelector(".__warhelper_attack_btn")) {
              const attackButton = document.createElement("a");
              attackButton.className = "__warhelper_attack_btn";
              attackButton.href = `page.php?sid=attack&user2ID=${userId}`;
              attackButton.title = `Attack #${userId}`;
              attackButton.setAttribute("aria-label", `Attack player ${userId}`);
              attackButton.target = "_warhelper";
              attackButton.innerHTML = '<span class="__warhelper_attack_btn_icon" aria-hidden="true">\u2694\uFE0E</span>';
              statusNode.parentNode.appendChild(attackButton);
              this.bindAttackButton(attackButton, userId);
            }
          });
          this.updateBattleStats();
        }
        static bindAttackButton(button, userId) {
          let touchStart = null;
          let lastTouchOpenAt = 0;
          let lastContextMenuAt = 0;
          button.addEventListener("touchstart", (event) => {
            if (event.touches.length !== 1) {
              touchStart = null;
              return;
            }
            const touch = event.touches[0];
            if (!touch) {
              touchStart = null;
              return;
            }
            touchStart = { x: touch.clientX, y: touch.clientY, at: Date.now() };
          }, { passive: true });
          button.addEventListener("touchcancel", () => {
            touchStart = null;
          });
          button.addEventListener("contextmenu", () => {
            lastContextMenuAt = Date.now();
            touchStart = null;
          });
          button.addEventListener("touchend", (event) => {
            const touch = event.changedTouches[0];
            if (!touchStart || !touch) {
              touchStart = null;
              return;
            }
            const moved = Math.hypot(touch.clientX - touchStart.x, touch.clientY - touchStart.y);
            const heldFor = Date.now() - touchStart.at;
            touchStart = null;
            if (moved > 12 || heldFor > 500 || Date.now() - lastContextMenuAt < 1e3) {
              return;
            }
            event.preventDefault();
            event.stopPropagation();
            lastTouchOpenAt = Date.now();
            this.openAttackPage(userId);
          }, { passive: false });
          button.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();
            if (Date.now() - lastTouchOpenAt < 700 || Date.now() - lastContextMenuAt < 1e3) {
              return;
            }
            this.openAttackPage(userId);
          });
        }
        static injectMemberListHtml(node) {
          const levelHeader = node.querySelector(".table-header .lvl");
          if (!levelHeader) {
            return;
          }
          this.injectHeader(levelHeader);
          const levelCells = Array.from(node.querySelectorAll(".table-body .lvl"));
          if (!levelCells) {
            return;
          }
          this.injectCells(levelCells);
        }
        static injectRankedWarHtml(node) {
          if (!node.parentNode) {
            return;
          }
          const levelHeader = node.parentNode.querySelector(".level");
          if (!levelHeader) {
            return;
          }
          this.injectHeader(levelHeader);
          const levelCells = Array.from(node.querySelectorAll(".level"));
          if (!levelCells) {
            return;
          }
          this.injectCells(levelCells);
          const statusCells = Array.from(node.querySelectorAll(".status"));
          if (!statusCells) {
            return;
          }
          statusCells.forEach((statusCell) => {
            if (statusCell.dataset["warhelperTimerBound"] === "true") {
              return;
            }
            let userId = this.getUserId(statusCell);
            const factionId = this.getFactionId(statusCell);
            statusCell.dataset["warhelperTimerBound"] = "true";
            this.timerNodes.push({ userId, node: statusCell });
            Fly.bindStatusNode(userId, statusCell, factionId);
          });
        }
        static reloadBattleStats() {
          this.battleStatNodes.forEach((battleStatNode) => {
            battleStatNode.node.innerHTML = `<div class="__warhelper_bs_loading"></div>`;
            this.setBattleStatTooltip(battleStatNode.node, "");
            battleStatNode.node.dataset["bs"] = "0";
          });
          this.updateBattleStats();
        }
        static scheduleBattleStatsReload() {
          if (this.battleStatsReloadTimer !== null) {
            window.clearTimeout(this.battleStatsReloadTimer);
          }
          this.battleStatsReloadTimer = window.setTimeout(() => {
            this.battleStatsReloadTimer = null;
            this.reloadBattleStats();
          }, 0);
        }
        static async updateBattleStats() {
          const updateRun = ++this.battleStatsUpdateRun;
          const userStats = await User.getUserStats().catch(console.error);
          if (updateRun !== this.battleStatsUpdateRun) {
            return;
          }
          this.battleStatNodes = this.battleStatNodes.filter((n) => n.node.isConnected);
          const factions = this.battleStatNodes.reduce((obj, battleStatNode) => {
            const factionId = battleStatNode.factionId;
            if (obj[factionId] == void 0) {
              obj[factionId] = [];
            }
            obj[factionId].push(battleStatNode);
            return obj;
          }, {});
          for (const factionId in factions) {
            const factionNodes = factions[factionId];
            if (!factionNodes) {
              continue;
            }
            const numericFactionId = Number(factionId);
            if (!Number.isFinite(numericFactionId) || numericFactionId <= 0) {
              this.applyBattleStatUpdates(this.createMissingBattleStatUpdates(factionNodes));
              this.scheduleSort();
              continue;
            }
            const spies = await this.withTimeout(
              getSpies(factionNodes.map((battleStatNode) => battleStatNode.userId), numericFactionId).catch(console.error),
              BATTLE_STATS_SPY_TIMEOUT_MS,
              `Spy lookup timed out for faction ${numericFactionId}`
            );
            if (updateRun !== this.battleStatsUpdateRun) {
              return;
            }
            if (!spies) {
              this.applyBattleStatUpdates(this.createMissingBattleStatUpdates(factionNodes));
              this.scheduleSort();
              continue;
            }
            const updates = [];
            for (const battleStatNode of factionNodes) {
              let getStatsBarColor2 = function(value) {
                if (value >= 5) return "r";
                if (value >= 4) return "y";
                if (value >= 3) return "g";
                return "w";
              }, getStatsBarPercent2 = function(value) {
                const min = 1;
                const mid = 3;
                const max = 5;
                const minPercent = 5;
                const midPercent = 50;
                const maxPercent = 100;
                if (value <= min) return minPercent;
                if (value >= max) return maxPercent;
                if (value <= mid) {
                  const ratio = (value - min) / (mid - min);
                  return minPercent + ratio * (midPercent - minPercent);
                } else {
                  const ratio = (value - mid) / (max - mid);
                  return midPercent + ratio * (maxPercent - midPercent);
                }
              };
              var getStatsBarColor = getStatsBarColor2, getStatsBarPercent = getStatsBarPercent2;
              const { userId, node } = battleStatNode;
              const spy = spies[userId];
              if (!spy || spy.type == 0 /* None */) {
                updates.push({
                  node,
                  html: "N/A",
                  tooltip: "",
                  bs: "0"
                });
                continue;
              }
              let ff = 0;
              let ffUncapped = spy.fairfight || 0;
              if (spy.score && userStats?.score) {
                ffUncapped = Math.round((1 + 8 / 3 * (spy.score / userStats?.score)) * 100) / 100;
              }
              ff = Math.min(3, ffUncapped);
              let statsBarColor = getStatsBarColor2(ffUncapped);
              let statsBarPercent = getStatsBarPercent2(ffUncapped);
              const showBreakdown = hasStatBreakdown(spy, getCachedSpySources(userId));
              const breakdownHidden = (spy.type === 1 /* TS */ || spy.type === 3 /* YATA */ || spy.type === 5 /* FFS */) && !showBreakdown;
              let whore = "";
              const whoreThreshold = 0.35;
              const stats = breakdownHidden ? [0, 0, 0, 0] : [spy.strength || 0, spy.defense || 0, spy.speed || 0, spy.dexterity || 0];
              const idx = stats.indexOf(Math.max(...stats.filter((v) => v)));
              if (stats[idx] !== void 0 && stats[idx] >= (spy.total || 0) * whoreThreshold) {
                whore = ["str", "def", "spd", "dex"][idx];
              }
              let spyType = "?";
              let spyClass = "";
              let spyTypeLong = "?";
              switch (spy.type) {
                case 1 /* TS */:
                  spyType = "T";
                  spyClass = "T";
                  spyTypeLong = "TornStats";
                  break;
                case 2 /* BSP */:
                  spyType = "B";
                  spyClass = "B";
                  spyTypeLong = "BSP";
                  break;
                case 3 /* YATA */:
                  spyType = "Y";
                  spyClass = "Y";
                  spyTypeLong = "YATA";
                  break;
                case 4 /* YATAEstimate */:
                  spyType = "Y";
                  spyClass = "YE";
                  spyTypeLong = "YATA Estimate";
                  break;
                case 5 /* FFS */:
                  spyType = "F";
                  spyClass = "F";
                  spyTypeLong = "FFScouter";
                  break;
              }
              const html = `
          <div class="__warhelper_total ${whore}">${spy.total ? abbreviateNumber(spy.total) : "N/A"}</div>
          <div class="__warhelper_bstype ${spyClass}">${spyType}</div>
          ${ff > 0 ? `<div class="__warhelper_compare ${statsBarColor}" style="--fill: ${statsBarPercent}%;"></div>` : ""}
        `;
              const tooltipRows = [];
              if (ff > 0) {
                tooltipRows.push(`<tr><td>FF</td><td>${ff.toFixed(2)}</td></tr>`);
              }
              if (showBreakdown) {
                const breakdownSource = getBreakdownSource(spy);
                if (spy.breakdownTimestamp || breakdownSource !== spyTypeLong) {
                  const breakdownAge = spy.breakdownTimestamp ? `, ${formatTimeDifference(spy.breakdownTimestamp)}` : "";
                  tooltipRows.push(`<tr><td>Breakdown</td><td>${escapeHtml(breakdownSource + breakdownAge)}</td></tr>`);
                }
                tooltipRows.push(
                  `<tr><td>Strength</td><td>${spy.strength ? abbreviateNumber(spy.strength, 2) : "N/A"}</td></tr>`,
                  `<tr><td>Defense</td><td>${spy.defense ? abbreviateNumber(spy.defense, 2) : "N/A"}</td></tr>`,
                  `<tr><td>Speed</td><td>${spy.speed ? abbreviateNumber(spy.speed, 2) : "N/A"}</td></tr>`,
                  `<tr><td>Dexterity</td><td>${spy.dexterity ? abbreviateNumber(spy.dexterity, 2) : "N/A"}</td></tr>`
                );
                const statsTotal = abbreviateNumber(getBreakdownTotal(spy), 2);
                if (!spy.total || statsTotal !== abbreviateNumber(spy.total, 2)) {
                  tooltipRows.push(`<tr><td>Stats total</td><td>${statsTotal}</td></tr>`);
                }
              }
              if (spy.distribution) {
                tooltipRows.push(`<tr><td>Build</td><td>${escapeHtml(spy.distribution)}</td></tr>`);
              }
              tooltipRows.push(
                `<tr><td>Total</td><td>${spy.total ? abbreviateNumber(spy.total, 2) : "N/A"}${spy.premium ? "*" : ""}</td></tr>`
              );
              if (spy.altTotal) {
                tooltipRows.push(`<tr><td>${spy.premium ? "Free" : "Premium"}</td><td>${abbreviateNumber(spy.altTotal, 2)}${spy.premium ? "" : "*"}</td></tr>`);
              }
              tooltipRows.push(
                `<tr><td>Source</td><td>${spyTypeLong}</td></tr>`,
                `<tr><td colspan="2">${formatTimeDifference(spy.timestamp)}</td></tr>`
              );
              if (spy.premium || spy.altTotal) {
                tooltipRows.push(`<tr><td colspan="2">* FFScouter premium estimate</td></tr>`);
              }
              const tooltip = `<table class="__warhelper_tooltip">${tooltipRows.join("")}</table>`;
              updates.push({
                node,
                html,
                tooltip,
                bs: spy.total?.toString() ?? "0"
              });
            }
            this.applyBattleStatUpdates(updates);
            this.scheduleSort();
          }
          this.scheduleSort();
        }
        static applyBattleStatUpdates(updates) {
          for (const update2 of updates) {
            update2.node.innerHTML = update2.html;
            this.setBattleStatTooltip(update2.node, update2.tooltip.trim());
            update2.node.dataset["bs"] = update2.bs;
          }
        }
        static setBattleStatTooltip(node, tooltip) {
          node.removeAttribute("title");
          node.removeAttribute("data-original-title");
          if (!tooltip) {
            delete node.dataset["warhelperBattleStatTooltip"];
            node.removeAttribute("aria-label");
            Tooltip.hide(node);
            return;
          }
          node.dataset["warhelperBattleStatTooltip"] = tooltip;
          node.setAttribute("aria-label", this.stripHtml(tooltip));
          let binding = this.battleStatTooltipBindings.get(node);
          const options = {
            content: () => node.dataset["warhelperBattleStatTooltip"] || "",
            html: true,
            placement: "element",
            className: "__warhelper_battle_stat_tooltip"
          };
          if (!binding) {
            binding = Tooltip.bind(node, options);
            this.battleStatTooltipBindings.set(node, binding);
            return;
          }
          binding.update(options);
        }
        static stripHtml(value) {
          return value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
        }
        static createMissingBattleStatUpdates(nodes) {
          return nodes.map(({ node }) => ({
            node,
            html: "N/A",
            tooltip: "",
            bs: "0"
          }));
        }
        static withTimeout(promise, timeoutMs, message) {
          let timeoutId = null;
          const timeout = new Promise((resolve) => {
            timeoutId = window.setTimeout(() => {
              console.warn(message);
              resolve(void 0);
            }, timeoutMs);
          });
          return Promise.race([promise, timeout]).finally(() => {
            if (timeoutId !== null) {
              window.clearTimeout(timeoutId);
            }
          });
        }
        static {
          this.rankedTimer = null;
        }
        static {
          this.rankedTarget = null;
        }
        static updateRankedTimeLeft() {
          this.rankedTimer = this.rankedTimer || document.querySelector("[class*='rankBox__'] [class*='timer__']");
          if (!this.rankedTimer?.innerText) {
            return;
          }
          this.rankedTarget = this.rankedTarget || document.querySelector("[class*='rankBox__'] [class*='target__']");
          if (!this.rankedTarget?.innerText) {
            return;
          }
          const targetParts = this.rankedTarget?.innerText?.split(/\s/g).reverse();
          if (!targetParts[0] || !targetParts[2]) {
            return;
          }
          const currentTarget = parseInt(targetParts[0]?.replace(/[^\d]+/g, ""));
          const currentLead = parseInt(targetParts[2]?.replace(/[^\d]+/g, ""));
          let seconds = 0;
          const timeParts = this.rankedTimer.innerText.split(":").reverse();
          const modifier = [1, 60, 60 * 60, 60 * 60 * 24];
          for (let i = 0; i < modifier.length; i++) {
            if (!timeParts[i]) {
              break;
            }
            seconds += parseInt(timeParts[i] || "0") * (modifier[i] || 0);
          }
          const hoursTotal = seconds / (60 * 60);
          const hoursLeft = 123 - Math.floor(hoursTotal);
          const tick2 = currentTarget / hoursLeft;
          const ticksLeft = Math.ceil((currentTarget - currentLead) / tick2);
          const timeLeft = (ticksLeft - 1) * 3600 + (3600 - seconds % 3600);
          const endDate = new Date(Date.now() + timeLeft * 1e3);
          endDate.setHours(endDate.getHours(), 0, 0, 0);
          window["endDate"] = endDate;
        }
        static getStatusDisplay(userId, userStatus) {
          const area = AREAS[userStatus.area];
          const destination = area?.abbr || userStatus.status;
          if (this.isLandedTravelStatus(userId, userStatus)) {
            const display = {
              key: `landed:${destination}:${area?.flagUrl || ""}`,
              text: destination
            };
            if (area?.flagUrl) {
              display.flagUrl = area.flagUrl;
            }
            return display;
          }
          if (userStatus.status == "Traveling") {
            const flightCountdown = Fly.getFlightCountdown(userId);
            const flightText = flightCountdown ? formatTimestamp(getServerTimestampSeconds() + flightCountdown.seconds) : void 0;
            const detailClass = flightCountdown?.phase == "possible" ? "__warhelper_status_detail_flight_possible" : void 0;
            const display = {
              key: `traveling:${destination}:${flightText || ""}:${detailClass || ""}:${area?.flagUrl || ""}`,
              text: destination,
              icon: TRAVELING_SIGN
            };
            if (flightText) {
              display.detailText = flightText;
              if (detailClass) {
                display.detailClass = detailClass;
              }
            }
            if (area?.flagUrl) {
              display.flagUrl = area.flagUrl;
            }
            return display;
          }
          if (userStatus.status == "Abroad") {
            const display = {
              key: `abroad:${destination}:${area?.flagUrl || ""}`,
              text: destination
            };
            if (area?.flagUrl) {
              display.flagUrl = area.flagUrl;
            }
            return display;
          }
          const hasTimedStatus = userStatus.status == "Hospital" || userStatus.status == "Jail";
          const text2 = formatTimestamp(hasTimedStatus ? userStatus.updateAt : 0);
          if (userStatus.status == "Hospital" && userStatus.area != 1) {
            const display = {
              key: `hospital-abroad:${destination}:${text2}:${area?.flagUrl || ""}`,
              text: destination,
              detailText: text2,
              detailClass: "__warhelper_status_detail_hospital"
            };
            if (area?.flagUrl) {
              display.flagUrl = area.flagUrl;
            }
            return display;
          }
          return {
            key: `status:${userStatus.status}:${text2}`,
            text: hasTimedStatus ? text2 : userStatus.status
          };
        }
        static isLandedTravelStatus(userId, userStatus) {
          return userStatus.status == "Traveling" && userStatus.area != 1 && Fly.hasExpiredFlightArrival(userId);
        }
        static isStatusRendered(node, display) {
          if (node.dataset["warhelperStatus"] != display.key) {
            return false;
          }
          const text2 = node.querySelector(".__warhelper_status_text");
          const detail = node.querySelector(".__warhelper_status_detail");
          const icon = node.querySelector(".__warhelper_status_icon");
          const flag = node.querySelector(".__warhelper_status_flag");
          return text2 instanceof HTMLElement && text2.textContent == display.text && (detail instanceof HTMLElement ? detail.textContent : void 0) == display.detailText && (display.detailClass ? detail instanceof HTMLElement && detail.classList.contains(display.detailClass) : true) && Boolean(icon) == Boolean(display.icon) && Boolean(flag) == Boolean(display.flagUrl);
        }
        static syncStatusLayout(node, display) {
          const allowMultiline = Boolean(display.icon || display.flagUrl);
          node.classList.toggle("__warhelper_status_multiline", allowMultiline);
          node.closest("li")?.classList.toggle("__warhelper_status_multiline_row", allowMultiline);
        }
        static renderStatus(node, display) {
          this.syncStatusLayout(node, display);
          if (this.isStatusRendered(node, display)) {
            return;
          }
          node.dataset["warhelperStatus"] = display.key;
          node.replaceChildren();
          const main = document.createElement("span");
          main.className = "__warhelper_status_main";
          node.appendChild(main);
          if (display.icon) {
            const icon = document.createElement("span");
            icon.className = "__warhelper_status_icon";
            icon.textContent = display.icon;
            main.appendChild(icon);
          }
          if (display.flagUrl) {
            const flag = document.createElement("span");
            flag.className = "__warhelper_status_flag";
            flag.style.backgroundImage = `url("${display.flagUrl}")`;
            main.appendChild(flag);
          }
          const text2 = document.createElement("span");
          text2.className = "__warhelper_status_text";
          text2.textContent = display.text;
          main.appendChild(text2);
          if (display.detailText) {
            const detail = document.createElement("span");
            detail.className = "__warhelper_status_detail";
            if (display.detailClass) {
              detail.classList.add(display.detailClass);
            }
            detail.textContent = display.detailText;
            node.appendChild(detail);
          }
        }
        static updateTimers() {
          this.updateRankedTimeLeft();
          this.timerNodes = this.timerNodes.filter((timerNode) => timerNode.node.isConnected);
          this.timerNodes.forEach((timerNode) => {
            const userId = timerNode.userId;
            const node = timerNode.node;
            const userStatus = DataMonitor.getUserStatus(userId);
            if (!userStatus) {
              return;
            }
            const display = this.getStatusDisplay(userId, userStatus);
            this.renderStatus(node, display);
            const isLandedTravel = this.isLandedTravelStatus(userId, userStatus);
            const isOkay = display.text == "Okay" && !display.icon && !display.flagUrl;
            const isHospital = userStatus.status == "Hospital" && userStatus.area == 1 && !isOkay;
            const isJail = userStatus.status == "Jail" && !isOkay;
            const isAbroad = userStatus.area != 1;
            const isTraveling = userStatus.status == "Traveling" && !isLandedTravel;
            node.classList.toggle("hospital", isHospital);
            node.classList.toggle("not-ok", isHospital);
            node.classList.toggle("jail", isJail);
            node.classList.toggle("okay", isOkay);
            node.classList.toggle("ok", isOkay);
            node.classList.toggle("abroad", isAbroad);
            node.classList.toggle("traveling", isTraveling);
          });
          const nextTickDelay = 1e3 - getServerTimeMs() % 1e3 + 25;
          window.setTimeout(() => this.updateTimers(), nextTickDelay);
        }
      };
    }
  });

  // src/TornAPI.ts
  function tornAPI(request) {
    return TornAPI.request(request);
  }
  var TORN_KEY_PATTERN, API_COMMENT, KEY_BLOCK_CACHE_KEY, SELECTION_BLOCK_CACHE_PREFIX, HOUR_SECONDS, KEY_CHANGE_CODES, PAUSE_CODES, DAILY_LIMIT_CODE, ACCESS_LEVEL_CODE, TornApiError, TornAPI;
  var init_TornAPI = __esm({
    "src/TornAPI.ts"() {
      "use strict";
      init_Cache();
      init_Config();
      init_Http();
      init_Platform();
      TORN_KEY_PATTERN = /^[A-Za-z0-9]{16}$/;
      API_COMMENT = "warhelper";
      KEY_BLOCK_CACHE_KEY = "torn_api_block";
      SELECTION_BLOCK_CACHE_PREFIX = "torn_api_block_";
      HOUR_SECONDS = 60 * 60;
      KEY_CHANGE_CODES = [1, 2, 16];
      PAUSE_CODES = [9, 10, 13, 18];
      DAILY_LIMIT_CODE = 14;
      ACCESS_LEVEL_CODE = 16;
      TornApiError = class extends Error {
        constructor(message, code = null) {
          super(message);
          this.code = code;
          this.name = "TornApiError";
        }
      };
      TornAPI = class {
        static {
          Config.onChange("torn_key", () => this.refreshKeyStatus());
          Cache.ready.then(() => this.refreshKeyStatus());
          Cache.onBust(() => this.refreshKeyStatus());
        }
        static getKey() {
          return String(Config.get("torn_key") || "").trim();
        }
        static isKeyShaped(key) {
          return TORN_KEY_PATTERN.test(key);
        }
        static request({ section, endpoint, id, parameters }) {
          return new Promise(async (resolve, reject) => {
            await Cache.ready;
            const key = this.getKey();
            if (!key) {
              return reject(new TornApiError("No API key"));
            }
            if (!this.isKeyShaped(key)) {
              this.refreshKeyStatus();
              return reject(new TornApiError("API key should be 16 letters and digits"));
            }
            const selection = this.getSelection(section, endpoint);
            const block = this.getBlock(key, selection);
            if (block) {
              this.refreshKeyStatus(selection);
              return reject(new TornApiError(`API Error: ${block.message}`, block.code));
            }
            let url = `https://api.torn.com/v2/${section}`;
            if (id) {
              url += `/${(Array.isArray(id) ? id : [id]).join(",")}`;
            }
            if (endpoint) {
              url += `/${endpoint}`;
            }
            const query = { ...parameters || {}, comment: API_COMMENT, key };
            url += `?${Object.keys(query).map((name) => {
              const value = (Array.isArray(query[name]) ? query[name] : [query[name]]).join(",");
              return `${name}=${value}`;
            }).join("&")}`;
            Http.request(url).then((response) => {
              const json = jsonParse(response);
              if (!json) {
                return reject(new TornApiError("Failed to parse response"));
              }
              if (json.error) {
                const code = Number(json.error.code);
                const message = String(json.error.error || "Unknown error");
                this.recordError(key, selection, Number.isFinite(code) ? code : null, message);
                return reject(new TornApiError(`API Error: ${message}`, Number.isFinite(code) ? code : null));
              }
              resolve(json);
            }).catch((error) => {
              reject(error);
            });
          });
        }
        static getSelection(section, endpoint) {
          return endpoint ? `${section}/${endpoint}` : section;
        }
        // Remembers a fatal error so no tab calls the API with this key (or selection) again for a while.
        static recordError(key, selection, code, message) {
          if (code === null) {
            return;
          }
          const now2 = Math.floor(Date.now() / 1e3);
          let seconds = 0;
          if (KEY_CHANGE_CODES.includes(code)) {
            seconds = 30 * 24 * HOUR_SECONDS;
          } else if (PAUSE_CODES.includes(code)) {
            seconds = HOUR_SECONDS;
          } else if (code === DAILY_LIMIT_CODE) {
            seconds = Math.ceil((now2 + 1) / 86400) * 86400 - now2;
          }
          if (seconds <= 0) {
            return;
          }
          const block = { keyHash: this.hashKey(key), code, message, until: now2 + seconds };
          Cache.set(code === ACCESS_LEVEL_CODE ? SELECTION_BLOCK_CACHE_PREFIX + selection : KEY_BLOCK_CACHE_KEY, block, seconds);
          this.refreshKeyStatus(code === ACCESS_LEVEL_CODE ? selection : void 0);
        }
        static getBlock(key, selection) {
          const keyHash = this.hashKey(key);
          const now2 = Math.floor(Date.now() / 1e3);
          const valid = (block) => !!block && block.keyHash === keyHash && block.until > now2;
          const keyBlock = Cache.get(KEY_BLOCK_CACHE_KEY);
          if (valid(keyBlock)) {
            return keyBlock;
          }
          if (selection) {
            const selectionBlock = Cache.get(SELECTION_BLOCK_CACHE_PREFIX + selection);
            if (valid(selectionBlock)) {
              return selectionBlock;
            }
          }
          return null;
        }
        // Shows why the Torn key isn't used under its field in the Keys tab.
        static refreshKeyStatus(selection) {
          const key = this.getKey();
          if (!key) {
            Config.setKeyStatus("torn_key", "");
            return;
          }
          if (!this.isKeyShaped(key)) {
            Config.setKeyStatus("torn_key", "A Torn API key is 16 letters and digits.", "error");
            return;
          }
          const block = this.getBlock(key, selection);
          if (!block) {
            Config.setKeyStatus("torn_key", "");
            return;
          }
          const where = selection && block.code === ACCESS_LEVEL_CODE ? ` for ${selection}` : "";
          const retry = KEY_CHANGE_CODES.includes(block.code) ? "Not used again until the key changes." : `Not used again until ${new Date(block.until * 1e3).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}, CLEAR CACHE, or a key change.`;
          Config.setKeyStatus("torn_key", `Torn API: ${block.message}${where} (error ${block.code}). ${retry}`, "error");
        }
        // So the block can be matched to the key without storing the key in the cache.
        static hashKey(key) {
          let hash = 2166136261;
          for (let i = 0; i < key.length; i++) {
            hash ^= key.charCodeAt(i);
            hash = Math.imul(hash, 16777619) >>> 0;
          }
          return hash.toString(16);
        }
      };
    }
  });


  // src/User.ts
  var User;
  var init_User = __esm({
    "src/User.ts"() {
      "use strict";
      init_Cache();
      init_Config();
      init_TornAPI();
      User = class {
        static {
          this.pendingRequest = null;
        }
        static {
          Config.onChange("torn_key", () => {
            this.pendingRequest = null;
          });
          Cache.onBust(() => {
            const userId = this.getOwnUserId();
            if (userId) {
              Cache.remove(`user_${userId}`);
            }
            this.pendingRequest = null;
          });
        }
        static getOwnUserId() {
          const userNode = document.querySelector('.settings-menu a[href*="XID="]');
          if (!userNode) {
            return 0;
          }
          return parseInt(userNode.href.replace(/[^\d]/g, "")) || 0;
        }
        static async getUserStats() {
          const key = Config.get("torn_key");
          if (!key) {
            return Promise.resolve(void 0);
          }
          const userId = this.getOwnUserId();
          if (!userId) {
            return Promise.resolve(void 0);
          }
          const cacheKey = `user_${userId}`;
          const cachedStats = Cache.get(cacheKey);
          if (cachedStats) {
            return cachedStats;
          }
          if (this.pendingRequest !== null) {
            return this.pendingRequest;
          }
          this.pendingRequest = new Promise((resolve, reject) => {
            tornAPI({ section: "user", endpoint: "personalstats", parameters: { "cat": "battle_stats" } }).then((json) => {
              const battleStats = json?.personalstats?.battle_stats;
              if (!battleStats) {
                reject(new Error("No battle_stats found"));
                return;
              }
              battleStats.score = Math.sqrt(battleStats.strength) + Math.sqrt(battleStats.defense) + Math.sqrt(battleStats.speed) + Math.sqrt(battleStats.dexterity);
              Cache.set(cacheKey, battleStats, 60 * 60 * 24);
              resolve(battleStats);
            }).catch((error) => {
              reject(error);
            }).finally(() => {
              this.pendingRequest = null;
            });
          });
          return this.pendingRequest;
        }
      };
    }
  });


  // src/Spy.ts
  function getBreakdownSource(spy) {
    if (spy.type === 5 /* FFS */) {
      return BREAKDOWN_SOURCE_NAMES[spy.breakdownSource?.toLowerCase() || ""] || spy.breakdownSource || "FFScouter";
    }
    return "";
  }
  function getBreakdownTotal(spy) {
    return (spy.strength || 0) + (spy.speed || 0) + (spy.defense || 0) + (spy.dexterity || 0);
  }
  function hasStatBreakdown(spy, otherSources = [], nowSeconds = Date.now() / 1e3) {
    if (spy.type !== 5 /* FFS */ || !(spy.strength || spy.speed || spy.defense || spy.dexterity)) {
      return false;
    }
    const breakdownTime = spy.breakdownTimestamp || spy.timestamp;
    if (!breakdownTime || nowSeconds - breakdownTime <= OUTDATED_BREAKDOWN_SECONDS) {
      return true;
    }
    const breakdownTotal = getBreakdownTotal(spy);
    const newerTotals = otherSources.filter((other) => other !== spy && other.total && other.timestamp > breakdownTime).map((other) => other.total);
    if (spy.breakdownTimestamp && spy.total) {
      newerTotals.push(spy.total);
    }
    return !newerTotals.some((total) => Math.max(total, breakdownTotal) / Math.min(total, breakdownTotal) >= OUTDATED_BREAKDOWN_RATIO);
  }
  function getCachedSpy(userId) {
    const spy = getPreferredSpy(getCachedSpySources(userId), userId);
    if (spy.type !== 0 /* None */) {
      return spy;
    }
    return createMissingSpy(userId);
  }
  function getCachedSpySources(userId) {
    return getOrderedSpies(Array.from(getCachedSpySourceMap(userId).values()));
  }
  function getPreferredSpy(spies, userId, nowSeconds = Date.now() / 1e3) {
    const orderedSpies = getOrderedSpies(spies);
    const spy = orderedSpies.map(getRealSpy).reduce((newest, other) => other && (!newest || other.timestamp > newest.timestamp) ? other : newest, void 0);
    const estimate = orderedSpies.find(isEstimate);
    if (!spy || !estimate) {
      return spy || estimate || orderedSpies[0] || createMissingSpy(userId);
    }
    if (!keepsSpy(spy, estimate, nowSeconds)) {
      return estimate;
    }
    return spy.fairfight === void 0 && estimate.fairfight !== void 0 ? { ...spy, fairfight: estimate.fairfight } : spy;
  }
  function isEstimate(spy) {
    if (spy.type === 5 /* FFS */) {
      return !hasFullBreakdown(spy) || spy.breakdownTimestamp !== void 0;
    }
    return false;
  }
  function hasFullBreakdown(spy) {
    return Boolean(spy.strength && spy.speed && spy.defense && spy.dexterity);
  }
  function getRealSpy(spy) {
    if (!isEstimate(spy)) {
      return spy.total ? spy : void 0;
    }
    if (spy.type !== 5 /* FFS */ || !spy.breakdownTimestamp || !hasFullBreakdown(spy)) {
      return void 0;
    }
    const linked = {
      type: getLinkedSpyType(spy.breakdownSource),
      userId: spy.userId,
      timestamp: spy.breakdownTimestamp,
      total: getBreakdownTotal(spy),
      strength: spy.strength,
      speed: spy.speed,
      defense: spy.defense,
      dexterity: spy.dexterity
    };
    if (linked.type === 5 /* FFS */) {
      linked.breakdownSource = spy.breakdownSource;
    }
    return linked;
  }
  function getLinkedSpyType(source) {
    return 5 /* FFS */;
  }
  function keepsSpy(spy, estimate, nowSeconds) {
    if (nowSeconds - spy.timestamp <= RECENT_SPY_SECONDS || spy.timestamp >= estimate.timestamp || !estimate.total) {
      return true;
    }
    return estimate.total <= spy.total * MATCHING_ESTIMATE_RATIO;
  }
  function getOrderedSpies(spies) {
    const spiesByType = /* @__PURE__ */ new Map();
    spies.forEach((spy) => {
      if (isUsableSpy(spy)) {
        spiesByType.set(spy.type, spy);
      }
    });
    return getSpySourceOrder().map((type) => spiesByType.get(type)).filter((spy) => spy !== void 0);
  }
  function getSpySourceOrder() {
    const configuredOrder = Config.get("spy_source_order");
    const key = typeof configuredOrder === "string" ? configuredOrder : "";
    if (spySourceOrderValue !== null && spySourceOrderKey === key) {
      return spySourceOrderValue;
    }
    const order = computeSpySourceOrder(configuredOrder);
    spySourceOrderKey = key;
    spySourceOrderValue = order;
    return order;
  }
  function computeSpySourceOrder(configuredOrder) {
    if (typeof configuredOrder !== "string" || !configuredOrder.trim()) {
      return [...DEFAULT_SPY_SOURCE_ORDER];
    }
    return normalizeSpySourceOrder(
      configuredOrder.split(/[\s>,;\n]+/).map((value) => parseSpySourceType(value))
    );
  }
  function createMissingSpy(userId) {
    return {
      type: 0 /* None */,
      userId,
      timestamp: 0
    };
  }
  function normalizeSpySourceOrder(types) {
    const seenTypes = /* @__PURE__ */ new Set();
    const order = [];
    types.forEach((type) => {
      if (type === null || type === 0 /* None */ || seenTypes.has(type)) {
        return;
      }
      seenTypes.add(type);
      order.push(type);
    });
    DEFAULT_SPY_SOURCE_ORDER.forEach((type) => {
      if (!seenTypes.has(type)) {
        seenTypes.add(type);
        order.push(type);
      }
    });
    return order;
  }
  function parseSpySourceType(value) {
    const normalized = value.trim().toLowerCase().replace(/[\s_-]/g, "");
    switch (normalized) {
      case "5":
      case "f":
      case "ffs":
      case "ffscouter":
        return 5 /* FFS */;
      default:
        return null;
    }
  }
  function isSpy(value) {
    if (!value || typeof value !== "object") {
      return false;
    }
    const spy = value;
    return typeof spy.type === "number" && typeof spy.userId === "number" && typeof spy.timestamp === "number";
  }
  function isUsableSpy(value) {
    return isSpy(value) && value.type !== 0 /* None */ && SPY_SOURCE_TYPES.includes(value.type) && Number.isFinite(value.userId) && value.userId > 0;
  }
  function getSpyCacheKey(userId) {
    return `spy_user_${userId}`;
  }
  function getSpySourceKey(type) {
    return type === 5 /* FFS */ ? "ffs" : "none";
  }
  function getLegacySpyCacheKeys(userId) {
    return [`ffs_user_${userId}`];
  }
  function isDisplayableSpyUserCache(value) {
    if (typeof value.updatedAt !== "number" || !Number.isFinite(value.updatedAt) || !value.updatedAt) {
      return false;
    }
    const ageSeconds = Math.max(0, Math.floor(Date.now() / 1e3) - value.updatedAt);
    return ageSeconds <= STALE_SPY_DISPLAY_SECONDS;
  }
  function getCachedSpySourceMap(userId) {
    const spiesByType = /* @__PURE__ */ new Map();
    const cachedSpyUser = Cache.get(getSpyCacheKey(userId));
    if (cachedSpyUser && typeof cachedSpyUser === "object" && isDisplayableSpyUserCache(cachedSpyUser)) {
      const sources = cachedSpyUser.sources;
      if (sources && typeof sources === "object") {
        Object.values(sources).forEach((spy) => {
          if (isUsableSpy(spy) && spy.userId === userId) {
            spiesByType.set(spy.type, spy);
          }
        });
      }
    }
    getLegacySpyCacheKeys(userId).forEach((cacheKey) => {
      const spy = Cache.get(cacheKey);
      if (isUsableSpy(spy) && spy.userId === userId) {
        spiesByType.set(spy.type, spy);
      }
    });
    return spiesByType;
  }
  function cacheSpySource(spy) {
    if (!isUsableSpy(spy)) {
      return;
    }
    const sources = getCachedSpySourceMap(spy.userId);
    sources.set(spy.type, spy);
    const cachedSources = {};
    sources.forEach((sourceSpy, type) => {
      cachedSources[getSpySourceKey(type)] = sourceSpy;
    });
    Cache.set(getSpyCacheKey(spy.userId), {
      version: 1,
      userId: spy.userId,
      sources: cachedSources,
      updatedAt: Math.floor(Date.now() / 1e3)
    }, STALE_SPY_DISPLAY_SECONDS);
  }
  function cacheSpySources(spies) {
    const cachedSpies = [];
    spies.forEach((spy) => {
      if (!spy) {
        return;
      }
      cacheSpySource(spy);
      cachedSpies.push(spy);
    });
    return cachedSpies;
  }
  function getSpies(userIds, factionId, options = {}) {
    const spies = userIds.reduce((obj, userId) => {
      obj[userId] = getCachedSpy(userId);
      return obj;
    }, {});
    let resolved = false;
    let resolveSpies = () => void 0;
    const lookup = new Promise((resolve) => {
      resolveSpies = resolve;
    });
    function publishUser(userId) {
      const sources = getCachedSpySources(userId);
      const selected = getPreferredSpy(sources, userId);
      spies[userId] = selected;
      options.onUpdate?.({
        userId,
        spies: sources,
        selected
      });
    }
    function publishSpies(nextSpies) {
      const updatedSpies = cacheSpySources(nextSpies);
      updatedSpies.forEach((spy) => publishUser(spy.userId));
    }
    function hasSpyForEverUser() {
      return Object.values(spies).every((spy) => spy.type !== 0 /* None */);
    }
    async function ffs(userIds2) {
      const ffsSpies = await FFScouter.getSpies(userIds2, factionId).catch(console.error);
      if (ffsSpies) {
        publishSpies(ffsSpies);
      }
    }
    const fetchers = /* @__PURE__ */ new Map([
      [5 /* FFS */, ffs]
    ]);
    userIds.forEach((userId) => {
      if (getCachedSpySources(userId).length) {
        publishUser(userId);
      }
    });
    if (hasSpyForEverUser()) {
      resolved = true;
      resolveSpies({ ...spies });
    }
    void (async () => {
      for (const sourceType of getSpySourceOrder()) {
        const fetcher = fetchers.get(sourceType);
        if (!fetcher) {
          continue;
        }
        await fetcher(userIds);
        if (!resolved && hasSpyForEverUser()) {
          resolved = true;
          resolveSpies({ ...spies });
        }
      }
      if (!resolved) {
        resolved = true;
        resolveSpies({ ...spies });
      }
    })();
    return lookup;
  }
  var OUTDATED_BREAKDOWN_SECONDS, OUTDATED_BREAKDOWN_RATIO, BREAKDOWN_SOURCE_NAMES, DEFAULT_SPY_SOURCE_ORDER, SPY_SOURCE_TYPES, STALE_SPY_DISPLAY_SECONDS, RECENT_SPY_SECONDS, MATCHING_ESTIMATE_RATIO, spySourceOrderKey, spySourceOrderValue;
  var init_Spy = __esm({
    "src/Spy.ts"() {
      "use strict";
      init_FFScouter();
      init_Cache();
      init_Config();
      OUTDATED_BREAKDOWN_SECONDS = 30 * 24 * 60 * 60;
      OUTDATED_BREAKDOWN_RATIO = 1.5;
      BREAKDOWN_SOURCE_NAMES = {
        ffscouter: "FFScouter"
      };
      DEFAULT_SPY_SOURCE_ORDER = [
        5 /* FFS */
      ];
      SPY_SOURCE_TYPES = [
        5 /* FFS */
      ];
      STALE_SPY_DISPLAY_SECONDS = Cache.days(30);
      RECENT_SPY_SECONDS = 7 * 24 * 60 * 60;
      MATCHING_ESTIMATE_RATIO = 1.05;
      spySourceOrderKey = null;
      spySourceOrderValue = null;
    }
  });


  // src/FFScouter.ts
  var API_BASE, TIER_CACHE_KEY, TIER_CACHE_SECONDS, FLIGHTS_BATCH_SIZE, STATS_BATCH_SIZE, FFScouter;
  var init_FFScouter = __esm({
    "src/FFScouter.ts"() {
      "use strict";
      init_Cache();
      init_Http();
      init_Config();
      init_Utilities();
      init_Spy();
      API_BASE = "https://ffscouter.com/api/v1";
      TIER_CACHE_KEY = "ffs_tier";
      TIER_CACHE_SECONDS = Cache.days(1);
      FLIGHTS_BATCH_SIZE = 100;
      STATS_BATCH_SIZE = 205;
      FFScouter = class {
        static {
          this.tierCheck = null;
        }
        static {
          this.pendingRequests = /* @__PURE__ */ new Map();
        }
        static {
          this.key = Config.get("ffs_key");
          Config.onChange("ffs_key", (_key, value) => {
            this.key = value;
            this.tierCheck = null;
            this.refreshTier();
          });
          Cache.onBust(() => {
            this.tierCheck = null;
            this.refreshTier();
          });
          Cache.ready.then(() => this.refreshTier());
        }
        static getKey() {
          return String(this.key || Config.get("ffs_key") || "").trim();
        }
        // Checks the key's tier and shows it in the Keys tab.
        static refreshTier() {
          if (!this.getKey()) {
            Config.setKeyStatus("ffs_key", "");
            return;
          }
          this.getTier().then((info) => Config.setKeyStatus("ffs_key", info?.message || "Couldn't check key", info?.tier === "premium" ? "success" : info?.tier === "invalid" || !info ? "error" : "")).catch(console.error);
        }
        static async isPremium() {
          return (await this.getTier().catch(() => null))?.tier === "premium";
        }
        // Key tier from check-key, cached a day or until premium runs out.
        static getTier() {
          const key = this.getKey();
          if (!key) {
            return Promise.resolve(null);
          }
          const cached = Cache.get(TIER_CACHE_KEY);
          if (cached?.keyTail === key.slice(-4)) {
            return Promise.resolve(cached);
          }
          if (!this.tierCheck) {
            this.tierCheck = this.requestTier(key).finally(() => {
              this.tierCheck = null;
            });
          }
          return this.tierCheck;
        }
        static async requestTier(key) {
          const response = await Http.request({ url: `${API_BASE}/check-key?key=${encodeURIComponent(key)}` });
          const json = jsonParse(response.responseText);
          if (!json || typeof json !== "object") {
            return null;
          }
          let info;
          if (response.status === 200 && json.is_registered === true) {
            const expiresAt = Math.max(Number(json.premium_expires_at) || 0, Number(json.faction_premium_expires_at) || 0) || null;
            info = json.is_premium === true ? { tier: "premium", premiumExpiresAt: expiresAt, message: `FFScouter premium${expiresAt ? ` until ${new Date(expiresAt * 1e3).toLocaleDateString()}` : ""}` } : { tier: "free", premiumExpiresAt: null, message: "FFScouter free" };
          } else if (response.status === 200) {
            info = { tier: "unregistered", premiumExpiresAt: null, message: "Key not registered on FFScouter" };
          } else if (response.status === 400 || response.status === 403) {
            info = { tier: "invalid", premiumExpiresAt: null, message: String(json.error || "Invalid FFScouter key") };
          } else {
            return null;
          }
          const untilExpiry = info.premiumExpiresAt ? info.premiumExpiresAt - Math.floor(Date.now() / 1e3) : TIER_CACHE_SECONDS;
          Cache.set(TIER_CACHE_KEY, { ...info, keyTail: key.slice(-4) }, Math.max(60, Math.min(TIER_CACHE_SECONDS, untilExpiry)));
          return info;
        }
        static async getSpies(userIds, factionId) {
          await this.loadFactionSpies(userIds, factionId);
          return userIds.map((userId) => Cache.get(`ffs_user_${userId}`));
        }
        // Members of this faction already looked up.
        static getRequestedUserIds(cacheKey) {
          const requested = Cache.get(cacheKey);
          return new Set(Array.isArray(requested) ? requested : []);
        }
        static async loadFactionSpies(userIds, factionId) {
          const key = this.getKey();
          if (!key) {
            return;
          }
          const premium = await this.isPremium();
          const cacheKey = premium ? `ffs_faction_premium_${factionId}` : `ffs_faction_${factionId}`;
          let pendingRequest = this.pendingRequests.get(cacheKey);
          while (pendingRequest) {
            await pendingRequest.catch(() => void 0);
            pendingRequest = this.pendingRequests.get(cacheKey);
          }
          const requested = this.getRequestedUserIds(cacheKey);
          const missing = userIds.filter((userId) => !requested.has(userId));
          if (!missing.length) {
            return;
          }
          const request = (async () => {
            for (let index = 0; index < missing.length; index += STATS_BATCH_SIZE) {
              await this.requestSpies(key, missing.slice(index, index + STATS_BATCH_SIZE), cacheKey, premium ? Cache.hours(1) : Cache.days(7));
            }
          })().finally(() => {
            this.pendingRequests.delete(cacheKey);
          });
          this.pendingRequests.set(cacheKey, request);
          return request;
        }
        static async requestSpies(key, userIds, cacheKey, expirySeconds) {
          const json = jsonParse(await Http.request(`${API_BASE}/get-stats?key=${encodeURIComponent(key)}&targets=${userIds.join(",")}`));
          if (json?.error) {
            throw new Error(json.error);
          }
          if (!Array.isArray(json)) {
            throw new Error("No spies found");
          }
          const covered = this.getRequestedUserIds(cacheKey);
          userIds.forEach((userId) => covered.add(userId));
          const keys = [cacheKey];
          const values = [Array.from(covered)];
          json.forEach((entry) => {
            const spy = this.parseSpy(entry);
            if (spy) {
              keys.push(`ffs_user_${spy.userId}`);
              values.push(spy);
            }
          });
          Cache.set(keys, values, expirySeconds);
        }
        // FFS's own estimate (the higher of premium and public), or the newest full spy when it has none; the spy's breakdown and the build are kept.
        static parseSpy(entry) {
          const userId = Number(entry?.player_id);
          if (!userId) {
            return void 0;
          }
          const spies = Array.isArray(entry.spies) ? entry.spies : [];
          const newestSpy = spies.filter((spy2) => spy2?.total && spy2.strength && spy2.speed && spy2.defense && spy2.dexterity).sort((a, b) => (b.last_updated || 0) - (a.last_updated || 0))[0];
          const premium = entry.available_estimates?.premium;
          const free = entry.available_estimates ? entry.available_estimates.bss : entry;
          const estimate = premium?.bs_estimate && !(free?.bs_estimate > premium.bs_estimate) ? premium : free;
          const other = estimate === premium ? free : premium;
          if (!estimate?.bs_estimate && !newestSpy) {
            return void 0;
          }
          const spy = estimate?.bs_estimate ? {
            type: 5 /* FFS */,
            userId,
            total: estimate.bs_estimate,
            fairfight: estimate.fair_fight ?? void 0,
            timestamp: estimate.last_updated,
            premium: estimate === premium
          } : {
            type: 5 /* FFS */,
            userId,
            total: newestSpy.total,
            fairfight: entry.available_estimates?.spies?.fair_fight ?? void 0,
            timestamp: newestSpy.last_updated
          };
          if (estimate?.bs_estimate && other?.bs_estimate) {
            spy.altTotal = other.bs_estimate;
            spy.altFairfight = other.fair_fight ?? void 0;
            spy.altTimestamp = other.last_updated;
          }
          if (newestSpy) {
            spy.strength = newestSpy.strength;
            spy.speed = newestSpy.speed;
            spy.defense = newestSpy.defense;
            spy.dexterity = newestSpy.dexterity;
            if (estimate?.bs_estimate) {
              spy.breakdownTimestamp = newestSpy.last_updated;
            }
            if (newestSpy.source) {
              spy.breakdownSource = String(newestSpy.source);
            }
          }
          if (entry.distribution?.distribution_human) {
            spy.distribution = String(entry.distribution.distribution_human);
          }
          return spy;
        }
        // Current trips from FFS (premium only). Players not flying map to null.
        static async getFlights(userIds) {
          const key = this.getKey();
          if (!key || !userIds.length || !await this.isPremium()) {
            return null;
          }
          const flights = /* @__PURE__ */ new Map();
          for (let index = 0; index < userIds.length; index += FLIGHTS_BATCH_SIZE) {
            const targets = userIds.slice(index, index + FLIGHTS_BATCH_SIZE);
            const response = await Http.request({ url: `${API_BASE}/player-flights/batch?key=${encodeURIComponent(key)}&targets=${targets.join(",")}` });
            const json = jsonParse(response.responseText);
            if (response.status === 403 && json?.code === 19) {
              Cache.remove(TIER_CACHE_KEY);
              this.refreshTier();
              return null;
            }
            if (response.status !== 200 || !Array.isArray(json?.flights)) {
              return flights.size ? flights : null;
            }
            targets.forEach((userId) => flights.set(userId, null));
            json.flights.forEach((entry) => {
              const userId = Number(entry?.player_id);
              if (userId) {
                flights.set(userId, this.parseFlight(entry.current));
              }
            });
          }
          return flights;
        }
        static parseFlight(current) {
          const earliest = Number(current?.earliest_arrival_time);
          const latest = Number(current?.latest_arrival_time);
          const description = String(current?.status_description || "");
          if (!earliest || !latest || !description) {
            return null;
          }
          const destination = description.match(/\bto (.+?)(?: from |$)/)?.[1]?.trim() || "";
          const origin = description.match(/\bfrom (.+)$/)?.[1]?.trim() || "Torn";
          if (!destination) {
            return null;
          }
          return {
            takeoff: Number(current.takeoff_time) || 0,
            earliest,
            latest: Math.max(earliest, latest),
            method: String(current.travel_method || ""),
            origin,
            destination
          };
        }
      };
    }
  });


  // src/Fly.ts
  var CACHE_MS, FFS_QUEUE_DELAY_MS, FFS_RETRY_MS, FFS_MAX_ATTEMPTS, ESTIMATE_SWITCH_GRACE_MS, AREA_COUNTRIES, Fly;
  var init_Fly = __esm({
    "src/Fly.ts"() {
      "use strict";
      init_Cache();
      init_Config();
      init_DataMonitor();
      init_FFScouter();
      init_Tooltip();
      init_Utilities();
      CACHE_MS = 3e4;
      FFS_QUEUE_DELAY_MS = 500;
      FFS_RETRY_MS = 6e4;
      FFS_MAX_ATTEMPTS = 3;
      ESTIMATE_SWITCH_GRACE_MS = 3e4;
      AREA_COUNTRIES = {
        1: "Torn",
        2: "Mexico",
        3: "Hawaii",
        4: "South Africa",
        5: "Japan",
        6: "China",
        7: "Argentina",
        8: "Switzerland",
        9: "Canada",
        10: "United Kingdom",
        11: "UAE",
        12: "Cayman Islands"
      };
      Fly = class {
        static {
          this.started = false;
        }
        static {
          this.cache = /* @__PURE__ */ new Map();
        }
        static {
          this.pending = /* @__PURE__ */ new Map();
        }
        static {
          this.dataChangeHandlers = /* @__PURE__ */ new Set();
        }
        static {
          this.tooltipBindings = /* @__PURE__ */ new WeakMap();
        }
        static {
          this.hoverCounter = 0;
        }
        static {
          this.ffsPremium = false;
        }
        static {
          this.ffsCache = /* @__PURE__ */ new Map();
        }
        static {
          this.ffsQueue = /* @__PURE__ */ new Set();
        }
        static {
          this.ffsQueueTimer = 0;
        }
        static {
          this.ffsFocusPending = false;
        }
        static {
          this.ffsAttempts = /* @__PURE__ */ new Map();
        }
        static start() {
          if (this.started) {
            return;
          }
          this.started = true;
          Config.onChange("ffs_key", () => {
            this.ffsCache.clear();
            this.ffsAttempts.clear();
            this.refreshFfsPremium();
          });
          Cache.onBust(() => {
            this.refreshFfsPremium();
          });
          this.refreshFfsPremium();
          DataMonitor.on("UserStatusChanged", (event) => this.handleUserStatusChanged(event));
          window.addEventListener("focus", () => {
            if (this.ffsFocusPending) {
              this.ffsFocusPending = false;
              this.flushFfsQueue();
            }
          });
        }
        static trackUser(userId, factionId) {
          if (!userId) {
            return;
          }
          this.queueFfsLookup([userId]);
        }
                static bindStatusNode(userId, node, factionId = 0) {
          if (userId && Number.isFinite(factionId) && factionId > 0) {
            this.trackUser(userId, factionId);
          }
          if (!userId || node.dataset["warhelperFlyBound"] === "true") {
            return;
          }
          node.dataset["warhelperFlyBound"] = "true";
          node.removeAttribute("title");
          node.removeAttribute("data-original-title");
          this.tooltipBindings.set(node, Tooltip.bind(node, this.getTooltipOptions(userId)));
          node.addEventListener("pointerenter", (event) => {
            if (event.pointerType !== "touch") {
              this.handleHover(userId, node);
            }
          });
          node.addEventListener("pointerdown", (event) => {
            if (event.pointerType === "touch") {
              this.handleHover(userId, node);
            }
          });
          node.addEventListener("pointerleave", (event) => {
            if (event.pointerType !== "touch") {
              this.clearHover(node);
            }
          });
          node.addEventListener("focus", () => this.handleHover(userId, node));
          node.addEventListener("blur", () => this.clearHover(node));
        }
        static onDataChange(handler) {
          this.dataChangeHandlers.add(handler);
          return () => {
            this.dataChangeHandlers.delete(handler);
          };
        }
        // Unused, but recent: kept commented out in case it is wanted again.
        // public static getRemainingFlightSeconds(userId: number): number | null {
        //   return this.getFlightCountdown(userId)?.seconds || null;
        // }
        static getFlightArrivalTimestamp(userId) {
          const arrival = this.getFlightArrival(userId);
          return arrival ? Math.ceil(arrival.timestamp / 1e3) : null;
        }
        // Soonest possible landing (ms) for a trip in the given travel status, or null when unknown.
        static getEarliestLanding(userId, travelStatus) {
          return this.getLandingWindows(userId, travelStatus)[0]?.earliest ?? null;
        }
        static getFlightArrivalPhase(userId) {
          return this.getFlightArrival(userId)?.phase || null;
        }
        static getFlightCountdown(userId) {
          const arrival = this.getFlightArrival(userId);
          if (!arrival) {
            return null;
          }
          return {
            seconds: Math.ceil((arrival.timestamp - getServerTimeMs()) / 1e3),
            phase: arrival.phase
          };
        }
        static hasExpiredFlightArrival(userId) {
          const userStatus = DataMonitor.getUserStatus(userId);
          if (!userStatus || userStatus.status !== "Traveling" || userStatus.area === 1) {
            return false;
          }
          const landingWindows = this.getLandingWindows(userId);
          if (!landingWindows.length) {
            return false;
          }
          return getServerTimeMs() >= Math.max(...landingWindows.map((window2) => window2.latest));
        }
        static hasFlightLookup(userId) {
          return this.cache.has(userId) || this.ffsCache.has(userId);
        }
        static isFlightLookupStale(userId, maxAgeMs = CACHE_MS) {
          const cached = this.cache.get(userId);
          return !cached || Date.now() - cached.fetchedAt >= maxAgeMs;
        }
        static getFlightLandingDisplay(userId) {
          return this.createFlightLandingDisplay(userId);
        }
        static async ensureFlightLandingDisplay(userId) {
          await this.getFlight(userId);
          return this.createFlightLandingDisplay(userId);
        }
        static async refreshFlightLandingDisplay(userId) {
          await this.getFlight(userId, true);
          return this.createFlightLandingDisplay(userId);
        }
        static getFlightArrival(userId) {
          const userStatus = DataMonitor.getUserStatus(userId);
          if (!userStatus || userStatus.status !== "Traveling") {
            return null;
          }
          const landingWindows = this.getLandingWindows(userId);
          const now2 = getServerTimeMs();
          for (let index = 0; index < landingWindows.length; index++) {
            const window2 = landingWindows[index];
            if (now2 < window2.earliest) {
              return {
                timestamp: window2.earliest,
                phase: "expected"
              };
            }
            if (now2 < window2.latest) {
              return {
                timestamp: window2.latest,
                phase: "possible"
              };
            }
            const next = landingWindows[index + 1];
            if (next && next.source !== window2.source && now2 < window2.latest + ESTIMATE_SWITCH_GRACE_MS) {
              return null;
            }
          }
          return null;
        }
        static createFlightLandingDisplay(userId) {
          const userStatus = DataMonitor.getUserStatus(userId);
          if (!userStatus || userStatus.status !== "Traveling") {
            return null;
          }
          const ranges = this.getLandingWindows(userId).map((window2) => ({
            label: window2.label,
            range: this.formatLandingRange(window2),
            earliest: window2.earliest,
            latest: window2.latest
          }));
          if (!ranges.length) {
            return null;
          }
          const { ffs } = this.getMatchedFlights(userId);
          const arrival = this.getFlightArrival(userId);
          const country = ffs?.destination === "Torn" ? ffs.origin : ffs?.destination || "";
          return {
            route: this.getRouteLabel(null, ffs),
            country,
            destinationCountry: ffs?.destination || "",
            ranges,
            nextTimestampSeconds: arrival ? Math.ceil(arrival.timestamp / 1e3) : null,
            phase: arrival?.phase || null,
            tooltip: this.getTooltip(userId)
          };
        }
        // Seintz and FFS flights that fit the player's current status.
        static getMatchedFlights(userId, userStatus = DataMonitor.getUserStatus(userId)) {
          const ffs = this.ffsCache.get(userId)?.flight || null;
          return {
            seintz: null,
            ffs: ffs && this.ffsFlightMatchesUserStatus(userStatus, ffs) ? ffs : null
          };
        }
        // Landing windows from both sources, soonest first.
        static getLandingWindows(userId, userStatus) {
          const { ffs } = this.getMatchedFlights(userId, userStatus);
          const windows = [];
          if (ffs) {
            windows.push({
              label: ffs.method ? `FFS ${ffs.method}` : "FFS",
              source: "ffs",
              earliest: ffs.earliest * 1e3,
              latest: ffs.latest * 1e3
            });
          }
          return windows.sort((a, b) => a.earliest - b.earliest);
        }
        static ffsFlightMatchesUserStatus(userStatus, flight) {
          if (!userStatus || userStatus.status !== "Traveling" || flight.latest * 1e3 < Date.now() - 60 * 60 * 1e3) {
            return false;
          }
          const expectedCountry = userStatus.area === 1 ? "Torn" : AREA_COUNTRIES[userStatus.area];
          return !expectedCountry || flight.destination === expectedCountry;
        }
        static refreshFfsPremium() {
          FFScouter.isPremium().then((premium) => {
            if (premium === this.ffsPremium) {
              return;
            }
            this.ffsPremium = premium;
            if (!premium) {
              this.ffsCache.clear();
            }
            this.notifyDataChange();
          }).catch(console.error);
        }
        // Whether FFS should be asked about this player's current trip.
        static needsFfsLookup(userId) {
          const userStatus = DataMonitor.getUserStatus(userId);
          if (!this.ffsPremium || userStatus?.status !== "Traveling") {
            return false;
          }
          const cached = this.ffsCache.get(userId);
          if (!cached) {
            return true;
          }
          if (cached.flight && this.ffsFlightMatchesUserStatus(userStatus, cached.flight)) {
            return false;
          }
          return Date.now() - cached.fetchedAt >= FFS_RETRY_MS && (this.ffsAttempts.get(userId) || 0) < FFS_MAX_ATTEMPTS;
        }
        // Batches automatic FFS lookups; sent only while the window has focus.
        static queueFfsLookup(userIds) {
          userIds.forEach((userId) => {
            if (this.needsFfsLookup(userId)) {
              this.ffsQueue.add(userId);
            }
          });
          if (this.ffsQueue.size && !this.ffsQueueTimer) {
            this.ffsQueueTimer = window.setTimeout(() => this.flushFfsQueue(), FFS_QUEUE_DELAY_MS);
          }
        }
        static flushFfsQueue() {
          this.ffsQueueTimer = 0;
          if (!document.hasFocus()) {
            this.ffsFocusPending = true;
            return;
          }
          const userIds = Array.from(this.ffsQueue);
          this.ffsQueue.clear();
          this.loadFfsFlights(userIds).catch(console.error);
        }
        static async loadFfsFlights(userIds) {
          const targets = userIds.filter((userId) => this.needsFfsLookup(userId));
          if (!targets.length) {
            return;
          }
          const flights = await FFScouter.getFlights(targets).catch((error) => {
            console.error(error);
            return null;
          });
          if (!flights) {
            this.refreshFfsPremium();
            return;
          }
          const now2 = Date.now();
          const retry = [];
          flights.forEach((flight, userId) => {
            this.ffsCache.set(userId, { fetchedAt: now2, flight });
            if (!flight || !this.ffsFlightMatchesUserStatus(DataMonitor.getUserStatus(userId), flight)) {
              this.ffsAttempts.set(userId, (this.ffsAttempts.get(userId) || 0) + 1);
              retry.push(userId);
            }
          });
          this.notifyDataChange();
          if (retry.length) {
            window.setTimeout(() => this.queueFfsLookup(retry), FFS_RETRY_MS + 1e3);
          }
        }
        static reset() {
          this.cache.clear();
          this.pending.clear();
          this.ffsCache.clear();
          this.ffsAttempts.clear();
          this.refreshFfsPremium();
        }
        // No key means no flight store requests; builds without the store have none.
                                                static async getFlight(userId, force = false) {
          await this.loadFfsFlights([userId]);
          return this.ffsCache.get(userId)?.flight || null;
        }
        static notifyDataChange() {
          Tooltip.refresh();
          this.dataChangeHandlers.forEach((handler) => handler());
        }
                static handleUserStatusChanged(event) {
          const userIds = event.detail?.statusUserIds || [];
          userIds.forEach((userId) => {
            this.ffsAttempts.delete(Number(userId));
          });
          this.queueFfsLookup(userIds.map(Number));
        }
                                static async handleHover(userId, node) {
          const userStatus = DataMonitor.getUserStatus(userId);
          if (!userStatus || userStatus.status !== "Traveling" || this.hasExpiredFlightArrival(userId)) {
            this.clearHover(node);
            this.refreshTooltip(userId, node);
            return;
          }
          const hoverId = String(++this.hoverCounter);
          node.dataset["warhelperFlyHover"] = hoverId;
          this.refreshTooltip(userId, node);
          const flight = await this.getFlight(userId);
          if (!node.isConnected || node.dataset["warhelperFlyHover"] !== hoverId) {
            return;
          }
          if (this.hasExpiredFlightArrival(userId)) {
            this.clearHover(node);
            this.refreshTooltip(userId, node);
            this.notifyDataChange();
            return;
          }
          this.refreshTooltip(userId, node);
        }
        static clearHover(node) {
          delete node.dataset["warhelperFlyHover"];
          node.removeAttribute("title");
          node.removeAttribute("aria-label");
          node.removeAttribute("data-original-title");
        }
        static refreshTooltip(userId, node) {
          const options = this.getTooltipOptions(userId);
          let binding = this.tooltipBindings.get(node);
          if (!binding) {
            binding = Tooltip.bind(node, options);
            this.tooltipBindings.set(node, binding);
          }
          binding.update(options);
          node.removeAttribute("title");
          node.removeAttribute("data-original-title");
          const content = this.getStatusTooltipContent(userId);
          if (content) {
            node.setAttribute("aria-label", this.stripHtml(content));
          } else {
            node.removeAttribute("aria-label");
          }
        }
        static getTooltipOptions(userId) {
          return {
            content: () => this.getStatusTooltipContent(userId),
            html: true,
            placement: "element",
            className: "__warhelper_fly_custom_tooltip"
          };
        }
        static getStatusTooltipContent(userId) {
          const userStatus = DataMonitor.getUserStatus(userId);
          if (!userStatus || userStatus.status !== "Traveling" || this.hasExpiredFlightArrival(userId)) {
            return "";
          }
          if (this.ffsCache.has(userId)) {
            return this.getTooltip(userId);
          }
          return "Loading flight estimate...";
        }
        static getTooltip(userId) {
          const rows = this.getLandingWindows(userId).map((window2) => {
            return `
        <div class="__warhelper_tooltip_row __warhelper_fly_time_row">
          <span>${this.escapeHtml(window2.label)}</span>
          <span>${this.escapeHtml(this.formatLandingRange(window2))}</span>
        </div>
      `;
          }).join("");
          if (!rows) {
            return "No flight estimate found";
          }
          const { seintz, ffs } = this.getMatchedFlights(userId);
          return `
      <div class="__warhelper_tooltip __warhelper_fly_tooltip">
        <div class="__warhelper_tooltip_title __warhelper_fly_title">${this.escapeHtml(this.getRouteLabel(seintz, ffs))}</div>
        <div class="__warhelper_tooltip_rows __warhelper_fly_times">${rows}</div>
      </div>
    `;
        }
                static formatLandingRange(window2) {
          return `${this.formatTct(new Date(window2.earliest))} TCT - ${this.formatTct(new Date(window2.latest))} TCT`;
        }
                        static formatTct(date) {
          return [
            date.getUTCHours(),
            date.getUTCMinutes(),
            date.getUTCSeconds()
          ].map((part) => String(part).padStart(2, "0")).join(":");
        }
        static getRouteLabel(seintz, ffs) {
          return `Flying to ${ffs?.destination || "Torn"}`;
        }
                static getTimestampMs(flight) {
          const timestamp = flight.timestamp instanceof Date ? flight.timestamp.getTime() : new Date(flight.timestamp || 0).getTime();
          return Number.isFinite(timestamp) ? timestamp : 0;
        }
        static isStale(flight) {
          const timestamp = this.getTimestampMs(flight);
          return !timestamp || timestamp < Date.now() - 24 * 60 * 60 * 1e3;
        }
                                static isFlyingStatus(userStatus) {
          return Boolean(
            userStatus && (userStatus.status === "Traveling" || userStatus.status === "Abroad" || userStatus.status === "Hospital" && userStatus.area !== 1)
          );
        }
        static parseFlight(json) {
          if (!json || typeof json !== "object" || Array.isArray(json)) {
            return null;
          }
          return json;
        }
                        static escapeHtml(value) {
          return value.replace(/[&<>"']/g, (char) => {
            switch (char) {
              case "&":
                return "&amp;";
              case "<":
                return "&lt;";
              case ">":
                return "&gt;";
              case '"':
                return "&quot;";
              case "'":
                return "&#39;";
              default:
                return char;
            }
          });
        }
        static stripHtml(value) {
          return value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
        }
      };
    }
  });


  // src/EarlyReturn.ts
  var EARLY_RETURN_SECONDS, MIN_EARLY_SECONDS, EarlyReturn;
  var init_EarlyReturn = __esm({
    "src/EarlyReturn.ts"() {
      "use strict";
      init_DataMonitor();
      init_Fly();
      init_Utilities();
      EARLY_RETURN_SECONDS = 30;
      MIN_EARLY_SECONDS = 2;
      EarlyReturn = class {
        static {
          this.entries = /* @__PURE__ */ new Map();
        }
        static {
          DataMonitor.onStatusTransition((userId, previous, next, observedAt) => this.handleTransition(userId, previous, next, observedAt));
        }
        // The member's early return, while it is recent and they are still Okay.
        static get(userId, status) {
          const entry = this.entries.get(userId);
          if (!entry) {
            return null;
          }
          if (status.status !== "Okay" || status.area !== 1 || entry.at + EARLY_RETURN_SECONDS <= getServerTimestampSeconds()) {
            this.entries.delete(userId);
            return null;
          }
          return entry;
        }
        static handleTransition(userId, previous, next, observedAt) {
          this.entries.delete(userId);
          if (next.status !== "Okay" || next.area !== 1) {
            return;
          }
          const entry = this.getEntry(userId, previous, observedAt);
          if (entry && entry.earlySeconds > MIN_EARLY_SECONDS) {
            this.entries.set(userId, entry);
          }
        }
        static getEntry(userId, previous, observedAt) {
          if (previous.status === "Hospital" || previous.status === "Jail") {
            return {
              kind: previous.status === "Hospital" ? "hospital" : "jail",
              at: observedAt,
              earlySeconds: previous.updateAt - observedAt
            };
          }
          if (previous.status === "Traveling") {
            const earliest = Fly.getEarliestLanding(userId, previous);
            if (earliest === null) {
              return null;
            }
            return {
              kind: "landing",
              at: observedAt,
              earlySeconds: Math.floor(earliest / 1e3) - observedAt
            };
          }
          return null;
        }
      };
    }
  });


  // src/Update.ts
  var CHECK_INTERVAL_MS, CACHE_KEY, Update;
  var init_Update = __esm({
    "src/Update.ts"() {
      "use strict";
      init_Cache();
      init_Http();
      init_TabBus();
      CHECK_INTERVAL_MS = 30 * 60 * 1e3;
      CACHE_KEY = "update_check";
      Update = class {
        static {
          this.started = false;
        }
        static {
          this.checking = false;
        }
        // Newer published version, or null. Cheap to call on every update.
        static getStatus() {
          if (!this.isEnabled()) {
            return null;
          }
          this.start();
          const latest = Cache.get(CACHE_KEY)?.version;
          if (!latest || this.versionTime(latest) <= this.versionTime("20261116.182220+b94b872")) {
            return null;
          }
          return { version: latest, url: "https://nstorn.gitlab.io/warhelper/userscript.user.js" };
        }
        static isEnabled() {
          return true;
        }
        static start() {
          if (this.started) {
            return;
          }
          this.started = true;
          this.checkIfDue();
          window.setInterval(() => this.checkIfDue(), 60 * 1e3);
        }
        // User asked (refresh button): check from this tab now, ignoring the interval and master election.
        static checkNow() {
          if (this.isEnabled()) {
            this.check();
          }
        }
        // Only the master tab checks; the others read the shared cache.
        static checkIfDue() {
          const last = Cache.get(CACHE_KEY);
          if (!TabBus.isMaster() || last && Date.now() - last.checkedAt < CHECK_INTERVAL_MS) {
            return;
          }
          this.check();
        }
        static check() {
          if (this.checking) {
            return;
          }
          const last = Cache.get(CACHE_KEY);
          this.checking = true;
          Http.request({ url: `${"https://nstorn.gitlab.io/warhelper/userscript.meta.js"}?t=${Date.now()}`, timeout: 15e3 }).then((response) => {
            const version = response.status === 200 ? /^\/\/\s*@version\s+(\S+)/m.exec(response.responseText)?.[1] : void 0;
            Cache.set(CACHE_KEY, { checkedAt: Date.now(), version: version ?? last?.version ?? "" });
          }).catch(() => {
            Cache.set(CACHE_KEY, { checkedAt: Date.now(), version: last?.version ?? "" });
          }).finally(() => {
            this.checking = false;
          });
        }
        // "20261013.183600+abc1234" -> 20261013183600; 0 when unreadable.
        static versionTime(version) {
          const match = /^(\d{8})\.(\d{6})/.exec(version);
          return match ? Number(`${match[1]}${match[2]}`) : 0;
        }
      };
    }
  });

  // ../../../builds/nstorn/warhelper/node_modules/svelte/src/runtime/internal/utils.js
  function noop() {
  }
  function run(fn) {
    return fn();
  }
  function blank_object() {
    return /* @__PURE__ */ Object.create(null);
  }
  function run_all(fns) {
    fns.forEach(run);
  }
  function is_function(thing) {
    return typeof thing === "function";
  }
  function safe_not_equal(a, b) {
    return a != a ? b == b : a !== b || a && typeof a === "object" || typeof a === "function";
  }
  function is_empty(obj) {
    return Object.keys(obj).length === 0;
  }
  function action_destroyer(action_result) {
    return action_result && is_function(action_result.destroy) ? action_result.destroy : noop;
  }
  var init_utils = __esm({
    "../../../builds/nstorn/warhelper/node_modules/svelte/src/runtime/internal/utils.js"() {
    }
  });

  // ../../../builds/nstorn/warhelper/node_modules/svelte/src/runtime/internal/environment.js
  var init_environment = __esm({
    "../../../builds/nstorn/warhelper/node_modules/svelte/src/runtime/internal/environment.js"() {
      init_utils();
    }
  });

  // ../../../builds/nstorn/warhelper/node_modules/svelte/src/runtime/internal/loop.js
  var init_loop = __esm({
    "../../../builds/nstorn/warhelper/node_modules/svelte/src/runtime/internal/loop.js"() {
      init_environment();
    }
  });

  // ../../../builds/nstorn/warhelper/node_modules/svelte/src/runtime/internal/globals.js
  var globals;
  var init_globals = __esm({
    "../../../builds/nstorn/warhelper/node_modules/svelte/src/runtime/internal/globals.js"() {
      globals = typeof window !== "undefined" ? window : typeof globalThis !== "undefined" ? globalThis : (
        // @ts-ignore Node typings have this
        global
      );
    }
  });

  // ../../../builds/nstorn/warhelper/node_modules/svelte/src/runtime/internal/ResizeObserverSingleton.js
  var ResizeObserverSingleton;
  var init_ResizeObserverSingleton = __esm({
    "../../../builds/nstorn/warhelper/node_modules/svelte/src/runtime/internal/ResizeObserverSingleton.js"() {
      init_globals();
      ResizeObserverSingleton = class _ResizeObserverSingleton {
        /**
         * @private
         * @readonly
         * @type {WeakMap<Element, import('./private.js').Listener>}
         */
        _listeners = "WeakMap" in globals ? /* @__PURE__ */ new WeakMap() : void 0;
        /**
         * @private
         * @type {ResizeObserver}
         */
        _observer = void 0;
        /** @type {ResizeObserverOptions} */
        options;
        /** @param {ResizeObserverOptions} options */
        constructor(options) {
          this.options = options;
        }
        /**
         * @param {Element} element
         * @param {import('./private.js').Listener} listener
         * @returns {() => void}
         */
        observe(element2, listener) {
          this._listeners.set(element2, listener);
          this._getObserver().observe(element2, this.options);
          return () => {
            this._listeners.delete(element2);
            this._observer.unobserve(element2);
          };
        }
        /**
         * @private
         */
        _getObserver() {
          return this._observer ?? (this._observer = new ResizeObserver((entries) => {
            for (const entry of entries) {
              _ResizeObserverSingleton.entries.set(entry.target, entry);
              this._listeners.get(entry.target)?.(entry);
            }
          }));
        }
      };
      ResizeObserverSingleton.entries = "WeakMap" in globals ? /* @__PURE__ */ new WeakMap() : void 0;
    }
  });

  // ../../../builds/nstorn/warhelper/node_modules/svelte/src/runtime/internal/dom.js
  function start_hydrating() {
    is_hydrating = true;
  }
  function end_hydrating() {
    is_hydrating = false;
  }
  function append(target, node) {
    target.appendChild(node);
  }
  function insert(target, node, anchor) {
    target.insertBefore(node, anchor || null);
  }
  function detach(node) {
    if (node.parentNode) {
      node.parentNode.removeChild(node);
    }
  }
  function destroy_each(iterations, detaching) {
    for (let i = 0; i < iterations.length; i += 1) {
      if (iterations[i]) iterations[i].d(detaching);
    }
  }
  function element(name) {
    return document.createElement(name);
  }
  function svg_element(name) {
    return document.createElementNS("http://www.w3.org/2000/svg", name);
  }
  function text(data) {
    return document.createTextNode(data);
  }
  function space() {
    return text(" ");
  }
  function empty() {
    return text("");
  }
  function listen(node, event, handler, options) {
    node.addEventListener(event, handler, options);
    return () => node.removeEventListener(event, handler, options);
  }
  function prevent_default(fn) {
    return function(event) {
      event.preventDefault();
      return fn.call(this, event);
    };
  }
  function stop_propagation(fn) {
    return function(event) {
      event.stopPropagation();
      return fn.call(this, event);
    };
  }
  function attr(node, attribute, value) {
    if (value == null) node.removeAttribute(attribute);
    else if (node.getAttribute(attribute) !== value) node.setAttribute(attribute, value);
  }
  function children(element2) {
    return Array.from(element2.childNodes);
  }
  function set_data(text2, data) {
    data = "" + data;
    if (text2.data === data) return;
    text2.data = /** @type {string} */
    data;
  }
  function set_style(node, key, value, important) {
    if (value == null) {
      node.style.removeProperty(key);
    } else {
      node.style.setProperty(key, value, important ? "important" : "");
    }
  }
  function toggle_class(element2, name, toggle) {
    element2.classList.toggle(name, !!toggle);
  }
  function get_custom_elements_slots(element2) {
    const result = {};
    element2.childNodes.forEach(
      /** @param {Element} node */
      (node) => {
        result[node.slot || "default"] = true;
      }
    );
    return result;
  }
  var is_hydrating, HtmlTag;
  var init_dom = __esm({
    "../../../builds/nstorn/warhelper/node_modules/svelte/src/runtime/internal/dom.js"() {
      init_utils();
      init_ResizeObserverSingleton();
      is_hydrating = false;
      HtmlTag = class {
        /**
         * @private
         * @default false
         */
        is_svg = false;
        /** parent for creating node */
        e = void 0;
        /** html tag nodes */
        n = void 0;
        /** target */
        t = void 0;
        /** anchor */
        a = void 0;
        constructor(is_svg = false) {
          this.is_svg = is_svg;
          this.e = this.n = null;
        }
        /**
         * @param {string} html
         * @returns {void}
         */
        c(html) {
          this.h(html);
        }
        /**
         * @param {string} html
         * @param {HTMLElement | SVGElement} target
         * @param {HTMLElement | SVGElement} anchor
         * @returns {void}
         */
        m(html, target, anchor = null) {
          if (!this.e) {
            if (this.is_svg)
              this.e = svg_element(
                /** @type {keyof SVGElementTagNameMap} */
                target.nodeName
              );
            else
              this.e = element(
                /** @type {keyof HTMLElementTagNameMap} */
                target.nodeType === 11 ? "TEMPLATE" : target.nodeName
              );
            this.t = target.tagName !== "TEMPLATE" ? target : (
              /** @type {HTMLTemplateElement} */
              target.content
            );
            this.c(html);
          }
          this.i(anchor);
        }
        /**
         * @param {string} html
         * @returns {void}
         */
        h(html) {
          this.e.innerHTML = html;
          this.n = Array.from(
            this.e.nodeName === "TEMPLATE" ? this.e.content.childNodes : this.e.childNodes
          );
        }
        /**
         * @returns {void} */
        i(anchor) {
          for (let i = 0; i < this.n.length; i += 1) {
            insert(this.t, this.n[i], anchor);
          }
        }
        /**
         * @param {string} html
         * @returns {void}
         */
        p(html) {
          this.d();
          this.h(html);
          this.i(this.a);
        }
        /**
         * @returns {void} */
        d() {
          this.n.forEach(detach);
        }
      };
    }
  });

  // ../../../builds/nstorn/warhelper/node_modules/svelte/src/runtime/internal/style_manager.js
  var init_style_manager = __esm({
    "../../../builds/nstorn/warhelper/node_modules/svelte/src/runtime/internal/style_manager.js"() {
      init_dom();
      init_environment();
    }
  });

  // ../../../builds/nstorn/warhelper/node_modules/svelte/src/runtime/internal/animations.js
  var init_animations = __esm({
    "../../../builds/nstorn/warhelper/node_modules/svelte/src/runtime/internal/animations.js"() {
      init_utils();
      init_environment();
      init_loop();
      init_style_manager();
    }
  });

  // ../../../builds/nstorn/warhelper/node_modules/svelte/src/runtime/internal/lifecycle.js
  function set_current_component(component) {
    current_component = component;
  }
  function get_current_component() {
    if (!current_component) throw new Error("Function called outside component initialization");
    return current_component;
  }
  function onMount(fn) {
    get_current_component().$$.on_mount.push(fn);
  }
  function bubble(component, event) {
    const callbacks = component.$$.callbacks[event.type];
    if (callbacks) {
      callbacks.slice().forEach((fn) => fn.call(this, event));
    }
  }
  var current_component;
  var init_lifecycle = __esm({
    "../../../builds/nstorn/warhelper/node_modules/svelte/src/runtime/internal/lifecycle.js"() {
      init_dom();
    }
  });

  // ../../../builds/nstorn/warhelper/node_modules/svelte/src/runtime/internal/scheduler.js
  function schedule_update() {
    if (!update_scheduled) {
      update_scheduled = true;
      resolved_promise.then(flush);
    }
  }
  function add_render_callback(fn) {
    render_callbacks.push(fn);
  }
  function flush() {
    if (flushidx !== 0) {
      return;
    }
    const saved_component = current_component;
    do {
      try {
        while (flushidx < dirty_components.length) {
          const component = dirty_components[flushidx];
          flushidx++;
          set_current_component(component);
          update(component.$$);
        }
      } catch (e) {
        dirty_components.length = 0;
        flushidx = 0;
        throw e;
      }
      set_current_component(null);
      dirty_components.length = 0;
      flushidx = 0;
      while (binding_callbacks.length) binding_callbacks.pop()();
      for (let i = 0; i < render_callbacks.length; i += 1) {
        const callback = render_callbacks[i];
        if (!seen_callbacks.has(callback)) {
          seen_callbacks.add(callback);
          callback();
        }
      }
      render_callbacks.length = 0;
    } while (dirty_components.length);
    while (flush_callbacks.length) {
      flush_callbacks.pop()();
    }
    update_scheduled = false;
    seen_callbacks.clear();
    set_current_component(saved_component);
  }
  function update($$) {
    if ($$.fragment !== null) {
      $$.update();
      run_all($$.before_update);
      const dirty = $$.dirty;
      $$.dirty = [-1];
      $$.fragment && $$.fragment.p($$.ctx, dirty);
      $$.after_update.forEach(add_render_callback);
    }
  }
  function flush_render_callbacks(fns) {
    const filtered = [];
    const targets = [];
    render_callbacks.forEach((c) => fns.indexOf(c) === -1 ? filtered.push(c) : targets.push(c));
    targets.forEach((c) => c());
    render_callbacks = filtered;
  }
  var dirty_components, binding_callbacks, render_callbacks, flush_callbacks, resolved_promise, update_scheduled, seen_callbacks, flushidx;
  var init_scheduler = __esm({
    "../../../builds/nstorn/warhelper/node_modules/svelte/src/runtime/internal/scheduler.js"() {
      init_utils();
      init_lifecycle();
      dirty_components = [];
      binding_callbacks = [];
      render_callbacks = [];
      flush_callbacks = [];
      resolved_promise = /* @__PURE__ */ Promise.resolve();
      update_scheduled = false;
      seen_callbacks = /* @__PURE__ */ new Set();
      flushidx = 0;
    }
  });

  // ../../../builds/nstorn/warhelper/node_modules/svelte/src/runtime/internal/transitions.js
  function transition_in(block, local) {
    if (block && block.i) {
      outroing.delete(block);
      block.i(local);
    }
  }
  var outroing;
  var init_transitions = __esm({
    "../../../builds/nstorn/warhelper/node_modules/svelte/src/runtime/internal/transitions.js"() {
      init_utils();
      init_environment();
      init_loop();
      init_style_manager();
      init_dom();
      init_scheduler();
      outroing = /* @__PURE__ */ new Set();
    }
  });

  // ../../../builds/nstorn/warhelper/node_modules/svelte/src/runtime/internal/await_block.js
  var init_await_block = __esm({
    "../../../builds/nstorn/warhelper/node_modules/svelte/src/runtime/internal/await_block.js"() {
      init_utils();
      init_transitions();
      init_scheduler();
      init_lifecycle();
    }
  });

  // ../../../builds/nstorn/warhelper/node_modules/svelte/src/runtime/internal/each.js
  function ensure_array_like(array_like_or_iterator) {
    return array_like_or_iterator?.length !== void 0 ? array_like_or_iterator : Array.from(array_like_or_iterator);
  }
  function destroy_block(block, lookup) {
    block.d(1);
    lookup.delete(block.key);
  }
  function update_keyed_each(old_blocks, dirty, get_key, dynamic, ctx, list, lookup, node, destroy, create_each_block2, next, get_context) {
    let o = old_blocks.length;
    let n = list.length;
    let i = o;
    const old_indexes = {};
    while (i--) old_indexes[old_blocks[i].key] = i;
    const new_blocks = [];
    const new_lookup = /* @__PURE__ */ new Map();
    const deltas = /* @__PURE__ */ new Map();
    const updates = [];
    i = n;
    while (i--) {
      const child_ctx = get_context(ctx, list, i);
      const key = get_key(child_ctx);
      let block = lookup.get(key);
      if (!block) {
        block = create_each_block2(key, child_ctx);
        block.c();
      } else if (dynamic) {
        updates.push(() => block.p(child_ctx, dirty));
      }
      new_lookup.set(key, new_blocks[i] = block);
      if (key in old_indexes) deltas.set(key, Math.abs(i - old_indexes[key]));
    }
    const will_move = /* @__PURE__ */ new Set();
    const did_move = /* @__PURE__ */ new Set();
    function insert2(block) {
      transition_in(block, 1);
      block.m(node, next);
      lookup.set(block.key, block);
      next = block.first;
      n--;
    }
    while (o && n) {
      const new_block = new_blocks[n - 1];
      const old_block = old_blocks[o - 1];
      const new_key = new_block.key;
      const old_key = old_block.key;
      if (new_block === old_block) {
        next = new_block.first;
        o--;
        n--;
      } else if (!new_lookup.has(old_key)) {
        destroy(old_block, lookup);
        o--;
      } else if (!lookup.has(new_key) || will_move.has(new_key)) {
        insert2(new_block);
      } else if (did_move.has(old_key)) {
        o--;
      } else if (deltas.get(new_key) > deltas.get(old_key)) {
        did_move.add(new_key);
        insert2(new_block);
      } else {
        will_move.add(old_key);
        o--;
      }
    }
    while (o--) {
      const old_block = old_blocks[o];
      if (!new_lookup.has(old_block.key)) destroy(old_block, lookup);
    }
    while (n) insert2(new_blocks[n - 1]);
    run_all(updates);
    return new_blocks;
  }
  var init_each = __esm({
    "../../../builds/nstorn/warhelper/node_modules/svelte/src/runtime/internal/each.js"() {
      init_transitions();
      init_utils();
    }
  });

  // ../../../builds/nstorn/warhelper/node_modules/svelte/src/runtime/internal/spread.js
  var init_spread = __esm({
    "../../../builds/nstorn/warhelper/node_modules/svelte/src/runtime/internal/spread.js"() {
    }
  });

  // ../../../builds/nstorn/warhelper/node_modules/svelte/src/shared/boolean_attributes.js
  var _boolean_attributes, boolean_attributes;
  var init_boolean_attributes = __esm({
    "../../../builds/nstorn/warhelper/node_modules/svelte/src/shared/boolean_attributes.js"() {
      _boolean_attributes = /** @type {const} */
      [
        "allowfullscreen",
        "allowpaymentrequest",
        "async",
        "autofocus",
        "autoplay",
        "checked",
        "controls",
        "default",
        "defer",
        "disabled",
        "formnovalidate",
        "hidden",
        "inert",
        "ismap",
        "loop",
        "multiple",
        "muted",
        "nomodule",
        "novalidate",
        "open",
        "playsinline",
        "readonly",
        "required",
        "reversed",
        "selected"
      ];
      boolean_attributes = /* @__PURE__ */ new Set([..._boolean_attributes]);
    }
  });

  // ../../../builds/nstorn/warhelper/node_modules/svelte/src/shared/utils/escape.js
  var init_escape = __esm({
    "../../../builds/nstorn/warhelper/node_modules/svelte/src/shared/utils/escape.js"() {
    }
  });

  // ../../../builds/nstorn/warhelper/node_modules/svelte/src/shared/utils/names.js
  var init_names = __esm({
    "../../../builds/nstorn/warhelper/node_modules/svelte/src/shared/utils/names.js"() {
    }
  });

  // ../../../builds/nstorn/warhelper/node_modules/svelte/src/runtime/internal/ssr.js
  var init_ssr = __esm({
    "../../../builds/nstorn/warhelper/node_modules/svelte/src/runtime/internal/ssr.js"() {
      init_lifecycle();
      init_utils();
      init_boolean_attributes();
      init_each();
      init_escape();
      init_names();
    }
  });

  // ../../../builds/nstorn/warhelper/node_modules/svelte/src/runtime/internal/Component.js
  function mount_component(component, target, anchor) {
    const { fragment, after_update } = component.$$;
    fragment && fragment.m(target, anchor);
    add_render_callback(() => {
      const new_on_destroy = component.$$.on_mount.map(run).filter(is_function);
      if (component.$$.on_destroy) {
        component.$$.on_destroy.push(...new_on_destroy);
      } else {
        run_all(new_on_destroy);
      }
      component.$$.on_mount = [];
    });
    after_update.forEach(add_render_callback);
  }
  function destroy_component(component, detaching) {
    const $$ = component.$$;
    if ($$.fragment !== null) {
      flush_render_callbacks($$.after_update);
      run_all($$.on_destroy);
      $$.fragment && $$.fragment.d(detaching);
      $$.on_destroy = $$.fragment = null;
      $$.ctx = [];
    }
  }
  function make_dirty(component, i) {
    if (component.$$.dirty[0] === -1) {
      dirty_components.push(component);
      schedule_update();
      component.$$.dirty.fill(0);
    }
    component.$$.dirty[i / 31 | 0] |= 1 << i % 31;
  }
  function init(component, options, instance2, create_fragment2, not_equal, props, append_styles = null, dirty = [-1]) {
    const parent_component = current_component;
    set_current_component(component);
    const $$ = component.$$ = {
      fragment: null,
      ctx: [],
      // state
      props,
      update: noop,
      not_equal,
      bound: blank_object(),
      // lifecycle
      on_mount: [],
      on_destroy: [],
      on_disconnect: [],
      before_update: [],
      after_update: [],
      context: new Map(options.context || (parent_component ? parent_component.$$.context : [])),
      // everything else
      callbacks: blank_object(),
      dirty,
      skip_bound: false,
      root: options.target || parent_component.$$.root
    };
    append_styles && append_styles($$.root);
    let ready = false;
    $$.ctx = instance2 ? instance2(component, options.props || {}, (i, ret, ...rest) => {
      const value = rest.length ? rest[0] : ret;
      if ($$.ctx && not_equal($$.ctx[i], $$.ctx[i] = value)) {
        if (!$$.skip_bound && $$.bound[i]) $$.bound[i](value);
        if (ready) make_dirty(component, i);
      }
      return ret;
    }) : [];
    $$.update();
    ready = true;
    run_all($$.before_update);
    $$.fragment = create_fragment2 ? create_fragment2($$.ctx) : false;
    if (options.target) {
      if (options.hydrate) {
        start_hydrating();
        const nodes = children(options.target);
        $$.fragment && $$.fragment.l(nodes);
        nodes.forEach(detach);
      } else {
        $$.fragment && $$.fragment.c();
      }
      if (options.intro) transition_in(component.$$.fragment);
      mount_component(component, options.target, options.anchor);
      end_hydrating();
      flush();
    }
    set_current_component(parent_component);
  }
  function get_custom_element_value(prop, value, props_definition, transform) {
    const type = props_definition[prop]?.type;
    value = type === "Boolean" && typeof value !== "boolean" ? value != null : value;
    if (!transform || !props_definition[prop]) {
      return value;
    } else if (transform === "toAttribute") {
      switch (type) {
        case "Object":
        case "Array":
          return value == null ? null : JSON.stringify(value);
        case "Boolean":
          return value ? "" : null;
        case "Number":
          return value == null ? null : value;
        default:
          return value;
      }
    } else {
      switch (type) {
        case "Object":
        case "Array":
          return value && JSON.parse(value);
        case "Boolean":
          return value;
        // conversion already handled above
        case "Number":
          return value != null ? +value : value;
        default:
          return value;
      }
    }
  }
  var SvelteElement, SvelteComponent;
  var init_Component = __esm({
    "../../../builds/nstorn/warhelper/node_modules/svelte/src/runtime/internal/Component.js"() {
      init_scheduler();
      init_lifecycle();
      init_utils();
      init_dom();
      init_transitions();
      if (typeof HTMLElement === "function") {
        SvelteElement = class extends HTMLElement {
          /** The Svelte component constructor */
          $$ctor;
          /** Slots */
          $$s;
          /** The Svelte component instance */
          $$c;
          /** Whether or not the custom element is connected */
          $$cn = false;
          /** Component props data */
          $$d = {};
          /** `true` if currently in the process of reflecting component props back to attributes */
          $$r = false;
          /** @type {Record<string, CustomElementPropDefinition>} Props definition (name, reflected, type etc) */
          $$p_d = {};
          /** @type {Record<string, Function[]>} Event listeners */
          $$l = {};
          /** @type {Map<Function, Function>} Event listener unsubscribe functions */
          $$l_u = /* @__PURE__ */ new Map();
          constructor($$componentCtor, $$slots, use_shadow_dom) {
            super();
            this.$$ctor = $$componentCtor;
            this.$$s = $$slots;
            if (use_shadow_dom) {
              this.attachShadow({ mode: "open" });
            }
          }
          addEventListener(type, listener, options) {
            this.$$l[type] = this.$$l[type] || [];
            this.$$l[type].push(listener);
            if (this.$$c) {
              const unsub = this.$$c.$on(type, listener);
              this.$$l_u.set(listener, unsub);
            }
            super.addEventListener(type, listener, options);
          }
          removeEventListener(type, listener, options) {
            super.removeEventListener(type, listener, options);
            if (this.$$c) {
              const unsub = this.$$l_u.get(listener);
              if (unsub) {
                unsub();
                this.$$l_u.delete(listener);
              }
            }
            if (this.$$l[type]) {
              const idx = this.$$l[type].indexOf(listener);
              if (idx >= 0) {
                this.$$l[type].splice(idx, 1);
              }
            }
          }
          async connectedCallback() {
            this.$$cn = true;
            if (!this.$$c) {
              let create_slot = function(name) {
                return () => {
                  let node;
                  const obj = {
                    c: function create() {
                      node = element("slot");
                      if (name !== "default") {
                        attr(node, "name", name);
                      }
                    },
                    /**
                     * @param {HTMLElement} target
                     * @param {HTMLElement} [anchor]
                     */
                    m: function mount(target, anchor) {
                      insert(target, node, anchor);
                    },
                    d: function destroy(detaching) {
                      if (detaching) {
                        detach(node);
                      }
                    }
                  };
                  return obj;
                };
              };
              await Promise.resolve();
              if (!this.$$cn || this.$$c) {
                return;
              }
              const $$slots = {};
              const existing_slots = get_custom_elements_slots(this);
              for (const name of this.$$s) {
                if (name in existing_slots) {
                  $$slots[name] = [create_slot(name)];
                }
              }
              for (const attribute of this.attributes) {
                const name = this.$$g_p(attribute.name);
                if (!(name in this.$$d)) {
                  this.$$d[name] = get_custom_element_value(name, attribute.value, this.$$p_d, "toProp");
                }
              }
              for (const key in this.$$p_d) {
                if (!(key in this.$$d) && this[key] !== void 0) {
                  this.$$d[key] = this[key];
                  delete this[key];
                }
              }
              this.$$c = new this.$$ctor({
                target: this.shadowRoot || this,
                props: {
                  ...this.$$d,
                  $$slots,
                  $$scope: {
                    ctx: []
                  }
                }
              });
              const reflect_attributes = () => {
                this.$$r = true;
                for (const key in this.$$p_d) {
                  this.$$d[key] = this.$$c.$$.ctx[this.$$c.$$.props[key]];
                  if (this.$$p_d[key].reflect) {
                    const attribute_value = get_custom_element_value(
                      key,
                      this.$$d[key],
                      this.$$p_d,
                      "toAttribute"
                    );
                    if (attribute_value == null) {
                      this.removeAttribute(this.$$p_d[key].attribute || key);
                    } else {
                      this.setAttribute(this.$$p_d[key].attribute || key, attribute_value);
                    }
                  }
                }
                this.$$r = false;
              };
              this.$$c.$$.after_update.push(reflect_attributes);
              reflect_attributes();
              for (const type in this.$$l) {
                for (const listener of this.$$l[type]) {
                  const unsub = this.$$c.$on(type, listener);
                  this.$$l_u.set(listener, unsub);
                }
              }
              this.$$l = {};
            }
          }
          // We don't need this when working within Svelte code, but for compatibility of people using this outside of Svelte
          // and setting attributes through setAttribute etc, this is helpful
          attributeChangedCallback(attr2, _oldValue, newValue) {
            if (this.$$r) return;
            attr2 = this.$$g_p(attr2);
            this.$$d[attr2] = get_custom_element_value(attr2, newValue, this.$$p_d, "toProp");
            this.$$c?.$set({ [attr2]: this.$$d[attr2] });
          }
          disconnectedCallback() {
            this.$$cn = false;
            Promise.resolve().then(() => {
              if (!this.$$cn && this.$$c) {
                this.$$c.$destroy();
                this.$$c = void 0;
              }
            });
          }
          $$g_p(attribute_name) {
            return Object.keys(this.$$p_d).find(
              (key) => this.$$p_d[key].attribute === attribute_name || !this.$$p_d[key].attribute && key.toLowerCase() === attribute_name
            ) || attribute_name;
          }
        };
      }
      SvelteComponent = class {
        /**
         * ### PRIVATE API
         *
         * Do not use, may change at any time
         *
         * @type {any}
         */
        $$ = void 0;
        /**
         * ### PRIVATE API
         *
         * Do not use, may change at any time
         *
         * @type {any}
         */
        $$set = void 0;
        /** @returns {void} */
        $destroy() {
          destroy_component(this, 1);
          this.$destroy = noop;
        }
        /**
         * @template {Extract<keyof Events, string>} K
         * @param {K} type
         * @param {((e: Events[K]) => void) | null | undefined} callback
         * @returns {() => void}
         */
        $on(type, callback) {
          if (!is_function(callback)) {
            return noop;
          }
          const callbacks = this.$$.callbacks[type] || (this.$$.callbacks[type] = []);
          callbacks.push(callback);
          return () => {
            const index = callbacks.indexOf(callback);
            if (index !== -1) callbacks.splice(index, 1);
          };
        }
        /**
         * @param {Partial<Props>} props
         * @returns {void}
         */
        $set(props) {
          if (this.$$set && !is_empty(props)) {
            this.$$.skip_bound = true;
            this.$$set(props);
            this.$$.skip_bound = false;
          }
        }
      };
    }
  });

  // ../../../builds/nstorn/warhelper/node_modules/svelte/src/shared/version.js
  var PUBLIC_VERSION;
  var init_version = __esm({
    "../../../builds/nstorn/warhelper/node_modules/svelte/src/shared/version.js"() {
      PUBLIC_VERSION = "4";
    }
  });

  // ../../../builds/nstorn/warhelper/node_modules/svelte/src/runtime/internal/dev.js
  var init_dev = __esm({
    "../../../builds/nstorn/warhelper/node_modules/svelte/src/runtime/internal/dev.js"() {
      init_dom();
      init_Component();
      init_names();
      init_version();
      init_utils();
      init_each();
    }
  });

  // ../../../builds/nstorn/warhelper/node_modules/svelte/src/runtime/internal/index.js
  var init_internal = __esm({
    "../../../builds/nstorn/warhelper/node_modules/svelte/src/runtime/internal/index.js"() {
      init_animations();
      init_await_block();
      init_dom();
      init_environment();
      init_globals();
      init_each();
      init_lifecycle();
      init_loop();
      init_scheduler();
      init_spread();
      init_ssr();
      init_transitions();
      init_utils();
      init_Component();
      init_dev();
    }
  });

  // ../../../builds/nstorn/warhelper/node_modules/svelte/src/runtime/internal/disclose-version/index.js
  var init_disclose_version = __esm({
    "../../../builds/nstorn/warhelper/node_modules/svelte/src/runtime/internal/disclose-version/index.js"() {
      init_version();
      if (typeof window !== "undefined")
        (window.__svelte || (window.__svelte = { v: /* @__PURE__ */ new Set() })).v.add(PUBLIC_VERSION);
    }
  });

  // ../../../builds/nstorn/warhelper/node_modules/svelte/src/runtime/index.js
  var init_runtime = __esm({
    "../../../builds/nstorn/warhelper/node_modules/svelte/src/runtime/index.js"() {
      init_internal();
    }
  });

  // src/WarOverviewView.svelte
  function get_each_context(ctx, list, i) {
    const child_ctx = ctx.slice();
    child_ctx[54] = list[i];
    const constants_0 = (
      /*state*/
      child_ctx[0].tables[
        /*side*/
        child_ctx[54]
      ]
    );
    child_ctx[55] = constants_0;
    return child_ctx;
  }
  function get_each_context_1(ctx, list, i) {
    const child_ctx = ctx.slice();
    child_ctx[58] = list[i];
    return child_ctx;
  }
  function get_each_context_2(ctx, list, i) {
    const child_ctx = ctx.slice();
    child_ctx[61] = list[i];
    return child_ctx;
  }
  function get_each_context_3(ctx, list, i) {
    const child_ctx = ctx.slice();
    child_ctx[61] = list[i];
    return child_ctx;
  }
  function get_each_context_4(ctx, list, i) {
    const child_ctx = ctx.slice();
    child_ctx[66] = list[i];
    return child_ctx;
  }
  function get_each_context_5(ctx, list, i) {
    const child_ctx = ctx.slice();
    child_ctx[54] = list[i];
    const constants_0 = (
      /*state*/
      child_ctx[0].tables[
        /*side*/
        child_ctx[54]
      ]
    );
    child_ctx[55] = constants_0;
    return child_ctx;
  }
  function get_each_context_6(ctx, list, i) {
    const child_ctx = ctx.slice();
    child_ctx[72] = list[i];
    return child_ctx;
  }
  function get_each_context_7(ctx, list, i) {
    const child_ctx = ctx.slice();
    child_ctx[75] = list[i];
    return child_ctx;
  }
  function get_each_context_8(ctx, list, i) {
    const child_ctx = ctx.slice();
    child_ctx[75] = list[i];
    return child_ctx;
  }
  function get_if_ctx(ctx) {
    const child_ctx = ctx.slice();
    const constants_0 = (
      /*state*/
      child_ctx[0].decayGraph
    );
    child_ctx[71] = constants_0;
    return child_ctx;
  }
  function get_if_ctx_1(ctx) {
    const child_ctx = ctx.slice();
    const constants_0 = (
      /*state*/
      child_ctx[0].loadoutPrefetch
    );
    child_ctx[80] = constants_0;
    return child_ctx;
  }
  function create_if_block_40(ctx) {
    let span2;
    let t0;
    let span0;
    let t1_value = (
      /*prefetch*/
      ctx[80].paused ? "Loadout prefetch paused" : "Prefetching loadouts..."
    );
    let t1;
    let t2;
    let span1;
    let t3_value = (
      /*prefetch*/
      ctx[80].done + ""
    );
    let t3;
    let t4;
    let t5_value = (
      /*prefetch*/
      ctx[80].total + ""
    );
    let t5;
    let if_block = !/*prefetch*/
    ctx[80].paused && create_if_block_41(ctx);
    return {
      c() {
        span2 = element("span");
        if (if_block) if_block.c();
        t0 = space();
        span0 = element("span");
        t1 = text(t1_value);
        t2 = space();
        span1 = element("span");
        t3 = text(t3_value);
        t4 = text("/");
        t5 = text(t5_value);
        attr(span1, "class", "__warhelper_war_overview_prefetch-count");
        attr(span2, "class", "__warhelper_war_overview_prefetch");
        attr(span2, "title", "Fetching the enemy faction's stored loadouts: players done / queued");
      },
      m(target, anchor) {
        insert(target, span2, anchor);
        if (if_block) if_block.m(span2, null);
        append(span2, t0);
        append(span2, span0);
        append(span0, t1);
        append(span2, t2);
        append(span2, span1);
        append(span1, t3);
        append(span1, t4);
        append(span1, t5);
      },
      p(ctx2, dirty) {
        if (!/*prefetch*/
        ctx2[80].paused) {
          if (if_block) {
          } else {
            if_block = create_if_block_41(ctx2);
            if_block.c();
            if_block.m(span2, t0);
          }
        } else if (if_block) {
          if_block.d(1);
          if_block = null;
        }
        if (dirty[0] & /*state*/
        1 && t1_value !== (t1_value = /*prefetch*/
        ctx2[80].paused ? "Loadout prefetch paused" : "Prefetching loadouts...")) set_data(t1, t1_value);
        if (dirty[0] & /*state*/
        1 && t3_value !== (t3_value = /*prefetch*/
        ctx2[80].done + "")) set_data(t3, t3_value);
        if (dirty[0] & /*state*/
        1 && t5_value !== (t5_value = /*prefetch*/
        ctx2[80].total + "")) set_data(t5, t5_value);
      },
      d(detaching) {
        if (detaching) {
          detach(span2);
        }
        if (if_block) if_block.d();
      }
    };
  }
  function create_if_block_41(ctx) {
    let span;
    return {
      c() {
        span = element("span");
        attr(span, "class", "__warhelper_war_overview_prefetch-spinner");
        attr(span, "aria-hidden", "true");
      },
      m(target, anchor) {
        insert(target, span, anchor);
      },
      d(detaching) {
        if (detaching) {
          detach(span);
        }
      }
    };
  }
  function create_if_block_39(ctx) {
    let a;
    let t;
    let a_href_value;
    let a_title_value;
    return {
      c() {
        a = element("a");
        t = text("Update available");
        attr(a, "class", "__warhelper_war_overview_update");
        attr(a, "href", a_href_value = /*state*/
        ctx[0].update.url);
        attr(a, "target", "_blank");
        attr(a, "rel", "noopener");
        attr(a, "title", a_title_value = "Version " + /*state*/
        ctx[0].update.version + " is out. Click to install it.");
      },
      m(target, anchor) {
        insert(target, a, anchor);
        append(a, t);
      },
      p(ctx2, dirty) {
        if (dirty[0] & /*state*/
        1 && a_href_value !== (a_href_value = /*state*/
        ctx2[0].update.url)) {
          attr(a, "href", a_href_value);
        }
        if (dirty[0] & /*state*/
        1 && a_title_value !== (a_title_value = "Version " + /*state*/
        ctx2[0].update.version + " is out. Click to install it.")) {
          attr(a, "title", a_title_value);
        }
      },
      d(detaching) {
        if (detaching) {
          detach(a);
        }
      }
    };
  }
  function create_if_block_38(ctx) {
    let button;
    let mounted;
    let dispose;
    return {
      c() {
        button = element("button");
        button.textContent = "\u21BB Updates missed while away - click to refresh";
        attr(button, "class", "__warhelper_war_overview_missed");
        attr(button, "type", "button");
      },
      m(target, anchor) {
        insert(target, button, anchor);
        if (!mounted) {
          dispose = listen(
            button,
            "click",
            /*click_handler_1*/
            ctx[23]
          );
          mounted = true;
        }
      },
      p: noop,
      d(detaching) {
        if (detaching) {
          detach(button);
        }
        mounted = false;
        dispose();
      }
    };
  }
  function create_else_block_1(ctx) {
    let span;
    return {
      c() {
        span = element("span");
        span.textContent = "Waiting for war status";
        attr(span, "class", "__warhelper_war_overview_decay-empty");
      },
      m(target, anchor) {
        insert(target, span, anchor);
      },
      p: noop,
      d(detaching) {
        if (detaching) {
          detach(span);
        }
      }
    };
  }
  function create_if_block_36(ctx) {
    let span2;
    let span0;
    let t0_value = (
      /*state*/
      ctx[0].decayEnd.label + ""
    );
    let t0;
    let t1;
    let span1;
    let t2_value = (
      /*state*/
      ctx[0].decayEnd.timer + ""
    );
    let t2;
    let t3;
    let if_block = (
      /*state*/
      ctx[0].decayEnd.showDates && create_if_block_37(ctx)
    );
    return {
      c() {
        span2 = element("span");
        span0 = element("span");
        t0 = text(t0_value);
        t1 = space();
        span1 = element("span");
        t2 = text(t2_value);
        t3 = space();
        if (if_block) if_block.c();
        attr(span0, "class", "__warhelper_war_overview_decay-label");
        attr(span1, "class", "__warhelper_war_overview_decay-timer");
        attr(span2, "class", "__warhelper_war_overview_decay-summary");
      },
      m(target, anchor) {
        insert(target, span2, anchor);
        append(span2, span0);
        append(span0, t0);
        append(span2, t1);
        append(span2, span1);
        append(span1, t2);
        append(span2, t3);
        if (if_block) if_block.m(span2, null);
      },
      p(ctx2, dirty) {
        if (dirty[0] & /*state*/
        1 && t0_value !== (t0_value = /*state*/
        ctx2[0].decayEnd.label + "")) set_data(t0, t0_value);
        if (dirty[0] & /*state*/
        1 && t2_value !== (t2_value = /*state*/
        ctx2[0].decayEnd.timer + "")) set_data(t2, t2_value);
        if (
          /*state*/
          ctx2[0].decayEnd.showDates
        ) {
          if (if_block) {
            if_block.p(ctx2, dirty);
          } else {
            if_block = create_if_block_37(ctx2);
            if_block.c();
            if_block.m(span2, null);
          }
        } else if (if_block) {
          if_block.d(1);
          if_block = null;
        }
      },
      d(detaching) {
        if (detaching) {
          detach(span2);
        }
        if (if_block) if_block.d();
      }
    };
  }
  function create_if_block_37(ctx) {
    let span0;
    let t1;
    let span1;
    let t2_value = (
      /*state*/
      ctx[0].decayEnd.utcTime + ""
    );
    let t2;
    let t3;
    let span2;
    let t5;
    let span3;
    let t6_value = (
      /*state*/
      ctx[0].decayEnd.localTime + ""
    );
    let t6;
    return {
      c() {
        span0 = element("span");
        span0.textContent = "-";
        t1 = space();
        span1 = element("span");
        t2 = text(t2_value);
        t3 = space();
        span2 = element("span");
        span2.textContent = "/";
        t5 = space();
        span3 = element("span");
        t6 = text(t6_value);
      },
      m(target, anchor) {
        insert(target, span0, anchor);
        insert(target, t1, anchor);
        insert(target, span1, anchor);
        append(span1, t2);
        insert(target, t3, anchor);
        insert(target, span2, anchor);
        insert(target, t5, anchor);
        insert(target, span3, anchor);
        append(span3, t6);
      },
      p(ctx2, dirty) {
        if (dirty[0] & /*state*/
        1 && t2_value !== (t2_value = /*state*/
        ctx2[0].decayEnd.utcTime + "")) set_data(t2, t2_value);
        if (dirty[0] & /*state*/
        1 && t6_value !== (t6_value = /*state*/
        ctx2[0].decayEnd.localTime + "")) set_data(t6, t6_value);
      },
      d(detaching) {
        if (detaching) {
          detach(span0);
          detach(t1);
          detach(span1);
          detach(t3);
          detach(span2);
          detach(t5);
          detach(span3);
        }
      }
    };
  }
  function create_if_block_35(ctx) {
    let span;
    let t_value = (
      /*state*/
      ctx[0].decayGraph.expanded ? "^" : "v"
    );
    let t;
    return {
      c() {
        span = element("span");
        t = text(t_value);
        attr(span, "class", "__warhelper_war_overview_decay-toggle");
      },
      m(target, anchor) {
        insert(target, span, anchor);
        append(span, t);
      },
      p(ctx2, dirty) {
        if (dirty[0] & /*state*/
        1 && t_value !== (t_value = /*state*/
        ctx2[0].decayGraph.expanded ? "^" : "v")) set_data(t, t_value);
      },
      d(detaching) {
        if (detaching) {
          detach(span);
        }
      }
    };
  }
  function create_if_block_28(ctx) {
    let div;
    function select_block_type_1(ctx2, dirty) {
      if (
        /*graph*/
        ctx2[71].hasData
      ) return create_if_block_29;
      return create_else_block;
    }
    let current_block_type = select_block_type_1(ctx, [-1, -1, -1]);
    let if_block = current_block_type(ctx);
    return {
      c() {
        div = element("div");
        if_block.c();
        attr(div, "class", "__warhelper_war_overview_graph");
      },
      m(target, anchor) {
        insert(target, div, anchor);
        if_block.m(div, null);
      },
      p(ctx2, dirty) {
        if (current_block_type === (current_block_type = select_block_type_1(ctx2, dirty)) && if_block) {
          if_block.p(ctx2, dirty);
        } else {
          if_block.d(1);
          if_block = current_block_type(ctx2);
          if (if_block) {
            if_block.c();
            if_block.m(div, null);
          }
        }
      },
      d(detaching) {
        if (detaching) {
          detach(div);
        }
        if_block.d();
      }
    };
  }
  function create_else_block(ctx) {
    let div;
    return {
      c() {
        div = element("div");
        div.textContent = "Waiting for graph data";
        attr(div, "class", "__warhelper_war_overview_graph-empty");
      },
      m(target, anchor) {
        insert(target, div, anchor);
      },
      p: noop,
      d(detaching) {
        if (detaching) {
          detach(div);
        }
      }
    };
  }
  function create_if_block_29(ctx) {
    let svg;
    let rect0;
    let rect0_x_value;
    let rect0_y_value;
    let rect0_width_value;
    let rect0_height_value;
    let rect1;
    let rect1_x_value;
    let rect1_y_value;
    let rect1_width_value;
    let rect1_height_value;
    let rect2;
    let rect2_x_value;
    let rect2_y_value;
    let rect2_width_value;
    let rect2_height_value;
    let each0_anchor;
    let line;
    let line_x__value;
    let line_x__value_1;
    let line_y__value;
    let line_y__value_1;
    let text0;
    let t0;
    let text0_y_value;
    let text0_transform_value;
    let text1;
    let t1;
    let text1_x_value;
    let text1_y_value;
    let if_block0_anchor;
    let if_block1_anchor;
    let text2;
    let t2_value = (
      /*graph*/
      ctx[71].ownFactionName + ""
    );
    let t2;
    let text2_x_value;
    let text2_y_value;
    let text3;
    let t3_value = (
      /*graph*/
      ctx[71].enemyFactionName + ""
    );
    let t3;
    let text3_x_value;
    let text3_y_value;
    let svg_viewBox_value;
    let mounted;
    let dispose;
    let each_value_8 = ensure_array_like(
      /*graph*/
      ctx[71].yLabels
    );
    let each_blocks_2 = [];
    for (let i = 0; i < each_value_8.length; i += 1) {
      each_blocks_2[i] = create_each_block_8(get_each_context_8(ctx, each_value_8, i));
    }
    let each_value_7 = ensure_array_like(
      /*graph*/
      ctx[71].xLabels
    );
    let each_blocks_1 = [];
    for (let i = 0; i < each_value_7.length; i += 1) {
      each_blocks_1[i] = create_each_block_7(get_each_context_7(ctx, each_value_7, i));
    }
    let if_block0 = (
      /*graph*/
      ctx[71].goalPositivePoints && create_if_block_34(ctx)
    );
    let if_block1 = (
      /*graph*/
      ctx[71].goalNegativePoints && create_if_block_33(ctx)
    );
    let each_value_6 = ensure_array_like(
      /*graph*/
      ctx[71].scoreSegments
    );
    let each_blocks = [];
    for (let i = 0; i < each_value_6.length; i += 1) {
      each_blocks[i] = create_each_block_6(get_each_context_6(ctx, each_value_6, i));
    }
    let if_block2 = (
      /*graphHover*/
      ctx[2] && create_if_block_30(ctx)
    );
    function pointermove_handler(...args) {
      return (
        /*pointermove_handler*/
        ctx[25](
          /*graph*/
          ctx[71],
          ...args
        )
      );
    }
    return {
      c() {
        svg = svg_element("svg");
        rect0 = svg_element("rect");
        rect1 = svg_element("rect");
        rect2 = svg_element("rect");
        for (let i = 0; i < each_blocks_2.length; i += 1) {
          each_blocks_2[i].c();
        }
        each0_anchor = empty();
        for (let i = 0; i < each_blocks_1.length; i += 1) {
          each_blocks_1[i].c();
        }
        line = svg_element("line");
        text0 = svg_element("text");
        t0 = text("Score");
        text1 = svg_element("text");
        t1 = text("Time");
        if (if_block0) if_block0.c();
        if_block0_anchor = empty();
        if (if_block1) if_block1.c();
        if_block1_anchor = empty();
        for (let i = 0; i < each_blocks.length; i += 1) {
          each_blocks[i].c();
        }
        text2 = svg_element("text");
        t2 = text(t2_value);
        text3 = svg_element("text");
        t3 = text(t3_value);
        if (if_block2) if_block2.c();
        attr(rect0, "class", "__warhelper_war_overview_graph-bg");
        attr(rect0, "x", rect0_x_value = /*graph*/
        ctx[71].plotX);
        attr(rect0, "y", rect0_y_value = /*graph*/
        ctx[71].plotY);
        attr(rect0, "width", rect0_width_value = /*graph*/
        ctx[71].plotWidth);
        attr(rect0, "height", rect0_height_value = /*graph*/
        ctx[71].plotHeight);
        attr(rect1, "class", "__warhelper_war_overview_graph-positive-bg");
        attr(rect1, "x", rect1_x_value = /*graph*/
        ctx[71].plotX);
        attr(rect1, "y", rect1_y_value = /*graph*/
        ctx[71].plotY);
        attr(rect1, "width", rect1_width_value = /*graph*/
        ctx[71].plotWidth);
        attr(rect1, "height", rect1_height_value = /*graph*/
        ctx[71].zeroY - /*graph*/
        ctx[71].plotY);
        attr(rect2, "class", "__warhelper_war_overview_graph-negative-bg");
        attr(rect2, "x", rect2_x_value = /*graph*/
        ctx[71].plotX);
        attr(rect2, "y", rect2_y_value = /*graph*/
        ctx[71].zeroY);
        attr(rect2, "width", rect2_width_value = /*graph*/
        ctx[71].plotWidth);
        attr(rect2, "height", rect2_height_value = /*graph*/
        ctx[71].plotY + /*graph*/
        ctx[71].plotHeight - /*graph*/
        ctx[71].zeroY);
        attr(line, "class", "__warhelper_war_overview_graph-zero");
        attr(line, "x1", line_x__value = /*graph*/
        ctx[71].plotX);
        attr(line, "x2", line_x__value_1 = /*graph*/
        ctx[71].plotX + /*graph*/
        ctx[71].plotWidth);
        attr(line, "y1", line_y__value = /*graph*/
        ctx[71].zeroY);
        attr(line, "y2", line_y__value_1 = /*graph*/
        ctx[71].zeroY);
        attr(text0, "class", "__warhelper_war_overview_graph-axis-title");
        attr(text0, "x", "11");
        attr(text0, "y", text0_y_value = /*graph*/
        ctx[71].plotY + /*graph*/
        ctx[71].plotHeight / 2);
        attr(text0, "text-anchor", "middle");
        attr(text0, "transform", text0_transform_value = `rotate(-90 11 ${/*graph*/
        ctx[71].plotY + /*graph*/
        ctx[71].plotHeight / 2})`);
        attr(text1, "class", "__warhelper_war_overview_graph-axis-title");
        attr(text1, "x", text1_x_value = /*graph*/
        ctx[71].plotX + /*graph*/
        ctx[71].plotWidth / 2);
        attr(text1, "y", text1_y_value = /*graph*/
        ctx[71].height - 7);
        attr(text1, "text-anchor", "middle");
        attr(text2, "class", "__warhelper_war_overview_graph-faction-label __warhelper_war_overview_graph-faction-label-positive");
        attr(text2, "x", text2_x_value = /*graph*/
        ctx[71].plotX + /*graph*/
        ctx[71].plotWidth / 2);
        attr(text2, "y", text2_y_value = /*graph*/
        ctx[71].plotY + /*graph*/
        ctx[71].plotHeight * 0.22);
        attr(text3, "class", "__warhelper_war_overview_graph-faction-label __warhelper_war_overview_graph-faction-label-negative");
        attr(text3, "x", text3_x_value = /*graph*/
        ctx[71].plotX + /*graph*/
        ctx[71].plotWidth / 2);
        attr(text3, "y", text3_y_value = /*graph*/
        ctx[71].plotY + /*graph*/
        ctx[71].plotHeight * 0.78);
        attr(svg, "class", "__warhelper_war_overview_graph-svg");
        attr(svg, "viewBox", svg_viewBox_value = `0 0 ${/*graph*/
        ctx[71].width} ${/*graph*/
        ctx[71].height}`);
        attr(svg, "role", "img");
        attr(svg, "aria-label", "War score graph");
      },
      m(target, anchor) {
        insert(target, svg, anchor);
        append(svg, rect0);
        append(svg, rect1);
        append(svg, rect2);
        for (let i = 0; i < each_blocks_2.length; i += 1) {
          if (each_blocks_2[i]) {
            each_blocks_2[i].m(svg, null);
          }
        }
        append(svg, each0_anchor);
        for (let i = 0; i < each_blocks_1.length; i += 1) {
          if (each_blocks_1[i]) {
            each_blocks_1[i].m(svg, null);
          }
        }
        append(svg, line);
        append(svg, text0);
        append(text0, t0);
        append(svg, text1);
        append(text1, t1);
        if (if_block0) if_block0.m(svg, null);
        append(svg, if_block0_anchor);
        if (if_block1) if_block1.m(svg, null);
        append(svg, if_block1_anchor);
        for (let i = 0; i < each_blocks.length; i += 1) {
          if (each_blocks[i]) {
            each_blocks[i].m(svg, null);
          }
        }
        append(svg, text2);
        append(text2, t2);
        append(svg, text3);
        append(text3, t3);
        if (if_block2) if_block2.m(svg, null);
        if (!mounted) {
          dispose = [
            listen(svg, "pointermove", pointermove_handler),
            listen(
              svg,
              "pointerleave",
              /*clearGraphHover*/
              ctx[13]
            )
          ];
          mounted = true;
        }
      },
      p(new_ctx, dirty) {
        ctx = new_ctx;
        if (dirty[0] & /*state*/
        1 && rect0_x_value !== (rect0_x_value = /*graph*/
        ctx[71].plotX)) {
          attr(rect0, "x", rect0_x_value);
        }
        if (dirty[0] & /*state*/
        1 && rect0_y_value !== (rect0_y_value = /*graph*/
        ctx[71].plotY)) {
          attr(rect0, "y", rect0_y_value);
        }
        if (dirty[0] & /*state*/
        1 && rect0_width_value !== (rect0_width_value = /*graph*/
        ctx[71].plotWidth)) {
          attr(rect0, "width", rect0_width_value);
        }
        if (dirty[0] & /*state*/
        1 && rect0_height_value !== (rect0_height_value = /*graph*/
        ctx[71].plotHeight)) {
          attr(rect0, "height", rect0_height_value);
        }
        if (dirty[0] & /*state*/
        1 && rect1_x_value !== (rect1_x_value = /*graph*/
        ctx[71].plotX)) {
          attr(rect1, "x", rect1_x_value);
        }
        if (dirty[0] & /*state*/
        1 && rect1_y_value !== (rect1_y_value = /*graph*/
        ctx[71].plotY)) {
          attr(rect1, "y", rect1_y_value);
        }
        if (dirty[0] & /*state*/
        1 && rect1_width_value !== (rect1_width_value = /*graph*/
        ctx[71].plotWidth)) {
          attr(rect1, "width", rect1_width_value);
        }
        if (dirty[0] & /*state*/
        1 && rect1_height_value !== (rect1_height_value = /*graph*/
        ctx[71].zeroY - /*graph*/
        ctx[71].plotY)) {
          attr(rect1, "height", rect1_height_value);
        }
        if (dirty[0] & /*state*/
        1 && rect2_x_value !== (rect2_x_value = /*graph*/
        ctx[71].plotX)) {
          attr(rect2, "x", rect2_x_value);
        }
        if (dirty[0] & /*state*/
        1 && rect2_y_value !== (rect2_y_value = /*graph*/
        ctx[71].zeroY)) {
          attr(rect2, "y", rect2_y_value);
        }
        if (dirty[0] & /*state*/
        1 && rect2_width_value !== (rect2_width_value = /*graph*/
        ctx[71].plotWidth)) {
          attr(rect2, "width", rect2_width_value);
        }
        if (dirty[0] & /*state*/
        1 && rect2_height_value !== (rect2_height_value = /*graph*/
        ctx[71].plotY + /*graph*/
        ctx[71].plotHeight - /*graph*/
        ctx[71].zeroY)) {
          attr(rect2, "height", rect2_height_value);
        }
        if (dirty[0] & /*state*/
        1) {
          each_value_8 = ensure_array_like(
            /*graph*/
            ctx[71].yLabels
          );
          let i;
          for (i = 0; i < each_value_8.length; i += 1) {
            const child_ctx = get_each_context_8(ctx, each_value_8, i);
            if (each_blocks_2[i]) {
              each_blocks_2[i].p(child_ctx, dirty);
            } else {
              each_blocks_2[i] = create_each_block_8(child_ctx);
              each_blocks_2[i].c();
              each_blocks_2[i].m(svg, each0_anchor);
            }
          }
          for (; i < each_blocks_2.length; i += 1) {
            each_blocks_2[i].d(1);
          }
          each_blocks_2.length = each_value_8.length;
        }
        if (dirty[0] & /*state*/
        1) {
          each_value_7 = ensure_array_like(
            /*graph*/
            ctx[71].xLabels
          );
          let i;
          for (i = 0; i < each_value_7.length; i += 1) {
            const child_ctx = get_each_context_7(ctx, each_value_7, i);
            if (each_blocks_1[i]) {
              each_blocks_1[i].p(child_ctx, dirty);
            } else {
              each_blocks_1[i] = create_each_block_7(child_ctx);
              each_blocks_1[i].c();
              each_blocks_1[i].m(svg, line);
            }
          }
          for (; i < each_blocks_1.length; i += 1) {
            each_blocks_1[i].d(1);
          }
          each_blocks_1.length = each_value_7.length;
        }
        if (dirty[0] & /*state*/
        1 && line_x__value !== (line_x__value = /*graph*/
        ctx[71].plotX)) {
          attr(line, "x1", line_x__value);
        }
        if (dirty[0] & /*state*/
        1 && line_x__value_1 !== (line_x__value_1 = /*graph*/
        ctx[71].plotX + /*graph*/
        ctx[71].plotWidth)) {
          attr(line, "x2", line_x__value_1);
        }
        if (dirty[0] & /*state*/
        1 && line_y__value !== (line_y__value = /*graph*/
        ctx[71].zeroY)) {
          attr(line, "y1", line_y__value);
        }
        if (dirty[0] & /*state*/
        1 && line_y__value_1 !== (line_y__value_1 = /*graph*/
        ctx[71].zeroY)) {
          attr(line, "y2", line_y__value_1);
        }
        if (dirty[0] & /*state*/
        1 && text0_y_value !== (text0_y_value = /*graph*/
        ctx[71].plotY + /*graph*/
        ctx[71].plotHeight / 2)) {
          attr(text0, "y", text0_y_value);
        }
        if (dirty[0] & /*state*/
        1 && text0_transform_value !== (text0_transform_value = `rotate(-90 11 ${/*graph*/
        ctx[71].plotY + /*graph*/
        ctx[71].plotHeight / 2})`)) {
          attr(text0, "transform", text0_transform_value);
        }
        if (dirty[0] & /*state*/
        1 && text1_x_value !== (text1_x_value = /*graph*/
        ctx[71].plotX + /*graph*/
        ctx[71].plotWidth / 2)) {
          attr(text1, "x", text1_x_value);
        }
        if (dirty[0] & /*state*/
        1 && text1_y_value !== (text1_y_value = /*graph*/
        ctx[71].height - 7)) {
          attr(text1, "y", text1_y_value);
        }
        if (
          /*graph*/
          ctx[71].goalPositivePoints
        ) {
          if (if_block0) {
            if_block0.p(ctx, dirty);
          } else {
            if_block0 = create_if_block_34(ctx);
            if_block0.c();
            if_block0.m(svg, if_block0_anchor);
          }
        } else if (if_block0) {
          if_block0.d(1);
          if_block0 = null;
        }
        if (
          /*graph*/
          ctx[71].goalNegativePoints
        ) {
          if (if_block1) {
            if_block1.p(ctx, dirty);
          } else {
            if_block1 = create_if_block_33(ctx);
            if_block1.c();
            if_block1.m(svg, if_block1_anchor);
          }
        } else if (if_block1) {
          if_block1.d(1);
          if_block1 = null;
        }
        if (dirty[0] & /*state*/
        1) {
          each_value_6 = ensure_array_like(
            /*graph*/
            ctx[71].scoreSegments
          );
          let i;
          for (i = 0; i < each_value_6.length; i += 1) {
            const child_ctx = get_each_context_6(ctx, each_value_6, i);
            if (each_blocks[i]) {
              each_blocks[i].p(child_ctx, dirty);
            } else {
              each_blocks[i] = create_each_block_6(child_ctx);
              each_blocks[i].c();
              each_blocks[i].m(svg, text2);
            }
          }
          for (; i < each_blocks.length; i += 1) {
            each_blocks[i].d(1);
          }
          each_blocks.length = each_value_6.length;
        }
        if (dirty[0] & /*state*/
        1 && t2_value !== (t2_value = /*graph*/
        ctx[71].ownFactionName + "")) set_data(t2, t2_value);
        if (dirty[0] & /*state*/
        1 && text2_x_value !== (text2_x_value = /*graph*/
        ctx[71].plotX + /*graph*/
        ctx[71].plotWidth / 2)) {
          attr(text2, "x", text2_x_value);
        }
        if (dirty[0] & /*state*/
        1 && text2_y_value !== (text2_y_value = /*graph*/
        ctx[71].plotY + /*graph*/
        ctx[71].plotHeight * 0.22)) {
          attr(text2, "y", text2_y_value);
        }
        if (dirty[0] & /*state*/
        1 && t3_value !== (t3_value = /*graph*/
        ctx[71].enemyFactionName + "")) set_data(t3, t3_value);
        if (dirty[0] & /*state*/
        1 && text3_x_value !== (text3_x_value = /*graph*/
        ctx[71].plotX + /*graph*/
        ctx[71].plotWidth / 2)) {
          attr(text3, "x", text3_x_value);
        }
        if (dirty[0] & /*state*/
        1 && text3_y_value !== (text3_y_value = /*graph*/
        ctx[71].plotY + /*graph*/
        ctx[71].plotHeight * 0.78)) {
          attr(text3, "y", text3_y_value);
        }
        if (
          /*graphHover*/
          ctx[2]
        ) {
          if (if_block2) {
            if_block2.p(ctx, dirty);
          } else {
            if_block2 = create_if_block_30(ctx);
            if_block2.c();
            if_block2.m(svg, null);
          }
        } else if (if_block2) {
          if_block2.d(1);
          if_block2 = null;
        }
        if (dirty[0] & /*state*/
        1 && svg_viewBox_value !== (svg_viewBox_value = `0 0 ${/*graph*/
        ctx[71].width} ${/*graph*/
        ctx[71].height}`)) {
          attr(svg, "viewBox", svg_viewBox_value);
        }
      },
      d(detaching) {
        if (detaching) {
          detach(svg);
        }
        destroy_each(each_blocks_2, detaching);
        destroy_each(each_blocks_1, detaching);
        if (if_block0) if_block0.d();
        if (if_block1) if_block1.d();
        destroy_each(each_blocks, detaching);
        if (if_block2) if_block2.d();
        mounted = false;
        run_all(dispose);
      }
    };
  }
  function create_each_block_8(ctx) {
    let line;
    let line_x__value;
    let line_x__value_1;
    let line_y__value;
    let line_y__value_1;
    let text_1;
    let t_value = (
      /*label*/
      ctx[75].text + ""
    );
    let t;
    let text_1_x_value;
    let text_1_y_value;
    return {
      c() {
        line = svg_element("line");
        text_1 = svg_element("text");
        t = text(t_value);
        attr(line, "class", "__warhelper_war_overview_graph-grid");
        attr(line, "x1", line_x__value = /*graph*/
        ctx[71].plotX);
        attr(line, "x2", line_x__value_1 = /*graph*/
        ctx[71].plotX + /*graph*/
        ctx[71].plotWidth);
        attr(line, "y1", line_y__value = /*label*/
        ctx[75].y);
        attr(line, "y2", line_y__value_1 = /*label*/
        ctx[75].y);
        attr(text_1, "class", "__warhelper_war_overview_graph-axis-label");
        attr(text_1, "x", text_1_x_value = /*graph*/
        ctx[71].plotX - 10);
        attr(text_1, "y", text_1_y_value = /*label*/
        ctx[75].y + 4);
        attr(text_1, "text-anchor", "end");
      },
      m(target, anchor) {
        insert(target, line, anchor);
        insert(target, text_1, anchor);
        append(text_1, t);
      },
      p(ctx2, dirty) {
        if (dirty[0] & /*state*/
        1 && line_x__value !== (line_x__value = /*graph*/
        ctx2[71].plotX)) {
          attr(line, "x1", line_x__value);
        }
        if (dirty[0] & /*state*/
        1 && line_x__value_1 !== (line_x__value_1 = /*graph*/
        ctx2[71].plotX + /*graph*/
        ctx2[71].plotWidth)) {
          attr(line, "x2", line_x__value_1);
        }
        if (dirty[0] & /*state*/
        1 && line_y__value !== (line_y__value = /*label*/
        ctx2[75].y)) {
          attr(line, "y1", line_y__value);
        }
        if (dirty[0] & /*state*/
        1 && line_y__value_1 !== (line_y__value_1 = /*label*/
        ctx2[75].y)) {
          attr(line, "y2", line_y__value_1);
        }
        if (dirty[0] & /*state*/
        1 && t_value !== (t_value = /*label*/
        ctx2[75].text + "")) set_data(t, t_value);
        if (dirty[0] & /*state*/
        1 && text_1_x_value !== (text_1_x_value = /*graph*/
        ctx2[71].plotX - 10)) {
          attr(text_1, "x", text_1_x_value);
        }
        if (dirty[0] & /*state*/
        1 && text_1_y_value !== (text_1_y_value = /*label*/
        ctx2[75].y + 4)) {
          attr(text_1, "y", text_1_y_value);
        }
      },
      d(detaching) {
        if (detaching) {
          detach(line);
          detach(text_1);
        }
      }
    };
  }
  function create_each_block_7(ctx) {
    let line;
    let line_x__value;
    let line_x__value_1;
    let line_y__value;
    let line_y__value_1;
    let text_1;
    let t_value = (
      /*label*/
      ctx[75].text + ""
    );
    let t;
    let text_1_x_value;
    let text_1_y_value;
    return {
      c() {
        line = svg_element("line");
        text_1 = svg_element("text");
        t = text(t_value);
        attr(line, "class", "__warhelper_war_overview_graph-grid");
        attr(line, "x1", line_x__value = /*label*/
        ctx[75].x);
        attr(line, "x2", line_x__value_1 = /*label*/
        ctx[75].x);
        attr(line, "y1", line_y__value = /*graph*/
        ctx[71].plotY);
        attr(line, "y2", line_y__value_1 = /*graph*/
        ctx[71].plotY + /*graph*/
        ctx[71].plotHeight);
        attr(text_1, "class", "__warhelper_war_overview_graph-axis-label");
        attr(text_1, "x", text_1_x_value = /*label*/
        ctx[75].x);
        attr(text_1, "y", text_1_y_value = /*graph*/
        ctx[71].plotY + /*graph*/
        ctx[71].plotHeight + 19);
        attr(text_1, "text-anchor", "middle");
      },
      m(target, anchor) {
        insert(target, line, anchor);
        insert(target, text_1, anchor);
        append(text_1, t);
      },
      p(ctx2, dirty) {
        if (dirty[0] & /*state*/
        1 && line_x__value !== (line_x__value = /*label*/
        ctx2[75].x)) {
          attr(line, "x1", line_x__value);
        }
        if (dirty[0] & /*state*/
        1 && line_x__value_1 !== (line_x__value_1 = /*label*/
        ctx2[75].x)) {
          attr(line, "x2", line_x__value_1);
        }
        if (dirty[0] & /*state*/
        1 && line_y__value !== (line_y__value = /*graph*/
        ctx2[71].plotY)) {
          attr(line, "y1", line_y__value);
        }
        if (dirty[0] & /*state*/
        1 && line_y__value_1 !== (line_y__value_1 = /*graph*/
        ctx2[71].plotY + /*graph*/
        ctx2[71].plotHeight)) {
          attr(line, "y2", line_y__value_1);
        }
        if (dirty[0] & /*state*/
        1 && t_value !== (t_value = /*label*/
        ctx2[75].text + "")) set_data(t, t_value);
        if (dirty[0] & /*state*/
        1 && text_1_x_value !== (text_1_x_value = /*label*/
        ctx2[75].x)) {
          attr(text_1, "x", text_1_x_value);
        }
        if (dirty[0] & /*state*/
        1 && text_1_y_value !== (text_1_y_value = /*graph*/
        ctx2[71].plotY + /*graph*/
        ctx2[71].plotHeight + 19)) {
          attr(text_1, "y", text_1_y_value);
        }
      },
      d(detaching) {
        if (detaching) {
          detach(line);
          detach(text_1);
        }
      }
    };
  }
  function create_if_block_34(ctx) {
    let polyline;
    let polyline_points_value;
    return {
      c() {
        polyline = svg_element("polyline");
        attr(polyline, "class", "__warhelper_war_overview_graph-goal __warhelper_war_overview_graph-goal-positive");
        attr(polyline, "points", polyline_points_value = /*graph*/
        ctx[71].goalPositivePoints);
      },
      m(target, anchor) {
        insert(target, polyline, anchor);
      },
      p(ctx2, dirty) {
        if (dirty[0] & /*state*/
        1 && polyline_points_value !== (polyline_points_value = /*graph*/
        ctx2[71].goalPositivePoints)) {
          attr(polyline, "points", polyline_points_value);
        }
      },
      d(detaching) {
        if (detaching) {
          detach(polyline);
        }
      }
    };
  }
  function create_if_block_33(ctx) {
    let polyline;
    let polyline_points_value;
    return {
      c() {
        polyline = svg_element("polyline");
        attr(polyline, "class", "__warhelper_war_overview_graph-goal __warhelper_war_overview_graph-goal-negative");
        attr(polyline, "points", polyline_points_value = /*graph*/
        ctx[71].goalNegativePoints);
      },
      m(target, anchor) {
        insert(target, polyline, anchor);
      },
      p(ctx2, dirty) {
        if (dirty[0] & /*state*/
        1 && polyline_points_value !== (polyline_points_value = /*graph*/
        ctx2[71].goalNegativePoints)) {
          attr(polyline, "points", polyline_points_value);
        }
      },
      d(detaching) {
        if (detaching) {
          detach(polyline);
        }
      }
    };
  }
  function create_each_block_6(ctx) {
    let polyline;
    let polyline_class_value;
    let polyline_points_value;
    return {
      c() {
        polyline = svg_element("polyline");
        attr(polyline, "class", polyline_class_value = `__warhelper_war_overview_graph-score ${/*segment*/
        ctx[72].positive ? "__warhelper_war_overview_graph-score-positive" : "__warhelper_war_overview_graph-score-negative"}`);
        attr(polyline, "points", polyline_points_value = /*segment*/
        ctx[72].points);
      },
      m(target, anchor) {
        insert(target, polyline, anchor);
      },
      p(ctx2, dirty) {
        if (dirty[0] & /*state*/
        1 && polyline_class_value !== (polyline_class_value = `__warhelper_war_overview_graph-score ${/*segment*/
        ctx2[72].positive ? "__warhelper_war_overview_graph-score-positive" : "__warhelper_war_overview_graph-score-negative"}`)) {
          attr(polyline, "class", polyline_class_value);
        }
        if (dirty[0] & /*state*/
        1 && polyline_points_value !== (polyline_points_value = /*segment*/
        ctx2[72].points)) {
          attr(polyline, "points", polyline_points_value);
        }
      },
      d(detaching) {
        if (detaching) {
          detach(polyline);
        }
      }
    };
  }
  function create_if_block_30(ctx) {
    let line;
    let line_x__value;
    let line_x__value_1;
    let line_y__value;
    let line_y__value_1;
    let circle;
    let circle_cx_value;
    let circle_cy_value;
    let if_block0_anchor;
    let g;
    let rect;
    let text0;
    let t0;
    let t1_value = (
      /*graphHover*/
      ctx[2].winningFactionName + ""
    );
    let t1;
    let text1;
    let t2;
    let t3_value = (
      /*graphHover*/
      ctx[2].scoreDisplay + ""
    );
    let t3;
    let t4;
    let t5_value = (
      /*graphHover*/
      ctx[2].goalDisplay + ""
    );
    let t5;
    let text2;
    let t6_value = (
      /*graphHover*/
      ctx[2].timeTct + ""
    );
    let t6;
    let text3;
    let t7_value = (
      /*graphHover*/
      ctx[2].localTime + ""
    );
    let t7;
    let g_transform_value;
    let if_block0 = (
      /*graphHover*/
      ctx[2].goalPositiveY !== null && create_if_block_32(ctx)
    );
    let if_block1 = (
      /*graphHover*/
      ctx[2].goalNegativeY !== null && create_if_block_31(ctx)
    );
    return {
      c() {
        line = svg_element("line");
        circle = svg_element("circle");
        if (if_block0) if_block0.c();
        if_block0_anchor = empty();
        if (if_block1) if_block1.c();
        g = svg_element("g");
        rect = svg_element("rect");
        text0 = svg_element("text");
        t0 = text("Winning: ");
        t1 = text(t1_value);
        text1 = svg_element("text");
        t2 = text("Score: ");
        t3 = text(t3_value);
        t4 = text(" / ");
        t5 = text(t5_value);
        text2 = svg_element("text");
        t6 = text(t6_value);
        text3 = svg_element("text");
        t7 = text(t7_value);
        attr(line, "class", "__warhelper_war_overview_graph-hover-line");
        attr(line, "x1", line_x__value = /*graphHover*/
        ctx[2].x);
        attr(line, "x2", line_x__value_1 = /*graphHover*/
        ctx[2].x);
        attr(line, "y1", line_y__value = /*graph*/
        ctx[71].plotY);
        attr(line, "y2", line_y__value_1 = /*graph*/
        ctx[71].plotY + /*graph*/
        ctx[71].plotHeight);
        attr(circle, "class", "__warhelper_war_overview_graph-hover-dot");
        attr(circle, "cx", circle_cx_value = /*graphHover*/
        ctx[2].x);
        attr(circle, "cy", circle_cy_value = /*graphHover*/
        ctx[2].scoreY);
        attr(circle, "r", "4");
        attr(rect, "width", "188");
        attr(rect, "height", "78");
        attr(rect, "rx", "4");
        attr(text0, "x", "8");
        attr(text0, "y", "16");
        attr(text1, "x", "8");
        attr(text1, "y", "31");
        attr(text2, "x", "8");
        attr(text2, "y", "54");
        attr(text3, "x", "8");
        attr(text3, "y", "69");
        attr(g, "class", "__warhelper_war_overview_graph-tooltip");
        attr(g, "transform", g_transform_value = `translate(${graphTooltipX(
          /*graphHover*/
          ctx[2],
          /*graph*/
          ctx[71]
        )} ${graphTooltipY(
          /*graphHover*/
          ctx[2],
          /*graph*/
          ctx[71]
        )})`);
      },
      m(target, anchor) {
        insert(target, line, anchor);
        insert(target, circle, anchor);
        if (if_block0) if_block0.m(target, anchor);
        insert(target, if_block0_anchor, anchor);
        if (if_block1) if_block1.m(target, anchor);
        insert(target, g, anchor);
        append(g, rect);
        append(g, text0);
        append(text0, t0);
        append(text0, t1);
        append(g, text1);
        append(text1, t2);
        append(text1, t3);
        append(text1, t4);
        append(text1, t5);
        append(g, text2);
        append(text2, t6);
        append(g, text3);
        append(text3, t7);
      },
      p(ctx2, dirty) {
        if (dirty[0] & /*graphHover*/
        4 && line_x__value !== (line_x__value = /*graphHover*/
        ctx2[2].x)) {
          attr(line, "x1", line_x__value);
        }
        if (dirty[0] & /*graphHover*/
        4 && line_x__value_1 !== (line_x__value_1 = /*graphHover*/
        ctx2[2].x)) {
          attr(line, "x2", line_x__value_1);
        }
        if (dirty[0] & /*state*/
        1 && line_y__value !== (line_y__value = /*graph*/
        ctx2[71].plotY)) {
          attr(line, "y1", line_y__value);
        }
        if (dirty[0] & /*state*/
        1 && line_y__value_1 !== (line_y__value_1 = /*graph*/
        ctx2[71].plotY + /*graph*/
        ctx2[71].plotHeight)) {
          attr(line, "y2", line_y__value_1);
        }
        if (dirty[0] & /*graphHover*/
        4 && circle_cx_value !== (circle_cx_value = /*graphHover*/
        ctx2[2].x)) {
          attr(circle, "cx", circle_cx_value);
        }
        if (dirty[0] & /*graphHover*/
        4 && circle_cy_value !== (circle_cy_value = /*graphHover*/
        ctx2[2].scoreY)) {
          attr(circle, "cy", circle_cy_value);
        }
        if (
          /*graphHover*/
          ctx2[2].goalPositiveY !== null
        ) {
          if (if_block0) {
            if_block0.p(ctx2, dirty);
          } else {
            if_block0 = create_if_block_32(ctx2);
            if_block0.c();
            if_block0.m(if_block0_anchor.parentNode, if_block0_anchor);
          }
        } else if (if_block0) {
          if_block0.d(1);
          if_block0 = null;
        }
        if (
          /*graphHover*/
          ctx2[2].goalNegativeY !== null
        ) {
          if (if_block1) {
            if_block1.p(ctx2, dirty);
          } else {
            if_block1 = create_if_block_31(ctx2);
            if_block1.c();
            if_block1.m(g.parentNode, g);
          }
        } else if (if_block1) {
          if_block1.d(1);
          if_block1 = null;
        }
        if (dirty[0] & /*graphHover*/
        4 && t1_value !== (t1_value = /*graphHover*/
        ctx2[2].winningFactionName + "")) set_data(t1, t1_value);
        if (dirty[0] & /*graphHover*/
        4 && t3_value !== (t3_value = /*graphHover*/
        ctx2[2].scoreDisplay + "")) set_data(t3, t3_value);
        if (dirty[0] & /*graphHover*/
        4 && t5_value !== (t5_value = /*graphHover*/
        ctx2[2].goalDisplay + "")) set_data(t5, t5_value);
        if (dirty[0] & /*graphHover*/
        4 && t6_value !== (t6_value = /*graphHover*/
        ctx2[2].timeTct + "")) set_data(t6, t6_value);
        if (dirty[0] & /*graphHover*/
        4 && t7_value !== (t7_value = /*graphHover*/
        ctx2[2].localTime + "")) set_data(t7, t7_value);
        if (dirty[0] & /*graphHover, state*/
        5 && g_transform_value !== (g_transform_value = `translate(${graphTooltipX(
          /*graphHover*/
          ctx2[2],
          /*graph*/
          ctx2[71]
        )} ${graphTooltipY(
          /*graphHover*/
          ctx2[2],
          /*graph*/
          ctx2[71]
        )})`)) {
          attr(g, "transform", g_transform_value);
        }
      },
      d(detaching) {
        if (detaching) {
          detach(line);
          detach(circle);
          detach(if_block0_anchor);
          detach(g);
        }
        if (if_block0) if_block0.d(detaching);
        if (if_block1) if_block1.d(detaching);
      }
    };
  }
  function create_if_block_32(ctx) {
    let circle;
    let circle_cx_value;
    let circle_cy_value;
    return {
      c() {
        circle = svg_element("circle");
        attr(circle, "class", "__warhelper_war_overview_graph-hover-dot");
        attr(circle, "cx", circle_cx_value = /*graphHover*/
        ctx[2].x);
        attr(circle, "cy", circle_cy_value = /*graphHover*/
        ctx[2].goalPositiveY);
        attr(circle, "r", "3");
      },
      m(target, anchor) {
        insert(target, circle, anchor);
      },
      p(ctx2, dirty) {
        if (dirty[0] & /*graphHover*/
        4 && circle_cx_value !== (circle_cx_value = /*graphHover*/
        ctx2[2].x)) {
          attr(circle, "cx", circle_cx_value);
        }
        if (dirty[0] & /*graphHover*/
        4 && circle_cy_value !== (circle_cy_value = /*graphHover*/
        ctx2[2].goalPositiveY)) {
          attr(circle, "cy", circle_cy_value);
        }
      },
      d(detaching) {
        if (detaching) {
          detach(circle);
        }
      }
    };
  }
  function create_if_block_31(ctx) {
    let circle;
    let circle_cx_value;
    let circle_cy_value;
    return {
      c() {
        circle = svg_element("circle");
        attr(circle, "class", "__warhelper_war_overview_graph-hover-dot");
        attr(circle, "cx", circle_cx_value = /*graphHover*/
        ctx[2].x);
        attr(circle, "cy", circle_cy_value = /*graphHover*/
        ctx[2].goalNegativeY);
        attr(circle, "r", "3");
      },
      m(target, anchor) {
        insert(target, circle, anchor);
      },
      p(ctx2, dirty) {
        if (dirty[0] & /*graphHover*/
        4 && circle_cx_value !== (circle_cx_value = /*graphHover*/
        ctx2[2].x)) {
          attr(circle, "cx", circle_cx_value);
        }
        if (dirty[0] & /*graphHover*/
        4 && circle_cy_value !== (circle_cy_value = /*graphHover*/
        ctx2[2].goalNegativeY)) {
          attr(circle, "cy", circle_cy_value);
        }
      },
      d(detaching) {
        if (detaching) {
          detach(circle);
        }
      }
    };
  }
  function create_if_block_27(ctx) {
    let div;
    let span2;
    let span0;
    let t1;
    let span1;
    let t2_value = (
      /*state*/
      ctx[0].opponentChain.text + ""
    );
    let t2;
    let t3;
    let button;
    let mounted;
    let dispose;
    return {
      c() {
        div = element("div");
        span2 = element("span");
        span0 = element("span");
        span0.textContent = "OPPONENT CHAIN";
        t1 = space();
        span1 = element("span");
        t2 = text(t2_value);
        t3 = space();
        button = element("button");
        button.textContent = "\u21BB";
        attr(span0, "class", "__warhelper_war_overview_decay-label");
        attr(span1, "class", "__warhelper_war_overview_decay-timer");
        attr(span2, "class", "__warhelper_war_overview_decay-summary");
        attr(button, "class", "__warhelper_war_overview_decay-refresh");
        attr(button, "type", "button");
        attr(button, "aria-label", "Refresh opponent chain");
        attr(div, "class", "__warhelper_war_overview_decay __warhelper_war_overview_chain");
      },
      m(target, anchor) {
        insert(target, div, anchor);
        append(div, span2);
        append(span2, span0);
        append(span2, t1);
        append(span2, span1);
        append(span1, t2);
        append(div, t3);
        append(div, button);
        if (!mounted) {
          dispose = listen(
            button,
            "click",
            /*click_handler_3*/
            ctx[26]
          );
          mounted = true;
        }
      },
      p(ctx2, dirty) {
        if (dirty[0] & /*state*/
        1 && t2_value !== (t2_value = /*state*/
        ctx2[0].opponentChain.text + "")) set_data(t2, t2_value);
      },
      d(detaching) {
        if (detaching) {
          detach(div);
        }
        mounted = false;
        dispose();
      }
    };
  }
  function create_if_block_26(ctx) {
    let button;
    let span0;
    let t0_value = (
      /*table*/
      ctx[55].title + ""
    );
    let t0;
    let t1;
    let span1;
    let t2_value = (
      /*table*/
      ctx[55].rawCount + ""
    );
    let t2;
    let t3;
    let button_aria_selected_value;
    let mounted;
    let dispose;
    function click_handler_4() {
      return (
        /*click_handler_4*/
        ctx[27](
          /*side*/
          ctx[54]
        )
      );
    }
    function keydown_handler_1(...args) {
      return (
        /*keydown_handler_1*/
        ctx[28](
          /*side*/
          ctx[54],
          ...args
        )
      );
    }
    return {
      c() {
        button = element("button");
        span0 = element("span");
        t0 = text(t0_value);
        t1 = space();
        span1 = element("span");
        t2 = text(t2_value);
        t3 = space();
        attr(span0, "class", "__warhelper_war_overview_mobile-tab-title");
        attr(span1, "class", "__warhelper_war_overview_mobile-tab-count");
        attr(button, "class", "__warhelper_war_overview_mobile-tab");
        attr(button, "type", "button");
        attr(button, "role", "tab");
        attr(button, "aria-selected", button_aria_selected_value = /*state*/
        ctx[0].activeMobileTab === /*side*/
        ctx[54]);
        toggle_class(
          button,
          "active",
          /*state*/
          ctx[0].activeMobileTab === /*side*/
          ctx[54]
        );
      },
      m(target, anchor) {
        insert(target, button, anchor);
        append(button, span0);
        append(span0, t0);
        append(button, t1);
        append(button, span1);
        append(span1, t2);
        append(button, t3);
        if (!mounted) {
          dispose = [
            listen(button, "click", click_handler_4),
            listen(button, "keydown", keydown_handler_1)
          ];
          mounted = true;
        }
      },
      p(new_ctx, dirty) {
        ctx = new_ctx;
        if (dirty[0] & /*state*/
        1 && t0_value !== (t0_value = /*table*/
        ctx[55].title + "")) set_data(t0, t0_value);
        if (dirty[0] & /*state*/
        1 && t2_value !== (t2_value = /*table*/
        ctx[55].rawCount + "")) set_data(t2, t2_value);
        if (dirty[0] & /*state*/
        1 && button_aria_selected_value !== (button_aria_selected_value = /*state*/
        ctx[0].activeMobileTab === /*side*/
        ctx[54])) {
          attr(button, "aria-selected", button_aria_selected_value);
        }
        if (dirty[0] & /*state, sides*/
        17) {
          toggle_class(
            button,
            "active",
            /*state*/
            ctx[0].activeMobileTab === /*side*/
            ctx[54]
          );
        }
      },
      d(detaching) {
        if (detaching) {
          detach(button);
        }
        mounted = false;
        run_all(dispose);
      }
    };
  }
  function create_each_block_5(ctx) {
    let if_block_anchor;
    let if_block = (
      /*table*/
      ctx[55] && create_if_block_26(ctx)
    );
    return {
      c() {
        if (if_block) if_block.c();
        if_block_anchor = empty();
      },
      m(target, anchor) {
        if (if_block) if_block.m(target, anchor);
        insert(target, if_block_anchor, anchor);
      },
      p(ctx2, dirty) {
        if (
          /*table*/
          ctx2[55]
        ) {
          if (if_block) {
            if_block.p(ctx2, dirty);
          } else {
            if_block = create_if_block_26(ctx2);
            if_block.c();
            if_block.m(if_block_anchor.parentNode, if_block_anchor);
          }
        } else if (if_block) {
          if_block.d(1);
          if_block = null;
        }
      },
      d(detaching) {
        if (detaching) {
          detach(if_block_anchor);
        }
        if (if_block) if_block.d(detaching);
      }
    };
  }
  function create_if_block(ctx) {
    let div3;
    let div1;
    let div0;
    let button;
    let t0;
    let button_class_value;
    let button_aria_label_value;
    let t1;
    let t2;
    let span;
    let t3_value = (
      /*table*/
      ctx[55].title + ""
    );
    let t3;
    let t4;
    let div1_tabindex_value;
    let t5;
    let div2;
    let t6;
    let t7;
    let div3_class_value;
    let div3_tabindex_value;
    let mounted;
    let dispose;
    function click_handler_5(...args) {
      return (
        /*click_handler_5*/
        ctx[29](
          /*side*/
          ctx[54],
          ...args
        )
      );
    }
    let if_block0 = (
      /*table*/
      ctx[55].activeSettings && create_if_block_25(ctx)
    );
    let if_block1 = !/*mobileTabs*/
    ctx[3] && create_if_block_24(ctx);
    function click_handler_6(...args) {
      return (
        /*click_handler_6*/
        ctx[32](
          /*side*/
          ctx[54],
          ...args
        )
      );
    }
    function keydown_handler_3(...args) {
      return (
        /*keydown_handler_3*/
        ctx[33](
          /*side*/
          ctx[54],
          ...args
        )
      );
    }
    let if_block2 = (
      /*table*/
      (ctx[55].members.length || /*table*/
      ctx[55].rawCount) && create_if_block_2(ctx)
    );
    let if_block3 = !/*table*/
    ctx[55].members.length && /*table*/
    ctx[55].emptyText && create_if_block_1(ctx);
    function click_handler_19() {
      return (
        /*click_handler_19*/
        ctx[52](
          /*table*/
          ctx[55],
          /*side*/
          ctx[54]
        )
      );
    }
    function keydown_handler_6(...args) {
      return (
        /*keydown_handler_6*/
        ctx[53](
          /*side*/
          ctx[54],
          ...args
        )
      );
    }
    return {
      c() {
        div3 = element("div");
        div1 = element("div");
        div0 = element("div");
        button = element("button");
        t0 = text("\u2699");
        t1 = space();
        if (if_block0) if_block0.c();
        t2 = space();
        span = element("span");
        t3 = text(t3_value);
        t4 = space();
        if (if_block1) if_block1.c();
        t5 = space();
        div2 = element("div");
        if (if_block2) if_block2.c();
        t6 = space();
        if (if_block3) if_block3.c();
        t7 = space();
        attr(button, "class", button_class_value = `__warhelper_war_overview_settings-button ${/*table*/
        ctx[55].activeSettings ? "active" : ""}`);
        attr(button, "type", "button");
        attr(button, "aria-label", button_aria_label_value = `Column settings for ${/*table*/
        ctx[55].title}`);
        attr(div0, "class", "__warhelper_war_overview_settings-wrap __warhelper_war_overview_settings-ui");
        attr(div0, "role", "presentation");
        attr(span, "class", "__warhelper_war_overview_panel-title-text");
        attr(div1, "class", "__warhelper_war_overview_panel-title");
        attr(div1, "role", "button");
        attr(div1, "tabindex", div1_tabindex_value = /*mobileTabs*/
        ctx[3] ? -1 : 0);
        attr(div2, "class", "__warhelper_war_overview_panel-body");
        attr(div3, "class", div3_class_value = `__warhelper_war_overview_panel __warhelper_war_overview_panel-${/*side*/
        ctx[54]}`);
        attr(div3, "role", "button");
        attr(div3, "tabindex", div3_tabindex_value = !/*mobileTabs*/
        ctx[3] && /*table*/
        ctx[55].collapsed ? 0 : -1);
        toggle_class(
          div3,
          "__warhelper_war_overview_panel-collapsed",
          /*table*/
          ctx[55].collapsed
        );
        toggle_class(
          div3,
          "__warhelper_war_overview_panel-mobile-active",
          /*state*/
          ctx[0].activeMobileTab === /*side*/
          ctx[54]
        );
      },
      m(target, anchor) {
        insert(target, div3, anchor);
        append(div3, div1);
        append(div1, div0);
        append(div0, button);
        append(button, t0);
        append(div0, t1);
        if (if_block0) if_block0.m(div0, null);
        append(div1, t2);
        append(div1, span);
        append(span, t3);
        append(div1, t4);
        if (if_block1) if_block1.m(div1, null);
        append(div3, t5);
        append(div3, div2);
        if (if_block2) if_block2.m(div2, null);
        append(div2, t6);
        if (if_block3) if_block3.m(div2, null);
        append(div3, t7);
        if (!mounted) {
          dispose = [
            listen(button, "click", click_handler_5),
            listen(div0, "click", stop_propagation(
              /*click_handler*/
              ctx[20]
            )),
            listen(div0, "keydown", stop_propagation(
              /*keydown_handler*/
              ctx[21]
            )),
            listen(div1, "click", click_handler_6),
            listen(div1, "keydown", keydown_handler_3),
            listen(div3, "click", click_handler_19),
            listen(div3, "keydown", keydown_handler_6)
          ];
          mounted = true;
        }
      },
      p(new_ctx, dirty) {
        ctx = new_ctx;
        if (dirty[0] & /*state*/
        1 && button_class_value !== (button_class_value = `__warhelper_war_overview_settings-button ${/*table*/
        ctx[55].activeSettings ? "active" : ""}`)) {
          attr(button, "class", button_class_value);
        }
        if (dirty[0] & /*state*/
        1 && button_aria_label_value !== (button_aria_label_value = `Column settings for ${/*table*/
        ctx[55].title}`)) {
          attr(button, "aria-label", button_aria_label_value);
        }
        if (
          /*table*/
          ctx[55].activeSettings
        ) {
          if (if_block0) {
            if_block0.p(ctx, dirty);
          } else {
            if_block0 = create_if_block_25(ctx);
            if_block0.c();
            if_block0.m(div0, null);
          }
        } else if (if_block0) {
          if_block0.d(1);
          if_block0 = null;
        }
        if (dirty[0] & /*state*/
        1 && t3_value !== (t3_value = /*table*/
        ctx[55].title + "")) set_data(t3, t3_value);
        if (!/*mobileTabs*/
        ctx[3]) {
          if (if_block1) {
            if_block1.p(ctx, dirty);
          } else {
            if_block1 = create_if_block_24(ctx);
            if_block1.c();
            if_block1.m(div1, null);
          }
        } else if (if_block1) {
          if_block1.d(1);
          if_block1 = null;
        }
        if (dirty[0] & /*mobileTabs*/
        8 && div1_tabindex_value !== (div1_tabindex_value = /*mobileTabs*/
        ctx[3] ? -1 : 0)) {
          attr(div1, "tabindex", div1_tabindex_value);
        }
        if (
          /*table*/
          ctx[55].members.length || /*table*/
          ctx[55].rawCount
        ) {
          if (if_block2) {
            if_block2.p(ctx, dirty);
          } else {
            if_block2 = create_if_block_2(ctx);
            if_block2.c();
            if_block2.m(div2, t6);
          }
        } else if (if_block2) {
          if_block2.d(1);
          if_block2 = null;
        }
        if (!/*table*/
        ctx[55].members.length && /*table*/
        ctx[55].emptyText) {
          if (if_block3) {
            if_block3.p(ctx, dirty);
          } else {
            if_block3 = create_if_block_1(ctx);
            if_block3.c();
            if_block3.m(div2, null);
          }
        } else if (if_block3) {
          if_block3.d(1);
          if_block3 = null;
        }
        if (dirty[0] & /*mobileTabs, state*/
        9 && div3_tabindex_value !== (div3_tabindex_value = !/*mobileTabs*/
        ctx[3] && /*table*/
        ctx[55].collapsed ? 0 : -1)) {
          attr(div3, "tabindex", div3_tabindex_value);
        }
        if (dirty[0] & /*state, sides*/
        17) {
          toggle_class(
            div3,
            "__warhelper_war_overview_panel-collapsed",
            /*table*/
            ctx[55].collapsed
          );
        }
        if (dirty[0] & /*state, sides*/
        17) {
          toggle_class(
            div3,
            "__warhelper_war_overview_panel-mobile-active",
            /*state*/
            ctx[0].activeMobileTab === /*side*/
            ctx[54]
          );
        }
      },
      d(detaching) {
        if (detaching) {
          detach(div3);
        }
        if (if_block0) if_block0.d();
        if (if_block1) if_block1.d();
        if (if_block2) if_block2.d();
        if (if_block3) if_block3.d();
        mounted = false;
        run_all(dispose);
      }
    };
  }
  function create_if_block_25(ctx) {
    let form;
    let mounted;
    let dispose;
    let each_value_4 = ensure_array_like(
      /*table*/
      ctx[55].optionalColumns
    );
    let each_blocks = [];
    for (let i = 0; i < each_value_4.length; i += 1) {
      each_blocks[i] = create_each_block_4(get_each_context_4(ctx, each_value_4, i));
    }
    return {
      c() {
        form = element("form");
        for (let i = 0; i < each_blocks.length; i += 1) {
          each_blocks[i].c();
        }
        attr(form, "class", "__warhelper_war_overview_settings-popover __warhelper_war_overview_settings-ui");
      },
      m(target, anchor) {
        insert(target, form, anchor);
        for (let i = 0; i < each_blocks.length; i += 1) {
          if (each_blocks[i]) {
            each_blocks[i].m(form, null);
          }
        }
        if (!mounted) {
          dispose = listen(form, "submit", prevent_default(
            /*submit_handler*/
            ctx[22]
          ));
          mounted = true;
        }
      },
      p(ctx2, dirty) {
        if (dirty[0] & /*state, sides, actions*/
        19) {
          each_value_4 = ensure_array_like(
            /*table*/
            ctx2[55].optionalColumns
          );
          let i;
          for (i = 0; i < each_value_4.length; i += 1) {
            const child_ctx = get_each_context_4(ctx2, each_value_4, i);
            if (each_blocks[i]) {
              each_blocks[i].p(child_ctx, dirty);
            } else {
              each_blocks[i] = create_each_block_4(child_ctx);
              each_blocks[i].c();
              each_blocks[i].m(form, null);
            }
          }
          for (; i < each_blocks.length; i += 1) {
            each_blocks[i].d(1);
          }
          each_blocks.length = each_value_4.length;
        }
      },
      d(detaching) {
        if (detaching) {
          detach(form);
        }
        destroy_each(each_blocks, detaching);
        mounted = false;
        dispose();
      }
    };
  }
  function create_each_block_4(ctx) {
    let label_1;
    let input;
    let input_checked_value;
    let t0;
    let span;
    let t1_value = (
      /*column*/
      ctx[66].label + ""
    );
    let t1;
    let t2;
    let mounted;
    let dispose;
    function change_handler(...args) {
      return (
        /*change_handler*/
        ctx[30](
          /*side*/
          ctx[54],
          /*column*/
          ctx[66],
          ...args
        )
      );
    }
    return {
      c() {
        label_1 = element("label");
        input = element("input");
        t0 = space();
        span = element("span");
        t1 = text(t1_value);
        t2 = space();
        attr(input, "type", "checkbox");
        input.checked = input_checked_value = /*column*/
        ctx[66].visible;
        attr(label_1, "class", "__warhelper_war_overview_filter-choice");
      },
      m(target, anchor) {
        insert(target, label_1, anchor);
        append(label_1, input);
        append(label_1, t0);
        append(label_1, span);
        append(span, t1);
        append(label_1, t2);
        if (!mounted) {
          dispose = [
            listen(input, "change", change_handler),
            listen(
              input,
              "keydown",
              /*keydown_handler_2*/
              ctx[31]
            )
          ];
          mounted = true;
        }
      },
      p(new_ctx, dirty) {
        ctx = new_ctx;
        if (dirty[0] & /*state*/
        1 && input_checked_value !== (input_checked_value = /*column*/
        ctx[66].visible)) {
          input.checked = input_checked_value;
        }
        if (dirty[0] & /*state*/
        1 && t1_value !== (t1_value = /*column*/
        ctx[66].label + "")) set_data(t1, t1_value);
      },
      d(detaching) {
        if (detaching) {
          detach(label_1);
        }
        mounted = false;
        run_all(dispose);
      }
    };
  }
  function create_if_block_24(ctx) {
    let button;
    let t_value = (
      /*table*/
      ctx[55].collapseButtonText + ""
    );
    let t;
    let button_aria_label_value;
    return {
      c() {
        button = element("button");
        t = text(t_value);
        attr(button, "class", "__warhelper_war_overview_collapse-button");
        attr(button, "type", "button");
        attr(button, "aria-label", button_aria_label_value = `${/*table*/
        ctx[55].collapsed ? "Expand" : "Collapse"} ${/*side*/
        ctx[54] === "enemy" ? "enemy faction" : "own faction"}`);
      },
      m(target, anchor) {
        insert(target, button, anchor);
        append(button, t);
      },
      p(ctx2, dirty) {
        if (dirty[0] & /*state*/
        1 && t_value !== (t_value = /*table*/
        ctx2[55].collapseButtonText + "")) set_data(t, t_value);
        if (dirty[0] & /*state*/
        1 && button_aria_label_value !== (button_aria_label_value = `${/*table*/
        ctx2[55].collapsed ? "Expand" : "Collapse"} ${/*side*/
        ctx2[54] === "enemy" ? "enemy faction" : "own faction"}`)) {
          attr(button, "aria-label", button_aria_label_value);
        }
      },
      d(detaching) {
        if (detaching) {
          detach(button);
        }
      }
    };
  }
  function create_if_block_2(ctx) {
    let table_1;
    let colgroup;
    let col0;
    let t0;
    let t1;
    let col1;
    let t2;
    let col2;
    let t3;
    let t4;
    let t5;
    let col3;
    let t6;
    let t7;
    let thead;
    let tr;
    let th0;
    let div0;
    let button0;
    let button0_class_value;
    let t8;
    let th0_class_value;
    let t9;
    let t10;
    let th1;
    let div1;
    let button1;
    let span0;
    let t12;
    let span1;
    let button1_class_value;
    let th1_class_value;
    let t13;
    let th2;
    let div2;
    let button2;
    let span2;
    let t15;
    let span3;
    let button2_class_value;
    let t16;
    let button3;
    let button3_class_value;
    let t17;
    let t18;
    let t19;
    let t20;
    let th3;
    let div3;
    let button4;
    let span4;
    let t22;
    let span5;
    let button4_class_value;
    let t23;
    let button5;
    let button5_class_value;
    let t24;
    let t25;
    let t26;
    let tbody;
    let each_blocks = [];
    let each_1_lookup = /* @__PURE__ */ new Map();
    let mounted;
    let dispose;
    let if_block0 = (
      /*table*/
      ctx[55].showDibsColumn && create_if_block_23(ctx)
    );
    let if_block1 = (
      /*table*/
      ctx[55].showScoreColumn && create_if_block_22(ctx)
    );
    let if_block2 = (
      /*table*/
      ctx[55].showArmorColumn && create_if_block_21(ctx)
    );
    let if_block3 = (
      /*table*/
      ctx[55].showAttackColumn && create_if_block_20(ctx)
    );
    function click_handler_7(...args) {
      return (
        /*click_handler_7*/
        ctx[34](
          /*side*/
          ctx[54],
          ...args
        )
      );
    }
    let if_block4 = (
      /*table*/
      ctx[55].activeFilter === "online" && create_if_block_19(ctx)
    );
    let if_block5 = (
      /*table*/
      ctx[55].showDibsColumn && create_if_block_18(ctx)
    );
    function click_handler_9() {
      return (
        /*click_handler_9*/
        ctx[37](
          /*side*/
          ctx[54]
        )
      );
    }
    function click_handler_10() {
      return (
        /*click_handler_10*/
        ctx[38](
          /*side*/
          ctx[54]
        )
      );
    }
    function click_handler_11(...args) {
      return (
        /*click_handler_11*/
        ctx[39](
          /*side*/
          ctx[54],
          ...args
        )
      );
    }
    let if_block6 = (
      /*table*/
      ctx[55].activeFilter === "status" && create_if_block_17(ctx)
    );
    let if_block7 = (
      /*table*/
      ctx[55].showScoreColumn && create_if_block_16(ctx)
    );
    let if_block8 = (
      /*table*/
      ctx[55].showArmorColumn && create_if_block_15(ctx)
    );
    function click_handler_14() {
      return (
        /*click_handler_14*/
        ctx[43](
          /*side*/
          ctx[54]
        )
      );
    }
    function click_handler_15(...args) {
      return (
        /*click_handler_15*/
        ctx[44](
          /*side*/
          ctx[54],
          ...args
        )
      );
    }
    let if_block9 = (
      /*table*/
      ctx[55].activeFilter === "stats" && create_if_block_14(ctx)
    );
    let if_block10 = (
      /*table*/
      ctx[55].showAttackColumn && create_if_block_13(ctx)
    );
    let each_value_1 = ensure_array_like(
      /*table*/
      ctx[55].members
    );
    const get_key = (ctx2) => (
      /*member*/
      ctx2[58].userId
    );
    for (let i = 0; i < each_value_1.length; i += 1) {
      let child_ctx = get_each_context_1(ctx, each_value_1, i);
      let key = get_key(child_ctx);
      each_1_lookup.set(key, each_blocks[i] = create_each_block_1(key, child_ctx));
    }
    return {
      c() {
        table_1 = element("table");
        colgroup = element("colgroup");
        col0 = element("col");
        t0 = space();
        if (if_block0) if_block0.c();
        t1 = space();
        col1 = element("col");
        t2 = space();
        col2 = element("col");
        t3 = space();
        if (if_block1) if_block1.c();
        t4 = space();
        if (if_block2) if_block2.c();
        t5 = space();
        col3 = element("col");
        t6 = space();
        if (if_block3) if_block3.c();
        t7 = space();
        thead = element("thead");
        tr = element("tr");
        th0 = element("th");
        div0 = element("div");
        button0 = element("button");
        t8 = space();
        if (if_block4) if_block4.c();
        t9 = space();
        if (if_block5) if_block5.c();
        t10 = space();
        th1 = element("th");
        div1 = element("div");
        button1 = element("button");
        span0 = element("span");
        span0.textContent = "Name";
        t12 = space();
        span1 = element("span");
        t13 = space();
        th2 = element("th");
        div2 = element("div");
        button2 = element("button");
        span2 = element("span");
        span2.textContent = "Status";
        t15 = space();
        span3 = element("span");
        t16 = space();
        button3 = element("button");
        t17 = space();
        if (if_block6) if_block6.c();
        t18 = space();
        if (if_block7) if_block7.c();
        t19 = space();
        if (if_block8) if_block8.c();
        t20 = space();
        th3 = element("th");
        div3 = element("div");
        button4 = element("button");
        span4 = element("span");
        span4.textContent = "Stats";
        t22 = space();
        span5 = element("span");
        t23 = space();
        button5 = element("button");
        t24 = space();
        if (if_block9) if_block9.c();
        t25 = space();
        if (if_block10) if_block10.c();
        t26 = space();
        tbody = element("tbody");
        for (let i = 0; i < each_blocks.length; i += 1) {
          each_blocks[i].c();
        }
        attr(col0, "class", "__warhelper_war_overview_col-controls");
        attr(col1, "class", "__warhelper_war_overview_col-name");
        attr(col2, "class", "__warhelper_war_overview_col-status");
        attr(col3, "class", "__warhelper_war_overview_col-stats");
        attr(button0, "class", button0_class_value = `__warhelper_war_overview_filter-button __warhelper_war_overview_filter-ui ${filterActiveClass(
          /*table*/
          ctx[55].hasOnlineFilter
        )}`);
        attr(button0, "type", "button");
        attr(div0, "class", "__warhelper_war_overview_controls-header-content");
        attr(th0, "class", th0_class_value = `__warhelper_war_overview_controls-header __warhelper_war_overview_controls-header-${/*side*/
        ctx[54]}`);
        attr(span0, "class", "__warhelper_war_overview_sort-label");
        attr(span1, "class", "__warhelper_war_overview_sort-icon");
        attr(button1, "class", button1_class_value = `__warhelper_war_overview_sort ${sortClass(
          /*table*/
          ctx[55],
          "name"
        )}`);
        attr(button1, "type", "button");
        attr(div1, "class", "__warhelper_war_overview_name-header-content");
        attr(th1, "class", th1_class_value = `__warhelper_war_overview_name-header-${/*side*/
        ctx[54]}`);
        attr(span2, "class", "__warhelper_war_overview_sort-label");
        attr(span3, "class", "__warhelper_war_overview_sort-icon");
        attr(button2, "class", button2_class_value = `__warhelper_war_overview_sort ${sortClass(
          /*table*/
          ctx[55],
          "status"
        )}`);
        attr(button2, "type", "button");
        attr(button3, "class", button3_class_value = `__warhelper_war_overview_filter-button __warhelper_war_overview_filter-ui ${filterActiveClass(
          /*table*/
          ctx[55].hasStatusFilter
        )}`);
        attr(button3, "type", "button");
        attr(div2, "class", "__warhelper_war_overview_status-header-content");
        attr(th2, "class", "__warhelper_war_overview_status-header");
        attr(span4, "class", "__warhelper_war_overview_sort-label");
        attr(span5, "class", "__warhelper_war_overview_sort-icon");
        attr(button4, "class", button4_class_value = `__warhelper_war_overview_sort ${sortClass(
          /*table*/
          ctx[55],
          "stats"
        )}`);
        attr(button4, "type", "button");
        attr(button5, "class", button5_class_value = `__warhelper_war_overview_filter-button __warhelper_war_overview_filter-ui ${filterActiveClass(
          /*table*/
          ctx[55].hasStatsFilter
        )}`);
        attr(button5, "type", "button");
        attr(div3, "class", "__warhelper_war_overview_stats-header-content");
        attr(th3, "class", "__warhelper_war_overview_stats-header");
        attr(table_1, "class", "__warhelper_war_overview_table");
      },
      m(target, anchor) {
        insert(target, table_1, anchor);
        append(table_1, colgroup);
        append(colgroup, col0);
        append(colgroup, t0);
        if (if_block0) if_block0.m(colgroup, null);
        append(colgroup, t1);
        append(colgroup, col1);
        append(colgroup, t2);
        append(colgroup, col2);
        append(colgroup, t3);
        if (if_block1) if_block1.m(colgroup, null);
        append(colgroup, t4);
        if (if_block2) if_block2.m(colgroup, null);
        append(colgroup, t5);
        append(colgroup, col3);
        append(colgroup, t6);
        if (if_block3) if_block3.m(colgroup, null);
        append(table_1, t7);
        append(table_1, thead);
        append(thead, tr);
        append(tr, th0);
        append(th0, div0);
        append(div0, button0);
        append(th0, t8);
        if (if_block4) if_block4.m(th0, null);
        append(tr, t9);
        if (if_block5) if_block5.m(tr, null);
        append(tr, t10);
        append(tr, th1);
        append(th1, div1);
        append(div1, button1);
        append(button1, span0);
        append(button1, t12);
        append(button1, span1);
        append(tr, t13);
        append(tr, th2);
        append(th2, div2);
        append(div2, button2);
        append(button2, span2);
        append(button2, t15);
        append(button2, span3);
        append(div2, t16);
        append(div2, button3);
        append(th2, t17);
        if (if_block6) if_block6.m(th2, null);
        append(tr, t18);
        if (if_block7) if_block7.m(tr, null);
        append(tr, t19);
        if (if_block8) if_block8.m(tr, null);
        append(tr, t20);
        append(tr, th3);
        append(th3, div3);
        append(div3, button4);
        append(button4, span4);
        append(button4, t22);
        append(button4, span5);
        append(div3, t23);
        append(div3, button5);
        append(th3, t24);
        if (if_block9) if_block9.m(th3, null);
        append(tr, t25);
        if (if_block10) if_block10.m(tr, null);
        append(table_1, t26);
        append(table_1, tbody);
        for (let i = 0; i < each_blocks.length; i += 1) {
          if (each_blocks[i]) {
            each_blocks[i].m(tbody, null);
          }
        }
        if (!mounted) {
          dispose = [
            listen(button0, "click", click_handler_7),
            listen(button1, "click", click_handler_9),
            listen(button2, "click", click_handler_10),
            listen(button3, "click", click_handler_11),
            listen(button4, "click", click_handler_14),
            listen(button5, "click", click_handler_15)
          ];
          mounted = true;
        }
      },
      p(new_ctx, dirty) {
        ctx = new_ctx;
        if (
          /*table*/
          ctx[55].showDibsColumn
        ) {
          if (if_block0) {
          } else {
            if_block0 = create_if_block_23(ctx);
            if_block0.c();
            if_block0.m(colgroup, t1);
          }
        } else if (if_block0) {
          if_block0.d(1);
          if_block0 = null;
        }
        if (
          /*table*/
          ctx[55].showScoreColumn
        ) {
          if (if_block1) {
          } else {
            if_block1 = create_if_block_22(ctx);
            if_block1.c();
            if_block1.m(colgroup, t4);
          }
        } else if (if_block1) {
          if_block1.d(1);
          if_block1 = null;
        }
        if (
          /*table*/
          ctx[55].showArmorColumn
        ) {
          if (if_block2) {
          } else {
            if_block2 = create_if_block_21(ctx);
            if_block2.c();
            if_block2.m(colgroup, t5);
          }
        } else if (if_block2) {
          if_block2.d(1);
          if_block2 = null;
        }
        if (
          /*table*/
          ctx[55].showAttackColumn
        ) {
          if (if_block3) {
          } else {
            if_block3 = create_if_block_20(ctx);
            if_block3.c();
            if_block3.m(colgroup, null);
          }
        } else if (if_block3) {
          if_block3.d(1);
          if_block3 = null;
        }
        if (dirty[0] & /*state*/
        1 && button0_class_value !== (button0_class_value = `__warhelper_war_overview_filter-button __warhelper_war_overview_filter-ui ${filterActiveClass(
          /*table*/
          ctx[55].hasOnlineFilter
        )}`)) {
          attr(button0, "class", button0_class_value);
        }
        if (
          /*table*/
          ctx[55].activeFilter === "online"
        ) {
          if (if_block4) {
            if_block4.p(ctx, dirty);
          } else {
            if_block4 = create_if_block_19(ctx);
            if_block4.c();
            if_block4.m(th0, null);
          }
        } else if (if_block4) {
          if_block4.d(1);
          if_block4 = null;
        }
        if (
          /*table*/
          ctx[55].showDibsColumn
        ) {
          if (if_block5) {
          } else {
            if_block5 = create_if_block_18(ctx);
            if_block5.c();
            if_block5.m(tr, t10);
          }
        } else if (if_block5) {
          if_block5.d(1);
          if_block5 = null;
        }
        if (dirty[0] & /*state*/
        1 && button1_class_value !== (button1_class_value = `__warhelper_war_overview_sort ${sortClass(
          /*table*/
          ctx[55],
          "name"
        )}`)) {
          attr(button1, "class", button1_class_value);
        }
        if (dirty[0] & /*state*/
        1 && button2_class_value !== (button2_class_value = `__warhelper_war_overview_sort ${sortClass(
          /*table*/
          ctx[55],
          "status"
        )}`)) {
          attr(button2, "class", button2_class_value);
        }
        if (dirty[0] & /*state*/
        1 && button3_class_value !== (button3_class_value = `__warhelper_war_overview_filter-button __warhelper_war_overview_filter-ui ${filterActiveClass(
          /*table*/
          ctx[55].hasStatusFilter
        )}`)) {
          attr(button3, "class", button3_class_value);
        }
        if (
          /*table*/
          ctx[55].activeFilter === "status"
        ) {
          if (if_block6) {
            if_block6.p(ctx, dirty);
          } else {
            if_block6 = create_if_block_17(ctx);
            if_block6.c();
            if_block6.m(th2, null);
          }
        } else if (if_block6) {
          if_block6.d(1);
          if_block6 = null;
        }
        if (
          /*table*/
          ctx[55].showScoreColumn
        ) {
          if (if_block7) {
            if_block7.p(ctx, dirty);
          } else {
            if_block7 = create_if_block_16(ctx);
            if_block7.c();
            if_block7.m(tr, t19);
          }
        } else if (if_block7) {
          if_block7.d(1);
          if_block7 = null;
        }
        if (
          /*table*/
          ctx[55].showArmorColumn
        ) {
          if (if_block8) {
          } else {
            if_block8 = create_if_block_15(ctx);
            if_block8.c();
            if_block8.m(tr, t20);
          }
        } else if (if_block8) {
          if_block8.d(1);
          if_block8 = null;
        }
        if (dirty[0] & /*state*/
        1 && button4_class_value !== (button4_class_value = `__warhelper_war_overview_sort ${sortClass(
          /*table*/
          ctx[55],
          "stats"
        )}`)) {
          attr(button4, "class", button4_class_value);
        }
        if (dirty[0] & /*state*/
        1 && button5_class_value !== (button5_class_value = `__warhelper_war_overview_filter-button __warhelper_war_overview_filter-ui ${filterActiveClass(
          /*table*/
          ctx[55].hasStatsFilter
        )}`)) {
          attr(button5, "class", button5_class_value);
        }
        if (
          /*table*/
          ctx[55].activeFilter === "stats"
        ) {
          if (if_block9) {
            if_block9.p(ctx, dirty);
          } else {
            if_block9 = create_if_block_14(ctx);
            if_block9.c();
            if_block9.m(th3, null);
          }
        } else if (if_block9) {
          if_block9.d(1);
          if_block9 = null;
        }
        if (
          /*table*/
          ctx[55].showAttackColumn
        ) {
          if (if_block10) {
          } else {
            if_block10 = create_if_block_13(ctx);
            if_block10.c();
            if_block10.m(tr, null);
          }
        } else if (if_block10) {
          if_block10.d(1);
          if_block10 = null;
        }
        if (dirty[0] & /*state, sides, actions*/
        19) {
          each_value_1 = ensure_array_like(
            /*table*/
            ctx[55].members
          );
          each_blocks = update_keyed_each(each_blocks, dirty, get_key, 1, ctx, each_value_1, each_1_lookup, tbody, destroy_block, create_each_block_1, null, get_each_context_1);
        }
      },
      d(detaching) {
        if (detaching) {
          detach(table_1);
        }
        if (if_block0) if_block0.d();
        if (if_block1) if_block1.d();
        if (if_block2) if_block2.d();
        if (if_block3) if_block3.d();
        if (if_block4) if_block4.d();
        if (if_block5) if_block5.d();
        if (if_block6) if_block6.d();
        if (if_block7) if_block7.d();
        if (if_block8) if_block8.d();
        if (if_block9) if_block9.d();
        if (if_block10) if_block10.d();
        for (let i = 0; i < each_blocks.length; i += 1) {
          each_blocks[i].d();
        }
        mounted = false;
        run_all(dispose);
      }
    };
  }
  function create_if_block_23(ctx) {
    let col;
    return {
      c() {
        col = element("col");
        attr(col, "class", "__warhelper_war_overview_col-dibs");
      },
      m(target, anchor) {
        insert(target, col, anchor);
      },
      d(detaching) {
        if (detaching) {
          detach(col);
        }
      }
    };
  }
  function create_if_block_22(ctx) {
    let col;
    return {
      c() {
        col = element("col");
        attr(col, "class", "__warhelper_war_overview_col-score");
      },
      m(target, anchor) {
        insert(target, col, anchor);
      },
      d(detaching) {
        if (detaching) {
          detach(col);
        }
      }
    };
  }
  function create_if_block_21(ctx) {
    let col;
    return {
      c() {
        col = element("col");
        attr(col, "class", "__warhelper_war_overview_col-armor");
      },
      m(target, anchor) {
        insert(target, col, anchor);
      },
      d(detaching) {
        if (detaching) {
          detach(col);
        }
      }
    };
  }
  function create_if_block_20(ctx) {
    let col;
    return {
      c() {
        col = element("col");
        attr(col, "class", "__warhelper_war_overview_col-attack");
      },
      m(target, anchor) {
        insert(target, col, anchor);
      },
      d(detaching) {
        if (detaching) {
          detach(col);
        }
      }
    };
  }
  function create_if_block_19(ctx) {
    let form;
    let t0;
    let div;
    let button;
    let mounted;
    let dispose;
    let each_value_3 = ensure_array_like(
      /*onlineOptions*/
      ctx[6]
    );
    let each_blocks = [];
    for (let i = 0; i < each_value_3.length; i += 1) {
      each_blocks[i] = create_each_block_3(get_each_context_3(ctx, each_value_3, i));
    }
    function click_handler_8() {
      return (
        /*click_handler_8*/
        ctx[36](
          /*side*/
          ctx[54]
        )
      );
    }
    return {
      c() {
        form = element("form");
        for (let i = 0; i < each_blocks.length; i += 1) {
          each_blocks[i].c();
        }
        t0 = space();
        div = element("div");
        button = element("button");
        button.textContent = "Clear";
        attr(button, "type", "button");
        attr(div, "class", "__warhelper_war_overview_stats-filter-actions");
        attr(form, "class", "__warhelper_war_overview_stats-filter-popover __warhelper_war_overview_controls-filter-popover __warhelper_war_overview_filter-ui");
      },
      m(target, anchor) {
        insert(target, form, anchor);
        for (let i = 0; i < each_blocks.length; i += 1) {
          if (each_blocks[i]) {
            each_blocks[i].m(form, null);
          }
        }
        append(form, t0);
        append(form, div);
        append(div, button);
        if (!mounted) {
          dispose = [
            listen(button, "click", click_handler_8),
            listen(form, "submit", prevent_default(
              /*submit_handler_1*/
              ctx[19]
            ))
          ];
          mounted = true;
        }
      },
      p(new_ctx, dirty) {
        ctx = new_ctx;
        if (dirty[0] & /*onlineOptions, state, sides, actions*/
        83) {
          each_value_3 = ensure_array_like(
            /*onlineOptions*/
            ctx[6]
          );
          let i;
          for (i = 0; i < each_value_3.length; i += 1) {
            const child_ctx = get_each_context_3(ctx, each_value_3, i);
            if (each_blocks[i]) {
              each_blocks[i].p(child_ctx, dirty);
            } else {
              each_blocks[i] = create_each_block_3(child_ctx);
              each_blocks[i].c();
              each_blocks[i].m(form, t0);
            }
          }
          for (; i < each_blocks.length; i += 1) {
            each_blocks[i].d(1);
          }
          each_blocks.length = each_value_3.length;
        }
      },
      d(detaching) {
        if (detaching) {
          detach(form);
        }
        destroy_each(each_blocks, detaching);
        mounted = false;
        run_all(dispose);
      }
    };
  }
  function create_each_block_3(ctx) {
    let label_1;
    let input;
    let input_checked_value;
    let t0;
    let span;
    let mounted;
    let dispose;
    function change_handler_1(...args) {
      return (
        /*change_handler_1*/
        ctx[35](
          /*side*/
          ctx[54],
          /*option*/
          ctx[61],
          ...args
        )
      );
    }
    return {
      c() {
        label_1 = element("label");
        input = element("input");
        t0 = space();
        span = element("span");
        span.textContent = `${/*option*/
        ctx[61].label}`;
        attr(input, "type", "checkbox");
        input.checked = input_checked_value = /*table*/
        ctx[55].onlineFilters.includes(
          /*option*/
          ctx[61].value
        );
        attr(label_1, "class", "__warhelper_war_overview_filter-choice");
      },
      m(target, anchor) {
        insert(target, label_1, anchor);
        append(label_1, input);
        append(label_1, t0);
        append(label_1, span);
        if (!mounted) {
          dispose = listen(input, "change", change_handler_1);
          mounted = true;
        }
      },
      p(new_ctx, dirty) {
        ctx = new_ctx;
        if (dirty[0] & /*state*/
        1 && input_checked_value !== (input_checked_value = /*table*/
        ctx[55].onlineFilters.includes(
          /*option*/
          ctx[61].value
        ))) {
          input.checked = input_checked_value;
        }
      },
      d(detaching) {
        if (detaching) {
          detach(label_1);
        }
        mounted = false;
        dispose();
      }
    };
  }
  function create_if_block_18(ctx) {
    let th;
    return {
      c() {
        th = element("th");
        attr(th, "class", "__warhelper_war_overview_dibs-header");
      },
      m(target, anchor) {
        insert(target, th, anchor);
      },
      d(detaching) {
        if (detaching) {
          detach(th);
        }
      }
    };
  }
  function create_if_block_17(ctx) {
    let form;
    let t0;
    let div;
    let button;
    let mounted;
    let dispose;
    let each_value_2 = ensure_array_like(
      /*statusOptions*/
      ctx[5]
    );
    let each_blocks = [];
    for (let i = 0; i < each_value_2.length; i += 1) {
      each_blocks[i] = create_each_block_2(get_each_context_2(ctx, each_value_2, i));
    }
    function click_handler_12() {
      return (
        /*click_handler_12*/
        ctx[41](
          /*side*/
          ctx[54]
        )
      );
    }
    return {
      c() {
        form = element("form");
        for (let i = 0; i < each_blocks.length; i += 1) {
          each_blocks[i].c();
        }
        t0 = space();
        div = element("div");
        button = element("button");
        button.textContent = "Clear";
        attr(button, "type", "button");
        attr(div, "class", "__warhelper_war_overview_stats-filter-actions");
        attr(form, "class", "__warhelper_war_overview_stats-filter-popover __warhelper_war_overview_filter-ui");
      },
      m(target, anchor) {
        insert(target, form, anchor);
        for (let i = 0; i < each_blocks.length; i += 1) {
          if (each_blocks[i]) {
            each_blocks[i].m(form, null);
          }
        }
        append(form, t0);
        append(form, div);
        append(div, button);
        if (!mounted) {
          dispose = [
            listen(button, "click", click_handler_12),
            listen(form, "submit", prevent_default(
              /*submit_handler_2*/
              ctx[18]
            ))
          ];
          mounted = true;
        }
      },
      p(new_ctx, dirty) {
        ctx = new_ctx;
        if (dirty[0] & /*statusOptions, state, sides, actions*/
        51) {
          each_value_2 = ensure_array_like(
            /*statusOptions*/
            ctx[5]
          );
          let i;
          for (i = 0; i < each_value_2.length; i += 1) {
            const child_ctx = get_each_context_2(ctx, each_value_2, i);
            if (each_blocks[i]) {
              each_blocks[i].p(child_ctx, dirty);
            } else {
              each_blocks[i] = create_each_block_2(child_ctx);
              each_blocks[i].c();
              each_blocks[i].m(form, t0);
            }
          }
          for (; i < each_blocks.length; i += 1) {
            each_blocks[i].d(1);
          }
          each_blocks.length = each_value_2.length;
        }
      },
      d(detaching) {
        if (detaching) {
          detach(form);
        }
        destroy_each(each_blocks, detaching);
        mounted = false;
        run_all(dispose);
      }
    };
  }
  function create_each_block_2(ctx) {
    let label_1;
    let input;
    let input_checked_value;
    let t0;
    let span;
    let mounted;
    let dispose;
    function change_handler_2(...args) {
      return (
        /*change_handler_2*/
        ctx[40](
          /*side*/
          ctx[54],
          /*option*/
          ctx[61],
          ...args
        )
      );
    }
    return {
      c() {
        label_1 = element("label");
        input = element("input");
        t0 = space();
        span = element("span");
        span.textContent = `${/*option*/
        ctx[61].label}`;
        attr(input, "type", "checkbox");
        input.checked = input_checked_value = /*table*/
        ctx[55].statusFilters.includes(
          /*option*/
          ctx[61].value
        );
        attr(label_1, "class", "__warhelper_war_overview_filter-choice");
      },
      m(target, anchor) {
        insert(target, label_1, anchor);
        append(label_1, input);
        append(label_1, t0);
        append(label_1, span);
        if (!mounted) {
          dispose = listen(input, "change", change_handler_2);
          mounted = true;
        }
      },
      p(new_ctx, dirty) {
        ctx = new_ctx;
        if (dirty[0] & /*state*/
        1 && input_checked_value !== (input_checked_value = /*table*/
        ctx[55].statusFilters.includes(
          /*option*/
          ctx[61].value
        ))) {
          input.checked = input_checked_value;
        }
      },
      d(detaching) {
        if (detaching) {
          detach(label_1);
        }
        mounted = false;
        dispose();
      }
    };
  }
  function create_if_block_16(ctx) {
    let th;
    let button;
    let span0;
    let t1;
    let span1;
    let button_class_value;
    let mounted;
    let dispose;
    function click_handler_13() {
      return (
        /*click_handler_13*/
        ctx[42](
          /*side*/
          ctx[54]
        )
      );
    }
    return {
      c() {
        th = element("th");
        button = element("button");
        span0 = element("span");
        span0.textContent = "Score";
        t1 = space();
        span1 = element("span");
        attr(span0, "class", "__warhelper_war_overview_sort-label");
        attr(span1, "class", "__warhelper_war_overview_sort-icon");
        attr(button, "class", button_class_value = `__warhelper_war_overview_sort ${sortClass(
          /*table*/
          ctx[55],
          "score"
        )}`);
        attr(button, "type", "button");
        attr(th, "class", "__warhelper_war_overview_score-header");
      },
      m(target, anchor) {
        insert(target, th, anchor);
        append(th, button);
        append(button, span0);
        append(button, t1);
        append(button, span1);
        if (!mounted) {
          dispose = listen(button, "click", click_handler_13);
          mounted = true;
        }
      },
      p(new_ctx, dirty) {
        ctx = new_ctx;
        if (dirty[0] & /*state*/
        1 && button_class_value !== (button_class_value = `__warhelper_war_overview_sort ${sortClass(
          /*table*/
          ctx[55],
          "score"
        )}`)) {
          attr(button, "class", button_class_value);
        }
      },
      d(detaching) {
        if (detaching) {
          detach(th);
        }
        mounted = false;
        dispose();
      }
    };
  }
  function create_if_block_15(ctx) {
    let th;
    return {
      c() {
        th = element("th");
        th.textContent = "Armor";
        attr(th, "class", "__warhelper_war_overview_armor-header");
      },
      m(target, anchor) {
        insert(target, th, anchor);
      },
      d(detaching) {
        if (detaching) {
          detach(th);
        }
      }
    };
  }
  function create_if_block_14(ctx) {
    let form;
    let label0;
    let span0;
    let t1;
    let input0;
    let input0_value_value;
    let t2;
    let label1;
    let span1;
    let t4;
    let input1;
    let input1_value_value;
    let t5;
    let div;
    let button;
    let mounted;
    let dispose;
    function input_handler(...args) {
      return (
        /*input_handler*/
        ctx[45](
          /*side*/
          ctx[54],
          ...args
        )
      );
    }
    function input_handler_1(...args) {
      return (
        /*input_handler_1*/
        ctx[47](
          /*side*/
          ctx[54],
          ...args
        )
      );
    }
    function click_handler_16() {
      return (
        /*click_handler_16*/
        ctx[49](
          /*side*/
          ctx[54]
        )
      );
    }
    return {
      c() {
        form = element("form");
        label0 = element("label");
        span0 = element("span");
        span0.textContent = "From";
        t1 = space();
        input0 = element("input");
        t2 = space();
        label1 = element("label");
        span1 = element("span");
        span1.textContent = "To";
        t4 = space();
        input1 = element("input");
        t5 = space();
        div = element("div");
        button = element("button");
        button.textContent = "Clear";
        attr(input0, "name", "from");
        attr(input0, "inputmode", "text");
        attr(input0, "autocomplete", "off");
        input0.value = input0_value_value = /*table*/
        ctx[55].statsFilter.from;
        attr(input1, "name", "to");
        attr(input1, "inputmode", "text");
        attr(input1, "autocomplete", "off");
        input1.value = input1_value_value = /*table*/
        ctx[55].statsFilter.to;
        attr(button, "type", "button");
        attr(div, "class", "__warhelper_war_overview_stats-filter-actions");
        attr(form, "class", "__warhelper_war_overview_stats-filter-popover __warhelper_war_overview_filter-ui");
      },
      m(target, anchor) {
        insert(target, form, anchor);
        append(form, label0);
        append(label0, span0);
        append(label0, t1);
        append(label0, input0);
        append(form, t2);
        append(form, label1);
        append(label1, span1);
        append(label1, t4);
        append(label1, input1);
        append(form, t5);
        append(form, div);
        append(div, button);
        if (!mounted) {
          dispose = [
            listen(input0, "input", input_handler),
            listen(
              input0,
              "keydown",
              /*keydown_handler_4*/
              ctx[46]
            ),
            listen(input1, "input", input_handler_1),
            listen(
              input1,
              "keydown",
              /*keydown_handler_5*/
              ctx[48]
            ),
            listen(button, "click", click_handler_16),
            listen(form, "submit", prevent_default(
              /*submit_handler_3*/
              ctx[17]
            ))
          ];
          mounted = true;
        }
      },
      p(new_ctx, dirty) {
        ctx = new_ctx;
        if (dirty[0] & /*state*/
        1 && input0_value_value !== (input0_value_value = /*table*/
        ctx[55].statsFilter.from) && input0.value !== input0_value_value) {
          input0.value = input0_value_value;
        }
        if (dirty[0] & /*state*/
        1 && input1_value_value !== (input1_value_value = /*table*/
        ctx[55].statsFilter.to) && input1.value !== input1_value_value) {
          input1.value = input1_value_value;
        }
      },
      d(detaching) {
        if (detaching) {
          detach(form);
        }
        mounted = false;
        run_all(dispose);
      }
    };
  }
  function create_if_block_13(ctx) {
    let th;
    return {
      c() {
        th = element("th");
      },
      m(target, anchor) {
        insert(target, th, anchor);
      },
      d(detaching) {
        if (detaching) {
          detach(th);
        }
      }
    };
  }
  function create_if_block_11(ctx) {
    let td;
    let span;
    let if_block = (
      /*member*/
      ctx[58].canDib && create_if_block_12(ctx)
    );
    return {
      c() {
        td = element("td");
        span = element("span");
        if (if_block) if_block.c();
        attr(span, "class", "__warhelper_war_overview_dibs-content");
        attr(td, "class", "__warhelper_war_overview_dibs");
      },
      m(target, anchor) {
        insert(target, td, anchor);
        append(td, span);
        if (if_block) if_block.m(span, null);
      },
      p(ctx2, dirty) {
        if (
          /*member*/
          ctx2[58].canDib
        ) {
          if (if_block) {
            if_block.p(ctx2, dirty);
          } else {
            if_block = create_if_block_12(ctx2);
            if_block.c();
            if_block.m(span, null);
          }
        } else if (if_block) {
          if_block.d(1);
          if_block = null;
        }
      },
      d(detaching) {
        if (detaching) {
          detach(td);
        }
        if (if_block) if_block.d();
      }
    };
  }
  function create_if_block_12(ctx) {
    let span;
    let dibs_action;
    let mounted;
    let dispose;
    return {
      c() {
        span = element("span");
        attr(span, "class", "__warhelper_dibs");
        span.hidden = true;
        set_style(span, "display", "none");
      },
      m(target, anchor) {
        insert(target, span, anchor);
        if (!mounted) {
          dispose = action_destroyer(dibs_action = /*dibs*/
          ctx[14].call(
            null,
            span,
            /*member*/
            ctx[58].userId
          ));
          mounted = true;
        }
      },
      p(new_ctx, dirty) {
        ctx = new_ctx;
        if (dibs_action && is_function(dibs_action.update) && dirty[0] & /*state*/
        1) dibs_action.update.call(
          null,
          /*member*/
          ctx[58].userId
        );
      },
      d(detaching) {
        if (detaching) {
          detach(span);
        }
        mounted = false;
        dispose();
      }
    };
  }
  function create_if_block_10(ctx) {
    let span;
    let t_value = (
      /*member*/
      ctx[58].armor.code + ""
    );
    let t;
    let span_data_rarity_value;
    let span_title_value;
    return {
      c() {
        span = element("span");
        t = text(t_value);
        attr(span, "class", "__warhelper_war_overview_armor-tag");
        attr(span, "data-rarity", span_data_rarity_value = /*member*/
        ctx[58].armor.rarity || null);
        attr(span, "title", span_title_value = /*member*/
        ctx[58].armor.title);
        toggle_class(
          span,
          "partial",
          /*member*/
          ctx[58].armor.partial
        );
      },
      m(target, anchor) {
        insert(target, span, anchor);
        append(span, t);
      },
      p(ctx2, dirty) {
        if (dirty[0] & /*state*/
        1 && t_value !== (t_value = /*member*/
        ctx2[58].armor.code + "")) set_data(t, t_value);
        if (dirty[0] & /*state*/
        1 && span_data_rarity_value !== (span_data_rarity_value = /*member*/
        ctx2[58].armor.rarity || null)) {
          attr(span, "data-rarity", span_data_rarity_value);
        }
        if (dirty[0] & /*state*/
        1 && span_title_value !== (span_title_value = /*member*/
        ctx2[58].armor.title)) {
          attr(span, "title", span_title_value);
        }
        if (dirty[0] & /*state, sides*/
        17) {
          toggle_class(
            span,
            "partial",
            /*member*/
            ctx2[58].armor.partial
          );
        }
      },
      d(detaching) {
        if (detaching) {
          detach(span);
        }
      }
    };
  }
  function create_if_block_9(ctx) {
    let span;
    let t_value = (
      /*member*/
      ctx[58].statusDisplay.icon + ""
    );
    let t;
    return {
      c() {
        span = element("span");
        t = text(t_value);
        attr(span, "class", "__warhelper_status_icon");
      },
      m(target, anchor) {
        insert(target, span, anchor);
        append(span, t);
      },
      p(ctx2, dirty) {
        if (dirty[0] & /*state*/
        1 && t_value !== (t_value = /*member*/
        ctx2[58].statusDisplay.icon + "")) set_data(t, t_value);
      },
      d(detaching) {
        if (detaching) {
          detach(span);
        }
      }
    };
  }
  function create_if_block_8(ctx) {
    let span;
    let span_style_value;
    return {
      c() {
        span = element("span");
        attr(span, "class", "__warhelper_status_flag");
        attr(span, "style", span_style_value = `background-image: url("${/*member*/
        ctx[58].statusDisplay.flagUrl}");`);
      },
      m(target, anchor) {
        insert(target, span, anchor);
      },
      p(ctx2, dirty) {
        if (dirty[0] & /*state*/
        1 && span_style_value !== (span_style_value = `background-image: url("${/*member*/
        ctx2[58].statusDisplay.flagUrl}");`)) {
          attr(span, "style", span_style_value);
        }
      },
      d(detaching) {
        if (detaching) {
          detach(span);
        }
      }
    };
  }
  function create_if_block_7(ctx) {
    let span;
    let t_value = (
      /*member*/
      ctx[58].statusDisplay.detailText + ""
    );
    let t;
    let span_class_value;
    return {
      c() {
        span = element("span");
        t = text(t_value);
        attr(span, "class", span_class_value = `__warhelper_status_detail ${/*member*/
        ctx[58].statusDisplay.detailClass || ""}`);
      },
      m(target, anchor) {
        insert(target, span, anchor);
        append(span, t);
      },
      p(ctx2, dirty) {
        if (dirty[0] & /*state*/
        1 && t_value !== (t_value = /*member*/
        ctx2[58].statusDisplay.detailText + "")) set_data(t, t_value);
        if (dirty[0] & /*state*/
        1 && span_class_value !== (span_class_value = `__warhelper_status_detail ${/*member*/
        ctx2[58].statusDisplay.detailClass || ""}`)) {
          attr(span, "class", span_class_value);
        }
      },
      d(detaching) {
        if (detaching) {
          detach(span);
        }
      }
    };
  }
  function create_if_block_6(ctx) {
    let td;
    let t_value = (
      /*member*/
      ctx[58].scoreDisplay + ""
    );
    let t;
    return {
      c() {
        td = element("td");
        t = text(t_value);
        attr(td, "class", "__warhelper_war_overview_score");
      },
      m(target, anchor) {
        insert(target, td, anchor);
        append(td, t);
      },
      p(ctx2, dirty) {
        if (dirty[0] & /*state*/
        1 && t_value !== (t_value = /*member*/
        ctx2[58].scoreDisplay + "")) set_data(t, t_value);
      },
      d(detaching) {
        if (detaching) {
          detach(td);
        }
      }
    };
  }
  function create_if_block_5(ctx) {
    let td;
    let t_value = (
      /*member*/
      (ctx[58].armor?.code || "") + ""
    );
    let t;
    let td_data_rarity_value;
    let td_title_value;
    return {
      c() {
        td = element("td");
        t = text(t_value);
        attr(td, "class", "__warhelper_war_overview_armor");
        attr(td, "data-rarity", td_data_rarity_value = /*member*/
        ctx[58].armor?.rarity || null);
        attr(td, "title", td_title_value = /*member*/
        ctx[58].armor?.title || "");
        toggle_class(
          td,
          "partial",
          /*member*/
          ctx[58].armor?.partial
        );
      },
      m(target, anchor) {
        insert(target, td, anchor);
        append(td, t);
      },
      p(ctx2, dirty) {
        if (dirty[0] & /*state*/
        1 && t_value !== (t_value = /*member*/
        (ctx2[58].armor?.code || "") + "")) set_data(t, t_value);
        if (dirty[0] & /*state*/
        1 && td_data_rarity_value !== (td_data_rarity_value = /*member*/
        ctx2[58].armor?.rarity || null)) {
          attr(td, "data-rarity", td_data_rarity_value);
        }
        if (dirty[0] & /*state*/
        1 && td_title_value !== (td_title_value = /*member*/
        ctx2[58].armor?.title || "")) {
          attr(td, "title", td_title_value);
        }
        if (dirty[0] & /*state, sides*/
        17) {
          toggle_class(
            td,
            "partial",
            /*member*/
            ctx2[58].armor?.partial
          );
        }
      },
      d(detaching) {
        if (detaching) {
          detach(td);
        }
      }
    };
  }
  function create_if_block_4(ctx) {
    let span;
    let t_value = (
      /*member*/
      ctx[58].armor.code.slice(0, 3) + ""
    );
    let t;
    let span_data_rarity_value;
    return {
      c() {
        span = element("span");
        t = text(t_value);
        attr(span, "class", "__warhelper_war_overview_armor-badge");
        attr(span, "data-rarity", span_data_rarity_value = /*member*/
        ctx[58].armor.rarity || null);
        toggle_class(
          span,
          "partial",
          /*member*/
          ctx[58].armor.partial
        );
      },
      m(target, anchor) {
        insert(target, span, anchor);
        append(span, t);
      },
      p(ctx2, dirty) {
        if (dirty[0] & /*state*/
        1 && t_value !== (t_value = /*member*/
        ctx2[58].armor.code.slice(0, 3) + "")) set_data(t, t_value);
        if (dirty[0] & /*state*/
        1 && span_data_rarity_value !== (span_data_rarity_value = /*member*/
        ctx2[58].armor.rarity || null)) {
          attr(span, "data-rarity", span_data_rarity_value);
        }
        if (dirty[0] & /*state, sides*/
        17) {
          toggle_class(
            span,
            "partial",
            /*member*/
            ctx2[58].armor.partial
          );
        }
      },
      d(detaching) {
        if (detaching) {
          detach(span);
        }
      }
    };
  }
  function create_if_block_3(ctx) {
    let td;
    let button;
    let mounted;
    let dispose;
    function click_handler_18() {
      return (
        /*click_handler_18*/
        ctx[51](
          /*member*/
          ctx[58]
        )
      );
    }
    return {
      c() {
        td = element("td");
        button = element("button");
        button.textContent = "\u2694\uFE0E";
        attr(button, "class", "__warhelper_war_overview_attack-button");
        attr(button, "type", "button");
        attr(button, "aria-label", "Attack");
        attr(td, "class", "__warhelper_war_overview_attack");
      },
      m(target, anchor) {
        insert(target, td, anchor);
        append(td, button);
        if (!mounted) {
          dispose = listen(button, "click", click_handler_18);
          mounted = true;
        }
      },
      p(new_ctx, dirty) {
        ctx = new_ctx;
      },
      d(detaching) {
        if (detaching) {
          detach(td);
        }
        mounted = false;
        dispose();
      }
    };
  }
  function create_each_block_1(key_1, ctx) {
    let tr;
    let td0;
    let span2;
    let button;
    let span0;
    let t0;
    let span1;
    let button_class_value;
    let t1;
    let t2;
    let td1;
    let span3;
    let a;
    let t3_value = (
      /*member*/
      ctx[58].name + ""
    );
    let t3;
    let a_href_value;
    let t4;
    let t5;
    let td2;
    let span5;
    let t6;
    let t7;
    let span4;
    let t8_value = (
      /*member*/
      ctx[58].statusDisplay.text + ""
    );
    let t8;
    let t9;
    let td2_class_value;
    let td2_title_value;
    let td2_data_warhelper_status_user_id_value;
    let flyStatus_action;
    let t10;
    let t11;
    let t12;
    let td3;
    let html_tag;
    let raw_value = (
      /*member*/
      ctx[58].stats.html + ""
    );
    let t13;
    let td3_data_bs_value;
    let tooltip_action;
    let t14;
    let t15;
    let tr_data_warhelper_user_id_value;
    let tr_class_value;
    let tr_style_value;
    let mounted;
    let dispose;
    function click_handler_17() {
      return (
        /*click_handler_17*/
        ctx[50](
          /*member*/
          ctx[58]
        )
      );
    }
    let if_block0 = (
      /*table*/
      ctx[55].showDibsColumn && create_if_block_11(ctx)
    );
    let if_block1 = (
      /*table*/
      ctx[55].showArmorTag && /*member*/
      ctx[58].armor && create_if_block_10(ctx)
    );
    let if_block2 = (
      /*member*/
      ctx[58].statusDisplay.icon && create_if_block_9(ctx)
    );
    let if_block3 = (
      /*member*/
      ctx[58].statusDisplay.flagUrl && create_if_block_8(ctx)
    );
    let if_block4 = (
      /*member*/
      ctx[58].statusDisplay.detailText && create_if_block_7(ctx)
    );
    let if_block5 = (
      /*table*/
      ctx[55].showScoreColumn && create_if_block_6(ctx)
    );
    let if_block6 = (
      /*table*/
      ctx[55].showArmorColumn && create_if_block_5(ctx)
    );
    let if_block7 = (
      /*table*/
      ctx[55].showArmorBadge && /*member*/
      ctx[58].armor && create_if_block_4(ctx)
    );
    let if_block8 = (
      /*table*/
      ctx[55].showAttackColumn && create_if_block_3(ctx)
    );
    return {
      key: key_1,
      first: null,
      c() {
        tr = element("tr");
        td0 = element("td");
        span2 = element("span");
        button = element("button");
        span0 = element("span");
        t0 = space();
        span1 = element("span");
        t1 = space();
        if (if_block0) if_block0.c();
        t2 = space();
        td1 = element("td");
        span3 = element("span");
        a = element("a");
        t3 = text(t3_value);
        t4 = space();
        if (if_block1) if_block1.c();
        t5 = space();
        td2 = element("td");
        span5 = element("span");
        if (if_block2) if_block2.c();
        t6 = space();
        if (if_block3) if_block3.c();
        t7 = space();
        span4 = element("span");
        t8 = text(t8_value);
        t9 = space();
        if (if_block4) if_block4.c();
        t10 = space();
        if (if_block5) if_block5.c();
        t11 = space();
        if (if_block6) if_block6.c();
        t12 = space();
        td3 = element("td");
        html_tag = new HtmlTag(false);
        t13 = space();
        if (if_block7) if_block7.c();
        t14 = space();
        if (if_block8) if_block8.c();
        t15 = space();
        attr(span0, "class", "__warhelper_war_overview_favorite-dot");
        attr(span1, "class", "__warhelper_war_overview_favorite-star");
        attr(button, "class", button_class_value = `__warhelper_war_overview_favorite ${/*member*/
        ctx[58].onlineStatus}`);
        attr(button, "type", "button");
        toggle_class(
          button,
          "active",
          /*member*/
          ctx[58].isFavorite
        );
        attr(span2, "class", "__warhelper_war_overview_controls-content");
        attr(td0, "class", "__warhelper_war_overview_controls");
        attr(a, "href", a_href_value = /*member*/
        ctx[58].profileHref);
        attr(span3, "class", "__warhelper_war_overview_name-content");
        attr(td1, "class", "__warhelper_war_overview_name");
        attr(span4, "class", "__warhelper_status_text");
        attr(span5, "class", "__warhelper_status_main");
        attr(td2, "class", td2_class_value = `__warhelper_war_overview_status status ${/*member*/
        ctx[58].statusClasses}`);
        attr(td2, "title", td2_title_value = /*member*/
        ctx[58].statusDisplay.title || null);
        attr(td2, "data-warhelper-status-user-id", td2_data_warhelper_status_user_id_value = /*member*/
        ctx[58].userId);
        toggle_class(
          td2,
          "__warhelper_status_multiline",
          /*member*/
          ctx[58].statusDisplay.icon || /*member*/
          ctx[58].statusDisplay.flagUrl || /*member*/
          ctx[58].statusDisplay.detailText
        );
        html_tag.a = t13;
        attr(td3, "class", "__warhelper_war_overview_stats");
        attr(td3, "data-bs", td3_data_bs_value = /*member*/
        ctx[58].stats.sortValue);
        attr(tr, "data-warhelper-user-id", tr_data_warhelper_user_id_value = /*member*/
        ctx[58].userId);
        attr(tr, "class", tr_class_value = /*member*/
        ctx[58].flashClass || "");
        attr(tr, "style", tr_style_value = /*member*/
        ctx[58].flashDelayMs ? `--wh-row-flash-delay: ${/*member*/
        ctx[58].flashDelayMs}ms;` : "");
        toggle_class(
          tr,
          "__warhelper_war_overview_favorite-separator",
          /*member*/
          ctx[58].favoriteSeparator
        );
        toggle_class(
          tr,
          "__warhelper_war_overview_row-early",
          /*member*/
          ctx[58].early
        );
        this.first = tr;
      },
      m(target, anchor) {
        insert(target, tr, anchor);
        append(tr, td0);
        append(td0, span2);
        append(span2, button);
        append(button, span0);
        append(button, t0);
        append(button, span1);
        append(tr, t1);
        if (if_block0) if_block0.m(tr, null);
        append(tr, t2);
        append(tr, td1);
        append(td1, span3);
        append(span3, a);
        append(a, t3);
        append(span3, t4);
        if (if_block1) if_block1.m(span3, null);
        append(tr, t5);
        append(tr, td2);
        append(td2, span5);
        if (if_block2) if_block2.m(span5, null);
        append(span5, t6);
        if (if_block3) if_block3.m(span5, null);
        append(span5, t7);
        append(span5, span4);
        append(span4, t8);
        append(td2, t9);
        if (if_block4) if_block4.m(td2, null);
        append(tr, t10);
        if (if_block5) if_block5.m(tr, null);
        append(tr, t11);
        if (if_block6) if_block6.m(tr, null);
        append(tr, t12);
        append(tr, td3);
        html_tag.m(raw_value, td3);
        append(td3, t13);
        if (if_block7) if_block7.m(td3, null);
        append(tr, t14);
        if (if_block8) if_block8.m(tr, null);
        append(tr, t15);
        if (!mounted) {
          dispose = [
            listen(button, "click", stop_propagation(prevent_default(click_handler_17))),
            action_destroyer(flyStatus_action = /*flyStatus*/
            ctx[15].call(null, td2, {
              userId: (
                /*member*/
                ctx[58].userId
              ),
              factionId: (
                /*member*/
                ctx[58].factionId
              ),
              active: (
                /*member*/
                ctx[58].statusDisplay.isTraveling
              )
            })),
            action_destroyer(tooltip_action = /*tooltip*/
            ctx[16].call(null, td3, {
              content: (
                /*member*/
                ctx[58].stats.tooltip
              ),
              html: true,
              placement: "element"
            }))
          ];
          mounted = true;
        }
      },
      p(new_ctx, dirty) {
        ctx = new_ctx;
        if (dirty[0] & /*state*/
        1 && button_class_value !== (button_class_value = `__warhelper_war_overview_favorite ${/*member*/
        ctx[58].onlineStatus}`)) {
          attr(button, "class", button_class_value);
        }
        if (dirty[0] & /*state, state, sides*/
        17) {
          toggle_class(
            button,
            "active",
            /*member*/
            ctx[58].isFavorite
          );
        }
        if (
          /*table*/
          ctx[55].showDibsColumn
        ) {
          if (if_block0) {
            if_block0.p(ctx, dirty);
          } else {
            if_block0 = create_if_block_11(ctx);
            if_block0.c();
            if_block0.m(tr, t2);
          }
        } else if (if_block0) {
          if_block0.d(1);
          if_block0 = null;
        }
        if (dirty[0] & /*state*/
        1 && t3_value !== (t3_value = /*member*/
        ctx[58].name + "")) set_data(t3, t3_value);
        if (dirty[0] & /*state*/
        1 && a_href_value !== (a_href_value = /*member*/
        ctx[58].profileHref)) {
          attr(a, "href", a_href_value);
        }
        if (
          /*table*/
          ctx[55].showArmorTag && /*member*/
          ctx[58].armor
        ) {
          if (if_block1) {
            if_block1.p(ctx, dirty);
          } else {
            if_block1 = create_if_block_10(ctx);
            if_block1.c();
            if_block1.m(span3, null);
          }
        } else if (if_block1) {
          if_block1.d(1);
          if_block1 = null;
        }
        if (
          /*member*/
          ctx[58].statusDisplay.icon
        ) {
          if (if_block2) {
            if_block2.p(ctx, dirty);
          } else {
            if_block2 = create_if_block_9(ctx);
            if_block2.c();
            if_block2.m(span5, t6);
          }
        } else if (if_block2) {
          if_block2.d(1);
          if_block2 = null;
        }
        if (
          /*member*/
          ctx[58].statusDisplay.flagUrl
        ) {
          if (if_block3) {
            if_block3.p(ctx, dirty);
          } else {
            if_block3 = create_if_block_8(ctx);
            if_block3.c();
            if_block3.m(span5, t7);
          }
        } else if (if_block3) {
          if_block3.d(1);
          if_block3 = null;
        }
        if (dirty[0] & /*state*/
        1 && t8_value !== (t8_value = /*member*/
        ctx[58].statusDisplay.text + "")) set_data(t8, t8_value);
        if (
          /*member*/
          ctx[58].statusDisplay.detailText
        ) {
          if (if_block4) {
            if_block4.p(ctx, dirty);
          } else {
            if_block4 = create_if_block_7(ctx);
            if_block4.c();
            if_block4.m(td2, null);
          }
        } else if (if_block4) {
          if_block4.d(1);
          if_block4 = null;
        }
        if (dirty[0] & /*state*/
        1 && td2_class_value !== (td2_class_value = `__warhelper_war_overview_status status ${/*member*/
        ctx[58].statusClasses}`)) {
          attr(td2, "class", td2_class_value);
        }
        if (dirty[0] & /*state*/
        1 && td2_title_value !== (td2_title_value = /*member*/
        ctx[58].statusDisplay.title || null)) {
          attr(td2, "title", td2_title_value);
        }
        if (dirty[0] & /*state*/
        1 && td2_data_warhelper_status_user_id_value !== (td2_data_warhelper_status_user_id_value = /*member*/
        ctx[58].userId)) {
          attr(td2, "data-warhelper-status-user-id", td2_data_warhelper_status_user_id_value);
        }
        if (flyStatus_action && is_function(flyStatus_action.update) && dirty[0] & /*state*/
        1) flyStatus_action.update.call(null, {
          userId: (
            /*member*/
            ctx[58].userId
          ),
          factionId: (
            /*member*/
            ctx[58].factionId
          ),
          active: (
            /*member*/
            ctx[58].statusDisplay.isTraveling
          )
        });
        if (dirty[0] & /*state, state, sides*/
        17) {
          toggle_class(
            td2,
            "__warhelper_status_multiline",
            /*member*/
            ctx[58].statusDisplay.icon || /*member*/
            ctx[58].statusDisplay.flagUrl || /*member*/
            ctx[58].statusDisplay.detailText
          );
        }
        if (
          /*table*/
          ctx[55].showScoreColumn
        ) {
          if (if_block5) {
            if_block5.p(ctx, dirty);
          } else {
            if_block5 = create_if_block_6(ctx);
            if_block5.c();
            if_block5.m(tr, t11);
          }
        } else if (if_block5) {
          if_block5.d(1);
          if_block5 = null;
        }
        if (
          /*table*/
          ctx[55].showArmorColumn
        ) {
          if (if_block6) {
            if_block6.p(ctx, dirty);
          } else {
            if_block6 = create_if_block_5(ctx);
            if_block6.c();
            if_block6.m(tr, t12);
          }
        } else if (if_block6) {
          if_block6.d(1);
          if_block6 = null;
        }
        if (dirty[0] & /*state*/
        1 && raw_value !== (raw_value = /*member*/
        ctx[58].stats.html + "")) html_tag.p(raw_value);
        if (
          /*table*/
          ctx[55].showArmorBadge && /*member*/
          ctx[58].armor
        ) {
          if (if_block7) {
            if_block7.p(ctx, dirty);
          } else {
            if_block7 = create_if_block_4(ctx);
            if_block7.c();
            if_block7.m(td3, null);
          }
        } else if (if_block7) {
          if_block7.d(1);
          if_block7 = null;
        }
        if (dirty[0] & /*state*/
        1 && td3_data_bs_value !== (td3_data_bs_value = /*member*/
        ctx[58].stats.sortValue)) {
          attr(td3, "data-bs", td3_data_bs_value);
        }
        if (tooltip_action && is_function(tooltip_action.update) && dirty[0] & /*state*/
        1) tooltip_action.update.call(null, {
          content: (
            /*member*/
            ctx[58].stats.tooltip
          ),
          html: true,
          placement: "element"
        });
        if (
          /*table*/
          ctx[55].showAttackColumn
        ) {
          if (if_block8) {
            if_block8.p(ctx, dirty);
          } else {
            if_block8 = create_if_block_3(ctx);
            if_block8.c();
            if_block8.m(tr, t15);
          }
        } else if (if_block8) {
          if_block8.d(1);
          if_block8 = null;
        }
        if (dirty[0] & /*state*/
        1 && tr_data_warhelper_user_id_value !== (tr_data_warhelper_user_id_value = /*member*/
        ctx[58].userId)) {
          attr(tr, "data-warhelper-user-id", tr_data_warhelper_user_id_value);
        }
        if (dirty[0] & /*state*/
        1 && tr_class_value !== (tr_class_value = /*member*/
        ctx[58].flashClass || "")) {
          attr(tr, "class", tr_class_value);
        }
        if (dirty[0] & /*state*/
        1 && tr_style_value !== (tr_style_value = /*member*/
        ctx[58].flashDelayMs ? `--wh-row-flash-delay: ${/*member*/
        ctx[58].flashDelayMs}ms;` : "")) {
          attr(tr, "style", tr_style_value);
        }
        if (dirty[0] & /*state, state, sides*/
        17) {
          toggle_class(
            tr,
            "__warhelper_war_overview_favorite-separator",
            /*member*/
            ctx[58].favoriteSeparator
          );
        }
        if (dirty[0] & /*state, state, sides*/
        17) {
          toggle_class(
            tr,
            "__warhelper_war_overview_row-early",
            /*member*/
            ctx[58].early
          );
        }
      },
      d(detaching) {
        if (detaching) {
          detach(tr);
        }
        if (if_block0) if_block0.d();
        if (if_block1) if_block1.d();
        if (if_block2) if_block2.d();
        if (if_block3) if_block3.d();
        if (if_block4) if_block4.d();
        if (if_block5) if_block5.d();
        if (if_block6) if_block6.d();
        if (if_block7) if_block7.d();
        if (if_block8) if_block8.d();
        mounted = false;
        run_all(dispose);
      }
    };
  }
  function create_if_block_1(ctx) {
    let div;
    let t_value = (
      /*table*/
      ctx[55].emptyText + ""
    );
    let t;
    return {
      c() {
        div = element("div");
        t = text(t_value);
        attr(div, "class", "__warhelper_war_overview_empty");
      },
      m(target, anchor) {
        insert(target, div, anchor);
        append(div, t);
      },
      p(ctx2, dirty) {
        if (dirty[0] & /*state*/
        1 && t_value !== (t_value = /*table*/
        ctx2[55].emptyText + "")) set_data(t, t_value);
      },
      d(detaching) {
        if (detaching) {
          detach(div);
        }
      }
    };
  }
  function create_each_block(ctx) {
    let if_block_anchor;
    let if_block = (
      /*table*/
      ctx[55] && create_if_block(ctx)
    );
    return {
      c() {
        if (if_block) if_block.c();
        if_block_anchor = empty();
      },
      m(target, anchor) {
        if (if_block) if_block.m(target, anchor);
        insert(target, if_block_anchor, anchor);
      },
      p(ctx2, dirty) {
        if (
          /*table*/
          ctx2[55]
        ) {
          if (if_block) {
            if_block.p(ctx2, dirty);
          } else {
            if_block = create_if_block(ctx2);
            if_block.c();
            if_block.m(if_block_anchor.parentNode, if_block_anchor);
          }
        } else if (if_block) {
          if_block.d(1);
          if_block = null;
        }
      },
      d(detaching) {
        if (detaching) {
          detach(if_block_anchor);
        }
        if (if_block) if_block.d(detaching);
      }
    };
  }
  function create_fragment(ctx) {
    let div0;
    let span0;
    let t1;
    let t2;
    let t3;
    let span1;
    let t4_value = (
      /*state*/
      ctx[0].stateText + ""
    );
    let t4;
    let t5;
    let t6;
    let div1;
    let t7;
    let button;
    let t9;
    let div1_aria_expanded_value;
    let t10;
    let t11;
    let t12;
    let div2;
    let t13;
    let div3;
    let mounted;
    let dispose;
    let if_block0 = (
      /*state*/
      ctx[0].loadoutPrefetch && create_if_block_40(get_if_ctx_1(ctx))
    );
    let if_block1 = (
      /*state*/
      ctx[0].update && create_if_block_39(ctx)
    );
    let if_block2 = (
      /*state*/
      ctx[0].missedUpdates && create_if_block_38(ctx)
    );
    function select_block_type(ctx2, dirty) {
      if (
        /*state*/
        ctx2[0].decayEnd
      ) return create_if_block_36;
      return create_else_block_1;
    }
    let current_block_type = select_block_type(ctx, [-1, -1, -1]);
    let if_block3 = current_block_type(ctx);
    let if_block4 = (
      /*state*/
      ctx[0].decayGraph && create_if_block_35(ctx)
    );
    let if_block5 = (
      /*state*/
      ctx[0].decayGraph?.expanded && create_if_block_28(get_if_ctx(ctx))
    );
    let if_block6 = (
      /*state*/
      ctx[0].opponentChain && create_if_block_27(ctx)
    );
    let each_value_5 = ensure_array_like(
      /*sides*/
      ctx[4]
    );
    let each_blocks_1 = [];
    for (let i = 0; i < each_value_5.length; i += 1) {
      each_blocks_1[i] = create_each_block_5(get_each_context_5(ctx, each_value_5, i));
    }
    let each_value = ensure_array_like(
      /*sides*/
      ctx[4]
    );
    let each_blocks = [];
    for (let i = 0; i < each_value.length; i += 1) {
      each_blocks[i] = create_each_block(get_each_context(ctx, each_value, i));
    }
    return {
      c() {
        div0 = element("div");
        span0 = element("span");
        span0.textContent = "War Helper";
        t1 = space();
        if (if_block0) if_block0.c();
        t2 = space();
        if (if_block1) if_block1.c();
        t3 = space();
        span1 = element("span");
        t4 = text(t4_value);
        t5 = space();
        if (if_block2) if_block2.c();
        t6 = space();
        div1 = element("div");
        if_block3.c();
        t7 = space();
        button = element("button");
        button.textContent = "\u21BB";
        t9 = space();
        if (if_block4) if_block4.c();
        t10 = space();
        if (if_block5) if_block5.c();
        t11 = space();
        if (if_block6) if_block6.c();
        t12 = space();
        div2 = element("div");
        for (let i = 0; i < each_blocks_1.length; i += 1) {
          each_blocks_1[i].c();
        }
        t13 = space();
        div3 = element("div");
        for (let i = 0; i < each_blocks.length; i += 1) {
          each_blocks[i].c();
        }
        attr(span0, "class", "__warhelper_war_overview_title");
        attr(span1, "class", "__warhelper_war_overview_state");
        attr(div0, "class", "__warhelper_war_overview_header");
        attr(button, "class", "__warhelper_war_overview_decay-refresh");
        attr(button, "type", "button");
        attr(button, "aria-label", "Refresh war data");
        attr(div1, "class", "__warhelper_war_overview_decay");
        attr(div1, "role", "button");
        attr(div1, "tabindex", "0");
        attr(div1, "aria-expanded", div1_aria_expanded_value = /*state*/
        ctx[0].decayGraph?.expanded);
        attr(div2, "class", "__warhelper_war_overview_mobile-tabs");
        attr(div2, "role", "tablist");
        attr(div2, "aria-label", "War factions");
        toggle_class(div3, "__warhelper_war_overview_columns", true);
        toggle_class(
          div3,
          "__warhelper_war_overview_columns_enemy-collapsed",
          /*state*/
          ctx[0].tables.enemy?.collapsed
        );
        toggle_class(
          div3,
          "__warhelper_war_overview_columns_own-collapsed",
          /*state*/
          ctx[0].tables.own?.collapsed
        );
      },
      m(target, anchor) {
        insert(target, div0, anchor);
        append(div0, span0);
        append(div0, t1);
        if (if_block0) if_block0.m(div0, null);
        append(div0, t2);
        if (if_block1) if_block1.m(div0, null);
        append(div0, t3);
        append(div0, span1);
        append(span1, t4);
        insert(target, t5, anchor);
        if (if_block2) if_block2.m(target, anchor);
        insert(target, t6, anchor);
        insert(target, div1, anchor);
        if_block3.m(div1, null);
        append(div1, t7);
        append(div1, button);
        append(div1, t9);
        if (if_block4) if_block4.m(div1, null);
        insert(target, t10, anchor);
        if (if_block5) if_block5.m(target, anchor);
        insert(target, t11, anchor);
        if (if_block6) if_block6.m(target, anchor);
        insert(target, t12, anchor);
        insert(target, div2, anchor);
        for (let i = 0; i < each_blocks_1.length; i += 1) {
          if (each_blocks_1[i]) {
            each_blocks_1[i].m(div2, null);
          }
        }
        insert(target, t13, anchor);
        insert(target, div3, anchor);
        for (let i = 0; i < each_blocks.length; i += 1) {
          if (each_blocks[i]) {
            each_blocks[i].m(div3, null);
          }
        }
        if (!mounted) {
          dispose = [
            listen(
              button,
              "click",
              /*click_handler_2*/
              ctx[24]
            ),
            listen(
              div1,
              "click",
              /*toggleDecayGraph*/
              ctx[9]
            ),
            listen(
              div1,
              "keydown",
              /*activateDecayGraph*/
              ctx[8]
            )
          ];
          mounted = true;
        }
      },
      p(ctx2, dirty) {
        if (
          /*state*/
          ctx2[0].loadoutPrefetch
        ) {
          if (if_block0) {
            if_block0.p(get_if_ctx_1(ctx2), dirty);
          } else {
            if_block0 = create_if_block_40(get_if_ctx_1(ctx2));
            if_block0.c();
            if_block0.m(div0, t2);
          }
        } else if (if_block0) {
          if_block0.d(1);
          if_block0 = null;
        }
        if (
          /*state*/
          ctx2[0].update
        ) {
          if (if_block1) {
            if_block1.p(ctx2, dirty);
          } else {
            if_block1 = create_if_block_39(ctx2);
            if_block1.c();
            if_block1.m(div0, t3);
          }
        } else if (if_block1) {
          if_block1.d(1);
          if_block1 = null;
        }
        if (dirty[0] & /*state*/
        1 && t4_value !== (t4_value = /*state*/
        ctx2[0].stateText + "")) set_data(t4, t4_value);
        if (
          /*state*/
          ctx2[0].missedUpdates
        ) {
          if (if_block2) {
            if_block2.p(ctx2, dirty);
          } else {
            if_block2 = create_if_block_38(ctx2);
            if_block2.c();
            if_block2.m(t6.parentNode, t6);
          }
        } else if (if_block2) {
          if_block2.d(1);
          if_block2 = null;
        }
        if (current_block_type === (current_block_type = select_block_type(ctx2, dirty)) && if_block3) {
          if_block3.p(ctx2, dirty);
        } else {
          if_block3.d(1);
          if_block3 = current_block_type(ctx2);
          if (if_block3) {
            if_block3.c();
            if_block3.m(div1, t7);
          }
        }
        if (
          /*state*/
          ctx2[0].decayGraph
        ) {
          if (if_block4) {
            if_block4.p(ctx2, dirty);
          } else {
            if_block4 = create_if_block_35(ctx2);
            if_block4.c();
            if_block4.m(div1, null);
          }
        } else if (if_block4) {
          if_block4.d(1);
          if_block4 = null;
        }
        if (dirty[0] & /*state*/
        1 && div1_aria_expanded_value !== (div1_aria_expanded_value = /*state*/
        ctx2[0].decayGraph?.expanded)) {
          attr(div1, "aria-expanded", div1_aria_expanded_value);
        }
        if (
          /*state*/
          ctx2[0].decayGraph?.expanded
        ) {
          if (if_block5) {
            if_block5.p(get_if_ctx(ctx2), dirty);
          } else {
            if_block5 = create_if_block_28(get_if_ctx(ctx2));
            if_block5.c();
            if_block5.m(t11.parentNode, t11);
          }
        } else if (if_block5) {
          if_block5.d(1);
          if_block5 = null;
        }
        if (
          /*state*/
          ctx2[0].opponentChain
        ) {
          if (if_block6) {
            if_block6.p(ctx2, dirty);
          } else {
            if_block6 = create_if_block_27(ctx2);
            if_block6.c();
            if_block6.m(t12.parentNode, t12);
          }
        } else if (if_block6) {
          if_block6.d(1);
          if_block6 = null;
        }
        if (dirty[0] & /*state, sides, actions, activateTabOnKey*/
        1043) {
          each_value_5 = ensure_array_like(
            /*sides*/
            ctx2[4]
          );
          let i;
          for (i = 0; i < each_value_5.length; i += 1) {
            const child_ctx = get_each_context_5(ctx2, each_value_5, i);
            if (each_blocks_1[i]) {
              each_blocks_1[i].p(child_ctx, dirty);
            } else {
              each_blocks_1[i] = create_each_block_5(child_ctx);
              each_blocks_1[i].c();
              each_blocks_1[i].m(div2, null);
            }
          }
          for (; i < each_blocks_1.length; i += 1) {
            each_blocks_1[i].d(1);
          }
          each_blocks_1.length = each_value_5.length;
        }
        if (dirty[0] & /*sides, mobileTabs, state, actions, activateOnKey, statusOptions, onlineOptions, togglePanel*/
        2299) {
          each_value = ensure_array_like(
            /*sides*/
            ctx2[4]
          );
          let i;
          for (i = 0; i < each_value.length; i += 1) {
            const child_ctx = get_each_context(ctx2, each_value, i);
            if (each_blocks[i]) {
              each_blocks[i].p(child_ctx, dirty);
            } else {
              each_blocks[i] = create_each_block(child_ctx);
              each_blocks[i].c();
              each_blocks[i].m(div3, null);
            }
          }
          for (; i < each_blocks.length; i += 1) {
            each_blocks[i].d(1);
          }
          each_blocks.length = each_value.length;
        }
        if (dirty[0] & /*state*/
        1) {
          toggle_class(
            div3,
            "__warhelper_war_overview_columns_enemy-collapsed",
            /*state*/
            ctx2[0].tables.enemy?.collapsed
          );
        }
        if (dirty[0] & /*state*/
        1) {
          toggle_class(
            div3,
            "__warhelper_war_overview_columns_own-collapsed",
            /*state*/
            ctx2[0].tables.own?.collapsed
          );
        }
      },
      i: noop,
      o: noop,
      d(detaching) {
        if (detaching) {
          detach(div0);
          detach(t5);
          detach(t6);
          detach(div1);
          detach(t10);
          detach(t11);
          detach(t12);
          detach(div2);
          detach(t13);
          detach(div3);
        }
        if (if_block0) if_block0.d();
        if (if_block1) if_block1.d();
        if (if_block2) if_block2.d(detaching);
        if_block3.d();
        if (if_block4) if_block4.d();
        if (if_block5) if_block5.d(detaching);
        if (if_block6) if_block6.d(detaching);
        destroy_each(each_blocks_1, detaching);
        destroy_each(each_blocks, detaching);
        mounted = false;
        run_all(dispose);
      }
    };
  }
  function sortClass(table, field) {
    if (table.sortState.field !== field) {
      return "";
    }
    return table.sortState.asc ? "active asc" : "active desc";
  }
  function filterActiveClass(active) {
    return active ? "active" : "";
  }
  function stop(event) {
    event.preventDefault();
    event.stopPropagation();
  }
  function graphTooltipX(point, graph) {
    const width = 188;
    return point.x > graph.width - width - 10 ? point.x - width - 10 : point.x + 10;
  }
  function graphTooltipY(point, graph) {
    const height = 78;
    const preferred = point.scoreY - height / 2;
    return Math.max(8, Math.min(preferred, graph.height - height - 8));
  }
  function instance($$self, $$props, $$invalidate) {
    let { state = {
      stateText: "",
      bypassBodyHold: false,
      decayEnd: null,
      missedUpdates: false,
      loadoutPrefetch: null,
      update: null,
      opponentChain: null,
      decayGraph: { expanded: false, hasData: false },
      tables: { enemy: void 0, own: void 0 }
    } } = $$props;
    let { actions = {} } = $$props;
    let graphHover = null;
    let mobileTabs = false;
    const sides = ["enemy", "own"];
    const statusOptions = [
      { value: "okay", label: "Okay" },
      { value: "hospital", label: "Hospital" },
      { value: "jail", label: "Jail" },
      { value: "traveling", label: "Travelling" },
      { value: "abroad", label: "Abroad" }
    ];
    const onlineOptions = [
      { value: "online", label: "Online" },
      { value: "idle", label: "Idle" },
      { value: "offline", label: "Offline" }
    ];
    onMount(() => {
      const media = window.matchMedia("(max-width: 784px)");
      const update2 = () => {
        $$invalidate(3, mobileTabs = media.matches);
      };
      update2();
      if (typeof media.addEventListener === "function") {
        media.addEventListener("change", update2);
        return () => media.removeEventListener("change", update2);
      }
      media.addListener(update2);
      return () => media.removeListener(update2);
    });
    function activateOnKey(event, side, collapsedOnly = false) {
      if (mobileTabs) {
        return;
      }
      if (event.key !== "Enter" && event.key !== " ") {
        return;
      }
      event.preventDefault();
      if (!collapsedOnly || state.tables[side]?.collapsed) {
        actions.toggleCollapse?.(side);
      }
    }
    function activateDecayGraph(event) {
      if (event.key !== "Enter" && event.key !== " ") {
        return;
      }
      event.preventDefault();
      toggleDecayGraph();
    }
    function toggleDecayGraph() {
      if (!state.decayGraph) {
        return;
      }
      $$invalidate(2, graphHover = null);
      actions.toggleDecayGraph?.();
    }
    function activateTabOnKey(event, side) {
      if (event.key !== "Enter" && event.key !== " ") {
        return;
      }
      event.preventDefault();
      actions.setActiveMobileTab?.(side);
    }
    function togglePanel(event, side) {
      event.stopPropagation();
      if (!mobileTabs) {
        actions.toggleCollapse?.(side);
      }
    }
    function updateGraphHover(event, graph) {
      if (!graph?.hoverPoints?.length) {
        $$invalidate(2, graphHover = null);
        return;
      }
      const rect = event.currentTarget.getBoundingClientRect();
      const svgX = (event.clientX - rect.left) * (graph.width / rect.width);
      let closest = graph.hoverPoints[0];
      let closestDistance = Math.abs(closest.x - svgX);
      for (let index = 1; index < graph.hoverPoints.length; index++) {
        const point = graph.hoverPoints[index];
        const distance = Math.abs(point.x - svgX);
        if (distance < closestDistance) {
          closest = point;
          closestDistance = distance;
        }
      }
      $$invalidate(2, graphHover = closest);
    }
    function clearGraphHover() {
      $$invalidate(2, graphHover = null);
    }
    function dibs(node, userId) {
      actions.bindDibs?.(node, userId);
      return {
        update(nextUserId) {
          actions.bindDibs?.(node, nextUserId);
        },
        destroy() {
          node.hidden = true;
          node.style.display = "none";
          node.textContent = "";
        }
      };
    }
    function flyStatus(node, params) {
      actions.bindFlyStatus?.(node, params);
      return {
        update(next) {
          actions.bindFlyStatus?.(node, next);
        }
      };
    }
    function tooltip(node, options) {
      return Tooltip.bind(node, options);
    }
    function submit_handler_3(event) {
      bubble.call(this, $$self, event);
    }
    function submit_handler_2(event) {
      bubble.call(this, $$self, event);
    }
    function submit_handler_1(event) {
      bubble.call(this, $$self, event);
    }
    function click_handler(event) {
      bubble.call(this, $$self, event);
    }
    function keydown_handler(event) {
      bubble.call(this, $$self, event);
    }
    function submit_handler(event) {
      bubble.call(this, $$self, event);
    }
    const click_handler_1 = (event) => {
      stop(event);
      actions.refreshWarData?.();
    };
    const click_handler_2 = (event) => {
      stop(event);
      actions.refreshWarData?.();
      actions.checkForUpdate?.();
    };
    const pointermove_handler = (graph, event) => updateGraphHover(event, graph);
    const click_handler_3 = (event) => {
      stop(event);
      actions.refreshOpponentChain?.();
    };
    const click_handler_4 = (side) => actions.setActiveMobileTab?.(side);
    const keydown_handler_1 = (side, event) => activateTabOnKey(event, side);
    const click_handler_5 = (side, event) => {
      stop(event);
      actions.toggleSettings?.(side);
    };
    const change_handler = (side, column, event) => actions.setOptionalColumnVisible?.(side, column.id, event.currentTarget.checked);
    const keydown_handler_2 = (event) => event.key === "Escape" && actions.closeFilters?.();
    const click_handler_6 = (side, event) => togglePanel(event, side);
    const keydown_handler_3 = (side, event) => activateOnKey(event, side);
    const click_handler_7 = (side, event) => {
      stop(event);
      actions.toggleFilter?.(side, "online");
    };
    const change_handler_1 = (side, option, event) => actions.setChoiceFilter?.(side, "online", option.value, event.currentTarget.checked);
    const click_handler_8 = (side) => actions.clearChoiceFilter?.(side, "online");
    const click_handler_9 = (side) => actions.toggleSort?.(side, "name");
    const click_handler_10 = (side) => actions.toggleSort?.(side, "status");
    const click_handler_11 = (side, event) => {
      stop(event);
      actions.toggleFilter?.(side, "status");
    };
    const change_handler_2 = (side, option, event) => actions.setChoiceFilter?.(side, "status", option.value, event.currentTarget.checked);
    const click_handler_12 = (side) => actions.clearChoiceFilter?.(side, "status");
    const click_handler_13 = (side) => actions.toggleSort?.(side, "score");
    const click_handler_14 = (side) => actions.toggleSort?.(side, "stats");
    const click_handler_15 = (side, event) => {
      stop(event);
      actions.toggleFilter?.(side, "stats");
    };
    const input_handler = (side, event) => actions.setStatsFilter?.(side, "from", event.currentTarget.value);
    const keydown_handler_4 = (event) => event.key === "Escape" && actions.closeFilters?.();
    const input_handler_1 = (side, event) => actions.setStatsFilter?.(side, "to", event.currentTarget.value);
    const keydown_handler_5 = (event) => event.key === "Escape" && actions.closeFilters?.();
    const click_handler_16 = (side) => actions.clearStatsFilter?.(side);
    const click_handler_17 = (member) => actions.toggleFavorite?.(member.userId);
    const click_handler_18 = (member) => actions.openAttack?.(member.userId);
    const click_handler_19 = (table, side) => !mobileTabs && table.collapsed && actions.toggleCollapse?.(side);
    const keydown_handler_6 = (side, event) => activateOnKey(event, side, true);
    $$self.$$set = ($$props2) => {
      if ("state" in $$props2) $$invalidate(0, state = $$props2.state);
      if ("actions" in $$props2) $$invalidate(1, actions = $$props2.actions);
    };
    return [
      state,
      actions,
      graphHover,
      mobileTabs,
      sides,
      statusOptions,
      onlineOptions,
      activateOnKey,
      activateDecayGraph,
      toggleDecayGraph,
      activateTabOnKey,
      togglePanel,
      updateGraphHover,
      clearGraphHover,
      dibs,
      flyStatus,
      tooltip,
      submit_handler_3,
      submit_handler_2,
      submit_handler_1,
      click_handler,
      keydown_handler,
      submit_handler,
      click_handler_1,
      click_handler_2,
      pointermove_handler,
      click_handler_3,
      click_handler_4,
      keydown_handler_1,
      click_handler_5,
      change_handler,
      keydown_handler_2,
      click_handler_6,
      keydown_handler_3,
      click_handler_7,
      change_handler_1,
      click_handler_8,
      click_handler_9,
      click_handler_10,
      click_handler_11,
      change_handler_2,
      click_handler_12,
      click_handler_13,
      click_handler_14,
      click_handler_15,
      input_handler,
      keydown_handler_4,
      input_handler_1,
      keydown_handler_5,
      click_handler_16,
      click_handler_17,
      click_handler_18,
      click_handler_19,
      keydown_handler_6
    ];
  }
  var WarOverviewView, WarOverviewView_default;
  var init_WarOverviewView = __esm({
    "src/WarOverviewView.svelte"() {
      "use strict";
      init_internal();
      init_disclose_version();
      init_runtime();
      init_Tooltip();
      WarOverviewView = class extends SvelteComponent {
        constructor(options) {
          super();
          init(this, options, instance, create_fragment, safe_not_equal, { state: 0, actions: 1 }, null, [-1, -1, -1]);
        }
      };
      WarOverviewView_default = WarOverviewView;
    }
  });

  // src/WarOverview.ts
  var WarOverview_exports = {};
  __export(WarOverview_exports, {
    WarOverview: () => WarOverview
  });
  function viewMemberInputsUnchanged(previous, next) {
    return previous.name === next.name && previous.factionId === next.factionId && previous.area === next.area && previous.status === next.status && previous.updateAt === next.updateAt && previous.onlineStatus === next.onlineStatus && previous.score === next.score && previous.statusKey === next.statusKey && previous.isFavorite === next.isFavorite && previous.favoriteSeparator === next.favoriteSeparator && previous.canDib === next.canDib && previous.stats === next.stats && previous.armorKey === next.armorKey && previous.flashKey === next.flashKey && previous.earlyKey === next.earlyKey;
  }
  function isSortField(value) {
    return value === "name" || value === "status" || value === "stats" || value === "score";
  }
  function createDefaultSortStates() {
    return {
      enemy: { field: "status", asc: true },
      own: { field: "status", asc: true }
    };
  }
  function createDefaultStatsFilters() {
    return {
      enemy: { from: "", to: "" },
      own: { from: "", to: "" }
    };
  }
  function loadSortStates() {
    const states = createDefaultSortStates();
    const cached = Cache.get(SORT_STATE_CACHE_KEY);
    if (!cached || typeof cached !== "object") {
      return states;
    }
    ["enemy", "own"].forEach((fieldName) => {
      const cachedState = cached[fieldName];
      if (!cachedState || typeof cachedState !== "object") {
        return;
      }
      if (isSortField(cachedState.field)) {
        states[fieldName].field = cachedState.field;
      }
      if (typeof cachedState.asc === "boolean") {
        states[fieldName].asc = cachedState.asc;
      }
    });
    return states;
  }
  function loadStatsFilters() {
    const filters = createDefaultStatsFilters();
    const cached = Cache.get(STATS_FILTER_CACHE_KEY);
    if (!cached || typeof cached !== "object") {
      return filters;
    }
    ["enemy", "own"].forEach((fieldName) => {
      const cachedFilter = cached[fieldName];
      if (!cachedFilter || typeof cachedFilter !== "object") {
        return;
      }
      if (typeof cachedFilter.from === "string") {
        filters[fieldName].from = cachedFilter.from;
      }
      if (typeof cachedFilter.to === "string") {
        filters[fieldName].to = cachedFilter.to;
      }
    });
    return filters;
  }
  function loadChoiceFilterValues(cacheKey, allowedValues) {
    const filters = {
      enemy: [],
      own: []
    };
    const cached = Cache.get(cacheKey);
    if (!cached || typeof cached !== "object") {
      return filters;
    }
    ["enemy", "own"].forEach((fieldName) => {
      const cachedValues = cached[fieldName];
      if (!Array.isArray(cachedValues)) {
        return;
      }
      filters[fieldName] = cachedValues.filter((value) => {
        return typeof value === "string" && allowedValues.includes(value);
      });
    });
    return filters;
  }
  function loadStatusFilters() {
    return loadChoiceFilterValues(STATUS_FILTER_CACHE_KEY, STATUS_FILTER_VALUES);
  }
  function loadOnlineFilters() {
    return loadChoiceFilterValues(ONLINE_FILTER_CACHE_KEY, ONLINE_FILTER_VALUES);
  }
  function createDefaultOptionalColumnVisibility() {
    return {
      score: false,
      armor: false,
      armorBadge: false,
      armorTag: false,
      spectateAttack: false
    };
  }
  function createDefaultColumnVisibility() {
    return {
      enemy: createDefaultOptionalColumnVisibility(),
      own: createDefaultOptionalColumnVisibility()
    };
  }
  function loadColumnVisibility() {
    const visibility = createDefaultColumnVisibility();
    const cached = Cache.get(COLUMN_VISIBILITY_CACHE_KEY);
    if (!cached || typeof cached !== "object") {
      return visibility;
    }
    ["enemy", "own"].forEach((fieldName) => {
      const cachedSide = cached[fieldName];
      if (!cachedSide || typeof cachedSide !== "object") {
        return;
      }
      OPTIONAL_COLUMNS.forEach((column) => {
        if (typeof cachedSide[column.id] === "boolean") {
          visibility[fieldName][column.id] = cachedSide[column.id];
        }
      });
    });
    OPTIONAL_COLUMNS.forEach((column) => {
      if (typeof cached[column.id] === "boolean") {
        visibility.enemy[column.id] = cached[column.id];
        visibility.own[column.id] = cached[column.id];
      }
    });
    return visibility;
  }
  function createDefaultCollapseState() {
    return {
      enemy: false,
      own: false
    };
  }
  var ORIGINAL_SELECTOR, ORIGINAL_HIDDEN_CLASS, ORIGINAL_VISIBLE_CLASS, OVERVIEW_CLASS, HIDE_WHORE_CLASS, FF_BACKGROUND_CLASS, COLORBLIND_CLASS, BLIND_CLASS, SORT_STATE_CACHE_KEY, STATS_FILTER_CACHE_KEY, STATUS_FILTER_CACHE_KEY, ONLINE_FILTER_CACHE_KEY, COLUMN_VISIBILITY_CACHE_KEY, ONLINE_FLASH_DURATION_MS, WAR_GRAPH_WIDTH, WAR_GRAPH_HEIGHT, WAR_GRAPH_PLOT_X, WAR_GRAPH_PLOT_Y, WAR_GRAPH_PLOT_WIDTH, WAR_GRAPH_PLOT_HEIGHT, OPPONENT_CHAIN_POLL_MS, OPPONENT_CHAIN_STATE_TOPIC, OPPONENT_CHAIN_REFRESH_TOPIC, STATUS_FILTER_VALUES, ONLINE_FILTER_VALUES, OPTIONAL_COLUMNS, timeZoneFormatter, LOADING_STAT_DISPLAY, WarOverview;
  var init_WarOverview = __esm({
    "src/WarOverview.ts"() {
      "use strict";
      init_Cache();
      init_Config();
      init_DataMonitor();
      init_EarlyReturn();
      init_Fly();
      init_HtmlObserver();
      init_Update();
      init_Spy();
      init_User();
      init_TornAPI();
      init_Utilities();
      init_WarOverviewView();
      init_Network();
      init_TabBus();
      ORIGINAL_SELECTOR = ".f-war-list .desc-wrap";
      ORIGINAL_HIDDEN_CLASS = "__warhelper_war_original_hidden";
      ORIGINAL_VISIBLE_CLASS = "__warhelper_war_original_visible";
      OVERVIEW_CLASS = "__warhelper_war_overview";
      HIDE_WHORE_CLASS = "__warhelper_hide_whore";
      FF_BACKGROUND_CLASS = "__warhelper_ff_bgcolor";
      COLORBLIND_CLASS = "__warhelper_colorblind";
      BLIND_CLASS = "__warhelper_blind";
      SORT_STATE_CACHE_KEY = "war_overview_sort_states";
      STATS_FILTER_CACHE_KEY = "war_overview_stats_filters";
      STATUS_FILTER_CACHE_KEY = "war_overview_status_filters";
      ONLINE_FILTER_CACHE_KEY = "war_overview_online_filters";
      COLUMN_VISIBILITY_CACHE_KEY = "war_overview_column_visibility";
      ONLINE_FLASH_DURATION_MS = 4600;
      WAR_GRAPH_WIDTH = 760;
      WAR_GRAPH_HEIGHT = 218;
      WAR_GRAPH_PLOT_X = 48;
      WAR_GRAPH_PLOT_Y = 12;
      WAR_GRAPH_PLOT_WIDTH = 696;
      WAR_GRAPH_PLOT_HEIGHT = 158;
      OPPONENT_CHAIN_POLL_MS = 6e4;
      OPPONENT_CHAIN_STATE_TOPIC = "chain.state";
      OPPONENT_CHAIN_REFRESH_TOPIC = "chain.refresh";
      STATUS_FILTER_VALUES = ["okay", "hospital", "jail", "traveling", "abroad"];
      ONLINE_FILTER_VALUES = ["online", "idle", "offline"];
      OPTIONAL_COLUMNS = [
        { id: "score", label: "Score" },
        { id: "armor", label: "Armor" },
        { id: "armorBadge", label: "Armor (stats badge)" },
        { id: "armorTag", label: "Armor (name tag)" },
        { id: "spectateAttack", label: "Attack (spectating)" }
      ];
      timeZoneFormatter = null;
      LOADING_STAT_DISPLAY = {
        html: "Loading",
        tooltip: "",
        sortValue: 0,
        sourceCount: 0
      };
      WarOverview = class {
        static {
          this.mounts = /* @__PURE__ */ new Map();
        }
        static {
          this.stats = /* @__PURE__ */ new Map();
        }
        static {
          // Bumped when a player's cached loadout changes, so their row rebuilds.
          this.armorRevision = /* @__PURE__ */ new Map();
        }
        static {
          this.spySources = /* @__PURE__ */ new Map();
        }
        static {
          this.pendingStatsByFaction = /* @__PURE__ */ new Map();
        }
        static {
          this.requestedSpyUsers = /* @__PURE__ */ new Set();
        }
        static {
          this.statsLoadGeneration = 0;
        }
        static {
          this.userScoreLoaded = false;
        }
        static {
          this.pendingUserScore = null;
        }
        static {
          this.sortStates = loadSortStates();
        }
        static {
          this.statsFilters = loadStatsFilters();
        }
        static {
          this.statusFilters = loadStatusFilters();
        }
        static {
          this.onlineFilters = loadOnlineFilters();
        }
        static {
          this.columnVisibility = loadColumnVisibility();
        }
        static {
          this.collapsedPanels = createDefaultCollapseState();
        }
        static {
          this.activeSettings = null;
        }
        static {
          this.activeStatsFilter = null;
        }
        static {
          this.activeStatusFilter = null;
        }
        static {
          this.activeOnlineFilter = null;
        }
        static {
          this.decayGraphExpanded = false;
        }
        static {
          // Torn's last getwarusers URL; replayed on refresh so spectating keeps the viewed war.
          this.warUsersUrl = "";
        }
        static {
          this.factionNames = /* @__PURE__ */ new Map();
        }
        static {
          this.viewMemberMemo = /* @__PURE__ */ new Map();
        }
        static {
          this.decayGraphMemo = null;
        }
        static {
          this.renderedOnlineStatuses = /* @__PURE__ */ new Map();
        }
        static {
          this.pendingOnlineFlashes = /* @__PURE__ */ new Map();
        }
        static {
          this.bypassBodyInteractionHoldForNextUpdate = false;
        }
        static {
          this.activeMobileTab = "enemy";
        }
        static {
          this.opponentChain = null;
        }
        static {
          this.opponentChainRequest = null;
        }
        static {
          this.opponentChainLastRequestAt = 0;
        }
        static {
          this.opponentChainExpiredRefreshKey = null;
        }
        static {
          this.timerStarted = false;
        }
        static {
          this.revision = 0;
        }
        static {
          this.actions = {
            toggleDecayGraph: () => this.toggleDecayGraph(),
            refreshWarData: () => void this.refreshWarData(),
            checkForUpdate: () => Update.checkNow(),
            refreshOpponentChain: () => this.refreshOpponentChain(),
            setActiveMobileTab: (fieldName) => this.setActiveMobileTab(fieldName),
            toggleSettings: (fieldName) => this.toggleSettings(fieldName),
            toggleCollapse: (fieldName) => this.togglePanelCollapsed(fieldName),
            toggleSort: (fieldName, sortField) => this.toggleSort(fieldName, sortField),
            toggleFilter: (fieldName, kind) => this.toggleFilter(fieldName, kind),
            closeFilters: () => this.closeFilters(),
            setStatsFilter: (fieldName, field, value) => this.updateStatsFilter(fieldName, field, value),
            clearStatsFilter: (fieldName) => this.clearStatsFilter(fieldName),
            setChoiceFilter: (fieldName, kind, value, checked) => this.updateChoiceFilter(fieldName, kind, value, checked),
            clearChoiceFilter: (fieldName, kind) => this.clearChoiceFilter(fieldName, kind),
            setOptionalColumnVisible: (fieldName, column, visible) => this.updateOptionalColumnVisibility(fieldName, column, visible),
            toggleFavorite: (userId) => this.toggleFavorite(userId),
            openAttack: (userId) => this.openAttackPage(userId),
            bindDibs: (node, userId) => this.bindDibs(node, userId),
            bindFlyStatus: (node, params) => this.bindFlyStatus(node, params)
          };
        }
        static {
          this.init();
        }
        static init() {
          if (!isOnFactionPage()) {
            return;
          }
          this.injectStyle();
          this.syncConfigClasses();
          this.updateOriginalVisibility();
          HtmlObserver.onAdd(ORIGINAL_SELECTOR, (node) => this.mount(node));
          DataMonitor.on("UserStatusChanged", () => this.scheduleMountedUpdates());
          DataMonitor.on("WarStatusChanged", () => this.scheduleMountedUpdates());
          DataMonitor.on("WarGraphChanged", () => this.scheduleMountedUpdates());
          DataMonitor.on("MissedUpdatesChanged", () => this.scheduleMountedUpdates());
          [1 /* Fetch */, 0 /* XHR */].forEach((type) => {
            Network.onMessage(type, (_data, url) => {
              this.warUsersUrl = url;
            }, "step=getwarusers");
          });
          Fly.onDataChange(() => this.scheduleMountedUpdates());
          Cache.onBust(() => this.reloadStats());
          ["ffs_key"].forEach((key) => {
            Config.onChange(key, () => this.reloadStats());
          });
          Config.onChange("spy_source_order", () => this.applySpySourcePreference());
          Config.onChange("show_original_war_view", () => this.updateOriginalVisibility());
          Config.onChange("hide_whore", () => this.syncConfigClasses());
          Config.onChange("ffcolor_bg", () => this.syncConfigClasses());
          Config.onChange("colorblind", () => this.syncConfigClasses());
          Config.onChange("blind", () => this.syncConfigClasses());
          Config.onChange("opponent_chain_tracker", () => this.resetOpponentChain());
          Config.onChange("torn_key", () => {
            this.resetOpponentChain();
            this.scheduleMountedUpdates();
          });
          TabBus.on(OPPONENT_CHAIN_STATE_TOPIC, (payload) => this.handleOpponentChainStateMessage(payload));
          TabBus.on(OPPONENT_CHAIN_REFRESH_TOPIC, (payload) => this.handleOpponentChainRefreshMessage(payload));
          TabBus.onMasterChange(() => this.scheduleMountedUpdates());
          document.addEventListener("click", (event) => this.closeFiltersOnOutsideClick(event));
          window.addEventListener("hashchange", () => {
            this.updateOriginalVisibility();
            document.querySelectorAll(ORIGINAL_SELECTOR).forEach((node) => {
              if (!this.mounts.has(node)) {
                this.mount(node);
              }
            });
          });
          this.startTimer();
        }
        static syncConfigClasses() {
          this.mounts.forEach((mount) => this.syncOverviewConfigClasses(mount.overview));
        }
        static syncOverviewConfigClasses(overview) {
          overview.classList.toggle(HIDE_WHORE_CLASS, Config.get("hide_whore") === "true");
          overview.classList.toggle(FF_BACKGROUND_CLASS, Config.get("ffcolor_bg") === "true");
          overview.classList.toggle(COLORBLIND_CLASS, Config.get("colorblind") === "true");
          overview.classList.toggle(BLIND_CLASS, Config.get("blind") === "true");
        }
        static injectStyle() {
          addStyle(`
.${OVERVIEW_CLASS}.${BLIND_CLASS} tr[data-warhelper-user-id],
.${OVERVIEW_CLASS}.${BLIND_CLASS} tr[data-warhelper-user-id] * {
  font-size: 14px !important;
}

body.${ORIGINAL_HIDDEN_CLASS} ${ORIGINAL_SELECTOR} {
  display: none !important;
}

body.${ORIGINAL_VISIBLE_CLASS} .${OVERVIEW_CLASS} {
  display: none !important;
}

.${OVERVIEW_CLASS} {
  --wh-bg: #ffffff;
  --wh-popover-bg: #ffffff;
  --wh-panel-bg: #f8f9fa;
  --wh-border: rgba(20, 24, 28, 0.16);
  --wh-border-soft: rgba(20, 24, 28, 0.1);
  --wh-muted: #5d6670;
  --wh-link: #225f9f;
  --wh-filter-active: #2270a8;
  --wh-row-odd: rgba(255, 255, 255, 0.86);
  --wh-row-even: rgba(245, 247, 249, 0.92);
  --wh-row-hover: rgba(226, 237, 247, 0.92);
  --wh-row-online-pop: rgba(92, 184, 92, 0.32);
  --wh-row-idle-pop: rgba(214, 185, 76, 0.34);
  --wh-row-early: rgba(92, 184, 92, 0.24);
  --wh-online-color: #5cb85c;
  --wh-ff-green: #5cb85c;
  --wh-controls-col-width: 28px;
  --wh-dibs-col-width: 34px;
  --wh-status-col-width: 60px;
  --wh-score-col-width: 54px;
  --wh-stats-col-width: 70px;
  --wh-armor-col-width: 40px;
  --wh-attack-col-width: 25px;
  --wh-attack-bg: rgba(178, 52, 52, 0.88);
  --wh-attack-border: rgba(150, 40, 40, 0.9);
  --wh-attack-hover: rgba(198, 58, 58, 0.95);
  box-sizing: border-box;
  width: 100%;
  margin: 0 0 8px;
  padding: 8px 10px;
  border: 1px solid var(--wh-border);
  border-radius: 4px;
  background: var(--wh-bg);
  color: #222;
}

.${OVERVIEW_CLASS}.${COLORBLIND_CLASS},
body.dark-mode .${OVERVIEW_CLASS}.${COLORBLIND_CLASS} {
  --wh-row-online-pop: rgba(0, 114, 178, 0.32);
  --wh-row-early: rgba(0, 114, 178, 0.24);
  --wh-online-color: #0072b2;
  --wh-ff-green: #0072b2;
}

body.dark-mode .${OVERVIEW_CLASS} {
  --wh-bg: rgba(20, 24, 28, 0.72);
  --wh-popover-bg: #20252b;
  --wh-panel-bg: rgba(255, 255, 255, 0.035);
  --wh-border: rgba(255, 255, 255, 0.18);
  --wh-border-soft: rgba(255, 255, 255, 0.1);
  --wh-muted: #aeb6bf;
  --wh-link: #9cc9ff;
  --wh-filter-active: #5bc0de;
  --wh-row-odd: rgba(255, 255, 255, 0.045);
  --wh-row-even: rgba(255, 255, 255, 0.075);
  --wh-row-hover: rgba(91, 192, 222, 0.16);
  --wh-row-online-pop: rgba(92, 184, 92, 0.26);
  --wh-row-idle-pop: rgba(214, 185, 76, 0.28);
  --wh-row-early: rgba(92, 184, 92, 0.2);
  --wh-attack-bg: rgba(140, 35, 35, 0.78);
  --wh-attack-border: rgba(180, 70, 70, 0.85);
  --wh-attack-hover: rgba(170, 45, 45, 0.9);
  color: inherit;
}

.${OVERVIEW_CLASS}_header {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 8px;
  min-height: 20px;
  font-weight: 700;
}

.${OVERVIEW_CLASS}_title {
  flex: 1 1 auto;
  min-width: 0;
}

.${OVERVIEW_CLASS}_prefetch {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  font-weight: 400;
  color: var(--wh-muted);
  white-space: nowrap;
}

.${OVERVIEW_CLASS}_prefetch-count {
  font-variant-numeric: tabular-nums;
}

.${OVERVIEW_CLASS}_prefetch-spinner {
  width: 10px;
  height: 10px;
  box-sizing: border-box;
  border: 2px solid rgba(128, 128, 128, 0.3);
  border-top-color: #888;
  border-radius: 50%;
  animation: ${OVERVIEW_CLASS}_prefetch_spin 0.8s linear infinite;
}

@keyframes ${OVERVIEW_CLASS}_prefetch_spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .${OVERVIEW_CLASS}_prefetch-spinner {
    animation-duration: 2.4s;
  }
}

.${OVERVIEW_CLASS}_update {
  flex: 0 0 auto;
  font-size: 11px;
  font-weight: 700;
  color: #e8a33d;
  white-space: nowrap;
  text-decoration: underline;
}

.${OVERVIEW_CLASS}_state {
  flex: 0 0 auto;
  margin-left: auto;
  font-size: 11px;
  font-weight: 400;
  color: var(--wh-muted);
}

.${OVERVIEW_CLASS}_missed {
  display: block;
  box-sizing: border-box;
  width: 100%;
  margin-top: 8px;
  padding: 6px 8px;
  border: 1px solid rgba(214, 160, 40, 0.7);
  border-radius: 4px;
  background: rgba(214, 160, 40, 0.16);
  color: inherit;
  font: inherit;
  font-size: 11px;
  line-height: 15px;
  text-align: left;
  cursor: pointer;
}

.${OVERVIEW_CLASS}_missed:hover {
  background: rgba(214, 160, 40, 0.26);
}

.${OVERVIEW_CLASS}_decay {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: nowrap;
  margin-top: 8px;
  padding: 7px 8px;
  border: 1px solid var(--wh-border-soft);
  border-radius: 4px;
  background: var(--wh-panel-bg);
  font-size: 11px;
  line-height: 15px;
  cursor: pointer;
}

.${OVERVIEW_CLASS}_decay:hover {
  border-color: var(--wh-border);
}

.${OVERVIEW_CLASS}_chain {
  cursor: default;
}

.${OVERVIEW_CLASS}_chain:hover {
  border-color: var(--wh-border-soft);
}

.${OVERVIEW_CLASS}_decay-label {
  flex: 0 0 auto;
  font-weight: 700;
  color: var(--wh-muted);
  text-transform: uppercase;
}

.${OVERVIEW_CLASS}_decay-timer {
  flex: 0 0 auto;
  color: inherit;
}

.${OVERVIEW_CLASS}_decay-summary {
  display: flex;
  align-items: center;
  gap: 5px;
  flex: 1 1 auto;
  min-width: 0;
  color: var(--wh-muted);
  overflow: hidden;
  white-space: nowrap;
}

.${OVERVIEW_CLASS}_decay-empty {
  color: var(--wh-muted);
}

.${OVERVIEW_CLASS}_decay-toggle {
  flex: 0 0 auto;
  color: var(--wh-muted);
  font-size: 12px;
  font-weight: 700;
}

.${OVERVIEW_CLASS}_decay-refresh {
  flex: 0 0 auto;
  width: 22px;
  height: 22px;
  margin-left: auto;
  padding: 0;
  border: 1px solid var(--wh-border-soft);
  border-radius: 3px;
  background: transparent;
  color: var(--wh-muted);
  cursor: pointer;
  font: inherit;
  font-size: 15px;
  line-height: 20px;
}

.${OVERVIEW_CLASS}_decay-refresh:hover {
  color: var(--wh-filter-active);
  background: rgba(91, 192, 222, 0.12);
}

.${OVERVIEW_CLASS}_graph {
  margin-top: 7px;
  padding: 6px;
  border: 1px solid var(--wh-border-soft);
  border-radius: 4px;
  background: #2f3030;
  overflow: hidden;
}

.${OVERVIEW_CLASS}_graph-empty {
  padding: 10px;
  color: #c1c6c9;
  font-size: 11px;
}

.${OVERVIEW_CLASS}_graph-svg {
  display: block;
  width: 100%;
  height: auto;
  cursor: crosshair;
  touch-action: none;
}

.${OVERVIEW_CLASS}_graph-bg {
  fill: #333434;
}

.${OVERVIEW_CLASS}_graph-positive-bg {
  fill: rgba(131, 168, 21, 0.32);
}

.${OVERVIEW_CLASS}_graph-negative-bg {
  fill: rgba(191, 86, 48, 0.28);
}

.${OVERVIEW_CLASS}_graph-grid {
  stroke: rgba(0, 0, 0, 0.68);
  stroke-width: 1;
  shape-rendering: crispEdges;
}

.${OVERVIEW_CLASS}_graph-zero {
  stroke: rgba(225, 230, 232, 0.5);
  stroke-width: 1;
  shape-rendering: crispEdges;
}

.${OVERVIEW_CLASS}_graph-axis-label,
.${OVERVIEW_CLASS}_graph-axis-title {
  fill: #9ca2a5;
  font-size: 11px;
  line-height: 1;
}

.${OVERVIEW_CLASS}_graph-axis-title {
  font-weight: 600;
}

.${OVERVIEW_CLASS}_graph-faction-label {
  font-size: 25px;
  font-weight: 700;
  opacity: 0.82;
  text-anchor: middle;
  dominant-baseline: middle;
  paint-order: stroke;
  stroke: rgba(25, 26, 26, 0.72);
  stroke-width: 3px;
  stroke-linejoin: round;
  pointer-events: none;
}

.${OVERVIEW_CLASS}_graph-faction-label-positive {
  fill: #93bc1d;
}

.${OVERVIEW_CLASS}_graph-faction-label-negative {
  fill: #f07745;
}

.${OVERVIEW_CLASS}_graph-goal {
  fill: none;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.${OVERVIEW_CLASS}_graph-goal-positive {
  stroke: #86b11a;
}

.${OVERVIEW_CLASS}_graph-goal-negative {
  stroke: #df6d3f;
}

.${OVERVIEW_CLASS}_graph-score {
  fill: none;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.${OVERVIEW_CLASS}_graph-score-positive {
  stroke: #9ad51d;
}

.${OVERVIEW_CLASS}_graph-score-negative {
  stroke: #ff7348;
}

.${OVERVIEW_CLASS}_graph-hover-line {
  stroke: rgba(255, 255, 255, 0.58);
  stroke-width: 1;
  stroke-dasharray: 3 3;
  shape-rendering: crispEdges;
}

.${OVERVIEW_CLASS}_graph-hover-dot {
  fill: #f5f7f8;
  stroke: #111;
  stroke-width: 1;
}

.${OVERVIEW_CLASS}_graph-tooltip {
  pointer-events: none;
}

.${OVERVIEW_CLASS}_graph-tooltip rect {
  fill: rgba(16, 18, 20, 0.94);
  stroke: rgba(255, 255, 255, 0.22);
  stroke-width: 1;
}

.${OVERVIEW_CLASS}_graph-tooltip text {
  fill: #edf1f3;
  font-size: 11px;
}

.${OVERVIEW_CLASS}_settings-wrap {
  position: relative;
  flex: 0 0 auto;
}

.${OVERVIEW_CLASS}_settings-button {
  width: 20px;
  height: 20px;
  padding: 0;
  border: 0;
  border-radius: 3px;
  background: transparent;
  color: var(--wh-muted);
  cursor: pointer;
  font: inherit;
  font-size: 15px;
  line-height: 20px;
}

.${OVERVIEW_CLASS}_settings-button:hover,
.${OVERVIEW_CLASS}_settings-button.active {
  color: var(--wh-filter-active);
  background: rgba(91, 192, 222, 0.12);
}

.${OVERVIEW_CLASS}_mobile-tabs {
  display: none;
}

.${OVERVIEW_CLASS}_columns {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  margin-top: 8px;
}

.${OVERVIEW_CLASS}_columns.${OVERVIEW_CLASS}_columns_enemy-collapsed {
  grid-template-columns: 36px minmax(0, 1fr);
}

.${OVERVIEW_CLASS}_columns.${OVERVIEW_CLASS}_columns_own-collapsed {
  grid-template-columns: minmax(0, 1fr) 36px;
}

.${OVERVIEW_CLASS}_columns.${OVERVIEW_CLASS}_columns_enemy-collapsed.${OVERVIEW_CLASS}_columns_own-collapsed {
  grid-template-columns: 36px 36px;
}

.${OVERVIEW_CLASS}_panel {
  min-width: 0;
  border: 1px solid var(--wh-border);
  border-radius: 4px;
  background: var(--wh-panel-bg);
  overflow: hidden;
}

/* Let an open filter or settings menu extend past a short table. */
.${OVERVIEW_CLASS}_panel:has(.${OVERVIEW_CLASS}_stats-filter-popover, .${OVERVIEW_CLASS}_settings-popover) {
  overflow: visible;
}

/* Torn's war box clips its contents too. */
body:not(.${TERRITORY_VIEW_CLASS}) li.descriptions:has(.${OVERVIEW_CLASS}_stats-filter-popover, .${OVERVIEW_CLASS}_settings-popover) {
  overflow: visible !important;
}

.${OVERVIEW_CLASS}_panel-title {
  position: relative;
  z-index: 40;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 8px;
  border-bottom: 1px solid var(--wh-border-soft);
  cursor: pointer;
  font-weight: 700;
}

.${OVERVIEW_CLASS}_panel-body {
  position: relative;
  z-index: 1;
}

.${OVERVIEW_CLASS}_panel-title-text {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}

.${OVERVIEW_CLASS}_collapse-button {
  flex: 0 0 auto;
  width: 20px;
  height: 20px;
  padding: 0;
  border: 0;
  border-radius: 3px;
  background: transparent;
  color: var(--wh-muted);
  cursor: pointer;
  font: inherit;
  line-height: 18px;
}

.${OVERVIEW_CLASS}_collapse-button:hover {
  background: var(--wh-border-soft);
  color: inherit;
}

.${OVERVIEW_CLASS}_panel-collapsed .${OVERVIEW_CLASS}_panel-title {
  min-height: 150px;
  padding: 8px 4px;
  border-bottom: 0;
  writing-mode: vertical-rl;
  text-orientation: mixed;
  justify-content: center;
}

.${OVERVIEW_CLASS}_panel-collapsed {
  cursor: pointer;
}

.${OVERVIEW_CLASS}_panel-collapsed .${OVERVIEW_CLASS}_collapse-button {
  writing-mode: horizontal-tb;
}

.${OVERVIEW_CLASS}_panel-collapsed .${OVERVIEW_CLASS}_panel-body {
  display: none;
}

.${OVERVIEW_CLASS}_table {
  width: 100%;
  border-collapse: separate;
  border-spacing: 0;
  table-layout: fixed;
  -webkit-touch-callout: none;
  -webkit-user-select: none;
  -moz-user-select: none;
  -ms-user-select: none;
  user-select: none;
}

.${OVERVIEW_CLASS}_col-controls {
  width: var(--wh-controls-col-width);
}

.${OVERVIEW_CLASS}_col-dibs {
  width: var(--wh-dibs-col-width);
}

.${OVERVIEW_CLASS}_col-status {
  width: var(--wh-status-col-width);
}

.${OVERVIEW_CLASS}_col-score {
  width: var(--wh-score-col-width);
}

.${OVERVIEW_CLASS}_col-armor {
  width: var(--wh-armor-col-width);
}

.${OVERVIEW_CLASS}_col-stats {
  width: var(--wh-stats-col-width);
}

.${OVERVIEW_CLASS}_col-attack {
  width: var(--wh-attack-col-width);
}

.${OVERVIEW_CLASS}_table th,
.${OVERVIEW_CLASS}_table td {
  padding: 5px 5px !important;
  border-bottom: 1px solid var(--wh-border-soft);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-align: left;
  /* Torn's styles override this otherwise, leaving cells off-center in taller rows. */
  vertical-align: middle !important;
}

.${OVERVIEW_CLASS}_table th {
  font-size: 10px;
  line-height: 12px;
  text-transform: uppercase;
  color: var(--wh-muted);
}

.${OVERVIEW_CLASS}_table thead {
  position: relative;
  z-index: 30;
}

.${OVERVIEW_CLASS}_table tbody {
  position: relative;
  z-index: 1;
}

.${OVERVIEW_CLASS}_sort {
  width: 100%;
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font: inherit;
  text-align: inherit;
  text-transform: inherit;
}

.${OVERVIEW_CLASS}_sort-label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}

.${OVERVIEW_CLASS}_sort-icon {
  position: relative;
  flex: 0 0 auto;
  width: 8px;
  height: 12px;
}

.${OVERVIEW_CLASS}_sort-icon::before,
.${OVERVIEW_CLASS}_sort-icon::after {
  content: "";
  position: absolute;
  left: 1px;
  width: 5px;
  height: 5px;
  border-right: 1.5px solid currentColor;
  border-bottom: 1.5px solid currentColor;
  opacity: 0.35;
}

.${OVERVIEW_CLASS}_sort-icon::before {
  top: 1px;
  transform: rotate(-135deg);
}

.${OVERVIEW_CLASS}_sort-icon::after {
  bottom: 1px;
  transform: rotate(45deg);
}

.${OVERVIEW_CLASS}_sort.active.asc .${OVERVIEW_CLASS}_sort-icon::before,
.${OVERVIEW_CLASS}_sort.active.desc .${OVERVIEW_CLASS}_sort-icon::after {
  opacity: 1;
}

.${OVERVIEW_CLASS}_table tr:last-child td {
  border-bottom: 0;
}

.${OVERVIEW_CLASS}_table tbody tr:nth-child(odd) td {
  background: var(--wh-row-odd);
}

.${OVERVIEW_CLASS}_table tbody tr:nth-child(even) td {
  background: var(--wh-row-even);
}

.${OVERVIEW_CLASS}_table tbody tr:hover td {
  background: var(--wh-row-hover);
}

/* Early return tint: a background image, so the online flash's box-shadow can't hide it. */
.${OVERVIEW_CLASS}_table tbody tr.${OVERVIEW_CLASS}_row-early td {
  background-image: linear-gradient(var(--wh-row-early), var(--wh-row-early));
}

.${OVERVIEW_CLASS}.${FF_BACKGROUND_CLASS} .${OVERVIEW_CLASS}_table tbody tr.${OVERVIEW_CLASS}_row-early td.${OVERVIEW_CLASS}_stats:has(.__warhelper_compare) {
  background-image: none;
}

.${OVERVIEW_CLASS}_table tbody tr.${OVERVIEW_CLASS}_row-online td {
  animation: ${OVERVIEW_CLASS}_row_online_pop ${ONLINE_FLASH_DURATION_MS}ms ease-out both;
  animation-delay: var(--wh-row-flash-delay, 0ms);
}

.${OVERVIEW_CLASS}_table tbody tr.${OVERVIEW_CLASS}_row-idle td {
  animation: ${OVERVIEW_CLASS}_row_idle_pop ${ONLINE_FLASH_DURATION_MS}ms ease-out both;
  animation-delay: var(--wh-row-flash-delay, 0ms);
}

/* The flash is an inset shadow, which paints over the FF-colored stats background. */
.${OVERVIEW_CLASS}.${FF_BACKGROUND_CLASS} .${OVERVIEW_CLASS}_table tbody tr td.${OVERVIEW_CLASS}_stats:has(.__warhelper_compare) {
  animation: none;
}

@keyframes ${OVERVIEW_CLASS}_row_online_pop {
  0%,
  65% {
    box-shadow: inset 0 0 0 9999px var(--wh-row-online-pop);
  }
  100% {
    box-shadow: inset 0 0 0 9999px transparent;
  }
}

@keyframes ${OVERVIEW_CLASS}_row_idle_pop {
  0%,
  65% {
    box-shadow: inset 0 0 0 9999px var(--wh-row-idle-pop);
  }
  100% {
    box-shadow: inset 0 0 0 9999px transparent;
  }
}

.${OVERVIEW_CLASS}_table tbody tr.${OVERVIEW_CLASS}_favorite-separator td {
  box-shadow: inset 0 -2px 0 var(--wh-border);
}

.${OVERVIEW_CLASS}_table tbody td:first-child {
  border-top-left-radius: 4px;
  border-bottom-left-radius: 4px;
}

.${OVERVIEW_CLASS}_table tbody td:last-child {
  border-top-right-radius: 4px;
  border-bottom-right-radius: 4px;
}

.${OVERVIEW_CLASS}_controls-header,
.${OVERVIEW_CLASS}_dibs-header,
.${OVERVIEW_CLASS}_table th.${OVERVIEW_CLASS}_name-header-enemy,
.${OVERVIEW_CLASS}_table th.${OVERVIEW_CLASS}_name-header-own,
.${OVERVIEW_CLASS}_status-header {
  position: relative;
  overflow: visible !important;
}

.${OVERVIEW_CLASS}_controls-header-content,
.${OVERVIEW_CLASS}_name-header-content,
.${OVERVIEW_CLASS}_status-header-content {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
}

.${OVERVIEW_CLASS}_controls-header-content {
  justify-content: flex-start;
}

.${OVERVIEW_CLASS}_name-header-content .${OVERVIEW_CLASS}_sort,
.${OVERVIEW_CLASS}_status-header-content .${OVERVIEW_CLASS}_sort {
  flex: 1 1 auto;
  min-width: 0;
}

.${OVERVIEW_CLASS}_status-header-content {
  justify-content: flex-end;
}

.${OVERVIEW_CLASS}_controls {
  overflow: visible !important;
}

.${OVERVIEW_CLASS}_controls-content {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 0;
}

.${OVERVIEW_CLASS}_dibs {
  overflow: visible !important;
  text-align: center !important;
}

.${OVERVIEW_CLASS}_dibs-content {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 0;
}

.${OVERVIEW_CLASS}_name-content {
  display: flex;
  align-items: baseline;
  gap: 4px;
  min-width: 0;
}

.${OVERVIEW_CLASS}_name a {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  /* Room for descenders and the last glyph inside the clip, without changing layout. */
  padding: 1px 1px 2px 0;
  margin: -1px -1px -2px 0;
  color: var(--wh-link);
  text-decoration: none;
}

.${OVERVIEW_CLASS}_name a:hover {
  text-decoration: underline;
}

.${OVERVIEW_CLASS}_status-header {
  text-align: right !important;
}

/* Too narrow for label + filter; spill left into the name header instead of truncating. */
.${OVERVIEW_CLASS}_status-header .${OVERVIEW_CLASS}_sort {
  flex: 0 0 auto;
  width: auto;
  justify-content: flex-end;
}

.${OVERVIEW_CLASS}_status-header .${OVERVIEW_CLASS}_sort-label {
  overflow: visible;
}

/* Shares Torn's .status class; keep it a real table cell so the row grows with two-line statuses. */
.${OVERVIEW_CLASS}_table td.${OVERVIEW_CLASS}_status {
  display: table-cell !important;
  height: auto !important;
  min-height: 0 !important;
}

.${OVERVIEW_CLASS}_status {
  text-align: right !important;
}

.${OVERVIEW_CLASS}_score-header,
.${OVERVIEW_CLASS}_score {
  color: inherit;
  text-align: right !important;
}

.${OVERVIEW_CLASS}_score-header .${OVERVIEW_CLASS}_sort {
  justify-content: flex-end;
}

.${OVERVIEW_CLASS}_status.okay,
.${OVERVIEW_CLASS}_status.ok {
  color: #5cb85c;
}

.${OVERVIEW_CLASS}_status.hospital,
.${OVERVIEW_CLASS}_status.not-ok {
  color: #d9534f;
}

.${OVERVIEW_CLASS}_status.jail {
  color: #f0ad4e !important;
}

.${OVERVIEW_CLASS}_status.traveling,
.${OVERVIEW_CLASS}_status.abroad {
  color: #5bc0de;
}

.${OVERVIEW_CLASS} .__warhelper_status_icon {
  display: inline-block;
  margin-right: 2px;
}

.${OVERVIEW_CLASS} .__warhelper_status_flag {
  display: inline-block;
  width: 14px;
  height: 10px;
  margin-right: 3px;
  border: 1px solid rgba(0, 0, 0, 0.35);
  box-sizing: border-box;
  background-position: center;
  background-repeat: no-repeat;
  background-size: cover;
  vertical-align: -1px;
}

.${OVERVIEW_CLASS}_status:not(.__warhelper_status_multiline) {
  white-space: nowrap;
}

.${OVERVIEW_CLASS}_status.__warhelper_status_multiline {
  white-space: normal !important;
  overflow: visible !important;
  line-height: 13px !important;
}

.${OVERVIEW_CLASS}_status.__warhelper_status_multiline .__warhelper_status_icon,
.${OVERVIEW_CLASS}_status.__warhelper_status_multiline .__warhelper_status_flag {
  margin-right: 0;
}

.${OVERVIEW_CLASS}_status.__warhelper_status_multiline .__warhelper_status_main {
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  gap: 3px;
  max-width: 100%;
  white-space: nowrap;
  line-height: 13px;
}

.${OVERVIEW_CLASS}_status.__warhelper_status_multiline .__warhelper_status_text {
  display: inline-block;
  min-width: 0;
  white-space: normal;
  overflow-wrap: anywhere;
  line-height: 13px;
}

.${OVERVIEW_CLASS}_status.__warhelper_status_multiline .__warhelper_status_detail {
  display: block;
  text-align: right;
  white-space: nowrap;
  line-height: 13px;
}

.${OVERVIEW_CLASS}_status.__warhelper_status_multiline .__warhelper_status_detail.__warhelper_status_detail_hospital {
  color: #d9534f !important;
}

.${OVERVIEW_CLASS}_status.__warhelper_status_multiline .__warhelper_status_detail.__warhelper_status_detail_flight_possible {
  color: #d6b94c !important;
}

.${OVERVIEW_CLASS}_dibs .__warhelper_dibs {
  position: relative !important;
  right: auto !important;
  display: inline-block !important;
  flex: 0 0 auto;
  width: auto;
  min-width: 23px;
  padding-right: 3px;
  box-sizing: border-box;
  overflow: visible !important;
  vertical-align: middle;
  opacity: 1 !important;
}

.${OVERVIEW_CLASS}_dibs .__warhelper_dibs.timed {
  margin-right: 0 !important;
}

.${OVERVIEW_CLASS}_favorite {
  --wh-favorite-color: #8a8f96;
  position: relative;
  flex: 0 0 21px;
  width: 21px;
  height: 19px;
  padding: 0;
  border: 0;
  background: transparent;
  cursor: pointer;
}

.${OVERVIEW_CLASS}_favorite.online {
  --wh-favorite-color: var(--wh-online-color);
}

.${OVERVIEW_CLASS}_favorite.idle {
  --wh-favorite-color: #d6b94c;
}

.${OVERVIEW_CLASS}_favorite.offline,
.${OVERVIEW_CLASS}_favorite.unknown {
  --wh-favorite-color: #8a8f96;
}

.${OVERVIEW_CLASS}_favorite-dot {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--wh-favorite-color);
  transform: translate(-50%, -50%);
  transition: opacity 120ms ease;
}

.${OVERVIEW_CLASS}_favorite-star {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 15px;
  height: 15px;
  opacity: 0;
  transform: translate(-50%, -50%) scale(0.82) rotate(-18deg);
  transition: opacity 120ms ease, transform 120ms ease;
  background: var(--wh-favorite-color);
  clip-path: polygon(50% 0%, 61% 34%, 98% 34%, 68% 55%, 79% 91%, 50% 70%, 21% 91%, 32% 55%, 2% 34%, 39% 34%);
  filter: drop-shadow(0 0 3px rgba(0, 0, 0, 0.35));
}

.${OVERVIEW_CLASS}_favorite.active .${OVERVIEW_CLASS}_favorite-dot,
.${OVERVIEW_CLASS}_favorite:hover .${OVERVIEW_CLASS}_favorite-dot {
  opacity: 0;
}

.${OVERVIEW_CLASS}_favorite.active .${OVERVIEW_CLASS}_favorite-star,
.${OVERVIEW_CLASS}_favorite:hover .${OVERVIEW_CLASS}_favorite-star {
  opacity: 1;
  transform: translate(-50%, -50%) scale(1) rotate(-18deg);
}

.${OVERVIEW_CLASS}_table td.${OVERVIEW_CLASS}_stats {
  padding: 5px 0 5px 15px !important;
}

.${OVERVIEW_CLASS}_stats {
  position: relative;
  color: inherit;
}

.${OVERVIEW_CLASS}:not(.${HIDE_WHORE_CLASS}) .${OVERVIEW_CLASS}_stats .__warhelper_total.str {
  color: #CC6666;
}

.${OVERVIEW_CLASS}:not(.${HIDE_WHORE_CLASS}) .${OVERVIEW_CLASS}_stats .__warhelper_total.def {
  color: #6699CC;
}

.${OVERVIEW_CLASS}:not(.${HIDE_WHORE_CLASS}) .${OVERVIEW_CLASS}_stats .__warhelper_total.spd {
  color: #99CC66;
}

.${OVERVIEW_CLASS}:not(.${HIDE_WHORE_CLASS}) .${OVERVIEW_CLASS}_stats .__warhelper_total.dex {
  color: #9966CC;
}

.${OVERVIEW_CLASS}_armor-header,
.${OVERVIEW_CLASS}_armor {
  text-align: center !important;
}

/* Armor labels are colored by rarity; no rarity uses the link color. */
.${OVERVIEW_CLASS}_armor {
  --wh-armor-color: var(--wh-link);
  color: var(--wh-armor-color) !important;
  font-weight: 700;
}

.${OVERVIEW_CLASS} [data-rarity="yellow"] {
  --wh-armor-color: #c9c400;
}

.${OVERVIEW_CLASS} [data-rarity="orange"] {
  --wh-armor-color: #d08300;
}

.${OVERVIEW_CLASS} [data-rarity="red"] {
  --wh-armor-color: #d3455b;
}

.${OVERVIEW_CLASS}_armor {
  font-size: 10px;
}

/* Solid rarity fill with dark text, readable on FF backgrounds and either theme. */
.${OVERVIEW_CLASS}_armor-tag:not([data-rarity]),
.${OVERVIEW_CLASS}_armor-badge:not([data-rarity]) {
  --wh-armor-color: #9cc9ff;
}

.${OVERVIEW_CLASS}_armor-tag,
.${OVERVIEW_CLASS}_armor-badge {
  border-radius: 3px;
  background: var(--wh-armor-color);
  color: #15181c;
}

.${OVERVIEW_CLASS}_armor-tag {
  flex: 0 0 auto;
  /* line-height 1 centers capitals in the box; equal padding keeps the bar even. */
  padding: 2px 4px;
  font-size: inherit;
  line-height: 1;
}

/* Chip on the stats cell's right edge. */
.${OVERVIEW_CLASS}_table td.${OVERVIEW_CLASS}_stats:has(.${OVERVIEW_CLASS}_armor-badge) {
  padding-right: 23px !important;
}

.${OVERVIEW_CLASS}_armor-badge {
  position: absolute;
  top: 0;
  bottom: 0;
  right: 1px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  font-family: Verdana, sans-serif;
  font-size: 8px;
  letter-spacing: -0.3px;
  pointer-events: none;
}

.${OVERVIEW_CLASS}_armor.partial {
  text-decoration: underline dotted;
  text-underline-offset: 2px;
}

.${OVERVIEW_CLASS}_stats .__warhelper_bstype {
  position: absolute;
  top: 0;
  left: 0;
  color: #ddd;
  text-align: center;
  font-family: monospace;
  font-weight: bold;
  line-height: 14px;
  padding-top: 1px;
  padding-left: 1px;
  padding-right: 10px;
  padding-bottom: 10px;
  background-color: #999999;
  clip-path: polygon(0 0, 100% 0, 100% 0%, 0% 100%);
}

.${OVERVIEW_CLASS}_stats .__warhelper_bstype.T {
  background-color: #663399;
}

.${OVERVIEW_CLASS}_stats .__warhelper_bstype.B {
  background-color: #336699;
}

.${OVERVIEW_CLASS}_stats .__warhelper_bstype.Y {
  background-color: #669966;
}

.${OVERVIEW_CLASS}_stats .__warhelper_bstype.YE {
  background-color: #9c9c00;
}

.${OVERVIEW_CLASS}_stats .__warhelper_bstype.F {
  background-color: #a65e2e;
}

.${OVERVIEW_CLASS}_stats .__warhelper_compare {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 3px;
  background: linear-gradient(to right, var(--color) var(--fill), transparent var(--fill));
}

.${OVERVIEW_CLASS}.${FF_BACKGROUND_CLASS} .${OVERVIEW_CLASS}_stats:has(.__warhelper_compare.r) {
  color: #000 !important;
  background-color: #D44A4A !important;
}

.${OVERVIEW_CLASS}_stats .__warhelper_compare.r {
  --color: #D44A4A;
}

.${OVERVIEW_CLASS}.${FF_BACKGROUND_CLASS} .${OVERVIEW_CLASS}_stats:has(.__warhelper_compare.y) {
  color: #000 !important;
  background-color: #F1C232 !important;
}

.${OVERVIEW_CLASS}_stats .__warhelper_compare.y {
  --color: #F1C232;
}

.${OVERVIEW_CLASS}.${FF_BACKGROUND_CLASS} .${OVERVIEW_CLASS}_stats:has(.__warhelper_compare.g) {
  color: #000 !important;
  background-color: var(--wh-ff-green) !important;
}

.${OVERVIEW_CLASS}.${FF_BACKGROUND_CLASS}.${COLORBLIND_CLASS} .${OVERVIEW_CLASS}_stats:has(.__warhelper_compare.g) {
  color: #fff !important;
}

.${OVERVIEW_CLASS}_stats .__warhelper_compare.g {
  --color: var(--wh-ff-green);
}

.${OVERVIEW_CLASS}.${FF_BACKGROUND_CLASS} .${OVERVIEW_CLASS}_stats:has(.__warhelper_compare.w) {
  color: #000 !important;
  background-color: #F8F9FA !important;
}

.${OVERVIEW_CLASS}_stats .__warhelper_compare.w {
  --color: #F8F9FA;
}

.__warhelper_spy_tooltip td:nth-child(3),
.__warhelper_spy_tooltip td:nth-child(4) {
  padding-left: 5px;
  text-align: right;
}

.__warhelper_spy_tooltip td:nth-child(4) {
  opacity: 0.7;
}

.__warhelper_spy_note td {
  padding-top: 3px;
  font-size: 0.9em;
  opacity: 0.7;
}

.__warhelper_spy_source {
  display: inline-block;
  min-width: 36px;
  padding: 1px 4px;
  border-radius: 2px;
  color: #f5f5f5;
  text-align: center;
  font-weight: bold;
}

.__warhelper_spy_source.T {
  background-color: #663399;
}

.__warhelper_spy_source.B {
  background-color: #336699;
}

.__warhelper_spy_source.Y {
  background-color: #669966;
}

.__warhelper_spy_source.YE {
  background-color: #9c9c00;
}

.__warhelper_spy_source.F {
  background-color: #a65e2e;
}

.__warhelper_spy_detail td:first-child {
  padding-left: 18px;
}

.${OVERVIEW_CLASS}_stats-header {
  position: relative;
  overflow: visible !important;
}

.${OVERVIEW_CLASS}_stats-header-content {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
}

.${OVERVIEW_CLASS}_stats-header-content .${OVERVIEW_CLASS}_sort {
  flex: 1 1 auto;
  min-width: 0;
}

.${OVERVIEW_CLASS}_filter-button {
  position: relative;
  flex: 0 0 auto;
  width: 18px;
  height: 18px;
  padding: 0;
  border: 0;
  border-radius: 3px;
  background: transparent;
  color: inherit;
  cursor: pointer;
}

.${OVERVIEW_CLASS}_filter-button::before {
  content: "";
  position: absolute;
  inset: 4px 4px 3px;
  background: currentColor;
  clip-path: polygon(6% 12%, 94% 12%, 60% 52%, 60% 90%, 40% 90%, 40% 52%);
  opacity: 0.68;
}

.${OVERVIEW_CLASS}_filter-button:hover,
.${OVERVIEW_CLASS}_filter-button.active {
  color: var(--wh-filter-active);
  background: rgba(91, 192, 222, 0.12);
}

.${OVERVIEW_CLASS}_stats-filter-popover {
  position: absolute;
  top: calc(100% + 5px);
  right: 0;
  z-index: 100;
  width: 156px;
  box-sizing: border-box;
  padding: 8px;
  border: 1px solid var(--wh-border);
  border-radius: 4px;
  background: var(--wh-popover-bg);
  color: inherit;
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.22);
  display: grid;
  gap: 6px;
  font-size: 11px;
  line-height: 14px;
  text-transform: none;
  -webkit-user-select: text;
  -moz-user-select: text;
  -ms-user-select: text;
  user-select: text;
}

.${OVERVIEW_CLASS}_controls-filter-popover {
  left: 0;
  right: auto;
}

.${OVERVIEW_CLASS}_settings-popover {
  position: absolute;
  top: calc(100% + 5px);
  left: 0;
  z-index: 100;
  width: 144px;
  box-sizing: border-box;
  padding: 8px;
  border: 1px solid var(--wh-border);
  border-radius: 4px;
  background: var(--wh-popover-bg);
  color: inherit;
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.22);
  display: grid;
  gap: 6px;
  font-size: 11px;
  line-height: 14px;
  text-transform: none;
  -webkit-user-select: text;
  -moz-user-select: text;
  -ms-user-select: text;
  user-select: text;
}

.${OVERVIEW_CLASS}_stats-filter-popover label {
  display: grid;
  gap: 2px;
  font-weight: 600;
  color: var(--wh-muted);
}

.${OVERVIEW_CLASS}_stats-filter-popover input {
  width: 100%;
  box-sizing: border-box;
  padding: 3px 5px;
  border: 1px solid var(--wh-border);
  border-radius: 3px;
  background: var(--wh-popover-bg);
  color: inherit;
  font: inherit;
  -webkit-user-select: text;
  -moz-user-select: text;
  -ms-user-select: text;
  user-select: text;
}

.${OVERVIEW_CLASS}_stats-filter-popover .${OVERVIEW_CLASS}_filter-choice {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 400;
  color: inherit;
}

.${OVERVIEW_CLASS}_settings-popover .${OVERVIEW_CLASS}_filter-choice {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 400;
  color: inherit;
}

.${OVERVIEW_CLASS}_stats-filter-popover .${OVERVIEW_CLASS}_filter-choice input,
.${OVERVIEW_CLASS}_settings-popover .${OVERVIEW_CLASS}_filter-choice input {
  flex: 0 0 auto;
  width: auto;
  margin: 0;
}

.${OVERVIEW_CLASS}_stats-filter-actions {
  display: flex;
  justify-content: flex-end;
  gap: 5px;
}

.${OVERVIEW_CLASS}_stats-filter-actions button {
  padding: 2px 6px;
  border: 1px solid var(--wh-border);
  border-radius: 3px;
  background: var(--wh-panel-bg);
  color: inherit;
  cursor: pointer;
  font: inherit;
}

body.dark-mode .${OVERVIEW_CLASS}_stats,
body.dark-mode .${OVERVIEW_CLASS}_score {
  color: #e8edf2 !important;
}

.${OVERVIEW_CLASS}_stats .__warhelper_total {
  line-height: 18px;
}

.${OVERVIEW_CLASS}_attack {
  text-align: right !important;
}

.${OVERVIEW_CLASS}_attack-button {
  display: inline;
  width: auto;
  height: auto;
  padding: 0;
  border: 0;
  background: transparent;
  /* Monochrome swords (text form, not color emoji), tinted silver. */
  color: #b8bec6;
  cursor: pointer;
  font: inherit;
  font-size: 19px;
  line-height: 1;
  text-align: center;
}

.${OVERVIEW_CLASS}_attack-button:hover {
  background: transparent;
}

.${OVERVIEW_CLASS}_empty {
  padding: 8px;
  opacity: 0.72;
}

@media screen and (max-width: 784px) {
  .${OVERVIEW_CLASS}_mobile-tabs {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 4px;
    margin-top: 8px;
  }

  .${OVERVIEW_CLASS}_mobile-tab {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    min-width: 0;
    min-height: 32px;
    padding: 5px 7px;
    border: 1px solid var(--wh-border);
    border-radius: 4px 4px 0 0;
    background: var(--wh-panel-bg);
    color: inherit;
    cursor: pointer;
    font: inherit;
    font-weight: 700;
  }

  .${OVERVIEW_CLASS}_mobile-tab.active {
    border-bottom-color: var(--wh-bg);
    background: var(--wh-bg);
    color: var(--wh-filter-active);
  }

  .${OVERVIEW_CLASS}_mobile-tab-title {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .${OVERVIEW_CLASS}_mobile-tab-count {
    flex: 0 0 auto;
    color: var(--wh-muted);
    font-weight: 600;
  }

  .${OVERVIEW_CLASS}_columns {
    display: block;
    margin-top: 0;
  }

  .${OVERVIEW_CLASS}_panel {
    display: none;
    border-radius: 0 0 4px 4px;
  }

  .${OVERVIEW_CLASS}_panel.${OVERVIEW_CLASS}_panel-mobile-active {
    display: block;
  }

  .${OVERVIEW_CLASS}_panel-collapsed .${OVERVIEW_CLASS}_panel-title {
    min-height: auto;
    padding: 6px 8px;
    border-bottom: 1px solid var(--wh-border-soft);
    writing-mode: horizontal-tb;
    text-orientation: mixed;
  }

  .${OVERVIEW_CLASS}_panel-collapsed .${OVERVIEW_CLASS}_panel-body {
    display: block;
  }

  .${OVERVIEW_CLASS}_collapse-button {
    display: none;
  }
}
`);
        }
        // Territory fights always get Torn's own view, wall join/leave controls included.
        static shouldShowOriginalWarView() {
          return Config.get("show_original_war_view") === "true" || DataMonitor.isTerritoryWarView();
        }
        static updateOriginalVisibility() {
          if (!document.body) {
            return;
          }
          const showOriginal = this.shouldShowOriginalWarView();
          document.body.classList.toggle(ORIGINAL_HIDDEN_CLASS, !showOriginal && this.mounts.size > 0);
          document.body.classList.toggle(ORIGINAL_VISIBLE_CLASS, showOriginal);
          document.body.classList.toggle(TERRITORY_VIEW_CLASS, DataMonitor.isTerritoryWarView());
        }
        static mount(original) {
          const parent = original.parentElement;
          if (!parent || !this.isActiveOriginal(original)) {
            return;
          }
          this.updateOriginalVisibility();
          original.classList.remove(ORIGINAL_HIDDEN_CLASS);
          const existing = original.nextElementSibling;
          const overview = existing instanceof HTMLElement && existing.classList.contains(OVERVIEW_CLASS) ? existing : this.createOverview();
          this.syncOverviewConfigClasses(overview);
          if (overview !== existing) {
            original.insertAdjacentElement("afterend", overview);
          }
          this.removeDuplicateOverviews(parent, overview);
          const component = new WarOverviewView_default({
            target: overview,
            props: {
              state: this.createViewState(false),
              actions: this.actions
            }
          });
          this.observeLifecycle(parent, original, overview, component);
          this.updateOriginalVisibility();
          this.scheduleMountedUpdates();
        }
        static createOverview() {
          const overview = document.createElement("div");
          overview.className = OVERVIEW_CLASS;
          this.syncOverviewConfigClasses(overview);
          return overview;
        }
        static startTimer() {
          if (this.timerStarted) {
            return;
          }
          this.timerStarted = true;
          window.addEventListener("focus", () => this.scheduleMountedUpdates());
          window.addEventListener("blur", () => this.scheduleMountedUpdates());
          const tick2 = () => {
            this.scheduleMountedUpdates();
            window.setTimeout(tick2, 1e3 - getServerTimeMs() % 1e3 + 25);
          };
          window.setTimeout(tick2, 0);
        }
        static scheduleMountedUpdates() {
          this.mounts.forEach((mount, original) => {
            if (!this.isActiveMount(original, mount)) {
              this.cleanupMount(original, mount);
              return;
            }
            if (mount.updateFrame !== null) {
              return;
            }
            mount.updateFrame = window.requestAnimationFrame(() => {
              mount.updateFrame = null;
              if (this.isActiveMount(original, mount)) {
                this.updateMount(mount);
              } else {
                this.cleanupMount(original, mount);
              }
            });
          });
        }
        static updateMount(mount) {
          this.updateOriginalVisibility();
          if (DataMonitor.isTerritoryWarView()) {
            return;
          }
          const bypassBodyHold = this.bypassBodyInteractionHoldForNextUpdate;
          mount.component.$set({ state: this.createViewState(bypassBodyHold) });
          if (bypassBodyHold) {
            this.bypassBodyInteractionHoldForNextUpdate = false;
          }
        }
        static createViewState(bypassBodyHold) {
          this.normalizeHiddenColumnSort();
          const groups = this.getMemberGroups();
          const allMembers = groups.enemy.concat(groups.own);
          this.ensureStats(allMembers);
          this.ensureOpponentChain(groups);
          this.trackOnlineStatusChanges(allMembers);
          const decayEnd = this.createDecayEndView();
          return {
            stateText: allMembers.length ? "" : "Waiting for DataMonitor",
            dibsSign: "",
            bypassBodyHold,
            activeMobileTab: this.activeMobileTab,
            decayEnd,
            missedUpdates: DataMonitor.hasMissedUpdates(),
            loadoutPrefetch: null,
            update: Update.getStatus(),
            opponentChain: this.createOpponentChainView(groups),
            decayGraph: DataMonitor.isRankedWarList() ? this.createDecayGraphView(groups) : null,
            revision: ++this.revision,
            tables: {
              enemy: this.createTableState("enemy", groups.enemyFactionName, groups.enemy, groups.canAttackEnemy, isOnOwnFactionPage() && Boolean(String(Config.get("torn_key") || "").trim()), groups.spectatingWar),
              own: this.createTableState("own", groups.ownFactionName, groups.own, groups.canAttackOwn, false, groups.spectatingWar)
            }
          };
        }
        static createTableState(fieldName, title, members, canAttack, canDib, spectatingWar) {
          const filteredMembers = this.filterMembers(members, fieldName);
          const sortedMembers = this.sortMembers(filteredMembers, fieldName);
          const lastFavoriteIndex = this.getLastFavoriteIndex(sortedMembers);
          const viewMembers = sortedMembers.map((member, index) => {
            return this.createViewMember(member, canDib, index === lastFavoriteIndex && index < sortedMembers.length - 1);
          });
          return {
            side: fieldName,
            title,
            rawCount: members.length,
            members: viewMembers,
            collapsed: this.collapsedPanels[fieldName],
            collapseButtonText: this.getCollapseButtonText(fieldName, this.collapsedPanels[fieldName]),
            canAttack,
            activeSettings: this.activeSettings === fieldName,
            optionalColumns: this.getOptionalColumnViews(fieldName, spectatingWar),
            showDibsColumn: false,
            showScoreColumn: this.columnVisibility[fieldName].score,
            showArmorColumn: false,
            showArmorBadge: false,
            showArmorTag: false,
            showAttackColumn: canAttack,
            sortState: { ...this.sortStates[fieldName] },
            statsFilter: { ...this.statsFilters[fieldName] },
            statusFilters: [...this.statusFilters[fieldName]],
            onlineFilters: [...this.onlineFilters[fieldName]],
            hasStatsFilter: this.hasStatsFilter(fieldName),
            hasStatusFilter: this.hasStatusFilter(fieldName),
            hasOnlineFilter: this.hasOnlineFilter(fieldName),
            activeFilter: this.getActiveFilter(fieldName),
            emptyText: viewMembers.length ? null : members.length ? "No members match filter" : "No members loaded"
          };
        }
        static createViewMember(member, canDib, favoriteSeparator) {
          const stats = this.stats.get(member.userId) || LOADING_STAT_DISPLAY;
          const early = document.hasFocus() ? EarlyReturn.get(member.userId, member.status) : null;
          const statusDisplay = this.getStatusViewDisplay(member.userId, member.status);
          const flash = this.getPendingOnlineFlash(member);
          const isFavorite = this.isFavorite(member.userId);
          const armorObservedAt = 0;
          const inputs = {
            name: member.name,
            factionId: member.factionId,
            area: member.status.area,
            status: member.status.status,
            updateAt: member.status.updateAt,
            onlineStatus: member.status.onlineStatus,
            score: member.status.score,
            statusKey: statusDisplay.key,
            isFavorite,
            favoriteSeparator,
            canDib,
            stats,
            armorKey: `${this.armorRevision.get(member.userId) || 0}:${armorObservedAt}`,
            flashKey: flash?.key ?? "",
            earlyKey: early ? `${early.kind}:${early.at}` : ""
          };
          const memo = this.viewMemberMemo.get(member.userId);
          if (memo && viewMemberInputsUnchanged(memo.inputs, inputs)) {
            return memo.view;
          }
          const view = {
            userId: member.userId,
            name: member.name,
            factionId: member.factionId,
            profileHref: `profiles.php?XID=${member.userId}`,
            onlineStatus: member.status.onlineStatus,
            isFavorite,
            favoriteSeparator,
            canDib,
            statusDisplay,
            statusClasses: this.getStatusClasses(member.userId, member.status, statusDisplay),
            score: member.status.score,
            scoreDisplay: this.formatScore(member.status.score),
            stats,
            armor: null,
            flashClass: flash?.className || "",
            flashDelayMs: flash?.delayMs || 0,
            early: Boolean(early)
          };
          this.viewMemberMemo.set(member.userId, { inputs, view });
          return view;
        }
        // Lite build: Armor column removed (LoadoutView/Armor modules deleted).
        static getArmorView(userId, observedAt) {
          return null;
        }
        static getArmorTitle(set, observedAt) {
          return "";
        }
        static getOptionalColumnViews(fieldName, spectatingWar) {
          return OPTIONAL_COLUMNS.filter((column) => (spectatingWar || column.id !== "spectateAttack") && true).map((column) => ({
            ...column,
            visible: this.columnVisibility[fieldName][column.id]
          }));
        }
        static normalizeHiddenColumnSort() {
          let changed = false;
          ["enemy", "own"].forEach((fieldName) => {
            if (this.sortStates[fieldName].field === "score" && !this.columnVisibility[fieldName].score) {
              this.sortStates[fieldName] = { field: "status", asc: true };
              changed = true;
            }
          });
          if (changed) {
            this.persistSortStates();
          }
        }
        static formatScore(score) {
          if (!Number.isFinite(score)) {
            return "0";
          }
          return Math.round(score).toLocaleString("en-US");
        }
        static createDecayEndView() {
          const warStatus = DataMonitor.getWarStatus();
          if (!warStatus) {
            return null;
          }
          const nowSeconds = getServerTimestampSeconds();
          const started = this.normalizeTimestampSeconds(warStatus.started);
          if (Number.isFinite(started) && started > nowSeconds) {
            return this.createWarCountdownView("WAR START", started, nowSeconds);
          }
          const endTimestamp = this.getDecayEndTimestamp(warStatus, nowSeconds);
          if (endTimestamp === null) {
            return null;
          }
          return this.createWarCountdownView("DECAY", endTimestamp, nowSeconds);
        }
        static createWarCountdownView(label, timestamp, nowSeconds) {
          return {
            label,
            timestamp,
            timer: this.formatCountdown(timestamp, nowSeconds),
            showDates: timestamp > nowSeconds,
            utcTime: this.formatUtcDateTime(timestamp),
            localTime: this.formatLocalDateTime(timestamp)
          };
        }
        static resetOpponentChain() {
          this.opponentChain = null;
          this.opponentChainLastRequestAt = 0;
          this.opponentChainExpiredRefreshKey = null;
          this.scheduleMountedUpdates();
        }
        static isOpponentChainTrackerEnabled() {
          return Config.get("opponent_chain_tracker") === "true";
        }
        static ensureOpponentChain(groups) {
          if (!this.isOpponentChainTrackerEnabled() || !Config.get("torn_key")) {
            return;
          }
          const factionId = groups.enemyFactionId;
          if (!factionId) {
            return;
          }
          if (this.opponentChain && this.opponentChain.factionId !== factionId) {
            this.opponentChain = null;
            this.opponentChainLastRequestAt = 0;
          }
          if (!TabBus.isMaster()) {
            return;
          }
          if (this.opponentChainRequest) {
            return;
          }
          const now2 = Date.now();
          if (this.opponentChainLastRequestAt && now2 - this.opponentChainLastRequestAt < OPPONENT_CHAIN_POLL_MS) {
            return;
          }
          this.loadOpponentChain(factionId);
        }
        static refreshOpponentChain() {
          if (!this.isOpponentChainTrackerEnabled() || !Config.get("torn_key")) {
            return;
          }
          const factionId = this.getMemberGroups().enemyFactionId;
          if (!factionId) {
            return;
          }
          this.requestOpponentChainRefresh(factionId);
        }
        static loadOpponentChain(factionId, force = false) {
          if (!TabBus.isMaster()) {
            return;
          }
          if (this.opponentChainRequest) {
            return;
          }
          const now2 = Date.now();
          if (!force && this.opponentChainLastRequestAt && now2 - this.opponentChainLastRequestAt < OPPONENT_CHAIN_POLL_MS) {
            return;
          }
          this.opponentChainLastRequestAt = Date.now();
          this.opponentChainRequest = tornAPI({
            section: "faction",
            endpoint: "chain",
            parameters: {
              id: factionId,
              timestamp: getServerTimestampSeconds()
            }
          }).then((response) => {
            if (!this.isOpponentChainTrackerEnabled() || !Config.get("torn_key")) {
              return;
            }
            this.setOpponentChainState({
              factionId,
              chain: this.parseOpponentChain(response?.chain),
              loadedAt: getServerTimestampSeconds(),
              error: null
            }, true);
          }).catch((error) => {
            this.setOpponentChainState({
              factionId,
              chain: null,
              loadedAt: getServerTimestampSeconds(),
              error: error instanceof Error ? error.message : String(error || "Unable to load chain")
            }, true);
          }).finally(() => {
            this.opponentChainRequest = null;
            this.scheduleMountedUpdates();
          });
        }
        static parseOpponentChain(value) {
          if (!value || typeof value !== "object") {
            return null;
          }
          return {
            id: this.toChainNumber(value.id),
            current: this.toChainNumber(value.current),
            max: this.toChainNumber(value.max),
            modifier: this.toChainNumber(value.modifier),
            cooldown: this.normalizeTimestampSeconds(this.toChainNumber(value.cooldown)),
            start: this.normalizeTimestampSeconds(this.toChainNumber(value.start)),
            end: this.normalizeTimestampSeconds(this.toChainNumber(value.end))
          };
        }
        static toChainNumber(value) {
          const parsed = Number(value);
          return Number.isFinite(parsed) ? parsed : 0;
        }
        static setOpponentChainState(state, broadcast) {
          if (this.opponentChain && this.opponentChain.factionId === state.factionId && this.opponentChain.loadedAt > state.loadedAt) {
            return;
          }
          this.opponentChain = state;
          this.opponentChainLastRequestAt = Date.now();
          this.scheduleMountedUpdates();
          if (broadcast) {
            TabBus.post(OPPONENT_CHAIN_STATE_TOPIC, state);
          }
        }
        static handleOpponentChainStateMessage(payload) {
          const state = this.parseOpponentChainState(payload);
          if (!state) {
            return;
          }
          this.setOpponentChainState(state, false);
        }
        static handleOpponentChainRefreshMessage(payload) {
          if (!TabBus.isMaster()) {
            return;
          }
          const factionId = this.getPayloadFactionId(payload);
          if (!factionId) {
            return;
          }
          this.loadOpponentChain(factionId, true);
        }
        static requestOpponentChainRefresh(factionId) {
          if (TabBus.isMaster()) {
            this.loadOpponentChain(factionId, true);
            return;
          }
          TabBus.post(OPPONENT_CHAIN_REFRESH_TOPIC, { factionId });
        }
        static parseOpponentChainState(payload) {
          if (!payload || typeof payload !== "object") {
            return null;
          }
          const value = payload;
          const factionId = this.toChainNumber(value["factionId"]);
          const loadedAt = this.toChainNumber(value["loadedAt"]);
          if (factionId <= 0 || loadedAt <= 0) {
            return null;
          }
          return {
            factionId,
            chain: value["chain"] === null ? null : this.parseOpponentChain(value["chain"]),
            loadedAt,
            error: typeof value["error"] === "string" ? value["error"] : null
          };
        }
        static getPayloadFactionId(payload) {
          if (!payload || typeof payload !== "object") {
            return 0;
          }
          return this.toChainNumber(payload["factionId"]);
        }
        static createOpponentChainView(groups) {
          if (!this.isOpponentChainTrackerEnabled() || !Config.get("torn_key") || !groups.enemyFactionId) {
            return null;
          }
          if (!this.opponentChain || this.opponentChain.factionId !== groups.enemyFactionId) {
            return { text: "Loading..." };
          }
          if (this.opponentChain.error) {
            return { text: "Unable to load" };
          }
          const chain = this.opponentChain.chain;
          if (!chain) {
            return { text: "No active chain" };
          }
          const nowSeconds = getServerTimestampSeconds();
          if (chain.cooldown > 0) {
            const remainingSeconds = Math.max(0, chain.cooldown - nowSeconds);
            if (remainingSeconds <= 0) {
              this.refreshExpiredOpponentChain(groups.enemyFactionId, chain, "cooldown");
            }
            return { text: `In cooldown - ${this.formatChainDuration(remainingSeconds, true)}` };
          }
          if (chain.start > 0) {
            const remainingSeconds = Math.max(0, chain.end - nowSeconds);
            if (remainingSeconds <= 0) {
              this.refreshExpiredOpponentChain(groups.enemyFactionId, chain, "active");
            }
            return { text: `Active ${Math.floor(chain.current)} / ${Math.floor(chain.max)} - ${this.formatChainDuration(remainingSeconds)}` };
          }
          return { text: "No active chain" };
        }
        static refreshExpiredOpponentChain(factionId, chain, phase) {
          const refreshKey = [
            factionId,
            phase,
            chain.id,
            chain.current,
            chain.max,
            chain.start,
            chain.end,
            chain.cooldown
          ].join(":");
          if (this.opponentChainExpiredRefreshKey === refreshKey) {
            return;
          }
          this.opponentChainExpiredRefreshKey = refreshKey;
          this.requestOpponentChainRefresh(factionId);
        }
        static formatChainDuration(seconds, alwaysShowHours = false) {
          const totalSeconds = Math.max(0, Math.floor(seconds));
          const days = Math.floor(totalSeconds / 86400);
          const hours = Math.floor(totalSeconds % 86400 / 3600);
          const minutes = Math.floor(totalSeconds % 3600 / 60);
          const remainingSeconds = totalSeconds % 60;
          if (days) {
            return `${days}d ${this.pad2(hours)}:${this.pad2(minutes)}:${this.pad2(remainingSeconds)}`;
          }
          if (alwaysShowHours || hours) {
            return `${this.pad2(hours)}:${this.pad2(minutes)}:${this.pad2(remainingSeconds)}`;
          }
          return `${this.pad2(minutes)}:${this.pad2(remainingSeconds)}`;
        }
        static getDecayEndTimestamp(warStatus, nowSeconds) {
          const started = this.normalizeTimestampSeconds(warStatus.started);
          const initRequirement = warStatus.initRespectRequirement;
          const currentScore = Math.abs(warStatus.ownScore - warStatus.opponentScore);
          const hourlyDecay = initRequirement * 0.01;
          if (!Number.isFinite(started) || !Number.isFinite(initRequirement) || !Number.isFinite(currentScore) || !Number.isFinite(hourlyDecay) || started <= 0 || initRequirement <= 0 || hourlyDecay <= 0) {
            return null;
          }
          const scoreLeftForDecay = initRequirement - currentScore;
          if (scoreLeftForDecay <= 0) {
            return nowSeconds;
          }
          const firstDecayAt = started + 24 * 60 * 60;
          const ticksNeeded = Math.ceil(scoreLeftForDecay / hourlyDecay);
          if (!Number.isFinite(ticksNeeded) || ticksNeeded <= 0) {
            return nowSeconds;
          }
          return Math.max(nowSeconds, firstDecayAt + (ticksNeeded - 1) * 60 * 60);
        }
        static normalizeTimestampSeconds(timestamp) {
          return Math.floor(timestamp > 9999999999 ? timestamp / 1e3 : timestamp);
        }
        static formatCountdown(timestampSeconds, nowSeconds) {
          const remainingSeconds = Math.max(0, timestampSeconds - nowSeconds);
          const days = Math.floor(remainingSeconds / 86400);
          const hours = Math.floor(remainingSeconds % 86400 / 3600);
          const minutes = Math.floor(remainingSeconds % 3600 / 60);
          const seconds = remainingSeconds % 60;
          const time = `${this.pad2(hours)}:${this.pad2(minutes)}:${this.pad2(seconds)}`;
          return days ? `${days}d ${time}` : time;
        }
        static formatUtcDateTime(timestampSeconds) {
          const date = new Date(timestampSeconds * 1e3);
          return [
            `${date.getUTCFullYear()}-${this.pad2(date.getUTCMonth() + 1)}-${this.pad2(date.getUTCDate())}`,
            `${this.pad2(date.getUTCHours())}:${this.pad2(date.getUTCMinutes())}`,
            //:${this.pad2(date.getUTCSeconds())}`,
            "TCT"
          ].join(" ");
        }
        static formatLocalDateTime(timestampSeconds) {
          const date = new Date(timestampSeconds * 1e3);
          const timeZone = this.getLocalTimeZoneLabel(date);
          const formatted = [
            `${date.getFullYear()}-${this.pad2(date.getMonth() + 1)}-${this.pad2(date.getDate())}`,
            `${this.pad2(date.getHours())}:${this.pad2(date.getMinutes())}`
            //:${this.pad2(date.getSeconds())}`,
          ].join(" ");
          return timeZone ? `${formatted} ${timeZone}` : formatted;
        }
        static getLocalTimeZoneLabel(date) {
          timeZoneFormatter ??= new Intl.DateTimeFormat(void 0, {
            hour: "2-digit",
            minute: "2-digit",
            timeZoneName: "short"
          });
          const timeZonePart = timeZoneFormatter.formatToParts(date).find((part) => part.type === "timeZoneName");
          return timeZonePart?.value || "";
        }
        static pad2(value) {
          return String(Math.floor(value)).padStart(2, "0");
        }
        // Builds the war graph, reusing the last one when nothing has changed.
        static createDecayGraphView(groups) {
          const warGraph = DataMonitor.getWarGraph();
          const warStatus = DataMonitor.getWarStatus();
          const memo = this.decayGraphMemo;
          if (memo && memo.score === warGraph.score && memo.goal === warGraph.goal && memo.ownFactionName === groups.ownFactionName && memo.enemyFactionName === groups.enemyFactionName && memo.started === (warStatus ? warStatus.started : null) && memo.initRespectRequirement === (warStatus ? warStatus.initRespectRequirement : null) && memo.expanded === this.decayGraphExpanded) {
            return memo.view;
          }
          const view = this.createDecayGraphViewUncached(groups, warGraph, warStatus);
          this.decayGraphMemo = {
            score: warGraph.score,
            goal: warGraph.goal,
            ownFactionName: groups.ownFactionName,
            enemyFactionName: groups.enemyFactionName,
            started: warStatus ? warStatus.started : null,
            initRespectRequirement: warStatus ? warStatus.initRespectRequirement : null,
            expanded: this.decayGraphExpanded,
            view
          };
          return view;
        }
        static createDecayGraphViewUncached(groups, warGraph, warStatus) {
          const emptyGraph = this.createEmptyGraphView(groups);
          const baseScore = this.normalizeGraphEntries(warGraph.score);
          let goal = this.normalizeGraphEntries(warGraph.goal).map((entry) => ({
            ...entry,
            value: Math.abs(entry.value)
          }));
          const initialTimestamps = baseScore.concat(goal).map((entry) => entry.timestamp);
          if (!initialTimestamps.length) {
            return emptyGraph;
          }
          const started = warStatus ? this.normalizeTimestampSeconds(warStatus.started) : Math.min(...initialTimestamps);
          if (warStatus && goal.length && Number.isFinite(warStatus.initRespectRequirement) && warStatus.initRespectRequirement > 0 && goal[0].timestamp > started) {
            goal = [{ timestamp: started, value: warStatus.initRespectRequirement }, ...goal];
          }
          const score = this.extendScoreThroughGoalEntries(baseScore, goal);
          const allTimestamps = score.concat(goal).map((entry) => entry.timestamp);
          const minTimestamp = Math.min(started || Math.min(...allTimestamps), ...allTimestamps);
          const maxTimestamp = Math.max(...allTimestamps, minTimestamp + 60 * 60);
          const maxScore = Math.max(
            1,
            ...score.map((entry) => Math.abs(entry.value)),
            ...goal.map((entry) => Math.abs(entry.value))
          );
          const yMax = this.getNiceGraphMax(maxScore);
          const zeroY = WAR_GRAPH_PLOT_Y + WAR_GRAPH_PLOT_HEIGHT / 2;
          const xScale = (timestamp) => {
            return WAR_GRAPH_PLOT_X + (timestamp - minTimestamp) / (maxTimestamp - minTimestamp) * WAR_GRAPH_PLOT_WIDTH;
          };
          const yScale = (value) => {
            return WAR_GRAPH_PLOT_Y + (yMax - value) / (yMax * 2) * WAR_GRAPH_PLOT_HEIGHT;
          };
          return {
            ...emptyGraph,
            hasData: true,
            zeroY,
            yLabels: this.createGraphYLabels(yMax, yScale),
            xLabels: this.createGraphXLabels(started || minTimestamp, minTimestamp, maxTimestamp, xScale),
            scoreSegments: this.createScoreSegments(score, xScale, yScale),
            goalPositivePoints: this.createGoalStepPoints(goal, minTimestamp, maxTimestamp, xScale, yScale, 1),
            goalNegativePoints: this.createGoalStepPoints(goal, minTimestamp, maxTimestamp, xScale, yScale, -1),
            hoverPoints: this.createGraphHoverPoints(score, goal, xScale, yScale, groups)
          };
        }
        static createEmptyGraphView(groups) {
          return {
            expanded: this.decayGraphExpanded,
            hasData: false,
            width: WAR_GRAPH_WIDTH,
            height: WAR_GRAPH_HEIGHT,
            plotX: WAR_GRAPH_PLOT_X,
            plotY: WAR_GRAPH_PLOT_Y,
            plotWidth: WAR_GRAPH_PLOT_WIDTH,
            plotHeight: WAR_GRAPH_PLOT_HEIGHT,
            zeroY: WAR_GRAPH_PLOT_Y + WAR_GRAPH_PLOT_HEIGHT / 2,
            ownFactionName: groups.ownFactionName,
            enemyFactionName: groups.enemyFactionName,
            yLabels: [],
            xLabels: [],
            scoreSegments: [],
            goalPositivePoints: "",
            goalNegativePoints: "",
            hoverPoints: []
          };
        }
        static normalizeGraphEntries(entries) {
          return entries.map((entry) => ({
            timestamp: this.normalizeTimestampSeconds(entry.timestamp),
            value: entry.value
          })).filter((entry) => Number.isFinite(entry.timestamp) && Number.isFinite(entry.value)).sort((a, b) => a.timestamp - b.timestamp);
        }
        static extendScoreThroughGoalEntries(score, goal) {
          if (!score.length || !goal.length) {
            return score;
          }
          const firstScore = score[0];
          const scoreTimestamps = new Set(score.map((entry) => entry.timestamp));
          const extendedScore = score.map((entry) => ({ ...entry }));
          let activeScoreIndex = 0;
          for (const goalEntry of goal) {
            if (goalEntry.timestamp < firstScore.timestamp || scoreTimestamps.has(goalEntry.timestamp)) {
              continue;
            }
            while (activeScoreIndex + 1 < score.length && score[activeScoreIndex + 1].timestamp <= goalEntry.timestamp) {
              activeScoreIndex++;
            }
            extendedScore.push({
              timestamp: goalEntry.timestamp,
              value: score[activeScoreIndex].value
            });
            scoreTimestamps.add(goalEntry.timestamp);
          }
          return extendedScore.sort((a, b) => a.timestamp - b.timestamp);
        }
        static getNiceGraphMax(value) {
          if (value <= 0 || !Number.isFinite(value)) {
            return 1;
          }
          const magnitude = Math.pow(10, Math.floor(Math.log10(value)));
          const normalized = value / magnitude;
          const niceNormalized = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
          return niceNormalized * magnitude;
        }
        static createGraphYLabels(yMax, yScale) {
          return [yMax, yMax / 2, 0, -yMax / 2, -yMax].map((value) => ({
            y: yScale(value),
            text: this.formatGraphNumber(Math.abs(value))
          }));
        }
        static createGraphXLabels(started, minTimestamp, maxTimestamp, xScale) {
          const duration = Math.max(60 * 60, maxTimestamp - minTimestamp);
          const step = duration <= 36 * 60 * 60 ? 3 * 60 * 60 : duration <= 4 * 24 * 60 * 60 ? 6 * 60 * 60 : duration <= 8 * 24 * 60 * 60 ? 12 * 60 * 60 : 24 * 60 * 60;
          const labels = [];
          for (let timestamp = started + step; timestamp < maxTimestamp; timestamp += step) {
            if (timestamp <= minTimestamp) {
              continue;
            }
            labels.push({
              x: xScale(timestamp),
              text: this.formatGraphDuration(timestamp - started)
            });
          }
          return labels;
        }
        static createGoalStepPoints(entries, minTimestamp, maxTimestamp, xScale, yScale, sign) {
          if (!entries.length || maxTimestamp <= minTimestamp) {
            return "";
          }
          let activeValue = entries[0].value;
          const points = [this.formatGraphPoint(xScale(minTimestamp), yScale(activeValue * sign))];
          for (const entry of entries) {
            if (entry.timestamp <= minTimestamp) {
              activeValue = entry.value;
              points[0] = this.formatGraphPoint(xScale(minTimestamp), yScale(activeValue * sign));
              continue;
            }
            if (entry.timestamp > maxTimestamp) {
              break;
            }
            points.push(this.formatGraphPoint(xScale(entry.timestamp), yScale(activeValue * sign)));
            points.push(this.formatGraphPoint(xScale(entry.timestamp), yScale(entry.value * sign)));
            activeValue = entry.value;
          }
          points.push(this.formatGraphPoint(xScale(maxTimestamp), yScale(activeValue * sign)));
          return points.join(" ");
        }
        static createScoreSegments(score, xScale, yScale) {
          if (!score.length) {
            return [];
          }
          const segments = [];
          const firstScore = score[0];
          const firstNonZero = score.find((entry) => entry.value !== 0);
          let positive = firstNonZero ? firstNonZero.value > 0 : true;
          let points = [this.formatGraphPoint(xScale(firstScore.timestamp), yScale(firstScore.value))];
          for (let index = 1; index < score.length; index++) {
            const previous = score[index - 1];
            const current = score[index];
            const currentPositive = current.value > 0;
            if (current.value !== 0 && positive !== currentPositive) {
              let crossPoint;
              if (previous.value === 0) {
                crossPoint = points[points.length - 1];
              } else {
                const ratio = Math.abs(previous.value) / Math.abs(current.value - previous.value);
                const crossTimestamp = previous.timestamp + (current.timestamp - previous.timestamp) * ratio;
                crossPoint = this.formatGraphPoint(xScale(crossTimestamp), yScale(0));
                points.push(crossPoint);
              }
              segments.push({ points: points.join(" "), positive });
              positive = currentPositive;
              points = [crossPoint];
            }
            points.push(this.formatGraphPoint(xScale(current.timestamp), yScale(current.value)));
          }
          segments.push({ points: points.join(" "), positive });
          return segments;
        }
        static createGraphHoverPoints(score, goal, xScale, yScale, groups) {
          return score.map((entry) => {
            const goalValue = this.getSteppedGraphValue(goal, entry.timestamp);
            const absoluteScore = Math.abs(entry.value);
            const winningFactionName = entry.value > 0 ? groups.ownFactionName : entry.value < 0 ? groups.enemyFactionName : "Even";
            return {
              timestamp: entry.timestamp,
              x: xScale(entry.timestamp),
              scoreY: yScale(entry.value),
              goalPositiveY: goalValue === null ? null : yScale(goalValue),
              goalNegativeY: goalValue === null ? null : yScale(-goalValue),
              timeTct: this.formatUtcDateTime(entry.timestamp),
              localTime: this.formatLocalDateTime(entry.timestamp),
              scoreDisplay: this.formatGraphNumber(absoluteScore),
              goalDisplay: goalValue === null ? "n/a" : this.formatGraphNumber(goalValue),
              winningFactionName
            };
          });
        }
        static getSteppedGraphValue(entries, timestamp) {
          if (!entries.length) {
            return null;
          }
          const firstEntry = entries[0];
          if (timestamp <= firstEntry.timestamp) {
            return firstEntry.value;
          }
          let activeValue = firstEntry.value;
          for (let index = 1; index < entries.length; index++) {
            const current = entries[index];
            if (timestamp < current.timestamp) {
              return activeValue;
            }
            activeValue = current.value;
          }
          return activeValue;
        }
        static formatGraphPoint(x, y) {
          return `${Math.round(x * 100) / 100},${Math.round(y * 100) / 100}`;
        }
        static formatGraphNumber(value) {
          return Math.round(value).toLocaleString("en-US");
        }
        static formatGraphDuration(seconds) {
          const normalizedSeconds = Math.max(0, Math.floor(seconds));
          const days = Math.floor(normalizedSeconds / 86400);
          const hours = Math.floor(normalizedSeconds % 86400 / 3600);
          return `${days}d ${hours}h`;
        }
        static getActiveFilter(fieldName) {
          if (this.activeStatsFilter === fieldName) {
            return "stats";
          }
          if (this.activeStatusFilter === fieldName) {
            return "status";
          }
          if (this.activeOnlineFilter === fieldName) {
            return "online";
          }
          return null;
        }
        static toggleDecayGraph() {
          this.decayGraphExpanded = !this.decayGraphExpanded;
          this.scheduleMountedUpdates();
        }
        static async refreshWarData() {
          try {
            await targetWindow.fetch(this.getWarUsersUrl(), {
              method: "POST",
              headers: {
                "Accept": "application/json",
                "Content-Type": "application/json",
                "x-requested-with": "XMLHttpRequest"
              },
              body: "{}"
            });
          } catch {
          }
        }
        static getWarUsersUrl() {
          if (this.warUsersUrl) {
            return new URL(this.warUsersUrl, targetWindow.location.href).href;
          }
          const pageFactions = this.getPageFactionInfos();
          const factionId = this.isSpectating(DataMonitor.getCurrentFactionId(), pageFactions) ? pageFactions.current?.id || 0 : 0;
          return `https://www.torn.com/faction_wars.php?redirect=false&step=getwarusers&factionID=${factionId}&userID=0&warID=rank`;
        }
        // Viewer belongs to neither faction on the page.
        static isSpectating(currentUserFactionId, pageFactions) {
          const pageFactionIds = [pageFactions.current?.id, pageFactions.opponent?.id].filter((id) => !!id);
          return currentUserFactionId > 0 && pageFactionIds.length > 0 && !pageFactionIds.includes(currentUserFactionId);
        }
        static togglePanelCollapsed(fieldName) {
          this.collapsedPanels[fieldName] = !this.collapsedPanels[fieldName];
          this.scheduleMountedUpdates();
        }
        static setActiveMobileTab(fieldName) {
          if (this.activeMobileTab === fieldName) {
            return;
          }
          this.activeMobileTab = fieldName;
          this.closeFilters();
          this.scheduleMountedUpdates();
        }
        static getCollapseButtonText(fieldName, collapsed) {
          if (fieldName === "enemy") {
            return collapsed ? ">" : "<";
          }
          return collapsed ? "<" : ">";
        }
        static getMemberGroups() {
          const statuses = DataMonitor.getWarUserStatuses();
          const warMemberIds = DataMonitor.getWarMemberIds();
          const members = Object.keys(statuses).map((userId) => this.createMember(Number(userId), statuses[Number(userId)])).filter((member) => member !== null && (!warMemberIds.size || warMemberIds.has(member.userId)));
          const pageFactions = this.getPageFactionInfos();
          const currentUserFactionId = DataMonitor.getCurrentFactionId();
          const spectating = this.isSpectating(currentUserFactionId, pageFactions);
          const ownFactionId = !spectating && currentUserFactionId || pageFactions.current?.id || this.getViewedFactionId();
          const opponentFactionId = spectating ? pageFactions.opponent?.id || 0 : 0;
          const enemy = members.filter((member) => opponentFactionId ? member.factionId === opponentFactionId : !ownFactionId || member.factionId !== ownFactionId);
          const own = members.filter((member) => ownFactionId && member.factionId === ownFactionId);
          const spectatingWar = !isOnOwnFactionPage() && ownFactionId > 0 && ownFactionId !== currentUserFactionId;
          const enemyFactionId = enemy[0]?.factionId || this.getEnemyFactionId(ownFactionId, pageFactions);
          const ownWar = currentUserFactionId > 0 && ownFactionId === currentUserFactionId && !spectatingWar && enemyFactionId > 0 && (isOnOwnFactionPage() || pageFactions.current?.id === currentUserFactionId || pageFactions.opponent?.id === currentUserFactionId);
          return {
            enemy,
            own,
            ownFactionId,
            enemyFactionId,
            enemyFactionName: this.getEnemyFactionName(ownFactionId, pageFactions),
            ownFactionName: this.getFactionNameForId(ownFactionId, pageFactions) || "Own Faction",
            canAttackEnemy: currentUserFactionId > 0 || spectatingWar && this.columnVisibility.enemy.spectateAttack,
            canAttackOwn: spectatingWar && this.columnVisibility.own.spectateAttack,
            spectatingWar,
            ownWar
          };
        }
        static createMember(userId, status) {
          if (!status?.factionId) {
            return null;
          }
          return {
            userId,
            name: status.name || `User ${userId}`,
            factionId: status.factionId,
            status
          };
        }
        static getViewedFactionId() {
          const pageFactions = this.getPageFactionInfos();
          if (pageFactions.current?.id) {
            return pageFactions.current.id;
          }
          const links = Array.from(document.querySelectorAll(
            'a[aria-labelledby="view-wars"][href*="/ranked/"], a[href*="factionWarfare#/ranked/"]'
          ));
          for (const link of links) {
            const match = link.href.match(/\/ranked\/(\d+)/);
            if (!match?.[1]) {
              continue;
            }
            const factionId = Number(match[1]);
            if (Number.isFinite(factionId) && factionId > 0) {
              return factionId;
            }
          }
          return 0;
        }
        static getPageFactionInfos() {
          const warFactions = DataMonitor.getWarFactions();
          if (warFactions.length === 2) {
            return this.getWarFactionInfos(warFactions[0], warFactions[1]);
          }
          const infos = {};
          const current = this.getPageFactionInfo('[class*="rankBox__"] a[class*="currentFactionName"][href*="factions.php"]');
          const opponent = this.getPageFactionInfo('[class*="rankBox__"] a[class*="opponentFactionName"][href*="factions.php"]');
          if (current) {
            infos.current = current;
          }
          if (opponent) {
            infos.opponent = opponent;
          }
          return infos;
        }
        static getWarFactionInfos(first, second) {
          const pageFactionId = Number(new URLSearchParams(location.search).get("ID")) || DataMonitor.getCurrentFactionId();
          const [current, opponent] = second.id === pageFactionId ? [second, first] : [first, second];
          return {
            current: { id: current.id, name: current.name || this.findFactionName(current.id) },
            opponent: { id: opponent.id, name: opponent.name || this.findFactionName(opponent.id) }
          };
        }
        static findFactionName(factionId) {
          const cached = this.factionNames.get(factionId);
          if (cached) {
            return cached;
          }
          for (const link of Array.from(document.querySelectorAll('a[href*="factions.php"]'))) {
            const name = link.textContent?.trim() || "";
            if (name && name.length <= 50 && link.href.match(/[?&]ID=(\d+)/)?.[1] === String(factionId)) {
              this.factionNames.set(factionId, name);
              return name;
            }
          }
          return "";
        }
        static getPageFactionInfo(selector) {
          const link = document.querySelector(selector);
          if (!link) {
            return void 0;
          }
          const match = link.href.match(/[?&]ID=(\d+)/);
          const id = match?.[1] ? Number(match[1]) : 0;
          const name = link.textContent?.trim() || "";
          if (!id || !name) {
            return void 0;
          }
          return { id, name };
        }
        static getFactionNameForId(factionId, pageFactions) {
          if (factionId && pageFactions.current?.id === factionId) {
            return pageFactions.current.name;
          }
          if (factionId && pageFactions.opponent?.id === factionId) {
            return pageFactions.opponent.name;
          }
          return "";
        }
        static getEnemyFactionName(ownFactionId, pageFactions) {
          if (pageFactions.opponent && pageFactions.opponent.id !== ownFactionId) {
            return pageFactions.opponent.name || "Enemy Faction";
          }
          if (pageFactions.current && pageFactions.current.id !== ownFactionId) {
            return pageFactions.current.name || "Enemy Faction";
          }
          return "Enemy Faction";
        }
        static getEnemyFactionId(ownFactionId, pageFactions) {
          if (pageFactions.opponent && pageFactions.opponent.id !== ownFactionId) {
            return pageFactions.opponent.id;
          }
          if (pageFactions.current && pageFactions.current.id !== ownFactionId) {
            return pageFactions.current.id;
          }
          return 0;
        }
        static sortMembers(members, fieldName) {
          const sortState = this.sortStates[fieldName];
          return [...members].sort((a, b) => {
            const favoriteComparison = Number(this.isFavorite(b.userId)) - Number(this.isFavorite(a.userId));
            if (favoriteComparison) {
              return favoriteComparison;
            }
            if (sortState.field === "status") {
              return this.compareStatusMembers(a, b, sortState.asc);
            }
            const comparison = this.compareMembers(a, b, sortState.field);
            return sortState.asc ? comparison : -comparison;
          });
        }
        static compareMembers(a, b, field) {
          if (field === "stats") {
            const statsComparison = this.getStatsSortValue(a.userId) - this.getStatsSortValue(b.userId);
            if (statsComparison) {
              return statsComparison;
            }
          }
          if (field === "score") {
            const scoreComparison = a.status.score - b.status.score;
            if (scoreComparison) {
              return scoreComparison;
            }
          }
          const nameComparison = a.name.localeCompare(b.name, void 0, { sensitivity: "base" });
          return nameComparison || a.userId - b.userId;
        }
        static compareStatusMembers(a, b, isAscending) {
          const currentStatus = DataMonitor.getCurrentUserStatus();
          const isAbroad = this.isAwayFromTorn(currentStatus);
          const canPrioritizeCurrentArea = isAbroad && !(currentStatus?.status === "Traveling" && currentStatus.area === 1);
          const currentAway = isAbroad ? 1 : 4;
          const otherAway = isAbroad ? 5 : 4;
          const okay = isAbroad ? isAscending ? 2 : 4 : isAscending ? 1 : 3;
          const jailed = isAbroad ? 3 : 2;
          const hospital = isAbroad ? isAscending ? 4 : 2 : isAscending ? 3 : 1;
          const statusA = this.getStatusSortTuple(a.userId, a.status, {
            currentStatus,
            canPrioritizeCurrentArea,
            currentAway,
            otherAway,
            okay,
            jailed,
            hospital,
            isAscending
          });
          const statusB = this.getStatusSortTuple(b.userId, b.status, {
            currentStatus,
            canPrioritizeCurrentArea,
            currentAway,
            otherAway,
            okay,
            jailed,
            hospital,
            isAscending
          });
          for (let idx = 0; idx < statusA.length; idx++) {
            const valueA = statusA[idx];
            const valueB = statusB[idx];
            if (valueA === valueB) {
              continue;
            }
            if (idx === 0 && typeof valueA === "number" && typeof valueB === "number") {
              return valueA - valueB;
            }
            if ((idx === 4 || idx === 5) && typeof valueA === "number" && typeof valueB === "number") {
              return isAscending ? valueA - valueB : valueB - valueA;
            }
            return valueA < valueB ? -1 : 1;
          }
          return this.compareMembers(a, b, "name");
        }
        static getStatusSortTuple(userId, status, context) {
          if (!status) {
            return [0, 0, "", 0, 0, 0];
          }
          const areaSortName = this.getAreaSortName(status.area);
          if (status.status === "Traveling" || status.area !== 1) {
            const isCurrentArea = context.canPrioritizeCurrentArea && context.currentStatus !== void 0 && status.area === context.currentStatus.area;
            return [
              isCurrentArea ? context.currentAway : context.otherAway,
              isCurrentArea ? 0 : 1,
              areaSortName,
              this.getAwayStatusValue(userId, status, context.isAscending),
              this.getFlightPhaseSortValue(userId, status),
              this.getTravelSortTimestamp(userId, status)
            ];
          }
          if (status.status === "Hospital") {
            return [context.hospital, 0, "", 0, 0, status.updateAt];
          }
          if (status.status === "Jail") {
            return [context.jailed, 0, "", 0, 0, status.updateAt];
          }
          const early = EarlyReturn.get(userId, status);
          return [context.okay, early ? 0 : 1, "", early ? -early.at : 0, 0, 0];
        }
        static getAreaSortName(area) {
          if (area === 1) {
            return "Torn";
          }
          return AREAS[area]?.name || "";
        }
        static isAwayFromTorn(status) {
          return Boolean(
            status && (status.status === "Traveling" || status.area !== 1 && (status.status === "Abroad" || status.status === "Hospital"))
          );
        }
        static getAwayStatusValue(userId, status, isAscending) {
          if (status.status === "Hospital") {
            return isAscending ? 2 : 1;
          }
          if (status.status === "Jail") {
            return 3;
          }
          if (status.status === "Traveling" && !this.isLandedTravelStatus(userId, status)) {
            return 4;
          }
          return isAscending ? 1 : 2;
        }
        static getTravelSortTimestamp(userId, status) {
          if (status.status !== "Traveling" || this.isLandedTravelStatus(userId, status)) {
            return status.updateAt;
          }
          return Fly.getFlightArrivalTimestamp(userId) || status.updateAt;
        }
        static getFlightPhaseSortValue(userId, status) {
          if (status.status !== "Traveling" || this.isLandedTravelStatus(userId, status)) {
            return 0;
          }
          const phase = Fly.getFlightArrivalPhase(userId);
          if (phase === "possible") {
            return 0;
          }
          if (phase === "expected") {
            return 1;
          }
          return 2;
        }
        static getStatsSortValue(userId) {
          return this.stats.get(userId)?.sortValue || 0;
        }
        static isFavorite(userId) {
          return Boolean(Cache.get(`faction_favorite_${userId}`));
        }
        static persistSortStates() {
          Cache.set(SORT_STATE_CACHE_KEY, {
            enemy: { ...this.sortStates.enemy },
            own: { ...this.sortStates.own }
          });
        }
        static persistStatsFilters() {
          Cache.set(STATS_FILTER_CACHE_KEY, {
            enemy: { ...this.statsFilters.enemy },
            own: { ...this.statsFilters.own }
          });
        }
        static persistStatusFilters() {
          Cache.set(STATUS_FILTER_CACHE_KEY, {
            enemy: [...this.statusFilters.enemy],
            own: [...this.statusFilters.own]
          });
        }
        static persistOnlineFilters() {
          Cache.set(ONLINE_FILTER_CACHE_KEY, {
            enemy: [...this.onlineFilters.enemy],
            own: [...this.onlineFilters.own]
          });
        }
        static persistColumnVisibility() {
          Cache.set(COLUMN_VISIBILITY_CACHE_KEY, { ...this.columnVisibility });
        }
        static toggleSort(fieldName, sortField) {
          const sortState = this.sortStates[fieldName];
          if (sortState.field === sortField) {
            sortState.asc = !sortState.asc;
          } else {
            sortState.field = sortField;
            sortState.asc = sortField !== "stats" && sortField !== "score";
          }
          this.persistSortStates();
          this.scheduleMountedUpdates();
        }
        static toggleSettings(fieldName) {
          this.activeSettings = this.activeSettings === fieldName ? null : fieldName;
          if (this.activeSettings !== null) {
            this.activeStatsFilter = null;
            this.activeStatusFilter = null;
            this.activeOnlineFilter = null;
          }
          this.scheduleMountedUpdates();
        }
        static toggleFilter(fieldName, kind) {
          this.activeSettings = null;
          if (kind === "stats") {
            this.activeStatsFilter = this.activeStatsFilter === fieldName ? null : fieldName;
            this.activeStatusFilter = null;
            this.activeOnlineFilter = null;
          } else if (kind === "status") {
            this.activeStatusFilter = this.activeStatusFilter === fieldName ? null : fieldName;
            this.activeStatsFilter = null;
            this.activeOnlineFilter = null;
          } else {
            this.activeOnlineFilter = this.activeOnlineFilter === fieldName ? null : fieldName;
            this.activeStatsFilter = null;
            this.activeStatusFilter = null;
          }
          this.scheduleMountedUpdates();
        }
        static closeFilters() {
          if (this.activeSettings === null && !this.activeStatsFilter && !this.activeStatusFilter && !this.activeOnlineFilter) {
            return;
          }
          this.activeSettings = null;
          this.activeStatsFilter = null;
          this.activeStatusFilter = null;
          this.activeOnlineFilter = null;
          this.scheduleMountedUpdates();
        }
        static updateOptionalColumnVisibility(fieldName, column, visible) {
          if (!OPTIONAL_COLUMNS.some((optionalColumn) => optionalColumn.id === column)) {
            return;
          }
          if (this.columnVisibility[fieldName][column] === visible) {
            return;
          }
          this.columnVisibility[fieldName][column] = visible;
          if (!visible && this.sortStates[fieldName].field === column) {
            this.sortStates[fieldName] = { field: "status", asc: true };
            this.persistSortStates();
          }
          this.persistColumnVisibility();
          this.scheduleMountedUpdates();
        }
        static updateStatsFilter(fieldName, field, value) {
          const expandedValue = this.expandStatsFilterSuffix(value);
          this.statsFilters[fieldName] = {
            ...this.statsFilters[fieldName],
            [field]: expandedValue.trim()
          };
          this.persistStatsFilters();
          this.scheduleMountedUpdates();
        }
        static clearStatsFilter(fieldName) {
          this.statsFilters[fieldName] = { from: "", to: "" };
          this.persistStatsFilters();
          this.activeStatsFilter = null;
          this.scheduleMountedUpdates();
        }
        static updateChoiceFilter(fieldName, kind, value, checked) {
          if (kind === "status" && this.isStatusFilterValue(value)) {
            this.statusFilters[fieldName] = this.updateChoiceFilterValues(this.statusFilters[fieldName], STATUS_FILTER_VALUES, value, checked);
            this.persistStatusFilters();
          }
          if (kind === "online" && this.isOnlineFilterValue(value)) {
            this.onlineFilters[fieldName] = this.updateChoiceFilterValues(this.onlineFilters[fieldName], ONLINE_FILTER_VALUES, value, checked);
            this.persistOnlineFilters();
          }
          this.scheduleMountedUpdates();
        }
        static clearChoiceFilter(fieldName, kind) {
          if (kind === "status") {
            this.statusFilters[fieldName] = [];
            this.activeStatusFilter = null;
            this.persistStatusFilters();
          } else {
            this.onlineFilters[fieldName] = [];
            this.activeOnlineFilter = null;
            this.persistOnlineFilters();
          }
          this.scheduleMountedUpdates();
        }
        static updateChoiceFilterValues(currentValues, allowedValues, value, checked) {
          const selected = new Set(currentValues);
          if (checked) {
            selected.add(value);
          } else {
            selected.delete(value);
          }
          return allowedValues.filter((allowedValue) => selected.has(allowedValue));
        }
        static isStatusFilterValue(value) {
          return STATUS_FILTER_VALUES.includes(value);
        }
        static isOnlineFilterValue(value) {
          return ONLINE_FILTER_VALUES.includes(value);
        }
        static closeFiltersOnOutsideClick(event) {
          const target = event.target;
          if (target instanceof Element && target.closest(`.${OVERVIEW_CLASS}_filter-ui, .${OVERVIEW_CLASS}_settings-ui`)) {
            return;
          }
          this.closeFilters();
        }
        static hasStatsFilter(fieldName) {
          const bounds = this.getStatsFilterBounds(fieldName);
          return bounds.from !== null || bounds.to !== null;
        }
        static hasStatusFilter(fieldName) {
          return this.statusFilters[fieldName].length > 0;
        }
        static hasOnlineFilter(fieldName) {
          return this.onlineFilters[fieldName].length > 0;
        }
        static filterMembers(members, fieldName) {
          return this.filterMembersByStats(members, fieldName).filter((member) => {
            return this.matchesStatusFilter(member, fieldName) && this.matchesOnlineFilter(member, fieldName);
          });
        }
        static matchesStatusFilter(member, fieldName) {
          const selected = this.statusFilters[fieldName];
          if (!selected.length) {
            return true;
          }
          const statusValue = this.getStatusFilterValue(member.status);
          return statusValue !== null && selected.includes(statusValue);
        }
        static matchesOnlineFilter(member, fieldName) {
          const selected = this.onlineFilters[fieldName];
          if (!selected.length) {
            return true;
          }
          const onlineValue = this.getOnlineFilterValue(member.status.onlineStatus);
          return onlineValue !== null && selected.includes(onlineValue);
        }
        static getStatusFilterValue(status) {
          if (status.status === "Hospital") {
            return "hospital";
          }
          if (status.status === "Jail") {
            return "jail";
          }
          if (status.status === "Traveling") {
            return "traveling";
          }
          if (status.status === "Abroad" || status.area !== 1) {
            return "abroad";
          }
          if (status.status === "Okay") {
            return "okay";
          }
          return null;
        }
        static getOnlineFilterValue(status) {
          if (status === "online" || status === "idle" || status === "offline") {
            return status;
          }
          return null;
        }
        static filterMembersByStats(members, fieldName) {
          const bounds = this.getStatsFilterBounds(fieldName);
          if (bounds.from === null && bounds.to === null) {
            return members;
          }
          return members.filter((member) => {
            const value = this.getStatsSortValue(member.userId);
            return (bounds.from === null || value >= bounds.from) && (bounds.to === null || value <= bounds.to);
          });
        }
        static getStatsFilterBounds(fieldName) {
          const filter = this.statsFilters[fieldName];
          return {
            from: this.parseStatFilterValue(filter.from),
            to: this.parseStatFilterValue(filter.to)
          };
        }
        static parseStatFilterValue(value) {
          const normalized = this.expandStatsFilterSuffix(value).trim().replace(/,/g, "").toLowerCase();
          if (!normalized) {
            return null;
          }
          const match = normalized.match(/^(\d+(?:\.\d+)?|\.\d+)\s*([kmbt]?)$/);
          if (!match) {
            return null;
          }
          const numericValue = Number(match[1]);
          if (!Number.isFinite(numericValue)) {
            return null;
          }
          const suffix = match[2];
          return numericValue * this.getStatSuffixMultiplier(suffix);
        }
        static expandStatsFilterSuffix(value) {
          const normalized = value.trim().replace(/,/g, "").toLowerCase();
          const match = normalized.match(/^(\d+(?:\.\d+)?|\.\d+)\s*([kmbt])$/);
          if (!match) {
            return value;
          }
          const numericValue = Number(match[1]);
          if (!Number.isFinite(numericValue)) {
            return value;
          }
          return this.formatStatFilterNumber(numericValue * this.getStatSuffixMultiplier(match[2]));
        }
        static getStatSuffixMultiplier(suffix) {
          switch (suffix) {
            case "t":
              return 1e12;
            case "b":
              return 1e9;
            case "m":
              return 1e6;
            case "k":
              return 1e3;
            default:
              return 1;
          }
        }
        static formatStatFilterNumber(value) {
          return value.toLocaleString("en-US", {
            useGrouping: false,
            maximumFractionDigits: 6
          });
        }
        static getStatusViewDisplay(userId, userStatus) {
          return {
            ...this.getStatusDisplay(userId, userStatus),
            isTraveling: userStatus.status === "Traveling" && !this.isLandedTravelStatus(userId, userStatus)
          };
        }
        static getStatusDisplay(userId, userStatus) {
          const area = AREAS[userStatus.area];
          const destination = area?.abbr || userStatus.status;
          if (this.isLandedTravelStatus(userId, userStatus)) {
            const display = {
              key: `landed:${destination}:${area?.flagUrl || ""}`,
              text: destination
            };
            if (area?.flagUrl) {
              display.flagUrl = area.flagUrl;
            }
            return display;
          }
          if (userStatus.status === "Traveling") {
            const flightCountdown = Fly.getFlightCountdown(userId);
            const flightText = flightCountdown ? formatTimestamp(getServerTimestampSeconds() + flightCountdown.seconds) : void 0;
            const detailClass = flightCountdown?.phase === "possible" ? "__warhelper_status_detail_flight_possible" : void 0;
            const display = {
              key: `traveling:${destination}:${flightText || ""}:${detailClass || ""}:${area?.flagUrl || ""}`,
              text: destination,
              icon: TRAVELING_SIGN
            };
            if (flightText) {
              display.detailText = flightText;
              if (detailClass) {
                display.detailClass = detailClass;
              }
            }
            if (area?.flagUrl) {
              display.flagUrl = area.flagUrl;
            }
            return display;
          }
          if (userStatus.status === "Abroad") {
            const display = {
              key: `abroad:${destination}:${area?.flagUrl || ""}`,
              text: destination
            };
            if (area?.flagUrl) {
              display.flagUrl = area.flagUrl;
            }
            return display;
          }
          const hasTimedStatus = userStatus.status === "Hospital" || userStatus.status === "Jail";
          const text2 = formatTimestamp(hasTimedStatus ? userStatus.updateAt : 0);
          if (userStatus.status === "Hospital" && userStatus.area !== 1) {
            const display = {
              key: `hospital-abroad:${destination}:${text2}:${area?.flagUrl || ""}`,
              text: destination,
              detailText: text2,
              detailClass: "__warhelper_status_detail_hospital"
            };
            if (area?.flagUrl) {
              display.flagUrl = area.flagUrl;
            }
            return display;
          }
          return {
            key: `status:${userStatus.status}:${text2}`,
            text: hasTimedStatus ? text2 : userStatus.status
          };
        }
        static getStatusClasses(userId, status, display) {
          const isOkay = display.text === "Okay" && !display.icon && !display.flagUrl;
          const isHospital = status.status === "Hospital" && !isOkay;
          const isJail = status.status === "Jail" && !isOkay;
          const isTraveling = status.status === "Traveling" && !this.isLandedTravelStatus(userId, status);
          const classes = [];
          if (isHospital) {
            classes.push("hospital", "not-ok");
          }
          if (isJail) {
            classes.push("jail");
          }
          if (isOkay) {
            classes.push("okay", "ok");
          }
          if (status.area !== 1) {
            classes.push("abroad");
          }
          if (isTraveling) {
            classes.push("traveling");
          }
          return classes.join(" ");
        }
        static isLandedTravelStatus(userId, status) {
          return status.status === "Traveling" && status.area !== 1 && Fly.hasExpiredFlightArrival(userId);
        }
        static trackOnlineStatusChanges(members) {
          const now2 = Date.now();
          this.cleanupExpiredOnlineFlashes(now2);
          const focused = document.hasFocus();
          members.forEach((member) => {
            const currentOnlineStatus = member.status.onlineStatus;
            const previousOnlineStatus = this.renderedOnlineStatuses.get(member.userId);
            if (focused && previousOnlineStatus !== void 0 && previousOnlineStatus !== currentOnlineStatus && this.isFlashOnlineStatus(currentOnlineStatus)) {
              this.pendingOnlineFlashes.set(member.userId, {
                status: currentOnlineStatus,
                startedAt: now2,
                expiresAt: now2 + ONLINE_FLASH_DURATION_MS
              });
            }
            this.renderedOnlineStatuses.set(member.userId, currentOnlineStatus);
          });
        }
        static getPendingOnlineFlash(member) {
          const flash = this.pendingOnlineFlashes.get(member.userId);
          if (!flash || flash.status !== member.status.onlineStatus || !document.hasFocus()) {
            return null;
          }
          const now2 = Date.now();
          if (flash.expiresAt <= now2) {
            this.pendingOnlineFlashes.delete(member.userId);
            return null;
          }
          return {
            key: `${flash.status}:${flash.startedAt}`,
            className: `${OVERVIEW_CLASS}_row-${flash.status}`,
            delayMs: Math.min(0, flash.startedAt - now2)
          };
        }
        static cleanupExpiredOnlineFlashes(now2) {
          this.pendingOnlineFlashes.forEach((flash, userId) => {
            if (flash.expiresAt <= now2) {
              this.pendingOnlineFlashes.delete(userId);
            }
          });
        }
        static isFlashOnlineStatus(status) {
          return status === "online" || status === "idle";
        }
        static ensureStats(members) {
          this.ensureUserScore();
          const byFaction = /* @__PURE__ */ new Map();
          members.forEach((member) => {
            if (!this.stats.has(member.userId)) {
              const cachedSources = getCachedSpySources(member.userId);
              if (cachedSources.length) {
                this.setSpySources(member.userId, cachedSources);
              } else {
                this.stats.set(member.userId, LOADING_STAT_DISPLAY);
              }
            }
            if (this.requestedSpyUsers.has(member.userId)) {
              return;
            }
            const users = byFaction.get(member.factionId) || [];
            users.push(member.userId);
            byFaction.set(member.factionId, users);
          });
          byFaction.forEach((userIds, factionId) => {
            if (this.pendingStatsByFaction.has(factionId)) {
              return;
            }
            userIds.forEach((userId) => this.requestedSpyUsers.add(userId));
            const generation = this.statsLoadGeneration;
            const pending = getSpies(userIds, factionId, {
              onUpdate: (update2) => this.applySpyUpdate(update2, generation)
            }).then((spies) => {
              if (generation !== this.statsLoadGeneration) {
                return;
              }
              userIds.forEach((userId) => {
                if (this.spySources.get(userId)?.length) {
                  return;
                }
                const cachedSources = getCachedSpySources(userId);
                if (cachedSources.length) {
                  this.setSpySources(userId, cachedSources);
                  return;
                }
                this.stats.set(userId, this.formatSpy(spies[userId]));
              });
            }).catch(() => {
              if (generation !== this.statsLoadGeneration) {
                return;
              }
              userIds.forEach((userId) => {
                if (!this.spySources.get(userId)?.length) {
                  this.stats.set(userId, this.createMissingStatDisplay());
                }
              });
            }).finally(() => {
              if (generation === this.statsLoadGeneration) {
                this.pendingStatsByFaction.delete(factionId);
                this.scheduleMountedUpdates();
              }
            });
            this.pendingStatsByFaction.set(factionId, pending);
          });
        }
        static ensureUserScore() {
          if (this.userScoreLoaded || this.pendingUserScore) {
            return;
          }
          const generation = this.statsLoadGeneration;
          this.pendingUserScore = User.getUserStats().then((userStats) => userStats?.score).catch(() => void 0).then((score) => {
            if (generation !== this.statsLoadGeneration) {
              return score;
            }
            this.userScore = score;
            this.userScoreLoaded = true;
            this.refreshStatDisplays();
            return score;
          }).finally(() => {
            if (generation === this.statsLoadGeneration) {
              this.pendingUserScore = null;
            }
          });
        }
        static applySpyUpdate(update2, generation) {
          if (generation !== this.statsLoadGeneration) {
            return;
          }
          this.setSpySources(update2.userId, update2.spies);
          this.scheduleMountedUpdates();
        }
        static setSpySources(userId, sources) {
          const orderedSources = getOrderedSpies(sources);
          this.spySources.set(userId, orderedSources);
          this.refreshStatDisplay(userId);
        }
        static refreshStatDisplays() {
          this.spySources.forEach((_sources, userId) => this.refreshStatDisplay(userId));
          this.scheduleMountedUpdates();
        }
        static refreshStatDisplay(userId) {
          const sources = getOrderedSpies(this.spySources.get(userId) || []);
          this.stats.set(userId, this.formatSpy(sources.length ? getPreferredSpy(sources, userId) : void 0, sources));
        }
        static applySpySourcePreference() {
          this.refreshStatDisplays();
        }
        static reloadStats() {
          this.statsLoadGeneration++;
          this.stats.clear();
          this.spySources.clear();
          this.pendingStatsByFaction.clear();
          this.requestedSpyUsers.clear();
          this.userScore = void 0;
          this.userScoreLoaded = false;
          this.pendingUserScore = null;
          this.scheduleMountedUpdates();
        }
        static formatSpy(spy, sources = []) {
          if (!spy || spy.type === 0 /* None */) {
            return this.createMissingStatDisplay();
          }
          const sourceList = sources.length ? getOrderedSpies(sources) : [spy];
          const type = this.getSpyTypeDisplay(spy.type);
          const { ff, ffUncapped } = this.getSpyFairFight(spy);
          const statsBarColor = this.getStatsBarColor(ffUncapped);
          const statsBarPercent = this.getStatsBarPercent(ffUncapped);
          const whore = this.getWhoreClass(spy, sourceList);
          const html = `
      <div class="__warhelper_total ${whore}">${spy.total ? abbreviateNumber(spy.total) : "N/A"}</div>
      <div class="__warhelper_bstype ${type.className}">${type.shortName}</div>
      ${ff > 0 ? `<div class="__warhelper_compare ${statsBarColor}" style="--fill: ${statsBarPercent}%;"></div>` : ""}
    `;
          return {
            html,
            tooltip: this.createSpyTooltip(sourceList, spy),
            sortValue: spy.total || spy.score || 0,
            sourceCount: sourceList.length
          };
        }
        static getSpyFairFight(spy) {
          let ffUncapped = spy.fairfight || 0;
          if (spy.score && this.userScore) {
            ffUncapped = Math.round((1 + 8 / 3 * (spy.score / this.userScore)) * 100) / 100;
          }
          return {
            ff: Math.min(3, ffUncapped),
            ffUncapped
          };
        }
        static createSpyTooltip(sources, selected) {
          const rows = [];
          const hasPremium = sources.some((spy) => spy.premium || spy.altTotal);
          const ffs = sources.find((spy) => spy.type === 5 /* FFS */);
          const linked = sources.filter((spy) => (spy.type === 1 /* TS */ || spy.type === 3 /* YATA */) && ffs && this.hasSameBreakdown(spy, ffs));
          const linkedShown = linked.find((spy) => spy.type === selected.type);
          const duplicates = linked.filter((spy) => spy !== linkedShown);
          sources.forEach((spy) => {
            if (duplicates.includes(spy)) {
              return;
            }
            rows.push(this.createSpyTooltipSourceRow(spy));
            if (spy.type === 5 /* FFS */ && spy.altTotal) {
              rows.push(this.createSpyTooltipSourceRow({
                type: 5 /* FFS */,
                userId: spy.userId,
                total: spy.altTotal,
                fairfight: spy.altFairfight,
                timestamp: spy.altTimestamp || 0,
                premium: !spy.premium
              }));
            }
            if (hasStatBreakdown(spy, sources) && !(linkedShown && spy === ffs)) {
              const age = spy.breakdownTimestamp ? `, ${this.formatSpyAge(spy.breakdownTimestamp)} old` : "";
              rows.push(
                this.createSpyTooltipTextRow("Breakdown", `${getBreakdownSource(spy)}${age}`),
                this.createSpyTooltipDetailRow("Strength", spy.strength),
                this.createSpyTooltipDetailRow("Defense", spy.defense),
                this.createSpyTooltipDetailRow("Speed", spy.speed),
                this.createSpyTooltipDetailRow("Dexterity", spy.dexterity),
                this.createSpyTooltipDetailRow("Stats total", getBreakdownTotal(spy))
              );
            }
            if (spy.distribution) {
              rows.push(this.createSpyTooltipTextRow("Build", spy.distribution));
            }
          });
          if (hasPremium) {
            rows.push(`<tr class="__warhelper_spy_note"><td colspan="4">* FFScouter premium estimate</td></tr>`);
          }
          return `<table class="__warhelper_tooltip __warhelper_spy_tooltip">${rows.join("")}</table>`;
        }
        static hasSameBreakdown(a, b) {
          return Boolean(a.strength) && a.strength === b.strength && a.speed === b.speed && a.defense === b.defense && a.dexterity === b.dexterity;
        }
        static createSpyTooltipSourceRow(spy) {
          const type = this.getSpyTypeDisplay(spy.type);
          const { ff } = this.getSpyFairFight(spy);
          return [
            "<tr>",
            `<td><span class="__warhelper_spy_source ${type.className}">${type.tooltipName}</span></td>`,
            `<td>${spy.total ? abbreviateNumber(spy.total, 2) : "N/A"}${spy.premium ? "*" : ""}</td>`,
            `<td>${ff > 0 ? ff.toFixed(2) : "N/A"}</td>`,
            `<td>${spy.timestamp > 0 ? this.formatSpyAge(spy.timestamp) : ""}</td>`,
            "</tr>"
          ].join("");
        }
        static createSpyTooltipDetailRow(label, value) {
          return [
            `<tr class="__warhelper_spy_detail">`,
            `<td>${label}</td>`,
            `<td colspan="3">${value ? abbreviateNumber(value, 2) : "N/A"}</td>`,
            "</tr>"
          ].join("");
        }
        static createSpyTooltipTextRow(label, value) {
          return `<tr class="__warhelper_spy_detail"><td>${label}</td><td colspan="3">${escapeHtml(value)}</td></tr>`;
        }
        // Short age, e.g. "5h" or "3d".
        static formatSpyAge(timestampSeconds) {
          const seconds = Math.max(0, getServerTimestampSeconds() - timestampSeconds);
          const units = [[365 * 86400, "y"], [30 * 86400, "mo"], [86400, "d"], [3600, "h"], [60, "m"]];
          const unit = units.find(([size]) => seconds >= size);
          return unit ? `${Math.floor(seconds / unit[0])}${unit[1]}` : "now";
        }
        static createMissingStatDisplay() {
          return {
            html: "N/A",
            tooltip: "",
            sortValue: 0,
            sourceCount: 0
          };
        }
        static getStatsBarColor(value) {
          if (value >= 5) return "r";
          if (value >= 4) return "y";
          if (value >= 3) return "g";
          return "w";
        }
        static getStatsBarPercent(value) {
          const min = 1;
          const mid = 3;
          const max = 5;
          const minPercent = 5;
          const midPercent = 50;
          const maxPercent = 100;
          if (value <= min) {
            return minPercent;
          }
          if (value >= max) {
            return maxPercent;
          }
          if (value <= mid) {
            return minPercent + (value - min) / (mid - min) * (midPercent - minPercent);
          }
          return midPercent + (value - mid) / (max - mid) * (maxPercent - midPercent);
        }
        static getWhoreClass(spy, sources) {
          if (!hasStatBreakdown(spy, sources)) {
            return "";
          }
          const stats = [spy.strength, spy.defense, spy.speed, spy.dexterity].map((value) => value || 0);
          const total = stats.reduce((sum, value) => sum + value, 0);
          if (!total) {
            return "";
          }
          const idx = stats.findIndex((value) => value / total >= 0.45);
          if (idx === -1) {
            return "";
          }
          return ["str", "def", "spd", "dex"][idx] || "";
        }
        static getSpyTypeDisplay(type) {
          switch (type) {
            case 1 /* TS */:
              return { shortName: "T", className: "T", tooltipName: "TS" };
            case 2 /* BSP */:
              return { shortName: "B", className: "B", tooltipName: "BSP" };
            case 3 /* YATA */:
              return { shortName: "Y", className: "Y", tooltipName: "YATA" };
            case 4 /* YATAEstimate */:
              return { shortName: "Y", className: "YE", tooltipName: "YE" };
            case 5 /* FFS */:
              return { shortName: "F", className: "F", tooltipName: "FFS" };
            default:
              return { shortName: "?", className: "", tooltipName: "?" };
          }
        }
        static toggleFavorite(userId) {
          Cache.set(`faction_favorite_${userId}`, !this.isFavorite(userId));
          this.bypassBodyInteractionHoldForNextUpdate = true;
          this.scheduleMountedUpdates();
        }
        static openAttackPage(userId) {
          // Lite build: Tab class removed. Opens in a new tab/view.
          // On PDA each attack gets a unique tab name so multiple attacks can coexist;
          // on desktop they reuse the same "_warhelper" tab.
          const tabName = isPDA() ? `_warhelper_${Date.now()}` : "_warhelper";
          const tab = window.open(`page.php?sid=attack&user2ID=${userId}`, tabName);
          tab?.focus();
        }
        static bindDibs(node, userId) {
          // Lite build: Dibs removed.
        }
        static bindFlyStatus(node, params) {
          if (params.active) {
            Fly.bindStatusNode(params.userId, node, params.factionId);
            return;
          }
          delete node.dataset["warhelperFlyHover"];
          node.removeAttribute("title");
          node.removeAttribute("aria-label");
        }
        static getLastFavoriteIndex(members) {
          for (let index = members.length - 1; index >= 0; index--) {
            const member = members[index];
            if (member && this.isFavorite(member.userId)) {
              return index;
            }
          }
          return -1;
        }
        static removeDuplicateOverviews(parent, current) {
          Array.from(parent.children).forEach((child) => {
            if (child instanceof HTMLElement && child !== current && child.classList.contains(OVERVIEW_CLASS)) {
              child.remove();
            }
          });
        }
        static isActiveOriginal(original) {
          return original.isConnected && original.matches(ORIGINAL_SELECTOR) && !this.isChainDescription(original);
        }
        // The chain panel's description shares the war list's wrapper on PDA.
        static isChainDescription(original) {
          return /^#\/war\/chain\b/.test(location.hash) || original.querySelector(".chain-attacks-list, .chain-attacks-title") !== null;
        }
        static isActiveMount(original, mount) {
          return this.isActiveOriginal(original) && mount.parent.contains(original) && mount.parent.contains(mount.overview);
        }
        static observeLifecycle(parent, original, overview, component) {
          const existing = this.mounts.get(original);
          if (existing) {
            this.cleanupMount(original, existing, false);
          }
          const mount = {
            observer: new MutationObserver(() => {
              if (!this.isActiveMount(original, mount)) {
                this.cleanupMount(original, mount);
              }
            }),
            parent,
            overview,
            component,
            updateFrame: null
          };
          mount.observer.observe(document.body, { childList: true, subtree: true });
          this.mounts.set(original, mount);
        }
        static cleanupMount(original, mount, removeOverview = true) {
          mount.observer.disconnect();
          if (mount.updateFrame !== null) {
            window.cancelAnimationFrame(mount.updateFrame);
          }
          mount.component.$destroy();
          if (removeOverview) {
            mount.overview.remove();
          }
          this.mounts.delete(original);
          this.updateOriginalVisibility();
        }
      };
    }
  });

  // src/main.ts
  init_Cache();
  Cache.ready.then(() => Promise.all([
    Promise.resolve().then(() => (init_Config(), Config_exports)),
    Promise.resolve().then(() => (init_Faction(), Faction_exports)),
    Promise.resolve().then(() => (init_WarOverview(), WarOverview_exports))
  ]));
})();
})();
