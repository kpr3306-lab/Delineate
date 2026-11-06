import { useRef, type KeyboardEvent, type PointerEvent, type WheelEvent } from 'react';
import { haptic, playDetent } from '../lib/audio';

type KnobProps = {
  label: string;
  options: string[];
  index: number;
  onChange: (index: number) => void;
  dimmed?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  /** Sweep of the dial in degrees. */
  sweep?: number;
};

const STEP_PX = 16;

/**
 * A physical rotary dial: drag (any direction), scroll, click or use arrow keys.
 * Every detent clicks and buzzes like the real thing.
 */
export default function Knob({ label, options, index, onChange, dimmed, size = 'md', className = '', sweep = 270 }: KnobProps) {
  const drag = useRef<{ x: number; y: number; start: number; moved: boolean } | null>(null);
  const step = options.length > 1 ? sweep / (options.length - 1) : 0;
  const angle = -sweep / 2 + index * step;

  const set = (next: number) => {
    const clamped = Math.max(0, Math.min(options.length - 1, next));
    if (clamped === index) return;
    playDetent();
    haptic(6);
    onChange(clamped);
  };

  const onPointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { x: event.clientX, y: event.clientY, start: index, moved: false };
  };
  const onPointerMove = (event: PointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    if (!d) return;
    // right or up turns clockwise
    const delta = event.clientX - d.x - (event.clientY - d.y);
    if (Math.abs(delta) > 4) d.moved = true;
    set(d.start + Math.round(delta / STEP_PX));
  };
  const onPointerUp = () => {
    const d = drag.current;
    drag.current = null;
    if (d && !d.moved) set(index + 1 > options.length - 1 ? 0 : index + 1);
  };
  const onWheel = (event: WheelEvent<HTMLButtonElement>) => set(index + (event.deltaY > 0 ? -1 : 1));
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'ArrowUp' || event.key === 'ArrowRight') set(index + 1);
    else if (event.key === 'ArrowDown' || event.key === 'ArrowLeft') set(index - 1);
    else return;
    event.preventDefault();
  };

  return (
    <div className={`knob knob-${size} ${dimmed ? 'is-dimmed' : ''} ${className}`}>
      <button
        type="button"
        role="slider"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={options.length - 1}
        aria-valuenow={index}
        aria-valuetext={options[index]}
        className="knob-dial"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => (drag.current = null)}
        onWheel={onWheel}
        onKeyDown={onKeyDown}
        style={{ ['--knob-angle' as string]: `${angle}deg` }}
      >
        <span className="knob-ticks" aria-hidden="true">
          {options.map((_, i) => (
            <i key={i} style={{ transform: `rotate(${-sweep / 2 + i * step}deg)` }} className={i === index ? 'on' : ''} />
          ))}
        </span>
        <span className="knob-cap" aria-hidden="true">
          <span className="knob-mark" />
        </span>
      </button>
      <span className="knob-label">{label}</span>
      <span className="knob-value">{options[index]}</span>
    </div>
  );
}
