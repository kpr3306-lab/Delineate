import { BatteryFull, Grid3X3, Layers, Moon, Play, SwitchCamera, Timer, Zap, ZapOff } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { AspectKey, Look, PhotoRecord } from '../types';
import { ASPECTS } from '../types';
import { BASE_LOOK } from '../lib/filters';
import { renderFrame } from '../lib/render';
import { flash as applyFlash } from '../lib/process';
import { canvasToBlob, estimateDimensions, pad, uid } from '../lib/utils';
import { haptic, playAdvance, playClose, playDetent, playFlashCharge, playFocus, playShutter, playTick, type Voice } from '../lib/audio';
import { LookOverlay, useObjectUrl } from './ui';
import Knob from './Knob';

type CameraViewProps = {
  filmNumber: number;
  photos: PhotoRecord[];
  undeveloped: number;
  onSave: (record: PhotoRecord) => Promise<void>;
  notify: (message: string, tone?: 'default' | 'warning') => void;
  onOpenDevelop: () => void;
  onNavigate: (tab: string) => void;
};

/** The Digital 2000s body's on-screen MENU: jump to any part of the app from the camera. */
const MENU_ITEMS = [
  { id: 'develop', label: 'Develop', hint: 'Darkroom' },
  { id: 'process', label: 'Process', hint: 'Presets & FX' },
  { id: 'archive', label: 'Archive', hint: 'Playback' },
  { id: 'journal', label: 'Journal', hint: 'Scrapbook' },
  { id: 'collage', label: 'Collage', hint: 'Layouts' },
  { id: 'lab', label: 'Art Lab', hint: 'Experiments' },
  { id: 'return', label: 'Return', hint: 'Back to camera' },
];

type Status = 'off' | 'starting' | 'live' | 'denied' | 'error' | 'unsupported';

export const SKINS = [
  { id: 'classic', name: 'Classic Film', model: 'F-1', tag: 'Timeless. Film-like.' },
  { id: 'disposable', name: 'Disposable', model: 'SNAP 27', tag: 'Fun. Imperfect.' },
  { id: 'instant', name: 'Instant', model: 'SX INSTANT', tag: 'Soft. Instant.' },
  { id: 'digicam', name: 'Digital 2000s', model: 'DIGISHOT 5MP', tag: 'Flashy. Iconic.' },
  { id: 'rangefinder', name: 'Rangefinder', model: 'M-35', tag: 'Minimal. Elegant.' },
  { id: 'minimal', name: 'Modern Minimal', model: 'ZERO', tag: 'Clean. Focused.' },
] as const;
type SkinId = (typeof SKINS)[number]['id'];

/** Each body's personality: how it sounds, buzzes, fires and boots. Layout lives in cam.css per skin. */
type Fx = 'iris' | 'blink' | 'eject' | 'process' | 'curtain' | 'fade';
const FEEL: Record<SkinId, { voice: Voice; fx: Fx; buzz: number[]; boot: string; bootSub: string }> = {
  classic: { voice: 'mech', fx: 'iris', buzz: [18, 30, 12], boot: 'Delineate', bootSub: 'F-1 · LOADING FILM' },
  disposable: { voice: 'plastic', fx: 'blink', buzz: [30], boot: '27', bootSub: 'EXPOSURES · ISO 400' },
  instant: { voice: 'motor', fx: 'eject', buzz: [10, 20, 200], boot: 'Instant', bootSub: 'FILM PACK READY' },
  digicam: { voice: 'digital', fx: 'process', buzz: [8], boot: 'DIGISHOT', bootSub: '5.0 MEGA PIXELS' },
  rangefinder: { voice: 'leaf', fx: 'curtain', buzz: [6], boot: 'M-35', bootSub: 'RANGEFINDER · 0.72×' },
  minimal: { voice: 'soft', fx: 'fade', buzz: [12, 40, 6], boot: 'ZERO', bootSub: '' },
};

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

const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));
const evLabel = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : '±'}${Math.abs(v).toFixed(1)}`;
const SKIN_KEY = 'delineate-skin';

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
  const [skin, setSkin] = useState<SkinId>(() => {
    try {
      return (window.localStorage.getItem(SKIN_KEY) as SkinId) || 'classic';
    } catch {
      return 'classic';
    }
  });
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
  // portrait phones start in 3:4 so the live view fills the screen
  const [ratio, setRatio] = useState(() => (window.innerHeight > window.innerWidth ? 2 : 0));
  const [zoom, setZoom] = useState(1);
  const [review, setReview] = useState(false);
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
  const meStack = useRef<HTMLCanvasElement[]>([]);
  const bulbHeld = useRef(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuIndex, setMenuIndex] = useState(0);
  const menuOpenRef = useRef(false);
  menuOpenRef.current = menuOpen;

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const aliveRef = useRef(true);
  const zoomTimer = useRef<number | undefined>(undefined);
  const focusTimer = useRef<number | undefined>(undefined);
  const panelFitRef = useRef<HTMLDivElement>(null);
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

  const skinMeta = SKINS.find((s) => s.id === skin) ?? SKINS[0];
  const skinIndex = Math.max(0, SKINS.findIndex((s) => s.id === skin));
  const feel = FEEL[skin] ?? FEEL.classic;
  const bulb = manual && SHUTTER_S[shutter] === BULB;
  const aspect = RATIOS[ratio];
  const mirror = facing === 'user';
  const lastStill = photos.find((p) => p.kind === 'still');
  const reviewUrl = useObjectUrl(review ? lastStill?.blob : null);
  const live = status === 'live';

  // Exposure model: each manual control shifts exposure in stops relative to ISO 200 · 1/125 · f/5.6.
  const stops =
    // long exposures are averaged, not summed, so cap the shutter's brightening at +2 stops
    (manual
      ? Math.log2(ISO[iso] / 200) +
        Math.min(2, Math.max(-3, Math.log2((SHUTTER_S[shutter] === BULB ? 8 : SHUTTER_S[shutter]) * 125))) +
        2 * Math.log2(5.6 / APERTURE[aperture])
      : 0) +
    EV[ev];
  const look: Look = {
    ...BASE_LOOK,
    brightness: Math.min(2.4, Math.max(0.2, 2 ** (stops * 0.5))),
    contrast: 1 - Math.max(0, stops) * 0.05,
    grain: manual ? ISO_GRAIN[iso] : 2,
    vignette: manual ? AP_VIGNETTE[aperture] : 0,
    warmth: WB[wb].warmth,
    tint: WB[wb].tint,
  };

  useEffect(() => {
    try {
      window.localStorage.setItem(SKIN_KEY, skin);
    } catch {
      /* ignore */
    }
  }, [skin]);

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
          video: { facingMode: { ideal: nextFacing }, width: { ideal: 1920 }, height: { ideal: 1080 } },
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

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      stopStream();
      window.clearInterval(zoomTimer.current);
      window.clearTimeout(focusTimer.current);
    };
  }, [stopStream]);

  const power = () => {
    haptic(15);
    if (status === 'live' || status === 'starting') {
      stopStream();
      setStatus('off');
      setReview(false);
    } else {
      void startCamera(facing);
    }
  };

  const flip = () => {
    const next = facing === 'user' ? 'environment' : 'user';
    setFacing(next);
    haptic(10);
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
      if (!live) notify('Turn the camera on first — flip the power switch.', 'warning');
      return;
    }
    setFiring(true);
    setReview(false);
    let hwFlash = false;
    try {
      if (TIMERS[timer] > 0) {
        for (let s = TIMERS[timer]; s > 0; s -= 1) {
          setCountdown(s);
          playTick(s <= 2);
          haptic(4);
          await wait(1000);
        }
        setCountdown(null);
      }
      if (flashOn) {
        hwFlash = await torch(true);
        if (hwFlash) await wait(350); // give auto-exposure a moment under the LED
        else setWhiteout(true); // screen flash lights faces on the front camera
      }
      setBlades(true);
      playShutter(feel.voice);
      haptic(feel.buzz);

      const seconds = manual ? SHUTTER_S[shutter] : 0;
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
        playClose(feel.voice);
      } else {
        await wait(90);
      }
      setExposingFor(null);
      setBlades(false);
      setWhiteout(false);
      if (hwFlash) void torch(false);

      const { width, height } = estimateDimensions(ASPECTS[aspect], 1600);
      let canvas = renderFrame(exposure, exposure.width, exposure.height, width, height, look, { mirror });
      if (flashOn && !hwFlash) canvas = applyFlash(canvas, 0.6);

      // Multiple exposure: hold frames on the "film" until the last one, then stack them.
      const meTarget = ME_STEPS[meStep];
      if (meTarget) {
        meStack.current.push(canvas);
        const stacked = document.createElement('canvas');
        stacked.width = width;
        stacked.height = height;
        const sctx = stacked.getContext('2d')!;
        meStack.current.forEach((frame, i) => {
          sctx.globalCompositeOperation = i ? 'screen' : 'source-over';
          sctx.globalAlpha = i ? 0.85 : 1;
          sctx.drawImage(frame, 0, 0);
        });
        if (meStack.current.length < meTarget) {
          setMeGhost(stacked.toDataURL('image/jpeg', 0.7));
          playAdvance('leaf');
          notify(`Exposure ${meStack.current.length} of ${meTarget} — recompose and shoot again.`);
          return;
        }
        canvas = stacked;
        meStack.current = [];
        setMeGhost(null);
      }

      const blob = await canvasToBlob(canvas, 'image/jpeg', 0.92);
      const record: PhotoRecord = {
        id: uid(),
        name: `Frame ${pad(filmNumber, 3)}`,
        createdAt: Date.now(),
        blob,
        mime: 'image/jpeg',
        width,
        height,
        filterName: 'Undeveloped',
        kind: 'still',
        developed: false,
        note: [
          manual ? `ISO ${ISO[iso]} · ${SHUTTER[shutter]} · f/${APERTURE[aperture]}` : 'Auto',
          `${evLabel(EV[ev])} EV · ${WB[wb].label}`,
          meTarget ? `${meTarget}× exposure` : '',
          isLong ? (longMode === 'trail' ? 'light trails' : 'long exposure') : '',
          flashOn ? (hwFlash ? 'LED flash' : 'flash') : '',
          skinMeta.name,
        ]
          .filter(Boolean)
          .join(' · '),
      };
      if (feel.fx === 'process') await wait(650); // a 2004 digicam always made you wait
      setFlyUrl(URL.createObjectURL(blob));
      playAdvance(feel.voice);
      await onSave(record);
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
    // grab/look/torch/feel are derived from the state listed here
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, firing, timer, flashOn, manual, shutter, aspect, mirror, filmNumber, iso, aperture, ev, wb, zoom, onSave, notify, longMode, meStep, skin, hasTorch]);

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

  useEffect(() => {
    if (skin !== 'digicam') setMenuOpen(false);
  }, [skin]);

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
    const item = MENU_ITEMS[i];
    playFocus();
    haptic([8, 30, 8]);
    if (item.id === 'return') closeMenu();
    else onNavigate(item.id);
  };
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        playDetent();
        setMenuIndex((i) => (i + (e.key === 'ArrowDown' ? 1 : MENU_ITEMS.length - 1)) % MENU_ITEMS.length);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        chooseMenu(menuIndex);
      } else if (e.key === 'Escape') closeMenu();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const toggleFlash = () => {
    setFlashOn((v) => {
      if (!v) playFlashCharge();
      return !v;
    });
    haptic(8);
  };

  return (
    <div className="camera-page dc-full page-enter">
      <div className="dc-wheel-row">
        <span className="dc-wheel-spacer" />
        <BodyWheel index={skinIndex} onChange={(i) => setSkin(SKINS[i].id)} />
        <span className="dc-wheel-spacer">
          <button type="button" className="dc-roll-pill" onClick={onOpenDevelop} title="Hold the shutter to focus, release to shoot (Space). Mode dial → M for manual.">
            <span className={`status-dot ${undeveloped ? 'is-live' : ''}`} />
            {undeveloped} <span className="dc-roll-word">on the roll · Develop →</span>
          </button>
        </span>
      </div>
      <div className="dc-stage">
        <div className={`dc-cam skin-${skin} ${firing ? 'is-firing' : ''}`}>
          <span className="dc-stripe" aria-hidden="true" />
          <span className="dc-swoosh" aria-hidden="true" />

          <div className="dc-top">
            <span className="dc-hotshoe" aria-hidden="true" />
            <div className="dc-wordmark">
              <strong>Delineate</strong>
              <span>{skinMeta.model}</span>
            </div>
            <span className="dc-top-spacer" />
            <Knob
              label="Mode"
              options={['AUTO', 'M']}
              index={manual ? 1 : 0}
              onChange={(i) => setManual(i === 1)}
              size="sm"
              sweep={90}
              className="dc-mode"
            />
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
            <button
              type="button"
              className={`dc-shutter ${focus !== 'idle' ? 'is-half' : ''} ${firing ? 'is-down' : ''}`}
              aria-label="Shutter — press and hold to focus, release to shoot"
              onPointerDown={() => {
                if (bulb) {
                  bulbHeld.current = true;
                  void fire();
                } else halfPress();
              }}
              onPointerUp={() => {
                if (bulb) bulbHeld.current = false;
                else void fire();
              }}
              onPointerLeave={() => {
                bulbHeld.current = false;
                if (focus !== 'idle' && !firing) setFocus('idle');
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  void fire();
                }
              }}
            >
              <span />
            </button>
          </div>

          <div className="dc-body">
            <div className="dc-screen-bezel">
              <div className="dc-screen-area">
              <div className="dc-screen" style={{ ['--ratio' as string]: ASPECTS[aspect] }}>
                <video
                  ref={videoRef}
                  className="dc-video"
                  playsInline
                  muted
                  style={{
                    filter: `brightness(${look.brightness}) contrast(${look.contrast})`,
                    transform: `scale(${zoom}) ${mirror ? 'scaleX(-1)' : ''}`,
                    opacity: live && !review ? 1 : 0,
                  }}
                />
                {live && !review && <LookOverlay look={{ ...look, brightness: 1, contrast: 1 }} />}
                {live && !review && meGhost && <img className="dc-ghost" src={meGhost} alt="" aria-hidden="true" />}
                {exposingFor !== null && (
                  <div className="dc-exposing">
                    <i /> {exposingFor.toFixed(1)}s{bulb ? ' · BULB — release to close' : ''}
                  </div>
                )}
                {review && reviewUrl && <img className="dc-review" src={reviewUrl} alt="Last frame" />}

                {status === 'off' && (
                  <div className="dc-lcd-off">
                    <span>Flip the power switch</span>
                  </div>
                )}
                {status === 'starting' && (
                  <div className="dc-boot">
                    <span className="dc-boot-logo" />
                    <strong>{feel.boot}</strong>
                    <small>{feel.bootSub || 'MADE TO REMEMBER'}</small>
                    <span className="dc-boot-bar" />
                  </div>
                )}
                {(status === 'denied' || status === 'error' || status === 'unsupported') && (
                  <div className="dc-lcd-off dc-lcd-error">
                    <strong>{status === 'denied' ? 'Camera access blocked' : status === 'unsupported' ? 'No camera here' : 'Camera error'}</strong>
                    <span>
                      {status === 'denied'
                        ? 'Allow camera access in your browser settings, then flip the power switch again.'
                        : status === 'unsupported'
                          ? 'This browser cannot open a camera. Try a modern browser over HTTPS.'
                          : errorMessage}
                    </span>
                  </div>
                )}

                {live && !review && (
                  <div className="dc-hud" aria-hidden="true">
                    <div className="dc-hud-top">
                      <span className="dc-hud-mode">{manual ? 'M' : 'AUTO'}</span>
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
                      {manual && SHUTTER_S[shutter] >= 1 / 15 || bulb ? (
                        <span className="dc-hud-icon">
                          <Moon size={12} />
                          {longMode === 'trail' ? 'TRAIL' : 'AVG'}
                        </span>
                      ) : null}
                      {TIMERS[timer] > 0 && (
                        <span className="dc-hud-icon"><Timer size={12} />{TIMERS[timer]}s</span>
                      )}
                      {zoom > 1.01 && <span>{zoom.toFixed(1)}×</span>}
                      <span className="dc-hud-spacer" />
                      <span>{WB[wb].label}</span>
                      <span>EXP {pad(undeveloped, 2)}</span>
                      <BatteryFull size={15} />
                    </div>
                    <div className={`dc-focus is-${focus}`}>
                      <i /><i /><i /><i />
                    </div>
                    <div className="dc-hud-bottom">
                      {manual ? (
                        <>
                          <span>ISO {ISO[iso]}</span>
                          <span>{SHUTTER[shutter]}</span>
                          <span>F{APERTURE[aperture]}</span>
                        </>
                      ) : (
                        <span>P · AUTO EXPOSURE</span>
                      )}
                      <span>{evLabel(EV[ev])}</span>
                      <span className="dc-hud-spacer" />
                      <span className="dc-hud-date">{new Date().toLocaleDateString('en-GB', { year: '2-digit', month: '2-digit', day: '2-digit' }).replace(/\//g, ' ')}</span>
                      <span>{aspect}</span>
                    </div>
                  </div>
                )}
                {review && (
                  <div className="dc-hud">
                    <div className="dc-hud-top">
                      <span className="dc-hud-mode"><Play size={10} /> PLAY</span>
                      <span className="dc-hud-spacer" />
                      <span>{lastStill?.name ?? 'No frames yet'}</span>
                    </div>
                  </div>
                )}
                {grid && live && !review && (
                  <div className="dc-grid" aria-hidden="true"><i /><i /><i /><i /></div>
                )}
                {countdown !== null && <div className="dc-countdown" key={countdown}>{countdown}</div>}
                {menuOpen && (
                  <div className="dc-menu" role="menu" aria-label="Camera menu">
                    <div className="dc-menu-head">
                      <span>MENU</span>
                      <small>▲▼ select · OK</small>
                    </div>
                    <ul>
                      {MENU_ITEMS.map((item, i) => (
                        <li key={item.id}>
                          <button
                            type="button"
                            role="menuitem"
                            className={`${i === menuIndex ? 'is-active' : ''} ${item.id === 'return' ? 'is-return' : ''}`}
                            onPointerEnter={() => setMenuIndex(i)}
                            onClick={() => chooseMenu(i)}
                          >
                            <span>{item.id === 'return' ? '◀ ' : ''}{item.label}</span>
                            <small>{item.hint}</small>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <div className={`dc-shutterfx fx-${feel.fx} ${blades || (feel.fx === 'process' && firing) ? 'is-on' : ''}`} aria-hidden="true">
                  {feel.fx === 'process' && (
                    <>
                      <small>PROCESSING</small>
                      <i />
                    </>
                  )}
                </div>
                <div className={`dc-iris ${blades && feel.fx === 'iris' ? 'is-closed' : ''}`} aria-hidden="true">
                  {Array.from({ length: 6 }, (_, i) => (
                    <span key={i} style={{ ['--i' as string]: i }} />
                  ))}
                </div>
                {flyUrl && <img className={`dc-fly fly-${feel.fx}`} src={flyUrl} alt="" aria-hidden="true" />}
              </div>
              </div>
              <div className="dc-screen-foot">
                <span className={`dc-led ${countdown !== null ? 'is-blink' : live ? 'is-on' : ''}`} />
                <span>{skinMeta.name.toUpperCase()}</span>
                <span className="dc-counter" key={filmNumber}>{pad(filmNumber, 3)}</span>
              </div>
            </div>

            <div className="dc-panel-fit" ref={panelFitRef}>
            <div className="dc-panel" ref={panelRef}>
              <div className="dc-zoom" aria-label="Zoom">
                <button
                  type="button"
                  onPointerDown={() => startZoom(-1)}
                  onPointerUp={stopZoom}
                  onPointerLeave={stopZoom}
                  aria-label="Zoom out"
                >
                  W
                </button>
                <span className="dc-zoom-read">{zoom.toFixed(1)}×</span>
                <button
                  type="button"
                  onPointerDown={() => startZoom(1)}
                  onPointerUp={stopZoom}
                  onPointerLeave={stopZoom}
                  aria-label="Zoom in"
                >
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
                <button
                  type="button"
                  className={review ? 'is-on' : ''}
                  onClick={() => (lastStill ? setReview((r) => !r) : notify('No frames on this roll yet.'))}
                  aria-pressed={review}
                >
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
                  <button
                    type="button"
                    className={`dc-menu-btn ${menuOpen ? 'is-on' : ''}`}
                    onClick={openMenu}
                    aria-pressed={menuOpen}
                    aria-label="Menu"
                  >
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
            <span>{skinMeta.model} · NO. {pad(filmNumber, 4)}</span>
          </div>
        </div>
        {whiteout && <div className="dc-whiteout" aria-hidden="true" />}
      </div>

    </div>
  );
}

/**
 * The body selector: a knurled metal top-dial seen edge-on. Drag sideways, scroll or tap a name.
 * It sits outside the camera body so it stays put whichever camera is loaded.
 */
function BodyWheel({ index, onChange }: { index: number; onChange: (i: number) => void }) {
  const drag = useRef<{ x: number; start: number } | null>(null);
  const set = (i: number) => {
    const next = (i + SKINS.length) % SKINS.length;
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
        {SKINS.map((s, i) => {
          // shortest way round the drum
          let d = i - index;
          if (d > SKINS.length / 2) d -= SKINS.length;
          if (d < -SKINS.length / 2) d += SKINS.length;
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
