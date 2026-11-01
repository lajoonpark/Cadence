# Cadence

A lightweight macOS menu-bar app that sits in front of [Kaset](https://github.com/sozercan/kaset)
(a native YouTube Music client). Press a shortcut and a 3D vinyl record appears **at your
cursor**: point and click, or press a number.

- **⌃⌥Space** (default, will be configurable) opens the record at the cursor, anywhere.
- **Label** in the middle: play / pause (also `Space`).
- **Outer ring**: your pinned items, `1`–`9` to pick one.
- **Scroll** or **← / →**: previous / next track.
- **Esc**, clicking outside, or the shortcut again closes it.
- Menu bar only: no Dock icon.

Cadence is a **companion**: Kaset stays the player and Cadence is the quick remote.

## How it talks to Kaset

| Need | Mechanism |
| --- | --- |
| Play, pause, next, previous, like, now playing | Kaset's AppleScript (`playpause`, `next track`, `like track`, `get player info`) |
| Start a song or a list of songs | AppleScript `play video` / `play videos` with YouTube Music video IDs |
| Open a playlist or album | A shortcut from the Shortcuts app, run with `shortcuts run` (Kaset documents Play Playlist / Play Album actions) |

Kaset cannot list your library, so the ring shows **pinned items** you choose instead of live
lists. Menu bar › **Edit Pinned Items…** reveals `~/Library/Application Support/Cadence/pins.json`:

```json
[
  { "title": "Focus",  "shortcut": "Cadence Focus" },
  { "title": "Anthem", "videoIds": ["dQw4w9WgXcQ"] }
]
```

Each item has either `videoIds` (one or more) or `shortcut`; up to 9; malformed items are
skipped. The file is re-read each time the record opens.

macOS asks once for permission to control Kaset (Automation).

## Status

| Piece | State |
| --- | --- |
| `CadenceCore`: hotkey spec, ring geometry, pinned items, Kaset AppleScript + now-playing parsing, `KasetBackend` | done, unit tested (`swift test`, runs on Linux too) |
| `Cadence` app: menu-bar item, global hotkey, floating panel, SceneKit record, ring overlay | written, **not yet compiled or run** (needs macOS) |
| Verified against a real Kaset | **not yet**: the AppleScript verbs come from Kaset's docs |
| Settings UI, onboarding, icon, real record art, hotkey picker | not started |

Known open question: on the author's Mac the Kaset actions did not appear in the Shortcuts
app, so shortcut-based pins are untested. Song pins (`videoIds`) do not need Shortcuts.

## Build

```sh
swift test                  # core logic, any platform
./scripts/build.sh          # macOS only: builds build/Cadence.app
./scripts/build.sh --run    # build and launch
```

Requires macOS 14+.

## Layout

```
Sources/CadenceCore/   pure Swift, no AppKit
Sources/Cadence/       AppKit + SceneKit app
Tests/CadenceCoreTests/
scripts/build.sh
```

## License

MIT
