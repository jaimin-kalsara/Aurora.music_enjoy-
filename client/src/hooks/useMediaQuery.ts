import { useSyncExternalStore } from 'react';

/** Subscribes to a CSS media query. Used where layout breakpoints change behaviour, not just styling. */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mql = window.matchMedia(query);
      mql.addEventListener('change', onChange);
      return () => mql.removeEventListener('change', onChange);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

export const COMPACT_QUERY = '(max-width: 900px)';
