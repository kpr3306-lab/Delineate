import { createContext, useContext, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { haptic, playDetent } from '../lib/audio';
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

/** A continuous rotary knob: drag up/right to turn up, scroll, or arrow keys. Clicks every 5%. */
function RangeKnob({ label, value, min, max, step = 1, display, onChange }: RangeProps) {
  const drag = useRef<{ y: number; x: number; v: number } | null>(null);
  const lastDetent = useRef(Math.round(((value - min) / (max - min)) * 20));
  const progress = clamp((value - min) / (max - min), 0, 1);
  const set = (raw: number) => {
    const next = clamp(Math.round(raw / step) * step, min, max);
    if (next === value) return;
    const detent = Math.round(((next - min) / (max - min)) * 20);
    if (detent !== lastDetent.current) {
      lastDetent.current = detent;
      playDetent();
      haptic(3);
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
          drag.current = { x: e.clientX, y: e.clientY, v: value };
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (d) set(d.v + ((e.clientX - d.x - (e.clientY - d.y)) / 160) * (max - min));
        }}
        onPointerUp={() => (drag.current = null)}
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
  if (style === 'knobs') return <RangeKnob {...props} />;
  const { label, value, min, max, step = 1, display, accent = 'var(--accent)', onChange } = props;
  const progress = clamp(((value - min) / (max - min)) * 100, 0, 100);
  return (
    <label className="range-row">
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

export function Toast({
  message,
  tone = 'default',
}: {
  message: string;
  tone?: 'default' | 'warning';
}) {
  return (
    <div className={`toast toast-${tone}`} role="status">
      <span className="toast-mark" />
      <span>{message}</span>
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
export function PhotoPicker({
  photos,
  title = 'Choose a photo',
  selected = [],
  onPick,
  onClose,
}: {
  photos: { id: string; blob: Blob; name: string; filterName: string }[];
  title?: string;
  selected?: string[];
  onPick: (id: string) => void;
  onClose: () => void;
}) {
  return (
    <Modal title={title} eyebrow="From your archive" wide onClose={onClose}>
      {photos.length === 0 ? (
        <p className="modal-copy">No developed photos yet. Shoot and develop a few first, or import one.</p>
      ) : (
        <div className="pk-grid">
          {photos.map((photo) => (
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
      <div className="modal-actions">
        <button type="button" className="button button-dark" onClick={onClose}>
          Done
        </button>
      </div>
    </Modal>
  );
}
