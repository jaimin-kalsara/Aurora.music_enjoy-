import type { ReactNode } from 'react';
import { Img } from './Img';

interface Props {
  kind: string;
  title: string;
  image: string;
  /** Wide artist header art; used as the backdrop instead of the square image when present. */
  banner?: string;
  subtitle?: ReactNode;
  description?: string;
  stats?: string;
  round?: boolean;
  actions?: ReactNode;
}

/** Page header for albums, playlists, artists and mixes, over a blurred artwork backdrop. */
export function Hero({ kind, title, image, banner, subtitle, description, stats, round = false, actions }: Props) {
  // The type (Album, Single, Playlist…) leads the meta line rather than sitting above the title as a label.
  const meta = [kind, stats].filter(Boolean).join(' · ');
  return (
    <>
      <div className={`hero-bg ${banner ? 'banner' : ''}`} aria-hidden>
        {(banner || image) && <img src={banner || image} alt="" />}
      </div>
      <header className="hero">
        <div className={`hero-art ${round ? 'round' : ''}`}>
          <Img src={image} alt="" loading="eager" />
        </div>
        <div className="hero-meta">
          <h1 title={title}>{title}</h1>
          {subtitle && <div className="hero-sub">{subtitle}</div>}
          {meta && <div className="hero-stats">{meta}</div>}
          {description && <p className="hero-desc">{description}</p>}
          {actions && <div className="hero-actions">{actions}</div>}
        </div>
      </header>
    </>
  );
}
