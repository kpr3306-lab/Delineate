// Photo calendars: four page layouts, three date styles, per-page photo placement, and the PDF.
import { cover } from './cardRender';
import { buildPdf, type PdfPage } from './pdf';
import { PAPERS, monthGrid } from './print';
import { canvasToBlob } from './utils';

export type CalLayout = 'classic' | 'fullbleed' | 'polaroid' | 'minimal';
export type CalDates = 'boxes' | 'clean' | 'circles';
export type CalFont = 'serif' | 'script' | 'sans';
export type Pan = { x: number; y: number; zoom: number };
/** page 0 is the cover, pages 1–12 the months from `startMonth` */
export type CalPage = { photoId: string | null; pan: Pan };
export type Cal = {
  year: number;
  startMonth: number;
  monday: boolean;
  paper: 'a4' | 'a5' | 'letter' | 'a3';
  layout: CalLayout;
  dates: CalDates;
  font: CalFont;
  accent: string;
  cover: boolean;
  title: string;
  pages: CalPage[];
};

export const LAYOUTS: { id: CalLayout; label: string; note: string }[] = [
  { id: 'classic', label: 'Classic', note: 'Photo on top, dates below' },
  { id: 'fullbleed', label: 'Full photo', note: 'Photo fills the page, dates on a panel' },
  { id: 'polaroid', label: 'Polaroid', note: 'A tilted instant print above the dates' },
  { id: 'minimal', label: 'Minimal', note: 'A framed photo and lots of white space' },
];
export const DATE_STYLES: { id: CalDates; label: string }[] = [
  { id: 'boxes', label: 'Boxes' },
  { id: 'clean', label: 'Clean' },
  { id: 'circles', label: 'Circles' },
];
export const CAL_FONTS: { id: CalFont; label: string; css: string }[] = [
  { id: 'serif', label: 'Serif', css: '"Instrument Serif", Georgia, serif' },
  { id: 'script', label: 'Script', css: '"Great Vibes", "Segoe Script", cursive' },
  { id: 'sans', label: 'Sans', css: '"Space Grotesk Variable", system-ui, sans-serif' },
];
export const ACCENTS = ['#c65d36', '#b3364a', '#2f6f6a', '#3f5fa8', '#9a7a3a', '#1f1d1a'];
const MONO = '"DM Mono", ui-monospace, monospace';
const SANS = '"Space Grotesk Variable", system-ui, sans-serif';
const INK = '#1f1d1a';
const MUTED = '#7a7062';

export const paperOf = (c: Cal) => PAPERS.find((p) => p.id === c.paper)!;
/** The month and year a page shows (page 1 = the start month). */
export const pageMonth = (c: Cal, page: number) => {
  const i = page - 1;
  return { month: (c.startMonth + i) % 12, year: c.year + Math.floor((c.startMonth + i) / 12) };
};
export const pageLabel = (c: Cal, page: number) => (page === 0 ? 'Cover' : new Date(2024, pageMonth(c, page).month, 1).toLocaleDateString(undefined, { month: 'short' }));
/** Which pages are printed: the cover only when it is switched on. */
export const printedPages = (c: Cal) => (c.cover ? [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);

function photoBox(ctx: CanvasRenderingContext2D, img: HTMLImageElement | null, x: number, y: number, w: number, h: number, pan: Pan, u: number) {
  if (img) cover(ctx, img, x, y, w, h, 0, pan);
  else {
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.07)';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.font = `${3.4 * u}px ${SANS}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Choose a photo', x + w / 2, y + h / 2);
    ctx.restore();
  }
}

/** The month's date grid in one of three styles, filling the box. */
function dateGrid(ctx: CanvasRenderingContext2D, c: Cal, month: number, year: number, box: { x: number; y: number; w: number; h: number }, u: number, light = false) {
  const weeks = monthGrid(year, month, c.monday);
  const names = Array.from({ length: 7 }, (_, i) => new Date(2023, 0, (c.monday ? 2 : 1) + i).toLocaleDateString(undefined, { weekday: 'short' }));
  const weekend = (d: number) => (c.monday ? d >= 5 : d === 0 || d === 6);
  const ink = light ? '#ffffff' : INK;
  const cw = box.w / 7;
  const head = 4.2 * u;
  const rh = (box.h - head) / weeks.length;
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `${2.7 * u}px ${MONO}`;
  names.forEach((n, d) => {
    ctx.fillStyle = weekend(d) ? c.accent : light ? 'rgba(255,255,255,0.8)' : MUTED;
    ctx.fillText(n.toUpperCase(), box.x + cw * d + cw / 2, box.y + head / 2);
  });
  weeks.forEach((week, r) =>
    week.forEach((day, d) => {
      const x = box.x + cw * d;
      const y = box.y + head + rh * r;
      if (c.dates === 'boxes') {
        ctx.strokeStyle = light ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.13)';
        ctx.lineWidth = Math.max(1, u * 0.12);
        ctx.strokeRect(x, y, cw, rh);
      }
      if (!day) return;
      const size = Math.min(rh, cw) * (c.dates === 'boxes' ? 0.46 : c.dates === 'circles' ? 0.5 : 0.54);
      ctx.font = `${c.dates === 'clean' ? '' : '500 '}${size}px ${SANS}`;
      if (c.dates === 'boxes') {
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillStyle = weekend(d) ? c.accent : ink;
        ctx.fillText(String(day), x + cw * 0.1, y + rh * 0.1);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
      } else if (c.dates === 'circles') {
        ctx.beginPath();
        ctx.arc(x + cw / 2, y + rh / 2, Math.min(cw, rh) * 0.42, 0, Math.PI * 2);
        ctx.fillStyle = weekend(d) ? c.accent : light ? 'rgba(255,255,255,0.16)' : 'rgba(0,0,0,0.06)';
        ctx.fill();
        ctx.fillStyle = weekend(d) ? '#ffffff' : ink;
        ctx.fillText(String(day), x + cw / 2, y + rh / 2);
      } else {
        ctx.fillStyle = weekend(d) ? c.accent : ink;
        ctx.fillText(String(day), x + cw / 2, y + rh / 2);
      }
    }),
  );
  ctx.restore();
}

function monthTitle(ctx: CanvasRenderingContext2D, c: Cal, month: number, year: number, x: number, y: number, u: number, align: CanvasTextAlign = 'left', light = false) {
  const css = CAL_FONTS.find((f) => f.id === c.font)!.css;
  const name = new Date(year, month, 1).toLocaleDateString(undefined, { month: 'long' });
  ctx.save();
  ctx.textAlign = align;
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = light ? '#ffffff' : INK;
  ctx.font = `${(c.font === 'script' ? 11 : 9) * u}px ${css}`;
  ctx.fillText(c.font === 'sans' ? name.toUpperCase() : name, x, y);
  const w = ctx.measureText(c.font === 'sans' ? name.toUpperCase() : name).width;
  ctx.font = `${2.6 * u}px ${MONO}`;
  ctx.fillStyle = light ? 'rgba(255,255,255,0.85)' : c.accent;
  const yx = align === 'center' ? x : align === 'right' ? x : x + w + 2.4 * u;
  ctx.textAlign = align === 'left' ? 'left' : align;
  ctx.fillText(String(year), yx, align === 'left' ? y : y + 4.2 * u);
  ctx.restore();
}

/** Draw one page (0 = cover) at W×H px. */
export function drawCalPage(ctx: CanvasRenderingContext2D, W: number, H: number, c: Cal, page: number, img: HTMLImageElement | null) {
  const u = W / 100;
  const pan = c.pages[page]?.pan ?? { x: 0, y: 0, zoom: 1 };
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);
  if (page === 0) {
    photoBox(ctx, img, 0, 0, W, H * 0.78, pan, u);
    const css = CAL_FONTS.find((f) => f.id === c.font)!.css;
    ctx.fillStyle = INK;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.font = `${(c.font === 'script' ? 15 : 12) * u}px ${css}`;
    ctx.fillText(c.title || String(c.year), W / 2, H * 0.9, W * 0.86);
    ctx.font = `${2.6 * u}px ${MONO}`;
    ctx.fillStyle = c.accent;
    ctx.fillText(`${c.year} · DELINEATE`, W / 2, H * 0.95);
    return;
  }
  const { month, year } = pageMonth(c, page);
  const m = 6 * u;
  if (c.layout === 'classic') {
    photoBox(ctx, img, m, m, W - m * 2, H * 0.52, pan, u);
    const top = m + H * 0.52 + 11 * u;
    monthTitle(ctx, c, month, year, m, top, u);
    dateGrid(ctx, c, month, year, { x: m, y: top + 4 * u, w: W - m * 2, h: H - top - 4 * u - m }, u);
  } else if (c.layout === 'fullbleed') {
    photoBox(ctx, img, 0, 0, W, H, pan, u);
    const py = H * 0.6;
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.fillRect(m, py, W - m * 2, H - py - m);
    monthTitle(ctx, c, month, year, m + 4 * u, py + 10 * u, u);
    dateGrid(ctx, c, month, year, { x: m + 3 * u, y: py + 13 * u, w: W - m * 2 - 6 * u, h: H - py - m - 16 * u }, u);
  } else if (c.layout === 'polaroid') {
    ctx.fillStyle = '#f6f1e7';
    ctx.fillRect(0, 0, W, H);
    const pw = W * 0.72;
    const ph = pw * 1.04;
    ctx.save();
    ctx.translate(W / 2, m + ph / 2 + 2 * u);
    ctx.rotate(-0.035);
    ctx.shadowColor = 'rgba(0,0,0,0.25)';
    ctx.shadowBlur = 3 * u;
    ctx.shadowOffsetY = u;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(-pw / 2, -ph / 2, pw, ph);
    ctx.shadowColor = 'transparent';
    const b = pw * 0.06;
    photoBox(ctx, img, -pw / 2 + b, -ph / 2 + b, pw - b * 2, pw - b * 2, pan, u);
    ctx.restore();
    const top = m + ph + 15 * u;
    monthTitle(ctx, c, month, year, W / 2, top, u, 'center');
    dateGrid(ctx, c, month, year, { x: m, y: top + 7 * u, w: W - m * 2, h: H - top - 7 * u - m }, u);
  } else {
    // minimal: a framed photo, centred, with room to breathe
    const pw = W * 0.62;
    const ph = pw * 0.8;
    const px = (W - pw) / 2;
    const py = 10 * u;
    photoBox(ctx, img, px, py, pw, ph, pan, u);
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.lineWidth = Math.max(1, u * 0.15);
    ctx.strokeRect(px - 1.6 * u, py - 1.6 * u, pw + 3.2 * u, ph + 3.2 * u);
    const top = py + ph + 15 * u;
    monthTitle(ctx, c, month, year, W / 2, top, u, 'center');
    dateGrid(ctx, c, month, year, { x: W * 0.12, y: top + 8 * u, w: W * 0.76, h: H - top - 8 * u - 10 * u }, u);
  }
}

/** Where the photo sits on a page (0..1 of the page), for dragging it in the editor. */
export function photoRect(c: Cal, page: number, aspect: number) {
  if (page === 0) return { x: 0, y: 0, w: 1, h: 0.78 };
  if (c.layout === 'fullbleed') return { x: 0, y: 0, w: 1, h: 1 };
  if (c.layout === 'classic') return { x: 0.06, y: 0.06 / aspect, w: 0.88, h: 0.52 };
  if (c.layout === 'polaroid') return { x: 0.18, y: 0.06 / aspect, w: 0.64, h: (0.72 * 1.04) / aspect };
  return { x: 0.19, y: 0.1 / aspect, w: 0.62, h: (0.62 * 0.8) / aspect };
}

/** The whole calendar as a PDF at the chosen paper size. */
export async function calendarPdf(c: Cal, image: (page: number) => Promise<HTMLImageElement | null>) {
  await document.fonts?.ready;
  const paper = paperOf(c);
  const DPI = 200;
  const pages: PdfPage[] = [];
  for (const p of printedPages(c)) {
    const cv = document.createElement('canvas');
    cv.width = Math.round(paper.w * DPI);
    cv.height = Math.round(paper.h * DPI);
    drawCalPage(cv.getContext('2d')!, cv.width, cv.height, c, p, await image(p));
    const blob = await canvasToBlob(cv, 'image/jpeg', 0.9);
    pages.push({ jpeg: new Uint8Array(await blob.arrayBuffer()), pxWidth: cv.width, pxHeight: cv.height, ptWidth: paper.w * 72, ptHeight: paper.h * 72 });
  }
  return buildPdf(pages);
}
