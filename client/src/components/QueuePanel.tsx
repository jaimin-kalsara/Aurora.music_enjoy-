import { useEffect, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { usePlayer } from '../store/player';
import { COMPACT_QUERY, useMediaQuery } from '../hooks/useMediaQuery';
import { EASE_DRAWER, EASE_OUT } from '../utils/motion';
import type { Song } from '../types';
import { Img } from './Img';
import { Close, Trash } from './Icons';
import { Equalizer } from './SongList';

const QUEUE_PAGE = 100;

/** Keys that survive removals: the nth occurrence of a song id, not its queue index. */
function stableKeys(songs: Song[]): string[] {
  const seen = new Map<string, number>();
  return songs.map((s) => {
    const n = (seen.get(s.id) ?? 0) + 1;
    seen.set(s.id, n);
    return `${s.id}#${n}`;
  });
}

export function QueuePanel() {
  const open = usePlayer((s) => s.queueOpen);
  const queue = usePlayer((s) => s.queue);
  const index = usePlayer((s) => s.index);
  const playing = usePlayer((s) => s.playing);
  const context = usePlayer((s) => s.context);
  const { setQueueOpen, jumpTo, removeAt, clearUpcoming } = usePlayer.getState();
  const compact = useMediaQuery(COMPACT_QUERY);
  const [limit, setLimit] = useState(QUEUE_PAGE);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setQueueOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, setQueueOpen]);

  const current = queue[index];
  const upcoming = queue.slice(index + 1);
  const upcomingKeys = stableKeys(upcoming);
  const history = queue.slice(0, index);

  // Desktop: a side panel that slides in from the right edge. Phone: a sheet from the bottom.
  // Same path in and out; the exit is quicker than the entrance.
  const offset = reduceMotion ? 'translate(0px, 0px)' : compact ? 'translate(0px, 48px)' : 'translate(32px, 0px)';
  const hidden = { opacity: 0, transform: offset };
  const shown = { opacity: 1, transform: 'translate(0px, 0px)', transition: { duration: 0.36, ease: EASE_DRAWER } };
  const leave = { opacity: 0, transform: offset, transition: { duration: 0.22, ease: EASE_OUT } };

  const item = (song: Song, i: number, key: string, kind: 'next' | 'past') => (
    <div
      key={key}
      className={`queue-item ${kind === 'past' ? 'past' : ''}`}
      role="button"
      tabIndex={0}
      onClick={() => jumpTo(i)}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          jumpTo(i);
        }
      }}
      aria-label={`Play ${song.title}`}
      title={song.title}
    >
      <Img src={song.image} alt="" />
      <div style={{ minWidth: 0 }}>
        <div className="t truncate" dir="auto">
          {song.title}
        </div>
        <div className="s truncate" dir="auto">
          {song.artistNames || song.subtitle}
        </div>
      </div>
      {kind === 'next' ? (
        <button
          className="icon-btn sm"
          aria-label={`Remove ${song.title} from queue`}
          onClick={(e) => {
            e.stopPropagation();
            removeAt(i);
          }}
        >
          <Trash size={16} />
        </button>
      ) : (
        <span />
      )}
    </div>
  );

  return (
    <>
      <AnimatePresence>
      {open && compact && (
        <motion.div
          key="scrim"
          className="queue-scrim"
          onClick={() => setQueueOpen(false)}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        />
      )}
      </AnimatePresence>
      <AnimatePresence>
      {open && (
        <motion.aside
          key="panel"
          className="queue-panel glass thick"
          initial={hidden}
          animate={shown}
          exit={leave}
          aria-label="Queue"
        >
          <div className="queue-head">
            <div style={{ minWidth: 0 }}>
              <h2>Queue</h2>
              {context && <div className="from truncate">From {context.title}</div>}
            </div>
            <button className="icon-btn" onClick={() => setQueueOpen(false)} aria-label="Close queue">
              <Close />
            </button>
          </div>
          <div className="queue-body">
            {!queue.length && <div className="queue-empty">Your queue is empty. Play something and it’ll line up here.</div>}
            {current && (
              <>
                <div className="queue-section">Now playing</div>
                <div className="queue-item active" aria-current="true">
                  <Img src={current.image} alt="" />
                  <div style={{ minWidth: 0 }}>
                    <div className="t truncate">{current.title}</div>
                    <div className="s truncate">{current.artistNames || current.subtitle}</div>
                  </div>
                  <Equalizer paused={!playing} />
                </div>
              </>
            )}
            {upcoming.length > 0 && (
              <>
                <div className="queue-section">
                  <span>Next up · {upcoming.length.toLocaleString()}</span>
                  <button onClick={clearUpcoming}>Clear</button>
                </div>
                {upcoming.slice(0, limit).map((song, k) => item(song, index + 1 + k, upcomingKeys[k], 'next'))}
                {upcoming.length > limit && (
                  <div className="list-more">
                    <button className="chip" onClick={() => setLimit((l) => l + QUEUE_PAGE)}>
                      Show {(upcoming.length - limit).toLocaleString()} more
                    </button>
                  </div>
                )}
              </>
            )}
            {history.length > 0 && (
              <>
                <div className="queue-section">Previously played</div>
                {history.slice(-QUEUE_PAGE).map((song, k) => {
                  const i = Math.max(0, history.length - QUEUE_PAGE) + k;
                  return item(song, i, `past-${song.id}-${i}`, 'past');
                })}
              </>
            )}
          </div>
        </motion.aside>
      )}
      </AnimatePresence>
    </>
  );
}
