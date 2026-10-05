import { useEffect, useRef, useState } from 'react';
import { usePlayer } from '../store/player';

type RGB = [number, number, number];

// Shown before anything plays: a quiet teal → indigo → violet aurora.
const DEFAULT_PALETTE: RGB[] = [
  [28, 120, 112],
  [52, 64, 160],
  [104, 52, 140],
];

const cache = new Map<string, RGB[]>();

function rgbToHsl([r, g, b]: RGB): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h / 6, s, l];
}

function hslToRgb(h: number, s: number, l: number): RGB {
  if (s === 0) return [l * 255, l * 255, l * 255].map(Math.round) as RGB;
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hue = (t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [hue(h + 1 / 3), hue(h), hue(h - 1 / 3)].map((v) => Math.round(v * 255)) as RGB;
}

/** Keep hue, pull saturation/lightness into a band that reads as a glow on black. */
function tame(c: RGB): RGB {
  const [h, s, l] = rgbToHsl(c);
  const sat = s < 0.08 ? s : Math.min(0.82, Math.max(0.32, s * 1.15));
  return hslToRgb(h, sat, Math.min(0.5, Math.max(0.3, l)));
}

function average(px: Uint8ClampedArray, size: number, x0: number, y0: number, x1: number, y1: number): RGB {
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * size + x) * 4;
      r += px[i];
      g += px[i + 1];
      b += px[i + 2];
      n++;
    }
  }
  return [r / n, g / n, b / n];
}

/** The most saturated, mid-lightness pixel: usually the artwork's accent colour. */
function vibrant(px: Uint8ClampedArray): RGB {
  let best: RGB = [px[0], px[1], px[2]];
  let score = -1;
  for (let i = 0; i < px.length; i += 4) {
    const c: RGB = [px[i], px[i + 1], px[i + 2]];
    const [, s, l] = rgbToHsl(c);
    const v = s * (1 - Math.abs(l - 0.5) * 1.6);
    if (v > score) {
      score = v;
      best = c;
    }
  }
  return best;
}

// load/error events rather than img.decode(): decode() waits for a rendering opportunity
// and never settles in a background tab, which would leave the tint stale after a track change.
function loadCors(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`could not load ${url}`));
    img.src = `${url}${url.includes('?') ? '&' : '?'}palette`; // separate cache entry from the non-CORS <img> load
  });
}

async function extractPalette(src: string): Promise<RGB[]> {
  const hit = cache.get(src);
  if (hit) return hit;
  // A tiny rendition is plenty for colour sampling.
  const small = src.replace(/\d{2,4}x\d{2,4}(?=\.\w+$)/, '150x150');
  const img = await loadCors(small).catch((err) => (small === src ? Promise.reject(err) : loadCors(src)));
  const size = 12;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('no 2d context');
  ctx.drawImage(img, 0, 0, size, size);
  const px = ctx.getImageData(0, 0, size, size).data;
  const half = size / 2;
  const palette = [average(px, size, 0, 0, half, half), vibrant(px), average(px, size, 0, half, size, size)].map(tame);
  cache.set(src, palette);
  return palette;
}

function gradientOf([a, b, c]: RGB[]): string {
  return [
    `radial-gradient(70% 62% at 4% 0%, rgb(${a.join(' ')} / 0.36), transparent 72%)`,
    `radial-gradient(56% 52% at 100% 6%, rgb(${b.join(' ')} / 0.26), transparent 70%)`,
    `radial-gradient(80% 62% at 64% 104%, rgb(${c.join(' ')} / 0.22), transparent 72%)`,
  ].join(', ');
}

/**
 * Stacks background layers so a new value fades in over the old one, then drops the
 * old ones. Fading in on top (rather than cross-fading two layers) avoids the
 * brightness dip in the middle of the transition, and rapid changes never jump.
 */
export function BackdropStack({ value, className }: { value: string; className: string }) {
  const seq = useRef(0);
  const [layers, setLayers] = useState([{ id: 0, value }]);

  useEffect(() => {
    setLayers((ls) => (ls[ls.length - 1].value === value ? ls : [...ls, { id: ++seq.current, value }].slice(-3)));
  }, [value]);

  return (
    <>
      {layers.map((layer, i) => (
        <div
          key={layer.id}
          className={className}
          style={{ backgroundImage: layer.value }}
          data-fresh={layer.id === 0 ? undefined : ''}
          onAnimationEnd={i === layers.length - 1 && layers.length > 1 ? () => setLayers((ls) => ls.slice(-1)) : undefined}
        />
      ))}
    </>
  );
}

/** Full-window colour wash taken from the current artwork, so the glass chrome has light to bend. */
export function Ambient() {
  const image = usePlayer((s) => s.queue[s.index]?.image || null);
  // The last sampled palette stays up while the next artwork is being read, so there's no flash to default.
  const [sampled, setSampled] = useState<RGB[]>(DEFAULT_PALETTE);
  const palette = image ? sampled : DEFAULT_PALETTE;

  useEffect(() => {
    if (!image) return;
    let cancelled = false;
    extractPalette(image)
      .then((p) => {
        if (!cancelled) setSampled(p);
      })
      .catch(() => undefined); // keep the previous wash; a missing tint is not worth an error
    return () => {
      cancelled = true;
    };
  }, [image]);

  return (
    <div className="ambient" aria-hidden>
      <BackdropStack className="ambient-layer" value={gradientOf(palette)} />
    </div>
  );
}
