const STYLE_ID = "adblockee-ui";

function localeText(api, key, fallback) {
  try {
    const text = api?.Locale?.get?.(key);
    return typeof text === "string" && text !== key ? text : fallback;
  } catch {
    return fallback;
  }
}

export function installCosmetics(document, api) {
  if (!document.head) return false;
  // JSON string quoting also produces a quoted CSS string for these labels.
  const advertisement = JSON.stringify(localeText(api, "ad-formats.advertisement", "Advertisement"));
  const limited = JSON.stringify(localeText(api, "ad-formats.limited-ads-more-info", "Limited ads. More information"));
  const rules = `
    /* HomeNativeAdsShelf uses neither home-ad-card nor home-ads-container.
       Hide the entire shelf, including its heading and reserved layout space.
       These markers are independent of the recommendation's title/language. */
    main section.VgSsqvSSHowr6JjIJ6lF,
    main section[data-shelf-collapsable]:has(.nP8cc31SRmgpKK0rPWkN),
    main section:has([data-testid="sponsored-recommendation-modal-trigger"]),
    :is(
      [data-testid="scroll-card-ad"],
      [aria-label="npv-sponsorship-title"],
      [data-testid="home-ad-card"],
      [data-testid="home-ads-container"],
      [data-testid="billboard-minimized"],
      [data-testid="billboard-image-link"],
      [data-testid="hpto-parent-container"],
      [data-testid="html-hpto-container"],
      #leaderboard-ad-element,
      #view-billboard-ad,
      .main-leaderboardComponent-container,
      .sponsor-container,
      .DS0j8uh2_B2J1GeX8jS2,
      .bi41j5zJhoOgdH38v1Ma,
      .mFtiCBZ8CC7MoLGk_hyJ,
      /* Recent ads leavebehinds. The playlist request is separate from the
         embedded-playlist-leavebehind slot, so slot blocking leaves the card up.
         The wrapper covers Daily Mix, other playlists, episodes and see-all.
         The show container is the same card on a podcast page, not the episode list. */
      [data-testid="leavebehinds-wrapper"],
      [data-testid="show-leavebehinds-container"],
      /* Creative shells only. The audio-ad skip row and playlist artwork are not
         included, so an escaped break can still be skipped and the cover stays. */
      [data-testid="embedded-ad"],
      [data-testid="embedded-ad-html-display"],
      [data-testid="embedded-ad-html-creative"],
      [data-testid="embedded-ad-carousel"],
      [data-testid="ads-video-player-npv"],
      [data-testid="standalone-video-ad-player"],
      [data-testid="context-ad-logo"]
    ),
    section[aria-label=${advertisement}],
    span:has(> button[aria-label=${limited}]),
    span:has(> button[aria-label="Limited ads. More information"]) {
      display: none !important;
    }
    /* Spotify 1.3's extra-tall sponsored playlist variants only. */
    .bXvkHCNOXigrpicAqmgd:is(.dvBGYlxl9sz3NBGlFf2T, .a9rFTjlXXl3MN3yB6J2z),
    .main-entityHeader-container:is(.main-entityHeader-withSponsoredAdVideo, .main-entityHeader-withSponsoredAdVideoV3) {
      height: auto !important;
      min-height: 0 !important;
      max-height: none !important;
      transition: none !important;
    }
    div:has(> .main-leaderboardComponent-container) {
      display: none !important;
    }
  `;
  let style = document.getElementById(STYLE_ID);
  if (!style) {
    style = document.createElement("style");
    style.id = STYLE_ID;
    document.head.append(style);
  }
  if (style.textContent !== rules) style.textContent = rules;
  return true;
}

export function removeCosmetics(document) {
  document.getElementById(STYLE_ID)?.remove();
}
