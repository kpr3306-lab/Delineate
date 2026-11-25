// Print projects for Studio › Frames: greeting cards, a photo calendar, a roll contact sheet, and a printer test page.
import type { PhotoRecord } from '../types';
import { buildPdf, type PdfPage } from './pdf';
import { canvasToBlob, loadImage } from './utils';
import { monthGrid } from './print';

const DPI = 200;
const MM = 1 / 25.4;
const SERIF = '"Instrument Serif", Georgia, serif';
const MONO = '"DM Mono", ui-monospace, monospace';
const SANS = '"Space Grotesk Variable", system-ui, sans-serif';
const HAND = '"Segoe Print", "Bradley Hand", "Comic Sans MS", cursive';

/* ── printer calibration ────────────────────────────────────────────────────────────────────── */
const CAL = 'delineate-print-scale';
/** Correction for printers that shrink or stretch the page a little (1 = none). */
export function printScale() {
  try {
    const v = Number(localStorage.getItem(CAL));
    return v > 0.8 && v < 1.2 ? v : 1;
  } catch {
    return 1;
  }
}
/** From the test page: the 100 mm line measured `measuredMm` on paper. */
export function setPrintScale(measuredMm: number | null) {
  try {
    if (measuredMm === null) localStorage.removeItem(CAL);
    else localStorage.setItem(CAL, String(Math.min(1.2, Math.max(0.8, 100 / measuredMm))));
  } catch {
    /* private mode: no correction */
  }
}

/* ── shared page helpers ────────────────────────────────────────────────────────────────────── */
type Paper = { w: number; h: number }; // inches
const page = (paper: Paper) => {
  const c = document.createElement('canvas');
  c.width = Math.round(paper.w * DPI);
  c.height = Math.round(paper.h * DPI);
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, c.width, c.height);
  return { c, ctx, px: (inches: number) => inches * DPI };
};
const toPdfPage = async (c: HTMLCanvasElement, paper: Paper): Promise<PdfPage> => {
  const blob = await canvasToBlob(c, 'image/jpeg', 0.9);
  return { jpeg: new Uint8Array(await blob.arrayBuffer()), pxWidth: c.width, pxHeight: c.height, ptWidth: paper.w * 72, ptHeight: paper.h * 72 };
};
/** Draw an image to cover a box (centre crop). */
const cover = (ctx: CanvasRenderingContext2D, img: CanvasImageSource & { width: number; height: number }, x: number, y: number, w: number, h: number) => {
  const k = Math.max(w / img.width, h / img.height);
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.drawImage(img, x + (w - img.width * k) / 2, y + (h - img.height * k) / 2, img.width * k, img.height * k);
  ctx.restore();
};
/** Scale page content about the centre to cancel a printer's shrink/stretch. */
const calibrate = (ctx: CanvasRenderingContext2D, c: HTMLCanvasElement) => {
  const k = printScale();
  if (k !== 1) ctx.setTransform(k, 0, 0, k, ((1 - k) * c.width) / 2, ((1 - k) * c.height) / 2);
};
const wrap = (ctx: CanvasRenderingContext2D, text: string, maxW: number) => {
  const lines: string[] = [];
  for (const para of text.split('\n')) {
    let line = '';
    for (const word of para.split(/\s+/)) {
      const next = line ? `${line} ${word}` : word;
      if (ctx.measureText(next).width > maxW && line) {
        lines.push(line);
        line = word;
      } else line = next;
    }
    lines.push(line);
  }
  return lines;
};

/* ── greeting card ──────────────────────────────────────────────────────────────────────────── */
export const CARD_SIZES = [
  { id: 'a6', label: 'A6 card (folded A5)', w: 148 * MM, h: 105 * MM * 2 }, // panel 105 × 148 mm portrait
  { id: '5x7', label: '5 × 7 card (folded 10 × 7)', w: 7, h: 10 },
] as const;

/**
 * A folded card as two pages for double-sided printing: outside (back | front photo) and inside (blank | message).
 * The flat sheet is landscape; it folds down the middle.
 */
export async function cardPdf(photo: Blob, opts: { size: (typeof CARD_SIZES)[number]['id']; message: string; font: 'hand' | 'serif'; from: string }) {
  await document.fonts?.ready;
  const s = CARD_SIZES.find((c) => c.id === opts.size)!;
  const flat: Paper = { w: s.h, h: s.w }; // landscape sheet: two portrait panels side by side
  const img = await loadImage(photo);
  const panelW = flat.w / 2;

  // outside: the back (left) carries a small credit, the front (right) the photo
  const out = page(flat);
  calibrate(out.ctx, out.c);
  const m = out.px(0.3);
  const fx = out.px(panelW);
  cover(out.ctx, img, fx + m, m, out.px(panelW) - m * 2, out.px(flat.h) * 0.8 - m);
  out.ctx.fillStyle = '#3a3630';
  out.ctx.textAlign = 'center';
  out.ctx.font = `${out.px(0.16)}px ${SERIF}`;
  out.ctx.fillText('made to remember · Delineate', out.px(panelW / 2), out.px(flat.h) - out.px(0.5));
  if (opts.from) {
    out.ctx.font = `italic ${out.px(0.2)}px ${SERIF}`;
    out.ctx.fillText(opts.from, fx + out.px(panelW / 2), out.px(flat.h) * 0.9);
  }
  out.ctx.setTransform(1, 0, 0, 1, 0, 0);
  foldLine(out.ctx, out.c);

  // inside: the message on the right-hand panel
  const ins = page(flat);
  calibrate(ins.ctx, ins.c);
  const size = ins.px(opts.font === 'hand' ? 0.24 : 0.28);
  ins.ctx.fillStyle = '#26231f';
  ins.ctx.font = `${opts.font === 'serif' ? 'italic ' : ''}${size}px ${opts.font === 'hand' ? HAND : SERIF}`;
  ins.ctx.textAlign = 'center';
  ins.ctx.textBaseline = 'middle';
  const lines = wrap(ins.ctx, opts.message || 'Thinking of you.', ins.px(panelW) - ins.px(0.9));
  const lh = size * 1.45;
  lines.forEach((l, i) => ins.ctx.fillText(l, ins.px(panelW * 1.5), ins.px(flat.h / 2) + (i - (lines.length - 1) / 2) * lh));
  ins.ctx.setTransform(1, 0, 0, 1, 0, 0);
  foldLine(ins.ctx, ins.c);

  return buildPdf([await toPdfPage(out.c, flat), await toPdfPage(ins.c, flat)]);
}
const foldLine = (ctx: CanvasRenderingContext2D, c: HTMLCanvasElement) => {
  ctx.save();
  ctx.strokeStyle = 'rgba(0,0,0,0.18)';
  ctx.setLineDash([6, 8]);
  ctx.beginPath();
  ctx.moveTo(c.width / 2, 0);
  ctx.lineTo(c.width / 2, c.height * 0.04);
  ctx.moveTo(c.width / 2, c.height * 0.96);
  ctx.lineTo(c.width / 2, c.height);
  ctx.stroke();
  ctx.restore();
};

/* ── photo calendar ─────────────────────────────────────────────────────────────────────────── */
export async function calendarPdf(photos: PhotoRecord[], opts: { year: number; startMonth: number; monday: boolean; paper: Paper; title: string; cover: boolean }) {
  await document.fonts?.ready;
  const pages: PdfPage[] = [];
  // fewer photos than months repeat; decode each one once
  const cache = new Map<string, HTMLImageElement>();
  const img = async (p: PhotoRecord) => cache.get(p.id) ?? (cache.set(p.id, await loadImage(p.blob)), cache.get(p.id)!);
  const names = Array.from({ length: 7 }, (_, i) => new Date(2023, 0, (opts.monday ? 2 : 1) + i).toLocaleDateString(undefined, { weekday: 'short' }));
  if (opts.cover && photos[0]) {
    const p = page(opts.paper);
    cover(p.ctx, await img(photos[0]), 0, 0, p.c.width, p.c.height * 0.78);
    p.ctx.fillStyle = '#1f1d1a';
    p.ctx.textAlign = 'center';
    p.ctx.font = `${p.px(0.7)}px ${SERIF}`;
    p.ctx.fillText(opts.title || String(opts.year), p.c.width / 2, p.c.height * 0.89);
    p.ctx.font = `${p.px(0.13)}px ${MONO}`;
    p.ctx.fillStyle = '#7a7062';
    p.ctx.fillText(`${opts.year} · DELINEATE`, p.c.width / 2, p.c.height * 0.94);
    pages.push(await toPdfPage(p.c, opts.paper));
  }
  for (let i = 0; i < 12; i += 1) {
    const month = (opts.startMonth + i) % 12;
    const year = opts.year + Math.floor((opts.startMonth + i) / 12);
    const p = page(opts.paper);
    const m = p.px(0.45);
    const photo = photos[(i + (opts.cover ? 1 : 0)) % Math.max(1, photos.length)];
    if (photo) cover(p.ctx, await img(photo), m, m, p.c.width - m * 2, p.c.height * 0.52);
    const top = m + p.c.height * 0.52 + p.px(0.35);
    p.ctx.fillStyle = '#1f1d1a';
    p.ctx.textBaseline = 'alphabetic';
    p.ctx.font = `${p.px(0.5)}px ${SERIF}`;
    p.ctx.fillText(new Date(year, month, 1).toLocaleDateString(undefined, { month: 'long' }), m, top + p.px(0.35));
    p.ctx.textAlign = 'right';
    p.ctx.font = `${p.px(0.16)}px ${MONO}`;
    p.ctx.fillStyle = '#7a7062';
    p.ctx.fillText(String(year), p.c.width - m, top + p.px(0.35));
    // the grid
    const weeks = monthGrid(year, month, opts.monday);
    const gx = m;
    const gw = p.c.width - m * 2;
    const gy = top + p.px(0.65);
    const gh = p.c.height - gy - m;
    const cw = gw / 7;
    const rh = (gh - p.px(0.3)) / weeks.length;
    p.ctx.textAlign = 'center';
    p.ctx.font = `${p.px(0.12)}px ${MONO}`;
    names.forEach((n, d) => {
      const weekend = opts.monday ? d >= 5 : d === 0 || d === 6;
      p.ctx.fillStyle = weekend ? '#c65d36' : '#7a7062';
      p.ctx.fillText(n.toUpperCase(), gx + cw * d + cw / 2, gy + p.px(0.15));
    });
    p.ctx.strokeStyle = 'rgba(0,0,0,0.12)';
    p.ctx.lineWidth = 1;
    weeks.forEach((week, r) =>
      week.forEach((day, d) => {
        const x = gx + cw * d;
        const y = gy + p.px(0.3) + rh * r;
        p.ctx.strokeRect(x, y, cw, rh);
        if (!day) return;
        const weekend = opts.monday ? d >= 5 : d === 0 || d === 6;
        p.ctx.fillStyle = weekend ? '#c65d36' : '#26231f';
        p.ctx.textAlign = 'left';
        p.ctx.font = `${p.px(0.17)}px ${SANS}`;
        p.ctx.fillText(String(day), x + p.px(0.08), y + p.px(0.24));
      }),
    );
    pages.push(await toPdfPage(p.c, opts.paper));
  }
  return buildPdf(pages);
}

/* ── contact sheet ──────────────────────────────────────────────────────────────────────────── */
/** Every photo as a numbered frame on film-strip rows, like a lab proof sheet. */
export async function contactSheetPdf(photos: PhotoRecord[], opts: { title: string; paper: Paper }) {
  await document.fonts?.ready;
  const cols = 5;
  const rows = 7;
  const per = cols * rows;
  const pages: PdfPage[] = [];
  for (let start = 0; start < Math.max(1, photos.length); start += per) {
    const p = page(opts.paper);
    const m = p.px(0.4);
    p.ctx.fillStyle = '#1f1d1a';
    p.ctx.font = `${p.px(0.28)}px ${SERIF}`;
    p.ctx.fillText(opts.title || 'Contact sheet', m, m + p.px(0.2));
    p.ctx.textAlign = 'right';
    p.ctx.font = `${p.px(0.11)}px ${MONO}`;
    p.ctx.fillStyle = '#7a7062';
    p.ctx.fillText(`${photos.length} FRAMES · SHEET ${Math.floor(start / per) + 1}/${Math.max(1, Math.ceil(photos.length / per))}`, p.c.width - m, m + p.px(0.2));
    p.ctx.textAlign = 'left';
    const top = m + p.px(0.45);
    const stripH = (p.c.height - top - m) / rows;
    const fw = (p.c.width - m * 2) / cols;
    for (let r = 0; r < rows; r += 1) {
      const y = top + r * stripH;
      const items = photos.slice(start + r * cols, start + r * cols + cols);
      if (!items.length) break;
      // the strip: black film with sprocket holes along both edges
      p.ctx.fillStyle = '#141210';
      p.ctx.fillRect(m, y, fw * items.length, stripH * 0.92);
      p.ctx.fillStyle = '#f2ead9';
      const hole = stripH * 0.05;
      for (let x = m + hole; x < m + fw * items.length - hole; x += hole * 2.4) {
        p.ctx.fillRect(x, y + hole * 0.6, hole, hole * 0.9);
        p.ctx.fillRect(x, y + stripH * 0.92 - hole * 1.5, hole, hole * 0.9);
      }
      for (let i = 0; i < items.length; i += 1) {
        const x = m + i * fw;
        const img = await loadImage(items[i].blob);
        cover(p.ctx, img, x + fw * 0.06, y + stripH * 0.14, fw * 0.88, stripH * 0.62);
        p.ctx.fillStyle = '#e6c24a';
        p.ctx.font = `${p.px(0.085)}px ${MONO}`;
        p.ctx.fillText(`${start + r * cols + i + 1}  ▸`, x + fw * 0.06, y + stripH * 0.86);
      }
    }
    pages.push(await toPdfPage(p.c, opts.paper));
  }
  return buildPdf(pages);
}

/* ── printer test page ──────────────────────────────────────────────────────────────────────── */
/** Rulers to measure after printing at 100%: the app then corrects true-size prints by the difference. */
export async function testPagePdf(paper: Paper) {
  await document.fonts?.ready;
  const p = page(paper);
  const m = p.px(0.7);
  p.ctx.fillStyle = '#1f1d1a';
  p.ctx.font = `${p.px(0.32)}px ${SERIF}`;
  p.ctx.fillText('Delineate printer test page', m, m + p.px(0.2));
  p.ctx.font = `${p.px(0.14)}px ${SANS}`;
  p.ctx.fillStyle = '#4c4e43';
  ['Print this page at 100% / "Actual size" (not "Fit to page").', 'Measure the 100 mm line with a ruler, then enter the length in Studio › Frames › Print › Printer test page.'].forEach((t, i) =>
    p.ctx.fillText(t, m, m + p.px(0.6) + i * p.px(0.26)),
  );
  const ruler = (x: number, y: number, lenIn: number, ticks: number, label: string, vertical = false) => {
    p.ctx.strokeStyle = '#111';
    p.ctx.lineWidth = 2;
    p.ctx.beginPath();
    const L = p.px(lenIn);
    if (vertical) {
      p.ctx.moveTo(x, y);
      p.ctx.lineTo(x, y + L);
    } else {
      p.ctx.moveTo(x, y);
      p.ctx.lineTo(x + L, y);
    }
    for (let i = 0; i <= ticks; i += 1) {
      const t = (L * i) / ticks;
      const big = i % (ticks / (label.includes('mm') ? 10 : 4)) === 0;
      const tl = big ? p.px(0.14) : p.px(0.07);
      if (vertical) {
        p.ctx.moveTo(x, y + t);
        p.ctx.lineTo(x + tl, y + t);
      } else {
        p.ctx.moveTo(x + t, y);
        p.ctx.lineTo(x + t, y - tl);
      }
    }
    p.ctx.stroke();
    p.ctx.fillStyle = '#1f1d1a';
    p.ctx.font = `600 ${p.px(0.15)}px ${MONO}`;
    if (vertical) p.ctx.fillText(label, x + p.px(0.22), y + L / 2);
    else p.ctx.fillText(label, x, y + p.px(0.3));
  };
  ruler(m, m + p.px(1.8), 100 * MM, 100, '100 mm');
  ruler(m, m + p.px(2.8), 4, 64, '4 inches');
  ruler(m, m + p.px(3.4), 100 * MM, 100, '100 mm (vertical)', true);
  // a 2-inch square to check the page isn't squashed one way
  p.ctx.strokeStyle = '#111';
  p.ctx.strokeRect(m + p.px(2.2), m + p.px(3.4), p.px(2), p.px(2));
  p.ctx.font = `${p.px(0.13)}px ${MONO}`;
  p.ctx.fillText('2 in square', m + p.px(2.3), m + p.px(3.4) + p.px(1.05));
  return buildPdf([await toPdfPage(p.c, paper)]);
}
