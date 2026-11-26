// Print projects for Studio › Frames: greeting cards, a photo calendar, a roll contact sheet, and a printer test page.
import type { PhotoRecord } from '../types';
import { buildPdf, type PdfPage } from './pdf';
import { canvasToBlob, loadImage } from './utils';

const DPI = 200;
const MM = 1 / 25.4;
const SERIF = '"Instrument Serif", Georgia, serif';
const MONO = '"DM Mono", ui-monospace, monospace';
const SANS = '"Space Grotesk Variable", system-ui, sans-serif';
const HAND = '"Segoe Print", "Bradley Hand", "Comic Sans MS", cursive';

/* ── printer calibration ────────────────────────────────────────────────────────────────────── */
const CAL = 'delineate-print-scale';
/** Correction for printers that shrink or stretch the page a little, across (x) and down (y); 1 = none. */
export function printScale(): { x: number; y: number } {
  const ok = (v: number) => (v > 0.8 && v < 1.2 ? v : 1);
  try {
    const raw = localStorage.getItem(CAL);
    if (!raw) return { x: 1, y: 1 };
    const v = JSON.parse(raw) as number | { x: number; y: number };
    return typeof v === 'number' ? { x: ok(v), y: ok(v) } : { x: ok(v.x), y: ok(v.y) }; // older saves were one number
  } catch {
    return { x: 1, y: 1 };
  }
}
/** From the test page: what the two 100 mm lines measured on paper (down defaults to across). */
export function setPrintScale(acrossMm: number | null, downMm?: number) {
  const k = (mm: number) => Math.min(1.2, Math.max(0.8, 100 / mm));
  try {
    if (acrossMm === null) localStorage.removeItem(CAL);
    else localStorage.setItem(CAL, JSON.stringify({ x: k(acrossMm), y: k(downMm ?? acrossMm) }));
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
  if (k.x !== 1 || k.y !== 1) ctx.setTransform(k.x, 0, 0, k.y, ((1 - k.x) * c.width) / 2, ((1 - k.y) * c.height) / 2);
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
/**
 * The printer test page: two 100 mm rulers, A across and B down, numbered every centimetre.
 * Printed at 100%, they measure exactly 100 mm on paper; any difference is the printer's own shrink or stretch.
 */
export async function testPagePdf(paper: Paper) {
  await document.fonts?.ready;
  const p = page(paper);
  const m = p.px(0.75);
  const ink = '#1f1d1a';
  p.ctx.fillStyle = ink;
  p.ctx.font = `${p.px(0.34)}px ${SERIF}`;
  p.ctx.fillText('Printer test page', m, m + p.px(0.25));
  p.ctx.font = `${p.px(0.135)}px ${SANS}`;
  p.ctx.fillStyle = '#4c4e43';
  [
    '1. Print this page at 100% — choose “Actual size”, not “Fit to page” or “Shrink to fit”.',
    '2. With a ruler, measure line A (across) and line B (down) from the 0 mark to the 10 mark.',
    '3. In Studio › Frames › More to print › Printer test page, enter both lengths in millimetres.',
    'If both measure exactly 100 mm, your printer is already true to size and nothing needs changing.',
  ].forEach((t, i) => p.ctx.fillText(t, m, m + p.px(0.7) + i * p.px(0.25)));

  const L = p.px(100 * MM);
  const ruler = (x: number, y: number, down: boolean, name: string) => {
    p.ctx.strokeStyle = ink;
    p.ctx.fillStyle = ink;
    p.ctx.lineWidth = 2;
    p.ctx.beginPath();
    if (down) {
      p.ctx.moveTo(x, y);
      p.ctx.lineTo(x, y + L);
    } else {
      p.ctx.moveTo(x, y);
      p.ctx.lineTo(x + L, y);
    }
    for (let mm = 0; mm <= 100; mm += 1) {
      const t = (L * mm) / 100;
      const tl = mm % 10 === 0 ? p.px(0.18) : mm % 5 === 0 ? p.px(0.11) : p.px(0.06);
      if (down) {
        p.ctx.moveTo(x, y + t);
        p.ctx.lineTo(x + tl, y + t);
      } else {
        p.ctx.moveTo(x + t, y);
        p.ctx.lineTo(x + t, y - tl);
      }
    }
    p.ctx.stroke();
    p.ctx.font = `${p.px(0.11)}px ${MONO}`;
    for (let cm = 0; cm <= 10; cm += 1) {
      const t = (L * cm) / 10;
      if (down) {
        p.ctx.textAlign = 'left';
        p.ctx.textBaseline = 'middle';
        p.ctx.fillText(String(cm), x + p.px(0.24), y + t);
      } else {
        p.ctx.textAlign = 'center';
        p.ctx.textBaseline = 'bottom';
        p.ctx.fillText(String(cm), x + t, y - p.px(0.22));
      }
    }
    p.ctx.font = `600 ${p.px(0.2)}px ${SANS}`;
    p.ctx.textAlign = 'left';
    p.ctx.textBaseline = 'alphabetic';
    if (down) p.ctx.fillText(name, x - p.px(0.08), y - p.px(0.25));
    else p.ctx.fillText(name, x + L + p.px(0.2), y + p.px(0.06));
  };
  const top = m + p.px(2.2);
  ruler(m, top, false, 'A  across · 100 mm');
  ruler(m, top + p.px(0.9), true, 'B  down · 100 mm');
  // a 50 mm square: quick visual check that the page isn't squashed one way
  const sq = p.px(50 * MM);
  p.ctx.lineWidth = 1.5;
  p.ctx.strokeRect(m + p.px(1.6), top + p.px(1.2), sq, sq);
  p.ctx.font = `${p.px(0.11)}px ${MONO}`;
  p.ctx.fillText('50 mm square', m + p.px(1.7), top + p.px(1.2) + sq + p.px(0.2));
  return buildPdf([await toPdfPage(p.c, paper)]);
}
