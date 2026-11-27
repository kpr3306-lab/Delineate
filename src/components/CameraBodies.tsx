import { Camera, ChevronLeft, ChevronRight, Grid3X3, Images, Menu, Minus, Phone, PhoneOff, Plus, Power, SwitchCamera, Zap, ZapOff } from 'lucide-react';
import AlloyBody from './AlloyBody';
import { type ComponentType, type HTMLAttributes, type ReactNode } from 'react';
import type { AspectKey, PhotoRecord } from '../types';
import type { CamModel, Layout } from '../lib/cameras';
import { pad } from '../lib/utils';
import Knob from './Knob';
import { useObjectUrl } from './ui';
import { PHONE_ART } from './RetroPhones';

export type Dir = 'up' | 'down' | 'left' | 'right' | 'ok';
type BtnProps = HTMLAttributes<HTMLButtonElement>;

/** Everything a camera body can wire its buttons to. CameraView owns the state; bodies are layout + feel. */
export type CamApi = {
  cam: CamModel;
  screen: ReactNode;
  on: boolean;
  live: boolean;
  firing: boolean;
  focus: 'idle' | 'hunting' | 'locked';
  review: boolean;
  menuOpen: boolean;
  filmNumber: number;
  undeveloped: number;
  galleryCount: number;
  reviewPos: number;
  latest?: PhotoRecord;
  zoom: number;
  aspect: AspectKey;
  canRatio: boolean;
  flashOn: boolean;
  timerOn: boolean;
  grid: boolean;
  dateOn: boolean;
  meOn: boolean;
  evIndex: number;
  needWind: boolean;
  power: () => void;
  shoot: () => void;
  shutterProps: BtnProps;
  zoomProps: (dir: 1 | -1) => BtnProps;
  nav: (d: Dir) => void;
  menu: () => void;
  toggleReview: () => void;
  browse: (d: 1 | -1) => void;
  flash: () => void;
  timer: () => void;
  ratio: () => void;
  toggleGrid: () => void;
  toggleHud: () => void;
  flip: () => void;
  date: () => void;
  wb: () => void;
  wbLabel: string;
  me: () => void;
  ev: (d: number) => void;
  setEvValue: (v: number) => void;
  windOn: () => void;
  key: (k?: string) => void;
  closeOverlays: () => void;
  /** Power state in detail: 'starting' is the boot moment. */
  status: string;
  /** Manual exposure (Delineate's expert dials): indices into the value lists, AUTO when manual is off. */
  expert: {
    manual: boolean;
    setManual: (on: boolean) => void;
    iso: number;
    shutter: number;
    aperture: number;
    set: (key: 'iso' | 'shutter' | 'aperture', index: number) => void;
    lists: { iso: string[]; shutter: string[]; aperture: string[]; ev: number[] };
  };
  hud: boolean;
  ratios: AspectKey[];
  setRatio: (r: AspectKey) => void;
  /** Zoom straight to a value (1–4), for the Delineate zoom rotary. */
  setZoom: (z: number) => void;
};

type BodyProps = { c: CamApi };

/** A four-way pad with a centre key. `ok` overrides what the centre does when nothing is open. */
function DPad({ c, ok, label = 'OK', className = '', marks, act }: { c: CamApi; ok?: () => void; label?: ReactNode; className?: string; marks?: Partial<Record<Dir, ReactNode>>; act?: Partial<Record<Dir, () => void>> }) {
  const busy = c.menuOpen || c.review;
  const centre = () => (busy || !ok ? c.nav('ok') : (c.key(), ok()));
  const press = (d: Dir) => (!busy && act?.[d] ? act[d]!() : c.nav(d));
  return (
    <div className={`cb-dpad ${className}`} role="group" aria-label="Direction pad">
      {(['up', 'right', 'down', 'left'] as const).map((d) => (
        <button key={d} type="button" className={`cb-dpad-${d}`} onClick={() => press(d)} aria-label={d}>
          <span>{marks?.[d] ?? ''}</span>
        </button>
      ))}
      <button type="button" className="cb-dpad-ok" onClick={centre} aria-label="OK">
        {label}
      </button>
    </div>
  );
}

function Shutter({ c, className, children, label = 'Shutter' }: { c: CamApi; className: string; children?: ReactNode; label?: string }) {
  return (
    <button type="button" className={`${className} ${c.focus !== 'idle' ? 'is-half' : ''} ${c.firing ? 'is-down' : ''}`} aria-label={label} {...c.shutterProps}>
      {children}
    </button>
  );
}

const root = (c: CamApi, layout: string) => `cb cb-${layout} m-${c.cam.id} skin-${c.cam.id} ${c.firing ? 'is-firing' : ''} ${c.on ? 'is-on' : ''}`;


/* Retro mobile ---------------------------------------------------------------------------------
   The phone body is vector art; the live view sits over its screen and every key is a real button on top. Upright on phones; turned on its side on wide screens, the way camera phones were held to shoot.
   Boxes are [x, y, w, h] in % of the photo. */
type Box = [number, number, number, number];
type Act = 'softL' | 'softR' | 'call' | 'end' | 'menu' | 'back';
type PhoneSpec = {
  ratio: number; // width / height of the drawing
  cut: number; // how much of the phone shows: down to just past the second keypad row
  screen: Box;
  pad: Box; // the D-pad / joystick
  padCentre: number; // centre key size as a fraction of the pad
  keys: { rows: [number, number][]; cols: [number, number][] };
  hots: { act: Act; box: Box; label: string; glyph?: string }[];
};
const PHONES: Record<string, PhoneSpec> = {
  oval: {
    ratio: 0.5204,
    cut: 0.875,
    screen: [19.6, 19.6, 60.8, 39.2],
    pad: [42.7, 64.2, 14.6, 7.6],
    padCentre: 0.5,
    keys: { rows: [[72, 79], [79, 85.5], [85.5, 91.5], [91.5, 97]], cols: [[14, 37.5], [37.5, 62.5], [62.5, 86]] },
    hots: [
      { act: 'softL', box: [15.4, 64, 22, 7.6], label: 'Options (left softkey)' },
      { act: 'softR', box: [62.6, 64, 22, 7.6], label: 'Gallery / back (right softkey)' },
      { act: 'call', box: [4, 49.5, 10, 11.5], label: 'Switch camera (call key)' },
      { act: 'end', box: [86.5, 49.5, 10, 11.5], label: 'Power (end key)' },
      { act: 'menu', box: [4.5, 62, 10, 9.5], label: 'Menu key' },
      { act: 'back', box: [86, 62, 10, 8], label: 'Clear key — back / gallery' },
    ],
  },
  candybar: {
    ratio: 0.4151,
    cut: 0.895,
    screen: [9.6, 10.6, 79.6, 44.4],
    pad: [35.2, 66, 29.4, 10],
    padCentre: 0.45,
    keys: { rows: [[76.6, 82], [82, 87.2], [87.2, 92.5], [92.5, 97.6]], cols: [[14, 36.6], [36.6, 60], [60, 84]] },
    hots: [
      { act: 'softL', box: [16, 66.8, 18, 4.6], label: 'Options (left softkey)' },
      { act: 'softR', box: [66, 66.8, 18, 4.6], label: 'Gallery / back (right softkey)' },
      { act: 'call', box: [16, 71.4, 18, 4.6], label: 'Switch camera (call key)' },
      { act: 'end', box: [66, 71.4, 18, 4.6], label: 'Power (end key)' },
      { act: 'menu', box: [2.9, 77.2, 10.6, 9.8], label: 'Menu key' },
      { act: 'back', box: [86.5, 77.2, 10.6, 9.8], label: 'Clear key — back / gallery' },
    ],
  },
  cyberphone: {
    ratio: 0.4384,
    cut: 0.88,
    screen: [13.6, 9.6, 72, 40.4],
    pad: [35.8, 60, 28.4, 12.4],
    padCentre: 0.46,
    keys: { rows: [[74.5, 80.5], [80.5, 86], [86, 91.5], [91.5, 97]], cols: [[10, 36.5], [36.5, 63.5], [63.5, 90]] },
    hots: [
      { act: 'call', box: [9.2, 60.5, 6.2, 11], label: 'Switch camera (call key)' },
      { act: 'softL', box: [15.6, 60.5, 18, 5.5], label: 'Options (left softkey)' },
      { act: 'back', box: [15.6, 66.1, 18, 5.5], label: 'Back key — back / gallery', glyph: '↩' },
      { act: 'softR', box: [66.4, 60.5, 18, 5.5], label: 'Gallery / back (right softkey)' },
      { act: 'back', box: [66.4, 66.1, 18, 5.5], label: 'Clear key — back / gallery' },
      { act: 'end', box: [84.6, 60.5, 6.2, 11], label: 'Power (end key)' },
    ],
  },
  flip: {
    ratio: 0.309,
    cut: 0.835,
    screen: [15.6, 10.8, 68, 29.4],
    pad: [30.9, 56.8, 38.2, 11.8],
    padCentre: 0.4,
    keys: { rows: [[70.2, 76], [76, 81.2], [81.2, 86.4], [86.4, 90.8]], cols: [[12, 35], [35, 65], [65, 88]] },
    hots: [
      { act: 'softL', box: [12, 55, 19, 5.2], label: 'Options (left softkey)' },
      { act: 'softR', box: [69, 55, 19, 5.2], label: 'Gallery / back (right softkey)' },
      { act: 'menu', box: [12, 60.4, 19, 5], label: 'Menu key' },
      { act: 'back', box: [69, 60.4, 19, 5], label: 'Clear key — back / gallery' },
      { act: 'call', box: [12, 65.4, 19, 4.8], label: 'Switch camera (call key)' },
      { act: 'end', box: [69, 65.4, 19, 4.8], label: 'Power (end key)' },
    ],
  },
};
// the keypad is cut off after its second row; 7–#'s shortcuts live in the Options menu
const KEYPAD = ['1', '2', '3', '4', '5', '6'];
const DIGIT_LETTERS: Record<string, string> = { '1': 'oo', '2': 'abc', '3': 'def', '4': 'ghi', '5': 'jkl', '6': 'mno', '7': 'pqrs', '8': 'tuv', '9': 'wxyz', '*': '+', '0': '⎵', '#': '⇧' };
const pos = ([x, y, w, h]: Box) => ({ left: `${x}%`, top: `${y}%`, width: `${w}%`, height: `${h}%` });
/** Turned a quarter left on wide screens, the key physically labelled "right" is the one on top. */
const TURNED: Record<Dir, Dir> = { up: 'left', right: 'up', down: 'right', left: 'down', ok: 'ok' };
const wideQuery = '(min-width: 861px) and (not ((orientation: landscape) and (pointer: coarse) and (max-height: 500px)))';

function PhoneBody({ c }: BodyProps) {
  const spec = PHONES[c.cam.id] ?? PHONES.candybar;
  const Art = PHONE_ART[c.cam.id] ?? PHONE_ART.candybar;
  const turned = typeof window !== 'undefined' && window.matchMedia(wideQuery).matches;
  const busy = c.menuOpen || c.review;
  const act: Record<Act, () => void> = {
    softL: () => (c.menuOpen ? c.nav('ok') : c.menu()),
    softR: () => (busy ? c.closeOverlays() : c.toggleReview()),
    call: c.flip,
    end: c.power,
    menu: c.menu,
    back: () => (busy ? c.closeOverlays() : c.toggleReview()),
  };
  const keypad = (k: string) => {
    c.key(k);
    const fn: Record<string, () => void> = {
      '1': c.flash, '2': c.timer, '3': c.ratio, '4': c.toggleGrid, '5': c.shoot, '6': c.flip,
      '7': c.wb, '8': c.me, '9': c.toggleHud, '*': () => c.nav(busy ? 'left' : 'down'), '0': c.toggleReview, '#': c.menu,
    };
    fn[k]?.();
  };
  const pad = (d: Dir) => (d === 'ok' && !busy ? (c.key(), c.shoot()) : c.nav(turned ? TURNED[d] : d));
  // a hairline gap so neighbouring keys never touch
  const inset = ([x, y, w, h]: Box, gx = 0.5, gy = 0.35): Box => [x + gx, y + gy, w - gx * 2, h - gy * 2];
  const swap = c.cam.id !== 'cyberphone'; // the Nokias and the flip print "def 3": letters before the digit on the right
  return (
    <div className={`cb cb-ip m-${c.cam.id} ${c.firing ? 'is-firing' : ''}`}>
      <div className="cb-ip-frame" style={{ ['--ratio' as string]: spec.ratio, ['--cut' as string]: spec.cut }}>
      <div className="cb-ip-view">
      <div className="cb-ip-phone">
        <Art />
        <div className="cb-ip-screen" style={pos(spec.screen)}>
          <div className="cb-ip-live">
            <div className="cb-ip-live-in">{c.screen}</div>
          </div>
          <div className="cb-ip-soft" aria-hidden="true">
            <span>{c.menuOpen ? 'Select' : 'Options'}</span>
            <span>{c.review ? `${c.reviewPos}/${c.galleryCount}` : c.live ? '◉' : ''}</span>
            <span>{busy ? 'Back' : 'Gallery'}</span>
          </div>
        </div>
        {spec.hots.map((h, i) => (
          <button
            key={`${h.act}${i}`}
            type="button"
            className={`ph-k is-${h.act} ${h.box[0] + h.box[2] / 2 < 50 ? 'is-l' : 'is-r'}`}
            style={pos(inset(h.box, 0.3, 0.3))}
            onClick={() => (c.key(), act[h.act]())}
            aria-label={h.label}
          >
            {h.act === 'call' && <Phone />}
            {h.act === 'end' && <PhoneOff />}
            {h.act === 'menu' && <Menu />}
            {h.act === 'back' && <b>{h.glyph ?? 'C'}</b>}
            {(h.act === 'softL' || h.act === 'softR') && <i />}
          </button>
        ))}
        <div className="ph-pad" style={{ ...pos(spec.pad), ['--edge' as string]: `${((1 - spec.padCentre) / 2) * 100 - 1}%` }} role="group" aria-label="Direction pad">
          {(['up', 'right', 'down', 'left'] as const).map((d) => (
            <button key={d} type="button" className={`ph-arrow is-${d}`} onClick={() => pad(d)} aria-label={d} />
          ))}
          <button type="button" className="ph-ok" style={{ inset: `${((1 - spec.padCentre) / 2) * 100}%` }} onClick={() => pad('ok')} aria-label="OK — shoot">
            <span />
          </button>
        </div>
        {KEYPAD.map((key, i) => {
          const [y0, y1] = spec.keys.rows[Math.floor(i / 3)];
          const [x0, x1] = spec.keys.cols[i % 3];
          const col = i % 3;
          return (
            <button
              key={key}
              type="button"
              className={`ph-k is-digit is-c${col} ${swap && col === 2 ? 'is-swap' : ''}`}
              style={pos(inset([x0, y0, x1 - x0, y1 - y0]))}
              onClick={() => keypad(key)}
              aria-label={`Key ${key}`}
            >
              <b>{key}</b>
              <small>{DIGIT_LETTERS[key]}</small>
            </button>
          );
        })}
      </div>
      </div>
      </div>
    </div>
  );
}

/* Early smartphone: black glass, chrome rim, one home button ------------------------------------- */
function TouchBody({ c }: BodyProps) {
  const thumb = useObjectUrl(c.latest?.blob);
  const time = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return (
    <div className={root(c, 'touch')}>
      <span className="cb-sheen" aria-hidden="true" />
      <div className="cb-t-top" aria-hidden="true">
        <span className="cb-t-speaker" />
      </div>
      <div className="cb-t-glass">
        <div className="cb-t-status">
          <span>▮▮▮▯ Delineate 3G</span>
          <b>{time}</b>
          <span className="cb-t-status-r">
            <button type="button" onClick={c.flash} aria-pressed={c.flashOn} aria-label="Flash">
              {c.flashOn ? <Zap size={12} /> : <ZapOff size={12} />}
            </button>
            <button type="button" onClick={c.menu} aria-label="Settings">
              <Menu size={13} />
            </button>
          </span>
        </div>
        <div className="cb-t-view">
          {c.screen}
          <div className="cb-t-bar">
            <button type="button" className="cb-t-thumb" onClick={c.toggleReview} aria-label="Camera roll">
              {thumb ? <img src={thumb} alt="" /> : <Images size={16} />}
            </button>
            <button type="button" className="cb-t-zoom" {...c.zoomProps(-1)} aria-label={c.review ? 'Older photo' : 'Zoom out'}>
              {c.review ? <ChevronLeft size={16} /> : <Minus size={14} />}
            </button>
            <Shutter c={c} className="cb-t-shoot" label="Take picture">
              <Camera size={22} />
            </Shutter>
            <button type="button" className="cb-t-zoom" {...c.zoomProps(1)} aria-label={c.review ? 'Newer photo' : 'Zoom in'}>
              {c.review ? <ChevronRight size={16} /> : <Plus size={14} />}
            </button>
            <button type="button" className="cb-t-flip" onClick={c.flip} aria-label="Switch camera">
              <SwitchCamera size={16} />
            </button>
          </div>
        </div>
      </div>
      <button type="button" className="cb-t-home" onClick={c.power} aria-label={c.on ? 'Home — turn camera off' : 'Home — turn camera on'}>
        <i />
      </button>
    </div>
  );
}

/* Pocket digital: brushed-metal backs; every model arranges its keys its own way (see cam-real.css) */
function CompactBody({ c }: BodyProps) {
  const id = c.cam.id;
  return (
    <div className={root(c, 'compact')}>
      <div className="cb-c-topplate">
        <span className="cb-c-topbrand">{c.cam.model}</span>
        <span className="cb-c-mic" aria-hidden="true" />
        <button type="button" className="cb-c-power" onClick={c.power} aria-label={c.on ? 'Turn camera off' : 'Turn camera on'} aria-pressed={c.on}>
          <i />
        </button>
        <div className="cb-c-shutterset">
          <button type="button" className="cb-c-ring is-w" {...c.zoomProps(-1)} aria-label={c.review ? 'Older photo' : 'Zoom out'}>W</button>
          <Shutter c={c} className="cb-c-shutter" />
          <button type="button" className="cb-c-ring is-t" {...c.zoomProps(1)} aria-label={c.review ? 'Newer photo' : 'Zoom in'}>T</button>
        </div>
      </div>
      <div className="cb-c-face">
        <span className="cb-sheen" aria-hidden="true" />
        <div className="cb-c-lcdside">
          <div className="cb-c-labels">
            <span className="cb-c-brand">DELINEATE</span>
            <span className="cb-c-vfwin" aria-hidden="true" />
          </div>
          <div className="cb-c-lcd">{c.screen}</div>
          <span className="cb-c-name" aria-hidden="true">{c.cam.name}</span>
        </div>
        <div className="cb-c-ctrl">
          <button type="button" className="cb-c-dial is-dial" onClick={c.wb} aria-label={`Mode dial — white balance ${c.wbLabel}`}>
            <i />
            <small>{c.wbLabel}</small>
          </button>
          <div className="cb-c-rocker is-rocker" aria-label={c.review ? 'Browse photos' : 'Zoom'}>
            <button type="button" {...c.zoomProps(-1)} aria-label={c.review ? 'Older photo' : 'Zoom out'}>W</button>
            <span>{c.review ? `${c.reviewPos}/${c.galleryCount}` : `${c.zoom.toFixed(1)}×`}</span>
            <button type="button" {...c.zoomProps(1)} aria-label={c.review ? 'Newer photo' : 'Zoom in'}>T</button>
          </div>
          <span className="cb-c-speaker is-speaker" aria-hidden="true" />
          <span className={`cb-c-led is-led ${c.live ? 'is-live' : ''} ${c.firing ? 'is-busy' : ''}`} aria-hidden="true" />
          {id === 'easyshare' && (
            <button type="button" className={`cb-c-share is-share ${c.review ? 'is-on' : ''}`} onClick={c.toggleReview} aria-label="Share — open the gallery">
              SHARE
            </button>
          )}
          <button type="button" className={`cb-c-key is-play ${c.review ? 'is-on' : ''}`} onClick={c.toggleReview} aria-pressed={c.review} aria-label="Playback">▶</button>
          <button type="button" className={`cb-c-key is-menu ${c.menuOpen ? 'is-on' : ''}`} onClick={c.menu} aria-label="Menu">MENU</button>
          <DPad
            c={c}
            ok={c.menu}
            label={<small>{id === 'finepix' || id === 'lumix' ? <>MENU<br />OK</> : <>FUNC<br />SET</>}</small>}
            className="cb-c-dpad is-pad"
            marks={{ up: '±', right: c.flashOn ? '⚡' : 'ϟ', down: '◷', left: '#' }}
            act={{ up: () => c.ev(1), right: c.flash, down: c.timer, left: c.toggleGrid }}
          />
          <button type="button" className="cb-c-key is-disp" onClick={c.toggleHud} aria-label="Display">DISP</button>
          {c.cam.stamp && (
            <button type="button" className={`cb-c-key is-date ${c.dateOn ? 'is-on' : ''}`} onClick={c.date} aria-pressed={c.dateOn} aria-label="Date imprint">DATE</button>
          )}
          <button type="button" className="cb-c-key is-ratio" onClick={c.ratio} aria-label="Frame shape">{c.aspect}</button>
        </div>
      </div>
    </div>
  );
}

/* Film & instant: each body keeps the live view where its own big panel is -------------------------- */
const FILM_LABEL: Record<string, string> = {
  mini: 'instant mini',
  folding: 'LAND CAMERA STYLE',
  funsaver: 'ISO 800 · 27 EXP',
  clamshell: 'ISO 400 · 36 EXP',
  dream: 'Dream',
  rangem: 'TRI-STOCK 400',
  pano: 'PANORAMA',
};
function FilmBody({ c }: BodyProps) {
  const { cam } = c;
  const dial = cam.dial;
  const ev = (c.evIndex - 6) / 3;
  const dialIndex = dial ? dial.ev.reduce((best, v, i) => (Math.abs(v - ev) < Math.abs(dial.ev[best] - ev) ? i : best), 0) : 0;
  const count = pad((c.filmNumber % 36) + 1, 2);
  return (
    <div className={root(c, 'film')}>
      <div className="cb-f-top">
        <span className="cb-f-rewind" aria-hidden="true" />
        <span className="cb-f-eyepiece" aria-hidden="true" />
        <span className="cb-f-brand">
          DELINEATE <small>{cam.model}</small>
        </span>
        <span className="cb-f-counter" aria-label={`Frame ${count}`}>
          <b key={c.filmNumber}>{count}</b>
        </span>
        <span className="cb-f-spacer" />
        <button type="button" className={`cb-f-power ${c.on ? 'is-on' : ''}`} onClick={c.power} aria-label={c.on ? 'Turn camera off' : 'Turn camera on'} aria-pressed={c.on}>
          <i />
          <small>{c.on ? 'ON' : 'OFF'}</small>
        </button>
        {cam.wind === 'lever' && (
          <button type="button" className={`cb-f-lever ${c.needWind ? 'is-due' : ''}`} onClick={c.windOn} aria-label="Film advance lever">
            <i />
          </button>
        )}
        <Shutter c={c} className="cb-f-shutter">
          <span />
        </Shutter>
      </div>
      <div className="cb-f-back">
        <span className="cb-sheen" aria-hidden="true" />
        <div className="cb-f-vf">{c.screen}</div>
        <div className="cb-f-ctrl">
          <span className="cb-f-plate" aria-hidden="true">{FILM_LABEL[cam.id] ?? cam.model}</span>
          {cam.id === 'clamshell' && (
            <span className="cb-f-lcd" aria-hidden="true">
              <small>{c.flashOn ? 'ϟ' : ''} {c.timerOn ? '◷' : ''}</small>
              <b>{count}</b>
            </span>
          )}
          {cam.id === 'rangem' && <span className="cb-f-isodisc" aria-hidden="true"><i /></span>}
          {dial && <Knob label={dial.label} options={dial.options} index={dialIndex} onChange={(i) => c.setEvValue(dial.ev[i])} size="sm" sweep={dial.options.length > 3 ? 180 : 120} className="cb-f-dial" />}
          {cam.wind === 'thumb' && (
            <button type="button" className={`cb-f-thumb ${c.needWind ? 'is-due' : ''}`} onClick={c.windOn} aria-label="Thumbwheel — wind the film on">
              <i />
              <small>WIND ▸</small>
            </button>
          )}
          <div className="cb-f-keys">
            <button type="button" className={c.flashOn ? 'is-on' : ''} onClick={c.flash} aria-pressed={c.flashOn} aria-label="Flash">
              {c.flashOn ? <Zap size={14} /> : <ZapOff size={14} />}
            </button>
            <button type="button" className={c.timerOn ? 'is-on' : ''} onClick={c.timer} aria-label="Self-timer">
              ◷
            </button>
            {c.canRatio && (
              <button type="button" onClick={c.ratio} aria-label="Frame orientation">
                <b>{c.aspect}</b>
              </button>
            )}
            {cam.stamp && (
              <button type="button" className={c.dateOn ? 'is-on' : ''} onClick={c.date} aria-pressed={c.dateOn} aria-label="Date imprint">
                <b>DATE</b>
              </button>
            )}
            <button type="button" onClick={c.flip} aria-label="Switch camera">
              <SwitchCamera size={14} />
            </button>
            <button type="button" className={c.menuOpen ? 'is-on' : ''} onClick={c.menu} aria-label="Menu">
              <Menu size={14} />
            </button>
          </div>
          <div className="cb-f-prints">
            <button type="button" {...c.zoomProps(-1)} disabled={!c.review} aria-label="Older print">
              <ChevronLeft size={15} />
            </button>
            <button type="button" className={c.review ? 'is-on' : ''} onClick={c.toggleReview} aria-pressed={c.review} aria-label="Prints — browse your photos">
              {c.review ? `${c.reviewPos}/${c.galleryCount}` : 'PRINTS'}
            </button>
            <button type="button" {...c.zoomProps(1)} disabled={!c.review} aria-label="Newer print">
              <ChevronRight size={15} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* Camcorders: flip-out LCD on its hinge beside the body's side panel ------------------------------ */
function VideoBody({ c }: BodyProps) {
  const mode = !c.on ? 'off' : c.review ? 'play' : 'camera';
  const setMode = (m: 'off' | 'camera' | 'play') => {
    if (m === mode) return;
    if (m === 'off') {
      if (c.review) c.closeOverlays();
      if (c.on) c.power();
    } else if (m === 'camera') {
      if (c.review) c.closeOverlays();
      if (!c.on) c.power();
    } else c.toggleReview();
  };
  return (
    <div className={root(c, 'video')}>
      <div className="cb-v-lcdwrap">
        <div className="cb-v-lcd">{c.screen}</div>
        <span className="cb-v-hinge" aria-hidden="true" />
      </div>
      <div className="cb-v-body">
        <span className="cb-sheen" aria-hidden="true" />
        <div className="cb-v-barrel" aria-hidden="true">
          <span className="cb-v-lens" />
          <span className="cb-v-brand">
            DELINEATE <b>{c.cam.id === 'vhs' ? 'VHS-C' : 'DV'}</b>
          </span>
          <span className="cb-v-eyecup" />
        </div>
        <div className="cb-v-side">
          <div className="cb-v-power" role="radiogroup" aria-label="Power mode">
            {(['off', 'camera', 'play'] as const).map((m) => (
              <button key={m} type="button" role="radio" aria-checked={mode === m} className={mode === m ? 'is-on' : ''} onClick={() => (c.key(), setMode(m))}>
                {m === 'play' ? 'VCR' : m.toUpperCase()}
              </button>
            ))}
          </div>
          <div className="cb-v-transport" aria-label="Tape transport">
            <button type="button" onClick={() => (c.review ? c.browse(1) : c.toggleReview())} aria-label="Rewind — older photo">◀◀</button>
            <button type="button" className={c.review ? 'is-on' : ''} onClick={c.toggleReview} aria-label="Play">▶</button>
            <button type="button" onClick={() => (c.review ? c.browse(-1) : c.toggleReview())} aria-label="Fast forward — newer photo">▶▶</button>
            <button type="button" onClick={() => c.review && c.closeOverlays()} aria-label="Stop">■</button>
          </div>
          <div className="cb-v-keys">
            <button type="button" className={c.dateOn ? 'is-on' : ''} onClick={c.date} aria-pressed={c.dateOn}>DATE</button>
            <button type="button" className={c.flashOn ? 'is-on' : ''} onClick={c.flash} aria-pressed={c.flashOn}>LIGHT</button>
            <button type="button" className={c.menuOpen ? 'is-on' : ''} onClick={c.menu}>MENU</button>
            <button type="button" onClick={c.flip}>FLIP</button>
            <button type="button" className={c.timerOn ? 'is-on' : ''} onClick={c.timer}>TIMER</button>
            <button type="button" className={c.grid ? 'is-on' : ''} onClick={c.toggleGrid}>GRID</button>
          </div>
          <div className="cb-v-bottom">
            <div className="cb-v-zoom" aria-label="Power zoom">
              <button type="button" {...c.zoomProps(-1)} aria-label="Zoom out">W</button>
              <span>{c.review ? `${c.reviewPos}/${c.galleryCount}` : `${c.zoom.toFixed(1)}×`}</span>
              <button type="button" {...c.zoomProps(1)} aria-label="Zoom in">T</button>
            </div>
            <Shutter c={c} className="cb-v-rec" label="Photo — take a still">
              <span>PHOTO</span>
            </Shutter>
          </div>
        </div>
      </div>
    </div>
  );
}

/* Handheld pixel camera ----------------------------------------------------------------------------- */
function HandheldBody({ c }: BodyProps) {
  const busy = c.menuOpen || c.review;
  return (
    <div className={root(c, 'handheld')}>
      <div className="cb-h-cart" aria-hidden="true">
        <span>PIXEL CAM</span>
      </div>
      <button type="button" className="cb-h-eye" onClick={c.flip} aria-label="Swivel the camera (switch camera)">
        <i />
      </button>
      <div className="cb-h-face">
        <span className="cb-sheen" aria-hidden="true" />
        <div className="cb-h-strip">
          <button type="button" className={`cb-h-power ${c.on ? 'is-on' : ''}`} onClick={c.power} aria-label={c.on ? 'Power off' : 'Power on'} aria-pressed={c.on}>
            ◀ OFF·ON ▶
          </button>
        </div>
        <div className="cb-h-bezel">
          <div className="cb-h-bezel-top">
            <span className={`cb-h-led ${c.on ? 'is-on' : ''}`} />
            <small>POWER</small>
          </div>
          {c.screen}
          <small className="cb-h-bezel-name">DELINEATE POCKET PIXEL</small>
        </div>
        <div className="cb-h-controls">
          <DPad c={c} className="cb-h-dpad" label="" />
          <div className="cb-h-ab">
            <button type="button" className="is-b" onClick={() => (c.key(), busy ? c.closeOverlays() : c.toggleReview())} aria-label="B — view / back">
              B
            </button>
            <button type="button" className="is-a" onClick={() => (busy ? c.nav('ok') : (c.key(), c.shoot()))} aria-label="A — shoot">
              A
            </button>
          </div>
        </div>
        <div className="cb-h-pills">
          <button type="button" onClick={c.flip} aria-label="Select — swivel camera">
            <i />
            <small>SELECT</small>
          </button>
          <button type="button" onClick={c.menu} aria-label="Start — menu">
            <i />
            <small>START</small>
          </button>
        </div>
        <span className="cb-h-grille" aria-hidden="true" />
      </div>
    </div>
  );
}

/* Desktop webcam: a clip-on eye above a snapshot window ---------------------------------------------- */
function WebcamBody({ c }: BodyProps) {
  return (
    <div className={root(c, 'webcam')}>
      <div className="cb-w-device" aria-hidden="true">
        <span className="cb-w-lens" />
        <span className={`cb-w-led ${c.live ? 'is-on' : ''}`} />
      </div>
      <div className="cb-w-window">
        <div className="cb-w-title">
          <span className="cb-w-dots" aria-hidden="true"><i /><i /><i /></span>
          <b>Snapshot — {c.cam.model}</b>
          <button type="button" className={`cb-w-power ${c.on ? 'is-on' : ''}`} onClick={c.power} aria-pressed={c.on}>
            <Power size={12} /> {c.on ? 'Camera on' : 'Camera off'}
          </button>
        </div>
        {c.screen}
        <div className="cb-w-bar">
          <button type="button" className={c.review ? 'is-on' : ''} onClick={c.toggleReview} aria-pressed={c.review} aria-label="Photo strip">
            <Grid3X3 size={15} />
          </button>
          <button type="button" {...c.zoomProps(-1)} aria-label={c.review ? 'Older photo' : 'Zoom out'}>
            <ChevronLeft size={16} />
          </button>
          <Shutter c={c} className="cb-w-shoot" label="Take a snapshot (3-second countdown)">
            <Camera size={22} />
          </Shutter>
          <button type="button" {...c.zoomProps(1)} aria-label={c.review ? 'Newer photo' : 'Zoom in'}>
            <ChevronRight size={16} />
          </button>
          <button type="button" className={c.menuOpen ? 'is-on' : ''} onClick={c.menu} aria-label="Settings">
            <Menu size={15} />
          </button>
        </div>
      </div>
    </div>
  );
}

export const BODIES: Partial<Record<Layout, ComponentType<BodyProps>>> = {
  alloy: AlloyBody,
  phone: PhoneBody,
  touch: TouchBody,
  compact: CompactBody,
  film: FilmBody,
  video: VideoBody,
  handheld: HandheldBody,
  webcam: WebcamBody,
};
