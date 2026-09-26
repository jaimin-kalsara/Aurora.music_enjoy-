// High-level, cached catalog access on top of the YouTube Music client. Routes and the
// recommendation engine both read from here so upstream calls are shared and deduplicated.
import * as yt from './ytmusic.js';
import { cached, TTL } from './cache.js';
import {
  normalizeAny,
  normalizeSong,
  normalizeTrackInfo,
  normalizeAlbum,
  normalizeAlbumPage,
  normalizePlaylist,
  normalizePlaylistPage,
  normalizeArtistCard,
  normalizeArtistPage,
  normalizeSection,
  decode,
} from './normalize.js';
import { LANGUAGE_CATEGORIES } from './moods.js';

const notFound = (msg) => Object.assign(new Error(msg), { status: 404 });
const uniqBy = (list, key = (x) => x.id) => {
  const seen = new Set();
  return list.filter((x) => {
    if (!x) return false;
    const k = key(x);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
};
const title = (s) => decode(s?.header?.title?.toString?.() || s?.title?.toString?.() || '').trim();

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (i < items.length) {
        const idx = i++;
        out[idx] = await fn(items[idx], idx).catch(() => null);
      }
    }),
  );
  return out;
}

/* ------------------------------------------------------------------ songs */

/** Full song models for ids (e.g. from autocomplete or the library). */
export async function getSongs(ids) {
  const list = await mapLimit(ids, 4, (id) =>
    cached(`song:${id}`, TTL.long, async () => {
      try {
        const panel = await yt.upNext(id, false);
        const item = (panel.contents || []).find((c) => c.video_id === id || c.selected) || panel.contents?.[0];
        const song = item ? normalizeSong(item) : null;
        if (song && song.id === id) return song;
      } catch {
        /* fall through */
      }
      const info = await yt.trackInfo(id);
      return normalizeTrackInfo(info);
    }),
  );
  return list.filter(Boolean);
}

/* ----------------------------------------------------------------- search */

const bucket = (r) => ({ total: r.total, results: r.results, lastPage: r.lastPage });

export const searchSongs = (q, page = 1, limit = 20) =>
  cached(`s:songs:${q}:${page}:${limit}`, TTL.short, async () => {
    const r = await yt.searchPaged(q, 'songs', page, limit);
    return bucket({ ...r, results: r.results.map(normalizeSong).filter(Boolean) });
  });
export const searchAlbums = (q, page = 1, limit = 20) =>
  cached(`s:albums:${q}:${page}:${limit}`, TTL.short, async () => {
    const r = await yt.searchPaged(q, 'albums', page, limit);
    return bucket({ ...r, results: r.results.map(normalizeAlbum).filter(Boolean) });
  });
export const searchArtists = (q, page = 1, limit = 20) =>
  cached(`s:artists:${q}:${page}:${limit}`, TTL.short, async () => {
    const r = await yt.searchPaged(q, 'artists', page, limit);
    return bucket({ ...r, results: r.results.map(normalizeArtistCard).filter(Boolean) });
  });
export const searchPlaylists = (q, page = 1, limit = 20) =>
  cached(`s:playlists:${q}:${page}:${limit}`, TTL.short, async () => {
    const r = await yt.searchPaged(q, 'playlists', page, limit);
    return bucket({ ...r, results: r.results.map(normalizePlaylist).filter(Boolean) });
  });

/** One-shot search across every category, plus YouTube's own "top result" card. */
export const searchAll = (q) =>
  cached(`s:all:${q}`, TTL.short, async () => {
    const [res, songBucket] = await Promise.all([yt.search(q, 'all'), searchSongs(q, 1, 12).catch(() => ({ results: [] }))]);
    const shelves = res.contents || [];
    let top = null;
    const items = [];
    // The unfiltered page mixes a "top result" card, item sections and titled shelves.
    for (const shelf of shelves) {
      if (shelf.type === 'MusicCardShelf') {
        const id = shelf.on_tap?.payload?.browseId || shelf.on_tap?.payload?.videoId;
        top = normalizeAny({ id, title: shelf.title, subtitle: shelf.subtitle, thumbnail: shelf.thumbnail, endpoint: shelf.on_tap });
        for (const node of shelf.contents || []) items.push(normalizeAny(node));
      } else {
        for (const node of shelf.contents || []) items.push(normalizeAny(node));
      }
    }
    const list = uniqBy(items.filter(Boolean), (e) => `${e.type}:${e.id}`);
    const of = (type) => list.filter((e) => e.type === type);
    const out = {
      query: q,
      top,
      songs: { total: 0, results: of('song') },
      albums: { total: 0, results: of('album') },
      artists: { total: 0, results: of('artist') },
      playlists: { total: 0, results: of('playlist') },
    };
    // Proper songs first (from the song-filtered search), then mixed results, then music videos.
    const mixed = of('song');
    out.songs.results = uniqBy([
      ...(top && top.type === 'song' ? [top] : []),
      ...songBucket.results,
      ...mixed.filter((s) => !s.isVideo),
      ...mixed.filter((s) => s.isVideo),
    ]).slice(0, 24);
    for (const k of ['songs', 'albums', 'artists', 'playlists']) out[k].total = out[k].results.length + (out[k].results.length >= 3 ? 40 : 0);
    return out;
  });

export const getSuggestions = (q) =>
  cached(`suggest:${q}`, TTL.short, async () => {
    const sections = await yt.suggest(q);
    const terms = [];
    const items = [];
    for (const section of sections || []) {
      for (const node of section.contents || []) {
        if (node.type === 'SearchSuggestion') terms.push(node.suggestion?.toString() || '');
        else {
          const e = normalizeAny(node);
          if (e) items.push(e);
        }
      }
    }
    return {
      top: items[0] || null,
      terms: terms.filter(Boolean).slice(0, 6),
      songs: items.filter((i) => i.type === 'song'),
      albums: items.filter((i) => i.type === 'album'),
      artists: items.filter((i) => i.type === 'artist'),
      playlists: items.filter((i) => i.type === 'playlist'),
    };
  });

/* --------------------------------------------------------------- entities */

export const getAlbum = (id) =>
  cached(`album:${id}`, TTL.long, async () => {
    const page = await yt.album(id);
    const album = normalizeAlbumPage(page, id);
    if (!album) throw notFound('Album not found');
    return album;
  });

export const getPlaylist = (id, limit = 200) =>
  cached(`playlist:${id}:${limit}`, TTL.medium, async () => {
    const { page, items } = await yt.playlist(id, limit);
    const pl = normalizePlaylistPage(page, items, id);
    if (!pl) throw notFound('Playlist not found');
    return pl;
  });

export const getArtist = (id) =>
  cached(`artist:${id}`, TTL.long, async () => {
    const page = await yt.artist(id);
    const artist = normalizeArtistPage(page, id);
    if (!artist) throw notFound('Artist not found');
    return artist;
  });

export const getArtistSongs = (id) =>
  cached(`artist-songs:${id}`, TTL.long, async () => {
    const shelf = await yt.artistAllSongs(id);
    return (shelf?.contents || []).map(normalizeSong).filter(Boolean);
  });

/* ------------------------------------------------------------- discovery */

const categoryParams = () =>
  cached('mood-categories', TTL.long, async () => {
    const list = await yt.moodCategories();
    const map = new Map();
    for (const c of list) map.set(c.title.toLowerCase(), c.params);
    return map;
  });

/** Sections of a YouTube Music mood/genre category page (by category name). */
export async function getCategory(name) {
  const params = (await categoryParams()).get(String(name).toLowerCase());
  if (!params) return null;
  return cached(`category:${params}`, TTL.medium, async () => {
    const { carousels, grids } = await yt.moodCategory(params);
    const sections = [];
    for (const c of carousels) {
      const s = normalizeSection(c, `${name}-`);
      if (s) sections.push(s);
    }
    for (const g of grids) {
      const items = (g.items || []).map(normalizeAny).filter(Boolean);
      if (items.length) sections.push({ id: `${name}-grid`, title: title(g.header) || name, kind: 'mixed', items });
    }
    return { name, sections };
  });
}

export const getCharts = () =>
  cached('charts', TTL.medium, async () => {
    const { carousels } = await yt.charts();
    const playlists = [];
    const artists = [];
    for (const c of carousels) {
      const items = (c.contents || []).map(normalizeAny).filter(Boolean);
      playlists.push(...items.filter((i) => i.type === 'playlist'));
      artists.push(...items.filter((i) => i.type === 'artist'));
    }
    return { playlists: uniqBy(playlists), artists: uniqBy(artists) };
  });

export const getNewReleases = () =>
  cached('new-releases', TTL.medium, async () => {
    const { carousels, grids } = await yt.newReleases();
    const albums = [];
    const videos = [];
    const playlists = [];
    for (const c of carousels) {
      const items = (c.contents || []).map(normalizeAny).filter(Boolean);
      albums.push(...items.filter((i) => i.type === 'album'));
      videos.push(...items.filter((i) => i.type === 'song'));
      playlists.push(...items.filter((i) => i.type === 'playlist'));
    }
    for (const g of grids) playlists.push(...(g.items || []).map(normalizePlaylist).filter(Boolean));
    return { albums: uniqBy(albums), videos: uniqBy(videos), playlists: uniqBy(playlists) };
  });

export const getTrending = () =>
  cached('trending', TTL.medium, async () => {
    const ex = await yt.explore();
    const section = (ex.sections || []).find((s) => /trending/i.test(title(s)));
    const items = (section?.contents || []).map(normalizeSong).filter(Boolean);
    return items;
  });

/** Songs + playlists for a language, from its genre category page. */
export const getLanguage = (lang) =>
  cached(`language:${lang}`, TTL.medium, async () => {
    const category = LANGUAGE_CATEGORIES[lang];
    if (!category) return { songs: [], playlists: [] };
    const data = await getCategory(category).catch(() => null);
    if (!data) return { songs: [], playlists: [] };
    const songs = [];
    const playlists = [];
    for (const s of data.sections) {
      songs.push(...s.items.filter((i) => i.type === 'song'));
      playlists.push(...s.items.filter((i) => i.type === 'playlist'));
    }
    return { category, songs: uniqBy(songs), playlists: uniqBy(playlists) };
  });

/** Home page: language picks, YouTube Music's feed, new releases and charts. */
export const getHome = (languages) =>
  cached(`home:${languages}`, TTL.medium, async () => {
    const langs = String(languages).split(',').filter(Boolean).slice(0, 3);
    const [feed, langData, fresh, charts] = await Promise.all([
      yt.homeFeed().catch(() => []),
      Promise.all(langs.map((l) => getLanguage(l).catch(() => ({ songs: [], playlists: [] })))),
      getNewReleases().catch(() => ({ albums: [], videos: [], playlists: [] })),
      getCharts().catch(() => ({ playlists: [], artists: [] })),
    ]);
    const sections = [];
    const push = (id, t, items, kind = 'mixed') => {
      if (items && items.length >= 3) sections.push({ id, title: t, kind, items: items.slice(0, 30) });
    };
    const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
    langs.forEach((l, i) => push(`lang-${l}-songs`, `Top ${cap(l)} songs`, langData[i].songs, 'song'));
    for (const section of feed) {
      if (section.type !== 'MusicCarouselShelf') continue;
      const s = normalizeSection(section, 'feed-');
      if (s) sections.push(s);
    }
    push('new-releases', 'New releases', fresh.albums, 'album');
    push('charts', 'Charts', charts.playlists, 'playlist');
    langs.forEach((l, i) => push(`lang-${l}-playlists`, `${cap(l)} playlists`, langData[i].playlists, 'playlist'));
    push('new-videos', 'New music videos', fresh.videos, 'song');
    push('top-artists', 'Top artists', charts.artists, 'artist');
    return { languages, sections: uniqBy(sections, (s) => s.id) };
  });

/** Mood page data: playlists from the matching YouTube Music category, songs expanded from them. */
export const getMood = (mood) =>
  cached(`mood:${mood.key}`, TTL.medium, async () => {
    let songs = [];
    let playlists = [];
    for (const name of mood.categories) {
      const data = await getCategory(name).catch(() => null);
      if (!data) continue;
      for (const s of data.sections) {
        songs.push(...s.items.filter((i) => i.type === 'song'));
        playlists.push(...s.items.filter((i) => i.type === 'playlist'));
      }
      if (playlists.length >= 6) break;
    }
    if (playlists.length < 4) {
      const found = await Promise.all(mood.queries.map((q) => searchPlaylists(q, 1, 8).catch(() => ({ results: [] }))));
      for (const f of found) playlists.push(...f.results);
    }
    playlists = uniqBy(playlists);
    songs = uniqBy(songs);
    // Expand the queue from the first playlists so a mood is a long, continuous session.
    for (const p of playlists.slice(0, 3)) {
      if (songs.length >= 60) break;
      const full = await getPlaylist(p.id, 50).catch(() => null);
      if (full) songs.push(...full.songs);
      songs = uniqBy(songs);
    }
    if (songs.length < 20) {
      const extra = await searchSongs(mood.queries[0], 1, 20).catch(() => ({ results: [] }));
      songs = uniqBy([...songs, ...extra.results]);
    }
    return { songs: songs.slice(0, 80), playlists: playlists.slice(0, 12) };
  });

/** Related songs for autoplay / radio, seeded by a track. */
export const getRadio = (id, limit = 30) =>
  cached(`radio:${id}`, TTL.medium, async () => {
    const list = [];
    try {
      const panel = await yt.upNext(id, true);
      list.push(...(panel.contents || []).map(normalizeSong).filter(Boolean));
    } catch {
      /* fall through */
    }
    if (list.length < 10) {
      try {
        const rel = await yt.related(id);
        for (const s of rel?.contents || []) list.push(...(s.contents || []).map(normalizeSong).filter(Boolean));
      } catch {
        /* ignore */
      }
    }
    return uniqBy(list)
      .filter((s) => s.id !== id)
      .slice(0, limit);
  });

export { uniqBy };

/** Embeddable stand-ins for a track whose owner blocks the YouTube embed player. */
export const getAlternates = (id, query, duration) =>
  cached(`alt:${id}`, TTL.long, () => yt.alternates(query, id, duration));
