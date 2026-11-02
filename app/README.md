# Cadence app

A 3D vinyl shop for YouTube Music (free, open source). Electron + Three.js.

Milestone 1 (this folder): the opening shot. A golden-hour alley, the door swings open on its own, the camera walks into a cosy plant-filled record shop, and the view tilts with the cursor. All scenery is procedural and fake-data only for now.

```
npm install
npm run dev                 # vite on http://127.0.0.1:5173 (open in a browser)
npm run build && npm run electron
CADENCE_DEV_URL=http://127.0.0.1:5173 npm run electron   # electron against the dev server
node scripts/shot.mjs out_dir 0 3.6 5 8.5   # headless screenshots at given seconds
```

Next: sticker-lettered category words and camera moves to the racks, then real YT Music data and playback.
