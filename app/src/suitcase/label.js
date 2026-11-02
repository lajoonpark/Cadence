// Which cover the record's label shows: a small state machine over opaque cover handles (textures in
// the app, strings in the tests), so the rules can be tested without a browser.
//
// A record that flew in brings the cover it was picked with. That cover stays on the label until the
// first REAL track of the pick starts: a playlist pick has no videoId, then nothing plays for a while,
// then an ad (which must not count), then the first song. When that track arrives its own art may be
// the same picture (a song pick: keep the picked cover) or a different one (a playlist cover is not a
// song's art: swap, once the art has loaded; the caller does that comparison). Every later track just
// shows its own art.
export function createLabelPolicy() {
  let claim = null;                 // { cover, baseVideoId }: a flown-in cover waiting for its first real track
  const claims = new Map();         // videoId -> the cover that stays on the label for that track

  return {
    get pending() { return !!claim; },

    // A record carrying `cover` landed. `baseVideoId` is what was playing when it was picked.
    land(cover, baseVideoId) { claim = { cover: cover ?? null, baseVideoId: baseVideoId ?? null }; },

    // The state changed (or something landed). `videoId` is the current real track (ads never set it),
    // `own` is that track's own art (a cover handle) or null.
    // Returns { keep: true }                         leave the label as it is,
    //         { want, compare? }                     show `want` (null = no art: the plain label); if `compare` is
    //                                                given ({ vid, picked, own }), call `prefer(vid, own)` when
    //                                                `own` turns out to be a different picture than `picked`.
    sync(videoId, own) {
      let compare = null;
      if (claim) {
        if (!(videoId && videoId !== claim.baseVideoId)) return { keep: true };   // still waiting for the first real track
        claims.set(videoId, claim.cover);
        if (own && claim.cover) compare = { vid: videoId, picked: claim.cover, own };
        claim = null;
      }
      return { want: claims.get(videoId) ?? own ?? null, compare };
    },

    // `cover` is what the label should keep showing for track `videoId` from now on.
    prefer(videoId, cover) { claims.set(videoId, cover); },
    claimedFor(videoId) { return claims.get(videoId) ?? null; },
  };
}
