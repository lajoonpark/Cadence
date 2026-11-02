# Cadence app

A 3D vinyl shop for YouTube Music (free, open source). Electron + Three.js.

Milestone 1 (this folder): the opening shot. A narrow Tuscan alley of brick and stucco houses, an arch over the street, a little piazza, and the Cadence shop. The door swings open on its own, the camera walks into the shop, and the view tilts with the cursor. All scenery is procedural and fake-data only for now.

**Look:** watercolour, through a screen pass (`src/watercolour.js`): hand wobble that shifts 8 times a second, colour bleed, wet edges, paper grain and a ragged paper border. `?style=flat` shows the old flat toon look.

**Everything is real geometry**, with no brick textures. `src/kit.js` collects thousands of bricks, flagstones, roof tiles and shutter slats into a few instanced meshes. `src/masonry.js` lays brick walls course by course around openings, builds arches with voussoirs, barrel vaults, stucco with patches of exposed brick, and paving. `src/details.js` has windows, louvred shutters, doors, balconies, lanterns, eaves and pots. `src/props.js` has street life, and `src/interior.js` has shop furniture.

**The shop** (`src/shop.js`) is a row of brick vaults going back, one per category zone (`ZONES`): the big hall with crate-digging tables and a U-shaped gallery with a spiral stair, the listening lounge, the stacks, the plant room under a skylight, and an open courtyard with a lemon tree.

**Time of day** follows the viewer's clock (`src/timeofday.js`): sky, sun, shadows and fog blend through night, blue hour, sunset, golden hour and day. Lamps are always there and switch on one by one at dusk with a short flicker (`src/env.js`). Windows light up through the evening.

```
npm install
npm run dev                 # vite dev server + opens the Electron window; menu bar icon has "Open Cadence"
npm run web                 # just vite on http://127.0.0.1:5173 (open in a browser)
npm run build && npm run electron
CADENCE_DEV_URL=http://127.0.0.1:5173 npm run electron   # electron against the dev server
node scripts/shot.mjs out_dir 0 3.6 5 8.5   # headless screenshots at given seconds
CADENCE_QUERY=hour=21 node scripts/shot.mjs out_dir 0 8.5          # at 9 pm
CADENCE_QUERY='cam=-4.4,4.65,-3.3,2,3.2,-9.5' node scripts/shot.mjs out_dir 9   # pinned camera (x,y,z,target)
```

URL options: `?hour=20.5` freezes the clock, `?speed=600` runs it faster, `?cam=x,y,z,tx,ty,tz` pins the camera, and `?style=flat` shows the old look.

## Music (YouTube Music)

A hidden `music.youtube.com` window plays the audio (`electron/ytm.cjs`). YouTube Music itself does
the queue, radio, ads, history and likes; Cadence drives it through a small script injected into the
page (`electron/ytm-page.js`) and reads your home shelves from the same internal API the page uses
(`electron/ytm-parse.cjs`, unit tested against a real response in `test/fixtures/home.json`). The
shop talks to it only through `window.cadence` (`electron/preload.cjs`).

- **Sign in** once with the SIGN IN button (a Google window that shares the player's cookies, kept in
  the `persist:ytm` partition). Without signing in it works as a guest, with ads and generic shelves.
- **The rack** (`src/rack.js`): after the intro the camera steps up to a long record rack in the hall.
  Slide the cursor along it and the record under it lifts out, turns to face you, the vinyl slides up
  and a paper tag shows the name and artist. Click to play it (with YouTube Music's radio after it).
  The playing record stays raised a little. **Tab** / **Shift+Tab** flips to the next shelf for now
  (the floating category words will replace this).
- **Buttons** (`src/controls.js`): PLAY/PAUSE, SKIP, BACK, LIKE stacked bottom-left as paper words in
  indigo brush strokes, turned in toward the middle and tilting with the cursor. Above them a paper
  tag shows what is playing, with a progress line you can click to seek.
- **Keys**: Space play/pause, ← → back/skip, ↑ ↓ or scroll for volume, L like.
- Covers and tags are drawn sharp: they write alpha 0 into the scene buffer (`crisp()` in
  `materials.js`) and the watercolour pass leaves those pixels alone.
- In a plain browser (`npm run web`, screenshots) `src/music.js` fakes a record store with painted
  covers, so the rack can be worked on without Electron or an account. `?hover=N` holds record N up.

```
npm test                                   # parser tests
npm run build && xvfb-run -a npm run e2e -- out_dir   # real app vs YouTube Music: shelves, hover, play, buttons
```

Not yet: search, the floating category words that pick a shelf, playlists/albums open as a rack of
their own songs (clicking one plays the whole thing for now), media keys.
