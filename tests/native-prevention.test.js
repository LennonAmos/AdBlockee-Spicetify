import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveNativeClients, supportsNegativePlaytime } from "../src/native-clients.js";
import { createNativePrevention } from "../src/native-prevention.js";

function fixture({ signed = false, ignoreDisable = true, failSlot, ignoreTiming = false } = {}) {
  const calls = [];
  const errors = [];
  const required = [];
  let gate = "true";
  let callback;
  const data = new Map(["stream", "preroll", "podcast-midroll-1"].map(id => [id, {
    id, enabled: true, streamTimeInterval: 840000n, displayTimeInterval: 120000n,
  }]));
  class Settings {
    static SERVICE_ID = "spotify.ads.esperanto.proto.Settings";
    constructor(transport) { this.transport = transport; }
    async getSlotSettings({ slotId }) { return { slotSettings: data.has(slotId) ? [{ ...data.get(slotId) }] : [] }; }
    async updateAdServerEndpoint(request) { calls.push(["endpoint", request]); return { status: 0 }; }
    async updateStreamTimeInterval(request) {
      calls.push(["stream", request]);
      if (request.slotId === failSlot) throw Error("settings temporarily unavailable");
      if (!ignoreTiming) data.get(request.slotId).streamTimeInterval = request.timeInterval;
      return { status: 0 };
    }
    async updateDisplayTimeInterval(request) {
      calls.push(["display", request]);
      if (!ignoreTiming) data.get(request.slotId).displayTimeInterval = request.timeInterval;
      return { status: 0 };
    }
    async updateSlotEnabled(request) {
      calls.push(["enabled", request]);
      if (!ignoreDisable) data.get(request.slotId).enabled = request.enabled;
      return { status: 0 };
    }
  }
  class Slots {
    static SERVICE_ID = "spotify.ads.esperanto.proto.Slots";
    async getSlots() { return { adSlots: [...data.keys()].map(slotId => ({ slotId })) }; }
  }
  const codec = {
    fromPartial: value => value,
    encode: value => ({ finish: () => ({ seconds: signed ? value.seconds : value.seconds >>> 0 }) }),
    decode: value => value,
  };
  class Testing {
    static SERVICE_ID = "spotify.ads.esperanto.proto.Testing";
    static METHODS = { addPlaytime: { requestType: codec } };
    async addPlaytime(request) { calls.push(["playtime", request]); return {}; }
  }
  function runtime(id) {
    required.push(id);
    if (id !== "protocol") throw Error("An unrelated module was executed");
    return { Settings, Slots, Testing };
  }
  runtime.m = {
    protocol: function generatedAdServices() { return "spotify.ads.esperanto.proto.Settings"; },
    unrelated: function appModule() { throw Error("must not execute"); },
  };
  const queue = [];
  queue.push = chunk => { Array.prototype.push.call(queue, chunk); chunk[2](runtime); };
  const transport = { callSingle() {} };
  const host = { rspackChunk: queue };
  const platform = { UserAPI: { _product_state_service: { transport } } };
  const connector = {
    async getAdState() { return { state: { ad_enabled: { value: gate } } }; },
    async putState(key, value) { calls.push(["gate", { key, value }]); gate = value; callback?.({ state: { ad_enabled: { value } } }); return { status: 0 }; },
    subscribeToState(fn) { callback = fn; return { cancel() { callback = undefined; } }; },
  };
  const attempt = async (label, action) => {
    try { return { ok: true, value: await action() }; }
    catch (error) { errors.push(`${label}: ${error.message}`); return { ok: false }; }
  };
  return { host, platform, connector, transport, calls, errors, required, data, attempt, Testing,
    get gate() { return gate; },
    externalGate(value) { gate = value; callback?.({ state: { ad_enabled: { value } } }); },
    get subscribed() { return Boolean(callback); },
  };
}

test("native service discovery executes only the generated ad protocol module", () => {
  const f = fixture();
  const clients = resolveNativeClients(f.host, f.transport);
  assert.equal(typeof clients.settings.updateSlotEnabled, "function");
  assert.deepEqual(f.required, ["protocol"]);
  assert.equal(f.host.rspackChunk.length, 0);
});

test("an unsigned playtime protocol rejects the older negative-counter workaround", () => {
  const f = fixture();
  assert.equal(supportsNegativePlaytime(new f.Testing(), -100000000000), false);
});

test("native prevention applies request, timing and enabled controls to music slots only", async () => {
  const f = fixture();
  const prevention = createNativePrevention(f.host, f.attempt, () => true);
  const names = await prevention.configure(f.platform, f.connector, ["stream"]);
  assert.deepEqual(names, ["stream", "preroll"]);
  assert.equal(f.gate, "false");
  assert.equal(prevention.status().scheduler, "suppressed");
  assert.equal(prevention.status().slotsConfigured, 2);
  assert.equal(prevention.status().slotDisableVerified, 0);
  for (const slot of ["stream", "preroll"]) {
    assert.equal(f.data.get(slot).streamTimeInterval, 0n);
    assert.equal(f.data.get(slot).displayTimeInterval, 0n);
    assert.ok(f.calls.some(([kind, request]) => kind === "enabled" && request.slotId === slot && request.enabled === false));
    assert.ok(f.calls.some(([kind, request]) => kind === "endpoint" && request.slotIds.includes(slot) && request.url === "http://127.0.0.1:9/adblockee"));
  }
  assert.equal(f.data.get("podcast-midroll-1").streamTimeInterval, 840000n);
  assert.equal(prevention.status().playtime, "unsupported-unsigned");
  assert.ok(!f.calls.some(([kind]) => kind === "playtime"));
  await prevention.dispose();
});

test("acknowledged slot disabling is counted only when readback confirms false", async () => {
  const f = fixture({ ignoreDisable: false });
  const prevention = createNativePrevention(f.host, f.attempt, () => true);
  await prevention.configure(f.platform, f.connector, []);
  assert.equal(prevention.status().slotDisableVerified, 2);
  await prevention.dispose();
});

test("native scheduling changes are not reported configured if readback rejects the timings", async () => {
  const f = fixture({ ignoreTiming: true });
  const prevention = createNativePrevention(f.host, f.attempt, () => true);
  await prevention.configure(f.platform, f.connector, []);
  assert.equal(prevention.status().slotsConfigured, 0);
  assert.match(f.errors.join(" "), /did not retain the timing overrides/);
  await prevention.dispose();
});

test("signed clients can receive the playtime workaround once rather than on every refresh", async () => {
  const f = fixture({ signed: true });
  const prevention = createNativePrevention(f.host, f.attempt, () => true);
  await prevention.configure(f.platform, f.connector, []);
  const initial = f.calls.length;
  await prevention.configure(f.platform, f.connector, []);
  assert.equal(f.calls.length, initial);
  assert.deepEqual(f.calls.filter(([kind]) => kind === "playtime"), [["playtime", { seconds: -100000000000 }]]);
  assert.equal(prevention.status().playtime, "requested");
  await prevention.dispose();
  assert.deepEqual(f.calls.filter(([kind]) => kind === "playtime").at(-1), ["playtime", { seconds: 100000000000 }]);
});

test("an ad arrival invalidates only that slot's prevention settings", async () => {
  const f = fixture();
  const prevention = createNativePrevention(f.host, f.attempt, () => true);
  await prevention.configure(f.platform, f.connector, []);
  const initial = f.calls.length;
  prevention.invalidate("stream");
  await prevention.configure(f.platform, f.connector, []);
  assert.equal(f.calls.length, initial + 4);
  assert.ok(f.calls.slice(initial).every(([, request]) => request.slotId === "stream" || request.slotIds?.[0] === "stream"));
  await prevention.dispose();
});

test("a native scheduler reset is intercepted without feedback on our own false update", async () => {
  const f = fixture();
  const prevention = createNativePrevention(f.host, f.attempt, () => true);
  await prevention.configure(f.platform, f.connector, []);
  f.externalGate("true");
  await new Promise(setImmediate);
  assert.equal(f.gate, "false");
  assert.equal(f.calls.filter(([kind]) => kind === "gate").length, 2);
  await prevention.dispose();
});

test("a failed native music slot does not disable the other slot or scheduler protection", async () => {
  const f = fixture({ failSlot: "stream" });
  const prevention = createNativePrevention(f.host, f.attempt, () => true);
  await prevention.configure(f.platform, f.connector, []);
  assert.equal(prevention.status().slotsConfigured, 1);
  assert.equal(prevention.status().scheduler, "suppressed");
  assert.match(f.errors.join(" "), /settings temporarily unavailable/);
  await prevention.dispose();
});

test("disposal removes the scheduler subscription and restores readable original settings", async () => {
  const f = fixture({ ignoreDisable: false });
  const prevention = createNativePrevention(f.host, f.attempt, () => true);
  await prevention.configure(f.platform, f.connector, []);
  await prevention.dispose();
  assert.equal(f.subscribed, false);
  assert.equal(f.gate, "true");
  assert.equal(f.data.get("stream").streamTimeInterval, 840000n);
  assert.equal(f.data.get("stream").displayTimeInterval, 120000n);
  assert.equal(f.data.get("stream").enabled, true);
  f.externalGate("true");
  await new Promise(setImmediate);
  assert.equal(f.gate, "true");
});

test("missing generated services leave existing event-based protection usable", async () => {
  const f = fixture();
  delete f.host.rspackChunk;
  const prevention = createNativePrevention(f.host, f.attempt, () => true);
  const names = await prevention.configure(f.platform, f.connector, ["stream"]);
  assert.deepEqual(names, ["stream"]);
  assert.equal(prevention.status().available, false);
  assert.equal(f.gate, "false");
  assert.deepEqual(f.errors, []);
  await prevention.dispose();
});

test("a lazy native slot is pending until created, without breaking stream prevention", async () => {
  const f = fixture();
  const prevention = createNativePrevention(f.host, f.attempt, () => true);
  await prevention.configure(f.platform, f.connector, ["stream", "embedded-npv"]);
  assert.deepEqual(prevention.status().awaitingSlots, ["embedded-npv"]);
  assert.equal(prevention.status().slotsConfigured, 2);
  assert.deepEqual(f.errors, []);
  f.data.set("embedded-npv", { id: "embedded-npv", enabled: true, streamTimeInterval: 10000n, displayTimeInterval: 20000n });
  await prevention.configure(f.platform, f.connector, ["stream", "embedded-npv"]);
  assert.deepEqual(prevention.status().awaitingSlots, []);
  assert.equal(prevention.status().slotsConfigured, 3);
  assert.equal(f.data.get("embedded-npv").streamTimeInterval, 0n);
  await prevention.dispose();
});
