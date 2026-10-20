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
