import { GIFEncoder, applyPalette, quantize } from 'gifenc';
import { clamp } from './utils';

export type ArtStyle = 'pixel' | 'abstract' | 'geometric' | 'animated';
export type PaletteKey = 'sunset' | 'acid' | 'ice' | 'mono' | 'celluloid' | 'riso' | 'vapor' | 'forest' | 'noir';
export type GeometricPattern =
  | 'triangles'
  | 'blocks'
  | 'mosaic'
  | 'hexagons'
  | 'diamonds'
  | 'lowpoly'
  | 'glass'
  | 'orbs'
  | 'halftone'
  | 'engrave';
export type AnimationMode = 'drift' | 'vhs' | 'pulse';
/** Colour comes from the chosen palette (mapped by brightness) or from the photo itself. */
export type ColorMode = 'palette' | 'photo';
export type PixelPalette = 'auto' | 'gameboy' | 'pico8' | 'cga' | 'onebit' | 'riso';
export type PixelShape = 'square' | 'dot' | 'brick';
export type AbstractMode = 'swirl' | 'ripple' | 'kaleido' | 'marble';

export type ArtSettings = {
  palette: PaletteKey;
  colorMode: ColorMode;
  vignette: boolean;
  // pixel
  pixelSize: number;
  colorCount: number;
  dither: boolean;
  pixelPalette: PixelPalette;
  pixelShape: PixelShape;
  pixelGrid: boolean;
  // abstract
  abstractMode: AbstractMode;
  abstractIntensity: number;
  segments: number;
  outlines: boolean;
  // geometric
  pattern: GeometricPattern;
  /** Shapes across the long side. */
  detail: number;
  /** 0–100: how much smaller shapes get where the photo is busy. */
  adaptive: number;
  /** 0–100: how hand-cut / organic the shapes are. */
  jitter: number;
  /** Outline / grout weight in thousandths of the long side; 0 = none. */
  lineWeight: number;
  seed: number;
  // animated
  animMode: AnimationMode;
  animSpeed: number;
  animIntensity: number;
};

export const DEFAULT_ART: ArtSettings = {
  palette: 'sunset',
  colorMode: 'palette',
  vignette: true,
  pixelSize: 9,
  colorCount: 12,
  dither: true,
  pixelPalette: 'auto',
  pixelShape: 'square',
  pixelGrid: false,
  abstractMode: 'swirl',
  abstractIntensity: 6,
  segments: 8,
  outlines: true,
  pattern: 'triangles',
  detail: 56,
  adaptive: 60,
  jitter: 35,
  lineWeight: 0.5,
  seed: 7,
  animMode: 'drift',
  animSpeed: 3,
  animIntensity: 55,
};

export const PALETTES: Record<
  PaletteKey,
  { name: string; stops: string[]; dark: string; light: string }
> = {
  sunset: { name: 'Sunset', stops: ['#160f2e', '#4e2350', '#b53f4d', '#ef9b5b', '#ffedb5'], dark: '#160f2e', light: '#ffedb5' },
  acid: { name: 'Acid', stops: ['#101b12', '#294b28', '#7b9f45', '#d8e77b', '#f6ffcf'], dark: '#101b12', light: '#f6ffcf' },
  ice: { name: 'Ice', stops: ['#08131f', '#173552', '#2f7593', '#8fc9c4', '#f1fcfa'], dark: '#08131f', light: '#f1fcfa' },
  mono: { name: 'Graphite', stops: ['#080808', '#303030', '#77736c', '#c7c1b5', '#fffaf0'], dark: '#080808', light: '#fffaf0' },
  celluloid: { name: 'Celluloid', stops: ['#211a11', '#59422b', '#a76a3f', '#e2b46d', '#fff0c9'], dark: '#211a11', light: '#fff0c9' },
  riso: { name: 'Riso', stops: ['#1b1b3a', '#0078bf', '#ff48b0', '#ffe800', '#f7f3e8'], dark: '#1b1b3a', light: '#f7f3e8' },
  vapor: { name: 'Vapor', stops: ['#1a0b2e', '#5b2a86', '#ff6ec7', '#7afcff', '#fffbe6'], dark: '#1a0b2e', light: '#fffbe6' },
  forest: { name: 'Forest', stops: ['#0f1f17', '#24452f', '#5a7d4a', '#c8b88a', '#f4efe0'], dark: '#0f1f17', light: '#f4efe0' },
  noir: { name: 'Noir red', stops: ['#0a0a0a', '#2b0d0d', '#8b1e1e', '#e6d5c3', '#ffffff'], dark: '#0a0a0a', light: '#ffffff' },
};

/** Fixed retro palettes for the pixel study ('auto' picks colours from the photo). */
export const PIXEL_PALETTES: Record<Exclude<PixelPalette, 'auto'>, { name: string; colors: string[] }> = {
  gameboy: { name: 'Game Boy', colors: ['#0f380f', '#306230', '#8bac0f', '#9bbc0f'] },
  pico8: { name: 'PICO-8', colors: ['#000000', '#1d2b53', '#7e2553', '#008751', '#ab5236', '#5f574f', '#c2c3c7', '#fff1e8', '#ff004d', '#ffa300', '#ffec27', '#00e436', '#29adff', '#83769c', '#ff77a8', '#ffccaa'] },
  cga: { name: 'CGA', colors: ['#000000', '#55ffff', '#ff55ff', '#ffffff'] },
  onebit: { name: '1-bit', colors: ['#1a1a1a', '#f2f0e6'] },
  riso: { name: 'Riso print', colors: ['#f7f3e8', '#ff48b0', '#0078bf', '#ffe800', '#1b1b3a'] },
};

type RGB = [number, number, number];

function hexToRgb(hex: string): RGB {
  const value = hex.replace('#', '');
  return [
    parseInt(value.slice(0, 2), 16),
    parseInt(value.slice(2, 4), 16),
    parseInt(value.slice(4, 6), 16),
  ];
}

const paletteCache = new Map<PaletteKey, RGB[]>();

function getPalette(key: PaletteKey) {
  const cached = paletteCache.get(key);
  if (cached) return cached;
  const parsed = (PALETTES[key] ?? PALETTES.sunset).stops.map(hexToRgb);
  paletteCache.set(key, parsed);
  return parsed;
}

function samplePalette(stops: RGB[], t: number): RGB {
  const scaled = clamp(t, 0, 1) * (stops.length - 1);
  const index = Math.min(stops.length - 2, Math.floor(scaled));
  const mix = scaled - index;
  const a = stops[index];
  const b = stops[index + 1];
  return [
    Math.round(a[0] + (b[0] - a[0]) * mix),
    Math.round(a[1] + (b[1] - a[1]) * mix),
    Math.round(a[2] + (b[2] - a[2]) * mix),
  ];
}

const luma = (r: number, g: number, b: number) => (r * 0.2126 + g * 0.7152 + b * 0.0722) / 255;
const rgbCss = (c: RGB, alpha = 1) => `rgba(${c[0] | 0}, ${c[1] | 0}, ${c[2] | 0}, ${alpha})`;

/** Seeded random so the preview and the full-size export draw the same shapes. */
function seededRandom(seed: number) {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function vignette(context: CanvasRenderingContext2D, width: number, height: number, strength = 0.25) {
  const g = context.createRadialGradient(width / 2, height / 2, Math.min(width, height) * 0.3, width / 2, height / 2, Math.max(width, height) * 0.72);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, `rgba(0,0,0,${strength})`);
  context.fillStyle = g;
  context.fillRect(0, 0, width, height);
}

function drawCover(
  context: CanvasRenderingContext2D,
  image: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  width: number,
  height: number,
  zoom = 1,
  panX = 0,
  panY = 0,
) {
  const scale = Math.max(width / sourceWidth, height / sourceHeight) * zoom;
  const drawWidth = sourceWidth * scale;
  const drawHeight = sourceHeight * scale;
  context.drawImage(
    image,
    (width - drawWidth) / 2 + panX,
    (height - drawHeight) / 2 + panY,
    drawWidth,
    drawHeight,
  );
}

function sourceImageData(
  image: HTMLImageElement,
  width: number,
  height: number,
  smooth = true,
) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: true })!;
  context.imageSmoothingEnabled = smooth;
  context.imageSmoothingQuality = 'high';
  drawCover(
    context,
    image,
    image.naturalWidth || image.width,
    image.naturalHeight || image.height,
    width,
    height,
  );
  return { canvas, context, data: context.getImageData(0, 0, width, height) };
}

const BAYER = [
  0, 8, 2, 10,
  12, 4, 14, 6,
  3, 11, 1, 9,
  15, 7, 13, 5,
];

function applyDither(data: ImageData, strength = 24) {
  const pixels = data.data;
  for (let y = 0; y < data.height; y += 1) {
    for (let x = 0; x < data.width; x += 1) {
      const offset = (y * data.width + x) * 4;
      const threshold = (BAYER[(y % 4) * 4 + (x % 4)] / 16 - 0.5) * strength;
      pixels[offset] = clamp(pixels[offset] + threshold, 0, 255);
      pixels[offset + 1] = clamp(pixels[offset + 1] + threshold, 0, 255);
      pixels[offset + 2] = clamp(pixels[offset + 2] + threshold, 0, 255);
    }
  }
}

function renderPixel(
  image: HTMLImageElement,
  width: number,
  height: number,
  settings: ArtSettings,
) {
  const output = document.createElement('canvas');
  output.width = width;
  output.height = height;
  const context = output.getContext('2d')!;
  context.imageSmoothingEnabled = false;

  // pixel size is set against a 960px preview, so the export keeps the same number of blocks
  const block = (settings.pixelSize * Math.max(width, height)) / 960;
  const smallWidth = Math.max(8, Math.round(width / block));
  const smallHeight = Math.max(8, Math.round(height / block));
  const { data } = sourceImageData(image, smallWidth, smallHeight, true);
  if (settings.dither) applyDither(data, settings.pixelPalette === 'auto' ? 26 : 40);

  const colors: RGB[] = new Array(smallWidth * smallHeight);
  if (settings.pixelPalette === 'auto') {
    const palette = quantize(data.data, Math.max(4, Math.round(settings.colorCount)), { format: 'rgb444' });
    const indexed = applyPalette(data.data, palette, 'rgb444');
    for (let i = 0; i < indexed.length; i += 1) colors[i] = palette[indexed[i]] as RGB;
  } else {
    const fixed = PIXEL_PALETTES[settings.pixelPalette].colors.map(hexToRgb);
    for (let i = 0; i < colors.length; i += 1) {
      const o = i * 4;
      let best = fixed[0];
      let bestD = Infinity;
      for (const c of fixed) {
        // weighted RGB distance tracks perceived difference better than plain RGB
        const dr = data.data[o] - c[0];
        const dg = data.data[o + 1] - c[1];
        const db = data.data[o + 2] - c[2];
        const d = dr * dr * 0.3 + dg * dg * 0.59 + db * db * 0.11;
        if (d < bestD) {
          bestD = d;
          best = c;
        }
      }
      colors[i] = best;
    }
  }

  const bw = width / smallWidth;
  const bh = height / smallHeight;
  if (settings.pixelShape === 'square' && !settings.pixelGrid) {
    const small = document.createElement('canvas');
    small.width = smallWidth;
    small.height = smallHeight;
    const sctx = small.getContext('2d')!;
    const img = sctx.createImageData(smallWidth, smallHeight);
    colors.forEach((c, i) => {
      img.data[i * 4] = c[0];
      img.data[i * 4 + 1] = c[1];
      img.data[i * 4 + 2] = c[2];
      img.data[i * 4 + 3] = 255;
    });
    sctx.putImageData(img, 0, 0);
    context.drawImage(small, 0, 0, width, height);
  } else {
    // darkest colour as the board behind dots, studs and grid gaps
    const board = colors.reduce((a, c) => (luma(...c) < luma(...a) ? c : a), colors[0]);
    context.fillStyle = rgbCss([board[0] * 0.6, board[1] * 0.6, board[2] * 0.6]);
    context.fillRect(0, 0, width, height);
    const gap = settings.pixelGrid ? Math.max(1, Math.min(bw, bh) * 0.08) : 0;
    for (let y = 0; y < smallHeight; y += 1) {
      for (let x = 0; x < smallWidth; x += 1) {
        const c = colors[y * smallWidth + x];
        const px = x * bw;
        const py = y * bh;
        context.fillStyle = rgbCss(c);
        if (settings.pixelShape === 'dot') {
          context.beginPath();
          context.arc(px + bw / 2, py + bh / 2, Math.min(bw, bh) * 0.46 - gap / 2, 0, Math.PI * 2);
          context.fill();
        } else {
          context.fillRect(px + gap / 2, py + gap / 2, Math.ceil(bw - gap), Math.ceil(bh - gap));
          if (settings.pixelShape === 'brick') {
            // a moulded stud: lit top-left, shaded bottom-right
            const r = Math.min(bw, bh) * 0.3;
            const cx = px + bw / 2;
            const cy = py + bh / 2;
            context.fillStyle = 'rgba(0,0,0,0.28)';
            context.beginPath();
            context.arc(cx + r * 0.12, cy + r * 0.16, r, 0, Math.PI * 2);
            context.fill();
            context.fillStyle = rgbCss(c);
            context.beginPath();
            context.arc(cx, cy, r, 0, Math.PI * 2);
            context.fill();
            context.fillStyle = 'rgba(255,255,255,0.28)';
            context.beginPath();
            context.arc(cx - r * 0.3, cy - r * 0.3, r * 0.35, 0, Math.PI * 2);
            context.fill();
          }
        }
      }
    }
  }
  if (settings.vignette) vignette(context, width, height, 0.22);
  return output;
}

function renderAbstract(
  image: HTMLImageElement,
  width: number,
  height: number,
  settings: ArtSettings,
) {
  const { data: source } = sourceImageData(image, width, height, true);
  const output = document.createElement('canvas');
  output.width = width;
  output.height = height;
  const context = output.getContext('2d')!;
  const target = context.createImageData(width, height);
  const stops = getPalette(settings.palette);
  const intensity = settings.abstractIntensity / 10;
  const k = Math.max(width, height) / 680; // distances are tuned at the 680px preview
  const centerX = width / 2;
  const centerY = height / 2;
  const maxRadius = Math.hypot(centerX, centerY);
  const segment = (Math.PI * 2) / Math.max(3, settings.segments);
  const mode = settings.abstractMode;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const dx = x - centerX;
      const dy = y - centerY;
      const radius = Math.hypot(dx, dy);
      const normalized = radius / maxRadius;
      let angle = Math.atan2(dy, dx);
      let sourceX: number;
      let sourceY: number;
      if (mode === 'ripple') {
        const wave = Math.sin(normalized * (18 + intensity * 4)) * intensity * 6 * k;
        sourceX = x + (radius ? (dx / radius) * wave : 0);
        sourceY = y + (radius ? (dy / radius) * wave : 0);
      } else if (mode === 'kaleido') {
        // fold every angle into one wedge and mirror it, with a little twist outward
        const a = (((angle % segment) + segment) % segment) - segment / 2;
        angle = Math.abs(a) + normalized * intensity * 0.12;
        sourceX = centerX + Math.cos(angle) * radius;
        sourceY = centerY + Math.sin(angle) * radius;
      } else if (mode === 'marble') {
        const f = 0.012 / k;
        const amp = intensity * 7 * k;
        sourceX = x + Math.sin(y * f * 1.3 + Math.sin(x * f * 0.7) * 2.2) * amp;
        sourceY = y + Math.cos(x * f * 1.1 + Math.sin(y * f * 0.9) * 2.2) * amp;
      } else {
        angle += (1 - normalized) * intensity * 3.4;
        const wobble = 1 + Math.sin(normalized * 11 + angle * 2.5) * intensity * 0.09;
        sourceX = centerX + Math.cos(angle) * radius * wobble + Math.sin((y / height) * Math.PI * 4) * intensity * 20 * k;
        sourceY = centerY + Math.sin(angle) * radius * wobble + Math.cos((x / width) * Math.PI * 3) * intensity * 12 * k;
      }
      sourceX = clamp(sourceX, 0, width - 1);
      sourceY = clamp(sourceY, 0, height - 1);

      const so = (Math.floor(sourceY) * width + Math.floor(sourceX)) * 4;
      const red = source.data[so];
      const green = source.data[so + 1];
      const blue = source.data[so + 2];
      const to = (y * width + x) * 4;
      if (settings.colorMode === 'photo') {
        target.data[to] = red;
        target.data[to + 1] = green;
        target.data[to + 2] = blue;
      } else {
        const colorWarp = Math.sin((x / width) * 5 + (y / height) * 4 + angle) * intensity * 0.08;
        const mapped = samplePalette(stops, luma(red, green, blue) * 0.92 + colorWarp + 0.04);
        target.data[to] = mapped[0];
        target.data[to + 1] = mapped[1];
        target.data[to + 2] = mapped[2];
      }
      target.data[to + 3] = 255;
    }
  }
  context.putImageData(target, 0, 0);

  if (settings.outlines) {
    context.save();
    context.globalCompositeOperation = 'multiply';
    context.fillStyle = 'rgba(20, 14, 22, 0.12)';
    for (let y = 0; y < height; y += 5 * k) {
      context.fillRect(0, y + Math.sin(y * 0.03 / k) * 8 * k, width, Math.max(1, k));
    }
    context.restore();
  }
  if (settings.vignette) vignette(context, width, height, 0.2);
  return output;
}

type Leaf = { x: number; y: number; s: number };

/**
 * Geometric cut. Shapes are sized against the long side (so preview = export), take the average colour of
 * the area they cover (a blurred copy), and — with adaptive detail — split into smaller shapes where the photo is busy.
 */
function renderGeometric(
  image: HTMLImageElement,
  width: number,
  height: number,
  s: ArtSettings,
) {
  const output = document.createElement('canvas');
  output.width = width;
  output.height = height;
  const ctx = output.getContext('2d')!;
  const L = Math.max(width, height);
  const cell = L / clamp(s.detail, 6, 260);
  const rand = seededRandom(s.seed);
  const jitter = clamp(s.jitter, 0, 100) / 100;
  const line = (s.lineWeight * L) / 1000;
  const info = PALETTES[s.palette] ?? PALETTES.sunset;
  const stops = getPalette(s.palette);
  const photo = s.colorMode === 'photo';

  const { canvas: srcCanvas, data: sharpImage } = sourceImageData(image, width, height, true);
  const sharp = sharpImage.data;
  const blurCanvas = document.createElement('canvas');
  blurCanvas.width = width;
  blurCanvas.height = height;
  const bctx = blurCanvas.getContext('2d', { willReadFrequently: true })!;
  bctx.drawImage(srcCanvas, 0, 0); // a sharp base under the blur keeps the edges from going transparent
  bctx.filter = `blur(${Math.max(1, cell * 0.28)}px)`;
  bctx.drawImage(srcCanvas, 0, 0);
  const soft = bctx.getImageData(0, 0, width, height).data;

  const at = (d: Uint8ClampedArray, x: number, y: number) => {
    const o = (Math.floor(clamp(y, 0, height - 1)) * width + Math.floor(clamp(x, 0, width - 1))) * 4;
    return [d[o], d[o + 1], d[o + 2]] as RGB;
  };
  const lumAt = (x: number, y: number) => luma(...at(sharp, x, y));
  const colorAt = (x: number, y: number, shift = 0): RGB => {
    const c = at(soft, x, y);
    if (photo) return [c[0] + shift * 255, c[1] + shift * 255, c[2] + shift * 255];
    return samplePalette(stops, luma(...c) + shift);
  };
  const ink: RGB = photo ? [24, 20, 16] : hexToRgb(info.dark);
  const paper: RGB = photo ? [246, 241, 230] : hexToRgb(info.light);
  const lineCss = rgbCss(ink, photo ? 0.32 : 0.45); // soft enough that fine detail does not turn into a grid

  /** Fill a path (and outline it when asked). Tiled patterns sit on `underlay()`, so antialiased seams never show. */
  const paint = (color: RGB, alpha = 1) => {
    ctx.fillStyle = rgbCss(color, alpha);
    ctx.fill();
    if (line > 0) {
      ctx.strokeStyle = lineCss;
      ctx.lineWidth = line;
      ctx.stroke();
    }
  };
  /** The blurred image in the final colours: whatever peeks through between tiles is the right colour already. */
  const underlay = () => {
    const img = ctx.createImageData(width, height);
    for (let i = 0; i < soft.length; i += 4) {
      const c: RGB = photo ? [soft[i], soft[i + 1], soft[i + 2]] : samplePalette(stops, luma(soft[i], soft[i + 1], soft[i + 2]));
      img.data[i] = c[0];
      img.data[i + 1] = c[1];
      img.data[i + 2] = c[2];
      img.data[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
  };
  /** Ink shapes (one combined path, filled once) in a single ink, or with the photo showing through them. */
  const inkThrough = (shape: Path2D) => {
    if (!photo) {
      ctx.fillStyle = rgbCss(ink);
      ctx.fill(shape);
      return;
    }
    const mask = document.createElement('canvas');
    mask.width = width;
    mask.height = height;
    const m = mask.getContext('2d')!;
    m.fill(shape);
    m.globalCompositeOperation = 'source-in';
    m.drawImage(blurCanvas, 0, 0);
    ctx.drawImage(mask, 0, 0);
  };

  /** Quadtree cells: base grid of `cell`, split down to a quarter where the 4×4 brightness spread is high. */
  const leaves = (): Leaf[] => {
    const out: Leaf[] = [];
    const threshold = 0.05 + (1 - s.adaptive / 100) * 0.6;
    const minSize = cell / 4;
    const busy = (x: number, y: number, size: number) => {
      let lo = 1;
      let hi = 0;
      for (let i = 0; i < 4; i += 1)
        for (let j = 0; j < 4; j += 1) {
          const l = lumAt(x + (size * (i + 0.5)) / 4, y + (size * (j + 0.5)) / 4);
          if (l < lo) lo = l;
          if (l > hi) hi = l;
        }
      return hi - lo;
    };
    const visit = (x: number, y: number, size: number) => {
      if (x >= width || y >= height) return;
      if (s.adaptive > 0 && size / 2 >= minSize && busy(x, y, size) > threshold) {
        const h = size / 2;
        visit(x, y, h);
        visit(x + h, y, h);
        visit(x, y + h, h);
        visit(x + h, y + h, h);
      } else out.push({ x, y, s: size });
    };
    for (let y = 0; y < height; y += cell) for (let x = 0; x < width; x += cell) visit(x, y, cell);
    return out;
  };

  const poly = (pts: [number, number][]) => {
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
  };
  const centroid = (pts: [number, number][]) => [pts.reduce((a, p) => a + p[0], 0) / pts.length, pts.reduce((a, p) => a + p[1], 0) / pts.length] as const;

  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.fillStyle = rgbCss(s.pattern === 'halftone' || s.pattern === 'engrave' ? paper : ink);
  ctx.fillRect(0, 0, width, height);
  if (['triangles', 'hexagons', 'diamonds', 'lowpoly'].includes(s.pattern) || (s.pattern === 'blocks' && line <= 0)) underlay();

  switch (s.pattern) {
    case 'triangles': {
      // split each cell along the diagonal whose corners match best, so the cut follows edges in the photo
      for (const c of leaves()) {
        const tl: [number, number] = [c.x, c.y];
        const tr: [number, number] = [c.x + c.s, c.y];
        const bl: [number, number] = [c.x, c.y + c.s];
        const br: [number, number] = [c.x + c.s, c.y + c.s];
        const d1 = Math.abs(lumAt(c.x + 1, c.y + 1) - lumAt(c.x + c.s - 1, c.y + c.s - 1));
        const d2 = Math.abs(lumAt(c.x + c.s - 1, c.y + 1) - lumAt(c.x + 1, c.y + c.s - 1));
        const tris: [number, number][][] = d1 <= d2 ? [[tl, tr, br], [tl, br, bl]] : [[tl, tr, bl], [tr, br, bl]];
        for (const t of tris) {
          poly(t);
          const [cx, cy] = centroid(t);
          paint(colorAt(cx, cy));
        }
      }
      break;
    }
    case 'blocks': {
      const gap = Math.max(line, 0);
      for (const c of leaves()) {
        ctx.beginPath();
        ctx.rect(c.x + gap / 2, c.y + gap / 2, c.s - gap, c.s - gap);
        const color = colorAt(c.x + c.s / 2, c.y + c.s / 2);
        ctx.fillStyle = rgbCss(color);
        ctx.fill();
      }
      break;
    }
    case 'mosaic': {
      // hand-cut tesserae set in grout
      const grout = Math.max(line, L / 1400);
      ctx.fillStyle = rgbCss(photo ? [58, 52, 46] : ink);
      ctx.fillRect(0, 0, width, height);
      for (const c of leaves()) {
        const j = c.s * jitter * 0.18;
        const g = grout / 2;
        const pts: [number, number][] = [
          [c.x + g + (rand() - 0.5) * j, c.y + g + (rand() - 0.5) * j],
          [c.x + c.s - g + (rand() - 0.5) * j, c.y + g + (rand() - 0.5) * j],
          [c.x + c.s - g + (rand() - 0.5) * j, c.y + c.s - g + (rand() - 0.5) * j],
          [c.x + g + (rand() - 0.5) * j, c.y + c.s - g + (rand() - 0.5) * j],
        ];
        poly(pts);
        ctx.fillStyle = rgbCss(colorAt(c.x + c.s / 2, c.y + c.s / 2, (rand() - 0.5) * 0.05 * (1 + jitter)));
        ctx.fill();
      }
      break;
    }
    case 'hexagons': {
      const r = cell * 0.58;
      const w = Math.sqrt(3) * r;
      for (let row = -1, y = 0; y < height + r * 2; row += 1, y = row * r * 1.5) {
        for (let x = row % 2 ? w / 2 : 0; x < width + w; x += w) {
          const pts: [number, number][] = Array.from({ length: 6 }, (_, i) => {
            const a = (Math.PI / 3) * i - Math.PI / 6;
            return [x + Math.cos(a) * r, y + Math.sin(a) * r];
          });
          poly(pts);
          paint(colorAt(x, y));
        }
      }
      break;
    }
    case 'diamonds': {
      const d = cell;
      for (let row = -1; row * (d / 2) < height + d; row += 1) {
        for (let col = -1; col * d < width + d; col += 1) {
          const cx = col * d + (row % 2 ? d / 2 : 0);
          const cy = row * (d / 2);
          poly([[cx, cy - d / 2], [cx + d / 2, cy], [cx, cy + d / 2], [cx - d / 2, cy]]);
          paint(colorAt(cx, cy));
        }
      }
      break;
    }
    case 'lowpoly': {
      // a jittered point grid, each square split along its best-matching diagonal
      const cols = Math.ceil(width / cell) + 1;
      const rows = Math.ceil(height / cell) + 1;
      const pts: [number, number][] = [];
      for (let j = 0; j < rows; j += 1)
        for (let i = 0; i < cols; i += 1) {
          const edgeX = i === 0 || i === cols - 1;
          const edgeY = j === 0 || j === rows - 1;
          const x = Math.min(width, i * cell) + (edgeX ? 0 : (rand() - 0.5) * cell * jitter * 0.8);
          const y = Math.min(height, j * cell) + (edgeY ? 0 : (rand() - 0.5) * cell * jitter * 0.8);
          pts.push([x, y]);
        }
      const P = (i: number, j: number) => pts[j * cols + i];
      for (let j = 0; j < rows - 1; j += 1)
        for (let i = 0; i < cols - 1; i += 1) {
          const a = P(i, j);
          const b = P(i + 1, j);
          const c = P(i + 1, j + 1);
          const d = P(i, j + 1);
          const tris = Math.abs(lumAt(...a) - lumAt(...c)) <= Math.abs(lumAt(...b) - lumAt(...d)) ? [[a, b, c], [a, c, d]] : [[a, b, d], [b, c, d]];
          for (const t of tris) {
            poly(t);
            const [cx, cy] = centroid(t);
            // light falls from the top-left, so facets read as folded paper
            const nx = (t[1][1] - t[0][1]) * (t[2][0] - t[0][0]) - (t[1][0] - t[0][0]) * (t[2][1] - t[0][1]);
            paint(colorAt(cx, cy, Math.sign(nx) * 0.025 * jitter));
          }
        }
      break;
    }
    case 'glass': {
      // stained glass: Voronoi cells around adaptive seeds, each the true average colour of its pixels, with lead lines
      const seeds = leaves().map((c) => [
        c.x + c.s / 2 + (rand() - 0.5) * c.s * jitter * 0.9,
        c.y + c.s / 2 + (rand() - 0.5) * c.s * jitter * 0.9,
      ]);
      const gw = Math.ceil(width / cell);
      const gh = Math.ceil(height / cell);
      const buckets: number[][] = Array.from({ length: gw * gh }, () => []);
      seeds.forEach(([x, y], i) => {
        const bx = clamp(Math.floor(x / cell), 0, gw - 1);
        const by = clamp(Math.floor(y / cell), 0, gh - 1);
        buckets[by * gw + bx].push(i);
      });
      const label = new Int32Array(width * height);
      const sum = new Float64Array(seeds.length * 4);
      for (let y = 0; y < height; y += 1) {
        const by = Math.floor(y / cell);
        for (let x = 0; x < width; x += 1) {
          const bx = Math.floor(x / cell);
          let best = 0;
          let bestD = Infinity;
          for (let oy = -1; oy <= 1; oy += 1) {
            const yy = by + oy;
            if (yy < 0 || yy >= gh) continue;
            for (let ox = -1; ox <= 1; ox += 1) {
              const xx = bx + ox;
              if (xx < 0 || xx >= gw) continue;
              for (const i of buckets[yy * gw + xx]) {
                const dx = seeds[i][0] - x;
                const dy = seeds[i][1] - y;
                const d = dx * dx + dy * dy;
                if (d < bestD) {
                  bestD = d;
                  best = i;
                }
              }
            }
          }
          const p = y * width + x;
          label[p] = best;
          const o = p * 4;
          sum[best * 4] += sharp[o];
          sum[best * 4 + 1] += sharp[o + 1];
          sum[best * 4 + 2] += sharp[o + 2];
          sum[best * 4 + 3] += 1;
        }
      }
      const fills = seeds.map((_, i) => {
        const n = Math.max(1, sum[i * 4 + 3]);
        const avg: RGB = [sum[i * 4] / n, sum[i * 4 + 1] / n, sum[i * 4 + 2] / n];
        return photo ? avg : samplePalette(stops, luma(...avg));
      });
      const img = ctx.createImageData(width, height);
      // lead is always at least a pixel or two when on, or a thin setting would vanish when rounded
      const lead = line > 0 ? Math.max(1, Math.round(line * 1.5 + L / 1100)) : 0;
      const leadRgb: RGB = [26, 23, 20];
      for (let y = 0; y < height; y += 1)
        for (let x = 0; x < width; x += 1) {
          const p = y * width + x;
          const id = label[p];
          const edge =
            lead > 0 &&
            ((x + lead < width && label[p + lead] !== id) ||
              (y + lead < height && label[p + lead * width] !== id) ||
              (x - lead >= 0 && label[p - lead] !== id) ||
              (y - lead >= 0 && label[p - lead * width] !== id));
          const c = edge ? leadRgb : fills[id];
          img.data[p * 4] = c[0];
          img.data[p * 4 + 1] = c[1];
          img.data[p * 4 + 2] = c[2];
          img.data[p * 4 + 3] = 255;
        }
      ctx.putImageData(img, 0, 0);
      // light through glass: a soft glow from the top
      const glow = ctx.createLinearGradient(0, 0, 0, height);
      glow.addColorStop(0, 'rgba(255,250,235,0.12)');
      glow.addColorStop(1, 'rgba(0,0,0,0.08)');
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, width, height);
      break;
    }
    case 'orbs': {
      for (const c of leaves()) {
        const cx = c.x + c.s / 2 + (rand() - 0.5) * c.s * jitter * 0.5;
        const cy = c.y + c.s / 2 + (rand() - 0.5) * c.s * jitter * 0.5;
        const l = lumAt(cx, cy);
        const r = (c.s / 2) * (0.55 + l * 0.5);
        const color = colorAt(cx, cy);
        const g = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.35, r * 0.1, cx, cy, r);
        g.addColorStop(0, rgbCss([color[0] + 40, color[1] + 40, color[2] + 40]));
        g.addColorStop(1, rgbCss(color));
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fillStyle = g;
        ctx.fill();
        if (line > 0) {
          ctx.strokeStyle = 'rgba(246, 238, 218, 0.28)';
          ctx.lineWidth = line * 0.6;
          ctx.stroke();
        }
      }
      break;
    }
    case 'halftone': {
      // classic 45° screen: darker areas, bigger dots
      const d = cell * 0.7;
      const angle = Math.PI / 4;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const reach = Math.hypot(width, height);
      const dots = new Path2D();
      for (let v = -reach; v < reach; v += d)
        for (let u = -reach; u < reach; u += d) {
          const x = width / 2 + u * cos - v * sin;
          const y = height / 2 + u * sin + v * cos;
          if (x < -d || y < -d || x > width + d || y > height + d) continue;
          const dark = 1 - luma(...at(soft, x, y));
          const r = (d / 2) * Math.sqrt(dark) * 1.25;
          if (r < 0.3) continue;
          dots.moveTo(x + r, y);
          dots.arc(x, y, r, 0, Math.PI * 2);
        }
      inkThrough(dots);
      break;
    }
    case 'engrave': {
      // banknote engraving: wavy lines that swell in the shadows
      const d = cell * 0.5;
      const step = Math.max(1, d / 3, L / 700);
      const lines = new Path2D();
      for (let y0 = d / 2; y0 < height + d; y0 += d) {
        const top: [number, number][] = [];
        const bottom: [number, number][] = [];
        for (let x = 0; x <= width + step; x += step) {
          const y = y0 + Math.sin(x / (cell * 1.6) + y0 / (cell * 2.3)) * d * 0.35 * jitter;
          const t = d * 0.92 * Math.pow(1 - luma(...at(soft, x, y)), 0.85);
          top.push([x, y - t / 2]);
          bottom.push([x, y + t / 2]);
        }
        top.forEach(([x, y], i) => (i ? lines.lineTo(x, y) : lines.moveTo(x, y)));
        for (let i = bottom.length - 1; i >= 0; i -= 1) lines.lineTo(bottom[i][0], bottom[i][1]);
        lines.closePath();
      }
      inkThrough(lines);
      break;
    }
  }

  if (s.vignette) vignette(ctx, width, height, s.pattern === 'halftone' || s.pattern === 'engrave' ? 0.12 : 0.25);
  return output;
}

export function renderAnimatedFrame(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  width: number,
  height: number,
  settings: ArtSettings,
  time: number,
) {
  const paletteInfo = PALETTES[settings.palette];
  const stops = getPalette(settings.palette);
  const intensity = settings.animIntensity / 100;
  const speed = settings.animSpeed;
  context.clearRect(0, 0, width, height);
  context.fillStyle = paletteInfo.dark;
  context.fillRect(0, 0, width, height);

  const zoom = 1.04 + Math.sin(time * speed * 0.7) * 0.018;
  const panX = Math.sin(time * speed * 0.53) * width * 0.012;
  const panY = Math.cos(time * speed * 0.4) * height * 0.009;
  context.save();
  context.beginPath();
  context.rect(0, 0, width, height);
  context.clip();
  drawCover(
    context,
    image,
    image.naturalWidth || image.width,
    image.naturalHeight || image.height,
    width,
    height,
    zoom,
    panX,
    panY,
  );

  if (settings.animMode === 'vhs') {
    const shift = Math.sin(time * speed * 2.1) * 2 + 2;
    context.save();
    context.globalCompositeOperation = 'screen';
    context.globalAlpha = 0.15;
    context.filter = 'hue-rotate(24deg) saturate(2.2)';
    context.translate(shift, 0);
    drawCover(
      context,
      image,
      image.naturalWidth || image.width,
      image.naturalHeight || image.height,
      width,
      height,
      zoom,
      panX,
      panY,
    );
    context.filter = 'none';
    context.restore();
  }

  if (settings.animMode === 'pulse') {
    const pulse = 0.5 + Math.sin(time * speed * 1.8) * 0.5;
    const gradient = context.createLinearGradient(0, 0, width, height);
    const accent = samplePalette(stops, 0.62 + pulse * 0.2);
    gradient.addColorStop(0, `rgba(${accent[0]}, ${accent[1]}, ${accent[2]}, ${0.12 + pulse * 0.14 * intensity})`);
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
    context.save();
    context.globalCompositeOperation = 'soft-light';
    context.fillStyle = gradient;
    context.fillRect(0, 0, width, height);
    context.restore();
  }

  const leak = context.createLinearGradient(0, 0, width, height);
  const leakAlpha = (0.05 + Math.sin(time * speed * 0.9) * 0.04) * intensity;
  leak.addColorStop(0, `rgba(255, 170, 80, ${leakAlpha})`);
  leak.addColorStop(0.4, `rgba(255, 93, 65, ${leakAlpha * 0.3})`);
  leak.addColorStop(1, 'rgba(0,0,0,0)');
  context.save();
  context.globalCompositeOperation = 'screen';
  context.fillStyle = leak;
  context.fillRect(0, 0, width, height);
  context.restore();

  if (settings.animMode === 'vhs') {
    const bandY = ((time * 0.18) % 1.35 - 0.15) * height;
    const band = context.createLinearGradient(0, bandY - height * 0.08, 0, bandY + height * 0.08);
    band.addColorStop(0, 'rgba(255,255,255,0)');
    band.addColorStop(0.5, `rgba(246, 238, 218, ${0.16 * intensity})`);
    band.addColorStop(1, 'rgba(255,255,255,0)');
    context.fillStyle = band;
    context.fillRect(0, bandY - height * 0.08, width, height * 0.16);
    context.fillStyle = `rgba(8, 8, 10, ${0.35 * intensity})`;
    for (let y = 0; y < height; y += 4) {
      context.fillRect(0, y, width, 1);
    }
  }

  const scan = 0.05 * intensity;
  context.fillStyle = `rgba(10, 12, 10, ${scan})`;
  for (let y = 0; y < height; y += 3) {
    context.fillRect(0, y, width, 1);
  }

  const noise = document.createElement('canvas');
  noise.width = 160;
  noise.height = 160;
  const noiseContext = noise.getContext('2d')!;
  const noiseData = noiseContext.createImageData(160, 160);
  const seed = Math.floor(time * 10) * 7;
  for (let i = 0; i < noiseData.data.length; i += 4) {
    const value = 70 + Math.floor(((Math.sin(i + seed) + 1) / 2) * 140);
    noiseData.data[i] = value;
    noiseData.data[i + 1] = value;
    noiseData.data[i + 2] = value;
    noiseData.data[i + 3] = 255;
  }
  noiseContext.putImageData(noiseData, 0, 0);
  const pattern = context.createPattern(noise, 'repeat');
  if (pattern) {
    context.save();
    context.globalCompositeOperation = 'overlay';
    context.globalAlpha = 0.14 * (0.5 + intensity);
    context.fillStyle = pattern;
    context.fillRect(0, 0, width, height);
    context.restore();
  }

  const vignette = context.createRadialGradient(
    width / 2,
    height / 2,
    Math.min(width, height) * 0.25,
    width / 2,
    height / 2,
    Math.max(width, height) * 0.75,
  );
  vignette.addColorStop(0, 'rgba(0,0,0,0)');
  vignette.addColorStop(1, `rgba(0,0,0,${0.35 + intensity * 0.1})`);
  context.fillStyle = vignette;
  context.fillRect(0, 0, width, height);
  context.restore();

  const frame = context.createLinearGradient(0, 0, 0, height);
  frame.addColorStop(0, 'rgba(255, 244, 222, 0.06)');
  frame.addColorStop(0.5, 'rgba(0,0,0,0)');
  frame.addColorStop(1, 'rgba(10, 8, 5, 0.16)');
  context.fillStyle = frame;
  context.fillRect(0, 0, width, height);
}

export function renderArtStill(
  image: HTMLImageElement,
  style: Exclude<ArtStyle, 'animated'>,
  settings: ArtSettings,
  longSide = 1400,
) {
  const sourceWidth = image.naturalWidth || image.width;
  const sourceHeight = image.naturalHeight || image.height;
  const aspect = sourceWidth / sourceHeight;
  const width = aspect >= 1 ? longSide : Math.round(longSide * aspect);
  const height = aspect >= 1 ? Math.round(longSide / aspect) : longSide;

  if (style === 'pixel') return renderPixel(image, width, height, settings);
  if (style === 'abstract') return renderAbstract(image, width, height, settings);
  return renderGeometric(image, width, height, settings);
}

export function renderAnimationStill(
  image: HTMLImageElement,
  settings: ArtSettings,
  longSide = 1400,
) {
  const sourceWidth = image.naturalWidth || image.width;
  const sourceHeight = image.naturalHeight || image.height;
  const aspect = sourceWidth / sourceHeight;
  const width = aspect >= 1 ? longSide : Math.round(longSide * aspect);
  const height = aspect >= 1 ? Math.round(longSide / aspect) : longSide;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d')!;
  renderAnimatedFrame(context, image, width, height, settings, 1.2);
  return canvas;
}

export async function encodeAnimation(
  image: HTMLImageElement,
  settings: ArtSettings,
  onProgress?: (progress: number) => void,
) {
  const sourceWidth = image.naturalWidth || image.width;
  const sourceHeight = image.naturalHeight || image.height;
  const aspect = sourceWidth / sourceHeight;
  const longSide = 520;
  const width = aspect >= 1 ? longSide : Math.round(longSide * aspect);
  const height = aspect >= 1 ? Math.round(longSide / aspect) : longSide;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: true })!;
  const gif = GIFEncoder();
  const frameCount = 18;

  for (let frame = 0; frame < frameCount; frame += 1) {
    const time = (frame / frameCount) * 5.4;
    renderAnimatedFrame(context, image, width, height, settings, time);
    const imageData = context.getImageData(0, 0, width, height).data;
    const palette = quantize(imageData, 128, { format: 'rgb444' });
    const indexed = applyPalette(imageData, palette, 'rgb444');
    gif.writeFrame(indexed, width, height, {
      palette,
      delay: 90,
      repeat: 0,
    });
    onProgress?.((frame + 1) / frameCount);
    await new Promise((resolve) => window.setTimeout(resolve, 0));
  }

  gif.finish();
  return new Blob([gif.bytes()], { type: 'image/gif' });
}
