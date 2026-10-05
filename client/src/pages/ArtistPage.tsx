import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api';
import { useQuery } from '../hooks/useQuery';
import { usePlayer } from '../store/player';
import { Hero } from '../components/Hero';
import { SongList } from '../components/SongList';
import { Shelf } from '../components/Shelf';
import { HeroSkeleton, ListSkeleton } from '../components/Skeleton';
import { Check, Pause, Play, Shuffle } from '../components/Icons';
import { formatCount } from '../utils/format';

export function ArtistPage() {
  const { id = '' } = useParams();
  const { data, loading, error, refetch } = useQuery(`artist:${id}`, () => api.artist(id));
  const [showAll, setShowAll] = useState(false);
  const [bioOpen, setBioOpen] = useState(false);
  const play = usePlayer((s) => s.play);
  const toggle = usePlayer((s) => s.toggle);
  const playing = usePlayer((s) => s.playing);
  const isCurrent = usePlayer((s) => s.context?.type === 'artist' && s.context.id === id);
  const shuffleOn = usePlayer((s) => s.shuffle);
  const toggleShuffle = usePlayer((s) => s.toggleShuffle);

  if (error) {
    return (
      <div className="page">
        <div className="error-box" role="alert">
          <span>{error}</span>
          <button className="btn btn-ghost glass clear btn-sm" onClick={refetch}>Try again</button>
        </div>
      </div>
    );
  }
  if (loading || !data) {
    return (
      <div className="page">
        <HeroSkeleton round />
        <ListSkeleton />
      </div>
    );
  }

  const songs = data.topSongs.filter((s) => s.streams);
  const context = { type: 'artist' as const, id, title: data.title };
  const start = (shuffle: boolean) => {
    if (shuffle !== shuffleOn) toggleShuffle();
    play(songs, 0, context);
  };
  const shown = showAll ? data.topSongs : data.topSongs.slice(0, 5);

  return (
    <div className="page">
      <Hero
        kind="Artist"
        title={data.title}
        image={data.image}
        round
        subtitle={
          data.verified ? (
            <span className="verified">
              <i aria-hidden>
                <Check size={12} />
              </i>
              Verified artist
            </span>
          ) : undefined
        }
        stats={[data.followers ? `${formatCount(data.followers)} followers` : null, data.fans ? `${formatCount(data.fans)} monthly fans` : null].filter(Boolean).join(' · ')}
        actions={
          <>
            <button className="btn btn-primary" onClick={() => (isCurrent ? toggle() : start(false))} disabled={!songs.length}>
              {isCurrent && playing ? <Pause size={18} /> : <Play size={18} />}
              {isCurrent && playing ? 'Pause' : 'Play'}
            </button>
            <button className="btn btn-ghost glass clear" onClick={() => start(true)} disabled={!songs.length}>
              <Shuffle size={18} /> Shuffle
            </button>
          </>
        }
      />

      <section className="shelf">
        <div className="shelf-head">
          <h2>Popular</h2>
        </div>
        <SongList songs={shown} context={context} showHeader={false} />
        {data.topSongs.length > 5 && (
          <button className="chip" style={{ marginLeft: 12, marginTop: 8 }} onClick={() => setShowAll((v) => !v)} aria-expanded={showAll}>
            {showAll ? 'Show less' : `Show all ${data.topSongs.length}`}
          </button>
        )}
      </section>

      {data.latestRelease.length > 0 && <Shelf title="Latest release" items={data.latestRelease} />}
      <Shelf title="Albums" items={data.topAlbums} />
      <Shelf title="Singles" items={data.singles} />
      <Shelf title="Playlists" items={data.playlists} />
      <Shelf title="Fans also like" items={data.similarArtists} size="sm" />

      {data.bio && (
        <section className="shelf">
          <div className="shelf-head">
            <h2>About</h2>
          </div>
          <p className="muted" style={{ maxWidth: '68ch', whiteSpace: 'pre-line', display: bioOpen ? 'block' : '-webkit-box', WebkitLineClamp: bioOpen ? 'unset' : 4, WebkitBoxOrient: 'vertical', overflow: 'hidden', lineHeight: 1.6 }}>
            {data.bio}
          </p>
          <button className="chip" style={{ marginTop: 12 }} onClick={() => setBioOpen((v) => !v)} aria-expanded={bioOpen}>
            {bioOpen ? 'Show less' : 'Read more'}
          </button>
        </section>
      )}
    </div>
  );
}
