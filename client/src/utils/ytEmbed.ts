// Fallback playback through YouTube's official IFrame player. It runs in the listener's browser on
// their own connection, so it keeps working when YouTube bot-blocks our server's datacenter IP.

interface YTPlayer {
  loadVideoById(opts: { videoId: string; startSeconds?: number }): void;
  cueVideoById(opts: { videoId: string; startSeconds?: number }): void;
  playVideo(): void;
  pauseVideo(): void;
  stopVideo(): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  setVolume(volume: number): void;
  getCurrentTime(): number;
  getDuration(): number;
  getPlayerState(): number;
}

interface YTNamespace {
  Player: new (
    el: HTMLElement,
    opts: {
      width: number;
      height: number;
      playerVars: Record<string, number | string>;
      events: {
        onReady: () => void;
        onStateChange: (e: { data: number }) => void;
        onError: (e: { data: number }) => void;
      };
    },
  ) => YTPlayer;
}

export const YT_STATE = { UNSTARTED: -1, ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3, CUED: 5 } as const;

export interface EmbedHandlers {
  onState: (state: number) => void;
  onError: (code: number) => void;
}

let apiPromise: Promise<YTNamespace> | null = null;

function loadApi(): Promise<YTNamespace> {
  if (apiPromise) return apiPromise;
  apiPromise = new Promise<YTNamespace>((resolve, reject) => {
    const w = window as unknown as { YT?: YTNamespace & { loaded?: number }; onYouTubeIframeAPIReady?: () => void };
    if (w.YT?.Player) return resolve(w.YT);
    const prev = w.onYouTubeIframeAPIReady;
    w.onYouTubeIframeAPIReady = () => {
      prev?.();
      resolve(w.YT as YTNamespace);
    };
    const s = document.createElement('script');
    s.src = 'https://www.youtube.com/iframe_api';
    s.async = true;
    s.onerror = () => {
      apiPromise = null;
      reject(new Error('Could not load the YouTube player'));
    };
    document.head.appendChild(s);
  });
  return apiPromise;
}

let playerPromise: Promise<YTPlayer> | null = null;

/** The single shared embed player (created on first use, kept offscreen). */
export function getEmbedPlayer(handlers: EmbedHandlers): Promise<YTPlayer> {
  if (playerPromise) return playerPromise;
  playerPromise = loadApi().then(
    (YT) =>
      new Promise<YTPlayer>((resolve) => {
        const host = document.createElement('div');
        host.setAttribute('aria-hidden', 'true');
        // Offscreen but still "visible" to the browser, so it is allowed to play.
        Object.assign(host.style, { position: 'fixed', left: '-10000px', bottom: '0', width: '200px', height: '200px', pointerEvents: 'none' });
        const mount = document.createElement('div');
        host.appendChild(mount);
        document.body.appendChild(host);
        const player: YTPlayer = new YT.Player(mount, {
          width: 200,
          height: 200,
          playerVars: { autoplay: 0, controls: 0, disablekb: 1, fs: 0, playsinline: 1, rel: 0, iv_load_policy: 3, origin: window.location.origin },
          events: {
            onReady: () => resolve(player),
            onStateChange: (e) => handlers.onState(e.data),
            onError: (e) => handlers.onError(e.data),
          },
        });
      }),
  );
  playerPromise.catch(() => {
    playerPromise = null;
  });
  return playerPromise;
}

/* Remember that the server is blocked so later visits go straight to the embed player. */
const KEY = 'aurora.embedMode';
const TTL = 6 * 60 * 60 * 1000; // re-check the server every few hours

export function embedModeRemembered(): boolean {
  try {
    const until = Number(localStorage.getItem(KEY) || 0);
    return until > Date.now();
  } catch {
    return false;
  }
}

export function rememberEmbedMode() {
  try {
    localStorage.setItem(KEY, String(Date.now() + TTL));
  } catch {
    /* storage unavailable */
  }
}
