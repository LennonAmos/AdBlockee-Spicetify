/*! AdBlockee v2.1.1
 * MIT License
 *
 * Copyright (c) 2026 LennonAmos
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */
(() => {
  // src/cosmetics.js
  var STYLE_ID = "adblockee-ui";
  function localeText(api, key, fallback) {
    try {
      const text = api?.Locale?.get?.(key);
      return typeof text === "string" && text !== key ? text : fallback;
    } catch {
      return fallback;
    }
  }
  function installCosmetics(document, api) {
    if (!document.head) return false;
    const advertisement = JSON.stringify(localeText(api, "ad-formats.advertisement", "Advertisement"));
    const limited = JSON.stringify(localeText(api, "ad-formats.limited-ads-more-info", "Limited ads. More information"));
    const rules = `
    /* HomeNativeAdsShelf uses neither home-ad-card nor home-ads-container.
       Hide the entire shelf, including its heading and reserved layout space.
       These markers are independent of the recommendation's title/language. */
    main section.VgSsqvSSHowr6JjIJ6lF,
    main section[data-shelf-collapsable]:has(.nP8cc31SRmgpKK0rPWkN),
    main section:has([data-testid="sponsored-recommendation-modal-trigger"]),
    :is(
      [data-testid="scroll-card-ad"],
      [aria-label="npv-sponsorship-title"],
      [data-testid="home-ad-card"],
      [data-testid="home-ads-container"],
      [data-testid="billboard-minimized"],
      [data-testid="billboard-image-link"],
      [data-testid="hpto-parent-container"],
      [data-testid="html-hpto-container"],
      #leaderboard-ad-element,
      #view-billboard-ad,
      .main-leaderboardComponent-container,
      .sponsor-container,
      .DS0j8uh2_B2J1GeX8jS2,
      .bi41j5zJhoOgdH38v1Ma,
      .mFtiCBZ8CC7MoLGk_hyJ
    ),
    section[aria-label=${advertisement}],
    span:has(> button[aria-label=${limited}]),
    span:has(> button[aria-label="Limited ads. More information"]) {
      display: none !important;
    }
    /* Spotify 1.3's extra-tall sponsored playlist variants only. */
    .bXvkHCNOXigrpicAqmgd:is(.dvBGYlxl9sz3NBGlFf2T, .a9rFTjlXXl3MN3yB6J2z),
    .main-entityHeader-container:is(.main-entityHeader-withSponsoredAdVideo, .main-entityHeader-withSponsoredAdVideoV3) {
      height: auto !important;
      min-height: 0 !important;
      max-height: none !important;
      transition: none !important;
    }
    div:has(> .main-leaderboardComponent-container) {
      display: none !important;
    }
  `;
    let style = document.getElementById(STYLE_ID);
    if (!style) {
      style = document.createElement("style");
      style.id = STYLE_ID;
      document.head.append(style);
    }
    if (style.textContent !== rules) style.textContent = rules;
    return true;
  }
  function removeCosmetics(document) {
    document.getElementById(STYLE_ID)?.remove();
  }

  // src/slots.js
  var BLOCKED_ENDPOINT = "http://127.0.0.1:9/adblockee";
  function hasAds(value) {
    const slot = value?.adSlot ?? value;
    return Boolean(slot?.hasActiveAd || slot?.hasAvailableAds || slot?.availableAds?.length);
  }
  function createSlotGuard(connector, attempt, isActive) {
    const watched = /* @__PURE__ */ new Map();
    const clearing = /* @__PURE__ */ new Map();
    let stopped = false;
    let intercepted = 0;
    async function setEndpoint(slot, entry) {
      if (entry.endpoint || stopped || !isActive() || typeof connector.updateAdServerEndpoint !== "function") return;
      const result = await attempt(`ad endpoint ${slot}`, async () => {
        const response = await connector.updateAdServerEndpoint([slot], BLOCKED_ENDPOINT);
        if (response?.status && response.status !== 0) throw Error(`native status ${response.status}`);
      });
      entry.endpoint = result.ok;
    }
    function clear(slot) {
      if (stopped || !isActive()) return Promise.resolve();
      if (clearing.has(slot)) return clearing.get(slot);
      const pending = attempt(`clear ${slot}`, () => connector.clearSlot(slot)).then((result) => {
        if (result.ok) intercepted++;
      }).finally(() => clearing.delete(slot));
      clearing.set(slot, pending);
      return pending;
    }
    async function watch(slot) {
      if (stopped || !isActive()) return false;
      const existing = watched.get(slot);
      if (existing) {
        await setEndpoint(slot, existing);
        return existing.ready;
      }
      const entry = { subscription: null, ready: false, endpoint: false };
      watched.set(slot, entry);
      if (typeof connector.subscribeToSlot !== "function") {
        watched.delete(slot);
        return false;
      }
      const subscription = await attempt(`watch ${slot}`, () => connector.subscribeToSlot(slot, (message) => {
        const event = message?.adSlotEvent;
        if (event?.ad && (event.eventType === 0 || event.eventType === 1)) clear(slot);
      }));
      if (subscription.ok) entry.subscription = subscription.value;
      if (stopped || !isActive()) {
        entry.subscription?.cancel?.();
        return false;
      }
      if (!subscription.ok) {
        watched.delete(slot);
        return false;
      }
      entry.ready = true;
      await setEndpoint(slot, entry);
      if (typeof connector.getSlot === "function" && !stopped && isActive()) {
        const current = await attempt(`inspect ${slot}`, () => connector.getSlot(slot));
        if (current.ok && hasAds(current.value)) await clear(slot);
      }
      return true;
    }
    async function dispose() {
      stopped = true;
      for (const { subscription } of watched.values()) subscription?.cancel?.();
      watched.clear();
      await Promise.all([...clearing.values()]);
    }
    return { watch, dispose, count: () => [...watched.values()].filter((e) => e.ready).length, intercepted: () => intercepted };
  }

  // src/controller.js
  var VERSION = "2.1.1";
  var MUSIC_SLOTS = /* @__PURE__ */ new Set([
    "stream",
    "preroll",
    "hpto",
    "leaderboard",
    "sponsored-playlist",
    "embedded-npv",
    "embedded-playlist",
    "embedded-playlist-leavebehind",
    "stream-user-actions",
    "music-see-all"
  ]);
  function createController(host) {
    let active = false;
    let running = null;
    let poll;
    let heartbeat;
    let menu;
    let player;
    let overrideOwner;
    let connector;
    let slotNames = [];
    let guard;
    const applied = /* @__PURE__ */ new Map();
    let polls = 0;
    const state = {
      version: VERSION,
      cosmetic: false,
      audio: "waiting",
      slotCount: 0,
      appliedManagers: [],
      lastCheck: null,
      errors: []
    };
    const status = () => ({ ...state, intercepted: guard?.intercepted() ?? 0, errors: [...state.errors], appliedManagers: [...state.appliedManagers] });
    const issue = (label, error) => {
      const message = `${label}: ${error?.message || String(error)}`;
      if (!state.errors.includes(message)) state.errors = [...state.errors.slice(-7), message];
      host.console.warn("AdBlockee:", message);
    };
    async function attempt(label, action) {
      let timer;
      try {
        const value = await Promise.race([
          Promise.resolve().then(action),
          new Promise((_, reject) => {
            timer = host.setTimeout(() => reject(Error("timed out")), 4e3);
          })
        ]);
        return { ok: true, value };
      } catch (error) {
        if (active) issue(label, error);
        return { ok: false };
      } finally {
        host.clearTimeout(timer);
      }
    }
    function showStatus() {
      const root = host.document.createElement("div");
      const summary = host.document.createElement("p");
      summary.textContent = `AdBlockee ${VERSION} \xB7 Sponsor UI: ${state.cosmetic ? "active" : "waiting"} \xB7 Audio controls: ${state.audio}`;
      root.append(summary);
      const details = host.document.createElement("p");
      details.textContent = `${state.slotCount} music ad slots monitored. ${guard?.intercepted() ?? 0} ad slot interceptions this session. ${state.errors.length ? "Some controls need attention; see console warnings." : "No compatibility errors reported."}`;
      root.append(details);
      const link = host.document.createElement("a");
      link.textContent = "Project, updates and bug reports";
      link.href = "https://github.com/LennonAmos/AdBlockee-Spicetify";
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      root.append(link);
      host.Spicetify?.PopupModal?.display?.({ title: "AdBlockee", content: root });
    }
    function connectPlayer(api) {
      if (api.Player?.addEventListener && player !== api.Player) {
        player?.removeEventListener?.("songchange", refresh);
        player = api.Player;
        player.addEventListener("songchange", refresh);
      }
      if (!menu && api.Menu?.Item && api.PopupModal?.display) {
        menu = new api.Menu.Item("AdBlockee status", false, showStatus);
        menu.register();
      }
    }
    async function protect() {
      state.errors = [];
      state.slotCount = 0;
      const api = host.Spicetify;
      state.cosmetic = installCosmetics(host.document, api);
      if (!api?.Platform) return;
      connectPlayer(api);
      const platform = api.Platform;
      const managers = platform.AdManagers;
      if (!managers?.audio) {
        state.audio = "unavailable";
        return;
      }
      const tasks = [
        ["audio", managers.audio, "disable"],
        ["in-stream", managers.inStreamApi, "disable"],
        ["leaderboard", managers.leaderboard, "disableLeaderboard"],
        ["billboard", managers.billboard, "disable"],
        ["video takeover", managers.vto?.manager, "disable"],
        ["embedded card", managers.embeddedAd?.embeddedAdManager, "disable"],
        ["sponsored playlist", managers.sponsoredPlaylist, "disable"]
      ];
      const results = await Promise.all(tasks.map(async ([name, manager, method]) => {
        if (typeof manager?.[method] !== "function") return null;
        if (applied.get(name) === manager && manager.enabled !== true) return name;
        const result = await attempt(name, () => manager[method]());
        if (result.ok) applied.set(name, manager);
        return result.ok ? name : null;
      }));
      if (!active) return;
      state.appliedManagers = results.filter(Boolean);
      state.audio = state.appliedManagers.includes("audio") ? "applied" : "unavailable";
      const product = platform.ProductStateAPI?.productStateApi || platform.UserAPI?._product_state_service || platform.UserAPI?._product_state;
      if (product !== overrideOwner && typeof product?.putOverridesValues === "function") {
        const result = await attempt("ad preference", () => product.putOverridesValues({ pairs: { ads: "0" } }));
        if (result.ok) overrideOwner = product;
      }
      if (!active) return;
      const current = managers.inStreamApi?.adsCoreConnector || managers.audio?.inStreamApi?.adsCoreConnector;
      if (connector !== current) {
        await guard?.dispose();
        connector = current;
        slotNames = [];
        guard = connector ? createSlotGuard(connector, attempt, () => active) : void 0;
      }
      if (connector?.clearSlot && guard) {
        if (!slotNames.length && typeof managers.config?.getAdsSlotConfig === "function") {
          const config = await attempt("music ad configuration", () => managers.config.getAdsSlotConfig());
          if (config.ok && config.value && typeof config.value === "object") {
            slotNames = Object.keys(config.value).filter((name) => MUSIC_SLOTS.has(name));
          }
        }
        if (!active) return;
        await Promise.all(slotNames.map((slot) => guard.watch(slot)));
        state.slotCount = guard.count();
      }
      state.lastCheck = (/* @__PURE__ */ new Date()).toISOString();
    }
    function refresh() {
      if (!active) return Promise.resolve(status());
      if (running) return running.then(status);
      running = protect().catch((error) => issue("refresh", error)).finally(() => {
        running = null;
      });
      return running.then(status);
    }
    function start() {
      if (active) return refresh();
      active = true;
      state.cosmetic = installCosmetics(host.document, host.Spicetify);
      host.document.addEventListener("visibilitychange", onVisible);
      poll = host.setInterval(() => {
        polls++;
        if (host.Spicetify?.Platform?.AdManagers?.audio || polls >= 120) {
          host.clearInterval(poll);
          refresh();
        }
      }, 250);
      heartbeat = host.setInterval(refresh, 3e4);
      return refresh();
    }
    function onVisible() {
      if (host.document.visibilityState === "visible") refresh();
    }
    async function dispose({ restore = true } = {}) {
      active = false;
      host.clearInterval(poll);
      host.clearInterval(heartbeat);
      host.document.removeEventListener("visibilitychange", onVisible);
      player?.removeEventListener?.("songchange", refresh);
      menu?.deregister?.();
      removeCosmetics(host.document);
      if (running) await running;
      await guard?.dispose();
      if (restore && overrideOwner?.delOverridesValues) {
        try {
          await overrideOwner.delOverridesValues({ keys: ["ads"] });
        } catch (error) {
          host.console.warn("AdBlockee: reload Spotify to restore its ad preference.", error);
        }
      }
    }
    return { version: VERSION, start, refresh, status, dispose };
  }

  // src/entry.js
  async function launch() {
    await window.AdBlockee?.dispose?.({ restore: false });
    window.AdBlockee = createController(window);
    await window.AdBlockee.start();
  }
  launch().catch((error) => console.warn("AdBlockee could not initialize:", error));
})();
