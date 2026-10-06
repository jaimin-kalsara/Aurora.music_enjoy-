export function ShelfSkeleton({ count = 6, title = true }: { count?: number; title?: boolean }) {
  return (
    <section className="shelf" aria-hidden>
      {title && (
        <div className="shelf-head">
          <div className="skeleton" style={{ width: 200, height: 24 }} />
        </div>
      )}
      <div className="scroller" style={{ overflow: 'hidden' }}>
        {Array.from({ length: count }).map((_, i) => (
          <div className="sk-card" key={i}>
            <div className="skeleton art" />
            <div className="skeleton sk-line" />
            <div className="skeleton sk-line short" />
          </div>
        ))}
      </div>
    </section>
  );
}

export function ListSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div className="song-list compact" aria-hidden>
      {Array.from({ length: rows }).map((_, i) => (
        <div className="song-row" key={i} style={{ pointerEvents: 'none' }}>
          <div className="skeleton" style={{ width: 40, height: 40, borderRadius: 7 }} />
          <div>
            <div className="skeleton sk-line" style={{ width: `${45 + ((i * 17) % 40)}%`, marginTop: 0 }} />
            <div className="skeleton sk-line short" style={{ width: `${25 + ((i * 11) % 20)}%` }} />
          </div>
          <div className="skeleton sk-line" style={{ marginTop: 0, width: 36, justifySelf: 'end' }} />
          <span />
        </div>
      ))}
    </div>
  );
}

export function HeroSkeleton({ round = false }: { round?: boolean }) {
  return (
    <div className="hero" aria-hidden>
      <div className={`skeleton hero-art ${round ? 'round' : ''}`} style={{ boxShadow: 'none' }} />
      <div className="hero-meta" style={{ width: 'min(520px, 100%)' }}>
        <div className="skeleton" style={{ width: '80%', height: 44 }} />
        <div className="skeleton" style={{ width: '40%', height: 16 }} />
        <div className="skeleton" style={{ width: '55%', height: 14 }} />
        <div className="skeleton" style={{ width: 140, height: 44, borderRadius: 999, marginTop: 10 }} />
      </div>
    </div>
  );
}
