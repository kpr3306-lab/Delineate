import type { CSSProperties } from 'react';
import type { JItem, JPage, JournalBook, PaperKind, PhotoRecord } from '../types';
import { decoUrl, PAGE_H, PAGE_W } from './decos';
import { buildPdf } from './pdf';
import { canvasToBlob, loadImage } from './utils';

export const FONT_FAMILY: Record<string, string> = {
  serif: '"Instrument Serif", Georgia, serif',
  sans: '"Space Grotesk Variable", "Space Grotesk", sans-serif',
  mono: '"DM Mono", "Courier New", monospace',
  hand: '"Segoe Print", "Bradley Hand", "Comic Sans MS", cursive',
};

/** CSS background for each paper — mirrored by paintPaper() for the PDF. */
export function paperCss(paper: PaperKind, bg: string): CSSProperties {
  const line = 'rgba(70, 110, 170, 0.22)';
  switch (paper) {
    case 'lined':
      return { backgroundColor: bg, backgroundImage: `linear-gradient(90deg, transparent 58px, rgba(220,80,80,.35) 58px 60px, transparent 60px), repeating-linear-gradient(180deg, transparent 0 31px, ${line} 31px 32px)` };
    case 'grid':
      return { backgroundColor: bg, backgroundImage: `repeating-linear-gradient(90deg, ${line} 0 1px, transparent 1px 24px), repeating-linear-gradient(180deg, ${line} 0 1px, transparent 1px 24px)` };
    case 'dots':
      return { backgroundColor: bg, backgroundImage: 'radial-gradient(circle, rgba(0,0,0,.18) 1.2px, transparent 1.6px)', backgroundSize: '24px 24px' };
    case 'kraft':
      return { backgroundColor: bg, backgroundImage: 'radial-gradient(circle at 20% 30%, rgba(90,60,20,.12), transparent 40%), radial-gradient(circle at 80% 70%, rgba(90,60,20,.1), transparent 45%)' };
    case 'watercolor':
      return { backgroundColor: bg, backgroundImage: 'radial-gradient(ellipse at 15% 20%, rgba(150,190,170,.28), transparent 45%), radial-gradient(ellipse at 85% 80%, rgba(220,170,150,.25), transparent 45%), radial-gradient(ellipse at 70% 15%, rgba(190,180,220,.2), transparent 40%)' };
    default:
      return { backgroundColor: bg };
  }
}

function paintPaper(ctx: CanvasRenderingContext2D, paper: PaperKind, bg: string) {
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, PAGE_W, PAGE_H);
  const line = 'rgba(70, 110, 170, 0.22)';
  if (paper === 'lined') {
    ctx.fillStyle = line;
    for (let y = 31; y < PAGE_H; y += 32) ctx.fillRect(0, y, PAGE_W, 1);
    ctx.fillStyle = 'rgba(220,80,80,.35)';
    ctx.fillRect(58, 0, 2, PAGE_H);
  } else if (paper === 'grid') {
    ctx.fillStyle = line;
    for (let x = 0; x < PAGE_W; x += 24) ctx.fillRect(x, 0, 1, PAGE_H);
    for (let y = 0; y < PAGE_H; y += 24) ctx.fillRect(0, y, PAGE_W, 1);
  } else if (paper === 'dots') {
    ctx.fillStyle = 'rgba(0,0,0,.18)';
    for (let x = 12; x < PAGE_W; x += 24)
      for (let y = 12; y < PAGE_H; y += 24) {
        ctx.beginPath();
        ctx.arc(x, y, 1.2, 0, Math.PI * 2);
        ctx.fill();
      }
  } else if (paper === 'kraft' || paper === 'watercolor') {
    const blobs: [number, number, string][] =
      paper === 'kraft'
        ? [[0.2, 0.3, 'rgba(90,60,20,.12)'], [0.8, 0.7, 'rgba(90,60,20,.1)']]
        : [[0.15, 0.2, 'rgba(150,190,170,.28)'], [0.85, 0.8, 'rgba(220,170,150,.25)'], [0.7, 0.15, 'rgba(190,180,220,.2)']];
    blobs.forEach(([fx, fy, color]) => {
      const g = ctx.createRadialGradient(fx * PAGE_W, fy * PAGE_H, 0, fx * PAGE_W, fy * PAGE_H, PAGE_W * 0.45);
      g.addColorStop(0, color);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, PAGE_W, PAGE_H);
    });
  }
}

export function doodlePath(points: number[]) {
  if (points.length < 4) return '';
  let d = `M${points[0]} ${points[1]}`;
  for (let i = 2; i < points.length - 2; i += 2) {
    // smooth through midpoints
    const mx = (points[i] + points[i + 2]) / 2;
    const my = (points[i + 1] + points[i + 3]) / 2;
    d += ` Q${points[i]} ${points[i + 1]} ${mx} ${my}`;
  }
  return `${d} L${points[points.length - 2]} ${points[points.length - 1]}`;
}

function wrap(ctx: CanvasRenderingContext2D, text: string, width: number) {
  const lines: string[] = [];
  text.split('\n').forEach((para) => {
    let line = '';
    para.split(' ').forEach((word) => {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width > width && line) {
        lines.push(line);
        line = word;
      } else line = test;
    });
    lines.push(line);
  });
  return lines;
}

function coverDraw(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number) {
  const s = Math.max(w / img.naturalWidth, h / img.naturalHeight);
  const sw = w / s;
  const sh = h / s;
  ctx.drawImage(img, (img.naturalWidth - sw) / 2, (img.naturalHeight - sh) / 2, sw, sh, x, y, w, h);
}

async function drawItem(ctx: CanvasRenderingContext2D, item: JItem, photos: Map<string, PhotoRecord>) {
  const { w, h } = item;
  ctx.save();
  ctx.translate(item.x + w / 2, item.y + h / 2);
  ctx.rotate((item.r * Math.PI) / 180);
  ctx.translate(-w / 2, -h / 2);
  if (item.type === 'text') {
    if (item.label === 'highlight') {
      ctx.fillStyle = 'rgba(255, 230, 90, 0.6)';
      ctx.fillRect(0, h * 0.15, w, h * 0.75);
    } else if (item.label === 'tape') {
      ctx.fillStyle = 'rgba(232, 217, 176, 0.85)';
      ctx.fillRect(0, 0, w, h);
    } else if (item.label === 'tag') {
      ctx.strokeStyle = item.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(1, 1, w - 2, h - 2, 10);
      ctx.stroke();
    }
    ctx.fillStyle = item.color;
    ctx.font = `${item.size}px ${FONT_FAMILY[item.font]}`;
    ctx.textBaseline = 'top';
    ctx.textAlign = item.align;
    const pad = item.label === 'none' ? 0 : 8;
    const x = item.align === 'left' ? pad : item.align === 'center' ? w / 2 : w - pad;
    wrap(ctx, item.text, w - pad * 2).forEach((line, i) => ctx.fillText(line, x, pad + i * item.size * 1.2));
  } else if (item.type === 'photo') {
    const rec = item.photoId ? photos.get(item.photoId) : null;
    let ix = 0, iy = 0, iw = w, ih = h;
    if (item.style === 'polaroid') {
      ctx.fillStyle = '#fdfcf8';
      ctx.shadowColor = 'rgba(0,0,0,.25)';
      ctx.shadowBlur = 10;
      ctx.fillRect(0, 0, w, h);
      ctx.shadowColor = 'transparent';
      ix = w * 0.06; iy = w * 0.06; iw = w * 0.88; ih = h - w * 0.06 - h * 0.2;
    } else if (item.style === 'tape') {
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, w, h);
      ix = 6; iy = 6; iw = w - 12; ih = h - 12;
    }
    ctx.save();
    ctx.beginPath();
    if (item.style === 'circle') ctx.ellipse(w / 2, h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
    else ctx.roundRect(ix, iy, iw, ih, item.style === 'round' ? 22 : 0);
    ctx.clip();
    if (rec) coverDraw(ctx, await loadImage(rec.blob), ix, iy, iw, ih);
    else {
      ctx.fillStyle = 'rgba(0,0,0,.08)';
      ctx.fillRect(ix, iy, iw, ih);
    }
    ctx.restore();
    if (item.style === 'tape') {
      ctx.fillStyle = 'rgba(232, 217, 176, 0.85)';
      ctx.save();
      ctx.translate(w / 2, 0);
      ctx.rotate(-0.05);
      ctx.fillRect(-w * 0.18, -12, w * 0.36, 24);
      ctx.restore();
    }
  } else if (item.type === 'deco') {
    ctx.drawImage(await loadImage(decoUrl(item.deco, item.color)), 0, 0, w, h);
  } else {
    ctx.scale(w / item.vw, h / item.vh);
    ctx.globalAlpha = item.alpha;
    ctx.strokeStyle = item.color;
    ctx.lineWidth = item.width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke(new Path2D(doodlePath(item.points)));
  }
  ctx.restore();
}

export async function renderPage(page: JPage, photos: Map<string, PhotoRecord>, scale = 2) {
  const canvas = document.createElement('canvas');
  canvas.width = PAGE_W * scale;
  canvas.height = PAGE_H * scale;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(scale, scale);
  paintPaper(ctx, page.paper, page.bg);
  for (const item of page.items) {
    try {
      await drawItem(ctx, item, photos);
    } catch (error) {
      console.warn('Skipped an item while exporting', error);
    }
  }
  return canvas;
}

export async function exportBookPdf(book: JournalBook, photos: Map<string, PhotoRecord>, onProgress?: (p: number) => void) {
  await document.fonts?.ready;
  const pages = [];
  for (let i = 0; i < book.pages.length; i += 1) {
    const canvas = await renderPage(book.pages[i], photos);
    const blob = await canvasToBlob(canvas, 'image/jpeg', 0.9);
    pages.push({ jpeg: new Uint8Array(await blob.arrayBuffer()), pxWidth: canvas.width, pxHeight: canvas.height, ptWidth: 450, ptHeight: 600 });
    onProgress?.((i + 1) / book.pages.length);
  }
  return buildPdf(pages);
}
