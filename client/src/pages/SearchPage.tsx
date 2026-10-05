import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { useQuery } from '../hooks/useQuery';
import { useLibrary } from '../store/library';
import { Card, entityPath } from '../components/Card';
import { Shelf } from '../components/Shelf';
import { SongList } from '../components/SongList';
import { ListSkeleton, ShelfSkeleton } from '../components/Skeleton';
import { Img } from '../components/Img';
import { Play } from '../components/Icons';
import { usePlayEntity } from '../hooks/usePlayEntity';
import { MoodGrid } from './Explore';
import type { Album, ArtistCard, Entity, Playlist, Song } from '../types';

type Tab = 'all' | 'songs' | 'albums' | 'artists' | 'playlists';
const TABS: { key: Tab; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'songs', label: 'Songs' },
  { key: 'albums', label: 'Albums' },
  { key: 'artists', label: 'Artists' },
  { key: 'playlists', label: 'Playlists' },
];

function TopResult({ item }: { item: Entity }) {
  const navigate = useNavigate();
  const { playEntity, busyId } = usePlayEntity();
  const path = entityPath(item);
  const sub = item.type === 'song' ? `Song · ${item.artistNames}` : item.type === 'artist' ? 'Artist' : item.type === 'album' ? `Album · ${item.subtitle}` : 'Playlist';
  const open = () => (path ? navigate(path) : void playEntity(item));
  return (
    <div
      className="card top-result"
      role="button"
      tabIndex={0}
      aria-label={`${item.title}, ${sub}`}
      onClick={open}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          open();
        }
      }}
    >
      <div className={`card-art ${item.type === 'artist' ? 'round' : ''}`}>
        <Img src={item.image} alt="" />
      </div>
      <div style={{ minWidth: 0, flex: 1 }}>
        <h3 className="truncate">{item.title}</h3>
        <div className="muted truncate">{sub}</div>
      </div>
      <button
        className="play-btn"
        onClick={(e) => {
          e.stopPropagation();
          void playEntity(item);
        }}
        aria-label={`Play ${item.title}`}
        disabled={busyId === item.id}
      >
        {busyId === item.id ? <span className="spinner" /> : <Play size={22} />}
      </button>
    </div>
  );
}

function FilteredResults({ q, tab }: { q: string; tab: Exclude<Tab, 'all'> }) {
  const [page, setPage] = useState(1);
  const [acc, setAcc] = useState<Entity[]>([]);
  const key = `search:${tab}:${q}:${page}`;
  const { data, loading, error } = useQuery(key, async () => {
    const res = await api.searchType<Entity>(q, tab, page, 30);
    const bucket = res[tab];
    setAcc((prev) => (page === 1 ? bucket.results : [...prev, ...bucket.results]));
    return bucket;
  });
  const items = page === 1 && data ? data.results : acc;
  if (error) return <div className="error-box" role="alert">{error}</div>;
  if (!items.length && loading) return tab === 'songs' ? <ListSkeleton /> : <ShelfSkeleton title={false} />;
  if (!items.length) return <div className="empty"><h3>No {tab} found</h3><p>Try a different spelling or search for the artist.</p></div>;
  const total = data?.total ?? 0;
  return (
    <>
      {tab === 'songs' ? (
        <SongList songs={items as Song[]} context={{ type: 'search', title: `Results for “${q}”` }} />
      ) : (
        <div className="grid">{items.map((item) => <Card key={`${item.type}-${item.id}`} item={item} />)}</div>
      )}
      {items.length < total && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 20 }}>
          <button className="btn btn-ghost glass clear" onClick={() => setPage((p) => p + 1)} disabled={loading}>
            {loading ? 'Loading…' : 'Load more'}
          </button>
        </div>
      )}
    </>
  );
}

export function SearchPage() {
  const [params, setParams] = useSearchParams();
  const q = (params.get('q') ?? '').trim();
  const tab = (params.get('tab') as Tab) || 'all';
  const languages = useLibrary((s) => s.settings.languages);
  const recentSearches = useLibrary((s) => s.recentSearches);
  const clearRecentSearches = useLibrary((s) => s.clearRecentSearches);
  const { data, loading, error } = useQuery(q ? `search:all:${q}:${languages}` : null, (signal) => api.search(q, signal));

  const top = useMemo<Entity | null>(() => {
    if (!data) return null;
    const lower = q.toLowerCase();
    const exactArtist = data.artists.results.find((a) => a.title.toLowerCase() === lower);
    if (exactArtist) return exactArtist;
    const exactAlbum = data.albums.results.find((a) => a.title.toLowerCase() === lower);
    if (exactAlbum) return exactAlbum;
    return data.songs.results[0] ?? data.artists.results[0] ?? data.albums.results[0] ?? data.playlists.results[0] ?? null;
  }, [data, q]);

  const setTab = (t: Tab) => {
    const next = new URLSearchParams(params);
    if (t === 'all') next.delete('tab');
    else next.set('tab', t);
    setParams(next, { replace: true });
  };

  if (!q) {
    return (
      <div className="page">
        <div className="page-title">
          <h1>Search</h1>
          <p className="lede">Find any song, artist, album or playlist. Press ⌘K or Ctrl K to jump to the search box from anywhere.</p>
        </div>
        {recentSearches.length > 0 && (
          <section className="shelf">
            <div className="shelf-head">
              <h2>Recent searches</h2>
              <button className="chip" onClick={clearRecentSearches}>Clear</button>
            </div>
            <div className="chips">
              {recentSearches.map((r) => (
                <Link key={r} to={`/search?q=${encodeURIComponent(r)}`} className="chip">{r}</Link>
              ))}
            </div>
          </section>
        )}
        <section className="shelf">
          <div className="shelf-head"><h2>Or start from a mood</h2></div>
          <MoodGrid limit={8} />
        </section>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-title">
        <h1 style={{ fontSize: 32, overflowWrap: 'anywhere' }}>Results for “{q}”</h1>
      </div>
      <div className="tabs" role="tablist">
        {TABS.map((t) => (
          <button key={t.key} role="tab" aria-selected={tab === t.key} className={`chip ${tab === t.key ? 'on' : ''}`} onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      {tab !== 'all' ? (
        <FilteredResults key={`${tab}:${q}`} q={q} tab={tab} />
      ) : error ? (
        <div className="error-box" role="alert">{error}</div>
      ) : loading && !data ? (
        <>
          <ListSkeleton rows={6} />
          <ShelfSkeleton />
        </>
      ) : data ? (
        <>
          {top && (
            <div className="search-top">
              <section aria-label="Top result">
                <h2>Top result</h2>
                <TopResult item={top} />
              </section>
              {data.songs.results.length > 0 && (
                <section aria-label="Songs">
                  <h2>Songs</h2>
                  <SongList songs={data.songs.results.slice(0, 5)} context={{ type: 'search', title: `Results for “${q}”` }} showAlbum={false} showHeader={false} />
                  {data.songs.total > 5 && (
                    <button className="chip" onClick={() => setTab('songs')} style={{ marginLeft: 12, marginTop: 4 }}>
                      See all {data.songs.total.toLocaleString()} songs
                    </button>
                  )}
                </section>
              )}
            </div>
          )}
          <Shelf title="Artists" items={data.artists.results as ArtistCard[]} seeAllTo={`/search?q=${encodeURIComponent(q)}&tab=artists`} size="sm" />
          <Shelf title="Albums" items={data.albums.results as Album[]} seeAllTo={`/search?q=${encodeURIComponent(q)}&tab=albums`} />
          <Shelf title="Playlists" items={data.playlists.results as Playlist[]} seeAllTo={`/search?q=${encodeURIComponent(q)}&tab=playlists`} />
          {!top && (
            <div className="empty">
              <h3>No results for “{q}”</h3>
              <p>Check the spelling, or try searching by artist or album.</p>
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}
