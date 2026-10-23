import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { test } from "node:test";
import { createController } from "../src/controller.js";

function fixture({ missing = false, failAudio = false, failConfig = false, hangAudio = false } = {}) {
  let time = 0;
  let next = 0;
  const timers = new Map();
  const nodes = new Map();
  const events = new Map();
  const listeners = new Map();
  const nativeListeners = new Map();
  const nativeEvents = {
    addListener: (name, callback) => nativeListeners.set(name, callback),
    removeListener: (name, callback) => { if (nativeListeners.get(name) === callback) nativeListeners.delete(name); },
  };
  const calls = { overrides: [], restores: [], disabled: [], slots: [], endpoints: [], clear: [], skips: [], volumes: [], warnings: [], menus: 0, cancelled: 0 };
  const slotEvents = new Map();
  const body = { append(node) { nodes.set(node.id, node); } };
  const document = {
    head: body,
    visibilityState: "visible",
    getElementById: id => nodes.get(id),
    createElement: () => ({ textContent: "", append() {}, remove() { nodes.delete(this.id); } }),
    addEventListener: (name, callback) => events.set(name, callback),
    removeEventListener: (name, callback) => { if (events.get(name) === callback) events.delete(name); },
  };
  const manager = name => ({
    enabled: true,
    async disable() {
      calls.disabled.push(name);
      if (name === "audio" && failAudio) throw Error("audio API changed");
      if (name === "audio" && hangAudio) await new Promise(() => {});
      this.enabled = false;
    },
  });
  const connector = {
    // Match the native API: even passing false would ENABLE a slot.
    async enableSlot(slot) { calls.slots.push([slot, true]); },
    async updateAdServerEndpoint(slots, url) { calls.endpoints.push({ slots, url }); return { status: 0 }; },
    subscribeToSlot(slot, callback) { slotEvents.set(slot, callback); return { cancel() { calls.cancelled++; slotEvents.delete(slot); } }; },
    async getSlot(slot) { return { adSlot: { slotId: slot, hasActiveAd: false, availableAds: [] } }; },
    async clearSlot(slot) { calls.clear.push(slot); },
  };
  const product = {
    async putOverridesValues(request) { calls.overrides.push(request); },
    async delOverridesValues(request) { calls.restores.push(request); },
  };
  const managers = {
    audio: manager("audio"),
    inStreamApi: { ...manager("in-stream"), adsCoreConnector: connector },
    leaderboard: { async disableLeaderboard() { calls.disabled.push("leaderboard"); } },
    embeddedAd: { embeddedAdManager: manager("embedded") },
    config: { async getAdsSlotConfig() {
      if (failConfig) throw Error("configuration offline");
      return { stream: { linear: true }, "embedded-playlist": {}, "podcast-midroll-1": {}, "unknown-slot": {} };
    } },
  };
  const api = {
    Platform: { AdManagers: managers, UserAPI: { _product_state_service: product }, PlayerAPI: {
      state: { item: { uid: "song-1", uri: "spotify:track:ordinary", metadata: {} } },
      getState() { return this.state; },
      getEvents() { return nativeEvents; },
      async skipToNext() { calls.skips.push(this.state.item.uid); this.state = { item: { uid: "song-2", uri: "spotify:track:next", metadata: {} } }; },
    } },
    Locale: { get: key => key },
    Player: {
      volume: 0.7,
      getVolume() { return this.volume; },
      async setVolume(volume) { calls.volumes.push(volume); this.volume = volume; },
      addEventListener: (name, callback) => listeners.set(name, callback),
      removeEventListener: name => listeners.delete(name),
    },
    PopupModal: { display() {} },
    Menu: { Item: class {
      register() { calls.menus++; }
      deregister() { calls.menus--; }
    } },
  };
  const schedule = (callback, delay, interval) => { const id = ++next; timers.set(id, { callback, at: time + delay, interval }); return id; };
  const host = {
    document,
    Spicetify: missing ? undefined : api,
    console: { warn: (...args) => calls.warnings.push(args) },
    setTimeout: (callback, delay) => schedule(callback, delay, 0),
    setInterval: (callback, delay) => schedule(callback, delay, delay),
    clearTimeout: id => timers.delete(id),
    clearInterval: id => timers.delete(id),
  };
  async function advance(delta) {
    const target = time + delta;
    for (let count = 0; count < 2000; count++) {
      await new Promise(setImmediate);
      const item = [...timers.entries()].filter(([, timer]) => timer.at <= target).sort((a, b) => a[1].at - b[1].at)[0];
      if (!item) { time = target; return; }
      const [id, timer] = item;
      time = timer.at;
      if (timer.interval) timer.at += timer.interval;
      else timers.delete(id);
      timer.callback();
    }
    throw Error("Too many callbacks");
  }
  return { host, api, calls, nodes, events, listeners, nativeListeners, timers, advance, slotEvents, connector };
}

test("disables music ad controls without changing subscription/catalogue properties", async () => {
  const f = fixture();
  const controller = createController(f.host);
  const result = await controller.start();
  assert.equal(result.audio, "applied");
  assert.equal(result.cosmetic, true);
  assert.equal(result.slotCount, 2);
  assert.deepEqual(f.calls.overrides, [{ pairs: { ads: "0" } }]);
  assert.deepEqual(f.calls.slots, []);
  assert.deepEqual(f.calls.clear, []);
  assert.equal(f.calls.endpoints.length, 2);
  assert.ok(f.calls.endpoints.every(x => x.url === "http://127.0.0.1:9/adblockee"));
  assert.ok(f.calls.disabled.includes("leaderboard"));
  assert.equal(f.calls.menus, 1);
  await controller.dispose();
  assert.deepEqual(f.calls.restores, [{ keys: ["ads"] }]);
  assert.equal(f.nodes.size, 0);
  assert.equal(f.timers.size, 0);
  assert.equal(f.listeners.size, 0);
  assert.equal(f.nativeListeners.size, 0);
  assert.equal(f.events.size, 0);
  assert.equal(f.calls.menus, 0);
  assert.equal(f.slotEvents.size, 0);
});

test("starts cosmetic protection before Spicetify loads and recovers when APIs arrive", async () => {
  const f = fixture({ missing: true });
  const controller = createController(f.host);
  await controller.start();
  assert.equal(controller.status().cosmetic, true);
  assert.equal(f.calls.disabled.length, 0);
  f.host.Spicetify = f.api;
  await f.advance(500);
  assert.equal(controller.status().audio, "applied");
  await controller.dispose();
});

test("recovers after the short startup poll expires", async () => {
  const f = fixture({ missing: true });
  const controller = createController(f.host);
  await controller.start();
  await f.advance(31000);
  f.host.Spicetify = f.api;
  await f.advance(30000);
  assert.equal(controller.status().audio, "applied");
  await controller.dispose();
});

test("one failed audio manager does not break other ad controls or cosmetic protection", async () => {
  const f = fixture({ failAudio: true });
  const controller = createController(f.host);
  const result = await controller.start();
  assert.equal(result.audio, "unavailable");
  assert.equal(result.slotCount, 2);
  assert.equal(result.cosmetic, true);
  assert.ok(f.calls.disabled.includes("embedded"));
  assert.match(result.errors[0], /audio API changed/);
  await controller.dispose();
});

test("an unavailable ad-configuration service leaves other protection working", async () => {
  const f = fixture({ failConfig: true });
  const controller = createController(f.host);
  const result = await controller.start();
  assert.equal(result.audio, "applied");
  assert.equal(result.cosmetic, true);
  assert.equal(result.slotCount, 0);
  assert.match(result.errors[0], /configuration offline/);
  await controller.dispose();
});

test("an unresponsive manager times out instead of hanging startup and cleanup", async () => {
  const f = fixture({ hangAudio: true });
  const controller = createController(f.host);
  const started = controller.start();
  await f.advance(4001);
  const result = await started;
  assert.equal(result.audio, "unavailable");
  assert.equal(result.slotCount, 2);
  assert.equal(result.cosmetic, true);
  assert.match(result.errors[0], /timed out/);
  await controller.dispose();
  assert.equal(f.timers.size, 0);
});

test("rapid refresh requests share one operation instead of stacking API calls", async () => {
  const f = fixture();
  const controller = createController(f.host);
  const results = await Promise.all([controller.start(), controller.refresh(), controller.refresh()]);
  assert.ok(results.every(result => result.version === "2.1.3"));
  assert.equal(f.calls.overrides.length, 1);
  assert.equal(f.nodes.size, 1);
  const snapshot = controller.status();
  snapshot.errors.push("external mutation");
  assert.equal(controller.status().errors.length, 0);
  await controller.dispose();
});

test("song, visibility and heartbeat refreshes do not clear empty slots or rewrite product state", async () => {
  const f = fixture();
  const controller = createController(f.host);
  await controller.start();
  const initialDisables = f.calls.disabled.length;
  f.listeners.get("songchange")();
  f.events.get("visibilitychange")();
  await f.advance(60000);
  assert.deepEqual(f.calls.clear, []);
  assert.deepEqual(f.calls.slots, []);
  assert.equal(f.calls.overrides.length, 1);
  assert.equal(f.calls.endpoints.length, 2);
  assert.equal(f.calls.disabled.length, initialDisables);
  f.api.Platform.AdManagers.audio.enabled = true;
  await controller.refresh();
  assert.equal(f.calls.disabled.length, initialDisables + 1);
  await controller.dispose();
});

test("ad arrival is intercepted immediately, DISCARD and empty events do not loop", async () => {
  const f = fixture();
  const controller = createController(f.host);
  await controller.start();
  const event = f.slotEvents.get("stream");
  f.connector.clearSlot = async slot => {
    f.calls.clear.push(slot);
    event({ adSlotEvent: { eventType: 2, slotId: slot, ad: { adId: "test-ad" } } });
  };
  event({ adSlotEvent: { eventType: 0, slotId: "stream" } });
  assert.deepEqual(f.calls.clear, []);
  event({ adSlotEvent: { eventType: 0, slotId: "stream", ad: { adId: "test-ad" } } });
  event({ adSlotEvent: { eventType: 1, slotId: "stream", ad: { adId: "test-ad" } } });
  await f.advance(1);
  assert.deepEqual(f.calls.clear, ["stream"]);
  assert.equal(controller.status().intercepted, 1);
  await controller.dispose();
  event({ adSlotEvent: { eventType: 0, ad: { adId: "late-ad" } } });
  await f.advance(1);
  assert.deepEqual(f.calls.clear, ["stream"]);
});

test("already queued ads are cleared on attachment but ordinary playback stays untouched", async () => {
  const f = fixture();
  f.connector.getSlot = async slot => ({ adSlot: { hasActiveAd: slot === "stream", availableAds: [] } });
  const controller = createController(f.host);
  await controller.start();
  assert.deepEqual(f.calls.clear, ["stream"]);
  await controller.refresh();
  assert.deepEqual(f.calls.clear, ["stream"]);
  await controller.dispose();
});

test("a rejected endpoint override is retried without duplicating slot subscriptions", async () => {
  const f = fixture();
  let failed = true;
  f.connector.updateAdServerEndpoint = async () => ({ status: failed ? 2 : 0 });
  const controller = createController(f.host);
  const started = await controller.start();
  assert.ok(started.errors.some(e => e.includes("native status 2")));
  assert.equal(f.slotEvents.size, 2);
  failed = false;
  const recovered = await controller.refresh();
  assert.deepEqual(recovered.errors, []);
  assert.equal(f.slotEvents.size, 2);
  await controller.dispose();
  assert.equal(f.calls.cancelled, 2);
});

const playingAd = uid => ({ item: { uid, uri: `spotify:ad:${uid}`, metadata: { is_advertisement: "true", ad_id: uid } } });

test("a mid-ad installation advances the already-playing ad even when slot inventory is empty", async () => {
  const f = fixture();
  const native = f.api.Platform.PlayerAPI;
  native.state = playingAd("startup-ad");
  const controller = createController(f.host);
  await controller.start();
  assert.deepEqual(f.calls.skips, ["startup-ad"]);
  assert.equal(native.state.item.uid, "song-2");
  assert.equal(controller.status().activeAdSkips, 1);
  await controller.refresh();
  await f.advance(30000);
  assert.deepEqual(f.calls.skips, ["startup-ad"]);
  await controller.dispose();
});

test("ordinary tracks with advertising words in their metadata are never skipped", async () => {
  const f = fixture();
  const native = f.api.Platform.PlayerAPI;
  native.state.item.metadata = { title: "Advertisement", artist_name: "Sponsored", is_advertisement: "false" };
  const controller = createController(f.host);
  await controller.start();
  assert.deepEqual(f.calls.skips, []);
  assert.equal(native.state.item.uid, "song-1");
  await controller.dispose();
});

test("unknown native playback state never falls back to a stale ad in the wrapper", async () => {
  const f = fixture();
  f.api.Platform.PlayerAPI.state = null;
  f.api.Player.data = playingAd("stale-ad");
  const controller = createController(f.host);
  await controller.start();
  assert.deepEqual(f.calls.skips, []);
  assert.equal(controller.status().activeAdSkips, 0);
  await controller.dispose();
});

test("an ad finishing between detection and dispatch does not cause the following song to be skipped", async () => {
  const f = fixture();
  const native = f.api.Platform.PlayerAPI;
  native.state = playingAd("finishing-ad");
  let reads = 0;
  native.getState = function() {
    if (++reads === 2) this.state = { item: { uid: "following-song", uri: "spotify:track:following", metadata: {} } };
    return this.state;
  };
  const controller = createController(f.host);
  await controller.start();
  assert.deepEqual(f.calls.skips, []);
  assert.equal(native.state.item.uid, "following-song");
  await controller.dispose();
});

test("duplicate playback events and refreshes share one active-ad skip", async () => {
  const f = fixture();
  const native = f.api.Platform.PlayerAPI;
  native.state = playingAd("slow-ad");
  let release;
  native.skipToNext = async function() {
    f.calls.skips.push(this.state.item.uid);
    await new Promise(resolve => { release = resolve; });
    this.state = { item: { uid: "following-song", uri: "spotify:track:following", metadata: {} } };
  };
  const controller = createController(f.host);
  const started = controller.start();
  await new Promise(setImmediate);
  f.listeners.get("songchange")();
  const refreshed = controller.refresh();
  assert.deepEqual(f.calls.skips, ["slow-ad"]);
  release();
  await Promise.all([started, refreshed]);
  await f.advance(1);
  assert.deepEqual(f.calls.skips, ["slow-ad"]);
  assert.equal(native.state.item.uid, "following-song");
  await controller.dispose();
});

test("a silently rejected active-ad command reports failure and is never retried into the next song", async () => {
  const f = fixture();
  const native = f.api.Platform.PlayerAPI;
  native.state = playingAd("unskippable-ad");
  native.skipToNext = async function() { f.calls.skips.push(this.state.item.uid); };
  const controller = createController(f.host);
  const started = controller.start();
  await f.advance(1501);
  const result = await started;
  assert.match(result.errors.join(" "), /may be unskippable/);
  assert.equal(result.activeAdSkips, 0);
  await controller.refresh();
  assert.deepEqual(f.calls.skips, ["unskippable-ad"]);
  native.state = { item: { uid: "following-song", metadata: {} } };
  f.listeners.get("songchange")();
  await f.advance(1);
  assert.deepEqual(f.calls.skips, ["unskippable-ad"]);
  await controller.dispose();
  assert.equal(f.timers.size, 0);
});

test("native ad items without the legacy advertisement flag are silenced and recovered", async () => {
  const f = fixture();
  f.api.Platform.PlayerAPI.state = { item: { type: "ad", uid: "native-ad", id: "creative", metadata: {} } };
  const controller = createController(f.host);
  await controller.start();
  assert.deepEqual(f.calls.skips, ["native-ad"]);
  assert.deepEqual(f.calls.volumes, [0, 0.7]);
  assert.equal(controller.status().silencedBreaks, 1);
  await controller.dispose();
});

test("the native ad URI is sufficient even without a normalized type or metadata flag", async () => {
  const f = fixture();
  f.api.Platform.PlayerAPI.state = { item: { uid: "uri-ad", uri: "spotify:ad:creative" } };
  const controller = createController(f.host);
  await controller.start();
  assert.deepEqual(f.calls.skips, ["uri-ad"]);
  assert.deepEqual(f.calls.volumes, [0, 0.7]);
  await controller.dispose();
});

test("an unskippable ad stays silent and the following song regains the exact volume", async () => {
  const f = fixture();
  const native = f.api.Platform.PlayerAPI;
  const controller = createController(f.host);
  await controller.start();
  native.skipToNext = async function() { f.calls.skips.push(this.state.item.uid); throw Error("ad_disallow"); };
  native.state = playingAd("locked-ad");
  f.nativeListeners.get("update")();
  await f.advance(10);
  assert.equal(f.api.Player.volume, 0);
  await f.advance(2000);
  assert.deepEqual(f.calls.skips, ["locked-ad"]);
  native.state = { item: { type: "track", uid: "music", metadata: {} } };
  f.nativeListeners.get("update")();
  await f.advance(10);
  assert.equal(f.api.Player.volume, 0.7);
  assert.deepEqual(f.calls.volumes, [0, 0.7]);
  await controller.dispose();
});

test("the cached-state fallback detects an ad when neither playback event arrives", async () => {
  const f = fixture();
  const controller = createController(f.host);
  await controller.start();
  f.api.Platform.PlayerAPI.state = playingAd("missed-event");
  await f.advance(501);
  assert.deepEqual(f.calls.skips, ["missed-event"]);
  assert.deepEqual(f.calls.volumes, [0, 0.7]);
  await controller.dispose();
});

test("back-to-back unskippable ads and unknown transition state do not unmute the break", async () => {
  const f = fixture();
  const controller = createController(f.host);
  await controller.start();
  const native = f.api.Platform.PlayerAPI;
  native.skipToNext = async () => { throw Error("ad_disallow"); };
  native.state = playingAd("first-ad");
  await controller.refresh();
  native.state = null;
  await f.advance(501);
  native.state = playingAd("second-ad");
  await f.advance(501);
  assert.deepEqual(f.calls.volumes, [0]);
  native.state = { item: { type: "track", uid: "music", metadata: {} } };
  await f.advance(501);
  assert.deepEqual(f.calls.volumes, [0, 0.7]);
  await controller.dispose();
});

test("a user's volume change during a silenced break is retained", async () => {
  const f = fixture();
  const controller = createController(f.host);
  await controller.start();
  const native = f.api.Platform.PlayerAPI;
  native.skipToNext = async () => { throw Error("ad_disallow"); };
  native.state = playingAd("manual-volume");
  await controller.refresh();
  f.api.Player.volume = 0.3;
  await f.advance(1001);
  native.state = { item: { uid: "music", metadata: {} } };
  await f.advance(501);
  assert.deepEqual(f.calls.volumes, [0]);
  assert.equal(f.api.Player.volume, 0.3);
  await controller.dispose();
});

test("a volume already at zero is never raised when the advert ends", async () => {
  const f = fixture();
  f.api.Player.volume = 0;
  f.api.Platform.PlayerAPI.state = playingAd("already-muted");
  const controller = createController(f.host);
  await controller.start();
  assert.deepEqual(f.calls.volumes, []);
  await controller.dispose();
});

test("disabling the extension during a silenced ad restores volume and removes monitors", async () => {
  const f = fixture();
  f.api.Platform.PlayerAPI.state = playingAd("dispose-muted");
  f.api.Platform.PlayerAPI.skipToNext = async () => { throw Error("ad_disallow"); };
  const controller = createController(f.host);
  await controller.start();
  assert.equal(f.api.Player.volume, 0);
  await controller.dispose();
  assert.equal(f.api.Player.volume, 0.7);
  assert.equal(f.nativeListeners.size, 0);
  assert.equal(f.timers.size, 0);
});

test("delayed Spotify volume-cache updates cannot discard the pending restore", async () => {
  const f = fixture();
  f.api.Platform.PlayerAPI.state = playingAd("delayed-cache");
  // The native wrapper resolves before its volume cache updates. Keep that
  // cache stale here: restoration must still enqueue the original value.
  f.api.Player.setVolume = async volume => { f.calls.volumes.push(volume); };
  const controller = createController(f.host);
  await controller.start();
  assert.deepEqual(f.calls.volumes, [0, 0.7]);
  await controller.dispose();
});

test("stopping playback without a current item restores a silenced break", async () => {
  const f = fixture();
  f.api.Platform.PlayerAPI.state = playingAd("stopped-ad");
  f.api.Platform.PlayerAPI.skipToNext = async () => { throw Error("ad_disallow"); };
  const controller = createController(f.host);
  await controller.start();
  f.api.Platform.PlayerAPI.state = { hasContext: false, item: null };
  await f.advance(501);
  assert.deepEqual(f.calls.volumes, [0, 0.7]);
  await controller.dispose();
});

test("disposal while a mute is pending restores volume without dispatching a skip", async () => {
  const f = fixture();
  f.api.Platform.PlayerAPI.state = playingAd("pending-mute");
  let release;
  f.api.Player.setVolume = async function(volume) {
    f.calls.volumes.push(volume);
    if (volume === 0) await new Promise(resolve => { release = resolve; });
    this.volume = volume;
  };
  const controller = createController(f.host);
  const started = controller.start();
  await new Promise(setImmediate);
  const disposed = controller.dispose();
  release();
  await Promise.all([started, disposed]);
  assert.deepEqual(f.calls.volumes, [0, 0.7]);
  assert.deepEqual(f.calls.skips, []);
  assert.equal(f.api.Player.volume, 0.7);
  assert.equal(f.timers.size, 0);
});

test("a failed volume restore is retried while music plays", async () => {
  const f = fixture();
  f.api.Platform.PlayerAPI.state = playingAd("restore-retry");
  let failRestore = true;
  f.api.Player.setVolume = async function(volume) {
    f.calls.volumes.push(volume);
    if (volume !== 0 && failRestore) throw Error("volume temporarily unavailable");
    this.volume = volume;
  };
  const controller = createController(f.host);
  await controller.start();
  assert.equal(f.api.Player.volume, 0);
  failRestore = false;
  await f.advance(501);
  assert.equal(f.api.Player.volume, 0.7);
  await controller.dispose();
});

test("explicit podcast ads are left to podcast playback", async () => {
  const f = fixture();
  f.api.Platform.PlayerAPI.state = { item: { type: "ad", uid: "podcast-ad", isPodcastAd: true, metadata: { is_advertisement: "true" } } };
  const controller = createController(f.host);
  await controller.start();
  assert.deepEqual(f.calls.skips, []);
  assert.deepEqual(f.calls.volumes, []);
  await controller.dispose();
});

test("an arriving ad reapplies an endpoint reset without feedback on discard", async () => {
  const f = fixture();
  const controller = createController(f.host);
  await controller.start();
  const before = f.calls.endpoints.length;
  f.slotEvents.get("stream")({ adSlotEvent: { eventType: 0, ad: { adId: "reset-endpoint" } } });
  await f.advance(1);
  assert.equal(f.calls.endpoints.length, before + 1);
  assert.deepEqual(f.calls.clear, ["stream"]);
  await controller.dispose();
});

test("an endpoint override that stalls cannot delay clearing an arriving ad", async () => {
  const f = fixture();
  const controller = createController(f.host);
  await controller.start();
  f.connector.updateAdServerEndpoint = async () => new Promise(() => {});
  f.slotEvents.get("stream")({ adSlotEvent: { eventType: 0, ad: { adId: "slow-endpoint" } } });
  await f.advance(1);
  assert.deepEqual(f.calls.clear, ["stream"]);
  const disposed = controller.dispose();
  await f.advance(4001);
  await disposed;
  assert.equal(f.timers.size, 0);
});

test("the Marketplace manifest has one extension, valid resources and a square PNG preview", () => {
  const root = new URL("../", import.meta.url);
  const manifests = JSON.parse(readFileSync(new URL("manifest.json", root)));
  assert.equal(manifests.length, 1);
  const manifest = manifests[0];
  assert.equal(manifest.name, "AdBlockee");
  for (const key of ["main", "readme", "preview"]) assert.ok(existsSync(new URL(manifest[key], root)), key);
  const png = readFileSync(new URL(manifest.preview, root));
  assert.equal(png.subarray(1, 4).toString(), "PNG");
  assert.equal(png.readUInt32BE(16), png.readUInt32BE(20));
  assert.ok(png.readUInt32BE(16) >= 512);
  const bundle = readFileSync(new URL(manifest.main, root), "utf8");
  assert.match(bundle, /Copyright \(c\) 2026 LennonAmos/);
  assert.match(bundle, /Permission is hereby granted/);
  assert.doesNotMatch(bundle, /webpackChunk|rspackChunk|catalogue:|product: "premium"/);
});
