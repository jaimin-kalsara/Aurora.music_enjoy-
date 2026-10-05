import { useParams } from 'react-router-dom';
import { api } from '../api';
import { useQuery } from '../hooks/useQuery';
import { usePlayer } from '../store/player';
import { Hero } from '../components/Hero';
import { SongList } from '../components/SongList';
import { HeroSkeleton, ListSkeleton } from '../components/Skeleton';
import { Pause, Play, Shuffle, Queue as QueueIcon } from '../components/Icons';
import { formatCount, formatDurationLong, songCount } from '../utils/format';
import { toast } from '../store/toast';

export function PlaylistPage() {
  const { id = '' } = useParams();
  const { data, loading, error, refetch } = useQuery(`playlist:${id}`, () => api.playlist(id, 1, 100));
  const play = usePlayer((s) => s.play);
  const toggle = usePlayer((s) => s.toggle);
  const enqueue = usePlayer((s) => s.enqueue);
  const playing = usePlayer((s) => s.playing);
  const isCurrent = usePlayer((s) => s.context?.type === 'playlist' && s.context.id === id);
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
        <HeroSkeleton />
        <ListSkeleton />
      </div>
    );
  }

  const songs = data.songs.filter((s) => s.streams);
  const total = songs.reduce((a, s) => a + (s.duration || 0), 0);
  const context = { type: 'playlist' as const, id, title: data.title };
  const start = (shuffle: boolean) => {
    if (shuffle !== shuffleOn) toggleShuffle();
    play(songs, 0, context);
  };

  return (
    <div className="page">
      <Hero
        kind="Playlist"
        title={data.title}
        image={data.image}
        subtitle={data.subtitle}
        description={data.description}
        stats={[data.followers ? `${formatCount(data.followers)} followers` : null, songCount(data.songCount || songs.length), formatDurationLong(total) || null].filter(Boolean).join(' · ')}
        actions={
          <>
            <button className="btn btn-primary" onClick={() => (isCurrent ? toggle() : start(false))} disabled={!songs.length}>
              {isCurrent && playing ? <Pause size={18} /> : <Play size={18} />}
              {isCurrent && playing ? 'Pause' : 'Play'}
            </button>
            <button className="btn btn-ghost glass clear" onClick={() => start(true)} disabled={!songs.length}>
              <Shuffle size={18} /> Shuffle
            </button>
            <button className="btn btn-ghost glass clear" onClick={() => { enqueue(songs); toast('Playlist added to queue'); }} disabled={!songs.length}>
              <QueueIcon size={18} /> Queue
            </button>
          </>
        }
      />
      <SongList songs={data.songs} context={context} />
    </div>
  );
}
