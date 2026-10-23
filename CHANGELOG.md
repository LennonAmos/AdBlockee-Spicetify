# Changelog

## 2.1.3 — 2026-10-23

- Recognize native `type: "ad"` items and `spotify:ad:` URIs even when the older advertisement metadata flag is absent.
- Listen to native player updates and check cached player state every 500 ms as a fallback for missing song-change events. Skip attempts remain limited to one per identified ad.
- Silence detected music ads while attempting recovery. If Spotify refuses to skip, keep the break silent and restore the previous volume when music returns. Respect pre-existing mute and nonzero volume changes made by the listener.
- Handle consecutive ads, unknown transition state, delayed volume-cache updates, stopped playback and extension replacement without leaving the next song muted.
- Reapply the local ad-request endpoint when an ad arrives while clearing the slot immediately. Ignore discard callbacks to prevent feedback loops.
- Add 15 regression cases. Explicit podcast ads and audio/video preferences remain unchanged.

## 2.1.2 — 2026-10-21

- Detect an ad that is already playing when the extension loads, even if it no longer appears in ad-slot inventory, and request a native skip.
- Recheck the exact ad identity immediately before dispatch, coalesce duplicate events and verify the ad actually leaves the player before reporting recovery.
- Do not retry a rejected command into the following song. Spotify may still refuse to advance an unskippable ad that began before installation.
- Add six regression cases for mid-ad installation, ordinary songs, stale state, startup transitions, duplicate events and rejected commands.

## 2.1.1 — 2026-10-21

- Hide the homepage's native “You might like / Sponsored recommendation” shelf, including its artwork, title and controls.
- Target the complete advertising shelf so its heading and reserved space disappear too. Ordinary recommendation shelves remain visible.

## 2.1.0 — 2026-10-20

- Remove the incorrect `enableSlot(slot, false)` calls: Spotify's native method always enables the slot.
- Monitor music ad arrivals and clear queued/active ads immediately. Ignore discard events and coalesce duplicate callbacks to avoid feedback loops.
- Override music ad request endpoints locally once per connection, without webpack module scanning or subscription spoofing.
- Stop clearing empty ad slots on song changes and heartbeat checks. Apply the ad preference once per API instance and only disable managers again if they become enabled.
- Support Spicetify's semantic sponsored-playlist header classes, including the V3 variant, so hidden promotions do not leave extra header height.
- Shorten the README around installation and features, explicitly describe sponsored-playlist blocking, and remove the example screenshot.

## 2.0.1 — 2026-10-20

- Make generated source paths independent of the build working directory, so local and CI builds produce the same file.

## 2.0.0 — 2026-10-20

- New implementation using independently written source and direct ad-manager/slot controls.
- Separate cosmetic protection, bounded API calls and serialized refreshes.
- Support for delayed API availability, track changes and cleanup on replacement.
- Sponsored playlist label/card hiding and targeted header-height fixes.
- Square Marketplace icon, searchable description and a profile status menu.
