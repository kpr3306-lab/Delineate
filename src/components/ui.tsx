import { createContext, useContext, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { haptic, isClickyOn, playDetent } from '../lib/audio';
import { X } from 'lucide-react';
import type { Look } from '../types';
import { overlayLayers } from '../lib/render';
import { clamp } from '../lib/utils';

export function useObjectUrl(blob?: Blob | null) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    if (!blob) {
      setUrl('');
      return;
    }
    const objectUrl = URL.createObjectURL(blob);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [blob]);
  return url;
}

export function LookOverlay({ look }: { look: Look }) {
  const layers = overlayLayers(look);
  return (
    <div className="look-overlays" aria-hidden="true">
      {layers.tone && <div className="look-layer" style={layers.tone} />}
      {layers.warmth && <div className="look-layer" style={layers.warmth} />}
      {layers.tint && <div className="look-layer" style={layers.tint} />}
      {layers.fade && <div className="look-layer" style={layers.fade} />}
      {layers.lightLeak && <div className="look-layer" style={layers.lightLeak} />}
      {layers.scanlines && <div className="look-layer" style={layers.scanlines} />}
      {layers.grain && <div className="look-layer" style={layers.grain} />}
      {layers.vignette && <div className="look-layer" style={layers.vignette} />}
    </div>
  );
}

type RangeProps = {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  display?: string;
  accent?: string;
  onChange: (value: number) => void;
};

export type ControlStyle = 'modern' | 'tactile' | 'knobs';
/** How sliders render app-wide: modern slider, chunky hardware fader (CSS), or rotary knob. */
export const ControlsContext = createContext<ControlStyle>('modern');

type Drag = { x: number; y: number; v: number; on: boolean };

/** A touch drag only counts once it's clearly sideways, so a scroll that starts on a control never changes it. */
function engaged(d: Drag, e: { clientX: number; clientY: number }) {
  if (d.on) return true;
  const dx = e.clientX - d.x;
  if (Math.abs(dx) < 8 || Math.abs(dx) < Math.abs(e.clientY - d.y)) return false;
  Object.assign(d, { on: true, x: e.clientX, y: e.clientY });
  return true;
}

/** A continuous rotary knob: drag up/right to turn up, scroll, or arrow keys. Clicks every 5%. */
function RangeKnob({ label, value, min, max, step = 1, display, onChange }: RangeProps) {
  const drag = useRef<Drag | null>(null);
  const lastDetent = useRef(Math.round(((value - min) / (max - min)) * 20));
  const progress = clamp((value - min) / (max - min), 0, 1);
  const set = (raw: number) => {
    const next = clamp(Math.round(raw / step) * step, min, max);
    if (next === value) return;
    const detent = Math.round(((next - min) / (max - min)) * 20);
    if (detent !== lastDetent.current) {
      lastDetent.current = detent;
      if (isClickyOn()) {
        playDetent();
        haptic(3);
      }
    }
    onChange(+next.toFixed(4));
  };
  return (
    <div className="knob knob-sm rk">
      <button
        type="button"
        role="slider"
        aria-label={label}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-valuetext={display ?? String(value)}
        className="knob-dial"
        onPointerDown={(e) => {
          try {
            e.currentTarget.setPointerCapture(e.pointerId);
          } catch {
            /* synthetic pointer */
          }
          drag.current = { x: e.clientX, y: e.clientY, v: value, on: e.pointerType !== 'touch' };
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d || !engaged(d, e)) return;
          // touch turns sideways only; vertical is left to page scrolling
          const dy = e.pointerType === 'touch' ? 0 : e.clientY - d.y;
          set(d.v + ((e.clientX - d.x - dy) / 160) * (max - min));
        }}
        onPointerUp={() => (drag.current = null)}
        onPointerCancel={() => (drag.current = null)}
        onDoubleClick={() => set(min <= 0 && max >= 0 ? 0 : min)}
        onWheel={(e) => set(value - Math.sign(e.deltaY) * (max - min) * 0.04)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowUp' || e.key === 'ArrowRight') set(value + (max - min) * 0.05);
          else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') set(value - (max - min) * 0.05);
          else return;
          e.preventDefault();
        }}
        style={{ ['--knob-angle' as string]: `${-135 + progress * 270}deg` }}
      >
        <span className="knob-ticks" aria-hidden="true">
          {Array.from({ length: 11 }, (_, i) => (
            <i key={i} style={{ transform: `rotate(${-135 + i * 27}deg)` }} className={i / 10 <= progress ? 'on' : ''} />
          ))}
        </span>
        <span className="knob-cap" aria-hidden="true">
          <span className="knob-mark" />
        </span>
      </button>
      <span className="knob-label">{label}</span>
      <span className="knob-value">{display ?? value}</span>
    </div>
  );
}

export function Range(props: RangeProps) {
  const style = useContext(ControlsContext);
  // separate components so switching control style never changes one component's hook order
  return style === 'knobs' ? <RangeKnob {...props} /> : <RangeSlider {...props} style={style} />;
}

function RangeSlider({ style, ...props }: RangeProps & { style: ControlStyle }) {
  const { label, value, min, max, step = 1, display, accent = 'var(--accent)' } = props;
  const drag = useRef<Drag | null>(null);
  const lastDetent = useRef(Math.round(((value - min) / (max - min)) * 20));
  const progress = clamp(((value - min) / (max - min)) * 100, 0, 100);
  // the tactile fader clicks through 20 detents like a hardware slider (Customise → Controls)
  const onChange = (next: number) => {
    const detent = Math.round(((next - min) / (max - min)) * 20);
    if (style === 'tactile' && detent !== lastDetent.current && isClickyOn()) {
      playDetent();
      haptic(3);
    }
    lastDetent.current = detent;
    props.onChange(next);
  };
  // On touch screens the native input ignores pointers (CSS), so taps and scrolls can't jump it;
  // a sideways drag anywhere on the row nudges the value relative to where it was.
  return (
    <label
      className="range-row"
      onPointerDown={(e) => {
        // the input itself got the touch (fine-pointer touchscreen): let it work natively
        if (e.pointerType === 'touch' && !(e.target instanceof HTMLInputElement)) drag.current = { x: e.clientX, y: e.clientY, v: value, on: false };
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (!d || !engaged(d, e)) return;
        const raw = d.v + ((e.clientX - d.x) / e.currentTarget.clientWidth) * (max - min);
        const next = +clamp(Math.round(raw / step) * step, min, max).toFixed(4);
        if (next !== value) onChange(next);
      }}
      onPointerUp={() => (drag.current = null)}
      onPointerCancel={() => (drag.current = null)}
    >
      <span className="range-meta">
        <span>{label}</span>
        <span className="range-value">{display ?? value}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        style={
          {
            '--range-progress': `${progress}%`,
            '--range-accent': accent,
          } as CSSProperties
        }
      />
    </label>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      className={`toggle ${checked ? 'is-on' : ''}`}
      aria-pressed={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
    >
      <span className="toggle-track">
        <span className="toggle-thumb" />
      </span>
      <span>{label}</span>
    </button>
  );
}

type ModalProps = {
  title: string;
  eyebrow?: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
  className?: string;
};

export function Modal({ title, eyebrow, onClose, children, wide, className }: ModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener('keydown', handler);
    };
  }, [onClose]);

  // Portal to the app shell: pages animate with a transform, which would pin a fixed overlay to the
  // scrolled page content (off-screen) instead of the screen. The shell sits inside #root, so it still
  // turns with the portrait-lock rotation.
  return createPortal(
    <div
      className="modal-overlay"
      ref={overlayRef}
      onMouseDown={(event) => {
        if (event.target === overlayRef.current) onClose();
      }}
    >
      <div
        className={`modal-panel ${wide ? 'modal-wide' : ''} ${className ?? ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <header className="modal-header">
          <div>
            {eyebrow && <span className="eyebrow">{eyebrow}</span>}
            <h2>{title}</h2>
          </div>
          <button className="round-icon" type="button" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </header>
        {children}
      </div>
    </div>,
    document.querySelector('.app-shell') ?? document.body,
  );
}

export type ToastAction = { label: string; run: () => void };

export function Toast({
  message,
  tone = 'default',
  action,
  onAction,
}: {
  message: string;
  tone?: 'default' | 'warning';
  action?: ToastAction;
  onAction?: () => void;
}) {
  return (
    <div className={`toast toast-${tone} ${action ? 'has-action' : ''}`} role="status">
      <span className="toast-mark" />
      <span>{message}</span>
      {action && (
        <button type="button" className="toast-action" onClick={onAction}>
          {action.label}
        </button>
      )}
    </div>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <span className="spinner-wrap">
      <span className="spinner" />
      {label && <span>{label}</span>}
    </span>
  );
}

export function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon: ReactNode;
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <span className="empty-icon">{icon}</span>
      <h3>{title}</h3>
      <p>{body}</p>
      {action}
    </div>
  );
}

export function Thumb({ photo, className }: { photo: { blob: Blob; name: string }; className?: string }) {
  const url = useObjectUrl(photo.blob);
  return url ? <img className={className} src={url} alt={photo.name} loading="lazy" /> : <span className={className} />;
}

/** Archive photo chooser shared by Processing, Journal, Collage and the Art Lab. */
type PickerPhoto = { id: string; blob: Blob; name: string; filterName: string; kind?: string; favorite?: boolean; createdAt?: number };
const PICKER_FILTERS: { id: string; label: string; test: (p: PickerPhoto) => boolean }[] = [
  { id: 'all', label: 'All', test: () => true },
  { id: 'fav', label: 'Favourites', test: (p) => Boolean(p.favorite) },
  { id: 'still', label: 'Stills', test: (p) => !p.kind || p.kind === 'still' },
  { id: 'art', label: 'Art', test: (p) => p.kind === 'art' },
  { id: 'collage', label: 'Collages', test: (p) => p.kind === 'collage' },
  { id: 'animated', label: 'GIFs', test: (p) => p.kind === 'animated' },
];

export function PhotoPicker({
  photos,
  title = 'Choose a photo',
  selected = [],
  onPick,
  onClose,
}: {
  photos: PickerPhoto[];
  title?: string;
  selected?: string[];
  onPick: (id: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [order, setOrder] = useState<'new' | 'old' | 'name'>('new');
  // only offer filters that would show something
  const filters = PICKER_FILTERS.filter((f) => f.id === 'all' || photos.some(f.test));
  const q = query.trim().toLowerCase();
  const shown = photos
    .filter((p) => (PICKER_FILTERS.find((f) => f.id === filter) ?? PICKER_FILTERS[0]).test(p))
    .filter((p) => !q || p.name.toLowerCase().includes(q) || p.filterName.toLowerCase().includes(q))
    .sort((a, b) => (order === 'name' ? a.name.localeCompare(b.name) : ((b.createdAt ?? 0) - (a.createdAt ?? 0)) * (order === 'new' ? 1 : -1)));
  return (
    <Modal title={title} eyebrow="From your archive" wide onClose={onClose}>
      {photos.length === 0 ? (
        <p className="modal-copy">No developed photos yet. Shoot and develop a few first, or import one.</p>
      ) : (
        <>
          <div className="pk-toolbar">
            <input className="text-input pk-search" type="search" value={query} placeholder="Search by name or film" aria-label="Search photos" onChange={(e) => setQuery(e.target.value)} />
            <div className="segmented pk-order" role="group" aria-label="Sort">
              {(['new', 'old', 'name'] as const).map((o) => (
                <button key={o} type="button" className={order === o ? 'is-active' : ''} onClick={() => setOrder(o)}>
                  {o === 'new' ? 'Newest' : o === 'old' ? 'Oldest' : 'A–Z'}
                </button>
              ))}
            </div>
          </div>
          {filters.length > 1 && (
            <div className="pk-filters" role="group" aria-label="Filter">
              {filters.map((f) => (
                <button key={f.id} type="button" className={filter === f.id ? 'is-active' : ''} onClick={() => setFilter(f.id)}>
                  {f.label} <small>{photos.filter(f.test).length}</small>
                </button>
              ))}
            </div>
          )}
          {shown.length === 0 ? (
            <p className="modal-copy">Nothing matches. Try another filter or search.</p>
          ) : (
            <div className="pk-grid">
              {shown.map((photo) => (
                <button
                  key={photo.id}
                  type="button"
                  className={`pk-item ${selected.includes(photo.id) ? 'is-selected' : ''}`}
                  onClick={() => onPick(photo.id)}
                >
                  <Thumb photo={photo} />
                  <span>{photo.name}</span>
                </button>
              ))}
            </div>
          )}
        </>
      )}
      <div className="modal-actions">
        <button type="button" className="button button-dark" onClick={onClose}>
          Done
        </button>
      </div>
    </Modal>
  );
}
