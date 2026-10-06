import { NavLink, useLocation } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { Compass, Heart, Home, Library, Note, Settings, Sparkle } from './Icons';
import { useLibrary } from '../store/library';
import { SPRING_LIVELY } from '../utils/motion';

const nav = [
  { to: '/', label: 'Home', icon: Home, end: true },
  { to: '/explore', label: 'Explore', icon: Compass },
  { to: '/moods', label: 'Moods', icon: Sparkle },
  { to: '/library', label: 'Library', icon: Library },
];

export function Sidebar() {
  const likedCount = useLibrary((s) => s.likedOrder.length);
  const location = useLocation();
  const likedTab = location.pathname === '/library' && new URLSearchParams(location.search).get('tab') === 'liked';

  return (
    <aside className="sidebar glass" aria-label="Main">
      <div className="brand">
        <span className="brand-mark" aria-hidden>
          <Note size={18} />
        </span>
        Aurora
      </div>
      <nav style={{ display: 'contents' }}>
        {nav.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            // "Liked Songs" has its own entry; don't light up Library at the same time.
            className={({ isActive }) => `nav-item ${isActive && !(to === '/library' && likedTab) ? 'active' : ''}`}
          >
            <Icon size={20} />
            {label}
          </NavLink>
        ))}
        <div className="nav-label">Your music</div>
        <NavLink to="/library?tab=liked" className={() => `nav-item ${likedTab ? 'active' : ''}`} aria-current={likedTab ? 'page' : undefined}>
          <Heart size={20} />
          Liked Songs
          {likedCount > 0 && <span className="nav-count">{likedCount.toLocaleString()}</span>}
        </NavLink>
        <NavLink to="/settings" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
          <Settings size={20} />
          Settings
        </NavLink>
      </nav>
      <div className="sidebar-footer">
        Powered by YouTube Music.
        <br />
        Opus 160 kbps · synced lyrics.
      </div>
    </aside>
  );
}

export function TabBar() {
  const reduceMotion = useReducedMotion();
  return (
    <nav className="tabbar glass" aria-label="Main">
      {nav.map(({ to, label, icon: Icon, end }) => (
        <NavLink key={to} to={to} end={end} className={({ isActive }) => (isActive ? 'active' : '')}>
          {({ isActive }) => (
            <>
              {/* The selection is a lens that glides between tabs, like the iOS tab bar. */}
              {isActive && <motion.span layoutId="tab-pill" className="tab-pill" transition={reduceMotion ? { duration: 0 } : SPRING_LIVELY} />}
              <Icon size={22} />
              <span>{label}</span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}
