# Cadence

A lightweight macOS menu-bar app that sits in front of [Kaset](https://github.com/sozercan/kaset)
(a native YouTube Music client). Press a shortcut and a 3D leather suitcase appears at your
cursor and flips its lid open on a record player.

- **⌃⌥Space** (default, will be configurable) opens the suitcase at the cursor, anywhere. The lid
  is flicked open with a physical hinge (the same model as Lodestar's compass lid) and lands with a
  little bounce.
- **Record**: the middle of the record shows the song's artwork. The tonearm creeps inward as
  the song plays.
- **Buttons** beside the record: back, play / pause, skip, like. `Space` also plays / pauses, `←` / `→`
  go back / skip, `L` likes.
- **Volume**: scroll up / down (trackpad or wheel) over the suitcase, or drag the knob around, or
  `↑` / `↓`. The knob turns with the volume.
- **Scrub** by dragging the record clockwise (forward) or anticlockwise (back). One full turn is
  20 seconds. **Off for now**: Kaset has no seek command (see below).
- **Esc**, clicking outside, or the shortcut again shuts the lid and closes it.
- Menu bar only: no Dock icon.

Cadence is a **companion**: Kaset stays the player and Cadence is the quick remote.

## How it talks to Kaset

| Need | Mechanism |
| --- | --- |
| Play, pause, next, previous, like, volume, now playing | Kaset's AppleScript (`playpause`, `next track`, `like track`, `set volume N`, `get player info`) |
| Start a song or a list of songs | AppleScript `play video` / `play videos` with YouTube Music video IDs |
| Open a playlist or album | A shortcut from the Shortcuts app, run with `shortcuts run` (Kaset documents Play Playlist / Play Album actions) |

Kaset cannot list your library, so Cadence does not browse music: you start something in Kaset
and Cadence controls it. (`PinnedItem` / `pins.json` from the first prototype are still in
`CadenceCore` but the suitcase does not use them.)

**No seek.** Kaset's AppleScript has no way to change the playback position, so scrubbing with the
record is built (`RecordScrub`) but switched off: `MusicBackend.canSeek` is false for Kaset. When Kaset
gains a seek command, add it to `KasetScripts` and return true from `KasetBackend.canSeek`.

**Like** sends `like track`. Kaset's docs do not say whether that toggles, so the heart may only
ever turn on.

macOS asks once for permission to control Kaset (Automation).

## Status

| Piece | State |
| --- | --- |
| `CadenceCore`: lid hinge, volume knob, record scrub, tonearm geometry, suitcase layout, Kaset AppleScript + now-playing parsing | done, unit tested (`swift test`, runs on Linux too) |
| `Cadence` app: SceneKit suitcase, input, animation, menu bar, global hotkey | written, **needs a first compile and tuning on a Mac** |
| Verified against a real Kaset (volume, like, artwork) | **not yet** |
| Scrubbing | built, off until Kaset can seek |
| Settings UI, onboarding, icon, hotkey picker | not started |

## Build

```sh
swift test                  # core logic, any platform
./scripts/build.sh          # macOS only: builds build/Cadence.app
./scripts/build.sh --run    # build and launch
```

Requires macOS 14+.

## Layout

```
Sources/CadenceCore/   pure Swift, no AppKit: hinge, knob, scrub, layout, Kaset
Sources/Cadence/       AppKit + SceneKit app
  SuitcaseScene.swift     builds the 3D case and exposes setters
  SuitcaseView.swift      animation loop and all input
  SuitcaseTextures.swift  every texture, drawn in code
Tests/CadenceCoreTests/
scripts/build.sh
```

## License

MIT
