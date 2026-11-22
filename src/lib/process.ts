import type { CropAspect, Effects, Look, ProcessConfig } from '../types';
import { BASE_LOOK } from './filters';
import { applyFrame } from './frames';
import * as fx from './fx';
import { renderFrame } from './render';
import { clamp } from './utils';
import { cropFit, quarterTurns } from './crop';

export { cropFit, cropView, cropFromBox } from './crop';

export const BASE_EFFECTS: Effects = {
  motionBlur: 0,
  vignette: 0,
  halation: 0,
  fisheye: 0,
  flash: 0,
  stamp: 'none',
  stampPos: 'br',
  stampColor: null,
  stampDate: null,
  caption: '',
  doubleId: null,
  doubleMix: 0.45,
  border: 'none',
  aspect: 'original',
  rotate: 0,
  flip: false,
  straighten: 0,
  zoom: 1,
  cropX: 0,
  cropY: 0,
  dust: 0,
  scratches: 0,
  booth: false,
  boothIds: [],
  mist: 0,
  starburst: 0,
  flare: 0,
  leak: 0,
  trails: 0,
  zoomBurst: 0,
  gateWeave: 0,
  infrared: 0,
  crossProcess: 0,
  bleach: 0,
  solarize: 0,
  negative: 0,
  thermal: 0,
  rgbSplit: 0,
  miniDv: 0,
  videoGrain: 0,
  crt: 0,
  glitch: 0,
  softVignette: 0,
  anamorphic: 0,
};

export type ProcessPreset = {
  id: string;
  name: string;
  group: string;
  note: string;
  swatch: [string, string, string];
  look: Look;
  effects?: Partial<Effects>;
};

const L = (partial: Partial<Look>): Look => ({ ...BASE_LOOK, ...partial });

export const PRESET_GROUPS = ['As shot', 'Film', 'Vintage', 'Digital', 'Nostalgia', 'Editorial', 'Cinematic', 'Experimental'];

export const PRESETS: ProcessPreset[] = [
  { id: 'none', name: 'Original', group: 'As shot', note: 'Leave the print exactly as it came out.', swatch: ['#d7cbb4', '#b7a98e', '#5f5a4e'], look: L({}) },
  // Film
  { id: 'portra', name: 'Portra', group: 'Film', note: 'Creamy skin, soft contrast, gentle pastels.', swatch: ['#f1cfae', '#d9a383', '#6f7f86'],
    look: L({ brightness: 1.04, contrast: 0.93, saturation: 0.9, warmth: 14, fade: 0.1, grain: 14, highlightTint: '#ffd6a8', shadowTint: '#46606e', split: 0.16 }) },
  { id: 'gold', name: 'Gold', group: 'Film', note: 'Consumer-film sunshine, golden and punchy.', swatch: ['#f5c85a', '#e08a3c', '#5b3b22'],
    look: L({ brightness: 1.05, contrast: 1.07, saturation: 1.16, warmth: 30, fade: 0.06, grain: 18, highlightTint: '#ffc566', split: 0.18, vignette: 0.12 }) },
  { id: 'superia', name: 'Superia', group: 'Film', note: 'Cool greens in the shadows, crisp daylight.', swatch: ['#9cc4a4', '#3e7a63', '#1d3a37'],
    look: L({ contrast: 1.1, saturation: 1.08, warmth: -4, tint: 10, fade: 0.05, grain: 20, shadowTint: '#2c6a55', highlightTint: '#f4f0d8', split: 0.22 }) },
  { id: 'cinestill', name: 'CineStill', group: 'Film', note: 'Tungsten night film with red halation glow.', swatch: ['#1c3b5a', '#ff7a59', '#f1d6b0'],
    look: L({ brightness: 0.98, contrast: 1.1, saturation: 1.06, warmth: -20, grain: 22, shadowTint: '#12385a', highlightTint: '#ffab85', split: 0.26 }),
    effects: { halation: 0.75 } },
  // Vintage
  { id: 'expired', name: 'Expired', group: 'Vintage', note: 'A roll forgotten in a glovebox since 1997.', swatch: ['#d88fa0', '#b7a06b', '#4f3a5c'],
    look: L({ contrast: 0.88, saturation: 0.82, warmth: 18, tint: -16, fade: 0.3, grain: 36, vignette: 0.3, lightLeak: 0.32, shadowTint: '#5a2d63', split: 0.22 }) },
  { id: 'polaroid', name: 'Polaroid', group: 'Vintage', note: 'Instant chemistry, soft halo, white border.', swatch: ['#e9dcc5', '#e4a97f', '#8fa29b'],
    look: L({ brightness: 1.08, contrast: 0.9, saturation: 0.9, sepia: 0.14, warmth: 20, fade: 0.28, grain: 18, vignette: 0.2, blur: 0.5, lightLeak: 0.2, shadowTint: '#3b5a63', split: 0.14 }),
    effects: { border: 'polaroid', aspect: '1:1' } },
  { id: 'sepia', name: 'Sepia', group: 'Vintage', note: 'Toned silver print from a grandparent’s drawer.', swatch: ['#e3c99c', '#a3784a', '#3b2a1a'],
    look: L({ contrast: 1.06, saturation: 0, sepia: 0.86, fade: 0.12, grain: 24, vignette: 0.38 }) },
  // Digital
  { id: 'ccd', name: 'CCD', group: 'Digital', note: 'Early sensor bloom, cool and crunchy.', swatch: ['#d8eefc', '#7fa8c9', '#283a4f'],
    look: L({ brightness: 1.06, contrast: 1.14, saturation: 1.18, warmth: -10, grain: 8, highlightTint: '#dff2ff', split: 0.12 }),
    effects: { flash: 0.35 } },
  { id: 'cybershot', name: 'CyberShot', group: 'Digital', note: 'Pocket digicam colour, oversaturated and sharp.', swatch: ['#4aa3ff', '#ff4e7a', '#ffe04a'],
    look: L({ brightness: 1.05, contrast: 1.2, saturation: 1.34, warmth: -6, tint: -4, grain: 4 }),
    effects: { stamp: 'date' } },
  { id: 'y2004', name: '2004 Memories', group: 'Digital', note: 'Party flash, orange date stamp, MySpace energy.', swatch: ['#ffb36b', '#e65a4a', '#2c2a4a'],
    look: L({ brightness: 1.04, contrast: 1.08, saturation: 1.12, warmth: 10, fade: 0.12, blur: 0.35, grain: 12, vignette: 0.22 }),
    effects: { stamp: 'date', flash: 0.45 } },
  // Nostalgia
  { id: 'y2016', name: '2016', group: 'Nostalgia', note: 'Faded matte, teal shadows, peak app-filter era.', swatch: ['#cfe0dc', '#e9cdb6', '#4f6a72'],
    look: L({ contrast: 0.9, saturation: 0.84, tint: 6, fade: 0.24, grain: 6, shadowTint: '#28505f', highlightTint: '#ffe0c2', split: 0.22 }) },
  { id: 'vhs', name: 'VHS', group: 'Nostalgia', note: 'Tracking lines and a camcorder timestamp.', swatch: ['#322d54', '#d54775', '#40a5a2'],
    look: L({ contrast: 1.08, saturation: 1.06, hue: 5, tint: -14, fade: 0.12, grain: 34, vignette: 0.3, blur: 0.6, scanlines: 0.55, tone: '#83368c', toneAmount: 0.12 }),
    effects: { stamp: 'camcorder', aspect: '4:3' } },
  { id: 'disposable', name: 'Disposable', group: 'Nostalgia', note: 'Direct flash, dusty corners, pure chaos.', swatch: ['#d0d0c8', '#c9603d', '#3d4341'],
    look: L({ contrast: 1.3, saturation: 1.16, warmth: 12, fade: 0.04, grain: 46, vignette: 0.45, lightLeak: 0.12 }),
    effects: { flash: 0.55, stamp: 'date' } },
  // Editorial
  { id: 'matte', name: 'Soft Matte', group: 'Editorial', note: 'Lifted blacks and quiet magazine tones.', swatch: ['#ece4da', '#c9b8a6', '#6d6158'],
    look: L({ brightness: 1.05, contrast: 0.86, saturation: 0.82, fade: 0.28, grain: 6, warmth: 6 }) },
  { id: 'dream', name: 'Dream Glow', group: 'Editorial', note: 'Bloomed highlights and a lilac haze.', swatch: ['#c7d6d0', '#e8c6cd', '#8d8db5'],
    look: L({ brightness: 1.08, contrast: 0.9, saturation: 0.92, tint: 10, fade: 0.2, grain: 8, blur: 0.4, lightLeak: 0.16, tone: '#b8a6d9', toneAmount: 0.12 }),
    effects: { halation: 0.35 } },
  { id: 'noir', name: 'Noir', group: 'Editorial', note: 'Hard monochrome with deep, inky shadows.', swatch: ['#e6e3dc', '#77746d', '#0f0f0e'],
    look: L({ brightness: 0.96, contrast: 1.48, saturation: 0, grain: 30, vignette: 0.5 }) },
  // Cinematic
  { id: 'teal', name: 'Teal & Orange', group: 'Cinematic', note: 'Blockbuster complementary grade.', swatch: ['#0f6b72', '#f2a35e', '#1a2a33'],
    look: L({ contrast: 1.12, saturation: 1.1, shadowTint: '#0b7078', highlightTint: '#ff9a4a', split: 0.4, vignette: 0.2 }),
    effects: { aspect: 'original' } },
  { id: 'academia', name: 'Dark Academia', group: 'Cinematic', note: 'Candlelit libraries and old leather.', swatch: ['#c9a87a', '#6b4a2b', '#1f1a14'],
    look: L({ brightness: 0.9, contrast: 1.12, saturation: 0.68, sepia: 0.2, warmth: 22, grain: 18, vignette: 0.45, shadowTint: '#2c2416', highlightTint: '#e8c79a', split: 0.26 }) },
];

export const EXPERIMENTAL: ProcessPreset[] = [
  { id: 'aerochrome', name: 'Infrared', group: 'Experimental', note: 'False-colour IR: pink foliage, ink skies.', swatch: ['#ff5a8a', '#c2185b', '#1a237e'],
    look: L({ contrast: 1.1, saturation: 1.2, grain: 16 }), effects: { infrared: 1 } },
  { id: 'xpro', name: 'Cross-Process', group: 'Experimental', note: 'Slide film in the wrong chemistry.', swatch: ['#e8f06a', '#3fb3a0', '#2a1a4a'],
    look: L({ saturation: 1.2, grain: 12, vignette: 0.25 }), effects: { crossProcess: 0.9 } },
  { id: 'bleach', name: 'Bleach Bypass', group: 'Experimental', note: 'Silver left in: gritty, desaturated, hard.', swatch: ['#c8c4b8', '#6f6a60', '#1c1b18'],
    look: L({ grain: 22 }), effects: { bleach: 0.9 } },
  { id: 'thermal', name: 'Thermal', group: 'Experimental', note: 'Heat-vision false colour.', swatch: ['#ffd000', '#c0007a', '#20008a'],
    look: L({}), effects: { thermal: 1 } },
  { id: 'minidv', name: 'MiniDV', group: 'Experimental', note: '2003 camcorder tape, timestamp and all.', swatch: ['#9ab0c8', '#3a4a6a', '#e0e0e0'],
    look: L({ contrast: 1.05, saturation: 1.15, warmth: -8 }), effects: { miniDv: 0.7, stamp: 'camcorder', rgbSplit: 0.2, aspect: '4:3' } },
  { id: 'crt', name: 'CRT TV', group: 'Experimental', note: 'Photographed off a curved glass screen.', swatch: ['#4a8aff', '#ff4a6a', '#111111'],
    look: L({ contrast: 1.1, saturation: 1.2 }), effects: { crt: 0.85, videoGrain: 0.3, rgbSplit: 0.25 } },
  { id: 'scope', name: 'Anamorphic', group: 'Experimental', note: '2.39:1 scope with blue streak flares.', swatch: ['#0b1d3a', '#3d8bff', '#f2a65a'],
    look: L({ contrast: 1.1, shadowTint: '#0b4a6e', highlightTint: '#ffb070', split: 0.25 }), effects: { anamorphic: 0.8, mist: 0.2 } },
  { id: 'solar', name: 'Sabattier', group: 'Experimental', note: 'Darkroom solarisation, light flashed mid-develop.', swatch: ['#d8d0c0', '#5a5650', '#e8e2d0'],
    look: L({ saturation: 0, contrast: 1.2, grain: 20 }), effects: { solarize: 0.85 } },
];
PRESETS.push(...EXPERIMENTAL);

export const getPreset = (id: string) => PRESETS.find((p) => p.id === id) ?? PRESETS[0];

export function configForPreset(id: string): ProcessConfig {
  const preset = getPreset(id);
  return {
    presetId: preset.id,
    look: { ...preset.look },
    effects: { ...BASE_EFFECTS, ...preset.effects, boothIds: [] },
  };
}

type Source = HTMLImageElement | HTMLCanvasElement;
const dims = (s: Source) =>
  s instanceof HTMLImageElement ? [s.naturalWidth || s.width, s.naturalHeight || s.height] : [s.width, s.height];

function canvasOf(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

const hexRgb = (hex: string) => {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

/** Per-pixel pass: split toning and fisheye remap. Kept in one loop so we read pixels once. */
function pixelPass(canvas: HTMLCanvasElement, look: Look, fisheye: number) {
  const split = look.split ?? 0;
  const tonal = split > 0 && (look.shadowTint || look.highlightTint);
  if (!tonal && fisheye <= 0) return canvas;
  const { width: w, height: h } = canvas;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  const src = ctx.getImageData(0, 0, w, h);
  const out = fisheye > 0 ? ctx.createImageData(w, h) : src;
  const s = look.shadowTint ? hexRgb(look.shadowTint) : [128, 128, 128];
  const hi = look.highlightTint ? hexRgb(look.highlightTint) : [128, 128, 128];
  const k = fisheye * 0.55;
  const cx = w / 2;
  const cy = h / 2;
  const radius = Math.hypot(cx, cy);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const o = (y * w + x) * 4;
      let i = o;
      if (fisheye > 0) {
        const nx = (x - cx) / radius;
        const ny = (y - cy) / radius;
        const r2 = nx * nx + ny * ny;
        const f = 1 - k * (1 - r2); // centre magnified, edges pulled in
        const sx = Math.round(cx + nx * f * radius);
        const sy = Math.round(cy + ny * f * radius);
        if (sx < 0 || sy < 0 || sx >= w || sy >= h || (fisheye > 0.6 && r2 > 0.5)) {
          out.data[o + 3] = 255;
          continue; // black lens surround
        }
        i = (sy * w + sx) * 4;
      }
      let r = src.data[i];
      let g = src.data[i + 1];
      let b = src.data[i + 2];
      if (tonal) {
        const lum = (r * 0.299 + g * 0.587 + b * 0.114) / 255;
        const ws = (1 - lum) * (1 - lum) * split;
        const wh = lum * lum * split;
        r += (s[0] - 128) * ws + (hi[0] - 128) * wh;
        g += (s[1] - 128) * ws + (hi[1] - 128) * wh;
        b += (s[2] - 128) * ws + (hi[2] - 128) * wh;
      }
      out.data[o] = r;
      out.data[o + 1] = g;
      out.data[o + 2] = b;
      out.data[o + 3] = 255;
    }
  }
  ctx.putImageData(out, 0, 0);
  return canvas;
}

/** Sharpen (unsharp mask) then highlights / shadows, before grain and overlays so they stay untouched. */
export function toneDetail(canvas: HTMLCanvasElement, look: Look) {
  const hl = (look.highlights ?? 0) / 100;
  const sd = (look.shadows ?? 0) / 100;
  const k = ((look.sharpen ?? 0) / 100) * 1.6;
  if (!hl && !sd && k <= 0) return canvas;
  const { width: w, height: h } = canvas;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  let soft: Uint8ClampedArray | null = null;
  if (k > 0) {
    const blurred = canvasOf(w, h);
    const b = blurred.getContext('2d', { willReadFrequently: true })!;
    b.filter = `blur(${Math.max(0.8, Math.max(w, h) / 1200)}px)`;
    b.drawImage(canvas, 0, 0);
    soft = b.getImageData(0, 0, w, h).data;
  }
  for (let i = 0; i < d.length; i += 4) {
    let r = d[i];
    let g = d[i + 1];
    let b = d[i + 2];
    if (soft) {
      r += (r - soft[i]) * k;
      g += (g - soft[i + 1]) * k;
      b += (b - soft[i + 2]) * k;
    }
    if (hl || sd) {
      // bell weights peaking at 1/3 (shadows) and 2/3 (highlights) luminance; pure black/white stay put
      const l = clamp((r * 0.299 + g * 0.587 + b * 0.114) / 255, 0, 1);
      const shift = 92 * 6.75 * l * (1 - l) * (sd * (1 - l) + hl * l);
      r += shift;
      g += shift;
      b += shift;
    }
    d[i] = r;
    d[i + 1] = g;
    d[i + 2] = b;
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

function motionBlur(canvas: HTMLCanvasElement, amount: number) {
  if (amount <= 0) return canvas;
  const copy = canvasOf(canvas.width, canvas.height);
  copy.getContext('2d')!.drawImage(canvas, 0, 0);
  const ctx = canvas.getContext('2d')!;
  const steps = 14;
  const length = canvas.width * 0.05 * amount;
  for (let i = 1; i <= steps; i += 1) {
    ctx.globalAlpha = 1 / (i + 1); // running average of shifted copies
    ctx.drawImage(copy, (i / steps - 0.5) * length, 0);
  }
  ctx.globalAlpha = 1;
  return canvas;
}

function halation(canvas: HTMLCanvasElement, amount: number) {
  if (amount <= 0) return canvas;
  const { width: w, height: h } = canvas;
  const glow = canvasOf(w, h);
  const g = glow.getContext('2d')!;
  // isolate highlights, spread them, stain them red like light bouncing off the film base
  g.filter = `grayscale(1) brightness(0.92) contrast(5) blur(${Math.max(2, w / 90)}px)`;
  g.drawImage(canvas, 0, 0);
  g.filter = 'none';
  g.globalCompositeOperation = 'multiply';
  g.fillStyle = '#ff4a1c';
  g.fillRect(0, 0, w, h);
  const ctx = canvas.getContext('2d')!;
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  ctx.globalAlpha = clamp(amount, 0, 1);
  ctx.drawImage(glow, 0, 0);
  ctx.restore();
  return canvas;
}

export function flash(canvas: HTMLCanvasElement, amount: number) {
  if (amount <= 0) return canvas;
  const { width: w, height: h } = canvas;
  const ctx = canvas.getContext('2d')!;
  ctx.save();
  const hot = ctx.createRadialGradient(w / 2, h * 0.45, 0, w / 2, h * 0.45, Math.max(w, h) * 0.55);
  hot.addColorStop(0, `rgba(255,255,250,${0.55 * amount})`);
  hot.addColorStop(0.45, `rgba(255,255,250,${0.18 * amount})`);
  hot.addColorStop(1, 'rgba(255,255,250,0)');
  ctx.globalCompositeOperation = 'soft-light';
  ctx.fillStyle = hot;
  ctx.fillRect(0, 0, w, h);
  ctx.globalCompositeOperation = 'screen';
  ctx.globalAlpha = 0.5;
  ctx.fillRect(0, 0, w, h);
  ctx.globalAlpha = 1;
  const fall = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.75);
  fall.addColorStop(0, 'rgba(0,0,0,0)');
  fall.addColorStop(1, `rgba(0,0,0,${0.7 * amount})`);
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = fall;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
  return canvas;
}

export const STAMP_STYLES: { id: Effects['stamp']; label: string; corner: boolean; color: string | null }[] = [
  { id: 'none', label: 'Off', corner: false, color: null },
  { id: 'date', label: 'Film date', corner: true, color: '#ff9a3c' },
  { id: 'led', label: '90s LED', corner: true, color: '#ff3b2f' },
  { id: 'lcd', label: 'Digicam', corner: true, color: '#ffd23a' },
  { id: 'dymo', label: 'Label tape', corner: true, color: '#1b1b1b' },
  { id: 'ink', label: 'Handwritten', corner: true, color: '#fbf7ee' },
  { id: 'editorial', label: 'Editorial', corner: true, color: '#ffffff' },
  { id: 'camcorder', label: 'Camcorder', corner: false, color: '#f4f4f4' },
  { id: 'rec', label: 'REC viewfinder', corner: false, color: '#ffffff' },
];

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const two = (n: number) => String(n).padStart(2, '0');

/** Text spacing where the browser supports it (older Safari ignores it, which is fine). */
function spacing(ctx: CanvasRenderingContext2D, px: number) {
  if ('letterSpacing' in ctx) (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${px}px`;
}

export function stamp(canvas: HTMLCanvasElement, e: Pick<Effects, 'stamp' | 'stampPos' | 'stampColor' | 'stampDate'>, date: number) {
  const style = e.stamp;
  if (!style || style === 'none') return canvas;
  const { width: w, height: h } = canvas;
  const ctx = canvas.getContext('2d')!;
  const d = new Date(e.stampDate ?? date);
  const u = Math.min(w, h) / 100;
  const def = STAMP_STYLES.find((s) => s.id === style);
  const color = e.stampColor ?? def?.color ?? '#ffffff';
  const pos = e.stampPos ?? 'br';
  const right = pos === 'br' || pos === 'tr';
  const bottom = pos === 'br' || pos === 'bl';
  const ax = right ? w - u * 5 : u * 5;
  const ay = bottom ? h - u * 5 : u * 5;
  const yy = two(d.getFullYear() % 100);
  const mm = two(d.getMonth() + 1);
  const dd = two(d.getDate());
  const clock = `${two(d.getHours())}:${two(d.getMinutes())}`;
  ctx.save();
  ctx.textAlign = right ? 'right' : 'left';
  ctx.textBaseline = bottom ? 'alphabetic' : 'top';

  if (style === 'date') {
    ctx.font = `700 ${u * 5.4}px "DM Mono", "Courier New", monospace`;
    ctx.shadowColor = color;
    ctx.shadowBlur = u * 1.6;
    ctx.fillStyle = color;
    ctx.fillText(`'${yy}  ${mm}  ${dd}`, ax, ay);
  } else if (style === 'led') {
    // 90s compact: month day 'year, bolder and redder, with a hot glow
    const text = `${mm} ${dd} '${yy}`;
    ctx.font = `800 ${u * 5}px "DM Mono", "Courier New", monospace`;
    spacing(ctx, u * 0.8);
    ctx.shadowColor = color;
    ctx.shadowBlur = u * 2.4;
    ctx.fillStyle = color;
    ctx.fillText(text, ax, ay);
    ctx.shadowBlur = u * 0.6;
    ctx.fillText(text, ax, ay);
  } else if (style === 'lcd') {
    // early-2000s digicam: date + time, yellow with a dark outline
    const text = `${d.getFullYear()}.${mm}.${dd}  ${clock}`;
    ctx.font = `600 ${u * 4.2}px "DM Mono", "Courier New", monospace`;
    ctx.lineJoin = 'round';
    ctx.lineWidth = u * 0.9;
    ctx.strokeStyle = 'rgba(0,0,0,0.75)';
    ctx.strokeText(text, ax, ay);
    ctx.fillStyle = color;
    ctx.fillText(text, ax, ay);
  } else if (style === 'dymo') {
    // embossed label-maker tape, slightly crooked
    const text = `${dd} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
    ctx.font = `700 ${u * 3.8}px "DM Mono", "Courier New", monospace`;
    spacing(ctx, u * 0.6);
    const tapeW = ctx.measureText(text).width + u * 5;
    const th = u * 6.6;
    const x = right ? ax - tapeW : ax;
    const y = bottom ? ay - th : ay;
    ctx.translate(x + tapeW / 2, y + th / 2);
    ctx.rotate(right === bottom ? -0.035 : 0.035);
    ctx.shadowColor = 'rgba(0,0,0,0.4)';
    ctx.shadowBlur = u;
    ctx.shadowOffsetY = u * 0.3;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(-tapeW / 2, -th / 2, tapeW, th, u * 0.8);
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillText(text, 0, u * 0.25);
    ctx.fillStyle = '#f6f4ee';
    ctx.fillText(text, 0, 0);
  } else if (style === 'ink') {
    // paint-pen date, written by hand on the print
    ctx.font = `${u * 6}px "Segoe Print", "Bradley Hand", "Comic Sans MS", cursive`;
    ctx.translate(ax, ay);
    ctx.rotate(-0.06);
    ctx.shadowColor = 'rgba(0,0,0,0.35)';
    ctx.shadowBlur = u * 0.8;
    ctx.fillStyle = color;
    ctx.fillText(`${MONTHS_LONG[d.getMonth()].slice(0, 3)} ${d.getDate()}, ${d.getFullYear()}`, 0, 0);
  } else if (style === 'editorial') {
    ctx.font = `${u * 3.4}px "Instrument Serif", Georgia, serif`;
    spacing(ctx, u * 0.9);
    ctx.shadowColor = 'rgba(0,0,0,0.45)';
    ctx.shadowBlur = u * 1.2;
    ctx.fillStyle = color;
    ctx.fillText(`${MONTHS_LONG[d.getMonth()].toUpperCase()} ${d.getDate()}, ${d.getFullYear()}`, ax, ay);
  } else if (style === 'camcorder') {
    const hours = d.getHours();
    ctx.textBaseline = 'alphabetic';
    ctx.font = `600 ${u * 5}px "DM Mono", "Courier New", monospace`;
    ctx.shadowColor = 'rgba(0,0,0,0.85)';
    ctx.shadowOffsetX = u * 0.35;
    ctx.shadowOffsetY = u * 0.35;
    ctx.fillStyle = color;
    ctx.textAlign = 'left';
    ctx.fillText('PLAY ▶', u * 5, u * 10);
    ctx.fillText(`${hours >= 12 ? 'PM' : 'AM'} ${(hours % 12) || 12}:${two(d.getMinutes())}`, u * 5, h - u * 12);
    ctx.fillText(`${MONTHS[d.getMonth()]}. ${dd} ${d.getFullYear()}`, u * 5, h - u * 5);
    ctx.textAlign = 'right';
    ctx.fillText('SP 0:00:12', w - u * 5, u * 10);
    ctx.fillStyle = '#ff3b30';
    ctx.beginPath();
    ctx.arc(w - u * 8, h - u * 7, u * 1.6, 0, Math.PI * 2);
    ctx.fill();
  } else if (style === 'rec') {
    // video viewfinder: corner brackets, REC, battery, timecode and date
    ctx.textBaseline = 'middle';
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur = u * 0.8;
    ctx.lineWidth = Math.max(1, u * 0.45);
    const m = u * 4;
    const arm = u * 7;
    for (const [cx, cy, sx, sy] of [[m, m, 1, 1], [w - m, m, -1, 1], [m, h - m, 1, -1], [w - m, h - m, -1, -1]]) {
      ctx.beginPath();
      ctx.moveTo(cx, cy + sy * arm);
      ctx.lineTo(cx, cy);
      ctx.lineTo(cx + sx * arm, cy);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(w / 2 - u * 2.5, h / 2);
    ctx.lineTo(w / 2 + u * 2.5, h / 2);
    ctx.moveTo(w / 2, h / 2 - u * 2.5);
    ctx.lineTo(w / 2, h / 2 + u * 2.5);
    ctx.stroke();
    ctx.font = `600 ${u * 4}px "DM Mono", "Courier New", monospace`;
    ctx.textAlign = 'left';
    ctx.fillStyle = '#ff3b30';
    ctx.beginPath();
    ctx.arc(m + u * 4.5, m + u * 5, u * 1.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.fillText('REC', m + u * 7.5, m + u * 5);
    const bx = w - m - u * 13;
    const by = m + u * 3.3;
    ctx.strokeRect(bx, by, u * 8, u * 3.4);
    ctx.fillRect(bx + u * 8, by + u * 0.9, u * 0.8, u * 1.6);
    ctx.fillRect(bx + u * 0.8, by + u * 0.8, u * 4.6, u * 1.8);
    ctx.fillText(`TC ${clock}:${two(d.getSeconds())}:00`, m + u * 3, h - m - u * 5);
    ctx.textAlign = 'right';
    ctx.fillText(`${MONTHS[d.getMonth()]} ${dd} ${d.getFullYear()}`, w - m - u * 3, h - m - u * 5);
  }
  ctx.restore();
  return canvas;
}

function drawCover(ctx: CanvasRenderingContext2D, img: Source, w: number, h: number) {
  const [sw, sh] = dims(img);
  const scale = Math.max(w / sw, h / sh);
  ctx.drawImage(img, (w - sw * scale) / 2, (h - sh * scale) / 2, sw * scale, sh * scale);
}


function cropAspect(aspect: CropAspect, rw: number, rh: number, ratio?: number) {
  const wide = rw >= rh;
  if (aspect === 'free' && ratio && ratio > 0) return ratio;
  if (aspect === '1:1') return 1;
  if (aspect === '4:3') return wide ? 4 / 3 : 3 / 4;
  if (aspect === '16:9') return wide ? 16 / 9 : 9 / 16;
  if (aspect === '4:5') return 4 / 5;
  if (aspect === '2.39') return 2.39;
  return rw / rh;
}

/** Rotate, flip, straighten, zoom and pan the photo into a w×h frame. */
function cropTo(img: Source, e: Effects, w: number, h: number) {
  const [sw, sh] = dims(img);
  const { t, scale, slackX, slackY } = cropFit(sw, sh, e, w, h);
  const out = canvasOf(w, h);
  const ctx = out.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.translate(w / 2, h / 2);
  ctx.rotate(t);
  ctx.translate(-clamp(e.cropX, -1, 1) * slackX, -clamp(e.cropY, -1, 1) * slackY);
  ctx.scale(scale, scale);
  if (e.flip) ctx.scale(-1, 1);
  ctx.rotate((quarterTurns(e.rotate) * Math.PI) / 2);
  ctx.drawImage(img, -sw / 2, -sh / 2);
  return out;
}

/** Output size for a photo at this long side, after crop and rotation. */
export function processedAspect(img: Source, e: Effects) {
  const [sw, sh] = dims(img);
  const [rw, rh] = quarterTurns(e.rotate) % 2 ? [sh, sw] : [sw, sh];
  return e.anamorphic > 0 ? 2.39 : cropAspect(e.aspect, rw, rh, e.cropRatio);
}

/** One image through look + effects, without frame or booth. */
function processSingle(
  img: Source,
  cfg: ProcessConfig,
  longSide: number,
  aspectOverride?: number,
  double?: Source | null,
  crop = true,
) {
  const e = cfg.effects;
  const aspect = aspectOverride ?? processedAspect(img, e);
  const w = aspect >= 1 ? longSide : Math.round(longSide * aspect);
  const h = aspect >= 1 ? Math.round(longSide / aspect) : longSide;

  const base = crop ? cropTo(img, e, w, h) : canvasOf(w, h);
  if (!crop) drawCover(base.getContext('2d')!, img, w, h);
  if (double && e.doubleMix > 0) {
    const m = base.getContext('2d')!;
    m.save();
    m.globalCompositeOperation = 'screen';
    m.globalAlpha = clamp(e.doubleMix, 0, 1);
    drawCover(m, double, w, h);
    m.restore();
  }
  toneDetail(base, cfg.look);
  const look = { ...cfg.look, vignette: clamp(cfg.look.vignette + e.vignette, 0, 1) };
  let canvas = renderFrame(base, w, h, w, h, look);
  canvas = fx.colorPass(canvas, e);
  canvas = pixelPass(canvas, look, e.fisheye);
  canvas = motionBlur(canvas, e.motionBlur);
  canvas = fx.trails(canvas, e.trails);
  canvas = fx.zoomBurst(canvas, e.zoomBurst);
  canvas = fx.mist(canvas, e.mist);
  canvas = halation(canvas, e.halation);
  canvas = fx.starburst(canvas, e.starburst);
  canvas = fx.flare(canvas, e.flare);
  canvas = fx.leaks(canvas, e.leak);
  canvas = flash(canvas, e.flash);
  canvas = fx.softVignette(canvas, e.softVignette);
  canvas = fx.rgbSplit(canvas, e.rgbSplit);
  canvas = fx.miniDv(canvas, e.miniDv);
  canvas = fx.glitch(canvas, e.glitch);
  canvas = fx.videoGrain(canvas, e.videoGrain);
  canvas = fx.dust(canvas, e.dust);
  canvas = fx.scratches(canvas, e.scratches);
  canvas = fx.crt(canvas, e.crt);
  canvas = fx.gateWeave(canvas, e.gateWeave);
  canvas = fx.anamorphic(canvas, e.anamorphic);
  return canvas;
}

export function renderProcessed(
  img: Source,
  rawCfg: ProcessConfig,
  opts: { longSide: number; date: number; double?: Source | null; booth?: Source[] },
): HTMLCanvasElement {
  const cfg = { ...rawCfg, effects: { ...BASE_EFFECTS, ...rawCfg.effects } };
  const e = cfg.effects;
  if (e.booth) {
    const shots = [img, ...(opts.booth ?? [])].slice(0, 4);
    while (shots.length < 4) shots.push(shots[shots.length % Math.max(1, shots.length)]);
    const cell = Math.round(opts.longSide / 2.3);
    const gap = Math.round(cell * 0.06);
    const foot = Math.round(cell * 0.32);
    const sheet = canvasOf(cell * 2 + gap * 3, cell * 2 + gap * 3 + foot);
    const ctx = sheet.getContext('2d')!;
    ctx.fillStyle = '#fbf8f1';
    ctx.fillRect(0, 0, sheet.width, sheet.height);
    shots.forEach((shot, i) => {
      // only the photo being edited carries its crop; the other booth frames are centred
      const frame = stamp(processSingle(shot, cfg, cell, 1, null, i === 0), e, opts.date);
      ctx.drawImage(frame, gap + (i % 2) * (cell + gap), gap + Math.floor(i / 2) * (cell + gap));
    });
    ctx.fillStyle = '#2a2622';
    ctx.textAlign = 'center';
    ctx.font = `${Math.round(foot * 0.32)}px "Instrument Serif", Georgia, serif`;
    ctx.fillText('Delineate · Photo Booth', sheet.width / 2, sheet.height - foot * 0.52);
    ctx.font = `${Math.round(foot * 0.16)}px "DM Mono", monospace`;
    ctx.fillText(new Date(opts.date).toDateString().toUpperCase(), sheet.width / 2, sheet.height - foot * 0.2);
    return applyFrame(sheet, e.border, e.caption, opts.date);
  }
  const single = processSingle(img, cfg, opts.longSide, undefined, opts.double);
  return applyFrame(stamp(single, e, opts.date), e.border, e.caption, opts.date);
}
