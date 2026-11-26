// Greeting cards: templates, borders and stickers drawn on canvas, and the print-ready PDF.
import { buildPdf, type PdfPage } from './pdf';
import { canvasToBlob } from './utils';
import { printScale } from './printProjects';

export type CardSize = 'a5' | 'a6';
export type CardTemplate = 'fold' | 'split' | 'postcard' | 'ornate' | 'photo';
export type CardFace = 'front' | 'inside' | 'back';
export type CardBorder = 'none' | 'line' | 'double' | 'doodle' | 'floral' | 'deco' | 'scallop' | 'confetti' | 'washi' | 'stamp';
export type CardFont = 'script' | 'serif' | 'sans' | 'type' | 'hand';
export type Sticker = { id: string; face: CardFace; kind: 'emoji' | 'deco' | 'image'; value: string; x: number; y: number; size: number; rot: number };
export type Card = {
  template: CardTemplate;
  size: CardSize;
  heading: string;
  message: string;
  signoff: string;
  font: CardFont;
  ink: string | null; // null = suits the paper
  paper: string;
  border: CardBorder;
  borderInk: string;
  stickers: Sticker[];
  /** Where the photo sits in its slot: pan -1..1 each way, zoom 1..3. */
  photoPan: { x: number; y: number; zoom: number };
};
/** Everything a face needs that has to be loaded first. */
export type CardAssets = { photo: HTMLImageElement | null; stickers: Map<string, HTMLImageElement> };

const MM = 1 / 25.4;
/** Finished card (one panel) in inches, portrait. */
export const CARD_SIZES: Record<CardSize, { label: string; w: number; h: number }> = {
  a5: { label: 'A5 · 148 × 210 mm', w: 148 * MM, h: 210 * MM },
  a6: { label: 'A6 · 105 × 148 mm', w: 105 * MM, h: 148 * MM },
};

export const TEMPLATES: { id: CardTemplate; label: string; note: string; faces: CardFace[]; defaults: Partial<Card> }[] = [
  { id: 'split', label: 'Photo + words', note: 'Photo on one half, heading and message on the other', faces: ['front'], defaults: { heading: 'Happy Birthday', message: 'Wishing you a beautiful year ahead.', signoff: 'With love ♡', font: 'serif', border: 'none', paper: '#fbf8f1' } },
  { id: 'fold', label: 'Folded card', note: 'Photo on the front, your message inside', faces: ['front', 'inside', 'back'], defaults: { heading: 'Thinking of you', message: 'Every photo of us is my favourite.', signoff: 'Always yours', font: 'script', border: 'line', paper: '#fbf8f1' } },
  { id: 'ornate', label: 'Ornate', note: 'Words in an ornamental frame, flowers round the edge', faces: ['front'], defaults: { heading: 'Happy Anniversary, My Love.', message: 'To many more years of blooming together.', signoff: '', font: 'script', border: 'floral', paper: '#f3e7d2' } },
  { id: 'postcard', label: 'Postcard', note: '“Greetings from” on the front, stamp and message on the back', faces: ['front', 'back'], defaults: { heading: 'Florence', message: 'Dear love,\nThe light here is golden and every street smells of coffee. Wish you were here!', signoff: 'Sincerely, me', font: 'hand', border: 'none', paper: '#fdfbf6' } },
  { id: 'photo', label: 'Full photo', note: 'Your photo edge to edge, words across the bottom', faces: ['front'], defaults: { heading: 'Merry & Bright', message: 'Love from all of us', signoff: '', font: 'script', border: 'none', paper: '#ffffff' } },
];

export const BORDERS: { id: CardBorder; label: string }[] = [
  { id: 'none', label: 'None' },
  { id: 'line', label: 'Line' },
  { id: 'double', label: 'Double' },
  { id: 'doodle', label: 'Doodle' },
  { id: 'floral', label: 'Floral' },
  { id: 'deco', label: 'Art deco' },
  { id: 'scallop', label: 'Scallop' },
  { id: 'confetti', label: 'Confetti' },
  { id: 'washi', label: 'Washi tape' },
  { id: 'stamp', label: 'Postage stamp' },
];
export const PAPERS = ['#fbf8f1', '#ffffff', '#f3e7d2', '#c9a77c', '#f6dfe0', '#dde7d8', '#dfe6f0', '#1f2a3d', '#1d1b19'];
export const INKS = ['#3a2f2a', '#8a4b4b', '#4e6447', '#2c3e66', '#9a7a3a', '#ffffff'];
export const FONTS: { id: CardFont; label: string; css: string }[] = [
  { id: 'script', label: 'Script', css: '"Great Vibes", "Segoe Script", cursive' },
  { id: 'serif', label: 'Serif', css: '"Instrument Serif", Georgia, serif' },
  { id: 'sans', label: 'Sans', css: '"Space Grotesk Variable", system-ui, sans-serif' },
  { id: 'type', label: 'Typewriter', css: '"DM Mono", ui-monospace, monospace' },
  { id: 'hand', label: 'Handwritten', css: '"Segoe Print", "Bradley Hand", "Comic Sans MS", cursive' },
];
export const EMOJIS = ['❤️', '💕', '🌸', '🌹', '🌻', '🍀', '🦋', '⭐', '✨', '🎉', '🎂', '🎈', '🎁', '🥂', '💍', '🕊️', '☀️', '🌙', '❄️', '🎄', '🕯️', '🍂', '🏖️', '✈️', '📷', '💌', '🥰', '😊', '👶', '🎓', '🏡', '🐶', '🐱', '🍰', '🎵', '🌈'];

const fontCss = (f: CardFont) => FONTS.find((x) => x.id === f)!.css;
const isDark = (hex: string) => {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  return Boolean(m) && 0.299 * parseInt(m![1], 16) + 0.587 * parseInt(m![2], 16) + 0.114 * parseInt(m![3], 16) < 110;
};
export const inkFor = (card: Card) => card.ink ?? (isDark(card.paper) ? '#f6efe2' : '#3a2f2a');
const seeded = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

/** Wrap and shrink text until it fits the box; returns the size used. */
function fitText(ctx: CanvasRenderingContext2D, text: string, css: string, box: { x: number; y: number; w: number; h: number }, maxPx: number, lineH = 1.25, weight = '') {
  let px = maxPx;
  let lines: string[] = [];
  for (; px > 6; px *= 0.92) {
    ctx.font = `${weight}${px}px ${css}`;
    lines = [];
    for (const para of text.split('\n')) {
      let line = '';
      for (const word of para.split(/\s+/).filter(Boolean)) {
        const next = line ? `${line} ${word}` : word;
        if (ctx.measureText(next).width > box.w && line) {
          lines.push(line);
          line = word;
        } else line = next;
      }
      lines.push(line);
    }
    if (lines.length * px * lineH <= box.h && lines.every((l) => ctx.measureText(l).width <= box.w)) break;
  }
  const top = box.y + (box.h - lines.length * px * lineH) / 2 + (px * lineH) / 2;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  lines.forEach((l, i) => ctx.fillText(l, box.x + box.w / 2, top + i * px * lineH));
  return { px, height: lines.length * px * lineH };
}

export function cover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number, r = 0, pan = { x: 0, y: 0, zoom: 1 }) {
  const k = Math.max(w / img.naturalWidth, h / img.naturalHeight) * Math.min(3, Math.max(1, pan.zoom));
  const iw = img.naturalWidth * k;
  const ih = img.naturalHeight * k;
  // pan -1 shows the photo's left/top edge, +1 its right/bottom edge
  const px = Math.max(-1, Math.min(1, pan.x));
  const py = Math.max(-1, Math.min(1, pan.y));
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.clip();
  ctx.drawImage(img, x + (w - iw) / 2 - (px * (iw - w)) / 2, y + (h - ih) / 2 - (py * (ih - h)) / 2, iw, ih);
  ctx.restore();
}
function placeholder(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, u: number) {
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.06)';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.font = `${u * 4}px "Space Grotesk Variable", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('Choose a photo', x + w / 2, y + h / 2);
  ctx.restore();
}

/* ── paper and borders ─────────────────────────────────────────────────────────────────────── */
function paperFill(ctx: CanvasRenderingContext2D, W: number, H: number, card: Card) {
  ctx.fillStyle = card.paper;
  ctx.fillRect(0, 0, W, H);
  if (card.paper === '#f3e7d2' || card.paper === '#c9a77c') {
    // aged paper: a soft vignette and fibres
    const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.75);
    g.addColorStop(0, 'rgba(255,250,235,0)');
    g.addColorStop(1, 'rgba(150,110,60,0.28)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    const rand = seeded(3);
    for (let i = 0; i < 900; i += 1) {
      ctx.fillStyle = `rgba(120,90,50,${rand() * 0.06})`;
      ctx.fillRect(rand() * W, rand() * H, 1.5, 1.5);
    }
  }
}

function leaf(ctx: CanvasRenderingContext2D, x: number, y: number, len: number, ang: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(ang);
  ctx.fillStyle = '#8a9a6e';
  ctx.strokeStyle = '#5c6b48';
  ctx.lineWidth = Math.max(1, len * 0.05);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(len * 0.5, -len * 0.32, len, 0);
  ctx.quadraticCurveTo(len * 0.5, len * 0.32, 0, 0);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(len * 0.9, 0);
  ctx.stroke();
  ctx.restore();
}
function rose(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, tone: string, rand: () => number) {
  const dark = tone === 'rose' ? '#9a5656' : '#a8926a';
  const mid = tone === 'rose' ? '#c98a84' : '#e3d3b0';
  const light = tone === 'rose' ? '#e2b2aa' : '#f3e9d2';
  ctx.save();
  ctx.translate(x, y);
  ctx.lineWidth = Math.max(1, r * 0.04);
  for (let ring = 3; ring >= 0; ring -= 1) {
    const rr = r * (0.35 + ring * 0.22);
    const petals = 5 + ring;
    for (let p = 0; p < petals; p += 1) {
      const a = (p / petals) * Math.PI * 2 + ring * 0.6 + rand() * 0.3;
      ctx.fillStyle = ring % 2 ? mid : light;
      ctx.strokeStyle = dark;
      ctx.beginPath();
      ctx.ellipse(Math.cos(a) * rr * 0.55, Math.sin(a) * rr * 0.55, rr * 0.55, rr * 0.38, a, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }
  ctx.fillStyle = dark;
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.14, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
/** Inset (in px) the content keeps from the edge for this border. */
export const borderInset = (b: CardBorder, u: number) => (b === 'none' ? 6 * u : b === 'floral' ? 24 * u : b === 'washi' || b === 'confetti' ? 10 * u : 9 * u);

function drawBorder(ctx: CanvasRenderingContext2D, W: number, H: number, card: Card, seed: number) {
  const u = W / 100;
  const ink = card.borderInk;
  const rand = seeded(seed);
  const m = 4.5 * u;
  ctx.save();
  ctx.strokeStyle = ink;
  ctx.fillStyle = ink;
  switch (card.border) {
    case 'line':
      ctx.lineWidth = u * 0.45;
      ctx.strokeRect(m, m, W - m * 2, H - m * 2);
      break;
    case 'double':
      ctx.lineWidth = u * 0.6;
      ctx.strokeRect(m, m, W - m * 2, H - m * 2);
      ctx.lineWidth = u * 0.25;
      ctx.strokeRect(m + 1.6 * u, m + 1.6 * u, W - m * 2 - 3.2 * u, H - m * 2 - 3.2 * u);
      break;
    case 'doodle': {
      // a hand-drawn wobbly frame, gone over twice, with little hearts, stars and dots along it
      ctx.lineWidth = u * 0.45;
      ctx.lineCap = 'round';
      for (let pass = 0; pass < 2; pass += 1) {
        ctx.beginPath();
        const pts: [number, number][] = [];
        const step = 3 * u;
        for (let x = m; x <= W - m; x += step) pts.push([x, m]);
        for (let y = m; y <= H - m; y += step) pts.push([W - m, y]);
        for (let x = W - m; x >= m; x -= step) pts.push([x, H - m]);
        for (let y = H - m; y >= m; y -= step) pts.push([m, y]);
        pts.forEach(([x, y], i) => (i ? ctx.lineTo : ctx.moveTo).call(ctx, x + (rand() - 0.5) * u * 0.9, y + (rand() - 0.5) * u * 0.9));
        ctx.closePath();
        ctx.stroke();
      }
      const motif = (x: number, y: number, k: number) => {
        const s = u * (1.2 + rand() * 0.6);
        ctx.save();
        ctx.translate(x, y);
        if (k === 0) {
          ctx.beginPath();
          ctx.moveTo(0, s * 0.35);
          ctx.bezierCurveTo(-s, -s * 0.4, -s * 0.35, -s * 1.1, 0, -s * 0.45);
          ctx.bezierCurveTo(s * 0.35, -s * 1.1, s, -s * 0.4, 0, s * 0.35);
          ctx.fill();
        } else if (k === 1) {
          ctx.beginPath();
          for (let i = 0; i < 10; i += 1) {
            const r = i % 2 ? s * 0.4 : s;
            const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
            ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
          }
          ctx.closePath();
          ctx.fill();
        } else {
          ctx.beginPath();
          ctx.arc(0, 0, s * 0.35, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      };
      for (let t = 0; t < 1; t += 0.085) {
        motif(m + t * (W - m * 2), m + 3 * u, Math.floor(rand() * 3));
        motif(m + t * (W - m * 2), H - m - 3 * u, Math.floor(rand() * 3));
      }
      break;
    }
    case 'floral': {
      // engraved-style roses, buds and leaves climbing from every corner
      ctx.lineWidth = u * 0.3;
      ctx.strokeStyle = '#6f5a46';
      ctx.strokeRect(m * 0.6, m * 0.6, W - m * 1.2, H - m * 1.2);
      const corner = (cx: number, cy: number, sx: number, sy: number, i: number) => {
        ctx.strokeStyle = '#6b7a52';
        ctx.lineWidth = u * 0.5;
        for (let v = 0; v < 2; v += 1) {
          ctx.beginPath();
          ctx.moveTo(cx, cy);
          const ex = cx + sx * (v ? 12 : 44) * u;
          const ey = cy + sy * (v ? 48 : 10) * u;
          ctx.quadraticCurveTo(cx + sx * 16 * u, cy + sy * 16 * u, ex, ey);
          ctx.stroke();
          for (let t = 0.2; t < 1; t += 0.18) {
            const lx = cx + (ex - cx) * t + sx * (rand() - 0.3) * 3 * u;
            const ly = cy + (ey - cy) * t + sy * (rand() - 0.3) * 3 * u;
            leaf(ctx, lx, ly, (5 + rand() * 4) * u, Math.atan2(sy, sx) + (rand() - 0.5) * 2.4);
          }
        }
        rose(ctx, cx + sx * 11 * u, cy + sy * 11 * u, 10 * u, i % 2 ? 'cream' : 'rose', rand);
        rose(ctx, cx + sx * 5 * u, cy + sy * 27 * u, 6 * u, i % 2 ? 'rose' : 'cream', rand);
        rose(ctx, cx + sx * 27 * u, cy + sy * 5 * u, 5 * u, 'rose', rand);
        rose(ctx, cx + sx * 3 * u, cy + sy * 40 * u, 3.4 * u, 'cream', rand);
      };
      corner(m, m, 1, 1, 0);
      corner(W - m, m, -1, 1, 1);
      corner(m, H - m, 1, -1, 1);
      corner(W - m, H - m, -1, -1, 0);
      break;
    }
    case 'deco': {
      ctx.lineWidth = u * 0.35;
      ctx.strokeRect(m, m, W - m * 2, H - m * 2);
      ctx.strokeRect(m + 1.3 * u, m + 1.3 * u, W - m * 2 - 2.6 * u, H - m * 2 - 2.6 * u);
      const fan = (cx: number, cy: number, a0: number) => {
        for (let r = 3; r <= 12; r += 3) {
          ctx.beginPath();
          ctx.arc(cx, cy, r * u, a0, a0 + Math.PI / 2);
          ctx.stroke();
        }
        for (let k = 0; k <= 6; k += 1) {
          const a = a0 + (k / 6) * (Math.PI / 2);
          ctx.beginPath();
          ctx.moveTo(cx, cy);
          ctx.lineTo(cx + Math.cos(a) * 12 * u, cy + Math.sin(a) * 12 * u);
          ctx.stroke();
        }
      };
      fan(m, m, 0);
      fan(W - m, m, Math.PI / 2);
      fan(W - m, H - m, Math.PI);
      fan(m, H - m, -Math.PI / 2);
      for (const [x, y] of [[W / 2, m], [W / 2, H - m], [m, H / 2], [W - m, H / 2]]) {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(Math.PI / 4);
        ctx.fillRect(-1.3 * u, -1.3 * u, 2.6 * u, 2.6 * u);
        ctx.restore();
      }
      break;
    }
    case 'scallop': {
      ctx.lineWidth = u * 0.45;
      const r = 1.8 * u;
      const x0 = m;
      const y0 = m;
      const w = W - m * 2;
      const h = H - m * 2;
      const side = (ax: number, ay: number, bx: number, by: number) => {
        const len = Math.hypot(bx - ax, by - ay);
        const n = Math.max(2, Math.round(len / (r * 2)));
        const ang = Math.atan2(by - ay, bx - ax);
        for (let i = 0; i < n; i += 1) ctx.arc(ax + ((bx - ax) * (i + 0.5)) / n, ay + ((by - ay) * (i + 0.5)) / n, len / n / 2, ang + Math.PI, ang, false);
      };
      ctx.beginPath();
      side(x0, y0, x0 + w, y0);
      side(x0 + w, y0, x0 + w, y0 + h);
      side(x0 + w, y0 + h, x0, y0 + h);
      side(x0, y0 + h, x0, y0);
      ctx.closePath();
      ctx.stroke();
      break;
    }
    case 'confetti': {
      const colours = ['#f2a7b8', '#f7d06b', '#8fc6e8', '#a8d5a2', '#c7a6e8', '#f49b6e'];
      for (let i = 0; i < 160; i += 1) {
        const edge = Math.floor(rand() * 4);
        const t = rand();
        const d = rand() * 8 * u;
        const x = edge === 0 ? t * W : edge === 1 ? W - d : edge === 2 ? t * W : d;
        const y = edge === 0 ? d : edge === 1 ? t * H : edge === 2 ? H - d : t * H;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(rand() * Math.PI);
        ctx.fillStyle = colours[i % colours.length];
        if (i % 3) ctx.fillRect(-u * 0.7, -u * 0.3, u * 1.4, u * 0.6);
        else {
          ctx.beginPath();
          ctx.arc(0, 0, u * 0.6, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }
      break;
    }
    case 'washi': {
      const tape = (x: number, y: number, a: number, base: string, stripe: string) => {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(a);
        ctx.globalAlpha = 0.85;
        ctx.fillStyle = base;
        ctx.fillRect(-11 * u, -3 * u, 22 * u, 6 * u);
        ctx.fillStyle = stripe;
        for (let s = -11; s < 11; s += 2.5) ctx.fillRect(s * u, -3 * u, u, 6 * u);
        ctx.restore();
      };
      tape(7 * u, 6 * u, -0.7, '#f4b6c2', 'rgba(255,255,255,0.55)');
      tape(W - 7 * u, 6 * u, 0.7, '#a9d8c8', 'rgba(255,255,255,0.55)');
      tape(7 * u, H - 6 * u, 0.7, '#f7d98a', 'rgba(255,255,255,0.5)');
      tape(W - 7 * u, H - 6 * u, -0.7, '#c7b8ea', 'rgba(255,255,255,0.5)');
      break;
    }
    case 'stamp': {
      // perforated edge, like a postage stamp: bites taken out of a coloured surround
      const r = 1.3 * u;
      ctx.fillStyle = 'rgba(0,0,0,0.12)';
      for (let x = r; x < W; x += r * 2.6) {
        ctx.beginPath();
        ctx.arc(x, 0, r, 0, Math.PI * 2);
        ctx.arc(x, H, r, 0, Math.PI * 2);
        ctx.fill();
      }
      for (let y = r; y < H; y += r * 2.6) {
        ctx.beginPath();
        ctx.arc(0, y, r, 0, Math.PI * 2);
        ctx.arc(W, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.lineWidth = u * 0.35;
      ctx.strokeRect(m + u, m + u, W - m * 2 - 2 * u, H - m * 2 - 2 * u);
      break;
    }
  }
  ctx.restore();
}

/** The ornamental cartouche round the words in the Ornate template. */
function cartouche(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, ink: string, u: number) {
  const c = 5 * u;
  const path = (d: number) => {
    ctx.beginPath();
    ctx.moveTo(x + c + d, y + d);
    ctx.lineTo(x + w - c - d, y + d);
    ctx.arc(x + w - d, y + d, c, Math.PI, Math.PI / 2, true);
    ctx.lineTo(x + w - d, y + h - c - d);
    ctx.arc(x + w - d, y + h - d, c, -Math.PI / 2, Math.PI, true);
    ctx.lineTo(x + c + d, y + h - d);
    ctx.arc(x + d, y + h - d, c, 0, -Math.PI / 2, true);
    ctx.lineTo(x + d, y + c + d);
    ctx.arc(x + d, y + d, c, Math.PI / 2, 0, true);
    ctx.closePath();
  };
  ctx.save();
  ctx.fillStyle = 'rgba(255,252,244,0.75)';
  path(0);
  ctx.fill();
  ctx.strokeStyle = ink;
  ctx.globalAlpha = 0.75;
  ctx.lineWidth = u * 0.5;
  path(0);
  ctx.stroke();
  ctx.lineWidth = u * 0.22;
  path(1.4 * u);
  ctx.stroke();
  // small flourishes at top and bottom centre
  for (const [cy, s] of [[y, 1], [y + h, -1]] as const) {
    ctx.beginPath();
    ctx.moveTo(x + w / 2 - 8 * u, cy);
    ctx.bezierCurveTo(x + w / 2 - 4 * u, cy - s * 4 * u, x + w / 2 - 1 * u, cy - s * 1 * u, x + w / 2, cy - s * 3.2 * u);
    ctx.bezierCurveTo(x + w / 2 + 1 * u, cy - s * 1 * u, x + w / 2 + 4 * u, cy - s * 4 * u, x + w / 2 + 8 * u, cy);
    ctx.stroke();
  }
  ctx.restore();
}

/* ── the faces ──────────────────────────────────────────────────────────────────────────────── */
/** Draw one face of the card at W×H px (portrait). Stickers for that face go on top. */
export function drawFace(ctx: CanvasRenderingContext2D, W: number, H: number, card: Card, face: CardFace, assets: CardAssets) {
  const u = W / 100;
  const ink = inkFor(card);
  const head = fontCss(card.font);
  const body = card.font === 'script' ? FONTS[1].css : head;
  const inset = borderInset(card.border, u);
  const photo = assets.photo;
  paperFill(ctx, W, H, card);
  ctx.fillStyle = ink;

  const words = (box: { x: number; y: number; w: number; h: number }, scale = 1) => {
    // heading, then message, then sign-off, sharing the box by weight
    const parts = [
      { text: card.heading, css: head, size: (card.font === 'script' ? 13 : 9.5) * u * scale, share: 0.42 },
      { text: card.message, css: body, size: 6.2 * u * scale, share: 0.4 },
      { text: card.signoff, css: body, size: 5.2 * u * scale, share: 0.18 },
    ].filter((p) => p.text.trim());
    const total = parts.reduce((n, p) => n + p.share, 0) || 1;
    let y = box.y;
    for (const p of parts) {
      const h = (box.h * p.share) / total;
      ctx.fillStyle = p === parts[2] || p.text === card.signoff ? ink : ink;
      ctx.globalAlpha = p.text === card.message ? 0.85 : 1;
      fitText(ctx, p.text, p.css, { x: box.x, y, w: box.w, h }, p.size, p.css === head && card.font === 'script' ? 1.15 : 1.35);
      ctx.globalAlpha = 1;
      y += h;
    }
  };

  const t = card.template;
  if (t === 'split') {
    const ph = H * 0.56;
    if (photo) cover(ctx, photo, inset, inset, W - inset * 2, ph - inset, 1.4 * u, card.photoPan);
    else placeholder(ctx, inset, inset, W - inset * 2, ph - inset, u);
    words({ x: inset + 2 * u, y: ph + 3 * u, w: W - inset * 2 - 4 * u, h: H - ph - inset - 4 * u });
  } else if (t === 'fold') {
    if (face === 'front') {
      if (photo) cover(ctx, photo, inset, inset, W - inset * 2, H - inset * 2, 0, card.photoPan);
      else placeholder(ctx, inset, inset, W - inset * 2, H - inset * 2, u);
    } else if (face === 'inside') {
      words({ x: inset + 4 * u, y: inset + 8 * u, w: W - inset * 2 - 8 * u, h: H - inset * 2 - 16 * u });
    } else {
      ctx.globalAlpha = 0.55;
      ctx.font = `${3.2 * u}px ${FONTS[1].css}`;
      ctx.textAlign = 'center';
      ctx.fillText('made to remember · Delineate', W / 2, H - 10 * u);
      ctx.globalAlpha = 1;
    }
  } else if (t === 'ornate') {
    const cw = W * 0.64; // its own width: the floral corners frame it rather than squeeze it
    const ch = H * 0.54;
    const cx = (W - cw) / 2;
    const cy = (H - ch) / 2;
    cartouche(ctx, cx, cy, cw, ch, card.borderInk, u);
    words({ x: cx + 6 * u, y: cy + 6 * u, w: cw - 12 * u, h: ch - 12 * u }, 1.05);
  } else if (t === 'photo') {
    const m = card.border === 'none' ? 0 : inset;
    if (photo) cover(ctx, photo, m, m, W - m * 2, H - m * 2, 0, card.photoPan);
    else placeholder(ctx, m, m, W - m * 2, H - m * 2, u);
    const g = ctx.createLinearGradient(0, H * 0.55, 0, H - m);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.6)');
    ctx.fillStyle = g;
    ctx.fillRect(m, H * 0.55, W - m * 2, H * 0.45 - m);
    const saved = card.ink;
    card = { ...card, ink: saved ?? '#ffffff' };
    ctx.fillStyle = inkFor(card);
    const box = { x: m + 6 * u, y: H * 0.68, w: W - m * 2 - 12 * u, h: H * 0.26 - m };
    const parts = [card.heading, card.message].filter((s) => s.trim());
    if (parts[0]) fitText(ctx, parts[0], head, { ...box, h: box.h * 0.6 }, (card.font === 'script' ? 12 : 9) * u);
    ctx.globalAlpha = 0.9;
    if (parts[1]) fitText(ctx, parts[1], body, { ...box, y: box.y + box.h * 0.62, h: box.h * 0.38 }, 4.4 * u);
    ctx.globalAlpha = 1;
  } else if (t === 'postcard') {
    if (face === 'front') {
      const m = card.border === 'none' ? 0 : inset;
      if (photo) cover(ctx, photo, m, m, W - m * 2, H - m * 2, 0, card.photoPan);
      else placeholder(ctx, m, m, W - m * 2, H - m * 2, u);
      const g = ctx.createLinearGradient(0, m, 0, H * 0.34);
      g.addColorStop(0, 'rgba(250,246,236,0.92)');
      g.addColorStop(1, 'rgba(250,246,236,0)');
      ctx.fillStyle = g;
      ctx.fillRect(m, m, W - m * 2, H * 0.34 - m);
      ctx.fillStyle = card.ink ?? '#3a3128';
      ctx.font = `${3.6 * u}px "DM Mono", monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('GREETINGS FROM', W / 2, m + 10 * u);
      fitText(ctx, card.heading.toUpperCase(), FONTS[1].css, { x: m + 6 * u, y: m + 13 * u, w: W - m * 2 - 12 * u, h: 12 * u }, 11 * u);
    } else {
      // the back: postcards are read landscape, so draw it rotated onto the portrait sheet
      ctx.save();
      ctx.translate(W, 0);
      ctx.rotate(Math.PI / 2);
      const LW = H;
      const LH = W;
      const v = LW / 100;
      ctx.strokeStyle = 'rgba(60,50,40,0.45)';
      ctx.lineWidth = v * 0.25;
      ctx.beginPath();
      ctx.moveTo(LW * 0.56, LH * 0.14);
      ctx.lineTo(LW * 0.56, LH * 0.9);
      ctx.stroke();
      // stamp from the photo, with perforations, and a postmark
      const sw = LW * 0.13;
      const sh = sw * 1.2;
      const sx = LW - sw - 5 * v;
      const sy = 5 * v;
      ctx.fillStyle = '#fff';
      ctx.fillRect(sx - v, sy - v, sw + 2 * v, sh + 2 * v);
      if (photo) cover(ctx, photo, sx, sy, sw, sh);
      ctx.fillStyle = card.paper;
      for (let k = 0; k <= 8; k += 1) {
        for (const [px, py] of [[sx - v + (k * (sw + 2 * v)) / 8, sy - v], [sx - v + (k * (sw + 2 * v)) / 8, sy + sh + v], [sx - v, sy - v + (k * (sh + 2 * v)) / 8], [sx + sw + v, sy - v + (k * (sh + 2 * v)) / 8]]) {
          ctx.beginPath();
          ctx.arc(px, py, v * 0.55, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.strokeStyle = 'rgba(40,40,50,0.6)';
      ctx.lineWidth = v * 0.3;
      ctx.beginPath();
      ctx.arc(sx - 4 * v, sy + sh * 0.85, 7.5 * v, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(sx - 4 * v, sy + sh * 0.85, 5.6 * v, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = 'rgba(40,40,50,0.7)';
      ctx.font = `${2.4 * v}px "DM Mono", monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(new Date().getFullYear()), sx - 4 * v, sy + sh * 0.85);
      for (let k = 0; k < 4; k += 1) {
        ctx.beginPath();
        for (let x = 0; x <= 14 * v; x += v) ctx.lineTo(sx + 2 * v + x, sy + sh * 0.55 + k * 2.2 * v + Math.sin(x / v) * 0.7 * v);
        ctx.stroke();
      }
      // address lines
      ctx.strokeStyle = 'rgba(60,50,40,0.45)';
      ctx.lineWidth = v * 0.25;
      for (let k = 0; k < 4; k += 1) {
        const y = LH * (0.5 + k * 0.1);
        ctx.beginPath();
        ctx.moveTo(LW * 0.6, y);
        ctx.lineTo(LW - 5 * v, y);
        ctx.stroke();
      }
      ctx.fillStyle = inkFor(card);
      const text = [card.message, card.signoff].filter((s) => s.trim()).join('\n\n');
      ctx.textAlign = 'left';
      fitTextLeft(ctx, text, body, { x: 5 * v, y: LH * 0.12, w: LW * 0.48, h: LH * 0.78 }, 3.6 * v);
      ctx.restore();
    }
  }

  if (card.border !== 'none' && !(t === 'postcard' && face === 'back' && card.border === 'floral')) drawBorder(ctx, W, H, card, face === 'front' ? 11 : face === 'inside' ? 23 : 37);

  // stickers for this face, on top
  for (const s of card.stickers) {
    if (s.face !== face) continue;
    ctx.save();
    ctx.translate(s.x * W, s.y * H);
    ctx.rotate((s.rot * Math.PI) / 180);
    const size = s.size * W;
    if (s.kind === 'emoji') {
      ctx.font = `${size}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(s.value, 0, 0);
    } else {
      const img = assets.stickers.get(s.value);
      if (img) {
        const k = size / Math.max(img.naturalWidth, img.naturalHeight);
        ctx.drawImage(img, (-img.naturalWidth * k) / 2, (-img.naturalHeight * k) / 2, img.naturalWidth * k, img.naturalHeight * k);
      }
    }
    ctx.restore();
  }
}

/** Left-aligned wrapped text (postcard message), shrinking to fit. */
function fitTextLeft(ctx: CanvasRenderingContext2D, text: string, css: string, box: { x: number; y: number; w: number; h: number }, maxPx: number) {
  let px = maxPx;
  let lines: string[] = [];
  for (; px > 6; px *= 0.92) {
    ctx.font = `${px}px ${css}`;
    lines = [];
    for (const para of text.split('\n')) {
      let line = '';
      for (const word of para.split(/\s+/).filter(Boolean)) {
        const next = line ? `${line} ${word}` : word;
        if (ctx.measureText(next).width > box.w && line) {
          lines.push(line);
          line = word;
        } else line = next;
      }
      lines.push(line);
    }
    if (lines.length * px * 1.45 <= box.h) break;
  }
  ctx.textBaseline = 'top';
  lines.forEach((l, i) => ctx.fillText(l, box.x, box.y + i * px * 1.45));
}

/** A face as its own canvas, `pxPerInch` resolution. */
export function renderFace(card: Card, face: CardFace, assets: CardAssets, pxPerInch: number) {
  const s = CARD_SIZES[card.size];
  const c = document.createElement('canvas');
  c.width = Math.round(s.w * pxPerInch);
  c.height = Math.round(s.h * pxPerInch);
  drawFace(c.getContext('2d')!, c.width, c.height, card, face, assets);
  return c;
}

/** True when this face shows the card's photo (so dragging the card moves the photo). */
export const facePhoto = (card: Card, face: CardFace) => card.template !== 'ornate' && face === 'front';

/** Hit test for dragging: the topmost sticker under (x, y) in 0..1 face coordinates. */
export function stickerAt(card: Card, face: CardFace, x: number, y: number, aspect: number) {
  for (let i = card.stickers.length - 1; i >= 0; i -= 1) {
    const s = card.stickers[i];
    if (s.face !== face) continue;
    const dx = x - s.x;
    const dy = (y - s.y) / aspect;
    if (Math.hypot(dx, dy) < s.size * 0.6) return s;
  }
  return null;
}

/**
 * The print file. Folded cards: one landscape sheet twice the card's width, two pages (outside: back | front,
 * inside: blank | message) to print double-sided. Flat cards: one page per face, at the card's own size.
 */
export async function cardPdf(card: Card, assets: CardAssets) {
  const DPI = 300;
  const s = CARD_SIZES[card.size];
  const tpl = TEMPLATES.find((t) => t.id === card.template)!;
  const k = printScale();
  const page = async (w: number, h: number, draw: (ctx: CanvasRenderingContext2D, c: HTMLCanvasElement) => void): Promise<PdfPage> => {
    const c = document.createElement('canvas');
    c.width = Math.round(w * DPI);
    c.height = Math.round(h * DPI);
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, c.width, c.height);
    // printer calibration (Printer test page)
    if (k.x !== 1 || k.y !== 1) ctx.setTransform(k.x, 0, 0, k.y, ((1 - k.x) * c.width) / 2, ((1 - k.y) * c.height) / 2);
    draw(ctx, c);
    const blob = await canvasToBlob(c, 'image/jpeg', 0.93);
    return { jpeg: new Uint8Array(await blob.arrayBuffer()), pxWidth: c.width, pxHeight: c.height, ptWidth: w * 72, ptHeight: h * 72 };
  };
  const faceAt = (ctx: CanvasRenderingContext2D, face: CardFace, x: number) => ctx.drawImage(renderFace(card, face, assets, DPI), x, 0);
  if (card.template === 'fold') {
    const fold = (ctx: CanvasRenderingContext2D, c: HTMLCanvasElement) => {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.strokeStyle = 'rgba(0,0,0,0.2)';
      ctx.setLineDash([8, 10]);
      ctx.beginPath();
      ctx.moveTo(c.width / 2, 0);
      ctx.lineTo(c.width / 2, c.height * 0.03);
      ctx.moveTo(c.width / 2, c.height * 0.97);
      ctx.lineTo(c.width / 2, c.height);
      ctx.stroke();
    };
    return buildPdf([
      await page(s.w * 2, s.h, (ctx, c) => {
        faceAt(ctx, 'back', 0);
        faceAt(ctx, 'front', Math.round(s.w * DPI));
        fold(ctx, c);
      }),
      await page(s.w * 2, s.h, (ctx, c) => {
        ctx.fillStyle = card.paper;
        ctx.fillRect(0, 0, Math.round(s.w * DPI), c.height);
        faceAt(ctx, 'inside', Math.round(s.w * DPI));
        fold(ctx, c);
      }),
    ]);
  }
  const pages: PdfPage[] = [];
  for (const face of tpl.faces) pages.push(await page(s.w, s.h, (ctx) => faceAt(ctx, face, 0)));
  return buildPdf(pages);
}
