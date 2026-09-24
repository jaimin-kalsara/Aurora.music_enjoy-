import { useEffect, useRef, useState } from 'react';
import { usePlayer, useCurrentSong } from '../store/player';
import { useLibrary } from '../store/library';
import { api } from '../api';
import { toast } from '../store/toast';
import type { Quality, Song } from '../types';
import { YT_STATE, embedModeRemembered, getEmbedPlayer, rememberEmbedMode, type EmbedHandlers } from '../utils/ytEmbed';

/** Opus (WebM) is the best quality YouTube Music offers; Safari only plays the AAC (m4a) ladder. */
const supportsOpus = (() => {
  try {
    return typeof Audio !== 'undefined' && new Audio().canPlayType('audio/webm; codecs="opus"') !== '';
  } catch {
    return false;
  }
})();
export const STREAM_FORMAT: 'webm' | 'm4a' = supportsOpus ? 'webm' : 'm4a';

export function pickStream(song: Song, quality: Quality): string | null {
  if (!song.streams) return null;
  const base = quality === 'high' ? song.streams.high : quality === 'medium' ? song.streams.medium : song.streams.low;
  return `${base}${base.includes('?') ? '&' : '?'}fmt=${STREAM_FORMAT}`;
}

/** Human label for the active stream tier. */
export function qualityLabel(quality: Quality): string {
  if (quality === 'high') return supportsOpus ? 'Opus · 160 kbps' : 'AAC · 128 kbps';
  if (quality === 'medium') return supportsOpus ? 'Opus · 70 kbps' : 'AAC · 128 kbps';
  return supportsOpus ? 'Opus · 50 kbps' : 'AAC · 48 kbps';
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
  const playedSeconds = useRef(0);
  const switching = useRef(false);
  // Embed mode: play through YouTube's IFrame player in the browser because our server is blocked.
  const [embed, setEmbed] = useState(embedModeRemembered);
  const embedRef = useRef(embed);
  const embedLoadedId = useRef<string | null>(null);
  useEffect(() => {
    embedRef.current = embed;
  }, [embed]);

  const song = useCurrentSong();
  const playing = usePlayer((s) => s.playing);
  const seekTo = usePlayer((s) => s.seekTo);
  const repeat = usePlayer((s) => s.repeat);
  const autoplayPending = usePlayer((s) => s.autoplayPending);
  const nextSong = usePlayer((s) => s.queue[s.index + 1] ?? null);
  const quality = useLibrary((s) => s.settings.quality);
  const volume = useLibrary((s) => s.settings.volume);
  const autoplay = useLibrary((s) => s.settings.autoplay);

  /** A single track failed: skip it, but give up after a few failures in a row. */
  const [skipFailed] = useState(() => (title: string) => {
    const store = usePlayer.getState();
    failures.current += 1;
    if (failures.current > 3) {
      store.setPlaying(false);
      toast('Playback stopped: too many failed tracks', 'error');
      failures.current = 0;
      return;
    }
    toast(`Couldn't play “${title}”, skipping`, 'error');
    setTimeout(() => usePlayer.getState().next(), 400);
  });

  const [embedHandlers] = useState<EmbedHandlers>(() => ({
    onState: (state) => {
      const store = usePlayer.getState();
      if (state === YT_STATE.BUFFERING) store.setBuffering(true);
      else if (state === YT_STATE.PLAYING) {
        store.setBuffering(false);
        failures.current = 0;
        if (!store.playing) store.setPlaying(true);
      } else if (state === YT_STATE.PAUSED) {
        store.setBuffering(false);
        if (store.playing) store.setPlaying(false);
      } else if (state === YT_STATE.ENDED) {
        if (store.repeat === 'one') store.seek(0);
        else store.next();
      }
    },
    onError: () => {
      const current = usePlayer.getState().queue[usePlayer.getState().index];
      usePlayer.getState().setBuffering(false);
      if (current) skipFailed(current.title);
    },
  }));

  // Create the element once.
  useEffect(() => {
    const a = new Audio();
    a.preload = 'auto';
    a.crossOrigin = 'anonymous';
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
    let lastTick = 0;
    const onTime = () => {
      // Throttle store updates to ~4/s; the UI interpolates between them.
      const now = performance.now();
      if (now - lastTick < 240 && !a.paused) return;
      lastTick = now;
      const current = store().queue[store().index];
      store().setProgress(a.currentTime, a.duration || current?.duration || 0);
      playedSeconds.current = a.currentTime;
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
      const current = store().queue[store().index];
      store().setProgress(a.currentTime, a.duration || current?.duration || 0);
    };
    const onError = async () => {
      const current = store().queue[store().index];
      const src = a.src;
      if (!current || !src) return;
      store().setBuffering(false);
      // <audio> hides the HTTP status, so ask the server why. If the whole server is blocked by
      // YouTube, every track would fail the same way: stop instead of skipping through the queue.
      const reason = await fetch(src, { headers: { Range: 'bytes=0-0' } })
        .then(async (r) => (r.ok ? null : ((await r.json().catch(() => null)) as { code?: string } | null)))
        .catch(() => null);
      if (a.src !== src) return; // user already moved on
      if (reason?.code === 'BLOCKED') {
        // Our server can't reach YouTube; play through the YouTube player in this browser instead.
        failures.current = 0;
        rememberEmbedMode();
        setEmbed(true);
        return;
      }
      skipFailed(current.title);
    };
    // Keep the store honest when the OS pauses/resumes us (audio focus loss, headphones unplugged).
    // Pauses fired by loading a new source or by reaching the end are ignored.
    const onPause = () => {
      if (a.ended || switching.current || embedRef.current) return;
      if (store().playing) store().setPlaying(false);
    };
    const onPlay = () => {
      if (!store().playing) store().setPlaying(true);
    };
    const onPlaying = () => {
      switching.current = false;
    };
    a.addEventListener('pause', onPause);
    a.addEventListener('play', onPlay);
    a.addEventListener('playing', onPlaying);
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
        ms.setActionHandler('seekbackward', (d) => store().seek(Math.max(0, store().currentTime - (d.seekOffset || 10))));
        ms.setActionHandler('seekforward', (d) => store().seek(Math.min(store().duration || 0, store().currentTime + (d.seekOffset || 10))));
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
        store().seek(Math.min(store().duration || 0, store().currentTime + 5));
      } else if (e.key === 'ArrowLeft') {
        store().seek(Math.max(0, store().currentTime - 5));
      } else if (e.key.toLowerCase() === 'm') {
        const lib = useLibrary.getState();
        lib.updateSettings({ volume: lib.settings.volume > 0 ? 0 : 0.8 });
      } else if (e.key.toLowerCase() === 'l') {
        const s = store();
        if (s.queue.length) {
          s.setNowPlayingOpen(true);
          s.setLyricsOpen(!s.lyricsOpen);
        }
      }
    };
    window.addEventListener('keydown', onKey);
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
  }, [skipFailed]);

  // Track or quality change → load source.
  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    if (!song) {
      a.pause();
      a.removeAttribute('src');
      if (embed) void getEmbedPlayer(embedHandlers).then((p) => p.stopVideo());
      embedLoadedId.current = null;
      lastSongId.current = null;
      document.title = 'Aurora Music';
      return;
    }
    const sameSong = lastSongId.current === song.id;
    if (embed) {
      if (a.src) {
        a.pause();
        a.removeAttribute('src');
      }
      if (embedLoadedId.current !== song.id) {
        // Switching engines mid-track keeps the position; a new track starts from the top.
        const startSeconds = sameSong ? usePlayer.getState().currentTime : 0;
        embedLoadedId.current = song.id;
        const id = song.id;
        void getEmbedPlayer(embedHandlers)
          .then((p) => {
            if (embedLoadedId.current !== id) return;
            p.setVolume(Math.round(Math.min(1, Math.max(0, useLibrary.getState().settings.volume)) * 100));
            if (usePlayer.getState().playing) p.loadVideoById({ videoId: id, startSeconds });
            else p.cueVideoById({ videoId: id, startSeconds });
          })
          .catch(() => {
            usePlayer.getState().setPlaying(false);
            toast('Could not load the YouTube player. Check your connection.', 'error');
          });
      }
    } else {
      const url = pickStream(song, quality);
      if (!url) {
        usePlayer.getState().next();
        return;
      }
      const absolute = new URL(url, window.location.origin).toString();
      if (sameSong && a.currentSrc && a.currentSrc !== absolute) {
        resumeAt.current = a.currentTime; // quality switch mid-track
      }
      if (!sameSong || a.currentSrc !== absolute) {
        switching.current = true;
        a.src = url;
        a.load();
      }
    }
    if (!sameSong) {
      // A skip is a track that was left before 30% or 30 seconds.
      const previous = lastSongId.current;
      if (previous && playedSeconds.current < 30) void api.recordSkip(previous).catch(() => undefined);
      playedSeconds.current = 0;
      lastSongId.current = song.id;
      useLibrary.getState().addRecent(song);
      const ctx = usePlayer.getState().context;
      void api
        .recordPlay(song.id, {
          language: song.language || undefined,
          artistIds: song.artists.map((x) => x.id).filter(Boolean),
          mood: ctx?.type === 'mood' ? ctx.id : undefined,
          context: ctx?.type,
        })
        .catch(() => undefined);
      document.title = `${song.title} · ${song.artistNames || song.subtitle} — Aurora`;
      if ('mediaSession' in navigator) {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: song.title,
          artist: song.artistNames || song.subtitle,
          album: song.album.name,
          artwork: [{ src: song.image, sizes: '544x544', type: 'image/jpeg' }],
        });
      }
    }
    if (usePlayer.getState().playing && !embed) {
      a.play().catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'NotAllowedError') {
          usePlayer.getState().setPlaying(false);
          toast('Tap play to start listening');
        }
      });
    }
  }, [song, quality, embed, embedHandlers]);

  // Play / pause.
  useEffect(() => {
    const a = audioRef.current;
    if (!a || !song) return;
    if (embed) {
      void getEmbedPlayer(embedHandlers).then((p) => {
        if (embedLoadedId.current !== song.id) return;
        const state = p.getPlayerState();
        if (playing && state !== YT_STATE.PLAYING && state !== YT_STATE.BUFFERING) p.playVideo();
        else if (!playing && (state === YT_STATE.PLAYING || state === YT_STATE.BUFFERING)) p.pauseVideo();
      });
    } else if (playing) {
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
  }, [playing, song, embed, embedHandlers]);

  // Browsers may refuse to start the embed without a tap; don't show "playing" when nothing plays.
  useEffect(() => {
    if (!embed || !playing || !song) return;
    const timer = setTimeout(() => {
      void getEmbedPlayer(embedHandlers).then((p) => {
        const state = p.getPlayerState();
        if (usePlayer.getState().playing && (state === YT_STATE.UNSTARTED || state === YT_STATE.CUED)) {
          usePlayer.getState().setPlaying(false);
          toast('Tap play to start listening');
        }
      });
    }, 6000);
    return () => clearTimeout(timer);
  }, [embed, playing, song, embedHandlers]);

  // Embed mode: poll the YouTube player for progress (it has no timeupdate event).
  useEffect(() => {
    if (!embed) return;
    const timer = setInterval(() => {
      void getEmbedPlayer(embedHandlers).then((p) => {
        const state = p.getPlayerState();
        if (state !== YT_STATE.PLAYING && state !== YT_STATE.PAUSED && state !== YT_STATE.BUFFERING) return;
        const store = usePlayer.getState();
        const current = store.queue[store.index];
        if (!current || embedLoadedId.current !== current.id) return;
        const time = p.getCurrentTime() || 0;
        playedSeconds.current = time;
        store.setProgress(time, p.getDuration() || current.duration || 0);
      });
    }, 250);
    return () => clearInterval(timer);
  }, [embed, embedHandlers]);

  // Seek command.
  useEffect(() => {
    const a = audioRef.current;
    if (!a || seekTo === null) return;
    if (Number.isFinite(seekTo)) {
      if (embed) {
        void getEmbedPlayer(embedHandlers).then((p) => {
          p.seekTo(seekTo, true);
          if (usePlayer.getState().playing) p.playVideo();
        });
      } else a.currentTime = seekTo;
    }
    usePlayer.getState().consumeSeek();
  }, [seekTo, embed, embedHandlers]);

  // Volume.
  useEffect(() => {
    const a = audioRef.current;
    const v = Math.min(1, Math.max(0, volume));
    if (a) a.volume = v;
    if (embed) void getEmbedPlayer(embedHandlers).then((p) => p.setVolume(Math.round(v * 100)));
  }, [volume, embed, embedHandlers]);

  // Prefetch the next track once we're a good way into the current one.
  useEffect(() => {
    const p = prefetchRef.current;
    if (!p || !nextSong || embed) return;
    const url = pickStream(nextSong, quality);
    if (!url) return;
    let done = false;
    const unsub = usePlayer.subscribe((s) => {
      if (done) return;
      if (s.duration && s.currentTime / s.duration > 0.5) {
        done = true;
        if (!p.src.endsWith(url)) {
          p.src = url;
          p.load();
        }
      }
    });
    return unsub;
  }, [nextSong, quality, embed]);

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
