// YouTube Music client built on youtubei.js (InnerTube). Everything upstream goes through here.
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Innertube, UniversalCache, Log, Platform } from 'youtubei.js';
import { createPoTokenMinter } from './potoken.js';

Log.setLevel(Log.Level.ERROR);

// youtubei.js needs a JS evaluator to run YouTube's signature/throttling transforms.
// Run the extracted player snippet in an isolated VM context with a hard timeout.
Platform.shim.eval = async (data) => {
  const script = new vm.Script(`(function () {\n${data.output}\n})()`);
  return script.runInNewContext(
    { URL, URLSearchParams, encodeURIComponent, decodeURIComponent, console: { log() {}, warn() {}, error() {} } },
    { timeout: 8000 },
  );
};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = path.resolve(__dirname, '../.cache/youtubei.js');
export const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36';

// YouTube answers datacenter IPs (Render, Railway, etc.) with "Sign in to confirm you're not a bot".
// Two ways around it, both optional: YT_COOKIE (the Cookie header of a signed-in YouTube session)
// and/or YT_PROXY (an http(s) proxy, ideally residential) for every upstream request.
const COOKIE = process.env.YT_COOKIE?.trim() || undefined;
// undici is only loaded when a proxy is configured, so startup never depends on it.
const undici = process.env.YT_PROXY ? await import('undici') : null;
const proxyAgent = undici ? new undici.ProxyAgent(process.env.YT_PROXY) : null;
const undiciFetch = undici?.fetch;

/** fetch() that goes through YT_PROXY when configured. Used for InnerTube and media requests. */
export const ytFetch = proxyAgent
  ? (input, init = {}) => {
      // youtubei.js hands us Request objects; unpack them so undici can apply the dispatcher.
      if (input instanceof Request) {
        const { url, method, headers, body, signal, redirect } = input;
        return undiciFetch(url, { method, headers, body, signal, redirect, duplex: body ? 'half' : undefined, ...init, dispatcher: proxyAgent });
      }
      return undiciFetch(input, { ...init, dispatcher: proxyAgent });
    }
  : (input, init) => fetch(input, init);

let clientPromise = null;
let refreshTimer = null;
let minter = null; // PO token minter (content-bound tokens for media streams)
const SESSION_OPTS = {
  location: process.env.YT_LOCATION || 'IN',
  lang: process.env.YT_LANG || 'en',
  user_agent: UA,
  cookie: COOKIE,
  fetch: ytFetch,
};

async function createClient() {
  const cache = new UniversalCache(true, CACHE_DIR);
  // Bootstrap session: gives us a visitor id to bind the PO token to.
  const boot = await Innertube.create({ ...SESSION_OPTS, cache, retrieve_player: false, enable_session_cache: false });
  const visitorData = boot.session.context.client.visitorData;
  let poToken;
  let ttlMs = 6 * 60 * 60 * 1000;
  if (process.env.YT_PO_TOKEN && process.env.YT_VISITOR_DATA) {
    poToken = process.env.YT_PO_TOKEN;
    minter = null;
  } else {
    try {
      minter?.shutdown();
      minter = await createPoTokenMinter(boot, visitorData);
      poToken = minter.sessionToken;
      ttlMs = minter.ttlMs;
    } catch (err) {
      minter = null;
      console.error(`[ytmusic] PO token minting failed (streams may be limited): ${err.message}`);
    }
  }
  const yt = await Innertube.create({
    ...SESSION_OPTS,
    cache,
    enable_session_cache: false,
    visitor_data: process.env.YT_VISITOR_DATA || visitorData,
    po_token: poToken,
  });
  // Tokens expire: refresh a little before that, so streams never fall back to the 1 MiB limit.
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => {
    clientPromise = null;
    streamCache.clear();
    getClient().catch(() => undefined);
  }, Math.max(5 * 60 * 1000, ttlMs - 10 * 60 * 1000));
  refreshTimer.unref?.();
  return yt;
}

/** Lazily create a single shared InnerTube session (with a PO token). Recreated on failure. */
export function getClient() {
  if (!clientPromise) {
    clientPromise = createClient().catch((err) => {
      clientPromise = null;
      throw err;
    });
  }
  return clientPromise;
}

const upstream = (message, status = 502) => Object.assign(new Error(message), { status });

/* ------------------------------------------------------------------ browse */

/** Execute a YouTube Music browse request and return the carousels/shelves/grids it contains. */
export async function browse(payload) {
  const yt = await getClient();
  const page = await yt.actions.execute('/browse', { ...payload, client: 'YTMUSIC', parse: true });
  const memo = page.contents_memo;
  return {
    page,
    carousels: memo?.get('MusicCarouselShelf') || [],
    shelves: memo?.get('MusicShelf') || [],
    grids: memo?.get('Grid') || [],
    buttons: memo?.get('MusicNavigationButton') || [],
  };
}

export async function homeFeed() {
  const yt = await getClient();
  const home = await yt.music.getHomeFeed();
  const sections = [...(home.sections || [])];
  // Pull one continuation for a fuller page; it is optional and often empty for anonymous sessions.
  try {
    if (home.has_continuation) {
      const more = await home.getContinuation();
      sections.push(...(more.sections || []));
    }
  } catch {
    /* ignore */
  }
  return sections;
}

export async function explore() {
  const yt = await getClient();
  return yt.music.getExplore();
}

export const charts = () => browse({ browseId: 'FEmusic_charts' });
export const newReleases = () => browse({ browseId: 'FEmusic_new_releases' });

/** Moods & genres category buttons: [{ title, params }]. */
export async function moodCategories() {
  const ex = await explore();
  const section = (ex.sections || []).find((s) => (s.contents || []).some((c) => c.type === 'MusicNavigationButton'));
  if (!section) return [];
  return section.contents
    .filter((c) => c.type === 'MusicNavigationButton' && c.endpoint?.payload?.params)
    .map((c) => ({ title: String(c.button_text || '').trim(), params: c.endpoint.payload.params }));
}

export const moodCategory = (params) => browse({ browseId: 'FEmusic_moods_and_genres_category', params });

/* ------------------------------------------------------------------ search */

const TYPE_MAP = { songs: 'song', albums: 'album', artists: 'artist', playlists: 'playlist', videos: 'video' };

export async function search(query, type = 'all') {
  const yt = await getClient();
  const filters = type === 'all' ? {} : { type: TYPE_MAP[type] || type };
  return yt.music.search(query, filters);
}

/** Paged search over YouTube's continuation tokens. Pages are 1-based. */
const pagedSearches = new Map();
export async function searchPaged(query, type, page = 1, limit = 20) {
  const key = `${type}:${query.toLowerCase()}`;
  let state = pagedSearches.get(key);
  if (!state || Date.now() - state.time > 10 * 60 * 1000) {
    const result = await search(query, type);
    const bucket = result[type];
    state = { time: Date.now(), items: [...(bucket?.contents || [])], cursor: result, done: !result.has_continuation };
    pagedSearches.set(key, state);
    if (pagedSearches.size > 300) pagedSearches.delete(pagedSearches.keys().next().value);
  }
  const need = page * limit;
  let guard = 0;
  while (state.items.length < need && !state.done && guard++ < 6) {
    try {
      const next = await state.cursor.getContinuation();
      const items = next.contents?.contents || next.contents || [];
      state.items.push(...(Array.isArray(items) ? items : []));
      state.cursor = next;
      state.done = !next.has_continuation || items.length === 0;
    } catch {
      state.done = true;
    }
  }
  const results = state.items.slice((page - 1) * limit, page * limit);
  const total = state.done ? state.items.length : state.items.length + limit; // unknown upstream total: keep "load more" alive
  return { total, results, lastPage: state.done && state.items.length <= page * limit };
}

export async function suggest(query) {
  const yt = await getClient();
  return yt.music.getSearchSuggestions(query);
}

/* ------------------------------------------------------------------ entities */

export async function album(id) {
  const yt = await getClient();
  return yt.music.getAlbum(id);
}

export async function artist(id) {
  const yt = await getClient();
  return yt.music.getArtist(id);
}

export async function artistAllSongs(id) {
  const page = await artist(id);
  return page.getAllSongs();
}

export async function playlist(id, maxItems = 200) {
  const yt = await getClient();
  let pl = await yt.music.getPlaylist(id);
  const items = [...(pl.items || [])];
  let guard = 0;
  while (pl.has_continuation && items.length < maxItems && guard++ < 5) {
    try {
      pl = await pl.getContinuation();
      items.push(...(pl.items || []));
    } catch {
      break;
    }
  }
  return { page: pl, items: items.filter((i) => i.type !== 'ContinuationItem') };
}

export async function trackInfo(id) {
  const yt = await getClient();
  return yt.music.getInfo(id);
}

export async function upNext(id, automix = true) {
  const yt = await getClient();
  return yt.music.getUpNext(id, automix);
}

export async function related(id) {
  const yt = await getClient();
  return yt.music.getRelated(id);
}

export async function lyrics(id) {
  const yt = await getClient();
  const shelf = await yt.music.getLyrics(id);
  if (!shelf) return null;
  return { text: shelf.description?.toString() || '', footer: shelf.footer?.toString() || '' };
}

/* ------------------------------------------------------------------ streams */

const OPUS = { high: [251, 250, 249], medium: [250, 251, 249], low: [249, 250, 251] };
const AAC = { high: [140, 139], medium: [140, 139], low: [139, 140] };
const streamCache = new Map(); // id -> { formats, expires }
const STREAM_TTL = 4 * 60 * 60 * 1000;

function audioFormats(info) {
  return (info.streaming_data?.adaptive_formats || []).filter((f) => f.has_audio && !f.has_video && !f.drm_families);
}

async function collectFormats(id) {
  const yt = await getClient();
  const out = new Map();
  const errors = [];
  // Web-based clients need a PO token bound to the video id, otherwise media is cut at ~1 MiB.
  const contentToken = minter ? await minter.mint(id).catch(() => undefined) : undefined;
  for (const client of ['YTMUSIC', 'IOS']) {
    try {
      const webClient = client !== 'IOS';
      const info = await yt.getBasicInfo(id, { client, ...(webClient && contentToken ? { po_token: contentToken } : {}) });
      const status = info.playability_status?.status;
      if (status && status !== 'OK') {
        errors.push(`${client}: ${status} ${info.playability_status?.reason || ''}`.trim());
        continue;
      }
      for (const f of audioFormats(info)) {
        if (out.has(f.itag)) continue;
        try {
          let url = await f.decipher(yt.session.player);
          if (!url) continue;
          if (webClient && contentToken) {
            const u = new URL(url);
            u.searchParams.set('pot', contentToken);
            url = u.toString();
          }
          out.set(f.itag, {
            itag: f.itag,
            url,
            mime: f.mime_type,
            bitrate: Math.round((f.average_bitrate || f.bitrate || 0) / 1000),
            size: f.content_length || 0,
            client,
          });
        } catch (err) {
          errors.push(`${client}#${f.itag}: ${err.message}`);
        }
      }
    } catch (err) {
      errors.push(`${client}: ${err.message}`);
    }
    if (out.size >= 4) break;
  }
  if (!out.size) {
    const message = `Stream unavailable (${errors.join('; ') || 'no audio formats'})`;
    // A bot check is about this server's IP, not the track: every song will fail the same way.
    if (/not a bot|LOGIN_REQUIRED/i.test(message)) throw Object.assign(upstream(message, 503), { code: 'BLOCKED' });
    throw upstream(message, 404);
  }
  return out;
}

/** Resolve a playable audio stream. `fmt` is 'webm' (Opus) or 'm4a' (AAC); quality low|medium|high. */
export async function resolveStream(id, quality = 'high', fmt = 'webm', { force = false } = {}) {
  let hit = streamCache.get(id);
  if (force || !hit || hit.expires < Date.now()) {
    const formats = await collectFormats(id);
    hit = { formats, expires: Date.now() + STREAM_TTL };
    streamCache.set(id, hit);
    if (streamCache.size > 500) streamCache.delete(streamCache.keys().next().value);
  }
  const ladder = fmt === 'm4a' ? [...AAC[quality], ...OPUS[quality]] : [...OPUS[quality], ...AAC[quality]];
  for (const itag of ladder) {
    const f = hit.formats.get(itag);
    if (f) return f;
  }
  return hit.formats.values().next().value;
}

export function invalidateStream(id) {
  streamCache.delete(id);
}
