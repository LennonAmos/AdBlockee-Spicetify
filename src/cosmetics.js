const STYLE_ID = "adblockee-ui";
const SWEEP_KEY = "__adblockeeLimitedTitles";
const HIDDEN = "data-adblockee-hidden";
// Card subtitles, search rows and recents all place the label in one of these.
const SUBTITLE_SCOPE = '[data-encore-id="cardSubtitle"], [data-encore-id="listRowSubtitle"], [data-encore-id="listRowDetails"]';

function localeText(api, key, fallback) {
  try {
    const text = api?.Locale?.get?.(key);
    return typeof text === "string" && text !== key ? text : fallback;
  } catch {
    return fallback;
  }
}

function classNameOf(node) {
  return String(node?.className || node?.getAttribute?.("class") || "");
}

function conceal(target) {
  if (!target || target.getAttribute?.(HIDDEN) === "limited-title") return false;
  const previous = target.previousSibling;
  // Search and recents insert the dot as a text node before the label.
  if (previous?.nodeType === 3 && /^[\s•·]*•[\s•·]*$/.test(previous.textContent || "")) previous.textContent = "";
  target.setAttribute?.(HIDDEN, "limited-title");
  target.style?.setProperty?.("display", "none", "important");
  clearTrailingSeparator(target);
  return true;
}

// The subtitle draws its dot with ::after on the item before this label.
// Remove that dot only. The playlist name and the owner before it stay.
function clearTrailingSeparator(target) {
  let node = target;
  for (let depth = 0; depth < 4 && node?.parentElement; depth += 1) {
    const parent = node.parentElement;
    const atRow = parent.matches?.(SUBTITLE_SCOPE) || classNameOf(parent).includes("line-clamp");
    if (!atRow) {
      node = parent;
      continue;
    }
    let previous = node.previousElementSibling;
    while (previous && !(previous.textContent || "").trim()) previous = previous.previousElementSibling;
    if (previous && previous.getAttribute?.(HIDDEN) !== "limited-title") previous.setAttribute(HIDDEN, "limited-separator");
    return;
  }
}

// The yellow title is its own element. Its wrapper's only text is that title,
// so hiding the wrapper removes the chip without touching the playlist name
// or description beside it.
function hideTitleSpan(node, title) {
  if (!node || node.nodeType !== 1 || node.tagName !== "SPAN") return false;
  if (node.childElementCount !== 0 || node.textContent !== title) return false;
  if (typeof node.closest !== "function" || !node.closest(SUBTITLE_SCOPE)) return false;
  const scope = node.closest(SUBTITLE_SCOPE);
  const chip = node.parentElement;
  const target = chip && chip !== scope && chip.childElementCount === 1 && chip.textContent === title ? chip : node;
  return conceal(target);
}

export function hideLimitedAdTitles(root, title) {
  if (!title || typeof root?.querySelectorAll !== "function") return 0;
  let hidden = 0;
  if (hideTitleSpan(root, title)) hidden += 1;
  for (const node of root.querySelectorAll("span")) {
    if (hideTitleSpan(node, title)) hidden += 1;
  }
  return hidden;
}

// Playlist header: the title sits in a span with the info button. Hide that
// span only, then the dot that follows it. Do not hide a larger ancestor.
export function hideLimitedAdHeaders(root, title, moreLabel) {
  if (!title || !moreLabel || typeof root?.querySelectorAll !== "function") return 0;
  const buttons = [];
  if (root.nodeType === 1 && root.tagName === "BUTTON" && root.getAttribute?.("aria-label") === moreLabel) buttons.push(root);
  for (const button of root.querySelectorAll("button")) {
    if (button.getAttribute("aria-label") === moreLabel) buttons.push(button);
  }
  let hidden = 0;
  for (const button of buttons) {
    let node = button;
    for (let depth = 0; depth < 5 && node; depth += 1) {
      node = node.parentElement;
      if (node?.tagName !== "SPAN" || node.textContent.trim() !== title) continue;
      if (conceal(node)) hidden += 1;
      const bullet = node.nextElementSibling;
      if (bullet?.tagName === "SPAN" && /^[\s•·]+$/.test(bullet.textContent || "")) conceal(bullet);
      break;
    }
  }
  return hidden;
}

function watchLimitedAdTitles(document, title, moreLabel) {
  if (typeof document.querySelectorAll !== "function") return;
  let state = document[SWEEP_KEY];
  if (!state) {
    const Observer = document.defaultView?.MutationObserver;
    const root = document.body || document.documentElement;
    const observer = Observer && root ? new Observer(records => {
      const current = document[SWEEP_KEY];
      if (!current?.title) return;
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (node.nodeType !== 1) continue;
          hideLimitedAdTitles(node, current.title);
          hideLimitedAdHeaders(node, current.title, current.moreLabel);
        }
      }
    }) : null;
    observer?.observe(root, { childList: true, subtree: true });
    state = { observer };
    document[SWEEP_KEY] = state;
  }
  state.title = title;
  state.moreLabel = moreLabel;
  hideLimitedAdTitles(document, title);
  hideLimitedAdHeaders(document, title, moreLabel);
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
    /* Spotify 1.3.8.620 draws the "Limited ads" title as its own text node.
       The first class is that title on search rows, playlist cards, recents
       and the playlist header. The second is the card and search chip.
       The third is the header row that holds the title and its info button.
       The following span is only the dot before "Presented by". */
    .pI3vFQ1NXHe8F9lF4XpW,
    .QtDUlqVXUrdVbmLeSFjY,
    .nP8TsxXGm585u0n2AD_g,
    .nP8TsxXGm585u0n2AD_g + span,
    button[aria-label=${limited}],
    button[aria-label="Limited ads. More information"] {
      display: none !important;
    }
    [data-adblockee-hidden="limited-separator"]::after {
      content: none !important;
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
  watchLimitedAdTitles(
    document,
    localeText(api, "ad-formats.sponsored-playlist.header.reward-title", "Limited ads"),
    localeText(api, "ad-formats.limited-ads-more-info", "Limited ads. More information"),
  );
  return true;
}

export function removeCosmetics(document) {
  document.getElementById(STYLE_ID)?.remove();
  const state = document[SWEEP_KEY];
  state?.observer?.disconnect();
  if (state) delete document[SWEEP_KEY];
  if (typeof document.querySelectorAll !== "function") return;
  for (const node of document.querySelectorAll(`[${HIDDEN}]`)) {
    const marker = node.getAttribute(HIDDEN);
    if (marker !== "limited-title" && marker !== "limited-separator") continue;
    node.removeAttribute(HIDDEN);
    node.style?.removeProperty?.("display");
  }
}
