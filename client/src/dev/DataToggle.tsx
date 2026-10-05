// Dev-only: swaps the player and library stores between real data and worst-case fixtures.
// Lazy-loaded behind import.meta.env.DEV, so it never reaches a production bundle.
import { useEffect, useState } from 'react';
import { usePlayer } from '../store/player';
import { useLibrary } from '../store/library';
import type { Song } from '../types';
import { hugeSongs, worstSongs, WORST_CONTEXT_TITLE, WORST_SEARCHES } from './worstCase';

type Mode = 'demo' | 'worst' | 'empty' | 'one' | 'huge';
const MODES: { key: Mode; label: string }[] = [
  { key: 'demo', label: 'Demo data' },
  { key: 'worst', label: 'Worst case' },
  { key: 'empty', label: 'Empty' },
  { key: 'one', label: 'One' },
  { key: 'huge', label: '1,284 rows' },
];
const BACKUP = 'aurora.dev.library-backup';

function seed(songs: Song[], searches: string[]) {
  // Back up the real library once; the persisted store would otherwise overwrite it with fixtures.
  if (!sessionStorage.getItem(BACKUP)) sessionStorage.setItem(BACKUP, JSON.stringify(useLibrary.getState()));
  const liked = Object.fromEntries(songs.map((s) => [s.id, s]));
  useLibrary.setState({ liked, likedOrder: songs.map((s) => s.id), recent: songs, recentSearches: searches });
  usePlayer.setState({
    queue: songs,
    originalQueue: null,
    index: songs.length ? 0 : -1,
    playing: false,
    currentTime: songs.length ? 37 : 0,
    duration: songs[0]?.duration ?? 0,
    context: songs.length ? { type: 'playlist', id: 'dev', title: WORST_CONTEXT_TITLE } : null,
  });
}

function restore() {
  const raw = sessionStorage.getItem(BACKUP);
  if (raw) {
    const { liked, likedOrder, recent, recentSearches } = JSON.parse(raw);
    useLibrary.setState({ liked, likedOrder, recent, recentSearches });
    sessionStorage.removeItem(BACKUP);
  }
  usePlayer.setState({ queue: [], originalQueue: null, index: -1, playing: false, currentTime: 0, duration: 0, context: null });
}

function apply(mode: Mode) {
  if (mode === 'demo') restore();
  else if (mode === 'worst') seed(worstSongs(), WORST_SEARCHES);
  else if (mode === 'empty') seed([], []);
  else if (mode === 'one') seed(worstSongs().slice(1, 2), ['a']);
  else seed(hugeSongs(), WORST_SEARCHES);
}

export default function DataToggle() {
  const [mode, setMode] = useState<Mode>(() => (new URLSearchParams(location.search).get('data') as Mode) || 'demo');

  useEffect(() => {
    if (mode !== 'demo' || sessionStorage.getItem(BACKUP)) apply(mode);
  }, [mode]);

  const choose = (m: Mode) => {
    const url = new URL(location.href);
    if (m === 'demo') url.searchParams.delete('data');
    else url.searchParams.set('data', m);
    history.replaceState(history.state, '', url);
    setMode(m);
  };

  return (
    <div
      role="radiogroup"
      aria-label="Dev data"
      style={{
        position: 'fixed',
        left: '50%',
        bottom: 'calc(var(--chrome-bottom) + 64px)',
        transform: 'translateX(-50%)',
        zIndex: 300,
        display: 'flex',
        gap: 2,
        padding: 3,
        borderRadius: 10,
        background: '#3a3a3c',
        font: '12px system-ui, sans-serif',
        boxShadow: '0 4px 14px rgba(0,0,0,.5)',
      }}
    >
      {MODES.map((m) => (
        <button
          key={m.key}
          role="radio"
          aria-checked={mode === m.key}
          onClick={() => choose(m.key)}
          style={{ padding: '5px 10px', borderRadius: 7, color: mode === m.key ? '#000' : '#ddd', background: mode === m.key ? '#fff' : 'transparent', whiteSpace: 'nowrap' }}
        >
          {m.label}
        </button>
      ))}
    </div>
  );
}
