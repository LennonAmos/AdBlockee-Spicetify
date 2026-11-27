# Validation — 2.2.2

Limited ads titles, 27 November 2026:

- Spotify 1.3.8.620 renders the title `ad-formats.sponsored-playlist.header.reward-title` ("Limited ads") as its own text node, class `pI3vFQ1NXHe8F9lF4XpW`, inside chip `QtDUlqVXUrdVbmLeSFjY`. That chip is what search rows, home playlist cards and recents add. The playlist header uses the same title node inside `nP8TsxXGm585u0n2AD_g`, next to the info button. The old rule only matched a direct-child info button, so these titles stayed up.
- Loaded 2.2.2 into the running Linux client. On Home, Discover Weekly kept its description and the yellow title computed as `display: none`. Holiday Magic's "Playlist • Spotify" line stayed in the card and the title was hidden. In search, Discover Weekly read "Playlist • Spotify" with no trailing dot and no "Limited ads". The Holiday Magic playlist page header showed the playlist name, Spotify and the save count, with no Limited ads title. The open track was left playing and the view was returned to Liked Songs.
- 51 automated tests passed, including the new card, search-row and playlist-header cases. `npm run check` rebuilt `adblockee.js` and the syntax check passed.

# Validation — 2.2.1

Recent ads, 16 November 2026:

- Compared the reported Daily Mix card with the installed Linux client, Spotify 1.3.8.620. `playlist-leavebehinds.js` renders a section titled with `podcast-ads.recent_ads` ("Recent ads"), `data-testid="leavebehinds-wrapper"`, and a card containing the advertiser, tagline and Learn more button. That matches the screenshot on issue 1. The reporter's client is Windows Spotify 1.2.96.518; the markup above is from 1.3.8.620, so the Windows build was not opened.
- The section's data comes from POST `/leavebehinds/ads`, not from the `embedded-playlist-leavebehind` slot. Slot blocking therefore cannot remove it. 2.2.1 answers that request with an empty list when it goes through `window.fetch`, and hides the section with the test id. Show pages use `show-leavebehinds-container` for the same kind of card. Podcast slot ids are still excluded.
- Now-playing creatives `embedded-ad`, `ads-video-player-npv`, `standalone-video-ad-player` and `context-ad-logo` are separate nodes from `ad-controls` and from sponsored-playlist cover art. The stylesheet targets the creatives only.
- The local discard address `http://127.0.0.1:9/adblockee` is unchanged. It is the fail-closed sink already checked for native prevention. The new fetch short-circuit does not read or send the original request headers.
- This pass did not open a logged-in Daily Mix. The checks are the client source above plus the automated tests.

# Validation — 2.2.0

Native prevention, 23 October 2026:

- Compared the current Adblockify source's native settings and playtime techniques with AdBlockee. Added independently implemented native service discovery and prevention controls rather than treating mute/skip recovery as the primary blocker.
- Loaded 2.2.0 into Spotify 1.3.6.1921. Six created music slots retained zero stream/display intervals. Three configured UI slots had not yet been created and remained pending; nine music slots were monitored in total, with no compatibility errors.
- Native `enabled:false` writes still returned success while settings readback reported `enabled:true`. The status correctly reports zero verified slot-disable settings; request/timing protection and scheduler guarding are separate controls.
- The native `ad_enabled` scheduler state read back as `false`. Deliberately setting it to `true` was repaired to `false` within the 200 ms observation window, without a callback feedback loop.
- A controlled native stream-slot trigger left `hasActiveAd:false`, `hasAvailableAds:false` and an empty inventory while a normal track remained in the player. Recovery counters stayed at zero: the test used neither muting nor queue advancement. Playback volume stayed at its starting value.
- Inspected the generated Testing protocol: `AddPlaytime.seconds` is `uint32` in this client. The older negative argument wraps to a large positive number in that codec; 2.2.0 detects the failed signed round trip and does not send it. Compatible signed codecs are covered by tests, but that legacy path has not been tested on an older live Spotify client.
- Temporary product-state probes were removed and the existing ads-only override reinstated. Account subscription/catalogue overrides, audio quality, media mode and podcast slots are not part of this implementation. Temporary module-resolution probes were deleted from memory; no temporary test files were created.
- All 45 automated tests, bundle generation and syntax checking pass. The controlled trigger and native state/readback checks are stronger than mute-only verification, but are not proof that every server-delivered ad path or future Spotify version is blocked. Longer ordinary listening remains necessary to establish the escaped-ad rate.
- GitHub CI passed for the published code. After the initial CDN response remained stale, a second purge produced a byte-for-byte match with the release bundle. A full Spotify restart then loaded 2.2.0 from the persisted Marketplace installation, with six configured native slots, nine monitors, scheduler suppression confirmed by native readback and no compatibility errors. Both recovery counters remained zero. No manual installation was needed.

Audio-ad follow-up, 23 October 2026:

- Observed an actual Tesco audio ad in Spotify 1.3.6.1921 while the Marketplace installation was running AdBlockee 2.1.2. Its status reported nine monitored slots and no compatibility errors. This establishes an escaped ad, not its exact cause or a confirmed Spotify anti-blocker patch.
- Inspected the installed player's normalization code: native ad items have `type: "ad"` and an ad URI, independently of the legacy `is_advertisement` metadata field. Expanded recovery to recognize these formats.
- Probed Spotify's native slot-disable command. It returned success while readback still showed the slot enabled; no claim of native slot disabling is made and that experiment is not included in the extension. A separate temporary ad-state probe was restored to its original value.
- Loaded the 2.1.3 bundle in Spotify. Nine monitors attached without compatibility errors; ordinary music kept its volume and was not skipped.
- Exercised the new silencer against the real Spotify volume API with a controlled ad marker, without altering the native player's item or sending skip commands. The volume reached zero, then returned to exactly `0.8602121004043641`; both results were read back. The temporary in-memory test function was deleted immediately.
- After publishing, restarted Spotify normally and verified the persisted Marketplace install loaded 2.1.3 from jsDelivr, with nine monitors, no reported errors and the same volume. Both the CDN response and downloadable release asset matched the built bundle. GitHub CI passed. Removed the temporary port-9222 launch flag; no manual AdBlockee extension file or temporary test file was left on the PC.
- All 33 regression tests, bundle generation and syntax checking pass. Tests cover native ad formats, missing events, refused skips, consecutive ads, stale/unknown state, volume restoration and user changes, delayed volume caches, pending-mute disposal, stopped playback, podcast exclusions and endpoint reapplication.
- A further real ad break has not yet been observed under 2.1.3. Native volume verification and synthetic ad-state tests do not establish that every real ad will be skipped or muted before any audio escapes. Unskippable breaks may finish silently before music resumes.

Active-ad startup recovery, 21 October 2026:

- Added a separate player-state check for an advertisement already playing at extension startup. It relies on Spotify's explicit `is_advertisement` metadata and item identity, not title text or disabled controls.
- Inspected the installed client's native `PlayerAPI.skipToNext` interface. Recovery uses its awaited command after disabling ad-manager hooks, then checks that the identified ad leaves the player.
- All 18 automated tests pass. New tests cover an active ad missing from slot inventory, ordinary tracks with advertising words, unknown native state with stale wrapper data, the ad ending during startup, duplicate events and a silently rejected skip.
- A real mid-ad installation was not reproduced for this release. The regression fixtures establish dispatch and race handling, not that Spotify permits every active ad to be skipped. Native rejection is reported without repeated queue-advance commands.

Homepage update, 21 October 2026:

- Identified Spotify's `HomeNativeAdsShelf` component in the installed client. Its advertising section has separate markers from the older `home-ad-card` and `home-ads-container` elements.
- Browser-rendered regression fixtures use the real native-shelf markers. All three advertising variants were hidden, including a translated-label variant, and an ordinary “You might like” shelf stayed visible at the top with no reserved advertising space.
- All 12 automated tests, bundle generation and JavaScript syntax checks passed. This patch changes cosmetic filtering only; Spotify's audio controls are unchanged.

Previous live checks for 2.1.0:

Test environment: Windows, Spotify 1.3.5.3058 and Spicetify 2.46.1, 20 October 2026.

- Twelve automated tests passed, covering startup timing, independent failures, timeout handling, refresh concurrency, teardown, Marketplace resources, native ad-arrival/discard handling, rejected native settings and quiet refreshes during ordinary playback.
- Inspected the installed client's native connector: `enableSlot` always sends `enabled: true` and has no boolean parameter. The previous release's test double incorrectly accepted that parameter, so its claim that nine slots were disabled was wrong.
- Removed every `enableSlot` call from the bundle. Native slot settings may still report enabled; the new protection uses a local request endpoint override, subscriptions and ad-arrival interception instead. The status now reports slots monitored, not slots disabled.
- Loaded the generated 2.1.0 bundle into the real desktop client. Nine music-slot monitors attached without compatibility errors while music continued playing.
- Removed the old local sponsored-playlist helper's style. On Spotify's real Halloween Party playlist, the sponsored header collapsed from 395px to 256px, with its 232px artwork preserved. The correction uses the actual Spicetify semantic classes rather than just hashed selectors.
- In-client CSS regression fixtures confirmed that both semantic sponsored-header variants collapse from 400px to their 40px content height while an ordinary header retains 400px.
- Regression tests verify that an available/playing ad clears immediately, duplicate events coalesce, DISCARD does not trigger a clear loop, empty slots are not cleared, and refreshes do not rewrite the product override or call the enabling API.
- Marketplace preview remains square (1280 × 1280). Removed the README's playlist screenshot as requested.
- Verified a Marketplace installation persisted across a full Spotify restart: the CDN script loaded version 2.1.0, the stylesheet was present, nine monitors attached, the header measured 256px and the sponsor card was hidden. The user subsequently reported that it seemed to be working.

These checks establish startup, Marketplace loading, current API behavior and scoped UI styling. The user's playback report is useful feedback, not a controlled comparison or proof that every audio-ad delivery path is blocked. Longer listening tests remain valuable. The extension never changes the media preference and no longer repeatedly clears empty slots.
