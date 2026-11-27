import { Aperture, Camera, Maximize2, Minimize2, ChevronLeft, ChevronRight, Info, Monitor, RotateCcw, Settings2, SwitchCamera, Timer, Zap, ZapOff } from 'lucide-react';
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { haptic, isHapticsOn, isSoundOn, playDial, playPowerSwitch, playServo, playStartup, setHapticsOn, setSoundOn } from '../lib/audio';
import type { CamApi } from './CameraBodies';

/*
 * Delineate · ALLOY 01 — the house camera. One machined body in three finishes:
 *   silver   satin-brushed aluminium, chamfered right shoulder with engraved lines, knurled shutter, orange light
 *   graphite dark anodised gunmetal, chamfers on all four corners, stepped smooth shutter, red light, slide power switch
 *   gold     champagne gold, softened corners, fluted shutter, amber light, flip and power side by side
 * Outside: tactile precision. Inside: calm clarity.
 */

type Expert = 'iso' | 'shutter' | 'aperture';
type Cat = 'camera' | 'display' | 'capture' | 'general' | 'about';
const EXPERT: { id: Expert; label: string; short: string }[] = [
  { id: 'iso', label: 'ISO', short: 'ISO' },
  { id: 'shutter', label: 'Shutter', short: 'SHUTTER' },
  { id: 'aperture', label: 'Aperture', short: 'F-STOP' },
];
const CATS: { id: Cat; label: string; icon: typeof Camera }[] = [
  { id: 'camera', label: 'Camera', icon: Camera },
  { id: 'display', label: 'Display', icon: Monitor },
  { id: 'capture', label: 'Capture', icon: Aperture },
  { id: 'general', label: 'General', icon: Settings2 },
  { id: 'about', label: 'About', icon: Info },
];
const evText = (v: number) => (v === 0 ? '0.0' : `${v > 0 ? '+' : '−'}${Math.abs(v).toFixed(1)}`);

/** A machined rotary dial: drag round it (or up/down), or use the − / + keys. Each detent ticks. */
function Dial({ values, index, onChange, label, dim }: { values: string[]; index: number; onChange: (i: number) => void; label: string; dim?: boolean }) {
  const drag = useRef<{ a: number; y: number; start: number } | null>(null);
  const step = 270 / Math.max(1, values.length - 1);
  const set = (i: number) => {
    const n = Math.max(0, Math.min(values.length - 1, i));
    if (n === index) return;
    playDial();
    haptic(4);
    onChange(n);
  };
  const angleOf = (e: ReactPointerEvent<HTMLElement>, el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    return (Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2)) * 180) / Math.PI;
  };
  return (
    <div className={`al-dial ${dim ? 'is-dim' : ''}`}>
      <button type="button" className="al-dial-step" onClick={() => set(index - 1)} aria-label={`${label} lower`}>
        −
      </button>
      <div
        className="al-dial-face"
        role="slider"
        tabIndex={0}
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={values.length - 1}
        aria-valuenow={index}
        aria-valuetext={values[index]}
        style={{ ['--a' as string]: `${-135 + index * step}deg` }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowUp' || e.key === 'ArrowRight') set(index + 1);
          else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') set(index - 1);
          else return;
          e.preventDefault();
        }}
        onPointerDown={(e) => {
          try {
            e.currentTarget.setPointerCapture(e.pointerId);
          } catch {
            /* synthetic pointer */
          }
          drag.current = { a: angleOf(e, e.currentTarget), y: e.clientY, start: index };
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d) return;
          let da = angleOf(e, e.currentTarget) - d.a;
          if (da > 180) da -= 360;
          if (da < -180) da += 360;
          // turning round the dial, or simply dragging up (more) and down (less)
          const turn = Math.abs(da) > 6 ? da / Math.max(14, step) : (d.y - e.clientY) / 18;
          set(d.start + Math.round(turn));
        }}
        onPointerUp={() => (drag.current = null)}
        onPointerCancel={() => (drag.current = null)}
      >
        <span className="al-dial-scale" aria-hidden="true" />
        <i className="al-dial-marker" aria-hidden="true" />
        <span className="al-dial-bezel" aria-hidden="true" />
        <span className="al-dial-glass" aria-hidden="true">
          <i className="al-dial-arrow" />
        </span>
        <span className="al-dial-read">
          <small>{label}</small>
          <b>{values[index]}</b>
        </span>
      </div>
      <button type="button" className="al-dial-step" onClick={() => set(index + 1)} aria-label={`${label} higher`}>
        +
      </button>
    </div>
  );
}

/**
 * The zoom wheel: a knurled drum whose axis lies along the screen, seen edge-on like a thumbwheel.
 * Roll it sideways with a finger (or the arrow keys); its ridges travel as it turns. Double-tap for 1×.
 */
function ZoomKnob({ zoom, onChange }: { zoom: number; onChange: (z: number) => void }) {
  const drag = useRef<{ x: number; y: number; upright: boolean; start: number } | null>(null);
  const set = (z: number) => {
    const n = Math.min(4, Math.max(1, Math.round(z * 10) / 10));
    if (n === zoom) return;
    playDial();
    haptic(3);
    onChange(n);
  };
  return (
    <div
      className="al-zoom"
      role="slider"
      tabIndex={0}
      aria-label="Zoom"
      aria-valuemin={1}
      aria-valuemax={4}
      aria-valuenow={zoom}
      aria-valuetext={`${zoom.toFixed(1)}×`}
      // each 0.1× rolls the ridges one notch
      style={{ ['--roll' as string]: `${zoom * 60}px` }}
      onKeyDown={(e) => {
        if (e.key === 'ArrowUp' || e.key === 'ArrowRight') set(zoom + 0.1);
        else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') set(zoom - 0.1);
        else return;
        e.preventDefault();
      }}
      onDoubleClick={() => set(1)}
      onPointerDown={(e) => {
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          /* synthetic pointer */
        }
        const r = e.currentTarget.getBoundingClientRect();
        drag.current = { x: e.clientX, y: e.clientY, upright: r.height > r.width, start: zoom };
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (!d) return;
        // rolling down (upright wheel) or right (flat wheel) zooms in, so the grip moves with the finger; 60 px = 1×
        set(d.start + (d.upright ? e.clientY - d.y : e.clientX - d.x) / 60);
      }}
      onPointerUp={() => (drag.current = null)}
      onPointerCancel={() => (drag.current = null)}
    >
      <span className="al-zoom-drum" aria-hidden="true" />
      <i className="al-zoom-index" aria-hidden="true" />
    </div>
  );
}

function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} className={`al-switch ${on ? 'is-on' : ''}`} onClick={() => onChange(!on)}>
      <span>{label}</span>
      <i aria-hidden="true" />
    </button>
  );
}

let bootUntil = 0;

export default function AlloyBody({ c }: { c: CamApi }) {
  const finish = c.cam.id.replace('alloy-', '') as 'silver' | 'graphite' | 'gold';
  const [evOn, setEvOn] = useState(false);
  const [expert, setExpert] = useState<Expert | null>(null);
  const [settings, setSettings] = useState(false);
  const [cat, setCat] = useState<Cat>('camera');
  const [blink, setBlink] = useState(false); // the green capture flicker on the light ring and power lamp
  const [, rerender] = useState(0);
  const evIdx = c.evIndex;
  const evs = c.expert.lists.ev;
  const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  // power on: the wordmark spins a full turn while the iris opens, a light traces the perimeter.
  // Timed from the switch press (module-level), so the body being rebuilt as the stream starts can't cut it short.
  const booting = c.on && Date.now() < bootUntil;
  useEffect(() => {
    if (!booting) return;
    const t = window.setTimeout(() => rerender((n) => n + 1), bootUntil - Date.now() + 20);
    return () => window.clearTimeout(t);
  }, [booting]);
  useEffect(() => {
    if (c.on) return;
    setSettings(false);
    setExpert(null);
  }, [c.on]);
  // every capture: the shutter ring and power lamp flick to green
  const blinkTimer = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (!c.firing) return;
    setBlink(true);
    // not cleared when firing ends (that is usually sooner than 520 ms): the light must always go back
    window.clearTimeout(blinkTimer.current);
    blinkTimer.current = window.setTimeout(() => setBlink(false), 520);
  }, [c.firing]);
  useEffect(() => () => window.clearTimeout(blinkTimer.current), []);

  const power = () => {
    playPowerSwitch(!c.on);
    if (!c.on) {
      bootUntil = Date.now() + (reduce ? 500 : 1700);
      playStartup();
      haptic([10, 40, 10]);
    } else bootUntil = 0;
    c.power();
  };
  const toggleSettings = () => {
    playServo(!settings);
    haptic(6);
    setSettings((s) => !s);
    setExpert(null);
  };
  const toggleExpert = () => {
    c.key();
    setExpert((e) => (e ? null : 'shutter'));
    setSettings(false);
  };
  const ratioShortcut = () => {
    const i = c.ratios.indexOf(c.aspect);
    c.key();
    c.setRatio(c.ratios[(i + 1) % c.ratios.length]);
  };
  const [max, setMax] = useState(() => document.documentElement.classList.contains('al-max'));
  const leaveMax = useRef<() => void>(() => undefined);
  useEffect(() => {
    if (!max) return;
    const root = document.documentElement;
    root.classList.add('al-max');
    // a history entry so Android's back button leaves maximised view instead of the app
    history.pushState({ alMax: true }, '');
    let leaving = false;
    const done = () => {
      if (leaving) return;
      leaving = true;
      root.classList.remove('al-max');
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
      setMax(false);
    };
    const onPop = () => done();
    const onFs = () => !document.fullscreenElement && done();
    window.addEventListener('popstate', onPop);
    document.addEventListener('fullscreenchange', onFs);
    leaveMax.current = () => {
      if (history.state?.alMax) history.back(); // fires popstate -> done
      else done();
    };
    return () => {
      window.removeEventListener('popstate', onPop);
      document.removeEventListener('fullscreenchange', onFs);
      root.classList.remove('al-max');
    };
  }, [max]);
  const toggleMax = () => {
    c.key();
    haptic(8);
    if (max) return leaveMax.current();
    // true full screen where the browser allows it (Android Chrome); the app chrome hides either way
    void document.documentElement.requestFullscreen?.({ navigationUI: 'hide' }).catch(() => undefined);
    setMax(true);
  };
  const live = c.live && !c.review;
  const ex = c.expert;

  const ribbonBtn = (on: boolean, label: string, onClick: () => void, child: React.ReactNode, cls = '') => (
    <button type="button" className={`al-rb ${on ? 'is-on' : ''} ${cls}`} onClick={onClick} aria-pressed={on} aria-label={label} title={label} disabled={!c.on}>
      {child}
    </button>
  );

  return (
    <div className={`cb cb-alloy al-${finish} al-tilt-${c.tilt} ${c.on ? 'is-on' : ''} ${c.firing ? 'is-firing' : ''} ${blink ? 'is-blink' : ''} ${booting ? 'is-booting' : ''}`}>
      <div className="al-body">
        <span className="al-brush" aria-hidden="true" />
        <span className="al-shine" aria-hidden="true" />
        <span className="al-trace" aria-hidden="true" />
        <span className="al-engrave" aria-hidden="true" />
        <span className="al-groove" aria-hidden="true" />

        <div className="al-display">
          <div className="al-ribbon">
            <span className="al-word">DELINEATE</span>
            <span className="al-rb-group">
              {ribbonBtn(evOn, 'Exposure slider', () => (c.key(), setEvOn((v) => !v)), <b>EV</b>)}
              {ribbonBtn(false, `Aspect ratio ${c.aspect}`, ratioShortcut, <b>{c.aspect}</b>, 'is-ratio')}
              {ribbonBtn(Boolean(expert), 'Expert controls', toggleExpert, <b>PRO</b>)}
              {ribbonBtn(c.flashOn, 'Flash', c.flash, c.flashOn ? <Zap size={16} /> : <ZapOff size={16} />)}
              {ribbonBtn(c.timerOn, 'Self-timer', c.timer, <Timer size={16} />)}
              <button type="button" className={`al-rb al-maxbtn ${max ? 'is-on' : ''}`} onClick={toggleMax} aria-pressed={max} aria-label={max ? 'Exit full view' : 'Full view'} title={max ? 'Exit full view' : 'Full view'}>
                {max ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
              </button>
              <button type="button" className={`al-rb al-gear ${settings ? 'is-open' : ''}`} onClick={toggleSettings} aria-expanded={settings} aria-label="Settings" disabled={!c.on}>
                <Settings2 size={17} />
              </button>
            </span>
          </div>

          <div className={`al-view ${expert ? 'has-expert' : ''}`}>
            {c.screen}

            {live && !settings && (
              <span className="al-reticle" aria-hidden="true">
                <i />
                <i />
                <i />
                <i />
                <b />
              </span>
            )}

            {c.on && !settings && (
              <div className={`al-strip ${evOn && !c.review ? 'has-ev' : ''}`}>
                <span className={`al-pill ${ex.manual ? 'is-hot' : ''}`}>{ex.manual ? 'M' : 'AUTO'}</span>
                {evOn && !c.review ? (
                  <div className="al-ruler" style={{ ['--p' as string]: `${(evIdx / (evs.length - 1)) * 100}%` }}>
                    <input
                      type="range"
                      min={0}
                      max={evs.length - 1}
                      step={1}
                      value={evIdx}
                      aria-label="Exposure compensation"
                      aria-valuetext={`EV ${evText(evs[evIdx])}`}
                      onChange={(e) => {
                        playDial();
                        haptic(3);
                        c.setEvValue(evs[Number(e.target.value)]);
                      }}
                    />
                  </div>
                ) : (
                  <span className="al-strip-gap" />
                )}
                <span className="al-pill is-ghost al-zoom-read">{c.zoom.toFixed(1)}×</span>
                <button type="button" className={`al-pill ${evOn ? 'is-hot' : ''}`} onClick={() => (c.key(), setEvOn((v) => !v))}>
                  EV {evText(evs[evIdx])}
                </button>
                <button type="button" className="al-pill al-ratio-pill" onClick={ratioShortcut}>
                  {c.aspect}
                </button>
              </div>
            )}

            {c.on && expert && !settings && (
              <aside className="al-expert" aria-label="Expert controls">
                <div className="al-ex-head">
                  <Switch on={ex.manual} onChange={(v) => (c.key(), ex.setManual(v))} label={ex.manual ? 'Manual' : 'Auto'} />
                  <button type="button" className="al-x" onClick={() => setExpert(null)} aria-label="Close expert controls">
                    ×
                  </button>
                </div>
                <div className="al-ex-tabs" role="tablist">
                  {EXPERT.map((t) => (
                    <button key={t.id} type="button" role="tab" aria-selected={expert === t.id} className={expert === t.id ? 'is-active' : ''} onClick={() => (playDial(), setExpert(t.id))}>
                      {t.short}
                    </button>
                  ))}
                </div>
                <Dial values={ex.lists[expert]} index={ex[expert]} onChange={(i) => ex.set(expert, i)} label={EXPERT.find((t) => t.id === expert)!.label} dim={!ex.manual} />
                <small className="al-ex-note">{ex.manual ? 'Turn the dial, or drag up and down' : 'Auto — turn the dial to take over'}</small>
              </aside>
            )}

            {c.on && settings && (
              <div className="al-settings" role="dialog" aria-label="Settings">
                <nav className="al-cats">
                  <button type="button" className="al-back" onClick={toggleSettings} aria-label="Close settings">
                    <ChevronLeft size={16} /> <span>Settings</span>
                  </button>
                  {CATS.map((k) => (
                    <button key={k.id} type="button" className={cat === k.id ? 'is-active' : ''} onClick={() => (playDial(), setCat(k.id))}>
                      <k.icon size={15} /> <span>{k.label}</span>
                    </button>
                  ))}
                </nav>
                <div className="al-pane">
                  {cat === 'camera' && (
                    <>
                      <Switch on={c.flashOn} onChange={() => c.flash()} label="Flash" />
                      <button type="button" className="al-row" onClick={c.wb}>
                        <span>White balance</span>
                        <b>{c.wbLabel}</b>
                      </button>
                      <button type="button" className="al-row" onClick={c.flip}>
                        <span>Switch camera</span>
                        <b>
                          <SwitchCamera size={15} />
                        </b>
                      </button>
                    </>
                  )}
                  {cat === 'display' && (
                    <>
                      <Switch on={c.grid} onChange={() => c.toggleGrid()} label="Grid" />
                      <Switch on={c.hud} onChange={() => c.toggleHud()} label="Info overlay" />
                      <Switch on={evOn} onChange={(v) => setEvOn(v)} label="Exposure slider" />
                    </>
                  )}
                  {cat === 'capture' && (
                    <>
                      <button type="button" className="al-row" onClick={c.timer}>
                        <span>Self-timer</span>
                        <b>{c.timerOn ? 'On' : 'Off'}</b>
                      </button>
                      <div className="al-row is-chips">
                        <span>Aspect ratio</span>
                        <span className="al-chips">
                          {c.ratios.map((r) => (
                            <button key={r} type="button" className={r === c.aspect ? 'is-active' : ''} onClick={() => (c.key(), c.setRatio(r))}>
                              {r}
                            </button>
                          ))}
                        </span>
                      </div>
                      <button type="button" className="al-row" onClick={c.me}>
                        <span>Multiple exposure</span>
                        <b>{c.meOn ? 'On' : 'Off'}</b>
                      </button>
                      <Switch on={c.dateOn} onChange={() => c.date()} label="Date imprint" />
                    </>
                  )}
                  {cat === 'general' && (
                    <>
                      <Switch
                        on={isSoundOn()}
                        onChange={(v) => {
                          setSoundOn(v);
                          rerender((n) => n + 1);
                        }}
                        label="Clicks & sounds"
                      />
                      <Switch
                        on={isHapticsOn()}
                        onChange={(v) => {
                          setHapticsOn(v);
                          if (v) haptic(20);
                          rerender((n) => n + 1);
                        }}
                        label="Haptics"
                      />
                      <button type="button" className="al-row" onClick={() => (c.setEvValue(0), ex.setManual(false))}>
                        <span>Reset exposure</span>
                        <b>
                          <RotateCcw size={15} />
                        </b>
                      </button>
                    </>
                  )}
                  {cat === 'about' && (
                    <div className="al-about">
                      <img src="/brand-mark.png?v=7" alt="" />
                      <b>Delineate {c.cam.name}</b>
                      <span>{c.cam.model} · {c.cam.tag}</span>
                      <small>Tactile precision outside, calm clarity inside. {c.galleryCount} photos on this device.</small>
                    </div>
                  )}
                </div>
              </div>
            )}

            {c.review && c.galleryCount > 1 && (
              <>
                <button type="button" className="al-nav is-prev" onClick={() => c.browse(-1)} aria-label="Older photo">
                  <ChevronLeft size={20} />
                </button>
                <button type="button" className="al-nav is-next" onClick={() => c.browse(1)} aria-label="Newer photo">
                  <ChevronRight size={20} />
                </button>
                <span className="al-count">
                  {c.reviewPos} / {c.galleryCount}
                </span>
              </>
            )}

            {!c.on && (
              <div className="al-off" aria-hidden="true">
                <span>DELINEATE</span>
                <small>Flip the power switch</small>
              </div>
            )}
            {booting && (
              <div className="al-boot" aria-hidden="true">
                <span className="al-iris" />
                <img className="al-boot-logo" src="/brand-mark.png?v=7" alt="" />
                <b>DELINEATE</b>
                <small>{c.cam.bootSub}</small>
              </div>
            )}
          </div>
        </div>

        <div className="al-zoomslot">
          <span className="al-zs-mark" aria-hidden="true">+</span>
          <span className="al-pocket is-slot">
            <ZoomKnob zoom={c.zoom} onChange={c.setZoom} />
          </span>
          <span className="al-zs-mark" aria-hidden="true">−</span>
          <span className="al-zs-label" aria-hidden="true">ZOOM</span>
        </div>
        <div className="al-side">
          {/* each control sits in its own milled pocket, with a real gap round it */}
          <span className="al-pocket al-pk-flip">
            <button type="button" className="al-flip" onClick={c.flip} aria-label="Selfie flip" disabled={!c.on}>
              <SwitchCamera size={15} />
            </button>
          </span>
          <span className="al-pk-power">
            <span className="al-pw-labels" aria-hidden="true">
              <i className={c.on ? 'is-lit' : ''}>ON</i>
              <i className={c.on ? '' : 'is-lit'}>OFF</i>
            </span>
            <span className="al-pocket is-switch">
              <button type="button" role="switch" aria-checked={c.on} className={`al-power ${c.on ? 'is-on' : ''}`} onClick={power} aria-label={c.on ? 'Turn camera off' : 'Turn camera on'}>
                <i className="al-pw-metal" />
                <i className="al-pw-lamp" />
              </button>
            </span>
          </span>
          <span className="al-shutter-well">
            <span className="al-ring" aria-hidden="true" />
            <button type="button" className={`al-shutter ${c.focus !== 'idle' ? 'is-half' : ''} ${c.firing ? 'is-down' : ''}`} aria-label="Shutter" {...c.shutterProps}>
              <span className="al-shutter-cap" />
            </button>
          </span>
          <span className="al-pocket al-pk-logo">
            <button type="button" className={`al-logo ${c.review ? 'is-on' : ''}`} onClick={c.toggleReview} aria-pressed={c.review} aria-label={c.review ? 'Back to the viewfinder' : 'Open your photos'} disabled={!c.galleryCount}>
              <img src="/brand-mark.png?v=7" alt="" />
            </button>
          </span>
        </div>
      </div>
    </div>
  );
}
