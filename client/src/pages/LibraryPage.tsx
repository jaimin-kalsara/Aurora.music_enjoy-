import { useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useLibrary, useLikedSongs } from '../store/library';
import { usePlayer } from '../store/player';
import { SongList } from '../components/SongList';
import { Heart, Clock, Play, Shuffle } from '../components/Icons';
import { formatDurationLong, songCount } from '../utils/format';

type Tab = 'liked' | 'recent';

export function LibraryPage() {
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as Tab) || 'liked';
  const liked = useLikedSongs();
  const recent = useLibrary((s) => s.recent);
  const clearRecent = useLibrary((s) => s.clearRecent);
  const play = usePlayer((s) => s.play);
  const shuffleOn = usePlayer((s) => s.shuffle);
  const toggleShuffle = usePlayer((s) => s.toggleShuffle);

  const songs = tab === 'liked' ? liked : recent;
  const total = songs.reduce((a, s) => a + (s.duration || 0), 0);
  const context = { type: 'library' as const, id: tab, title: tab === 'liked' ? 'Liked Songs' : 'Recently played' };

  const start = (shuffle: boolean) => {
    if (!songs.length) return;
    if (shuffle !== shuffleOn) toggleShuffle();
    play(songs, 0, context);
  };

  return (
    <div className="page">
      <div className="page-title">
        <h1>Your Library</h1>
        <p className="lede">Everything you’ve loved and everything you’ve played, kept on this device.</p>
      </div>
      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'liked'} className={`chip ${tab === 'liked' ? 'on' : ''}`} onClick={() => setParams({ tab: 'liked' })}>
          <span className="row" style={{ gap: 6 }}><Heart size={15} filled={tab === 'liked'} /> Liked Songs</span>
        </button>
        <button role="tab" aria-selected={tab === 'recent'} className={`chip ${tab === 'recent' ? 'on' : ''}`} onClick={() => setParams({ tab: 'recent' })}>
          <span className="row" style={{ gap: 6 }}><Clock size={15} /> Recently played</span>
        </button>
      </div>

      <motion.div key={tab} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.18 }} role="tabpanel">
        <div className="row" style={{ justifyContent: 'space-between', padding: '6px 0 10px', flexWrap: 'wrap', gap: 12 }}>
          <div className="muted">
            {songCount(songs.length)}{total ? ` · ${formatDurationLong(total)}` : ''}
          </div>
          <div className="row">
            <button className="btn btn-primary btn-sm" onClick={() => start(false)} disabled={!songs.length}>
              <Play size={16} /> Play
            </button>
            <button className="btn btn-ghost glass clear btn-sm" onClick={() => start(true)} disabled={!songs.length}>
              <Shuffle size={16} /> Shuffle
            </button>
            {tab === 'recent' && songs.length > 0 && (
              <button className="btn btn-ghost glass clear btn-sm" onClick={clearRecent}>Clear history</button>
            )}
          </div>
        </div>
        {songs.length ? (
          <SongList songs={songs} context={context} />
        ) : (
          <div className="empty">
            {tab === 'liked' ? <Heart size={36} /> : <Clock size={36} />}
            <h3>{tab === 'liked' ? 'No liked songs yet' : 'Nothing played yet'}</h3>
            <p>{tab === 'liked' ? 'Tap the heart on any track to keep it here.' : 'Songs you play will show up here.'}</p>
          </div>
        )}
      </motion.div>
    </div>
  );
}
