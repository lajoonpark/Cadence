# Cadence

A lightweight macOS menu-bar app for YouTube Music. Press a shortcut and a 3D vinyl record
appears **at your cursor**: point and click, or press a number. Same idea as
[Lodestar](https://github.com/lajoonpark) (the bookmarks compass), for music.

- **⌃⌥Space** (default, will be configurable) opens the record at the cursor, anywhere.
- **Label** in the middle: play / pause (also `Space`).
- **Outer ring**: quick targets: `1` Liked, `2` Mixes, `3` Recent, `4` Playlists, `5` Search.
- **Scroll** or **← / →**: previous / next track.
- **Esc**, clicking outside, or the shortcut again closes it.
- Menu bar only: no Dock icon.

## Status: scaffold

What exists:

| Piece | State |
| --- | --- |
| `CadenceCore`: hotkey spec, ring geometry and hit testing, `QuickTarget`, `NowPlaying`, `MusicBackend` protocol | done, unit tested (`swift test`, runs on Linux too) |
| `Cadence` app: menu-bar item, global hotkey, floating panel at the cursor, SceneKit record that spins and leans | written, **not yet compiled or run** (needs macOS) |
| `MusicBackend` implementation for YouTube Music | **not started**: only `NullBackend` |
| Settings, onboarding, icon, real record art | not started |

## The open decision: how does it play YouTube Music?

The UI only talks to `MusicBackend`, so this can be decided later:

1. **Embedded web view** of music.youtube.com inside Cadence, controlled with injected
   JavaScript (what Kaset does). Self-contained; needs a sign-in flow.
2. **Drive an existing player** (Kaset or a browser tab) with media keys / AppleScript.
   Small, but depends on that player and gives limited now-playing info.

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
