import { Download, ImagePlus, LayoutGrid, Save, Shuffle, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import type { PhotoRecord } from '../types';
import { FONT_FAMILY } from '../lib/journalRender';
import { canvasToBlob, clamp, downloadBlob, loadImage, pad, uid } from '../lib/utils';
import { haptic, playPop, playSuccess } from '../lib/audio';
import { PhotoPicker, Range, Toggle } from './ui';

type CollageViewProps = {
  photos: PhotoRecord[];
  onSave: (record: PhotoRecord) => Promise<void>;
  notify: (message: string, tone?: 'default' | 'warning') => void;
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

type Cell = { photoId: string | null; zoom: number; ox: number; oy: number };
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
};

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
  return layoutOf(cfg.layout).cells.map(([x, y, w, h, r = 0]) => ({
    x: area.x + x * area.w + g / 2,
    y: area.y + y * area.h + g / 2,
    w: w * area.w - g,
    h: h * area.h - g,
    r,
  }));
}

function renderCollage(cfg: Cfg, images: Map<string, HTMLImageElement>, W: number, selected = -1) {
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
      ctx.drawImage(img, ix + (w - dw) / 2 + ((dw - w) / 2) * cell.ox, iy + (h - dh) / 2 + ((dh - h) / 2) * cell.oy, dw, dh);
    } else {
      ctx.fillStyle = 'rgba(128,128,128,0.6)';
      ctx.font = `${40 * k}px ${FONT_FAMILY.sans}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('+', ix + w / 2, iy + h / 2);
    }
    ctx.restore();
    if (i === selected) {
      ctx.save();
      ctx.translate(rect.x + rect.w / 2, rect.y + rect.h / 2);
      ctx.rotate((rect.r * Math.PI) / 180);
      ctx.strokeStyle = '#ff8a2a';
      ctx.lineWidth = 4 * k;
      ctx.setLineDash([12 * k, 8 * k]);
      ctx.strokeRect(-rect.w / 2, -rect.h / 2, rect.w, rect.h);
      ctx.restore();
    }
  });
  if (cfg.caption) {
    ctx.fillStyle = cfg.ink;
    ctx.font = `${Math.round(H * 0.05)}px ${FONT_FAMILY[cfg.font]}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(cfg.caption, W / 2, H - cfg.padding * k - H * 0.05, W - cfg.padding * k * 2);
  }
  return canvas;
}

export default function CollageView({ photos, onSave, notify }: CollageViewProps) {
  const [cfg, setCfg] = useState<Cfg>(() => ({
    layout: 'grid4',
    ratio: '1:1',
    ...(STYLES[0].patch as Omit<Cfg, 'layout' | 'ratio' | 'caption' | 'cells'>),
    caption: '',
    cells: photos.slice(0, 9).map((p) => ({ photoId: p.id, zoom: 1, ox: 0, oy: 0 })),
  }));
  const [images, setImages] = useState<Map<string, HTMLImageElement>>(new Map());
  const [selected, setSelected] = useState(-1);
  const [picker, setPicker] = useState(false);
  const [busy, setBusy] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pan = useRef<{ x: number; y: number; ox: number; oy: number; i: number; moved: boolean } | null>(null);
  const openOnClick = useRef(false);
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

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const out = renderCollage(cfg, images, 900, selected);
    canvas.width = out.width;
    canvas.height = out.height;
    canvas.getContext('2d')!.drawImage(out, 0, 0);
  }, [cfg, images, selected]);

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
      if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return i;
    }
    return -1;
  };

  const onDown = (e: RPointerEvent<HTMLCanvasElement>) => {
    const i = hit(e);
    setSelected(i);
    if (i < 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const cell = cfg.cells[i] ?? { ox: 0, oy: 0 };
    pan.current = { x: e.clientX, y: e.clientY, ox: cell.ox, oy: cell.oy, i, moved: false };
    haptic(5);
  };
  const onMove = (e: RPointerEvent<HTMLCanvasElement>) => {
    const p = pan.current;
    if (!p) return;
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    if (Math.abs(dx) + Math.abs(dy) > 4) p.moved = true;
    if (p.moved && cfg.cells[p.i]?.photoId) setCell(p.i, { ox: clamp(p.ox - dx / 120, -1, 1), oy: clamp(p.oy - dy / 120, -1, 1) });
  };
  const onUp = () => {
    const p = pan.current;
    pan.current = null;
    // Open the picker on the click that follows, not here: on phones that click lands on whatever is
    // under the finger, so opening now would let it pick the photo the picker shows under the finger.
    openOnClick.current = Boolean(p && !p.moved && !cfg.cells[p.i]?.photoId);
  };
  const onClick = () => {
    if (openOnClick.current) setPicker(true);
    openOnClick.current = false;
  };

  // A frame was tapped: bring its options into view (on phones they sit under the pinned collage).
  useEffect(() => {
    if (selected >= 0) cellPanelRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [selected]);

  const shuffle = () => {
    const ids = [...photos].sort(() => Math.random() - 0.5).slice(0, layout.cells.length).map((p) => p.id);
    set('cells', ids.map((photoId) => ({ photoId, zoom: 1, ox: 0, oy: 0 })));
    playPop();
  };

  const exportCanvas = () => renderCollage(cfg, images, 2160);
  const save = async () => {
    setBusy(true);
    try {
      const canvas = exportCanvas();
      const blob = await canvasToBlob(canvas, 'image/jpeg', 0.93);
      const count = photos.filter((p) => p.kind === 'collage').length + 1;
      await onSave({
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
      });
      playSuccess();
      notify('Collage saved to your archive.');
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
              <button key={l.id} type="button" className={cfg.layout === l.id ? 'is-active' : ''} onClick={() => { set('layout', l.id); setSelected(-1); haptic(6); }} title={l.name}>
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
            onClick={onClick}
            onWheel={(e) => selected >= 0 && sel?.photoId && setCell(selected, { zoom: clamp((sel.zoom ?? 1) - e.deltaY / 800, 1, 4) })}
          />
        </section>

        <aside className="cl-panel cl-panel-cell" ref={cellPanelRef}>
          {selected >= 0 ? (
            <div className="cl-cell-panel" key={selected}>
              <span className="eyebrow">Frame {selected + 1}</span>
              <button type="button" className="button button-outline button-full" onClick={() => setPicker(true)}>
                <ImagePlus size={14} /> {sel?.photoId ? 'Change photo' : 'Choose photo'}
              </button>
              {sel?.photoId && (
                <>
                  <Range label="Zoom" min={1} max={4} step={0.01} value={sel.zoom} display={`${sel.zoom.toFixed(2)}×`} onChange={(v) => setCell(selected, { zoom: v })} />
                  <button type="button" className="text-button" onClick={() => setCell(selected, { photoId: null })}>
                    <X size={12} /> Empty this frame
                  </button>
                </>
              )}
              <button type="button" className="text-button" onClick={() => setSelected(-1)}>Done</button>
            </div>
          ) : (
            <>
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

      {picker && (
        <PhotoPicker
          photos={photos}
          selected={sel?.photoId ? [sel.photoId] : []}
          onPick={(id) => {
            setCell(Math.max(0, selected), { photoId: id, zoom: 1, ox: 0, oy: 0 });
            setPicker(false);
            playPop();
          }}
          onClose={() => setPicker(false)}
        />
      )}
    </div>
  );
}
