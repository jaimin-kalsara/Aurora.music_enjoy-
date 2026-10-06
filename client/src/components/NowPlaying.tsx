import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion, useDragControls, useReducedMotion, type PanInfo } from 'framer-motion';
import { usePlayer, useCurrentSong } from '../store/player';
import { useLibrary } from '../store/library';
import { useToggleLike } from '../hooks/useToggleLike';
import { formatTime } from '../utils/format';
import { SPRING_SETTLE } from '../utils/motion';
import { Slider } from './Slider';
import { Img } from './Img';
import { BackdropStack } from './Ambient';
import { Lyrics } from './Lyrics';
import { qualityLabel } from './AudioEngine';
import { ChevronDown, Heart, Lyrics as LyricsIcon, Mute, Next, Pause, Play, Prev, Queue as QueueIcon, Repeat, RepeatOne, Shuffle, Volume } from './Icons';

const CONTEXT_LABEL: Record<string, string> = {
  album: 'album',
  playlist: 'playlist',
  artist: 'artist',
  mood: 'mood',
  search: 'search',
  library: 'your library',
  home: 'home',
  radio: 'autoplay',
};

export function NowPlaying() {
  const open = usePlayer((s) => s.nowPlayingOpen);
  const lyricsOpen = usePlayer((s) => s.lyricsOpen);
  const song = useCurrentSong();
  const playing = usePlayer((s) => s.playing);
  const buffering = usePlayer((s) => s.buffering);
  const currentTime = usePlayer((s) => s.currentTime);
  const duration = usePlayer((s) => s.duration);
  const shuffle = usePlayer((s) => s.shuffle);
  const repeat = usePlayer((s) => s.repeat);
  const context = usePlayer((s) => s.context);
  const { toggle, next, prev, seek, toggleShuffle, cycleRepeat, setNowPlayingOpen, setLyricsOpen, setQueueOpen } = usePlayer.getState();
  const volume = useLibrary((s) => s.settings.volume);
  const quality = useLibrary((s) => s.settings.quality);
  const updateSettings = useLibrary((s) => s.updateSettings);
  const liked = useLibrary((s) => Boolean(song && s.liked[song.id]));
  const toggleLike = useToggleLike();
  const dragControls = useDragControls();
  const reduceMotion = useReducedMotion();
  const sheetRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);

  const close = () => setNowPlayingOpen(false);

  // Dialog behaviour: Escape closes, Tab stays inside, focus returns to where it came from.
  useEffect(() => {
    if (!open) return;
    returnFocus.current = document.activeElement as HTMLElement | null;
    closeRef.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setNowPlayingOpen(false);
        return;
      }
      if (e.key !== 'Tab' || !sheetRef.current) return;
      const focusables = sheetRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], [tabindex="0"]');
      if (!focusables.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      returnFocus.current?.focus?.({ preventScroll: true });
    };
  }, [open, setNowPlayingOpen]);

  useEffect(() => {
    if (!song) setNowPlayingOpen(false);
  }, [song, setNowPlayingOpen]);

  const total = duration || song?.duration || 0;
  // Mixes play as radio with a "mix:" id; plain radio is autoplay continuing the queue.
  const from = context?.type === 'radio' ? (context.id?.startsWith('mix:') ? 'your mix' : 'autoplay') : (CONTEXT_LABEL[context?.type ?? ''] ?? 'queue');

  // Drag down to dismiss. A flick counts as much as distance, and the exit spring inherits the release velocity.
  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.y > 160 || (info.velocity.y > 500 && info.offset.y > 24)) close();
  };
  const startDrag = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('button, a, [role="slider"]')) return;
    dragControls.start(e);
  };

  return (
    <AnimatePresence>
      {open && song && (
        <motion.section
          ref={sheetRef}
          className="np"
          role="dialog"
          aria-modal="true"
          aria-label={`Now playing: ${song.title}`}
          initial={reduceMotion ? { opacity: 0 } : { y: '100%' }}
          animate={reduceMotion ? { opacity: 1 } : { y: 0 }}
          exit={reduceMotion ? { opacity: 0 } : { y: '100%' }}
          transition={reduceMotion ? { duration: 0.2 } : SPRING_SETTLE}
          drag={reduceMotion ? false : 'y'}
          dragListener={false}
          dragControls={dragControls}
          dragConstraints={{ top: 0, bottom: 0 }}
          dragElastic={{ top: 0.04, bottom: 1 }}
          dragTransition={{ bounceStiffness: 420, bounceDamping: 40 }}
          onDragEnd={onDragEnd}
        >
          <BackdropStack className="np-bg" value={`url("${song.image}")`} />
          <span className="np-grabber" aria-hidden onPointerDown={startDrag} />

          <div className="np-head" onPointerDown={startDrag}>
            <div>
              <button ref={closeRef} className="circle-btn glass" onClick={close} aria-label="Close Now Playing">
                <ChevronDown size={24} />
              </button>
            </div>
            <div className="ctx">
              Playing from {from}
              <strong className="truncate">{context?.title ?? 'Queue'}</strong>
            </div>
            <div className="end">
              <button
                className={`circle-btn glass ${lyricsOpen ? 'on' : ''}`}
                onClick={() => setLyricsOpen(!lyricsOpen)}
                aria-label="Lyrics"
                aria-pressed={lyricsOpen}
              >
                <LyricsIcon size={19} />
              </button>
              <button
                className="circle-btn glass"
                onClick={() => {
                  close();
                  setQueueOpen(true);
                }}
                aria-label="Open queue"
              >
                <QueueIcon size={19} />
              </button>
            </div>
          </div>

          <div className={`np-body ${lyricsOpen ? 'split' : ''}`}>
            <div className={`np-art ${playing ? '' : 'paused'}`} onPointerDown={startDrag}>
              <Img src={song.image} alt={song.album.name ? `${song.album.name} artwork` : ''} loading="eager" draggable={false} />
            </div>

            {lyricsOpen && (
              <div className="np-lyrics-slot">
                <Lyrics song={song} currentTime={currentTime} duration={total} playing={playing} onSeek={(t) => seek(t)} />
              </div>
            )}

            <div className="np-panel" style={lyricsOpen ? { gridColumn: '1 / -1' } : undefined}>
              <div className="np-title">
                <div style={{ minWidth: 0 }}>
                  <h2 title={song.title} dir="auto">
                    {song.title}
                  </h2>
                  <div className="sub truncate" dir="auto">
                    {song.artists.length
                      ? song.artists.slice(0, 3).map((a, i) => (
                          <span key={`${a.id}-${i}`}>
                            {i > 0 && ', '}
                            {a.id ? (
                              <Link to={`/artist/${a.id}`} onClick={close}>
                                {a.name}
                              </Link>
                            ) : (
                              a.name
                            )}
                          </span>
                        ))
                      : song.subtitle}
                  </div>
                </div>
                <button
                  className={`icon-btn ${liked ? 'liked' : ''}`}
                  onClick={() => toggleLike(song)}
                  aria-label={liked ? 'Remove from Liked Songs' : 'Add to Liked Songs'}
                  aria-pressed={liked}
                >
                  <Heart size={24} filled={liked} />
                </button>
              </div>

              <div>
                <Slider
                  value={currentTime}
                  max={total}
                  onCommit={(v) => seek(v)}
                  ariaLabel="Seek"
                  valueText={(v) => `${formatTime(v)} of ${formatTime(total)}`}
                />
                <div className="np-time">
                  <span>{formatTime(currentTime)}</span>
                  <span className="quality-pill">{buffering && playing ? 'Buffering…' : qualityLabel(quality)}</span>
                  <span>-{formatTime(Math.max(0, total - currentTime))}</span>
                </div>
              </div>

              <div className="np-controls">
                <button className={`icon-btn toggle ${shuffle ? 'on' : ''}`} onClick={toggleShuffle} aria-label="Shuffle" aria-pressed={shuffle}>
                  <Shuffle size={20} />
                </button>
                <button className="icon-btn" onClick={prev} aria-label="Previous">
                  <Prev size={32} />
                </button>
                <button className="play-btn lg" onClick={toggle} aria-label={playing ? 'Pause' : 'Play'}>
                  {playing ? <Pause size={30} /> : <Play size={30} />}
                </button>
                <button className="icon-btn" onClick={next} aria-label="Next">
                  <Next size={32} />
                </button>
                <button
                  className={`icon-btn toggle ${repeat !== 'off' ? 'on' : ''}`}
                  onClick={cycleRepeat}
                  aria-label={repeat === 'off' ? 'Repeat off' : repeat === 'all' ? 'Repeat all' : 'Repeat one'}
                  aria-pressed={repeat !== 'off'}
                >
                  {repeat === 'one' ? <RepeatOne size={20} /> : <Repeat size={20} />}
                </button>
              </div>

              <div className="np-footer">
                <span className="truncate">
                  {song.album.name && song.album.id ? (
                    <Link to={`/album/${song.album.id}`} onClick={close}>
                      {song.album.name}
                    </Link>
                  ) : (
                    song.album.name || (song.isVideo ? 'Music video' : 'Single')
                  )}
                  {song.year ? ` · ${song.year}` : ''}
                </span>
                <div className="volume">
                  <button className="icon-btn" onClick={() => updateSettings({ volume: volume > 0 ? 0 : 0.8 })} aria-label={volume > 0 ? 'Mute' : 'Unmute'}>
                    {volume > 0 ? <Volume size={18} level={volume} /> : <Mute size={18} />}
                  </button>
                  <Slider
                    value={volume}
                    max={1}
                    onChange={(v) => updateSettings({ volume: v })}
                    ariaLabel="Volume"
                    valueText={(v) => `${Math.round(v * 100)}%`}
                  />
                </div>
              </div>
            </div>
          </div>
        </motion.section>
      )}
    </AnimatePresence>
  );
}
