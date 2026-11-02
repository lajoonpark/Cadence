const test = require('node:test');
const assert = require('node:assert');
const { parseShelves, continuation } = require('../electron/ytm-parse.cjs');
const home = require('./fixtures/home.json'); // guest FEmusic_home, trimmed

test('home shelves come out with titles and playable items', () => {
  const shelves = parseShelves(home);
  assert.deepStrictEqual(shelves.map((s) => s.title), ['Quick picks', 'Springtime']);
  for (const s of shelves) {
    assert.ok(s.items.length > 0);
    for (const i of s.items) {
      assert.ok(i.title, 'title');
      assert.ok(i.art?.startsWith('https://'), 'art');
      assert.ok(i.play.videoId || i.play.playlistId, 'play endpoint');
    }
  }
});

test('quick picks rows are songs with artist and no play count', () => {
  const [song] = parseShelves(home)[0].items;
  assert.strictEqual(song.kind, 'song');
  assert.strictEqual(song.title, 'Thriller');
  assert.strictEqual(song.subtitle, 'Michael Jackson');
  assert.strictEqual(song.play.videoId, 'Z85lxckrtzg');
  assert.match(song.art, /=w544-h544/);
});

test('playlist tiles play the whole playlist', () => {
  const [pl] = parseShelves(home)[1].items;
  assert.strictEqual(pl.kind, 'playlist');
  assert.strictEqual(pl.title, 'Feel-Good Pop & Rock');
  assert.strictEqual(pl.play.playlistId, 'RDCLAK5uy_m0wlRoNn5iCTTgBedfoOQ19Jq9P3XTLIA');
  assert.strictEqual(pl.play.videoId, undefined);
});

test('continuation token comes from the section list', () => {
  assert.match(continuation(home), /^4qmF/);
  assert.strictEqual(continuation({}), null);
});
