import { Camera, Check, FastForward, Lightbulb, SkipForward, Sparkles, Wand2 } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type PointerEvent as RPointerEvent, type ReactNode } from 'react';
import type { PhotoRecord } from '../types';
import { BASE_LOOK } from '../lib/filters';
import { renderFrame } from '../lib/render';
import { canvasToBlob, clamp, loadImage, pad } from '../lib/utils';
import { haptic, playHum, playPaper, playPour, playSlosh, playSuccess, playTick } from '../lib/audio';
import { EmptyState, useObjectUrl } from './ui';

type DevelopViewProps = {
  roll: PhotoRecord[];
  focusId: string | null;
  onSave: (record: PhotoRecord) => Promise<void>;
  notify: (message: string, tone?: 'default' | 'warning') => void;
  onCamera: () => void;
  onProcess: (record: PhotoRecord) => void;
};

/* The print's journey through the darkroom. Each station first needs the print carried to it. */
const STEPS = [
  { id: 'expose', name: 'Expose', station: 'Enlarger', carry: 'Drag a sheet of photo paper from the box onto the easel.',
    work: 'Hold EXPOSE (or the space bar) to switch on the enlarger lamp. Aim for 4–6 seconds.',
    fact: 'Light passing through the negative leaves an invisible “latent image” in the silver salts of the paper.' },
  { id: 'develop', name: 'Developer', station: 'Developer tray', carry: 'Carry the exposed paper into the DEVELOPER tray.',
    work: 'Rock the tray — drag side to side, use ← →, or tap Rock. Pull the print out when the meter is in the green.',
    fact: 'Developer turns exposed silver halide into metallic silver. Leave it too long and the print goes muddy.' },
  { id: 'stop', name: 'Stop bath', station: 'Stop tray', carry: 'Lift the print into the STOP bath.',
    work: 'A few quick rocks neutralise the developer.',
    fact: 'Stop bath is mild acetic acid — that’s why darkrooms smell faintly of vinegar.' },
  { id: 'fix', name: 'Fixer', station: 'Fixer tray', carry: 'Move the print into the FIXER.',
    work: 'Keep rocking until the print is fixed — then you can turn on the lights!',
    fact: 'Fixer dissolves the unexposed silver so the print stops being sensitive to light.' },
  { id: 'wash', name: 'Wash', station: 'Wash basin', carry: 'Take the print to the running-water wash.',
    work: 'Hold RINSE to wash the chemicals away.',
    fact: 'Fibre prints were washed for up to an hour. We’ll pretend you did.' },
  { id: 'dry', name: 'Dry', station: 'Drying line', carry: 'Hang the print on the drying line.',
    work: 'Let it drip dry…',
    fact: 'Prints curl as they dry — photographers flattened them under heavy books.' },
] as const;
type StepId = (typeof STEPS)[number]['id'] | 'done';

const TARGET = 5;

function useHold(onTick: (dt: number) => void, active: boolean) {
  const raf = useRef(0);
  const last = useRef(0);
  useEffect(() => {
    if (!active) return;
    last.current = performance.now();
    const loop = (now: number) => {
      onTick((now - last.current) / 1000);
      last.current = now;
      raf.current = requestAnimationFrame(loop);
    };
    raf.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf.current);
  }, [active, onTick]);
}

function Negative({ photo, active, onClick, index }: { photo: PhotoRecord; active: boolean; onClick: () => void; index: number }) {
  const url = useObjectUrl(photo.blob);
  return (
    <button type="button" className={`dv-neg ${active ? 'is-active' : ''}`} onClick={onClick} aria-label={`Develop ${photo.name}`}>
      {url && <img src={url} alt="" />}
      <span>{pad(index + 1, 2)}A</span>
    </button>
  );
}

/** Print you can carry with the tongs: drag it, release over the glowing station. */
function Carry({ children, dropRef, onDrop }: { children: ReactNode; dropRef: React.RefObject<HTMLDivElement | null>; onDrop: () => void }) {
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const start = useRef({ x: 0, y: 0 });
  const down = (e: RPointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    start.current = { x: e.clientX, y: e.clientY };
    setDragging(true);
    playPaper();
    haptic(6);
  };
  const move = (e: RPointerEvent<HTMLDivElement>) => {
    if (dragging) setOffset({ x: e.clientX - start.current.x, y: e.clientY - start.current.y });
  };
  const up = (e: RPointerEvent<HTMLDivElement>) => {
    setDragging(false);
    const rect = dropRef.current?.getBoundingClientRect();
    if (rect && e.clientX > rect.left && e.clientX < rect.right && e.clientY > rect.top && e.clientY < rect.bottom) {
      haptic([10, 40, 10]);
      onDrop();
    }
    setOffset({ x: 0, y: 0 });
  };
  return (
    <div
      className={`dv-carry ${dragging ? 'is-dragging' : ''}`}
      style={{ transform: `translate(${offset.x}px, ${offset.y}px) rotate(${dragging ? clamp(offset.x / 30, -8, 8) : -4}deg)` }}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={() => {
        setDragging(false);
        setOffset({ x: 0, y: 0 });
      }}
      role="button"
      tabIndex={0}
      aria-label="Carry the print to the next station (or press Enter)"
      onKeyDown={(e) => e.key === 'Enter' && onDrop()}
    >
      {children}
      <span className="dv-tongs" aria-hidden="true" />
    </div>
  );
}

export default function DevelopView({ roll, focusId, onSave, notify, onCamera, onProcess }: DevelopViewProps) {
  const [selectedId, setSelectedId] = useState<string | null>(focusId);
  const [step, setStep] = useState<StepId>('expose');
  const [placed, setPlaced] = useState(false); // print has reached the current station
  const [exposure, setExposure] = useState(0);
  const [exposing, setExposing] = useState(false);
  const [dev, setDev] = useState(0);
  const [stopP, setStopP] = useState(0);
  const [fixP, setFixP] = useState(0);
  const [washP, setWashP] = useState(0);
  const [rinsing, setRinsing] = useState(false);
  const [dryP, setDryP] = useState(0);
  const [lightsOn, setLightsOn] = useState(false);
  const [tilt, setTilt] = useState(0);
  const [result, setResult] = useState<{ grade: string; record: PhotoRecord; notes: string[] } | null>(null);
  const [saving, setSaving] = useState(false);
  const dropRef = useRef<HTMLDivElement>(null);
  const rockState = useRef({ dir: 0, turnX: 0, lastX: 0, active: false });

  // once saved, the print leaves the roll — keep showing the finished record
  const selected = roll.find((p) => p.id === selectedId) ?? (result?.record.id === selectedId ? result.record : null);
  const url = useObjectUrl(selected?.blob);
  const stepIndex = STEPS.findIndex((s) => s.id === step);
  const meta = STEPS[stepIndex] ?? null;

  useEffect(() => {
    if (focusId) setSelectedId(focusId);
  }, [focusId]);

  const reset = useCallback(() => {
    setStep('expose');
    setPlaced(false);
    setExposure(0);
    setDev(0);
    setStopP(0);
    setFixP(0);
    setWashP(0);
    setDryP(0);
    setLightsOn(false);
    setTilt(0);
    setResult(null);
  }, []);

  const choose = (id: string) => {
    setSelectedId(id);
    reset();
    playPaper();
    haptic(8);
  };

  // Exposure timer runs while the lamp is held on.
  useHold(useCallback((dt) => setExposure((e) => e + dt), []), exposing);
  // Developer keeps working slowly even without agitation — leave it too long and it overdevelops.
  useHold(useCallback((dt) => setDev((d) => Math.min(1.7, d + dt * 0.035)), []), step === 'develop' && placed);
  useHold(useCallback((dt) => setWashP((w) => Math.min(1, w + dt / 2.6)), []), rinsing);
  useHold(useCallback((dt) => setDryP((d) => Math.min(1, d + dt / 3)), []), step === 'dry' && placed);

  useEffect(() => {
    if (washP >= 1 && step === 'wash') {
      setRinsing(false);
      advance();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [washP, step]);

  const advance = () => {
    const next = STEPS[stepIndex + 1]?.id ?? 'done';
    setStep(next);
    setPlaced(false);
    setTilt(0);
    playTick(true);
  };

  const startExpose = () => {
    if (step !== 'expose' || !placed || exposing) return;
    setExposing(true);
    playHum(0.4);
    haptic(20);
  };
  const endExpose = () => {
    if (!exposing) return;
    setExposing(false);
    haptic(10);
  };

  const rock = (dir: 1 | -1) => {
    if (!placed) return;
    setTilt(dir * 7);
    window.setTimeout(() => setTilt(0), 260);
    playSlosh();
    haptic(12);
    if (step === 'develop') setDev((d) => Math.min(1.7, d + 0.085));
    if (step === 'stop') setStopP((s) => Math.min(1, s + 0.34));
    if (step === 'fix') setFixP((f) => Math.min(1, f + 0.13));
  };

  // Keyboard: space = expose, arrows = rock.
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (['INPUT', 'TEXTAREA'].includes(tag)) return;
      if (e.code === 'Space' && step === 'expose') {
        e.preventDefault();
        startExpose();
      }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') rock(e.key === 'ArrowLeft' ? -1 : 1);
    };
    const up = (e: KeyboardEvent) => e.code === 'Space' && endExpose();
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  });

  const trayDown = (e: RPointerEvent<HTMLDivElement>) => {
    if (!placed) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    rockState.current = { dir: 0, turnX: e.clientX, lastX: e.clientX, active: true };
  };
  const trayMove = (e: RPointerEvent<HTMLDivElement>) => {
    const r = rockState.current;
    if (!r.active) return;
    const dir = Math.sign(e.clientX - r.lastX);
    r.lastX = e.clientX;
    setTilt(clamp((e.clientX - r.turnX) / 6, -9, 9));
    if (dir && dir !== r.dir) {
      if (Math.abs(e.clientX - r.turnX) > 28) rock(dir as 1 | -1);
      r.dir = dir;
      r.turnX = e.clientX;
    }
  };
  const trayUp = () => {
    rockState.current.active = false;
    setTilt(0);
  };

  const onPlaced = () => {
    setPlaced(true);
    if (step === 'develop' || step === 'stop' || step === 'fix') playPour(0.6);
    else playPaper();
  };

  // Finish: bake exposure + development into the print and grade the darkroom work.
  const finish = useCallback(async () => {
    if (!selected) return;
    setSaving(true);
    try {
      const expErr = clamp((exposure - TARGET) / TARGET, -1, 1);
      const devErr = clamp(dev - 1, -0.6, 0.7);
      const brightness = clamp(1 - expErr * 0.24 - devErr * 0.38, 0.45, 1.6);
      const contrast = clamp(1 + devErr * 0.22 - Math.abs(expErr) * 0.06, 0.7, 1.4);
      const image = await loadImage(selected.blob);
      const canvas = renderFrame(image, image.naturalWidth, image.naturalHeight, image.naturalWidth, image.naturalHeight, {
        ...BASE_LOOK,
        brightness,
        contrast,
        fade: dev < 0.85 ? 0.12 : 0,
      });
      const blob = await canvasToBlob(canvas, 'image/jpeg', 0.92);
      const score = 100 - Math.abs(expErr) * 70 - Math.abs(devErr) * 90;
      const grade = score >= 88 ? 'A' : score >= 72 ? 'B' : score >= 55 ? 'C' : 'D';
      const notes = [
        `Exposure ${exposure.toFixed(1)}s — ${Math.abs(expErr) < 0.2 ? 'spot on' : expErr > 0 ? 'a little dense (darker)' : 'a little thin (lighter)'}`,
        `Development ${Math.round(dev * 100)}% — ${Math.abs(devErr) < 0.15 ? 'perfect timing' : devErr > 0 ? 'left in a bit long' : 'pulled out early'}`,
      ];
      const record: PhotoRecord = {
        ...selected,
        blob,
        developed: true,
        filterName: `Darkroom print · ${grade}`,
        note: `${selected.note ?? ''}${selected.note ? ' · ' : ''}Hand developed (grade ${grade})`,
      };
      await onSave(record);
      setResult({ grade, record, notes });
      playSuccess();
      haptic([20, 60, 20, 60, 40]);
    } catch (error) {
      console.error(error);
      notify('The print could not be finished. Try again.', 'warning');
    } finally {
      setSaving(false);
    }
  }, [selected, exposure, dev, onSave, notify]);

  useEffect(() => {
    if (step === 'dry' && dryP >= 1 && !result && !saving) {
      setStep('done');
      void finish();
    }
  }, [step, dryP, result, saving, finish]);

  const skipOne = async (photo: PhotoRecord) => {
    await onSave({ ...photo, developed: true, filterName: 'Developed (lab)' });
  };
  const skipFrame = async () => {
    if (!selected) return;
    await skipOne(selected);
    notify(`${selected.name} sent to the lab and developed.`);
    playSuccess();
    setSelectedId(null);
    reset();
  };
  const skipAll = async () => {
    for (const photo of roll) await skipOne(photo);
    notify(`${roll.length} frames developed by the one-hour lab.`);
    playSuccess();
    setSelectedId(null);
    reset();
  };

  // How the print looks right now.
  const expBias = clamp((exposure - TARGET) / TARGET, -1, 1);
  let printFilter = 'brightness(4) contrast(0.3)';
  let imageOpacity = 0;
  if (step === 'expose' && exposing) imageOpacity = 0; // latent image: nothing visible yet
  if (stepIndex >= 1 || step === 'done') {
    const p = step === 'develop' ? dev : Math.max(dev, 0);
    const b = p < 1 ? 1 + (1 - p) ** 1.6 * 4 : 1 - (p - 1) * 0.9;
    imageOpacity = step === 'develop' && !placed ? 0 : clamp(p * 1.4, 0, 1);
    printFilter = `brightness(${(b * (1 - expBias * 0.24)).toFixed(3)}) contrast(${(0.6 + Math.min(p, 1) * 0.4 + Math.max(0, p - 1) * 0.3).toFixed(3)})`;
  }
  if (result) {
    printFilter = 'none'; // the saved print already has exposure + development baked in
    imageOpacity = 1;
  }

  const print = (
    <div className="dv-print">
      {url && <img src={url} alt="" style={{ opacity: imageOpacity, filter: printFilter }} />}
    </div>
  );

  if (!roll.length && !result) {
    return (
      <div className="develop-page page-enter">
        <div className="page-kicker-row">
          <div className="page-kicker">
            <span className="eyebrow">Develop / 02</span>
            <p>The darkroom. Where latent images become memories.</p>
          </div>
        </div>
        <EmptyState
          icon={<Camera size={26} />}
          title="The roll is empty"
          body="Every frame you shoot lands here as an undeveloped negative. Go take a few pictures, then come back to print them by hand."
          action={
            <button type="button" className="button button-dark" onClick={onCamera}>
              <Camera size={15} /> Load the camera
            </button>
          }
        />
      </div>
    );
  }

  const developDone = step === 'develop' && dev >= 0.9;
  const stationReady =
    (step === 'expose' && exposure >= 0.5 && !exposing) || developDone || (step === 'stop' && stopP >= 1) || (step === 'fix' && fixP >= 1);
  const meter = step === 'develop' ? dev / 1.7 : step === 'stop' ? stopP : step === 'fix' ? fixP : step === 'wash' ? washP : step === 'dry' ? dryP : exposure / 10;

  return (
    <div className="develop-page page-enter">
      <div className="page-kicker-row">
        <div className="page-kicker">
          <span className="eyebrow">Develop / 02</span>
          <p>The darkroom. Where latent images become memories.</p>
        </div>
        <div className="dv-skip-row">
          {selected && step !== 'done' && (
            <button type="button" className="button button-outline" onClick={skipFrame}>
              <SkipForward size={14} /> Skip this frame
            </button>
          )}
          <button type="button" className="button button-outline" onClick={skipAll}>
            <FastForward size={14} /> Lab-develop whole roll ({roll.length})
          </button>
        </div>
      </div>

      <section className="dv-roll" aria-label="Your undeveloped roll">
        <div className="dv-roll-strip">
          {roll.map((photo, i) => (
            <Negative key={photo.id} photo={photo} index={i} active={photo.id === selectedId} onClick={() => choose(photo.id)} />
          ))}
        </div>
        <span className="dv-roll-label">ROLL · {roll.length} NEGATIVES · TAP ONE TO PRINT</span>
      </section>

      {!selected && !result ? (
        <div className="dv-pick-hint">
          <Wand2 size={22} />
          <p>Pick a negative from the roll above to step into the darkroom.</p>
        </div>
      ) : (
        <div className="dv-layout">
          <section
            className={`dv-room step-${step} ${lightsOn ? 'lights-on' : ''}`}
            style={{ ['--tilt' as string]: `${tilt}deg` }}
          >
            <div className="dv-safelight" aria-hidden="true" />

            {/* Stations */}
            {step === 'expose' && (
              <div className="dv-scene dv-enlarger-scene">
                <div className={`dv-enlarger ${exposing ? 'is-on' : ''}`} aria-hidden="true">
                  <span className="dv-head" />
                  <span className="dv-column" />
                  <span className="dv-lens" />
                  <span className="dv-cone" />
                </div>
                <div className={`dv-easel dv-drop ${!placed ? 'is-target' : ''}`} ref={dropRef}>
                  {placed && (
                    <div className="dv-print dv-print-flat">
                      {url && <img src={url} alt="" className="dv-projection" style={{ opacity: exposing ? 0.5 : 0 }} />}
                    </div>
                  )}
                  {!placed && <span className="dv-drop-label">EASEL</span>}
                </div>
                {!placed && (
                  <div className="dv-paperbox">
                    <span className="dv-box-label">PHOTO PAPER · RC GLOSSY</span>
                    <Carry dropRef={dropRef} onDrop={onPlaced}>
                      <div className="dv-print" />
                    </Carry>
                  </div>
                )}
                {placed && (
                  <div className="dv-timer">
                    <span className={Math.abs(exposure - TARGET) < 1 ? 'is-good' : exposure > TARGET + 1 ? 'is-over' : ''}>
                      {exposure.toFixed(1)}s
                    </span>
                    <button
                      type="button"
                      className={`dv-expose ${exposing ? 'is-on' : ''}`}
                      onPointerDown={startExpose}
                      onPointerUp={endExpose}
                      onPointerLeave={endExpose}
                    >
                      <Lightbulb size={16} /> {exposing ? 'EXPOSING…' : 'HOLD TO EXPOSE'}
                    </button>
                  </div>
                )}
              </div>
            )}

            {(step === 'develop' || step === 'stop' || step === 'fix') && (
              <div className="dv-scene dv-tray-scene">
                <div className="dv-trays">
                  {(['develop', 'stop', 'fix'] as const).map((id) => (
                    <div
                      key={id}
                      className={`dv-tray tray-${id} ${id === step ? 'is-current' : ''} ${id === step && !placed ? 'is-target' : ''}`}
                      ref={id === step ? dropRef : undefined}
                      onPointerDown={id === step ? trayDown : undefined}
                      onPointerMove={id === step ? trayMove : undefined}
                      onPointerUp={id === step ? trayUp : undefined}
                      onPointerCancel={id === step ? trayUp : undefined}
                    >
                      <span className="dv-liquid" />
                      <span className="dv-tray-label">{id === 'develop' ? 'DEV' : id.toUpperCase()}</span>
                      {id === step && placed && <div className="dv-in-tray">{print}</div>}
                    </div>
                  ))}
                </div>
                {!placed && (
                  <div className="dv-hand">
                    <Carry dropRef={dropRef} onDrop={onPlaced}>
                      {print}
                    </Carry>
                  </div>
                )}
                {placed && (
                  <div className="dv-rock-row">
                    <button type="button" onClick={() => rock(-1)} aria-label="Rock tray left">←</button>
                    <span>Rock the tray</span>
                    <button type="button" onClick={() => rock(1)} aria-label="Rock tray right">→</button>
                  </div>
                )}
              </div>
            )}

            {step === 'wash' && (
              <div className="dv-scene dv-wash-scene">
                <div className={`dv-basin dv-drop ${!placed ? 'is-target' : ''} ${rinsing ? 'is-running' : ''}`} ref={dropRef}>
                  <span className="dv-tap" />
                  <span className="dv-stream" />
                  {placed && <div className="dv-in-tray">{print}</div>}
                </div>
                {!placed ? (
                  <div className="dv-hand">
                    <Carry dropRef={dropRef} onDrop={onPlaced}>{print}</Carry>
                  </div>
                ) : (
                  <button
                    type="button"
                    className={`dv-expose ${rinsing ? 'is-on' : ''}`}
                    onPointerDown={() => {
                      setRinsing(true);
                      playPour(2.6);
                    }}
                    onPointerUp={() => setRinsing(false)}
                    onPointerLeave={() => setRinsing(false)}
                  >
                    {rinsing ? 'RINSING…' : 'HOLD TO RINSE'}
                  </button>
                )}
              </div>
            )}

            {(step === 'dry' || step === 'done') && (
              <div className="dv-scene dv-dry-scene">
                <div className={`dv-line dv-drop ${!placed && step === 'dry' ? 'is-target' : ''}`} ref={dropRef}>
                  <span className="dv-string" />
                  {(placed || step === 'done') && (
                    <div className={`dv-hanging ${step === 'done' ? 'is-dry' : ''}`}>
                      <span className="dv-pin" />
                      {print}
                      {step === 'dry' && (
                        <>
                          <i className="dv-drip" />
                          <i className="dv-drip d2" />
                        </>
                      )}
                    </div>
                  )}
                </div>
                {!placed && step === 'dry' && (
                  <div className="dv-hand">
                    <Carry dropRef={dropRef} onDrop={onPlaced}>{print}</Carry>
                  </div>
                )}
              </div>
            )}

            {step === 'fix' && fixP >= 1 && !lightsOn && (
              <button
                type="button"
                className="dv-lightswitch"
                onClick={() => {
                  setLightsOn(true);
                  haptic(20);
                  playTick(true);
                }}
              >
                <Lightbulb size={15} /> Lights on!
              </button>
            )}

            {/* next-step controls live in the room's top-left corner, right where the action is */}
            <div className="dv-corner">
              {stationReady && placed && (
                <button type="button" className="dv-next" onClick={advance}>
                  {step === 'expose' ? 'Into the developer →' : step === 'develop' ? 'Pull it out → Stop bath' : step === 'stop' ? 'Into the fixer →' : 'To the wash →'}
                </button>
              )}
              {step === 'develop' && dev > 1.25 && <p className="dv-warn">It’s getting dark — pull it out!</p>}
              {saving && <p className="dv-warn">Drying & saving your print…</p>}
            </div>
            {result && (
              <div className="dv-report">
                <span className="eyebrow">Darkroom report</span>
                <div className="dv-grade">{result.grade}</div>
                {result.notes.map((n) => (
                  <p key={n}>{n}</p>
                ))}
                <div className="dv-report-actions">
                  <button type="button" className="button button-dark" onClick={() => onProcess(result.record)}>
                    <Sparkles size={14} /> Process it
                  </button>
                  <button
                    type="button"
                    className="button button-outline"
                    onClick={() => {
                      setSelectedId(roll[0]?.id ?? null);
                      reset();
                    }}
                    disabled={!roll.length}
                  >
                    Next negative
                  </button>
                </div>
              </div>
            )}
          </section>

          <aside className="dv-guide">
            <span className="eyebrow">How to print</span>
            <ol className="dv-steps">
              {STEPS.map((s, i) => (
                <li key={s.id} className={i < stepIndex || step === 'done' ? 'is-done' : i === stepIndex ? 'is-now' : ''}>
                  <span>{i < stepIndex || step === 'done' ? <Check size={11} /> : i + 1}</span>
                  {s.name}
                </li>
              ))}
            </ol>
            {meta && (
              <div className="dv-tip" key={`${step}-${placed}`}>
                <strong>{placed ? meta.station : 'Carry the print'}</strong>
                <p>{placed ? meta.work : meta.carry}</p>
                <small>{meta.fact}</small>
              </div>
            )}
            {meta && (
              <div className="dv-meter" aria-label="Progress">
                {step === 'develop' && <span className="dv-zone" style={{ left: `${(0.9 / 1.7) * 100}%`, width: `${(0.3 / 1.7) * 100}%` }} />}
                {step === 'expose' && <span className="dv-zone" style={{ left: '40%', width: '20%' }} />}
                <span className="dv-meter-fill" style={{ width: `${clamp(meter, 0, 1) * 100}%` }} />
              </div>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}
