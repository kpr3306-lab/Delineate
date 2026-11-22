import type { JournalBook, PhotoRecord, Yearbook } from '../types';
import { CAMERAS, type CamModel } from './cameras';
import { buildPdf, type PdfPage } from './pdf';
import { canvasToBlob, loadImage } from './utils';

/* Which body took a photo. Newer frames record it; older ones carry the body's name in their note. */
export function cameraOf(p: PhotoRecord): CamModel | undefined {
  if (p.camera) return CAMERAS.find((c) => c.name === p.camera);
  return CAMERAS.find((c) => p.filterName === c.name || p.note?.includes(`${c.name} (`) || p.note?.endsWith(c.name));
}

export type PassportStats = {
  shots: number;
  explored: number;
  perCamera: Map<string, { count: number; first: number; last: number; favorites: number }>;
  topCamera?: CamModel;
  topLook?: string;
  rolls: number;
  favorites: number;
};
const ROLL = 36;
export function passportStats(photos: PhotoRecord[]): PassportStats {
  const perCamera = new Map<string, { count: number; first: number; last: number; favorites: number }>();
  const looks = new Map<string, number>();
  let shots = 0;
  for (const p of photos) {
    const cam = cameraOf(p);
    if (cam) {
      shots += 1;
      const s = perCamera.get(cam.id) ?? { count: 0, first: p.createdAt, last: p.createdAt, favorites: 0 };
      s.count += 1;
      s.first = Math.min(s.first, p.createdAt);
      s.last = Math.max(s.last, p.createdAt);
      if (p.favorite) s.favorites += 1;
      perCamera.set(cam.id, s);
    }
    // a "look" is whatever finished the frame: a Process preset, the darkroom, or the body's own look
    if (p.developed !== false && p.kind === 'still' && p.filterName && !['Imported', 'Original', 'Undeveloped'].includes(p.filterName)) {
      looks.set(p.filterName, (looks.get(p.filterName) ?? 0) + 1);
    }
  }
  const top = [...perCamera.entries()].sort((a, b) => b[1].count - a[1].count)[0];
  const look = [...looks.entries()].sort((a, b) => b[1] - a[1])[0];
  return {
    shots,
    explored: perCamera.size,
    perCamera,
    topCamera: top ? CAMERAS.find((c) => c.id === top[0]) : undefined,
    topLook: look?.[0],
    rolls: Math.floor(shots / ROLL),
    favorites: photos.filter((p) => p.favorite).length,
  };
}

/* Forgotten Frames: older keepers you have not favourited, oldest-forgotten first. Never deletes anything. */
const SEEN_KEY = 'delineate-forgotten-seen';
const DAY = 86400000;
export function readSeen(): Set<string> {
  try {
    return new Set(JSON.parse(window.localStorage.getItem(SEEN_KEY) || '[]'));
  } catch {
    return new Set();
  }
}
export function markSeen(id: string) {
  const seen = readSeen();
  seen.add(id);
  try {
    window.localStorage.setItem(SEEN_KEY, JSON.stringify([...seen].slice(-2000)));
  } catch {
    /* only matters for this visit */
  }
}
export function forgottenFrames(photos: PhotoRecord[], now = Date.now()) {
  const seen = readSeen();
  const pool = photos.filter((p) => p.developed !== false && p.kind !== 'animated' && !p.favorite && !seen.has(p.id));
  const old = pool.filter((p) => now - p.createdAt > 14 * DAY);
  // a young library has nothing two weeks old yet: fall back to its oldest third
  const list = old.length ? old : pool.sort((a, b) => a.createdAt - b.createdAt).slice(0, Math.ceil(pool.length / 3));
  return list.sort((a, b) => a.createdAt - b.createdAt);
}
/* A handful a day: five forgotten frames drawn at random, the same all day (even across reloads). */
const TODAY_KEY = 'delineate-forgotten-today';
export const HANDFUL = 5;
export function drawHandful(photos: PhotoRecord[], fresh = false): string[] {
  const day = new Date().toDateString();
  if (!fresh) {
    try {
      const saved = JSON.parse(window.localStorage.getItem(TODAY_KEY) || 'null');
      if (saved?.day === day && Array.isArray(saved.ids)) return saved.ids;
    } catch {
      /* draw a new one */
    }
  }
  const pool = forgottenFrames(photos).map((p) => p.id);
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const ids = pool.slice(0, HANDFUL);
  try {
    window.localStorage.setItem(TODAY_KEY, JSON.stringify({ day, ids }));
  } catch {
    /* this visit only */
  }
  return ids;
}

/** Same calendar day in earlier years. */
export function onThisDay(photos: PhotoRecord[], now = new Date()) {
  return photos.filter((p) => {
    const d = new Date(p.createdAt);
    return d.getMonth() === now.getMonth() && d.getDate() === now.getDate() && d.getFullYear() < now.getFullYear() && p.developed !== false;
  });
}

/* Yearbook ----------------------------------------------------------------------------------------- */
export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const yearsOf = (photos: PhotoRecord[]) => [...new Set(photos.map((p) => new Date(p.createdAt).getFullYear()))].sort((a, b) => b - a);

/** A first draft: favourites first, then an even spread through the months, up to 36 frames. */
export function draftSelection(photos: PhotoRecord[], year: number, limit = 36) {
  const inYear = photos.filter((p) => new Date(p.createdAt).getFullYear() === year && p.developed !== false && p.kind !== 'animated');
  const picked = inYear.filter((p) => p.favorite);
  const rest = inYear.filter((p) => !p.favorite);
  const byMonth = MONTHS.map((_, m) => rest.filter((p) => new Date(p.createdAt).getMonth() === m));
  for (let round = 0; picked.length < limit && byMonth.some((b) => b.length); round += 1)
    for (const bucket of byMonth) if (bucket.length && picked.length < limit) picked.push(bucket.shift()!);
  return picked.sort((a, b) => a.createdAt - b.createdAt).map((p) => p.id);
}

/* A4 at ~150 dpi */
const PW = 1240;
const PH = 1754;
const PAPER = '#f6f1e6';
const INK = '#23221f';
const SOFT = '#7c766a';

function page() {
  const c = document.createElement('canvas');
  c.width = PW;
  c.height = PH;
  const g = c.getContext('2d')!;
  g.fillStyle = PAPER;
  g.fillRect(0, 0, PW, PH);
  // a faint paper tooth
  for (let i = 0; i < 2600; i += 1) {
    g.fillStyle = `rgba(80,70,50,${Math.random() * 0.035})`;
    g.fillRect(Math.random() * PW, Math.random() * PH, 2, 2);
  }
  return { c, g };
}
function cover(g: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number) {
  const s = Math.max(w / img.naturalWidth, h / img.naturalHeight);
  const sw = w / s;
  const sh = h / s;
  g.drawImage(img, (img.naturalWidth - sw) / 2, (img.naturalHeight - sh) / 2, sw, sh, x, y, w, h);
}
/** A mounted print: white border, soft shadow, caption underneath. */
function print(g: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number, caption: string, rot = 0) {
  g.save();
  g.translate(x + w / 2, y + h / 2);
  g.rotate((rot * Math.PI) / 180);
  g.shadowColor = 'rgba(0,0,0,0.22)';
  g.shadowBlur = 24;
  g.shadowOffsetY = 8;
  g.fillStyle = '#fffdf8';
  g.fillRect(-w / 2, -h / 2, w, h + 70);
  g.shadowColor = 'transparent';
  cover(g, img, -w / 2 + 18, -h / 2 + 18, w - 36, h - 36);
  g.fillStyle = SOFT;
  g.font = 'italic 30px "Instrument Serif", Georgia, serif';
  g.textAlign = 'center';
  g.fillText(caption.slice(0, 40), 0, h / 2 + 34);
  g.restore();
}
const LAYOUTS: [number, number, number, number, number][][] = [
  [[140, 330, 960, 1080, -1]],
  [[110, 300, 620, 560, -2], [510, 900, 620, 560, 2]],
  [[100, 290, 560, 520, -2], [590, 330, 560, 520, 1.5], [330, 920, 600, 560, -1]],
  [[90, 290, 520, 480, -1.5], [630, 300, 520, 480, 2], [100, 900, 520, 480, 1.5], [620, 930, 520, 480, -2]],
];

export type YearbookInput = { book: Yearbook; photos: PhotoRecord[]; journals: JournalBook[] };

/** Every page of the book as a canvas (used for the on-screen preview and the PDF). */
export async function renderYearbook({ book, photos, journals }: YearbookInput, onPage?: (i: number, n: number) => void) {
  const chosen = book.photoIds.map((id) => photos.find((p) => p.id === id)).filter((p): p is PhotoRecord => Boolean(p)).sort((a, b) => a.createdAt - b.createdAt);
  const coverPhoto = photos.find((p) => p.id === book.coverId) ?? chosen.find((p) => p.favorite) ?? chosen[0];
  const months = MONTHS.map((_, m) => chosen.filter((p) => new Date(p.createdAt).getMonth() === m));
  const pagesNeeded = 2 + months.reduce((n, list) => n + Math.ceil(list.length / 4), 0);
  const out: HTMLCanvasElement[] = [];
  let done = 0;
  const tick = () => onPage?.(++done, pagesNeeded);

  // cover
  {
    const { c, g } = page();
    if (coverPhoto) cover(g, await loadImage(coverPhoto.blob), 0, 0, PW, PH * 0.68);
    g.fillStyle = PAPER;
    g.fillRect(0, PH * 0.68, PW, PH * 0.32);
    g.fillStyle = INK;
    g.textAlign = 'center';
    g.font = '400 190px "Instrument Serif", Georgia, serif';
    g.fillText(String(book.year), PW / 2, PH * 0.68 + 220);
    g.font = 'italic 64px "Instrument Serif", Georgia, serif';
    g.fillText(book.title || 'A year, kept', PW / 2, PH * 0.68 + 320);
    g.fillStyle = SOFT;
    g.font = '500 26px "DM Mono", monospace';
    g.fillText((book.subtitle || 'DELINEATE · YEARBOOK').toUpperCase().slice(0, 60), PW / 2, PH * 0.68 + 400);
    out.push(c);
    tick();
  }
  // months
  for (let m = 0; m < 12; m += 1) {
    const list = months[m];
    for (let start = 0; start < list.length; start += 4) {
      const chunk = list.slice(start, start + 4);
      const { c, g } = page();
      g.fillStyle = INK;
      g.textAlign = 'left';
      g.font = '400 120px "Instrument Serif", Georgia, serif';
      g.fillText(MONTHS[m], 100, 190);
      g.fillStyle = SOFT;
      g.font = '500 24px "DM Mono", monospace';
      g.fillText(`${String(m + 1).padStart(2, '0')} / ${book.year}${start ? ' · CONTINUED' : ''}`, 104, 240);
      const layout = LAYOUTS[chunk.length - 1];
      for (let i = 0; i < chunk.length; i += 1) {
        const [x, y, w, h, r] = layout[i];
        const p = chunk[i];
        const d = new Date(p.createdAt);
        print(g, await loadImage(p.blob), x, y, w, h, `${p.name} · ${d.getDate()} ${MONTHS[m].slice(0, 3)}`, r);
      }
      g.fillStyle = SOFT;
      g.textAlign = 'center';
      g.font = '500 22px "DM Mono", monospace';
      g.fillText(String(out.length + 1), PW / 2, PH - 60);
      out.push(c);
      tick();
    }
  }
  // the year in numbers
  {
    const { c, g } = page();
    const inYear = photos.filter((p) => new Date(p.createdAt).getFullYear() === book.year);
    const stats = passportStats(inYear);
    const jy = journals.filter((j) => new Date(j.updatedAt).getFullYear() === book.year);
    g.fillStyle = INK;
    g.textAlign = 'left';
    g.font = '400 110px "Instrument Serif", Georgia, serif';
    g.fillText('The year in numbers', 100, 220);
    const rows: [string, string][] = [
      [String(inYear.length), 'frames kept'],
      [String(stats.shots), 'shot on the camera'],
      [String(stats.explored), stats.explored === 1 ? 'camera explored' : 'cameras explored'],
      [String(stats.favorites), 'favourites'],
      [String(jy.length), jy.length === 1 ? 'journal kept' : 'journals kept'],
    ];
    rows.forEach(([n, label], i) => {
      const y = 420 + i * 200;
      g.fillStyle = INK;
      g.font = '400 140px "Instrument Serif", Georgia, serif';
      g.fillText(n, 100, y);
      g.fillStyle = SOFT;
      g.font = '500 30px "DM Mono", monospace';
      g.fillText(label.toUpperCase(), 100 + Math.max(160, g.measureText(n).width * 4.6), y - 20);
    });
    if (stats.topCamera) {
      g.fillStyle = INK;
      g.font = 'italic 46px "Instrument Serif", Georgia, serif';
      g.fillText(`Most loved camera: ${stats.topCamera.name}`, 100, 1480);
    }
    if (jy.length) {
      g.fillStyle = SOFT;
      g.font = '500 24px "DM Mono", monospace';
      g.fillText(`JOURNALS: ${jy.map((j) => j.title).join(' · ').toUpperCase().slice(0, 80)}`, 100, 1560);
    }
    g.textAlign = 'center';
    g.font = '500 22px "DM Mono", monospace';
    g.fillText('MADE WITH DELINEATE', PW / 2, PH - 60);
    out.push(c);
    tick();
  }
  return out;
}

export async function yearbookPdf(input: YearbookInput, onPage?: (i: number, n: number) => void) {
  const canvases = await renderYearbook(input, onPage);
  const pages: PdfPage[] = [];
  for (const c of canvases) {
    const blob = await canvasToBlob(c, 'image/jpeg', 0.88);
    pages.push({ jpeg: new Uint8Array(await blob.arrayBuffer()), pxWidth: PW, pxHeight: PH, ptWidth: 595.28, ptHeight: 841.89 });
  }
  return buildPdf(pages);
}
