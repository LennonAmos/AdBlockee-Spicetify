// Native slot events let us act when an ad arrives, rather than interrupting
// the player on a timer. Never use enableSlot: it always enables the slot.
const BLOCKED_ENDPOINT = "http://127.0.0.1:9/adblockee";

export function hasAds(value) {
  const slot = value?.adSlot ?? value;
  return Boolean(slot?.hasActiveAd || slot?.hasAvailableAds || slot?.availableAds?.length);
}

export function createSlotGuard(connector, attempt, isActive) {
  const watched = new Map();
  const clearing = new Map();
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
      // An arrival means the old endpoint did not prevent this request. Spotify
      // may have reset it. Clear immediately; a slow endpoint override must
      // never delay interception or change the player's media preference.
      const cleared = attempt(`clear ${slot}`, () => connector.clearSlot(slot));
      if (refreshEndpoint) { entry.endpoint = false; await setEndpoint(slot, entry); }
      return cleared;
    })()
      .then(result => { if (result.ok) intercepted++; })
      .finally(() => clearing.delete(slot));
    clearing.set(slot, pending);
    return pending;
  }

  async function watch(slot) {
    if (stopped || !isActive()) return false;
    const existing = watched.get(slot);
    if (existing) { await setEndpoint(slot, existing); return existing.ready; }
    const entry = { subscription: null, ready: false, endpoint: false };
    watched.set(slot, entry);
    if (typeof connector.subscribeToSlot !== "function") {
      watched.delete(slot);
      return false;
    }
    const subscription = await attempt(`watch ${slot}`, () => connector.subscribeToSlot(slot, message => {
      const event = message?.adSlotEvent;
      // Native enum: AVAILABLE=0, PLAY=1, DISCARD=2. Clearing sends DISCARD;
      // ignoring it prevents a recursive clear loop and media-mode churn.
      if (event?.ad && (event.eventType === 0 || event.eventType === 1)) clear(slot, entry, true);
    }));
    if (subscription.ok) entry.subscription = subscription.value;
    if (stopped || !isActive()) {
      entry.subscription?.cancel?.();
      return false;
    }
    if (!subscription.ok) { watched.delete(slot); return false; }
    entry.ready = true;
    // This native API changes the ad request endpoint; unlike enableSlot it
    // does not enable anything. Port 9 fails locally; no blocking service runs.
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

  return { watch, dispose, count: () => [...watched.values()].filter(e => e.ready).length, intercepted: () => intercepted };
}
