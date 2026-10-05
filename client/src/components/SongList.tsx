import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { Song } from '../types';
import { usePlayer, type PlayContext } from '../store/player';
import { useLibrary } from '../store/library';
import { useToggleLike } from '../hooks/useToggleLike';
import { formatTime } from '../utils/format';
import { Img } from './Img';
import { Heart, Pause, Play, Plus, Queue as QueueIcon } from './Icons';
import { toast } from '../store/toast';

interface Props {
  songs: Song[];
  context: PlayContext;
  showAlbum?: boolean;
  showArt?: boolean;
  showHeader?: boolean;
  numbered?: boolean;
}

export function Equalizer({ paused = false }: { paused?: boolean }) {
  return (
    <span className={`eq ${paused ? 'paused' : ''}`} aria-hidden>
      <i />
      <i />
      <i />
      <i />
    </span>
  );
}

// Liked Songs can grow into the thousands; render in pages so a long list opens instantly.
const PAGE = 200;

export function SongList({ songs, context, showAlbum = true, showArt = true, showHeader = true, numbered = true }: Props) {
  const [limit, setLimit] = useState(PAGE);
  const play = usePlayer((s) => s.play);
  const toggle = usePlayer((s) => s.toggle);
  const playing = usePlayer((s) => s.playing);
  const currentId = usePlayer((s) => s.queue[s.index]?.id);
  const enqueue = usePlayer((s) => s.enqueue);
  const playNext = usePlayer((s) => s.playNext);
  const liked = useLibrary((s) => s.liked);
  const toggleLike = useToggleLike();

  const onRow = (song: Song, i: number) => {
    if (!song.streams) {
      toast('This track isn’t available to stream', 'error');
      return;
    }
    if (song.id === currentId) toggle();
    else play(songs, i, context);
  };

  return (
    <div className={`song-list ${showAlbum ? '' : 'compact'} ${showArt ? 'with-art' : ''}`}>
      {showHeader && (
        <div className="song-head" aria-hidden>
          <span style={{ textAlign: 'center' }}>#</span>
          <span>Title</span>
          {showAlbum && <span className="song-album">Album</span>}
          <span style={{ textAlign: 'right' }}>Time</span>
          <span />
        </div>
      )}
      {songs.slice(0, limit).map((song, i) => {
        const active = song.id === currentId;
        const isLiked = Boolean(liked[song.id]);
        return (
          <div
            key={`${song.id}-${i}`}
            className={`song-row ${active ? 'active' : ''} ${active && playing ? 'playing' : ''} ${song.streams ? '' : 'unavailable'}`}
            onClick={() => onRow(song, i)}
            role="button"
            tabIndex={0}
            aria-label={`${active && playing ? 'Pause' : 'Play'} ${song.title} by ${song.artistNames || song.subtitle}`}
            aria-current={active || undefined}
            onKeyDown={(e) => {
              if (e.target !== e.currentTarget) return;
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onRow(song, i);
              }
            }}
          >
            <div className="song-idx">
              {showArt ? <Img src={song.image} alt="" /> : <span className="num">{numbered ? i + 1 : ''}</span>}
              <span className="song-overlay" aria-hidden>
                <span className="ov-eq">
                  <Equalizer />
                </span>
                <span className="ov-icon">{active && playing ? <Pause size={16} /> : <Play size={16} />}</span>
              </span>
            </div>
            <div className="song-main">
              <div className="song-title">
                <span className="truncate" dir="auto" title={song.title}>
                  {song.title}
                </span>
                {song.explicit && (
                  <span className="badge-e" title="Explicit">
                    E
                  </span>
                )}
              </div>
              <div className="song-artists truncate" dir="auto">
                {song.artists.length
                  ? song.artists.slice(0, 3).map((a, k) => (
                      <span key={`${a.id}-${k}`}>
                        {k > 0 && ', '}
                        {a.id ? (
                          <Link to={`/artist/${a.id}`} onClick={(e) => e.stopPropagation()} tabIndex={-1}>
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
            {showAlbum && (
              <div className="song-album truncate">
                {song.album.id ? (
                  <Link to={`/album/${song.album.id}`} onClick={(e) => e.stopPropagation()} tabIndex={-1}>
                    {song.album.name}
                  </Link>
                ) : (
                  song.album.name
                )}
              </div>
            )}
            <div className="song-dur">
              {song.streams?.highBitrate === 320 && (
                <span className="hq" title="320 kbps available">
                  HQ
                </span>
              )}
              {formatTime(song.duration)}
            </div>
            <div className="song-actions">
              <button
                className={`icon-btn sm ${isLiked ? 'liked' : ''}`}
                aria-label={isLiked ? `Remove ${song.title} from Liked Songs` : `Add ${song.title} to Liked Songs`}
                aria-pressed={isLiked}
                onClick={(e) => {
                  e.stopPropagation();
                  toggleLike(song);
                }}
              >
                <Heart size={17} filled={isLiked} />
              </button>
              <button
                className="icon-btn sm play-next"
                aria-label={`Play ${song.title} next`}
                title="Play next"
                disabled={!song.streams}
                onClick={(e) => {
                  e.stopPropagation();
                  playNext(song);
                  toast('Playing next');
                }}
              >
                <Plus size={17} />
              </button>
              <button
                className="icon-btn sm"
                aria-label={`Add ${song.title} to queue`}
                title="Add to queue"
                disabled={!song.streams}
                onClick={(e) => {
                  e.stopPropagation();
                  enqueue(song);
                  toast('Added to queue');
                }}
              >
                <QueueIcon size={17} />
              </button>
            </div>
          </div>
        );
      })}
      {songs.length > limit && (
        <div className="list-more">
          <button className="chip" onClick={() => setLimit((l) => l + PAGE)}>
            Show {Math.min(PAGE, songs.length - limit).toLocaleString()} more of {(songs.length - limit).toLocaleString()}
          </button>
        </div>
      )}
    </div>
  );
}
