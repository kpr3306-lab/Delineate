import type { FrameStyle, ProcessConfig } from '../types';
import { applyFrame } from './frames';
import { buildPdf } from './pdf';
import { packPrints, type PrintItem } from './print';
import { printScale } from './printProjects';
import { renderProcessed } from './process';
import { canvasToBlob, loadImage } from './utils';

const PRINT_DPI = 300; // each print, as stored
const SHEET_DPI = 240; // the page it is laid onto: sharp at arm's length, light enough for a phone

/**
 * The photo crop (width ÷ height) that makes the *framed* print come out at `target` proportions.
 * Frames add their own borders, so this searches: draw the frame round a blank of each candidate shape
 * and measure. Frames that ignore the photo's shape (booth, passport) simply land as close as they can.
 */
export function cropForPrint(border: FrameStyle, caption: string, opts: { scale?: number; paper?: string | null }, target: number) {
  if (border === 'none') return target;
  const framedAspect = (a: number) => {
    const c = document.createElement('canvas');
    c.width = Math.round(a >= 1 ? 1200 : 1200 * a);
    c.height = Math.round(a >= 1 ? 1200 / a : 1200);
    const out = applyFrame(c, border, caption, 0, opts);
    return out.width / out.height;
  };
  let lo = Math.log(0.2);
  let hi = Math.log(5);
  for (let i = 0; i < 22; i += 1) {
    const mid = (lo + hi) / 2;
    if (framedAspect(Math.exp(mid)) < target) lo = mid;
    else hi = mid;
  }
  return Math.exp((lo + hi) / 2);
}

/** One finished print at its true size in pixels (300 dpi), the framed photo filling it exactly. */
export async function renderPrint(image: HTMLImageElement, cfg: ProcessConfig, date: number, inches: { w: number; h: number }): Promise<HTMLCanvasElement> {
  await document.fonts?.ready; // frame captions use the app's own fonts
  const e = cfg.effects;
  const target = inches.w / inches.h;
  const crop = cropForPrint(e.border, e.caption, { scale: e.frameScale, paper: e.framePaper }, target);
  const pxW = Math.round(inches.w * PRINT_DPI);
  const pxH = Math.round(inches.h * PRINT_DPI);
  const framed = renderProcessed(image, { ...cfg, effects: { ...e, aspect: 'free', cropRatio: crop } }, { longSide: Math.max(pxW, pxH), date });
  const out = document.createElement('canvas');
  out.width = pxW;
  out.height = pxH;
  const ctx = out.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, pxW, pxH);
  // fill the print when the framed photo matches its shape (any rounding is a pixel or two of border);
  // frames that can't change shape (booth strip, passport sheet) sit inside it on white instead
  const close = Math.abs(framed.width / framed.height / target - 1) < 0.02;
  const k = (close ? Math.max : Math.min)(pxW / framed.width, pxH / framed.height);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(framed, (pxW - framed.width * k) / 2, (pxH - framed.height * k) / 2, framed.width * k, framed.height * k);
  return out;
}

export type SheetItem = PrintItem & { blob: Blob; name: string };

/** Lay every copy of every print onto pages of `paper` and write the PDF. Sizes in inches. */
export async function buildSheet(items: SheetItem[], paper: { w: number; h: number }, margin: number, gap: number, cutMarks: boolean) {
  const { pages, tooBig } = packPrints(items, paper, margin, gap);
  const images = new Map<string, HTMLImageElement>();
  for (const it of items) if (!tooBig.includes(it.id)) images.set(it.id, await loadImage(it.blob));
  const pdfPages = [];
  for (const page of pages) {
    const c = document.createElement('canvas');
    c.width = Math.round(paper.w * SHEET_DPI);
    c.height = Math.round(paper.h * SHEET_DPI);
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.imageSmoothingQuality = 'high';
    // printer calibration (Printer test page): undo the printer's own shrink or stretch
    const k = printScale();
    if (k !== 1) ctx.setTransform(k, 0, 0, k, ((1 - k) * c.width) / 2, ((1 - k) * c.height) / 2);
    for (const p of page) {
      const img = images.get(p.id)!;
      const x = p.x * SHEET_DPI;
      const y = p.y * SHEET_DPI;
      const w = p.w * SHEET_DPI;
      const h = p.h * SHEET_DPI;
      if (p.rotated) {
        ctx.save();
        ctx.translate(x + w / 2, y + h / 2);
        ctx.rotate(Math.PI / 2);
        ctx.drawImage(img, -h / 2, -w / 2, h, w);
        ctx.restore();
      } else ctx.drawImage(img, x, y, w, h);
      if (cutMarks) {
        // short corner ticks just outside each print: where to cut, without printing over the photo
        const t = 0.12 * SHEET_DPI;
        const o = 0.03 * SHEET_DPI;
        ctx.strokeStyle = 'rgba(0,0,0,0.45)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (const [cx, cy, sx, sy] of [[x, y, -1, -1], [x + w, y, 1, -1], [x, y + h, -1, 1], [x + w, y + h, 1, 1]] as const) {
          ctx.moveTo(cx + sx * o, cy);
          ctx.lineTo(cx + sx * (o + t), cy);
          ctx.moveTo(cx, cy + sy * o);
          ctx.lineTo(cx, cy + sy * (o + t));
        }
        ctx.stroke();
      }
    }
    const blob = await canvasToBlob(c, 'image/jpeg', 0.92);
    pdfPages.push({ jpeg: new Uint8Array(await blob.arrayBuffer()), pxWidth: c.width, pxHeight: c.height, ptWidth: paper.w * 72, ptHeight: paper.h * 72 });
  }
  return { pdf: pdfPages.length ? buildPdf(pdfPages) : null, pages, tooBig };
}
