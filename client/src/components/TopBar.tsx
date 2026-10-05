import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { api } from '../api';
import type { Entity, Suggestions } from '../types';
import { Img } from './Img';
import { ChevronLeft, ChevronRight, Close, Search as SearchIcon, Settings } from './Icons';
import { entityPath } from './Card';
import { usePlayEntity } from '../hooks/usePlayEntity';
import { useLibrary } from '../store/library';
import { EASE_OUT } from '../utils/motion';

type Row = { item: Entity; group: string };

const TAB_ROOTS = new Set(['/', '/explore', '/moods', '/library', '/search']);
const IS_MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

function flatten(s: Suggestions): Row[] {
  const rows: Row[] = [];
  if (s.top) rows.push({ item: s.top, group: 'Top result' });
  s.songs.forEach((i) => rows.push({ item: i, group: 'Songs' }));
  s.artists.forEach((i) => rows.push({ item: i, group: 'Artists' }));
  s.albums.forEach((i) => rows.push({ item: i, group: 'Albums' }));
  s.playlists.forEach((i) => rows.push({ item: i, group: 'Playlists' }));
  const seen = new Set<string>();
  return rows
    .filter((r) => {
      const k = `${r.item.type}:${r.item.id}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .slice(0, 10);
}

function describe(item: Entity): string {
  if (item.type === 'song') return item.artistNames || item.subtitle;
  if (item.type === 'artist') return 'Artist';
  if (item.type === 'album') return item.subtitle ? `Album · ${item.subtitle}` : 'Album';
  return 'Playlist';
}

export function TopBar() {
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const [value, setValue] = useState(params.get('q') ?? '');
  const [rows, setRows] = useState<Row[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const headerRef = useRef<HTMLElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const { playEntity } = usePlayEntity();
  const addRecentSearch = useLibrary((s) => s.addRecentSearch);

  useEffect(() => {
    if (location.pathname !== '/search') return;
    setValue(params.get('q') ?? '');
  }, [location.pathname, params]);

  // Navigating anywhere closes the suggestions (adjusting state during render, not in an effect).
  const [navKey, setNavKey] = useState(location.key);
  if (navKey !== location.key) {
    setNavKey(location.key);
    setOpen(false);
  }

  // Scroll-edge effect: only blur the top edge once content is actually underneath it.
  useEffect(() => {
    const header = headerRef.current;
    const scroller = header?.closest('.content');
    if (!header || !scroller) return;
    const sync = () => {
      header.dataset.scrolled = scroller.scrollTop > 6 ? 'true' : 'false';
    };
    sync();
    scroller.addEventListener('scroll', sync, { passive: true });
    return () => scroller.removeEventListener('scroll', sync);
  }, []);

  useEffect(() => {
    const q = value.trim();
    if (q.length < 2) {
      setRows([]);
      return;
    }
    const controller = new AbortController();
    const t = setTimeout(() => {
      api
        .suggest(q, controller.signal)
        .then((s) => {
          setRows(flatten(s));
          setActive(-1);
        })
        .catch(() => undefined);
    }, 160);
    return () => {
      clearTimeout(t);
      controller.abort();
    };
  }, [value]);

  // Keep the keyboard-highlighted suggestion visible in the scrolling list.
  useEffect(() => {
    if (active >= 0) document.getElementById(`suggest-${active}`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  useEffect(() => {
    const onDoc = (e: PointerEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onDoc);
    return () => document.removeEventListener('pointerdown', onDoc);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const submit = (q = value) => {
    const query = q.trim();
    if (!query) return;
    addRecentSearch(query);
    setOpen(false);
    inputRef.current?.blur();
    navigate(`/search?q=${encodeURIComponent(query)}`);
  };

  const choose = (row: Row) => {
    setOpen(false);
    inputRef.current?.blur();
    addRecentSearch(row.item.title);
    if (row.item.type === 'song') {
      void playEntity(row.item);
      return;
    }
    const path = entityPath(row.item);
    if (path) navigate(path);
  };

  const goBack = () => {
    // A deep link has no in-app history; going back would leave the app.
    if (location.key === 'default') navigate('/');
    else navigate(-1);
  };

  const showSuggest = open && rows.length > 0 && value.trim().length >= 2;
  const isRoot = TAB_ROOTS.has(location.pathname);

  return (
    <header className="topbar" ref={headerRef} data-scrolled="false">
      <div className="topbar-inner">
        <div className="topbar-nav desktop-only">
          <button className="circle-btn glass clear" onClick={() => navigate(-1)} aria-label="Back">
            <ChevronLeft />
          </button>
          <button className="circle-btn glass clear" onClick={() => navigate(1)} aria-label="Forward">
            <ChevronRight />
          </button>
        </div>
        {!isRoot && (
          <button className="circle-btn glass clear mobile-only" onClick={goBack} aria-label="Back">
            <ChevronLeft />
          </button>
        )}

        <div className="search" ref={wrapRef}>
          <form
            className="search-box glass"
            role="search"
            onSubmit={(e) => {
              e.preventDefault();
              if (active >= 0 && rows[active]) choose(rows[active]);
              else submit();
            }}
          >
            <SearchIcon size={18} />
            <input
              ref={inputRef}
              type="search"
              value={value}
              placeholder="Songs, artists, albums, playlists"
              aria-label="Search"
              role="combobox"
              aria-expanded={showSuggest}
              aria-controls="search-suggestions"
              aria-autocomplete="list"
              aria-activedescendant={showSuggest && active >= 0 ? `suggest-${active}` : undefined}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
              enterKeyHint="search"
              onChange={(e) => {
                setValue(e.target.value);
                setOpen(true);
              }}
              onFocus={() => setOpen(true)}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  setOpen(true);
                  setActive((a) => Math.min(rows.length - 1, a + 1));
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  setActive((a) => Math.max(-1, a - 1));
                } else if (e.key === 'Escape') {
                  if (showSuggest) setOpen(false);
                  else inputRef.current?.blur();
                }
              }}
            />
            {value ? (
              <button
                type="button"
                className="icon-btn sm"
                aria-label="Clear search"
                onClick={() => {
                  setValue('');
                  setRows([]);
                  inputRef.current?.focus();
                }}
              >
                <Close size={16} />
              </button>
            ) : (
              <kbd className="kbd" aria-hidden>
                {IS_MAC ? '⌘K' : 'Ctrl K'}
              </kbd>
            )}
          </form>

          {/* Keyboard-driven and opened constantly, so it barely moves: a 150ms fade with a 4px drop. */}
          <AnimatePresence>
            {showSuggest && (
              <motion.div
                id="search-suggestions"
                className="suggest glass thick"
                role="listbox"
                aria-label="Suggestions"
                initial={{ opacity: 0, transform: 'translateY(-4px)' }}
                animate={{ opacity: 1, transform: 'translateY(0px)' }}
                exit={{ opacity: 0, transition: { duration: 0.1 } }}
                transition={{ duration: 0.15, ease: EASE_OUT }}
              >
                {rows.map((row, i) => {
                  const header = i === 0 || rows[i - 1].group !== row.group ? row.group : null;
                  return (
                    <div key={`${row.item.type}-${row.item.id}`} role="presentation">
                      {header && (
                        <div className="suggest-group" role="presentation">
                          {header}
                        </div>
                      )}
                      <button
                        type="button"
                        id={`suggest-${i}`}
                        className={`suggest-item ${i === active ? 'active' : ''}`}
                        onPointerMove={() => active !== i && setActive(i)}
                        onClick={() => choose(row)}
                        role="option"
                        aria-selected={i === active}
                        tabIndex={-1}
                      >
                        <Img src={row.item.image} alt="" className={row.item.type === 'artist' ? 'round' : ''} />
                        <span style={{ minWidth: 0 }}>
                          <span className="t truncate" style={{ display: 'block' }}>
                            {row.item.title}
                          </span>
                          <span className="kind truncate" style={{ display: 'block' }}>
                            {describe(row.item)}
                          </span>
                        </span>
                        <span className="type">{row.item.type}</span>
                      </button>
                    </div>
                  );
                })}
                <button type="button" className="suggest-item suggest-all" onClick={() => submit()} tabIndex={-1}>
                  <span>
                    <SearchIcon size={18} />
                  </span>
                  <span className="truncate">See all results for “{value.trim()}”</span>
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="topbar-end">
          <button
            className="circle-btn glass clear mobile-only"
            onClick={() => navigate('/settings')}
            aria-label="Settings"
            aria-current={location.pathname === '/settings' ? 'page' : undefined}
          >
            <Settings size={19} />
          </button>
        </div>
      </div>
    </header>
  );
}
