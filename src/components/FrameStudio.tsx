import { Download, Share2, Eye, FileDown, Frame, ImagePlus, Images, Minus, Pencil, Plus, Printer, Redo2, Save, Trash2, Undo2, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { EditTarget, PhotoRecord, ProcessConfig, Watermark } from '../types';
import { BASE_EFFECTS, configForPreset, cropFit, renderProcessed } from '../lib/process';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { FRAME_STYLES } from '../lib/frames';
import { PAPERS, PRINT_SIZES, fmt, fromUnit, packPrints, toUnit, type Unit } from '../lib/print';
import { buildSheet, cropForPrint, renderPrint, type SheetItem } from '../lib/printRender';
import { useHistory } from '../lib/useHistory';
import { canvasToBlob, downloadBlob, fileSlug, loadImage, uid } from '../lib/utils';
import { canShareImages, shareImage } from '../lib/share';
import FramePicker, { type FrameValue } from './FramePicker';
import WatermarkControls from './WatermarkControls';
import PrintProjects, { PROJECTS, type ProjectKind } from './PrintProjects';
import CardStudio from './CardStudio';
import CalendarStudio from './CalendarStudio';
import ProcessView from './ProcessView';
import { PhotoPicker, Range, Spinner, Toggle, useObjectUrl } from './ui';

type Props = {
  photos: PhotoRecord[];
  source: PhotoRecord | null;
  onSource: (record: PhotoRecord | null) => void;
  onSave: (record: PhotoRecord) => Promise<void>;
  onImport: () => void;
  notify: (message: string, tone?: 'default' | 'warning') => void;
};

const PREVIEW = 900;
const NONE: FrameValue = { border: 'none', caption: '', scale: 1, paper: null };
type Orient = 'auto' | 'portrait' | 'landscape';

/** The same plain "as shot" config Process uses, with only the frame (and print crop) set: a framed copy re-opens in Process. */
const configFor = (v: FrameValue, crop?: number, wm?: Watermark | null, pan = { x: 0, y: 0 }): ProcessConfig => {
  const base = configForPreset('none');
  return {
    ...base,
    effects: { ...BASE_EFFECTS, ...base.effects, border: v.border, caption: v.caption, frameScale: v.scale, framePaper: v.paper, watermark: wm ?? null, ...(crop ? { aspect: 'free' as const, cropRatio: crop, cropX: pan.x, cropY: pan.y } : {}) },
  };
};

// The print sheet lives for the session, across tabs; prints are stored as finished JPEGs, not canvases.
let SHEET: SheetItem[] = [];
const MM = 1 / 25.4;

function SourceCard({ photo, onPick }: { photo: PhotoRecord; onPick: () => void }) {
  const url = useObjectUrl(photo.blob);
  return (
    <button type="button" className="picker-card" onClick={onPick}>
      <span className="picker-image">{url && <img src={url} alt="" />}</span>
      <span className="picker-meta">
        <strong>{photo.name}</strong>
        <small>{photo.filterName}</small>
      </span>
    </button>
  );
}

function SheetRow({ item, unit, onCopies, onRemove }: { item: SheetItem; unit: Unit; onCopies: (n: number) => void; onRemove: () => void }) {
  const url = useObjectUrl(item.blob);
  return (
    <li className="ps-row">
      {url && <img src={url} alt="" />}
      <span className="ps-meta">
        <strong>{item.name}</strong>
        <small>
          {fmt(item.w, unit)} × {fmt(item.h, unit)} {unit}
        </small>
      </span>
      <span className="ps-copies" aria-label="Copies">
        <button type="button" onClick={() => onCopies(item.copies - 1)} disabled={item.copies <= 1} aria-label="One fewer copy">
          <Minus size={12} />
        </button>
        <b>{item.copies}</b>
        <button type="button" onClick={() => onCopies(item.copies + 1)} disabled={item.copies >= 40} aria-label="One more copy">
          <Plus size={12} />
        </button>
      </span>
      <button type="button" className="ps-remove" onClick={onRemove} aria-label={`Remove ${item.name} from the sheet`}>
        <Trash2 size={14} />
      </button>
    </li>
  );
}

/** Lay prints onto paper and download them as a PDF that prints at true size. */
function PrintSheet({ items, setItems, unit, notify }: { items: SheetItem[]; setItems: (next: SheetItem[]) => void; unit: Unit; notify: Props['notify'] }) {
  const [paperId, setPaperId] = useState('a4');
  const [marginMm, setMarginMm] = useState(6);
  const [gapMm, setGapMm] = useState(3);
  const [cuts, setCuts] = useState(true);
  const [busy, setBusy] = useState(false);
  const paper = PAPERS.find((p) => p.id === paperId)!;
  const plan = useMemo(() => packPrints(items, paper, marginMm * MM, gapMm * MM), [items, paper, marginMm, gapMm]);
  const total = items.reduce((n, i) => n + i.copies, 0);
  const tooBig = items.filter((i) => plan.tooBig.includes(i.id));

  const download = async () => {
    setBusy(true);
    try {
      const { pdf } = await buildSheet(items, paper, marginMm * MM, gapMm * MM, cuts);
      if (pdf) downloadBlob(pdf, `delineate-prints-${new Date().toISOString().slice(0, 10)}.pdf`);
      notify('Print sheet ready. Print at 100% / "actual size" so every print comes out true to size.');
    } catch {
      notify('The print sheet could not be made.', 'warning');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="ps" aria-label="Print sheet">
      <div className="ps-head">
        <span className="eyebrow">
          <Printer size={12} /> Print sheet · {total} {total === 1 ? 'print' : 'prints'}
        </span>
        {items.length > 0 && (
          <button type="button" className="text-button" onClick={() => setItems([])}>
            Clear
          </button>
        )}
      </div>
      {items.length === 0 ? (
        <p className="ps-empty">Choose a print size, then “Add to print sheet”. Different photos and sizes share the same pages.</p>
      ) : (
        <>
          <ul className="ps-list">
            {items.map((it) => (
              <SheetRow
                key={it.id}
                item={it}
                unit={unit}
                onCopies={(n) => setItems(items.map((x) => (x.id === it.id ? { ...x, copies: Math.max(1, Math.min(40, n)) } : x)))}
                onRemove={() => setItems(items.filter((x) => x.id !== it.id))}
              />
            ))}
          </ul>
          <label className="ps-field">
            <span>Paper</span>
            <select className="text-input" value={paperId} onChange={(e) => setPaperId(e.target.value)}>
              {PAPERS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label} · {fmt(p.w, unit)} × {fmt(p.h, unit)} {unit}
                </option>
              ))}
            </select>
          </label>
          <Range label="Margin" min={0} max={20} step={1} value={marginMm} display={`${marginMm} mm`} onChange={setMarginMm} />
          <Range label="Gap between prints" min={0} max={12} step={1} value={gapMm} display={`${gapMm} mm`} onChange={setGapMm} />
          <Toggle checked={cuts} onChange={setCuts} label="Cut marks" />
          {tooBig.length > 0 && <p className="ps-warn">Too big for {paper.label}: {tooBig.map((i) => i.name).join(', ')}. Pick larger paper or a smaller size.</p>}
          <button type="button" className="button button-dark ps-go" onClick={() => void download()} disabled={busy || plan.pages.length === 0}>
            {busy ? <Spinner /> : <FileDown size={15} />}
            {busy ? 'Laying out…' : `Download PDF · ${plan.pages.length} ${plan.pages.length === 1 ? 'page' : 'pages'}`}
          </button>
        </>
      )}
    </section>
  );
}

/** Studio › Frames: choose a photo, frame it, size it for print, lay prints out on paper. */
export default function FrameStudio({ photos, source, onSource, onSave, onImport, notify }: Props) {
  const [value, setValue, history] = useHistory<FrameValue>(NONE);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [picking, setPicking] = useState(false);
  const [comparing, setComparing] = useState(false);
  const [busy, setBusy] = useState<'save' | 'download' | 'sheet' | null>(null);
  const [panel, setPanel] = useState<'frame' | 'print'>('frame');
  const [editing, setEditing] = useState<EditTarget | null>(null);
  const lastSaved = useRef<PhotoRecord | null>(null);
  // print size
  const [unit, setUnit] = useState<Unit>('in');
  const [sizeId, setSizeId] = useState<string | null>(null);
  const [custom, setCustom] = useState({ w: 4, h: 6 }); // inches
  const [orient, setOrient] = useState<Orient>('auto');
  const [copies, setCopies] = useState(1);
  const [wm, setWm] = useState<Watermark | null>(null);
  const [project, setProject] = useState<ProjectKind | null>(null);
  // where the print crop sits on the photo (-1..1 of the spare room each way); dragged in the preview
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; start: { x: number; y: number }; sx: number; sy: number } | null>(null);
  const [sheet, setSheetState] = useState<SheetItem[]>(SHEET);
  const setSheet = (next: SheetItem[]) => {
    SHEET = next;
    setSheetState(next);
  };
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sourceUrl = useObjectUrl(source?.blob);

  useEffect(() => {
    history.reset(NONE);
    setImage(null);
    if (!source) return;
    let live = true;
    loadImage(source.blob).then(
      (img) => live && setImage(img),
      () => notify('That image could not be opened.', 'warning'),
    );
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source]);

  // the print size in inches, turned to suit the photo (or as chosen)
  const inches = useMemo(() => {
    const base = sizeId === 'custom' ? custom : PRINT_SIZES.find((s) => s.id === sizeId);
    if (!base || !image) return null;
    const short = Math.min(base.w, base.h);
    const long = Math.max(base.w, base.h);
    const wide = orient === 'landscape' || (orient === 'auto' && image.naturalWidth > image.naturalHeight);
    return wide ? { w: long, h: short } : { w: short, h: long };
  }, [sizeId, custom, orient, image]);
  useEffect(() => setPan({ x: 0, y: 0 }), [sizeId, orient, source, custom]);
  const startDrag = (ev: ReactPointerEvent<HTMLElement>) => {
    const canvas = canvasRef.current;
    if (!crop || !image || !canvas) return;
    // slack = how far the photo can slide, as a fraction of the visible photo; screen size of the photo ≈ the preview
    const f = cropFit(image.naturalWidth, image.naturalHeight, { ...BASE_EFFECTS, zoom: 1, rotate: 0, straighten: 0 }, crop, 1);
    const r = canvas.getBoundingClientRect();
    drag.current = { x: ev.clientX, y: ev.clientY, start: pan, sx: (f.slackX / crop) * r.width * 0.85, sy: f.slackY * r.height * 0.85 };
    try {
      ev.currentTarget.setPointerCapture(ev.pointerId);
    } catch {
      /* synthetic pointer */
    }
  };
  const moveDrag = (ev: ReactPointerEvent<HTMLElement>) => {
    const d = drag.current;
    if (!d) return;
    const clamp = (v: number) => Math.max(-1, Math.min(1, v));
    // dragging right shows more of the left of the photo
    setPan({ x: d.sx ? clamp(d.start.x - (ev.clientX - d.x) / d.sx) : 0, y: d.sy ? clamp(d.start.y - (ev.clientY - d.y) / d.sy) : 0 });
  };
  const crop = useMemo(
    () => (inches ? cropForPrint(value.border, value.caption, { scale: value.scale, paper: value.paper }, inches.w / inches.h) : undefined),
    [inches, value.border, value.caption, value.scale, value.paper],
  );

  useEffect(() => {
    if (!image || !source) return;
    const t = window.setTimeout(() => {
      const out = renderProcessed(image, configFor(value, crop, wm, pan), { longSide: PREVIEW, date: source.createdAt });
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.width = out.width;
      canvas.height = out.height;
      canvas.getContext('2d')!.drawImage(out, 0, 0);
    }, 40);
    return () => window.clearTimeout(t);
  }, [image, value, source, crop, wm, pan]);

  useEffect(() => {
    if (editing) return; // Process has its own undo while it is open
    const onKey = (ev: KeyboardEvent) => {
      if (!(ev.ctrlKey || ev.metaKey) || (ev.target as HTMLElement)?.closest('input, textarea, select')) return;
      const k = ev.key.toLowerCase();
      if (k === 'z' && !ev.shiftKey) history.undo();
      else if (k === 'y' || (k === 'z' && ev.shiftKey)) history.redo();
      else return;
      ev.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [history, editing]);

  const label = FRAME_STYLES.find((f) => f.id === value.border)?.label ?? 'Frame';
  const sizeLabel = inches ? `${fmt(inches.w, unit)} × ${fmt(inches.h, unit)} ${unit}` : '';
  // the finished image: at print size and 300 dpi when a size is set, else the photo's own resolution
  const final = async () =>
    inches
      ? renderPrint(image!, configFor(value, crop, wm, pan), source!.createdAt, inches)
      : renderProcessed(image!, configFor(value, undefined, wm), { longSide: Math.min(2400, Math.max(image!.naturalWidth, image!.naturalHeight)), date: source!.createdAt });

  const save = async () => {
    if (!source || !image || busy) return;
    setBusy('save');
    try {
      const canvas = await final();
      const blob = await canvasToBlob(canvas, 'image/jpeg', 0.93);
      const name = `${source.name} · ${inches ? sizeLabel : label}`.slice(0, 60);
      await onSave({
        id: uid(),
        name,
        createdAt: Date.now(),
        blob,
        mime: 'image/jpeg',
        width: canvas.width,
        height: canvas.height,
        filterName: value.border === 'none' ? 'Print' : label,
        kind: source.kind === 'collage' ? 'collage' : 'still',
        developed: true,
        // the photo as it was is kept as the original, so the frame and crop can be changed later in Process
        original: source.blob,
        process: configFor(value, crop, wm, pan),
        camera: source.camera,
        place: source.place,
        note: `${value.border === 'none' ? 'Sized' : `Framed (${label})`}${inches ? ` for a ${sizeLabel} print` : ''} in the Studio`,
      });
      notify('Saved to your archive. The original is untouched.');
    } catch {
      notify('The copy could not be saved.', 'warning');
    } finally {
      setBusy(null);
    }
  };
  const download = async () => {
    if (!source || !image || busy) return;
    setBusy('download');
    try {
      downloadBlob(await canvasToBlob(await final(), 'image/jpeg', 0.93), `${fileSlug(source.name)}-${fileSlug(inches ? sizeLabel : label)}.jpg`);
    } finally {
      setBusy(null);
    }
  };
  const shareable = canShareImages();
  const share = async () => {
    if (!source || !image || busy) return;
    try {
      const blob = await canvasToBlob(await final(), 'image/jpeg', 0.93);
      await shareImage(blob, `${fileSlug(source.name)}-${fileSlug(inches ? sizeLabel : label)}.jpg`, source.name);
    } catch {
      notify('Sharing is not available here — use Download instead.', 'warning');
    }
  };
  const addToSheet = async () => {
    if (!source || !image || !inches || busy) return;
    setBusy('sheet');
    try {
      const canvas = await renderPrint(image, configFor(value, crop, wm, pan), source.createdAt, inches);
      const blob = await canvasToBlob(canvas, 'image/jpeg', 0.92);
      setSheet([...SHEET, { id: uid(), name: `${source.name} · ${value.border === 'none' ? sizeLabel : label}`.slice(0, 48), blob, w: inches.w, h: inches.h, copies }]);
      notify(`${copies} × ${sizeLabel} added to the print sheet.`);
    } catch {
      notify('That print could not be added.', 'warning');
    } finally {
      setBusy(null);
    }
  };

  const projects = (
    <section className="pj-row" aria-label="More to print">
      <span className="eyebrow">More to print</span>
      <div className="pj-tiles">
        {PROJECTS.map((p) => (
          <button key={p.id} type="button" onClick={() => setProject(p.id)}>
            <p.icon size={18} />
            <b>{p.label}</b>
            <small>{p.note}</small>
          </button>
        ))}
      </div>
      {(project === 'contact' || project === 'test') && <PrintProjects kind={project} photos={photos} source={source} onClose={() => setProject(null)} notify={notify} />}
    </section>
  );
  const picker = picking && (
    <PhotoPicker
      photos={photos}
      title="Choose a photo to print"
      onPick={(id) => {
        const rec = photos.find((p) => p.id === id);
        if (rec) onSource(rec);
        setPicking(false);
      }}
      onClose={() => setPicking(false)}
    />
  );

  // the greeting card maker takes the whole tab while it is open
  if (project === 'calendar') return <CalendarStudio photos={photos} onClose={() => setProject(null)} notify={notify} />;
  if (project === 'card') return <CardStudio photos={photos} start={source} onClose={() => setProject(null)} onSave={onSave} notify={notify} />;

  // Edit: the whole Process editor, inside this tab; saving or discarding comes back here
  if (editing) {
    return (
      <ProcessView
        photos={photos}
        target={editing}
        eyebrow="Studio / 07 · Frames · Edit"
        onTarget={(t) => {
          if (t) return setEditing(t);
          setEditing(null);
          if (lastSaved.current) onSource(lastSaved.current);
          lastSaved.current = null;
        }}
        onSave={async (r) => {
          await onSave(r);
          lastSaved.current = r;
        }}
        onImport={onImport}
        notify={notify}
      />
    );
  }

  if (!source) {
    return (
      <div className="art-page fs-page page-enter">
        <div className="page-kicker-row">
          <div className="page-kicker">
            <span className="eyebrow">Studio / 07 · Frames</span>
            <p>Frame it, size it, print it.</p>
          </div>
        </div>
        <section className="art-empty-hero">
          <div className="art-empty-copy">
            <span className="eyebrow">36 frames · print sizes in inches or cm</span>
            <h1>
              Made for <em>the print.</em>
            </h1>
            <p>Pick a photo, give it a frame and a caption, choose a print size, and lay as many prints as fit onto A4, Letter or photo paper. Download a PDF that prints at true size. Your original stays untouched.</p>
            <div className="hero-actions">
              <button className="button button-dark" type="button" onClick={() => setPicking(true)} disabled={!photos.length}>
                <Images size={15} /> Choose from archive
              </button>
              <button className="button button-outline" type="button" onClick={onImport}>
                <ImagePlus size={15} /> Import a photo
              </button>
            </div>
          </div>
        </section>
        {sheet.length > 0 && <PrintSheet items={sheet} setItems={setSheet} unit={unit} notify={notify} />}
        {projects}
        {photos.length > 0 && (
          <section className="art-source-section">
            <div className="section-heading">
              <div>
                <span className="eyebrow">The contact sheet · {photos.length} frames</span>
                <h3>Tap a photo to frame and print it</h3>
              </div>
            </div>
            <div className="art-source-grid">
              {photos.map((p) => (
                <SourceCard key={p.id} photo={p} onPick={() => onSource(p)} />
              ))}
            </div>
          </section>
        )}
        {picker}
      </div>
    );
  }

  const customIn = { w: toUnit(custom.w, unit), h: toUnit(custom.h, unit) };
  return (
    <div className="process-page fs-page page-enter">
      <div className="page-kicker-row">
        <div className="page-kicker">
          <span className="eyebrow">Studio / 07 · Frames</span>
          <p>{source.name}</p>
        </div>
        <div className="pr-top-actions fs-actions">
          <button type="button" className="button button-outline" onClick={() => setPicking(true)}>
            <Images size={14} /> Change
          </button>
          <button type="button" className="button button-outline" onClick={() => onSource(null)} title="Leave without saving">
            <X size={14} /> Discard
          </button>
          <button type="button" className="button button-outline" onClick={() => setEditing({ record: source, blob: source.blob, fileName: source.name })} title="Full editing: looks, effects, adjust and crop">
            <Pencil size={14} /> Edit
          </button>
          <button type="button" className="button button-outline" onClick={() => void download()} disabled={!image || busy !== null}>
            {busy === 'download' ? <Spinner /> : <Download size={14} />} Download
          </button>
          {shareable && (
            <button type="button" className="button button-outline" onClick={() => void share()} disabled={!image || busy !== null}>
              <Share2 size={14} /> Share
            </button>
          )}
          <button type="button" className="button button-dark" onClick={() => void save()} disabled={!image || busy !== null || (value.border === 'none' && !inches)}>
            {busy === 'save' ? <Spinner /> : <Save size={14} />} Save copy
          </button>
        </div>
      </div>

      <div className="pr-layout fs-layout">
        <section className="pr-stage">
          <div className="pr-canvas-wrap">
            <span
              className={`pr-canvas-frame ${crop ? 'is-cropping fs-drag' : ''}`}
              style={{ opacity: comparing ? 0 : 1 }}
              onPointerDown={startDrag}
              onPointerMove={moveDrag}
              onPointerUp={() => (drag.current = null)}
              onPointerCancel={() => (drag.current = null)}
            >
              <canvas ref={canvasRef} className="pr-canvas" />
            </span>
            {comparing && sourceUrl && <img className="pr-original" src={sourceUrl} alt="Without the frame" />}
            {comparing && <span className="pr-before-tag">Before</span>}
            {inches && !comparing && <span className="fs-size-tag">{sizeLabel}</span>}
            {!image && <span className="pr-loading">Loading…</span>}
          </div>
          <div className="pr-stage-foot">
            <button
              type="button"
              className={`button button-outline pr-compare ${comparing ? 'is-active' : ''}`}
              onPointerDown={() => setComparing(true)}
              onPointerUp={() => setComparing(false)}
              onPointerCancel={() => setComparing(false)}
              onPointerLeave={() => setComparing(false)}
              onContextMenu={(ev) => ev.preventDefault()}
            >
              <Eye size={14} /> Hold to compare
            </button>
            <span className="pr-undo">
              <button type="button" className="round-icon" onClick={history.undo} disabled={!history.canUndo} aria-label="Undo" title="Undo (Ctrl Z)">
                <Undo2 size={15} />
              </button>
              <button type="button" className="round-icon" onClick={history.redo} disabled={!history.canRedo} aria-label="Redo" title="Redo (Ctrl Shift Z)">
                <Redo2 size={15} />
              </button>
            </span>
            <span className="pr-name">
              <Frame size={12} /> {label}
              {inches ? ` · ${sizeLabel}` : ''}
            </span>
          </div>
        </section>
        <aside className="pr-controls fs-controls">
          <div className="segmented pr-tabs fs-tabs">
            <button type="button" className={panel === 'frame' ? 'is-active' : ''} onClick={() => setPanel('frame')}>
              <Frame size={13} /> Frame
            </button>
            <button type="button" className={panel === 'print' ? 'is-active' : ''} onClick={() => setPanel('print')}>
              <Printer size={13} /> Print {sheet.length > 0 && <b className="fs-count">{sheet.reduce((n, i) => n + i.copies, 0)}</b>}
            </button>
          </div>
          {panel === 'frame' ? (
            <div className="pr-group">
              <FramePicker title="Frames" value={value} onChange={(p) => setValue((v) => ({ ...v, ...p }))} />
              <WatermarkControls value={wm} onChange={setWm} />
            </div>
          ) : (
            <div className="pr-group">
              <div className="fs-size-head">
                <span className="eyebrow">Print size</span>
                <div className="segmented fs-unit" role="radiogroup" aria-label="Units">
                  {(['in', 'cm'] as const).map((u) => (
                    <button key={u} type="button" role="radio" aria-checked={unit === u} className={unit === u ? 'is-active' : ''} onClick={() => setUnit(u)}>
                      {u}
                    </button>
                  ))}
                </div>
              </div>
              <div className="fs-sizes">
                <button type="button" className={sizeId === null ? 'is-active' : ''} onClick={() => setSizeId(null)}>
                  <b>Original</b>
                  <small>no crop</small>
                </button>
                {PRINT_SIZES.map((s) => (
                  <button key={s.id} type="button" className={sizeId === s.id ? 'is-active' : ''} onClick={() => setSizeId(s.id)}>
                    <b>{s.label}</b>
                    <small>
                      {fmt(s.w, unit)} × {fmt(s.h, unit)}
                    </small>
                  </button>
                ))}
                <button type="button" className={sizeId === 'custom' ? 'is-active' : ''} onClick={() => setSizeId('custom')}>
                  <b>Custom</b>
                  <small>your size</small>
                </button>
              </div>
              {sizeId === 'custom' && (
                <div className="fs-custom">
                  {(['w', 'h'] as const).map((k) => (
                    <label key={k}>
                      <span>{k === 'w' ? 'Width' : 'Height'}</span>
                      <input
                        className="text-input"
                        type="number"
                        inputMode="decimal"
                        min={unit === 'in' ? 0.5 : 1}
                        max={unit === 'in' ? 16 : 40}
                        step={unit === 'in' ? 0.25 : 0.5}
                        value={+customIn[k].toFixed(2)}
                        onChange={(e) => {
                          const v = fromUnit(Number(e.target.value), unit);
                          if (Number.isFinite(v) && v >= 0.4 && v <= 16) setCustom((c) => ({ ...c, [k]: v }));
                        }}
                      />
                    </label>
                  ))}
                  <span className="fs-unit-note">{unit}</span>
                </div>
              )}
              {sizeId !== null && (
                <>
                  <div className="segmented fs-orient" role="radiogroup" aria-label="Orientation">
                    {(['auto', 'portrait', 'landscape'] as const).map((o) => (
                      <button key={o} type="button" role="radio" aria-checked={orient === o} className={orient === o ? 'is-active' : ''} onClick={() => setOrient(o)}>
                        {o === 'auto' ? 'Match photo' : o}
                      </button>
                    ))}
                  </div>
                  <small className="pr-hint">The {value.border === 'none' ? 'print' : 'framed print'} is exactly {sizeLabel}. Drag the photo in the preview to choose what stays in.</small>
                  <div className="fs-add">
                    <span className="ps-copies" aria-label="Copies">
                      <button type="button" onClick={() => setCopies((c) => Math.max(1, c - 1))} disabled={copies <= 1} aria-label="One fewer copy">
                        <Minus size={12} />
                      </button>
                      <b>{copies}</b>
                      <button type="button" onClick={() => setCopies((c) => Math.min(40, c + 1))} disabled={copies >= 40} aria-label="One more copy">
                        <Plus size={12} />
                      </button>
                    </span>
                    <button type="button" className="button button-dark" onClick={() => void addToSheet()} disabled={!image || busy !== null}>
                      {busy === 'sheet' ? <Spinner /> : <Printer size={14} />} Add to print sheet
                    </button>
                  </div>
                </>
              )}
              <PrintSheet items={sheet} setItems={setSheet} unit={unit} notify={notify} />
              {projects}
            </div>
          )}
        </aside>
      </div>
      {picker}
    </div>
  );
}
