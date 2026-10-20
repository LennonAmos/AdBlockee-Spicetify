# Validation — 2.1.0

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
