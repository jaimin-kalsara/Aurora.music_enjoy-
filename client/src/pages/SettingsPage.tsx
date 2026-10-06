import { LANGUAGE_OPTIONS, useLibrary } from '../store/library';
import { invalidateQueries } from '../hooks/useQuery';
import { capitalize } from '../utils/format';
import { toast } from '../store/toast';
import type { Quality } from '../types';

const QUALITIES: { key: Quality; label: string; rate: string; hint: string }[] = [
  { key: 'high', label: 'High', rate: '~160 kbps', hint: 'Opus ~160 kbps, the best YouTube Music streams (AAC 128 kbps on Safari).' },
  { key: 'medium', label: 'Normal', rate: '~70 kbps', hint: 'Opus ~70 kbps, balanced quality and data.' },
  { key: 'low', label: 'Data saver', rate: '~50 kbps', hint: 'Opus ~50 kbps, lightest on mobile data.' },
];

const IS_MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

const SHORTCUTS: [string, string][] = [
  ['Space', 'Play / pause'],
  ['← →', 'Seek 5 seconds'],
  ['Shift ← →', 'Previous / next'],
  ['L', 'Lyrics'],
  ['M', 'Mute'],
  [IS_MAC ? '⌘ K' : 'Ctrl K', 'Search'],
  ['Esc', 'Close Now Playing'],
];

export function SettingsPage() {
  const settings = useLibrary((s) => s.settings);
  const update = useLibrary((s) => s.updateSettings);
  const selected = settings.languages.split(',').filter(Boolean);

  const toggleLanguage = (lang: string) => {
    if (selected.length === 1 && selected[0] === lang) {
      toast('Keep at least one language selected');
      return;
    }
    const next = selected.includes(lang) ? selected.filter((l) => l !== lang) : [...selected, lang];
    update({ languages: next.join(',') });
    invalidateQueries();
    toast('Music languages updated');
  };

  return (
    <div className="page">
      <div className="page-title">
        <h1>Settings</h1>
        <p className="lede">Tune playback and what shows up on your home feed.</p>
      </div>

      <div className="settings-card">
        <div className="setting-row">
          <div>
            <div className="label" id="quality-label">
              Streaming quality
            </div>
            <div className="hint">{QUALITIES.find((q) => q.key === settings.quality)?.hint}</div>
          </div>
          <div className="segmented" role="radiogroup" aria-labelledby="quality-label">
            {QUALITIES.map((q) => (
              <button
                key={q.key}
                role="radio"
                aria-checked={settings.quality === q.key}
                className={settings.quality === q.key ? 'on' : ''}
                onClick={() => update({ quality: q.key })}
              >
                {q.label}
                <small>{q.rate}</small>
              </button>
            ))}
          </div>
        </div>

        <div className="setting-row">
          <div>
            <div className="label" id="autoplay-label">
              Autoplay
            </div>
            <div className="hint">Keep the music going with similar songs when your queue ends.</div>
          </div>
          <button
            className={`switch ${settings.autoplay ? 'on' : ''}`}
            role="switch"
            aria-checked={settings.autoplay}
            aria-labelledby="autoplay-label"
            onClick={() => update({ autoplay: !settings.autoplay })}
          />
        </div>

        <div className="setting-row stack">
          <div>
            <div className="label" id="lang-label">
              Music languages
            </div>
            <div className="hint">Shapes the language picks on Home and Explore. Search always covers the whole YouTube Music catalog.</div>
          </div>
          <div className="chips" style={{ marginTop: 6 }} role="group" aria-labelledby="lang-label">
            {LANGUAGE_OPTIONS.map((lang) => (
              <button key={lang} className={`chip ${selected.includes(lang) ? 'on' : ''}`} aria-pressed={selected.includes(lang)} onClick={() => toggleLanguage(lang)}>
                {capitalize(lang)}
              </button>
            ))}
          </div>
        </div>

        <div className="setting-row stack desktop-only">
          <div className="label">Keyboard shortcuts</div>
          <div className="kbd-list">
            {SHORTCUTS.map(([key, action]) => (
              <span key={key}>
                <kbd>{key}</kbd>
                {action}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
