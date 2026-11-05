// Injected into the hidden music.youtube.com page. Installs window.__cadence: a small, stable
// surface over YouTube Music's own player and internal API, so the Electron main process only
// ever calls these few functions (and only this file has to change when YouTube changes).
(() => {
  if (window.__cadence) return;

  const cfg = (k) => window.ytcfg?.get?.(k);
  const player = () => document.getElementById('movie_player');
  const bar = () => document.querySelector('ytmusic-player-bar');
  const cookie = (name) => document.cookie.split('; ').find((c) => c.startsWith(name + '='))?.slice(name.length + 1);

  // Signed-in requests carry SAPISIDHASH = "<ts>_<sha1(ts + ' ' + SAPISID + ' ' + origin)>",
  // the same header YouTube Music's own scripts send.
  async function authHeader() {
    const sapisid = cookie('SAPISID') ?? cookie('__Secure-3PAPISID');
    if (!sapisid) return null;
    const ts = Math.floor(Date.now() / 1000);
    const buf = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(`${ts} ${sapisid} ${location.origin}`));
    const hex = [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
    return `SAPISIDHASH ${ts}_${hex}`;
  }

  async function api(endpoint, body = {}) {
    const headers = {
      'Content-Type': 'application/json',
      'X-Goog-AuthUser': String(cfg('SESSION_INDEX') ?? 0),
      'X-Origin': location.origin,
    };
    const visitor = cfg('VISITOR_DATA');
    if (visitor) headers['X-Goog-Visitor-Id'] = visitor;
    const auth = await authHeader();
    if (auth) headers.Authorization = auth;
    const key = cfg('INNERTUBE_API_KEY');
    const res = await fetch(`/youtubei/v1/${endpoint}?prettyPrint=false${key ? `&key=${key}` : ''}`, {
      method: 'POST',
      credentials: 'include',
      headers,
      body: JSON.stringify({ context: cfg('INNERTUBE_CONTEXT'), ...body }),
    });
    if (!res.ok) throw new Error(`${endpoint}: HTTP ${res.status}`);
    return res.json();
  }

  // Start playing through YouTube Music's own router, so its queue, radio and history all work
  // exactly as if the user had clicked the item. Returns false if the app is not ready to route.
  function navigate(play) {
    const app = document.querySelector('ytmusic-app');
    if (!app) return false;
    const endpoint = play.videoId
      ? { watchEndpoint: { videoId: play.videoId, playlistId: play.playlistId, params: play.params } }
      : { watchPlaylistEndpoint: { playlistId: play.playlistId, params: play.params } };
    app.dispatchEvent(new CustomEvent('yt-navigate', { bubbles: true, composed: true, detail: { endpoint } }));
    return true;
  }

  function click(selectors) {
    for (const s of selectors) {
      const el = document.querySelector(s);
      if (el) { el.click(); return true; }
    }
    return false;
  }

  function likeStatus() {
    const el = bar()?.querySelector('ytmusic-like-button-renderer');
    return el?.getAttribute('like-status') ?? null; // LIKE | DISLIKE | INDIFFERENT
  }

  const commands = {
    toggle() { const p = player(); if (!p) return; p.getPlayerState() === 1 ? p.pauseVideo() : p.playVideo(); },
    play() { player()?.playVideo(); },
    pause() { player()?.pauseVideo(); },
    next() { click(['ytmusic-player-bar .next-button', 'ytmusic-player-bar tp-yt-paper-icon-button.next-button']) || player()?.nextVideo(); },
    previous() { click(['ytmusic-player-bar .previous-button']) || player()?.previousVideo(); },
    seek(seconds) { player()?.seekTo(Math.max(0, seconds), true); },
    volume(v) { const p = player(); if (!p) return; p.unMute?.(); p.setVolume(Math.round(Math.min(100, Math.max(0, v)))); },
    like() {
      const r = bar()?.querySelector('ytmusic-like-button-renderer');
      if (!r) return;
      const btn = r.querySelector('#button-shape-like button, #button-shape-like, .like');
      btn?.click();
    },
  };

  // Nobody sees this page's video, so ask for the smallest stream once per song (less decoding;
  // the audio quality does not depend on it).
  let lowFor = null;
  function lowVideo(p, id) {
    if (!id || id === lowFor) return;
    lowFor = id;
    try { p.setPlaybackQualityRange?.('tiny', 'tiny'); p.setPlaybackQuality?.('tiny'); } catch { /* player API changed: harmless */ }
  }

  function state() {
    const p = player();
    const meta = navigator.mediaSession?.metadata;
    const data = p?.getVideoData?.() ?? {};
    if (p) lowVideo(p, data.video_id);
    // During an ad, media session metadata describes the ad, so leave the song fields empty.
    const ad = !!document.querySelector('#movie_player.ad-showing, .ytp-ad-player-overlay');
    const song = ad ? null : meta;
    const art = song?.artwork?.length ? song.artwork[song.artwork.length - 1].src : null;
    return {
      signedIn: !!cfg('LOGGED_IN'),
      ready: !!p,
      videoId: data.video_id || null,
      title: ad ? null : song?.title || data.title || null,
      artist: ad ? null : song?.artist || data.author || null,
      album: song?.album || null,
      art,
      // -1 unstarted, 0 ended, 1 playing, 2 paused, 3 buffering, 5 cued
      playerState: p?.getPlayerState?.() ?? -1,
      position: p?.getCurrentTime?.() ?? 0,
      duration: p?.getDuration?.() ?? 0,
      volume: p?.getVolume?.() ?? 100,
      muted: p?.isMuted?.() ?? false,
      like: likeStatus(),
      adPlaying: ad,
    };
  }

  window.__cadence = { api, navigate, state, command: (name, arg) => commands[name]?.(arg) };
})();
