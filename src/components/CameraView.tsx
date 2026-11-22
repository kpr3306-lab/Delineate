import { BatteryFull, Grid3X3, Info, Layers, Moon, Play, SwitchCamera, Timer, Zap, ZapOff } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { AspectKey, Look, PhotoRecord } from '../types';
import { ASPECTS } from '../types';
import { BASE_LOOK } from '../lib/filters';
import { renderFrame } from '../lib/render';
import { flash as applyFlash, stamp as applyStamp } from '../lib/process';
import { applyFrame } from '../lib/frames';
import { CAMERAS, COLLECTIONS, applyPass, drawPreview, getCamera, pixelSize, upscale } from '../lib/cameras';
import { canvasToBlob, clamp, estimateDimensions, pad, uid } from '../lib/utils';
import { haptic, playAdvance, playClose, playDetent, playFlashCharge, playFocus, playKey, playShutter, playTick } from '../lib/audio';
import { LookOverlay, useObjectUrl } from './ui';
import Knob from './Knob';
import { currentPlace } from '../lib/place';
import { BODIES, type CamApi, type Dir } from './CameraBodies';

type CameraViewProps = {
  filmNumber: number;
  photos: PhotoRecord[];
  undeveloped: number;
  onSave: (record: PhotoRecord) => Promise<void>;
  notify: (message: string, tone?: 'default' | 'warning') => void;
  onOpenDevelop: () => void;
  onNavigate: (tab: string) => void;
};

/** Places the on-screen MENU can jump to. */
const GO_ITEMS = [
  { id: 'develop', label: 'Develop', hint: 'Darkroom' },
  { id: 'process', label: 'Process', hint: 'Presets & FX' },
  { id: 'archive', label: 'Archive', hint: 'Library' },
  { id: 'journal', label: 'Journal', hint: 'Scrapbook' },
  { id: 'collage', label: 'Collage', hint: 'Layouts' },
  { id: 'lab', label: 'Art Lab', hint: 'Experiments' },
];

type Status = 'off' | 'starting' | 'live' | 'denied' | 'error' | 'unsupported';
type MenuItem = { id: string; label: string; value?: string; hint?: string; key?: string };

/** Kept for anything that still lists the original six bodies. */
export const SKINS = CAMERAS.filter((c) => c.collection === 'digi');

const ISO = [100, 200, 400, 800, 1600, 3200];
const ISO_GRAIN = [0, 3, 8, 16, 28, 42];
const SHUTTER = ['1/1000', '1/500', '1/250', '1/125', '1/60', '1/30', '1/15', '1/8', '1/4', '1/2', '1"', '2"', '4"', '8"', 'B'];
const BULB = -1;
const SHUTTER_S = [1 / 1000, 1 / 500, 1 / 250, 1 / 125, 1 / 60, 1 / 30, 1 / 15, 1 / 8, 1 / 4, 1 / 2, 1, 2, 4, 8, BULB];
const MAX_BULB_S = 30;
const ME_STEPS = [0, 2, 3]; // multiple exposure: off, double, triple
const APERTURE = [1.8, 2.8, 4, 5.6, 8, 11, 16];
const AP_VIGNETTE = [0.38, 0.24, 0.12, 0.04, 0, 0, 0];
const EV = Array.from({ length: 13 }, (_, i) => (i - 6) / 3);
const WB = [
  { label: 'AWB', warmth: 0, tint: 0 },
  { label: 'DAY', warmth: 4, tint: 0 },
  { label: 'CLOUD', warmth: 18, tint: 2 },
  { label: 'SHADE', warmth: 30, tint: 4 },
  { label: 'TUNG', warmth: -34, tint: 0 },
  { label: 'FLUO', warmth: -10, tint: 16 },
];
const TIMERS = [0, 3, 10];
const RATIOS: AspectKey[] = ['4:3', '1:1', '3:4', '16:9'];
const STAMP_INK: Record<string, string> = { date: '#ff9a3c', led: '#ff3b2f', lcd: '#ffd23a', camcorder: '#f4f4f4' };

const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));
const evLabel = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : '±'}${Math.abs(v).toFixed(1)}`;
const evIndexOf = (v: number) => clamp(Math.round(v * 3) + 6, 0, EV.length - 1);
const SKIN_KEY = 'delineate-skin';
/** Portrait screens start on a portrait frame where the body offers one. */
const preferredRatio = (list: AspectKey[]) => {
  const portrait = window.innerHeight > window.innerWidth;
  return Math.max(0, list.findIndex((r) => (ASPECTS[r] < 1) === portrait));
};

/**
 * Long exposure: accumulate frames in floating point so even hundreds of frames average cleanly.
 * 'avg' = silky water / ghosting, 'trail' = keep the brightest pixel (light painting, car trails).
 */
export function makeAccumulator(width: number, height: number, mode: 'avg' | 'trail') {
  const sum = new Float32Array(width * height * 4);
  const scratch = document.createElement('canvas');
  scratch.width = width;
  scratch.height = height;
  const sctx = scratch.getContext('2d', { willReadFrequently: true })!;
  let frames = 0;
  return {
    add(frame: CanvasImageSource) {
      sctx.drawImage(frame, 0, 0, width, height);
      const data = sctx.getImageData(0, 0, width, height).data;
      if (mode === 'avg') for (let i = 0; i < data.length; i += 1) sum[i] += data[i];
      else for (let i = 0; i < data.length; i += 1) if (data[i] > sum[i]) sum[i] = data[i];
      frames += 1;
    },
    result() {
      const out = sctx.createImageData(width, height);
      const k = mode === 'avg' ? 1 / Math.max(1, frames) : 1;
      for (let i = 0; i < sum.length; i += 1) out.data[i] = (i & 3) === 3 ? 255 : sum[i] * k;
      sctx.putImageData(out, 0, 0);
      return scratch;
    },
  };
}

export default function CameraView({ filmNumber, photos, undeveloped, onSave, notify, onOpenDevelop, onNavigate }: CameraViewProps) {
  const [skin, setSkin] = useState<string>(() => {
    try {
      return getCamera(window.localStorage.getItem(SKIN_KEY) || 'classic').id;
    } catch {
      return 'classic';
    }
  });
  const cam = getCamera(skin);
  const ratios = cam.ratios ?? RATIOS;
  const isDc = cam.layout === 'dc';

  const [status, setStatus] = useState<Status>('off');
  const [errorMessage, setErrorMessage] = useState('');
  const [facing, setFacing] = useState<'user' | 'environment'>('environment');
  const [manual, setManual] = useState(false);
  const [iso, setIso] = useState(1);
  const [shutter, setShutter] = useState(3);
  const [aperture, setAperture] = useState(3);
  const [ev, setEv] = useState(6);
  const [wb, setWb] = useState(0);
  const [timer, setTimer] = useState(0);
  const [flashOn, setFlashOn] = useState(false);
  const [grid, setGrid] = useState(false);
  const [hud, setHud] = useState(true);
  const [ratio, setRatio] = useState(() => preferredRatio(ratios));
  const [zoom, setZoom] = useState(1);
  const [review, setReview] = useState(false);
  const [reviewIdx, setReviewIdx] = useState(0);
  const [focus, setFocus] = useState<'idle' | 'hunting' | 'locked'>('idle');
  const [firing, setFiring] = useState(false);
  const [blades, setBlades] = useState(false);
  const [whiteout, setWhiteout] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [flyUrl, setFlyUrl] = useState<string | null>(null);
  const [longMode, setLongMode] = useState<'avg' | 'trail'>('avg');
  const [meStep, setMeStep] = useState(0);
  const [meGhost, setMeGhost] = useState<string | null>(null);
  const [exposingFor, setExposingFor] = useState<number | null>(null);
  const [hasTorch, setHasTorch] = useState(false);
  const [dateOn, setDateOn] = useState(Boolean(cam.stampOn));
  const [needWind, setNeedWind] = useState(false);
  const [osd, setOsd] = useState<string | null>(null);
  const meStack = useRef<HTMLCanvasElement[]>([]);
  const meClean = useRef<HTMLCanvasElement[]>([]);
  const bulbHeld = useRef(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuIndex, setMenuIndex] = useState(0);
  const menuOpenRef = useRef(false);
  menuOpenRef.current = menuOpen;

  const videoRef = useRef<HTMLVideoElement>(null);
  const previewRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const aliveRef = useRef(true);
  const tiltRef = useRef<0 | 90 | 270>(0); // how the phone is physically held, from gravity
  const zoomTimer = useRef<number | undefined>(undefined);
  const focusTimer = useRef<number | undefined>(undefined);
  const osdTimer = useRef<number | undefined>(undefined);
  const swipe = useRef<number | null>(null);
  const panelFitRef = useRef<HTMLDivElement>(null);
  const [headerSlot, setHeaderSlot] = useState<HTMLElement | null>(null);
  useEffect(() => setHeaderSlot(document.getElementById('header-cam-info')), []);
  const panelRef = useRef<HTMLDivElement>(null);

  // The controls never scroll: if the window is too short for them, shrink the whole panel to fit.
  useEffect(() => {
    const box = panelFitRef.current;
    const panel = panelRef.current;
    if (!box || !panel) return;
    const fit = () => {
      panel.style.zoom = '1';
      const need = panel.offsetHeight;
      panel.style.zoom = String(need > box.clientHeight ? Math.max(0.5, box.clientHeight / need) : 1);
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(box);
    window.addEventListener('resize', fit);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', fit);
    };
  }, [skin]);

  const manualOn = manual && isDc;
  const bulb = manualOn && SHUTTER_S[shutter] === BULB;
  const aspect = ratios[Math.min(ratio, ratios.length - 1)];
  const mirror = facing === 'user';
  const live = status === 'live';
  const gallery = useMemo(() => [...photos].sort((a, b) => b.createdAt - a.createdAt), [photos]);
  const shown = gallery[Math.min(reviewIdx, gallery.length - 1)];
  const reviewUrl = useObjectUrl(review ? shown?.blob : null);

  // Exposure model: each manual control shifts exposure in stops relative to ISO 200 · 1/125 · f/5.6.
  const stops =
    // long exposures are averaged, not summed, so cap the shutter's brightening at +2 stops
    (manualOn
      ? Math.log2(ISO[iso] / 200) +
        Math.min(2, Math.max(-3, Math.log2((SHUTTER_S[shutter] === BULB ? 8 : SHUTTER_S[shutter]) * 125))) +
        2 * Math.log2(5.6 / APERTURE[aperture])
      : 0) +
    EV[ev];
  // The body's signature look, with exposure and white balance layered on top.
  const base: Look = { ...BASE_LOOK, ...cam.look };
  const look: Look = {
    ...base,
    brightness: clamp(base.brightness * 2 ** (stops * 0.5), 0.2, 2.4),
    contrast: base.contrast * (1 - Math.max(0, stops) * 0.05),
    grain: cam.pass === 'gb' ? 0 : Math.max(base.grain, manualOn ? ISO_GRAIN[iso] : 2),
    vignette: Math.max(base.vignette, manualOn ? AP_VIGNETTE[aperture] : 0),
    warmth: base.warmth + WB[wb].warmth,
    tint: base.tint + WB[wb].tint,
  };
  /** The same exposure without the body's character: what "Strip cam effects" in Process goes back to. */
  const cleanLook: Look = {
    ...BASE_LOOK,
    brightness: look.brightness / base.brightness,
    contrast: look.contrast / base.contrast,
    grain: manualOn ? ISO_GRAIN[iso] : 0,
    vignette: manualOn ? AP_VIGNETTE[aperture] : 0,
    warmth: WB[wb].warmth,
    tint: WB[wb].tint,
  };

  useEffect(() => {
    try {
      window.localStorage.setItem(SKIN_KEY, skin);
    } catch {
      /* ignore */
    }
    // a new body: its own frame shapes, imprint default and a fresh film advance
    setRatio(preferredRatio(getCamera(skin).ratios ?? RATIOS));
    setDateOn(Boolean(getCamera(skin).stampOn));
    setNeedWind(false);
    setMenuOpen(false);
    setReview(false);
    meStack.current = [];
    meClean.current = [];
    setMeGhost(null);
  }, [skin]);

  const flashOsd = (text: string) => {
    setOsd(text);
    window.clearTimeout(osdTimer.current);
    osdTimer.current = window.setTimeout(() => setOsd(null), 1300);
  };

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  const startCamera = useCallback(
    async (nextFacing: 'user' | 'environment') => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setStatus('unsupported');
        return;
      }
      stopStream();
      setStatus('starting');
      setErrorMessage('');
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          // 4:3 = the sensor's native shape. A 16:9 request crops the sensor, and cutting the default 3:4 frame
          // out of that crops again, which looked ~1.33x zoomed-in next to the phone's own camera app.
          video: { facingMode: { ideal: nextFacing }, width: { ideal: 1920 }, height: { ideal: 1440 }, aspectRatio: { ideal: 4 / 3 } },
        });
        if (!aliveRef.current) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        const caps = stream.getVideoTracks()[0]?.getCapabilities?.() as { torch?: boolean } | undefined;
        setHasTorch(Boolean(caps?.torch));
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          video.muted = true;
          await video.play().catch(() => undefined);
        }
        await wait(700); // let the boot animation finish
        if (aliveRef.current) setStatus('live');
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Something went wrong.';
        setStatus(/permission|denied|notallowed/i.test(message) ? 'denied' : 'error');
        setErrorMessage(message);
      }
    },
    [stopStream],
  );

  // Switching to a body with a different layout remounts the <video>; hand it the running stream again.
  useEffect(() => {
    const video = videoRef.current;
    const stream = streamRef.current;
    if (video && stream && video.srcObject !== stream) {
      video.srcObject = stream;
      video.muted = true;
      void video.play().catch(() => undefined);
    }
  });

  // Live look for bodies with pixel character: the viewfinder runs through the same pipeline as the saved frame.
  const previewOpts = useRef({ zoom, mirror, look, pass: cam.pass, screenRatio: ASPECTS[aspect], longSide: 480 });
  previewOpts.current = {
    zoom,
    mirror,
    look,
    pass: cam.pass,
    screenRatio: ASPECTS[aspect],
    longSide: cam.pass === 'gb' ? 128 : Math.min(cam.res ?? 480, 480),
  };
  const canvasPreview = Boolean(cam.pass) && live && !review;
  useEffect(() => {
    if (!canvasPreview) return;
    let raf = 0;
    let t = 0;
    let last = 0;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (now - last < 33) return; // ~30 fps is plenty for a 2005 viewfinder
      last = now;
      const video = videoRef.current;
      const out = previewRef.current;
      if (video && out) drawPreview(out, video, { ...previewOpts.current, t: (t += 1) });
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [canvasPreview, skin]);

  useEffect(() => {
    // Android axes: x > 0 when the top points left (screen angle 90). The margin avoids flicker near 45 degrees.
    // shortcut: iOS needs DeviceMotionEvent.requestPermission() for this; without it iOS relies on the rotated-UI path only.
    const onMotion = (e: DeviceMotionEvent) => {
      const g = e.accelerationIncludingGravity;
      if (g?.x == null || g.y == null) return;
      if (Math.abs(g.x) > Math.abs(g.y) + 2) tiltRef.current = g.x > 0 ? 90 : 270;
      else if (Math.abs(g.y) > Math.abs(g.x) + 2) tiltRef.current = 0;
    };
    window.addEventListener('devicemotion', onMotion);
    return () => window.removeEventListener('devicemotion', onMotion);
  }, []);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      stopStream();
      window.clearInterval(zoomTimer.current);
      window.clearTimeout(focusTimer.current);
      window.clearTimeout(osdTimer.current);
    };
  }, [stopStream]);

  const power = () => {
    haptic(15);
    if (status === 'live' || status === 'starting') {
      stopStream();
      setStatus('off');
      setReview(false);
      setMenuOpen(false);
    } else {
      void startCamera(facing);
    }
  };

  const flip = () => {
    const next = facing === 'user' ? 'environment' : 'user';
    setFacing(next);
    haptic(10);
    flashOsd(next === 'user' ? 'Front camera' : 'Back camera');
    if (status === 'live' || status === 'starting') void startCamera(next);
  };

  const manualKnob = (setter: (i: number) => void) => (i: number) => {
    if (!manual) {
      setManual(true);
      notify('Switched to Manual — you are in control of exposure now.');
    }
    setter(i);
  };

  const startZoom = (dir: 1 | -1) => {
    haptic(5);
    const tick = () => setZoom((z) => Math.min(4, Math.max(1, +(z + dir * 0.1).toFixed(2))));
    tick();
    window.clearInterval(zoomTimer.current);
    zoomTimer.current = window.setInterval(tick, 60);
  };
  const stopZoom = () => window.clearInterval(zoomTimer.current);

  /** Playback: +1 = an older frame, -1 = a newer one (wraps round the whole library). */
  const browse = (d: 1 | -1) => {
    if (!gallery.length) return;
    setReviewIdx((i) => (Math.min(i, gallery.length - 1) + d + gallery.length) % gallery.length);
    haptic(5);
  };
  const toggleReview = () => {
    if (!gallery.length) {
      notify('Nothing in the gallery yet — take a picture first.');
      return;
    }
    setMenuOpen(false);
    setReview((r) => {
      if (!r) setReviewIdx(0);
      return !r;
    });
  };

  const halfPress = () => {
    if (!live || firing) return;
    setReview(false);
    setFocus('hunting');
    window.clearTimeout(focusTimer.current);
    focusTimer.current = window.setTimeout(() => {
      setFocus('locked');
      playFocus();
      haptic(4);
    }, 320);
  };

  /** Grab one zoom-cropped frame from the live video. */
  const grab = (video: HTMLVideoElement) => {
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    const cw = vw / zoom;
    const ch = vh / zoom;
    const crop = document.createElement('canvas');
    crop.width = Math.round(cw);
    crop.height = Math.round(ch);
    crop.getContext('2d')!.drawImage(video, (vw - cw) / 2, (vh - ch) / 2, cw, ch, 0, 0, crop.width, crop.height);
    return crop;
  };

  /** Hardware flash: the phone's LED torch, where the browser exposes it (Android Chrome). */
  const torch = async (on: boolean) => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track || !hasTorch) return false;
    try {
      await track.applyConstraints({ advanced: [{ torch: on } as MediaTrackConstraintSet] });
      return true;
    } catch {
      return false;
    }
  };

  const fire = useCallback(async () => {
    const video = videoRef.current;
    if (menuOpenRef.current) return;
    if (!live || firing || !video?.videoWidth) {
      if (!live) notify('Turn the camera on first — press its power switch.', 'warning');
      return;
    }
    const placeP = currentPlace(); // resolves to undefined unless location tags are on
    if (cam.wind && needWind) {
      playKey('click');
      haptic([20, 40, 20]);
      flashOsd(cam.wind === 'lever' ? 'Wind the lever first' : 'Wind the thumbwheel first');
      return;
    }
    setFiring(true);
    setReview(false);
    let hwFlash = false;
    try {
      const delay = cam.booth ? 3 : TIMERS[timer];
      if (delay > 0) {
        for (let s = delay; s > 0; s -= 1) {
          setCountdown(s);
          playTick(s <= 2);
          haptic(4);
          await wait(1000);
        }
        setCountdown(null);
      }
      if (cam.booth) setWhiteout(true); // the screen itself is the flash
      else if (flashOn) {
        hwFlash = await torch(true);
        if (hwFlash) await wait(350); // give auto-exposure a moment under the LED
        else setWhiteout(true); // screen flash lights faces on the front camera
      }
      setBlades(true);
      playShutter(cam.voice);
      haptic(cam.buzz);

      const seconds = manualOn ? SHUTTER_S[shutter] : 0;
      const isLong = seconds === BULB || seconds >= 1 / 15;
      let exposure: HTMLCanvasElement = grab(video);
      if (isLong) {
        // Real long exposure: keep reading the sensor until the shutter closes.
        const scale = Math.min(1, 1600 / Math.max(exposure.width, exposure.height));
        const acc = makeAccumulator(Math.round(exposure.width * scale), Math.round(exposure.height * scale), longMode);
        acc.add(exposure);
        const started = performance.now();
        const open = () =>
          seconds === BULB
            ? bulbHeld.current && performance.now() - started < MAX_BULB_S * 1000
            : performance.now() - started < seconds * 1000;
        let lastTick = 0;
        while (open()) {
          await wait(30);
          acc.add(grab(video));
          const t = (performance.now() - started) / 1000;
          if (t - lastTick > 0.2) {
            lastTick = t;
            setExposingFor(t);
          }
        }
        exposure = acc.result();
        playClose(cam.voice);
      } else {
        await wait(90);
      }
      setExposingFor(null);
      setBlades(false);
      setWhiteout(false);
      if (hwFlash) void torch(false);

      // Held sideways -> landscape photo. If the browser rotated the page (data-rot) the stream is already upright;
      // if the UI is locked the frame is still portrait, so turn it ourselves (front camera turns the other way).
      const uiTurned = Boolean(document.documentElement.dataset.rot);
      const tilt = tiltRef.current;
      const rotate = uiTurned || !tilt ? 0 : mirror ? tilt : 360 - tilt;
      const dims = cam.pass === 'gb' ? (({ w, h }) => ({ width: w, height: h }))(pixelSize(ASPECTS[aspect], 1)) : estimateDimensions(ASPECTS[aspect], cam.res ?? 1600);
      const sideways = uiTurned || tilt !== 0;
      const width = sideways ? dims.height : dims.width;
      const height = sideways ? dims.width : dims.height;
      let canvas = renderFrame(exposure, exposure.width, exposure.height, width, height, look, { mirror, rotate });
      if (flashOn && !hwFlash && !cam.booth) canvas = applyFlash(canvas, 0.6);
      canvas = applyPass(canvas, cam.pass);
      // clean copy at full size: no look, sensor size, pixel pass, imprint or print frame
      const cd = estimateDimensions(ASPECTS[aspect], 1600);
      const cw = sideways ? cd.height : cd.width;
      const ch = sideways ? cd.width : cd.height;
      let clean = renderFrame(exposure, exposure.width, exposure.height, cw, ch, cleanLook, { mirror, rotate });
      if (flashOn && !hwFlash && !cam.booth) clean = applyFlash(clean, 0.6);

      // Multiple exposure: hold frames on the "film" until the last one, then stack them.
      const stack = (frames: HTMLCanvasElement[], w: number, h: number) => {
        const stacked = document.createElement('canvas');
        stacked.width = w;
        stacked.height = h;
        const sctx = stacked.getContext('2d')!;
        frames.forEach((frame, i) => {
          sctx.globalCompositeOperation = i ? 'screen' : 'source-over';
          sctx.globalAlpha = i ? 0.85 : 1;
          sctx.drawImage(frame, 0, 0, w, h);
        });
        return stacked;
      };
      const meTarget = ME_STEPS[meStep];
      if (meTarget) {
        meStack.current.push(canvas);
        meClean.current.push(clean);
        const stacked = stack(meStack.current, width, height);
        if (meStack.current.length < meTarget) {
          setMeGhost(stacked.toDataURL('image/jpeg', 0.7));
          playAdvance('leaf');
          notify(`Exposure ${meStack.current.length} of ${meTarget} — recompose and shoot again.`);
          return;
        }
        canvas = stacked;
        clean = stack(meClean.current, cw, ch);
        meStack.current = [];
        meClean.current = [];
        setMeGhost(null);
      }
      if (cam.pass === 'gb') canvas = upscale(canvas, 4);
      if (dateOn && cam.stamp) canvas = applyStamp(canvas, { stamp: cam.stamp, stampPos: 'br', stampColor: null, stampDate: null }, Date.now());
      if (cam.frame) canvas = applyFrame(canvas, cam.frame);

      const blob = await canvasToBlob(canvas, 'image/jpeg', cam.pass === 'jpeg' ? 0.7 : 0.92);
      const camRaw = await canvasToBlob(clean, 'image/jpeg', 0.92);
      const record: PhotoRecord = {
        camRaw,
        camera: cam.name,
        id: uid(),
        name: `Frame ${pad(filmNumber, 3)}`,
        createdAt: Date.now(),
        blob,
        mime: 'image/jpeg',
        width: canvas.width,
        height: canvas.height,
        filterName: cam.name,
        kind: 'still',
        developed: false,
        note: [
          manualOn ? `ISO ${ISO[iso]} · ${SHUTTER[shutter]} · f/${APERTURE[aperture]}` : 'Auto',
          `${evLabel(EV[ev])} EV · ${WB[wb].label}`,
          meTarget ? `${meTarget}× exposure` : '',
          isLong ? (longMode === 'trail' ? 'light trails' : 'long exposure') : '',
          flashOn ? (hwFlash ? 'LED flash' : 'flash') : '',
          `${cam.name} (${cam.model})`,
        ]
          .filter(Boolean)
          .join(' · '),
        place: await placeP,
      };
      if (cam.fx === 'process') await wait(650); // a 2004 digicam always made you wait
      setFlyUrl(URL.createObjectURL(blob));
      playAdvance(cam.voice);
      await onSave(record);
      if (cam.wind) setNeedWind(true);
    } catch (error) {
      console.error(error);
      notify('That frame did not expose. Please try again.', 'warning');
    } finally {
      if (hwFlash) void torch(false);
      setCountdown(null);
      setFiring(false);
      setBlades(false);
      setWhiteout(false);
      setExposingFor(null);
      setFocus('idle');
    }
    // grab/look/torch are derived from the state listed here
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, firing, timer, flashOn, manualOn, shutter, aspect, mirror, filmNumber, iso, aperture, ev, wb, zoom, onSave, notify, longMode, meStep, skin, hasTorch, dateOn, needWind]);

  useEffect(() => {
    if (!flyUrl) return;
    const t = window.setTimeout(() => {
      URL.revokeObjectURL(flyUrl);
      setFlyUrl(null);
    }, 1100);
    return () => window.clearTimeout(t);
  }, [flyUrl]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.code !== 'Space' || event.repeat || menuOpenRef.current) return;
      const target = event.target as HTMLElement;
      if (['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(target.tagName) || target.isContentEditable) return;
      event.preventDefault();
      bulbHeld.current = true;
      void fire();
    };
    const release = (event: KeyboardEvent) => {
      if (event.code === 'Space') bulbHeld.current = false;
    };
    window.addEventListener('keydown', handler);
    window.addEventListener('keyup', release);
    return () => {
      window.removeEventListener('keydown', handler);
      window.removeEventListener('keyup', release);
    };
  }, [fire]);

  /* Settings, used by the on-screen menu, keypads and the body's own keys ------------------------- */
  const cycle = (n: number, d: number, len: number) => (n + d + len) % len;
  const toggleFlash = () => {
    setFlashOn((v) => {
      if (!v) playFlashCharge();
      flashOsd(v ? 'Flash off' : hasTorch ? 'Flash on · LED' : 'Flash on');
      return !v;
    });
    haptic(8);
  };
  const stepTimer = (d = 1) => {
    const next = cycle(timer, d, TIMERS.length);
    setTimer(next);
    flashOsd(TIMERS[next] ? `Self-timer ${TIMERS[next]}s` : 'Self-timer off');
  };
  const stepRatio = (d = 1) => {
    if (ratios.length < 2) return flashOsd(`Frame ${aspect} (fixed)`);
    const next = cycle(Math.min(ratio, ratios.length - 1), d, ratios.length);
    setRatio(next);
    flashOsd(`Frame ${ratios[next]}`);
  };
  const toggleGrid = () => {
    setGrid((g) => !g);
    flashOsd(grid ? 'Grid off' : 'Grid on');
  };
  const stepWb = (d = 1) => {
    const next = cycle(wb, d, WB.length);
    setWb(next);
    flashOsd(`WB ${WB[next].label}`);
  };
  const stepEv = (d: number, wrap = false) => {
    const raw = ev + d;
    const next = wrap ? cycle(ev, d, EV.length) : clamp(raw, 0, EV.length - 1);
    setEv(next);
    flashOsd(`EV ${evLabel(EV[next])}`);
  };
  const setEvValue = (v: number) => setEv(evIndexOf(v));
  const stepMe = (d = 1) => {
    const next = cycle(meStep, d, ME_STEPS.length);
    setMeStep(next);
    meStack.current = [];
    meClean.current = [];
    setMeGhost(null);
    flashOsd(ME_STEPS[next] ? `Multi exposure ${ME_STEPS[next]}×` : 'Multi exposure off');
  };
  const toggleDate = () => {
    if (!cam.stamp) return;
    setDateOn((v) => !v);
    flashOsd(dateOn ? 'Date imprint off' : 'Date imprint on');
  };
  const zoomStep = (d: number) => {
    const next = clamp(+(zoom + d).toFixed(2), 1, 4);
    setZoom(next);
    flashOsd(`Zoom ${next.toFixed(1)}×`);
  };
  const windOn = () => {
    if (!cam.wind) return;
    if (!needWind) {
      playKey('click');
      flashOsd('Film already wound');
      return;
    }
    setNeedWind(false);
    playAdvance(cam.wind === 'thumb' ? 'plastic' : 'mech');
    haptic([6, 30, 6, 30, 6]);
  };

  const menuItems: MenuItem[] = [
    { id: 'flash', label: 'Flash', value: flashOn ? 'On' : 'Off', key: '1' },
    { id: 'timer', label: 'Self-timer', value: TIMERS[timer] ? `${TIMERS[timer]}s` : 'Off', key: '2' },
    ...(ratios.length > 1 ? [{ id: 'ratio', label: 'Frame', value: aspect, key: '3' }] : []),
    { id: 'grid', label: 'Grid', value: grid ? 'On' : 'Off', key: '4' },
    { id: 'flip', label: 'Camera', value: facing === 'user' ? 'Front' : 'Back', key: '6' },
    { id: 'wb', label: 'White balance', value: WB[wb].label, key: '7' },
    { id: 'me', label: 'Multi exposure', value: ME_STEPS[meStep] ? `${ME_STEPS[meStep]}×` : 'Off', key: '8' },
    { id: 'ev', label: 'Exposure', value: evLabel(EV[ev]) },
    ...(cam.stamp ? [{ id: 'date', label: 'Date imprint', value: dateOn ? 'On' : 'Off', key: '*' }] : []),
    { id: 'gallery', label: 'Gallery', hint: `${gallery.length} frames`, key: '0' },
    ...GO_ITEMS,
    { id: 'return', label: 'Return', hint: 'Back to camera' },
  ];
  const adjust = (id: string, d: 1 | -1) => {
    if (id === 'flash') toggleFlash();
    else if (id === 'timer') stepTimer(d);
    else if (id === 'ratio') stepRatio(d);
    else if (id === 'grid') toggleGrid();
    else if (id === 'flip') flip();
    else if (id === 'wb') stepWb(d);
    else if (id === 'me') stepMe(d);
    else if (id === 'ev') stepEv(d);
    else if (id === 'date') toggleDate();
    else return false;
    return true;
  };
  const openMenu = () => {
    if (menuOpen) return closeMenu();
    setMenuIndex(0);
    setMenuOpen(true);
    setReview(false);
    playTick(true);
    haptic(8);
  };
  const closeMenu = () => {
    setMenuOpen(false);
    playTick(false);
    haptic(6);
  };
  const chooseMenu = (i: number) => {
    const item = menuItems[i];
    if (!item) return;
    playFocus();
    haptic([8, 30, 8]);
    if (adjust(item.id, 1)) return;
    if (item.id === 'return') closeMenu();
    else if (item.id === 'gallery') toggleReview();
    else onNavigate(item.id);
  };

  /** A D-pad press, in whatever state the camera is in. */
  const nav = (dir: Dir) => {
    keySound();
    if (menuOpen) {
      if (dir === 'up' || dir === 'down') setMenuIndex((i) => cycle(i, dir === 'down' ? 1 : -1, menuItems.length));
      else if (dir === 'ok') chooseMenu(menuIndex);
      else adjust(menuItems[menuIndex]?.id ?? '', dir === 'right' ? 1 : -1);
      return;
    }
    if (review) {
      if (dir === 'ok') setReview(false);
      else browse(dir === 'left' || dir === 'up' ? 1 : -1);
      return;
    }
    if (dir === 'up') zoomStep(0.5);
    else if (dir === 'down') zoomStep(-0.5);
    else if (dir === 'left') stepEv(-1);
    else if (dir === 'right') stepEv(1);
    else openMenu();
  };

  useEffect(() => {
    if (!menuOpen && !review) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
      const map: Record<string, Dir> = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', Enter: 'ok' };
      if (map[e.key]) {
        e.preventDefault();
        if (menuOpen && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) playDetent();
        nav(map[e.key]);
      } else if (e.key === 'Escape') {
        if (menuOpen) closeMenu();
        else setReview(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // a keypad press already played its own tone; don't stack the generic key sound on top
  const lastKey = useRef(0);
  const keySound = (k = '') => {
    if (performance.now() - lastKey.current < 80) return;
    lastKey.current = performance.now();
    playKey(cam.key, k);
    haptic(6);
  };
  const press = <A extends unknown[]>(fn: (...a: A) => void) => (...a: A) => {
    keySound();
    fn(...a);
  };

  const shutterProps = {
    onPointerDown: () => {
      if (bulb) {
        bulbHeld.current = true;
        void fire();
      } else halfPress();
    },
    onPointerUp: () => {
      if (bulb) bulbHeld.current = false;
      else void fire();
    },
    onPointerLeave: () => {
      bulbHeld.current = false;
      if (focus !== 'idle' && !firing) setFocus('idle');
    },
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        void fire();
      }
    },
  };
  /** W/T: zoom while shooting, step through the gallery in playback (W = older, T = newer). */
  const zoomProps = (dir: 1 | -1) => ({
    onPointerDown: () => {
      playKey(cam.key);
      if (review) browse(dir === 1 ? -1 : 1);
      else startZoom(dir);
    },
    onPointerUp: stopZoom,
    onPointerLeave: stopZoom,
  });

  const stampInk = cam.stamp ? STAMP_INK[cam.stamp] ?? '#fff' : '#fff';
  const now = new Date();
  const dateText =
    cam.stamp === 'camcorder'
      ? `${now.toLocaleString('en-US', { month: 'short' }).toUpperCase()}. ${now.getDate()} ${now.getFullYear()}`
      : cam.stamp === 'lcd'
        ? `${now.getFullYear()}.${pad(now.getMonth() + 1)}.${pad(now.getDate())}`
        : `'${pad(now.getFullYear() % 100)} ${pad(now.getMonth() + 1)} ${pad(now.getDate())}`;
  const vfText = (
    <>
      {manualOn ? (
        <>
          <span>ISO {ISO[iso]}</span>
          <span>{SHUTTER[shutter]}</span>
          <span>F{APERTURE[aperture]}</span>
        </>
      ) : (
        <span>P · AUTO</span>
      )}
      <span>{evLabel(EV[ev])}</span>
    </>
  );

  /* The screen: one element every body mounts in its own bezel. */
  const screen: ReactNode = (
    <div className="dc-screen-area">
      <div
        className={`dc-screen scr-${cam.layout} ${review ? 'is-review' : ''}`}
        style={{ ['--ratio' as string]: ASPECTS[aspect] }}
        onPointerDown={(e) => {
          if (review) swipe.current = e.clientX;
        }}
        onPointerUp={(e) => {
          if (review && swipe.current !== null && Math.abs(e.clientX - swipe.current) > 40) browse(e.clientX > swipe.current ? 1 : -1);
          swipe.current = null;
        }}
      >
        <video
          ref={videoRef}
          className="dc-video"
          playsInline
          muted
          style={{
            filter: cam.pass ? undefined : `brightness(${look.brightness}) contrast(${look.contrast}) saturate(${look.saturation}) hue-rotate(${look.hue}deg) blur(${look.blur}px)`,
            transform: `scale(${zoom}) ${mirror ? 'scaleX(-1)' : ''}`,
            opacity: live && !review && !cam.pass ? 1 : 0,
          }}
        />
        {cam.pass && (
          <canvas ref={previewRef} className={`dc-video dc-preview ${cam.pass === 'gb' ? 'is-pixel' : ''}`} style={{ opacity: canvasPreview ? 1 : 0 }} aria-hidden="true" />
        )}
        {live && !review && !cam.pass && <LookOverlay look={{ ...look, brightness: 1, contrast: 1 }} />}
        {live && !review && meGhost && <img className="dc-ghost" src={meGhost} alt="" aria-hidden="true" />}
        {exposingFor !== null && (
          <div className="dc-exposing">
            <i /> {exposingFor.toFixed(1)}s{bulb ? ' · BULB — release to close' : ''}
          </div>
        )}
        {review && reviewUrl && <img className="dc-review" key={shown?.id} src={reviewUrl} alt={shown?.name ?? 'Photo'} />}

        {status === 'off' && !review && (
          <div className="dc-lcd-off">
            <span>Press the power switch</span>
          </div>
        )}
        {status === 'starting' && (
          <div className="dc-boot">
            <span className="dc-boot-logo" />
            <strong>{cam.boot}</strong>
            <small>{cam.bootSub || 'MADE TO REMEMBER'}</small>
            <span className="dc-boot-bar" />
          </div>
        )}
        {(status === 'denied' || status === 'error' || status === 'unsupported') && !review && (
          <div className="dc-lcd-off dc-lcd-error">
            <strong>{status === 'denied' ? 'Camera access blocked' : status === 'unsupported' ? 'No camera here' : 'Camera error'}</strong>
            <span>
              {status === 'denied'
                ? 'Allow camera access in your browser settings, then press the power switch again.'
                : status === 'unsupported'
                  ? 'This browser cannot open a camera. Try a modern browser over HTTPS.'
                  : errorMessage}
            </span>
          </div>
        )}

        {live && !review && hud && (
          <div className={`dc-hud hud-${cam.layout}`} aria-hidden="true">
            <div className="dc-hud-top">
              {cam.layout === 'video' ? (
                <span className={`dc-hud-rec ${firing ? 'is-rec' : ''}`}>{firing ? '● REC' : 'STBY'}</span>
              ) : cam.layout === 'phone' ? (
                <span className="dc-hud-bars"><i /><i /><i /><i /></span>
              ) : (
                <span className="dc-hud-mode">{manualOn ? 'M' : cam.layout === 'film' ? cam.model : 'AUTO'}</span>
              )}
              {flashOn && (
                <span className="dc-hud-icon">
                  <Zap size={13} />
                  {hasTorch ? 'LED' : ''}
                </span>
              )}
              {ME_STEPS[meStep] > 0 && (
                <span className="dc-hud-icon">
                  <Layers size={12} />
                  {meStack.current.length + 1}/{ME_STEPS[meStep]}
                </span>
              )}
              {(manualOn && SHUTTER_S[shutter] >= 1 / 15) || bulb ? (
                <span className="dc-hud-icon">
                  <Moon size={12} />
                  {longMode === 'trail' ? 'TRAIL' : 'AVG'}
                </span>
              ) : null}
              {(TIMERS[timer] > 0 || cam.booth) && (
                <span className="dc-hud-icon"><Timer size={12} />{cam.booth ? 3 : TIMERS[timer]}s</span>
              )}
              {zoom > 1.01 && <span>{zoom.toFixed(1)}×</span>}
              <span className="dc-hud-spacer" />
              {WB[wb].label !== 'AWB' && <span>{WB[wb].label}</span>}
              <span>{cam.layout === 'video' ? `SP 0:${pad(Math.floor(filmNumber / 60) % 60)}:${pad(filmNumber % 60)}` : `${cam.layout === 'film' ? '' : 'EXP '}${pad(undeveloped, 2)}`}</span>
              <BatteryFull size={15} />
            </div>
            <div className={`dc-focus is-${focus}`}>
              <i /><i /><i /><i />
            </div>
            <div className="dc-hud-bottom">
              {cam.layout === 'film' ? (
                <span className="dc-meter"><b className={EV[ev] < 0 ? 'on' : ''}>▶</b><b className={EV[ev] === 0 ? 'on' : ''}>●</b><b className={EV[ev] > 0 ? 'on' : ''}>◀</b></span>
              ) : (
                vfText
              )}
              <span className="dc-hud-spacer" />
              {dateOn && cam.stamp ? (
                <span className="dc-hud-stamp" style={{ color: stampInk }}>{dateText}</span>
              ) : (
                <span className="dc-hud-date">{now.toLocaleDateString('en-GB', { year: '2-digit', month: '2-digit', day: '2-digit' }).replace(/\//g, ' ')}</span>
              )}
              <span>{aspect}</span>
            </div>
          </div>
        )}
        {live && !review && cam.wind && needWind && <div className="dc-wind-note">WIND ON ▸</div>}
        {review && (
          <div className="dc-hud">
            <div className="dc-hud-top">
              <span className="dc-hud-mode"><Play size={10} /> PLAY</span>
              <span>{Math.min(reviewIdx, gallery.length - 1) + 1}/{gallery.length}</span>
              <span className="dc-hud-spacer" />
              <span className="dc-hud-name">{shown?.name ?? 'No frames yet'}</span>
            </div>
            <span className="dc-hud-spacer" />
            <div className="dc-hud-bottom">
              <span>◀ W</span>
              <span className="dc-hud-spacer" />
              <span>{shown ? new Date(shown.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : ''}</span>
              <span className="dc-hud-spacer" />
              <span>T ▶</span>
            </div>
          </div>
        )}
        {grid && live && !review && (
          <div className="dc-grid" aria-hidden="true"><i /><i /><i /><i /></div>
        )}
        {osd && !menuOpen && <div className="dc-osd" key={osd}>{osd}</div>}
        {countdown !== null && <div className="dc-countdown" key={countdown}>{countdown}</div>}
        {menuOpen && (
          <div className="dc-menu" role="menu" aria-label="Camera menu">
            <div className="dc-menu-head">
              <span>{cam.layout === 'phone' ? 'Options' : 'MENU'}</span>
              <small>▲▼ select · ◀▶ change · OK</small>
            </div>
            <ul>
              {menuItems.map((item, i) => (
                <li key={item.id}>
                  <button
                    type="button"
                    role="menuitem"
                    className={`${i === menuIndex ? 'is-active' : ''} ${item.id === 'return' || item.id === 'develop' ? 'is-return' : ''}`}
                    onPointerEnter={() => setMenuIndex(i)}
                    onClick={() => chooseMenu(i)}
                  >
                    <span>
                      {cam.layout === 'phone' && item.key ? <i className="dc-menu-key">{item.key}</i> : null}
                      {item.id === 'return' ? '◀ ' : ''}
                      {item.label}
                    </span>
                    <small>{item.value ?? item.hint}</small>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className={`dc-shutterfx fx-${cam.fx} ${blades || (cam.fx === 'process' && firing && countdown === null) ? 'is-on' : ''}`} aria-hidden="true">
          {cam.fx === 'process' && (
            <>
              <small>PROCESSING</small>
              <i />
            </>
          )}
        </div>
        <div className={`dc-iris ${blades && cam.fx === 'iris' ? 'is-closed' : ''}`} aria-hidden="true">
          {Array.from({ length: 6 }, (_, i) => (
            <span key={i} style={{ ['--i' as string]: i }} />
          ))}
        </div>
        {flyUrl && <img className={`dc-fly fly-${cam.fx}`} src={flyUrl} alt="" aria-hidden="true" />}
      </div>
    </div>
  );

  const api: CamApi = {
    cam,
    screen,
    on: status !== 'off',
    live,
    firing,
    focus,
    review,
    menuOpen,
    filmNumber,
    undeveloped,
    galleryCount: gallery.length,
    reviewPos: Math.min(reviewIdx, gallery.length - 1) + 1,
    latest: gallery[0],
    zoom,
    aspect,
    canRatio: ratios.length > 1,
    flashOn,
    timerOn: TIMERS[timer] > 0,
    grid,
    dateOn,
    meOn: meStep > 0,
    evIndex: ev,
    needWind,
    power: press(power),
    shoot: () => void fire(),
    shutterProps,
    zoomProps,
    nav,
    menu: press(openMenu),
    toggleReview: press(toggleReview),
    browse: press(browse),
    flash: press(toggleFlash),
    timer: press(() => stepTimer(1)),
    ratio: press(() => stepRatio(1)),
    toggleGrid: press(toggleGrid),
    toggleHud: press(() => {
      setHud((h) => !h);
      flashOsd(hud ? 'Display off' : 'Display on');
    }),
    flip: press(flip),
    date: press(toggleDate),
    wb: press(() => stepWb(1)),
    wbLabel: WB[wb].label,
    me: press(() => stepMe(1)),
    ev: press((d: number) => stepEv(d, true)),
    setEvValue,
    windOn,
    key: keySound,
    closeOverlays: () => {
      if (menuOpen) closeMenu();
      else setReview(false);
    },
  };

  const Body = BODIES[cam.layout];
  const collection = cam.collection;
  const models = CAMERAS.filter((c) => c.collection === collection);
  const modelIndex = Math.max(0, models.findIndex((m) => m.id === skin));
  const wheel = <BodyWheel items={models} index={modelIndex} onChange={(i) => setSkin(models[i].id)} />;

  return (
    <div className="camera-page dc-full page-enter">
      <div className={`dc-wheel-row ${isDc ? 'is-perched' : ''}`}>
        <span className="dc-wheel-spacer dc-coll-wrap">
          <span className="dc-coll" title={`${COLLECTIONS.find((c) => c.id === collection)?.name} — turn to change collection`}>
            <Knob
              label="Camera collection"
              options={COLLECTIONS.map((c) => c.short)}
              index={Math.max(0, COLLECTIONS.findIndex((c) => c.id === collection))}
              onChange={(i) => setSkin(CAMERAS.find((c) => c.collection === COLLECTIONS[i].id)!.id)}
              size="sm"
              sweep={200}
              className="dc-coll-knob"
            />
          </span>
          <CamInfo cam={cam} where="desk" />
        </span>
        {wheel}
        <span className="dc-wheel-spacer">
          <button type="button" className="dc-roll-pill" onClick={onOpenDevelop} title="Hold the shutter to focus, release to shoot (Space).">
            <span className={`status-dot ${undeveloped ? 'is-live' : ''}`} />
            {undeveloped} <span className="dc-roll-word">on the roll · Develop →</span>
          </button>
        </span>
      </div>
      {headerSlot && createPortal(<CamInfo cam={cam} where="phone" />, headerSlot)}
      <div className="dc-stage">
        {Body ? (
          <Body c={api} />
        ) : (
          <div className={`dc-cam skin-${skin} ${firing ? 'is-firing' : ''}`}>
            <span className="dc-stripe" aria-hidden="true" />
            <span className="dc-swoosh" aria-hidden="true" />

            <div className="dc-top">
              <span className="dc-hotshoe" aria-hidden="true" />
              <div className="dc-wordmark">
                <strong>Delineate</strong>
                <span>{cam.model}</span>
              </div>
              <span className="dc-top-spacer" />
              <Knob label="Mode" options={['AUTO', 'M']} index={manual ? 1 : 0} onChange={(i) => setManual(i === 1)} size="sm" sweep={90} className="dc-mode" />
              <button
                type="button"
                className={`dc-power ${status !== 'off' ? 'is-on' : ''}`}
                onClick={power}
                aria-label={status === 'off' ? 'Turn camera on' : 'Turn camera off'}
                aria-pressed={status !== 'off'}
              >
                <span className="dc-power-track"><span className="dc-power-thumb" /></span>
                <small>{status === 'off' ? 'OFF' : 'ON'}</small>
              </button>
              <button type="button" className={`dc-shutter ${focus !== 'idle' ? 'is-half' : ''} ${firing ? 'is-down' : ''}`} aria-label="Shutter — press and hold to focus, release to shoot" {...shutterProps}>
                <span />
              </button>
            </div>

            <div className="dc-body">
              <div className="dc-screen-bezel">
                {screen}
                <div className="dc-screen-foot">
                  <span className={`dc-led ${countdown !== null ? 'is-blink' : live ? 'is-on' : ''}`} />
                  <span>{cam.name.toUpperCase()}</span>
                  <span className="dc-counter" key={filmNumber}>{pad(filmNumber, 3)}</span>
                </div>
              </div>

              <div className="dc-panel-fit" ref={panelFitRef}>
                <div className="dc-panel" ref={panelRef}>
                  <div className="dc-zoom" aria-label={review ? 'Browse photos' : 'Zoom'}>
                    <button type="button" {...zoomProps(-1)} aria-label={review ? 'Older photo' : 'Zoom out'}>
                      W
                    </button>
                    <span className="dc-zoom-read">{review ? `${Math.min(reviewIdx, gallery.length - 1) + 1}/${gallery.length}` : `${zoom.toFixed(1)}×`}</span>
                    <button type="button" {...zoomProps(1)} aria-label={review ? 'Newer photo' : 'Zoom in'}>
                      T
                    </button>
                  </div>
                  <div className="dc-knobs">
                    <Knob label="ISO" options={ISO.map(String)} index={iso} onChange={manualKnob(setIso)} dimmed={!manual} />
                    <Knob label="Shutter" options={SHUTTER} index={shutter} onChange={manualKnob(setShutter)} dimmed={!manual} />
                    <Knob label="Aperture" options={APERTURE.map((a) => `f/${a}`)} index={aperture} onChange={manualKnob(setAperture)} dimmed={!manual} />
                    <Knob label="EV" options={EV.map(evLabel)} index={ev} onChange={setEv} />
                    <Knob label="WB" options={WB.map((w) => w.label)} index={wb} onChange={setWb} />
                    <Knob label="Timer" options={TIMERS.map((t) => (t ? `${t}s` : 'OFF'))} index={timer} onChange={setTimer} sweep={120} />
                  </div>
                  <div className="dc-buttons">
                    <button type="button" className={flashOn ? 'is-on' : ''} onClick={toggleFlash} aria-pressed={flashOn}>
                      {flashOn ? <Zap size={14} /> : <ZapOff size={14} />}
                      <small>Flash</small>
                    </button>
                    <button type="button" className={grid ? 'is-on' : ''} onClick={() => setGrid((g) => !g)} aria-pressed={grid}>
                      <Grid3X3 size={14} />
                      <small>Grid</small>
                    </button>
                    <button type="button" onClick={() => setRatio((r) => (r + 1) % RATIOS.length)}>
                      <b>{aspect}</b>
                      <small>Ratio</small>
                    </button>
                    <button type="button" onClick={flip} aria-label="Flip between front and back camera">
                      <SwitchCamera size={14} />
                      <small>Flip</small>
                    </button>
                    <button type="button" className={review ? 'is-on' : ''} onClick={toggleReview} aria-pressed={review} aria-label="Playback: browse all your photos with W and T">
                      <Play size={14} />
                      <small>Review</small>
                    </button>
                    <button
                      type="button"
                      className={meStep ? 'is-on' : ''}
                      onClick={() => {
                        const next = (meStep + 1) % ME_STEPS.length;
                        setMeStep(next);
                        meStack.current = [];
                        meClean.current = [];
                        setMeGhost(null);
                        haptic(8);
                      }}
                      aria-label="Multiple exposure"
                    >
                      <b>{ME_STEPS[meStep] ? `${ME_STEPS[meStep]}×` : 'ME'}</b>
                      <small>Multi</small>
                    </button>
                    <button
                      type="button"
                      className={longMode === 'trail' ? 'is-on' : ''}
                      onClick={() => {
                        setLongMode((m) => (m === 'avg' ? 'trail' : 'avg'));
                        haptic(8);
                      }}
                      aria-label="Long exposure blend: average or light trails"
                    >
                      <b>{longMode === 'trail' ? 'TRL' : 'AVG'}</b>
                      <small>Long</small>
                    </button>
                    {skin === 'digicam' && (
                      <button type="button" className={`dc-menu-btn ${menuOpen ? 'is-on' : ''}`} onClick={openMenu} aria-pressed={menuOpen} aria-label="Menu">
                        <b>MENU</b>
                        <small>Menu</small>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
            <div className="dc-base">
              <span>DELINEATE · MADE TO REMEMBER</span>
              <span>{cam.model} · NO. {pad(filmNumber, 4)}</span>
            </div>
          </div>
        )}
        {whiteout && <div className="dc-whiteout" aria-hidden="true" />}
      </div>
    </div>
  );
}

/**
 * The body selector: a knurled metal top-dial seen edge-on. Drag sideways, scroll or tap a name.
 * It sits outside the camera body so it stays put whichever camera is loaded.
 */
function BodyWheel({ items, index, onChange }: { items: { id: string; name: string }[]; index: number; onChange: (i: number) => void }) {
  const drag = useRef<{ x: number; start: number } | null>(null);
  const n = items.length;
  const set = (i: number) => {
    const next = (i + n) % n;
    if (next === index) return;
    playDetent();
    haptic(10);
    onChange(next);
  };
  return (
    <div
      className="dc-wheel"
      role="listbox"
      aria-label="Camera body"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'ArrowRight') set(index + 1);
        if (e.key === 'ArrowLeft') set(index - 1);
      }}
      onWheel={(e) => set(index + (e.deltaY + e.deltaX > 0 ? 1 : -1))}
      onPointerDown={(e) => {
        drag.current = { x: e.clientX, start: index };
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          /* synthetic pointer */
        }
      }}
      onPointerMove={(e) => {
        if (drag.current) set(drag.current.start - Math.round((e.clientX - drag.current.x) / 46));
      }}
      onPointerUp={() => (drag.current = null)}
      style={{ ['--knurl-x' as string]: `${index * -23}px` }}
    >
      <span className="dc-wheel-notch" aria-hidden="true" />
      <div className="dc-wheel-drum">
        {items.map((s, i) => {
          // shortest way round the drum
          let d = i - index;
          if (d > n / 2) d -= n;
          if (d < -n / 2) d += n;
          return (
            <button
              key={s.id}
              type="button"
              role="option"
              aria-selected={d === 0}
              className={`dc-wheel-item ${d === 0 ? 'is-active' : ''}`}
              style={{ ['--a' as string]: `${d * 34}deg`, opacity: Math.abs(d) > 2 ? 0 : 1 }}
              onClick={() => set(i)}
              tabIndex={-1}
            >
              {s.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** The body's story — name, the camera that inspired it, its character — tucked behind a small "i". */
function CamInfo({ cam, where }: { cam: ReturnType<typeof getCamera>; where: 'desk' | 'phone' }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);
  useEffect(() => setOpen(false), [cam.id]);
  return (
    <span ref={box} className={`dc-info is-${where}`}>
      <button type="button" className={`dc-info-btn ${where === 'phone' ? 'round-icon' : ''} ${open ? 'is-open' : ''}`} onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label={`About the ${cam.name}`}>
        <Info size={where === 'phone' ? 17 : 15} />
      </button>
      {open && (
        <span className="dc-info-card" role="note">
          <b>{cam.name}</b>
          <span>{cam.inspired}</span>
          <em>{cam.tag}</em>
        </span>
      )}
    </span>
  );
}
