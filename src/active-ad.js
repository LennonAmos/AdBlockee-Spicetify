import { createAdSilencer } from "./ad-silencer.js";

export function currentAdvertisement(api) {
  const native = api?.Platform?.PlayerAPI;
  let state;
  let item;
  try {
    state = typeof native?.getState === "function" ? native.getState() : api?.Player?.data;
    item = state?.item;
  }
  catch { return undefined; }
  if (!item) return state?.hasContext === false ? null : undefined;
  const metadata = item?.metadata;
  // The native player also exposes type="ad" when the older metadata flag is
  // absent. Neither titles nor disabled controls are evidence of an advert.
  if (item.isPodcastAd === true || metadata?.is_podcast_advertisement === "true" || metadata?.is_podcast_advertisement === true) return null;
  if (item.type !== "ad" && !/^spotify:ad:[^:]+$/.test(item.uri ?? "")
    && metadata?.is_advertisement !== "true" && metadata?.is_advertisement !== true) return null;
  const id = [item.uid, item.id, metadata?.ad_id, item.uri].filter(Boolean).join("|");
  return id ? { id, native: typeof native?.skipToNext === "function" ? native : api?.Player?.origin } : undefined;
}

export function createActiveAdRecovery(getApi, attempt, isActive, host) {
  const handled = new Set();
  const pending = new Map();
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
      // The ad can finish while startup/API work is queued. Recheck at the
      // moment of dispatch so the following song cannot be skipped by us.
      const current = currentAdvertisement(getApi());
      if (stopped || !isActive() || current?.id !== ad.id || current.native !== ad.native) return false;
      await current.native.skipToNext();
      // A fulfilled command is not proof of a skip: a native hook can decline
      // it silently. Confirm the identified ad actually leaves the player.
      for (let count = 0; count < 15; count++) {
        if (stopped || !isActive()) return false;
        const observed = currentAdvertisement(getApi());
        if (observed !== undefined && observed?.id !== ad.id) return true;
        await new Promise(resolve => host.setTimeout(resolve, 100));
      }
      throw Error("Spotify did not advance the active ad; it may be unskippable");
    }).then(result => { if (result.ok && result.value === true) skipped++; })
      .finally(async () => {
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
