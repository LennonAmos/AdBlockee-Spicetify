# AdBlockee

**Less advertising. More music.** A lightweight ad blocker for Spotify desktop, built for Spicetify.

## Install

1. Open **Spicetify Marketplace → Extensions**.
2. Choose **Newest**, search **AdBlockee**, and select the listing by **LennonAmos**.
3. Click **Install** and reload Spotify when prompted.

Already using another ad blocker? Remove it first so only AdBlockee handles ads.

## Features

- **Audio ad protection:** intercepts incoming music ad slots as they arrive, with a local ad-request endpoint override.
- **Sponsored playlist blocking:** hides the “Presented by” sponsor cards, “Learn more” promotions and “Limited ads” labels while keeping the playlist playable.
- **Cleaner playlist headers:** collapses the extra space reserved for sponsored playlist ads.
- **Display ad cleanup:** hides supported billboard, homepage and Now Playing advertising panels.
- **Quiet playback:** leaves your audio/video preference alone and avoids repeatedly clearing empty ad slots.
- **Quick status check:** open **Profile → AdBlockee status** to check compatibility and session interceptions.
- **No telemetry:** runs locally without an account, tracking service or extra blocking app.

Works with Spicetify on **Windows, macOS and Linux**. Spotify updates can change ad behavior; if something slips through, [report it here](https://github.com/LennonAmos/AdBlockee-Spicetify/issues/new/choose).

## Why choose AdBlockee?

AdBlockee is a dedicated project for ad blocking and sponsored-playlist cleanup. Its own releases, bug reports and regression tests let us ship compatibility fixes independently. The aim is straightforward: keep protection working as Spotify changes, preserve normal playback and make problems easy to diagnose.

Reliability is built into how it starts and handles failures:

- **Flexible startup:** protection starts whether Spicetify's APIs load before or after the extension. It uses direct APIs without scanning and executing Spotify's bundle modules.
- **Independent controls:** each ad-control request has a timeout. A failed or unresponsive API does not stop the other controls or the cosmetic fixes.
- **Controlled refreshes:** overlapping refreshes share one operation. Empty ad slots are left alone, and successful setup is not repeated on every track change.
- **Visible diagnostics:** the profile status panel shows the running version, monitored slots, interception count and compatibility warnings.
- **Checks with each update:** 12 automated regression tests and GitHub CI cover startup, failures, ad events and cleanup. Live Windows checks are documented in [validation notes](VALIDATION.md).

## Compared with Adblockify

Both projects use native Spotify ad controls, ad-slot callbacks and local ad-request endpoint overrides. AdBlockee takes a different approach to startup, playback state and compatibility fixes:

| Area | Adblockify | AdBlockee |
| --- | --- | --- |
| Startup | Waits for platform/bundle events and scans bundle modules | Checks API readiness directly, including late availability |
| API failures | Several manager operations share one error-handling block | Per-operation timeouts and independent failure handling |
| Sponsored playlists | The compared source lacks the current sponsor-label and sponsored-header fixes | Hides sponsor cards and labels, and collapses reserved header space using current Spicetify classes |
| Local playback/account flags | Overrides local Premium/catalogue flags, ad-test playtime and several experimental settings | Changes the ad preference without Premium spoofing, test-playtime changes or audio/video preference changes |
| Diagnostics | Console logging | Profile status panel plus console warnings |

Comparison checked **20 October 2026** against [Adblockify's source at `5da6cf1`](https://github.com/rxri/spicetify-extensions/blob/5da6cf1bb723f9efd0177f5fa4f4673b9e0c0936/adblock/adblock.ts). These are implementation differences, not a measured ad-blocking success-rate comparison. Both depend on Spotify internals, and neither approach removes the account risk noted below.

## Manual install

Download [`adblockee.js`](https://github.com/LennonAmos/AdBlockee-Spicetify/releases/latest/download/adblockee.js) to your [Spicetify Extensions folder](https://spicetify.app/docs/advanced-usage/extensions/), then run:

```sh
spicetify config extensions adblockee.js
spicetify apply
```

## Development

Requires Node.js 22+: `npm ci`, then `npm run check`. See [validation notes](VALIDATION.md) and the [changelog](CHANGELOG.md).

Maintained by **LennonAmos**, with Codex assistance. [MIT licensed](LICENSE). Not affiliated with Spotify or Spicetify. If it helps you, a star helps other Marketplace users find it.

Spotify [prohibits ad blockers](https://www.spotify.com/us/legal/user-guidelines/); account suspension is possible. AdBlockee does not change your subscription or remove ads recorded into podcast audio.
