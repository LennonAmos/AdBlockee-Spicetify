import { installCosmetics, removeCosmetics } from "./cosmetics.js";
import { createSlotGuard } from "./slots.js";

const VERSION = "2.1.0";
const MUSIC_SLOTS = new Set([
  "stream", "preroll", "hpto", "leaderboard", "sponsored-playlist",
  "embedded-npv", "embedded-playlist", "embedded-playlist-leavebehind", "stream-user-actions", "music-see-all",
]);

export function createController(host) {
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
  const applied = new Map();
  let polls = 0;
  const state = {
    version: VERSION,
    cosmetic: false,
    audio: "waiting",
    slotCount: 0,
    appliedManagers: [],
    lastCheck: null,
    errors: [],
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
        new Promise((_, reject) => { timer = host.setTimeout(() => reject(Error("timed out")), 4000); }),
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
    summary.textContent = `AdBlockee ${VERSION} · Sponsor UI: ${state.cosmetic ? "active" : "waiting"} · Audio controls: ${state.audio}`;
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

    // Each operation is isolated: a removed manager cannot disable other protection.
    const tasks = [
      ["audio", managers.audio, "disable"],
      ["in-stream", managers.inStreamApi, "disable"],
      ["leaderboard", managers.leaderboard, "disableLeaderboard"],
      ["billboard", managers.billboard, "disable"],
      ["video takeover", managers.vto?.manager, "disable"],
      ["embedded card", managers.embeddedAd?.embeddedAdManager, "disable"],
      ["sponsored playlist", managers.sponsoredPlaylist, "disable"],
    ];
    const results = await Promise.all(tasks.map(async ([name, manager, method]) => {
      if (typeof manager?.[method] !== "function") return null;
      // Several disable methods reset internal state even when already disabled.
      // Avoid repeating that reset during every song/visibility/heartbeat event.
      if (applied.get(name) === manager && manager.enabled !== true) return name;
      const result = await attempt(name, () => manager[method]());
      if (result.ok) applied.set(name, manager);
      return result.ok ? name : null;
    }));
    if (!active) return;
    state.appliedManagers = results.filter(Boolean);
    state.audio = state.appliedManagers.includes("audio") ? "applied" : "unavailable";

    const product = platform.ProductStateAPI?.productStateApi
      || platform.UserAPI?._product_state_service || platform.UserAPI?._product_state;
    if (product !== overrideOwner && typeof product?.putOverridesValues === "function") {
      // Change the ad preference only; subscription/catalogue fields are untouched.
      const result = await attempt("ad preference", () => product.putOverridesValues({ pairs: { ads: "0" } }));
      if (result.ok) overrideOwner = product;
    }
    if (!active) return;

    const current = managers.inStreamApi?.adsCoreConnector || managers.audio?.inStreamApi?.adsCoreConnector;
    if (connector !== current) {
      await guard?.dispose();
      connector = current;
      slotNames = [];
      guard = connector ? createSlotGuard(connector, attempt, () => active) : undefined;
    }
    if (connector?.clearSlot && guard) {
      if (!slotNames.length && typeof managers.config?.getAdsSlotConfig === "function") {
        const config = await attempt("music ad configuration", () => managers.config.getAdsSlotConfig());
        if (config.ok && config.value && typeof config.value === "object") {
          slotNames = Object.keys(config.value).filter(name => MUSIC_SLOTS.has(name));
        }
      }
      if (!active) return;
      await Promise.all(slotNames.map(slot => guard.watch(slot)));
      state.slotCount = guard.count();
    }
    state.lastCheck = new Date().toISOString();
  }

  function refresh() {
    if (!active) return Promise.resolve(status());
    // A single in-flight refresh bounds work during rapid navigation/song changes.
    if (running) return running.then(status);
    running = protect().catch(error => issue("refresh", error)).finally(() => { running = null; });
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
    // A slow fallback also recovers from APIs becoming ready after startup.
    heartbeat = host.setInterval(refresh, 30000);
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
    // A pending initial request may have completed while disposal was waiting.
    if (restore && overrideOwner?.delOverridesValues) {
      try { await overrideOwner.delOverridesValues({ keys: ["ads"] }); }
      catch (error) { host.console.warn("AdBlockee: reload Spotify to restore its ad preference.", error); }
    }
  }

  return { version: VERSION, start, refresh, status, dispose };
}
