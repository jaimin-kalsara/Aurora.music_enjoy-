// Turn the loosely-typed upstream payloads into small, predictable models the client can rely on.
import { decryptMediaUrl, buildStreams } from './saavn.js';

const ENTITIES = { '&quot;': '"', '&amp;': '&', '&#039;': "'", '&apos;': "'", '&lt;': '<', '&gt;': '>', '&nbsp;': ' ' };
export function decode(text) {
  if (text === undefined || text === null) return '';
  return String(text).replace(/&(quot|amp|#039|apos|lt|gt|nbsp);/g, (m) => ENTITIES[m] ?? m);
}

/** Upgrade any thumbnail size suffix to 500x500 and force https. */
export function bigImage(url) {
  if (!url) return '';
  return String(url)
    .replace(/^http:\/\//, 'https://')
    .replace(/-(50x50|150x150)(\.[a-z]+)/i, '-500x500$2');
}

const toInt = (v) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : 0;
};

function artistsFromMap(map, fallbackSubtitle = '') {
  const list = [];
  const seen = new Set();
  const push = (a) => {
    const name = a ? decode(a.name).trim() : ''; // upstream sometimes pads names with a leading space
    if (!name || seen.has(a.id || name)) return;
    seen.add(a.id || name);
    list.push({ id: a.id || '', name, image: bigImage(a.image), role: a.role || '' });
  };
  if (map) {
    (map.primary_artists || []).forEach(push);
    (map.featured_artists || []).forEach(push);
    if (list.length === 0) (map.artists || []).filter((a) => a.role === 'singer' || a.role === 'music').forEach(push);
  }
  if (list.length === 0 && fallbackSubtitle) {
    decode(fallbackSubtitle)
      .split(' - ')[0]
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 4)
      .forEach((name) => push({ id: '', name }));
  }
  return list;
}

export function normalizeSong(raw) {
  if (!raw) return null;
  const info = raw.more_info || {};
  const has320 = String(info['320kbps']) === 'true';
  const decrypted = decryptMediaUrl(info.encrypted_media_url);
  const artists = artistsFromMap(info.artistMap, raw.subtitle);
  return {
    id: raw.id,
    type: 'song',
    title: decode(raw.title || raw.song),
    subtitle: decode(raw.subtitle || artists.map((a) => a.name).join(', ')),
    artists,
    artistNames: artists.map((a) => a.name).join(', ') || decode(raw.subtitle).split(' - ')[0],
    album: { id: info.album_id || raw.albumid || '', name: decode(info.album || raw.album) },
    image: bigImage(raw.image),
    duration: toInt(info.duration || raw.duration),
    year: toInt(raw.year),
    language: raw.language || '',
    playCount: toInt(raw.play_count),
    explicit: String(raw.explicit_content) === '1',
    hasLyrics: String(info.has_lyrics) === 'true',
    label: decode(info.label),
    url: raw.perma_url || '',
    streams: buildStreams(decrypted, has320),
  };
}

export function normalizeAlbum(raw) {
  if (!raw) return null;
  const info = raw.more_info || {};
  const artists = artistsFromMap(info.artistMap, raw.subtitle);
  const songs = Array.isArray(raw.list) ? raw.list.map(normalizeSong).filter(Boolean) : [];
  return {
    id: raw.id || raw.albumid,
    type: 'album',
    title: decode(raw.title || raw.name),
    subtitle: decode(raw.subtitle || artists.map((a) => a.name).join(', ')),
    artists,
    image: bigImage(raw.image),
    year: toInt(raw.year),
    language: raw.language || '',
    songCount: toInt(info.song_count || raw.list_count) || songs.length,
    url: raw.perma_url || '',
    songs,
  };
}

export function normalizePlaylist(raw) {
  if (!raw) return null;
  const info = raw.more_info || {};
  const songs = Array.isArray(raw.list) ? raw.list.map(normalizeSong).filter(Boolean) : [];
  return {
    id: raw.id || raw.listid,
    type: 'playlist',
    title: decode(raw.title || raw.listname),
    subtitle: decode(raw.subtitle || info.firstname || ''),
    image: bigImage(raw.image),
    songCount: toInt(raw.list_count || info.song_count || raw.count) || songs.length,
    followers: toInt(info.follower_count),
    description: decode(raw.header_desc || ''),
    url: raw.perma_url || '',
    songs,
  };
}

export function normalizeArtistCard(raw) {
  if (!raw) return null;
  return {
    id: raw.id || raw.artistId,
    type: 'artist',
    title: decode(raw.name || raw.title),
    subtitle: decode(raw.role || raw.subtitle || 'Artist'),
    image: bigImage(raw.image),
    url: raw.perma_url || '',
  };
}

export function normalizeArtist(raw) {
  if (!raw) return null;
  let bio = '';
  try {
    const parsed = typeof raw.bio === 'string' ? JSON.parse(raw.bio) : raw.bio;
    if (Array.isArray(parsed)) bio = parsed.map((p) => decode(p.text)).join('\n\n');
  } catch {
    bio = decode(raw.bio);
  }
  return {
    id: raw.artistId || raw.id,
    type: 'artist',
    title: decode(raw.name),
    subtitle: decode(raw.subtitle || 'Artist'),
    image: bigImage(raw.image),
    followers: toInt(raw.follower_count),
    fans: toInt(raw.fan_count),
    verified: Boolean(raw.isVerified),
    language: raw.dominantLanguage || '',
    bio,
    url: (raw.urls && raw.urls.overview) || '',
    topSongs: (raw.topSongs || []).map(normalizeSong).filter(Boolean),
    topAlbums: (raw.topAlbums || []).map(normalizeAlbum).filter(Boolean),
    singles: (raw.singles || []).map(normalizeSong).filter(Boolean),
    latestRelease: (raw.latest_release || [])
      .map((r) => (r.type === 'song' ? normalizeSong(r) : normalizeAlbum(r)))
      .filter(Boolean),
    similarArtists: (raw.similarArtists || []).map(normalizeArtistCard).filter(Boolean),
    playlists: [raw.dedicated_artist_playlist, raw.featured_artist_playlist]
      .flat()
      .filter(Boolean)
      .map(normalizePlaylist),
  };
}

/** Normalize any mixed entity (home rows contain songs, albums, playlists and radio stations). */
export function normalizeAny(raw) {
  if (!raw || !raw.type) return null;
  switch (raw.type) {
    case 'song':
      return normalizeSong(raw);
    case 'album':
      return normalizeAlbum(raw);
    case 'playlist':
      return normalizePlaylist(raw);
    case 'artist':
      return normalizeArtistCard(raw);
    case 'radio_station': {
      const info = raw.more_info || {};
      if (info.featured_station_type === 'artist') {
        return normalizeArtistCard({ id: raw.id, name: raw.title, image: raw.image, perma_url: raw.perma_url, role: 'Artist' });
      }
      return null;
    }
    default:
      return null;
  }
}
