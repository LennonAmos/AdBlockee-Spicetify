/*! AdBlockee v2.2.0
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
  function hasAds(value) {
    const slot = value?.adSlot ?? value;
    return Boolean(slot?.hasActiveAd || slot?.hasAvailableAds || slot?.availableAds?.length);
  }
  function createSlotGuard(connector, attempt, isActive, onAd = () => {
  }) {
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
    function clear(slot, entry, refreshEndpoint = false) {
      if (stopped || !isActive()) return Promise.resolve();
      if (clearing.has(slot)) return clearing.get(slot);
      const pending = (async () => {
        const cleared = attempt(`clear ${slot}`, () => connector.clearSlot(slot));
        if (refreshEndpoint) {
          entry.endpoint = false;
          await setEndpoint(slot, entry);
        }
        return cleared;
      })().then((result) => {
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
        if (event?.ad && (event.eventType === 0 || event.eventType === 1)) {
          clear(slot, entry, true);
          onAd(slot);
        }
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

  // src/ad-silencer.js
  function createAdSilencer(getApi, currentAdvertisement2, attempt) {
    let saved;
    let running;
    let again = false;
    let stopped = false;
    let userOverride = false;
    let count = 0;
    async function restore() {
      const previous = saved;
      if (!previous) return;
      const volume = previous.player.getVolume();
      if (volume !== 0 && (previous.observed || volume !== previous.volume)) {
        saved = void 0;
        return;
      }
      const result = await attempt("restore music volume", () => previous.player.setVolume(previous.volume));
      if (result.ok) saved = void 0;
    }
    async function update() {
      const api = getApi();
      const ad = currentAdvertisement2(api);
      if (ad === void 0) return;
      if (!ad) {
        userOverride = false;
        await restore();
        return;
      }
      if (saved) {
        const volume2 = saved.player.getVolume();
        if (volume2 === 0) saved.observed = true;
        else if (saved.observed || volume2 !== saved.volume) {
          saved = void 0;
          userOverride = true;
        }
        return;
      }
      const player = api?.Player;
      if (userOverride || typeof player?.getVolume !== "function" || typeof player?.setVolume !== "function") return;
      const volume = player.getVolume();
      if (!Number.isFinite(volume) || volume <= 0 || volume > 1) return;
      await attempt("silence active ad", async () => {
        if (stopped || currentAdvertisement2(getApi())?.id !== ad.id) return;
        saved = { player, volume, observed: false };
        await player.setVolume(0);
        if (saved && player.getVolume() === 0) saved.observed = true;
        count++;
        if (currentAdvertisement2(getApi()) === null) await restore();
      });
    }
    function sync() {
      if (stopped) return Promise.resolve();
      if (running) {
        again = true;
        return running;
      }
      running = (async () => {
        do {
          again = false;
          await update();
        } while (again && !stopped);
      })().finally(() => {
        running = void 0;
      });
      return running;
    }
    async function dispose() {
      stopped = true;
      if (running) await running;
      await restore();
    }
    return { sync, dispose, count: () => count };
  }

  // src/active-ad.js
  function currentAdvertisement(api) {
    const native = api?.Platform?.PlayerAPI;
    let state;
    let item;
    try {
      state = typeof native?.getState === "function" ? native.getState() : api?.Player?.data;
      item = state?.item;
    } catch {
      return void 0;
    }
    if (!item) return state?.hasContext === false ? null : void 0;
    const metadata = item?.metadata;
    if (item.isPodcastAd === true || metadata?.is_podcast_advertisement === "true" || metadata?.is_podcast_advertisement === true) return null;
    if (item.type !== "ad" && !/^spotify:ad:[^:]+$/.test(item.uri ?? "") && metadata?.is_advertisement !== "true" && metadata?.is_advertisement !== true) return null;
    const id = [item.uid, item.id, metadata?.ad_id, item.uri].filter(Boolean).join("|");
    return id ? { id, native: typeof native?.skipToNext === "function" ? native : api?.Player?.origin } : void 0;
  }
  function createActiveAdRecovery(getApi, attempt, isActive, host) {
    const handled = /* @__PURE__ */ new Set();
    const pending = /* @__PURE__ */ new Map();
    let stopped = false;
    let skipped = 0;
    const silencer = createAdSilencer(getApi, currentAdvertisement, attempt);
    async function check() {
      if (stopped || !isActive()) return Promise.resolve();
      await silencer.sync();
      if (stopped || !isActive()) return;
      const ad = currentAdvertisement(getApi());
      if (!ad || typeof ad.native?.skipToNext !== "function") return Promise.resolve();
      if (pending.has(ad.id)) return pending.get(ad.id);
      if (handled.has(ad.id)) return Promise.resolve();
      handled.add(ad.id);
      if (handled.size > 32) handled.delete(handled.values().next().value);
      const request = attempt("already-playing ad", async () => {
        const current = currentAdvertisement(getApi());
        if (stopped || !isActive() || current?.id !== ad.id || current.native !== ad.native) return false;
        await current.native.skipToNext();
        for (let count = 0; count < 15; count++) {
          if (stopped || !isActive()) return false;
          const observed = currentAdvertisement(getApi());
          if (observed !== void 0 && observed?.id !== ad.id) return true;
          await new Promise((resolve) => host.setTimeout(resolve, 100));
        }
        throw Error("Spotify did not advance the active ad; it may be unskippable");
      }).then((result) => {
        if (result.ok && result.value === true) skipped++;
      }).finally(async () => {
        pending.delete(ad.id);
        if (!stopped && isActive()) await silencer.sync();
      });
      pending.set(ad.id, request);
      return request;
    }
    async function dispose() {
      stopped = true;
      await Promise.all([...pending.values()]);
      await silencer.dispose();
      handled.clear();
    }
    return { check, dispose, skipped: () => skipped, silenced: silencer.count };
  }

  // src/native-clients.js
  var SERVICES = {
    settings: /* @__PURE__ */ new Set(["spotify.ads.esperanto.proto.Settings", "spotify.ads.esperanto.settings.proto.Settings"]),
    slots: /* @__PURE__ */ new Set(["spotify.ads.esperanto.proto.Slots", "spotify.ads.esperanto.slots.proto.Slots"]),
    testing: /* @__PURE__ */ new Set(["spotify.ads.esperanto.proto.Testing", "spotify.ads.esperanto.testing.proto.Testing"])
  };
  function resolveNativeClients(host, transport) {
    if (typeof transport?.callSingle !== "function") return void 0;
    const queue = [host.rspackChunk, host.webpackChunkclient_web, host.rspackChunkclient_web].find((value) => Array.isArray(value));
    if (!queue) return void 0;
    let runtime;
    const chunk = [[/* @__PURE__ */ Symbol("AdBlockee native services")], {}, (value) => {
      runtime = value;
    }];
    queue.push(chunk);
    if (queue[queue.length - 1] === chunk) queue.pop();
    if (typeof runtime !== "function" || !runtime.m) return void 0;
    const found = {};
    for (const [id, factory] of Object.entries(runtime.m)) {
      const source = String(factory);
      if (!Object.values(SERVICES).some((ids) => [...ids].some((service) => source.includes(service)))) continue;
      const exports = runtime(id);
      for (const Client of Object.values(exports ?? {})) {
        if (typeof Client !== "function") continue;
        for (const [kind, ids] of Object.entries(SERVICES)) {
          if (!found[kind] && ids.has(Client.SERVICE_ID)) found[kind] = new Client(transport);
        }
      }
    }
    return Object.keys(found).length ? found : void 0;
  }
  function supportsNegativePlaytime(client, seconds) {
    const type = client?.constructor?.METHODS?.addPlaytime?.requestType;
    if (!type?.encode || !type?.decode || !type?.fromPartial) return false;
    try {
      const encoded = type.encode(type.fromPartial({ seconds })).finish();
      return Number(type.decode(encoded).seconds) === seconds;
    } catch {
      return false;
    }
  }

  // src/native-prevention.js
  var PLAYTIME_OFFSET = -1e11;
  var gateValue = (response) => response?.state?.ad_enabled?.value;
  var checked = (response) => {
    if (response?.status !== void 0 && response.status !== 0) throw Error(`native status ${response.status}`);
    return response;
  };
  function createNativePrevention(host, attempt, isActive) {
    let clients;
    let transport;
    let connector;
    let subscription;
    let originalGate;
    let gateRequest;
    let stopped = false;
    let playtimeDone = false;
    const configured = /* @__PURE__ */ new Set();
    const originals = /* @__PURE__ */ new Map();
    const waiting = /* @__PURE__ */ new Set();
    const state = { available: false, slotsConfigured: 0, slotDisableVerified: 0, scheduler: "waiting", playtime: "waiting" };
    const verifiedDisabled = /* @__PURE__ */ new Set();
    async function suppressScheduler() {
      if (stopped || !isActive() || !connector?.getAdState || !connector?.putState) return;
      if (gateRequest) return gateRequest;
      gateRequest = attempt("native ad scheduler", async () => {
        const before = gateValue(await connector.getAdState());
        if (before !== "true" && before !== "false") throw Error("ad_enabled state unavailable");
        originalGate ??= before;
        if (before !== "false" && !stopped && isActive()) checked(await connector.putState("ad_enabled", "false"));
        const after = gateValue(await connector.getAdState());
        if (after !== "false") throw Error("Spotify did not retain the scheduler override");
      }).then((result) => {
        state.scheduler = result.ok ? "suppressed" : "unavailable";
      }).finally(() => {
        gateRequest = void 0;
      });
      return gateRequest;
    }
    async function connect(current) {
      if (current === connector) return;
      subscription?.cancel?.();
      if (gateRequest) await gateRequest;
      connector = current;
      originalGate = void 0;
      if (typeof connector?.subscribeToState === "function") {
        const attached = await attempt("watch native ad scheduler", () => connector.subscribeToState((message) => {
          if (gateValue(message) === "true") suppressScheduler();
        }));
        if (attached.ok) subscription = attached.value;
      }
    }
    async function configureSlot(slot) {
      if (configured.has(slot) || stopped || !isActive() || !clients?.settings) return;
      const settings = clients.settings;
      const result = await attempt(`native prevention ${slot}`, async () => {
        const before = (await settings.getSlotSettings({ slotId: slot }))?.slotSettings?.find((s) => s.id === slot);
        if (!before) {
          waiting.add(slot);
          return;
        }
        waiting.delete(slot);
        if (!originals.has(slot)) originals.set(slot, { ...before });
        checked(await settings.updateAdServerEndpoint({ slotIds: [slot], url: BLOCKED_ENDPOINT }));
        if (stopped || !isActive()) return;
        checked(await settings.updateStreamTimeInterval({ slotId: slot, timeInterval: 0n }));
        checked(await settings.updateDisplayTimeInterval({ slotId: slot, timeInterval: 0n }));
        checked(await settings.updateSlotEnabled({ slotId: slot, enabled: false }));
        const after = (await settings.getSlotSettings({ slotId: slot }))?.slotSettings?.find((s) => s.id === slot);
        if (!after || BigInt(after.streamTimeInterval ?? -1) !== 0n || BigInt(after.displayTimeInterval ?? -1) !== 0n) {
          throw Error("Spotify did not retain the timing overrides");
        }
        if (after.enabled === false) verifiedDisabled.add(slot);
        else verifiedDisabled.delete(slot);
        if (!stopped && isActive()) configured.add(slot);
      });
      if (!result.ok) configured.delete(slot);
    }
    async function configure(platform, currentConnector, names) {
      if (stopped || !isActive()) return names;
      const product = platform.ProductStateAPI?.productStateApi || platform.UserAPI?._product_state_service || platform.UserAPI?._product_state;
      const currentTransport = product?.transport;
      if (currentTransport !== transport || !clients) {
        transport = currentTransport;
        const resolved = await attempt("native ad services", () => resolveNativeClients(host, transport));
        clients = resolved.ok ? resolved.value : void 0;
        configured.clear();
        verifiedDisabled.clear();
        waiting.clear();
        playtimeDone = false;
      }
      state.available = Boolean(clients?.settings);
      await connect(currentConnector);
      await suppressScheduler();
      let slots = [...names];
      if (clients?.slots?.getSlots) {
        const inventory = await attempt("native music slots", () => clients.slots.getSlots({}));
        if (inventory.ok) slots = [.../* @__PURE__ */ new Set([...slots, ...(inventory.value?.adSlots ?? []).map((s) => s.slotId ?? s.slot_id)])].filter((slot) => MUSIC_SLOTS.has(slot));
      }
      if (clients?.testing && !playtimeDone) {
        if (supportsNegativePlaytime(clients.testing, PLAYTIME_OFFSET)) {
          const result = await attempt("native ad playtime offset", () => clients.testing.addPlaytime({ seconds: PLAYTIME_OFFSET }));
          playtimeDone = result.ok;
          state.playtime = result.ok ? "requested" : "unavailable";
        } else {
          playtimeDone = true;
          state.playtime = "unsupported-unsigned";
        }
      } else if (!clients?.testing) state.playtime = "unavailable";
      await Promise.all(slots.map(configureSlot));
      state.slotsConfigured = configured.size;
      state.slotDisableVerified = verifiedDisabled.size;
      return slots;
    }
    function invalidate(slot) {
      configured.delete(slot);
    }
    async function dispose({ restore = true } = {}) {
      stopped = true;
      subscription?.cancel?.();
      if (gateRequest) await gateRequest;
      if (!restore) return;
      if (state.playtime === "requested" && clients?.testing?.addPlaytime) {
        await attempt("restore native ad playtime", () => clients.testing.addPlaytime({ seconds: -PLAYTIME_OFFSET }));
      }
      for (const [slot, previous] of originals) {
        await attempt(`restore native timing ${slot}`, async () => {
          if (previous.streamTimeInterval !== void 0) checked(await clients.settings.updateStreamTimeInterval({ slotId: slot, timeInterval: BigInt(previous.streamTimeInterval) }));
          checked(await clients.settings.updateDisplayTimeInterval({ slotId: slot, timeInterval: BigInt(previous.displayTimeInterval ?? 0) }));
          checked(await clients.settings.updateSlotEnabled({ slotId: slot, enabled: previous.enabled }));
        });
      }
      if (originalGate === "true" && connector?.getAdState && connector?.putState) {
        await attempt("restore native ad scheduler", async () => {
          if (gateValue(await connector.getAdState()) === "false") checked(await connector.putState("ad_enabled", originalGate));
        });
      }
    }
    return { configure, invalidate, dispose, status: () => ({ ...state, awaitingSlots: [...waiting] }) };
  }

  // src/controller.js
  var VERSION = "2.2.0";
  function createController(host) {
    let active = false;
    let running = null;
    let refreshNeeded = false;
    let poll;
    let heartbeat;
    let adPoll;
    let menu;
    let player;
    let nativeEvents;
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
    const status = () => ({ ...state, nativePrevention: prevention.status(), intercepted: guard?.intercepted() ?? 0, activeAdSkips: recovery.skipped(), silencedBreaks: recovery.silenced(), errors: [...state.errors], appliedManagers: [...state.appliedManagers] });
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
    const recovery = createActiveAdRecovery(() => host.Spicetify, attempt, () => active, host);
    const prevention = createNativePrevention(host, attempt, () => active);
    function onSongChange() {
      refresh().then(() => recovery.check()).catch((error) => issue("active ad detection", error));
    }
    function onPlayerUpdate() {
      recovery.check().catch((error) => issue("active ad detection", error));
    }
    function showStatus() {
      const root = host.document.createElement("div");
      const summary = host.document.createElement("p");
      summary.textContent = `AdBlockee ${VERSION} \xB7 Sponsor UI: ${state.cosmetic ? "active" : "waiting"} \xB7 Audio controls: ${state.audio}`;
      root.append(summary);
      const details = host.document.createElement("p");
      details.textContent = `${state.slotCount} music ad slots monitored. ${guard?.intercepted() ?? 0} ad slot interceptions, ${recovery.skipped()} active ads advanced and ${recovery.silenced()} ad breaks silenced this session. ${state.errors.length ? "Some controls need attention; see console warnings." : "No compatibility errors reported."}`;
      root.append(details);
      const native = prevention.status();
      const preventionDetails = host.document.createElement("p");
      preventionDetails.textContent = `Native prevention: ${native.slotsConfigured} music slots configured; ad scheduler ${native.scheduler}. ${native.slotDisableVerified} slot-disable settings confirmed by readback.`;
      root.append(preventionDetails);
      const link = host.document.createElement("a");
      link.textContent = "Project, updates and bug reports";
      link.href = "https://github.com/LennonAmos/AdBlockee-Spicetify";
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      root.append(link);
      host.Spicetify?.PopupModal?.display?.({ title: "AdBlockee", content: root });
    }
    function connectPlayer(api) {
      const currentEvents = api.Platform?.PlayerAPI?.getEvents?.();
      if (currentEvents !== nativeEvents) {
        nativeEvents?.removeListener?.("update", onPlayerUpdate);
        nativeEvents = currentEvents;
        nativeEvents?.addListener?.("update", onPlayerUpdate);
      }
      if (api.Player?.addEventListener && player !== api.Player) {
        player?.removeEventListener?.("songchange", onSongChange);
        player = api.Player;
        player.addEventListener("songchange", onSongChange);
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
        guard = connector ? createSlotGuard(connector, attempt, () => active, (slot) => {
          prevention.invalidate(slot);
          overrideOwner = void 0;
          if (running) refreshNeeded = true;
          refresh();
        }) : void 0;
      }
      if (connector?.clearSlot && guard) {
        if (!slotNames.length && typeof managers.config?.getAdsSlotConfig === "function") {
          const config = await attempt("music ad configuration", () => managers.config.getAdsSlotConfig());
          if (config.ok && config.value && typeof config.value === "object") {
            slotNames = Object.keys(config.value).filter((name) => MUSIC_SLOTS.has(name));
          }
        }
        if (!active) return;
        slotNames = await prevention.configure(platform, connector, slotNames);
        if (!active) return;
        await Promise.all(slotNames.map((slot) => guard.watch(slot)));
        state.slotCount = guard.count();
      }
      await recovery.check();
      state.lastCheck = (/* @__PURE__ */ new Date()).toISOString();
    }
    function refresh() {
      if (!active) return Promise.resolve(status());
      if (running) return running.then(status);
      running = protect().catch((error) => issue("refresh", error)).finally(() => {
        running = null;
        if (active && refreshNeeded) {
          refreshNeeded = false;
          refresh();
        }
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
      adPoll = host.setInterval(onPlayerUpdate, 500);
      return refresh();
    }
    function onVisible() {
      if (host.document.visibilityState === "visible") refresh();
    }
    async function dispose({ restore = true } = {}) {
      active = false;
      host.clearInterval(poll);
      host.clearInterval(heartbeat);
      host.clearInterval(adPoll);
      host.document.removeEventListener("visibilitychange", onVisible);
      player?.removeEventListener?.("songchange", onSongChange);
      nativeEvents?.removeListener?.("update", onPlayerUpdate);
      menu?.deregister?.();
      removeCosmetics(host.document);
      if (running) await running;
      await guard?.dispose();
      await prevention.dispose({ restore });
      await recovery.dispose();
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
