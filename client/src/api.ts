import type {
  Album,
  ArtistDetail,
  DailyMixesResponse,
  DiscoverWeeklyResponse,
  Entity,
  FeedbackResponse,
  LyricsData,
  Mood,
  Playlist,
  RecommendationResponse,
  SearchResults,
  Section,
  Song,
  Suggestions,
} from './types';
import { useLibrary } from './store/library';

const BASE = '/api';

class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

/** Stable per-browser session id so recommendations can learn from listening. */
export function sessionId(): string {
  try {
    let id = localStorage.getItem('aurora.session');
    if (!id) {
      id = `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
      localStorage.setItem('aurora.session', id);
    }
    return id;
  } catch {
    return 'anonymous';
  }
}

function buildUrl(path: string, params: Record<string, string | number | undefined> = {}) {
  const url = new URL(BASE + path, window.location.origin);
  url.searchParams.set('lang', useLibrary.getState().settings.languages);
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '' && v !== null) url.searchParams.set(k, String(v));
  return url.toString();
}

async function parse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      if (body?.error) message = body.error;
    } catch {
      /* ignore */
    }
    throw new ApiError(message, res.status);
  }
  return (await res.json()) as T;
}

async function get<T>(path: string, params: Record<string, string | number | undefined> = {}, signal?: AbortSignal): Promise<T> {
  const res = await fetch(buildUrl(path, params), { signal, headers: { 'X-Session-Id': sessionId() } });
  return parse<T>(res);
}

async function post<T>(path: string, body: Record<string, unknown>, signal?: AbortSignal): Promise<T> {
  const res = await fetch(buildUrl(path), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Session-Id': sessionId() },
    body: JSON.stringify(body),
    signal,
    keepalive: true,
  });
  return parse<T>(res);
}

export const api = {
  home: (signal?: AbortSignal) => get<{ languages: string; sections: Section[] }>('/home', {}, signal),
  trending: (type: 'song' | 'album' | 'playlist' = 'song') => get<{ items: Entity[] }>('/trending', { type }),
  charts: () => get<{ items: Playlist[]; artists: Entity[] }>('/charts'),
  newReleases: (page = 1, limit = 30) => get<{ items: Entity[]; videos: Song[]; lastPage: boolean }>('/new-releases', { page, limit }),
  search: (q: string, signal?: AbortSignal) => get<SearchResults>('/search', { q }, signal),
  searchType: <T>(q: string, type: 'songs' | 'albums' | 'artists' | 'playlists', page = 1, limit = 30) =>
    get<Record<string, { total: number; results: T[]; lastPage?: boolean }>>('/search', { q, type, page, limit }),
  suggest: (q: string, signal?: AbortSignal) => get<Suggestions>('/search/suggest', { q }, signal),
  songs: (ids: string[]) => get<{ songs: Song[] }>(`/songs/${ids.join(',')}`),
  album: (id: string) => get<Album>(`/albums/${id}`),
  playlist: (id: string, limit = 200) => get<Playlist>(`/playlists/${id}`, { limit }),
  artist: (id: string) => get<ArtistDetail>(`/artists/${id}`),
  artistSongs: (id: string, page = 0) => get<{ songs: Song[]; lastPage: boolean }>(`/artists/${id}/songs`, { page }),
  lyrics: (song: Song, duration?: number, signal?: AbortSignal) =>
    get<LyricsData>(
      `/lyrics/${song.id}`,
      {
        title: song.title,
        artist: song.artistNames || song.subtitle,
        album: song.album?.name || undefined,
        duration: Math.round(duration || song.duration || 0) || undefined,
      },
      signal,
    ),
  radio: (id: string) => get<{ songs: Song[] }>(`/radio/${id}`),
  alternates: (id: string, q: string, d: number) => get<{ ids: string[] }>(`/alternates/${id}`, { q, d: Math.round(d) || undefined }),
  moods: () => get<{ moods: Mood[] }>('/moods'),
  mood: (key: string) => get<{ mood: Mood; songs: Song[]; playlists: Playlist[] }>(`/moods/${key}`),

  // Recommendations
  forYou: (limit = 30, signal?: AbortSignal) => get<RecommendationResponse>('/recommendations/for-you', { limit }, signal),
  discoverWeekly: (limit = 30, signal?: AbortSignal) => get<DiscoverWeeklyResponse>('/recommendations/discover-weekly', { limit }, signal),
  dailyMixes: (limit = 6, signal?: AbortSignal) => get<DailyMixesResponse>('/recommendations/daily-mixes', { limit }, signal),
  smartRadio: (seedId: string, limit = 30, signal?: AbortSignal) => get<RecommendationResponse>(`/radio/smart/${seedId}`, { limit }, signal),
  trendingRecommendations: (limit = 30, signal?: AbortSignal) => get<RecommendationResponse>('/recommendations/trending', { limit }, signal),

  // Feedback
  recordPlay: (trackId: string, metadata?: Record<string, unknown>) => post<FeedbackResponse>('/feedback/play', { trackId, metadata }),
  recordSkip: (trackId: string) => post<FeedbackResponse>('/feedback/skip', { trackId }),
  recordLike: (trackId: string) => post<FeedbackResponse>('/feedback/like', { trackId }),
  recordUnlike: (trackId: string) => post<FeedbackResponse>('/feedback/unlike', { trackId }),
};

export { ApiError };
