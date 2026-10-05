import type {
  Album,
  ArtistDetail,
  DailyMixesResponse,
  DiscoverWeeklyResponse,
  Entity,
  FeedbackResponse,
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

// Read lazily from storage (not via the recommendations store) to avoid a circular import.
// The server keys listening history by this id; without it every browser on a machine shares one profile.
function sessionHeaders(): Record<string, string> {
  try {
    const raw = localStorage.getItem('aurora.recommendations');
    const id = raw ? (JSON.parse(raw)?.state?.sessionId as string | undefined) : undefined;
    return id ? { 'x-session-id': id } : {};
  } catch {
    return {};
  }
}

class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function get<T>(path: string, params: Record<string, string | number | undefined> = {}, signal?: AbortSignal): Promise<T> {
  const url = new URL(BASE + path, window.location.origin);
  const languages = useLibrary.getState().settings.languages;
  url.searchParams.set('lang', languages);
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') url.searchParams.set(k, String(v));
  const res = await fetch(url.toString(), { signal, headers: sessionHeaders() });
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

async function post<T>(path: string, body: Record<string, unknown>, signal?: AbortSignal): Promise<T> {
  const url = new URL(BASE + path, window.location.origin);
  const languages = useLibrary.getState().settings.languages;
  url.searchParams.set('lang', languages);
  const res = await fetch(url.toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...sessionHeaders() },
    body: JSON.stringify(body),
    signal,
  });
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

export const api = {
  home: (signal?: AbortSignal) => get<{ languages: string; sections: Section[] }>('/home', {}, signal),
  trending: (type: 'song' | 'album' | 'playlist' = 'song') => get<{ items: Entity[] }>('/trending', { type }),
  charts: () => get<{ items: Playlist[] }>('/charts'),
  newReleases: (page = 1, limit = 30) => get<{ items: Entity[]; lastPage: boolean }>('/new-releases', { page, limit }),
  search: (q: string, signal?: AbortSignal) => get<SearchResults>('/search', { q }, signal),
  searchType: <T>(q: string, type: 'songs' | 'albums' | 'artists' | 'playlists', page = 1, limit = 30) =>
    get<Record<string, { total: number; results: T[] }>>('/search', { q, type, page, limit }),
  suggest: (q: string, signal?: AbortSignal) => get<Suggestions>('/search/suggest', { q }, signal),
  songs: (ids: string[]) => get<{ songs: Song[] }>(`/songs/${ids.join(',')}`),
  album: (id: string) => get<Album>(`/albums/${id}`),
  playlist: (id: string, page = 1, limit = 100) => get<Playlist>(`/playlists/${id}`, { page, limit }),
  artist: (id: string) => get<ArtistDetail>(`/artists/${id}`),
  artistSongs: (id: string, page = 0) => get<{ songs: Song[]; lastPage: boolean }>(`/artists/${id}/songs`, { page }),
  lyrics: (id: string) => get<{ lines: string[]; copyright: string }>(`/lyrics/${id}`),
  radio: (id: string) => get<{ songs: Song[] }>(`/radio/${id}`),
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
