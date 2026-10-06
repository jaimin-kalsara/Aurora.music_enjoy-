import { Children, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { Entity } from '../types';
import { Card } from './Card';
import { ChevronLeft, ChevronRight } from './Icons';

interface Props {
  title: string;
  subtitle?: string;
  items?: Entity[];
  seeAllTo?: string;
  size?: 'md' | 'sm';
  id?: string;
  children?: ReactNode;
}

/** Horizontal, snap-scrolling row of cards with arrow controls. */
export function Shelf({ title, subtitle, items, seeAllTo, size = 'md', id, children }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);
  const count = children ? Children.count(children) : (items?.length ?? 0);

  const frame = useRef(0);
  // Scroll fires many times a frame; measure once per frame.
  const update = useCallback(() => {
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      const el = ref.current;
      if (!el) return;
      setCanLeft(el.scrollLeft > 4);
      setCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
    });
  }, []);

  useEffect(() => {
    update();
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      ro.disconnect();
      cancelAnimationFrame(frame.current);
    };
  }, [count, update]);

  const scrollBy = (dir: 1 | -1) => {
    const el = ref.current;
    if (!el) return;
    el.scrollBy({ left: dir * Math.max(240, el.clientWidth * 0.8), behavior: 'smooth' });
  };

  if (!count) return null;

  return (
    <section className="shelf" id={id} aria-label={title}>
      <div className="shelf-head">
        <div>
          <h2>{seeAllTo ? <Link to={seeAllTo}>{title}</Link> : title}</h2>
          {subtitle && <div className="sub">{subtitle}</div>}
        </div>
        <div className="shelf-controls">
          {seeAllTo && (
            <Link to={seeAllTo} className="chip">
              See all
            </Link>
          )}
          {(canLeft || canRight) && (
            <>
              <button className="icon-btn" onClick={() => scrollBy(-1)} disabled={!canLeft} aria-label={`Scroll ${title} left`}>
                <ChevronLeft />
              </button>
              <button className="icon-btn" onClick={() => scrollBy(1)} disabled={!canRight} aria-label={`Scroll ${title} right`}>
                <ChevronRight />
              </button>
            </>
          )}
        </div>
      </div>
      <div className="scroller" ref={ref} onScroll={update}>
        {children ?? items!.map((item) => <Card key={`${item.type}-${item.id}`} item={item} size={size} />)}
      </div>
    </section>
  );
}
