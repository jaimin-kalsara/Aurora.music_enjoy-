import { useParams } from 'react-router-dom';
import { api } from '../api';
import { useQuery } from '../hooks/useQuery';
import { useLibrary } from '../store/library';
import { usePlayer } from '../store/player';
import { SongList } from '../components/SongList';
import { Shelf } from '../components/Shelf';
import { ListSkeleton } from '../components/Skeleton';
import { Pause, Play, Shuffle } from '../components/Icons';
import { formatDurationLong, songCount } from '../utils/format';

export function MoodPage() {
  const { key = '' } = useParams();
  const languages = useLibrary((s) => s.settings.languages);
  const { data, loading, error, refetch } = useQuery(`mood:${key}:${languages}`, () => api.mood(key));
  const play = usePlayer((s) => s.play);
  const toggle = usePlayer((s) => s.toggle);
  const playing = usePlayer((s) => s.playing);
  const isCurrent = usePlayer((s) => s.context?.type === 'mood' && s.context.id === key);
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
  const mood = data?.mood;
  const songs = data?.songs ?? [];
  const total = songs.reduce((acc, s) => acc + (s.duration || 0), 0);
  const context = { type: 'mood' as const, id: key, title: mood ? `${mood.title} mood` : 'Mood' };

  const startPlay = (shuffle: boolean) => {
    if (!songs.length) return;
    if (shuffle && !shuffleOn) toggleShuffle();
    if (!shuffle && shuffleOn) toggleShuffle();
    play(songs, 0, context);
  };

  return (
    <div className="page">
      {mood ? (
        <section className="mood-hero" style={{ ['--mood-gradient' as string]: `linear-gradient(135deg, ${mood.gradient[0]}, ${mood.gradient[1]})` }}>
          <div>
            <h1>{mood.title}</h1>
            <p>{mood.tagline}</p>
            <div className="hero-stats">
              Mood · {songCount(songs.length)}
              {total ? ` · ${formatDurationLong(total)}` : ''}
            </div>
            <div className="hero-actions">
              <button className="btn btn-primary" onClick={() => (isCurrent ? toggle() : startPlay(false))} disabled={!songs.length}>
                {isCurrent && playing ? <Pause size={18} /> : <Play size={18} />}
                {isCurrent && playing ? 'Pause' : isCurrent ? 'Resume' : 'Play mood'}
              </button>
              <button className="btn btn-ghost glass clear" onClick={() => startPlay(true)} disabled={!songs.length}>
                <Shuffle size={18} />
                Shuffle
              </button>
            </div>
          </div>
          <span className="emoji" aria-hidden>{mood.emoji}</span>
        </section>
      ) : (
        <div className="skeleton" style={{ height: 260, borderRadius: 28, marginTop: 22 }} aria-hidden />
      )}

      {loading && !data ? (
        <ListSkeleton rows={10} />
      ) : (
        <>
          <section className="shelf">
            <div className="shelf-head">
              <div>
                <h2>Made for this mood</h2>
                <div className="sub">Curated from YouTube Music mood playlists</div>
              </div>
            </div>
            <SongList songs={songs} context={context} />
          </section>
          {data && data.playlists.length > 0 && <Shelf title="Playlists to dive deeper" items={data.playlists} />}
        </>
      )}
    </div>
  );
}
