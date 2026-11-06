import {
  ArrowLeft,
  BookOpen,
  BringToFront,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  ImagePlus,
  LayoutTemplate,
  MousePointer2,
  Palette,
  PenLine,
  Plus,
  SendToBack,
  Sticker,
  Trash2,
  Type,
  Undo2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import type { JItem, JPage, JournalBook, PaperKind, PhotoRecord } from '../types';
import { deleteJournal, getAllJournals, saveJournal } from '../lib/db';
import { buildTemplate, coverItems, DECO_CATS, DECOS, decoUrl, getDeco, getTheme, PAGE_H, PAGE_W, TEMPLATES, THEMES } from '../lib/decos';
import { doodlePath, exportBookPdf, FONT_FAMILY, paperCss } from '../lib/journalRender';
import { downloadBlob, fileSlug, formatDate, uid } from '../lib/utils';
import { haptic, playFlip, playPop, playSuccess } from '../lib/audio';
import { Modal, PhotoPicker, Range, Spinner, Thumb } from './ui';

type JournalViewProps = {
  photos: PhotoRecord[];
  notify: (message: string, tone?: 'default' | 'warning') => void;
};

const SWATCHES = ['#20231d', '#ffffff', '#f2ead9', '#d8c3a0', '#fff4d6', '#fde8ec', '#f4f1ff', '#e4efe6', '#1f2a4a', '#c65d36', '#e2566e', '#f2c14e', '#5b8bd9', '#5f8a4e', '#7a5a3a', '#8d6fd1'];
const PAPERS: PaperKind[] = ['plain', 'lined', 'grid', 'dots', 'kraft', 'watercolor'];

type DragMode = 'move' | 'resize' | 'rotate';

function ItemView({ item, photo }: { item: JItem; photo?: PhotoRecord }) {
  if (item.type === 'text') {
    return (
      <div
        className={`jr-text label-${item.label}`}
        style={{ fontFamily: FONT_FAMILY[item.font], fontSize: item.size, color: item.color, textAlign: item.align, borderColor: item.color }}
      >
        {item.text || ' '}
      </div>
    );
  }
  if (item.type === 'photo') {
    return (
      <div className={`jr-photo style-${item.style}`}>
        <div className="jr-photo-inner">{photo ? <Thumb photo={photo} /> : <span className="jr-photo-empty"><ImagePlus size={18} /> Add photo</span>}</div>
      </div>
    );
  }
  if (item.type === 'deco') return <img className="jr-deco" src={decoUrl(item.deco, item.color)} alt="" draggable={false} />;
  return (
    <svg className="jr-doodle" viewBox={`0 0 ${item.vw} ${item.vh}`} preserveAspectRatio="none">
      <path d={doodlePath(item.points)} fill="none" stroke={item.color} strokeWidth={item.width} strokeOpacity={item.alpha} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function PageView({
  page,
  photos,
  selectedId,
  onItemDown,
  onItemTap,
}: {
  page: JPage;
  photos: Map<string, PhotoRecord>;
  selectedId?: string | null;
  onItemDown?: (e: RPointerEvent, item: JItem, mode: DragMode) => void;
  onItemTap?: (item: JItem) => void;
}) {
  return (
    <div className="jr-page" style={paperCss(page.paper, page.bg)}>
      {page.items.map((item) => (
        <div
          key={item.id}
          className={`jr-item type-${item.type} ${selectedId === item.id ? 'is-selected' : ''}`}
          style={{ left: item.x, top: item.y, width: item.w, height: item.h, transform: `rotate(${item.r}deg)` }}
          onPointerDown={onItemDown ? (e) => onItemDown(e, item, 'move') : undefined}
          onClick={
            onItemTap
              ? (e) => {
                  e.stopPropagation();
                  onItemTap(item);
                }
              : undefined
          }
        >
          <ItemView item={item} photo={item.type === 'photo' && item.photoId ? photos.get(item.photoId) : undefined} />
          {selectedId === item.id && onItemDown && (
            <>
              <span className="jr-handle jr-resize" onPointerDown={(e) => onItemDown(e, item, 'resize')} />
              <span className="jr-handle jr-rotate" onPointerDown={(e) => onItemDown(e, item, 'rotate')} />
            </>
          )}
        </div>
      ))}
    </div>
  );
}

/** Scales a fixed 600×800 page to whatever width its box has. */
function useFit<T extends HTMLElement>() {
  // callback ref: the page box only exists once a book is open, so observe it when it mounts
  const [el, setEl] = useState<T | null>(null);
  const [scale, setScale] = useState(1);
  useEffect(() => {
    if (!el) return;
    // fit the whole page inside the box, by width and by height
    const ro = new ResizeObserver(() => setScale(Math.max(0.2, Math.min(el.clientWidth / PAGE_W, el.clientHeight / PAGE_H))));
    ro.observe(el);
    return () => ro.disconnect();
  }, [el]);
  return [setEl, scale, el] as const;
}

function newPage(bg: string, paper: PaperKind, items: JItem[] = []): JPage {
  return { id: uid(), bg, paper, items };
}

export default function JournalView({ photos, notify }: JournalViewProps) {
  const [books, setBooks] = useState<JournalBook[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [pageIndex, setPageIndex] = useState(0);
  const [turn, setTurn] = useState<'next' | 'prev'>('next');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tool, setTool] = useState<'select' | 'doodle'>('select');
  const [pen, setPen] = useState({ color: '#20231d', width: 4, alpha: 1 });
  const [drawing, setDrawing] = useState<number[] | null>(null);
  const [modal, setModal] = useState<null | 'new' | 'deco' | 'templates' | 'photo-add' | 'photo-swap' | 'delete'>(null);
  const [decoCat, setDecoCat] = useState(DECO_CATS[0]);
  const [newTitle, setNewTitle] = useState('');
  const [newTheme, setNewTheme] = useState(THEMES[0].id);
  const [exporting, setExporting] = useState<number | null>(null);
  const history = useRef<JournalBook[]>([]);
  const drag = useRef<{ mode: DragMode; id: string; sx: number; sy: number; orig: JItem } | null>(null);
  const [fitRef, fitScale, fitBox] = useFit<HTMLDivElement>();
  const [zoom, setZoom] = useState(1); // 1 = whole page fits; above that the desk scrolls
  const scale = fitScale * zoom;
  const fitEl = useRef<HTMLDivElement>(null);
  const zoomRef = useRef(zoom);
  const scaleRef = useRef(scale);
  zoomRef.current = zoom;
  scaleRef.current = scale;
  const anchor = useRef<{ px: number; py: number; cx: number; cy: number } | null>(null);
  const pan = useRef<{ x: number; y: number; sl: number; st: number } | null>(null);
  const panMoved = useRef(false);

  /** Zoom keeping the point under (cx, cy) — fingers, cursor or the centre — where it is. Reads refs so native listeners never go stale. */
  const zoomTo = useCallback(
    (next: number, cx?: number, cy?: number) => {
      const z = Math.min(4, Math.max(0.5, +next.toFixed(3)));
      const fit = fitEl.current;
      if (fit && fitBox) {
        const r = fit.getBoundingClientRect();
        const b = fitBox.getBoundingClientRect();
        const x = cx ?? b.left + b.width / 2;
        const y = cy ?? b.top + b.height / 2;
        anchor.current = { px: (x - r.left) / scaleRef.current, py: (y - r.top) / scaleRef.current, cx: x, cy: y };
      }
      setZoom(z);
    },
    [fitBox],
  );
  const zoomBy = (factor: number) => zoomTo(zoomRef.current * factor);
  useLayoutEffect(() => {
    const a = anchor.current;
    anchor.current = null;
    if (!a || !fitBox || !fitEl.current) return;
    const r = fitEl.current.getBoundingClientRect();
    fitBox.scrollLeft += r.left + a.px * scale - a.cx;
    fitBox.scrollTop += r.top + a.py * scale - a.cy;
  }, [zoom, scale, fitBox]);

  // Ctrl/⌘ + scroll (trackpad pinch) and two-finger pinch zoom the page, not the browser.
  useEffect(() => {
    if (!fitBox) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      zoomTo(zoomRef.current * (e.deltaY < 0 ? 1.1 : 1 / 1.1), e.clientX, e.clientY);
    };
    let pinch: { d: number; z: number } | null = null;
    const dist = (t: TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 2) return;
      pinch = { d: dist(e.touches), z: zoomRef.current };
      drag.current = null; // a second finger means zoom, never "move this sticker"
    };
    const onTouchMove = (e: TouchEvent) => {
      if (!pinch || e.touches.length !== 2) return;
      e.preventDefault();
      zoomTo(
        (pinch.z * dist(e.touches)) / pinch.d,
        (e.touches[0].clientX + e.touches[1].clientX) / 2,
        (e.touches[0].clientY + e.touches[1].clientY) / 2,
      );
    };
    const onTouchEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) pinch = null;
    };
    fitBox.addEventListener('wheel', onWheel, { passive: false });
    fitBox.addEventListener('touchstart', onTouchStart, { passive: true });
    fitBox.addEventListener('touchmove', onTouchMove, { passive: false });
    fitBox.addEventListener('touchend', onTouchEnd);
    fitBox.addEventListener('touchcancel', onTouchEnd);
    return () => {
      fitBox.removeEventListener('wheel', onWheel);
      fitBox.removeEventListener('touchstart', onTouchStart);
      fitBox.removeEventListener('touchmove', onTouchMove);
      fitBox.removeEventListener('touchend', onTouchEnd);
      fitBox.removeEventListener('touchcancel', onTouchEnd);
    };
  }, [fitBox, zoomTo]);
  const pageRef = useRef<HTMLDivElement>(null);

  const photoMap = useMemo(() => new Map(photos.map((p) => [p.id, p])), [photos]);
  const book = books.find((b) => b.id === openId) ?? null;
  const page = book?.pages[pageIndex] ?? null;
  const selected = page?.items.find((i) => i.id === selectedId) ?? null;
  const theme = getTheme(book?.themeId ?? 'travel');

  useEffect(() => {
    getAllJournals()
      .then(setBooks)
      .catch(() => notify('Journals could not be opened in this browser.', 'warning'))
      .finally(() => setLoaded(true));
  }, [notify]);

  // Autosave the open book shortly after any change.
  useEffect(() => {
    if (!book) return;
    const t = window.setTimeout(() => void saveJournal(book).catch(() => notify('Could not save the journal.', 'warning')), 500);
    return () => window.clearTimeout(t);
  }, [book, notify]);

  const updateBook = useCallback(
    (fn: (b: JournalBook) => JournalBook, record = true) => {
      setBooks((all) =>
        all.map((b) => {
          if (b.id !== openId) return b;
          if (record) history.current = [...history.current.slice(-40), b];
          return { ...fn(b), updatedAt: Date.now() };
        }),
      );
    },
    [openId],
  );
  const updatePage = (fn: (p: JPage) => JPage, record = true) =>
    updateBook((b) => ({ ...b, pages: b.pages.map((p, i) => (i === pageIndex ? fn(p) : p)) }), record);
  const updateItem = (id: string, patch: Partial<JItem>, record = true) =>
    updatePage((p) => ({ ...p, items: p.items.map((it) => (it.id === id ? ({ ...it, ...patch } as JItem) : it)) }), record);
  const addItem = (item: JItem) => {
    updatePage((p) => ({ ...p, items: [...p.items, item] }));
    setSelectedId(item.id);
    setTool('select');
    playPop();
    haptic(8);
  };
  const removeSelected = () => {
    if (!selectedId) return;
    updatePage((p) => ({ ...p, items: p.items.filter((i) => i.id !== selectedId) }));
    setSelectedId(null);
  };
  const undo = () => {
    const prev = history.current.pop();
    if (!prev) return;
    setBooks((all) => all.map((b) => (b.id === prev.id ? prev : b)));
    setPageIndex((i) => Math.min(i, prev.pages.length - 1));
    setSelectedId(null);
  };

  const goPage = (i: number) => {
    if (!book || i < 0 || i >= book.pages.length || i === pageIndex) return;
    setTurn(i > pageIndex ? 'next' : 'prev');
    setPageIndex(i);
    setSelectedId(null);
    playFlip();
    haptic(10);
  };

  // Keyboard: delete, undo, nudge.
  useEffect(() => {
    if (!book) return;
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        undo();
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) {
        e.preventDefault();
        removeSelected();
      } else if (selected && e.key.startsWith('Arrow')) {
        e.preventDefault();
        const d = e.shiftKey ? 10 : 2;
        updateItem(selected.id, {
          x: selected.x + (e.key === 'ArrowLeft' ? -d : e.key === 'ArrowRight' ? d : 0),
          y: selected.y + (e.key === 'ArrowUp' ? -d : e.key === 'ArrowDown' ? d : 0),
        });
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  });

  const toPage = (e: { clientX: number; clientY: number }) => {
    const rect = pageRef.current!.getBoundingClientRect();
    return { x: (e.clientX - rect.left) / scale, y: (e.clientY - rect.top) / scale };
  };

  const startPan = (e: RPointerEvent) => {
    if (!fitBox) return;
    try {
      pageRef.current?.setPointerCapture(e.pointerId);
    } catch {
      /* synthetic pointer */
    }
    pan.current = { x: e.clientX, y: e.clientY, sl: fitBox.scrollLeft, st: fitBox.scrollTop };
  };

  const onItemDown = (e: RPointerEvent, item: JItem, mode: DragMode) => {
    if (tool === 'doodle') return;
    e.stopPropagation();
    panMoved.current = false;
    // Only an already-selected item can be dragged by touch, and when zoomed in a drag on anything
    // unselected pans the view. A plain tap (click) selects — so panning never moves elements.
    if (mode === 'move' && selectedId !== item.id && (e.pointerType === 'touch' || zoomRef.current > 1)) {
      if (e.pointerType !== 'touch') startPan(e);
      return;
    }
    pageRef.current?.setPointerCapture(e.pointerId);
    setSelectedId(item.id);
    history.current = [...history.current.slice(-40), book!];
    const p = toPage(e);
    drag.current = { mode, id: item.id, sx: p.x, sy: p.y, orig: item };
  };

  const onPageDown = (e: RPointerEvent<HTMLDivElement>) => {
    if (tool === 'doodle') {
      e.currentTarget.setPointerCapture(e.pointerId);
      const p = toPage(e);
      setDrawing([p.x, p.y]);
      return;
    }
    panMoved.current = false;
    if (e.pointerType !== 'touch' && zoomRef.current > 1) startPan(e); // touch pans natively
  };
  const onPageMove = (e: RPointerEvent<HTMLDivElement>) => {
    const pn = pan.current;
    if (pn && fitBox) {
      if (Math.abs(e.clientX - pn.x) + Math.abs(e.clientY - pn.y) > 4) panMoved.current = true;
      fitBox.scrollLeft = pn.sl - (e.clientX - pn.x);
      fitBox.scrollTop = pn.st - (e.clientY - pn.y);
      return;
    }
    const p = toPage(e);
    if (drawing) {
      setDrawing((pts) => (pts ? [...pts, Math.round(p.x * 10) / 10, Math.round(p.y * 10) / 10] : pts));
      return;
    }
    const d = drag.current;
    if (!d) return;
    const o = d.orig;
    if (d.mode === 'move') {
      updateItem(d.id, { x: o.x + p.x - d.sx, y: o.y + p.y - d.sy }, false);
    } else if (d.mode === 'resize') {
      // resize in the item's rotated frame; text resizes freely, everything else keeps its shape
      const rad = (-o.r * Math.PI) / 180;
      const dx = p.x - d.sx;
      const dy = p.y - d.sy;
      const lx = dx * Math.cos(rad) - dy * Math.sin(rad);
      const ly = dx * Math.sin(rad) + dy * Math.cos(rad);
      let w = Math.max(24, o.w + lx);
      let h = Math.max(20, o.h + ly);
      if (o.type !== 'text') {
        const k = Math.max(w / o.w, h / o.h);
        w = Math.max(24, o.w * k);
        h = Math.max(20, o.h * k);
      }
      updateItem(d.id, { w, h }, false);
    } else {
      const cx = o.x + o.w / 2;
      const cy = o.y + o.h / 2;
      let r = (Math.atan2(p.y - cy, p.x - cx) * 180) / Math.PI + 90;
      if (Math.abs(r % 45) < 4) r = Math.round(r / 45) * 45; // snap to 45°
      updateItem(d.id, { r: Math.round(r) }, false);
    }
  };
  const onPageUp = () => {
    drag.current = null;
    pan.current = null;
    if (drawing) {
      if (drawing.length >= 4) {
        const xs = drawing.filter((_, i) => i % 2 === 0);
        const ys = drawing.filter((_, i) => i % 2 === 1);
        const pad = pen.width;
        const minX = Math.min(...xs) - pad;
        const minY = Math.min(...ys) - pad;
        const w = Math.max(...xs) - minX + pad;
        const h = Math.max(...ys) - minY + pad;
        const points = drawing.map((v, i) => +(v - (i % 2 ? minY : minX)).toFixed(1));
        updatePage((pg) => ({
          ...pg,
          items: [...pg.items, { id: uid(), type: 'doodle', x: minX, y: minY, w, h, r: 0, points, vw: w, vh: h, ...pen }],
        }));
      }
      setDrawing(null);
    }
  };

  /* Books ------------------------------------------------------------------ */
  const createBook = () => {
    const t = getTheme(newTheme);
    const title = newTitle.trim() || t.name;
    const now = Date.now();
    const b: JournalBook = {
      id: uid(),
      title,
      themeId: t.id,
      cover: t.cover,
      createdAt: now,
      updatedAt: now,
      pages: [newPage(t.bg, t.paper, coverItems(t, title)), newPage(t.bg, t.paper, buildTemplate('hero', t))],
    };
    fillSlots(b.pages[1]);
    setBooks((all) => [b, ...all]);
    void saveJournal(b);
    history.current = [];
    setOpenId(b.id);
    setPageIndex(0);
    setModal(null);
    setNewTitle('');
    playSuccess();
  };

  // Template slots are auto-filled with the newest photos so a page looks finished straight away.
  function fillSlots(pg: JPage) {
    let n = 0;
    pg.items.forEach((it) => {
      if (it.type === 'photo' && !it.photoId && photos[n]) it.photoId = photos[n++].id;
    });
    return pg;
  }

  const removeBook = async () => {
    if (!book) return;
    await deleteJournal(book.id);
    setBooks((all) => all.filter((b) => b.id !== book.id));
    setOpenId(null);
    setModal(null);
    notify(`“${book.title}” was deleted.`);
  };

  const exportPdf = async () => {
    if (!book || exporting !== null) return;
    setExporting(0);
    setSelectedId(null);
    try {
      const pdf = await exportBookPdf(book, photoMap, setExporting);
      downloadBlob(pdf, `${fileSlug(book.title)}.pdf`);
      playSuccess();
      notify(`“${book.title}” downloaded as a ${book.pages.length}-page PDF.`);
    } catch (error) {
      console.error(error);
      notify('The PDF could not be created.', 'warning');
    } finally {
      setExporting(null);
    }
  };

  /* Adders -------------------------------------------------------------- */
  const center = (w: number, h: number) => ({ x: PAGE_W / 2 - w / 2 + (Math.random() * 60 - 30), y: PAGE_H / 2 - h / 2 + (Math.random() * 60 - 30) });
  const addText = () =>
    addItem({ id: uid(), type: 'text', ...center(320, 80), w: 320, h: 80, r: 0, text: 'Write something…', font: theme.font, size: 28, color: theme.ink, align: 'left', label: 'none' });
  const addDeco = (id: string) => {
    const d = getDeco(id);
    addItem({ id: uid(), type: 'deco', deco: id, color: d.color, ...center(d.w, d.h), w: d.w, h: d.h, r: Math.round(Math.random() * 16 - 8) });
  };
  const addPhoto = (photoId: string) => {
    const rec = photoMap.get(photoId);
    const ratio = rec ? rec.width / rec.height : 4 / 3;
    const w = ratio >= 1 ? 280 : 210;
    addItem({ id: uid(), type: 'photo', photoId, style: 'polaroid', ...center(w, w / ratio + 50), w, h: w / ratio + 50, r: Math.round(Math.random() * 8 - 4) });
    setModal(null);
  };
  const applyTemplate = (id: string) => {
    updatePage((p) => fillSlots({ ...p, items: buildTemplate(id, theme) }));
    setModal(null);
    playFlip();
  };
  const addPage = (duplicate = false) => {
    if (!book) return;
    const src = book.pages[pageIndex];
    const pg = duplicate
      ? { ...src, id: uid(), items: src.items.map((i) => ({ ...i, id: uid() })) }
      : newPage(theme.bg, theme.paper);
    updateBook((b) => ({ ...b, pages: [...b.pages.slice(0, pageIndex + 1), pg, ...b.pages.slice(pageIndex + 1)] }));
    setTurn('next');
    setPageIndex(pageIndex + 1);
    playFlip();
  };
  const deletePage = () => {
    if (!book || book.pages.length <= 1) return;
    updateBook((b) => ({ ...b, pages: b.pages.filter((_, i) => i !== pageIndex) }));
    setPageIndex(Math.max(0, pageIndex - 1));
  };
  const movePage = (dir: -1 | 1) => {
    const to = pageIndex + dir;
    if (!book || to < 0 || to >= book.pages.length) return;
    updateBook((b) => {
      const pages = [...b.pages];
      [pages[pageIndex], pages[to]] = [pages[to], pages[pageIndex]];
      return { ...b, pages };
    });
    setPageIndex(to);
  };
  const reorder = (dir: 'front' | 'back') => {
    if (!selected) return;
    updatePage((p) => {
      const rest = p.items.filter((i) => i.id !== selected.id);
      return { ...p, items: dir === 'front' ? [...rest, selected] : [selected, ...rest] };
    });
  };
  const duplicateSelected = () => selected && addItem({ ...selected, id: uid(), x: selected.x + 20, y: selected.y + 20 });

  /* Shelf --------------------------------------------------------------------- */
  if (!book) {
    return (
      <div className="journal-page page-enter">
        <div className="page-kicker-row">
          <div className="page-kicker">
            <span className="eyebrow">Journal / 05</span>
            <p>Scrapbooks for trips, birthdays, slow Sundays — one book per memory.</p>
          </div>
          <button type="button" className="button button-dark" onClick={() => setModal('new')}>
            <Plus size={15} /> New journal
          </button>
        </div>
        {!loaded ? (
          <Spinner label="Opening the bookshelf…" />
        ) : (
          <div className="jr-shelf">
            {books.map((b, i) => {
              const t = getTheme(b.themeId);
              return (
                <button
                  key={b.id}
                  type="button"
                  className="jr-book"
                  style={{ ['--cover' as string]: b.cover, animationDelay: `${i * 60}ms` }}
                  onClick={() => {
                    history.current = [];
                    setOpenId(b.id);
                    setPageIndex(0);
                    playFlip();
                  }}
                >
                  <span className="jr-book-spine" />
                  <span className="jr-book-cover">
                    <span className="jr-book-label">
                      <strong style={{ fontFamily: FONT_FAMILY[t.font] }}>{b.title}</strong>
                      <small>{t.name}</small>
                    </span>
                    <img src={decoUrl(t.decos[0], getDeco(t.decos[0]).color)} alt="" className="jr-book-deco" />
                  </span>
                  <span className="jr-book-meta">
                    {b.pages.length} pages · {formatDate(b.updatedAt)}
                  </span>
                </button>
              );
            })}
            <button type="button" className="jr-book jr-book-new" onClick={() => setModal('new')}>
              <Plus size={28} />
              <span>Start a new journal</span>
            </button>
          </div>
        )}
        {modal === 'new' && (
          <Modal title="A new journal" eyebrow="Pick a theme" wide onClose={() => setModal(null)}>
            <label className="jr-title-field">
              <span className="eyebrow">Title</span>
              <input className="text-input" value={newTitle} placeholder="Lisbon, summer ’26" onChange={(e) => setNewTitle(e.target.value)} autoFocus />
            </label>
            <div className="jr-theme-grid">
              {THEMES.map((t) => (
                <button key={t.id} type="button" className={`jr-theme ${newTheme === t.id ? 'is-active' : ''}`} onClick={() => setNewTheme(t.id)}>
                  <span className="jr-theme-preview" style={paperCss(t.paper, t.bg)}>
                    <span className="jr-theme-cover" style={{ background: t.cover }} />
                    {t.decos.slice(0, 3).map((d, i) => (
                      <img key={d} src={decoUrl(d, getDeco(d).color)} alt="" style={{ left: `${30 + i * 22}%`, top: `${20 + (i % 2) * 34}%` }} />
                    ))}
                  </span>
                  <strong style={{ fontFamily: FONT_FAMILY[t.font] }}>{t.name}</strong>
                  <small>{t.note}</small>
                </button>
              ))}
            </div>
            <div className="modal-actions">
              <button type="button" className="button button-dark" onClick={createBook}>
                <BookOpen size={15} /> Create journal
              </button>
            </div>
          </Modal>
        )}
      </div>
    );
  }

  /* Editor ------------------------------------------------------------------ */
  return (
    <div className="journal-page jr-editor page-enter">
      <div className="jr-topbar">
        <button type="button" className="round-icon" onClick={() => setOpenId(null)} aria-label="Back to bookshelf">
          <ArrowLeft size={17} />
        </button>
        <input
          className="jr-book-title"
          value={book.title}
          onChange={(e) => updateBook((b) => ({ ...b, title: e.target.value }), false)}
          aria-label="Journal title"
        />
        <div className="jr-zoom" role="group" aria-label="Zoom">
          <button type="button" onClick={() => zoomBy(1 / 1.25)} disabled={zoom <= 0.5} aria-label="Zoom out" title="Zoom out (Ctrl + scroll)">
            <ZoomOut size={15} />
          </button>
          <output onClick={() => zoomTo(1)} title="Fit page">{Math.round(zoom * 100)}%</output>
          <button type="button" onClick={() => zoomBy(1.25)} disabled={zoom >= 4} aria-label="Zoom in" title="Zoom in (Ctrl + scroll)">
            <ZoomIn size={15} />
          </button>
        </div>
        <span className="jr-page-count">
          Page {pageIndex + 1} / {book.pages.length}
        </span>
        <span className="jr-spacer" />
        <button type="button" className="round-icon" onClick={undo} title="Undo (Ctrl+Z)" aria-label="Undo">
          <Undo2 size={16} />
        </button>
        <button type="button" className="button button-dark" onClick={() => void exportPdf()} disabled={exporting !== null}>
          <Download size={14} /> {exporting !== null ? `Binding… ${Math.round(exporting * 100)}%` : 'Download PDF'}
        </button>
        <button type="button" className="round-icon" onClick={() => setModal('delete')} aria-label="Delete journal">
          <Trash2 size={16} />
        </button>
      </div>

      <div className="jr-workspace">
        <nav className="jr-tools" aria-label="Journal tools">
          <button type="button" className={tool === 'select' ? 'is-active' : ''} onClick={() => setTool('select')}>
            <MousePointer2 size={17} />
            <small>Select</small>
          </button>
          <button type="button" onClick={addText}>
            <Type size={17} />
            <small>Text</small>
          </button>
          <button type="button" onClick={() => setModal('photo-add')}>
            <ImagePlus size={17} />
            <small>Photo</small>
          </button>
          <button type="button" onClick={() => setModal('deco')}>
            <Sticker size={17} />
            <small>Decor</small>
          </button>
          <button
            type="button"
            className={tool === 'doodle' ? 'is-active' : ''}
            onClick={() => {
              setTool(tool === 'doodle' ? 'select' : 'doodle');
              setSelectedId(null);
            }}
          >
            <PenLine size={17} />
            <small>Doodle</small>
          </button>
          <button type="button" onClick={() => setModal('templates')}>
            <LayoutTemplate size={17} />
            <small>Layouts</small>
          </button>
        </nav>

        <div className="jr-desk">
          <div className="jr-page-nav">
            <button type="button" className="round-icon" onClick={() => goPage(pageIndex - 1)} disabled={pageIndex === 0} aria-label="Previous page">
              <ChevronLeft size={18} />
            </button>
            <div className="jr-fit-box" ref={fitRef}>
            <div className="jr-fit" ref={fitEl} style={{ width: PAGE_W * scale, height: PAGE_H * scale }}>
              <div
                key={page!.id}
                ref={pageRef}
                className={`jr-page-shell turn-${turn} ${tool === 'doodle' ? 'is-drawing' : ''} ${zoom > 1 ? 'is-zoomed' : ''}`}
                onClick={() => !panMoved.current && tool !== 'doodle' && setSelectedId(null)}
                style={{ transform: `scale(${scale})` }}
                onPointerDown={onPageDown}
                onPointerMove={onPageMove}
                onPointerUp={onPageUp}
                onPointerCancel={onPageUp}
              >
                <PageView
                  page={page!}
                  photos={photoMap}
                  selectedId={selectedId}
                  onItemDown={onItemDown}
                  onItemTap={(item) => !panMoved.current && setSelectedId(item.id)}
                />
                {drawing && (
                  <svg className="jr-live-doodle" viewBox={`0 0 ${PAGE_W} ${PAGE_H}`}>
                    <path d={doodlePath(drawing)} fill="none" stroke={pen.color} strokeWidth={pen.width} strokeOpacity={pen.alpha} strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </div>
            </div>
            </div>
            <button
              type="button"
              className="round-icon"
              onClick={() => (pageIndex === book.pages.length - 1 ? addPage() : goPage(pageIndex + 1))}
              aria-label={pageIndex === book.pages.length - 1 ? 'Add a page' : 'Next page'}
            >
              {pageIndex === book.pages.length - 1 ? <Plus size={18} /> : <ChevronRight size={18} />}
            </button>
          </div>

          <div className="jr-thumbs">
            {book.pages.map((pg, i) => (
              <button key={pg.id} type="button" className={`jr-thumb ${i === pageIndex ? 'is-active' : ''}`} onClick={() => goPage(i)} aria-label={`Page ${i + 1}`}>
                <span className="jr-thumb-scale">
                  <PageView page={pg} photos={photoMap} />
                </span>
                <small>{i + 1}</small>
              </button>
            ))}
            <button type="button" className="jr-thumb jr-thumb-add" onClick={() => addPage()} aria-label="Add page">
              <Plus size={18} />
            </button>
          </div>
        </div>

        <aside className="jr-inspector">
          {tool === 'doodle' ? (
            <div className="jr-panel">
              <span className="eyebrow">Doodle pen</span>
              <p className="jr-hint">Draw directly on the page. Each stroke becomes its own movable doodle.</p>
              <div className="jr-swatches">
                {SWATCHES.map((c) => (
                  <button key={c} type="button" style={{ background: c }} className={pen.color === c ? 'is-active' : ''} onClick={() => setPen({ ...pen, color: c })} aria-label={c} />
                ))}
                <input type="color" value={pen.color} onChange={(e) => setPen({ ...pen, color: e.target.value })} aria-label="Custom pen colour" />
              </div>
              <Range label="Thickness" min={1} max={24} value={pen.width} onChange={(v) => setPen({ ...pen, width: v })} />
              <div className="segmented">
                <button type="button" className={pen.alpha === 1 ? 'is-active' : ''} onClick={() => setPen({ ...pen, alpha: 1 })}>Pen</button>
                <button type="button" className={pen.alpha < 1 ? 'is-active' : ''} onClick={() => setPen({ ...pen, alpha: 0.4, width: Math.max(pen.width, 14) })}>Highlighter</button>
              </div>
            </div>
          ) : selected ? (
            <div className="jr-panel" key={selected.id}>
              <span className="eyebrow">{selected.type === 'deco' ? getDeco(selected.deco).name : selected.type}</span>
              {selected.type === 'text' && (
                <>
                  <textarea className="text-input jr-textarea" value={selected.text} onChange={(e) => updateItem(selected.id, { text: e.target.value }, false)} rows={4} />
                  <div className="segmented">
                    {(['serif', 'sans', 'mono', 'hand'] as const).map((f) => (
                      <button key={f} type="button" className={selected.font === f ? 'is-active' : ''} style={{ fontFamily: FONT_FAMILY[f] }} onClick={() => updateItem(selected.id, { font: f })}>
                        Aa
                      </button>
                    ))}
                  </div>
                  <Range label="Size" min={10} max={120} value={selected.size} onChange={(v) => updateItem(selected.id, { size: v }, false)} />
                  <div className="segmented">
                    {(['left', 'center', 'right'] as const).map((a) => (
                      <button key={a} type="button" className={selected.align === a ? 'is-active' : ''} onClick={() => updateItem(selected.id, { align: a })}>{a}</button>
                    ))}
                  </div>
                  <div className="segmented">
                    {(['none', 'highlight', 'tape', 'tag'] as const).map((l) => (
                      <button key={l} type="button" className={selected.label === l ? 'is-active' : ''} onClick={() => updateItem(selected.id, { label: l })}>{l === 'none' ? 'Plain' : l}</button>
                    ))}
                  </div>
                </>
              )}
              {selected.type === 'photo' && (
                <>
                  <button type="button" className="button button-outline button-full" onClick={() => setModal('photo-swap')}>
                    <ImagePlus size={14} /> {selected.photoId ? 'Change photo' : 'Choose photo'}
                  </button>
                  <div className="segmented jr-wrap">
                    {(['plain', 'polaroid', 'tape', 'round', 'circle'] as const).map((s) => (
                      <button key={s} type="button" className={selected.style === s ? 'is-active' : ''} onClick={() => updateItem(selected.id, { style: s })}>{s}</button>
                    ))}
                  </div>
                </>
              )}
              {(selected.type === 'text' || selected.type === 'deco' || selected.type === 'doodle') && !(selected.type === 'deco' && selected.deco.startsWith('emoji')) && (
                <div className="jr-swatches">
                  {SWATCHES.map((c) => (
                    <button key={c} type="button" style={{ background: c }} className={selected.color === c ? 'is-active' : ''} onClick={() => updateItem(selected.id, { color: c })} aria-label={c} />
                  ))}
                  <input type="color" value={selected.color} onChange={(e) => updateItem(selected.id, { color: e.target.value }, false)} aria-label="Custom colour" />
                </div>
              )}
              <Range label="Rotation" min={-180} max={180} value={Math.round(selected.r)} display={`${Math.round(selected.r)}°`} onChange={(v) => updateItem(selected.id, { r: v }, false)} />
              <div className="jr-item-actions">
                <button type="button" onClick={() => reorder('front')} title="Bring to front"><BringToFront size={15} /></button>
                <button type="button" onClick={() => reorder('back')} title="Send to back"><SendToBack size={15} /></button>
                <button type="button" onClick={duplicateSelected} title="Duplicate"><Copy size={15} /></button>
                <button type="button" onClick={removeSelected} title="Delete" className="danger"><Trash2 size={15} /></button>
              </div>
            </div>
          ) : (
            <div className="jr-panel">
              <span className="eyebrow"><Palette size={12} /> Page</span>
              <div className="jr-swatches">
                {SWATCHES.map((c) => (
                  <button key={c} type="button" style={{ background: c }} className={page!.bg === c ? 'is-active' : ''} onClick={() => updatePage((p) => ({ ...p, bg: c }))} aria-label={c} />
                ))}
                <input type="color" value={page!.bg} onChange={(e) => updatePage((p) => ({ ...p, bg: e.target.value }), false)} aria-label="Custom page colour" />
              </div>
              <span className="eyebrow">Paper</span>
              <div className="jr-papers">
                {PAPERS.map((p) => (
                  <button key={p} type="button" className={page!.paper === p ? 'is-active' : ''} onClick={() => updatePage((pg) => ({ ...pg, paper: p }))}>
                    <span style={paperCss(p, page!.bg)} />
                    <small>{p}</small>
                  </button>
                ))}
              </div>
              <span className="eyebrow">Cover colour</span>
              <div className="jr-swatches">
                {SWATCHES.map((c) => (
                  <button key={c} type="button" style={{ background: c }} className={book.cover === c ? 'is-active' : ''} onClick={() => updateBook((b) => ({ ...b, cover: c }))} aria-label={c} />
                ))}
              </div>
              <div className="jr-page-actions">
                <button type="button" className="button button-outline" onClick={() => setModal('templates')}><LayoutTemplate size={14} /> Layouts</button>
                <button type="button" className="button button-outline" onClick={() => addPage(true)}><Copy size={14} /> Duplicate</button>
                <button type="button" className="button button-outline" onClick={() => movePage(-1)} disabled={pageIndex === 0}><ChevronLeft size={14} /> Move</button>
                <button type="button" className="button button-outline" onClick={() => movePage(1)} disabled={pageIndex === book.pages.length - 1}>Move <ChevronRight size={14} /></button>
                <button type="button" className="button button-outline" onClick={deletePage} disabled={book.pages.length <= 1}><Trash2 size={14} /> Delete page</button>
              </div>
              <p className="jr-hint">Tip: click an item to edit it. Drag the corner dot to resize, the top dot to rotate. Delete key removes it.</p>
            </div>
          )}
        </aside>
      </div>

      {modal === 'deco' && (
        <Modal title="Decoration library" eyebrow={`${DECOS.length} pieces`} wide onClose={() => setModal(null)}>
          <div className="segmented jr-wrap">
            {DECO_CATS.map((c) => (
              <button key={c} type="button" className={decoCat === c ? 'is-active' : ''} onClick={() => setDecoCat(c)}>{c}</button>
            ))}
          </div>
          <div className="jr-deco-grid">
            {DECOS.filter((d) => d.cat === decoCat).map((d, i) => (
              <button key={d.id} type="button" onClick={() => addDeco(d.id)} title={d.name} style={{ animationDelay: `${i * 20}ms` }}>
                <img src={decoUrl(d.id, d.color)} alt={d.name} />
              </button>
            ))}
          </div>
          <p className="jr-hint">Tap to drop onto the page — the library stays open so you can add several.</p>
        </Modal>
      )}
      {modal === 'templates' && (
        <Modal title="Page layouts" eyebrow="Decorating recommendations" wide onClose={() => setModal(null)}>
          <p className="modal-copy">Replaces this page with a ready-made arrangement in your journal’s theme. Empty photo slots fill with your newest prints. (Undo with Ctrl+Z.)</p>
          <div className="jr-template-grid">
            {TEMPLATES.map((tp) => (
              <button key={tp.id} type="button" onClick={() => applyTemplate(tp.id)}>
                <span className="jr-template-preview">
                  <span className="jr-thumb-scale">
                    <PageView page={fillSlots(newPage(page!.bg, page!.paper, buildTemplate(tp.id, theme)))} photos={photoMap} />
                  </span>
                </span>
                <strong>{tp.name}</strong>
                <small>{tp.note}</small>
              </button>
            ))}
          </div>
        </Modal>
      )}
      {(modal === 'photo-add' || modal === 'photo-swap') && (
        <PhotoPicker
          photos={photos}
          onPick={(id) => {
            if (modal === 'photo-add') addPhoto(id);
            else if (selected) {
              updateItem(selected.id, { photoId: id });
              setModal(null);
            }
          }}
          onClose={() => setModal(null)}
        />
      )}
      {modal === 'delete' && (
        <Modal title={`Delete “${book.title}”?`} eyebrow="This cannot be undone" onClose={() => setModal(null)}>
          <p className="modal-copy">The journal and its {book.pages.length} pages will be removed. Photos stay in your archive.</p>
          <div className="modal-actions">
            <button type="button" className="button button-outline" onClick={() => setModal(null)}>Keep it</button>
            <button type="button" className="button button-danger" onClick={() => void removeBook()}>Delete journal</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

