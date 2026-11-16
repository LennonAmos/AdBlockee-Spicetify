import assert from "node:assert/strict";
import { test } from "node:test";
import { createController } from "../src/controller.js";
import { installLeavebehindBlock, isLeavebehindAdsRequest } from "../src/leavebehinds.js";

test("recognises only the leavebehind ads endpoint", () => {
  assert.equal(isLeavebehindAdsRequest("https://spclient.wg.spotify.com/leavebehinds/ads"), true);
  assert.equal(isLeavebehindAdsRequest("https://spclient.wg.spotify.com/leavebehinds/mock/ads?market=US"), true);
  assert.equal(isLeavebehindAdsRequest("/leavebehinds/ads"), true);
  assert.equal(isLeavebehindAdsRequest(new Request("https://spclient.wg.spotify.com/leavebehinds/ads")), true);
  assert.equal(isLeavebehindAdsRequest("https://api.spotify.com/v1/me"), false);
  assert.equal(isLeavebehindAdsRequest("https://spclient.wg.spotify.com/leavebehinds/ads-extra"), false);
  assert.equal(isLeavebehindAdsRequest("https://example.com/not-leavebehinds/ads"), false);
  assert.equal(isLeavebehindAdsRequest(undefined), false);
});

test("short-circuits leavebehind fetches and restores the original function", async () => {
  const seen = [];
  const host = {
    Response,
    fetch: async (input) => {
      seen.push(String(input));
      return new Response("ok");
    },
  };
  const restore = installLeavebehindBlock(host);
  const blocked = await host.fetch("https://spclient.wg.spotify.com/leavebehinds/ads", { method: "POST" });
  assert.equal(seen.length, 0);
  assert.equal(blocked.status, 200);
  assert.deepEqual(await blocked.json(), { leavebehindAds: [] });
  const allowed = await host.fetch("https://api.spotify.com/v1/me");
  assert.equal(await allowed.text(), "ok");
  assert.deepEqual(seen, ["https://api.spotify.com/v1/me"]);
  installLeavebehindBlock(host);
  assert.equal(host.fetch.__adblockee, true);
  restore();
  await host.fetch("https://spclient.wg.spotify.com/leavebehinds/ads");
  assert.deepEqual(seen.at(-1), "https://spclient.wg.spotify.com/leavebehinds/ads");
});

test("the controller blocks leavebehinds only while it is active", async () => {
  const seen = [];
  const document = {
    head: { append() {} },
    visibilityState: "visible",
    getElementById: () => null,
    createElement: () => ({ textContent: "", append() {}, remove() {} }),
    addEventListener() {},
    removeEventListener() {},
  };
  const host = {
    document,
    Response,
    console: { warn() {} },
    setTimeout: () => 1,
    setInterval: () => 1,
    clearTimeout() {},
    clearInterval() {},
    fetch: async (input) => {
      seen.push(String(input));
      return new Response("ok");
    },
  };
  const controller = createController(host);
  await controller.start();
  await host.fetch("https://spclient.wg.spotify.com/leavebehinds/ads");
  assert.deepEqual(seen, []);
  await controller.dispose();
  await host.fetch("https://spclient.wg.spotify.com/leavebehinds/ads");
  assert.deepEqual(seen, ["https://spclient.wg.spotify.com/leavebehinds/ads"]);
});
