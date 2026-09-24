# Aurora Music

A YouTube Music–style streaming web app: live catalog with the latest releases, charts and trending songs, mood-based listening sessions, full search, and a complete player (queue, shuffle, repeat, lyrics, autoplay) in a dark, Apple-inspired interface with soft motion.

## Stack

| Layer  | Tech                                                                        |
| ------ | --------------------------------------------------------------------------- |
| Client | React 19 · TypeScript · Vite · React Router · Zustand · Framer Motion        |
| Server | Node 20+ · Express — normalizes the catalog API and decrypts stream URLs     |
| Audio  | Native `<audio>` streaming 320 kbps AAC (highest tier the catalog provides)  |

Songs, albums, artists, playlists, charts, lyrics and artwork come from the JioSaavn web catalog, so every new release is available the moment it is published there. The Express server is the only thing that talks to the catalog; the browser talks to `/api/*`.

## Run it

```bash
npm install
npm run dev
```

- Web app: https://aurora-the-music.onrender.com/

### Production

```bash
npm run build      # builds client/dist
npm start          # serves the API and the built client on http://localhost:3001
```

`PORT` overrides the port.

### Deploy on Render

This repository includes `render.yaml` for a single Render web service. Create a new Blueprint from the repository and Render will run the client build, start the Express server, and use `/api/health` for health checks.

YouTube blocks most cloud/datacenter IPs (including Render) with *"Sign in to confirm you're not a bot"*, so audio will not play on a fresh deploy until you set at least one of these environment variables in the Render dashboard:

| Variable    | Value |
| ----------- | ----- |
| `YT_COOKIE` | The `Cookie` request header from a signed-in `music.youtube.com` tab (DevTools → Network → any request → Request Headers → `cookie`). Use a secondary Google account. |
| `YT_PROXY`  | An HTTP(S) proxy URL, e.g. `http://user:pass@host:port`. Residential proxies work best. |

When the server is blocked anyway, the player stops with a message instead of skipping through the queue.

### Tests

```bash
npm test           # server unit tests (normalizers, stream decryption, moods)
```

## Features

- **Home** — Trending now, new releases, top charts, editorial picks, what's hot near you, artists to explore, plus "Continue listening" from your history.
- **Moods** — Happy, Romantic, Sad, Chill, Energetic, Party, Focus, Sleep, Travel, Retro, Devotional, Motivation. Each mood builds a long queue (editorial channel songs + top playlists) with Play / Shuffle.
- **Search** — Live suggestions (⌘K / Ctrl+K), full results with Songs / Albums / Artists / Playlists tabs and "load more".
- **Player** — Play/pause, previous/next, seek, volume, shuffle, repeat (off/all/one), queue drawer with play-next / add-to-queue / remove, full-screen Now Playing with blurred artwork and lyrics, autoplay of related songs when the queue ends, OS media-key support (Media Session API), keyboard shortcuts.
- **Library** — Liked songs and recently played, stored locally.
- **Settings** — Streaming quality (Ultra 320 / High 160 / Data saver 96 kbps), autoplay, music languages for the home feed.

## API (server)

| Endpoint                          | Description                                    |
| --------------------------------- | ---------------------------------------------- |
| `GET /api/home?lang=hindi,english`| Home sections                                  |
| `GET /api/search?q=&type=&page=`  | Search (type: all/songs/albums/artists/playlists) |
| `GET /api/search/suggest?q=`      | Autocomplete                                   |
| `GET /api/songs/:ids`             | Song details with stream urls                  |
| `GET /api/albums/:id`             | Album with songs                               |
| `GET /api/playlists/:id`          | Playlist with songs                            |
| `GET /api/artists/:id`            | Artist page (top songs, albums, singles, bio)  |
| `GET /api/artists/:id/songs?page=`| More songs by an artist                        |
| `GET /api/lyrics/:id`             | Lyrics                                         |
| `GET /api/radio/:id`              | Related songs for autoplay                     |
| `GET /api/moods`, `/api/moods/:key` | Mood catalogue and a mood's songs/playlists |
| `GET /api/trending`, `/api/charts`, `/api/new-releases` | Discovery feeds           |

## Keyboard shortcuts

Space play/pause · ←/→ seek 5s · Shift+←/→ previous/next · M mute · ⌘K / Ctrl+K focus search · Esc close Now Playing
