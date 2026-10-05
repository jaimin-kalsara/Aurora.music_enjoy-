import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { usePlayer, useCurrentSong } from '../store/player';
import { useLibrary } from '../store/library';
import { useToggleLike } from '../hooks/useToggleLike';
import { COMPACT_QUERY, useMediaQuery } from '../hooks/useMediaQuery';
import { formatTime } from '../utils/format';
import { EASE_OUT } from '../utils/motion';
import { Slider } from './Slider';
import { Img } from './Img';
import { Expand, Heart, Lyrics, Mute, Next, Pause, Play, Prev, Queue as QueueIcon, Repeat, RepeatOne, Shuffle, Volume } from './Icons';

function PlayGlyph({ playing, buffering, size }: { playing: boolean; buffering: boolean; size: number }) {
  if (buffering && playing) return <span className="spinner" aria-hidden />;
  return playing ? <Pause size={size} /> : <Play size={size} />;
}

export function PlayerBar() {
  const song = useCurrentSong();
  const playing = usePlayer((s) => s.playing);
  const buffering = usePlayer((s) => s.buffering);
  const currentTime = usePlayer((s) => s.currentTime);
  const duration = usePlayer((s) => s.duration);
  const shuffle = usePlayer((s) => s.shuffle);
  const repeat = usePlayer((s) => s.repeat);
  const queueOpen = usePlayer((s) => s.queueOpen);
  const { toggle, next, prev, seek, toggleShuffle, cycleRepeat, setNowPlayingOpen, setQueueOpen, setLyricsOpen } = usePlayer.getState();
  const volume = useLibrary((s) => s.settings.volume);
  const updateSettings = useLibrary((s) => s.updateSettings);
  const liked = useLibrary((s) => Boolean(song && s.liked[song.id]));
  const toggleLike = useToggleLike();
  const compact = useMediaQuery(COMPACT_QUERY);

  const total = duration || song?.duration || 0;
  const progress = total ? Math.min(1, currentTime / total) : 0;
  const repeatLabel = repeat === 'off' ? 'Repeat off' : repeat === 'all' ? 'Repeat all' : 'Repeat one';

  return (
    <footer
      className="player glass"
      aria-label="Player"
      // On phones the whole capsule opens Now Playing; its own buttons and links still work.
      onClick={(e) => {
        if (!compact || !song) return;
        if ((e.target as HTMLElement).closest('button, a')) return;
        setNowPlayingOpen(true);
      }}
    >
      <div className="player-track">
        <AnimatePresence mode="popLayout" initial={false}>
          {song ? (
            <motion.div
              key={song.id}
              className="player-track-inner"
              initial={{ opacity: 0, transform: 'translateY(8px)' }}
              animate={{ opacity: 1, transform: 'translateY(0px)' }}
              exit={{ opacity: 0, transform: 'translateY(-8px)' }}
              transition={{ duration: 0.24, ease: EASE_OUT }}
            >
              <button className="player-art" onClick={() => setNowPlayingOpen(true)} aria-label="Open Now Playing">
                <Img src={song.image} alt="" loading="eager" />
              </button>
              <div className="player-meta">
                <button className="player-title truncate" onClick={() => setNowPlayingOpen(true)} title={song.title} dir="auto">
                  {song.title}
                </button>
                <div className="player-sub truncate" dir="auto">
                  {song.artists.length
                    ? song.artists.slice(0, 2).map((a, i) => (
                        <span key={`${a.id}-${i}`}>
                          {i > 0 && ', '}
                          {a.id && !compact ? <Link to={`/artist/${a.id}`}>{a.name}</Link> : a.name}
                        </span>
                      ))
                    : song.subtitle}
                </div>
              </div>
              <button
                className={`icon-btn like-btn ${liked ? 'liked' : ''}`}
                onClick={() => toggleLike(song)}
                aria-label={liked ? 'Remove from Liked Songs' : 'Add to Liked Songs'}
                aria-pressed={liked}
              >
                <Heart size={19} filled={liked} />
              </button>
            </motion.div>
          ) : (
            <motion.div key="empty" className="player-idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              {compact ? 'Not playing' : 'Pick a song, a mood, or search to start listening.'}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="player-center">
        <div className="controls">
          <button className={`icon-btn toggle ${shuffle ? 'on' : ''}`} onClick={toggleShuffle} aria-label="Shuffle" aria-pressed={shuffle}>
            <Shuffle size={18} />
          </button>
          <button className="icon-btn" onClick={prev} aria-label="Previous" disabled={!song}>
            <Prev size={22} />
          </button>
          <button className="play-btn" onClick={toggle} aria-label={playing ? 'Pause' : 'Play'} disabled={!song}>
            <PlayGlyph playing={playing} buffering={buffering} size={20} />
          </button>
          <button className="icon-btn" onClick={next} aria-label="Next" disabled={!song}>
            <Next size={22} />
          </button>
          <button className={`icon-btn toggle ${repeat !== 'off' ? 'on' : ''}`} onClick={cycleRepeat} aria-label={repeatLabel} aria-pressed={repeat !== 'off'}>
            {repeat === 'one' ? <RepeatOne size={18} /> : <Repeat size={18} />}
          </button>
        </div>
        <div className="timeline">
          <span>{formatTime(currentTime)}</span>
          <Slider
            value={currentTime}
            max={total}
            onCommit={(v) => seek(v)}
            ariaLabel="Seek"
            valueText={(v) => `${formatTime(v)} of ${formatTime(total)}`}
            disabled={!song}
          />
          <span>{formatTime(total)}</span>
        </div>
      </div>

      <div className="player-right">
        <button
          className="icon-btn"
          onClick={() => {
            setNowPlayingOpen(true);
            setLyricsOpen(true);
          }}
          aria-label="Lyrics"
          disabled={!song}
        >
          <Lyrics size={18} />
        </button>
        <button className={`icon-btn ${queueOpen ? 'on' : ''}`} onClick={() => setQueueOpen(!queueOpen)} aria-label="Queue" aria-pressed={queueOpen}>
          <QueueIcon size={19} />
        </button>
        <div className="volume">
          <button className="icon-btn" onClick={() => updateSettings({ volume: volume > 0 ? 0 : 0.8 })} aria-label={volume > 0 ? 'Mute' : 'Unmute'}>
            {volume > 0 ? <Volume size={18} level={volume} /> : <Mute size={18} />}
          </button>
          <Slider
            value={volume}
            max={1}
            onChange={(v) => updateSettings({ volume: v })}
            onCommit={(v) => updateSettings({ volume: v })}
            ariaLabel="Volume"
            valueText={(v) => `${Math.round(v * 100)}%`}
          />
        </div>
        <button className="icon-btn" onClick={() => setNowPlayingOpen(true)} aria-label="Open Now Playing" disabled={!song}>
          <Expand size={17} />
        </button>
      </div>

      <div className="mini-controls">
        <button className="play-btn" onClick={toggle} aria-label={playing ? 'Pause' : 'Play'} disabled={!song}>
          <PlayGlyph playing={playing} buffering={buffering} size={22} />
        </button>
        <button className="icon-btn" onClick={next} aria-label="Next" disabled={!song}>
          <Next size={22} />
        </button>
      </div>
      {song && (
        <div className="player-progress" aria-hidden>
          <i style={{ transform: `scaleX(${progress})` }} />
        </div>
      )}
    </footer>
  );
}
