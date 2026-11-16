import assert from "node:assert/strict";
import { test } from "node:test";
import { installCosmetics, removeCosmetics } from "../src/cosmetics.js";

function documentFixture() {
  const nodes = new Map();
  return {
    nodes,
    head: { append(node) { nodes.set(node.id, node); } },
    getElementById: id => nodes.get(id) ?? null,
    createElement: () => ({ id: "", textContent: "", append() {}, remove() { nodes.delete(this.id); } }),
  };
}

test("hides Recent ads leavebehinds and escaped creatives without hiding playback or artwork", () => {
  const document = documentFixture();
  assert.equal(installCosmetics(document, { Locale: { get: key => key } }), true);
  const css = document.nodes.get("adblockee-ui").textContent;
  for (const selector of [
    '[data-testid="leavebehinds-wrapper"]',
    '[data-testid="show-leavebehinds-container"]',
    '[data-testid="embedded-ad"]',
    '[data-testid="embedded-ad-html-display"]',
    '[data-testid="embedded-ad-html-creative"]',
    '[data-testid="embedded-ad-carousel"]',
    '[data-testid="ads-video-player-npv"]',
    '[data-testid="standalone-video-ad-player"]',
    '[data-testid="context-ad-logo"]',
    '[data-testid="home-ad-card"]',
    '[data-testid="sponsored-recommendation-modal-trigger"]',
  ]) assert.ok(css.includes(selector), selector);
  assert.equal(css.includes("ad-controls"), false);
  assert.equal(css.includes("sponsored-playlist-cover-art"), false);
  assert.equal(css.includes("sponsored-playlist-expand-video"), false);
  removeCosmetics(document);
  assert.equal(document.nodes.size, 0);
});
