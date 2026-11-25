import { importedRecord } from '../lib/importPhoto';
import { BringToFront, Check, Copy, Download, ImagePlus, LayoutGrid, Save, SendToBack, Shuffle, Smile, Sticker, Trash2, Type, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import type { PhotoRecord } from '../types';
import { FONT_FAMILY } from '../lib/journalRender';
import { DECO_CATS, DECOS, decoUrl, getDeco } from '../lib/decos';
import { canvasToBlob, clamp, downloadBlob, loadImage, pad, uid } from '../lib/utils';
import { haptic, playPop, playSuccess } from '../lib/audio';
import { Modal, PhotoPicker, Range, Thumb, Toggle } from './ui';

type CollageViewProps = {
  photos: PhotoRecord[];
  onSave: (record: PhotoRecord) => Promise<void>;
  notify: (message: string, tone?: 'default' | 'warning', action?: { label: string; run: () => void }) => void;
  /** Open a saved collage in Studio › Frames. */
  onFrame?: (record: PhotoRecord) => void;
};

type Rect = [number, number, number, number, number?]; // x, y, w, h, rotation
const LAYOUTS: { id: string; name: string; cells: Rect[]; scatter?: boolean }[] = [
  { id: 'duo', name: 'Duo', cells: [[0, 0, 0.5, 1], [0.5, 0, 0.5, 1]] },
  { id: 'stack', name: 'Stack', cells: [[0, 0, 1, 0.5], [0, 0.5, 1, 0.5]] },
  { id: 'grid4', name: 'Grid 4', cells: [[0, 0, 0.5, 0.5], [0.5, 0, 0.5, 0.5], [0, 0.5, 0.5, 0.5], [0.5, 0.5, 0.5, 0.5]] },
  { id: 'grid6', name: 'Grid 6', cells: Array.from({ length: 6 }, (_, i): Rect => [(i % 3) / 3, Math.floor(i / 3) / 2, 1 / 3, 0.5]) },
  { id: 'grid9', name: 'Grid 9', cells: Array.from({ length: 9 }, (_, i): Rect => [(i % 3) / 3, Math.floor(i / 3) / 3, 1 / 3, 1 / 3]) },
  { id: 'heroL', name: 'Hero left', cells: [[0, 0, 0.62, 1], [0.62, 0, 0.38, 0.5], [0.62, 0.5, 0.38, 0.5]] },
  { id: 'heroT', name: 'Hero top', cells: [[0, 0, 1, 0.6], [0, 0.6, 1 / 3, 0.4], [1 / 3, 0.6, 1 / 3, 0.4], [2 / 3, 0.6, 1 / 3, 0.4]] },
  { id: 'triptych', name: 'Triptych', cells: [[0, 0, 1 / 3, 1], [1 / 3, 0, 1 / 3, 1], [2 / 3, 0, 1 / 3, 1]] },
  { id: 'strip', name: 'Booth strip', cells: Array.from({ length: 4 }, (_, i): Rect => [0, i / 4, 1, 0.25]) },
  { id: 'filmstrip', name: 'Film strip', cells: Array.from({ length: 4 }, (_, i): Rect => [i / 4, 0.12, 0.25, 0.76]) },
  { id: 'mosaic', name: 'Mosaic', cells: [[0, 0, 0.5, 0.6], [0.5, 0, 0.5, 0.35], [0.5, 0.35, 0.25, 0.25], [0.75, 0.35, 0.25, 0.25], [0, 0.6, 0.35, 0.4], [0.35, 0.6, 0.65, 0.4]] },
  { id: 'magazine', name: 'Magazine', cells: [[0, 0, 1, 0.58], [0, 0.58, 0.5, 0.42], [0.5, 0.58, 0.5, 0.42]] },
  { id: 'scatter', name: 'Scatter', scatter: true, cells: [[0.04, 0.05, 0.52, 0.46, -8], [0.44, 0.08, 0.5, 0.44, 6], [0.08, 0.5, 0.48, 0.44, 4], [0.47, 0.52, 0.48, 0.43, -5]] },
];

const RATIOS = { '1:1': 1, '4:5': 4 / 5, '9:16': 9 / 16, '3:2': 3 / 2, '16:9': 16 / 9 } as const;
type Ratio = keyof typeof RATIOS;

type Cell = {
  photoId: string | null;
  zoom: number;
  /** pan inside the frame, -1..1 of the overflow */
  ox: number;
  oy: number;
  /** frame size as a multiple of its layout slot, scaled about the slot's centre */
  sw?: number;
  sh?: number;
  /** free placement: offset from the slot as a fraction of the canvas, plus extra rotation in degrees */
  dx?: number;
  dy?: number;
  rot?: number;
  hidden?: boolean;
  /** quick edits drawn with a canvas filter */
  look?: CellLook;
};
type CellLook = { b: number; c: number; s: number; g: number; p: number; h: number };
const PLAIN: CellLook = { b: 1, c: 1, s: 1, g: 0, p: 0, h: 0 };
const LOOKS: { name: string; look: CellLook }[] = [
  { name: 'Original', look: PLAIN },
  { name: 'B&W', look: { ...PLAIN, g: 1, c: 1.15 } },
  { name: 'Sepia', look: { ...PLAIN, p: 0.85, c: 1.05 } },
  { name: 'Vivid', look: { ...PLAIN, s: 1.45, c: 1.12 } },
  { name: 'Fade', look: { ...PLAIN, b: 1.08, c: 0.82, s: 0.8 } },
  { name: 'Warm', look: { ...PLAIN, p: 0.3, s: 1.15, h: -8 } },
  { name: 'Cool', look: { ...PLAIN, s: 0.9, h: 14, b: 1.03 } },
  { name: 'Noir', look: { ...PLAIN, g: 1, c: 1.5, b: 0.9 } },
];
const lookCss = (l: CellLook = PLAIN) =>
  `brightness(${l.b}) contrast(${l.c}) saturate(${l.s}) grayscale(${l.g}) sepia(${l.p}) hue-rotate(${l.h}deg)`;
const sameLook = (a: CellLook = PLAIN, b: CellLook) => (Object.keys(PLAIN) as (keyof CellLook)[]).every((k) => Math.abs(a[k] - b[k]) < 1e-6);
/** Something laid on top of the collage. Position is the centre as a fraction of the canvas; size is a fraction of its width. */
type Overlay = {
  id: string;
  kind: 'emoji' | 'deco' | 'text';
  value: string; // the emoji, the decoration id, or the text
  x: number;
  y: number;
  size: number;
  r: number;
  color: string;
  font: keyof typeof FONT_FAMILY;
  label: 'none' | 'pill' | 'highlight';
};
type Cfg = {
  layout: string;
  ratio: Ratio;
  gap: number;
  padding: number;
  radius: number;
  bg: string;
  frame: boolean;
  shadow: boolean;
  caption: string;
  font: keyof typeof FONT_FAMILY;
  ink: string;
  cells: Cell[];
  items: Overlay[];
};

const EMOJI = [
  '😀', '😂', '🥰', '😎', '🤩', '🥳', '😭', '😴', '🫶', '👍', '✌️', '👑',
  '❤️', '🧡', '💛', '💚', '💙', '💜', '🤍', '✨', '⭐', '🌟', '💫', '🔥',
  '🌈', '☀️', '🌙', '☁️', '❄️', '🌸', '🌼', '🌻', '🌷', '🍀', '🍂', '🌊',
  '🏝️', '⛰️', '🏙️', '🎡', '📸', '🎞️', '🎥', '🎧', '🎶', '📚', '☕', '🍦',
  '🍕', '🍓', '🍒', '🎂', '🎉', '🎈', '🎁', '💌', '✈️', '🚲', '🧳', '📍',
  '🐶', '🐱', '🦋', '🐚', '💎', '🕯️',
];
const EMOJI_FONT = '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
const INKS = ['#20231d', '#ffffff', '#c65d36', '#e2566e', '#f2c14e', '#5b8bd9', '#5f8a4e', '#8d6fd1'];
const LIBRARY_TABS = ['Emoji', ...DECO_CATS.filter((c) => c !== 'Stickers')];

let measurer: CanvasRenderingContext2D | null = null;
/** Size of an overlay in canvas pixels, before rotation. Text is measured, so it needs a 2D context. */
function overlayBox(o: Overlay, W: number) {
  const fs = o.size * W;
  if (o.kind === 'deco') {
    const d = getDeco(o.value);
    return { w: fs, h: (fs * d.h) / d.w, fs };
  }
  if (o.kind === 'emoji') return { w: fs * 1.2, h: fs * 1.2, fs };
  measurer ??= document.createElement('canvas').getContext('2d')!;
  measurer.font = `${fs}px ${FONT_FAMILY[o.font]}`;
  const lines = (o.value || ' ').split('\n');
  const padX = o.label === 'none' ? 0 : fs * 0.5;
  const padY = o.label === 'none' ? 0 : fs * 0.25;
  return { w: Math.max(...lines.map((l) => measurer!.measureText(l).width)) + padX * 2, h: lines.length * fs * 1.2 + padY * 2, fs };
}

function drawOverlay(ctx: CanvasRenderingContext2D, o: Overlay, W: number, H: number, decoImgs: Map<string, HTMLImageElement>, selected: boolean) {
  const { w, h, fs } = overlayBox(o, W);
  ctx.save();
  ctx.translate(o.x * W, o.y * H);
  ctx.rotate((o.r * Math.PI) / 180);
  if (o.kind === 'deco') {
    const img = decoImgs.get(decoUrl(o.value, o.color));
    if (img) ctx.drawImage(img, -w / 2, -h / 2, w, h);
  } else if (o.kind === 'emoji') {
    ctx.font = `${fs}px ${EMOJI_FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(o.value, 0, fs * 0.06);
  } else {
    if (o.label === 'pill') {
      ctx.fillStyle = '#fbf7ec';
      ctx.shadowColor = 'rgba(0,0,0,0.25)';
      ctx.shadowBlur = fs * 0.3;
      ctx.shadowOffsetY = fs * 0.08;
      ctx.beginPath();
      ctx.roundRect(-w / 2, -h / 2, w, h, Math.min(h / 2, fs * 0.7));
      ctx.fill();
      ctx.shadowColor = 'transparent';
    } else if (o.label === 'highlight') {
      ctx.fillStyle = 'rgba(255, 226, 80, 0.7)';
      ctx.fillRect(-w / 2, -h / 2 + h * 0.18, w, h * 0.7);
    }
    ctx.fillStyle = o.color;
    ctx.font = `${fs}px ${FONT_FAMILY[o.font]}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const lines = (o.value || ' ').split('\n');
    lines.forEach((line, i) => ctx.fillText(line, 0, (i - (lines.length - 1) / 2) * fs * 1.2));
  }
  if (selected) {
    const pad = 8 * (W / BASE);
    ctx.strokeStyle = '#ff8a2a';
    ctx.lineWidth = 3 * (W / BASE);
    ctx.setLineDash([10 * (W / BASE), 7 * (W / BASE)]);
    ctx.strokeRect(-w / 2 - pad, -h / 2 - pad, w + pad * 2, h + pad * 2);
  }
  ctx.restore();
}

/** Topmost overlay under a canvas point (rotation-aware), with a little slop for fingers. */
function hitOverlay(items: Overlay[], px: number, py: number, W: number, H: number) {
  const slop = 10 * (W / BASE);
  for (let i = items.length - 1; i >= 0; i -= 1) {
    const o = items[i];
    const { w, h } = overlayBox(o, W);
    const a = (-o.r * Math.PI) / 180;
    const dx = px - o.x * W;
    const dy = py - o.y * H;
    const lx = dx * Math.cos(a) - dy * Math.sin(a);
    const ly = dx * Math.sin(a) + dy * Math.cos(a);
    if (Math.abs(lx) <= w / 2 + slop && Math.abs(ly) <= h / 2 + slop) return o;
  }
  return null;
}

const STYLES: { name: string; patch: Partial<Cfg> }[] = [
  { name: 'Clean', patch: { bg: '#ffffff', gap: 14, padding: 14, radius: 0, frame: false, shadow: false, ink: '#20231d', font: 'sans' } },
  { name: 'Gallery', patch: { bg: '#f2ead9', gap: 34, padding: 60, radius: 0, frame: false, shadow: true, ink: '#20231d', font: 'serif' } },
  { name: 'Midnight', patch: { bg: '#141414', gap: 10, padding: 24, radius: 16, frame: false, shadow: false, ink: '#f2ead9', font: 'serif' } },
  { name: 'Pastel', patch: { bg: '#f6dfe5', gap: 22, padding: 40, radius: 26, frame: false, shadow: true, ink: '#7a2a3a', font: 'hand' } },
  { name: 'Kraft', patch: { bg: '#c9a97a', gap: 30, padding: 46, radius: 0, frame: true, shadow: true, ink: '#3a2a18', font: 'hand' } },
  { name: 'Film', patch: { bg: '#0e0e0d', gap: 8, padding: 40, radius: 2, frame: false, shadow: false, ink: '#ffb36b', font: 'mono' } },
];
const SWATCHES = ['#ffffff', '#f2ead9', '#141414', '#c9a97a', '#f6dfe5', '#dfe9f6', '#e4efe6', '#c65d36', '#1f2a4a', '#f2c14e'];

const layoutOf = (id: string) => LAYOUTS.find((l) => l.id === id) ?? LAYOUTS[2];
const BASE = 1080;

function cellRects(cfg: Cfg, W: number, H: number) {
  const k = W / BASE;
  const p = cfg.padding * k;
  const band = cfg.caption ? H * 0.1 : 0;
  const area = { x: p, y: p, w: W - p * 2, h: H - p * 2 - band };
  const g = cfg.gap * k;
  return layoutOf(cfg.layout).cells.map(([x, y, w, h, r = 0], i) => {
    const cell = cfg.cells[i];
    const bw = w * area.w - g;
    const bh = h * area.h - g;
    const cw = bw * (cell?.sw ?? 1);
    const ch = bh * (cell?.sh ?? 1);
    return {
      x: area.x + x * area.w + g / 2 + (bw - cw) / 2 + (cell?.dx ?? 0) * W,
      y: area.y + y * area.h + g / 2 + (bh - ch) / 2 + (cell?.dy ?? 0) * H,
      w: cw,
      h: ch,
      r: r + (cell?.rot ?? 0),
      base: { w: bw, h: bh, r },
      hidden: Boolean(cell?.hidden),
    };
  });
}

type FrameRect = ReturnType<typeof cellRects>[number];
/** A canvas point in the frame's own (unrotated, centred) coordinates. */
function toLocal(r: FrameRect, px: number, py: number) {
  const a = (-r.r * Math.PI) / 180;
  const dx = px - (r.x + r.w / 2);
  const dy = py - (r.y + r.h / 2);
  return { lx: dx * Math.cos(a) - dy * Math.sin(a), ly: dx * Math.sin(a) + dy * Math.cos(a) };
}
// handle sizes in screen pixels; `ui` (canvas px per screen px) keeps them finger-sized on any screen
const HANDLE = 8;
const ROTATE_ARM = 26;
/** Where the rotate dot sits (frame-local y): above the frame, or below it when there is no room above the canvas edge. */
function rotateDot(r: FrameRect, ui: number) {
  const below = r.y < (ROTATE_ARM + HANDLE * 1.5) * ui;
  return { y: below ? r.h / 2 + ROTATE_ARM * ui : -r.h / 2 - ROTATE_ARM * ui, edge: below ? r.h / 2 : -r.h / 2, below };
}

function renderCollage(
  cfg: Cfg,
  images: Map<string, HTMLImageElement>,
  W: number,
  selected = -1,
  decoImgs: Map<string, HTMLImageElement> = new Map(),
  selItem: string | null = null,
  ui = 1,
) {
  const H = Math.round(W / RATIOS[cfg.ratio]);
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  const k = W / BASE;
  ctx.fillStyle = cfg.bg;
  ctx.fillRect(0, 0, W, H);
  const layout = layoutOf(cfg.layout);
  if (layout.id === 'filmstrip') {
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    for (let x = 12 * k; x < W; x += 40 * k) {
      ctx.fillRect(x, H * 0.04, 18 * k, H * 0.05);
      ctx.fillRect(x, H * 0.91, 18 * k, H * 0.05);
    }
  }
  const frame = cfg.frame || layout.scatter;
  cellRects(cfg, W, H).forEach((rect, i) => {
    if (rect.hidden) return;
    const cell = cfg.cells[i];
    const img = cell?.photoId ? images.get(cell.photoId) : null;
    ctx.save();
    ctx.translate(rect.x + rect.w / 2, rect.y + rect.h / 2);
    ctx.rotate((rect.r * Math.PI) / 180);
    let { w, h } = rect;
    let ix = -w / 2;
    let iy = -h / 2;
    if (cfg.shadow) {
      ctx.shadowColor = 'rgba(0,0,0,0.35)';
      ctx.shadowBlur = 24 * k;
      ctx.shadowOffsetY = 10 * k;
    }
    if (frame) {
      const b = Math.min(w, h) * 0.05;
      ctx.fillStyle = '#fdfbf6';
      ctx.fillRect(-w / 2, -h / 2, w, h);
      ctx.shadowColor = 'transparent';
      ix += b;
      iy += b;
      w -= b * 2;
      h -= b * (layout.scatter ? 4.5 : 2);
    }
    ctx.beginPath();
    ctx.roundRect(ix, iy, w, h, frame ? 0 : cfg.radius * k);
    if (!frame) ctx.fillStyle = 'rgba(128,128,128,0.18)';
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.clip();
    if (img && cell) {
      const s = Math.max(w / img.naturalWidth, h / img.naturalHeight) * cell.zoom;
      const dw = img.naturalWidth * s;
      const dh = img.naturalHeight * s;
      ctx.filter = lookCss(cell.look);
      ctx.drawImage(img, ix + (w - dw) / 2 + ((dw - w) / 2) * cell.ox, iy + (h - dh) / 2 + ((dh - h) / 2) * cell.oy, dw, dh);
      ctx.filter = 'none';
    } else {
      ctx.fillStyle = 'rgba(128,128,128,0.6)';
      ctx.font = `${40 * k}px ${FONT_FAMILY.sans}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('+', ix + w / 2, iy + h / 2);
    }
    ctx.restore();
  });
  if (cfg.caption) {
    ctx.fillStyle = cfg.ink;
    ctx.font = `${Math.round(H * 0.05)}px ${FONT_FAMILY[cfg.font]}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(cfg.caption, W / 2, H - cfg.padding * k - H * 0.05, W - cfg.padding * k * 2);
  }
  for (const o of cfg.items) drawOverlay(ctx, o, W, H, decoImgs, o.id === selItem);
  // selection last of all, so no frame or sticker drawn later can hide the handles
  const rect = selected >= 0 ? cellRects(cfg, W, H)[selected] : null;
  if (rect && !rect.hidden) {
    // selection: dashed outline, four corner handles to resize, one on a stalk to rotate
    ctx.save();
    ctx.translate(rect.x + rect.w / 2, rect.y + rect.h / 2);
    ctx.rotate((rect.r * Math.PI) / 180);
    ctx.strokeStyle = '#ff8a2a';
    ctx.lineWidth = 2 * ui;
    ctx.setLineDash([6 * ui, 4 * ui]);
    ctx.strokeRect(-rect.w / 2, -rect.h / 2, rect.w, rect.h);
    ctx.setLineDash([]);
    const rd = rotateDot(rect, ui);
    ctx.beginPath();
    ctx.moveTo(0, rd.edge);
    ctx.lineTo(0, rd.y);
    ctx.stroke();
    const dots: [number, number][] = [[-rect.w / 2, -rect.h / 2], [rect.w / 2, -rect.h / 2], [-rect.w / 2, rect.h / 2], [rect.w / 2, rect.h / 2], [0, rd.y]];
    dots.forEach(([hx, hy], d) => {
      ctx.beginPath();
      ctx.arc(hx, hy, HANDLE * ui, 0, Math.PI * 2);
      ctx.fillStyle = d === 4 ? '#ff8a2a' : '#ffffff';
      ctx.fill();
      ctx.lineWidth = 2 * ui;
      ctx.strokeStyle = d === 4 ? '#ffffff' : '#ff8a2a';
      ctx.stroke();
    });
    ctx.restore();
  }
  return canvas;
}

export default function CollageView({ photos, onSave, notify, onFrame }: CollageViewProps) {
  const [cfg, setCfg] = useState<Cfg>(() => ({
    layout: 'grid4',
    ratio: '1:1',
    ...(STYLES[0].patch as Omit<Cfg, 'layout' | 'ratio' | 'caption' | 'cells'>),
    caption: '',
    cells: photos.slice(0, 9).map((p) => ({ photoId: p.id, zoom: 1, ox: 0, oy: 0 })),
    items: [],
  }));
  const [decoImgs, setDecoImgs] = useState<Map<string, HTMLImageElement>>(new Map());
  const [selItem, setSelItem] = useState<string | null>(null);
  const [library, setLibrary] = useState<string | null>(null); // open tab of the sticker library
  const itemDrag = useRef<{ id: string; x: number; y: number; ox: number; oy: number } | null>(null);
  const [images, setImages] = useState<Map<string, HTMLImageElement>>(new Map());
  const [selected, setSelected] = useState(-1);
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  type Grab = 'frame' | 'photo' | 'resize' | 'rotate';
  // resize: ox/oy hold the pinned (opposite) corner in canvas px, sx/sy which corner is being pulled
  const pan = useRef<{ mode: Grab; x: number; y: number; ox: number; oy: number; i: number; moved: boolean; sx?: number; sy?: number } | null>(null);
  const [dragPhoto, setDragPhoto] = useState(false); // drag moves the photo inside its frame instead of the frame
  const [framePicker, setFramePicker] = useState(false);
  const cellPanelRef = useRef<HTMLElement>(null);
  const layout = layoutOf(cfg.layout);
  const byId = useMemo(() => new Map(photos.map((p) => [p.id, p])), [photos]);

  // Decode every photo the collage uses (once each).
  const usedIds = cfg.cells.map((c) => c.photoId).filter(Boolean).join(',');
  useEffect(() => {
    let live = true;
    const ids = usedIds.split(',').filter((id) => id && !images.has(id) && byId.has(id));
    if (!ids.length) return;
    void Promise.all(ids.map(async (id) => [id, await loadImage(byId.get(id)!.blob)] as const)).then((pairs) => {
      if (live) setImages((m) => new Map([...m, ...pairs]));
    });
    return () => {
      live = false;
    };
  }, [usedIds, byId, images]);

  // Decode each decoration (per colour) once; SVGs scale cleanly to the 2160px export.
  const decoKey = cfg.items.filter((o) => o.kind === 'deco').map((o) => decoUrl(o.value, o.color)).join('\n');
  useEffect(() => {
    let live = true;
    const urls = [...new Set(decoKey.split('\n'))].filter((u) => u && !decoImgs.has(u));
    if (!urls.length) return;
    void Promise.all(urls.map(async (u) => [u, await loadImage(u)] as const)).then(
      (pairs) => live && setDecoImgs((m) => new Map([...m, ...pairs])),
      () => {},
    );
    return () => {
      live = false;
    };
  }, [decoKey, decoImgs]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const out = renderCollage(cfg, images, 900, selected, decoImgs, selItem, canvas.clientWidth ? 900 / canvas.clientWidth : 1);
    canvas.width = out.width;
    canvas.height = out.height;
    canvas.getContext('2d')!.drawImage(out, 0, 0);
  }, [cfg, images, selected, decoImgs, selItem]);

  /* Overlays ------------------------------------------------------------------ */
  const item = cfg.items.find((o) => o.id === selItem) ?? null;
  const setItem = (id: string, patch: Partial<Overlay>) =>
    setCfg((c) => ({ ...c, items: c.items.map((o) => (o.id === id ? { ...o, ...patch } : o)) }));
  const addItem = (o: Omit<Overlay, 'id' | 'x' | 'y' | 'r' | 'font' | 'label'> & Partial<Overlay>) => {
    // id last, so a duplicate never inherits the original's id
    const next: Overlay = { x: 0.5 + (Math.random() - 0.5) * 0.2, y: 0.5 + (Math.random() - 0.5) * 0.2, r: Math.round(Math.random() * 12 - 6), font: 'hand', label: 'none', ...o, id: uid() };
    setCfg((c) => ({ ...c, items: [...c.items, next] }));
    setSelItem(next.id);
    setSelected(-1);
    playPop();
    haptic(6);
  };
  const removeItem = () => {
    if (!selItem) return;
    setCfg((c) => ({ ...c, items: c.items.filter((o) => o.id !== selItem) }));
    setSelItem(null);
  };
  const restack = (dir: 'front' | 'back') =>
    item && setCfg((c) => {
      const rest = c.items.filter((o) => o.id !== item.id);
      return { ...c, items: dir === 'front' ? [...rest, item] : [item, ...rest] };
    });
  const duplicateItem = () => item && addItem({ ...item, x: Math.min(0.95, item.x + 0.04), y: Math.min(0.95, item.y + 0.04) });
  const addText = () => addItem({ kind: 'text', value: 'Write here', size: 0.06, color: cfg.ink, font: cfg.font, label: 'none', r: 0 });

  // Delete removes the selected overlay; Escape lets go of it.
  useEffect(() => {
    if (!selItem) return;
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        removeItem();
      } else if (e.key === 'Escape') setSelItem(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const set = <K extends keyof Cfg>(key: K, value: Cfg[K]) => setCfg((c) => ({ ...c, [key]: value }));
  const setCell = (i: number, patch: Partial<Cell>) =>
    setCfg((c) => {
      const cells = [...c.cells];
      while (cells.length <= i) cells.push({ photoId: null, zoom: 1, ox: 0, oy: 0 });
      cells[i] = { ...cells[i], ...patch };
      return { ...c, cells };
    });

  const hit = (e: RPointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * canvas.width;
    const y = ((e.clientY - rect.top) / rect.height) * canvas.height;
    const rects = cellRects(cfg, canvas.width, canvas.height);
    for (let i = rects.length - 1; i >= 0; i -= 1) {
      const r = rects[i];
      const { lx, ly } = toLocal(r, x, y);
      if (!r.hidden && Math.abs(lx) <= r.w / 2 && Math.abs(ly) <= r.h / 2) return i;
    }
    return -1;
  };

  const onDown = (e: RPointerEvent<HTMLCanvasElement>) => {
    // overlays sit on top, so they win the hit test
    const canvas = canvasRef.current!;
    const box = canvas.getBoundingClientRect();
    const o = hitOverlay(cfg.items, ((e.clientX - box.left) / box.width) * canvas.width, ((e.clientY - box.top) / box.height) * canvas.height, canvas.width, canvas.height);
    if (o) {
      e.currentTarget.setPointerCapture(e.pointerId);
      setSelItem(o.id);
      setSelected(-1);
      itemDrag.current = { id: o.id, x: e.clientX, y: e.clientY, ox: o.x, oy: o.y };
      haptic(5);
      return;
    }
    setSelItem(null);
    const px = ((e.clientX - box.left) / box.width) * canvas.width;
    const py = ((e.clientY - box.top) / box.height) * canvas.height;
    const scale = canvas.width / box.width; // canvas px per screen px
    // handles of the selected frame come first: resize from any corner, rotate from the stalk
    if (selected >= 0) {
      const r = cellRects(cfg, canvas.width, canvas.height)[selected];
      const { lx, ly } = toLocal(r, px, py);
      const reach = 22 * scale;
      const near = (hx: number, hy: number) => Math.hypot(lx - hx, ly - hy) <= reach;
      const corner = [[-1, -1], [1, -1], [-1, 1], [1, 1]].find(([sx, sy]) => near((sx * r.w) / 2, (sy * r.h) / 2));
      if (near(0, rotateDot(r, scale).y)) {
        e.currentTarget.setPointerCapture(e.pointerId);
        pan.current = { mode: 'rotate', x: e.clientX, y: e.clientY, ox: 0, oy: 0, i: selected, moved: true };
        haptic(5);
        return;
      }
      if (corner) {
        // pin the opposite corner where it is; only the dragged corner moves
        const [sx, sy] = corner;
        const a = (r.r * Math.PI) / 180;
        const hx = (-sx * r.w) / 2;
        const hy = (-sy * r.h) / 2;
        e.currentTarget.setPointerCapture(e.pointerId);
        pan.current = {
          mode: 'resize', x: e.clientX, y: e.clientY, i: selected, moved: true, sx, sy,
          ox: r.x + r.w / 2 + hx * Math.cos(a) - hy * Math.sin(a),
          oy: r.y + r.h / 2 + hx * Math.sin(a) + hy * Math.cos(a),
        };
        haptic(5);
        return;
      }
    }
    const i = hit(e);
    setSelected(i);
    if (i < 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const cell = cfg.cells[i];
    const photoMode = dragPhoto && Boolean(cell?.photoId);
    pan.current = {
      mode: photoMode ? 'photo' : 'frame',
      x: e.clientX,
      y: e.clientY,
      ox: photoMode ? (cell?.ox ?? 0) : (cell?.dx ?? 0),
      oy: photoMode ? (cell?.oy ?? 0) : (cell?.dy ?? 0),
      i,
      moved: false,
    };
    haptic(5);
  };
  const onMove = (e: RPointerEvent<HTMLCanvasElement>) => {
    const d = itemDrag.current;
    if (d) {
      const box = e.currentTarget.getBoundingClientRect();
      setItem(d.id, { x: clamp(d.ox + (e.clientX - d.x) / box.width, 0, 1), y: clamp(d.oy + (e.clientY - d.y) / box.height, 0, 1) });
      return;
    }
    const p = pan.current;
    if (!p) return;
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    if (Math.abs(dx) + Math.abs(dy) > 4) p.moved = true;
    if (!p.moved) return;
    const canvas = e.currentTarget;
    const box = canvas.getBoundingClientRect();
    const k = canvas.width / box.width; // canvas px per screen px
    const r = cellRects(cfg, canvas.width, canvas.height)[p.i];
    const cell = cfg.cells[p.i];
    if (p.mode === 'frame') {
      setCell(p.i, { dx: p.ox + (dx * k) / canvas.width, dy: p.oy + (dy * k) / canvas.height });
    } else if (p.mode === 'resize') {
      // pointer relative to the pinned corner, in the frame's own (rotated) axes
      const a = (r.r * Math.PI) / 180;
      const cos = Math.cos(a);
      const sin = Math.sin(a);
      const qx = (e.clientX - box.left) * k - p.ox;
      const qy = (e.clientY - box.top) * k - p.oy;
      const sx = p.sx ?? 1;
      const sy = p.sy ?? 1;
      const w = clamp((qx * cos + qy * sin) * sx, r.base.w * 0.15, r.base.w * 3);
      const h = clamp((-qx * sin + qy * cos) * sy, r.base.h * 0.15, r.base.h * 3);
      // the new centre sits half-way from the pinned corner; express it as an offset from the layout slot
      const hx = (sx * w) / 2;
      const hy = (sy * h) / 2;
      const slotX = r.x + r.w / 2 - (cell?.dx ?? 0) * canvas.width;
      const slotY = r.y + r.h / 2 - (cell?.dy ?? 0) * canvas.height;
      setCell(p.i, {
        sw: w / r.base.w,
        sh: h / r.base.h,
        dx: (p.ox + hx * cos - hy * sin - slotX) / canvas.width,
        dy: (p.oy + hx * sin + hy * cos - slotY) / canvas.height,
      });
    } else if (p.mode === 'rotate') {
      // the dot hangs above (or below) the centre, so its angle from the centre is the frame's rotation ±90°
      const below = rotateDot(r, k).below;
      let a = (Math.atan2((e.clientY - box.top) * k - (r.y + r.h / 2), (e.clientX - box.left) * k - (r.x + r.w / 2)) * 180) / Math.PI + (below ? -90 : 90);
      const snap = Math.round(a / 45) * 45;
      if (Math.abs(a - snap) < 4) a = snap; // gentle snap to straight and 45°
      let rot = a - r.base.r;
      rot = ((((rot + 180) % 360) + 360) % 360) - 180;
      setCell(p.i, { rot: Math.round(rot * 10) / 10 });
    } else {
      // the photo can travel by its overflow on each side; convert finger pixels to canvas pixels to that range
      const img = cell?.photoId ? images.get(cell.photoId) : null;
      if (!cell || !img) return;
      const sc = Math.max(r.w / img.naturalWidth, r.h / img.naturalHeight) * cell.zoom;
      const overX = (img.naturalWidth * sc - r.w) / 2;
      const overY = (img.naturalHeight * sc - r.h) / 2;
      setCell(p.i, {
        ox: overX > 0.5 ? clamp(p.ox + (dx * k) / overX, -1, 1) : p.ox,
        oy: overY > 0.5 ? clamp(p.oy + (dy * k) / overY, -1, 1) : p.oy,
      });
    }
  };
  const onUp = () => {
    if (itemDrag.current) {
      itemDrag.current = null;
      return;
    }
    pan.current = null;
  };

  const usePhoto = (i: number, photoId: string) => {
    setCell(i, { photoId, zoom: 1, ox: 0, oy: 0 });
    setFramePicker(false);
    playPop();
  };
  // a picture from the device goes into the archive first, so the collage can keep pointing at it
  const importInto = async (i: number, file?: File) => {
    if (!file) return;
    try {
      const img = await loadImage(file);
      const record = await importedRecord(file, img);
      const id = record.id;
      await onSave(record);
      setImages((m) => new Map(m).set(id, img));
      usePhoto(i, id);
    } catch {
      notify('That image could not be opened.', 'warning');
    }
  };
  const removeFrame = (i: number) => {
    setCell(i, { hidden: true });
    setSelected(-1);
    haptic(8);
  };
  const removedCount = cfg.cells.slice(0, layout.cells.length).filter((c) => c?.hidden).length;

  // tapping anywhere else on the page lets go of the selected frame or sticker
  useEffect(() => {
    if (selected < 0 && !selItem) return;
    const onDownOutside = (ev: PointerEvent) => {
      const t = ev.target as HTMLElement;
      if (t.closest('.cl-canvas, .cl-panel-cell, .modal-overlay, [role="dialog"]')) return;
      setSelected(-1);
      setSelItem(null);
    };
    document.addEventListener('pointerdown', onDownOutside);
    return () => document.removeEventListener('pointerdown', onDownOutside);
  }, [selected, selItem]);

  // A frame was tapped: bring its options into view (on phones they sit under the pinned collage).
  useEffect(() => {
    if (selected >= 0 || selItem) cellPanelRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [selected, selItem]);

  const shuffle = () => {
    const ids = [...photos].sort(() => Math.random() - 0.5).slice(0, layout.cells.length).map((p) => p.id);
    setCfg((c) => ({ ...c, cells: ids.map((photoId, i) => ({ ...c.cells[i], photoId, zoom: 1, ox: 0, oy: 0 })) }));
    playPop();
  };

  const exportCanvas = () => renderCollage(cfg, images, 2160, -1, decoImgs);
  const save = async () => {
    setBusy(true);
    try {
      const canvas = exportCanvas();
      const blob = await canvasToBlob(canvas, 'image/jpeg', 0.93);
      const count = photos.filter((p) => p.kind === 'collage').length + 1;
      const record: PhotoRecord = {
        id: uid(),
        name: `Collage ${pad(count, 2)}`,
        createdAt: Date.now(),
        blob,
        mime: 'image/jpeg',
        width: canvas.width,
        height: canvas.height,
        filterName: `Collage · ${layout.name}`,
        kind: 'collage',
        developed: true,
        note: cfg.caption || 'Made in the Collage studio',
      };
      await onSave(record);
      playSuccess();
      notify('Collage saved to your archive.', 'default', onFrame && { label: 'Frame it', run: () => onFrame(record) });
    } catch (error) {
      console.error(error);
      notify('The collage could not be saved.', 'warning');
    } finally {
      setBusy(false);
    }
  };
  const download = async () => {
    const blob = await canvasToBlob(exportCanvas(), 'image/jpeg', 0.93);
    downloadBlob(blob, `delineate-collage-${cfg.layout}.jpg`);
  };

  const sel = selected >= 0 ? cfg.cells[selected] : undefined;

  return (
    <div className="collage-page page-enter">
      <div className="page-kicker-row">
        <div className="page-kicker">
          <span className="eyebrow">Collage / 06</span>
          <p>Arrange your prints. Tap an empty frame to fill it, drag to reframe.</p>
        </div>
        <div className="pr-top-actions">
          <button type="button" className="button button-outline" onClick={shuffle} disabled={!photos.length}>
            <Shuffle size={14} /> Shuffle
          </button>
          <button type="button" className="button button-outline" onClick={() => void download()}>
            <Download size={14} /> Download
          </button>
          <button type="button" className="button button-dark" onClick={() => void save()} disabled={busy}>
            <Save size={14} /> Save to archive
          </button>
        </div>
      </div>

      <div className="cl-layout">
        <aside className="cl-panel">
          <span className="eyebrow"><LayoutGrid size={12} /> Layout</span>
          <div className="cl-layouts">
            {LAYOUTS.map((l) => (
              <button key={l.id} type="button" className={cfg.layout === l.id ? 'is-active' : ''} onClick={() => { setCfg((c) => ({ ...c, layout: l.id, cells: c.cells.map(({ sw: _w, sh: _h, hidden: _x, dx: _dx, dy: _dy, rot: _r, ...rest }) => rest) })); setSelected(-1); haptic(6); }} title={l.name}>
                <svg viewBox="0 0 100 100" aria-hidden="true">
                  {l.cells.map(([x, y, w, h, r = 0], i) => (
                    <rect key={i} x={x * 100 + 3} y={y * 100 + 3} width={w * 100 - 6} height={h * 100 - 6} rx="3" transform={`rotate(${r} ${x * 100 + (w * 100) / 2} ${y * 100 + (h * 100) / 2})`} />
                  ))}
                </svg>
                <small>{l.name}</small>
              </button>
            ))}
          </div>
          <span className="eyebrow">Style</span>
          <div className="cl-styles">
            {STYLES.map((s) => (
              <button key={s.name} type="button" onClick={() => setCfg((c) => ({ ...c, ...s.patch }))} style={{ background: s.patch.bg, color: s.patch.ink, fontFamily: FONT_FAMILY[s.patch.font ?? 'sans'] }}>
                {s.name}
              </button>
            ))}
          </div>
          <span className="eyebrow">Canvas</span>
          <div className="segmented">
            {(Object.keys(RATIOS) as Ratio[]).map((r) => (
              <button key={r} type="button" className={cfg.ratio === r ? 'is-active' : ''} onClick={() => set('ratio', r)}>{r}</button>
            ))}
          </div>
        </aside>

        <section className="cl-stage">
          <canvas
            ref={canvasRef}
            className="cl-canvas"
            style={{ aspectRatio: `${RATIOS[cfg.ratio]}` }}
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={() => {
              itemDrag.current = null;
              pan.current = null;
            }}
            onWheel={(e) => {
              if (item) setItem(item.id, { size: clamp(item.size * (e.deltaY < 0 ? 1.06 : 1 / 1.06), 0.02, 0.9) });
              else if (selected >= 0 && sel?.photoId) setCell(selected, { zoom: clamp((sel.zoom ?? 1) - e.deltaY / 800, 1, 4) });
            }}
          />
        </section>

        <aside className="cl-panel cl-panel-cell" ref={cellPanelRef}>
          {item ? (
            <div className="cl-cell-panel" key={item.id}>
              <span className="eyebrow">{item.kind === 'text' ? 'Text box' : item.kind === 'emoji' ? `Emoji ${item.value}` : getDeco(item.value).name}</span>
              {item.kind === 'text' && (
                <>
                  <textarea className="text-input cl-textarea" rows={3} value={item.value} onChange={(e) => setItem(item.id, { value: e.target.value })} aria-label="Text" />
                  <div className="segmented">
                    {(['serif', 'sans', 'mono', 'hand'] as const).map((f) => (
                      <button key={f} type="button" className={item.font === f ? 'is-active' : ''} style={{ fontFamily: FONT_FAMILY[f] }} onClick={() => setItem(item.id, { font: f })} aria-label={`${f} font`}>Aa</button>
                    ))}
                  </div>
                  <div className="segmented">
                    {(['none', 'pill', 'highlight'] as const).map((l) => (
                      <button key={l} type="button" className={item.label === l ? 'is-active' : ''} onClick={() => setItem(item.id, { label: l })}>
                        {l === 'none' ? 'Plain' : l === 'pill' ? 'Label' : 'Highlight'}
                      </button>
                    ))}
                  </div>
                </>
              )}
              {item.kind !== 'emoji' && (
                <div className="jr-swatches">
                  {INKS.map((c) => (
                    <button key={c} type="button" style={{ background: c }} className={item.color === c ? 'is-active' : ''} onClick={() => setItem(item.id, { color: c })} aria-label={`Colour ${c}`} />
                  ))}
                  <input type="color" value={item.color} onChange={(e) => setItem(item.id, { color: e.target.value })} aria-label="Custom colour" />
                </div>
              )}
              <Range label="Size" min={0.02} max={0.9} step={0.005} value={item.size} display={`${Math.round(item.size * 100)}`} onChange={(v) => setItem(item.id, { size: v })} />
              <Range label="Rotation" min={-180} max={180} value={item.r} display={`${Math.round(item.r)}°`} onChange={(v) => setItem(item.id, { r: v })} />
              <div className="jr-item-actions">
                <button type="button" onClick={() => restack('front')} title="Bring to front" aria-label="Bring to front"><BringToFront size={15} /></button>
                <button type="button" onClick={() => restack('back')} title="Send to back" aria-label="Send to back"><SendToBack size={15} /></button>
                <button type="button" onClick={duplicateItem} title="Duplicate" aria-label="Duplicate"><Copy size={15} /></button>
                <button type="button" onClick={removeItem} title="Delete" aria-label="Delete" className="danger"><Trash2 size={15} /></button>
              </div>
              <p className="jr-hint">Drag it on the collage to move it. Scroll over it to resize.</p>
              <button type="button" className="button button-dark button-full" onClick={() => setSelItem(null)}><Check size={14} /> Done</button>
            </div>
          ) : selected >= 0 ? (
            <div className="cl-cell-panel" key={selected}>
              <span className="eyebrow">Frame {selected + 1}{sel?.photoId ? '' : ' · empty'}</span>
              <div className="cl-cell-photo">
                {sel?.photoId && byId.get(sel.photoId) ? <Thumb photo={byId.get(sel.photoId)!} /> : <span className="cl-cell-empty"><ImagePlus size={18} /></span>}
                <div>
                  <button type="button" className="button button-outline" onClick={() => setFramePicker(true)}>
                    <ImagePlus size={14} /> {sel?.photoId ? 'Change photo' : 'Add photo'}
                  </button>
                  <button type="button" className="text-button" onClick={() => fileRef.current?.click()}>Import from device</button>
                  {sel?.photoId && <button type="button" className="text-button" onClick={() => setCell(selected, { photoId: null })}><X size={12} /> Empty frame</button>}
                </div>
              </div>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="visually-hidden"
                aria-label="Import a photo into this frame"
                onChange={(ev) => {
                  void importInto(selected, ev.target.files?.[0]);
                  ev.target.value = '';
                }}
              />

              <span className="eyebrow">Dragging on the collage moves</span>
              <div className="segmented">
                <button type="button" className={!dragPhoto ? 'is-active' : ''} onClick={() => setDragPhoto(false)}>The frame</button>
                <button type="button" className={dragPhoto ? 'is-active' : ''} onClick={() => setDragPhoto(true)} disabled={!sel?.photoId}>The photo inside</button>
              </div>
              <p className="jr-hint">Pull a corner dot to resize, the orange dot on the stalk to rotate.</p>

              <span className="eyebrow">Frame</span>
              <Range label="Rotation" min={-180} max={180} step={0.5} value={(sel?.rot ?? 0)} display={`${Math.round(sel?.rot ?? 0)}°`} onChange={(v) => setCell(selected, { rot: v })} />
              <div className="cl-frame-actions">
                <button
                  type="button"
                  className="text-button"
                  onClick={() => setCell(selected, { sw: 1, sh: 1, dx: 0, dy: 0, rot: 0 })}
                  disabled={(sel?.sw ?? 1) === 1 && (sel?.sh ?? 1) === 1 && !sel?.dx && !sel?.dy && !sel?.rot}
                >
                  Snap back to layout
                </button>
                <button type="button" className="button button-outline cl-remove" onClick={() => removeFrame(selected)}><Trash2 size={14} /> Remove this frame</button>
              </div>

              {sel?.photoId && (
                <>
                  <span className="eyebrow">Look</span>
                  <div className="cl-looks">
                    {LOOKS.map((l) => (
                      <button key={l.name} type="button" className={sameLook(sel.look, l.look) ? 'is-active' : ''} onClick={() => setCell(selected, { look: l.look })}>
                        {l.name}
                      </button>
                    ))}
                  </div>
                  <Range label="Brightness" min={0.5} max={1.5} step={0.01} value={(sel.look ?? PLAIN).b} display={`${Math.round(((sel.look ?? PLAIN).b - 1) * 100)}`} onChange={(v) => setCell(selected, { look: { ...(sel.look ?? PLAIN), b: v } })} />
                  <Range label="Contrast" min={0.5} max={1.6} step={0.01} value={(sel.look ?? PLAIN).c} display={`${Math.round(((sel.look ?? PLAIN).c - 1) * 100)}`} onChange={(v) => setCell(selected, { look: { ...(sel.look ?? PLAIN), c: v } })} />
                  <Range label="Saturation" min={0} max={2} step={0.01} value={(sel.look ?? PLAIN).s} display={`${Math.round(((sel.look ?? PLAIN).s - 1) * 100)}`} onChange={(v) => setCell(selected, { look: { ...(sel.look ?? PLAIN), s: v } })} />
                  <span className="eyebrow">Photo inside the frame</span>
                  <Range label="Zoom" min={1} max={4} step={0.01} value={sel.zoom} display={`${sel.zoom.toFixed(2)}×`} onChange={(v) => setCell(selected, { zoom: v })} />
                  <Range label="Left ↔ right" min={-1} max={1} step={0.01} value={sel.ox} display={`${Math.round(sel.ox * 100)}`} onChange={(v) => setCell(selected, { ox: v })} />
                  <Range label="Up ↕ down" min={-1} max={1} step={0.01} value={sel.oy} display={`${Math.round(sel.oy * 100)}`} onChange={(v) => setCell(selected, { oy: v })} />
                  <button type="button" className="text-button" onClick={() => setCell(selected, { ox: 0, oy: 0, zoom: 1 })}>Center photo</button>
                </>
              )}
              <button type="button" className="button button-dark button-full" onClick={() => setSelected(-1)}><Check size={14} /> Done</button>
            </div>
          ) : (
            <>
              {removedCount > 0 && (
                <button type="button" className="button button-outline button-full" onClick={() => setCfg((c) => ({ ...c, cells: c.cells.map((cell) => ({ ...cell, hidden: false })) }))}>
                  Restore {removedCount} removed {removedCount === 1 ? 'frame' : 'frames'}
                </button>
              )}
              <span className="eyebrow">Add on top</span>
              <div className="cl-add">
                <button type="button" onClick={() => setLibrary('Emoji')}><Smile size={17} /><small>Emoji</small></button>
                <button type="button" onClick={() => setLibrary('Doodles')}><Sticker size={17} /><small>Stickers</small></button>
                <button type="button" onClick={addText}><Type size={17} /><small>Text</small></button>
              </div>
              <Range label="Spacing" min={0} max={80} value={cfg.gap} onChange={(v) => set('gap', v)} />
              <Range label="Margin" min={0} max={140} value={cfg.padding} onChange={(v) => set('padding', v)} />
              <Range label="Corner radius" min={0} max={80} value={cfg.radius} onChange={(v) => set('radius', v)} />
              <span className="eyebrow">Background</span>
              <div className="jr-swatches">
                {SWATCHES.map((c) => (
                  <button key={c} type="button" style={{ background: c }} className={cfg.bg === c ? 'is-active' : ''} onClick={() => set('bg', c)} aria-label={c} />
                ))}
                <input type="color" value={cfg.bg} onChange={(e) => set('bg', e.target.value)} aria-label="Custom background" />
              </div>
              <Toggle checked={cfg.frame} onChange={(v) => set('frame', v)} label="White print borders" />
              <Toggle checked={cfg.shadow} onChange={(v) => set('shadow', v)} label="Drop shadows" />
              <span className="eyebrow">Caption</span>
              <input className="text-input" value={cfg.caption} placeholder="Summer ’26" onChange={(e) => set('caption', e.target.value)} />
              <div className="segmented">
                {(['serif', 'sans', 'mono', 'hand'] as const).map((f) => (
                  <button key={f} type="button" className={cfg.font === f ? 'is-active' : ''} style={{ fontFamily: FONT_FAMILY[f] }} onClick={() => set('font', f)}>Aa</button>
                ))}
                <input type="color" value={cfg.ink} onChange={(e) => set('ink', e.target.value)} aria-label="Caption colour" />
              </div>
            </>
          )}
        </aside>
      </div>

      {framePicker && selected >= 0 && (
        <PhotoPicker
          photos={photos}
          title={sel?.photoId ? 'Change the photo' : 'Add a photo'}
          selected={sel?.photoId ? [sel.photoId] : []}
          onPick={(id) => usePhoto(selected, id)}
          onClose={() => setFramePicker(false)}
        />
      )}
      {library && (
        <Modal title="Stickers & emoji" eyebrow="Transparent, drawn on top" wide onClose={() => setLibrary(null)}>
          <div className="segmented jr-wrap">
            {LIBRARY_TABS.map((t) => (
              <button key={t} type="button" className={library === t ? 'is-active' : ''} onClick={() => setLibrary(t)}>{t}</button>
            ))}
          </div>
          {library === 'Emoji' ? (
            <div className="cl-emoji-grid">
              {EMOJI.map((ch) => (
                <button key={ch} type="button" onClick={() => addItem({ kind: 'emoji', value: ch, size: 0.09, color: '#000000' })} aria-label={`Add ${ch}`}>
                  {ch}
                </button>
              ))}
            </div>
          ) : (
            <div className="jr-deco-grid">
              {DECOS.filter((d) => d.cat === library).map((d, i) => (
                <button key={d.id} type="button" onClick={() => addItem({ kind: 'deco', value: d.id, size: clamp(d.w / 900, 0.06, 0.3), color: d.color })} title={d.name} style={{ animationDelay: `${i * 20}ms` }}>
                  <img src={decoUrl(d.id, d.color)} alt={d.name} />
                </button>
              ))}
            </div>
          )}
          <p className="jr-hint">Tap to drop onto the collage. The library stays open so you can add several.</p>
        </Modal>
      )}
    </div>
  );
}
