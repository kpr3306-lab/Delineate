import type { FrameStyle } from '../types';

export const FRAME_STYLES: { id: FrameStyle; label: string; swatch: string }[] = [
  { id: 'none', label: 'None', swatch: 'transparent' },
  { id: 'film35', label: '35mm film', swatch: '#141210' },
  { id: 'polaroid', label: 'Polaroid', swatch: '#f6f2e8' },
  { id: 'instax', label: 'Instax', swatch: '#ffffff' },
  { id: 'sx70', label: 'SX-70', swatch: 'linear-gradient(180deg, #f3efe6 70%, #e6dfd0 70%)' },
  { id: 'medium', label: 'Medium format', swatch: '#0b0b0a' },
  { id: 'slide', label: 'Slide mount', swatch: 'radial-gradient(circle, #6b8fb0 0 34%, #e2dfd8 36%)' },
  { id: 'deckle', label: 'Deckle print', swatch: 'radial-gradient(circle, #f4eedf 0 55%, #2a2520 58%)' },
  { id: 'float', label: 'Floating print', swatch: 'radial-gradient(circle, #ffffff 0 45%, #d8d4cb 70%)' },
  { id: 'mat', label: 'Gallery mat', swatch: '#efe9dc' },
  { id: 'blackmat', label: 'Black mat', swatch: 'radial-gradient(circle, #141414 0 55%, #cfcac0 58%)' },
  { id: 'modern', label: 'Modern black', swatch: 'radial-gradient(circle, #f7f6f2 0 55%, #161616 58%)' },
  { id: 'wood', label: 'Walnut', swatch: '#6b4325' },
  { id: 'gold', label: 'Gilded', swatch: '#c9a14a' },
  { id: 'stamp', label: 'Postage stamp', swatch: 'radial-gradient(circle at 50% 0, #c9b089 0 18%, #ffffff 20%)' },
  { id: 'airmail', label: 'Airmail', swatch: 'repeating-linear-gradient(45deg, #d6322f 0 6px, #ffffff 6px 12px, #1f4fa0 12px 18px, #ffffff 18px 24px)' },
  { id: 'tape', label: 'Scrapbook', swatch: '#e8d9b0' },
  { id: 'negative', label: 'Negative strip', swatch: 'linear-gradient(90deg, #8c4416, #b4622a 30% 70%, #8c4416)' },
  { id: 'dated', label: 'Date imprint', swatch: 'radial-gradient(circle at 75% 75%, #ff9a3c 0 12%, #6b7f94 14% 62%, #fbfaf6 64%)' },
  { id: 'corners', label: 'Photo corners', swatch: 'linear-gradient(135deg, #0e0c0a 0 22%, #f7f2e7 22% 78%, #0e0c0a 78%)' },
  { id: 'scallop', label: 'Scalloped edge', swatch: 'radial-gradient(circle, #fbf7ee 0 52%, #e4dccb 54%)' },
  { id: 'linen', label: 'Linen mat', swatch: 'repeating-linear-gradient(90deg, #e7e0d1 0 2px, #d9d0bd 2px 3px)' },
  { id: 'torn', label: 'Torn paper', swatch: 'radial-gradient(circle, #fbf8f0 0 50%, #c4a174 56%)' },
  { id: 'caption', label: 'Caption strip', swatch: 'linear-gradient(180deg, #6b7f94 0 66%, #ffffff 66%)' },
  { id: 'fineart', label: 'Fine art', swatch: 'radial-gradient(circle, #3a3a3a 0 26%, #fdfcf9 28%)' },
  { id: 'boothstrip', label: 'Photo booth', swatch: 'repeating-linear-gradient(180deg, #6b6b6b 0 7px, #fbf8f1 7px 9px)' },
  { id: 'washi', label: 'Washi tape', swatch: 'linear-gradient(135deg, #f4b6c2 0 30%, #ffffff 30% 70%, #a9d8c8 70%)' },
];

/** Frames with a spot for the handwritten caption. */
export const CAPTION_FRAMES: FrameStyle[] = ['polaroid', 'instax', 'sx70', 'slide', 'airmail', 'deckle', 'corners', 'caption', 'fineart', 'boothstrip'];

const HAND = '"Segoe Print", "Bradley Hand", "Comic Sans MS", cursive';

function make(width: number, height: number) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width);
  canvas.height = Math.round(height);
  return { canvas, ctx: canvas.getContext('2d')! };
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

/** Seeded so the 900px preview and the saved file get the same texture. */
function seeded(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Faint paper fibres, sized relative to the frame. */
function paperTexture(ctx: CanvasRenderingContext2D, w: number, h: number, u: number, tone = '120,100,70') {
  const rand = seeded(5);
  const s = Math.max(1, u * 0.25);
  for (let i = 0; i < 1400; i += 1) {
    ctx.fillStyle = `rgba(${tone},${rand() * 0.05})`;
    ctx.fillRect(rand() * w, rand() * h, s, s);
  }
}

function captionText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, maxW: number, color = '#2a2a2a') {
  if (!text) return;
  ctx.save();
  ctx.fillStyle = color;
  ctx.font = `${size}px ${HAND}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y, maxW);
  ctx.restore();
}

/** A rectangle whose edges ripple outward in small scallops, like a deckle-edged print. */
function deckleRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, step: number, amp: number) {
  const edge = (x0: number, y0: number, x1: number, y1: number, nx: number, ny: number) => {
    const n = Math.max(1, Math.round(Math.hypot(x1 - x0, y1 - y0) / step));
    for (let i = 1; i <= n; i += 1) {
      const tm = (i - 0.5) / n;
      const t1 = i / n;
      ctx.quadraticCurveTo(x0 + (x1 - x0) * tm + nx * amp, y0 + (y1 - y0) * tm + ny * amp, x0 + (x1 - x0) * t1, y0 + (y1 - y0) * t1);
    }
  };
  ctx.beginPath();
  ctx.moveTo(x, y);
  edge(x, y, x + w, y, 0, -1);
  edge(x + w, y, x + w, y + h, 1, 0);
  edge(x + w, y + h, x, y + h, 0, 1);
  edge(x, y + h, x, y, -1, 0);
  ctx.closePath();
}

/** Mat board frames: an outer moulding, a mat, and a bevelled window cut around the photo. */
function matFrame(src: HTMLCanvasElement, u: number, o: { frame: string[]; mat: string; bevel: string; frameW: number; matW: number }) {
  const { width: w, height: h } = src;
  const f = u * o.frameW;
  const m = u * o.matW;
  const { canvas, ctx } = make(w + (f + m) * 2, h + (f + m) * 2);
  const W = canvas.width;
  const H = canvas.height;
  const g = ctx.createLinearGradient(0, 0, W, H);
  o.frame.forEach((c, i) => g.addColorStop(i / Math.max(1, o.frame.length - 1), c));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = o.mat;
  ctx.fillRect(f, f, W - f * 2, H - f * 2);
  // shadow the moulding casts onto the mat
  const sh = ctx.createLinearGradient(0, f, 0, f + u * 2.5);
  sh.addColorStop(0, 'rgba(0,0,0,0.28)');
  sh.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = sh;
  ctx.fillRect(f, f, W - f * 2, u * 2.5);
  // bevel: the cut core of the mat, a thin light line around the window
  ctx.fillStyle = o.bevel;
  ctx.fillRect(f + m - u * 0.7, f + m - u * 0.7, w + u * 1.4, h + u * 1.4);
  ctx.drawImage(src, f + m, f + m);
  return canvas;
}

/** A paper edge torn by hand: small random steps in and out along each side. */
function tornRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, step: number, amp: number, rand: () => number) {
  const edge = (x0: number, y0: number, x1: number, y1: number, nx: number, ny: number) => {
    const n = Math.max(2, Math.round(Math.hypot(x1 - x0, y1 - y0) / step));
    for (let i = 1; i <= n; i += 1) {
      const t = i / n;
      const j = i === n ? 0 : (rand() - 0.35) * amp;
      ctx.lineTo(x0 + (x1 - x0) * t + nx * j, y0 + (y1 - y0) * t + ny * j);
    }
  };
  ctx.beginPath();
  ctx.moveTo(x, y);
  edge(x, y, x + w, y, 0, -1);
  edge(x + w, y, x + w, y + h, 1, 0);
  edge(x + w, y + h, x, y + h, 0, 1);
  edge(x, y + h, x, y, -1, 0);
  ctx.closePath();
}

/** Round bites all the way round, like a scalloped snapshot from a 1950s lab. */
function scallopRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const side = (x0: number, y0: number, x1: number, y1: number) => {
    const len = Math.hypot(x1 - x0, y1 - y0);
    const n = Math.max(2, Math.round(len / (r * 2)));
    const ang = Math.atan2(y1 - y0, x1 - x0);
    for (let i = 0; i < n; i += 1) {
      const cx = x0 + ((x1 - x0) * (i + 0.5)) / n;
      const cy = y0 + ((y1 - y0) * (i + 0.5)) / n;
      ctx.arc(cx, cy, len / n / 2, ang + Math.PI, ang, false);
    }
  };
  ctx.beginPath();
  side(x, y, x + w, y);
  side(x + w, y, x + w, y + h);
  side(x + w, y + h, x, y + h);
  side(x, y + h, x, y);
  ctx.closePath();
}

const lab = (date: number) => {
  const d = new Date(date);
  return `'${String(d.getFullYear()).slice(2)} ${String(d.getMonth() + 1).padStart(2, ' ')} ${String(d.getDate()).padStart(2, '0')}`;
};

/** The second family of frames: negative strip, dated print, album corners, scallops, linen, torn, caption, fine art, booth, washi. */
function extraFrame(src: HTMLCanvasElement, style: FrameStyle, caption: string, date: number, u: number): HTMLCanvasElement | null {
  const w = src.width;
  const h = src.height;
  const rand = seeded(17);
  const mono = (px: number, weight = 500) => `${weight} ${px}px "DM Mono", ui-monospace, monospace`;
  const serif = (px: number, italic = false) => `${italic ? 'italic ' : ''}${px}px "Instrument Serif", Georgia, serif`;

  if (style === 'negative') {
    // a strip of orange-masked colour negative, contact-printed: the photo between slivers of its neighbours
    const rail = u * 11;
    const gap = u * 3;
    const sliver = u * 7;
    const { canvas, ctx } = make(w + rail * 2, h + (gap + sliver) * 2);
    const base = ctx.createLinearGradient(0, 0, canvas.width, 0);
    base.addColorStop(0, '#8c4416');
    base.addColorStop(0.5, '#b4622a');
    base.addColorStop(1, '#8c4416');
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    // the neighbouring frames, just their edges
    ctx.fillStyle = 'rgba(40, 14, 4, 0.75)';
    ctx.fillRect(rail, 0, w, sliver);
    ctx.fillRect(rail, canvas.height - sliver, w, sliver);
    const holeW = u * 4.4;
    const holeH = u * 3.2;
    ctx.fillStyle = '#f6ead6';
    for (let y = u * 2; y < canvas.height - holeH; y += holeH * 2.2) {
      roundRect(ctx, rail * 0.3, y, holeW, holeH, u * 0.7);
      ctx.fill();
      roundRect(ctx, canvas.width - rail * 0.3 - holeW, y, holeW, holeH, u * 0.7);
      ctx.fill();
    }
    ctx.drawImage(src, rail, sliver + gap);
    // edge printing, rotated along the rails
    ctx.fillStyle = 'rgba(255, 196, 120, 0.85)';
    ctx.font = mono(u * 2.6, 600);
    ctx.textBaseline = 'middle';
    ctx.save();
    ctx.translate(rail * 0.84, canvas.height / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.fillText('DELINEATE 200  ▸ 14  ▸ 14A', 0, 0);
    ctx.restore();
    ctx.save();
    ctx.translate(canvas.width - rail * 0.84, canvas.height / 2);
    ctx.rotate(Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.fillText('SAFETY FILM  ◂ 15', 0, 0);
    ctx.restore();
    return canvas;
  }

  if (style === 'dated') {
    // a glossy lab print: thin white border, the date burnt in orange in the bottom-right corner
    const b = u * 4;
    const { canvas, ctx } = make(w + b * 2, h + b * 2);
    ctx.fillStyle = '#fbfaf6';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(src, b, b);
    ctx.save();
    ctx.font = mono(u * 5.2, 600);
    ctx.textAlign = 'right';
    ctx.textBaseline = 'alphabetic';
    ctx.shadowColor = 'rgba(255, 120, 30, 0.9)';
    ctx.shadowBlur = u * 1.2;
    ctx.fillStyle = '#ff9a3c';
    ctx.fillText(lab(date), b + w - u * 4, b + h - u * 4);
    ctx.restore();
    return canvas;
  }

  if (style === 'corners') {
    // mounted on a black album page with four paper photo corners
    const page = u * 9;
    const border = u * 2.2;
    const { canvas, ctx } = make(w + (page + border) * 2, h + (page + border) * 2 + (caption ? u * 10 : 0));
    ctx.fillStyle = '#1d1a17';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    paperTexture(ctx, canvas.width, canvas.height, u, '255,240,220');
    const x = page;
    const y = page;
    const pw = w + border * 2;
    const ph = h + border * 2;
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur = u * 1.5;
    ctx.shadowOffsetY = u * 0.6;
    ctx.fillStyle = '#f7f2e7';
    ctx.fillRect(x, y, pw, ph);
    ctx.restore();
    ctx.drawImage(src, x + border, y + border);
    const c = u * 11;
    const corner = (cx: number, cy: number, sx: number, sy: number) => {
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.45)';
      ctx.shadowBlur = u * 0.8;
      ctx.shadowOffsetY = u * 0.3;
      const g = ctx.createLinearGradient(cx, cy, cx + sx * c, cy + sy * c);
      g.addColorStop(0, '#d8bf8a');
      g.addColorStop(1, '#9c7d48');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(cx - sx * u, cy - sy * u);
      ctx.lineTo(cx + sx * c, cy - sy * u);
      ctx.lineTo(cx - sx * u, cy + sy * c);
      ctx.closePath();
      ctx.fill();
      // the folded hypotenuse catches the light
      ctx.shadowColor = 'transparent';
      ctx.strokeStyle = 'rgba(255, 245, 220, 0.7)';
      ctx.lineWidth = Math.max(1, u * 0.35);
      ctx.beginPath();
      ctx.moveTo(cx + sx * c, cy - sy * u);
      ctx.lineTo(cx - sx * u, cy + sy * c);
      ctx.stroke();
      ctx.restore();
    };
    corner(x, y, 1, 1);
    corner(x + pw, y, -1, 1);
    corner(x, y + ph, 1, -1);
    corner(x + pw, y + ph, -1, -1);
    captionText(ctx, caption, canvas.width / 2, y + ph + (canvas.height - y - ph) / 2, u * 5, pw, '#efe6d4');
    return canvas;
  }

  if (style === 'scallop') {
    const back = u * 6;
    const b = u * 6;
    const pw = w + b * 2;
    const ph = h + b * 2;
    const { canvas, ctx } = make(pw + back * 2, ph + back * 2);
    ctx.fillStyle = '#e4dccb';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    paperTexture(ctx, canvas.width, canvas.height, u);
    ctx.save();
    ctx.shadowColor = 'rgba(60,45,25,0.4)';
    ctx.shadowBlur = u * 2;
    ctx.shadowOffsetY = u * 0.7;
    ctx.fillStyle = '#fbf7ee';
    scallopRect(ctx, back, back, pw, ph, u * 2.2);
    ctx.fill();
    ctx.restore();
    ctx.drawImage(src, back + b, back + b);
    return canvas;
  }

  if (style === 'linen') {
    // a thin black moulding, a wide linen mat with its weave, a white bevel around the window
    const f = u * 2.6;
    const m = u * 15;
    const { canvas, ctx } = make(w + (f + m) * 2, h + (f + m) * 2);
    const W = canvas.width;
    const H = canvas.height;
    ctx.fillStyle = '#1b1a18';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#e7e0d1';
    ctx.fillRect(f, f, W - f * 2, H - f * 2);
    ctx.save();
    ctx.beginPath();
    ctx.rect(f, f, W - f * 2, H - f * 2);
    ctx.clip();
    const s = Math.max(2, u * 0.55);
    ctx.lineWidth = Math.max(1, s * 0.45);
    for (let i = 0; i < W; i += s) {
      ctx.strokeStyle = `rgba(120, 100, 70, ${0.06 + rand() * 0.07})`;
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, H);
      ctx.stroke();
    }
    for (let j = 0; j < H; j += s) {
      ctx.strokeStyle = `rgba(255, 255, 255, ${0.08 + rand() * 0.1})`;
      ctx.beginPath();
      ctx.moveTo(0, j);
      ctx.lineTo(W, j);
      ctx.stroke();
    }
    ctx.restore();
    const sh = ctx.createLinearGradient(0, f, 0, f + u * 2.5);
    sh.addColorStop(0, 'rgba(0,0,0,0.3)');
    sh.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = sh;
    ctx.fillRect(f, f, W - f * 2, u * 2.5);
    ctx.fillStyle = '#fbf9f3';
    ctx.fillRect(f + m - u * 0.8, f + m - u * 0.8, w + u * 1.6, h + u * 1.6);
    ctx.drawImage(src, f + m, f + m);
    return canvas;
  }

  if (style === 'torn') {
    // a print with a hand-torn white edge, lying on kraft paper
    const back = u * 7;
    const b = u * 5;
    const pw = w + b * 2;
    const ph = h + b * 2;
    const { canvas, ctx } = make(pw + back * 2, ph + back * 2);
    ctx.fillStyle = '#c4a174';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    paperTexture(ctx, canvas.width, canvas.height, u, '70,45,15');
    ctx.save();
    ctx.shadowColor = 'rgba(50,30,10,0.45)';
    ctx.shadowBlur = u * 1.8;
    ctx.shadowOffsetY = u * 0.6;
    ctx.fillStyle = '#fbf8f0';
    tornRect(ctx, back, back, pw, ph, u * 1.6, u * 2.2, rand);
    ctx.fill();
    ctx.restore();
    ctx.drawImage(src, back + b, back + b);
    return canvas;
  }

  if (style === 'caption') {
    // editorial: a clean white band under the photo with the caption and the date
    const b = u * 3;
    const band = u * 15;
    const { canvas, ctx } = make(w + b * 2, h + b + band);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(src, b, b);
    const mid = b + h + band / 2;
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#1c1b19';
    ctx.font = serif(u * 6.4);
    ctx.fillText(caption || 'Untitled', b + u * 2, mid, w * 0.68);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#8a857c';
    ctx.font = mono(u * 3.6);
    ctx.fillText(new Date(date).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }).toUpperCase(), b + w - u * 2, mid);
    return canvas;
  }

  if (style === 'fineart') {
    // museum print: deep white margins, a hairline keyline, a title and an edition number in pencil
    const side = u * 14;
    const top = u * 14;
    const bottom = u * 24;
    const { canvas, ctx } = make(w + side * 2, h + top + bottom);
    ctx.fillStyle = '#fdfcf9';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    paperTexture(ctx, canvas.width, canvas.height, u, '150,140,120');
    ctx.drawImage(src, side, top);
    ctx.strokeStyle = 'rgba(30,30,30,0.35)';
    ctx.lineWidth = Math.max(1, u * 0.12);
    ctx.strokeRect(side - u * 2.2, top - u * 2.2, w + u * 4.4, h + u * 4.4);
    const y = top + h + bottom * 0.52;
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#5a5650';
    ctx.font = serif(u * 5.4, true);
    ctx.fillText(caption || 'Untitled', side, y, w * 0.6);
    ctx.textAlign = 'right';
    ctx.font = serif(u * 4.6);
    ctx.fillText(`1/1 · ${new Date(date).getFullYear()}`, side + w, y);
    return canvas;
  }

  if (style === 'boothstrip') {
    // four frames down a booth strip: the photo, then three takes with the booth's moods
    const cell = Math.round(Math.max(w, h) * 0.42);
    const cw = cell;
    const ch = Math.round(cell * 0.78);
    const gap = Math.round(cell * 0.06);
    const foot = Math.round(cell * 0.26);
    const { canvas, ctx } = make(cw + gap * 2, (ch + gap) * 4 + gap + foot);
    ctx.fillStyle = '#fbf8f1';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const scale = Math.max(cw / w, ch / h);
    const moods = ['none', 'grayscale(1) contrast(1.15)', 'sepia(0.45) saturate(1.1)', 'grayscale(1) contrast(1.35) brightness(1.05)'];
    moods.forEach((mood, i) => {
      const y = gap + i * (ch + gap);
      ctx.save();
      ctx.beginPath();
      ctx.rect(gap, y, cw, ch);
      ctx.clip();
      ctx.filter = mood;
      const z = scale * (1 + i * 0.06); // each take a little closer, like leaning in
      ctx.drawImage(src, gap + (cw - w * z) / 2, y + (ch - h * z) / 2, w * z, h * z);
      ctx.restore();
    });
    ctx.fillStyle = '#2a2622';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = serif(foot * 0.34);
    ctx.fillText(caption || 'Delineate · Photo Booth', canvas.width / 2, canvas.height - foot * 0.55, cw);
    return canvas;
  }

  if (style === 'washi') {
    // a white-bordered print on pale paper, held by two strips of patterned washi tape
    const back = u * 8;
    const b = u * 4;
    const pw = w + b * 2;
    const ph = h + b * 2;
    const { canvas, ctx } = make(pw + back * 2, ph + back * 2);
    ctx.fillStyle = '#f1ece2';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    paperTexture(ctx, canvas.width, canvas.height, u);
    ctx.save();
    ctx.shadowColor = 'rgba(60,45,25,0.3)';
    ctx.shadowBlur = u * 1.6;
    ctx.shadowOffsetY = u * 0.6;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(back, back, pw, ph);
    ctx.restore();
    ctx.drawImage(src, back + b, back + b);
    const tape = (x: number, y: number, angle: number, base: string, pattern: (len: number, th: number) => void) => {
      const len = u * 26;
      const th = u * 7.5;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(angle);
      ctx.globalAlpha = 0.86;
      ctx.beginPath();
      // torn little zig-zag ends, like real washi
      ctx.moveTo(-len / 2, -th / 2);
      ctx.lineTo(len / 2, -th / 2);
      for (let k = 0; k <= 6; k += 1) ctx.lineTo(len / 2 + (k % 2 ? u * 0.8 : 0), -th / 2 + (th * k) / 6);
      ctx.lineTo(-len / 2, th / 2);
      for (let k = 6; k >= 0; k -= 1) ctx.lineTo(-len / 2 - (k % 2 ? u * 0.8 : 0), -th / 2 + (th * k) / 6);
      ctx.closePath();
      ctx.fillStyle = base;
      ctx.fill();
      ctx.clip();
      pattern(len, th);
      ctx.restore();
    };
    tape(back + u * 9, back + u * 1.5, -0.62, '#f4b6c2', (len, th) => {
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      for (let px = -len / 2; px < len / 2; px += u * 3) for (let py = -th / 2 + u * 1.5; py < th / 2; py += u * 3) {
        ctx.beginPath();
        ctx.arc(px + ((py / (u * 3)) % 2 ? u * 1.5 : 0), py, u * 0.7, 0, Math.PI * 2);
        ctx.fill();
      }
    });
    tape(canvas.width - back - u * 9, canvas.height - back - u * 1.5, -0.62, '#a9d8c8', (len, th) => {
      ctx.fillStyle = 'rgba(255,255,255,0.65)';
      for (let px = -len / 2; px < len / 2; px += u * 2.6) ctx.fillRect(px, -th / 2, u * 1.1, th);
    });
    return canvas;
  }

  return null;
}

/** Wrap a rendered image in a physical-looking frame. Returns a new, larger canvas. */
export function applyFrame(src: HTMLCanvasElement, style: FrameStyle, caption = '', date = Date.now()): HTMLCanvasElement {
  if (style === 'none') return src;
  const w = src.width;
  const h = src.height;
  const u = Math.min(w, h) / 100; // one "unit" = 1% of the short side
  const rand = seeded(9);
  const extra = extraFrame(src, style, caption, date, u);
  if (extra) return extra;

  if (style === 'film35') {
    const pad = u * 12;
    const { canvas, ctx } = make(w + u * 6, h + pad * 2);
    ctx.fillStyle = '#16120e';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    // orange film base glow at the edges
    const base = ctx.createLinearGradient(0, 0, 0, canvas.height);
    base.addColorStop(0, 'rgba(160, 82, 20, 0.35)');
    base.addColorStop(0.5, 'rgba(0,0,0,0)');
    base.addColorStop(1, 'rgba(160, 82, 20, 0.35)');
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const holeW = u * 4.2;
    const holeH = u * 5.6;
    ctx.fillStyle = '#efe7d6';
    for (let x = u * 2; x < canvas.width - holeW; x += holeW * 2.1) {
      roundRect(ctx, x, pad * 0.22, holeW, holeH, u * 0.8);
      ctx.fill();
      roundRect(ctx, x, canvas.height - pad * 0.22 - holeH, holeW, holeH, u * 0.8);
      ctx.fill();
    }
    ctx.drawImage(src, u * 3, pad);
    ctx.fillStyle = '#e8892e';
    ctx.font = `600 ${u * 3}px "DM Mono", monospace`;
    ctx.textBaseline = 'middle';
    ctx.fillText('DELINEATE 400  ▸ 12A', u * 6, pad * 0.84);
    ctx.textAlign = 'right';
    ctx.fillText('◂ 13   SAFETY FILM', canvas.width - u * 6, canvas.height - pad * 0.84);
    return canvas;
  }

  if (style === 'polaroid' || style === 'instax' || style === 'tape' || style === 'sx70') {
    const side = style === 'instax' ? u * 6 : u * 7;
    const bottom = style === 'tape' ? side : style === 'instax' ? u * 22 : style === 'sx70' ? u * 24 : u * 26;
    const { canvas, ctx } = make(w + side * 2, h + side + bottom);
    ctx.fillStyle = style === 'polaroid' ? '#f6f2e8' : style === 'sx70' ? '#f3efe6' : '#fffefb';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    paperTexture(ctx, canvas.width, canvas.height, u);
    if (style === 'sx70') {
      // SX-70 prints have a softly rounded image window
      ctx.save();
      roundRect(ctx, side, side, w, h, u * 2.4);
      ctx.clip();
      ctx.drawImage(src, side, side);
      ctx.restore();
      ctx.strokeStyle = 'rgba(0,0,0,0.14)';
      ctx.lineWidth = Math.max(1, u * 0.25);
      roundRect(ctx, side, side, w, h, u * 2.4);
      ctx.stroke();
    } else {
      ctx.drawImage(src, side, side);
      ctx.strokeStyle = 'rgba(0,0,0,0.12)';
      ctx.lineWidth = Math.max(1, u * 0.2);
      ctx.strokeRect(side, side, w, h);
    }
    if (style !== 'tape') captionText(ctx, caption, canvas.width / 2, h + side + bottom / 2, u * 7, w);
    if (style === 'tape') {
      const tape = (x: number, y: number, angle: number) => {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(angle);
        ctx.fillStyle = 'rgba(232, 217, 176, 0.82)';
        ctx.fillRect(-u * 12, -u * 3.6, u * 24, u * 7.2);
        ctx.restore();
      };
      tape(u * 6, u * 4, -0.7);
      tape(canvas.width - u * 6, canvas.height - u * 4, -0.7);
    }
    return canvas;
  }

  if (style === 'medium') {
    const pad = u * 8;
    const { canvas, ctx } = make(w + pad * 2, h + pad * 2);
    ctx.fillStyle = '#0b0b0a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(src, pad, pad);
    // rough emulsion edge
    ctx.fillStyle = '#0b0b0a';
    for (let i = 0; i < 260; i += 1) {
      const t = rand();
      const s = u * (0.4 + rand() * 1.4);
      ctx.fillRect(pad + t * w, pad - s / 2, s * 2, s);
      ctx.fillRect(pad + t * w, pad + h - s / 2, s * 2, s);
      ctx.fillRect(pad - s / 2, pad + t * h, s, s * 2);
      ctx.fillRect(pad + w - s / 2, pad + t * h, s, s * 2);
    }
    ctx.fillStyle = '#d8d2c4';
    ctx.font = `500 ${u * 2.8}px "DM Mono", monospace`;
    ctx.fillText('120  ·  6×6  ·  DELINEATE', pad, pad * 0.62);
    roundRect(ctx, canvas.width - pad * 1.8, pad * 0.25, pad * 1.1, pad * 0.5, u);
    ctx.fill();
    return canvas;
  }

  if (style === 'mat') {
    const mat = u * 16;
    const rim = u * 2.6;
    const { canvas, ctx } = make(w + (mat + rim) * 2, h + (mat + rim) * 2);
    ctx.fillStyle = '#1d1b18';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#efe9dc';
    ctx.fillRect(rim, rim, canvas.width - rim * 2, canvas.height - rim * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.fillRect(rim + mat - u * 0.6, rim + mat - u * 0.6, w + u * 1.2, h + u * 1.2);
    ctx.drawImage(src, rim + mat, rim + mat);
    return canvas;
  }

  if (style === 'modern') return matFrame(src, u, { frame: ['#2a2a2a', '#111111', '#1e1e1e'], mat: '#f7f6f2', bevel: '#ffffff', frameW: 3.4, matW: 13 });
  if (style === 'blackmat') return matFrame(src, u, { frame: ['#e9e6df', '#a9a59c', '#d8d4cb'], mat: '#141414', bevel: '#ece7da', frameW: 3, matW: 14 });

  if (style === 'deckle') {
    // a deckle-edged print lying on a dark linen desk
    const back = u * 6;
    const side = u * 6;
    const bottom = caption ? u * 16 : u * 9;
    const pw = w + side * 2;
    const ph = h + side + bottom;
    const { canvas, ctx } = make(pw + back * 2, ph + back * 2);
    ctx.fillStyle = '#2a2520';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    paperTexture(ctx, canvas.width, canvas.height, u, '0,0,0');
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = u * 2.5;
    ctx.shadowOffsetY = u * 0.8;
    ctx.fillStyle = '#f4eedf';
    deckleRect(ctx, back, back, pw, ph, u * 2.8, u * 1.5);
    ctx.fill();
    ctx.restore();
    ctx.save();
    deckleRect(ctx, back, back, pw, ph, u * 2.8, u * 1.5);
    ctx.clip();
    paperTexture(ctx, canvas.width, canvas.height, u);
    ctx.restore();
    ctx.drawImage(src, back + side, back + side);
    ctx.strokeStyle = 'rgba(0,0,0,0.15)';
    ctx.lineWidth = Math.max(1, u * 0.2);
    ctx.strokeRect(back + side, back + side, w, h);
    captionText(ctx, caption, canvas.width / 2, back + side + h + bottom / 2, u * 6, w, '#3a3128');
    return canvas;
  }

  if (style === 'float') {
    // the print floats off a gallery wall on its own shadow
    const wall = u * 10;
    const border = u * 3.5;
    const { canvas, ctx } = make(w + (wall + border) * 2, h + (wall + border) * 2);
    const g = ctx.createLinearGradient(0, 0, 0, canvas.height);
    g.addColorStop(0, '#ece9e2');
    g.addColorStop(1, '#dcd7cc');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.shadowColor = 'rgba(40,32,20,0.38)';
    ctx.shadowBlur = u * 5;
    ctx.shadowOffsetY = u * 2.6;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(wall, wall, w + border * 2, h + border * 2);
    ctx.restore();
    ctx.drawImage(src, wall + border, wall + border);
    return canvas;
  }

  if (style === 'slide') {
    // a 35mm slide mount on a lightbox
    const m = u * 18;
    const side = Math.max(w, h) + m * 2;
    const glow = u * 5;
    const { canvas, ctx } = make(side + glow * 2, side + glow * 2);
    const light = ctx.createRadialGradient(canvas.width / 2, canvas.height / 2, 0, canvas.width / 2, canvas.height / 2, canvas.width * 0.75);
    light.addColorStop(0, '#fbfaf6');
    light.addColorStop(1, '#e4e1d9');
    ctx.fillStyle = light;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.3)';
    ctx.shadowBlur = u * 3;
    ctx.shadowOffsetY = u;
    const mount = ctx.createLinearGradient(0, glow, 0, glow + side);
    mount.addColorStop(0, '#efece6');
    mount.addColorStop(1, '#d4d0c6');
    ctx.fillStyle = mount;
    roundRect(ctx, glow, glow, side, side, u * 3);
    ctx.fill();
    ctx.restore();
    const ix = glow + (side - w) / 2;
    const iy = glow + (side - h) / 2;
    ctx.save();
    roundRect(ctx, ix, iy, w, h, u * 1.6);
    ctx.clip();
    ctx.drawImage(src, ix, iy);
    ctx.restore();
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.lineWidth = Math.max(1, u * 0.35);
    roundRect(ctx, ix, iy, w, h, u * 1.6);
    ctx.stroke();
    ctx.fillStyle = '#6d685e';
    ctx.font = `600 ${u * 4}px "DM Mono", monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('DELINEATE  ·  TRANSPARENCY', canvas.width / 2, (glow + iy) / 2 + u);
    ctx.save();
    ctx.translate(glow + (ix - glow) / 2, canvas.height / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText('35 MM  ·  24', 0, 0);
    ctx.restore();
    captionText(ctx, caption, canvas.width / 2, (iy + h + glow + side) / 2, u * 5.5, side * 0.8, '#3a3630');
    return canvas;
  }

  if (style === 'stamp') {
    // a perforated postage stamp on a kraft envelope
    const back = u * 7;
    const margin = u * 6;
    const foot = u * 13;
    const pw = w + margin * 2;
    const ph = h + margin + foot;
    const { canvas, ctx } = make(pw + back * 2, ph + back * 2);
    const kraft = '#c9b089';
    ctx.fillStyle = kraft;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.shadowColor = 'rgba(60,40,10,0.35)';
    ctx.shadowBlur = u * 1.6;
    ctx.shadowOffsetY = u * 0.5;
    ctx.fillStyle = '#fffdf8';
    ctx.fillRect(back, back, pw, ph);
    ctx.restore();
    // perforations: envelope-coloured bites along every edge
    const r = u * 1.5;
    const gap = u * 4.6;
    ctx.fillStyle = kraft;
    const bite = (x: number, y: number) => {
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    };
    for (let x = back + gap / 2; x < back + pw; x += gap) {
      bite(x, back);
      bite(x, back + ph);
    }
    for (let y = back + gap / 2; y < back + ph; y += gap) {
      bite(back, y);
      bite(back + pw, y);
    }
    ctx.drawImage(src, back + margin, back + margin);
    ctx.fillStyle = '#2b2a28';
    ctx.textBaseline = 'middle';
    ctx.font = `600 ${u * 3.8}px "DM Mono", monospace`;
    ctx.fillText('DELINEATE POST', back + margin, back + margin + h + foot / 2);
    ctx.textAlign = 'right';
    ctx.font = `${u * 8}px "Instrument Serif", Georgia, serif`;
    ctx.fillText('25', back + margin + w, back + margin + h + foot / 2);
    return canvas;
  }

  if (style === 'airmail') {
    const band = u * 4.5;
    const inner = u * 4;
    const foot = u * 13;
    const W = w + (band + inner) * 2;
    const H = band + inner + h + foot + band;
    const { canvas, ctx } = make(W, H);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, H);
    // red / white / blue diagonal border, clipped to the band
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, W, H);
    ctx.rect(band, band, W - band * 2, H - band * 2);
    ctx.clip('evenodd');
    const stripe = u * 3.2;
    const colors = ['#d6322f', '#ffffff', '#1f4fa0', '#ffffff'];
    ctx.translate(W / 2, H / 2);
    ctx.rotate(Math.PI / 4);
    const span = W + H;
    for (let i = -span / stripe, k = 0; i < span / stripe; i += 1, k += 1) {
      ctx.fillStyle = colors[((k % 4) + 4) % 4];
      ctx.fillRect(i * stripe, -span, stripe, span * 2);
    }
    ctx.restore();
    ctx.drawImage(src, band + inner, band + inner);
    const fy = band + inner + h + foot / 2;
    if (caption) captionText(ctx, caption, W / 2, fy, u * 6, w, '#1f4fa0');
    else {
      ctx.fillStyle = '#1f4fa0';
      ctx.font = `600 ${u * 3.4}px "DM Mono", monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('PAR AVION  ·  BY AIR MAIL', W / 2, fy, w);
    }
    return canvas;
  }

  // wood + gold: bevelled moulding drawn as four trapezoids
  const band = u * (style === 'gold' ? 13 : 10);
  const inner = u * 5;
  const { canvas, ctx } = make(w + (band + inner) * 2, h + (band + inner) * 2);
  const W = canvas.width;
  const H = canvas.height;
  const colors =
    style === 'gold' ? ['#f6dd8e', '#b8862f', '#7a5419', '#e8c46a'] : ['#8a5a34', '#5c3a1f', '#3b2412', '#7a4d2a'];
  const sides: [number, number][][] = [
    [[0, 0], [W, 0], [W - band, band], [band, band]],
    [[W, 0], [W, H], [W - band, H - band], [W - band, band]],
    [[W, H], [0, H], [band, H - band], [W - band, H - band]],
    [[0, H], [0, 0], [band, band], [band, H - band]],
  ];
  sides.forEach((pts, i) => {
    ctx.beginPath();
    pts.forEach(([x, y], j) => (j ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
    const g = ctx.createLinearGradient(pts[0][0], pts[0][1], pts[3][0], pts[3][1]);
    g.addColorStop(0, colors[i]);
    g.addColorStop(1, colors[(i + 2) % 4]);
    ctx.fillStyle = g;
    ctx.fill();
  });
  if (style === 'wood') {
    ctx.strokeStyle = 'rgba(30,15,5,0.25)';
    ctx.lineWidth = Math.max(1, u * 0.15);
    for (let i = 0; i < 90; i += 1) {
      const y = rand() * H;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.bezierCurveTo(W / 3, y + u, (2 * W) / 3, y - u, W, y + u * 0.5);
      ctx.stroke();
    }
  } else {
    ctx.strokeStyle = 'rgba(255,240,190,0.7)';
    ctx.lineWidth = u * 0.8;
    ctx.strokeRect(band * 0.45, band * 0.45, W - band * 0.9, H - band * 0.9);
  }
  ctx.fillStyle = style === 'gold' ? '#f3ecdc' : '#efe7d6';
  ctx.fillRect(band, band, W - band * 2, H - band * 2);
  ctx.drawImage(src, band + inner, band + inner);
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.fillRect(band, band, W - band * 2, u * 0.8);
  return canvas;
}
