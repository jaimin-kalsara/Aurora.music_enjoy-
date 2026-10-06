import { useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { usePlayer } from '../store/player';
import { useRecommendations } from '../store/recommendations';
import { Hero } from '../components/Hero';
import { SongList } from '../components/SongList';
import { HeroSkeleton, ListSkeleton } from '../components/Skeleton';
import { Pause, Play, Shuffle } from '../components/Icons';
import { formatDurationLong, songCount } from '../utils/format';
import type { Song } from '../types';

type Kind = 'for-you' | 'discover-weekly' | 'mix';

const COPY: Record<Exclude<Kind, 'mix'>, { title: string; description: string }> = {
  'for-you': { title: 'For You', description: 'Songs picked from what you play, like and skip. It sharpens the more you listen.' },
  'discover-weekly': { title: 'Discover Weekly', description: 'New-to-you music, refreshed every Monday.' },
};

/** Personalised collections from the recommendation engine: For You, Discover Weekly and Daily Mixes. */
export function CollectionPage({ kind }: { kind: Kind }) {
  const { key = '' } = useParams();
  const forYou = useRecommendations((s) => s.forYou);
  const discoverWeekly = useRecommendations((s) => s.discoverWeekly);
  const dailyMixes = useRecommendations((s) => s.dailyMixes);
  const loading = useRecommendations((s) => s.loading);
  const error = useRecommendations((s) => s.error);
  const play = usePlayer((s) => s.play);
  const toggle = usePlayer((s) => s.toggle);
  const playing = usePlayer((s) => s.playing);
  const shuffleOn = usePlayer((s) => s.shuffle);
  const toggleShuffle = usePlayer((s) => s.toggleShuffle);
  // Mixes play as radio (Now Playing shows "your mix"); For You and Discover Weekly as home picks.
  const contextId = kind === 'mix' ? `mix:${key}` : kind;
  const contextType = kind === 'mix' ? ('radio' as const) : ('home' as const);
  const isCurrent = usePlayer((s) => s.context?.type === contextType && s.context.id === contextId);

  // Deep links and reloads arrive with an empty store; fetch what this page needs.
  const fetchNow = () => {
    const rec = useRecommendations.getState();
    if (kind === 'for-you') void rec.fetchForYou();
    else if (kind === 'discover-weekly') void rec.fetchDiscoverWeekly();
    else void rec.fetchDailyMixes();
  };
  useEffect(() => {
    const rec = useRecommendations.getState();
    const empty = kind === 'for-you' ? !rec.forYou.length : kind === 'discover-weekly' ? !rec.discoverWeekly : !rec.dailyMixes.length;
    if (empty) fetchNow();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind]);

  const mix = kind === 'mix' ? dailyMixes.find((m) => m.key === key) : undefined;
  const songs: Song[] = kind === 'for-you' ? forYou : kind === 'discover-weekly' ? (discoverWeekly?.tracks ?? []) : (mix?.tracks ?? []);
  const isLoading = kind === 'for-you' ? loading.forYou : kind === 'discover-weekly' ? loading.discoverWeekly : loading.dailyMixes;
  const title = kind === 'mix' ? (mix?.title ?? 'Daily Mix') : COPY[kind].title;
  const description = kind === 'mix' ? 'A mix that keeps to one mood, refreshed daily.' : COPY[kind].description;

  if (!songs.length) {
    if (isLoading) {
      return (
        <div className="page">
          <HeroSkeleton />
          <ListSkeleton />
        </div>
      );
    }
    return (
      <div className="page">
        <div className="empty">
          <h3>{error ? `Couldn’t load ${title}` : `${title} isn’t ready yet`}</h3>
          <p>{error ? 'Check your connection and try again.' : 'Play a few songs or moods and it will fill in.'}</p>
          <div className="row" style={{ marginTop: 10 }}>
            {error && (
              <button className="btn btn-ghost glass clear btn-sm" onClick={fetchNow}>
                Try again
              </button>
            )}
            <Link to="/moods" className="btn btn-primary btn-sm">
              Browse moods
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const playable = songs.filter((s) => s.streams);
  const total = playable.reduce((a, s) => a + (s.duration || 0), 0);
  const context = { type: contextType, id: contextId, title };
  const start = (shuffle: boolean) => {
    if (shuffle !== shuffleOn) toggleShuffle();
    play(playable, 0, context);
  };

  return (
    <div className="page">
      <Hero
        kind={kind === 'mix' ? 'Daily mix' : 'Made for you'}
        title={title}
        image={songs[0].image}
        description={description}
        stats={[songCount(playable.length), formatDurationLong(total) || null].filter(Boolean).join(' · ')}
        actions={
          <>
            <button className="btn btn-primary" onClick={() => (isCurrent ? toggle() : start(false))} disabled={!playable.length}>
              {isCurrent && playing ? <Pause size={18} /> : <Play size={18} />}
              {isCurrent && playing ? 'Pause' : 'Play'}
            </button>
            <button className="btn btn-ghost glass clear" onClick={() => start(true)} disabled={!playable.length}>
              <Shuffle size={18} /> Shuffle
            </button>
          </>
        }
      />
      <SongList songs={songs} context={context} />
    </div>
  );
}
