import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Entity } from '../types';
import { Img } from './Img';
import { Play, Pause } from './Icons';
import { usePlayEntity } from '../hooks/usePlayEntity';
import { songCount } from '../utils/format';
import { usePlayer } from '../store/player';

interface Props {
  item: Entity;
  size?: 'md' | 'sm';
}

export function entityPath(item: Entity): string | null {
  switch (item.type) {
    case 'album':
      return `/album/${item.id}`;
    case 'playlist':
      return `/playlist/${item.id}`;
    case 'artist':
      return `/artist/${item.id}`;
    default:
      return item.album?.id ? `/album/${item.album.id}` : null;
  }
}

function subtitleOf(item: Entity): string {
  if (item.type === 'song') return item.artistNames || item.subtitle;
  if (item.type === 'artist') return 'Artist';
  if (item.type === 'album') return [item.year || null, item.subtitle].filter(Boolean).join(' · ');
  if (item.type === 'playlist') return item.songCount ? songCount(item.songCount) : item.subtitle;
  return '';
}

interface ShellProps {
  title: string;
  subtitle: string;
  image: string;
  round?: boolean;
  size?: 'md' | 'sm';
  isPlaying: boolean;
  busy?: boolean;
  badge?: ReactNode;
  artClass?: string;
  onOpen: () => void;
  onPlay: () => void;
}

/** The visual card shared by entities, recent songs and mixes. */
export function CardShell({ title, subtitle, image, round, size = 'md', isPlaying, busy, badge, artClass = '', onOpen, onPlay }: ShellProps) {
  return (
    <div
      className={`card ${round ? 'card--round' : ''} ${size === 'sm' ? 'sm' : ''}`}
      role="button"
      tabIndex={0}
      aria-label={`${title}${subtitle ? `, ${subtitle}` : ''}`}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen();
        }
      }}
    >
      <div className={`card-art ${artClass}`}>
        <Img src={image} alt="" />
        {badge}
        <button
          className={`card-play glass over-art ${isPlaying ? 'visible' : ''}`}
          onClick={(e) => {
            e.stopPropagation();
            onPlay();
          }}
          aria-label={isPlaying ? `Pause ${title}` : `Play ${title}`}
          aria-busy={busy || undefined}
          disabled={busy}
        >
          {busy ? <span className="spinner light" /> : isPlaying ? <Pause size={20} /> : <Play size={20} />}
        </button>
      </div>
      <div className="card-body">
        <div className="card-title truncate" title={title} dir="auto">
          {title}
        </div>
        <div className="card-sub truncate" dir="auto" title={subtitle}>
          {subtitle}
        </div>
      </div>
    </div>
  );
}

export function Card({ item, size = 'md' }: Props) {
  const navigate = useNavigate();
  const { playEntity, busyId } = usePlayEntity();
  const context = usePlayer((s) => s.context);
  const playing = usePlayer((s) => s.playing);
  const currentId = usePlayer((s) => s.queue[s.index]?.id);
  const toggle = usePlayer((s) => s.toggle);

  const isCurrent = item.type === 'song' ? currentId === item.id : Boolean(context && context.type === item.type && context.id === item.id);
  const path = entityPath(item);

  return (
    <CardShell
      title={item.title}
      subtitle={subtitleOf(item)}
      image={item.image}
      round={item.type === 'artist'}
      size={size}
      isPlaying={isCurrent && playing}
      busy={busyId === item.id}
      onOpen={() => (path ? navigate(path) : void playEntity(item))}
      onPlay={() => (isCurrent ? toggle() : void playEntity(item))}
    />
  );
}
