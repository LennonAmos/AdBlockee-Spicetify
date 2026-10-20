# Validation — 2.0.1

Test environment: Windows, Spotify 1.3.5.3058 and Spicetify 2.46.1, 20 October 2026.

- Eight automated tests passed, covering startup timing, independent failures, timeout handling, refresh concurrency, cleanup and Marketplace resources.
- Loaded the generated bundle into the real desktop client. Audio, in-stream and leaderboard managers reported disabled while music continued playing.
- Nine supported music slots were disabled. The final live status reported no compatibility errors.
- Removed the previous local sponsored-playlist helper's style for the UI check. A DOM fixture inside Spotify confirmed that the sponsor card and Limited ads label were hidden, the sponsored-header fixture shrank from 400px to its 40px content height, and an ordinary header remained at 400px.
- Opened Spotify's public Halloween Party playlist with the new implementation active and captured the example in the README.
- The Marketplace preview PNG is square (1280 × 1280). The listing links only to this repository and its shipped files.
- After restarting Spotify to clear its cached catalog, verified the real Marketplace Extensions grid under Newest: the AdBlockee card displayed the square preview, author LennonAmos and this repository's URL. Its README opened inside Marketplace.

These checks establish startup, current API behavior and scoped UI styling. They do not guarantee that every future audio-ad delivery path is blocked, nor compatibility with other Spotify versions. The screenshot is an example with AdBlockee active, not a before/after comparison.
