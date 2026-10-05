import { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { EASE_OUT } from '../utils/motion';
import { api } from '../api';
import { useQuery } from '../hooks/useQuery';
import { useLibrary } from '../store/library';
import { Card } from '../components/Card';
import { Shelf } from '../components/Shelf';
import { SongList } from '../components/SongList';
import { ListSkeleton, ShelfSkeleton } from '../components/Skeleton';
import type { Song } from '../types';

export function MoodGrid({ limit }: { limit?: number }) {
  const moods = useQuery('moods', () => api.moods());
  if (!moods.data) return <div className="mood-grid">{Array.from({ length: limit ?? 8 }).map((_, i) => <div key={i} className="skeleton" style={{ height: 140, borderRadius: 18 }} />)}</div>;
  const list = limit ? moods.data.moods.slice(0, limit) : moods.data.moods;
  return (
    <div className="mood-grid">
      {list.map((m, i) => (
        <motion.div key={m.key} initial={{ opacity: 0, transform: 'translateY(10px)' }} animate={{ opacity: 1, transform: 'translateY(0px)' }} transition={{ duration: 0.32, delay: Math.min(i * 0.03, 0.24), ease: EASE_OUT }}>
          <Link
            to={`/moods/${m.key}`}
            className="mood-card"
            style={{ ['--mood-gradient' as string]: `linear-gradient(135deg, ${m.gradient[0]}, ${m.gradient[1]})` }}
          >
            <span className="emoji" aria-hidden>{m.emoji}</span>
            <h3>{m.title}</h3>
            <p>{m.tagline}</p>
          </Link>
        </motion.div>
      ))}
    </div>
  );
}

export function Explore() {
  const languages = useLibrary((s) => s.settings.languages);
  const charts = useQuery(`charts:${languages}`, () => api.charts());
  const fresh = useQuery(`new:${languages}`, () => api.newReleases(1, 30));
  const trending = useQuery(`trending:${languages}`, () => api.trending('song'));
  const { hash } = useLocation();

  useEffect(() => {
    if (!hash) return;
    const el = document.getElementById(hash.slice(1));
    if (el) setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'start' }), 120);
  }, [hash, charts.data, fresh.data]);

  const trendingSongs = (trending.data?.items.filter((i) => i.type === 'song') ?? []) as Song[];

  return (
    <div className="page">
      <div className="page-title">
        <h1>Explore</h1>
        <p className="lede">Moods, charts and everything that dropped this week.</p>
      </div>

      <section className="shelf">
        <div className="shelf-head">
          <div>
            <h2>Browse by mood</h2>
            <div className="sub">Tell us how you feel and we’ll handle the rest</div>
          </div>
          <Link to="/moods" className="chip">See all</Link>
        </div>
        <MoodGrid limit={8} />
      </section>

      <div id="charts">
        {charts.data ? <Shelf title="Top charts" subtitle="Updated daily" items={charts.data.items} /> : <ShelfSkeleton />}
      </div>

      <section className="shelf" id="new">
        <div className="shelf-head">
          <div>
            <h2>New releases</h2>
            <div className="sub">The latest singles and albums, as they land</div>
          </div>
        </div>
        {fresh.data ? (
          <div className="grid">
            {fresh.data.items.map((item) => <Card key={`${item.type}-${item.id}`} item={item} />)}
          </div>
        ) : (
          <ShelfSkeleton title={false} count={8} />
        )}
      </section>

      <section className="shelf">
        <div className="shelf-head">
          <div>
            <h2>Trending songs</h2>
            <div className="sub">What everyone is playing right now</div>
          </div>
        </div>
        {trending.data ? <SongList songs={trendingSongs} context={{ type: 'home', title: 'Trending songs' }} /> : <ListSkeleton />}
      </section>
    </div>
  );
}
