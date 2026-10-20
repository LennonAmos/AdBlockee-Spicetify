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
  const calls = { overrides: [], restores: [], disabled: [], slots: [], clear: [], warnings: [], menus: 0 };
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
    async enableSlot(slot, enabled) { calls.slots.push([slot, enabled]); },
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
    Platform: { AdManagers: managers, UserAPI: { _product_state_service: product } },
    Locale: { get: key => key },
    Player: {
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
  return { host, api, calls, nodes, events, listeners, timers, advance };
}

test("disables music ad controls without changing subscription/catalogue properties", async () => {
  const f = fixture();
  const controller = createController(f.host);
  const result = await controller.start();
  assert.equal(result.audio, "applied");
  assert.equal(result.cosmetic, true);
  assert.equal(result.slotCount, 2);
  assert.deepEqual(f.calls.overrides, [{ pairs: { ads: "0" } }]);
  assert.deepEqual(f.calls.slots, [["stream", false], ["embedded-playlist", false]]);
  assert.deepEqual(f.calls.clear, ["stream"]);
  assert.ok(f.calls.disabled.includes("leaderboard"));
  assert.equal(f.calls.menus, 1);
  await controller.dispose();
  assert.deepEqual(f.calls.restores, [{ keys: ["ads"] }]);
  assert.equal(f.nodes.size, 0);
  assert.equal(f.timers.size, 0);
  assert.equal(f.listeners.size, 0);
  assert.equal(f.events.size, 0);
  assert.equal(f.calls.menus, 0);
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
  assert.ok(results.every(result => result.version === "2.0.0"));
  assert.equal(f.calls.overrides.length, 1);
  assert.equal(f.nodes.size, 1);
  const snapshot = controller.status();
  snapshot.errors.push("external mutation");
  assert.equal(controller.status().errors.length, 0);
  await controller.dispose();
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
