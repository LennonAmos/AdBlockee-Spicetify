// Some native ads cannot be skipped. Silence those while retaining the exact
// volume to restore when the player returns to music. Never toggle media mode.
export function createAdSilencer(getApi, currentAdvertisement, attempt) {
  let saved;
  let running;
  let again = false;
  let stopped = false;
  let userOverride = false;
  let count = 0;

  async function restore() {
    const previous = saved;
    if (!previous) return;
    // A nonzero volume means the user changed it while the ad was silenced.
    const volume = previous.player.getVolume();
    if (volume !== 0 && (previous.observed || volume !== previous.volume)) { saved = undefined; return; }
    // Spotify's volume setter returns before its cached value changes. Send
    // the restore even if that cache still shows the original volume, so a
    // queued mute cannot arrive afterwards and leave the next song silent.
    const result = await attempt("restore music volume", () => previous.player.setVolume(previous.volume));
    if (result.ok) saved = undefined;
  }

  async function update() {
    const api = getApi();
    const ad = currentAdvertisement(api);
    // Unknown native state can be a transition within a break. Wait for a
    // known item rather than briefly making an advert audible again.
    if (ad === undefined) return;
    if (!ad) {
      userOverride = false;
      await restore();
      return;
    }
    if (saved) {
      const volume = saved.player.getVolume();
      if (volume === 0) saved.observed = true;
      else if (saved.observed || volume !== saved.volume) {
        saved = undefined;
        userOverride = true;
      }
      return;
    }
    const player = api?.Player;
    if (userOverride || typeof player?.getVolume !== "function" || typeof player?.setVolume !== "function") return;
    const volume = player.getVolume();
    if (!Number.isFinite(volume) || volume <= 0 || volume > 1) return;
    await attempt("silence active ad", async () => {
      if (stopped || currentAdvertisement(getApi())?.id !== ad.id) return;
      saved = { player, volume, observed: false };
      await player.setVolume(0);
      if (saved && player.getVolume() === 0) saved.observed = true;
      count++;
      // A volume command can finish after the ad. Restore immediately then.
      if (currentAdvertisement(getApi()) === null) await restore();
    });
  }

  function sync() {
    if (stopped) return Promise.resolve();
    if (running) { again = true; return running; }
    running = (async () => {
      do {
        again = false;
        await update();
      } while (again && !stopped);
    })().finally(() => { running = undefined; });
    return running;
  }

  async function dispose() {
    stopped = true;
    if (running) await running;
    await restore();
  }

  return { sync, dispose, count: () => count };
}
