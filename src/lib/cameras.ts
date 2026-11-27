import type { AspectKey, FrameStyle, Look, StampStyle } from '../types';
import type { KeySound, Voice } from './audio';
import { lookToCss } from './filters';
import { paintOverlays } from './render';
import { miniDv } from './fx';

/* The camera collection: every model is a body layout + a voice + a look that is live in the viewfinder
   and baked into the saved frame. Models are creative modes inspired by real devices, not emulations. */

export type CollectionId = 'delineate' | 'digi' | 'mobile' | 'pocket' | 'film' | 'lab';
export type Layout = 'alloy' | 'dc' | 'phone' | 'touch' | 'compact' | 'film' | 'video' | 'handheld' | 'webcam';
/** Pixel-level character the CSS look can't express; previews run through a canvas when a model has one. */
export type Pass = 'lowres' | 'gb' | 'jpeg' | 'vhs' | 'dv' | 'dream';
export type Fx = 'iris' | 'blink' | 'eject' | 'process' | 'curtain' | 'fade';
/** A film body's exposure dial: labels shown on the knob, each mapped to an EV offset. */
export type Dial = { label: string; options: string[]; ev: number[] };

export type CamModel = {
  id: string;
  collection: CollectionId;
  name: string;
  model: string;
  tag: string;
  /** The device that inspired it, shown as a caption. */
  inspired: string;
  layout: Layout;
  voice: Voice;
  key: KeySound;
  fx: Fx;
  buzz: number[];
  boot: string;
  bootSub: string;
  look: Partial<Look>;
  pass?: Pass;
  /** Long side of the saved frame in px (the sensor). Default 1600. */
  res?: number;
  ratios?: AspectKey[];
  /** Date imprint the body offers (on by default for camcorders). */
  stamp?: StampStyle;
  stampOn?: boolean;
  /** Instant prints come out framed. */
  frame?: FrameStyle;
  /** Manual film advance: the shutter locks until you wind on. */
  wind?: 'lever' | 'thumb';
  dial?: Dial;
  /** Photo-booth style: always counts down and flashes the screen. */
  booth?: boolean;
};

export const COLLECTIONS: { id: CollectionId; name: string; short: string; note: string }[] = [
  { id: 'delineate', short: 'Delineate', name: 'Delineate', note: 'The house camera: machined aluminium, in three finishes' },
  { id: 'digi', short: 'Digi', name: 'Digi Cam', note: 'The original six bodies' },
  { id: 'mobile', short: 'Mobile', name: 'Retro Mobile', note: 'Camera phones, 2003–2009' },
  { id: 'pocket', short: 'Pocket', name: 'Pocket Digital', note: 'CCD compacts of the 2000s' },
  { id: 'film', short: 'Film', name: 'Film & Instant', note: 'Wind-on film and instant prints' },
  { id: 'lab', short: 'Lab', name: 'Experimental', note: 'Tape, pixels, webcams, panoramas' },
];

const SNAP: AspectKey[] = ['3:2', '2:3'];

export const CAMERAS: CamModel[] = [
  // Delineate — the house camera (alloy layout): one machined body in three finishes, each with its own details.
  { id: 'alloy-silver', collection: 'delineate', name: 'Silver', model: 'ALLOY 01', tag: 'Precision. Clarity.', inspired: 'Delineate’s own camera, in satin-brushed aluminium', layout: 'alloy', voice: 'compact', key: 'click', fx: 'iris', buzz: [12, 24, 8], boot: 'Delineate', bootSub: 'ALLOY 01',
    look: { contrast: 1.04, saturation: 1.02 } },
  { id: 'alloy-graphite', collection: 'delineate', name: 'Graphite', model: 'ALLOY 01 · G', tag: 'Quiet. Low-key.', inspired: 'Delineate’s own camera, in dark anodised graphite', layout: 'alloy', voice: 'compact', key: 'click', fx: 'iris', buzz: [12, 24, 8], boot: 'Delineate', bootSub: 'ALLOY 01 · GRAPHITE',
    look: { contrast: 1.1, saturation: 0.94, warmth: -4, vignette: 0.12 } },
  { id: 'alloy-gold', collection: 'delineate', name: 'Gold', model: 'ALLOY 01 · AU', tag: 'Warm. Golden hour.', inspired: 'Delineate’s own camera, in champagne gold', layout: 'alloy', voice: 'compact', key: 'click', fx: 'iris', buzz: [12, 24, 8], boot: 'Delineate', bootSub: 'ALLOY 01 · GOLD',
    look: { warmth: 10, saturation: 1.06, contrast: 1.03, fade: 0.04 } },
  // Digi Cam — the original bodies (dc layout), each now with a gentle signature look.
  { id: 'classic', collection: 'digi', name: 'Classic Film', model: 'F-1', tag: 'Timeless. Film-like.', inspired: 'A 1970s SLR', layout: 'dc', voice: 'mech', key: 'click', fx: 'iris', buzz: [18, 30, 12], boot: 'Delineate', bootSub: 'F-1 · LOADING FILM',
    look: { warmth: 8, contrast: 1.05, saturation: 0.95, grain: 10, fade: 0.05 } },
  { id: 'disposable', collection: 'digi', name: 'Disposable', model: 'SNAP 27', tag: 'Fun. Imperfect.', inspired: 'A drugstore disposable', layout: 'dc', voice: 'plastic', key: 'click', fx: 'blink', buzz: [30], boot: '27', bootSub: 'EXPOSURES · ISO 400',
    look: { saturation: 1.15, contrast: 1.12, warmth: 10, grain: 18, vignette: 0.25 } },
  { id: 'instant', collection: 'digi', name: 'Instant', model: 'SX INSTANT', tag: 'Soft. Instant.', inspired: 'A 1980s instant camera', layout: 'dc', voice: 'motor', key: 'soft', fx: 'eject', buzz: [10, 20, 200], boot: 'Instant', bootSub: 'FILM PACK READY',
    look: { fade: 0.18, warmth: 12, saturation: 0.9, contrast: 0.92, vignette: 0.2 } },
  { id: 'digicam', collection: 'digi', name: 'Digital 2000s', model: 'DIGISHOT 5MP', tag: 'Flashy. Iconic.', inspired: 'A 2004 point-and-shoot', layout: 'dc', voice: 'digital', key: 'beep', fx: 'process', buzz: [8], boot: 'DIGISHOT', bootSub: '5.0 MEGA PIXELS',
    look: { saturation: 1.18, contrast: 1.08, warmth: -6, tint: -4 } },
  { id: 'rangefinder', collection: 'digi', name: 'Rangefinder', model: 'M-35', tag: 'Minimal. Elegant.', inspired: 'A 1950s rangefinder', layout: 'dc', voice: 'leaf', key: 'click', fx: 'curtain', buzz: [6], boot: 'M-35', bootSub: 'RANGEFINDER · 0.72×',
    look: { contrast: 1.06, saturation: 0.9, grain: 8 } },
  { id: 'minimal', collection: 'digi', name: 'Modern Minimal', model: 'ZERO', tag: 'Clean. Focused.', inspired: 'A modern mirrorless', layout: 'dc', voice: 'soft', key: 'glass', fx: 'fade', buzz: [12, 40, 6], boot: 'ZERO', bootSub: '',
    look: {} },

  // Retro Mobile
  { id: 'oval', collection: 'mobile', name: 'Oval Keypad', model: 'DL-66', tag: 'VGA. Restrained colour.', inspired: 'Inspired by the Nokia 6600 (2003)', layout: 'phone', voice: 'phone', key: 'dtmf', fx: 'fade', buzz: [20], boot: 'DELINEATE', bootSub: 'CAMERA · VGA 640×480',
    look: { saturation: 0.78, contrast: 1.12, warmth: -6, tint: 8, grain: 16, blur: 0.3 }, pass: 'lowres', res: 640, ratios: ['3:4', '4:3'] },
  { id: 'candybar', collection: 'mobile', name: 'Classic Candybar', model: 'DL-73', tag: '3.2 MP. Sharp lens.', inspired: 'Inspired by the Nokia N73 (2006)', layout: 'phone', voice: 'phone', key: 'dtmf', fx: 'fade', buzz: [16], boot: 'DELINEATE', bootSub: '3.2 MEGAPIXEL · AUTOFOCUS',
    look: { saturation: 1.05, contrast: 1.06, warmth: 6, vignette: 0.22, grain: 6, blur: 0.2 }, pass: 'lowres', res: 1600, ratios: ['3:4', '4:3'] },
  { id: 'cyberphone', collection: 'mobile', name: 'Cyber Phone', model: 'DL-750', tag: 'Punchy. Direct flash.', inspired: 'Inspired by the Sony Ericsson K750i / W810i (2005)', layout: 'phone', voice: 'phone', key: 'dtmf', fx: 'blink', buzz: [12, 30, 12], boot: 'DELINEATE', bootSub: '2.0 MEGAPIXEL · FLASH',
    look: { saturation: 1.28, contrast: 1.25, warmth: 4, vignette: 0.15, grain: 12 }, pass: 'lowres', res: 1200, ratios: ['3:4', '4:3'] },
  { id: 'flip', collection: 'mobile', name: 'Razor Flip', model: 'DL-V3', tag: 'Thin. Soft. Lo-fi.', inspired: 'Inspired by the Motorola RAZR V3 (2004)', layout: 'phone', voice: 'phone', key: 'dtmf', fx: 'fade', buzz: [10], boot: 'hello moto', bootSub: 'CAMERA · 0.3 MP',
    look: { saturation: 0.86, contrast: 0.96, fade: 0.1, warmth: 4, blur: 0.6, grain: 14 }, pass: 'lowres', res: 640, ratios: ['3:4', '4:3'] },
  { id: 'touch', collection: 'mobile', name: 'Touch 3G', model: 'DL-3G', tag: 'Early smartphone snapshot.', inspired: 'Inspired by the iPhone 3GS (2009)', layout: 'touch', voice: 'iphone', key: 'glass', fx: 'iris', buzz: [8], boot: '', bootSub: '',
    look: { saturation: 1.05, contrast: 1.08, warmth: 10, vignette: 0.25, blur: 0.15 }, res: 2048, ratios: ['3:4', '4:3'] },

  // Pocket Digital — CCD compacts
  { id: 'ixus', collection: 'pocket', name: 'Pocket Silver', model: 'DL-IX5', tag: 'Balanced. Reliable.', inspired: 'Inspired by Canon PowerShot / IXUS', layout: 'compact', voice: 'compact', key: 'beep', fx: 'process', buzz: [8], boot: 'DELINEATE', bootSub: '7.1 MEGA PIXELS', stamp: 'lcd',
    look: { saturation: 1.08, contrast: 1.06, warmth: 2 }, res: 2048 },
  { id: 'cybershot', collection: 'pocket', name: 'Vivid Shot', model: 'DL-W50', tag: 'Vivid everyday colour.', inspired: 'Inspired by Sony Cyber-shot', layout: 'compact', voice: 'compact', key: 'beep', fx: 'fade', buzz: [8], boot: 'DELINEATE', bootSub: 'SUPER HAD CCD', stamp: 'lcd',
    look: { saturation: 1.32, contrast: 1.12, tint: -4, hue: -4 }, res: 2048 },
  { id: 'finepix', collection: 'pocket', name: 'Warm Fine', model: 'DL-F30', tag: 'Warm, film-adjacent.', inspired: 'Inspired by Fujifilm FinePix', layout: 'compact', voice: 'compact', key: 'beep', fx: 'fade', buzz: [8], boot: 'DELINEATE', bootSub: 'SUPER CCD · ISO 3200', stamp: 'lcd',
    look: { warmth: 14, saturation: 1.1, grain: 8, fade: 0.05 }, res: 2048 },
  { id: 'coolpix', collection: 'pocket', name: 'Clean Point', model: 'DL-P5', tag: 'Clean point-and-shoot.', inspired: 'Inspired by Nikon Coolpix', layout: 'compact', voice: 'compact', key: 'beep', fx: 'curtain', buzz: [8], boot: 'DELINEATE', bootSub: 'NIKKOR-STYLE ZOOM', stamp: 'lcd',
    look: { contrast: 1.04, saturation: 1.02, warmth: -4 }, res: 2048 },
  { id: 'exilim', collection: 'pocket', name: 'Card Slim', model: 'DL-Z10', tag: 'Slim. Crisp. Cool.', inspired: 'Inspired by Casio Exilim', layout: 'compact', voice: 'digital', key: 'beep', fx: 'fade', buzz: [6], boot: 'DELINEATE', bootSub: 'CARD SIZE', stamp: 'lcd',
    look: { saturation: 1.15, contrast: 1.15, warmth: -6, vignette: 0.1, blur: 0.15 }, res: 1600 },
  { id: 'mjudigital', collection: 'pocket', name: 'Weather Pod', model: 'DL-µ7', tag: 'Rounded. All-weather.', inspired: 'Inspired by Olympus µ digital', layout: 'compact', voice: 'compact', key: 'beep', fx: 'curtain', buzz: [8], boot: 'DELINEATE', bootSub: 'ALL WEATHER', stamp: 'lcd',
    look: { warmth: 4, saturation: 1.05, tint: 4, contrast: 1.04 }, res: 2048 },
  { id: 'lumix', collection: 'pocket', name: 'Bright Lens', model: 'DL-FX', tag: 'Crisp, restrained.', inspired: 'Inspired by Panasonic Lumix', layout: 'compact', voice: 'compact', key: 'beep', fx: 'fade', buzz: [8], boot: 'DELINEATE', bootSub: 'WIDE 28MM', stamp: 'lcd',
    look: { contrast: 1.1, saturation: 0.95, warmth: -2 }, res: 2048 },
  { id: 'easyshare', collection: 'pocket', name: 'Easy Share', model: 'DL-C7', tag: 'Kodachrome-ish warmth.', inspired: 'Inspired by Kodak EasyShare', layout: 'compact', voice: 'digital', key: 'beep', fx: 'process', buzz: [8], boot: 'DELINEATE', bootSub: 'COLOR SCIENCE', stamp: 'lcd',
    look: { warmth: 12, saturation: 1.22, contrast: 1.06 }, res: 1600 },

  // Film & Instant
  { id: 'mini', collection: 'film', name: 'Mini Instant', model: 'DL-MINI', tag: 'Bright flash. Credit-card prints.', inspired: 'Inspired by Instax Mini', layout: 'film', voice: 'motor', key: 'soft', fx: 'eject', buzz: [10, 20, 200], boot: 'mini', bootSub: '10 EXPOSURES',
    look: { saturation: 1.16, contrast: 1.1, warmth: 2, tint: 6, vignette: 0.15 }, ratios: ['3:4'], frame: 'instax',
    dial: { label: 'Brightness', options: ['Indoor', 'Cloudy', 'Sunny', 'Hi-Key'], ev: [1, 0.33, -0.33, 1.67] } },
  { id: 'folding', collection: 'film', name: 'Folding Instant', model: 'DL-70', tag: 'Soft tones. Square.', inspired: 'Inspired by the Polaroid SX-70', layout: 'film', voice: 'sx70', key: 'click', fx: 'eject', buzz: [10, 20, 400], boot: 'SX', bootSub: 'LAND CAMERA STYLE',
    look: { contrast: 0.9, fade: 0.22, warmth: 16, saturation: 0.85, blur: 0.3, vignette: 0.3 }, ratios: ['1:1'], frame: 'sx70',
    dial: { label: 'Lighten / Darken', options: ['●●', '●', '·', '○', '○○'], ev: [-1.33, -0.67, 0, 0.67, 1.33] } },
  { id: 'funsaver', collection: 'film', name: 'Fun Saver', model: 'DL-27', tag: 'Flash, grain, imperfect colour.', inspired: 'Inspired by Kodak FunSaver', layout: 'film', voice: 'plastic', key: 'click', fx: 'blink', buzz: [30], boot: '27', bootSub: 'ISO 800 · FLASH', wind: 'thumb',
    look: { saturation: 1.2, contrast: 1.15, warmth: 12, grain: 22, vignette: 0.4 }, ratios: SNAP },
  { id: 'clamshell', collection: 'film', name: 'Clamshell 35', model: 'DL-µII', tag: 'Sharp 35mm street look.', inspired: 'Inspired by the Olympus Mju II', layout: 'film', voice: 'motor35', key: 'click', fx: 'curtain', buzz: [8, 20, 60], boot: 'µ', bootSub: '35MM F/2.8', stamp: 'date',
    look: { saturation: 1.1, contrast: 1.12, warmth: 6, grain: 10, vignette: 0.15 }, ratios: SNAP },
  { id: 'dream', collection: 'film', name: 'Dream Toy', model: 'DL-F', tag: 'Dreamy softness. Leaky.', inspired: 'Inspired by the Lomo Diana F', layout: 'film', voice: 'plastic', key: 'click', fx: 'blink', buzz: [20], boot: 'F', bootSub: '120 FILM · 12 EXP', wind: 'thumb',
    look: { saturation: 1.25, contrast: 1.15, hue: -8, vignette: 0.7, lightLeak: 0.28, grain: 16 }, pass: 'dream', ratios: ['1:1'],
    dial: { label: 'Weather', options: ['☁', '⛅', '☀'], ev: [0.67, 0, -0.67] } },
  { id: 'rangem', collection: 'film', name: 'Rangefinder M', model: 'DL-M6', tag: 'Restrained. Framelines.', inspired: 'Inspired by the Leica M6', layout: 'film', voice: 'cloth', key: 'click', fx: 'curtain', buzz: [6], boot: 'M', bootSub: 'TTL METERING', wind: 'lever',
    look: { contrast: 1.08, saturation: 0.92, grain: 10, warmth: 3 }, ratios: SNAP,
    dial: { label: 'Shutter', options: ['1/30', '1/60', '1/125', '1/250', '1/500'], ev: [1.33, 0.67, 0, -0.67, -1.33] } },

  // Experimental formats
  { id: 'vhs', collection: 'lab', name: 'Home Video', model: 'DL-VHS', tag: 'Timestamps and tape hiss.', inspired: 'Inspired by VHS camcorders', layout: 'video', voice: 'tape', key: 'clunk', fx: 'fade', buzz: [30, 40, 30], boot: 'VHS', bootSub: 'SP · CAMERA', stamp: 'camcorder', stampOn: true,
    look: { saturation: 1.1, contrast: 1.05, warmth: 6, blur: 0.4 }, pass: 'vhs', res: 640, ratios: ['4:3'] },
  { id: 'minidv', collection: 'lab', name: 'Mini Tape', model: 'DL-DV', tag: 'Early digital video.', inspired: 'Inspired by MiniDV camcorders', layout: 'video', voice: 'tape', key: 'beep', fx: 'fade', buzz: [20], boot: 'DV', bootSub: 'STANDBY', stamp: 'camcorder',
    look: { saturation: 1.12, contrast: 1.1, warmth: -4 }, pass: 'dv', res: 720, ratios: ['4:3', '16:9'] },
  { id: 'pixel', collection: 'lab', name: 'Pocket Pixel', model: 'DL-GB', tag: 'Four greens. Tiny pixels.', inspired: 'Inspired by the Game Boy Camera', layout: 'handheld', voice: 'chip', key: 'chip', fx: 'blink', buzz: [10], boot: 'POCKET PIXEL', bootSub: 'PRESS A',
    look: { contrast: 1.2 }, pass: 'gb', ratios: ['8:7'] },
  { id: 'webcam', collection: 'lab', name: 'Desk Webcam', model: 'DL-iS', tag: 'Compressed early-internet.', inspired: 'Inspired by iSight / early webcams', layout: 'webcam', voice: 'booth', key: 'soft', fx: 'blink', buzz: [8], boot: 'Snapshot', bootSub: 'CONNECTING…',
    look: { saturation: 0.92, contrast: 1.1, warmth: -6, blur: 0.3 }, pass: 'jpeg', res: 640, ratios: ['4:3'], booth: true },
  { id: 'pano', collection: 'lab', name: 'Wide Pano', model: 'DL-XP', tag: 'Deliberate landscapes.', inspired: 'Inspired by panoramic film cameras', layout: 'film', voice: 'mech', key: 'click', fx: 'curtain', buzz: [14, 30, 10], boot: 'PANORAMA', bootSub: '65 × 24', wind: 'lever',
    look: { warmth: 6, grain: 8, vignette: 0.28, contrast: 1.05 }, ratios: ['65:24'] },
];

export const getCamera = (id: string) => CAMERAS.find((c) => c.id === id) ?? CAMERAS[0];

/* Pixel passes ------------------------------------------------------------------------------------ */

const ctx2d = (c: HTMLCanvasElement) => c.getContext('2d', { willReadFrequently: true })!;
const GB = [
  [15, 56, 15],
  [48, 98, 48],
  [139, 172, 15],
  [155, 188, 15],
];
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

/** `t` animates the live preview (tape noise); saved frames use t = 0 so they are stable. */
export function applyPass(canvas: HTMLCanvasElement, pass: Pass | undefined, t = 0) {
  if (!pass) return canvas;
  const { width: w, height: h } = canvas;
  if (pass === 'dv') return miniDv(canvas, 0.5);
  const ctx = ctx2d(canvas);
  if (pass === 'dream') {
    // sharp centre, smeared edges: a blurred copy with its middle cut out, laid over the frame
    const soft = document.createElement('canvas');
    soft.width = w;
    soft.height = h;
    const s = soft.getContext('2d')!;
    s.filter = `blur(${Math.max(1, w / 90)}px)`;
    s.drawImage(canvas, 0, 0);
    s.filter = 'none';
    const hole = s.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.18, w / 2, h / 2, Math.min(w, h) * 0.55);
    hole.addColorStop(0, 'rgba(0,0,0,1)');
    hole.addColorStop(1, 'rgba(0,0,0,0)');
    s.globalCompositeOperation = 'destination-out';
    s.fillStyle = hole;
    s.fillRect(0, 0, w, h);
    ctx.drawImage(soft, 0, 0);
    return canvas;
  }
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  if (pass === 'gb') {
    for (let y = 0; y < h; y += 1)
      for (let x = 0; x < w; x += 1) {
        const i = (y * w + x) * 4;
        const l = (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) / 255;
        const level = Math.min(3, Math.max(0, Math.floor(l * 3 + BAYER[(y & 3) * 4 + (x & 3)] / 16)));
        const c = GB[level];
        d[i] = c[0];
        d[i + 1] = c[1];
        d[i + 2] = c[2];
      }
  } else if (pass === 'lowres') {
    // small phone sensor: crushed steps, noisy shadows, clipped highlights
    let seed = 7 + t;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) - 0.5;
    for (let i = 0; i < d.length; i += 4) {
      const l = (d[i] + d[i + 1] + d[i + 2]) / 765;
      const n = rnd() * 22 * (1 - l);
      for (let k = 0; k < 3; k += 1) {
        let v = d[i + k] + n;
        if (l > 0.82) v += (255 - v) * (l - 0.82) * 3;
        d[i + k] = Math.round(v / 10) * 10;
      }
    }
  } else if (pass === 'jpeg') {
    // heavy JPEG: 8×8 blocks flattened toward their mean, plus 2×2 colour smearing
    const B = 8;
    for (let by = 0; by < h; by += B)
      for (let bx = 0; bx < w; bx += B) {
        const ex = Math.min(w, bx + B);
        const ey = Math.min(h, by + B);
        const m = [0, 0, 0];
        let n = 0;
        for (let y = by; y < ey; y += 1)
          for (let x = bx; x < ex; x += 1) {
            const i = (y * w + x) * 4;
            m[0] += d[i];
            m[1] += d[i + 1];
            m[2] += d[i + 2];
            n += 1;
          }
        for (let k = 0; k < 3; k += 1) m[k] /= n;
        for (let y = by; y < ey; y += 1)
          for (let x = bx; x < ex; x += 1) {
            const i = (y * w + x) * 4;
            for (let k = 0; k < 3; k += 1) d[i + k] = m[k] + Math.round((d[i + k] - m[k]) / 22) * 22;
          }
      }
    for (let y = 0; y + 1 < h; y += 2)
      for (let x = 0; x + 1 < w; x += 2) {
        const idx = [(y * w + x) * 4, (y * w + x + 1) * 4, ((y + 1) * w + x) * 4, ((y + 1) * w + x + 1) * 4];
        let cr = 0;
        let cb = 0;
        for (const i of idx) {
          const l = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
          cr += d[i] - l;
          cb += d[i + 2] - l;
        }
        cr /= 4;
        cb /= 4;
        for (const i of idx) {
          const l = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
          d[i] = l + cr;
          d[i + 2] = l + cb;
          d[i + 1] = (l - 0.299 * d[i] - 0.114 * d[i + 2]) / 0.587;
        }
      }
  } else if (pass === 'vhs') {
    // tape: colour smeared sideways and shifted right, soft luma, scanlines, a tracking band near the bottom
    const k = Math.max(2, Math.round(w / 90));
    const shift = Math.round(k / 2);
    const row = new Float32Array(w * 2);
    let seed = 3 + (t % 997);
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const band = h * (0.86 + 0.06 * Math.sin(t / 9));
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        const i = (y * w + x) * 4;
        const l = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
        row[x * 2] = d[i] - l;
        row[x * 2 + 1] = d[i + 2] - l;
      }
      const inBand = Math.abs(y - band) < h * 0.025;
      const jitter = inBand ? Math.round((rnd() - 0.5) * k * 4) : 0;
      let cr = 0;
      let cb = 0;
      for (let x = 0; x < w; x += 1) {
        const sx = Math.min(w - 1, Math.max(0, x - shift));
        cr += (row[sx * 2] - cr) / k;
        cb += (row[sx * 2 + 1] - cb) / k;
        const src = (y * w + Math.min(w - 1, Math.max(0, x + jitter))) * 4;
        const i = (y * w + x) * 4;
        let l = 0.299 * d[src] + 0.587 * d[src + 1] + 0.114 * d[src + 2];
        if (inBand && rnd() > 0.7) l = 200 + rnd() * 55;
        l *= y % 2 ? 0.92 : 1;
        const r = l + cr * 0.85;
        const b = l + cb * 0.85;
        d[i] = r;
        d[i + 2] = b;
        d[i + 1] = (l - 0.299 * r - 0.114 * b) / 0.587;
      }
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

/** Nearest-neighbour upscale so tiny sensors (the pixel camera) stay crisp when saved. */
export function upscale(src: HTMLCanvasElement, factor: number) {
  const c = document.createElement('canvas');
  c.width = src.width * factor;
  c.height = src.height * factor;
  const g = c.getContext('2d')!;
  g.imageSmoothingEnabled = false;
  g.drawImage(src, 0, 0, c.width, c.height);
  return c;
}

/** Pixel camera sensor size for a frame of the given shape (128×112 at 8:7). */
export const pixelSize = (w: number, h: number) => (w >= h ? { w: 128, h: Math.round((128 * h) / w) } : { w: Math.round((128 * w) / h), h: 128 });

/**
 * One live-preview frame: the zoom-cropped video drawn at a small size through the same look,
 * overlays and pixel pass as the saved photo. The canvas keeps the video's own shape so the
 * screen crops it exactly like the <video> element (object-fit: cover).
 */
export function drawPreview(
  out: HTMLCanvasElement,
  video: HTMLVideoElement,
  opts: { zoom: number; mirror: boolean; look: Look; pass?: Pass; screenRatio: number; longSide: number; t: number },
) {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh) return;
  const V = vw / vh;
  const R = opts.screenRatio;
  // size so the part the screen shows is about longSide px on its long edge
  const tw = R >= 1 ? opts.longSide : opts.longSide * R;
  const th = R >= 1 ? opts.longSide / R : opts.longSide;
  const w = Math.max(2, Math.round(V > R ? th * V : tw));
  const h = Math.max(2, Math.round(V > R ? th : tw / V));
  if (out.width !== w || out.height !== h) {
    out.width = w;
    out.height = h;
  }
  const ctx = ctx2d(out);
  const cw = vw / opts.zoom;
  const ch = vh / opts.zoom;
  ctx.save();
  ctx.filter = lookToCss(opts.look);
  if (opts.mirror) {
    ctx.translate(w, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(video, (vw - cw) / 2, (vh - ch) / 2, cw, ch, 0, 0, w, h);
  ctx.restore();
  paintOverlays(ctx, w, h, opts.look);
  applyPass(out, opts.pass, opts.t);
}
