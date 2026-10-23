# AdBlockee

Block music ads and clean up sponsored playlists — right down to the “Limited ads” labels, sponsor cards and empty space they leave behind.

For Spotify desktop with Spicetify. No extra account or blocking app needed.

## Install

1. Open **Spicetify Marketplace → Extensions**.
2. Choose **Newest**, search **AdBlockee**, and select the listing by **LennonAmos**.
3. Click **Install** and reload Spotify when prompted.

Already using another ad blocker? Remove it first so only AdBlockee handles ads.

## Features

- **Music ad prevention:** combines native ad-request overrides, slot timing controls and a guarded scheduler override to stop supported music ad breaks before playback.
- **Protection against resets:** reapplies native controls when Spotify resets its scheduler or an ad reaches a monitored music slot.
- **The small labels, too:** hides “Limited ads” and “Presented by” sponsor branding on supported Spotify surfaces, including sponsored playlist headers and Now Playing.
- **Sponsored playlists without the promotions:** removes sponsor cards, logos and “Learn more” buttons while keeping the playlist and its music available.
- **No leftover gaps:** removes the extra header space reserved for sponsored playlist ads, so the artwork and title sit together naturally.
- **A cleaner Spotify:** hides supported homepage, billboard and Now Playing advertising panels.
- **Your playback stays yours:** keeps your audio/video preference, subscription and audio quality unchanged.
- **Private by design:** no telemetry, tracking service or extra sign-up.

Works with Spicetify on **Windows, macOS and Linux**. Spotify updates can change ad behavior; if something slips through, [report it here](https://github.com/LennonAmos/AdBlockee-Spicetify/issues/new/choose).

Ad prevention is the primary protection. An emergency recovery layer still requests a skip for an escaped music ad and silences it if Spotify refuses; that fallback can leave a silent wait before music returns.

## Why choose AdBlockee?

Because an ad-free experience is about more than silencing a commercial. A playlist can still show a sponsor's name, a promotional card, a “Limited ads” badge or a large blank gap after an ad is hidden. AdBlockee tackles those details together, so sponsored playlists look like playlists again.

It's a dedicated project for keeping that experience working as Spotify changes. If something slips through, [report it directly](https://github.com/LennonAmos/AdBlockee-Spicetify/issues/new/choose) so it can be checked and fixed.

## Compared with Adblockify

Both projects block music ads. AdBlockee's clearest additional benefit is the cleanup you see around sponsored playlists:

| What you see | Adblockify | AdBlockee |
| --- | --- | --- |
| Music ads | Ad blocking | Ad blocking |
| “Limited ads” and “Presented by” branding on current sponsored playlists | No dedicated fix in the compared version | Hidden |
| Sponsor cards, logos and “Learn more” promotions on current sponsored playlists | No dedicated fix in the compared version | Hidden |
| Extra space reserved for sponsored playlist ads | No dedicated fix in the compared version | Collapsed to fit the artwork and title |

Comparison checked **20 October 2026** against [Adblockify's source at `5da6cf1`](https://github.com/rxri/spicetify-extensions/blob/5da6cf1bb723f9efd0177f5fa4f4673b9e0c0936/adblock/adblock.ts). AdBlockee's sponsored-playlist cleanup has been checked in Spotify; a higher overall audio-ad blocking rate has not been established by a head-to-head test.

## Manual install

Download [`adblockee.js`](https://github.com/LennonAmos/AdBlockee-Spicetify/releases/latest/download/adblockee.js) to your [Spicetify Extensions folder](https://spicetify.app/docs/advanced-usage/extensions/), then run:

```sh
spicetify config extensions adblockee.js
spicetify apply
```

## Development

Requires Node.js 22+: `npm ci`, then `npm run check`. The project has 45 automated regression tests and GitHub CI. See [validation notes](VALIDATION.md) and the [changelog](CHANGELOG.md). For an installed-version check, open **Profile → AdBlockee status** in Spotify.

Maintained by **LennonAmos**, with Codex assistance. [MIT licensed](LICENSE). Not affiliated with Spotify or Spicetify. If it helps you, a star helps other Marketplace users find it.

Spotify [prohibits ad blockers](https://www.spotify.com/us/legal/user-guidelines/); account suspension is possible. AdBlockee does not change your subscription or remove ads recorded into podcast audio.
