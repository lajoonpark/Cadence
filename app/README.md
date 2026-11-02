# Cadence app

A 3D vinyl shop for YouTube Music (free, open source). Electron + Three.js.

The opening shot: a narrow Tuscan alley of brick and stucco houses, an arch over the street, a little piazza, and the Cadence shop. The door swings open on its own, the camera walks into the shop, and the view tilts with the cursor. All scenery is procedural.

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
- **Home**: the intro (street, door, walk in) ends at a home spot just inside the shop. Click or
  press any key to skip it. Your YouTube Music shelves ("Quick picks", "Listen again"...) are the
  brush-stroke words down both sides of the screen (`src/menu.js`); click one and the camera walks
  there (`src/nav.js`: along the aisle, through the arches, over the gallery railing). **Tab** /
  **Shift+Tab** go to the next / previous section, **Esc** or HOME goes back. At a section the words
  step back to the edges until the cursor comes near them.
- **Sections** (`src/stations.js`): eight spots in the shop, each with its own kind of rack
  (`src/racks/`): crate table in the hall, cube shelf under the gallery, records leaning on a plinth
  upstairs, a stepped easel on the counter, picture ledges in the lounge, a library shelf with a
  ladder in the stacks, a spinner rack in the plant room, a market stall in the courtyard. Shelves
  YouTube always sends have a fixed spot (Quick picks next to home, Listen again on the cube shelf,
  Forgotten favourites upstairs); the others fill the free spots. Hover a record and it comes out
  toward you with a paper name tag; click it and its vinyl pops out and flies into the suitcase.
- **The suitcase** (`src/suitcase/`): the player, bottom left. A watercolour leather case with a
  record player: the record spins with the cover on its label, the tonearm creeps in as the song
  plays, the knob is volume (drag it or scroll), the buttons are back / play / skip / like, and
  dragging the record scrubs. A paper tag beside it shows the song with a seekable progress line.
- **Mini player**: **⌃⌥Space** anywhere opens the same suitcase at the cursor on a torn-paper card
  (`mini.html`, `electron/mini.cjs`); the lid flicks open on a physical hinge (`src/lid.js`). Esc,
  clicking away or ⌃⌥Space again shuts it.
- **Search**: **⌥⌘S** (Ctrl+Alt+S on Windows/Linux) opens a search bar (`src/search.js`); songs drop
  down as paper slips, arrows + Enter or a click plays one.
- **Covers**: playlist and mix covers are found in any of YouTube's thumbnail shapes; one that is
  missing or fails to load is painted as a collage of the playlist's first songs (`src/cover.js`).
  `CADENCE_DUMP=1` saves the raw API responses to the app's userData (`dumps/`) and logs any item
  without art, for debugging.
- **Keys**: Space play/pause, ← → back/skip, ↑ ↓ or scroll for volume, L like.
- Covers and tags are drawn sharp: they write alpha 0 into the scene buffer (`crisp()` in
  `materials.js`) and the watercolour pass leaves those pixels alone.
- In a plain browser (`npm run web`, screenshots) `src/music.js` fakes a record store with painted
  covers, so the shop can be worked on without Electron or an account.
- Dev pages for screenshots: `lab.html?station=N` (one rack), `player-lab.html` (the suitcase in the shop),
  `mini.html`, `search-lab.html`. Shop URL options: `?at=home|N` start there, `?hover=N`, `?fly=from,to,p`,
  `?search=lemon`, `?shelves=8` (fake store: fill every station).

```
npm test                                   # parser, suitcase (lid, knob, scrub, tonearm) tests
npm run build && xvfb-run -a npm run e2e -- out_dir   # real app vs YouTube Music: shelves, hover, play, buttons
```

Not yet: playlists/albums opening as a rack of their own songs (clicking one plays the whole thing
for now), media keys. Untested on a Mac: the mini player's focus/Dock behaviour and the real
global shortcut.
