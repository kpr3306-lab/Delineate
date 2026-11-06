import type { Effects } from '../types';

/* Canvas effects for the Process tab. Each takes a canvas, mutates or replaces it, returns it.
   Random-looking effects use a fixed seed so the preview matches the saved file. */

const c2d = (c: HTMLCanvasElement) => c.getContext('2d', { willReadFrequently: true })!;
function blank(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}
function copyOf(src: HTMLCanvasElement, filter = 'none') {
  const c = blank(src.width, src.height);
  const ctx = c.getContext('2d')!;
  ctx.filter = filter;
  ctx.drawImage(src, 0, 0);
  return c;
}
function seeded(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const lum = (r: number, g: number, b: number) => 0.299 * r + 0.587 * g + 0.114 * b;

function sigmoidLut(k: number) {
  const sig = (x: number) => 1 / (1 + Math.exp(-k * (x - 0.5)));
  const lo = sig(0);
  const hi = sig(1);
  return Array.from({ length: 256 }, (_, i) => ((sig(i / 255) - lo) / (hi - lo)) * 255);
}
const THERMAL_STOPS: [number, number, number][] = [
  [0, 0, 0], [32, 0, 140], [190, 0, 120], [255, 70, 0], [255, 210, 0], [255, 255, 255],
];
const THERMAL = Array.from({ length: 256 }, (_, i) => {
  const t = (i / 255) * (THERMAL_STOPS.length - 1);
  const a = THERMAL_STOPS[Math.floor(t)];
  const b = THERMAL_STOPS[Math.min(THERMAL_STOPS.length - 1, Math.floor(t) + 1)];
  const f = t - Math.floor(t);
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
});

/** All the per-pixel colour science in one read/write. */
export function colorPass(canvas: HTMLCanvasElement, e: Effects) {
  const { infrared: ir, crossProcess: xp, solarize: so, bleach: bb, negative: ng, thermal: th } = e;
  if (!(ir || xp || so || bb || ng || th)) return canvas;
  const ctx = c2d(canvas);
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = img.data;
  const xr = sigmoidLut(9);
  const xg = sigmoidLut(6);
  for (let i = 0; i < d.length; i += 4) {
    let r = d[i];
    let g = d[i + 1];
    let b = d[i + 2];
    if (ir) {
      // false-colour infrared: foliage reflects IR → shows red/pink, skies go deep
      const nr = Math.max(g * 1.15, r * 0.9);
      const ngr = r * 0.75 + b * 0.1;
      const nb = b * 0.95;
      r += (nr - r) * ir;
      g += (ngr - g) * ir;
      b += (nb - b) * ir;
    }
    if (xp) {
      // slide film in C-41 chemistry: punchy red/green curves, flattened yellow-cast blues
      r += (xr[Math.max(0, Math.min(255, r | 0))] - r) * xp;
      g += (xg[Math.max(0, Math.min(255, g | 0))] - g) * xp;
      b += (b * 0.7 + 38 - b) * xp;
    }
    if (bb) {
      const l = lum(r, g, b);
      r += (l - r) * 0.6 * bb;
      g += (l - g) * 0.6 * bb;
      b += (l - b) * 0.6 * bb;
      const k = 1 + 0.6 * bb;
      r = (r - 128) * k + 128;
      g = (g - 128) * k + 128;
      b = (b - 128) * k + 128;
    }
    if (so) {
      r += ((r > 128 ? 255 - r : r) * 1.4 - r) * so;
      g += ((g > 128 ? 255 - g : g) * 1.4 - g) * so;
      b += ((b > 128 ? 255 - b : b) * 1.4 - b) * so;
    }
    if (ng) {
      r += ((255 - r) * 0.95 + 10 - r) * ng;
      g += ((255 - g) * 0.7 + 22 - g) * ng;
      b += ((255 - b) * 0.48 + 30 - b) * ng;
    }
    if (th) {
      const t = THERMAL[Math.max(0, Math.min(255, lum(r, g, b) | 0))];
      r += (t[0] - r) * th;
      g += (t[1] - g) * th;
      b += (t[2] - b) * th;
    }
    d[i] = r;
    d[i + 1] = g;
    d[i + 2] = b;
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

/** Light trails: fading copies kept only where brighter. */
export function trails(canvas: HTMLCanvasElement, amt: number) {
  if (amt <= 0) return canvas;
  const src = copyOf(canvas);
  const ctx = canvas.getContext('2d')!;
  const len = canvas.width * 0.07 * amt;
  ctx.save();
  ctx.globalCompositeOperation = 'lighten';
  for (let i = 1; i <= 10; i += 1) {
    ctx.globalAlpha = 0.75 * (1 - i / 11);
    ctx.drawImage(src, (i / 10) * len, (i / 10) * len * 0.3);
  }
  ctx.restore();
  return canvas;
}

/** "Long exposure" zoom: averaging copies scaled from the centre, like zooming during the shot. */
export function zoomBurst(canvas: HTMLCanvasElement, amt: number) {
  if (amt <= 0) return canvas;
  const src = copyOf(canvas);
  const { width: w, height: h } = canvas;
  const ctx = canvas.getContext('2d')!;
  for (let i = 1; i <= 14; i += 1) {
    const s = 1 + i * 0.01 * amt;
    ctx.globalAlpha = 1 / (i + 1);
    ctx.drawImage(src, (w - w * s) / 2, (h - h * s) / 2, w * s, h * s);
  }
  ctx.globalAlpha = 1;
  return canvas;
}

/** Diffusion / Pro-Mist: highlights bloom softly into the shadows. */
export function mist(canvas: HTMLCanvasElement, amt: number) {
  if (amt <= 0) return canvas;
  const glow = copyOf(canvas, `blur(${Math.max(3, canvas.width / 45)}px) brightness(1.1)`);
  const ctx = canvas.getContext('2d')!;
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  ctx.globalAlpha = 0.45 * amt;
  ctx.drawImage(glow, 0, 0);
  ctx.globalCompositeOperation = 'lighten';
  ctx.globalAlpha = 0.35 * amt;
  ctx.drawImage(glow, 0, 0);
  ctx.restore();
  return canvas;
}

/** Find the brightest spots on a small copy (cheap). */
function brightSpots(canvas: HTMLCanvasElement, max: number, threshold: number) {
  const sw = 120;
  const sh = Math.max(1, Math.round((canvas.height / canvas.width) * sw));
  const small = blank(sw, sh);
  const sctx = c2d(small);
  sctx.drawImage(canvas, 0, 0, sw, sh);
  const d = sctx.getImageData(0, 0, sw, sh).data;
  const L = (x: number, y: number) => {
    const i = (y * sw + x) * 4;
    return lum(d[i], d[i + 1], d[i + 2]);
  };
  const spots: { x: number; y: number; l: number }[] = [];
  for (let y = 1; y < sh - 1; y += 1)
    for (let x = 1; x < sw - 1; x += 1) {
      const l = L(x, y);
      if (l < threshold) continue;
      if (l >= L(x - 1, y) && l >= L(x + 1, y) && l >= L(x, y - 1) && l >= L(x, y + 1)) spots.push({ x, y, l });
    }
  spots.sort((a, b) => b.l - a.l);
  const picked: typeof spots = [];
  for (const s of spots) {
    if (picked.length >= max) break;
    if (picked.every((p) => Math.hypot(p.x - s.x, p.y - s.y) > 6)) picked.push(s);
  }
  const k = canvas.width / sw;
  return picked.map((p) => ({ x: (p.x + 0.5) * k, y: (p.y + 0.5) * k, l: p.l }));
}

/** Star filter: cross-shaped rays from every point light. */
export function starburst(canvas: HTMLCanvasElement, amt: number) {
  if (amt <= 0) return canvas;
  const ctx = canvas.getContext('2d')!;
  const base = Math.min(canvas.width, canvas.height);
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  for (const s of brightSpots(canvas, 28, 225)) {
    const len = base * 0.14 * amt * (0.5 + (s.l - 225) / 60);
    for (let k = 0; k < 4; k += 1) {
      const a = (k * Math.PI) / 4 + Math.PI / 8;
      const dx = Math.cos(a) * len;
      const dy = Math.sin(a) * len;
      const g = ctx.createLinearGradient(s.x - dx, s.y - dy, s.x + dx, s.y + dy);
      g.addColorStop(0, 'rgba(255,255,255,0)');
      g.addColorStop(0.5, `rgba(255,250,235,${0.9 * amt})`);
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.strokeStyle = g;
      ctx.lineWidth = Math.max(1, base / 420);
      ctx.beginPath();
      ctx.moveTo(s.x - dx, s.y - dy);
      ctx.lineTo(s.x + dx, s.y + dy);
      ctx.stroke();
    }
    const glow = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, base * 0.02);
    glow.addColorStop(0, `rgba(255,255,255,${0.8 * amt})`);
    glow.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(s.x - base * 0.02, s.y - base * 0.02, base * 0.04, base * 0.04);
  }
  ctx.restore();
  return canvas;
}

/** Lens flare from the brightest light (or the top-right corner if there is none). */
export function flare(canvas: HTMLCanvasElement, amt: number) {
  if (amt <= 0) return canvas;
  const { width: w, height: h } = canvas;
  const src = brightSpots(canvas, 1, 200)[0] ?? { x: w * 0.78, y: h * 0.2 };
  const ctx = canvas.getContext('2d')!;
  const base = Math.max(w, h);
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  const sun = ctx.createRadialGradient(src.x, src.y, 0, src.x, src.y, base * 0.35);
  sun.addColorStop(0, `rgba(255,240,210,${0.7 * amt})`);
  sun.addColorStop(0.2, `rgba(255,180,110,${0.25 * amt})`);
  sun.addColorStop(1, 'rgba(255,160,90,0)');
  ctx.fillStyle = sun;
  ctx.fillRect(0, 0, w, h);
  const cx = w / 2;
  const cy = h / 2;
  const ghosts: [number, number, string][] = [
    [0.35, 0.03, '120,200,255'], [0.7, 0.06, '255,140,90'], [1.15, 0.025, '160,255,180'], [1.45, 0.09, '200,140,255'], [1.8, 0.04, '255,220,120'],
  ];
  for (const [t, r, color] of ghosts) {
    const x = src.x + (cx - src.x) * t;
    const y = src.y + (cy - src.y) * t;
    const g = ctx.createRadialGradient(x, y, 0, x, y, base * r);
    g.addColorStop(0, `rgba(${color},${0.05 * amt})`);
    g.addColorStop(0.8, `rgba(${color},${0.22 * amt})`);
    g.addColorStop(1, `rgba(${color},0)`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, base * r, 0, Math.PI * 2);
    ctx.fill();
  }
  const streak = ctx.createLinearGradient(0, src.y, w, src.y);
  streak.addColorStop(0, 'rgba(255,220,180,0)');
  streak.addColorStop(src.x / w, `rgba(255,220,180,${0.35 * amt})`);
  streak.addColorStop(1, 'rgba(255,220,180,0)');
  ctx.fillStyle = streak;
  ctx.fillRect(0, src.y - base * 0.004, w, base * 0.008);
  ctx.restore();
  return canvas;
}

/** Light leaks: warm blooms bleeding in from the film edges. */
export function leaks(canvas: HTMLCanvasElement, amt: number) {
  if (amt <= 0) return canvas;
  const { width: w, height: h } = canvas;
  const ctx = canvas.getContext('2d')!;
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  const blobs: [number, number, number, string][] = [
    [0, 0.2, 0.55, '255,96,40'], [0.05, 0.75, 0.4, '255,170,60'], [1, 0.9, 0.5, '255,60,90'],
  ];
  for (const [fx, fy, fr, color] of blobs) {
    const g = ctx.createRadialGradient(fx * w, fy * h, 0, fx * w, fy * h, Math.max(w, h) * fr);
    g.addColorStop(0, `rgba(${color},${0.85 * amt})`);
    g.addColorStop(0.5, `rgba(${color},${0.25 * amt})`);
    g.addColorStop(1, `rgba(${color},0)`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }
  ctx.restore();
  return canvas;
}

/** Soft vignette: edges fall off gently and lose sharpness, like an old lens. */
export function softVignette(canvas: HTMLCanvasElement, amt: number) {
  if (amt <= 0) return canvas;
  const { width: w, height: h } = canvas;
  const soft = copyOf(canvas, `blur(${Math.max(2, w / 120)}px)`);
  const sctx = soft.getContext('2d')!;
  const mask = sctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.7);
  mask.addColorStop(0, 'rgba(0,0,0,0)');
  mask.addColorStop(1, `rgba(0,0,0,${amt})`);
  sctx.globalCompositeOperation = 'destination-in';
  sctx.fillStyle = mask;
  sctx.fillRect(0, 0, w, h);
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(soft, 0, 0);
  const dark = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.8);
  dark.addColorStop(0, 'rgba(20,16,12,0)');
  dark.addColorStop(1, `rgba(20,16,12,${0.45 * amt})`);
  ctx.fillStyle = dark;
  ctx.fillRect(0, 0, w, h);
  return canvas;
}

/** Chromatic aberration: red and blue planes pulled apart. */
export function rgbSplit(canvas: HTMLCanvasElement, amt: number) {
  if (amt <= 0) return canvas;
  const { width: w, height: h } = canvas;
  const off = Math.max(1, Math.round(w * 0.008 * amt));
  const ctx = c2d(canvas);
  const src = ctx.getImageData(0, 0, w, h);
  const out = ctx.createImageData(w, h);
  const s = src.data;
  const o = out.data;
  for (let y = 0; y < h; y += 1)
    for (let x = 0; x < w; x += 1) {
      const i = (y * w + x) * 4;
      o[i] = s[(y * w + Math.min(w - 1, x + off)) * 4];
      o[i + 1] = s[i + 1];
      o[i + 2] = s[(y * w + Math.max(0, x - off)) * 4 + 2];
      o[i + 3] = 255;
    }
  ctx.putImageData(out, 0, 0);
  return canvas;
}

/** MiniDV tape: blocky chroma noise, luma hiss, interlace lines. */
export function miniDv(canvas: HTMLCanvasElement, amt: number) {
  if (amt <= 0) return canvas;
  const { width: w, height: h } = canvas;
  const ctx = c2d(canvas);
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  const rand = seeded(7);
  const block = 4;
  const bw = Math.ceil(w / block);
  const chroma = Array.from({ length: bw * Math.ceil(h / block) }, () => [(rand() - 0.5) * 50 * amt, (rand() - 0.5) * 50 * amt]);
  for (let y = 0; y < h; y += 1) {
    const line = y % 2 ? 1 - 0.1 * amt : 1;
    for (let x = 0; x < w; x += 1) {
      const i = (y * w + x) * 4;
      const n = (rand() - 0.5) * 34 * amt;
      const c = chroma[Math.floor(y / block) * bw + Math.floor(x / block)];
      d[i] = (d[i] + n + c[0]) * line;
      d[i + 1] = (d[i + 1] + n) * line;
      d[i + 2] = (d[i + 2] + n + c[1] + 6 * amt) * line;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

/** Tape glitch: horizontal slices knocked sideways. */
export function glitch(canvas: HTMLCanvasElement, amt: number) {
  if (amt <= 0) return canvas;
  const { width: w, height: h } = canvas;
  const src = copyOf(canvas);
  const ctx = canvas.getContext('2d')!;
  const rand = seeded(42);
  const slices = Math.round(4 + 10 * amt);
  for (let k = 0; k < slices; k += 1) {
    const y = rand() * h;
    const sh = h * (0.005 + rand() * 0.05);
    const dx = (rand() - 0.5) * w * 0.12 * amt;
    ctx.drawImage(src, 0, y, w, sh, dx, y, w, sh);
    if (rand() > 0.6) {
      ctx.fillStyle = `rgba(${rand() > 0.5 ? '255,0,120' : '0,220,255'},${0.25 * amt})`;
      ctx.fillRect(0, y, w, sh);
    }
  }
  return canvas;
}

/** CRT television: phosphor mask, scanlines, glow, curved glass and rounded corners. */
export function crt(canvas: HTMLCanvasElement, amt: number) {
  if (amt <= 0) return canvas;
  const { width: w, height: h } = canvas;
  const glow = copyOf(canvas, `blur(${Math.max(2, w / 200)}px)`);
  let ctx = canvas.getContext('2d')!;
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  ctx.globalAlpha = 0.35 * amt;
  ctx.drawImage(glow, 0, 0);
  ctx.globalCompositeOperation = 'multiply';
  ctx.globalAlpha = 0.6 * amt;
  const px = Math.max(1, Math.round(w / 400));
  const mask = blank(px * 3, px * 3);
  const m = mask.getContext('2d')!;
  ['#ff6060', '#60ff60', '#6060ff'].forEach((col, i) => {
    m.fillStyle = col;
    m.fillRect(i * px, 0, px, px * 2);
  });
  m.fillStyle = '#404040';
  m.fillRect(0, px * 2, px * 3, px);
  ctx.fillStyle = ctx.createPattern(mask, 'repeat')!;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
  // curvature: draw back onto a black screen with slight barrel squeeze and rounded corners
  const flat = copyOf(canvas);
  const out = canvas;
  ctx = out.getContext('2d')!;
  ctx.fillStyle = '#050505';
  ctx.fillRect(0, 0, w, h);
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(w * 0.02, h * 0.02, w * 0.96, h * 0.96, Math.min(w, h) * 0.08 * amt);
  ctx.clip();
  const bands = 40;
  for (let i = 0; i < bands; i += 1) {
    const t = (i + 0.5) / bands - 0.5;
    const squeeze = 1 - 0.06 * amt * (1 - 4 * t * t);
    const sy = (i / bands) * h;
    const bh = h / bands;
    const dw = w * 0.96 * (2 - squeeze);
    ctx.drawImage(flat, 0, sy, w, bh, (w - dw) / 2, sy, dw, bh + 1);
  }
  const vig = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.7);
  vig.addColorStop(0, 'rgba(0,0,0,0)');
  vig.addColorStop(1, `rgba(0,0,0,${0.6 * amt})`);
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
  return out;
}

/** Old video grain: coloured noise and a few dropout lines (moves in the live preview). */
export function videoGrain(canvas: HTMLCanvasElement, amt: number) {
  if (amt <= 0) return canvas;
  const { width: w, height: h } = canvas;
  const noise = blank(160, 160);
  const n = c2d(noise);
  const img = n.createImageData(160, 160);
  const rand = seeded(3);
  for (let i = 0; i < img.data.length; i += 4) {
    img.data[i] = rand() * 255;
    img.data[i + 1] = rand() * 255;
    img.data[i + 2] = rand() * 255;
    img.data[i + 3] = 255;
  }
  n.putImageData(img, 0, 0);
  const ctx = canvas.getContext('2d')!;
  ctx.save();
  ctx.globalCompositeOperation = 'overlay';
  ctx.globalAlpha = 0.5 * amt;
  ctx.fillStyle = ctx.createPattern(noise, 'repeat')!;
  ctx.fillRect(0, 0, w, h);
  ctx.globalCompositeOperation = 'screen';
  ctx.globalAlpha = 0.5 * amt;
  ctx.fillStyle = '#fff';
  for (let k = 0; k < 6; k += 1) ctx.fillRect(rand() * w * 0.5, rand() * h, w * (0.1 + rand() * 0.5), Math.max(1, h / 500));
  ctx.restore();
  return canvas;
}

/** Film gate weave: the frame sits slightly off in the projector gate, showing its black edge. */
export function gateWeave(canvas: HTMLCanvasElement, amt: number) {
  if (amt <= 0) return canvas;
  const { width: w, height: h } = canvas;
  const src = copyOf(canvas);
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#080706';
  ctx.fillRect(0, 0, w, h);
  ctx.save();
  ctx.translate(w / 2 + w * 0.008 * amt, h / 2 + h * 0.018 * amt);
  ctx.rotate(0.006 * amt);
  ctx.drawImage(src, -w / 2, -h / 2);
  ctx.restore();
  ctx.fillStyle = `rgba(8,7,6,${0.8 * amt})`;
  ctx.fillRect(0, 0, w, h * 0.012 * amt);
  return canvas;
}

/** Anamorphic: blue horizontal streaks on highlights, letterboxed into 16:9. */
export function anamorphic(canvas: HTMLCanvasElement, amt: number) {
  if (amt <= 0) return canvas;
  const { width: w, height: h } = canvas;
  const thin = blank(Math.max(8, w / 48), h);
  const t = thin.getContext('2d')!;
  t.filter = 'grayscale(1) brightness(0.9) contrast(7)';
  t.drawImage(canvas, 0, 0, thin.width, h);
  const streak = blank(w, h);
  const s = streak.getContext('2d')!;
  s.imageSmoothingQuality = 'high';
  s.drawImage(thin, 0, 0, w, h); // stretching back smears highlights sideways
  s.globalCompositeOperation = 'multiply';
  s.fillStyle = '#3d8bff';
  s.fillRect(0, 0, w, h);
  const ctx = canvas.getContext('2d')!;
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  ctx.globalAlpha = Math.min(1, 1.2 * amt);
  ctx.drawImage(streak, 0, 0);
  ctx.restore();
  const boxed = blank(w, Math.round((w * 9) / 16));
  const b = boxed.getContext('2d')!;
  b.fillStyle = '#000';
  b.fillRect(0, 0, boxed.width, boxed.height);
  b.drawImage(canvas, 0, (boxed.height - h) / 2);
  return boxed;
}

export const FX_GROUPS: { name: string; items: { key: keyof Effects; label: string }[] }[] = [
  { name: 'Light', items: [
    { key: 'halation', label: 'Halation' }, { key: 'mist', label: 'Diffusion / mist' }, { key: 'starburst', label: 'Starburst filter' },
    { key: 'flare', label: 'Lens flare' }, { key: 'leak', label: 'Light leaks' }, { key: 'flash', label: 'Flash simulation' },
  ] },
  { name: 'Motion & time', items: [
    { key: 'motionBlur', label: 'Motion blur' }, { key: 'trails', label: 'Motion trails' },
    { key: 'zoomBurst', label: 'Long exposure (zoom)' }, { key: 'gateWeave', label: 'Film gate weave' },
  ] },
  { name: 'Colour science', items: [
    { key: 'infrared', label: 'Infrared' }, { key: 'crossProcess', label: 'Cross-processing' }, { key: 'bleach', label: 'Bleach bypass' },
    { key: 'solarize', label: 'Solarization' }, { key: 'negative', label: 'Negative film' }, { key: 'thermal', label: 'Thermal camera' },
  ] },
  { name: 'Video & screens', items: [
    { key: 'rgbSplit', label: 'RGB split' }, { key: 'miniDv', label: 'MiniDV noise' }, { key: 'videoGrain', label: 'Moving video grain' },
    { key: 'crt', label: 'CRT screen' }, { key: 'glitch', label: 'Tape glitch' },
  ] },
  { name: 'Lens', items: [
    { key: 'vignette', label: 'Vignette' }, { key: 'softVignette', label: 'Soft vignette' },
    { key: 'fisheye', label: 'Fisheye lens' }, { key: 'anamorphic', label: 'Anamorphic widescreen' },
  ] },
];
