import { useEffect, useRef } from 'react';
import { usePlayer, useCurrentSong } from '../store/player';
import { useLibrary } from '../store/library';
import { useRecommendations } from '../store/recommendations';
import { api } from '../api';
import { toast } from '../store/toast';
import type { Quality, Song } from '../types';

/** Toasts quote the title; keep long ones from turning a status message into a paragraph. */
const short = (title: string) => (title.length > 42 ? `${title.slice(0, 40).trimEnd()}…` : title);

export function pickStream(song: Song, quality: Quality): string | null {
  if (!song.streams) return null;
  return quality === 'high' ? song.streams.high : quality === 'medium' ? song.streams.medium : song.streams.low;
}

/**
 * Owns the single <audio> element. Mirrors the player store into the element and
 * reports playback progress back. Also handles OS media keys, autoplay radio, and
 * prefetching the next track so transitions are seamless.
 */
export function AudioEngine() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const prefetchRef = useRef<HTMLAudioElement | null>(null);
  const lastSongId = useRef<string | null>(null);
  const resumeAt = useRef<number | null>(null);
  const failures = useRef(0);

  const song = useCurrentSong();
  const playing = usePlayer((s) => s.playing);
  const seekTo = usePlayer((s) => s.seekTo);
  const repeat = usePlayer((s) => s.repeat);
  const autoplayPending = usePlayer((s) => s.autoplayPending);
  const nextSong = usePlayer((s) => s.queue[s.index + 1] ?? null);
  const quality = useLibrary((s) => s.settings.quality);
  const volume = useLibrary((s) => s.settings.volume);
  const autoplay = useLibrary((s) => s.settings.autoplay);

  // Create the element once.
  useEffect(() => {
    const a = new Audio();
    a.preload = 'auto';
    audioRef.current = a;
    const p = new Audio();
    p.preload = 'auto';
    p.muted = true;
    prefetchRef.current = p;
    if (import.meta.env.DEV) {
      const w = window as unknown as { __aurora?: Record<string, unknown> };
      w.__aurora = { ...(w.__aurora ?? {}), audio: a };
    }

    const store = usePlayer.getState;
    const onTime = () => {
      const current = store().queue[store().index];
      store().setProgress(a.currentTime, a.duration || current?.duration || 0);
    };
    const onWaiting = () => store().setBuffering(true);
    const onReady = () => store().setBuffering(false);
    const onEnded = () => {
      if (store().repeat === 'one') {
        a.currentTime = 0;
        void a.play();
      } else {
        store().next();
      }
    };
    const onLoaded = () => {
      if (resumeAt.current !== null) {
        a.currentTime = resumeAt.current;
        resumeAt.current = null;
      }
      failures.current = 0;
    };
    const onError = () => {
      const current = store().queue[store().index];
      if (!current || !a.getAttribute('src')) return;
      store().setBuffering(false);
      // While paused, report it but stay put: skipping would call next(), which starts playback on its own.
      if (!store().playing) {
        toast(`Couldn't load “${short(current.title)}”`, 'error');
        return;
      }
      failures.current += 1;
      if (failures.current > 3) {
        store().setPlaying(false);
        toast('Playback stopped: too many failed tracks', 'error');
        failures.current = 0;
        return;
      }
      toast(`Couldn't play “${short(current.title)}”, skipping`, 'error');
      setTimeout(() => store().next(), 400);
    };
    a.addEventListener('timeupdate', onTime);
    a.addEventListener('durationchange', onTime);
    a.addEventListener('waiting', onWaiting);
    a.addEventListener('stalled', onWaiting);
    a.addEventListener('playing', onReady);
    a.addEventListener('canplay', onReady);
    a.addEventListener('loadedmetadata', onLoaded);
    a.addEventListener('ended', onEnded);
    a.addEventListener('error', onError);

    // Media keys / lock screen controls.
    if ('mediaSession' in navigator) {
      const ms = navigator.mediaSession;
      ms.setActionHandler('play', () => store().setPlaying(true));
      ms.setActionHandler('pause', () => store().setPlaying(false));
      ms.setActionHandler('previoustrack', () => store().prev());
      ms.setActionHandler('nexttrack', () => store().next());
      try {
        ms.setActionHandler('seekto', (d) => {
          if (typeof d.seekTime === 'number') store().seek(d.seekTime);
        });
      } catch {
        /* unsupported */
      }
    }

    // Keyboard shortcuts.
    const onKey = (e: KeyboardEvent) => {
      const isEditable = (el: Element | null) =>
        Boolean(el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || (el as HTMLElement).isContentEditable));
      if (isEditable(e.target as Element | null) || isEditable(document.activeElement)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const active = document.activeElement;
      const role = active?.getAttribute('role');
      // Let focused controls handle their own activation keys (Space on a button, arrows on a slider).
      const focusedControl = Boolean(active && (active.tagName === 'BUTTON' || active.tagName === 'A' || role === 'button' || role === 'slider'));
      if (e.key === ' ' || e.code === 'Space') {
        if (focusedControl) return;
        e.preventDefault();
        store().toggle();
      } else if (role === 'slider' && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
        return;
      } else if (e.key === 'ArrowRight' && e.shiftKey) {
        store().next();
      } else if (e.key === 'ArrowLeft' && e.shiftKey) {
        store().prev();
      } else if (e.key === 'ArrowRight') {
        store().seek(Math.min((a.duration || 0), a.currentTime + 5));
      } else if (e.key === 'ArrowLeft') {
        store().seek(Math.max(0, a.currentTime - 5));
      } else if (e.key.toLowerCase() === 'm') {
        const lib = useLibrary.getState();
        lib.updateSettings({ volume: lib.settings.volume > 0 ? 0 : 0.8 });
      }
    };
    window.addEventListener('keydown', onKey);
    // After a mouse click on a button, drop focus so Space keeps controlling playback.
    const onPointerUp = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      const el = document.activeElement as HTMLElement | null;
      if (el && el.tagName === 'BUTTON') el.blur();
    };
    document.addEventListener('pointerup', onPointerUp);

    return () => {
      a.pause();
      a.removeAttribute('src');
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerup', onPointerUp);
    };
  }, []);

  // Track or quality change → load source.
  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    if (!song) {
      a.pause();
      a.removeAttribute('src');
      lastSongId.current = null;
      document.title = 'Aurora Music';
      return;
    }
    const url = pickStream(song, quality);
    if (!url) {
      usePlayer.getState().next();
      return;
    }
    const sameSong = lastSongId.current === song.id;
    if (sameSong && a.currentSrc && a.currentSrc !== url) {
      resumeAt.current = a.currentTime; // quality switch mid-track
    }
    if (!sameSong || a.currentSrc !== url) {
      a.src = url;
      a.load();
    }
    if (!sameSong) {
      lastSongId.current = song.id;
      useLibrary.getState().addRecent(song);
      const ctx = usePlayer.getState().context;
      void useRecommendations.getState().recordPlay(song.id, {
        language: song.language,
        artistIds: song.artists.map((a) => a.id).filter(Boolean),
        context: ctx?.type,
        mood: ctx?.type === 'mood' ? ctx.id : undefined,
      });
      document.title = `${song.title} · ${song.artistNames || song.subtitle} — Aurora`;
      if ('mediaSession' in navigator) {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: song.title,
          artist: song.artistNames || song.subtitle,
          album: song.album.name,
          artwork: [{ src: song.image, sizes: '500x500', type: 'image/jpeg' }],
        });
      }
    }
    if (usePlayer.getState().playing) {
      a.play().catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'NotAllowedError') {
          usePlayer.getState().setPlaying(false);
          toast('Tap play to start listening');
        }
      });
    }
  }, [song, quality]);

  // Play / pause.
  useEffect(() => {
    const a = audioRef.current;
    if (!a || !song) return;
    if (playing) {
      if (!a.src) return;
      a.play().catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'NotAllowedError') {
          usePlayer.getState().setPlaying(false);
        }
      });
    } else {
      a.pause();
    }
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = playing ? 'playing' : 'paused';
  }, [playing, song]);

  // Seek command.
  useEffect(() => {
    const a = audioRef.current;
    if (!a || seekTo === null) return;
    if (Number.isFinite(seekTo)) a.currentTime = seekTo;
    usePlayer.getState().consumeSeek();
  }, [seekTo]);

  // Volume.
  useEffect(() => {
    const a = audioRef.current;
    if (a) a.volume = Math.min(1, Math.max(0, volume));
  }, [volume]);

  // Prefetch the next track once we're a good way into the current one.
  useEffect(() => {
    const p = prefetchRef.current;
    if (!p || !nextSong) return;
    const url = pickStream(nextSong, quality);
    if (!url) return;
    let done = false;
    const unsub = usePlayer.subscribe((s) => {
      if (done) return;
      if (s.duration && s.currentTime / s.duration > 0.5) {
        done = true;
        if (p.src !== url) {
          p.src = url;
          p.load();
        }
      }
    });
    return unsub;
  }, [nextSong, quality]);

  // Queue exhausted → autoplay related songs.
  useEffect(() => {
    if (!autoplayPending || !song) return;
    const store = usePlayer.getState();
    if (!autoplay || repeat === 'one') {
      store.setAutoplayPending(false);
      store.setPlaying(false);
      return;
    }
    let cancelled = false;
    api
      .radio(song.id)
      .then((r) => {
        if (cancelled) return;
        usePlayer.getState().appendRadio(r.songs);
        if (r.songs.length) toast('Autoplay: continuing with similar songs');
      })
      .catch(() => {
        if (cancelled) return;
        usePlayer.getState().setAutoplayPending(false);
        usePlayer.getState().setPlaying(false);
      });
    return () => {
      cancelled = true;
    };
  }, [autoplayPending, song, autoplay, repeat]);

  return null;
}
