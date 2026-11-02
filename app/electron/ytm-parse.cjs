// Turn YouTube Music's internal API ("InnerTube") browse responses into plain shelves of records.
// The response format changes often, so this walks the tree looking for the renderers it knows
// instead of following one fixed path.

const SHELF_KEYS = ['musicCarouselShelfRenderer', 'musicImmersiveCarouselShelfRenderer'];

const text = (t) => (t?.runs ?? []).map((r) => r.text).join('') || t?.simpleText || '';

// Every object under `node` that has `key`, depth first, not descending into matches.
function findAll(node, key, out = []) {
  if (Array.isArray(node)) for (const v of node) findAll(v, key, out);
  else if (node && typeof node === 'object') {
    if (key in node) out.push(node[key]);
    else for (const v of Object.values(node)) findAll(v, key, out);
  }
  return out;
}

const first = (node, key) => findAll(node, key)[0];

// Ask for a bigger square thumbnail than the list gives us (covers are shown up close).
function bigArt(thumbs) {
  if (!thumbs?.length) return null;
  const url = thumbs[thumbs.length - 1].url;
  if (/googleusercontent\.com|ggpht\.com/.test(url)) return url.replace(/=w\d+-h\d+[^&]*$/, '=w544-h544-l90-rj');
  return url;
}

// What pressing play on this item should do: a watch (single song, maybe with its radio queue)
// or a whole playlist / album.
function playEndpoint(r) {
  const overlay = first(r.overlay ?? r.thumbnailOverlay, 'playNavigationEndpoint');
  const ep = overlay ?? r.navigationEndpoint ?? first(r.flexColumns?.[0], 'navigationEndpoint');
  if (ep?.watchEndpoint) {
    const { videoId, playlistId, params } = ep.watchEndpoint;
    return { videoId, playlistId, params };
  }
  if (ep?.watchPlaylistEndpoint) {
    const { playlistId, params } = ep.watchPlaylistEndpoint;
    return { playlistId, params };
  }
  return null;
}

function pageType(r) {
  const ep = r.navigationEndpoint ?? first(r.title, 'navigationEndpoint') ?? first(r.flexColumns?.[0], 'navigationEndpoint');
  const t = ep?.browseEndpoint?.browseEndpointContextSupportedConfigs?.browseEndpointContextMusicConfig?.pageType;
  if (t === 'MUSIC_PAGE_TYPE_ALBUM') return 'album';
  if (t === 'MUSIC_PAGE_TYPE_PLAYLIST') return 'playlist';
  if (t === 'MUSIC_PAGE_TYPE_ARTIST' || t === 'MUSIC_PAGE_TYPE_USER_CHANNEL') return 'artist';
  if (ep?.watchEndpoint) return 'song';
  return 'other';
}

// Square tile with title and subtitle (albums, playlists, mixes, some songs).
function twoRow(r) {
  const play = playEndpoint(r);
  const kind = pageType(r);
  return {
    kind: kind === 'other' && play?.videoId ? 'song' : kind,
    title: text(r.title),
    subtitle: text(r.subtitle),
    art: bigArt(first(r.thumbnailRenderer, 'thumbnails')),
    play,
  };
}

// List row (Quick picks): flex column 0 = title, 1 = artist • plays, 2 = album.
function listRow(r) {
  const cols = (r.flexColumns ?? []).map((c) => text(c.musicResponsiveListItemFlexColumnRenderer?.text));
  const sub = (cols[1] ?? '').split(' • ').filter((s) => !/\b(plays|views)$/.test(s));
  const play = playEndpoint(r) ?? (r.playlistItemData?.videoId ? { videoId: r.playlistItemData.videoId } : null);
  return {
    kind: play?.videoId ? 'song' : pageType(r),
    title: cols[0] ?? '',
    subtitle: sub.join(' • '),
    album: cols[2] || undefined,
    art: bigArt(first(r.thumbnail, 'thumbnails')),
    play,
  };
}

function item(entry) {
  if (entry.musicTwoRowItemRenderer) return twoRow(entry.musicTwoRowItemRenderer);
  if (entry.musicResponsiveListItemRenderer) return listRow(entry.musicResponsiveListItemRenderer);
  return null;
}

// Shelves from a browse response (first page or a continuation).
// Only things that can be played land on a shelf; artists and empty shelves are dropped.
function parseShelves(response) {
  const shelves = [];
  for (const key of SHELF_KEYS) {
    for (const s of findAll(response, key)) {
      const header = s.header?.musicCarouselShelfBasicHeaderRenderer ?? s.header?.musicImmersiveCarouselShelfBasicHeaderRenderer ?? s.header;
      const title = text(header?.title);
      const items = (s.contents ?? []).map(item).filter((i) => i && i.play && i.title);
      if (title && items.length) shelves.push({ title, strapline: text(header?.strapline) || undefined, items });
    }
  }
  return shelves;
}

// Token for the next page of shelves, if any.
function continuation(response) {
  const list = first(response, 'sectionListRenderer') ?? first(response, 'sectionListContinuation');
  const c = list?.continuations?.[0]?.nextContinuationData?.continuation ?? first(response, 'continuationCommand')?.token;
  return c ?? null;
}

module.exports = { parseShelves, continuation, text, findAll };
