import { resolveNativeClients, supportsNegativePlaytime } from "./native-clients.js";
import { BLOCKED_ENDPOINT, MUSIC_SLOTS } from "./slots.js";

const PLAYTIME_OFFSET = -100_000_000_000;
const gateValue = response => response?.state?.ad_enabled?.value;
const checked = response => {
  if (response?.status !== undefined && response.status !== 0) throw Error(`native status ${response.status}`);
  return response;
};

export function createNativePrevention(host, attempt, isActive) {
  let clients;
  let transport;
  let connector;
  let subscription;
  let originalGate;
  let gateRequest;
  let stopped = false;
  let playtimeDone = false;
  const configured = new Set();
  const originals = new Map();
  const waiting = new Set();
  const state = { available: false, slotsConfigured: 0, slotDisableVerified: 0, scheduler: "waiting", playtime: "waiting" };
  const verifiedDisabled = new Set();

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
    }).then(result => { state.scheduler = result.ok ? "suppressed" : "unavailable"; })
      .finally(() => { gateRequest = undefined; });
    return gateRequest;
  }

  async function connect(current) {
    if (current === connector) return;
    subscription?.cancel?.();
    if (gateRequest) await gateRequest;
    connector = current;
    originalGate = undefined;
    if (typeof connector?.subscribeToState === "function") {
      const attached = await attempt("watch native ad scheduler", () => connector.subscribeToState(message => {
        if (gateValue(message) === "true") suppressScheduler();
      }));
      if (attached.ok) subscription = attached.value;
    }
  }

  async function configureSlot(slot) {
    if (configured.has(slot) || stopped || !isActive() || !clients?.settings) return;
    const settings = clients.settings;
    const result = await attempt(`native prevention ${slot}`, async () => {
      const before = (await settings.getSlotSettings({ slotId: slot }))?.slotSettings?.find(s => s.id === slot);
      // Config can name a surface whose native slot has not been created yet.
      // Leave it pending and attach on a later refresh/arrival, without making
      // missing lazy UI surfaces look like failed stream-ad protection.
      if (!before) { waiting.add(slot); return; }
      waiting.delete(slot);
      if (!originals.has(slot)) originals.set(slot, { ...before });
      checked(await settings.updateAdServerEndpoint({ slotIds: [slot], url: BLOCKED_ENDPOINT }));
      if (stopped || !isActive()) return;
      checked(await settings.updateStreamTimeInterval({ slotId: slot, timeInterval: 0n }));
      checked(await settings.updateDisplayTimeInterval({ slotId: slot, timeInterval: 0n }));
      checked(await settings.updateSlotEnabled({ slotId: slot, enabled: false }));
      const after = (await settings.getSlotSettings({ slotId: slot }))?.slotSettings?.find(s => s.id === slot);
      if (!after || BigInt(after.streamTimeInterval ?? -1) !== 0n || BigInt(after.displayTimeInterval ?? -1) !== 0n) {
        throw Error("Spotify did not retain the timing overrides");
      }
      // Some builds acknowledge enabled:false while still reporting true.
      // Report that separately instead of calling an acknowledged write proof.
      if (after.enabled === false) verifiedDisabled.add(slot);
      else verifiedDisabled.delete(slot);
      if (!stopped && isActive()) configured.add(slot);
    });
    if (!result.ok) configured.delete(slot);
  }

  async function configure(platform, currentConnector, names) {
    if (stopped || !isActive()) return names;
    const product = platform.ProductStateAPI?.productStateApi
      || platform.UserAPI?._product_state_service || platform.UserAPI?._product_state;
    const currentTransport = product?.transport;
    if (currentTransport !== transport || !clients) {
      transport = currentTransport;
      const resolved = await attempt("native ad services", () => resolveNativeClients(host, transport));
      clients = resolved.ok ? resolved.value : undefined;
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
      if (inventory.ok) slots = [...new Set([...slots, ...(inventory.value?.adSlots ?? []).map(s => s.slotId ?? s.slot_id)])]
        .filter(slot => MUSIC_SLOTS.has(slot));
    }
    if (clients?.testing && !playtimeDone) {
      if (supportsNegativePlaytime(clients.testing, PLAYTIME_OFFSET)) {
        const result = await attempt("native ad playtime offset", () => clients.testing.addPlaytime({ seconds: PLAYTIME_OFFSET }));
        playtimeDone = result.ok;
        state.playtime = result.ok ? "requested" : "unavailable";
      } else {
        // New clients encode seconds as uint32. Sending the older negative
        // workaround would wrap into billions of POSITIVE seconds instead.
        playtimeDone = true;
        state.playtime = "unsupported-unsigned";
      }
    } else if (!clients?.testing) state.playtime = "unavailable";
    await Promise.all(slots.map(configureSlot));
    state.slotsConfigured = configured.size;
    state.slotDisableVerified = verifiedDisabled.size;
    return slots;
  }

  function invalidate(slot) { configured.delete(slot); }

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
        if (previous.streamTimeInterval !== undefined) checked(await clients.settings.updateStreamTimeInterval({ slotId: slot, timeInterval: BigInt(previous.streamTimeInterval) }));
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
