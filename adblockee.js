/*! AdBlockee v2.0.1
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
    .bXvkHCNOXigrpicAqmgd:is(.dvBGYlxl9sz3NBGlFf2T, .a9rFTjlXXl3MN3yB6J2z) {
      height: auto !important;
      min-height: 0 !important;
      max-height: none !important;
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

  // src/controller.js
  var VERSION = "2.0.1";
  var MUSIC_SLOTS = /* @__PURE__ */ new Set([
    "stream",
    "preroll",
    "hpto",
    "leaderboard",
    "sponsored-playlist",
    "embedded-npv",
    "embedded-playlist",
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
    let linearSlots = /* @__PURE__ */ new Set();
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
    const status = () => ({ ...state, errors: [...state.errors], appliedManagers: [...state.appliedManagers] });
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
      details.textContent = `${state.slotCount} music ad slots configured. ${state.errors.length ? "Some controls need attention; see console warnings." : "No compatibility errors reported."}`;
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
        const result = await attempt(name, () => manager[method]());
        return result.ok ? name : null;
      }));
      if (!active) return;
      state.appliedManagers = results.filter(Boolean);
      state.audio = state.appliedManagers.includes("audio") ? "applied" : "unavailable";
      const product = platform.ProductStateAPI?.productStateApi || platform.UserAPI?._product_state_service || platform.UserAPI?._product_state;
      if (typeof product?.putOverridesValues === "function") {
        const result = await attempt("ad preference", () => product.putOverridesValues({ pairs: { ads: "0" } }));
        if (result.ok) overrideOwner = product;
      }
      if (!active) return;
      const current = managers.inStreamApi?.adsCoreConnector || managers.audio?.inStreamApi?.adsCoreConnector;
      if (connector !== current) {
        connector = current;
        slotNames = [];
        linearSlots = /* @__PURE__ */ new Set();
      }
      if (connector?.enableSlot && connector?.clearSlot) {
        if (!slotNames.length && typeof managers.config?.getAdsSlotConfig === "function") {
          const config = await attempt("music ad configuration", () => managers.config.getAdsSlotConfig());
          if (config.ok && config.value && typeof config.value === "object") {
            slotNames = Object.keys(config.value).filter((name) => MUSIC_SLOTS.has(name));
            linearSlots = new Set(slotNames.filter((name) => config.value[name]?.linear === true));
          }
        }
        if (!active) return;
        let configured = 0;
        await Promise.all(slotNames.map(async (slot) => {
          const disabled = await attempt(`disable ${slot}`, () => connector.enableSlot(slot, false));
          if (!active || !disabled.ok) return;
          configured++;
          if (linearSlots.has(slot)) await attempt(`clear ${slot}`, () => connector.clearSlot(slot));
        }));
        state.slotCount = configured;
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
