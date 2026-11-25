import type { Watermark } from '../types';
import { Range, Toggle } from './ui';

const LAST = 'delineate-watermark'; // the last signature, so it is one tap next time (travels with the backup)
const DEFAULT: Watermark = { text: '', font: 'hand', pos: 'br', size: 5, opacity: 0.85, ink: 'light' };
const FONTS: { id: Watermark['font']; label: string }[] = [
  { id: 'hand', label: 'Hand' },
  { id: 'serif', label: 'Serif' },
  { id: 'sans', label: 'Sans' },
  { id: 'mono', label: 'Type' },
];
const SPOTS: { id: Watermark['pos']; label: string }[] = [
  { id: 'tl', label: '↖' },
  { id: 'tr', label: '↗' },
  { id: 'c', label: '•' },
  { id: 'bl', label: '↙' },
  { id: 'br', label: '↘' },
];

const remembered = (): Watermark => {
  try {
    return { ...DEFAULT, ...(JSON.parse(localStorage.getItem(LAST) ?? '{}') as Partial<Watermark>) };
  } catch {
    return DEFAULT;
  }
};

/** Signature / watermark: your own text on the photo, in your font, corner, size and strength. */
export default function WatermarkControls({ value, onChange }: { value: Watermark | null | undefined; onChange: (next: Watermark | null) => void }) {
  const set = (patch: Partial<Watermark>) => {
    const next = { ...(value ?? remembered()), ...patch };
    try {
      localStorage.setItem(LAST, JSON.stringify(next));
    } catch {
      /* private mode */
    }
    onChange(next);
  };
  return (
    <div className="wm">
      <Toggle checked={Boolean(value)} onChange={(on) => onChange(on ? remembered() : null)} label="Signature / watermark" />
      {value && (
        <>
          <input className="text-input" value={value.text} maxLength={40} placeholder="Your name, initials or ©" aria-label="Watermark text" onChange={(e) => set({ text: e.target.value })} />
          <div className="wm-row">
            <div className="segmented wm-fonts" role="radiogroup" aria-label="Watermark font">
              {FONTS.map((f) => (
                <button key={f.id} type="button" role="radio" aria-checked={value.font === f.id} className={`is-${f.id} ${value.font === f.id ? 'is-active' : ''}`} onClick={() => set({ font: f.id })}>
                  {f.label}
                </button>
              ))}
            </div>
            <div className="segmented wm-ink" role="radiogroup" aria-label="Watermark colour">
              {(['light', 'dark'] as const).map((k) => (
                <button key={k} type="button" role="radio" aria-checked={value.ink === k} aria-label={k === 'light' ? 'White' : 'Black'} className={`is-${k} ${value.ink === k ? 'is-active' : ''}`} onClick={() => set({ ink: k })}>
                  <i />
                </button>
              ))}
            </div>
          </div>
          <div className="wm-spots" role="radiogroup" aria-label="Watermark position">
            {SPOTS.map((s) => (
              <button key={s.id} type="button" role="radio" aria-checked={value.pos === s.id} aria-label={`Position ${s.id}`} className={`is-${s.id} ${value.pos === s.id ? 'is-active' : ''}`} onClick={() => set({ pos: s.id })}>
                {s.label}
              </button>
            ))}
          </div>
          <Range label="Size" min={2} max={14} step={0.5} value={value.size} display={`${value.size}%`} onChange={(v) => set({ size: v })} />
          <Range label="Strength" min={0.2} max={1} step={0.05} value={value.opacity} display={`${Math.round(value.opacity * 100)}%`} onChange={(v) => set({ opacity: v })} />
        </>
      )}
    </div>
  );
}
