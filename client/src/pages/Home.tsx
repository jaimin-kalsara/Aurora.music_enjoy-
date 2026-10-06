import { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useQuery } from '../hooks/useQuery';
import { Shelf } from '../components/Shelf';
import { CardShell } from '../components/Card';
import { ShelfSkeleton } from '../components/Skeleton';
import { useLibrary } from '../store/library';
import { usePlayer } from '../store/player';
import { useRecommendations } from '../store/recommendations';
import type { DailyMix, Mood } from '../types';
import { songCount } from '../utils/format';
import { ChevronRight } from '../components/Icons';

function greeting() {
  const h = new Date().getHours();
  if (h < 5) return 'Late night listening';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  if (h < 21) return 'Good evening';
  return 'Good night';
}

function MoodStrip({ moods }: { moods: Mood[] }) {
  return (
    <div className="chips mood-strip">
      {moods.slice(0, 8).map((m) => (
        <Link key={m.key} to={`/moods/${m.key}`} className="chip">
          <span className="chip-emoji" aria-hidden>
            {m.emoji}
          </span>
          {m.title}
        </Link>
      ))}
      <Link to="/moods" className="chip">
        All moods
        <ChevronRight size={15} />
      </Link>
    </div>
  );
}

function mixArtists(mix: DailyMix): string {
  const names: string[] = [];
  for (const t of mix.tracks) {
    for (const a of t.artists) if (a.name && !names.includes(a.name)) names.push(a.name);
    if (names.length >= 3) break;
  }
  return names.length ? `${names.slice(0, 3).join(', ')} and more` : songCount(mix.tracks.length);
}

function MixCard({ mix }: { mix: DailyMix }) {
  const navigate = useNavigate();
  const play = usePlayer((s) => s.play);
  const toggle = usePlayer((s) => s.toggle);
  const playing = usePlayer((s) => s.playing);
  const isCurrent = usePlayer((s) => s.context?.type === 'radio' && s.context.id === `mix:${mix.key}`);
  return (
    <CardShell
      title={mix.title}
      subtitle={mixArtists(mix)}
      image={mix.tracks[0]?.image ?? ''}
      artClass="mix"
      badge={<span className="card-badge">{mix.title}</span>}
      isPlaying={isCurrent && playing}
      onOpen={() => navigate(`/mix/${mix.key}`)}
      onPlay={() => (isCurrent ? toggle() : play(mix.tracks, 0, { type: 'radio', id: `mix:${mix.key}`, title: mix.title }))}
    />
  );
}

export function Home() {
  const languages = useLibrary((s) => s.settings.languages);
  const home = useQuery(`home:${languages}`, (signal) => api.home(signal));
  const moods = useQuery('moods', () => api.moods());
  const recent = useLibrary((s) => s.recent);
  const play = usePlayer((s) => s.play);
  const toggle = usePlayer((s) => s.toggle);
  const playing = usePlayer((s) => s.playing);
  const currentId = usePlayer((s) => s.queue[s.index]?.id);

  const forYou = useRecommendations((s) => s.forYou);
  const discoverWeekly = useRecommendations((s) => s.discoverWeekly);
  const dailyMixes = useRecommendations((s) => s.dailyMixes);
  const loading = useRecommendations((s) => s.loading);

  // The store refetches at most every 10 minutes, so shelves don't reshuffle on every visit.
  const fetchAll = useRecommendations((s) => s.fetchAll);
  useEffect(() => {
    void fetchAll();
  }, [fetchAll, languages]);

  const weekly = discoverWeekly?.tracks ?? [];
  const weeklySub = discoverWeekly?.updatedAt
    ? `Updated ${new Date(discoverWeekly.updatedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} · New music picked for you`
    : 'Fresh discoveries every Monday';
  const recentCtx = { type: 'library' as const, id: 'recent', title: 'Recently played' };

  return (
    <div className="page">
      <div className="page-title">
        <h1>{greeting()}</h1>
        <p className="lede">Fresh releases, charts, and mixes tuned to how you feel.</p>
        {moods.data && <MoodStrip moods={moods.data.moods} />}
      </div>

      {forYou.length > 0 ? (
        <Shelf title="For You" subtitle="Based on your listening history" items={forYou.slice(0, 12)} seeAllTo="/recommendations/for-you" />
      ) : (
        loading.forYou && <ShelfSkeleton />
      )}

      {weekly.length > 0 && <Shelf title="Discover Weekly" subtitle={weeklySub} items={weekly.slice(0, 12)} seeAllTo="/recommendations/discover-weekly" />}

      {dailyMixes.length > 0 && (
        <Shelf title="Daily Mixes" subtitle="Built from the moods you play most">
          {dailyMixes.map((mix) => (
            <MixCard key={mix.key} mix={mix} />
          ))}
        </Shelf>
      )}

      {recent.length > 0 && (
        <Shelf title="Continue listening" subtitle="Pick up where you left off">
          {recent.slice(0, 12).map((song, i) => {
            const isCurrent = currentId === song.id;
            return (
              <CardShell
                key={song.id}
                title={song.title}
                subtitle={song.artistNames || song.subtitle}
                image={song.image}
                size="sm"
                isPlaying={isCurrent && playing}
                onOpen={() => (isCurrent ? toggle() : play(recent, i, recentCtx))}
                onPlay={() => (isCurrent ? toggle() : play(recent, i, recentCtx))}
              />
            );
          })}
        </Shelf>
      )}

      {home.loading && !home.data && (
        <>
          <ShelfSkeleton />
          <ShelfSkeleton />
          <ShelfSkeleton />
        </>
      )}
      {home.error && (
        <div className="error-box" role="alert">
          <span>Couldn’t load the home feed. The music server isn’t responding; try again in a moment.</span>
          <button className="btn btn-ghost glass clear btn-sm" onClick={home.refetch}>
            Try again
          </button>
        </div>
      )}
      {home.data?.sections.map((section) => (
        <Shelf
          key={section.id}
          title={section.title}
          items={section.items}
          size={section.kind === 'artist' ? 'sm' : 'md'}
          seeAllTo={section.id === 'new-releases' ? '/explore#new' : section.id === 'charts' ? '/explore#charts' : undefined}
        />
      ))}
    </div>
  );
}
