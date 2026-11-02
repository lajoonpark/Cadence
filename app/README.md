# Cadence app

A 3D vinyl shop for YouTube Music (free, open source). Electron + Three.js.

Milestone 1 (this folder): the opening shot. A narrow Tuscan alley of brick and stucco houses, an arch over the street, a little piazza, and the Cadence shop. The door swings open on its own, the camera walks into the shop, and the view tilts with the cursor. All scenery is procedural and fake-data only for now.

**Look:** watercolour, through a screen pass (`src/watercolour.js`): hand wobble that shifts 8 times a second, colour bleed, wet edges, paper grain and a ragged paper border. `?style=flat` shows the old flat toon look.

**Everything is real geometry**, with no brick textures. `src/kit.js` collects thousands of bricks, flagstones, roof tiles and shutter slats into a few instanced meshes. `src/masonry.js` lays brick walls course by course around openings, builds arches with voussoirs, barrel vaults, stucco with patches of exposed brick, and paving. `src/details.js` has windows, louvred shutters, doors, balconies, lanterns, eaves and pots. `src/props.js` has street life, and `src/interior.js` has shop furniture.

**The shop** (`src/shop.js`) is a row of brick vaults going back, one per category zone (`ZONES`): the big hall with crate-digging tables and a U-shaped gallery with a spiral stair, the listening lounge, the stacks, the plant room under a skylight, and an open courtyard with a lemon tree.

**Time of day** follows the viewer's clock (`src/timeofday.js`): sky, sun, shadows and fog blend through night, blue hour, sunset, golden hour and day. Lamps are always there and switch on one by one at dusk with a short flicker (`src/env.js`). Windows light up through the evening.

```
npm install
npm run dev                 # vite on http://127.0.0.1:5173 (open in a browser)
npm run build && npm run electron
CADENCE_DEV_URL=http://127.0.0.1:5173 npm run electron   # electron against the dev server
node scripts/shot.mjs out_dir 0 3.6 5 8.5   # headless screenshots at given seconds
CADENCE_QUERY=hour=21 node scripts/shot.mjs out_dir 0 8.5          # at 9 pm
CADENCE_QUERY='cam=-4.4,4.65,-3.3,2,3.2,-9.5' node scripts/shot.mjs out_dir 9   # pinned camera (x,y,z,target)
```

URL options: `?hour=20.5` freezes the clock, `?speed=600` runs it faster, `?cam=x,y,z,tx,ty,tz` pins the camera, and `?style=flat` shows the old look.

Next: sticker-lettered category words and camera moves to the racks, then real YT Music data and playback.
