// Dev-only fixtures for stress-testing the UI with realistic worst-case data. Never imported in production.
import type { Song } from '../types';

const ART = {
  a: 'https://c.saavncdn.com/067/Finding-Her-Hindi-2025-20250104190643-500x500.jpg',
  b: 'https://c.saavncdn.com/450/Gehra-Hua-From-Dhurandhar-Hindi-2025-20251205154217-500x500.jpg',
  c: 'https://c.saavncdn.com/929/Pal-Pal-Hindi-2025-20250217003516-500x500.jpg',
  missing: 'https://c.saavncdn.com/000/this-artwork-was-removed-500x500.jpg',
};

// Plausible but unplayable: the fixture exercises layout, not the audio pipeline.
const STREAMS = { low: '/dev-null.mp4', medium: '/dev-null.mp4', high: '/dev-null.mp4', highBitrate: 320 };

let n = 0;
function song(p: Partial<Song> & { title: string }): Song {
  n += 1;
  const artists = p.artists ?? [];
  return {
    id: `dev-${n}`,
    type: 'song',
    subtitle: p.subtitle ?? artists.map((a) => a.name).join(', '),
    artists,
    artistNames: p.artistNames ?? artists.map((a) => a.name).join(', '),
    album: p.album ?? { id: '', name: '' },
    image: p.image ?? ART.a,
    duration: p.duration ?? 214,
    year: p.year ?? 2025,
    language: p.language ?? 'hindi',
    playCount: 0,
    explicit: p.explicit ?? false,
    hasLyrics: p.hasLyrics ?? false,
    label: p.label ?? '',
    url: '',
    streams: p.streams === undefined ? STREAMS : p.streams,
    ...p,
  } as Song;
}

const artist = (name: string, id = `a-${name.length}-${name.charCodeAt(0)}`) => ({ id, name, image: '' });

/** One list, many failures, spread across the first rows like real data. */
export function worstSongs(): Song[] {
  n = 0;
  return [
    song({
      title: 'Tera Mera Rishta - New Version (From "Awarapan 2") [Lofi Flip by Kushagra Bharath & Saaheal]',
      artists: ['Mithoon', 'Pritam', 'Sayeed Quadri', 'Saaj Bhatt', 'Subodhh Sharma', 'Kushagra Bharath'].map((x) => artist(x)),
      album: { id: '1', name: 'Awarapan 2 (Original Motion Picture Soundtrack) — Deluxe Anniversary Edition' },
      image: ART.b,
      explicit: true,
      duration: 10862, // a 3-hour DJ set
    }),
    song({ title: 'O', artists: [artist('J')], album: { id: '2', name: 'O' }, image: ART.c, duration: 61 }),
    song({
      title: 'Supercalifragilisticexpialidocious_Extended_Club_Remix_2025_FINAL',
      artists: [artist('Aleksandra Wiśniewska-Kowalczyk')],
      album: { id: '', name: 'Benachrichtigungseinstellungen' },
      image: ART.missing,
    }),
    song({ title: 'ரஞ்சிதமே', artists: [artist('ஏ. ஆர். ரஹ்மான்'), artist('Đặng Thị Ngọc Hân')], language: 'tamil', image: ART.a }),
    song({ title: 'نور الهدى عبد الرحمن', artists: [artist('نور الهدى')], language: 'urdu', image: ART.b }),
    song({ title: '🌙 Midnight Drive (Slowed + Reverb)', artists: [artist('👩🏽‍💻 Priya')], image: '' }),
    song({ title: 'Track not available in your region', artists: [artist('Christopher Alexander Montgomery III')], streams: null }),
    song({ title: 'Untitled', artists: [], subtitle: 'Various Artists', artistNames: '', duration: 0, album: { id: '', name: '' } }),
    song({ title: 'Kun Faya Kun', artists: [artist('A.R. Rahman'), artist('Javed Ali'), artist('Mohit Chauhan')], album: { id: '9', name: 'Rockstar' }, image: ART.c, hasLyrics: true }),
    song({ title: 'Tum Hi Ho', artists: [artist('Arijit Singh')], album: { id: '10', name: 'Aashiqui 2' }, image: ART.a }),
  ];
}

export function hugeSongs(count = 1284): Song[] {
  const base = worstSongs();
  return Array.from({ length: count }, (_, i) => ({ ...base[i % base.length], id: `dev-huge-${i}`, title: `${base[i % base.length].title} ${i + 1}` }));
}

export const WORST_CONTEXT_TITLE = 'Bollywood Romantic Hits of the 2000s — Arijit, Shreya, Sonu Nigam and more (Updated Weekly)';

export const WORST_SEARCHES = [
  'tera mera rishta new version from awarapan 2 lofi flip',
  'ரஞ்சிதமே',
  'a',
  'https://www.jiosaavn.com/song/tera-mera-rishta/ABCdef123',
  'Benachrichtigungseinstellungen',
];
