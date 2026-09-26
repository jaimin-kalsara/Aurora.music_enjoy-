import { Router } from 'express';
import * as catalog from './catalog.js';
import { getLyrics } from './lyrics.js';
import { MOODS, findMood } from './moods.js';
import {
  getForYouRecommendations,
  getDiscoverWeekly,
  getDailyMixes,
  getSmartRadio,
  getTrendingRecommendations,
  recordPlay,
  recordSkip,
  recordLike,
  recordUnlike,
  getUserProfile,
} from './recommendations.js';

const router = Router();

export const DEFAULT_LANGUAGES = 'hindi,english';
const LANG_RE = /^[a-z]+(,[a-z]+)*$/i;
function languagesOf(req) {
  const lang = String(req.query.lang || '').toLowerCase();
  return LANG_RE.test(lang) ? lang : DEFAULT_LANGUAGES;
}
const clamp = (v, min, max, fallback) => {
  const n = parseInt(v, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
};
const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);
const VIDEO_ID = /^[\w-]{11}$/;
const BROWSE_ID = /^[\w-]{6,80}$/;

router.get('/health', (_req, res) => res.json({ ok: true, source: 'youtube-music', time: new Date().toISOString() }));

/* ------------------------------------------------------------------ home */
router.get(
  '/home',
  wrap(async (req, res) => {
    res.json(await catalog.getHome(languagesOf(req)));
  }),
);

router.get(
  '/trending',
  wrap(async (req, res) => {
    const type = req.query.type;
    if (type === 'album') {
      const fresh = await catalog.getNewReleases();
      return res.json({ items: fresh.albums });
    }
    if (type === 'playlist') {
      const charts = await catalog.getCharts();
      return res.json({ items: charts.playlists });
    }
    const langs = languagesOf(req).split(',').slice(0, 2);
    const [trending, ...langData] = await Promise.all([catalog.getTrending().catch(() => []), ...langs.map((l) => catalog.getLanguage(l).catch(() => ({ songs: [] })))]);
    const items = catalog.uniqBy([...langData.flatMap((d) => d.songs.slice(0, 15)), ...trending]);
    res.json({ items });
  }),
);

router.get(
  '/charts',
  wrap(async (_req, res) => {
    const charts = await catalog.getCharts();
    res.json({ items: charts.playlists, artists: charts.artists });
  }),
);

router.get(
  '/new-releases',
  wrap(async (req, res) => {
    const fresh = await catalog.getNewReleases();
    const page = clamp(req.query.page, 1, 50, 1);
    const limit = clamp(req.query.limit, 1, 50, 30);
    const all = [...fresh.albums, ...fresh.playlists];
    res.json({ page, lastPage: page * limit >= all.length, items: all.slice((page - 1) * limit, page * limit), videos: fresh.videos });
  }),
);

/* ---------------------------------------------------------------- search */
router.get(
  '/search/suggest',
  wrap(async (req, res) => {
    const q = String(req.query.q || '').trim();
    if (q.length < 1) return res.json({ top: null, terms: [], songs: [], albums: [], artists: [], playlists: [] });
    res.json(await catalog.getSuggestions(q));
  }),
);

router.get(
  '/search',
  wrap(async (req, res) => {
    const q = String(req.query.q || '').trim().slice(0, 200);
    const type = String(req.query.type || 'all');
    const page = clamp(req.query.page, 1, 100, 1);
    const limit = clamp(req.query.limit, 1, 50, 20);
    if (!q) return res.json({ query: q, top: null, songs: { total: 0, results: [] }, albums: { total: 0, results: [] }, artists: { total: 0, results: [] }, playlists: { total: 0, results: [] } });
    if (type === 'songs') return res.json({ query: q, page, songs: await catalog.searchSongs(q, page, limit) });
    if (type === 'albums') return res.json({ query: q, page, albums: await catalog.searchAlbums(q, page, limit) });
    if (type === 'artists') return res.json({ query: q, page, artists: await catalog.searchArtists(q, page, limit) });
    if (type === 'playlists') return res.json({ query: q, page, playlists: await catalog.searchPlaylists(q, page, limit) });
    res.json(await catalog.searchAll(q));
  }),
);

/* -------------------------------------------------------------- entities */
router.get(
  '/songs/:ids',
  wrap(async (req, res) => {
    const ids = String(req.params.ids)
      .split(',')
      .map((s) => s.trim())
      .filter((s) => VIDEO_ID.test(s))
      .slice(0, 50);
    const songs = await catalog.getSongs(ids);
    if (!songs.length) return res.status(404).json({ error: 'Song not found' });
    res.json({ songs });
  }),
);

router.get(
  '/albums/:id',
  wrap(async (req, res) => {
    if (!BROWSE_ID.test(req.params.id)) return res.status(400).json({ error: 'Invalid album id' });
    res.json(await catalog.getAlbum(req.params.id));
  }),
);

router.get(
  '/playlists/:id',
  wrap(async (req, res) => {
    if (!BROWSE_ID.test(req.params.id)) return res.status(400).json({ error: 'Invalid playlist id' });
    const limit = clamp(req.query.limit, 1, 500, 200);
    res.json(await catalog.getPlaylist(req.params.id, limit));
  }),
);

router.get(
  '/artists/:id',
  wrap(async (req, res) => {
    if (!BROWSE_ID.test(req.params.id)) return res.status(400).json({ error: 'Invalid artist id' });
    res.json(await catalog.getArtist(req.params.id));
  }),
);

router.get(
  '/artists/:id/songs',
  wrap(async (req, res) => {
    if (!BROWSE_ID.test(req.params.id)) return res.status(400).json({ error: 'Invalid artist id' });
    const page = clamp(req.query.page, 0, 100, 0);
    const size = 40;
    const all = await catalog.getArtistSongs(req.params.id);
    const songs = all.slice(page * size, (page + 1) * size);
    res.json({ page, songs, lastPage: (page + 1) * size >= all.length });
  }),
);

/* ---------------------------------------------------------------- lyrics */
router.get(
  '/lyrics/:id',
  wrap(async (req, res) => {
    const id = String(req.params.id);
    if (!VIDEO_ID.test(id)) return res.status(400).json({ error: 'Invalid track id' });
    let meta = { title: req.query.title, artist: req.query.artist, album: req.query.album, duration: req.query.duration };
    if (!meta.title) {
      const [song] = await catalog.getSongs([id]).catch(() => []);
      if (song) meta = { title: song.title, artist: song.artistNames, album: song.album.name, duration: song.duration };
    }
    const data = await getLyrics({ id, ...meta });
    if (!data) return res.status(404).json({ error: 'No lyrics available' });
    res.set('Cache-Control', 'public, max-age=86400');
    res.json(data);
  }),
);

/** Related songs for autoplay. */
router.get(
  '/radio/:id',
  wrap(async (req, res) => {
    if (!VIDEO_ID.test(req.params.id)) return res.status(400).json({ error: 'Invalid track id' });
    res.json({ songs: await catalog.getRadio(req.params.id, clamp(req.query.limit, 1, 60, 30)) });
  }),
);

/* ----------------------------------------------------------------- moods */
/* ------------------------------------------------------------ alternates */
router.get(
  '/alternates/:id',
  wrap(async (req, res) => {
    const id = String(req.params.id);
    const q = String(req.query.q || '').trim().slice(0, 200);
    if (!VIDEO_ID.test(id) || !q) return res.status(400).json({ error: 'Invalid request' });
    res.json({ ids: await catalog.getAlternates(id, q, clamp(req.query.d, 0, 36000, 0)) });
  }),
);

router.get('/moods', (_req, res) => res.json({ moods: MOODS }));

router.get(
  '/moods/:key',
  wrap(async (req, res) => {
    const mood = findMood(req.params.key);
    if (!mood) return res.status(404).json({ error: 'Unknown mood' });
    const data = await catalog.getMood(mood);
    res.json({ mood, ...data });
  }),
);

/* -------------------------------------------------------- recommendations */
const sessionOf = (req) => String(req.headers['x-session-id'] || req.ip || 'anonymous').slice(0, 80);

router.get(
  '/recommendations/for-you',
  wrap(async (req, res) => {
    res.json({ tracks: await getForYouRecommendations(sessionOf(req), languagesOf(req), clamp(req.query.limit, 1, 50, 30)) });
  }),
);

router.get(
  '/recommendations/discover-weekly',
  wrap(async (req, res) => {
    const tracks = await getDiscoverWeekly(sessionOf(req), languagesOf(req), clamp(req.query.limit, 1, 50, 30));
    res.json({ tracks, updatedAt: getUserProfile(sessionOf(req)).discoverWeekly.generatedAt });
  }),
);

router.get(
  '/recommendations/daily-mixes',
  wrap(async (req, res) => {
    res.json({ mixes: await getDailyMixes(sessionOf(req), languagesOf(req), clamp(req.query.limit, 1, 10, 6)) });
  }),
);

router.get(
  '/recommendations/trending',
  wrap(async (req, res) => {
    res.json({ tracks: await getTrendingRecommendations(languagesOf(req), clamp(req.query.limit, 1, 50, 30)) });
  }),
);

router.get(
  '/radio/smart/:seedId',
  wrap(async (req, res) => {
    if (!VIDEO_ID.test(req.params.seedId)) return res.status(400).json({ error: 'Invalid track id' });
    res.json({ tracks: await getSmartRadio(req.params.seedId, languagesOf(req), sessionOf(req), clamp(req.query.limit, 1, 50, 30)) });
  }),
);

const feedback = (fn) =>
  wrap(async (req, res) => {
    const trackId = String(req.body?.trackId || '');
    if (!VIDEO_ID.test(trackId)) return res.status(400).json({ error: 'trackId required' });
    fn(sessionOf(req), trackId, req.body?.metadata || {});
    res.json({ ok: true });
  });
router.post('/feedback/play', feedback(recordPlay));
router.post('/feedback/skip', feedback(recordSkip));
router.post('/feedback/like', feedback(recordLike));
router.post('/feedback/unlike', feedback(recordUnlike));

export default router;
