import { Frame, Share2, ChevronLeft, ChevronRight, Download, FlaskConical, FolderPlus, Heart, Info, MapPin, Pencil, PencilLine, Sparkles, Trash2, X } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { PhotoRecord } from '../types';
import { formatBytes } from '../lib/backup';
import { canShareImages, shareImage } from '../lib/share';
import { useObjectUrl } from './ui';

type Props = {
  photos: PhotoRecord[];
  index: number;
  onIndex: (index: number) => void;
  onClose: () => void;
  onEdit: (record: PhotoRecord) => void;
  onArt: (record: PhotoRecord) => void;
  onFrame: (record: PhotoRecord) => void;
  onDevelop: (record: PhotoRecord) => void;
  onFavorite: (record: PhotoRecord) => void;
  onAlbum: (record: PhotoRecord) => void;
  onSave: (record: PhotoRecord) => void;
  onDelete: (record: PhotoRecord) => void;
  onRename: (record: PhotoRecord, name: string) => void;
};

const KIND: Record<PhotoRecord['kind'], string> = { still: 'Photo', collage: 'Collage', art: 'Art study', animated: 'Animated GIF' };

/** Full-screen look at one archive frame: swipe or arrow through the roll, act on it, read its details. */
export default function PhotoViewer({ photos, index, onIndex, onClose, onEdit, onArt, onFrame, onDevelop, onFavorite, onAlbum, onSave, onDelete, onRename }: Props) {
  const record = photos[index];
  const url = useObjectUrl(record?.blob);
  const [details, setDetails] = useState(() => {
    try {
      return localStorage.getItem('delineate-viewer-details') === '1';
    } catch {
      return false;
    }
  });
  // Zoom: pinch / wheel / double-tap. Pointers are tracked by id; one finger pans when zoomed, swipes when not.
  type View = { s: number; x: number; y: number };
  const [view, setView] = useState<View>({ s: 1, x: 0, y: 0 });
  const stageRef = useRef<HTMLDivElement>(null);
  const pts = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ kind: 'swipe' | 'pan' | 'pinch'; x: number; y: number; v: View; dist: number; moved: boolean } | null>(null);
  const lastTap = useRef<{ t: number; x: number; y: number } | null>(null);
  useEffect(() => setView({ s: 1, x: 0, y: 0 }), [record?.id]);
  /** Keep the zoomed photo covering the stage instead of drifting off it. */
  const fit = (v: View): View => {
    const r = stageRef.current?.getBoundingClientRect();
    if (!r || v.s <= 1) return { s: 1, x: 0, y: 0 };
    const mx = ((v.s - 1) * r.width) / 2;
    const my = ((v.s - 1) * r.height) / 2;
    return { s: Math.min(v.s, 5), x: Math.max(-mx, Math.min(mx, v.x)), y: Math.max(-my, Math.min(my, v.y)) };
  };
  /** Zoom to scale s, keeping the screen point (px, py) still. */
  const zoomAt = (from: View, s: number, px: number, py: number): View => {
    const r = stageRef.current!.getBoundingClientRect();
    const mx = px - (r.left + r.width / 2);
    const my = py - (r.top + r.height / 2);
    const k = s / from.s;
    return fit({ s, x: mx - (mx - from.x) * k, y: my - (my - from.y) * k });
  };
  const centre = () => {
    const a = [...pts.current.values()];
    return { x: (a[0].x + a[1].x) / 2, y: (a[0].y + a[1].y) / 2, d: Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y) || 1 };
  };
  const closeRef = useRef<HTMLButtonElement>(null);
  const shareable = canShareImages();
  const [naming, setNaming] = useState<string | null>(null); // draft name while renaming
  useEffect(() => setNaming(null), [record?.id]);
  const commitName = () => {
    const name = naming?.trim().slice(0, 60);
    setNaming(null);
    if (record && name && name !== record.name) onRename(record, name);
  };

  const go = (d: number) => {
    const next = index + d;
    if (next >= 0 && next < photos.length) onIndex(next);
  };

  useEffect(() => closeRef.current?.focus(), []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (document.querySelector('.modal-overlay')) return; // a dialog on top owns the keys
      if (e.target instanceof HTMLInputElement) return; // typing a name
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowLeft') go(-1);
      else if (e.key === 'ArrowRight') go(1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
  const toggleDetails = () =>
    setDetails((v) => {
      try {
        localStorage.setItem('delineate-viewer-details', v ? '0' : '1');
      } catch {
        /* per-viewer convenience only */
      }
      return !v;
    });

  if (!record) return null;
  const negative = record.developed === false;
  const when = new Date(record.createdAt);
  const rows: [string, ReactNode][] = [
    ['Date', when.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })],
    ['Time', when.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })],
    ['Camera', record.camera ?? (record.kind === 'still' ? 'Imported' : '—')],
    ['Look', record.filterName || '—'],
    ...(record.note ? ([['Settings', record.note]] as [string, string][]) : []),
    ['Size', `${record.width} × ${record.height} px · ${formatBytes(record.blob.size)}${record.fullRes ? ` · full ${record.fullSize ?? ''} original kept (${formatBytes(record.fullRes.size)})` : ''}`],
    ['Type', `${KIND[record.kind]}${negative ? ' · undeveloped negative' : record.process ? ' · edited' : ''}`],
    [
      'Location',
      record.place ? (
        <a href={`https://www.openstreetmap.org/?mlat=${record.place.lat}&mlon=${record.place.lon}#map=16/${record.place.lat}/${record.place.lon}`} target="_blank" rel="noreferrer">
          <MapPin size={12} /> {record.place.lat.toFixed(4)}, {record.place.lon.toFixed(4)}
          {record.place.acc ? ` (±${record.place.acc} m)` : ''}
        </a>
      ) : (
        <span className="pv-muted">Not recorded — turn on location tags in Customise › Data</span>
      ),
    ],
  ];

  // Portal to the app shell like Modal: the page's entrance transform would otherwise box this "fixed" overlay in.
  return createPortal(
    <div className={`pv ${details ? 'has-details' : ''}`} role="dialog" aria-modal="true" aria-label={`${record.name}, ${index + 1} of ${photos.length}`}>
      <header className="pv-top">
        <button ref={closeRef} type="button" className="pv-icon" onClick={onClose} aria-label="Close">
          <X size={20} />
        </button>
        <div className="pv-title">
          {naming !== null ? (
            <input
              className="pv-name-input"
              value={naming}
              maxLength={60}
              autoFocus
              aria-label="Frame name"
              onFocus={(e) => e.currentTarget.select()}
              onChange={(e) => setNaming(e.target.value)}
              onBlur={commitName}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitName();
                else if (e.key === 'Escape') setNaming(null);
              }}
            />
          ) : (
            <button type="button" className="pv-name" onClick={() => setNaming(record.name)} title="Rename" aria-label={`Rename ${record.name}`}>
              <strong>{record.name}</strong>
              <PencilLine size={13} aria-hidden="true" />
            </button>
          )}
          <span>
            {index + 1} / {photos.length}
          </span>
        </div>
        <button type="button" className={`pv-icon ${record.favorite ? 'is-fav' : ''}`} onClick={() => onFavorite(record)} aria-pressed={Boolean(record.favorite)} aria-label={record.favorite ? 'Remove from favourites' : 'Add to favourites'}>
          <Heart size={19} />
        </button>
        {shareable && (
          <button
            type="button"
            className="pv-icon"
            aria-label="Share"
            onClick={() => void shareImage(record.blob, `${record.name.replace(/[^\w-]+/g, '-')}.${record.mime.includes('png') ? 'png' : record.mime.includes('gif') ? 'gif' : 'jpg'}`, record.name).catch(() => undefined)}
          >
            <Share2 size={18} />
          </button>
        )}
        <button type="button" className={`pv-icon ${details ? 'is-on' : ''}`} onClick={toggleDetails} aria-expanded={details} aria-label="Details">
          <Info size={19} />
        </button>
      </header>

      <div
        className="pv-stage"
        ref={stageRef}
        onPointerDown={(e) => {
          if ((e.target as HTMLElement).closest('button')) return;
          try {
            e.currentTarget.setPointerCapture(e.pointerId);
          } catch {
            /* synthetic pointer */
          }
          pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
          if (pts.current.size === 2) {
            const c = centre();
            gesture.current = { kind: 'pinch', x: c.x, y: c.y, v: view, dist: c.d, moved: true };
          } else if (pts.current.size === 1) {
            gesture.current = { kind: view.s > 1 ? 'pan' : 'swipe', x: e.clientX, y: e.clientY, v: view, dist: 0, moved: false };
          }
        }}
        onPointerMove={(e) => {
          if (!pts.current.has(e.pointerId)) return;
          pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
          const g = gesture.current;
          if (!g) return;
          if (Math.hypot(e.clientX - g.x, e.clientY - g.y) > 6) g.moved = true;
          if (g.kind === 'pinch' && pts.current.size >= 2) {
            const c = centre();
            const s = Math.max(1, Math.min(5, (g.v.s * c.d) / g.dist));
            // zoom about the original midpoint, then follow the fingers as they move together
            const z = zoomAt(g.v, s, g.x, g.y);
            setView(fit({ s: z.s, x: z.x + (c.x - g.x), y: z.y + (c.y - g.y) }));
          } else if (g.kind === 'pan') {
            setView(fit({ s: g.v.s, x: g.v.x + e.clientX - g.x, y: g.v.y + e.clientY - g.y }));
          }
        }}
        onPointerUp={(e) => {
          pts.current.delete(e.pointerId);
          const g = gesture.current;
          if (pts.current.size === 1 && g?.kind === 'pinch') {
            // one finger lifted: carry on as a pan from where the other one is
            const [p] = [...pts.current.values()];
            gesture.current = { kind: 'pan', x: p.x, y: p.y, v: view, dist: 0, moved: true };
            return;
          }
          if (pts.current.size) return;
          gesture.current = null;
          if (!g) return;
          const dx = e.clientX - g.x;
          if (g.kind === 'swipe' && Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(e.clientY - g.y)) {
            go(dx < 0 ? 1 : -1);
            return;
          }
          if (g.moved) return;
          // a tap: two quick taps toggle zoom at that spot
          const now = Date.now();
          const t = lastTap.current;
          if (t && now - t.t < 320 && Math.hypot(e.clientX - t.x, e.clientY - t.y) < 30) {
            lastTap.current = null;
            setView(view.s > 1 ? { s: 1, x: 0, y: 0 } : zoomAt(view, 2.5, e.clientX, e.clientY));
          } else lastTap.current = { t: now, x: e.clientX, y: e.clientY };
        }}
        onPointerCancel={(e) => {
          pts.current.delete(e.pointerId);
          if (!pts.current.size) gesture.current = null;
        }}
        onWheel={(e) => setView((v) => zoomAt(v, Math.max(1, Math.min(5, v.s * Math.exp(-e.deltaY * 0.0015))), e.clientX, e.clientY))}
      >
        {url && (
          <img
            key={record.id}
            src={url}
            alt={record.name}
            className={`${negative ? 'is-negative' : ''} ${view.s > 1 ? 'is-zoomed' : ''}`}
            draggable={false}
            style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.s})` }}
          />
        )}
        <button type="button" className="pv-nav is-prev" onClick={() => go(-1)} disabled={index === 0} aria-label="Previous photo">
          <ChevronLeft size={24} />
        </button>
        <button type="button" className="pv-nav is-next" onClick={() => go(1)} disabled={index === photos.length - 1} aria-label="Next photo">
          <ChevronRight size={24} />
        </button>
      </div>

      {details && (
        <aside className="pv-details" aria-label="Photo details">
          <dl>
            {rows.map(([k, v]) => (
              <div key={k} className={k === 'Settings' || k === 'Location' ? 'is-wide' : undefined}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
        </aside>
      )}

      <nav className="pv-actions" aria-label="Photo actions">
        {negative ? (
          <button type="button" onClick={() => onDevelop(record)}>
            <FlaskConical size={18} />
            <span>Develop</span>
          </button>
        ) : (
          <>
            <button type="button" onClick={() => onEdit(record)} disabled={record.kind === 'animated'}>
              <Pencil size={18} />
              <span>{record.process ? 'Re-edit' : 'Edit'}</span>
            </button>
            <button type="button" onClick={() => onArt(record)}>
              <Sparkles size={18} />
              <span>Art</span>
            </button>
            <button type="button" onClick={() => onFrame(record)}>
              <Frame size={18} />
              <span>Frame</span>
            </button>
          </>
        )}
        <button type="button" onClick={() => onAlbum(record)}>
          <FolderPlus size={18} />
          <span>Album</span>
        </button>
        <button type="button" onClick={() => onSave(record)}>
          <Download size={18} />
          <span>Save</span>
        </button>
        <button type="button" className="is-danger" onClick={() => onDelete(record)}>
          <Trash2 size={18} />
          <span>Delete</span>
        </button>
      </nav>
    </div>,
    document.querySelector('.app-shell') ?? document.body,
  );
}
