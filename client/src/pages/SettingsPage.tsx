import { LANGUAGE_OPTIONS, useLibrary } from '../store/library';
import { invalidateQueries } from '../hooks/useQuery';
import { capitalize } from '../utils/format';
import { toast } from '../store/toast';
import type { Quality } from '../types';

const QUALITIES: { key: Quality; label: string; rate: string; hint: string }[] = [
  { key: 'high', label: 'Ultra', rate: '320 kbps', hint: 'Highest fidelity AAC available for every track.' },
  { key: 'medium', label: 'High', rate: '160 kbps', hint: 'Balanced quality and data.' },
  { key: 'low', label: 'Data saver', rate: '96 kbps', hint: 'Lightest on bandwidth.' },
];

const IS_MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

const SHORTCUTS: [string, string][] = [
  ['Space', 'Play / pause'],
  ['← →', 'Seek 5 seconds'],
  ['Shift ← →', 'Previous / next'],
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
            <div className="hint">Shapes trending, charts and new releases on Home and Explore. Search always covers everything.</div>
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
