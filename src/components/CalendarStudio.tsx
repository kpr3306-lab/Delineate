import '@fontsource/great-vibes/400.css';
import { ArrowLeft, FileDown, Images, Redo2, Undo2, Wand2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { PhotoRecord } from '../types';
import { ACCENTS, CAL_FONTS, DATE_STYLES, LAYOUTS, calendarPdf, drawCalPage, pageLabel, paperOf, printedPages, type Cal, type CalPage } from '../lib/calendarRender';
import { useHistory } from '../lib/useHistory';
import { downloadBlob, loadImage } from '../lib/utils';
import { PhotoPicker, Range, Spinner, Thumb, Toggle } from './ui';

type Props = { photos: PhotoRecord[]; onClose: () => void; notify: (message: string, tone?: 'default' | 'warning') => void };

const CENTRED = { x: 0, y: 0, zoom: 1 };
/** Favourites first, then the newest: the photos a calendar starts with. */
const autoFill = (photos: PhotoRecord[]): CalPage[] => {
  const order = [...photos.filter((p) => p.favorite), ...photos.filter((p) => !p.favorite).sort((a, b) => b.createdAt - a.createdAt)];
  return Array.from({ length: 13 }, (_, i) => ({ photoId: order.length ? order[i % order.length].id : null, pan: CENTRED }));
};

/** Studio › Frames › Photo calendar: layouts, date styles, a photo per month placed by hand, PDF. */
export default function CalendarStudio({ photos, onClose, notify }: Props) {
  const now = new Date();
  const [cal, setCal, history] = useHistory<Cal>(() => ({
    year: now.getMonth() >= 9 ? now.getFullYear() + 1 : now.getFullYear(),
    startMonth: 0,
    monday: true,
    paper: 'a4',
    layout: 'classic',
    dates: 'boxes',
    font: 'serif',
    accent: ACCENTS[0],
    cover: true,
    title: '',
    pages: autoFill(photos),
  }));
  const [page, setPage] = useState(1);
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [fontsReady, setFontsReady] = useState(false);
  const images = useRef(new Map<string, HTMLImageElement>());
  const [, setLoaded] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drag = useRef<{ x: number; y: number; start: { x: number; y: number } } | null>(null);
  const set = (patch: Partial<Cal>) => setCal((c) => ({ ...c, ...patch }));
  const setPage_ = (patch: Partial<CalPage>) => setCal((c) => ({ ...c, pages: c.pages.map((p, i) => (i === page ? { ...p, ...patch } : p)) }));
  const byId = useMemo(() => new Map(photos.map((p) => [p.id, p])), [photos]);
  const current = cal.pages[page];
  const currentPhoto = current?.photoId ? byId.get(current.photoId) ?? null : null;
  const paper = paperOf(cal);
  const aspect = paper.h / paper.w;

  useEffect(() => {
    void Promise.all(['48px "Great Vibes"', '48px "Instrument Serif"', '48px "DM Mono"'].map((f) => document.fonts?.load(f))).finally(() => setFontsReady(true));
  }, []);
  useEffect(() => {
    if (!cal.cover && page === 0) setPage(1);
  }, [cal.cover, page]);
  // decode the photo for the page on show (each one once)
  const image = async (p: number) => {
    const id = cal.pages[p]?.photoId;
    const rec = id ? byId.get(id) : null;
    if (!rec) return null;
    const known = images.current.get(rec.id);
    if (known) return known;
    const img = await loadImage(rec.blob);
    images.current.set(rec.id, img);
    return img;
  };
  useEffect(() => {
    let live = true;
    void image(page).then(() => live && setLoaded((n) => n + 1));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, current?.photoId]);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c || !fontsReady) return;
    c.width = 720;
    c.height = Math.round(720 * aspect);
    const id = cal.pages[page]?.photoId;
    drawCalPage(c.getContext('2d')!, c.width, c.height, cal, page, id ? images.current.get(id) ?? null : null);
  });

  const point = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
  };
  const down = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!currentPhoto) return;
    const p = point(e);
    drag.current = { x: p.x, y: p.y, start: { x: current.pan.x, y: current.pan.y } };
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* synthetic pointer */
    }
  };
  const move = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const d = drag.current;
    if (!d) return;
    const p = point(e);
    const clamp = (v: number) => Math.max(-1, Math.min(1, v));
    // finger right shows more of the photo's left side
    setPage_({ pan: { ...current.pan, x: clamp(d.start.x - (p.x - d.x) * 2.5), y: clamp(d.start.y - (p.y - d.y) * 2.5) } });
  };

  const download = async () => {
    setBusy(true);
    try {
      downloadBlob(await calendarPdf(cal, image), `delineate-calendar-${cal.year}-${cal.paper}.pdf`);
      notify('Calendar ready to print.');
    } catch (error) {
      console.error(error);
      notify('The calendar could not be made.', 'warning');
    } finally {
      setBusy(false);
    }
  };

  const pages = printedPages(cal);
  return (
    <div className="process-page fs-page cs-page cal-page page-enter">
      <div className="page-kicker-row">
        <div className="page-kicker">
          <span className="eyebrow">Studio / 07 · Frames · Photo calendar</span>
          <p>
            {cal.year} · {LAYOUTS.find((l) => l.id === cal.layout)!.label} · {paper.label}
          </p>
        </div>
        <div className="pr-top-actions fs-actions">
          <button type="button" className="button button-outline" onClick={onClose}>
            <ArrowLeft size={14} /> Back
          </button>
          <button type="button" className="button button-dark" onClick={() => void download()} disabled={busy || !photos.length}>
            {busy ? <Spinner /> : <FileDown size={14} />} {busy ? 'Making…' : `Print PDF · ${pages.length} pages`}
          </button>
        </div>
      </div>

      <div className="pr-layout fs-layout">
        <section className="pr-stage cs-stage">
          <div className="cal-pages" role="tablist" aria-label="Calendar pages">
            {pages.map((p) => (
              <button key={p} type="button" role="tab" aria-selected={page === p} className={page === p ? 'is-active' : ''} onClick={() => setPage(p)}>
                {pageLabel(cal, p)}
              </button>
            ))}
          </div>
          <div className="cs-canvas-wrap">
            <div className="cs-canvas-box">
              <canvas
                ref={canvasRef}
                className="cs-canvas"
                style={{ aspectRatio: `${paper.w} / ${paper.h}` }}
                onPointerDown={down}
                onPointerMove={move}
                onPointerUp={() => (drag.current = null)}
                onPointerCancel={() => (drag.current = null)}
              />
            </div>
          </div>
          <div className="pr-stage-foot">
            <span className="pr-undo">
              <button type="button" className="round-icon" onClick={history.undo} disabled={!history.canUndo} aria-label="Undo">
                <Undo2 size={15} />
              </button>
              <button type="button" className="round-icon" onClick={history.redo} disabled={!history.canRedo} aria-label="Redo">
                <Redo2 size={15} />
              </button>
            </span>
            <span className="pr-name">{currentPhoto ? 'Drag the photo to position it' : 'Choose a photo for this page'}</span>
          </div>
        </section>

        <aside className="pr-controls fs-controls cs-controls">
          <div className="pr-group">
            <span className="eyebrow">This page · {pageLabel(cal, page)}</span>
            <div className="cs-photo">
              {currentPhoto ? <Thumb photo={currentPhoto} className="pj-thumb" /> : <span className="pj-thumb" />}
              <button type="button" className="button button-outline" onClick={() => setPicking(true)} disabled={!photos.length}>
                <Images size={14} /> {currentPhoto ? 'Change photo' : 'Choose photo'}
              </button>
            </div>
            {currentPhoto && (
              <div className="cs-pan">
                <Range label="Photo zoom" min={1} max={3} step={0.01} value={current.pan.zoom} display={`${current.pan.zoom.toFixed(2)}×`} onChange={(v) => setPage_({ pan: { ...current.pan, zoom: v } })} />
                {(current.pan.x !== 0 || current.pan.y !== 0 || current.pan.zoom !== 1) && (
                  <button type="button" className="text-button" onClick={() => setPage_({ pan: CENTRED })}>
                    Reset photo position
                  </button>
                )}
              </div>
            )}
            <button type="button" className="text-button cal-auto" onClick={() => set({ pages: autoFill(photos) })} disabled={!photos.length}>
              <Wand2 size={13} /> Fill every page automatically (favourites first)
            </button>

            <span className="eyebrow">Layout</span>
            <div className="cs-templates">
              {LAYOUTS.map((l) => (
                <button key={l.id} type="button" className={`cs-tpl cal-tpl is-${l.id} ${cal.layout === l.id ? 'is-active' : ''}`} onClick={() => set({ layout: l.id })}>
                  <i aria-hidden="true" />
                  <b>{l.label}</b>
                  <small>{l.note}</small>
                </button>
              ))}
            </div>
            <span className="eyebrow">Dates</span>
            <div className="segmented cs-seg" role="radiogroup" aria-label="Date style">
              {DATE_STYLES.map((d) => (
                <button key={d.id} type="button" role="radio" aria-checked={cal.dates === d.id} className={cal.dates === d.id ? 'is-active' : ''} onClick={() => set({ dates: d.id })}>
                  {d.label}
                </button>
              ))}
            </div>
            <div className="segmented cs-seg" role="radiogroup" aria-label="Week starts on">
              {[true, false].map((mon) => (
                <button key={String(mon)} type="button" role="radio" aria-checked={cal.monday === mon} className={cal.monday === mon ? 'is-active' : ''} onClick={() => set({ monday: mon })}>
                  Week starts {mon ? 'Monday' : 'Sunday'}
                </button>
              ))}
            </div>
            <span className="eyebrow">Month names</span>
            <div className="segmented cs-seg cs-fonts" role="radiogroup" aria-label="Month font">
              {CAL_FONTS.map((f) => (
                <button key={f.id} type="button" role="radio" aria-checked={cal.font === f.id} className={cal.font === f.id ? 'is-active' : ''} style={{ fontFamily: f.css }} onClick={() => set({ font: f.id })}>
                  {f.label}
                </button>
              ))}
            </div>
            <div className="cs-swatches" role="radiogroup" aria-label="Accent colour">
              <span>Accent</span>
              {ACCENTS.map((a) => (
                <button key={a} type="button" role="radio" aria-checked={cal.accent === a} aria-label={`Accent ${a}`} className={cal.accent === a ? 'is-active' : ''} style={{ background: a }} onClick={() => set({ accent: a })} />
              ))}
            </div>

            <span className="eyebrow">Year &amp; paper</span>
            <div className="pj-grid2">
              <label className="ps-field">
                <span>Year</span>
                <input className="text-input" type="number" inputMode="numeric" min={2000} max={2100} value={cal.year} onChange={(e) => set({ year: Math.min(2100, Math.max(2000, Number(e.target.value) || cal.year)) })} />
              </label>
              <label className="ps-field">
                <span>Starts in</span>
                <select className="text-input" value={cal.startMonth} onChange={(e) => set({ startMonth: Number(e.target.value) })}>
                  {Array.from({ length: 12 }, (_, m) => (
                    <option key={m} value={m}>
                      {new Date(2024, m, 1).toLocaleDateString(undefined, { month: 'long' })}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="segmented cs-seg" role="radiogroup" aria-label="Paper">
              {(['a4', 'a5', 'letter', 'a3'] as const).map((p) => (
                <button key={p} type="button" role="radio" aria-checked={cal.paper === p} className={cal.paper === p ? 'is-active' : ''} onClick={() => set({ paper: p })}>
                  {p === 'letter' ? 'Letter' : p.toUpperCase()}
                </button>
              ))}
            </div>
            <Toggle checked={cal.cover} onChange={(v) => set({ cover: v })} label="Cover page" />
            {cal.cover && <input className="text-input" value={cal.title} maxLength={40} placeholder={`Cover title (default: ${cal.year})`} aria-label="Cover title" onChange={(e) => set({ title: e.target.value })} />}
          </div>
        </aside>
      </div>
      {picking && (
        <PhotoPicker
          photos={photos}
          title={`Photo for ${pageLabel(cal, page)}`}
          onPick={(id) => {
            setPage_({ photoId: id, pan: CENTRED });
            setPicking(false);
          }}
          onClose={() => setPicking(false)}
        />
      )}
    </div>
  );
}
