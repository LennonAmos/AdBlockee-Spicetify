import assert from "node:assert/strict";
import { test } from "node:test";
import { hideLimitedAdHeaders, hideLimitedAdTitles, installCosmetics, removeCosmetics } from "../src/cosmetics.js";

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
  assert.ok(css.includes(".pI3vFQ1NXHe8F9lF4XpW"));
  assert.ok(css.includes(".QtDUlqVXUrdVbmLeSFjY"));
  assert.ok(css.includes(".nP8TsxXGm585u0n2AD_g"));
  assert.ok(css.includes('button[aria-label="Limited ads. More information"]'));
  assert.equal(css.includes("span:has(> button"), false);
  removeCosmetics(document);
  assert.equal(document.nodes.size, 0);
});

function textNode(value) {
  return { nodeType: 3, textContent: value };
}

function element(tag, attributes = {}, children = []) {
  const node = {
    nodeType: 1,
    tagName: tag.toUpperCase(),
    attributes: { ...attributes },
    childNodes: [],
    parentElement: null,
    style: {
      props: {},
      setProperty(name, value) { this.props[name] = value; },
      removeProperty(name) { delete this.props[name]; },
    },
    get childElementCount() {
      return this.childNodes.filter(child => child.nodeType === 1).length;
    },
    get textContent() {
      return this.childNodes.map(child => child.textContent).join("");
    },
    get nextElementSibling() {
      const siblings = this.parentElement?.childNodes.filter(child => child.nodeType === 1) || [];
      return siblings[siblings.indexOf(this) + 1] || null;
    },
    get previousElementSibling() {
      const siblings = this.parentElement?.childNodes.filter(child => child.nodeType === 1) || [];
      return siblings[siblings.indexOf(this) - 1] || null;
    },
    get previousSibling() {
      const siblings = this.parentElement?.childNodes || [];
      return siblings[siblings.indexOf(this) - 1] || null;
    },
    getAttribute(name) { return Object.hasOwn(this.attributes, name) ? this.attributes[name] : null; },
    setAttribute(name, value) { this.attributes[name] = value; },
    removeAttribute(name) { delete this.attributes[name]; },
    closest(selector) {
      let current = this;
      while (current) {
        if (current.matches?.(selector)) return current;
        current = current.parentElement;
      }
      return null;
    },
    matches(selector) {
      return selector.split(",").some(part => {
        const match = part.trim().match(/^\[data-encore-id="([^"]+)"\]$/);
        return match ? this.getAttribute("data-encore-id") === match[1] : false;
      });
    },
    querySelectorAll(selector) {
      const found = [];
      for (const child of this.childNodes) {
        if (child.nodeType !== 1) continue;
        if (selector === "span" && child.tagName === "SPAN") found.push(child);
        if (selector === "button" && child.tagName === "BUTTON") found.push(child);
        if (selector !== "span" && selector !== "button" && child.matches(selector)) found.push(child);
        found.push(...child.querySelectorAll(selector));
      }
      return found;
    },
  };
  for (const child of children) {
    child.parentElement = node;
    node.childNodes.push(child);
  }
  return node;
}

test("removes Limited ads titles from search rows and playlist cards only", () => {
  const description = element("div", {}, [textNode("Your weekly mix")]);
  const label = element("span", {}, [element("span", {}, [textNode("Limited ads")])]);
  const card = element("div", { "data-encore-id": "cardSubtitle" }, [description, label]);
  const search = element("p", { "data-encore-id": "listRowSubtitle" }, [
    element("span", {}, [textNode("Playlist")]),
    textNode(" • "),
    element("span", {}, [element("span", {}, [textNode("Limited ads")])]),
  ]);
  const song = element("div", { "data-encore-id": "cardTitle" }, [element("span", {}, [textNode("Limited ads")])]);
  const root = element("div", {}, [card, search, song]);

  assert.equal(hideLimitedAdTitles(root, "Limited ads"), 2);
  assert.equal(label.style.props.display, "none");
  assert.equal(description.style.props.display, undefined);
  assert.equal(description.textContent, "Your weekly mix");
  assert.equal(search.childNodes[1].textContent, "");
  assert.equal(search.childNodes[0].getAttribute("data-adblockee-hidden"), "limited-separator");
  assert.equal(song.querySelectorAll("span")[0].style.props.display, undefined);
  assert.equal(hideLimitedAdTitles(root, "Limited ads"), 0);
});

test("removes the playlist header Limited ads row and the dot after it", () => {
  const title = element("span", {}, [textNode("Limited ads")]);
  const button = element("button", { "aria-label": "Limited ads. More information" });
  const cluster = element("span", {}, [title, button]);
  const bullet = element("span", {}, [textNode(" • ")]);
  const presented = element("span", {}, [textNode("Presented by Example")]);
  const header = element("div", {}, [cluster, bullet, presented]);

  assert.equal(hideLimitedAdHeaders(header, "Limited ads", "Limited ads. More information"), 1);
  assert.equal(cluster.style.props.display, "none");
  assert.equal(bullet.style.props.display, "none");
  assert.equal(presented.style.props.display, undefined);
  assert.equal(presented.textContent, "Presented by Example");
});
