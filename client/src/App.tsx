import { lazy, Suspense, useCallback, useRef } from 'react';
import { Link, Route, Routes, useLocation } from 'react-router-dom';
import { AnimatePresence, MotionConfig, motion, useReducedMotion } from 'framer-motion';
import { Sidebar, TabBar } from './components/Sidebar';
import { TopBar } from './components/TopBar';
import { PlayerBar } from './components/PlayerBar';
import { NowPlaying } from './components/NowPlaying';
import { QueuePanel } from './components/QueuePanel';
import { AudioEngine } from './components/AudioEngine';
import { Ambient } from './components/Ambient';
import { Toasts } from './components/Toasts';
import { Home } from './pages/Home';
import { Explore } from './pages/Explore';
import { MoodsPage } from './pages/MoodsPage';
import { MoodPage } from './pages/MoodPage';
import { SearchPage } from './pages/SearchPage';
import { LibraryPage } from './pages/LibraryPage';
import { AlbumPage } from './pages/AlbumPage';
import { PlaylistPage } from './pages/PlaylistPage';
import { ArtistPage } from './pages/ArtistPage';
import { SettingsPage } from './pages/SettingsPage';
import { CollectionPage } from './pages/CollectionPage';
import { EASE_OUT } from './utils/motion';

// Dev-only worst-case data switch (?data=worst). The ternary is compiled away in production builds.
const DataToggle = import.meta.env.DEV ? lazy(() => import('./dev/DataToggle')) : null;

function NotFound() {
  return (
    <div className="page">
      <div className="empty">
        <h3>That page doesn’t exist</h3>
        <p>It may have moved, or the link is incomplete.</p>
        <Link to="/" className="btn btn-ghost glass clear btn-sm">
          Go home
        </Link>
      </div>
    </div>
  );
}

export default function App() {
  const location = useLocation();
  const contentRef = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion();

  // Route changes are frequent, so the transition is a quick fade: 120ms out, 220ms in.
  const pageMotion = {
    initial: reduceMotion ? { opacity: 0 } : { opacity: 0, transform: 'translateY(8px)' },
    animate: reduceMotion
      ? { opacity: 1, transition: { duration: 0.2 } }
      : { opacity: 1, transform: 'translateY(0px)', transition: { duration: 0.22, ease: EASE_OUT } },
    exit: { opacity: 0, transition: { duration: 0.12, ease: EASE_OUT } },
  };

  // Reset scroll between the old page leaving and the new one arriving, so nothing visibly jumps.
  const resetScroll = useCallback(() => {
    if (window.location.hash) return;
    contentRef.current?.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }, []);

  const routeKey = location.pathname + (location.pathname === '/search' ? location.search.replace(/&tab=[a-z]+/, '') : '');

  return (
    <MotionConfig reducedMotion="user">
      <Ambient />
      <div className="app">
        <Sidebar />
        <main className="main">
          <div className="content" ref={contentRef}>
            <TopBar />
            <AnimatePresence mode="wait" initial={false} onExitComplete={resetScroll}>
              <motion.div key={routeKey} {...pageMotion}>
                <Routes location={location}>
                  <Route path="/" element={<Home />} />
                  <Route path="/explore" element={<Explore />} />
                  <Route path="/moods" element={<MoodsPage />} />
                  <Route path="/moods/:key" element={<MoodPage />} />
                  <Route path="/search" element={<SearchPage />} />
                  <Route path="/library" element={<LibraryPage />} />
                  <Route path="/album/:id" element={<AlbumPage />} />
                  <Route path="/playlist/:id" element={<PlaylistPage />} />
                  <Route path="/artist/:id" element={<ArtistPage />} />
                  <Route path="/settings" element={<SettingsPage />} />
                  <Route path="/recommendations/for-you" element={<CollectionPage kind="for-you" />} />
                  <Route path="/recommendations/discover-weekly" element={<CollectionPage kind="discover-weekly" />} />
                  <Route path="/mix/:key" element={<CollectionPage kind="mix" />} />
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </motion.div>
            </AnimatePresence>
          </div>
        </main>
        <PlayerBar />
        <TabBar />
        <QueuePanel />
        <NowPlaying />
        <Toasts />
        <AudioEngine />
        {DataToggle && (
          <Suspense fallback={null}>
            <DataToggle />
          </Suspense>
        )}
      </div>
    </MotionConfig>
  );
}
