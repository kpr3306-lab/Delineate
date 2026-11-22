import type { GrainSize } from '../types';
import { BASE_LOOK } from './filters';
import { paintOverlays } from './render';
import { toneDetail } from './process';
import { dust, scratches } from './fx';
import { clamp } from './utils';

/* Advanced darkroom: a non-destructive edit record (stored next to the untouched original)
   and the renderer that turns original + record into a print. */

export type CurvePt = [number, number];
export type Adv = {
  exposure: number; // stops, -3..3
  contrast: number; // -100..100 (all sliders below are -100..100 unless noted)
  highlights: number;
  shadows: number;
  whites: number;
  blacks: number;
  temp: number;
  tint: number;
  vibrance: number;
  saturation: number;
  /** 8 hue bands: red, orange, yellow, green, aqua, blue, purple, magenta. */
  hslH: number[];
  hslS: number[];
  hslL: number[];
  curve: { m: CurvePt[]; r: CurvePt[]; g: CurvePt[]; b: CurvePt[] };
  splitShadowHue: number; // 0..360
  splitShadowAmt: number; // 0..100
  splitHighHue: number;
  splitHighAmt: number;
  splitBalance: number;
  fade: number; // 0..100 from here down
  vignette: number;
  grain: number;
  grainSize: GrainSize;
  sharpen: number;
  bloom: number;
  halation: number;
  leak: number;
  dust: number;
  scratches: number;
  mono: boolean;
};

const LINE: CurvePt[] = [
  [0, 0],
  [1, 1],
];
export const ADV_DEFAULT: Adv = {
  exposure: 0, contrast: 0, highlights: 0, shadows: 0, whites: 0, blacks: 0,
  temp: 0, tint: 0, vibrance: 0, saturation: 0,
  hslH: Array(8).fill(0), hslS: Array(8).fill(0), hslL: Array(8).fill(0),
  curve: { m: LINE, r: LINE, g: LINE, b: LINE },
  splitShadowHue: 210, splitShadowAmt: 0, splitHighHue: 40, splitHighAmt: 0, splitBalance: 0,
  fade: 0, vignette: 0, grain: 0, grainSize: 'medium', sharpen: 0, bloom: 0, halation: 0, leak: 0, dust: 0, scratches: 0,
  mono: false,
};
export const HSL_BANDS = [
  { name: 'Red', hue: 0, color: '#e5484d' },
  { name: 'Orange', hue: 30, color: '#f08c2e' },
  { name: 'Yellow', hue: 60, color: '#e8c547' },
  { name: 'Green', hue: 120, color: '#4caf6a' },
  { name: 'Aqua', hue: 180, color: '#3cb6c4' },
  { name: 'Blue', hue: 230, color: '#3f73d8' },
  { name: 'Purple', hue: 275, color: '#8b5cd6' },
  { name: 'Magenta', hue: 320, color: '#d35ab1' },
];

/** Fill any fields an older record is missing, and reject junk from imported files. */
const num = (v: unknown, d: number, lo: number, hi: number) => (typeof v === 'number' && Number.isFinite(v) ? clamp(v, lo, hi) : d);
const band = (v: unknown) => (Array.isArray(v) && v.length === 8 ? v.map((x) => num(x, 0, -100, 100)) : Array(8).fill(0));
const pts = (v: unknown): CurvePt[] => {
  if (!Array.isArray(v)) return LINE;
  const ok = v.filter((p) => Array.isArray(p) && p.length === 2).map((p) => [num(p[0], 0, 0, 1), num(p[1], 0, 0, 1)] as CurvePt);
  return ok.length >= 2 && ok.length <= 16 ? ok : LINE;
};
export function normalizeAdv(a: Partial<Adv> | undefined): Adv {
  const src = (a ?? {}) as Record<string, unknown>;
  const out = { ...ADV_DEFAULT } as Record<string, unknown>;
  for (const [k, d] of Object.entries(ADV_DEFAULT)) {
    if (typeof d === 'number') out[k] = num(src[k], d, k === 'exposure' ? -3 : k.endsWith('Hue') ? 0 : -100, k === 'exposure' ? 3 : k.endsWith('Hue') ? 360 : 100);
  }
  out.mono = src.mono === true;
  out.grainSize = src.grainSize === 'fine' || src.grainSize === 'coarse' ? src.grainSize : 'medium';
  out.hslH = band(src.hslH);
  out.hslS = band(src.hslS);
  out.hslL = band(src.hslL);
  const c = (src.curve ?? {}) as Record<string, unknown>;
  out.curve = { m: pts(c.m), r: pts(c.r), g: pts(c.g), b: pts(c.b) };
  return out as Adv;
}

/** Groups for copy/paste of selected adjustments. */
export const GROUPS: { id: string; label: string; keys: (keyof Adv)[] }[] = [
  { id: 'light', label: 'Light', keys: ['exposure', 'contrast', 'highlights', 'shadows', 'whites', 'blacks'] },
  { id: 'colour', label: 'Colour', keys: ['temp', 'tint', 'vibrance', 'saturation', 'mono'] },
  { id: 'hsl', label: 'HSL', keys: ['hslH', 'hslS', 'hslL'] },
  { id: 'curve', label: 'Curves', keys: ['curve'] },
  { id: 'split', label: 'Split toning', keys: ['splitShadowHue', 'splitShadowAmt', 'splitHighHue', 'splitHighAmt', 'splitBalance'] },
  { id: 'effects', label: 'Effects', keys: ['fade', 'vignette', 'grain', 'grainSize', 'sharpen', 'bloom', 'halation', 'leak', 'dust', 'scratches'] },
];

const LABELS: Partial<Record<keyof Adv, string>> = {
  exposure: 'Exposure', contrast: 'Contrast', highlights: 'Highlights', shadows: 'Shadows', whites: 'Whites', blacks: 'Blacks',
  temp: 'Temperature', tint: 'Tint', vibrance: 'Vibrance', saturation: 'Saturation', fade: 'Fade', vignette: 'Vignette',
  grain: 'Grain', sharpen: 'Sharpen', bloom: 'Bloom', halation: 'Halation', leak: 'Light leak', dust: 'Dust', scratches: 'Scratches',
};
const SIGNED = new Set<keyof Adv>(['exposure', 'contrast', 'highlights', 'shadows', 'whites', 'blacks', 'temp', 'tint', 'vibrance', 'saturation']);
/** Human summary of what a recipe changes, e.g. "Exposure +0.3 · Fade 20 · Curves". */
export function summarize(a: Adv) {
  const out: string[] = [];
  for (const [k, label] of Object.entries(LABELS) as [keyof Adv, string][]) {
    const v = a[k] as number;
    if (v) out.push(`${label} ${v > 0 && SIGNED.has(k) ? '+' : ''}${k === 'exposure' ? v.toFixed(1) : Math.round(v)}`);
  }
  if (a.mono) out.unshift('Monochrome');
  if ([...a.hslH, ...a.hslS, ...a.hslL].some(Boolean)) out.push('HSL');
  if (Object.values(a.curve).some((c) => c.length !== 2 || c[0][1] !== 0 || c[1][1] !== 1)) out.push('Curves');
  if (a.splitShadowAmt || a.splitHighAmt) out.push('Split toning');
  return out.length ? out.join(' · ') : 'No changes';
}

/* Curves: monotone cubic (Fritsch–Carlson) so a curve never overshoots or folds back. */
export function curveLut(pts: CurvePt[]) {
  const p = [...pts].sort((a, b) => a[0] - b[0]);
  const lut = new Float32Array(256);
  const n = p.length;
  if (n < 2) {
    for (let i = 0; i < 256; i += 1) lut[i] = i / 255;
    return lut;
  }
  const dx: number[] = [];
  const m: number[] = [];
  for (let i = 0; i < n - 1; i += 1) {
    dx.push(Math.max(1e-6, p[i + 1][0] - p[i][0]));
    m.push((p[i + 1][1] - p[i][1]) / dx[i]);
  }
  const t = [m[0], ...m.slice(1).map((v, i) => (v * m[i] <= 0 ? 0 : (v + m[i]) / 2)), m[n - 2]];
  for (let i = 0; i < n - 1; i += 1) {
    if (m[i] === 0) {
      t[i] = 0;
      t[i + 1] = 0;
      continue;
    }
    const a = t[i] / m[i];
    const b = t[i + 1] / m[i];
    const s = a * a + b * b;
    if (s > 9) {
      const k = 3 / Math.sqrt(s);
      t[i] = k * a * m[i];
      t[i + 1] = k * b * m[i];
    }
  }
  let seg = 0;
  for (let i = 0; i < 256; i += 1) {
    const x = i / 255;
    if (x <= p[0][0]) lut[i] = p[0][1];
    else if (x >= p[n - 1][0]) lut[i] = p[n - 1][1];
    else {
      while (seg < n - 2 && x > p[seg + 1][0]) seg += 1;
      const h = dx[seg];
      const u = (x - p[seg][0]) / h;
      const h00 = 2 * u ** 3 - 3 * u ** 2 + 1;
      const h10 = u ** 3 - 2 * u ** 2 + u;
      const h01 = -2 * u ** 3 + 3 * u ** 2;
      const h11 = u ** 3 - u ** 2;
      lut[i] = clamp(h00 * p[seg][1] + h10 * h * t[seg] + h01 * p[seg + 1][1] + h11 * h * t[seg + 1], 0, 1);
    }
  }
  return lut;
}

const smooth = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
/** The tone curve every channel shares: exposure → black/white points → shadows/highlights → contrast → fade. */
function toneAt(x: number, a: Adv) {
  let v = x * 2 ** a.exposure;
  const bp = -0.08 * (a.blacks / 100);
  const wp = 1 - 0.15 * (a.whites / 100);
  v = (v - bp) / (wp - bp);
  const sh = a.shadows / 100;
  const hl = a.highlights / 100;
  const ws = 1 - smooth(0, 0.55, v);
  const wh = smooth(0.45, 1, v);
  v += 0.35 * sh * ws * (sh > 0 ? 1 - v : v);
  v += 0.35 * hl * wh * (hl > 0 ? 1 - v : v);
  v = clamp(v, 0, 1);
  const c = a.contrast / 100;
  // S-curve contrast that never clips: blend toward a smoothstep (or its inverse for negative values)
  const s = v * v * (3 - 2 * v);
  v = c >= 0 ? v + (s - v) * c : v + (v - s) * -c * 0.8;
  const f = (a.fade / 100) * 0.16;
  return clamp(f + v * (1 - f), 0, 1);
}

const hueRgb = (h: number): [number, number, number] => {
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    return 0.5 - 0.5 * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return [f(0), f(8), f(4)];
};

/** The pixel stage: white balance, tone LUTs, colour, HSL, split toning. */
function pixels(canvas: HTMLCanvasElement, a: Adv) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = img.data;
  const M = curveLut(a.curve.m);
  const C = [curveLut(a.curve.r), curveLut(a.curve.g), curveLut(a.curve.b)];
  const lut = [new Uint8ClampedArray(256), new Uint8ClampedArray(256), new Uint8ClampedArray(256)];
  const tone = new Float32Array(1024);
  for (let i = 0; i < 1024; i += 1) tone[i] = toneAt(i / 1023, a);
  for (let ch = 0; ch < 3; ch += 1)
    for (let i = 0; i < 256; i += 1) lut[ch][i] = Math.round(C[ch][Math.round(M[i] * 255)] * 255);
  const t = a.temp / 100;
  const tn = a.tint / 100;
  const gain = [1 + t * 0.14 + tn * 0.04, 1 - tn * 0.1, 1 - t * 0.16 + tn * 0.04];
  const sat = 1 + a.saturation / 100;
  const vib = a.vibrance / 100;
  const useHsl = [...a.hslH, ...a.hslS, ...a.hslL].some(Boolean);
  const sA = a.splitShadowAmt / 100;
  const hA = a.splitHighAmt / 100;
  const sC = hueRgb(a.splitShadowHue);
  const hC = hueRgb(a.splitHighHue);
  const pivot = 0.5 + (a.splitBalance / 100) * 0.3;
  for (let i = 0; i < d.length; i += 4) {
    let r = d[i] / 255;
    let g = d[i + 1] / 255;
    let b = d[i + 2] / 255;
    r = lut[0][Math.round(tone[Math.round(clamp(r * gain[0], 0, 1) * 1023)] * 255)] / 255;
    g = lut[1][Math.round(tone[Math.round(clamp(g * gain[1], 0, 1) * 1023)] * 255)] / 255;
    b = lut[2][Math.round(tone[Math.round(clamp(b * gain[2], 0, 1) * 1023)] * 255)] / 255;
    let l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    if (useHsl) {
      const mx = Math.max(r, g, b);
      const mn = Math.min(r, g, b);
      const dl = mx - mn;
      if (dl > 0.004) {
        let h = mx === r ? ((g - b) / dl) % 6 : mx === g ? (b - r) / dl + 2 : (r - g) / dl + 4;
        h = (h * 60 + 360) % 360;
        let dh = 0;
        let ds = 0;
        let dlum = 0;
        for (let k = 0; k < 8; k += 1) {
          let diff = Math.abs(h - HSL_BANDS[k].hue);
          if (diff > 180) diff = 360 - diff;
          const w = Math.max(0, 1 - diff / 40);
          if (!w) continue;
          dh += w * a.hslH[k] * 0.3;
          ds += (w * a.hslS[k]) / 100;
          dlum += (w * a.hslL[k]) / 100;
        }
        if (dh || ds || dlum) {
          // rebuild from hue/chroma, keep perceived lightness, then shift it
          const nh = (h + dh + 360) % 360;
          const chroma = dl * clamp(1 + ds, 0, 2);
          const [hr, hg, hb] = hueRgb(nh);
          const hl = 0.2126 * hr + 0.7152 * hg + 0.0722 * hb;
          const target = l * (1 + dlum * 0.45 * Math.min(1, dl * 3));
          r = target + (hr - hl) * chroma;
          g = target + (hg - hl) * chroma;
          b = target + (hb - hl) * chroma;
          l = target;
        }
      }
    }
    if (a.mono) {
      r = l;
      g = l;
      b = l;
    } else if (sat !== 1 || vib) {
      const mx = Math.max(r, g, b);
      const mn = Math.min(r, g, b);
      const k = sat * (1 + vib * (1 - Math.min(1, (mx - mn) * 2)));
      r = l + (r - l) * k;
      g = l + (g - l) * k;
      b = l + (b - l) * k;
    }
    if (sA || hA) {
      const ws = (1 - smooth(0, pivot, l)) * sA * 0.35;
      const wh = smooth(pivot, 1, l) * hA * 0.35;
      r += (sC[0] - 0.5) * ws + (hC[0] - 0.5) * wh;
      g += (sC[1] - 0.5) * ws + (hC[1] - 0.5) * wh;
      b += (sC[2] - 0.5) * ws + (hC[2] - 0.5) * wh;
    }
    d[i] = r * 255;
    d[i + 1] = g * 255;
    d[i + 2] = b * 255;
  }
  ctx.putImageData(img, 0, 0);
}

/** Glow from the highlights: plain (bloom) or red-orange bleeding through the film base (halation). */
function glow(canvas: HTMLCanvasElement, amount: number, color: string | null) {
  if (amount <= 0) return;
  const { width: w, height: h } = canvas;
  const g = document.createElement('canvas');
  g.width = w;
  g.height = h;
  const x = g.getContext('2d')!;
  x.filter = `brightness(0.75) contrast(3.2) blur(${Math.max(2, Math.max(w, h) / (color ? 110 : 70))}px)`;
  x.drawImage(canvas, 0, 0);
  x.filter = 'none';
  if (color) {
    x.globalCompositeOperation = 'multiply';
    x.fillStyle = color;
    x.fillRect(0, 0, w, h);
  }
  const ctx = canvas.getContext('2d')!;
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  ctx.globalAlpha = clamp(amount / 100, 0, 1) * (color ? 0.9 : 0.6);
  ctx.drawImage(g, 0, 0);
  ctx.restore();
}

/** Original → print. `maxSide` keeps the live preview quick; saving passes the full size. */
export function renderAdv(src: CanvasImageSource & { width: number; height: number }, a: Adv, maxSide = Infinity) {
  const sw = (src as HTMLImageElement).naturalWidth || src.width;
  const sh = (src as HTMLImageElement).naturalHeight || src.height;
  const k = Math.min(1, maxSide / Math.max(sw, sh));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(sw * k));
  canvas.height = Math.max(1, Math.round(sh * k));
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(src, 0, 0, canvas.width, canvas.height);
  pixels(canvas, a);
  glow(canvas, a.bloom, null);
  glow(canvas, a.halation, '#ff4b1f');
  if (a.sharpen) toneDetail(canvas, { ...BASE_LOOK, sharpen: a.sharpen });
  paintOverlays(ctx, canvas.width, canvas.height, {
    ...BASE_LOOK,
    grain: a.grain,
    grainSize: a.grainSize,
    vignette: a.vignette / 100,
    lightLeak: a.leak / 100,
  });
  if (a.dust) dust(canvas, a.dust / 100);
  if (a.scratches) scratches(canvas, a.scratches / 100);
  return canvas;
}

/* Recipes ---------------------------------------------------------------------------------------- */

export type Recipe = { id: string; name: string; favorite: boolean; settings: Adv; starter?: boolean };
const s = (p: Partial<Adv>) => normalizeAdv(p);
export const STARTER_RECIPES: Recipe[] = [
  { id: 'st-daylight', name: 'Daylight', favorite: false, starter: true, settings: s({ exposure: 0.1, contrast: 12, highlights: -20, shadows: 14, temp: 6, vibrance: 18, grain: 8 }) },
  { id: 'st-flash', name: 'Flash', favorite: false, starter: true, settings: s({ exposure: 0.2, contrast: 30, whites: 20, blacks: -12, vibrance: 10, vignette: 35, grain: 14, halation: 18 }) },
  { id: 'st-tungsten', name: 'Tungsten', favorite: false, starter: true, settings: s({ temp: -30, tint: 4, contrast: 10, splitHighHue: 35, splitHighAmt: 25, halation: 30, grain: 18, bloom: 15 }) },
  { id: 'st-faded', name: 'Faded print', favorite: false, starter: true, settings: s({ contrast: -18, fade: 45, saturation: -22, temp: 10, splitShadowHue: 200, splitShadowAmt: 20, grain: 12, curve: { m: [[0, 0.08], [0.5, 0.52], [1, 0.94]], r: LINE, g: LINE, b: LINE } }) },
  { id: 'st-mono', name: 'Monochrome', favorite: false, starter: true, settings: s({ mono: true, contrast: 28, blacks: -10, grain: 22, grainSize: 'coarse', vignette: 20, sharpen: 20 }) },
];

const RECIPE_KEY = 'delineate-recipes';
export function loadRecipes(): Recipe[] {
  try {
    const raw = JSON.parse(window.localStorage.getItem(RECIPE_KEY) || 'null');
    if (Array.isArray(raw)) return raw.map((r) => ({ ...r, settings: normalizeAdv(r.settings) }));
  } catch {
    /* fall through to the starters */
  }
  return STARTER_RECIPES;
}
export function saveRecipes(list: Recipe[]) {
  try {
    window.localStorage.setItem(RECIPE_KEY, JSON.stringify(list));
  } catch {
    /* storage full or blocked: recipes last for this visit */
  }
}

/** Documented exchange format: { format: "delineate-recipes", version: 1, recipes: [{ name, settings }] }. */
export const exportRecipes = (list: Recipe[]) =>
  JSON.stringify({ format: 'delineate-recipes', version: 1, recipes: list.map(({ name, settings }) => ({ name, settings })) }, null, 2);
export function parseRecipes(text: string): { name: string; settings: Adv }[] {
  const data = JSON.parse(text);
  if (data?.format !== 'delineate-recipes' || !Array.isArray(data.recipes)) throw new Error('Not a Delineate recipe file.');
  return data.recipes
    .filter((r: unknown): r is { name: string; settings: Partial<Adv> } => typeof (r as { name?: unknown })?.name === 'string' && typeof (r as { settings?: unknown }).settings === 'object')
    .map((r: { name: string; settings: Partial<Adv> }) => ({ name: r.name.slice(0, 60), settings: normalizeAdv(r.settings) }));
}
