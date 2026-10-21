function currentAdvertisement(api) {
  const native = api?.Platform?.PlayerAPI;
  let item;
  try { item = typeof native?.getState === "function" ? native.getState()?.item : api?.Player?.data?.item; }
  catch { return undefined; }
  if (!item) return undefined;
  const metadata = item?.metadata;
  // Use Spotify's explicit ad flag, never the title, artist or disabled controls.
  if (metadata?.is_advertisement !== "true" && metadata?.is_advertisement !== true) return null;
  const id = [item.uid, metadata.ad_id, item.uri].filter(Boolean).join("|");
  return id ? { id, native: typeof native?.skipToNext === "function" ? native : api?.Player?.origin } : undefined;
}

export function createActiveAdRecovery(getApi, attempt, isActive, host) {
  const handled = new Set();
  const pending = new Map();
  let stopped = false;
  let skipped = 0;

  function check() {
    if (stopped || !isActive()) return Promise.resolve();
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
      .finally(() => pending.delete(ad.id));
    pending.set(ad.id, request);
    return request;
  }

  async function dispose() {
    stopped = true;
    await Promise.all([...pending.values()]);
    handled.clear();
  }

  return { check, dispose, skipped: () => skipped };
}
